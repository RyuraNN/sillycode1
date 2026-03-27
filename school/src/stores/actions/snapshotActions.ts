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

function getAllSnapshotMetas(store: any): SaveSnapshot[] {
  return [...(store._ui.saveSnapshots || []), ...(store._ui.mpSaveSnapshots || [])]
}

function findSnapshotMeta(store: any, snapshotId: string): SaveSnapshot | null {
  const single = store._ui.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
  if (single) return single
  const multi = store._ui.mpSaveSnapshots?.find((s: SaveSnapshot) => s.id === snapshotId)
  return multi || null
}

function buildRecoveredSnapshotMeta(snapshotId: string, details: any): SaveSnapshot {
  const gs = details?.gameState || {}
  const roomId = gs?.meta?.roomId || gs?.roomId
  const timestampNum = Number(snapshotId)
  const snapshot: SaveSnapshot = {
    id: snapshotId,
    timestamp: Number.isFinite(timestampNum) && timestampNum > 0 ? timestampNum : Date.now(),
    label: roomId ? '联机恢复存档' : '恢复存档',
    messageIndex: Number.isInteger(details?.messageIndex) ? details.messageIndex : 0,
    saveMode: roomId ? 'multiplayer' : 'single',
    cardEdition: details?.cardEdition || gs?.cardEdition || 'unknown',
    gameVersion: details?.gameVersion || gs?.gameVersion
  }

  const gameTime = gs?.world?.gameTime || gs?.gameTime
  if (gameTime && typeof gameTime === 'object') {
    snapshot.gameTime = {
      year: Number(gameTime.year) || 1,
      month: Number(gameTime.month) || 1,
      day: Number(gameTime.day) || 1,
      hour: Number(gameTime.hour) || 0,
      minute: Number(gameTime.minute) || 0
    }
  }

  const location = gs?.player?.location || gs?.location
  if (location) snapshot.location = location
  if (roomId) snapshot.roomId = roomId

  return snapshot
}

function attachRecoveredSnapshotMeta(store: any, snapshotId: string, details: any): SaveSnapshot {
  const recovered = buildRecoveredSnapshotMeta(snapshotId, details)
  if (recovered.saveMode === 'multiplayer') {
    store._ui.mpSaveSnapshots.unshift(recovered)
  } else {
    store._ui.saveSnapshots.unshift(recovered)
  }
  store.saveToStorage()
  return recovered
}

function inferSnapshotSaveMode(snapshot: Partial<SaveSnapshot> | null | undefined): 'single' | 'multiplayer' {
  if (!snapshot) return 'single'
  if (snapshot.saveMode === 'multiplayer') return 'multiplayer'
  if (typeof snapshot.roomId === 'string' && snapshot.roomId.length > 0) return 'multiplayer'
  return 'single'
}

function canRestoreMultiplayerSnapshot() {
  try {
    const mpStore = useMultiplayerStore()
    return !!mpStore.isMultiplayerActive
  } catch {
    return false
  }
}

type RestoreFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object'
type RestoreHealMode = 'none' | 'defaults' | 'custom'

interface RestoreIssue {
  path: string
  expectedType: RestoreFieldType
  reason: 'missing' | 'invalid_type'
  currentValue: any
  defaultValue: any
}

interface RestoreSnapshotMismatchResult {
  mismatch: true
  snapshotEdition: string
  currentEdition: string
}

interface RestoreSnapshotCorruptedResult {
  corrupted: true
  issues: RestoreIssue[]
}

interface RestoreSnapshotMultiplayerRestrictedResult {
  multiplayerRestricted: true
  roomId: string | null
}

interface RestoreSnapshotOptions {
  force?: boolean
  healMode?: RestoreHealMode
  healOverrides?: Record<string, any>
}

