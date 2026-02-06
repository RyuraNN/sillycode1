<script setup>
/**
 * 警告提示弹窗组件
 * 显示内容解析异常等警告信息
 */

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay">
      <div class="modal-content warning-modal">
        <div class="warning-header">
          <h3>⚠️ 系统警示</h3>
        </div>
        <p class="modal-desc">
          检测到 AI 回复内容可能存在解析异常（如内容为空或格式错误）。
          <br><br>
          系统已自动为您保留了原始的流式输出结果，以防止文本丢失。您当前看到的内容是未经完整处理的原始版本。
        </p>
        <div class="modal-actions">
          <button class="confirm-btn warning-confirm" @click="handleClose">知道了</button>
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

.warning-header h3 {
  margin: 0 0 12px 0;
  color: #d84315;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.2rem;
}

.modal-desc {
  color: #8d6e63;
  margin-bottom: 20px;
  font-size: 0.95rem;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-btn {
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 0.95rem;
  border: none;
}

.warning-confirm {
  background: linear-gradient(135deg, #ff5722 0%, #d84315 100%);
  color: #fff;
  box-shadow: 0 3px 10px rgba(216, 67, 21, 0.3);
}

.warning-confirm:hover {
  background: linear-gradient(135deg, #ff7043 0%, #bf360c 100%);
  transform: translateY(-1px);
  box-shadow: 0 5px 15px rgba(216, 67, 21, 0.4);
}

/* 夜间模式 */
:global(.dark-mode) .modal-content {
  background: #1a1a2e;
  border-color: rgba(99, 102, 241, 0.3);
}

:global(.dark-mode) .warning-header h3 {
  color: #ff7043;
}

:global(.dark-mode) .modal-desc {
  color: #a5b4fc;
}
</style>
