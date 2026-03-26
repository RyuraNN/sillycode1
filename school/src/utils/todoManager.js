import { useGameStore } from '../stores/gameStore'

/**
 * 待办事项管理器
 * 负责待办事项的标记、匹配和统计
 */

/**
 * 从AI回复中提取待办完成指令
 * @param {string} aiResponse AI回复内容
 * @returns {Array} 指令数组
 */
export function extractTodoCompletionCommands(aiResponse) {
  return extractTodoActionCommands(aiResponse).filter(cmd => cmd.action === 'complete')
}

/**
 * 从 AI 回复中提取待办动作指令（完成/取消）
 * @param {string} aiResponse
 * @returns {Array<{action:'complete'|'cancel', floor:number, mode:'keyword'|'index', keyword?:string, index?:number, reason?:string}>}
 */
export function extractTodoActionCommands(aiResponse) {
  const commands = []
  if (!aiResponse) return commands

  const parseTag = (tagName, action) => {
    const tagRegex = new RegExp(`<${tagName}\\b([^>]*)\\/?>`, 'gi')
    let tagMatch

    while ((tagMatch = tagRegex.exec(aiResponse)) !== null) {
      const attrsText = tagMatch[1] || ''
      const attrs = {}
      const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
      let attrMatch

      while ((attrMatch = attrRegex.exec(attrsText)) !== null) {
        attrs[attrMatch[1].toLowerCase()] = attrMatch[2] ?? attrMatch[3] ?? ''
      }

      const floor = Number.parseInt(attrs.floor, 10)
      if (!Number.isInteger(floor)) continue

      if (typeof attrs.keyword === 'string' && attrs.keyword.trim()) {
        commands.push({
          action,
          floor,
          keyword: attrs.keyword.trim(),
          mode: 'keyword',
          reason: attrs.reason?.trim?.() || ''
        })
        continue
      }

      if (attrs.index !== undefined) {
        const index = Number.parseInt(attrs.index, 10)
        if (Number.isInteger(index)) {
          commands.push({
            action,
            floor,
            index,
            mode: 'index',
            reason: attrs.reason?.trim?.() || ''
          })
        }
      }
    }
  }

  parseTag('complete_todo', 'complete')
  parseTag('cancel_todo', 'cancel')

  return commands
}

/**
 * 解析待办事项内容，返回待办数组
 * @param {string} summaryContent 总结内容
 * @returns {Array<string>} 待办事项数组
 */
export function parseTodoItems(summaryContent) {
  const lines = summaryContent.split('\n')
  for (const line of lines) {
    const todoLineMatch = line.match(/^\s*待办事项[|｜](.*)$/)
    if (todoLineMatch) {
      const todoContent = todoLineMatch[1].trim()
      if (todoContent === '无' || todoContent === '') {
        return []
      }
      // 按分号、中文分号或顿号分割
      return todoContent.split(/[;；、]/).map(t => t.trim()).filter(t => t)
    }
  }
  return []
}

/**
 * 关键词匹配：支持部分匹配和分词匹配
 * @param {string} todoText 待办文本
 * @param {string} keyword 关键词
 * @returns {boolean} 是否匹配
 */
export function matchTodoByKeyword(todoText, keyword) {
  // 直接包含匹配
  if (todoText.includes(keyword)) {
    return true
  }

  // 分词匹配：将关键词按空格分割，检查是否所有词都在待办中
  const keywordParts = keyword.split(/\s+/).filter(p => p)
  if (keywordParts.length > 1) {
    return keywordParts.every(part => todoText.includes(part))
  }

  return false
}

function normalizeTodoText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]{}<>《》]/g, '')
}

function charBigrams(str) {
  if (!str) return []
  if (str.length < 2) return [str]
  const grams = []
  for (let i = 0; i < str.length - 1; i++) {
    grams.push(str.slice(i, i + 2))
  }
  return grams
}

