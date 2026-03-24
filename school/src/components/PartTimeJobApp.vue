<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { mapData, getItem } from '../data/mapData'
import { checkPartTimeJobEligibility, checkWorkTime } from '../utils/conditionChecker'
import { getErrorMessage } from '../utils/errorUtils'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// 工作计时器
let workTimer = null
const currentWorkTime = ref(0) // 当前工作时长（分钟）

// 获取所有有兼职的地点
const partTimeLocations = computed(() => {
  // 兼容 name 和 title 字段
  return mapData.filter(item => item.partTimeJob && (item.partTimeJob.name || item.partTimeJob.title))
})

// 当前兼职状态
const currentJob = computed(() => gameStore.player.partTimeJob?.currentJob)
const isWorking = computed(() => gameStore.player.partTimeJob?.isWorking)
const totalEarnings = computed(() => gameStore.player.partTimeJob?.totalEarnings || 0)

// 检查玩家是否在兼职地点
const isAtWorkLocation = computed(() => {
  if (!currentJob.value) return false
  return gameStore.player.location === currentJob.value
})

// 获取当前兼职信息
const currentJobInfo = computed(() => {
  if (!currentJob.value) return null
  const location = getItem(currentJob.value)
  if (!location || !location.partTimeJob) return null
  
  // 规范化数据结构，处理字段名不一致问题
  return {
    locationId: currentJob.value,
    locationName: location.name,
    name: location.partTimeJob.name || location.partTimeJob.title,
    wage: location.partTimeJob.wage || location.partTimeJob.salary,
    workTime: location.partTimeJob.workTime || location.openTime,
    ...location.partTimeJob
  }
})

// 检查是否在工作时间内
const isInWorkTime = computed(() => {
  if (!currentJobInfo.value) return false
  return checkWorkTime(currentJobInfo.value, gameStore.world.gameTime)
})

// 检查兼职申请资格
const checkEligibility = (jobData) => {
  return checkPartTimeJobEligibility(jobData, gameStore.player, gameStore.world.gameTime)
}

// 申请兼职
const applyForJob = async (locationId) => {
  const location = getItem(locationId)
  if (!location || !location.partTimeJob) return
  
  const eligibility = checkEligibility(location.partTimeJob)
  if (!eligibility.canApply) {
    alert(eligibility.reason)
    return
  }
  
  try {
    // 构造标准化的 jobData，确保字段名一致
    const jobData = {
      ...location.partTimeJob,
      name: location.partTimeJob.name || location.partTimeJob.title,
      wage: location.partTimeJob.wage || location.partTimeJob.salary,
      workTime: location.partTimeJob.workTime || location.openTime
    }
    
    await gameStore.applyForPartTimeJob(locationId, jobData)
    alert(`成功申请「${jobData.name}」兼职！`)
  } catch (e) {
    alert('申请失败: ' + getErrorMessage(e))
  }
}

// 辞职
const quitJob = async () => {
  if (!currentJob.value) return
  
  if (isWorking.value) {
    alert('正在工作中，请先结束工作再辞职')
    return
  }
  
  const confirmed = confirm('确定要辞去当前兼职吗？')
  if (!confirmed) return
  
  try {
    await gameStore.quitPartTimeJob()
    alert('已成功辞职')
  } catch (e) {
    alert('辞职失败: ' + getErrorMessage(e))
  }
}

// 开始工作
const startWork = async () => {
  if (!currentJob.value || !isAtWorkLocation.value) {
    alert('请先前往兼职地点')
    return
  }
  
  if (!isInWorkTime.value) {
    alert('当前不在工作时间内')
    return
  }
  
  try {
    await gameStore.startWorking()
    startWorkTimer()
  } catch (e) {
    alert('开始工作失败: ' + getErrorMessage(e))
  }
}

