<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { 
  FULL_HOLIDAYS, 
  FULL_HOLIDAY_RANGES, 
  SPECIAL_EVENTS, 
  VACATIONS,
  EXAM_WEEK_RANGES,
  AM_OFF_EVENTS,
  PM_OFF_EVENTS,
  PM_OFF_RANGES
} from '../utils/scheduleGenerator'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const events = ref([])
const triggers = ref([]) // 本地引用的触发器列表
const searchQuery = ref('')
const selectedEvent = ref(null)
const isEditing = ref(false)
const isNew = ref(false)
const showMobileList = ref(true)

const eventTypes = [
  '全校性', '年级性', '班级性', '社团性', '个人', 
  '突发', '传闻', '地区性', '校际', '特殊日', 
  '假期', '人际', '文化性'
]

const eventTypeIcons = {
  '全校性': '🏫',
  '年级性': '📚',
  '班级性': '🎓',
  '社团性': '🎭',
  '个人': '👤',
  '突发': '⚡',
  '传闻': '💬',
  '地区性': '🗺️',
  '校际': '🤝',
  '特殊日': '🎉',
  '假期': '🏖️',
  '人际': '💕',
  '文化性': '🎨'
}

const triggerTypes = ['variable', 'random', 'composite', 'fixed_date']
const triggerTypeLabels = {
  'variable': '变量条件',
  'random': '随机触发',
  'composite': '复合条件',
  'fixed_date': '固定日期'
}
const periods = ['day', 'week', 'month']
const periodLabels = { 'day': '每天', 'week': '每周', 'month': '每月' }

// 事件表单数据
const formData = ref({
  id: '',
  name: '',
  type: '全校性',
  duration: 1,
  description: '',
  condition: '' // 这里的condition是旧字段，兼容保留
})

// 当前选中事件的触发器列表（用于编辑）
const currentEventTriggers = ref([])

// 固定事件缓存（用于展示）
const fixedEventMap = new Map()

onMounted(async () => {
  // 确保事件数据已加载
  if (gameStore.eventLibrary.size === 0) {
    await gameStore.loadEventData()
  }
  processFixedEvents()
  refreshData()
})

// 处理固定事件，生成虚拟触发器和事件对象
const processFixedEvents = () => {
  fixedEventMap.clear()
  
  const addFixed = (id, name, type, desc) => {
    if (!id) return
    fixedEventMap.set(id, {
      id,
      name,
      type,
      description: '日历系统固定事件',
      duration: 1,
      isFixed: true,
      fixedDesc: desc
    })
  }

  FULL_HOLIDAYS.forEach(e => addFixed(e.id, e.name, '特殊日', `${e.month}月${e.day}日 (全天休假)`))
  SPECIAL_EVENTS.forEach(e => addFixed(e.id, e.name, '特殊日', `${e.month}月${e.day}日 (纪念日)`))
  AM_OFF_EVENTS.forEach(e => addFixed(e.id, e.name, '特殊日', `${e.month}月${e.day}日 (上午休假)`))
  PM_OFF_EVENTS.forEach(e => addFixed(e.id, e.name, '特殊日', `${e.month}月${e.day}日 (下午休假)`))
  
  FULL_HOLIDAY_RANGES.forEach(e => addFixed(e.id, e.name, '假期', `${e.startMonth}.${e.startDay}-${e.endMonth}.${e.endDay}`))
  EXAM_WEEK_RANGES.forEach(e => addFixed(e.id, e.name, '全校性', `${e.startMonth}.${e.startDay}-${e.endMonth}.${e.endDay} (考试周)`))
  PM_OFF_RANGES.forEach(e => addFixed(e.id, e.name, '特殊日', `${e.startMonth}.${e.startDay}-${e.endMonth}.${e.endDay} (下午休假)`))
  
  VACATIONS.forEach(v => {
    // 假期可能没有ID，生成一个
    const id = `vacation_${v.name}`
    addFixed(id, v.name, '假期', `${v.startMonth}.${v.startDay}-${v.endMonth}.${v.endDay}`)
  })
}

