/**
 * 社交系统相关 Actions
 */

import type { Moment, ChatLogEntry } from '../gameStoreTypes'

export const socialActions = {
  // ==================== 社交状态管理 ====================

  /**
   * 更新社交状态（未读数、最后消息等）
   */
  updateSocialStatus(this: any, id: string, type: 'friend' | 'group', updates: any) {
    const list = type === 'friend' ? this.player.social.friends : this.player.social.groups
    const item = list.find((i: any) => i.id === id)
    if (item) {
      Object.assign(item, updates)
    }
  },

  // ==================== 朋友圈相关 ====================

  /**
   * 添加朋友圈动态
   */
  addMoment(this: any, moment: Moment) {
    if (!this.player.social.moments) this.player.social.moments = []
    this.player.social.moments.unshift(moment)
  },
  
  /**
   * 给朋友圈点赞
   */
  addMomentLike(this: any, momentId: string, userId: string, userName: string) {
    const moment = this.getMoment(momentId)
    if (moment) {
      if (!moment.likes) moment.likes = []
      if (!moment.likes.some((l: any) => l.userId === userId)) {
        moment.likes.push({ userId, name: userName })
      }
    }
  },

  /**
   * 取消朋友圈点赞
   */
  removeMomentLike(this: any, momentId: string, userId: string) {
    const moment = this.getMoment(momentId)
    if (moment && moment.likes) {
      moment.likes = moment.likes.filter((l: any) => l.userId !== userId)
    }
  },
  
  /**
   * 添加朋友圈评论
   */
  addMomentComment(this: any, momentId: string, comment: any) {
    const moment = this.getMoment(momentId)
    if (moment) {
      if (!moment.comments) moment.comments = []
      moment.comments.push(comment)
    }
  },
  
  /**
   * 获取朋友圈动态
   */
  getMoment(this: any, momentId: string) {
    return this.player.social.moments?.find((m: Moment) => m.id === momentId)
  },
  
  /**
   * 获取所有好友名字
   */
  getAllFriendNames(this: any) {
    return this.player.social.friends.map((f: any) => f.name)
  },
  
  /**
   * 检查某个用户是否是好友
   */
  isFriend(this: any, userId: string): boolean {
    return this.player.social.friends.some((f: any) => f.id === userId)
  },

  // ==================== 聊天记录管理 ====================

  /**
   * 设置待恢复的聊天记录
   */
  setPendingRestoreLog(this: any, log: ChatLogEntry[]) {
    this.pendingRestoreLog = JSON.parse(JSON.stringify(log))
  },

  /**
   * 更新当前聊天记录（同步）
   */
  syncCurrentChatLog(this: any, log: ChatLogEntry[]) {
    this.currentChatLog = log
  },

  /**
   * 清除待恢复的聊天记录
   */
  clearPendingRestoreLog(this: any) {
    this.pendingRestoreLog = null
  },

  /**
   * 清理过期的快照（保留最近 N 条）
   */
  cleanupSnapshots(this: any, chatLog: ChatLogEntry[]) {
    if (!chatLog || chatLog.length === 0) return
    
    const limit = this.settings.snapshotLimit || 10
    const thresholdIndex = Math.max(0, chatLog.length - limit)
    
    let cleanedCount = 0
    for (let i = 0; i < thresholdIndex; i++) {
      const log = chatLog[i]
      if (log.snapshot || log.preVariableSnapshot) {
        if (log.snapshot) {
           delete log.snapshot
           cleanedCount++
        }
        if (log.preVariableSnapshot) {
           delete log.preVariableSnapshot
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[GameStore] Cleaned up ${cleanedCount} old snapshots (limit: ${limit})`)
    }
  },

  // ==================== 日历事件管理 ====================

  /**
   * 添加自定义日历事件
   */
  addCalendarEvent(this: any, event: any) {
    this.player.customCalendarEvents.push({
      id: Date.now().toString(),
      createdAt: Date.now(),
      ...event
    })
  },

  /**
   * 移除自定义日历事件
   */
  removeCalendarEvent(this: any, eventId: string) {
    const index = this.player.customCalendarEvents.findIndex((e: any) => e.id === eventId)
    if (index > -1) {
      this.player.customCalendarEvents.splice(index, 1)
    }
  },

  /**
   * 获取指定日期的自定义事件
   */
  getCustomEventsForDate(this: any, year: number, month: number, day: number) {
    const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const shortDate = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    return this.player.customCalendarEvents.filter((event: any) => {
      if (event.date === fullDate) return true
      if (event.isRecurring && event.date === shortDate) return true
      if (event.date === shortDate && !event.isRecurring) {
        return true
      }
      return false
    })
  }
}
