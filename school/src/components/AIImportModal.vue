<!-- AI角色导入模态框组件 -->
<template>
  <!-- 输入面板 -->
  <Teleport to="body">
    <div v-if="showInput" class="ai-import-overlay" @click.self="handleClose">
      <div class="ai-import-modal">
        <div class="modal-header">
          <h3>🔍 AI角色查询导入</h3>
          <button class="close-btn" @click="handleClose" :disabled="loading">✕</button>
        </div>

        <div class="modal-body">
          <p class="hint">请输入作品名和角色名，AI将从知识库中查询角色信息。</p>

          <div class="entries-list">
            <div v-for="(entry, idx) in localEntries" :key="idx" class="entry-row">
              <input
                v-model="entry.work"
                placeholder="作品名（必填）"
                class="input-work"
                :disabled="loading"
              />
              <input
                v-model="entry.character"
                placeholder="角色名（选填，留空则查询作品全部角色）"
                class="input-character"
                :disabled="loading"
              />
              <button
                class="btn-remove"
                @click="removeEntry(idx)"
                :disabled="loading || localEntries.length === 1"
              >
                ✕
              </button>
            </div>
          </div>

          <button class="btn-add-entry" @click="addEntry" :disabled="loading">
            ＋ 添加条目
          </button>

          <div class="import-options">
            <label>
              <input type="checkbox" v-model="localImportAllAsPending" :disabled="loading" />
              将全部角色设为待入学新生
            </label>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="handleSubmit" :disabled="loading">
            {{ loading ? '查询中...' : '开始查询' }}
          </button>
          <button class="btn-secondary" @click="handleClose" :disabled="loading">
            取消
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 结果面板 -->
  <Teleport to="body">
    <div v-if="showResult" class="ai-import-overlay" @click.self="handleClose">
      <div class="ai-import-modal ai-import-result-modal">
        <div class="modal-header">
          <h3>📋 查询结果</h3>
          <button class="close-btn" @click="handleClose" :disabled="loading">✕</button>
        </div>

        <div class="modal-body">
          <!-- 找到的角色 -->
          <div v-if="results.found.length > 0" class="result-section">
            <h4>✅ 找到的角色（{{ results.found.length }}）</h4>
            <div class="result-list">
              <div
                v-for="(char, idx) in results.found"
                :key="idx"
                class="result-item"
                :class="{ selected: char.selected }"
                @click="toggleChar(idx)"
              >
                <div class="char-header">
                  <input type="checkbox" :checked="char.selected" @click.stop="toggleChar(idx)" />
                  <strong>{{ char.name }}</strong>
                  <span class="char-work">{{ char.work }}</span>
                  <span class="char-gender">{{ char.gender === 'male' ? '♂' : '♀' }}</span>
                </div>
                <div class="char-details">
                  <div class="role-suggestion">
                    <label>建议身份：</label>
                    <select
                      v-model="char.roleSuggestion"
                      @click.stop
                      class="role-select"
                    >
                      <option value="student">学生</option>
                      <option value="teacher">教师</option>
                      <option value="staff">职工</option>
                      <option value="external">校外人员</option>
                      <option value="uncertain">不确定</option>
                    </select>
                    <span v-if="char.roleReason" class="role-reason">{{ char.roleReason }}</span>
                  </div>
                  <div v-if="char.roleSuggestion === 'external'" class="char-external-info">
                    <span v-if="char.staffTitle">职务：{{ char.staffTitle }}</span>
                    <span v-if="char.workplaceSuggestion">工作地点建议：{{ char.workplaceSuggestion }}</span>
                  </div>
                  <div v-if="char.personality" class="char-personality">
                    性格：秩序{{ char.personality.order }} 利他{{ char.personality.altruism }}
                    传统{{ char.personality.tradition }} 和平{{ char.personality.peace }}
                  </div>
                  <div v-if="char.academicProfile" class="char-academic">
                    学力：{{ char.academicProfile.level }} / {{ char.academicProfile.potential }}
                    <span v-if="char.academicProfile.traits?.length">
                      / {{ char.academicProfile.traits.join(', ') }}
                    </span>
                  </div>
                  <div v-if="char.relationships?.length" class="char-relationships">
                    关系：{{ char.relationships.length }}个
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 作品角色列表 -->
          <div v-if="results.workResults.length > 0" class="result-section">
            <h4>📚 作品角色列表</h4>
            <div v-for="(work, wIdx) in results.workResults" :key="wIdx" class="work-result">
              <div v-if="work.found" class="work-found">
                <h5>{{ work.work }}（{{ work.characters.length }}个角色）</h5>
                <div class="work-char-list">
                  <div
                    v-for="(char, cIdx) in work.characters"
                    :key="cIdx"
                    class="work-char-item"
                    :class="{ selected: char.selected }"
                    @click="toggleWorkChar(wIdx, cIdx)"
                  >
                    <input type="checkbox" :checked="char.selected" @click.stop="toggleWorkChar(wIdx, cIdx)" />
                    <span>{{ char.name }}</span>
                    <span class="char-gender">{{ char.gender === 'male' ? '♂' : '♀' }}</span>
                  </div>
                </div>
                <button class="btn-detail-query" @click="handleDetailQuery" :disabled="loading">
                  {{ loading ? '正在查询...' : '查询选中角色的详细信息' }}
                </button>
              </div>
              <div v-else class="work-not-found">
                <strong>{{ work.work }}</strong>
                <span class="not-found-reason">{{ work.reason }}</span>
              </div>
            </div>
          </div>

          <!-- 未找到的角色 -->
          <div v-if="results.notFound.length > 0" class="result-section">
            <h4>❌ 未找到的角色（{{ results.notFound.length }}）</h4>
            <div class="not-found-list">
              <div v-for="(item, idx) in results.notFound" :key="idx" class="not-found-item">
                <strong>{{ item.name }}</strong>
                <span class="not-found-work">{{ item.work }}</span>
                <span class="not-found-reason">{{ item.reason }}</span>
              </div>
            </div>
          </div>

          <p v-if="error" class="error-message">{{ error }}</p>
        </div>

        <div class="modal-footer">
          <button
            class="btn-primary"
            @click="handleConfirm"
            :disabled="loading || selectedCount === 0"
          >
            导入选中角色（{{ selectedCount }}）
          </button>
          <button class="btn-secondary" @click="handleClose" :disabled="loading">
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
  showInput: Boolean,
  showResult: Boolean,
  loading: Boolean,
  error: String,
  entries: Array,
  results: Object,
  importAllAsPending: Boolean
})

