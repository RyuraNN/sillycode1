<!-- -*- coding: utf-8 -*- -->
<script setup>
import { ref, computed, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { updateClassDataInWorldbook } from '../utils/worldbookParser'
import { ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { DEFAULT_TEMPLATES } from '../utils/npcScheduleSystem'
import { BASE_RANGES, POTENTIAL_MAP, SUBJECT_TRAITS, SUBJECT_DISPLAY_NAMES } from '../data/academicData'
import {
  RELATIONSHIP_GROUPS,
  RELATIONSHIP_AXES,
  PERSONALITY_AXES,
  PRIORITY_TYPES,
  getRelationshipDescription,
  DEFAULT_PERSONALITIES
} from '../data/relationshipData'
import {
  getAllCharacterNames,
  getCharacterData,
  getRelationship,
  setRelationship,
  removeCharacter,
  removeRelationship,
  updatePersonality,
  updateGoals,
  updatePriorities,
  getCharacterRelationsList,
  flushPendingSocialData
} from '../utils/relationshipManager'

const gameStore = useGameStore()
const isSaving = ref(false)

const props = defineProps({
  classId: {
    type: String,
    required: true
  },
  modelValue: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'close'])

// 默认班级数据结构
const defaultClassData = {
  name: '自定义班级',
  headTeacher: { name: '', gender: 'female', origin: '', role: 'teacher' },
  teachers: [],
  students: []
}

// 当前班级数据 (合并预设和自定义修改)
const currentClass = computed(() => {
  // 如果 modelValue 中有数据，优先使用（表示已修改）
  if (props.modelValue && Object.keys(props.modelValue).length > 0) {
    // 确保所有必需字段都存在
    return {
      ...defaultClassData,
      ...props.modelValue,
      teachers: props.modelValue.teachers || [],
      students: props.modelValue.students || [],
      headTeacher: props.modelValue.headTeacher || defaultClassData.headTeacher
    }
  }
  // 否则使用预设数据
  const classData = gameStore.world.allClassData[props.classId]
  if (classData) {
    return {
      ...defaultClassData,
      ...classData,
      teachers: classData.teachers || [],
      students: classData.students || [],
      headTeacher: classData.headTeacher || defaultClassData.headTeacher
    }
  }
  return defaultClassData
})

// ==================== 基础编辑状态 ====================
const showEditor = ref(false)
const editingRole = ref(null) // 'student' | 'teacher' | 'headTeacher'
const editingIndex = ref(-1) // 数组索引
const editForm = ref({
  name: '',
  gender: 'female',
  origin: '',
  subject: '', // 仅老师
  electivePreference: 'general', // 仅学生
  scheduleTag: '', // 日程模板
  personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
  academicProfile: { level: 'avg', potential: 'medium', traits: [] }
})

// 学力选项
const ACADEMIC_LEVEL_OPTIONS = {
  top: '🏆 尖子生', above_avg: '📈 中上', avg: '📊 普通', below_avg: '📉 中下', poor: '😓 学渣'
}
const ACADEMIC_POTENTIAL_OPTIONS = {
  very_high: '🚀 极高', high: '⬆️ 高', medium: '➡️ 普通', low: '⬇️ 低'
}
const ACADEMIC_TRAIT_OPTIONS = Object.entries(SUBJECT_TRAITS).map(([key, val]) => ({
  key,
  label: `${val.bonus > 0 ? '✅' : '❌'} ${SUBJECT_DISPLAY_NAMES[val.subject] || val.subject} ${val.bonus > 0 ? '强' : '弱'}`,
  bonus: val.bonus
}))
const toggleAcademicTrait = (traitKey) => {
  const traits = editForm.value.academicProfile.traits
  const idx = traits.indexOf(traitKey)
  if (idx > -1) traits.splice(idx, 1)
  else traits.push(traitKey)
}

// ==================== 关系编辑状态 ====================
const showRelationEditor = ref(false)
const editingCharName = ref('')
const allCharacters = ref([])
const selectedTargetChar = ref('')
const relationForm = ref({
  intimacy: 0,
  trust: 0,
  passion: 0,
  hostility: 0,
  groups: [],
  tags: []
})
const newTag = ref('')
const characterRelations = ref([])

// ==================== 性格/目标编辑状态 ====================
const showPersonalityEditor = ref(false)
const personalityForm = ref({
  order: 0,
  altruism: 0,
  tradition: 0,
  peace: 50
})
const goalsForm = ref({
  immediate: '',
  shortTerm: '',
  longTerm: ''
})
const prioritiesForm = ref({
  academics: 50,
  social: 50,
  hobbies: 50,
  survival: 50,
  club: 50
})

// 初始化编辑表单
const startEdit = (role, index, data) => {
  editingRole.value = role
  editingIndex.value = index
  
  // 复制基础数据
  const formData = { ...data }
  
  // 获取性格数据
  // 1. 优先使用 data 中保存的 personality (如果是以前编辑过的)
  // 2. 其次尝试从 relationshipManager 获取 (如果是现有角色)
  // 3. 最后使用默认值
  let personality = { order: 0, altruism: 0, tradition: 0, peace: 50 }
  
  if (data.personality) {
    personality = { ...data.personality }
  } else if (data.name) {
    // 尝试从全局数据获取默认性格
    const charData = getCharacterData(data.name)
    if (charData && charData.personality) {
      personality = { ...charData.personality }
    } else if (DEFAULT_PERSONALITIES && DEFAULT_PERSONALITIES[data.name]) {
      personality = { ...DEFAULT_PERSONALITIES[data.name] }
    }
  }
  
  formData.personality = personality
  
  // 获取学力档案
  formData.academicProfile = data.academicProfile 
    ? { ...data.academicProfile, traits: [...(data.academicProfile.traits || [])] }
    : { level: 'avg', potential: 'medium', traits: [] }
  
  editForm.value = formData
  showEditor.value = true
}

// 添加学生
const addStudent = () => {
  startEdit('student', -1, {
    name: '',
    gender: 'female',
    origin: '',
    role: 'student',
    classId: props.classId,
    personality: { order: 0, altruism: 0, tradition: 0, peace: 50 },
    academicProfile: { level: 'avg', potential: 'medium', traits: [] }
  })
}

// 保存修改
const saveEdit = () => {
  const newClassData = JSON.parse(JSON.stringify(currentClass.value))
  
  // 保存性格数据
  // 注意：这里我们将 personality 直接保存在角色数据对象中
  // initializeRelationships 稍后会读取这个数据
  const formData = { ...editForm.value }
  
  // 如果是现有角色，也更新全局关系管理器中的数据（以便即时反映）
  if (formData.name) {
    updatePersonality(formData.name, formData.personality)
  }

  if (editingRole.value === 'headTeacher') {
    newClassData.headTeacher = { ...newClassData.headTeacher, ...formData }
  } else if (editingRole.value === 'teacher') {
    if (editingIndex.value === -1) {
      // 检查教师重名
      const dupTeacher = newClassData.teachers.find((t, i) => t.name === formData.name)
      if (dupTeacher) {
        alert(`教师"${formData.name}"已存在，请勿重复添加`)
        return
      }
      newClassData.teachers.push({ ...formData, role: 'teacher', classId: props.classId })
    } else {
      newClassData.teachers[editingIndex.value] = { ...newClassData.teachers[editingIndex.value], ...formData }
    }
  } else if (editingRole.value === 'student') {
    if (editingIndex.value === -1) {
      // 检查学生重名
      const dupStudent = newClassData.students.find((s, i) => s.name === formData.name)
      if (dupStudent) {
        alert(`学生"${formData.name}"已存在，请勿重复添加`)
        return
      }
      newClassData.students.push({ ...formData, role: 'student', classId: props.classId })
    } else {
      newClassData.students[editingIndex.value] = { ...newClassData.students[editingIndex.value], ...formData }
    }
  }

  emit('update:modelValue', newClassData)
  showEditor.value = false
}

// 删除学生（包括清理关系）
const deleteStudent = (index) => {
  const studentName = currentClass.value.students[index]?.name
  if (studentName) {
    // 使用关系管理器清理该角色的所有关系
    removeCharacter(studentName)
  }
  
  const newClassData = JSON.parse(JSON.stringify(currentClass.value))
  newClassData.students.splice(index, 1)
  emit('update:modelValue', newClassData)
}

// ==================== 关系编辑功能 ====================

// 打开关系编辑器
const openRelationEditor = (charName) => {
  editingCharName.value = charName
  
  // 获取所有角色列表（排除自己）
  allCharacters.value = getAllCharacterNames(gameStore).filter(n => n !== charName)
  
  // 获取该角色已有的关系
  characterRelations.value = getCharacterRelationsList(charName)
  
  // 重置表单
  selectedTargetChar.value = ''
  resetRelationForm()
  
  // 加载角色的性格/目标数据
  loadCharacterPersonality(charName)
  
  showRelationEditor.value = true
}

// 重置关系表单
const resetRelationForm = () => {
  relationForm.value = {
    intimacy: 0,
    trust: 0,
    passion: 0,
    hostility: 0,
    groups: [],
    tags: []
  }
  newTag.value = ''
}

// 选择目标角色时加载现有关系
const onTargetCharChange = () => {
  if (!selectedTargetChar.value) {
    resetRelationForm()
    return
  }
  
  const existing = getRelationship(editingCharName.value, selectedTargetChar.value)
  if (existing) {
    relationForm.value = {
      intimacy: existing.intimacy || 0,
      trust: existing.trust || 0,
      passion: existing.passion || 0,
      hostility: existing.hostility || 0,
      groups: [...(existing.groups || [])],
      tags: [...(existing.tags || [])]
    }
  } else {
    resetRelationForm()
  }
}

// 切换分组
const toggleGroup = (groupKey) => {
  const idx = relationForm.value.groups.indexOf(groupKey)
  if (idx > -1) {
    relationForm.value.groups.splice(idx, 1)
  } else {
    relationForm.value.groups.push(groupKey)
  }
}

// 添加标签
const addTag = () => {
  if (newTag.value.trim() && !relationForm.value.tags.includes(newTag.value.trim())) {
    relationForm.value.tags.push(newTag.value.trim())
    newTag.value = ''
  }
}

// 删除标签
const removeTag = (tag) => {
  const idx = relationForm.value.tags.indexOf(tag)
  if (idx > -1) {
    relationForm.value.tags.splice(idx, 1)
  }
}

// 保存关系
const saveRelation = () => {
  if (!selectedTargetChar.value) return
  
  setRelationship(editingCharName.value, selectedTargetChar.value, {
    ...relationForm.value
  })
  
  // 刷新关系列表
  characterRelations.value = getCharacterRelationsList(editingCharName.value)
  
  // 重置表单
  selectedTargetChar.value = ''
  resetRelationForm()
}

// 删除关系（双向删除并持久化到世界书）
const deleteRelation = (targetName) => {
  // 使用 removeRelationship 进行双向删除并立即更新印象世界书
  removeRelationship(editingCharName.value, targetName, true)
  // 刷新UI中的关系列表
  characterRelations.value = getCharacterRelationsList(editingCharName.value)
}

// 编辑现有关系
const editRelation = (relation) => {
  selectedTargetChar.value = relation.targetName
  onTargetCharChange()
}

// ==================== 性格/目标编辑 ====================

// 加载角色性格数据
const loadCharacterPersonality = (charName) => {
  const data = getCharacterData(charName)
  if (data) {
    personalityForm.value = { ...data.personality }
    goalsForm.value = { ...data.goals }
    prioritiesForm.value = { ...data.priorities }
  } else {
    // 默认值
    personalityForm.value = { order: 0, altruism: 0, tradition: 0, peace: 50 }
    goalsForm.value = { immediate: '', shortTerm: '', longTerm: '' }
    prioritiesForm.value = { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 }
  }
}

// 保存性格设置
const savePersonality = () => {
  updatePersonality(editingCharName.value, personalityForm.value)
  updateGoals(editingCharName.value, goalsForm.value)
  updatePriorities(editingCharName.value, prioritiesForm.value)
}

// 关闭关系编辑器
const closeRelationEditor = async () => {
  // 保存性格设置
  savePersonality()
  // 确保防抖缓冲区中的数据立即写入世界书
  await flushPendingSocialData()
  showRelationEditor.value = false
}

// 确认修改并同步到世界书
const handleConfirm = async () => {
  if (!currentClass.value) return
  
  isSaving.value = true
  try {
    // 0. 先刷新防抖缓冲区，确保关系数据不丢失
    await flushPendingSocialData()

    // 1. 同步到内存 Store
    if (gameStore.world.allClassData[props.classId]) {
      // 使用 JSON 序列化确保数据纯净，移除可能的 Proxy 引用
      gameStore.world.allClassData[props.classId] = JSON.parse(JSON.stringify(currentClass.value))
    }

    // 2. 同步到世界书
    const success = await updateClassDataInWorldbook(props.classId, currentClass.value, true)
    if (success) {
      alert('修改已保存到世界书！')
      emit('close')
    } else {
      alert('保存失败，请检查控制台日志。')
    }
  } catch (e) {
    console.error(e)
    alert('保存出错')
  } finally {
    isSaving.value = false
  }
}

// 获取角色性别
const getGender = (name) => {
  if (!name) return 'female'
  if (name === gameStore.player.name) return gameStore.player.gender || 'male'
  const data = getCharacterData(name)
  return data?.gender || 'female'
}
</script>

<template>
  <Teleport to="body">
    <div class="roster-panel" :class="{ 'dark-mode': gameStore.settings.darkMode }">
      <div class="panel-header">
      <h3>{{ currentClass.name || classId }} 名册</h3>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>

    <div class="roster-content">
      <div class="section">
        <h4>班主任</h4>
        <div class="role-card" @click="startEdit('headTeacher', 0, currentClass.headTeacher)">
          <div class="role-info">
            <span class="role-name">{{ currentClass.headTeacher.name || '未设置' }}</span>
            <span class="role-meta">{{ currentClass.headTeacher.gender === 'female' ? '♀' : '♂' }} | {{ currentClass.headTeacher.origin }}</span>
          </div>
          <button class="relation-btn" @click.stop="openRelationEditor(currentClass.headTeacher.name)" v-if="currentClass.headTeacher.name">🔗</button>
        </div>
      </div>

      <div class="section">
        <h4>科任教师</h4>
        <div class="grid-list">
          <div 
            v-for="(teacher, index) in currentClass.teachers" 
            :key="index" 
            class="role-card"
          >
            <div class="card-content" @click="startEdit('teacher', index, teacher)">
              <div class="role-subject">{{ teacher.subject }}</div>
              <div class="role-info">
                <span class="role-name">{{ teacher.name }}</span>
                <span class="role-meta">{{ teacher.gender === 'female' ? '♀' : '♂' }}</span>
              </div>
              <div class="role-origin">{{ teacher.origin }}</div>
            </div>
            <button class="relation-btn" @click.stop="openRelationEditor(teacher.name)" v-if="teacher.name">🔗</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h4>学生列表 ({{ currentClass.students.length }})</h4>
          <button class="add-btn" @click="addStudent">+ 添加学生</button>
        </div>
        <div class="grid-list">
          <div 
            v-for="(student, index) in currentClass.students" 
            :key="index" 
            class="role-card student-card"
          >
            <div class="card-content" @click="startEdit('student', index, student)">
              <div class="role-info">
                <span class="role-index">{{ index + 1 }}.</span>
                <span class="role-name">{{ student.name }}</span>
                <span class="role-meta">{{ student.gender === 'female' ? '♀' : '♂' }}</span>
              </div>
              <div class="role-origin">{{ student.origin }}</div>
            </div>
            <div class="card-actions">
              <button class="relation-btn" @click.stop="openRelationEditor(student.name)" v-if="student.name" title="编辑关系">🔗</button>
              <button class="delete-btn" @click.stop="deleteStudent(index)" title="删除">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button class="confirm-btn" @click="handleConfirm" :disabled="isSaving">
        {{ isSaving ? '保存中...' : '确认修改并同步到世界书' }}
      </button>
    </div>

    <!-- 基础编辑弹窗 -->
    <div v-if="showEditor" class="modal-overlay">
      <div class="modal">
        <h3>{{ editingIndex === -1 ? '添加' : '编辑' }}角色</h3>
        
        <div class="form-row">
          <label>姓名：</label>
          <input type="text" v-model="editForm.name" class="input-field" />
        </div>
        
        <div class="form-row">
          <label>性别：</label>
          <select v-model="editForm.gender" class="input-field">
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
        
        <div class="form-row">
          <label>原作：</label>
          <input type="text" v-model="editForm.origin" class="input-field" placeholder="出自哪部作品" />
        </div>

        <div v-if="editingRole === 'teacher'" class="form-row">
          <label>科目：</label>
          <input type="text" v-model="editForm.subject" class="input-field" />
        </div>

        <div v-if="editingRole === 'student'" class="form-row">
          <label>选课倾向：</label>
          <select v-model="editForm.electivePreference" class="input-field">
            <option v-for="(pref, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
              {{ pref.icon }} {{ pref.name }}
            </option>
          </select>
        </div>

        <div v-if="editingRole === 'student'" class="form-row">
          <label>日程模板：</label>
          <select v-model="editForm.scheduleTag" class="input-field">
            <option value="">(自动推断)</option>
            <option v-for="(tpl, key) in DEFAULT_TEMPLATES" :key="key" :value="key">
              {{ tpl.name }}
            </option>
          </select>
        </div>

        <!-- 学力设置（仅学生） -->
        <div v-if="editingRole === 'student'" class="section-block">
          <h4>📚 学力档案</h4>
          <div class="form-row" style="display:flex;gap:12px;">
            <div style="flex:1">
              <label>学力等级：</label>
              <select v-model="editForm.academicProfile.level" class="input-field">
                <option v-for="(label, key) in ACADEMIC_LEVEL_OPTIONS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div style="flex:1">
              <label>成长潜力：</label>
              <select v-model="editForm.academicProfile.potential" class="input-field">
                <option v-for="(label, key) in ACADEMIC_POTENTIAL_OPTIONS" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <label>科目特长/弱项：</label>
            <div class="academic-traits-grid">
              <span
                v-for="trait in ACADEMIC_TRAIT_OPTIONS"
                :key="trait.key"
                class="academic-trait-chip"
                :class="{ active: editForm.academicProfile.traits.includes(trait.key), strong: trait.bonus > 0, weak: trait.bonus < 0 }"
                @click="toggleAcademicTrait(trait.key)"
              >{{ trait.label }}</span>
            </div>
          </div>
        </div>

        <!-- 性格滑条 -->
        <div class="section-block">
          <h4>性格倾向</h4>
          <div v-for="(axis, key) in PERSONALITY_AXES" :key="key" class="axis-row">
            <label>{{ axis.name }}（{{ axis.labels.min }}/{{ axis.labels.max }}）：</label>
            <input type="range" :min="axis.min" :max="axis.max" v-model.number="editForm.personality[key]" />
            <input type="number" :min="axis.min" :max="axis.max" v-model.number="editForm.personality[key]" class="axis-input" />
          </div>
        </div>

        <div class="modal-actions">
          <button class="action-btn" @click="saveEdit">保存</button>
          <button class="action-btn secondary" @click="showEditor = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 关系编辑弹窗 -->
    <div v-if="showRelationEditor" class="modal-overlay relation-overlay">
      <div class="modal relation-modal">
        <div class="modal-header">
          <h3>编辑 {{ editingCharName }} 的设定</h3>
          <button class="close-btn" @click="closeRelationEditor">×</button>
        </div>
        
        <div class="relation-content">
          <!-- 标签页 -->
          <div class="tabs">
            <button class="tab-btn" :class="{ active: !showPersonalityEditor }" @click="showPersonalityEditor = false">人际关系</button>
            <button class="tab-btn" :class="{ active: showPersonalityEditor }" @click="showPersonalityEditor = true">性格/目标</button>
          </div>

          <!-- 人际关系面板 -->
          <div v-if="!showPersonalityEditor" class="relation-panel">
            <!-- 现有关系列表 -->
            <div class="existing-relations" v-if="characterRelations.length > 0">
              <h4>现有关系</h4>
              <div class="relation-list">
                <div v-for="rel in characterRelations" :key="rel.targetName" class="relation-item">
                  <div class="relation-info">
                    <span class="target-name">{{ rel.targetName }}</span>
                    <span class="relation-desc">{{ getRelationshipDescription(rel, getGender(editingCharName), getGender(rel.targetName)) }}</span>
                    <span class="relation-values">
                      亲密:{{ rel.intimacy }} 信赖:{{ rel.trust }} 激情:{{ rel.passion }} 敌意:{{ rel.hostility }}
                    </span>
                  </div>
                  <div class="relation-actions">
                    <button @click="editRelation(rel)" title="编辑">✏️</button>
                    <button @click="deleteRelation(rel.targetName)" title="删除">🗑️</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 添加/编辑关系 -->
            <div class="add-relation">
              <h4>{{ selectedTargetChar ? '编辑关系' : '添加关系' }}</h4>
              
              <div class="form-row">
                <label>目标角色：</label>
                <select v-model="selectedTargetChar" @change="onTargetCharChange" class="input-field">
                  <option value="">选择角色...</option>
                  <option v-for="char in allCharacters" :key="char" :value="char">{{ char }}</option>
                </select>
              </div>

              <template v-if="selectedTargetChar">
                <!-- 关系轴 -->
                <div class="axes-section">
                  <div v-for="(axis, key) in RELATIONSHIP_AXES" :key="key" class="axis-row">
                    <label>{{ axis.name }}（{{ axis.labels.min }}/{{ axis.labels.max }}）：</label>
                    <input type="range" :min="axis.min" :max="axis.max" v-model.number="relationForm[key]" />
                    <input type="number" :min="axis.min" :max="axis.max" v-model.number="relationForm[key]" class="axis-input" />
                  </div>
                </div>

                <!-- 分组选择 -->
                <div class="groups-section">
                  <label>分组：</label>
                  <div class="group-chips">
                    <span 
                      v-for="(group, key) in RELATIONSHIP_GROUPS" 
                      :key="key" 
                      class="group-chip"
                      :class="{ active: relationForm.groups.includes(key) }"
                      :style="{ borderColor: group.color, backgroundColor: relationForm.groups.includes(key) ? group.color : 'transparent' }"
                      @click="toggleGroup(key)"
                    >
                      {{ group.name }}
                    </span>
                  </div>
                </div>

                <!-- 标签 -->
                <div class="tags-section">
                  <label>印象标签：</label>
                  <div class="tag-list">
                    <span v-for="tag in relationForm.tags" :key="tag" class="tag">
                      {{ tag }}
                      <button @click="removeTag(tag)">×</button>
                    </span>
                  </div>
                  <div class="tag-input">
                    <input type="text" v-model="newTag" placeholder="输入标签" @keyup.enter="addTag" />
                    <button @click="addTag">添加</button>
                  </div>
                </div>

                <button class="action-btn" @click="saveRelation">保存关系</button>
              </template>
            </div>
          </div>

          <!-- 性格/目标面板 -->
          <div v-else class="personality-panel">
            <!-- 性格轴 -->
            <div class="section-block">
              <h4>性格倾向</h4>
              <div v-for="(axis, key) in PERSONALITY_AXES" :key="key" class="axis-row">
                <label>{{ axis.name }}（{{ axis.labels.min }}/{{ axis.labels.max }}）：</label>
                <input type="range" :min="axis.min" :max="axis.max" v-model.number="personalityForm[key]" />
                <input type="number" :min="axis.min" :max="axis.max" v-model.number="personalityForm[key]" class="axis-input" />
              </div>
            </div>

            <!-- 目标 -->
            <div class="section-block">
              <h4>目标设定</h4>
              <div class="form-row">
                <label>临时目标：</label>
                <input type="text" v-model="goalsForm.immediate" class="input-field" placeholder="当前场景的直接动机" />
              </div>
              <div class="form-row">
                <label>短期目标：</label>
                <input type="text" v-model="goalsForm.shortTerm" class="input-field" placeholder="一个阶段内的主要追求" />
              </div>
              <div class="form-row">
                <label>长期目标：</label>
                <input type="text" v-model="goalsForm.longTerm" class="input-field" placeholder="角色的终极人生理想" />
              </div>
            </div>

            <!-- 行动优先级 -->
            <div class="section-block">
              <h4>行动优先级</h4>
              <div v-for="(priority, key) in PRIORITY_TYPES" :key="key" class="axis-row">
                <label>{{ priority.icon }} {{ priority.name }}：</label>
                <input type="range" min="0" max="100" v-model.number="prioritiesForm[key]" />
                <input type="number" min="0" max="100" v-model.number="prioritiesForm[key]" class="axis-input" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.roster-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 900px;
  max-width: 95%;
  height: 85vh;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  font-family: 'Ma Shan Zheng', cursive;
}

.roster-panel.dark-mode {
  background-color: #1a1a1a;
  color: #e0e0e0;
  box-shadow: 0 5px 20px rgba(0,0,0,0.5);
}

.panel-header {
  padding: 15px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f9f9f9;
}

.dark-mode .panel-header {
  background-color: #222;
  border-bottom-color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #666;
}

.roster-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.section {
  margin-bottom: 25px;
}

.section h4 {
  margin: 0 0 10px 0;
  color: #8b4513;
  border-bottom: 2px solid #8b4513;
  padding-bottom: 5px;
  display: inline-block;
}

.dark-mode .section h4 {
  color: #ff9800;
  border-bottom-color: #ff9800;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.grid-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.role-card {
  background-color: #fdfbf3;
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.dark-mode .role-card {
  background-color: #2a2a2a;
  border-color: #333;
}

.role-card:hover {
  border-color: #8b4513;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.dark-mode .role-card:hover {
  border-color: #ff9800;
  background-color: #333;
}

.card-content {
  flex: 1;
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.role-subject {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 2px;
}

.dark-mode .role-subject {
  color: #aaa;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 5px;
}

.role-name {
  font-weight: bold;
  font-size: 1.1rem;
}

.role-meta {
  font-size: 0.9rem;
  color: #888;
}

.role-origin {
  font-size: 0.8rem;
  color: #666;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-btn {
  padding: 5px 10px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.relation-btn {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 5px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.relation-btn:hover {
  opacity: 1;
}

.delete-btn {
  background: none;
  border: none;
  color: #ff5252;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.role-card:hover .delete-btn,
.role-card:hover .relation-btn {
  opacity: 1;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.modal {
  background-color: #fff;
  padding: 20px;
  border-radius: 8px;
  width: 350px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.relation-modal {
  width: 700px;
  max-width: 95%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.modal-header h3 {
  margin: 0;
}

.modal-header .close-btn {
  font-size: 1.5rem;
}

.form-row {
  margin-bottom: 15px;
}

.form-row label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.input-field {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.action-btn {
  padding: 8px 15px;
  background-color: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.action-btn.secondary {
  background-color: #757575;
}

.panel-footer {
  padding: 15px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: center;
  background-color: #f9f9f9;
}

.confirm-btn {
  padding: 10px 30px;
  font-size: 1.2rem;
  background-color: #d32f2f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  transition: background-color 0.3s;
}

.confirm-btn:hover {
  background-color: #b71c1c;
}

.confirm-btn:disabled {
  background-color: #9e9e9e;
  cursor: not-allowed;
}

/* 关系编辑样式 */
.tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  margin-bottom: 15px;
}

.tab-btn {
  padding: 10px 20px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: #1976d2;
  border-bottom-color: #1976d2;
}

.relation-content {
  max-height: 60vh;
  overflow-y: auto;
}

.existing-relations {
  margin-bottom: 20px;
}

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.relation-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.target-name {
  font-weight: bold;
}

.relation-desc {
  font-size: 0.9rem;
  color: #666;
}

.relation-values {
  font-size: 0.8rem;
  color: #888;
}

.relation-actions {
  display: flex;
  gap: 5px;
}

.relation-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
}

.add-relation h4,
.existing-relations h4,
.section-block h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 1rem;
}

.axes-section {
  margin-bottom: 15px;
}

.axis-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.axis-row label {
  width: 200px;
  font-size: 0.9rem;
}

.axis-row input[type="range"] {
  flex: 1;
}

.axis-value {
  width: 40px;
  text-align: right;
  font-weight: bold;
}

.axis-input {
  width: 60px;
  text-align: right;
  font-weight: bold;
  padding: 2px 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-left: 8px;
}

.groups-section {
  margin-bottom: 15px;
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
}

.group-chip {
  padding: 4px 10px;
  border: 2px solid;
  border-radius: 15px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.group-chip.active {
  color: white;
}

.tags-section {
  margin-bottom: 15px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 5px 0;
}

.tag {
  background-color: #e3f2fd;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 3px;
}

.tag button {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  font-size: 0.9rem;
}

.tag-input {
  display: flex;
  gap: 5px;
}

.tag-input input {
  flex: 1;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.tag-input button {
  padding: 5px 10px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.section-block {
  margin-bottom: 20px;
  padding: 10px;
  background-color: #fafafa;
  border-radius: 4px;
}

.personality-panel .form-row {
  margin-bottom: 10px;
}

/* 学力特长标签网格 */
.academic-traits-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.academic-trait-chip {
  padding: 4px 10px;
  border: 1px solid #ddd;
  border-radius: 14px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  color: #666;
  background: #fafafa;
}

.academic-trait-chip:hover {
  border-color: #999;
  background: #f0f0f0;
}

.academic-trait-chip.active.strong {
  background: #e8f5e9;
  border-color: #4caf50;
  color: #2e7d32;
}

.academic-trait-chip.active.weak {
  background: #ffebee;
  border-color: #ef5350;
  color: #c62828;
}
</style>
