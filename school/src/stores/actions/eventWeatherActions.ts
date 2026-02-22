/**
 * 事件与天气系统相关 Actions
 */

import type { ActiveEvent } from '../gameStoreTypes'
import {
  loadEventLibraryFromWorldbook,
  loadEventTriggersFromWorldbook,
  checkDailyTriggers,
  checkWeeklyTriggers,
  checkMonthlyTriggers,
  checkVariableTriggers,
  checkCompositeTriggers,
  activateEvent,
  updateActiveEvents,
  markEventInvolved as markEventInvolvedFn,
  calculateTotalDays
} from '../../utils/eventSystem'
import {
  generateWeatherForecast,
  getCurrentWeatherAtHour,
  detectWeatherChange
} from '../../utils/weatherGenerator'

export const eventWeatherActions = {
  // ==================== 事件系统相关 ====================

  /**
   * 加载事件系统数据（从世界书）
   */
  async loadEventData(this: any) {
    console.log('[GameStore] Loading event data...')
    
    const library = await loadEventLibraryFromWorldbook()
    const triggers = await loadEventTriggersFromWorldbook()
    
    if (library) {
      this.eventLibrary = library
    } else {
      console.warn('[GameStore] Failed to load event library')
      this.eventLibrary = new Map()
    }

    if (triggers) {
      this.eventTriggers = triggers
    } else {
      console.warn('[GameStore] Failed to load event triggers')
      this.eventTriggers = []
    }
    
    console.log(`[GameStore] Loaded ${this.eventLibrary.size} events and ${this.eventTriggers.length} triggers`)
  },

  /**
   * 检查并处理事件触发（每次时间推进后调用）
   */
  checkEventTriggers(this: any) {
    if (this.eventLibrary.size === 0 || this.eventTriggers.length === 0) {
      return
    }
    
    const { year, month, day } = this.gameTime
    const currentDateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const termInfo = this.getTermInfo() as any
    const currentWeekKey = `${year}-W${termInfo?.weekNumber || 1}`
    const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`
    
    const allTriggered: any[] = []
    
    // 1. 检查每日触发器
    if (this.eventChecks.lastDaily !== currentDateKey) {
      const dailyTriggered = checkDailyTriggers(this, this.eventTriggers, this.eventLibrary)
      allTriggered.push(...dailyTriggered)
      this.eventChecks.lastDaily = currentDateKey
    }
    
    // 2. 检查每周触发器（周一检查）
    if (this.gameTime.weekday === 'Monday' && this.eventChecks.lastWeekly !== currentWeekKey) {
      const weeklyTriggered = checkWeeklyTriggers(this, this.eventTriggers, this.eventLibrary)
      for (const triggered of weeklyTriggered) {
        this.player.scheduledEvents.push({
          eventId: triggered.event.id,
          scheduledDate: triggered.scheduledDate,
          event: triggered.event
        })
      }
      this.eventChecks.lastWeekly = currentWeekKey
    }
    
    // 3. 检查每月触发器（1日检查）
    if (day === 1 && this.eventChecks.lastMonthly !== currentMonthKey) {
      const monthlyTriggered = checkMonthlyTriggers(this, this.eventTriggers, this.eventLibrary)
      for (const triggered of monthlyTriggered) {
        this.player.scheduledEvents.push({
          eventId: triggered.event.id,
          scheduledDate: triggered.scheduledDate,
          event: triggered.event
        })
      }
      
      // 处理天赋 [t7] 天生财运
      if (this.player.talents.includes('t7')) {
        const bonusMoney = Math.floor(Math.random() * (50000 - 20000 + 1)) + 20000
        this.player.money += bonusMoney
        this.addCommand(`[天赋生效] 天生财运让你这个月获得了 ${bonusMoney} 日元的额外零花钱！`)
      }

      // 教师月薪发放
      if (this.player.role === 'teacher') {
        const teacherSalary = 500000
        this.player.money += teacherSalary
        this.addCommand(`[工资发放] 本月教师工资 ${teacherSalary.toLocaleString()} 日元已到账！`)
      }

      this.eventChecks.lastMonthly = currentMonthKey
    }
    
    // 4. 检查变量触发器
    const variableTriggered = checkVariableTriggers(this, this.eventTriggers, this.eventLibrary)
    allTriggered.push(...variableTriggered)
    
    // 5. 检查复合触发器
    const compositeTriggered = checkCompositeTriggers(this, this.eventTriggers, this.eventLibrary)
    allTriggered.push(...compositeTriggered)
    
    // 6. 检查预定事件是否到期
    const todayScheduled = this.player.scheduledEvents.filter((se: any) => 
      se.scheduledDate.year === year &&
      se.scheduledDate.month === month &&
      se.scheduledDate.day === day
    )
    for (const scheduled of todayScheduled) {
      allTriggered.push({ event: scheduled.event })
      const idx = this.player.scheduledEvents.indexOf(scheduled)
      if (idx > -1) {
        this.player.scheduledEvents.splice(idx, 1)
      }
    }
    
    // 7. 激活所有触发的事件
    for (const triggered of allTriggered) {
      activateEvent(this, triggered.event)
    }
  },

  /**
   * 更新活动事件状态
   */
  updateEvents(this: any) {
    updateActiveEvents(this)
  },

  /**
   * 标记玩家卷入事件
   */
  markEventInvolved(this: any, eventId: string) {
    markEventInvolvedFn(this, eventId)
  },

  /**
   * 获取当前活动事件的第一个（用于UI横幅显示）
   */
  getCurrentEventBanner(this: any): ActiveEvent | null {
    const events = this.getActiveEventsForBanner()
    return events.length > 0 ? events[0] : null
  },

  /**
   * 获取所有活动事件用于轮播
   */
  getActiveEventsForBanner(this: any): Array<ActiveEvent & { remainingDays: number }> {
    if (this.player.activeEvents.length === 0) return []
    
    const currentDay = calculateTotalDays(this.gameTime)
    
    const sortedEvents = [...this.player.activeEvents].sort((a: ActiveEvent, b: ActiveEvent) => {
      if (a.isGhost === b.isGhost) return 0
      return a.isGhost ? 1 : -1
    })

    return sortedEvents.map((event: ActiveEvent) => {
      let remainingDays = 0
      if (!event.isGhost) {
         remainingDays = event.duration - (currentDay - event.startDay)
      }
      return {
        ...event,
        remainingDays
      }
    })
  },

  /**
   * 检查是否有活动事件
   */
  hasActiveEvents(this: any): boolean {
    return this.player.activeEvents.length > 0
  },

  /**
   * 获取活动事件数量
   */
  getActiveEventCount(this: any): number {
    return this.player.activeEvents.length
  },

  // ==================== 天气系统相关 ====================

  /**
   * 初始化/更新天气预报
   */
  updateWeatherForecast(this: any) {
    const { year, month, day } = this.gameTime
    const currentDateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    if (this.worldState.weather.lastUpdateDate !== currentDateKey) {
      console.log('[GameStore] Updating weather forecast for:', currentDateKey)
      
      let previousWeather = null
      let lastWeatherOfPreviousDay = null
      
      if (this.worldState.weather.forecast.length > 0) {
        const todayInForecast = this.worldState.weather.forecast.find((f: any) => 
          f.year === year && f.month === month && f.day === day
        )
        if (todayInForecast) {
          previousWeather = todayInForecast.weather
        }

        const yesterdayDate = new Date(year, month - 1, day - 1)
        const yYear = yesterdayDate.getFullYear()
        const yMonth = yesterdayDate.getMonth() + 1
        const yDay = yesterdayDate.getDate()

        const yesterdayForecast = this.worldState.weather.forecast.find((f: any) => 
           f.year === yYear && f.month === yMonth && f.day === yDay
        )

        if (yesterdayForecast) {
           if (yesterdayForecast.hourly && yesterdayForecast.hourly.length > 0) {
             lastWeatherOfPreviousDay = yesterdayForecast.hourly[yesterdayForecast.hourly.length - 1].weather
           } else {
             lastWeatherOfPreviousDay = yesterdayForecast.weather
           }
        }
      }

      // fallback：存档恢复等场景下 forecast 中无昨天数据，用当前天气保持连续性
      if (!lastWeatherOfPreviousDay && !previousWeather) {
        lastWeatherOfPreviousDay = this.worldState.weather.current?.weather || null
      }

      const weatherData = generateWeatherForecast(year, month, day, previousWeather as any, lastWeatherOfPreviousDay as any) as any
      
      this.worldState.weather = {
        current: weatherData.current,
        forecast: weatherData.forecast,
        lastUpdateDate: currentDateKey,
        season: weatherData.season,
        previousHour: this.gameTime.hour,
        lastChangeInfo: null
      }
      
      console.log('[GameStore] Weather updated:', this.worldState.weather.current.weatherName)
    }
  },

  /**
   * 更新当前时刻的天气（基于每两小时预报）
   */
  updateCurrentWeather(this: any) {
    const { hour } = this.gameTime
    const weatherData = this.worldState.weather
    
    if (!weatherData.forecast || weatherData.forecast.length === 0) {
      return
    }
    
    const currentWeatherInfo = getCurrentWeatherAtHour(weatherData, hour) as any
    if (currentWeatherInfo) {
      this.worldState.weather.current = {
        weather: currentWeatherInfo.weather,
        weatherName: currentWeatherInfo.weatherName,
        icon: currentWeatherInfo.icon,
        temperature: currentWeatherInfo.temp,
        tempHigh: weatherData.forecast[0].tempHigh,
        tempLow: weatherData.forecast[0].tempLow
      }
    }
  },

  /**
   * 检测并返回天气变化信息（用于生成提示词）
   */
  checkWeatherChange(this: any) {
    const { hour } = this.gameTime
    const previousHour = this.worldState.weather.previousHour
    
    if (previousHour === hour) {
      return
    }
    
    const changeInfo = detectWeatherChange(this.worldState.weather, previousHour, hour)
    
    this.worldState.weather.previousHour = hour
    
    if (changeInfo) {
      this.worldState.weather.lastChangeInfo = changeInfo
    } else {
      this.worldState.weather.lastChangeInfo = null
    }
  },

  /**
   * 获取天气预报数据（供组件使用）
   */
  getWeatherData(this: any) {
    return this.worldState.weather
  },

  /**
   * 获取当前天气描述（用于提示词）
   */
  getCurrentWeatherDescription(this: any): string {
    const weather = this.worldState.weather.current as any
    return `${weather.icon} ${weather.weatherName}，气温${weather.temperature}°C`
  }
}
