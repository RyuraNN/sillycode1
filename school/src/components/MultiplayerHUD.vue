<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendAfkExtend, sendSpectateStop } from '../utils/multiplayerWs'

const mpStore = useMultiplayerStore()

const emit = defineEmits(['open-lobby', 'open-chat'])

const wbMismatchSelf = ref(false)
const wbMismatchAlerts = ref([])
const toasts = ref([])
let toastId = 0
const hudPulse = ref(false)
let pulseTimer = null

function triggerHudPulse() {
  hudPulse.value = false
  void document.body?.offsetHeight // force reflow
  hudPulse.value = true
  clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => { hudPulse.value = false }, 600)
}

function onNewMessage() {
  triggerHudPulse()
}

function onToast(e) {
  const { text, type } = e.detail || {}
  if (!text) return
  const id = ++toastId
  toasts.value.push({ id, text, type: type || 'info' })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

function onWbMismatch() {
  wbMismatchSelf.value = true
  setTimeout(() => { wbMismatchSelf.value = false }, 15000)
}

function onWbAlert(e) {
  const { playerName } = e.detail || {}
  if (playerName) {
    wbMismatchAlerts.value.push(playerName)
    setTimeout(() => {
      wbMismatchAlerts.value = wbMismatchAlerts.value.filter(n => n !== playerName)
    }, 15000)
  }
}

onMounted(() => {
  window.addEventListener('mp:worldbook_mismatch', onWbMismatch)
  window.addEventListener('mp:worldbook_alert', onWbAlert)
  window.addEventListener('mp:toast', onToast)
  window.addEventListener('mp:new_message', onNewMessage)
})

onUnmounted(() => {
  window.removeEventListener('mp:worldbook_mismatch', onWbMismatch)
  window.removeEventListener('mp:worldbook_alert', onWbAlert)
  window.removeEventListener('mp:toast', onToast)
  window.removeEventListener('mp:new_message', onNewMessage)
  clearTimeout(pulseTimer)
})

const onlinePlayers = computed(() => mpStore.playerList)

const sameLocationPlayers = computed(() => mpStore.playersAtMyLocation)

function getPlayerFeatures(playerId) {
  const p = mpStore.players[playerId]
  return p?.features || null
}

function getPlayerTrust(playerId) {
  const p = mpStore.players[playerId]
  return p?.trustLevel || 'anonymous'
}

const showPlayerList = ref(false)

function openLobby() {
  emit('open-lobby')
}

function togglePlayerList() {
  showPlayerList.value = !showPlayerList.value
}

function openChat() {
  mpStore.showChat = !mpStore.showChat
  if (mpStore.showChat) {
    mpStore.unreadCount = 0
  }
  emit('open-chat')
}

function handleAfkExtend() {
  sendAfkExtend()
}

const spectateTargetName = computed(() => {
  if (!mpStore.isSpectating || !mpStore.spectateTarget) return null
  const p = mpStore.players[mpStore.spectateTarget]
  return p?.playerName || mpStore.spectateTarget
})

const spectateModeLabel = computed(() => {
  if (mpStore.spectateMode === 'spectator_only') return '观战中'
  if (mpStore.spectateMode === 'time_gap') return '时间差观战'
  return '观战中'
})

function stopSpectating() {
  sendSpectateStop()
  mpStore.isSpectating = false
  mpStore.spectateTarget = null
  mpStore.spectateLog = []
  mpStore.spectateMode = null
}
</script>

<template>
  <div class="mp-hud" v-if="mpStore.isMultiplayerActive">
    <!-- 房间信息条 -->
    <div class="mp-hud-bar" :class="{ 'hud-pulse': hudPulse }">
      <div class="hud-room" @click="togglePlayerList">
        <span class="hud-room-id">{{ mpStore.roomId }}</span>
        <span class="hud-dot" :class="{ connected: mpStore.isConnected }"></span>
        <span class="hud-count">{{ mpStore.playerCount }}</span>
      </div>

      <!-- 聊天按钮 -->
      <button class="hud-chat-btn" @click="openChat">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2.678 11.894a1 1 0 0 1 .287.801 10.97 10.97 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8.06 8.06 0 0 0 8 14c3.996 0 7-2.807 7-6 0-3.192-3.004-6-7-6S1 4.808 1 8c0 1.468.617 2.83 1.678 3.894zm-.493 3.905a21.682 21.682 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a9.68 9.68 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9.06 9.06 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105z"/>
        </svg>
        <span v-if="mpStore.unreadCount > 0" class="hud-unread">{{ mpStore.unreadCount > 99 ? '99+' : mpStore.unreadCount }}</span>
      </button>
    </div>

    <!-- 玩家列表下拉 -->
    <div v-if="showPlayerList" class="hud-player-dropdown" @click.stop>
      <div class="hud-dropdown-header">
        <span>房间成员 ({{ mpStore.playerCount }})</span>
        <button class="hud-dropdown-close" @click="showPlayerList = false">&times;</button>
      </div>
      <div v-for="p in mpStore.playerList" :key="p.playerId" class="hud-dropdown-item" :class="{ 'is-self': p.playerId === mpStore.localPlayerId }">
        <span class="trust-icon" :class="'trust-' + getPlayerTrust(p.playerId)">
          {{ { verified: '🟢', member: '🟡', logged_in: '⚪', anonymous: '⚫' }[getPlayerTrust(p.playerId)] }}
        </span>
        <span class="hud-dropdown-name">{{ p.playerName }}</span>
        <span class="hud-dropdown-role">{{ p.role === 'teacher' ? '教师' : '学生' }}</span>
      </div>
    </div>

    <!-- 同地点玩家提示 -->
    <div v-if="sameLocationPlayers.length > 0" class="hud-location-players">
      <span class="loc-label">同地点:</span>
      <span v-for="p in sameLocationPlayers" :key="p.playerId" class="loc-player">
        <span class="trust-icon" :class="'trust-' + getPlayerTrust(p.playerId)"
              :title="{ verified: '已验证', member: '服务器成员', logged_in: '已登录', anonymous: '匿名' }[getPlayerTrust(p.playerId)]">
          {{ { verified: '🟢', member: '🟡', logged_in: '⚪', anonymous: '⚫' }[getPlayerTrust(p.playerId)] }}
        </span>
        {{ p.playerName }}
        <span class="player-features-inline">
          <span v-if="getPlayerFeatures(p.playerId)?.assistantAI" class="feat-dot feat-ai" title="变量辅助AI">AI</span>
          <span v-if="getPlayerFeatures(p.playerId)?.rag" class="feat-dot feat-rag" title="RAG记忆系统">R</span>
          <span v-if="getPlayerFeatures(p.playerId)?.summary" class="feat-dot feat-sum" title="总结系统">S</span>
        </span>
      </span>
    </div>

    <!-- 观战指示器 -->
    <div v-if="mpStore.isSpectating" class="hud-spectate-bar">
      <span class="spectate-icon">👁️</span>
      <span class="spectate-mode-tag">{{ spectateModeLabel }}</span>
      <span class="spectate-text">正在观看 <strong>{{ spectateTargetName }}</strong></span>
      <button class="spectate-exit-btn" @click="stopSpectating">退出观战</button>
    </div>

    <!-- 房主断线警告 -->
    <div v-if="mpStore.hostDisconnected" class="hud-warning">
      房主已断线，等待重连中...
    </div>

    <!-- 投票 -->
    <div v-if="mpStore.activeVote && !mpStore.activeVote.myVote" class="hud-vote">
      <div class="vote-title">
        {{ mpStore.activeVote.type === 'host_disconnect' ? '房主断线，请投票：' : '投票进行中' }}
      </div>
      <div class="vote-options">
        <button v-for="opt in mpStore.activeVote.options" :key="opt"
          class="vote-btn" @click="$emit('vote', opt)">
          {{ opt === 'new_host' ? '选举新房主' : opt === 'single_player' ? '转为单人' : opt }}
        </button>
      </div>
    </div>

    <!-- 投票结果 -->
    <div v-if="mpStore.activeVote?.result" class="hud-vote-result">
      投票结果: {{ mpStore.activeVote.result === 'new_host' ? '选举新房主' : '转为单人模式' }}
      <span v-if="mpStore.isHost" class="new-host-tag">你是新房主</span>
    </div>

    <!-- 时间同步警告 -->
    <div v-if="mpStore.timeWarning" class="hud-time-warning">
      你的游戏时间比基准快了 {{ mpStore.timeWarning.diff }} 分钟
    </div>

    <!-- 申请延时按钮（回合进行中且未完成时显示） -->
    <div v-if="mpStore.roundStatus === 'in_progress' && !mpStore.turnPending" class="hud-afk-extend">
      <button class="hud-extend-btn" @click="handleAfkExtend">申请延时 (+2分钟)</button>
    </div>

    <!-- 世界书不匹配警告（自己） -->
    <div v-if="wbMismatchSelf" class="hud-wb-mismatch">
      ⚠️ 你的世界书与房间不一致，请重新同步
    </div>

    <!-- 世界书不匹配警告（房主收到） -->
    <div v-for="name in wbMismatchAlerts" :key="name" class="hud-wb-alert">
      ⚠️ {{ name }} 的世界书与房间不一致
    </div>

    <!-- Toast 通知 -->
    <div v-for="t in toasts" :key="t.id" class="hud-toast" :class="'hud-toast-' + t.type">
      {{ t.text }}
    </div>
  </div>
</template>

<style scoped>
.mp-hud {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.mp-hud > * {
  pointer-events: auto;
}

/* Light mode — warm brown glass */
.mp-hud-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 253, 245, 0.50);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 20px;
  padding: 5px 14px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(139, 69, 19, 0.08);
}

