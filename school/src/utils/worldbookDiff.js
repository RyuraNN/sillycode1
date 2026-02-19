/**
 * 世界书同步 - diff 算法 + 合并写回逻辑
 */

import {
  fetchClassDataFromWorldbook,
  fetchClubDataFromWorldbook,
  fetchAcademicDataFromWorldbook,
  updateClassDataInWorldbook,
  createClubInWorldbook,
  updateAcademicDataInWorldbook
} from './worldbookParser'
import {
  getCoursePoolState,
  loadCoursePoolFromWorldbook,
  restoreCoursePoolState,
  saveCoursePoolToWorldbook
} from '../data/coursePoolData'
import { isWorldbookAvailable } from './worldbookHelper'
import { useGameStore } from '../stores/gameStore'

// ==================== 工具函数 ====================

/**
 * 深比较两个值
 */
function isEqual(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return JSON.stringify(a) === JSON.stringify(b)
  }
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/**
 * 将值转为用户可读字符串
 */
export function formatValueForDisplay(val) {
  if (val == null || val === '') return '（无）'
  if (Array.isArray(val)) {
    if (val.length === 0) return '（空列表）'
    return val.join('、')
  }
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

// ==================== diff 函数 ====================

/**
 * 提取名字数组并排序（用于比较 teachers/students）
 */
function extractNames(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean).sort()
}

/**
 * 班级数据 diff
 */
export function diffClasses(currentClassData, wbClassData) {
  const diffs = []
  if (!currentClassData && !wbClassData) return diffs

  const current = currentClassData || {}
  const wb = wbClassData || {}
  const allIds = new Set([...Object.keys(current), ...Object.keys(wb)])

  for (const classId of allIds) {
    const cur = current[classId]
    const wbC = wb[classId]
    const label = (cur?.name || wbC?.name || classId)

    // 整体新增/删除
    if (!cur && wbC) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: '_entire', fieldLabel: '整个班级（世界书新增）', current: null, worldbook: wbC, choice: 'worldbook' })
      continue
    }
    if (cur && !wbC) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: '_entire', fieldLabel: '整个班级（世界书已删除）', current: cur, worldbook: null, choice: 'current' })
      continue
    }

    // 班级名称
    if (cur.name !== wbC.name) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: 'name', fieldLabel: '班级名称', current: cur.name, worldbook: wbC.name, choice: 'worldbook' })
    }

    // 班主任
    const curHT = cur.headTeacher?.name || ''
    const wbHT = wbC.headTeacher?.name || ''
    if (curHT !== wbHT) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: 'headTeacher', fieldLabel: '班主任', current: curHT, worldbook: wbHT, choice: 'worldbook' })
    }

    // 任课教师
    const curTeachers = extractNames(cur.teachers)
    const wbTeachers = extractNames(wbC.teachers)
    if (!isEqual(curTeachers, wbTeachers)) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: 'teachers', fieldLabel: '任课教师', current: curTeachers, worldbook: wbTeachers, choice: 'worldbook' })
    }

    // 学生列表
    const curStudents = extractNames(cur.students)
    const wbStudents = extractNames(wbC.students)
    if (!isEqual(curStudents, wbStudents)) {
      diffs.push({ category: 'classes', entityId: classId, entityLabel: label, field: 'students', fieldLabel: '学生列表', current: curStudents, worldbook: wbStudents, choice: 'worldbook' })
    }
  }

  return diffs
}

/**
 * 社团数据 diff
 */
export function diffClubs(currentClubs, wbClubs) {
  const diffs = []
  if (!currentClubs && !wbClubs) return diffs

  const current = currentClubs || {}
  const wb = wbClubs || {}
  const allIds = new Set([...Object.keys(current), ...Object.keys(wb)])

  const clubFields = [
    { key: 'name', label: '社团名称' },
    { key: 'advisor', label: '顾问' },
    { key: 'president', label: '社长' },
    { key: 'description', label: '描述' },
    { key: 'activityDay', label: '活动日' }
  ]

  for (const clubId of allIds) {
    const cur = current[clubId]
    const wbC = wb[clubId]
    const label = (cur?.name || wbC?.name || clubId)

    if (!cur && wbC) {
      diffs.push({ category: 'clubs', entityId: clubId, entityLabel: label, field: '_entire', fieldLabel: '整个社团（世界书新增）', current: null, worldbook: wbC, choice: 'worldbook' })
      continue
    }
    if (cur && !wbC) {
      diffs.push({ category: 'clubs', entityId: clubId, entityLabel: label, field: '_entire', fieldLabel: '整个社团（世界书已删除）', current: cur, worldbook: null, choice: 'current' })
      continue
    }

    for (const { key, label: fLabel } of clubFields) {
      const cv = cur[key] || ''
      const wv = wbC[key] || ''
      if (String(cv) !== String(wv)) {
        diffs.push({ category: 'clubs', entityId: clubId, entityLabel: label, field: key, fieldLabel: fLabel, current: cv, worldbook: wv, choice: 'worldbook' })
      }
    }

    // members 比较
    const curMembers = Array.isArray(cur.members) ? [...cur.members].sort() : []
    const wbMembers = Array.isArray(wbC.members) ? [...wbC.members].sort() : []
    if (!isEqual(curMembers, wbMembers)) {
      diffs.push({ category: 'clubs', entityId: clubId, entityLabel: label, field: 'members', fieldLabel: '社员列表', current: curMembers, worldbook: wbMembers, choice: 'worldbook' })
    }
  }

  return diffs
}

