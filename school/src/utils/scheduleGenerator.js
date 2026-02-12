/**
 * 课表生成器
 * 根据班级的科任老师信息自动生成随机课表
 */

import { seededRandom } from './random.js'
import { WEEKDAY_MAP } from './constants.js'
import { getRequiredCourses } from '../data/coursePoolData.js'

// ============ 时间常量 ============

// 每日课程时间表
export const TIME_SLOTS = [
  { period: 1, start: '08:30', end: '09:15', type: 'morning' },
  { period: 2, start: '09:25', end: '10:10', type: 'morning' },
  { period: 3, start: '10:25', end: '11:10', type: 'morning' },
  { period: 4, start: '13:00', end: '13:45', type: 'afternoon' },
  { period: 5, start: '14:00', end: '14:45', type: 'afternoon' },
  { period: 6, start: '15:00', end: '15:30', type: 'afternoon' } // 最后一节课较短
]

export { WEEKDAY_MAP }

// ============ 节日与假期数据 ============

// 假期范围
export const VACATIONS = [
  { name: '暑假', startMonth: 7, startDay: 15, endMonth: 8, endDay: 31 },
  { name: '寒假', startMonth: 12, startDay: 25, endMonth: 1, endDay: 7 },
  { name: '春假', startMonth: 3, startDay: 20, endMonth: 3, endDay: 31 }
]

// 学期定义（用于周数计算）
// 每个学期从开始日起第一周为"第1周"
export const TERM_DEFINITIONS = [
  { id: 1, name: '第一学期', startMonth: 4, startDay: 1 },   // 4月1日开始
  { id: 2, name: '第二学期', startMonth: 9, startDay: 1 },   // 9月1日开始
  { id: 3, name: '第三学期', startMonth: 1, startDay: 8 }    // 1月8日开始
]

// 完整休假日（全天无课）
export const FULL_HOLIDAYS = [
  { month: 1, day: 1, id: 'event_new_year_shrine_visit', name: '新年参拜' },
  { month: 3, day: 10, id: 'event_graduation_ceremony', name: '毕业典礼' },
  { month: 4, day: 5, id: 'event_school_anniversary', name: '建校纪念日' }
]

// 范围型完整休假
export const FULL_HOLIDAY_RANGES = [
  { startMonth: 6, startDay: 1, endMonth: 6, endDay: 2, id: 'event_sports_festival', name: '体育祭' },
  { startMonth: 10, startDay: 25, endMonth: 10, endDay: 27, id: 'event_school_festival', name: '学园文化祭' }
]

// 考试周（包括周末，全天考试）
export const EXAM_WEEK_RANGES = [
  { startMonth: 7, startDay: 10, endMonth: 7, endDay: 14, id: 'event_exam_week_final', name: '期末考试周' },
  { startMonth: 11, startDay: 20, endMonth: 11, endDay: 24, id: 'event_exam_week_midterm', name: '期中考试周' }
]

// 上午无课
export const AM_OFF_EVENTS = [
  { month: 4, day: 8, id: 'event_welcome_ceremony', name: '新生欢迎会' }
]

// 下午无课
export const PM_OFF_EVENTS = [
  { month: 10, day: 31, id: 'event_halloween_party', name: '万圣节派对' }
]

export const PM_OFF_RANGES = [
  { startMonth: 10, startDay: 5, endMonth: 10, endDay: 9, id: 'event_arts_festival', name: '艺术节' }
]

// 特殊纪念日（照常上课，但在日历上标记）
export const SPECIAL_EVENTS = [
  { month: 2, day: 14, id: 'event_valentines_day', name: '情人节' },
  { month: 3, day: 14, id: 'event_white_day', name: '白色情人节' },
  { month: 4, day: 1, id: 'event_cherry_blossom_viewing', name: '赏樱会' },
  { month: 7, day: 7, id: 'event_tanabata', name: '七夕节' },
  { month: 12, day: 24, id: 'event_christmas_party', name: '圣诞晚会' }
]

// ============ 科目与地点映射 ============

/**
 * 科目 -> 可能的上课地点ID列表
 * 基于 worldbookData.js 中的地图数据
 */