export function calculateTodoSimilarity(a, b) {
  const na = normalizeTodoText(a)
  const nb = normalizeTodoText(b)
  if (!na || !nb) return 0
  if (na === nb || na.includes(nb) || nb.includes(na)) return 1

  const ga = charBigrams(na)
  const gb = charBigrams(nb)
  if (ga.length === 0 || gb.length === 0) return 0

  const freq = new Map()
  for (const g of ga) freq.set(g, (freq.get(g) || 0) + 1)
  let intersection = 0
  for (const g of gb) {
    const count = freq.get(g) || 0
    if (count > 0) {
      intersection++
      freq.set(g, count - 1)
    }
  }

  return (2 * intersection) / (ga.length + gb.length)
}

/**
 * 更新匹配统计
 * @param {Object} gameStore 游戏状态
 * @param {string} mode 匹配模式
 * @param {boolean} success 是否成功
 */
function updateMatchingStats(gameStore, mode, success) {
  if (!gameStore.notifications.todoMatchingStats) {
    gameStore.notifications.todoMatchingStats = {
      keyword: { success: 0, total: 0 },
      index: { success: 0, total: 0 }
    }
  }

  gameStore.notifications.todoMatchingStats[mode].total++
  if (success) {
    gameStore.notifications.todoMatchingStats[mode].success++
  }
}

function getSummaryCoveredFloors(summary) {
  if (!summary) return []
  if (Array.isArray(summary.coveredFloors) && summary.coveredFloors.length > 0) {
    return [...new Set(summary.coveredFloors)].sort((a, b) => a - b)
  }
  return Number.isFinite(summary.floor) ? [summary.floor] : []
}

function getTodoMarkerCandidateFloors(summary, requestedFloor) {
  const floors = new Set([
    requestedFloor,
    getTodoMarkerFloor(summary, requestedFloor),
    ...getSummaryCoveredFloors(summary)
  ].filter(floor => Number.isFinite(floor)))
  return [...floors]
}

export function findSummaryByTodoFloor(gameStore, floor) {
  const summaries = gameStore.player.summaries || []
  return summaries.find(summary =>
    summary.type === 'minor' && getSummaryCoveredFloors(summary).includes(floor)
  ) || summaries.find(summary =>
    summary.type === 'diary' && getSummaryCoveredFloors(summary).includes(floor)
  ) || null
}

function getTodoMarkerStatus(marker) {
  if (!marker) return 'pending'
  if (marker.todoStatus) return marker.todoStatus
  return 'completed'
}

export function getTodoStatus(gameStore, floor, todoIndex) {
  const marker = findTodoMarker(gameStore, floor, todoIndex)
  return getTodoMarkerStatus(marker)
}

export function isTodoCancelled(gameStore, floor, todoIndex) {
  return getTodoStatus(gameStore, floor, todoIndex) === 'cancelled'
}

function ensureTodoMarkerArray(gameStore) {
  if (!gameStore.notifications.completedTodoMarkers) {
    gameStore.notifications.completedTodoMarkers = []
  }
}

function upsertTodoMarker(gameStore, summary, floor, todoIndex, payload) {
  ensureTodoMarkerArray(gameStore)
  const markerFloor = getTodoMarkerFloor(summary, floor)
  const candidateFloors = getTodoMarkerCandidateFloors(summary, floor)
  const existing = gameStore.notifications.completedTodoMarkers.find(
    m => candidateFloors.includes(m.floor) && m.todoIndex === todoIndex
  )

  if (existing) {
    Object.assign(existing, {
      floor: markerFloor,
      todoIndex,
      ...payload
    })
    return { marker: existing, created: false }
  }

  const marker = {
    floor: markerFloor,
    todoIndex,
    ...payload
  }
  gameStore.notifications.completedTodoMarkers.push(marker)
  return { marker, created: true }
}

function markSummaryCompletedIndex(summary, todoIndex) {
  if (!summary.completedTodos) summary.completedTodos = []
  if (!summary.completedTodos.includes(todoIndex)) {
    summary.completedTodos.push(todoIndex)
  }
}

