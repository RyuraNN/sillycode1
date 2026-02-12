/**
 * IndexedDB Utility for School Simulator
 * Used for storing large data like roster backups that exceed LocalStorage limits.
 */

const DB_NAME = 'SchoolSimulatorDB'
const DB_VERSION = 3 // Incremented version for snapshot store
const STORE_NAME = 'backups' // Keep for roster backup
const DATA_STORE_NAME = 'game_data' // For general game data
const SNAPSHOT_STORE_NAME = 'snapshot_data' // New store for heavy snapshot data

let dbInstance = null

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
      request.onerror = (event) => reject(event.target.error)
    })
  } catch (e) {
    console.error(`[IndexedDB] Error saving item to ${storeName}:`, e)
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
export async function saveSnapshotData(id, data) {
  // console.log(`[IndexedDB] Saving snapshot data for ${id}...`)
  return setItem(id, data, SNAPSHOT_STORE_NAME)
}

export async function getSnapshotData(id) {
  // console.log(`[IndexedDB] Loading snapshot data for ${id}...`)
  return getItem(id, SNAPSHOT_STORE_NAME)
}

export async function removeSnapshotData(id) {
  console.log(`[IndexedDB] Removing snapshot data for ${id}...`)
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

// Storage Persistence Helper
export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist()
    console.log(`[IndexedDB] Storage persisted: ${isPersisted}`)
    return isPersisted
  }
  return false
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
