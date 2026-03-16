/**
 * IndexedDB Utility for School Simulator
 * Used for storing large data like roster backups that exceed LocalStorage limits.
 */
import { getErrorName } from './errorUtils'

const DB_NAME = 'SchoolSimulatorDB'
const DB_VERSION = 3 // Incremented version for snapshot store
const STORE_NAME = 'backups' // Keep for roster backup
const DATA_STORE_NAME = 'game_data' // For general game data
const SNAPSHOT_STORE_NAME = 'snapshot_data' // New store for heavy snapshot data
const SUMMARY_EMBEDDING_PREFIX = 'rag_embedding:'

let dbInstance = null

function isDevEnv() {
  try {
    return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
}

function assertSerializableInDev(data, keyPath) {
  if (!isDevEnv()) return
  try {
    JSON.stringify(data)
    return
  } catch (jsonError) {
    try {
      structuredClone(data)
      return
    } catch (cloneError) {
      console.warn(`[IndexedDB] Non-serializable payload detected before write: ${keyPath}`, {
        jsonError,
        cloneError
      })
    }
  }
}

/**
 * Open the database connection
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      console.error('[IndexedDB] Database error:', event.target.error)
      reject(event.target.error)
    }

    request.onsuccess = (event) => {
      dbInstance = event.target.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
        console.log('[IndexedDB] Created object store:', STORE_NAME)
      }
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME)
        console.log('[IndexedDB] Created object store:', DATA_STORE_NAME)
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        db.createObjectStore(SNAPSHOT_STORE_NAME)
        console.log('[IndexedDB] Created object store:', SNAPSHOT_STORE_NAME)
      }
    }
  })
}

/**
 * Save data to the store
 * @param {string} key
 * @param {any} data
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function setItem(key, data, storeName = DATA_STORE_NAME) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(data, key)

      request.onsuccess = () => resolve()
         request.onerror = (event) => {
        const error = event.target.error
        // 检测 QuotaExceededError
        if (error && error.name === 'QuotaExceededError') {
          reject(new Error('存储空间不足，请清理旧存档或导出后删除'))
        } else {
          reject(error)
        }
      }
    })
  } catch (e) {
    console.error(`[IndexedDB] Error saving item to ${storeName}:`, e)
    // 检测 QuotaExceededError
    if (getErrorName(e) === 'QuotaExceededError') {
      throw new Error('存储空间不足，请清理旧存档或导出后删除')
    }
    throw e
  }
}

/**
 * Get data from the store
 * @param {string} key 
 * @param {string} storeName
 * @returns {Promise<any>}
 */
export async function getItem(key, storeName = DATA_STORE_NAME) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = (event) => resolve(event.target.result)
      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error(`[IndexedDB] Error getting item from ${storeName}:`, e)
    throw e
  }
}

