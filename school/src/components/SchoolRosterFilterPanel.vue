<!-- -*- coding: utf-8 -*- -->
<script setup>
import { ref, onMounted, computed, watch, toRaw } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { updateClassDataInWorldbook, createDefaultRosterBackupWorldbook, restoreFromBackupWorldbook, hasBackupWorldbook } from '../utils/worldbookParser'
import { saveRosterBackup, getRosterBackup, saveFullCharacterPool, getFullCharacterPool, saveRosterPresets, getRosterPresets } from '../utils/indexedDB'
import { ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { DEFAULT_TEMPLATES } from '../utils/npcScheduleSystem'
import { PERSONALITY_AXES } from '../data/relationshipData'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// ==================== 标签页状态 ====================
const activeTab = ref('filter') // 'filter' | 'composer' | 'allCharacters'

// ==================== 筛选面板状态 ====================
const loading = ref(true)
const saving = ref(false)
const isLocked = ref(false)
const fullRosterSnapshot = ref({})
const currentRosterState = ref({})
const originGroups = ref({})
const searchQuery = ref('')
const expandedWorks = ref({})

// ==================== 筛选器状态 ====================
const clubFilter = ref('')
const electiveFilter = ref('')
const showFilters = ref(false)

// ==================== 教师编辑状态 ====================
const showTeacherEditor = ref(false)
const editingTeacher = ref(null)
const teacherEditForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  subject: '',
  classId: '',
  isHeadTeacher: false
})

// ==================== 班级组合器状态 ====================
const selectedPreset = ref('default')
const composerTargetClass = ref('')
const composerClassData = ref({})
const availableCharacters = ref([])
const composerSearchQuery = ref('')
const showAddClassModal = ref(false)
const newClassForm = ref({ id: '', name: '' })

// ==================== 全部角色管理状态 ====================
const allCharactersPool = ref([])
const showCharacterEditor = ref(false)
const editingCharacter = ref(null)
const characterEditForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  classId: '',
  role: 'student',
  electivePreference: 'general',
  scheduleTag: '',
  personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
})
const allCharSearchQuery = ref('')

// ==================== 预设配置 ====================
const ROSTER_PRESETS = {
  default: { name: '默认名册', description: '使用世界书中的原始班级名册', icon: '📋' },
  blank: { name: '空白名册', description: '清空所有班级学生，从头开始组合', icon: '📄' }
}

// ==================== 初始化 ====================
onMounted(async () => {
  await loadData()
  await loadAllCharactersPool()
})

// ==================== 数据加载 ====================
const loadData = async () => {
  loading.value = true
  try {
    let backupData = await getRosterBackup()
    const currentData = gameStore.allClassData
    
    if (!backupData || Object.keys(backupData).length === 0) {
      console.log('[RosterFilter] Creating new backup from current data')
      backupData = JSON.parse(JSON.stringify(currentData))
      await saveRosterBackup(backupData)
      
      // 同时创建备份世界书
      const hasBackup = await hasBackupWorldbook()
      if (!hasBackup) {
        await createDefaultRosterBackupWorldbook(backupData)
      }
    } else {
      console.log('[RosterFilter] Merging current data into backup')
      let hasChanges = false
      for (const [classId, classInfo] of Object.entries(currentData)) {
        if (!backupData[classId]) {
          backupData[classId] = JSON.parse(JSON.stringify(classInfo))
          hasChanges = true
        } else {
          const backupStudents = backupData[classId].students || []
          const currentStudents = classInfo.students || []
          
          currentStudents.forEach(curr => {
            if (!backupStudents.find(b => b.name === curr.name)) {
              backupStudents.push(JSON.parse(JSON.stringify(toRaw(curr))))
              hasChanges = true
            }
          })
          backupData[classId].students = backupStudents
        }
      }
      if (hasChanges) {
        await saveRosterBackup(backupData)
      }
    }
    
    fullRosterSnapshot.value = backupData
    
    // 初始化选中状态
    const state = {}
    const groups = {}
    
    for (const [classId, classInfo] of Object.entries(backupData)) {
      if (!classInfo.students) continue
      
      const currentClassInfo = currentData[classId]
      const currentStudentNames = new Set((currentClassInfo?.students || []).map(s => s.name))
      
      state[classId] = {}
      
      classInfo.students.forEach(student => {
        state[classId][student.name] = currentStudentNames.has(student.name)
        
        let origin = '未知'
        if (student.origin) {
          const match = student.origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
          origin = match ? match[1] : student.origin
        }
        
        if (!groups[origin]) groups[origin] = []
        groups[origin].push({
          ...student,
          classId,
          className: classInfo.name,
          clubs: getStudentClubs(student.name),
          electivePref: student.electivePreference || 'general'
        })
      })
    }
    
    currentRosterState.value = state
    
    const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)
    const sortedGroupsObj = {}
    sortedGroups.forEach(key => {
      sortedGroupsObj[key] = groups[key]
    })
    originGroups.value = sortedGroupsObj
    
  } catch (e) {
    console.error('[RosterFilter] Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// 加载全部角色池 (每次均从最新数据构建并合并)
const loadAllCharactersPool = async () => {
  try {
    // 1. 获取持久化存储的池子 (包含可能的自定义/额外角色)
    let savedPool = await getFullCharacterPool() || []
    const savedMap = new Map(savedPool.map(c => [c.name, c]))
    
    // 2. 从当前的快照 (Source of Truth) 构建基础池子
    const currentPool = []
    
    // 遍历所有班级
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      // 添加班主任
      if (classInfo.headTeacher?.name) {
        const char = {
          ...classInfo.headTeacher,
          classId,
          role: 'teacher',
          isHeadTeacher: true
        }
        // 如果已保存的数据中有额外属性(如性格)，合并进来
        if (savedMap.has(char.name)) {
          Object.assign(char, savedMap.get(char.name))
          // 强制更新核心身份信息，防止不同步
          char.classId = classId
          char.role = 'teacher'
          char.isHeadTeacher = true
        }
        currentPool.push(char)
        savedMap.delete(char.name) // 标记为已处理
      }
      
      // 添加科任教师
      (classInfo.teachers || []).forEach(t => {
        if (t.name) {
          const char = {
            ...t,
            classId,
            role: 'teacher',
            isHeadTeacher: false
          }
          if (savedMap.has(char.name)) {
            Object.assign(char, savedMap.get(char.name))
            char.classId = classId
            char.role = 'teacher'
          }
          currentPool.push(char)
          savedMap.delete(char.name)
        }
      })
      
      // 添加学生
      (classInfo.students || []).forEach(s => {
        if (s.name) {
          const char = {
            ...s,
            classId,
            role: 'student'
          }
          if (savedMap.has(char.name)) {
            Object.assign(char, savedMap.get(char.name))
            char.classId = classId
            char.role = 'student'
          }
          currentPool.push(char)
          savedMap.delete(char.name)
        }
      })
    }
    
    // 3. 添加剩余的自定义角色 (不在当前班级名册中的)
    for (const [name, char] of savedMap) {
      // 标记为无班级
      char.classId = ''
      currentPool.push(char)
    }
    
    // 更新状态并保存
    allCharactersPool.value = currentPool
    await saveFullCharacterPool(currentPool)
    
    console.log('[RosterFilter] Loaded character pool:', currentPool.length, 'characters')
    
  } catch (e) {
    console.error('[RosterFilter] Error loading character pool:', e)
  }
}

// 获取学生所属社团 (增加去重逻辑，解决副本条目导致的重复显示)
const getStudentClubs = (studentName) => {
  const clubs = []
  if (gameStore.allClubs) {
    for (const [clubId, club] of Object.entries(gameStore.allClubs)) {
      if (!club.name) continue
      
      let role = null
      let isMember = false
      
      if (club.president === studentName) role = '部长'
      else if (club.vicePresident === studentName) role = '副部长'
      else if (club.members?.includes(studentName)) isMember = true
      
      if (role || isMember) {
        clubs.push({ id: clubId, name: club.name, role })
      }
    }
    
    // 按名称去重，优先保留有职位的条目
    const uniqueMap = new Map()
    for (const c of clubs) {
      if (uniqueMap.has(c.name)) {
        const existing = uniqueMap.get(c.name)
        // 如果当前有职位且已存在的没有，则替换
        if (c.role && !existing.role) {
          uniqueMap.set(c.name, c)
        }
      } else {
        uniqueMap.set(c.name, c)
      }
    }
    
    return Array.from(uniqueMap.values())
  }
  return clubs
}

// ==================== 筛选逻辑 ====================
const getWorkStats = (workName) => {
  const students = originGroups.value[workName] || []
  const total = students.length
  const selected = students.reduce((sum, s) => {
    return sum + (currentRosterState.value[s.classId]?.[s.name] ? 1 : 0)
  }, 0)
  return { total, selected, all: total > 0 && total === selected, none: selected === 0 }
}

const toggleWork = (workName) => {
  const stats = getWorkStats(workName)
  const targetState = !stats.all
  
  const students = originGroups.value[workName] || []
  students.forEach(s => {
    if (!currentRosterState.value[s.classId]) currentRosterState.value[s.classId] = {}
    currentRosterState.value[s.classId][s.name] = targetState
  })
}

// 可用社团列表
const availableClubs = computed(() => {
  const clubs = new Set()
  if (gameStore.allClubs) {
    Object.values(gameStore.allClubs).forEach(club => {
      if (club.name) clubs.add(club.name)
    })
  }
  return Array.from(clubs)
})

// 过滤显示
const filteredGroups = computed(() => {
  let result = originGroups.value
  
  // 搜索过滤
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
  
  // 社团过滤
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
  
  // 选课倾向过滤
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
  
  return result
})

// 总统计
const totalStats = computed(() => {
  let totalStudents = 0
  let selectedStudents = 0
  
  for (const [workName] of Object.entries(originGroups.value)) {
    const stats = getWorkStats(workName)
    totalStudents += stats.total
    selectedStudents += stats.selected
  }
  
  return { total: totalStudents, selected: selectedStudents }
})

// ==================== 教师数据 ====================
const allTeachers = computed(() => {
  const teachers = []
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classInfo.headTeacher?.name) {
      teachers.push({
        ...classInfo.headTeacher,
        classId,
        className: classInfo.name,
        isHeadTeacher: true
      })
    }
    (classInfo.teachers || []).forEach(t => {
      if (t.name) {
        teachers.push({
          ...t,
          classId,
          className: classInfo.name,
          isHeadTeacher: false
        })
      }
    })
  }
  return teachers
})

