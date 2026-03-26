/**
 * 存档快照相关 Actions
 */

import type { ChatLogEntry, SaveSnapshot, GameStateData } from '../gameStoreTypes'
import { saveSnapshotData, getSnapshotData, removeSnapshotData, loadChunkedChatLog, saveChunkedChatLog, saveSharedChatLog, loadSharedChatLog } from '../../utils/indexedDB'
import { updateAcademicWorldbookEntry } from '../../utils/academicWorldbook'
import { createInitialState } from '../gameStoreState'
import {
  computeDelta,
  applyDelta,
  isDeltaSnapshot,
  shouldCreateBaseSnapshot,
  createLightSnapshot,
  fastClone,
  stripEmbeddingData,
  stripBulkyFields,
  stripStaticFields,
  type DeltaSnapshot
} from '../../utils/snapshotUtils'
import { detectCardEdition, GAME_VERSION } from '../../utils/editionDetector'
import { getErrorMessage, getErrorName } from '../../utils/errorUtils'
import { collectGameStateFromStore, applyGameStateToStore, isLegacyGameState, migrateGameStateData } from '../../utils/gameStateMigration'
import { useMultiplayerStore } from '../multiplayerStore'

/** 检测当前是否为联机房主模式 */
function getMultiplayerContext(): { isMultiplayer: boolean; roomId: string | null } {
  try {
    const mpStore = useMultiplayerStore()
    if (mpStore.isConnected && mpStore.isHost && mpStore.roomId) {
      return { isMultiplayer: true, roomId: mpStore.roomId }
    }
  } catch { /* store not ready */ }
  return { isMultiplayer: false, roomId: null }
}

/**
 * 精简 chatLog 拷贝，移除冗余字段
 * 可用于全量映射或增量序列化
 * @param log 单条聊天记录
 * @returns 精简后的聊天记录
 */
function createLightChatLogEntry(log: ChatLogEntry): ChatLogEntry {
  const lightLog: any = {
    type: log.type,
    content: log.content,
    // 不保存: rawContent, preVariableSnapshot（可从 snapshot 恢复）
  }

  // 深拷贝 snapshot，使用 fastClone 移除 Proxy 和不可克隆对象
  // 同时剥离大型累积字段（summaries, persistentFacts），这些数据在 gameState 存档中独立保存
  if (log.snapshot) {
    try {
      lightLog.snapshot = stripBulkyFields(stripEmbeddingData(fastClone(log.snapshot)))
    } catch (e) {
      console.warn('[createLightChatLogEntry] Failed to serialize snapshot:', e)
      // 如果序列化失败，跳过该 snapshot
    }
  }

  return lightLog as ChatLogEntry
}

/**
 * 深拷贝玩家数据并剥离 RAG embedding，避免高楼层快照与状态比对过重
 */
function clonePlayerForSnapshot(player: any) {
  const playerCopy = fastClone(player)
  return stripEmbeddingData(playerCopy)
}

async function rehydratePlayerSummaryEmbeddings(store: any) {
  // Phase 2: summaries moved to rag.summaries, but player.summaries still kept for compat
  const summaries = store?.rag?.summaries || store?.player?.summaries
  if (!summaries || summaries.length === 0) return

  try {
    const { rehydrateSummaryEmbeddings } = await import('../../utils/ragService')
    const result = await rehydrateSummaryEmbeddings({
      runId: store.meta.currentRunId,
      summaries: summaries
    })

    if (result?.restored > 0) {
      console.log(`[snapshotActions] Rehydrated ${result.restored} summary embeddings for run ${store.meta.currentRunId}`)
    }
  } catch (e) {
    console.warn('[snapshotActions] Failed to rehydrate summary embeddings:', e)
  }
}

