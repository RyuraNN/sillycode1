<script setup>
/**
 * OriginApp.vue - 本源 APP
 * 显示当前游戏状态中的生效变量，允许玩家查看和修改
 * 修改后立即应用到当前轮次
 */

import { ref, reactive, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['close', 'variable-modified'])
const gameStore = useGameStore()

// 编辑中的数据（深拷贝当前状态）
const editData = reactive({
  // 基础属性
  money: 0,
  hp: 0,
  maxHp: 0,
  mp: 0,
  maxMp: 0,
  health: 0,
  level: 0,
  exp: 0,
  freePoints: 0,
  // 六维属性
  attributes: {
    iq: 0,
    eq: 0,
    physique: 0,
    flexibility: 0,
    charm: 0,
    mood: 0
  },
  // 潜力上限
  potentials: {
    iq: 0,
    eq: 0,
    physique: 0,
    flexibility: 0,
    charm: 0,
    mood: 0
  },
  // 学科
  subjects: {
    literature: 0,
    math: 0,
    english: 0,
    humanities: 0,
    sciences: 0,
    art: 0,
    sports: 0
  },
  // 技能
  skills: {
    programming: 0,
    painting: 0,
    guitar: 0,
    piano: 0,
    urbanLegend: 0,
    cooking: 0,
    hacking: 0,
    socialMedia: 0,
    photography: 0,
    videoEditing: 0
  },
  // 时间
  gameTime: {
    year: 2024,
    month: 4,
    day: 1,
    hour: 8,
    minute: 0,
    weekday: 'Monday'
  },
  // 位置
  location: ''
})

// 是否有未保存的修改
const hasChanges = ref(false)
// 显示保存成功提示
const showSaveSuccess = ref(false)
// 当前展开的分组
const expandedGroups = reactive({
  basic: true,
  attributes: false,
  potentials: false,
  subjects: false,
  skills: false,
  time: false,
  location: false
})

// 中文标签映射
const labels = {
  money: '金钱',
  hp: '生命值',
  maxHp: '生命上限',
  mp: '精力值',
  maxMp: '精力上限',
  health: '健康',
  level: '等级',
  exp: '经验',
  freePoints: '自由点数',
  // 属性
  iq: '智力',
  eq: '情商',
  physique: '体质',
  flexibility: '灵活',
  charm: '魅力',
  mood: '心境',
  // 学科
  literature: '语文',
  math: '数学',
  english: '英语',
  humanities: '人文',
  sciences: '理科',
  art: '艺术',
  sports: '体育',
  // 技能
  programming: '编程',
  painting: '绘画',
  guitar: '吉他',
  piano: '钢琴',
  urbanLegend: '都市传说',
  cooking: '烹饪',
  hacking: '黑客',
  socialMedia: '社交媒体',
  photography: '摄影',
  videoEditing: '视频剪辑',
  // 时间
  year: '年',
  month: '月',
  day: '日',
  hour: '时',
  minute: '分',
  weekday: '星期'
}

const weekdayOptions = [
  { value: 'Monday', label: '一' },
  { value: 'Tuesday', label: '二' },
  { value: 'Wednesday', label: '三' },
  { value: 'Thursday', label: '四' },
  { value: 'Friday', label: '五' },
  { value: 'Saturday', label: '六' },
  { value: 'Sunday', label: '日' }
]

// 初始化编辑数据
const loadCurrentState = () => {
  const p = gameStore.player
  const t = gameStore.gameTime

  editData.money = p.money
  editData.hp = p.hp
  editData.maxHp = p.maxHp
  editData.mp = p.mp
  editData.maxMp = p.maxMp
  editData.health = p.health
  editData.level = p.level
  editData.exp = p.exp
  editData.freePoints = p.freePoints

  Object.keys(editData.attributes).forEach(key => {
    editData.attributes[key] = p.attributes[key] ?? 0
  })
  Object.keys(editData.potentials).forEach(key => {
    editData.potentials[key] = p.potentials[key] ?? 0
  })
  Object.keys(editData.subjects).forEach(key => {
    editData.subjects[key] = p.subjects[key] ?? 0
  })
  Object.keys(editData.skills).forEach(key => {
    editData.skills[key] = p.skills[key] ?? 0
  })

  editData.gameTime.year = t.year
  editData.gameTime.month = t.month
  editData.gameTime.day = t.day
  editData.gameTime.hour = t.hour
  editData.gameTime.minute = t.minute
  editData.gameTime.weekday = t.weekday

  editData.location = p.location

  hasChanges.value = false
}

