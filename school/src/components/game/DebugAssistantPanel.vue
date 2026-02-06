<script setup>
/**
 * Debug 辅助AI面板组件
 * 在 Debug 模式下显示辅助 AI 的输出日志
 */

const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <div class="assistant-panel">
    <div class="assistant-header">辅助AI输出</div>
    <div class="assistant-log-container">
      <div v-for="log in logs" :key="log.id" class="assistant-log-item">
        <div class="log-meta">Floor {{ log.floor }}</div>
        <pre class="log-text">{{ log.content }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-panel {
  width: 50%;
  border-left: 1px solid rgba(139, 69, 19, 0.2);
  background: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-direction: column;
}

.assistant-header {
  padding: 8px 16px;
  background: rgba(139, 69, 19, 0.1);
  font-weight: bold;
  color: #5d4037;
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
}

.assistant-log-container {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.assistant-log-item {
  margin-bottom: 16px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  padding-bottom: 10px;
}

.log-meta {
  font-size: 0.8rem;
  color: #888;
  margin-bottom: 4px;
}

.log-text {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.9rem;
  margin: 0;
  color: #333;
}

/* 夜间模式 */
:global(.dark-mode) .assistant-panel {
  border-left-color: rgba(99, 102, 241, 0.3);
  background: rgba(26, 26, 46, 0.5);
}

:global(.dark-mode) .assistant-header {
  background: rgba(99, 102, 241, 0.1);
  color: #e0e7ff;
  border-bottom-color: rgba(99, 102, 241, 0.2);
}

:global(.dark-mode) .log-text {
  color: #ccc;
}

:global(.dark-mode) .assistant-log-item {
  border-bottom-color: rgba(99, 102, 241, 0.2);
}
</style>
