<script setup>
import { ref, computed, onMounted, reactive, onUnmounted } from 'vue'
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
  { id: 'timePeriods', label: '时间段', icon: 'clock' },
  { id: 'templates', label: '日程模板', icon: 'template' },
  { id: 'roleMapping', label: '角色映射', icon: 'user' },
  { id: 'weatherMod', label: '天气修正', icon: 'weather' },
  { id: 'moodMod', label: '心情修正', icon: 'mood' }
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

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
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
          <div class="header-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
            </svg>
          </div>
          <h2 class="header-title">NPC日程编辑器</h2>
        </div>
        <div class="controls">
          <button class="btn primary" @click="saveAllConfig">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            <span class="btn-text">保存配置</span>
          </button>
          <button class="btn secondary" @click="$emit('close')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            <span class="btn-text">关闭</span>
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
            <span class="tab-icon">
              <svg v-if="tab.icon === 'clock'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
              <svg v-else-if="tab.icon === 'template'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              <svg v-else-if="tab.icon === 'user'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <svg v-else-if="tab.icon === 'weather'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
              </svg>
              <svg v-else-if="tab.icon === 'mood'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
              </svg>
            </span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="editor-main-content">
        <!-- 移动端返回按钮 -->
        <div v-if="isMobile && mobileDetailView" class="mobile-back-bar">
          <button class="back-btn" @click="goBackMobile">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            返回列表
          </button>
        </div>

        <!-- 时间段选项卡 -->
        <div v-if="activeTab === 'timePeriods'" class="tab-content">
          <div class="content-header">
            <div class="header-info">
              <h3>时间段配置</h3>
              <p class="header-desc">定义NPC日程的时间划分</p>
            </div>
            <button class="btn add-btn" @click="openTimePeriodEdit()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              添加时间段
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="period in timePeriodsArray" 
              :key="period.key"
              class="list-item"
            >
              <div class="item-glow"></div>
              <div class="item-main">
                <div class="item-icon clock">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                  </svg>
                </div>
                <div class="item-info">
                  <div class="item-name">{{ period.name }}</div>
                  <div class="item-meta">
                    <span class="meta-tag time">{{ period.start }}:00 - {{ period.end }}:00</span>
                    <span class="meta-tag id">ID: {{ period.id }}</span>
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn edit" @click="openTimePeriodEdit(period)" title="编辑">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="icon-btn danger" @click="deleteTimePeriod(period.key)" title="删除">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="!timePeriodsArray.length" class="empty-state">
              <div class="empty-icon">⏰</div>
              <p>暂无时间段配置</p>
              <button class="btn add-btn" @click="openTimePeriodEdit()">添加第一个时间段</button>
            </div>
          </div>
        </div>

        <!-- 日程模板选项卡 -->
        <div v-if="activeTab === 'templates'" class="tab-content split-view">
          <!-- 模板列表 -->
          <div class="list-panel" :class="{ 'hidden-mobile': isMobile && mobileDetailView }">
            <div class="content-header">
              <div class="header-info">
                <h3>日程模板</h3>
                <p class="header-desc">管理NPC的日程安排模板</p>
              </div>
              <button class="btn add-btn" @click="openTemplateEdit()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                新建模板
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
                <div class="item-glow"></div>
                <div class="item-main">
                  <div class="item-icon template">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                  </div>
                  <div class="item-info">
                    <div class="item-name">{{ template.name }}</div>
                    <div class="item-meta">
                      <span class="meta-tag id">ID: {{ template.id }}</span>
                      <span class="meta-tag count">{{ template.slots?.length || 0 }} 个时间槽</span>
                    </div>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="icon-btn edit" @click.stop="openTemplateEdit(template)" title="编辑信息">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="icon-btn danger" @click.stop="deleteTemplate(template.id)" title="删除">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模板详情 -->
          <div class="detail-panel" :class="{ 'hidden-mobile': isMobile && !mobileDetailView }">
            <template v-if="currentTemplate">
              <div class="content-header">
                <div class="header-info">
                  <h3>{{ currentTemplate.name }}</h3>
                  <p class="header-desc">配置时间槽和位置权重</p>
                </div>
                <button class="btn add-btn" @click="openSlotEdit()">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                  添加时间槽
                </button>
              </div>
              <div class="slots-container">
                <div 
                  v-for="(slot, index) in currentTemplate.slots" 
                  :key="index"
                  class="slot-card"
                >
                  <div class="slot-header">
                    <div class="slot-title">
                      <span class="slot-period">{{ getPeriodName(slot.period) }}</span>
                      <span class="slot-weekdays">{{ slot.weekdays?.join(', ') || 'all' }}</span>
                    </div>
                    <div class="slot-actions">
                      <button class="icon-btn small edit" @click="openSlotEdit(slot, index)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                      </button>
                      <button class="icon-btn small danger" @click="deleteSlot(index)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="slot-locations">
                    <div 
                      v-for="(loc, locIdx) in slot.locations" 
                      :key="locIdx"
                      class="location-tag"
                    >
                      <span class="loc-name">{{ getLocationName(loc.id) }}</span>
                      <span class="loc-weight">{{ loc.weight }}</span>
                    </div>
                    <div v-if="!slot.locations?.length" class="no-locations">暂无地点</div>
                  </div>
                </div>
                <div v-if="!currentTemplate.slots?.length" class="empty-state small">
                  <p>暂无时间槽，点击上方按钮添加</p>
                </div>
              </div>
            </template>
            <div v-else class="empty-state center">
              <div class="empty-icon">📋</div>
              <p>请从左侧选择一个模板</p>
            </div>
          </div>
        </div>

        <!-- 角色映射选项卡 -->
        <div v-if="activeTab === 'roleMapping'" class="tab-content">
          <div class="content-header">
            <div class="header-info">
              <h3>角色类型 → 模板映射</h3>
              <p class="header-desc">将角色类型关联到对应的日程模板</p>
            </div>
            <button class="btn add-btn" @click="openRoleMappingEdit()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              添加映射
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mapping in roleMappingArray" 
              :key="mapping.role"
              class="list-item"
            >
              <div class="item-glow"></div>
              <div class="item-main">
                <div class="item-icon user">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <div class="item-info">
                  <div class="item-name">{{ mapping.role }}</div>
                  <div class="item-meta">
                    <span class="meta-tag arrow">→</span>
                    <span class="meta-tag template">{{ editData.templates[mapping.templateId]?.name || mapping.templateId }}</span>
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn edit" @click="openRoleMappingEdit(mapping)" title="编辑">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="icon-btn danger" @click="deleteRoleMapping(mapping.role)" title="删除">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="!roleMappingArray.length" class="empty-state">
              <div class="empty-icon">👤</div>
              <p>暂无角色映射</p>
              <button class="btn add-btn" @click="openRoleMappingEdit()">添加第一个映射</button>
            </div>
          </div>
        </div>

        <!-- 天气修正选项卡 -->
        <div v-if="activeTab === 'weatherMod'" class="tab-content">
          <div class="content-header">
            <div class="header-info">
              <h3>天气对位置权重的影响</h3>
              <p class="header-desc">配置不同天气下NPC的位置偏好变化</p>
            </div>
            <button class="btn add-btn" @click="openWeatherEdit()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              添加天气
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mod in weatherModArray" 
              :key="mod.weather"
              class="list-item"
            >
              <div class="item-glow"></div>
              <div class="item-main">
                <div class="item-icon weather">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
                  </svg>
                </div>
                <div class="item-info">
                  <div class="item-name">{{ mod.weather }}</div>
                  <div class="item-meta">
                    <span class="meta-tag" :class="{ positive: mod.outdoor >= 0, negative: mod.outdoor < 0 }">
                      户外: {{ mod.outdoor >= 0 ? '+' : '' }}{{ mod.outdoor }}
                    </span>
                    <span class="meta-tag" :class="{ positive: mod.indoor >= 0, negative: mod.indoor < 0 }">
                      室内: {{ mod.indoor >= 0 ? '+' : '' }}{{ mod.indoor }}
                    </span>
                    <span class="meta-tag" :class="{ positive: (mod.home || 0) >= 0, negative: (mod.home || 0) < 0 }">
                      家: {{ (mod.home || 0) >= 0 ? '+' : '' }}{{ mod.home || 0 }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn edit" @click="openWeatherEdit(mod)" title="编辑">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="icon-btn danger" @click="deleteWeatherMod(mod.weather)" title="删除">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="!weatherModArray.length" class="empty-state">
              <div class="empty-icon">🌤️</div>
              <p>暂无天气修正配置</p>
              <button class="btn add-btn" @click="openWeatherEdit()">添加第一个天气</button>
            </div>
          </div>
        </div>

        <!-- 心情修正选项卡 -->
        <div v-if="activeTab === 'moodMod'" class="tab-content">
          <div class="content-header">
            <div class="header-info">
              <h3>心情对位置权重的影响</h3>
              <p class="header-desc">配置不同心情下NPC的位置偏好变化</p>
            </div>
            <button class="btn add-btn" @click="openMoodEdit()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              添加心情
            </button>
          </div>
          <div class="list-container">
            <div 
              v-for="mod in moodModArray" 
              :key="mod.mood"
              class="list-item"
            >
              <div class="item-glow"></div>
              <div class="item-main">
                <div class="item-icon mood">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                  </svg>
                </div>
                <div class="item-info">
                  <div class="item-name">{{ mod.mood }}</div>
                  <div class="item-meta">
                    <template v-for="(val, key) in mod.effects" :key="key">
                      <span class="meta-tag effect" :class="{ positive: val >= 0, negative: val < 0 }">
                        {{ key }}: {{ val >= 0 ? '+' : '' }}{{ val }}
                      </span>
                    </template>
                    <span v-if="Object.keys(mod.effects).length === 0" class="meta-tag muted">无效果</span>
                  </div>
                </div>
              </div>
              <div class="item-actions">
                <button class="icon-btn edit" @click="openMoodEdit(mod)" title="编辑">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
                <button class="icon-btn danger" @click="deleteMoodMod(mod.mood)" title="删除">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="!moodModArray.length" class="empty-state">
              <div class="empty-icon">😊</div>
              <p>暂无心情修正配置</p>
              <button class="btn add-btn" @click="openMoodEdit()">添加第一个心情</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑弹窗 -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <!-- 时间段编辑 -->
          <template v-if="editModalType === 'timePeriod'">
            <div class="modal-header clock-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?.key ? '编辑时间段' : '新建时间段' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">🆔</span>
                  ID (英文)
                </label>
                <input v-model="currentEditItem.id" placeholder="例如: morning_class">
              </div>
              <div class="form-group">
                <label>
                  <span class="label-icon">📝</span>
                  名称
                </label>
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
            <div class="modal-header template-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?.id && editData.templates[currentEditItem.id] ? '编辑模板' : '新建模板' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">🆔</span>
                  模板ID (英文)
                </label>
                <input v-model="currentEditItem.id" placeholder="例如: student_normal" :disabled="editData.templates[currentEditItem?.id]">
              </div>
              <div class="form-group">
                <label>
                  <span class="label-icon">📝</span>
                  模板名称
                </label>
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
            <div class="modal-header slot-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?._index >= 0 ? '编辑时间槽' : '新建时间槽' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">⏰</span>
                  时间段
                </label>
                <select v-model="currentEditItem.period">
                  <option value="">请选择</option>
                  <option v-for="p in timePeriodsArray" :key="p.key" :value="p.id">
                    {{ p.name }} ({{ p.start }}:00 - {{ p.end }}:00)
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>
                  <span class="label-icon">📅</span>
                  适用日期
                </label>
                <div class="checkbox-group">
                  <label v-for="opt in weekdayOptions" :key="opt.value" class="checkbox-item" :class="{ active: currentEditItem.weekdays?.includes(opt.value) }">
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
                <label>
                  <span class="label-icon">📍</span>
                  地点权重列表
                </label>
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
                    <button class="icon-btn map-btn" @click="openMapSelector(idx)" title="从地图选择">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                    </button>
                    <input 
                      type="number" 
                      v-model.number="loc.weight" 
                      placeholder="权重"
                      class="weight-input"
                    >
                    <button class="icon-btn small danger" @click="removeLocation(idx)">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                  <button class="btn add-location-btn" @click="addLocation">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    添加地点
                  </button>
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
            <div class="modal-header user-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?.role && editData.roleMapping[currentEditItem.role] ? '编辑映射' : '新建映射' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">👤</span>
                  角色类型
                </label>
                <input v-model="currentEditItem.role" placeholder="例如: student, teacher">
              </div>
              <div class="form-group">
                <label>
                  <span class="label-icon">📋</span>
                  默认模板
                </label>
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
            <div class="modal-header weather-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?.weather && editData.weatherModifiers[currentEditItem.weather] ? '编辑天气修正' : '新建天气修正' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">🌤️</span>
                  天气类型 (英文)
                </label>
                <input v-model="currentEditItem.weather" placeholder="例如: rainy, sunny">
              </div>
              <div class="form-row thirds">
                <div class="form-group">
                  <label>户外权重</label>
                  <input type="number" v-model.number="currentEditItem.outdoor">
                </div>
                <div class="form-group">
                  <label>室内权重</label>
                  <input type="number" v-model.number="currentEditItem.indoor">
                </div>
                <div class="form-group">
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
            <div class="modal-header mood-theme">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                </svg>
              </div>
              <h3>{{ currentEditItem?.mood && editData.moodModifiers[currentEditItem.mood] ? '编辑心情修正' : '新建心情修正' }}</h3>
              <button class="modal-close" @click="showEditModal = false">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>
                  <span class="label-icon">😊</span>
                  心情类型 (英文)
                </label>
                <input v-model="currentEditItem.mood" placeholder="例如: happy, sad, stressed">
              </div>
              <div class="form-group">
                <label>
                  <span class="label-icon">📊</span>
                  效果列表
                </label>
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
                    <button class="icon-btn small danger" @click="removeMoodEffect(key)">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                  <button class="btn add-location-btn" @click="addMoodEffect">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    添加效果
                  </button>
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
          <div class="modal-header map-theme">
            <div class="modal-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <h3>选择地点</h3>
            <button class="modal-close" @click="showMapSelector = false">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <!-- 搜索 -->
            <div class="map-search">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="search-icon">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
              <input 
                v-model="mapSearchQuery" 
                placeholder="搜索地点名称或ID..."
                class="search-input"
              >
            </div>
            
            <!-- 面包屑 -->
            <div class="map-breadcrumb">
              <span class="crumb" @click="mapCurrentParent = null">
                <span class="crumb-icon">🌍</span>
                根目录
              </span>
              <template v-for="item in mapBreadcrumb" :key="item.id">
                <span class="separator">›</span>
                <span class="crumb" @click="mapCurrentParent = item.id">{{ item.name }}</span>
              </template>
            </div>

            <!-- 当前区域操作 -->
            <div v-if="mapCurrentParent" class="map-current-actions">
               <button class="btn primary full-width" @click="selectCurrentParent">
                 <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                   <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                 </svg>
                 选择当前区域: {{ getItem(mapCurrentParent)?.name || mapCurrentParent }}
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
                  class="btn small select-area-btn"
                  @click.stop="selectMapLocation(item, true)"
                  title="选择此区域(随机漫游)"
                >
                  选择区域
                </button>
                
                <span class="map-item-arrow" v-if="mapData.some(i => i.parentId === item.id)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                  </svg>
                </span>
              </div>
              <div v-if="!mapItems.length" class="empty-state small">
                <p>没有找到匹配的地点</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 基础布局 ==================== */
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  z-index: 4000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.editor-panel {
  width: 100%;
  height: 100%;
  max-width: 1200px;
  max-height: 100%;
  background: linear-gradient(145deg, #1e2a3a 0%, #0d1520 100%);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 
    0 25px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  
  /* 覆盖全局浅色变量为深色主题 */
  --bg-primary: #1e2a3a;
  --bg-secondary: #0d1520;
  --bg-card: rgba(255, 255, 255, 0.05);
  --bg-input: rgba(0, 0, 0, 0.3);
  --bg-hover: rgba(255, 255, 255, 0.1);
  --text-primary: #ffffff;
  --text-secondary: #b8c5d6;
  --text-muted: #6b7c93;
  --border-color: rgba(255, 255, 255, 0.1);
  --border-light: rgba(255, 255, 255, 0.05);
  --shadow-color: rgba(0, 0, 0, 0.5);
}

/* ==================== 顶部工具栏 ==================== */
.editor-header {
  padding: 18px 24px;
  background: linear-gradient(135deg, #2a3a4d 0%, #1e2a3a 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.35);
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.3px;
}

.controls {
  display: flex;
  gap: 10px;
}

/* ==================== 按钮样式 ==================== */
.btn {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.btn.primary {
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.35);
}

.btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.45);
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #b8c5d6;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.2);
}

.btn.add-btn {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  padding: 8px 16px;
  font-size: 13px;
}

.btn.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn.add-location-btn {
  background: rgba(102, 126, 234, 0.15);
  color: #8b9cf9;
  border: 1px dashed rgba(102, 126, 234, 0.4);
  padding: 8px 14px;
  font-size: 12px;
  width: 100%;
  justify-content: center;
  margin-top: 8px;
}

.btn.add-location-btn:hover {
  background: rgba(102, 126, 234, 0.25);
  border-style: solid;
}

.btn.full-width {
  width: 100%;
  justify-content: center;
}

.btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

/* ==================== 图标按钮 ==================== */
.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8899a6;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.icon-btn.edit:hover {
  background: rgba(102, 126, 234, 0.25);
  color: #8b9cf9;
}

.icon-btn.danger:hover {
  background: rgba(239, 83, 80, 0.25);
  color: #ef5350;
}

.icon-btn.small {
  width: 28px;
  height: 28px;
}

.icon-btn.map-btn {
  background: rgba(76, 175, 80, 0.15);
  color: #81c784;
}

.icon-btn.map-btn:hover {
  background: rgba(76, 175, 80, 0.25);
}

/* ==================== 选项卡 ==================== */
.tabs-container {
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 20px;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tabs {
  display: flex;
  gap: 4px;
  min-width: max-content;
}

.tab-btn {
  padding: 14px 20px;
  background: transparent;
  border: none;
  color: #6b7c93;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 3px solid transparent;
  transition: all 0.25s ease;
  white-space: nowrap;
  margin-bottom: -1px;
}

.tab-btn:hover {
  color: #a0aec0;
  background: rgba(255, 255, 255, 0.03);
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
  background: linear-gradient(180deg, transparent 0%, rgba(102, 126, 234, 0.08) 100%);
}

.tab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.tab-btn.active .tab-icon {
  opacity: 1;
}

/* ==================== 主内容区 ==================== */
.editor-main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: transparent; /* 确保不继承全局 .main-content 的背景 */
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
}

.tab-content.split-view {
  flex-direction: row;
  gap: 20px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-shrink: 0;
  gap: 16px;
}

.header-info h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
}

