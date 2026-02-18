/**
 * 解析世界书中的班级数据
 * 
 * 格式规范：
 * 1年A班:{
 *   班主任: 姓名 性别 (来源)
 *   科任教师: {
 *     科目: 姓名 性别 (来源)
 *   }
 *   学生列表: {
 *     1. 姓名 性别 (来源)
 *   }
 * }
 */

import { ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { DEFAULT_TEMPLATES } from './npcScheduleSystem'
import { parseAcademicTag } from '../data/academicData'
import { getAllBookNames, getCurrentBookName } from './worldbookHelper'

// ==================== 社团数据格式规范 ====================
/**
 * 社团世界书条目格式：
 * 
 * ID|light_music_club
 * 名称|轻音部
 * 指导老师|山中佐和子
 * 部长|田井中律
 * 副部长|
 * 部员|平泽唯,秋山澪,琴吹䌷,中野梓
 * 核心技能|乐器演奏
 * 活动日|每日
 * 所在地点|light_music_club_room
 * 描述|以喝茶、吃点心和聊天为主，偶尔进行乐队练习的温馨社团。
 * 
 * 识别方式：世界书条目名称包含 [Club:club_id] 标记
 */

// 解析单行人员信息： "姓名 性别 (来源) [倾向][日程]"
function parsePersonInfo(text, defaultRole = 'student') {
  // 移除序号 "1. "
  text = text.replace(/^\d+\.\s*/, '').trim()
  
  // 1. 提取基本信息： 姓名 性别 (来源)
  // 性别可能是：男/女/♂/♀/Male/Female/M/F
  // 来源可能是：(来源) 或 （来源） 或 《来源》
  const baseRegex = /^(.+?)\s+([男女♂♀]|Male|Female|M|F)\s*[（(《](.+?)[)）》]/i
  const match = text.match(baseRegex)
  
  if (match) {
    let gender = match[2]
    const gLower = gender.toLowerCase()
    
    if (gLower === '男' || gLower === '♂' || gLower === 'male' || gLower === 'm') gender = 'male'
    else if (gLower === '女' || gLower === '♀' || gLower === 'female' || gLower === 'f') gender = 'female'
    else gender = 'unknown'

    const person = {
      name: match[1].trim(),
      gender: gender,
      origin: match[3].trim(),
      role: defaultRole
    }

    // 2. 提取所有标签 [内容] 或 【内容】
    const tagRegex = /[\[【](.+?)[\]】]/g
    let tagMatch
    
    while ((tagMatch = tagRegex.exec(text)) !== null) {
      const content = tagMatch[1].trim()
      
      // 智能识别标签类型
      if (content.startsWith('academic:')) {
        // 匹配学力标签 (如 academic:poor/very_high:math_weak,music_strong)
        const academicStr = content.substring('academic:'.length)
        person.academicProfile = parseAcademicTag(academicStr)
      } else if (content.startsWith('note:')) {
        // 匹配备注标签
        person.notes = content.substring('note:'.length)
      } else if (ELECTIVE_PREFERENCES[content]) {
        // 匹配选课倾向ID (如 music, sports)
        person.electivePreference = content
      } else if (DEFAULT_TEMPLATES[content] || content.startsWith('student_')) {
        // 匹配日程模板ID (如 student_athletic)
        person.scheduleTag = content
      } else {
        // 未知标签处理
        // 如果还没有选课偏好，优先作为选课偏好（兼容旧格式 [preference]）
        if (!person.electivePreference) {
          person.electivePreference = content
        } else if (!person.scheduleTag) {
          // 否则作为日程标签
          person.scheduleTag = content
        }
      }
    }

    return person
  }
  
  // 如果匹配失败，尝试简单的分割（作为后备）
  // 假设格式是：姓名 (来源)
  const simpleMatch = text.match(/^(.+?)\s*[（(](.+?)[)）]/)
  if (simpleMatch) {
    return {
      name: simpleMatch[1].trim(),
      gender: 'unknown',
      origin: simpleMatch[2].trim(),
      role: defaultRole
    }
  }

  return null
}

// ==================== 学力数据集中存储 ====================

/**
 * 从世界书获取学力数据库
 * @returns {Promise<Object|null>} { [name]: { level, potential, traits } }
 */
export async function fetchAcademicDataFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    return null
  }

  try {
    const bookNames = getAllBookNames()
    const academicData = {}
    const targetName = '[AcademicData] 全校学力数据库'

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      const entry = entries.find(e => e.name === targetName)
      if (entry) {
        console.log('[WorldbookParser] Found academic database')
        const lines = entry.content.split('\n')
        for (const line of lines) {
          if (!line.trim() || line.startsWith('#')) continue

          // 格式: 姓名|等级|潜力|特长列表
          const parts = line.split('|').map(s => s.trim())
          if (parts.length >= 3) {
            const name = parts[0]
            const level = parts[1] || 'avg'
            const potential = parts[2] || 'medium'
            const traits = parts[3] ? parts[3].split(/[,，]/).map(t => t.trim()).filter(t => t) : []

            academicData[name] = { level, potential, traits }
          }
        }
        // 找到即止，假设只有一个
        return academicData
      }
    }
    return academicData
  } catch (e) {
    console.error('[WorldbookParser] Error fetching academic data:', e)
    return null
  }
}

/**
 * 更新学力数据库到世界书
 * @param {Array} allStudents 所有学生列表
 * @returns {Promise<boolean>}
 */
export async function updateAcademicDataInWorldbook(allStudents) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return false
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return false

    console.log('[WorldbookParser] Updating academic database...')

    let content = '# 格式: 姓名|等级|潜力|特长列表\n'
    let count = 0

    for (const s of allStudents) {
      // 过滤掉没有学力数据的
      if (!s.academicProfile) continue

      // 确保是对象
      let ap = s.academicProfile
      if (typeof ap === 'string') {
        ap = parseAcademicTag(ap)
      }

      // 检查是否是默认值，如果是则不保存以节省空间
      // 默认: level=avg, potential=medium, traits=[]
      if (ap.level === 'avg' && ap.potential === 'medium' && (!ap.traits || ap.traits.length === 0)) {
        continue
      }

      const traits = ap.traits ? ap.traits.join(',') : ''
      content += `${s.name}|${ap.level}|${ap.potential}|${traits}\n`
      count++
    }

    const entryName = '[AcademicData] 全校学力数据库'

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      const index = newEntries.findIndex(e => e.name === entryName)

      const entry = {
        name: entryName,
        content: content,
        key: [], // 不需要 key，因为不启用
        strategy: { type: 'selective' }, // 随意，反正不启用
        position: { type: 'before_character_definition', order: 100 },
        probability: 100,
        enabled: false, // 关键：禁用
        recursion: { prevent_outgoing: true }
      }

      if (index !== -1) {
        newEntries[index] = { ...newEntries[index], ...entry }
      } else {
        newEntries.push(entry)
      }

      return newEntries
    })

    console.log(`[WorldbookParser] Academic database updated with ${count} records`)
    return true

  } catch (e) {
    console.error('[WorldbookParser] Error updating academic data:', e)
    return false
  }
}

// ==================== 社团数据解析 ====================

/**
 * 解析社团数据
 * @param {string} text 社团世界书条目内容
 * @returns {Object} 解析后的社团数据对象
 */
export function parseClubData(text) {
  const lines = text.split('\n')
  const club = {}

  const keyMap = {
    'ID': 'id',
    '名称': 'name',
    '指导老师': 'advisor',
    '部长': 'president',
    '副部长': 'vicePresident',
    '部员': 'members',
    '核心技能': 'coreSkill',
    '活动日': 'activityDay',
    '所在地点': 'location',
    '描述': 'description'
  }

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('|')
    if (separatorIndex === -1) continue

    const key = line.substring(0, separatorIndex).trim()
    const value = line.substring(separatorIndex + 1).trim()

    if (keyMap[key]) {
      const mappedKey = keyMap[key]
      if (mappedKey === 'members') {
        // 部员是逗号分隔的列表
        club.members = value ? value.split(',').map(m => m.trim()).filter(m => m) : []
      } else if (mappedKey === 'president' || mappedKey === 'vicePresident') {
        // 部长/副部长可能是逗号分隔的列表（多人）
        if (value && value.includes(',')) {
          club[mappedKey] = value.split(',').map(m => m.trim()).filter(m => m)
        } else {
          club[mappedKey] = value
        }
      } else {
        club[mappedKey] = value
      }
    }
  }

  return club
}

/**
 * 从世界书获取所有社团数据
 * @param {string} currentRunId 当前存档ID（可选，用于过滤）
 * @returns {Promise<Object|null>} 解析后的社团数据 { clubId: clubData, ... }
 */
