/**
 * 存档分发系统
 * 
 * 允许联机房主将当前存档分发给房间内其他玩家。
 * 大型存档通过 WS 分块传输，避免单帧消息过大。
 * 
 * 流程：
 * 1. 接收方发送 save_request → 房主
 * 2. 房主序列化存档 → 分块 → 逐块发送 save_chunk
 * 3. 接收方收集所有块 → 重组 → 导入存档
 */

import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendMessage } from './multiplayerWs'

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
 * [房主] 处理存档请求，序列化并分块发送
 */
export async function handleSaveRequest(data) {
  const mpStore = useMultiplayerStore()
  if (!mpStore.isHost) return

  const gameStore = useGameStore()
  const requesterId = data.requesterId

  try {
    console.log(`[SaveDistribution] Preparing save for player ${requesterId}`)

    // 序列化当前游戏状态
    const exportData = await gameStore.getExportData({ asText: true })
    const jsonStr = typeof exportData === 'string' ? exportData : JSON.stringify(exportData)
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
      chunkIndex: -1, // -1 表示元数据头
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

      // 每 5 块暂停一下避免过载
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

    // 导入存档
    const gameStore = useGameStore()
    const success = await gameStore.importSaveData(jsonStr)

    cleanupPendingTransfer()

    if (success) {
      window.dispatchEvent(new CustomEvent('mp:save_transfer_complete', {
        detail: { elapsed }
      }))
    } else {
      window.dispatchEvent(new CustomEvent('mp:save_transfer_error', {
        detail: { error: '存档导入失败' }
      }))
    }
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
