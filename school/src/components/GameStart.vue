<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import CustomOptionPanel from './CustomOptionPanel.vue'
import AttributeAllocationPanel from './AttributeAllocationPanel.vue'
import StudentProfile from './StudentProfile.vue'
import ClassRosterPanel from './ClassRosterPanel.vue'
import CourseEditor from './CourseEditor.vue'
import SchoolRosterFilterPanel from './SchoolRosterFilterPanel.vue'
import EventEditorPanel from './EventEditorPanel.vue'
import NpcScheduleEditorPanel from './NpcScheduleEditorPanel.vue'
import DataTransferPanel from './DataTransferPanel.vue'
import MapEditorPanel from './MapEditorPanel.vue'
import { setPlayerClass, setupTeacherClassEntries, fetchMapDataFromWorldbook } from '../utils/worldbookParser'
import { DEFAULT_FORUM_POSTS, saveForumToWorldbook } from '../utils/forumWorldbook'
import { getCoursePoolState, getElectiveCourses, getRequiredCourses, UNIVERSAL_ELECTIVES, GRADE_1_COURSES, GRADE_2_COURSES, GRADE_3_COURSES, registerCustomCourse, saveCoursePoolToWorldbook, ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { generateIndependentTeacherSchedule, getTermInfo, LOCATION_NAMES } from '../utils/scheduleGenerator'
import { mapData, setMapData } from '../data/mapData'

const props = defineProps({
  mode: { type: String, default: 'single' }, // 'single' | 'multiplayer'
  initialPreset: { type: Object, default: null } // 联机模式下自动加载的预设
})
const emit = defineEmits(['back', 'startGame'])
const gameStore = useGameStore()
const mpStore = useMultiplayerStore()

// 联机模式下仅房主可修改班级名册
const canEditRoster = computed(() => {
  if (props.mode !== 'multiplayer') return true
  return mpStore.isHost
})

onMounted(async () => {
  await gameStore.loadClassData()
  if (mapData.length === 0) {
    const loadedMapData = await fetchMapDataFromWorldbook()
    if (Array.isArray(loadedMapData) && loadedMapData.length > 0) {
      setMapData(loadedMapData)
    }
  }
  loadPresetsFromStorage()
  // 联机模式下自动加载传入的预设
  if (props.initialPreset?.data) {
    await nextTick()
    await applyPreset(props.initialPreset)
  }
})

const showProfile = ref(false)
const showRoster = ref(false)
const showCourseEditor = ref(false)
const showFilterPanel = ref(false)
const showEventEditor = ref(false)
const showScheduleEditor = ref(false)
const showTransferPanel = ref(false)

// 角色类型选择
const playerRole = ref('student') // 'student' | 'teacher'

const formData = ref({
  name: '',
  characterFeature: '', // 角色特征
  backgroundStory: '', // 角色背景故事
  gender: 'male',
  classId: '',
  gameMode: 'normal', // 默认普通模式
  expDifficulty: 'normal', // 经验难度：easy/normal/hard
  familyBackground: 'f1', // 默认普通家庭
  childhood: ['', '', ''],
  elementary: ['', '', ''],
  middleSchool: ['', '', ''],
  talents: ['', '', '', '', '', ''],
  allocatedAttributes: {
    attributes: {},
    subjects: {},
    skills: {},
    potentials: {}
  }
})

// 教师模式专用数据
const teacherData = ref({
  teachingClasses: [],      // 教授的班级ID列表 (1~5)
  homeroomClassIds: [],     // 担任班主任的班级ID列表 (支持多班主任)
  homeroomClassId: '',      // [兼容] 旧版单班主任
  classSubjectMap: {},      // 按班级分配学科 { '1-A': ['数学'], '1-B': ['英语'] }
  teachingSubjects: [],     // [兼容] 旧版全局学科
  teachingElectives: [],    // 教授的选修课ID
  customCourses: []         // 自定义课程列表
})

// 预设相关状态
const showPresetModal = ref(false)
const presets = ref([])
const newPresetName = ref('')
const isLoadingPreset = ref(false)

const loadPresetsFromStorage = () => {
  try {
    const stored = localStorage.getItem('school_game_start_presets')
    if (stored) {
      presets.value = JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load presets', e)
  }
}

const saveCurrentPreset = () => {
  if (!newPresetName.value.trim()) {
    alert('请输入预设名称')
    return
  }
  
  const preset = {
    name: newPresetName.value.trim(),
    timestamp: Date.now(),
    data: {
      playerRole: playerRole.value,
      formData: JSON.parse(JSON.stringify(formData.value)),
      teacherData: JSON.parse(JSON.stringify(teacherData.value)),
      customData: {
        ...JSON.parse(JSON.stringify(customData.value)),
        classRoster: null // 不保存班级名册的修改
      }
    }
  }
  
  presets.value.push(preset)
  localStorage.setItem('school_game_start_presets', JSON.stringify(presets.value))
  newPresetName.value = ''
  alert('预设保存成功！')
}

const applyPreset = async (preset) => {
  if (!confirm(`确定要读取预设 "${preset.name}" 吗？当前未保存的设置将会丢失。`)) return

  isLoadingPreset.value = true
  
  try {
    const data = preset.data
    
    // 先恢复角色类型
    playerRole.value = data.playerRole
    
    // 等待 Vue 响应系统处理
    await nextTick()
    
    // 恢复表单数据
    formData.value = JSON.parse(JSON.stringify(data.formData))
    
    // 恢复教师数据
    teacherData.value = JSON.parse(JSON.stringify(data.teacherData))

    // 旧预设兼容迁移
    if (teacherData.value.homeroomClassId && !teacherData.value.homeroomClassIds) {
      teacherData.value.homeroomClassIds = teacherData.value.homeroomClassId ? [teacherData.value.homeroomClassId] : []
    }
    if (!teacherData.value.homeroomClassIds) {
      teacherData.value.homeroomClassIds = []
    }
    if (!teacherData.value.classSubjectMap) {
      teacherData.value.classSubjectMap = {}
    }
    if (teacherData.value.teachingSubjects?.length > 0 && Object.keys(teacherData.value.classSubjectMap).length === 0) {
      teacherData.value.teachingClasses.forEach(classId => {
        teacherData.value.classSubjectMap[classId] = [...teacherData.value.teachingSubjects]
      })
    }
    
    // 恢复自定义数据
    const restoredCustom = JSON.parse(JSON.stringify(data.customData))
    restoredCustom.classRoster = null
    customData.value = restoredCustom
    
    // 如果有班级ID，刷新一下名册引用
    if (formData.value.classId && gameStore.world.allClassData[formData.value.classId]) {
      customData.value.classRoster = JSON.parse(JSON.stringify(gameStore.world.allClassData[formData.value.classId]))
    }

    showPresetModal.value = false
    // alert(`预设 "${preset.name}" 读取成功！`)
  } catch (e) {
    console.error('Failed to load preset', e)
    alert('读取预设失败')
  } finally {
    // 延迟关闭标志位，确保 watch 不会被触发
    setTimeout(() => {
      isLoadingPreset.value = false
    }, 100)
  }
}

const removePreset = (index) => {
  if (!confirm('确定要删除这个预设吗？')) return
  presets.value.splice(index, 1)
  localStorage.setItem('school_game_start_presets', JSON.stringify(presets.value))
}

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

// 自定义课程相关状态
const showAddCourseModal = ref(false)
const showCourseLocationPicker = ref(false)
const newCourseForm = ref({
  name: '',
  type: 'elective',
  grade: 'universal',
  preference: 'general',
  location: 'classroom'
})

const getCourseLocationLabel = (locationId) => {
  if (!locationId) return '未设置'
  if (locationId === 'classroom') return '普通教室'
  const mapItem = mapData.find(item => item.id === locationId)
  return mapItem?.name || LOCATION_NAMES?.[locationId] || locationId
}

const handleSelectCourseLocation = () => {
  showCourseLocationPicker.value = true
}

const handleCourseLocationSelected = (location) => {
  newCourseForm.value.location = location.id
  showCourseLocationPicker.value = false
}

const openAddCourseModal = () => {
  newCourseForm.value = { name: '', type: 'elective', grade: 'universal', preference: 'general', location: 'classroom' }
  showAddCourseModal.value = true
}

const addCustomCourse = () => {
  if (!newCourseForm.value.name) return
  
  if (!teacherData.value.customCourses) teacherData.value.customCourses = []
  
  // 保存自定义课程配置
  teacherData.value.customCourses.push({ ...newCourseForm.value })
  
  // 按课程类型分流
  if (newCourseForm.value.type === 'elective') {
    if (!teacherData.value.customElectiveNames) teacherData.value.customElectiveNames = []
    teacherData.value.customElectiveNames.push(newCourseForm.value.name)
    // 自动选中这个自定义选修课
    const pendingId = `pending_custom_${teacherData.value.customElectiveNames.length - 1}_${newCourseForm.value.name}`
    if (!teacherData.value.teachingElectives.includes(pendingId)) {
      teacherData.value.teachingElectives.push(pendingId)
    }
  } else {
    // 必修课：为所有已选班级添加该学科
    for (const classId of teacherData.value.teachingClasses) {
      if (!teacherData.value.classSubjectMap[classId]) {
        teacherData.value.classSubjectMap[classId] = []
      }
      if (!teacherData.value.classSubjectMap[classId].includes(newCourseForm.value.name)) {
        teacherData.value.classSubjectMap[classId].push(newCourseForm.value.name)
      }
    }
  }
  
  showAddCourseModal.value = false
}

const removeCustomCourse = (idx) => {
  const course = teacherData.value.customCourses[idx]
  if (!course) return

  if (course.type === 'elective') {
    // 移除 customElectiveNames 中对应的名称
    if (teacherData.value.customElectiveNames) {
      const nameIdx = teacherData.value.customElectiveNames.indexOf(course.name)
      if (nameIdx > -1) teacherData.value.customElectiveNames.splice(nameIdx, 1)
    }
    // 移除 teachingElectives 中对应的 pending ID
    teacherData.value.teachingElectives = teacherData.value.teachingElectives.filter(
      id => !(id.startsWith('pending_custom_') && id.endsWith(`_${course.name}`))
    )
  } else {
    // 必修课：从所有班级的 classSubjectMap 中移除
    for (const classId of Object.keys(teacherData.value.classSubjectMap)) {
      const arr = teacherData.value.classSubjectMap[classId]
      if (arr) {
        const subjIdx = arr.indexOf(course.name)
        if (subjIdx > -1) arr.splice(subjIdx, 1)
      }
    }
  }

  // 从 customCourses 中移除
  teacherData.value.customCourses.splice(idx, 1)
}

// 可选学科列表 (更新为更准确的名称)
const subjectOptions = [
  { key: 'literature', label: '国语' },
  { key: 'math', label: '数学' },
  { key: 'english', label: '英语' },
  { key: 'history', label: '历史' },
  { key: 'geography', label: '地理' },
  { key: 'physics', label: '物理' },
  { key: 'chemistry', label: '化学' },
  { key: 'biology', label: '生物' },
  { key: 'art', label: '美术' },
  { key: 'music', label: '音乐' },
  { key: 'sports', label: '体育' }
]

// 获取所有可选的选修课（不分年级）
const allElectiveOptions = computed(() => {
  const allElectives = [
    ...UNIVERSAL_ELECTIVES,
    ...(GRADE_1_COURSES.electives || []),
    ...(GRADE_2_COURSES.electives || []),
    ...(GRADE_3_COURSES.electives || [])
  ]
  // 追加自定义选修课（尚未注册到课程池的）
  if (teacherData.value.customCourses) {
    teacherData.value.customCourses
      .filter(c => c.type === 'elective')
      .forEach((c, i) => {
        allElectives.push({
          id: `pending_custom_${i}_${c.name}`,
          name: c.name,
          _isCustomPending: true
        })
      })
  }
  // 去重
  const seen = new Set()
  return allElectives.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
})

// 切换教授班级
const toggleTeachingClass = (classId) => {
  const idx = teacherData.value.teachingClasses.indexOf(classId)
  if (idx > -1) {
    teacherData.value.teachingClasses.splice(idx, 1)
    // 如果该班级是班主任班级，也取消
    const hIdx = teacherData.value.homeroomClassIds.indexOf(classId)
    if (hIdx > -1) {
      teacherData.value.homeroomClassIds.splice(hIdx, 1)
    }
    // 清理该班级的学科分配
    delete teacherData.value.classSubjectMap[classId]
  } else {
    if (teacherData.value.teachingClasses.length >= 5) {
      alert('最多只能选择5个班级！')
      return
    }
    teacherData.value.teachingClasses.push(classId)
    // 初始化该班级的学科分配为空数组
    if (!teacherData.value.classSubjectMap[classId]) {
      teacherData.value.classSubjectMap[classId] = []
    }
  }
}

// 切换班主任班级 (多选)
const toggleHomeroomClass = (classId) => {
  const idx = teacherData.value.homeroomClassIds.indexOf(classId)
  if (idx > -1) {
    teacherData.value.homeroomClassIds.splice(idx, 1)
  } else {
    teacherData.value.homeroomClassIds.push(classId)
  }
}

// 获取所有班级中已选学科的去重合集 (用于兼容旧字段 teachingSubjects)
const getAllSelectedSubjects = () => {
  const set = new Set()
  for (const subjects of Object.values(teacherData.value.classSubjectMap)) {
    subjects.forEach(s => set.add(s))
  }
  return [...set]
}

// 切换某个班级的教授学科
const toggleClassSubject = (classId, label) => {
  if (!teacherData.value.classSubjectMap[classId]) {
    teacherData.value.classSubjectMap[classId] = []
  }
  const arr = teacherData.value.classSubjectMap[classId]
  const idx = arr.indexOf(label)
  if (idx > -1) {
    arr.splice(idx, 1)
  } else {
    arr.push(label)
  }
}

// [兼容] 旧版全局切换 — 仅用于自定义必修课添加时的回退
const toggleTeachingSubject = (label) => {
  // 新逻辑：为所有已选班级添加/移除该学科
  for (const classId of teacherData.value.teachingClasses) {
    if (!teacherData.value.classSubjectMap[classId]) {
      teacherData.value.classSubjectMap[classId] = []
    }
    const arr = teacherData.value.classSubjectMap[classId]
    const idx = arr.indexOf(label)
    if (idx === -1) {
      arr.push(label)
    }
  }
}

// 切换教授选修课
const toggleTeachingElective = (id) => {
  const idx = teacherData.value.teachingElectives.indexOf(id)
  if (idx > -1) {
    teacherData.value.teachingElectives.splice(idx, 1)
  } else {
    teacherData.value.teachingElectives.push(id)
  }
}

// 当角色类型切换时，重置不需要的数据
watch(playerRole, (newRole) => {
  if (isLoadingPreset.value) return // 如果正在加载预设，跳过重置逻辑

  // 重置属性分配，防止跨模式残留
  formData.value.allocatedAttributes = {
    attributes: {},
    subjects: {},
    skills: {},
    potentials: {}
  }

  if (newRole === 'teacher') {
    // 清空学生专属数据
    formData.value.classId = ''
    formData.value.childhood = ['', '', '']
    formData.value.elementary = ['', '', '']
    formData.value.middleSchool = ['', '', '']
  } else {
    // 清空教师专属数据
    teacherData.value.teachingClasses = []
    teacherData.value.homeroomClassIds = []
    teacherData.value.homeroomClassId = ''
    teacherData.value.classSubjectMap = {}
    teacherData.value.teachingSubjects = []
    teacherData.value.teachingElectives = []
  }
})

// 默认自定义数据结构
const defaultCustomData = () => ({
  optionName: '',
  description: '',
  money: 1000,
  attributes: { iq: 0, eq: 0, physique: 0, flexibility: 0, charm: 0, mood: 0 },
  subjects: { literature: 0, math: 0, english: 0, humanities: 0, sciences: 0, art: 0, sports: 0 },
  skills: { programming: 0, painting: 0, guitar: 0, piano: 0, urbanLegend: 0, cooking: 0, hacking: 0, socialMedia: 0, photography: 0, videoEditing: 0 }
})

// 自定义选项数据
const customData = ref({
  family: defaultCustomData(),
  childhood: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  elementary: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  middleSchool: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  talents: [defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData()],
  classRoster: null // 存储班级名册的修改
})

// 监听班级选择变化，重置名册数据
watch(() => formData.value.classId, (newId) => {
  if (newId && gameStore.world.allClassData[newId]) {
    customData.value.classRoster = JSON.parse(JSON.stringify(gameStore.world.allClassData[newId]))
  } else {
    customData.value.classRoster = null
  }
})

// 处理全校名册筛选关闭后的刷新
const handleFilterClose = () => {
  showFilterPanel.value = false
  // 如果当前已选班级，需要刷新本地数据，因为全校筛选可能修改了该班级数据
  if (formData.value.classId && gameStore.world.allClassData[formData.value.classId]) {
    console.log('[GameStart] Refreshing local roster after filter update')
    customData.value.classRoster = JSON.parse(JSON.stringify(gameStore.world.allClassData[formData.value.classId]))
  }
}

// 生成班级名册文本
const classInfoText = computed(() => {
  const roster = customData.value.classRoster
  if (!roster) return '（请选择班级以查看名册）'

  let text = `【班级】${roster.name || formData.value.classId}\n`
  text += `【班主任】${roster.headTeacher?.name || '未设置'}\n`
  
  const teachers = roster.teachers || []
  if (teachers.length > 0) {
    text += `【科任教师】\n`
    teachers.forEach(t => {
      text += `  - ${t.subject || '未设置'}: ${t.name || '未设置'}\n`
    })
  }

  const students = roster.students || []
  if (students.length > 0) {
    text += `【学生名单 (${students.length}人)】\n`
    // 每行显示3个学生，避免列表过长
    const names = students.map(s => s.name || '未知')
    for (let i = 0; i < names.length; i += 3) {
      text += `  ${names.slice(i, i + 3).join(', ')}\n`
    }
  }

  return text
})

// 属性映射表 (中文 -> 英文)
const attrMap = {
  '智商': 'iq', '情商': 'eq', '体能': 'physique', '灵活': 'flexibility', '魅力': 'charm', '心境': 'mood',
  '语文': 'literature', '数学': 'math', '外语': 'english', '文科综合': 'humanities', '理科综合': 'sciences', '艺术': 'art', '体育': 'sports',
  '编程': 'programming', '绘画': 'painting', '吉他演奏': 'guitar', '钢琴演奏': 'piano', '都市传说': 'urbanLegend', '烹饪': 'cooking', '黑客技术': 'hacking', '社交媒体运营': 'socialMedia', '摄影': 'photography', '视频编辑': 'videoEditing'
}

// 属性定义
const attributesList = [
  { key: 'iq', label: '智商' },
  { key: 'eq', label: '情商' },
  { key: 'physique', label: '体能' },
  { key: 'flexibility', label: '灵活' },
  { key: 'charm', label: '魅力' },
  { key: 'mood', label: '心境' }
]

// 经历数据
const childhoodOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'c1', name: '沉迷阅读（10点）', cost: 10, desc: '总是在图书馆度过，不善交际。', effects: { attr: { '智商': 3, '情商': -1 } } },
  { id: 'c2', name: '街头霸王（10点）', cost: 10, desc: '经常和附近的孩子打架，头脑简单。', effects: { attr: { '体能': 3, '智商': -1 } } },
  { id: 'c3', name: '万众瞩目（10点）', cost: 10, desc: '从小就是孩子王，有些自负。', effects: { attr: { '情商': 3, '心境': -2 } } },
  { id: 'c4', name: '体弱多病（-15点）', cost: -15, desc: '经常出入医院，错过了很多集体活动。', effects: { attr: { '体能': -3 } } },
  { id: 'c5', name: '艺术熏陶（10点）', cost: 10, desc: '从小学习钢琴或绘画，占用了大量运动时间。', effects: { attr: { '魅力': 3, '体能': -1 } } },
  { id: 'c6', name: '勤工俭学（5点）', cost: 5, desc: '很早就开始打工，见识了社会的复杂。', effects: { attr: { '心境': 2 } } },
  { id: 'c7', name: '随风奔跑（10点）', cost: 10, desc: '热衷于田径和各种运动，但对学习缺乏兴趣。', effects: { attr: { '灵活': 3, '智商': -1 } } },
  { id: 'c8', name: '孤独的思考者（5点）', cost: 5, desc: '总是独来独往，喜欢观察和思考。', effects: { attr: { '心境': 5, '情商': -1 } } },
  { id: 'c9', name: '神秘的邂逅（20点）', cost: 20, desc: '幼时曾遇到过无法解释的奇妙事件，解锁“都市传说”初始技能。', effects: { skill: { '都市传说': 1 } } },
  { id: 'c10', name: '动物朋友（5点）', cost: 5, desc: '总是和附近的流浪猫狗玩在一起。', effects: { attr: { '情商': 1, '魅力': 1 } } },
  { id: 'c11', name: '拆卸专家（5点）', cost: 5, desc: '对家里的各种电器都很好奇并付诸行动。', effects: { attr: { '智商': 2 } } },
  { id: 'c12', name: '谎言神童（10点）', cost: 10, desc: '你很小就学会了如何用谎言达成目的。', effects: { attr: { '情商': 2, '心境': -1 } } }
]

const elementaryOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'e1', name: '奥数冠军（15点）', cost: 15, desc: '在各种数学竞赛中崭露头角。', effects: { knowledge: { '数学': 5 }, attr: { '智商': 1 } } },
  { id: 'e2', name: '作文新星（10点）', cost: 10, desc: '你的作文经常被当作范文朗读。', effects: { knowledge: { '语文': 5 }, attr: { '魅力': 1 } } },
  { id: 'e3', name: '运动健将（10点）', cost: 10, desc: '校运会记录的保持者。', effects: { attr: { '体能': 2, '灵活': 1 } } },
  { id: 'e4', name: '电脑小天才（15点）', cost: 15, desc: '很早就接触了计算机并展现出天赋。', effects: { skill: { '编程': 1 }, attr: { '智商': 1 } } },
  { id: 'e5', name: '大队长（10点）', cost: 10, desc: '作为学生干部，锻炼了管理和交际能力。', effects: { attr: { '情商': 2 } } },
  { id: 'e6', name: '校园小霸王（-10点）', cost: -10, desc: '因为经常欺负同学而臭名昭著。', effects: { attr: { '体能': 2, '情商': -2, '魅力': -2 } } },
  { id: 'e7', name: '小小发明家（15点）', cost: 15, desc: '热爱科学实验，偶尔会引发小小的骚动。', effects: { knowledge: { '理科综合': 3 }, skill: { '编程': 1 }, attr: { '魅力': -1 } } },
  { id: 'e8', name: '故事大王（10点）', cost: 10, desc: '总能绘声绘色地讲述各种故事。', effects: { attr: { '魅力': 2, '情商': 1 } } },
  { id: 'e9', name: '乐器神童（15点）', cost: 15, desc: '在音乐方面展现出非凡的才能。', effects: { skill: { '钢琴演奏': 1 }, attr: { '魅力': 2 } } },
  { id: 'e10', name: '家务能手（5点）', cost: 5, desc: '帮助父母分担家务，厨艺小有所成。', effects: { knowledge: { '艺术': 1 }, attr: { '心境': 2 } } },
  { id: 'e11', name: '转学生（0点）', cost: 0, desc: '小学时转学，需要适应新环境。', effects: { attr: { '情商': 1, '心境': -1 } } },
  { id: 'e12', name: '被孤立者（-15点）', cost: -15, desc: '因为某个原因，被班上的同学孤立。', effects: { attr: { '心境': -5, '情商': -2 } } }
]

const middleSchoolOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'm1', name: '中二病全开（5点）', cost: 5, desc: '沉浸在自己的幻想世界里。', effects: { skill: { '都市传说': 2 }, attr: { '情商': -1 } } },
  { id: 'm2', name: '叛逆的摇滚魂（15点）', cost: 15, desc: '组建了自己的第一支乐队。', effects: { skill: { '吉他演奏': 2 }, attr: { '魅力': 2 } } },
  { id: 'm3', name: '学生会精英（20点）', cost: 20, desc: '在学生会身居高位，处理各种复杂事务。', effects: { attr: { '情商': 3, '智商': 1 } } },
  { id: 'm4', name: '网瘾少年（-5点）', cost: -5, desc: '将大量时间投入到了网络游戏中。', effects: { attr: { '灵活': 2, '体能': -2 }, knowledge: { '数学': -5 } } },
  { id: 'm5', name: '早恋（10点）', cost: 10, desc: '经历了一段青涩的恋爱。', effects: { attr: { '情商': 2, '心境': 5 }, knowledge: { '外语': -5 } } },
  { id: 'm6', name: '发奋图强（20点）', cost: 20, desc: '为了考上天华学园而拼命学习。', effects: { knowledge: { all: 3 }, attr: { '心境': -5 } } },
  { id: 'm7', name: '博客写手（10点）', cost: 10, desc: '经营着一个颇有人气的个人博客。', effects: { skill: { '编程': 1 }, attr: { '魅力': 1 } } },
  { id: 'm8', name: '料理达人（10点）', cost: 10, desc: '你的厨艺让家人和朋友赞不绝口。', effects: { knowledge: { '艺术': 2 }, attr: { '魅力': 1 } } },
  { id: 'm9', name: '秘密社团（15点）', cost: 15, desc: '加入了一个研究超自然现象的秘密社团。', effects: { skill: { '都市传说': 3 }, attr: { '智商': 1 } } },
  { id: 'm10', name: '打架专家（-5点）', cost: -5, desc: '因为某些原因，你经常参与斗殴事件。', effects: { attr: { '体能': 3, '灵活': 2, '魅力': -2 } } },
  { id: 'm11', name: '偶像应援（10点）', cost: 10, desc: '你是某个地下偶像的狂热粉丝。', effects: { attr: { '情商': 2 } } },
  { id: 'm12', name: '班级图书角（5点）', cost: 5, desc: '你负责管理班级的图书角，读了大量闲书。', effects: { knowledge: { '语文': 3 }, attr: { '智商': 1 } } }
]

const talentOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这个天赋。' },
  { id: 't1', name: '学神（20点）', cost: 20, desc: '你的学习效率远超常人。', effect_desc: '智商软上限+10，知识经验获取+10%。', effects: { softCap: { '智商': 10 } } },
  { id: 't2', name: '社交达人（15点）', cost: 15, desc: '你天生就懂得如何与人打交道。', effect_desc: '情商软上限+10，社交判定加成。', effects: { softCap: { '情商': 10 } } },
  { id: 't3', name: '运动健将（15点）', cost: 15, desc: '你的身体仿佛为运动而生。', effect_desc: '体能和灵活软上限各+5。', effects: { softCap: { '体能': 5, '灵活': 5 } } },
  { id: 't4', name: '万人迷（20点）', cost: 20, desc: '你的魅力无人能挡。', effect_desc: '魅力软上限+10，初始好感增加。', effects: { softCap: { '魅力': 10 } } },
  { id: 't5', name: '小透明（-10点）', cost: -10, desc: '你没什么存在感，但也因此获得了更多可分配点数。', effect_desc: '社交场合中，你的初始存在感较低。', effects: {} },
  { id: 't6', name: '过目不忘（25点）', cost: 25, desc: '你拥有近乎完美的记忆力。', effect_desc: '所有知识水平的经验获取+5%。', effects: {} },
  { id: 't7', name: '天生财运（20点）', cost: 20, desc: '你总是能发现各种赚钱的机会。', effect_desc: '每月额外获得随机零花钱。', effects: {} },
  { id: 't8', name: '第六感（15点）', cost: 15, desc: '你有时能预感到即将发生的事情。', effect_desc: '在某些特殊事件中，会获得额外的提示。', effects: {} },
  { id: 't9', name: '钢铁心灵（15点）', cost: 15, desc: '你拥有强大的抗压能力。', effect_desc: '心境软上限+20，不容易陷入负面情绪。', effects: { softCap: { '心境': 20 } } },
  { id: 't10', name: '动手能力MAX（10点）', cost: 10, desc: '你擅长修理和制作各种东西。', effect_desc: '艺术和编程技能的经验获取+10%。', effects: {} },
  { id: 't11', name: '言出法随（30点）', cost: 30, desc: '你说的话似乎有种奇特的魔力，更容易说服他人。', effect_desc: '社交判定中，大幅提升成功率。', effects: {} },
  { id: 't12', name: '多面手（15点）', cost: 15, desc: '你对什么都懂一点。', effect_desc: '所有技能的初始等级+1。', effects: { skill: { all: 1 } } }
]

