/**
 * GameState 迁移工具
 * Phase 2: 将旧版扁平 GameState (v3) 迁移到分层结构 (v4)
 */

import type { GameState, GameStateDataLegacy } from '../stores/gameStoreTypes'
import { GAME_STATE_SCHEMA_VERSION } from '../stores/gameStoreState'

/**
 * 检测 GameState 数据是否为旧版扁平结构
 * 旧版没有 meta/world/academic/events/notifications 等分层字段
 */
export function isLegacyGameState(data: any): boolean {
  if (!data || typeof data !== 'object') return false
  // 新版有 meta.currentRunId，旧版有顶层 currentRunId
  if (data.meta && data.world) return false
  // 旧版标志：有顶层 player + gameTime（不在 world 下）
  return !!(data.player && data.gameTime && !data.world)
}

/**
 * 将旧版扁平 GameStateData (v3) 迁移到分层结构 (v4)
 * 用于存档导入和快照恢复
 * @param legacy 旧版扁平数据
 * @returns 新版分层数据（不含 settings 和 _ui）
 */
export function migrateGameStateData(legacy: any): Omit<GameState, 'settings' | '_ui'> {
  if (!isLegacyGameState(legacy)) {
    // 已经是新版格式，直接返回
    return legacy
  }

  const l = legacy as GameStateDataLegacy & Record<string, any>

  return {
    meta: {
      currentRunId: l.currentRunId || 'temp_editing',
      currentFloor: l.currentFloor || 0,
      _lastBaseFloor: l._lastBaseFloor || 0,
      _schemaVersion: GAME_STATE_SCHEMA_VERSION
    },
    world: {
      gameTime: l.gameTime,
      worldState: l.worldState || { economy: 100, weather: { current: { weather: 'sunny', weatherName: '晴', icon: '☀️', temperature: 22, tempHigh: 25, tempLow: 18 }, forecast: [], lastUpdateDate: '', season: 'spring', previousHour: 8, lastChangeInfo: null } },
      allClassData: l.allClassData || {},
      allClubs: l.allClubs || {},
      npcs: l.npcs || [],
      npcRelationships: l.npcRelationships || {},
      graduatedNpcs: l.graduatedNpcs || [],
      lastAcademicYear: l.lastAcademicYear || 0,
      characterNotes: l.characterNotes || {}
    },
    player: l.player,
    academic: {
      examHistory: l.examHistory || [],
      lastExamDate: l.lastExamDate ?? null,
      electiveAcademicData: l.electiveAcademicData || {},
      npcElectiveSelections: l.npcElectiveSelections || {},
      customCoursePool: l.customCoursePool ?? null
    },
    events: {
      checks: l.eventChecks || { lastDaily: '', lastWeekly: '', lastMonthly: '' },
      library: new Map(),  // Map 不能序列化，导入时始终为空
      triggers: [],         // 同上
      clubApplication: l.clubApplication || null,
      clubRejection: l.clubRejection || null,
      clubInvitation: l.clubInvitation || null
    },
    notifications: {
      completedTodoMarkers: l.completedTodoMarkers || [],
      todoMatchingMode: l.todoMatchingMode || 'keyword',
      todoMatchingStats: l.todoMatchingStats || { keyword: { success: 0, total: 0 }, index: { success: 0, total: 0 } },
      unviewedExamIds: l.unviewedExamIds || [],
      lastViewedWeeklyPreview: l.lastViewedWeeklyPreview || 0,
      viewedClubIds: l.viewedClubIds || [],
      weeklySnapshot: l.weeklySnapshot || null,
      weeklyPreviewData: l.weeklyPreviewData || null,
      showWeeklyPreview: !!l.showWeeklyPreview,
      lastWeeklyPreviewWeek: l.lastWeeklyPreviewWeek || 0
    },
    rag: {
      summaries: l.player?.summaries || [],
      persistentFacts: l.player?.persistentFacts || []
    }
  }
}

/**
 * 将新版分层 GameStateData 扁平化为旧版格式
 * 用于向后兼容（导出旧格式等）
 */
