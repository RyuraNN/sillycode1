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
const convFolded = ref(false)
const turnFolded = ref(false)
const roomIdCopied = ref(false)

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

const MAX_TOASTS = 5

function onToast(e) {
  const { text, type } = e.detail || {}
  if (!text) return
  const id = ++toastId
  toasts.value.push({ id, text, type: type || 'info', leaving: false })
  if (toasts.value.length > MAX_TOASTS) {
    toasts.value = toasts.value.slice(-MAX_TOASTS)
  }
  setTimeout(() => {
    const t = toasts.value.find(t => t.id === id)
    if (t) t.leaving = true
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 300)
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

function onDocumentClick(e) {
  if (showPlayerList.value) {
    const dropdown = document.querySelector('.hud-player-dropdown')
    const trigger = document.querySelector('.hud-room')
    if (dropdown && !dropdown.contains(e.target) && trigger && !trigger.contains(e.target)) {
      showPlayerList.value = false
    }
  }
}

onMounted(() => {
  window.addEventListener('mp:worldbook_mismatch', onWbMismatch)
  window.addEventListener('mp:worldbook_alert', onWbAlert)
  window.addEventListener('mp:toast', onToast)
  window.addEventListener('mp:new_message', onNewMessage)
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  window.removeEventListener('mp:worldbook_mismatch', onWbMismatch)
  window.removeEventListener('mp:worldbook_alert', onWbAlert)
  window.removeEventListener('mp:toast', onToast)
  window.removeEventListener('mp:new_message', onNewMessage)
  document.removeEventListener('click', onDocumentClick, true)
  clearTimeout(pulseTimer)
})


const sameLocationPlayers = computed(() => mpStore.playersAtMyLocation)

const roomDifficultyInfo = computed(() => {
  const difficultyMap = {
    easy: { label: '简单', multiplier: 2 },
    normal: { label: '普通', multiplier: 1 },
    hard: { label: '困难', multiplier: 0.75 },
  }
  const key = mpStore.roomSettings?.difficulty || 'normal'
  const base = difficultyMap[key] || difficultyMap.normal
  const rawMultiplier = Number(mpStore.roomSettings?.expMultiplier)
  const multiplier = Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : base.multiplier
  const multiplierText = Number.isInteger(multiplier)
    ? String(multiplier)
    : String(multiplier).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')

  return {
    label: base.label,
    multiplierText,
    shortLabel: `${base.label}×${multiplierText}`,
    title: `当前房间经验难度：${base.label}（经验倍率×${multiplierText}）`
  }
})

function getResolvedPlayerName(player) {
  if (!player) return ''
  const full = player.playerId ? mpStore.players[player.playerId] : null
  const merged = full ? { ...player, ...full } : player
  return merged.characterName || merged.playerName || merged.playerId || ''
}

const turnProgressEntries = computed(() => {
  return Object.entries(mpStore.turnProgressPlayers || {}).map(([playerId, status]) => ({
    playerId,
    playerName: getResolvedPlayerName(mpStore.players[playerId]) || playerId,
    status,
  }))
})

const otherPendingTurnPlayers = computed(() => {
  return turnProgressEntries.value.filter(player => player.status === 'pending' && player.playerId !== mpStore.localPlayerId)
})

const completedTurnPlayers = computed(() => {
  return turnProgressEntries.value.filter(player => player.status === 'completed' || player.status === 'afk')
})

const afkTurnPlayers = computed(() => {
  return turnProgressEntries.value.filter(player => player.status === 'afk')
})

const showTurnProgress = computed(() => mpStore.turnTotalCount > 0)

const turnProgressPercent = computed(() => {
  if (!mpStore.turnTotalCount) return 0
  return Math.round((mpStore.turnCompletedCount / mpStore.turnTotalCount) * 100)
})

const turnProgressTone = computed(() => {
  if (!showTurnProgress.value) return 'idle'
  if (mpStore.roundStatus === 'waiting') return 'waiting'
  if (mpStore.turnPendingCount === 0) return 'done'
  return 'active'
})

const turnProgressTitle = computed(() => {
  if (!showTurnProgress.value) return ''
  if (mpStore.roundStatus === 'waiting') return '你已完成本轮，等待其他玩家'
  if (mpStore.roundStatus === 'in_progress') return '本轮进行中'
  return '回合同步中'
})

function formatTurnPlayerNames(players) {
  const names = players.map(player => player.playerName)
  if (names.length <= 3) return names.join('、')
  return `${names.slice(0, 3).join('、')} 等${names.length}人`
}

const turnProgressHint = computed(() => {
  if (!showTurnProgress.value) return ''
  if (otherPendingTurnPlayers.value.length > 0) {
    return `待完成：${formatTurnPlayerNames(otherPendingTurnPlayers.value)}`
  }
  if (mpStore.turnPendingCount > 0) {
    return '待完成：你'
  }
  if (afkTurnPlayers.value.length > 0) {
    return `AFK：${formatTurnPlayerNames(afkTurnPlayers.value)}`
  }
  return '所有玩家已完成，等待回合推进'
})

const turnProgressCompletedHint = computed(() => {
  if (!completedTurnPlayers.value.length) return ''
  return `已完成：${formatTurnPlayerNames(completedTurnPlayers.value)}`
})

const isInConversationGroup = computed(() => !!mpStore.conversationGroup)

const isConversationHost = computed(() => {
  const group = mpStore.conversationGroup
  return !!group && group.hostPlayerId === mpStore.localPlayerId
})

const conversationMembers = computed(() => {
  if (!mpStore.conversationGroup) return []
  return mpStore.conversationGroup.memberIds
    .map(playerId => ({
      playerId,
      playerName: getResolvedPlayerName(mpStore.players[playerId]) || playerId,
      isHost: mpStore.conversationGroup?.hostPlayerId === playerId,
    }))
})

const conversationTypingNames = computed(() => Object.values(mpStore.typingPlayers || {}))

const conversationStatusTone = computed(() => {
  if (!isInConversationGroup.value) return 'idle'
  if (mpStore.turnPending) {
    if (!isConversationHost.value && mpStore.actionPhase === 'warning') return 'warn'
    if (!isConversationHost.value && mpStore.actionPhase === 'submitted') return 'waiting'
    return 'active'
  }
  return isConversationHost.value ? 'idle' : 'waiting'
})

const conversationStatusTitle = computed(() => {
  if (!isInConversationGroup.value) return ''
  if (mpStore.turnPending) {
    if (isConversationHost.value) {
      if (conversationTypingNames.value.length > 0) return '成员输入中'
      if (mpStore.pendingTurnActions.length > 0) return '收集中'
      return '等待成员行动'
    }
    if (mpStore.actionPhase === 'submitted') return '等待其他玩家'
    if (mpStore.actionPhase === 'typing') return '你正在输入'
    if (mpStore.actionPhase === 'warning') return '即将自动提交'
    return '轮到你行动'
  }
  return isConversationHost.value ? '等待下一轮' : '等待 AI 回复'
})

const conversationStatusDetail = computed(() => {
  if (!isInConversationGroup.value) return ''
  const memberNames = conversationMembers.value.map(member => member.playerName)
  const memberText = memberNames.length > 0 ? `成员：${formatTurnPlayerNames(conversationMembers.value)}` : ''

  if (mpStore.turnPending && isConversationHost.value) {
    const targetCount = Math.max(0, conversationMembers.value.length - 1)
    return `${memberText}${memberText ? ' · ' : ''}已收 ${mpStore.pendingTurnActions.length}/${targetCount}`
  }

  if (!mpStore.turnPending && !isConversationHost.value) {
    const hostName = getResolvedPlayerName(mpStore.players[mpStore.conversationGroup?.hostPlayerId || '']) || '组内主持者'
    return `${memberText}${memberText ? ' · ' : ''}当前由 ${hostName} 继续推进`
  }

  return memberText
})

const conversationTypingHint = computed(() => {
  if (conversationTypingNames.value.length === 0) return ''
  return `输入中：${conversationTypingNames.value.join('、')}`
})

function getConversationPlayerTag(playerId) {
  const group = mpStore.conversationGroup
  if (!group || !group.memberIds.includes(playerId)) return ''
  return group.hostPlayerId === playerId ? '组Host' : '组内'
}

function getPlayerFeatures(playerId) {
  const p = mpStore.players[playerId]
  return p?.features || null
}

function getPlayerTrust(playerId) {
  const p = mpStore.players[playerId]
  return p?.trustLevel || 'anonymous'
}

function getTurnPlayerState(playerId) {
  return mpStore.turnProgressPlayers[playerId] || null
}

function getTurnPlayerLabel(playerId) {
  const state = getTurnPlayerState(playerId)
  if (state === 'completed') return '已完成'
  if (state === 'afk') return 'AFK'
  if (state === 'pending') return '行动中'
  return ''
}

const showPlayerList = ref(false)

function openLobby() {
  emit('open-lobby')
}

function togglePlayerList() {
  showPlayerList.value = !showPlayerList.value
}

async function copyRoomId() {
  try {
    await navigator.clipboard.writeText(mpStore.roomId || '')
    roomIdCopied.value = true
    setTimeout(() => { roomIdCopied.value = false }, 1500)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = mpStore.roomId || ''
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    roomIdCopied.value = true
    setTimeout(() => { roomIdCopied.value = false }, 1500)
  }
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
  return getResolvedPlayerName(p) || mpStore.spectateTarget
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
        <span class="hud-difficulty" :title="roomDifficultyInfo.title">EXP {{ roomDifficultyInfo.shortLabel }}</span>
      </div>
      <button class="hud-copy-btn" @click.stop="copyRoomId" title="复制房间号">
        <svg v-if="!roomIdCopied" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
        <span v-else class="hud-copied-tick">✓</span>
      </button>

      <!-- AFK 自身提示 -->
      <span v-if="mpStore.isAfk" class="hud-afk-badge">AFK</span>

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
        <span class="hud-dropdown-name">{{ getResolvedPlayerName(p) }}</span>
        <span v-if="getConversationPlayerTag(p.playerId)" class="hud-group-tag" :class="{ 'is-host': getConversationPlayerTag(p.playerId) === '组Host' }">{{ getConversationPlayerTag(p.playerId) }}</span>
        <span v-if="mpStore.afkPlayers[p.playerId]" class="hud-afk-tag">AFK</span>
        <span v-if="getTurnPlayerState(p.playerId)" class="hud-turn-tag" :class="`is-${getTurnPlayerState(p.playerId)}`">{{ getTurnPlayerLabel(p.playerId) }}</span>
        <span class="hud-dropdown-role">{{ p.role === 'teacher' ? '教师' : '学生' }}</span>
      </div>
    </div>

    <!-- 同地点玩家提示 -->
    <div v-if="sameLocationPlayers.length > 0" class="hud-location-players hud-loc-wrap">
      <span class="loc-label">同地点:</span>
      <span v-for="p in sameLocationPlayers" :key="p.playerId" class="loc-player">
        <span class="trust-icon" :class="'trust-' + getPlayerTrust(p.playerId)"
              :title="{ verified: '已验证', member: '服务器成员', logged_in: '已登录', anonymous: '匿名' }[getPlayerTrust(p.playerId)]">
          {{ { verified: '🟢', member: '🟡', logged_in: '⚪', anonymous: '⚫' }[getPlayerTrust(p.playerId)] }}
        </span>
        {{ getResolvedPlayerName(p) }}
        <span class="player-features-inline">
          <span v-if="getPlayerFeatures(p.playerId)?.assistantAI" class="feat-dot feat-ai" title="变量辅助AI">AI</span>
          <span v-if="getPlayerFeatures(p.playerId)?.rag" class="feat-dot feat-rag" title="RAG记忆系统">R</span>
          <span v-if="getPlayerFeatures(p.playerId)?.summary" class="feat-dot feat-sum" title="总结系统">S</span>
        </span>
        <span v-if="getConversationPlayerTag(p.playerId)" class="loc-group-tag" :class="{ 'is-host': getConversationPlayerTag(p.playerId) === '组Host' }">{{ getConversationPlayerTag(p.playerId) }}</span>
        <span v-if="getTurnPlayerState(p.playerId)" class="loc-turn-tag" :class="`is-${getTurnPlayerState(p.playerId)}`">
          {{ getTurnPlayerLabel(p.playerId) }}
        </span>
      </span>
    </div>

    <!-- 对话组状态 -->
    <div v-if="isInConversationGroup" class="hud-conversation hud-card-strip strip-conv" :class="`is-${conversationStatusTone}`">
      <div class="hud-conv-row">
        <span class="hud-conv-title">合并对话</span>
        <span class="hud-conv-pill">{{ conversationStatusTitle }}</span>
        <button class="hud-fold-btn" @click="convFolded = !convFolded">{{ convFolded ? '▸' : '▾' }}</button>
      </div>
      <template v-if="!convFolded">
        <div v-if="conversationStatusDetail" class="hud-conv-row hud-conv-meta">
          <span class="hud-conv-text">{{ conversationStatusDetail }}</span>
        </div>
        <div v-if="conversationTypingHint" class="hud-conv-row hud-conv-meta">
          <span class="hud-conv-text">{{ conversationTypingHint }}</span>
        </div>
      </template>
    </div>

    <!-- 全局回合状态 -->
    <div v-if="showTurnProgress" class="hud-turn-progress hud-card-strip strip-turn" :class="`is-${turnProgressTone}`">
      <div class="hud-turn-row">
        <span class="hud-turn-title">房间回合</span>
        <span class="hud-turn-pill">{{ turnProgressTitle }}</span>
        <button class="hud-fold-btn" @click="turnFolded = !turnFolded">{{ turnFolded ? '▸' : '▾' }}</button>
      </div>
      <div class="hud-progress-bar-wrap">
        <div class="hud-progress-bar" :style="{ width: turnProgressPercent + '%' }" :class="`is-${turnProgressTone}`"></div>
      </div>
      <template v-if="!turnFolded">
        <div class="hud-turn-row hud-turn-meta">
          <span class="hud-turn-text">已完成 {{ mpStore.turnCompletedCount }}/{{ mpStore.turnTotalCount }}</span>
          <span v-if="mpStore.roundNumber > 0" class="hud-turn-text">第 {{ mpStore.roundNumber }} 轮</span>
        </div>
        <div class="hud-turn-row hud-turn-meta">
          <span class="hud-turn-text">{{ turnProgressHint }}</span>
        </div>
        <div v-if="turnProgressCompletedHint" class="hud-turn-row hud-turn-meta">
          <span class="hud-turn-text">{{ turnProgressCompletedHint }}</span>
        </div>
      </template>
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
    <div v-for="t in toasts" :key="t.id" class="hud-toast" :class="['hud-toast-' + t.type, { 'hud-toast-leaving': t.leaving }]">
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

/* ── 复制房间号按钮 ── */
.hud-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #a1887f;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  min-width: 24px;
  min-height: 24px;
}
.hud-copy-btn:hover { color: #5d4037; background: rgba(139, 69, 19, 0.08); }
.hud-copied-tick { color: #16a34a; font-size: 0.8rem; font-weight: 700; }

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

.hud-difficulty {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: #8b4513;
  background: rgba(218, 165, 32, 0.16);
  border: 1px solid rgba(218, 165, 32, 0.26);
  white-space: nowrap;
}

/* ── AFK 标记 ── */
.hud-afk-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
  animation: afk-pulse 2s ease-in-out infinite;
}

@keyframes afk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hud-afk-tag {
  font-size: 0.6rem;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
  margin-left: 2px;
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

.hud-group-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1.2;
  background: rgba(139, 69, 19, 0.08);
  color: #8d6e63;
  border: 1px solid rgba(139, 69, 19, 0.15);
}

.hud-group-tag.is-host {
  background: rgba(218, 165, 32, 0.12);
  color: #a16207;
  border-color: rgba(218, 165, 32, 0.28);
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
.hud-loc-wrap {
  flex-wrap: wrap;
  max-width: min(420px, calc(100vw - 24px));
}

.loc-label {
  color: #a1887f;
}

.loc-player {
  color: #5d4037;
}

.loc-group-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1.2;
  background: rgba(139, 69, 19, 0.08);
  color: #8d6e63;
  border: 1px solid rgba(139, 69, 19, 0.15);
}

.loc-group-tag.is-host {
  background: rgba(218, 165, 32, 0.12);
  color: #a16207;
  border-color: rgba(218, 165, 32, 0.28);
}

.loc-turn-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1.2;
  border: 1px solid rgba(139, 69, 19, 0.15);
  background: rgba(139, 69, 19, 0.06);
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

/* ── 折叠按钮 ── */
.hud-fold-btn {
  background: none;
  border: none;
  color: #a1887f;
  cursor: pointer;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: all 0.15s;
  margin-left: auto;
  flex-shrink: 0;
}
.hud-fold-btn:hover { color: #5d4037; background: rgba(139, 69, 19, 0.08); }

/* ── 左侧色带 ── */
.hud-card-strip {
  position: relative;
  overflow: hidden;
}
.hud-card-strip::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 0 2px 2px 0;
}
.strip-conv::before {
  background: #3b82f6;
}
.strip-turn::before {
  background: #f59e0b;
}

/* ── 进度条 ── */
.hud-progress-bar-wrap {
  width: 100%;
  height: 3px;
  background: rgba(139, 69, 19, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.hud-progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
  background: #f59e0b;
}
.hud-progress-bar.is-done { background: #22c55e; }
.hud-progress-bar.is-active { background: #3b82f6; }
.hud-progress-bar.is-waiting { background: #f59e0b; }

.hud-conversation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 250px;
  max-width: min(420px, calc(100vw - 24px));
  background: rgba(255, 253, 245, 0.62);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  padding: 8px 12px 8px 14px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 3px 12px rgba(139, 69, 19, 0.08);
}

.hud-conversation.is-active {
  border-color: rgba(59, 130, 246, 0.24);
}

.hud-conversation.is-waiting {
  border-color: rgba(245, 158, 11, 0.24);
}

.hud-conversation.is-warn {
  border-color: rgba(239, 68, 68, 0.24);
}

.hud-conv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hud-conv-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.hud-conv-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8b4513;
  flex-shrink: 0;
}

.hud-conv-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  background: rgba(139, 69, 19, 0.08);
  color: #8d6e63;
}

.hud-conv-text {
  font-size: 0.74rem;
  color: #6d4c41;
  line-height: 1.4;
}

.hud-turn-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 250px;
  max-width: min(420px, calc(100vw - 24px));
  background: rgba(255, 253, 245, 0.62);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 12px;
  padding: 8px 12px 8px 14px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 3px 12px rgba(139, 69, 19, 0.08);
}

.hud-turn-progress.is-active {
  border-color: rgba(59, 130, 246, 0.25);
}

.hud-turn-progress.is-waiting {
  border-color: rgba(245, 158, 11, 0.28);
}

.hud-turn-progress.is-done {
  border-color: rgba(34, 197, 94, 0.24);
}

.hud-turn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hud-turn-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8b4513;
  flex-shrink: 0;
}

.hud-turn-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  background: rgba(139, 69, 19, 0.08);
  color: #8d6e63;
}

.hud-turn-meta {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.hud-turn-text {
  font-size: 0.74rem;
  color: #6d4c41;
  line-height: 1.4;
}

.hud-turn-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1.2;
  border: 1px solid rgba(139, 69, 19, 0.15);
  background: rgba(139, 69, 19, 0.06);
  color: #8d6e63;
}

.hud-turn-tag.is-pending,
.loc-turn-tag.is-pending {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.22);
  color: #2563eb;
}

