<template>
  <div class="weather-app" :class="{ 'dark-mode': gameStore.settings.darkMode }" :style="{ background: backgroundGradient }">
    <div class="scroll-container">
      <!-- 头部 - 当前天气 -->
      <div class="weather-header">
        <div class="current-weather">
          <div class="weather-icon-large">{{ currentWeather.icon }}</div>
          <div class="weather-info">
            <div class="temperature">{{ currentWeather.temperature }}°</div>
            <div class="weather-name">{{ currentWeather.weatherName }}</div>
            <div class="temp-range">
              <span class="high">↑{{ currentWeather.tempHigh }}°</span>
              <span class="low">↓{{ currentWeather.tempLow }}°</span>
            </div>
          </div>
        </div>
        <div class="location-info">
          <span class="location-icon">📍</span>
          <span class="location-name">天华学园</span>
        </div>
        <div class="season-tag" :class="seasonClass">{{ seasonName }}</div>
      </div>

      <!-- 逐时预报（从当前时间开始，合并多天） -->
      <div v-if="combinedHourlyForecast.length > 0" class="hourly-section">
        <div class="section-title">
          <span class="title-icon">🕐</span>
          逐时预报
        </div>
        <div 
          class="hourly-scroll" 
          ref="hourlyScrollRef"
          @mousedown="startDrag"
          @mouseleave="stopDrag"
          @mouseup="stopDrag"
          @mousemove="doDrag"
        >
          <div 
            v-for="(hour, idx) in combinedHourlyForecast" 
            :key="idx" 
            class="hourly-item"
            :class="{ 
              'current-hour': hour.isCurrent,
              'next-day': hour.isNextDay
            }"
          >
            <div class="hour-time">{{ hour.displayTime }}</div>
            <div class="hour-icon">{{ hour.icon }}</div>
            <div class="hour-temp">{{ hour.temp }}°</div>
            <div v-if="hour.isNextDay && hour.showDayLabel" class="day-label">{{ hour.dayLabel }}</div>
          </div>
        </div>
      </div>

      <!-- 7天预报 -->
      <div class="forecast-section">
        <div class="section-title">
          <span class="title-icon">📅</span>
          7天预报
        </div>
        <div class="forecast-list">
          <div 
            v-for="(day, idx) in forecast" 
            :key="day.date" 
            class="forecast-item"
            :class="{ 'today': idx === 0, 'tomorrow': idx === 1, 'has-detail': idx < 2 }"
            @click="selectDay(idx)"
          >
            <div class="day-info">
              <span class="day-name">{{ getDayLabel(idx, day) }}</span>
              <span class="day-date">{{ day.date }}</span>
            </div>
            <!-- 温度条放在中间 -->
            <div class="day-temps">
              <span class="temp-low">{{ day.tempLow }}°</span>
              <span class="temp-bar">
                <span 
                  class="temp-fill" 
                  :style="getTempBarStyle(day.tempLow, day.tempHigh)"
                ></span>
              </span>
              <span class="temp-high">{{ day.tempHigh }}°</span>
            </div>

            <!-- 天气图标和文字放在右边 -->
            <div class="weather-group">
              <div class="day-icon">{{ day.icon }}</div>
              <div class="day-weather">{{ day.weatherName }}</div>
            </div>
            
            <div v-if="idx < 2" class="detail-arrow">›</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 详细信息弹窗（美化版） -->
    <transition name="slide-up">
      <div v-if="selectedDayIndex !== null && selectedDayHourly.length > 0" class="detail-modal">
        <div class="detail-header">
          <button class="close-btn" @click="selectedDayIndex = null">
            <span>✕</span>
          </button>
          <div class="detail-title-area">
            <span class="detail-icon">{{ forecast[selectedDayIndex]?.icon }}</span>
            <div class="detail-title-text">
              <span class="detail-title">{{ selectedDayLabel }}</span>
              <span class="detail-subtitle">{{ forecast[selectedDayIndex]?.weatherName }}</span>
            </div>
          </div>
          <div class="detail-temp-summary">
            <span class="summary-high">{{ forecast[selectedDayIndex]?.tempHigh }}°</span>
            <span class="summary-divider">/</span>
            <span class="summary-low">{{ forecast[selectedDayIndex]?.tempLow }}°</span>
          </div>
        </div>
        <div class="detail-content">
          <div class="hourly-detail-scroll">
            <div 
              v-for="(hour, idx) in selectedDayHourly" 
              :key="idx"
              class="hourly-detail-card"
              :class="{ 'current': isCurrentHourInDetail(hour.time) }"
            >
              <div class="card-time">{{ formatDetailTime(hour.time) }}</div>
              <div class="card-icon">{{ hour.icon }}</div>
              <div class="card-weather">{{ hour.weatherName }}</div>
              <div class="card-temp">{{ hour.temp }}°</div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { getWeatherGradient, SEASONS } from '../utils/weatherGenerator'