const refreshData = () => {
  const libEvents = Array.from(gameStore.eventLibrary.values())
  const libEventIds = new Set(libEvents.map(e => e.id))
  
  // 合并固定事件（如果 Library 中没有）
  const allEvents = [...libEvents]
  for (const [id, fixed] of fixedEventMap) {
    if (!libEventIds.has(id)) {
      allEvents.push({
        id: fixed.id,
        name: fixed.name,
        type: fixed.type,
        duration: fixed.duration,
        description: fixed.description,
        condition: '',
        _isVirtual: true, // 标记为虚拟事件
        _fixedDesc: fixed.fixedDesc
      })
    }
  }
  
  events.value = allEvents
  triggers.value = gameStore.eventTriggers
}

const filteredEvents = computed(() => {
  if (!searchQuery.value) return events.value
  const query = searchQuery.value.toLowerCase()
  return events.value.filter(e => 
    e.name.toLowerCase().includes(query) || 
    e.id.toLowerCase().includes(query) ||
    (e.description && e.description.toLowerCase().includes(query))
  )
})

const selectEvent = (event) => {
  selectedEvent.value = event
  isEditing.value = false
  isNew.value = false
  showMobileList.value = false
  
  // 获取该事件的触发器
  const realTriggers = triggers.value.filter(t => t.eventId === event.id).map(t => ({...t}))
  
  // 如果是固定事件，添加虚拟触发器用于显示
  if (fixedEventMap.has(event.id)) {
    const fixed = fixedEventMap.get(event.id)
    realTriggers.unshift({
      type: 'fixed_date',
      condition: fixed.fixedDesc,
      weight: 100,
      eventId: event.id,
      _readonly: true
    })
  }
  
  // 处理已有的 fixed_date 触发器，确保 UI 字段正确
  realTriggers.forEach(t => {
    if (t.type === 'fixed_date' && !t._readonly) {
      // 尝试解析 condition "MM-DD"
      const match = t.condition.match(/^(\d{1,2})-(\d{1,2})$/)
      if (match) {
        t.month = parseInt(match[1])
        t.day = parseInt(match[2])
        t.isRecurring = true // 默认为 true，因为 condition 中没有年份
      } else {
        // 尝试解析带年份的
        const matchYear = t.condition.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
        if (matchYear) {
          t.year = parseInt(matchYear[1])
          t.month = parseInt(matchYear[2])
          t.day = parseInt(matchYear[3])
          t.isRecurring = false
        }
      }
    }
  })
  
  currentEventTriggers.value = realTriggers
}

const startEdit = () => {
  if (!selectedEvent.value) return
  formData.value = { ...selectedEvent.value }
  // 过滤掉只读的虚拟触发器
  currentEventTriggers.value = currentEventTriggers.value.filter(t => !t._readonly)
  isEditing.value = true
  isNew.value = false
}

const startNew = () => {
  const timestamp = Date.now().toString().slice(-4)
  const newId = `event_custom_${timestamp}`
  formData.value = {
    id: newId,
    name: '新事件',
    type: '个人',
    duration: 1,
    description: '',
    condition: ''
  }
  currentEventTriggers.value = [] // 新事件没有触发器
  selectedEvent.value = null
  isEditing.value = true
  isNew.value = true
  showMobileList.value = false
}

const addTrigger = () => {
  // 如果已经有 fixed_date 触发器，提示不能添加
  if (currentEventTriggers.value.some(t => t.type === 'fixed_date')) {
    alert('已存在固定日期触发器，无法添加其他触发器。')
    return
  }
  
  currentEventTriggers.value.push({
    type: 'variable',
    condition: '',
    weight: 10,
    eventId: formData.value.id
  })
}

const removeTrigger = (index) => {
  currentEventTriggers.value.splice(index, 1)
}

const onTriggerTypeChange = (trigger, index) => {
  if (trigger.type === 'fixed_date') {
    // 移除其他所有触发器
    if (currentEventTriggers.value.length > 1) {
      if (!confirm('选择固定日期将清空其他触发条件，是否继续？')) {
        trigger.type = 'variable' // 恢复默认
        return
      }
      currentEventTriggers.value = [trigger] // 只保留当前这个
    }
    // 初始化日期字段
    if (!trigger.month) trigger.month = 1
    if (!trigger.day) trigger.day = 1
    trigger.isRecurring = true
  }
}