export function flattenGameStateData(state: any): GameStateDataLegacy {
  if (isLegacyGameState(state)) {
    return state as GameStateDataLegacy
  }

  return {
    player: state.player,
    npcs: state.world?.npcs || [],
    npcRelationships: state.world?.npcRelationships || {},
    graduatedNpcs: state.world?.graduatedNpcs || [],
    lastAcademicYear: state.world?.lastAcademicYear || 0,
    gameTime: state.world?.gameTime,
    worldState: state.world?.worldState,
    allClassData: state.world?.allClassData || {},
    allClubs: state.world?.allClubs || {},
    currentRunId: state.meta?.currentRunId,
    currentFloor: state.meta?.currentFloor,
    examHistory: state.academic?.examHistory || [],
    lastExamDate: state.academic?.lastExamDate ?? null,
    electiveAcademicData: state.academic?.electiveAcademicData || {},
    npcElectiveSelections: state.academic?.npcElectiveSelections || {},
    characterNotes: state.world?.characterNotes || {},
    customCoursePool: state.academic?.customCoursePool ?? null,
    eventChecks: state.events?.checks,
    clubApplication: state.events?.clubApplication || null,
    clubRejection: state.events?.clubRejection || null,
    clubInvitation: state.events?.clubInvitation || null,
    completedTodoMarkers: state.notifications?.completedTodoMarkers || [],
    todoMatchingMode: state.notifications?.todoMatchingMode || 'keyword',
    todoMatchingStats: state.notifications?.todoMatchingStats,
    unviewedExamIds: state.notifications?.unviewedExamIds || [],
    lastViewedWeeklyPreview: state.notifications?.lastViewedWeeklyPreview || 0,
    viewedClubIds: state.notifications?.viewedClubIds || [],
    weeklySnapshot: state.notifications?.weeklySnapshot || null,
    weeklyPreviewData: state.notifications?.weeklyPreviewData || null,
    showWeeklyPreview: !!state.notifications?.showWeeklyPreview,
    lastWeeklyPreviewWeek: state.notifications?.lastWeeklyPreviewWeek || 0,
    _lastBaseFloor: state.meta?._lastBaseFloor || 0
  }
}

/**
 * 从 store 的 this 上下文收集完整的 GameStateData（分层格式）
 * 替代之前在 snapshotActions 中手动逐字段组装的逻辑
 */
export function collectGameStateFromStore(store: any): Omit<GameState, 'settings' | '_ui'> {
  return {
    meta: {
      currentRunId: store.meta.currentRunId,
      currentFloor: store.meta.currentFloor,
      _lastBaseFloor: store.meta._lastBaseFloor || 0,
      _schemaVersion: GAME_STATE_SCHEMA_VERSION
    },
    world: {
      gameTime: store.world.gameTime,
      worldState: store.world.worldState,
      allClassData: store.world.allClassData,
      allClubs: store.world.allClubs,
      npcs: store.world.npcs,
      npcRelationships: store.world.npcRelationships,
      graduatedNpcs: store.world.graduatedNpcs || [],
      lastAcademicYear: store.world.lastAcademicYear || 0,
      characterNotes: store.world.characterNotes || {}
    },
    player: store.player,
    academic: {
      examHistory: store.academic.examHistory || [],
      lastExamDate: store.academic.lastExamDate ?? null,
      electiveAcademicData: store.academic.electiveAcademicData || {},
      npcElectiveSelections: store.academic.npcElectiveSelections || {},
      customCoursePool: store.academic.customCoursePool ?? null
    },
    events: {
      checks: store.events.checks || { lastDaily: '', lastWeekly: '', lastMonthly: '' },
      library: new Map(), // Map 不可序列化
      triggers: [],        // 运行时数据
      clubApplication: store.events.clubApplication || null,
      clubRejection: store.events.clubRejection || null,
      clubInvitation: store.events.clubInvitation || null
    },
    notifications: {
      completedTodoMarkers: store.notifications.completedTodoMarkers || [],
      todoMatchingMode: store.notifications.todoMatchingMode || 'keyword',
      todoMatchingStats: store.notifications.todoMatchingStats || { keyword: { success: 0, total: 0 }, index: { success: 0, total: 0 } },
      unviewedExamIds: store.notifications.unviewedExamIds || [],
      lastViewedWeeklyPreview: store.notifications.lastViewedWeeklyPreview || 0,
      viewedClubIds: store.notifications.viewedClubIds || [],
      weeklySnapshot: store.notifications.weeklySnapshot || null,
      weeklyPreviewData: store.notifications.weeklyPreviewData || null,
      showWeeklyPreview: !!store.notifications.showWeeklyPreview,
      lastWeeklyPreviewWeek: store.notifications.lastWeeklyPreviewWeek || 0
    },
    rag: {
      summaries: store.rag.summaries || [],
      persistentFacts: store.rag.persistentFacts || []
    }
  }
}