export const SUBJECT_LOCATION_MAP = {
  // 普通教室类（默认在班级教室）
  '国语': ['classroom'],
  '数学': ['classroom'],
  '英语': ['classroom'],
  '历史': ['classroom'],
  '地理': ['classroom'],
  '政治': ['classroom'],
  '文学': ['classroom'],
  '哲学': ['classroom'],
  '逻辑学': ['classroom'],
  '心理学': ['classroom'],
  '人际关系学': ['classroom'],
  '媒体素养': ['classroom'],
  '社会实践': ['classroom'],
  '社会研究': ['classroom'],
  '古典文学': ['classroom'],
  '超自然研究': ['classroom', 'club_building_B'],
  '文化学': ['classroom'],
  '社会心理学': ['classroom'],
  '毕业论文指导': ['classroom', 'library'],
  '升学相谈': ['mb_counseling_room', 'classroom'],
  '升学指导': ['mb_counseling_room', 'classroom'],
  '班会': ['classroom'],
  
  // 理科类
  '物理': ['sb_physics_lab', 'classroom'],
  '化学': ['sb_chemistry_lab', 'classroom'],
  '生物': ['sb_biology_lab', 'classroom'],
  '信息技术': ['computer_room', 'computer_room_2'],
  '编程实践': ['computer_room', 'computer_room_2'],
  '媒体素养': ['computer_room_2', 'classroom'],
  
  // 体育类
  '体育': ['track_and_field', 'main_gymnasium', 'sub_gymnasium', 'tennis_court'],
  '运动生理学': ['main_gymnasium', 'classroom'],
  '教练学': ['main_gymnasium', 'track_and_field'],
  '体育保健': ['main_gymnasium', 'mb_clinic'],
  '营养学': ['classroom'],
  
  // 艺术类
  '音乐': ['music_room_1', 'music_room_2', 'music_building'],
  '美术': ['art_room_1', 'art_room_2', 'arts_building'],
  '艺术史': ['arts_building', 'classroom'],
  
  // 偶像科专用
  '声乐': ['music_room_1', 'music_room_2', 'recording_studio'],
  '舞蹈': ['main_gymnasium', 'sub_gymnasium'],
  '表演': ['auditorium', 'drama_club_room'],
  '偶像学': ['idol_activity_room', 'classroom'],
  '形象设计': ['classroom'],
  '文化课': ['classroom'],
  '作词作曲': ['music_room_1', 'recording_studio'],
  '粉丝沟通': ['classroom'],
  '和声': ['music_room_1', 'music_room_2'],
  '舞台剧表演': ['auditorium'],
  '职业生涯规划': ['classroom', 'mb_counseling_room'],
  '媒体应对': ['classroom'],
  '毕业公演排练': ['auditorium'],
  
  // 其他
  '第二外语': ['classroom'],
  '英语体育新闻': ['classroom'],
  '自由选修': ['classroom', 'library']
}

// 班级教室ID映射
export const CLASS_ROOM_MAP = {
  '1-A': 'classroom_1a',
  '1-B': 'classroom_1b',
  '1-C': 'classroom_1c',
  '1-D': 'classroom_1d',
  '1-E': 'classroom_1e',
  '2-A': 'classroom_2a',
  '2-B': 'classroom_2b',
  '2-C': 'classroom_2c',
  '2-D': 'classroom_2d',
  '2-E': 'classroom_2e',
  '3-A': 'classroom_3a',
  '3-B': 'classroom_3b',
  '3-C': 'classroom_3c',
  '3-D': 'classroom_3d',
  '3-E': 'classroom_3e'
}

