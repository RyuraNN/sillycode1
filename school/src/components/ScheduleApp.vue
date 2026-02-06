<template>
  <div class="schedule-app" :class="{ 'vacation-mode': isVacation && activeTab === 'schedule' }">
    <!-- 头部 -->
    <div class="schedule-header">
      <div class="header-title">
        <span class="app-logo">🏫</span>
        <span class="app-name">天华通</span>
      </div>
      <div class="header-subtitle">{{ getHeaderSubtitle }}</div>
    </div>

    <!-- 标签页导航 -->
    <div class="tab-nav">
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        <span class="tab-icon">📅</span>
        <span class="tab-label">课表</span>
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'clubs' }"
        @click="activeTab = 'clubs'"
      >
        <span class="tab-icon">🎭</span>
        <span class="tab-label">社团</span>
        <span v-if="joinedClubsCount > 0" class="tab-badge">{{ joinedClubsCount }}</span>
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'forum' }"
        @click="activeTab = 'forum'"
      >
        <span class="tab-icon">📝</span>
        <span class="tab-label">论坛</span>
        <span v-if="pendingForumCount > 0" class="tab-badge">{{ pendingForumCount }}</span>
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'profile' }"
        @click="activeTab = 'profile'"
      >
        <span class="tab-icon">🆔</span>
        <span class="tab-label">档案</span>
      </div>
    </div>

    <!-- 课表标签页内容 -->
    <div v-if="activeTab === 'schedule'" class="tab-content">
      <!-- 假期模式 -->
      <div v-if="isVacation" class="vacation-overlay">
        <div class="vacation-content">
          <div class="vacation-icon">🌴</div>
          <div class="vacation-title">{{ vacationName }}</div>
          <div class="vacation-text">假期中，无课程安排</div>
          <div class="vacation-hint">好好休息，享受假期吧！</div>
        </div>
      </div>

      <!-- 课表网格 -->
      <div v-else class="schedule-table-container">
        <table class="schedule-table">
          <!-- 表头：星期 -->
          <thead>
            <tr>
              <th class="period-header">节次</th>
              <th v-for="day in weekdays" :key="day.en" class="day-header" :class="{ 'today': isToday(day.en) }">
                <div class="day-name">{{ day.cn }}</div>
              </th>
            </tr>
          </thead>
          <!-- 表体：课程 -->
          <tbody>
            <tr v-for="period in periods" :key="period.period" class="period-row">
              <td class="period-cell">
                <div class="period-num">{{ period.period }}</div>
                <div class="period-time">{{ period.start }}</div>
                <div class="period-time">{{ period.end }}</div>
              </td>
              <td 
                v-for="day in weekdays" 
                :key="day.en + '-' + period.period" 
                class="class-cell"
                :class="{ 
                  'today': isToday(day.en),
                  'empty': isEmptySlot(day.en, period.period),
                  'current': isCurrentClass(day.en, period.period)
                }"
              >
                <template v-if="!isEmptySlot(day.en, period.period)">
                  <div class="class-subject">{{ getClassInfo(day.en, period.period)?.subject }}</div>
                  <div class="class-location">{{ getClassInfo(day.en, period.period)?.location }}</div>
                </template>
                <template v-else>
                  <div class="empty-slot">-</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部信息 -->
      <div class="schedule-footer">
        <div class="class-info">
          <span class="label">班级：</span>
          <span class="value">{{ playerClass || '未分配' }}</span>
        </div>
        <div class="week-info" v-if="!isVacation">
          <span class="label">{{ termName }} </span>
          <span class="value">第 {{ weekNumber }} 周</span>
        </div>
        <div class="week-info vacation-tag" v-else>
          <span class="value">🌴 假期中</span>
        </div>
      </div>

      <!-- 选修课选择器 -->
      <ElectiveCourseSelector v-if="playerClass && !isVacation" />

      <!-- 无课表提示（非假期时） -->
      <div v-if="!hasSchedule && !isVacation" class="no-schedule">
        <div class="no-schedule-icon">📚</div>
        <div class="no-schedule-text">暂无课表数据</div>
        <div class="no-schedule-hint">请先在游戏中分配班级</div>
      </div>
    </div>

    <!-- 社团标签页内容 -->
    <div v-if="activeTab === 'clubs'" class="tab-content clubs-content">
      <!-- 我的社团 -->
      <div v-if="joinedClubsCount > 0" class="my-clubs-section">
        <div class="section-title">
          <span class="section-icon">⭐</span>
          <span>我的社团</span>
        </div>
        <div class="club-cards">
          <div 
            v-for="club in joinedClubs" 
            :key="club.id" 
            class="club-card joined"
            @click="selectedClub = club"
          >
            <div class="club-icon">🎭</div>
            <div class="club-info">
              <div class="club-name">{{ club.name }}</div>
              <div class="club-meta">
                <span class="member-count">{{ club.members?.length || 0 }}人</span>
                <span class="activity-day">{{ club.activityDay }}</span>
              </div>
            </div>
            <div class="club-badge joined-badge">已加入</div>
          </div>
        </div>
      </div>

      <!-- 社团列表 -->
      <div class="clubs-list-section">
        <div class="section-title">
          <span class="section-icon">📋</span>
          <span>{{ joinedClubsCount > 0 ? '其他社团' : '社团列表' }}</span>
        </div>
        
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <div>加载中...</div>
        </div>

        <div v-else-if="availableClubs.length === 0" class="empty-state">
          <div class="empty-icon">🎭</div>
          <div class="empty-text">暂无可加入的社团</div>
        </div>

        <div v-else class="club-cards">
          <div 
            v-for="club in availableClubs" 
            :key="club.id" 
            class="club-card"
            :class="{ 'disabled': !canJoinClub(club.id) }"
            @click="selectedClub = club"
          >
            <div class="club-icon">🎭</div>
            <div class="club-info">
              <div class="club-name">{{ club.name }}</div>
              <div class="club-meta">
                <span class="member-count">{{ club.members?.length || 0 }}人</span>
                <span class="activity-day">{{ club.activityDay }}</span>
              </div>
              <div class="club-desc">{{ truncate(club.description, 30) }}</div>
            </div>
            <div class="club-action">
              <button 
                v-if="canJoinClub(club.id)"
                class="join-btn"
                @click.stop="handleJoinClub(club.id)"
              >
                申请加入
              </button>
              <span v-else class="disabled-hint">需邀请</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 社团详情弹窗 -->
      <div v-if="selectedClub" class="club-detail-modal" @click.self="selectedClub = null">
        <div class="club-detail-content">
          <div class="detail-header">
            <div class="detail-icon">🎭</div>
            <div class="detail-title">{{ selectedClub.name }}</div>
            <button class="close-btn" @click="selectedClub = null">×</button>
          </div>
          
          <div class="detail-body">
            <div class="detail-row">
              <span class="detail-label">指导老师</span>
              <span class="detail-value">{{ selectedClub.advisor || '无' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">部长</span>
              <span class="detail-value">{{ selectedClub.president || '无' }}</span>
            </div>
            <div class="detail-row" v-if="selectedClub.vicePresident">
              <span class="detail-label">副部长</span>
              <span class="detail-value">{{ selectedClub.vicePresident }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">核心技能</span>
              <span class="detail-value">{{ selectedClub.coreSkill || '无' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">活动日</span>
              <span class="detail-value">{{ selectedClub.activityDay || '未定' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">活动地点</span>
              <span class="detail-value">{{ selectedClub.location || '未定' }}</span>
            </div>
            <div class="detail-row full">
              <span class="detail-label">社团介绍</span>
              <div class="detail-desc">{{ selectedClub.description || '暂无介绍' }}</div>
            </div>
            <div class="detail-row full">
              <span class="detail-label">现有成员 ({{ selectedClub.members?.length || 0 }}人)</span>
              <div class="member-list">
                <span v-for="member in selectedClub.members" :key="member" class="member-tag">
                  {{ member }}
                </span>
                <span v-if="!selectedClub.members?.length" class="no-members">暂无成员</span>
              </div>
            </div>
          </div>

          <div class="detail-footer">
            <template v-if="isClubMember(selectedClub.id)">
              <div class="joined-status">✅ 你已是该社团成员</div>
              <div class="leave-hint">退出社团需通过剧情进行</div>
            </template>
            <template v-else-if="isApplyingTo(selectedClub.id)">
              <div class="applying-status">
                <div class="status-text">⏳ 申请审核中...</div>
                <div class="status-hint">社长正在审核您的申请，请继续进行剧情对话。</div>
                <div class="status-timer">剩余有效期: {{ gameStore.clubApplication.remainingTurns }} 回合</div>
              </div>
            </template>
            <template v-else-if="canJoinClub(selectedClub.id)">
              <button class="apply-btn" @click="handleJoinClub(selectedClub.id)">
                申请加入
              </button>
            </template>
            <template v-else>
              <div class="cannot-join">
                <div class="cannot-join-icon">🔒</div>
                <div class="cannot-join-text">
                  <span v-if="gameStore.clubApplication">正在申请其他社团，暂无法同时申请</span>
                  <span v-else>你已加入其他社团，只能通过成员邀请加入更多社团</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 拒绝通知弹窗 -->
      <div v-if="gameStore.clubRejection" class="rejection-modal" @click.self="gameStore.confirmClubRejection()">
        <div class="rejection-content">
          <div class="rejection-icon">❌</div>
          <div class="rejection-title">申请被拒绝</div>
          <div class="rejection-info">
            <div class="rejection-club">{{ gameStore.clubRejection.clubName }}</div>
            <div class="rejection-from">来自: {{ gameStore.clubRejection.from }}</div>
          </div>
          <div class="rejection-reason">
            "{{ gameStore.clubRejection.reason }}"
          </div>
          <button class="confirm-btn" @click="gameStore.confirmClubRejection()">
            确定
          </button>
        </div>
      </div>

      <!-- 操作提示 -->
      <div v-if="actionMessage" class="action-message" :class="actionMessage.type">
        {{ actionMessage.text }}
      </div>
    </div>

    <!-- 论坛标签页内容 -->
    <div v-if="activeTab === 'forum'" class="tab-content forum-content">
      <ForumApp />
    </div>

    <!-- 档案标签页内容 -->
    <div v-if="activeTab === 'profile'" class="tab-content profile-content">
      <!-- 学生证 -->
      <div class="student-id-card">
        <div class="card-header">
          <div class="school-logo">🏫</div>
          <div class="school-name-text">天华高级中学</div>
          <div class="card-title">学生证</div>
        </div>
        <div class="card-body">
          <div class="student-photo">
            <img :src="gameStore.player.avatar" alt="头像">
          </div>
          <div class="student-info">
            <div class="info-row">
              <span class="info-label">姓名</span>
              <span class="info-value">{{ gameStore.player.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">班级</span>
              <span class="info-value">{{ gameStore.player.classId || '未分配' }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">学号</span>
              <span class="info-value">{{ studentId }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">入学年份</span>
              <span class="info-value">{{ gameStore.gameTime.year }}</span>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <div class="barcode">|| | ||| | || |||| |||</div>
          <div class="card-hint">此证仅限本人使用</div>
        </div>
      </div>

      <!-- 技能列表 -->
      <div class="skills-section">
        <div class="section-title">
          <span class="section-icon">📚</span>
          <span>学科技能</span>
        </div>
        <div class="skills-grid">
          <div v-for="(level, key) in gameStore.player.subjects" :key="key" class="skill-item">
            <div class="skill-header">
              <span class="skill-name">{{ subjectNames[key] || key }}</span>
              <span class="skill-level">Lv.{{ level }}</span>
            </div>
            <div class="skill-progress-bg">
              <div 
                class="skill-progress-bar subject-bar" 
                :style="{ width: `${gameStore.player.subjectExps[key] || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div class="skills-section">
        <div class="section-title">
          <span class="section-icon">🎨</span>
          <span>职业技能</span>
        </div>
        <div class="skills-grid">
          <div v-for="(level, key) in gameStore.player.skills" :key="key" class="skill-item">
            <div class="skill-header">
              <span class="skill-name">{{ skillNames[key] || key }}</span>
              <span class="skill-level">Lv.{{ level }}</span>
            </div>
            <div class="skill-progress-bg">
              <div 
                class="skill-progress-bar skill-bar" 
                :style="{ width: `${gameStore.player.skillExps[key] || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { TIME_SLOTS, getWeekdayEnglish, getTermInfo } from '../utils/scheduleGenerator'
import ForumApp from './ForumApp.vue'
import ElectiveCourseSelector from './ElectiveCourseSelector.vue'

const gameStore = useGameStore()

// 标签页状态
const activeTab = ref('schedule')
const loading = ref(false)
const selectedClub = ref(null)
const actionMessage = ref(null)

// 星期配置
const weekdays = [
  { en: 'Monday', cn: '周一' },
  { en: 'Tuesday', cn: '周二' },
  { en: 'Wednesday', cn: '周三' },
  { en: 'Thursday', cn: '周四' },
  { en: 'Friday', cn: '周五' }
]

// 节次配置（来自 scheduleGenerator）
const periods = TIME_SLOTS.map(slot => ({
  period: slot.period,
  start: slot.start,
  end: slot.end,
  type: slot.type
}))

// 获取学期信息
const termInfo = computed(() => {
  const { year, month, day } = gameStore.gameTime
  return getTermInfo(year, month, day)
})

// 是否在假期中
const isVacation = computed(() => termInfo.value.isVacation)

// 假期名称
const vacationName = computed(() => termInfo.value.vacationName || '假期')

// 是否有课表
const hasSchedule = computed(() => {
  if (isVacation.value) return false
  return gameStore.player.schedule && Object.keys(gameStore.player.schedule).length > 0
})

// 玩家班级
const playerClass = computed(() => gameStore.player.classId)

// 当前周数
const weekNumber = computed(() => termInfo.value.weekNumber)

// 学期名称
const termName = computed(() => termInfo.value.termName || '')

// 头部副标题
const getHeaderSubtitle = computed(() => {
  if (activeTab.value === 'schedule') {
    return isVacation.value ? vacationName.value : '本周课表'
  } else if (activeTab.value === 'clubs') {
    return '社团活动'
  } else if (activeTab.value === 'forum') {
    return '校园论坛'
  } else if (activeTab.value === 'profile') {
    return '个人档案'
  } else {
    return ''
  }
})

// 学生证号（生成一个模拟的）
const studentId = computed(() => {
  // 使用 runId 的一部分作为随机种子
  const base = gameStore.currentRunId.substring(0, 4).toUpperCase()
  return `TH${gameStore.gameTime.year}${base}01`
})

const subjectNames = {
  literature: '语文',
  math: '数学',
  english: '英语',
  humanities: '文综',
  sciences: '理综',
  art: '艺术',
  sports: '体育'
}

const skillNames = {
  programming: '编程',
  painting: '绘画',
  guitar: '吉他',
  piano: '钢琴',
  urbanLegend: '怪谈',
  cooking: '烹饪',
  hacking: '黑客',
  socialMedia: '社媒',
  photography: '摄影',
  videoEditing: '剪辑'
}

// 待处理论坛指令数量
const pendingForumCount = computed(() => {
  return gameStore.player.forum?.pendingCommands?.length || 0
})

// 已加入社团数量
const joinedClubsCount = computed(() => gameStore.player.joinedClubs.length)

// 已加入的社团列表
const joinedClubs = computed(() => {
  return gameStore.player.joinedClubs
    .map(id => gameStore.allClubs[id])
    .filter(club => club)
})

// 可加入的社团（未加入的）
const availableClubs = computed(() => {
  return Object.values(gameStore.allClubs).filter(
    club => !gameStore.player.joinedClubs.includes(club.id)
  )
})

// 判断是否正在申请该社团
function isApplyingTo(clubId) {
  return gameStore.clubApplication && gameStore.clubApplication.clubId === clubId
}

// 判断是否可以加入某社团
function canJoinClub(clubId) {
  // 如果已经是成员，不能再加入
  if (gameStore.player.joinedClubs.includes(clubId)) return false
  
  // 如果正在申请任何社团，不能再申请其他
  if (gameStore.clubApplication) return false

  // 如果没有加入任何社团，可以主动加入
  if (gameStore.player.joinedClubs.length === 0) return true
  
  // 已经加入了其他社团，不能主动加入（需要邀请）
  return false
}

// 检查是否是社团成员
function isClubMember(clubId) {
  return gameStore.player.joinedClubs.includes(clubId)
}

// 截断文本
function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

// 加入社团
async function handleJoinClub(clubId) {
  if (!canJoinClub(clubId)) return
  
  const result = await gameStore.applyToJoinClub(clubId)
  
  actionMessage.value = {
    type: result.success ? 'success' : 'error',
    text: result.message
  }
  
  if (result.success) {
    selectedClub.value = null
  }
  
  // 3秒后清除消息
  setTimeout(() => {
    actionMessage.value = null
  }, 3000)
}

// 判断是否是今天
function isToday(dayEn) {
  const todayEn = getWeekdayEnglish(gameStore.gameTime.weekday)
  return todayEn === dayEn
}

// 判断是否是当前正在上的课
function isCurrentClass(dayEn, periodNum) {
  if (!isToday(dayEn)) return false
  
  const { hour, minute } = gameStore.gameTime
  const currentMinutes = hour * 60 + minute
  
  const slot = TIME_SLOTS.find(s => s.period === periodNum)
  if (!slot) return false
  
  const [startH, startM] = slot.start.split(':').map(Number)
  const [endH, endM] = slot.end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// 获取课程信息
function getClassInfo(dayEn, periodNum) {
  if (!hasSchedule.value) return null
  
  const daySchedule = gameStore.player.schedule[dayEn]
  if (!daySchedule) return null
  
  const classInfo = daySchedule.find(c => c.period === periodNum)
  if (!classInfo || classInfo.isEmpty) return null
  
  return classInfo
}

// 判断是否是空课
function isEmptySlot(dayEn, periodNum) {
  const info = getClassInfo(dayEn, periodNum)
  return !info
}

// 加载社团数据
onMounted(async () => {
  if (Object.keys(gameStore.allClubs).length === 0) {
    loading.value = true
    await gameStore.loadClubData()
    loading.value = false
  }
})
</script>

<style scoped>
.schedule-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
}

.schedule-app.vacation-mode {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.schedule-header {
  padding: 12px 16px;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 18px;
  font-weight: bold;
}

.app-logo {
  font-size: 22px;
}

.header-subtitle {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 2px;
}

/* 标签页导航 */
.tab-nav {
  display: flex;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.15);
  border-bottom: 2px solid #ffd93d;
}

.tab-icon {
  font-size: 16px;
}

.tab-label {
  font-size: 13px;
  font-weight: 500;
}

.tab-badge {
  position: absolute;
  top: 6px;
  right: calc(50% - 30px);
  background: #ff6b6b;
  color: white;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

/* 标签页内容 */
.tab-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* 课表相关样式 */
.vacation-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.vacation-content {
  text-align: center;
  padding: 30px;
}

.vacation-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.vacation-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.vacation-text {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.vacation-hint {
  font-size: 12px;
  opacity: 0.7;
}

.schedule-table-container {
  padding: 8px;
}

.schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10px;
}

.schedule-table th,
.schedule-table td {
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 2px;
  text-align: center;
  vertical-align: middle;
}

.period-header {
  width: 40px;
  background: rgba(0, 0, 0, 0.3);
  font-weight: bold;
}

.day-header {
  background: rgba(0, 0, 0, 0.2);
  font-weight: bold;
}

.day-header.today {
  background: rgba(255, 215, 0, 0.3);
}

.day-name {
  font-size: 11px;
}

.period-cell {
  background: rgba(0, 0, 0, 0.2);
}

.period-num {
  font-weight: bold;
  font-size: 12px;
}

.period-time {
  font-size: 8px;
  opacity: 0.7;
}

.class-cell {
  background: rgba(255, 255, 255, 0.05);
  min-height: 50px;
  transition: all 0.2s;
}

.class-cell.today {
  background: rgba(255, 215, 0, 0.1);
}

.class-cell.current {
  background: rgba(76, 175, 80, 0.4);
  box-shadow: inset 0 0 0 2px rgba(76, 175, 80, 0.8);
}

.class-cell.empty {
  background: rgba(0, 0, 0, 0.1);
}

.class-subject {
  font-weight: bold;
  font-size: 10px;
  color: #fff;
  margin-bottom: 2px;
  word-break: break-all;
}

.class-location {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.7);
  word-break: break-all;
}

.empty-slot {
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.schedule-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
}

.schedule-footer .label {
  opacity: 0.7;
}

.schedule-footer .value {
  font-weight: bold;
}

.vacation-tag {
  color: #ffd93d;
}

.no-schedule {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 20px 30px;
  border-radius: 12px;
}

.no-schedule-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.no-schedule-text {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
}

.no-schedule-hint {
  font-size: 12px;
  opacity: 0.7;
}

.period-row:nth-child(3) td {
  border-bottom: 2px solid rgba(255, 215, 0, 0.5);
}

/* 社团相关样式 */
.clubs-content {
  padding: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.section-icon {
  font-size: 16px;
}

.my-clubs-section {
  margin-bottom: 16px;
}

.club-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.club-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.club-card:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(4px);
}

.club-card.joined {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.4);
}

.club-card.disabled {
  opacity: 0.6;
}

.club-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.club-info {
  flex: 1;
  min-width: 0;
}

.club-name {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 2px;
}

.club-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  opacity: 0.8;
}

.club-desc {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.club-badge {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 12px;
  flex-shrink: 0;
}

.joined-badge {
  background: rgba(76, 175, 80, 0.8);
}

.club-action {
  flex-shrink: 0;
}

.join-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 15px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.join-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.5);
}

.disabled-hint {
  font-size: 10px;
  opacity: 0.6;
  color: #ffd93d;
}

/* 加载和空状态 */
.loading-state,
.empty-state {
  text-align: center;
  padding: 30px;
  opacity: 0.7;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
}

/* 社团详情弹窗 */
.club-detail-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.club-detail-content {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  border-radius: 16px;
  width: 100%;
  max-width: 350px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-icon {
  font-size: 32px;
}

.detail-title {
  flex: 1;
  font-size: 18px;
  font-weight: bold;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 8px;
}

.close-btn:hover {
  opacity: 1;
}

.detail-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-row.full {
  flex-direction: column;
  gap: 6px;
}

.detail-label {
  font-size: 12px;
  opacity: 0.7;
}

.detail-value {
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.detail-desc {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.9;
}

.member-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.member-tag {
  background: rgba(255, 255, 255, 0.15);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
}

.no-members {
  opacity: 0.5;
  font-size: 12px;
}

.detail-footer {
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
}

.joined-status {
  color: #4caf50;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.leave-hint {
  font-size: 11px;
  opacity: 0.6;
}

.apply-btn {
  width: 100%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.apply-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.cannot-join {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #ffd93d;
}

.cannot-join-icon {
  font-size: 24px;
}

.cannot-join-text {
  font-size: 12px;
  text-align: center;
  line-height: 1.4;
}

.applying-status {
  text-align: center;
  color: #ffd93d;
}

.status-text {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.status-hint {
  font-size: 11px;
  opacity: 0.8;
  margin-bottom: 4px;
}

.status-timer {
  font-size: 10px;
  opacity: 0.6;
}

/* 拒绝弹窗 */
.rejection-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.rejection-content {
  background: white;
  color: #333;
  padding: 24px;
  border-radius: 16px;
  width: 280px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.rejection-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.rejection-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #f44336;
}

.rejection-info {
  margin-bottom: 12px;
  font-size: 13px;
  color: #666;
}

.rejection-club {
  font-weight: bold;
  color: #333;
}

.rejection-reason {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 20px;
  font-style: italic;
  color: #555;
  border-left: 3px solid #f44336;
}

.confirm-btn {
  width: 100%;
  padding: 10px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover {
  background: #d32f2f;
  transform: translateY(-2px);
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

/* 操作提示 */
.action-message {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  z-index: 1001;
  animation: slideUp 0.3s ease;
}

.action-message.success {
  background: rgba(76, 175, 80, 0.9);
  color: white;
}

.action-message.error {
  background: rgba(244, 67, 54, 0.9);
  color: white;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 档案页面样式 */
.profile-content {
  padding: 16px;
  background: #f0f2f5; /* 浅灰色背景，突出卡片 */
  color: #333;
}

.student-id-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  margin-bottom: 20px;
  position: relative;
  border: 1px solid #e0e0e0;
}

.student-id-card::before {
  content: "TIANHUA";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-size: 40px;
  font-weight: bold;
  color: rgba(0,0,0,0.03);
  pointer-events: none;
  z-index: 0;
}

.card-header {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 3px solid #ffd93d;
}

.school-logo {
  font-size: 20px;
}

.school-name-text {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
}

.card-title {
  margin-left: auto;
  font-size: 10px;
  background: rgba(255,255,255,0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.card-body {
  display: flex;
  padding: 16px;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.student-photo {
  width: 70px;
  height: 90px;
  background: #eee;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.student-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.student-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  border-bottom: 1px dashed #eee;
  padding-bottom: 4px;
}

.info-label {
  font-size: 11px;
  color: #888;
  width: 50px;
}

.info-value {
  font-size: 13px;
  font-weight: bold;
  color: #333;
}

.card-footer {
  background: #f9f9f9;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #eee;
}

.barcode {
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
  font-size: 10px;
  letter-spacing: 2px;
  opacity: 0.6;
  transform: scaleY(1.5);
}

.card-hint {
  font-size: 9px;
  color: #aaa;
}

.skills-section {
  background: white;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.skills-section .section-title {
  color: #333;
  border-bottom-color: #eee;
}

.skills-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.skill-item {
  margin-bottom: 4px;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
}

.skill-name {
  color: #555;
  font-weight: 500;
}

.skill-level {
  color: #1e3c72;
  font-weight: bold;
}

.skill-progress-bg {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.skill-progress-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.subject-bar {
  background: linear-gradient(90deg, #4caf50, #8bc34a);
}

.skill-bar {
  background: linear-gradient(90deg, #2196f3, #03a9f4);
}
</style>