const RESTORE_HEAL_RULES: Array<{ path: string; expectedType: RestoreFieldType }> = [
  { path: 'meta', expectedType: 'object' },
  { path: 'meta.currentRunId', expectedType: 'string' },
  { path: 'meta.currentFloor', expectedType: 'number' },
  { path: 'world', expectedType: 'object' },
  { path: 'world.gameTime', expectedType: 'object' },
  { path: 'world.gameTime.year', expectedType: 'number' },
  { path: 'world.gameTime.month', expectedType: 'number' },
  { path: 'world.gameTime.day', expectedType: 'number' },
  { path: 'world.gameTime.hour', expectedType: 'number' },
  { path: 'world.gameTime.minute', expectedType: 'number' },
  { path: 'world.npcs', expectedType: 'array' },
  { path: 'world.npcRelationships', expectedType: 'object' },
  { path: 'world.allClassData', expectedType: 'object' },
  { path: 'world.allClubs', expectedType: 'object' },
  { path: 'player', expectedType: 'object' },
  { path: 'player.name', expectedType: 'string' },
  { path: 'player.inventory', expectedType: 'array' },
  { path: 'player.flags', expectedType: 'object' },
  { path: 'player.pendingCommands', expectedType: 'array' },
  { path: 'player.holdMessages', expectedType: 'array' },
  { path: 'player.systemNotifications', expectedType: 'array' },
  { path: 'player.social', expectedType: 'object' },
  { path: 'player.social.friends', expectedType: 'array' },
  { path: 'player.social.groups', expectedType: 'array' },
  { path: 'player.social.moments', expectedType: 'array' },
  { path: 'player.forum', expectedType: 'object' },
  { path: 'player.forum.posts', expectedType: 'array' },
  { path: 'player.forum.pendingCommands', expectedType: 'array' },
  { path: 'player.customCalendarEvents', expectedType: 'array' },
  { path: 'player.relationships', expectedType: 'object' },
  { path: 'academic', expectedType: 'object' },
  { path: 'events', expectedType: 'object' },
  { path: 'notifications', expectedType: 'object' },
  { path: 'rag', expectedType: 'object' },
  { path: 'rag.summaries', expectedType: 'array' },
  { path: 'rag.persistentFacts', expectedType: 'array' }
]

function safeCloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  try {
    return fastClone(value)
  } catch {
    return value
  }
}

function getPathValue(source: any, path: string): any {
  const keys = path.split('.')
  let current = source
  for (const key of keys) {
    if (current === undefined || current === null) return undefined
    current = current[key]
  }
  return current
}

function setPathValue(target: any, path: string, value: any) {
  const keys = path.split('.')
  let current = target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

function isValidRestoreType(value: any, expectedType: RestoreFieldType): boolean {
  if (value === undefined || value === null) return false
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && !Array.isArray(value)
    default:
      return false
  }
}

function resolveRestoreSnapshotArgs(
  forceOrOptions?: boolean | RestoreSnapshotOptions,
  manualOverrides?: Record<string, any>
): { force: boolean; healMode: RestoreHealMode; healOverrides: Record<string, any> } {
  let force = false
  let healMode: RestoreHealMode = 'defaults'
  let healOverrides: Record<string, any> = {}

  if (typeof forceOrOptions === 'boolean') {
    force = forceOrOptions
    if (manualOverrides && typeof manualOverrides === 'object') {
      healOverrides = manualOverrides
      if (Object.keys(healOverrides).length > 0) {
        healMode = 'custom'
      }
    }
    return { force, healMode, healOverrides }
  }

  if (forceOrOptions && typeof forceOrOptions === 'object') {
    force = !!forceOrOptions.force
    healOverrides = forceOrOptions.healOverrides && typeof forceOrOptions.healOverrides === 'object'
      ? forceOrOptions.healOverrides
      : {}
    if (forceOrOptions.healMode) {
      healMode = forceOrOptions.healMode
    } else if (Object.keys(healOverrides).length > 0) {
      healMode = 'custom'
    }
  }

  return { force, healMode, healOverrides }
}

