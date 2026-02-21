<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { SUBJECT_MAP } from '../data/academicData'

const gameStore = useGameStore()
const isTeacher = computed(() => gameStore.player.role === 'teacher')
const data = computed(() => gameStore.weeklyPreviewData)

const subjectNames = {
  literature: '语文', math: '数学', english: '英语',
  humanities: '文综', sciences: '理综', art: '艺术', sports: '体育'
}
const subjectIcons = {
  literature: '📖', math: '📐', english: '🔤',
  humanities: '🌍', sciences: '🔬', art: '🎨', sports: '⚽'
}

function close() {
  gameStore.showWeeklyPreview = false
  gameStore.lastViewedWeeklyPreview = gameStore.lastWeeklyPreviewWeek
}

function getDeltaColor(d) {
  if (d > 0) return '#4caf50'
  if (d < 0) return '#f44336'
  return '#999'
}
function getDeltaArrow(d) {
  if (d > 0) return '↑'
  if (d < 0) return '↓'
  return '→'
}
</script>

<template>
  <div v-if="gameStore.showWeeklyPreview && data" class="weekly-overlay" @click.self="close">
    <div class="weekly-modal">
      <div class="weekly-header">
        <span class="weekly-title">📅 第 {{ data.week }} 周学业回顾</span>
        <button class="weekly-close" @click="close">✕</button>
      </div>

      <div class="weekly-body">
        <!-- ==================== 学生视角 ==================== -->
        <template v-if="!isTeacher && data.playerChanges">
          <div class="section-title">📊 本周学业变化</div>
          <div class="subject-changes">
            <div v-for="(delta, key) in data.playerChanges.subjectDeltas" :key="key" class="change-row">
              <span class="change-icon">{{ subjectIcons[key] || '📚' }}</span>
              <span class="change-name">{{ subjectNames[key] || key }}</span>
              <span class="change-delta" :style="{ color: getDeltaColor(delta) }">
                {{ getDeltaArrow(delta) }} {{ delta > 0 ? '+' : '' }}{{ delta }}
              </span>
            </div>
          </div>
          <div class="mood-row">
            <span>😊 心境变化：</span>
            <span :style="{ color: getDeltaColor(data.playerChanges.motivationDelta) }">
              {{ getDeltaArrow(data.playerChanges.motivationDelta) }}
              {{ data.playerChanges.motivationDelta > 0 ? '+' : '' }}{{ data.playerChanges.motivationDelta }}
            </span>
          </div>
        </template>
<!-- PLACEHOLDER_TEACHER_SECTION -->
        <!-- ==================== 教师视角 ==================== -->
        <template v-if="isTeacher">
          <div class="section-title">📊 班级动力变化</div>
          <div class="mood-row">
            <span>平均动力变化：</span>
            <span :style="{ color: getDeltaColor(data.avgMotivationDelta) }">
              {{ getDeltaArrow(data.avgMotivationDelta) }}
              {{ data.avgMotivationDelta > 0 ? '+' : '' }}{{ data.avgMotivationDelta }}
            </span>
            <span class="mood-count">（{{ data.npcCount }}名学生）</span>
          </div>

          <div v-if="data.top3?.length" class="section-title">🚀 成长最快 TOP3</div>
          <div v-if="data.top3?.length" class="top-list">
            <div v-for="(item, idx) in data.top3" :key="idx" class="top-item">
              <span class="top-rank">{{ ['🥇','🥈','🥉'][idx] }}</span>
              <span class="top-name">{{ item.name }}</span>
              <span class="top-delta" style="color: #4caf50">+{{ item.totalExpDelta }}</span>
            </div>
          </div>

          <div v-if="data.motivationWarnings?.length" class="section-title">⚠️ 动力下降预警</div>
          <div v-if="data.motivationWarnings?.length" class="warn-list">
            <div v-for="(item, idx) in data.motivationWarnings" :key="idx" class="warn-item">
              <span class="warn-name">{{ item.name }}</span>
              <span class="warn-delta" style="color: #f44336">{{ item.motivationDelta }}</span>
            </div>
          </div>
        </template>

        <!-- 升级事件 -->
        <template v-if="data.levelUps?.length">
          <div class="section-title">🎉 升级事件</div>
          <div class="levelup-list">
            <div v-for="(lu, idx) in data.levelUps" :key="idx" class="levelup-item">
              <span>{{ lu.name }} 的 {{ subjectNames[lu.subject] || lu.subject }} 升级：{{ lu.from }} → {{ lu.to }}</span>
            </div>
          </div>
        </template>

        <!-- 一句话总结 -->
        <div class="weekly-summary-text">
          <template v-if="!isTeacher">
            {{ data.playerChanges?.motivationDelta >= 0 ? '本周状态不错，继续保持！💪' : '本周有些疲惫，注意休息调整。🌙' }}
          </template>
          <template v-else>
            {{ data.avgMotivationDelta >= 0 ? '班级整体状态良好，继续加油！📚' : '部分学生动力下降，需要关注。🔔' }}
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
<!-- PLACEHOLDER_MODAL_STYLE -->

<style scoped>
.weekly-overlay {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.weekly-modal {
  background: linear-gradient(180deg, #e8f4fd 0%, #ffffff 30%);
  border-radius: 16px; width: 100%; max-height: 90%;
  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.weekly-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #e0e8f0;
}
.weekly-title { font-size: 15px; font-weight: 700; color: #1e3c72; }
.weekly-close {
  width: 28px; height: 28px; border: none; background: #f0f0f0;
  border-radius: 50%; cursor: pointer; font-size: 14px; color: #666;
  display: flex; align-items: center; justify-content: center;
}
.weekly-body { padding: 14px 16px; }

.section-title {
  font-size: 13px; font-weight: 700; color: #333;
  margin: 12px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #eee;
}
.section-title:first-child { margin-top: 0; }

.subject-changes { display: flex; flex-direction: column; gap: 4px; }
.change-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; background: #f8f9fa; border-radius: 6px;
}
.change-icon { font-size: 14px; width: 20px; text-align: center; }
.change-name { flex: 1; font-size: 12px; color: #555; }
.change-delta { font-size: 13px; font-weight: 600; }

.mood-row {
  display: flex; align-items: center; gap: 6px;
  padding: 8px; background: #f8f9fa; border-radius: 8px;
  font-size: 13px; margin-top: 8px;
}
.mood-count { font-size: 11px; color: #999; }

.top-list, .warn-list, .levelup-list {
  display: flex; flex-direction: column; gap: 4px;
}
.top-item, .warn-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; background: #f8f9fa; border-radius: 6px; font-size: 12px;
}
.top-rank { font-size: 16px; }
.top-name, .warn-name { flex: 1; font-weight: 500; }
.top-delta, .warn-delta { font-weight: 700; font-size: 13px; }

.levelup-item {
  padding: 5px 8px; background: #fff8e1; border-radius: 6px;
  font-size: 12px; color: #f57f17;
}

.weekly-summary-text {
  margin-top: 16px; padding: 10px 12px;
  background: linear-gradient(135deg, #e3f0ff, #e8f4fd);
  border-radius: 10px; font-size: 13px; color: #1e3c72;
  text-align: center; font-weight: 500;
}
</style>
