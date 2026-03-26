/**
 * multiplayerWs.js - WebSocket 客户端封装
 * 负责连接管理、消息收发、自动重连、消息批处理
 */

import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'

/** WebSocket 服务端地址（构建时注入，见 vite.config 的 define） */
let WS_BASE_URL = typeof __MP_WS_URL__ !== 'undefined' ? __MP_WS_URL__ : 'wss://school-multiplayer.YOUR_SUBDOMAIN.workers.dev'
/** REST API 基础地址 */
let API_BASE_URL = typeof __MP_API_URL__ !== 'undefined' ? __MP_API_URL__ : 'https://school-multiplayer.YOUR_SUBDOMAIN.workers.dev'

let ws = null
let reconnectTimer = null
let reconnectAttempts = 0
let currentRoomId = null
let currentPlayerInfo = null
const MAX_RECONNECT_ATTEMPTS = 5

// 消息批处理
let batchQueue = []
let batchTimer = null
const BATCH_INTERVAL = 100 // ms

/**
 * 配置服务端地址（仅开发环境可用）
 * 生产环境通过构建时常量 __MP_WS_URL__ / __MP_API_URL__ 注入
 */
export function configureServer(wsUrl, apiUrl) {
  if (wsUrl) WS_BASE_URL = wsUrl.replace(/\/$/, '')
  if (apiUrl) API_BASE_URL = apiUrl.replace(/\/$/, '')
}

/** 获取当前 API 基础地址（供 auth 模块使用） */
export function getApiBaseUrl() {
  return API_BASE_URL
}

/**
 * 获取或创建本地玩家 ID
 */
export function getOrCreatePlayerId() {
  let id = localStorage.getItem('school_multiplayer_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('school_multiplayer_id', id)
  }
  return id
}

// ── REST API ──

/**
 * 创建房间
 * @param {Object} options 房间配置
 * @returns {Promise<{roomId: string, roomName: string}>}
 */
export async function createRoom(options) {
  const res = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Failed to create room')
  }
  return res.json()
}

/**
 * 获取公开房间列表
 * @returns {Promise<{rooms: Array}>}
 */
export async function listRooms() {
  const res = await fetch(`${API_BASE_URL}/api/rooms`)
  if (!res.ok) throw new Error('Failed to fetch rooms')
  return res.json()
}

/**
 * 获取房间详情
 * @param {string} roomId
 * @returns {Promise<Object>}
 */
export async function getRoomInfo(roomId) {
  const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('房间不存在')
    throw new Error('Failed to fetch room info')
  }
  return res.json()
}

// ── WebSocket 连接 ──

/**
 * 连接到房间
 * @param {string} roomId
 * @param {Object} playerInfo { playerId, playerName, role, classId, avatar, password? }
 */
export function connectToRoom(roomId, playerInfo) {
  const mpStore = useMultiplayerStore()

  if (ws && ws.readyState === WebSocket.OPEN) {
    disconnect()
  }

  mpStore.isConnecting = true
  mpStore.connectionError = null
  mpStore.localPlayerId = playerInfo.playerId

  currentRoomId = roomId
  currentPlayerInfo = playerInfo

  const params = new URLSearchParams({
    playerId: playerInfo.playerId,
    playerName: playerInfo.playerName,
    role: playerInfo.role || 'student',
    classId: playerInfo.classId || '',
    avatar: playerInfo.avatar || '',
  })
  if (playerInfo.password) {
    params.set('password', playerInfo.password)
  }
  // Discord JWT token
  if (playerInfo.token) {
    params.set('token', playerInfo.token)
  }
  // 玩家系统 features
  if (playerInfo.features) {
    params.set('features', JSON.stringify(playerInfo.features))
  }

  const url = `${WS_BASE_URL}/ws/room/${roomId}?${params}`

  try {
    ws = new WebSocket(url)
  } catch (e) {
    mpStore.isConnecting = false
    mpStore.connectionError = '无法建立 WebSocket 连接'
    return
  }

  ws.onopen = () => {
    console.log('[MultiplayerWs] Connected to room:', roomId)
    reconnectAttempts = 0
    startBatchTimer()
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    } catch (e) {
      console.warn('[MultiplayerWs] Failed to parse message:', e)
    }
  }

  ws.onclose = (event) => {
    console.log('[MultiplayerWs] Connection closed:', event.code, event.reason)
    stopBatchTimer()

    if (event.code === 1000 && event.reason === 'user disconnect') {
      // 用户主动断开
      mpStore.reset()
    } else if (event.code === 403 || event.reason === 'kicked') {
      // 被踢出或密码错误
      mpStore.isConnecting = false
      mpStore.isConnected = false
      mpStore.connectionError = event.reason || '连接被拒绝'
    } else {
      // 异常断开，尝试重连
      mpStore.isConnected = false
      scheduleReconnect()
    }
  }

  ws.onerror = (error) => {
    console.error('[MultiplayerWs] WebSocket error:', error)
    mpStore.connectionError = '连接出错'
  }
}