/**
 * 学力数据 diff
 */
export function diffAcademic(currentNpcs, wbAcademic) {
  const diffs = []
  if (!currentNpcs || !wbAcademic) return diffs

  // 构建当前 NPC 学力索引
  const currentMap = {}
  for (const npc of currentNpcs) {
    if (!npc.name) continue
    const ap = npc.academicProfile
    if (ap && typeof ap === 'object') {
      currentMap[npc.name] = { level: ap.level || 'avg', potential: ap.potential || 'medium', traits: ap.traits || [] }
    } else if (npc.academicStats) {
      currentMap[npc.name] = { level: 'avg', potential: npc.academicStats.overallPotential || 'medium', traits: npc.academicStats.traits || [] }
    }
  }

  // 只比较两边都有的 NPC
  for (const name of Object.keys(wbAcademic)) {
    if (!currentMap[name]) continue
    const cur = currentMap[name]
    const wb = wbAcademic[name]

    if (cur.level !== wb.level) {
      diffs.push({ category: 'academic', entityId: name, entityLabel: name, field: 'level', fieldLabel: '学力等级', current: cur.level, worldbook: wb.level, choice: 'worldbook' })
    }
    if (cur.potential !== wb.potential) {
      diffs.push({ category: 'academic', entityId: name, entityLabel: name, field: 'potential', fieldLabel: '潜力', current: cur.potential, worldbook: wb.potential, choice: 'worldbook' })
    }
    const curTraits = [...(cur.traits || [])].sort()
    const wbTraits = [...(wb.traits || [])].sort()
    if (!isEqual(curTraits, wbTraits)) {
      diffs.push({ category: 'academic', entityId: name, entityLabel: name, field: 'traits', fieldLabel: '特征', current: curTraits, worldbook: wbTraits, choice: 'worldbook' })
    }
  }

  return diffs
}

/**
 * 课程池 diff（整体级别）
 */
export function diffCoursePool(currentState, wbState) {
  const diffs = []
  if (!currentState || !wbState) return diffs

  const curStr = JSON.stringify(currentState)
  const wbStr = JSON.stringify(wbState)

  if (curStr !== wbStr) {
    diffs.push({
      category: 'coursePool',
      entityId: 'coursePool',
      entityLabel: '课程池',
      field: '_entire',
      fieldLabel: '课程池数据',
      current: '当前内存版本',
      worldbook: '世界书版本',
      choice: 'worldbook'
    })
  }

  return diffs
}

// ==================== 拉取 + 对比 ====================

/**
 * 拉取世界书最新数据并与内存数据逐字段对比
 * @returns {Promise<{ diffs: DiffItem[], error?: string }>}
 */
export async function fetchAndDiffAll() {
  if (!isWorldbookAvailable()) {
    return { diffs: [], error: '世界书 API 不可用，请确认在 SillyTavern 环境中运行。' }
  }

  const gameStore = useGameStore()
  const errors = []
  let allDiffs = []

  try {
    // 并行拉取班级、社团、学力
    const [wbClassData, wbClubs, wbAcademic] = await Promise.all([
      fetchClassDataFromWorldbook().catch(e => { errors.push('班级: ' + e.message); return null }),
      fetchClubDataFromWorldbook(gameStore.currentRunId).catch(e => { errors.push('社团: ' + e.message); return null }),
      fetchAcademicDataFromWorldbook().catch(e => { errors.push('学力: ' + e.message); return null })
    ])

    // 班级 diff
    if (wbClassData) {
      allDiffs.push(...diffClasses(gameStore.allClassData, wbClassData))
    }

    // 社团 diff
    if (wbClubs) {
      allDiffs.push(...diffClubs(gameStore.allClubs, wbClubs))
    }

    // 学力 diff
    if (wbAcademic) {
      allDiffs.push(...diffAcademic(gameStore.npcs, wbAcademic))
    }

    // 课程池 diff（需要特殊处理：先快照 → 加载世界书版 → 对比 → 恢复）
    try {
      const currentSnapshot = JSON.parse(JSON.stringify(getCoursePoolState()))
      const loaded = await loadCoursePoolFromWorldbook(gameStore.currentRunId)
      if (loaded) {
        const wbSnapshot = JSON.parse(JSON.stringify(getCoursePoolState()))
        restoreCoursePoolState(currentSnapshot)
        allDiffs.push(...diffCoursePool(currentSnapshot, wbSnapshot))
      }
    } catch (e) {
      errors.push('课程池: ' + e.message)
    }

    const error = errors.length > 0 ? '部分数据拉取失败: ' + errors.join('; ') : undefined
    return { diffs: allDiffs, error }

  } catch (e) {
    return { diffs: [], error: '拉取世界书数据失败: ' + e.message }
  }
}

