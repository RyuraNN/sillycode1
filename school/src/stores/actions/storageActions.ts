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
  saveRosterPresets,
  clearAllData
} from '../../utils/indexedDB'
import { DEFAULT_RELATIONSHIPS, DEFAULT_PERSONALITIES, DEFAULT_GOALS, DEFAULT_PRIORITIES } from '../../data/relationshipData'
import { createInitialState } from '../gameStoreState'

let saveTimer: any = null

/** 当前存档数据结构版本号 */
const CURRENT_SCHEMA_VERSION = 3

/**
 * 带超时限制的 Promise 工具函数
 * @param promise 原始 Promise
 * @param ms 超时毫秒数
 * @param label 操作描述（用于日志）
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string = 'operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[GameStore] ⏰ ${label} timed out after ${ms}ms, skipping...`)
      reject(new Error(`Timeout: ${label} exceeded ${ms}ms`))
    }, ms)
    
    promise.then(
      (result) => { clearTimeout(timer); resolve(result) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}

/**
 * 安全执行异步操作，失败时不中断流程
 * @param fn 要执行的异步函数
 * @param label 操作描述
 * @param timeoutMs 超时毫秒数（默认 15 秒）
 */
async function safeExec(fn: () => Promise<any>, label: string, timeoutMs: number = 15000): Promise<boolean> {
  try {
    await withTimeout(fn(), timeoutMs, label)
    return true
  } catch (e) {
    console.warn(`[GameStore] ⚠️ ${label} failed:`, e)
    return false
  }
}

/**
 * 验证并修复设置数据结构
 * 确保所有嵌套对象和必要字段都存在，防止旧版存档缺少新字段导致运行时错误
 */
function validateAndRepairSettings(settings: any): any {
  const defaults = createInitialState().settings

  if (!settings || typeof settings !== 'object') {
    console.warn('[GameStore] Settings data is invalid, using defaults')
    return { ...defaults, _schemaVersion: CURRENT_SCHEMA_VERSION }
  }

  // 确保 assistantAI 对象完整
  if (!settings.assistantAI || typeof settings.assistantAI !== 'object') {
    settings.assistantAI = { ...defaults.assistantAI }
  } else {
    settings.assistantAI = { ...defaults.assistantAI, ...settings.assistantAI }
  }

  // 确保 summarySystem 对象完整
  if (!settings.summarySystem || typeof settings.summarySystem !== 'object') {
    settings.summarySystem = { ...defaults.summarySystem }
  } else {
    settings.summarySystem = { ...defaults.summarySystem, ...settings.summarySystem }
  }

  // 确保 ragSystem 对象完整
  if (!settings.ragSystem || typeof settings.ragSystem !== 'object') {
    settings.ragSystem = { ...defaults.ragSystem }
  } else {
    settings.ragSystem = { ...defaults.ragSystem, ...settings.ragSystem }
    // 深度合并嵌套对象
    settings.ragSystem.embedding = { ...defaults.ragSystem.embedding, ...(settings.ragSystem.embedding || {}) }
    settings.ragSystem.rerank = { ...defaults.ragSystem.rerank, ...(settings.ragSystem.rerank || {}) }
  }

  // 确保 retrySystem 对象完整
  if (!settings.retrySystem || typeof settings.retrySystem !== 'object') {
    settings.retrySystem = { ...defaults.retrySystem }
  } else {
    settings.retrySystem = { ...defaults.retrySystem, ...settings.retrySystem }
  }

  // 确保数值字段有效
  if (typeof settings.snapshotLimit !== 'number' || settings.snapshotLimit <= 0) {
    settings.snapshotLimit = defaults.snapshotLimit
  }
  if (!['full', 'delta'].includes(settings.snapshotMode)) {
    settings.snapshotMode = defaults.snapshotMode
  }
  if (typeof settings.socialHistoryLimit !== 'number' || settings.socialHistoryLimit <= 0) {
    settings.socialHistoryLimit = defaults.socialHistoryLimit
  }
  if (typeof settings.forumWorldbookLimit !== 'number' || settings.forumWorldbookLimit <= 0) {
    settings.forumWorldbookLimit = defaults.forumWorldbookLimit
  }

  // 确保布尔字段有效
  const boolFields = ['darkMode', 'streamResponse', 'suggestedReplies', 'enterToSend',
                       'independentImageGeneration', 'debugMode', 'debugUnlocked']
  for (const field of boolFields) {
    if (typeof settings[field] !== 'boolean') {
      settings[field] = (defaults as any)[field]
    }
  }

  // 确保 customRegexList 是数组
  if (!Array.isArray(settings.customRegexList)) {
    settings.customRegexList = [...defaults.customRegexList]
  }

  // 确保 customContentTags 是数组
  if (!Array.isArray(settings.customContentTags)) {
    settings.customContentTags = [...defaults.customContentTags]
  }

  // 可空字符串字段
  const nullableStringFields = [
    'customInstructionsPrompt', 'customStylePrompt', 'customCoreRulesPrompt'
  ]
  for (const field of nullableStringFields) {
    if (settings[field] !== null && typeof settings[field] !== 'string') {
      settings[field] = null
    }
  }

  // bannedWords 对象
  if (!settings.bannedWords || typeof settings.bannedWords !== 'object') {
    settings.bannedWords = { ...defaults.bannedWords }
  } else {
    settings.bannedWords = { ...defaults.bannedWords, ...settings.bannedWords }
  }
  if (!['instructions', 'style', 'coreRules'].includes(settings.bannedWords.position)) {
    settings.bannedWords.position = 'style'
  }

  // useGeminiMode 迁移：旧存档 useGeminiMode=true 时自动关闭禁词表
  if (settings.useGeminiMode && settings.bannedWords.enabled !== false) {
    settings.bannedWords.enabled = false
  }

  // 清除任何可能导致问题的非法字段
  // （删除已知已废弃的字段）
  const knownFields = new Set(Object.keys(defaults))
  knownFields.add('_schemaVersion')

  settings._schemaVersion = CURRENT_SCHEMA_VERSION

  return settings
}

