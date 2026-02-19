/**
 * 增量快照工具函数
 * 用于计算和应用状态差异，减少内存占用
 */

import type { GameStateData } from '../stores/gameStoreTypes'

/** 增量快照数据 */
export interface DeltaSnapshot {
  _isDelta: true
  _baseFloor: number
  _timestamp: number
  changes: Record<string, { old: any; new: any }>
}

/** 基准快照周期（每 N 层创建一个完整快照） */
export const BASE_SNAPSHOT_INTERVAL = 10

/**
 * 计算两个对象之间的差异
 * @param oldObj 旧对象
 * @param newObj 新对象
 * @param path 当前路径（用于递归）
 * @param changes 变更记录
 * @param maxDepth 最大递归深度（防止过深递归）
 */
function computeDiff(
  oldObj: any,
  newObj: any,
  path: string = '',
  changes: Record<string, { old: any; new: any }> = {},
  maxDepth: number = 5
): Record<string, { old: any; new: any }> {
  if (maxDepth <= 0) {
    // 达到最大深度，直接比较
    if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
      changes[path] = { old: oldObj, new: newObj }
    }
    return changes
  }

  // 处理 null/undefined
  if (oldObj === null || oldObj === undefined || newObj === null || newObj === undefined) {
    if (oldObj !== newObj) {
      changes[path] = { old: oldObj, new: newObj }
    }
    return changes
  }

  // 处理基本类型
  if (typeof oldObj !== 'object' || typeof newObj !== 'object') {
    if (oldObj !== newObj) {
      changes[path] = { old: oldObj, new: newObj }
    }
    return changes
  }

  // 处理数组 - 直接比较序列化结果
  if (Array.isArray(oldObj) || Array.isArray(newObj)) {
    const oldStr = JSON.stringify(oldObj)
    const newStr = JSON.stringify(newObj)
    if (oldStr !== newStr) {
      changes[path] = { old: oldObj, new: newObj }
    }
    return changes
  }

  // 处理对象 - 只处理关键字段
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])
  
  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key
    
    // 跳过某些大型或不需要对比的字段
    if (shouldSkipField(key)) {
      continue
    }
    
    const oldVal = oldObj?.[key]
    const newVal = newObj?.[key]
    
    // 对于简单值，直接比较
    if (typeof oldVal !== 'object' || typeof newVal !== 'object' || 
        oldVal === null || newVal === null ||
        Array.isArray(oldVal) || Array.isArray(newVal)) {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[fullPath] = { old: oldVal, new: newVal }
      }
    } else {
      // 递归比较对象
      computeDiff(oldVal, newVal, fullPath, changes, maxDepth - 1)
    }
  }

  return changes
}

/**
 * 判断是否应该跳过某个字段的对比
 */
function shouldSkipField(key: string): boolean {
  // 跳过一些不需要记录差异的大型字段
  const skipFields = [
    'classRoster' // 班级花名册（大型数据）
  ]
  return skipFields.includes(key)
}

/**
 * 计算两个游戏状态之间的增量
 * @param oldState 旧状态
 * @param newState 新状态
 * @param baseFloor 基准楼层
 * @returns 增量快照
 */
