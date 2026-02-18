/**
 * 事件系统 - 随机事件触发和管理
 * 
 * 世界书条目格式：
 * [Event] 天华学园随机事件库 - 事件定义（状态: Disabled）
 * [EventTrigger] 事件触发条件 - 触发器定义（状态: Disabled）
 */

import { useGameStore } from '../stores/gameStore'
import { getAllBookNames } from './worldbookHelper'

// ==================== 事件库解析 ====================

/**
 * 解析事件库数据
 * @param {string} text 事件库文本内容
 * @returns {Map<string, Object>} 事件ID到事件数据的映射
 */
export function parseEventLibrary(text) {
  const events = new Map()
  const lines = text.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue
    
    // 格式: event_id|事件名称|类型|持续天数|描述|条件(可选)
    const parts = trimmed.split('|')
    if (parts.length < 5) continue
    
    const id = parts[0].trim()
    if (!id.startsWith('event_')) continue
    
    events.set(id, {
      id: id,
      name: parts[1].trim(),
      type: parts[2].trim(),
      duration: parseInt(parts[3].trim()) || 1,
      description: parts[4].trim(),
      condition: parts[5] ? parts[5].trim() : null
    })
  }
  
  return events
}

/**
 * 解析触发器数据
 * @param {string} text 触发器文本内容
 * @returns {Array} 触发器数组
 */
export function parseTriggerData(text) {
  const triggers = []
  const lines = text.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue
    
    // 格式: 类型|条件|事件ID|权重
    const parts = trimmed.split('|')
    if (parts.length < 4) continue
    
    const type = parts[0].trim()
    const condition = parts[1].trim()
    const eventId = parts[2].trim()
    const weight = parseInt(parts[3].trim()) || 10
    
    if (type === 'variable') {
      triggers.push({
        type: 'variable',
        condition: condition,
        eventId: eventId,
        weight: weight
      })
    } else if (type === 'random') {
      // 格式: 概率,周期,分类(可选)
      const conditionParts = condition.split(',')
      const probability = parseFloat(conditionParts[0]) || 0.1
      const period = conditionParts[1] ? conditionParts[1].trim() : 'day'
      const category = conditionParts[2] ? conditionParts[2].trim() : null
      
      triggers.push({
        type: 'random',
        probability: probability,
        period: period, // 'day', 'week', 'month'
        category: category,
        eventId: eventId,
        weight: weight
      })
    } else if (type === 'composite') {
      // 复合触发器，格式: [触发器1,条件1]&&[触发器2,条件2]
      triggers.push({
        type: 'composite',
        condition: condition,
        eventId: eventId,
        weight: weight
      })
    }
  }
  
  return triggers
}

// ==================== 条件检查 ====================

/**
 * 解析变量路径并获取值
 * @param {Object} gameStore 游戏状态
 * @param {string} path 变量路径 (如 "社团.篮球部.活跃度" 或 "玩家.健康")
 * @returns {any} 变量值
 */
function getNestedValue(gameStore, path) {
  const parts = path.split('.')
  
  // 处理中文路径映射
  const pathMap = {
    '玩家': 'player',
    '社团': 'clubs',
    '世界状态': 'worldState',
    '角色': 'npcs'
  }
  
  const playerVarMap = {
    '健康': 'health',
    '心境': 'mood',
    '金钱': 'money',
    '等级': 'level',
    '年级': 'grade',
    '关系': 'relationships',
    '临时目标': 'currentGoal'
  }

  const relationshipMap = {
    '恋人存在': 'hasLover',
    '挚友数量': 'bestFriendCount',
    '好友数量': 'friendCount',
    '宿敌数量': 'rivalCount'
  }

  const worldStateMap = {
    '经济指数': 'economy',
    '天气': 'weather'
  }
  
  let current = gameStore
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const mappedPart = pathMap[part] || part
    
    if (i === 0 && mappedPart === 'player') {
      current = gameStore.player
    } else if (i === 0 && mappedPart === 'clubs') {
      current = gameStore.allClubs
    } else if (i === 0 && mappedPart === 'worldState') {
      current = gameStore.worldState
    } else if (current === gameStore.player && playerVarMap[part]) {
      current = current[playerVarMap[part]]
    } else if (current === gameStore.player.relationships && relationshipMap[part]) {
      current = current[relationshipMap[part]]
    } else if (current === gameStore.worldState && worldStateMap[part]) {
      current = current[worldStateMap[part]]
    } else if (current && typeof current === 'object') {
      // 尝试直接访问或查找匹配的社团
      if (current === gameStore.allClubs) {
        // 按名称查找社团
        const club = Object.values(current).find(c => c.name === part || c.id === part)
        current = club || undefined
      } else {
        current = current[part] || current[mappedPart]
      }
    } else {
      return undefined
    }
  }
  
  return current
}

