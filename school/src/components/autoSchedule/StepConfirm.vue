<!-- Step3: 确认摘要 + 社团生成 + 同步 -->
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  scheduleResults: { type: Object, default: () => ({ characters: [], newClasses: {} }) },
  choices: { type: Object, default: () => ({}) },
  fullRosterSnapshot: { type: Object, default: () => ({}) },
  generating: { type: Boolean, default: false },
  clubResults: { type: Array, default: () => [] },
  unresolvedLocations: { type: Array, default: () => [] }
})

const emit = defineEmits(['back', 'confirm', 'generate-clubs', 'preview-clubs', 'resolve-location'])

const clubMode = ref('none') // 'none' | 'original' | 'creative'

// 汇总统计
const summary = computed(() => {
  const chars = props.scheduleResults?.characters || []
  const ch = props.choices || {}
  let studentCount = 0
  let teacherCount = 0
  let headTeacherCount = 0
  let subjectTeacherCount = 0
  let staffCount = 0
  let externalCount = 0
  let newCourseCount = 0
  const classChanges = {} // { classId: { addStudents: [], addTeachers: [], headTeacher: '' } }
  const newClassIds = new Set()

  for (const [charName, planType] of Object.entries(ch)) {
    const charResult = chars.find(c => c.name === charName)
    if (!charResult) continue
    const plan = charResult[planType]
    if (!plan?.assignment) continue

    const { role, classId, subject } = plan.assignment

    // workplace_assignment 类型
    if (plan.assignment.type === 'workplace_assignment') {
      if (role === 'staff' || plan.assignment.role === 'staff') staffCount++
      else externalCount++
      continue
    }

    if (classId) {
      if (!classChanges[classId]) {
        classChanges[classId] = { addStudents: [], addTeachers: [], headTeacher: '' }
      }
    }

    if (role === 'student') {
      studentCount++
      if (classId) classChanges[classId].addStudents.push(charName)
    } else if (role === 'headTeacher') {
      teacherCount++
      headTeacherCount++
      if (classId) classChanges[classId].headTeacher = charName
    } else if (role === 'subjectTeacher') {
      teacherCount++
      subjectTeacherCount++
      if (classId) classChanges[classId].addTeachers.push(`${charName}(${subject || '未定'})`)
    } else if (role === 'staff') {
      staffCount++
    } else if (role === 'external') {
      externalCount++
    }

    // 统计新课程
    if (plan.teachings && plan.teachings.length > 0) {
      newCourseCount += plan.teachings.length
    }

    // 检查是否是新班级
    if (classId && !props.fullRosterSnapshot[classId]) {
      newClassIds.add(classId)
    }
  }

  // 统计涉及的班级数
  const affectedClassCount = Object.keys(classChanges).length

  return {
    studentCount,
    teacherCount,
    headTeacherCount,
    subjectTeacherCount,
    staffCount,
    externalCount,
    newCourseCount,
    affectedClassCount,
    newClassCount: newClassIds.size,
    classChanges
  }
})

function handleConfirm() {
  emit('confirm', { clubMode: clubMode.value })
}

function handleGenerateClubs() {
  if (clubMode.value !== 'none') {
    emit('generate-clubs', clubMode.value)
  }
}
</script>