// 家庭背景选项
const familyOptions = {
  f1: { name: '普通家庭（20点）', cost: 20, money: 20000, desc: '标准的工薪阶层，初始财力中等。' },
  f2: { name: '富裕家庭（40点）', cost: 40, money: 300000, desc: '父母是成功的商人，初始财力丰厚。' },
  f3: { name: '书香门第（30点）', cost: 30, money: 100000, desc: '世代为学者，初始“智商”获得少量加成。', effects: { iq: 2 } },
  f4: { name: '体育世家（30点）', cost: 30, money: 50000, desc: '家族成员多为运动员。', effects: { physique: 2, flexibility: 1 } },
  f5: { name: '单亲家庭（15点）', cost: 15, money: 10000, desc: '与母亲/父亲一同生活。', effects: { eq: 2 } },
  f6: { name: '偏远乡村（10点）', cost: 10, money: 10000, desc: '来自乡下，初始财力较低。', effects: { physique: 1 } },
  f7: { name: '没落贵族（25点）', cost: 25, money: 20000, desc: '家族曾有过辉煌历史，持有一件“传家宝”。', items: [{ id: 'heirloom', name: '传家宝', description: '家族流传下来的神秘物品，似乎隐藏着某种力量。', type: 'key_item', effect: '未知', count: 1 }] },
  f8: { name: '艺术之家（30点）', cost: 30, money: 100000, desc: '父母是艺术家。', effects: { charm: 2 } },
  f9: { name: '家道中落（-10点）', cost: -10, money: 5000, desc: '曾经富裕但现在陷入困境。' },
  custom: { name: '自定义（50点）', cost: 50, desc: '完全自定义你的出身背景。' }
}

// 经验难度定义
const expDifficultyOptions = {
  easy: { label: '简单', multiplier: 2, desc: '经验获取×2，适合轻松体验' },
  normal: { label: '普通', multiplier: 1, desc: '经验获取×1，标准体验' },
  hard: { label: '困难', multiplier: 0.75, desc: '经验获取×0.75，更具挑战' }
}

// 游戏模式定义
const gameModes = {
  dragon: { label: '天龙模式', points: 999 },
  story: { label: '剧情模式', points: 150 },
  normal: { label: '普通模式', points: 120 },
  challenge: { label: '挑战模式', points: 100 }
}

// 初始属性值 (参考 gameStore)
const initialStats = {
  attributes: { iq: 60, eq: 60, physique: 60, flexibility: 60, charm: 60, mood: 60 },
  potentials: { iq: 85, eq: 85, physique: 85, flexibility: 85, charm: 85, mood: 85 },
  subjects: { literature: 15, math: 15, english: 15, humanities: 15, sciences: 15, art: 15, sports: 15 },
  skills: { programming: 0, painting: 0, guitar: 0, piano: 0, urbanLegend: 0, cooking: 0, hacking: 0, socialMedia: 0, photography: 0, videoEditing: 0 }
}

// 计算当前基础属性 (初始 + 家庭 + 经历)
const baseStats = computed(() => {
  // 深拷贝初始值
  const stats = JSON.parse(JSON.stringify(initialStats))

  // 根据年级调整初始学科知识（高年级学生已有更多知识积累）
  const gradeYear = parseInt(formData.value.classId?.charAt(0)) || 1
  const gradeSubjectBase = { 1: 18, 2: 27, 3: 37 }
  const baseKnowledge = gradeSubjectBase[gradeYear] || 18
  for (const key in stats.subjects) {
    stats.subjects[key] = baseKnowledge
  }

  // 辅助函数：应用数据
  const applyData = (data) => {
    if (!data) return
    // 属性
    if (data.attributes) {
      for (const key in data.attributes) {
        if (stats.attributes[key] !== undefined) stats.attributes[key] += data.attributes[key]
      }
    }
    // 学科
    if (data.subjects) {
      for (const key in data.subjects) {
        if (stats.subjects[key] !== undefined) stats.subjects[key] += data.subjects[key]
      }
    }
    // 技能
    if (data.skills) {
      for (const key in data.skills) {
        if (stats.skills[key] !== undefined) stats.skills[key] += data.skills[key]
      }
    }
    // 潜力
    if (data.potentials) {
      for (const key in data.potentials) {
        if (stats.potentials[key] !== undefined) stats.potentials[key] += data.potentials[key]
      }
    }
  }

  // 1. 家庭背景
  if (formData.value.familyBackground === 'custom') {
    applyData(customData.value.family)
  } else {
    const family = familyOptions[formData.value.familyBackground]
    if (family && family.effects) {
      for (const key in family.effects) {
        if (stats.attributes[key] !== undefined) stats.attributes[key] += family.effects[key]
      }
    }
  }

  // 2. 经历加成
  const applyExpEffects = (ids, options, customDataArray) => {
    ids.forEach((id, index) => {
      if (id === 'custom') {
        applyData(customDataArray[index])
      } else {
        const exp = options.find(e => e.id === id)
        if (!exp || !exp.effects) return

        // 基础属性
        if (exp.effects.attr) {
          for (const key in exp.effects.attr) {
            const attrKey = attrMap[key]
            if (attrKey && stats.attributes[attrKey] !== undefined) {
              stats.attributes[attrKey] += exp.effects.attr[key]
            }
          }
        }
        // 学科
        if (exp.effects.knowledge) {
          if (exp.effects.knowledge.all) {
            for (const subjKey in stats.subjects) {
              stats.subjects[subjKey] += exp.effects.knowledge.all
            }
          } else {
            for (const key in exp.effects.knowledge) {
              const subjKey = attrMap[key]
              if (subjKey && stats.subjects[subjKey] !== undefined) {
                stats.subjects[subjKey] += exp.effects.knowledge[key]
              }
            }
          }
        }
        // 技能
        if (exp.effects.skill) {
          if (exp.effects.skill.all) {
            for (const skillKey in stats.skills) {
              stats.skills[skillKey] += exp.effects.skill.all
            }
          } else {
            for (const key in exp.effects.skill) {
              const skillKey = attrMap[key]
              if (skillKey && stats.skills[skillKey] !== undefined) {
                stats.skills[skillKey] += exp.effects.skill[key]
              }
            }
          }
        }
        // 软上限
        if (exp.effects.softCap) {
          for (const key in exp.effects.softCap) {
            const attrKey = attrMap[key]
            if (attrKey && stats.potentials[attrKey] !== undefined) {
              stats.potentials[attrKey] += exp.effects.softCap[key]
            }
          }
        }
      }
    })
  }

  applyExpEffects(formData.value.childhood, childhoodOptions, customData.value.childhood)
  applyExpEffects(formData.value.elementary, elementaryOptions, customData.value.elementary)
  applyExpEffects(formData.value.middleSchool, middleSchoolOptions, customData.value.middleSchool)
  applyExpEffects(formData.value.talents, talentOptions, customData.value.talents)

  return stats
})

// 计算属性分配消耗
const allocationCost = computed(() => {
  let cost = 0
  const data = formData.value.allocatedAttributes
  if (!data) return 0
  
  if (data.attributes) for (const key in data.attributes) cost += data.attributes[key]
  if (data.subjects) for (const key in data.subjects) cost += data.subjects[key]
  if (data.skills) for (const key in data.skills) cost += data.skills[key]
  if (data.potentials) for (const key in data.potentials) cost += data.potentials[key] * 2
  
  return cost
})

// 计算当前点数
const currentPoints = computed(() => {
  let points = gameModes[formData.value.gameMode]?.points || 0
  
  // 扣除家庭背景消耗
  const family = familyOptions[formData.value.familyBackground]
  if (family) {
    points -= family.cost
  }

  // 扣除经历消耗
  const deductExperienceCost = (ids, options) => {
    ids.forEach(id => {
      const exp = options.find(e => e.id === id)
      if (exp) points -= exp.cost
    })
  }

  deductExperienceCost(formData.value.childhood, childhoodOptions)
  deductExperienceCost(formData.value.elementary, elementaryOptions)
  deductExperienceCost(formData.value.middleSchool, middleSchoolOptions)
  deductExperienceCost(formData.value.talents, talentOptions)
  
  // 扣除属性分配消耗
  points -= allocationCost.value

  return points
})

const selectedFamily = computed(() => familyOptions[formData.value.familyBackground])

// 获取选中的经历对象
const getSelectedExperiences = (ids, options) => {
  return ids.map(id => options.find(e => e.id === id)).filter(Boolean)
}

const handleStart = async () => {
  // 表单验证
  if (!formData.value.name.trim()) {
    alert('请填写姓名！')
    const el = document.querySelector('input[placeholder="请输入姓名"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
      el.classList.add('shake-animation')
      setTimeout(() => el.classList.remove('shake-animation'), 500)
    }
    return
  }

  if (!formData.value.characterFeature.trim()) {
    alert('请填写角色特征！')
    const el = document.querySelector('input[placeholder="请输入角色特征（如：性格、外貌等）"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
      el.classList.add('shake-animation')
      setTimeout(() => el.classList.remove('shake-animation'), 500)
    }
    return
  }

  if (playerRole.value === 'student' && !formData.value.classId) {
    alert('请选择班级！')
    const el = document.querySelector('select') // 假设班级选择框是页面上靠前的 select 之一，或者可以通过更精确的选择器
    // 由于有多个 select，我们需要更精确地定位。班级选择框绑定了 formData.classId
    // 我们可以通过遍历 select 元素来找到绑定了 classId 的那个，或者简单地滚动到“基本信息”区域
    const classSelect = Array.from(document.querySelectorAll('select')).find(s => s.value === formData.value.classId || s.options[0].text === '请选择班级')
    if (classSelect) {
      classSelect.scrollIntoView({ behavior: 'smooth', block: 'center' })
      classSelect.focus()
      classSelect.classList.add('shake-animation')
      setTimeout(() => classSelect.classList.remove('shake-animation'), 500)
    }
    return
  }

  if (playerRole.value === 'teacher' && teacherData.value.teachingClasses.length === 0) {
    alert('请至少选择一个教授班级！')
    return
  }

  showProfile.value = true
  await nextTick()
}

