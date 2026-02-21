<!-- 自动排班主面板: 3步向导容器 -->
<script setup>
import { ref, computed } from 'vue'
import { useAutoSchedule } from '../composables/useAutoSchedule'
import { useAutoClubGenerate } from '../composables/useAutoClubGenerate'
import { registerCustomCourse, saveCoursePoolToWorldbook, initCustomClass, getAllElectives, getRequiredCourses } from '../data/coursePoolData'
import { updateClassDataInWorldbook, updateAcademicDataInWorldbook, createClubInWorldbook, addNpcToClubInWorldbook, syncClubWorldbookState } from '../utils/worldbookParser'
import { saveRosterBackup, saveFullCharacterPool } from '../utils/indexedDB'
import StepCharacterSelect from './autoSchedule/StepCharacterSelect.vue'
import StepScheduleResult from './autoSchedule/StepScheduleResult.vue'
import StepConfirm from './autoSchedule/StepConfirm.vue'

const props = defineProps({
  characterPool: { type: Array, default: () => [] },
  fullRosterSnapshot: { type: Object, default: () => ({}) },
  currentRosterState: { type: Object, default: () => ({}) },
  originGroups: { type: Map, default: () => new Map() },
  gameStore: { type: Object, required: true }
})

const emit = defineEmits(['save', 'show-message', 'sync-pool'])

const {
  scheduling,
  scheduleProgress,
  scheduleResults,
  scheduleError,
  startAutoSchedule,
  applyScheduleChoices,
  resetSchedule,
  loadCheckpoint,
  clearCheckpoint
} = useAutoSchedule()

const {
  generating,
  clubResults,
  clubError,
  generateClubs,
  applyClubResults,
  resetClubs
} = useAutoClubGenerate()

const currentStep = ref(1)
const selectedChars = ref([])
const userChoices = ref({})
const syncing = ref(false)

const deepClone = (data) => JSON.parse(JSON.stringify(data))

// 步骤标签
const steps = [
  { num: 1, icon: '👥', label: '选择角色' },
  { num: 2, icon: '🤖', label: 'AI排班' },
  { num: 3, icon: '✅', label: '确认同步' }
]

// 构建课程池摘要供AI使用
function buildCoursePool() {
  const courses = []
  const allElectives = getAllElectives()
  courses.push(...allElectives)
  // 获取各年级必修课
  for (const classId of Object.keys(props.fullRosterSnapshot)) {
    const required = getRequiredCourses(classId)
    required.forEach(c => {
      if (!courses.find(e => e.id === c.id)) courses.push(c)
    })
  }
  return courses
}

// Step1 → Step2: 开始AI排班
async function handleStep1Next(chars) {
  selectedChars.value = chars
  currentStep.value = 2

  const coursePool = buildCoursePool()
  const result = await startAutoSchedule(chars, props.fullRosterSnapshot, coursePool)

  if (result.canResume) {
    const doResume = confirm(`发现未完成的排班进度(第${result.resumeIndex}批)，是否继续？\n确定=继续 / 取消=重新开始`)
    if (doResume) {
      await startAutoSchedule(chars, props.fullRosterSnapshot, coursePool, result.resumeIndex)
    } else {
      clearCheckpoint()
      await startAutoSchedule(chars, props.fullRosterSnapshot, coursePool, 0)
    }
  }

  if (scheduleError.value) {
    emit('show-message', `排班出错: ${scheduleError.value}`)
  }
}

// Step2 → Step3
function handleStep2Next(choices) {
  userChoices.value = choices
  currentStep.value = 3
}

// Step2 ← 返回Step1
function handleStep2Back() {
  currentStep.value = 1
  resetSchedule()
}

// Step3 ← 返回Step2
function handleStep3Back() {
  currentStep.value = 2
}

// 社团生成
async function handleGenerateClubs(mode) {
  const pool = props.characterPool || []
  const charsWithClass = pool.filter(c => userChoices.value[c.name])
  const result = await generateClubs(charsWithClass, mode, props.gameStore.allClubs || {})
  if (!result.success) {
    emit('show-message', `社团生成失败: ${result.message}`)
  }
}