/**
 * 验证快照数据结构是否有效
 */
function validateSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false
  if (!snapshot.id || typeof snapshot.id !== 'string') return false
  if (typeof snapshot.timestamp !== 'number') return false
  // 确保没有内联大数据（gameState/chatLog 应该已经被分离到 IndexedDB）
  return true
}

/**
 * 清理快照中的内联大数据（防止赋值给 Vue 响应式状态时卡死）
 * 返回清理后的轻量级快照列表
 */
async function cleanAndMigrateSnapshots(snapshots: any[]): Promise<{ cleaned: any[], migrated: boolean }> {
  if (!Array.isArray(snapshots)) {
    console.warn('[GameStore] Snapshots data is not an array, resetting')
    return { cleaned: [], migrated: false }
  }
  
  let migrated = false
  const cleaned: any[] = []
  
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i]
    
    // 验证基本结构
    if (!validateSnapshot(s)) {
      console.warn(`[GameStore] Skipping invalid snapshot at index ${i}`)
      continue
    }
    
    // 如果快照内联了大数据，需要迁移到分离存储
    if (s.gameState || s.chatLog) {
      console.log(`[GameStore] Migrating snapshot ${s.id} to split storage...`)
      try {
        if (s.gameState) {
          s.gameTime = {
            year: s.gameState.gameTime?.year,
            month: s.gameState.gameTime?.month,
            day: s.gameState.gameTime?.day,
            hour: s.gameState.gameTime?.hour,
            minute: s.gameState.gameTime?.minute
          }
          s.location = s.gameState.player?.location
        }

        await saveSnapshotData(s.id, {
          gameState: s.gameState,
          chatLog: s.chatLog
        })
        migrated = true
      } catch (e) {
        console.error(`[GameStore] Failed to migrate snapshot ${s.id}:`, e)
      }
    }
    
    // 创建轻量级副本（不包含 gameState 和 chatLog）
    const lightSnapshot: any = {
      id: s.id,
      timestamp: s.timestamp,
      label: s.label || `存档 ${i + 1}`,
      messageIndex: s.messageIndex || 0
    }
    if (s.gameTime) lightSnapshot.gameTime = s.gameTime
    if (s.location) lightSnapshot.location = s.location
    
    cleaned.push(lightSnapshot)
    
    // 每处理一个快照让出线程，防止长时间阻塞
    if (i % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  
  return { cleaned, migrated }
}

