// -*- coding: utf-8 -*-
/**
 * 角色关系管理工具
 * 负责关系数据的CRUD操作、同步到世界书、以及社交APP联动
 */

import { useGameStore } from '../stores/gameStore'
import {
  RELATIONSHIP_GROUPS,
  shouldBeSocialFriend,
  generateCharId
} from '../data/relationshipData'
import { saveImpressionData, saveImpressionDataImmediate } from './impressionWorldbook'
import { ensureSocialDataWorldbook, fetchSocialData, saveSocialData } from './socialRelationshipsWorldbook'
import { saveNpcRelationships } from './indexedDB'

// ========== 防抖写入 IndexedDB ==========
let _debounceSaveTimer = null
const DEBOUNCE_DELAY = 500 // ms

/**
 * 防抖保存社交数据到 IndexedDB（按 currentRunId 隔离）
 * 将短时间内的多次写入合并为一次
 * @param {Object} _partialData 参数保留以兼容调用方签名，但不再做增量合并
 */
function debounceSaveSocialData(_partialData) {
  if (_debounceSaveTimer) {
    clearTimeout(_debounceSaveTimer)
  }
  _debounceSaveTimer = setTimeout(() => {
    _debounceSaveTimer = null
    try {
      const gameStore = useGameStore()
      const runId = gameStore.meta.currentRunId
      if (runId && runId !== 'temp_editing' && gameStore.world.npcRelationships) {
        const snapshot = JSON.parse(JSON.stringify(gameStore.world.npcRelationships))
        saveNpcRelationships(runId, snapshot).catch(e =>
          console.error('[RelationshipManager] IndexedDB save failed:', e)
        )
      }
    } catch (e) {
      console.error('[RelationshipManager] Debounced save failed:', e)
    }
  }, DEBOUNCE_DELAY)
}

/**
 * 立即刷新待写入的社交数据到 IndexedDB
 * 用于在关闭编辑器或确认保存前确保数据不丢失
 * @returns {Promise<void>}
 */
export async function flushPendingSocialData() {
  if (_debounceSaveTimer) {
    clearTimeout(_debounceSaveTimer)
    _debounceSaveTimer = null
  }
  try {
    const gameStore = useGameStore()
    const runId = gameStore.meta.currentRunId
    if (runId && runId !== 'temp_editing' && gameStore.world.npcRelationships) {
      const snapshot = JSON.parse(JSON.stringify(gameStore.world.npcRelationships))
      await saveNpcRelationships(runId, snapshot)
    }
  } catch (e) {
    console.error('[RelationshipManager] Flush save failed:', e)
  }
}

/**
 * 清空防抖 timer（不执行写入）
 * 用于存档恢复前丢弃旧存档的 pending 写入，防止旧数据回写
 */
export function clearPendingSocialData() {
  if (_debounceSaveTimer) {
    clearTimeout(_debounceSaveTimer)
    _debounceSaveTimer = null
  }
}

/**
 * 从 allClassData 中查找角色的性别
 * @param {string} charName 角色名
 * @param {Object} gameStore 游戏状态
 * @returns {string} 'male' | 'female' | 'unknown'
 */
export function lookupGender(charName, gameStore) {
  if (!gameStore) {
    try { gameStore = useGameStore() } catch (e) { return 'unknown' }
  }
  
  if (gameStore.world.allClassData) {
    for (const classData of Object.values(gameStore.world.allClassData)) {
      // 检查班主任
      if (classData.headTeacher && classData.headTeacher.name === charName && classData.headTeacher.gender) {
        return classData.headTeacher.gender
      }
      // 检查教师
      if (classData.teachers) {
        const teacher = classData.teachers.find(t => t.name === charName)
        if (teacher && teacher.gender) return teacher.gender
      }
      // 检查学生
      if (classData.students) {
        const student = classData.students.find(s => s.name === charName)
        if (student && student.gender) return student.gender
      }
    }
  }
  
  // 从 npcs 数组查找
  if (gameStore.world.npcs) {
    const npc = gameStore.world.npcs.find(n => n.name === charName)
    if (npc && npc.gender) return npc.gender
  }
  
  return 'unknown'
}

/**
 * 初始化所有角色的关系数据
 * 从班级数据和世界书数据中构建完整的关系网络
 */
