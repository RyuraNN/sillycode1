/**
 * 班级与社团相关 Actions
 */

import type { ClubData, Group, NpcStats } from '../gameStoreTypes'
import { fetchClassDataFromWorldbook, fetchClubDataFromWorldbook, addPlayerToClubInWorldbook, removePlayerFromClubInWorldbook, syncClubWorldbookState, setPlayerClass, setVariableParsingWorldbookStatus } from '../../utils/worldbookParser'
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
  },

  /**
   * 加载社团数据
   */
  async loadClubData(this: any) {
    console.log('[GameStore] Loading club data...')
    const clubData = await fetchClubDataFromWorldbook()
    if (clubData) {
      console.log('[GameStore] Loaded club data from Worldbook', clubData)
      this.allClubs = clubData as Record<string, ClubData>
    } else {
      console.warn('[GameStore] Failed to load club data from Worldbook')
      this.allClubs = {}
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
   * 同步世界书状态（用于回溯后）
   */
  async syncWorldbook(this: any) {
    console.log('[GameStore] Syncing worldbook after rollback...')
    
    await restoreWorldbookFromStore()
    await saveForumToWorldbook(this.player.forum.posts, this.currentRunId, this.settings.forumWorldbookLimit)
    await saveSocialRelationshipOverview()
    
    console.log('[GameStore] Worldbook sync complete')
  },

  /**
   * 重建世界书状态（用于存档导入/恢复）
   */
  async rebuildWorldbookState(this: any) {
    console.log('[GameStore] Rebuilding worldbook state for run:', this.currentRunId)
    
    await this.loadClubData()
    
    if (this.player.classId) {
      await setPlayerClass(this.player.classId)
    }

    const joinedClubsSet = new Set(this.player.joinedClubs)
    
    for (const [clubId, club] of Object.entries(this.allClubs)) {
      if (joinedClubsSet.has(clubId)) {
        await addPlayerToClubInWorldbook(clubId, this.player.name, club as ClubData, this.currentRunId)
      } else {
        await removePlayerFromClubInWorldbook(clubId, this.player.name, club as ClubData, this.currentRunId)
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