const saveEvent = () => {
  if (!formData.value.id || !formData.value.name) {
    alert('ID和名称不能为空')
    return
  }

  const eventId = formData.value.id

  // 1. 更新 store 中的 eventLibrary
  const newEvent = { ...formData.value }
  // 移除临时字段
  delete newEvent._isVirtual
  delete newEvent._fixedDesc
  
  newEvent.duration = parseInt(newEvent.duration) || 1
  gameStore.eventLibrary.set(eventId, newEvent)
  
  // 2. 更新 store 中的 eventTriggers
  // 先移除该事件旧的所有触发器
  const otherTriggers = gameStore.eventTriggers.filter(t => t.eventId !== eventId && t.eventId !== selectedEvent.value?.id)
  
  // 准备新的触发器数据
  let hasFixedDate = false
  let fixedDateTrigger = null

  const newTriggers = currentEventTriggers.value.map(t => {
    const trigger = { ...t, eventId: eventId } // 确保ID一致
    
    // 处理不同类型的字段清理和格式化
    if (trigger.type === 'variable' || trigger.type === 'composite') {
      delete trigger.probability
      delete trigger.period
      delete trigger.category
      delete trigger.month
      delete trigger.day
      delete trigger.year
      delete trigger.isRecurring
    } else if (trigger.type === 'random') {
      delete trigger.condition
      delete trigger.month
      delete trigger.day
      delete trigger.year
      delete trigger.isRecurring
      trigger.probability = parseFloat(trigger.probability) || 0.1
    } else if (trigger.type === 'fixed_date') {
      hasFixedDate = true
      fixedDateTrigger = trigger
      // 构造条件字符串供 eventSystem 识别 (虽然 eventSystem 可能不直接用这个 condition，但保持格式一致)
      // 使用 MM-DD 格式
      const m = String(trigger.month).padStart(2, '0')
      const d = String(trigger.day).padStart(2, '0')
      if (trigger.isRecurring) {
        trigger.condition = `${m}-${d}`
      } else {
        const y = trigger.year || gameStore.gameTime.year
        trigger.condition = `${y}-${m}-${d}`
      }
      
      // 清理不需要存入 triggers 数组的临时 UI 字段 (month, day, year)
      // 但为了下次编辑方便，我们暂且不删，或者在 selectEvent 时重新解析
      // 这里为了纯净性，我们删除它们，依赖 condition 解析
      delete trigger.month
      delete trigger.day
      delete trigger.year
      delete trigger.isRecurring
      
      // 同时也清理其他类型的字段
      delete trigger.probability
      delete trigger.period
      delete trigger.category
    }
    
    // 移除只读标记（如果有）
    delete trigger._readonly
    return trigger
  })
  
  // 合并
  gameStore.eventTriggers = [...otherTriggers, ...newTriggers]
  
  // 3. 同步到日历 (如果存在固定日期触发器)
  const calendarEventId = `calendar_link_${eventId}`
  
  if (hasFixedDate && fixedDateTrigger) {
    // 查找是否已存在
    const existingIndex = gameStore.player.customCalendarEvents.findIndex(e => e.id === calendarEventId)
    
    const calendarEventData = {
      id: calendarEventId,
      name: newEvent.name,
      date: fixedDateTrigger.condition, // 使用 MM-DD 或 YYYY-MM-DD
      isRecurring: !fixedDateTrigger.condition.includes(gameStore.gameTime.year + '-'), // 简单判断: 如果不含当前年份则为循环? 不太严谨。直接看格式
      description: newEvent.description,
      createdAt: Date.now()
    }
    
    // 修正 isRecurring 判断: 如果长度为 5 (MM-DD) 则是 recurring
    if (fixedDateTrigger.condition.length === 5) {
      calendarEventData.isRecurring = true
    } else {
      calendarEventData.isRecurring = false
    }

    if (existingIndex !== -1) {
      // 更新
      gameStore.player.customCalendarEvents[existingIndex] = {
        ...gameStore.player.customCalendarEvents[existingIndex],
        ...calendarEventData
      }
    } else {
      // 新增
      gameStore.player.customCalendarEvents.push(calendarEventData)
    }
  } else {
    // 如果没有固定日期触发器，但之前有日历事件，则删除
    const existingIndex = gameStore.player.customCalendarEvents.findIndex(e => e.id === calendarEventId)
    if (existingIndex !== -1) {
      gameStore.player.customCalendarEvents.splice(existingIndex, 1)
    }
  }

  // 刷新列表
  refreshData()
  
  // 退出编辑模式
  // 重新获取对象以包含虚拟字段（如果是固定事件）
  const updatedEvent = events.value.find(e => e.id === eventId) || newEvent
  selectedEvent.value = updatedEvent
  selectEvent(updatedEvent) // 重新加载触发器显示
  isEditing.value = false
  isNew.value = false
  
  alert('事件已保存，固定日期事件已同步至日历')
}

