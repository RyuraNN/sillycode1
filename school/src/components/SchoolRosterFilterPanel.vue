<!-- -*- coding: utf-8 -*- -->
<script setup>
import { ref, onMounted, computed, watch, toRaw } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { updateClassDataInWorldbook, deleteClassDataFromWorldbook, createDefaultRosterBackupWorldbook, restoreFromBackupWorldbook, hasBackupWorldbook, fetchMapDataFromWorldbook } from '../utils/worldbookParser'
import { saveRosterBackup, getRosterBackup, saveFullCharacterPool, getFullCharacterPool, saveRosterPresets, getRosterPresets } from '../utils/indexedDB'
import { ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { DEFAULT_TEMPLATES } from '../utils/npcScheduleSystem'
import { PERSONALITY_AXES } from '../data/relationshipData'
import { removeCharacter } from '../utils/relationshipManager'
import { saveImpressionDataImmediate } from '../utils/impressionWorldbook'
import MapEditorPanel from './MapEditorPanel.vue'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// ==================== 标签页状态 ====================
const activeTab = ref('filter') // 'filter' | 'composer' | 'characterEditor'

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
const genderFilter = ref('')
const showFilters = ref(false)

// ==================== 教师视图状态 ====================
const teacherViewMode = ref('work') // 'work' | 'class'
const expandedTeacherGroups = ref({})

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
const composerRoleFilter = ref('all') // 'all' | 'student' | 'teacher'
const showAddClassModal = ref(false)
const newClassForm = ref({ id: '', name: '' })
const composerMobileView = ref('class') // 'class' | 'pool'
const composerWorkFilter = ref('') // 按作品筛选
const composerShowUnassigned = ref(false) // 仅显示未分配角色
const composerGroupView = ref(true) // 按作品分组显示
const showConflictModal = ref(false)
const conflictCharacters = ref([])
const availableLocations = ref([]) // 地图中可用的教室/地点列表
const showMapEditorForClassroom = ref(false) // 是否显示地图编辑器（用于创建教室）

// ==================== 角色编辑器状态（原"全部角色"标签页，现升级为完整编辑器） ====================
const characterPool = ref([]) // 待选角色池（包含所有可用角色）
const showCharacterEditor = ref(false)
const editingCharacter = ref(null)
const characterEditForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  classId: '',
  role: 'student',
  subject: '', // 教师专属（兼容旧数据）
  isHeadTeacher: false, // 教师专属（兼容旧数据）
  // 教师多班级任职数组
  assignments: [], // { classId: string, isHeadTeacher: boolean, subject: string }[]
  electivePreference: 'general',
  scheduleTag: '',
  personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
})
const charEditorSearchQuery = ref('')
const charEditorRoleFilter = ref('all') // 'all' | 'student' | 'teacher' | 'pending'

// ==================== AI角色导入状态 ====================
const showAIImportInput = ref(false) // 输入面板
const showAIImportResult = ref(false) // 结果面板
const aiImportLoading = ref(false) // 加载状态
const aiImportError = ref('') // 错误信息
const aiImportEntries = ref([{ work: '', character: '' }]) // 输入条目
const aiImportResults = ref({ found: [], notFound: [], workResults: [] }) // 查询结果
const aiImportStreamText = ref('') // 流式输出文本（用于显示进度）

// ==================== AI角色导入功能 ====================

const openAIImport = () => {
  aiImportEntries.value = [{ work: '', character: '' }]
  aiImportError.value = ''
  aiImportStreamText.value = ''
  aiImportResults.value = { found: [], notFound: [], workResults: [] }
  showAIImportInput.value = true
}

const addAIImportEntry = () => {
  aiImportEntries.value.push({ work: '', character: '' })
}

const removeAIImportEntry = (index) => {
  if (aiImportEntries.value.length > 1) {
    aiImportEntries.value.splice(index, 1)
  }
}

// 构建AI导入提示词
const buildAIImportPrompt = () => {
  const templateKeys = Object.keys(DEFAULT_TEMPLATES).join(', ')
  const prefKeys = Object.keys(ELECTIVE_PREFERENCES).join(', ')

  const entries = aiImportEntries.value.filter(e => e.work.trim())
  let querySection = ''
  const workOnlyEntries = entries.filter(e => !e.character.trim())
  const charEntries = entries.filter(e => e.character.trim())

  if (workOnlyEntries.length > 0) {
    querySection += '请列出以下作品中你认识的所有角色：\n'
    workOnlyEntries.forEach(e => { querySection += `- 作品：${e.work}\n` })
  }
  if (charEntries.length > 0) {
    querySection += '请查询以下角色的详细信息：\n'
    charEntries.forEach(e => { querySection += `- 作品：${e.work}，角色：${e.character}\n` })
  }

  return `你是一个角色数据库查询助手。你的唯一任务是根据用户提供的动漫/游戏/小说作品名和角色名，返回你知识库中已知的角色信息。

核心规则：
1. 绝对不允许编造角色。如果你不认识某个作品或角色，必须明确标记 found="false"。
2. 如果你只是模糊听过但不确定，也标记为 found="false"。宁可漏报也不能错报。
3. 只返回结构化的XML指令，不要输出任何叙事文本、解释或<content>标签。
4. 性格四维轴说明：order(秩序感,-100混乱~100守序), altruism(利他性,-100利己~100利他), tradition(传统性,-100革新~100传统), peace(和平性,-100好斗~100温和)
5. 选课倾向可选值：${prefKeys}
6. 日程模板可选值：${templateKeys}
7. 关系中的数值范围：intimacy(亲密度,0~100), trust(信赖度,0~100), passion(激情度,0~100), hostility(敌意度,0~100)

[返回格式 - 查询特定角色]
对每个查询的角色返回：
<roster_character name="角色名" work="作品名" found="true" gender="male或female">
  <personality order="数值" altruism="数值" tradition="数值" peace="数值" />
  <elective_preference>类型</elective_preference>
  <schedule_tag>模板ID</schedule_tag>
  <relationships>
    <rel target="同作品关系角色名" intimacy="数值" trust="数值" passion="数值" hostility="数值" tags="印象标签,逗号分隔" />
  </relationships>
</roster_character>

如果角色未找到：
<roster_character name="角色名" work="作品名" found="false" reason="未找到原因" />

[返回格式 - 查询作品中的所有角色]
<roster_work work="作品名" found="true">
  <char name="角色名1" gender="male或female" />
  <char name="角色名2" gender="male或female" />
</roster_work>

如果作品未找到：
<roster_work work="作品名" found="false" reason="未找到原因" />

${querySection}`
}

