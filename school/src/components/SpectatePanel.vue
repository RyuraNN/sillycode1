<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendSpectateRequest, sendSpectateResponse, sendSpectateStop, sendSpectateSetLayers } from '../utils/multiplayerWs'

const mpStore = useMultiplayerStore()

const logContainer = ref(null)

const isSpectating = computed(() => mpStore.isSpectating)
const spectateTarget = computed(() => {
  if (!mpStore.spectateTarget) return null
  return mpStore.players[mpStore.spectateTarget] || null
})
const spectateLog = computed(() => mpStore.spectateLog)

// 可观战的玩家列表（排除自己）
const spectatablePlayers = computed(() => {
  return Object.values(mpStore.players)
    .filter(p => p.playerId !== mpStore.localPlayerId)
})

// 待处理的观战请求
const pendingRequest = computed(() => mpStore.pendingSpectateRequest)

// 被观战者：可见层数设置
const layerInput = ref(mpStore.spectateVisibleLayers || 4)
const hasViewers = computed(() => mpStore.spectateViewers.length > 0)
const layersCooldownRemaining = ref(0)
let cooldownInterval = null

function startCooldownTimer() {
  if (cooldownInterval) clearInterval(cooldownInterval)
  cooldownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((mpStore.spectateLayersCooldownEnd - Date.now()) / 1000))
    layersCooldownRemaining.value = remaining
    if (remaining <= 0 && cooldownInterval) {
      clearInterval(cooldownInterval)
      cooldownInterval = null
    }
  }, 1000)
}

function updateVisibleLayers() {
  const val = Math.max(1, Math.min(20, parseInt(layerInput.value) || 4))
  layerInput.value = val
  sendSpectateSetLayers(val)
  // 主动设置冷却（服务器会确认或拒绝）
  mpStore.spectateLayersCooldownEnd = Date.now() + 300000
  startCooldownTimer()
}

// 自动滚动
watch(() => mpStore.spectateLog.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})

// 监听冷却状态
watch(() => mpStore.spectateLayersCooldownEnd, (val) => {
  if (val > Date.now()) startCooldownTimer()
})

function requestSpectate(targetId) {
  // 纯观战者用 spectator_only 模式，否则从 TimeSync 触发的用 time_gap
  const mode = mpStore.isSpectatorOnly ? 'spectator_only' : 'time_gap'
  const excessTime = mpStore.timeWarning?.diff || 0
  sendSpectateRequest(targetId, mode, excessTime)
}

function stopSpectating() {
  sendSpectateStop()
  mpStore.isSpectating = false
  mpStore.spectateTarget = null
  mpStore.spectateLog = []
  mpStore.spectateMode = null
}

function approveRequest() {
  if (pendingRequest.value) {
    sendSpectateResponse(pendingRequest.value.playerId || pendingRequest.value, true)
    mpStore.pendingSpectateRequest = null
  }
}

function denyRequest() {
  if (pendingRequest.value) {
    sendSpectateResponse(pendingRequest.value.playerId || pendingRequest.value, false)
    mpStore.pendingSpectateRequest = null
  }
}
</script>