// ==================== 教师编辑 ====================
const startEditTeacher = (teacher) => {
  editingTeacher.value = teacher
  teacherEditForm.value = {
    name: teacher.name || '',
    gender: teacher.gender || 'female',
    origin: teacher.origin || '',
    subject: teacher.subject || '',
    classId: teacher.classId || '',
    isHeadTeacher: teacher.isHeadTeacher || false
  }
  showTeacherEditor.value = true
}

const addNewTeacher = () => {
  editingTeacher.value = null
  teacherEditForm.value = {
    name: '',
    gender: 'female',
    origin: '',
    subject: '',
    classId: Object.keys(fullRosterSnapshot.value)[0] || '',
    isHeadTeacher: false
  }
  showTeacherEditor.value = true
}

const saveTeacherEdit = () => {
  const form = teacherEditForm.value
  if (!form.name || !form.classId) {
    alert('请填写姓名和班级')
    return
  }
  
  const classData = fullRosterSnapshot.value[form.classId]
  if (!classData) return
  
  if (form.isHeadTeacher) {
    classData.headTeacher = {
      name: form.name,
      gender: form.gender,
      origin: form.origin,
      role: 'teacher'
    }
  } else {
    if (!classData.teachers) classData.teachers = []
    
    if (editingTeacher.value) {
      // 编辑现有
      const idx = classData.teachers.findIndex(t => t.name === editingTeacher.value.name)
      if (idx !== -1) {
        classData.teachers[idx] = {
          name: form.name,
          gender: form.gender,
          origin: form.origin,
          subject: form.subject,
          role: 'teacher'
        }
      }
    } else {
      // 添加新教师
      classData.teachers.push({
        name: form.name,
        gender: form.gender,
        origin: form.origin,
        subject: form.subject,
        role: 'teacher'
      })
    }
  }
  
  showTeacherEditor.value = false
}

const deleteTeacher = (teacher) => {
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
}

// ==================== 班级组合器 ====================
const initComposer = async () => {
  // 确保角色池已加载
  if (allCharactersPool.value.length === 0) {
    await loadAllCharactersPool()
  }
  
  if (!composerTargetClass.value && Object.keys(fullRosterSnapshot.value).length > 0) {
    composerTargetClass.value = Object.keys(fullRosterSnapshot.value)[0]
  }
  loadComposerClassData()
}

const loadComposerClassData = () => {
  if (!composerTargetClass.value) return
  
  if (selectedPreset.value === 'blank') {
    composerClassData.value = {
      ...fullRosterSnapshot.value[composerTargetClass.value],
      students: []
    }
  } else {
    composerClassData.value = JSON.parse(JSON.stringify(fullRosterSnapshot.value[composerTargetClass.value]))
  }
  
  // 构建可用角色列表
  updateAvailableCharacters()
}

