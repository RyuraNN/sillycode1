<!-- 单角色双方案对比卡片 -->
<script setup>
const props = defineProps({
  character: { type: Object, required: true },
  choice: { type: String, default: '' } // 'suitable' | 'interesting' | ''
})

const emit = defineEmits(['select'])

function getPlanDisplay(plan) {
  if (!plan?.assignment) return null
  const a = plan.assignment
  const roleLabels = {
    student: '学生',
    headTeacher: '班主任',
    subjectTeacher: '科任老师',
    staff: '职工',
    external: '校外人员'
  }
  return {
    classId: a.classId,
    role: roleLabels[a.role] || a.role,
    subject: a.subject,
    reason: a.reason,
    teachings: plan.teachings || [],
    workplaceId: a.workplaceId,
    workplaceName: a.workplaceName,
    staffTitle: a.staffTitle,
    isWorkplace: a.type === 'workplace_assignment'
  }
}

const suitablePlan = getPlanDisplay(props.character.suitable)
const interestingPlan = getPlanDisplay(props.character.interesting)

const roleIcon = props.character.role === 'teacher' ? '👩‍🏫' : props.character.role === 'staff' ? '🔧' : props.character.role === 'external' ? '🏢' : '👩‍🎓'
</script>

<template>
  <div class="compare-card">
    <div class="card-header">
      <span class="char-icon">{{ roleIcon }}</span>
      <span class="char-name">{{ character.name }}</span>
      <span class="char-origin">{{ character.origin }}</span>
    </div>
    <div class="compare-columns">
      <!-- 方案A: 更合适 -->
      <div
        class="plan-column"
        :class="{ selected: choice === 'suitable', disabled: !suitablePlan }"
        @click="suitablePlan && emit('select', 'suitable')"
      >
        <div class="plan-label">
          <span class="radio">{{ choice === 'suitable' ? '◉' : '○' }}</span>
          更合适
        </div>
        <template v-if="suitablePlan">
          <div class="plan-detail">
            <span class="detail-arrow">→</span>
            <span v-if="suitablePlan.isWorkplace && suitablePlan.workplaceName" class="detail-workplace">📍 {{ suitablePlan.workplaceName }}</span>
            <span v-else class="detail-class">{{ suitablePlan.classId }}</span>
            <span class="detail-role">{{ suitablePlan.role }}</span>
            <span v-if="suitablePlan.subject" class="detail-subject">{{ suitablePlan.subject }}</span>
            <span v-if="suitablePlan.staffTitle" class="detail-staff-title">{{ suitablePlan.staffTitle }}</span>
          </div>
          <div v-if="suitablePlan.reason" class="plan-reason">{{ suitablePlan.reason }}</div>
          <div v-if="suitablePlan.teachings.length > 0" class="plan-teachings">
            <div v-for="(t, i) in suitablePlan.teachings" :key="i" class="teaching-item">
              📚 {{ t.courseName }} ({{ t.courseType === 'required' ? '必修' : '选修' }})
            </div>
          </div>
        </template>
        <div v-else class="plan-empty">无方案</div>
      </div>

      <!-- 方案B: 更有趣 -->
      <div
        class="plan-column"
        :class="{ selected: choice === 'interesting', disabled: !interestingPlan }"
        @click="interestingPlan && emit('select', 'interesting')"
      >
        <div class="plan-label">
          <span class="radio">{{ choice === 'interesting' ? '◉' : '○' }}</span>
          更有趣
        </div>
        <template v-if="interestingPlan">
          <div class="plan-detail">
            <span class="detail-arrow">→</span>
            <span v-if="interestingPlan.isWorkplace && interestingPlan.workplaceName" class="detail-workplace">📍 {{ interestingPlan.workplaceName }}</span>
            <span v-else class="detail-class">{{ interestingPlan.classId }}</span>
            <span class="detail-role">{{ interestingPlan.role }}</span>
            <span v-if="interestingPlan.subject" class="detail-subject">{{ interestingPlan.subject }}</span>
            <span v-if="interestingPlan.staffTitle" class="detail-staff-title">{{ interestingPlan.staffTitle }}</span>
          </div>
          <div v-if="interestingPlan.reason" class="plan-reason">{{ interestingPlan.reason }}</div>
          <div v-if="interestingPlan.teachings.length > 0" class="plan-teachings">
            <div v-for="(t, i) in interestingPlan.teachings" :key="i" class="teaching-item">
              📚 {{ t.courseName }} ({{ t.courseType === 'required' ? '必修' : '选修' }})
            </div>
          </div>
        </template>
        <div v-else class="plan-empty">无方案</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare-card {
  background: #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #3a3a3a;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #333;
  border-bottom: 1px solid #444;
}
.char-icon { font-size: 16px; }
.char-name { font-weight: 600; color: #fff; font-size: 14px; }
.char-origin { color: #888; font-size: 12px; margin-left: auto; }
.compare-columns {
  display: flex;
  gap: 1px;
  background: #444;
}
.plan-column {
  flex: 1;
  padding: 12px;
  background: #2a2a2a;
  cursor: pointer;
  transition: background 0.2s;
  min-width: 0;
}
.plan-column:hover:not(.disabled) { background: #333; }
.plan-column.selected { background: rgba(76, 175, 80, 0.15); border-bottom: 2px solid #4CAF50; }
.plan-column.disabled { opacity: 0.5; cursor: default; }
.plan-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
}
.radio { font-size: 16px; color: #4CAF50; }
.plan-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.detail-arrow { color: #4CAF50; font-weight: bold; }
.detail-class {
  background: #1565C0;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.detail-role {
  background: #444;
  color: #ddd;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.detail-subject {
  background: #6A1B9A;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.detail-workplace {
  background: #E65100;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.detail-staff-title {
  background: #4527A0;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.plan-reason {
  color: #999;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 6px;
}
.plan-teachings { margin-top: 6px; }
.teaching-item {
  font-size: 11px;
  color: #aaa;
  padding: 2px 0;
}
.plan-empty {
  color: #666;
  font-size: 12px;
  font-style: italic;
}

@media (max-width: 768px) {
  .compare-columns { flex-direction: column; }
  .plan-column { padding: 10px; }
}
</style>