export async function fetchClubDataFromWorldbook(currentRunId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return null
  }

  try {
    const bookNames = getAllBookNames()

    console.log('[WorldbookParser] Scanning worldbooks for club data:', bookNames, 'currentRunId:', currentRunId)

    const allClubs = {}

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 识别社团条目：名称包含 [Club:club_id] 或 [Club:club_id:runId]
        const match = entry.name && entry.name.match(/\[Club:(.+?)\]/)
        if (match) {
          // 提取完整标签内容，可能是 "clubId" 或 "clubId:runId"
          const tagContent = match[1]
          let clubId = tagContent
          let runId = null

          if (tagContent.includes(':')) {
            const parts = tagContent.split(':')
            clubId = parts[0]
            runId = parts[1]
          }

          // 如果提供了 currentRunId，且该条目指定了 runId，则必须匹配
          if (currentRunId && runId && runId !== currentRunId) {
            // 忽略其他 runId 的条目
            continue
          }

          console.log('[WorldbookParser] Found club data in entry:', entry.name)
          const clubData = parseClubData(entry.content)
          if (clubData.id) {
            // 保存原始条目信息以便后续更新
            clubData._entryName = entry.name
            clubData._bookName = name
            clubData._strategy = entry.strategy
            
            // 优先保留带有当前 runId 的条目，或者如果没有现有数据则保留
            // 如果 allClubs[clubData.id] 已存在，检查它是否是特定 runId 的
            const existing = allClubs[clubData.id]
            if (!existing || (runId === currentRunId)) {
              allClubs[clubData.id] = clubData
            }
          }
        }
      }
    }

    if (Object.keys(allClubs).length > 0) {
      return allClubs
    }

  } catch (e) {
    console.error('[WorldbookParser] Error fetching club data:', e)
  }

  return null
}

/**
 * 格式化社团数据为世界书内容
 * @param {Object} club 社团数据对象
 * @returns {string} 格式化后的文本
 */
function formatClubData(club) {
  let text = ''
  text += `ID|${club.id}\n`
  text += `名称|${club.name || ''}\n`
  text += `指导老师|${club.advisor || ''}\n`
  text += `部长|${club.president || ''}\n`
  text += `副部长|${club.vicePresident || ''}\n`
  text += `部员|${(club.members || []).join(',')}\n`
  text += `核心技能|${club.coreSkill || ''}\n`
  text += `活动日|${club.activityDay || ''}\n`
  text += `所在地点|${club.location || ''}\n`
  text += `描述|${club.description || ''}`
  return text
}

/**
 * 将 NPC 添加到社团（更新世界书部员列表）
 * @param {string} clubId 社团ID
 * @param {string} npcName NPC 名字
 * @param {Object} clubData 社团数据（包含 _bookName 等元信息）
 * @param {string} runId 当前存档ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function addNpcToClubInWorldbook(clubId, npcName, clubData, runId) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  if (!clubData || !clubData._bookName) {
    console.warn('[WorldbookParser] Invalid club data, missing _bookName')
    return false
  }

  try {
    const bookName = clubData._bookName
    console.log(`[WorldbookParser] Adding NPC ${npcName} to club ${clubId} in run ${runId}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      
      // 查找当前 RunID 的副本条目，或者原始条目
      const specificEntryNamePrefix = `[Club:${clubId}:${runId}]`
      let targetEntryIndex = newEntries.findIndex(e => e.name && e.name.startsWith(specificEntryNamePrefix))
      
      // 如果没有特定 RunID 的条目，找原始条目（排除带其他 runId 的）
      if (targetEntryIndex === -1) {
        targetEntryIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}]`) && !e.name.match(/\[Club:[^\]]+:[^\]]+\]/))
      }
      
      // 如果还是找不到，尝试找任何包含该 clubId 的条目（作为后备）
      if (targetEntryIndex === -1) {
        targetEntryIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}`))
      }
      
      if (targetEntryIndex === -1) {
        console.warn(`[WorldbookParser] Club entry not found for ${clubId}`)
        return entries
      }

      const targetEntry = newEntries[targetEntryIndex]
      const currentData = parseClubData(targetEntry.content)
      
      // 添加 NPC 到部员列表
      if (!currentData.members) currentData.members = []
      if (!currentData.members.includes(npcName)) {
        currentData.members.push(npcName)
      }

      // 更新关键词
      let newKeys = targetEntry.key || []
      if (typeof newKeys === 'string') {
        newKeys = newKeys.split(',').map(k => k.trim())
      }
      if (!newKeys.includes(npcName)) {
        newKeys.push(npcName)
      }

      // 如果不是特定 RunID 的条目（且不是玩家自定义的已经是特定 runId 的条目），需要创建副本
      // 注意：如果是玩家创建的社团，条目名本身就包含 runId，这里 startsWith 会返回 true，直接更新
      if (!targetEntry.name.includes(`:${runId}]`)) {
        const originalEntry = targetEntry
        const specificEntryName = `[Club:${clubId}:${runId}]` + (originalEntry.name.split(']')[1] || '')
        
        const newEntry = {
          ...originalEntry,
          id: undefined,
          name: specificEntryName,
          content: formatClubData(currentData),
          key: newKeys,
          strategy: {
            ...originalEntry.strategy,
            type: 'constant'
          },
          enabled: true
        }
        
        newEntries.push(newEntry)
        
        // 禁用原始条目
        newEntries[targetEntryIndex] = {
          ...originalEntry,
          enabled: false
        }
      } else {
        // 直接更新现有的特定 RunID 条目
        newEntries[targetEntryIndex] = {
          ...targetEntry,
          content: formatClubData(currentData),
          key: newKeys
        }
      }

      return newEntries
    })

    return true

  } catch (e) {
    console.error('[WorldbookParser] Error adding NPC to club:', e)
    return false
  }
}

/**
 * 创建新社团（在世界书中创建条目）
 * @param {Object} clubInfo 社团信息 { id, name, description, coreSkill, activityDay, location, president }
 * @param {string} runId 当前存档ID
 * @returns {Promise<Object|null>} 创建的社团数据，失败返回 null
 */