export async function initializeRelationships() {
  const gameStore = useGameStore()
  
  // 确保世界书存在并获取最新数据
  // 注意：即便是已经有关系数据了，我们也可能需要从世界书更新（比如性格修正）
  // 但为了避免覆盖运行时变化，我们只在初始化为空时完整构建，
  // 或者在显式刷新时调用（目前这里是初始化）
  
  if (gameStore.world.npcRelationships && Object.keys(gameStore.world.npcRelationships).length > 0) {
    console.log('[RelationshipManager] Relationships already initialized, supplementing missing gender...')
    // 即使已初始化，也补充缺失的 gender 字段（存档加载后可能丢失）
    _supplementMissingGender(gameStore)
    return
  }

  console.log('[RelationshipManager] Initializing relationships from worldbook...')
  
  // 确保世界书存在
  await ensureSocialDataWorldbook()
  const socialData = await fetchSocialData() || {}
  
  // 收集所有角色名
  const allCharacters = getAllCharacterNames(gameStore)
  
  // 初始化关系数据结构
  const relationships = {}
  
  for (const charName of allCharacters) {
    // 尝试从班级数据中获取自定义性格和性别
    let customPersonality = null
    let charGender = 'female' // 默认为女性

    if (gameStore.world.allClassData) {
      for (const classData of Object.values(gameStore.world.allClassData)) {
        // 检查班主任
        if (classData.headTeacher && classData.headTeacher.name === charName) {
          if (classData.headTeacher.personality) customPersonality = classData.headTeacher.personality
          if (classData.headTeacher.gender) charGender = classData.headTeacher.gender
          break
        }
        // 检查教师
        if (classData.teachers) {
          const teacher = classData.teachers.find(t => t.name === charName)
          if (teacher) {
            if (teacher.personality) customPersonality = teacher.personality
            if (teacher.gender) charGender = teacher.gender
            break
          }
        }
        // 检查学生
        if (classData.students) {
          const student = classData.students.find(s => s.name === charName)
          if (student) {
            if (student.personality) customPersonality = student.personality
            if (student.gender) charGender = student.gender
            break
          }
        }
      }
    }

    // 从世界书数据中获取
    const charSocialData = socialData[charName] || {}

    relationships[charName] = {
      gender: charGender,
      // 性格轴 (优先使用世界书数据，其次是班级数据中的自定义数据，最后是默认值)
      personality: charSocialData.personality || customPersonality || {
        order: 0,
        altruism: 0,
        tradition: 0,
        peace: 50
      },
      // 目标
      goals: charSocialData.goals || {
        immediate: '',
        shortTerm: '',
        longTerm: ''
      },
      // 行动优先级
      priorities: charSocialData.priorities || {
        academics: 50,
        social: 50,
        hobbies: 50,
        survival: 50,
        club: 50
      },
      // 与其他角色的关系
      relations: {}
    }
    
    // 加载关系
    if (charSocialData.relationships) {
      relationships[charName].relations = JSON.parse(
        JSON.stringify(charSocialData.relationships)
      )
    }
  }

  // 展开泛指关系
  expandGenericRelationships(relationships, gameStore)
  
  // 保存到gameStore
  gameStore.world.npcRelationships = relationships
  
  console.log(`[RelationshipManager] Initialized ${allCharacters.length} characters`)
  
  // 更新印象列表
  saveImpressionData()
}

/**
 * 补充已初始化的 npcRelationships 中缺失的 gender 字段
 * 从 allClassData 中查找并填充
 */
function _supplementMissingGender(gameStore) {
  if (!gameStore.world.npcRelationships) return
  
  let supplemented = 0
  for (const charName of Object.keys(gameStore.world.npcRelationships)) {
    const charData = gameStore.world.npcRelationships[charName]
    if (!charData.gender || charData.gender === 'unknown') {
      const gender = lookupGender(charName, gameStore)
      if (gender !== 'unknown') {
        charData.gender = gender
        supplemented++
      }
    }
  }
  
  if (supplemented > 0) {
    console.log(`[RelationshipManager] Supplemented gender for ${supplemented} characters`)
  }
}

/**
 * 展开泛指关系（如"偶像们"、"学生们"）
 */