const deleteEvent = () => {
  if (!selectedEvent.value) return
  if (!confirm(`确定要删除事件 "${selectedEvent.value.name}" 吗?`)) return
  
  const eventId = selectedEvent.value.id
  gameStore.eventLibrary.delete(eventId)
  // 删除相关触发器
  gameStore.eventTriggers = gameStore.eventTriggers.filter(t => t.eventId !== eventId)
  
  // 删除关联的日历事件
  const calendarEventId = `calendar_link_${eventId}`
  const calIndex = gameStore.player.customCalendarEvents.findIndex(e => e.id === calendarEventId)
  if (calIndex !== -1) {
    gameStore.player.customCalendarEvents.splice(calIndex, 1)
  }
  
  refreshData()
  selectedEvent.value = null
  isEditing.value = false
  showMobileList.value = true
}

const cancelEdit = () => {
  isEditing.value = false
  if (isNew.value) {
    showMobileList.value = true
    selectedEvent.value = null
  }
  isNew.value = false
}

const goBackToList = () => {
  showMobileList.value = true
  selectedEvent.value = null
  isEditing.value = false
}

// 辅助显示触发器描述
const getTriggerDesc = (trigger) => {
  if (trigger.type === 'variable') {
    return `变量条件: ${trigger.condition || '(空)'}`
  } else if (trigger.type === 'random') {
    return `随机: 概率 ${trigger.probability || 0.1}, ${periodLabels[trigger.period] || trigger.period}${trigger.category ? ', ' + trigger.category : ''}`
  } else if (trigger.type === 'composite') {
    return `复合条件: ${trigger.condition || '(空)'}`
  } else if (trigger.type === 'fixed_date') {
    return `[固定日程] ${trigger.condition}`
  }
  return '未知触发器'
}

// 事件统计
const eventStats = computed(() => {
  const total = events.value.length
  const virtual = events.value.filter(e => e._isVirtual).length
  const custom = total - virtual
  return { total, virtual, custom }
})
</script>

