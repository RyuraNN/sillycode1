/**
 * NPC 日程轨迹系统
 * 负责计算和管理 NPC 的位置信息
 * 集成地图、日历、课表和选修课系统
 */

import { seededRandom } from './random.js'
import { 
  isWeekend, 
  getWeekdayEnglish, 
  checkDayStatus, 
  TIME_SLOTS, 
  SUBJECT_LOCATION_MAP,
  generateWeeklySchedule,
  getTermInfo
} from './scheduleGenerator.js'
import { getItem, mapData, getChildren } from '../data/mapData.js'
import { autoSelectElectives, getCourseById } from '../data/coursePoolData.js'

// ==================== 辅助函数 ====================

/**
 * 计算绝对游戏小时数
 * 用于跨天比较
 * @param {Object} gameTime 
 */
export function calculateTotalHours(gameTime) {
  return gameTime.year * 365 * 24 + gameTime.day * 24 + gameTime.hour
}

// ==================== 常量定义 ====================

/**
 * 未知地点标识
 */
export const UNKNOWN_LOCATION = 'unknown'

/**
 * 时间段定义
 */
export const TIME_PERIODS = {
  EARLY_MORNING: { id: 'early_morning', name: '清晨', start: 5, end: 7 },
  MORNING: { id: 'morning', name: '早晨', start: 7, end: 8 },
  MORNING_CLASS: { id: 'morning_class', name: '上午课程', start: 8, end: 12 },
  LUNCH: { id: 'lunch', name: '午休', start: 12, end: 13 },
  AFTERNOON_CLASS: { id: 'afternoon_class', name: '下午课程', start: 13, end: 16 },
  CLUB_TIME: { id: 'club_time', name: '社团时间', start: 16, end: 18 },
  EVENING: { id: 'evening', name: '傍晚', start: 18, end: 21 },
  NIGHT: { id: 'night', name: '夜间', start: 21, end: 24 },
  LATE_NIGHT: { id: 'late_night', name: '深夜', start: 0, end: 5 }
}

/**
 * 默认模板 - 包含不同类型学生的基础日程
 */
