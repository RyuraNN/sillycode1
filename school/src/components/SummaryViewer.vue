<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { generateMajorSummary, generateBatchSummaries } from '../utils/summaryManager'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const currentTab = ref('all') // all, minor, major, super
const editingSummary = ref(null)
const editContent = ref('')
const isGenerating = ref(false)
const selectedFloors = ref([]) // 用于批量选择
const selectionMode = ref(false) // 是否处于选择模式

const summaries = computed(() => {
  // 获取现有的总结
  let existingSummaries = gameStore.player.summaries || []
  
  // 如果只看特定类型，直接过滤返回（不显示占位符，占位符通常视为缺失的小总结或大总结，比较复杂，这里简化为只在"全部"或"小总结"中显示占位）
  // 实际上，占位符最好只在"全部"中显示，或者作为一种特殊类型
  
  // 构建覆盖映射
  const coveredFloors = new Set()
  existingSummaries.forEach(s => {
    if (s.coveredFloors) {
      s.coveredFloors.forEach(f => coveredFloors.add(f))
    } else {
      coveredFloors.add(s.floor)
    }
  })

  // 生成占位符 (仅当查看全部或小总结时)
  const placeholders = []
  if (currentTab.value === 'all' || currentTab.value === 'minor') {
    const chatLog = gameStore.currentChatLog || []
    chatLog.forEach((log, index) => {
      const floor = index + 1
      // 只关注 AI 回复且未被覆盖的层
      if (log.type === 'ai' && !coveredFloors.has(floor)) {
        placeholders.push({
          floor,
          type: 'missing',
          content: '⚠️ 该层尚未生成总结',
          isPlaceholder: true,
          timestamp: Date.now()
        })
      }
    })
  }

  let list = [...existingSummaries, ...placeholders]

  if (currentTab.value !== 'all') {
    // missing 类型只在 minor tab 显示 (或者 all)
    if (currentTab.value === 'minor') {
       list = list.filter(s => s.type === 'minor' || s.type === 'missing')
    } else {
       list = list.filter(s => s.type === currentTab.value)
    }
  }
  
  // Sort by floor (descending usually better to see latest)
  return list.sort((a, b) => b.floor - a.floor)
})

const formatType = (type) => {
  const map = {
    minor: '小总结',
    diary: '📔 每日日记',
    major: '大总结(旧)',
    super: '超级总结(旧)',
    missing: '待生成'
  }
  return map[type] || type
}

const formatFloors = (summary) => {
  if (summary.type === 'diary' && summary.gameDate) {
    return summary.gameDate
  }
  if (summary.type === 'minor' || summary.type === 'missing') {
    return `楼层 ${summary.floor}`
  }
  // 大/超级总结需要检查 coveredFloors
  if (summary.coveredFloors && Array.isArray(summary.coveredFloors) && summary.coveredFloors.length > 0) {
    const min = Math.min(...summary.coveredFloors)
    const max = Math.max(...summary.coveredFloors)
    // 防止 Infinity / -Infinity 的边界情况
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return `楼层 ${min} - ${max}`
    }
  }
  // 兜底：使用 floor 字段
  return `楼层 ${summary.floor}`
}

const openEdit = (summary) => {
  // 阻止编辑占位符类型
  if (summary.type === 'missing' || summary.isPlaceholder) {
    return
  }
  // 确保 content 存在
  editingSummary.value = summary
  editContent.value = summary.content || ''
}

const saveEdit = () => {
  if (editingSummary.value) {
    editingSummary.value.content = editContent.value
    gameStore.saveToStorage() // Persist changes
    closeEdit()
  }
}

const closeEdit = () => {
  editingSummary.value = null
  editContent.value = ''
}

const deleteSummary = (summary) => {
  if (confirm('确定要删除这条总结吗？这将无法恢复。')) {
    const index = gameStore.player.summaries.indexOf(summary)
    if (index > -1) {
      gameStore.player.summaries.splice(index, 1)
      gameStore.saveToStorage()
    }
  }
}

// 统计信息
const stats = computed(() => {
  const all = gameStore.player.summaries || []
  const minorCount = all.filter(s => s.type === 'minor').length
  const diaryCount = all.filter(s => s.type === 'diary').length
  const majorCount = all.filter(s => s.type === 'major').length
  const superCount = all.filter(s => s.type === 'super').length
  
  // 统计缺失的楼层
  const coveredFloors = new Set()
  all.forEach(s => {
    if (s.coveredFloors) {
      s.coveredFloors.forEach(f => coveredFloors.add(f))
    } else {
      coveredFloors.add(s.floor)
    }
  })
  
  const chatLog = gameStore.currentChatLog || []
  let missingCount = 0
  chatLog.forEach((log, index) => {
    const floor = index + 1
    if (log.type === 'ai' && !coveredFloors.has(floor)) {
      missingCount++
    }
  })
  
  return { minorCount, diaryCount, majorCount, superCount, missingCount, total: chatLog.length }
})

