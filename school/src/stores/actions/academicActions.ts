/**
 * 学业系统 Store Actions
 * 
 * 处理考试触发、成绩记录、NPC学业成长等
 */

import {
  generateNpcExamScores,
  calculateClassRanking,
  calculateInterClassRanking,
  adjustMotivationAfterExam,
  dailyAcademicGrowth,
  formatScoresCompact,
  calculateTeachingGrowth,
  applyTeachingGrowth
} from '../../utils/academicEngine'
import { updateAcademicWorldbookEntry } from '../../utils/academicWorldbook'
import { SUBJECT_MAP, SUBJECT_NAME_MAP, EXAM_SCHEDULE, getResolvedExamOnDate } from '../../data/academicData'
import { getAllElectives } from '../../data/coursePoolData'
import type { ExamRecord } from '../gameStoreTypes'

export const academicActions = {

  /**
   * 检查是否应该触发考试（在时间推进时调用）
   */
  checkExamTrigger(this: any) {
    const { year, month, day } = this.gameTime
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    // 防止同一天重复触发
    if (this.lastExamDate === dateStr) return null

    // 1. 检查静态考试日程（期中/期末等固定日期）
    for (const schedule of EXAM_SCHEDULE) {
      // 只有非月考类型才直接匹配静态日程（因为月考现在有动态顺移逻辑）
      if (schedule.type !== 'monthly' && schedule.month === month && schedule.day === day) {
        console.log(`[Academic] Static exam triggered: ${schedule.type} on ${dateStr}`)
        return schedule
      }
    }

    // 2. 检查动态月考日程（顺移后的实际日期）
    const resolvedExam = getResolvedExamOnDate(year, month, day)
    if (resolvedExam) {
      console.log(`[Academic] Resolved exam triggered: ${resolvedExam.type} on ${dateStr}`)
      return resolvedExam
    }

    return null
  },

  /**
   * 执行考试：为所有NPC生成成绩
   * @param examType 考试类型
   */
  conductExam(this: any, examType: 'monthly' | 'midterm' | 'final') {
    const { year, month, day } = this.gameTime
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    // 防重复
    if (this.lastExamDate === dateStr) {
      console.log('[Academic] Exam already conducted today')
      return null
    }

    console.log(`[Academic] Conducting ${examType} exam...`)

    // 按班级分组收集学生NPC
    const classResults: Record<string, Record<string, Record<string, number>>> = {}
    const allClassData = this.allClassData || {}

    // 遍历所有班级
    for (const classId of Object.keys(allClassData)) {
      classResults[classId] = {}
    }

    // 为每个学生NPC生成成绩
    for (const npc of this.npcs) {
      if (npc.role !== 'student' || !npc.isAlive) continue
      
      // 找到NPC所在班级
      let npcClassId = ''
      for (const [classId, classInfo] of Object.entries(allClassData) as [string, any][]) {
        const students = classInfo.students || []
        if (students.some((s: any) => s.name === npc.name)) {
          npcClassId = classId
          break
        }
      }
      
      if (!npcClassId) continue
      if (!classResults[npcClassId]) classResults[npcClassId] = {}

      const scores = generateNpcExamScores(npc, { examType, month })
      classResults[npcClassId][npc.name] = scores
    }

    // 添加玩家成绩（如果玩家是学生）
    if (this.player.role === 'student' && this.player.classId) {
      const playerClassId = this.player.classId
      if (!classResults[playerClassId]) classResults[playerClassId] = {}
      
      // 玩家成绩基于 sqrt 比值公式：
      // 难度基准: 高一=40, 高二=60, 高三=80
      // score = 14 + 68 * sqrt(knowledge / benchmark)
      // knowledge=benchmark → 82分，开局(~60%benchmark) → ~60分
      const gradeYear = this.player.gradeYear || 1
      const difficultyBenchmark = gradeYear === 1 ? 40 : gradeYear === 2 ? 60 : 80
      
      const playerScores: Record<string, number> = {}
      for (const subjectKey of Object.keys(SUBJECT_MAP)) {
        const knowledge = (this.player.subjects as any)[subjectKey] || 15
        // 基于知识与难度基准的比值，sqrt提供递减收益
        // knowledge=benchmark → 82分，低于benchmark时仍有合理分数
        let score = 14 + 68 * Math.sqrt(knowledge / difficultyBenchmark)
        
        // IQ加成（IQ > 85时有额外加分）
        const iq = this.player.attributes?.iq || 60
        if (iq > 85) score += Math.floor((iq - 85) * 0.3)
        
        // 心境影响（mood < 50时扣分，最多约-7.5分）
        const mood = this.player.attributes?.mood || 60
        if (mood < 50) score -= Math.floor((50 - mood) * 0.15)
        
        // 随机波动 ±2
        score += Math.round((Math.random() - 0.5) * 4)
        
        // 考试类型难度修正
        if (examType === 'midterm') score -= 2
        else if (examType === 'final') score -= 4
        
        playerScores[subjectKey] = Math.round(Math.max(0, Math.min(100, score)))
      }
      classResults[playerClassId][this.player.name] = playerScores
    }

    // 计算班级间排名
    const interClassRanking = calculateInterClassRanking(classResults)

    // 创建考试记录
    const examRecord: ExamRecord = {
      examId: `${year}-${month}-${examType}`,
      examType,
      examDate: { year, month, day },
      results: classResults,
      classRankings: interClassRanking
    }

    // 存储到 examHistory
    if (!this.examHistory) this.examHistory = []
    this.examHistory.push(examRecord)
    
    // 限制历史记录数量（保留最近10次）
    if (this.examHistory.length > 10) {
      this.examHistory = this.examHistory.slice(-10)
    }

    // 更新最后考试日期
    this.lastExamDate = dateStr

    // 调整NPC动力
    for (const [classId, results] of Object.entries(classResults)) {
      const ranking = calculateClassRanking(results)
      const totalStudents = ranking.length
      
      for (const entry of ranking) {
        const npc = this.npcs.find((n: any) => n.name === entry.name)
        if (npc) {
          const newMotivation = adjustMotivationAfterExam(
            entry.scores, entry.rank, totalStudents, npc.motivation ?? 50
          )
          npc.motivation = newMotivation
        }
      }
    }

    // 更新世界书
    updateAcademicWorldbookEntry(this)

    console.log(`[Academic] Exam completed. ${Object.keys(classResults).length} classes, records saved.`)
    
    return examRecord
  },

  /**
   * 每日学业成长更新（在日期变化时调用）
   */
  updateDailyAcademicGrowth(this: any) {
    let updatedCount = 0
    
    for (const npc of this.npcs) {
      if (npc.role !== 'student' || !npc.isAlive) continue
      
      const { subjectGrowth, motivationDelta } = dailyAcademicGrowth(npc)
      npc.subjectGrowth = subjectGrowth
      
      if (motivationDelta !== 0) {
        const current = npc.motivation ?? 50
        npc.motivation = Math.max(0, Math.min(100, Math.round(current + motivationDelta)))
      }
      
      updatedCount++
    }
    
    if (updatedCount > 0) {
      console.log(`[Academic] Daily growth updated for ${updatedCount} students`)
    }
  },

  /**
   * 获取指定NPC的最近考试成绩
   */
  getNpcLatestScores(this: any, npcName: string): Record<string, number> | null {
    const examHistory = this.examHistory || []
    if (examHistory.length === 0) return null

    const latest = examHistory[examHistory.length - 1]
    for (const classResults of Object.values(latest.results || {})) {
      const scores = (classResults as Record<string, Record<string, number>>)[npcName]
      if (scores) return scores
    }
    return null
  },

  /**
   * 获取指定班级的最近排名
   */
  getClassLatestRanking(this: any, classId: string) {
    const examHistory = this.examHistory || []
    if (examHistory.length === 0) return null

    const latest = examHistory[examHistory.length - 1]
    const classResults = latest.results?.[classId]
    if (!classResults) return null

    return calculateClassRanking(classResults)
  },

  /**
   * 手动设置NPC动力（通过事件或AI指令）
   */
  setNpcMotivation(this: any, npcName: string, motivation: number) {
    const npc = this.npcs.find((n: any) => n.name === npcName)
    if (npc) {
      npc.motivation = Math.max(0, Math.min(100, Math.round(motivation)))
      console.log(`[Academic] Set ${npcName} motivation to ${npc.motivation}`)
    }
  },

  /**
   * 手动设置NPC专注科目
   */
  setNpcStudyFocus(this: any, npcName: string, subject: string | null) {
    const npc = this.npcs.find((n: any) => n.name === npcName)
    if (npc) {
      npc.studyFocus = subject
      console.log(`[Academic] Set ${npcName} study focus to ${subject || 'none'}`)
    }
  },

  /**
   * 执行教学指令
   * @param targetNameOrId NPC名称/ID 或 班级ID
   * @param subjectName 科目名称 (中文或Key)
   * @param quality 教学质量 (perfect/good/normal/bad)
   */
  performTeaching(this: any, targetNameOrId: string, subjectName: string, quality: string = 'normal') {
    if (!targetNameOrId || !subjectName) return

    // 1. 解析科目
    const subjectKey = (SUBJECT_NAME_MAP as any)[subjectName] || subjectName
    if (!(SUBJECT_MAP as any)[subjectKey]) {
      console.warn(`[Academic] Unknown subject: ${subjectName}`)
      return
    }

    // 2. 识别目标类型
    let type = 'private'
    let targets = []
    
    // 2a. 尝试作为班级ID查找
    const classData = this.allClassData[targetNameOrId]
    if (classData && classData.students) {
      type = 'class'
      // 收集班级内所有存活学生NPC
      for (const student of classData.students) {
        const npc = this.npcs.find((n: any) => n.name === student.name && n.isAlive)
        if (npc) targets.push(npc)
      }
    } else {
      // 2b. 尝试作为选修课查找 (ID 或 名称)
      const allElectives = getAllElectives()
      const course = allElectives.find((c: any) => c.id === targetNameOrId || c.name === targetNameOrId)
      
      if (course && this.npcElectiveSelections) {
        type = 'class' // 选修课也视为班级教学
        const courseId = course.id
        // 查找选了这门课的学生
        for (const [studentName, selections] of Object.entries(this.npcElectiveSelections)) {
          if ((selections as string[]).includes(courseId)) {
            const npc = this.npcs.find((n: any) => n.name === studentName && n.isAlive)
            if (npc) targets.push(npc)
          }
        }
      } 
      
      // 如果不是选修课，或者选修课没人选
      if (targets.length === 0) {
        // 2c. 尝试作为NPC查找 (优先ID，后名字)
        let npc = this.npcs.find((n: any) => n.id === targetNameOrId)
        if (!npc) npc = this.npcs.find((n: any) => n.name === targetNameOrId)
        
        if (npc) {
          targets.push(npc)
        } else {
          // 如果既不是班级，也不是课程，也不是NPC，则警告
          if (!course) {
             console.warn(`[Academic] Target not found: ${targetNameOrId}`)
             return
          }
        }
      }
    }

    if (targets.length === 0) return

    // 3. 执行教学循环
    const results = []
    const levelUps = []

    for (const npc of targets) {
      // 计算成长值 (带区分度系数)
      const growthAmount = calculateTeachingGrowth(npc, type, subjectKey, quality)
      
      // 应用成长并处理升级
      const result = applyTeachingGrowth(npc, subjectKey, growthAmount) as any
      
      // 少量提升动力 (教学相长)
      const motivationBonus = type === 'private' ? 2 : 1
      npc.motivation = Math.min(100, (npc.motivation || 50) + motivationBonus)

      results.push({ name: npc.name, growth: result.growth })
      if (result.leveledUp) {
        levelUps.push({ name: npc.name, newLevel: result.newLevel })
      }
    }

    // 4. 生成反馈文本 (Tucao风格)
    let feedback = ''
    const subjectLabel = (SUBJECT_MAP as any)[subjectKey]

    if (type === 'private') {
      const npc = targets[0]
      const growth = results[0].growth
      
      if (levelUps.length > 0) {
        feedback = `在你的精心辅导下，${npc.name}的${subjectLabel}水平有了质的飞跃！(等级提升至 ${levelUps[0].newLevel})`
      } else if (growth > 1.5) {
        feedback = `${npc.name}展现出了惊人的领悟力，对${subjectLabel}知识的掌握突飞猛进！`
      } else if (growth > 0.8) {
        feedback = `${npc.name}认真听讲，扎实地掌握了今天的${subjectLabel}内容。`
      } else {
        feedback = `${npc.name}看起来有点跟不上你的节奏，虽然努力听了，但收获有限。`
      }
    } else {
      const avgGrowth = results.reduce((sum, r) => sum + r.growth, 0) / results.length
      
      if (levelUps.length > 0) {
        const names = levelUps.map(l => l.name).join('、')
        feedback = `今天的${subjectLabel}课效果显著，${names}等人似乎突破了瓶颈！`
      } else if (avgGrowth > 0.8) {
        feedback = `班上的同学们都聚精会神地听完了${subjectLabel}课，整体吸收效果不错。`
      } else {
        feedback = `这堂${subjectLabel}课的氛围有点沉闷，只有部分基础好的同学跟上了进度。`
      }
    }

    // 添加到吐槽列表 (通过添加一条系统指令来显示)
    // 或者直接返回给 caller，但这里我们通过添加一条 'tucao' 类型的指令来让前端显示
    // 也可以直接在 MessageParser 中处理返回值。
    // 这里我们选择添加一条带 <tucao> 的系统消息
    this.addCommand({
      id: Date.now(),
      text: `<tucao>${feedback}</tucao>`,
      type: 'system_note'
    })

    console.log(`[Academic] Performed teaching on ${targets.length} students. Avg growth: ${results.reduce((s,r)=>s+r.growth,0)/results.length}`)
  }
}