export const DEFAULT_TEMPLATES = {
  // 普通学生：标准的上课-社团-回家流程
  student_normal: {
    id: 'student_normal',
    name: '普通学生',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [
        { id: 'home', weight: 70 }, 
        { id: 'th_main_gate', weight: 20 },
        { id: 'th_sakura_avenue', weight: 10 }
      ]},
      { period: 'morning', weekdays: ['weekday'], locations: [
        { id: '{classroom}', weight: 80 }, 
        { id: 'cafeteria', weight: 10 },
        { id: 'th_courtyard', weight: 10 }
      ]},
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [
        { id: 'cafeteria', weight: 40 },
        { id: '{classroom}', weight: 30 },
        { id: 'school_store', weight: 10 },
        { id: 'th_courtyard', weight: 10 },
        { id: 'th_teaching_area', weight: 10 } // 随机漫游
      ]},
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: '{club}', weight: 60 },
        { id: 'th_arts_area', weight: 10 }, // 闲逛看看社团
        { id: 'city_library', weight: 10 },
        { id: 'home', weight: 20 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [
        { id: 'shopping_street', weight: 40 }, // 区域漫游
        { id: 'central_park', weight: 10 },
        { id: 'home', weight: 50 }
      ]},
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 体育生：热衷于运动和训练
  student_athletic: {
    id: 'student_athletic',
    name: '体育特长生',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [
        { id: 'th_sports_area', weight: 70 }, // 晨练
        { id: 'home', weight: 30 }
      ]},
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: '{classroom}', weight: 70 }, { id: 'cafeteria', weight: 30 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [
        { id: 'cafeteria', weight: 60 }, 
        { id: 'school_store', weight: 30 },
        { id: 'th_sports_area', weight: 10 }
      ]},
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: '{sport_spot}', weight: 60 },
        { id: '{club}', weight: 40 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [
        { id: 'home', weight: 50 }, 
        { id: 'convenience_store', weight: 30 }, 
        { id: 'riverbank', weight: 20 }
      ]},
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 优等生：喜爱学习和安静
  student_honor: {
    id: 'student_honor',
    name: '优等生',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [{ id: 'home', weight: 90 }, { id: '{classroom}', weight: 10 }] },
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: '{classroom}', weight: 80 }, { id: 'library', weight: 20 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [{ id: '{classroom}', weight: 60 }, { id: 'library', weight: 30 }, { id: 'th_courtyard', weight: 10 }] },
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: 'library', weight: 40 },
        { id: 'city_library', weight: 20 },
        { id: '{club}', weight: 30 },
        { id: 'student_council_room', weight: 10 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [{ id: 'home', weight: 80 }, { id: 'bookstore', weight: 20 }] },
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 社团狂热者：几乎住在社团活动室
  student_club_addict: {
    id: 'student_club_addict',
    name: '社团狂热者',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [{ id: '{club}', weight: 50 }, { id: 'home', weight: 50 }] },
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: '{club}', weight: 60 }, { id: '{classroom}', weight: 40 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [{ id: '{club}', weight: 70 }, { id: 'cafeteria', weight: 30 }] },
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [{ id: '{club}', weight: 100 }] },
      { period: 'evening', weekdays: ['all'], locations: [{ id: 'home', weight: 60 }, { id: 'shopping_street', weight: 40 }] },
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 偶像科学生：特殊的课程和演艺活动
  student_idol: {
    id: 'student_idol',
    name: '偶像科学生',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [{ id: 'track_and_field', weight: 40 }, { id: 'sub_gymnasium', weight: 40 }, { id: 'home', weight: 20 }] },
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: '{classroom}', weight: 100 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [{ id: 'cafeteria', weight: 30 }, { id: 'mb_rooftop', weight: 30 }, { id: 'idol_activity_room', weight: 40 }] },
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 100 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: 'idol_activity_room', weight: 50 },
        { id: 'sub_gymnasium', weight: 30 },
        { id: 'live_house_starry', weight: 20 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [{ id: 'live_house_starry', weight: 40 }, { id: 'home', weight: 60 }] },
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 不良/逃课生：经常旷课，出没于娱乐场所
  student_delinquent: {
    id: 'student_delinquent',
    name: '不良学生',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [{ id: 'home', weight: 100 }] },
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: 'th_main_gate', weight: 40 }, { id: 'convenience_store', weight: 60 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [
        { id: '{class_location}', weight: 30 }, 
        { id: 'mb_rooftop', weight: 30 }, 
        { id: 'game_center', weight: 20 },
        { id: 'abandoned_factory', weight: 20 }
      ]},
      { period: 'lunch', weekdays: ['weekday'], locations: [
        { id: 'school_store', weight: 40 }, 
        { id: 'mb_rooftop', weight: 40 },
        { id: 'th_support_area', weight: 20 } // 在生活区游荡
      ]},
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [
        { id: '{class_location}', weight: 30 }, 
        { id: 'game_center', weight: 40 },
        { id: 'karaoke_box', weight: 20 },
        { id: 'tianhua_seaside_park', weight: 10 } // 去海边玩
      ]},
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: 'game_center', weight: 30 },
        { id: 'karaoke_box', weight: 30 },
        { id: 'convenience_store', weight: 20 },
        { id: 'shopping_street', weight: 20 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [
        { id: 'shopping_street', weight: 60 }, 
        { id: 'abandoned_factory', weight: 20 }, 
        { id: 'home', weight: 20 }
      ]},
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 70 }, { id: 'shopping_street', weight: 30 }] }
    ]
  },
  
  // 学生会成员
  student_council: {
    id: 'student_council',
    name: '学生会成员',
    slots: [
      { period: 'early_morning', weekdays: ['weekday'], locations: [{ id: 'mb_student_council_room', weight: 60 }, { id: '{classroom}', weight: 40 }] },
      { period: 'morning', weekdays: ['weekday'], locations: [{ id: 'mb_student_council_room', weight: 50 }, { id: '{classroom}', weight: 50 }] },
      { period: 'morning_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 90 }, { id: 'mb_student_council_room', weight: 10 }] },
      { period: 'lunch', weekdays: ['weekday'], locations: [{ id: 'mb_student_council_room', weight: 70 }, { id: 'cafeteria', weight: 30 }] },
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [{ id: '{class_location}', weight: 90 }, { id: 'mb_student_council_room', weight: 10 }] },
      { period: 'club_time', weekdays: ['weekday'], locations: [{ id: 'mb_student_council_room', weight: 90 }, { id: 'home', weight: 10 }] },
      { period: 'evening', weekdays: ['all'], locations: [{ id: 'home', weight: 70 }, { id: 'shopping_street', weight: 30 }] },
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  },

  // 教师
  teacher: {
    id: 'teacher',
    name: '教师',
    slots: [
      { period: 'morning', weekdays: ['weekday'], locations: [
        { id: 'ab_staff_room', weight: 80 },
        { id: '{teaching_room}', weight: 20 }
      ]},
      { period: 'morning_class', weekdays: ['weekday'], locations: [
        { id: '{teaching_room}', weight: 70 },
        { id: 'ab_staff_room', weight: 30 }
      ]},
      { period: 'lunch', weekdays: ['weekday'], locations: [
        { id: 'cafeteria', weight: 50 },
        { id: 'ab_staff_room', weight: 50 }
      ]},
      { period: 'afternoon_class', weekdays: ['weekday'], locations: [
        { id: '{teaching_room}', weight: 70 },
        { id: 'ab_staff_room', weight: 30 }
      ]},
      { period: 'club_time', weekdays: ['weekday'], locations: [
        { id: 'ab_staff_room', weight: 60 },
        { id: '{club_advisor}', weight: 30 },
        { id: 'city_library', weight: 10 }
      ]},
      { period: 'evening', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] },
      { period: 'night', weekdays: ['all'], locations: [{ id: 'home', weight: 100 }] }
    ]
  }
}

/**
 * 默认角色类型映射
 */
export const DEFAULT_ROLE_TEMPLATE_MAP = {
  student: 'student_normal',
  teacher: 'teacher',
  other: 'student_normal'
}

/**
 * 天气修正规则
 */
export const WEATHER_MODIFIERS = {
  rainy: { outdoor: -50, indoor: 30 },
  stormy: { outdoor: -80, indoor: 50, home: 30 },
  snowy: { outdoor: -30, indoor: 20 },
  sunny: { outdoor: 10, indoor: 0 },
  cloudy: { outdoor: 0, indoor: 0 }
}

/**
 * NPC 心情修正规则
 */
export const MOOD_MODIFIERS = {
  happy: { social: 20, outdoor: 10, home: -10 },
  sad: { home: 30, solitary: 25, social: -20, outdoor: -15 },
  stressed: { study: 30, workplace: 20, entertainment: -20, home: 15 },
  energetic: { outdoor: 25, social: 15, home: -20 },
  tired: { home: 35, rest: 20, outdoor: -25 },
  angry: { solitary: 30, outdoor: 15, social: -25 },
  romantic: { date_spot: 45, outdoor: 15, home: -15 },
  neutral: {}
}