/**
 * Remove data from the store
 * @param {string} key 
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function removeItem(key, storeName = DATA_STORE_NAME) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error(`[IndexedDB] Error removing item from ${storeName}:`, e)
    throw e
  }
}

async function getEntriesByPrefix(prefix, storeName = DATA_STORE_NAME) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.openCursor()
      const results = []

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) {
          resolve(results)
          return
        }

        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          results.push({ key: cursor.key, value: cursor.value })
        }
        cursor.continue()
      }

      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error(`[IndexedDB] Error scanning items by prefix from ${storeName}:`, e)
    throw e
  }
}

async function removeItemsByPrefix(prefix, storeName = DATA_STORE_NAME) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) {
          resolve()
          return
        }

        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete()
        }
        cursor.continue()
      }

      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error(`[IndexedDB] Error removing items by prefix from ${storeName}:`, e)
    throw e
  }
}

function getSummaryEmbeddingStorageKey(runId, summaryKey) {
  return `${SUMMARY_EMBEDDING_PREFIX}${runId}:${summaryKey}`
}

export async function saveSummaryEmbedding(runId, summaryKey, data) {
  if (!runId || !summaryKey) return
  return setItem(getSummaryEmbeddingStorageKey(runId, summaryKey), data, DATA_STORE_NAME)
}

export async function loadSummaryEmbeddings(runId) {
  if (!runId) return new Map()

  const prefix = `${SUMMARY_EMBEDDING_PREFIX}${runId}:`
  const entries = await getEntriesByPrefix(prefix, DATA_STORE_NAME)
  const result = new Map()

  for (const entry of entries) {
    const summaryKey = entry.key.slice(prefix.length)
    result.set(summaryKey, entry.value)
  }

  return result
}

export async function removeSummaryEmbedding(runId, summaryKey) {
  if (!runId || !summaryKey) return
  return removeItem(getSummaryEmbeddingStorageKey(runId, summaryKey), DATA_STORE_NAME)
}

export async function clearSummaryEmbeddings(runId) {
  if (!runId) return
  const prefix = `${SUMMARY_EMBEDDING_PREFIX}${runId}:`
  return removeItemsByPrefix(prefix, DATA_STORE_NAME)
}

// Specialized helpers for Roster Backup
const ROSTER_KEY = 'school_full_roster_backup'

export async function saveRosterBackup(data) {
  console.log('[IndexedDB] Saving roster backup...')
  return setItem(ROSTER_KEY, data, STORE_NAME)
}

export async function getRosterBackup() {
  console.log('[IndexedDB] Loading roster backup...')
  return getItem(ROSTER_KEY, STORE_NAME)
}

// Full Character Pool (全角色池 - 包含所有角色的完整数据)
const FULL_CHARACTER_POOL_KEY = 'school_full_character_pool'

export async function saveFullCharacterPool(data) {
  console.log('[IndexedDB] Saving full character pool...')
  return setItem(FULL_CHARACTER_POOL_KEY, data, STORE_NAME)
}

export async function getFullCharacterPool() {
  console.log('[IndexedDB] Loading full character pool...')
  return getItem(FULL_CHARACTER_POOL_KEY, STORE_NAME)
}

// Custom Roster Presets (自定义名册预设)
const ROSTER_PRESETS_KEY = 'school_roster_presets'

export async function saveRosterPresets(data) {
  console.log('[IndexedDB] Saving roster presets...')
  return setItem(ROSTER_PRESETS_KEY, data, STORE_NAME)
}

export async function getRosterPresets() {
  console.log('[IndexedDB] Loading roster presets...')
  return getItem(ROSTER_PRESETS_KEY, STORE_NAME)
}

// Snapshot Data Helpers
// 大型累积字段单独存储，避免单次写入过大导致 QuotaExceededError
const BULKY_FIELD_SUFFIXES = ['_summaries', '_persistentFacts']

export async function saveSnapshotData(id, data) {
  assertSerializableInDev(data, `snapshot:${id}`)

  // 从 gameState 中提取大型累积字段，单独存储
  const gameState = data?.gameState
  if (gameState?.player) {
    const player = gameState.player
    for (const suffix of BULKY_FIELD_SUFFIXES) {
      const field = suffix.slice(1) // 去掉前缀 '_'
      if (Array.isArray(player[field]) && player[field].length > 0) {
        const fieldData = player[field]
        player[field] = [] // 主体中置空
        player[`${suffix}Count`] = fieldData.length // 记录条目数用于校验
        // 异步写入独立 key
        await setItem(`${id}${suffix}`, fieldData, SNAPSHOT_STORE_NAME)
      }
    }
  }

  return setItem(id, data, SNAPSHOT_STORE_NAME)
}

export async function getSnapshotData(id) {
  const data = await getItem(id, SNAPSHOT_STORE_NAME)
  if (!data?.gameState?.player) return data

  // 重新组装大型累积字段
  const player = data.gameState.player
  for (const suffix of BULKY_FIELD_SUFFIXES) {
    const field = suffix.slice(1)
    const countKey = `${suffix}Count`
    if (player[countKey] > 0 || (Array.isArray(player[field]) && player[field].length === 0)) {
      const fieldData = await getItem(`${id}${suffix}`, SNAPSHOT_STORE_NAME)
      if (fieldData) {
        player[field] = fieldData
      }
      delete player[countKey]
    }
  }

  return data
}

export async function removeSnapshotData(id) {
  console.log(`[IndexedDB] Removing snapshot data for ${id}...`)
  // 同时删除分片存储的大型字段
  for (const suffix of BULKY_FIELD_SUFFIXES) {
    try {
      await removeItem(`${id}${suffix}`, SNAPSHOT_STORE_NAME)
    } catch (e) {
      // 忽略不存在的 key
    }
  }
  return removeItem(id, SNAPSHOT_STORE_NAME)
}

// Clear all data from all stores (for emergency reset)
export async function clearAllData() {
  console.log('[IndexedDB] Clearing all data...')
  try {
    const db = await openDB()
    const storeNames = [STORE_NAME, DATA_STORE_NAME, SNAPSHOT_STORE_NAME]
    
    for (const storeName of storeNames) {
      if (db.objectStoreNames.contains(storeName)) {
        await new Promise((resolve, reject) => {
          const transaction = db.transaction([storeName], 'readwrite')
          const store = transaction.objectStore(storeName)
          const request = store.clear()
          request.onsuccess = () => {
            console.log(`[IndexedDB] Cleared store: ${storeName}`)
            resolve()
          }
          request.onerror = (event) => reject(event.target.error)
        })
      }
    }
    
    console.log('[IndexedDB] All data cleared successfully')
    return true
  } catch (e) {
    console.error('[IndexedDB] Error clearing data:', e)
    // 最后手段：删除整个数据库
    try {
      dbInstance = null
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME)
        request.onsuccess = () => {
          console.log('[IndexedDB] Database deleted')
          resolve()
        }
        request.onerror = (event) => reject(event.target.error)
      })
      return true
    } catch (e2) {
      console.error('[IndexedDB] Failed to delete database:', e2)
      return false
    }
  }
}

// NPC Relationships (per-run isolation)
export async function saveNpcRelationships(runId, data) {
  return setItem(`npc_rel_${runId}`, data)
}

export async function getNpcRelationships(runId) {
  try {
    const data = await getItem(`npc_rel_${runId}`)
    if (data) {
      // 导入反序列化函数
      const { deserializeFromStorage } = await import('./snapshotUtils')
      return deserializeFromStorage(data)
    }
    return null
  } catch (e) {
    console.error('[IndexedDB] Error getting npcRelationships:', e)
    return null
  }
}

export async function removeNpcRelationships(runId) {
  console.log(`[IndexedDB] Removing npc relationships for run: ${runId}`)
  return removeItem(`npc_rel_${runId}`)
}

// Storage Persistence Helper
export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist()
    console.log(`[IndexedDB] Storage persisted: ${isPersisted}`)
    return isPersisted
  }
  return false
}

// Auto Schedule Checkpoint
const SCHEDULE_CHECKPOINT_KEY = 'auto_schedule_checkpoint'

export async function saveAutoScheduleCheckpoint(data) {
  console.log('[IndexedDB] Saving auto schedule checkpoint...')
  return setItem(SCHEDULE_CHECKPOINT_KEY, { ...data, timestamp: Date.now() })
}

export async function getAutoScheduleCheckpoint() {
  const data = await getItem(SCHEDULE_CHECKPOINT_KEY)
  if (!data) return null
  // 1小时过期
  if (Date.now() - (data.timestamp || 0) > 3600000) {
    await removeItem(SCHEDULE_CHECKPOINT_KEY)
    return null
  }
  return data
}

export async function clearAutoScheduleCheckpoint() {
  return removeItem(SCHEDULE_CHECKPOINT_KEY)
}

// Migration Helper
export async function migrateFromLocalStorage(keys) {
  console.log('[IndexedDB] Checking for migration...')
  let migratedCount = 0

  for (const key of keys) {
    // Check if exists in DB
    const dbValue = await getItem(key)
    if (dbValue !== undefined) {
      continue // Already exists in DB, skip
    }

    // Check LocalStorage
    const lsValue = localStorage.getItem(key)
    if (lsValue !== null) {
      try {
        console.log(`[IndexedDB] Migrating ${key} from LocalStorage...`)
        let data = lsValue
        // Try to parse JSON if it looks like one, but keep as string if fails (setItem handles raw data if needed)
        // Actually, localStorage stores strings. If our app expects objects (like saveSnapshots), we should parse it.
        // However, the setItem call will store it as is.
        // Let's rely on JSON.parse check just to be safe if we want to store objects natively in IDB.
        try {
            data = JSON.parse(lsValue)
        } catch (e) {
            // Not a JSON string, keep as is
        }

        await setItem(key, data)
        // Optional: Remove from LocalStorage after successful migration?
        // keeping it as backup might be safer for now, but to free up space we should remove.
        // Let's remove it to solve the quota issue.
        localStorage.removeItem(key)
        migratedCount++
      } catch (e) {
        console.error(`[IndexedDB] Failed to migrate ${key}:`, e)
      }
    }
  }

  if (migratedCount > 0) {
    console.log(`[IndexedDB] Migrated ${migratedCount} items from LocalStorage.`)
  }
}

// ==================== 分片存储 ====================

const CHUNK_SIZE = 200 // 每片200条消息
/**
 * 分片保存 chatLog
 * @param {string} snapshotId 快照ID
 * @param {Array} chatLog 聊天记录数组
 * @param {Object} [options]
 * @param {boolean} [options.incremental=false] 
 * @param {(entry:any, index:number)=>any} [options.serializeEntry] 单条消息序列化函数 * @param {number} [options.rewriteFromIndex] @returns {Promise<void>}
 */