// 更新可用角色列表，标记已分配到其他班级的角色
const updateAvailableCharacters = () => {
  const inCurrentClassNames = new Set((composerClassData.value.students || []).map(s => s.name))
  
  // 构建所有班级的学生分配映射
  const assignmentMap = new Map()
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classId === composerTargetClass.value) continue // 跳过当前班级
    for (const student of (classInfo.students || [])) {
      if (student.name) {
        assignmentMap.set(student.name, {
          classId,
          className: classInfo.name || classId
        })
      }
    }
  }
  
  // 过滤和标记角色
  availableCharacters.value = allCharactersPool.value
    .filter(c => c.role === 'student' && !inCurrentClassNames.has(c.name))
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

// 添加角色到班级
const addCharacterToClass = (char) => {
  if (!composerClassData.value.students) composerClassData.value.students = []
  
  const newStudent = {
    name: char.name,
    gender: char.gender,
    origin: char.origin,
    role: 'student',
    classId: composerTargetClass.value,
    electivePreference: char.electivePreference || 'general',
    scheduleTag: char.scheduleTag || ''
  }
  
  composerClassData.value.students.push(newStudent)
  updateAvailableCharacters()
}

// 从班级移除角色
const removeCharacterFromClass = (index) => {
  composerClassData.value.students.splice(index, 1)
  updateAvailableCharacters()
}

// 过滤可用角色
const filteredAvailableCharacters = computed(() => {
  if (!composerSearchQuery.value) return availableCharacters.value
  
  const query = composerSearchQuery.value.toLowerCase()
  return availableCharacters.value.filter(c => 
    c.name.toLowerCase().includes(query) || 
    (c.origin && c.origin.toLowerCase().includes(query))
  )
})

// 应用组合器更改
const applyComposerChanges = async () => {
  if (!composerTargetClass.value) return
  
  saving.value = true
  try {
    // 更新内存
    gameStore.allClassData[composerTargetClass.value] = JSON.parse(JSON.stringify(composerClassData.value))
    
    // 同步到世界书
    const success = await updateClassDataInWorldbook(composerTargetClass.value, composerClassData.value)
    
    if (success) {
      alert('班级名册已更新！')
      // 刷新数据
      await loadData()
      await loadAllCharactersPool()
    } else {
      alert('保存失败，请检查控制台')
    }
  } catch (e) {
    console.error('[RosterFilter] Error applying composer changes:', e)
    alert('保存出错')
  } finally {
    saving.value = false
  }
}

// ==================== 班级管理 ====================
const openAddClassModal = () => {
  newClassForm.value = { id: '', name: '' }
  showAddClassModal.value = true
}

const addClass = async () => {
  const { id, name } = newClassForm.value
  if (!id || !name) {
    alert('请填写班级ID和名称')
    return
  }
  
  if (fullRosterSnapshot.value[id]) {
    alert('该班级ID已存在')
    return
  }
  
  // 创建新班级
  const newClass = {
    name,
    headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
    teachers: [],
    students: []
  }
  
  fullRosterSnapshot.value[id] = newClass
  gameStore.allClassData[id] = JSON.parse(JSON.stringify(newClass))
  
  // 保存到备份
  await saveRosterBackup(fullRosterSnapshot.value)
  
  // 同步到世界书
  await updateClassDataInWorldbook(id, newClass)
  
  showAddClassModal.value = false
  composerTargetClass.value = id
  
  alert(`班级 "${name}" 已创建`)
}

const deleteClass = async () => {
  if (!composerTargetClass.value) return
  
  const className = fullRosterSnapshot.value[composerTargetClass.value]?.name || composerTargetClass.value
  if (!confirm(`确定要删除班级 "${className}" 吗？该操作不可撤销。`)) return
  
  const classId = composerTargetClass.value
  
  // 从内存中删除
  delete fullRosterSnapshot.value[classId]
  delete gameStore.allClassData[classId]
  
  // 保存到备份
  await saveRosterBackup(fullRosterSnapshot.value)
  
  // 切换到另一个班级
  const remainingClasses = Object.keys(fullRosterSnapshot.value)
  composerTargetClass.value = remainingClasses[0] || ''
  
  if (composerTargetClass.value) {
    loadComposerClassData()
  } else {
    composerClassData.value = {}
  }
  
  alert(`班级 "${className}" 已删除`)
}

// ==================== 全部角色管理 ====================
const filteredAllCharacters = computed(() => {
  if (!allCharSearchQuery.value) return allCharactersPool.value
  
  const query = allCharSearchQuery.value.toLowerCase()
  return allCharactersPool.value.filter(c =>
    c.name.toLowerCase().includes(query) ||
    (c.origin && c.origin.toLowerCase().includes(query)) ||
    (c.classId && c.classId.toLowerCase().includes(query))
  )
})

const startEditCharacter = (char) => {
  editingCharacter.value = char
  characterEditForm.value = {
    name: char.name || '',
    gender: char.gender || 'female',
    origin: char.origin || '',
    classId: char.classId || '',
    role: char.role || 'student',
    electivePreference: char.electivePreference || 'general',
    scheduleTag: char.scheduleTag || '',
    personality: char.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 }
  }
  showCharacterEditor.value = true
}

const addNewCharacter = () => {
  editingCharacter.value = null
  characterEditForm.value = {
    name: '',
    gender: 'female',
    origin: '',
    classId: '',
    role: 'student',
    electivePreference: 'general',
    scheduleTag: '',
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
  }
  showCharacterEditor.value = true
}

const saveCharacterEdit = async () => {
  const form = characterEditForm.value
  if (!form.name) {
    alert('请填写角色姓名')
    return
  }
  
  const charData = {
    name: form.name,
    gender: form.gender,
    origin: form.origin,
    classId: form.classId,
    role: form.role,
    electivePreference: form.electivePreference,
    scheduleTag: form.scheduleTag,
    personality: { ...form.personality }
  }
  
  if (editingCharacter.value) {
    // 编辑现有
    const idx = allCharactersPool.value.findIndex(c => c.name === editingCharacter.value.name)
    if (idx !== -1) {
      allCharactersPool.value[idx] = charData
    }
  } else {
    // 添加新角色
    if (allCharactersPool.value.find(c => c.name === form.name)) {
      alert('已存在同名角色')
      return
    }
    allCharactersPool.value.push(charData)
  }
  
  // 保存到 IndexedDB
  await saveFullCharacterPool(allCharactersPool.value)
  
  showCharacterEditor.value = false
}

const deleteCharacter = async (char) => {
  if (!confirm(`确定要删除角色 ${char.name} 吗？`)) return
  
  const idx = allCharactersPool.value.findIndex(c => c.name === char.name)
  if (idx !== -1) {
    allCharactersPool.value.splice(idx, 1)
    await saveFullCharacterPool(allCharactersPool.value)
  }
}

