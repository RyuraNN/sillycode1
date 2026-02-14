<script setup>
import { ref, computed, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { SUBJECT_MAP, ALL_SUBJECTS } from '../data/academicData'

const gameStore = useGameStore()
const selectedExamIndex = ref(-1)
const selectedStudent = ref(null)
const selectedClassId = ref('')

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

const examTypeNames = {
  monthly: '月考',
  midterm: '期中考试',
  final: '期末考试'
}

const isTeacher = computed(() => gameStore.player.role === 'teacher')
const examHistory = computed(() => gameStore.examHistory || [])

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
  if (gameStore.player.homeroomClassId) classes.add(gameStore.player.homeroomClassId)
  if (gameStore.player.teachingClasses) {
    gameStore.player.teachingClasses.forEach(c => classes.add(c))
  }
  // 如果考试数据中有更多班级，也加入
  if (selectedExam.value?.results) {
    Object.keys(selectedExam.value.results).forEach(c => classes.add(c))
  }
  return Array.from(classes)
})

// 自动选择班级
watch(teacherClasses, (val) => {
  if (val.length > 0 && !selectedClassId.value) {
    selectedClassId.value = val[0]
  }
}, { immediate: true })

const activeClassId = computed(() => {
  if (!isTeacher.value) return gameStore.player.classId
  return selectedClassId.value || teacherClasses.value[0] || ''
})

// 当前考试下的班级成绩数据
const classResults = computed(() => {
  if (!selectedExam.value || !activeClassId.value) return null
  return selectedExam.value.results?.[activeClassId.value] || null
})

// 学生个人成绩
const playerScores = computed(() => {
  if (isTeacher.value) return null
  if (!classResults.value) return null
  return classResults.value[gameStore.player.name] || null
})

// 全班排名列表
const studentRankings = computed(() => {
  if (!classResults.value) return []
  return Object.entries(classResults.value)
    .map(([name, scores]) => ({
      name,
      scores,
      total: ALL_SUBJECTS.reduce((s, k) => s + (scores[k] || 0), 0),
      avg: Math.round(ALL_SUBJECTS.reduce((s, k) => s + (scores[k] || 0), 0) / ALL_SUBJECTS.length * 10) / 10
    }))
    .sort((a, b) => b.total - a.total)
})

// 班级统计信息
const classStats = computed(() => {
  if (studentRankings.value.length === 0) return null
  const count = studentRankings.value.length
  const totalAvg = Math.round(studentRankings.value.reduce((s, st) => s + st.total, 0) / count * 10) / 10

  const subjectAvgs = {}
  ALL_SUBJECTS.forEach(key => {
    const sum = studentRankings.value.reduce((s, st) => s + (st.scores[key] || 0), 0)
    subjectAvgs[key] = Math.round(sum / count * 10) / 10
  })

  // 及格率(>=60)和优秀率(>=85)
  const passRates = {}
  const excellentRates = {}
  ALL_SUBJECTS.forEach(key => {
    const passCount = studentRankings.value.filter(st => (st.scores[key] || 0) >= 60).length
    const excellentCount = studentRankings.value.filter(st => (st.scores[key] || 0) >= 85).length
    passRates[key] = Math.round(passCount / count * 100)
    excellentRates[key] = Math.round(excellentCount / count * 100)
  })

  return {
    count,
    totalAvg,
    subjectAvgs,
    passRates,
    excellentRates,
    highest: studentRankings.value[0]?.total || 0,
    lowest: studentRankings.value[count - 1]?.total || 0
  }
})

// 学生视角排名
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

// 教师点击某个学生的成绩
const selectedStudentScores = computed(() => {
  if (!selectedStudent.value || !classResults.value) return null
  return classResults.value[selectedStudent.value] || null
})

const selectedStudentTotal = computed(() => {
  if (!selectedStudentScores.value) return 0
  return ALL_SUBJECTS.reduce((s, k) => s + (selectedStudentScores.value[k] || 0), 0)
})

const selectedStudentAvg = computed(() => {
  if (!selectedStudentScores.value) return 0
  return Math.round(selectedStudentTotal.value / ALL_SUBJECTS.length * 10) / 10
})