const confirmSignature = async () => {
  // 重置游戏状态（隔离存档）
  await gameStore.startNewGame()

  // 这里将来会处理开始游戏的逻辑，比如保存数据到 store
  gameStore.setPlayerName(formData.value.name)
  gameStore.player.gender = formData.value.gender
  gameStore.player.characterFeature = formData.value.characterFeature
  gameStore.player.backgroundStory = formData.value.backgroundStory
  gameStore.player.newGameGuideTurns = 3 // 初始化新游戏引导回合数
  gameStore.player.role = playerRole.value // 保存角色类型
  gameStore.player.gameMode = formData.value.gameMode // 保存游戏模式

  // 保存经验倍率设置
  const selectedDifficulty = expDifficultyOptions[formData.value.expDifficulty] || expDifficultyOptions.normal
  gameStore.settings.difficulty = formData.value.expDifficulty
  gameStore.settings.expMultiplier = selectedDifficulty.multiplier

  // 教师模式数据保存
  if (playerRole.value === 'teacher') {
    gameStore.player.teachingClasses = teacherData.value.teachingClasses
    gameStore.player.homeroomClassIds = teacherData.value.homeroomClassIds || []
    gameStore.player.homeroomClassId = teacherData.value.homeroomClassIds[0] || null  // 兼容旧字段
    gameStore.player.classSubjectMap = JSON.parse(JSON.stringify(teacherData.value.classSubjectMap || {}))
    gameStore.player.teachingSubjects = getAllSelectedSubjects()  // 兼容旧字段：合并所有班级学科
    gameStore.player.teachingElectives = teacherData.value.teachingElectives

    // 如果是教师，不需要设置单一班级，但如果担任班主任，可以作为主要班级
    if (teacherData.value.homeroomClassIds.length > 0) {
      gameStore.player.classId = teacherData.value.homeroomClassIds[0]
    }

    // 注册自定义课程
    if (teacherData.value.customCourses) {
      const registeredCourses = []
      teacherData.value.customCourses.forEach(course => {
        const registered = registerCustomCourse({
          ...course,
          teacher: formData.value.name,
          teacherGender: formData.value.gender,
          runId: gameStore.meta.currentRunId
        })
        // 保存注册后的完整课程对象（包含生成的ID）
        registeredCourses.push(registered)

        // 选修课注册后加入 teachingElectives
        if (registered.type === 'elective') {
          // 移除临时 pending ID，替换为正式 ID
          const pendingPrefix = 'pending_custom_'
          teacherData.value.teachingElectives = teacherData.value.teachingElectives.filter(
            id => !(id.startsWith(pendingPrefix) && id.endsWith(`_${course.name}`))
          )
          if (!teacherData.value.teachingElectives.includes(registered.id)) {
            teacherData.value.teachingElectives.push(registered.id)
          }
        }
      })
      // 更新 customCourses 为注册后的完整对象
      teacherData.value.customCourses = registeredCourses
      // 保存到世界书
      await saveCoursePoolToWorldbook()
    }
    
    // 生成教师课表 (使用独立排课系统)
    // const termInfo = getTermInfo(gameStore.world.gameTime.year, gameStore.world.gameTime.month, gameStore.world.gameTime.day)
    const currentDate = {
      year: gameStore.world.gameTime.year,
      month: gameStore.world.gameTime.month,
      day: gameStore.world.gameTime.day
    }
    
    // 构造完整的教师信息对象
    const fullTeacherInfo = {
      teachingClasses: teacherData.value.teachingClasses,
      homeroomClassIds: teacherData.value.homeroomClassIds,
      classSubjectMap: teacherData.value.classSubjectMap,
      teachingSubjects: getAllSelectedSubjects(),
      teachingElectives: teacherData.value.teachingElectives,
      customCourses: teacherData.value.customCourses
    }
    
    gameStore.player.schedule = generateIndependentTeacherSchedule(
      fullTeacherInfo,
      currentDate,
      gameStore.world.allClassData
    )
    console.log('[GameStart] Generated independent teacher schedule:', gameStore.player.schedule)
    
    // 调用世界书更新函数
    await setupTeacherClassEntries(
      teacherData.value.teachingClasses,
      teacherData.value.homeroomClassIds,
      formData.value.name,
      gameStore.meta.currentRunId,
      teacherData.value.classSubjectMap,
      formData.value.gender
    )

    // 教师自动加入教授班级的群组
    for (const classId of teacherData.value.teachingClasses) {
      const classInfo = gameStore.world.allClassData[classId]
      if (classInfo) {
        await gameStore.joinClassGroup(classId, classInfo)
      }
    }

    // 触发 NPC 选课，使教师 prompt 中能显示选修课学生名单
    await gameStore.processNpcElectiveSelection()
  }
  
  // 设置世界书策略（选中班级蓝灯，其他绿灯）并创建班级群
  if (formData.value.classId && playerRole.value === 'student') {
    await setPlayerClass(formData.value.classId, gameStore.settings?.useGeminiMode)
    // 设置玩家班级并生成课表，这个函数会自动调用 joinClassGroup
    // 创建班级群并保存到世界书
    await gameStore.setPlayerClass(formData.value.classId)
  }

  // 根据年级设置基础学科知识（高年级学生已有更多知识积累）
  {
    const gradeYear = gameStore.player.gradeYear || 1
    const gradeSubjectBase = { 1: 18, 2: 27, 3: 37 }
    const baseKnowledge = gradeSubjectBase[gradeYear] || 18
    for (const key in gameStore.player.subjects) {
      gameStore.player.subjects[key] = baseKnowledge
    }
  }

  // 辅助函数：应用自定义数据
  const applyCustomData = (data) => {
    // 属性
    for (const key in data.attributes) {
      // @ts-ignore
      gameStore.player.attributes[key] += data.attributes[key]
    }
    // 学科
    for (const key in data.subjects) {
      // @ts-ignore
      gameStore.player.subjects[key] += data.subjects[key]
    }
    // 技能
    for (const key in data.skills) {
      // @ts-ignore
      gameStore.player.skills[key] += data.skills[key]
    }
  }

  // 处理家庭背景
  if (formData.value.familyBackground === 'custom') {
    // 自定义背景
    gameStore.player.money = customData.value.family.money
    applyCustomData(customData.value.family)
  } else {
    // 预设背景
    const family = familyOptions[formData.value.familyBackground]
    if (family) {
      // 资金
      gameStore.player.money = family.money || 0
      
      // 属性加成
      if (family.effects) {
        for (const key in family.effects) {
          // @ts-ignore
          gameStore.player.attributes[key] += family.effects[key]
        }
      }
      
      // 物品
      if (family.items) {
        family.items.forEach(item => {
          // @ts-ignore
          gameStore.addItem(item)
        })
      }
    }
  }

  // 处理经历加成
  const applyEffects = (ids, options, customDataArray) => {
    ids.forEach((id, index) => {
      if (id === 'custom') {
        // 应用自定义经历数据
        applyCustomData(customDataArray[index])
      } else {
        const exp = options.find(e => e.id === id)
        if (!exp || !exp.effects) return

        // 基础属性
        if (exp.effects.attr) {
          for (const key in exp.effects.attr) {
            const attrKey = attrMap[key]
            if (attrKey) {
              // @ts-ignore
              gameStore.player.attributes[attrKey] += exp.effects.attr[key]
            }
          }
        }

        // 学科知识
        if (exp.effects.knowledge) {
          if (exp.effects.knowledge.all) {
            // 全科加成
            for (const subjKey in gameStore.player.subjects) {
              // @ts-ignore
              gameStore.player.subjects[subjKey] += exp.effects.knowledge.all
            }
          } else {
            for (const key in exp.effects.knowledge) {
              const subjKey = attrMap[key]
              if (subjKey) {
                // @ts-ignore
                gameStore.player.subjects[subjKey] += exp.effects.knowledge[key]
              }
            }
          }
        }

        // 生活技能
        if (exp.effects.skill) {
          if (exp.effects.skill.all) {
            // 全技能加成
            for (const skillKey in gameStore.player.skills) {
              // @ts-ignore
              gameStore.player.skills[skillKey] += exp.effects.skill.all
            }
          } else {
            for (const key in exp.effects.skill) {
              const skillKey = attrMap[key]
              if (skillKey) {
                // @ts-ignore
                gameStore.player.skills[skillKey] += exp.effects.skill[key]
              }
            }
          }
        }

        // 软上限 (潜力值)
        if (exp.effects.softCap) {
          for (const key in exp.effects.softCap) {
            const attrKey = attrMap[key]
            if (attrKey) {
              // @ts-ignore
              gameStore.player.potentials[attrKey] += exp.effects.softCap[key]
            }
          }
        }
      }
    })
  }

  applyEffects(formData.value.childhood, childhoodOptions, customData.value.childhood)
  applyEffects(formData.value.elementary, elementaryOptions, customData.value.elementary)
  applyEffects(formData.value.middleSchool, middleSchoolOptions, customData.value.middleSchool)
  applyEffects(formData.value.talents, talentOptions, customData.value.talents)

  // 应用属性分配
  const allocated = formData.value.allocatedAttributes
  if (allocated) {
    // 属性
    if (allocated.attributes) {
      for (const key in allocated.attributes) {
        // @ts-ignore
        gameStore.player.attributes[key] += allocated.attributes[key]
      }
    }
    // 潜力
    if (allocated.potentials) {
      for (const key in allocated.potentials) {
        // @ts-ignore
        gameStore.player.potentials[key] += allocated.potentials[key]
      }
    }
    // 学科
    if (allocated.subjects) {
      for (const key in allocated.subjects) {
        // @ts-ignore
        gameStore.player.subjects[key] += allocated.subjects[key]
      }
    }
    // 技能
    if (allocated.skills) {
      for (const key in allocated.skills) {
        // @ts-ignore
        gameStore.player.skills[key] += allocated.skills[key]
      }
    }
  }

  // 保存选中的天赋ID
  gameStore.player.talents = formData.value.talents.filter(Boolean)
  
  // 保存自定义课程池数据
  gameStore.academic.customCoursePool = getCoursePoolState()

  // 初始化论坛默认帖子
  gameStore.player.forum.posts = JSON.parse(JSON.stringify(DEFAULT_FORUM_POSTS))
  console.log('[GameStart] Initialized forum with default posts:', gameStore.player.forum.posts.length)
  
  // 创建论坛世界书条目
  await saveForumToWorldbook(
    gameStore.player.forum.posts,
    gameStore.meta.currentRunId,
    gameStore.settings.forumWorldbookLimit
  )
  console.log('[GameStart] Forum worldbook entry created')
  
  console.log('Start Game with:', formData.value, customData.value)
  emit('startGame')
}
</script>

