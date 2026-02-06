<script setup>
/**
 * 事件横幅组件
 * 显示展开后的事件详情信息
 */

import { useGameStore } from '../../stores/gameStore'
import { useEventCarousel } from '../../composables/useEventCarousel'

const gameStore = useGameStore()
const {
  currentEvent,
  isBannerCollapsed,
  collapseBanner
} = useEventCarousel()
</script>

<template>
  <transition name="slide-down">
    <div v-if="currentEvent && !isBannerCollapsed" class="event-banner-wrapper">
      <transition name="fade" mode="out-in">
        <div :key="currentEvent.id" class="event-banner">
          <span class="event-icon">⚡</span>
          <span class="event-name">
            {{ currentEvent.name }}
            <span v-if="gameStore.player.talents.includes('t8')" class="sixth-sense-hint" title="第六感生效中">
              (👁️ {{ currentEvent.description || '无额外信息' }})
            </span>
          </span>
          <span v-if="currentEvent.remainingDays > 0" class="event-days">
            还剩 {{ currentEvent.remainingDays }} 天
          </span>
          <button class="banner-close-btn" @click="collapseBanner" title="收起">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.event-banner {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.15) 0%, rgba(255, 193, 7, 0.15) 100%);
  border-bottom: 1px solid rgba(255, 152, 0, 0.25);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9rem;
  color: #e65100;
  animation: slideDown 0.3s ease;
}

.event-icon {
  font-size: 1.3rem;
  filter: drop-shadow(0 2px 4px rgba(255, 152, 0, 0.3));
}

.event-name {
  font-weight: 600;
  flex: 1;
  letter-spacing: 0.5px;
}

.sixth-sense-hint {
  font-size: 0.8em;
  color: #673ab7;
  margin-left: 8px;
  font-weight: normal;
  background: rgba(103, 58, 183, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.event-days {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.25) 0%, rgba(255, 193, 7, 0.25) 100%);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  border: 1px solid rgba(255, 152, 0, 0.3);
}

.banner-close-btn {
  background: transparent;
  border: none;
  color: #e65100;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: all 0.2s;
}

.banner-close-btn:hover {
  opacity: 1;
  transform: scale(1.1);
  background: rgba(255, 152, 0, 0.1);
  border-radius: 50%;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 60px;
  opacity: 1;
}

@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 夜间模式 */
:global(.dark-mode) .event-banner {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%);
  border-bottom-color: rgba(251, 146, 60, 0.3);
  color: #fdba74;
}

:global(.dark-mode) .event-days {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.25) 0%, rgba(251, 191, 36, 0.2) 100%);
  border-color: rgba(251, 146, 60, 0.35);
}
</style>
