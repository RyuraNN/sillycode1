/**
 * 兼职系统世界书管理
 * 管理玩家兼职履历的世界书条目
 */

import { useGameStore } from '../stores/gameStore'

// 条目名称前缀
const ENTRY_PREFIX = '[Jobs:'
const ENTRY_SUFFIX = ']兼职状态'

/**
 * 获取当前绑定的世界书名称
 */
function getCurrentBookName() {
  if (typeof window.getCharWorldbookNames !== 'function') return null
  const books = window.getCharWorldbookNames('current')
  return books.primary || (books.additional && books.additional[0])
}

/**
 * 生成兼职状态条目名称
 * @param {string} runId - 当前运行ID
 * @returns {string} 条目名称
 */
function getEntryName(runId) {
  return `${ENTRY_PREFIX}${runId}${ENTRY_SUFFIX}`
}

/**
 * 生成兼职履历内容
 * @param {Array} history - 兼职历史记录
 * @param {string} playerName - 玩家名称
 * @returns {string} 世界书内容
 */
function generatePartTimeContent(history, playerName) {
  if (!history || history.length === 0) {
    return `[兼职履历]
${playerName}暂无兼职工作经历。`
  }

  let content = `[兼职履历]\n`
  
  // 倒序排列，最近的在前面
  const sortedHistory = [...history].reverse()
  
  sortedHistory.forEach((record, index) => {
    const period = record.endDate 
      ? `${record.startDate} - ${record.endDate}`
      : `${record.startDate} - 至今 (当前在职)`
      
    content += `${index + 1}. ${period}：在"${record.jobName}"工作。\n`
    content += `   职责：${record.jobDescription}\n`
  })
  
  content += `\n注意：以上是${playerName}的兼职工作履历。`
  
  return content
}

/**
 * 更新兼职状态世界书条目（履历式）
 * @param {string} runId - 当前运行ID (可选，默认使用 Store 中的 currentRunId)
 * @param {Array} history - 兼职历史记录数组 (可选，默认使用 Store 中的 history)
 * @param {string} playerName - 玩家名称 (可选，默认使用 Store 中的 player.name)
 */
export async function updatePartTimeWorldbookEntry(runId, history, playerName) {
  try {
    if (typeof window.updateWorldbookWith !== 'function') {
      console.warn('[PartTimeWorldbook] Worldbook API not available')
      return
    }

    const gameStore = useGameStore()
    
    // 如果未提供参数，则从 Store 获取
    const currentRunId = runId || gameStore.currentRunId
    const currentHistory = history || gameStore.player.partTimeJob.history
    const currentPlayerName = playerName || gameStore.player.name

    const bookName = getCurrentBookName()
    if (!bookName) {
      console.warn('[PartTimeWorldbook] No target worldbook found')
      return
    }

    const entryName = getEntryName(currentRunId)
    const content = generatePartTimeContent(currentHistory, currentPlayerName)
    
    // 关键词：玩家名，以及固定词 "兼职", "工作"
    const keys = [currentPlayerName, '兼职', '工作']

    await window.updateWorldbookWith(bookName, entries => {
      const existingIndex = entries.findIndex(e => e.name === entryName || e.comment === entryName)
      
      const newEntry = {
        uid: existingIndex > -1 ? entries[existingIndex].uid : Date.now(),
        name: entryName,
        comment: entryName,
        content: content,
        strategy: {
          type: 'selective',
          keys: keys,
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'after_character_definition',
          order: 5
        },
        enabled: true, // 默认启用
        probability: 100,
        recursion: {
          prevent_incoming: false,
          prevent_outgoing: false,
          delay_until: null
        },
        effect: {
          sticky: null,
          cooldown: null,
          delay: null
        }
      }

      if (existingIndex > -1) {
        // 更新现有条目
        entries[existingIndex] = { ...entries[existingIndex], ...newEntry }
      } else {
        // 添加新条目
        entries.push(newEntry)
      }
      return entries
    })

    console.log(`[PartTimeWorldbook] Updated resume entry: ${entryName}`)
  } catch (e) {
    console.error('[PartTimeWorldbook] Failed to update entry:', e)
  }
}

