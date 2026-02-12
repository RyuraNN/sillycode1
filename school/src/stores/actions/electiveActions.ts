/**
 * 选修课相关 Actions
 */

import { getCourseById, autoSelectElectives } from '../../data/coursePoolData'
import { updateElectiveWorldbookEntries } from '../../utils/electiveWorldbook'
import { getRandomLocation } from '../../utils/scheduleGenerator'
import { seededRandom } from '../../utils/random'

export const electiveActions = {
  /**
   * 处理NPC选课并更新世界书
   */
  async processNpcElectiveSelection(this: any) {
    console.log('[GameStore] Processing NPC elective selection...')
    
    const npcSelections: Record<string, string[]> = {}
    const rng = seededRandom(this.currentRunId.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0))

    // 1. 优先处理全校学生数据 (从 allClassData)
    if (this.allClassData) {
      for (const [classId, classInfo] of Object.entries(this.allClassData)) {
        // @ts-ignore
        if (classInfo.students && Array.isArray(classInfo.students)) {
          // @ts-ignore
          for (const student of classInfo.students) {
            if (student.name === this.player.name) continue
            
            // @ts-ignore
            const preference = student.electivePreference || 'general'
            // @ts-ignore
            const selections = autoSelectElectives(classId, preference, 3, rng)
            npcSelections[student.name] = selections
          }
        }
      }
    }

    // 2. 补充处理 this.npcs (可能包含不在班级名册中的特殊NPC)
    for (const npc of this.npcs) {
      if (npc.role === 'teacher') continue
      
      if (npcSelections[npc.name]) continue

      if (npc.location && npc.location.match(/^\d-[A-Z]/)) {
         // @ts-ignore
         const selections = autoSelectElectives(npc.location, 'general', 3, rng)
         npcSelections[npc.name] = selections
      }
    }

    // @ts-ignore
    await updateElectiveWorldbookEntries(this.currentRunId, this.player.selectedElectives, npcSelections, this.player.schedule)
  },

  /**
   * 生成选修课课表
   * 【修复】使用 seeded random 确保相同存档+选课组合始终生成相同课表
   * 这样回溯/重载后课表不会变化
   */
  generateElectiveSchedule(this: any) {
    if (!this.player.schedule) return
    if (!this.player.selectedElectives || this.player.selectedElectives.length === 0) return

    const courseDetails = this.player.selectedElectives
      .map((id: string) => getCourseById(id))
      .filter((c: any) => c !== null)

    if (courseDetails.length === 0) return

    // 使用确定性种子：runId + 选课ID排序后的组合
    const sortedElectives = [...this.player.selectedElectives].sort().join('_')
    const seedStr = `${this.currentRunId}_elective_schedule_${sortedElectives}`
    let hash = 0
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i)
      hash |= 0
    }
    const rng = seededRandom(Math.abs(hash))

    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const slotsToFill: { day: string, index: number }[] = []
    
    weekdays.forEach(day => {
      if (this.player.schedule[day]) {
        this.player.schedule[day].forEach((slot: any, index: number) => {
          if (slot.period >= 5 && slot.isEmpty) {
            slotsToFill.push({ day, index })
          }
        })
      }
    })

    // 使用 seeded random 洗牌
    const shuffledSlots = slotsToFill.sort(() => rng() - 0.5)
    
    const assignments: any[] = []
    
    // 1. 每门课至少排1次
    courseDetails.forEach((course: any) => {
      assignments.push(course)
    })
    
    // 2. 每门课随机增加第2次 (65%概率)，使用确定性随机
    courseDetails.forEach((course: any) => {
      if (assignments.length < shuffledSlots.length && rng() < 0.65) {
        assignments.push(course)
      }
    })
    
    // 3. 填充插槽
    for (let i = 0; i < assignments.length && i < shuffledSlots.length; i++) {
      this._fillElectiveSlot(shuffledSlots[i], assignments[i])
    }
    
    // 清理未使用的选修课插槽
    for (let i = assignments.length; i < shuffledSlots.length; i++) {
      this._clearElectiveSlot(shuffledSlots[i])
    }
    
    console.log('[GameStore] Elective schedule generated (deterministic)')
    this.saveToStorage()
  },

  /**
   * 填充选修课插槽
   */
  _fillElectiveSlot(this: any, slotInfo: { day: string, index: number }, course: any) {
    const { day, index } = slotInfo
    const location = getRandomLocation(course.name, this.player.classId) as any
    
    const slot = this.player.schedule[day][index]
    slot.subject = course.name
    slot.teacher = course.teacher
    slot.location = location.locationName
    slot.locationId = location.locationId
    slot.isEmpty = false
    slot.isElective = true
    slot.courseId = course.id
  },

  /**
   * 清空选修课插槽
   */
  _clearElectiveSlot(this: any, slotInfo: { day: string, index: number }) {
    const { day, index } = slotInfo
    const slot = this.player.schedule[day][index]
    slot.subject = null
    slot.teacher = null
    slot.location = null
    slot.locationId = null
    slot.isEmpty = true
    slot.isElective = true
    slot.courseId = null
  }
}
