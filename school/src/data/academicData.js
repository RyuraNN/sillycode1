/**
 * 学业系统数据配置
 * 定义学力原型、科目特长、考试日历等
 */

// ==================== 学力原型 ====================

/**
 * 学力等级基础分范围
 * 每个等级对应各科目的基础分范围 [min, max]
 */
export const BASE_RANGES = {
  top: {
    default: [78, 95],
    literature: [80, 95],
    math: [82, 98],
    english: [78, 95],
    humanities: [75, 92],
    sciences: [80, 96],
    art: [70, 90],
    sports: [65, 85]
  },
  above_avg: {
    default: [62, 82],
    literature: [65, 85],
    math: [60, 82],
    english: [62, 82],
    humanities: [60, 80],
    sciences: [62, 82],
    art: [58, 78],
    sports: [55, 75]
  },
  avg: {
    default: [45, 68],
    literature: [48, 70],
    math: [42, 65],
    english: [45, 68],
    humanities: [48, 70],
    sciences: [42, 65],
    art: [45, 68],
    sports: [45, 68]
  },
  below_avg: {
    default: [30, 52],
    literature: [32, 55],
    math: [28, 50],
    english: [30, 52],
    humanities: [35, 55],
    sciences: [28, 50],
    art: [35, 55],
    sports: [38, 58]
  },
  poor: {
    default: [15, 38],
    literature: [18, 40],
    math: [12, 35],
    english: [15, 38],
    humanities: [20, 42],
    sciences: [12, 35],
    art: [20, 42],
    sports: [25, 45]
  }
}

/**
 * 潜力等级对应的最大成长加成
 */
export const POTENTIAL_MAP = {
  very_high: 40,
  high: 25,
  medium: 15,
  low: 5
}

/**
 * 潜力系数 (用于个人教学)
 * 决定了该NPC在单独辅导时的成长倍率
 * 高区分度: 0.5 ~ 2.0
 */
export const POTENTIAL_FACTORS = {
  very_high: 2.0, // 天才，双倍速成长
  high: 1.5,
  medium: 1.0,    // 基准
  low: 0.5        // 几乎无效
}

/**
 * 能力系数 (用于班级教学)
 * 决定了该NPC在集体授课时的吸收效率
 * 高区分度: 0.4 ~ 1.5
 */
export const LEVEL_FACTORS = {
  top: 1.5,       // 学霸，吸收快
  above_avg: 1.2,
  avg: 1.0,       // 基准
  below_avg: 0.7, // 略吃力
  poor: 0.4       // 听天书
}

/**
 * 学力等级顺序 (从低到高)
 */
export const LEVEL_ORDER = ['poor', 'below_avg', 'avg', 'above_avg', 'top']

/**
 * 学力升级阈值
 * 当前等级 -> 下一等级 所需的 subjectExp
 */
export const LEVEL_UP_THRESHOLDS = {
  poor: 50,       // poor -> below_avg
  below_avg: 80,  // below_avg -> avg
  avg: 120,       // avg -> above_avg
  above_avg: 200, // above_avg -> top
  top: Infinity   // 已满级
}

/**
 * 教学质量系数
 * 决定了玩家教学表现对成长的影响
 * 范围: 0.5 ~ 2.5
 */
export const TEACHING_QUALITY_FACTORS = {
  perfect: 2.5,   // 神级教学
  good: 1.5,      // 优秀
  normal: 1.0,    // 及格
  bad: 0.5        // 糟糕
}

// ==================== 科目特长/弱项映射 ====================

/**
 * 科目特长标签 → 科目名 + 偏移值
 * 格式: trait_id → { subject, bonus }
 */
export const SUBJECT_TRAITS = {
  // 强项 (+8~+15)
  math_strong: { subject: 'math', bonus: 12 },
  literature_strong: { subject: 'literature', bonus: 12 },
  english_strong: { subject: 'english', bonus: 12 },
  humanities_strong: { subject: 'humanities', bonus: 10 },
  sciences_strong: { subject: 'sciences', bonus: 12 },
  art_strong: { subject: 'art', bonus: 12 },
  sports_strong: { subject: 'sports', bonus: 15 },
  music_strong: { subject: 'art', bonus: 10 },
  
  // 弱项 (-8~-15)
  math_weak: { subject: 'math', bonus: -12 },
  literature_weak: { subject: 'literature', bonus: -10 },
  english_weak: { subject: 'english', bonus: -12 },
  humanities_weak: { subject: 'humanities', bonus: -8 },
  sciences_weak: { subject: 'sciences', bonus: -12 },
  art_weak: { subject: 'art', bonus: -10 },
  sports_weak: { subject: 'sports', bonus: -15 }
}