<template>
  <!-- 观战请求弹窗 -->
  <div v-if="pendingRequest" class="sp-request-overlay">
    <div class="sp-request-card">
      <p><strong>{{ pendingRequest.playerName }}</strong> 想要观看你的游戏进程</p>
      <p v-if="pendingRequest.mode === 'spectator_only'" class="sp-request-mode">（纯观战者）</p>
      <p v-else class="sp-request-mode">（时间差观战）</p>
      <div class="sp-request-actions">
        <button class="sp-btn primary" @click="approveRequest">允许</button>
        <button class="sp-btn danger" @click="denyRequest">拒绝</button>
      </div>
    </div>
  </div>

  <!-- 观战面板 -->
  <div v-if="isSpectating" class="sp-panel">
    <div class="sp-header">
      <span class="sp-label">观战模式</span>
      <span v-if="spectateTarget" class="sp-target">{{ spectateTarget.playerName }}</span>
      <button class="sp-btn small danger" @click="stopSpectating">退出</button>
    </div>
    <div ref="logContainer" class="sp-log">
      <div v-if="spectateLog.length === 0" class="sp-empty">等待对方发送消息...</div>
      <div v-for="(entry, i) in spectateLog" :key="i" class="sp-log-entry" :class="entry.type">
        <div class="sp-log-content" v-html="entry.content"></div>
      </div>
    </div>
  </div>

  <!-- 观战选择列表（从 HUD 的时间警告面板触发） -->
  <div v-if="mpStore.showSpectateList && !isSpectating" class="sp-list-panel">
    <div class="sp-list-header">
      <span>选择观战对象</span>
      <button class="sp-btn small" @click="mpStore.showSpectateList = false">&times;</button>
    </div>
    <div v-if="spectatablePlayers.length === 0" class="sp-empty">没有可观战的玩家</div>
    <div v-for="p in spectatablePlayers" :key="p.playerId" class="sp-list-item" @click="requestSpectate(p.playerId)">
      <span class="sp-list-name">{{ p.playerName }}</span>
      <span class="sp-list-loc">{{ p.location || '未知位置' }}</span>
    </div>
  </div>

  <!-- 被观战者：观众管理 & 可见层数调整 -->
  <div v-if="hasViewers && !isSpectating" class="sp-viewer-settings">
    <div class="sp-viewer-header">
      <span>{{ mpStore.spectateViewers.length }} 人正在观看你</span>
    </div>
    <div class="sp-layer-control">
      <label>可见层数</label>
      <input type="number" v-model.number="layerInput" min="1" max="20" class="sp-layer-input" />
      <button class="sp-btn small primary" @click="updateVisibleLayers" :disabled="layersCooldownRemaining > 0">
        {{ layersCooldownRemaining > 0 ? `${layersCooldownRemaining}s` : '应用' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Request overlay */
.sp-request-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9500;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sp-request-card {
  background: linear-gradient(135deg, rgba(30, 20, 12, 0.97) 0%, rgba(45, 30, 18, 0.97) 100%);
  border: 1px solid rgba(218, 165, 32, 0.35);
  border-radius: 12px;
  padding: 22px 26px;
  text-align: center;
  color: rgba(255, 248, 220, 0.9);
  max-width: 320px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.sp-request-card p {
  margin: 0 0 16px;
  font-size: 0.92rem;
  line-height: 1.5;
}

.sp-request-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

/* Spectate panel */
.sp-panel {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 360px;
  max-width: 90vw;
  max-height: 60vh;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 14px;
  z-index: 7200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(139, 69, 19, 0.08);
}

.sp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
}

.sp-label {
  font-size: 0.82rem;
  color: #8d6e63;
}

.sp-target {
  font-size: 0.88rem;
  font-weight: 500;
  color: #4e342e;
  flex: 1;
}

.sp-log {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  min-height: 120px;
}

.sp-log::-webkit-scrollbar { width: 4px; }
.sp-log::-webkit-scrollbar-track { background: transparent; }
.sp-log::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.12); border-radius: 2px; }

.sp-log-entry {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.5;
}

.sp-log-entry.player {
  background: rgba(25, 118, 210, 0.06);
  border-left: 2px solid rgba(25, 118, 210, 0.25);
  color: #1565c0;
}

.sp-log-entry.ai {
  background: rgba(139, 69, 19, 0.04);
  border-left: 2px solid rgba(139, 69, 19, 0.2);
  color: #5d4037;
}

.sp-empty {
  text-align: center;
  padding: 20px 0;
  color: #bcaaa4;
  font-size: 0.83rem;
}

/* Player list panel */
.sp-list-panel {
  position: fixed;
  top: 90px;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  z-index: 8000;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.06);
}

.sp-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  font-size: 0.85rem;
  color: #5d4037;
}

.sp-list-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.2s;
  min-height: 44px;
  align-items: center;
}

.sp-list-item:hover {
  background: rgba(139, 69, 19, 0.06);
}

.sp-list-name {
  color: #4e342e;
  font-size: 0.88rem;
}

.sp-list-loc {
  color: #a1887f;
  font-size: 0.78rem;
}

.sp-btn {
  padding: 8px 14px;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(139, 69, 19, 0.15);
  background: rgba(139, 69, 19, 0.06);
  color: #5d4037;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sp-btn:hover {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(139, 69, 19, 0.25);
}

.sp-btn.primary {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(139, 69, 19, 0.25);
  color: #4e342e;
}

.sp-btn.primary:hover {
  background: rgba(139, 69, 19, 0.2);
}

