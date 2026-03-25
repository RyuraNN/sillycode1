<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'
import {
  submitAction,
  skipAction,
  isConversationHost,
  allActionsReceived,
  clearActionWindow,
  startPhase1,
  enterTypingPhase,
  onTypingActivity,
} from '../utils/conversationMerge'
import { sendJoinConversation, sendLeaveConversation, sendTurnTyping } from '../utils/multiplayerWs'

const emit = defineEmits(['merge-ready'])

const mpStore = useMultiplayerStore()
const gameStore = useGameStore()

const actionInput = ref('')
const hasSubmitted = ref(false)

// ── 计算属性 ──
const isHost = computed(() => isConversationHost())
const isInGroup = computed(() => !!mpStore.conversationGroup)
const isPending = computed(() => mpStore.turnPending)
const timeLeft = computed(() => mpStore.turnTimeout)
const phase = computed(() => mpStore.actionPhase)
const typingNames = computed(() => Object.values(mpStore.typingPlayers || {}))

const groupMembers = computed(() => {
  if (!mpStore.conversationGroup) return []
  return mpStore.conversationGroup.memberIds
    .map(id => {
      const p = mpStore.players[id]
      return p ? { ...p, isSelf: id === mpStore.localPlayerId, isHost: id === mpStore.conversationGroup.hostPlayerId } : null
    })
    .filter(Boolean)
})

const receivedActions = computed(() => mpStore.pendingTurnActions)

const sameLocationPlayers = computed(() => mpStore.playersAtMyLocation)

// ── 当所有行动收集完毕时通知 host ──
watch(() => mpStore.pendingTurnActions.length, () => {
  if (isHost.value && isPending.value && allActionsReceived()) {
    clearActionWindow()
    emit('merge-ready')
  }
})

// ── 非 host: 收到 turn_pending 时启动阶段1 ──
watch(isPending, (newVal) => {
  if (newVal && !isHost.value) {
    hasSubmitted.value = false
    actionInput.value = ''
    startPhase1()
  } else if (newVal && isHost.value) {
    hasSubmitted.value = false
  }
})

// ── 非 host: 输入框内容变化时触发阶段切换 ──
watch(actionInput, (newVal) => {
  if (!newVal || hasSubmitted.value) return
  if (phase.value === 'phase1') {
    enterTypingPhase()
  } else if (phase.value === 'typing' || phase.value === 'warning') {
    onTypingActivity()
  }
})

// ── 非 host 提交行动 ──
function handleSubmit() {
  if (hasSubmitted.value) return
  hasSubmitted.value = true
  mpStore.actionPhase = 'submitted'
  sendTurnTyping(false)
  submitAction(actionInput.value)
  actionInput.value = ''
}

function handleSkip() {
  if (hasSubmitted.value) return
  hasSubmitted.value = true
  mpStore.actionPhase = 'submitted'
  sendTurnTyping(false)
  skipAction()
}

// ── 自动提交事件监听（10s 最终倒计时结束后触发） ──
function onAutoSubmit() {
  if (hasSubmitted.value) return
  if (actionInput.value.trim()) {
    handleSubmit()
  } else {
    handleSkip()
  }
}

// ── 加入/离开对话组 ──
function joinConversation(targetPlayerId) {
  sendJoinConversation(targetPlayerId)
}

function leaveConversation() {
  sendLeaveConversation()
}

onMounted(() => {
  window.addEventListener('mp:auto_submit_action', onAutoSubmit)
})

onUnmounted(() => {
  window.removeEventListener('mp:auto_submit_action', onAutoSubmit)
  clearActionWindow()
})
</script>