const gameStore = useGameStore()
const selectedDayIndex = ref(null)
const hourlyScrollRef = ref(null)

// 鼠标拖拽相关状态
const isDragging = ref(false)
const startX = ref(0)
const scrollLeft = ref(0)

// 初始化天气数据
onMounted(() => {
  // 确保天气数据已初始化
  if (gameStore.worldState.weather.forecast.length === 0) {
    gameStore.updateWeatherForecast()
  }
  // 更新当前时刻天气
  gameStore.updateCurrentWeather()
})

// 当前天气
const currentWeather = computed(() => {
  return gameStore.worldState.weather.current
})

// 7天预报
const forecast = computed(() => {
  return gameStore.worldState.weather.forecast
})

// 合并的逐时预报（从当前时间开始，隐藏过去的，接续后面的天数）
const combinedHourlyForecast = computed(() => {
  const result = []
  const currentHour = gameStore.gameTime.hour
  const currentTimePoint = Math.floor(currentHour / 2) * 2
  
  // 处理今天剩余的时间段
  if (forecast.value.length > 0 && forecast.value[0].hourly) {
    const todayHourly = forecast.value[0].hourly
    let isFirst = true
    
    for (const hour of todayHourly) {
      const hourNum = parseInt(hour.time.split(':')[0])
      // 只显示当前及之后的时间段
      if (hourNum >= currentTimePoint) {
        result.push({
          ...hour,
          displayTime: formatHourTime(hour.time),
          isCurrent: hourNum === currentTimePoint,
          isNextDay: false,
          dayLabel: '',
          showDayLabel: false
        })
        isFirst = false
      }
    }
  }
  
  // 添加明天的时间段
  if (forecast.value.length > 1 && forecast.value[1].hourly) {
    const tomorrowHourly = forecast.value[1].hourly
    let showLabel = true
    
    for (const hour of tomorrowHourly) {
      result.push({
        ...hour,
        displayTime: formatHourTime(hour.time),
        isCurrent: false,
        isNextDay: true,
        dayLabel: '明天',
        showDayLabel: showLabel
      })
      showLabel = false
    }
  }
  
  // 如果还需要更多，添加后天的部分
  if (result.length < 16 && forecast.value.length > 2 && forecast.value[2].hourly) {
    const dayAfterHourly = forecast.value[2].hourly
    let showLabel = true
    
    for (const hour of dayAfterHourly) {
      if (result.length >= 24) break // 最多24个时间点
      result.push({
        ...hour,
        displayTime: formatHourTime(hour.time),
        isCurrent: false,
        isNextDay: true,
        dayLabel: '后天',
        showDayLabel: showLabel
      })
      showLabel = false
    }
  }
  
  return result
})

