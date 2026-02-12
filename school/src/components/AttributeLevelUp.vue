<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['close', 'save'])
const gameStore = useGameStore()

const isTeacher = computed(() => gameStore.player.role === 'teacher')

const attributesList = [
  { key: 'iq', label: '智商' },
  { key: 'eq', label: '情商' },
  { key: 'physique', label: '体能' },
  { key: 'flexibility', label: '灵活' },
  { key: 'charm', label: '魅力' },
  { key: 'mood', label: '心境' }
]

const skillsList = [
  { key: 'programming', label: '编程' },
  { key: 'painting', label: '绘画' },
  { key: 'guitar', label: '吉他演奏' },
  { key: 'piano', label: '钢琴演奏' },
  { key: 'urbanLegend', label: '都市传说' },
  { key: 'cooking', label: '烹饪' },
  { key: 'hacking', label: '黑客技术' },
  { key: 'socialMedia', label: '社媒运营' },
  { key: 'photography', label: '摄影' },
  { key: 'videoEditing', label: '视频编辑' }
]

const addPoint = (key) => {
  const current = gameStore.player.attributes[key]
  const potential = gameStore.player.potentials[key]
  
  if (current >= potential) {
    alert('该属性已达到潜力上限，无法继续提升！')
    return
  }
  
  gameStore.addAttribute(key)
  emit('save')
}

const addPotential = (key) => {
  if (gameStore.player.freePoints < 5) {
    alert('点数不足！提升1点潜力需要5点自由属性点。')
    return
  }
  gameStore.addPotential(key)
  emit('save')
}

const addSkill = (key) => {
  if (gameStore.player.freePoints < 1) {
    alert('点数不足！')
    return
  }
  gameStore.addSkillLevel(key)
  emit('save')
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>属性加点</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="points-info">
          剩余自由点数：<span class="points-value">{{ gameStore.player.freePoints }}</span>
        </div>
        
        <!-- 基础属性 (学生/教师通用) -->
        <div class="attributes-list">
          <div v-for="attr in attributesList" :key="attr.key" class="attr-group">
            <div class="attr-main">
              <span class="attr-label">{{ attr.label }}</span>
              <div class="attr-values">
                <span class="attr-current">{{ gameStore.player.attributes[attr.key] }}</span>
                <span class="attr-potential">/ {{ gameStore.player.potentials[attr.key] }}</span>
              </div>
              <button 
                class="add-btn" 
                @click="addPoint(attr.key)"
                :disabled="gameStore.player.freePoints <= 0 || gameStore.player.attributes[attr.key] >= gameStore.player.potentials[attr.key]"
                title="消耗1点"
              >+</button>
            </div>
            <!-- 潜力仅学生可提升，教师潜力默认足够高 -->
            <div v-if="!isTeacher" class="attr-sub">
              <span class="sub-label">提升潜力</span>
              <button 
                class="potential-btn" 
                @click="addPotential(attr.key)"
                :disabled="gameStore.player.freePoints < 5"
                title="消耗5点"
              >+1</button>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 生活技能 (教师优先显示，学生也显示) -->
        <div class="attributes-list">
          <div v-for="skill in skillsList" :key="skill.key" class="attr-group">
            <div class="attr-main">
              <span class="attr-label">{{ skill.label }}</span>
              <div class="attr-values">
                <span class="attr-current">Lv.{{ gameStore.player.skills[skill.key] }}</span>
              </div>
              <button 
                class="add-btn" 
                @click="addSkill(skill.key)"
                :disabled="gameStore.player.freePoints <= 0"
                title="消耗1点"
              >+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal-content {
  background-color: #fff;
  width: 320px;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 10px 15px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 15px;
  overflow-y: auto;
}

.points-info {
  text-align: center;
  margin-bottom: 15px;
  font-weight: bold;
  color: #555;
}

.points-value {
  color: #d32f2f;
  font-size: 1.2rem;
}

.attributes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.attr-group {
  background-color: #fafafa;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attr-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.attr-sub {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px dashed #ddd;
  padding-top: 4px;
}

.sub-label {
  font-size: 0.8rem;
  color: #888;
}

.attr-label {
  font-weight: bold;
  color: #444;
}

.attr-values {
  display: flex;
  align-items: center;
  gap: 2px;
}

.attr-current {
  color: #333;
  font-weight: bold;
}

.attr-potential {
  color: #999;
  font-size: 0.85rem;
}

.add-btn, .potential-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.add-btn {
  background-color: #8b4513;
  color: white;
}

.potential-btn {
  background-color: #fff;
  border: 1px solid #8b4513;
  color: #8b4513;
  width: 28px;
  font-size: 0.8rem;
}

.add-btn:disabled, .potential-btn:disabled {
  background-color: #ccc;
  border-color: #ccc;
  color: #fff;
  cursor: not-allowed;
}

.potential-btn:hover:not(:disabled) {
  background-color: #f5e6d3;
}
</style>