export async function saveChunkedChatLog(snapshotId, chatLog, options = {}) {
  const { incremental = false, serializeEntry, rewriteFromIndex } = options
  const totalMessages = Array.isArray(chatLog) ? chatLog.length : 0
  const totalChunks = Math.ceil(totalMessages / CHUNK_SIZE)
  const metaKey = `${snapshotId}_meta`
  const previousMeta = incremental ? await getItem(metaKey, SNAPSHOT_STORE_NAME) : null

  let startChunk = 0
  if (incremental && previousMeta && Number.isInteger(previousMeta.totalMessages)) {
    const previousMessages = previousMeta.totalMessages

    // 历史被回溯或截断：全量重写
    if (totalMessages < previousMessages) {
      startChunk = 0
    } else if (totalMessages === previousMessages) {
      // 消息数不变也可能有内容编辑（如图片占位替换），重写最后一个分片兜底
      startChunk = totalChunks > 0 ? totalChunks - 1 : 0
    } else if (previousMessages === 0) {
      startChunk = 0
    } else if (previousMessages % CHUNK_SIZE === 0) {
      // 正好从新分片开始追加
      startChunk = previousMessages / CHUNK_SIZE
    } else {
      // 需要重写上一个尾分片 + 新分片
      startChunk = Math.floor(previousMessages / CHUNK_SIZE)
    }
  }

  // 历史编辑场景：强制从被编辑消息所在分片开始重写
  if (Number.isInteger(rewriteFromIndex) && rewriteFromIndex >= 0) {
    const forcedStartChunk = Math.floor(rewriteFromIndex / CHUNK_SIZE)
    startChunk = Math.min(startChunk, forcedStartChunk)
  }

  for (let i = startChunk; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min((i + 1) * CHUNK_SIZE, totalMessages)
    let chunk = chatLog.slice(start, end)

    if (typeof serializeEntry === 'function') {
      chunk = chunk.map((entry, offset) => serializeEntry(entry, start + offset))
    }
    assertSerializableInDev(chunk, `${snapshotId}_chunk_${i}`)
    await setItem(`${snapshotId}_chunk_${i}`, chunk, SNAPSHOT_STORE_NAME)
  }

  // 清理多余旧分片（处理回溯/截断）
  if (previousMeta && Number.isInteger(previousMeta.totalChunks) && previousMeta.totalChunks > totalChunks) {
    for (let i = totalChunks; i < previousMeta.totalChunks; i++) {
      await removeItem(`${snapshotId}_chunk_${i}`, SNAPSHOT_STORE_NAME)
    }
  }
  // 保存元数据
  const metaPayload = {
    totalChunks,
    totalMessages,
    chunkSize: CHUNK_SIZE,
    updatedAt: Date.now()
  }
  assertSerializableInDev(metaPayload, metaKey)
  await setItem(metaKey, metaPayload, SNAPSHOT_STORE_NAME)
}