export const snapshotActions = {
  /**
   * 创建存档快照
   */
  async createSnapshot(this: any, chatLog: ChatLogEntry[], messageIndex: number, label?: string) {
    // 如果是临时编辑状态，生成真实的 runId
    if (this.meta.currentRunId === 'temp_editing') {
      this.meta.currentRunId = Date.now().toString(36)
      console.log('[GameStore] Generated real runId:', this.meta.currentRunId)
    }

    // Phase 2: 使用 collectGameStateFromStore 自动收集分层数据
    const collected = collectGameStateFromStore(this)
    collected.player = clonePlayerForSnapshot(collected.player)
    const gameState = fastClone(collected)

    const id = Date.now().toString()

    // Phase 1.1: 保存到共享 chatLog 池（按 runId），不再为每个手动存档独立存储 chatLog
    await saveSharedChatLog(this.meta.currentRunId, chatLog, {
      serializeEntry: createLightChatLogEntry
    })

    await saveSnapshotData(id, { gameState })

    // 保存轻量级元数据
    const snapshot: SaveSnapshot = {
      id,
      timestamp: Date.now(),
      label: label || `存档 ${this._ui.saveSnapshots.length + 1}`,
      messageIndex,
      gameTime: {
        year: this.world.gameTime.year,
        month: this.world.gameTime.month,
        day: this.world.gameTime.day,
        hour: this.world.gameTime.hour,
        minute: this.world.gameTime.minute
      },
      location: this.player.location,
      cardEdition: detectCardEdition(),
      gameVersion: GAME_VERSION
    }

    // 联机房主存档路由到 mpSaveSnapshots
    const mpCtx = getMultiplayerContext()
    if (mpCtx.isMultiplayer) {
      snapshot.saveMode = 'multiplayer'
      snapshot.roomId = mpCtx.roomId!
      snapshot.label = label || `联机存档 ${this._ui.mpSaveSnapshots.length + 1}`
      this._ui.mpSaveSnapshots.push(snapshot)
    } else {
      snapshot.saveMode = 'single'
      this._ui.saveSnapshots.push(snapshot)
    }
    this.saveToStorage(true)

    // 后台触发自动清理
    if (this.autoCleanupSnapshots) {
      this.autoCleanupSnapshots().catch((e: unknown) =>
        console.warn('[GameStore] Auto cleanup failed:', e)
      )
    }

    return id
  },

  /**
   * 创建/更新自动存档
   */
  async createAutoSave(this: any, chatLog: ChatLogEntry[], messageIndex: number, options: { rewriteFromIndex?: number } = {}) {
    try {
      // 存档前检查存储空间
      try {
        const { getStorageEstimate } = await import('../../utils/indexedDB')
        const estimate = await getStorageEstimate()
        if (estimate.usagePercent > 90) {
          console.warn(`[createAutoSave] 存储空间紧张: ${estimate.usageMB}MB / ${estimate.quotaMB}MB (${estimate.usagePercent}%)`)
          this._ui.saveError = `存储空间不足 (${Math.round(estimate.usagePercent)}%)，建议清理旧存档`
          // 尝试自动清理旧存档
          if (this.autoCleanupSnapshots) {
            await this.autoCleanupSnapshots()
          }
        } else if (estimate.usagePercent > 80) {
          console.warn(`[createAutoSave] 存储空间预警: ${estimate.usageMB}MB / ${estimate.quotaMB}MB (${estimate.usagePercent}%)`)
        }
      } catch (e) {
        // 存储检查失败不阻塞存档
        console.warn('[createAutoSave] Storage estimate check failed:', e)
      }

      // Phase 2: 使用 collectGameStateFromStore 自动收集分层数据
      const collected = collectGameStateFromStore(this)
      collected.player = clonePlayerForSnapshot(collected.player)
      const gameState = fastClone(collected)

      const autoSaveId = `autosave_${this.meta.currentRunId}`

      // Phase 1.1: 保存到共享 chatLog 池（按 runId），自动存档与手动存档共享同一份 chatLog
      const { saveSharedChatLog } = await import('../../utils/indexedDB')
      await saveSharedChatLog(this.meta.currentRunId, chatLog, {
        incremental: true,
        serializeEntry: createLightChatLogEntry,
        rewriteFromIndex: Number.isInteger(options?.rewriteFromIndex) ? options.rewriteFromIndex : undefined
      })

      // 保存 gameState（不分片，因为相对较小）
      const { saveSnapshotData } = await import('../../utils/indexedDB')
      await saveSnapshotData(autoSaveId, { gameState })

      const mpCtx = getMultiplayerContext()
      const snapshot: SaveSnapshot = {
        id: autoSaveId,
        timestamp: Date.now(),
        label: mpCtx.isMultiplayer ? `联机自动存档 (${this.player.name})` : `自动存档 (${this.player.name})`,
        messageIndex,
        gameTime: {
          year: this.world.gameTime.year,
          month: this.world.gameTime.month,
          day: this.world.gameTime.day,
          hour: this.world.gameTime.hour,
          minute: this.world.gameTime.minute
        },
        location: this.player.location,
        cardEdition: detectCardEdition(),
        gameVersion: GAME_VERSION,
        saveMode: mpCtx.isMultiplayer ? 'multiplayer' : 'single',
        roomId: mpCtx.roomId || undefined
      }

      // 联机房主自动存档路由到 mpSaveSnapshots
      const targetArray = mpCtx.isMultiplayer ? this._ui.mpSaveSnapshots : this._ui.saveSnapshots
      const existingIndex = targetArray.findIndex((s: SaveSnapshot) => s.id === autoSaveId)

      if (existingIndex !== -1) {
        targetArray[existingIndex] = snapshot
      } else {
        targetArray.unshift(snapshot)
      }

      this.saveToStorage()
    } catch (e) {
      console.error('[createAutoSave] Failed to create auto save:', e)
      const errorMessage = getErrorMessage(e, '自动存档失败')
      const errorName = getErrorName(e)
      this._ui.saveError = errorMessage

      // 如果是 DataCloneError，提供更具体的错误信息
      if (errorName === 'DataCloneError') {
        this._ui.saveError = '自动存档失败：数据包含不可序列化的对象'
        console.error('[createAutoSave] DataCloneError - chatLog may contain non-cloneable objects (Proxy, functions, etc.)')
      } else if (errorMessage.includes('QuotaExceeded')) {
        this._ui.saveError = '存储空间不足，请清理旧存档'
      }
    }
  },

  /**
   * 加载快照详情（用于预览）
   */
  async loadSnapshotDetails(this: any, snapshotId: string) {
    const snapshot = this._ui.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    if (!snapshot) return null

    if (snapshot.chatLog && snapshot.gameState) {
      return snapshot
    }

    const details = await getSnapshotData(snapshotId)

    // Phase 1.1: 优先从共享 chatLog 池加载
    let chatLog = details?.chatLog
    if (!chatLog) {
      // Phase 2: runId 可能在 meta 或旧格式的顶层
      const gs = details?.gameState
      const runId = gs?.meta?.currentRunId || gs?.currentRunId || this.meta.currentRunId
      if (runId) {
        const sharedLog = await loadSharedChatLog(runId)
        if (sharedLog && sharedLog.length > 0) {
          const sliceEnd = (snapshot.messageIndex ?? sharedLog.length - 1) + 1
          chatLog = sharedLog.slice(0, sliceEnd)
        }
      }
    }

    // 回退：旧格式的 per-snapshot 分片存储
    if (!chatLog) {
      chatLog = await loadChunkedChatLog(snapshotId)
    }

    if (details || chatLog) {
      return {
        ...snapshot,
        gameState: details?.gameState,
        chatLog
      }
    }
    return null
  },

  /**
   * 恢复存档快照
   */
  async restoreSnapshot(this: any, snapshotId: string, force?: boolean): Promise<SaveSnapshot | null | { mismatch: true, snapshotEdition: string, currentEdition: string }> {
    let snapshotMeta = this._ui.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    // 也搜索联机存档列表
    if (!snapshotMeta) {
      snapshotMeta = this._ui.mpSaveSnapshots?.find((s: SaveSnapshot) => s.id === snapshotId)
    }
    if (!snapshotMeta) return null

    // 版本不匹配检查
    if (!force && snapshotMeta.cardEdition && snapshotMeta.cardEdition !== 'unknown') {
      const currentEdition = detectCardEdition()
      if (currentEdition !== 'unknown' && currentEdition !== snapshotMeta.cardEdition) {
        return { mismatch: true, snapshotEdition: snapshotMeta.cardEdition, currentEdition }
      }
    }

    let fullSnapshot = snapshotMeta
    if (!snapshotMeta.gameState) {
      const details = await getSnapshotData(snapshotId)
      if (!details) {
        console.error('[GameStore] Failed to load snapshot details for', snapshotId)
        return null
      }
      fullSnapshot = { ...snapshotMeta, ...details }
    }

    // Phase 1.1: 优先从共享 chatLog 池加载，回退到旧的 per-snapshot 存储
    if (!fullSnapshot.chatLog) {
      // Phase 2: runId 可能在 meta 或旧格式的顶层
      const gs = fullSnapshot.gameState
      const runId = gs?.meta?.currentRunId || gs?.currentRunId || this.meta.currentRunId
      let chatLog = null

      // 1. 尝试共享 chatLog 池
      if (runId) {
        chatLog = await loadSharedChatLog(runId)
        if (chatLog && chatLog.length > 0) {
          // 截取到存档时的 messageIndex（包含该条）
          const sliceEnd = (fullSnapshot.messageIndex ?? chatLog.length - 1) + 1
          chatLog = chatLog.slice(0, sliceEnd)
        }
      }

      // 2. 回退：旧格式的 per-snapshot 分片存储
      if (!chatLog || chatLog.length === 0) {
        chatLog = await loadChunkedChatLog(snapshotId)
      }

      if (chatLog && chatLog.length > 0) {
        fullSnapshot = { ...fullSnapshot, chatLog }
      }
    }

    // Phase 2: 使用 applyGameStateToStore 统一恢复逻辑（自动处理 v3→v4 迁移）
    const state = fullSnapshot.gameState
    const defaults = createInitialState()
    applyGameStateToStore(this, state, defaults)

    // 如果迁移后没有 runId，生成一个
    if (!this.meta.currentRunId || this.meta.currentRunId === 'temp_editing') {
      this.meta.currentRunId = Date.now().toString(36)
    }

    // 如果 npcRelationships 为空，重新初始化
    if (Object.keys(this.world.npcRelationships || {}).length === 0) {
      await this.initializeNpcRelationships()
    }

    await rehydratePlayerSummaryEmbeddings(this)

    this.saveToStorage(true)

    await this.rebuildWorldbookState()
    this.checkAndNotifyDeliveries()

    // 恢复后将关系数据保存到 IndexedDB，确保存档隔离
    try {
      const { saveNpcRelationships, removeNpcRelationships } = await import('../../utils/indexedDB')
      const { clearPendingSocialData } = await import('../../utils/relationshipManager')
      clearPendingSocialData()  // 清空旧存档的 pending 写入
      if (this.meta.currentRunId && this.meta.currentRunId !== 'temp_editing' && this.world.npcRelationships) {
        try {
          // 【修复】先删除旧的 IndexedDB 数据，确保存档编辑的关系数据生效
          await removeNpcRelationships(this.meta.currentRunId)
          console.log('[snapshotActions] Cleared stale relationship data for runId:', this.meta.currentRunId)

          const cloned = fastClone(this.world.npcRelationships)
          await saveNpcRelationships(this.meta.currentRunId, cloned)
        } catch (cloneError) {
          console.error('[snapshotActions] Failed to clone npcRelationships:', cloneError)
          console.error('[snapshotActions] Problematic data:', this.world.npcRelationships)
          throw cloneError
        }
      }
    } catch (e) {
      console.warn('[snapshotActions] Failed to save relationships to IndexedDB:', e)
    }

    // 确保所有 NPC 都被初始化（处理旧存档只有本班 NPC 的情况）
    if (this.initializeAllClassNpcs) {
      this.initializeAllClassNpcs()
    }

    // 恢复后同步学业世界书条目
    try {
      await updateAcademicWorldbookEntry(this)
    } catch (e) {
      console.warn('[snapshotActions] Failed to sync academic worldbook after restore:', e)
    }

    return fullSnapshot
  },

  /**
   * 删除存档快照
   */
  async deleteSnapshot(this: any, snapshotId: string) {
    const index = this._ui.saveSnapshots.findIndex((s: SaveSnapshot) => s.id === snapshotId)
    if (index !== -1) {
      this._ui.saveSnapshots.splice(index, 1)
      this.saveToStorage(true)

      // 删除快照数据和分片数据
      try {
        await removeSnapshotData(snapshotId)
        const { removeChunkedChatLog } = await import('../../utils/indexedDB')
        await removeChunkedChatLog(snapshotId)
        console.log(`[GameStore] Deleted snapshot ${snapshotId} and chunks`)
      } catch (e) {
        console.warn('[GameStore] Failed to delete snapshot data:', e)
      }
    }
  },

  /**
   * 自动清理旧快照
   * 保留最近的手动存档和每个run的自动存档
   */
  async autoCleanupSnapshots(this: any) {
    if (!this.settings.autoCleanupEnabled) {
      return
    }

    const maxManualSaves = this.settings.maxManualSaves || 50
    const maxAutoSavesPerRun = 5

    // 分类快照：手动存档 vs 自动存档
    const manualSnapshots: SaveSnapshot[] = []
    const autoSavesByRun: Record<string, SaveSnapshot[]> = {}

    for (const snapshot of this._ui.saveSnapshots) {
      if (snapshot.id.startsWith('autosave_')) {
        const runId = snapshot.id.replace('autosave_', '')
        if (!autoSavesByRun[runId]) {
          autoSavesByRun[runId] = []
        }
        autoSavesByRun[runId].push(snapshot)
      } else {
        manualSnapshots.push(snapshot)
      }
    }

    const toDelete: string[] = []

    // 清理超出限制的手动存档（保留最新的）
    if (manualSnapshots.length > maxManualSaves) {
      const sorted = manualSnapshots.sort((a, b) => b.timestamp - a.timestamp)
      const excess = sorted.slice(maxManualSaves)
      toDelete.push(...excess.map(s => s.id))
      console.log(`[AutoCleanup] Marking ${excess.length} old manual saves for deletion`)
    }

    // 清理每个run的旧自动存档（保留最新的N个）
    for (const [runId, snapshots] of Object.entries(autoSavesByRun)) {
      if (snapshots.length > maxAutoSavesPerRun) {
        const sorted = snapshots.sort((a, b) => b.timestamp - a.timestamp)
        const excess = sorted.slice(maxAutoSavesPerRun)
        toDelete.push(...excess.map(s => s.id))
        console.log(`[AutoCleanup] Marking ${excess.length} old auto saves for run ${runId}`)
      }
    }

    // 执行删除
    if (toDelete.length > 0) {
      console.log(`[AutoCleanup] Deleting ${toDelete.length} old snapshots...`)
      for (const id of toDelete) {
        await this.deleteSnapshot(id)
      }
      console.log(`[AutoCleanup] Cleanup complete`)
    }
  },

  /**
   * 更新存档标签
   */
  updateSnapshotLabel(this: any, snapshotId: string, newLabel: string) {
    const snapshot = this._ui.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    if (snapshot) {
      snapshot.label = newLabel
      this.saveToStorage()
    }
  },

  /**
   * 获取当前游戏状态的深拷贝
   */
  getGameState(this: any): GameStateData {
    // Phase 2: 使用 collectGameStateFromStore 自动收集分层数据
    const collected = collectGameStateFromStore(this)
    collected.player = clonePlayerForSnapshot(collected.player)
    return fastClone(collected) as GameStateData
  },

  /**
   * 获取轻量级快照（用于增量模式下的消息内联）
   */
  getLightSnapshot(this: any): object {
    return createLightSnapshot(this.getGameState())
  },

  /**
   * 创建消息内联快照（使用增量模式）
   * @param previousSnapshot 上一条消息的快照（用于计算增量）
   * @param floor 当前楼层
   * @param chatLog 聊天日志（用于查找基准快照计算更精确的增量）
   */
  createMessageSnapshot(this: any, previousSnapshot: any, floor: number, chatLog?: any[]): any {
    // 统一使用增量模式
    // 获取精简版 gameState（不含 summaries/persistentFacts），用于内联快照
    // Phase 1.2: 同时剥离静态字段（allClassData, allClubs, npcRelationships 等）
    const currentState = stripStaticFields(stripBulkyFields(this.getGameState()))

    // 如果没有上一个快照，必须创建基准快照
    if (!previousSnapshot) {
      this.meta._lastBaseFloor = floor
      return {
        ...currentState,
        _isBase: true,
        _floor: floor
      }
    }

    // 如果上一个快照是基准快照
    if (previousSnapshot._isBase) {
      // 检查是否应该创建新的基准快照
      const lastBaseFloor = this.meta._lastBaseFloor || 0
      if (shouldCreateBaseSnapshot(floor, lastBaseFloor)) {
        this.meta._lastBaseFloor = floor
        return {
          ...currentState,
          _isBase: true,
          _floor: floor
        }
      }
      // 从基准快照开始计算增量
      return computeDelta(previousSnapshot, currentState, previousSnapshot._floor)
    }

    // 如果上一个快照是增量快照，尝试找到基准快照进行更精确的增量计算
    if (isDeltaSnapshot(previousSnapshot)) {
      const baseFloor = previousSnapshot._baseFloor
      let baseSnapshot = null

      // 在聊天日志中查找基准快照
      if (chatLog) {
        for (let i = 0; i < chatLog.length; i++) {
          const log = chatLog[i]
          if (log.snapshot && (log.snapshot as any)._isBase && (log.snapshot as any)._floor === baseFloor) {
            baseSnapshot = log.snapshot
            break
          }
        }
      }

      // 检查是否应该创建新的基准快照
      const lastBaseFloor = this.meta._lastBaseFloor || 0
      if (shouldCreateBaseSnapshot(floor, lastBaseFloor)) {
        this.meta._lastBaseFloor = floor
        return {
          ...currentState,
          _isBase: true,
          _floor: floor
        }
      }

      // 使用找到的基准快照计算增量，如果找不到则传 null（会记录所有字段的当前值）
      return computeDelta(baseSnapshot, currentState, baseFloor)
    }

    // 默认：创建增量快照（以楼层 0 为基准）
    return computeDelta(previousSnapshot, currentState, 0)
  },

  /**
   * 从快照还原游戏状态（支持增量快照）
   * @param snapshot 快照（可能是完整或增量）
   * @param chatLog 聊天日志（用于查找基准快照）
   */
  async restoreFromMessageSnapshot(this: any, snapshot: any, chatLog: ChatLogEntry[]): Promise<void> {
    if (!snapshot) return

    // 如果是完整快照（包含 _isBase 或普通完整快照）
    if (snapshot._isBase || !isDeltaSnapshot(snapshot)) {
      await this.restoreGameState(snapshot)
    } else {
      // 如果是增量快照，需要找到基准快照并应用增量
      const baseFloor = snapshot._baseFloor
      let baseSnapshot: GameStateData | null = null

      // 在聊天日志中查找基准快照
      for (let i = 0; i < chatLog.length; i++) {
        const log = chatLog[i]
        if (log.snapshot && (log.snapshot as any)._isBase && (log.snapshot as any)._floor === baseFloor) {
          baseSnapshot = log.snapshot as GameStateData
          break
        }
      }

      if (!baseSnapshot) {
        console.warn(`[snapshotActions] Base snapshot not found for floor ${baseFloor}, trying fallback...`)

        // 改进：从目标 baseFloor 向前查找最近的基准快照
        let fallbackFloor = -1
        for (let i = 0; i < chatLog.length; i++) {
          const log = chatLog[i]
          if (log.snapshot && (log.snapshot as any)._isBase) {
            const snapshotFloor = (log.snapshot as any)._floor
            // 找到小于等于 baseFloor 的最近基准快照
            if (snapshotFloor <= baseFloor && snapshotFloor > fallbackFloor) {
              fallbackFloor = snapshotFloor
              baseSnapshot = log.snapshot as GameStateData
            }
          }
        }

        if (baseSnapshot) {
          console.log(`[snapshotActions] Found fallback base snapshot at floor ${fallbackFloor} (target was ${baseFloor})`)
        } else {
          // 最后的fallback：使用任何完整快照
          for (let i = chatLog.length - 1; i >= 0; i--) {
            const log = chatLog[i]
            if (log.snapshot && !isDeltaSnapshot(log.snapshot)) {
              console.log(`[snapshotActions] Using complete snapshot at floor ${i} as fallback`)
              baseSnapshot = log.snapshot as GameStateData
              break
            }
          }
        }

        if (!baseSnapshot) {
          throw new Error('无法找到基准快照，无法恢复增量快照。请尝试回溯到更早的消息，或切换到完整快照模式。')
        }
      }

      // 应用增量（此时 baseSnapshot 一定不为 null）
      const restoredState = applyDelta(baseSnapshot!, snapshot as DeltaSnapshot)
      await this.restoreGameState(restoredState)
    }

    // Post-restore: 保存关系数据到 IndexedDB，确保存档隔离
    try {
      const { saveNpcRelationships, removeNpcRelationships } = await import('../../utils/indexedDB')
      const { clearPendingSocialData } = await import('../../utils/relationshipManager')
      clearPendingSocialData()
      if (this.meta.currentRunId && this.meta.currentRunId !== 'temp_editing' && this.world.npcRelationships) {
        // 【修复】先删除旧的 IndexedDB 数据，确保回溯时关系数据正确
        await removeNpcRelationships(this.meta.currentRunId)
        await saveNpcRelationships(
          this.meta.currentRunId,
          fastClone(this.world.npcRelationships)
        )
      }
    } catch (e) {
      console.warn('[snapshotActions] Failed to save relationships after message restore:', e)
    }

    // 确保所有 NPC 都被初始化
    if (this.initializeAllClassNpcs) {
      this.initializeAllClassNpcs()
    }
  },

  /**
   * 清理超出限制的旧快照（保留 snapshotLimit 层以内的快照）
   * @param chatLog 聊天日志
   */
  cleanupSnapshots(this: any, chatLog: ChatLogEntry[]): void {
    const limit = this.settings.snapshotLimit || 10
    const totalLogs = chatLog.length

    if (totalLogs <= limit) return

    // 清理超出范围的快照（只清理内联快照，不清理存档快照）
    const cutoffIndex = totalLogs - limit

    // 第一步：收集所有仍在使用的基准快照楼层
    const activeBaseFloors = new Set<number>()
    for (let i = cutoffIndex; i < totalLogs; i++) {
      const log = chatLog[i]
      if (log.snapshot) {
        if ((log.snapshot as any)._isBase) {
          activeBaseFloors.add((log.snapshot as any)._floor)
        } else if (isDeltaSnapshot(log.snapshot)) {
          activeBaseFloors.add((log.snapshot as DeltaSnapshot)._baseFloor)
        }
      }
    }

    // 第二步：清理快照，但保留仍被依赖的基准快照
    for (let i = 0; i < cutoffIndex; i++) {
      const log = chatLog[i]
      if (log.snapshot) {
        // 如果是基准快照，检查是否还有增量快照依赖它
        if ((log.snapshot as any)._isBase) {
          const baseFloor = (log.snapshot as any)._floor

          // 如果这个基准快照仍被保留范围内的快照依赖，则不删除
          if (activeBaseFloors.has(baseFloor)) {
            console.log(`[Snapshot] Keeping base snapshot at floor ${baseFloor} (still in use)`)
            continue
          }

          // 新增：检查是否是最近的基准快照（保留最后一个基准快照作为安全fallback）
          const isLatestBase = !Array.from(activeBaseFloors).some(f => f > baseFloor)
          if (isLatestBase && activeBaseFloors.size > 0) {
            console.log(`[Snapshot] Keeping base snapshot at floor ${baseFloor} (latest base before cutoff)`)
            continue
          }

          // 否则可以安全删除
          console.log(`[Snapshot] Deleting unused base snapshot at floor ${baseFloor}`)
          delete log.snapshot
        } else {
          // 非基准快照可以直接清理
          delete log.snapshot
        }
      }

      // 只清理超出范围的 preVariableSnapshot
      if (i < cutoffIndex && log.preVariableSnapshot) {
        delete log.preVariableSnapshot
      }
    }
  },

  /**
   * 更新现有消息的快照（保持增量快照链的完整性）
   * @param existingSnapshot 现有的快照
   * @param chatLog 聊天日志（用于查找基准快照）
   * @returns 更新后的快照
   */
  updateMessageSnapshot(this: any, existingSnapshot: any, chatLog?: any[]): any {
    // 获取精简版 gameState（不含 summaries/persistentFacts 和静态字段），用于内联快照
    const currentState = stripStaticFields(stripBulkyFields(this.getGameState()))

    // 如果没有现有快照，创建完整快照
    if (!existingSnapshot) {
      return currentState
    }

    // 如果现有快照是基准快照，更新后仍然保持为基准快照
    if (existingSnapshot._isBase) {
      return {
        ...currentState,
        _isBase: true,
        _floor: existingSnapshot._floor
      }
    }

    // 如果现有快照是增量快照，需要重新计算增量
    if (isDeltaSnapshot(existingSnapshot)) {
      const baseFloor = existingSnapshot._baseFloor
      let baseSnapshot = null

      // 在聊天日志中查找基准快照
      if (chatLog) {
        for (let i = 0; i < chatLog.length; i++) {
          const log = chatLog[i]
          if (log.snapshot && (log.snapshot as any)._isBase && (log.snapshot as any)._floor === baseFloor) {
            baseSnapshot = log.snapshot
            break
          }
        }
      }

      // 重新计算增量
      return computeDelta(baseSnapshot, currentState, baseFloor)
    }

    // 普通完整快照：直接返回完整状态
    return currentState
  },

  /**
   * 恢复指定的游戏状态
   * Phase 2: 支持 v3 旧版扁平格式和 v4 分层格式，自动迁移
   */
  async restoreGameState(this: any, state: any) {
    const data = fastClone(state)

    // 【修复】如果内联快照中 summaries/persistentFacts 被剥离（空数组），
    // 保留当前 store 中的数据（这些累积数据在 gameState 存档中独立维护）
    // 通过 _summariesCount 标记区分"被 stripBulkyFields 剥离的快照"和"完整存档"
    const player = data.player
    if (player) {
      if (Array.isArray(player.summaries) && player.summaries.length === 0 && player._summariesCount !== undefined) {
        player.summaries = this.player?.summaries || []
        delete player._summariesCount
      }
      if (Array.isArray(player.persistentFacts) && player.persistentFacts.length === 0 && player._persistentFactsCount !== undefined) {
        player.persistentFacts = this.player?.persistentFacts || []
        delete player._persistentFactsCount
      }
    }

    // Phase 2: 使用 applyGameStateToStore 统一恢复（自动处理 v3→v4 迁移）
    const defaults = createInitialState()
    applyGameStateToStore(this, data, defaults)

    await rehydratePlayerSummaryEmbeddings(this)
  }
}