// ==================== 辅助函数：动态分类与识别 ====================

/**
 * 检查地点是否包含特定标签
 */
function hasTag(item, tag) {
  if (!item || !item.tags || !Array.isArray(item.tags)) return false
  return item.tags.some(t => t.toLowerCase() === tag.toLowerCase())
}

/**
 * 判断地点是否为室外
 */
export function isOutdoorLocation(locationId) {
  const item = getItem(locationId)
  if (!item) return false

  if (hasTag(item, 'Outdoor')) return true
  const outdoorTypes = ['自然景观', '道路', '户外区域', '名胜古迹', '运动设施']
  if (outdoorTypes.includes(item.type)) return true
  if (item.desc && /公园|露天|街道|广场/.test(item.desc)) return true

  return false
}

/**
 * 获取地点的分类列表
 */
export function getLocationCategories(locationId) {
  const item = getItem(locationId)
  if (!item) return []

  const categories = new Set()

  if (item.tags) {
    item.tags.forEach(tag => categories.add(tag.toLowerCase()))
  }

  const type = item.type || ''
  
  if (type === '商业区' || type === '店铺') {
    categories.add('social')
    categories.add('workplace')
    categories.add('shopping')
  } else if (type === '娱乐场所') {
    categories.add('entertainment')
    categories.add('social')
    categories.add('date_spot')
  } else if (['户外区域', '自然景观', '名胜古迹'].includes(type)) {
    categories.add('outdoor')
    categories.add('date_spot')
    if (item.desc && /安静|偏僻/.test(item.desc)) {
      categories.add('solitary')
    }
  } else if (type === '图书馆' || type === '自习室') {
    categories.add('study')
    categories.add('solitary')
  } else if (type === '宿舍' || type === '医务室') {
    categories.add('rest')
  } else if (type === '运动设施' || type === '体育馆') {
    categories.add('gymnasium')
    categories.add('exercise')
  }

  return Array.from(categories)
}

/**
 * 获取特定分类的所有地点 ID
 */
export function getLocationsByCategory(category) {
  const results = []
  for (const item of mapData) {
    const cats = getLocationCategories(item.id)
    if (cats.includes(category.toLowerCase())) {
      results.push(item.id)
    }
  }
  return results
}

/**
 * 尝试推断社团活动室
 */
function getClubLocation(clubId) {
  if (!clubId) return 'city_library'
  // 映射常见社团到已知房间 ID
  const map = {
    'service_club': 'service_club_room',
    'classical_literature_club': 'classical_literature_club_room',
    'light_music_club': 'light_music_club_room',
    'sos_brigade': 'sos_brigade_club_room',
    'drama_club': 'drama_club_room',
    'idol_research_club': 'idol_activity_room',
    'basketball_club': 'main_gymnasium',
    'tennis_club': 'tennis_court',
    'swimming_club': 'swimming_pool_building',
    'concert_band': 'music_building',
    'student_council': 'mb_student_council_room'
  }
  return map[clubId] || `${clubId}_room`
}

/**
 * NPC 分配表（世界书 ASSIGN 指令）
 */
const npcAssignments = new Map()

/**
 * 条件修正规则列表
 */
const conditionModifiers = []

// ==================== 缓存管理 ====================

const locationCache = new Map()
const locationNpcIndex = new Map()
let lastFullUpdateTime = null
const CACHE_TTL = 60 * 1000 // 1分钟

// ==================== 模板存储 ====================

const loadedTemplates = new Map()

/**
 * 根据 NPC 信息自动推断日程模板 ID
 */
function inferTemplateId(npc, gameStore) {
  const origin = npc.origin || ''
  
  // 1. 班级判断：偶像科
  if (npc.classId && npc.classId.endsWith('E')) return 'student_idol'
  if (origin.includes('偶像大师') || origin.includes('Love Live')) return 'student_idol'
  
  // 2. 社团判断
  let clubId = null
  if (gameStore?.allClubs) {
    for (const [id, data] of Object.entries(gameStore.allClubs)) {
      if (data.members?.includes(npc.name) || data.president === npc.name || data.vicePresident === npc.name) {
        clubId = id
        break
      }
    }
  }

  if (clubId === 'student_council') return 'student_council'
  if (/basketball|tennis|swimming|sports/.test(clubId)) return 'student_athletic'
  if (/light_music|drama|band|sos|service/.test(clubId)) return 'student_club_addict'

  // 3. 来源判断
  if (/灌篮高手|黑子的篮球|网球王子|Free|排球少年/.test(origin)) return 'student_athletic'
  if (/轻音少女|吹响吧|孤独摇滚/.test(origin)) return 'student_club_addict'
  if (/东京复仇者|热血高校|GTO|不良/.test(origin)) return 'student_delinquent'
  if (/冰菓|实教|辉夜|学霸/.test(origin)) return 'student_honor'
  
  return null
}

