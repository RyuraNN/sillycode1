/**
 * 存档快照相关 Actions
 */

import type { ChatLogEntry, SaveSnapshot, GameStateData } from '../gameStoreTypes'
import { saveSnapshotData, getSnapshotData, removeSnapshotData, loadChunkedChatLog } from '../../utils/indexedDB'
import { updateAcademicWorldbookEntry } from '../../utils/academicWorldbook'
import { createInitialState } from '../gameStoreState'
import {
  computeDelta,
  applyDelta,
  isDeltaSnapshot,
  shouldCreateBaseSnapshot,
  createLightSnapshot,
  fastClone,
  type DeltaSnapshot
} from '../../utils/snapshotUtils'
import { detectCardEdition, GAME_VERSION } from '../../utils/editionDetector'

/**
 * 精简 chatLog 拷贝，移除冗余字段
 * @param chatLog 原始聊天记录
 * @returns 精简后的聊天记录
 */
function createLightChatLogCopy(chatLog: ChatLogEntry[]): ChatLogEntry[] {
  return chatLog.map(log => {
    const lightLog: any = {
      type: log.type,
      content: log.content,
      // 不保存: rawContent, preVariableSnapshot（可从 snapshot 恢复）
    }

    // 深拷贝 snapshot，移除 Proxy 和不可克隆对象
    if (log.snapshot) {
      try {
        lightLog.snapshot = fastClone(log.snapshot)
      } catch (e) {
        console.warn('[createLightChatLogCopy] Failed to serialize snapshot:', e)
        // 如果序列化失败，跳过该 snapshot
      }
    }

    return lightLog as ChatLogEntry
  })
}

