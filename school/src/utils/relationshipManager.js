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
  
  if (gameStore.npcRelationships && Object.keys(gameStore.npcRelationships).length > 0) {
    console.log('[RelationshipManager] Relationships already initialized')
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

    if (gameStore.allClassData) {
      for (const classData of Object.values(gameStore.allClassData)) {
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
  gameStore.npcRelationships = relationships
  
  console.log(`[RelationshipManager] Initialized ${allCharacters.length} characters`)
  
  // 更新印象列表
  saveImpressionData()
}

/**
 * 展开泛指关系（如“偶像们”、“学生们”）
 */
function expandGenericRelationships(relationships, gameStore) {
  const allChars = Object.keys(relationships)
  
  // 定义群体查找逻辑
  const getGroupMembers = (groupName, sourceName) => {
    const members = new Set()
    
    // 1. 偶像们 (1-E, 2-E, 3-E 的学生)
    if (groupName === '偶像们') {
      ['1-E', '2-E', '3-E'].forEach(classId => {
        const classData = gameStore.allClassData[classId]
        if (classData && classData.students) {
          classData.students.forEach(s => members.add(s.name))
        }
      })
    }
    // 2. 学生们 (全校学生)
    else if (groupName === '学生们') {
      Object.values(gameStore.allClassData).forEach(classData => {
        if (classData.students) {
          classData.students.forEach(s => members.add(s.name))
        }
      })
    }
    // 3. 社团成员 (同一社团的其他成员)
    else if (groupName === '社团成员') {
      // 找到源角色所在的社团
      Object.values(gameStore.allClubs).forEach(club => {
        if (club.members && club.members.includes(sourceName)) {
          club.members.forEach(m => members.add(m))
        }
      })
    }
    // 4. 特定社团/团体
    else {
      // 尝试匹配社团名称
      const club = Object.values(gameStore.allClubs).find(c => c.name === groupName || c.name.includes(groupName))
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
         const dramaClub = Object.values(gameStore.allClubs).find(c => c.name === '演剧部')
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
  if (gameStore.allClassData) {
    for (const classData of Object.values(gameStore.allClassData)) {
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
  if (gameStore.allClubs) {
    for (const club of Object.values(gameStore.allClubs)) {
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
  if (gameStore.npcs && gameStore.npcs.length > 0) {
    for (const npc of gameStore.npcs) {
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
  return gameStore.npcRelationships?.[charName] || null
}

/**
 * 获取两个角色之间的关系
 * @param {string} sourceName - 源角色名
 * @param {string} targetName - 目标角色名
 * @returns {Object|null}
 */
export function getRelationship(sourceName, targetName) {
  const gameStore = useGameStore()
  return gameStore.npcRelationships?.[sourceName]?.relations?.[targetName] || null
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
  if (!gameStore.npcRelationships[sourceName]) {
    gameStore.npcRelationships[sourceName] = {
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
    groups: relationData.groups || [],
    tags: tags,
    events: relationData.events || []
  }

  // 设置关系
  gameStore.npcRelationships[sourceName].relations[targetName] = newRelation
  
  // 检查是否需要同步到社交APP
  syncSocialAppFriend(sourceName, targetName, relationData)
  
  console.log(`[RelationshipManager] Set relationship: ${sourceName} -> ${targetName}`)
  
  // 更新印象列表
  saveImpressionData()

  // 异步保存到世界书 (不阻塞)
  // 注意：这里我们只更新了内存中的一项，实际上应该更新世界书中的对应条目
  // 但为了性能，我们可能不想每次都全量读写大JSON。
  // 考虑到数据一致性，这里做一个简单的全量同步作为 MVP 实现。
  // 如果性能有问题，后续可以优化 saveSocialData 只做局部更新。
  fetchSocialData().then(data => {
    if (!data) data = {}
    if (!data[sourceName]) data[sourceName] = { relationships: {} }
    if (!data[sourceName].relationships) data[sourceName].relationships = {}
    data[sourceName].relationships[targetName] = newRelation
    saveSocialData(data).catch(e => console.error('Failed to sync relationship to worldbook', e))
  })
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
  
  // 增量更新
  const updated = {
    ...current,
    intimacy: clamp(current.intimacy + (delta.intimacy || 0), -100, 100),
    trust: clamp(current.trust + (delta.trust || 0), -100, 100),
    passion: clamp(current.passion + (delta.passion || 0), -100, 100),
    hostility: clamp(current.hostility + (delta.hostility || 0), 0, 100)
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
  if (gameStore.npcRelationships[charName]) {
    delete gameStore.npcRelationships[charName]
  }
  
  // 删除其他角色对该角色的关系
  for (const otherName in gameStore.npcRelationships) {
    if (gameStore.npcRelationships[otherName].relations?.[charName]) {
      delete gameStore.npcRelationships[otherName].relations[charName]
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
  if (gameStore.npcRelationships[sourceName]?.relations?.[targetName]) {
    delete gameStore.npcRelationships[sourceName].relations[targetName]
    console.log(`[RelationshipManager] Removed relation: ${sourceName} -> ${targetName}`)
  }
  
  // 删除 target -> source 的反向关系
  if (gameStore.npcRelationships[targetName]?.relations?.[sourceName]) {
    delete gameStore.npcRelationships[targetName].relations[sourceName]
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
  if (gameStore.npcRelationships[charName]) {
    const newPersonality = {
      ...gameStore.npcRelationships[charName].personality,
      ...personality
    }
    gameStore.npcRelationships[charName].personality = newPersonality
    
    // 同步到世界书
    fetchSocialData().then(data => {
      if (!data) data = {}
      if (!data[charName]) data[charName] = {}
      data[charName].personality = newPersonality
      saveSocialData(data).catch(e => console.error('Failed to sync personality to worldbook', e))
    })
  }
}

/**
 * 更新角色目标
 */
export function updateGoals(charName, goals) {
  const gameStore = useGameStore()
  if (gameStore.npcRelationships[charName]) {
    const newGoals = {
      ...gameStore.npcRelationships[charName].goals,
      ...goals
    }
    gameStore.npcRelationships[charName].goals = newGoals

    // 同步到世界书
    fetchSocialData().then(data => {
      if (!data) data = {}
      if (!data[charName]) data[charName] = {}
      data[charName].goals = newGoals
      saveSocialData(data).catch(e => console.error('Failed to sync goals to worldbook', e))
    })
  }
}

/**
 * 更新角色行动优先级
 */
export function updatePriorities(charName, priorities) {
  const gameStore = useGameStore()
  if (gameStore.npcRelationships[charName]) {
    const newPriorities = {
      ...gameStore.npcRelationships[charName].priorities,
      ...priorities
    }
    gameStore.npcRelationships[charName].priorities = newPriorities

    // 同步到世界书
    fetchSocialData().then(data => {
      if (!data) data = {}
      if (!data[charName]) data[charName] = {}
      data[charName].priorities = newPriorities
      saveSocialData(data).catch(e => console.error('Failed to sync priorities to worldbook', e))
    })
  }
}

/**
 * 获取角色的所有关系列表（用于UI显示）
 */
export function getCharacterRelationsList(charName) {
  const gameStore = useGameStore()
  const charData = gameStore.npcRelationships?.[charName]
  
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
  const charData = gameStore.npcRelationships?.[charName]
  if (charData?.relations) {
    for (const targetName of Object.keys(charData.relations)) {
      related.add(targetName)
    }
  }
  
  // 其他角色对该角色的关系
  for (const [otherName, otherData] of Object.entries(gameStore.npcRelationships || {})) {
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
  
  for (const [sourceName, charData] of Object.entries(gameStore.npcRelationships || {})) {
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
