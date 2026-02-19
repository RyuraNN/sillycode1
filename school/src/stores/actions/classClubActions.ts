/**
 * 班级与社团相关 Actions
 */

import type { ClubData, Group, NpcStats } from '../gameStoreTypes'
import { fetchClassDataFromWorldbook, fetchClubDataFromWorldbook, addPlayerToClubInWorldbook, removePlayerFromClubInWorldbook, syncClubWorldbookState, syncClassWorldbookState, setPlayerClass, setVariableParsingWorldbookStatus, addNpcToClubInWorldbook, createClubInWorldbook, ensureClubExistsInWorldbook, setupTeacherClassEntries } from '../../utils/worldbookParser'
import { DEFAULT_FORUM_POSTS, saveForumToWorldbook, switchForumSlot } from '../../utils/forumWorldbook'
import { saveSocialData, switchSaveSlot, saveSocialRelationshipOverview, restoreWorldbookFromStore } from '../../utils/socialWorldbook'
import { switchPartTimeSaveSlot, restorePartTimeWorldbookFromStore } from '../../utils/partTimeWorldbook'
import { saveImpressionData, switchImpressionSlot, restoreImpressionWorldbookFromStore } from '../../utils/impressionWorldbook'
import { generateWeeklySchedule } from '../../utils/scheduleGenerator'
import { generateCharId } from '../../data/relationshipData'
import { createInitialPlayerState, createInitialGameTime, createInitialWorldState } from '../gameStoreState'
import { getCurrentBookName } from '../../utils/worldbookHelper'

