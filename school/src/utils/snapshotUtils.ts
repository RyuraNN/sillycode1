/**
 * 增量快照工具函数
 * 用于计算和应用状态差异，减少内存占用
 *
 * 重构版本：实现真正的细粒度增量比较
 * - 对基本类型直接比较（不使用 JSON.stringify）
 * - 对数组进行元素级比较
 * - 对大型对象使用智能比较
 * - 特殊处理 NPC 数组（使用 ID 匹配）
 */

import type { GameStateData } from '../stores/gameStoreTypes'

/**
 * 序列化不可克隆的数据
 * 只处理关键字段，保持轻量级
 */
function serializeForStorage(obj: any): any {
  if (obj === null || obj === undefined) return obj

  // 处理 Date 对象
  if (obj instanceof Date) {
    return { __type: 'Date', value: obj.toISOString() }
  }

  // 处理 RegExp
  if (obj instanceof RegExp) {
    return { __type: 'RegExp', source: obj.source, flags: obj.flags }
  }

  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => serializeForStorage(item))
  }

  const serialized: any = {}
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue
    const value = obj[key]

    // 跳过函数、Symbol、undefined
    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
      continue
    }

    serialized[key] = serializeForStorage(value)
  }

  return serialized
}

/**
 * 反序列化数据
 */
function deserializeFromStorage(obj: any): any {
  if (obj === null || obj === undefined) return obj

  // 处理特殊类型标记
  if (obj && typeof obj === 'object' && obj.__type) {
    if (obj.__type === 'Date') {
      return new Date(obj.value)
    }
    if (obj.__type === 'RegExp') {
      return new RegExp(obj.source, obj.flags)
    }
  }

  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => deserializeFromStorage(item))
  }

  const deserialized: any = {}
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue
    deserialized[key] = deserializeFromStorage(obj[key])
  }

  return deserialized
}

/**
 * 快速深拷贝函数（性能优化版）
 *
 * 性能优化：
 * - 使用序列化/反序列化方案，保留关键数据类型（Date、特殊对象标记）
 * - 移除不可序列化的数据（函数、Symbol、undefined）
 * - 只在保存到 IndexedDB 时序列化，内存中保持原始对象
 *
 * @param obj 要克隆的对象
 * @returns 克隆后的对象
 */
export const fastClone = <T>(obj: T): T => {
  try {
    // 序列化处理
    const serialized = serializeForStorage(obj)

    // 使用 JSON 方法克隆
    const cloned = JSON.parse(JSON.stringify(serialized))

    // 反序列化恢复特殊类型
    return deserializeFromStorage(cloned)
  } catch (e) {
    console.error('[fastClone] Failed to clone object:', e)
    console.error('[fastClone] Problematic object:', obj)
    throw new Error('无法克隆对象：包含不可序列化的数据')
  }
}

/**
 * 需要从内联快照中剥离的大型累积字段路径
 * 这些字段随游戏轮次线性增长，不应存储在每条消息的快照中
 * 它们在 gameState 存档中独立保存，恢复时会被重新组装
 */
const BULKY_PLAYER_FIELDS = ['summaries', 'persistentFacts'] as const

/**
 * Phase 1.2 + Phase 2: 从内联快照中剥离的静态/低频变化字段
 * 这些字段体积大但很少变化，在 gameState 存档中已完整保存
 * 从内联基准快照中移除可减少 ~50-100KB/个
 * Phase 2: 字段路径现在是 {group}.{field} 格式
 */
export const STATIC_SNAPSHOT_FIELDS = [
  // world 下的静态字段
  { group: 'world', field: 'allClassData' },       // 班级数据，几乎不变（~50KB）
  { group: 'world', field: 'allClubs' },            // 社团数据，低频变化（~20KB）
  { group: 'world', field: 'npcRelationships' },    // NPC 关系网，已有独立 IndexedDB 存储（~30KB）
  { group: 'world', field: 'characterNotes' },      // 用户笔记，低频变化
  { group: 'world', field: 'graduatedNpcs' },       // 毕业生，仅学年进级时变化
  // academic 下的静态字段
  { group: 'academic', field: 'examHistory' },      // 累积数据，只增不减
  { group: 'academic', field: 'customCoursePool' }, // 课程池数据，设置后不变
] as const

