/**
 * 学年进级系统 Actions
 * 处理：毕业、升级、新生入学、教师重分配、社团清理、课程重置
 * 
 * 世界书隔离策略：
 * - 进级后的班级数据使用 [Class:classId:runId] 格式存储，与存档绑定
 * - 原始 [Class:classId] 条目被禁用但不删除
 * - 存档回溯时通过 syncClassWorldbookState 恢复正确的开关状态
 */

import type { ClubData, NpcStats, GraduatedNpc, Group } from '../gameStoreTypes'
import { generateWeeklySchedule } from '../../utils/scheduleGenerator'
import { generateCharId } from '../../data/relationshipData'
import { getGradeFromClassId } from '../../data/coursePoolData'
import { clearAllCache } from '../../utils/npcScheduleSystem'
import { getFullCharacterPool, saveFullCharacterPool } from '../../utils/indexedDB'
import {
  updateClassDataInWorldbook,
  deleteClassDataFromWorldbook,
  setPlayerClass,
  removePlayerFromClubInWorldbook,
  syncClubWorldbookState,
  syncClassWorldbookState,
  createRunSpecificClassEntry
} from '../../utils/worldbookParser'
import { saveSocialData, saveSocialRelationshipOverview } from '../../utils/socialWorldbook'

// ==================== 辅助函数 ====================

// 进级锁，防止异步竞态导致重复执行
let _yearProgressionInProgress = false

/**
 * 从班级ID提取年级数字
 * '1-A' → 1, '2-B' → 2, '3-E' → 3
 */
function extractGrade(classId: string): number {
  const match = classId.match(/^(\d)/)
  return match ? parseInt(match[1]) : 0
}

/**
 * 从班级ID提取班级字母
 * '1-A' → 'A', '2-B' → 'B'
 */
function extractClassLetter(classId: string): string {
  const match = classId.match(/^\d-(.+)$/)
  return match ? match[1] : classId
}

/**
 * 构造新的班级ID
 */
function makeClassId(grade: number, letter: string): string {
  return `${grade}-${letter}`
}

/**
 * 构造班级名称
 */
function makeClassName(grade: number, letter: string): string {
  return `${grade}年${letter}班`
}

/**
 * 深拷贝（避免 Proxy 问题）
 */
