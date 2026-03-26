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
  sendMessage,
  sendTurnAction,
  sendTurnSkip,
  sendTurnTyping,
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

/**
 * 当前非 host 的行动阶段
 * 'idle' | 'phase1' | 'typing' | 'warning' | 'submitted'
 */
let actionPhase = 'idle'

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

  // 倒计时（显示用）
  turnTimer = setInterval(() => {
    mpStore.turnTimeout = Math.max(0, mpStore.turnTimeout - 1)
  }, 1000)

  // 超时后自动结束
  turnTimeoutCallback = setTimeout(() => {
    clearActionWindow()
    if (onTimeout) onTimeout()
  }, timeoutMs)
}

/**
 * 非 host: 收到 turn_pending 时调用，启动阶段1（10s 决定）
 * @param {Function} onAutoSkip 自动跳过回调
 */
export function startPhase1(onAutoSkip) {
  const mpStore = useMultiplayerStore()
  clearLocalTimers()

  actionPhase = 'phase1'
  mpStore.turnPending = true
  mpStore.turnTimeout = 10
  mpStore.actionPhase = 'phase1'

  phase1Countdown = setInterval(() => {
    mpStore.turnTimeout = Math.max(0, mpStore.turnTimeout - 1)
  }, 1000)

  phase1Timer = setTimeout(() => {
    // 10s 到了还没开始输入 → 自动跳过
    if (actionPhase === 'phase1') {
      clearLocalTimers()
      actionPhase = 'idle'
      mpStore.turnPending = false
      mpStore.actionPhase = 'idle'
      sendTurnSkip()
      if (onAutoSkip) onAutoSkip()
    }
  }, 10000)
}

/**
 * 非 host: 用户开始输入时调用，进入阶段2（取消10s限制）
 */
export function enterTypingPhase() {
  if (actionPhase !== 'phase1') return
  const mpStore = useMultiplayerStore()

  // 取消阶段1计时
  if (phase1Timer) { clearTimeout(phase1Timer); phase1Timer = null }
  if (phase1Countdown) { clearInterval(phase1Countdown); phase1Countdown = null }

  actionPhase = 'typing'
  mpStore.actionPhase = 'typing'
  mpStore.turnTimeout = 0 // 不再显示倒计时

  // 通知其他玩家正在输入
  sendTurnTyping(true)

  // 启动30s无活动检测
  resetInactivityTimer()
}

/**
 * 非 host: 每次输入内容变化时调用，重置30s无活动计时
 */
export function onTypingActivity() {
  if (actionPhase === 'typing') {
    resetInactivityTimer()
  } else if (actionPhase === 'warning') {
    // 在警告阶段恢复输入 → 回到 typing 阶段
    if (finalCountdown) { clearTimeout(finalCountdown); finalCountdown = null }
    if (finalInterval) { clearInterval(finalInterval); finalInterval = null }

    const mpStore = useMultiplayerStore()
    actionPhase = 'typing'
    mpStore.actionPhase = 'typing'
    mpStore.turnTimeout = 0
    resetInactivityTimer()
  }
}

/**
 * 重置30s无活动检测计时
 */
function resetInactivityTimer() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null }

  inactivityTimer = setTimeout(() => {
    // 30s 无输入 → 进入10s最终警告
    if (actionPhase === 'typing') {
      startFinalWarning()
    }
  }, 30000)
}

/**
 * 启动10s最终倒计时警告
 */
function startFinalWarning() {
  const mpStore = useMultiplayerStore()
  actionPhase = 'warning'
  mpStore.actionPhase = 'warning'
  mpStore.turnTimeout = 10

  finalInterval = setInterval(() => {
    mpStore.turnTimeout = Math.max(0, mpStore.turnTimeout - 1)
  }, 1000)

  finalCountdown = setTimeout(() => {
    // 10s 到了 → 自动提交已输入内容或跳过
    autoSubmitOrSkip()
  }, 10000)
}

/**
 * 自动提交当前已输入的内容（无内容则跳过）
 */
function autoSubmitOrSkip() {
  // 通过事件让 ConversationMergePanel 触发提交
  window.dispatchEvent(new CustomEvent('mp:auto_submit_action'))
}

/**
 * 清除非 host 端的所有本地计时器
 */
function clearLocalTimers() {
  if (phase1Timer) { clearTimeout(phase1Timer); phase1Timer = null }
  if (phase1Countdown) { clearInterval(phase1Countdown); phase1Countdown = null }
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null }
  if (finalCountdown) { clearTimeout(finalCountdown); finalCountdown = null }
  if (finalInterval) { clearInterval(finalInterval); finalInterval = null }
  actionPhase = 'idle'
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

  // 非 host 端计时器
  clearLocalTimers()

  mpStore.turnPending = false
  mpStore.turnTimeout = 0
  mpStore.actionPhase = 'idle'
  mpStore.typingPlayers = {}
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
    if (action.isSkip) {
      parts.push(`${action.playerName}：${action.playerName}看着大家`)
    } else {
      parts.push(`${action.playerName}：${action.content}`)
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

  const names = members.map(m => m.playerName).join('、')
  let prompt = `\n[合并对话模式] 当前对话组成员：${names}\n`

  // 添加其他玩家的精简个人信息
  const playerInfos = mpStore.pendingTurnActions
    .filter(a => a.playerInfo)
    .map(a => a.playerInfo)
  if (playerInfos.length > 0) {
    prompt += '[对话组成员信息]\n'
    for (const info of playerInfos) {
      prompt += info + '\n'
    }
  }

  // 添加已收集的行动
  if (mpStore.pendingTurnActions.length > 0) {
    prompt += '[本轮行动]\n'
    for (const action of mpStore.pendingTurnActions) {
      if (action.isSkip) {
        prompt += `- ${action.playerName} 看着大家\n`
      } else {
        prompt += `- ${action.playerName}：${action.content}\n`
      }
    }
  }

  // NPC 占用状态
  const sharedNpcs = mpStore.conversationGroup.sharedNpcs || []
  if (sharedNpcs.length > 0) {
    prompt += `[共享NPC] 以下NPC在对话组中共享：${sharedNpcs.join('、')}\n`
  }

  return prompt
}