// 选中日的每两小时预报
const selectedDayHourly = computed(() => {
  if (selectedDayIndex.value === null || 
      selectedDayIndex.value >= forecast.value.length ||
      !forecast.value[selectedDayIndex.value].hourly) {
    return []
  }
  return forecast.value[selectedDayIndex.value].hourly
})

// 选中日标签
const selectedDayLabel = computed(() => {
  if (selectedDayIndex.value === null) return ''
  if (selectedDayIndex.value === 0) return '今天'
  if (selectedDayIndex.value === 1) return '明天'
  return forecast.value[selectedDayIndex.value]?.weekday || ''
})

// 当前季节
const seasonClass = computed(() => {
  return gameStore.worldState.weather.season || 'spring'
})

const seasonName = computed(() => {
  const season = gameStore.worldState.weather.season
  const seasonData = SEASONS[season]
  return seasonData?.name || '春季'
})

// 背景渐变
const backgroundGradient = computed(() => {
  return getWeatherGradient(currentWeather.value.weather)
})

// 获取日期标签
function getDayLabel(idx, day) {
  if (idx === 0) return '今天'
  if (idx === 1) return '明天'
  return day.weekday
}

// 格式化小时时间
function formatHourTime(timeStr) {
  if (!timeStr) return ''
  const hour = parseInt(timeStr.split(':')[0])
  if (hour === 0) return '0时'
  if (hour < 12) return `${hour}时`
  if (hour === 12) return '12时'
  return `${hour}时`
}

// 格式化详情时间
function formatDetailTime(timeStr) {
  if (!timeStr) return ''
  const hour = parseInt(timeStr.split(':')[0])
  if (hour === 0) return '凌晨 0:00'
  if (hour === 2) return '凌晨 2:00'
  if (hour === 4) return '凌晨 4:00'
  if (hour === 6) return '早晨 6:00'
  if (hour === 8) return '上午 8:00'
  if (hour === 10) return '上午 10:00'
  if (hour === 12) return '中午 12:00'
  if (hour === 14) return '下午 14:00'
  if (hour === 16) return '下午 16:00'
  if (hour === 18) return '傍晚 18:00'
  if (hour === 20) return '晚间 20:00'
  if (hour === 22) return '夜间 22:00'
  return `${hour}:00`
}

// 检查是否是当前小时（详情页用）
function isCurrentHourInDetail(timeStr) {
  if (selectedDayIndex.value !== 0) return false
  if (!timeStr) return false
  const hour = parseInt(timeStr.split(':')[0])
  const currentHour = gameStore.gameTime.hour
  const timePoint = Math.floor(currentHour / 2) * 2
  return hour === timePoint
}

// 获取温度条样式
function getTempBarStyle(low, high) {
  // 计算在预报中的相对位置
  let minTemp = 100, maxTemp = -100
  for (const day of forecast.value) {
    if (day.tempLow < minTemp) minTemp = day.tempLow
    if (day.tempHigh > maxTemp) maxTemp = day.tempHigh
  }
  
  const range = maxTemp - minTemp || 1
  const leftPercent = ((low - minTemp) / range) * 100
  const widthPercent = ((high - low) / range) * 100
  
  return {
    left: `${leftPercent}%`,
    width: `${Math.max(widthPercent, 10)}%`
  }
}

// 选择某天查看详情
function selectDay(idx) {
  // 只有前2天有详细数据
  if (idx < 2 && forecast.value[idx]?.hourly) {
    selectedDayIndex.value = idx
  }
}

// 鼠标拖拽处理
function startDrag(e) {
  isDragging.value = true
  startX.value = e.pageX - hourlyScrollRef.value.offsetLeft
  scrollLeft.value = hourlyScrollRef.value.scrollLeft
}

function stopDrag() {
  isDragging.value = false
}

function doDrag(e) {
  if (!isDragging.value) return
  e.preventDefault()
  const x = e.pageX - hourlyScrollRef.value.offsetLeft
  const walk = (x - startX.value) * 2 // 滚动速度
  hourlyScrollRef.value.scrollLeft = scrollLeft.value - walk
}
</script>

