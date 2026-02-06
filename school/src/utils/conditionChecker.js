/**
 * 检查地点访问条件
 */

import { WEEKDAY_MAP } from './constants.js'

const SPECIAL_TIMES = {
  '午休': { start: 12 * 60, end: 13 * 60 + 30 }, // 12:00 - 13:30
  '放学后': { start: 15 * 60 + 30, end: 19 * 60 } // 15:30 - 19:00
}

// 解析时间字符串 "07:00" -> 分钟数
function parseTime(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number)
  return hour * 60 + minute
}

// 检查时间是否在范围内
function isTimeInRange(currentMinutes, rangeStr) {
  // 处理特殊时间段
  if (SPECIAL_TIMES[rangeStr]) {
    const { start, end } = SPECIAL_TIMES[rangeStr]
    return currentMinutes >= start && currentMinutes <= end
  }

  // 处理 "07:00-19:00"
  const parts = rangeStr.split('-')
  if (parts.length === 2) {
    const start = parseTime(parts[0])
    const end = parseTime(parts[1])
    return currentMinutes >= start && currentMinutes <= end
  }

  return false
}

/**
 * 检查开放时间
 * @param {string} openTimeStr 开放时间字符串 (例如 "周一至周五 07:00-19:00", "09:00-21:00", "午休, 放学后")
 * @param {Object} gameTime 当前游戏时间对象 { weekday, hour, minute }
 * @returns {boolean} 是否开放
 */
export function checkOpenTime(openTimeStr, gameTime) {
  if (!openTimeStr) return true

  const currentMinutes = gameTime.hour * 60 + gameTime.minute
  const currentWeekday = gameTime.weekday

  // 分割多个时间段 (逗号分隔)
  const conditions = openTimeStr.split(/[,，]/).map(s => s.trim())

  // 只要满足其中一个条件即可
  return conditions.some(condition => {
    // 1. 检查星期限制
    let timeRange = condition
    let allowedWeekdays = null

    // 匹配 "周一至周五" 或 "周六,周日" 等
    // 简单处理：假设格式为 "星期描述 时间范围"
    // 或者特殊词 "午休"
    
    if (SPECIAL_TIMES[condition]) {
      return isTimeInRange(currentMinutes, condition)
    }

    // 尝试分离星期和时间
    // 匹配 "周X至周Y"
    const rangeMatch = condition.match(/(周[一二三四五六日]|星期[一二三四五六日天])至(周[一二三四五六日]|星期[一二三四五六日天])/)
    if (rangeMatch) {
      const startDay = WEEKDAY_MAP[rangeMatch[1]]
      const endDay = WEEKDAY_MAP[rangeMatch[2]]
      // 这里需要一个星期顺序列表来判断
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const startIndex = days.indexOf(startDay)
      const endIndex = days.indexOf(endDay)
      
      if (startIndex > -1 && endIndex > -1) {
        const currentDayIndex = days.indexOf(currentWeekday)
        if (currentDayIndex < startIndex || currentDayIndex > endIndex) {
          return false // 星期不符
        }
      }
      // 移除星期部分，剩下时间部分
      timeRange = condition.replace(rangeMatch[0], '').trim()
    } else {
      // 检查是否包含特定星期
      // 暂不处理复杂的 "周一,周三" 组合，假设如果没有 "至"，就是每天
    }

    // 2. 检查时间范围
    return isTimeInRange(currentMinutes, timeRange)
  })
}

/**
 * 检查解锁条件
 * @param {string} conditionStr 解锁条件字符串
 * @param {Object} player 玩家数据
 * @param {string} [itemId] 地点ID (可选)
 * @returns {boolean} 是否解锁
 */
