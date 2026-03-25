/**
 * multiplayerSync.js - 联机状态同步逻辑
 * 负责：世界书 hash 生成/对比、世界书备份/恢复、位置同步钩子、NPC 记忆同步
 */

import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'
import { isWorldbookAvailable, getAllBookNames, getCurrentBookName } from './worldbookHelper'
import { setItem, getItem, removeItem } from './indexedDB'
import { sendLocationChange, sendPlayerUpdate, sendNpcMemorySync, sendWorldbookSyncComplete } from './multiplayerWs'

const WB_BACKUP_KEY_PREFIX = 'wb_backup_'

// ==================== 世界书 Hash ====================

/**
 * 生成当前世界书内容的 hash（用于快速对比）
 * 使用所有世界书条目的 name + content 拼接后做 SHA-256
 * @returns {Promise<string|null>} hex hash 字符串
 */
export async function generateWorldbookHash() {
  if (!isWorldbookAvailable()) return null

  try {
    const bookNames = getAllBookNames()
    if (bookNames.length === 0) return null

    const allEntries = []
    for (const bookName of bookNames) {
      if (typeof window.getWorldbook !== 'function') continue
      const entries = await window.getWorldbook(bookName)
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          allEntries.push(`${entry.name || ''}::${entry.content || ''}`)
        }
      }
    }

    // 排序确保顺序一致
    allEntries.sort()
    const combined = allEntries.join('\n')

    // SHA-256 hash
    const encoder = new TextEncoder()
    const data = encoder.encode(combined)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    console.error('[MultiplayerSync] Failed to generate worldbook hash:', e)
    return null
  }
}

// ==================== 世界书快照 ====================

/**
 * 获取当前世界书的完整条目数据（用于备份和传输）
 * @returns {Promise<{bookName: string, entries: any[]}[]>}
 */
export async function getWorldbookSnapshot() {
  if (!isWorldbookAvailable()) return []

  const bookNames = getAllBookNames()
  const result = []

  for (const bookName of bookNames) {
    try {
      if (typeof window.getWorldbook !== 'function') continue
      const entries = await window.getWorldbook(bookName)
      if (Array.isArray(entries)) {
        result.push({ bookName, entries: JSON.parse(JSON.stringify(entries)) })
      }
    } catch (e) {
      console.warn(`[MultiplayerSync] Failed to get worldbook snapshot for ${bookName}:`, e)
    }
  }

  return result
}

/**
 * 获取世界书条目总数
 */
export async function getWorldbookEntryCount() {
  const snapshot = await getWorldbookSnapshot()
  let count = 0
  for (const book of snapshot) {
    count += book.entries.length
  }
  return count
}

// ==================== 世界书备份 ====================

/**
 * 创建世界书备份到 IndexedDB
 * @param {string} source 备份来源
 * @param {Object} extra 额外元数据 { roomId, hostName, label }
 * @returns {Promise<{id: string, dataKey: string}>}
 */