/** 旧版兼容：扁平字段名列表（用于 v3 格式的快照） */
export const STATIC_SNAPSHOT_FIELDS_LEGACY = [
  'allClassData', 'allClubs', 'npcRelationships', 'examHistory',
  'characterNotes', 'customCoursePool', 'graduatedNpcs'
] as const

/**
 * 从内联快照中剥离静态/低频变化字段
 * 恢复时这些字段会从 gameState 存档或当前 store 中补充
 * Phase 2: 支持新版分层格式和旧版扁平格式
 * @param snapshot 游戏状态快照（会被就地修改）
 * @returns 修改后的快照
 */
export function stripStaticFields<T>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  const s = snapshot as any

  // Phase 2: 新版分层格式
  for (const { group, field } of STATIC_SNAPSHOT_FIELDS) {
    if (s[group] && s[group][field] !== undefined) {
      delete s[group][field]
    }
  }

  // 旧版兼容：扁平格式
  for (const field of STATIC_SNAPSHOT_FIELDS_LEGACY) {
    if (s[field] !== undefined) {
      delete s[field]
    }
  }
  return snapshot
}

/**
 * 从快照中剥离大型累积字段（summaries, persistentFacts）
 * 用于减少内联快照的存储开销
 * Phase 2: 同时处理 rag.summaries/persistentFacts 和 player.summaries/persistentFacts
 * @param snapshot 游戏状态快照（会被就地修改）
 * @returns 修改后的快照
 */
export function stripBulkyFields<T>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  const s = snapshot as any

  // Phase 2: 新版 rag 分组
  if (s.rag) {
    for (const field of BULKY_PLAYER_FIELDS) {
      if (Array.isArray(s.rag[field])) {
        s.rag[`_${field}Count`] = s.rag[field].length
        s.rag[field] = []
      }
    }
  }

  // 旧版兼容：player 下的 summaries/persistentFacts
  const player = s.player
  if (player) {
    for (const field of BULKY_PLAYER_FIELDS) {
      if (Array.isArray(player[field])) {
        player[`_${field}Count`] = player[field].length
        player[field] = []
      }
    }
  }
  return snapshot
}

export function stripEmbeddingData<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object') return value

  if (seen.has(value as object)) {
    return value
  }
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (const item of value) {
      stripEmbeddingData(item, seen)
    }
    return value
  }

  const target = value as Record<string, any>
  for (const key of Object.keys(target)) {
    if (key === 'embedding') {
      delete target[key]
      continue
    }
    stripEmbeddingData(target[key], seen)
  }

  return value
}

/**
 * 导出反序列化函数供外部使用
 */
export { deserializeFromStorage }

/** 增量快照数据 */
export interface DeltaSnapshot {
  _isDelta: true
  _baseFloor: number
  _timestamp: number
  changes: Record<string, { old: any; new: any }>
}

/** 基准快照周期（每 N 层创建一个完整快照） */
export const BASE_SNAPSHOT_INTERVAL = 20

/**
 * 智能比较两个数组
 * @param oldArr 旧数组
 * @param newArr 新数组
 * @param path 当前路径
 * @param changes 变更记录
 * @param depth 当前递归深度
 */