.header-desc {
  margin: 0;
  font-size: 13px;
  color: #6b7c93;
}

/* ==================== 列表容器 ==================== */
.list-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}

.list-container::-webkit-scrollbar {
  width: 5px;
}

.list-container::-webkit-scrollbar-track {
  background: transparent;
}

.list-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* ==================== 列表项 ==================== */
.list-item {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.item-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.08) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.list-item:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 100%);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.list-item:hover .item-glow {
  opacity: 1;
}

.list-item.selected {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(102, 126, 234, 0.08) 100%);
  border-color: rgba(102, 126, 234, 0.4);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.item-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.item-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon.clock {
  background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
}

.item-icon.template {
  background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(159, 122, 234, 0.3);
}

.item-icon.user {
  background: linear-gradient(135deg, #f6ad55 0%, #ed8936 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(246, 173, 85, 0.3);
}

.item-icon.weather {
  background: linear-gradient(135deg, #f6e05e 0%, #ecc94b 100%);
  color: #744210;
  box-shadow: 0 4px 12px rgba(246, 224, 94, 0.3);
}

.item-icon.mood {
  background: linear-gradient(135deg, #68d391 0%, #48bb78 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(104, 211, 145, 0.3);
}

.item-info {
  min-width: 0;
  flex: 1;
}

.item-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 15px;
  margin-bottom: 4px;
}

.item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.meta-tag {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #8899a6;
}

.meta-tag.time {
  background: rgba(66, 153, 225, 0.15);
  color: #63b3ed;
}

.meta-tag.id {
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(255, 255, 255, 0.05);
  color: #718096;
}

.meta-tag.count {
  background: rgba(159, 122, 234, 0.15);
  color: #b794f4;
}

.meta-tag.arrow {
  background: transparent;
  color: #4a5568;
  padding: 0 4px;
}

.meta-tag.template {
  background: rgba(159, 122, 234, 0.15);
  color: #b794f4;
}

.meta-tag.effect {
  background: rgba(255, 255, 255, 0.05);
}

.meta-tag.positive {
  background: rgba(72, 187, 120, 0.15);
  color: #68d391;
}

.meta-tag.negative {
  background: rgba(239, 83, 80, 0.15);
  color: #fc8181;
}

.meta-tag.muted {
  font-style: italic;
  color: #4a5568;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* ==================== 分栏布局 ==================== */
.list-panel {
  flex: 0 0 420px;
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
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* ==================== 时间槽卡片 ==================== */
.slots-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}

.slot-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.slot-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 100%);
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.slot-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slot-period {
  font-weight: 600;
  color: #667eea;
  font-size: 14px;
}

.slot-weekdays {
  font-size: 12px;
  color: #6b7c93;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 10px;
  border-radius: 6px;
}

.slot-actions {
  display: flex;
  gap: 6px;
}

.slot-locations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.location-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(72, 187, 120, 0.12);
  border: 1px solid rgba(72, 187, 120, 0.25);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.loc-name {
  color: #68d391;
}

.loc-weight {
  color: #48bb78;
  background: rgba(72, 187, 120, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.no-locations {
  color: #4a5568;
  font-size: 13px;
  font-style: italic;
}

/* ==================== 空状态 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-state.center {
  height: 100%;
}

.empty-state.small {
  padding: 24px;
}

.empty-state .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  color: #6b7c93;
  font-size: 14px;
  margin: 0 0 16px 0;
}

/* ==================== 弹窗 ==================== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 5000;
  padding: 16px;
  box-sizing: border-box;
}

.modal {
  background: linear-gradient(145deg, #2d3a4d 0%, #1a2433 100%);
  border-radius: 20px;
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 32px);
  overflow: hidden;
  box-shadow: 
    0 25px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
}

.map-selector-modal {
  max-width: 600px;
}

.modal-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.modal-header.clock-theme {
  background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
}

.modal-header.template-theme {
  background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%);
}

.modal-header.slot-theme {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
}

.modal-header.user-theme {
  background: linear-gradient(135deg, #f6ad55 0%, #ed8936 100%);
}

.modal-header.weather-theme {
  background: linear-gradient(135deg, #f6e05e 0%, #ecc94b 100%);
}

.modal-header.weather-theme .modal-icon,
.modal-header.weather-theme h3 {
  color: #744210;
}

.modal-header.mood-theme {
  background: linear-gradient(135deg, #68d391 0%, #48bb78 100%);
}

.modal-header.map-theme {
  background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
}

.modal-icon {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
  flex: 1;
}

.modal-close {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 18px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

/* ==================== 表单 ==================== */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 13px;
  color: #e2e8f0;
}

.label-icon {
  font-size: 16px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  color: #e2e8f0;
  font-size: 14px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
}

.form-group input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row.thirds {
  gap: 12px;
}

.form-row.thirds .form-group {
  flex: 1;
}

.form-group.half {
  flex: 1;
}

.form-hint {
  font-size: 12px;
  color: #6b7c93;
  margin-top: 8px;
  line-height: 1.5;
}

/* ==================== 复选框组 ==================== */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: #8899a6;
  transition: all 0.2s ease;
}

.checkbox-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.checkbox-item.active {
  background: rgba(102, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.4);
  color: #8b9cf9;
}

.checkbox-item input {
  display: none;
}

/* ==================== 地点编辑器 ==================== */
.locations-editor {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.location-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}

.location-input {
  flex: 1;
}

.weight-input {
  width: 80px;
  flex: none;
}

/* ==================== 效果编辑器 ==================== */
.effects-editor {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.effect-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}

.effect-key-select {
  flex: 1;
}

.effect-value-input {
  width: 90px;
  flex: none;
}

/* ==================== 地图选择器 ==================== */
.map-search {
  position: relative;
  margin-bottom: 16px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7c93;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  color: #e2e8f0;
  font-size: 14px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
}

.map-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 13px;
  flex-wrap: wrap;
}

.map-breadcrumb .crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #667eea;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.map-breadcrumb .crumb:hover {
  background: rgba(102, 126, 234, 0.15);
}