// 地点ID到名称的映射
export const LOCATION_NAMES = {
  'classroom_1a': '1年A班教室',
  'classroom_1b': '1年B班教室',
  'classroom_1c': '1年C班教室',
  'classroom_1d': '1年D班教室',
  'classroom_1e': '1年E班教室',
  'classroom_2a': '2年A班教室',
  'classroom_2b': '2年B班教室',
  'classroom_2c': '2年C班教室',
  'classroom_2d': '2年D班教室',
  'classroom_2e': '2年E班教室',
  'classroom_3a': '3年A班教室',
  'classroom_3b': '3年B班教室',
  'classroom_3c': '3年C班教室',
  'classroom_3d': '3年D班教室',
  'classroom_3e': '3年E班教室',
  'sb_physics_lab': '物理实验室',
  'sb_chemistry_lab': '化学实验室',
  'sb_biology_lab': '生物实验室',
  'track_and_field': '田径场',
  'main_gymnasium': '第一体育馆',
  'sub_gymnasium': '第二体育馆',
  'tennis_court': '网球场',
  'swimming_pool_building': '游泳馆',
  'music_room_1': '第一音乐教室',
  'music_room_2': '第二音乐教室',
  'music_building': '音乐楼',
  'recording_studio': '录音室',
  'art_room_1': '第一美术教室',
  'art_room_2': '第二美术教室',
  'arts_building': '艺术楼',
  'auditorium': '大礼堂',
  'drama_club_room': '演剧部活动室',
  'idol_activity_room': '偶像研究社活动室',
  'library': '图书馆',
  'mb_counseling_room': '心理咨询室',
  'mb_clinic': '医务室',
  'club_building_B': '第二社团活动楼',
  'computer_room': '第一计算机室',
  'computer_room_2': '第二计算机室',
  'home_economics_room': '家政教室'
}

// ============ 工具函数 ============

/**
 * 检查日期是否在假期范围内
 * @param {number} month 月份 (1-12)
 * @param {number} day 日期 (1-31)
 * @returns {Object|null} 假期信息或null
 */
export function checkVacation(month, day) {
  for (const vacation of VACATIONS) {
    const inRange = isDateInRange(
      month, day,
      vacation.startMonth, vacation.startDay,
      vacation.endMonth, vacation.endDay
    )
    if (inRange) {
      return { type: 'vacation', name: vacation.name }
    }
  }
  return null
}

/**
 * 检查日期是否在范围内（支持跨年）
 */
function isDateInRange(month, day, startMonth, startDay, endMonth, endDay) {
  const current = month * 100 + day
  const start = startMonth * 100 + startDay
  const end = endMonth * 100 + endDay
  
  if (start <= end) {
    // 不跨年
    return current >= start && current <= end
  } else {
    // 跨年（如 12月 到 次年2月）
    return current >= start || current <= end
  }
}

/**
 * 检查某天的课程安排状态
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {Object} { isHoliday, holidayType, eventInfo }
 *   holidayType: 'full' | 'am_off' | 'pm_off' | 'none'
 */
export function checkDayStatus(month, day) {
  // 1. 检查假期
  const vacation = checkVacation(month, day)
  if (vacation) {
    return {
      isHoliday: true,
      holidayType: 'full',
      eventInfo: vacation
    }
  }
  
  // 2. 检查完整休假日
  for (const holiday of FULL_HOLIDAYS) {
    if (holiday.month === month && holiday.day === day) {
      return {
        isHoliday: true,
        holidayType: 'full',
        eventInfo: { id: holiday.id, name: holiday.name }
      }
    }
  }
  
  // 3. 检查范围型完整休假
  for (const range of FULL_HOLIDAY_RANGES) {
    if (isDateInRange(month, day, range.startMonth, range.startDay, range.endMonth, range.endDay)) {
      return {
        isHoliday: true,
        holidayType: 'full',
        eventInfo: { id: range.id, name: range.name }
      }
    }
  }
  
  // 3.5 检查考试周（全天考试，包括周末）
  for (const range of EXAM_WEEK_RANGES) {
    if (isDateInRange(month, day, range.startMonth, range.startDay, range.endMonth, range.endDay)) {
      return {
        isHoliday: false,
        holidayType: 'exam',
        eventInfo: { id: range.id, name: range.name, isExam: true }
      }
    }
  }
  
  // 4. 检查上午无课
  for (const event of AM_OFF_EVENTS) {
    if (event.month === month && event.day === day) {
      return {
        isHoliday: false,
        holidayType: 'am_off',
        eventInfo: { id: event.id, name: event.name }
      }
    }
  }
  
  // 5. 检查下午无课
  for (const event of PM_OFF_EVENTS) {
    if (event.month === month && event.day === day) {
      return {
        isHoliday: false,
        holidayType: 'pm_off',
        eventInfo: { id: event.id, name: event.name }
      }
    }
  }
  
  for (const range of PM_OFF_RANGES) {
    if (isDateInRange(month, day, range.startMonth, range.startDay, range.endMonth, range.endDay)) {
      return {
        isHoliday: false,
        holidayType: 'pm_off',
        eventInfo: { id: range.id, name: range.name }
      }
    }
  }
  
  // 6. 检查特殊纪念日（照常上课）
  for (const event of SPECIAL_EVENTS) {
    if (event.month === month && event.day === day) {
      return {
        isHoliday: false,
        holidayType: 'none',
        eventInfo: { id: event.id, name: event.name, isSpecial: true }
      }
    }
  }
  
  return {
    isHoliday: false,
    holidayType: 'none',
    eventInfo: null
  }
}