/**
 * 将 GameStateData（分层格式）恢复到 store 的 this 上下文
 * 替代之前在 snapshotActions.restoreGameState 中手动逐字段赋值的逻辑
 */
export function applyGameStateToStore(store: any, data: any, defaults: any) {
  // 自动迁移旧格式
  const state = isLegacyGameState(data) ? migrateGameStateData(data) : data

  // ── meta ──
  if (state.meta?.currentRunId != null) store.meta.currentRunId = state.meta.currentRunId
  if (state.meta?.currentFloor != null) store.meta.currentFloor = state.meta.currentFloor
  if (state.meta?._lastBaseFloor != null) store.meta._lastBaseFloor = state.meta._lastBaseFloor

  // ── player ──
  const defaultPlayer = defaults.player
  store.player = { ...defaultPlayer, ...state.player }
  // 深度合并关键对象
  if (state.player?.partTimeJob) {
    store.player.partTimeJob = { ...defaultPlayer.partTimeJob, ...state.player.partTimeJob }
  }
  if (state.player?.forum) {
    store.player.forum = { ...defaultPlayer.forum, ...state.player.forum }
  }
  if (state.player?.social) {
    store.player.social = { ...defaultPlayer.social, ...state.player.social }
  }
  if (!store.player.role) {
    store.player.role = defaultPlayer.role
  }
  if (!store.player.summaries) {
    store.player.summaries = []
  }

  // ── world ──
  if (state.world) {
    store.world.npcs = state.world.npcs || []
    store.world.gameTime = state.world.gameTime || defaults.world.gameTime
    if (state.world.npcRelationships) {
      store.world.npcRelationships = state.world.npcRelationships
    }
    if (state.world.worldState) store.world.worldState = state.world.worldState
    if (state.world.allClassData) store.world.allClassData = state.world.allClassData
    if (state.world.allClubs) store.world.allClubs = state.world.allClubs
    if (state.world.graduatedNpcs !== undefined) store.world.graduatedNpcs = state.world.graduatedNpcs || []
    if (state.world.lastAcademicYear !== undefined) store.world.lastAcademicYear = state.world.lastAcademicYear || 0
    if (state.world.characterNotes !== undefined) store.world.characterNotes = state.world.characterNotes || {}
  }

  // ── academic ──
  if (state.academic) {
    if (state.academic.examHistory !== undefined) store.academic.examHistory = state.academic.examHistory || []
    store.academic.lastExamDate = state.academic.lastExamDate ?? null
    store.academic.electiveAcademicData = state.academic.electiveAcademicData || {}
    store.academic.npcElectiveSelections = state.academic.npcElectiveSelections || {}
    if (state.academic.customCoursePool !== undefined) store.academic.customCoursePool = state.academic.customCoursePool ?? null
  }

  // ── events ──
  if (state.events) {
    store.events.checks = state.events.checks || { lastDaily: '', lastWeekly: '', lastMonthly: '' }
    store.events.clubApplication = state.events.clubApplication || null
    store.events.clubRejection = state.events.clubRejection || null
    store.events.clubInvitation = state.events.clubInvitation || null
    // library 和 triggers 是运行时数据，不从存档恢复
  }

  // ── notifications ──
  if (state.notifications) {
    store.notifications.completedTodoMarkers = state.notifications.completedTodoMarkers || []
    store.notifications.todoMatchingMode = state.notifications.todoMatchingMode || 'keyword'
    store.notifications.todoMatchingStats = state.notifications.todoMatchingStats || { keyword: { success: 0, total: 0 }, index: { success: 0, total: 0 } }
    store.notifications.unviewedExamIds = state.notifications.unviewedExamIds || []
    store.notifications.lastViewedWeeklyPreview = state.notifications.lastViewedWeeklyPreview || 0
    store.notifications.viewedClubIds = state.notifications.viewedClubIds || []
    store.notifications.weeklySnapshot = state.notifications.weeklySnapshot || null
    store.notifications.weeklyPreviewData = state.notifications.weeklyPreviewData || null
    store.notifications.showWeeklyPreview = !!state.notifications.showWeeklyPreview
    store.notifications.lastWeeklyPreviewWeek = state.notifications.lastWeeklyPreviewWeek || 0
  }

  // ── rag ──
  if (state.rag) {
    if (Array.isArray(state.rag.summaries)) store.rag.summaries = state.rag.summaries
    if (Array.isArray(state.rag.persistentFacts)) store.rag.persistentFacts = state.rag.persistentFacts
  }
}