function expandGenericRelationships(relationships, gameStore) {
  const allChars = Object.keys(relationships)
  
  // 定义群体查找逻辑
  const getGroupMembers = (groupName, sourceName) => {
    const members = new Set()
    
    // 1. 偶像们 (1-E, 2-E, 3-E 的学生)
    if (groupName === '偶像们') {
      ['1-E', '2-E', '3-E'].forEach(classId => {
        const classData = gameStore.world.allClassData[classId]
        if (classData && classData.students) {
          classData.students.forEach(s => members.add(s.name))
        }
      })
    }
    // 2. 学生们 (全校学生)
    else if (groupName === '学生们') {
      Object.values(gameStore.world.allClassData).forEach(classData => {
        if (classData.students) {
          classData.students.forEach(s => members.add(s.name))
        }
      })
    }
    // 3. 社团成员 (同一社团的其他成员)
    else if (groupName === '社团成员') {
      // 找到源角色所在的社团
      Object.values(gameStore.world.allClubs).forEach(club => {
        if (club.members && club.members.includes(sourceName)) {
          club.members.forEach(m => members.add(m))
        }
      })
    }
    // 4. 特定社团/团体
    else {
      // 尝试匹配社团名称
      const club = Object.values(gameStore.world.allClubs).find(c => c.name === groupName || c.name.includes(groupName))
      if (club && club.members) {
        club.members.forEach(m => members.add(m))
      }
      
      // 特殊团体映射
      if (groupName === 'WUG成员') {
        ['島田真夢', '林田藍里', '片山実波', '七瀬佳乃', '久海菜々美', '菊間夏夜', '岡本未夕'].forEach(m => members.add(m))
      }
      if (groupName === '排球部') {
        // 假设排球部成员都在 allClubs 中，或者通过名字匹配
        // 这里简单处理，如果名字在 allChars 中且属于排球相关作品
        // 更好的方式是依赖 allClubs 数据
      }
      if (groupName === '轻音部') {
        ['平泽唯', '秋山澪', '田井中律', '琴吹紬', '中野梓'].forEach(m => members.add(m))
      }
      if (groupName === '樱花庄') {
        ['神田空太', '椎名真白', '青山七海', '上井草美咲', '三鹰仁', '赤坂龙之介'].forEach(m => members.add(m))
      }
      if (groupName === '剧团') {
         // 演剧部
         const dramaClub = Object.values(gameStore.world.allClubs).find(c => c.name === '演剧部')
         if (dramaClub) dramaClub.members.forEach(m => members.add(m))
      }
    }
    
    // 移除源角色自己
    members.delete(sourceName)
    return Array.from(members)
  }

  // 遍历所有角色和关系
  for (const sourceName of allChars) {
    const charData = relationships[sourceName]
    if (!charData.relations) continue
    
    const newRelations = {}
    let hasChanges = false
    
    for (const [targetName, relation] of Object.entries(charData.relations)) {
      // 检查是否是泛指目标（不在 allChars 中，或者明确是群体名）
      // 这里简单判断：如果 targetName 不在 allChars 中，或者包含特定关键词
      const isGeneric = !allChars.includes(targetName) || 
                        ['偶像们', '学生们', '社团成员', 'WUG成员', '排球部', '轻音部', '剧团', '樱花庄'].includes(targetName)
      
      if (isGeneric) {
        const members = getGroupMembers(targetName, sourceName)
        if (members.length > 0) {
          hasChanges = true
          // 将关系复制给每个成员
          members.forEach(member => {
            // 如果已经有具体关系，保留具体的（不覆盖）
            if (!charData.relations[member] && !newRelations[member]) {
              // 只有当目标角色存在于系统中时才添加
              if (allChars.includes(member)) {
                newRelations[member] = JSON.parse(JSON.stringify(relation))
              }
            }
          })
        }
      }
    }
    
    // 合并新关系
    if (hasChanges) {
      Object.assign(charData.relations, newRelations)
      // 可选：移除泛指关系的键，或者保留作为参考？
      // 为了避免数据冗余，建议移除，但为了保留原始意图，也可以保留。
      // 这里选择保留，因为它们不会影响具体角色的逻辑。
    }
  }
}

/**
 * 从班级数据中获取所有角色名称
 */
