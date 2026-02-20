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
 * 生成详细的变量变化列表
 * @param {Object} oldState - 变化前的游戏状态快照
 * @param {Object} newState - 变化后的游戏状态快照
 * @returns {Array<{label: string, oldValue: any, newValue: any, diff?: number}>} 变化详情列表
 */
export const generateDetailedChanges = (oldState, newState) => {
  const changes = []
  
  if (!oldState || !newState) return changes
  
  // 玩家基础属性对比
  const playerPaths = [
    { path: 'player.money', label: '金钱' },
    { path: 'player.hp', label: '生命' },
    { path: 'player.maxHp', label: '生命上限' },
    { path: 'player.mp', label: '精力' },
    { path: 'player.maxMp', label: '精力上限' },
    { path: 'player.exp', label: '经验' },
    { path: 'player.health', label: '健康' },
    { path: 'player.level', label: '等级' },
    { path: 'player.freePoints', label: '点数' },
    { path: 'player.location', label: '位置' }
  ]
  
  // 玩家六维属性
  const attributePaths = [
    { path: 'player.attributes.iq', label: '智力' },
    { path: 'player.attributes.eq', label: '情商' },
    { path: 'player.attributes.physique', label: '体质' },
    { path: 'player.attributes.flexibility', label: '灵活' },
    { path: 'player.attributes.charm', label: '魅力' },
    { path: 'player.attributes.mood', label: '心情' }
  ]
  
  // 学科
  const subjectPaths = [
    { path: 'player.subjects.literature', label: '语文' },
    { path: 'player.subjects.math', label: '数学' },
    { path: 'player.subjects.english', label: '英语' },
    { path: 'player.subjects.humanities', label: '人文' },
    { path: 'player.subjects.sciences', label: '理科' },
    { path: 'player.subjects.art', label: '艺术' },
    { path: 'player.subjects.sports', label: '体育' }
  ]
  
  // 技能
  const skillPaths = [
    { path: 'player.skills.programming', label: '编程' },
    { path: 'player.skills.painting', label: '绘画' },
    { path: 'player.skills.guitar', label: '吉他' },
    { path: 'player.skills.piano', label: '钢琴' },
    { path: 'player.skills.urbanLegend', label: '都市传说' },
    { path: 'player.skills.cooking', label: '烹饪' },
    { path: 'player.skills.hacking', label: '黑客' },
    { path: 'player.skills.socialMedia', label: '社交媒体' },
    { path: 'player.skills.photography', label: '摄影' },
    { path: 'player.skills.videoEditing', label: '视频剪辑' }
  ]
  
  // 时间
  const timePaths = [
    { path: 'gameTime.year', label: '年' },
    { path: 'gameTime.month', label: '月' },
    { path: 'gameTime.day', label: '日' },
    { path: 'gameTime.hour', label: '时' },
    { path: 'gameTime.minute', label: '分' },
    { path: 'gameTime.weekday', label: '星期' }
  ]
  
  const allPaths = [...playerPaths, ...attributePaths, ...subjectPaths, ...skillPaths, ...timePaths]
  
  // 辅助函数：获取嵌套对象的值
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
  }
  
  // 遍历所有路径进行对比
  for (const { path, label } of allPaths) {
    const oldVal = getNestedValue(oldState, path)
    const newVal = getNestedValue(newState, path)
    
    if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
      const change = { label, oldValue: oldVal, newValue: newVal }
      
      // 如果是数字，计算差值
      if (typeof oldVal === 'number' && typeof newVal === 'number') {
        change.diff = newVal - oldVal
      }
      
      changes.push(change)
    }
  }
  
  // 对比 NPC 列表 (基础状态：位置、心情)
  if (oldState.npcs && newState.npcs) {
    const oldNpcMap = new Map(oldState.npcs.map(n => [n.id, n]))
    
    newState.npcs.forEach(newNpc => {
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
    })
  }

  // 对比 NPC 详细关系 (四维数值)
  if (oldState.npcRelationships && newState.npcRelationships && newState.player?.name) {
    const playerName = newState.player.name
    
    for (const charName in newState.npcRelationships) {
      if (charName === playerName) continue // 跳过玩家自己

      // 获取该角色对玩家的关系
      const newRel = newState.npcRelationships[charName]?.relations?.[playerName]
      const oldRel = oldState.npcRelationships?.[charName]?.relations?.[playerName]

      if (newRel) {
         // 亲密度/好感
         const oldIntimacy = oldRel?.intimacy || 0
         const newIntimacy = newRel.intimacy || 0
         if (oldIntimacy !== newIntimacy) {
            changes.push({ 
              label: `${charName}好感`, 
              oldValue: oldIntimacy, 
              newValue: newIntimacy, 
              diff: newIntimacy - oldIntimacy 
            })
         }

         // 信任度
         const oldTrust = oldRel?.trust || 0
         const newTrust = newRel.trust || 0
         if (oldTrust !== newTrust) {
            changes.push({ 
              label: `${charName}信任`, 
              oldValue: oldTrust, 
              newValue: newTrust, 
              diff: newTrust - oldTrust 
            })
         }

         // 激情度
         const oldPassion = oldRel?.passion || 0
         const newPassion = newRel.passion || 0
         if (oldPassion !== newPassion) {
            changes.push({ 
              label: `${charName}激情`, 
              oldValue: oldPassion, 
              newValue: newPassion, 
              diff: newPassion - oldPassion 
            })
         }

         // 敌意度
         const oldHostility = oldRel?.hostility || 0
         const newHostility = newRel.hostility || 0
         if (oldHostility !== newHostility) {
            changes.push({ 
              label: `${charName}敌意`, 
              oldValue: oldHostility, 
              newValue: newHostility, 
              diff: newHostility - oldHostility 
            })
         }
      }
    }
  }

  // 检查好友列表变化 (数量)
  if (oldState.player?.social?.friends && newState.player?.social?.friends) {
    if (oldState.player.social.friends.length !== newState.player.social.friends.length) {
      changes.push({
        label: '好友数',
        oldValue: oldState.player.social.friends.length,
        newValue: newState.player.social.friends.length,
        diff: newState.player.social.friends.length - oldState.player.social.friends.length
      })
    }
  }

  // 检查时间是否有变化，合并显示
  const timeChanges = changes.filter(c => ['年', '月', '日', '时', '分', '星期'].includes(c.label))
  if (timeChanges.length > 0) {
    // 移除单独的时间项
    const nonTimeChanges = changes.filter(c => !['年', '月', '日', '时', '分', '星期'].includes(c.label))
    
    // 构建时间显示
    const oldTime = oldState.gameTime
    const newTime = newState.gameTime
    if (oldTime && newTime) {
      const formatTime = (t) => `${t.month}/${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
      nonTimeChanges.unshift({
        label: '时间',
        oldValue: formatTime(oldTime),
        newValue: formatTime(newTime)
      })
    }
    
    return nonTimeChanges
  }
  
  return changes
}