/**
 * 检查是否是周末
 * @param {string} weekday 星期（支持中英文）
 */
export function isWeekend(weekday) {
  const normalized = WEEKDAY_MAP[weekday] || weekday
  return normalized === 'Saturday' || normalized === 'Sunday' ||
         weekday === '星期六' || weekday === '星期日' ||
         weekday === '周六' || weekday === '周日'
}

/**
 * 获取星期的中文名
 */
export function getWeekdayChinese(weekday) {
  if (weekday.startsWith('星期') || weekday.startsWith('周')) {
    return weekday
  }
  return WEEKDAY_MAP[weekday] || weekday
}

/**
 * 获取星期的英文名
 */
export function getWeekdayEnglish(weekday) {
  if (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(weekday)) {
    return weekday
  }
  return WEEKDAY_MAP[weekday] || weekday
}

/**
 * 获取当前学期信息
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {Object} { termId, termName, weekNumber, isVacation, vacationName }
 */
export function getTermInfo(year, month, day) {
  // 首先检查是否在假期中
  const vacation = checkVacation(month, day)
  if (vacation) {
    return {
      termId: null,
      termName: null,
      weekNumber: null,
      isVacation: true,
      vacationName: vacation.name
    }
  }
  
  // 确定当前属于哪个学期
  // 学期顺序：第三学期(1-3月) -> 第一学期(4-7月) -> 第二学期(9-12月)
  let currentTerm = null
  let termStartDate = null
  
  const currentDate = new Date(year, month - 1, day)
  
  // 按日期顺序检查学期
  if (month >= 4 && month <= 7) {
    // 第一学期 4-7月
    currentTerm = TERM_DEFINITIONS[0]
    termStartDate = new Date(year, 3, 1) // 4月1日
  } else if (month >= 9 && month <= 12) {
    // 第二学期 9-12月
    currentTerm = TERM_DEFINITIONS[1]
    termStartDate = new Date(year, 8, 1) // 9月1日
  } else if (month >= 1 && month <= 3) {
    // 第三学期 1-3月
    currentTerm = TERM_DEFINITIONS[2]
    termStartDate = new Date(year, 0, 8) // 1月8日
  } else if (month === 8) {
    // 8月份在暑假中，应该已经被上面的 checkVacation 捕获
    // 但如果是8月1日-14日，可能不在假期范围内，归入第一学期末尾
    currentTerm = TERM_DEFINITIONS[0]
    termStartDate = new Date(year, 3, 1)
  }
  
  if (!currentTerm || !termStartDate) {
    return {
      termId: null,
      termName: null,
      weekNumber: 1,
      isVacation: false,
      vacationName: null
    }
  }
  
  // 计算周数
  const diffTime = currentDate.getTime() - termStartDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const weekNumber = Math.floor(diffDays / 7) + 1
  
  return {
    termId: currentTerm.id,
    termName: currentTerm.name,
    weekNumber: Math.max(1, weekNumber),
    isVacation: false,
    vacationName: null
  }
}

// ============ 课表生成 ============

/**
 * 从班级数据中提取科目列表
 * @param {Object} classInfo 班级信息对象
 * @returns {Array} 科目数组 [{ subject, teacher }]
 */
