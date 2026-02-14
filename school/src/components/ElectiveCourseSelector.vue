<template>
  <div class="elective-selector">
    <!-- 选课入口按钮 -->
    <div v-if="!showSelector" class="selector-entry">
      <div v-if="!hasSelectedElectives" class="no-electives-warning">
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">尚未选择选修课程</span>
      </div>
      <button 
        class="select-btn"
        :class="{ 'warning': !hasSelectedElectives }"
        @click="openSelector"
        :disabled="electivesLocked"
      >
        <span v-if="!hasSelectedElectives">📚 选择选修课程</span>
        <span v-else>📋 查看已选课程 ({{ selectedCount }}/{{ maxElectives }})</span>
      </button>
      <div v-if="electivesLocked" class="locked-hint">
        本学期选课已锁定
      </div>
    </div>

    <!-- 选课面板 -->
    <Teleport to="body">
      <div v-if="showSelector" class="selector-panel">
        <div class="panel-header">
          <h3>📚 选修课程选择</h3>
          <button class="close-btn" @click="closeSelector">×</button>
        </div>

        <div class="panel-info">
          <div class="info-row">
            <span class="label">当前学期：</span>
            <span class="value">{{ termName }}</span>
          </div>
          <div class="info-row">
            <span class="label">已选课程：</span>
            <span class="value" :class="{ 'warning': selectedCount < minElectives, 'ok': selectedCount >= minElectives }">
              {{ selectedCount }} / {{ minElectives }}-{{ maxElectives }}
            </span>
          </div>
          <div class="info-hint">
            选修课安排在每天下午5-6节课，请选择 {{ minElectives }}-{{ maxElectives }} 门课程
          </div>
        </div>

        <!-- 课程分类 -->
        <div class="course-categories">
          <div 
            v-for="(category, key) in categorizedCourses" 
            :key="key"
            class="category-section"
            v-show="category.courses.length > 0"
          >
            <div class="category-header">
              <span class="category-icon">{{ category.icon }}</span>
              <span class="category-name">{{ category.name }}</span>
              <span class="category-count">({{ category.courses.length }})</span>
            </div>
            <div class="course-list">
              <div 
                v-for="course in category.courses" 
                :key="course.id"
                class="course-card"
                :class="{ 
                  'selected': isSelected(course.id),
                  'disabled': !canSelect(course.id)
                }"
                @click="toggleCourse(course.id)"
              >
                <div class="course-checkbox">
                  <span v-if="isSelected(course.id)">✓</span>
                </div>
                <div class="course-info">
                  <div class="course-name">{{ course.name }}</div>
                  <div class="course-teacher">
                    {{ course.teacher }}
                    <span class="gender-icon">{{ course.teacherGender === 'female' ? '♀' : '♂' }}</span>
                  </div>
                  <div class="course-origin">{{ course.origin }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 已选课程摘要 -->
        <div v-if="selectedCourses.length > 0" class="selected-summary">
          <div class="summary-title">已选课程</div>
          <div class="selected-tags">
            <span 
              v-for="course in selectedCourses" 
              :key="course.id"
              class="selected-tag"
              @click="toggleCourse(course.id)"
            >
              {{ course.name }}
              <span class="remove-icon">×</span>
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="panel-footer">
          <button 
            class="confirm-btn"
            :disabled="!canConfirm"
            @click="confirmSelection"
          >
            {{ canConfirm ? '确认选课' : `还需选择 ${minElectives - selectedCount} 门课程` }}
          </button>
          <button class="cancel-btn" @click="closeSelector">取消</button>
        </div>
      </div>

      <!-- 遮罩层 -->
      <div v-if="showSelector" class="overlay" @click="closeSelector"></div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { 
  getElectiveCourses, 
  getCourseById,
  ELECTIVE_PREFERENCES,
  PREFERENCE_COURSE_KEYWORDS
} from '../data/coursePoolData'

const gameStore = useGameStore()

// 状态
const showSelector = ref(false)
const selectedIds = ref([])

// 配置
const minElectives = 3
const maxElectives = 6

// 计算属性
const playerClassId = computed(() => gameStore.player.classId)

const termInfo = computed(() => gameStore.getTermInfo())

const termName = computed(() => termInfo.value.termName || '未知学期')

const hasSelectedElectives = computed(() => {
  return gameStore.player.selectedElectives && gameStore.player.selectedElectives.length >= minElectives
})

const electivesLocked = computed(() => {
  // 如果本学期已经选课并锁定，则不能再次选择
  return gameStore.player.electivesLockedForTerm === termInfo.value.termId
})

const selectedCount = computed(() => selectedIds.value.length)

const canConfirm = computed(() => {
  return selectedCount.value >= minElectives && selectedCount.value <= maxElectives
})

// 获取可选课程并分类
const availableCourses = computed(() => {
  return getElectiveCourses(playerClassId.value)
})

const categorizedCourses = computed(() => {
  const categories = {}
  
  // 初始化分类
  for (const [key, pref] of Object.entries(ELECTIVE_PREFERENCES)) {
    categories[key] = {
      name: pref.name,
      icon: pref.icon,
      courses: []
    }
  }
  
  // 分类课程
  for (const course of availableCourses.value) {
    let assigned = false
    
    // 根据关键词匹配分类
    for (const [prefKey, keywords] of Object.entries(PREFERENCE_COURSE_KEYWORDS)) {
      if (prefKey === 'general') continue
      
      const matches = keywords.some(keyword => 
        course.name.includes(keyword) || 
        (course.teacher && course.teacher.includes(keyword))
      )
      
      if (matches) {
        categories[prefKey].courses.push(course)
        assigned = true
        break
      }
    }
    
    // 未匹配的放入综合
    if (!assigned) {
      categories.general.courses.push(course)
    }
  }
  
  return categories
})

const selectedCourses = computed(() => {
  return selectedIds.value
    .map(id => getCourseById(id))
    .filter(c => c !== null)
})

// 方法
function openSelector() {
  // 初始化已选课程
  if (gameStore.player.selectedElectives) {
    selectedIds.value = [...gameStore.player.selectedElectives]
  } else {
    selectedIds.value = []
  }
  showSelector.value = true
}

function closeSelector() {
  showSelector.value = false
}

function isSelected(courseId) {
  return selectedIds.value.includes(courseId)
}

function canSelect(courseId) {
  if (isSelected(courseId)) return true
  return selectedCount.value < maxElectives
}

function toggleCourse(courseId) {
  if (electivesLocked.value) return
  
  const index = selectedIds.value.indexOf(courseId)
  if (index > -1) {
    // 取消选择
    selectedIds.value.splice(index, 1)
  } else if (selectedCount.value < maxElectives) {
    // 添加选择
    selectedIds.value.push(courseId)
  }
}

async function confirmSelection() {
  if (!canConfirm.value) return
  
  // 保存选课结果
  gameStore.player.selectedElectives = [...selectedIds.value]
  gameStore.player.electivesLockedForTerm = termInfo.value.termId
  
  // 触发选修课排课
  await gameStore.generateElectiveSchedule()
  
  // 触发NPC选课和世界书更新
  await gameStore.processNpcElectiveSelection()
  
  closeSelector()
}

// 初始化
onMounted(() => {
  if (gameStore.player.selectedElectives) {
    selectedIds.value = [...gameStore.player.selectedElectives]
  }
})

// 监听选课数据变化（处理回溯等情况）
watch(() => gameStore.player.selectedElectives, (newVal) => {
  if (newVal) {
    selectedIds.value = [...newVal]
  } else {
    selectedIds.value = []
  }
}, { deep: true })
</script>

<style scoped>
.elective-selector {
  position: relative;
}

/* 入口按钮 */
.selector-entry {
  padding: 10px;
  text-align: center;
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.no-electives-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #ffd93d;
  font-size: 12px;
}

.warning-icon {
  font-size: 14px;
}

.select-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.select-btn:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.select-btn.warning {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 217, 61, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(255, 217, 61, 0); }
}

