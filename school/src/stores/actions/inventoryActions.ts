/**
 * 物品与装备相关 Actions
 */

import type { Item, EquipmentSlots, ActiveEffect, CommandEntry } from '../gameStoreTypes'

export const inventoryActions = {
  /**
   * 添加物品
   */
  addItem(this: any, item: Item) {
    const existingItem = this.player.inventory.find((i: Item) => i.id === item.id)
    if (existingItem) {
      existingItem.count += item.count
    } else {
      this.player.inventory.push(item)
    }
  },

  /**
   * 添加待发送指令或系统通知
   */
  addCommand(this: any, command: string | CommandEntry) {
    if (typeof command === 'string') {
      // 如果是系统通知（以 [ 开头），直接添加到通知列表，不进入待发送队列
      if (command.startsWith('[') && this.player.systemNotifications) {
        this.player.systemNotifications.push(command)
      } else {
        this.player.pendingCommands.push({
          id: Date.now(),
          text: command,
          type: 'other'
        })
      }
    } else {
      this.player.pendingCommands.push(command)
    }
  },

  /**
   * 清除系统通知
   */
  clearSystemNotifications(this: any) {
    if (this.player.systemNotifications) {
      this.player.systemNotifications = []
    }
  },

  /**
   * 移除待发送指令（支持回滚）
   */
  removeCommand(this: any, index: number) {
    const command = this.player.pendingCommands[index]
    if (command && command.rollbackData) {
      this.rollbackCommand(command.rollbackData)
    }
    this.player.pendingCommands.splice(index, 1)
  },

  /**
   * 执行回滚操作
   */
  rollbackCommand(this: any, data: any) {
    console.log('[GameStore] Rolling back command:', data)
    
    if (data.type === 'transfer') {
      if (data.amount && typeof data.amount === 'number') {
        this.player.money += data.amount
        console.log(`[GameStore] Rolled back transfer: +${data.amount}`)
      }
    } else if (data.type === 'item_use') {
      if (data.item) {
        this.addItem(data.item)
      }
      
      if (data.appliedEffects) {
        if (data.appliedEffects.activeEffectIds) {
          this.player.activeEffects = this.player.activeEffects.filter(
            (e: ActiveEffect) => !data.appliedEffects.activeEffectIds.includes(e.id)
          )
        }
        
        if (data.appliedEffects.instant) {
          for (const [attr, value] of Object.entries(data.appliedEffects.instant)) {
            this.applyInstantEffect(attr, -(value as number))
          }
        }
      }
    }
  },

  /**
   * 丢弃物品
   */
  discardItem(this: any, item: Item, count: number = 1) {
    const inventoryItem = this.player.inventory.find((i: Item) => i.id === item.id)
    if (inventoryItem) {
      inventoryItem.count -= count
      if (inventoryItem.count <= 0) {
        const index = this.player.inventory.indexOf(inventoryItem)
        this.player.inventory.splice(index, 1)
      }
    }
  },

  /**
   * 使用物品（带回滚支持）
   */
  useItem(this: any, item: Item) {
    const rollbackData: any = {
      type: 'item_use',
      item: { ...item, count: 1 },
      appliedEffects: {
        activeEffectIds: [],
        instant: {}
      }
    }

    if (item.effects) {
      const duration = typeof item.effectDuration === 'string' ? -1 : item.effectDuration
      const { activeIds, instantChanges } = this.applyEffectsWithTracking(item.effects, item.id, 'item', duration)
      rollbackData.appliedEffects.activeEffectIds = activeIds
      rollbackData.appliedEffects.instant = instantChanges
    }
    
    const inventoryItem = this.player.inventory.find((i: Item) => i.id === item.id)
    if (inventoryItem) {
      inventoryItem.count--
      if (inventoryItem.count <= 0) {
        const index = this.player.inventory.indexOf(inventoryItem)
        this.player.inventory.splice(index, 1)
      }
    }

    this.addCommand({
      id: Date.now(),
      text: `[系统] ${this.player.name} 使用了 ${item.name}`,
      type: 'item_use',
      rollbackData: rollbackData
    })
  },

  /**
   * 清空待发送指令
   */
  clearCommands(this: any) {
    this.player.pendingCommands = []
  },

  // ==================== 装备系统 ====================

  /**
   * 装备物品
   */
  equipItem(this: any, item: Item, slot: keyof EquipmentSlots) {
    if (this.player.equipment[slot]) {
      this.unequipItem(slot)
    }
    
    const inventoryItem = this.player.inventory.find((i: Item) => i.id === item.id)
    if (inventoryItem) {
      inventoryItem.count--
      if (inventoryItem.count <= 0) {
        const index = this.player.inventory.indexOf(inventoryItem)
        this.player.inventory.splice(index, 1)
      }
    }
    
    this.player.equipment[slot] = { ...item, count: 1 }
    
    if (item.effects) {
      this.applyEffects(item.effects, item.id, 'equipment')
    }
  },

  /**
   * 卸下装备
   */
  unequipItem(this: any, slot: keyof EquipmentSlots) {
    const item = this.player.equipment[slot]
    if (!item) return
    
    this.removeEffectsBySource(item.id)
    this.addItem(item)
    this.player.equipment[slot] = null
  },

  // ==================== 效果系统 ====================

  /**
   * 应用效果（旧版兼容）
   */
  applyEffects(this: any, effects: Array<{ attribute: string; value: number; isPercentage: boolean }>, sourceId: string, sourceType: 'item' | 'equipment' | 'event', duration?: number) {
    this.applyEffectsWithTracking(effects, sourceId, sourceType, duration)
  },

  /**
   * 应用效果并返回追踪信息（用于回滚）
   */
  applyEffectsWithTracking(this: any, effects: Array<{ attribute: string; value: number; isPercentage: boolean }>, sourceId: string, sourceType: 'item' | 'equipment' | 'event', duration?: number) {
    const actualDuration = duration === undefined ? -1 : duration
    const { year, month, day, hour } = this.gameTime
    
    const activeIds: string[] = []
    const instantChanges: Record<string, number> = {}

    for (const effect of effects) {
      if (['健康', '心境', '金钱', '体力', '精力'].includes(effect.attribute)) {
        this.applyInstantEffect(effect.attribute, effect.value)
        instantChanges[effect.attribute] = (instantChanges[effect.attribute] || 0) + effect.value
      } else {
        let effectType: ActiveEffect['effectType'] = 'stat'
        if (effect.attribute.includes('经验获取效率')) effectType = 'expBonus'
        else if (effect.attribute.includes('恢复效率')) effectType = 'recoveryBonus'
        else if (effect.attribute.includes('锻炼效率')) effectType = 'efficiencyBonus'
        else if (effect.attribute.includes('抗性')) effectType = 'resistance'
        else if (effect.attribute.includes('下降率')) effectType = 'modifier'
        
        const newEffect: ActiveEffect = {
          id: Date.now().toString() + Math.random(),
          name: effect.attribute,
          source: sourceId,
          sourceType,
          effectType,
          attribute: effect.attribute,
          value: effect.value,
          isPercentage: effect.isPercentage,
          turnsRemaining: actualDuration,
          startTime: { year, month, day, hour }
        }
        
        this.player.activeEffects.push(newEffect)
        activeIds.push(newEffect.id)
      }
    }

    return { activeIds, instantChanges }
  },

  /**
   * 应用立即生效的效果
   */
  applyInstantEffect(this: any, attribute: string, value: number) {
    if (attribute === '心境' && value < 0 && this.player.talents.includes('t9')) {
      value = Math.ceil(value / 2)
      console.log('[天赋生效] 钢铁心灵生效，心境扣减减半')
    }

    if (attribute === '健康') {
      this.player.health = Math.min(100, Math.max(0, this.player.health + value))
    } else if (attribute === '心境') {
      this.player.attributes.mood = Math.min(100, Math.max(0, this.player.attributes.mood + value))
    } else if (attribute === '金钱') {
      this.player.money += value
    } else if (attribute === '体力') {
      this.player.hp = Math.min(this.player.maxHp, Math.max(0, this.player.hp + value))
    } else if (attribute === '精力') {
      this.player.mp = Math.min(this.player.maxMp, Math.max(0, this.player.mp + value))
    }
  },

  /**
   * 移除指定来源的所有效果
   */
  removeEffectsBySource(this: any, sourceId: string) {
    this.player.activeEffects = this.player.activeEffects.filter((e: ActiveEffect) => e.source !== sourceId)
  },

  /**
   * 检查并更新效果持续时间（每回合调用）
   */
  updateEffects(this: any) {
    this.player.activeEffects = this.player.activeEffects.filter((effect: ActiveEffect) => {
      if (effect.turnsRemaining === -1) return true
      
      effect.turnsRemaining--
      return effect.turnsRemaining > 0
    })
  },

  /**
   * 获取当前属性加成
   */
  getStatBonus(this: any, attribute: string): number {
    return this.player.activeEffects
      .filter((e: ActiveEffect) => e.effectType === 'stat' && e.attribute === attribute)
      .reduce((sum: number, e: ActiveEffect) => sum + e.value, 0)
  },

  /**
   * 获取经验加成倍率
   */
  getExpMultiplier(this: any, type: string): number {
    const bonuses = this.player.activeEffects
      .filter((e: ActiveEffect) => e.effectType === 'expBonus' && e.attribute.includes(type))
    
    let multiplier = 1.0
    for (const bonus of bonuses) {
      if (bonus.isPercentage) {
        multiplier += bonus.value / 100
      }
    }
    return multiplier
  },

  /**
   * 处理回合结束
   */
  handleTurnEnd(this: any) {
    this.updateEffects()
    this.handleForumTurnEnd()
    this.handlePartTimeJobTurnEnd()
    
    // 递减新游戏引导回合数
    if (this.player.newGameGuideTurns > 0) {
      this.player.newGameGuideTurns--
    }
  }
}