export function getNpcTemplate(npc, gameStore = null) {
  const assignment = npcAssignments.get(npc.name)
  if (assignment) {
    const template = loadedTemplates.get(assignment.templateId) || DEFAULT_TEMPLATES[assignment.templateId]
    if (template) {
      return { template, overrides: assignment.overrides }
    }
  }
  
  if (npc.scheduleTag) {
    const tagName = `student_${npc.scheduleTag}`
    const templateId = DEFAULT_TEMPLATES[tagName] ? tagName : 
                       (DEFAULT_TEMPLATES[npc.scheduleTag] ? npc.scheduleTag : null)
    
    if (templateId) {
      const template = loadedTemplates.get(templateId) || DEFAULT_TEMPLATES[templateId]
      return { template, overrides: {} }
    }
  }

  const inferredId = inferTemplateId(npc, gameStore)
  if (inferredId) {
    const template = loadedTemplates.get(inferredId) || DEFAULT_TEMPLATES[inferredId]
    if (template) {
      return { template, overrides: {} }
    }
  }
  
  const role = npc.role || 'student'
  const templateId = DEFAULT_ROLE_TEMPLATE_MAP[role] || 'student_normal'
  const template = loadedTemplates.get(templateId) || DEFAULT_TEMPLATES[templateId]
  
  return { template: template || DEFAULT_TEMPLATES.student_normal, overrides: {} }
}

export function matchesWeekday(weekdays, currentWeekday) {
  if (!weekdays || weekdays.length === 0 || weekdays.includes('all')) {
    return true
  }
  const isWeekendDay = isWeekend(currentWeekday)
  for (const condition of weekdays) {
    if (condition === 'weekday' && !isWeekendDay) return true
    if (condition === 'weekend' && isWeekendDay) return true
    if (condition === currentWeekday) return true
  }
  return false
}

/**
 * 解析变量占位符
 * 核心联动逻辑：将抽象位置转换为具体地图ID
 */
export function resolveLocationPlaceholder(locationId, npcData, gameStore) {
  if (!locationId.startsWith('{')) return locationId
  
  const placeholder = locationId.slice(1, -1) // 去除花括号
  
  // 随机数生成器
  const seed = generateLocationSeed(npcData.id, gameStore?.gameTime || { hour: 0, day: 1, month: 1, year: 1 })
  const rng = seededRandom(seed)

  const pickRandom = (list) => {
    if (!list || list.length === 0) return null
    return list[Math.floor(rng() * list.length)]
  }

  // 获取 NPC 的班级教室 ID
  const getClassroom = () => {
    if (npcData.classId) return `classroom_${npcData.classId.toLowerCase().replace('-', '')}`
    if (gameStore?.allClassData) {
      for (const [classId, classData] of Object.entries(gameStore.allClassData)) {
        if (classData.students?.some(s => s.name === npcData.name)) {
          return `classroom_${classId.toLowerCase().replace('-', '')}`
        }
      }
    }
    return 'classroom_1a'
  }

  switch (placeholder) {
    case 'classroom':
      return getClassroom()
      
    case 'class_location': // 跑班制核心逻辑
      if (!gameStore || !npcData.classId) return getClassroom()
      const { hour, minute, year, month, day } = gameStore.gameTime
      const currentTimeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      
      // 1. 检查是否在上课时间
      // 将时间转换为分钟数比较
      const currentMins = hour * 60 + minute
      const getMins = (str) => { const [h, m] = str.split(':').map(Number); return h * 60 + m; }
      
      let currentPeriod = null
      for (const slot of TIME_SLOTS) {
        if (currentMins >= getMins(slot.start) && currentMins < getMins(slot.end)) {
          currentPeriod = slot.period
          break
        }
      }
      
      if (currentPeriod) {
        // 2. 生成/获取当前课表
        const classInfo = gameStore.allClassData?.[npcData.classId] || {}
        const termInfo = getTermInfo(year, month, day)
        // 确保同一周的课表一致
        const schedule = generateWeeklySchedule(npcData.classId, classInfo, termInfo.weekNumber)
        const weekdayEng = getWeekdayEnglish(gameStore.gameTime.weekday)
        const todaySchedule = schedule[weekdayEng]
        
        if (todaySchedule) {
          const currentClass = todaySchedule.find(c => c.period === currentPeriod)
          if (currentClass && !currentClass.isEmpty && currentClass.locationId) {
            return currentClass.locationId
          }
        }
      }
      return getClassroom() // 没课或者找不到课表，回班级
      
    case 'club':
      if (npcData.clubRoom) return npcData.clubRoom
      if (gameStore?.allClubs) {
        for (const [clubId, clubData] of Object.entries(gameStore.allClubs)) {
          const isMember = clubData.members?.includes(npcData.name) || 
                           clubData.president === npcData.name ||
                           clubData.vicePresident === npcData.name ||
                           clubData.advisor === npcData.name
          if (isMember) {
            return clubData.location || getClubLocation(clubId)
          }
        }
      }
      return 'city_library'
      
    case 'club_advisor':
      if (npcData.advisorClubRoom) return npcData.advisorClubRoom
      return 'ab_staff_room'
      
    case 'teaching_room': // 教师上课地点
      if (npcData.teachingRoom) return npcData.teachingRoom
      // 随机分配一个教学场所
      const teachingSpots = ['classroom_1a', 'classroom_2a', 'classroom_3a', 'sb_physics_lab', 'music_room_1', 'track_and_field']
      return pickRandom(teachingSpots)
      
    case 'workplace':
      if (npcData.workplace) return npcData.workplace
      const workplaces = getLocationsByCategory('workplace')
      return pickRandom(workplaces) || 'convenience_store'
      
    case 'home':
      if (npcData.homeLocation) return npcData.homeLocation
      if (npcData.isAlive !== true) return UNKNOWN_LOCATION
      return 'home'

    case 'social_spot':
      return pickRandom(getLocationsByCategory('social')) || 'shopping_street'
      
    case 'date_spot':
      return pickRandom(getLocationsByCategory('date_spot')) || 'central_park'
      
    case 'sport_spot':
      const sports = ['track_and_field', 'main_gymnasium', 'sub_gymnasium', 'tennis_court', 'swimming_pool_building']
      return pickRandom(sports)
      
    default:
      return locationId
  }
}