<template>
  <div class="event-editor-overlay" @click.self="$emit('close')">
    <div class="event-editor-panel">
      <div class="panel-header">
        <div class="header-left">
          <button 
            class="back-btn mobile-only" 
            v-if="!showMobileList"
            @click="goBackToList"
          >
            ← 返回
          </button>
          <span class="header-icon">📅</span>
          <h2>事件编辑器</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="panel-content">
        <!-- 左侧列表 -->
        <div class="event-list-sidebar" :class="{ 'mobile-hidden': !showMobileList }">
          <div class="search-bar">
            <span class="search-icon">🔍</span>
            <input 
              v-model="searchQuery" 
              placeholder="搜索事件..." 
              class="search-input" 
            />
            <button class="add-btn" @click="startNew" title="添加新事件">
              ➕
            </button>
          </div>
          
          <!-- 统计信息 -->
          <div class="stats-mini">
            <span class="stat-tag">
              <span class="stat-icon">📊</span>
              共 {{ eventStats.total }} 个
            </span>
            <span class="stat-tag custom">
              自定义 {{ eventStats.custom }}
            </span>
            <span class="stat-tag calendar">
              日历 {{ eventStats.virtual }}
            </span>
          </div>
          
          <div class="event-list">
            <div 
              v-for="event in filteredEvents" 
              :key="event.id" 
              class="event-item"
              :class="{ 
                active: selectedEvent && selectedEvent.id === event.id,
                virtual: event._isVirtual
              }"
              @click="selectEvent(event)"
            >
              <div class="event-item-header">
                <span class="event-icon">{{ eventTypeIcons[event.type] || '📌' }}</span>
                <span class="event-name">{{ event.name }}</span>
              </div>
              <div class="event-meta">
                <span class="event-type-tag">{{ event.type }}</span>
                <span v-if="event._isVirtual" class="virtual-tag">📆 日历</span>
              </div>
            </div>
            
            <div v-if="filteredEvents.length === 0" class="empty-list">
              <span class="empty-icon">🔎</span>
              <p>未找到事件</p>
            </div>
          </div>
        </div>
        
        <!-- 右侧详情/编辑 -->
        <div class="event-detail-area" :class="{ 'mobile-full': !showMobileList }">
          <div v-if="isEditing" class="edit-form">
            <div class="form-header">
              <h3>{{ isNew ? '➕ 新建事件' : '✏️ 编辑事件' }}</h3>
            </div>
            
            <div class="form-scroll">
              <div class="form-section">
                <div class="section-title">
                  <span class="section-icon">📝</span>
                  基本信息
                </div>
                
                <div class="form-row">
                  <label>
                    <span class="label-icon">🆔</span>
                    事件ID
                  </label>
                  <input 
                    v-model="formData.id" 
                    :disabled="!isNew" 
                    class="input-field" 
                    placeholder="event_xxx" 
                  />
                </div>
                
                <div class="form-row">
                  <label>
                    <span class="label-icon">📛</span>
                    名称
                  </label>
                  <input v-model="formData.name" class="input-field" />
                </div>
                
                <div class="form-row">
                  <label>
                    <span class="label-icon">🏷️</span>
                    类型
                  </label>
                  <select v-model="formData.type" class="input-field">
                    <option v-for="t in eventTypes" :key="t" :value="t">
                      {{ eventTypeIcons[t] }} {{ t }}
                    </option>
                  </select>
                </div>
                
                <div class="form-row">
                  <label>
                    <span class="label-icon">⏱️</span>
                    持续天数
                  </label>
                  <div class="input-with-hint">
                    <input type="number" v-model="formData.duration" class="input-field" />
                    <span class="hint">(-1 为怪谈类)</span>
                  </div>
                </div>
                
                <div class="form-row full-width">
                  <label>
                    <span class="label-icon">📄</span>
                    描述
                  </label>
                  <textarea 
                    v-model="formData.description" 
                    class="input-field textarea" 
                    rows="3"
                    placeholder="事件描述..."
                  ></textarea>
                </div>
              </div>

              <div class="form-section">
                <div class="section-header-row">
                  <div class="section-title">
                    <span class="section-icon">⚡</span>
                    触发器
                  </div>
                  <button class="add-trigger-btn" @click="addTrigger">
                    ➕ 添加
                  </button>
                </div>
                
                <div v-if="currentEventTriggers.length === 0" class="no-triggers">
                  <span class="empty-hint-icon">💡</span>
                  <span>暂无自定义触发器，点击上方按钮添加</span>
                </div>
                
                <div 
                  v-for="(trigger, idx) in currentEventTriggers" 
                  :key="idx" 
                  class="trigger-edit-card"
                >
                  <div class="trigger-card-header">
                    <span class="trigger-index">#{{ idx + 1 }}</span>
                    <button class="delete-trigger-btn" @click="removeTrigger(idx)">
                      🗑️
                    </button>
                  </div>
                  
                  <div class="trigger-form-grid">
                    <div class="form-row">
                      <label>类型</label>
                      <select v-model="trigger.type" class="input-field" @change="onTriggerTypeChange(trigger, idx)">
                        <option 
                          v-for="t in triggerTypes" 
                          :key="t" 
                          :value="t"
                        >
                          {{ triggerTypeLabels[t] }}
                        </option>
                      </select>
                    </div>
                    
                    <div class="form-row" v-if="trigger.type !== 'fixed_date'">
                      <label>权重</label>
                      <input type="number" v-model="trigger.weight" class="input-field" />
                    </div>
                  </div>

                  <!-- Variable / Composite 条件 -->
                  <div 
                    v-if="trigger.type === 'variable' || trigger.type === 'composite'" 
                    class="form-row full-width"
                  >
                    <label>条件表达式</label>
                    <input 
                      v-model="trigger.condition" 
                      class="input-field" 
                      :placeholder="trigger.type === 'variable' ? '变量>值' : '[type,val]&&[type,val]'" 
                    />
                  </div>

                  <!-- Random 参数 -->
                  <template v-if="trigger.type === 'random'">
                    <div class="trigger-form-grid">
                      <div class="form-row">
                        <label>概率 (0-1)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          v-model="trigger.probability" 
                          class="input-field" 
                        />
                      </div>
                      <div class="form-row">
                        <label>周期</label>
                        <select v-model="trigger.period" class="input-field">
                          <option v-for="p in periods" :key="p" :value="p">
                            {{ periodLabels[p] }}
                          </option>
                        </select>
                      </div>
                    </div>
                    <div class="form-row full-width">
                      <label>分类 (可选)</label>
                      <input 
                        v-model="trigger.category" 
                        class="input-field" 
                        placeholder="如: 传闻, 突发" 
                      />
                    </div>
                  </template>

                  <!-- Fixed Date 参数 -->
                  <template v-if="trigger.type === 'fixed_date'">
                    <div class="trigger-form-grid">
                      <div class="form-row">
                        <label>月</label>
                        <input 
                          type="number" 
                          min="1" max="12"
                          v-model="trigger.month" 
                          class="input-field" 
                        />
                      </div>
                      <div class="form-row">
                        <label>日</label>
                        <input 
                          type="number" 
                          min="1" max="31"
                          v-model="trigger.day" 
                          class="input-field" 
                        />
                      </div>
                    </div>
                    <div class="form-row">
                      <label class="checkbox-label">
                        <input type="checkbox" v-model="trigger.isRecurring" />
                        每年重复
                      </label>
                    </div>
                    <div class="hint-box">
                      ⚠️ 设为固定日期后，该事件将同步到日历系统中，且不可设置其他触发条件。
                    </div>
                  </template>
                </div>
              </div>
            </div>
            
            <div class="form-footer">
              <button class="cancel-btn" @click="cancelEdit">取消</button>
              <button class="save-btn" @click="saveEvent">
                💾 保存
              </button>
            </div>
          </div>
          
          <div v-else-if="selectedEvent" class="detail-view">
            <div class="detail-header">
              <div class="detail-title-row">
                <span class="detail-icon">{{ eventTypeIcons[selectedEvent.type] || '📌' }}</span>
                <h3>{{ selectedEvent.name }}</h3>
              </div>
              <div class="detail-actions">
                <button class="action-btn edit" @click="startEdit">
                  ✏️ 编辑
                </button>
                <button class="action-btn delete" @click="deleteEvent">
                  🗑️ 删除
                </button>
              </div>
            </div>
            
            <div class="detail-scroll">
              <div class="detail-card">
                <div class="detail-row">
                  <span class="detail-label">🆔 ID</span>
                  <span class="detail-value code">{{ selectedEvent.id }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">🏷️ 类型</span>
                  <span class="detail-value">
                    <span class="type-badge">{{ selectedEvent.type }}</span>
                  </span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">⏱️ 持续</span>
                  <span class="detail-value">
                    {{ selectedEvent.duration === -1 ? '持续性 (怪谈)' : selectedEvent.duration + ' 天' }}
                  </span>
                </div>
                <div v-if="selectedEvent.condition" class="detail-row">
                  <span class="detail-label">📋 旧版条件</span>
                  <span class="detail-value code">{{ selectedEvent.condition }}</span>
                </div>
              </div>
              
              <div class="detail-section">
                <div class="section-title">
                  <span class="section-icon">⚡</span>
                  触发器
                </div>
                <div v-if="currentEventTriggers.length > 0" class="triggers-list">
                  <div 
                    v-for="(t, idx) in currentEventTriggers" 
                    :key="idx" 
                    class="trigger-display-card" 
                    :class="{ readonly: t._readonly }"
                  >
                    <div class="trigger-header">
                      <span class="trigger-type-badge" :class="t.type">
                        {{ t.type === 'fixed_date' ? '📆 固定' : triggerTypeLabels[t.type] }}
                      </span>
                      <span v-if="t.weight && t.type !== 'fixed_date'" class="trigger-weight">
                        权重: {{ t.weight }}
                      </span>
                    </div>
                    <div class="trigger-content">{{ getTriggerDesc(t) }}</div>
                  </div>
                </div>
                <div v-else class="no-data">
                  <span class="empty-hint-icon">📭</span>
                  <span>无触发器</span>
                </div>
              </div>
              
              <div class="detail-section">
                <div class="section-title">
                  <span class="section-icon">📄</span>
                  描述
                </div>
                <div class="description-box">
                  {{ selectedEvent.description || '(无描述)' }}
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="empty-state">
            <div class="empty-content">
              <span class="empty-icon">📋</span>
              <p>请选择一个事件查看详情</p>
              <p class="empty-hint">或点击 ➕ 创建新事件</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 基础变量 */
.event-editor-overlay {
  --primary-color: #d32f2f;
  --primary-light: #ff6659;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --info-color: #2196f3;
  --bg-paper: #fdfbf3;
  --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.15);
  --shadow-strong: 0 8px 30px rgba(0, 0, 0, 0.25);
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
}