export function computeDelta(
  oldState: GameStateData | null,
  newState: GameStateData,
  baseFloor: number
): DeltaSnapshot {
  const changes: Record<string, { old: any; new: any }> = {}
  
  // 统一使用完整字段列表进行对比
  const keyFields = [
    // 玩家基础属性
    'player.gold',
    'player.money', 
    'player.location',
    'player.hp',
    'player.maxHp',
    'player.mp',
    'player.maxMp',
    'player.level',
    'player.exp',
    'player.totalExp',
    'player.freePoints',
    'player.health',
    'player.attributes',
    'player.potentials',
    'player.subjects',
    'player.skills',
    'player.subjectExps',
    'player.skillExps',
    // 物品与装备
    'player.inventory',
    'player.equipment',
    'player.activeEffects',
    'player.productStock',
    'player.pendingDeliveries',
    // 社交与社团
    'player.joinedClubs',
    'player.social',
    'player.forum',
    'player.relationships',
    // 事件与日历
    'player.activeEvents',
    'player.eventHistory',
    'player.scheduledEvents',
    'player.customCalendarEvents',
    // 标记与指令
    'player.flags',
    'player.pendingCommands',
    'player.holdMessages',
    'player.talents',
    'player.currentGoal',
    // 选课与班级
    'player.selectedElectives',
    'player.electivesLockedForTerm',
    'player.classId',
    'player.schedule',
    // 总结与兼职
    'player.summaries',
    'player.partTimeJob',
    'player.socialReadStatus',
    // 全局状态
    'gameTime',
    'npcs',
    'npcRelationships',
    'worldState',
    'allClassData',
    'allClubs',
    'graduatedNpcs',
    'lastAcademicYear',
    'currentRunId',
    'currentFloor',
    'examHistory',
    'electiveAcademicData',
    'lastExamDate',
    'eventChecks',
    'clubApplication',
    'clubRejection',
    'clubInvitation',
    'npcElectiveSelections'
  ]
  
  for (const field of keyFields) {
    const oldVal = oldState ? getNestedValue(oldState, field) : undefined
    const newVal = getNestedValue(newState, field)
    
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal }
    }
  }

  return {
    _isDelta: true,
    _baseFloor: baseFloor,
    _timestamp: Date.now(),
    changes
  }
}

/**
 * 将增量应用到基准状态上，还原完整状态
 * @param baseState 基准状态
 * @param delta 增量快照
 * @returns 还原后的完整状态
 */
export function applyDelta(
  baseState: GameStateData,
  delta: DeltaSnapshot
): GameStateData {
  // 深拷贝基准状态
  const result = JSON.parse(JSON.stringify(baseState)) as GameStateData
  
  // 应用所有变更
  for (const [path, change] of Object.entries(delta.changes)) {
    setNestedValue(result, path, change.new)
  }
  
  return result
}

/**
 * 应用多个增量到基准状态上
 * @param baseState 基准状态
 * @param deltas 增量快照数组（按顺序）
 * @returns 还原后的完整状态
 */
export function applyDeltas(
  baseState: GameStateData,
  deltas: DeltaSnapshot[]
): GameStateData {
  let result = JSON.parse(JSON.stringify(baseState)) as GameStateData
  
  for (const delta of deltas) {
    for (const [path, change] of Object.entries(delta.changes)) {
      setNestedValue(result, path, change.new)
    }
  }
  
  return result
}

/**
 * 判断是否应该创建基准快照
 * @param floor 当前楼层
 * @param lastBaseFloor 上一个基准快照的楼层
 */
export function shouldCreateBaseSnapshot(floor: number, lastBaseFloor: number): boolean {
  return (floor - lastBaseFloor) >= BASE_SNAPSHOT_INTERVAL
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.')
  let current = obj
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[key]
  }
  
  return current
}

/**
 * 设置嵌套对象的值
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  let current = obj
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || current[key] === null) {
      current[key] = {}
    }
    current = current[key]
  }
  
  current[keys[keys.length - 1]] = value
}

/**
 * 检查是否为增量快照
 */
export function isDeltaSnapshot(snapshot: any): snapshot is DeltaSnapshot {
  return snapshot && snapshot._isDelta === true
}

/**
 * 估算快照大小（字节）
 */
export function estimateSnapshotSize(snapshot: GameStateData | DeltaSnapshot): number {
  try {
    return JSON.stringify(snapshot).length
  } catch {
    return 0
  }
}

/**
 * 简化版快照（用于消息内联，只保留最关键的数据）
 */
export function createLightSnapshot(state: GameStateData): object {
  return {
    player: {
      gold: state.player?.gold,
      money: state.player?.money,
      location: state.player?.location,
      hp: state.player?.hp,
      mp: state.player?.mp,
      health: state.player?.health,
      attributes: state.player?.attributes,
      level: state.player?.level
    },
    gameTime: state.gameTime
  }
}
