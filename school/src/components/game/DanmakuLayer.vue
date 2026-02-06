<script setup>
/**
 * 弹幕层组件
 * 显示游戏变化的弹幕动画
 */

import { useDanmaku } from '../../composables/useDanmaku'

const { danmakuList } = useDanmaku()
</script>

<template>
  <div class="danmaku-container">
    <div 
      v-for="item in danmakuList" 
      :key="item.id" 
      class="danmaku-item" 
      :style="{ top: item.top }"
    >
      {{ item.text }}
    </div>
  </div>
</template>

<style scoped>
.danmaku-container {
  position: fixed;
  top: 100px;
  left: 0;
  width: 100%;
  height: 200px;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.danmaku-item {
  position: absolute;
  right: -100%;
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.85) 0%, rgba(160, 82, 45, 0.85) 100%);
  color: rgba(255, 248, 220, 0.95);
  padding: 8px 20px;
  border-radius: 25px;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 500;
  animation: danmaku-move 5s linear forwards;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(218, 165, 32, 0.4);
}

@keyframes danmaku-move {
  from { right: -20%; }
  to { right: 120%; }
}

/* 夜间模式 */
:global(.dark-mode) .danmaku-item {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.85) 0%, rgba(139, 92, 246, 0.85) 100%);
  color: rgba(255, 255, 255, 0.95);
  border-color: rgba(165, 180, 252, 0.4);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
}
</style>