// 结束工作
const endWork = async () => {
  if (!isWorking.value) return
  
  try {
    stopWorkTimer()
    const result = await gameStore.endWorking(currentJobInfo.value)
    if (result.success && result.earnings !== undefined) {
      alert(`工作结束！本次获得 ¥${result.earnings.toFixed(2)}`)
    } else {
      alert(result.message || '工作结束')
    }
  } catch (e) {
    alert('结束工作失败: ' + getErrorMessage(e))
  }
}

// 工作计时器
const startWorkTimer = () => {
  if (workTimer) clearInterval(workTimer)
  updateWorkTime()
  workTimer = setInterval(updateWorkTime, 1000)
}

const stopWorkTimer = () => {
  if (workTimer) {
    clearInterval(workTimer)
    workTimer = null
  }
  currentWorkTime.value = 0
}

const updateWorkTime = () => {
  currentWorkTime.value = gameStore.getCurrentWorkDuration()
}

// 格式化工作时长
const formatWorkTime = (minutes) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

// 格式化时薪
const formatWage = (wage) => {
  let value = wage
  if (typeof wage === 'string') {
    value = parseFloat(wage.replace(/[^\d.]/g, ''))
  }
  if (isNaN(value)) value = 0
  return `¥${value}/小时`
}

// 获取位置名称
const getLocationName = (locationId) => {
  const location = getItem(locationId)
  return location ? location.name : locationId
}

onMounted(() => {
  if (isWorking.value) {
    startWorkTimer()
  }
})

onUnmounted(() => {
  stopWorkTimer()
})
</script>

