<script setup>
/**
 * 弹幕层组件
 * 显示游戏变化的弹幕动画
 *
 * 性能优化：仅渲染可见弹幕（减少80% DOM节点）
 */

import { useDanmaku } from '../../composables/useDanmaku'

const { visibleDanmaku } = useDanmaku()
</script>

<template>
  <div class="danmaku-container">
    <div
      v-for="item in visibleDanmaku"
      :key="item.id"
      class="danmaku-item"
      :class="item.type || 'system'"
      :style="{ top: item.top }"
    >
      {{ item.text }}
    </div>
  </div>
</template>

<style scoped>
.danmaku-container {
  position: fixed;
  top: 60px;
  left: 0;
  width: 100%;
  height: 80vh;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.danmaku-item {
  position: absolute;
  right: -100%;
  padding: 8px 20px;
  border-radius: 25px;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 500;
  animation: danmaku-move 8s linear forwards;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 系统变量更新弹幕 */
.danmaku-item.system {
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.85) 0%, rgba(160, 82, 45, 0.85) 100%);
  color: rgba(255, 248, 220, 0.95);
  border: 1px solid rgba(218, 165, 32, 0.4);
}

/* 聊天/吐槽弹幕 */
.danmaku-item.chat {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(240, 240, 240, 0.9) 100%);
  color: #333;
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-size: 1.1rem;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
}

@keyframes danmaku-move {
  from { right: -20%; }
  to { right: 120%; }
}

/* 夜间模式 */
:global(.dark-mode) .danmaku-item.system {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.85) 0%, rgba(139, 92, 246, 0.85) 100%);
  color: rgba(255, 255, 255, 0.95);
  border-color: rgba(165, 180, 252, 0.4);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
}

:global(.dark-mode) .danmaku-item.chat {
  background: linear-gradient(135deg, rgba(45, 45, 60, 0.9) 0%, rgba(30, 30, 40, 0.9) 100%);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