function deepClone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export const yearProgressionActions = {

  // ==================== 核心检测 ====================

  /**
   * 检测是否需要进行学年进级
   * 在 advanceTime 中调用
   * 触发条件：游戏时间进入4月1日（新学年开始）
   */
  checkYearProgression(this: any) {
    const { year, month, day } = this.world.gameTime

    // 只在4月1日触发
    if (month !== 4 || day !== 1) return

    // 计算当前学年标识（防止重复触发）
    // 学年标识 = 该学年的4月所在的年份
    const currentAcademicYearId = year

    if (this.world.lastAcademicYear >= currentAcademicYearId) {
      // 已经处理过这个学年
      return
    }

    // 如果是游戏刚开始的第一年（lastAcademicYear === 0），跳过进级
    if (this.world.lastAcademicYear === 0) {
      this.world.lastAcademicYear = currentAcademicYearId
      console.log('[YearProgression] First year, skipping progression')
      return
    }

    // 防止异步竞态：先设置锁和标记
    if (_yearProgressionInProgress) {
      console.log('[YearProgression] Progression already in progress, skipping')
      return
    }

    // 立即设置 lastAcademicYear，防止下次 advanceTime 再次触发
    this.world.lastAcademicYear = currentAcademicYearId

    console.log(`[YearProgression] New academic year detected: ${currentAcademicYearId}`)

    // 执行进级（异步，但已通过设置 lastAcademicYear 防止重复）
    this.executeYearProgression(currentAcademicYearId)
  },

  /**
   * 执行学年进级（主流程）
   */
  async executeYearProgression(this: any, academicYearId: number) {
    if (_yearProgressionInProgress) {
      console.warn('[YearProgression] Already in progress, aborting')
      return
    }

    _yearProgressionInProgress = true

    console.log('[YearProgression] ========== 开始学年进级 ==========')

    try {
      // ===== 教师模式处理 =====
      if (this.player.role === 'teacher') {
        console.log('[YearProgression] Teacher mode: skipping student progression logic')
        
        // 教师不参与升年级，但需要处理全校的毕业和升级
        // 1. 处理毕业
        const graduationResult = this.processGraduation()
        
        // 2. 社团清理
        this.processClubGraduationInMemory(graduationResult.graduatedNames)
        
        // 3. 升级处理 (不升级玩家)
        this.processGradeUpgrade()
        
        // 4. 新生入学
        await this.processNewStudentEnrollment()
        
        // 5. 教师重分配 (不重分配玩家)
        // 过滤掉玩家自己，防止被自动分配
        const freedTeachers = graduationResult.freedTeachers.filter((t: any) => t.name !== this.player.name)
        this.processTeacherReassignment(freedTeachers)
        
        // 6. 重置课程
        this.resetCoursesAndElectives()
        
        // 7. 重新生成课表 (包括教师课表)
        // 对于教师，重新生成课表意味着根据 teachingClasses 重新生成
        // 教师可能需要更新 teachingClasses (如果之前的班级毕业了)
        // 简单的逻辑：教师继续教原来的年级（例如一直教1年级），或者随班升级
        // 目前策略：随班升级。如果班级毕业了，教师就变成了"无课"状态，或者分配给新1年级
        // 这里暂时保持现状，让玩家手动调整或维持空闲，或者自动分配给新班级
        
        // 尝试自动分配给新班级（如果之前的班级ID失效了）
        const newTeachingClasses = []
        for (const classId of this.player.teachingClasses) {
           if (this.world.allClassData[classId]) {
             newTeachingClasses.push(classId)
           } else {
             // 班级已毕业，尝试找对应的新班级（例如原1-A变成了2-A）
             // 但 allClassData[oldId] 已经被删除了，无法直接追踪
             // 实际上 processGradeUpgrade 中已经将 oldId 替换为 newId
             // 但玩家的 teachingClasses 数组存的是 oldId
             
             // 在 processGradeUpgrade 中我们没有更新玩家的 teachingClasses
             // 这需要修复。
           }
        }
        
        // 重新生成课表
        await this.regenerateSchedules()
        
        // 8. 刷新NPC和群
        await this.refreshNpcAndGroups()
        
        // 9. 同步世界书
        await this.syncWorldbookAfterProgression()
        
        this.addCommand(`[系统] 🎓 新学年开始！全校学生已完成进级。`)
        
        if (graduationResult.graduatedCount > 0) {
          this.addCommand(`[系统] 📢 本届共有 ${graduationResult.graduatedCount} 名学生毕业。`)
        }
        
        this.saveToStorage(true)
        console.log('[YearProgression] ========== Teacher progression complete ==========')
        _yearProgressionInProgress = false
        return
      }

      // ===== 特殊情况：玩家3年级 → 全校留级 =====
      // 天华大学尚未完成，3年级玩家不毕业，全校维持现有年级
      if (this.player.gradeYear >= 3) {
        console.log('[YearProgression] Player is grade 3 → whole school stays (天华大学 not ready)')

        // 只重置课程和选修
        this.resetCoursesAndElectives()

        // 重新生成课表（新学期）
        await this.regenerateSchedules()

        // 更新学年
        this.player.academicYear = this.world.gameTime.year

        // 发送通知
        this.addCommand(`[系统] 🌸 新学年开始！全校继续当前年级学习。`)

        this.saveToStorage(true)

        console.log('[YearProgression] ========== 全校留级完成 ==========')
        _yearProgressionInProgress = false
        return
      }

      // ===== 正常进级流程 =====

      // 第1步：毕业处理
      const graduationResult = this.processGraduation()

      // 第2步：社团毕业清理（收集变更但不逐个同步世界书）
      this.processClubGraduationInMemory(graduationResult.graduatedNames)

      // 第3步：升级处理（2→3, 1→2）
      this.processGradeUpgrade()

      // 第4步：新生入学
      await this.processNewStudentEnrollment()

      // 第5步：教师重分配
      this.processTeacherReassignment(graduationResult.freedTeachers)

      // 第6步：课程与选修重置
      this.resetCoursesAndElectives()

      // 第7步：重新生成课表
      await this.regenerateSchedules()

      // 第8步：刷新NPC数据和班级群
      await this.refreshNpcAndGroups()

      // 第9步：同步世界书（统一一次性同步）
      await this.syncWorldbookAfterProgression()

      // 发送系统通知
      const gradeText = `${this.player.gradeYear}年级`
      this.addCommand(`[系统] 🎓 新学年开始！你现在是${gradeText}的学生了。`)

      if (graduationResult.graduatedCount > 0) {
        this.addCommand(`[系统] 📢 本届共有 ${graduationResult.graduatedCount} 名学生毕业，前往天华大学继续学业。`)
      }

      this.saveToStorage(true)

      console.log('[YearProgression] ========== 学年进级完成 ==========')
    } catch (e) {
      console.error('[YearProgression] Error during year progression:', e)
      this.addCommand(`[系统] ⚠️ 学年进级过程中出现错误，请检查控制台。`)
    } finally {
      _yearProgressionInProgress = false
    }
  },

  // ==================== 第1步：毕业处理 ====================

  /**
   * 处理3年级学生毕业
   */
  processGraduation(this: any): { graduatedNames: Set<string>; graduatedCount: number; freedTeachers: any[] } {
    console.log('[YearProgression] Step 1: Processing graduation...')

    const graduatedNames = new Set<string>()
    const freedTeachers: any[] = []
    const allClassData = this.world.allClassData

    if (!allClassData) {
      return { graduatedNames, graduatedCount: 0, freedTeachers }
    }

    // 收集所有3年级班级
    const grade3Classes: string[] = []
    for (const classId of Object.keys(allClassData)) {
      if (extractGrade(classId) === 3) {
        grade3Classes.push(classId)
      }
    }

    // 处理每个3年级班级
    for (const classId of grade3Classes) {
      const classInfo = allClassData[classId]
      if (!classInfo) continue

      // 收集学生
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      for (const student of students) {
        if (!student.name) continue

        // 跳过玩家（玩家3年级不毕业 — 但因为3年级全校留级，不应该走到这里）
        if (student.name === this.player.name) continue

        graduatedNames.add(student.name)

        // 创建毕业生记录
        const graduatedNpc: GraduatedNpc = {
          id: generateCharId(student.name),
          name: student.name,
          gender: student.gender,
          origin: student.origin,
          classId: classId,
          graduationYear: this.world.gameTime.year,
          clubsAtGraduation: this.getStudentClubIds(student.name)
        }

        if (!this.world.graduatedNpcs) this.world.graduatedNpcs = []
        this.world.graduatedNpcs.push(graduatedNpc)

        // 更新NPC角色为 graduated，修改日程模板标签
        const npc = this.world.npcs.find((n: NpcStats) => n.name === student.name)
        if (npc) {
          (npc as any).role = 'other'
          ;(npc as any).scheduleTag = 'graduated'
          ;(npc as any).classId = ''
          npc.location = 'tianhua_university'
        }
      }

      // 收集教师（释放给新1年级）
      if (classInfo.headTeacher?.name) {
        freedTeachers.push({
          ...deepClone(classInfo.headTeacher),
          wasHeadTeacher: true,
          fromClassId: classId
        })
      }
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      for (const teacher of teachers) {
        if (teacher.name) {
          // 检查该教师是否也在其他年级任教
          const teachesOtherGrades = this.teacherHasOtherAssignments(teacher.name, grade3Classes)
          if (!teachesOtherGrades) {
            freedTeachers.push({
              ...deepClone(teacher),
              wasHeadTeacher: false,
              fromClassId: classId
            })
          }
        }
      }
    }

    // 删除3年级班级数据（它们已毕业，后续2年级会升级成新的3年级）
    for (const classId of grade3Classes) {
      delete allClassData[classId]
    }

    console.log(`[YearProgression] Graduated ${graduatedNames.size} students, freed ${freedTeachers.length} teachers`)
    return { graduatedNames, graduatedCount: graduatedNames.size, freedTeachers }
  },

  /**
   * 检查教师是否还在非指定班级列表的班级中任教
   */
  teacherHasOtherAssignments(this: any, teacherName: string, excludeClasses: string[]): boolean {
    const allClassData = this.world.allClassData
    if (!allClassData) return false

    const excludeSet = new Set(excludeClasses)

    for (const [classId, classInfo] of Object.entries(allClassData) as any[]) {
      if (excludeSet.has(classId)) continue

      if (classInfo.headTeacher?.name === teacherName) return true
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      if (teachers.some((t: any) => t.name === teacherName)) return true
    }

    return false
  },

  /**
   * 获取学生所属社团ID列表
   */
  getStudentClubIds(this: any, studentName: string): string[] {
    const clubIds: string[] = []
    if (!this.world.allClubs) return clubIds

    for (const [clubId, club] of Object.entries(this.world.allClubs) as any[]) {
      const isMember = club.members?.includes(studentName) ||
        club.president === studentName ||
        club.vicePresident === studentName
      if (isMember) clubIds.push(clubId)
    }
    return clubIds
  },

  // ==================== 第2步：社团毕业清理（纯内存） ====================

  /**
   * 处理毕业生的社团清理（只修改内存数据，不逐个同步世界书）
   * 世界书同步在第9步统一处理
   */
  processClubGraduationInMemory(this: any, graduatedNames: Set<string>) {
    console.log('[YearProgression] Step 2: Processing club graduation cleanup (memory only)...')

    if (!this.world.allClubs || graduatedNames.size === 0) return

    const closedClubs: string[] = []

    for (const [clubId, club] of Object.entries(this.world.allClubs) as [string, ClubData][]) {
      // 移除毕业生会员
      if (club.members && Array.isArray(club.members)) {
        club.members = club.members.filter(m => !graduatedNames.has(m))
      }

      // 清理社长（支持 string 和 string[] 类型）
      if (Array.isArray(club.president)) {
        club.president = (club.president as string[]).filter(p => !graduatedNames.has(p))
        if ((club.president as string[]).length === 0) club.president = ''
      } else if (typeof club.president === 'string' && graduatedNames.has(club.president)) {
        club.president = ''
      }

      // 清理副社长（支持 string 和 string[] 类型）
      if (Array.isArray(club.vicePresident)) {
        club.vicePresident = (club.vicePresident as string[]).filter(vp => !graduatedNames.has(vp))
        if ((club.vicePresident as string[]).length === 0) club.vicePresident = ''
      } else if (typeof club.vicePresident === 'string' && graduatedNames.has(club.vicePresident)) {
        club.vicePresident = ''
      }

      // 清理顾问（教师一般不毕业，但安全起见）
      if (club.advisor && graduatedNames.has(club.advisor)) {
        club.advisor = ''
      }

      // 检查社团是否还有活跃成员
      // 需要考虑 president/vicePresident 可能是数组的情况
      const hasPresident = Array.isArray(club.president)
        ? (club.president as string[]).length > 0
        : !!club.president
      const hasVicePresident = Array.isArray(club.vicePresident)
        ? (club.vicePresident as string[]).length > 0
        : !!club.vicePresident
      const hasActiveMembers = (club.members && club.members.length > 0) ||
        hasPresident || hasVicePresident

      if (!hasActiveMembers && clubId !== 'student_council') {
        // 标记社团为关闭
        ;(club as any).status = 'closed'
        closedClubs.push(clubId)
        console.log(`[YearProgression] Club "${club.name}" (${clubId}) closed - all members graduated`)
      }

      // 从玩家的加入列表中移除已关闭社团
      if ((club as any).status === 'closed' && this.player.joinedClubs.includes(clubId)) {
        const idx = this.player.joinedClubs.indexOf(clubId)
        if (idx > -1) this.player.joinedClubs.splice(idx, 1)
      }
    }

    if (closedClubs.length > 0) {
      console.log(`[YearProgression] Closed ${closedClubs.length} clubs:`, closedClubs)
      this.addCommand(`[系统] 📋 以下社团因全员毕业已暂时关闭：${closedClubs.map(id => this.world.allClubs[id]?.name || id).join('、')}`)
    }
  },

  // ==================== 第3步：升级处理 ====================

  /**
   * 处理年级升级（2→3, 1→2）
   * 注意：3年级班级已在 processGraduation 中删除
   */
  processGradeUpgrade(this: any) {
    console.log('[YearProgression] Step 3: Processing grade upgrade...')

    const allClassData = this.world.allClassData
    if (!allClassData) return

    // 收集各年级班级
    const grade2Classes: string[] = []
    const grade1Classes: string[] = []

    for (const classId of Object.keys(allClassData)) {
      const grade = extractGrade(classId)
      if (grade === 2) grade2Classes.push(classId)
      else if (grade === 1) grade1Classes.push(classId)
    }

    // ---- 2年级 → 3年级 ----
    // 此时 allClassData 中已无旧3年级（已在 processGraduation 删除），不会发生覆盖
    for (const oldClassId of grade2Classes) {
      const letter = extractClassLetter(oldClassId)
      const newClassId = makeClassId(3, letter)
      const classInfo = allClassData[oldClassId]
      if (!classInfo) continue

      // 更新班级名称
      classInfo.name = makeClassName(3, letter)

      // 更新学生的 classId
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      students.forEach((s: any) => { s.classId = newClassId })

      // 更新NPC数据中的 classId
      this.updateNpcClassIds(students, newClassId)

      // 如果玩家在这个班，升级玩家
      if (this.player.classId === oldClassId && this.player.role !== 'teacher') {
        this.player.classId = newClassId
        this.player.gradeYear = 3
        console.log(`[YearProgression] Player upgraded to ${newClassId}`)
      }
      
      // 教师模式：更新 teachingClasses
      if (this.player.role === 'teacher') {
        const idx = this.player.teachingClasses.indexOf(oldClassId)
        if (idx !== -1) {
          this.player.teachingClasses[idx] = newClassId
        }
        // 多班主任：更新 homeroomClassIds
        if (Array.isArray(this.player.homeroomClassIds)) {
          const hIdx = this.player.homeroomClassIds.indexOf(oldClassId)
          if (hIdx !== -1) {
            this.player.homeroomClassIds[hIdx] = newClassId
          }
        }
        // 兼容旧版 homeroomClassId
        if (this.player.homeroomClassId === oldClassId) {
          this.player.homeroomClassId = newClassId
          // 如果教师绑定了 classId，也更新
          if (this.player.classId === oldClassId) {
            this.player.classId = newClassId
          }
        }
        // classSubjectMap：迁移旧key到新key
        if (this.player.classSubjectMap && this.player.classSubjectMap[oldClassId]) {
          this.player.classSubjectMap[newClassId] = this.player.classSubjectMap[oldClassId]
          delete this.player.classSubjectMap[oldClassId]
        }
      }

      allClassData[newClassId] = classInfo
      delete allClassData[oldClassId]
    }

    // ---- 1年级 → 2年级 ----
    for (const oldClassId of grade1Classes) {
      const letter = extractClassLetter(oldClassId)
      const newClassId = makeClassId(2, letter)
      const classInfo = allClassData[oldClassId]
      if (!classInfo) continue

      classInfo.name = makeClassName(2, letter)

      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      students.forEach((s: any) => { s.classId = newClassId })

      this.updateNpcClassIds(students, newClassId)

      if (this.player.classId === oldClassId && this.player.role !== 'teacher') {
        this.player.classId = newClassId
        this.player.gradeYear = 2
        console.log(`[YearProgression] Player upgraded to ${newClassId}`)
      }

      // 教师模式：更新 teachingClasses
      if (this.player.role === 'teacher') {
        const idx = this.player.teachingClasses.indexOf(oldClassId)
        if (idx !== -1) {
          this.player.teachingClasses[idx] = newClassId
        }
        // 多班主任：更新 homeroomClassIds
        if (Array.isArray(this.player.homeroomClassIds)) {
          const hIdx = this.player.homeroomClassIds.indexOf(oldClassId)
          if (hIdx !== -1) {
            this.player.homeroomClassIds[hIdx] = newClassId
          }
        }
        // 兼容旧版 homeroomClassId
        if (this.player.homeroomClassId === oldClassId) {
          this.player.homeroomClassId = newClassId
          if (this.player.classId === oldClassId) {
            this.player.classId = newClassId
          }
        }
        // classSubjectMap：迁移旧key到新key
        if (this.player.classSubjectMap && this.player.classSubjectMap[oldClassId]) {
          this.player.classSubjectMap[newClassId] = this.player.classSubjectMap[oldClassId]
          delete this.player.classSubjectMap[oldClassId]
        }
      }

      allClassData[newClassId] = classInfo
      delete allClassData[oldClassId]
    }

    // 更新学年
    this.player.academicYear = this.world.gameTime.year

    console.log(`[YearProgression] Grade upgrade complete. Classes:`, Object.keys(allClassData))
  },

  /**
   * 更新NPC列表中的 classId
   */
  updateNpcClassIds(this: any, students: any[], newClassId: string) {
    for (const student of students) {
      if (!student.name) continue
      const npc = this.world.npcs.find((n: NpcStats) => n.name === student.name)
      if (npc) {
        (npc as any).classId = newClassId
      }
    }
  },

  // ==================== 第4步：新生入学 ====================

  /**
   * 从角色池中选取待入学角色，分配到1年级班级
   */
  async processNewStudentEnrollment(this: any) {
    console.log('[YearProgression] Step 4: Processing new student enrollment...')

    // 从 IndexedDB 获取角色池
    let characterPool: any[] = []
    try {
      characterPool = await getFullCharacterPool() || []
    } catch (e) {
      console.warn('[YearProgression] Failed to load character pool:', e)
      return
    }

    // 筛选待入学角色（grade === 0 或 classId 为空且 role === 'student'）
    const pendingStudents = characterPool.filter(c =>
      c.role === 'student' && (c.grade === 0 || (!c.classId && !c.grade))
    )

    if (pendingStudents.length === 0) {
      console.log('[YearProgression] No pending students for enrollment')
      return
    }

    console.log(`[YearProgression] Found ${pendingStudents.length} pending students`)

    // 按作品分组
    const workGroups = new Map<string, any[]>()
    for (const student of pendingStudents) {
      const origin = student.origin || '未知'
      // 提取干净的作品名
      const cleanOrigin = origin.replace(/^[\(（\[【](.+?)[\)）\]】]$/, '$1')
      if (!workGroups.has(cleanOrigin)) workGroups.set(cleanOrigin, [])
      workGroups.get(cleanOrigin)!.push(student)
    }

    // 确定班级数量（10~20人/班）
    const totalStudents = pendingStudents.length
    const numClasses = Math.max(1, Math.min(5, Math.ceil(totalStudents / 15)))
    const classLetters = ['A', 'B', 'C', 'D', 'E']

    // 检测偶像科角色
    const isIdolRelated = (student: any) => {
      const origin = (student.origin || '').toLowerCase()
      return /偶像|idol|love live|アイドル|bang dream|少女☆歌剧/.test(origin) ||
        student.electivePreference === 'performance'
    }

    // 分离偶像科和普通角色
    const idolStudents: any[] = []
    const normalGroups = new Map<string, any[]>()

    for (const [work, students] of workGroups) {
      const allIdol = students.every(s => isIdolRelated(s))
      if (allIdol && students.length > 0) {
        idolStudents.push(...students)
      } else {
        // 混合组：偶像角色进E班，其他进普通班
        for (const s of students) {
          if (isIdolRelated(s)) {
            idolStudents.push(s)
          } else {
            if (!normalGroups.has(work)) normalGroups.set(work, [])
            normalGroups.get(work)!.push(s)
          }
        }
      }
    }

    // 创建1年级班级
    const newClasses: Record<string, any> = {}
    const classBuckets: any[][] = []

    // 普通班
    const normalClassCount = idolStudents.length > 0 ? numClasses - 1 : numClasses
    for (let i = 0; i < Math.max(1, normalClassCount); i++) {
      const letter = classLetters[i]
      const classId = makeClassId(1, letter)
      newClasses[classId] = {
        name: makeClassName(1, letter),
        headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
        teachers: [],
        students: []
      }
      classBuckets.push(newClasses[classId].students)
    }

    // 偶像科 E班
    if (idolStudents.length > 0) {
      const idolClassId = makeClassId(1, 'E')
      newClasses[idolClassId] = {
        name: makeClassName(1, 'E'),
        headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
        teachers: [],
        students: []
      }

      // 分配偶像科学生
      for (const student of idolStudents) {
        newClasses[idolClassId].students.push({
          name: student.name,
          gender: student.gender || 'female',
          origin: student.origin || '',
          role: 'student',
          classId: idolClassId,
          electivePreference: student.electivePreference || 'performance',
          scheduleTag: student.scheduleTag || ''
        })
      }
    }

    // 分配普通学生（按作品分组，同作品优先同班）
    // 按组大小降序排列
    const sortedGroups = Array.from(normalGroups.entries())
      .sort((a, b) => b[1].length - a[1].length)

    // 预先缓存普通班级 ID 列表，避免每次分配时重新计算
    const normalClassIds = Object.keys(newClasses).filter(id => extractGrade(id) === 1 && !id.endsWith('E'))

    for (const [_work, students] of sortedGroups) {
      // 找最少人的班级
      let minIdx = 0
      let minCount = Infinity
      for (let i = 0; i < classBuckets.length; i++) {
        if (classBuckets[i].length < minCount) {
          minCount = classBuckets[i].length
          minIdx = i
        }
      }

      // 安全检查：确保索引不越界
      const safeClassId = (idx: number) => {
        if (idx < normalClassIds.length) return normalClassIds[idx]
        // 后备：使用取模或构造默认ID
        return normalClassIds[idx % normalClassIds.length] || makeClassId(1, classLetters[idx % classLetters.length])
      }

      // 如果整组加入后不超过20人，整组一起
      if (classBuckets[minIdx].length + students.length <= 20) {
        const classId = safeClassId(minIdx)
        for (const student of students) {
          classBuckets[minIdx].push({
            name: student.name,
            gender: student.gender || 'female',
            origin: student.origin || '',
            role: 'student',
            classId: classId,
            electivePreference: student.electivePreference || 'general',
            scheduleTag: student.scheduleTag || ''
          })
        }
      } else {
        // 组太大，逐个分配到最少人的班
        for (const student of students) {
          let mi = 0
          let mc = Infinity
          for (let i = 0; i < classBuckets.length; i++) {
            if (classBuckets[i].length < mc) { mc = classBuckets[i].length; mi = i }
          }
          const classId = safeClassId(mi)
          classBuckets[mi].push({
            name: student.name,
            gender: student.gender || 'female',
            origin: student.origin || '',
            role: 'student',
            classId: classId,
            electivePreference: student.electivePreference || 'general',
            scheduleTag: student.scheduleTag || ''
          })
        }
      }
    }

    // 将新班级添加到 allClassData
    for (const [classId, classInfo] of Object.entries(newClasses)) {
      this.world.allClassData[classId] = classInfo
    }

    // 更新角色池中的 grade 标记
    for (const student of pendingStudents) {
      student.grade = 1
      // 找到对应的班级分配
      for (const [classId, classInfo] of Object.entries(newClasses) as any[]) {
        const found = classInfo.students.find((s: any) => s.name === student.name)
        if (found) {
          student.classId = classId
          break
        }
      }
    }

    // 保存更新后的角色池
    try {
      await saveFullCharacterPool(deepClone(characterPool))
    } catch (e) {
      console.warn('[YearProgression] Failed to save character pool:', e)
    }

    // 为新生创建NPC条目
    for (const [classId, classInfo] of Object.entries(newClasses) as any[]) {
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      for (const student of students) {
        const charId = generateCharId(student.name)
        if (!this.world.npcs.find((n: NpcStats) => n.id === charId)) {
          this.world.npcs.push({
            id: charId,
            name: student.name,
            relationship: 0,
            isAlive: false,
            location: classId,
            classId: classId,
            role: 'student' as const
          })
        }
      }
    }

    const enrolledCount = pendingStudents.length
    const classCount = Object.keys(newClasses).length
    console.log(`[YearProgression] Enrolled ${enrolledCount} students into ${classCount} new 1st-year classes`)
    this.addCommand(`[系统] 🌸 ${enrolledCount} 名新生入学，分配到 ${classCount} 个1年级班级。`)
  },

  // ==================== 第5步：教师重分配 ====================

  /**
   * 将释放的教师分配给新1年级班级
   */
  processTeacherReassignment(this: any, freedTeachers: any[]) {
    console.log('[YearProgression] Step 5: Reassigning teachers...')

    if (!freedTeachers || freedTeachers.length === 0) {
      console.log('[YearProgression] No freed teachers to reassign')
      return
    }

    const allClassData = this.world.allClassData
    if (!allClassData) return

    // 收集新1年级班级（没有班主任或教师不足的）
    const grade1Classes: string[] = []
    for (const classId of Object.keys(allClassData)) {
      if (extractGrade(classId) === 1) {
        grade1Classes.push(classId)
      }
    }

    if (grade1Classes.length === 0) {
      console.log('[YearProgression] No grade 1 classes to assign teachers to')
      return
    }

    // 分离班主任候选和普通教师候选
    const headTeacherCandidates = freedTeachers.filter(t => t.wasHeadTeacher)
    const regularTeacherCandidates = freedTeachers.filter(t => !t.wasHeadTeacher)

    // 先分配班主任
    let htIdx = 0
    for (const classId of grade1Classes) {
      const classInfo = allClassData[classId]
      if (!classInfo) continue

      // 如果没有班主任，从候选中分配
      if (!classInfo.headTeacher?.name && htIdx < headTeacherCandidates.length) {
        const teacher = headTeacherCandidates[htIdx++]
        classInfo.headTeacher = {
          name: teacher.name,
          gender: teacher.gender || 'female',
          origin: teacher.origin || '',
          role: 'teacher'
        }

        // 确保NPC存在
        const charId = generateCharId(teacher.name)
        const existingNpc = this.world.npcs.find((n: NpcStats) => n.id === charId)
        if (existingNpc) {
          (existingNpc as any).classId = classId
        }

        console.log(`[YearProgression] Assigned ${teacher.name} as head teacher of ${classId}`)
      }
    }

    // 分配科任教师（轮流分配到各班）
    let classIdx = 0
    for (const teacher of regularTeacherCandidates) {
      if (grade1Classes.length === 0) break

      const classId = grade1Classes[classIdx % grade1Classes.length]
      const classInfo = allClassData[classId]
      if (!classInfo) continue

      if (!classInfo.teachers) classInfo.teachers = []
      classInfo.teachers.push({
        name: teacher.name,
        gender: teacher.gender || 'female',
        origin: teacher.origin || '',
        subject: teacher.subject || '',
        role: 'teacher'
      })

      // 确保NPC存在
      const charId = generateCharId(teacher.name)
      const existingNpc = this.world.npcs.find((n: NpcStats) => n.id === charId)
      if (existingNpc) {
        (existingNpc as any).classId = classId
      }

      classIdx++
    }

    console.log(`[YearProgression] Reassigned ${freedTeachers.length} teachers to grade 1 classes`)
  },

  // ==================== 第6步：课程与选修重置 ====================

  /**
   * 重置所有学生的选修课数据
   */
  resetCoursesAndElectives(this: any) {
    console.log('[YearProgression] Step 6: Resetting courses and electives...')

    // 重置玩家选修课
    this.player.selectedElectives = []
    this.player.electivesLockedForTerm = null

    // 重置NPC选修课（如果有在状态中追踪的话）
    // 选修课主要在世界书中追踪，此处主要重置玩家端

    console.log('[YearProgression] Courses and electives reset')
  },

  // ==================== 第7步：重新生成课表 ====================

  /**
   * 为玩家和所有班级重新生成课表
   */
  async regenerateSchedules(this: any) {
    console.log('[YearProgression] Step 7: Regenerating schedules...')

    const weekNumber = this.getWeekNumber()

    // 重新生成玩家课表
    if (this.player.role === 'teacher') {
      // 教师课表
      const { generateIndependentTeacherSchedule } = await import('../../utils/scheduleGenerator')
      this.player.schedule = generateIndependentTeacherSchedule(
        {
          teachingClasses: this.player.teachingClasses,
          homeroomClassIds: this.player.homeroomClassIds || (this.player.homeroomClassId ? [this.player.homeroomClassId] : []),
          classSubjectMap: this.player.classSubjectMap || {},
          teachingSubjects: this.player.teachingSubjects,
          teachingElectives: this.player.teachingElectives,
          customCourses: this.player.customCourses || []
        },
        { year: this.world.gameTime.year, month: this.world.gameTime.month, day: this.world.gameTime.day },
        this.world.allClassData
      )
      console.log('[YearProgression] Regenerated teacher schedule')
    } else if (this.player.classId) {
      // 学生课表
      const classInfo = this.world.allClassData[this.player.classId]
      if (classInfo) {
        this.player.classRoster = classInfo
        this.player.schedule = generateWeeklySchedule(this.player.classId, classInfo, weekNumber)
        console.log('[YearProgression] Regenerated player schedule for', this.player.classId)
      }
    }

    // 清除NPC位置缓存
    clearAllCache()

    console.log('[YearProgression] Schedules regenerated')
  },

  // ==================== 第8步：刷新NPC和班级群 ====================

  /**
   * 重新初始化NPC数据和班级群
   */
  async refreshNpcAndGroups(this: any) {
    console.log('[YearProgression] Step 8: Refreshing NPC data and groups...')

    // 重新初始化所有班级NPC
    this.initializeAllClassNpcs()

    // 重建班级群
    // 先移除所有旧班级群
    this.player.social.groups = this.player.social.groups.filter(
      (g: Group) => !g.id.startsWith('group_')
    )

    // 为玩家当前班级创建新群
    if (this.player.role === 'teacher') {
      // 教师加入所有教授班级的群
      for (const classId of this.player.teachingClasses) {
        const classInfo = this.world.allClassData[classId]
        if (classInfo) {
          await this.joinClassGroup(classId, classInfo)
        }
      }
    } else if (this.player.classId) {
      // 学生加入自己班级的群
      const classInfo = this.world.allClassData[this.player.classId]
      if (classInfo) {
        await this.joinClassGroup(this.player.classId, classInfo)
      }
    }

    console.log('[YearProgression] NPC data and groups refreshed')
  },

  // ==================== 第9步：同步世界书（使用 runId 隔离） ====================

  /**
   * 同步所有变更到世界书
   * 使用 [Class:classId:runId] 格式创建存档隔离的条目
   */
  async syncWorldbookAfterProgression(this: any) {
    console.log('[YearProgression] Step 9: Syncing worldbook with runId isolation...')

    try {
      const runId = this.meta.currentRunId
      const playerClassId = this.player.classId

      // 为所有当前班级创建带 runId 的世界书条目
      // 这会同时禁用对应的原始条目
      for (const [classId, classInfo] of Object.entries(this.world.allClassData) as [string, any][]) {
        await createRunSpecificClassEntry(classId, classInfo, runId, playerClassId)
      }

      // 同步社团状态（统一一次性调用）
      await syncClubWorldbookState(runId, this.settings?.useGeminiMode)

      // 同步社交关系概览
      await saveSocialRelationshipOverview()

      // 清除选修课世界书条目
      try {
        const { clearElectiveEntries } = await import('../../utils/electiveWorldbook.js')
        await clearElectiveEntries(runId)
      } catch (e) {
        console.warn('[YearProgression] Failed to clear elective entries:', e)
      }

      console.log('[YearProgression] Worldbook sync complete')
    } catch (e) {
      console.error('[YearProgression] Worldbook sync error:', e)
    }
  },

  // ==================== 手动触发（调试/管理用） ====================

  /**
   * 手动触发学年进级（用于调试或管理面板）
   */
  async forceYearProgression(this: any) {
    console.log('[YearProgression] Force triggering year progression...')
    const academicYearId = this.world.gameTime.year
    this.world.lastAcademicYear = academicYearId
    await this.executeYearProgression(academicYearId)
  }
}