/**
 * 断开连接
 */
export function disconnect() {
  clearTimeout(reconnectTimer)
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS
  stopBatchTimer()

  if (ws) {
    try {
      ws.close(1000, 'user disconnect')
    } catch {}
    ws = null
  }

  currentRoomId = null
  currentPlayerInfo = null

  const mpStore = useMultiplayerStore()
  mpStore.reset()
}

/**
 * 发送消息
 * @param {string} type 消息类型
 * @param {Object} data 消息数据
 * @returns {boolean} 是否发送成功
 */
export function sendMessage(type, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  try {
    ws.send(JSON.stringify({ type, data, ts: Date.now() }))
    return true
  } catch (e) {
    console.error('[MultiplayerWs] Send failed:', e)
    return false
  }
}

/**
 * 批量发送消息（用于高频更新如位置同步）
 * @param {string} type
 * @param {Object} data
 */
export function sendBatched(type, data) {
  batchQueue.push({ type, data, ts: Date.now() })
}

// ── 便捷发送函数 ──

export function sendChat(content, channel = 'public') {
  return sendMessage('chat', { content, channel })
}

export function sendLocationChange(location) {
  return sendMessage('location_change', { location })
}

export function sendPlayerUpdate(stats) {
  return sendMessage('player_update', { stats })
}

export function sendPlayerInit(publicState, worldbookHash) {
  return sendMessage('player_init', { publicState, worldbookHash })
}

export function sendWorldbookSyncRequest() {
  return sendMessage('worldbook_sync_request', {})
}

export function sendWorldbookSyncComplete(success) {
  return sendMessage('worldbook_sync_complete', { success })
}

export function sendNpcMemorySync(npcName, memory) {
  return sendMessage('npc_memory_sync', { npcName, memory })
}

export function sendJoinConversation(targetPlayerId) {
  return sendMessage('join_conversation', { targetPlayerId })
}

export function sendLeaveConversation() {
  return sendMessage('leave_conversation', {})
}

export function sendTurnAction(content, playerInfo) {
  return sendMessage('turn_action', { content, playerInfo: playerInfo || '' })
}

export function sendTurnSkip() {
  return sendMessage('turn_skip', {})
}

export function sendTurnTyping(isTyping = true) {
  return sendMessage('turn_typing', { isTyping })
}

export function sendAfkExtend() {
  return sendMessage('afk_extend', {})
}

export function sendTurnComplete(timeDelta, gameTime) {
  return sendMessage('turn_complete', { timeDelta, gameTime })
}

export function sendTimeAdjust(adjustedDelta) {
  return sendMessage('time_adjust', { adjustedDelta })
}

export function sendSpectateRequest(targetPlayerId) {
  return sendMessage('spectate_request', { targetPlayerId })
}

export function sendSpectateResponse(requesterId, approved) {
  return sendMessage('spectate_response', { requesterId, approved })
}

export function sendAiResponse(content, rawContent) {
  return sendMessage('ai_response', { content, rawContent })
}

export function sendVote(option) {
  return sendMessage('vote_cast', { option })
}

export function sendNpcTransferAck(npcName) {
  return sendMessage('npc_transfer_ack', { npcName })
}

export function sendRoomSettings(settings) {
  return sendMessage('room_settings', { settings })
}

export function sendKick(targetId, reason) {
  return sendMessage('kick', { targetId, reason })
}

export function sendFeatureUpdate(features) {
  return sendMessage('feature_update', { features })
}

// ── 消息处理 ──