.select-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.locked-hint {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

/* 遮罩层 */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1999;
}

/* 选课面板 */
.selector-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  border-radius: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: white;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 8px;
}

.close-btn:hover {
  opacity: 1;
}

/* 信息区 */
.panel-info {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
}

.info-row .label {
  color: rgba(255, 255, 255, 0.7);
}

.info-row .value {
  font-weight: 500;
}

.info-row .value.warning {
  color: #ffd93d;
}

.info-row .value.ok {
  color: #4caf50;
}

.info-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}

/* 课程分类 */
.course-categories {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.category-section {
  margin-bottom: 16px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.category-icon {
  font-size: 16px;
}

.category-name {
  font-size: 13px;
  font-weight: 500;
}

.category-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.course-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.course-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.course-card:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.course-card.selected {
  background: rgba(76, 175, 80, 0.3);
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.course-card.disabled:not(.selected) {
  opacity: 0.5;
  cursor: not-allowed;
}

.course-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  color: #4caf50;
}

.course-card.selected .course-checkbox {
  background: #4caf50;
  border-color: #4caf50;
  color: white;
}

.course-info {
  flex: 1;
  min-width: 0;
}

.course-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 2px;
}

.course-teacher {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.gender-icon {
  margin-left: 2px;
}

.course-origin {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

/* 已选摘要 */
.selected-summary {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.summary-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selected-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.selected-tag:hover {
  background: rgba(244, 67, 54, 0.3);
}

.remove-icon {
  font-size: 12px;
  opacity: 0.7;
}

/* 底部操作 */
.panel-footer {
  display: flex;
  gap: 10px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.confirm-btn {
  flex: 1;
  padding: 12px;
  background: linear-gradient(135deg, #4caf50, #45a049);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.confirm-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.cancel-btn {
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
