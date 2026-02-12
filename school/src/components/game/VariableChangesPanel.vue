<script setup>
/**
 * VariableChangesPanel.vue - 变量变化面板
 * 在顶部栏显示一个小按钮，点击展开显示本轮对话中的变量变化
 */

import { ref, computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'

const gameStore = useGameStore()
const isDark = computed(() => gameStore.settings.darkMode)

const props = defineProps({
  changes: {
    type: Array,
    default: () => []
  },
  isMenuOpen: {
    type: Boolean,
    default: false
  }
})

const isExpanded = ref(false)

const hasChanges = computed(() => props.changes.length > 0)

const togglePanel = () => {
  isExpanded.value = !isExpanded.value
}

const closePanel = () => {
  isExpanded.value = false
}

// 格式化差值显示
const formatDiff = (change) => {
  if (change.diff !== undefined && change.diff !== null) {
    const sign = change.diff > 0 ? '+' : ''
    return `(${sign}${change.diff})`
  }
  return ''
}

// 格式化值显示
const formatValue = (val) => {
  if (val === undefined || val === null) return '-'
  if (typeof val === 'number') return val.toString()
  return val
}
</script>

<template>
  <!-- 只有有变化且菜单未展开时才显示按钮 -->
  <div 
    v-if="hasChanges && !isMenuOpen" 
    class="variable-changes-container"
    :class="{ 'expanded': isExpanded }"
  >
    <!-- 小圆形按钮 -->
    <button 
      v-if="!isExpanded"
      class="changes-btn"
      @click="togglePanel"
      title="查看变量变化"
    >
      <span class="btn-icon">Δ</span>
      <span class="count-text">{{ changes.length }}</span>
    </button>

    <!-- 展开时显示一个占位，保持按钮区域 -->
    <button 
      v-else
      class="changes-btn active"
      @click="closePanel"
      title="收起变量变化"
    >
      <span class="btn-icon">Δ</span>
      <span class="count-text">{{ changes.length }}</span>
    </button>

    <!-- 展开的面板通过 Teleport 挂载到 body，避免被 top-bar 的 stacking context 遮挡 -->
    <Teleport to="body">
      <div v-if="isExpanded && hasChanges" class="changes-panel-overlay" :class="{ 'dark-mode': isDark }" @click="closePanel">
        <div class="changes-panel" @click.stop>
          <div class="panel-header">
            <span class="panel-title">📊 变量变化</span>
            <button class="close-btn" @click="closePanel">×</button>
          </div>
          <div class="panel-content">
            <div 
              v-for="(change, index) in changes" 
              :key="index" 
              class="change-item"
              :class="{ 'positive': change.diff > 0, 'negative': change.diff < 0 }"
            >
              <span class="change-label">{{ change.label }}</span>
              <span class="change-values">
                <span class="old-value">{{ formatValue(change.oldValue) }}</span>
                <span class="arrow">→</span>
                <span class="new-value">{{ formatValue(change.newValue) }}</span>
                <span v-if="change.diff !== undefined" class="diff-value">{{ formatDiff(change) }}</span>
              </span>
            </div>
            <div v-if="changes.length === 0" class="no-changes">
              暂无变化
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.variable-changes-container {
  position: relative;
  margin-left: 8px;
  margin-right: 8px;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
}

.changes-btn {
  position: relative;
  height: 32px;
  padding: 0 10px;
  border-radius: 16px;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.changes-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.changes-btn:active {
  background: rgba(0, 0, 0, 0.1);
}

.btn-icon {
  color: #666;
  font-size: 0.9rem;
  font-weight: bold;
}

.count-text {
  font-size: 0.8rem;
  color: #666;
  font-weight: 500;
}

.changes-btn.active {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.2);
}

.changes-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9998;
  background: transparent;
}

.changes-panel {
  position: fixed;
  top: 60px;
  left: 80px;
  margin-top: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  min-width: 200px;
  max-width: 280px;
  max-height: 300px;
  overflow: hidden;
  animation: slideIn 0.2s ease-out;
  z-index: 9999;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, transparent 100%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.panel-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #444;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #666;
}

.panel-content {
  padding: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.change-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: rgba(0, 0, 0, 0.02);
  font-size: 0.8rem;
  gap: 8px;
}

.change-item:last-child {
  margin-bottom: 0;
}

.change-item.positive {
  background: rgba(76, 175, 80, 0.08);
}

.change-item.negative {
  background: rgba(244, 67, 54, 0.08);
}

.change-label {
  color: #333;
  font-weight: 500;
  flex-shrink: 0;
}

.change-values {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  font-size: 0.75rem;
}

.old-value {
  color: #888;
  text-decoration: line-through;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  color: #999;
  font-size: 0.7rem;
}

.new-value {
  color: #333;
  font-weight: 500;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-value {
  font-weight: 600;
  font-size: 0.7rem;
}

.change-item.positive .diff-value {
  color: #2e7d32;
}

.change-item.negative .diff-value {
  color: #c62828;
}

.no-changes {
  text-align: center;
  color: #999;
  padding: 16px;
  font-size: 0.85rem;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .variable-changes-container {
    margin-left: 4px;
    margin-right: 4px;
  }
  
  .changes-btn {
    height: 28px;
    padding: 0 8px;
  }
  
  .btn-icon {
    font-size: 0.8rem;
  }
  
  .count-text {
    font-size: 0.75rem;
  }
  
  .changes-panel {
    position: fixed;
    top: 60px;
    left: 10px;
    right: auto;
    margin-top: 0;
    width: auto;
    min-width: 200px;
    max-width: calc(100vw - 20px);
    max-height: 60vh;
  }
  
  .panel-header {
    padding: 8px 10px;
  }
  
  .panel-title {
    font-size: 0.8rem;
  }
  
  .panel-content {
    padding: 6px;
    max-height: calc(60vh - 40px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .change-item {
    padding: 5px 6px;
    font-size: 0.75rem;
  }
  
  .change-values {
    font-size: 0.7rem;
  }
}

/* 夜间模式 */
.dark-mode .changes-btn.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.dark-mode .changes-panel {
  background: rgba(30, 30, 46, 0.98);
  border-color: rgba(99, 102, 241, 0.3);
}

.dark-mode .panel-header {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%);
  border-bottom-color: rgba(99, 102, 241, 0.15);
}

.dark-mode .panel-title {
  color: #a5b4fc;
}

.dark-mode .close-btn {
  color: #9ca3af;
}

.dark-mode .close-btn:hover {
  color: #e0e7ff;
}

.dark-mode .change-item {
  background: rgba(255, 255, 255, 0.03);
}

.dark-mode .change-item.positive {
  background: rgba(76, 175, 80, 0.12);
}

.dark-mode .change-item.negative {
  background: rgba(244, 67, 54, 0.12);
}

.dark-mode .change-label {
  color: #e0e7ff;
}

.dark-mode .old-value {
  color: #6b7280;
}

.dark-mode .new-value {
  color: #e0e7ff;
}

.dark-mode .changes-btn {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.2);
}

.dark-mode .changes-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dark-mode .btn-icon,
.dark-mode .count-text {
  color: #a5b4fc;
}
</style>