function compareArrays(
  oldArr: any[],
  newArr: any[],
  path: string,
  changes: Record<string, { old: any; new: any }>,
  depth: number
): void {
  // 如果数组长度变化，记录整个数组（这种情况较少）
  if (oldArr.length !== newArr.length) {
    changes[path] = { old: oldArr, new: newArr }
    return
  }

  // 如果数组为空，跳过
  if (newArr.length === 0) {
    return
  }

  // 检查数组元素类型
  const firstNew = newArr[0]
  const isObjectArray = firstNew && typeof firstNew === 'object' && firstNew !== null

  if (!isObjectArray) {
    // 基本类型数组：逐元素比较
    for (let i = 0; i < newArr.length; i++) {
      if (oldArr[i] !== newArr[i]) {
        changes[`${path}[${i}]`] = { old: oldArr[i], new: newArr[i] }
      }
    }
  } else {
    // 对象数组：递归比较
    for (let i = 0; i < newArr.length; i++) {
      const oldItem = oldArr[i]
      const newItem = newArr[i]

      if (oldItem && newItem) {
        compareObjects(oldItem, newItem, `${path}[${i}]`, changes, depth + 1)
      } else if (oldItem !== newItem) {
        changes[`${path}[${i}]`] = { old: oldItem, new: newItem }
      }
    }
  }
}

/**
 * 智能比较两个对象
 * @param oldObj 旧对象
 * @param newObj 新对象
 * @param path 当前路径
 * @param changes 变更记录
 * @param depth 当前递归深度
 */
function compareObjects(
  oldObj: any,
  newObj: any,
  path: string,
  changes: Record<string, { old: any; new: any }>,
  depth: number = 0
): void {
  // 防止过深递归（超过5层使用 JSON.stringify）
  if (depth > 5) {
    const oldStr = JSON.stringify(oldObj)
    const newStr = JSON.stringify(newObj)
    if (oldStr !== newStr) {
      changes[path] = { old: oldObj, new: newObj }
    }
    return
  }

  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])

  for (const key of allKeys) {
    const oldVal = oldObj?.[key]
    const newVal = newObj?.[key]
    const fullPath = path ? `${path}.${key}` : key

    // 跳过某些不需要对比的字段
    if (shouldSkipField(key)) {
      continue
    }

    // null/undefined 处理
    if (oldVal === null || oldVal === undefined || newVal === null || newVal === undefined) {
      if (oldVal !== newVal) {
        changes[fullPath] = { old: oldVal, new: newVal }
      }
      continue
    }

    // 基本类型：直接比较（不使用 JSON.stringify）
    if (typeof newVal !== 'object') {
      if (oldVal !== newVal) {
        changes[fullPath] = { old: oldVal, new: newVal }
      }
    }
    // 数组：元素级比较
    else if (Array.isArray(newVal)) {
      if (Array.isArray(oldVal)) {
        compareArrays(oldVal, newVal, fullPath, changes, depth)
      } else {
        changes[fullPath] = { old: oldVal, new: newVal }
      }
    }
    // 对象：递归比较
    else {
      compareObjects(oldVal || {}, newVal, fullPath, changes, depth + 1)
    }
  }
}

/**
 * 特殊处理：NPC 数组比较（使用 ID 匹配而不是索引）
 * @param oldNpcs 旧 NPC 数组
 * @param newNpcs 新 NPC 数组
 * @param changes 变更记录
 */