export function checkUnlockCondition(conditionStr, player, itemId = null) {
  if (!conditionStr) return true

  // 1. 事件触发检查 (event_开头)
  if (conditionStr.startsWith('event_')) {
    const eventId = conditionStr.trim()
    // 检查事件是否正在进行或已完成
    const isActive = player.activeEvents && player.activeEvents.some(e => e.id === eventId)
    const isHistory = player.eventHistory && player.eventHistory.includes(eventId)
    return isActive || isHistory
  }

  // 2. 社团检查 "xx社团成员"
  if (conditionStr.endsWith('成员')) {
    const clubName = conditionStr.replace('成员', '').trim()
    // 检查 joinedClubs
    // 假设 joinedClubs 存储的是社团全名，或者包含关键词
    return player.joinedClubs.some(club => club.includes(clubName) || clubName.includes(club))
  }

  // 3. 任务触发 "相关任务触发" (旧格式兼容)
  if (conditionStr === '相关任务触发') {
    // 兼容旧逻辑：如果地点是废弃工厂，尝试检查对应的事件
    if (itemId === 'abandoned_factory') {
      const eventId = 'event_mysterious_radio_wave'
      const isActive = player.activeEvents && player.activeEvents.some(e => e.id === eventId)
      const isHistory = player.eventHistory && player.eventHistory.includes(eventId)
      return isActive || isHistory
    }
    
    // 尝试检查通用的 flag: item_id + '_unlocked'
    if (itemId && player.flags && player.flags[`${itemId}_unlocked`]) {
      return true
    }
    
    return false // 默认未解锁
  }

  // 其他条件...
  return true
}

/**
 * 检查单个地点的访问权限（不递归）
 */
function checkSelfAccess(item, gameStore) {
  // 1. 检查开放时间
  if (item.openTime) {
    const isOpen = checkOpenTime(item.openTime, gameStore.gameTime)
    if (!isOpen) {
      return { allowed: false, reason: `当前时间未开放 (${item.openTime})` }
    }
  }

  // 2. 检查解锁条件
  if (item.unlockCondition) {
    const isUnlocked = checkUnlockCondition(item.unlockCondition, gameStore.player, item.id)
    if (!isUnlocked) {
      // 优化提示信息
      let reason = item.unlockCondition
      if (reason.startsWith('event_')) {
        reason = '相关事件未触发'
      }
      return { allowed: false, reason: `未满足条件: ${reason}` }
    }
  }

  return { allowed: true, reason: '' }
}

/**
 * 判断 descendantId 是否是 ancestorId 的后代或本身（即是否在 ancestorId 内部）
 * @param {string} ancestorId 祖先ID (容器)
 * @param {string} descendantId 后代ID (当前位置)
 * @param {Function} getItemFn 获取地点对象的函数
 * @returns {boolean}
 */
function isDescendant(ancestorId, descendantId, getItemFn) {
  if (!ancestorId || !descendantId) return false
  if (ancestorId === descendantId) return true

  let currentId = descendantId
  // 防止无限循环（虽不应发生，但为了安全限制深度）
  let depth = 0
  while (currentId && depth < 50) {
    if (currentId === ancestorId) return true
    
    // 获取父级
    if (getItemFn) {
      const item = getItemFn(currentId)
      if (item && item.parentId) {
        currentId = item.parentId
      } else {
        break
      }
    } else {
      break
    }
    depth++
  }
  return false
}

/**
 * 综合检查访问权限（支持递归检查父级）
 * @param {Object} item 地点对象
 * @param {Object} gameStore 游戏状态仓库
 * @param {Function} getItemFn 获取地点对象的函数 (id) => item
 * @returns {Object} { allowed: boolean, reason: string }
 */