function generateLocationSeed(npcId, gameTime) {
  const dateStr = `${gameTime.year}-${gameTime.month}-${gameTime.day}-${gameTime.hour}`
  let hash = 0
  const str = `${npcId}_${dateStr}`
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

// ==================== 导出清理函数 ====================

export function clearAllCache() {
  locationCache.clear()
  locationNpcIndex.clear()
  lastFullUpdateTime = null
  console.log('[NpcSchedule] Cache cleared')
}

export function clearNpcCache(npcId) {
  for (const key of locationCache.keys()) {
    if (key.startsWith(`${npcId}_`)) {
      locationCache.delete(key)
    }
  }
}

// ==================== 模板解析函数 ====================
// (保持原有解析逻辑)

export function parseScheduleTemplates(text) {
  if (!text) return
  const lines = text.split('\n')
  let currentTemplate = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split('|')
    if (parts.length < 2) continue
    const command = parts[0].trim().toUpperCase()
    switch (command) {
      case 'TEMPLATE':
        if (parts.length >= 3) {
          const id = parts[1].trim()
          const name = parts[2].trim()
          currentTemplate = { id, name, slots: [] }
          loadedTemplates.set(id, currentTemplate)
        }
        break
      case 'SLOT':
        if (currentTemplate && parts.length >= 6) {
          currentTemplate.slots.push({
            period: parts[1].trim(),
            startTime: parts[2].trim(),
            endTime: parts[3].trim(),
            weekdays: parts[4].trim().split(',').map(s => s.trim()),
            locations: parseLocationRules(parts[5].trim())
          })
        }
        break
      case 'ASSIGN':
        if (parts.length >= 3) {
          npcAssignments.set(parts[1].trim(), {
            templateId: parts[2].trim(),
            overrides: parts[3] ? parseOverrides(parts[3].trim()) : {}
          })
        }
        break
      case 'DEFAULT':
        if (parts.length >= 3) {
          DEFAULT_ROLE_TEMPLATE_MAP[parts[1].trim()] = parts[2].trim()
        }
        break
    }
  }
  console.log(`[NpcSchedule] Loaded ${loadedTemplates.size} templates, ${npcAssignments.size} assignments`)
}

function parseLocationRules(str) {
  const locations = []
  const parts = str.split(',')
  for (const part of parts) {
    const segments = part.trim().split(':')
    if (segments.length >= 2) {
      locations.push({
        id: segments[0].trim(),
        weight: parseInt(segments[1].trim()) || 10,
        condition: segments[2] ? segments[2].trim() : null
      })
    }
  }
  return locations
}

function parseOverrides(str) {
  const overrides = {}
  if (!str) return overrides
  const pairs = str.split(';')
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(s => s.trim())
    if (key && value) overrides[key] = value
  }
  return overrides
}

export function parseScheduleModifiers(text) {
  if (!text) return
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split('|')
    if (parts.length < 4) continue
    if (parts[0].trim().toUpperCase() === 'MODIFIER') {
      conditionModifiers.push({
        type: parts[1].trim(),
        value: parts[2].trim(),
        effects: parseModifierEffects(parts[3].trim())
      })
    }
  }
  console.log(`[NpcSchedule] Loaded ${conditionModifiers.length} modifiers`)
}

function parseModifierEffects(str) {
  const effects = {}
  const parts = str.split(',')
  for (const part of parts) {
    const [key, value] = part.split(':').map(s => s.trim())
    if (key && value) effects[key] = parseInt(value) || 0
  }
  return effects
}

// ==================== 位置计算核心函数 ====================

/**
 * 计算 NPC 的选修课位置
 */
function calculateNpcElectiveLocation(npc, gameTime, gameStore) {
  if (!gameStore || !gameStore.currentRunId) return null
  const seed = gameStore.currentRunId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  const rng = seededRandom(seed)
  let preference = 'general'
  if (gameStore.allClassData) {
    for (const classInfo of Object.values(gameStore.allClassData)) {
      const student = classInfo.students?.find(s => s.name === npc.name)
      if (student && student.electivePreference) {
        preference = student.electivePreference
        break
      }
    }
  }
  const classId = (npc.location && npc.location.match(/^\d-[A-Z]/)) ? npc.location : '1-A'
  const selections = autoSelectElectives(classId, preference, 3, rng)
  if (!selections || selections.length === 0) return null
  const hourSeed = generateLocationSeed(npc.id, gameTime)
  const hourRng = seededRandom(hourSeed)
  const courseId = selections[Math.floor(hourRng() * selections.length)]
  const course = getCourseById(courseId)
  if (!course) return null
  // 如果课程有特定地点，直接使用
  if (course.location && course.location !== 'various') {
      return course.location
  }
  // 否则随机
  const locationInfo = getRandomMapLocation(course.name, classId)
  return locationInfo ? locationInfo.locationId : null
}

export function getCurrentPeriod(hour) {
  if (hour >= 0 && hour < 5) return TIME_PERIODS.LATE_NIGHT
  if (hour >= 21) return TIME_PERIODS.NIGHT

  for (const [key, period] of Object.entries(TIME_PERIODS)) {
    if (period.start > period.end) {
      if (hour >= period.start || hour < period.end) return period
    } else {
      if (hour >= period.start && hour < period.end) return period
    }
  }
  return TIME_PERIODS.LATE_NIGHT
}