<template>
  <div class="game-start-wrapper">
    <div class="paper-panel">
      <div class="header-section">
        <div v-if="props.mode !== 'multiplayer'" class="header-actions">
          <button class="action-btn small" @click="showCourseEditor = true">编辑课程表</button>
          <button class="action-btn small" @click="showFilterPanel = true">筛选全校名册</button>
          <button class="action-btn small" @click="showScheduleEditor = true">角色日程编辑器</button>
          <button class="action-btn small" @click="showEventEditor = true">事件编辑器</button>
          <button class="action-btn small highlight" @click="showTransferPanel = true">导出/导入设置</button>
        </div>
        <img src="https://files.catbox.moe/efg1xe.png" alt="School Logo" class="school-logo" />
        <h1 class="doc-title">{{ props.mode === 'multiplayer' ? '联机角色创建' : '入学通知书' }}</h1>
      </div>
      
      <div class="content-section">
        <p class="intro-text">请填写您的个人信息以完成注册。</p>
        
        <!-- 角色选择 -->
        <div class="role-selector">
          <div 
            class="role-option" 
            :class="{ active: playerRole === 'student' }"
            @click="playerRole = 'student'"
          >
            <span class="role-icon">🎓</span>
            <span class="role-name">学生</span>
          </div>
          <div 
            class="role-option" 
            :class="{ active: playerRole === 'teacher' }"
            @click="playerRole = 'teacher'"
          >
            <span class="role-icon">👨‍🏫</span>
            <span class="role-name">老师</span>
          </div>
        </div>

        <!-- 点数计数器 -->
        <div class="points-counter">
          <span class="points-label">可用点数：</span>
          <span class="points-value">{{ currentPoints }}</span>
        </div>

        <div class="form-section">
          <h3 class="section-title">一、基本信息</h3>
          
          <div class="form-row">
            <label>姓名：</label>
            <input type="text" v-model="formData.name" placeholder="请输入姓名" class="input-field" />
          </div>

          <div class="form-row">
            <label>性别：</label>
            <select v-model="formData.gender" class="input-field">
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>

          <div class="form-row">
            <label>特征：</label>
            <input type="text" v-model="formData.characterFeature" placeholder="请输入角色特征（如：性格、外貌等）" class="input-field" />
          </div>

          <div class="form-row" style="align-items: flex-start;">
            <label>背景：</label>
            <textarea 
              v-model="formData.backgroundStory" 
              placeholder="请输入人物背景故事（可选）" 
              class="input-field"
              style="height: 100px; resize: vertical;"
            ></textarea>
          </div>

          <!-- 仅学生模式显示班级选择 -->
          <template v-if="playerRole === 'student'">
            <div class="form-row">
              <label>班级：</label>
              <select v-model="formData.classId" class="input-field">
                <option value="" disabled>请选择班级</option>
                <option v-for="(data, id) in gameStore.world.allClassData" :key="id" :value="id">
                  {{ data.name }}
                </option>
              </select>
            </div>

            <div class="class-info-box">
              <pre>{{ classInfoText }}</pre>
            </div>

            <!-- 班级名册按钮（联机模式下仅房主可用） -->
            <div v-if="formData.classId && canEditRoster" class="roster-btn-container">
              <button class="action-btn small" @click="showRoster = true">修改班级名册</button>
            </div>
          </template>
        </div>

        <div class="form-section">
          <h3 class="section-title">二、人生设定</h3>
          
          <div class="form-row">
            <label>人生目标：</label>
            <select v-model="formData.gameMode" class="input-field">
              <option v-for="(mode, key) in gameModes" :key="key" :value="key">
                {{ mode.label }} ({{ mode.points }}点)
              </option>
            </select>
          </div>

          <div class="form-row">
            <label>经验难度：</label>
            <select v-model="formData.expDifficulty" class="input-field">
              <option v-for="(opt, key) in expDifficultyOptions" :key="key" :value="key">
                {{ opt.label }} ({{ opt.desc }})
              </option>
            </select>
          </div>

          <div class="form-row">
            <label>家庭背景：</label>
            <select v-model="formData.familyBackground" class="input-field">
              <option v-for="(opt, key) in familyOptions" :key="key" :value="key">
                {{ opt.name }}
              </option>
            </select>
          </div>
          
          <!-- 背景描述预览 -->
          <div v-if="selectedFamily && formData.familyBackground !== 'custom'" class="family-preview">
            <p class="family-desc">{{ selectedFamily.desc }}</p>
            <p class="family-money">初始资金：{{ selectedFamily.money }} 日元</p>
            <div v-if="selectedFamily.effects" class="family-effects">
              <span v-for="(val, key) in selectedFamily.effects" :key="key" class="effect-tag">
                {{ attributesList.find(a => a.key === key)?.label }}: +{{ val }}
              </span>
            </div>
            <div v-if="selectedFamily.items" class="family-items">
              <span v-for="item in selectedFamily.items" :key="item.id" class="item-tag">
                获得物品: {{ item.name }}
              </span>
            </div>
          </div>

          <!-- 自定义加点面板 (家庭背景) -->
          <CustomOptionPanel 
            v-if="formData.familyBackground === 'custom'" 
            v-model="customData.family" 
            :show-money="true"
          />
        </div>

        <!-- 经历选择部分 (仅学生模式) -->
        <template v-if="playerRole === 'student'">
          <div class="form-section">
            <h3 class="section-title">三、幼年经历</h3>
            <div v-for="(val, index) in formData.childhood" :key="'c'+index">
              <div class="form-row">
                <label>经历 {{ index + 1 }}：</label>
                <select v-model="formData.childhood[index]" class="input-field">
                  <option value="">(无)</option>
                  <option v-for="opt in childhoodOptions" :key="opt.id" :value="opt.id" :disabled="formData.childhood.includes(opt.id) && formData.childhood[index] !== opt.id">
                    {{ opt.name }}
                  </option>
                </select>
              </div>
              <!-- 自定义面板 -->
              <CustomOptionPanel 
                v-if="formData.childhood[index] === 'custom'" 
                v-model="customData.childhood[index]" 
              />
            </div>
            <!-- 预览 -->
            <div v-if="getSelectedExperiences(formData.childhood, childhoodOptions).length > 0" class="family-preview">
              <div v-for="exp in getSelectedExperiences(formData.childhood, childhoodOptions)" :key="exp.id" class="exp-preview-item">
                <template v-if="exp.id !== 'custom'">
                  <strong>{{ exp.name }}:</strong> {{ exp.desc }}
                </template>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">四、小学经历</h3>
            <div v-for="(val, index) in formData.elementary" :key="'e'+index">
              <div class="form-row">
                <label>经历 {{ index + 1 }}：</label>
                <select v-model="formData.elementary[index]" class="input-field">
                  <option value="">(无)</option>
                  <option v-for="opt in elementaryOptions" :key="opt.id" :value="opt.id" :disabled="formData.elementary.includes(opt.id) && formData.elementary[index] !== opt.id">
                    {{ opt.name }}
                  </option>
                </select>
              </div>
              <!-- 自定义面板 -->
              <CustomOptionPanel 
                v-if="formData.elementary[index] === 'custom'" 
                v-model="customData.elementary[index]" 
              />
            </div>
            <!-- 预览 -->
            <div v-if="getSelectedExperiences(formData.elementary, elementaryOptions).length > 0" class="family-preview">
              <div v-for="exp in getSelectedExperiences(formData.elementary, elementaryOptions)" :key="exp.id" class="exp-preview-item">
                <template v-if="exp.id !== 'custom'">
                  <strong>{{ exp.name }}:</strong> {{ exp.desc }}
                </template>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">五、初中经历</h3>
            <div v-for="(val, index) in formData.middleSchool" :key="'m'+index">
              <div class="form-row">
                <label>经历 {{ index + 1 }}：</label>
                <select v-model="formData.middleSchool[index]" class="input-field">
                  <option value="">(无)</option>
                  <option v-for="opt in middleSchoolOptions" :key="opt.id" :value="opt.id" :disabled="formData.middleSchool.includes(opt.id) && formData.middleSchool[index] !== opt.id">
                    {{ opt.name }}
                  </option>
                </select>
              </div>
              <!-- 自定义面板 -->
              <CustomOptionPanel 
                v-if="formData.middleSchool[index] === 'custom'" 
                v-model="customData.middleSchool[index]" 
              />
            </div>
            <!-- 预览 -->
            <div v-if="getSelectedExperiences(formData.middleSchool, middleSchoolOptions).length > 0" class="family-preview">
              <div v-for="exp in getSelectedExperiences(formData.middleSchool, middleSchoolOptions)" :key="exp.id" class="exp-preview-item">
                <template v-if="exp.id !== 'custom'">
                  <strong>{{ exp.name }}:</strong> {{ exp.desc }}
                </template>
              </div>
            </div>
          </div>
        </template>

        <!-- 教师专属设置 -->
        <template v-if="playerRole === 'teacher'">
          <div class="form-section">
            <h3 class="section-title">三、教学设置</h3>
            
            <div class="form-row" style="align-items: flex-start;">
              <label>教授班级：</label>
              <div class="multi-select-container">
                <div 
                  v-for="(data, id) in gameStore.world.allClassData" 
                  :key="id"
                  class="select-chip"
                  :class="{ active: teacherData.teachingClasses.includes(id) }"
                  @click="toggleTeachingClass(id)"
                >
                  {{ data.name }}
                </div>
              </div>
            </div>
            <p class="hint-text">请选择1~5个教授的班级</p>

            <div class="form-row" style="align-items: flex-start;" v-if="teacherData.teachingClasses.length > 0">
              <label>担任班主任：</label>
              <div class="multi-select-container">
                <div
                  v-for="id in teacherData.teachingClasses"
                  :key="id"
                  class="select-chip"
                  :class="{ active: teacherData.homeroomClassIds.includes(id) }"
                  @click="toggleHomeroomClass(id)"
                >
                  {{ gameStore.world.allClassData[id]?.name }}
                </div>
              </div>
            </div>

            <div class="form-row" style="align-items: flex-start;" v-if="teacherData.teachingClasses.length > 0">
              <label>各班教授学科：</label>
              <div class="per-class-subject-area" style="flex: 1;">
                <div v-for="classId in teacherData.teachingClasses" :key="classId" class="class-subject-group">
                  <div class="class-subject-header">{{ gameStore.world.allClassData[classId]?.name || classId }}</div>
                  <div class="multi-select-container">
                    <div
                      v-for="subj in subjectOptions"
                      :key="subj.key"
                      class="select-chip"
                      :class="{ active: (teacherData.classSubjectMap[classId] || []).includes(subj.label) }"
                      @click="toggleClassSubject(classId, subj.label)"
                    >
                      {{ subj.label }}
                    </div>
                  </div>
                </div>
                <button class="add-custom-btn" @click="openAddCourseModal" style="margin-top: 8px;">+ 自定义课程</button>
                <!-- 已添加的自定义课程 -->
                <div v-if="teacherData.customCourses && teacherData.customCourses.length > 0" class="custom-courses-list">
                  <div v-for="(course, idx) in teacherData.customCourses" :key="idx" class="select-chip active">
                    {{ course.name }} ({{ course.type === 'elective' ? '选修' : '必修' }})
                    <span class="remove-x" @click="removeCustomCourse(idx)">×</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-row" style="align-items: flex-start;">
              <label>教授选修：</label>
              <div class="multi-select-container scrollable">
                <div 
                  v-for="course in allElectiveOptions" 
                  :key="course.id"
                  class="select-chip"
                  :class="{ active: teacherData.teachingElectives.includes(course.id) }"
                  @click="toggleTeachingElective(course.id)"
                >
                  {{ course.name }}
                </div>
              </div>
            </div>
          </div>
        </template>

        <div class="form-section">
          <h3 class="section-title">六、天赋选择</h3>
          <div v-for="(val, index) in formData.talents" :key="'t'+index">
            <div class="form-row">
              <label>天赋 {{ index + 1 }}：</label>
              <select v-model="formData.talents[index]" class="input-field">
                <option value="">(无)</option>
                <option v-for="opt in talentOptions" :key="opt.id" :value="opt.id" :disabled="formData.talents.includes(opt.id) && formData.talents[index] !== opt.id">
                  {{ opt.name }}
                </option>
              </select>
            </div>
            <!-- 自定义面板 -->
            <CustomOptionPanel 
              v-if="formData.talents[index] === 'custom'" 
              v-model="customData.talents[index]" 
            />
          </div>
          <!-- 预览 -->
          <div v-if="getSelectedExperiences(formData.talents, talentOptions).length > 0" class="family-preview">
            <div v-for="exp in getSelectedExperiences(formData.talents, talentOptions)" :key="exp.id" class="exp-preview-item">
              <template v-if="exp.id !== 'custom'">
                <strong>{{ exp.name }}:</strong> {{ exp.desc }} <span v-if="exp.effect_desc" style="color: #d32f2f; font-size: 0.85rem;">({{ exp.effect_desc }})</span>
              </template>
            </div>
          </div>
        </div>

        <!-- 属性分配面板 -->
        <AttributeAllocationPanel 
          v-model="formData.allocatedAttributes"
          :base-stats="baseStats"
          :remaining-points="currentPoints"
          :player-role="playerRole"
        />

        <div class="button-group">
          <button 
            class="action-btn" 
            @click="handleStart" 
            :disabled="currentPoints < 0"
            :title="currentPoints < 0 ? '点数不足，无法入学' : ''"
          >确认入学</button>
          <button class="action-btn secondary" @click="showPresetModal = true">预设管理</button>
          <button class="action-btn secondary" @click="$emit('back')">返回</button>
        </div>
      </div>
    </div>

    <!-- 新生档案确认页 -->
    <StudentProfile 
      v-if="showProfile" 
      :form-data="formData" 
      :custom-data="customData"
      :player-role="playerRole"
      :options="{ family: familyOptions, childhood: childhoodOptions, elementary: elementaryOptions, middleSchool: middleSchoolOptions, talents: talentOptions }"
      @sign="confirmSignature"
      @back="showProfile = false"
    />

    <!-- 班级名册面板 -->
    <ClassRosterPanel 
      v-if="showRoster"
      v-model="customData.classRoster"
      :class-id="formData.classId"
      @close="showRoster = false"
    />

    <!-- 课程编辑器面板 -->
    <CourseEditor 
      v-if="showCourseEditor"
      @close="showCourseEditor = false"
    />

    <!-- 全校名册筛选面板 -->
    <SchoolRosterFilterPanel 
      v-if="showFilterPanel"
      @close="handleFilterClose"
    />

    <!-- 事件编辑器面板 -->
    <EventEditorPanel
      v-if="showEventEditor"
      @close="showEventEditor = false"
    />

    <!-- NPC日程编辑器面板 -->
    <NpcScheduleEditorPanel
      v-if="showScheduleEditor"
      @close="showScheduleEditor = false"
    />

    <!-- 数据迁移面板 -->
    <DataTransferPanel
      v-if="showTransferPanel"
      @close="showTransferPanel = false"
    />

    <!-- 预设管理弹窗 -->
    <div v-if="showPresetModal" class="modal-overlay" @click.self="showPresetModal = false">
      <div class="modal-content preset-modal">
        <h3>预设管理</h3>
        
        <div class="preset-create-section">
          <input 
            v-model="newPresetName" 
            placeholder="输入当前配置的名称..." 
            class="input-field"
            @keyup.enter="saveCurrentPreset"
          />
          <button class="action-btn small" @click="saveCurrentPreset">保存当前配置</button>
        </div>

        <div class="preset-list">
          <div v-if="presets.length === 0" class="no-presets">
            暂无保存的预设
          </div>
          <div v-else v-for="(preset, index) in presets" :key="index" class="preset-item">
            <div class="preset-info">
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-role-badge" :class="preset.data.playerRole">
                {{ preset.data.playerRole === 'student' ? '学生' : '老师' }}
              </span>
              <span class="preset-time">{{ formatDate(preset.timestamp) }}</span>
            </div>
            <div class="preset-actions">
              <button class="action-btn small highlight" @click="applyPreset(preset)">读取</button>
              <button class="action-btn small secondary" @click="removePreset(index)">删除</button>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="action-btn secondary" @click="showPresetModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 添加自定义课程弹窗 -->
    <div v-if="showAddCourseModal" class="modal-overlay" @click.self="showAddCourseModal = false">
      <div class="modal-content custom-course-modal">
        <h3>添加自定义课程</h3>
        
        <div class="form-row">
          <label>课程名称：</label>
          <input v-model="newCourseForm.name" placeholder="例如：黑魔法防御术" class="input-field" />
        </div>

        <div class="form-row">
          <label>课程类型：</label>
          <select v-model="newCourseForm.type" class="input-field">
            <option value="elective">选修课</option>
            <option value="required">必修课</option>
          </select>
        </div>

        <div class="form-row">
          <label>适用年级：</label>
          <select v-model="newCourseForm.grade" class="input-field">
            <option value="universal">通用 (所有年级)</option>
            <option value="1">1年级</option>
            <option value="2">2年级</option>
            <option value="3">3年级</option>
          </select>
        </div>

        <div class="form-row">
          <label>选课倾向：</label>
          <select v-model="newCourseForm.preference" class="input-field">
            <option v-for="(pref, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
              {{ pref.icon }} {{ pref.name }} ({{ pref.description }})
            </option>
          </select>
        </div>

        <div class="form-row">
          <label>上课地点：</label>
          <div class="location-picker-field">
            <input :value="getCourseLocationLabel(newCourseForm.location)" class="input-field" readonly />
            <button type="button" class="action-btn small" @click="handleSelectCourseLocation">地图选择</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="action-btn secondary" @click="showAddCourseModal = false">取消</button>
          <button class="action-btn" @click="addCustomCourse" :disabled="!newCourseForm.name">确认添加</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <MapEditorPanel
        v-if="showCourseLocationPicker"
        :selection-mode="true"
        selection-title="选择课程上课地点"
        initial-parent-id="tianhua_high_school"
        @location-selected="handleCourseLocationSelected"
        @close="showCourseLocationPicker = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