// 切换选择模式
const toggleSelectionMode = () => {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedFloors.value = []
  }
}

// 选择/取消选择楼层
const toggleFloorSelection = (floor) => {
  const index = selectedFloors.value.indexOf(floor)
  if (index > -1) {
    selectedFloors.value.splice(index, 1)
  } else {
    selectedFloors.value.push(floor)
  }
}

// 批量生成大总结（从选中的小总结）
const generateFromSelected = async () => {
  if (selectedFloors.value.length < 2) {
    alert('请至少选择2个小总结进行合并')
    return
  }
  
  if (!gameStore.settings.assistantAI?.enabled) {
    alert('请先在设置中开启辅助AI')
    return
  }
  
  isGenerating.value = true
  try {
    const result = await generateMajorSummary(selectedFloors.value.sort((a, b) => a - b))
    if (result.success) {
      alert('大总结生成成功！')
      selectedFloors.value = []
      selectionMode.value = false
    } else {
      alert('生成失败：' + result.error)
    }
  } catch (e) {
    alert('生成出错：' + e.message)
  } finally {
    isGenerating.value = false
  }
}

// 快速选择未被覆盖的小总结
const selectAllUncovered = () => {
  const minors = (gameStore.player.summaries || []).filter(s => s.type === 'minor')
  
  // 找出已被大总结覆盖的楼层
  const coveredByMajor = new Set()
  ;(gameStore.player.summaries || [])
    .filter(s => s.type === 'major' || s.type === 'super')
    .forEach(s => s.coveredFloors.forEach(f => coveredByMajor.add(f)))
  
  // 选择未被覆盖的小总结
  selectedFloors.value = minors
    .filter(s => !coveredByMajor.has(s.floor))
    .map(s => s.floor)
}
</script>