/**
 * 分片加载 chatLog
 * @param {string} snapshotId 快照ID
 * @returns {Promise<Array|null>} 聊天记录数组
 */
export async function loadChunkedChatLog(snapshotId) {
  const meta = await getItem(`${snapshotId}_meta`, SNAPSHOT_STORE_NAME)
  if (!meta) return null
  const chatLog = []
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunk = await getItem(`${snapshotId}_chunk_${i}`, SNAPSHOT_STORE_NAME)
    if (chunk) chatLog.push(...chunk)
  }
  return chatLog
}

/**
 * 删除分片存储的 chatLog
 * @param {string} snapshotId 快照ID
 * @returns {Promise<void>}
 */
export async function removeChunkedChatLog(snapshotId) {
  const meta = await getItem(`${snapshotId}_meta`, SNAPSHOT_STORE_NAME)
  if (!meta) return

  // 删除所有分片
  for (let i = 0; i < meta.totalChunks; i++) {
    await removeItem(`${snapshotId}_chunk_${i}`, SNAPSHOT_STORE_NAME)
  }
  // 删除元数据
  await removeItem(`${snapshotId}_meta`, SNAPSHOT_STORE_NAME)
}

// ==================== 存储监控工具 ====================

/**
 * 获取存储使用量和配额
 * @returns {Promise<{usageMB: number, quotaMB: number, usagePercent: number}>}
 */
