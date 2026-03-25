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
  saveChunkedChatLog,
  loadChunkedChatLog,
  saveSharedChatLog,
  loadSharedChatLog,
  getRosterBackup,
  saveRosterBackup,
  getFullCharacterPool,
  saveFullCharacterPool,
  getRosterPresets,
  saveRosterPresets,
  clearAllData
} from '../../utils/indexedDB'
import { getErrorMessage, getErrorName } from '../../utils/errorUtils'
import { DEFAULT_RELATIONSHIPS, DEFAULT_PERSONALITIES, DEFAULT_GOALS, DEFAULT_PRIORITIES } from '../../data/relationshipData'
import { createInitialState } from '../gameStoreState'
import { stripEmbeddingData, isDeltaSnapshot } from '../../utils/snapshotUtils'

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

function createPortableChatLogEntry(log: any) {
  const portable: any = {
    type: log.type,
    content: log.content
  }

  if (log.rawContent !== undefined) {
    portable.rawContent = log.rawContent
  }

  if (log.snapshot) {
    // structuredClone 避免 stripEmbeddingData 修改活对象的 embedding 字段
    portable.snapshot = stripEmbeddingData(structuredClone(log.snapshot))
  }

  return portable
}

function createPortableGameState(gameState: any) {
  if (!gameState || typeof gameState !== 'object') {
    return gameState
  }

  // structuredClone 避免 stripEmbeddingData 修改活对象的 embedding 字段
  return stripEmbeddingData(structuredClone(gameState))
}