function handleMessage(msg) {
  const mpStore = useMultiplayerStore()
  const gameStore = useGameStore()

  switch (msg.type) {
    case 'welcome':
      mpStore.handleWelcome(msg.data)
      break

    case 'player_joined':
      mpStore.handlePlayerJoined(msg.data)
      window.dispatchEvent(new CustomEvent('mp:toast', { detail: { text: `${msg.data.playerName} 加入了房间`, type: 'info' } }))
      break

    case 'player_left':
      mpStore.handlePlayerLeft(msg.data)
      window.dispatchEvent(new CustomEvent('mp:toast', { detail: { text: `${msg.data.playerName} 离开了房间`, type: 'warn' } }))
      break

    case 'chat':
      mpStore.handleChat(msg.data, msg.from, msg.fromName)
      break

    case 'player_update':
      mpStore.handlePlayerUpdate(msg.data, msg.from)
      break

    case 'player_init':
      mpStore.handlePlayerUpdate(msg.data, msg.from)
      break

    case 'feature_update':
      mpStore.handleFeatureUpdate(msg.data)
      break

    case 'location_change':
      mpStore.handleLocationChange(msg.data, msg.from)
      break

    case 'players_at_location':
      mpStore.handlePlayersAtLocation(msg.data)
      break

    case 'conversation_joined':
      mpStore.handleConversationJoined(msg.data)
      break

    case 'conversation_left':
      mpStore.handleConversationLeft(msg.data)
      break

    case 'turn_pending':
      mpStore.handleTurnPending(msg.data)
      break

    case 'turn_action':
      // 对话组 host 收到其他玩家的行动
      mpStore.pendingTurnActions.push({
        playerId: msg.data.playerId,
        playerName: msg.data.playerName,
        content: msg.data.content,
        isSkip: false,
        playerInfo: msg.data.playerInfo || '',
      })
      break

    case 'turn_skip':
      mpStore.pendingTurnActions.push({
        playerId: msg.data.playerId,
        playerName: msg.data.playerName,
        content: `${msg.data.playerName}看着大家`,
        isSkip: true,
      })
      break

    case 'turn_typing':
      // 对话组成员正在输入
      if (msg.data.isTyping) {
        if (!mpStore.typingPlayers) mpStore.typingPlayers = {}
        mpStore.typingPlayers[msg.data.playerId] = msg.data.playerName
      } else if (mpStore.typingPlayers) {
        delete mpStore.typingPlayers[msg.data.playerId]
      }
      break

    case 'turn_advance':
      mpStore.handleTurnAdvance(msg.data)
      break

    case 'afk_warning':
      window.dispatchEvent(new CustomEvent('mp:toast', { detail: { text: msg.data?.message || '你已被标记为挂机', type: 'warn' } }))
      break

    case 'afk_extended':
      window.dispatchEvent(new CustomEvent('mp:toast', { detail: { text: '已延时 2 分钟', type: 'info' } }))
      break

    case 'ai_response':
      // 合并对话中收到 AI 回复 → 通过事件注入到 GameMain 的本地 gameLog
      window.dispatchEvent(new CustomEvent('mp:ai_response', { detail: msg.data }))
      break

    case 'npc_memory_update':
      mpStore.handleNpcMemoryUpdate(msg.data)
      // 同步到 gameStore
      if (msg.data?.npcName && msg.data?.memory) {
        if (!gameStore.world.npcMemories[msg.data.npcName]) {
          gameStore.world.npcMemories[msg.data.npcName] = []
        }
        gameStore.world.npcMemories[msg.data.npcName].push(msg.data.memory)
      }
      break

    case 'npc_transfer':
      // NPC 从另一个玩家转移过来
      // 这会在下次 prompts 构建时被注入
      console.log(`[MultiplayerWs] NPC transfer: ${msg.data.npcName} from ${msg.data.fromPlayer}`)
      break

    case 'time_warning':
      mpStore.handleTimeWarning(msg.data)
      break

    case 'host_disconnected':
      mpStore.handleHostDisconnected()
      break

    case 'host_reconnected':
      mpStore.handleHostReconnected()
      break

    case 'vote_start':
      mpStore.handleVoteStart(msg.data)
      break

    case 'vote_result':
      mpStore.handleVoteResult(msg.data)
      break

    case 'spectate_request':
      mpStore.pendingSpectateRequest = {
        playerId: msg.data.requesterId,
        playerName: msg.data.requesterName || msg.data.requesterId,
      }
      break

    case 'spectate_response':
      mpStore.handleSpectateResponse(msg.data)
      break

    case 'spectate_stream':
      mpStore.handleSpectateStream(msg.data)
      break

    case 'room_update':
      mpStore.handleRoomUpdate(msg.data)
      break

    case 'kicked':
      console.warn('[MultiplayerWs] Kicked from room:', msg.data.reason)
      disconnect()
      mpStore.connectionError = `被踢出房间: ${msg.data.reason}`
      break

    case 'worldbook_data_request':
      // 房主收到其他玩家请求世界书数据
      // 触发自定义事件由 UI 层处理
      window.dispatchEvent(new CustomEvent('mp:worldbook_data_request', { detail: msg.data }))
      break

    case 'worldbook_data':
      // 收到房主的世界书数据
      window.dispatchEvent(new CustomEvent('mp:worldbook_data', { detail: msg.data }))
      break

    case 'trust_level_change':
      // Phase 6: 信任等级变更
      mpStore.handleTrustLevelChange(msg.data)
      break

    case 'worldbook_verify_request':
      // Phase 3: 服务端请求世界书 hash 校验
      handleWorldbookVerifyRequest(msg.data)
      break

    case 'worldbook_spot_check':
      // Phase 4: 服务端请求世界书抽查
      handleWorldbookSpotCheck(msg.data)
      break

    case 'worldbook_mismatch_warning':
      // 自己的世界书不匹配
      window.dispatchEvent(new CustomEvent('mp:worldbook_mismatch', { detail: msg.data }))
      break

    case 'worldbook_mismatch_alert':
      // 房主收到其他玩家世界书不匹配通知
      window.dispatchEvent(new CustomEvent('mp:worldbook_alert', { detail: msg.data }))
      break

    case 'offline_growth':
      // 收到房主计算的离线成长数据
      import('./offlineGrowth').then(({ handleOfflineGrowthReceived }) => {
        handleOfflineGrowthReceived(msg.data?.growth || msg.data)
      }).catch(e => console.warn('[MultiplayerWs] Failed to handle offline growth:', e))
      break

    case 'save_request':
      // 房主收到存档请求
      import('./saveDistribution').then(({ handleSaveRequest }) => {
        handleSaveRequest(msg.data)
      }).catch(e => console.warn('[MultiplayerWs] Failed to handle save request:', e))
      break

    case 'save_chunk':
      // 接收方收到存档数据块
      import('./saveDistribution').then(({ handleSaveChunk }) => {
        handleSaveChunk(msg.data)
      }).catch(e => console.warn('[MultiplayerWs] Failed to handle save chunk:', e))
      break

    case 'error':
      console.error('[MultiplayerWs] Server error:', msg.data)
      break

    default:
      console.log('[MultiplayerWs] Unknown message type:', msg.type)
  }
}