const emit = defineEmits([
  'close',
  'submit',
  'confirm',
  'detailQuery',
  'toggleChar',
  'toggleWorkChar',
  'update:entries',
  'update:importAllAsPending'
])

const localEntries = computed({
  get: () => props.entries,
  set: (val) => emit('update:entries', val)
})

const localImportAllAsPending = computed({
  get: () => props.importAllAsPending,
  set: (val) => emit('update:importAllAsPending', val)
})

const selectedCount = computed(() => {
  return props.results.found.filter(c => c.selected).length
})

const addEntry = () => {
  localEntries.value.push({ work: '', character: '' })
}

const removeEntry = (index) => {
  if (localEntries.value.length > 1) {
    localEntries.value.splice(index, 1)
  }
}

const handleClose = () => {
  if (!props.loading) {
    emit('close')
  }
}

const handleSubmit = () => {
  emit('submit')
}

const handleConfirm = () => {
  emit('confirm')
}

const handleDetailQuery = () => {
  emit('detailQuery')
}

const toggleChar = (index) => {
  emit('toggleChar', index)
}

const toggleWorkChar = (workIndex, charIndex) => {
  emit('toggleWorkChar', workIndex, charIndex)
}
</script>

<style scoped>
.ai-import-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.ai-import-modal {
  background: #2a2a2a;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.ai-import-result-modal {
  max-width: 900px;
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

.hint {
  color: #999;
  margin-bottom: 15px;
  font-size: 14px;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.entry-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.input-work,
.input-character {
  flex: 1;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
}

.input-work {
  flex: 0 0 200px;
}

.btn-remove {
  background: #d32f2f;
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-remove:hover:not(:disabled) {
  background: #b71c1c;
}

.btn-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-add-entry {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px dashed #666;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-entry:hover:not(:disabled) {
  border-color: #888;
  color: #ccc;
}

.import-options {
  margin-top: 15px;
  padding: 10px;
  background: #1a1a1a;
  border-radius: 6px;
}

.import-options label {
  display: flex;
  align-items: center;
  color: #ddd;
  cursor: pointer;
}

.import-options input[type="checkbox"] {
  margin-right: 8px;
}

.error-message {
  color: #f44336;
  margin-top: 15px;
  padding: 10px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 6px;
  font-size: 14px;
}

.result-section {
  margin-bottom: 25px;
}

.result-section h4 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 16px;
}

.result-list,
.not-found-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-item {
  padding: 15px;
  background: #1a1a1a;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.result-item:hover {
  background: #252525;
}

.result-item.selected {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}

.char-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.char-header strong {
  color: #fff;
  font-size: 16px;
}

.char-work {
  color: #999;
  font-size: 13px;
}

.char-gender {
  color: #4CAF50;
  font-size: 18px;
}

.char-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: #ccc;
  margin-left: 30px;
}

.role-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
}

.role-select {
  padding: 4px 8px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
}

.role-reason {
  color: #999;
  font-size: 12px;
}

.work-result {
  margin-bottom: 20px;
  padding: 15px;
  background: #1a1a1a;
  border-radius: 8px;
}

.work-found h5 {
  margin: 0 0 10px 0;
  color: #fff;
}

.work-char-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 15px;
}

.work-char-item {
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.work-char-item:hover {
  background: #333;
}

.work-char-item.selected {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}

.btn-detail-query {
  padding: 8px 16px;
  background: #2196F3;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-detail-query:hover:not(:disabled) {
  background: #0b7dda;
}

.work-not-found {
  display: flex;
  align-items: center;
  gap: 10px;
}

.work-not-found strong {
  color: #fff;
}

.not-found-reason {
  color: #f44336;
  font-size: 13px;
}

.not-found-item {
  padding: 10px;
  background: #1a1a1a;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.not-found-item strong {
  color: #fff;
}

.not-found-work {
  color: #999;
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
