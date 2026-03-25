/**
 * 离线玩家成长系统
 * 
 * 当联机玩家断线后重连时，根据离线时长模拟被动成长：
 * - 经验值增长（基于离线时间和当前等级）
 * - NPC 关系值微量变化（基于离线时所在地点的 NPC）
 * 
 * 成长量有上限，避免长时间离线获得不合理的收益。
 */

import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'

// ── 常量 ──

/** 每游戏小时基础 XP */
const BASE_XP_PER_HOUR = 2

/** XP 上限（单次离线最多获得） */
const MAX_OFFLINE_XP = 50

/** 关系值每小时变化基础值 */
const BASE_RELATIONSHIP_PER_HOUR = 0.3

/** 关系值上限（单次离线最多变化） */
const MAX_RELATIONSHIP_DELTA = 5

/** 离线时长上限（毫秒），超过此值按此值计算 */
const MAX_OFFLINE_MS = 4 * 60 * 60 * 1000 // 4 小时

/** 最小离线时长（毫秒），低于此值不触发 */
const MIN_OFFLINE_MS = 60 * 1000 // 1 分钟

/**
 * 计算离线成长数据
 * @param {number} offlineDurationMs - 离线时长（毫秒）
 * @param {object} options - 额外选项
 * @param {string} options.lastLocation - 离线时所在地点
 * @param {number} options.playerLevel - 玩家等级
 * @returns {{ xpGain: number, relationshipChanges: Array<{npcName: string, delta: number}>, gameHours: number }}
 */
export function calculateOfflineGrowth(offlineDurationMs, options = {}) {
  const effectiveMs = Math.min(Math.max(offlineDurationMs, 0), MAX_OFFLINE_MS)
  if (effectiveMs < MIN_OFFLINE_MS) {
    return { xpGain: 0, relationshipChanges: [], gameHours: 0 }
  }

  // 离线时长转换为游戏小时（1 real minute ≈ 1 game hour 的近似）
  const gameHours = effectiveMs / (60 * 1000)

  // ── 经验值 ──
  const levelFactor = Math.max(0.5, 1 - (options.playerLevel || 1) * 0.02) // 高等级衰减
  const rawXp = Math.round(BASE_XP_PER_HOUR * gameHours * levelFactor)
  const xpGain = Math.min(rawXp, MAX_OFFLINE_XP)

  // ── 关系值 ──
  const relationshipChanges = []
  if (options.lastLocation) {
    const gameStore = useGameStore()
    const npcs = gameStore.world?.npcs || []
    // 找到同地点的 NPC
    const localNpcs = npcs.filter(n => n.location === options.lastLocation)
    
    for (const npc of localNpcs.slice(0, 5)) { // 最多影响 5 个 NPC
      const baseDelta = BASE_RELATIONSHIP_PER_HOUR * gameHours
      // 添加轻微随机性
      const jitter = 0.8 + Math.random() * 0.4 // 0.8 ~ 1.2
      const delta = Math.min(Math.round(baseDelta * jitter * 10) / 10, MAX_RELATIONSHIP_DELTA)
      if (delta > 0) {
        relationshipChanges.push({ npcName: npc.name, delta })
      }
    }
  }

  return { xpGain, relationshipChanges, gameHours: Math.round(gameHours * 10) / 10 }
}

/**
 * 应用离线成长效果到游戏状态
 * @param {{ xpGain: number, relationshipChanges: Array<{npcName: string, delta: number}> }} growth
 */
export function applyOfflineGrowth(growth) {
  const gameStore = useGameStore()

  if (growth.xpGain > 0 && gameStore.addExp) {
    gameStore.addExp(growth.xpGain)
    console.log(`[OfflineGrowth] Applied ${growth.xpGain} XP`)
  }

  if (growth.relationshipChanges.length > 0) {
    try {
      // 动态导入避免循环依赖
      import('../utils/relationshipManager').then(({ updateRelationshipDelta }) => {
        const playerName = gameStore.player?.name
        if (!playerName) return

        for (const { npcName, delta } of growth.relationshipChanges) {
          updateRelationshipDelta(playerName, npcName, {
            intimacy: delta,
            trust: delta * 0.5
          })
        }
        console.log(`[OfflineGrowth] Applied relationship changes for ${growth.relationshipChanges.length} NPCs`)
      })
    } catch (e) {
      console.warn('[OfflineGrowth] Failed to apply relationship changes:', e)
    }
  }
}

/**
 * 处理玩家重连事件（由 multiplayerStore 的 mp:player_reconnected 事件触发）
 * 仅房主执行，将成长结果通过 WS 发送给重连玩家
 * @param {CustomEvent} event
 */
export function handlePlayerReconnected(event) {
  const mpStore = useMultiplayerStore()
  if (!mpStore.isHost) return // 只有房主计算离线成长

  const { playerId, playerName, offlineDurationMs, lastLocation } = event.detail
  const gameStore = useGameStore()

  const growth = calculateOfflineGrowth(offlineDurationMs, {
    lastLocation,
    playerLevel: gameStore.player?.level || 1
  })

  if (growth.xpGain > 0 || growth.relationshipChanges.length > 0) {
    // 通过 WS 发送离线成长数据给重连玩家
    try {
      import('../utils/multiplayerWs').then(({ sendMessage }) => {
        sendMessage('offline_growth', {
          targetPlayerId: playerId,
          growth: {
            xpGain: growth.xpGain,
            relationshipChanges: growth.relationshipChanges,
            gameHours: growth.gameHours,
            offlineDurationMs
          }
        })
      })
    } catch (e) {
      console.warn('[OfflineGrowth] Failed to send growth data:', e)
    }

    console.log(`[OfflineGrowth] Player ${playerName} was offline for ${growth.gameHours}h → +${growth.xpGain} XP, ${growth.relationshipChanges.length} NPC changes`)
  }
}

/**
 * 处理收到的离线成长数据（由非房主玩家在重连后执行）
 * @param {{ xpGain: number, relationshipChanges: Array, gameHours: number, offlineDurationMs: number }} growthData
 */
export function handleOfflineGrowthReceived(growthData) {
  console.log(`[OfflineGrowth] Received growth data: +${growthData.xpGain} XP after ${growthData.gameHours}h offline`)
  applyOfflineGrowth(growthData)

  // 发出 UI 事件通知玩家
  window.dispatchEvent(new CustomEvent('mp:offline_growth_applied', {
    detail: growthData
  }))
}