// ==================== 保存与重置 ====================
const handleSave = async () => {
  saving.value = true
  try {
    const changes = []
    
    for (const [classId, studentStateMap] of Object.entries(currentRosterState.value)) {
      const fullClass = fullRosterSnapshot.value[classId]
      if (!fullClass) continue
      
      const activeStudents = fullClass.students.filter(s => studentStateMap[s.name])
      
      if (gameStore.allClassData[classId]) {
        gameStore.allClassData[classId].students = JSON.parse(JSON.stringify(toRaw(activeStudents)))
        changes.push(classId)
      }
    }
    
    console.log('[RosterFilter] Syncing changes to Worldbook for classes:', changes)
    let successCount = 0
    for (const classId of changes) {
      const success = await updateClassDataInWorldbook(classId, gameStore.allClassData[classId])
      if (success) successCount++
    }

    if (!isLocked.value) {
      console.log('[RosterFilter] Unlocked mode: Updating backup')
      const newBackup = {}
      
      for (const [classId, studentStateMap] of Object.entries(currentRosterState.value)) {
        const fullClass = fullRosterSnapshot.value[classId]
        if (!fullClass) continue
        
        const keepStudents = fullClass.students.filter(s => studentStateMap[s.name])
        
        if (keepStudents.length > 0) {
          const rawClass = toRaw(fullClass)
          newBackup[classId] = JSON.parse(JSON.stringify(rawClass))
          newBackup[classId].students = JSON.parse(JSON.stringify(toRaw(keepStudents)))
        }
      }
      
      await saveRosterBackup(newBackup)
      fullRosterSnapshot.value = newBackup
    }
    
    alert(`已更新 ${successCount} 个班级的世界书条目！` + (!isLocked.value ? '\n(已同步更新备份)' : ''))
    emit('close')
    
  } catch (e) {
    console.error('[RosterFilter] Error saving:', e)
    alert('保存失败，请检查控制台')
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  if (confirm('确定要将所有选择还原为初始状态（全选）吗？')) {
    for (const [classId, map] of Object.entries(currentRosterState.value)) {
      for (const name in map) {
        map[name] = true
      }
    }
  }
}

const refreshData = async () => {
  if (isLocked.value) {
    alert('当前名册为锁定状态，请先解锁后再读取新名册')
    return
  }
  
  if (confirm('确定要重新读取世界书中的名册数据吗？')) {
    loading.value = true
    try {
      await gameStore.loadClassData()
      await loadData()
      await loadAllCharactersPool()
      alert('名册数据已更新')
    } catch (e) {
      console.error('[RosterFilter] Error refreshing data:', e)
      alert('更新失败')
    } finally {
      loading.value = false
    }
  }
}

// 从备份世界书恢复
const restoreFromBackup = async () => {
  if (!confirm('确定要从备份世界书恢复所有角色数据吗？这将覆盖当前的修改。')) return
  
  loading.value = true
  try {
    const backupData = await restoreFromBackupWorldbook()
    if (backupData) {
      fullRosterSnapshot.value = backupData
      await saveRosterBackup(backupData)
      
      // 更新内存数据
      for (const [classId, classInfo] of Object.entries(backupData)) {
        gameStore.allClassData[classId] = JSON.parse(JSON.stringify(classInfo))
      }
      
      // 同步到世界书
      for (const classId of Object.keys(backupData)) {
        await updateClassDataInWorldbook(classId, backupData[classId])
      }
      
      await loadData()
      await loadAllCharactersPool()
      alert('已从备份恢复所有角色数据')
    } else {
      alert('未找到备份数据')
    }
  } catch (e) {
    console.error('[RosterFilter] Error restoring from backup:', e)
    alert('恢复失败')
  } finally {
    loading.value = false
  }
}

// 创建备份世界书
const createBackup = async () => {
  if (!confirm('确定要创建/更新备份世界书吗？这将保存当前的所有角色数据。')) return
  
  loading.value = true
  try {
    await createDefaultRosterBackupWorldbook(fullRosterSnapshot.value)
    alert('备份世界书已创建/更新')
  } catch (e) {
    console.error('[RosterFilter] Error creating backup:', e)
    alert('创建备份失败')
  } finally {
    loading.value = false
  }
}

// 展开/收起
const toggleExpand = (work) => {
  expandedWorks.value[work] = !expandedWorks.value[work]
}

const expandAll = () => {
  const works = Object.keys(filteredGroups.value)
  if (works.length === 0) return

  let allExpanded = true
  for (const work of works) {
    if (!expandedWorks.value[work]) {
      allExpanded = false
      break
    }
  }
  
  const newExpandedState = { ...expandedWorks.value }
  const targetState = !allExpanded
  
  for (const work of works) {
    newExpandedState[work] = targetState
  }
  
  expandedWorks.value = newExpandedState
}

// 监听标签页切换
watch(activeTab, async (newTab) => {
  if (newTab === 'composer') {
    await initComposer()
  } else if (newTab === 'allCharacters') {
    await loadAllCharactersPool()
  }
})
</script>

<template>
  <Teleport to="body">
    <div class="filter-panel-overlay" @click.self="$emit('close')">
      <div class="filter-panel">
        <div class="panel-header">
          <div class="header-left">
            <span class="header-icon">🎭</span>
            <h3>全校名册管理</h3>
          </div>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>
        
        <!-- 标签页导航 -->
        <div class="tab-nav">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'filter' }"
            @click="activeTab = 'filter'"
          >
            📋 筛选名册
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'composer' }"
            @click="activeTab = 'composer'"
          >
            🏗️ 班级组合器
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'allCharacters' }"
            @click="activeTab = 'allCharacters'"
          >
            👥 全部角色
          </button>
        </div>
        
        <div class="panel-body">
          <!-- ========== 筛选名册面板 ========== -->
          <div v-if="activeTab === 'filter'" class="tab-content">
            <!-- 顶部工具栏 -->
            <div class="toolbar">
              <div class="search-wrapper">
                <span class="search-icon">🔍</span>
                <input 
                  type="text" 
                  v-model="searchQuery" 
                  placeholder="搜索作品或角色..." 
                  class="search-input" 
                />
                <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">×</button>
              </div>
              <div class="toolbar-actions">
                <button class="toolbar-btn" @click="showFilters = !showFilters" title="筛选器">
                  🔧
                </button>
                <button class="toolbar-btn" @click="expandAll" title="全部展开/收起">
                  📂
                </button>
              </div>
            </div>
            
            <!-- 高级筛选器 -->
            <div v-if="showFilters" class="filters-bar">
              <div class="filter-item">
                <label>社团筛选：</label>
                <select v-model="clubFilter" class="filter-select">
                  <option value="">全部</option>
                  <option v-for="club in availableClubs" :key="club" :value="club">{{ club }}</option>
                </select>
              </div>
              <div class="filter-item">
                <label>选课倾向：</label>
                <select v-model="electiveFilter" class="filter-select">
                  <option value="">全部</option>
                  <option v-for="(pref, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
                    {{ pref.icon }} {{ pref.name }}
                  </option>
                </select>
              </div>
              <button class="clear-filters-btn" @click="clubFilter = ''; electiveFilter = ''">清除筛选</button>
            </div>
            
            <!-- 统计信息 -->
            <div class="stats-bar">
              <div class="stat-item">
                <span class="stat-icon">📚</span>
                <span class="stat-label">作品数</span>
                <span class="stat-value">{{ Object.keys(originGroups).length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-icon">👥</span>
                <span class="stat-label">已选/总数</span>
                <span class="stat-value highlight">{{ totalStats.selected }} / {{ totalStats.total }}</span>
              </div>
              <div class="stat-progress">
                <div 
                  class="progress-fill" 
                  :style="{ width: totalStats.total ? (totalStats.selected / totalStats.total * 100) + '%' : '0%' }"
                ></div>
              </div>
            </div>

            <!-- 教师区域 -->
            <div class="section teacher-section">
              <div class="section-header">
                <span class="section-icon">👨‍🏫</span>
                <h4>教师名册</h4>
                <button class="add-btn-small" @click="addNewTeacher">+ 添加</button>
              </div>
              <div class="teacher-grid">
                <div 
                  v-for="teacher in allTeachers" 
                  :key="`${teacher.classId}-${teacher.name}`"
                  class="teacher-card"
                  @click="startEditTeacher(teacher)"
                >
                  <div class="teacher-info">
                    <span class="teacher-name">{{ teacher.name }}</span>
                    <span class="teacher-meta">{{ teacher.gender === 'female' ? '♀' : '♂' }}</span>
                    <span class="teacher-role">{{ teacher.isHeadTeacher ? '班主任' : teacher.subject }}</span>
                  </div>
                  <div class="teacher-class">{{ teacher.className }}</div>
                  <button class="delete-btn-small" @click.stop="deleteTeacher(teacher)">×</button>
                </div>
              </div>
            </div>

            <!-- 学生区域 -->
            <div class="section student-section">
              <div class="section-header">
                <span class="section-icon">👩‍🎓</span>
                <h4>学生列表</h4>
              </div>
              
              <div v-if="loading" class="loading-state">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>
              
              <div v-else class="work-list">
                <div v-for="(students, work) in filteredGroups" :key="work" class="work-group">
                  <div 
                    class="work-header" 
                    :class="{ 
                      'all-selected': getWorkStats(work).all, 
                      'none-selected': getWorkStats(work).none,
                      'expanded': expandedWorks[work]
                    }"
                    @click="toggleExpand(work)"
                  >
                    <div class="header-left">
                      <label class="checkbox-wrapper" @click.stop>
                        <input 
                          type="checkbox" 
                          :checked="getWorkStats(work).all" 
                          :indeterminate="!getWorkStats(work).all && !getWorkStats(work).none"
                          @change="toggleWork(work)"
                        />
                        <span class="checkmark"></span>
                      </label>
                      <span class="work-name">{{ work }}</span>
                      <span class="count-badge" :class="{ 'full': getWorkStats(work).all }">
                        {{ getWorkStats(work).selected }} / {{ getWorkStats(work).total }}
                      </span>
                    </div>
                    <button class="expand-btn">
                      <span class="expand-icon">{{ expandedWorks[work] ? '▲' : '▼' }}</span>
                    </button>
                  </div>
                  
                  <div v-if="expandedWorks[work]" class="student-grid">
                    <div 
                      v-for="student in students" 
                      :key="`${work}-${student.classId}-${student.name}`" 
                      class="student-card" 
                      :class="{ inactive: !currentRosterState[student.classId][student.name] }"
                      @click="currentRosterState[student.classId][student.name] = !currentRosterState[student.classId][student.name]"
                    >
                      <div class="card-checkbox">
                        <input 
                          type="checkbox" 
                          v-model="currentRosterState[student.classId][student.name]"
                          @click.stop
                        />
                      </div>
                      <div class="card-content">
                        <span class="student-name">{{ student.name }}</span>
                        <span class="class-tag">{{ student.classId }}</span>
                        <!-- 社团标签 -->
                        <div v-if="student.clubs && student.clubs.length > 0" class="club-tags">
                          <span 
                            v-for="club in student.clubs" 
                            :key="club.id" 
                            class="club-tag"
                            :title="club.role || '部员'"
                          >
                            {{ club.name }}
                          </span>
                        </div>
                        <!-- 选课倾向 -->
                        <span v-if="student.electivePref && ELECTIVE_PREFERENCES[student.electivePref]" class="elective-tag">
                          {{ ELECTIVE_PREFERENCES[student.electivePref].icon }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div v-if="Object.keys(filteredGroups).length === 0" class="empty-state">
                  <span class="empty-icon">🔎</span>
                  <p>未找到匹配的结果</p>
                  <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">清除搜索</button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- ========== 班级组合器面板 ========== -->
          <div v-if="activeTab === 'composer'" class="tab-content">
            <!-- 预设选择 -->
            <div class="composer-header">
              <div class="preset-selector">
                <label>预设：</label>
                <select v-model="selectedPreset" class="preset-select">
                  <option v-for="(preset, key) in ROSTER_PRESETS" :key="key" :value="key">
                    {{ preset.icon }} {{ preset.name }}
                  </option>
                </select>
                <span class="preset-desc">{{ ROSTER_PRESETS[selectedPreset]?.description }}</span>
              </div>
              <div class="class-selector">
                <label>目标班级：</label>
                <select v-model="composerTargetClass" class="class-select">
                  <option v-for="(classInfo, classId) in fullRosterSnapshot" :key="classId" :value="classId">
                    {{ classInfo.name || classId }}
                  </option>
                </select>
                <button class="add-btn-small" @click="openAddClassModal" title="添加新班级">+</button>
                <button class="delete-btn-inline" @click="deleteClass" title="删除当前班级" :disabled="Object.keys(fullRosterSnapshot).length <= 1">🗑️</button>
              </div>
            </div>
            
            <div class="composer-layout">
              <!-- 当前班级成员 -->
              <div class="composer-panel current-class">
                <h4>当前班级成员 ({{ composerClassData.students?.length || 0 }}人)</h4>
                <div class="composer-list">
                  <div 
                    v-for="(student, index) in composerClassData.students" 
                    :key="student.name"
                    class="composer-item"
                  >
                    <span class="item-name">{{ student.name }}</span>
                    <span class="item-meta">{{ student.gender === 'female' ? '♀' : '♂' }} {{ student.origin }}</span>
                    <button class="remove-btn" @click="removeCharacterFromClass(index)">×</button>
                  </div>
                  <div v-if="!composerClassData.students?.length" class="empty-hint">
                    暂无成员，从右侧添加角色
                  </div>
                </div>
              </div>
              
              <!-- 可用角色池 -->
              <div class="composer-panel available-pool">
                <h4>可用角色池 ({{ availableCharacters.length }}人)</h4>
                <div class="pool-search">
                  <input 
                    type="text" 
                    v-model="composerSearchQuery" 
                    placeholder="搜索角色..."
                    class="pool-search-input"
                  />
                </div>
                <div class="composer-list">
                  <div 
                    v-for="char in filteredAvailableCharacters" 
                    :key="char.name"
                    class="composer-item available"
                    :class="{ 'is-assigned': char.isAssigned }"
                    @click="addCharacterToClass(char)"
                  >
                    <span class="item-name">{{ char.name }}</span>
                    <span class="item-meta">{{ char.gender === 'female' ? '♀' : '♂' }} {{ char.origin }}</span>
                    <span v-if="char.isAssigned" class="assigned-tag" :title="`已分配到 ${char.assignedTo}`">{{ char.assignedTo }}</span>
                    <span class="add-icon">+</span>
                  </div>
                  <div v-if="availableCharacters.length === 0" class="empty-hint">
                    暂无可用角色
                  </div>
                </div>
              </div>
            </div>
            
            <div class="composer-actions">
              <button class="action-btn primary" @click="applyComposerChanges" :disabled="saving">
                {{ saving ? '保存中...' : '💾 应用更改' }}
              </button>
              <button class="action-btn secondary" @click="loadComposerClassData">🔄 重置</button>
            </div>
          </div>
          
          <!-- ========== 全部角色管理面板 ========== -->
          <div v-if="activeTab === 'allCharacters'" class="tab-content">
            <div class="all-char-toolbar">
              <input 
                type="text" 
                v-model="allCharSearchQuery" 
                placeholder="搜索角色..." 
                class="search-input"
              />
              <button class="add-btn" @click="addNewCharacter">+ 添加新角色</button>
            </div>
            
            <div class="all-char-stats">
              <span>总计 {{ allCharactersPool.length }} 个角色</span>
              <span>学生 {{ allCharactersPool.filter(c => c.role === 'student').length }} 人</span>
              <span>教师 {{ allCharactersPool.filter(c => c.role === 'teacher').length }} 人</span>
            </div>
            
            <div v-if="allCharactersPool.length === 0" class="empty-state">
              <span class="empty-icon">👤</span>
              <p>暂无角色数据</p>
              <p class="empty-hint-text">角色数据将从班级名册中自动加载</p>
            </div>
            
            <div v-else class="all-char-list">
              <div 
                v-for="char in filteredAllCharacters" 
                :key="char.name"
                class="char-card"
                @click="startEditCharacter(char)"
              >
                <div class="char-main">
                  <span class="char-name">{{ char.name }}</span>
                  <span class="char-gender">{{ char.gender === 'female' ? '♀' : '♂' }}</span>
                  <span class="char-role" :class="char.role">{{ char.role === 'teacher' ? '教师' : '学生' }}</span>
                </div>
                <div class="char-meta">
                  <span class="char-origin">{{ char.origin }}</span>
                  <span class="char-class">{{ char.classId }}</span>
                </div>
                <div class="char-tags">
                  <span v-if="char.electivePreference && ELECTIVE_PREFERENCES[char.electivePreference]" class="pref-tag">
                    {{ ELECTIVE_PREFERENCES[char.electivePreference].icon }} {{ ELECTIVE_PREFERENCES[char.electivePreference].name }}
                  </span>
                </div>
                <button class="delete-btn-small" @click.stop="deleteCharacter(char)">×</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="panel-footer">
          <div class="left-actions">
            <button class="action-btn text-btn" @click="handleReset">
              🔄 重置全选
            </button>
            <button class="action-btn text-btn" @click="refreshData">
              📥 读取新名册
            </button>
            <button class="action-btn text-btn" @click="createBackup">
              💾 创建备份
            </button>
            <button class="action-btn text-btn" @click="restoreFromBackup">
              📤 从备份恢复
            </button>
            <div class="lock-wrapper">
              <button 
                class="action-btn icon-btn" 
                :class="{ 'locked': isLocked, 'unlocked': !isLocked }"
                @click="isLocked = !isLocked"
                :title="isLocked ? '名册已锁定' : '名册已解锁'"
              >
                {{ isLocked ? '🔒 已锁定' : '🔓 已解锁' }}
              </button>
            </div>
          </div>
          <div class="right-actions">
            <button class="action-btn secondary" @click="$emit('close')">取消</button>
            <button class="action-btn primary" @click="handleSave" :disabled="saving">
              <span v-if="saving" class="btn-spinner"></span>
              <span>{{ saving ? '同步中...' : '💾 确认并同步' }}</span>
            </button>
          </div>
        </div>
        
        <!-- 教师编辑弹窗 -->
        <div v-if="showTeacherEditor" class="modal-overlay" @click.self="showTeacherEditor = false">
          <div class="modal">
            <h3>{{ editingTeacher ? '编辑教师' : '添加教师' }}</h3>
            <div class="form-row">
              <label>姓名：</label>
              <input type="text" v-model="teacherEditForm.name" class="input-field" />
            </div>
            <div class="form-row">
              <label>性别：</label>
              <select v-model="teacherEditForm.gender" class="input-field">
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            <div class="form-row">
              <label>原作：</label>
              <input type="text" v-model="teacherEditForm.origin" class="input-field" />
            </div>
            <div class="form-row">
              <label>班级：</label>
              <select v-model="teacherEditForm.classId" class="input-field">
                <option v-for="(classInfo, classId) in fullRosterSnapshot" :key="classId" :value="classId">
                  {{ classInfo.name || classId }}
                </option>
              </select>
            </div>
            <div class="form-row">
              <label>
                <input type="checkbox" v-model="teacherEditForm.isHeadTeacher" />
                班主任
              </label>
            </div>
            <div v-if="!teacherEditForm.isHeadTeacher" class="form-row">
              <label>科目：</label>
              <input type="text" v-model="teacherEditForm.subject" class="input-field" />
            </div>
            <div class="modal-actions">
              <button class="action-btn primary" @click="saveTeacherEdit">保存</button>
              <button class="action-btn secondary" @click="showTeacherEditor = false">取消</button>
            </div>
          </div>
        </div>
        
        <!-- 角色编辑弹窗 -->
        <div v-if="showCharacterEditor" class="modal-overlay" @click.self="showCharacterEditor = false">
          <div class="modal large-modal">
            <h3>{{ editingCharacter ? '编辑角色' : '添加角色' }}</h3>
            <div class="form-row">
              <label>姓名：</label>
              <input type="text" v-model="characterEditForm.name" class="input-field" />
            </div>
            <div class="form-row">
              <label>性别：</label>
              <select v-model="characterEditForm.gender" class="input-field">
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            <div class="form-row">
              <label>原作：</label>
              <input type="text" v-model="characterEditForm.origin" class="input-field" />
            </div>
            <div class="form-row">
              <label>角色类型：</label>
              <select v-model="characterEditForm.role" class="input-field">
                <option value="student">学生</option>
                <option value="teacher">教师</option>
              </select>
            </div>
            <div class="form-row">
              <label>班级：</label>
              <select v-model="characterEditForm.classId" class="input-field">
                <option value="">无</option>
                <option v-for="(classInfo, classId) in fullRosterSnapshot" :key="classId" :value="classId">
                  {{ classInfo.name || classId }}
                </option>
              </select>
            </div>
            <div v-if="characterEditForm.role === 'student'" class="form-row">
              <label>选课倾向：</label>
              <select v-model="characterEditForm.electivePreference" class="input-field">
                <option v-for="(pref, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
                  {{ pref.icon }} {{ pref.name }}
                </option>
              </select>
            </div>
            <div v-if="characterEditForm.role === 'student'" class="form-row">
              <label>日程模板：</label>
              <select v-model="characterEditForm.scheduleTag" class="input-field">
                <option value="">自动推断</option>
                <option v-for="(tpl, key) in DEFAULT_TEMPLATES" :key="key" :value="key">
                  {{ tpl.name }}
                </option>
              </select>
            </div>
            <!-- 性格滑条 -->
            <div class="personality-section">
              <h4>性格倾向</h4>
              <div v-for="(axis, key) in PERSONALITY_AXES" :key="key" class="axis-row">
                <label>{{ axis.name }}：</label>
                <input type="range" :min="axis.min" :max="axis.max" v-model.number="characterEditForm.personality[key]" />
                <span class="axis-value">{{ characterEditForm.personality[key] }}</span>
              </div>
            </div>
            <div class="modal-actions">
              <button class="action-btn primary" @click="saveCharacterEdit">保存</button>
              <button class="action-btn secondary" @click="showCharacterEditor = false">取消</button>
            </div>
          </div>
        </div>
        
        <!-- 添加班级弹窗 -->
        <div v-if="showAddClassModal" class="modal-overlay" @click.self="showAddClassModal = false">
          <div class="modal">
            <h3>添加新班级</h3>
            <div class="form-row">
              <label>班级ID：</label>
              <input type="text" v-model="newClassForm.id" class="input-field" placeholder="如：class_3_1" />
            </div>
            <div class="form-row">
              <label>班级名称：</label>
              <input type="text" v-model="newClassForm.name" class="input-field" placeholder="如：高三一班" />
            </div>
            <div class="modal-actions">
              <button class="action-btn primary" @click="addClass">创建</button>
              <button class="action-btn secondary" @click="showAddClassModal = false">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 基础变量 */
.filter-panel-overlay {
  --primary-color: #d32f2f;
  --primary-light: #ff6659;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --bg-paper: #fdfbf3;
  --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.15);
  --shadow-strong: 0 8px 30px rgba(0, 0, 0, 0.25);
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
}

/* 遮罩层 */
.filter-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  padding: 10px;
  box-sizing: border-box;
}

