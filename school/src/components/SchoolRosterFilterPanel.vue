/<!-- 重构后的主组件 - 名册筛选面板容器 -->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useRosterData } from '../composables/useRosterData'
import { useCharacterPool } from '../composables/useCharacterPool'
import { useBatchComplete } from '../composables/useBatchComplete'
import { useAIImport } from '../composables/useAIImport'
import { useAutoClubGenerate } from '../composables/useAutoClubGenerate'
import { saveRosterBackup, saveFullCharacterPool, getSnapshotData, saveSnapshotData } from '../utils/indexedDB'
import { updateClassDataInWorldbook, updateAcademicDataInWorldbook, updateTagDataInWorldbook, updateStaffRosterInWorldbook, ensureClubExistsInWorldbook, syncClubWorldbookState, createClubInWorldbook, addNpcToClubInWorldbook, batchUpdateClubsInWorldbook, removeClubFromWorldbook } from '../utils/worldbookParser'
import { saveSocialData } from '../utils/socialRelationshipsWorldbook'
import { saveImpressionDataImmediate } from '../utils/impressionWorldbook'
import { getRelationship, setRelationship, removeRelationship, removeCharacter as removeCharacterFromRelations, flushPendingSocialData } from '../utils/relationshipManager'
import { RELATIONSHIP_GROUPS } from '../data/relationshipData'

// 导入子组件
import BatchCompleteModal from './BatchCompleteModal.vue'
import AIImportModal from './AIImportModal.vue'
import CharacterEditor from './CharacterEditor.vue'
import CharacterEditModal from './CharacterEditModal.vue'
import ClassComposer from './ClassComposer.vue'
import RosterFilterView from './RosterFilterView.vue'
import TeacherView from './TeacherView.vue'
import TeacherEditModal from './TeacherEditModal.vue'
import MessageModal from './MessageModal.vue'
import MapEditorPanel from './MapEditorPanel.vue'
import WorldbookSyncPanel from './WorldbookSyncPanel.vue'
import ClubEditorPanel from './ClubEditorPanel.vue'
import ClubEditModal from './ClubEditModal.vue'
import RelationshipEditorPanel from './RelationshipEditorPanel.vue'
import RelationshipEditModal from './RelationshipEditModal.vue'
import AutoSchedulePanel from './AutoSchedulePanel.vue'
import { getItem } from '../data/mapData'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// ==================== Composables ====================
const {
  loading,
  fullRosterSnapshot,
  currentRosterState,
  originGroups,
  loadData,
  getCleanOrigin,
  getStudentClubs
} = useRosterData()

const {
  characterPool,
  loadCharacterPool,
  saveCharacterPool,
  syncCharacterPoolToSnapshot,
  deepClone
} = useCharacterPool()

const {
  batchProcessing,
  batchProgress,
  batchResults,
  batchResumeIndex,
  startBatchProcess,
  applyBatchChanges
} = useBatchComplete()

const {
  aiImportLoading,
  aiImportError,
  aiImportEntries,
  aiImportResults,
  submitAIImport,
  resetAIImport
} = useAIImport()

const {
  generating: clubGenerating,
  clubResults: clubGenResults,
  clubAdditions: clubGenAdditions,
  clubError: clubGenError,
  progress: clubGenProgress,
  newAdvisors: clubNewAdvisors,
  generateClubs,
  applyClubResults: applyGeneratedClubs,
  resetClubs: resetGeneratedClubs,
  detectGhostMembers,
  deduplicateClubMembers,
  clearAllClubMembers
} = useAutoClubGenerate()

// ==================== 状态管理 ====================
const activeTab = ref('filter') // 'filter' | 'composer' | 'characterEditor' | 'clubEditor' | 'relationshipEditor' | 'autoSchedule'
const filterSubTab = ref('student') // 'student' | 'teacher' | 'external'
const saving = ref(false)
const isLocked = ref(false)

// 地图编辑器（新建班级选教室）
const showMapEditor = ref(false)
const pendingNewClassId = ref('')

// 新建班级表单
const showNewClassForm = ref(false)
const newClassForm = ref({ id: '', name: '' })

// 消息模态框
const showMessageModal = ref(false)
const messageContent = ref('')

// 筛选面板状态
const searchQuery = ref('')
const expandedWorks = ref({})
const showFilters = ref(false)
const clubFilter = ref('')
const electiveFilter = ref('')
const genderFilter = ref('')

// 教师视图状态
const teacherViewMode = ref('work')
const expandedTeacherGroups = ref({})
const showTeacherEditor = ref(false)
const editingTeacher = ref(null)
const teacherEditForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  classAssignments: [{ classId: '', isHomeroom: false, subject: '' }],
  personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
  notes: ''
})

// 班级组合器状态
const selectedPreset = ref('default')
const composerTargetClass = ref('')
const composerClassData = ref({})
const availableCharacters = ref([])
const composerSearchQuery = ref('')
const composerRoleFilter = ref('all')
const composerWorkFilter = ref('')
const composerShowUnassigned = ref(false)
const composerShowInRoster = ref(false)
const composerShowUserCreated = ref(false)
const composerGroupView = ref(true)

// 角色编辑器状态
const showCharacterEditor = ref(false)
const editingCharacter = ref(null)
const characterEditForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  classId: '',
  role: 'student',
  subject: '',
  isHeadTeacher: false,
  assignments: [],
  electivePreference: 'general',
  scheduleTag: '',
  staffTitle: '',
  workplace: '',
  grade: undefined,
  notes: '',
  personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
  academicProfile: { level: 'avg', potential: 'medium', traits: [] }
})
const charEditorSearchQuery = ref('')
const charEditorRoleFilter = ref('all')
const charEditorWorkFilter = ref('')

// 社团编辑器状态
const showClubEditor = ref(false)
const editingClub = ref(null)
const deletedClubs = ref([])  // 回收站
const clubEditForm = ref({
  name: '', description: '', coreSkill: '',
  activityDay: '', location: '', advisor: '',
  president: '', vicePresident: '',
  mode: 'normal',
  customId: ''
})
const mapEditorContext = ref('class') // 'class' | 'club' | 'external_workplace' | 'auto_schedule_workplace'

// 自动排班地点解析状态
const pendingLocationResolve = ref(null)
const autoScheduleResolvedLocation = ref(null)

// 关系编辑器状态
const showRelationshipEditor = ref(false)
// 存档关系数据编辑状态
const snapshotRelSource = ref('') // 当前加载的存档 ID，空字符串表示使用当前运行时数据
const snapshotRelData = ref(null) // 缓存加载的完整存档数据（用于回写时保留其他字段）
const runtimeRelBackup = ref(null) // 加载存档前备份的运行时关系数据（用于恢复）
const isLoadingSnapshot = ref(false)
const editingRelSource = ref('')
const editingRelTarget = ref('')
const relationshipEditForm = ref({
  intimacy: 0, trust: 0, passion: 0, hostility: 0,
  groups: [], tags: []
})

const relationshipAvailableTargets = computed(() => {
  if (!editingRelSource.value || !gameStore.npcRelationships) return []
  const charData = gameStore.npcRelationships[editingRelSource.value]
  const existingTargets = new Set(Object.keys(charData?.relations || {}))
  return Object.keys(gameStore.npcRelationships)
    .filter(n => n !== editingRelSource.value && !existingTargets.has(n))
    .sort((a, b) => a.localeCompare(b, 'zh'))
})

const clubLocationName = computed(() => {
  const locId = clubEditForm.value.location
  if (!locId) return ''
  const item = getItem(locId)
  return item?.name || locId
})

// 批量补全状态
const showBatchCompleteModal = ref(false)
const batchSelection = ref({
  mode: 'missing_academic',
  targetClass: '',
  options: {
    academic: true,
    personality: true,
    relationships: true,
    overwrite: false
  }
})

// 各模式待补全角色数量
const candidateCounts = computed(() => {
  const pool = characterPool.value || []
  const roster = fullRosterSnapshot.value || {}

  const missingAcademic = pool.filter(c =>
    c.role === 'student' &&
    (!c.academicProfile || (c.academicProfile.level === 'avg' && c.academicProfile.potential === 'medium' && (!c.academicProfile.traits || c.academicProfile.traits.length === 0)))
  ).length

  const missingPersonality = pool.filter(c =>
    !c.personality || (c.personality.order === 0 && c.personality.altruism === 0 && c.personality.tradition === 0 && c.personality.peace === 50)
  ).length

  const classCounts = {}
  for (const [classId, classInfo] of Object.entries(roster)) {
    let count = 0
    if (classInfo.headTeacher?.name) count++
    if (Array.isArray(classInfo.teachers)) count += classInfo.teachers.length
    if (Array.isArray(classInfo.students)) count += classInfo.students.length
    classCounts[classId] = count
  }

  const unique = new Map()
  pool.forEach(c => { if (c.name) unique.set(c.name, c) })

  let byClassTotal = 0
  for (const count of Object.values(classCounts)) {
    byClassTotal += count
  }

  const externalCount = pool.filter(c => c.role === 'external').length

  return {
    missing_academic: missingAcademic,
    missing_personality: missingPersonality,
    external: externalCount,
    all: unique.size,
    classCounts,
    by_class: byClassTotal
  }
})

// AI导入状态
const showAIImportInput = ref(false)
const showAIImportResult = ref(false)
const importAllAsPending = ref(false)
const showWorldbookSync = ref(false)

// ==================== 辅助函数 ====================
const showMessage = (msg) => {
  messageContent.value = msg
  showMessageModal.value = true
}

// ==================== 存档关系数据编辑 ====================
const formatSnapshotTime = (snap) => {
  if (!snap.gameTime) return ''
  const t = snap.gameTime
  return `${t.year}/${t.month}/${t.day} ${t.hour}:00`
}

const getSnapshotLabel = (id) => {
  const snap = gameStore.saveSnapshots.find(s => s.id === id)
  return snap?.label || id
}

// 从备份恢复运行时关系数据，并重新写入 IndexedDB
const restoreRuntimeRelationships = async () => {
  if (runtimeRelBackup.value) {
    gameStore.npcRelationships = JSON.parse(JSON.stringify(runtimeRelBackup.value))
    runtimeRelBackup.value = null
    await flushPendingSocialData()
  }
  snapshotRelSource.value = ''
  snapshotRelData.value = null
}

