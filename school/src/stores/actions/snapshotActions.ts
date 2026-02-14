/**
 * 存档快照相关 Actions
 */

import type { ChatLogEntry, SaveSnapshot, GameStateData } from '../gameStoreTypes'
import { saveSnapshotData, getSnapshotData, removeSnapshotData } from '../../utils/indexedDB'
import { updateAcademicWorldbookEntry } from '../../utils/academicWorldbook'
import { 
  computeDelta, 
  applyDelta, 
  isDeltaSnapshot, 
  shouldCreateBaseSnapshot,
  createLightSnapshot,
  type DeltaSnapshot 
} from '../../utils/snapshotUtils'

export const snapshotActions = {
  /**
   * 创建存档快照
   */
  async createSnapshot(this: any, chatLog: ChatLogEntry[], messageIndex: number, label?: string) {
    const gameState: GameStateData = JSON.parse(JSON.stringify({
      player: this.player,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      graduatedNpcs: this.graduatedNpcs || [],
      lastAcademicYear: this.lastAcademicYear || 0,
      gameTime: this.gameTime,
      settings: this.settings,
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
      clubInvitation: this.clubInvitation || null
      // 注意：characterNotes, customCoursePool, eventLibrary, eventTriggers 为全局或外部数据，不回溯
    }))

    const id = Date.now().toString()
    const logCopy = JSON.parse(JSON.stringify(chatLog))

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
      location: this.player.location
    }

    this.saveSnapshots.push(snapshot)
    this.saveToStorage(true)
    return id
  },

  /**
   * 创建/更新自动存档
   */
  async createAutoSave(this: any, chatLog: ChatLogEntry[], messageIndex: number) {
    const gameState: GameStateData = JSON.parse(JSON.stringify({
      player: this.player,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      graduatedNpcs: this.graduatedNpcs || [],
      lastAcademicYear: this.lastAcademicYear || 0,
      gameTime: this.gameTime,
      settings: this.settings,
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
      clubInvitation: this.clubInvitation || null
      // 注意：characterNotes, customCoursePool, eventLibrary, eventTriggers 为全局或外部数据，不回溯
    }))

    const autoSaveId = `autosave_${this.currentRunId}`
    const logCopy = JSON.parse(JSON.stringify(chatLog))

    await saveSnapshotData(autoSaveId, {
      gameState,
      chatLog: logCopy
    })

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
      location: this.player.location
    }

    const existingIndex = this.saveSnapshots.findIndex((s: SaveSnapshot) => s.id === autoSaveId)

    if (existingIndex !== -1) {
      this.saveSnapshots[existingIndex] = snapshot
    } else {
      this.saveSnapshots.unshift(snapshot)
    }

    this.saveToStorage()
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
    if (details) {
      return { ...snapshot, ...details }
    }
    return null
  },

  /**
   * 恢复存档快照
   */
  async restoreSnapshot(this: any, snapshotId: string): Promise<SaveSnapshot | null> {
    const snapshotMeta = this.saveSnapshots.find((s: SaveSnapshot) => s.id === snapshotId)
    if (!snapshotMeta) return null

    let fullSnapshot = snapshotMeta
    if (!snapshotMeta.gameState) {
      const details = await getSnapshotData(snapshotId)
      if (!details) {
        console.error('[GameStore] Failed to load snapshot details for', snapshotId)
        return null
      }
      fullSnapshot = { ...snapshotMeta, ...details }
    }

    const state = JSON.parse(JSON.stringify(fullSnapshot.gameState))
    this.player = state.player
    if (!this.player.summaries) {
      this.player.summaries = []
    }
    this.npcs = state.npcs
    this.gameTime = state.gameTime
    
    if (state.npcRelationships) {
      this.npcRelationships = state.npcRelationships
    } else {
      this.npcRelationships = {}
      this.initializeNpcRelationships()
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
    
    this.currentRunId = state.currentRunId || Date.now().toString(36)
    this.currentFloor = state.currentFloor || 0
    
    this.saveToStorage(true)

    await this.rebuildWorldbookState()
    this.checkAndNotifyDeliveries()
    
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
    return JSON.parse(JSON.stringify({
      player: this.player,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      graduatedNpcs: this.graduatedNpcs || [],
      lastAcademicYear: this.lastAcademicYear || 0,
      gameTime: this.gameTime,
      settings: this.settings,
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
      clubInvitation: this.clubInvitation || null
    }))
  },

  /**
   * 获取轻量级快照（用于增量模式下的消息内联）
   */
  getLightSnapshot(this: any): object {
    return createLightSnapshot(this.getGameState())
  },

  /**
   * 创建消息内联快照（根据模式选择完整或增量）
   * @param previousSnapshot 上一条消息的快照（用于计算增量）
   * @param floor 当前楼层
   * @param chatLog 聊天日志（用于查找基准快照计算更精确的增量）
   */
  createMessageSnapshot(this: any, previousSnapshot: any, floor: number, chatLog?: any[]): any {
    const mode = this.settings.snapshotMode || 'delta'
    
    if (mode === 'full') {
      // 完整模式：返回完整游戏状态
      return this.getGameState()
    }
    
    // 增量模式
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
  restoreFromMessageSnapshot(this: any, snapshot: any, chatLog: ChatLogEntry[]): void {
    if (!snapshot) return
    
    // 如果是完整快照（包含 _isBase 或普通完整快照）
    if (snapshot._isBase || !isDeltaSnapshot(snapshot)) {
      this.restoreGameState(snapshot)
      return
    }
    
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
      console.warn('[snapshotActions] Base snapshot not found for delta, trying fallback...')
      
      // 尝试在日志中寻找最近的完整快照或基准快照
      for (let i = chatLog.length - 1; i >= 0; i--) {
        const log = chatLog[i]
        // 找到任何一个基准快照或者非增量的完整快照
        if (log.snapshot && ((log.snapshot as any)._isBase || !isDeltaSnapshot(log.snapshot))) {
          console.log(`[snapshotActions] Found fallback snapshot at floor ${(log.snapshot as any)._floor || i}`)
          baseSnapshot = log.snapshot as GameStateData
          break
        }
      }
      
      if (!baseSnapshot) {
        console.error('[snapshotActions] Critical: No valid base snapshot found!')
        // 只有在实在找不到任何快照时才回退到当前状态，但这是危险的
        baseSnapshot = this.getGameState()
      }
    }
    
    // 应用增量（此时 baseSnapshot 一定不为 null）
    const restoredState = applyDelta(baseSnapshot!, snapshot as DeltaSnapshot)
    this.restoreGameState(restoredState)
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
    
    for (let i = 0; i < cutoffIndex; i++) {
      const log = chatLog[i]
      if (log.snapshot) {
        // 如果是基准快照，检查是否还有增量快照依赖它
        if ((log.snapshot as any)._isBase) {
          const baseFloor = (log.snapshot as any)._floor
          let hasDependent = false
          
          // 检查后续是否有增量快照依赖这个基准
          for (let j = i + 1; j < totalLogs; j++) {
            const laterLog = chatLog[j]
            if (laterLog.snapshot && isDeltaSnapshot(laterLog.snapshot) && 
                (laterLog.snapshot as DeltaSnapshot)._baseFloor === baseFloor) {
              hasDependent = true
              break
            }
          }
          
          // 如果没有依赖，可以清理
          if (!hasDependent) {
            delete log.snapshot
          }
        } else {
          // 非基准快照可以直接清理
          delete log.snapshot
        }
      }
      
      // 同样清理 preVariableSnapshot
      if (log.preVariableSnapshot) {
        delete log.preVariableSnapshot
      }
    }
  },

  /**
   * 恢复指定的游戏状态
   */
  restoreGameState(this: any, state: GameStateData) {
    const data = JSON.parse(JSON.stringify(state))
    this.player = data.player
    this.npcs = data.npcs
    this.gameTime = data.gameTime
    
    if (data.npcRelationships) {
      this.npcRelationships = data.npcRelationships
    } else {
      this.npcRelationships = {}
      this.initializeNpcRelationships()
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
    if (data.currentRunId !== undefined && data.currentRunId !== null) this.currentRunId = data.currentRunId
    // @ts-ignore
    if (data.currentFloor !== undefined && data.currentFloor !== null) this.currentFloor = data.currentFloor
  }
}