/* 自定义课程弹窗样式 */
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
  z-index: 1000;
}

.custom-course-modal {
  background: #fdfbf3;
  padding: 20px;
  border-radius: 8px;
  width: 400px;
  max-width: 90%;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.custom-course-modal h3, .preset-modal h3 {
  margin-top: 0;
  color: #d32f2f;
  border-bottom: 1px solid #d32f2f;
  padding-bottom: 10px;
  margin-bottom: 20px;
  font-family: 'Ma Shan Zheng', cursive;
}

.preset-modal {
  background: #fdfbf3;
  padding: 20px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.preset-create-section {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px dashed #ccc;
}

.preset-list {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: rgba(255,255,255,0.5);
  padding: 10px;
}

.no-presets {
  text-align: center;
  color: #888;
  padding: 20px;
  font-style: italic;
}

.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
  background: white;
  margin-bottom: 5px;
  border-radius: 4px;
}

.preset-item:last-child {
  border-bottom: none;
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-name {
  font-weight: bold;
  font-size: 1.1rem;
}

.preset-role-badge {
  display: inline-block;
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}

.preset-role-badge.student {
  background-color: #e3f2fd;
  color: #1565c0;
}

.preset-role-badge.teacher {
  background-color: #fce4ec;
  color: #c2185b;
}

.preset-time {
  font-size: 0.8rem;
  color: #888;
}

.preset-actions {
  display: flex;
  gap: 5px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

/* 学科选择区域样式优化 */
.selected-subjects {
  border: 1px dashed #aaa;
  border-radius: 4px;
  padding: 8px;
  min-height: 40px;
  background: rgba(255,255,255,0.3);
  margin-bottom: 10px;
}

.placeholder-text {
  color: #888;
  font-size: 0.9rem;
  font-style: italic;
  padding: 4px;
}

.quick-select-label {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 5px;
}

.select-chip.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #ddd;
  border-color: #ccc;
}

.remove-x {
  margin-left: 4px;
  font-weight: bold;
  opacity: 0.7;
}

.select-chip.active:hover .remove-x {
  opacity: 1;
}

.add-custom-btn {
  padding: 4px 12px;
  background: #fff;
  border: 1px dashed #d32f2f;
  color: #d32f2f;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.add-custom-btn:hover {
  background: #fff0f0;
}

.game-start-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.paper-panel {
  background-color: #fdfbf3; /* 护眼纸张色 */
  color: #333;
  padding: 3rem;
  border-radius: 2px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  width: 800px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .paper-panel {
    width: 95%;
    padding: 1.5rem;
    max-height: 85vh;
  }

  .header-section {
    margin-bottom: 20px;
  }

  .doc-title {
    font-size: 2rem;
  }

  .content-section {
    padding: 0;
  }

  .form-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-row label {
    width: 100%;
    margin-bottom: 5px;
  }

  .input-field {
    width: 100%;
  }

  .attributes-grid {
    grid-template-columns: 1fr;
  }

  .button-group {
    flex-direction: column;
    gap: 1rem;
  }

  .action-btn {
    width: 100%;
  }
}

.header-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 20px;
  margin-bottom: 30px;
  position: relative;
}

.header-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.doc-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 3rem;
  color: #d32f2f; /* 红色标题，配合红线 */
  margin: 10px 0 0 0;
  letter-spacing: 5px;
}