export async function createClubInWorldbook(clubInfo, runId) {
  console.log(`[WorldbookParser] createClubInWorldbook called for ${clubInfo.id}, runId: ${runId}`)
  
  // 检查 API 可用性
  const hasGetNames = typeof window.getCharWorldbookNames === 'function'
  const hasUpdate = typeof window.updateWorldbookWith === 'function'
  
  console.log(`[WorldbookParser] API availability: getCharWorldbookNames=${hasGetNames}, updateWorldbookWith=${hasUpdate}`)
  
  if (!hasGetNames || !hasUpdate) {
    console.warn('[WorldbookParser] Worldbook API not available - API functions missing')
    return null
  }

  try {
    const bookName = getCurrentBookName()
    console.log(`[WorldbookParser] Available worldbook:`, bookName)

    if (!bookName) {
      console.warn('[WorldbookParser] No worldbook available - no primary or additional books found')
      return null
    }

    console.log(`[WorldbookParser] Creating new club ${clubInfo.id} in worldbook: ${bookName}`)

    const club = {
      id: clubInfo.id,
      name: clubInfo.name,
      advisor: clubInfo.advisor || '',
      president: clubInfo.president || '',
      vicePresident: clubInfo.vicePresident || '',
      members: clubInfo.members || (clubInfo.president ? [clubInfo.president] : []),
      coreSkill: clubInfo.coreSkill || '',
      activityDay: clubInfo.activityDay || '',
      location: clubInfo.location || '',
      description: clubInfo.description || '',
      _bookName: bookName
    }

    let updateSuccess = false

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      
      const entryName = `[Club:${clubInfo.id}:${runId}] ${clubInfo.name}`
      
      // 检查是否已存在同名条目
      const existingIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubInfo.id}`))
      if (existingIndex !== -1) {
        console.log(`[WorldbookParser] Club entry already exists, updating: ${newEntries[existingIndex].name}`)
        newEntries[existingIndex] = {
          ...newEntries[existingIndex],
          name: entryName,
          content: formatClubData(club),
          key: [clubInfo.name, clubInfo.president].filter(k => k),
          enabled: true
        }
      } else {
        const newEntry = {
          name: entryName,
          content: formatClubData(club),
          key: [clubInfo.name, clubInfo.president].filter(k => k),
          strategy: {
            type: 'constant'
          },
          position: {
            type: 'before_character_definition',
            order: 50
          },
          probability: 100,
          enabled: true,
          recursion: {
            prevent_outgoing: true
          }
        }
        
        newEntries.push(newEntry)
        console.log(`[WorldbookParser] New club entry created: ${entryName}`)
      }
      
      updateSuccess = true
      return newEntries
    })

    if (updateSuccess) {
      console.log(`[WorldbookParser] Club ${clubInfo.id} created successfully in worldbook`)
      return club
    } else {
      console.warn(`[WorldbookParser] updateWorldbookWith completed but updateSuccess is false`)
      return null
    }

  } catch (e) {
    console.error('[WorldbookParser] Error creating club:', e)
    console.error('[WorldbookParser] Error stack:', e.stack)
    return null
  }
}

/**
 * 将玩家添加到社团（更新世界书 - 存档隔离版）
 * @param {string} clubId 社团ID
 * @param {string} playerName 玩家名字
 * @param {Object} clubData 社团数据（包含 _bookName 等元信息）
 * @param {string} runId 当前存档ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function addPlayerToClubInWorldbook(clubId, playerName, clubData, runId) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  if (!clubData || !clubData._bookName) {
    console.warn('[WorldbookParser] Invalid club data, missing _bookName')
    return false
  }

  try {
    const bookName = clubData._bookName
    console.log(`[WorldbookParser] Adding ${playerName} to club ${clubId} in run ${runId}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      
      // 优先查找特定 RunID 的条目
      const specificEntryNamePrefix = `[Club:${clubId}:${runId}]`
      let targetIndex = newEntries.findIndex(e => e.name && e.name.startsWith(specificEntryNamePrefix))
      
      // 如果没找到，查找原始条目 (不带 runId)
      if (targetIndex === -1) {
        targetIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}]`) && !e.name.match(/\[Club:[^\]]+:[^\]]+\]/))
      }
      
      // 如果还没找到，尝试任何包含 ID 的条目
      if (targetIndex === -1) {
         targetIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}`))
      }

      if (targetIndex === -1) {
        console.warn(`[WorldbookParser] Club entry not found for ${clubId}`)
        return entries
      }

      const targetEntry = newEntries[targetIndex]
      const currentData = parseClubData(targetEntry.content)
      
      // 添加玩家到部员列表
      if (!currentData.members) currentData.members = []
      if (!currentData.members.includes(playerName)) {
        currentData.members.push(playerName)
      }

      // 更新关键词
      let newKeys = targetEntry.key || []
      if (typeof newKeys === 'string') {
        newKeys = newKeys.split(',').map(k => k.trim())
      }
      if (!newKeys.includes(playerName)) {
        newKeys.push(playerName)
      }

      // 如果已经是特定 RunID 的条目（例如玩家创建的社团），直接更新
      if (targetEntry.name.includes(`:${runId}]`)) {
        newEntries[targetIndex] = {
          ...targetEntry,
          content: formatClubData(currentData),
          key: newKeys,
          enabled: true
        }
      } else {
        // 如果是原始条目，需要创建副本并禁用原始条目
        const specificEntryName = `[Club:${clubId}:${runId}]` + (targetEntry.name.split(']')[1] || '')
        
        const newEntry = {
          ...targetEntry,
          id: undefined,
          name: specificEntryName,
          content: formatClubData(currentData),
          key: newKeys,
          strategy: {
            ...targetEntry.strategy,
            type: 'constant' // 蓝灯
          },
          enabled: true
        }
        
        // 检查副本是否已存在（理论上逻辑走不到这，因为上面已检查 targetIndex）
        const existingSpecificIndex = newEntries.findIndex(e => e.name === specificEntryName)
        if (existingSpecificIndex !== -1) {
          newEntries[existingSpecificIndex] = newEntry
        } else {
          newEntries.push(newEntry)
        }
        
        // 禁用原始条目
        newEntries[targetIndex] = {
          ...targetEntry,
          enabled: false
        }
      }

      return newEntries
    })

    return true

  } catch (e) {
    console.error('[WorldbookParser] Error adding player to club:', e)
    return false
  }
}

/**
 * 确保社团条目在世界书中存在（如果不存在则创建）
 * 用于数据恢复或导入
 * @param {Object} clubData 社团数据
 * @param {string|null} runId 当前存档ID（如果为null，则创建通用原始条目）
 * @returns {Promise<boolean>}
 */
export async function ensureClubExistsInWorldbook(clubData, runId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return false
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return false

    // 【修复】无论是否创建新条目，都要确保 _bookName 被设置
    // 这解决了存档导入后 _bookName 丢失导致无法加入自己创建的社团的问题
    clubData._bookName = bookName

    console.log(`[WorldbookParser] Ensuring club ${clubData.id} exists in worldbook for run ${runId}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      
      // 【修复】区分 runId 检查存在性
      // 如果指定了 runId，需要检查特定 runId 的条目是否存在
      // 如果未指定 runId，检查通用条目（不带 runId 的）
      let exists
      if (runId) {
        // 检查特定 runId 的条目是否存在
        exists = newEntries.some(e => e.name && e.name.includes(`[Club:${clubData.id}:${runId}]`))
      } else {
        // 检查通用条目（不带 runId 的）
        exists = newEntries.some(e => 
          e.name && e.name.includes(`[Club:${clubData.id}]`) && 
          !e.name.match(/\[Club:[^\]]+:[^\]]+\]/)
        )
      }
      
      if (!exists) {
        console.log(`[WorldbookParser] Recreating missing club entry for ${clubData.name}`)
        
        // 如果提供了 runId，创建特定的蓝灯条目
        // 如果未提供 runId，创建通用的绿灯条目
        const isRunSpecific = !!runId
        
        const entryName = isRunSpecific 
          ? `[Club:${clubData.id}:${runId}] ${clubData.name}`
          : `[Club:${clubData.id}] ${clubData.name}`
        
        // 确定策略类型：
        // 1. 学生会 (student_council) 始终为常驻 (constant/蓝灯)
        // 2. 指定了 runId (isRunSpecific) 的条目为常驻 (constant/蓝灯)
        // 3. 其他通用初始条目为选择性 (selective/绿灯)
        const isStudentCouncil = clubData.id === 'student_council'
        const strategyType = (isStudentCouncil || isRunSpecific) ? 'constant' : 'selective'
        
        // 确定优先级：
        // 学生会优先级较高 (5)，其他默认为 50
        const order = isStudentCouncil ? 5 : 50

        const newEntry = {
          name: entryName,
          content: formatClubData(clubData),
          key: [clubData.name, clubData.president].filter(k => k),
          strategy: {
            type: strategyType
          },
          position: {
            type: 'before_character_definition',
            order: order
          },
          probability: 100,
          enabled: true,
          recursion: {
            prevent_outgoing: true
          }
        }
        
        newEntries.push(newEntry)
      }
      
      return newEntries
    })
    
    return true
  } catch (e) {
    console.error('[WorldbookParser] Error ensuring club exists:', e)
    return false
  }
}

/**
 * 将玩家从社团移除（更新世界书 - 存档隔离版）
 * @param {string} clubId 社团ID
 * @param {string} playerName 玩家名字
 * @param {Object} clubData 社团数据
 * @param {string} runId 当前存档ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function removePlayerFromClubInWorldbook(clubId, playerName, clubData, runId) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  if (!clubData || !clubData._bookName) {
    console.warn('[WorldbookParser] Invalid club data, missing _bookName')
    return false
  }

  try {
    const bookName = clubData._bookName
    console.log(`[WorldbookParser] Removing ${playerName} from club ${clubId} in run ${runId}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      // 过滤掉当前 RunID 的副本条目
      const specificEntryNamePrefix = `[Club:${clubId}:${runId}]`
      const filteredEntries = entries.filter(e => !e.name || !e.name.startsWith(specificEntryNamePrefix))

      // 找到并启用原始条目
      const updatedEntries = filteredEntries.map(entry => {
        if (entry.name && entry.name.includes(`[Club:${clubId}]`) && !entry.name.includes(`[Club:${clubId}:`)) {
          return {
            ...entry,
            enabled: true,
            strategy: {
              ...entry.strategy,
              type: 'selective' // 恢复绿灯
            }
          }
        }
        return entry
      })

      return updatedEntries
    })

    return true

  } catch (e) {
    console.error('[WorldbookParser] Error removing player from club:', e)
    return false
  }
}

/**
 * 同步社团世界书状态（切换存档时调用）
 * @param {string} currentRunId 当前存档ID
 */
