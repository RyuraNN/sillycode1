/**
 * 学业成绩计算引擎
 * 
 * 负责：
 * 1. 根据NPC学力原型 + 动力 + 成长值，计算考试成绩
 * 2. 生成班级/年级排名
 * 3. 管理NPC学业成长（每回合微调）
 */

import { 
  BASE_RANGES, 
  SUBJECT_MAP, 
  SUBJECT_TRAITS, 
  POTENTIAL_MAP, 
  POTENTIAL_FACTORS,
  LEVEL_FACTORS,
  LEVEL_ORDER,
  LEVEL_UP_THRESHOLDS,
  TEACHING_QUALITY_FACTORS,
  parseAcademicTag 
} from '../data/academicData'

// ==================== 成绩计算 ====================

/**
 * 为单个NPC生成考试成绩
 * @param {Object} npc NPC数据 (from store.npcs)
 * @param {Object} options 选项
 * @param {string} options.examType 考试类型 'monthly' | 'midterm' | 'final'
 * @param {number} options.month 当前月份 (1-12)
 * @returns {Record<string, number>} 各科成绩 { literature: 78, math: 65, ... }
 */
export function generateNpcExamScores(npc, options = {}) {
  const { examType = 'monthly' } = options
  
  // 解析学力配置 (如果 NPC 上没有 academicStats，先解析 Worldbook 标签)
  // academicStats 是支持动态升级的新数据结构
  const stats = npc.academicStats || initializeNpcAcademicStats(npc)
  const defaultProfile = parseAcademicTag(npc.academicProfile || 'avg')

  const scores = {}
  const motivation = npc.motivation ?? 50
  
  // 计算动力修正系数 (0.85 ~ 1.15)
  const motivationFactor = 0.85 + (motivation / 100) * 0.3
  
  // 考试类型难度修正
  const examDifficultyMap = {
    monthly: 1.0,
    midterm: 0.95,  // 期中稍难
    final: 0.90     // 期末最难
  }
  const examFactor = examDifficultyMap[examType] || 1.0
  
  // 计算特长/弱项偏移
  const traitBonuses = {}
  // 使用 stats 中的 traits (如果存在)，否则使用解析出的默认 traits
  const traits = stats.traits || defaultProfile.traits || []
  for (const traitId of traits) {
    const traitDef = SUBJECT_TRAITS[traitId]
    if (traitDef) {
      traitBonuses[traitDef.subject] = (traitBonuses[traitDef.subject] || 0) + traitDef.bonus
    }
  }
  
  for (const [subjectKey, subjectLabel] of Object.entries(SUBJECT_MAP)) {
    // 1. 确定等级：优先使用 stats 中该科目的 Level
    let level = 'avg'
    if (stats.subjects && stats.subjects[subjectKey]) {
      level = stats.subjects[subjectKey].level
    } else {
      level = defaultProfile.level
    }

    const levelRanges = BASE_RANGES[level] || BASE_RANGES.avg
    const baseRange = levelRanges[subjectKey] || levelRanges.default || [40, 60]
    const [minScore, maxScore] = baseRange
    
    // 基础分 = 范围中点
    const midPoint = (minScore + maxScore) / 2
    const halfRange = (maxScore - minScore) / 2
    
    // 随机波动 (-1 ~ 1 正态分布近似)
    const randomFactor = gaussianRandom()
    
    // 成长值修正 (每点成长值 +0.5分，上限20分)
    // 这里的成长值是 "当前等级内积累的经验值"
    const exp = (stats.subjects && stats.subjects[subjectKey]) ? stats.subjects[subjectKey].exp : (npc.subjectGrowth?.[subjectKey] || 0)
    const growthBonus = Math.min(exp * 0.5, 20)
    
    // 特长/弱项加成
    const traitBonus = traitBonuses[subjectKey] || 0
    
    // 最终分数
    let score = midPoint + halfRange * randomFactor * examFactor
    score = score * motivationFactor + growthBonus + traitBonus
    
    // 钳制到 0-100
    score = Math.round(Math.max(0, Math.min(100, score)))
    
    scores[subjectKey] = score
  }
  
  return scores
}

