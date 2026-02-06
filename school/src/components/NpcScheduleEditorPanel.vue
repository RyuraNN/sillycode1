<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { mapData, getChildren, getItem } from '../data/mapData'
import { 
  TIME_PERIODS, 
  DEFAULT_TEMPLATES, 
  DEFAULT_ROLE_TEMPLATE_MAP,
  WEATHER_MODIFIERS,
  MOOD_MODIFIERS,
  getScheduleConfig,
  setScheduleConfig,
  saveScheduleToWorldbook
} from '../utils/npcScheduleSystem'

const emit = defineEmits(['close'])

// ==================== 状态管理 ====================

// 选项卡
const activeTab = ref('timePeriods')
const tabs = [
  { id: 'timePeriods', label: '时间段', icon: '🕐' },
  { id: 'templates', label: '日程模板', icon: '📋' },
  { id: 'roleMapping', label: '角色映射', icon: '👤' },
  { id: 'weatherMod', label: '天气修正', icon: '🌤️' },
  { id: 'moodMod', label: '心情修正', icon: '😊' }
]

// 移动端详情视图
const isMobile = ref(false)
const mobileDetailView = ref(null) // null | 'edit'
const mobileEditTarget = ref(null)

// 编辑数据
const editData = reactive({
  timePeriods: {},
  templates: {},
  roleMapping: {},
  weatherModifiers: {},
  moodModifiers: {}
})

// 当前编辑项
const currentEditItem = ref(null)
const showEditModal = ref(false)
const editModalType = ref('') // 'timePeriod', 'template', 'slot', 'weather', 'mood', 'role'

// 地图选择器
const showMapSelector = ref(false)
const mapSelectorCallback = ref(null)
const mapSearchQuery = ref('')
const mapCurrentParent = ref(null)

// ==================== 初始化 ====================

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 800
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  
  // 加载现有配置
  loadConfig()
})

const loadConfig = () => {
  // 深拷贝默认配置
  editData.timePeriods = JSON.parse(JSON.stringify(TIME_PERIODS))
  editData.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
  editData.roleMapping = JSON.parse(JSON.stringify(DEFAULT_ROLE_TEMPLATE_MAP))
  editData.weatherModifiers = JSON.parse(JSON.stringify(WEATHER_MODIFIERS))
  editData.moodModifiers = JSON.parse(JSON.stringify(MOOD_MODIFIERS))
}

// ==================== 时间段管理 ====================

const timePeriodsArray = computed(() => {
  return Object.entries(editData.timePeriods).map(([key, value]) => ({
    key,
    ...value
  }))
})

const openTimePeriodEdit = (period = null) => {
  if (period) {
    currentEditItem.value = JSON.parse(JSON.stringify(period))
  } else {
    currentEditItem.value = {
      key: 'new_period_' + Date.now(),
      id: '',
      name: '',
      start: 0,
      end: 0
    }
  }
  editModalType.value = 'timePeriod'
  showEditModal.value = true
}

