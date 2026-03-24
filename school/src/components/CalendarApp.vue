<template>
  <div class="calendar-app">
    <!-- 头部 -->
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonth">◀</button>
      <div class="month-display">
        <span class="year">{{ currentYear }}年</span>
        <span class="month">{{ currentMonth }}月</span>
      </div>
      <button class="nav-btn" @click="nextMonth">▶</button>
    </div>

    <!-- 星期标题 -->
    <div class="weekday-row">
      <div v-for="day in weekdays" :key="day" class="weekday-cell">{{ day }}</div>
    </div>

    <!-- 日历网格 -->
    <div class="calendar-grid">
      <div
        v-for="(cell, index) in calendarCells"
        :key="index"
        class="calendar-cell"
        :class="{
          'other-month': cell.isOtherMonth,
          'today': cell.isToday,
          'weekend': cell.isWeekend && cell.holidayType !== 'exam',
          'holiday': cell.isHoliday,
          'exam-day': cell.holidayType === 'exam',
          'has-event': cell.eventInfo || cell.hasCustomEvent,
          'selected': selectedDate === cell.fullDate
        }"
        @click="selectDate(cell)"
      >
        <span class="day-number">{{ cell.day }}</span>
        <div v-if="cell.eventInfo" class="event-dot" :class="getEventClass(cell)"></div>
        <div v-if="cell.hasCustomEvent" class="custom-event-dot"></div>
      </div>
    </div>

    <!-- 事件详情 -->
    <div class="event-detail" v-if="selectedEvent">
      <div class="event-date">{{ selectedEvent.displayDate }}</div>
      <div class="event-status" :class="selectedEvent.statusClass">
        {{ selectedEvent.statusText }}
      </div>
      <div v-if="selectedEvent.eventName" class="event-name">
        🎉 {{ selectedEvent.eventName }}
      </div>
      <!-- 自定义事件列表 -->
      <div v-if="selectedEvent.customEvents && selectedEvent.customEvents.length > 0" class="custom-events">
        <div v-for="evt in selectedEvent.customEvents" :key="evt.id" class="custom-event-item">
          <span class="custom-event-name">📌 {{ evt.name }}</span>
          <button class="delete-event-btn" @click="deleteCustomEvent(evt.id)">×</button>
        </div>
      </div>
      <div v-if="selectedEvent.schedule && selectedEvent.schedule.length > 0" class="event-schedule">
        <div class="schedule-title">📚 今日课程：</div>
        <div v-for="(cls, idx) in selectedEvent.schedule" :key="idx" class="schedule-item">
          <span class="time">{{ cls.start }}-{{ cls.end }}</span>
          <span class="subject">{{ cls.subject }}</span>
          <span class="location">@ {{ cls.location }}</span>
        </div>
      </div>
      <!-- 添加事件按钮 -->
      <button class="add-event-btn" @click="showAddEventModal = true">+ 添加事件</button>
    </div>

    <!-- 图例 -->
    <div class="legend">
      <div class="legend-item">
        <span class="dot holiday-dot"></span>
        <span>休假日</span>
      </div>
      <div class="legend-item">
        <span class="dot exam-dot"></span>
        <span>考试日</span>
      </div>
      <div class="legend-item">
        <span class="dot special-dot"></span>
        <span>特殊活动</span>
      </div>
      <div class="legend-item">
        <span class="dot custom-dot"></span>
        <span>自定义</span>
      </div>
    </div>

    <!-- 添加事件模态框 -->
    <div v-if="showAddEventModal" class="modal-overlay" @click.self="showAddEventModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <span>添加事件</span>
          <button class="modal-close" @click="showAddEventModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>日期</label>
            <input type="text" :value="newEventDate" disabled class="form-input" />
          </div>
          <div class="form-group">
            <label>事件名称</label>
            <input 
              type="text" 
              v-model="newEventName" 
              placeholder="输入事件名称" 
              class="form-input"
              maxlength="20"
            />
          </div>
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="newEventRecurring" />
              每年重复
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" @click="showAddEventModal = false">取消</button>
          <button class="modal-btn confirm" @click="addCustomEvent" :disabled="!newEventName.trim()">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import {
  checkDayStatus,
  isWeekend,
  getWeekdayEnglish,
  getWeekdayChinese
} from '../utils/scheduleGenerator'

const gameStore = useGameStore()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

// 当前显示的年月
const displayYear = ref(2024)
const displayMonth = ref(4)
const selectedDate = ref('')

// 添加事件相关
const showAddEventModal = ref(false)
const newEventName = ref('')
const newEventRecurring = ref(false)

// 计算新事件日期字符串
const newEventDate = computed(() => {
  if (!selectedDate.value) return ''
  const parts = selectedDate.value.split('-')
  return `${parts[0]}年${parts[1]}月${parts[2]}日`
})