const selectedStudentRank = computed(() => {
  if (!selectedStudent.value) return null
  const idx = studentRankings.value.findIndex(s => s.name === selectedStudent.value)
  if (idx === -1) return null
  return idx + 1
})

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

function selectStudent(name) {
  selectedStudent.value = selectedStudent.value === name ? null : name
}
</script>

<template>
  <div class="report-content">
    <!-- 无数据提示 -->
    <div v-if="examHistory.length === 0" class="empty-card">
      <div class="empty-icon">📝</div>
      <div class="empty-title">尚无考试记录</div>
      <div class="empty-hint">考试将在学期中自动进行（月考、期中、期末）</div>
    </div>

    <template v-else>
      <!-- 考试选择器 -->
      <div class="exam-selector-card">
        <div class="exam-tabs">
          <button
            v-for="(exam, idx) in examHistory"
            :key="idx"
            class="exam-tab-btn"
            :class="{ active: (selectedExamIndex < 0 && idx === examHistory.length - 1) || selectedExamIndex === idx }"
            @click="selectedExamIndex = idx"
          >
            <span class="tab-type">{{ examTypeNames[exam.examType] || '考试' }}</span>
            <span class="tab-date">{{ exam.examDate.month }}月</span>
          </button>
        </div>
      </div>

      <!-- 教师视角：班级选择器 -->
      <div v-if="isTeacher && teacherClasses.length > 1" class="class-selector-card">
        <span class="selector-label">📋 查看班级：</span>
        <div class="class-chips">
          <button
            v-for="cls in teacherClasses"
            :key="cls"
            class="class-chip"
            :class="{ active: activeClassId === cls }"
            @click="selectedClassId = cls; selectedStudent = null"
          >
            {{ cls }}
          </button>
        </div>
      </div>

      <!-- ==================== 学生视角 ==================== -->
      <template v-if="!isTeacher">
        <div v-if="selectedExam && playerScores" class="scores-card">
          <div class="card-title">
            <span class="title-icon">📊</span>
            <span>{{ examTypeNames[selectedExam.examType] }}</span>
            <span class="title-date">
              {{ selectedExam.examDate.year }}.{{ selectedExam.examDate.month }}.{{ selectedExam.examDate.day }}
            </span>
          </div>

          <!-- 各科成绩 -->
          <div class="subject-list">
            <div v-for="subj in subjectList" :key="subj.key" class="subject-row">
              <span class="subj-icon">{{ subj.icon }}</span>
              <span class="subj-name">{{ subj.name }}</span>
              <div class="score-bar-track">
                <div
                  class="score-bar-fill"
                  :style="{
                    width: (playerScores[subj.key] || 0) + '%',
                    backgroundColor: getScoreColor(playerScores[subj.key] || 0)
                  }"
                ></div>
              </div>
              <span class="subj-score" :style="{ color: getScoreColor(playerScores[subj.key] || 0) }">
                {{ playerScores[subj.key] || 0 }}
              </span>
              <span class="subj-grade" :style="{ color: getScoreColor(playerScores[subj.key] || 0) }">
                {{ getScoreGrade(playerScores[subj.key] || 0) }}
              </span>
            </div>
          </div>

          <!-- 总分/均分/排名 -->
          <div class="summary-row">
            <div class="summary-item">
              <span class="summary-label">总分</span>
              <span class="summary-value">{{ totalScore }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">均分</span>
              <span class="summary-value">{{ avgScore }}</span>
            </div>
            <div v-if="playerRanking" class="summary-item">
              <span class="summary-label">排名</span>
              <span class="summary-value rank-value">
                {{ playerRanking.rank }}<small>/{{ playerRanking.total }}</small>
              </span>
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
            <div
              v-for="(student, idx) in studentRankings.slice(0, 5)"
              :key="idx"
              class="ranking-item"
              :class="{ 'is-player': student.name === gameStore.player.name }"
            >
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

      <!-- ==================== 教师视角 ==================== -->
      <template v-else>
        <!-- 班级统计卡 -->
        <div v-if="classStats && selectedExam" class="stats-card">
          <div class="card-title">
            <span class="title-icon">📈</span>
            <span>{{ activeClassId }} · {{ examTypeNames[selectedExam.examType] }}</span>
            <span class="title-date">
              {{ selectedExam.examDate.year }}.{{ selectedExam.examDate.month }}.{{ selectedExam.examDate.day }}
            </span>
          </div>

          <div class="stats-grid">
            <div class="stat-box">
              <span class="stat-num">{{ classStats.count }}</span>
              <span class="stat-label">参考人数</span>
            </div>
            <div class="stat-box">
              <span class="stat-num">{{ classStats.totalAvg }}</span>
              <span class="stat-label">总分均值</span>
            </div>
            <div class="stat-box highlight">
              <span class="stat-num">{{ classStats.highest }}</span>
              <span class="stat-label">最高总分</span>
            </div>
            <div class="stat-box">
              <span class="stat-num">{{ classStats.lowest }}</span>
              <span class="stat-label">最低总分</span>
            </div>
          </div>
        </div>

        <!-- 科目平均分 -->
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
                  <div
                    class="stat-bar-fill"
                    :style="{
                      width: (classStats.subjectAvgs[subj.key] || 0) + '%',
                      backgroundColor: getScoreColor(classStats.subjectAvgs[subj.key] || 0)
                    }"
                  ></div>
                </div>
                <div class="stat-meta">
                  <span class="stat-avg">均{{ classStats.subjectAvgs[subj.key] }}</span>
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
            <div
              v-for="(student, idx) in studentRankings"
              :key="student.name"
              class="full-rank-item"
              :class="{ expanded: selectedStudent === student.name }"
              @click="selectStudent(student.name)"
            >
              <div class="rank-main-row">
                <span class="rank-badge" :class="'rank-' + (idx + 1)">{{ getRankIcon(idx + 1) }}</span>
                <span class="rank-name">{{ student.name }}</span>
                <span class="rank-avg">均{{ student.avg }}</span>
                <span class="rank-total">{{ student.total }}分</span>
                <span class="expand-arrow" :class="{ rotated: selectedStudent === student.name }">▾</span>
              </div>
              <!-- 展开的详细分数 -->
              <transition name="slide-down">
                <div v-if="selectedStudent === student.name && selectedStudentScores" class="rank-detail">
                  <div class="detail-grid">
                    <div v-for="subj in subjectList" :key="subj.key" class="detail-cell">
                      <span class="detail-subj">{{ subj.icon }}{{ subj.name }}</span>
                      <span class="detail-score" :style="{ color: getScoreColor(selectedStudentScores[subj.key] || 0) }">
                        {{ selectedStudentScores[subj.key] || 0 }}
                      </span>
                      <span class="detail-grade" :style="{ color: getScoreColor(selectedStudentScores[subj.key] || 0) }">
                        {{ getScoreGrade(selectedStudentScores[subj.key] || 0) }}
                      </span>
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
  </div>