// 解析XML属性辅助函数
const parseAttributes = (attrStr) => {
  const attrs = {}
  const regex = /(\w+)="([^"]*)"/g
  let m
  while ((m = regex.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

const clampValue = (val, min, max) => Math.max(min, Math.min(max, val))

// 解析AI返回的响应
const parseAIImportResponse = (text) => {
  const found = []
  const notFound = []
  const workResults = []
  const parsedNames = new Set()

  // 解析 <roster_character>...</roster_character> 完整标签
  const charRegex = /<roster_character\s+([^>]+)>([\s\S]*?)<\/roster_character>/g
  let match
  while ((match = charRegex.exec(text)) !== null) {
    const attrs = parseAttributes(match[1])
    const body = match[2]
    parsedNames.add(attrs.name)

    if (attrs.found === 'false') {
      notFound.push({ name: attrs.name || '未知', work: attrs.work || '未知', reason: attrs.reason || 'AI知识库中无此角色' })
      continue
    }

    // 解析性格
    const pMatch = body.match(/<personality\s+([^/]+)\/>/)
    let personality = { order: 0, altruism: 0, tradition: 0, peace: 50 }
    if (pMatch) {
      const pa = parseAttributes(pMatch[1])
      personality = {
        order: clampValue(parseInt(pa.order) || 0, -100, 100),
        altruism: clampValue(parseInt(pa.altruism) || 0, -100, 100),
        tradition: clampValue(parseInt(pa.tradition) || 0, -100, 100),
        peace: clampValue(parseInt(pa.peace) || 50, -100, 100)
      }
    }

    // 解析选课倾向
    const prefMatch = body.match(/<elective_preference>(.*?)<\/elective_preference>/)
    let electivePreference = 'general'
    if (prefMatch && ELECTIVE_PREFERENCES[prefMatch[1].trim()]) {
      electivePreference = prefMatch[1].trim()
    }

    // 解析日程模板
    const schedMatch = body.match(/<schedule_tag>(.*?)<\/schedule_tag>/)
    let scheduleTag = ''
    if (schedMatch && DEFAULT_TEMPLATES[schedMatch[1].trim()]) {
      scheduleTag = schedMatch[1].trim()
    }

    // 解析关系
    const relationships = []
    const relRegex = /<rel\s+([^/]+)\/>/g
    let relMatch
    while ((relMatch = relRegex.exec(body)) !== null) {
      const ra = parseAttributes(relMatch[1])
      relationships.push({
        target: ra.target || '',
        intimacy: clampValue(parseInt(ra.intimacy) || 0, 0, 100),
        trust: clampValue(parseInt(ra.trust) || 0, 0, 100),
        passion: clampValue(parseInt(ra.passion) || 0, 0, 100),
        hostility: clampValue(parseInt(ra.hostility) || 0, 0, 100),
        tags: ra.tags ? ra.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : []
      })
    }

    found.push({
      name: attrs.name || '未知',
      work: attrs.work || '未知',
      gender: attrs.gender || 'female',
      personality, electivePreference, scheduleTag, relationships,
      selected: true
    })
  }

  // 解析自闭合的 <roster_character ... /> 标签（未找到的角色）
  const charSCRegex = /<roster_character\s+([^/]+)\s*\/>/g
  while ((match = charSCRegex.exec(text)) !== null) {
    const attrs = parseAttributes(match[1])
    if (parsedNames.has(attrs.name)) continue
    parsedNames.add(attrs.name)
    if (attrs.found === 'false') {
      notFound.push({ name: attrs.name || '未知', work: attrs.work || '未知', reason: attrs.reason || 'AI知识库中无此角色' })
    }
  }

  // 解析 <roster_work>...</roster_work>
  const workRegex = /<roster_work\s+([^>]+)>([\s\S]*?)<\/roster_work>/g
  const parsedWorks = new Set()
  while ((match = workRegex.exec(text)) !== null) {
    const attrs = parseAttributes(match[1])
    parsedWorks.add(attrs.work)
    if (attrs.found === 'false') {
      workResults.push({ work: attrs.work || '未知', found: false, reason: attrs.reason || '未找到该作品', characters: [] })
      continue
    }
    const chars = []
    const cRegex = /<char\s+([^/]+)\/>/g
    let cm
    while ((cm = cRegex.exec(match[2])) !== null) {
      const ca = parseAttributes(cm[1])
      chars.push({ name: ca.name || '未知', gender: ca.gender || 'female', selected: true })
    }
    workResults.push({ work: attrs.work || '未知', found: true, characters: chars })
  }

  // 解析自闭合的 <roster_work ... />
  const workSCRegex = /<roster_work\s+([^/]+)\s*\/>/g
  while ((match = workSCRegex.exec(text)) !== null) {
    const attrs = parseAttributes(match[1])
    if (parsedWorks.has(attrs.work)) continue
    if (attrs.found === 'false') {
      workResults.push({ work: attrs.work || '未知', found: false, reason: attrs.reason || '未找到该作品', characters: [] })
    }
  }

  return { found, notFound, workResults }
}

// 提交AI查询
const submitAIImport = async () => {
  const validEntries = aiImportEntries.value.filter(e => e.work.trim())
  if (validEntries.length === 0) {
    aiImportError.value = '请至少填写一个作品名'
    return
  }
  if (!window.generate) {
    aiImportError.value = 'AI生成接口不可用（需要在SillyTavern环境中运行）'
    return
  }

  aiImportLoading.value = true
  aiImportError.value = ''
  aiImportStreamText.value = ''

  try {
    const prompt = buildAIImportPrompt()
    console.log('[AI Import] Sending query to AI...')

    const result = await window.generateRaw({
      user_input: prompt,
      ordered_prompts: [
        { role: 'system', content: '你是角色数据库查询助手。只返回结构化XML数据，不要输出任何叙事内容、<content>标签或额外解释。' },
        'user_input',
      ],
      should_stream: false
    })

    if (!result || result === '__ERROR__' || result === '__STOPPED__') {
      aiImportError.value = 'AI生成失败或被中断，请重试'
      return
    }

    console.log('[AI Import] Received response, parsing...')
    aiImportStreamText.value = result

    const parsed = parseAIImportResponse(result)
    aiImportResults.value = parsed

    if (parsed.found.length === 0 && parsed.notFound.length === 0 && parsed.workResults.length === 0) {
      aiImportError.value = '无法从AI回复中解析出有效数据，请重试'
      return
    }

    showAIImportInput.value = false
    showAIImportResult.value = true
  } catch (e) {
    console.error('[AI Import] Error:', e)
    aiImportError.value = `AI调用失败: ${e.message}`
  } finally {
    aiImportLoading.value = false
  }
}

// 切换角色选中状态
const toggleAIResultChar = (index) => {
  aiImportResults.value.found[index].selected = !aiImportResults.value.found[index].selected
}

const toggleAIWorkChar = (workIndex, charIndex) => {
  aiImportResults.value.workResults[workIndex].characters[charIndex].selected =
    !aiImportResults.value.workResults[workIndex].characters[charIndex].selected
}

// 对作品角色列表进行详细查询
const submitWorkCharactersForDetail = async () => {
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
  // 不关闭结果面板，保持打开并显示加载状态
  await submitAIImport()
}

// 确认导入选中角色到角色池
const confirmAIImport = async () => {
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
    characterPool.value.push({
      name: char.name,
      gender: char.gender,
      origin: `(${char.work})`,
      classId: '',
      role: 'student',
      subject: '',
      isHeadTeacher: false,
      electivePreference: char.electivePreference || 'general',
      scheduleTag: char.scheduleTag || '',
      personality: char.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 }
    })
    addedCount++
  }

  await saveFullCharacterPool(deepClone(characterPool.value))
  showAIImportResult.value = false
  aiImportResults.value = { found: [], notFound: [], workResults: [] }
  const msg = `已导入 ${addedCount} 个角色` + (skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在角色` : '')
  alert(msg)
}

const closeAIImport = () => {
  // 加载中时禁止关闭
  if (aiImportLoading.value) return
  showAIImportInput.value = false
  showAIImportResult.value = false
  aiImportError.value = ''
}

// ==================== 预设配置 ====================
const ROSTER_PRESETS = {
  default: { name: '默认名册', description: '使用世界书中的原始班级名册', icon: '📋' },
  blank: { name: '空白名册', description: '清空所有班级学生，从头开始组合', icon: '📄' }
}

// ==================== 辅助函数：深拷贝响应式数据 ====================
const deepClone = (data) => {
  return JSON.parse(JSON.stringify(toRaw(data)))
}

// 提取干净的作品名（去掉括号）
const getCleanOrigin = (origin) => {
  if (!origin) return '未知'
  const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
  return match ? match[1] : origin
}

// ==================== 初始化 ====================
onMounted(async () => {
  await loadData()
  await loadCharacterPool()
})

// ==================== 数据加载 ====================
const loadData = async (forceUpdate = false) => {
  loading.value = true
  try {
    // 确保班级数据已加载
    if (!gameStore.allClassData || Object.keys(gameStore.allClassData).length === 0) {
      console.log('[RosterFilter] Class data not loaded, loading now...')
      await gameStore.loadClassData()
    }
    
    let backupData = await getRosterBackup()
    const currentData = gameStore.allClassData
    
    if (!backupData || Object.keys(backupData).length === 0) {
      console.log('[RosterFilter] Creating new backup from current data')
      backupData = JSON.parse(JSON.stringify(currentData))
      await saveRosterBackup(backupData)
      
      const hasBackup = await hasBackupWorldbook()
      if (!hasBackup) {
        await createDefaultRosterBackupWorldbook(backupData)
      }
    } else {
      console.log('[RosterFilter] Merging current data into backup', forceUpdate ? '(Forced)' : '')
      let hasChanges = false
      for (const [classId, classInfo] of Object.entries(currentData)) {
        if (!backupData[classId]) {
          backupData[classId] = JSON.parse(JSON.stringify(classInfo))
          hasChanges = true
        } else {
          // 合并学生
          const backupStudents = Array.isArray(backupData[classId].students) ? backupData[classId].students : []
          const currentStudents = Array.isArray(classInfo.students) ? classInfo.students : []
          
          currentStudents.forEach(curr => {
            const existing = backupStudents.find(b => b.name === curr.name)
            if (!existing) {
              // 新学生，完整复制
              backupStudents.push(JSON.parse(JSON.stringify(toRaw(curr))))
              hasChanges = true
            } else {
              // 更新字段逻辑
              if (forceUpdate) {
                // 强制更新模式：世界书数据覆盖本地（如果有值）
                if (curr.electivePreference) {
                  existing.electivePreference = curr.electivePreference
                  hasChanges = true
                }
                if (curr.scheduleTag) {
                  existing.scheduleTag = curr.scheduleTag
                  hasChanges = true
                }
              } else {
                // 正常模式：仅补充缺失的字段
                if (!existing.electivePreference && curr.electivePreference) {
                  existing.electivePreference = curr.electivePreference
                  hasChanges = true
                }
                if (!existing.scheduleTag && curr.scheduleTag) {
                  existing.scheduleTag = curr.scheduleTag
                  hasChanges = true
                }
              }
            }
          })
          backupData[classId].students = backupStudents
          
          // 合并教师
          const backupTeachers = Array.isArray(backupData[classId].teachers) ? backupData[classId].teachers : []
          const currentTeachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
          currentTeachers.forEach(curr => {
            const existing = backupTeachers.find(b => b.name === curr.name)
            if (!existing) {
              if (curr.name) {
                backupTeachers.push(JSON.parse(JSON.stringify(toRaw(curr))))
                hasChanges = true
              }
            } else if (forceUpdate && curr.subject) {
              // 强制更新时，更新科目
              existing.subject = curr.subject
              hasChanges = true
            }
          })
          backupData[classId].teachers = backupTeachers
          
          // 合并班主任
          if (classInfo.headTeacher?.name && !backupData[classId].headTeacher?.name) {
            backupData[classId].headTeacher = JSON.parse(JSON.stringify(classInfo.headTeacher))
            hasChanges = true
          }
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
    
    // 在强制更新模式下，先收集世界书中的所有学生名（用于确定选中状态）
    const worldbookStudentSets = {}
    if (forceUpdate) {
      for (const [classId, classInfo] of Object.entries(currentData)) {
        const students = Array.isArray(classInfo?.students) ? classInfo.students : []
        worldbookStudentSets[classId] = new Set(students.map(s => s.name))
      }
    }
    
    for (const [classId, classInfo] of Object.entries(backupData)) {
      // 修复：使用 Array.isArray 确保是数组
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      if (students.length === 0) continue
      
      const currentClassInfo = currentData[classId]
      const currentStudentNames = new Set(
        Array.isArray(currentClassInfo?.students) 
          ? currentClassInfo.students.map(s => s.name) 
          : []
      )
      
      state[classId] = {}
      
      students.forEach(student => {
        if (forceUpdate) {
          // 强制更新模式：只有在世界书中存在的学生才标记为选中
          // 如果这个班级在世界书中不存在，则保持选中（向后兼容）
          const worldbookSet = worldbookStudentSets[classId]
          state[classId][student.name] = worldbookSet ? worldbookSet.has(student.name) : true
        } else {
          // 正常模式：根据当前数据判断
          state[classId][student.name] = currentStudentNames.has(student.name)
        }
        
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
    
    console.log('[RosterFilter] Data loaded, classes:', Object.keys(backupData).length)
    
  } catch (e) {
    console.error('[RosterFilter] Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// 加载角色池（从快照构建，合并已保存的自定义角色）
const loadCharacterPool = async () => {
  try {
    console.log('[RosterFilter] Loading character pool...')
    
    // 1. 获取持久化的角色池
    let savedPool = await getFullCharacterPool()
    // 修复：确保 savedPool 是数组
    if (!Array.isArray(savedPool)) {
      savedPool = []
    }
    const savedMap = new Map(savedPool.map(c => [c.name, c]))
    
    // 2. 从快照构建基础角色池
    const currentPool = []
    const addedNames = new Set() // 用于去重（主要用于学生和防止重复添加）
    const teacherMap = new Map() // 用于聚合教师信息
    const snapshot = fullRosterSnapshot.value
    
    if (!snapshot || Object.keys(snapshot).length === 0) {
      console.log('[RosterFilter] Snapshot is empty, waiting...')
      characterPool.value = savedPool
      return
    }
    
    for (const [classId, classInfo] of Object.entries(snapshot)) {
      // --- 处理教师（聚合多重身份）---
      
      // 1. 班主任
      if (classInfo.headTeacher?.name) {
        const name = classInfo.headTeacher.name
        if (!teacherMap.has(name)) {
          teacherMap.set(name, {
            name: name,
            gender: classInfo.headTeacher.gender || 'female',
            origin: classInfo.headTeacher.origin || '',
            classId: classId, // 初始设置为该班
            role: 'teacher',
            subjects: new Set(),
            subjectsByClass: {}, // 修复：添加 subjectsByClass 属性
            isHeadTeacher: true,
            electivePreference: 'general',
            scheduleTag: '',
            personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
          })
        } else {
          // 已存在：标记为班主任，且班级归属优先变更为其担任班主任的班级
          const t = teacherMap.get(name)
          t.isHeadTeacher = true
          t.classId = classId
          // 如果之前从 savedMap 合并过数据，这里不需要特殊处理，最后统一合并
        }
      }
      
      // 2. 科任教师
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => {
        if (!t.name) return
        
        if (!teacherMap.has(t.name)) {
          teacherMap.set(t.name, {
            name: t.name,
            gender: t.gender || 'female',
            origin: t.origin || '',
            classId: classId,
            role: 'teacher',
            subjects: new Set(),
            subjectsByClass: {}, // 新增：保存每个班级对应的具体科目
            isHeadTeacher: false,
            electivePreference: 'general',
            scheduleTag: '',
            personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
          })
        }
        
        // 收集科目
        const teacherObj = teacherMap.get(t.name)
        if (t.subject) {
          // 保存该班级对应的原始科目
          teacherObj.subjectsByClass[classId] = t.subject
          
          // 支持逗号、顿号分隔（用于合并后的显示）
          t.subject.split(/[,，、]/).forEach(s => {
            const trimmed = s.trim()
            if (trimmed) teacherObj.subjects.add(trimmed)
          })
        }
      })
      
      // --- 处理学生（保持原有简单去重逻辑）---
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      students.forEach(s => {
        if (s.name && !addedNames.has(s.name)) {
          const char = {
            name: s.name,
            gender: s.gender || 'female',
            origin: s.origin || '',
            classId,
            role: 'student',
            subject: '',
            isHeadTeacher: false,
            electivePreference: s.electivePreference || 'general',
            scheduleTag: s.scheduleTag || '',
            personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
          }
          if (savedMap.has(char.name)) {
            const saved = savedMap.get(char.name)
            char.personality = saved.personality || char.personality
            // 保留已保存的选课倾向（如果当前没有）
            if (!s.electivePreference && saved.electivePreference) {
              char.electivePreference = saved.electivePreference
            }
            savedMap.delete(char.name)
          }
          currentPool.push(char)
          addedNames.add(char.name)
        }
      })
    }
    
    // --- 将聚合后的教师加入池中 ---
    for (const teacher of teacherMap.values()) {
      // 格式化科目
      const subjectStr = Array.from(teacher.subjects).join('、')
      
      const char = {
        ...teacher,
        subject: subjectStr,
        subjects: undefined // 清理临时 Set
      }
      
      // 合并已保存的自定义属性
      if (savedMap.has(char.name)) {
        const saved = savedMap.get(char.name)
        char.personality = saved.personality || char.personality
        savedMap.delete(char.name)
      }
      
      // 避免与学生重名（虽然不太可能，但安全起见）
      if (!addedNames.has(char.name)) {
        currentPool.push(char)
        addedNames.add(char.name)
      }
    }
    
    // 3. 添加剩余的自定义角色（不在班级中的，同样去重）
    for (const [name, char] of savedMap) {
      if (!addedNames.has(name)) {
        char.classId = char.classId || ''
        currentPool.push(char)
        addedNames.add(name)
      }
    }
    
    characterPool.value = currentPool
    // 修复：保存时使用深拷贝避免 Proxy 问题
    await saveFullCharacterPool(deepClone(currentPool))
    
    console.log('[RosterFilter] Character pool loaded:', currentPool.length, 'characters')
    
  } catch (e) {
    console.error('[RosterFilter] Error loading character pool:', e)
  }
}

// 获取学生所属社团
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
    
    // 去重
    const uniqueMap = new Map()
    for (const c of clubs) {
      if (uniqueMap.has(c.name)) {
        const existing = uniqueMap.get(c.name)
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

// ==================== 教师数据处理 ====================
const processedTeacherGroups = computed(() => {
  const groups = {}

  if (teacherViewMode.value === 'class') {
    // 按班级分组（班内去重）
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      const className = classInfo.name || classId
      const teacherMap = new Map()

      // 1. 处理班主任
      if (classInfo.headTeacher?.name) {
        teacherMap.set(classInfo.headTeacher.name, {
          ...classInfo.headTeacher,
          classId,
          className,
          roles: ['班主任'],
          isHeadTeacher: true
        })
      }

      // 2. 处理科任
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => {
        if (!t.name) return
        if (teacherMap.has(t.name)) {
          // 已存在（即班主任），追加科目
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
    // 按作品分组（全局去重）
    const globalTeacherMap = new Map()

    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      const className = classInfo.name || classId

      // 辅助函数：合并到全局Map
      const mergeToGlobal = (teacher, roleDesc, isHead = false) => {
        if (!teacher.name) return
        if (!globalTeacherMap.has(teacher.name)) {
          globalTeacherMap.set(teacher.name, {
            name: teacher.name,
            gender: teacher.gender || 'female',
            origin: teacher.origin || '未知',
            assignments: [],
            isHeadTeacher: false,
            // 保留第一个找到的 classId 用于定位（虽然可能有多个）
            classId: classId
          })
        }
        const entry = globalTeacherMap.get(teacher.name)
        if (isHead) entry.isHeadTeacher = true
        entry.assignments.push({ className, role: roleDesc, classId })
        // 更新 Origin (以防之前是未知的)
        if (teacher.origin && entry.origin === '未知') entry.origin = teacher.origin
      }

      // 1. 班主任
      if (classInfo.headTeacher?.name) {
        mergeToGlobal(classInfo.headTeacher, '班主任', true)
      }

      // 2. 科任
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => {
        mergeToGlobal(t, t.subject || '教师')
      })
    }

    // 按 Origin 分组
    for (const teacher of globalTeacherMap.values()) {
      let origin = '未知'
      if (teacher.origin) {
        const match = teacher.origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
        origin = match ? match[1] : teacher.origin
      }
      
      if (!groups[origin]) groups[origin] = []
      groups[origin].push(teacher)
    }
  }
  
  // 排序：组名排序
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

// 监听数据变化，默认展开所有教师分组
watch(processedTeacherGroups, (newGroups) => {
  if (Object.keys(expandedTeacherGroups.value).length === 0) {
    Object.keys(newGroups).forEach(g => expandedTeacherGroups.value[g] = true)
  }
}, { immediate: true })

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

  // 1. 如果是编辑模式，先从原来的位置移除
  if (editingTeacher.value) {
    const oldClassId = editingTeacher.value.classId
    const oldName = editingTeacher.value.name
    const oldClassData = fullRosterSnapshot.value[oldClassId]
    
    if (oldClassData) {
      // 检查是否是班主任
      if (oldClassData.headTeacher?.name === oldName) {
        oldClassData.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      
      // 检查是否在科任教师列表中
      if (Array.isArray(oldClassData.teachers)) {
        const idx = oldClassData.teachers.findIndex(t => t.name === oldName)
        if (idx !== -1) {
          oldClassData.teachers.splice(idx, 1)
        }
      }
    }
  }
  
  // 2. 添加到新位置
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
  loadCharacterPool() // 刷新角色池
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
  loadCharacterPool() // 刷新角色池
}

// ==================== 班级组合器 ====================
const initComposer = async () => {
  // 确保角色池已加载
  if (characterPool.value.length === 0) {
    await loadCharacterPool()
  }
  
  // 加载可用地点列表（用于教室选择）
  await loadAvailableLocations()
  
  if (!composerTargetClass.value && Object.keys(fullRosterSnapshot.value).length > 0) {
    composerTargetClass.value = Object.keys(fullRosterSnapshot.value)[0]
  }
  loadComposerClassData()
}

// 递归收集某个地点的所有后代ID
const collectDescendantIds = (allLocations, parentId) => {
  const result = new Set()
  const queue = [parentId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const loc of allLocations) {
      if (loc.parentId === current) {
        result.add(loc.id)
        queue.push(loc.id) // 继续递归
      }
    }
  }
  return result
}

// 加载可用地点列表（仅限 th_teaching_area 教学区子地点）
const loadAvailableLocations = async () => {
  try {
    const mapData = await fetchMapDataFromWorldbook()
    if (mapData && mapData.length > 0) {
      // 收集 th_teaching_area 的所有后代
      const teachingAreaDescendants = collectDescendantIds(mapData, 'th_teaching_area')
      // 同时也允许 th_teaching_area 的直接子地点
      availableLocations.value = mapData
        .filter(loc => loc.parentId === 'th_teaching_area' || teachingAreaDescendants.has(loc.id))
        .map(loc => ({ id: loc.id, name: loc.name || loc.id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      console.log('[RosterFilter] Loaded', availableLocations.value.length, 'locations for classroom selection (teaching area only)')
    }
  } catch (e) {
    console.warn('[RosterFilter] Failed to load locations:', e)
  }
}

// 将班级ID转换为教室ID（如 1-A → classroom_1a）
const classIdToClassroomId = (classId) => {
  if (!classId) return 'classroom_new'
  return 'classroom_' + classId.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// 获取班级名称（用于教室名称预填充）
const getClassDisplayName = (classId) => {
  const classInfo = fullRosterSnapshot.value[classId]
  return classInfo?.name || classId
}

// 打开地图编辑器创建教室
const openMapEditorForClassroom = () => {
  showMapEditorForClassroom.value = true
}

// 地图编辑器创建教室后的回调
const onClassroomLocationSelected = async (location) => {
  console.log('[RosterFilter] Classroom created:', location)
  // 设置当前班级的教室ID
  if (composerClassData.value) {
    composerClassData.value.classroomId = location.id
  }
  showMapEditorForClassroom.value = false
  // 刷新可用地点列表
  await loadAvailableLocations()
}

// 关闭地图编辑器
const closeMapEditor = () => {
  showMapEditorForClassroom.value = false
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

// 更新可用角色列表
const updateAvailableCharacters = () => {
  const currentMembers = new Set()
  
  // 当前班级的所有成员
  if (composerClassData.value.headTeacher?.name) {
    currentMembers.add(composerClassData.value.headTeacher.name)
  }
  // 修复：使用 Array.isArray 确保是数组
  const composerTeachers = Array.isArray(composerClassData.value.teachers) ? composerClassData.value.teachers : []
  composerTeachers.forEach(t => {
    if (t.name) currentMembers.add(t.name)
  })
  const composerStudents = Array.isArray(composerClassData.value.students) ? composerClassData.value.students : []
  composerStudents.forEach(s => {
    if (s.name) currentMembers.add(s.name)
  })
  
  // 构建所有班级的成员分配映射
  const assignmentMap = new Map()
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classId === composerTargetClass.value) continue
    
    if (classInfo.headTeacher?.name) {
      assignmentMap.set(classInfo.headTeacher.name, { classId, className: classInfo.name || classId })
    }
    // 修复：使用 Array.isArray 确保是数组
    const classTeachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
    classTeachers.forEach(t => {
      if (t.name) assignmentMap.set(t.name, { classId, className: classInfo.name || classId })
    })
    const classStudents = Array.isArray(classInfo.students) ? classInfo.students : []
    classStudents.forEach(s => {
      if (s.name) assignmentMap.set(s.name, { classId, className: classInfo.name || classId })
    })
  }
  
  // 过滤和标记角色
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

// 过滤可用角色
const filteredAvailableCharacters = computed(() => {
  let result = availableCharacters.value
  
  // 角色类型筛选
  if (composerRoleFilter.value !== 'all') {
    if (composerRoleFilter.value === 'pending') {
      // 待入学：role=student 且 grade=0 (或无classId)
      result = result.filter(c => c.role === 'student' && (c.grade === 0 || (!c.classId && !c.grade)))
    } else {
      result = result.filter(c => c.role === composerRoleFilter.value)
    }
  }
  
  // 按作品筛选
  if (composerWorkFilter.value) {
    result = result.filter(c => getCleanOrigin(c.origin) === composerWorkFilter.value)
  }
  
  // 仅显示未分配角色
  if (composerShowUnassigned.value) {
    result = result.filter(c => !c.isAssigned)
  }
  
  // 搜索筛选
  if (composerSearchQuery.value) {
    const query = composerSearchQuery.value.toLowerCase()
    result = result.filter(c => 
      c.name.toLowerCase().includes(query) || 
      (c.origin && c.origin.toLowerCase().includes(query))
    )
  }
  
  return result
})

// 可用角色的作品列表（用于筛选下拉菜单）
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

// 按作品分组的可用角色
const composerGroupedCharacters = computed(() => {
  const chars = filteredAvailableCharacters.value
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

// 获取某个作品在当前班级中已添加的角色数量
const getWorkAddedCount = (workName) => {
  const students = Array.isArray(composerClassData.value.students) ? composerClassData.value.students : []
  const teachers = Array.isArray(composerClassData.value.teachers) ? composerClassData.value.teachers : []
  const allMembers = [...students, ...teachers]
  if (composerClassData.value.headTeacher?.name) {
    allMembers.push(composerClassData.value.headTeacher)
  }
  return allMembers.filter(m => getCleanOrigin(m.origin) === workName).length
}

// 从其他班级移除角色（用于冲突替换）
const removeCharacterFromOtherClass = (charName) => {
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classId === composerTargetClass.value) continue
    
    const students = Array.isArray(classInfo.students) ? classInfo.students : []
    const sIdx = students.findIndex(s => s.name === charName)
    if (sIdx !== -1) {
      students.splice(sIdx, 1)
      console.log(`[Composer] Removed ${charName} from class ${classId} (student)`)
      return
    }
    
    const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
    const tIdx = teachers.findIndex(t => t.name === charName)
    if (tIdx !== -1) {
      teachers.splice(tIdx, 1)
      console.log(`[Composer] Removed ${charName} from class ${classId} (teacher)`)
      return
    }
    
    if (classInfo.headTeacher?.name === charName) {
      classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      console.log(`[Composer] Removed ${charName} from class ${classId} (head teacher)`)
      return
    }
  }
}

// 一键添加作品中的所有角色到班级
const addWorkToClass = (workName) => {
  const chars = composerGroupedCharacters.value[workName]
  if (!chars || chars.length === 0) return
  
  const conflicts = []
  const noConflicts = []
  
  chars.forEach(c => {
    if (c.isAssigned) {
      conflicts.push(c)
    } else {
      noConflicts.push(c)
    }
  })
  
  // 无冲突的直接添加
  noConflicts.forEach(c => addCharacterToClass(c))
  
  // 有冲突的弹出确认面板
  if (conflicts.length > 0) {
    conflictCharacters.value = conflicts.map(c => ({
      ...c,
      resolution: 'skip'
    }))
    showConflictModal.value = true
  }
}

// 应用冲突解决方案
const applyConflictResolutions = () => {
  for (const char of conflictCharacters.value) {
    if (char.resolution === 'replace') {
      removeCharacterFromOtherClass(char.name)
      addCharacterToClass(char)
    }
  }
  showConflictModal.value = false
  conflictCharacters.value = []
  updateAvailableCharacters()
}

// 批量设置冲突解决方案
const setAllConflictResolutions = (resolution) => {
  conflictCharacters.value.forEach(c => c.resolution = resolution)
}

// 添加角色到班级
const addCharacterToClass = (char) => {
  if (char.role === 'teacher') {
    // 教师：优先使用该教师在目标班级的原始科目
    let subjectForClass = ''
    
    // 1. 首先尝试从 subjectsByClass 获取（角色池中保存的班级特定科目）
    if (char.subjectsByClass && char.subjectsByClass[composerTargetClass.value]) {
      subjectForClass = char.subjectsByClass[composerTargetClass.value]
    }
    
    // 2. 如果没有，尝试从原始快照获取（该教师在目标班级的原始科目）
    if (!subjectForClass) {
      const targetClassSnapshot = fullRosterSnapshot.value[composerTargetClass.value]
      if (targetClassSnapshot?.teachers) {
        const originalTeacher = targetClassSnapshot.teachers.find(t => t.name === char.name)
        if (originalTeacher?.subject) {
          subjectForClass = originalTeacher.subject
        }
      }
    }
    
    // 3. 都没有时留空，让用户手动填写
    
    if (!composerClassData.value.teachers) composerClassData.value.teachers = []
    composerClassData.value.teachers.push({
      name: char.name,
      gender: char.gender,
      origin: char.origin,
      subject: subjectForClass,
      role: 'teacher'
    })
  } else {
    // 学生
    if (!composerClassData.value.students) composerClassData.value.students = []
    composerClassData.value.students.push({
      name: char.name,
      gender: char.gender,
      origin: char.origin,
      role: 'student',
      classId: composerTargetClass.value,
      electivePreference: char.electivePreference || 'general',
      scheduleTag: char.scheduleTag || ''
    })
  }
  updateAvailableCharacters()
}

// 从班级移除学生
const removeStudentFromClass = (index) => {
  composerClassData.value.students.splice(index, 1)
  updateAvailableCharacters()
}

// 从班级移除教师
const removeTeacherFromClass = (index) => {
  composerClassData.value.teachers.splice(index, 1)
  updateAvailableCharacters()
}

// 设置班主任
const setHeadTeacher = (char) => {
  composerClassData.value.headTeacher = {
    name: char.name,
    gender: char.gender,
    origin: char.origin,
    role: 'teacher'
  }
  updateAvailableCharacters()
}

// 清除班主任
const clearHeadTeacher = () => {
  composerClassData.value.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
  updateAvailableCharacters()
}

// 设置教师科目
const setTeacherSubject = (index, subject) => {
  if (composerClassData.value.teachers[index]) {
    composerClassData.value.teachers[index].subject = subject
  }
}

// 应用组合器更改
const applyComposerChanges = async () => {
  if (!composerTargetClass.value) return
  
  saving.value = true
  try {
    // 更新内存
    gameStore.allClassData[composerTargetClass.value] = JSON.parse(JSON.stringify(composerClassData.value))
    
    // 更新快照
    fullRosterSnapshot.value[composerTargetClass.value] = JSON.parse(JSON.stringify(composerClassData.value))
    // 修复：保存时使用深拷贝避免 Proxy 问题
    await saveRosterBackup(deepClone(fullRosterSnapshot.value))
    
    // 同步到世界书
    const success = await updateClassDataInWorldbook(composerTargetClass.value, composerClassData.value)
    
    if (success) {
      alert('班级名册已更新！')
      await loadData()
      await loadCharacterPool()
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
  
  const newClass = {
    name,
    headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
    teachers: [],
    students: []
  }
  
  fullRosterSnapshot.value[id] = newClass
  gameStore.allClassData[id] = JSON.parse(JSON.stringify(newClass))
  
  // 修复：保存时使用深拷贝避免 Proxy 问题
  await saveRosterBackup(deepClone(fullRosterSnapshot.value))
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
  
  delete fullRosterSnapshot.value[classId]
  delete gameStore.allClassData[classId]
  
  // 同步删除世界书中的班级条目
  await deleteClassDataFromWorldbook(classId)
  
  // 修复：保存时使用深拷贝避免 Proxy 问题
  await saveRosterBackup(deepClone(fullRosterSnapshot.value))
  
  const remainingClasses = Object.keys(fullRosterSnapshot.value)
  composerTargetClass.value = remainingClasses[0] || ''
  
  if (composerTargetClass.value) {
    loadComposerClassData()
  } else {
    composerClassData.value = {}
  }
  
  alert(`班级 "${className}" 已删除`)
}

// ==================== 角色编辑器 ====================
const filteredCharacterPool = computed(() => {
  let result = characterPool.value
  
  // 角色类型筛选
  if (charEditorRoleFilter.value !== 'all') {
    result = result.filter(c => c.role === charEditorRoleFilter.value)
  }
  
  // 搜索筛选
  if (charEditorSearchQuery.value) {
    const query = charEditorSearchQuery.value.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.origin && c.origin.toLowerCase().includes(query)) ||
      (c.classId && c.classId.toLowerCase().includes(query))
    )
  }
  
  return result
})

const charPoolStats = computed(() => {
  const pool = characterPool.value
  return {
    total: pool.length,
    students: pool.filter(c => c.role === 'student').length,
    teachers: pool.filter(c => c.role === 'teacher').length
  }
})

const startEditCharacter = (char) => {
  editingCharacter.value = char
  
  // 为教师构建 assignments 数组
  let assignments = []
  if (char.role === 'teacher') {
    // 1. 首先尝试从已有的 assignments 字段读取
    if (Array.isArray(char.assignments) && char.assignments.length > 0) {
      assignments = char.assignments.map(a => ({ ...a }))
    } else {
      // 2. 从快照中扫描该教师在各班级的任职情况
      for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
        // 检查是否是班主任
        if (classInfo.headTeacher?.name === char.name) {
          // 检查该班级是否已存在于 assignments
          const existing = assignments.find(a => a.classId === classId)
          if (existing) {
            existing.isHeadTeacher = true
          } else {
            assignments.push({
              classId,
              isHeadTeacher: true,
              subject: ''
            })
          }
        }
        
        // 检查是否是科任教师
        const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
        const teacherEntry = teachers.find(t => t.name === char.name)
        if (teacherEntry) {
          const existing = assignments.find(a => a.classId === classId)
          if (existing) {
            // 已存在（可能是班主任），追加科目
            if (teacherEntry.subject && !existing.subject) {
              existing.subject = teacherEntry.subject
            }
          } else {
            assignments.push({
              classId,
              isHeadTeacher: false,
              subject: teacherEntry.subject || ''
            })
          }
        }
      }
      
      // 3. 如果还是空的，且有 classId 字段，创建一个默认记录
      if (assignments.length === 0 && char.classId) {
        assignments.push({
          classId: char.classId,
          isHeadTeacher: char.isHeadTeacher || false,
          subject: char.subject || ''
        })
      }
    }
  }
  
  characterEditForm.value = {
    name: char.name || '',
    gender: char.gender || 'female',
    origin: char.origin || '',
    classId: char.classId || '',
    role: char.role || 'student',
    subject: char.subject || '',
    isHeadTeacher: char.isHeadTeacher || false,
    assignments: assignments,
    electivePreference: char.electivePreference || 'general',
    scheduleTag: char.scheduleTag || '',
    personality: char.personality ? { ...char.personality } : { order: 0, altruism: 0, tradition: 0, peace: 50 }
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
    subject: '',
    isHeadTeacher: false,
    assignments: [], // 教师多班级任职
    electivePreference: 'general',
    scheduleTag: '',
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
  }
  showCharacterEditor.value = true
}

// 添加任职记录
const addAssignment = () => {
  const firstClassId = Object.keys(fullRosterSnapshot.value)[0] || ''
  characterEditForm.value.assignments.push({
    classId: firstClassId,
    isHeadTeacher: false,
    subject: ''
  })
}

// 移除任职记录
const removeAssignment = (index) => {
  characterEditForm.value.assignments.splice(index, 1)
}

const saveCharacterEdit = async () => {
  const form = characterEditForm.value
  if (!form.name) {
    alert('请填写角色姓名')
    return
  }
  
  // 教师：处理多班级任职
  if (form.role === 'teacher' && Array.isArray(form.assignments) && form.assignments.length > 0) {
    // 1. 首先从所有班级中移除该教师的旧记录
    const teacherName = editingCharacter.value?.name || form.name
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
      // 移除班主任
      if (classInfo.headTeacher?.name === teacherName) {
        classInfo.headTeacher = { name: '', gender: 'female', origin: '', role: 'teacher' }
      }
      // 移除科任教师
      if (Array.isArray(classInfo.teachers)) {
        const idx = classInfo.teachers.findIndex(t => t.name === teacherName)
        if (idx !== -1) {
          classInfo.teachers.splice(idx, 1)
        }
      }
    }
    
    // 2. 根据新的 assignments 添加到各班级
    let primaryClassId = '' // 用于设置角色池中的 classId
    let allSubjects = new Set()
    let isAnyHeadTeacher = false
    
    for (const assign of form.assignments) {
      if (!assign.classId) continue
      
      const classData = fullRosterSnapshot.value[assign.classId]
      if (!classData) continue
      
      if (!primaryClassId) primaryClassId = assign.classId
      
      if (assign.isHeadTeacher) {
        // 设置为班主任
        classData.headTeacher = {
          name: form.name,
          gender: form.gender,
          origin: form.origin,
          role: 'teacher'
        }
        isAnyHeadTeacher = true
        primaryClassId = assign.classId // 班主任的班级优先
      }
      
      if (assign.subject) {
        // 添加为科任教师
        if (!classData.teachers) classData.teachers = []
        classData.teachers.push({
          name: form.name,
          gender: form.gender,
          origin: form.origin,
          subject: assign.subject,
          role: 'teacher'
        })
        
        // 收集所有科目
        assign.subject.split(/[,，、]/).forEach(s => {
          const trimmed = s.trim()
          if (trimmed) allSubjects.add(trimmed)
        })
      }
    }
    
    // 3. 更新角色池中的数据
    const charData = {
      name: form.name,
      gender: form.gender,
      origin: form.origin,
      classId: primaryClassId,
      role: 'teacher',
      subject: Array.from(allSubjects).join('、'),
      isHeadTeacher: isAnyHeadTeacher,
      assignments: form.assignments.filter(a => a.classId), // 保留 assignments
      electivePreference: 'general',
      scheduleTag: '',
      personality: { ...form.personality }
    }
    
    if (editingCharacter.value) {
      const idx = characterPool.value.findIndex(c => c.name === editingCharacter.value.name)
      if (idx !== -1) {
        characterPool.value[idx] = charData
      }
    } else {
      if (characterPool.value.find(c => c.name === form.name)) {
        alert('已存在同名角色')
        return
      }
      characterPool.value.push(charData)
    }
    
  } else {
    // 学生或无 assignments 的教师（兼容旧逻辑）
    const charData = {
      name: form.name,
      gender: form.gender,
      origin: form.origin,
      classId: form.classId,
      role: form.role,
      subject: form.role === 'teacher' ? form.subject : '',
      isHeadTeacher: form.role === 'teacher' ? form.isHeadTeacher : false,
      electivePreference: form.role === 'student' ? form.electivePreference : 'general',
      scheduleTag: form.role === 'student' ? form.scheduleTag : '',
      personality: { ...form.personality }
    }
    
    if (editingCharacter.value) {
      const idx = characterPool.value.findIndex(c => c.name === editingCharacter.value.name)
      if (idx !== -1) {
        characterPool.value[idx] = charData
      }
    } else {
      if (characterPool.value.find(c => c.name === form.name)) {
        alert('已存在同名角色')
        return
      }
      characterPool.value.push(charData)
    }
  }
  
  // 保存到 IndexedDB
  await saveFullCharacterPool(deepClone(characterPool.value))
  // 保存快照（教师任职变更需要同步）
  await saveRosterBackup(deepClone(fullRosterSnapshot.value))
  
  showCharacterEditor.value = false
  updateAvailableCharacters()
  
  // 提示用户需要手动同步到世界书
  alert('角色信息已保存到本地！\n\n如需同步到世界书，请点击底部的「确认并同步」按钮。')
}

const deleteCharacter = async (char) => {
  if (!confirm(`确定要从待选池中删除角色 ${char.name} 吗？`)) return
  
  const idx = characterPool.value.findIndex(c => c.name === char.name)
  if (idx !== -1) {
    characterPool.value.splice(idx, 1)
    // 修复：保存时使用深拷贝避免 Proxy 问题
    await saveFullCharacterPool(deepClone(characterPool.value))
    updateAvailableCharacters()
  }
}

// 同步角色池数据到快照（确保保存时包含最新修改）
const syncCharacterPoolToSnapshot = () => {
  console.log('[RosterFilter] Syncing character pool to snapshot...')
  // 创建映射，注意如果有重名角色（虽然不应该），后面的会覆盖前面的
  const poolMap = new Map(characterPool.value.map(c => [c.name, c]))
  
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    // 同步学生信息
    if (Array.isArray(classInfo.students)) {
      classInfo.students.forEach(student => {
        const updated = poolMap.get(student.name)
        if (updated) {
          // 同步选课倾向
          if (updated.electivePreference) {
            student.electivePreference = updated.electivePreference
          }
          // 同步日程标签
          if (updated.scheduleTag) {
            student.scheduleTag = updated.scheduleTag
          }
        }
      })
    }
    
    // 同步教师信息（如科目等）
    if (Array.isArray(classInfo.teachers)) {
      classInfo.teachers.forEach(teacher => {
        const updated = poolMap.get(teacher.name)
        if (updated && updated.subject) {
          teacher.subject = updated.subject
        }
      })
    }
    
    // 同步班主任
    if (classInfo.headTeacher?.name) {
      // 班主任属性通常较少变动，暂不特别处理，除非有具体需求
    }
  }
}

// ==================== 保存与重置 ====================
const handleSave = async () => {
  saving.value = true
  try {
    // 关键修复：保存前先同步角色池的最新修改到快照
    syncCharacterPoolToSnapshot()
    
    const changes = []
    
    for (const [classId, studentStateMap] of Object.entries(currentRosterState.value)) {
      const fullClass = fullRosterSnapshot.value[classId]
      if (!fullClass) continue
      
      // 修复：使用 Array.isArray 确保是数组
      const fullClassStudents = Array.isArray(fullClass.students) ? fullClass.students : []
      
      // 过滤学生时保留所有字段（关键修复：保留 electivePreference）
      const activeStudents = fullClassStudents
        .filter(s => studentStateMap[s.name])
        .map(s => ({
          name: s.name,
          gender: s.gender,
          origin: s.origin,
          role: 'student',
          classId: classId,
          electivePreference: s.electivePreference || 'general',
          scheduleTag: s.scheduleTag || ''
        }))
      
      if (gameStore.allClassData[classId]) {
        gameStore.allClassData[classId].students = activeStudents
        // 同时保留班主任和教师
        gameStore.allClassData[classId].headTeacher = fullClass.headTeacher
        gameStore.allClassData[classId].teachers = fullClass.teachers
        // 保留教室ID
        if (fullClass.classroomId) {
          gameStore.allClassData[classId].classroomId = fullClass.classroomId
        }
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
        
        // 修复：使用 Array.isArray 确保是数组
        const fullClassStudents = Array.isArray(fullClass.students) ? fullClass.students : []
        
        const keepStudents = fullClassStudents
          .filter(s => studentStateMap[s.name])
          .map(s => ({
            name: s.name,
            gender: s.gender,
            origin: s.origin,
            role: 'student',
            classId: classId,
            electivePreference: s.electivePreference || 'general',
            scheduleTag: s.scheduleTag || ''
          }))
        
        // 修复：使用 Array.isArray 确保是数组
        const fullClassTeachers = Array.isArray(fullClass.teachers) ? fullClass.teachers : []
        
        if (keepStudents.length > 0 || fullClass.headTeacher?.name || fullClassTeachers.length > 0) {
          const backupEntry = {
            name: fullClass.name,
            headTeacher: fullClass.headTeacher,
            teachers: fullClassTeachers,
            students: keepStudents
          }
          // 保留教室ID
          if (fullClass.classroomId) {
            backupEntry.classroomId = fullClass.classroomId
          }
          newBackup[classId] = backupEntry
        }
      }
      
      // 修复：保存时使用深拷贝避免 Proxy 问题
      await saveRosterBackup(deepClone(newBackup))
      fullRosterSnapshot.value = newBackup
    }
    
    // ========== 关键修复：清理被排除角色的 npcRelationships ==========
    // 收集当前所有激活的角色名
    const activeCharacterNames = new Set()
    for (const [classId, classInfo] of Object.entries(gameStore.allClassData)) {
      // 班主任
      if (classInfo.headTeacher?.name) {
        activeCharacterNames.add(classInfo.headTeacher.name)
      }
      // 教师
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => { if (t.name) activeCharacterNames.add(t.name) })
      // 学生
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      students.forEach(s => { if (s.name) activeCharacterNames.add(s.name) })
    }
    
    // 从 npcRelationships 中移除不在激活名单中的角色
    if (gameStore.npcRelationships) {
      const allRelChars = Object.keys(gameStore.npcRelationships)
      const removedNames = []
      for (const charName of allRelChars) {
        // 玩家自己不移除
        if (charName === gameStore.player.name) continue
        if (!activeCharacterNames.has(charName)) {
          // 批量操作时不立即持久化（传入 false），最后统一保存
          removeCharacter(charName, false)
          removedNames.push(charName)
        }
      }
      if (removedNames.length > 0) {
        console.log(`[RosterFilter] Removed ${removedNames.length} excluded characters from npcRelationships:`, removedNames)
        // 关键修复：批量移除后立即持久化印象世界书，确保删除的关系不会在游戏中残留
        await saveImpressionDataImmediate()
      }
    }
    
    // ========== 关键修复：清理 npcs 数组中被排除的角色 ==========
    // 确保被排除的角色不会继续出现在日程系统和系统提示词中
    if (gameStore.npcs && gameStore.npcs.length > 0) {
      const npcsToRemove = []
      for (let i = gameStore.npcs.length - 1; i >= 0; i--) {
        const npc = gameStore.npcs[i]
        if (npc.name && npc.name !== gameStore.player.name && !activeCharacterNames.has(npc.name)) {
          npcsToRemove.push(npc.name)
          gameStore.npcs.splice(i, 1)
        }
      }
      if (npcsToRemove.length > 0) {
        console.log(`[RosterFilter] Removed ${npcsToRemove.length} excluded NPCs from npcs array:`, npcsToRemove)
      }
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
      // 关键修复：传入 true 强制使用世界书数据覆盖本地备份
      await loadData(true)
      await loadCharacterPool()
      alert('名册数据已更新')
    } catch (e) {
      console.error('[RosterFilter] Error refreshing data:', e)
      alert('更新失败')
    } finally {
      loading.value = false
    }
  }
}

const restoreFromBackup = async () => {
  if (!confirm('确定要从备份世界书恢复所有角色数据吗？这将覆盖当前的修改。')) return
  
  loading.value = true
  try {
    const backupResult = await restoreFromBackupWorldbook()
    
    if (backupResult) {
      // 提取未分配角色
      const unassigned = backupResult._unassigned || []
      delete backupResult._unassigned
      
      fullRosterSnapshot.value = backupResult
      await saveRosterBackup(backupResult)
      
      // 恢复未分配角色到 characterPool (通过 IndexedDB)
      if (unassigned.length > 0) {
        console.log('[RosterFilter] Restoring unassigned characters:', unassigned.length)
        let savedPool = await getFullCharacterPool() || []
        
        unassigned.forEach(c => {
          const idx = savedPool.findIndex(s => s.name === c.name)
          if (idx !== -1) {
            savedPool[idx] = { ...savedPool[idx], ...c }
          } else {
            savedPool.push(c)
          }
        })
        await saveFullCharacterPool(deepClone(savedPool))
      }
      
      // 恢复班级数据
      for (const [classId, classInfo] of Object.entries(backupResult)) {
        gameStore.allClassData[classId] = JSON.parse(JSON.stringify(classInfo))
      }
      
      for (const classId of Object.keys(backupResult)) {
        await updateClassDataInWorldbook(classId, backupResult[classId])
      }
      
      await loadData()
      await loadCharacterPool()
      alert(`已从备份恢复所有角色数据 (包含 ${unassigned.length} 个未分配角色)`)
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

const createBackup = async () => {
  if (!confirm('确定要创建/更新备份世界书吗？这将保存当前的所有角色数据。')) return
  
  loading.value = true
  try {
    // 关键修复：备份前先同步最新修改
    syncCharacterPoolToSnapshot()
    
    // 收集未分配角色
    const assignedNames = new Set()
    for (const classInfo of Object.values(fullRosterSnapshot.value)) {
      if (classInfo.headTeacher?.name) assignedNames.add(classInfo.headTeacher.name)
      // 修复：使用 Array.isArray
      const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
      teachers.forEach(t => t.name && assignedNames.add(t.name))
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      students.forEach(s => s.name && assignedNames.add(s.name))
    }
    
    const unassignedCharacters = characterPool.value.filter(c => !assignedNames.has(c.name))
    console.log('[RosterFilter] Backing up unassigned characters:', unassignedCharacters.length)
    
    // 修复：传递时使用深拷贝避免 Proxy 问题
    await createDefaultRosterBackupWorldbook(deepClone(fullRosterSnapshot.value), deepClone(unassignedCharacters))
    alert('备份世界书已创建/更新')
  } catch (e) {
    console.error('[RosterFilter] Error creating backup:', e)
    alert('创建备份失败')
  } finally {
    loading.value = false
  }
}

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

// ==================== 角色卡片显示辅助函数 ====================
// 获取教师任职班级数量（用于卡片显示）
const getTeacherAssignmentCount = (char) => {
  if (char.role !== 'teacher') return 0
  
  // 优先从已保存的 assignments 读取
  if (Array.isArray(char.assignments) && char.assignments.length > 0) {
    return char.assignments.filter(a => a.classId).length
  }
  
  // 从快照中扫描
  let count = 0
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    if (classInfo.headTeacher?.name === char.name) {
      count++
      continue
    }
    const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
    if (teachers.some(t => t.name === char.name)) {
      count++
    }
  }
  return count
}

// 获取教师任职预览列表（用于卡片显示）
const getTeacherAssignmentsPreview = (char) => {
  if (char.role !== 'teacher') return []
  
  // 优先从已保存的 assignments 读取
  if (Array.isArray(char.assignments) && char.assignments.length > 0) {
    return char.assignments.filter(a => a.classId)
  }
  
  // 从快照中构建
  const assignments = []
  for (const [classId, classInfo] of Object.entries(fullRosterSnapshot.value)) {
    let isHeadTeacher = false
    let subject = ''
    
    if (classInfo.headTeacher?.name === char.name) {
      isHeadTeacher = true
    }
    
    const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
    const teacherEntry = teachers.find(t => t.name === char.name)
    if (teacherEntry) {
      subject = teacherEntry.subject || ''
    }
    
    if (isHeadTeacher || teacherEntry) {
      assignments.push({ classId, isHeadTeacher, subject })
    }
  }
  
  return assignments
}

// 监听标签页切换
watch(activeTab, async (newTab) => {
  if (newTab === 'composer') {
    await initComposer()
  } else if (newTab === 'characterEditor') {
    await loadCharacterPool()
  }
})
</script>

<template>
  <Teleport to="body">
    <div class="filter-panel-overlay" @click.self="$emit('close')">
      <div class="filter-panel">
        <div class="panel-header">
          <div class="header">
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
            :class="{ active: activeTab === 'characterEditor' }"
            @click="activeTab = 'characterEditor'"
          >
            ✏️ 角色编辑器
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
                <button class="toolbar-btn" @click="showFilters = !showFilters" title="筛选器">🔧</button>
                <button class="toolbar-btn" @click="expandAll" title="全部展开/收起">📂</button>
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
              <div class="filter-item">
                <label>性别：</label>
                <select v-model="genderFilter" class="filter-select">
                  <option value="">全部</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
              <button class="clear-filters-btn" @click="clubFilter = ''; electiveFilter = ''; genderFilter = ''">清除筛选</button>
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
                <div class="view-controls">
                  <button 
                    class="view-btn" 
                    :class="{ active: teacherViewMode === 'work' }"
                    @click="teacherViewMode = 'work'"
                  >按作品</button>
                  <button 
                    class="view-btn" 
                    :class="{ active: teacherViewMode === 'class' }"
                    @click="teacherViewMode = 'class'"
                  >按班级</button>
                </div>
                <div class="header-actions">
                   <button class="toolbar-btn small" @click="expandAllTeachers" title="全部展开/收起">📂</button>
                   <button class="add-btn-small" @click="addNewTeacher">+ 添加</button>
                </div>
              </div>
              
              <div class="teacher-groups">
                <div v-for="(teachers, groupName) in processedTeacherGroups" :key="groupName" class="teacher-group">
                  <div class="group-header" @click="toggleTeacherGroup(groupName)">
                    <span class="group-name">{{ groupName }} ({{ teachers.length }})</span>
                    <span class="expand-icon">{{ expandedTeacherGroups[groupName] ? '▲' : '▼' }}</span>
                  </div>
                  
                  <div v-if="expandedTeacherGroups[groupName]" class="teacher-grid">
                    <div 
                      v-for="teacher in teachers" 
                      :key="teacher.name"
                      class="teacher-card"
                      :class="{ 'multi-role': teacher.assignments && teacher.assignments.length > 1 }"
                      @click="startEditCharacter(teacher)"
                    >
                      <div class="teacher-info">
                        <span class="teacher-name">{{ teacher.name }}</span>
                        <span class="teacher-meta">{{ teacher.gender === 'female' ? '♀' : '♂' }}</span>
                        <!-- 按班级模式显示合并角色 -->
                        <span v-if="teacherViewMode === 'class'" class="teacher-role">{{ teacher.displayRole }}</span>
                        <!-- 按作品模式显示统计 -->
                        <span v-if="teacherViewMode === 'work'" class="teacher-role-tag" :class="{ 'is-head': teacher.isHeadTeacher }">
                          {{ teacher.isHeadTeacher ? '班主任' : '教师' }}
                        </span>
                      </div>
                      
                      <!-- 按作品模式显示详细任职 -->
                      <div v-if="teacherViewMode === 'work'" class="teacher-assignments">
                        <div v-for="(assign, idx) in teacher.assignments" :key="idx" class="assign-item">
                          {{ assign.className }} <span class="assign-role">{{ assign.role }}</span>
                        </div>
                      </div>
                      
                      <!-- 按班级模式不需要额外显示班级名，因为组名就是班级名 -->
                      
                      <!-- 只有在按班级模式下，才提供直接删除按钮（因为上下文明确） -->
                      <button v-if="teacherViewMode === 'class'" class="delete-btn-small" @click.stop="deleteTeacher(teacher)">×</button>
                    </div>
                  </div>
                </div>
                 <div v-if="Object.keys(processedTeacherGroups).length === 0" class="empty-hint">暂无教师数据</div>
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
                        <div v-if="student.clubs && student.clubs.length > 0" class="club-tags">
                          <span v-for="club in student.clubs" :key="club.id" class="club-tag" :title="club.role || '部员'">
                            {{ club.name }}
                          </span>
                        </div>
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
            
            <!-- 移动端视图切换提示/控制 -->
            <div class="mobile-view-controls">
              <button 
                class="mobile-tab-btn" 
                :class="{ active: composerMobileView === 'class' }"
                @click="composerMobileView = 'class'"
              >
                🏫 班级概览
              </button>
              <button 
                class="mobile-tab-btn" 
                :class="{ active: composerMobileView === 'pool' }"
                @click="composerMobileView = 'pool'"
              >
                👥 添加角色
              </button>
            </div>

            <div class="composer-layout">
              <!-- 当前班级成员 -->
              <div 
                class="composer-panel current-class"
                :class="{ 'mobile-hidden': composerMobileView !== 'class' }"
              >
                <div class="panel-header-row">
                  <h4>当前班级配置</h4>
                  <button class="add-member-btn-mobile" @click="composerMobileView = 'pool'">
                    + 添加成员
                  </button>
                </div>
                
                <!-- 教室设置 -->
                <div class="composer-section classroom-section">
                  <div class="section-title">🏫 教室</div>
                <div class="classroom-selector">
                    <select 
                      v-model="composerClassData.classroomId" 
                      class="classroom-select"
                    >
                      <option value="">自动（默认教室）</option>
                      <option v-for="loc in availableLocations" :key="loc.id" :value="loc.id">
                        {{ loc.name }} ({{ loc.id }})
                      </option>
                    </select>
                    <button 
                      class="create-classroom-btn" 
                      @click="openMapEditorForClassroom"
                      title="在地图编辑器中创建新教室"
                    >
                      🗺️ 新建
                    </button>
                    <span v-if="composerClassData.classroomId" class="classroom-id-hint">
                      ID: {{ composerClassData.classroomId }}
                    </span>
                  </div>
                </div>
                
                <!-- 班主任 -->
                <div class="composer-section">
                  <div class="section-title">👩‍🏫 班主任</div>
                  <div v-if="composerClassData.headTeacher?.name" class="composer-item head-teacher">
                    <span class="item-name">{{ composerClassData.headTeacher.name }}</span>
                    <span class="item-meta">{{ composerClassData.headTeacher.gender === 'female' ? '♀' : '♂' }} {{ composerClassData.headTeacher.origin }}</span>
                    <button class="remove-btn" @click="clearHeadTeacher">×</button>
                  </div>
                  <div v-else class="empty-slot">未设置班主任（从右侧教师中选择）</div>
                </div>
                
                <!-- 科任教师 -->
                <div class="composer-section">
                  <div class="section-title">📚 科任教师 ({{ composerClassData.teachers?.length || 0 }})</div>
                  <div class="composer-list compact">
                    <div 
                      v-for="(teacher, index) in composerClassData.teachers" 
                      :key="teacher.name"
                      class="composer-item teacher-item"
                    >
                      <span class="item-name">{{ teacher.name }}</span>
                      <input 
                        type="text" 
                        v-model="teacher.subject" 
                        placeholder="科目"
                        class="subject-input"
                        @click.stop
                      />
                      <button class="remove-btn" @click="removeTeacherFromClass(index)">×</button>
                    </div>
                  </div>
                </div>
                
                <!-- 学生 -->
                <div class="composer-section">
                  <div class="section-title">👨‍🎓 学生 ({{ composerClassData.students?.length || 0 }})</div>
                  <div class="composer-list">
                    <div 
                      v-for="(student, index) in composerClassData.students" 
                      :key="student.name"
                      class="composer-item"
                    >
                      <span class="item-name">{{ student.name }}</span>
                      <span class="item-meta">{{ student.gender === 'female' ? '♀' : '♂' }} {{ student.origin }}</span>
                      <span v-if="student.electivePreference && ELECTIVE_PREFERENCES[student.electivePreference]" class="pref-icon">
                        {{ ELECTIVE_PREFERENCES[student.electivePreference].icon }}
                      </span>
                      <button class="remove-btn" @click="removeStudentFromClass(index)">×</button>
                    </div>
                    <div v-if="!composerClassData.students?.length" class="empty-hint">
                      暂无学生，从右侧添加
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 可用角色池 -->
              <div 
                class="composer-panel available-pool"
                :class="{ 'mobile-hidden': composerMobileView !== 'pool' }"
              >
                <div class="panel-header-row">
                  <h4>可用角色池 ({{ filteredAvailableCharacters.length }}/{{ availableCharacters.length }})</h4>
                  <button class="back-to-class-btn" @click="composerMobileView = 'class'">
                    🔙 返回班级
                  </button>
                </div>
                <!-- 搜索和基本筛选 -->
                <div class="pool-toolbar">
                  <input 
                    type="text" 
                    v-model="composerSearchQuery" 
                    placeholder="搜索角色..."
                    class="pool-search-input"
                  />
                  <select v-model="composerRoleFilter" class="role-filter-select">
                    <option value="all">全部</option>
                    <option value="student">学生</option>
                    <option value="teacher">教师</option>
                  </select>
                </div>
                <!-- 高级筛选：按作品、未分配、分组视图 -->
                <div class="pool-filters">
                  <select v-model="composerWorkFilter" class="pool-work-filter">
                    <option value="">全部作品</option>
                    <option v-for="w in composerAvailableWorks" :key="w.name" :value="w.name">
                      {{ w.name }} ({{ w.count }})
                    </option>
                  </select>
                  <label class="pool-checkbox-label" title="仅显示未添加到任何班级的角色">
                    <input type="checkbox" v-model="composerShowUnassigned" />
                    <span>仅未分配</span>
                  </label>
                  <label class="pool-checkbox-label" title="按作品分组显示">
                    <input type="checkbox" v-model="composerGroupView" />
                    <span>分组</span>
                  </label>
                </div>
                
                <!-- 分组视图 -->
                <div v-if="composerGroupView" class="composer-list grouped-pool-list">
                  <div 
                    v-for="(chars, workName) in composerGroupedCharacters" 
                    :key="workName"
                    class="pool-work-group"
                  >
                    <div class="pool-work-header">
                      <span class="pool-work-name">{{ workName }}</span>
                      <span class="pool-work-count">{{ chars.length }}人</span>
                      <span v-if="getWorkAddedCount(workName) > 0" class="pool-work-added">已添加{{ getWorkAddedCount(workName) }}人</span>
                      <button 
                        class="pool-work-add-all-btn" 
                        @click.stop="addWorkToClass(workName)"
                        title="一键添加该作品所有角色到当前班级"
                      >
                        ✅ 全部添加
                      </button>
                    </div>
                    <div class="pool-work-chars">
                      <div 
                        v-for="char in chars" 
                        :key="char.name"
                        class="composer-item available"
                        :class="{ 'is-assigned': char.isAssigned, 'is-teacher': char.role === 'teacher' }"
                      >
                        <span class="item-role-badge">{{ char.role === 'teacher' ? '师' : '生' }}</span>
                        <span class="item-name">{{ char.name }}</span>
                        <span class="item-meta">{{ char.gender === 'female' ? '♀' : '♂' }}</span>
                        <span v-if="char.isAssigned" class="assigned-tag" :title="`已分配到 ${char.assignedTo}`">{{ char.assignedTo }}</span>
                        <div class="item-actions">
                          <button 
                            v-if="char.role === 'teacher'" 
                            class="action-icon" 
                            @click="setHeadTeacher(char)" 
                            title="设为班主任"
                          >👑</button>
                          <button class="action-icon add" @click="addCharacterToClass(char)" title="添加到班级">+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="Object.keys(composerGroupedCharacters).length === 0" class="empty-hint">
                    {{ availableCharacters.length === 0 ? '暂无可用角色，请在"角色编辑器"中添加' : '没有匹配的角色' }}
                  </div>
                </div>
                
                <!-- 平铺视图 -->
                <div v-else class="composer-list">
                  <div 
                    v-for="char in filteredAvailableCharacters" 
                    :key="char.name"
                    class="composer-item available"
                    :class="{ 'is-assigned': char.isAssigned, 'is-teacher': char.role === 'teacher' }"
                  >
                    <span class="item-role-badge">{{ char.role === 'teacher' ? '师' : '生' }}</span>
                    <span class="item-name">{{ char.name }}</span>
                    <span class="item-meta">{{ char.gender === 'female' ? '♀' : '♂' }} {{ char.origin }}</span>
                    <span v-if="char.isAssigned" class="assigned-tag" :title="`已分配到 ${char.assignedTo}`">{{ char.assignedTo }}</span>
                    <div class="item-actions">
                      <button 
                        v-if="char.role === 'teacher'" 
                        class="action-icon" 
                        @click="setHeadTeacher(char)" 
                        title="设为班主任"
                      >👑</button>
                      <button class="action-icon add" @click="addCharacterToClass(char)" title="添加到班级">+</button>
                    </div>
                  </div>
                  <div v-if="filteredAvailableCharacters.length === 0" class="empty-hint">
                    {{ availableCharacters.length === 0 ? '暂无可用角色，请在"角色编辑器"中添加' : '没有匹配的角色' }}
                  </div>
                </div>
              </div>
            </div>
            
          </div>
          
          <!-- ========== 角色编辑器面板 ========== -->
          <div v-if="activeTab === 'characterEditor'" class="tab-content">
            <div class="char-editor-toolbar">
              <input 
                type="text" 
                v-model="charEditorSearchQuery" 
                placeholder="搜索角色..." 
                class="search-input"
              />
              <select v-model="charEditorRoleFilter" class="role-filter-select">
                <option value="all">全部</option>
                <option value="student">学生</option>
                <option value="teacher">教师</option>
                <option value="pending">待入学(新生)</option>
              </select>
              <button class="add-btn" @click="addNewCharacter">+ 新增角色</button>
              <button class="add-btn ai-import-btn" @click="openAIImport">🤖 AI导入</button>
            </div>
            
            <div class="char-editor-stats">
              <span>总计 {{ charPoolStats.total }} 个角色</span>
              <span>学生 {{ charPoolStats.students }} 人</span>
              <span>教师 {{ charPoolStats.teachers }} 人</span>
            </div>
            
            <div class="char-editor-hint">
              💡 提示：在此编辑的角色会存入待选池，可在"班级组合器"中使用
            </div>
            
            <div v-if="characterPool.length === 0" class="empty-state">
              <span class="empty-icon">👤</span>
              <p>暂无角色数据</p>
              <p class="empty-hint-text">请点击"新增角色"创建角色，或切换到"筛选名册"加载世界书数据</p>
            </div>
            
            <div v-else class="char-editor-list">
              <div 
                v-for="char in filteredCharacterPool" 
                :key="char.name"
                class="char-card"
                :class="{ 'multi-class': char.role === 'teacher' && getTeacherAssignmentCount(char) > 1 }"
                @click="startEditCharacter(char)"
              >
                <div class="char-main">
                  <span class="char-name">{{ char.name }}</span>
                  <span class="char-gender">{{ char.gender === 'female' ? '♀' : '♂' }}</span>
                  <span class="char-role" :class="char.role">{{ char.role === 'teacher' ? '教师' : '学生' }}</span>
                  <span v-if="char.isHeadTeacher" class="head-teacher-badge">班主任</span>
                  <span v-if="char.role === 'teacher' && getTeacherAssignmentCount(char) > 1" class="multi-class-badge">
                    {{ getTeacherAssignmentCount(char) }}班
                  </span>
                </div>
                <div class="char-meta">
                  <span class="char-origin">{{ char.origin }}</span>
                  <!-- 学生显示单一班级 -->
                  <span v-if="char.role === 'student' && char.classId" class="char-class">{{ char.classId }}</span>
                  <!-- 教师显示汇总科目 -->
                  <span v-if="char.role === 'teacher' && char.subject" class="char-subject">{{ char.subject }}</span>
                </div>
                <!-- 教师多班级任职列表 -->
                <div v-if="char.role === 'teacher'" class="char-assignments-preview">
                  <div 
                    v-for="(assign, idx) in getTeacherAssignmentsPreview(char)" 
                    :key="idx"
                    class="assign-preview-item"
                  >
                    <span class="assign-class-name">{{ fullRosterSnapshot[assign.classId]?.name || assign.classId }}</span>
                    <span v-if="assign.isHeadTeacher" class="assign-head-icon">👑</span>
                    <span v-if="assign.subject" class="assign-subject-text">{{ assign.subject }}</span>
                  </div>
                </div>
                <div class="char-tags">
                  <span v-if="char.role === 'student' && char.electivePreference && ELECTIVE_PREFERENCES[char.electivePreference]" class="pref-tag">
                    {{ ELECTIVE_PREFERENCES[char.electivePreference].icon }} {{ ELECTIVE_PREFERENCES[char.electivePreference].name }}
                  </span>
                </div>
                <button class="delete-btn-small" @click.stop="deleteCharacter(char)">×</button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 班级组合器操作栏（固定在底部，不随内容滚动） -->
        <div v-if="activeTab === 'composer'" class="composer-actions">
          <button class="action-btn primary" @click="applyComposerChanges" :disabled="saving">
            {{ saving ? '保存中...' : '💾 应用更改' }}
          </button>
          <button class="action-btn secondary" @click="loadComposerClassData">🔄 重置</button>
        </div>
        
        <div class="panel-footer">
          <div class="left-actions">
            <button class="action-btn text-btn" @click="handleReset">🔄 重置全选</button>
            <button class="action-btn text-btn" @click="refreshData" :disabled="isLocked">📥 读取新名册</button>
            <button class="action-btn text-btn" @click="createBackup">💾 创建备份</button>
            <button class="action-btn text-btn" @click="restoreFromBackup" :disabled="isLocked">📤 从备份恢复</button>
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
            <h3>{{ editingCharacter ? '编辑角色' : '新增角色' }}</h3>
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
            
            <!-- 教师专属字段 -->
            <template v-if="characterEditForm.role === 'teacher'">
              <!-- 多班级任职编辑 -->
              <div class="assignments-section">
                <div class="assignments-header">
                  <label>任职班级</label>
                  <button type="button" class="add-assign-btn" @click="addAssignment">+ 添加</button>
                </div>
                <div v-if="characterEditForm.assignments.length === 0" class="empty-slot small">
                  未分配任何班级，点击上方按钮添加
                </div>
                <div v-else class="assignments-list">
                  <div 
                    v-for="(assign, idx) in characterEditForm.assignments" 
                    :key="idx"
                    class="assignment-item"
                  >
                    <select v-model="assign.classId" class="assign-class-select">
                      <option value="">选择班级</option>
                      <option v-for="(classInfo, classId) in fullRosterSnapshot" :key="classId" :value="classId">
                        {{ classInfo.name || classId }}
                      </option>
                    </select>
                    <input 
                      type="text" 
                      v-model="assign.subject" 
                      class="assign-subject-input"
                      placeholder="科目"
                    />
                    <label class="assign-head-label">
                      <input type="checkbox" v-model="assign.isHeadTeacher" />
                      班主任
                    </label>
                    <button type="button" class="remove-assign-btn" @click="removeAssignment(idx)">×</button>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- 学生专属字段 -->
            <template v-if="characterEditForm.role === 'student'">
              <div class="form-row">
                <label>选课倾向：</label>
                <select v-model="characterEditForm.electivePreference" class="input-field">
                  <option v-for="(pref, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
                    {{ pref.icon }} {{ pref.name }}
                  </option>
                </select>
              </div>
              <div class="form-row">
                <label>日程模板：</label>
                <select v-model="characterEditForm.scheduleTag" class="input-field">
                  <option value="">自动推断</option>
                  <option v-for="(tpl, key) in DEFAULT_TEMPLATES" :key="key" :value="key">
                    {{ tpl.name }}
                  </option>
                </select>
              </div>
            </template>
            
            <div class="form-row">
              <label>班级（可选）：</label>
              <select v-model="characterEditForm.classId" class="input-field">
                <option value="">无（待分配）</option>
                <option v-for="(classInfo, classId) in fullRosterSnapshot" :key="classId" :value="classId">
                  {{ classInfo.name || classId }}
                </option>
              </select>
            </div>
            
            <!-- 性格滑条 -->
            <div class="personality-section">
              <h4>性格倾向</h4>
              <div v-for="(axis, key) in PERSONALITY_AXES" :key="key" class="axis-row">
                <label>{{ axis.name }}：</label>
                <input type="range" :min="axis.min" :max="axis.max" v-model.number="characterEditForm.personality[key]" />
                <input type="number" :min="axis.min" :max="axis.max" v-model.number="characterEditForm.personality[key]" class="axis-input" />
              </div>
            </div>
            
            <div class="modal-actions">
              <button class="action-btn primary" @click="saveCharacterEdit">保存</button>
              <button class="action-btn secondary" @click="showCharacterEditor = false">取消</button>
            </div>
          </div>
        </div>
        
        <!-- 地图编辑器（创建教室） -->
        <MapEditorPanel
          v-if="showMapEditorForClassroom"
          :selection-mode="true"
          selection-title="创建教室"
          :initial-parent-id="'th_teaching_area'"
          :prefill-id="classIdToClassroomId(composerTargetClass)"
          :prefill-name="getClassDisplayName(composerTargetClass) + '教室'"
          @location-selected="onClassroomLocationSelected"
          @close="closeMapEditor"
        />

        <!-- 角色冲突解决弹窗 -->
        <div v-if="showConflictModal" class="modal-overlay" @click.self="showConflictModal = false">
          <div class="modal conflict-modal">
            <h3>⚠️ 角色冲突</h3>
            <p class="conflict-desc">以下角色已经被分配到其他班级，请选择处理方式：</p>
            
            <div class="conflict-batch-actions">
              <button class="batch-btn replace-all" @click="setAllConflictResolutions('replace')">全部替换</button>
              <button class="batch-btn skip-all" @click="setAllConflictResolutions('skip')">全部跳过</button>
            </div>
            
            <div class="conflict-list">
              <div 
                v-for="char in conflictCharacters" 
                :key="char.name"
                class="conflict-item"
                :class="{ 'will-replace': char.resolution === 'replace' }"
              >
                <div class="conflict-char-info">
                  <span class="conflict-char-name">{{ char.name }}</span>
                  <span class="conflict-char-role">{{ char.role === 'teacher' ? '教师' : '学生' }}</span>
                  <span class="conflict-char-from">当前在：<strong>{{ char.assignedTo }}</strong></span>
                </div>
                <div class="conflict-actions">
                  <label class="conflict-radio">
                    <input type="radio" :value="'replace'" v-model="char.resolution" />
                    <span class="radio-label replace-label">🔄 替换（移入新班）</span>
                  </label>
                  <label class="conflict-radio">
                    <input type="radio" :value="'skip'" v-model="char.resolution" />
                    <span class="radio-label skip-label">⏭️ 跳过</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div class="modal-actions">
              <button class="action-btn primary" @click="applyConflictResolutions">确认</button>
              <button class="action-btn secondary" @click="showConflictModal = false">取消</button>
            </div>
          </div>
        </div>

        <!-- 添加班级弹窗 -->
        <div v-if="showAddClassModal" class="modal-overlay" @click.self="showAddClassModal = false">
          <div class="modal">
            <h3>添加新班级</h3>
            <div class="form-row">
              <label>班级ID：</label>
              <input type="text" v-model="newClassForm.id" class="input-field" placeholder="如：3-A" />
            </div>
            <div class="form-row">
              <label>班级名称：</label>
              <input type="text" v-model="newClassForm.name" class="input-field" placeholder="如：3年A班" />
            </div>
            <div class="modal-actions">
              <button class="action-btn primary" @click="addClass">创建</button>
              <button class="action-btn secondary" @click="showAddClassModal = false">取消</button>
            </div>
          </div>
        </div>

        <!-- AI导入输入面板 -->
        <div v-if="showAIImportInput" class="modal-overlay" @click.self="closeAIImport">
          <div class="modal ai-import-modal">
            <div class="ai-import-header">
              <h3>🤖 AI角色导入</h3>
              <button class="close-btn small" @click="closeAIImport">×</button>
            </div>
            <p class="ai-import-desc">
              输入作品名和角色名（可选），AI将查询角色信息并导入到角色池。
              <br><span class="ai-import-tip">💡 只填作品名可列出该作品的所有已知角色</span>
            </p>
            
            <div class="ai-import-entries">
              <div 
                v-for="(entry, index) in aiImportEntries" 
                :key="index"
                class="ai-entry-row"
              >
                <input 
                  type="text" 
                  v-model="entry.work" 
                  placeholder="作品名（必填）" 
                  class="ai-entry-input work-input"
                />
                <input 
                  type="text" 
                  v-model="entry.character" 
                  placeholder="角色名（可选，留空列出全部）" 
                  class="ai-entry-input char-input"
                />
                <button 
                  class="ai-entry-remove" 
                  @click="removeAIImportEntry(index)"
                  :disabled="aiImportEntries.length <= 1"
                >×</button>
              </div>
            </div>
            
            <button class="ai-add-entry-btn" @click="addAIImportEntry">+ 添加更多</button>
            
            <div v-if="aiImportError" class="ai-import-error">
              ⚠️ {{ aiImportError }}
            </div>
            
            <div class="modal-actions">
              <button 
                class="action-btn primary" 
                @click="submitAIImport" 
                :disabled="aiImportLoading"
              >
                <span v-if="aiImportLoading" class="btn-spinner"></span>
                <span>{{ aiImportLoading ? '查询中...' : '🔍 开始查询' }}</span>
              </button>
              <button class="action-btn secondary" @click="closeAIImport" :disabled="aiImportLoading">取消</button>
            </div>
          </div>
        </div>

        <!-- AI导入结果面板 -->
        <div v-if="showAIImportResult" class="modal-overlay" @click.self="closeAIImport">
          <div class="modal ai-result-modal">
            <!-- 加载遮罩层 -->
            <div v-if="aiImportLoading" class="ai-loading-overlay">
              <div class="ai-loading-content">
                <div class="loading-spinner"></div>
                <span>正在查询角色详情，请稍候...</span>
              </div>
            </div>
            <div class="ai-import-header">
              <h3>🤖 AI查询结果</h3>
              <button class="close-btn small" @click="closeAIImport" :disabled="aiImportLoading">×</button>
            </div>
            
            <!-- 作品角色列表结果（仅查询作品时显示） -->
            <div v-if="aiImportResults.workResults.length > 0" class="ai-result-section">
              <h4 class="ai-result-title">📚 作品角色列表</h4>
              <div v-for="(work, wIdx) in aiImportResults.workResults" :key="wIdx" class="ai-work-result">
                <div v-if="work.found" class="ai-work-found">
                  <div class="ai-work-name">{{ work.work }} <span class="ai-work-count">({{ work.characters.length }}个角色)</span></div>
                  <div class="ai-work-chars">
                    <label 
                      v-for="(char, cIdx) in work.characters" 
                      :key="cIdx"
                      class="ai-char-checkbox"
                      :class="{ selected: char.selected }"
                    >
                      <input type="checkbox" v-model="char.selected" />
                      <span class="ai-char-name">{{ char.name }}</span>
                      <span class="ai-char-gender">{{ char.gender === 'female' ? '♀' : '♂' }}</span>
                    </label>
                  </div>
                </div>
                <div v-else class="ai-work-not-found">
                  <span class="ai-not-found-icon">❌</span>
                  <span>{{ work.work }}</span>
                  <span class="ai-not-found-reason">{{ work.reason }}</span>
                </div>
              </div>
              <div class="ai-result-actions">
                <button class="action-btn primary" @click="submitWorkCharactersForDetail" :disabled="aiImportLoading">
                  <span v-if="aiImportLoading" class="btn-spinner"></span>
                  <span>{{ aiImportLoading ? '查询中...' : '📋 查询选中角色详情' }}</span>
                </button>
              </div>
            </div>
            
            <!-- 角色详情结果 -->
            <div v-if="aiImportResults.found.length > 0" class="ai-result-section">
              <h4 class="ai-result-title">✅ 已识别角色 ({{ aiImportResults.found.filter(c => c.selected).length }}/{{ aiImportResults.found.length }})</h4>
              <div class="ai-found-list">
                <div 
                  v-for="(char, index) in aiImportResults.found" 
                  :key="char.name"
                  class="ai-found-card"
                  :class="{ selected: char.selected, deselected: !char.selected }"
                  @click="toggleAIResultChar(index)"
                >
                  <div class="ai-card-header">
                    <input type="checkbox" :checked="char.selected" @click.stop="toggleAIResultChar(index)" />
                    <span class="ai-card-name">{{ char.name }}</span>
                    <span class="ai-card-gender">{{ char.gender === 'female' ? '♀' : '♂' }}</span>
                    <span class="ai-card-work">{{ char.work }}</span>
                  </div>
                  <div class="ai-card-details">
                    <div class="ai-card-row">
                      <span class="ai-detail-label">选课倾向:</span>
                      <span v-if="ELECTIVE_PREFERENCES[char.electivePreference]">
                        {{ ELECTIVE_PREFERENCES[char.electivePreference].icon }} {{ ELECTIVE_PREFERENCES[char.electivePreference].name }}
                      </span>
                      <span v-else>通用</span>
                    </div>
                    <div class="ai-card-row">
                      <span class="ai-detail-label">性格:</span>
                      <span class="ai-personality-values">
                        秩序{{ char.personality.order }} 利他{{ char.personality.altruism }} 传统{{ char.personality.tradition }} 和平{{ char.personality.peace }}
                      </span>
                    </div>
                    <div v-if="char.relationships && char.relationships.length > 0" class="ai-card-row">
                      <span class="ai-detail-label">关系:</span>
                      <div class="ai-rel-tags">
                        <span v-for="(rel, rIdx) in char.relationships" :key="rIdx" class="ai-rel-tag">
                          {{ rel.target }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 未识别角色 -->
            <div v-if="aiImportResults.notFound.length > 0" class="ai-result-section">
              <h4 class="ai-result-title not-found">❌ 未识别角色 ({{ aiImportResults.notFound.length }})</h4>
              <div class="ai-not-found-list">
                <div 
                  v-for="(char, index) in aiImportResults.notFound" 
                  :key="index"
                  class="ai-not-found-item"
                >
                  <span class="ai-nf-name">{{ char.name }}</span>
                  <span class="ai-nf-work">{{ char.work }}</span>
                  <span class="ai-nf-reason">{{ char.reason }}</span>
                </div>
              </div>
            </div>
            
            <div v-if="aiImportError" class="ai-import-error">
              ⚠️ {{ aiImportError }}
            </div>
            
            <!-- 底部操作 -->
            <div v-if="aiImportResults.found.length > 0" class="modal-actions">
              <button class="action-btn primary" @click="confirmAIImport">
                ✅ 导入选中角色 ({{ aiImportResults.found.filter(c => c.selected).length }})
              </button>
              <button class="action-btn secondary" @click="showAIImportResult = false; showAIImportInput = true">
                🔙 重新查询
              </button>
              <button class="action-btn secondary" @click="closeAIImport">关闭</button>
            </div>
            <div v-else class="modal-actions">
              <button class="action-btn secondary" @click="showAIImportResult = false; showAIImportInput = true">
                🔙 重新查询
              </button>
              <button class="action-btn secondary" @click="closeAIImport">关闭</button>
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

.header-icon { font-size: 1.5rem; }

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

.tab-btn:hover { background: #f0f0f0; }

.tab-btn.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  background: white;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.tab-content { padding: 20px; }

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

.toolbar-btn.small {
  padding: 6px 10px;
  font-size: 0.95rem;
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

.stat-icon { font-size: 1.2rem; }
.stat-label { color: #666; font-size: 0.9rem; }
.stat-value { font-weight: 600; color: #333; font-size: 1.1rem; }
.stat-value.highlight { color: var(--primary-color); }

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
.section { margin-bottom: 24px; }

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

.section-icon { font-size: 1.2rem; }

.section h4 {
  margin: 0;
  color: var(--primary-color);
  font-size: 1.1rem;
  font-family: 'Ma Shan Zheng', cursive;
  flex: 1;
}

.view-controls {
  display: flex;
  background: #e0e0e0;
  border-radius: 6px;
  padding: 2px;
  margin-right: 10px;
}

.view-btn {
  border: none;
  background: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.view-btn.active {
  background: white;
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
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

/* 教师分组 */
.teacher-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.teacher-group {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  padding: 10px 14px;
  background: #f9f9f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  color: #555;
  transition: background 0.2s;
}

.group-header:hover { background: #f0f0f0; }

/* 教师网格 */
.teacher-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  padding: 10px;
  background: white;
}

.teacher-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.teacher-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.teacher-card.multi-role { border-left: 3px solid var(--warning-color); }

.teacher-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.teacher-name { font-weight: 600; color: #333; }
.teacher-meta { color: #888; font-size: 0.85rem; }

.teacher-role {
  font-size: 0.75rem;
  color: #555;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
}

.teacher-role-tag {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  background: #e3f2fd;
  color: #1976d2;
}

.teacher-role-tag.is-head {
  background: #fff8e1;
  color: #f57c00;
  border: 1px solid #ffe0b2;
}

.teacher-assignments {
  font-size: 0.8rem;
  color: #666;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.assign-item {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dashed #eee;
  padding-bottom: 2px;
}

.assign-role { color: #999; }

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

.work-name { font-weight: 600; font-size: 1rem; color: #333; }

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

.expand-icon { font-size: 0.8rem; color: #888; }

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

.student-name { font-weight: 600; color: #333; font-size: 0.95rem; }

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

.elective-tag { font-size: 0.9rem; margin-top: 4px; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 20px;
  color: #888;
}

.empty-icon { font-size: 3rem; margin-bottom: 12px; opacity: 0.5; }
.empty-hint-text { font-size: 0.85rem; color: #aaa; margin-top: 8px; }

.clear-btn {
  margin-top: 16px;
  padding: 10px 20px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 20px;
  cursor: pointer;
}

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

.preset-selector, .class-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select, .class-select {
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
}

.preset-desc { color: #888; font-size: 0.85rem; }

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
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.composer-panel h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 1rem;
}

.composer-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.composer-section:last-child { border-bottom: none; margin-bottom: 0; }

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
}

.composer-list {
  flex: 1;
  min-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.composer-list.compact { 
  flex: 0 0 auto;
  max-height: 120px; 
}

.composer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f9f9f9;
  border-radius: 8px;
  transition: all var(--transition-fast);
}

.composer-item.head-teacher {
  background: #fff3e0;
  border: 1px solid #ffe0b2;
}

.composer-item.teacher-item { background: #e3f2fd; }

.composer-item.available { cursor: pointer; }

.composer-item.available:hover { background: #e8f5e9; }

.composer-item.is-assigned {
  opacity: 0.7;
  background: #f5f5f5;
}

.composer-item.is-assigned:hover { background: #fff3e0; }

.composer-item.is-teacher { background: #e8eaf6; }

.item-role-badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e0e0e0;
  color: #666;
  font-weight: 600;
}

.item-name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-meta { color: #888; font-size: 0.85rem; white-space: nowrap; }

.pref-icon { font-size: 0.9rem; }

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
  padding: 0 4px;
}

.item-actions {
  display: flex;
  gap: 4px;
}

.action-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.action-icon:hover { background: rgba(0,0,0,0.1); }
.action-icon.add { color: var(--success-color); font-weight: bold; }

.subject-input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.85rem;
}

.pool-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.pool-search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.role-filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
}

/* 角色池高级筛选 */
.pool-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.pool-work-filter {
  flex: 1;
  min-width: 120px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
}

.pool-checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.pool-checkbox-label:hover {
  background: #f0f0f0;
}

.pool-checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--primary-color);
}

/* 分组视图 */
.grouped-pool-list {
  gap: 12px !important;
}

.pool-work-group {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
  background: #fafafa;
}

.pool-work-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
  border-bottom: 1px solid #e0e0e0;
  flex-wrap: wrap;
}

.pool-work-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #333;
}

.pool-work-count {
  font-size: 0.8rem;
  color: #888;
  background: #e0e0e0;
  padding: 1px 8px;
  border-radius: 10px;
}

.pool-work-added {
  font-size: 0.75rem;
  color: var(--success-color);
  background: #e8f5e9;
  padding: 1px 8px;
  border-radius: 10px;
}

.pool-work-add-all-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: linear-gradient(135deg, var(--success-color) 0%, #45a049 100%);
  color: white;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.pool-work-add-all-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(76, 175, 80, 0.4);
}

.pool-work-chars {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 冲突解决弹窗 */
.conflict-modal {
  width: 500px;
}

.conflict-desc {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.conflict-batch-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.batch-btn {
  flex: 1;
  padding: 8px 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  background: white;
}

.batch-btn.replace-all {
  color: #e65100;
  border-color: #ffcc80;
}

.batch-btn.replace-all:hover {
  background: #fff3e0;
  border-color: #ff9800;
}

.batch-btn.skip-all {
  color: #1565c0;
  border-color: #90caf9;
}

.batch-btn.skip-all:hover {
  background: #e3f2fd;
  border-color: #42a5f5;
}

.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 350px;
  overflow-y: auto;
  padding-right: 4px;
}

.conflict-item {
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  background: #fafafa;
  transition: all 0.2s ease;
}

.conflict-item.will-replace {
  border-color: #ff9800;
  background: #fff8e1;
}

.conflict-char-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.conflict-char-name {
  font-weight: 600;
  font-size: 1rem;
  color: #333;
}

.conflict-char-role {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 10px;
  background: #e0e0e0;
  color: #666;
}

.conflict-char-from {
  font-size: 0.85rem;
  color: #888;
}

.conflict-char-from strong {
  color: #e65100;
}

.conflict-actions {
  display: flex;
  gap: 16px;
}

.conflict-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.conflict-radio:hover {
  background: rgba(0, 0, 0, 0.05);
}

.conflict-radio input[type="radio"] {
  accent-color: var(--primary-color);
}

.radio-label {
  font-size: 0.85rem;
  color: #555;
}

.replace-label { color: #e65100; }
.skip-label { color: #1565c0; }

.empty-hint, .empty-slot {
  color: #888;
  text-align: center;
  padding: 16px;
  font-size: 0.9rem;
}

.empty-slot {
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px dashed #ddd;
}

/* 教室选择器 */
.classroom-section {
  padding-bottom: 8px !important;
  margin-bottom: 10px !important;
}

.classroom-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.classroom-select {
  flex: 1;
  min-width: 180px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
}

.classroom-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.classroom-id-hint {
  font-size: 0.75rem;
  color: #888;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.create-classroom-btn {
  padding: 5px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

.create-classroom-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.4);
}

.composer-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  background: white;
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.08);
  flex-shrink: 0;
}

/* 角色编辑器 */
.char-editor-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.char-editor-toolbar .search-input {
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
}

.add-btn {
  padding: 10px 20px;
  background: var(--success-color);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  white-space: nowrap;
}

.char-editor-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
  color: #666;
  font-size: 0.9rem;
}

.char-editor-hint {
  background: #e3f2fd;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  color: #1565c0;
}

.char-editor-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
  flex-wrap: wrap;
}

.char-name { font-weight: 600; font-size: 1rem; }
.char-gender { color: #888; }

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

.head-teacher-badge {
  font-size: 0.7rem;
  background: #ffc107;
  color: #333;
  padding: 2px 6px;
  border-radius: 4px;
}

.char-meta {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.char-subject { color: #1976d2; }

/* 多班级徽章 */
.multi-class-badge {
  font-size: 0.7rem;
  background: #7b1fa2;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
}

.char-card.multi-class {
  border-left: 3px solid #7b1fa2;
}

/* 教师任职预览 */
.char-assignments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}

.assign-preview-item {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.assign-class-name {
  color: #555;
  font-weight: 500;
}

.assign-head-icon {
  font-size: 0.7rem;
}

.assign-subject-text {
  color: #888;
  margin-left: 2px;
}

.assign-subject-text::before {
  content: '·';
  margin-right: 2px;
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

.text-btn:hover { background: rgba(25, 118, 210, 0.1); }

.text-btn:disabled {
  color: #999;
  cursor: not-allowed;
  opacity: 0.6;
}

.text-btn:disabled:hover {
  background: none;
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

.modal.large-modal { width: 550px; }

.modal h3 {
  margin: 0 0 20px 0;
  color: #333;
  font-family: 'Ma Shan Zheng', cursive;
}

/* 任职编辑区块 */
.assignments-section {
  margin: 16px 0;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.assignments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.assignments-header label {
  font-weight: 600;
  color: #333;
  margin-bottom: 0;
}

.add-assign-btn {
  padding: 4px 12px;
  background: var(--success-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
}

.add-assign-btn:hover {
  background: #45a049;
}

.empty-slot.small {
  padding: 10px;
  font-size: 0.85rem;
}

.assignments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assignment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.assign-class-select {
  flex: 1;
  min-width: 100px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.assign-subject-input {
  width: 80px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.assign-head-label {
  display: flex !important;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: #666;
  white-space: nowrap;
  margin-bottom: 0 !important;
}

.assign-head-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
}

.remove-assign-btn {
  padding: 4px 8px;
  background: none;
  border: 1px solid #ff5252;
  border-radius: 4px;
  color: #ff5252;
  cursor: pointer;
  font-size: 1rem;
  transition: all var(--transition-fast);
}

.remove-assign-btn:hover {
  background: #ff5252;
  color: white;
}

.form-row { margin-bottom: 16px; }

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

.axis-row input[type="range"] { flex: 1; }

.axis-value {
  width: 30px;
  text-align: right;
  font-weight: 600;
  font-size: 0.85rem;
}

.axis-input {
  width: 60px;
  text-align: right;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 2px 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-left: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* 滚动条 */
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

/* 响应式 */
@media (max-width: 768px) {
  .filter-panel {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .tab-btn { font-size: 0.9rem; padding: 10px 8px; }
  
  .toolbar { flex-direction: column; align-items: stretch; }
  .search-wrapper { max-width: none; }
  
  .composer-layout { display: block; }
  
  /* 关键修复：移动端 composer-panel 不设固定高度，让内容自然撑开，由 panel-body 的 overflow 控制滚动 */
  .composer-panel { 
    display: flex; 
    flex-direction: column; 
    height: auto;
    min-height: 300px;
  }
  
  .composer-list { 
    flex: none;
    max-height: none; 
    overflow-y: visible;
    min-height: auto;
  }
  
  .composer-list.compact { max-height: none; flex: 0 0 auto; }
  
  /* 确保分组列表中的角色项有正确的高度 */
  .composer-item {
    min-height: 36px;
    flex-wrap: wrap;
  }
  
  /* 确保分组容器内容不被压缩 */
  .pool-work-chars {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
  }
  
  .pool-work-group {
    flex-shrink: 0;
  }
  
  .mobile-hidden { display: none !important; }
  
  .mobile-view-controls {
    display: flex;
    margin-bottom: 12px;
    background: #e0e0e0;
    border-radius: 8px;
    padding: 4px;
  }
  
  .mobile-tab-btn {
    flex: 1;
    border: none;
    background: none;
    padding: 8px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #666;
  }
  
  .mobile-tab-btn.active {
    background: white;
    color: var(--primary-color);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .panel-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .add-member-btn-mobile, .back-to-class-btn {
    display: inline-block;
    padding: 4px 12px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 0.8rem;
  }
  
  .back-to-class-btn { background: #666; }

  .student-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  
  .panel-footer { padding: 12px 16px; }
  .left-actions { width: 100%; margin-bottom: 8px; }
  .right-actions { width: 100%; justify-content: space-between; }

  .composer-actions .action-btn {
    flex: 1;
    justify-content: center;
    margin: 0;
  }
}

/* 极度窄屏下适配 */
@media (max-width: 480px) {
  /* 角色池列表项适配窄屏 - 使用换行布局确保内容可见 */
  .composer-item {
    padding: 8px 10px;
    gap: 6px;
    font-size: 0.9rem;
    flex-wrap: wrap;
    min-height: 36px;
  }
  
  .item-role-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    flex-shrink: 0;
  }
  
  .item-name {
    font-size: 0.9rem;
    min-width: 60px;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .item-meta {
    font-size: 0.8rem;
    flex-shrink: 0;
  }
  
  /* 隐藏分配标签节省空间 */
  .assigned-tag {
    display: none;
  }
  
  .item-actions {
    gap: 2px;
    flex-shrink: 0;
    margin-left: auto;
  }
  
  .action-icon {
    font-size: 1rem;
    padding: 4px 6px;
    min-width: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* 冲突弹窗适配窄屏 */
  .conflict-modal {
    width: 95% !important;
    max-width: none !important;
  }
  
  .conflict-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .conflict-batch-actions {
    flex-direction: column;
    gap: 6px;
  }
  
  /* 角色池搜索栏和筛选器适配窄屏 */
  .pool-toolbar {
    flex-direction: column;
    gap: 6px;
  }
  
  .pool-search-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.9rem;
  }
  
  .role-filter-select {
    width: 100%;
    padding: 8px 12px;
    font-size: 0.9rem;
  }
  
  .pool-filters {
    gap: 6px;
    flex-wrap: wrap;
  }
  
  .pool-work-filter {
    min-width: 0;
    flex: 1 1 100%;
    font-size: 0.85rem;
    padding: 6px 10px;
  }
  
  .pool-checkbox-label {
    font-size: 0.85rem;
    padding: 4px 8px;
  }
  
  /* 分组列表作品头部适配 */
  .pool-work-header {
    padding: 8px 10px;
    gap: 6px;
  }
  
  .pool-work-name {
    font-size: 0.85rem;
    font-weight: 600;
  }
  
  .pool-work-count {
    font-size: 0.75rem;
    padding: 2px 8px;
  }
  
  .pool-work-added {
    font-size: 0.7rem;
    padding: 2px 8px;
  }
  
  .pool-work-add-all-btn {
    font-size: 0.75rem;
    padding: 4px 10px;
  }
  
  .pool-work-chars {
    padding: 6px;
    gap: 4px;
  }
  
  /* 班级组合器当前班级面板适配 */
  .composer-section .section-title {
    font-size: 0.85rem;
  }
  
  .subject-input {
    width: 50px;
    font-size: 0.85rem;
    padding: 4px 6px;
  }
  
  /* 班级组合器头部适配 */
  .composer-header {
    gap: 10px;
    flex-direction: column;
  }
  
  .preset-selector, .class-selector {
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .preset-select, .class-select {
    font-size: 0.9rem;
    padding: 8px 10px;
    flex: 1;
    min-width: 0;
  }
  
  .preset-desc {
    font-size: 0.8rem;
    width: 100%;
  }
  
  /* 角色编辑器卡片适配 */
  .char-editor-list {
    grid-template-columns: 1fr;
  }
  
  /* 教师网格适配 */
  .teacher-grid {
    grid-template-columns: 1fr;
  }
  
  /* 任职编辑区域适配 */
  .assignment-item {
    flex-wrap: wrap;
  }
  
  .assign-class-select {
    flex: 1 1 100%;
    min-width: auto;
  }
  
  .assign-subject-input {
    flex: 1;
  }
  
  /* tab 内容 padding 缩小 */
  .tab-content {
    padding: 12px 10px;
  }
}

/* ==================== AI导入样式 ==================== */
.ai-import-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.ai-import-btn:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
  transform: translateY(-1px);
}

.ai-import-modal {
  width: 550px;
}

.ai-result-modal {
  width: 650px;
  position: relative;
}

/* AI加载遮罩层 */
.ai-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
  border-radius: 12px;
  backdrop-filter: blur(2px);
}

.ai-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #555;
  font-size: 0.95rem;
}

.ai-loading-content .loading-spinner {
  width: 48px;
  height: 48px;
  border-width: 5px;
  border-top-color: #667eea;
}

.ai-import-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.ai-import-header h3 {
  margin: 0 !important;
}

.close-btn.small {
  width: 32px;
  height: 32px;
  font-size: 20px;
  background: #f0f0f0;
}

.ai-import-desc {
  color: #666;
  font-size: 0.9rem;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.ai-import-tip {
  color: #1976d2;
  font-size: 0.85rem;
}

.ai-import-entries {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.ai-entry-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-entry-input {
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: border-color 0.2s;
}

.ai-entry-input:focus {
  outline: none;
  border-color: #667eea;
}

.ai-entry-input.work-input {
  flex: 2;
  min-width: 120px;
}

.ai-entry-input.char-input {
  flex: 3;
  min-width: 150px;
}

.ai-entry-remove {
  background: none;
  border: 1px solid #ff5252;
  color: #ff5252;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.ai-entry-remove:hover:not(:disabled) {
  background: #ff5252;
  color: white;
}

.ai-entry-remove:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ai-add-entry-btn {
  background: none;
  border: 2px dashed #ccc;
  color: #888;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  width: 100%;
  transition: all 0.2s;
  margin-bottom: 12px;
}

.ai-add-entry-btn:hover {
  border-color: #667eea;
  color: #667eea;
  background: #f5f3ff;
}

.ai-import-error {
  background: #ffebee;
  color: #c62828;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 12px;
  border-left: 4px solid #ef5350;
}

/* AI结果面板 */
.ai-result-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}

.ai-result-section:last-of-type {
  border-bottom: none;
}

.ai-result-title {
  font-size: 1rem;
  color: #333;
  margin: 0 0 12px 0;
  font-family: 'Ma Shan Zheng', cursive;
}

.ai-result-title.not-found {
  color: #c62828;
}

/* 作品角色列表 */
.ai-work-result {
  margin-bottom: 12px;
}

.ai-work-found {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.ai-work-name {
  padding: 8px 12px;
  background: linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%);
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

.ai-work-count {
  font-weight: 400;
  color: #666;
  font-size: 0.85rem;
}

.ai-work-chars {
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-char-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.ai-char-checkbox:hover {
  border-color: #667eea;
  background: #f5f3ff;
}

.ai-char-checkbox.selected {
  background: #e8f5e9;
  border-color: #4caf50;
}

.ai-char-checkbox input[type="checkbox"] {
  accent-color: #4caf50;
}

.ai-char-name {
  font-weight: 500;
}

.ai-char-gender {
  color: #888;
  font-size: 0.85rem;
}

.ai-work-not-found {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #ffebee;
  border-radius: 8px;
  color: #c62828;
  font-size: 0.9rem;
}

.ai-not-found-icon {
  font-size: 1.1rem;
}

.ai-not-found-reason {
  color: #999;
  font-size: 0.8rem;
  margin-left: auto;
}

.ai-result-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}

/* 角色详情卡片 */
.ai-found-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.ai-found-card {
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-found-card.selected {
  border-color: #4caf50;
  background: #f1f8e9;
}

.ai-found-card.deselected {
  opacity: 0.5;
  background: #fafafa;
}

.ai-found-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ai-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ai-card-header input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #4caf50;
}

.ai-card-name {
  font-weight: 600;
  font-size: 1rem;
  color: #333;
}

.ai-card-gender {
  color: #888;
}

.ai-card-work {
  margin-left: auto;
  font-size: 0.8rem;
  color: #888;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
}

.ai-card-details {
  padding-left: 26px;
}

.ai-card-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 0.85rem;
}

.ai-detail-label {
  color: #888;
  white-space: nowrap;
  min-width: 65px;
}

.ai-personality-values {
  color: #555;
  font-size: 0.8rem;
}

.ai-rel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ai-rel-tag {
  background: #e3f2fd;
  color: #1565c0;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
}

/* 未识别角色列表 */
.ai-not-found-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-not-found-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #ffebee;
  border-radius: 8px;
  border-left: 3px solid #ef5350;
}

.ai-nf-name {
  font-weight: 600;
  color: #c62828;
}

.ai-nf-work {
  color: #888;
  font-size: 0.85rem;
}

.ai-nf-reason {
  margin-left: auto;
  color: #999;
  font-size: 0.8rem;
}

/* AI导入移动端适配 */
@media (max-width: 480px) {
  .ai-import-modal,
  .ai-result-modal {
    width: 95% !important;
    max-width: none !important;
    padding: 16px !important;
  }
  
  .ai-entry-row {
    flex-wrap: wrap;
  }
  
  .ai-entry-input.work-input,
  .ai-entry-input.char-input {
    flex: 1 1 100%;
    min-width: auto;
  }
  
  .ai-card-details {
    padding-left: 0;
  }
  
  .ai-card-row {
    flex-direction: column;
    gap: 2px;
  }
  
  .ai-nf-reason {
    margin-left: 0;
  }
  
  .ai-not-found-item {
    flex-wrap: wrap;
  }
}

/* 桌面端隐藏移动端控件 */
@media (min-width: 769px) {
  .mobile-view-controls, 
  .add-member-btn-mobile, 
  .back-to-class-btn { 
    display: none; 
  }
}
</style>
