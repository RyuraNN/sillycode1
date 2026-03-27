<script setup>
import { defineEmits, ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { getErrorMessage } from '../utils/errorUtils'
import { getEditionShortLabel } from '../utils/editionDetector'

const emit = defineEmits(['back', 'close'])
const gameStore = useGameStore()

// Debug 模式专用状态
const debugImportText = ref('') // 用户粘贴的导入文本
const showDebugImportPanel = ref(false) // 显示导入文本输入面板

// 计算属性：是否为 Debug 模式
const isDebugMode = computed(() => gameStore.settings.debugMode)

const snapshots = computed(() => {
  // 按时间倒序排列
  return [...gameStore._ui.saveSnapshots].sort((a, b) => b.timestamp - a.timestamp)
})

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

const formatGameTime = (snapshot) => {
  // 1. 优先使用元数据中的时间
  if (snapshot.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameTime
    return `${year}年${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  // 2. 尝试从 gameState 中获取 (兼容旧数据)
  if (snapshot.gameState && snapshot.gameState.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameState.gameTime
    return `${year}年${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  return '未知时间'
}

// 辅助函数：安全获取位置
const getLocation = (snapshot) => {
  if (snapshot.location) return snapshot.location
  if (snapshot.gameState && snapshot.gameState.player) return snapshot.gameState.player.location
  return null
}

const isRestoreMismatchResult = (result) => {
  return !!(result && typeof result === 'object' && result.mismatch)
}

const isRestoreMultiplayerRestrictedResult = (result) => {
  return !!(result && typeof result === 'object' && result.multiplayerRestricted)
}

const showMultiplayerSaveBlockedTip = (result) => {
  const roomSuffix = result?.roomId ? `（房间 ${result.roomId}）` : ''
  alert(`该存档为联机模式存档${roomSuffix}，请先进入联机模式后再读取。`)
}

const handleLoad = async (snapshot) => {
  if (confirm(`确定要读取存档 "${snapshot.label}" 吗？\n当前未保存的进度将丢失。`)) {
    try {
      let result = await gameStore.restoreSnapshot(snapshot.id, { healMode: 'defaults' })

      if (isRestoreMultiplayerRestrictedResult(result)) {
        showMultiplayerSaveBlockedTip(result)
        return
      }

      if (isRestoreMismatchResult(result)) {
        const snapshotLabel = getEditionShortLabel(result.snapshotEdition) || result.snapshotEdition
        const currentLabel = getEditionShortLabel(result.currentEdition) || result.currentEdition
        const confirmed = confirm(
          `此存档为「${snapshotLabel}」版，当前绑定「${currentLabel}」版世界书，强行加载可能导致数据异常。\n\n是否继续？`
        )
        if (!confirmed) {
          return
        }

        result = await gameStore.restoreSnapshot(snapshot.id, { force: true, healMode: 'defaults' })
        if (isRestoreMultiplayerRestrictedResult(result)) {
          showMultiplayerSaveBlockedTip(result)
          return
        }
      }

      if (result) {
        alert('读取成功！')
        emit('close')
      } else {
        alert('读取失败，存档可能已损坏。')
      }
    } catch (e) {
      console.error('LoadGame restore failed:', e)
      alert(`读取失败：${getErrorMessage(e, '存档恢复异常')}`)
    }
  }
}

const handleDelete = (snapshot) => {
  if (confirm(`确定要删除存档 "${snapshot.label}" 吗？此操作不可撤销。`)) {
    gameStore.deleteSnapshot(snapshot.id)
  }
}

// 打开导入面板
const openImportPanel = () => {
  showDebugImportPanel.value = true
}

// Debug 模式：解析粘贴的 JSON 文本并导入
const handleDebugImport = async () => {
  if (!debugImportText.value.trim()) {
    alert('请粘贴 JSON 数据')
    return
  }
  
  try {
    const success = await gameStore.importSaveData(debugImportText.value)
    if (success) {
      alert('存档导入成功！')
      closeDebugImportPanel()
    } else {
      alert('导入失败：数据格式错误或损坏')
    }
  } catch (e) {
    console.error('Debug import failed:', e)
    alert('导入失败：' + getErrorMessage(e))
  }
}

// Debug 模式：关闭导入面板
const closeDebugImportPanel = () => {
  showDebugImportPanel.value = false
  debugImportText.value = ''
}
</script>

<template>
  <div class="load-panel">
    <!-- Debug 导入面板 -->
    <div v-if="showDebugImportPanel" class="debug-overlay">
      <div class="debug-panel-header">
        <span class="debug-icon">🔧</span>
        <span>Debug 模式 - 导入存档</span>
        <button class="debug-close-btn" @click="closeDebugImportPanel">×</button>
      </div>
      <div class="debug-panel-content">
        <p class="debug-hint">粘贴之前导出的 JSON 数据：</p>
        <textarea 
          v-model="debugImportText"
          class="debug-textarea" 
          placeholder="在此粘贴 JSON 数据..."
        ></textarea>
        <div class="debug-actions">
          <button 
            class="debug-btn primary" 
            @click="handleDebugImport"
            :disabled="!debugImportText.trim()"
          >
            📥 确认导入
          </button>
          <button class="debug-btn" @click="closeDebugImportPanel">取消</button>
        </div>
      </div>
    </div>

    <div class="panel-header">
      <button class="back-btn" @click="$emit('back')">‹</button>
      <span class="title">读取存档</span>
      <div class="spacer">
        <button 
          v-if="isDebugMode" 
          class="import-btn" 
          @click="openImportPanel"
          title="导入存档"
        >📥</button>
      </div>
    </div>
    
    <div class="save-list">
      <div v-if="snapshots.length === 0" class="empty-state">
        暂无存档记录
      </div>
      
      <div v-for="save in snapshots" :key="save.id" class="save-item">
        <div class="save-info" @click="handleLoad(save)">
          <div class="save-label">{{ save.label }}</div>
          <div class="save-time">
            <span class="real-time">{{ formatDate(save.timestamp) }}</span>
          </div>
          <div class="game-info">
            <span class="game-time">游戏时间: {{ formatGameTime(save) }}</span>
            <span class="location" v-if="getLocation(save)">
              📍 {{ getLocation(save) }}
            </span>
          </div>
        </div>
        <div class="save-actions">
          <button class="delete-btn" @click.stop="handleDelete(save)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.load-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f2f2f7;
  color: #000;
}

.panel-header {
  height: 44px;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #007aff;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
}

.title {
  font-size: 17px;
  font-weight: 600;
}

.spacer {
  width: 30px;
}

.save-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  color: #8e8e93;
  padding-top: 50px;
}

.save-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  transition: background-color 0.2s;
}