.hud-room {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
  min-height: 32px;
}
.hud-room:hover { opacity: 0.8; }

.hud-room-id {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: #8b4513;
  letter-spacing: 1px;
}

.hud-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(200, 60, 60, 0.8);
  transition: background 0.3s;
}
.hud-dot.connected {
  background: rgba(34, 197, 94, 0.9);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.hud-count {
  font-size: 0.8rem;
  color: #8d6e63;
}
.hud-count::before {
  content: '';
  display: inline-block;
  width: 1px;
  height: 14px;
  background: rgba(139, 69, 19, 0.15);
  vertical-align: middle;
  margin-right: 8px;
}

/* ── 玩家列表下拉 ── */
.hud-player-dropdown {
  background: rgba(255, 253, 245, 0.85);
  border: 1px solid rgba(139, 69, 19, 0.15);
  border-radius: 12px;
  padding: 8px 0;
  min-width: 200px;
  max-width: 280px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(139, 69, 19, 0.1);
}

.hud-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px 8px;
  font-size: 0.78rem;
  color: #8d6e63;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
}

.hud-dropdown-close {
  background: none;
  border: none;
  color: #8d6e63;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 4px;
  line-height: 1;
}

.hud-dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 0.8rem;
  color: #5d4037;
}

.hud-dropdown-item.is-self {
  background: rgba(218, 165, 32, 0.08);
}