/**
 * 切换兼职状态条目的启用状态
 * @param {string} runId - 当前运行ID
 * @param {boolean} enabled - 是否启用
 */
export async function togglePartTimeEntry(runId, enabled) {
  try {
    if (typeof window.updateWorldbookWith !== 'function') return

    const bookName = getCurrentBookName()
    if (!bookName) return

    const entryName = getEntryName(runId)
    
    await window.updateWorldbookWith(bookName, entry => {
      if (entry.name === entryName || entry.comment === entryName) {
        return { ...entry, enabled }
      }
      return entry
    })
    console.log(`[PartTimeWorldbook] ${enabled ? 'Enabled' : 'Disabled'} entry: ${entryName}`)
  } catch (e) {
    console.error('[PartTimeWorldbook] Failed to toggle entry:', e)
  }
}

/**
 * 禁用所有非当前存档的兼职条目（用于存档切换时）
 * 也可以称为 switchSaveSlot
 * @param {string} currentRunId - 当前运行ID (可选)
 */
export async function cleanupOldPartTimeEntries(currentRunId) {
  try {
    if (typeof window.updateWorldbookWith !== 'function') return

    const gameStore = useGameStore()
    const targetRunId = currentRunId || gameStore.currentRunId

    const bookName = getCurrentBookName()
    if (!bookName) return

    // 使用 updateWorldbookWith 批量更新
    await window.updateWorldbookWith(bookName, entries => {
      let updatedCount = 0
      const newEntries = entries.map(entry => {
        const name = entry.name || entry.comment || ''
        // 检查是否是兼职条目
        if (name.startsWith(ENTRY_PREFIX) && name.endsWith(ENTRY_SUFFIX)) {
          // 提取中间的 ID
          const entryRunId = name.slice(ENTRY_PREFIX.length, -ENTRY_SUFFIX.length)
          
          // 如果不是当前 RunID，且当前是启用状态，则禁用它
          if (entryRunId !== targetRunId && entry.enabled) {
            updatedCount++
            return { ...entry, enabled: false }
          }
          // 如果是当前 RunID，且被禁用了，则启用它（保险起见）
          if (entryRunId === targetRunId && !entry.enabled) {
            updatedCount++
            return { ...entry, enabled: true }
          }
        }
        return entry
      })
      
      console.log(`[PartTimeWorldbook] Updated ${updatedCount} entries' status for run: ${targetRunId}`)
      return newEntries
    })

  } catch (e) {
    console.error('[PartTimeWorldbook] Failed to update old entries status:', e)
  }
}

/**
 * 从 Store 恢复世界书（回溯/重建机制）
 * 读取 Store 中的完整历史，然后覆盖写入世界书
 * 也会创建在世界书中缺失但 Store 中存在的条目
 * 对应于 SocialWorldbook 的 restoreWorldbookFromStore
 */
export async function restorePartTimeWorldbookFromStore() {
    const gameStore = useGameStore()
    const runId = gameStore.currentRunId
    const history = gameStore.player.partTimeJob.history
    const playerName = gameStore.player.name

    console.log(`[PartTimeWorldbook] Restoring/Rebuilding worldbook from store for run: ${runId}`)

    // 复用 updatePartTimeWorldbookEntry 逻辑，它会自动创建或更新
    // 同时也会使用最新的 playerName 和 history
    await updatePartTimeWorldbookEntry(runId, history, playerName)

    // 确保其他存档的条目被禁用 (Auto-Switch)
    await cleanupOldPartTimeEntries(runId)
}

/**
 * 切换存档槽位 (别名，为了保持命名一致性)
 */
export async function switchPartTimeSaveSlot() {
    const gameStore = useGameStore()
    await cleanupOldPartTimeEntries(gameStore.currentRunId)
}
