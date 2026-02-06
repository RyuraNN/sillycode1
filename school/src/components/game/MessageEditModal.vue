<script setup>
/**
 * 消息编辑弹窗组件
 * 允许用户编辑已发送的消息
 */

import { ref, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  content: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['submit', 'cancel'])

const editContent = ref('')

// 监听 visible 和 content 变化，同步内容
watch(() => props.visible, (newVal) => {
  if (newVal) {
    editContent.value = props.content
  }
})

watch(() => props.content, (newVal) => {
  if (props.visible) {
    editContent.value = newVal
  }
})

const handleSubmit = () => {
  emit('submit', editContent.value)
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay">
      <div class="modal-content edit-modal">
        <h3>编辑消息</h3>
        <textarea 
          v-model="editContent" 
          class="edit-input"
          placeholder="请输入新的消息内容..."
        ></textarea>
        <div class="modal-actions">
          <button class="cancel-btn" @click="handleCancel">取消</button>
          <button class="confirm-btn" @click="handleSubmit">保存修改</button>
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
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(139, 69, 19, 0.2);
  animation: popIn 0.3s ease;
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.edit-modal h3 {
  margin: 0 0 16px 0;
  color: #5d4037;
  font-size: 1.2rem;
}

.edit-input {
  width: 100%;
  height: 200px;
  padding: 12px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  font-size: 1rem;
  margin-bottom: 20px;
  box-sizing: border-box;
  background: #fff;
  color: #3e2723;
  line-height: 1.6;
}

.edit-input:focus {
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

:global(.dark-mode) .edit-modal h3 {
  color: #e0e7ff;
}

:global(.dark-mode) .edit-input {
  background: #0f0f1a;
  border-color: rgba(99, 102, 241, 0.3);
  color: #e0e7ff;
}

:global(.dark-mode) .edit-input:focus {
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