function compareNpcArray(
  oldNpcs: any[],
  newNpcs: any[],
  changes: Record<string, { old: any; new: any }>
): void {
  // 使用 ID 建立映射
  const oldMap = new Map(oldNpcs.map((npc: any) => [npc.id, npc]))
  const newMap = new Map(newNpcs.map((npc: any) => [npc.id, npc]))

  // 检查变化和新增的 NPC
  for (const [id, newNpc] of newMap) {
    const oldNpc = oldMap.get(id)
    if (oldNpc) {
      // 比较同一个 NPC 的属性变化
      for (const key of Object.keys(newNpc)) {
        // 跳过某些不需要对比的字段
        if (shouldSkipField(key)) {
          continue
        }

        const oldVal = oldNpc[key]
        const newVal = newNpc[key]

        // 基本类型直接比较
        if (typeof newVal !== 'object' || newVal === null) {
          if (oldVal !== newVal) {
            changes[`npcs[id=${id}].${key}`] = { old: oldVal, new: newVal }
          }
        }
        // 对象/数组使用 JSON.stringify（NPC 的子对象通常不大）
        else {
          const oldStr = JSON.stringify(oldVal)
          const newStr = JSON.stringify(newVal)
          if (oldStr !== newStr) {
            changes[`npcs[id=${id}].${key}`] = { old: oldVal, new: newVal }
          }
        }
      }
    } else {
      // 新增的 NPC
      changes[`npcs[id=${id}]`] = { old: null, new: newNpc }
    }
  }

  // 检查删除的 NPC
  for (const [id, oldNpc] of oldMap) {
    if (!newMap.has(id)) {
      changes[`npcs[id=${id}]`] = { old: oldNpc, new: null }
    }
  }
}

/**
 * 判断是否应该跳过某个字段的对比
 */