// 从存档加载关系数据到当前编辑器
const loadRelationshipsFromSnapshot = async (snapshotId) => {
  if (!snapshotId) {
    await restoreRuntimeRelationships()
    showMessage('已恢复为当前运行时数据')
    return
  }
  isLoadingSnapshot.value = true
  try {
    const details = await getSnapshotData(snapshotId)
    if (!details?.gameState?.npcRelationships) {
      alert('该存档中没有关系数据')
      return
    }
    if (!snapshotRelSource.value && !runtimeRelBackup.value) {
      runtimeRelBackup.value = JSON.parse(JSON.stringify(gameStore.npcRelationships))
    }
    snapshotRelData.value = details
    gameStore.npcRelationships = JSON.parse(JSON.stringify(details.gameState.npcRelationships))
    snapshotRelSource.value = snapshotId
    showMessage('已加载存档关系数据，编辑后点击「保存到存档」回写')
  } catch (e) {
    console.error('[RelEditor] Load snapshot failed:', e)
    alert('加载存档失败: ' + e.message)
  } finally {
    isLoadingSnapshot.value = false
  }
}

// 将当前编辑的关系数据回写到来源存档
const saveRelationshipsToSnapshot = async () => {
  const sid = snapshotRelSource.value
  if (!sid || !snapshotRelData.value) return
  try {
    const updatedData = JSON.parse(JSON.stringify(snapshotRelData.value))
    updatedData.gameState.npcRelationships = JSON.parse(JSON.stringify(gameStore.npcRelationships))
    await saveSnapshotData(sid, updatedData)
    showMessage('✅ 关系数据已保存到存档。恢复该存档后，编辑将生效。')
  } catch (e) {
    console.error('[RelEditor] Save to snapshot failed:', e)
    alert('保存到存档失败: ' + e.message)
  }
}

// 放弃存档编辑，恢复运行时数据
const discardSnapshotEdit = async () => {
  await restoreRuntimeRelationships()
  showMessage('已恢复为当前运行时数据')
}

// 关闭面板时的安全检查
const handleClose = async () => {
  if (snapshotRelSource.value) {
    const choice = confirm('你正在编辑存档的关系数据，是否保存到存档？\n\n确定 = 保存后关闭\n取消 = 放弃修改并关闭')
    if (choice) {
      await saveRelationshipsToSnapshot()
    }
    await restoreRuntimeRelationships()
  }
  emit('close')
}

// 将面板编辑的关系数据同步回 [Social_Data] 世界书
async function syncRelationshipsToWorldbook() {
  const rels = gameStore.npcRelationships
  if (!rels) return
  const worldbookData = {}
  for (const [name, charData] of Object.entries(rels)) {
    worldbookData[name] = {
      personality: charData.personality,
      relationships: charData.relations,
      goals: charData.goals,
      priorities: charData.priorities
    }
  }
  await saveSocialData(worldbookData)
}

// ==================== 初始化 ====================
onMounted(async () => {
  await loadData()
  await loadCharacterPool(fullRosterSnapshot.value)
})

// ==================== 筛选逻辑 ====================
const availableClubs = computed(() => {
  const clubs = new Set()
  if (gameStore.allClubs) {
    Object.values(gameStore.allClubs).forEach(club => {
      if (club.name) clubs.add(club.name)
    })
  }
  return Array.from(clubs)
})

const filteredGroups = computed(() => {
  let result = originGroups.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    const filtered = {}

    for (const [workName, students] of Object.entries(originGroups.value)) {
      if (workName.toLowerCase().includes(query)) {
        filtered[workName] = students
        continue
      }

      const matchedStudents = students.filter(s => s.name.toLowerCase().includes(query))
      if (matchedStudents.length > 0) {
        filtered[workName] = matchedStudents
      }
    }
    result = filtered
  }

  if (clubFilter.value) {
    const filtered = {}
    for (const [workName, students] of Object.entries(result)) {
      const matchedStudents = students.filter(s =>
        s.clubs?.some(c => c.name === clubFilter.value)
      )
      if (matchedStudents.length > 0) {
        filtered[workName] = matchedStudents
      }
    }
    result = filtered
  }

  if (electiveFilter.value) {
    const filtered = {}
    for (const [workName, students] of Object.entries(result)) {
      const matchedStudents = students.filter(s => s.electivePref === electiveFilter.value)
      if (matchedStudents.length > 0) {
        filtered[workName] = matchedStudents
      }
    }
    result = filtered
  }

  if (genderFilter.value) {
    const filtered = {}
    for (const [workName, students] of Object.entries(result)) {
      const matchedStudents = students.filter(s => s.gender === genderFilter.value)
      if (matchedStudents.length > 0) {
        filtered[workName] = matchedStudents
      }
    }
    result = filtered
  }

  return result
})

const totalStats = computed(() => {
  let totalStudents = 0
  let selectedStudents = 0

  for (const [workName, students] of Object.entries(originGroups.value)) {
    totalStudents += students.length
    selectedStudents += students.reduce((sum, s) => {
      return sum + (currentRosterState.value[s.classId]?.[s.name] ? 1 : 0)
    }, 0)
  }

  return { total: totalStudents, selected: selectedStudents }
})

const getWorkStats = (workName) => {
  const students = filteredGroups.value[workName] || []
  const total = students.length
  const selected = students.reduce((sum, s) => {
    return sum + (currentRosterState.value[s.classId]?.[s.name] ? 1 : 0)
  }, 0)
  return { total, selected, all: total > 0 && total === selected, none: selected === 0 }
}

const toggleWork = (workName) => {
  const stats = getWorkStats(workName)
  const targetState = !stats.all

  const students = filteredGroups.value[workName] || []
  students.forEach(s => {
    if (!currentRosterState.value[s.classId]) currentRosterState.value[s.classId] = {}
    currentRosterState.value[s.classId][s.name] = targetState
  })
}

const toggleStudent = (student) => {
  if (!currentRosterState.value[student.classId]) {
    currentRosterState.value[student.classId] = {}
  }
  currentRosterState.value[student.classId][student.name] = !currentRosterState.value[student.classId][student.name]
}

const toggleWorkExpand = (workName) => {
  expandedWorks.value[workName] = !expandedWorks.value[workName]
}

const expandAllWorks = () => {
  const works = Object.keys(filteredGroups.value)
  const allExpanded = works.every(w => expandedWorks.value[w])
  const target = !allExpanded
  works.forEach(w => expandedWorks.value[w] = target)
}

// ==================== 教师视图 ====================
const processedTeacherGroups = computed(() => {
  const groups = {}

  if (teacherViewMode.value === 'class') {
    // 按班级分组
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      const className = classInfo.name || classId
      const teacherMap = new Map()

      if (classInfo.headTeacher?.name) {
        teacherMap.set(classInfo.headTeacher.name, {
          ...classInfo.headTeacher,
          classId,
          className,
          roles: ['班主任'],
          isHeadTeacher: true
        })
      }

      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => {
        if (!t.name) return
        if (teacherMap.has(t.name)) {
          const existing = teacherMap.get(t.name)
          if (t.subject && !existing.roles.includes(t.subject)) {
            existing.roles.push(t.subject)
          }
        } else {
          teacherMap.set(t.name, {
            ...t,
            classId,
            className,
            roles: [t.subject || '教师'],
            isHeadTeacher: false
          })
        }
      })

      if (teacherMap.size > 0) {
        groups[className] = Array.from(teacherMap.values()).map(t => ({
          ...t,
          displayRole: t.roles.join(' / ')
        }))
      }
    }
  } else {
    // 按作品分组
    const globalTeacherMap = new Map()

    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      const className = classInfo.name || classId

      const mergeToGlobal = (teacher, roleDesc, isHead = false) => {
        if (!teacher.name) return
        if (!globalTeacherMap.has(teacher.name)) {
          globalTeacherMap.set(teacher.name, {
            name: teacher.name,
            gender: teacher.gender || 'female',
            origin: teacher.origin || '未知',
            assignments: [],
            isHeadTeacher: false,
            classId: classId
          })
        }
        const entry = globalTeacherMap.get(teacher.name)
        if (isHead) entry.isHeadTeacher = true
        entry.assignments.push({ className, role: roleDesc, classId })
        if (teacher.origin && entry.origin === '未知') entry.origin = teacher.origin
      }

      if (classInfo.headTeacher?.name) {
        mergeToGlobal(classInfo.headTeacher, '班主任', true)
      }

      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => {
        mergeToGlobal(t, t.subject || '教师')
      })
    }

    for (const teacher of globalTeacherMap.values()) {
      const origin = getCleanOrigin(teacher.origin)
      if (!groups[origin]) groups[origin] = []
      groups[origin].push(teacher)
    }
  }

  const sortedGroups = {}
  Object.keys(groups).sort().forEach(key => {
    sortedGroups[key] = groups[key]
  })

  return sortedGroups
})

const toggleTeacherGroup = (groupName) => {
  expandedTeacherGroups.value[groupName] = !expandedTeacherGroups.value[groupName]
}

const expandAllTeachers = () => {
  const groups = Object.keys(processedTeacherGroups.value)
  const allExpanded = groups.every(g => expandedTeacherGroups.value[g])
  const target = !allExpanded
  groups.forEach(g => expandedTeacherGroups.value[g] = target)
}

// 监听教师分组变化，默认展开
watch(processedTeacherGroups, (newGroups) => {
  if (Object.keys(expandedTeacherGroups.value).length === 0) {
    Object.keys(newGroups).forEach(g => expandedTeacherGroups.value[g] = true)
  }
}, { immediate: true })

// ==================== 保存功能 ====================
const handleSave = async () => {
  if (saving.value) return
  saving.value = true

  try {
    // 1. 同步角色池到快照
    syncCharacterPoolToSnapshot(fullRosterSnapshot.value)

    // 2. 根据选中状态更新班级数据
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      const selectedStudents = students.filter(s =>
        currentRosterState.value[classId]?.[s.name]
      )
      classInfo.students = selectedStudents
    }

    // 3. 保存到本地数据库
    await saveRosterBackup(deepClone(fullRosterSnapshot.value))
    await saveCharacterPool()

    // 4. 同步到世界书
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      await updateClassDataInWorldbook(classId, classInfo, true, gameStore.currentRunId)
    }

    // 5. 同步学力数据
    const academicList = characterPool.value
      .filter(c => c.role === 'student' && c.academicProfile)
      .map(c => ({ name: c.name, academicProfile: c.academicProfile }))
    await updateAcademicDataInWorldbook(academicList)

    // 5.5. 同步标签数据（选课偏好 + 日程模板）
    await updateTagDataInWorldbook(fullRosterSnapshot.value)

    // 6. 同步性格数据
    const socialMap = {}
    characterPool.value.forEach(c => {
      if (c.personality) {
        socialMap[c.name] = { personality: c.personality }
      }
    })
    await saveSocialData(socialMap)

    // 7. 同步印象数据
    await saveImpressionDataImmediate()

    // 8. 更新游戏store
    gameStore.allClassData = deepClone(fullRosterSnapshot.value)

    showMessage('保存成功！数据已同步到世界书。')
  } catch (e) {
    console.error('[RosterFilter] Save error:', e)
    showMessage(`保存失败: ${e.message}`)
  } finally {
    saving.value = false
  }
}

