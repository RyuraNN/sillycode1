/**
 * 存储与导入导出相关 Actions
 */

import type { SaveSnapshot } from '../gameStoreTypes'
import { 
  setItem, 
  getItem, 
  migrateFromLocalStorage, 
  saveSnapshotData, 
  getSnapshotData,
  getRosterBackup,
  saveRosterBackup,
  getFullCharacterPool,
  saveFullCharacterPool,
  getRosterPresets,
  saveRosterPresets
} from '../../utils/indexedDB'
import { DEFAULT_RELATIONSHIPS, DEFAULT_PERSONALITIES, DEFAULT_GOALS, DEFAULT_PRIORITIES } from '../../data/relationshipData'

let saveTimer: any = null

export const storageActions = {
  /**
   * 初始化 NPC 关系数据 (如果不存在则填充默认值)
   */
  initializeNpcRelationships(this: any) {
    console.log('[GameStore] Initializing NPC relationships...')
    
    for (const [charName, relations] of Object.entries(DEFAULT_RELATIONSHIPS as Record<string, any>)) {
      if (!this.npcRelationships[charName]) {
        this.npcRelationships[charName] = {
          personality: (DEFAULT_PERSONALITIES as Record<string, any>)[charName] || { order: 0, altruism: 0, tradition: 0, peace: 0 },
          goals: (DEFAULT_GOALS as Record<string, any>)[charName] || { immediate: '', shortTerm: '', longTerm: '' },
          priorities: (DEFAULT_PRIORITIES as Record<string, any>)[charName] || { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
          relations: {}
        }
      }
      
      for (const [targetName, relData] of Object.entries(relations as Record<string, any>)) {
        if (!this.npcRelationships[charName].relations[targetName]) {
          this.npcRelationships[charName].relations[targetName] = JSON.parse(JSON.stringify(relData))
        }
      }
    }
  },

  /**
   * 初始化：从存储加载 (支持 IndexedDB 迁移)
   */
  async initFromStorage(this: any) {
    try {
      await migrateFromLocalStorage([
        'school_game_snapshots',
        'school_game_settings',
        'school_game_run_id'
      ])

      const snapshots = await getItem('school_game_snapshots')
      if (snapshots) {
        let migrated = false
        const loadedSnapshots = [...snapshots]
        
        for (let i = 0; i < loadedSnapshots.length; i++) {
          const s = loadedSnapshots[i]
          if (s.gameState || s.chatLog) {
            console.log(`[GameStore] Migrating snapshot ${s.id} to split storage...`)
            try {
              if (s.gameState) {
                s.gameTime = {
                  year: s.gameState.gameTime.year,
                  month: s.gameState.gameTime.month,
                  day: s.gameState.gameTime.day,
                  hour: s.gameState.gameTime.hour,
                  minute: s.gameState.gameTime.minute
                }
                s.location = s.gameState.player.location
              }

              await saveSnapshotData(s.id, {
                gameState: s.gameState,
                chatLog: s.chatLog
              })
              delete s.gameState
              delete s.chatLog
              migrated = true
            } catch (e) {
              console.error(`[GameStore] Failed to migrate snapshot ${s.id}:`, e)
            }
          }
          
          if (i % 1 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }

        this.saveSnapshots = loadedSnapshots
        
        if (migrated) {
          console.log('[GameStore] Migration complete, saving lightweight snapshots list.')
          this.saveToStorage(true)
        }
      }

      const settings = await getItem('school_game_settings')
      if (settings) {
        const defaultSummarySettings = { ...this.settings.summarySystem }
        const loadedSummarySettings = settings.summarySystem || {}
        
        this.settings = { ...this.settings, ...settings }
        
        this.settings.summarySystem = {
          ...defaultSummarySettings,
          ...loadedSummarySettings
        }

        const defaultTags = ['content', '正文', 'gametxt', 'game']
        if (!this.settings.customContentTags) {
          this.settings.customContentTags = [...defaultTags]
        } else {
          for (const tag of defaultTags) {
            if (!this.settings.customContentTags.includes(tag)) {
              this.settings.customContentTags.push(tag)
            }
          }
        }
      }

      const lastRunId = await getItem('school_game_run_id')
      if (lastRunId) {
        this.currentRunId = lastRunId
      }
      
      await this.rebuildWorldbookState()
      // 注意：initializeNpcRelationships 必须在 rebuildWorldbookState 之后调用，
      // 因为 rebuildWorldbookState 会加载班级数据，而关系初始化需要用到班级数据中的角色列表
      this.initializeNpcRelationships()
      this.checkAndNotifyDeliveries()
      
      console.log('[GameStore] Initialized from storage (IndexedDB)')
    } catch (e) {
      console.error('Failed to load from storage', e)
    }
  },

  /**
   * 保存到存储 (IndexedDB)
   */
  async saveToStorage(this: any, force = false) {
    const doSave = async () => {
      try {
        await setItem('school_game_snapshots', JSON.parse(JSON.stringify(this.saveSnapshots)))
        await setItem('school_game_settings', JSON.parse(JSON.stringify(this.settings)))
        await setItem('school_game_run_id', this.currentRunId)
      } catch (e) {
        console.error('Failed to save to storage', e)
        console.warn('存档保存可能失败，请检查控制台')
      }
    }

    if (force) {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      await doSave()
    } else {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(doSave, 1000)
    }
  },

  /**
   * 导出存档数据
   */
  async getExportData(this: any) {
    const fullSnapshots = []
    for (const snapshot of this.saveSnapshots) {
      let fullSnapshot = { ...snapshot }
      if (!fullSnapshot.gameState || !fullSnapshot.chatLog) {
        const details = await getSnapshotData(snapshot.id)
        if (details) {
          fullSnapshot = { ...fullSnapshot, ...details }
        }
      }
      fullSnapshots.push(fullSnapshot)
    }

    // 获取扩展数据 (IndexedDB)
    const rosterBackup = await getRosterBackup()
    const fullCharacterPool = await getFullCharacterPool()
    const rosterPresets = await getRosterPresets()

    return JSON.stringify({
      version: 2, // 升级版本号
      timestamp: Date.now(),
      snapshots: fullSnapshots,
      extraData: {
        rosterBackup,
        fullCharacterPool,
        rosterPresets
      }
    })
  },

  /**
   * 导入存档数据
   */
  async importSaveData(this: any, jsonStr: string) {
    try {
      const data = JSON.parse(jsonStr)
      let loadedSnapshots: SaveSnapshot[] = []

      if (Array.isArray(data)) {
        loadedSnapshots = data
      } else if (data.snapshots && Array.isArray(data.snapshots)) {
        loadedSnapshots = data.snapshots
      } else {
        throw new Error('Invalid save data format')
      }

      // 恢复扩展数据 (如果存在)
      if (data.extraData) {
        console.log('[GameStore] Importing extra data from save file...')
        const { rosterBackup, fullCharacterPool, rosterPresets } = data.extraData
        
        if (rosterBackup) {
          await saveRosterBackup(rosterBackup)
          console.log('[GameStore] Restored roster backup')
        }
        
        if (fullCharacterPool) {
          await saveFullCharacterPool(fullCharacterPool)
          console.log('[GameStore] Restored full character pool')
        }
        
        if (rosterPresets) {
          await saveRosterPresets(rosterPresets)
          console.log('[GameStore] Restored roster presets')
        }
      }

      const processedSnapshots: SaveSnapshot[] = []
      
      for (let i = 0; i < loadedSnapshots.length; i++) {
        const s = loadedSnapshots[i]
        const snapshot = { ...s }
        
        if (snapshot.gameState || snapshot.chatLog) {
          await saveSnapshotData(snapshot.id, {
            gameState: snapshot.gameState,
            chatLog: snapshot.chatLog
          })
          
          delete snapshot.gameState
          delete snapshot.chatLog
        }
        
        processedSnapshots.push(snapshot)

        if (i % 1 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      this.saveSnapshots = processedSnapshots
      this.saveToStorage(true)
      
      // 在 rebuildWorldbookState 之前，从最新快照预加载玩家创建的社团
      // 这是为了确保玩家创建的社团在导入到新设备时能被正确重建
      if (processedSnapshots.length > 0) {
        const sortedSnapshots = [...processedSnapshots].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        const latestSnapshot = sortedSnapshots[0]
        
        if (latestSnapshot) {
          const details = await getSnapshotData(latestSnapshot.id)
          if (details && details.gameState) {
            // 预加载玩家创建的社团（ID 以 player_club_ 开头）
            if (details.gameState.allClubs) {
              if (!this.allClubs) this.allClubs = {}
              for (const [clubId, club] of Object.entries(details.gameState.allClubs)) {
                if (clubId.startsWith('player_club_')) {
                  console.log(`[GameStore] Pre-loading player created club: ${clubId}`)
                  this.allClubs[clubId] = club
                }
              }
            }
            
            // 同时恢复 currentRunId 和 player，因为 rebuildWorldbookState 需要用到
            if (details.gameState.currentRunId) {
              this.currentRunId = details.gameState.currentRunId
            }
            if (details.gameState.player) {
              this.player = details.gameState.player
            }
          }
        }
      }
      
      await this.rebuildWorldbookState()
      
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  },

  /**
   * 切换夜间模式
   */
  toggleDarkMode(this: any) {
    this.settings.darkMode = !this.settings.darkMode
    this.saveToStorage()
  }
}