/**
 * 检查变量条件
 * @param {string} condition 条件字符串 (如 "社团.篮球部.活跃度>1000")
 * @param {Object} gameStore 游戏状态
 * @returns {boolean} 是否满足条件
 */
export function checkVariableCondition(condition, gameStore) {
  // 解析条件: path(>,<,=,>=,<=,!=)value
  const match = condition.match(/(.+?)(>=|<=|!=|>|<|=)(.+)/)
  if (!match) return false
  
  const path = match[1].trim()
  const operator = match[2]
  const targetValue = match[3].trim()
  
  const currentValue = getNestedValue(gameStore, path)
  if (currentValue === undefined) return false
  
  // 比较
  const numCurrent = parseFloat(currentValue)
  const numTarget = parseFloat(targetValue)
  
  if (!isNaN(numCurrent) && !isNaN(numTarget)) {
    // 数值比较
    switch (operator) {
      case '>': return numCurrent > numTarget
      case '<': return numCurrent < numTarget
      case '>=': return numCurrent >= numTarget
      case '<=': return numCurrent <= numTarget
      case '=': return numCurrent === numTarget
      case '!=': return numCurrent !== numTarget
      default: return false
    }
  } else {
    // 字符串比较
    const strCurrent = String(currentValue)
    const strTarget = targetValue
    switch (operator) {
      case '=': return strCurrent === strTarget
      case '!=': return strCurrent !== strTarget
      default: return false
    }
  }
}

/**
 * 检查复合触发条件
 * @param {string} condition 复合条件字符串
 * @param {Object} gameStore 游戏状态
 * @returns {boolean}
 */
function checkCompositeCondition(condition, gameStore) {
  // 格式: [trigger1,condition1]&&[trigger2,condition2]
  const parts = condition.split('&&')
  
  for (const part of parts) {
    const match = part.match(/\[(.+?),(.+?)\]/)
    if (!match) return false
    
    const triggerType = match[1].trim()
    const triggerCondition = match[2].trim()
    
    if (triggerType === 'variable') {
      if (!checkVariableCondition(triggerCondition, gameStore)) {
        return false
      }
    } else if (triggerType === 'random') {
      const prob = parseFloat(triggerCondition.split(',')[0])
      if (Math.random() > prob) {
        return false
      }
    } else if (triggerType === 'date_in_month') {
      const { day } = gameStore.gameTime
      if (day !== parseInt(triggerCondition)) {
        return false
      }
    } else if (triggerType === 'date_in_season') {
      const { month } = gameStore.gameTime
      const seasonMap = {
        'spring': [3, 4, 5],
        'summer': [6, 7, 8],
        'autumn': [9, 10, 11],
        'winter': [12, 1, 2]
      }
      const seasonMonths = seasonMap[triggerCondition] || []
      if (!seasonMonths.includes(month)) {
        return false
      }
    }
  }
  
  return true
}

// ==================== 事件触发检查 ====================

/**
 * 获取当前游戏日期的唯一标识
 * @param {Object} gameTime 
 * @returns {string}
 */
function getDateKey(gameTime) {
  return `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`
}

function getWeekKey(gameTime) {
  // 使用年份和周数作为标识
  const termInfo = getTermInfoFromStore()
  return `${gameTime.year}-W${termInfo?.weekNumber || 1}`
}

function getMonthKey(gameTime) {
  return `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}`
}

function getTermInfoFromStore() {
  try {
    const gameStore = useGameStore()
    return gameStore.getTermInfo()
  } catch {
    return null
  }
}

/**
 * 计算从游戏开始到当前的总天数
 * @param {Object} gameTime
 * @returns {number}
 */
export function calculateTotalDays(gameTime) {
  // 简化计算：假设每月30天
  return (gameTime.year - 2024) * 360 + (gameTime.month - 1) * 30 + gameTime.day
}

/**
 * 检查每日触发器
 * @param {Object} gameStore 
 * @param {Array} triggers 
 * @param {Map} eventLibrary 
 * @returns {Array} 触发的事件列表
 */
