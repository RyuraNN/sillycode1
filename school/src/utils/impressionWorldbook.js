import { useGameStore } from '../stores/gameStore'
import { getCurrentBookName as _getCurrentBookName } from './worldbookHelper'

const IMPRESSION_PREFIX = '[Impression:'

/**
 * 检查角色是否有与玩家的有效印象数据
 * @param {Object} relationships 所有角色关系数据
 * @param {string} charName 角色名称
 * @param {string} playerName 玩家名称
 * @returns {Object|null} 如果有效返回关系数据，否则返回null
 */
function getValidPlayerRelation(relationships, charName, playerName) {
  const charData = relationships[charName]
  if (!charData || !charData.relations || !charData.relations[playerName]) {
    return null
  }

  const rel = charData.relations[playerName]
  
  // 检查是否有有效数据 (有数值或有标签)
  // 根据需求：和玩家有关系（和玩家接触过，对玩家有印象标签和四维数值的角色）
  const hasStats = rel.intimacy !== undefined || rel.trust !== undefined || rel.passion !== undefined || rel.hostility !== undefined
  const hasTags = rel.tags && rel.tags.length > 0
  
  if (hasStats || hasTags) {
    return rel
  }
  return null
}

// 获取当前运行 ID
function getCurrentRunId() {
  const gameStore = useGameStore()
  return gameStore.currentRunId || 'default'
}

// 获取当前绑定的世界书名称
function getCurrentBookName() {
  return _getCurrentBookName()
}

/**
 * 格式化印象列表内容
 * @param {Array} relevantChars 相关角色列表 [{name, relation}]
 * @param {string} playerName 玩家名称
 * @param {Array} npcs NPC列表（用于查询isAlive）
 * @returns {string} 格式化后的内容
 */
function formatImpressionContent(relevantChars, playerName, npcs) {
  let content = `-印象关系开始-\n`
  const lines = []

  for (const { name: charName, relation: rel } of relevantChars) {
    // 查询是否存活
    const npc = npcs.find(n => n.name === charName)
    const isAlive = npc ? npc.isAlive : false // 默认为false

    let line = `${charName}: `
    
    // 四维数值
    const stats = []
    if (rel.intimacy !== undefined) stats.push(`亲密${rel.intimacy}`)
    if (rel.trust !== undefined) stats.push(`信赖${rel.trust}`)
    if (rel.passion !== undefined) stats.push(`激情${rel.passion}`)
    if (rel.hostility !== undefined) stats.push(`敌意${rel.hostility}`)
    
    // 存活状态 (是否在场)
    stats.push(`是否在场: ${isAlive ? '是' : '否'}`)

    line += stats.join(' ')
    
    // 印象标签
    if (rel.tags && rel.tags.length > 0) {
      line += ` [对“${playerName}”的印象是 ${rel.tags.join(',')}]`
    }
    
    lines.push(line)
  }

  if (lines.length === 0) {
    return content + `(暂无对${playerName}的印象记录)\n-印象关系结束-`
  }

  content += lines.join('\n')
  content += `\n-印象关系结束-`
  return content
}

// 防抖计时器
let saveTimer = null
// 防抖延迟 (ms)
const SAVE_DELAY = 1000

/**
 * 执行实际的保存操作
 * @param {string} runId 
 */
async function performSaveImpressionData(runId) {
  const bookName = getCurrentBookName()
  if (!bookName) return false

  if (!runId) runId = getCurrentRunId()
  const gameStore = useGameStore()
  const playerName = gameStore.player.name
  
  // 0. 构建当前激活角色名单（来自 allClassData），用于过滤被屏蔽的角色
  const activeCharacterNames = new Set()
  if (gameStore.allClassData) {
    for (const classData of Object.values(gameStore.allClassData)) {
      if (classData.headTeacher?.name) activeCharacterNames.add(classData.headTeacher.name)
      const teachers = Array.isArray(classData.teachers) ? classData.teachers : []
      teachers.forEach(t => { if (t.name) activeCharacterNames.add(t.name) })
      const students = Array.isArray(classData.students) ? classData.students : []
      students.forEach(s => { if (s.name) activeCharacterNames.add(s.name) })
    }
  }
  
  // 1. 筛选出与玩家有关系的角色（仅包含当前激活的角色）
  const relevantChars = []
  for (const charName of Object.keys(gameStore.npcRelationships)) {
    // 跳过不在激活名单中的角色（被筛选面板排除的角色）
    if (activeCharacterNames.size > 0 && !activeCharacterNames.has(charName) && charName !== playerName) {
      continue
    }
    const relation = getValidPlayerRelation(gameStore.npcRelationships, charName, playerName)
    if (relation) {
      relevantChars.push({ name: charName, relation })
    }
  }
  
  // 2. 提取这些角色作为 Keys (只包含有关系的角色)
  const activeKeys = relevantChars.map(c => c.name)
  
  // 3. 生成内容
  const content = formatImpressionContent(relevantChars, playerName, gameStore.npcs)
  const entryName = `${IMPRESSION_PREFIX}${runId}] 印象列表`

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      const existingIndex = entries.findIndex(e => e.name === entryName)
      
      const newEntry = {
        name: entryName,
        content: content,
        enabled: activeKeys.length > 0, // 只有当有相关角色时才启用
        strategy: {
          type: 'selective', // 绿灯
          keys: activeKeys,  // 仅包含有关系的角色名
          keys_secondary: { logic: 'not_all', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'after_character_definition', // 角色定义之后
          order: 5 // 权重 5
        },
        probability: 100,
        recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
        effect: { sticky: null, cooldown: null, delay: null }
      }

      if (existingIndex > -1) {
        // 保留 uid
        entries[existingIndex] = { ...entries[existingIndex], ...newEntry, uid: entries[existingIndex].uid }
      } else {
        entries.push(newEntry)
      }
      return entries
    })

    console.log(`[ImpressionWorldbook] Saved impression data for run ${runId}. Relevant chars: ${activeKeys.length}`)
    return true
  } catch (e) {
    console.error('[ImpressionWorldbook] Error saving impression data:', e)
    return false
  }
}