export function getAllCharacterNames(gameStore) {
  const names = new Set()
  
  // 添加玩家名称
  if (gameStore.player.name) {
    names.add(gameStore.player.name)
  }
  
  // 从班级数据中收集
  if (gameStore.world.allClassData) {
    for (const classData of Object.values(gameStore.world.allClassData)) {
      // 班主任
      if (classData.headTeacher && classData.headTeacher.name) {
        names.add(classData.headTeacher.name)
      }
      // 科任教师
      if (classData.teachers) {
        for (const teacher of classData.teachers) {
          if (teacher.name) names.add(teacher.name)
        }
      }
      // 学生
      if (classData.students) {
        for (const student of classData.students) {
          if (student.name) names.add(student.name)
        }
      }
    }
  }
  
  // 从社团数据中收集
  if (gameStore.world.allClubs) {
    for (const club of Object.values(gameStore.world.allClubs)) {
      if (club.advisor) names.add(club.advisor)
      if (club.president) names.add(club.president)
      if (club.vicePresident) names.add(club.vicePresident)
      if (club.members) {
        for (const member of club.members) {
          names.add(member)
        }
      }
    }
  }
  
  // 从 NPC 列表中收集（作为备选数据源，确保在 allClassData/allClubs 为空时也能获取角色）
  if (gameStore.world.npcs && gameStore.world.npcs.length > 0) {
    for (const npc of gameStore.world.npcs) {
      if (npc.name) names.add(npc.name)
    }
  }
  
  return Array.from(names)
}

/**
 * 获取角色的关系数据
 * @param {string} charName - 角色名
 * @returns {Object|null}
 */
export function getCharacterData(charName) {
  const gameStore = useGameStore()
  return gameStore.world.npcRelationships?.[charName] || null
}

/**
 * 获取两个角色之间的关系
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @returns {Object|null}
 */
export function getRelationship(sourceName, targetName) {
  const gameStore = useGameStore()
  return gameStore.world.npcRelationships?.[sourceName]?.relations?.[targetName] || null
}

/**
 * 设置两个角色之间的关系
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @param {Object} relationData - 关系数据
 */