export function extractSubjects(classInfo) {
  if (!classInfo || !classInfo.teachers) return []
  
  const subjects = []
  for (const teacher of classInfo.teachers) {
    if (teacher.subject) {
      subjects.push({
        subject: teacher.subject,
        teacher: teacher.name
      })
    }
  }
  
  // 如果有班主任且班主任也教课（通常是某科目老师）
  if (classInfo.headTeacher && classInfo.headTeacher.name) {
    // 班主任的科目已经在teachers中，不重复添加
  }
  
  return subjects
}

/**
 * 为科目选择一个随机地点
 * @param {string} subject 科目名
 * @param {string} classId 班级ID
 * @param {string} [classroomId] 可选，班级数据中的自定义教室ID（优先于硬编码映射）
 * @returns {Object} { locationId, locationName }
 */
export function getRandomLocation(subject, classId, classroomId) {
  const possibleLocations = SUBJECT_LOCATION_MAP[subject] || ['classroom']
  // 优先使用传入的 classroomId，其次查硬编码映射，最后用 classId 推导
  const classRoom = classroomId || CLASS_ROOM_MAP[classId] || `classroom_${classId.toLowerCase().replace('-', '')}`
  
  // 将 'classroom' 替换为实际班级教室
  const actualLocations = possibleLocations.map(loc => 
    loc === 'classroom' ? classRoom : loc
  )
  
  // 随机选择
  const locationId = actualLocations[Math.floor(Math.random() * actualLocations.length)]
  const locationName = LOCATION_NAMES[locationId] || locationId
  
  return { locationId, locationName }
}

/**
 * 生成一周的课表
 * @param {string} classId 班级ID (如 '1-A')
 * @param {Object} classInfo 从worldbookData解析的班级信息
 * @param {number} weekNumber 周数（用于随机种子，使同一周的课表一致）
 * @returns {Object} 周课表
 */
