<!-- 通用消息模态框 -->
<template>
  <Teleport to="body">
    <div v-if="show" class="message-modal-overlay" @click.self="$emit('close')">
      <div class="message-modal">
        <div class="modal-header">
          <h3>{{ title || '提示' }}</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <p class="message-content">{{ message }}</p>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="$emit('close')">
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  show: Boolean,
  title: String,
  message: String
})

defineEmits(['close'])
</script>

<style scoped>
.message-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.message-modal {
  background: #2a2a2a;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #444;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #444;
  color: #fff;
}

.modal-body {
  padding: 30px 20px;
}

.message-content {
  color: #ccc;
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px 20px;
  border-top: 1px solid #444;
}

.btn-primary {
  padding: 10px 24px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #45a049;
}
</style>