function unmarkSummaryCompletedIndex(summary, todoIndex) {
  if (summary.completedTodos) {
    summary.completedTodos = summary.completedTodos.filter(i => i !== todoIndex)
  }
}

function findTodoIndexByKeyword(todos, keyword) {
  const direct = todos.findIndex(todo => matchTodoByKeyword(todo, keyword))
  if (direct !== -1) return direct

  let bestIndex = -1
  let bestScore = 0
  for (let i = 0; i < todos.length; i++) {
    const score = calculateTodoSimilarity(todos[i], keyword)
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestScore > 0.7 ? bestIndex : -1
}

export function getTodoMarkerFloor(summary, requestedFloor) {
  if (!summary) return requestedFloor
  return Number.isFinite(summary.floor) ? summary.floor : requestedFloor
}

export function findTodoMarker(gameStore, floor, todoIndex) {
  const summary = findSummaryByTodoFloor(gameStore, floor)
  if (!summary) return null
  const candidateFloors = getTodoMarkerCandidateFloors(summary, floor)
  return gameStore.notifications.completedTodoMarkers?.find(
    marker => candidateFloors.includes(marker.floor) && marker.todoIndex === todoIndex
  ) || null
}

/**
 * 标记待办为已完成（关键词模式）
 * @param {Object} gameStore 游戏状态
 * @param {number} floor 楼层号
 * @param {string} keyword 关键词
 * @param {number} currentFloor 当前楼层
 * @returns {boolean} 是否成功
 */
export function markTodoAsCompletedByKeyword(gameStore, floor, keyword, currentFloor) {
  const summary = findSummaryByTodoFloor(gameStore, floor)
  if (!summary) {
    console.warn(`[TodoManager] Summary not found for floor ${floor}`)
    updateMatchingStats(gameStore, 'keyword', false)
    return false
  }

  const todos = parseTodoItems(summary.content)
  if (todos.length === 0) {
    console.warn(`[TodoManager] No todos found in floor ${floor}`)
    updateMatchingStats(gameStore, 'keyword', false)
    return false
  }

  // 查找匹配的待办
  const matchedIndex = findTodoIndexByKeyword(todos, keyword)
  if (matchedIndex === -1) {
    console.warn(`[TodoManager] No todo matched keyword "${keyword}" in floor ${floor}`)
    updateMatchingStats(gameStore, 'keyword', false)
    return false
  }

  upsertTodoMarker(gameStore, summary, floor, matchedIndex, {
    todoKeyword: keyword,
    completedAt: gameStore.meta.currentFloor,
    completedTimestamp: Date.now(),
    matchedBy: 'keyword',
    todoStatus: 'completed'
  })

  markSummaryCompletedIndex(summary, matchedIndex)

  console.log(`[TodoManager] Marked todo as completed: floor=${floor}, index=${matchedIndex}, keyword="${keyword}"`)
  updateMatchingStats(gameStore, 'keyword', true)
  return true

}

/**
 * 标记待办为已完成（索引模式）
 * @param {Object} gameStore 游戏状态
 * @param {number} floor 楼层号
 * @param {number} todoIndex 待办索引
 * @param {number} currentFloor 当前楼层
 * @returns {boolean} 是否成功
 */
export function markTodoAsCompletedByIndex(gameStore, floor, todoIndex, currentFloor) {
  const summary = findSummaryByTodoFloor(gameStore, floor)
  if (!summary) {
    console.warn(`[TodoManager] Summary not found for floor ${floor}`)
    updateMatchingStats(gameStore, 'index', false)
    return false
  }

  const todos = parseTodoItems(summary.content)
  if (todoIndex < 0 || todoIndex >= todos.length) {
    console.warn(`[TodoManager] Invalid todo index ${todoIndex} for floor ${floor} (total: ${todos.length})`)
    updateMatchingStats(gameStore, 'index', false)
    return false
  }

  upsertTodoMarker(gameStore, summary, floor, todoIndex, {
    completedAt: gameStore.meta.currentFloor,
    completedTimestamp: Date.now(),
    matchedBy: 'index',
    todoStatus: 'completed'
  })

  markSummaryCompletedIndex(summary, todoIndex)

  console.log(`[TodoManager] Marked todo as completed: floor=${floor}, index=${todoIndex}`)
  updateMatchingStats(gameStore, 'index', true)
  return true

}

export function markTodoAsCancelledByKeyword(gameStore, floor, keyword, currentFloor, reason = '') {
  const summary = findSummaryByTodoFloor(gameStore, floor)
  if (!summary) return false

  const todos = parseTodoItems(summary.content)
  if (todos.length === 0) return false

  const matchedIndex = findTodoIndexByKeyword(todos, keyword)
  if (matchedIndex === -1) return false

  upsertTodoMarker(gameStore, summary, floor, matchedIndex, {
    todoKeyword: keyword,
    completedAt: gameStore.meta.currentFloor,
    completedTimestamp: Date.now(),
    matchedBy: 'cancel',
    todoStatus: 'cancelled',
    cancelReason: reason || '剧情取消'
  })

  unmarkSummaryCompletedIndex(summary, matchedIndex)
  return true
}

export function markTodoAsCancelledByIndex(gameStore, floor, todoIndex, currentFloor, reason = '') {
  const summary = findSummaryByTodoFloor(gameStore, floor)
  if (!summary) return false

  const todos = parseTodoItems(summary.content)
  if (todoIndex < 0 || todoIndex >= todos.length) return false

  upsertTodoMarker(gameStore, summary, floor, todoIndex, {
    completedAt: gameStore.meta.currentFloor,
    completedTimestamp: Date.now(),
    matchedBy: 'cancel',
    todoStatus: 'cancelled',
    cancelReason: reason || '剧情取消'
  })

  unmarkSummaryCompletedIndex(summary, todoIndex)
  return true
}

/**
 * 检查待办是否已完成
 * @param {Object} gameStore 游戏状态
 * @param {number} floor 楼层号
 * @param {number} todoIndex 待办索引
 * @returns {boolean} 是否已完成
 */
export function isTodoCompleted(gameStore, floor, todoIndex) {
  return getTodoStatus(gameStore, floor, todoIndex) === 'completed'
}

function updateTodoLine(summaryContent, newTodos) {
  const lines = String(summaryContent || '').split('\n')
  let replaced = false
  const output = lines.map(line => {
    const m = line.match(/^\s*待办事项[|｜](.*)$/)
    if (!m) return line
    replaced = true
    if (!newTodos || newTodos.length === 0) return '待办事项|无'
    return `待办事项|${newTodos.join('；')}`
  })

  if (!replaced) {
    output.push(`待办事项|${newTodos && newTodos.length > 0 ? newTodos.join('；') : '无'}`)
  }

  return output.join('\n')
}

function collectPendingTodosFromStore(gameStore) {
  const pending = []
  const summaries = gameStore.player?.summaries || []
  for (const summary of summaries) {
    if (summary.type !== 'minor' && summary.type !== 'diary') continue
    const todos = parseTodoItems(summary.content)
    for (let i = 0; i < todos.length; i++) {
      if (getTodoStatus(gameStore, summary.floor, i) === 'pending') {
        pending.push(todos[i])
      }
    }
  }
  return pending
}

export function dedupeTodoItemsInSummary(summaryContent, gameStore, similarityThreshold = 0.7) {
  const rawTodos = parseTodoItems(summaryContent)
  if (rawTodos.length <= 1 && !gameStore) return summaryContent

  const existingPending = gameStore ? collectPendingTodosFromStore(gameStore) : []
  const unique = []

  for (const todo of rawTodos) {
    const duplicatedInSelf = unique.some(existing => calculateTodoSimilarity(existing, todo) > similarityThreshold)
    if (duplicatedInSelf) continue

    const duplicatedInStore = existingPending.some(existing => calculateTodoSimilarity(existing, todo) > similarityThreshold)
    if (duplicatedInStore) continue

    unique.push(todo)
  }

  return updateTodoLine(summaryContent, unique)
}

export function cleanupHistoricalTodoDuplicates(gameStore, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.7
  const dryRun = options.dryRun !== false
  const summaries = (gameStore.player?.summaries || [])
    .filter(s => s.type === 'minor' || s.type === 'diary')
    .sort((a, b) => (a.floor || 0) - (b.floor || 0))

  const canonicalPending = []
  const duplicates = []

  for (const summary of summaries) {
    const todos = parseTodoItems(summary.content)
    for (let i = 0; i < todos.length; i++) {
      const status = getTodoStatus(gameStore, summary.floor, i)
      if (status !== 'pending') continue

      const matched = canonicalPending.find(item => calculateTodoSimilarity(item.content, todos[i]) > threshold)
      if (matched) {
        duplicates.push({ floor: summary.floor, todoIndex: i, content: todos[i], duplicateOf: matched })
      } else {
        canonicalPending.push({ floor: summary.floor, todoIndex: i, content: todos[i] })
      }
    }
  }

  if (!dryRun) {
    for (const dup of duplicates) {
      const summary = findSummaryByTodoFloor(gameStore, dup.floor)
      if (!summary) continue
      upsertTodoMarker(gameStore, summary, dup.floor, dup.todoIndex, {
        completedAt: gameStore.meta.currentFloor,
        completedTimestamp: Date.now(),
        matchedBy: 'duplicate_filter',
        todoStatus: 'cancelled',
        cancelReason: '重复待办自动合并'
      })
      unmarkSummaryCompletedIndex(summary, dup.todoIndex)
    }
  }

  return {
    scannedSummaries: summaries.length,
    canonicalCount: canonicalPending.length,
    duplicateCount: duplicates.length,
    duplicates
  }
}

/**
 * 获取匹配统计信息
 * @param {Object} gameStore 游戏状态
 * @returns {Object} 统计信息
 */
export function getMatchingStats(gameStore) {
  const stats = gameStore.notifications.todoMatchingStats || {
    keyword: { success: 0, total: 0 },
    index: { success: 0, total: 0 }
  }

  return {
    keyword: {
      ...stats.keyword,
      rate: stats.keyword.total > 0 ? (stats.keyword.success / stats.keyword.total * 100).toFixed(1) : '0.0'
    },
    index: {
      ...stats.index,
      rate: stats.index.total > 0 ? (stats.index.success / stats.index.total * 100).toFixed(1) : '0.0'
    }
  }
}

/**
 * 从小总结内容中移除已完成的待办事项
 * @param {string} summaryContent 总结内容
 * @param {Array<number>} completedIndices 已完成的索引数组
 * @returns {string} 过滤后的内容
 */
export function filterCompletedTodos(summaryContent, completedIndices = []) {
  if (!completedIndices || completedIndices.length === 0) {
    return summaryContent
  }

  const lines = summaryContent.split('\n')
  const filteredLines = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 找到待办事项行
    const todoLineMatch = line.match(/^\s*待办事项[|｜](.*)$/)
    if (todoLineMatch) {
      const todoContent = todoLineMatch[1].trim()

      // 如果待办内容为"无"，保留
      if (todoContent === '无' || todoContent === '') {
        filteredLines.push(line)
        continue
      }

      // 解析多个待办（按分号分隔）
      const todos = todoContent.split(/[;；、]/).map(t => t.trim()).filter(t => t)
      const remainingTodos = todos.filter((_, idx) => !completedIndices.includes(idx))

      if (remainingTodos.length > 0) {
        filteredLines.push(`待办事项|${remainingTodos.join('；')}`)
      } else {
        filteredLines.push('待办事项|无')
      }
    } else {
      filteredLines.push(line)
    }
  }

  return filteredLines.join('\n')
}