export const classClubActions = {
  /**
   * 加载班级数据（优先从世界书加载）
   */
  async loadClassData(this: any) {
    console.log('[GameStore] Loading class data...')
    const worldbookData = await fetchClassDataFromWorldbook()
    if (worldbookData) {
      console.log('[GameStore] Loaded class data from Worldbook', worldbookData)
      this.allClassData = worldbookData
    } else {
      console.warn('[GameStore] Failed to load class data from Worldbook')
      this.allClassData = {}
    }
    
    // 初始化所有班级的 NPC 数据
    this.initializeAllClassNpcs()
  },

  /**
   * 初始化所有班级的 NPC
   * 将所有班级数据中的学生和老师添加到全局 NPC 列表中，确保他们能被日程系统调度
   */
  initializeAllClassNpcs(this: any) {
    if (!this.allClassData) return
    
    console.log('[GameStore] Initializing all class NPCs...')
    let count = 0
    
    for (const [classId, classInfo] of Object.entries(this.allClassData)) {
      const info = classInfo as any
      
      const addNpc = (name: string, role: 'student' | 'teacher' = 'student') => {
        if (!name) return
        const charId = generateCharId(name)
        
        // 检查是否存在
        const existingNpc = this.npcs.find((n: NpcStats) => n.id === charId)
        if (!existingNpc) {
          this.npcs.push({
            id: charId,
            name: name,
            relationship: 0,
            isAlive: false, // isAlive 表示与玩家在场，默认 false 让日程系统计算位置
            location: classId, // 初始位置
            classId: classId,
            role: role
          })
          count++
        } else {
          // 如果已存在，确保 classId 被正确设置
          if (!existingNpc.classId) {
            existingNpc.classId = classId
          }
        }
      }

      // 添加班主任
      if (info.headTeacher?.name) {
        addNpc(info.headTeacher.name, 'teacher')
      }
      
      // 添加任课老师
      if (info.teachers && Array.isArray(info.teachers)) {
        info.teachers.forEach((t: any) => addNpc(t.name, 'teacher'))
      }
      
      // 添加学生
      if (info.students && Array.isArray(info.students)) {
        info.students.forEach((s: any) => {
          if (s.name && s.name !== this.player.name) {
            addNpc(s.name, 'student')
          }
        })
      }
    }
    
    console.log(`[GameStore] Initialized ${count} new NPCs from class data. Total NPCs: ${this.npcs.length}`)
  },

  /**
   * 加载社团数据
   * 注意：合并而非覆盖玩家创建的社团（以 player_club_ 前缀识别）
   * 
   * 【重要】玩家创建的社团数据（内存中的）优先级高于世界书中的数据，
   * 因为内存中的数据包含完整的运行时属性（如 _bookName）和最新的成员信息。
   */
  async loadClubData(this: any) {
    console.log('[GameStore] Loading club data for run:', this.currentRunId)
    
    // 保存内存中已有的所有社团（包括运行时属性）
    const existingClubs: Record<string, ClubData> = {}
    if (this.allClubs) {
      for (const [clubId, club] of Object.entries(this.allClubs)) {
        existingClubs[clubId] = club as ClubData
      }
    }
    const existingClubCount = Object.keys(existingClubs).length
    
    // 传入 currentRunId 确保只加载当前存档的社团数据
    const clubData = await fetchClubDataFromWorldbook(this.currentRunId)
    if (clubData) {
      console.log('[GameStore] Loaded club data from Worldbook', clubData)
      
      const worldbookClubs = clubData as Record<string, ClubData>
      const worldbookClubCount = Object.keys(worldbookClubs).length
      
      // 【修复】智能合并策略：
      // 如果世界书返回的社团数量明显少于内存中的（可能是API部分失败），
      // 以内存数据为主，用世界书数据补充缺失的 _bookName 等属性
      if (existingClubCount > 0 && worldbookClubCount === 0) {
        console.warn('[GameStore] Worldbook returned 0 clubs but memory has', existingClubCount, '- keeping memory data')
        this.allClubs = existingClubs
      } else {
        // 正常合并：世界书数据作为基础，内存中的社团覆盖（保留运行时属性）
        this.allClubs = {
          ...worldbookClubs,       // 世界书中的社团作为基础
          ...existingClubs         // 内存中的社团覆盖（保留运行时属性）
        }
      }
      
      // 确保所有社团都有 _bookName
      const defaultBookName = getCurrentBookName()
      
      if (defaultBookName) {
        for (const [clubId, club] of Object.entries(this.allClubs)) {
          if (!(club as any)._bookName) {
            console.log(`[GameStore] Setting missing _bookName for ${clubId}`)
            ;(club as any)._bookName = defaultBookName
          }
        }
      }
    } else {
      console.warn('[GameStore] Failed to load club data from Worldbook')
      // 保留内存中已有的社团
      this.allClubs = existingClubs
    }

    // 确保系统社团（学生会）存在
    await this.ensureSystemClubs()
    
    console.log('[GameStore] Final club count:', Object.keys(this.allClubs).length, 'clubs:', Object.keys(this.allClubs))
  },

  /**
   * 确保系统社团（如学生会）存在
   */
  async ensureSystemClubs(this: any) {
    if (!this.allClubs['student_council']) {
      const studentCouncil: ClubData = {
        id: 'student_council',
        name: '学生会',
        description: '管理学校日常事务，维护校园秩序的自治组织。',
        coreSkill: '领导力',
        activityDay: '每日',
        location: 'mb_student_council_room',
        advisor: '校长',
        president: '学生会长',
        members: []
      }
      this.allClubs['student_council'] = studentCouncil
      
      // 确保在世界书中创建（通用绿灯策略）
      // 学生会初始状态不带 runId，作为通用条目存在。
      // 当玩家或NPC加入时，会自动创建带 runId 的副本并开启蓝灯。
      await ensureClubExistsInWorldbook(studentCouncil, null as any)
    }
  },

  /**
   * 设置玩家班级并生成课表
   */
  async setPlayerClass(this: any, classId: string) {
    this.player.classId = classId

    // 自动更新年级 (例如 "2-d" -> 2)
    const grade = parseInt(classId.charAt(0))
    if (!isNaN(grade)) {
      this.player.gradeYear = grade
    }
    
    const classInfo = this.allClassData[classId]
    if (classInfo) {
      this.player.classRoster = classInfo
      const weekNumber = this.getWeekNumber()
      this.player.schedule = generateWeeklySchedule(classId, classInfo, weekNumber)
      console.log('[GameStore] Generated schedule for class:', classId, this.player.schedule)

      // 如果是教师，加入所有执教班级的群聊
      if (this.player.role === 'teacher' && this.player.teachingClasses && this.player.teachingClasses.length > 0) {
        for (const teachingClassId of this.player.teachingClasses) {
          const teachingClassInfo = this.allClassData[teachingClassId]
          if (teachingClassInfo) {
            await this.joinClassGroup(teachingClassId, teachingClassInfo)
          }
        }
      } else {
        // 学生只加入自己班级的群聊
        await this.joinClassGroup(classId, classInfo)
      }
      
      this.saveToStorage()
    }
  },

  /**
   * 自动加入班级群
   */
  async joinClassGroup(this: any, classId: string, classInfo: any) {
    const groupId = `group_${classId}`
    
    // 如果是教师，不要清除旧的班级群，允许加入多个
    // 如果是学生，清除旧的班级群（模拟转班）
    if (this.player.role !== 'teacher') {
      this.player.social.groups = this.player.social.groups.filter((g: Group) => !g.id.startsWith('group_'))
    }
    
    if (this.player.social.groups.some((g: Group) => g.id === groupId)) return

    const members: string[] = ['player']
    
    const addMember = (name: string, role: 'student' | 'teacher' = 'student') => {
      const charId = generateCharId(name)
      if (members.includes(charId)) return

      members.push(charId)
      
      if (!this.npcs.find((n: NpcStats) => n.id === charId)) {
        this.npcs.push({
          id: charId,
          name: name,
          relationship: 0,
          isAlive: false,
          location: classId,
          classId: classId, // 显式设置 classId，用于日程系统
          role: role
        })
      }
    }

    if (classInfo.headTeacher && classInfo.headTeacher.name) {
      addMember(classInfo.headTeacher.name, 'teacher')
    }
    
    if (classInfo.teachers && Array.isArray(classInfo.teachers)) {
      classInfo.teachers.forEach((t: any) => {
        if (t.name) addMember(t.name, 'teacher')
      })
    }
    
    if (classInfo.students && Array.isArray(classInfo.students)) {
      classInfo.students.forEach((s: any) => {
        if (s.name && s.name !== this.player.name) {
          addMember(s.name, 'student')
        }
      })
    }

    const classGroup: Group = {
      id: groupId,
      name: `${classInfo.name || classId}群`,
      avatar: '🏫',
      members: members,
      announcement: `欢迎加入${classInfo.name || classId}大家庭！`,
      messages: [],
      unreadCount: 0
    }

    this.player.social.groups.push(classGroup)
    console.log('[GameStore] Auto joined class group:', classGroup.name)
    
    try {
      await saveSocialData(classGroup.id, classGroup.name, {
        messages: [],
        unreadCount: 0
      }, members.map((memberId: string) => {
        if (memberId === 'player') return this.player.name
        const npc = this.npcs.find((n: NpcStats) => n.id === memberId)
        return npc ? npc.name : null
      }).filter((n: any) => n), this.currentFloor)
      
      console.log('[GameStore] Class group worldbook entry created')
      await saveSocialRelationshipOverview()
      
      this.saveToStorage()
    } catch (e) {
      console.error('[GameStore] Failed to create class group worldbook entry:', e)
    }
  },

  /**
   * 加入社团
   */
  joinClub(this: any, clubName: string) {
    if (!this.player.joinedClubs.includes(clubName)) {
      this.player.joinedClubs.push(clubName)
    }
  },

  /**
   * 退出社团
   */
  leaveClub(this: any, clubName: string) {
    const index = this.player.joinedClubs.indexOf(clubName)
    if (index > -1) {
      this.player.joinedClubs.splice(index, 1)
    }
  },

  /**
   * 获取社团详情
   */
  getClubById(this: any, clubId: string): ClubData | undefined {
    return this.allClubs[clubId]
  },

  /**
   * 检查玩家是否是某社团成员
   */
  isClubMember(this: any, clubId: string): boolean {
    return this.player.joinedClubs.includes(clubId)
  },

  /**
   * 获取玩家已加入的所有社团
   */
  getJoinedClubs(this: any): ClubData[] {
    return this.player.joinedClubs
      .map((id: string) => this.allClubs[id])
      .filter((club: any) => club !== undefined) as ClubData[]
  },

  /**
   * 通过邀请加入社团
   */
  async joinClubByInvitation(this: any, clubId: string) {
    const club = this.allClubs[clubId]
    if (!club) return
    
    if (!this.player.joinedClubs.includes(clubId)) {
      this.player.joinedClubs.push(clubId)
      
      await addPlayerToClubInWorldbook(clubId, this.player.name, club, this.currentRunId)
      
      this.addCommand(`[系统提示] 你已加入${club.name}`)
    }
  },

  /**
   * 通过指令退出社团
   */
  async leaveClubByCommand(this: any, clubId: string) {
    const index = this.player.joinedClubs.indexOf(clubId)
    if (index > -1) {
      this.player.joinedClubs.splice(index, 1)
      
      const club = this.allClubs[clubId]
      if (club) {
        await removePlayerFromClubInWorldbook(clubId, this.player.name, club, this.currentRunId)
      }
      this.addCommand(`[系统提示] 你已退出${club ? club.name : clubId}`)
    }
  },

  /**
   * 申请加入社团
   */
  async applyToJoinClub(this: any, clubId: string) {
    const club = this.allClubs[clubId]
    if (!club) {
      return { success: false, message: '社团不存在' }
    }

    this.clubApplication = {
      clubId: clubId,
      clubName: club.name,
      remainingTurns: 3
    }
    
    this.addCommand(`[系统] 玩家申请加入"${club.name}"。`)

    return { success: true, message: '申请已提交，请等待回复' }
  },

  /**
   * 教师成为社团顾问
   */
  async becomeClubAdvisor(this: any, clubId: string) {
    const club = this.allClubs[clubId]
    if (!club) {
      return { success: false, message: '社团不存在' }
    }
    
    if (club.advisor) {
      return { success: false, message: '该社团已有顾问' }
    }
    
    // 更新社团数据
    club.advisor = this.player.name
    
    // 更新玩家数据
    if (!this.player.joinedClubs.includes(clubId)) {
      this.player.joinedClubs.push(clubId)
    }
    
    // 更新 advisorClubs (如果使用)
    if (!this.player.advisorClubs) this.player.advisorClubs = []
    if (!this.player.advisorClubs.includes(clubId)) {
      this.player.advisorClubs.push(clubId)
    }
    
    // 同步到世界书 (如果是教师模式，可能需要特殊的更新逻辑，但目前 addPlayerToClubInWorldbook 主要是把玩家加到 members，
    // 我们需要一个更新 advisor 的方法。如果没有，我们可以尝试用 updateClubInWorldbook)
    
    // 暂时先用 addCommand 模拟
    this.addCommand(`[系统] 你已成为"${club.name}"的指导老师。`)
    
    // 强制保存
    this.saveToStorage(true)
    
    // 尝试同步世界书 (复用 createClubInWorldbook 的更新逻辑或者 syncClubWorldbookState)
    await syncClubWorldbookState(this.currentRunId)
    
    return { success: true, message: `已成为${club.name}的顾问` }
  },

  /**
   * 拒绝社团申请
   */
  rejectClubApplication(this: any, clubId: string, from: string, reason: string) {
    if (this.clubApplication && this.clubApplication.clubId === clubId) {
      this.clubApplication = null
    }

    this.clubRejection = {
      clubName: this.allClubs[clubId]?.name || clubId,
      from,
      reason
    }
    console.log(`Club application rejected: ${reason}`)
  },

  /**
   * 确认拒绝通知
   */
  confirmClubRejection(this: any) {
    this.clubRejection = null
  },

  /**
   * 确认邀请通知（邀请被接受或拒绝后清除）
   */
  confirmClubInvitation(this: any) {
    this.clubInvitation = null
  },

  /**
   * 玩家邀请 NPC 加入社团
   */
  async inviteNpcToClub(this: any, clubId: string, npcName: string) {
    const club = this.allClubs[clubId]
    if (!club) {
      return { success: false, message: '社团不存在' }
    }

    // 检查玩家是否是该社团成员
    if (!this.player.joinedClubs.includes(clubId)) {
      return { success: false, message: '你不是该社团成员，无法邀请他人' }
    }

    // 检查 NPC 是否已经是社团成员
    if (club.members && club.members.includes(npcName)) {
      return { success: false, message: `${npcName} 已经是社团成员` }
    }

    // 检查是否已有待处理的邀请
    if (this.clubInvitation) {
      return { success: false, message: '请等待当前邀请处理完成' }
    }

    this.clubInvitation = {
      clubId: clubId,
      clubName: club.name,
      targetName: npcName,
      remainingTurns: 3
    }

    this.addCommand(`[系统] ${this.player.name}邀请"${npcName}"加入"${club.name}"。`)

    return { success: true, message: `已向 ${npcName} 发送邀请` }
  },

  /**
   * 处理接受社团邀请 (NPC 或 玩家)
   * 
   * 【重要修复】确保内存中的成员列表更改立即保存到存档，
   * 即使世界书更新失败，存档数据仍然是正确的。
   */
  async handleClubInviteAccepted(this: any, clubId: string, name: string) {
    const club = this.allClubs[clubId]
    if (!club) {
      console.warn(`[GameStore] Club ${clubId} not found in allClubs`)
      return
    }

    console.log(`[GameStore] Processing club invite acceptance: ${name} -> ${club.name}`)

    // 更新社团成员列表（内存）
    if (!club.members) club.members = []
    if (!club.members.includes(name)) {
      club.members.push(name)
      console.log(`[GameStore] Added ${name} to ${club.name} members list`)
    }

    // 区分玩家和 NPC
    if (name === this.player.name) {
      // 如果是玩家被邀请
      if (!this.player.joinedClubs.includes(clubId)) {
        this.player.joinedClubs.push(clubId)
        console.log(`[GameStore] Player joined club ${clubId}`)
      }
      await addPlayerToClubInWorldbook(clubId, name, club, this.currentRunId)
      this.addCommand(`[系统提示] 你接受了邀请，加入了${club.name}`)
    } else {
      // 如果是 NPC
      const success = await addNpcToClubInWorldbook(clubId, name, club, this.currentRunId)
      if (!success) {
        console.warn(`[GameStore] Failed to update worldbook for NPC ${name} joining ${club.name}, but memory is updated`)
      }
      this.addCommand(`[系统提示] ${name}接受了邀请，加入了${club.name}`)
    }

    // 清除邀请状态 (如果是玩家发起的邀请)
    if (this.clubInvitation && this.clubInvitation.clubId === clubId && this.clubInvitation.targetName === name) {
      this.clubInvitation = null
    }

    // 【关键修复】立即保存到存储，确保内存中的更改不会丢失
    // 即使世界书更新失败，存档中仍然保存了正确的成员列表
    this.saveToStorage(true)

    console.log(`[GameStore] ${name} joined club ${club.name}, data saved`)
  },

  /**
   * 处理 NPC 拒绝社团邀请
   */
  handleClubInviteRejected(this: any, clubId: string, npcName: string, reason: string) {
    // 清除邀请状态
    if (this.clubInvitation && this.clubInvitation.clubId === clubId && this.clubInvitation.targetName === npcName) {
      this.clubInvitation = null
    }

    const club = this.allClubs[clubId]
    this.addCommand(`[系统提示] ${npcName}拒绝了加入${club?.name || clubId}的邀请：${reason}`)
    console.log(`[GameStore] ${npcName} rejected club invitation: ${reason}`)
  },

  /**
   * 玩家创建新社团
   * 
   * 【重要修复】即使世界书 API 不可用，也要确保：
   * 1. 社团数据保存到内存 (allClubs)
   * 2. 玩家加入社团列表更新 (joinedClubs)
   * 3. 数据能被正确导出
   */
  async createClub(this: any, clubInfo: { name: string; description: string; coreSkill?: string; activityDay?: string; location?: string; advisor?: string }) {
    // 生成社团 ID
    const clubId = `player_club_${Date.now().toString(36)}`

    console.log(`[GameStore] Creating club ${clubId}: ${clubInfo.name}`)

    // 获取默认世界书名称（用于后续更新）
    const defaultBookName = getCurrentBookName()

    const fullClubInfo: ClubData = {
      id: clubId,
      name: clubInfo.name,
      description: clubInfo.description,
      coreSkill: clubInfo.coreSkill || '',
      activityDay: clubInfo.activityDay || '',
      location: clubInfo.location || '',
      advisor: clubInfo.advisor || '',
      president: this.player.name, // 玩家是部长
      vicePresident: '',
      members: [this.player.name] // 确保玩家在成员列表中
    }

    // 尝试创建世界书条目
    let club = await createClubInWorldbook(fullClubInfo, this.currentRunId)
    let worldbookSuccess = !!club

    // 【关键修复】即使世界书创建失败，也要在内存中保存社团数据
    if (!club) {
      console.warn(`[GameStore] Worldbook API failed for club ${clubId}, saving to memory only`)
      // 创建一个内存中的社团对象
      club = {
        ...fullClubInfo,
        _bookName: defaultBookName // 设置默认 bookName，以便后续可以重试写入世界书
      } as ClubData & { _bookName: string }
    }

    // 确保 allClubs 已初始化
    if (!this.allClubs) {
      this.allClubs = {}
    }

    // 添加到 allClubs
    this.allClubs[clubId] = club
    console.log(`[GameStore] Club ${clubId} added to allClubs. Current clubs:`, Object.keys(this.allClubs))

    // 玩家加入社团
    if (!this.player.joinedClubs.includes(clubId)) {
      this.player.joinedClubs.push(clubId)
      console.log(`[GameStore] Player joined club ${clubId}. joinedClubs:`, this.player.joinedClubs)
    }

    this.addCommand(`[系统提示] 你成功创建了社团"${clubInfo.name}"并成为部长`)

    // 保存到存储
    this.saveToStorage(true) // 强制立即保存

    // 返回结果
    if (worldbookSuccess) {
      return { success: true, message: `社团"${clubInfo.name}"创建成功！`, clubId: clubId }
    } else {
      // 世界书失败但内存保存成功
      return { 
        success: true, 
        message: `社团"${clubInfo.name}"创建成功！（世界书同步将在下次保存时进行）`, 
        clubId: clubId,
        warning: '世界书 API 暂时不可用，数据已保存到存档'
      }
    }
  },

  /**
   * 同步世界书状态（用于回溯后）
   */
  async syncWorldbook(this: any) {
    console.log('[GameStore] Syncing worldbook after rollback...')
    
    // 同步社团状态
    await syncClubWorldbookState(this.currentRunId)
    
    // 同步班级世界书条目状态（处理进级后的 runId 隔离条目）
    await syncClassWorldbookState(this.currentRunId, this.allClassData)

    // 教师模式：重建教师班级副本（注入科任教师等）
    if (this.player.role === 'teacher' && this.player.teachingClasses && this.player.teachingClasses.length > 0) {
      await setupTeacherClassEntries(
        this.player.teachingClasses,
        this.player.homeroomClassId,
        this.player.name,
        this.currentRunId,
        this.player.teachingSubjects,
        this.player.gender
      )
    } else if (this.player.classId) {
      // 同步班级策略（玩家班级蓝灯）
      await setPlayerClass(this.player.classId)
    }
    
    // 【修复】同步选修课状态：不仅切换开关，还要重新生成世界书条目
    // 回溯可能恢复了有选修课数据的快照，需要确保世界书条目与之一致
    try {
      const { syncElectiveWorldbookState } = await import('../../utils/electiveWorldbook.js')
      await syncElectiveWorldbookState(this.currentRunId)
      
      // 如果当前状态有选修课数据，重新生成世界书条目
      if (this.player.selectedElectives && this.player.selectedElectives.length > 0) {
        console.log('[GameStore] Re-generating elective worldbook entries after rollback, electives:', this.player.selectedElectives)
        await this.processNpcElectiveSelection()
      } else {
        // 回溯到选课之前的状态，清除选修课条目
        const { clearElectiveEntries } = await import('../../utils/electiveWorldbook.js')
        await clearElectiveEntries(this.currentRunId)
      }
    } catch (e) {
      console.warn('[GameStore] Failed to sync elective worldbook:', e)
    }
    
    // 同步社交数据
    await restoreWorldbookFromStore()
    await saveSocialRelationshipOverview()
    
    // 同步论坛数据
    await saveForumToWorldbook(this.player.forum.posts, this.currentRunId, this.settings.forumWorldbookLimit)
    
    // 同步兼职数据
    try {
      const { restorePartTimeWorldbookFromStore } = await import('../../utils/partTimeWorldbook.js')
      await restorePartTimeWorldbookFromStore()
    } catch (e) {
      console.warn('[GameStore] Failed to sync part-time worldbook:', e)
    }
    
    // 同步印象数据
    try {
      const { restoreImpressionWorldbookFromStore } = await import('../../utils/impressionWorldbook.js')
      await restoreImpressionWorldbookFromStore()
    } catch (e) {
      console.warn('[GameStore] Failed to sync impression worldbook:', e)
    }
    
    // 确保变量解析条目状态正确
    await setVariableParsingWorldbookStatus(!this.settings.assistantAI?.enabled)
    
    console.log('[GameStore] Worldbook sync complete')
  },

  /**
   * 重建世界书状态（用于存档导入/恢复）
   * 
   * 【安全增强】每个子操作有独立的 try-catch 和超时保护，
   * 单个操作失败不会阻塞整个初始化流程。
   */
  async rebuildWorldbookState(this: any) {
    console.log('[GameStore] Rebuilding worldbook state for run:', this.currentRunId)
    const startTime = Date.now()
    
    // 【防护】验证世界书内容确实已加载，避免在内容未就绪时执行写操作导致数据缺失
    if (typeof window.getWorldbook === 'function') {
      try {
        const bookName = getCurrentBookName()
        if (bookName) {
          const entries = await window.getWorldbook(bookName)
          if (!entries || !Array.isArray(entries) || entries.length === 0) {
            console.error('[GameStore] ⚠️ rebuildWorldbookState aborted: worldbook entries not loaded yet for', bookName)
            console.error('[GameStore] This may cause incomplete world data. Skipping rebuild to prevent data corruption.')
            return
          }
          console.log(`[GameStore] Worldbook "${bookName}" verified: ${entries.length} entries available`)
        }
      } catch (e) {
        console.warn('[GameStore] Error verifying worldbook readiness, proceeding with caution:', e)
      }
    }

    /**
     * 安全执行子操作，带超时和错误处理
     */
    const safeRebuildStep = async (fn: () => Promise<any>, label: string, timeoutMs: number = 15000): Promise<boolean> => {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            console.warn(`[GameStore] ⏰ rebuildWorldbookState: "${label}" timed out after ${timeoutMs}ms, skipping...`)
            resolve() // 超时不 reject，而是 resolve 继续后续步骤
          }, timeoutMs)
          
          fn().then(
            () => { clearTimeout(timer); resolve() },
            (error) => { clearTimeout(timer); console.warn(`[GameStore] ⚠️ rebuildWorldbookState: "${label}" failed:`, error); resolve() }
          )
        })
        return true
      } catch (e) {
        console.warn(`[GameStore] ⚠️ rebuildWorldbookState: "${label}" error:`, e)
        return false
      }
    }
    
    // 【调试】记录当前玩家社团状态
    const playerClubsBefore = this.player?.joinedClubs ? [...this.player.joinedClubs] : []
    const allClubIdsBefore = this.allClubs ? Object.keys(this.allClubs) : []
    console.log('[GameStore] Before rebuild - joinedClubs:', playerClubsBefore, 'allClubs:', allClubIdsBefore)

    // === Phase 1: 加载基础数据（班级和社团） ===

    // 【修复】如果 allClassData 已经从快照恢复（非空），不要用 loadClassData 覆盖
    const hasRestoredClassData = this.allClassData && Object.keys(this.allClassData).length > 0
    if (hasRestoredClassData) {
      console.log('[GameStore] allClassData already restored from snapshot, skipping loadClassData. Classes:', Object.keys(this.allClassData))
      try { this.initializeAllClassNpcs() } catch (e) { console.warn('[GameStore] initializeAllClassNpcs failed:', e) }
    } else {
      await safeRebuildStep(() => this.loadClassData(), 'loadClassData', 15000)
    }
    
    await new Promise(r => setTimeout(r, 50)) // Yield

    await safeRebuildStep(() => this.loadClubData(), 'loadClubData', 15000)
    
    // 【调试】检查加载后的社团状态
    const allClubIdsAfter = this.allClubs ? Object.keys(this.allClubs) : []
    console.log('[GameStore] After loadClubData - allClubs:', allClubIdsAfter)
    
    await new Promise(r => setTimeout(r, 50)) // Yield

    // === Phase 2: 同步世界书条目状态 ===
    
    // 如果是教师模式，恢复教师班级条目
    if (this.player.role === 'teacher' && this.player.teachingClasses && this.player.teachingClasses.length > 0) {
      // 先同步状态：禁用其他存档的 runId 副本，启用当前存档的
      await safeRebuildStep(
        () => syncClassWorldbookState(this.currentRunId, this.allClassData),
        'syncClassWorldbookState', 10000
      )
      // 再创建/更新当前教师存档的班级副本
      await safeRebuildStep(
        () => setupTeacherClassEntries(
          this.player.teachingClasses,
          this.player.homeroomClassId,
          this.player.name,
          this.currentRunId,
          this.player.teachingSubjects,
          this.player.gender
        ),
        'setupTeacherClassEntries', 15000
      )
    } else {
      // 学生模式或普通模式
      await safeRebuildStep(
        () => syncClassWorldbookState(this.currentRunId, this.allClassData),
        'syncClassWorldbookState', 10000
      )

      if (this.player.classId) {
        await safeRebuildStep(
          () => setPlayerClass(this.player.classId),
          'setPlayerClass', 5000
        )
      }
    }

    await new Promise(r => setTimeout(r, 100)) // Yield

    // 同步社团世界书条目
    await safeRebuildStep(async () => {
      const joinedClubsSet = new Set(this.player.joinedClubs)
      
      for (const [clubId, club] of Object.entries(this.allClubs)) {
        const clubData = club as ClubData
        await ensureClubExistsInWorldbook(clubData, this.currentRunId)

        if (joinedClubsSet.has(clubId)) {
          await addPlayerToClubInWorldbook(clubId, this.player.name, clubData, this.currentRunId)
        } else {
          await removePlayerFromClubInWorldbook(clubId, this.player.name, clubData, this.currentRunId)
        }
        // 每处理一个社团，稍微让出一点时间，防止大量社团导致卡顿
        await new Promise(r => setTimeout(r, 10)) 
      }

      await syncClubWorldbookState(this.currentRunId)
    }, 'syncClubWorldbook', 30000) // 增加超时
    
    await new Promise(r => setTimeout(r, 100)) // Yield

    // === Phase 3: 同步选修课 ===
    
    await safeRebuildStep(async () => {
      const { syncElectiveWorldbookState } = await import('../../utils/electiveWorldbook.js')
      await syncElectiveWorldbookState(this.currentRunId)

      if (this.player.selectedElectives && this.player.selectedElectives.length > 0) {
        let hasElectiveSlots = false
        if (this.player.schedule) {
          for (const [day, slots] of Object.entries(this.player.schedule)) {
            if (Array.isArray(slots)) {
              for (const slot of (slots as any[])) {
                if (slot.isElective && !slot.isEmpty && slot.courseId) {
                  hasElectiveSlots = true
                  break
                }
              }
            }
            if (hasElectiveSlots) break
          }
        }
        
        if (!hasElectiveSlots) {
          console.log('[GameStore] Elective slots missing from schedule, regenerating...')
          await this.generateElectiveSchedule()
        }
        
        await this.processNpcElectiveSelection()
      } else {
        const { clearElectiveEntries } = await import('../../utils/electiveWorldbook.js')
        await clearElectiveEntries(this.currentRunId)
      }
    }, 'syncElectives', 20000)
    
    await new Promise(r => setTimeout(r, 100)) // Yield

    // === Phase 4: 同步社交、论坛、兼职、印象等 ===
    
    // 分拆社交同步步骤，减轻单次操作压力
    await safeRebuildStep(async () => {
      await restoreWorldbookFromStore()
    }, 'syncSocial_restore', 20000) // 增加超时

    await new Promise(r => setTimeout(r, 50)) // Yield

    await safeRebuildStep(async () => {
      await saveSocialRelationshipOverview()
      await switchSaveSlot()
    }, 'syncSocial_overview', 10000)
    
    await new Promise(r => setTimeout(r, 50)) // Yield

    await safeRebuildStep(async () => {
      await saveForumToWorldbook(this.player.forum.posts, this.currentRunId, this.settings.forumWorldbookLimit)
      await switchForumSlot(this.currentRunId)
    }, 'syncForum', 15000)
    
    await new Promise(r => setTimeout(r, 50)) // Yield

    await safeRebuildStep(
      () => restorePartTimeWorldbookFromStore(),
      'syncPartTime', 10000
    )
    
    await new Promise(r => setTimeout(r, 50)) // Yield

    await safeRebuildStep(
      () => restoreImpressionWorldbookFromStore(),
      'syncImpression', 10000
    )

    await new Promise(r => setTimeout(r, 50)) // Yield

    // === Phase 5: 其他初始化 ===
    
    await safeRebuildStep(
      () => setVariableParsingWorldbookStatus(!this.settings.assistantAI?.enabled),
      'setVariableParsingStatus', 5000
    )
    
    await safeRebuildStep(
      () => this.loadEventData(),
      'loadEventData', 10000
    )

    // === 兜底：最终班级条目状态同步 ===
    // Phase 2 中 syncClassWorldbookState 设置的 enabled 状态可能被后续大量 updateWorldbookWith 调用覆盖，
    // 在所有写操作完成后再执行一次，确保班级条目状态正确。
    await safeRebuildStep(
      () => syncClassWorldbookState(this.currentRunId, this.allClassData),
      'finalClassSync', 10000
    )
    if (this.player.role === 'teacher' && this.player.teachingClasses && this.player.teachingClasses.length > 0) {
      await safeRebuildStep(
        () => setupTeacherClassEntries(
          this.player.teachingClasses,
          this.player.homeroomClassId,
          this.player.name,
          this.currentRunId,
          this.player.teachingSubjects,
          this.player.gender
        ),
        'finalTeacherClassSetup', 15000
      )
    }

    const elapsed = Date.now() - startTime
    console.log(`[GameStore] Worldbook state rebuild complete in ${elapsed}ms`)
  },

  /**
   * 开始新游戏
   */
  async startNewGame(this: any) {
    // 确保班级数据已加载
    if (!this.allClassData || Object.keys(this.allClassData).length === 0) {
      await this.loadClassData()
    }

    this.currentRunId = Date.now().toString(36)
    this.currentFloor = 0
    
    // 使用初始状态重置玩家
    const initialPlayer = createInitialPlayerState()
    // 保留玩家设置的名字和头像
    const preservedName = this.player.name
    const preservedAvatar = this.player.avatar
    const preservedFeature = this.player.characterFeature
    
    Object.assign(this.player, initialPlayer)
    this.player.name = preservedName
    this.player.avatar = preservedAvatar
    this.player.characterFeature = preservedFeature
    
    // 重置全局状态
    this.npcs = []
    this.npcRelationships = {}
    this.clubApplication = null
    this.clubRejection = null
    this.mapSelectionMode = false
    this.mapSelectionCallback = null

    // 重新初始化所有班级的 NPC，确保地图上能显示所有角色
    this.initializeAllClassNpcs()

    // 重置时间和世界状态
    this.gameTime = createInitialGameTime()
    this.eventChecks = {
      lastDaily: '', lastWeekly: '', lastMonthly: ''
    }
    this.worldState = createInitialWorldState()

    // 初始化默认 NPC 关系
    await this.initializeNpcRelationships()

    this.saveToStorage(true)
    
    try {
      await syncClubWorldbookState(this.currentRunId)
      
      await switchSaveSlot()
      await switchForumSlot(this.currentRunId)
      await switchPartTimeSaveSlot()
      await switchImpressionSlot()
      
      await saveSocialRelationshipOverview()
      await saveImpressionData(this.currentRunId)
    } catch (e) {
      console.error('[GameStore] Error initializing worldbook for new game:', e)
    }
  }
}
