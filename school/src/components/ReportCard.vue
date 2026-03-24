<script setup>
import { ref, computed, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { SUBJECT_MAP, ALL_SUBJECTS } from '../data/academicData'
import { getTermInfo } from '../utils/scheduleGenerator'

const gameStore = useGameStore()
const selectedExamIndex = ref(-1)
const selectedStudent = ref(null)
const selectedClassId = ref('')
const viewMode = ref('detail') // 'detail' | 'trend'
const trendSubject = ref('total') // 趋势图当前科目

const subjectConfig = {
  literature: { name: '语文', icon: '📖' },
  math: { name: '数学', icon: '📐' },
  english: { name: '英语', icon: '🔤' },
  humanities: { name: '文综', icon: '🌍' },
  sciences: { name: '理综', icon: '🔬' },
  art: { name: '艺术', icon: '🎨' },
  sports: { name: '体育', icon: '⚽' }
}

const subjectList = ALL_SUBJECTS.map(key => ({
  key,
  name: subjectConfig[key]?.name || SUBJECT_MAP[key] || key,
  icon: subjectConfig[key]?.icon || '📚'
}))

const examTypeNames = { monthly: '月考', midterm: '期中考试', final: '期末考试' }
const examTypeIcons = { monthly: '📝', midterm: '📋', final: '📊' }

const isTeacher = computed(() => gameStore.player.role === 'teacher')
const examHistory = computed(() => gameStore.academic.examHistory || [])

// 假期识别
const currentTermInfo = computed(() => {
  const { year, month, day } = gameStore.world.gameTime
  return getTermInfo(year, month, day)
})
const isVacation = computed(() => currentTermInfo.value?.isVacation === true)

// 按学期分组考试
const examsByTerm = computed(() => {
  const groups = {}
  for (const [idx, exam] of examHistory.value.entries()) {
    const { year, month, day } = exam.examDate
    const info = getTermInfo(year, month, day)
    const termKey = info?.termName || `${year}年`
    if (!groups[termKey]) groups[termKey] = []
    groups[termKey].push({ ...exam, _idx: idx })
  }
  return groups
})
const selectedExam = computed(() => {
  if (examHistory.value.length === 0) return null
  const idx = selectedExamIndex.value < 0
    ? examHistory.value.length - 1
    : Math.min(selectedExamIndex.value, examHistory.value.length - 1)
  return examHistory.value[idx] || null
})

// 教师可查看的班级列表
const teacherClasses = computed(() => {
  if (!isTeacher.value) return []
  const classes = new Set()
  if (gameStore.player.homeroomClassIds?.length > 0) {
    gameStore.player.homeroomClassIds.forEach(c => classes.add(c))
  } else if (gameStore.player.homeroomClassId) {
    classes.add(gameStore.player.homeroomClassId)
  }
  if (gameStore.player.teachingClasses) {
    gameStore.player.teachingClasses.forEach(c => classes.add(c))
  }
  if (selectedExam.value?.results) {
    Object.keys(selectedExam.value.results).forEach(c => classes.add(c))
  }
  return Array.from(classes)
})

watch(teacherClasses, (val) => {
  if (val.length > 0 && !selectedClassId.value) {
    selectedClassId.value = val[0]
  }
}, { immediate: true })

const activeClassId = computed(() => {
  if (!isTeacher.value) return gameStore.player.classId
  return selectedClassId.value || teacherClasses.value[0] || ''
})

const classResults = computed(() => {
  if (!selectedExam.value || !activeClassId.value) return null
  return selectedExam.value.results?.[activeClassId.value] || null
})

const playerScores = computed(() => {
  if (isTeacher.value) return null
  if (!classResults.value) return null
  return classResults.value[gameStore.player.name] || null
})

const studentRankings = computed(() => {
  if (!classResults.value) return []
  return Object.entries(classResults.value)
    .map(([name, scores]) => ({
      name, scores,
      total: ALL_SUBJECTS.reduce((s, k) => s + (scores[k] || 0), 0),
      avg: Math.round(ALL_SUBJECTS.reduce((s, k) => s + (scores[k] || 0), 0) / ALL_SUBJECTS.length * 10) / 10
    }))
    .sort((a, b) => b.total - a.total)
})

const classStats = computed(() => {
  if (studentRankings.value.length === 0) return null
  const count = studentRankings.value.length
  const totalAvg = Math.round(studentRankings.value.reduce((s, st) => s + st.total, 0) / count * 10) / 10
  const subjectAvgs = {}
  ALL_SUBJECTS.forEach(key => {
    const sum = studentRankings.value.reduce((s, st) => s + (st.scores[key] || 0), 0)
    subjectAvgs[key] = Math.round(sum / count * 10) / 10
  })
  const passRates = {}
  const excellentRates = {}
  ALL_SUBJECTS.forEach(key => {
    const passCount = studentRankings.value.filter(st => (st.scores[key] || 0) >= 60).length
    const excellentCount = studentRankings.value.filter(st => (st.scores[key] || 0) >= 85).length
    passRates[key] = Math.round(passCount / count * 100)
    excellentRates[key] = Math.round(excellentCount / count * 100)
  })
  return { count, totalAvg, subjectAvgs, passRates, excellentRates,
    highest: studentRankings.value[0]?.total || 0,
    lowest: studentRankings.value[count - 1]?.total || 0
  }
})

const playerRanking = computed(() => {
  if (isTeacher.value || !classResults.value) return null
  const idx = studentRankings.value.findIndex(s => s.name === gameStore.player.name)
  if (idx === -1) return null
  return { rank: idx + 1, total: studentRankings.value.length }
})

const totalScore = computed(() => {
  if (!playerScores.value) return 0
  return ALL_SUBJECTS.reduce((s, k) => s + (playerScores.value[k] || 0), 0)
})

const avgScore = computed(() => {
  if (!playerScores.value) return 0
  return Math.round(totalScore.value / ALL_SUBJECTS.length * 10) / 10
})

// 教师点击某个学生
const selectedStudentScores = computed(() => {
  if (!selectedStudent.value || !classResults.value) return null
  return classResults.value[selectedStudent.value] || null
})
const selectedStudentTotal = computed(() => {
  if (!selectedStudentScores.value) return 0
  return ALL_SUBJECTS.reduce((s, k) => s + (selectedStudentScores.value[k] || 0), 0)
})
const selectedStudentRank = computed(() => {
  if (!selectedStudent.value) return null
  const idx = studentRankings.value.findIndex(s => s.name === selectedStudent.value)
  return idx === -1 ? null : idx + 1
})
// ==================== 考试对比 ====================
// 找到上一次同类型考试
const prevSameTypeExam = computed(() => {
  if (!selectedExam.value) return null
  const curIdx = selectedExamIndex.value < 0 ? examHistory.value.length - 1 : selectedExamIndex.value
  const curType = selectedExam.value.examType
  for (let i = curIdx - 1; i >= 0; i--) {
    if (examHistory.value[i].examType === curType) return examHistory.value[i]
  }
  return null
})

// 学生各科与上次同类型考试的对比
const scoreComparison = computed(() => {
  if (!playerScores.value || !prevSameTypeExam.value) return null
  const prevResults = prevSameTypeExam.value.results?.[gameStore.player.classId]
  if (!prevResults) return null
  const prevScores = prevResults[gameStore.player.name]
  if (!prevScores) return null
  const comp = {}
  ALL_SUBJECTS.forEach(k => {
    comp[k] = (playerScores.value[k] || 0) - (prevScores[k] || 0)
  })
  comp._total = totalScore.value - ALL_SUBJECTS.reduce((s, k) => s + (prevScores[k] || 0), 0)
  return comp
})

// 教师视角：班级平均分对比
const classAvgComparison = computed(() => {
  if (!classStats.value || !prevSameTypeExam.value || !activeClassId.value) return null
  const prevClassResults = prevSameTypeExam.value.results?.[activeClassId.value]
  if (!prevClassResults) return null
  const prevEntries = Object.values(prevClassResults)
  if (prevEntries.length === 0) return null
  const comp = {}
  ALL_SUBJECTS.forEach(k => {
    const prevSum = prevEntries.reduce((s, sc) => s + (sc[k] || 0), 0)
    const prevAvg = Math.round(prevSum / prevEntries.length * 10) / 10
    comp[k] = Math.round((classStats.value.subjectAvgs[k] - prevAvg) * 10) / 10
  })
  return comp
})

// ==================== 趋势图数据 ====================
const trendData = computed(() => {
  if (examHistory.value.length < 2) return null
  const cid = activeClassId.value
  const playerName = gameStore.player.name
  const points = []
  for (const exam of examHistory.value) {
    const cr = exam.results?.[cid]
    if (!cr) continue
    if (isTeacher.value) {
      // 教师：班级各科平均分
      const entries = Object.values(cr)
      if (entries.length === 0) continue
      const avgs = {}
      ALL_SUBJECTS.forEach(k => {
        avgs[k] = Math.round(entries.reduce((s, sc) => s + (sc[k] || 0), 0) / entries.length * 10) / 10
      })
      avgs.total = Math.round(ALL_SUBJECTS.reduce((s, k) => s + avgs[k], 0) / ALL_SUBJECTS.length * 10) / 10
      points.push({ label: `${exam.examDate.month}月${examTypeNames[exam.examType]?.replace('考试','')}`, ...avgs, examType: exam.examType })
    } else {
      // 学生：个人各科分数
      const sc = cr[playerName]
      if (!sc) continue
      const entry = { label: `${exam.examDate.month}月${examTypeNames[exam.examType]?.replace('考试','')}`, examType: exam.examType }
      ALL_SUBJECTS.forEach(k => { entry[k] = sc[k] || 0 })
      entry.total = Math.round(ALL_SUBJECTS.reduce((s, k) => s + (sc[k] || 0), 0) / ALL_SUBJECTS.length * 10) / 10
      points.push(entry)
    }
  }
  return points.length >= 2 ? points : null
})

// SVG 趋势折线图路径
const trendSvgWidth = 280
const trendSvgHeight = 140
const trendPadding = { top: 15, right: 15, bottom: 25, left: 30 }

const trendLine = computed(() => {
  if (!trendData.value) return null
  const data = trendData.value
  const key = trendSubject.value
  const values = data.map(d => d[key] ?? 0)
  const minV = Math.min(...values, 0)
  const maxV = Math.max(...values, 100)
  const range = maxV - minV || 1
  const w = trendSvgWidth - trendPadding.left - trendPadding.right
  const h = trendSvgHeight - trendPadding.top - trendPadding.bottom
  const pts = data.map((d, i) => {
    const x = trendPadding.left + (i / (data.length - 1)) * w
    const y = trendPadding.top + h - ((d[key] - minV) / range) * h
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, value: d[key], label: d.label }
  })
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
  // Y 轴刻度
  const yTicks = [minV, Math.round((minV + maxV) / 2), maxV].map(v => ({
    value: v, y: trendPadding.top + h - ((v - minV) / range) * h
  }))
  return { pts, polyline, yTicks, minV, maxV }
})