/* 红色横线分割 */
.header-section::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 10%; /* 稍微留白，不占满全宽，更有文件感 */
  width: 80%;
  height: 2px;
  background-color: #d32f2f; /* 红色 */
}

.school-logo {
  height: 100px; /* 根据实际图片调整 */
  object-fit: contain;
}

.content-section {
  width: 100%;
  padding: 0 2rem;
  box-sizing: border-box;
}

.intro-text {
  text-align: center;
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #555;
}

.points-counter {
  text-align: center;
  margin-bottom: 2rem;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.5rem;
  color: #d32f2f;
  border: 2px solid #d32f2f;
  display: inline-block;
  padding: 5px 20px;
  border-radius: 50px; /* 椭圆印章风格 */
  transform: rotate(-2deg); /* 稍微倾斜，增加手写/印章感 */
}

.points-value {
  font-weight: bold;
  font-size: 1.8rem;
}

.form-section {
  width: 100%;
  margin-bottom: 2rem;
  text-align: left;
}

.section-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.8rem;
  color: #333;
  border-bottom: 1px solid #d32f2f; /* 细红线 */
  padding-bottom: 5px;
  margin-bottom: 20px;
}

.form-row {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}

.form-row label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.4rem;
  width: 80px;
  color: #444;
}

.input-field {
  flex: 1;
  padding: 8px;
  font-size: 1.1rem;
  border: none;
  border-bottom: 1px solid #888; /* 下划线风格输入框 */
  background: transparent;
  outline: none;
  font-family: 'Arial', sans-serif; /* 输入内容用常规字体 */
}

.input-field:focus {
  border-bottom-color: #d32f2f;
}

.location-picker-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.location-picker-field .input-field {
  min-width: 0;
}

.class-info-box {
  width: 100%;
  height: 150px; /* 稍微增高以便显示更多内容 */
  border: 1px solid #ccc;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 10px;
  margin-top: 10px;
  font-size: 0.9rem;
  color: #333;
  overflow-y: auto;
  border-radius: 4px;
  white-space: pre-wrap; /* 保留换行 */
  font-family: 'Courier New', Courier, monospace; /* 等宽字体对齐 */
}

.class-info-box pre {
  margin: 0;
  font-family: inherit;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.action-btn {
  padding: 10px 30px;
  font-size: 1.4rem;
  background-color: #d32f2f; /* 红色印章感 */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  font-family: 'Ma Shan Zheng', cursive;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
}

.action-btn:hover {
  background-color: #b71c1c;
  transform: scale(1.05);
}

.action-btn:disabled {
  background-color: #9e9e9e;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.action-btn.secondary {
  background-color: #795548; /* 棕色 */
}

.action-btn.secondary:hover {
  background-color: #5d4037;
}

.roster-btn-container {
  text-align: center;
  margin-bottom: 10px;
}

.custom-panel {
  background-color: rgba(0, 0, 0, 0.03);
  padding: 20px;
  border-radius: 8px;
  border: 1px dashed #888;
  margin-bottom: 20px;
}

.unit {
  margin-left: 10px;
  color: #666;
  font-size: 0.9rem;
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  margin-top: 15px;
}

.attr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 8px;
  border-radius: 4px;
}

.attr-label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.2rem;
  width: 50px;
}

.attr-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #888;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.attr-value {
  font-weight: bold;
  width: 20px;
  text-align: center;
}

.attr-potential {
  font-size: 0.8rem;
  color: #888;
  margin-left: 10px;
}

.points-info {
  text-align: right;
  margin-bottom: 10px;
  font-weight: bold;
  color: #555;
}

.no-points {
  color: #d32f2f;
}

.extra-options-section {
  margin-top: 20px;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
}

.toggle-btn {
  width: 100%;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.1rem;
  color: #555;
  transition: background-color 0.3s;
}

.toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.sub-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.3rem;
  color: #444;
  margin: 15px 0 10px 0;
  border-left: 3px solid #d32f2f;
  padding-left: 10px;
}

.family-preview {
  background-color: rgba(0, 0, 0, 0.03);
  padding: 15px;
  border-radius: 4px;
  margin-top: 10px;
  font-size: 0.95rem;
}

.family-desc {
  margin: 0 0 5px 0;
  color: #333;
}

.family-money {
  margin: 0 0 5px 0;
  color: #8b4513;
  font-weight: bold;
}

.family-effects, .family-items {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 5px;
}

.effect-tag {
  background-color: #e8f5e9;
  color: #2e7d32;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85rem;
  border: 1px solid #c8e6c9;
}

.item-tag {
  background-color: #fff3e0;
  color: #ef6c00;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85rem;
  border: 1px solid #ffe0b2;
}

.exp-preview-item {
  margin-bottom: 5px;
  font-size: 0.9rem;
  color: #555;
}

.shake-animation {
  animation: shake 0.5s;
  border-bottom-color: #d32f2f !important;
}

@keyframes shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(5px); }
  75% { transform: translateX(-5px); }
  100% { transform: translateX(0); }
}

.action-btn.small {
  font-size: 0.8rem;
  padding: 4px 10px;
  min-width: 90px;
}

.action-btn.small.highlight {
  background-color: #f57c00; /* 橙色高亮 */
}

.action-btn.small.highlight:hover {
  background-color: #ef6c00;
}

/* 角色选择器样式 */
.role-selector {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 30px;
}

.role-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px 30px;
  background: rgba(255, 255, 255, 0.3);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.role-option:hover {
  background: rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
}

.role-option.active {
  background: rgba(255, 255, 255, 0.8);
  border-color: #d32f2f;
  box-shadow: 0 4px 15px rgba(211, 47, 47, 0.2);
}

.role-icon {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.role-name {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.4rem;
  color: #333;
}

/* 多选容器样式 */
.multi-select-container {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 5px 0;
}

.multi-select-container.scrollable {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid rgba(0,0,0,0.1);
  padding: 8px;
  border-radius: 4px;
}

.select-chip {
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.select-chip:hover {
  background: rgba(0, 0, 0, 0.1);
}

.select-chip.active {
  background: #d32f2f;
  color: white;
  border-color: #d32f2f;
}

.hint-text {
  font-size: 0.85rem;
  color: #666;
  margin-top: -10px;
  margin-bottom: 15px;
  margin-left: 80px;
}

.per-class-subject-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.class-subject-group {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fafafa;
}

.class-subject-header {
  font-size: 0.9rem;
  font-weight: bold;
  margin-bottom: 6px;
  color: #333;
}
</style>