export const snapshotActions = {
  /**
   * 创建存档快照
   */
  async createSnapshot(this: any, chatLog: ChatLogEntry[], messageIndex: number, label?: string) {
    // 深拷贝 player 并剥离 embedding 向量，避免快照体积膨胀
    const playerCopy = fastClone(this.player)
    if (Array.isArray(playerCopy.summaries)) {
      for (const s of playerCopy.summaries) {
        delete s.embedding
      }
    }

    const gameState: GameStateData = fastClone({
      player: playerCopy,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      graduatedNpcs: this.graduatedNpcs || [],
      lastAcademicYear: this.lastAcademicYear || 0,
      gameTime: this.gameTime,
      // settings: this.settings, // Settings are global and should not be part of the snapshot
      worldState: this.worldState,
      allClassData: this.allClassData,
      allClubs: this.allClubs,
      currentRunId: this.currentRunId,
      currentFloor: this.currentFloor,
      examHistory: this.examHistory || [],
      // 补充遗漏的动态数据
      electiveAcademicData: this.electiveAcademicData || {},
      lastExamDate: this.lastExamDate || null,
      eventChecks: this.eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' },
      clubApplication: this.clubApplication || null,
      clubRejection: this.clubRejection || null,
      clubInvitation: this.clubInvitation || null,
      npcElectiveSelections: this.npcElectiveSelections || {}
    })
    // 注意：characterNotes, customCoursePool, eventLibrary, eventTriggers 为全局或外部数据，不回溯

    const id = Date.now().toString()
    const logCopy = fastClone(chatLog)

    // 保存重数据到分离的 Store
    await saveSnapshotData(id, {
      gameState,
      chatLog: logCopy
    })

    // 保存轻量级元数据
    const snapshot: SaveSnapshot = {
      id,
      timestamp: Date.now(),
      label: label || `存档 ${this.saveSnapshots.length + 1}`,
      messageIndex,
      gameTime: {
        year: this.gameTime.year,
        month: this.gameTime.month,
        day: this.gameTime.day,
        hour: this.gameTime.hour,
        minute: this.gameTime.minute
      },
      location: this.player.location,
      cardEdition: detectCardEdition(),
      gameVersion: GAME_VERSION
    }

    this.saveSnapshots.push(snapshot)
    this.saveToStorage(true)
    return id
  },

  /**
   * 创建/更新自动存档
   */
  async createAutoSave(this: any, chatLog: ChatLogEntry[], messageIndex: number) {
    try {
      const gameState: GameStateData = fastClone({
        player: this.player,
        npcs: this.npcs,
        npcRelationships: this.npcRelationships,
        graduatedNpcs: this.graduatedNpcs || [],
        lastAcademicYear: this.lastAcademicYear || 0,
        gameTime: this.gameTime,
        // settings: this.settings, // Settings are global and should not be part of the snapshot
        worldState: this.worldState,
        allClassData: this.allClassData,
        allClubs: this.allClubs,
        currentRunId: this.currentRunId,
        currentFloor: this.currentFloor,
        examHistory: this.examHistory || [],
        // 补充遗漏的动态数据
        electiveAcademicData: this.electiveAcademicData || {},
        lastExamDate: this.lastExamDate || null,
        eventChecks: this.eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' },
        clubApplication: this.clubApplication || null,
        clubRejection: this.clubRejection || null,
        clubInvitation: this.clubInvitation || null,
        npcElectiveSelections: this.npcElectiveSelections || {}
      })
      // 注意：characterNotes, customCoursePool, eventLibrary, eventTriggers 为全局或外部数据，不回溯

      const autoSaveId = `autosave_${this.currentRunId}`

      // 精简 chatLog：移除冗余字段
      const logCopy = createLightChatLogCopy(chatLog)

      // 使用分片存储保存 chatLog
      const { saveChunkedChatLog } = await import('../../utils/indexedDB')
      await saveChunkedChatLog(autoSaveId, logCopy)

      // 保存 gameState（不分片，因为相对较小）
      const { saveSnapshotData } = await import('../../utils/indexedDB')
      await saveSnapshotData(autoSaveId, { gameState })

      const snapshot: SaveSnapshot = {
        id: autoSaveId,
        timestamp: Date.now(),
        label: `自动存档 (${this.player.name})`,
        messageIndex,
        gameTime: {
          year: this.gameTime.year,
          month: this.gameTime.month,
          day: this.gameTime.day,
          hour: this.gameTime.hour,
          minute: this.gameTime.minute
        },
        location: this.player.location,
        cardEdition: detectCardEdition(),
        gameVersion: GAME_VERSION
      }

      const existingIndex = this.saveSnapshots.findIndex((s: SaveSnapshot) => s.id === autoSaveId)

      if (existingIndex !== -1) {
        this.saveSnapshots[existingIndex] = snapshot
      } else {
        this.saveSnapshots.unshift(snapshot)
      }

      this.saveToStorage()
    } catch (e: any) {
      console.error('[createAutoSave] Failed to create auto save:', e)
      this.saveError = e.message || '自动存档失败'

      // 如果是 DataCloneError，提供更具体的错误信息
      if (e.name === 'DataCloneError') {
        this.saveError = '自动存档失败：数据包含不可序列化的对象'
        console.error('[createAutoSave] DataCloneError - chatLog may contain non-cloneable objects (Proxy, functions, etc.)')
      } else if (e.message?.includes('QuotaExceeded')) {
        this.saveError = '存储空间不足，请清理旧存档'
      }
    }
  },

  /**
   * 加载快照详情（用于预览）
   */
  async loadSnapshotDetails(this: any, snapshotId: string) {
    const snapshot = this.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    if (!snapshot) return null

    if (snapshot.chatLog && snapshot.gameState) {
      return snapshot
    }

    const details = await getSnapshotData(snapshotId)

    // 尝试加载分片 chatLog
    let chatLog = details?.chatLog
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
    const snapshotMeta = this.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
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

    // 自动存档的 chatLog 是分片存储的，需要单独加载
    if (!fullSnapshot.chatLog) {
      const chunkedLog = await loadChunkedChatLog(snapshotId)
      if (chunkedLog && chunkedLog.length > 0) {
        fullSnapshot = { ...fullSnapshot, chatLog: chunkedLog }
      }
    }

    const state = fastClone(fullSnapshot.gameState)

    // 【修复】状态合并：确保旧存档缺失的字段被默认值填充
    const defaultPlayer = createInitialState().player
    
    // 基础合并
    this.player = { ...defaultPlayer, ...state.player }
    
    // 深度合并关键对象
    if (state.player.partTimeJob) {
      this.player.partTimeJob = { ...defaultPlayer.partTimeJob, ...state.player.partTimeJob }
    }
    if (state.player.forum) {
      this.player.forum = { ...defaultPlayer.forum, ...state.player.forum }
    }
    if (state.player.social) {
      this.player.social = { ...defaultPlayer.social, ...state.player.social }
    }
    if (state.player.settings) {
      // 这里的 settings 应该是 gameStore.settings，player 下通常没有 settings
      // 但为了保险起见，如果 player 下有自定义设置...
    }
    
    // 确保 role 存在
    if (!this.player.role) {
      this.player.role = defaultPlayer.role
    }

    if (!this.player.summaries) {
      this.player.summaries = []
    }
    this.npcs = state.npcs
    this.gameTime = state.gameTime
    
    if (state.npcRelationships) {
      this.npcRelationships = state.npcRelationships
    } else {
      this.npcRelationships = {}
      await this.initializeNpcRelationships()
    }

    if (state.worldState) {
      this.worldState = state.worldState
    }
    if (state.allClassData) {
      this.allClassData = state.allClassData
    }
    if (state.allClubs) {
      this.allClubs = state.allClubs
    }

    // 恢复学年进级相关数据
    this.graduatedNpcs = state.graduatedNpcs || []
    this.lastAcademicYear = state.lastAcademicYear || 0

    // 恢复考试历史
    this.examHistory = state.examHistory || []

    // 恢复其他动态数据
    this.lastExamDate = (state as any).lastExamDate || null
    this.electiveAcademicData = (state as any).electiveAcademicData || {}
    this.eventChecks = (state as any).eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' }
    this.clubApplication = (state as any).clubApplication || null
    this.clubRejection = (state as any).clubRejection || null
    this.clubInvitation = (state as any).clubInvitation || null
    this.npcElectiveSelections = (state as any).npcElectiveSelections || {}

    this.currentRunId = state.currentRunId || Date.now().toString(36)
    this.currentFloor = state.currentFloor || 0

    this.saveToStorage(true)

    await this.rebuildWorldbookState()
    this.checkAndNotifyDeliveries()

    // 恢复后将关系数据保存到 IndexedDB，确保存档隔离
    try {
      const { saveNpcRelationships } = await import('../../utils/indexedDB')
      const { clearPendingSocialData } = await import('../../utils/relationshipManager')
      clearPendingSocialData()  // 清空旧存档的 pending 写入
      if (this.currentRunId && this.npcRelationships) {
        await saveNpcRelationships(
          this.currentRunId,
          fastClone(this.npcRelationships)
        )
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
    const index = this.saveSnapshots.findIndex((s: SaveSnapshot) => s.id === snapshotId)
    if (index !== -1) {
      this.saveSnapshots.splice(index, 1)
      this.saveToStorage(true)
      removeSnapshotData(snapshotId).catch((e: any) => console.warn('[GameStore] Failed to delete snapshot data:', e))
    }
  },

  /**
   * 更新存档标签
   */
  updateSnapshotLabel(this: any, snapshotId: string, newLabel: string) {
    const snapshot = this.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    if (snapshot) {
      snapshot.label = newLabel
      this.saveToStorage()
    }
  },

  /**
   * 获取当前游戏状态的深拷贝
   */
  getGameState(this: any): GameStateData {
    return fastClone({
      player: this.player,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      graduatedNpcs: this.graduatedNpcs || [],
      lastAcademicYear: this.lastAcademicYear || 0,
      gameTime: this.gameTime,
      // settings: this.settings, // Settings are global and should not be part of the snapshot
      worldState: this.worldState,
      allClassData: this.allClassData,
      allClubs: this.allClubs,
      currentRunId: this.currentRunId,
      currentFloor: this.currentFloor,
      examHistory: this.examHistory || [],
      // 补充遗漏的动态数据
      electiveAcademicData: this.electiveAcademicData || {},
      lastExamDate: this.lastExamDate || null,
      eventChecks: this.eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' },
      clubApplication: this.clubApplication || null,
      clubRejection: this.clubRejection || null,
      clubInvitation: this.clubInvitation || null,
      npcElectiveSelections: this.npcElectiveSelections || {}
    })
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
    const currentState = this.getGameState()

    // 如果没有上一个快照，必须创建基准快照
    if (!previousSnapshot) {
      this._lastBaseFloor = floor
      return {
        ...currentState,
        _isBase: true,
        _floor: floor
      }
    }

    // 如果上一个快照是基准快照
    if (previousSnapshot._isBase) {
      // 检查是否应该创建新的基准快照
      const lastBaseFloor = this._lastBaseFloor || 0
      if (shouldCreateBaseSnapshot(floor, lastBaseFloor)) {
        this._lastBaseFloor = floor
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
      const lastBaseFloor = this._lastBaseFloor || 0
      if (shouldCreateBaseSnapshot(floor, lastBaseFloor)) {
        this._lastBaseFloor = floor
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
      const { saveNpcRelationships } = await import('../../utils/indexedDB')
      const { clearPendingSocialData } = await import('../../utils/relationshipManager')
      clearPendingSocialData()
      if (this.currentRunId && this.npcRelationships) {
        await saveNpcRelationships(
          this.currentRunId,
          fastClone(this.npcRelationships)
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
    const currentState = this.getGameState()

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
   */
  async restoreGameState(this: any, state: GameStateData) {
    const data = fastClone(state)

    // 【修复】状态合并
    const defaultPlayer = createInitialState().player
    this.player = { ...defaultPlayer, ...data.player }
    
    // 深度合并关键对象
    if (data.player && data.player.partTimeJob) {
      this.player.partTimeJob = { ...defaultPlayer.partTimeJob, ...data.player.partTimeJob }
    }
    if (data.player && data.player.forum) {
      this.player.forum = { ...defaultPlayer.forum, ...data.player.forum }
    }
    if (data.player && data.player.social) {
      this.player.social = { ...defaultPlayer.social, ...data.player.social }
    }
    if (!this.player.role) {
      this.player.role = defaultPlayer.role
    }

    this.npcs = data.npcs
    this.gameTime = data.gameTime
    
    if (data.npcRelationships) {
      this.npcRelationships = data.npcRelationships
    } else {
      this.npcRelationships = {}
      await this.initializeNpcRelationships()
    }
    if (data.worldState) this.worldState = data.worldState
    if (data.allClassData) this.allClassData = data.allClassData
    if (data.allClubs) this.allClubs = data.allClubs
    
    // 恢复学年进级相关数据
    this.graduatedNpcs = data.graduatedNpcs || []
    this.lastAcademicYear = data.lastAcademicYear || 0
    
    // 恢复考试历史
    this.examHistory = data.examHistory || []
    
    // 恢复其他动态数据
    // @ts-ignore
    this.lastExamDate = data.lastExamDate || null
    // @ts-ignore
    this.electiveAcademicData = data.electiveAcademicData || {}
    // @ts-ignore
    this.eventChecks = data.eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' }
    // @ts-ignore
    this.clubApplication = data.clubApplication || null
    // @ts-ignore
    this.clubRejection = data.clubRejection || null
    // @ts-ignore
    this.clubInvitation = data.clubInvitation || null
    // @ts-ignore
    this.npcElectiveSelections = data.npcElectiveSelections || {}

    // @ts-ignore
    if (data.currentRunId !== undefined && data.currentRunId !== null) this.currentRunId = data.currentRunId
    // @ts-ignore
    if (data.currentFloor !== undefined && data.currentFloor !== null) this.currentFloor = data.currentFloor
  }
}