function shouldSkipField(key: string): boolean {
  // 跳过一些不需要记录差异的大型字段或内部字段
  if (key === '_internal' || key === '_cache') return true
  // 跳过 stripBulkyFields 生成的计数标记
  if (key === '_summariesCount' || key === '_persistentFactsCount') return true
  return false
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

  // Phase 2: 分层结构的顶层字段（排除静态字段，这些已被 stripStaticFields 剥离）
  // 每个字段对应 GameStateData 中的分组
  const topLevelGroups = [
    'meta', 'player', 'world', 'academic', 'events', 'notifications', 'rag'
  ]

  // 如果没有旧状态，记录所有字段
  if (!oldState) {
    for (const group of topLevelGroups) {
      const newVal = getNestedValue(newState, group)
      if (newVal !== undefined) {
        changes[group] = { old: undefined, new: newVal }
      }
    }

    return {
      _isDelta: true,
      _baseFloor: baseFloor,
      _timestamp: Date.now(),
      changes
    }
  }

  // 特殊处理：NPC 数组（使用 ID 匹配）
  const oldNpcs = (oldState as any).world?.npcs || (oldState as any).npcs || []
  const newNpcs = (newState as any).world?.npcs || (newState as any).npcs || []
  if (oldNpcs.length > 0 || newNpcs.length > 0) {
    compareNpcArray(oldNpcs, newNpcs, changes)
  }

  // 处理顶层分组字段（排除已特殊处理的 world.npcs）
  for (const group of topLevelGroups) {
    if (group === 'world') {
      // world 组内逐字段比较（跳过 npcs，已在上面特殊处理）
      const oldWorld = getNestedValue(oldState, 'world') || {}
      const newWorld = getNestedValue(newState, 'world') || {}
      for (const key of Object.keys(newWorld)) {
        if (key === 'npcs') continue // 已特殊处理
        const oldVal = oldWorld[key]
        const newVal = newWorld[key]
        if (typeof newVal !== 'object' || newVal === null) {
          if (oldVal !== newVal) {
            changes[`world.${key}`] = { old: oldVal, new: newVal }
          }
        } else if (Array.isArray(newVal)) {
          if (Array.isArray(oldVal)) {
            compareArrays(oldVal, newVal, `world.${key}`, changes, 0)
          } else {
            changes[`world.${key}`] = { old: oldVal, new: newVal }
          }
        } else {
          compareObjects(oldVal || {}, newVal, `world.${key}`, changes, 0)
        }
      }
    } else {
      const oldVal = getNestedValue(oldState, group)
      const newVal = getNestedValue(newState, group)

      if (typeof newVal !== 'object' || newVal === null) {
        if (oldVal !== newVal) {
          changes[group] = { old: oldVal, new: newVal }
        }
      } else if (Array.isArray(newVal)) {
        if (Array.isArray(oldVal)) {
          compareArrays(oldVal, newVal, group, changes, 0)
        } else {
          changes[group] = { old: oldVal, new: newVal }
        }
      } else {
        compareObjects(oldVal || {}, newVal, group, changes, 0)
      }
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
 * NPC Map 缓存（用于优化 applyNpcChange 性能）
 */
let _npcMapCache: Map<string, number> | null = null

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
  // 清除缓存
  _npcMapCache = null
  // 深拷贝基准状态
  const result = fastClone(baseState) as GameStateData

  // 应用所有变更
  for (const [path, change] of Object.entries(delta.changes)) {
    // 特殊处理：NPC 数组的 ID 路径（如 npcs[id=123].hp）
    if (path.startsWith('npcs[id=')) {
      applyNpcChange(result, path, change.new)
    } else {
      setNestedValue(result, path, change.new)
    }
  }

  return result
}

/**
 * 应用 NPC 变更（处理 ID 路径）
 * @param state 游戏状态
 * @param path NPC 路径（如 npcs[id=123].hp 或 npcs[id=123]）
 * @param value 新值
 */
function applyNpcChange(state: any, path: string, value: any): void {
  // 解析路径：npcs[id=123].hp -> id=123, hp
  const match = path.match(/npcs\[id=([^\]]+)\](?:\.(.+))?/)
  if (!match) return

  const npcId = match[1]
  const propertyPath = match[2]

  // 确保 npcs 数组存在
  if (!state.npcs) {
    state.npcs = []
  }

  // 构建或使用缓存的 NPC ID -> index 映射
  if (!_npcMapCache) {
    _npcMapCache = new Map(
      state.npcs.map((npc: any, idx: number) => [npc.id, idx])
    )
  }

  const npcIndex = _npcMapCache.get(npcId)

  if (propertyPath) {
    // 修改 NPC 的属性（如 npcs[id=123].hp）
    if (npcIndex !== undefined) {
      setNestedValue(state.npcs[npcIndex], propertyPath, value)
    }
  } else {
    // 添加或删除整个 NPC（如 npcs[id=123]）
    if (value === null) {
      // 删除 NPC
      if (npcIndex !== undefined) {
        state.npcs.splice(npcIndex, 1)
        _npcMapCache = null  // 清除缓存，下次重建
      }
    } else {
      // 添加或替换 NPC
      if (npcIndex !== undefined) {
        state.npcs[npcIndex] = value
      } else {
        state.npcs.push(value)
        _npcMapCache.set(npcId, state.npcs.length - 1)
      }
    }
  }
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
  let result = fastClone(baseState) as GameStateData

  for (const delta of deltas) {
    for (const [path, change] of Object.entries(delta.changes)) {
      if (path.startsWith('npcs[id=')) {
        applyNpcChange(result, path, change.new)
      } else {
        setNestedValue(result, path, change.new)
      }
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

    // 处理数组索引（如 inventory[0]）
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/)
    if (arrayMatch) {
      const arrayKey = arrayMatch[1]
      const index = parseInt(arrayMatch[2], 10)

      if (!current[arrayKey]) {
        current[arrayKey] = []
      }
      if (!current[arrayKey][index]) {
        current[arrayKey][index] = {}
      }
      current = current[arrayKey][index]
    } else {
      if (current[key] === undefined || current[key] === null) {
        current[key] = {}
      }
      current = current[key]
    }
  }

  const lastKey = keys[keys.length - 1]

  // 处理最后一个键的数组索引
  const arrayMatch = lastKey.match(/^(.+)\[(\d+)\]$/)
  if (arrayMatch) {
    const arrayKey = arrayMatch[1]
    const index = parseInt(arrayMatch[2], 10)

    if (!current[arrayKey]) {
      current[arrayKey] = []
    }
    current[arrayKey][index] = value
  } else {
    current[lastKey] = value
  }
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
    gameTime: (state as any).world?.gameTime || (state as any).gameTime
  }
}

