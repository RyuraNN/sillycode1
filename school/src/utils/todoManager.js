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
  const commands = []
  if (!aiResponse) return commands

  // 兼容属性顺序变化: <complete_todo keyword="..." floor="123" />
  const tagRegex = /<complete_todo\b([^>]*)\/?>/gi
  let tagMatch

  while ((tagMatch = tagRegex.exec(aiResponse)) !== null) {
    const attrsText = tagMatch[1] || ''
    const attrs = {}
    const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g
    let attrMatch

    while ((attrMatch = attrRegex.exec(attrsText)) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2]
    }

    const floor = Number.parseInt(attrs.floor, 10)
    if (!Number.isInteger(floor)) continue

    if (typeof attrs.keyword === 'string' && attrs.keyword.trim()) {
      commands.push({
        floor,
        keyword: attrs.keyword.trim(),
        mode: 'keyword'
      })
      continue
    }

    if (attrs.index !== undefined) {
      const index = Number.parseInt(attrs.index, 10)
      if (Number.isInteger(index)) {
        commands.push({
          floor,
          index,
          mode: 'index'
        })
      }
    }
  }

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

/**
 * 更新匹配统计
 * @param {Object} gameStore 游戏状态
 * @param {string} mode 匹配模式
 * @param {boolean} success 是否成功
 */
function updateMatchingStats(gameStore, mode, success) {
  if (!gameStore.todoMatchingStats) {
    gameStore.todoMatchingStats = {
      keyword: { success: 0, total: 0 },
      index: { success: 0, total: 0 }
    }
  }

  gameStore.todoMatchingStats[mode].total++
  if (success) {
    gameStore.todoMatchingStats[mode].success++
  }
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
  const summary = gameStore.player.summaries.find(s => s.floor === floor)
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
  const matchedIndex = todos.findIndex(todo => matchTodoByKeyword(todo, keyword))
  if (matchedIndex === -1) {
    console.warn(`[TodoManager] No todo matched keyword "${keyword}" in floor ${floor}`)
    updateMatchingStats(gameStore, 'keyword', false)
    return false
  }

  // 标记完成
  if (!gameStore.completedTodoMarkers) {
    gameStore.completedTodoMarkers = []
  }

  // 检查是否已标记
  const exists = gameStore.completedTodoMarkers.some(
    m => m.floor === floor && m.todoIndex === matchedIndex
  )

  if (!exists) {
    gameStore.completedTodoMarkers.push({
      floor,
      todoIndex: matchedIndex,
      todoKeyword: keyword,
      completedAt: currentFloor,
      completedTimestamp: Date.now(),
      matchedBy: 'keyword'
    })

    // 同时更新 SummaryData
    if (!summary.completedTodos) {
      summary.completedTodos = []
    }
    if (!summary.completedTodos.includes(matchedIndex)) {
      summary.completedTodos.push(matchedIndex)
    }

    console.log(`[TodoManager] Marked todo as completed: floor=${floor}, index=${matchedIndex}, keyword="${keyword}"`)
    updateMatchingStats(gameStore, 'keyword', true)
    return true
  }

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
  const summary = gameStore.player.summaries.find(s => s.floor === floor)
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

  if (!gameStore.completedTodoMarkers) {
    gameStore.completedTodoMarkers = []
  }

  const exists = gameStore.completedTodoMarkers.some(
    m => m.floor === floor && m.todoIndex === todoIndex
  )

  if (!exists) {
    gameStore.completedTodoMarkers.push({
      floor,
      todoIndex,
      completedAt: currentFloor,
      completedTimestamp: Date.now(),
      matchedBy: 'index'
    })

    if (!summary.completedTodos) {
      summary.completedTodos = []
    }
    if (!summary.completedTodos.includes(todoIndex)) {
      summary.completedTodos.push(todoIndex)
    }

    console.log(`[TodoManager] Marked todo as completed: floor=${floor}, index=${todoIndex}`)
    updateMatchingStats(gameStore, 'index', true)
    return true
  }

  updateMatchingStats(gameStore, 'index', true)
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
  return gameStore.completedTodoMarkers?.some(
    m => m.floor === floor && m.todoIndex === todoIndex
  ) || false
}

/**
 * 获取匹配统计信息
 * @param {Object} gameStore 游戏状态
 * @returns {Object} 统计信息
 */
export function getMatchingStats(gameStore) {
  const stats = gameStore.todoMatchingStats || {
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
