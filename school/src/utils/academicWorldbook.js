/**
 * 学业系统世界书注入
 * 
 * 负责将考试成绩、排名等信息注入到世界书中，
 * 使AI在生成内容时能参考学业数据。
 */

import { formatScoresCompact, formatRankingForAI } from './academicEngine'
import { SUBJECT_MAP } from '../data/academicData'
import { getCurrentBookName } from './worldbookHelper'

/**
 * 生成学业信息的世界书注入文本
 * @param {Object} store gameStore实例
 * @returns {string} 注入文本
 */
export function generateAcademicWorldbookText(store) {
  const examHistory = store.examHistory || []
  if (examHistory.length === 0) return ''

  // 只取最近一次考试
  const latestExam = examHistory[examHistory.length - 1]
  if (!latestExam) return ''

  const { examType, examDate, results, classRankings } = latestExam
  
  const examTypeNames = {
    monthly: '月考',
    midterm: '期中考试',
    final: '期末考试'
  }
  const examName = examTypeNames[examType] || '考试'

  let text = `\n[最近考试信息: ${examDate.year}年${examDate.month}月 ${examName}]\n`

  // 玩家所在班级的排名
  const playerClassId = store.player?.classId
  const subjectKeys = Object.keys(SUBJECT_MAP)
  if (playerClassId && results[playerClassId]) {
    // 该班的 NPC 成绩
    const classResults = results[playerClassId] || {}
    
    // 找到玩家自己的成绩
    const playerName = store.player?.name
    const playerScores = classResults[playerName]
    
    if (playerScores) {
      text += `你的成绩: ${formatScoresCompact(playerScores)}\n`
      
      // 计算玩家排名
      const allScores = Object.entries(classResults)
      const playerTotal = subjectKeys.reduce((sum, k) => sum + (playerScores[k] || 0), 0)
      const rankAbove = allScores.filter(([name, scores]) => {
        const total = subjectKeys.reduce((sum, k) => sum + (scores[k] || 0), 0)
        return total > playerTotal
      }).length
      text += `班级排名: 第${rankAbove + 1}名/${allScores.length}人\n`
    }

    // 班级前5名
    const ranking = Object.entries(classResults)
      .map(([name, scores]) => {
        const total = subjectKeys.reduce((sum, k) => sum + (scores[k] || 0), 0)
        return { name, total, avg: Math.round(total / subjectKeys.length * 10) / 10 }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
    
    text += `班级前5: ${ranking.map((r, i) => `${i + 1}.${r.name}(均${r.avg})`).join(' ')}\n`
  }

  // 班级间排名
  if (classRankings && Object.keys(classRankings).length > 1) {
    const sorted = Object.entries(classRankings)
      .sort((a, b) => a[1].rank - b[1].rank)
    text += `班级排名: ${sorted.map(([id, data]) => `${data.rank}.${id}班(均${data.avg})`).join(' ')}\n`
  }

  return text
}

/**
 * 生成NPC学业简报（用于NPC世界书条目中附加）
 * @param {string} npcName NPC名称
 * @param {Object} store gameStore实例
 * @returns {string} 简短的学业描述
 */
export function generateNpcAcademicBrief(npcName, store) {
  const examHistory = store.examHistory || []
  if (examHistory.length === 0) return ''

  const latestExam = examHistory[examHistory.length - 1]
  if (!latestExam) return ''

  // 在所有班级成绩中查找该NPC
  for (const [classId, classResults] of Object.entries(latestExam.results || {})) {
    const scores = classResults[npcName]
    if (scores) {
      const subjectKeys = Object.keys(SUBJECT_MAP)
      const avg = subjectKeys.reduce((sum, k) => sum + (scores[k] || 0), 0) / subjectKeys.length
      
      // 找出最强和最弱科目
      let bestSubject = '', bestScore = 0, worstSubject = '', worstScore = 100
      for (const [key, val] of Object.entries(scores)) {
        if (val > bestScore) { bestScore = val; bestSubject = key }
        if (val < worstScore) { worstScore = val; worstSubject = key }
      }
      
      const subjectNames = {
        literature: '语文', math: '数学', english: '英语',
        humanities: '文综', sciences: '理综', art: '艺术', sports: '体育'
      }
      
      return `最近考试均分${Math.round(avg)}，强项${subjectNames[bestSubject] || bestSubject}(${bestScore})，弱项${subjectNames[worstSubject] || worstSubject}(${worstScore})`
    }
  }

  return ''
}

/**
 * 更新学业世界书条目
 * @param {Object} store gameStore实例
 */
export async function updateAcademicWorldbookEntry(store) {
  if (typeof window.updateWorldbookWith !== 'function') {
    return
  }

  const text = generateAcademicWorldbookText(store)
  if (!text) return

  try {
    const bookName = getCurrentBookName()
    if (!bookName) return

    const entryName = '[TH_ExamResults] 最近考试成绩'

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      const index = newEntries.findIndex(e => e.name === entryName)

      const entry = {
        name: entryName,
        content: text,
        key: ['考试', '成绩', '月考', '期中', '期末', '排名', '分数'],
        strategy: { type: 'selective' },
        position: { type: 'before_character_definition', order: 40 },
        probability: 100,
        enabled: true,
        recursion: { prevent_outgoing: true }
      }

      if (index !== -1) {
        newEntries[index] = { ...newEntries[index], ...entry }
      } else {
        newEntries.push(entry)
      }

      return newEntries
    })

    console.log('[AcademicWorldbook] Exam results entry updated')
  } catch (e) {
    console.error('[AcademicWorldbook] Error updating exam results entry:', e)
  }
}