export async function getStorageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      const usageMB = (estimate.usage || 0) / (1024 * 1024)
      const quotaMB = (estimate.quota || 0) / (1024 * 1024)
      const usagePercent = quotaMB > 0 ? (usageMB / quotaMB) * 100 : 0

      return {
        usageMB: Math.round(usageMB * 100) / 100,
        quotaMB: Math.round(quotaMB * 100) / 100,
        usagePercent: Math.round(usagePercent * 100) / 100
      }
    }
    return { usageMB: 0, quotaMB: 0, usagePercent: 0 }
  } catch (e) {
    console.error('[IndexedDB] Failed to get storage estimate:', e)
    return { usageMB: 0, quotaMB: 0, usagePercent: 0 }
  }
}

/**
 * 获取所有快照ID（用于检测孤立数据）
 * @returns {Promise<string[]>}
 */
export async function getAllSnapshotIds() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readonly')
      const store = transaction.objectStore(SNAPSHOT_STORE_NAME)
      const request = store.getAllKeys()

      request.onsuccess = (event) => {
        const keys = event.target.result || []
     // 提取快照ID（排除分片和元数据键）
        const snapshotIds = new Set()
        for (const key of keys) {
          if (typeof key === 'string') {
            // 提取基础快照ID（移除 _chunk_N 和 _meta 后缀）
            const baseId = key.replace(/_chunk_\d+$/, '').replace(/_meta$/, '')
            if (baseId !== key || !key.includes('_chunk_') && !key.endsWith('_meta')) {
              snapshotIds.add(baseId)
            }
          }
        }
        resolve(Array.from(snapshotIds))
      }
      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error('[IndexedDB] Failed to get all snapshot IDs:', e)
    return []
  }
}

// ==================== Phase 2: 记忆池 & 实体索引持久化 ====================

const MEMORY_POOL_PREFIX = 'mem_pool:'
const ENTITY_LOOKUP_PREFIX = 'entity_lookup:'

/**
 * 持久化记忆池状态
 * @param {string} runId 当前运行 ID
 * @param {object} poolData 序列化后的池数据
 */
export async function persistMemoryPoolState(runId, poolData) {
  if (!runId || !poolData) return
  return setItem(`${MEMORY_POOL_PREFIX}${runId}`, poolData, DATA_STORE_NAME)
}

/**
 * 读取记忆池状态
 * @param {string} runId 当前运行 ID
 * @returns {Promise<object|null>}
 */
export async function retrieveMemoryPoolState(runId) {
  if (!runId) return null
  return getItem(`${MEMORY_POOL_PREFIX}${runId}`, DATA_STORE_NAME)
}

/**
 * 持久化实体索引数据
 * @param {string} runId 当前运行 ID
 * @param {object} lookupData 序列化后的索引数据
 */
export async function persistEntityLookupData(runId, lookupData) {
  if (!runId || !lookupData) return
  return setItem(`${ENTITY_LOOKUP_PREFIX}${runId}`, lookupData, DATA_STORE_NAME)
}

/**
 * 读取实体索引数据
 * @param {string} runId 当前运行 ID
 * @returns {Promise<object|null>}
 */
export async function retrieveEntityLookupData(runId) {
  if (!runId) return null
  return getItem(`${ENTITY_LOOKUP_PREFIX}${runId}`, DATA_STORE_NAME)
}
