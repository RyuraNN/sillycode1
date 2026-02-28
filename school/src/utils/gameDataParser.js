/**
 * 游戏数据解析器
 * 负责解析、合并和应用 AI 返回的游戏数据
 */

import { useGameStore } from '../stores/gameStore'
import { processNpcRelationshipUpdate, processNpcMoodUpdate } from './messageParser'
import { calculateTotalHours } from './npcScheduleSystem'

// 变量名中英文映射表
export const VARIABLE_NAME_MAP = {
  money: '金钱',
  energy: '精力',
  health: '健康',
  mood: '心境',
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
  if (data.outfit) changes.push('角色衣着发生了变化')
  
  return changes
}

/**
 * 深度合并对象，source 合并到 target
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
export const deepMerge = (target, source) => {
  if (!target) target = {}
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
      ) {
        target[key] = deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
  }
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
  
  // 兼容性处理：将 gold (金币) 映射到 money (金钱)
  if (data.delta && data.delta.gold) {
    data.delta.money = (data.delta.money || 0) + data.delta.gold
    delete data.delta.gold
  }
  if (data.set && data.set.gold !== undefined) {
    data.set.money = data.set.gold
    delete data.set.gold
  }
  // 处理 stats 中的 gold
  if (data.stats) {
    if (data.stats.gold) {
      if (!data.stats.money) data.stats.money = data.stats.gold
      delete data.stats.gold
    }
  }

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

    // Process outfit updates
    if (data.outfit) {
      processOutfitUpdate(data.outfit, gameStore)
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

/**
 * 处理角色衣着更新
 * @param {Object} outfitData - 衣着数据
 * @param {Object} gameStore - 游戏状态
 */
function processOutfitUpdate(outfitData, gameStore) {
  if (!outfitData || typeof outfitData !== 'object') return

  // 玩家衣着
  if (outfitData.player) {
    if (typeof outfitData.player === 'object') {
      // 槽位结构：合并更新（只覆盖传入的槽位）
      if (!gameStore.player.outfitSlots) gameStore.player.outfitSlots = {}
      Object.assign(gameStore.player.outfitSlots, outfitData.player)
    } else if (typeof outfitData.player === 'string') {
      // 向后兼容：字符串存入 inner 槽位作为整体描述
      gameStore.player.outfitSlots = { inner: outfitData.player }
    }
    console.log(`[GameData] Player outfit updated:`, gameStore.player.outfitSlots)
  }

  // NPC衣着
  if (outfitData.npcs && typeof outfitData.npcs === 'object') {
    for (const [npcName, description] of Object.entries(outfitData.npcs)) {
      const npc = gameStore.npcs.find(n => n.name === npcName)
      if (npc) {
        if (typeof description === 'object') {
          if (!npc.outfitSlots) npc.outfitSlots = {}
          Object.assign(npc.outfitSlots, description)
        } else if (typeof description === 'string') {
          npc.outfitSlots = { inner: description }
        }
        console.log(`[GameData] NPC ${npcName} outfit updated:`, npc.outfitSlots)
      }
    }
  }
}

/**
 * 生成详细的变量变化列表（性能优化版）
 * @param {Object} oldState - 变化前的游戏状态快照
 * @param {Object} newState - 变化后的游戏状态快照
 * @returns {Array<{label: string, oldValue: any, newValue: any, diff?: number}>} 变化详情列表
 *
 * 性能优化：
 * - 只对比实际存在的字段（不遍历所有预定义路径）
 * - 使用 Map 缓存 NPC 数据，避免 O(n²) 复杂度
 * - 合并时间变化为单条记录
 */
