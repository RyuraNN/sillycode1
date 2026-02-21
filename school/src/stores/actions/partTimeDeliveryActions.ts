/**
 * 兼职与外卖系统相关 Actions
 */

import type { Item, PendingDelivery } from '../gameStoreTypes'
import { getItemType } from '../../utils/deliveryWorldbook'

export const partTimeDeliveryActions = {
  // ==================== 外卖订单系统 ====================

  /**
   * 添加待送达订单
   */
  addPendingDelivery(this: any, order: PendingDelivery) {
    this.player.pendingDeliveries.push(order)
  },

  /**
   * 检查外卖并发送通知（用于游戏启动、存档恢复等场景）
   */
  checkAndNotifyDeliveries(this: any) {
    const delivered = this.checkDeliveries()
    if (delivered && delivered.length > 0) {
      delivered.forEach((order: PendingDelivery) => {
        const itemNames = order.items.map((i: any) => i.productName).join(', ')
        this.addCommand(`[系统] 外卖已送达: ${itemNames}`)
      })
      console.log(`[GameStore] ${delivered.length} delivery order(s) completed on startup/restore`)
    }
  },

  /**
   * 检查订单是否送达（每次时间推进后调用）
   */
  checkDeliveries(this: any) {
    const { year, month, day, hour } = this.gameTime
    const deliveredOrders: PendingDelivery[] = []
    const currentTime = new Date(year, month - 1, day, hour, 0)

    for (let i = this.player.pendingDeliveries.length - 1; i >= 0; i--) {
      const order = this.player.pendingDeliveries[i]
      if (order.status === 'pending') {
        let deliveryDate: Date

        if (order.deliveryTime.year != null && order.deliveryTime.month != null) {
          // 新格式：完整绝对时间
          deliveryDate = new Date(
            order.deliveryTime.year, order.deliveryTime.month - 1,
            order.deliveryTime.day, order.deliveryTime.hour, 0
          )
        } else {
          // 旧格式兼容：用 orderTime 的 year/month 作基准，Date 自动归一化处理 day 溢出
          const baseYear = order.orderTime?.year || year
          const baseMonth = order.orderTime?.month || month
          deliveryDate = new Date(
            baseYear, baseMonth - 1,
            order.deliveryTime.day, order.deliveryTime.hour, 0
          )
        }

        if (currentTime >= deliveryDate) {
          order.status = 'delivered'
          deliveredOrders.push(order)

          for (const item of order.items) {
            this.addItem({
              id: item.productId,
              name: item.productName,
              description: item.product.description,
              type: getItemType(item.product) as Item['type'],
              count: item.quantity,
              category: item.product.category,
              durability: item.product.durability,
              maxDurability: item.product.durability,
              effectDuration: item.product.effectDuration,
              effects: item.product.effect,
              productData: item.product
            })
          }

          this.player.pendingDeliveries.splice(i, 1)
        }
      }
    }

    return deliveredOrders
  },

  // ==================== 兼职系统 ====================

  /**
   * 申请兼职
   */
  async applyForPartTimeJob(this: any, locationId: string, jobData: any): Promise<{ success: boolean; message: string }> {
    if (this.player.role === 'teacher') {
      return { success: false, message: '教师不需要申请兼职工作' }
    }

    if (this.player.partTimeJob.currentJob) {
      return { success: false, message: '你已经有一份兼职了，请先辞职再申请新的' }
    }

    this.player.partTimeJob.currentJob = locationId
    
    const startDate = `${this.gameTime.year}年${this.gameTime.month}月${this.gameTime.day}日`
    if (!this.player.partTimeJob.history) {
      this.player.partTimeJob.history = []
    }
    this.player.partTimeJob.history.push({
      locationId,
      jobName: jobData.name,
      jobDescription: jobData.description || '暂无描述',
      startDate,
      endDate: null
    })

    try {
      const { updatePartTimeWorldbookEntry } = await import('../../utils/partTimeWorldbook.js')
      await updatePartTimeWorldbookEntry(this.currentRunId, this.player.partTimeJob.history, this.player.name)
    } catch (e) {
      console.error('[GameStore] Failed to update part-time worldbook entry:', e)
    }

    console.log(`[GameStore] Player ${this.player.name} applied for part-time job at ${locationId}`)
    return { success: true, message: `已成功申请 ${jobData.name} 兼职` }
  },

  /**
   * 辞职
   */
  async quitPartTimeJob(this: any): Promise<{ success: boolean; message: string }> {
    if (!this.player.partTimeJob.currentJob) {
      return { success: false, message: '你当前没有兼职' }
    }

    if (this.player.partTimeJob.isWorking) {
      this.player.partTimeJob.isWorking = false
      this.player.partTimeJob.workStartTime = null
    }

    const jobId = this.player.partTimeJob.currentJob
    
    const currentHistory = this.player.partTimeJob.history.find((h: any) => h.endDate === null && h.locationId === jobId)
    if (currentHistory) {
      currentHistory.endDate = `${this.gameTime.year}年${this.gameTime.month}月${this.gameTime.day}日`
    }

    try {
      const { updatePartTimeWorldbookEntry } = await import('../../utils/partTimeWorldbook.js')
      await updatePartTimeWorldbookEntry(this.currentRunId, this.player.partTimeJob.history, this.player.name)
    } catch (e) {
      console.error('[GameStore] Failed to update part-time worldbook entry:', e)
    }

    this.player.partTimeJob.currentJob = null

    console.log(`[GameStore] Player ${this.player.name} quit part-time job at ${jobId}`)
    return { success: true, message: '已成功辞职' }
  },

  /**
   * 开始工作
   */
  startWorking(this: any): { success: boolean; message: string } {
    if (!this.player.partTimeJob.currentJob) {
      return { success: false, message: '你当前没有兼职' }
    }

    if (this.player.partTimeJob.isWorking) {
      return { success: false, message: '你已经在工作中了' }
    }

    if (this.player.location !== this.player.partTimeJob.currentJob) {
      return { success: false, message: '你不在兼职地点，无法开始工作' }
    }

    const startTime = this.gameTime.hour * 60 + this.gameTime.minute
    this.player.partTimeJob.isWorking = true
    this.player.partTimeJob.workStartTime = startTime

    console.log(`[GameStore] Player started working at ${startTime}`)
    return { success: true, message: '开始工作！' }
  },

  /**
   * 结束工作并结算工资
   */
  async endWorking(this: any, jobData: any): Promise<{ success: boolean; message: string; earnings?: number }> {
    if (!this.player.partTimeJob.isWorking) {
      return { success: false, message: '你当前没有在工作' }
    }

    const startTime = this.player.partTimeJob.workStartTime || 0
    const endTime = this.gameTime.hour * 60 + this.gameTime.minute
    
    let duration = endTime - startTime
    if (duration < 0) {
      duration += 24 * 60
    }

    // 兼容多种工资字段名：hourlyWage, wage, salary
    let hourlyWage = jobData?.hourlyWage || jobData?.wage || jobData?.salary || 15
    // 确保转换为数字
    if (typeof hourlyWage === 'string') {
      hourlyWage = parseFloat(hourlyWage.replace(/[^\d.]/g, ''))
    }
    if (isNaN(hourlyWage)) hourlyWage = 15

    const earnings = Math.floor((duration / 60) * hourlyWage)

    // 确保当前金钱是数字
    if (typeof this.player.money !== 'number' || isNaN(this.player.money)) {
      this.player.money = 0
    }
    
    this.player.money += earnings
    this.player.partTimeJob.totalEarnings += earnings

    this.player.partTimeJob.isWorking = false
    this.player.partTimeJob.workStartTime = null

    this.player.partTimeJob.lastWorkInfo = {
      jobName: jobData?.name || '兼职',
      duration: duration,
      earnings: earnings,
      turnsRemaining: 2
    }

    console.log(`[GameStore] Player finished working. Duration: ${duration}min, Earnings: ${earnings}`)
    return { 
      success: true, 
      message: `工作结束！工作时长: ${Math.floor(duration / 60)}小时${duration % 60}分钟，获得工资: ${earnings}元`, 
      earnings 
    }
  },

  /**
   * 检查是否在兼职地点
   */
  isAtWorkLocation(this: any): boolean {
    if (!this.player.partTimeJob.currentJob) return false
    return this.player.location === this.player.partTimeJob.currentJob
  },

  /**
   * 获取当前工作时长（分钟）
   */
  getCurrentWorkDuration(this: any): number {
    if (!this.player.partTimeJob.isWorking || this.player.partTimeJob.workStartTime === null) {
      return 0
    }
    const currentTime = this.gameTime.hour * 60 + this.gameTime.minute
    let duration = currentTime - this.player.partTimeJob.workStartTime
    if (duration < 0) {
      duration += 24 * 60
    }
    return duration
  },

  /**
   * 获取兼职状态描述（用于提示词）
   */
  getPartTimeJobStatus(this: any): string | null {
    if (!this.player.partTimeJob.currentJob) return null
    
    if (this.player.partTimeJob.isWorking) {
      const duration = this.getCurrentWorkDuration()
      return `${this.player.name}正在兼职工作中（已工作${Math.floor(duration / 60)}小时${duration % 60}分钟）`
    }
    
    return `${this.player.name}已受雇于兼职岗位，但当前不在工作状态`
  },

  /**
   * 处理兼职回合结束（递减工作结算提示剩余轮数）
   */
  handlePartTimeJobTurnEnd(this: any) {
    if (this.player.partTimeJob.lastWorkInfo) {
      this.player.partTimeJob.lastWorkInfo.turnsRemaining--
      if (this.player.partTimeJob.lastWorkInfo.turnsRemaining <= 0) {
        this.player.partTimeJob.lastWorkInfo = null
      }
    }
  }
}