export async function syncClubWorldbookState(currentRunId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return
  }

  try {
    const bookNames = getAllBookNames()

    console.log(`[WorldbookParser] Syncing club state for run ${currentRunId}`)

    for (const name of bookNames) {
      try {
      await window.updateWorldbookWith(name, (entries) => {
        // 第一步：收集本存档激活的社团ID
        const activeClubIds = new Set()
        entries.forEach(entry => {
          const match = entry.name && entry.name.match(/\[Club:(.+?):(.+?)\]/)
          if (match) {
            const clubId = match[1]
            const runId = match[2]
            if (runId === currentRunId) {
              activeClubIds.add(clubId)
            }
          }
        })

        // 第二步：更新所有条目状态
        return entries.map(entry => {
          // 处理带有 RunID 的特定条目
          // 格式: [Club:clubId:runId]
          const specificMatch = entry.name && entry.name.match(/\[Club:([^\]]+):([^\]]+)\]/)
          if (specificMatch) {
            const runId = specificMatch[2]
            // 如果是当前存档的条目，启用；否则禁用
            return {
              ...entry,
              enabled: runId === currentRunId
            }
          }

          // 处理原始条目
          // 格式: [Club:clubId] (且不包含第二个冒号，避免误匹配上面的格式)
          const originalMatch = entry.name && entry.name.match(/\[Club:([^\]:]+)\]/)
          if (originalMatch) {
            const clubId = originalMatch[1]
            // 如果该社团在当前存档有激活副本，则禁用原始条目；否则启用
            const shouldDisable = activeClubIds.has(clubId)
            
            // 学生会始终为常驻 (constant)，其他为选择性 (selective)
            const strategyType = clubId === 'student_council' ? 'constant' : 'selective'
            
            return {
              ...entry,
              enabled: !shouldDisable,
              strategy: {
                ...entry.strategy,
                type: strategyType
              }
            }
          }

          return entry
        })
      })
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible for club sync, skipping:`, e.message || e)
      }
    }
  } catch (e) {
    console.error('[WorldbookParser] Error syncing club state:', e)
  }
}

export function parseClassData(text) {
  const lines = text.split('\n')
  const classData = {}
  
  let currentClassId = null
  let currentClass = null
  let mode = null // 'teachers', 'students', null
  
  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // 1. 识别班级头： "1年A班:{" 或 "**1年A班(测试)**"
    // 提取 "1", "A" 和 后缀
    const classMatch = line.match(/(\d+)年([A-Za-z0-9]+)班(.*?)(?=:|{|$)/)
    if (classMatch) {
      const grade = classMatch[1]
      const classChar = classMatch[2]
      const suffix = classMatch[3] || ''
      currentClassId = `${grade}-${classChar}`
      
      currentClass = {
        name: `${grade}年${classChar}班${suffix}`,
        headTeacher: null,
        teachers: [],
        students: []
      }
      classData[currentClassId] = currentClass
      mode = null
      continue
    }

    if (!currentClass) continue

    // 2. 识别教室ID
    if (line.startsWith('教室:') || line.startsWith('教室ID:')) {
      const classroomValue = line.replace(/^教室(?:ID)?:\s*/, '').trim()
      if (classroomValue && currentClass) {
        currentClass.classroomId = classroomValue
      }
      continue
    }

    // 2b. 识别班主任
    if (line.startsWith('班主任:')) {
      const infoText = line.substring(4).trim()
      const person = parsePersonInfo(infoText, 'teacher')
      if (person) {
        person.role = 'teacher'
        person.classId = currentClassId
        currentClass.headTeacher = person
      }
      continue
    }

    // 3. 切换模式
    if (line.includes('科任教师:')) {
      mode = 'teachers'
      continue
    }
    if (line.includes('学生列表:')) {
      mode = 'students'
      continue
    }
    
    // 4. 解析内容
    if (mode === 'teachers') {
      // 格式： "科目: 姓名 性别 (来源)"
      const colonIndex = line.indexOf(':')
      if (colonIndex > -1) {
        const subject = line.substring(0, colonIndex).trim()
        const infoText = line.substring(colonIndex + 1).trim()
        const person = parsePersonInfo(infoText, 'teacher')
        if (person) {
          person.subject = subject
          person.classId = currentClassId
          currentClass.teachers.push(person)
        }
      }
    } else if (mode === 'students') {
      // 格式： "1. 姓名 性别 (来源)"
      // 忽略 "}}" 等结束符
      if (line.startsWith('}')) continue
      
      const person = parsePersonInfo(line, 'student')
      if (person) {
        person.classId = currentClassId
        currentClass.students.push(person)
      }
    }
  }

  return classData
}

/**
 * 从世界书获取班级数据
 * @returns {Promise<Object|null>} 解析后的班级数据，如果失败返回 null
 */
export async function fetchClassDataFromWorldbook() {
  // 检查环境
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return null
  }

  try {
    // 1. 获取当前角色绑定的世界书
    const bookNames = getAllBookNames()

    console.log('[WorldbookParser] Scanning worldbooks:', bookNames)

    let allClassData = {}

    // 2. 遍历世界书查找数据
    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 检查标题格式： [Class:1-A] ...
        // 忽略 keys，只看标题
        const match = entry.name && entry.name.match(/\[Class:([\w.-]+)\]/)
        
        if (match) {
          console.log('[WorldbookParser] Found class data in entry:', entry.name)
          const parsedData = parseClassData(entry.content)
          if (Object.keys(parsedData).length > 0) {
            allClassData = { ...allClassData, ...parsedData }
          }
        }
      }
    }
    
    if (Object.keys(allClassData).length > 0) {
      return allClassData
    }

  } catch (e) {
    console.error('[WorldbookParser] Error fetching worldbook:', e)
  }

  return null
}

/**
 * 设置玩家班级（修改世界书策略）
 * @param {string} classId 班级ID (如 '1-A')
 */
export async function setPlayerClass(classId) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return

    console.log(`[WorldbookParser] Setting player class to ${classId} in worldbook: ${bookName}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      return entries.map(entry => {
        // 识别标题格式： [Class:1-A] ...
        const match = entry.name.match(/\[Class:([\w.-]+)\]/)
        if (match) {
          const entryClassId = match[1]
          if (entryClassId === classId) {
            // 选中班级：蓝灯 (constant)
            console.log(`[WorldbookParser] Setting entry ${entry.name} to constant`)
            return {
              ...entry,
              strategy: {
                ...entry.strategy,
                type: 'constant'
              }
            }
          } else {
            // 其他班级：绿灯 (selective)
            console.log(`[WorldbookParser] Setting entry ${entry.name} to selective`)
            return {
              ...entry,
              strategy: {
                ...entry.strategy,
                type: 'selective'
              }
            }
          }
        }
        return entry
      })
    })

  } catch (e) {
    console.error('[WorldbookParser] Error setting player class:', e)
  }
}

// 格式化人员信息
function formatPerson(p, includeAcademic = true) {
  const gender = p.gender === 'female' ? '女' : '男'
  let text = `${p.name} ${gender} (${p.origin})`
  
  // 添加选课偏好标签
  if (p.electivePreference) {
    text += `[${p.electivePreference}]`
  }
  
  // 添加日程模板标签
  if (p.scheduleTag) {
    text += `[${p.scheduleTag}]`
  }
  
  // 添加学力档案标签 [academic:level/potential:trait1,trait2]
  if (includeAcademic && p.academicProfile) {
    const ap = p.academicProfile
    // 如果已经是字符串格式（从世界书解析的原始值），直接使用
    if (typeof ap === 'string') {
      text += `[academic:${ap}]`
    } else if (ap.level || ap.potential || (ap.traits && ap.traits.length > 0)) {
      const level = ap.level || 'avg'
      const potential = ap.potential || 'medium'
      const traits = (ap.traits && ap.traits.length > 0) ? ':' + ap.traits.join(',') : ''
      text += `[academic:${level}/${potential}${traits}]`
    }
  }

  // 添加备注标签
  if (p.notes) {
    text += `[note:${p.notes}]`
  }

  return text
}

// 将班级数据格式化为文本
function formatClassData(data, excludeAcademic = false) {
  let text = `${data.name}:{\n`
  
  // 教室ID
  if (data.classroomId) {
    text += `  教室: ${data.classroomId}\n`
  }
  
  // 班主任
  if (data.headTeacher && data.headTeacher.name) {
    text += `  班主任: ${formatPerson(data.headTeacher, !excludeAcademic)}\n`
  }
  
  // 科任教师
  if (data.teachers && data.teachers.length > 0) {
    text += `  科任教师: {\n`
    data.teachers.forEach(t => {
      if (t.name) {
        text += `    ${t.subject}: ${formatPerson(t, !excludeAcademic)}\n`
      }
    })
    text += `  }\n`
  }
  
  // 学生列表
  if (data.students && data.students.length > 0) {
    text += `  学生列表: {\n`
    data.students.forEach((s, i) => {
      if (s.name) {
        text += `    ${i + 1}. ${formatPerson(s, !excludeAcademic)}\n`
      }
    })
    text += `  }\n`
  }
  
  text += `}`
  return text
}

/**
 * 删除世界书中的班级条目
 * @param {string} classId 班级ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteClassDataFromWorldbook(classId) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return false

    console.log(`[WorldbookParser] Deleting class ${classId} from worldbook: ${bookName}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      // 过滤掉匹配 [Class:classId] 的条目
      return entries.filter(entry => {
        const match = entry.name && entry.name.match(/\[Class:([\w.-]+)\]/)
        if (match && match[1] === classId) {
          console.log(`[WorldbookParser] Removing entry: ${entry.name}`)
          return false // 移除该条目
        }
        return true // 保留其他条目
      })
    })
    
    return true

  } catch (e) {
    console.error('[WorldbookParser] Error deleting class data:', e)
    return false
  }
}

/**
 * 更新世界书中的班级数据
 * @param {string} classId 班级ID
 * @param {Object} classData 班级数据对象
 * @param {boolean} excludeAcademic 是否排除学力数据（默认false）
 * @returns {Promise<boolean>} 是否成功
 */