// ==================== 科目系统名称映射 ====================

/**
 * 中文科目名 → 系统科目key
 * 用于将AI输出的中文科目名映射到系统内部的key
 */
export const SUBJECT_NAME_MAP = {
  '语文': 'literature',
  '国语': 'literature',
  '文学': 'literature',
  '数学': 'math',
  '英语': 'english',
  '英文': 'english',
  '文综': 'humanities',
  '文科': 'humanities',
  '历史': 'humanities',
  '地理': 'humanities',
  '政治': 'humanities',
  '理综': 'sciences',
  '理科': 'sciences',
  '物理': 'sciences',
  '化学': 'sciences',
  '生物': 'sciences',
  '美术': 'art',
  '音乐': 'art',
  '艺术': 'art',
  '体育': 'sports',
  // 英文key直接映射
  'literature': 'literature',
  'math': 'math',
  'english': 'english',
  'humanities': 'humanities',
  'sciences': 'sciences',
  'art': 'art',
  'sports': 'sports'
}

/**
 * 系统科目key → 中文显示名
 * 同时作为 SUBJECT_MAP 使用（key列表 + 显示名）
 */
export const SUBJECT_DISPLAY_NAMES = {
  literature: '语文',
  math: '数学',
  english: '英语',
  humanities: '文综',
  sciences: '理综',
  art: '艺术',
  sports: '体育'
}

/** 别名: SUBJECT_MAP = SUBJECT_DISPLAY_NAMES */
export const SUBJECT_MAP = SUBJECT_DISPLAY_NAMES

/**
 * 所有必修科目的key列表
 */
export const ALL_SUBJECTS = ['literature', 'math', 'english', 'humanities', 'sciences', 'art', 'sports']

// ==================== 考试日程表 ====================

/**
 * 静态考试日程（用于快速查表）
 * 月考在 shouldHaveMonthlyExam 中动态判断
 */
export const EXAM_SCHEDULE = [
  // 月考 (每月25日，排除假期月)
  { month: 4, day: 25, type: 'monthly', label: '4月月考' },
  { month: 5, day: 25, type: 'monthly', label: '5月月考' },
  { month: 6, day: 25, type: 'monthly', label: '6月月考' },
  { month: 9, day: 25, type: 'monthly', label: '9月月考' },
  { month: 10, day: 25, type: 'monthly', label: '10月月考' },
  // 期中考试
  { month: 11, day: 20, type: 'midterm', label: '期中考试' },
  // 期末考试
  { month: 7, day: 10, type: 'final', label: '期末考试' },
]

// ==================== 考试日历 ====================

/**
 * 月考日期：每月25日（排除假期月）
 * 假期月份：暑假(7/15-8/31)、寒假(12/25-1/7)、春假(3/20-3/31)
 */
export const MONTHLY_EXAM_DAY = 25

/**
 * 应该举行月考的月份列表（原定25日）
 * 排除：暑假月(7,8)、期中月(11)、寒假起始(12)
 */
export const MONTHLY_EXAM_MONTHS = [1, 2, 3, 4, 5, 6, 9, 10]

/**
 * 检查某月是否应该举行月考（基于原定日期判断）
 * @param {number} month 月份 1-12
 * @param {number} day 日期 1-31
 * @returns {boolean}
 */
export function shouldHaveMonthlyExam(month, day) {
  if (day !== MONTHLY_EXAM_DAY) return false
  
  // 暑假月份跳过 (7-8月)
  if (month === 7 || month === 8) return false
  
  // 期中/期末考试月份跳过（已有大型考试）
  // 期末: 7/10-14, 期中: 11/20-24
  // 11月有期中考了，跳过月考
  if (month === 11) return false
  
  // 寒假期间跳过 (12月25日正好是寒假开始)
  if (month === 12 && day >= 25) return false
  
  // 1月寒假跳过 (1/1-1/7)
  if (month === 1 && day <= 7) return false
  
  // 春假跳过 (3/20-3/31)
  if (month === 3 && day >= 20) return false
  
  return true
}

/**
 * 获取考试类型
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {'monthly'|'midterm'|'final'|null}
 */
export function getExamType(month, day) {
  // 期末考试周: 7/10-14
  if (month === 7 && day >= 10 && day <= 14) return 'final'
  
  // 期中考试周: 11/20-24
  if (month === 11 && day >= 20 && day <= 24) return 'midterm'
  
  // 月考
  if (shouldHaveMonthlyExam(month, day)) return 'monthly'
  
  return null
}

/**
 * 获取考试ID
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {string} examType 考试类型
 * @returns {string}
 */