// ==================== 工具函数 ====================
function getScoreColor(score) {
  if (score >= 90) return '#4caf50'
  if (score >= 75) return '#2196f3'
  if (score >= 60) return '#ff9800'
  return '#f44336'
}
function getScoreGrade(score) {
  if (score >= 95) return 'S'
  if (score >= 90) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 80) return 'B+'
  if (score >= 75) return 'B'
  if (score >= 70) return 'C+'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}
function getRankIcon(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}`
}
function getDeltaArrow(d) {
  if (d > 0) return '↑'
  if (d < 0) return '↓'
  return '→'
}
function getDeltaColor(d) {
  if (d > 0) return '#4caf50'
  if (d < 0) return '#f44336'
  return '#999'
}
function selectStudent(name) {
  selectedStudent.value = selectedStudent.value === name ? null : name
}
/* PLACEHOLDER_TEMPLATE */
</script>

<template>
  <div class="report-content">
    <!-- 假期提示 -->
    <div v-if="isVacation && examHistory.length === 0" class="empty-card">
      <div class="empty-icon">🏖️</div>
      <div class="empty-title">假期中，无考试</div>
      <div class="empty-hint">{{ currentTermInfo?.vacationName || '假期' }}期间不安排考试</div>
    </div>

    <!-- 无数据提示 -->
    <div v-else-if="examHistory.length === 0" class="empty-card">
      <div class="empty-icon">📝</div>
      <div class="empty-title">尚无考试记录</div>
      <div class="empty-hint">考试将在学期中自动进行（月考、期中、期末）</div>
    </div>

    <template v-else>
      <!-- 周报入口卡片 -->
      <div v-if="gameStore.notifications.weeklyPreviewData && gameStore.notifications.lastWeeklyPreviewWeek > (gameStore.notifications.lastViewedWeeklyPreview || 0)"
        class="weekly-entry-card" @click="gameStore.notifications.showWeeklyPreview = true; gameStore.notifications.lastViewedWeeklyPreview = gameStore.notifications.lastWeeklyPreviewWeek">
        <span class="weekly-entry-icon">📅</span>
        <span class="weekly-entry-text">第 {{ gameStore.notifications.lastWeeklyPreviewWeek }} 周学业回顾</span>
        <span class="weekly-entry-badge">NEW</span>
      </div>

      <!-- 视图切换 -->
      <div class="view-toggle">
        <button class="toggle-btn" :class="{ active: viewMode === 'detail' }" @click="viewMode = 'detail'">📋 详情</button>
        <button class="toggle-btn" :class="{ active: viewMode === 'trend' }" @click="viewMode = 'trend'">📈 趋势</button>
      </div>

      <!-- ==================== 趋势图视图 ==================== -->
      <div v-if="viewMode === 'trend'" class="trend-view">
        <div v-if="!trendData" class="empty-card small">
          <div class="empty-icon">📈</div>
          <div class="empty-title">至少需要2次考试才能显示趋势</div>
        </div>
        <template v-else>
          <!-- 科目选择 -->
          <div class="scroll-fade-wrapper">
            <div class="trend-subject-tabs">
              <button class="trend-tab" :class="{ active: trendSubject === 'total' }" @click="trendSubject = 'total'">均分</button>
              <button v-for="subj in subjectList" :key="subj.key" class="trend-tab" :class="{ active: trendSubject === subj.key }" @click="trendSubject = subj.key">
                {{ subj.icon }}{{ subj.name }}
              </button>
            </div>
          </div>
          <!-- SVG 折线图 -->
          <div class="trend-chart-card">
            <svg :viewBox="`0 0 ${trendSvgWidth} ${trendSvgHeight}`" class="trend-svg">
              <!-- Y 轴刻度 -->
              <template v-if="trendLine">
                <line v-for="tick in trendLine.yTicks" :key="tick.value"
                  :x1="trendPadding.left" :y1="tick.y" :x2="trendSvgWidth - trendPadding.right" :y2="tick.y"
                  stroke="#e0e0e0" stroke-width="0.5" />
                <text v-for="tick in trendLine.yTicks" :key="'t'+tick.value"
                  :x="trendPadding.left - 4" :y="tick.y + 3" text-anchor="end" fill="#999" font-size="8">{{ Math.round(tick.value) }}</text>
              </template>
              <!-- 折线 -->
              <polyline v-if="trendLine" :points="trendLine.polyline" fill="none" stroke="#1e3c72" stroke-width="2" stroke-linejoin="round" />
              <!-- 数据点 -->
              <template v-if="trendLine">
                <g v-for="(pt, i) in trendLine.pts" :key="i">
                  <circle :cx="pt.x" :cy="pt.y" r="3.5" fill="#1e3c72" stroke="white" stroke-width="1.5" />
                  <text :x="pt.x" :y="pt.y - 7" text-anchor="middle" fill="#1e3c72" font-size="7" font-weight="bold">{{ Math.round(pt.value) }}</text>
                  <text :x="pt.x" :y="trendSvgHeight - 4" text-anchor="middle" fill="#888" font-size="6">{{ pt.label }}</text>
                </g>
              </template>
            </svg>
          </div>
        </template>
      </div>

      <!-- ==================== 详情视图 ==================== -->
      <template v-if="viewMode === 'detail'">
        <!-- 考试选择器（按学期分组） -->
        <div class="exam-selector-card">
          <div v-for="(exams, termName) in examsByTerm" :key="termName" class="term-group">
            <div class="term-label">{{ termName }}</div>
            <div class="scroll-fade-wrapper">
              <div class="exam-tabs">
                <button v-for="exam in exams" :key="exam._idx" class="exam-tab-btn"
                  :class="{ active: (selectedExamIndex < 0 && exam._idx === examHistory.length - 1) || selectedExamIndex === exam._idx }"
                  @click="selectedExamIndex = exam._idx">
                  <span class="tab-icon-type">{{ examTypeIcons[exam.examType] || '📝' }}</span>
                  <span class="tab-type">{{ examTypeNames[exam.examType] || '考试' }}</span>
                  <span class="tab-date">{{ exam.examDate.month }}/{{ exam.examDate.day }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 教师：班级选择器 -->
        <div v-if="isTeacher && teacherClasses.length > 1" class="class-selector-card">
          <span class="selector-label">📋 查看班级：</span>
          <div class="scroll-fade-wrapper">
            <div class="class-chips">
              <button v-for="cls in teacherClasses" :key="cls" class="class-chip"
                :class="{ active: activeClassId === cls, homeroom: (gameStore.player.homeroomClassIds || []).includes(cls) || cls === gameStore.player.homeroomClassId }"
                @click="selectedClassId = cls; selectedStudent = null">
                {{ cls }}{{ ((gameStore.player.homeroomClassIds || []).includes(cls) || cls === gameStore.player.homeroomClassId) ? '(班主任)' : '' }}
              </button>
            </div>
          </div>
        </div>
<!-- PLACEHOLDER_STUDENT_VIEW -->
        <!-- ==================== 学生视角 ==================== -->
        <template v-if="!isTeacher">
          <div v-if="selectedExam && playerScores" class="scores-card">
            <div class="card-title">
              <span class="title-icon">{{ examTypeIcons[selectedExam.examType] }}</span>
              <span>{{ examTypeNames[selectedExam.examType] }}</span>
              <span class="title-date">{{ selectedExam.examDate.year }}.{{ selectedExam.examDate.month }}.{{ selectedExam.examDate.day }}</span>
            </div>

            <!-- 各科成绩 + 对比箭头 -->
            <div class="subject-list">
              <div v-for="subj in subjectList" :key="subj.key" class="subject-row">
                <span class="subj-icon">{{ subj.icon }}</span>
                <span class="subj-name">{{ subj.name }}</span>
                <div class="score-bar-track">
                  <div class="score-bar-fill" :style="{ width: (playerScores[subj.key] || 0) + '%', backgroundColor: getScoreColor(playerScores[subj.key] || 0) }"></div>
                </div>
                <span class="subj-score" :style="{ color: getScoreColor(playerScores[subj.key] || 0) }">{{ playerScores[subj.key] || 0 }}</span>
                <span class="subj-grade" :style="{ color: getScoreColor(playerScores[subj.key] || 0) }">{{ getScoreGrade(playerScores[subj.key] || 0) }}</span>
                <span v-if="scoreComparison" class="subj-delta" :style="{ color: getDeltaColor(scoreComparison[subj.key]) }">
                  {{ getDeltaArrow(scoreComparison[subj.key]) }}{{ Math.abs(scoreComparison[subj.key]) }}
                </span>
              </div>
            </div>

            <!-- 总分/均分/排名 -->
            <div class="summary-row">
              <div class="summary-item">
                <span class="summary-label">总分</span>
                <span class="summary-value">{{ totalScore }}</span>
                <span v-if="scoreComparison" class="summary-delta" :style="{ color: getDeltaColor(scoreComparison._total) }">
                  {{ getDeltaArrow(scoreComparison._total) }}{{ Math.abs(scoreComparison._total) }}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">均分</span>
                <span class="summary-value">{{ avgScore }}</span>
              </div>
              <div v-if="playerRanking" class="summary-item">
                <span class="summary-label">排名</span>
                <span class="summary-value rank-value">{{ playerRanking.rank }}<small>/{{ playerRanking.total }}</small></span>
              </div>
            </div>
          </div>

          <!-- 班级前5 -->
          <div v-if="studentRankings.length > 0 && selectedExam" class="ranking-card">
            <div class="card-title">
              <span class="title-icon">🏆</span>
              <span>班级排名 TOP5</span>
            </div>
            <div class="ranking-list">
              <div v-for="(student, idx) in studentRankings.slice(0, 5)" :key="idx" class="ranking-item" :class="{ 'is-player': student.name === gameStore.player.name }">
                <span class="rank-badge" :class="'rank-' + (idx + 1)">{{ getRankIcon(idx + 1) }}</span>
                <span class="rank-name">{{ student.name }}</span>
                <span class="rank-avg">均{{ student.avg }}</span>
                <span class="rank-total">{{ student.total }}分</span>
              </div>
            </div>
          </div>

          <div v-if="selectedExam && !playerScores" class="empty-card small">
            <div class="empty-icon">❓</div>
            <div class="empty-title">未找到你的成绩</div>
          </div>
        </template>
<!-- PLACEHOLDER_TEACHER_VIEW -->
        <!-- ==================== 教师视角 ==================== -->
        <template v-else>
          <!-- 班级统计卡 -->
          <div v-if="classStats && selectedExam" class="stats-card">
            <div class="card-title">
              <span class="title-icon">📈</span>
              <span>{{ activeClassId }} · {{ examTypeNames[selectedExam.examType] }}</span>
              <span class="title-date">{{ selectedExam.examDate.year }}.{{ selectedExam.examDate.month }}.{{ selectedExam.examDate.day }}</span>
            </div>
            <div class="stats-grid">
              <div class="stat-box"><span class="stat-num">{{ classStats.count }}</span><span class="stat-label">参考人数</span></div>
              <div class="stat-box"><span class="stat-num">{{ classStats.totalAvg }}</span><span class="stat-label">总分均值</span></div>
              <div class="stat-box highlight"><span class="stat-num">{{ classStats.highest }}</span><span class="stat-label">最高总分</span></div>
              <div class="stat-box"><span class="stat-num">{{ classStats.lowest }}</span><span class="stat-label">最低总分</span></div>
            </div>
          </div>

          <!-- 科目平均分 + 对比 -->
          <div v-if="classStats && selectedExam" class="subject-stats-card">
            <div class="card-title">
              <span class="title-icon">📚</span>
              <span>各科统计</span>
            </div>
            <div class="subject-stats-list">
              <div v-for="subj in subjectList" :key="subj.key" class="subject-stat-row">
                <span class="subj-icon">{{ subj.icon }}</span>
                <span class="subj-name">{{ subj.name }}</span>
                <div class="stat-bar-area">
                  <div class="stat-bar-track">
                    <div class="stat-bar-fill" :style="{ width: (classStats.subjectAvgs[subj.key] || 0) + '%', backgroundColor: getScoreColor(classStats.subjectAvgs[subj.key] || 0) }"></div>
                  </div>
                  <div class="stat-meta">
                    <span class="stat-avg">均{{ classStats.subjectAvgs[subj.key] }}</span>
                    <span v-if="classAvgComparison" class="stat-delta" :style="{ color: getDeltaColor(classAvgComparison[subj.key]) }">
                      {{ getDeltaArrow(classAvgComparison[subj.key]) }}{{ Math.abs(classAvgComparison[subj.key]) }}
                    </span>
                    <span class="stat-pass">及{{ classStats.passRates[subj.key] }}%</span>
                    <span class="stat-excellent">优{{ classStats.excellentRates[subj.key] }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 全班排名 -->
          <div v-if="studentRankings.length > 0 && selectedExam" class="full-ranking-card">
            <div class="card-title">
              <span class="title-icon">📋</span>
              <span>成绩排名</span>
              <span class="title-count">{{ studentRankings.length }}人</span>
            </div>
            <div class="full-ranking-list">
              <div v-for="(student, idx) in studentRankings" :key="student.name" class="full-rank-item" :class="{ expanded: selectedStudent === student.name }" @click="selectStudent(student.name)">
                <div class="rank-main-row">
                  <span class="rank-badge" :class="'rank-' + (idx + 1)">{{ getRankIcon(idx + 1) }}</span>
                  <span class="rank-name">{{ student.name }}</span>
                  <span class="rank-avg">均{{ student.avg }}</span>
                  <span class="rank-total">{{ student.total }}分</span>
                  <span class="expand-arrow" :class="{ rotated: selectedStudent === student.name }">▾</span>
                </div>
                <transition name="slide-down">
                  <div v-if="selectedStudent === student.name && selectedStudentScores" class="rank-detail">
                    <div class="detail-grid">
                      <div v-for="subj in subjectList" :key="subj.key" class="detail-cell">
                        <span class="detail-subj">{{ subj.icon }}{{ subj.name }}</span>
                        <span class="detail-score" :style="{ color: getScoreColor(selectedStudentScores[subj.key] || 0) }">{{ selectedStudentScores[subj.key] || 0 }}</span>
                        <span class="detail-grade" :style="{ color: getScoreColor(selectedStudentScores[subj.key] || 0) }">{{ getScoreGrade(selectedStudentScores[subj.key] || 0) }}</span>
                      </div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <div v-if="selectedExam && !classResults" class="empty-card small">
            <div class="empty-icon">📭</div>
            <div class="empty-title">该班级暂无成绩数据</div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
<!-- PLACEHOLDER_STYLE -->

<style scoped>
.report-content {
  padding: 12px;
  padding-bottom: 80px;
  background: #f0f2f5;
  color: #333;
  min-height: 100%;
}

/* 空状态 */
.empty-card {
  background: white;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.empty-card.small { padding: 24px 16px; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 15px; font-weight: 600; color: #555; margin-bottom: 6px; }
.empty-hint { font-size: 12px; color: #aaa; }

/* 周报入口卡片 */
.weekly-entry-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #e8f4fd, #dbeafe);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.weekly-entry-card:active { transform: scale(0.98); }
.weekly-entry-icon { font-size: 18px; }
.weekly-entry-text { flex: 1; font-size: 13px; font-weight: 600; color: #1e3c72; }
.weekly-entry-badge {
  font-size: 10px; font-weight: bold; color: white;
  background: #f44336; border-radius: 8px; padding: 2px 6px;
}

/* 视图切换 */
.view-toggle {
  display: flex; gap: 6px; margin-bottom: 10px;
}
.toggle-btn {
  flex: 1; padding: 8px; border: 1px solid #e0e0e0; background: white;
  border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: inherit; transition: all 0.2s; text-align: center;
}
.toggle-btn.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white; border-color: #1e3c72;
}

/* 滚动渐变包装 */
.scroll-fade-wrapper {
  position: relative; overflow: hidden;
}
.scroll-fade-wrapper::after {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px;
  background: linear-gradient(to right, transparent, white); pointer-events: none; z-index: 1;
}

/* 考试选择器 */
.exam-selector-card {
  background: white; border-radius: 12px; padding: 10px 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.term-group { margin-bottom: 6px; }
.term-group:last-child { margin-bottom: 0; }
.term-label { font-size: 11px; color: #888; font-weight: 600; margin-bottom: 4px; padding-left: 2px; }
/* PLACEHOLDER_STYLE_2 */
.exam-tabs {
  display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch;
  scrollbar-width: none; scroll-snap-type: x mandatory;
}
.exam-tabs::-webkit-scrollbar { display: none; }
.exam-tab-btn {
  display: flex; flex-direction: column; align-items: center;
  padding: 6px 12px; border: 1px solid #e0e0e0; background: #f9f9f9;
  border-radius: 10px; cursor: pointer; font-family: inherit;
  transition: all 0.2s; white-space: nowrap; flex-shrink: 0;
  min-height: 44px; justify-content: center; scroll-snap-align: start;
}
.exam-tab-btn.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white; border-color: #1e3c72;
}
.tab-icon-type { font-size: 14px; }
.tab-type { font-size: 11px; font-weight: 600; }
.tab-date { font-size: 10px; opacity: 0.7; }

/* 班级选择器 */
.class-selector-card {
  background: white; border-radius: 12px; padding: 10px 14px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  display: flex; align-items: center; gap: 8px;
}
.selector-label { font-size: 13px; font-weight: 600; white-space: nowrap; color: #555; }
.class-chips {
  display: flex; gap: 6px; overflow-x: auto;
  scrollbar-width: none;
}
.class-chips::-webkit-scrollbar { display: none; }
.class-chip {
  padding: 5px 14px; border: 1px solid #e0e0e0; background: #f5f5f5;
  border-radius: 16px; cursor: pointer; font-size: 12px; font-weight: 600;
  font-family: inherit; transition: all 0.2s; white-space: nowrap;
  min-height: 36px; display: flex; align-items: center;
}
.class-chip.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white; border-color: #1e3c72;
}
.class-chip.homeroom { border-color: #ff9800; }

/* 通用卡片标题 */
.card-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 700; color: #333;
  margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #eee;
}
.title-icon { font-size: 16px; }
.title-date { margin-left: auto; font-size: 11px; color: #aaa; font-weight: normal; }
.title-count {
  margin-left: auto; font-size: 11px; color: #888;
  background: #f0f0f0; padding: 2px 8px; border-radius: 10px;
}

/* ==================== 学生成绩卡 ==================== */
.scores-card {
  background: white; border-radius: 12px; padding: 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.subject-list { display: flex; flex-direction: column; gap: 8px; }
.subject-row { display: flex; align-items: center; gap: 6px; }
.subj-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.subj-name { width: 30px; font-size: 12px; color: #555; font-weight: 500; flex-shrink: 0; }
.score-bar-track { flex: 1; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
.score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.subj-score { width: 26px; text-align: right; font-weight: bold; font-size: 13px; flex-shrink: 0; }
.subj-grade { width: 20px; text-align: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
.subj-delta { width: 32px; text-align: right; font-size: 11px; font-weight: 600; flex-shrink: 0; }
/* PLACEHOLDER_STYLE_3 */

/* 总分/均分/排名 */
.summary-row {
  display: flex; justify-content: space-around; margin-top: 12px;
  padding: 10px; background: linear-gradient(135deg, #e8f4fd, #e3f0ff);
  border-radius: 10px; border: 1px solid #d0e3f5;
}
.summary-item { display: flex; flex-direction: column; align-items: center; }
.summary-label { font-size: 11px; color: #888; }
.summary-value { font-size: 18px; font-weight: bold; color: #1e3c72; }
.summary-value.rank-value { color: #e65100; }
.summary-value small { font-size: 12px; color: #999; font-weight: normal; }
.summary-delta { font-size: 11px; font-weight: 600; }

/* ==================== 排名卡 ==================== */
.ranking-card {
  background: white; border-radius: 12px; padding: 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.ranking-list { display: flex; flex-direction: column; gap: 6px; }
.ranking-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px; background: #fafafa;
}
.ranking-item.is-player { background: #e8f0fe; border: 1px solid #c5d8f0; }
.rank-badge {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: bold; border-radius: 50%; background: #f0f0f0; color: #666; flex-shrink: 0;
}
.rank-1 { background: #fff3e0; color: #e65100; }
.rank-2 { background: #f5f5f5; color: #616161; }
.rank-3 { background: #fff8e1; color: #f57f17; }
.rank-name { flex: 1; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-avg { font-size: 11px; color: #888; flex-shrink: 0; }
.rank-total { font-size: 12px; font-weight: bold; color: #1e3c72; flex-shrink: 0; }

/* ==================== 教师统计 ==================== */
.stats-card {
  background: white; border-radius: 12px; padding: 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.stats-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.stat-box {
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 8px; background: #f8f9fa; border-radius: 8px;
}
.stat-box.highlight { background: #e8f5e9; }
.stat-num { font-size: 18px; font-weight: bold; color: #1e3c72; }
.stat-label { font-size: 11px; color: #888; margin-top: 2px; }

.subject-stats-card {
  background: white; border-radius: 12px; padding: 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.subject-stats-list { display: flex; flex-direction: column; gap: 10px; }
.subject-stat-row { display: flex; align-items: center; gap: 6px; }
.stat-bar-area { flex: 1; }
.stat-bar-track { height: 6px; background: #f0f0f0; border-radius: 3px; overflow: hidden; margin-bottom: 3px; }
.stat-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
.stat-meta { display: flex; gap: 6px; font-size: 11px; }
.stat-avg { color: #333; font-weight: 600; }
.stat-delta { font-weight: 600; }
.stat-pass { color: #2196f3; }
.stat-excellent { color: #4caf50; }
/* PLACEHOLDER_STYLE_4 */

/* 全班排名 */
.full-ranking-card {
  background: white; border-radius: 12px; padding: 12px;
  margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.full-ranking-list { display: flex; flex-direction: column; gap: 4px; }
.full-rank-item {
  border-radius: 8px; background: #fafafa; overflow: hidden;
  cursor: pointer; transition: background 0.2s;
}
.full-rank-item:hover { background: #f0f4ff; }
.full-rank-item.expanded { background: #e8f0fe; }
.rank-main-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.expand-arrow { font-size: 12px; color: #aaa; transition: transform 0.2s; flex-shrink: 0; }
.expand-arrow.rotated { transform: rotate(180deg); }

.rank-detail { padding: 8px 12px 12px; border-top: 1px solid #e0e0e0; }
.detail-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 6px;
}
.detail-cell {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; background: white; border-radius: 6px; font-size: 11px;
}
.detail-subj { color: #666; flex: 1; white-space: nowrap; }
.detail-score { font-weight: bold; font-size: 12px; }
.detail-grade { font-size: 10px; font-weight: bold; }

/* ==================== 趋势图 ==================== */
.trend-view { margin-bottom: 10px; }
.trend-subject-tabs {
  display: flex; gap: 6px; overflow-x: auto; padding: 4px 0;
  scrollbar-width: none; scroll-snap-type: x mandatory;
}
.trend-subject-tabs::-webkit-scrollbar { display: none; }
.trend-tab {
  padding: 5px 10px; border: 1px solid #e0e0e0; background: #f9f9f9;
  border-radius: 14px; font-size: 11px; font-weight: 600; cursor: pointer;
  font-family: inherit; white-space: nowrap; flex-shrink: 0;
  transition: all 0.2s; scroll-snap-align: start;
}
.trend-tab.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white; border-color: #1e3c72;
}
.trend-chart-card {
  background: white; border-radius: 12px; padding: 12px 8px;
  margin-top: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.trend-svg { width: 100%; height: auto; }

/* 展开动画 */
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.25s ease; max-height: 200px; overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to {
  max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0;
}
</style>