export function setRelationship(sourceName, targetName, relationData) {
  const gameStore = useGameStore()
  
  // 确保源角色存在
  if (!gameStore.world.npcRelationships[sourceName]) {
    gameStore.world.npcRelationships[sourceName] = {
      personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
      goals: { immediate: '', shortTerm: '', longTerm: '' },
      priorities: { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
      relations: {}
    }
  }
  
// 限制印象标签数量为4个（保留最新的4个）
  let tags = relationData.tags || []
  if (tags.length > 4) {
    tags = tags.slice(-4)
  }

  const newRelation = {
    intimacy: relationData.intimacy ?? 0,
    trust: relationData.trust ?? 0,
    passion: relationData.passion ?? 0,
    hostility: relationData.hostility ?? 0,
    groups: Array.isArray(relationData.groups)
      ? JSON.parse(JSON.stringify(relationData.groups))
      : [],
    tags: Array.isArray(tags)
      ? JSON.parse(JSON.stringify(tags))
      : [],
    events: Array.isArray(relationData.events)
      ? JSON.parse(JSON.stringify(relationData.events))
      : []
  }

  // 设置关系
  gameStore.world.npcRelationships[sourceName].relations[targetName] = newRelation
  
  // 检查是否需要同步到社交APP
  syncSocialAppFriend(sourceName, targetName, relationData)
  
  console.log(`[RelationshipManager] Set relationship: ${sourceName} -> ${targetName}`)
  
  // 更新印象列表
  saveImpressionData()

  // 使用防抖机制异步保存到世界书（避免短时间内多次写入导致竞态覆盖）
  const partialData = {}
  partialData[sourceName] = { relationships: { [targetName]: newRelation } }
  debounceSaveSocialData(partialData)
}

/**
 * 对 NPC→玩家 的正向关系增量应用玩家属性权重
 * 基础修正系数 = eq/100 × 0.4 + charm/100 × 0.4 + mood/100 × 0.2（范围 0~1）
 * 亲密/信赖: round(delta × (0.2 + 0.8 × modifier))  — 属性全满 100%
 * 激情:      round(delta × (0.1 + 0.45 × modifier)) — 属性全满仅 55%，体现"心动难得"
 * 敌意: 不受影响
 * 只影响正向增量（delta > 0），负向变化原样返回
 * @param {Object} delta - { intimacy?, trust?, passion?, hostility? }
 * @param {Object} gameStore - gameStore 实例
 * @returns {Object} 加权后的 delta
 */
export function applyRelationshipWeights(delta, gameStore) {
  const attrs = gameStore.player?.attributes || {}
  const eq = (attrs.eq ?? 50) / 100
  const charm = (attrs.charm ?? 50) / 100
  const mood = (attrs.mood ?? 50) / 100
  const modifier = eq * 0.4 + charm * 0.4 + mood * 0.2

  const result = { ...delta }

  // 亲密和信赖
  for (const key of ['intimacy', 'trust']) {
    if (result[key] > 0) {
      result[key] = Math.max(1, Math.round(result[key] * (0.2 + 0.8 * modifier)))
    }
  }
  // 激情（更难增加）
  if (result.passion > 0) {
    result.passion = Math.max(1, Math.round(result.passion * (0.1 + 0.45 * modifier)))
  }
  // hostility 不受影响

  return result
}

/**
 * 更新关系值（增量）
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @param {Object} delta - 变化值 { intimacy?, trust?, passion?, hostility? }
 */
export function updateRelationshipDelta(sourceName, targetName, delta) {
  const current = getRelationship(sourceName, targetName)
  
  if (!current) {
    // 如果不存在，创建新关系
    setRelationship(sourceName, targetName, {
      intimacy: delta.intimacy || 0,
      trust: delta.trust || 0,
      passion: delta.passion || 0,
      hostility: delta.hostility || 0,
      groups: [],
      tags: []
    })
    return
  }
  
  // 递减收益：当前值越接近极值，变化越小
  function applyDiminishing(current, delta, max) {
    if (delta === 0) return 0
    if (delta > 0 && current >= 0) {
      // 正向增量：越高越难涨
      const ratio = current / max
      const diminish = 1 - ratio * ratio
      return Math.max(1, Math.round(delta * diminish))
    }
    if (delta < 0 && current >= 60) {
      // 负向增量 + 高数值：深厚关系不易崩塌（衰减力度为正向的一半）
      const ratio = current / max
      const diminish = 1 - (ratio * ratio) * 0.5
      return Math.min(-1, Math.round(delta * diminish))
    }
    return delta
  }

  const adjIntimacy = applyDiminishing(current.intimacy, delta.intimacy || 0, 100)
  const adjTrust = applyDiminishing(current.trust, delta.trust || 0, 100)
  const adjPassion = applyDiminishing(current.passion, delta.passion || 0, 100)
  const adjHostility = applyDiminishing(current.hostility, delta.hostility || 0, 100)

  // 增量更新（使用递减收益调整后的值）
  const updated = {
    ...current,
    intimacy: clamp(current.intimacy + adjIntimacy, -100, 100),
    trust: clamp(current.trust + adjTrust, -100, 100),
    passion: clamp(current.passion + adjPassion, -100, 100),
    hostility: clamp(current.hostility + adjHostility, 0, 100)
  }
  
  setRelationship(sourceName, targetName, updated)
}

/**
 * 添加关系事件
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @param {Object} event - 事件数据
 */
export function addRelationshipEvent(sourceName, targetName, event) {
  const gameStore = useGameStore()
  const current = getRelationship(sourceName, targetName)
  
  if (!current) return
  
  const eventData = {
    timestamp: Date.now(),
    type: event.type || 'general',
    description: event.description || '',
    impact: event.impact || {}
  }
  
  if (!current.events) current.events = []
  current.events.push(eventData)

  // 触发持久化，确保事件数据保存到当前存档
  debounceSaveSocialData()

  // 应用事件影响
  if (event.impact) {
    updateRelationshipDelta(sourceName, targetName, event.impact)
  }
}

/**
 * 删除角色及其所有关系
 * @param {string} charName - 角色名
 * @param {boolean} immediate - 是否立即持久化到世界书（默认false，批量操作时应设为false，最后统一保存）
 */
export function removeCharacter(charName, immediate = false) {
  const gameStore = useGameStore()
  
  // 删除该角色的关系数据
  if (gameStore.world.npcRelationships[charName]) {
    delete gameStore.world.npcRelationships[charName]
  }
  
  // 删除其他角色对该角色的关系
  for (const otherName in gameStore.world.npcRelationships) {
    if (gameStore.world.npcRelationships[otherName].relations?.[charName]) {
      delete gameStore.world.npcRelationships[otherName].relations[charName]
    }
  }
  
  // 从社交APP好友列表移除
  const friendIndex = gameStore.player.social.friends.findIndex(
    f => f.name === charName
  )
  if (friendIndex > -1) {
    gameStore.player.social.friends.splice(friendIndex, 1)
  }
  
  console.log(`[RelationshipManager] Removed character: ${charName}`)
  
  // 更新印象列表
  if (immediate) {
    saveImpressionDataImmediate()
  } else {
    saveImpressionData()
  }
}

/**
 * 删除两个角色之间的关系（双向删除）
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @param {boolean} immediate - 是否立即持久化到世界书
 */
export function removeRelationship(sourceName, targetName, immediate = true) {
  const gameStore = useGameStore()
  
  // 删除 source -> target 的关系
  if (gameStore.world.npcRelationships[sourceName]?.relations?.[targetName]) {
    delete gameStore.world.npcRelationships[sourceName].relations[targetName]
    console.log(`[RelationshipManager] Removed relation: ${sourceName} -> ${targetName}`)
  }
  
  // 删除 target -> source 的反向关系
  if (gameStore.world.npcRelationships[targetName]?.relations?.[sourceName]) {
    delete gameStore.world.npcRelationships[targetName].relations[sourceName]
    console.log(`[RelationshipManager] Removed reverse relation: ${targetName} -> ${sourceName}`)
  }
  
  // 更新印象列表
  if (immediate) {
    saveImpressionDataImmediate()
  } else {
    saveImpressionData()
  }
}

/**
 * 同步关系到社交APP好友
 * 如果关系符合好友条件，自动添加到社交APP
 */
function syncSocialAppFriend(sourceName, targetName, relationData) {
  const gameStore = useGameStore()
  
  // 只处理与玩家相关的关系
  if (targetName !== gameStore.player.name && sourceName !== gameStore.player.name) {
    return
  }
  
  // 确定NPC名称
  const npcName = sourceName === gameStore.player.name ? targetName : sourceName
  
  // 检查是否应该是好友 (传入 true 表示涉及玩家，不自动添加)
  const shouldBeFriend = shouldBeSocialFriend(relationData, true)
  const existingFriend = gameStore.player.social.friends.find(f => f.name === npcName)
  
  if (shouldBeFriend && !existingFriend) {
    // 添加为好友
    const charId = generateCharId(npcName)
    gameStore.player.social.friends.push({
      id: charId,
      name: npcName,
      avatar: '👤',
      signature: '',
      status: 'online',
      unreadCount: 0,
      messages: []
    })
    console.log(`[RelationshipManager] Added ${npcName} as social friend`)
  } else if (!shouldBeFriend && existingFriend) {
    // 如果敌意过高，考虑移除好友（但不自动移除，仅记录）
    console.log(`[RelationshipManager] ${npcName} no longer meets friend criteria`)
  }
}

/**
 * 更新角色性格
 */
export function updatePersonality(charName, personality) {
  const gameStore = useGameStore()
  if (gameStore.world.npcRelationships[charName]) {
    const newPersonality = {
      ...gameStore.world.npcRelationships[charName].personality,
      ...personality
    }
    gameStore.world.npcRelationships[charName].personality = newPersonality
    
    // 使用防抖机制同步到世界书
    const partialData = {}
    partialData[charName] = { personality: newPersonality }
    debounceSaveSocialData(partialData)
  }
}

/**
 * 更新角色目标
 */
export function updateGoals(charName, goals) {
  const gameStore = useGameStore()
  if (gameStore.world.npcRelationships[charName]) {
    const newGoals = {
      ...gameStore.world.npcRelationships[charName].goals,
      ...goals
    }
    gameStore.world.npcRelationships[charName].goals = newGoals

    // 使用防抖机制同步到世界书
    const partialData = {}
    partialData[charName] = { goals: newGoals }
    debounceSaveSocialData(partialData)
  }
}

/**
 * 更新角色行动优先级
 */
export function updatePriorities(charName, priorities) {
  const gameStore = useGameStore()
  if (gameStore.world.npcRelationships[charName]) {
    const newPriorities = {
      ...gameStore.world.npcRelationships[charName].priorities,
      ...priorities
    }
    gameStore.world.npcRelationships[charName].priorities = newPriorities

    // 使用防抖机制同步到世界书
    const partialData = {}
    partialData[charName] = { priorities: newPriorities }
    debounceSaveSocialData(partialData)
  }
}

/**
 * 获取角色的所有关系列表（用于UI显示）
 */
export function getCharacterRelationsList(charName) {
  const gameStore = useGameStore()
  const charData = gameStore.world.npcRelationships?.[charName]
  
  if (!charData || !charData.relations) return []
  
  return Object.entries(charData.relations).map(([targetName, relation]) => ({
    targetName,
    ...relation
  }))
}

/**
 * 获取与某角色有关系的所有角色列表
 */
export function getRelatedCharacters(charName) {
  const gameStore = useGameStore()
  const related = new Set()
  
  // 该角色对其他角色的关系
  const charData = gameStore.world.npcRelationships?.[charName]
  if (charData?.relations) {
    for (const targetName of Object.keys(charData.relations)) {
      related.add(targetName)
    }
  }
  
  // 其他角色对该角色的关系
  for (const [otherName, otherData] of Object.entries(gameStore.world.npcRelationships || {})) {
    if (otherName !== charName && otherData.relations?.[charName]) {
      related.add(otherName)
    }
  }
  
  return Array.from(related)
}

/**
 * 辅助函数：限制值在范围内
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 导出关系数据为世界书格式
 */
export function exportRelationshipsForWorldbook() {
  const gameStore = useGameStore()
  const lines = ['# 角色关系网络', '# 格式: 源角色|目标角色|亲密度|信赖度|激情度|敌意度|分组|标签', '']
  
  for (const [sourceName, charData] of Object.entries(gameStore.world.npcRelationships || {})) {
    if (!charData.relations) continue
    
    for (const [targetName, relation] of Object.entries(charData.relations)) {
      const groups = (relation.groups || []).join(',')
      const tags = (relation.tags || []).join(',')
      lines.push(`${sourceName}|${targetName}|${relation.intimacy}|${relation.trust}|${relation.passion}|${relation.hostility}|${groups}|${tags}`)
    }
  }
  
  return lines.join('\n')
}

/**
 * 从世界书格式导入关系数据
 */
export function importRelationshipsFromWorldbook(content) {
  const gameStore = useGameStore()
  const lines = content.split('\n').filter(line =>
    line.trim() && !line.startsWith('#')
  )

  for (const line of lines) {
    const parts = line.split('|')
    if (parts.length >= 6) {
      const [sourceName, targetName, intimacy, trust, passion, hostility, groups, tags] = parts

      setRelationship(sourceName.trim(), targetName.trim(), {
        intimacy: parseInt(intimacy) || 0,
        trust: parseInt(trust) || 0,
        passion: parseInt(passion) || 0,
        hostility: parseInt(hostility) || 0,
        groups: groups ? groups.split(',').map(g => g.trim()) : [],
        tags: tags ? tags.split(',').map(t => t.trim()) : []
      })
    }
  }

  console.log(`[RelationshipManager] Imported ${lines.length} relationships`)
}

/**
 * 清空所有角色的关系数据
 */
export async function clearAllRelationships() {
  const gameStore = useGameStore()

  if (!gameStore.world.npcRelationships) return

  // 清空所有关系，但保留角色基本信息
  for (const charName in gameStore.world.npcRelationships) {
    if (gameStore.world.npcRelationships[charName].relations) {
      gameStore.world.npcRelationships[charName].relations = {}
    }
  }

  // 立即保存
  await flushPendingSocialData()

  // 同步到世界书
  await syncRelationshipsToWorldbook()

  console.log('[RelationshipManager] Cleared all relationships')
}

/**
 * 同步关系数据到世界书
 */
export async function syncRelationshipsToWorldbook() {
  try {
    const gameStore = useGameStore()
    await saveSocialData(gameStore.world.npcRelationships)
    console.log('[RelationshipManager] Synced relationships to worldbook')
  } catch (e) {
    console.error('[RelationshipManager] Failed to sync to worldbook:', e)
  }
}