// ==================== 角色编辑器功能 ====================

// 校外人员列表
const externalNpcs = computed(() => {
  return characterPool.value.filter(c => c.role === 'external')
})

const getLocationName = (workplace) => {
  const item = getItem(workplace)
  return item ? item.name : workplace
}

const handleAddExternal = () => {
  editingCharacter.value = null
  characterEditForm.value = {
    name: '',
    gender: 'female',
    origin: '',
    classId: '',
    role: 'external',
    subject: '',
    isHeadTeacher: false,
    assignments: [],
    electivePreference: 'general',
    scheduleTag: '',
    staffTitle: '',
    workplace: '',
    grade: undefined,
    notes: '',
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
    academicProfile: { level: 'avg', potential: 'medium', traits: [] }
  }
  showCharacterEditor.value = true
}

const handleAddCharacter = () => {
  editingCharacter.value = null
  characterEditForm.value = {
    name: '',
    gender: 'female',
    origin: '',
    classId: '',
    role: 'student',
    subject: '',
    isHeadTeacher: false,
    assignments: [],
    electivePreference: 'general',
    scheduleTag: '',
    staffTitle: '',
    workplace: '',
    grade: undefined,
    notes: '',
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
    academicProfile: { level: 'avg', potential: 'medium', traits: [] }
  }
  showCharacterEditor.value = true
}

const handleEditCharacter = (char) => {
  editingCharacter.value = char
  characterEditForm.value = {
    name: char.name,
    gender: char.gender || 'female',
    origin: char.origin || '',
    classId: char.classId || '',
    role: char.role || 'student',
    subject: char.subject || '',
    isHeadTeacher: char.isHeadTeacher || false,
    classAssignments: char.classAssignments || [],
    electivePreference: char.electivePreference || 'general',
    scheduleTag: char.scheduleTag || '',
    staffTitle: char.staffTitle || '',
    workplace: char.workplace || '',
    grade: char.grade,
    notes: char.notes || '',
    personality: char.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
    academicProfile: char.academicProfile || { level: 'avg', potential: 'medium', traits: [] }
  }
  showCharacterEditor.value = true
}

