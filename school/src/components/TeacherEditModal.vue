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
            <div class="class-assignments">
              <div v-for="(assignment, idx) in localForm.classAssignments" :key="idx" class="assignment-row">
                <select v-model="assignment.classId" class="assignment-class">
                  <option value="">选择班级</option>
                  <option v-for="(classInfo, cid) in availableClasses(idx)" :key="cid" :value="cid">
                    {{ classInfo.name || cid }}
                  </option>
                </select>
                <label class="assignment-homeroom">
                  <input type="checkbox" v-model="assignment.isHomeroom" /> 班主任
                </label>
                <input v-model="assignment.subject" placeholder="科目" class="assignment-subject" />
                <button class="btn-remove-assignment" @click="removeAssignment(idx)">✕</button>
              </div>
              <button class="btn-add-assignment" @click="addAssignment">＋ 添加班级</button>
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

const addAssignment = () => {
  localForm.value.classAssignments.push({ classId: '', isHomeroom: false, subject: '' })
}

const removeAssignment = (idx) => {
  localForm.value.classAssignments.splice(idx, 1)
}

const availableClasses = (currentIdx) => {
  const usedIds = localForm.value.classAssignments
    .filter((_, i) => i !== currentIdx)
    .map(a => a.classId)
    .filter(id => id)
  const result = {}
  for (const [cid, info] of Object.entries(props.classes || {})) {
    if (!usedIds.includes(cid)) result[cid] = info
  }
  return result
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

.class-assignments {
  display: flex; flex-direction: column; gap: 8px;
  max-height: 250px; overflow-y: auto;
}
.assignment-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: #1a1a1a;
  border: 1px solid #444; border-radius: 6px;
}
.assignment-class {
  flex: 1; min-width: 0;
  padding: 6px 8px; background: #2a2a2a; border: 1px solid #555;
  border-radius: 4px; color: #fff; font-size: 13px;
}
.assignment-homeroom {
  display: flex; align-items: center; gap: 4px;
  color: #ccc; font-size: 12px; white-space: nowrap; cursor: pointer;
}
.assignment-homeroom input[type="checkbox"] { cursor: pointer; }
.assignment-subject {
  width: 80px; padding: 6px 8px;
  background: #2a2a2a; border: 1px solid #555;
  border-radius: 4px; color: #fff; font-size: 13px;
}
.btn-remove-assignment {
  padding: 4px 8px; background: #c62828; color: white;
  border: none; border-radius: 4px; cursor: pointer;
  font-size: 12px; flex-shrink: 0;
}
.btn-remove-assignment:hover { background: #d32f2f; }
.btn-add-assignment {
  padding: 6px 12px; background: #3a6ea5; color: white;
  border: none; border-radius: 6px; cursor: pointer;
  font-size: 13px; align-self: flex-start;
}
.btn-add-assignment:hover { background: #4a7eb5; }

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