onMounted(() => {
  loadCurrentState()
})

// 标记有修改
const markChanged = () => {
  hasChanges.value = true
}

// 切换分组展开
const toggleGroup = (group) => {
  expandedGroups[group] = !expandedGroups[group]
}

// 收集变更并应用
const applyChanges = () => {
  const changes = []
  const p = gameStore.player
  const t = gameStore.gameTime

  // 基础属性
  const basicFields = ['money', 'hp', 'maxHp', 'mp', 'maxMp', 'health', 'level', 'exp', 'freePoints']
  basicFields.forEach(field => {
    const newVal = Number(editData[field])
    if (!isNaN(newVal) && newVal !== p[field]) {
      changes.push({ label: labels[field], oldValue: p[field], newValue: newVal })
      p[field] = newVal
    }
  })

  // 六维属性
  Object.keys(editData.attributes).forEach(key => {
    const newVal = Number(editData.attributes[key])
    if (!isNaN(newVal) && newVal !== p.attributes[key]) {
      changes.push({ label: labels[key], oldValue: p.attributes[key], newValue: newVal, diff: newVal - p.attributes[key] })
      p.attributes[key] = newVal
    }
  })

  // 潜力
  Object.keys(editData.potentials).forEach(key => {
    const newVal = Number(editData.potentials[key])
    if (!isNaN(newVal) && newVal !== p.potentials[key]) {
      changes.push({ label: labels[key] + '上限', oldValue: p.potentials[key], newValue: newVal, diff: newVal - p.potentials[key] })
      p.potentials[key] = newVal
    }
  })

  // 学科
  Object.keys(editData.subjects).forEach(key => {
    const newVal = Number(editData.subjects[key])
    if (!isNaN(newVal) && newVal !== p.subjects[key]) {
      changes.push({ label: labels[key], oldValue: p.subjects[key], newValue: newVal, diff: newVal - p.subjects[key] })
      p.subjects[key] = newVal
    }
  })

  // 技能
  Object.keys(editData.skills).forEach(key => {
    const newVal = Number(editData.skills[key])
    if (!isNaN(newVal) && newVal !== p.skills[key]) {
      changes.push({ label: labels[key], oldValue: p.skills[key], newValue: newVal, diff: newVal - p.skills[key] })
      p.skills[key] = newVal
    }
  })

  // 时间（直接 set，不走 advanceTime 以避免触发事件）
  const timeFields = ['year', 'month', 'day', 'hour', 'minute']
  timeFields.forEach(field => {
    const newVal = Number(editData.gameTime[field])
    if (!isNaN(newVal) && newVal !== t[field]) {
      changes.push({ label: labels[field], oldValue: t[field], newValue: newVal })
      t[field] = newVal
    }
  })
  if (editData.gameTime.weekday !== t.weekday) {
    changes.push({ label: '星期', oldValue: t.weekday, newValue: editData.gameTime.weekday })
    t.weekday = editData.gameTime.weekday
  }

  // 位置
  if (editData.location !== p.location) {
    changes.push({ label: '位置', oldValue: p.location, newValue: editData.location })
    p.location = editData.location
  }

  if (changes.length === 0) {
    hasChanges.value = false
    return
  }

  // 通知 GameMain 更新快照
  emit('variable-modified', changes)

  hasChanges.value = false
  showSaveSuccess.value = true
  setTimeout(() => {
    showSaveSuccess.value = false
  }, 1500)
}

// 重置到当前实际状态
const resetChanges = () => {
  loadCurrentState()
}