const saveTimePeriod = () => {
  const item = currentEditItem.value
  if (!item.id || !item.name) {
    alert('请填写ID和名称')
    return
  }
  
  const key = item.key || item.id.toUpperCase()
  editData.timePeriods[key] = {
    id: item.id,
    name: item.name,
    start: parseInt(item.start) || 0,
    end: parseInt(item.end) || 0
  }
  
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteTimePeriod = (key) => {
  if (!confirm(`确定要删除时间段 "${editData.timePeriods[key]?.name}" 吗？`)) return
  delete editData.timePeriods[key]
}

// ==================== 日程模板管理 ====================

const templatesArray = computed(() => {
  return Object.entries(editData.templates).map(([id, template]) => ({
    id,
    ...template
  }))
})

const currentTemplate = ref(null)

const selectTemplate = (template) => {
  currentTemplate.value = JSON.parse(JSON.stringify(template))
  if (isMobile.value) {
    mobileDetailView.value = 'edit'
    mobileEditTarget.value = 'template'
  }
}

const openTemplateEdit = (template = null) => {
  if (template) {
    currentEditItem.value = JSON.parse(JSON.stringify(template))
  } else {
    currentEditItem.value = {
      id: '',
      name: '',
      slots: []
    }
  }
  editModalType.value = 'template'
  showEditModal.value = true
}

const saveTemplate = () => {
  const item = currentEditItem.value
  if (!item.id || !item.name) {
    alert('请填写ID和名称')
    return
  }
  
  editData.templates[item.id] = {
    id: item.id,
    name: item.name,
    slots: item.slots || []
  }
  
  // 更新当前选中的模板
  if (currentTemplate.value?.id === item.id) {
    currentTemplate.value = JSON.parse(JSON.stringify(editData.templates[item.id]))
  }
  
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteTemplate = (id) => {
  if (!confirm(`确定要删除模板 "${editData.templates[id]?.name}" 吗？`)) return
  delete editData.templates[id]
  if (currentTemplate.value?.id === id) {
    currentTemplate.value = null
  }
}

// ==================== 时间槽管理 ====================

const openSlotEdit = (slot = null, slotIndex = -1) => {
  if (slot) {
    currentEditItem.value = {
      ...JSON.parse(JSON.stringify(slot)),
      _index: slotIndex
    }
  } else {
    currentEditItem.value = {
      period: '',
      weekdays: ['all'],
      locations: [],
      _index: -1
    }
  }
  editModalType.value = 'slot'
  showEditModal.value = true
}

const saveSlot = () => {
  const item = currentEditItem.value
  if (!item.period) {
    alert('请选择时间段')
    return
  }
  
  const slotData = {
    period: item.period,
    weekdays: item.weekdays || ['all'],
    locations: item.locations || []
  }
  
  if (item._index >= 0) {
    currentTemplate.value.slots[item._index] = slotData
  } else {
    currentTemplate.value.slots.push(slotData)
  }
  
  // 同步到 editData
  editData.templates[currentTemplate.value.id] = JSON.parse(JSON.stringify(currentTemplate.value))
  
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteSlot = (index) => {
  if (!confirm('确定要删除这个时间槽吗？')) return
  currentTemplate.value.slots.splice(index, 1)
  editData.templates[currentTemplate.value.id] = JSON.parse(JSON.stringify(currentTemplate.value))
}

// ==================== 地点管理 ====================

const addLocation = () => {
  if (!currentEditItem.value.locations) {
    currentEditItem.value.locations = []
  }
  currentEditItem.value.locations.push({
    id: '',
    weight: 50
  })
}

const removeLocation = (index) => {
  currentEditItem.value.locations.splice(index, 1)
}

const openMapSelector = (locIndex) => {
  mapSelectorCallback.value = (locationId) => {
    currentEditItem.value.locations[locIndex].id = locationId
    showMapSelector.value = false
  }
  mapCurrentParent.value = null
  mapSearchQuery.value = ''
  showMapSelector.value = true
}

// ==================== 地图选择器逻辑 ====================

const mapItems = computed(() => {
  let items = mapData.filter(item => item.parentId === mapCurrentParent.value)
  
  if (mapSearchQuery.value) {
    const query = mapSearchQuery.value.toLowerCase()
    items = mapData.filter(item => 
      item.name?.toLowerCase().includes(query) || 
      item.id?.toLowerCase().includes(query)
    )
  }
  
  return items
})

const selectMapLocation = (item, forceSelect = false) => {
  // 检查是否有子节点
  const children = mapData.filter(i => i.parentId === item.id)
  if (!forceSelect && children.length > 0) {
    mapCurrentParent.value = item.id
  } else {
    // 没有子节点，或者强制选择（选择区域）
    if (mapSelectorCallback.value) {
      mapSelectorCallback.value(item.id)
    }
  }
}

const selectCurrentParent = () => {
  if (mapCurrentParent.value && mapSelectorCallback.value) {
    mapSelectorCallback.value(mapCurrentParent.value)
  }
}

const mapBreadcrumb = computed(() => {
  const path = []
  let current = mapCurrentParent.value
  while (current) {
    const item = getItem(current)
    if (item) {
      path.unshift(item)
      current = item.parentId
    } else {
      break
    }
  }
  return path
})

// ==================== 角色映射管理 ====================

const roleMappingArray = computed(() => {
  return Object.entries(editData.roleMapping).map(([role, templateId]) => ({
    role,
    templateId
  }))
})

const openRoleMappingEdit = (mapping = null) => {
  if (mapping) {
    currentEditItem.value = JSON.parse(JSON.stringify(mapping))
  } else {
    currentEditItem.value = {
      role: '',
      templateId: ''
    }
  }
  editModalType.value = 'role'
  showEditModal.value = true
}

const saveRoleMapping = () => {
  const item = currentEditItem.value
  if (!item.role || !item.templateId) {
    alert('请填写角色类型和模板ID')
    return
  }
  
  editData.roleMapping[item.role] = item.templateId
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteRoleMapping = (role) => {
  if (!confirm(`确定要删除角色映射 "${role}" 吗？`)) return
  delete editData.roleMapping[role]
}

// ==================== 天气修正管理 ====================

const weatherModArray = computed(() => {
  return Object.entries(editData.weatherModifiers).map(([weather, effects]) => ({
    weather,
    ...effects
  }))
})

const openWeatherEdit = (mod = null) => {
  if (mod) {
    currentEditItem.value = JSON.parse(JSON.stringify(mod))
  } else {
    currentEditItem.value = {
      weather: '',
      outdoor: 0,
      indoor: 0,
      home: 0
    }
  }
  editModalType.value = 'weather'
  showEditModal.value = true
}

const saveWeatherMod = () => {
  const item = currentEditItem.value
  if (!item.weather) {
    alert('请填写天气类型')
    return
  }
  
  editData.weatherModifiers[item.weather] = {
    outdoor: parseInt(item.outdoor) || 0,
    indoor: parseInt(item.indoor) || 0,
    home: parseInt(item.home) || 0
  }
  
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteWeatherMod = (weather) => {
  if (!confirm(`确定要删除天气修正 "${weather}" 吗？`)) return
  delete editData.weatherModifiers[weather]
}

// ==================== 心情修正管理 ====================

const moodModArray = computed(() => {
  return Object.entries(editData.moodModifiers).map(([mood, effects]) => ({
    mood,
    effects: { ...effects }
  }))
})

const openMoodEdit = (mod = null) => {
  if (mod) {
    currentEditItem.value = JSON.parse(JSON.stringify(mod))
  } else {
    currentEditItem.value = {
      mood: '',
      effects: {}
    }
  }
  editModalType.value = 'mood'
  showEditModal.value = true
}

const saveMoodMod = () => {
  const item = currentEditItem.value
  if (!item.mood) {
    alert('请填写心情类型')
    return
  }
  
  editData.moodModifiers[item.mood] = { ...item.effects }
  showEditModal.value = false
  currentEditItem.value = null
}

const deleteMoodMod = (mood) => {
  if (!confirm(`确定要删除心情修正 "${mood}" 吗？`)) return
  delete editData.moodModifiers[mood]
}

const addMoodEffect = () => {
  if (!currentEditItem.value.effects) {
    currentEditItem.value.effects = {}
  }
  const key = 'effect_' + Object.keys(currentEditItem.value.effects).length
  currentEditItem.value.effects[key] = 0
}

const removeMoodEffect = (key) => {
  delete currentEditItem.value.effects[key]
}

const updateMoodEffectKey = (oldKey, newKey) => {
  if (oldKey === newKey) return
  const value = currentEditItem.value.effects[oldKey]
  delete currentEditItem.value.effects[oldKey]
  currentEditItem.value.effects[newKey] = value
}

// ==================== 保存功能 ====================

const saveAllConfig = async () => {
  try {
    // 应用配置到系统
    setScheduleConfig({
      timePeriods: editData.timePeriods,
      templates: editData.templates,
      roleMapping: editData.roleMapping,
      weatherModifiers: editData.weatherModifiers,
      moodModifiers: editData.moodModifiers
    })
    
    // 保存到世界书
    const success = await saveScheduleToWorldbook()
    
    if (success) {
      alert('保存成功！')
    } else {
      alert('保存到世界书失败，配置已应用到内存。')
    }
  } catch (e) {
    console.error('保存失败:', e)
    alert('保存失败: ' + e.message)
  }
}

// ==================== 移动端导航 ====================

const goBackMobile = () => {
  mobileDetailView.value = null
  mobileEditTarget.value = null
  currentTemplate.value = null
}

// ==================== 工具函数 ====================

const weekdayOptions = [
  { value: 'all', label: '全部' },
  { value: 'weekday', label: '工作日' },
  { value: 'weekend', label: '周末' },
  { value: 'monday', label: '周一' },
  { value: 'tuesday', label: '周二' },
  { value: 'wednesday', label: '周三' },
  { value: 'thursday', label: '周四' },
  { value: 'friday', label: '周五' },
  { value: 'saturday', label: '周六' },
  { value: 'sunday', label: '周日' }
]

const locationCategories = [
  { value: 'social', label: '社交场所' },
  { value: 'outdoor', label: '户外' },
  { value: 'study', label: '学习场所' },
  { value: 'entertainment', label: '娱乐场所' },
  { value: 'rest', label: '休息场所' },
  { value: 'workplace', label: '工作场所' },
  { value: 'home', label: '家' }
]

const getLocationName = (id) => {
  if (id.startsWith('{')) return id // 占位符
  const item = getItem(id)
  return item?.name || id
}

const getPeriodName = (periodId) => {
  for (const key in editData.timePeriods) {
    if (editData.timePeriods[key].id === periodId) {
      return editData.timePeriods[key].name
    }
  }
  return periodId
}
</script>

<template>
  <div class="editor-overlay">
    <div class="editor-panel" :class="{ 'mobile': isMobile }">
      <!-- 顶部工具栏 -->
      <div class="editor-header">
        <div class="header-left">
          <div class="header-icon">🗓️</div>
          <h2 class="header-title">NPC日程编辑器</h2>
        </div>
        <div class="controls">
          <button class="btn primary" @click="saveAllConfig">
            <span class="btn-icon">💾</span>
            保存配置
          </button>
          <button class="btn secondary" @click="$emit('close')">
            <span class="btn-icon">✕</span>
            关闭
          </button>
        </div>
      </div>

      <!-- 选项卡导航 -->
      <div class="tabs-container">
        <div class="tabs">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            class="tab-btn"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id; mobileDetailView = null"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <!-- 移动端返回按钮 -->
        <div v-if="isMobile && mobileDetailView" class="mobile-back-bar">
          <button class="back-btn" @click="goBackMobile">
            ← 返回列表
          </button>
        </div>

        <!-- 时间段选项卡 -->
        <div v-if="activeTab === 'timePeriods'" class="tab-content">
          <div class="content-header">
            <h3>时间段配置</h3>
            <button class="btn small primary" @click="openTimePeriodEdit()">
              + 添加时间段
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="period in timePeriodsArray" 
              :key="period.key"
              class="list-item"
            >
              <div class="item-main">
                <span class="item-icon">🕐</span>
                <div class="item-info">
                  <div class="item-name">{{ period.name }}</div>
                  <div class="item-meta">
                    {{ period.start }}:00 - {{ period.end }}:00 | ID: {{ period.id }}
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn" @click="openTimePeriodEdit(period)" title="编辑">✏️</button>
                <button class="icon-btn danger" @click="deleteTimePeriod(period.key)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 日程模板选项卡 -->
        <div v-if="activeTab === 'templates'" class="tab-content split-view">
          <!-- 模板列表 -->
          <div class="list-panel" :class="{ 'hidden-mobile': isMobile && mobileDetailView }">
            <div class="content-header">
              <h3>日程模板</h3>
              <button class="btn small primary" @click="openTemplateEdit()">
                + 新建模板
              </button>
            </div>
            <div class="list-container">
              <div 
                v-for="template in templatesArray" 
                :key="template.id"
                class="list-item"
                :class="{ selected: currentTemplate?.id === template.id }"
                @click="selectTemplate(template)"
              >
                <div class="item-main">
                  <span class="item-icon">📋</span>
                  <div class="item-info">
                    <div class="item-name">{{ template.name }}</div>
                    <div class="item-meta">
                      ID: {{ template.id }} | {{ template.slots?.length || 0 }} 个时间槽
                    </div>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="icon-btn" @click.stop="openTemplateEdit(template)" title="编辑信息">✏️</button>
                  <button class="icon-btn danger" @click.stop="deleteTemplate(template.id)" title="删除">🗑️</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模板详情 -->
          <div class="detail-panel" :class="{ 'hidden-mobile': isMobile && !mobileDetailView }">
            <template v-if="currentTemplate">
              <div class="content-header">
                <h3>{{ currentTemplate.name }} - 时间槽</h3>
                <button class="btn small primary" @click="openSlotEdit()">
                  + 添加时间槽
                </button>
              </div>
              <div class="slots-container">
                <div 
                  v-for="(slot, index) in currentTemplate.slots" 
                  :key="index"
                  class="slot-card"
                >
                  <div class="slot-header">
                    <span class="slot-period">{{ getPeriodName(slot.period) }}</span>
                    <span class="slot-weekdays">{{ slot.weekdays?.join(', ') || 'all' }}</span>
                    <div class="slot-actions">
                      <button class="icon-btn small" @click="openSlotEdit(slot, index)">✏️</button>
                      <button class="icon-btn small danger" @click="deleteSlot(index)">🗑️</button>
                    </div>
                  </div>
                  <div class="slot-locations">
                    <div 
                      v-for="(loc, locIdx) in slot.locations" 
                      :key="locIdx"
                      class="location-tag"
                    >
                      {{ getLocationName(loc.id) }} ({{ loc.weight }})
                    </div>
                  </div>
                </div>
                <div v-if="!currentTemplate.slots?.length" class="empty-hint">
                  暂无时间槽，点击上方按钮添加
                </div>
              </div>
            </template>
            <div v-else class="empty-hint center">
              ← 请从左侧选择一个模板
            </div>
          </div>
        </div>

        <!-- 角色映射选项卡 -->
        <div v-if="activeTab === 'roleMapping'" class="tab-content">
          <div class="content-header">
            <h3>角色类型 → 模板映射</h3>
            <button class="btn small primary" @click="openRoleMappingEdit()">
              + 添加映射
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mapping in roleMappingArray" 
              :key="mapping.role"
              class="list-item"
            >
              <div class="item-main">
                <span class="item-icon">👤</span>
                <div class="item-info">
                  <div class="item-name">{{ mapping.role }}</div>
                  <div class="item-meta">
                    → {{ editData.templates[mapping.templateId]?.name || mapping.templateId }}
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn" @click="openRoleMappingEdit(mapping)" title="编辑">✏️</button>
                <button class="icon-btn danger" @click="deleteRoleMapping(mapping.role)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 天气修正选项卡 -->
        <div v-if="activeTab === 'weatherMod'" class="tab-content">
          <div class="content-header">
            <h3>天气对位置权重的影响</h3>
            <button class="btn small primary" @click="openWeatherEdit()">
              + 添加天气
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mod in weatherModArray" 
              :key="mod.weather"
              class="list-item"
            >
              <div class="item-main">
                <span class="item-icon">🌤️</span>
                <div class="item-info">
                  <div class="item-name">{{ mod.weather }}</div>
                  <div class="item-meta">
                    户外: {{ mod.outdoor >= 0 ? '+' : '' }}{{ mod.outdoor }} | 
                    室内: {{ mod.indoor >= 0 ? '+' : '' }}{{ mod.indoor }} | 
                    家: {{ mod.home >= 0 ? '+' : '' }}{{ mod.home || 0 }}
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn" @click="openWeatherEdit(mod)" title="编辑">✏️</button>
                <button class="icon-btn danger" @click="deleteWeatherMod(mod.weather)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 心情修正选项卡 -->
        <div v-if="activeTab === 'moodMod'" class="tab-content">
          <div class="content-header">
            <h3>心情对位置权重的影响</h3>
            <button class="btn small primary" @click="openMoodEdit()">
              + 添加心情
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mod in moodModArray" 
              :key="mod.mood"
              class="list-item"
            >
              <div class="item-main">
                <span class="item-icon">😊</span>
                <div class="item-info">
                  <div class="item-name">{{ mod.mood }}</div>
                  <div class="item-meta">
                    <span v-for="(val, key) in mod.effects" :key="key" class="effect-tag">
                      {{ key }}: {{ val >= 0 ? '+' : '' }}{{ val }}
                    </span>
                    <span v-if="Object.keys(mod.effects).length === 0" class="no-effect">无效果</span>
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn" @click="openMoodEdit(mod)" title="编辑">✏️</button>
                <button class="icon-btn danger" @click="deleteMoodMod(mod.mood)" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑弹窗 -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <!-- 时间段编辑 -->
          <template v-if="editModalType === 'timePeriod'">
            <div class="modal-header">
              <span class="modal-icon">🕐</span>
              <h3>{{ currentEditItem?.key ? '编辑时间段' : '新建时间段' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>ID (英文)</label>
                <input v-model="currentEditItem.id" placeholder="例如: morning_class">
              </div>
              <div class="form-group">
                <label>名称</label>
                <input v-model="currentEditItem.name" placeholder="例如: 上午课程">
              </div>
              <div class="form-row">
                <div class="form-group half">
                  <label>开始时间 (小时)</label>
                  <input type="number" v-model.number="currentEditItem.start" min="0" max="23">
                </div>
                <div class="form-group half">
                  <label>结束时间 (小时)</label>
                  <input type="number" v-model.number="currentEditItem.end" min="0" max="24">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveTimePeriod">保存</button>
            </div>
          </template>

          <!-- 模板编辑 -->
          <template v-if="editModalType === 'template'">
            <div class="modal-header">
              <span class="modal-icon">📋</span>
              <h3>{{ currentEditItem?.id && editData.templates[currentEditItem.id] ? '编辑模板' : '新建模板' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>模板ID (英文)</label>
                <input v-model="currentEditItem.id" placeholder="例如: student_normal" :disabled="editData.templates[currentEditItem?.id]">
              </div>
              <div class="form-group">
                <label>模板名称</label>
                <input v-model="currentEditItem.name" placeholder="例如: 普通学生">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveTemplate">保存</button>
            </div>
          </template>

          <!-- 时间槽编辑 -->
          <template v-if="editModalType === 'slot'">
            <div class="modal-header">
              <span class="modal-icon">⏰</span>
              <h3>{{ currentEditItem?._index >= 0 ? '编辑时间槽' : '新建时间槽' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>时间段</label>
                <select v-model="currentEditItem.period">
                  <option value="">请选择</option>
                  <option v-for="p in timePeriodsArray" :key="p.key" :value="p.id">
                    {{ p.name }} ({{ p.start }}:00 - {{ p.end }}:00)
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>适用日期</label>
                <div class="checkbox-group">
                  <label v-for="opt in weekdayOptions" :key="opt.value" class="checkbox-item">
                    <input 
                      type="checkbox" 
                      :value="opt.value"
                      v-model="currentEditItem.weekdays"
                    >
                    {{ opt.label }}
                  </label>
                </div>
              </div>
              <div class="form-group">
                <label>地点权重列表</label>
                <div class="locations-editor">
                  <div 
                    v-for="(loc, idx) in currentEditItem.locations" 
                    :key="idx"
                    class="location-row"
                  >
                    <input 
                      v-model="loc.id" 
                      placeholder="地点ID或占位符如{classroom}"
                      class="location-input"
                    >
                    <button class="icon-btn small" @click="openMapSelector(idx)" title="从地图选择">🗺️</button>
                    <input 
                      type="number" 
                      v-model.number="loc.weight" 
                      placeholder="权重"
                      class="weight-input"
                    >
                    <button class="icon-btn small danger" @click="removeLocation(idx)">✕</button>
                  </div>
                  <button class="btn small" @click="addLocation">+ 添加地点</button>
                </div>
                <div class="form-hint">
                  支持占位符: {'{classroom}'}, {'{club}'}, {'{home}'}, {'{social_spot}'} 等
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveSlot">保存</button>
            </div>
          </template>

          <!-- 角色映射编辑 -->
          <template v-if="editModalType === 'role'">
            <div class="modal-header">
              <span class="modal-icon">👤</span>
              <h3>{{ currentEditItem?.role && editData.roleMapping[currentEditItem.role] ? '编辑映射' : '新建映射' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>角色类型</label>
                <input v-model="currentEditItem.role" placeholder="例如: student, teacher">
              </div>
              <div class="form-group">
                <label>默认模板</label>
                <select v-model="currentEditItem.templateId">
                  <option value="">请选择</option>
                  <option v-for="t in templatesArray" :key="t.id" :value="t.id">
                    {{ t.name }} ({{ t.id }})
                  </option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveRoleMapping">保存</button>
            </div>
          </template>

          <!-- 天气修正编辑 -->
          <template v-if="editModalType === 'weather'">
            <div class="modal-header">
              <span class="modal-icon">🌤️</span>
              <h3>{{ currentEditItem?.weather && editData.weatherModifiers[currentEditItem.weather] ? '编辑天气修正' : '新建天气修正' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>天气类型 (英文)</label>
                <input v-model="currentEditItem.weather" placeholder="例如: rainy, sunny">
              </div>
              <div class="form-row">
                <div class="form-group third">
                  <label>户外权重</label>
                  <input type="number" v-model.number="currentEditItem.outdoor">
                </div>
                <div class="form-group third">
                  <label>室内权重</label>
                  <input type="number" v-model.number="currentEditItem.indoor">
                </div>
                <div class="form-group third">
                  <label>回家权重</label>
                  <input type="number" v-model.number="currentEditItem.home">
                </div>
              </div>
              <div class="form-hint">
                正数增加权重，负数减少权重。例如雨天户外-50表示下雨时NPC更不愿意去户外。
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveWeatherMod">保存</button>
            </div>
          </template>

          <!-- 心情修正编辑 -->
          <template v-if="editModalType === 'mood'">
            <div class="modal-header">
              <span class="modal-icon">😊</span>
              <h3>{{ currentEditItem?.mood && editData.moodModifiers[currentEditItem.mood] ? '编辑心情修正' : '新建心情修正' }}</h3>
              <button class="modal-close" @click="showEditModal = false">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>心情类型 (英文)</label>
                <input v-model="currentEditItem.mood" placeholder="例如: happy, sad, stressed">
              </div>
              <div class="form-group">
                <label>效果列表</label>
                <div class="effects-editor">
                  <div 
                    v-for="(val, key) in currentEditItem.effects" 
                    :key="key"
                    class="effect-row"
                  >
                    <select 
                      :value="key"
                      @change="updateMoodEffectKey(key, $event.target.value)"
                      class="effect-key-select"
                    >
                      <option v-for="cat in locationCategories" :key="cat.value" :value="cat.value">
                        {{ cat.label }}
                      </option>
                      <option value="outdoor">户外</option>
                      <option value="home">回家</option>
                    </select>
                    <input 
                      type="number" 
                      v-model.number="currentEditItem.effects[key]" 
                      class="effect-value-input"
                    >
                    <button class="icon-btn small danger" @click="removeMoodEffect(key)">✕</button>
                  </div>
                  <button class="btn small" @click="addMoodEffect">+ 添加效果</button>
                </div>
                <div class="form-hint">
                  正数增加权重，负数减少权重。例如 happy → social: +20 表示开心时更愿意去社交场所。
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveMoodMod">保存</button>
            </div>
          </template>
        </div>
      </div>

      <!-- 地图选择器弹窗 -->
      <div v-if="showMapSelector" class="modal-overlay" @click.self="showMapSelector = false">
        <div class="modal map-selector-modal">
          <div class="modal-header">
            <span class="modal-icon">🗺️</span>
            <h3>选择地点</h3>
            <button class="modal-close" @click="showMapSelector = false">×</button>
          </div>
          <div class="modal-body">
            <!-- 搜索 -->
            <div class="map-search">
              <input 
                v-model="mapSearchQuery" 
                placeholder="搜索地点名称或ID..."
                class="search-input"
              >
            </div>
            
            <!-- 面包屑 -->
            <div class="map-breadcrumb">
              <span class="crumb" @click="mapCurrentParent = null">🌍 根目录</span>
              <template v-for="item in mapBreadcrumb" :key="item.id">
                <span class="separator">›</span>
                <span class="crumb" @click="mapCurrentParent = item.id">{{ item.name }}</span>
              </template>
            </div>

            <!-- 当前区域操作 -->
            <div v-if="mapCurrentParent" class="map-current-actions">
               <button class="btn small primary full-width" @click="selectCurrentParent">
                 📍 选择当前区域: {{ getItem(mapCurrentParent)?.name || mapCurrentParent }} (随机漫游)
               </button>
            </div>
            
            <!-- 地点列表 -->
            <div class="map-list">
              <div 
                v-for="item in mapItems" 
                :key="item.id"
                class="map-list-item"
                @click="selectMapLocation(item)"
              >
                <span class="map-item-icon">
                  {{ item.type === '区域' || item.type === '城市' ? '📁' : '📍' }}
                </span>
                <div class="map-item-info">
                  <div class="map-item-name">{{ item.name }}</div>
                  <div class="map-item-id">{{ item.id }}</div>
                </div>
                
                <!-- 区域选择按钮 -->
                <button 
                  v-if="mapData.some(i => i.parentId === item.id)" 
                  class="btn small map-select-area-btn"
                  @click.stop="selectMapLocation(item, true)"
                  title="选择此区域(随机漫游)"
                >
                  选择区域
                </button>
                
                <span class="map-item-arrow" v-if="mapData.some(i => i.parentId === item.id)">→</span>
              </div>
              <div v-if="!mapItems.length" class="empty-hint">
                没有找到匹配的地点
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 4000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.editor-panel {
  width: 95%;
  height: 95%;
  max-width: 1200px;
  background: linear-gradient(135deg, #1a2332 0%, #0f1419 100%);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.editor-header {
  padding: 16px 24px;
  background: linear-gradient(135deg, #243447 0%, #1a2332 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 28px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.btn-icon {
  font-size: 14px;
}

.btn.primary {
  background: linear-gradient(135deg, #4CAF50 0%, #43A047 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #b0bec5;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

.btn.danger {
  background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
  color: white;
}

/* 选项卡 */
.tabs-container {
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 16px;
  overflow-x: auto;
  flex-shrink: 0;
}

.tabs {
  display: flex;
  gap: 4px;
  min-width: max-content;
}

.tab-btn {
  padding: 12px 20px;
  background: transparent;
  border: none;
  color: #78909c;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  color: #b0bec5;
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  color: #64b5f6;
  border-bottom-color: #64b5f6;
  background: rgba(100, 181, 246, 0.1);
}

.tab-icon {
  font-size: 16px;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 20px;
}

.tab-content.split-view {
  flex-direction: row;
  gap: 20px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.content-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e2e8f0;
}

/* 列表容器 */
.list-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.list-container::-webkit-scrollbar {
  width: 6px;
}

.list-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.list-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.list-item.selected {
  background: rgba(100, 181, 246, 0.15);
  border-color: rgba(100, 181, 246, 0.4);
}

.item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.item-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.item-info {
  min-width: 0;
}

.item-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 14px;
}

.item-meta {
  font-size: 12px;
  color: #78909c;
  margin-top: 2px;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.icon-btn.danger:hover {
  background: rgba(239, 83, 80, 0.3);
}

.icon-btn.small {
  width: 26px;
  height: 26px;
  font-size: 12px;
}

/* 分栏布局 */
.list-panel {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 16px;
}

/* 时间槽卡片 */
.slots-container {
  flex: 1;
  overflow-y: auto;
}

.slot-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}

.slot-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.slot-period {
  font-weight: 600;
  color: #64b5f6;
  font-size: 14px;
}

.slot-weekdays {
  font-size: 12px;
  color: #78909c;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.slot-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.slot-locations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.location-tag {
  background: rgba(76, 175, 80, 0.2);
  color: #81c784;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.effect-tag {
  background: rgba(100, 181, 246, 0.2);
  color: #90caf9;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  margin-right: 6px;
}

.no-effect {
  color: #546e7a;
  font-style: italic;
}

.empty-hint {
  color: #546e7a;
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

.empty-hint.center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 5000;
}

.modal {
  background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  border-radius: 16px;
  width: 520px;
  max-width: 95%;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 18px 24px;
  background: linear-gradient(135deg, #3182ce 0%, #2b6cb0 100%);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.modal-icon {
  font-size: 22px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: white;
  flex: 1;
}

.modal-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

/* 表单 */
.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 13px;
  color: #e2e8f0;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 14px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-group.half {
  flex: 1;
}

.form-group.third {
  flex: 1;
}

.form-hint {
  font-size: 11px;
  color: #78909c;
  margin-top: 6px;
}

/* 复选框组 */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: #b0bec5;
}

.checkbox-item:has(input:checked) {
  background: rgba(100, 181, 246, 0.2);
  color: #90caf9;
}

.checkbox-item input {
  width: auto;
  margin: 0;
}

/* 地点编辑器 */
.locations-editor {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 12px;
}

.location-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.location-input {
  flex: 1;
}

.weight-input {
  width: 70px;
  flex: none;
}

/* 效果编辑器 */
.effects-editor {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 12px;
}

.effect-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.effect-key-select {
  flex: 1;
}

.effect-value-input {
  width: 80px;
  flex: none;
}

/* 地图选择器 */
.map-selector-modal {
  width: 600px;
}

.map-search {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #4299e1;
}

.map-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  flex-wrap: wrap;
}

.map-breadcrumb .crumb {
  color: #64b5f6;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.map-breadcrumb .crumb:hover {
  background: rgba(100, 181, 246, 0.15);
}

.map-breadcrumb .separator {
  color: #546e7a;
}

.map-current-actions {
  margin-bottom: 12px;
}

.map-current-actions .full-width {
  width: 100%;
  justify-content: center;
}

.map-select-area-btn {
  margin-right: 8px;
  padding: 4px 8px;
  font-size: 11px;
  background: rgba(100, 181, 246, 0.2);
  color: #90caf9;
  border: 1px solid rgba(100, 181, 246, 0.3);
}

.map-select-area-btn:hover {
  background: rgba(100, 181, 246, 0.3);
}

.map-list {
  max-height: 300px;
  overflow-y: auto;
}

.map-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.map-list-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.map-item-icon {
  font-size: 18px;
}

.map-item-info {
  flex: 1;
  min-width: 0;
}

.map-item-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 13px;
}

.map-item-id {
  font-size: 11px;
  color: #78909c;
}

.map-item-arrow {
  color: #546e7a;
  font-size: 14px;
}

/* 移动端适配 */
.mobile-back-bar {
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  background: none;
  border: none;
  color: #64b5f6;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}

@media (max-width: 800px) {
  .editor-panel {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  .editor-header {
    padding: 12px 16px;
  }

  .header-title {
    font-size: 16px;
  }

  .controls {
    gap: 8px;
  }

  .btn {
    padding: 8px 12px;
    font-size: 12px;
  }

  .btn .btn-icon {
    display: none;
  }

  .tab-btn {
    padding: 10px 14px;
    font-size: 12px;
  }

  .tab-label {
    display: none;
  }

  .tab-icon {
    font-size: 18px;
  }

  .tab-content {
    padding: 16px;
  }

  .tab-content.split-view {
    flex-direction: column;
  }

  .list-panel {
    flex: none;
  }

  .list-panel.hidden-mobile {
    display: none;
  }

  .detail-panel.hidden-mobile {
    display: none;
  }

  .modal {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .form-group.half,
  .form-group.third {
    flex: none;
  }
}
</style>
