<!-- Step2: 双栏对比 + 选择 -->
<script setup>
import { ref, computed } from 'vue'
import ScheduleCompareCard from './ScheduleCompareCard.vue'

const props = defineProps({
  scheduleResults: { type: Object, default: () => ({ characters: [], newClasses: {} }) },
  scheduling: { type: Boolean, default: false },
  progress: { type: Object, default: () => ({ current: 0, total: 0, status: '' }) }
})

const emit = defineEmits(['back', 'next'])

// 每个角色的选择: { [name]: 'suitable' | 'interesting' }
const choices = ref({})

// 按作品分组
const groupedResults = computed(() => {
  const groups = {}
  const chars = props.scheduleResults?.characters || []
  chars.forEach(c => {
    const origin = c.origin || '未知作品'
    if (!groups[origin]) groups[origin] = []
    groups[origin].push(c)
  })
  return groups
})

const allCharacters = computed(() => props.scheduleResults?.characters || [])

const selectedCount = computed(() => Object.keys(choices.value).length)
const totalCount = computed(() => allCharacters.value.length)
const progressPercent = computed(() => {
  if (props.progress.total === 0) return 0
  return Math.round((props.progress.current / props.progress.total) * 100)
})

function selectPlan(charName, planType) {
  choices.value = { ...choices.value, [charName]: planType }
}

function selectAllPlan(planType) {
  const newChoices = {}
  allCharacters.value.forEach(c => {
    newChoices[c.name] = planType
  })
  choices.value = newChoices
}

function selectWorkPlan(origin, planType) {
  const newChoices = { ...choices.value }
  const chars = groupedResults.value[origin] || []
  chars.forEach(c => {
    newChoices[c.name] = planType
  })
  choices.value = newChoices
}

function handleNext() {
  emit('next', { ...choices.value })
}
</script>

<template>
  <div class="step-schedule-result">
    <!-- AI处理中 -->
    <div v-if="scheduling" class="processing-overlay">
      <div class="processing-content">
        <div class="spinner"></div>
        <div class="progress-text">{{ progress.status }}</div>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-detail">{{ progress.current }}/{{ progress.total }}</div>
      </div>
    </div>

    <!-- 结果展示 -->
    <template v-else-if="allCharacters.length > 0">
      <!-- 批量操作栏 -->
      <div class="batch-bar">
        <div class="batch-actions">
          <button class="btn-batch" @click="selectAllPlan('suitable')">全选方案A</button>
          <button class="btn-batch" @click="selectAllPlan('interesting')">全选方案B</button>
        </div>
        <div class="batch-work-actions">
          <template v-for="(chars, origin) in groupedResults" :key="origin">
            <div class="work-batch">
              <span class="work-label">{{ origin }}</span>
              <button class="btn-mini" @click="selectWorkPlan(origin, 'suitable')">A</button>
              <button class="btn-mini" @click="selectWorkPlan(origin, 'interesting')">B</button>
            </div>
          </template>
        </div>
      </div>

      <!-- 角色卡片列表 -->
      <div class="cards-list">
        <div v-for="(chars, origin) in groupedResults" :key="origin" class="origin-group">
          <div class="origin-header">── {{ origin }} ──</div>
          <ScheduleCompareCard
            v-for="c in chars"
            :key="c.name"
            :character="c"
            :choice="choices[c.name] || ''"
            @select="(plan) => selectPlan(c.name, plan)"
          />
        </div>
      </div>

      <!-- 底部 -->
      <div class="step-footer">
        <button class="btn-back" @click="emit('back')">← 返回</button>
        <div class="progress-info">已选择 {{ selectedCount }}/{{ totalCount }} 人</div>
        <button class="btn-next" :disabled="selectedCount === 0" @click="handleNext">
          确认选择 →
        </button>
      </div>
    </template>

    <div v-else class="empty-state">
      <p>暂无排班结果</p>
      <button class="btn-back" @click="emit('back')">← 返回选择角色</button>
    </div>
  </div>
</template>

<style scoped>
.step-schedule-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.processing-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px;
}
.processing-content {
  text-align: center;
  max-width: 400px;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress-text {
  color: #ccc;
  font-size: 14px;
  margin-bottom: 12px;
}
.progress-bar-container {
  width: 100%;
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}
.progress-bar {
  height: 100%;
  background: #4CAF50;
  border-radius: 3px;
  transition: width 0.3s;
}
.progress-detail {
  color: #888;
  font-size: 12px;
}
.batch-bar {
  padding: 10px 16px;
  background: #222;
  border-bottom: 1px solid #444;
  flex-shrink: 0;
}
.batch-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.btn-batch {
  padding: 6px 16px;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-batch:hover { background: #444; color: #fff; }
.batch-work-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.work-batch {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.work-label { color: #999; }
.btn-mini {
  padding: 2px 8px;
  background: #444;
  border: none;
  border-radius: 3px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
}
.btn-mini:hover { background: #555; }
.cards-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.origin-group { margin-bottom: 16px; }
.origin-header {
  text-align: center;
  color: #888;
  font-size: 13px;
  padding: 8px 0;
  letter-spacing: 2px;
}
.step-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #222;
  border-top: 1px solid #444;
  flex-shrink: 0;
}
.progress-info { color: #aaa; font-size: 13px; }
.btn-back, .btn-next {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-back { background: #444; color: #ccc; }
.btn-back:hover { background: #555; }
.btn-next { background: #4CAF50; color: white; }
.btn-next:hover:not(:disabled) { background: #45a049; }
.btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #888;
  gap: 16px;
}

@media (max-width: 768px) {
  .batch-actions { flex-wrap: wrap; }
  .batch-actions button { flex: 1; min-width: 120px; }
  .step-footer { flex-wrap: wrap; gap: 8px; }
  .btn-back, .btn-next { flex: 1; text-align: center; }
}
</style>
