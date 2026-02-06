<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  },
  maxPoints: {
    type: Number,
    default: 10
  },
  showMoney: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const showExtraOptions = ref(false)
const isCollapsed = ref(false)

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

// 计算已使用的加点数
const totalAddedPoints = computed(() => {
  let total = 0
  // 基础属性
  for (const key in props.modelValue.attributes) {
    total += props.modelValue.attributes[key]
  }
  // 学科
  for (const key in props.modelValue.subjects) {
    total += props.modelValue.subjects[key]
  }
  // 技能
  for (const key in props.modelValue.skills) {
    total += props.modelValue.skills[key]
  }
  return total
})

const remainingPoints = computed(() => props.maxPoints - totalAddedPoints.value)

const updateValue = (category, key, delta) => {
  const newValue = { ...props.modelValue }
  if (!newValue[category]) newValue[category] = {}
  
  const currentValue = newValue[category][key] || 0
  
  // 检查是否可以增加
  if (delta > 0 && remainingPoints.value <= 0) return
  
  // 检查是否可以减少
  if (delta < 0 && currentValue <= 0) return

  newValue[category][key] = currentValue + delta
  emit('update:modelValue', newValue)
}

const updateField = (field, value) => {
  const newValue = { ...props.modelValue, [field]: value }
  emit('update:modelValue', newValue)
}
</script>

<template>
  <div class="custom-panel">
    <div class="panel-header">
      <h3 class="section-title">自定义选项</h3>
      <button v-if="isCollapsed" class="edit-btn" @click="isCollapsed = false">编辑</button>
    </div>
    
    <div v-show="!isCollapsed">
      <div class="form-row">
        <label>选项名称：</label>
      <input 
        type="text" 
        :value="modelValue.optionName" 
        @input="updateField('optionName', $event.target.value)"
        placeholder="请输入名称" 
        class="input-field" 
      />
    </div>
    
    <div class="form-row">
      <label>选项描述：</label>
      <input 
        type="text" 
        :value="modelValue.description" 
        @input="updateField('description', $event.target.value)"
        placeholder="请输入描述" 
        class="input-field" 
      />
    </div>

    <div v-if="showMoney" class="form-row">
      <label>初始资金：</label>
      <input 
        type="number" 
        :value="modelValue.money" 
        @input="updateField('money', Number($event.target.value))"
        min="5000" 
        max="2500000" 
        class="input-field" 
      />
      <span class="unit">元 (5000-2500000)</span>
    </div>

    <div class="points-info">
      剩余加点：<span :class="{ 'no-points': remainingPoints <= 0 }">{{ remainingPoints }} / {{ maxPoints }}</span>
    </div>

    <div class="attributes-grid">
      <div v-for="attr in attributesList" :key="attr.key" class="attr-item">
        <div class="attr-label">{{ attr.label }}</div>
        <div class="attr-controls">
          <button 
            class="control-btn" 
            @click="updateValue('attributes', attr.key, -1)"
            :disabled="!modelValue.attributes[attr.key]"
          >-</button>
          <span class="attr-value">+{{ modelValue.attributes[attr.key] || 0 }}</span>
          <button 
            class="control-btn" 
            @click="updateValue('attributes', attr.key, 1)"
            :disabled="remainingPoints <= 0"
          >+</button>
        </div>
        <div class="attr-potential">潜力: 85</div>
      </div>
    </div>

    <div class="extra-options-section">
      <button class="toggle-btn" @click="showExtraOptions = !showExtraOptions">
        {{ showExtraOptions ? '收起额外选项' : '展开额外选项' }}
      </button>

      <div v-if="showExtraOptions" class="extra-options-content">
        <h4 class="sub-title">学科知识</h4>
        <div class="attributes-grid">
          <div v-for="subj in subjectsList" :key="subj.key" class="attr-item">
            <div class="attr-label">{{ subj.label }}</div>
            <div class="attr-controls">
              <button 
                class="control-btn" 
                @click="updateValue('subjects', subj.key, -1)"
                :disabled="!modelValue.subjects[subj.key]"
              >-</button>
              <span class="attr-value">+{{ modelValue.subjects[subj.key] || 0 }}</span>
              <button 
                class="control-btn" 
                @click="updateValue('subjects', subj.key, 1)"
                :disabled="remainingPoints <= 0"
              >+</button>
            </div>
          </div>
        </div>

        <h4 class="sub-title">生活技能</h4>
        <div class="attributes-grid">
          <div v-for="skill in skillsList" :key="skill.key" class="attr-item">
            <div class="attr-label" style="width: 80px;">{{ skill.label }}</div>
            <div class="attr-controls">
              <button 
                class="control-btn" 
                @click="updateValue('skills', skill.key, -1)"
                :disabled="!modelValue.skills[skill.key]"
              >-</button>
              <span class="attr-value">+{{ modelValue.skills[skill.key] || 0 }}</span>
              <button 
                class="control-btn" 
                @click="updateValue('skills', skill.key, 1)"
                :disabled="remainingPoints <= 0"
              >+</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="confirm-container">
      <button class="confirm-btn" @click="isCollapsed = true; $emit('confirm')">确定</button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.custom-panel {
  background-color: rgba(0, 0, 0, 0.03);
  padding: 20px;
  border-radius: 8px;
  border: 1px dashed #888;
  margin-bottom: 20px;
  margin-top: 10px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #d32f2f;
  padding-bottom: 5px;
}

.section-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.5rem;
  color: #333;
  margin: 0;
  border: none;
}

.edit-btn {
  padding: 4px 12px;
  background-color: #d32f2f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1rem;
}

.confirm-container {
  margin-top: 20px;
  text-align: center;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
}

.confirm-btn {
  padding: 8px 30px;
  background-color: #2e7d32; /* 绿色 */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.2rem;
  transition: background-color 0.3s;
}

.confirm-btn:hover {
  background-color: #1b5e20;
}

.form-row {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}

.form-row label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.2rem;
  width: 100px;
  color: #444;
}

.input-field {
  flex: 1;
  padding: 8px;
  font-size: 1rem;
  border: none;
  border-bottom: 1px solid #888;
  background: transparent;
  outline: none;
  font-family: 'Arial', sans-serif;
}

.input-field:focus {
  border-bottom-color: #d32f2f;
}

.unit {
  margin-left: 10px;
  color: #666;
  font-size: 0.9rem;
}

.points-info {
  text-align: right;
  margin-bottom: 10px;
  font-weight: bold;
  color: #555;
}

.no-points {
  color: #d32f2f;
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  margin-top: 15px;
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
  font-size: 1.2rem;
  width: 50px;
}

.attr-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #888;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.attr-value {
  font-weight: bold;
  width: 20px;
  text-align: center;
}

.attr-potential {
  font-size: 0.8rem;
  color: #888;
  margin-left: 10px;
}

.extra-options-section {
  margin-top: 20px;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
}

.toggle-btn {
  width: 100%;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.1rem;
  color: #555;
  transition: background-color 0.3s;
}

.toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.sub-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.3rem;
  color: #444;
  margin: 15px 0 10px 0;
  border-left: 3px solid #d32f2f;
  padding-left: 10px;
}
</style>