/* 主面板 */
.filter-panel {
  width: 100%;
  max-width: 1000px;
  height: 90vh;
  max-height: 850px;
  background: linear-gradient(135deg, #fdfbf3 0%, #fff9e6 100%);
  border-radius: 16px;
  box-shadow: var(--shadow-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #ffecb3 0%, #ffe082 100%);
  border-bottom: 2px solid #ffd54f;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.panel-header .header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 1.5rem;
}

.panel-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.4rem;
  font-family: 'Ma Shan Zheng', cursive;
}

.close-btn {
  background: rgba(255, 255, 255, 0.8);
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: #ff5252;
  color: white;
  transform: rotate(90deg);
}

/* 标签页导航 */
.tab-nav {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  background: #fafafa;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  font-family: 'Ma Shan Zheng', cursive;
  color: #666;
  transition: all var(--transition-fast);
  border-bottom: 3px solid transparent;
}

.tab-btn:hover {
  background: #f0f0f0;
}

.tab-btn.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  background: white;
}

/* 内容区 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.tab-content {
  padding: 20px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.search-wrapper {
  flex: 1;
  max-width: 400px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  font-size: 1rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 40px 12px 42px;
  border: 2px solid #e0e0e0;
  border-radius: 25px;
  font-size: 1rem;
  transition: all var(--transition-fast);
  background: white;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.1);
}

.clear-search {
  position: absolute;
  right: 12px;
  background: #e0e0e0;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #666;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all var(--transition-fast);
}

.toolbar-btn:hover {
  border-color: var(--primary-color);
  background: #fff5f5;
}

/* 筛选器栏 */
.filters-bar {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-item label {
  font-size: 0.9rem;
  color: #666;
}

.filter-select {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
}

.clear-filters-btn {
  padding: 6px 12px;
  background: #e0e0e0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%);
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 1.2rem;
}

.stat-label {
  color: #666;
  font-size: 0.9rem;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 1.1rem;
}

.stat-value.highlight {
  color: var(--primary-color);
}

.stat-progress {
  flex: 1;
  min-width: 100px;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--success-color) 0%, #81c784 100%);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* 区块 */
.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

.section-icon {
  font-size: 1.2rem;
}

.section h4 {
  margin: 0;
  color: var(--primary-color);
  font-size: 1.1rem;
  font-family: 'Ma Shan Zheng', cursive;
  flex: 1;
}

.add-btn-small {
  padding: 4px 10px;
  background: var(--success-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.delete-btn-inline {
  padding: 4px 8px;
  background: none;
  border: 1px solid #ff5252;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #ff5252;
  transition: all var(--transition-fast);
}

.delete-btn-inline:hover:not(:disabled) {
  background: #ff5252;
  color: white;
}

.delete-btn-inline:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 教师网格 */
.teacher-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.teacher-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.teacher-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.teacher-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.teacher-name {
  font-weight: 600;
}

.teacher-meta {
  color: #888;
  font-size: 0.9rem;
}

.teacher-role {
  font-size: 0.8rem;
  color: #666;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
}

.teacher-class {
  font-size: 0.8rem;
  color: #888;
}

.delete-btn-small {
  position: absolute;
  top: 4px;
  right: 4px;
  background: none;
  border: none;
  color: #ff5252;
  cursor: pointer;
  font-size: 1.2rem;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.teacher-card:hover .delete-btn-small,
.char-card:hover .delete-btn-small {
  opacity: 1;
}

/* 作品列表 */
.work-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-group {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  transition: all var(--transition-fast);
}

.work-header {
  padding: 14px 16px;
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
  border-left: 4px solid transparent;
}

.work-header.all-selected {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border-left-color: var(--success-color);
}

.work-header.none-selected {
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  border-left-color: #ef5350;
}

.work-header .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

/* 复选框 */
.checkbox-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  width: 0;
  height: 0;
}

.checkmark {
  width: 22px;
  height: 22px;
  border: 2px solid #bbb;
  border-radius: 6px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.checkbox-wrapper input:checked ~ .checkmark {
  background: var(--success-color);
  border-color: var(--success-color);
}

.checkbox-wrapper input:checked ~ .checkmark::after {
  content: '✓';
  color: white;
  font-size: 14px;
  font-weight: bold;
}

.checkbox-wrapper input:indeterminate ~ .checkmark {
  background: var(--warning-color);
  border-color: var(--warning-color);
}

.checkbox-wrapper input:indeterminate ~ .checkmark::after {
  content: '−';
  color: white;
  font-size: 16px;
  font-weight: bold;
}

.work-name {
  font-weight: 600;
  font-size: 1rem;
  color: #333;
}

.count-badge {
  background: rgba(0, 0, 0, 0.08);
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
}

.count-badge.full {
  background: linear-gradient(135deg, var(--success-color) 0%, #81c784 100%);
  color: white;
}

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
}

.expand-icon {
  font-size: 0.8rem;
  color: #888;
}

/* 学生网格 */
.student-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  background: #fafafa;
}

.student-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.student-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.15);
}

.student-card.inactive {
  opacity: 0.5;
  background: #f5f5f5;
}

.card-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--success-color);
}