export function checkAccess(item, gameStore, getItemFn) {
  // 0. 判断玩家是否已在该地点内部
  // 如果玩家已经在该地点内部（或是该地点本身），则视为拥有该层级的访问权限
  // 这允许玩家在父级地点关闭时（如学校关门），依然能在内部（如宿舍）活动，或从内部进入其他内部区域
  let isInside = false
  if (gameStore.player && gameStore.player.location) {
    isInside = isDescendant(item.id, gameStore.player.location, getItemFn)
  }

  // 1. 检查自身 (如果在内部则跳过检查)
  if (!isInside) {
    const selfResult = checkSelfAccess(item, gameStore)
    if (!selfResult.allowed) return selfResult
  }

  // 2. 递归检查父级
  // 注意：即使当前层级检查通过（或跳过），依然需要检查父级
  // 因为如果是跳过的（isInside=true），那么父级肯定也是 isInside=true，父级也会跳过检查，直到根节点
  // 如果是正常通过的（isInside=false），则需要确保父级也允许通行
  if (getItemFn && item.parentId) {
    const parent = getItemFn(item.parentId)
    if (parent) {
      const parentResult = checkAccess(parent, gameStore, getItemFn)
      if (!parentResult.allowed) {
        // 简化提示，避免层层嵌套太长
        return { allowed: false, reason: `父级区域限制` }
      }
    }
  }

  return { allowed: true, reason: '' }
}

// ==================== 兼职条件检查 ====================

// 属性名称映射（中文 -> 内部键名）
const ATTRIBUTE_MAP = {
  // 核心属性
  '智商': 'attributes.iq',
  '情商': 'attributes.eq',
  '体能': 'attributes.physique',
  '灵活': 'attributes.flexibility',
  '魅力': 'attributes.charm',
  '心境': 'attributes.mood',
  // 学科
  '语文': 'subjects.literature',
  '数学': 'subjects.math',
  '外语': 'subjects.english',
  '英语': 'subjects.english',
  '文科综合': 'subjects.humanities',
  '理科综合': 'subjects.sciences',
  '艺术': 'subjects.art',
  '体育': 'subjects.sports',
  // 技能
  '编程': 'skills.programming',
  '绘画': 'skills.painting',
  '吉他': 'skills.guitar',
  '钢琴': 'skills.piano',
  '都市传说': 'skills.urbanLegend',
  '烹饪': 'skills.cooking',
  '黑客': 'skills.hacking',
  '社交媒体': 'skills.socialMedia',
  '摄影': 'skills.photography',
  '视频编辑': 'skills.videoEditing',
  // 其他
  '等级': 'level',
  '健康': 'health',
  '金钱': 'money'
}

/**
 * 获取玩家属性值（支持嵌套路径）
 * @param {Object} player - 玩家对象
 * @param {string} path - 属性路径 (如 'attributes.iq' 或 'level')
 * @returns {number|null} 属性值
 */
function getPlayerAttributeValue(player, path) {
  const parts = path.split('.')
  let current = player
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return null
    }
  }
  
  return typeof current === 'number' ? current : null
}

/**
 * 解析单个条件表达式
 * 支持格式: "属性名 > 数值", "属性名 >= 数值", "属性名 < 数值", "属性名 <= 数值", "属性名 = 数值"
 * @param {string} conditionStr - 条件字符串
 * @returns {Object|null} 解析结果 { attribute, operator, value } 或 null
 */
function parseConditionExpression(conditionStr) {
  // 匹配格式: 属性名 操作符 数值
  const match = conditionStr.match(/^(.+?)\s*(>=|<=|>|<|=)\s*(\d+)$/)
  if (!match) return null
  
  const [, attrName, operator, valueStr] = match
  const trimmedAttr = attrName.trim()
  
  // 查找属性映射
  const attrPath = ATTRIBUTE_MAP[trimmedAttr]
  if (!attrPath) {
    console.warn(`[ConditionChecker] Unknown attribute: ${trimmedAttr}`)
    return null
  }
  
  return {
    attribute: trimmedAttr,
    path: attrPath,
    operator: operator,
    value: parseInt(valueStr, 10)
  }
}

/**
 * 检查单个条件是否满足
 * @param {Object} player - 玩家对象
 * @param {Object} condition - 解析后的条件 { path, operator, value }
 * @returns {boolean} 是否满足
 */
function checkSingleCondition(player, condition) {
  const playerValue = getPlayerAttributeValue(player, condition.path)
  if (playerValue === null) return false
  
  switch (condition.operator) {
    case '>': return playerValue > condition.value
    case '>=': return playerValue >= condition.value
    case '<': return playerValue < condition.value
    case '<=': return playerValue <= condition.value
    case '=': return playerValue === condition.value
    default: return false
  }
}