// 初始化为游戏时间
onMounted(() => {
  displayYear.value = gameStore.world.gameTime.year
  displayMonth.value = gameStore.world.gameTime.month
})

const currentYear = computed(() => displayYear.value)
const currentMonth = computed(() => displayMonth.value)

// 计算日历单元格
const calendarCells = computed(() => {
  const cells = []
  const year = displayYear.value
  const month = displayMonth.value
  
  // 获取本月第一天是星期几
  const firstDay = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDay.getDay()
  
  // 获取本月天数
  const daysInMonth = new Date(year, month, 0).getDate()
  
  // 获取上月天数
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()
  
  // 获取今天的日期
  const today = {
    year: gameStore.world.gameTime.year,
    month: gameStore.world.gameTime.month,
    day: gameStore.world.gameTime.day
  }
  
  // 填充上月日期
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    cells.push({
      day,
      month: prevMonth,
      year: prevYear,
      fullDate: `${prevYear}-${prevMonth}-${day}`,
      isOtherMonth: true,
      isWeekend: false,
      isToday: false,
      isHoliday: false,
      eventInfo: null,
      hasCustomEvent: false
    })
  }
  
  // 填充本月日期
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const weekdayIndex = date.getDay()
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayIndex]
    const isWeekendDay = weekdayIndex === 0 || weekdayIndex === 6
    const dayStatus = checkDayStatus(month, day, year)
    
    // 检查是否有自定义事件
    const customEvents = gameStore.getCustomEventsForDate(year, month, day)
    
    cells.push({
      day,
      month,
      year,
      fullDate: `${year}-${month}-${day}`,
      weekday,
      isOtherMonth: false,
      isWeekend: isWeekendDay,
      isToday: today.year === year && today.month === month && today.day === day,
      isHoliday: dayStatus.isHoliday,
      holidayType: dayStatus.holidayType,
      eventInfo: dayStatus.eventInfo,
      hasCustomEvent: customEvents.length > 0
    })
  }
  
  // 填充下月日期（填满6行）
  const remaining = 42 - cells.length
  for (let day = 1; day <= remaining; day++) {
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    cells.push({
      day,
      month: nextMonth,
      year: nextYear,
      fullDate: `${nextYear}-${nextMonth}-${day}`,
      isOtherMonth: true,
      isWeekend: false,
      isToday: false,
      isHoliday: false,
      eventInfo: null,
      hasCustomEvent: false
    })
  }
  
  return cells
})

// 选中的事件详情
const selectedEvent = computed(() => {
  if (!selectedDate.value) return null
  
  const cell = calendarCells.value.find(c => c.fullDate === selectedDate.value)
  if (!cell || cell.isOtherMonth) return null
  
  const weekdayCN = getWeekdayChinese(cell.weekday)
  
  let statusText = ''
  let statusClass = ''
  
  if (cell.holidayType === 'exam') {
    statusText = '全天考试'
    statusClass = 'status-exam'
  } else if (cell.isWeekend && cell.holidayType !== 'exam') {
    statusText = '周末休息'
    statusClass = 'status-weekend'
  } else if (cell.isHoliday) {
    statusText = '全天休假'
    statusClass = 'status-holiday'
  } else if (cell.holidayType === 'am_off') {
    statusText = '上午休假'
    statusClass = 'status-partial'
  } else if (cell.holidayType === 'pm_off') {
    statusText = '下午休假'
    statusClass = 'status-partial'
  } else {
    statusText = '正常上课'
    statusClass = 'status-normal'
  }
  
  // 获取当天课表（考试周除外）
  let schedule = []
  if (!cell.isWeekend && !cell.isHoliday && cell.holidayType !== 'exam' && gameStore.player.schedule) {
    const weekdayEn = getWeekdayEnglish(cell.weekday)
    const daySchedule = gameStore.player.schedule[weekdayEn]
    if (daySchedule) {
      schedule = daySchedule.filter(c => !c.isEmpty)
      // 过滤部分休假
      if (cell.holidayType === 'am_off') {
        schedule = schedule.filter(c => c.type !== 'morning')
      } else if (cell.holidayType === 'pm_off') {
        schedule = schedule.filter(c => c.type !== 'afternoon')
      }
    }
  }

  // 获取自定义事件
  const customEvents = gameStore.getCustomEventsForDate(cell.year, cell.month, cell.day)
  
  return {
    displayDate: `${cell.month}月${cell.day}日 ${weekdayCN}`,
    statusText,
    statusClass,
    eventName: cell.eventInfo?.name || null,
    schedule,
    customEvents
  }
})