/**
 * 保存/更新印象列表世界书条目 (带防抖)
 * @param {string} runId 当前运行ID
 */
export async function saveImpressionData(runId = null) {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      const result = await performSaveImpressionData(runId)
      resolve(result)
      saveTimer = null
    }, SAVE_DELAY)
  })
}

/**
 * 立即保存印象列表世界书条目（不带防抖，用于关键操作后确保数据持久化）
 * @param {string} runId 当前运行ID
 */
export async function saveImpressionDataImmediate(runId = null) {
  // 取消任何待执行的防抖保存
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  return await performSaveImpressionData(runId)
}

/**
 * 迁移旧格式的印象列表条目
 * 将 isAlive=true/false 替换为 是否在场: 是/否
 */
async function migrateOldImpressionEntries() {
  const bookName = getCurrentBookName()
  if (!bookName) return

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      let hasChanges = false
      const updatedEntries = entries.map(entry => {
        if (entry.name && entry.name.startsWith(IMPRESSION_PREFIX) && entry.content) {
          let newContent = entry.content
          let modified = false
          
          if (newContent.includes('isAlive=true')) {
            newContent = newContent.replace(/isAlive=true/g, '是否在场: 是')
            modified = true
          }
          if (newContent.includes('isAlive=false')) {
            newContent = newContent.replace(/isAlive=false/g, '是否在场: 否')
            modified = true
          }
          
          if (modified) {
            hasChanges = true
            console.log(`[ImpressionWorldbook] Migrated entry: ${entry.name}`)
            return { ...entry, content: newContent }
          }
        }
        return entry
      })
      
      return hasChanges ? updatedEntries : entries // 只有在有变化时才返回新数组，避免不必要的写入
    })
  } catch (e) {
    console.error('[ImpressionWorldbook] Error migrating old entries:', e)
  }
}

/**
 * 切换存档槽位（开启当前 runId 的条目，关闭其他的）
 */
export async function switchImpressionSlot() {
  const bookName = getCurrentBookName()
  if (!bookName) return

  const currentRunId = getCurrentRunId()
  console.log(`[ImpressionWorldbook] Switching slot to ${currentRunId}`)

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      return entries.map(entry => {
        if (entry.name && entry.name.startsWith(IMPRESSION_PREFIX)) {
          // 格式: [Impression:runId] 印象列表
          const content = entry.name.substring(IMPRESSION_PREFIX.length)
          const bracketIndex = content.indexOf(']')
          
          if (bracketIndex > -1) {
            const entryRunId = content.substring(0, bracketIndex)
            
            // 确保 runId 精确匹配
            const isCurrent = entryRunId === currentRunId
            
            if (isCurrent) {
               // 只有当有 keys 时才启用
               const shouldEnable = entry.strategy && entry.strategy.keys && entry.strategy.keys.length > 0
               if (shouldEnable && !entry.enabled) {
                 return { ...entry, enabled: true }
               }
            } else if (!isCurrent && entry.enabled) {
              console.log(`[ImpressionWorldbook] Disabling entry: ${entry.name}`)
              return { ...entry, enabled: false }
            }
          }
        }
        return entry
      })
    })
  } catch (e) {
    console.error('[ImpressionWorldbook] Error switching impression slot:', e)
  }
}

/**
 * 从 Store 重建世界书（回溯/导入时调用）
 * 直接调用 saveImpressionData 即可，因为 Store 是单一数据源
 */
export async function restoreImpressionWorldbookFromStore() {
  const runId = getCurrentRunId()
  console.log(`[ImpressionWorldbook] Restoring impression worldbook for run ${runId}`)
  
  // 0. 尝试迁移旧格式条目 (针对所有存档)
  await migrateOldImpressionEntries()

  // 1. 切换槽位状态 (switchImpressionSlot 逻辑现在比较保守，主要负责禁用旧的)
  await switchImpressionSlot()
  
  // 2. 重新保存数据（这是核心，它会正确设置 enabled 和 keys）
  await saveImpressionData(runId)
}
