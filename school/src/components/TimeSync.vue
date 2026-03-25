<script setup>
import { ref, computed } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendTimeAdjust, sendSpectateRequest } from '../utils/multiplayerWs'

const mpStore = useMultiplayerStore()

const showAdjustPanel = ref(false)

const hasWarning = computed(() => !!mpStore.timeWarning)
const timeDiff = computed(() => mpStore.timeWarning?.diff || 0)
const baseDelta = computed(() => mpStore.timeWarning?.baseDelta || 0)
const yourDelta = computed(() => mpStore.timeWarning?.yourDelta || 0)
const canManualAdjust = computed(() => timeDiff.value <= 20)

const roundInfo = computed(() => ({
  number: mpStore.roundNumber,
  status: mpStore.roundStatus,
}))

const statusLabel = computed(() => {
  switch (mpStore.roundStatus) {
    case 'waiting': return '等待中'
    case 'in_progress': return '进行中'
    case 'completed': return '已完成'
    default: return ''
  }
})

function adjustTime() {
  sendTimeAdjust(baseDelta.value)
  showAdjustPanel.value = false
}

function requestSpectate(targetId) {
  sendSpectateRequest(targetId)
}
</script>

<template>
  <!-- 时间同步警告浮窗 -->
  <div v-if="hasWarning" class="ts-warning" @click="showAdjustPanel = !showAdjustPanel">
    <div class="ts-warning-bar">
      <span class="ts-icon">⏱</span>
      <span class="ts-text">时间差: {{ timeDiff }}分钟</span>
      <span class="ts-round">第{{ roundInfo.number }}轮 · {{ statusLabel }}</span>
    </div>

    <!-- 展开面板 -->
    <div v-if="showAdjustPanel" class="ts-detail" @click.stop>
      <div class="ts-info-row">
        <span>基准时间步长</span>
        <span class="ts-val">{{ baseDelta }}分钟</span>
      </div>
      <div class="ts-info-row">
        <span>你的时间步长</span>
        <span class="ts-val highlight">{{ yourDelta }}分钟</span>
      </div>
      <div class="ts-info-row">
        <span>差距</span>
        <span class="ts-val warn">+{{ timeDiff }}分钟</span>
      </div>

      <!-- 可手动调整（≤20分钟） -->
      <template v-if="canManualAdjust">
        <p class="ts-hint">将你的时间步长调整为基准值，以保持与其他玩家同步。</p>
        <div class="ts-actions">
          <button class="ts-btn primary" @click="adjustTime">同步到基准时间</button>
          <button class="ts-btn" @click="showAdjustPanel = false">暂时忽略</button>
        </div>
      </template>

      <!-- 无法手动调整（>20分钟）—— 提供观战入口 -->
      <template v-else>
        <p class="ts-hint ts-hint-warn">时间差过大，无法手动调整。你可以等待时间同步，或观看其他玩家的游戏进程。</p>
        <div class="ts-actions">
          <button class="ts-btn primary" @click="mpStore.showSpectateList = true; showAdjustPanel = false">观战其他玩家</button>
          <button class="ts-btn" @click="showAdjustPanel = false">等待同步</button>
        </div>
      </template>
    </div>
  </div>

  <!-- 回合状态指示器（无警告时也显示） -->
  <div v-else-if="mpStore.isMultiplayerActive && roundInfo.status === 'waiting'" class="ts-round-indicator">
    <span class="ts-round-dot"></span>
    <span>等待其他玩家完成第{{ roundInfo.number }}轮...</span>
  </div>
</template>

<style scoped>
/* Light mode — warm amber glass for warnings */
.ts-warning {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7500;
  cursor: pointer;
}

.ts-warning-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 20px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 0.8rem;
  color: #92400e;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.08);
}

.ts-icon {
  font-size: 1rem;
}

.ts-round {
  color: #b45309;
  font-size: 0.72rem;
}

.ts-detail {
  margin-top: 8px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 12px;
  padding: 14px 16px;
  min-width: 260px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.06);
}

.ts-info-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 0.82rem;
  color: #78350f;
}

.ts-val {
  font-weight: 500;
  color: #92400e;
}

.ts-val.highlight {
  color: #d97706;
}

.ts-val.warn {
  color: #dc2626;
}

.ts-hint {
  font-size: 0.78rem;
  color: #b45309;
  opacity: 0.6;
  margin: 10px 0;
  line-height: 1.4;
}

.ts-hint-warn {
  color: #dc2626;
  opacity: 0.8;
}

.ts-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-btn {
  padding: 8px 14px;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.06);
  color: #92400e;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.ts-btn:hover {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.3);
}

.ts-btn.primary {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #78350f;
}

.ts-btn.primary:hover {
  background: rgba(245, 158, 11, 0.2);
}

/* Round indicator — neutral warm glass */
.ts-round-indicator {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(255, 253, 245, 0.50);
  border: 1px solid rgba(139, 69, 19, 0.10);
  border-radius: 16px;
  font-size: 0.75rem;
  color: #8d6e63;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ts-round-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b4513;
  opacity: 0.6;
  animation: blink 1.2s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* ── Dark mode ── */
:global(.dark-mode) .ts-warning-bar {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.3);
  color: rgba(255, 215, 0, 0.85);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}
:global(.dark-mode) .ts-round { color: rgba(218, 165, 32, 0.7); }
:global(.dark-mode) .ts-detail {
  background: rgba(30, 20, 12, 0.85);
  border-color: rgba(218, 165, 32, 0.25);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
:global(.dark-mode) .ts-info-row { color: rgba(255, 248, 220, 0.8); }
:global(.dark-mode) .ts-val { color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .ts-val.highlight { color: rgba(218, 165, 32, 0.9); }
:global(.dark-mode) .ts-val.warn { color: rgba(255, 180, 160, 0.9); }
:global(.dark-mode) .ts-hint { color: rgba(218, 165, 32, 0.55); }
:global(.dark-mode) .ts-btn {
  border-color: rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.15);
  color: rgba(255, 215, 0, 0.8);
}
:global(.dark-mode) .ts-btn:hover { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .ts-btn.primary {
  background: rgba(218, 165, 32, 0.2);
  border-color: rgba(218, 165, 32, 0.4);
  color: rgba(255, 248, 220, 0.95);
}
:global(.dark-mode) .ts-btn.primary:hover { background: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .ts-round-indicator {
  background: rgba(30, 20, 12, 0.7);
  border-color: rgba(218, 165, 32, 0.15);
  color: rgba(218, 165, 32, 0.6);
}
:global(.dark-mode) .ts-round-dot { background: rgba(255, 215, 0, 0.7); }

@media (max-width: 768px) {
  .ts-warning {
    max-width: calc(100vw - 24px);
  }
  .ts-warning-bar {
    white-space: normal;
    text-align: center;
  }
  .ts-detail {
    min-width: auto;
    width: 100%;
  }
  .ts-btn {
    min-height: 44px;
  }
  .ts-round-indicator {
    max-width: calc(100vw - 24px);
  }
}
</style>
