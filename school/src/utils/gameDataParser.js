/**
 * 游戏数据解析器
 * 负责解析、合并和应用 AI 返回的游戏数据
 */

import { useGameStore } from '../stores/gameStore'
import { processNpcRelationshipUpdate, processNpcMoodUpdate } from './messageParser'
import { calculateTotalHours } from './npcScheduleSystem'

// 变量名中英文映射表
const VARIABLE_NAME_MAP = {
  money: '金钱',
  energy: '精力',
  health: '健康',
  mood: '心情',
  strength: '体质',
  intelligence: '智力',
  charm: '魅力',
  knowledge: '知识',
  memory: '记忆力',
  creativity: '创造力',
  logic: '逻辑',
  expression: '表达',
  action: '行动力',
  social: '社交',
  
  // 基础属性
  base: '基础经验',
  subjects: '学科经验',
  skills: '技能经验',
  
  // 课程相关
  chinese: '语文',
  math: '数学',
  english: '英语',
  physics: '物理',
  chemistry: '化学',
  biology: '生物',
  history: '历史',
  geography: '地理',
  politics: '政治',
  
  // 技能相关
  programming: '编程',
  writing: '写作',
  drawing: '绘画',
  music: '音乐',
  sports: '运动',
  gaming: '游戏'
}

/**
 * 解析文本中的游戏数据，返回数据对象数组
 * @param {string} jsonContent - 包含 [GAME_DATA] 标签的文本
 * @returns {Array} 数据对象数组
 */
export const parseGameData = (jsonContent) => {
  const dataList = []
  const dataRegex = /\[GAME_DATA\]([\s\S]*?)\[\/GAME_DATA\]/g
  let match
  
  // 尝试匹配 [GAME_DATA] 标签
  while ((match = dataRegex.exec(jsonContent)) !== null) {
    try {
      const jsonStr = match[1]
      const data = JSON.parse(jsonStr)
      dataList.push(data)
    } catch (e) {
      console.error('解析游戏数据失败:', e)
    }
  }
  
  // 如果没有标签，尝试直接解析整个内容为 JSON
  if (dataList.length === 0) {
    try {
      const firstBrace = jsonContent.indexOf('{')
      const lastBrace = jsonContent.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = jsonContent.substring(firstBrace, lastBrace + 1)
        const data = JSON.parse(jsonStr)
        dataList.push(data)
      }
    } catch (e) {
      // 忽略非JSON内容
    }
  }
  
  return dataList
}

/**
 * 分析数据变化，返回变化描述列表
 * @param {Object} data - 游戏数据对象
 * @returns {Array<string>} 变化描述列表
 */
export const analyzeChanges = (data) => {
  const changes = []
  
  if (data.time || data.time_delta) changes.push('时间推进了')
  if (data.location) changes.push('位置改变了')
  
  if (data.stats) {
    if (data.stats.money) changes.push('金钱发生了变化')
    if (data.stats.hp) changes.push('生命值发生了变化')
    if (data.stats.mood) changes.push('心境发生了变化')
    if (data.stats.health) changes.push('健康值发生了变化')
  }
  
  if (data.exp) {
    if (data.exp.base) changes.push('获得经验值')
    if (data.exp.subjects) changes.push('学科经验发生了变化')
    if (data.exp.skills) changes.push('技能经验发生了变化')
  }
  
  if (data.delta) {
    for (const key in data.delta) {
      const name = VARIABLE_NAME_MAP[key] || key
      const value = data.delta[key]
      const sign = value > 0 ? '+' : ''
      
      // 如果是数值，显示具体的增减
      if (typeof value === 'number') {
        changes.push(`${name} ${sign}${value}`)
      } else {
        changes.push(`${name} 发生了变化`)
      }
    }
  }
  
  if (data.set) {
    for (const key in data.set) {
      const name = VARIABLE_NAME_MAP[key] || key
      const value = data.set[key]
      
      // 对于 set 操作，如果是简单类型，也可以显示新值
      if (typeof value === 'number' || typeof value === 'string') {
         changes.push(`${name} 变为 ${value}`)
      } else {
         changes.push(`${name} 被修改了`)
      }
    }
  }
  
  if (data.npc_relationship) changes.push('NPC关系发生了变化')
  if (data.npcs) changes.push('NPC状态发生了变化')
  if (data.npc_move) changes.push('NPC位置被强制变更')
  if (data.npc_mood) changes.push('NPC心情发生了变化')
  
  return changes
}