export const generateDetailedChanges = (oldState, newState) => {
  const changes = []

  if (!oldState || !newState) return changes

  // 辅助函数：获取嵌套对象的值
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
  }

  // 辅助函数：对比单个值
  const compareValue = (oldVal, newVal, label) => {
    if (oldVal === newVal) return null
    if (oldVal === undefined && newVal === undefined) return null

    const change = { label, oldValue: oldVal, newValue: newVal }

    // 如果是数字，计算差值
    if (typeof oldVal === 'number' && typeof newVal === 'number') {
      change.diff = newVal - oldVal
    }

    return change
  }

  // 1. 玩家基础属性对比（只对比存在的字段）
  const playerBasicMap = {
    money: '金钱',
    hp: '生命',
    maxHp: '生命上限',
    mp: '精力',
    maxMp: '精力上限',
    exp: '经验',
    health: '健康',
    level: '等级',
    freePoints: '点数',
    location: '位置'
  }

  if (newState.player || oldState.player) {
    for (const [key, label] of Object.entries(playerBasicMap)) {
      if (newState.player?.[key] !== undefined || oldState.player?.[key] !== undefined) {
        const change = compareValue(
          oldState.player?.[key],
          newState.player?.[key],
          label
        )
        if (change) changes.push(change)
      }
    }
  }

  // 2. 玩家六维属性（只对比存在的字段）
  const attributeMap = {
    iq: '智力',
    eq: '情商',
    physique: '体质',
    flexibility: '灵活',
    charm: '魅力',
    mood: '心境'
  }

  if (newState.player?.attributes || oldState.player?.attributes) {
    for (const [key, label] of Object.entries(attributeMap)) {
      if (newState.player?.attributes?.[key] !== undefined ||
          oldState.player?.attributes?.[key] !== undefined) {
        const change = compareValue(
          oldState.player?.attributes?.[key],
          newState.player?.attributes?.[key],
          label
        )
        if (change) changes.push(change)
      }
    }
  }

  // 3. 学科（只对比存在的字段）
  const subjectMap = {
    literature: '语文',
    math: '数学',
    english: '英语',
    humanities: '人文',
    sciences: '理科',
    art: '艺术',
    sports: '体育'
  }

  if (newState.player?.subjects || oldState.player?.subjects) {
    for (const [key, label] of Object.entries(subjectMap)) {
      if (newState.player?.subjects?.[key] !== undefined ||
          oldState.player?.subjects?.[key] !== undefined) {
        const change = compareValue(
          oldState.player?.subjects?.[key] || 0,
          newState.player?.subjects?.[key] || 0,
          label
        )
        if (change) changes.push(change)
      }
    }
  }

  // 4. 技能（只对比存在的字段）
  const skillMap = {
    programming: '编程',
    painting: '绘画',
    guitar: '吉他',
    piano: '钢琴',
    urbanLegend: '都市传说',
    cooking: '烹饪',
    hacking: '黑客',
    socialMedia: '社交媒体',
    photography: '摄影',
    videoEditing: '视频剪辑'
  }

  if (newState.player?.skills || oldState.player?.skills) {
    for (const [key, label] of Object.entries(skillMap)) {
      if (newState.player?.skills?.[key] !== undefined ||
          oldState.player?.skills?.[key] !== undefined) {
        const change = compareValue(
          oldState.player?.skills?.[key] || 0,
          newState.player?.skills?.[key] || 0,
          label
        )
        if (change) changes.push(change)
      }
    }
  }

  // 5. 对比 NPC 列表（使用 Map 优化，避免 O(n²)）
  if (oldState.npcs && newState.npcs) {
    const oldNpcMap = new Map(oldState.npcs.map(n => [n.id, n]))

    for (const newNpc of newState.npcs) {
      const oldNpc = oldNpcMap.get(newNpc.id)
      if (oldNpc) {
        // 心情
        if (oldNpc.mood !== newNpc.mood) {
          changes.push({
            label: `${newNpc.name}心情`,
            oldValue: oldNpc.mood,
            newValue: newNpc.mood
          })
        }

        // 位置
        if (oldNpc.location !== newNpc.location) {
          if (oldNpc.location !== 'unknown' || newNpc.location !== 'unknown') {
            changes.push({
              label: `${newNpc.name}位置`,
              oldValue: oldNpc.location,
              newValue: newNpc.location
            })
          }
        }
      }
    }
  }

  // 6. 对比 NPC 详细关系（使用直接访问，避免双重循环）
  if (oldState.npcRelationships && newState.npcRelationships && newState.player?.name) {
    const playerName = newState.player.name

    for (const charName in newState.npcRelationships) {
      if (charName === playerName) continue // 跳过玩家自己

      // 获取该角色对玩家的关系
      const newRel = newState.npcRelationships[charName]?.relations?.[playerName]
      const oldRel = oldState.npcRelationships?.[charName]?.relations?.[playerName]

      if (newRel) {
        // 亲密度/好感
        const change1 = compareValue(
          oldRel?.intimacy || 0,
          newRel.intimacy || 0,
          `${charName}好感`
        )
        if (change1) changes.push(change1)

        // 信任度
        const change2 = compareValue(
          oldRel?.trust || 0,
          newRel.trust || 0,
          `${charName}信任`
        )
        if (change2) changes.push(change2)

        // 激情度
        const change3 = compareValue(
          oldRel?.passion || 0,
          newRel.passion || 0,
          `${charName}激情`
        )
        if (change3) changes.push(change3)

        // 敌意度
        const change4 = compareValue(
          oldRel?.hostility || 0,
          newRel.hostility || 0,
          `${charName}敌意`
        )
        if (change4) changes.push(change4)
      }
    }
  }

  // 7. 检查好友列表变化（数量）
  if (oldState.player?.social?.friends && newState.player?.social?.friends) {
    const change = compareValue(
      oldState.player.social.friends.length,
      newState.player.social.friends.length,
      '好友数'
    )
    if (change) changes.push(change)
  }

  // 8. 检查时间是否有变化，合并显示
  const oldTime = oldState.gameTime
  const newTime = newState.gameTime

  if (oldTime && newTime) {
    const timeChanged =
      oldTime.year !== newTime.year ||
      oldTime.month !== newTime.month ||
      oldTime.day !== newTime.day ||
      oldTime.hour !== newTime.hour ||
      oldTime.minute !== newTime.minute

    if (timeChanged) {
      const formatTime = (t) => `${t.month}/${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
      changes.unshift({
        label: '时间',
        oldValue: formatTime(oldTime),
        newValue: formatTime(newTime)
      })
    }
  }

  return changes
}
