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
  // 性别可能是：男/女/♂/♀
  // 来源可能是：(来源) 或 （来源） 或 《来源》
  const baseRegex = /^(.+?)\s+([男女♂♀])\s*[（(《](.+?)[)）》]/
  const match = text.match(baseRegex)
  
  if (match) {
    let gender = match[2]
    if (gender === '男' || gender === '♂') gender = 'male'
    else if (gender === '女' || gender === '♀') gender = 'female'
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
      if (ELECTIVE_PREFERENCES[content]) {
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
      } else {
        club[mappedKey] = value
      }
    }
  }

  return club
}

/**
 * 从世界书获取所有社团数据
 * @returns {Promise<Object|null>} 解析后的社团数据 { clubId: clubData, ... }
 */
export async function fetchClubDataFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return null
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log('[WorldbookParser] Scanning worldbooks for club data:', bookNames)

    const allClubs = {}

    for (const name of bookNames) {
      const entries = await window.getWorldbook(name)
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 识别社团条目：名称包含 [Club:club_id]
        const match = entry.name && entry.name.match(/\[Club:(.+?)\]/)
        if (match) {
          const clubId = match[1]
          console.log('[WorldbookParser] Found club data in entry:', entry.name)
          const clubData = parseClubData(entry.content)
          if (clubData.id) {
            // 保存原始条目信息以便后续更新
            clubData._entryName = entry.name
            clubData._bookName = name
            clubData._strategy = entry.strategy
            allClubs[clubData.id] = clubData
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
      
      // 如果没有特定 RunID 的条目，找原始条目
      if (targetEntryIndex === -1) {
        targetEntryIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}]`) && !e.name.includes(`[Club:${clubId}:`))
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

      // 如果是原始条目，需要创建 RunID 特定的副本
      if (!targetEntry.name.startsWith(specificEntryNamePrefix)) {
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
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available')
    return null
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookName = books.primary || (books.additional && books.additional[0])
    
    if (!bookName) {
      console.warn('[WorldbookParser] No worldbook available')
      return null
    }

    console.log(`[WorldbookParser] Creating new club ${clubInfo.id} in worldbook: ${bookName}`)

    const club = {
      id: clubInfo.id,
      name: clubInfo.name,
      advisor: '',
      president: clubInfo.president || '',
      vicePresident: '',
      members: clubInfo.president ? [clubInfo.president] : [],
      coreSkill: clubInfo.coreSkill || '',
      activityDay: clubInfo.activityDay || '',
      location: clubInfo.location || '',
      description: clubInfo.description || '',
      _bookName: bookName
    }

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      
      const entryName = `[Club:${clubInfo.id}:${runId}] ${clubInfo.name}`
      
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
      return newEntries
    })

    console.log(`[WorldbookParser] Club ${clubInfo.id} created successfully`)
    return club

  } catch (e) {
    console.error('[WorldbookParser] Error creating club:', e)
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
      const originalEntryIndex = newEntries.findIndex(e => e.name && e.name.includes(`[Club:${clubId}]`) && !e.name.includes(`[Club:${clubId}:`))
      
      if (originalEntryIndex === -1) {
        console.warn(`[WorldbookParser] Original club entry not found for ${clubId}`)
        return entries
      }

      const originalEntry = newEntries[originalEntryIndex]
      const specificEntryName = `[Club:${clubId}:${runId}]` + (originalEntry.name.split(']')[1] || '')
      
      // 检查特定 RunID 的条目是否已存在
      const specificEntryIndex = newEntries.findIndex(e => e.name === specificEntryName)

      // 解析数据
      const currentData = parseClubData(originalEntry.content)
      
      // 添加玩家到部员列表
      if (!currentData.members) currentData.members = []
      if (!currentData.members.includes(playerName)) {
        currentData.members.push(playerName)
      }

      // 更新关键词
      let newKeys = originalEntry.key || []
      if (typeof newKeys === 'string') {
        newKeys = newKeys.split(',').map(k => k.trim())
      }
      if (!newKeys.includes(playerName)) {
        newKeys.push(playerName)
      }

      // 新条目对象
      const newEntry = {
        ...originalEntry,
        id: undefined, // 清除可能存在的内部ID，让系统重新生成
        name: specificEntryName,
        content: formatClubData(currentData),
        key: newKeys,
        strategy: {
          ...originalEntry.strategy,
          type: 'constant' // 蓝灯
        },
        enabled: true
      }

      if (specificEntryIndex !== -1) {
        // 更新现有条目
        newEntries[specificEntryIndex] = { ...newEntries[specificEntryIndex], ...newEntry }
      } else {
        // 添加新条目
        newEntries.push(newEntry)
      }

      // 禁用原始条目
      newEntries[originalEntryIndex] = {
        ...originalEntry,
        enabled: false
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
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log(`[WorldbookParser] Syncing club state for run ${currentRunId}`)

    for (const name of bookNames) {
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
          const specificMatch = entry.name && entry.name.match(/\[Club:(.+?):(.+?)\]/)
          if (specificMatch) {
            const runId = specificMatch[2]
            // 如果是当前存档的条目，启用；否则禁用
            return {
              ...entry,
              enabled: runId === currentRunId
            }
          }

          // 处理原始条目
          const originalMatch = entry.name && entry.name.match(/\[Club:(.+?)\]/)
          if (originalMatch && !entry.name.includes(':')) { // 确保不匹配带 RunID 的
            const clubId = originalMatch[1]
            // 如果该社团在当前存档有激活副本，则禁用原始条目；否则启用
            const shouldDisable = activeClubIds.has(clubId)
            return {
              ...entry,
              enabled: !shouldDisable,
              strategy: {
                ...entry.strategy,
                type: 'selective' // 原始条目始终保持 Selective
              }
            }
          }

          return entry
        })
      })
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
    const classMatch = line.match(/([0-3])年([A-Z])班(.*?)(?=:|{|$)/)
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

    // 2. 识别班主任
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
    const books = window.getCharWorldbookNames('current')
    
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log('[WorldbookParser] Scanning worldbooks:', bookNames)

    let allClassData = {}

    // 2. 遍历世界书查找数据
    for (const name of bookNames) {
      const entries = await window.getWorldbook(name)
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 检查标题格式： [Class:1-A] ...
        // 忽略 keys，只看标题
        const match = entry.name && entry.name.match(/\[Class:([0-3]-[A-Z])\]/)
        
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
    const books = window.getCharWorldbookNames('current')
    const bookName = books.primary || (books.additional && books.additional[0])
    
    if (!bookName) return

    console.log(`[WorldbookParser] Setting player class to ${classId} in worldbook: ${bookName}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      return entries.map(entry => {
        // 识别标题格式： [Class:1-A] ...
        const match = entry.name.match(/\[Class:([0-3]-[A-Z])\]/)
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
function formatPerson(p) {
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
  
  return text
}

// 将班级数据格式化为文本
function formatClassData(data) {
  let text = `${data.name}:{\n`
  
  // 班主任
  if (data.headTeacher && data.headTeacher.name) {
    text += `  班主任: ${formatPerson(data.headTeacher)}\n`
  }
  
  // 科任教师
  if (data.teachers && data.teachers.length > 0) {
    text += `  科任教师: {\n`
    data.teachers.forEach(t => {
      if (t.name) {
        text += `    ${t.subject}: ${formatPerson(t)}\n`
      }
    })
    text += `  }\n`
  }
  
  // 学生列表
  if (data.students && data.students.length > 0) {
    text += `  学生列表: {\n`
    data.students.forEach((s, i) => {
      if (s.name) {
        text += `    ${i + 1}. ${formatPerson(s)}\n`
      }
    })
    text += `  }\n`
  }
  
  text += `}`
  return text
}

/**
 * 更新世界书中的班级数据
 * @param {string} classId 班级ID
 * @param {Object} classData 班级数据对象
 * @returns {Promise<boolean>} 是否成功
 */
export async function updateClassDataInWorldbook(classId, classData) {
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] updateWorldbookWith API not available')
    return false
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookName = books.primary || (books.additional && books.additional[0])
    
    if (!bookName) return false

    console.log(`[WorldbookParser] Updating class ${classId} in worldbook: ${bookName}`)

    await window.updateWorldbookWith(bookName, (entries) => {
      return entries.map(entry => {
        const match = entry.name.match(/\[Class:([0-3]-[A-Z])\]/)
        if (match && match[1] === classId) {
          console.log(`[WorldbookParser] Updating content for entry ${entry.name}`)
          return {
            ...entry,
            content: formatClassData(classData)
          }
        }
        return entry
      })
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
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log('[WorldbookParser] Scanning worldbooks for map data:', bookNames)

    let allMapData = []

    for (const name of bookNames) {
      const entries = await window.getWorldbook(name)
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
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log('[WorldbookParser] Starting smart key injection...')

    for (const name of bookNames) {
      await window.updateWorldbookWith(name, (entries) => {
        return entries.map(entry => {
          let newKeys = []
          let shouldUpdate = false
          
          // 1. 处理班级条目
          const classMatch = entry.name && entry.name.match(/\[Class:([0-3]-[A-Z])\]/)
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
    const books = window.getCharWorldbookNames('current')
    const bookName = books.primary || (books.additional && books.additional[0])
    
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
      const match = entry.name && entry.name.match(/\[BackupClass:([0-3]-[A-Z])\]/)
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
 * 设置 [变量解析] 条目的启用状态
 * 遍历所有绑定的世界书，查找名为 [变量解析] 的条目并更新其状态
 * @param {boolean} enabled 是否启用
 */
export async function setVariableParsingWorldbookStatus(enabled) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    const targetEntryName = '[变量解析]'
    let found = false

    for (const bookName of bookNames) {
      // 先检查该世界书是否包含目标条目
      const entries = await window.getWorldbook(bookName)
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
export async function saveMapDataToWorldbook(mapDataList) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[WorldbookParser] Worldbook API not available for saving map')
    return false
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    console.log('[WorldbookParser] Saving map data to worldbook...')

    // 将所有条目合并为一个大文本字符串
    const content = mapDataList.map(item => formatMapItem(item)).join('\n\n')

    for (const name of bookNames) {
      // 检查该世界书是否包含 [MapData] 条目
      const entries = await window.getWorldbook(name)
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