export function getExamId(year, month, examType) {
  return `${year}-${String(month).padStart(2, '0')}-${examType}`
}

// ==================== 考试日顺移逻辑 ====================

/**
 * 假期范围定义（与 scheduleGenerator.js 中的 VACATIONS 保持同步）
 * 用于判断某日是否为假期
 */
const VACATION_RANGES = [
  { startMonth: 7, startDay: 15, endMonth: 8, endDay: 31 },
  { startMonth: 12, startDay: 25, endMonth: 1, endDay: 7 },
  { startMonth: 3, startDay: 20, endMonth: 3, endDay: 31 }
]

/**
 * 完整休假日（与 scheduleGenerator.js 中的 FULL_HOLIDAYS 保持同步）
 */
const HOLIDAY_DATES = [
  { month: 1, day: 1 },
  { month: 3, day: 10 },
  { month: 4, day: 5 }
]

/**
 * 范围型完整休假（与 scheduleGenerator.js 中的 FULL_HOLIDAY_RANGES 保持同步）
 */
const HOLIDAY_RANGES = [
  { startMonth: 6, startDay: 1, endMonth: 6, endDay: 2 },
  { startMonth: 10, startDay: 25, endMonth: 10, endDay: 27 }
]

/**
 * 考试周范围（不能把月考顺移到考试周内）
 */
const EXAM_WEEK_RANGES_DATA = [
  { startMonth: 7, startDay: 10, endMonth: 7, endDay: 14 },
  { startMonth: 11, startDay: 20, endMonth: 11, endDay: 24 }
]

/**
 * 检查日期是否在范围内（支持跨年）
 */
function _isDateInRange(month, day, startMonth, startDay, endMonth, endDay) {
  const current = month * 100 + day
  const start = startMonth * 100 + startDay
  const end = endMonth * 100 + endDay
  
  if (start <= end) {
    return current >= start && current <= end
  } else {
    return current >= start || current <= end
  }
}

/**
 * 检查某天是否是工作日（非周末、非假期、非考试周）
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {boolean}
 */
export function isWorkday(year, month, day) {
  const date = new Date(year, month - 1, day)
  const weekdayIndex = date.getDay()
  
  // 周末不是工作日
  if (weekdayIndex === 0 || weekdayIndex === 6) return false
  
  // 检查假期
  for (const v of VACATION_RANGES) {
    if (_isDateInRange(month, day, v.startMonth, v.startDay, v.endMonth, v.endDay)) return false
  }
  
  // 检查完整休假日
  for (const h of HOLIDAY_DATES) {
    if (h.month === month && h.day === day) return false
  }
  
  // 检查范围型休假
  for (const r of HOLIDAY_RANGES) {
    if (_isDateInRange(month, day, r.startMonth, r.startDay, r.endMonth, r.endDay)) return false
  }
  
  // 检查考试周范围（不能顺移到考试周内）
  for (const e of EXAM_WEEK_RANGES_DATA) {
    if (_isDateInRange(month, day, e.startMonth, e.startDay, e.endMonth, e.endDay)) return false
  }
  
  return true
}

/**
 * 将考试日期顺移到下一个工作日（如果原日期是周末或假期）
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {{ year: number, month: number, day: number }} 实际考试日期
 */
export function resolveExamDate(year, month, day) {
  let date = new Date(year, month - 1, day)
  
  // 最多顺移14天
  for (let i = 0; i < 14; i++) {
    const m = date.getMonth() + 1
    const d = date.getDate()
    const y = date.getFullYear()
    
    if (isWorkday(y, m, d)) {
      return { year: y, month: m, day: d }
    }
    
    // 向后推一天
    date.setDate(date.getDate() + 1)
  }
  
  // 安全回退：返回原日期
  return { year, month, day }
}

/**
 * 获取某一年度所有实际考试日程（经过顺移处理）
 * 包括月考和静态考试（期中/期末的首日也做顺移参考，但考试周整体保留）
 * @param {number} year 年份
 * @returns {Array<{ year: number, month: number, day: number, type: string, label: string, originalMonth: number, originalDay: number }>}
 */
export function getResolvedExamSchedule(year) {
  const resolved = []
  
  // 1. 处理月考（每月25日，排除不适用的月份）
  for (const month of MONTHLY_EXAM_MONTHS) {
    // 再次检查是否应该举行月考（考虑寒假、春假等）
    if (!shouldHaveMonthlyExam(month, MONTHLY_EXAM_DAY)) continue
    
    const actualDate = resolveExamDate(year, month, MONTHLY_EXAM_DAY)
    resolved.push({
      year: actualDate.year,
      month: actualDate.month,
      day: actualDate.day,
      type: 'monthly',
      label: `${month}月月考`,
      originalMonth: month,
      originalDay: MONTHLY_EXAM_DAY
    })
  }
  
  // 2. 期中/期末考试周保持原样（它们是连续几天的考试周，不需要顺移）
  // 这些已经在 EXAM_WEEK_RANGES 中定义
  
  return resolved
}