<template>
  <!-- 同地点玩家加入提示（未在对话组中） -->
  <div v-if="!isInGroup && sameLocationPlayers.length > 0" class="cm-join-prompt">
    <div class="cm-join-title">附近的玩家</div>
    <div v-for="p in sameLocationPlayers" :key="p.playerId" class="cm-join-item">
      <span class="cm-player-name">{{ p.playerName }}</span>
      <button class="cm-btn small" @click="joinConversation(p.playerId)">加入对话</button>
    </div>
  </div>

  <!-- 对话组面板（已在对话组中） -->
  <div v-if="isInGroup" class="cm-panel">
    <div class="cm-panel-header">
      <span class="cm-group-label">合并对话</span>
      <div class="cm-members">
        <span v-for="m in groupMembers" :key="m.playerId"
          class="cm-member-tag"
          :class="{ 'is-self': m.isSelf, 'is-host': m.isHost }">
          {{ m.playerName }}
          <span v-if="m.isHost" class="cm-host-dot">★</span>
        </span>
      </div>
      <button class="cm-btn danger small" @click="leaveConversation">退出</button>
    </div>

    <!-- 行动窗口（非 host 端） -->
    <div v-if="!isHost && isPending" class="cm-action-window">
      <!-- 阶段1: 10s 决定 -->
      <div v-if="phase === 'phase1'" class="cm-timer">
        <span class="cm-timer-label">等待你的行动</span>
        <span class="cm-timer-count" :class="{ 'urgent': timeLeft <= 3 }">{{ timeLeft }}s</span>
      </div>

      <!-- 阶段2: 输入中 -->
      <div v-if="phase === 'typing'" class="cm-timer">
        <span class="cm-timer-label">正在输入...</span>
        <span class="cm-timer-hint">无时间限制</span>
      </div>

      <!-- 阶段2: 30s无活动警告 + 10s倒计时 -->
      <div v-if="phase === 'warning'" class="cm-timer cm-warning-bar">
        <span class="cm-timer-label">长时间未输入，即将自动提交</span>
        <span class="cm-timer-count urgent">{{ timeLeft }}s</span>
      </div>

      <div v-if="!hasSubmitted" class="cm-action-input">
        <textarea
          v-model="actionInput"
          placeholder="输入你的行动..."
          rows="2"
          @keydown.enter.ctrl="handleSubmit"
        ></textarea>
        <div class="cm-action-btns">
          <button class="cm-btn primary" @click="handleSubmit" :disabled="!actionInput.trim()">提交行动</button>
          <button class="cm-btn" @click="handleSkip">跳过</button>
        </div>
      </div>
      <div v-else class="cm-submitted">
        <span>✓ 已提交行动，等待其他玩家...</span>
      </div>
    </div>

    <!-- 行动窗口（host 端：显示收集到的行动） -->
    <div v-if="isHost && isPending" class="cm-action-window">
      <div class="cm-timer">
        <span class="cm-timer-label">等待其他玩家行动</span>
        <span class="cm-timer-count" :class="{ 'urgent': timeLeft <= 3 }">{{ timeLeft }}s</span>
      </div>
      <div class="cm-collected-actions">
        <div v-for="(a, i) in receivedActions" :key="i" class="cm-action-item">
          <span class="cm-action-name">{{ a.playerName }}</span>
          <span class="cm-action-content">{{ a.isSkip ? '看着大家' : a.content }}</span>
        </div>
        <!-- 显示正在输入的玩家 -->
        <div v-for="name in typingNames" :key="name" class="cm-action-item cm-typing-indicator">
          <span class="cm-action-name">{{ name }}</span>
          <span class="cm-action-content cm-typing-dots">正在输入...</span>
        </div>
        <div v-if="receivedActions.length === 0 && typingNames.length === 0" class="cm-waiting-text">等待中...</div>
      </div>
    </div>

    <!-- 等待 AI 回复 -->
    <div v-if="isInGroup && !isPending && !isHost" class="cm-waiting-ai">
      <span>等待 AI 回复中...</span>
    </div>
  </div>
</template>

<style scoped>
/* Light mode — warm brown glass */
.cm-join-prompt {
  position: fixed;
  bottom: 80px;
  right: 16px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 200px;
  max-width: 280px;
  z-index: 7000;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(139, 69, 19, 0.06);
}

.cm-join-title {
  font-size: 0.8rem;
  color: #a1887f;
  margin-bottom: 8px;
}

.cm-join-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  min-height: 36px;
}

.cm-player-name {
  color: #5d4037;
  font-size: 0.9rem;
}

.cm-panel {
  position: fixed;
  bottom: 80px;
  right: 16px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 14px;
  padding: 0;
  width: 340px;
  max-width: 90vw;
  z-index: 7000;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(139, 69, 19, 0.08);
  overflow: hidden;
}

.cm-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  flex-wrap: wrap;
}

.cm-group-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #5d4037;
}

.cm-members {
  display: flex;
  gap: 4px;
  flex: 1;
  flex-wrap: wrap;
}

.cm-member-tag {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(139, 69, 19, 0.08);
  color: #8d6e63;
}

.cm-member-tag.is-self {
  background: rgba(25, 118, 210, 0.08);
  color: #1976d2;
}

.cm-member-tag.is-host {
  border: 1px solid rgba(218, 165, 32, 0.3);
}

.cm-host-dot {
  color: #b8860b;
  font-size: 0.65rem;
  margin-left: 2px;
}

.cm-action-window {
  padding: 14px;
}

.cm-timer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cm-timer-label {
  font-size: 0.82rem;
  color: #8d6e63;
}

.cm-timer-count {
  font-size: 1.1rem;
  font-weight: 600;
  color: #8b4513;
  font-variant-numeric: tabular-nums;
}

.cm-timer-count.urgent {
  color: #dc2626;
  animation: pulse 0.6s ease-in-out infinite alternate;
}

.cm-timer-hint {
  font-size: 0.75rem;
  color: #16a34a;
  font-weight: 500;
}

.cm-warning-bar {
  background: rgba(234, 179, 8, 0.08);
  border-radius: 8px;
  padding: 6px 10px;
}

.cm-typing-indicator {
  opacity: 0.7;
}

.cm-typing-dots {
  font-style: italic;
  animation: typing-blink 1.2s ease-in-out infinite;
}

@keyframes pulse {
  from { opacity: 0.6; }
  to { opacity: 1; }
}

