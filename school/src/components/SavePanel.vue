<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const props = defineProps({
  mode: {
    type: String,
    default: 'save', // 'save' 或 'load'
    validator: (value) => ['save', 'load'].includes(value)
  },
  currentChatLog: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'restore'])

const gameStore = useGameStore()

// 编辑标签状态
const editingId = ref(null)
const editingLabel = ref('')

// Debug 模式专用状态
const debugExportJson = ref('') // 导出的 JSON 文本
const showDebugExportPanel = ref(false) // 显示导出结果面板
const debugImportText = ref('') // 用户粘贴的导入文本
const showDebugImportPanel = ref(false) // 显示导入文本输入面板

// 计算属性：是否为 Debug 模式
const isDebugMode = computed(() => gameStore.settings.debugMode)

// 聊天预览相关
const showChatPreview = ref(false)
const previewSnapshot = ref(null)
const loadingPreview = ref(false)

// 获取存档列表（按时间倒序）
const snapshots = computed(() => {
  return [...gameStore.saveSnapshots].sort((a, b) => b.timestamp - a.timestamp)
})

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化游戏内时间
const formatGameTime = (snapshot) => {
  // 1. 优先使用元数据中的时间
  if (snapshot.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameTime
    return `${year}年${month}月${day}日 ${hour}:${String(minute).padStart(2, '0')}`
  }
  
  // 2. 尝试从 gameState 中获取 (兼容旧数据)
  if (snapshot.gameState && snapshot.gameState.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameState.gameTime
    return `${year}年${month}月${day}日 ${hour}:${String(minute).padStart(2, '0')}`
  }
  
  return '未知时间'
}

// 创建新存档
const createSave = () => {
  const messageIndex = props.currentChatLog.length - 1
  gameStore.createSnapshot(props.currentChatLog, messageIndex)
}

// 加载存档
const loadSave = async (snapshotId) => {
  const snapshot = await gameStore.restoreSnapshot(snapshotId)
  if (snapshot) {
    emit('restore', snapshot)
    emit('close')
  }
}

// 删除存档
const deleteSave = (snapshotId) => {
  if (confirm('确定要删除这个存档吗？')) {
    gameStore.deleteSnapshot(snapshotId)
  }
}

// 开始编辑标签
const startEdit = (snapshot) => {
  editingId.value = snapshot.id
  editingLabel.value = snapshot.label
}

// 保存标签
const saveLabel = () => {
  if (editingId.value && editingLabel.value.trim()) {
    gameStore.updateSnapshotLabel(editingId.value, editingLabel.value.trim())
  }
  editingId.value = null
  editingLabel.value = ''
}

// 取消编辑
const cancelEdit = () => {
  editingId.value = null
  editingLabel.value = ''
}

// 处理点击存档项
const handleSnapshotClick = async (snapshot) => {
  if (props.mode === 'load') {
    loadingPreview.value = true
    try {
      // 尝试加载完整详情（如果是新版分离存档）
      const fullSnapshot = await gameStore.loadSnapshotDetails(snapshot.id)
      previewSnapshot.value = fullSnapshot || snapshot
      showChatPreview.value = true
    } catch (e) {
      console.error('Failed to load snapshot details:', e)
      alert('加载存档详情失败')
    } finally {
      loadingPreview.value = false
    }
  }
}

// 回溯到指定聊天记录
const restoreToChatIndex = async (index) => {
  if (!previewSnapshot.value) return

  // 1. 恢复存档
  const snapshot = await gameStore.restoreSnapshot(previewSnapshot.value.id)
  if (!snapshot) return

  // 2. 获取目标聊天记录
  const targetLog = snapshot.chatLog[index]
  
  // 3. 如果目标记录有快照，恢复该快照的状态
  if (targetLog && targetLog.snapshot) {
    gameStore.restoreGameState(targetLog.snapshot)
  } else {
    // 如果没有快照（旧存档），保持 restoreSnapshot 恢复的最终状态
    // 可以选择提示用户
    console.warn('该记录无状态快照，使用存档最终状态')
  }

  // 修复：回溯后强制同步世界书，以清除未来的记录
  await gameStore.syncWorldbook()

  // 4. 截断聊天记录
  // 创建副本以避免修改 store 中的存档
  const restoredSnapshot = {
    ...snapshot,
    chatLog: snapshot.chatLog.slice(0, index + 1)
  }

  emit('restore', restoredSnapshot)
  
  // 关闭所有面板
  showChatPreview.value = false
  emit('close')
}