// ==================== 合并写回 ====================

/**
 * 将用户选择的合并结果写入 gameStore 和世界书
 * @param {DiffItem[]} resolvedDiffs 已选择的差异列表
 */
export async function applyResolvedDiffs(resolvedDiffs) {
  const gameStore = useGameStore()

  // 按 category 分组
  const grouped = {}
  for (const d of resolvedDiffs) {
    if (!grouped[d.category]) grouped[d.category] = []
    grouped[d.category].push(d)
  }

  // ---- 班级 ----
  if (grouped.classes) {
    const affectedClassIds = new Set()
    for (const d of grouped.classes) {
      const val = d.choice === 'worldbook' ? d.worldbook : d.current
      if (!gameStore.allClassData) gameStore.allClassData = {}

      if (d.field === '_entire') {
        if (val === null) {
          delete gameStore.allClassData[d.entityId]
        } else {
          gameStore.allClassData[d.entityId] = JSON.parse(JSON.stringify(val))
        }
      } else if (gameStore.allClassData[d.entityId]) {
        const cls = gameStore.allClassData[d.entityId]
        if (d.field === 'headTeacher') {
          if (!cls.headTeacher) cls.headTeacher = {}
          cls.headTeacher.name = val
        } else if (d.field === 'teachers' || d.field === 'students') {
          // val 是名字数组，需要重建对象数组（保留已有对象的其他字段）
          const existing = Array.isArray(cls[d.field]) ? cls[d.field] : []
          const existingMap = {}
          existing.forEach(item => { if (item.name) existingMap[item.name] = item })
          cls[d.field] = val.map(name => existingMap[name] || { name, gender: 'unknown', origin: '未知', role: d.field === 'teachers' ? 'teacher' : 'student' })
        } else {
          cls[d.field] = val
        }
      }
      affectedClassIds.add(d.entityId)
    }
    // 写回世界书
    for (const classId of affectedClassIds) {
      if (gameStore.allClassData[classId]) {
        await updateClassDataInWorldbook(classId, gameStore.allClassData[classId], true)
      }
    }
  }

  // ---- 社团 ----
  if (grouped.clubs) {
    const affectedClubIds = new Set()
    for (const d of grouped.clubs) {
      const val = d.choice === 'worldbook' ? d.worldbook : d.current
      if (!gameStore.allClubs) gameStore.allClubs = {}

      if (d.field === '_entire') {
        if (val === null) {
          delete gameStore.allClubs[d.entityId]
        } else {
          gameStore.allClubs[d.entityId] = JSON.parse(JSON.stringify(val))
        }
      } else if (gameStore.allClubs[d.entityId]) {
        gameStore.allClubs[d.entityId][d.field] = Array.isArray(val) ? [...val] : val
      }
      affectedClubIds.add(d.entityId)
    }
    for (const clubId of affectedClubIds) {
      if (gameStore.allClubs[clubId]) {
        await createClubInWorldbook(gameStore.allClubs[clubId], gameStore.currentRunId)
      }
    }
  }

  // ---- 学力 ----
  if (grouped.academic) {
    const affectedNpcs = new Set()
    for (const d of grouped.academic) {
      const val = d.choice === 'worldbook' ? d.worldbook : d.current
      const npc = gameStore.npcs.find(n => n.name === d.entityId)
      if (!npc) continue

      // 确保 academicProfile 是对象
      if (!npc.academicProfile || typeof npc.academicProfile === 'string') {
        npc.academicProfile = { level: 'avg', potential: 'medium', traits: [] }
      }
      if (d.field === 'level') npc.academicProfile.level = val
      else if (d.field === 'potential') npc.academicProfile.potential = val
      else if (d.field === 'traits') npc.academicProfile.traits = Array.isArray(val) ? [...val] : []

      affectedNpcs.add(d.entityId)
    }
    // 收集所有有学力数据的学生，批量写回
    if (affectedNpcs.size > 0) {
      const studentsForWb = gameStore.npcs
        .filter(n => n.academicProfile && typeof n.academicProfile === 'object')
        .map(n => ({ name: n.name, academicProfile: n.academicProfile }))
      await updateAcademicDataInWorldbook(studentsForWb)
    }
  }

  // ---- 课程池 ----
  if (grouped.coursePool) {
    const d = grouped.coursePool[0]
    if (d.choice === 'worldbook') {
      await loadCoursePoolFromWorldbook(gameStore.currentRunId)
      await saveCoursePoolToWorldbook()
    } else {
      await saveCoursePoolToWorldbook()
    }
  }
}
