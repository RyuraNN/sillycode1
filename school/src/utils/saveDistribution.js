/**
 * 存档分发系统
 * 
 * 允许联机房主将当前存档分发给房间内其他玩家。
 * 大型存档通过 WS 分块传输，避免单帧消息过大。
 * 
 * 只分发当前联机游戏的 gameState + chatLog，
 * 不涉及 settings、单机存档列表、额外数据等本地内容。
 * 
 * 流程：
 * 1. 接收方发送 save_request → 房主
 * 2. 房主收集当前 gameState + chatLog → 分块 → 逐块发送 save_chunk
 * 3. 接收方收集所有块 → 重组 → 应用世界数据（保留自身玩家身份）
 */

import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendMessage } from './multiplayerWs'
import { collectGameStateFromStore, applyGameStateToStore } from './gameStateMigration'
import { createInitialState } from '../stores/gameStoreState'

// ── 常量 ──

/** 每块最大字节数 (64KB，WS 友好大小) */
const CHUNK_SIZE = 64 * 1024

/** 传输超时（毫秒） */
const TRANSFER_TIMEOUT = 120_000

// ── 接收端状态 ──
let pendingTransfer = null
let transferTimer = null

/**
 * 获取当前存档的摘要信息（用于 UI 显示）
 */
export function getSaveDistributionInfo() {
  const gameStore = useGameStore()
  const mpStore = useMultiplayerStore()

  return {
    playerName: gameStore.player?.name || '未知',
    floor: gameStore.meta?.currentFloor || 0,
    gameTime: gameStore.world?.gameTime ? {
      year: gameStore.world.gameTime.year,
      month: gameStore.world.gameTime.month,
      day: gameStore.world.gameTime.day,
    } : null,
    roomId: mpStore.roomId,
    isHost: mpStore.isHost,
  }
}

/**
 * [接收方] 向房主请求存档
 */
export function requestSaveFromHost() {
  const mpStore = useMultiplayerStore()
  if (!mpStore.isConnected) {
    console.warn('[SaveDistribution] Not connected')
    return false
  }

  // 清理旧状态
  cleanupPendingTransfer()

  sendMessage('save_request', {
    requesterId: mpStore.localPlayerId,
  })

  // 初始化接收状态
  pendingTransfer = {
    chunks: {},
    totalChunks: null,
    receivedCount: 0,
    startTime: Date.now(),
  }

  // 超时保护
  transferTimer = setTimeout(() => {
    console.warn('[SaveDistribution] Transfer timed out')
    window.dispatchEvent(new CustomEvent('mp:save_transfer_error', {
      detail: { error: '传输超时' }
    }))
    cleanupPendingTransfer()
  }, TRANSFER_TIMEOUT)

  window.dispatchEvent(new CustomEvent('mp:save_transfer_started'))
  return true
}

/**
 * [房主] 处理存档请求：只发送当前联机游戏的 gameState + chatLog
 */
export async function handleSaveRequest(data) {
  const mpStore = useMultiplayerStore()
  if (!mpStore.isHost) return

  const gameStore = useGameStore()
  const requesterId = data.requesterId

  try {
    console.log(`[SaveDistribution] Preparing save for player ${requesterId}`)

    // 收集当前 gameState（不含 settings/_ui）
    // chatLog 不分发 — 每个玩家的 chatLog 独立（对话组同步已单独处理）
    const gameState = JSON.parse(JSON.stringify(collectGameStateFromStore(gameStore)))

    const payload = { gameState }
    const jsonStr = JSON.stringify(payload)
    const totalBytes = new TextEncoder().encode(jsonStr).length

    // 分块
    const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE)

    // 发送元数据头
    sendMessage('save_chunk', {
      targetPlayerId: requesterId,
      meta: {
        totalChunks,
        totalBytes,
        playerName: gameStore.player?.name,
        floor: gameStore.meta?.currentFloor || 0,
        gameTime: gameStore.world?.gameTime,
      },
      chunkIndex: -1,
    })

    // 逐块发送
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const chunk = jsonStr.slice(start, start + CHUNK_SIZE)

      sendMessage('save_chunk', {
        targetPlayerId: requesterId,
        chunkIndex: i,
        chunkData: chunk,
        totalChunks,
      })

      if (i % 5 === 4) {
        await new Promise(r => setTimeout(r, 50))
      }
    }

    console.log(`[SaveDistribution] Sent ${totalChunks} chunks (${(totalBytes / 1024).toFixed(1)} KB) to ${requesterId}`)
  } catch (e) {
    console.error('[SaveDistribution] Failed to prepare save:', e)
    sendMessage('save_chunk', {
      targetPlayerId: requesterId,
      error: '存档准备失败: ' + (e.message || e),
    })
  }
}