/**
 * 计算单个NPC的当前位置
 * 增加日历事件修正
 */
export function calculateNpcLocation(npc, gameTime, gameStore, forceRecalculate = false) {
  if (!npc || !npc.id) return UNKNOWN_LOCATION

  if (npc.isAlive && gameStore?.player?.location) {
    return gameStore.player.location
  }
  
  // ============ 强制移动逻辑 ============
  if (npc.forcedLocation) {
    const currentTotalHours = calculateTotalHours(gameTime)
    if (currentTotalHours < npc.forcedLocation.endTime) {
      return npc.forcedLocation.locationId
    } else {
      // 已过期，清除状态
      delete npc.forcedLocation
    }
  }
  // ======================================
  
  if (!npc.isAlive && (gameTime.hour >= 21 || gameTime.hour < 5)) {
    return UNKNOWN_LOCATION
  }

  const cacheKey = `${npc.id}_${gameTime.hour}`
  if (!forceRecalculate && locationCache.has(cacheKey)) {
    const cached = locationCache.get(cacheKey)
    if (Date.now() - cached.calculatedAt < CACHE_TTL) {
      return cached.locationId
    }
  }

  // ============ 日历事件修正 ============
  const dayStatus = checkDayStatus(gameTime.month, gameTime.day)
  
  // 1. 体育祭：全员操场
  if (dayStatus.eventInfo && dayStatus.eventInfo.id === 'event_sports_festival') {
      if (gameTime.hour >= 8 && gameTime.hour < 17) {
          const seed = generateLocationSeed(npc.id, gameTime)
          locationCache.set(cacheKey, { locationId: 'track_and_field', calculatedAt: Date.now(), seed })
          return 'track_and_field'
      }
  }
  
  // 2. 学园祭：班级或礼堂
  if (dayStatus.eventInfo && dayStatus.eventInfo.id === 'event_school_festival') {
      if (gameTime.hour >= 9 && gameTime.hour < 16) {
          const classLoc = `classroom_${npc.classId ? npc.classId.toLowerCase().replace('-', '') : '1a'}`
          const spots = [classLoc, 'auditorium', 'th_courtyard', 'gymnasium']
          // 简化的随机选择
          const seed = generateLocationSeed(npc.id, gameTime)
          const rng = seededRandom(seed)
          const loc = spots[Math.floor(rng() * spots.length)]
          locationCache.set(cacheKey, { locationId: loc, calculatedAt: Date.now(), seed })
          return loc
      }
  }
  
  // 3. 假期修正：非住校生不在学校
  // 如果是假期，且当前时间是上课时间，强制修改为家庭或娱乐场所
  if (dayStatus.isHoliday && dayStatus.holidayType === 'full') {
      // 简单处理：假期随机去商业街或在家
      if (gameTime.hour >= 10 && gameTime.hour < 18) {
           const spots = ['shopping_street', 'central_park', 'game_center', 'home', 'home']
           const seed = generateLocationSeed(npc.id, gameTime)
           const rng = seededRandom(seed)
           const loc = spots[Math.floor(rng() * spots.length)]
           // 存入缓存
           locationCache.set(cacheKey, { locationId: loc, calculatedAt: Date.now(), seed })
           return loc
      }
  }

  // ============ 正常流程 ============

  if (gameTime.hour >= 14 && gameTime.hour < 16 && !isWeekend(getWeekdayEnglish(gameTime.weekday))) {
    const electiveLocation = calculateNpcElectiveLocation(npc, gameTime, gameStore)
    if (electiveLocation) {
      const seed = generateLocationSeed(npc.id, gameTime)
      locationCache.set(cacheKey, { locationId: electiveLocation, calculatedAt: Date.now(), seed })
      return electiveLocation
    }
  }
  
  const { template, overrides } = getNpcTemplate(npc, gameStore)
  if (!template) return UNKNOWN_LOCATION
  
  const currentPeriod = getCurrentPeriod(gameTime.hour)
  const weekday = getWeekdayEnglish(gameTime.weekday)
  
  let matchedSlot = null
  for (const slot of template.slots) {
    if (slot.period === currentPeriod.id && matchesWeekday(slot.weekdays, weekday)) {
      matchedSlot = slot
      break
    }
  }
  
  if (!matchedSlot || !matchedSlot.locations || matchedSlot.locations.length === 0) {
    if (!npc.isAlive) return UNKNOWN_LOCATION
    return 'home'
  }
  
  const npcData = {
    ...npc,
    ...overrides,
    clubRoom: overrides.club || null,
    teachingRoom: overrides.teaching_room || null,
    workplace: overrides.workplace || null
  }
  
  const weather = gameStore?.worldState?.weather?.current?.weather || 'sunny'
  const weatherMod = WEATHER_MODIFIERS[weather] || {}
  const npcMood = npc.mood || 'neutral'
  const moodMod = MOOD_MODIFIERS[npcMood] || {}
  
    const resolvedLocations = matchedSlot.locations.map(loc => {
    let resolvedId = resolveLocationPlaceholder(loc.id, npcData, gameStore)
    
    // ============ 区域漫游逻辑 ============
    // 如果解析出的地点有子地点（即它是一个区域），则随机选择一个子地点
    const children = getChildren(resolvedId)
    if (children && children.length > 0) {
      const seed = generateLocationSeed(npc.id, gameTime)
      // 使用 loc.id 作为额外的熵，确保同一个小时内不同的 slot 选项即使都是区域也能随机出不同结果
      // 不过这里 seed 是基于时间和 NPC 的，对于同一个 NPC 同一个时间是固定的
      // 为了让不同的候选区域选出不同的子地点，可以混入 resolvedId
      let childHash = 0
      for (let i = 0; i < resolvedId.length; i++) childHash += resolvedId.charCodeAt(i)
      const rng = seededRandom(seed + childHash)
      
      const randomChild = children[Math.floor(rng() * children.length)]
      resolvedId = randomChild.id
    }
    // ======================================

    if (resolvedId !== UNKNOWN_LOCATION && resolvedId !== 'home' && !getItem(resolvedId)) {
      return { id: UNKNOWN_LOCATION, weight: 0 }
    }

    let weight = loc.weight
    
    if (resolvedId !== UNKNOWN_LOCATION) {
      if (isOutdoorLocation(resolvedId)) {
        weight += weatherMod.outdoor || 0
      } else {
        weight += weatherMod.indoor || 0
      }
      
      const locCategories = getLocationCategories(resolvedId)
      for (const category of locCategories) {
        if (moodMod[category]) weight += moodMod[category]
      }
      if (isOutdoorLocation(resolvedId) && moodMod.outdoor) weight += moodMod.outdoor
    }
    
    if (resolvedId === 'home' || resolvedId === UNKNOWN_LOCATION) {
      weight += weatherMod.home || 0
      if (moodMod.home) weight += moodMod.home
    }
    
    return { id: resolvedId, weight: Math.max(1, weight) }
  }).filter(l => l.weight > 0)
  
  if (resolvedLocations.length === 0) return UNKNOWN_LOCATION

  // 特殊日期修正（非强制性）
  if (dayStatus.isHoliday) {
    for (const loc of resolvedLocations) {
      if (loc.id.includes('classroom') || loc.id.includes('staff')) {
        loc.weight = Math.max(1, Math.floor(loc.weight * 0.1))
      }
      if (loc.id === 'home' || loc.id === UNKNOWN_LOCATION) {
        loc.weight = Math.floor(loc.weight * 2)
      }
    }
  }
  
  const seed = generateLocationSeed(npc.id, gameTime)
  const random = seededRandom(seed)
  const totalWeight = resolvedLocations.reduce((sum, loc) => sum + loc.weight, 0)
  let roll = random() * totalWeight
  let selectedLocation = resolvedLocations[0].id
  
  for (const loc of resolvedLocations) {
    roll -= loc.weight
    if (roll <= 0) {
      selectedLocation = loc.id
      break
    }
  }
  
  if (selectedLocation === 'home' && !npc.isAlive) {
    selectedLocation = UNKNOWN_LOCATION
  }

  locationCache.set(cacheKey, {
    locationId: selectedLocation,
    calculatedAt: Date.now(),
    seed
  })
  
  return selectedLocation
}