export async function updateClassDataInWorldbook(classId, classData, excludeAcademic = false) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return false

    console.log(`[WorldbookParser] Updating class ${classId} in worldbook: ${bookName}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      // 查找现有条目
      const index = newEntries.findIndex(entry => {
        const match = entry.name && entry.name.match(/\[Class:([\w.-]+)\]/)
        return match && match[1] === classId
      })

      if (index !== -1) {
        // 更新现有条目 - 同时更新 key 确保角色名可触发
        console.log(`[WorldbookParser] Updating content and keys for entry ${newEntries[index].name}`)
        const names = extractNamesFromClassData(classData)
        if (!names.includes(classId)) names.push(classId)
        if (classData.name && !names.includes(classData.name)) names.push(classData.name)
        newEntries[index] = {
          ...newEntries[index],
          content: formatClassData(classData, excludeAcademic),
          key: names
        }
      } else {
        // 创建新条目
        console.log(`[WorldbookParser] Creating new entry for class ${classId}`)
        
        // 提取关键词
        const names = extractNamesFromClassData(classData)
        // 确保班级ID也在关键词中
        if (!names.includes(classId)) names.push(classId)
        
        newEntries.push({
          name: `[Class:${classId}] ${classData.name || classId}`,
          content: formatClassData(classData, excludeAcademic),
          key: names,
          strategy: {
            type: 'selective',
            keys: names,
            keys_secondary: { logic: 'and_any', keys: [] },
            scan_depth: 'same_as_global'
          },
          position: {
            type: 'before_character_definition',
            order: 10
          },
          probability: 100,
          enabled: true,
          recursion: {
            prevent_outgoing: true
          },
          effect: {
            sticky: null,
            cooldown: null,
            delay: null
          }
        })
      }
      return newEntries
    })
    
    return true

  } catch (e) {
    console.error('[WorldbookParser] Error updating class data:', e)
    return false
  }
}

/**
 * 解析地图数据
 * @param {string} text 
 * @returns {Array} 地图数据数组
 */
export function parseMapData(text) {
  const lines = text.split('\n')
  const mapData = []
  let currentEntry = null

  const keyMap = {
    'ID': 'id',
    '名称': 'name',
    '类型': 'type',
    '父级ID': 'parentId',
    '楼层': 'floor',
    '开放时间': 'openTime',
    '解锁条件': 'unlockCondition',
    '描述': 'desc',
    '兼职岗位': 'partTimeJob',
    '标签': 'tags'
  }

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    // 检查是否是新条目开始 (ID|...)
    if (line.startsWith('ID|')) {
      if (currentEntry && currentEntry.id) {
        mapData.push(currentEntry)
      }
      currentEntry = {}
    }

    if (!currentEntry) continue

    const separatorIndex = line.indexOf('|')
    if (separatorIndex === -1) continue

    const key = line.substring(0, separatorIndex).trim()
    const value = line.substring(separatorIndex + 1).trim()

    if (key === '网格坐标') {
      const [x, y] = value.split(',').map(Number)
      if (!currentEntry.grid) currentEntry.grid = {}
      currentEntry.grid.x = x
      currentEntry.grid.y = y
    } else if (key === '网格尺寸') {
      const [w, h] = value.split(',').map(Number)
      if (!currentEntry.grid) currentEntry.grid = {}
      currentEntry.grid.w = w
      currentEntry.grid.h = h
    } else if (keyMap[key]) {
      const mappedKey = keyMap[key]
      if (mappedKey === 'parentId') {
        currentEntry.parentId = value === 'null' ? null : value
      } else if (mappedKey === 'floor') {
        currentEntry.floor = Number(value)
      } else if (mappedKey === 'partTimeJob') {
        try {
          currentEntry.partTimeJob = JSON.parse(value)
        } catch (e) {
          console.warn('Failed to parse partTimeJob JSON:', value)
        }
      } else if (mappedKey === 'tags') {
        currentEntry.tags = value ? value.split(',').map(t => t.trim()).filter(t => t) : []
      } else {
        currentEntry[mappedKey] = value
      }
    }
  }

  // 添加最后一个条目
  if (currentEntry && currentEntry.id) {
    mapData.push(currentEntry)
  }

  return mapData
}

/**
 * 从世界书获取地图数据
 * @returns {Promise<Array|null>} 解析后的地图数据，如果失败返回 null
 */
export async function fetchMapDataFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return null
  }

  try {
    const bookNames = getAllBookNames()

    console.log('[WorldbookParser] Scanning worldbooks for map data:', bookNames)

    let allMapData = []

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 识别地图数据：名称包含 [MapData]
        if (entry.name && entry.name.includes('[MapData]')) {
          console.log('[WorldbookParser] Found map data in entry:', entry.name)
          const parsedData = parseMapData(entry.content)
          if (parsedData.length > 0) {
            allMapData = [...allMapData, ...parsedData]
          }
        }
      }
    }
    
    if (allMapData.length > 0) {
      // 去重，后加载的覆盖先加载的
      const uniqueMapData = []
      const idMap = new Map()
      
      allMapData.forEach(item => {
        if (idMap.has(item.id)) {
          // 替换旧的
          const index = idMap.get(item.id)
          uniqueMapData[index] = item
        } else {
          uniqueMapData.push(item)
          idMap.set(item.id, uniqueMapData.length - 1)
        }
      })
      
      return uniqueMapData
    }

  } catch (e) {
    console.error('[WorldbookParser] Error fetching map data:', e)
  }

  return null
}

// ==================== 智能 Key 注入与地图优化 ====================

/**
 * 从班级数据中提取所有相关人名和班级名
 * @param {Object} classData 解析后的班级数据
 * @returns {string[]} 名字列表
 */
function extractNamesFromClassData(classData) {
  const names = new Set()
  
  // 班级名 (如 1-A, 1年A班)
  // classData 结构: { '1-A': { name: '1年A班', ... } }
  // 这里传入的是单个班级对象的值，还是整个对象？
  // parseClassData 返回的是 { '1-A': {...} }
  // 但我们在 injectSmartKeysToWorldbook 中会遍历条目并解析，所以这里假设传入的是单个班级对象
  
  if (classData.name) names.add(classData.name)
  
  // 班主任
  if (classData.headTeacher && classData.headTeacher.name) {
    names.add(classData.headTeacher.name)
  }
  
  // 科任教师
  if (classData.teachers) {
    classData.teachers.forEach(t => {
      if (t.name) names.add(t.name)
    })
  }
  
  // 学生
  if (classData.students) {
    classData.students.forEach(s => {
      if (s.name) names.add(s.name)
    })
  }
  
  return Array.from(names)
}

/**
 * 从社团数据中提取所有相关人名和社团名
 * @param {Object} clubData 解析后的社团数据
 * @returns {string[]} 名字列表
 */
function extractNamesFromClubData(clubData) {
  const names = new Set()
  
  if (clubData.name) names.add(clubData.name)
  if (clubData.advisor) names.add(clubData.advisor)
  if (clubData.president) names.add(clubData.president)
  if (clubData.vicePresident) names.add(clubData.vicePresident)
  
  if (clubData.members) {
    clubData.members.forEach(m => {
      if (m) names.add(m)
    })
  }
  
  return Array.from(names)
}

/**
 * 智能注入关键词到世界书条目
 * 扫描班级和社团条目，自动将成员名字添加到 Key 中
 */
export async function injectSmartKeysToWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available for smart key injection')
    return
  }

  try {
    const bookNames = getAllBookNames()

    console.log('[WorldbookParser] Starting smart key injection...')

    for (const name of bookNames) {
      await window.updateWorldbookWith(name, (entries) => {
        return entries.map(entry => {
          let newKeys = []
          let shouldUpdate = false
          
          // 1. 处理班级条目
          const classMatch = entry.name && entry.name.match(/\[Class:([\w.-]+)\]/)
          if (classMatch) {
            const classId = classMatch[1]
            const parsedData = parseClassData(entry.content)
            const classObj = parsedData[classId]
            
            if (classObj) {
              const extractedNames = extractNamesFromClassData(classObj)
              // 添加班级ID本身 (如 1-A)
              extractedNames.push(classId)
              
              newKeys = [...extractedNames]
              shouldUpdate = true
            }
          }
          
          // 2. 处理社团条目
          const clubMatch = entry.name && entry.name.match(/\[Club:(.+?)\]/)
          if (clubMatch) {
            const clubData = parseClubData(entry.content)
            if (clubData.id) {
              const extractedNames = extractNamesFromClubData(clubData)
              newKeys = [...extractedNames]
              shouldUpdate = true
            }
          }

          if (shouldUpdate) {
            // 获取现有 Keys
            let currentKeys = entry.key || []
            if (typeof currentKeys === 'string') {
              currentKeys = currentKeys.split(',').map(k => k.trim()).filter(k => k)
            }
            
            // 合并并去重
            const combinedKeys = new Set(currentKeys)
            newKeys.forEach(k => combinedKeys.add(k))
            
            // 只有当 Keys 数量增加时才更新，避免无效写入
            if (combinedKeys.size > currentKeys.length) {
              console.log(`[WorldbookParser] Injecting keys for ${entry.name}:`, Array.from(combinedKeys))
              return {
                ...entry,
                key: Array.from(combinedKeys)
              }
            }
          }
          
          return entry
        })
      })
    }
    console.log('[WorldbookParser] Smart key injection completed.')

  } catch (e) {
    console.error('[WorldbookParser] Error injecting smart keys:', e)
  }
}

/**
 * 递归生成紧凑的地图字符串
 * 格式: 类型|名称|描述|子地点[子内容...]
 * @param {Object} node 当前节点
 * @param {Map} childrenMap 子节点映射表
 * @returns {string}
 */
function generateCompactMapString(node, childrenMap, forceDetail = false) {
  // 检查是否是主要游玩城市（天华市），如果是，则该节点及其子节点保留详情
  const isTargetCity = node.name === '天华市'
  const shouldKeepDetail = forceDetail || isTargetCity

  let str = `${node.type || ''}|${node.name || ''}`
  
  // 只有在需要保留详情时才添加描述
  if (shouldKeepDetail && node.desc) {
    str += `|${node.desc}`
  }
  
  if (node.openTime) {
    str += `|开放时间:${node.openTime}`
  }
  
  if (node.unlockCondition) {
    str += `|解锁条件:${node.unlockCondition}`
  }
  
  const children = childrenMap.get(node.id)
  if (children && children.length > 0) {
    str += '|子地点['
    children.forEach(child => {
      // 传递保留详情的状态给子节点
      str += generateCompactMapString(child, childrenMap, shouldKeepDetail)
    })
    str += ']'
  } else {
    str += '|子地点[]'
  }
  
  return str
}

/**
 * 更新紧凑地图条目
 * 读取 [MapData] 条目，生成给 AI 看的紧凑格式条目
 */
export async function updateCompactMapEntry() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available for map optimization')
    return
  }

  try {
    // 1. 获取所有地图数据
    const mapDataList = await fetchMapDataFromWorldbook()
    if (!mapDataList || mapDataList.length === 0) return

    // 2. 构建树状结构
    const childrenMap = new Map()
    const rootNodes = []
    
    mapDataList.forEach(node => {
      if (node.parentId && node.parentId !== 'null') {
        if (!childrenMap.has(node.parentId)) {
          childrenMap.set(node.parentId, [])
        }
        childrenMap.get(node.parentId).push(node)
      } else {
        rootNodes.push(node)
      }
    })

    // 3. 生成紧凑字符串
    let compactContent = ''
    rootNodes.forEach(root => {
      compactContent += generateCompactMapString(root, childrenMap)
    })

    // 4. 创建或更新世界书条目
    const bookName = getCurrentBookName()

    if (!bookName) return

    console.log('[WorldbookParser] Updating compact map entry...')

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      const targetName = '地点列表'
      
      const existingIndex = newEntries.findIndex(e => e.name === targetName)
      
      const mapEntry = {
        name: targetName,
        content: compactContent,
        key: [], // 不需要 key，因为是 constant
        strategy: {
          type: 'constant' // 蓝灯
        },
        position: {
          type: 'before_character_definition',
          order: 4
        },
        probability: 100,
        enabled: true,
        recursion: {
          prevent_outgoing: true
        }
      }

      if (existingIndex !== -1) {
        // 更新现有条目
        newEntries[existingIndex] = {
          ...newEntries[existingIndex],
          ...mapEntry
        }
      } else {
        // 创建新条目
        // 确保 ID 唯一，虽然 updateWorldbookWith 通常处理这个，但为了安全起见让系统生成
        newEntries.push(mapEntry)
      }

      return newEntries
    })
    
    console.log('[WorldbookParser] Compact map entry updated.')

  } catch (e) {
    console.error('[WorldbookParser] Error updating compact map entry:', e)
  }
}

// ==================== 默认角色备份世界书 ====================

const DEFAULT_ROSTER_BACKUP_WORLDBOOK_NAME = '天华校园-默认角色备份'

/**
 * 创建或更新默认角色备份世界书
 * 该世界书 enabled=false，用于保存所有角色的原始数据
 * @param {Object} allClassData 所有班级数据
 * @param {Array} unassignedCharacters 未分配班级的角色列表
 * @returns {Promise<boolean>} 是否成功
 */
export async function createDefaultRosterBackupWorldbook(allClassData, unassignedCharacters = []) {
  if (typeof window.createOrReplaceWorldbook !== 'function') {
    console.warn('[WorldbookParser] createOrReplaceWorldbook API not available')
    return false
  }

  try {
    console.log('[WorldbookParser] Creating/updating default roster backup worldbook...')
    
    const entries = []
    
    // 为每个班级创建一个条目
    for (const [classId, classInfo] of Object.entries(allClassData)) {
      const content = formatClassData(classInfo)
      entries.push({
        name: `[BackupClass:${classId}] ${classInfo.name || classId}`,
        content: content,
        enabled: false,
        strategy: {
          type: 'selective',
          keys: [],
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'before_character_definition',
          order: 100
        },
        probability: 100,
        recursion: {
          prevent_incoming: true,
          prevent_outgoing: true,
          delay_until: null
        },
        effect: {
          sticky: null,
          cooldown: null,
          delay: null
        }
      })
    }

    // 处理未分配角色
    if (unassignedCharacters && unassignedCharacters.length > 0) {
      const teachers = unassignedCharacters.filter(c => c.role === 'teacher')
      const students = unassignedCharacters.filter(c => c.role !== 'teacher')
      
      let unassignedContent = '未分配角色:{\n'
      
      if (teachers.length > 0) {
        unassignedContent += '  科任教师: {\n'
        teachers.forEach(t => {
          const subject = t.subject || '待定'
          unassignedContent += `    ${subject}: ${formatPerson(t)}\n`
        })
        unassignedContent += '  }\n'
      }
      
      if (students.length > 0) {
        unassignedContent += '  学生列表: {\n'
        students.forEach((s, i) => {
          unassignedContent += `    ${i + 1}. ${formatPerson(s)}\n`
        })
        unassignedContent += '  }\n'
      }
      unassignedContent += '}'
      
      entries.push({
        name: '[Backup:Unassigned] 未分配角色',
        content: unassignedContent,
        enabled: false, // 关键：默认不启用
        strategy: {
          type: 'selective',
          keys: [],
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'before_character_definition',
          order: 100
        },
        probability: 100,
        recursion: {
          prevent_incoming: true,
          prevent_outgoing: true,
          delay_until: null
        },
        effect: {
          sticky: null,
          cooldown: null,
          delay: null
        }
      })
    }
    
    // 添加一个元数据条目
    entries.push({
      name: '[RosterBackupMeta]',
      content: JSON.stringify({
        createdAt: Date.now(),
        classCount: Object.keys(allClassData).length,
        totalStudents: Object.values(allClassData).reduce((sum, c) => sum + (c.students?.length || 0), 0),
        totalTeachers: Object.values(allClassData).reduce((sum, c) => sum + (c.teachers?.length || 0) + (c.headTeacher?.name ? 1 : 0), 0),
        unassignedCount: unassignedCharacters.length
      }),
      enabled: false,
      strategy: {
        type: 'selective',
        keys: [],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global'
      },
      position: {
        type: 'before_character_definition',
        order: 100
      },
      probability: 100,
      recursion: {
        prevent_incoming: true,
        prevent_outgoing: true,
        delay_until: null
      },
      effect: {
        sticky: null,
        cooldown: null,
        delay: null
      }
    })
    
    await window.createOrReplaceWorldbook(DEFAULT_ROSTER_BACKUP_WORLDBOOK_NAME, entries, { render: 'none' })
    console.log(`[WorldbookParser] Default roster backup worldbook created with ${entries.length} entries`)
    return true
    
  } catch (e) {
    console.error('[WorldbookParser] Error creating default roster backup worldbook:', e)
    return false
  }
}

/**
 * 从备份世界书恢复所有角色数据
 * @returns {Promise<Object|null>} 恢复的班级数据，失败返回 null
 */
export async function restoreFromBackupWorldbook() {
  if (typeof window.getWorldbook !== 'function') {
    console.warn('[WorldbookParser] getWorldbook API not available')
    return null
  }

  try {
    console.log('[WorldbookParser] Restoring from backup worldbook...')
    const entries = await window.getWorldbook(DEFAULT_ROSTER_BACKUP_WORLDBOOK_NAME)
    
    if (!entries || !Array.isArray(entries)) {
      console.warn('[WorldbookParser] Backup worldbook not found or empty')
      return null
    }
    
    const allClassData = {}
    let unassignedCharacters = []
    
    for (const entry of entries) {
      // 匹配班级
      const match = entry.name && entry.name.match(/\[BackupClass:([\w.-]+)\]/)
      if (match) {
        const classId = match[1]
        const parsedData = parseClassData(entry.content)
        if (parsedData[classId]) {
          allClassData[classId] = parsedData[classId]
        }
      }
      
      // 匹配未分配角色
      if (entry.name === '[Backup:Unassigned] 未分配角色') {
        const parsedData = parseClassData(entry.content)
        // parseClassData 会返回以 "未分配角色" (或其他名字) 为 key 的对象
        // 我们取第一个 value
        const data = Object.values(parsedData)[0]
        if (data) {
          if (data.teachers) unassignedCharacters.push(...data.teachers)
          if (data.students) unassignedCharacters.push(...data.students)
        }
      }
    }
    
    if (Object.keys(allClassData).length > 0 || unassignedCharacters.length > 0) {
      console.log(`[WorldbookParser] Restored ${Object.keys(allClassData).length} classes and ${unassignedCharacters.length} unassigned characters`)
      // 将未分配角色挂载到返回对象上
      allClassData._unassigned = unassignedCharacters
      return allClassData
    }
    
    return null
    
  } catch (e) {
    console.error('[WorldbookParser] Error restoring from backup worldbook:', e)
    return null
  }
}

/**
 * 检查备份世界书是否存在
 * @returns {Promise<boolean>}
 */
export async function hasBackupWorldbook() {
  if (typeof window.getWorldbookNames !== 'function') return false
  try {
    const names = window.getWorldbookNames()
    return names.includes(DEFAULT_ROSTER_BACKUP_WORLDBOOK_NAME)
  } catch (e) {
    return false
  }
}

/**
 * 执行所有世界书优化操作
 * 建议在游戏初始化时调用
 * @param {Object} socialData 社交数据 { playerName, friends, groups, runId }
 */
export async function optimizeWorldbook(socialData) {
  console.log('[WorldbookParser] Starting worldbook optimization...')
  await injectSmartKeysToWorldbook()
  await updateCompactMapEntry()
  
  // Note: Social network entry update removed to avoid conflict with socialWorldbook.js
  
  console.log('[WorldbookParser] Worldbook optimization finished.')
}

/**
 * 同步班级世界书条目状态（切换存档/回溯时调用）
 * 根据当前 allClassData 中的班级ID，启用对应的 runId 条目或原始条目
 * @param {string} currentRunId 当前存档ID
 * @param {Object} allClassData 当前存档的班级数据 { '1-A': {...}, '2-A': {...}, ... }
 */
/**
 * 设置教师模式下的班级世界书条目（存档隔离）
 * @param {string[]} teachingClasses 教授的班级ID列表
 * @param {string|null} homeroomClassId 担任班主任的班级ID
 * @param {string} playerName 玩家姓名
 * @param {string} runId 当前存档ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function setupTeacherClassEntries(teachingClasses, homeroomClassId, playerName, runId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return false
  }

  try {
    const bookName = getCurrentBookName()
    if (!bookName) return false

    console.log(`[WorldbookParser] Setting up teacher class entries for run ${runId}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]

      // 遍历所有教学班级
      for (const classId of teachingClasses) {
        // 查找原始班级条目
        // 格式: [Class:classId] (且不包含第二个冒号)
        const originalEntry = newEntries.find(e => 
          e.name && e.name.includes(`[Class:${classId}]`) && !e.name.match(/\[Class:[\w.-]+:[\w.-]+\]/)
        )

        if (!originalEntry) {
          console.warn(`[WorldbookParser] Original entry for class ${classId} not found`)
          continue
        }

        // 解析原始数据
        const classData = parseClassData(originalEntry.content)[classId]
        if (!classData) continue

        // 如果是班主任班级，替换班主任名字
        if (classId === homeroomClassId) {
          classData.headTeacher = {
            name: playerName,
            gender: 'unknown', // 玩家性别在别处定义，这里暂且 unknown
            origin: '玩家',
            role: 'teacher',
            classId: classId
          }
        }

        // 创建带 RunID 的新条目
        const newEntryName = `[Class:${classId}:${runId}] ${classData.name || classId}`
        
        // 提取关键词 (包含新班主任名字)
        const names = extractNamesFromClassData(classData)
        if (!names.includes(classId)) names.push(classId)
        if (classData.name && !names.includes(classData.name)) names.push(classData.name)

        // 教师教授的所有班级都设为常驻 (蓝灯)
        const strategyType = 'constant'

        const newEntry = {
          ...originalEntry,
          id: undefined, // 清除ID让系统生成
          name: newEntryName,
          content: formatClassData(classData),
          key: names,
          strategy: {
            ...originalEntry.strategy,
            type: strategyType,
            keys: names,
            scan_depth: 'same_as_global'
          },
          enabled: true
        }

        // 检查是否已存在该 RunID 的条目 (避免重复添加)
        const existingRunIndex = newEntries.findIndex(e => e.name === newEntryName)
        if (existingRunIndex !== -1) {
          newEntries[existingRunIndex] = newEntry
        } else {
          newEntries.push(newEntry)
        }

        // 禁用原始条目
        if (originalEntry) {
          const originalIndex = newEntries.findIndex(e => e.name === originalEntry.name)
          if (originalIndex !== -1) {
            newEntries[originalIndex] = {
              ...newEntries[originalIndex],
              enabled: false
            }
          }
        }
      }

      return newEntries
    })

    return true
  } catch (e) {
    console.error('[WorldbookParser] Error setting up teacher class entries:', e)
    return false
  }
}