/**
 * 生成默认分数（用于没有学力配置的NPC）
 */
function generateDefaultScores() {
  const scores = {}
  for (const key of Object.keys(SUBJECT_MAP)) {
    scores[key] = Math.round(40 + Math.random() * 30) // 40-70
  }
  return scores
}

/**
 * 近似正态分布随机数 (Box-Muller)
 * @returns {number} 约在 -2 ~ 2 之间的值，多数在 -1 ~ 1
 */
function gaussianRandom() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return Math.max(-2, Math.min(2, num)) // 钳制极端值
}

// ==================== 排名计算 ====================

/**
 * 计算班级排名
 * @param {Record<string, Record<string, number>>} results 全部成绩 { "NPC名": { literature: 78, ... } }
 * @returns {Array<{ name: string, avg: number, total: number, rank: number, scores: Record<string, number> }>}
 */
export function calculateClassRanking(results) {
  const subjectKeys = Object.keys(SUBJECT_MAP)
  
  const entries = Object.entries(results).map(([name, scores]) => {
    const total = subjectKeys.reduce((sum, key) => sum + (scores[key] || 0), 0)
    const avg = total / subjectKeys.length
    return { name, avg: Math.round(avg * 10) / 10, total, scores }
  })
  
  // 按总分降序排列
  entries.sort((a, b) => b.total - a.total)
  
  // 分配排名（考虑并列）
  let currentRank = 1
  entries.forEach((entry, index) => {
    if (index > 0 && entry.total < entries[index - 1].total) {
      currentRank = index + 1
    }
    entry.rank = currentRank
  })
  
  return entries
}

/**
 * 计算各班平均分和班级排名
 * @param {Record<string, Record<string, Record<string, number>>>} classResults 
 *   格式: { "1-A": { "NPC名": { literature: 78, ... } }, "1-B": { ... } }
 * @returns {Record<string, { avg: number, rank: number }>}
 */
export function calculateInterClassRanking(classResults) {
  const classAvgs = []
  
  for (const [classId, results] of Object.entries(classResults)) {
    const names = Object.keys(results)
    if (names.length === 0) continue
    
    const subjectKeys = Object.keys(SUBJECT_MAP)
    let totalAll = 0
    
    for (const scores of Object.values(results)) {
      totalAll += subjectKeys.reduce((sum, key) => sum + (scores[key] || 0), 0)
    }
    
    const avg = totalAll / (names.length * subjectKeys.length)
    classAvgs.push({ classId, avg: Math.round(avg * 10) / 10 })
  }
  
  // 按平均分降序
  classAvgs.sort((a, b) => b.avg - a.avg)
  
  const result = {}
  let currentRank = 1
  classAvgs.forEach((entry, index) => {
    if (index > 0 && entry.avg < classAvgs[index - 1].avg) {
      currentRank = index + 1
    }
    result[entry.classId] = { avg: entry.avg, rank: currentRank }
  })
  
  return result
}

// ==================== 成长系统 ====================

/**
 * 初始化 NPC 的学业数据结构
 * @param {Object} npc
 * @returns {Object} academicStats
 */
export function initializeNpcAcademicStats(npc) {
  const parsed = parseAcademicTag(npc.academicProfile || 'avg')
  
  const stats = {
    overallPotential: parsed.potential,
    traits: parsed.traits || [],
    subjects: {}
  }
  
  // 为每个科目初始化 Level 和 Exp
  // 如果之前有 subjectGrowth (旧数据)，尝试继承为 Exp
  const oldGrowth = npc.subjectGrowth || {}
  
  for (const subjectKey of Object.keys(SUBJECT_MAP)) {
    stats.subjects[subjectKey] = {
      level: parsed.level, // 初始等级均为 profile 定义的等级
      exp: oldGrowth[subjectKey] || 0
    }
  }
  
  return stats
}

