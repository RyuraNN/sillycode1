/**
 * 存档快照相关 Actions
 */

import type { ChatLogEntry, SaveSnapshot, GameStateData } from '../gameStoreTypes'
import { saveSnapshotData, getSnapshotData, removeSnapshotData } from '../../utils/indexedDB'

export const snapshotActions = {
  /**
   * 创建存档快照
   */
  async createSnapshot(this: any, chatLog: ChatLogEntry[], messageIndex: number, label?: string) {
    const gameState: GameStateData = JSON.parse(JSON.stringify({
      player: this.player,
      npcs: this.npcs,
      npcRelationships: this.npcRelationships,
      gameTime: this.gameTime,
      settings: this.settings,
      worldState: this.worldState,
      allClassData: this.allClassData,
      currentRunId: this.currentRunId,
      currentFloor: this.currentFloor
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
      gameTime: this.gameTime,
      settings: this.settings,
      worldState: this.worldState,
      allClassData: this.allClassData,
      currentRunId: this.currentRunId,
      currentFloor: this.currentFloor
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
    
    this.currentRunId = state.currentRunId || Date.now().toString(36)
    this.currentFloor = state.currentFloor || 0
    
    this.saveToStorage(true)

    await this.rebuildWorldbookState()
    this.checkAndNotifyDeliveries()

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
      gameTime: this.gameTime,
      settings: this.settings,
      worldState: this.worldState,
      allClassData: this.allClassData
    }))
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
    // @ts-ignore
    if (data.currentRunId) this.currentRunId = data.currentRunId
    // @ts-ignore
    if (data.currentFloor) this.currentFloor = data.currentFloor
  }
}