export function generateWeeklySchedule(classId, classInfo, weekNumber = 1) {
  const seed = hashCode(`${classId}-${weekNumber}`)
  const random = seededRandom(seed)
  
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const schedule = {}
  
  // 初始化空课表
  for (const day of weekdays) {
    schedule[day] = Array(6).fill(null).map((_, index) => ({
      period: index + 1,
      start: TIME_SLOTS[index].start,
      end: TIME_SLOTS[index].end,
      type: TIME_SLOTS[index].type,
      subject: null,
      teacher: null,
      location: null,
      locationId: null,
      isEmpty: true
    }))
  }

  // 1. 优先安排必修课
  // 获取必修课列表
  const requiredCourses = getRequiredCourses(classId) || []
  const shuffledRequired = [...requiredCourses].sort(() => random() - 0.5)
  
  // 必修课优先填入上午第1-3节，其次下午第1节 (Period 4)
  // 避免下午第2-3节 (Period 5-6)
  const prioritySlots = []
  weekdays.forEach(day => {
    // Morning 1-3 (Indices 0, 1, 2)
    prioritySlots.push({ day, index: 0 })
    prioritySlots.push({ day, index: 1 })
    prioritySlots.push({ day, index: 2 })
  })
  
  // 如果优先槽位不够，使用 Period 4 (Index 3)
  const secondarySlots = []
  weekdays.forEach(day => {
    secondarySlots.push({ day, index: 3 })
  })
  
  // 打乱槽位顺序，避免每天课程顺序固定
  prioritySlots.sort(() => random() - 0.5)
  secondarySlots.sort(() => random() - 0.5)
  
  const allSlots = [...prioritySlots, ...secondarySlots]
  
  // 从 classInfo 中获取自定义教室ID（优先于硬编码映射）
  const classroomId = classInfo?.classroomId || null
  
  // 填入必修课
  const scheduledTeachers = new Set() // 记录已排课的老师/科目，避免重复
  
  for (const course of shuffledRequired) {
    // 找一个空槽位
    const slotInfo = allSlots.find(s => schedule[s.day][s.index].isEmpty)
    if (slotInfo) {
      const slot = schedule[slotInfo.day][slotInfo.index]
      
      // 分配课程
      // @ts-ignore
      const location = getRandomLocation(course.name, classId, classroomId)
      
      slot.subject = course.name
      slot.teacher = course.teacher
      slot.location = location.locationName
      slot.locationId = location.locationId
      slot.isEmpty = false
      
      // 记录老师
      if (course.teacher) {
        scheduledTeachers.add(course.teacher)
      }
    }
  }
  
  // 2. 安排班会课 (Homeroom)
  // 在下午选修课时间 (Period 5-6) 找一个空位，通常每周一节
  // 优先周五下午，或者随机
  const homeroomSlots = []
  weekdays.forEach(day => {
    homeroomSlots.push({ day, index: 4 }) // Period 5
    homeroomSlots.push({ day, index: 5 }) // Period 6
  })
  // 倒序检查（优先周五）
  homeroomSlots.reverse()
  
  const homeroomSlotInfo = homeroomSlots.find(s => schedule[s.day][s.index].isEmpty)
  
  if (homeroomSlotInfo && classInfo.headTeacher) {
    const slot = schedule[homeroomSlotInfo.day][homeroomSlotInfo.index]
    slot.subject = '班会'
    slot.teacher = classInfo.headTeacher.name
    // 班会通常在教室
    const location = getRandomLocation('班会', classId, classroomId)
    slot.location = location.locationName
    slot.locationId = location.locationId
    slot.isEmpty = false
  }
  
  // 3. 填充剩余空位 (模拟大学课表，保留部分空闲)
  const regularSubjects = extractSubjects(classInfo)
  
  if (regularSubjects.length > 0) {
    // 遍历所有 Period 1-4 的空位 (主课时间)
    for (const day of weekdays) {
      for (let i = 0; i < 4; i++) { // Only fill Period 1-4 randomly
        const slot = schedule[day][i]
        if (slot.isEmpty) {
          // 约 30% 概率保留空课 (模拟大学)
          if (random() < 0.3) continue
          
          // 随机选择一个科目
          // 稍微倾向于选择还没有排太多课的老师？目前简单随机
          const subjectInfo = regularSubjects[Math.floor(random() * regularSubjects.length)]
          
          const location = getRandomLocation(subjectInfo.subject, classId, classroomId)
          
          slot.subject = subjectInfo.subject
          slot.teacher = subjectInfo.teacher
          slot.location = location.locationName
          slot.locationId = location.locationId
          slot.isEmpty = false
        }
      }
    }
  }
  
  return schedule
}

/**
 * 简单哈希函数
 */
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

// ============ 课程状态查询 ============

/**
 * 将时间字符串转为分钟数
 * @param {string} timeStr "HH:MM" 格式
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * 获取当前时间对应的课程状态
 * @param {Object} gameTime { hour, minute, weekday, month, day }
 * @param {Object} weeklySchedule 周课表
 * @returns {Object} 课程状态信息
 */
