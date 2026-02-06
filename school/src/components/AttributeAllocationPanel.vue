<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  },
  baseStats: {
    type: Object,
    required: true
  },
  remainingPoints: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['update:modelValue'])

// 属性定义
const attributesList = [
  { key: 'iq', label: '智商' },
  { key: 'eq', label: '情商' },
  { key: 'physique', label: '体能' },
  { key: 'flexibility', label: '灵活' },
  { key: 'charm', label: '魅力' },
  { key: 'mood', label: '心境' }
]

const subjectsList = [
  { key: 'literature', label: '语文' },
  { key: 'math', label: '数学' },
  { key: 'english', label: '外语' },
  { key: 'humanities', label: '文科综合' },
  { key: 'sciences', label: '理科综合' },
  { key: 'art', label: '艺术' },
  { key: 'sports', label: '体育' }
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

const isBatchMode = ref(false)

const updateValue = (category, key, delta, cost = 1) => {
  const step = isBatchMode.value ? 5 : 1
  const actualDelta = delta * step
  const actualCost = cost * step

  const newValue = JSON.parse(JSON.stringify(props.modelValue))
  if (!newValue[category]) newValue[category] = {}
  
  const currentValue = newValue[category][key] || 0
  
  // 检查是否可以增加
  if (delta > 0) {
    if (props.remainingPoints < actualCost) return
    
    // 软上限检查 (仅针对基础属性)
    if (category === 'attributes') {
      const currentTotal = getTotal(category, key)
      const potentialTotal = getTotal('potentials', key)
      if (currentTotal + actualDelta > potentialTotal) {
        alert(`属性值不能超过潜力上限 (${potentialTotal})`)
        return
      }
    }
  }
  
  // 检查是否可以减少
  if (delta < 0) {
    // 减少时也要考虑 step，不能减到负数
    if (currentValue + actualDelta < 0) return
  }

  newValue[category][key] = currentValue + actualDelta
  emit('update:modelValue', newValue)
}

// 设置指定加点数值（直接输入）
const setAddedValue = (category, key, event, cost = 1) => {
  let targetVal = parseInt(event.target.value)
  if (isNaN(targetVal)) targetVal = 0
  if (targetVal < 0) targetVal = 0

  const currentVal = props.modelValue[category]?.[key] || 0
  const delta = targetVal - currentVal
  
  if (delta === 0) return

  const actualCost = delta * cost
  
  // 检查点数是否足够
  if (delta > 0) {
    if (props.remainingPoints < actualCost) {
      // 计算最大可加点数
      const maxAddable = Math.floor(props.remainingPoints / cost)
      targetVal = currentVal + maxAddable
      // 强制更新输入框显示
      event.target.value = targetVal
    }
  }

  // 软上限检查 (仅针对基础属性)
  if (category === 'attributes') {
    const base = props.baseStats[category]?.[key] || 0
    const potentialTotal = getTotal('potentials', key)
    
    if (base + targetVal > potentialTotal) {
      targetVal = potentialTotal - base
      if (targetVal < 0) targetVal = 0
      event.target.value = targetVal
    }
  }

  const newValue = JSON.parse(JSON.stringify(props.modelValue))
  if (!newValue[category]) newValue[category] = {}
  
  newValue[category][key] = targetVal
  emit('update:modelValue', newValue)
}

// 获取当前总值 (基础 + 分配)
const getTotal = (category, key) => {
  const base = props.baseStats[category]?.[key] || 0
  const added = props.modelValue[category]?.[key] || 0
  return base + added
}
</script>

<template>
  <div class="allocation-panel">
    <div class="header-row">
      <h3 class="section-title">七、属性分配</h3>
      <div class="batch-switch">
        <label>
          <input type="checkbox" v-model="isBatchMode"> 批量加点 (x5)
        </label>
      </div>
    </div>
    
    <div class="points-info">
      剩余可用点数：<span :class="{ 'no-points': remainingPoints <= 0 }">{{ remainingPoints }}</span>
    </div>

    <div class="attributes-grid">
      <div v-for="attr in attributesList" :key="attr.key" class="attr-row">
        <div class="attr-main">
          <div class="attr-label">{{ attr.label }}</div>
          <div class="attr-controls">
            <button 
              class="control-btn" 
              @click="updateValue('attributes', attr.key, -1)"
              :disabled="!modelValue.attributes?.[attr.key] || (isBatchMode && modelValue.attributes?.[attr.key] < 5)"
            >-</button>
            <span class="attr-value">{{ getTotal('attributes', attr.key) }}</span>
            <input 
              type="number" 
              class="attr-input" 
              :value="modelValue.attributes?.[attr.key] || 0" 
              @change="e => setAddedValue('attributes', attr.key, e)"
              min="0"
            />
            <button 
              class="control-btn" 
              @click="updateValue('attributes', attr.key, 1)"
              :disabled="remainingPoints < (isBatchMode ? 5 : 1) || getTotal('attributes', attr.key) + (isBatchMode ? 5 : 1) > getTotal('potentials', attr.key)"
            >+</button>
          </div>
        </div>
        
        <div class="attr-sub">
          <div class="sub-label">潜力</div>
          <div class="attr-controls small">
            <button 
              class="control-btn small" 
              @click="updateValue('potentials', attr.key, -1, 2)"
              :disabled="!modelValue.potentials?.[attr.key] || (isBatchMode && modelValue.potentials?.[attr.key] < 5)"
            >-</button>
            <span class="attr-value small">{{ getTotal('potentials', attr.key) }}</span>
            <input 
              type="number" 
              class="attr-input small" 
              :value="modelValue.potentials?.[attr.key] || 0" 
              @change="e => setAddedValue('potentials', attr.key, e, 2)"
              min="0"
            />
            <button 
              class="control-btn small" 
              @click="updateValue('potentials', attr.key, 1, 2)"
              :disabled="remainingPoints < (isBatchMode ? 10 : 2)"
            >+</button>
          </div>
        </div>
      </div>
    </div>

    <div class="extra-options-section">
      <div class="extra-options-content">
        <h4 class="sub-title">学科知识</h4>
        <div class="attributes-grid simple">
          <div v-for="subj in subjectsList" :key="subj.key" class="attr-item">
            <div class="attr-label">{{ subj.label }}</div>
            <div class="attr-controls">
              <button 
                class="control-btn" 
                @click="updateValue('subjects', subj.key, -1)"
                :disabled="!modelValue.subjects?.[subj.key] || (isBatchMode && modelValue.subjects?.[subj.key] < 5)"
              >-</button>
              <span class="attr-value">{{ getTotal('subjects', subj.key) }}</span>
              <input 
                type="number" 
                class="attr-input" 
                :value="modelValue.subjects?.[subj.key] || 0" 
                @change="e => setAddedValue('subjects', subj.key, e)"
                min="0"
              />
              <button 
                class="control-btn" 
                @click="updateValue('subjects', subj.key, 1)"
                :disabled="remainingPoints < (isBatchMode ? 5 : 1)"
              >+</button>
            </div>
          </div>
        </div>

        <h4 class="sub-title">生活技能</h4>
        <div class="attributes-grid simple">
          <div v-for="skill in skillsList" :key="skill.key" class="attr-item">
            <div class="attr-label" style="width: 80px;">{{ skill.label }}</div>
            <div class="attr-controls">
              <button 
                class="control-btn" 
                @click="updateValue('skills', skill.key, -1)"
                :disabled="!modelValue.skills?.[skill.key] || (isBatchMode && modelValue.skills?.[skill.key] < 5)"
              >-</button>
              <span class="attr-value">{{ getTotal('skills', skill.key) }}</span>
              <input 
                type="number" 
                class="attr-input" 
                :value="modelValue.skills?.[skill.key] || 0" 
                @change="e => setAddedValue('skills', skill.key, e)"
                min="0"
              />
              <button 
                class="control-btn" 
                @click="updateValue('skills', skill.key, 1)"
                :disabled="remainingPoints < (isBatchMode ? 5 : 1)"
              >+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.allocation-panel {
  width: 100%;
  margin-bottom: 2rem;
  text-align: left;
  border-top: 1px dashed #d32f2f;
  padding-top: 20px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #d32f2f;
  padding-bottom: 5px;
  margin-bottom: 10px;
}

.section-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.8rem;
  color: #333;
  margin: 0;
  border: none;
  padding: 0;
}