<template>
  <div class="parttime-app" :class="{ 'dark-mode': gameStore.settings.darkMode }">
    <!-- 头部 -->
    <div class="app-header">
      <button class="back-btn" @click="$emit('close')">‹</button>
      <span class="header-title">兼职中心</span>
      <div class="header-spacer"></div>
    </div>

    <!-- 内容区 -->
    <div class="app-content">
      <!-- 当前兼职状态卡片 -->
      <div v-if="currentJobInfo" class="status-card">
        <div class="status-header">
          <span class="status-icon">💼</span>
          <span class="status-title">当前兼职</span>
        </div>
        <div class="status-body">
          <div class="job-info">
            <div class="job-name">{{ currentJobInfo.name }}</div>
            <div class="job-location">📍 {{ currentJobInfo.locationName }}</div>
            <div class="job-wage">{{ formatWage(currentJobInfo.wage) }}</div>
          </div>
          
          <!-- 工作中状态 -->
          <div v-if="isWorking" class="working-status">
            <div class="working-indicator">
              <span class="pulse-dot"></span>
              <span>工作中</span>
            </div>
            <div class="work-timer">
              已工作: {{ formatWorkTime(currentWorkTime) }}
            </div>
            <button class="action-btn danger" @click="endWork">
              结束工作
            </button>
          </div>
          
          <!-- 未工作状态 -->
          <div v-else class="idle-status">
            <div class="location-check">
              <span v-if="isAtWorkLocation" class="check-pass">✓ 已到达工作地点</span>
              <span v-else class="check-fail">✗ 未在工作地点</span>
            </div>
            <div class="time-check">
              <span v-if="isInWorkTime" class="check-pass">✓ 在工作时间内</span>
              <span v-else class="check-fail">✗ 不在工作时间</span>
            </div>
            <div class="action-buttons">
              <button 
                class="action-btn primary" 
                :disabled="!isAtWorkLocation || !isInWorkTime"
                @click="startWork"
              >
                开始工作
              </button>
              <button class="action-btn secondary" @click="quitJob">
                辞职
              </button>
            </div>
          </div>
        </div>
        
        <!-- 累计收入 -->
        <div class="earnings-info">
          <span>累计收入:</span>
          <span class="earnings-value">¥{{ totalEarnings.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 兼职列表 -->
      <div class="job-list-section">
        <h3 class="section-title">{{ currentJobInfo ? '其他兼职' : '可申请兼职' }}</h3>
        
        <div v-if="partTimeLocations.length === 0" class="empty-state">
          暂无可用兼职
        </div>
        
        <div 
          v-for="location in partTimeLocations" 
          :key="location.id"
          class="job-card"
          :class="{ 'current': currentJob === location.id }"
        >
          <div class="job-card-header">
            <span class="job-icon">{{ location.partTimeJob.icon || '💼' }}</span>
            <div class="job-card-title">
              <div class="job-name">{{ location.partTimeJob.name || location.partTimeJob.title }}</div>
              <div class="job-location-name">{{ location.name }}</div>
            </div>
            <div class="job-wage-badge">{{ formatWage(location.partTimeJob.wage || location.partTimeJob.salary) }}</div>
          </div>
          
          <div class="job-card-body">
            <div v-if="location.partTimeJob.description" class="job-desc">
              {{ location.partTimeJob.description }}
            </div>
            
            <div class="job-details">
              <div class="detail-item">
                <span class="detail-label">工作时间:</span>
                <span class="detail-value">{{ location.partTimeJob.workTime || location.openTime || '全天' }}</span>
              </div>
              <div v-if="location.partTimeJob.requirements" class="detail-item">
                <span class="detail-label">要求:</span>
                <span class="detail-value">{{ location.partTimeJob.requirements }}</span>
              </div>
            </div>
          </div>
          
          <div class="job-card-footer">
            <template v-if="currentJob === location.id">
              <span class="current-badge">当前兼职</span>
            </template>
            <template v-else-if="currentJob">
              <span class="unavailable-text">已有其他兼职</span>
            </template>
            <template v-else>
              <button 
                class="apply-btn"
                :class="{ 
                  'eligible': checkEligibility(location.partTimeJob).canApply,
                  'ineligible': !checkEligibility(location.partTimeJob).canApply
                }"
                :disabled="!checkEligibility(location.partTimeJob).canApply"
                @click="applyForJob(location.id)"
              >
                {{ checkEligibility(location.partTimeJob).canApply ? '申请' : checkEligibility(location.partTimeJob).reason }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.parttime-app {
  width: 100%;
  height: 100%;
  background: #f2f2f7;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 44px;
  background: linear-gradient(180deg, #ff9500 0%, #ff7f00 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #fff;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.header-spacer {
  width: 30px;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 状态卡片 */
.status-card {
  background: linear-gradient(135deg, #fff9e6 0%, #fff5d6 100%);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 20px;
  box-shadow: 0 2px 10px rgba(255, 149, 0, 0.15);
  border: 1px solid rgba(255, 149, 0, 0.2);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.status-icon {
  font-size: 24px;
}

.status-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.status-body {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
}

.job-info {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.job-info .job-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.job-info .job-location {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.job-info .job-wage {
  font-size: 15px;
  font-weight: 600;
  color: #ff9500;
}

/* 工作中状态 */
.working-status {
  text-align: center;
}

.working-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #34c759;
  margin-bottom: 8px;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  background: #34c759;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.work-timer {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin-bottom: 12px;
}

/* 未工作状态 */
.idle-status {
  text-align: center;
}

.location-check, .time-check {
  margin-bottom: 8px;
  font-size: 14px;
}

.check-pass {
  color: #34c759;
}

.check-fail {
  color: #ff3b30;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: linear-gradient(135deg, #ff9500 0%, #ff7f00 100%);
  color: #fff;
}

.action-btn.primary:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 149, 0, 0.3);
}

.action-btn.secondary {
  background: #e5e5ea;
  color: #333;
}

.action-btn.secondary:hover {
  background: #d1d1d6;
}

.action-btn.danger {
  background: linear-gradient(135deg, #ff3b30 0%, #ff453a 100%);
  color: #fff;
}

.action-btn.danger:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);
}

/* 累计收入 */
.earnings-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 149, 0, 0.3);
  font-size: 14px;
  color: #666;
}

.earnings-value {
  font-size: 18px;
  font-weight: 700;
  color: #ff9500;
}

/* 兼职列表 */
.job-list-section {
  margin-top: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #8e8e93;
  margin: 0 0 12px 4px;
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8e8e93;
  font-size: 14px;
}

/* 兼职卡片 */
.job-card {
  background: #fff;
  border-radius: 14px;
  margin-bottom: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: all 0.2s;
}

.job-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.job-card.current {
  border: 2px solid #ff9500;
  background: linear-gradient(180deg, #fff9e6 0%, #fff 100%);
}

.job-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.job-icon {
  font-size: 32px;
}

.job-card-title {
  flex: 1;
}

.job-card-title .job-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.job-card-title .job-location-name {
  font-size: 12px;
  color: #8e8e93;
  margin-top: 2px;
}

.job-wage-badge {
  background: linear-gradient(135deg, #fff3cd 0%, #ffe69c 100%);
  color: #856404;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.job-card-body {
  padding: 12px 16px;
}

.job-desc {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
  line-height: 1.5;
}

.job-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  font-size: 12px;
}

.detail-label {
  color: #8e8e93;
  min-width: 60px;
}

.detail-value {
  color: #333;
  flex: 1;
}

.job-card-footer {
  padding: 12px 16px;
  background: #fafafa;
  display: flex;
  justify-content: flex-end;
}

.current-badge {
  background: linear-gradient(135deg, #ff9500 0%, #ff7f00 100%);
  color: #fff;
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
}

.unavailable-text {
  color: #8e8e93;
  font-size: 13px;
  padding: 6px 16px;
}

.apply-btn {
  padding: 8px 24px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.apply-btn.eligible {
  background: linear-gradient(135deg, #34c759 0%, #30b94d 100%);
  color: #fff;
}

.apply-btn.eligible:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(52, 199, 89, 0.3);
}

.apply-btn.ineligible {
  background: #e5e5ea;
  color: #8e8e93;
  cursor: not-allowed;
  font-size: 12px;
  padding: 8px 12px;
}

/* 夜间模式适配 */
.dark-mode {
  background: #1c1c1e;
}

.dark-mode .app-header {
  background: linear-gradient(180deg, #ff9f0a 0%, #ff8c00 100%);
  border-bottom: 1px solid #2c2c2e;
}

.dark-mode .status-card {
  background: linear-gradient(135deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 1px solid #3a3a3c;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.dark-mode .status-title {
  color: #fff;
}

.dark-mode .status-icon {
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.dark-mode .status-body {
  background: #2c2c2e;
  border: 1px solid #3a3a3c;
}

.dark-mode .job-info {
  border-bottom: 1px solid #3a3a3c;
}

.dark-mode .job-info .job-name {
  color: #fff;
}

.dark-mode .job-info .job-location {
  color: #aeaeb2;
}

.dark-mode .work-timer {
  color: #fff;
}

.dark-mode .action-btn.secondary {
  background: #3a3a3c;
  color: #fff;
}

.dark-mode .action-btn.secondary:hover {
  background: #48484a;
}

.dark-mode .earnings-info {
  border-top: 1px dashed #3a3a3c;
  color: #8e8e93;
}

.dark-mode .section-title {
  color: #8e8e93;
}

.dark-mode .job-card {
  background: #2c2c2e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.dark-mode .job-card.current {
  background: linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 100%);
  border-color: #ff9f0a;
}

.dark-mode .job-card-header {
  border-bottom: 1px solid #3a3a3c;
}

.dark-mode .job-card-title .job-name {
  color: #fff;
}

.dark-mode .job-wage-badge {
  background: rgba(255, 159, 10, 0.2);
  color: #ff9f0a;
}

.dark-mode .job-desc {
  color: #aeaeb2;
}

.dark-mode .detail-value {
  color: #fff;
}

.dark-mode .job-card-footer {
  background: #3a3a3c;
}

.dark-mode .apply-btn.ineligible {
  background: #48484a;
  color: #636366;
}

.dark-mode .empty-state {
  color: #636366;
}
</style>
