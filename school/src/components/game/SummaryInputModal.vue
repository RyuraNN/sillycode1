<script setup>
/**
 * 手动总结输入弹窗组件
 * 当 AI 未能生成剧情总结时，允许用户手动输入
 */

import { ref } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'cancel'])

const content = ref('')

const handleSubmit = () => {
  if (content.value.trim()) {
    emit('submit', content.value.trim())
    content.value = ''
  }
}

const handleCancel = () => {
  emit('cancel')
  content.value = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay">
      <div class="modal-content summary-modal">
        <h3>补充剧情总结</h3>
        <p class="modal-desc">本回合AI未能生成剧情小总结，请手动补充。</p>
        <textarea 
          v-model="content" 
          class="summary-input"
          placeholder="请输入本回合剧情总结..."
        ></textarea>
        <div class="modal-actions">
          <button class="cancel-btn" @click="handleCancel">取消</button>
          <button class="confirm-btn" @click="handleSubmit">提交</button>
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
  max-width: 500px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(139, 69, 19, 0.2);
  animation: popIn 0.3s ease;
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.summary-modal h3 {
  margin: 0 0 12px 0;
  color: #5d4037;
  font-size: 1.2rem;
}

.modal-desc {
  color: #8d6e63;
  margin-bottom: 16px;
  font-size: 0.95rem;
}

.summary-input {
  width: 100%;
  height: 120px;
  padding: 12px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  font-size: 1rem;
  margin-bottom: 20px;
  box-sizing: border-box;
  background: #fff;
  color: #3e2723;
}

.summary-input:focus {
  outline: none;
  border-color: rgba(218, 165, 32, 0.6);
  box-shadow: 0 0 0 2px rgba(218, 165, 32, 0.1);
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

:global(.dark-mode) .summary-modal h3 {
  color: #e0e7ff;
}

:global(.dark-mode) .modal-desc {
  color: #a5b4fc;
}

:global(.dark-mode) .summary-input {
  background: #0f0f1a;
  border-color: rgba(99, 102, 241, 0.3);
  color: #e0e7ff;
}

:global(.dark-mode) .summary-input:focus {
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
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