// 同步教师数据到班级 fullRosterSnapshot
const syncTeacherToClassData = (oldName, form) => {
  // 1. 清除旧记录
  if (oldName) {
    for (const [, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      if (classInfo.headTeacher?.name === oldName) {
        classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      if (Array.isArray(classInfo.teachers)) {
        classInfo.teachers = classInfo.teachers.filter(t => t.name !== oldName)
      }
    }
  }

  // 2. 写入新记录
  const assignments = form.classAssignments || []
  const validAssignments = assignments.filter(a => a.classId)

  if (validAssignments.length > 0) {
    for (const assignment of validAssignments) {
      const classData = fullRosterSnapshot.value[assignment.classId]
      if (!classData) continue

      if (assignment.isHomeroom) {
        classData.headTeacher = {
          name: form.name, gender: form.gender, origin: form.origin, role: 'teacher'
        }
      }
      if (assignment.subject || form.subject) {
        if (!Array.isArray(classData.teachers)) classData.teachers = []
        classData.teachers.push({
          name: form.name, gender: form.gender, origin: form.origin,
          subject: assignment.subject || form.subject, role: 'teacher'
        })
      }
    }
  } else if (form.subject) {
    // 兼容旧的单 classId + subject 模式
    if (form.classId) {
      const classData = fullRosterSnapshot.value[form.classId]
      if (classData) {
        if (form.isHeadTeacher) {
          classData.headTeacher = {
            name: form.name, gender: form.gender, origin: form.origin, role: 'teacher'
          }
        }
        if (!Array.isArray(classData.teachers)) classData.teachers = []
        classData.teachers.push({
          name: form.name, gender: form.gender, origin: form.origin,
          subject: form.subject, role: 'teacher'
        })
      }
    }
  }
}

const handleSaveCharacter = async () => {
  const form = characterEditForm.value

  if (editingCharacter.value) {
    // 编辑模式
    const oldName = editingCharacter.value.name
    const idx = characterPool.value.findIndex(c => c.name === oldName)
    if (idx !== -1) {
      // 保留 userCreated 标记，更新所有字段包括性格和备注
      characterPool.value[idx] = {
        ...form,
        userCreated: characterPool.value[idx].userCreated,
        personality: form.personality,
        notes: form.notes
      }
    }

    // 同步更新 fullRosterSnapshot 中的基本信息
    const oldClassId = editingCharacter.value.classId
    const newClassId = form.classId

    // 如果班级变更，从旧班级移除
    if (oldClassId && oldClassId !== newClassId) {
      const oldClass = fullRosterSnapshot.value[oldClassId]
      if (oldClass) {
        if (form.role === 'student' || editingCharacter.value.role === 'student') {
          if (Array.isArray(oldClass.students)) {
            oldClass.students = oldClass.students.filter(s => s.name !== oldName)
          }
        }
      }
      // 同步 gameStore.allClassData
      const gcdOld = gameStore.allClassData?.[oldClassId]
      if (gcdOld && Array.isArray(gcdOld.students)) {
        gcdOld.students = gcdOld.students.filter(s => s.name !== oldName)
      }
    }

    // 更新新班级中的角色数据
    if (newClassId) {
      const newClass = fullRosterSnapshot.value[newClassId]
      if (newClass && form.role === 'student') {
        if (!Array.isArray(newClass.students)) newClass.students = []
        const sIdx = newClass.students.findIndex(s => s.name === oldName || s.name === form.name)
        const studentData = { name: form.name, gender: form.gender, origin: form.origin, role: 'student' }
        if (sIdx !== -1) {
          Object.assign(newClass.students[sIdx], studentData)
        } else if (oldClassId !== newClassId) {
          newClass.students.push(studentData)
        }
      }
      // 同步 gameStore.allClassData
      const gcdNew = gameStore.allClassData?.[newClassId]
      if (gcdNew && form.role === 'student') {
        if (!Array.isArray(gcdNew.students)) gcdNew.students = []
        const gsIdx = gcdNew.students.findIndex(s => s.name === oldName || s.name === form.name)
        const studentData = { name: form.name, gender: form.gender, origin: form.origin, role: 'student' }
        if (gsIdx !== -1) {
          Object.assign(gcdNew.students[gsIdx], studentData)
        } else if (oldClassId !== newClassId) {
          gcdNew.students.push(studentData)
        }
      }
    }
  } else {
    // 添加模式
    if (characterPool.value.find(c => c.name === form.name)) {
      showMessage('角色名已存在')
      return
    }
    characterPool.value.push({ ...form, userCreated: true })
  }

  // 如果是教师，同步到班级数据
  if (form.role === 'teacher') {
    syncTeacherToClassData(editingCharacter.value?.name, form)
  }

  await saveCharacterPool()
  showCharacterEditor.value = false
  showMessage(editingCharacter.value ? '角色已更新' : '角色已添加')
}

const handleDeleteCharacter = async (char) => {
  if (!confirm(`确定要删除角色 ${char.name} 吗？`)) return

  // 如果是教师，从所有班级数据中清除
  if (char.role === 'teacher') {
    for (const [, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      if (classInfo.headTeacher?.name === char.name) {
        classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      if (Array.isArray(classInfo.teachers)) {
        classInfo.teachers = classInfo.teachers.filter(t => t.name !== char.name)
      }
    }
  }

  // 同时从 fullRosterSnapshot 中移除学生角色
  if (char.role === 'student' && char.classId) {
    const classInfo = fullRosterSnapshot.value[char.classId]
    if (classInfo && Array.isArray(classInfo.students)) {
      classInfo.students = classInfo.students.filter(s => s.name !== char.name)
    }
  }

  // 同步更新 gameStore.allClassData
  if (char.classId && gameStore.allClassData?.[char.classId]) {
    const gcd = gameStore.allClassData[char.classId]
    if (char.role === 'student' && Array.isArray(gcd.students)) {
      gcd.students = gcd.students.filter(s => s.name !== char.name)
    }
    if (char.role === 'teacher') {
      if (gcd.headTeacher?.name === char.name) {
        gcd.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      if (Array.isArray(gcd.teachers)) {
        gcd.teachers = gcd.teachers.filter(t => t.name !== char.name)
      }
    }
  }

  const idx = characterPool.value.findIndex(c => c.name === char.name)
  if (idx !== -1) {
    characterPool.value.splice(idx, 1)
    await saveCharacterPool()
    showMessage('角色已删除')
  }
}

// ==================== 教师编辑功能 ====================
const handleAddTeacher = () => {
  editingTeacher.value = null
  teacherEditForm.value = {
    name: '',
    gender: 'female',
    origin: '',
    classAssignments: [{ classId: '', isHomeroom: false, subject: '' }],
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
    notes: ''
  }
  showTeacherEditor.value = true
}

const handleEditTeacher = (teacher) => {
  editingTeacher.value = teacher

  // 从班级数据构建 classAssignments
  const assignments = []
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    const isHomeroom = classInfo.headTeacher?.name === teacher.name
    const teacherEntries = Array.isArray(classInfo.teachers)
      ? classInfo.teachers.filter(t => t.name === teacher.name)
      : []

    // 如果是班主任或有科任记录，添加该班级
    if (isHomeroom || teacherEntries.length > 0) {
      // 如果有多个科目，为每个科目创建一个条目
      if (teacherEntries.length > 0) {
        teacherEntries.forEach(entry => {
          assignments.push({
            classId,
            isHomeroom: isHomeroom && assignments.filter(a => a.classId === classId).length === 0, // 只在第一个条目标记班主任
            subject: entry.subject || ''
          })
        })
      } else if (isHomeroom) {
        // 只是班主任，没有科任
        assignments.push({
          classId,
          isHomeroom: true,
          subject: ''
        })
      }
    }
  }

  // 从角色池中获取性格和备注数据
  const poolChar = characterPool.value.find(c => c.name === teacher.name)

  teacherEditForm.value = {
    name: teacher.name || '',
    gender: teacher.gender || 'female',
    origin: teacher.origin || '',
    classAssignments: assignments.length > 0 ? assignments : [{ classId: '', isHomeroom: false, subject: '' }],
    personality: poolChar?.personality || teacher.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
    notes: poolChar?.notes || teacher.notes || ''
  }
  showTeacherEditor.value = true
}

const handleSaveTeacher = async () => {
  const form = teacherEditForm.value
  if (!form.name) {
    showMessage('请填写姓名')
    return
  }

  const validAssignments = form.classAssignments.filter(a => a.classId)
  if (validAssignments.length === 0) {
    showMessage('请至少分配一个班级')
    return
  }

  const oldName = editingTeacher.value?.name || ''

  // 1. 清除旧记录（所有班级）
  if (oldName) {
    for (const [, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      if (classInfo.headTeacher?.name === oldName) {
        classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      if (Array.isArray(classInfo.teachers)) {
        classInfo.teachers = classInfo.teachers.filter(t => t.name !== oldName)
      }
    }
  }

  // 2. 写入新记录
  for (const assignment of validAssignments) {
    const classData = fullRosterSnapshot.value[assignment.classId]
    if (!classData) continue

    // 班主任
    if (assignment.isHomeroom) {
      classData.headTeacher = {
        name: form.name, gender: form.gender, origin: form.origin, role: 'teacher'
      }
    }

    // 科任（无论是否班主任，只要有科目就加入 teachers 列表）
    if (assignment.subject) {
      if (!Array.isArray(classData.teachers)) classData.teachers = []
      classData.teachers.push({
        name: form.name, gender: form.gender, origin: form.origin,
        subject: assignment.subject, role: 'teacher'
      })
    }
  }

  // 3. 更新角色池中的性格和备注数据
  const poolCharIdx = characterPool.value.findIndex(c => c.name === form.name)
  if (poolCharIdx !== -1) {
    characterPool.value[poolCharIdx].personality = form.personality
    characterPool.value[poolCharIdx].notes = form.notes
  }

  showTeacherEditor.value = false
  await loadCharacterPool(fullRosterSnapshot.value)
  showMessage('教师信息已保存')
}

const handleDeleteTeacher = async (teacher) => {
  if (!confirm(`确定要删除教师 ${teacher.name} 吗？`)) return

  // 从所有班级中清除该教师
  for (const [, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classInfo.headTeacher?.name === teacher.name) {
      classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
    }
    if (Array.isArray(classInfo.teachers)) {
      classInfo.teachers = classInfo.teachers.filter(t => t.name !== teacher.name)
    }
  }

  await loadCharacterPool(fullRosterSnapshot.value)
  showMessage('教师已删除')
}

// ==================== 批量补全功能 ====================
const handleOpenBatchComplete = () => {
  if (!batchSelection.value.targetClass && Object.keys(fullRosterSnapshot.value).length > 0) {
    batchSelection.value.targetClass = Object.keys(fullRosterSnapshot.value)[0]
  }
  batchResults.value = []
  batchProgress.value = { current: 0, total: 0, status: '' }
  showBatchCompleteModal.value = true
}

const handleStartBatchProcess = async () => {
  const result = await startBatchProcess(batchSelection.value, fullRosterSnapshot.value, characterPool.value, 0)
  if (result.canResume) {
    const yes = confirm(`检测到上次未完成的批量补全进度（第 ${result.resumeIndex} 批），是否从断点继续？\n\n选择「确定」从断点继续，选择「取消」重新开始。`)
    if (yes) {
      await handleResumeBatchProcess()
    } else {
      localStorage.removeItem('batchProgress')
      batchResumeIndex.value = 0
      const retryResult = await startBatchProcess(batchSelection.value, fullRosterSnapshot.value, characterPool.value, 0)
      if (!retryResult.success && retryResult.message) {
        showMessage(retryResult.message)
      }
    }
  } else if (!result.success && result.message) {
    showMessage(result.message)
  }
}

const handleResumeBatchProcess = async () => {
  await startBatchProcess(batchSelection.value, fullRosterSnapshot.value, characterPool.value, batchResumeIndex.value)
}

const handleApplyBatchChanges = async () => {
  const appliedCount = applyBatchChanges(characterPool.value, batchSelection.value)

  syncCharacterPoolToSnapshot(fullRosterSnapshot.value)
  await saveFullCharacterPool(deepClone(characterPool.value))
  await saveRosterBackup(deepClone(fullRosterSnapshot.value))
  await handleSave()

  showBatchCompleteModal.value = false
  showMessage(`已成功更新 ${appliedCount} 个角色的数据并同步到世界书！`)
}

// ==================== AI导入功能 ====================
const handleOpenAIImport = () => {
  resetAIImport()
  showAIImportInput.value = true
}

const handleSubmitAIImport = async () => {
  const result = await submitAIImport()
  if (result.success) {
    showAIImportInput.value = false
    showAIImportResult.value = true
  }
}

const handleToggleAIChar = (index) => {
  aiImportResults.value.found[index].selected = !aiImportResults.value.found[index].selected
}

const handleToggleAIWorkChar = (workIndex, charIndex) => {
  aiImportResults.value.workResults[workIndex].characters[charIndex].selected =
    !aiImportResults.value.workResults[workIndex].characters[charIndex].selected
}

const handleAIDetailQuery = async () => {
  const selectedChars = []
  for (const work of aiImportResults.value.workResults) {
    if (!work.found) continue
    for (const char of work.characters) {
      if (char.selected) selectedChars.push({ work: work.work, character: char.name })
    }
  }
  if (selectedChars.length === 0) {
    aiImportError.value = '请至少选择一个角色'
    return
  }
  aiImportEntries.value = selectedChars
  await submitAIImport()
}

const handleConfirmAIImport = async () => {
  const selected = aiImportResults.value.found.filter(c => c.selected)
  if (selected.length === 0) {
    aiImportError.value = '请至少选择一个角色'
    return
  }

  let addedCount = 0
  let skippedCount = 0

  for (const char of selected) {
    if (characterPool.value.find(c => c.name === char.name)) {
      skippedCount++
      continue
    }

    let role = 'student'
    let staffTitle = ''
    let workplace = ''
    let grade = undefined

    if (char.roleSuggestion === 'staff') {
      role = 'staff'
      staffTitle = '职工'
    } else if (char.roleSuggestion === 'external') {
      role = 'external'
      staffTitle = char.staffTitle || '校外人员'
    } else if (char.roleSuggestion === 'teacher') {
      role = 'teacher'
    }

    if (importAllAsPending.value && role === 'student') {
      grade = 0
    }

    characterPool.value.push({
      name: char.name,
      gender: char.gender,
      origin: char.work || '',
      classId: '',
      role: role,
      staffTitle: staffTitle,
      workplace: workplace,
      subject: '',
      isHeadTeacher: false,
      grade: grade,
      electivePreference: char.electivePreference || 'general',
      scheduleTag: char.scheduleTag || '',
      personality: char.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
      academicProfile: char.academicProfile || { level: 'avg', potential: 'medium', traits: [] },
      userCreated: true
    })
    addedCount++
  }

  // 将新导入的角色初始化到 npcRelationships，使其在关系编辑器中可见
  if (addedCount > 0 && gameStore.npcRelationships) {
    for (const char of selected) {
      if (!gameStore.npcRelationships[char.name]) {
        gameStore.npcRelationships[char.name] = {
          gender: char.gender || 'unknown',
          personality: char.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
          goals: { immediate: '', shortTerm: '', longTerm: '' },
          priorities: { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 },
          relations: {}
        }
      }
    }
  }

  await saveFullCharacterPool(deepClone(characterPool.value))
  if (addedCount > 0) {
    await flushPendingSocialData()
  }
  showAIImportResult.value = false
  resetAIImport()
  const msg = `已导入 ${addedCount} 个角色` + (skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在角色` : '')
  showMessage(msg)
}

const handleCloseAIImport = () => {
  if (!aiImportLoading.value) {
    showAIImportInput.value = false
    showAIImportResult.value = false
  }
}

// ==================== 班级组合器功能 ====================
const handleInitComposer = async () => {
  if (characterPool.value.length === 0) {
    await loadCharacterPool(fullRosterSnapshot.value)
  }

  if (!composerTargetClass.value && Object.keys(fullRosterSnapshot.value).length > 0) {
    composerTargetClass.value = Object.keys(fullRosterSnapshot.value)[0]
  }
  loadComposerClassData()
}

const loadComposerClassData = () => {
  if (!composerTargetClass.value) return

  const source = fullRosterSnapshot.value[composerTargetClass.value]
  if (!source) return

  if (selectedPreset.value === 'blank') {
    composerClassData.value = {
      name: source.name,
      headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
      teachers: [],
      students: []
    }
  } else {
    composerClassData.value = JSON.parse(JSON.stringify(source))
  }

  updateAvailableCharacters()
}

const updateAvailableCharacters = () => {
  const currentMembers = new Set()

  if (composerClassData.value.headTeacher?.name) {
    currentMembers.add(composerClassData.value.headTeacher.name)
  }

  const composerTeachers = Array.isArray(composerClassData.value.teachers) ? composerClassData.value.teachers : []
  composerTeachers.forEach(t => {
    if (t.name) currentMembers.add(t.name)
  })

  const composerStudents = Array.isArray(composerClassData.value.students) ? composerClassData.value.students : []
  composerStudents.forEach(s => {
    if (s.name) currentMembers.add(s.name)
  })

  const assignmentMap = new Map()
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classId === composerTargetClass.value) continue

    if (classInfo.headTeacher?.name) {
      assignmentMap.set(classInfo.headTeacher.name, { classId, className: classInfo.name || classId })
    }

    const classTeachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
    classTeachers.forEach(t => {
      if (t.name) assignmentMap.set(t.name, { classId, className: classInfo.name || classId })
    })

    const classStudents = Array.isArray(classInfo.students) ? classInfo.students : []
    classStudents.forEach(s => {
      if (s.name) assignmentMap.set(s.name, { classId, className: classInfo.name || classId })
    })
  }

  availableCharacters.value = characterPool.value
    .filter(c => !currentMembers.has(c.name) || c.role === 'teacher')
    .map(c => {
      const assignment = assignmentMap.get(c.name)
      let inRoster = false
      for (const classId of Object.keys(currentRosterState.value)) {
        if (currentRosterState.value[classId]?.[c.name]) {
          inRoster = true
          break
        }
      }
      return {
        ...c,
        assignedTo: assignment ? assignment.className : null,
        isAssigned: !!assignment,
        inRoster
      }
    })
}

watch(composerTargetClass, () => {
  loadComposerClassData()
})

watch(selectedPreset, () => {
  loadComposerClassData()
})

watch(activeTab, (newTab) => {
  if (newTab === 'composer') {
    handleInitComposer()
  }
})

// 计算属性：可用作品列表
const composerAvailableWorks = computed(() => {
  const works = new Map()
  availableCharacters.value.forEach(c => {
    const work = getCleanOrigin(c.origin)
    if (!works.has(work)) works.set(work, 0)
    works.set(work, works.get(work) + 1)
  })
  return Array.from(works.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
})

// 计算属性：按作品分组的角色
const composerGroupedCharacters = computed(() => {
  const chars = availableCharacters.value
  const groups = {}
  chars.forEach(c => {
    const work = getCleanOrigin(c.origin)
    if (!groups[work]) groups[work] = []
    groups[work].push(c)
  })
  const sorted = {}
  Object.keys(groups)
    .sort((a, b) => groups[b].length - groups[a].length)
    .forEach(k => sorted[k] = groups[k])
  return sorted
})

// ==================== 班级组合器操作 ====================
const handleRemoveComposerHeadTeacher = () => {
  composerClassData.value.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
  updateAvailableCharacters()
}

const handleRemoveComposerTeacher = (idx) => {
  const teachers = composerClassData.value.teachers
  if (Array.isArray(teachers) && idx >= 0 && idx < teachers.length) {
    teachers.splice(idx, 1)
    updateAvailableCharacters()
  }
}

const handleRemoveComposerStudent = (idx) => {
  const students = composerClassData.value.students
  if (Array.isArray(students) && idx >= 0 && idx < students.length) {
    students.splice(idx, 1)
    updateAvailableCharacters()
  }
}

const removeCharFromOtherClass = (charName) => {
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classId === composerTargetClass.value) continue

    if (classInfo.headTeacher?.name === charName) {
      classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      return
    }

    if (Array.isArray(classInfo.teachers)) {
      const idx = classInfo.teachers.findIndex(t => t.name === charName)
      if (idx !== -1) { classInfo.teachers.splice(idx, 1); return }
    }

    if (Array.isArray(classInfo.students)) {
      const idx = classInfo.students.findIndex(s => s.name === charName)
      if (idx !== -1) { classInfo.students.splice(idx, 1); return }
    }
  }
}

const addCharToCurrentClass = (char) => {
  if (char.role === 'teacher') {
    if (char.isHeadTeacher && !composerClassData.value.headTeacher?.name) {
      composerClassData.value.headTeacher = {
        name: char.name, gender: char.gender || 'female',
        origin: char.origin || '', role: 'teacher'
      }
    } else {
      if (!Array.isArray(composerClassData.value.teachers)) composerClassData.value.teachers = []
      composerClassData.value.teachers.push({
        name: char.name, gender: char.gender || 'female',
        origin: char.origin || '', subject: char.subject || '', role: 'teacher'
      })
    }
  } else {
    if (!Array.isArray(composerClassData.value.students)) composerClassData.value.students = []
    composerClassData.value.students.push({
      name: char.name, gender: char.gender || 'female',
      origin: char.origin || '', role: char.role || 'student'
    })
  }
  updateAvailableCharacters()
}

const handleAddCharacterToClass = (char) => {
  if (char.isAssigned) {
    if (char.role === 'teacher') {
      // 教师允许同时在多个班级任教，直接添加，不从原班级移除
      addCharToCurrentClass(char)
      return
    }
    const yes = confirm(`「${char.name}」已在「${char.assignedTo}」中，是否将其从原班级移除并添加到当前班级？`)
    if (!yes) return
    removeCharFromOtherClass(char.name)
  }
  addCharToCurrentClass(char)
}

const handleAddClass = () => {
  newClassForm.value = { id: '', name: '' }
  showNewClassForm.value = true
}

const handleConfirmNewClass = () => {
  const id = newClassForm.value.id.trim()
  const name = newClassForm.value.name.trim() || id
  if (!id) return

  if (fullRosterSnapshot.value[id]) {
    showMessage(`班级「${id}」已存在，请换一个编号。`)
    return
  }

  fullRosterSnapshot.value[id] = {
    name,
    headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
    teachers: [],
    students: []
  }

  currentRosterState.value[id] = {}
  composerTargetClass.value = id
  loadComposerClassData()
  showNewClassForm.value = false

  // 打开地图编辑器让玩家选择/创建教室
  pendingNewClassId.value = id
  mapEditorContext.value = 'class'
  showMapEditor.value = true
}

const handleSetClassroom = () => {
  const classId = composerTargetClass.value
  if (!classId) {
    showMessage('请先选择一个班级。')
    return
  }
  pendingNewClassId.value = classId
  mapEditorContext.value = 'class'
  showMapEditor.value = true
}

const handleClassroomSelected = (location) => {
  const id = pendingNewClassId.value
  if (id && fullRosterSnapshot.value[id]) {
    fullRosterSnapshot.value[id].classroomId = location.id
    if (composerTargetClass.value === id) {
      composerClassData.value.classroomId = location.id
    }
  }
  showMapEditor.value = false
  pendingNewClassId.value = ''
  showMessage(`教室已设为「${location.name}」(${location.id})`)
}

const handleLocationSelected = (location) => {
  if (mapEditorContext.value === 'club') {
    clubEditForm.value.location = location.id
    showMapEditor.value = false
  } else if (mapEditorContext.value === 'external_workplace') {
    characterEditForm.value.workplace = location.id
    showMapEditor.value = false
  } else if (mapEditorContext.value === 'auto_schedule_workplace') {
    autoScheduleResolvedLocation.value = {
      ...pendingLocationResolve.value,
      resolvedId: location.id,
      resolvedName: location.name
    }
    pendingLocationResolve.value = null
    showMapEditor.value = false
  } else {
    handleClassroomSelected(location)
  }
}

const handleClubSelectLocation = () => {
  mapEditorContext.value = 'club'
  showMapEditor.value = true
}

const handleSelectWorkplace = () => {
  mapEditorContext.value = 'external_workplace'
  showMapEditor.value = true
}

const handleAutoScheduleResolveLocation = (loc) => {
  pendingLocationResolve.value = loc
  mapEditorContext.value = 'auto_schedule_workplace'
  showMapEditor.value = true
}

const handleMapEditorClose = () => {
  showMapEditor.value = false
  pendingNewClassId.value = ''
}

// ==================== 社团编辑器处理函数 ====================
const handleAddClub = () => {
  editingClub.value = null
  clubEditForm.value = {
    name: '', description: '', coreSkill: '',
    activityDay: '', location: '', advisor: '',
    president: gameStore.player?.name || '', vicePresident: '',
    mode: 'normal',
    customId: ''
  }
  showClubEditor.value = true
}

const handleEditClub = (club) => {
  editingClub.value = club
  clubEditForm.value = {
    name: club.name || '',
    description: club.description || '',
    coreSkill: club.coreSkill || '',
    activityDay: club.activityDay || '',
    location: club.location || '',
    advisor: club.advisor || '',
    president: Array.isArray(club.president) ? club.president.join(', ') : (club.president || ''),
    vicePresident: Array.isArray(club.vicePresident) ? club.vicePresident.join(', ') : (club.vicePresident || ''),
    mode: club.mode || (club.id === 'student_council' ? 'restricted' : 'normal'),
    customId: '',
    members: [...(club.members || [])]
  }
  showClubEditor.value = true
}

const handleSaveClub = async () => {
  const form = clubEditForm.value
  if (!form.name.trim()) {
    showMessage('请输入社团名称')
    return
  }
  if (editingClub.value) {
    // 编辑模式
    const clubId = editingClub.value.id
    const club = gameStore.allClubs[clubId]
    if (club) {
      Object.assign(club, {
        name: form.name, description: form.description,
        coreSkill: form.coreSkill, activityDay: form.activityDay,
        location: form.location, advisor: form.advisor,
        president: form.president, vicePresident: form.vicePresident,
        mode: form.mode,
        members: form.members || club.members || []
      })
      // 社团编辑器是游戏外管理工具，直接更新基础条目内容
      const updateResult = await batchUpdateClubsInWorldbook([club], null)
      if (updateResult === false) {
        console.warn('[handleSaveClub] batchUpdateClubsInWorldbook failed for club:', clubId)
        showMessage('社团已更新（世界书同步失败，请检查是否已绑定主世界书）')
      } else {
        showMessage('社团已更新')
      }
      await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
    }
  } else if (form.customId?.trim()) {
    // 自定义ID新建 — 直接写入 allClubs
    const clubId = form.customId.trim()
    if (gameStore.allClubs[clubId]) {
      showMessage(`社团ID「${clubId}」已存在`)
      return
    }
    const newClub = {
      id: clubId,
      name: form.name, description: form.description,
      coreSkill: form.coreSkill, activityDay: form.activityDay,
      location: form.location, advisor: form.advisor,
      president: form.president || gameStore.player?.name || '',
      vicePresident: form.vicePresident,
      members: [gameStore.player?.name || ''],
      mode: form.mode
    }
    gameStore.allClubs[clubId] = newClub
    if (!gameStore.player.joinedClubs.includes(clubId)) {
      gameStore.player.joinedClubs.push(clubId)
    }
    await ensureClubExistsInWorldbook(newClub, null, gameStore.settings?.useGeminiMode)
    await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
    gameStore.saveToStorage(true)
    showMessage('社团已创建')
  } else {
    // 自动ID新建 — 走原有 createClub
    const result = await gameStore.createClub({
      name: form.name, description: form.description,
      coreSkill: form.coreSkill, activityDay: form.activityDay,
      location: form.location, advisor: form.advisor
    })
    if (result?.clubId) {
      const newClub = gameStore.allClubs[result.clubId]
      if (newClub) {
        newClub.mode = form.mode
        if (form.mode !== 'normal') {
          await ensureClubExistsInWorldbook(newClub, null, gameStore.settings?.useGeminiMode)
          await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
        }
      }
    }
    showMessage('社团已创建')
  }
  showClubEditor.value = false
}

const handleDeleteClub = async (clubId) => {
  const club = gameStore.allClubs[clubId]
  if (!club) return
  // 移入回收站
  deletedClubs.value.push({ id: clubId, name: club.name || clubId, data: { ...club } })

  // 使用 Vue 3 响应式方式删除属性（解构赋值）
  const { [clubId]: removed, ...rest } = gameStore.allClubs
  gameStore.allClubs = rest

  if (gameStore.player?.joinedClubs) {
    const idx = gameStore.player.joinedClubs.indexOf(clubId)
    if (idx !== -1) gameStore.player.joinedClubs.splice(idx, 1)
  }
  // 禁用世界书条目（不删除，恢复时可重新启用）
  const removeResult = await removeClubFromWorldbook(clubId)
  if (removeResult === false) {
    console.warn('[handleDeleteClub] removeClubFromWorldbook failed for club:', clubId)
    showMessage('社团已删除（世界书同步失败，请检查是否已绑定主世界书）')
  }
  gameStore.saveToStorage(true)
}

const handleRestoreClub = async (clubId) => {
  const idx = deletedClubs.value.findIndex(c => c.id === clubId)
  if (idx === -1) return
  const restored = deletedClubs.value.splice(idx, 1)[0]
  if (!gameStore.allClubs) gameStore.allClubs = {}
  gameStore.allClubs[clubId] = restored.data
  await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
  gameStore.saveToStorage(true)
}

const handleConfirmDelete = async (clubId) => {
  const idx = deletedClubs.value.findIndex(c => c.id === clubId)
  if (idx === -1) return
  const club = deletedClubs.value.splice(idx, 1)[0]
  await removeClubFromWorldbook(clubId, true)  // permanent=true，真正删除条目
  gameStore.saveToStorage(true)
  showMessage(`社团"${club.name}"已永久删除`)
}

// AI自动生成社团
async function handleAutoGenerateClubs(mode, options = {}) {
  const pool = characterPool.value || []

  // 根据筛选条件过滤角色
  let filteredPool = pool
  if (options.filterClass) {
    filteredPool = pool.filter(c => c.classId === options.filterClass)
  } else if (options.filterWork) {
    const cleanWork = options.filterWork.replace(/^《|》$/g, '').trim()
    filteredPool = pool.filter(c => {
      const charOrigin = (c.origin || '').replace(/^《|》$/g, '').trim()
      return charOrigin === cleanWork
    })
  }

  if (filteredPool.length === 0) {
    showMessage('筛选后没有可用角色')
    return
  }

  const result = await generateClubs(filteredPool, mode, gameStore.allClubs || {}, options)
  if (!result.success) {
    showMessage(`社团生成失败: ${result.message}`)
  }
}

// 检测幽灵角色
function handleDetectGhostMembers() {
  const ghostMap = detectGhostMembers(gameStore.allClubs || {}, characterPool.value || [])

  if (Object.keys(ghostMap).length === 0) {
    showMessage('✅ 未检测到幽灵角色')
    return
  }

  let msg = '检测到以下社团中存在幽灵角色（不在全校名册中）：\n\n'
  for (const [clubId, ghosts] of Object.entries(ghostMap)) {
    const club = gameStore.allClubs[clubId]
    const clubName = club?.name || clubId
    msg += `【${clubName}】: ${ghosts.join('、')}\n`
  }
  msg += '\n建议在角色编辑器中添加这些角色，或从社团中移除。'

  alert(msg)
}

// 手动去重
async function handleDeduplicateMembers() {
  const result = deduplicateClubMembers(gameStore.allClubs || {})

  if (result.removed === 0) {
    showMessage('✅ 未发现重复成员')
    return
  }

  let msg = `已移除 ${result.removed} 个重复成员：\n\n`
  for (const detail of result.details) {
    msg += `【${detail.clubName}】: 移除 ${detail.removed} 个重复\n`
  }

  await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
  gameStore.saveToStorage(true)
  showMessage(msg)
}

// 一键清空所有成员
async function handleClearAllMembers() {
  const count = clearAllClubMembers(gameStore.allClubs || {})

  if (count === 0) {
    showMessage('所有社团已经是空的')
    return
  }

  await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
  gameStore.saveToStorage(true)
  showMessage(`已清空所有社团成员，共 ${count} 人`)
}

async function handleApplyGeneratedClubs() {
  try {
    // 自动创建新教师到角色池
    let newTeacherCount = 0
    for (const advisor of clubNewAdvisors.value) {
      if (!characterPool.value.find(c => c.name === advisor.name)) {
        characterPool.value.push({
          name: advisor.name,
          gender: advisor.gender || '',
          origin: advisor.origin || '',
          classId: '',
          role: 'teacher',
          staffTitle: '',
          workplace: '',
          subject: '',
          isHeadTeacher: false,
          electivePreference: 'general',
          scheduleTag: '',
          personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
          academicProfile: { level: 'avg', potential: 'medium', traits: [] },
          userCreated: true
        })
        newTeacherCount++
      }
    }
    if (newTeacherCount > 0) {
      await saveFullCharacterPool(deepClone(characterPool.value))
    }

    const applyResult = await applyGeneratedClubs(
      clubGenResults.value,
      clubGenAdditions.value,
      gameStore,
      createClubInWorldbook,
      addNpcToClubInWorldbook,
      null  // 游戏外管理，不创建 run-specific 副本
    )
    await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings?.useGeminiMode)
    gameStore.saveToStorage(true)
    resetGeneratedClubs()
    const parts = []
    if (applyResult.created > 0) parts.push(`新建${applyResult.created}个社团`)
    if (applyResult.merged > 0) parts.push(`合并${applyResult.merged}个社团`)
    if (applyResult.updated > 0) parts.push(`更新${applyResult.updated}个社团`)
    if (newTeacherCount > 0) parts.push(`新增${newTeacherCount}名教师`)
    showMessage(`处理完成：${parts.join('、')}。可在社团编辑中设置活动地点。`)
  } catch (e) {
    showMessage(`社团应用失败: ${e.message}`)
  }
}

function handleCancelGenerateClubs() {
  resetGeneratedClubs()
}

// ==================== 关系编辑器事件处理 ====================
const handleEditRelationship = (source, target) => {
  const rel = getRelationship(source, target)
  if (!rel) return
  editingRelSource.value = source
  editingRelTarget.value = target
  relationshipEditForm.value = {
    intimacy: rel.intimacy ?? 0, trust: rel.trust ?? 0,
    passion: rel.passion ?? 0, hostility: rel.hostility ?? 0,
    groups: [...(rel.groups || [])], tags: [...(rel.tags || [])]
  }
  showRelationshipEditor.value = true
}

const handleAddRelationship = (source) => {
  editingRelSource.value = source
  editingRelTarget.value = ''
  relationshipEditForm.value = {
    intimacy: 0, trust: 0, passion: 0, hostility: 0, groups: [], tags: []
  }
  showRelationshipEditor.value = true
}

const handleSaveRelationship = async (formData) => {
  const source = editingRelSource.value
  const target = formData.targetName || editingRelTarget.value
  if (!source || !target) return

  // 深拷贝formData，移除Vue响应式
  const cleanData = {
    intimacy: formData.intimacy,
    trust: formData.trust,
    passion: formData.passion,
    hostility: formData.hostility,
    groups: Array.isArray(formData.groups)
      ? JSON.parse(JSON.stringify(formData.groups))
      : [],
    tags: Array.isArray(formData.tags)
      ? JSON.parse(JSON.stringify(formData.tags))
      : []
  }

  setRelationship(source, target, cleanData)
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书，编辑存档数据时不同步
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  showRelationshipEditor.value = false
  showMessage(`关系 ${source} → ${target} 已保存`)
}

const handleDeleteRelationship = async (source, target) => {
  if (!confirm(`确定删除 ${source} ↔ ${target} 的双向关系？`)) return
  removeRelationship(source, target)
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  showMessage(`已删除 ${source} ↔ ${target} 的关系`)
}

const handleBatchDeleteRelationships = async (pairs) => {
  if (!pairs || pairs.length === 0) return
  if (!confirm(`确定批量删除 ${pairs.length} 条关系？`)) return
  for (const { source, target } of pairs) {
    removeRelationship(source, target)
  }
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  showMessage(`已批量删除 ${pairs.length} 条关系`)
}

const handleClearCharRelations = async (charName) => {
  if (!confirm(`确定清空「${charName}」的所有关系数据？\n（保留性格/目标，仅清除关系列表）`)) return
  const charData = gameStore.npcRelationships[charName]
  if (charData) charData.relations = {}
  // 清除其他角色对该角色的关系
  for (const otherName in gameStore.npcRelationships) {
    if (otherName === charName) continue
    const otherRels = gameStore.npcRelationships[otherName]?.relations
    if (otherRels?.[charName]) delete otherRels[charName]
  }
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  await saveImpressionDataImmediate()
  showMessage(`已清空「${charName}」的所有关系`)
}

const handleClearCharImpressions = async (charName) => {
  if (!confirm(`确定清除所有角色对「${charName}」的印象标签？`)) return
  for (const otherName in gameStore.npcRelationships) {
    const rel = gameStore.npcRelationships[otherName]?.relations?.[charName]
    if (rel && rel.tags) rel.tags = []
  }
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  await saveImpressionDataImmediate()
  showMessage(`已清除所有角色对「${charName}」的印象标签`)
}

const handleRemoveCharacter = async (charName) => {
  if (!confirm(`⚠️ 确定完全移除「${charName}」？\n将从关系数据中彻底删除该角色及所有相关关系。`)) return
  removeCharacterFromRelations(charName, true)
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  showMessage(`已移除角色「${charName}」`)
}

const handleBatchDeleteCharacters = async (charNames) => {
  if (!charNames || charNames.length === 0) return

  const count = charNames.length
  showMessage(`正在批量删除 ${count} 个角色的关系数据...`)

  for (const charName of charNames) {
    removeCharacterFromRelations(charName, false)
  }

  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  await saveImpressionDataImmediate()

  showMessage(`已批量删除 ${count} 个角色的所有关系数据`)
}

const handleClearAllRelationships = async () => {
  try {
    const { clearAllRelationships } = await import('../utils/relationshipManager')
    await clearAllRelationships()
    showMessage('已清空所有关系数据')
  } catch (e) {
    console.error('[RosterFilter] Failed to clear all relationships:', e)
    showMessage('清空失败：' + e.message)
  }
}

const handleClearGhostReferences = async (charName) => {
  if (!confirm(`确定清除所有角色对幽灵角色「${charName}」的引用？`)) return
  const rels = gameStore.npcRelationships
  if (!rels) return
  for (const otherName in rels) {
    const otherRels = rels[otherName]?.relations
    if (otherRels?.[charName]) delete otherRels[charName]
  }
  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  await saveImpressionDataImmediate()
  showMessage(`已清除所有对幽灵角色「${charName}」的引用`)
}

const handleClearAllGhosts = async () => {
  if (!confirm('⚠️ 确定要清除所有幽灵角色的引用吗？\n\n这将删除所有不在关系数据顶层但被其他角色引用的角色关系。')) return

  const rels = gameStore.npcRelationships || {}
  const topKeys = new Set(Object.keys(rels))

  // 收集所有幽灵角色
  const ghosts = new Set()
  for (const charData of Object.values(rels)) {
    for (const target of Object.keys(charData?.relations || {})) {
      if (!topKeys.has(target)) {
        ghosts.add(target)
      }
    }
  }

  if (ghosts.size === 0) {
    showMessage('✅ 未检测到幽灵角色')
    return
  }

  // 清除所有幽灵角色的引用
  let totalCleared = 0
  for (const ghostName of ghosts) {
    for (const otherName in rels) {
      const otherRels = rels[otherName]?.relations
      if (otherRels?.[ghostName]) {
        delete otherRels[ghostName]
        totalCleared++
      }
    }
  }

  await flushPendingSocialData()
  // 只有在编辑当前运行时数据时才同步到世界书
  if (!snapshotRelSource.value) {
    await syncRelationshipsToWorldbook()
  }
  await saveImpressionDataImmediate()
  showMessage(`已清除 ${ghosts.size} 个幽灵角色的 ${totalCleared} 条引用关系`)
}

const handleSaveComposer = async () => {
  const classId = composerTargetClass.value
  if (!classId) return

  fullRosterSnapshot.value[classId] = deepClone(composerClassData.value)

  // 同步 currentRosterState，把该班级所有学生标记为选中
  const students = fullRosterSnapshot.value[classId].students || []
  if (!currentRosterState.value[classId]) currentRosterState.value[classId] = {}
  students.forEach(s => {
    if (s.name) currentRosterState.value[classId][s.name] = true
  })

  await loadCharacterPool(fullRosterSnapshot.value)
  updateAvailableCharacters()
  showMessage('班级变更已保存到快照，请点击顶部「保存」同步到世界书。')
}
</script>

<template>
  <Teleport to="body">
    <div class="roster-panel-overlay">
      <div class="roster-panel-container">
        <!-- 头部 -->
        <div class="panel-header">
          <h2>📋 全校名册管理</h2>
          <div class="header-actions">
            <button class="btn-sync" @click="showWorldbookSync = true" title="同步世界书">
              📖 同步世界书
            </button>
            <button class="btn-batch" @click="handleOpenBatchComplete" title="AI批量补全">
              🤖 批量补全
            </button>
            <button class="btn-ai-import" @click="handleOpenAIImport" title="AI角色导入">
              🔍 AI导入
            </button>
            <button class="btn-save" @click="handleSave" :disabled="saving">
              {{ saving ? '保存中...' : '💾 保存' }}
            </button>
            <button class="btn-close" @click="handleClose">✕</button>
          </div>
        </div>

        <!-- 标签页导航 -->
        <div class="tab-navigation">
          <button
            :class="{ active: activeTab === 'filter' }"
            @click="activeTab = 'filter'"
          >
            📋 筛选名册
          </button>
          <button
            :class="{ active: activeTab === 'composer' }"
            @click="activeTab = 'composer'"
          >
            🎨 班级组合器
          </button>
          <button
            :class="{ active: activeTab === 'characterEditor' }"
            @click="activeTab = 'characterEditor'"
          >
            👥 角色编辑器
          </button>
          <button
            :class="{ active: activeTab === 'clubEditor' }"
            @click="activeTab = 'clubEditor'"
          >
            🏫 社团编辑器
          </button>
          <button
            :class="{ active: activeTab === 'relationshipEditor' }"
            @click="activeTab = 'relationshipEditor'"
          >
            🔗 关系编辑器
          </button>
          <button
            :class="{ active: activeTab === 'autoSchedule' }"
            @click="activeTab = 'autoSchedule'"
          >
            🤖 自动排班
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="panel-content">
          <!-- 标签页1：筛选名册 -->
          <div v-if="activeTab === 'filter'" class="tab-content">
            <div class="filter-tab-layout">
              <div class="filter-sub-tabs">
                <button :class="{ active: filterSubTab === 'student' }" @click="filterSubTab = 'student'">
                  👩‍🎓 学生名册 ({{ totalStats.selected }}/{{ totalStats.total }})
                </button>
                <button :class="{ active: filterSubTab === 'teacher' }" @click="filterSubTab = 'teacher'">
                  👩‍🏫 教师名册
                </button>
                <button :class="{ active: filterSubTab === 'external' }" @click="filterSubTab = 'external'">
                  🏢 校外人员
                </button>
              </div>
              <div class="filter-sub-content">
                <RosterFilterView
                  v-if="filterSubTab === 'student'"
                  :filtered-groups="filteredGroups"
                  :expanded-works="expandedWorks"
                  v-model:search-query="searchQuery"
                  v-model:show-filters="showFilters"
                  v-model:club-filter="clubFilter"
                  v-model:elective-filter="electiveFilter"
                  v-model:gender-filter="genderFilter"
                  :available-clubs="availableClubs"
                  :total-stats="totalStats"
                  :current-roster-state="currentRosterState"
                  :all-expanded="Object.keys(filteredGroups).every(w => expandedWorks[w])"
                  @toggle-work="toggleWorkExpand"
                  @toggle-work-selection="toggleWork"
                  @toggle-student="toggleStudent"
                  @expand-all="expandAllWorks"
                />
                <TeacherView
                  v-if="filterSubTab === 'teacher'"
                  :teacher-groups="processedTeacherGroups"
                  :expanded-groups="expandedTeacherGroups"
                  v-model:view-mode="teacherViewMode"
                  :all-expanded="Object.keys(processedTeacherGroups).every(g => expandedTeacherGroups[g])"
                  @toggle-group="toggleTeacherGroup"
                  @expand-all="expandAllTeachers"
                  @add-teacher="handleAddTeacher"
                  @edit-teacher="handleEditTeacher"
                  @delete-teacher="handleDeleteTeacher"
                />
                <!-- 校外人员视图 -->
                <div v-if="filterSubTab === 'external'" class="external-roster-view">
                  <div class="external-header">
                    <span>校外人员列表</span>
                    <button class="btn-add-external" @click="handleAddExternal">
                      + 添加校外人员
                    </button>
                  </div>
                  <div v-if="externalNpcs.length === 0" class="empty-hint">
                    暂无校外人员，点击上方按钮添加
                  </div>
                  <div v-for="npc in externalNpcs" :key="npc.name" class="external-card">
                    <div class="external-info">
                      <span class="npc-name">{{ npc.name }}</span>
                      <span class="npc-gender">{{ npc.gender === 'male' ? '♂' : '♀' }}</span>
                      <span v-if="npc.staffTitle" class="npc-title">{{ npc.staffTitle }}</span>
                      <span v-if="npc.workplace" class="npc-workplace">📍 {{ getLocationName(npc.workplace) }}</span>
                    </div>
                    <div class="external-actions">
                      <button @click="handleEditCharacter(npc)">编辑</button>
                      <button @click="handleDeleteCharacter(npc)">删除</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 标签页2：班级组合器 -->
          <div v-if="activeTab === 'composer'" class="tab-content">
            <ClassComposer
              :classes="fullRosterSnapshot"
              v-model:target-class="composerTargetClass"
              v-model:preset="selectedPreset"
              :class-data="composerClassData"
              :available-characters="availableCharacters"
              v-model:search-query="composerSearchQuery"
              v-model:role-filter="composerRoleFilter"
              v-model:work-filter="composerWorkFilter"
              v-model:show-unassigned="composerShowUnassigned"
              v-model:show-in-roster="composerShowInRoster"
              v-model:show-user-created="composerShowUserCreated"
              v-model:group-view="composerGroupView"
              :available-works="composerAvailableWorks"
              :grouped-characters="composerGroupedCharacters"
              @add-class="handleAddClass"
              @set-classroom="handleSetClassroom"
              @remove-head-teacher="handleRemoveComposerHeadTeacher"
              @remove-teacher="handleRemoveComposerTeacher"
              @remove-student="handleRemoveComposerStudent"
              @add-character="handleAddCharacterToClass"
              @save="handleSaveComposer"
              @cancel="activeTab = 'filter'"
            />
          </div>

          <!-- 标签页3：角色编辑器 -->
          <div v-if="activeTab === 'characterEditor'" class="tab-content">
            <CharacterEditor
              :character-pool="characterPool"
              v-model:search-query="charEditorSearchQuery"
              v-model:role-filter="charEditorRoleFilter"
              v-model:work-filter="charEditorWorkFilter"
              :classes="fullRosterSnapshot"
              @add="handleAddCharacter"
              @edit="handleEditCharacter"
              @delete="handleDeleteCharacter"
            />
          </div>

          <!-- 标签页4：社团编辑器 -->
          <div v-if="activeTab === 'clubEditor'" class="tab-content">
            <ClubEditorPanel
              :clubs="gameStore.allClubs || {}"
              :generating="clubGenerating"
              :club-results="clubGenResults"
              :club-error="clubGenError"
              :progress="clubGenProgress"
              :new-advisors="clubNewAdvisors"
              :deleted-clubs="deletedClubs"
              :character-pool="characterPool"
              :full-roster-snapshot="fullRosterSnapshot"
              @add-club="handleAddClub"
              @edit-club="handleEditClub"
              @delete-club="handleDeleteClub"
              @restore-club="handleRestoreClub"
              @confirm-delete="handleConfirmDelete"
              @generate-clubs="handleAutoGenerateClubs"
              @apply-clubs="handleApplyGeneratedClubs"
              @cancel-generate="handleCancelGenerateClubs"
              @detect-ghosts="handleDetectGhostMembers"
              @deduplicate="handleDeduplicateMembers"
              @clear-all="handleClearAllMembers"
            />
          </div>

          <!-- 标签页5：关系编辑器 -->
          <div v-if="activeTab === 'relationshipEditor'" class="tab-content">
            <!-- 存档数据源选择 -->
            <div class="snapshot-rel-toolbar">
              <div class="snapshot-selector">
                <label>数据来源：</label>
                <select
                  :value="snapshotRelSource"
                  @change="loadRelationshipsFromSnapshot($event.target.value)"
                  :disabled="isLoadingSnapshot"
                >
                  <option value="">当前运行时数据</option>
                  <option
                    v-for="snap in gameStore.saveSnapshots"
                    :key="snap.id"
                    :value="snap.id"
                  >{{ snap.label }} ({{ formatSnapshotTime(snap) }})</option>
                </select>
                <span v-if="isLoadingSnapshot" class="loading-hint">加载中...</span>
              </div>
              <div v-if="snapshotRelSource" class="snapshot-actions">
                <span class="snapshot-hint">⚠️ 正在编辑存档「{{ getSnapshotLabel(snapshotRelSource) }}」的关系数据</span>
                <button class="btn-action btn-save" @click="saveRelationshipsToSnapshot">💾 保存到存档</button>
                <button class="btn-action btn-cancel" @click="discardSnapshotEdit">↩️ 放弃修改</button>
              </div>
            </div>
            <RelationshipEditorPanel
              :npc-relationships="gameStore.npcRelationships"
              :all-class-data="gameStore.allClassData"
              :character-pool="characterPool"
              :current-roster-state="currentRosterState"
              @edit-relationship="handleEditRelationship"
              @delete-relationship="handleDeleteRelationship"
              @add-relationship="handleAddRelationship"
              @clear-char-relations="handleClearCharRelations"
              @clear-char-impressions="handleClearCharImpressions"
              @remove-character="handleRemoveCharacter"
              @clear-ghost-references="handleClearGhostReferences"
              @clear-all-ghosts="handleClearAllGhosts"
              @batch-delete-relationships="handleBatchDeleteRelationships"
              @batch-delete-characters="handleBatchDeleteCharacters"
              @clear-all-relationships="handleClearAllRelationships"
            />
          </div>

          <!-- 标签页6：自动排班 -->
          <div v-if="activeTab === 'autoSchedule'" class="tab-content">
            <AutoSchedulePanel
              :character-pool="characterPool"
              :full-roster-snapshot="fullRosterSnapshot"
              :current-roster-state="currentRosterState"
              :origin-groups="originGroups"
              :game-store="gameStore"
              :resolved-location="autoScheduleResolvedLocation"
              @save="handleSave"
              @show-message="showMessage"
              @sync-pool="saveCharacterPool"
              @resolve-location="handleAutoScheduleResolveLocation"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 模态框组件 -->
    <MessageModal
      :show="showMessageModal"
      :message="messageContent"
      @close="showMessageModal = false"
    />

    <BatchCompleteModal
      :show="showBatchCompleteModal"
      v-model:selection="batchSelection"
      :processing="batchProcessing"
      :progress="batchProgress"
      :results="batchResults"
      :resume-index="batchResumeIndex"
      :classes="fullRosterSnapshot"
      :candidate-counts="candidateCounts"
      @close="showBatchCompleteModal = false"
      @start="handleStartBatchProcess"
      @resume="handleResumeBatchProcess"
      @apply="handleApplyBatchChanges"
    />

    <AIImportModal
      :show-input="showAIImportInput"
      :show-result="showAIImportResult"
      :loading="aiImportLoading"
      :error="aiImportError"
      v-model:entries="aiImportEntries"
      :results="aiImportResults"
      v-model:import-all-as-pending="importAllAsPending"
      @close="handleCloseAIImport"
      @submit="handleSubmitAIImport"
      @confirm="handleConfirmAIImport"
      @detail-query="handleAIDetailQuery"
      @toggle-char="handleToggleAIChar"
      @toggle-work-char="handleToggleAIWorkChar"
    />

    <CharacterEditModal
      :show="showCharacterEditor"
      v-model:form="characterEditForm"
      :is-editing="!!editingCharacter"
      :classes="fullRosterSnapshot"
      @close="showCharacterEditor = false"
      @save="handleSaveCharacter"
      @select-workplace="handleSelectWorkplace"
    />

    <TeacherEditModal
      :show="showTeacherEditor"
      v-model:form="teacherEditForm"
      :is-editing="!!editingTeacher"
      :classes="fullRosterSnapshot"
      @close="showTeacherEditor = false"
      @save="handleSaveTeacher"
    />

    <ClubEditModal
      :show="showClubEditor"
      v-model:form="clubEditForm"
      :is-editing="!!editingClub"
      :location-name="clubLocationName"
      :character-pool="characterPool"
      @close="showClubEditor = false"
      @save="handleSaveClub"
      @select-location="handleClubSelectLocation"
    />

    <RelationshipEditModal
      :show="showRelationshipEditor"
      :source-name="editingRelSource"
      :target-name="editingRelTarget"
      v-model:form="relationshipEditForm"
      :is-editing="!!editingRelTarget"
      :available-characters="relationshipAvailableTargets"
      :relationship-groups="RELATIONSHIP_GROUPS"
      @close="showRelationshipEditor = false"
      @save="handleSaveRelationship"
    />

    <MapEditorPanel
      v-if="showMapEditor"
      :selection-mode="true"
      :selection-title="mapEditorContext === 'club' ? '选择社团活动地点' : mapEditorContext === 'external_workplace' ? '选择校外人员工作地点' : mapEditorContext === 'auto_schedule_workplace' ? '选择工作地点 - ' + (pendingLocationResolve?.charName || '') : '选择班级教室'"
      :prefill-id="mapEditorContext === 'club' ? '' : (pendingNewClassId ? `classroom_${pendingNewClassId.toLowerCase().replace('-', '')}` : '')"
      :prefill-name="mapEditorContext === 'club' ? '' : (pendingNewClassId ? `${fullRosterSnapshot[pendingNewClassId]?.name || pendingNewClassId}教室` : '')"
      initial-parent-id="tianhua_high_school"
      @location-selected="handleLocationSelected"
      @close="handleMapEditorClose"
    />

    <WorldbookSyncPanel
      :visible="showWorldbookSync"
      @close="showWorldbookSync = false"
    />

    <!-- 新建班级表单 -->
    <div v-if="showNewClassForm" class="new-class-overlay" @click.self="showNewClassForm = false">
      <div class="new-class-modal">
        <h3>新建班级</h3>
        <div class="form-row">
          <label>班级编号</label>
          <input v-model="newClassForm.id" placeholder="如：1-A、2-B、3-C" @keyup.enter="handleConfirmNewClass">
          <span class="form-hint">将作为世界书条目 [Class:编号] 的标识</span>
        </div>
        <div class="form-row">
          <label>显示名称</label>
          <input v-model="newClassForm.name" :placeholder="newClassForm.id || '留空则使用编号'" @keyup.enter="handleConfirmNewClass">
        </div>
        <div class="form-actions">
          <button class="btn-confirm" @click="handleConfirmNewClass" :disabled="!newClassForm.id.trim()">确认创建</button>
          <button class="btn-form-cancel" @click="showNewClassForm = false">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.roster-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.roster-panel-container {
  background: #1a1a1a;
  border-radius: 12px;
  width: 100%;
  max-width: 1600px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  touch-action: pan-y;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 25px;
  background: #2a2a2a;
  border-bottom: 2px solid #444;
}

.panel-header h2 {
  margin: 0;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.header-actions button {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-batch {
  background: #9C27B0;
  color: white;
}

.btn-sync {
  background: #1565C0;
  color: white;
}

.btn-sync:hover {
  background: #0D47A1;
}

.btn-batch:hover {
  background: #7B1FA2;
}

.btn-ai-import {
  background: #2196F3;
  color: white;
}

.btn-ai-import:hover {
  background: #0b7dda;
}

.btn-save {
  background: #4CAF50;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #45a049;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-close {
  background: #d32f2f;
  color: white;
  width: 36px;
  height: 36px;
  font-size: 20px;
  padding: 0;
}

.btn-close:hover {
  background: #b71c1c;
}

.tab-navigation {
  display: flex;
  gap: 0;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
  padding: 0 25px;
}

.tab-navigation button {
  padding: 15px 25px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: #999;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s;
}

.tab-navigation button:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.05);
}

.tab-navigation button.active {
  color: #4CAF50;
  border-bottom-color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}

.panel-content {
  flex: 1;
  overflow: hidden;
  background: #1a1a1a;
  touch-action: pan-y;
}

.tab-content {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
}

.filter-tab-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.filter-sub-tabs {
  display: flex;
  gap: 0;
  background: #222;
  border-bottom: 1px solid #444;
  padding: 0 20px;
  flex-shrink: 0;
}

.filter-sub-tabs button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.filter-sub-tabs button:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.05);
}

.filter-sub-tabs button.active {
  color: #4CAF50;
  border-bottom-color: #4CAF50;
  background: rgba(76, 175, 80, 0.08);
}

.filter-sub-content {
  flex: 1;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .roster-panel-overlay {
    padding: 0;
  }

  .roster-panel-container {
    max-width: 100%;
    height: 100vh;
    border-radius: 0;
  }

  .panel-header {
    padding: 12px 15px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .panel-header h2 {
    font-size: 18px;
  }

  .header-actions {
    gap: 5px;
    flex-wrap: wrap;
  }

  .header-actions button {
    padding: 6px 10px;
    font-size: 12px;
  }

  .tab-navigation {
    padding: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .tab-navigation::-webkit-scrollbar {
    display: none;
  }

  .tab-navigation button {
    padding: 10px 14px;
    font-size: 13px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .filter-sub-tabs {
    padding: 0 10px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .filter-sub-tabs::-webkit-scrollbar {
    display: none;
  }

  .filter-sub-tabs button {
    padding: 8px 14px;
    font-size: 13px;
    white-space: nowrap;
    flex-shrink: 0;
  }
}

.new-class-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.new-class-modal {
  background: #2a2a2a;
  border-radius: 10px;
  padding: 24px;
  width: 380px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.new-class-modal h3 {
  margin: 0 0 18px;
  color: #fff;
  font-size: 18px;
}

.form-row {
  margin-bottom: 14px;
}

.form-row label {
  display: block;
  color: #aaa;
  font-size: 13px;
  margin-bottom: 5px;
}

.form-row input {
  width: 100%;
  padding: 9px 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  box-sizing: border-box;
}

.form-row input:focus {
  border-color: #4CAF50;
  outline: none;
}

.form-hint {
  display: block;
  color: #666;
  font-size: 11px;
  margin-top: 4px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn-confirm {
  flex: 1;
  padding: 10px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  background: #45a049;
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-form-cancel {
  padding: 10px 16px;
  background: #444;
  border: none;
  border-radius: 6px;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-form-cancel:hover {
  background: #555;
}

.snapshot-rel-toolbar {
  padding: 8px 12px;
  background: rgba(255, 193, 7, 0.08);
  border-bottom: 1px solid rgba(255, 193, 7, 0.2);
  flex-shrink: 0;
}
.snapshot-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.snapshot-selector label {
  font-size: 13px;
  white-space: nowrap;
}
.snapshot-selector select {
  flex: 1;
  min-width: 150px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(0,0,0,0.3);
  color: white;
}
.snapshot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.snapshot-hint {
  font-size: 12px;
  color: #ffc107;
}
.loading-hint {
  font-size: 12px;
  color: #aaa;
}

/* 校外人员视图 */
.external-roster-view {
  padding: 8px 0;
}
.external-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  color: #ccc;
}
.btn-add-external {
  padding: 4px 12px;
  background: #4a6fa5;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.btn-add-external:hover {
  background: #5a7fb5;
}
.empty-hint {
  text-align: center;
  color: #888;
  padding: 20px;
  font-size: 13px;
}
.external-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #2a2a2a;
  border-radius: 6px;
  margin-bottom: 6px;
}
.external-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.external-info .npc-name {
  font-weight: bold;
  color: #e0e0e0;
}
.external-info .npc-gender {
  color: #aaa;
}
.external-info .npc-title {
  color: #8bb8e8;
  font-size: 12px;
}
.external-info .npc-workplace {
  color: #a8d8a8;
  font-size: 12px;
}
.external-actions {
  display: flex;
  gap: 4px;
}
.external-actions button {
  padding: 3px 8px;
  background: #444;
  color: #ccc;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}
.external-actions button:hover {
  background: #555;
}

/* 统一暗色滚动条 */
.panel-content ::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.panel-content ::-webkit-scrollbar-track {
  background: transparent;
}
.panel-content ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.panel-content ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