.hud-turn-tag.is-completed,
.loc-turn-tag.is-completed {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.22);
  color: #15803d;
}

.hud-turn-tag.is-afk,
.loc-turn-tag.is-afk {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
  color: #dc2626;
}

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
  transition: opacity 0.3s, transform 0.3s;
}
.hud-toast-leaving {
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
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
:global(.dark-mode) .hud-difficulty {
  color: rgba(255, 215, 0, 0.92);
  background: rgba(218, 165, 32, 0.16);
  border-color: rgba(255, 215, 0, 0.26);
}
:global(.dark-mode) .hud-copy-btn { color: rgba(218, 165, 32, 0.5); }
:global(.dark-mode) .hud-copy-btn:hover { color: rgba(255, 248, 220, 0.9); background: rgba(218, 165, 32, 0.12); }
:global(.dark-mode) .hud-copied-tick { color: rgba(140, 220, 140, 0.9); }
:global(.dark-mode) .hud-fold-btn { color: rgba(218, 165, 32, 0.5); }
:global(.dark-mode) .hud-fold-btn:hover { color: rgba(255, 248, 220, 0.9); background: rgba(218, 165, 32, 0.12); }
:global(.dark-mode) .hud-progress-bar-wrap { background: rgba(218, 165, 32, 0.1); }
:global(.dark-mode) .strip-conv::before { background: rgba(100, 160, 255, 0.7); }
:global(.dark-mode) .strip-turn::before { background: rgba(255, 200, 80, 0.7); }
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
:global(.dark-mode) .hud-group-tag,
:global(.dark-mode) .loc-group-tag {
  background: rgba(139, 69, 19, 0.15);
  border-color: rgba(218, 165, 32, 0.22);
  color: rgba(218, 165, 32, 0.72);
}
:global(.dark-mode) .hud-group-tag.is-host,
:global(.dark-mode) .loc-group-tag.is-host {
  background: rgba(218, 165, 32, 0.18);
  border-color: rgba(255, 215, 0, 0.3);
  color: rgba(255, 215, 0, 0.9);
}
:global(.dark-mode) .hud-location-players {
  background: rgba(30, 20, 12, 0.7);
  border-color: rgba(218, 165, 32, 0.15);
}
:global(.dark-mode) .loc-label { color: rgba(218, 165, 32, 0.55); }
:global(.dark-mode) .loc-player { color: rgba(255, 248, 220, 0.85); }
:global(.dark-mode) .loc-player + .loc-player::before { color: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .hud-afk-badge {
  background: rgba(220, 60, 60, 0.2);
  border-color: rgba(220, 80, 60, 0.4);
  color: rgba(255, 140, 120, 0.95);
}
:global(.dark-mode) .hud-afk-tag {
  background: rgba(220, 60, 60, 0.18);
  color: rgba(255, 140, 120, 0.9);
}
:global(.dark-mode) .feat-ai { background: rgba(218, 165, 32, 0.2); color: rgba(255, 215, 0, 0.8); }
:global(.dark-mode) .feat-rag { background: rgba(139, 69, 19, 0.25); color: rgba(218, 165, 32, 0.8); }
:global(.dark-mode) .feat-sum { background: rgba(184, 134, 11, 0.2); color: rgba(255, 200, 100, 0.8); }
:global(.dark-mode) .hud-conversation {
  background: rgba(30, 20, 12, 0.72);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24);
}
:global(.dark-mode) .hud-conv-title { color: rgba(255, 215, 0, 0.88); }
:global(.dark-mode) .hud-conv-pill {
  background: rgba(139, 69, 19, 0.18);
  color: rgba(218, 165, 32, 0.78);
}
:global(.dark-mode) .hud-conv-text { color: rgba(255, 248, 220, 0.76); }
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
:global(.dark-mode) .hud-turn-progress {
  background: rgba(30, 20, 12, 0.72);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24);
}
:global(.dark-mode) .hud-turn-progress.is-active { border-color: rgba(100, 160, 255, 0.3); }
:global(.dark-mode) .hud-turn-progress.is-waiting { border-color: rgba(255, 200, 80, 0.3); }
:global(.dark-mode) .hud-turn-progress.is-done { border-color: rgba(100, 200, 120, 0.3); }
:global(.dark-mode) .hud-turn-title { color: rgba(255, 215, 0, 0.88); }
:global(.dark-mode) .hud-turn-pill {
  background: rgba(139, 69, 19, 0.18);
  color: rgba(218, 165, 32, 0.78);
}
:global(.dark-mode) .hud-turn-text { color: rgba(255, 248, 220, 0.76); }
:global(.dark-mode) .hud-turn-tag {
  background: rgba(139, 69, 19, 0.12);
  border-color: rgba(218, 165, 32, 0.2);
  color: rgba(218, 165, 32, 0.72);
}
:global(.dark-mode) .hud-turn-tag.is-pending,
:global(.dark-mode) .loc-turn-tag.is-pending {
  background: rgba(80, 140, 255, 0.15);
  border-color: rgba(100, 160, 255, 0.3);
  color: rgba(140, 190, 255, 0.9);
}
:global(.dark-mode) .hud-turn-tag.is-completed,
:global(.dark-mode) .loc-turn-tag.is-completed {
  background: rgba(60, 180, 100, 0.15);
  border-color: rgba(80, 200, 120, 0.3);
  color: rgba(140, 220, 140, 0.9);
}
:global(.dark-mode) .hud-turn-tag.is-afk,
:global(.dark-mode) .loc-turn-tag.is-afk {
  background: rgba(220, 60, 60, 0.15);
  border-color: rgba(220, 80, 60, 0.3);
  color: rgba(255, 140, 120, 0.9);
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
  .hud-conversation,
  .hud-turn-progress {
    min-width: unset;
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
  }
  .hud-vote {
    min-width: 200px;
    max-width: calc(100vw - 32px);
  }
}
</style>