// ── Phase 3: 世界书全量 hash 校验 ──

async function handleWorldbookVerifyRequest(data) {
  if (!data?.nonce) return
  try {
    const { generateWorldbookHash } = await import('./multiplayerSync')
    const hash = await generateWorldbookHash()
    if (!hash) return

    // 计算 proof = SHA-256(hash + ':' + nonce)
    const proof = await computeSHA256(`${hash}:${data.nonce}`)
    sendMessage('worldbook_verify_response', { nonce: data.nonce, proof })
  } catch (e) {
    console.error('[MultiplayerWs] Worldbook verify failed:', e)
  }
}

// ── Phase 4: 世界书随机抽查 ──

async function handleWorldbookSpotCheck(data) {
  if (!data?.nonce || !Array.isArray(data?.keys)) return
  try {
    const { getWorldbookEntryHash } = await import('./multiplayerSync')
    const proofs = {}
    for (const key of data.keys) {
      const entryHash = await getWorldbookEntryHash(key)
      if (entryHash) {
        proofs[key] = await computeSHA256(`${entryHash}:${data.nonce}`)
      }
    }
    sendMessage('worldbook_spot_check_response', { nonce: data.nonce, proofs })
  } catch (e) {
    console.error('[MultiplayerWs] Spot check failed:', e)
  }
}

/** SHA-256 hex digest */
async function computeSHA256(input) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  const arr = new Uint8Array(digest)
  let hex = ''
  for (const b of arr) hex += b.toString(16).padStart(2, '0')
  return hex
}

// ── 重连 ──

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    const mpStore = useMultiplayerStore()
    mpStore.connectionError = '重连失败，请手动重新加入'
    return
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
  reconnectAttempts++
  console.log(`[MultiplayerWs] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)

  reconnectTimer = setTimeout(() => {
    if (currentRoomId && currentPlayerInfo) {
      connectToRoom(currentRoomId, currentPlayerInfo)
    }
  }, delay)
}

// ── 批处理 ──

function startBatchTimer() {
  stopBatchTimer()
  batchTimer = setInterval(flushBatch, BATCH_INTERVAL)
}

function stopBatchTimer() {
  if (batchTimer) {
    clearInterval(batchTimer)
    batchTimer = null
  }
  flushBatch()
}

function flushBatch() {
  if (batchQueue.length === 0) return
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    batchQueue = []
    return
  }

  try {
    ws.send(JSON.stringify({
      type: 'batch',
      data: { messages: batchQueue },
      ts: Date.now()
    }))
  } catch (e) {
    console.error('[MultiplayerWs] Batch send failed:', e)
  }
  batchQueue = []
}

/**
 * 检查是否已连接
 */
export function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN
}

/**
 * 获取当前连接状态
 */
export function getConnectionState() {
  if (!ws) return 'disconnected'
  switch (ws.readyState) {
    case WebSocket.CONNECTING: return 'connecting'
    case WebSocket.OPEN: return 'connected'
    case WebSocket.CLOSING: return 'closing'
    case WebSocket.CLOSED: return 'disconnected'
    default: return 'unknown'
  }
}