<template>
  <div class="step-confirm">
    <div class="confirm-content">
      <!-- 排班摘要 -->
      <div class="summary-section">
        <h3>📊 排班摘要</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">学生分配</span>
            <span class="summary-value">{{ summary.studentCount }}人 → {{ summary.affectedClassCount }}个班级</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">教师分配</span>
            <span class="summary-value">
              {{ summary.teacherCount }}人
              (班主任{{ summary.headTeacherCount }}, 科任{{ summary.subjectTeacherCount }})
            </span>
          </div>
          <div v-if="summary.newCourseCount > 0" class="summary-item">
            <span class="summary-label">新增课程</span>
            <span class="summary-value">{{ summary.newCourseCount }}门</span>
          </div>
          <div v-if="summary.newClassCount > 0" class="summary-item">
            <span class="summary-label">新建班级</span>
            <span class="summary-value highlight">{{ summary.newClassCount }}个</span>
          </div>
          <div v-if="summary.staffCount > 0" class="summary-item">
            <span class="summary-label">职工分配</span>
            <span class="summary-value">🔧 {{ summary.staffCount }}人</span>
          </div>
          <div v-if="summary.externalCount > 0" class="summary-item">
            <span class="summary-label">校外人员</span>
            <span class="summary-value">🏢 {{ summary.externalCount }}人</span>
          </div>
        </div>
      </div>

      <!-- 未解析地点警告 -->
      <div v-if="unresolvedLocations.length > 0" class="unresolved-warning">
        <h4>⚠️ 以下工作地点在地图中不存在，需要手动创建：</h4>
        <div v-for="loc in unresolvedLocations" :key="loc.charName" class="unresolved-item">
          <span class="unresolved-info">{{ loc.charName }} → {{ loc.workplaceName }} ({{ loc.workplaceId }})</span>
          <button class="btn-resolve" @click="$emit('resolve-location', loc)">📍 创建地点</button>
        </div>
      </div>

      <!-- 班级预览 -->
      <div class="class-preview-section">
        <h3>班级预览</h3>
        <div class="class-list">
          <div v-for="(changes, classId) in summary.classChanges" :key="classId" class="class-item">
            <span class="class-id">{{ classId }}</span>
            <span v-if="changes.addStudents.length" class="class-change">+{{ changes.addStudents.length }}学生</span>
            <span v-if="changes.headTeacher" class="class-change ht">班主任:{{ changes.headTeacher }}</span>
            <span v-if="changes.addTeachers.length" class="class-change teacher">+{{ changes.addTeachers.length }}科任</span>
          </div>
        </div>
      </div>

      <!-- 社团生成 -->
      <div class="club-section">
        <h3>🏫 社团自动生成 (可选)</h3>
        <div class="club-mode-select">
          <label class="radio-label" :class="{ active: clubMode === 'none' }">
            <input type="radio" v-model="clubMode" value="none" /> 不生成
          </label>
          <label class="radio-label" :class="{ active: clubMode === 'original' }">
            <input type="radio" v-model="clubMode" value="original" /> 原作向
          </label>
          <label class="radio-label" :class="{ active: clubMode === 'creative' }">
            <input type="radio" v-model="clubMode" value="creative" /> 原创向
          </label>
        </div>
        <button
          v-if="clubMode !== 'none'"
          class="btn-preview-clubs"
          :disabled="generating"
          @click="handleGenerateClubs"
        >
          {{ generating ? '生成中...' : '预览社团...' }}
        </button>
        <div v-if="clubResults.length > 0" class="club-preview-list">
          <div v-for="club in clubResults" :key="club.id" class="club-preview-item">
            <span class="club-name">{{ club.name }}</span>
            <span class="club-members">{{ club.members?.length || 0 }}人</span>
            <span class="club-advisor">指导:{{ club.advisor || '无' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="step-footer">
      <button class="btn-back" @click="emit('back')">← 返回修改</button>
      <div class="confirm-warning">⚠️ 确认后将同步到世界书</div>
      <button class="btn-confirm" @click="handleConfirm">
        ✅ 确认并同步
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-confirm {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.confirm-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.summary-section, .class-preview-section, .club-section {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.summary-section h3, .class-preview-section h3, .club-section h3 {
  margin: 0 0 12px;
  color: #fff;
  font-size: 15px;
}
.summary-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #333;
}
.summary-label { color: #999; font-size: 13px; }
.summary-value { color: #ddd; font-size: 13px; font-weight: 500; }
.summary-value.highlight { color: #ff9800; }
.class-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.class-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #333;
  border-radius: 4px;
  flex-wrap: wrap;
}
.class-id {
  font-weight: 600;
  color: #fff;
  font-size: 13px;
  min-width: 60px;
}
.class-change {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(76,175,80,0.2);
  color: #81C784;
}
.class-change.ht { background: rgba(33,150,243,0.2); color: #64B5F6; }
.class-change.teacher { background: rgba(156,39,176,0.2); color: #CE93D8; }
.club-mode-select {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #333;
  border-radius: 6px;
  cursor: pointer;
  color: #aaa;
  font-size: 13px;
  transition: all 0.2s;
}
.radio-label.active { background: rgba(76,175,80,0.15); color: #4CAF50; }
.radio-label input[type="radio"] { accent-color: #4CAF50; }
.btn-preview-clubs {
  padding: 8px 16px;
  background: #1565C0;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-preview-clubs:hover:not(:disabled) { background: #0D47A1; }
.btn-preview-clubs:disabled { opacity: 0.5; cursor: not-allowed; }
.club-preview-list { margin-top: 12px; }
.club-preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #333;
  border-radius: 4px;
  margin-bottom: 4px;
}
.club-name { color: #fff; font-size: 13px; font-weight: 500; }
.club-members { color: #888; font-size: 11px; }
.club-advisor { color: #888; font-size: 11px; margin-left: auto; }
.step-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #222;
  border-top: 1px solid #444;
  flex-shrink: 0;
}
.confirm-warning { color: #ff9800; font-size: 12px; }
.unresolved-warning {
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
}
.unresolved-warning h4 {
  color: #ff9800;
  font-size: 13px;
  margin: 0 0 10px 0;
}
.unresolved-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #333;
  border-radius: 4px;
  margin-bottom: 4px;
}
.unresolved-info { color: #ddd; font-size: 13px; }
.btn-resolve {
  padding: 4px 10px;
  background: #E65100;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-resolve:hover { background: #BF360C; }
.btn-back, .btn-confirm {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-back { background: #444; color: #ccc; }
.btn-back:hover { background: #555; }
.btn-confirm { background: #4CAF50; color: white; }
.btn-confirm:hover { background: #45a049; }

@media (max-width: 768px) {
  .confirm-content { padding: 12px; }
  .club-mode-select { flex-wrap: wrap; }
  .step-footer { flex-wrap: wrap; gap: 8px; }
  .btn-back, .btn-confirm { flex: 1; text-align: center; }
  .confirm-warning { width: 100%; text-align: center; }
}
</style>