/* 遮罩层 */
.event-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 6000;
  backdrop-filter: blur(4px);
  padding: 10px;
  box-sizing: border-box;
}

/* 主面板 */
.event-editor-panel {
  background: linear-gradient(135deg, #fdfbf3 0%, #fff9e6 100%);
  width: 100%;
  max-width: 1000px;
  height: 90vh;
  max-height: 750px;
  border-radius: 16px;
  box-shadow: var(--shadow-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.panel-header .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 1.5rem;
}

.panel-header h2 {
  margin: 0;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.4rem;
  letter-spacing: 2px;
}

.back-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.mobile-only {
  display: none;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

/* 内容区 */
.panel-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧列表 */
.event-list-sidebar {
  width: 320px;
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.search-bar {
  padding: 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 8px;
  align-items: center;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 28px;
  font-size: 0.9rem;
  pointer-events: none;
}

.search-input {
  flex: 1;
  padding: 10px 12px 10px 36px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 0.95rem;
  transition: all var(--transition-fast);
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.add-btn {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--primary-color) 0%, #b71c1c 100%);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.add-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.4);
}

/* 统计信息 */
.stats-mini {
  padding: 10px 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.stat-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 15px;
  font-size: 0.8rem;
  background: #e0e0e0;
  color: #666;
}

.stat-tag.custom {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  color: #1976d2;
}

.stat-tag.calendar {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  color: #ef6c00;
}

.stat-icon {
  font-size: 0.9rem;
}

.event-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.event-item {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.event-item:hover {
  background: #f5f5f5;
}

.event-item.active {
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  border-left: 4px solid var(--primary-color);
}

.event-item.virtual {
  background: #fffaf0;
}

.event-item.virtual.active {
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border-left-color: #ef6c00;
}

.event-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.event-icon {
  font-size: 1.2rem;
}

.event-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: #333;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-type-tag {
  font-size: 0.75rem;
  background: #e0e0e0;
  padding: 2px 8px;
  border-radius: 10px;
  color: #666;
}

.virtual-tag {
  font-size: 0.7rem;
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  color: #ef6c00;
  padding: 2px 8px;
  border-radius: 10px;
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: #888;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 10px;
  opacity: 0.5;
}

/* 右侧详情区 */
.event-detail-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  overflow: hidden;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.empty-content {
  text-align: center;
  color: #888;
}

.empty-content .empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-hint {
  font-size: 0.9rem;
  color: #aaa;
  margin-top: 8px;
}

/* 详情视图 */
.detail-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  padding: 20px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-icon {
  font-size: 2rem;
}

.detail-header h3 {
  margin: 0;
  color: #333;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.6rem;
}

.detail-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.action-btn.edit {
  background: linear-gradient(135deg, var(--info-color) 0%, #1565c0 100%);
  color: white;
}

.action-btn.edit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

.action-btn.delete {
  background: white;
  color: #ef5350;
  border: 2px solid #ffcdd2;
}

.action-btn.delete:hover {
  background: #ffebee;
  border-color: #ef5350;
}

.detail-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px;
}

.detail-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  width: 100px;
  font-size: 0.9rem;
  color: #666;
  flex-shrink: 0;
}

.detail-value {
  flex: 1;
  color: #333;
  font-weight: 500;
}

.detail-value.code {
  font-family: 'Courier New', monospace;
  background: #f5f5f5;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  word-break: break-all;
}

.type-badge {
  display: inline-block;
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  color: var(--primary-color);
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 0.85rem;
}

.detail-section {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid #f0f0f0;
}

.section-icon {
  font-size: 1.1rem;
}

.triggers-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trigger-display-card {
  background: #f9f9f9;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e0e0e0;
}

.trigger-display-card.readonly {
  background: linear-gradient(135deg, #fff8e1 0%, #fff3e0 100%);
  border-color: #ffe0b2;
}

.trigger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.trigger-type-badge {
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 0.8rem;
  color: white;
  background: var(--info-color);
}

.trigger-type-badge.fixed_date {
  background: var(--warning-color);
}

.trigger-type-badge.random {
  background: #9c27b0;
}

.trigger-type-badge.composite {
  background: #00bcd4;
}

.trigger-weight {
  font-size: 0.8rem;
  color: #888;
  background: #e0e0e0;
  padding: 2px 10px;
  border-radius: 10px;
}

.trigger-content {
  font-size: 0.9rem;
  color: #555;
  word-break: break-all;
}

.description-box {
  background: #f9f9f9;
  padding: 16px;
  border-radius: 8px;
  color: #555;
  line-height: 1.6;
  white-space: pre-wrap;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #888;
  font-style: italic;
}

.empty-hint-icon {
  font-size: 1.2rem;
}

/* 编辑表单 */
.edit-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
}

.form-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff9c4 0%, #ffecb3 100%);
  border-bottom: 2px solid #ffd54f;
  flex-shrink: 0;
}

.form-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.form-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px;
}

.form-section {
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e0e0e0;
}

.add-trigger-btn {
  padding: 6px 14px;
  background: linear-gradient(135deg, var(--success-color) 0%, #388e3c 100%);
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
}

.add-trigger-btn:hover {
  transform: scale(1.05);
}

.form-row {
  margin-bottom: 16px;
}

.form-row.full-width {
  grid-column: 1 / -1;
}

.form-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 8px;
  font-weight: 500;
}

.label-icon {
  font-size: 0.95rem;
}

.input-field {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 0.95rem;
  transition: all var(--transition-fast);
  box-sizing: border-box;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.1);
}

