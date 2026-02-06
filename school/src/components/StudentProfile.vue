<script setup>
import { computed } from 'vue'

const props = defineProps({
  formData: {
    type: Object,
    required: true
  },
  customData: {
    type: Object,
    required: true
  },
  options: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['sign', 'back'])

// 辅助函数：获取选项名称
const getOptionName = (id, optionList, customDataArray, index) => {
  if (!id) return '无'
  if (id === 'custom') {
    const custom = Array.isArray(customDataArray) ? customDataArray[index] : customDataArray
    return custom.optionName || '自定义'
  }
  const opt = optionList.find(o => o.id === id)
  return opt ? opt.name.split('（')[0] : '未知'
}

const familyName = computed(() => {
  if (props.formData.familyBackground === 'custom') {
    return props.customData.family.optionName || '自定义家庭'
  }
  // familyOptions 是对象 { f1: {...}, f2: {...} }
  const key = props.formData.familyBackground
  const familyOpt = props.options.family[key]
  return familyOpt ? familyOpt.name.split('（')[0] : '未知'
})

const getExperiences = (ids, optionList, customDataArray) => {
  return ids.map((id, index) => {
    if (!id) return null
    return getOptionName(id, optionList, customDataArray, index)
  }).filter(Boolean).join('、') || '无'
}

const childhoodExp = computed(() => getExperiences(props.formData.childhood, props.options.childhood, props.customData.childhood))
const elementaryExp = computed(() => getExperiences(props.formData.elementary, props.options.elementary, props.customData.elementary))
const middleSchoolExp = computed(() => getExperiences(props.formData.middleSchool, props.options.middleSchool, props.customData.middleSchool))
const talentsList = computed(() => getExperiences(props.formData.talents, props.options.talents, props.customData.talents))

const gameModeName = computed(() => {
  const modes = {
    dragon: '天龙模式',
    story: '剧情模式',
    normal: '普通模式',
    challenge: '挑战模式'
  }
  return modes[props.formData.gameMode] || '未知模式'
})

const genderName = computed(() => props.formData.gender === 'male' ? '男' : '女')

</script>

<template>
  <div class="profile-overlay">
    <div class="profile-paper slide-down">
      <div class="profile-header">
        <img src="https://files.catbox.moe/efg1xe.png" alt="Logo" class="mini-logo" />
        <h2>天华学园新生档案</h2>
      </div>

      <div class="profile-content">
        <div class="section">
          <h3>一、基本信息</h3>
          <div class="info-grid">
            <div class="info-item"><span class="label">姓名：</span>{{ formData.name }}</div>
            <div class="info-item"><span class="label">性别：</span>{{ genderName }}</div>
            <div class="info-item"><span class="label">班级：</span>{{ formData.classId || '待定' }}</div>
            <div class="info-item"><span class="label">人生目标：</span>{{ gameModeName }}</div>
          </div>
        </div>

        <div class="section">
          <h3>二、人生轨迹</h3>
          <div class="info-row"><span class="label">家庭背景：</span>{{ familyName }}</div>
          <div class="info-row"><span class="label">幼年经历：</span>{{ childhoodExp }}</div>
          <div class="info-row"><span class="label">小学经历：</span>{{ elementaryExp }}</div>
          <div class="info-row"><span class="label">初中经历：</span>{{ middleSchoolExp }}</div>
          <div class="info-row"><span class="label">天赋特长：</span>{{ talentsList }}</div>
        </div>
      </div>

      <div class="profile-footer">
        <p class="confirm-text">本人确认以上信息无误</p>
        <div class="signature-area" @click="$emit('sign')">
          <span class="click-sign">点击签名</span>
        </div>
        <button class="back-btn" @click="$emit('back')">返回修改</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: flex-start; /* 从顶部开始，配合动画 */
  z-index: 1000;
  overflow-y: auto;
  padding: 50px 0;
}

.profile-paper {
  background-color: #fdfbf3;
  width: 700px;
  max-width: 90%;
  padding: 40px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  position: relative;
  font-family: 'SimSun', 'Songti SC', serif; /* 宋体，更像档案 */
}

.slide-down {
  animation: slideDown 0.8s ease-out forwards;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.profile-header {
  text-align: center;
  border-bottom: 2px solid #333;
  padding-bottom: 20px;
  margin-bottom: 30px;
}

.mini-logo {
  height: 60px;
  margin-bottom: 10px;
}

.profile-header h2 {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 2.5rem;
  margin: 0;
  color: #333;
  letter-spacing: 5px;
}

.section {
  margin-bottom: 30px;
}

.section h3 {
  font-size: 1.2rem;
  border-left: 4px solid #d32f2f;
  padding-left: 10px;
  margin-bottom: 15px;
  background-color: rgba(0, 0, 0, 0.05);
  padding: 5px 10px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.info-item, .info-row {
  font-size: 1.1rem;
  line-height: 1.6;
  border-bottom: 1px dashed #ccc;
  padding-bottom: 5px;
}

.info-row {
  margin-bottom: 15px;
}

.label {
  font-weight: bold;
  color: #555;
  margin-right: 10px;
}

.profile-footer {
  margin-top: 50px;
  text-align: right;
  position: relative;
}

.confirm-text {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 10px;
  margin-right: 20px;
}

.signature-area {
  display: inline-block;
  border-bottom: 2px solid #333;
  width: 200px;
  height: 60px;
  text-align: center;
  line-height: 60px;
  cursor: pointer;
  position: relative;
  margin-right: 20px;
  transition: background-color 0.3s;
}

.signature-area:hover {
  background-color: rgba(211, 47, 47, 0.05);
}

.click-sign {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 2rem;
  color: #d32f2f;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0.6; transform: scale(1); }
}

.back-btn {
  position: absolute;
  left: 0;
  bottom: 0;
  background: none;
  border: 1px solid #999;
  padding: 5px 15px;
  cursor: pointer;
  color: #666;
  border-radius: 4px;
}

.back-btn:hover {
  background-color: #eee;
}
</style>
