<!-- 教师编辑模态框 -->
<template>
  <Teleport to="body">
    <div v-if="show" class="teacher-edit-overlay" @click.self="$emit('close')">
      <div class="teacher-edit-modal">
        <div class="modal-header">
          <h3>{{ isEditing ? '编辑教师' : '添加教师' }}</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <!-- 基本信息 -->
          <div class="form-section">
            <h4>基本信息</h4>
            <div class="form-row">
              <label>姓名 *</label>
              <input v-model="localForm.name" placeholder="教师姓名" />
            </div>

            <div class="form-row">
              <label>性别</label>
              <select v-model="localForm.gender">
                <option value="female">女</option>
                <option value="male">男</option>
              </select>
            </div>

            <div class="form-row">
              <label>作品来源</label>
              <input v-model="localForm.origin" placeholder="(作品名)" />
            </div>
          </div>

          <!-- 任教信息 -->
          <div class="form-section">
            <h4>任教信息</h4>
            <div class="form-row">
              <label>任教科目</label>
              <input v-model="localForm.subject" placeholder="如：数学、语文" />
            </div>

            <div class="form-row">
              <label>
                <input type="checkbox" v-model="localForm.isHeadTeacher" />
                担任班主任
              </label>
            </div>

            <div v-if="localForm.isHeadTeacher" class="form-row">
              <label>班主任班级</label>
              <select v-model="localForm.classId">
                <option value="">未分配</option>
                <option v-for="(classInfo, classId) in classes" :key="classId" :value="classId">
                  {{ classInfo.name || classId }}
                </option>
              </select>
            </div>

            <div v-if="!localForm.isHeadTeacher" class="form-row">
              <label>任教班级（可多选）</label>
              <div class="class-checkboxes">
                <label
                  v-for="(classInfo, classId) in classes"
                  :key="classId"
                  class="class-checkbox-item"
                >
                  <input
                    type="checkbox"
                    :value="classId"
                    :checked="localForm.teachingClasses.includes(classId)"
                    @change="toggleTeachingClass(classId)"
                  />
                  {{ classInfo.name || classId }}
                </label>
              </div>
            </div>
          </div>

          <!-- 性格四维 -->
          <div class="form-section">
            <h4>性格四维</h4>
            <div class="personality-sliders">
              <div class="slider-row">
                <label>秩序感 (-100混乱 ~ 100守序)</label>
                <input
                  type="range"
                  v-model.number="localForm.personality.order"
                  min="-100"
                  max="100"
                />
                <span>{{ localForm.personality.order }}</span>
              </div>

              <div class="slider-row">
                <label>利他性 (-100利己 ~ 100利他)</label>
                <input
                  type="range"
                  v-model.number="localForm.personality.altruism"
                  min="-100"
                  max="100"
                />
                <span>{{ localForm.personality.altruism }}</span>
              </div>

              <div class="slider-row">
                <label>传统性 (-100革新 ~ 100传统)</label>
                <input
                  type="range"
                  v-model.number="localForm.personality.tradition"
                  min="-100"
                  max="100"
                />
                <span>{{ localForm.personality.tradition }}</span>
              </div>

              <div class="slider-row">
                <label>和平性 (-100好斗 ~ 100温和)</label>
                <input
                  type="range"
                  v-model.number="localForm.personality.peace"
                  min="-100"
                  max="100"
                />
                <span>{{ localForm.personality.peace }}</span>
              </div>
            </div>
          </div>

          <!-- 备注 -->
          <div class="form-section">
            <h4>备注</h4>
            <textarea
              v-model="localForm.notes"
              placeholder="玩家备注..."
              rows="3"
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="handleSave">
            {{ isEditing ? '保存' : '添加' }}
          </button>
          <button class="btn-secondary" @click="$emit('close')">
            取消
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: Boolean,
  form: Object,
  isEditing: Boolean,
  classes: Object
})

const emit = defineEmits(['close', 'save', 'update:form'])

const localForm = computed({
  get: () => props.form,
  set: (val) => emit('update:form', val)
})

const toggleTeachingClass = (classId) => {
  const classes = localForm.value.teachingClasses
  const idx = classes.indexOf(classId)
  if (idx > -1) {
    classes.splice(idx, 1)
  } else {
    classes.push(classId)
  }
}

const handleSave = () => {
  if (!localForm.value.name) {
    alert('请填写教师姓名')
    return
  }
  emit('save')
}
</script>

<style scoped>
.teacher-edit-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
}

.teacher-edit-modal {
  background: #2a2a2a;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #444;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #444;
  color: #fff;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-section {
  margin-bottom: 25px;
  padding: 15px;
  background: #1a1a1a;
  border-radius: 8px;
}

.form-section h4 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 16px;
}

.form-section textarea {
  width: 100%;
  padding: 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  resize: vertical;
}

.form-row {
  margin-bottom: 15px;
}

.form-row label {
  display: block;
  color: #ccc;
  margin-bottom: 8px;
  font-size: 14px;
}

.form-row input[type="text"],
.form-row input:not([type]),
.form-row select,
.form-row textarea {
  width: 100%;
  padding: 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.form-row input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}

.form-row label:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.class-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
}

.class-checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.class-checkbox-item:hover {
  background: #333;
}

.personality-sliders {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.slider-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider-row label {
  color: #ccc;
  font-size: 13px;
}

.slider-row input[type="range"] {
  width: 100%;
  cursor: pointer;
}

.slider-row span {
  color: #4CAF50;
  font-weight: 600;
  text-align: center;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #444;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.modal-footer button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #4CAF50;
  color: white;
}

.btn-primary:hover {
  background: #45a049;
}

.btn-secondary {
  background: #666;
  color: white;
}

.btn-secondary:hover {
  background: #555;
}
</style>
