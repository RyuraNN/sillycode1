/**
 * 班级与社团相关 Actions
 */

import type { ClubData, Group, NpcStats } from '../gameStoreTypes'
import { fetchClassDataFromWorldbook, fetchClubDataFromWorldbook, addPlayerToClubInWorldbook, removePlayerFromClubInWorldbook, syncClubWorldbookState, setPlayerClass, setVariableParsingWorldbookStatus, addNpcToClubInWorldbook, createClubInWorldbook, ensureClubExistsInWorldbook } from '../../utils/worldbookParser'
import { DEFAULT_FORUM_POSTS, saveForumToWorldbook, switchForumSlot } from '../../utils/forumWorldbook'
import { saveSocialData, switchSaveSlot, saveSocialRelationshipOverview, restoreWorldbookFromStore } from '../../utils/socialWorldbook'
import { switchPartTimeSaveSlot, restorePartTimeWorldbookFromStore } from '../../utils/partTimeWorldbook'
import { saveImpressionData, switchImpressionSlot, restoreImpressionWorldbookFromStore } from '../../utils/impressionWorldbook'
import { generateWeeklySchedule } from '../../utils/scheduleGenerator'
import { generateCharId } from '../../data/relationshipData'
import { createInitialPlayerState, createInitialGameTime, createInitialWorldState } from '../gameStoreState'

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
   */
  async loadClubData(this: any) {
    console.log('[GameStore] Loading club data for run:', this.currentRunId)
    
    // 保存玩家创建的社团（ID 以 player_club_ 开头）
    const playerCreatedClubs: Record<string, ClubData> = {}
    if (this.allClubs) {
      for (const [clubId, club] of Object.entries(this.allClubs)) {
        if (clubId.startsWith('player_club_')) {
          playerCreatedClubs[clubId] = club as ClubData
        }
      }
    }
    
    // 传入 currentRunId 确保只加载当前存档的社团数据
    const clubData = await fetchClubDataFromWorldbook(this.currentRunId)
    if (clubData) {
      console.log('[GameStore] Loaded club data from Worldbook', clubData)
      // 合并世界书数据与玩家创建的社团
      // 注意：如果世界书中已包含玩家社团，它们将在 clubData 中
      this.allClubs = {
        ...playerCreatedClubs,
        ...(clubData as Record<string, ClubData>)
      }
    } else {
      console.warn('[GameStore] Failed to load club data from Worldbook')
      // 保留玩家创建的社团
      this.allClubs = playerCreatedClubs
    }

    // 确保系统社团（学生会）存在
    await this.ensureSystemClubs()
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
    
    const classInfo = this.allClassData[classId]
    if (classInfo) {
      this.player.classRoster = classInfo
      const weekNumber = this.getWeekNumber()
      this.player.schedule = generateWeeklySchedule(classId, classInfo, weekNumber)
      console.log('[GameStore] Generated schedule for class:', classId, this.player.schedule)

      await this.joinClassGroup(classId, classInfo)
      
      this.saveToStorage()
    }
  },

  /**
   * 自动加入班级群
   */
  async joinClassGroup(this: any, classId: string, classInfo: any) {
    const groupId = `group_${classId}`
    
    this.player.social.groups = this.player.social.groups.filter((g: Group) => !g.id.startsWith('group_'))
    
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
   */
  async handleClubInviteAccepted(this: any, clubId: string, name: string) {
    const club = this.allClubs[clubId]
    if (!club) {
      console.warn(`[GameStore] Club ${clubId} not found`)
      return
    }

    // 更新社团成员列表
    if (!club.members) club.members = []
    if (!club.members.includes(name)) {
      club.members.push(name)
    }

    // 区分玩家和 NPC
    if (name === this.player.name) {
      // 如果是玩家被邀请
      if (!this.player.joinedClubs.includes(clubId)) {
        this.player.joinedClubs.push(clubId)
      }
      await addPlayerToClubInWorldbook(clubId, name, club, this.currentRunId)
      this.addCommand(`[系统提示] 你接受了邀请，加入了${club.name}`)
    } else {
      // 如果是 NPC
      await addNpcToClubInWorldbook(clubId, name, club, this.currentRunId)
      this.addCommand(`[系统提示] ${name}接受了邀请，加入了${club.name}`)
    }

    // 清除邀请状态 (如果是玩家发起的邀请)
    if (this.clubInvitation && this.clubInvitation.clubId === clubId && this.clubInvitation.targetName === name) {
      this.clubInvitation = null
    }

    console.log(`[GameStore] ${name} joined club ${club.name}`)
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
   */
  async createClub(this: any, clubInfo: { name: string; description: string; coreSkill?: string; activityDay?: string; location?: string; advisor?: string }) {
    // 生成社团 ID
    const clubId = `player_club_${Date.now().toString(36)}`

    const fullClubInfo = {
      id: clubId,
      name: clubInfo.name,
      description: clubInfo.description,
      coreSkill: clubInfo.coreSkill || '',
      activityDay: clubInfo.activityDay || '',
      location: clubInfo.location || '',
      advisor: clubInfo.advisor || '',
      president: this.player.name, // 玩家是部长
      members: [this.player.name] // 确保玩家在成员列表中
    }

    // 创建世界书条目
    const club = await createClubInWorldbook(fullClubInfo, this.currentRunId)

    if (!club) {
      return { success: false, message: '创建社团失败' }
    }

    // 添加到 allClubs
    this.allClubs[clubId] = club

    // 玩家加入社团
    if (!this.player.joinedClubs.includes(clubId)) {
      this.player.joinedClubs.push(clubId)
    }

    this.addCommand(`[系统提示] 你成功创建了社团"${clubInfo.name}"并成为部长`)

    this.saveToStorage()

    return { success: true, message: `社团"${clubInfo.name}"创建成功！`, clubId: clubId }
  },

  /**
   * 同步世界书状态（用于回溯后）
   */
  async syncWorldbook(this: any) {
    console.log('[GameStore] Syncing worldbook after rollback...')
    
    // 同步社团状态
    await syncClubWorldbookState(this.currentRunId)
    
    // 同步班级状态
    if (this.player.classId) {
      await setPlayerClass(this.player.classId)
    }
    
    // 同步选修课状态
    try {
      const { syncElectiveWorldbookState } = await import('../../utils/electiveWorldbook.js')
      await syncElectiveWorldbookState(this.currentRunId)
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
   */
  async rebuildWorldbookState(this: any) {
    console.log('[GameStore] Rebuilding worldbook state for run:', this.currentRunId)

    // 确保班级数据已加载（因为 setPlayerClass 和关系系统都依赖它）
    await this.loadClassData()
    
    // 在重新加载前，确保内存中的玩家社团数据被保留（如果需要）
    // loadClubData 会尝试保留 playerCreatedClubs，但这依赖于 allClubs 此时有数据
    await this.loadClubData()
    
    if (this.player.classId) {
      await setPlayerClass(this.player.classId)
    }

    const joinedClubsSet = new Set(this.player.joinedClubs)
    
    for (const [clubId, club] of Object.entries(this.allClubs)) {
      // 检查并在必要时重建缺失的社团条目（特别是玩家创建的社团）
      // 如果是在新环境中导入，世界书里可能根本没有这些条目
      const clubData = club as ClubData
      await ensureClubExistsInWorldbook(clubData, this.currentRunId)

      if (joinedClubsSet.has(clubId)) {
        await addPlayerToClubInWorldbook(clubId, this.player.name, clubData, this.currentRunId)
      } else {
        await removePlayerFromClubInWorldbook(clubId, this.player.name, clubData, this.currentRunId)
      }
    }

    await syncClubWorldbookState(this.currentRunId)
    
    const { syncElectiveWorldbookState } = await import('../../utils/electiveWorldbook.js')
    await syncElectiveWorldbookState(this.currentRunId)

    if (this.player.selectedElectives && this.player.selectedElectives.length > 0) {
      await this.processNpcElectiveSelection()
    } else {
      const { clearElectiveEntries } = await import('../../utils/electiveWorldbook.js')
      await clearElectiveEntries(this.currentRunId)
    }
    
    await restoreWorldbookFromStore()
    await saveSocialRelationshipOverview()
    await switchSaveSlot()
    
    await saveForumToWorldbook(this.player.forum.posts, this.currentRunId, this.settings.forumWorldbookLimit)
    await switchForumSlot(this.currentRunId)
    
    await restorePartTimeWorldbookFromStore()
    await restoreImpressionWorldbookFromStore()

    await setVariableParsingWorldbookStatus(!this.settings.assistantAI.enabled)
    
    await this.loadEventData()

    console.log('[GameStore] Worldbook state rebuild complete')
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
    this.initializeNpcRelationships()

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