export function getCurrentClassStatus(gameTime, weeklySchedule) {
  const { hour, minute, weekday, month, day } = gameTime
  
  // 1. 检查是否是周末
  if (isWeekend(weekday)) {
    return {
      status: 'weekend',
      message: '今天是周末，没有课程安排'
    }
  }
  
  // 2. 检查节假日状态
  const dayStatus = checkDayStatus(month, day)
  
  if (dayStatus.isHoliday) {
    return {
      status: 'holiday',
      message: `今天是${dayStatus.eventInfo.name}，全天无课`,
      eventInfo: dayStatus.eventInfo
    }
  }

  // 2.5 检查考试周
  if (dayStatus.holidayType === 'exam') {
    return {
      status: 'exam',
      message: `今天是${dayStatus.eventInfo.name}，全天考试`,
      eventInfo: dayStatus.eventInfo
    }
  }
  
  // 3. 获取当天课表
  const englishWeekday = getWeekdayEnglish(weekday)
  const todaySchedule = weeklySchedule[englishWeekday]
  
  if (!todaySchedule || todaySchedule.length === 0) {
    return {
      status: 'no_schedule',
      message: '今天没有安排课程'
    }
  }
  
  // 4. 过滤部分休假
  let effectiveSchedule = [...todaySchedule]
  
  if (dayStatus.holidayType === 'am_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'morning')
  } else if (dayStatus.holidayType === 'pm_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'afternoon')
  }
  
  // 5. 计算当前时间
  const currentMinutes = hour * 60 + minute
  
  // 6. 检查是否在午休时间
  const lunchStart = timeToMinutes('11:30')
  const lunchEnd = timeToMinutes('13:00')
  if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
    // 找下午第一节课
    const afternoonClass = effectiveSchedule.find(c => c.type === 'afternoon' && !c.isEmpty)
    if (afternoonClass) {
      return {
        status: 'lunch',
        message: '现在是午休时间',
        nextClass: afternoonClass,
        eventInfo: dayStatus.eventInfo
      }
    }
    return {
      status: 'lunch',
      message: '现在是午休时间，下午无课',
      eventInfo: dayStatus.eventInfo
    }
  }
  
  // 7. 检查是否在社团时间
  const clubStart = timeToMinutes('15:30')
  if (currentMinutes >= clubStart) {
    return {
      status: 'club_time',
      message: '现在是社团活动时间',
      eventInfo: dayStatus.eventInfo
    }
  }
  
  // 8. 检查是否在上课前
  const firstClass = effectiveSchedule.find(c => !c.isEmpty)
  if (firstClass) {
    const firstStart = timeToMinutes(firstClass.start)
    if (currentMinutes < firstStart) {
      return {
        status: 'before_school',
        message: '课程尚未开始',
        nextClass: firstClass,
        eventInfo: dayStatus.eventInfo
      }
    }
  }
  
  // 9. 查找当前正在上的课或下一节课
  for (let i = 0; i < effectiveSchedule.length; i++) {
    const classInfo = effectiveSchedule[i]
    if (classInfo.isEmpty) continue
    
    const start = timeToMinutes(classInfo.start)
    const end = timeToMinutes(classInfo.end)
    
    if (currentMinutes >= start && currentMinutes < end) {
      // 正在上课
      return {
        status: 'in_class',
        currentClass: classInfo,
        message: `现在是${classInfo.subject}课，地点：${classInfo.location}，下课时间：${classInfo.end}`,
        eventInfo: dayStatus.eventInfo
      }
    } else if (currentMinutes < start) {
      // 找到了下一节课
      return {
        status: 'between_classes',
        nextClass: classInfo,
        message: `下一节课是${classInfo.subject}，地点：${classInfo.location}，上课时间：${classInfo.start}`,
        eventInfo: dayStatus.eventInfo
      }
    }
  }
  
  // 10. 所有课程都已结束
  return {
    status: 'after_classes',
    message: '今日课程已结束',
    eventInfo: dayStatus.eventInfo
  }
}

/**
 * 获取今日课表摘要
 * @param {Object} gameTime 游戏时间
 * @param {Object} weeklySchedule 周课表
 * @returns {string} 课表摘要文本
 */
export function getTodayScheduleSummary(gameTime, weeklySchedule) {
  const { weekday, month, day } = gameTime
  
  // 检查周末
  if (isWeekend(weekday)) {
    return '今天是周末，无课程安排。'
  }
  
  // 检查假期
  const dayStatus = checkDayStatus(month, day)
  if (dayStatus.isHoliday) {
    return `今天是${dayStatus.eventInfo.name}，无课程安排。`
  }

  // 检查考试周
  if (dayStatus.holidayType === 'exam') {
    return `今天是${dayStatus.eventInfo.name}，全天进行考试安排。`
  }
  
  const englishWeekday = getWeekdayEnglish(weekday)
  const todaySchedule = weeklySchedule[englishWeekday]
  
  if (!todaySchedule || todaySchedule.length === 0) {
    return '今天没有安排课程。'
  }
  
  // 过滤部分休假
  let effectiveSchedule = [...todaySchedule]
  let prefix = ''
  
  if (dayStatus.holidayType === 'am_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'morning')
    prefix = `今天是${dayStatus.eventInfo.name}，上午无课。\n`
  } else if (dayStatus.holidayType === 'pm_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'afternoon')
    prefix = `今天是${dayStatus.eventInfo.name}，下午无课。\n`
  } else if (dayStatus.eventInfo && dayStatus.eventInfo.isSpecial) {
    prefix = `今天是${dayStatus.eventInfo.name}。\n`
  }
  
  // 生成课表摘要
  const classes = effectiveSchedule
    .filter(c => !c.isEmpty)
    .map(c => `${c.start} ${c.subject}(${c.location})`)
  
  if (classes.length === 0) {
    return prefix + '今天无课程安排。'
  }
  
  return prefix + '今日课表：' + classes.join('→')
}