.card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.student-name {
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

.class-tag {
  font-size: 0.75rem;
  color: #888;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
  align-self: flex-start;
}

.club-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.club-tag {
  font-size: 0.7rem;
  color: #1976d2;
  background: #e3f2fd;
  padding: 2px 6px;
  border-radius: 8px;
}

.elective-tag {
  font-size: 0.9rem;
  margin-top: 4px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 20px;
  color: #888;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-hint-text {
  font-size: 0.85rem;
  color: #aaa;
  margin-top: 8px;
}

.clear-btn {
  margin-top: 16px;
  padding: 10px 20px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 20px;
  cursor: pointer;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: #888;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f0f0f0;
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 班级组合器 */
.composer-header {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.preset-selector,
.class-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select,
.class-select {
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
}

.preset-desc {
  color: #888;
  font-size: 0.85rem;
}

.composer-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.composer-panel {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 16px;
}

.composer-panel h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 1rem;
}

.composer-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
  transition: all var(--transition-fast);
}

.composer-item.available {
  cursor: pointer;
}

.composer-item.available:hover {
  background: #e8f5e9;
}

.composer-item.is-assigned {
  opacity: 0.6;
  background: #f5f5f5;
}

.composer-item.is-assigned:hover {
  background: #fff3e0;
}

.item-name {
  font-weight: 600;
  flex: 1;
}

.item-meta {
  color: #888;
  font-size: 0.85rem;
}

.assigned-tag {
  font-size: 0.7rem;
  color: #e65100;
  background: #fff3e0;
  padding: 2px 6px;
  border-radius: 8px;
  white-space: nowrap;
}

.remove-btn {
  background: none;
  border: none;
  color: #ff5252;
  cursor: pointer;
  font-size: 1.2rem;
}

.add-icon {
  color: var(--success-color);
  font-size: 1.2rem;
  font-weight: bold;
}

.pool-search {
  margin-bottom: 12px;
}

.pool-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.empty-hint {
  color: #888;
  text-align: center;
  padding: 20px;
}

.composer-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

/* 全部角色管理 */
.all-char-toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.all-char-toolbar .search-input {
  flex: 1;
  padding: 10px 16px;
}

.add-btn {
  padding: 10px 20px;
  background: var(--success-color);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
}

.all-char-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  color: #666;
  font-size: 0.9rem;
}