function compactPortableChatLog(chatLog: any[], recentWindow = 20) {
  if (!Array.isArray(chatLog) || chatLog.length === 0) {
    return []
  }

  const portableLogs = chatLog.map((log: any) => createPortableChatLogEntry(log))
  const shouldCompact = portableLogs.length > Math.max(recentWindow * 2, 200)

  if (!shouldCompact) {
    return portableLogs
  }

  const cutoffIndex = Math.max(0, portableLogs.length - recentWindow)

  // 收集活跃窗口内依赖的所有基准快照楼层
  // （与 snapshotActions.ts 的 trimmer 使用相同逻辑）
  const activeBaseFloors = new Set<number>()
  for (let i = cutoffIndex; i < portableLogs.length; i++) {
    const snapshot = portableLogs[i]?.snapshot
    if (!snapshot) continue

    if (snapshot._isBase && typeof snapshot._floor === 'number') {
      activeBaseFloors.add(snapshot._floor)
    } else if (isDeltaSnapshot(snapshot)) {
      activeBaseFloors.add(snapshot._baseFloor)
    }
  }

  for (let i = 0; i < cutoffIndex; i++) {
    const log = portableLogs[i]
    const snapshot = log?.snapshot

    if (snapshot) {
      let shouldKeep = false
      if (snapshot._isBase) {
        const baseFloor = snapshot._floor
        // 保留条件1：活跃窗口内有增量依赖此基准
        // 保留条件2：这是最靠近活跃窗口的基准（安全 fallback）
        // （与 snapshotActions.ts 的 trimmer 使用相同逻辑）
        const isLatestBase = activeBaseFloors.size > 0 &&
          !Array.from(activeBaseFloors).some(f => f > baseFloor)
        shouldKeep = activeBaseFloors.has(baseFloor) || isLatestBase
      }
      if (!shouldKeep) {
        delete log.snapshot
      }
    }

    if (log.rawContent !== undefined) {
      delete log.rawContent
    }
  }

  return portableLogs
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

        if (Array.isArray(s.chatLog)) {
          await saveChunkedChatLog(s.id, compactPortableChatLog(s.chatLog, 30))
        }

        await saveSnapshotData(s.id, {
          gameState: createPortableGameState(s.gameState)
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
  async initializeNpcRelationships(this: any, options: { preserveCurrentInMemory?: boolean } = {}) {
    console.log('[GameStore] Initializing NPC relationships...')

    // 0. 优先从 IndexedDB 加载（按 currentRunId 隔离）
    try {
      const { getNpcRelationships } = await import('../../utils/indexedDB')
      if (this.meta.currentRunId && this.meta.currentRunId !== 'temp_editing') {
        const saved = await getNpcRelationships(this.meta.currentRunId)
        if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
          console.log('[GameStore] Loaded NPC relationships from IndexedDB for run:', this.meta.currentRunId)
          this.world.npcRelationships = saved
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

    // By default, do not reuse in-memory relationships to avoid cross-run carryover.
    if (!options?.preserveCurrentInMemory) {
      this.world.npcRelationships = {}
    }

    const newRelationships: Record<string, any> = {}

    // 2. 先处理世界书中的角色数据（优先级高于硬编码）
    for (const [charName, charData] of Object.entries(socialData)) {
      if (this.world.npcRelationships[charName]) {
        // 已存在于运行时 store 的直接保留（运行时数据 > 世界书）
        newRelationships[charName] = this.world.npcRelationships[charName]
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
      if (!newRelationships[charName] && !this.world.npcRelationships[charName]) {
        newRelationships[charName] = {
          personality: (DEFAULT_PERSONALITIES as Record<string, any>)[charName] || { order: 0, altruism: 0, tradition: 0, peace: 0 },
          goals: (DEFAULT_GOALS as Record<string, any>)[charName] || { immediate: '', shortTerm: '', longTerm: '' },
          priorities: (DEFAULT_PRIORITIES as Record<string, any>)[charName] || { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
          relations: {}
        }
      } else if (!newRelationships[charName]) {
        newRelationships[charName] = this.world.npcRelationships[charName]
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
    for (const [charName, data] of Object.entries(this.world.npcRelationships)) {
      if (!newRelationships[charName]) {
        newRelationships[charName] = data
      }
    }

    // 一次性赋值，减少 Vue 响应式开销
    this.world.npcRelationships = newRelationships
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
        this._ui.saveSnapshots = cleaned
        
        if (migrated) {
          console.log('[GameStore] Migration complete, saving lightweight snapshots list.')
          // 异步保存，不阻塞初始化
          this.saveToStorage(true).catch((e: unknown) => 
            console.warn('[GameStore] Failed to save migrated snapshots:', e)
          )
        }
        
        console.log(`[GameStore] Loaded ${cleaned.length} snapshots`)
      }
    } catch (e) {
      console.error('[GameStore] Failed to load snapshots:', e)
      // 快照加载失败不影响其他功能
    }

    // Step 1.5: 加载联机存档列表
    try {
      const mpSnapshots = await withTimeout(
        getItem('school_game_mp_snapshots'),
        5000,
        'load mp snapshots'
      )
      if (mpSnapshots && Array.isArray(mpSnapshots)) {
        this._ui.mpSaveSnapshots = mpSnapshots
        console.log(`[GameStore] Loaded ${mpSnapshots.length} multiplayer snapshots`)
      }
    } catch (e) {
      console.warn('[GameStore] Failed to load MP snapshots:', e)
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
        this.meta.currentRunId = lastRunId
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
        this._ui.saveError = null
        await setItem('school_game_snapshots', JSON.parse(JSON.stringify(this._ui.saveSnapshots)))
        await setItem('school_game_settings', JSON.parse(JSON.stringify(this.settings)))
        await setItem('school_game_run_id', this.meta.currentRunId)
        // 联机存档独立保存
        if (this._ui.mpSaveSnapshots.length > 0) {
          await setItem('school_game_mp_snapshots', JSON.parse(JSON.stringify(this._ui.mpSaveSnapshots)))
        }
      } catch (e) {
        console.error('Failed to save to storage', e)
        this._ui.saveError = getErrorMessage(e, '存档保存失败')
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
  async getExportData(this: any, options: { asText?: boolean, onProgress?: (stage: string) => void } = {}) {
    const recentWindow = Math.max(this.settings?.snapshotLimit || 10, 20)

    // Phase 1.1 (v5): 按 runId 收集共享 chatLog，避免每个存档重复存储
    const chatLogsByRun: Record<string, any[]> = {}
    const snapshotRunMap: Record<string, string> = {} // snapshotId → runId

    const exportSnapshots = []
    for (const snapshot of this._ui.saveSnapshots) {
      let fullSnapshot = { ...snapshot }
      if (!fullSnapshot.gameState) {
        const details = await getSnapshotData(snapshot.id)
        if (details) {
          fullSnapshot = { ...fullSnapshot, ...details }
        }
      }

      const runId = fullSnapshot.gameState?.meta?.currentRunId || fullSnapshot.gameState?.currentRunId || this.meta.currentRunId || 'unknown'
      snapshotRunMap[snapshot.id] = runId

      // 收集每个 runId 最完整的 chatLog（按 messageIndex 取最大的）
      if (!chatLogsByRun[runId]) {
        // 优先从共享 chatLog 池加载
        let chatLog = await loadSharedChatLog(runId)
        // 回退到 per-snapshot 分片存储
        if (!chatLog || chatLog.length === 0) {
          chatLog = await loadChunkedChatLog(snapshot.id)
        }
        if (chatLog && chatLog.length > 0) {
          chatLogsByRun[runId] = chatLog
        }
      } else {
        // 如果已有 chatLog 但当前快照的 messageIndex 更大，尝试加载更完整的版本
        const existing = chatLogsByRun[runId]
        if (fullSnapshot.messageIndex != null && fullSnapshot.messageIndex >= existing.length) {
          let chatLog = await loadSharedChatLog(runId)
          if (!chatLog || chatLog.length === 0) {
            chatLog = await loadChunkedChatLog(snapshot.id)
          }
          if (chatLog && chatLog.length > existing.length) {
            chatLogsByRun[runId] = chatLog
          }
        }
      }

      // 导出 snapshot 不含 chatLog，只保留 gameState + 元数据
      if (fullSnapshot.gameState) {
        fullSnapshot.gameState = createPortableGameState(fullSnapshot.gameState)
      }
      delete fullSnapshot.chatLog
      exportSnapshots.push(fullSnapshot)
    }

    // 对每个 runId 的 chatLog 做精简（剥离旧消息的内联快照）
    for (const [runId, chatLog] of Object.entries(chatLogsByRun)) {
      chatLogsByRun[runId] = compactPortableChatLog(chatLog, recentWindow)
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
    if (this.events.library instanceof Map && this.events.library.size > 0) {
      eventLibraryArray = Array.from(this.events.library.entries())
    }

    const exportObj = {
      version: 5,
      timestamp: Date.now(),
      // v5: 共享 chatLog 按 runId 分组，不再在每个 snapshot 中重复
      chatLogs: chatLogsByRun,
      snapshots: exportSnapshots,
      extraData: {
        rosterBackup,
        fullCharacterPool,
        rosterPresets
      },
      globalData: {
        settings: sanitizedSettings,
        characterNotes: this.world.characterNotes || {},
        customCoursePool: this.academic.customCoursePool || null,
        eventLibrary: eventLibraryArray,
        eventTriggers: this.events.triggers || [],
        unviewedExamIds: this.notifications.unviewedExamIds || [],
        lastViewedWeeklyPreview: this.notifications.lastViewedWeeklyPreview || 0,
        viewedClubIds: this.notifications.viewedClubIds || []
      }
    }

    try {
      const { buildSaveExportData } = await import('../../utils/saveExportWorker')
      return await buildSaveExportData(exportObj, {
        asText: !!options.asText,
        onProgress: options.onProgress
      })
    } catch (e) {
      const errorMessage = getErrorMessage(e, '')
      const errorName = getErrorName(e)
      if (errorMessage.includes('Invalid string length') || errorName === 'RangeError') {
        throw new Error('存档数据过大，无法导出。请尝试删除一些旧存档后再试。')
      }
      throw e
    }
  },

  /**
   * 导入存档数据
   */
  async importSaveData(this: any, jsonStr: string) {
    try {
      let data
      try {
        const parsed = JSON.parse(jsonStr)

        // 检测压缩格式(v4)
        if (parsed.compressed && parsed.data) {
          console.log('[Import] Decompressing...')
          const { decompressData } = await import('../../utils/compressionUtils')
          const decompressed = decompressData(parsed.data)
          data = JSON.parse(decompressed)
          console.log('[Import] Decompression successful')
        } else {
          // 向后兼容v1-v3
          data = parsed
        }
      } catch (e) {
        console.error('[Import] Failed to parse save data:', e)
        throw new Error('存档格式错误或已损坏')
      }

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
          this.world.characterNotes = g.characterNotes
          console.log('[GameStore] Restored character notes')
        }

        if (g.customCoursePool !== undefined) {
          this.academic.customCoursePool = g.customCoursePool
          console.log('[GameStore] Restored custom course pool')
        }

        // eventLibrary: Array → Map
        if (Array.isArray(g.eventLibrary) && g.eventLibrary.length > 0) {
          this.events.library = new Map(g.eventLibrary)
          console.log(`[GameStore] Restored event library (${this.events.library.size} events)`)
        }

        if (Array.isArray(g.eventTriggers)) {
          this.events.triggers = g.eventTriggers
          console.log(`[GameStore] Restored event triggers (${this.events.triggers.length})`)
        }

        // 通知状态
        if (Array.isArray(g.unviewedExamIds)) this.notifications.unviewedExamIds = g.unviewedExamIds
        if (typeof g.lastViewedWeeklyPreview === 'number') this.notifications.lastViewedWeeklyPreview = g.lastViewedWeeklyPreview
        if (Array.isArray(g.viewedClubIds)) this.notifications.viewedClubIds = g.viewedClubIds
      }

      // v5: 先保存共享 chatLog 到 IndexedDB（按 runId）
      if (data.version >= 5 && data.chatLogs && typeof data.chatLogs === 'object') {
        console.log('[Import] v5 format detected: saving shared chatLogs...')
        for (const [runId, chatLog] of Object.entries(data.chatLogs)) {
          if (Array.isArray(chatLog) && chatLog.length > 0) {
            await saveSharedChatLog(runId, chatLog as any[])
            console.log(`[Import] Saved shared chatLog for run ${runId}: ${(chatLog as any[]).length} messages`)
          }
        }
      }

      const processedSnapshots: SaveSnapshot[] = []
      
      for (let i = 0; i < loadedSnapshots.length; i++) {
        const s = loadedSnapshots[i]
        const snapshot = { ...s }
        
        if (snapshot.gameState || snapshot.chatLog) {
          // v1-v4 兼容：旧格式的 per-snapshot chatLog 仍然保存到共享池
          if (Array.isArray(snapshot.chatLog) && snapshot.chatLog.length > 0) {
            const runId = snapshot.gameState?.meta?.currentRunId || snapshot.gameState?.currentRunId
            if (runId) {
              // 保存到共享 chatLog 池
              const recentWindow = Math.max(this.settings?.snapshotLimit || 10, 20)
              await saveSharedChatLog(runId, compactPortableChatLog(snapshot.chatLog, recentWindow))
            } else {
              // 无 runId 时回退到 per-snapshot 存储
              const recentWindow = Math.max(this.settings?.snapshotLimit || 10, 20)
              await saveChunkedChatLog(snapshot.id, compactPortableChatLog(snapshot.chatLog, recentWindow))
            }
          }

          await saveSnapshotData(snapshot.id, {
            gameState: snapshot.gameState ? createPortableGameState(snapshot.gameState) : snapshot.gameState
          })
          
          delete snapshot.gameState
          delete snapshot.chatLog
        }
        
        processedSnapshots.push(snapshot)

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      this._ui.saveSnapshots = processedSnapshots
      this.saveToStorage(true)
      
      // 在 rebuildWorldbookState 之前，从最新快照预加载玩家创建的社团
      // 这是为了确保玩家创建的社团在导入到新设备时能被正确重建
      if (processedSnapshots.length > 0) {
        const sortedSnapshots = [...processedSnapshots].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        const latestSnapshot = sortedSnapshots[0]
        
        if (latestSnapshot) {
          const details = await getSnapshotData(latestSnapshot.id)
          if (details && details.gameState) {
            // Phase 2: gameState 可能是 v3 扁平格式或 v4 分层格式，兼容两者
            const gs = details.gameState
            const gsAllClubs = gs.world?.allClubs || gs.allClubs
            const gsAllClassData = gs.world?.allClassData || gs.allClassData
            const gsRunId = gs.meta?.currentRunId || gs.currentRunId
            const gsPlayer = gs.player
            const gsExamHistory = gs.academic?.examHistory || gs.examHistory

            // 预加载玩家创建的社团（ID 以 player_club_ 开头）
            if (gsAllClubs) {
              if (!this.world.allClubs) this.world.allClubs = {}
              for (const [clubId, club] of Object.entries(gsAllClubs)) {
                if (clubId.startsWith('player_club_')) {
                  console.log(`[GameStore] Pre-loading player created club: ${clubId}`)
                  this.world.allClubs[clubId] = club
                }
              }
            }
            
            // 预加载班级数据
            if (gsAllClassData) {
              console.log('[GameStore] Pre-loading class data from snapshot')
              this.world.allClassData = gsAllClassData
            }
            
            // 同时恢复 currentRunId 和 player，因为 rebuildWorldbookState 需要用到
            if (gsRunId) {
              this.meta.currentRunId = gsRunId
            }
            if (gsPlayer) {
              const defaultPlayer = createInitialState().player
              this.player = { ...defaultPlayer, ...gsPlayer }
              if (gsPlayer.partTimeJob) {
                this.player.partTimeJob = { ...defaultPlayer.partTimeJob, ...gsPlayer.partTimeJob }
              }
              if (gsPlayer.forum) {
                this.player.forum = { ...defaultPlayer.forum, ...gsPlayer.forum }
              }
              if (gsPlayer.social) {
                this.player.social = { ...defaultPlayer.social, ...gsPlayer.social }
              }
              if (!gsPlayer.role) {
                this.player.role = defaultPlayer.role
              }
            }
            
            // 预加载考试历史
            if (gsExamHistory) {
              this.academic.examHistory = gsExamHistory
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
  },

  /**
   * 获取存储信息
   */
  async getStorageInfo(this: any) {
    try {
      const { getStorageEstimate, getAllSnapshotIds } = await import('../../utils/indexedDB')

      // 获取存储使用量
      const estimate = await getStorageEstimate()

      // 获取所有快照ID
      const allSnapshotIds = await getAllSnapshotIds()

      // 获取元数据中的快照ID
      const metaSnapshotIds = new Set(this._ui.saveSnapshots.map((s: SaveSnapshot) => s.id))

      // 找出孤立的快照（存在于IndexedDB但不在元数据中）
      const orphanedSnapshots = allSnapshotIds.filter(id => !metaSnapshotIds.has(id))

      return {
        usageMB: estimate.usageMB,
        quotaMB: estimate.quotaMB,
        usagePercent: estimate.usagePercent,
        snapshotCount: this._ui.saveSnapshots.length,
        orphanedSnapshots,
        orphanedCount: orphanedSnapshots.length
      }
    } catch (e) {
      console.error('[GameStore] Failed to get storage info:', e)
      return {
        usageMB: 0,
        quotaMB: 0,
        usagePercent: 0,
        snapshotCount: this._ui.saveSnapshots.length,
        orphanedSnapshots: [],
        orphanedCount: 0
      }
    }
  },

  /**
   * 清理孤立的快照数据
   */
  async cleanupOrphanedSnapshots(this: any) {
    try {
      const { getAllSnapshotIds, removeSnapshotData, removeChunkedChatLog } = await import('../../utils/indexedDB')

      const allSnapshotIds = await getAllSnapshotIds()
      const metaSnapshotIds = new Set(this._ui.saveSnapshots.map((s: SaveSnapshot) => s.id))
      const orphanedSnapshots = allSnapshotIds.filter(id => !metaSnapshotIds.has(id))

      if (orphanedSnapshots.length === 0) {
        console.log('[GameStore] No orphaned snapshots found')
        return 0
      }

      console.log(`[GameStore] Cleaning up ${orphanedSnapshots.length} orphaned snapshots...`)

      for (const id of orphanedSnapshots) {
        try {
          await removeSnapshotData(id)
          await removeChunkedChatLog(id)
        } catch (e) {
          console.warn(`[GameStore] Failed to delete orphaned snapshot ${id}:`, e)
        }
      }

      console.log(`[GameStore] Cleaned up ${orphanedSnapshots.length} orphaned snapshots`)
      return orphanedSnapshots.length
    } catch (e) {
      console.error('[GameStore] Failed to cleanup orphaned snapshots:', e)
      return 0
    }
  }
}