/**
 * 深度合并对象，target 优先
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
export const deepMerge = (target, source) => {
  for (const key in source) {
    if (source[key] instanceof Object && key in target) {
      Object.assign(source[key], deepMerge(target[key], source[key]))
    }
  }
  Object.assign(target || {}, source)
  return target
}

/**
 * 合并游戏数据（主AI优先）
 * @param {Array} mainDataList - 主AI数据列表
 * @param {Array} assistantDataList - 辅助AI数据列表
 * @returns {Object} 合并后的数据对象
 */
export const mergeGameData = (mainDataList, assistantDataList) => {
  const mergedData = {}
  
  // 辅助函数：将 source 合并到 target，如果 target 已有值则不覆盖
  const mergeIfMissing = (target, source) => {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {}
          mergeIfMissing(target[key], source[key])
        } else {
          if (target[key] === undefined) {
            target[key] = source[key]
          }
        }
      }
    }
  }
  
  // 先应用辅助AI的数据
  for (const data of assistantDataList) {
    mergeIfMissing(mergedData, data)
  }
  
  // 再应用主AI的数据（覆盖）
  for (const data of mainDataList) {
    const mergeOverwrite = (target, source) => {
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {}
            mergeOverwrite(target[key], source[key])
          } else {
            target[key] = source[key]
          }
        }
      }
    }
    mergeOverwrite(mergedData, data)
  }
  
  return mergedData
}

/**
 * 应用游戏数据到 Store
 * @param {Object} data - 游戏数据对象
 * @returns {Array<string>} 变化描述列表
 */
export const applyGameData = (data) => {
  const gameStore = useGameStore()
  
  // Reset all NPCs to absent by default for each turn
  if (gameStore.npcs.length > 0) {
    gameStore.npcs.forEach(npc => {
      // 减少存活时间计数
      if (npc.aliveRemaining !== undefined && npc.aliveRemaining > 0) {
        npc.aliveRemaining--
      }
      
      // 如果计数归零或未定义，则设置为不在场
      if (!npc.aliveRemaining || npc.aliveRemaining <= 0) {
        npc.isAlive = false
        npc.aliveRemaining = 0
      }
      // 如果计数大于0，则保持 isAlive=true (或之前的状态)
    })
  }

  const changes = analyzeChanges(data)
  if (changes.length > 0) {
    gameStore.updateFromJSON(data)
    
    // Process NPC relationship updates
    if (data.npc_relationship) {
      processNpcRelationshipUpdate(data)
    }

    // Process NPC mood updates
    if (data.npc_mood) {
      processNpcMoodUpdate(data)
    }

    // Process NPC move updates (forced location)
    if (data.npc_move) {
      processNpcMoveUpdate(data.npc_move, gameStore)
    }

    // 检查事件触发
    gameStore.checkEventTriggers()
    gameStore.updateEvents()
  }
  return changes
}

/**
 * 处理 NPC 强制移动指令
 * @param {Array|Object} moveData 
 * @param {Object} gameStore 
 */
function processNpcMoveUpdate(moveData, gameStore) {
  const updates = Array.isArray(moveData) ? moveData : [moveData]
  const currentTotalHours = calculateTotalHours(gameStore.gameTime)
  
  updates.forEach(update => {
    const { name, location, duration } = update
    if (!name || !location || !duration) return
    
    const npc = gameStore.npcs.find(n => n.name === name)
    if (npc) {
      npc.forcedLocation = {
        locationId: location,
        endTime: currentTotalHours + duration
      }
      console.log(`[GameData] NPC ${name} forced to move to ${location} for ${duration} hours`)
    }
  })
}