<template>
  <div class="summary-viewer">
    <div class="header">
      <button class="back-btn" @click="emit('close')">‹</button>
      <span class="title">剧情总结管理</span>
      <div class="spacer"></div>
    </div>

    <!-- Edit Mode -->
    <div v-if="editingSummary" class="edit-mode">
      <div class="edit-header">
        <span class="edit-title">编辑 {{ formatType(editingSummary.type) }} ({{ formatFloors(editingSummary) }})</span>
        <button class="close-edit-btn" @click="closeEdit">×</button>
      </div>
      <textarea v-model="editContent" class="edit-textarea"></textarea>
      <div class="edit-actions">
        <button class="save-btn" @click="saveEdit">保存修改</button>
      </div>
    </div>

    <!-- List Mode -->
    <div v-else class="list-mode">
      <!-- 统计信息栏 -->
      <div class="stats-bar">
        <span class="stat-item">
          <span class="stat-label">小总结:</span>
          <span class="stat-value minor">{{ stats.minorCount }}</span>
        </span>
        <span class="stat-item">
          <span class="stat-label">日记:</span>
          <span class="stat-value diary">{{ stats.diaryCount }}</span>
        </span>
        <span class="stat-item">
          <span class="stat-label">大总结:</span>
          <span class="stat-value major">{{ stats.majorCount }}</span>
        </span>
        <span class="stat-item" v-if="stats.missingCount > 0">
          <span class="stat-label">缺失:</span>
          <span class="stat-value missing">{{ stats.missingCount }}</span>
        </span>
      </div>

      <div class="tabs">
        <button :class="{ active: currentTab === 'all' }" @click="currentTab = 'all'">全部</button>
        <button :class="{ active: currentTab === 'minor' }" @click="currentTab = 'minor'">小总结</button>
        <button :class="{ active: currentTab === 'diary' }" @click="currentTab = 'diary'">日记</button>
        <button :class="{ active: currentTab === 'major' }" @click="currentTab = 'major'">大总结</button>
      </div>

      <!-- 批量操作栏 (仅在小总结标签页显示) -->
      <div v-if="currentTab === 'minor'" class="action-bar">
        <button 
          class="action-btn" 
          :class="{ active: selectionMode }"
          @click="toggleSelectionMode"
        >
          {{ selectionMode ? '取消选择' : '选择合并' }}
        </button>
        <template v-if="selectionMode">
          <button class="action-btn secondary" @click="selectAllUncovered">
            选择全部未覆盖
          </button>
          <button 
            class="action-btn primary" 
            @click="generateFromSelected"
            :disabled="selectedFloors.length < 2 || isGenerating"
          >
            {{ isGenerating ? '生成中...' : `合并 (${selectedFloors.length})` }}
          </button>
        </template>
      </div>

      <div class="summary-list">
        <div v-if="summaries.length === 0" class="empty-tip">暂无总结数据</div>
        <div 
          v-for="(summary, index) in summaries" 
          :key="index" 
          class="summary-item" 
          :class="{ 
            selected: selectionMode && summary.type === 'minor' && selectedFloors.includes(summary.floor),
            selectable: selectionMode && summary.type === 'minor'
          }"
          @click="selectionMode && summary.type === 'minor' ? toggleFloorSelection(summary.floor) : openEdit(summary)"
        >
          <div class="item-header">
            <div class="item-left">
              <input 
                v-if="selectionMode && summary.type === 'minor'"
                type="checkbox"
                :checked="selectedFloors.includes(summary.floor)"
                @click.stop
                @change="toggleFloorSelection(summary.floor)"
                class="item-checkbox"
              >
              <span class="item-type" :class="summary.type">{{ formatType(summary.type) }}</span>
            </div>
            <span class="item-floors">{{ formatFloors(summary) }}</span>
            <button v-if="!selectionMode" class="delete-btn" @click.stop="deleteSummary(summary)">🗑️</button>
          </div>
          <div class="item-preview" :class="{ 'diary-content': summary.type === 'diary' }">{{ summary.content }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-viewer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #f2f2f7;
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.header {
  height: 44px;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #007aff;
  cursor: pointer;
  padding: 0 10px;
  line-height: 1;
}

.title {
  font-size: 17px;
  font-weight: 600;
  color: #000;
}

.spacer {
  width: 40px;
}

.tabs {
  display: flex;
  padding: 10px;
  gap: 10px;
  background: #fff;
  overflow-x: auto;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
}

.tabs button {
  flex: 1;
  padding: 6px 10px;
  border: none;
  background: #e5e5ea;
  border-radius: 8px;
  font-size: 13px;
  color: #000;
  white-space: nowrap;
  cursor: pointer;
}

.tabs button.active {
  background: #007aff;
  color: #fff;
}

.summary-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.summary-item {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  cursor: pointer;
}

.summary-item:active {
  background: #f9f9f9;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.item-type {
  font-size: 12px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
}

.item-type.minor { background: #34c759; }
.item-type.diary { background: #007aff; }
.item-type.major { background: #ff9500; }
.item-type.super { background: #af52de; }
.item-type.missing { background: #8e8e93; border: 1px dashed #666; }

.item-floors {
  font-size: 12px;
  color: #8e8e93;
}

.delete-btn {
  background: none;
  border: none;
  font-size: 14px;
  padding: 4px;
  cursor: pointer;
}

.item-preview {
  font-size: 14px;
  color: #333;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.item-preview.diary-content {
  display: block;
  -webkit-line-clamp: unset;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

.edit-mode, .list-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  background: #fff;
  overflow: hidden;
}

.list-mode {
  padding: 0; /* list mode padding is handled inside summary-list or tabs */
  background: #f2f2f7;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.edit-title {
  font-size: 15px;
  font-weight: 600;
}

.close-edit-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #8e8e93;
  cursor: pointer;
}

.edit-textarea {
  flex: 1;
  width: 100%;
  padding: 10px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  font-size: 15px;
  line-height: 1.5;
  resize: none;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  background: #007aff;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.empty-tip {
  text-align: center;
  color: #8e8e93;
  margin-top: 40px;
  font-size: 14px;
}

/* 统计信息栏 */
.stats-bar {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 10px;
  background: #fff;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #8e8e93;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
}

.stat-value.minor { background: #34c759; }
.stat-value.diary { background: #007aff; }
.stat-value.major { background: #ff9500; }
.stat-value.super { background: #af52de; }
.stat-value.missing { background: #ff3b30; }

/* 批量操作栏 */
.action-bar {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #fff;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
  overflow-x: auto;
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid #007aff;
  background: #fff;
  color: #007aff;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.action-btn.active {
  background: #007aff;
  color: #fff;
}

.action-btn.secondary {
  border-color: #8e8e93;
  color: #8e8e93;
}

.action-btn.primary {
  background: #007aff;
  color: #fff;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 选择模式相关 */
.item-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.summary-item.selectable {
  border: 2px solid transparent;
}

.summary-item.selected {
  border: 2px solid #007aff;
  background: #f0f8ff;
}
</style>