export async function syncClassWorldbookState(currentRunId, allClassData) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return
  }

  try {
    const bookNames = getAllBookNames()

    // 当前存档中实际存在的班级ID集合
    const currentClassIds = new Set(Object.keys(allClassData || {}))

    console.log(`[WorldbookParser] Syncing class state for run ${currentRunId}, classes:`, Array.from(currentClassIds))

    for (const name of bookNames) {
      try {
      await window.updateWorldbookWith(name, (entries) => {
        // 第一步：收集本存档激活的班级条目（带 runId 的）
        const activeRunClassIds = new Set()
        entries.forEach(entry => {
          const match = entry.name && entry.name.match(/\[Class:([\w.-]+):([\w.-]+)\]/)
          if (match) {
            const classId = match[1]
            const runId = match[2]
            if (runId === currentRunId) {
              activeRunClassIds.add(classId)
            }
          }
        })

        // 第二步：更新所有班级条目状态
        return entries.map(entry => {
          // 处理带 RunID 的特定条目
          // 格式: [Class:classId:runId]
          const specificMatch = entry.name && entry.name.match(/\[Class:([\w.-]+):([\w.-]+)\]/)
          if (specificMatch) {
            const classId = specificMatch[1]
            const runId = specificMatch[2]
            
            if (runId === currentRunId) {
              // 当前存档的条目：启用 (前提是该班级依然相关)
              // 这里简化为：只要是当前存档生成的 runId 条目，就启用 (enabled: true)
              // 具体的 constant/selective 策略在生成时已经设定好，或者在这里不做修改
              return {
                ...entry,
                enabled: true
              }
            } else {
              // 其他存档的条目，一律禁用
              return {
                ...entry,
                enabled: false
              }
            }
          }

          // 处理原始条目（不带 runId）
          // 格式: [Class:classId] (且不包含第二个冒号)
          const originalMatch = entry.name && entry.name.match(/\[Class:([\w.-]+)\]/)
          if (originalMatch && !entry.name.match(/\[Class:[\w.-]+:[\w.-]+\]/)) {
            const classId = originalMatch[1]
            
            // 如果该班级在当前存档有带 runId 的副本，则禁用原始条目
            // 注意：activeRunClassIds 只包含当前存档 (currentRunId) 的副本
            // 如果切换到其他存档，activeRunClassIds 会变为空（或变为那个存档的副本），
            // 从而使 hasActiveRunCopy 为 false，进而重新启用原始条目。
            const hasActiveRunCopy = activeRunClassIds.has(classId)
            
            if (hasActiveRunCopy) {
              // 有活跃的 runId 副本 → 禁用原始条目
              return {
                ...entry,
                enabled: false
              }
            } else {
              // 没有活跃的 runId 副本 → 启用原始条目
              // (假设原始条目是默认启用的，如果之前被禁用了这里会恢复)
              return {
                ...entry,
                enabled: true
              }
            }
          }

          return entry
        })
      })
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible for class sync, skipping:`, e.message || e)
      }
    }

    console.log(`[WorldbookParser] Class worldbook state synced for run ${currentRunId}`)
  } catch (e) {
    console.error('[WorldbookParser] Error syncing class worldbook state:', e)
  }
}

/**
 * 为进级后的班级创建带 runId 的世界书条目副本
 * 原始条目将被禁用，新条目包含更新后的班级数据
 * @param {string} classId 新的班级ID（如 '2-A'，升级后的）
 * @param {Object} classData 更新后的班级数据
 * @param {string} runId 当前存档ID
 * @param {string|null} playerClassId 玩家所在班级ID（用于设置蓝灯/绿灯）
 * @returns {Promise<boolean>} 是否成功
 */
export async function createRunSpecificClassEntry(classId, classData, runId, playerClassId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return false
  }

  try {
    const bookName = getCurrentBookName()
    if (!bookName) return false

    console.log(`[WorldbookParser] Creating run-specific class entry [Class:${classId}:${runId}]`)

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]

      // 检查是否已存在该 runId 的条目
      const existingRunIndex = newEntries.findIndex(e => 
        e.name && e.name.includes(`[Class:${classId}:${runId}]`)
      )

      // 提取关键词
      const names = extractNamesFromClassData(classData)
      if (!names.includes(classId)) names.push(classId)
      if (classData.name && !names.includes(classData.name)) names.push(classData.name)

      // 是否是玩家班级
      const isPlayerClass = classId === playerClassId
      const strategyType = isPlayerClass ? 'constant' : 'selective'

      const content = formatClassData(classData, true)
      const entryName = `[Class:${classId}:${runId}] ${classData.name || classId}`

      if (existingRunIndex !== -1) {
        // 更新已有的 runId 条目
        newEntries[existingRunIndex] = {
          ...newEntries[existingRunIndex],
          name: entryName,
          content: content,
          key: names,
          strategy: {
            ...newEntries[existingRunIndex].strategy,
            type: strategyType
          },
          enabled: true
        }
      } else {
        // 创建新的 runId 条目
        const newEntry = {
          name: entryName,
          content: content,
          key: names,
          strategy: {
            type: strategyType,
            keys: names,
            keys_secondary: { logic: 'and_any', keys: [] },
            scan_depth: 'same_as_global'
          },
          position: {
            type: 'before_character_definition',
            order: 10
          },
          probability: 100,
          enabled: true,
          recursion: {
            prevent_outgoing: true
          }
        }
        newEntries.push(newEntry)
      }

      // 禁用该班级ID的原始条目（不带 runId 的）
      for (let i = 0; i < newEntries.length; i++) {
        const match = newEntries[i].name && newEntries[i].name.match(/\[Class:([\w.-]+)\]/)
        if (match && !newEntries[i].name.match(/\[Class:[\w.-]+:[\w.-]+\]/) && match[1] === classId) {
          newEntries[i] = {
            ...newEntries[i],
            enabled: false
          }
        }
      }

      return newEntries
    })

    return true
  } catch (e) {
    console.error('[WorldbookParser] Error creating run-specific class entry:', e)
    return false
  }
}

/**
 * 设置 [变量解析] 条目的启用状态
 * 遍历所有绑定的世界书，查找名为 [变量解析] 的条目并更新其状态
 * @param {boolean} enabled 是否启用
 */
export async function setVariableParsingWorldbookStatus(enabled) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return
  }

  try {
    const bookNames = getAllBookNames()

    const targetEntryName = '[变量解析]'
    let found = false

    for (const bookName of bookNames) {
      // 先检查该世界书是否包含目标条目
      let entries
      try {
        entries = await window.getWorldbook(bookName)
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${bookName}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      const hasTarget = entries.some(e => e.name === targetEntryName)
      
      if (hasTarget) {
        console.log(`[WorldbookParser] Found ${targetEntryName} in ${bookName}, setting status to ${enabled ? 'enabled' : 'disabled'}`)
        
        await window.updateWorldbookWith(bookName, (currentEntries) => {
          return currentEntries.map(entry => {
            if (entry.name === targetEntryName) {
              return {
                ...entry,
                enabled: enabled
              }
            }
            return entry
          })
        })
        found = true
      }
    }

    if (!found) {
      console.log(`[WorldbookParser] Entry ${targetEntryName} not found in any bound worldbook.`)
    }

  } catch (e) {
    console.error('[WorldbookParser] Error setting variable parsing entry status:', e)
  }
}

/**
 * 将地图数据项格式化为字符串
 * @param {Object} item 地图数据对象
 * @returns {string} 格式化后的字符串
 */
function formatMapItem(item) {
  let text = `ID|${item.id}\n`
  text += `名称|${item.name || ''}\n`
  text += `类型|${item.type || '地点'}\n`
  text += `父级ID|${item.parentId || 'null'}\n`
  
  if (item.grid) {
    text += `网格坐标|${item.grid.x},${item.grid.y}\n`
    text += `网格尺寸|${item.grid.w},${item.grid.h}\n`
  }
  
  if (item.floor !== undefined) text += `楼层|${item.floor}\n`
  if (item.openTime) text += `开放时间|${item.openTime}\n`
  if (item.unlockCondition) text += `解锁条件|${item.unlockCondition}\n`
  if (item.desc) text += `描述|${item.desc}\n`
  if (item.tags && item.tags.length > 0) text += `标签|${item.tags.join(',')}\n`
  if (item.partTimeJob) {
    text += `兼职岗位|${JSON.stringify(item.partTimeJob)}\n`
  }
  
  return text
}

/**
 * 保存地图数据到世界书
 * @param {Array} mapDataList 地图数据数组
 */
/**
 * 更新教职工名册到世界书
 * @param {Array} staffList 职工列表
 * @param {string} runId 当前存档ID
 */
export async function updateStaffRosterInWorldbook(staffList, runId) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available for staff roster')
    return false
  }

  try {
    const bookName = getCurrentBookName()

    if (!bookName) return false

    console.log(`[WorldbookParser] Updating staff roster in worldbook: ${bookName}`)

    // 格式化内容
    let content = '[天华学园教职工名册]\n'
    
    // 按工作地点分组
    const groups = {}
    staffList.forEach(staff => {
      const location = staff.workplace || '未知地点'
      if (!groups[location]) groups[location] = []
      groups[location].push(staff)
    })
    
    for (const [location, staffs] of Object.entries(groups)) {
      const staffStr = staffs.map(s => {
        let str = s.name
        if (s.staffTitle) str += `(${s.staffTitle})`
        return str
      }).join('、')
      content += `${location} - ${staffStr}\n`
    }

    const entryName = `[TH_StaffRoster] 教职工名册`
    
    // 提取所有职工名字作为关键词
    const keys = staffList.map(s => s.name)
    keys.push('教职工', '职工', '校工')

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      const index = newEntries.findIndex(e => e.name === entryName)
      
      const entry = {
        name: entryName,
        content: content,
        key: keys,
        strategy: {
          type: 'constant', // 蓝灯
          keys: keys,
          keys_secondary: { logic: 'and_any', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'before_character_definition',
          order: 5 // 权重较高
        },
        probability: 100,
        enabled: true,
        recursion: {
          prevent_outgoing: true
        }
      }

      if (index !== -1) {
        newEntries[index] = { ...newEntries[index], ...entry }
      } else {
        newEntries.push(entry)
      }
      
      return newEntries
    })
    
    console.log('[WorldbookParser] Staff roster updated')
    return true

  } catch (e) {
    console.error('[WorldbookParser] Error updating staff roster:', e)
    return false
  }
}

export async function saveMapDataToWorldbook(mapDataList) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available for saving map')
    return false
  }

  try {
    const bookNames = getAllBookNames()

    console.log('[WorldbookParser] Saving map data to worldbook...')

    // 将所有条目合并为一个大文本字符串
    const content = mapDataList.map(item => formatMapItem(item)).join('\n\n')

    for (const name of bookNames) {
      // 检查该世界书是否包含 [MapData] 条目
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[WorldbookParser] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue
      
      const mapEntryIndex = entries.findIndex(e => e.name && e.name.includes('[MapData]'))
      
      if (mapEntryIndex !== -1) {
        console.log(`[WorldbookParser] Updating map data in ${name}`)
        await window.updateWorldbookWith(name, (currentEntries) => {
          const newEntries = [...currentEntries]
          newEntries[mapEntryIndex] = {
            ...newEntries[mapEntryIndex],
            content: content
          }
          return newEntries
        })
        return true
      }
    }
    
    console.warn('[WorldbookParser] [MapData] entry not found in any worldbook')
    return false

  } catch (e) {
    console.error('[WorldbookParser] Error saving map data:', e)
    return false
  }
}
