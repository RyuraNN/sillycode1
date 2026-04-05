/**
 * conversationMerge.js - 合并对话逻辑
 * 负责：行动收集、消息合并、回合协调、AI 代理转发
 *
 * 核心流程（对话组 host 视角）：
 * 1. Host 发送消息 → 触发 10s 行动窗口
 * 2. 其他成员在窗口内提交 turn_action / turn_skip
 * 3. 窗口结束后，合并所有行动为一条消息
 * 4. 将合并消息发给 host 的 AI 生成回复
 * 5. AI 回复通过 DO 广播给全组
 *
 * 非 host 视角（两阶段超时）：
 * 阶段1: 收到 turn_pending → 10s 决定是否输入
 * 阶段2: 开始输入 → 解除10s限制 → 30s无新输入则警告 → 10s最终倒计时 → 自动提交/跳过
 */

import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'
import {
  sendTurnAction,
  sendTurnSkip,
  sendTurnTyping,
  sendTurnExtend,
  sendAiResponse,
} from './multiplayerWs'
import { buildCondensedPlayerInfo } from './prompts'

// ── 行动窗口计时器（host 端） ──
let turnTimer = null
let turnTimeoutCallback = null

// ── 非 host 端两阶段计时器 ──
let phase1Timer = null       // 阶段1: 10s 决定倒计时
let phase1Countdown = null
let inactivityTimer = null   // 阶段2: 30s 无活动检测
let finalCountdown = null    // 阶段2: 10s 最终倒计时
let finalInterval = null
let hostTurnDeadline = 0
let hostWindowOnTimeout = null
let turnDeadline = 0
let lastExtendSyncAt = 0
let localTurnTimeoutCallback = null

/**
 * 当前非 host 的行动阶段
 * 'idle' | 'phase1' | 'typing' | 'warning' | 'submitted'
 */
let actionPhase = 'idle'
let previousInteractivePhase = 'phase1'

const TURN_LIMIT_SECONDS = 20
const TURN_ACTIVITY_SYNC_INTERVAL_MS = 1500
const WARNING_THRESHOLD_SECONDS = 5

export function getConversationTurnLimitSeconds() {
  return TURN_LIMIT_SECONDS
}

function resolveConversationPlayerName(playerId, fallbackName = '') {
  const mpStore = useMultiplayerStore()
  const remote = playerId ? mpStore.players[playerId] : null
  return remote?.characterName || fallbackName || remote?.playerName || '其他人'
}

/**
 * 对话组 host: 在发送自己的消息后，开始行动收集窗口
 * @param {number} timeoutMs 等待时间（默认 10s）
 * @param {Function} onTimeout 超时回调
 */
export function startActionWindow(timeoutMs = 10000, onTimeout) {
  const mpStore = useMultiplayerStore()

  // 清除上一个窗口
  clearActionWindow()

  mpStore.turnPending = true
  mpStore.turnTimeout = Math.ceil(timeoutMs / 1000)
  mpStore.pendingTurnActions = []
  mpStore.typingPlayers = {}
  hostTurnDeadline = Date.now() + timeoutMs
  hostWindowOnTimeout = onTimeout || null

  // 倒计时（显示用）
  turnTimer = setInterval(() => {
    syncHostRemainingTurnTime()
  }, 250)
  syncHostRemainingTurnTime()

  // 超时后自动结束
  scheduleHostWindowTimeout()
}

export function extendActionWindow(timeoutMs = TURN_LIMIT_SECONDS * 1000) {
  const mpStore = useMultiplayerStore()
  if (!mpStore.turnPending) return false

  const nextDeadline = Date.now() + timeoutMs
  if (nextDeadline <= hostTurnDeadline) {
    return false
  }

  hostTurnDeadline = nextDeadline
  syncHostRemainingTurnTime()
  scheduleHostWindowTimeout()
  return true
}