.sp-btn.danger {
  border-color: rgba(239, 68, 68, 0.25);
  color: #dc2626;
}

.sp-btn.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

.sp-btn.small {
  padding: 4px 10px;
  min-height: 28px;
  font-size: 0.75rem;
}

.sp-btn.small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sp-request-mode {
  margin: -8px 0 12px;
  font-size: 0.78rem;
  color: #a1887f;
}

/* Viewer settings */
.sp-viewer-settings {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 280px;
  max-width: 90vw;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  z-index: 7200;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.06);
  padding: 12px 14px;
}

.sp-viewer-header {
  font-size: 0.82rem;
  color: #5d4037;
  margin-bottom: 10px;
}

.sp-layer-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-layer-control label {
  font-size: 0.78rem;
  color: #8d6e63;
  white-space: nowrap;
}

.sp-layer-input {
  width: 52px;
  padding: 4px 6px;
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 6px;
  background: rgba(255, 253, 245, 0.6);
  color: #4e342e;
  font-size: 0.82rem;
  text-align: center;
}

/* ── Dark mode ── */
:global(.dark-mode) .sp-panel {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
:global(.dark-mode) .sp-header { border-bottom-color: rgba(218, 165, 32, 0.15); }
:global(.dark-mode) .sp-label { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .sp-target { color: rgba(255, 248, 220, 0.9); }
:global(.dark-mode) .sp-log::-webkit-scrollbar-thumb { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .sp-log-entry.player {
  background: rgba(218, 165, 32, 0.08);
  border-left-color: rgba(218, 165, 32, 0.35);
  color: rgba(255, 215, 0, 0.8);
}
:global(.dark-mode) .sp-log-entry.ai {
  background: rgba(139, 69, 19, 0.1);
  border-left-color: rgba(139, 69, 19, 0.3);
  color: rgba(255, 248, 220, 0.75);
}
:global(.dark-mode) .sp-empty { color: rgba(218, 165, 32, 0.35); }
:global(.dark-mode) .sp-list-panel {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
:global(.dark-mode) .sp-list-header {
  border-bottom-color: rgba(218, 165, 32, 0.15);
  color: rgba(255, 248, 220, 0.9);
}
:global(.dark-mode) .sp-list-item:hover { background: rgba(218, 165, 32, 0.1); }
:global(.dark-mode) .sp-list-name { color: rgba(255, 248, 220, 0.85); }
:global(.dark-mode) .sp-list-loc { color: rgba(218, 165, 32, 0.45); }
:global(.dark-mode) .sp-btn {
  border-color: rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.15);
  color: rgba(255, 248, 220, 0.8);
}
:global(.dark-mode) .sp-btn:hover { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .sp-btn.primary {
  background: rgba(218, 165, 32, 0.2);
  border-color: rgba(218, 165, 32, 0.35);
  color: rgba(255, 248, 220, 0.95);
}
:global(.dark-mode) .sp-btn.primary:hover { background: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .sp-btn.danger { border-color: rgba(220, 80, 60, 0.3); color: rgba(255, 180, 160, 0.9); }
:global(.dark-mode) .sp-btn.danger:hover { background: rgba(180, 60, 40, 0.15); }
:global(.dark-mode) .sp-viewer-settings {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
}
:global(.dark-mode) .sp-viewer-header { color: rgba(255, 248, 220, 0.9); }
:global(.dark-mode) .sp-layer-control label { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .sp-layer-input {
  background: rgba(45, 30, 18, 0.6);
  border-color: rgba(218, 165, 32, 0.2);
  color: rgba(255, 248, 220, 0.9);
}
:global(.dark-mode) .sp-request-mode { color: rgba(218, 165, 32, 0.5); }

@media (max-width: 768px) {
  .sp-panel {
    right: 8px;
    top: 52px;
    width: calc(100vw - 24px);
    max-width: none;
    max-height: 50vh;
  }
  .sp-list-panel {
    width: calc(100vw - 32px);
    max-width: none;
  }
  .sp-list-item {
    min-height: 48px;
  }
  .sp-btn {
    min-height: 44px;
    padding: 8px 16px;
  }
  .sp-request-card {
    max-width: calc(100vw - 32px);
    padding: 20px;
  }
  .sp-request-actions .sp-btn {
    min-height: 48px;
    flex: 1;
  }
}
</style>
