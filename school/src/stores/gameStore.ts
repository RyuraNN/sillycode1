/**
 * GameStore - 主 Store
 * 使用模块化的 Actions 组合
 */

import { defineStore } from 'pinia'

// 类型导入
import type { GameState, CommandEntry, ChatMessage } from './gameStoreTypes'

// 初始状态导入
import { createInitialState } from './gameStoreState'

// Actions 模块导入
import { forumActions } from './actions/forumActions'
import { partTimeDeliveryActions } from './actions/partTimeDeliveryActions'
import { eventWeatherActions } from './actions/eventWeatherActions'
import { socialActions } from './actions/socialActions'
import { snapshotActions } from './actions/snapshotActions'
import { storageActions } from './actions/storageActions'
import { playerActions } from './actions/playerActions'
import { inventoryActions } from './actions/inventoryActions'
import { timeActions } from './actions/timeActions'
import { classClubActions } from './actions/classClubActions'
import { electiveActions } from './actions/electiveActions'
import { yearProgressionActions } from './actions/yearProgressionActions'
import { academicActions } from './actions/academicActions'
import { schoolRuleActions } from './actions/schoolRuleActions'

// 重新导出类型，保持对外接口兼容
export type { CommandEntry, ChatMessage }

export const useGameStore = defineStore('game', {
  state: (): GameState => createInitialState(),
  
  actions: {
    // ==================== 存储相关 ====================
    ...storageActions,
    
    // ==================== 快照相关 ====================
    ...snapshotActions,
    
    // ==================== 玩家相关 ====================
    ...playerActions,
    
    // ==================== 物品与装备相关 ====================
    ...inventoryActions,
    
    // ==================== 时间相关 ====================
    ...timeActions,
    
    // ==================== 班级与社团相关 ====================
    ...classClubActions,
    
    // ==================== 选修课相关 ====================
    ...electiveActions,
    
    // ==================== 论坛相关 ====================
    ...forumActions,
    
    // ==================== 兼职与外卖相关 ====================
    ...partTimeDeliveryActions,
    
    // ==================== 事件与天气相关 ====================
    ...eventWeatherActions,
    
    // ==================== 社交相关 ====================
    ...socialActions,

    // ==================== 学年进级相关 ====================
    ...yearProgressionActions,

    // ==================== 学业系统相关 ====================
    ...academicActions,

    // ==================== 校规系统相关 ====================
    ...schoolRuleActions
  }
})