.hud-dropdown-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hud-dropdown-role {
  font-size: 0.7rem;
  color: #a1887f;
  flex-shrink: 0;
}

.hud-chat-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #8d6e63;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  transition: all 0.2s;
  position: relative;
  min-width: 32px;
  min-height: 32px;
  justify-content: center;
}
.hud-chat-btn:hover {
  color: #5d4037;
  background: rgba(139, 69, 19, 0.08);
}

/* ── 新消息脉冲动画 ── */
.hud-pulse {
  animation: hud-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes hud-bounce {
  0% { transform: scale(1); box-shadow: 0 2px 12px rgba(139, 69, 19, 0.08); }
  20% { transform: scale(1.08); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4), 0 2px 12px rgba(139, 69, 19, 0.08); }
  50% { transform: scale(0.97); box-shadow: 0 0 0 6px rgba(59, 130, 246, 0), 0 2px 12px rgba(139, 69, 19, 0.08); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0), 0 2px 12px rgba(139, 69, 19, 0.08); }
}

.hud-unread {
  position: absolute;
  top: -4px;
  right: -6px;
  background: #ef4444;
  color: white;
  font-size: 0.6rem;
  padding: 0 5px;
  border-radius: 8px;
  line-height: 1.4;
}

.hud-location-players {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 253, 245, 0.50);
  border: 1px solid rgba(139, 69, 19, 0.10);
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 0.75rem;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.loc-label {
  color: #a1887f;
}