// 获取星期中文
const getWeekdayLabel = (value) => {
  const found = weekdayOptions.find(o => o.value === value)
  return found ? '星期' + found.label : value
}
</script>

<template>
  <div class="origin-app">
    <!-- 头部 -->
    <div class="origin-header">
      <button class="back-btn" @click="$emit('close')">‹</button>
      <span class="header-title">🔮 本源</span>
      <div class="header-spacer"></div>
    </div>

    <!-- 内容区域 -->
    <div class="origin-content">
      <!-- 说明卡片 -->
      <div class="info-card">
        <span class="info-icon">ℹ️</span>
        <span class="info-text">查看并修改当前状态变量。修改后点击底部确定按钮即时生效。</span>
      </div>

      <!-- 💰 基础属性 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('basic')">
          <span class="group-icon">💰</span>
          <span class="group-title">基础属性</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.basic }">▶</span>
        </div>
        <div v-if="expandedGroups.basic" class="group-body">
          <div class="var-row" v-for="field in ['money', 'hp', 'maxHp', 'mp', 'maxMp', 'health', 'level', 'exp', 'freePoints']" :key="field">
            <label class="var-label">{{ labels[field] }}</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData[field]"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- 🧠 六维属性 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('attributes')">
          <span class="group-icon">🧠</span>
          <span class="group-title">六维属性</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.attributes }">▶</span>
        </div>
        <div v-if="expandedGroups.attributes" class="group-body">
          <div class="var-row" v-for="key in Object.keys(editData.attributes)" :key="key">
            <label class="var-label">{{ labels[key] }}</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData.attributes[key]"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- 🎯 潜力上限 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('potentials')">
          <span class="group-icon">🎯</span>
          <span class="group-title">潜力上限</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.potentials }">▶</span>
        </div>
        <div v-if="expandedGroups.potentials" class="group-body">
          <div class="var-row" v-for="key in Object.keys(editData.potentials)" :key="key">
            <label class="var-label">{{ labels[key] }}上限</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData.potentials[key]"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- 📚 学科 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('subjects')">
          <span class="group-icon">📚</span>
          <span class="group-title">学科</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.subjects }">▶</span>
        </div>
        <div v-if="expandedGroups.subjects" class="group-body">
          <div class="var-row" v-for="key in Object.keys(editData.subjects)" :key="key">
            <label class="var-label">{{ labels[key] }}</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData.subjects[key]"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- 🛠 技能 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('skills')">
          <span class="group-icon">🛠</span>
          <span class="group-title">技能</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.skills }">▶</span>
        </div>
        <div v-if="expandedGroups.skills" class="group-body">
          <div class="var-row" v-for="key in Object.keys(editData.skills)" :key="key">
            <label class="var-label">{{ labels[key] }}</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData.skills[key]"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- ⏰ 时间 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('time')">
          <span class="group-icon">⏰</span>
          <span class="group-title">时间</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.time }">▶</span>
        </div>
        <div v-if="expandedGroups.time" class="group-body">
          <div class="var-row" v-for="field in ['year', 'month', 'day', 'hour', 'minute']" :key="field">
            <label class="var-label">{{ labels[field] }}</label>
            <input 
              type="number" 
              class="var-input" 
              v-model.number="editData.gameTime[field]"
              @input="markChanged"
            />
          </div>
          <div class="var-row">
            <label class="var-label">星期</label>
            <select class="var-select" v-model="editData.gameTime.weekday" @change="markChanged">
              <option v-for="opt in weekdayOptions" :key="opt.value" :value="opt.value">
                星期{{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- 📍 位置 -->
      <div class="var-group">
        <div class="group-header" @click="toggleGroup('location')">
          <span class="group-icon">📍</span>
          <span class="group-title">位置</span>
          <span class="group-arrow" :class="{ expanded: expandedGroups.location }">▶</span>
        </div>
        <div v-if="expandedGroups.location" class="group-body">
          <div class="var-row">
            <label class="var-label">位置ID</label>
            <input 
              type="text" 
              class="var-input text-input" 
              v-model="editData.location"
              @input="markChanged"
            />
          </div>
        </div>
      </div>

      <!-- 底部间距，避免被按钮遮挡 -->
      <div class="bottom-spacer"></div>
    </div>

    <!-- 底部操作栏 -->
    <div class="origin-footer">
      <button class="footer-btn reset-btn" @click="resetChanges" :disabled="!hasChanges">
        重置
      </button>
      <button class="footer-btn apply-btn" @click="applyChanges" :disabled="!hasChanges">
        ✅ 确定
      </button>
    </div>

    <!-- 保存成功提示 -->
    <transition name="toast">
      <div v-if="showSaveSuccess" class="save-toast">
        ✅ 变量已更新
      </div>
    </transition>
  </div>
</template>

<style scoped>
.origin-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f2f2f7;
  position: relative;
  overflow: hidden;
}

/* 头部 */
.origin-header {
  height: 44px;
  background: rgba(237, 237, 237, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  z-index: 10;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #007aff;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: #000;
}

.header-spacer {
  width: 30px;
}

/* 内容区域 */
.origin-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 12px 0;
  overscroll-behavior: contain;
}

/* 信息卡片 */
.info-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(0, 122, 255, 0.08);
  border: 1px solid rgba(0, 122, 255, 0.15);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.info-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.info-text {
  font-size: 12px;
  color: #555;
  line-height: 1.4;
}

/* 变量分组 */
.var-group {
  background: #fff;
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.group-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}

.group-header:active {
  background: rgba(0, 0, 0, 0.03);
}

.group-icon {
  font-size: 18px;
  margin-right: 8px;
  flex-shrink: 0;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #000;
  flex: 1;
}

.group-arrow {
  font-size: 10px;
  color: #c7c7cc;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

.group-body {
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
  padding: 4px 0;
}

/* 变量行 */
.var-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  min-height: 36px;
}

.var-row + .var-row {
  border-top: 0.5px solid rgba(0, 0, 0, 0.05);
}

.var-label {
  font-size: 14px;
  color: #333;
  flex-shrink: 0;
  min-width: 70px;
}

.var-input {
  width: 100px;
  padding: 6px 10px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #f9f9fb;
  font-size: 14px;
  text-align: right;
  color: #333;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
  transition: border-color 0.2s;
}

.var-input:focus {
  border-color: #007aff;
  background: #fff;
}

.var-input.text-input {
  width: 140px;
  text-align: left;
  font-size: 12px;
  font-family: monospace;
}

.var-select {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #f9f9fb;
  font-size: 14px;
  color: #333;
  box-sizing: border-box;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  text-align: right;
  text-align-last: right;
}

.var-select:focus {
  border-color: #007aff;
}

/* 底部间距 */
.bottom-spacer {
  height: 70px;
}

/* 底部操作栏 */
.origin-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(242, 242, 247, 0.95);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-top: 0.5px solid rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.footer-btn {
  flex: 1;
  padding: 12px 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.footer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.reset-btn {
  background: #e5e5ea;
  color: #333;
}

.apply-btn {
  background: linear-gradient(135deg, #6B46C1 0%, #9F7AEA 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(107, 70, 193, 0.3);
}

.apply-btn:active:not(:disabled) {
  box-shadow: 0 1px 4px rgba(107, 70, 193, 0.3);
}

/* 保存成功提示 */
.save-toast {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
}

.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .origin-content {
    padding: 10px 10px 0;
  }

  .var-label {
    font-size: 13px;
    min-width: 60px;
  }

  .var-input {
    width: 90px;
    font-size: 13px;
    padding: 5px 8px;
  }

  .var-input.text-input {
    width: 120px;
    font-size: 11px;
  }

  .var-select {
    width: 90px;
    font-size: 13px;
  }

  .footer-btn {
    padding: 10px 0;
    font-size: 14px;
  }
}

/* 输入框数字箭头隐藏（更干净的UI） */
.var-input[type="number"]::-webkit-inner-spin-button,
.var-input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.var-input[type="number"] {
  -moz-appearance: textfield;
}
</style>