.input-field:disabled {
  background: #f0f0f0;
  color: #888;
}

.textarea {
  resize: vertical;
  min-height: 80px;
}

.input-with-hint {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-with-hint .input-field {
  flex: 1;
}

.hint {
  font-size: 0.8rem;
  color: #888;
  white-space: nowrap;
}

.hint-box {
  margin-top: 10px;
  padding: 10px;
  background: #fff3e0;
  border: 1px solid #ffe0b2;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #ef6c00;
  line-height: 1.4;
}

.no-triggers {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #888;
  font-style: italic;
  background: white;
  border-radius: 8px;
  border: 2px dashed #e0e0e0;
}

.trigger-edit-card {
  background: white;
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 12px;
  border: 1px solid #e0e0e0;
}

.trigger-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e0e0e0;
}

.trigger-index {
  font-weight: 600;
  color: #888;
  font-size: 0.9rem;
}

.delete-trigger-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.delete-trigger-btn:hover {
  background: #ffebee;
}

.trigger-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 18px;
  height: 18px;
}

.form-footer {
  padding: 16px 20px;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.save-btn {
  padding: 12px 28px;
  background: linear-gradient(135deg, var(--success-color) 0%, #388e3c 100%);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.save-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
}

.cancel-btn {
  padding: 12px 24px;
  background: white;
  color: #666;
  border: 2px solid #ddd;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

/* 自定义滚动条 */
.event-list::-webkit-scrollbar,
.detail-scroll::-webkit-scrollbar,
.form-scroll::-webkit-scrollbar {
  width: 6px;
}

.event-list::-webkit-scrollbar-track,
.detail-scroll::-webkit-scrollbar-track,
.form-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.event-list::-webkit-scrollbar-thumb,
.detail-scroll::-webkit-scrollbar-thumb,
.form-scroll::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.event-list::-webkit-scrollbar-thumb:hover,
.detail-scroll::-webkit-scrollbar-thumb:hover,
.form-scroll::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .event-editor-panel {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .panel-header h2 {
    font-size: 1.2rem;
  }
  
  .mobile-only {
    display: block;
  }
  
  .event-list-sidebar {
    width: 100%;
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 10;
  }
  
  .event-list-sidebar.mobile-hidden {
    display: none;
  }
  
  .event-detail-area.mobile-full {
    width: 100%;
  }
  
  .panel-content {
    position: relative;
  }
  
  .detail-header {
    padding: 16px;
  }
  
  .detail-title-row {
    flex-wrap: wrap;
  }
  
  .detail-actions {
    width: 100%;
    margin-top: 12px;
  }
  
  .action-btn {
    flex: 1;
    justify-content: center;
  }
  
  .detail-scroll {
    padding: 16px;
  }
  
  .trigger-form-grid {
    grid-template-columns: 1fr;
  }
  
  .form-scroll {
    padding: 16px;
  }
  
  .input-with-hint {
    flex-direction: column;
    align-items: stretch;
  }
  
  .hint {
    margin-top: 4px;
  }
  
  .input-field {
    font-size: 16px; /* 防止 iOS 缩放 */
  }
}

/* 触摸设备优化 */
@media (hover: none) and (pointer: coarse) {
  .event-item,
  .action-btn,
  .add-btn,
  .save-btn,
  .cancel-btn {
    min-height: 48px;
  }
  
  .event-item {
    padding: 16px;
  }
  
  .search-input {
    font-size: 16px;
  }
}
</style>
