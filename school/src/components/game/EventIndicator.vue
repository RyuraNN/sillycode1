<script setup>
/**
 * 事件指示器组件
 * 当事件横幅折叠时显示的小图标，通常放置在标题栏
 */

import { useEventCarousel } from '../../composables/useEventCarousel'

const {
  currentEvent,
  isBannerCollapsed,
  expandBanner
} = useEventCarousel()
</script>

<template>
  <div 
    v-if="currentEvent && isBannerCollapsed" 
    class="event-indicator collapsed"
    @click="expandBanner"
    title="展开事件信息"
  >
    <span class="event-icon-sm">⚡</span>
    <transition name="fade" mode="out-in">
      <span :key="currentEvent.id" class="event-text">{{ currentEvent.name }}</span>
    </transition>
  </div>
</template>

<style scoped>
.event-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: linear-gradient(135deg, #ffb74d 0%, #ff9800 100%);
  border-radius: 16px;
  box-shadow: 0 2px 6px rgba(255, 152, 0, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  color: white;
  animation: fadeIn 0.3s ease;
  flex-shrink: 0; /* 防止在 flex 布局中被挤压 */
}

.event-indicator:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(255, 152, 0, 0.4);
}

.event-icon-sm {
  font-size: 0.9rem;
}

.event-text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap; /* 防止换行 */
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
</style>