/**
 * [接收方] 处理收到的存档块
 */
export function handleSaveChunk(data) {
  if (!pendingTransfer) {
    console.warn('[SaveDistribution] Received chunk but no transfer pending')
    return
  }

  // 错误
  if (data.error) {
    window.dispatchEvent(new CustomEvent('mp:save_transfer_error', {
      detail: { error: data.error }
    }))
    cleanupPendingTransfer()
    return
  }

  // 元数据头
  if (data.chunkIndex === -1) {
    pendingTransfer.totalChunks = data.meta.totalChunks
    pendingTransfer.meta = data.meta

    window.dispatchEvent(new CustomEvent('mp:save_transfer_progress', {
      detail: { received: 0, total: data.meta.totalChunks, meta: data.meta }
    }))
    return
  }

  // 数据块
  pendingTransfer.chunks[data.chunkIndex] = data.chunkData
  pendingTransfer.receivedCount++

  // 进度事件
  window.dispatchEvent(new CustomEvent('mp:save_transfer_progress', {
    detail: {
      received: pendingTransfer.receivedCount,
      total: pendingTransfer.totalChunks || data.totalChunks,
      meta: pendingTransfer.meta,
    }
  }))

  // 检查是否完成
  const total = pendingTransfer.totalChunks || data.totalChunks
  if (pendingTransfer.receivedCount >= total) {
    assembleSave()
  }
}

/**
 * [接收方] 重组并导入存档
 * 联机模式下保留接收方的玩家身份、设置和单机存档
 */
async function assembleSave() {
  if (!pendingTransfer) return

  try {
    const total = pendingTransfer.totalChunks
    const parts = []
    for (let i = 0; i < total; i++) {
      if (!pendingTransfer.chunks[i]) {
        throw new Error(`Missing chunk ${i}`)
      }
      parts.push(pendingTransfer.chunks[i])
    }

    const jsonStr = parts.join('')
    const elapsed = Date.now() - pendingTransfer.startTime

    console.log(`[SaveDistribution] Assembled save (${(jsonStr.length / 1024).toFixed(1)} KB) in ${elapsed}ms`)

    const gameStore = useGameStore()
    const mpStore = useMultiplayerStore()

    // ── 联机保护：导入前剥离不该共享的数据 ──
    let importData
    try {
      const parsed = JSON.parse(jsonStr)
      // 检测压缩格式
      if (parsed.compressed && parsed.data) {
        importData = parsed // 压缩数据交给 importSaveData 内部解压
      } else {
        importData = parsed
      }
    } catch {
      importData = null
    }

    if (!importData || !importData.gameState) {
      throw new Error('存档数据格式无效：缺少 gameState')
    }

    const { gameState } = importData
    const defaults = createInitialState()

    // ── 只应用世界数据，保留接收方的 player ──
    // applyGameStateToStore 会覆盖 player，所以先保存再恢复
    const preservedPlayer = JSON.parse(JSON.stringify(gameStore.player))

    applyGameStateToStore(gameStore, gameState, defaults)

    // 恢复接收方的玩家身份
    gameStore.player = preservedPlayer
    console.log(`[SaveDistribution] Applied world state, preserved player: ${preservedPlayer.name}`)

    // ── 重建世界书状态 ──
    try {
      await gameStore.rebuildWorldbookState()
    } catch (e) {
      console.warn('[SaveDistribution] rebuildWorldbookState failed:', e)
    }

    // ── 初始化 NPC 关系 ──
    if (Object.keys(gameStore.world.npcRelationships || {}).length === 0) {
      try {
        await gameStore.initializeNpcRelationships()
      } catch (e) {
        console.warn('[SaveDistribution] initializeNpcRelationships failed:', e)
      }
    }

    gameStore.saveToStorage(true)

    window.dispatchEvent(new CustomEvent('mp:save_transfer_complete', {
      detail: { elapsed }
    }))

    cleanupPendingTransfer()
  } catch (e) {
    console.error('[SaveDistribution] Assembly failed:', e)
    window.dispatchEvent(new CustomEvent('mp:save_transfer_error', {
      detail: { error: '存档重组失败: ' + (e.message || e) }
    }))
    cleanupPendingTransfer()
  }
}

/**
 * 清理接收状态
 */
function cleanupPendingTransfer() {
  if (transferTimer) {
    clearTimeout(transferTimer)
    transferTimer = null
  }
  pendingTransfer = null
}

/**
 * 获取当前传输状态
 */
export function getTransferStatus() {
  if (!pendingTransfer) return null
  return {
    receiving: true,
    received: pendingTransfer.receivedCount,
    total: pendingTransfer.totalChunks,
    meta: pendingTransfer.meta,
  }
}