function buildRestoreIssuesAndState(
  rawState: any,
  defaults: any,
  options: { healMode: RestoreHealMode; healOverrides?: Record<string, any> }
): { state: any; issues: RestoreIssue[] } {
  const migrated = isLegacyGameState(rawState) ? migrateGameStateData(rawState) : rawState
  const state = safeCloneValue(migrated)
  const issues: RestoreIssue[] = []
  const healOverrides = options.healOverrides || {}

  for (const rule of RESTORE_HEAL_RULES) {
    const currentValue = getPathValue(state, rule.path)
    if (isValidRestoreType(currentValue, rule.expectedType)) {
      continue
    }

    const defaultValue = safeCloneValue(getPathValue(defaults, rule.path))
    const issue: RestoreIssue = {
      path: rule.path,
      expectedType: rule.expectedType,
      reason: currentValue === undefined || currentValue === null ? 'missing' : 'invalid_type',
      currentValue: safeCloneValue(currentValue),
      defaultValue: safeCloneValue(defaultValue)
    }
    issues.push(issue)

    if (options.healMode !== 'none') {
      const overrideValue = healOverrides[rule.path]
      const hasValidOverride = overrideValue !== undefined && isValidRestoreType(overrideValue, rule.expectedType)
      const valueToUse = hasValidOverride ? overrideValue : defaultValue
      setPathValue(state, rule.path, safeCloneValue(valueToUse))
    }
  }

  return { state, issues }
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
    let snapshot = findSnapshotMeta(this, snapshotId)

    if (snapshot?.chatLog && snapshot?.gameState) {
      return snapshot
    }

    const details = await getSnapshotData(snapshotId)
    if (!snapshot && details) {
      snapshot = attachRecoveredSnapshotMeta(this, snapshotId, details)
    }
    if (!snapshot) return null

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
  async restoreSnapshot(
    this: any,
    snapshotId: string,
    forceOrOptions?: boolean | RestoreSnapshotOptions,
    manualHealOverrides?: Record<string, any>
  ): Promise<SaveSnapshot | null | RestoreSnapshotMismatchResult | RestoreSnapshotCorruptedResult | RestoreSnapshotMultiplayerRestrictedResult> {
    const { force, healMode, healOverrides } = resolveRestoreSnapshotArgs(forceOrOptions, manualHealOverrides)

    let snapshotMeta = findSnapshotMeta(this, snapshotId)
    if (!snapshotMeta) {
      const details = await getSnapshotData(snapshotId)
      if (!details) return null
      snapshotMeta = attachRecoveredSnapshotMeta(this, snapshotId, details)
    }

    if (inferSnapshotSaveMode(snapshotMeta) === 'multiplayer' && !canRestoreMultiplayerSnapshot()) {
      console.warn('[GameStore] Blocked multiplayer save restore outside multiplayer mode:', snapshotId)
      return {
        multiplayerRestricted: true,
        roomId: snapshotMeta.roomId || null
      }
    }

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

    // 兜底：chatLog 统一归一化，避免后续 restore 传递时出现 undefined
    if (!Array.isArray((fullSnapshot as any).chatLog)) {
      fullSnapshot = { ...fullSnapshot, chatLog: [] }
    }

    // Phase 2: 使用 applyGameStateToStore 统一恢复逻辑（自动处理 v3→v4 迁移）
    const state = fullSnapshot.gameState
    if (!state || typeof state !== 'object') {
      console.error('[GameStore] Snapshot missing or invalid gameState:', snapshotId, state)
      return null
    }

    const defaults = createInitialState()
    const restorePrepared = buildRestoreIssuesAndState(state, defaults, { healMode, healOverrides })
    if (restorePrepared.issues.length > 0) {
      if (healMode === 'none') {
        console.warn('[GameStore] Snapshot has corrupted fields, waiting user resolve:', restorePrepared.issues.map(i => i.path))
        return { corrupted: true, issues: restorePrepared.issues }
      }
      console.warn(`[GameStore] Auto-healed ${restorePrepared.issues.length} corrupted fields during restore`) 
    }

    applyGameStateToStore(this, restorePrepared.state, defaults)

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

    return restorePrepared.issues.length > 0
      ? { ...(fullSnapshot as any), _restoreHealIssues: restorePrepared.issues }
      : fullSnapshot
  },

  /**
   * 删除存档快照
   */
  async deleteSnapshot(this: any, snapshotId: string) {
    let removed = false
    const singleIndex = this._ui.saveSnapshots.findIndex((s: SaveSnapshot) => s.id === snapshotId)
    if (singleIndex !== -1) {
      this._ui.saveSnapshots.splice(singleIndex, 1)
      removed = true
    }
    const mpIndex = this._ui.mpSaveSnapshots.findIndex((s: SaveSnapshot) => s.id === snapshotId)
    if (mpIndex !== -1) {
      this._ui.mpSaveSnapshots.splice(mpIndex, 1)
      removed = true
    }

    if (removed) {
      this.saveToStorage(true)

      const stillReferenced = getAllSnapshotMetas(this).some((s: SaveSnapshot) => s.id === snapshotId)
      if (!stillReferenced) {
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

    // 分类快照：手动存档 vs 自动存档（包含单机与联机）
    const manualSnapshots: SaveSnapshot[] = []
    const autoSavesByRun: Record<string, SaveSnapshot[]> = {}

    for (const snapshot of getAllSnapshotMetas(this)) {
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
    const snapshot = findSnapshotMeta(this, snapshotId)
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

    const rag = data.rag
    if (rag) {
      if (Array.isArray(rag.summaries) && rag.summaries.length === 0 && rag._summariesCount !== undefined) {
        rag.summaries = this.rag?.summaries || this.player?.summaries || []
        delete rag._summariesCount
      }
      if (Array.isArray(rag.persistentFacts) && rag.persistentFacts.length === 0 && rag._persistentFactsCount !== undefined) {
        rag.persistentFacts = this.rag?.persistentFacts || this.player?.persistentFacts || []
        delete rag._persistentFactsCount
      }
    }

    const defaults = createInitialState()
    const restorePrepared = buildRestoreIssuesAndState(data, defaults, { healMode: 'defaults' })
    if (restorePrepared.issues.length > 0) {
      console.warn('[snapshotActions] Auto-healed corrupted fields during restoreGameState:', restorePrepared.issues.map(i => i.path))
    }

    // Phase 2: 使用 applyGameStateToStore 统一恢复（自动处理 v3→v4 迁移）
    applyGameStateToStore(this, restorePrepared.state, defaults)

    await rehydratePlayerSummaryEmbeddings(this)
  }
}