/**
 * 检查兼职申请条件
 * @param {string|string[]} requirementStr - 条件字符串或数组
 *   例如: "魅力 > 60, 体能 >= 50" 或 ["体能 > 70"]
 * @param {Object} player - 玩家对象
 * @returns {Object} { satisfied: boolean, details: Array<{ condition: string, met: boolean, playerValue: number, required: number }> }
 */
export function checkPartTimeJobRequirements(requirementStr, player) {
  if (!requirementStr) {
    return { satisfied: true, details: [] }
  }

  let conditions = []
  
  if (Array.isArray(requirementStr)) {
    conditions = requirementStr
  } else if (typeof requirementStr === 'string') {
    if (requirementStr.trim() === '') {
      return { satisfied: true, details: [] }
    }
    conditions = requirementStr.split(/[,，;；]/)
  } else {
    // 其他类型视为无效条件但非空，或者直接忽略
    console.warn('[ConditionChecker] Invalid requirements format:', requirementStr)
    return { satisfied: true, details: [] }
  }
  
  // 清理空白
  conditions = conditions.map(s => typeof s === 'string' ? s.trim() : '').filter(s => s)
  
  const details = []
  let allSatisfied = true
  
  for (const condStr of conditions) {
    const parsed = parseConditionExpression(condStr)
    if (!parsed) {
      // 无法解析的条件，记录但不阻止
      details.push({
        condition: condStr,
        met: true,
        playerValue: null,
        required: null,
        error: '无法解析条件'
      })
      continue
    }
    
    const playerValue = getPlayerAttributeValue(player, parsed.path)
    const met = checkSingleCondition(player, parsed)
    
    details.push({
      condition: condStr,
      attribute: parsed.attribute,
      met: met,
      playerValue: playerValue,
      required: parsed.value,
      operator: parsed.operator
    })
    
    if (!met) {
      allSatisfied = false
    }
  }
  
  return { satisfied: allSatisfied, details }
}

/**
 * 检查玩家是否可以申请指定的兼职岗位
 * @param {Object} jobData - 兼职岗位数据 (partTimeJob 对象)
 * @param {Object} player - 玩家对象
 * @param {Object} gameTime - 游戏时间对象
 * @returns {Object} { canApply: boolean, reason: string, details: Array }
 */
export function checkPartTimeJobEligibility(jobData, player, gameTime) {
  if (!jobData) {
    return { canApply: false, reason: '兼职岗位数据无效', details: [] }
  }
  
  // 1. 检查工作时间是否在开放范围内（用于判断是否可以工作，不影响申请）
  // 申请通常不需要检查时间，但可以提示工作时间
  
  // 2. 检查属性要求
  const requirementResult = checkPartTimeJobRequirements(jobData.requirements, player)
  
  if (!requirementResult.satisfied) {
    // 生成不满足条件的提示
    const unmetConditions = requirementResult.details
      .filter(d => !d.met && !d.error)
      .map(d => `${d.attribute}需要${d.operator}${d.required}（当前${d.playerValue}）`)
    
    return {
      canApply: false,
      reason: `不满足条件: ${unmetConditions.join('，')}`,
      details: requirementResult.details
    }
  }
  
  return { canApply: true, reason: '', details: requirementResult.details }
}

/**
 * 检查玩家当前是否在工作时间内
 * @param {Object} jobData - 兼职岗位数据
 * @param {Object} gameTime - 游戏时间对象
 * @returns {Object} { isWorkTime: boolean, reason: string }
 */
export function checkWorkTime(jobData, gameTime) {
  if (!jobData || !jobData.workTime) {
    return { isWorkTime: true, reason: '' }
  }
  
  const isOpen = checkOpenTime(jobData.workTime, gameTime)
  if (!isOpen) {
    return { isWorkTime: false, reason: `当前不在工作时间（${jobData.workTime}）` }
  }
  
  return { isWorkTime: true, reason: '' }
}