.map-breadcrumb .crumb-icon {
  font-size: 14px;
}

.map-breadcrumb .separator {
  color: #4a5568;
}

.map-current-actions {
  margin-bottom: 14px;
}

.select-area-btn {
  background: rgba(102, 126, 234, 0.15);
  color: #8b9cf9;
  border: 1px solid rgba(102, 126, 234, 0.3);
  padding: 4px 10px;
  font-size: 11px;
}

.select-area-btn:hover {
  background: rgba(102, 126, 234, 0.25);
}

.map-list {
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.map-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.map-list-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.map-item-icon {
  font-size: 20px;
}

.map-item-info {
  flex: 1;
  min-width: 0;
}

.map-item-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 14px;
}

.map-item-id {
  font-size: 11px;
  color: #6b7c93;
  font-family: 'SF Mono', Monaco, monospace;
}

.map-item-arrow {
  color: #4a5568;
}

/* ==================== 移动端适配 ==================== */
.mobile-back-bar {
  padding: 14px 20px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.back-btn {
  background: none;
  border: none;
  color: #667eea;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 800px) {
  .editor-overlay {
    padding: 0;
  }

  .editor-panel {
    border-radius: 0;
    max-width: none;
  }

  .editor-header {
    padding: 14px 16px;
  }

  .header-icon {
    width: 38px;
    height: 38px;
  }

  .header-icon svg {
    width: 22px;
    height: 22px;
  }

  .header-title {
    font-size: 17px;
  }

  .controls {
    gap: 8px;
  }

  .btn {
    padding: 9px 14px;
    font-size: 12px;
  }

  .btn-text {
    display: none;
  }

  .tab-btn {
    padding: 12px 16px;
    font-size: 13px;
  }

  .tab-label {
    display: none;
  }

  .tab-icon svg {
    width: 20px;
    height: 20px;
  }

  .tab-content {
    padding: 16px;
  }

  .tab-content.split-view {
    flex-direction: column;
  }

  .content-header {
    flex-direction: column;
    align-items: stretch;
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
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .form-row,
  .form-row.thirds {
    flex-direction: column;
    gap: 0;
  }

  .form-group.half {
    flex: none;
  }

  .form-row.thirds .form-group {
    flex: none;
  }

  .item-icon {
    width: 40px;
    height: 40px;
  }

  .item-icon svg {
    width: 20px;
    height: 20px;
  }

  .list-item {
    padding: 14px 16px;
  }

  .item-meta {
    gap: 6px;
  }

  .meta-tag {
    font-size: 11px;
    padding: 2px 6px;
  }
}

@media (max-width: 480px) {
  .editor-header {
    flex-wrap: wrap;
    gap: 12px;
  }

  .header-left {
    flex: 1;
    min-width: 0;
  }

  .controls {
    width: 100%;
    justify-content: flex-end;
  }

  .header-title {
    font-size: 15px;
  }

  .tabs {
    gap: 0;
  }

  .tab-btn {
    padding: 12px 14px;
  }

  .slot-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .slot-actions {
    align-self: flex-end;
  }

  .location-row {
    flex-wrap: wrap;
  }

  .location-input {
    flex: 1 1 100%;
    margin-bottom: 8px;
  }

  .weight-input {
    flex: 1;
  }
}
</style>