// Step3: 确认并同步
async function handleConfirm({ clubMode }) {
  syncing.value = true
  try {
    // 1. 应用排班选择到快照
    const { modifiedClasses, newCourses, newClasses } = applyScheduleChoices(
      userChoices.value,
      props.fullRosterSnapshot,
      props.characterPool,
      props.currentRosterState
    )

    // 2. 注册新课程
    for (const course of newCourses) {
      registerCustomCourse({
        ...course,
        runId: props.gameStore.currentRunId
      })
    }
    if (newCourses.length > 0) {
      await saveCoursePoolToWorldbook()
    }

    // 3. 初始化新班级课程
    for (const nc of newClasses) {
      initCustomClass(nc.id)
    }

    // 4. 应用社团
    if (clubMode !== 'none' && clubResults.value.length > 0) {
      await applyClubResults(
        clubResults.value,
        [],
        props.gameStore,
        createClubInWorldbook,
        addNpcToClubInWorldbook
      )
      await syncClubWorldbookState(props.gameStore.currentRunId)
    }

    // 5. 触发保存（复用父组件的保存流程）
    emit('sync-pool')
    emit('save')

    emit('show-message', `排班完成！已分配${Object.keys(userChoices.value).length}名角色，修改${modifiedClasses.size}个班级。`)

    // 重置状态
    currentStep.value = 1
    resetSchedule()
    resetClubs()
    selectedChars.value = []
    userChoices.value = {}
  } catch (e) {
    console.error('[AutoSchedule] Sync error:', e)
    emit('show-message', `同步失败: ${e.message}`)
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="auto-schedule-panel">
    <!-- 步骤指示器 -->
    <div class="step-indicator">
      <div
        v-for="step in steps"
        :key="step.num"
        class="step-item"
        :class="{ active: currentStep === step.num, done: currentStep > step.num }"
      >
        <span class="step-num">{{ currentStep > step.num ? '✓' : step.icon }}</span>
        <span class="step-label">{{ step.label }}</span>
      </div>
      <div class="step-line" :style="{ width: ((currentStep - 1) / 2 * 100) + '%' }"></div>
    </div>

    <!-- 步骤内容 -->
    <div class="step-content">
      <StepCharacterSelect
        v-if="currentStep === 1"
        :character-pool="characterPool"
        :origin-groups="originGroups"
        :full-roster-snapshot="fullRosterSnapshot"
        @next="handleStep1Next"
      />
      <StepScheduleResult
        v-if="currentStep === 2"
        :schedule-results="scheduleResults"
        :scheduling="scheduling"
        :progress="scheduleProgress"
        @back="handleStep2Back"
        @next="handleStep2Next"
      />
      <StepConfirm
        v-if="currentStep === 3"
        :schedule-results="scheduleResults"
        :choices="userChoices"
        :full-roster-snapshot="fullRosterSnapshot"
        :generating="generating"
        :club-results="clubResults"
        @back="handleStep3Back"
        @confirm="handleConfirm"
        @generate-clubs="handleGenerateClubs"
      />
    </div>

    <!-- 同步遮罩 -->
    <div v-if="syncing" class="sync-overlay">
      <div class="sync-content">
        <div class="spinner"></div>
        <div>正在同步到世界书...</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auto-schedule-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: 16px 20px;
  background: #222;
  border-bottom: 1px solid #444;
  position: relative;
  flex-shrink: 0;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1;
  transition: all 0.3s;
}
.step-num {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #333;
  color: #888;
  font-size: 16px;
  transition: all 0.3s;
}
.step-item.active .step-num {
  background: #4CAF50;
  color: white;
}
.step-item.done .step-num {
  background: #2E7D32;
  color: white;
}
.step-label {
  color: #888;
  font-size: 14px;
  font-weight: 500;
}
.step-item.active .step-label { color: #fff; }
.step-item.done .step-label { color: #81C784; }
.step-line {
  position: absolute;
  left: 25%;
  top: 50%;
  height: 2px;
  background: #4CAF50;
  transition: width 0.3s;
  z-index: 0;
}
.step-content {
  flex: 1;
  overflow: hidden;
}
.sync-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.sync-content {
  text-align: center;
  color: #ccc;
  font-size: 15px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #333;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .step-indicator { gap: 20px; padding: 12px 10px; }
  .step-label { display: none; }
  .step-num { width: 28px; height: 28px; font-size: 14px; }
}
</style>