.batch-switch {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 1rem;
  color: #555;
  background: rgba(255, 255, 255, 0.5);
  padding: 2px 8px;
  border-radius: 4px;
}

.desc-text {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 15px;
}

.points-info {
  text-align: right;
  margin-bottom: 15px;
  font-weight: bold;
  color: #555;
  font-size: 1.2rem;
}

.no-points {
  color: #d32f2f;
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}

.attributes-grid.simple {
  grid-template-columns: repeat(2, 1fr);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .attributes-grid, .attributes-grid.simple {
    grid-template-columns: 1fr;
  }
}

.attr-row {
  background-color: rgba(255, 255, 255, 0.5);
  padding: 10px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  border-top: 1px dashed #ccc;
  padding-top: 5px;
}

.sub-label {
  font-size: 0.9rem;
  color: #666;
}

.attr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 8px;
  border-radius: 4px;
}

.attr-label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.3rem;
  color: #333;
}

.attr-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attr-controls.small {
  gap: 5px;
}

.control-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #888;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.1rem;
  transition: all 0.2s;
}

.control-btn.small {
  width: 22px;
  height: 22px;
  font-size: 0.9rem;
}

.control-btn:hover:not(:disabled) {
  background-color: #f0f0f0;
  border-color: #d32f2f;
  color: #d32f2f;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.attr-value {
  font-weight: bold;
  min-width: 25px;
  text-align: center;
  font-size: 1.1rem;
}

.attr-value.small {
  font-size: 0.9rem;
  color: #555;
}

.attr-added {
  font-size: 0.8rem;
  color: #2e7d32;
}

.attr-added.small {
  font-size: 0.75rem;
}

.extra-options-section {
  margin-top: 20px;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
}

.sub-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.3rem;
  color: #444;
  margin: 15px 0 10px 0;
  border-left: 3px solid #d32f2f;
  padding-left: 10px;
}

.attr-input {
  width: 45px;
  height: 24px;
  padding: 0 2px;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
  font-size: 0.95rem;
  background-color: rgba(255, 255, 255, 0.8);
  font-weight: bold;
  color: #2e7d32; /* Match the original added text color */
}

.attr-input:focus {
  border-color: #d32f2f;
  outline: none;
  background-color: #fff;
}

.attr-input.small {
  width: 35px;
  height: 20px;
  font-size: 0.85rem;
}
</style>