.save-item:active {
  background-color: #f2f2f7;
}

.save-info {
  flex: 1;
  cursor: pointer;
}

.save-label {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #000;
}

.save-time {
  font-size: 12px;
  color: #8e8e93;
  margin-bottom: 6px;
}

.game-info {
  font-size: 13px;
  color: #3a3a3c;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.location {
  color: #007aff;
}

.save-actions {
  margin-left: 12px;
  display: flex;
  align-items: center;
}

.delete-btn {
  background: none;
  border: none;
  font-size: 18px;
  padding: 8px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.delete-btn:hover {
  opacity: 1;
  color: #ff3b30;
}

.import-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* ==================== Debug 面板样式 ==================== */
.debug-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #f2f2f7;
  z-index: 25;
  display: flex;
  flex-direction: column;
}

.debug-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #ff9500;
  color: white;
  font-weight: 600;
  font-size: 15px;
}

.debug-icon {
  font-size: 1.2rem;
}

.debug-close-btn {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.debug-panel-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-hint {
  margin: 0 0 12px;
  color: #8e8e93;
  font-size: 13px;
}

.debug-textarea {
  flex: 1;
  width: 100%;
  padding: 12px;
  border: 1px solid #c7c7cc;
  border-radius: 10px;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.4;
  resize: none;
  background: white;
  box-sizing: border-box;
}

.debug-textarea:focus {
  outline: none;
  border-color: #ff9500;
}

.debug-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.debug-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: #e5e5ea;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: #000;
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.debug-btn.primary {
  background: #ff9500;
  color: white;
}
</style>