/**
 * 非 host: 收到 turn_pending 时调用，启动阶段1（10s 决定）
 * @param {Function} onAutoSkip 自动跳过回调
 */
export function startPhase1(onAutoSkip) {
  const mpStore = useMultiplayerStore()
  clearLocalTimers()
  const initialSeconds = Math.max(1, Math.min(TURN_LIMIT_SECONDS, Number(mpStore.turnTimeout) || 10))

  actionPhase = 'phase1'
  previousInteractivePhase = 'phase1'
  mpStore.turnPending = true
  mpStore.turnTimeout = initialSeconds
  mpStore.actionPhase = 'phase1'
  mpStore.resetTurnExtendState()
  turnDeadline = Date.now() + (initialSeconds * 1000)
  localTurnTimeoutCallback = onAutoSkip || null

  phase1Countdown = setInterval(() => {
    syncRemainingTurnTime()
  }, 250)

  scheduleLocalTurnTimeout()
}

/**
 * 非 host: 用户开始输入时调用，进入阶段2（取消10s限制）
 */
export function enterTypingPhase() {
  if (actionPhase !== 'phase1') return
  const mpStore = useMultiplayerStore()

  actionPhase = 'typing'
  previousInteractivePhase = 'typing'
  mpStore.actionPhase = 'typing'

  // 通知其他玩家正在输入
  sendTurnTyping(true)
  syncTurnExtendActivity(true)

  replenishTurnTime(true)
}

/**
 * 非 host: 每次输入内容变化时调用，重置30s无活动计时
 */
export function onTypingActivity() {
  const mpStore = useMultiplayerStore()
  if (actionPhase === 'typing') {
    previousInteractivePhase = 'typing'
    syncTurnExtendActivity()
    replenishTurnTime(true)
  } else if (actionPhase === 'warning') {
    previousInteractivePhase = 'typing'
    actionPhase = 'typing'
    mpStore.actionPhase = 'typing'
    syncTurnExtendActivity(true)
    replenishTurnTime(true)
  }
}

export function requestTurnExtend() {
  const mpStore = useMultiplayerStore()
  if (!mpStore.turnPending || actionPhase === 'submitted' || !turnDeadline || mpStore.turnTimeout >= TURN_LIMIT_SECONDS) {
    return false
  }

  if (actionPhase === 'warning') {
    actionPhase = previousInteractivePhase
    mpStore.actionPhase = previousInteractivePhase
  }
  syncTurnExtendActivity(true)
  replenishTurnTime(false)
  return true
}

function syncHostRemainingTurnTime() {
  const mpStore = useMultiplayerStore()
  if (!hostTurnDeadline) {
    mpStore.turnTimeout = 0
    return
  }

  mpStore.turnTimeout = Math.max(0, Math.ceil((hostTurnDeadline - Date.now()) / 1000))
}

function scheduleHostWindowTimeout() {
  if (turnTimeoutCallback) {
    clearTimeout(turnTimeoutCallback)
  }
  const remainingMs = Math.max(0, hostTurnDeadline - Date.now())
  turnTimeoutCallback = setTimeout(() => {
    const callback = hostWindowOnTimeout
    clearActionWindow()
    if (callback) callback()
  }, remainingMs)
}

function syncRemainingTurnTime() {
  const mpStore = useMultiplayerStore()
  if (!turnDeadline) {
    mpStore.turnTimeout = 0
    return
  }

  const remainingSeconds = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000))
  mpStore.turnTimeout = remainingSeconds

  if (actionPhase !== 'submitted' && remainingSeconds <= WARNING_THRESHOLD_SECONDS) {
    actionPhase = 'warning'
    mpStore.actionPhase = 'warning'
  }
}

