<script setup>
/**
 * 图片交互面板组件
 * 允许用户编辑图片提示词、重新生成或恢复历史版本
 */

import { ref, watch } from 'vue'
import { useImageCache } from '../../composables/useImageCache'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  imageInfo: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['regenerate', 'restore', 'close'])

const { imageCacheMap, queueImageLoad } = useImageCache()
const prompt = ref('')

// 监听 imageInfo 变化，同步提示词
watch(() => props.imageInfo, (newVal) => {
  if (newVal && newVal.prompt) {
    prompt.value = newVal.prompt
  }
}, { immediate: true })

const handleRegenerate = () => {
  emit('regenerate', prompt.value.trim())
}

const handleRestore = (historyId) => {
  emit('restore', historyId)
}

const handleClose = () => {
  emit('close')
}

// 获取历史图片的 URL
const getHistoryImageUrl = (id) => {
  if (imageCacheMap.has(id)) {
    return imageCacheMap.get(id)
  }
  queueImageLoad(id)
  return ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click="handleClose">
      <div class="modal-content image-panel" @click.stop>
        <h3>图片操作</h3>
        
        <div class="image-preview-section">
          <img 
            v-if="imageInfo && imageCacheMap.get(imageInfo.id)" 
            :src="imageCacheMap.get(imageInfo.id)" 
            class="preview-img" 
          />
        </div>

        <div class="prompt-edit-section">
          <label>提示词:</label>
          <textarea v-model="prompt" class="prompt-input" rows="3"></textarea>
        </div>

        <div class="action-buttons">
          <button class="confirm-btn" @click="handleRegenerate">🔄 重新生成</button>
        </div>

        <div v-if="imageInfo && imageInfo.history && imageInfo.history.length > 0" class="history-section">
          <h4>历史版本</h4>
          <div class="history-list">
            <div 
              v-for="histId in imageInfo.history" 
              :key="histId" 
              class="history-item" 
              @click="handleRestore(histId)"
            >
              <img :src="getHistoryImageUrl(histId) || ''" class="history-thumb" />
              <span v-if="!imageCacheMap.has(histId)" class="loading-text">加载中...</span>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="handleClose">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}

.modal-content {
  background: #fffdf8;
  padding: 24px;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(139, 69, 19, 0.2);
  animation: popIn 0.3s ease;
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.image-panel h3 {
  margin: 0 0 16px 0;
  color: #5d4037;
  font-size: 1.2rem;
}

.image-preview-section {
  text-align: center;
  margin-bottom: 15px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 10px;
}

.preview-img {
  max-height: 200px;
  max-width: 100%;
  border-radius: 4px;
}

.prompt-edit-section {
  margin-bottom: 15px;
}

.prompt-edit-section label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #5d4037;
}

.prompt-input {
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
  background: #fff;
  color: #3e2723;
}

.prompt-input:focus {
  outline: none;
  border-color: rgba(218, 165, 32, 0.6);
}

.action-buttons {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.history-section {
  margin-top: 20px;
  border-top: 1px solid rgba(139, 69, 19, 0.1);
  padding-top: 15px;
}

.history-section h4 {
  margin: 0 0 10px 0;
  font-size: 1rem;
  color: #5d4037;
}

.history-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.history-item {
  flex: 0 0 80px;
  height: 80px;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  background: #eee;
  transition: border-color 0.2s;
}

.history-item:hover {
  border-color: #8b4513;
}

.history-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loading-text {
  font-size: 0.7rem;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #888;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn, .confirm-btn {
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.cancel-btn {
  background: transparent;
  border: 1px solid rgba(139, 69, 19, 0.3);
  color: #5d4037;
}

.cancel-btn:hover {
  background: rgba(139, 69, 19, 0.05);
}

.confirm-btn {
  background: linear-gradient(135deg, #8b4513 0%, #a0522d 100%);
  border: none;
  color: #fff;
  box-shadow: 0 3px 10px rgba(139, 69, 19, 0.2);
}

.confirm-btn:hover {
  background: linear-gradient(135deg, #a0522d 0%, #cd853f 100%);
  transform: translateY(-1px);
  box-shadow: 0 5px 15px rgba(139, 69, 19, 0.3);
}

/* 夜间模式 */
:global(.dark-mode) .modal-content {
  background: #1a1a2e;
  border-color: rgba(99, 102, 241, 0.3);
}

:global(.dark-mode) .image-panel h3,
:global(.dark-mode) .prompt-edit-section label,
:global(.dark-mode) .history-section h4 {
  color: #e0e7ff;
}

:global(.dark-mode) .prompt-input {
  background: #0f0f1a;
  color: #e0e7ff;
  border-color: rgba(99, 102, 241, 0.3);
}

:global(.dark-mode) .image-preview-section {
  background: rgba(255, 255, 255, 0.05);
}

:global(.dark-mode) .history-item {
  background: #2a2a4a;
}

:global(.dark-mode) .history-item:hover {
  border-color: #6366f1;
}

:global(.dark-mode) .cancel-btn {
  border-color: rgba(99, 102, 241, 0.4);
  color: #a5b4fc;
}

:global(.dark-mode) .cancel-btn:hover {
  background: rgba(99, 102, 241, 0.1);
}

:global(.dark-mode) .confirm-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 3px 10px rgba(99, 102, 241, 0.3);
}

:global(.dark-mode) .confirm-btn:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
  box-shadow: 0 5px 15px rgba(99, 102, 241, 0.4);
}
</style>