.all-char-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.char-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.char-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.char-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.char-name {
  font-weight: 600;
  font-size: 1rem;
}

.char-gender {
  color: #888;
}

.char-role {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
}

.char-role.student {
  background: #e3f2fd;
  color: #1976d2;
}

.char-role.teacher {
  background: #fff3e0;
  color: #e65100;
}

.char-meta {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 6px;
}

.char-tags {
  display: flex;
  gap: 6px;
}

.pref-tag {
  font-size: 0.75rem;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 8px;
}

/* 底部 */
.panel-footer {
  padding: 16px 20px;
  border-top: 2px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 12px;
}

.left-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.right-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  font-family: 'Ma Shan Zheng', cursive;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn.primary {
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.3);
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.4);
}

.action-btn.primary:disabled {
  background: #bdbdbd;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

.action-btn.secondary {
  background: white;
  color: #666;
  border: 2px solid #ddd;
}

.action-btn.secondary:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

.text-btn {
  background: none;
  color: #1976d2;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.text-btn:hover {
  background: rgba(25, 118, 210, 0.1);
}

.icon-btn {
  font-size: 0.85rem;
  border: 1px solid #ccc;
  background: #f5f5f5;
  color: #666;
}

.icon-btn.locked {
  background: #e8f5e9;
  border-color: #4caf50;
  color: #2e7d32;
}

.icon-btn.unlocked {
  background: #ffebee;
  border-color: #ef5350;
  color: #c62828;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.modal {
  background: white;
  padding: 24px;
  border-radius: 12px;
  width: 400px;
  max-width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
}

.modal.large-modal {
  width: 500px;
}

.modal h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-family: 'Ma Shan Zheng', cursive;
}