/**
 * 计算单次教学带来的成长值
 * @param {Object} npc NPC对象
 * @param {string} type 教学类型 'private'(个人) | 'class'(班级)
 * @param {string} subject 科目Key
 * @param {string} quality 教学质量 'perfect'|'good'|'normal'|'bad'
 * @returns {number} 增长值
 */
export function calculateTeachingGrowth(npc, type, subject, quality = 'normal') {
  const stats = npc.academicStats || initializeNpcAcademicStats(npc)
  const motivation = npc.motivation ?? 50
  const qualityFactor = TEACHING_QUALITY_FACTORS[quality] || 1.0
  
  // 基础增长值
  const BASE_GROWTH = 1.0
  
  if (type === 'private') {
    // 个人教学：看重潜力 (Potential)
    // 公式: 1.0 * potentialFactor * (motivation/50) * qualityFactor
    const potential = stats.overallPotential || 'medium'
    const factor = POTENTIAL_FACTORS[potential] || 1.0
    return BASE_GROWTH * factor * (motivation / 50) * qualityFactor
  } else {
    // 班级教学：看重基础能力 (Level)
    // 公式: 0.5 * levelFactor * (motivation/50) * qualityFactor
    const level = stats.subjects[subject]?.level || 'avg'
    const factor = LEVEL_FACTORS[level] || 1.0
    return (BASE_GROWTH * 0.5) * factor * (motivation / 50) * qualityFactor
  }
}

/**
 * 应用教学成长并处理升级
 * @param {Object} npc NPC对象
 * @param {string} subject 科目Key
 * @param {number} amount 成长值
 * @returns {Object} 结果 { growth: number, leveledUp: boolean, newLevel: string, oldLevel: string }
 */
export function applyTeachingGrowth(npc, subject, amount) {
  // 确保数据结构已初始化
  if (!npc.academicStats) {
    npc.academicStats = initializeNpcAcademicStats(npc)
  }
  
  const subjectStats = npc.academicStats.subjects[subject]
  if (!subjectStats) return { growth: 0, leveledUp: false } // Should not happen
  
  // 增加经验
  subjectStats.exp += amount
  
  // 检查升级
  const currentLevel = subjectStats.level
  const threshold = LEVEL_UP_THRESHOLDS[currentLevel]
  
  let leveledUp = false
  let newLevel = currentLevel
  
  if (threshold && threshold !== Infinity && subjectStats.exp >= threshold) {
    // 升级逻辑
    const currentIndex = LEVEL_ORDER.indexOf(currentLevel)
    if (currentIndex !== -1 && currentIndex < LEVEL_ORDER.length - 1) {
      newLevel = LEVEL_ORDER[currentIndex + 1]
      subjectStats.level = newLevel
      subjectStats.exp -= threshold // 扣除消耗的经验，溢出部分保留到下一级
      leveledUp = true
    }
  }
  
  // 同步回旧字段以保持兼容性 (可选，视需要)
  if (!npc.subjectGrowth) npc.subjectGrowth = {}
  npc.subjectGrowth[subject] = subjectStats.exp
  
  return {
    growth: amount,
    leveledUp,
    oldLevel: currentLevel,
    newLevel
  }
}

/**
 * 每日微调NPC学业成长值
 * 根据动力、专注科目等因素
 * @param {Object} npc NPC数据
 * @returns {{ subjectGrowth: Record<string, number>, motivationDelta: number }}
 */