function replenishTurnTime(resetExtendState) {
  const mpStore = useMultiplayerStore()
  turnDeadline = Date.now() + (TURN_LIMIT_SECONDS * 1000)
  if (resetExtendState) {
    mpStore.resetTurnExtendState()
  }
  if (actionPhase === 'warning') {
    actionPhase = previousInteractivePhase
    mpStore.actionPhase = previousInteractivePhase
  }
  syncRemainingTurnTime()
  scheduleLocalTurnTimeout()
}

function scheduleLocalTurnTimeout() {
  if (phase1Timer) {
    clearTimeout(phase1Timer)
  }
  const remainingMs = Math.max(0, turnDeadline - Date.now())
  phase1Timer = setTimeout(() => {
    const callback = localTurnTimeoutCallback
    if (actionPhase === 'phase1' || actionPhase === 'typing' || actionPhase === 'warning') {
      stopLocalTimerHandles()
      turnDeadline = 0
      sendTurnTyping(false)
      autoSubmitOrSkip()
    }
    if (callback) callback()
  }, remainingMs)
}

function syncTurnExtendActivity(force = false) {
  const now = Date.now()
  if (!force && now - lastExtendSyncAt < TURN_ACTIVITY_SYNC_INTERVAL_MS) {
    return
  }
  lastExtendSyncAt = now
  sendTurnExtend(TURN_LIMIT_SECONDS)
}

/**
 * 自动提交当前已输入的内容（无内容则跳过）
 */
function autoSubmitOrSkip() {
  // 通过事件让 ConversationMergePanel 触发提交
  window.dispatchEvent(new CustomEvent('mp:auto_submit_action'))
}

function stopLocalTimerHandles() {
  if (phase1Timer) { clearTimeout(phase1Timer); phase1Timer = null }
  if (phase1Countdown) { clearInterval(phase1Countdown); phase1Countdown = null }
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null }
  if (finalCountdown) { clearTimeout(finalCountdown); finalCountdown = null }
  if (finalInterval) { clearInterval(finalInterval); finalInterval = null }
}

/**
 * 清除非 host 端的所有本地计时器
 */
function clearLocalTimers() {
  const mpStore = useMultiplayerStore()
  stopLocalTimerHandles()
  turnDeadline = 0
  lastExtendSyncAt = 0
  localTurnTimeoutCallback = null
  actionPhase = 'idle'
  previousInteractivePhase = 'phase1'
  mpStore.resetTurnExtendState()
}

/**
 * 清除行动窗口计时器（host + 非 host）
 */
export function clearActionWindow() {
  const mpStore = useMultiplayerStore()

  // host 端计时器
  if (turnTimer) {
    clearInterval(turnTimer)
    turnTimer = null
  }
  if (turnTimeoutCallback) {
    clearTimeout(turnTimeoutCallback)
    turnTimeoutCallback = null
  }
  hostTurnDeadline = 0
  hostWindowOnTimeout = null

  // 非 host 端计时器
  clearLocalTimers()

  mpStore.turnPending = false
  mpStore.turnTimeout = 0
  mpStore.actionPhase = 'idle'
  mpStore.typingPlayers = {}
  mpStore.resetTurnExtendState()
}

/**
 * 检查是否所有成员已提交行动
 * @returns {boolean}
 */
export function allActionsReceived() {
  const mpStore = useMultiplayerStore()
  if (!mpStore.conversationGroup) return true

  const expectedCount = mpStore.conversationGroup.memberIds.length - 1 // 不含 host
  return mpStore.pendingTurnActions.length >= expectedCount
}

/**
 * 将 host 的消息和其他玩家的行动合并为一条消息
 * @param {string} hostMessage host 的原始消息
 * @returns {string} 合并后的消息
 */
export function mergeActionsIntoMessage(hostMessage) {
  const mpStore = useMultiplayerStore()
  const gameStore = useGameStore()

  const hostName = gameStore.player?.name || 'Player'
  const parts = [`${hostName}：${hostMessage}`]

  for (const action of mpStore.pendingTurnActions) {
    const actorName = resolveConversationPlayerName(action.playerId, action.characterName || action.playerName)
    if (action.isSkip) {
      parts.push(`${actorName}：${actorName}看着大家`)
    } else {
      parts.push(`${actorName}：${action.content}`)
    }
  }

  return parts.join('\n')
}