<style scoped>
.weather-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: white;
  box-sizing: border-box;
  position: relative;
  overflow: hidden; /* 防止整体滚动 */
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scroll-container::-webkit-scrollbar {
  display: none;
}

/* 头部 */
.weather-header {
  text-align: center;
  margin-bottom: 20px;
  position: relative;
  padding: 20px 16px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.current-weather {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.weather-icon-large {
  font-size: 72px;
  text-shadow: 0 6px 20px rgba(0,0,0,0.4);
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.4));
  animation: gentle-float 3s ease-in-out infinite;
}

@keyframes gentle-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.weather-info {
  text-align: left;
}

.temperature {
  font-size: 60px;
  font-weight: 100;
  line-height: 1;
  text-shadow: 0 4px 16px rgba(0,0,0,0.3);
  letter-spacing: -3px;
  background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.75) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.weather-name {
  font-size: 17px;
  opacity: 0.95;
  margin-top: 8px;
  font-weight: 500;
  letter-spacing: 2px;
}

.temp-range {
  display: flex;
  gap: 16px;
  font-size: 14px;
  opacity: 0.9;
  margin-top: 8px;
}

.temp-range .high {
  color: #ffb3b3;
  font-weight: 500;
}

.temp-range .low {
  color: #b3d4ff;
  font-weight: 500;
}

.location-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
  opacity: 0.85;
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.location-icon {
  font-size: 14px;
}

.season-tag {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.season-tag.spring { 
  background: rgba(144, 238, 144, 0.3); 
  color: #c8ffc8;
  border-color: rgba(144, 238, 144, 0.4);
}
.season-tag.summer { 
  background: rgba(255, 165, 0, 0.3); 
  color: #ffe0a0;
  border-color: rgba(255, 165, 0, 0.4);
}
.season-tag.autumn { 
  background: rgba(210, 105, 30, 0.3); 
  color: #ffc080;
  border-color: rgba(210, 105, 30, 0.4);
}
.season-tag.winter { 
  background: rgba(135, 206, 235, 0.3); 
  color: #c0e8ff;
  border-color: rgba(135, 206, 235, 0.4);
}

/* 逐时预报 */
.hourly-section {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.title-icon {
  font-size: 16px;
}

.hourly-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
  cursor: grab; /* 添加抓手光标 */
  user-select: none;
}

.hourly-scroll:active {
  cursor: grabbing; /* 抓取时变为抓紧光标 */
}

.hourly-scroll::-webkit-scrollbar {
  display: none;
}

.hourly-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
  padding: 12px 8px;
  border-radius: 18px;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  position: relative;
  margin-top: 20px; /* 增加顶部间距，为标签留出更多空间 */
}

.hourly-item.current-hour {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.15);
}

.hourly-item.next-day {
  opacity: 0.85;
}

.hour-time {
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 8px;
  white-space: nowrap;
  font-weight: 500;
}