export function getNpcDailySchedule(npc, gameStore) {
  const { template, overrides } = getNpcTemplate(npc, gameStore)
  if (!template) return []
  const npcData = { ...npc, ...overrides }
  const schedule = []
  for (const slot of template.slots) {
    const locations = slot.locations.map(loc => ({
      id: resolveLocationPlaceholder(loc.id, npcData, gameStore),
      weight: loc.weight
    }))
    schedule.push({
      period: slot.period,
      periodName: TIME_PERIODS[slot.period.toUpperCase()]?.name || slot.period,
      weekdays: slot.weekdays,
      locations
    })
  }
  return schedule
}

export function updateAllNpcLocations(gameStore, force = false) {
  const { npcs, gameTime } = gameStore
  if (!npcs || npcs.length === 0) return new Map()
  const currentTimeKey = `${gameTime.year}-${gameTime.month}-${gameTime.day}-${gameTime.hour}`
  if (!force && lastFullUpdateTime === currentTimeKey) {
    return new Map([...locationCache].map(([k, v]) => [k.split('_')[0], v.locationId]))
  }
  locationNpcIndex.clear()
  const results = new Map()
  const batchSize = 50
  for (let i = 0; i < npcs.length; i += batchSize) {
    const batch = npcs.slice(i, i + batchSize)
    for (const npc of batch) {
      if (!npc.isAlive) {
        const loc = calculateNpcLocation(npc, gameTime, gameStore, force)
        results.set(npc.id, loc)
        continue 
      }
      const locationId = calculateNpcLocation(npc, gameTime, gameStore, force)
      results.set(npc.id, locationId)
      if (locationId !== UNKNOWN_LOCATION) {
        if (!locationNpcIndex.has(locationId)) locationNpcIndex.set(locationId, new Set())
        locationNpcIndex.get(locationId).add(npc.id)
      }
    }
  }
  lastFullUpdateTime = currentTimeKey
  console.log(`[NpcSchedule] Updated locations for ${results.size} NPCs`)
  return results
}

export function getNpcsAtLocation(locationId, gameStore = null) {
  if (locationNpcIndex.size === 0 && gameStore) updateAllNpcLocations(gameStore)
  const npcIds = locationNpcIndex.get(locationId)
  if (!npcIds || npcIds.size === 0) return []
  if (gameStore?.npcs) return gameStore.npcs.filter(npc => npcIds.has(npc.id))
  return Array.from(npcIds)
}

export function getNpcCountAtLocation(locationId) {
  const npcIds = locationNpcIndex.get(locationId)
  return npcIds ? npcIds.size : 0
}