// 关闭预览
const closePreview = () => {
  showChatPreview.value = false
  previewSnapshot.value = null
}

// 导出存档
const handleExport = async () => {
  const btn = document.querySelector('.io-btn.export')
  const originalText = btn?.innerHTML || ''
  if (btn) {
    btn.innerHTML = '<span class="io-icon">⌛</span> 导出中...'
    btn.disabled = true
  }
  
  try {
    const data = await gameStore.getExportData()
    
    // Debug 模式：显示文本框
    if (isDebugMode.value) {
      debugExportJson.value = data
      showDebugExportPanel.value = true
    } else {
      // 正常模式：下载文件
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `school_save_${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('Export failed:', e)
    alert('导出存档失败，请重试')
  } finally {
    if (btn) {
      btn.innerHTML = originalText
      btn.disabled = false
    }
  }
}

// Debug 模式：复制导出的 JSON 到剪贴板
const copyExportJson = async () => {
  try {
    await navigator.clipboard.writeText(debugExportJson.value)
    alert('已复制到剪贴板！')
  } catch (e) {
    console.error('Copy failed:', e)
    alert('复制失败，请手动选择复制')
  }
}

// Debug 模式：关闭导出面板
const closeDebugExportPanel = () => {
  showDebugExportPanel.value = false
  debugExportJson.value = ''
}

// 导入存档
const fileInput = ref(null)
const triggerImport = () => {
  // Debug 模式：显示文本输入面板
  if (isDebugMode.value) {
    showDebugImportPanel.value = true
  } else {
    fileInput.value.click()
  }
}

const handleImport = (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    const success = await gameStore.importSaveData(e.target.result)
    if (success) {
      alert('存档导入成功！')
    } else {
      alert('导入失败：文件格式错误或损坏')
    }
    // 清空 input 以便重复选择同一文件
    event.target.value = ''
  }
  reader.readAsText(file)
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
    alert('导入失败：' + e.message)
  }
}

// Debug 模式：关闭导入面板
const closeDebugImportPanel = () => {
  showDebugImportPanel.value = false
  debugImportText.value = ''
}
</script>

<template>
  <div class="save-panel-overlay" :class="{ 'dark-mode': gameStore.settings.darkMode }" @click.self="emit('close')">
    <div class="save-panel">
      <!-- 聊天预览覆盖层 -->
      <div v-if="showChatPreview" class="chat-preview-overlay">
        <div class="preview-header">
          <div class="preview-title-area">
            <span class="preview-icon">⏪</span>
            <h3>选择回溯点</h3>
          </div>
          <button class="close-btn preview-close" @click="closePreview">×</button>
        </div>
        <div class="preview-content">
          <div class="preview-hint">
            <span class="hint-icon">💡</span>
            点击任意一条消息，将时光倒流到那一刻
          </div>
          <div class="chat-list">
            <!-- 倒序显示最后20条 -->
            <div 
              v-for="(log, index) in previewSnapshot.chatLog.slice(-20).reverse()" 
              :key="index"
              class="chat-preview-item"
              @click="restoreToChatIndex(previewSnapshot.chatLog.indexOf(log))"
            >
              <div class="chat-role-badge" :class="log.type">
                {{ log.type === 'player' ? '玩家' : 'AI' }}
              </div>
              <div class="chat-text">{{ log.content }}</div>
              <div class="chat-meta" v-if="log.snapshot">
                <span class="has-snapshot">✓ 可回溯</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Debug 导出面板 -->
      <div v-if="showDebugExportPanel" class="debug-overlay">
        <div class="debug-panel-header">
          <span class="debug-icon">🔧</span>
          <span>Debug 模式 - 导出存档</span>
          <button class="debug-close-btn" @click="closeDebugExportPanel">×</button>
        </div>
        <div class="debug-panel-content">
          <p class="debug-hint">复制下方 JSON 数据，可在其他设备粘贴导入：</p>
          <textarea 
            class="debug-textarea" 
            :value="debugExportJson" 
            readonly
            @focus="$event.target.select()"
          ></textarea>
          <div class="debug-actions">
            <button class="debug-btn primary" @click="copyExportJson">📋 复制到剪贴板</button>
            <button class="debug-btn" @click="closeDebugExportPanel">关闭</button>
          </div>
        </div>
      </div>

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
        <div class="header-title-area">
          <span class="header-icon">{{ mode === 'save' ? '💾' : '📂' }}</span>
          <h2>{{ mode === 'save' ? '存档管理' : '读取存档' }}</h2>
          <span v-if="isDebugMode" class="debug-badge">🔧 Debug</span>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <div class="panel-content">
        <!-- 存档模式下显示新建存档按钮 -->
        <div v-if="mode === 'save'" class="new-save-section">
          <button class="new-save-btn" @click="createSave">
            <span class="plus-icon">+</span>
            <span>创建新存档</span>
          </button>
        </div>

        <!-- 导入导出按钮区域 -->
        <div class="io-section">
          <button class="io-btn export" @click="handleExport">
            <span class="io-icon">📤</span>
            导出存档
          </button>
          <button class="io-btn import" @click="triggerImport">
            <span class="io-icon">📥</span>
            导入存档
          </button>
          <input 
            type="file" 
            ref="fileInput" 
            style="display: none" 
            accept=".json" 
            @change="handleImport"
          >
        </div>

        <!-- 存档列表 -->
        <div class="snapshots-list">
          <div v-if="snapshots.length === 0" class="empty-hint">
            <span class="empty-icon">📭</span>
            <span>暂无存档</span>
          </div>

          <div 
            v-for="snapshot in snapshots" 
            :key="snapshot.id" 
            class="snapshot-item"
            :class="{ 'clickable': mode === 'load', 'loading': loadingPreview && previewSnapshot?.id === snapshot.id }"
            @click="!loadingPreview && handleSnapshotClick(snapshot)"
          >
            <div class="snapshot-main">
              <!-- 标签编辑 -->
              <div class="snapshot-label">
                <template v-if="editingId === snapshot.id">
                  <input 
                    v-model="editingLabel" 
                    class="label-input"
                    @keyup.enter="saveLabel"
                    @keyup.escape="cancelEdit"
                    @click.stop
                    ref="labelInput"
                    autofocus
                  />
                  <button class="icon-btn save" @click.stop="saveLabel" title="保存">✓</button>
                  <button class="icon-btn cancel" @click.stop="cancelEdit" title="取消">×</button>
                </template>
                <template v-else>
                  <span class="label-text">{{ snapshot.label }}</span>
                  <button class="icon-btn edit" @click.stop="startEdit(snapshot)" title="编辑">✎</button>
                </template>
              </div>

              <!-- 存档信息 -->
              <div class="snapshot-info">
                <div class="info-item">
                  <span class="info-icon">🕐</span>
                  <span class="info-label">保存时间</span>
                  <span class="info-value">{{ formatTime(snapshot.timestamp) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-icon">📅</span>
                  <span class="info-label">游戏时间</span>
                  <span class="info-value">{{ formatGameTime(snapshot) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-icon">💬</span>
                  <span class="info-label">对话楼层</span>
                  <span class="info-value">第 {{ snapshot.messageIndex + 1 }} 条</span>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="snapshot-actions">
              <button 
                v-if="mode === 'save'" 
                class="action-btn load" 
                @click.stop="loadSave(snapshot.id)"
                title="加载此存档"
              >
                读取
              </button>
              <button 
                class="action-btn delete" 
                @click.stop="deleteSave(snapshot.id)"
                title="删除此存档"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.save-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(20, 15, 10, 0.8) 0%, rgba(40, 30, 20, 0.85) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  backdrop-filter: blur(8px);
}

.save-panel {
  width: 90%;
  max-width: 650px;
  max-height: 85vh;
  background: linear-gradient(180deg, #fffdf5 0%, #f5f0e1 100%);
  border-radius: 20px;
  box-shadow: 
    0 20px 60px rgba(139, 69, 19, 0.4),
    0 0 0 1px rgba(218, 165, 32, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(180deg, rgba(218, 165, 32, 0.15) 0%, rgba(218, 165, 32, 0.05) 100%);
  border-bottom: 1px solid rgba(139, 69, 19, 0.15);
}

.header-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 1.5rem;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.4rem;
  color: #5d4037;
  font-weight: 600;
  letter-spacing: 1px;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 249, 230, 0.8) 100%);
  font-size: 1.4rem;
  color: #8b4513;
  cursor: pointer;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.2) 0%, rgba(184, 134, 11, 0.2) 100%);
  border-color: rgba(218, 165, 32, 0.5);
  transform: scale(1.05);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(139, 69, 19, 0.05);
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(139, 69, 19, 0.2);
  border-radius: 3px;
}

.new-save-section {
  margin-bottom: 20px;
}

.io-section {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.io-btn {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 249, 230, 0.9) 100%);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.io-icon {
  font-size: 1.1rem;
}

.io-btn.export {
  color: #1565c0;
  border-color: rgba(21, 101, 192, 0.3);
}

.io-btn.export:hover {
  background: linear-gradient(135deg, rgba(21, 101, 192, 0.1) 0%, rgba(21, 101, 192, 0.05) 100%);
  border-color: rgba(21, 101, 192, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(21, 101, 192, 0.2);
}

.io-btn.import {
  color: #e65100;
  border-color: rgba(230, 81, 0, 0.3);
}

.io-btn.import:hover {
  background: linear-gradient(135deg, rgba(230, 81, 0, 0.1) 0%, rgba(230, 81, 0, 0.05) 100%);
  border-color: rgba(230, 81, 0, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(230, 81, 0, 0.2);
}

.new-save-btn {
  width: 100%;
  padding: 18px;
  background: linear-gradient(135deg, #8b4513 0%, #a0522d 100%);
  color: rgba(255, 248, 220, 0.95);
  border: none;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(139, 69, 19, 0.3);
  letter-spacing: 1px;
}

.new-save-btn:hover {
  background: linear-gradient(135deg, #a0522d 0%, #cd853f 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(139, 69, 19, 0.4);
}

.plus-icon {
  font-size: 1.5rem;
  font-weight: 300;
}

.snapshots-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-hint {
  text-align: center;
  color: #8b7355;
  padding: 50px 20px;
  font-size: 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.6;
}

.snapshot-item {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 249, 230, 0.95) 100%);
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(139, 69, 19, 0.08);
}

.snapshot-item.clickable {
  cursor: pointer;
}

.snapshot-item.clickable:hover {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(255, 249, 230, 1) 100%);
  border-color: rgba(218, 165, 32, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(139, 69, 19, 0.15);
}

.snapshot-main {
  flex: 1;
  min-width: 0;
}

.snapshot-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.label-text {
  font-size: 1.15rem;
  font-weight: 600;
  color: #5d4037;
  letter-spacing: 0.5px;
}

.label-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid rgba(218, 165, 32, 0.5);
  border-radius: 8px;
  font-size: 1rem;
  max-width: 200px;
  background: rgba(255, 255, 255, 0.9);
  color: #5d4037;
  outline: none;
}

.label-input:focus {
  border-color: rgba(218, 165, 32, 0.8);
  box-shadow: 0 0 0 3px rgba(218, 165, 32, 0.15);
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.icon-btn.edit {
  color: #8b4513;
}

.icon-btn.edit:hover {
  background: rgba(218, 165, 32, 0.15);
  border-color: rgba(218, 165, 32, 0.5);
}

.icon-btn.save {
  color: #2e7d32;
  border-color: rgba(46, 125, 50, 0.3);
}

.icon-btn.save:hover {
  background: rgba(46, 125, 50, 0.1);
  border-color: rgba(46, 125, 50, 0.5);
}

.icon-btn.cancel {
  color: #c62828;
  border-color: rgba(198, 40, 40, 0.3);
}

.icon-btn.cancel:hover {
  background: rgba(198, 40, 40, 0.1);
  border-color: rgba(198, 40, 40, 0.5);
}

.snapshot-info {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

.info-icon {
  font-size: 0.9rem;
}

.info-label {
  color: #8b7355;
}

.info-value {
  color: #5d4037;
  font-weight: 500;
}

.snapshot-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  padding: 8px 16px;
  border: 1px solid;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn.load {
  color: #1565c0;
  border-color: rgba(21, 101, 192, 0.4);
}

.action-btn.load:hover {
  background: rgba(21, 101, 192, 0.1);
  border-color: rgba(21, 101, 192, 0.6);
}

.action-btn.delete {
  color: #c62828;
  border-color: rgba(198, 40, 40, 0.4);
}

.action-btn.delete:hover {
  background: rgba(198, 40, 40, 0.1);
  border-color: rgba(198, 40, 40, 0.6);
}

/* 聊天预览样式 */
.chat-preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #fffdf5 0%, #f5f0e1 100%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.12) 0%, rgba(102, 126, 234, 0.05) 100%);
  border-bottom: 1px solid rgba(102, 126, 234, 0.2);
}

.preview-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-icon {
  font-size: 1.5rem;
}

.preview-header h3 {
  margin: 0;
  color: #5d4037;
  font-size: 1.3rem;
  font-weight: 600;
  letter-spacing: 1px;
}

.preview-close {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  border-color: rgba(102, 126, 234, 0.3);
  color: #667eea;
}

.preview-close:hover {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.25) 0%, rgba(118, 75, 162, 0.25) 100%);
  border-color: rgba(102, 126, 234, 0.5);
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.preview-content::-webkit-scrollbar {
  width: 6px;
}

.preview-content::-webkit-scrollbar-track {
  background: rgba(102, 126, 234, 0.05);
}

.preview-content::-webkit-scrollbar-thumb {
  background: rgba(102, 126, 234, 0.2);
  border-radius: 3px;
}

.preview-hint {
  text-align: center;
  color: #667eea;
  margin-bottom: 20px;
  font-size: 0.95rem;
  padding: 14px 20px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
  border-radius: 12px;
  border: 1px solid rgba(102, 126, 234, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.hint-icon {
  font-size: 1.2rem;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-preview-item {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 249, 230, 0.95) 100%);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.chat-preview-item:hover {
  border-color: rgba(102, 126, 234, 0.5);
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(255, 249, 230, 1) 100%);
  transform: translateX(4px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.15);
}

.chat-role-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 12px;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.chat-role-badge.player {
  background: linear-gradient(135deg, rgba(21, 101, 192, 0.15) 0%, rgba(21, 101, 192, 0.1) 100%);
  color: #1565c0;
  border: 1px solid rgba(21, 101, 192, 0.2);
}

.chat-role-badge.ai {
  background: linear-gradient(135deg, rgba(198, 40, 40, 0.12) 0%, rgba(198, 40, 40, 0.08) 100%);
  color: #c62828;
  border: 1px solid rgba(198, 40, 40, 0.2);
}

.chat-text {
  font-size: 0.95rem;
  color: #5d4037;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.chat-meta {
  margin-top: 8px;
  text-align: right;
}

.has-snapshot {
  color: #2e7d32;
  background: linear-gradient(135deg, rgba(46, 125, 50, 0.12) 0%, rgba(46, 125, 50, 0.08) 100%);
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid rgba(46, 125, 50, 0.2);
}

/* 移动端适配 */
@media (max-width: 480px) {
  .save-panel {
    width: 95%;
    max-height: 90vh;
    border-radius: 16px;
  }

  .snapshot-item {
    flex-direction: column;
  }

  .snapshot-actions {
    flex-direction: row;
    width: 100%;
    margin-top: 12px;
  }

  .action-btn {
    flex: 1;
  }

  .snapshot-info {
    flex-direction: column;
    gap: 8px;
  }

  .io-section {
    flex-direction: column;
  }
}

/* ==================== 夜间模式 ==================== */
.dark-mode .save-panel {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(99, 102, 241, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dark-mode .panel-header {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%);
  border-bottom-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .panel-header h2 {
  color: #e0e7ff;
}

.dark-mode .close-btn {
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.8) 0%, rgba(40, 40, 70, 0.8) 100%);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.dark-mode .close-btn:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(129, 140, 248, 0.2) 100%);
  border-color: rgba(99, 102, 241, 0.5);
}

.dark-mode .panel-content {
  background: transparent;
}

.dark-mode .panel-content::-webkit-scrollbar-track {
  background: rgba(99, 102, 241, 0.05);
}

.dark-mode .panel-content::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.3);
}

.dark-mode .io-btn {
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.9) 0%, rgba(40, 40, 70, 0.9) 100%);
  border-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .io-btn.export {
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.3);
}

.dark-mode .io-btn.export:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
  border-color: rgba(147, 197, 253, 0.5);
}

.dark-mode .io-btn.import {
  color: #fdba74;
  border-color: rgba(253, 186, 116, 0.3);
}

.dark-mode .io-btn.import:hover {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(251, 146, 60, 0.1) 100%);
  border-color: rgba(253, 186, 116, 0.5);
}

.dark-mode .new-save-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
}

.dark-mode .new-save-btn:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}

.dark-mode .empty-hint {
  color: #a5b4fc;
}

.dark-mode .snapshot-item {
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.95) 0%, rgba(40, 40, 70, 0.95) 100%);
  border-color: rgba(99, 102, 241, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.dark-mode .snapshot-item.clickable:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(40, 40, 70, 1) 100%);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.2);
}

.dark-mode .label-text {
  color: #e0e7ff;
}

.dark-mode .label-input {
  background: rgba(30, 30, 50, 0.9);
  border-color: rgba(99, 102, 241, 0.5);
  color: #e0e7ff;
}

.dark-mode .label-input:focus {
  border-color: rgba(99, 102, 241, 0.8);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.dark-mode .icon-btn {
  background: rgba(30, 30, 50, 0.8);
  border-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .icon-btn.edit {
  color: #a5b4fc;
}

.dark-mode .icon-btn.edit:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.5);
}

.dark-mode .icon-btn.save {
  color: #86efac;
  border-color: rgba(134, 239, 172, 0.3);
}

.dark-mode .icon-btn.save:hover {
  background: rgba(134, 239, 172, 0.1);
  border-color: rgba(134, 239, 172, 0.5);
}

.dark-mode .icon-btn.cancel {
  color: #fca5a5;
  border-color: rgba(252, 165, 165, 0.3);
}

.dark-mode .icon-btn.cancel:hover {
  background: rgba(252, 165, 165, 0.1);
  border-color: rgba(252, 165, 165, 0.5);
}

.dark-mode .info-label {
  color: #94a3b8;
}

.dark-mode .info-value {
  color: #e0e7ff;
}

.dark-mode .action-btn.load {
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.4);
}

.dark-mode .action-btn.load:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(147, 197, 253, 0.6);
}

.dark-mode .action-btn.delete {
  color: #fca5a5;
  border-color: rgba(252, 165, 165, 0.4);
}

.dark-mode .action-btn.delete:hover {
  background: rgba(248, 113, 113, 0.15);
  border-color: rgba(252, 165, 165, 0.6);
}

/* 夜间模式 - 聊天预览 */
.dark-mode .chat-preview-overlay {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
}

.dark-mode .preview-header {
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%);
  border-bottom-color: rgba(139, 92, 246, 0.2);
}

.dark-mode .preview-header h3 {
  color: #e0e7ff;
}

.dark-mode .preview-close {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
  border-color: rgba(139, 92, 246, 0.4);
  color: #c4b5fd;
}

.dark-mode .preview-close:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%);
  border-color: rgba(139, 92, 246, 0.6);
}

.dark-mode .preview-content::-webkit-scrollbar-track {
  background: rgba(139, 92, 246, 0.05);
}

.dark-mode .preview-content::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.3);
}

.dark-mode .preview-hint {
  color: #c4b5fd;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(168, 85, 247, 0.1) 100%);
  border-color: rgba(139, 92, 246, 0.2);
}

.dark-mode .chat-preview-item {
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.95) 0%, rgba(40, 40, 70, 0.95) 100%);
  border-color: rgba(139, 92, 246, 0.12);
}

.dark-mode .chat-preview-item:hover {
  border-color: rgba(139, 92, 246, 0.5);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(40, 40, 70, 1) 100%);
  box-shadow: 0 4px 15px rgba(139, 92, 246, 0.2);
}

.dark-mode .chat-role-badge.player {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.3);
}

.dark-mode .chat-role-badge.ai {
  background: linear-gradient(135deg, rgba(244, 114, 182, 0.15) 0%, rgba(244, 114, 182, 0.1) 100%);
  color: #f9a8d4;
  border-color: rgba(244, 114, 182, 0.25);
}

.dark-mode .chat-text {
  color: #e0e7ff;
}

.dark-mode .has-snapshot {
  color: #86efac;
  background: linear-gradient(135deg, rgba(134, 239, 172, 0.15) 0%, rgba(134, 239, 172, 0.1) 100%);
  border-color: rgba(134, 239, 172, 0.25);
}

/* ==================== Debug 面板样式 ==================== */
.debug-badge {
  padding: 4px 10px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.debug-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #fffdf5 0%, #f5f0e1 100%);
  z-index: 25;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
}

.debug-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
  font-weight: 600;
  font-size: 1rem;
}

.debug-icon {
  font-size: 1.3rem;
}

.debug-close-btn {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.debug-close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.debug-panel-content {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-hint {
  margin: 0 0 12px;
  color: #666;
  font-size: 0.9rem;
}

.debug-textarea {
  flex: 1;
  width: 100%;
  min-height: 200px;
  padding: 14px;
  border: 2px solid #ddd;
  border-radius: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  resize: none;
  background: white;
  box-sizing: border-box;
}

.debug-textarea:focus {
  outline: none;
  border-color: #ff9800;
}

.debug-textarea::placeholder {
  color: #aaa;
}

.debug-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.debug-btn {
  flex: 1;
  padding: 12px 20px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 249, 230, 0.9) 100%);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #5d4037;
}

.debug-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.15);
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.debug-btn.primary {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
  border: none;
  box-shadow: 0 4px 15px rgba(255, 152, 0, 0.35);
}

.debug-btn.primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 152, 0, 0.45);
}

/* 夜间模式 - Debug 面板 */
.dark-mode .debug-overlay {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
}

.dark-mode .debug-panel-header {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.dark-mode .debug-hint {
  color: #94a3b8;
}

.dark-mode .debug-textarea {
  background: rgba(30, 30, 50, 0.9);
  border-color: rgba(245, 158, 11, 0.3);
  color: #e0e7ff;
}

.dark-mode .debug-textarea:focus {
  border-color: #f59e0b;
}

.dark-mode .debug-textarea::placeholder {
  color: #64748b;
}

.dark-mode .debug-btn {
  background: linear-gradient(135deg, rgba(30, 30, 50, 0.9) 0%, rgba(40, 40, 70, 0.9) 100%);
  border-color: rgba(245, 158, 11, 0.3);
  color: #e0e7ff;
}

.dark-mode .debug-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.dark-mode .debug-btn.primary {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
}

.dark-mode .debug-btn.primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
}

/* 移动端适配 - Debug 面板 */
@media (max-width: 480px) {
  .debug-textarea {
    min-height: 150px;
    font-size: 0.8rem;
  }

  .debug-actions {
    flex-direction: column;
  }
}
</style>