/**
 * 检查指定日期是否是某个月考的实际考试日（经过顺移）
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {number} day 日期
 * @returns {{ type: string, label: string } | null}
 */
export function getResolvedExamOnDate(year, month, day) {
  const schedule = getResolvedExamSchedule(year)
  const found = schedule.find(e => e.year === year && e.month === month && e.day === day)
  if (found) {
    return { type: found.type, label: found.label }
  }
  return null
}

// ==================== 考试后自动结算 ====================

// TODO: 以下函数 (calculateGrowthChange, naturalQualityFluctuation, naturalSpiritFluctuation) 
// 目前在 academicActions 中未被调用，是为将来更复杂的成长系统预留的。

/**
 * 根据考试表现自动计算 academicGrowth 变化
 * @param {number} currentScore 本次成绩
 * @param {number} previousScore 上次成绩 (如果有)
 * @param {string} examType 考试类型
 * @returns {number} growth 变化值
 */
export function calculateGrowthChange(currentScore, previousScore, examType) {
  if (previousScore === null || previousScore === undefined) {
    // 第一次考试，不产生成长变化
    return 0
  }
  
  const diff = currentScore - previousScore
  
  // 考试类型权重 (期末考试的成长效果更大)
  const weight = examType === 'final' ? 1.5 : examType === 'midterm' ? 1.2 : 1.0
  
  if (diff >= 15) return Math.round(3 * weight)    // 大幅进步
  if (diff >= 8) return Math.round(2 * weight)     // 明显进步
  if (diff >= 3) return Math.round(1 * weight)     // 小幅进步
  if (diff <= -15) return Math.round(-2 * weight)  // 大幅退步
  if (diff <= -8) return Math.round(-1 * weight)   // 明显退步
  return 0  // 持平
}

// ==================== 非玩家班级自然波动 ====================

/**
 * 非玩家教授的班级，每次考试时自然波动
 * 模拟其他老师的教学水平参差不齐
 * @param {number} currentQuality 当前教学质量
 * @param {function} randomFn 随机函数
 * @returns {number} 新的教学质量
 */
export function naturalQualityFluctuation(currentQuality, randomFn) {
  const change = (randomFn() - 0.5) * 6 // -3 ~ +3
  const newQuality = currentQuality + change
  return Math.max(30, Math.min(70, Math.round(newQuality)))
}

/**
 * 非玩家管理的班级学风自然波动
 * @param {number} currentSpirit 当前班级学风
 * @param {function} randomFn 随机函数
 * @returns {number} 新的班级学风
 */
export function naturalSpiritFluctuation(currentSpirit, randomFn) {
  const change = (randomFn() - 0.5) * 4 // -2 ~ +2
  const newSpirit = currentSpirit + change
  return Math.max(35, Math.min(65, Math.round(newSpirit)))
}

// ==================== 默认学力原型 ====================

/**
 * 默认学力原型（未设置标签时使用）
 */
export const DEFAULT_ACADEMIC_PROFILE = {
  level: 'avg',
  potential: 'medium',
  traits: []
}

/**
 * 解析学力标签字符串
 * @param {string} tagContent 标签内容，如 "poor/very_high:math_weak,music_strong"
 * @returns {Object} { level, potential, traits }
 */
export function parseAcademicTag(tagContent) {
  if (!tagContent) return { ...DEFAULT_ACADEMIC_PROFILE }
  
  const parts = tagContent.split(':')
  const levelPotential = parts[0].split('/')
  const traitStr = parts[1] || ''
  
  const level = levelPotential[0] || 'avg'
  const potential = levelPotential[1] || 'medium'
  const traits = traitStr ? traitStr.split(',').map(t => t.trim()).filter(t => t) : []
  
  // 验证 level
  if (!BASE_RANGES[level]) {
    console.warn(`[AcademicData] Unknown academic level: ${level}, using 'avg'`)
    return { level: 'avg', potential, traits }
  }
  
  // 验证 potential
  if (!POTENTIAL_MAP[potential]) {
    console.warn(`[AcademicData] Unknown potential: ${potential}, using 'medium'`)
    return { level, potential: 'medium', traits }
  }
  
  return { level, potential, traits }
}
