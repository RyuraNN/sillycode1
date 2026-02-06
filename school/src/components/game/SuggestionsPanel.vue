<script setup>
/**
 * 建议回复面板组件
 * 显示 AI 生成的建议回复选项
 */

import { ref } from 'vue'

const props = defineProps({
  suggestions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select'])

const isOpen = ref(false)

const togglePanel = () => {
  isOpen.value = !isOpen.value
}

const selectSuggestion = (reply) => {
  emit('select', reply)
}
</script>

<template>
  <div class="suggestions-wrapper">
    <!-- 展开/收起按钮 -->
    <button 
      class="suggestions-toggle" 
      @click="togglePanel" 
      :class="{ 'open': isOpen }" 
      title="建议回复"
    >
      <span class="toggle-icon">💡</span>
      <span class="toggle-arrow">^</span>
    </button>
    
    <!-- 面板内容 -->
    <transition name="slide-up">
      <div v-if="isOpen" class="suggestions-panel">
        <div class="suggestions-list">
          <div v-if="suggestions.length === 0" class="empty-suggestions">
            等待AI生成建议... (请发送下一条消息)
          </div>
          <button 
            v-else
            v-for="(reply, index) in suggestions" 
            :key="index"
            class="suggestion-chip"
            @click="selectSuggestion(reply)"
          >
            {{ reply }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.suggestions-wrapper {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  z-index: 15;
  padding-bottom: 8px;
}

.suggestions-toggle {
  pointer-events: auto;
  background: linear-gradient(135deg, rgba(255, 253, 245, 0.95) 0%, rgba(255, 249, 230, 0.95) 100%);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 20px;
  padding: 4px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(139, 69, 19, 0.15);
  margin-bottom: 8px;
  transition: all 0.3s ease;
  color: #5d4037;
}

.suggestions-toggle:hover {
  background: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.2);
}

.toggle-arrow {
  font-size: 1.2rem;
  font-weight: bold;
  transition: transform 0.3s ease;
  line-height: 1;
}

.suggestions-toggle.open .toggle-arrow {
  transform: rotate(180deg);
}

.suggestions-panel {
  pointer-events: auto;
  width: 90%;
  max-width: 800px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(139, 69, 19, 0.15);
  padding: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transform-origin: bottom center;
}

.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.suggestion-chip {
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.08) 0%, rgba(160, 82, 45, 0.12) 100%);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 16px;
  padding: 8px 16px;
  font-size: 0.9rem;
  color: #5d4037;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: pre-wrap;
  text-align: left;
  max-width: 100%;
}

.suggestion-chip:hover {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.2) 0%, rgba(184, 134, 11, 0.25) 100%);
  border-color: rgba(218, 165, 32, 0.5);
  transform: translateY(-1px);
}

.empty-suggestions {
  padding: 10px;
  color: #8d6e63;
  font-size: 0.9rem;
  font-style: italic;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* 夜间模式 */
:global(.dark-mode) .suggestions-toggle {
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

:global(.dark-mode) .suggestions-toggle:hover {
  background: rgba(30, 30, 50, 0.95);
  border-color: rgba(99, 102, 241, 0.5);
}

:global(.dark-mode) .suggestions-panel {
  background: rgba(30, 30, 50, 0.95);
  border-color: rgba(99, 102, 241, 0.3);
}

:global(.dark-mode) .suggestion-chip {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
  border-color: rgba(99, 102, 241, 0.3);
  color: #e0e7ff;
}

:global(.dark-mode) .suggestion-chip:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%);
  border-color: rgba(99, 102, 241, 0.5);
}

:global(.dark-mode) .empty-suggestions {
  color: #a5b4fc;
}
</style>