.hour-icon {
  font-size: 24px;
  margin-bottom: 8px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.hour-temp {
  font-size: 15px;
  font-weight: 600;
}

.day-label {
  position: absolute;
  top: -22px; /* 调整位置，避免溢出 */
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 8px;
  white-space: nowrap;
  font-weight: 600;
  z-index: 1;
}

/* 7天预报 */
.forecast-section {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 16px;
  flex: 1;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.forecast-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.forecast-item {
  display: grid;
  grid-template-columns: 70px 1fr 50px 20px; /* 调整列宽：日期 温度条 天气组合 箭头 */
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  transition: all 0.3s ease;
  position: relative;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
}

.forecast-item.has-detail {
  cursor: pointer;
}

.forecast-item.has-detail:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.forecast-item.today {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.day-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.day-name {
  font-size: 14px;
  font-weight: 600;
}

.day-date {
  font-size: 11px;
  opacity: 0.6;
}

.weather-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.day-icon {
  font-size: 24px;
  text-align: center;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  line-height: 1;
}

.day-weather {
  font-size: 11px;
  opacity: 0.85;
  text-align: center;
  white-space: nowrap;
}

.day-temps {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0; /* 允许缩小 */
  overflow: hidden; /* 防止溢出 */
}

.temp-high {
  font-size: 14px;
  font-weight: 600;
  width: 24px;
  text-align: left;
  color: #ffcccc;
}

.temp-low {
  font-size: 14px;
  opacity: 0.75;
  width: 24px;
  text-align: right;
  color: #cce5ff;
}

.temp-bar {
  flex: 1;
  height: 5px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  position: relative;
  min-width: 30px;
}

.temp-fill {
  position: absolute;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #74b9ff 0%, #fd79a8 100%);
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(253, 121, 168, 0.4);
}

.detail-arrow {
  font-size: 20px;
  opacity: 0.5;
  font-weight: 300;
  transition: all 0.3s;
}

.forecast-item.has-detail:hover .detail-arrow {
  opacity: 1;
  transform: translateX(4px);
}

/* 详情弹窗（美化版） */
.detail-modal {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, rgba(25, 25, 40, 0.98) 0%, rgba(15, 15, 30, 0.99) 100%);
  border-radius: 28px 28px 0 0;
  max-height: 65%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100; /* 确保在最上层 */
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255, 255, 255, 0.03);
}

.close-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255,255,255,0.2);
  transform: scale(1.05);
}

.detail-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-icon {
  font-size: 36px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}

.detail-title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}

.detail-subtitle {
  font-size: 13px;
  opacity: 0.7;
}

.detail-temp-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 18px;
  font-weight: 600;
}

.summary-high {
  color: #ffb3b3;
}

.summary-divider {
  opacity: 0.4;
}

.summary-low {
  color: #b3d4ff;
  opacity: 0.8;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.detail-content::-webkit-scrollbar {
  display: none;
}

.hourly-detail-scroll {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.hourly-detail-card {
  background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.3s ease;
}

.hourly-detail-card.current {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.2) 100%);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);
}

.hourly-detail-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.15);
}

.card-time {
  font-size: 11px;
  opacity: 0.75;
  margin-bottom: 10px;
  font-weight: 500;
}

.card-icon {
  font-size: 32px;
  margin-bottom: 8px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}

.card-weather {
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 8px;
}

.card-temp {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.8) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* ==================== 夜间模式 ==================== */
.dark-mode {
  /* 夜间模式下调整一些颜色的亮度 */
}

.dark-mode .weather-header {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .hourly-section,
.dark-mode .forecast-section {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(99, 102, 241, 0.15);
}

.dark-mode .hourly-item {
  background: rgba(0, 0, 0, 0.15);
}

.dark-mode .hourly-item.current-hour {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.5);
}

.dark-mode .forecast-item {
  background: rgba(0, 0, 0, 0.1);
}

.dark-mode .forecast-item.today {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.25);
}

.dark-mode .forecast-item.has-detail:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.3);
}

.dark-mode .detail-modal {
  background: linear-gradient(180deg, rgba(15, 15, 35, 0.99) 0%, rgba(10, 10, 25, 1) 100%);
  border-top-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .detail-header {
  background: rgba(99, 102, 241, 0.08);
}

.dark-mode .close-btn {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.25);
}

.dark-mode .close-btn:hover {
  background: rgba(99, 102, 241, 0.3);
}

.dark-mode .hourly-detail-card {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
  border-color: rgba(99, 102, 241, 0.15);
}

.dark-mode .hourly-detail-card.current {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.35) 0%, rgba(139, 92, 246, 0.25) 100%);
  border-color: rgba(99, 102, 241, 0.5);
}

.dark-mode .location-info {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.2);
}

.dark-mode .day-label {
  background: rgba(99, 102, 241, 0.3);
}
</style>