.form-row {
  margin-bottom: 16px;
}

.form-row label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #555;
}

.input-field {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary-color);
}

.personality-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.personality-section h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 0.95rem;
}

.axis-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.axis-row label {
  width: 80px;
  font-size: 0.85rem;
  margin-bottom: 0;
}

.axis-row input[type="range"] {
  flex: 1;
}

.axis-value {
  width: 30px;
  text-align: right;
  font-weight: 600;
  font-size: 0.85rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* 自定义滚动条 */
.panel-body::-webkit-scrollbar,
.composer-list::-webkit-scrollbar,
.modal::-webkit-scrollbar {
  width: 8px;
}

.panel-body::-webkit-scrollbar-track,
.composer-list::-webkit-scrollbar-track,
.modal::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb,
.composer-list::-webkit-scrollbar-thumb,
.modal::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.panel-body::-webkit-scrollbar-thumb:hover,
.composer-list::-webkit-scrollbar-thumb:hover,
.modal::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .filter-panel {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .tab-btn {
    font-size: 0.9rem;
    padding: 10px 8px;
  }
  
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-wrapper {
    max-width: none;
  }
  
  .composer-layout {
    grid-template-columns: 1fr;
  }
  
  .student-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  
  .panel-footer {
    padding: 12px 16px;
  }
  
  .left-actions {
    width: 100%;
    margin-bottom: 8px;
  }
  
  .right-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