</template>

<style scoped>
.report-content {
  padding: 16px;
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

/* 考试选择器 */
.exam-selector-card {
  background: white;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.exam-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.exam-tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  border: 1px solid #e0e0e0;
  background: #f9f9f9;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.exam-tab-btn.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white;
  border-color: #1e3c72;
}
.tab-type { font-size: 12px; font-weight: 600; }
.tab-date { font-size: 10px; opacity: 0.7; margin-top: 2px; }

/* 班级选择器 */
.class-selector-card {
  background: white;
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  gap: 8px;
}
.selector-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: #555;
}
.class-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.class-chip {
  padding: 5px 14px;
  border: 1px solid #e0e0e0;
  background: #f5f5f5;
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s;
  white-space: nowrap;
}
.class-chip.active {
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white;
  border-color: #1e3c72;
}

/* 通用卡片标题 */
.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #333;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}
.title-icon { font-size: 16px; }
.title-date {
  margin-left: auto;
  font-size: 11px;
  color: #aaa;
  font-weight: normal;
}
.title-count {
  margin-left: auto;
  font-size: 11px;
  color: #888;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ==================== 学生成绩卡 ==================== */
.scores-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.subject-list { display: flex; flex-direction: column; gap: 10px; }

.subject-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.subj-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.subj-name { width: 32px; font-size: 12px; color: #555; font-weight: 500; flex-shrink: 0; }

.score-bar-track {
  flex: 1;
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}
.score-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}

.subj-score {
  width: 28px;
  text-align: right;
  font-weight: bold;
  font-size: 13px;
  flex-shrink: 0;
}
.subj-grade {
  width: 22px;
  text-align: center;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
}

/* 总分/均分/排名 */
.summary-row {
  display: flex;
  justify-content: space-around;
  margin-top: 16px;
  padding: 12px;
  background: linear-gradient(135deg, #e8f4fd, #e3f0ff);
  border-radius: 10px;
  border: 1px solid #d0e3f5;
}
.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.summary-label { font-size: 11px; color: #888; }
.summary-value {
  font-size: 20px;
  font-weight: bold;
  color: #1e3c72;
}
.summary-value.rank-value { color: #e65100; }
.summary-value small { font-size: 12px; color: #999; font-weight: normal; }

/* ==================== 排名卡 ==================== */
.ranking-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.ranking-list { display: flex; flex-direction: column; gap: 6px; }

.ranking-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafafa;
  transition: background 0.2s;
}
.ranking-item.is-player {
  background: #fff8e1;
  border: 1px solid #ffcc80;
}

.rank-badge {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  border-radius: 6px;
  flex-shrink: 0;
}
.rank-badge.rank-1 { font-size: 16px; }
.rank-badge.rank-2 { font-size: 16px; }
.rank-badge.rank-3 { font-size: 16px; }
.rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) {
  background: #f0f0f0;
  color: #888;
  font-size: 11px;
}

.rank-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rank-avg {
  font-size: 11px;
  color: #888;
  flex-shrink: 0;
}
.rank-total {
  font-weight: bold;
  font-size: 13px;
  color: #1e3c72;
  flex-shrink: 0;
}

/* ==================== 教师统计卡 ==================== */
.stats-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 4px;
  background: #f8f9fa;
  border-radius: 10px;
}
.stat-box.highlight { background: #e8f5e9; }
.stat-num {
  font-size: 18px;
  font-weight: bold;
  color: #1e3c72;
}
.stat-box.highlight .stat-num { color: #2e7d32; }
.stat-label { font-size: 10px; color: #888; margin-top: 2px; }

/* 各科统计 */
.subject-stats-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.subject-stats-list { display: flex; flex-direction: column; gap: 10px; }

.subject-stat-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.subject-stat-row .subj-icon { margin-top: 2px; }
.subject-stat-row .subj-name { margin-top: 2px; }

.stat-bar-area { flex: 1; }
.stat-bar-track {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}
.stat-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.stat-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: #888;
}
.stat-avg { color: #1e3c72; font-weight: 600; }
.stat-pass { color: #ff9800; }
.stat-excellent { color: #4caf50; }

/* ==================== 全班排名（教师） ==================== */
.full-ranking-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.full-ranking-list { display: flex; flex-direction: column; gap: 4px; }

.full-rank-item {
  border-radius: 8px;
  background: #fafafa;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.2s;
}
.full-rank-item:hover { background: #f0f4ff; }
.full-rank-item.expanded { background: #e8f0fe; }

.rank-main-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
.expand-arrow {
  font-size: 12px;
  color: #aaa;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.expand-arrow.rotated { transform: rotate(180deg); }

/* 展开的学生详情 */
.rank-detail {
  padding: 8px 12px 12px;
  border-top: 1px solid #e0e0e0;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 6px;
}
.detail-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: white;
  border-radius: 6px;
  font-size: 11px;
}
.detail-subj { color: #666; flex: 1; white-space: nowrap; }
.detail-score { font-weight: bold; font-size: 12px; }
.detail-grade { font-size: 10px; font-weight: bold; }

/* 展开动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  max-height: 200px;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