export async function createWorldbookBackup(source = 'manual', extra = {}) {
  const mpStore = useMultiplayerStore()

  const snapshot = await getWorldbookSnapshot()
  const entryCount = snapshot.reduce((sum, book) => sum + book.entries.length, 0)

  const id = `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const dataKey = `${WB_BACKUP_KEY_PREFIX}${id}`

  // 存储世界书数据到 IndexedDB
  await setItem(dataKey, snapshot)

  // 存储元数据到 multiplayerStore
  const backup = {
    id,
    timestamp: Date.now(),
    source,
    roomId: extra.roomId || mpStore.roomId || undefined,
    hostName: extra.hostName || mpStore.hostName || undefined,
    entryCount,
    dataKey,
    label: extra.label || undefined,
  }

  mpStore.saveBackupMeta(backup)
  console.log(`[MultiplayerSync] Worldbook backup created: ${id} (${entryCount} entries, source: ${source})`)

  return { id, dataKey }
}

/**
 * 从 IndexedDB 恢复世界书备份
 * @param {string} backupId
 * @returns {Promise<boolean>} 是否成功
 */
export async function restoreWorldbookBackup(backupId) {
  const mpStore = useMultiplayerStore()
  const meta = mpStore.worldbookBackups.find(b => b.id === backupId)
  if (!meta) {
    console.error('[MultiplayerSync] Backup not found:', backupId)
    return false
  }

  try {
    const snapshot = await getItem(meta.dataKey)
    if (!snapshot || !Array.isArray(snapshot)) {
      console.error('[MultiplayerSync] Backup data invalid:', meta.dataKey)
      return false
    }

    // 先备份当前世界书（双向保护）
    await createWorldbookBackup('restore_swap', { label: `恢复前自动备份 (来源: ${meta.id})` })

    // 应用备份数据
    await applyWorldbookSnapshot(snapshot)

    console.log(`[MultiplayerSync] Worldbook restored from backup: ${backupId}`)
    return true
  } catch (e) {
    console.error('[MultiplayerSync] Restore failed:', e)
    return false
  }
}

/**
 * 删除世界书备份
 * @param {string} backupId
 */
export async function deleteWorldbookBackup(backupId) {
  const mpStore = useMultiplayerStore()
  const meta = mpStore.worldbookBackups.find(b => b.id === backupId)
  if (meta) {
    try {
      await removeItem(meta.dataKey)
    } catch (e) {
      console.warn('[MultiplayerSync] Failed to remove backup data:', e)
    }
    mpStore.removeBackupMeta(backupId)
  }
}

/**
 * 将世界书快照数据写入到实际世界书
 * @param {Array<{bookName: string, entries: any[]}>} snapshot
 */
async function applyWorldbookSnapshot(snapshot) {
  if (!isWorldbookAvailable()) {
    throw new Error('世界书 API 不可用')
  }

  for (const book of snapshot) {
    if (typeof window.setWorldbook !== 'function') {
      throw new Error('setWorldbook API 不可用')
    }
    await window.setWorldbook(book.bookName, book.entries)
  }
}

// ==================== 联机世界书同步流程 ====================

/**
 * 联机加入房间时的世界书同步流程
 * 1. 对比本地 hash 与房主 hash
 * 2. 如果不一致，请求房主的世界书数据
 * 3. 备份本地世界书 → 应用房主世界书
 * @param {string} hostHash 房主的世界书 hash
 * @returns {Promise<{match: boolean, synced: boolean, error?: string}>}
 */
export async function checkAndSyncWorldbook(hostHash) {
  if (!hostHash) {
    return { match: true, synced: false }
  }

  const localHash = await generateWorldbookHash()

  if (localHash === hostHash) {
    console.log('[MultiplayerSync] Worldbook hash matches host')
    return { match: true, synced: false }
  }

  console.log('[MultiplayerSync] Worldbook hash mismatch, local:', localHash?.slice(0, 16), 'host:', hostHash?.slice(0, 16))
  return { match: false, synced: false }
}

/**
 * 接受房主的世界书数据并同步
 * @param {Array<{bookName: string, entries: any[]}>} hostSnapshot 房主的世界书快照
 * @param {Object} extra 额外信息
 * @returns {Promise<boolean>}
 */
export async function acceptHostWorldbook(hostSnapshot, extra = {}) {
  try {
    // 先备份当前世界书
    await createWorldbookBackup('multiplayer_sync', {
      roomId: extra.roomId,
      hostName: extra.hostName,
      label: `联机同步前备份 (房间: ${extra.roomId || '?'}, 房主: ${extra.hostName || '?'})`,
    })

    // 应用房主的世界书
    await applyWorldbookSnapshot(hostSnapshot)

    // 通知服务端同步完成
    sendWorldbookSyncComplete(true)

    console.log('[MultiplayerSync] Host worldbook applied successfully')
    return true
  } catch (e) {
    console.error('[MultiplayerSync] Failed to apply host worldbook:', e)
    sendWorldbookSyncComplete(false)
    return false
  }
}

// ==================== Phase 4: 世界书抽查样本 ====================

/**
 * 生成世界书随机抽查样本（房主创建房间后调用）
 * @param {number} count 抽取条目数
 * @returns {Promise<Array<{key: string, hash: string}>>}
 */
export async function generateWorldbookSpotSamples(count = 20) {
  if (!isWorldbookAvailable()) return []

  try {
    const bookNames = getAllBookNames()
    const allEntries = []
    for (const bookName of bookNames) {
      if (typeof window.getWorldbook !== 'function') continue
      const entries = await window.getWorldbook(bookName)
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.name) allEntries.push(entry)
        }
      }
    }

    // 随机打乱并取前 count 个
    const shuffled = allEntries.sort(() => Math.random() - 0.5).slice(0, count)

    const samples = []
    for (const entry of shuffled) {
      const raw = `${entry.name}::${entry.content || ''}`
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw))
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      samples.push({ key: entry.name, hash })
    }

    return samples
  } catch (e) {
    console.error('[MultiplayerSync] Failed to generate spot samples:', e)
    return []
  }
}

/**
 * 获取单个世界书条目的 hash（用于抽查响应）
 * @param {string} entryName 条目名
 * @returns {Promise<string|null>} SHA-256 hex hash
 */
export async function getWorldbookEntryHash(entryName) {
  if (!isWorldbookAvailable()) return null

  try {
    const bookNames = getAllBookNames()
    for (const bookName of bookNames) {
      if (typeof window.getWorldbook !== 'function') continue
      const entries = await window.getWorldbook(bookName)
      if (!Array.isArray(entries)) continue
      const entry = entries.find(e => e.name === entryName)
      if (entry) {
        const raw = `${entry.name}::${entry.content || ''}`
        const encoder = new TextEncoder()
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw))
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      }
    }
    return null
  } catch (e) {
    console.error('[MultiplayerSync] Failed to get entry hash:', e)
    return null
  }
}

// ==================== 位置同步钩子 ====================

/**
 * 位置变更时调用，同步到联机服务端
 * @param {string} newLocation 新位置 ID
 */
export function syncLocationChange(newLocation) {
  const mpStore = useMultiplayerStore()
  if (!mpStore.isMultiplayerActive) return
  sendLocationChange(newLocation)
}

// ==================== NPC 记忆同步钩子 ====================

/**
 * 当 AI 输出 <npc_memory> 时调用
 * @param {string} npcName NPC 名称
 * @param {Object} memory { time, content, witness, floor }
 */
export function syncNpcMemory(npcName, memory) {
  const mpStore = useMultiplayerStore()
  const gameStore = useGameStore()

  // 写入本地 gameStore
  if (!gameStore.world.npcMemories[npcName]) {
    gameStore.world.npcMemories[npcName] = []
  }
  gameStore.world.npcMemories[npcName].push(memory)

  // 限制本地记忆条数
  if (gameStore.world.npcMemories[npcName].length > 50) {
    gameStore.world.npcMemories[npcName] = gameStore.world.npcMemories[npcName].slice(-50)
  }

  // 联机模式下同步到服务端
  if (mpStore.isMultiplayerActive) {
    sendNpcMemorySync(npcName, memory)
  }
}