export function checkDailyTriggers(gameStore, triggers, eventLibrary) {
  const { gameTime, eventChecks, player } = gameStore
  const currentDateKey = getDateKey(gameTime)
  
  // 如果今天已经检查过，跳过
  if (eventChecks.lastDaily === currentDateKey) {
    return []
  }
  
  const triggeredEvents = []
  const dailyTriggers = triggers.filter(t => t.type === 'random' && t.period === 'day')
  
  for (const trigger of dailyTriggers) {
    // 检查事件是否已经触发过或正在进行
    if (player.eventHistory.includes(trigger.eventId)) continue
    if (player.activeEvents.some(e => e.id === trigger.eventId)) continue
    
    // 检查事件条件
    const event = eventLibrary.get(trigger.eventId)
    if (!event) continue
    if (event.condition && !checkVariableCondition(event.condition, gameStore)) continue
    
    // 概率检查
    if (Math.random() < trigger.probability) {
      triggeredEvents.push({
        trigger,
        event,
        scheduledDate: { ...gameTime } // 立即触发
      })
    }
  }
  
  return triggeredEvents
}

/**
 * 检查每周触发器
 * @param {Object} gameStore 
 * @param {Array} triggers 
 * @param {Map} eventLibrary 
 * @returns {Array}
 */
export function checkWeeklyTriggers(gameStore, triggers, eventLibrary) {
  const { gameTime, eventChecks, player } = gameStore
  const currentWeekKey = getWeekKey(gameTime)
  
  // 如果本周已经检查过，跳过
  if (eventChecks.lastWeekly === currentWeekKey) {
    return []
  }
  
  const triggeredEvents = []
  const weeklyTriggers = triggers.filter(t => t.type === 'random' && t.period === 'week')
  
  for (const trigger of weeklyTriggers) {
    if (player.eventHistory.includes(trigger.eventId)) continue
    if (player.activeEvents.some(e => e.id === trigger.eventId)) continue
    
    const event = eventLibrary.get(trigger.eventId)
    if (!event) continue
    if (event.condition && !checkVariableCondition(event.condition, gameStore)) continue
    
    // 概率检查
    if (Math.random() < trigger.probability) {
      // 随机选择本周某一天
      const dayOffset = Math.floor(Math.random() * 7)
      const scheduledDay = gameTime.day + dayOffset
      
      triggeredEvents.push({
        trigger,
        event,
        scheduledDate: {
          year: gameTime.year,
          month: gameTime.month,
          day: scheduledDay
        }
      })
    }
  }
  
  return triggeredEvents
}

/**
 * 检查每月触发器
 * @param {Object} gameStore 
 * @param {Array} triggers 
 * @param {Map} eventLibrary 
 * @returns {Array}
 */
export function checkMonthlyTriggers(gameStore, triggers, eventLibrary) {
  const { gameTime, eventChecks, player } = gameStore
  const currentMonthKey = getMonthKey(gameTime)
  
  if (eventChecks.lastMonthly === currentMonthKey) {
    return []
  }
  
  const triggeredEvents = []
  const monthlyTriggers = triggers.filter(t => t.type === 'random' && t.period === 'month')
  
  for (const trigger of monthlyTriggers) {
    if (player.eventHistory.includes(trigger.eventId)) continue
    if (player.activeEvents.some(e => e.id === trigger.eventId)) continue
    
    const event = eventLibrary.get(trigger.eventId)
    if (!event) continue
    if (event.condition && !checkVariableCondition(event.condition, gameStore)) continue
    
    // 概率检查
    if (Math.random() < trigger.probability) {
      // 随机选择本月某一天（当前日期之后）
      const remainingDays = 30 - gameTime.day
      const dayOffset = Math.floor(Math.random() * remainingDays)
      
      triggeredEvents.push({
        trigger,
        event,
        scheduledDate: {
          year: gameTime.year,
          month: gameTime.month,
          day: gameTime.day + dayOffset
        }
      })
    }
  }
  
  return triggeredEvents
}

/**
 * 检查变量条件触发器
 * @param {Object} gameStore 
 * @param {Array} triggers 
 * @param {Map} eventLibrary 
 * @returns {Array}
 */
export function checkVariableTriggers(gameStore, triggers, eventLibrary) {
  const { gameTime, player } = gameStore
  const triggeredEvents = []
  
  const variableTriggers = triggers.filter(t => t.type === 'variable')
  
  for (const trigger of variableTriggers) {
    if (player.eventHistory.includes(trigger.eventId)) continue
    if (player.activeEvents.some(e => e.id === trigger.eventId)) continue
    
    const event = eventLibrary.get(trigger.eventId)
    if (!event) continue
    
    // 检查变量条件
    if (checkVariableCondition(trigger.condition, gameStore)) {
      triggeredEvents.push({
        trigger,
        event,
        scheduledDate: { ...gameTime }
      })
    }
  }
  
  return triggeredEvents
}