function getEventClass(cell) {
  if (cell.isHoliday) return 'holiday-dot'
  if (cell.holidayType === 'am_off' || cell.holidayType === 'pm_off') return 'partial-dot'
  if (cell.eventInfo?.isSpecial) return 'special-dot'
  return 'event-dot-default'
}

function prevMonth() {
  if (displayMonth.value === 1) {
    displayMonth.value = 12
    displayYear.value--
  } else {
    displayMonth.value--
  }
  selectedDate.value = ''
}

function nextMonth() {
  if (displayMonth.value === 12) {
    displayMonth.value = 1
    displayYear.value++
  } else {
    displayMonth.value++
  }
  selectedDate.value = ''
}

function selectDate(cell) {
  if (cell.isOtherMonth) return
  selectedDate.value = cell.fullDate
}

// 添加自定义事件
function addCustomEvent() {
  if (!newEventName.value.trim() || !selectedDate.value) return
  
  const parts = selectedDate.value.split('-')
  const dateStr = newEventRecurring.value 
    ? `${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
    : `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  
  gameStore.addCalendarEvent({
    date: dateStr,
    name: newEventName.value.trim(),
    isRecurring: newEventRecurring.value
  })
  
  // 重置表单
  newEventName.value = ''
  newEventRecurring.value = false
  showAddEventModal.value = false
}

// 删除自定义事件
function deleteCustomEvent(eventId) {
  gameStore.removeCalendarEvent(eventId)
}
</script>

<style scoped>
.calendar-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px;
  box-sizing: border-box;
  position: relative;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.month-display {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.year {
  font-size: 12px;
  opacity: 0.8;
}

.month {
  font-size: 20px;
  font-weight: bold;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.weekday-cell {
  text-align: center;
  font-size: 12px;
  opacity: 0.8;
  padding: 4px 0;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  flex: 1;
  min-height: 0;
}

.calendar-cell {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  min-height: 28px;
}

.calendar-cell:hover {
  background: rgba(255, 255, 255, 0.2);
}

.calendar-cell.other-month {
  opacity: 0.3;
  cursor: default;
}

.calendar-cell.today {
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px white;
}

.calendar-cell.weekend {
  background: rgba(100, 149, 237, 0.3);
}

.calendar-cell.holiday {
  background: rgba(255, 99, 71, 0.4);
}

.calendar-cell.exam-day {
  background: rgba(155, 89, 182, 0.4);
}

.calendar-cell.selected {
  background: rgba(255, 255, 255, 0.5);
  transform: scale(1.05);
}

.day-number {
  font-size: 12px;
  font-weight: 500;
}

.event-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-70%);
}

.custom-event-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(30%);
  background: #4ade80;
}

.holiday-dot {
  background: #ff6b6b;
}

.special-dot {
  background: #ffd93d;
}

.partial-dot {
  background: #ff9f43;
}

.event-dot-default {
  background: #54a0ff;
}

.event-detail {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 10px;
  margin-top: 8px;
  font-size: 12px;
}

.event-date {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.event-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-bottom: 6px;
}

.status-normal {
  background: #27ae60;
}

.status-weekend {
  background: #3498db;
}

.status-holiday {
  background: #e74c3c;
}

.status-partial {
  background: #f39c12;
}

.status-exam {
  background: #9b59b6;
}

.event-name {
  margin-top: 4px;
  font-size: 13px;
}

.custom-events {
  margin-top: 6px;
}

.custom-event-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(74, 222, 128, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.custom-event-name {
  font-size: 12px;
}

.delete-event-btn {
  background: rgba(255, 255, 255, 0.3);
  border: none;
  color: white;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.delete-event-btn:hover {
  background: rgba(255, 99, 71, 0.6);
}

.event-schedule {
  margin-top: 8px;
  max-height: 60px;
  overflow-y: auto;
}

.schedule-title {
  font-weight: bold;
  margin-bottom: 4px;
}

.schedule-item {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
}

.schedule-item .time {
  color: #ffd93d;
  min-width: 70px;
}

.schedule-item .subject {
  flex: 1;
}

.schedule-item .location {
  opacity: 0.8;
  font-size: 10px;
}

.add-event-btn {
  width: 100%;
  margin-top: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px dashed rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.add-event-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.legend {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 10px;
  opacity: 0.8;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.exam-dot {
  background: #9b59b6;
}

.custom-dot {
  background: #4ade80;
}

/* 模态框样式 */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 85%;
  max-width: 280px;
  color: #333;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
}

.modal-close {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.modal-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.form-input:disabled {
  background: #f5f5f5;
  color: #999;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.modal-footer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}

.modal-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-btn.cancel {
  background: #eee;
  color: #666;
}

.modal-btn.confirm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.modal-btn:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