export const storageActions = {
  /**
   * 初始化 NPC 关系数据
   * 优先级：运行时 store > 世界书 [Social_Data] > DEFAULT_RELATIONSHIPS 硬编码
   */
  async initializeNpcRelationships(this: any) {
    console.log('[GameStore] Initializing NPC relationships...')

    // 0. 优先从 IndexedDB 加载（按 currentRunId 隔离）
    try {
      const { getNpcRelationships } = await import('../../utils/indexedDB')
      if (this.currentRunId) {
        const saved = await getNpcRelationships(this.currentRunId)
        if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
          console.log('[GameStore] Loaded NPC relationships from IndexedDB for run:', this.currentRunId)
          this.npcRelationships = saved
          return  // IndexedDB 有数据，直接使用，不再从世界书读取
        }
      }
    } catch (e) {
      console.warn('[GameStore] Failed to load relationships from IndexedDB, falling back to worldbook:', e)
    }

    // 1. 尝试从世界书 [Social_Data] 读取
    let socialData: Record<string, any> = {}
    try {
      const { ensureSocialDataWorldbook, fetchSocialData } = await import('../../utils/socialRelationshipsWorldbook')
      await ensureSocialDataWorldbook()
      socialData = (await fetchSocialData()) || {}
    } catch (e) {
      console.warn('[GameStore] Failed to fetch Social_Data from worldbook, using defaults only:', e)
    }

    const newRelationships: Record<string, any> = {}

    // 2. 先处理世界书中的角色数据（优先级高于硬编码）
    for (const [charName, charData] of Object.entries(socialData)) {
      if (this.npcRelationships[charName]) {
        // 已存在于运行时 store 的直接保留（运行时数据 > 世界书）
        newRelationships[charName] = this.npcRelationships[charName]
      } else {
        // 从世界书构建（注意：世界书用 relationships，store 用 relations）
        newRelationships[charName] = {
          personality: charData.personality || { order: 0, altruism: 0, tradition: 0, peace: 0 },
          goals: charData.goals || { immediate: '', shortTerm: '', longTerm: '' },
          priorities: charData.priorities || { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
          relations: charData.relationships ? JSON.parse(JSON.stringify(charData.relationships)) : {}
        }
      }
    }

    // 3. 再用 DEFAULT_RELATIONSHIPS 填充世界书中没有的角色（兜底）
    for (const [charName, relations] of Object.entries(DEFAULT_RELATIONSHIPS as Record<string, any>)) {
      if (!newRelationships[charName] && !this.npcRelationships[charName]) {
        newRelationships[charName] = {
          personality: (DEFAULT_PERSONALITIES as Record<string, any>)[charName] || { order: 0, altruism: 0, tradition: 0, peace: 0 },
          goals: (DEFAULT_GOALS as Record<string, any>)[charName] || { immediate: '', shortTerm: '', longTerm: '' },
          priorities: (DEFAULT_PRIORITIES as Record<string, any>)[charName] || { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
          relations: {}
        }
      } else if (!newRelationships[charName]) {
        newRelationships[charName] = this.npcRelationships[charName]
      }

      // 填充缺失的具体关系对
      const targetRelations = newRelationships[charName]?.relations
      if (targetRelations) {
        for (const [targetName, relData] of Object.entries(relations as Record<string, any>)) {
          if (!targetRelations[targetName]) {
            targetRelations[targetName] = JSON.parse(JSON.stringify(relData))
          }
        }
      }
    }

    // 4. 保留已有的、不在上述两个来源中的角色
    for (const [charName, data] of Object.entries(this.npcRelationships)) {
      if (!newRelationships[charName]) {
        newRelationships[charName] = data
      }
    }

    // 一次性赋值，减少 Vue 响应式开销
    this.npcRelationships = newRelationships
  },

  /**
   * 初始化：从存储加载 (支持 IndexedDB 迁移)
   * 
   * 【安全增强】
   * - 每个加载步骤独立 try-catch，单步失败不影响整体
   * - 大数据在赋值给响应式状态前先清理，防止 Vue Proxy 递归卡死
   * - 设置数据经过结构验证和修复
   * - rebuildWorldbookState 有超时保护
   */
  async initFromStorage(this: any) {
    console.log('[GameStore] Starting initFromStorage...')
    const startTime = Date.now()
    
    // Step 0: LocalStorage 迁移
    try {
      await withTimeout(
        migrateFromLocalStorage([
          'school_game_snapshots',
          'school_game_settings',
          'school_game_run_id'
        ]),
        10000,
        'migrateFromLocalStorage'
      )
    } catch (e) {
      console.warn('[GameStore] LocalStorage migration failed, continuing...', e)
    }

    // Step 1: 加载快照列表
    try {
      const snapshots = await withTimeout(
        getItem('school_game_snapshots'),
        10000,
        'load snapshots'
      )
      
      if (snapshots && Array.isArray(snapshots)) {
        // 在赋值前清理大数据，避免 Vue Proxy 卡死
        const { cleaned, migrated } = await cleanAndMigrateSnapshots(snapshots)
        
        // 用轻量级数据赋值
        this.saveSnapshots = cleaned
        
        if (migrated) {
          console.log('[GameStore] Migration complete, saving lightweight snapshots list.')
          // 异步保存，不阻塞初始化
          this.saveToStorage(true).catch((e: any) => 
            console.warn('[GameStore] Failed to save migrated snapshots:', e)
          )
        }
        
        console.log(`[GameStore] Loaded ${cleaned.length} snapshots`)
      }
    } catch (e) {
      console.error('[GameStore] Failed to load snapshots:', e)
      // 快照加载失败不影响其他功能
    }

    // Step 2: 加载设置
    try {
      const settings = await withTimeout(
        getItem('school_game_settings'),
        5000,
        'load settings'
      )
      
      if (settings) {
        // 验证并修复设置结构
        const repairedSettings = validateAndRepairSettings(settings)
        
        // 使用默认设置作为基础，用修复后的设置覆盖
        const defaults = createInitialState().settings
        this.settings = { ...defaults, ...repairedSettings }
        
        // 确保 summarySystem 完整合并
        this.settings.summarySystem = {
          ...defaults.summarySystem,
          ...(repairedSettings.summarySystem || {})
        }
        
        // 确保 assistantAI 完整合并
        this.settings.assistantAI = {
          ...defaults.assistantAI,
          ...(repairedSettings.assistantAI || {})
        }

        // 确保默认内容标签存在
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
        
        console.log('[GameStore] Settings loaded and validated (schema v' + (repairedSettings._schemaVersion || 'unknown') + ')')
      }
    } catch (e) {
      console.error('[GameStore] Failed to load settings:', e)
      // 设置加载失败使用默认值，不影响其他功能
    }

    // Step 3: 加载 RunId
    try {
      const lastRunId = await withTimeout(
        getItem('school_game_run_id'),
        3000,
        'load runId'
      )
      if (lastRunId) {
        this.currentRunId = lastRunId
      }
    } catch (e) {
      console.warn('[GameStore] Failed to load runId:', e)
    }
    
    // Step 4: 重建世界书状态（有整体超时保护）
    // 增加超时时间，因为现在内部增加了延时以减轻主线程压力
    const rebuildOk = await safeExec(
      () => this.rebuildWorldbookState(),
      'rebuildWorldbookState',
      90000 // 世界书重建最多 90 秒
    )
    
    if (!rebuildOk) {
      console.error('[GameStore] ⚠️ rebuildWorldbookState failed or timed out, game may have incomplete world data')
    }
    
    // Step 5: 初始化 NPC 关系（在 rebuildWorldbookState 之后）
    try {
      await this.initializeNpcRelationships()
    } catch (e) {
      console.error('[GameStore] Failed to initialize NPC relationships:', e)
    }
    
    // Step 6: 检查配送通知
    try {
      if (typeof this.checkAndNotifyDeliveries === 'function') {
        this.checkAndNotifyDeliveries()
      }
    } catch (e) {
      console.warn('[GameStore] Failed to check deliveries:', e)
    }
    
    const elapsed = Date.now() - startTime
    console.log(`[GameStore] Initialized from storage (IndexedDB) in ${elapsed}ms`)
  },

  /**
   * 保存到存储 (IndexedDB)
   */
  async saveToStorage(this: any, force = false) {
    const doSave = async () => {
      try {
        this.saveError = null
        await setItem('school_game_snapshots', JSON.parse(JSON.stringify(this.saveSnapshots)))
        await setItem('school_game_settings', JSON.parse(JSON.stringify(this.settings)))
        await setItem('school_game_run_id', this.currentRunId)
      } catch (e) {
        console.error('Failed to save to storage', e)
        this.saveError = e.message || '存档保存失败'
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

    // 导出时剥离 embedding 向量，减小文件体积
    for (const snap of fullSnapshots) {
      if (snap.gameState?.player?.summaries) {
        for (const s of snap.gameState.player.summaries) {
          delete s.embedding
        }
      }
    }

    // 获取扩展数据 (IndexedDB)
    const rosterBackup = await getRosterBackup()
    const fullCharacterPool = await getFullCharacterPool()
    const rosterPresets = await getRosterPresets()

    // 导出设置（脱敏：移除 API Key）
    const sanitizedSettings = JSON.parse(JSON.stringify(this.settings || {}))
    if (sanitizedSettings.assistantAI) {
      delete sanitizedSettings.assistantAI.apiKey
    }
    if (sanitizedSettings.ragSystem?.embedding) {
      delete sanitizedSettings.ragSystem.embedding.apiKey
    }
    if (sanitizedSettings.ragSystem?.rerank) {
      delete sanitizedSettings.ragSystem.rerank.apiKey
    }

    // 导出 eventLibrary（Map → Array）
    let eventLibraryArray: any[] = []
    if (this.eventLibrary instanceof Map && this.eventLibrary.size > 0) {
      eventLibraryArray = Array.from(this.eventLibrary.entries())
    }

    return JSON.stringify({
      version: 3,
      timestamp: Date.now(),
      snapshots: fullSnapshots,
      extraData: {
        rosterBackup,
        fullCharacterPool,
        rosterPresets
      },
      globalData: {
        settings: sanitizedSettings,
        characterNotes: this.characterNotes || {},
        customCoursePool: this.customCoursePool || null,
        eventLibrary: eventLibraryArray,
        eventTriggers: this.eventTriggers || [],
        // 通知/红点状态
        unviewedExamIds: this.unviewedExamIds || [],
        lastViewedWeeklyPreview: this.lastViewedWeeklyPreview || 0,
        viewedClubIds: this.viewedClubIds || []
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

      // 恢复全局数据 (v3+)
      if (data.globalData) {
        console.log('[GameStore] Importing global data from save file...')
        const g = data.globalData

        // 设置：合并导入（保留本地 API Key）
        if (g.settings) {
          const localApiKey = this.settings?.assistantAI?.apiKey || ''
          const defaults = createInitialState().settings
          const imported = validateAndRepairSettings(g.settings)
          this.settings = { ...defaults, ...imported }
          this.settings.summarySystem = { ...defaults.summarySystem, ...(imported.summarySystem || {}) }
          this.settings.assistantAI = { ...defaults.assistantAI, ...(imported.assistantAI || {}) }
          // 恢复本地 API Key（导出时已脱敏）
          if (localApiKey) {
            this.settings.assistantAI.apiKey = localApiKey
          }
          await setItem('school_game_settings', JSON.parse(JSON.stringify(this.settings)))
          console.log('[GameStore] Restored settings (API key preserved)')
        }

        if (g.characterNotes && typeof g.characterNotes === 'object') {
          this.characterNotes = g.characterNotes
          console.log('[GameStore] Restored character notes')
        }

        if (g.customCoursePool !== undefined) {
          this.customCoursePool = g.customCoursePool
          console.log('[GameStore] Restored custom course pool')
        }

        // eventLibrary: Array → Map
        if (Array.isArray(g.eventLibrary) && g.eventLibrary.length > 0) {
          this.eventLibrary = new Map(g.eventLibrary)
          console.log(`[GameStore] Restored event library (${this.eventLibrary.size} events)`)
        }

        if (Array.isArray(g.eventTriggers)) {
          this.eventTriggers = g.eventTriggers
          console.log(`[GameStore] Restored event triggers (${this.eventTriggers.length})`)
        }

        // 通知状态
        if (Array.isArray(g.unviewedExamIds)) this.unviewedExamIds = g.unviewedExamIds
        if (typeof g.lastViewedWeeklyPreview === 'number') this.lastViewedWeeklyPreview = g.lastViewedWeeklyPreview
        if (Array.isArray(g.viewedClubIds)) this.viewedClubIds = g.viewedClubIds
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
            
            // 预加载班级数据，确保选修课世界书条目中的同学列表能正确恢复
            // 这是因为 processNpcElectiveSelection 依赖 allClassData 来获取 NPC 列表
            if (details.gameState.allClassData) {
              console.log('[GameStore] Pre-loading class data from snapshot')
              this.allClassData = details.gameState.allClassData
            }
            
            // 同时恢复 currentRunId 和 player，因为 rebuildWorldbookState 需要用到
            if (details.gameState.currentRunId) {
              this.currentRunId = details.gameState.currentRunId
            }
            if (details.gameState.player) {
              // 【修复】状态合并：确保旧存档缺失的字段被默认值填充
              // 使用 createInitialState().player 作为基础模板
              const defaultPlayer = createInitialState().player
              
              // 递归合并对象（这里简单实现一层深拷贝，针对关键嵌套对象）
              // 对于深层嵌套如 attributes, skills 等，如果存档中有，就用存档的，否则用默认的
              // 注意：这里假设存档中的对象结构如果是旧的，至少第一层是匹配的
              
              // 简单的合并策略：
              this.player = { ...defaultPlayer, ...details.gameState.player }
              
              // 针对特定的嵌套对象进行深度合并
              if (details.gameState.player.partTimeJob) {
                this.player.partTimeJob = { ...defaultPlayer.partTimeJob, ...details.gameState.player.partTimeJob }
              }
              if (details.gameState.player.forum) {
                this.player.forum = { ...defaultPlayer.forum, ...details.gameState.player.forum }
              }
              if (details.gameState.player.social) {
                this.player.social = { ...defaultPlayer.social, ...details.gameState.player.social }
              }
              // 教师相关字段
              if (details.gameState.player.role) {
                // 如果存档中有 role，保留相关字段
              } else {
                // 如果没有，确保使用默认值
                this.player.role = defaultPlayer.role
              }
            }
            
            // 预加载考试历史
            if (details.gameState.examHistory) {
              this.examHistory = details.gameState.examHistory
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