/**
 * 检查复合触发器
 * @param {Object} gameStore 
 * @param {Array} triggers 
 * @param {Map} eventLibrary 
 * @returns {Array}
 */
export function checkCompositeTriggers(gameStore, triggers, eventLibrary) {
  const { gameTime, player } = gameStore
  const triggeredEvents = []
  
  const compositeTriggers = triggers.filter(t => t.type === 'composite')
  
  for (const trigger of compositeTriggers) {
    if (player.eventHistory.includes(trigger.eventId)) continue
    if (player.activeEvents.some(e => e.id === trigger.eventId)) continue
    
    const event = eventLibrary.get(trigger.eventId)
    if (!event) continue
    
    if (checkCompositeCondition(trigger.condition, gameStore)) {
      triggeredEvents.push({
        trigger,
        event,
        scheduledDate: { ...gameTime }
      })
    }
  }
  
  return triggeredEvents
}

// ==================== 事件管理 ====================

/**
 * 激活事件
 * @param {Object} gameStore 
 * @param {Object} event 事件数据
 */
export function activateEvent(gameStore, event) {
  const { gameTime } = gameStore
  
  const activeEvent = {
    id: event.id,
    name: event.name,
    type: event.type,
    description: event.description,
    startDay: calculateTotalDays(gameTime),
    duration: event.duration,
    isGhost: event.duration === -1,
    playerInvolved: false,
    promptTurns: event.duration === -1 ? 999 : 0 // 怪谈类事件持续提示
  }
  
  gameStore.player.activeEvents.push(activeEvent)
  
  console.log(`[EventSystem] Event activated: ${event.name}`)
}

/**
 * 更新活动事件状态
 * @param {Object} gameStore 
 */
export function updateActiveEvents(gameStore) {
  const { gameTime, player } = gameStore
  const currentTotalDays = calculateTotalDays(gameTime)
  
  // 处理非怪谈类事件
  player.activeEvents = player.activeEvents.filter(event => {
    // 怪谈类事件只有玩家卷入后才结束
    if (event.isGhost) {
      if (event.playerInvolved) {
        // 玩家已卷入，移除事件并记录历史
        player.eventHistory.push(event.id)
        console.log(`[EventSystem] Ghost event completed: ${event.name}`)
        return false
      }
      return true // 保留未完成的怪谈事件
    }
    
    // 普通事件检查持续时间
    const elapsedDays = currentTotalDays - event.startDay
    if (elapsedDays >= event.duration) {
      // 事件结束
      player.eventHistory.push(event.id)
      console.log(`[EventSystem] Event ended: ${event.name}`)
      return false
    }
    
    return true
  })
}

/**
 * 标记玩家卷入事件
 * @param {Object} gameStore 
 * @param {string} eventId 
 */
export function markEventInvolved(gameStore, eventId) {
  const event = gameStore.player.activeEvents.find(e => e.id === eventId)
  if (event) {
    event.playerInvolved = true
    console.log(`[EventSystem] Player involved in event: ${event.name}`)
  }
}

// ==================== 世界书加载 ====================

/**
 * 从世界书加载事件库
 * @returns {Promise<Map|null>}
 */
export async function loadEventLibraryFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[EventSystem] Worldbook API not available')
    return null
  }

  try {
    const bookNames = getAllBookNames()

    console.log('[EventSystem] Scanning worldbooks for event data:', bookNames)

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[EventSystem] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue
      
      for (const entry of entries) {
        // 识别事件库条目：名称包含 [Event]
        if (entry.name && entry.name.includes('[Event]')) {
          console.log('[EventSystem] Found event library:', entry.name)
          return parseEventLibrary(entry.content)
        }
      }
    }
  } catch (e) {
    console.error('[EventSystem] Error loading event library:', e)
  }
  
  return null
}

/**
 * 从世界书加载触发器
 * @returns {Promise<Array|null>}
 */
export async function loadEventTriggersFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[EventSystem] Worldbook API not available')
    return null
  }
  
  try {
    const bookNames = getAllBookNames()

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[EventSystem] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue
      
      for (const entry of entries) {
        // 识别触发器条目：名称包含 [EventTrigger]
        if (entry.name && entry.name.includes('[EventTrigger]')) {
          console.log('[EventSystem] Found event triggers:', entry.name)
          return parseTriggerData(entry.content)
        }
      }
    }
  } catch (e) {
    console.error('[EventSystem] Error loading event triggers:', e)
  }
  
  return null
}
