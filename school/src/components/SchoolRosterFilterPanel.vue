/<!-- 重构后的主组件 - 名册筛选面板容器 -->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useRosterData } from '../composables/useRosterData'
import { useCharacterPool } from '../composables/useCharacterPool'
import { useBatchComplete } from '../composables/useBatchComplete'
import { useAIImport } from '../composables/useAIImport'
import { saveRosterBackup, saveFullCharacterPool } from '../utils/indexedDB'
import { updateClassDataInWorldbook, updateAcademicDataInWorldbook, updateStaffRosterInWorldbook } from '../utils/worldbookParser'
import { saveSocialData } from '../utils/socialRelationshipsWorldbook'
import { saveImpressionDataImmediate } from '../utils/impressionWorldbook'

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

// ==================== 状态管理 ====================
const activeTab = ref('filter') // 'filter' | 'composer' | 'characterEditor'
const filterSubTab = ref('student') // 'student' | 'teacher'
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
  subject: '',
  classId: '',
  isHeadTeacher: false,
  teachingClasses: [],
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
    const academicMap = {}
    characterPool.value.forEach(c => {
      if (c.role === 'student' && c.academicProfile) {
        academicMap[c.name] = c.academicProfile
      }
    })
    await updateAcademicDataInWorldbook(academicMap)

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
    assignments: char.assignments || [],
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

const handleSaveCharacter = async () => {
  const form = characterEditForm.value

  if (editingCharacter.value) {
    // 编辑模式
    const idx = characterPool.value.findIndex(c => c.name === editingCharacter.value.name)
    if (idx !== -1) {
      characterPool.value[idx] = { ...form }
    }
  } else {
    // 添加模式
    if (characterPool.value.find(c => c.name === form.name)) {
      showMessage('角色名已存在')
      return
    }
    characterPool.value.push({ ...form })
  }

  await saveCharacterPool()
  showCharacterEditor.value = false
  showMessage(editingCharacter.value ? '角色已更新' : '角色已添加')
}

const handleDeleteCharacter = async (char) => {
  if (!confirm(`确定要删除角色 ${char.name} 吗？`)) return

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
    subject: '',
    classId: Object.keys(fullRosterSnapshot.value)[0] || '',
    isHeadTeacher: false,
    teachingClasses: [],
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
    notes: ''
  }
  showTeacherEditor.value = true
}

const handleEditTeacher = (teacher) => {
  editingTeacher.value = teacher
  teacherEditForm.value = {
    name: teacher.name || '',
    gender: teacher.gender || 'female',
    origin: teacher.origin || '',
    subject: teacher.subject || '',
    classId: teacher.classId || '',
    isHeadTeacher: teacher.isHeadTeacher || false,
    teachingClasses: [],
    personality: teacher.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
    notes: teacher.notes || ''
  }
  showTeacherEditor.value = true
}

const handleSaveTeacher = async () => {
  const form = teacherEditForm.value
  if (!form.name || !form.classId) {
    showMessage('请填写姓名和班级')
    return
  }

  // 如果是编辑模式，先从原位置移除
  if (editingTeacher.value) {
    const oldClassId = editingTeacher.value.classId
    const oldName = editingTeacher.value.name
    const oldClassData = fullRosterSnapshot.value[oldClassId]

    if (oldClassData) {
      if (oldClassData.headTeacher?.name === oldName) {
        oldClassData.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }

      if (Array.isArray(oldClassData.teachers)) {
        const idx = oldClassData.teachers.findIndex(t => t.name === oldName)
        if (idx !== -1) {
          oldClassData.teachers.splice(idx, 1)
        }
      }
    }
  }

  // 添加到新位置
  const newClassData = fullRosterSnapshot.value[form.classId]
  if (!newClassData) return

  if (form.isHeadTeacher) {
    newClassData.headTeacher = {
      name: form.name,
      gender: form.gender,
      origin: form.origin,
      role: 'teacher'
    }
  } else {
    if (!newClassData.teachers) newClassData.teachers = []
    if (!Array.isArray(newClassData.teachers)) newClassData.teachers = []

    newClassData.teachers.push({
      name: form.name,
      gender: form.gender,
      origin: form.origin,
      subject: form.subject,
      role: 'teacher'
    })
  }

  showTeacherEditor.value = false
  await loadCharacterPool(fullRosterSnapshot.value)
  showMessage('教师信息已保存')
}

const handleDeleteTeacher = async (teacher) => {
  if (!confirm(`确定要删除教师 ${teacher.name} 吗？`)) return

  const classData = fullRosterSnapshot.value[teacher.classId]
  if (!classData) return

  if (teacher.isHeadTeacher) {
    classData.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
  } else {
    const idx = classData.teachers?.findIndex(t => t.name === teacher.name)
    if (idx !== -1) {
      classData.teachers.splice(idx, 1)
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
  if (!result.success && result.message) {
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
    } else if (char.roleSuggestion === 'teacher') {
      role = 'teacher'
    }

    if (importAllAsPending.value && role === 'student') {
      grade = 0
    }

    characterPool.value.push({
      name: char.name,
      gender: char.gender,
      origin: `(${char.work})`,
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
      academicProfile: char.academicProfile || { level: 'avg', potential: 'medium', traits: [] }
    })
    addedCount++
  }

  await saveFullCharacterPool(deepClone(characterPool.value))
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
      return {
        ...c,
        assignedTo: assignment ? assignment.className : null,
        isAssigned: !!assignment
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
  showMapEditor.value = true
}

const handleSetClassroom = () => {
  const classId = composerTargetClass.value
  if (!classId) {
    showMessage('请先选择一个班级。')
    return
  }
  pendingNewClassId.value = classId
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

const handleMapEditorClose = () => {
  showMapEditor.value = false
  pendingNewClassId.value = ''
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
            <button class="btn-close" @click="$emit('close')">✕</button>
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
    />

    <TeacherEditModal
      :show="showTeacherEditor"
      v-model:form="teacherEditForm"
      :is-editing="!!editingTeacher"
      :classes="fullRosterSnapshot"
      @close="showTeacherEditor = false"
      @save="handleSaveTeacher"
    />

    <MapEditorPanel
      v-if="showMapEditor"
      :selection-mode="true"
      selection-title="选择班级教室"
      :prefill-id="pendingNewClassId ? `classroom_${pendingNewClassId.toLowerCase().replace('-', '')}` : ''"
      :prefill-name="pendingNewClassId ? `${fullRosterSnapshot[pendingNewClassId]?.name || pendingNewClassId}教室` : ''"
      initial-parent-id="tianhua_high_school"
      @location-selected="handleClassroomSelected"
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
}

.tab-content {
  height: 100%;
  overflow: hidden;
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
    padding: 15px;
  }

  .panel-header h2 {
    font-size: 18px;
  }

  .header-actions {
    gap: 5px;
  }

  .header-actions button {
    padding: 8px 12px;
    font-size: 13px;
  }

  .tab-navigation {
    padding: 0 10px;
    overflow-x: auto;
  }

  .tab-navigation button {
    padding: 12px 15px;
    font-size: 14px;
    white-space: nowrap;
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
</style>
