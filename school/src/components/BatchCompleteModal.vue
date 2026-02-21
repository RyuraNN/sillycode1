<!-- 批量补全模态框组件 -->
<template>
  <Teleport to="body">
    <div v-if="show" class="batch-complete-modal-overlay" @click.self="$emit('close')">
      <div class="batch-complete-modal">
        <div class="modal-header">
          <h3>🤖 AI批量补全角色数据</h3>
          <button class="close-btn" @click="$emit('close')" :disabled="processing">✕</button>
        </div>

        <div class="modal-body">
          <!-- 选择模式 -->
          <div class="selection-section">
            <label>补全范围：</label>
            <select v-model="localSelection.mode" :disabled="processing">
              <option value="missing_academic">缺失学力档案的学生（{{ candidateCounts?.missing_academic ?? '?' }}人）</option>
              <option value="missing_personality">缺失性格数据的角色（{{ candidateCounts?.missing_personality ?? '?' }}人）</option>
              <option value="class">指定班级全员</option>
              <option value="by_class">按班级逐班补全（{{ candidateCounts?.by_class ?? '?' }}人 / {{ Object.keys(classes || {}).length }}班）</option>
              <option value="all">全部角色（{{ candidateCounts?.all ?? '?' }}人）</option>
            </select>

            <select
              v-if="localSelection.mode === 'class'"
              v-model="localSelection.targetClass"
              :disabled="processing"
            >
              <option v-for="(classInfo, classId) in classes" :key="classId" :value="classId">
                {{ classInfo.name || classId }}（{{ candidateCounts?.classCounts?.[classId] ?? '?' }}人）
              </option>
            </select>
          </div>

          <!-- 补全选项 -->
          <div class="options-section">
            <label>补全内容：</label>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" v-model="localSelection.options.academic" :disabled="processing" />
                学力档案（等级/潜力/特长）
              </label>
              <label>
                <input type="checkbox" v-model="localSelection.options.personality" :disabled="processing" />
                性格四维（秩序/利他/传统/和平）
              </label>
              <label>
                <input type="checkbox" v-model="localSelection.options.relationships" :disabled="processing" />
                角色关系（亲密/信赖）
              </label>
              <label>
                <input type="checkbox" v-model="localSelection.options.overwrite" :disabled="processing" />
                覆盖已有数据
              </label>
            </div>
          </div>

          <!-- 进度显示 -->
          <div v-if="processing || progress.total > 0" class="progress-section">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${(progress.current / progress.total) * 100}%` }"
              ></div>
            </div>
            <p class="progress-text">{{ progress.status }}</p>
            <p class="progress-count">{{ progress.current }} / {{ progress.total }}</p>
          </div>

          <!-- 结果预览 -->
          <div v-if="results.length > 0" class="results-section">
            <h4>变更预览（{{ results.length }}个角色）</h4>
            <div class="results-list">
              <div v-for="(item, idx) in results" :key="idx" class="result-item">
                <strong>{{ item.name }}</strong>
                <span class="changes">{{ item.changes.join('、') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="!processing && results.length === 0"
            class="btn-primary"
            @click="$emit('start')"
            :disabled="!canStart"
          >
            开始处理
          </button>
          <button
            v-if="processing && resumeIndex > 0"
            class="btn-warning"
            @click="$emit('resume')"
          >
            从断点继续
          </button>
          <button
            v-if="!processing && results.length > 0"
            class="btn-success"
            @click="$emit('apply')"
          >
            应用变更
          </button>
          <button class="btn-secondary" @click="$emit('close')" :disabled="processing">
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
  selection: Object,
  processing: Boolean,
  progress: Object,
  results: Array,
  resumeIndex: Number,
  classes: Object,
  candidateCounts: Object
})

const emit = defineEmits(['close', 'start', 'resume', 'apply', 'update:selection'])

const localSelection = computed({
  get: () => props.selection,
  set: (val) => emit('update:selection', val)
})

const canStart = computed(() => {
  const opts = props.selection.options
  return opts.academic || opts.personality || opts.relationships
})
</script>

<style scoped>
.batch-complete-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.batch-complete-modal {
  background: #2a2a2a;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
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

.close-btn:hover:not(:disabled) {
  background: #444;
  color: #fff;
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.selection-section,
.options-section {
  margin-bottom: 20px;
}

.selection-section label,
.options-section > label {
  display: block;
  color: #ccc;
  margin-bottom: 8px;
  font-weight: 500;
}

.selection-section select {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  margin-bottom: 10px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  color: #ddd;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}

.progress-section {
  background: #1a1a1a;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.3s ease;
}

.progress-text {
  color: #ccc;
  margin: 5px 0;
  font-size: 14px;
}

.progress-count {
  color: #999;
  font-size: 12px;
  margin: 0;
}

.results-section {
  background: #1a1a1a;
  padding: 15px;
  border-radius: 8px;
}

.results-section h4 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 16px;
}

.results-list {
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  padding: 10px;
  background: #2a2a2a;
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-item strong {
  color: #fff;
}

.result-item .changes {
  color: #4CAF50;
  font-size: 13px;
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

.btn-primary:hover:not(:disabled) {
  background: #45a049;
}

.btn-success {
  background: #2196F3;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #0b7dda;
}

.btn-warning {
  background: #FF9800;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #e68900;
}

.btn-secondary {
  background: #666;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #555;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