/**
 * 非 host: 提交行动
 * @param {string} content 行动内容
 */
export function submitAction(content) {
  if (content && content.trim()) {
    let playerInfo = ''
    try {
      const gameStore = useGameStore()
      playerInfo = buildCondensedPlayerInfo(gameStore.getGameState())
    } catch (_) { /* ignore */ }
    sendTurnAction(content.trim(), playerInfo)
  } else {
    sendTurnSkip()
  }
}

/**
 * 非 host: 跳过行动
 */
export function skipAction() {
  sendTurnSkip()
}

/**
 * Host: 广播 AI 回复给对话组
 * @param {string} content 处理后的回复内容
 * @param {string} rawContent 原始回复内容
 */
export function broadcastAiResponse(content, rawContent) {
  sendAiResponse(content, rawContent || content)
}

/**
 * 判断当前玩家是否是对话组的 host
 * @returns {boolean}
 */
export function isConversationHost() {
  const mpStore = useMultiplayerStore()
  if (!mpStore.conversationGroup) return false
  return mpStore.conversationGroup.hostPlayerId === mpStore.localPlayerId
}

/**
 * 判断当前玩家是否在对话组中
 * @returns {boolean}
 */
export function isInConversation() {
  const mpStore = useMultiplayerStore()
  return !!mpStore.conversationGroup
}

/**
 * 获取对话组内其他玩家的行动提示词片段
 * 用于注入到 host 的 AI 提示词中
 * @returns {string}
 */
export function getConversationContextPrompt() {
  const mpStore = useMultiplayerStore()
  if (!mpStore.conversationGroup) return ''

  const members = mpStore.conversationGroup.memberIds
    .filter(id => id !== mpStore.localPlayerId)
    .map(id => mpStore.players[id])
    .filter(Boolean)

  if (members.length === 0) return ''

  const names = members.map(m => m.characterName || m.playerName).join('、')
  let prompt = `\n[当前场景参与者] 以下角色正在参与当前互动：${names}\n`

  const joinContexts = mpStore.consumeConversationJoinContexts(mpStore.conversationGroup.groupId)
  if (joinContexts.length > 0) {
    prompt += '[新加入角色的背景补充]\n'
    for (const ctx of joinContexts) {
      const snapshot = String(ctx.aiReplySnapshot || '').replace(/\s+/g, ' ').trim().slice(0, 600)
      if (!snapshot) continue
      prompt += `- ${ctx.joinedPlayerName} 加入时，当时场景摘录：${snapshot}\n`
    }
  }

  // 添加其他角色的精简个人信息
  const playerInfos = mpStore.pendingTurnActions
    .filter(a => a.playerInfo)
    .map(a => a.playerInfo)
  if (playerInfos.length > 0) {
    prompt += '[参与角色信息]\n'
    for (const info of playerInfos) {
      prompt += info + '\n'
    }
  }

  // 添加已收集的行动
  if (mpStore.pendingTurnActions.length > 0) {
    prompt += '[已给出的行动]\n'
    for (const action of mpStore.pendingTurnActions) {
      const actorName = resolveConversationPlayerName(action.playerId, action.characterName || action.playerName)
      if (action.isSkip) {
        prompt += `- ${actorName} 看着大家\n`
      } else {
        prompt += `- ${actorName}：${action.content}\n`
      }
    }
  }

  // NPC 参与状态
  const sharedNpcs = mpStore.conversationGroup.sharedNpcs || []
  if (sharedNpcs.length > 0) {
    prompt += `[场景内NPC] 以下NPC正在参与当前互动：${sharedNpcs.join('、')}\n`
  }

  return prompt
}