@keyframes typing-blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.cm-action-input textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 8px;
  color: #3e2723;
  padding: 8px 10px;
  font-size: 16px;
  resize: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.cm-action-input textarea:focus {
  outline: none;
  border-color: rgba(139, 69, 19, 0.3);
}

.cm-action-btns {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.cm-btn {
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

.cm-btn:hover {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(139, 69, 19, 0.25);
}

.cm-btn.primary {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(139, 69, 19, 0.25);
  color: #4e342e;
}

.cm-btn.primary:hover {
  background: rgba(139, 69, 19, 0.2);
}

.cm-btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cm-btn.danger {
  border-color: rgba(239, 68, 68, 0.25);
  color: #dc2626;
}

.cm-btn.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

.cm-btn.small {
  padding: 4px 10px;
  min-height: 28px;
  font-size: 0.75rem;
}

.cm-submitted {
  text-align: center;
  padding: 12px 0;
  color: #16a34a;
  font-size: 0.88rem;
}

.cm-collected-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cm-action-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(139, 69, 19, 0.04);
  border-radius: 8px;
  font-size: 0.83rem;
}

.cm-action-name {
  color: #8b4513;
  font-weight: 500;
  flex-shrink: 0;
}

.cm-action-content {
  color: #5d4037;
}

.cm-waiting-text {
  text-align: center;
  padding: 10px 0;
  color: #bcaaa4;
  font-size: 0.85rem;
}

.cm-waiting-ai {
  padding: 14px;
  text-align: center;
  color: #a1887f;
  font-size: 0.85rem;
}

/* ── Dark mode ── */
:global(.dark-mode) .cm-join-prompt {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}
:global(.dark-mode) .cm-join-title { color: rgba(218, 165, 32, 0.55); }
:global(.dark-mode) .cm-player-name { color: rgba(255, 248, 220, 0.85); }
:global(.dark-mode) .cm-panel {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
:global(.dark-mode) .cm-panel-header { border-bottom-color: rgba(218, 165, 32, 0.15); }
:global(.dark-mode) .cm-group-label { color: rgba(255, 248, 220, 0.9); }
:global(.dark-mode) .cm-member-tag { background: rgba(139, 69, 19, 0.15); color: rgba(218, 165, 32, 0.7); }
:global(.dark-mode) .cm-member-tag.is-self { background: rgba(218, 165, 32, 0.12); color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .cm-member-tag.is-host { border-color: rgba(218, 165, 32, 0.35); }
:global(.dark-mode) .cm-host-dot { color: rgba(255, 215, 0, 0.8); }
:global(.dark-mode) .cm-timer-label { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .cm-timer-count { color: rgba(255, 215, 0, 0.85); }
:global(.dark-mode) .cm-timer-count.urgent { color: rgba(255, 180, 160, 0.9); }
:global(.dark-mode) .cm-timer-hint { color: rgba(140, 220, 140, 0.8); }
:global(.dark-mode) .cm-warning-bar { background: rgba(218, 165, 32, 0.1); }
:global(.dark-mode) .cm-typing-dots { color: rgba(218, 165, 32, 0.6); }
:global(.dark-mode) .cm-action-input textarea {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(218, 165, 32, 0.2);
  color: rgba(255, 248, 220, 0.9);
}
:global(.dark-mode) .cm-action-input textarea:focus { border-color: rgba(218, 165, 32, 0.45); }
:global(.dark-mode) .cm-btn {
  border-color: rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.15);
  color: rgba(255, 248, 220, 0.8);
}
:global(.dark-mode) .cm-btn:hover { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .cm-btn.primary {
  background: rgba(218, 165, 32, 0.2);
  border-color: rgba(218, 165, 32, 0.35);
  color: rgba(255, 248, 220, 0.95);
}
:global(.dark-mode) .cm-btn.primary:hover { background: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .cm-btn.danger { border-color: rgba(220, 80, 60, 0.3); color: rgba(255, 180, 160, 0.9); }
:global(.dark-mode) .cm-btn.danger:hover { background: rgba(180, 60, 40, 0.15); }
:global(.dark-mode) .cm-submitted { color: rgba(140, 220, 140, 0.85); }
:global(.dark-mode) .cm-action-item { background: rgba(139, 69, 19, 0.1); }
:global(.dark-mode) .cm-action-name { color: rgba(255, 215, 0, 0.8); }
:global(.dark-mode) .cm-action-content { color: rgba(255, 248, 220, 0.75); }
:global(.dark-mode) .cm-waiting-text { color: rgba(218, 165, 32, 0.35); }
:global(.dark-mode) .cm-waiting-ai { color: rgba(218, 165, 32, 0.5); }

@media (max-width: 768px) {
  .cm-join-prompt {
    right: 8px;
    bottom: 72px;
    max-width: calc(100vw - 24px);
  }
  .cm-panel {
    right: 8px;
    bottom: 72px;
    width: calc(100vw - 24px);
    max-width: none;
  }
  .cm-btn {
    min-height: 44px;
    padding: 8px 14px;
  }
  .cm-action-input textarea {
    font-size: 16px;
    padding: 10px 12px;
  }
  .cm-join-item {
    min-height: 44px;
  }
}
</style>