export function findNpcLocation(npcId, gameStore) {
  if (!gameStore) return null
  const cacheKey = `${npcId}_${gameStore.gameTime.hour}`
  if (locationCache.has(cacheKey)) return locationCache.get(cacheKey).locationId
  const npc = gameStore.npcs?.find(n => n.id === npcId)
  if (npc) return calculateNpcLocation(npc, gameStore.gameTime, gameStore)
  return null
}

export function getLocationDistribution() {
  const distribution = {}
  for (const [locationId, npcIds] of locationNpcIndex) {
    distribution[locationId] = npcIds.size
  }
  return distribution
}

const trackedNpcs = new Set()

export function trackNpc(npcId) { trackedNpcs.add(npcId) }
export function untrackNpc(npcId) { trackedNpcs.delete(npcId) }
export function isNpcTracked(npcId) { return trackedNpcs.has(npcId) }

export function getTrackedNpcsWithLocations(gameStore) {
  const results = []
  for (const npcId of trackedNpcs) {
    const npc = gameStore.npcs?.find(n => n.id === npcId)
    if (!npc) continue
    const locationId = findNpcLocation(npcId, gameStore)
    const locationItem = getItem(locationId)
    results.push({
      npc,
      locationId,
      locationName: locationItem?.name || (locationId === UNKNOWN_LOCATION ? '未知' : locationId)
    })
  }
  return results
}

export function getScheduleConfig() {
  return {
    timePeriods: TIME_PERIODS,
    templates: Object.fromEntries(loadedTemplates),
    roleMapping: DEFAULT_ROLE_TEMPLATE_MAP,
    weatherModifiers: WEATHER_MODIFIERS,
    moodModifiers: MOOD_MODIFIERS
  }
}

export function setScheduleConfig(config) {
  if (!config) return
  
  if (config.timePeriods) {
    Object.assign(TIME_PERIODS, config.timePeriods)
  }
  
  if (config.templates) {
    loadedTemplates.clear()
    for (const [id, template] of Object.entries(config.templates)) {
      loadedTemplates.set(id, template)
    }
  }
  
  if (config.roleMapping) {
    Object.assign(DEFAULT_ROLE_TEMPLATE_MAP, config.roleMapping)
  }
  
  if (config.weatherModifiers) {
    Object.assign(WEATHER_MODIFIERS, config.weatherModifiers)
  }
  
  if (config.moodModifiers) {
    Object.assign(MOOD_MODIFIERS, config.moodModifiers)
  }
  
  clearAllCache()
}

export async function saveScheduleToWorldbook() {
  if (typeof window.saveWorldbookEntry !== 'function') {
    console.warn('[NpcSchedule] Worldbook API not available')
    return false
  }
  
  let templateContent = '# NPC日程模板配置\n\n'
  
  for (const [id, template] of loadedTemplates) {
    templateContent += `TEMPLATE | ${id} | ${template.name || id}\n`
    for (const slot of template.slots) {
      const locations = slot.locations.map(l => `${l.id}:${l.weight}`).join(',')
      templateContent += `SLOT | ${slot.period} | 0 | 0 | ${slot.weekdays.join(',')} | ${locations}\n`
    }
    templateContent += '\n'
  }
  
  for (const [role, templateId] of Object.entries(DEFAULT_ROLE_TEMPLATE_MAP)) {
    templateContent += `DEFAULT | ${role} | ${templateId}\n`
  }
  
  try {
    await window.saveWorldbookEntry('current', '[TH_NPCSchedule] NPC日程模板库', templateContent, ['system', 'schedule'], false)
  } catch (e) {
    console.error('保存模板失败:', e)
    return false
  }
  
  return true
}

export async function loadScheduleDataFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[NpcSchedule] Worldbook API not available, using default templates')
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
    console.log('[NpcSchedule] Scanning worldbooks for schedule data:', bookNames)
    let templatesLoaded = false
    let modifiersLoaded = false
    for (const name of bookNames) {
      const entries = await window.getWorldbook(name)
      if (!entries || !Array.isArray(entries)) continue
      for (const entry of entries) {
        if (entry.name && entry.name.includes('[TH_NPCSchedule]')) {
          console.log('[NpcSchedule] Found schedule templates:', entry.name)
          parseScheduleTemplates(entry.content)
          templatesLoaded = true
        }
        if (entry.name && entry.name.includes('[TH_ScheduleModifier]')) {
          console.log('[NpcSchedule] Found schedule modifiers:', entry.name)
          parseScheduleModifiers(entry.content)
          modifiersLoaded = true
        }
      }
    }
    if (templatesLoaded || modifiersLoaded) {
      console.log('[NpcSchedule] Schedule data loaded from worldbook')
      return true
    }
  } catch (e) {
    console.error('[NpcSchedule] Error loading schedule data:', e)
  }
  console.log('[NpcSchedule] No worldbook schedule data found, using defaults')
  return false
}

export async function initializeScheduleSystem(gameStore) {
  await loadScheduleDataFromWorldbook()
  if (gameStore?.npcs?.length > 0) {
    updateAllNpcLocations(gameStore, true)
  }
  console.log('[NpcSchedule] Schedule system initialized')
}

export function getSystemStatus() {
  return {
    templatesCount: loadedTemplates.size,
    assignmentsCount: npcAssignments.size,
    modifiersCount: conditionModifiers.length,
    cacheSize: locationCache.size,
    indexedLocations: locationNpcIndex.size,
    trackedNpcs: trackedNpcs.size,
    lastUpdateTime: lastFullUpdateTime
  }
}