export function dailyAcademicGrowth(npc) {
  const motivation = npc.motivation ?? 50
  const studyFocus = npc.studyFocus || null
  
  // 确保结构初始化
  if (!npc.academicStats) {
    npc.academicStats = initializeNpcAcademicStats(npc)
  }
  
  const subjectGrowth = {} // 仅用于返回给上层做日志，实际修改直接作用于 academicStats
  
  // 基础成长概率 = 动力 / 200 (即 50动力 → 25%概率成长)
  const growthChance = motivation / 200
  
  // 动力自然衰减/恢复 (趋向50)
  let motivationDelta = 0
  if (motivation > 55) {
    motivationDelta = -Math.random() * 2 // 高动力缓慢下降
  } else if (motivation < 45) {
    motivationDelta = Math.random() * 2  // 低动力缓慢恢复
  }
  
  for (const subjectKey of Object.keys(SUBJECT_MAP)) {
    if (Math.random() < growthChance) {
      const isFocused = studyFocus === subjectKey
      // 每日自然成长的量较小
      const growthAmount = isFocused ? 0.8 : 0.2
      
      // 应用成长 (可能触发静默升级，但这里我们暂不处理升级通知，只加经验)
      // 如果要处理自然升级，需要类似 applyTeachingGrowth 的逻辑，但这里为了简化暂只加经验
      npc.academicStats.subjects[subjectKey].exp += growthAmount
      
      // 简单的阈值检查，防止溢出太多 (如果未实装自然升级逻辑)
      // 实际上最好统一调用 applyTeachingGrowth，但为了不产生大量日志，这里暂略
      
      subjectGrowth[subjectKey] = (subjectGrowth[subjectKey] || 0) + growthAmount
    }
  }
  
  // 兼容旧字段
  for (const [k, v] of Object.entries(npc.academicStats.subjects)) {
    if (!npc.subjectGrowth) npc.subjectGrowth = {}
    npc.subjectGrowth[k] = v.exp
  }
  
  return { subjectGrowth, motivationDelta }
}

/**
 * 考试后根据成绩调整NPC动力
 * @param {Record<string, number>} scores 该NPC的成绩
 * @param {number} rank 班级排名
 * @param {number} totalStudents 班级总人数
 * @param {number} currentMotivation 当前动力
 * @returns {number} 新动力值
 */
export function adjustMotivationAfterExam(scores, rank, totalStudents, currentMotivation) {
  const subjectKeys = Object.keys(SUBJECT_MAP)
  const avg = subjectKeys.reduce((sum, k) => sum + (scores[k] || 0), 0) / subjectKeys.length
  
  let delta = 0
  
  // 高分奖励
  if (avg >= 85) delta += 10
  else if (avg >= 70) delta += 5
  else if (avg < 40) delta -= 10
  else if (avg < 55) delta -= 5
  
  // 排名奖励
  const rankPercentile = rank / totalStudents
  if (rankPercentile <= 0.1) delta += 8   // 前10%
  else if (rankPercentile <= 0.3) delta += 3
  else if (rankPercentile >= 0.9) delta -= 5 // 后10%
  
  const newMotivation = Math.max(0, Math.min(100, currentMotivation + delta))
  return Math.round(newMotivation)
}

// ==================== 格式化 ====================

/**
 * 格式化成绩为简洁字符串（给AI看）
 * @param {Record<string, number>} scores 
 * @returns {string} 如 "语:78 数:65 英:82 文综:70 理综:55 艺:90 体:85"
 */
export function formatScoresCompact(scores) {
  const abbrevMap = {
    literature: '语',
    math: '数',
    english: '英',
    humanities: '文综',
    sciences: '理综',
    art: '艺',
    sports: '体'
  }
  
  return Object.entries(scores)
    .map(([key, val]) => `${abbrevMap[key] || key}:${val}`)
    .join(' ')
}

/**
 * 格式化排名数据为AI可读的文本
 * @param {Array} ranking calculateClassRanking 的结果
 * @param {string} classId 班级ID
 * @returns {string}
 */
export function formatRankingForAI(ranking, classId) {
  if (!ranking || ranking.length === 0) return ''
  
  let text = `[${classId}班 成绩排名]\n`
  ranking.forEach(entry => {
    text += `${entry.rank}. ${entry.name} 均分${entry.avg} (${formatScoresCompact(entry.scores)})\n`
  })
  
  return text
}
