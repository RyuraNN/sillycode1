/**
 * 时间系统相关 Actions
 */

import { getTermInfo } from '../../utils/scheduleGenerator'
import { updateAllNpcLocations, initializeScheduleSystem } from '../../utils/npcScheduleSystem'

// 时间推进锁，防止递归调用
let _isAdvancingTime = false

export const timeActions = {
  /**
   * 推进时间 (minutes)
   */
  advanceTime(this: any, minutes: number) {
    // 防止递归调用（事件处理中可能再次触发时间推进）
    if (_isAdvancingTime) {
      console.warn('[GameStore] advanceTime called recursively, skipping')
      return
    }
    _isAdvancingTime = true

    try {
      const previousDay = this.world.gameTime.day
      const previousWeekNumber = this.getWeekNumber?.() ?? 0

      const currentDate = new Date(
        this.world.gameTime.year,
        this.world.gameTime.month - 1,
        this.world.gameTime.day,
        this.world.gameTime.hour,
        this.world.gameTime.minute
      )

      currentDate.setMinutes(currentDate.getMinutes() + minutes)

      this.world.gameTime.year = currentDate.getFullYear()
      this.world.gameTime.month = currentDate.getMonth() + 1
      this.world.gameTime.day = currentDate.getDate()
      this.world.gameTime.hour = currentDate.getHours()
      this.world.gameTime.minute = currentDate.getMinutes()

      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      this.world.gameTime.weekday = weekdays[currentDate.getDay()]

      console.log(`[GameStore] Time advanced by ${minutes}m -> ${this.world.gameTime.year}-${this.world.gameTime.month}-${this.world.gameTime.day} ${this.world.gameTime.hour}:${this.world.gameTime.minute} (${this.world.gameTime.weekday})`)

      this.updateWeatherForecast()
      this.updateCurrentWeather()
      this.checkWeatherChange()

      this.checkEventTriggers()
      this.updateEvents()

      // 检查学年进级
      if (this.checkYearProgression) {
        this.checkYearProgression()
      }

      // 日期变化时：学业成长 + 考试检查
      if (this.world.gameTime.day !== previousDay) {
        if (this.updateDailyAcademicGrowth) {
          this.updateDailyAcademicGrowth()
        }
        if (this.checkExamTrigger) {
          const examSchedule = this.checkExamTrigger()
          if (examSchedule && this.conductExam) {
            const record = this.conductExam(examSchedule.type)
            if (record) {
              this.addCommand(`[系统] ${examSchedule.label}已结束，成绩已生成。`)
            }
          }
        }

        // 周报系统：假期中跳过
        const termInfo = this.getTermInfo?.()
        const isVacationNow = termInfo?.isVacation === true

        // 周数变化时：重新生成课表
        const currentWeekNumber = this.getWeekNumber?.() ?? 0
        if (currentWeekNumber !== previousWeekNumber && this.regenerateSchedules) {
          console.log(`[TimeActions] Week changed: ${previousWeekNumber} → ${currentWeekNumber}, regenerating schedules`)
          this.regenerateSchedules()
        }

        if (!isVacationNow) {
          // 周一：存快照
          if (this.world.gameTime.weekday === 'Monday' && this.saveWeeklySnapshot) {
            this.saveWeeklySnapshot()
          }
          // 检测周五→周六（上学周结束）：生成周报
          const prevDate = new Date(this.world.gameTime.year, this.world.gameTime.month - 1, previousDay)
          const prevWeekday = weekdays[prevDate.getDay()]
          if (prevWeekday === 'Friday' && this.generateWeeklyPreview) {
            this.generateWeeklyPreview()
          }
        }

        // 新增：为前一天生成日记（异步，不阻塞时间推进）
        const prevDateForDiary = new Date(this.world.gameTime.year, this.world.gameTime.month - 1, previousDay)
        const prevDateStr = `${prevDateForDiary.getFullYear()}-${String(prevDateForDiary.getMonth()+1).padStart(2,'0')}-${String(prevDateForDiary.getDate()).padStart(2,'0')}`
        import('../../utils/summaryManager').then(({ generateDiary }) => {
          generateDiary(prevDateStr).catch((e: unknown) => {
            console.error('[TimeActions] Failed to generate diary:', e)
          })
        })
      }

      // 更新NPC位置（每小时更新一次，内部有缓存机制）
      this.updateNpcLocations()

      let delivered: any[] = []
      try {
        delivered = this.checkDeliveries() || []
      } catch (e) {
        console.error('[GameStore] Error checking deliveries:', e)
      }
      if (delivered.length > 0) {
        delivered.forEach((order: any) => {
          const itemNames = order.items.map((i: any) => i.productName).join(', ')
          this.addCommand(`[系统] 外卖已送达: ${itemNames}`)
        })
      }
    } finally {
      _isAdvancingTime = false
    }
  },

  /**
   * 获取当前学期信息
   */
  getTermInfo(this: any) {
    const { year, month, day } = this.world.gameTime
    return getTermInfo(year, month, day)
  },

  /**
   * 获取当前周数
   */
  getWeekNumber(this: any) {
    const info = this.getTermInfo() as any
    return info.weekNumber
  },

  /**
   * 开始地图选择
   */
  startMapSelection(this: any, callback: (location: string) => void) {
    this._ui.mapSelectionMode = true
    this._ui.mapSelectionCallback = callback
  },

  /**
   * 完成地图选择
   */
  finishMapSelection(this: any, location: string) {
    if (this._ui.mapSelectionCallback) {
      this._ui.mapSelectionCallback(location)
    }
    this._ui.mapSelectionMode = false
    this._ui.mapSelectionCallback = null
  },

  /**
   * 更新所有NPC的位置
   * 内部有缓存机制，同一小时内不会重复计算
   */
  updateNpcLocations(this: any, force: boolean = false) {
    try {
      updateAllNpcLocations(this, force)
    } catch (e) {
      console.error('[GameStore] Error updating NPC locations:', e)
    }
  },

  /**
   * 初始化NPC日程系统
   */
  async initNpcScheduleSystem(this: any) {
    try {
      await initializeScheduleSystem(this)
    } catch (e) {
      console.error('[GameStore] Error initializing NPC schedule system:', e)
    }
  }
}