.loc-player {
  color: #5d4037;
}

.loc-player + .loc-player::before {
  content: '\3001';
  color: #bcaaa4;
}

.trust-icon {
  font-size: 0.6rem;
  vertical-align: middle;
  margin-right: 1px;
}

.player-features-inline {
  display: inline-flex;
  gap: 2px;
  margin-left: 2px;
  vertical-align: middle;
}

.feat-dot {
  display: inline-block;
  font-size: 0.55rem;
  font-weight: 700;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 3px;
  vertical-align: middle;
}

.feat-ai { background: rgba(139, 92, 246, 0.2); color: #7c3aed; }
.feat-rag { background: rgba(59, 130, 246, 0.2); color: #2563eb; }
.feat-sum { background: rgba(245, 158, 11, 0.2); color: #d97706; }

/* ── 观战指示器 ── */
.hud-spectate-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 12px;
  padding: 6px 14px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: spectate-in 0.3s ease-out;
}

.spectate-icon {
  font-size: 0.85rem;
}

.spectate-mode-tag {
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
  font-weight: 500;
  white-space: nowrap;
}

.spectate-text {
  font-size: 0.8rem;
  color: #6d28d9;
}

.spectate-text strong {
  font-weight: 600;
}

.spectate-exit-btn {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: 4px;
}

.spectate-exit-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
}

@keyframes spectate-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.hud-warning {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: #dc2626;
  animation: pulse-warn 2s ease-in-out infinite;
}

@keyframes pulse-warn {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.hud-vote {
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(218, 165, 32, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  text-align: center;
  min-width: 240px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.vote-title {
  font-size: 0.85rem;
  color: #b8860b;
  margin-bottom: 10px;
}

.vote-options {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.vote-btn {
  padding: 8px 18px;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(139, 69, 19, 0.2);
  background: rgba(139, 69, 19, 0.08);
  color: #5d4037;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}
.vote-btn:hover {
  background: rgba(139, 69, 19, 0.15);
  border-color: rgba(139, 69, 19, 0.3);
}

.hud-vote-result {
  background: rgba(255, 253, 245, 0.50);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 0.8rem;
  color: #16a34a;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.new-host-tag {
  background: rgba(218, 165, 32, 0.15);
  color: #b8860b;
  padding: 1px 8px;
  border-radius: 8px;
  margin-left: 8px;
  font-size: 0.75rem;
}

.hud-time-warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 10px;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: #d97706;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.hud-wb-mismatch {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: #dc2626;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: pulse-warn 2s ease-in-out infinite;
}

.hud-wb-alert {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 10px;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: #d97706;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.hud-afk-extend {
  text-align: center;
}

.hud-extend-btn {
  padding: 4px 14px;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.hud-extend-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
}

.hud-toast {
  padding: 6px 16px;
  border-radius: 10px;
  font-size: 0.8rem;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: toast-in 0.3s ease-out;
}

.hud-toast-info {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

.hud-toast-warn {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #d97706;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Dark mode ── */
:global(.dark-mode) .mp-hud-bar {
  background: rgba(30, 20, 12, 0.7);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
}
:global(.dark-mode) .hud-room-id { color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .hud-count { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .hud-count::before { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .hud-chat-btn { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .hud-chat-btn:hover { color: rgba(255, 248, 220, 0.9); background: rgba(218, 165, 32, 0.12); }
:global(.dark-mode) .hud-player-dropdown {
  background: rgba(30, 20, 12, 0.85);
  border-color: rgba(218, 165, 32, 0.2);
}
:global(.dark-mode) .hud-dropdown-header { color: rgba(218, 165, 32, 0.6); border-bottom-color: rgba(218, 165, 32, 0.1); }
:global(.dark-mode) .hud-dropdown-close { color: rgba(218, 165, 32, 0.5); }
:global(.dark-mode) .hud-dropdown-item { color: rgba(255, 248, 220, 0.85); }
:global(.dark-mode) .hud-dropdown-item.is-self { background: rgba(218, 165, 32, 0.1); }
:global(.dark-mode) .hud-dropdown-role { color: rgba(218, 165, 32, 0.5); }
:global(.dark-mode) .hud-location-players {
  background: rgba(30, 20, 12, 0.7);
  border-color: rgba(218, 165, 32, 0.15);
}
:global(.dark-mode) .loc-label { color: rgba(218, 165, 32, 0.55); }
:global(.dark-mode) .loc-player { color: rgba(255, 248, 220, 0.85); }
:global(.dark-mode) .loc-player + .loc-player::before { color: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .feat-ai { background: rgba(218, 165, 32, 0.2); color: rgba(255, 215, 0, 0.8); }
:global(.dark-mode) .feat-rag { background: rgba(139, 69, 19, 0.25); color: rgba(218, 165, 32, 0.8); }
:global(.dark-mode) .feat-sum { background: rgba(184, 134, 11, 0.2); color: rgba(255, 200, 100, 0.8); }
:global(.dark-mode) .hud-spectate-bar {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
}
:global(.dark-mode) .spectate-mode-tag { background: rgba(139, 92, 246, 0.25); color: rgba(196, 167, 255, 0.9); }
:global(.dark-mode) .spectate-text { color: rgba(196, 167, 255, 0.9); }
:global(.dark-mode) .spectate-exit-btn {
  background: rgba(180, 60, 40, 0.12);
  border-color: rgba(220, 80, 60, 0.3);
  color: rgba(255, 180, 160, 0.9);
}
:global(.dark-mode) .spectate-exit-btn:hover { background: rgba(180, 60, 40, 0.2); }
:global(.dark-mode) .hud-warning {
  background: rgba(180, 60, 40, 0.15);
  border-color: rgba(220, 80, 60, 0.3);
  color: rgba(255, 180, 160, 0.9);
}
:global(.dark-mode) .hud-vote {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.3);
}
:global(.dark-mode) .vote-title { color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .vote-btn {
  border-color: rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.15);
  color: rgba(255, 248, 220, 0.85);
}
:global(.dark-mode) .vote-btn:hover { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .hud-vote-result {
  background: rgba(30, 20, 12, 0.7);
  border-color: rgba(100, 180, 100, 0.3);
  color: rgba(140, 220, 140, 0.85);
}
:global(.dark-mode) .new-host-tag { background: rgba(218, 165, 32, 0.15); color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .hud-time-warning {
  background: rgba(218, 165, 32, 0.12);
  border-color: rgba(218, 165, 32, 0.25);
  color: rgba(255, 215, 0, 0.85);
}
:global(.dark-mode) .hud-wb-mismatch {
  background: rgba(180, 60, 40, 0.15);
  border-color: rgba(220, 80, 60, 0.3);
  color: rgba(255, 180, 160, 0.9);
}
:global(.dark-mode) .hud-wb-alert {
  background: rgba(218, 165, 32, 0.12);
  border-color: rgba(218, 165, 32, 0.25);
  color: rgba(255, 215, 0, 0.85);
}
:global(.dark-mode) .hud-extend-btn {
  background: rgba(218, 165, 32, 0.1);
  border-color: rgba(218, 165, 32, 0.25);
  color: rgba(255, 215, 0, 0.75);
}
:global(.dark-mode) .hud-extend-btn:hover {
  background: rgba(218, 165, 32, 0.2);
  border-color: rgba(218, 165, 32, 0.4);
}
:global(.dark-mode) .hud-toast-info {
  background: rgba(218, 165, 32, 0.12);
  border-color: rgba(218, 165, 32, 0.25);
  color: rgba(255, 215, 0, 0.8);
}
:global(.dark-mode) .hud-toast-warn {
  background: rgba(218, 165, 32, 0.15);
  border-color: rgba(218, 165, 32, 0.3);
  color: rgba(255, 215, 0, 0.9);
}

@media (max-width: 768px) {
  .mp-hud {
    top: 8px;
    max-width: calc(100vw - 24px);
  }
  .mp-hud-bar {
    padding: 4px 10px;
    gap: 6px;
  }
  .hud-chat-btn {
    min-width: 44px;
    min-height: 44px;
  }
  .vote-btn {
    min-height: 44px;
    padding: 8px 14px;
  }
  .hud-vote {
    min-width: 200px;
    max-width: calc(100vw - 32px);
  }
}
</style>
