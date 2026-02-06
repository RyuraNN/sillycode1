/**
 * 游戏数据解析器
 * 负责解析、合并和应用 AI 返回的游戏数据
 */

import { useGameStore } from '../stores/gameStore'
import { processNpcRelationshipUpdate } from './messageParser'
import { calculateTotalHours } from './npcScheduleSystem'

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
      changes.push(`${key} 发生了变化`)
    }
  }
  
  if (data.set) {
    for (const key in data.set) {
      changes.push(`${key} 被修改了`)
    }
  }
  
  if (data.npc_relationship) changes.push('NPC关系发生了变化')
  if (data.npcs) changes.push('NPC状态发生了变化')
  if (data.npc_move) changes.push('NPC位置被强制变更')
  
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
      npc.isAlive = false
    })
  }

  const changes = analyzeChanges(data)
  if (changes.length > 0) {
    gameStore.updateFromJSON(data)
    
    // Process NPC relationship updates
    if (data.npc_relationship) {
      processNpcRelationshipUpdate(data)
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