/**
 * 获取明日课表摘要（预告）
 * @param {Object} gameTime 游戏时间
 * @param {Object} weeklySchedule 周课表
 * @returns {string} 明日课表摘要文本
 */
export function getNextDayScheduleSummary(gameTime, weeklySchedule) {
  const { year, month, day } = gameTime
  
  // 计算明天日期
  const today = new Date(year, month - 1, day)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  
  const tmrMonth = tomorrow.getMonth() + 1
  const tmrDay = tomorrow.getDate()
  
  // 获取明天是周几
  const tmrWeekdayIndex = tomorrow.getDay() // 0-6, 0 is Sunday
  const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const tmrWeekdayEn = weekdaysEn[tmrWeekdayIndex]
  const tmrWeekdayCn = getWeekdayChinese(tmrWeekdayEn)
  
  // 1. 检查明天是否是假期
  const dayStatus = checkDayStatus(tmrMonth, tmrDay)
  
  if (dayStatus.isHoliday) {
    return `\n[明日预告] 明天是${tmrWeekdayCn}，${dayStatus.eventInfo.name}（全天休假）。`
  }
  
  if (dayStatus.holidayType === 'exam') {
    return `\n[明日预告] 明天是${tmrWeekdayCn}，${dayStatus.eventInfo.name}（全天考试）。`
  }
  
  // 2. 检查明天是否是周末
  if (isWeekend(tmrWeekdayEn)) {
    return `\n[明日预告] 明天是${tmrWeekdayCn}，周末休息。`
  }
  
  // 3. 获取明天课表
  const tomorrowSchedule = weeklySchedule[tmrWeekdayEn]
  
  if (!tomorrowSchedule || tomorrowSchedule.length === 0) {
    // 正常上课日但无课表数据（可能是周一至周五但未生成）
    return `\n[明日预告] 明天是${tmrWeekdayCn}，暂无课程安排。`
  }
  
  // 4. 过滤部分休假
  let effectiveSchedule = [...tomorrowSchedule]
  let prefix = `\n[明日预告] 明天是${tmrWeekdayCn}。`
  
  if (dayStatus.holidayType === 'am_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'morning')
    prefix = `\n[明日预告] 明天是${tmrWeekdayCn}，${dayStatus.eventInfo.name}（上午休假）。`
  } else if (dayStatus.holidayType === 'pm_off') {
    effectiveSchedule = effectiveSchedule.filter(c => c.type !== 'afternoon')
    prefix = `\n[明日预告] 明天是${tmrWeekdayCn}，${dayStatus.eventInfo.name}（下午休假）。`
  }
  
  // 5. 生成课表字符串
  const classes = effectiveSchedule
    .filter(c => !c.isEmpty)
    .map(c => `${c.start} ${c.subject}(${c.location})`)
  
  if (classes.length === 0) {
    return prefix + '全天无课。'
  }
  
  return prefix + '课程：' + classes.join('→')
}

/**
 * 获取指定周数的完整一周事件和课程
 * @param {number} year 年份
 * @param {number} month 当前月份 
 * @param {number} day 当前日期
 * @returns {Array} 本月所有日期的事件信息
 */
export function getMonthEvents(year, month) {
  const events = []
  const daysInMonth = new Date(year, month, 0).getDate()
  
  for (let day = 1; day <= daysInMonth; day++) {
    const status = checkDayStatus(month, day)
    const date = new Date(year, month - 1, day)
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()]
    
    events.push({
      day,
      weekday,
      isWeekend: isWeekend(weekday),
      ...status
    })
  }
  
  return events
}
