<!-- 关系编辑模态框 -->
<template>
  <Teleport to="body">
    <div v-if="show" class="rel-edit-overlay" @click.self="$emit('close')">
      <div class="rel-edit-modal">
        <div class="modal-header">
          <h3>{{ isEditing ? '编辑关系' : '添加关系' }}</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <!-- 角色信息 -->
          <div class="form-section">
            <h4>角色</h4>
            <div class="char-pair">
              <span class="char-name source">{{ sourceName }}</span>
              <span class="arrow">→</span>
              <template v-if="isEditing">
                <span class="char-name target">{{ localForm.targetName || targetName }}</span>
              </template>
              <template v-else>
                <div class="searchable-select" v-click-outside="closeDropdown">
                  <input
                    v-model="targetSearch"
                    placeholder="搜索角色名..."
                    class="target-search-input"
                    @focus="showDropdown = true"
                    @input="showDropdown = true"
                  />
                  <div v-if="showDropdown && filteredTargets.length > 0" class="dropdown-list">
                    <div
                      v-for="name in filteredTargets"
                      :key="name"
                      class="dropdown-item"
                      @mousedown.prevent="selectTarget(name)"
                    >{{ name }}</div>
                  </div>
                  <div v-if="showDropdown && targetSearch && filteredTargets.length === 0" class="dropdown-list">
                    <div class="dropdown-empty">无匹配角色</div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 关系轴滑块 -->
          <div class="form-section">
            <h4>关系数值</h4>
            <div class="axis-group">
              <div v-for="(axis, key) in axes" :key="key" class="axis-row">
                <div class="axis-header">
                  <span class="axis-name">{{ axis.name }}</span>
                  <span class="axis-value" :class="getAxisValueClass(key, localForm[key])">{{ localForm[key] }}</span>
                </div>
                <div class="axis-labels">
                  <span class="label-min">{{ axis.labels.min }}</span>
                  <span class="label-max">{{ axis.labels.max }}</span>
                </div>
                <input
                  type="range"
                  :min="axis.min"
                  :max="axis.max"
                  v-model.number="localForm[key]"
                  class="axis-slider"
                  :class="'slider-' + key"
                />
              </div>
            </div>
          </div>

          <!-- 关系分组 -->
          <div class="form-section">
            <h4>关系分组</h4>
            <div class="group-checkboxes">
              <label
                v-for="(group, key) in relationshipGroups"
                :key="key"
                class="group-checkbox"
                :style="{ borderColor: localForm.groups.includes(key) ? group.color : '#444' }"
              >
                <input type="checkbox" :value="key" v-model="localForm.groups" />
                <span class="group-dot" :style="{ background: group.color }"></span>
                <span>{{ group.name }}</span>
              </label>
            </div>
          </div>

          <!-- 印象标签 -->
          <div class="form-section">
            <h4>印象标签 <span class="tag-count">({{ localForm.tags.length }}/4)</span></h4>
            <div class="tags-editor">
              <div class="tag-list">
                <span v-for="(tag, idx) in localForm.tags" :key="idx" class="tag-item">
                  {{ tag }}
                  <button class="tag-remove" @click="removeTag(idx)">×</button>
                </span>
              </div>
              <div v-if="localForm.tags.length < 4" class="tag-input-row">
                <input
                  v-model="newTag"
                  placeholder="输入标签后回车..."
                  maxlength="20"
                  @keyup.enter="addTag"
                />
                <button class="btn-add-tag" @click="addTag" :disabled="!newTag.trim()">添加</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-save" @click="handleSave" :disabled="!canSave">保存</button>
          <button class="btn-cancel" @click="$emit('close')">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { RELATIONSHIP_AXES } from '../data/relationshipData'

const props = defineProps({
  show: Boolean,
  sourceName: String,
  targetName: String,
  form: Object,
  isEditing: Boolean,
  availableCharacters: { type: Array, default: () => [] },
  relationshipGroups: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'save', 'update:form'])

const axes = RELATIONSHIP_AXES
const newTag = ref('')
const targetSearch = ref('')
const showDropdown = ref(false)

const filteredTargets = computed(() => {
  const q = targetSearch.value.toLowerCase()
  if (!q) return props.availableCharacters
  return props.availableCharacters.filter(name => name.toLowerCase().includes(q))
})

function selectTarget(name) {
  localForm.value.targetName = name
  targetSearch.value = name
  showDropdown.value = false
}

function closeDropdown() {
  showDropdown.value = false
}

// v-click-outside 自定义指令
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) binding.value()
    }
    document.addEventListener('mousedown', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('mousedown', el._clickOutside)
  }
}

const localForm = ref({
  targetName: '',
  intimacy: 0, trust: 0, passion: 0, hostility: 0,
  groups: [], tags: []
})

watch(() => props.show, (val) => {
  if (val && props.form) {
    localForm.value = {
      targetName: props.targetName || '',
      intimacy: props.form.intimacy ?? 0,
      trust: props.form.trust ?? 0,
      passion: props.form.passion ?? 0,
      hostility: props.form.hostility ?? 0,
      groups: [...(props.form.groups || [])],
      tags: [...(props.form.tags || [])]
    }
    newTag.value = ''
    targetSearch.value = props.targetName || ''
    showDropdown.value = false
  }
})

const canSave = computed(() => {
  if (!props.isEditing && !localForm.value.targetName) return false
  return true
})

function getAxisValueClass(key, val) {
  if (key === 'hostility') return val > 50 ? 'val-danger' : val > 0 ? 'val-warn' : ''
  return val > 0 ? 'val-positive' : val < 0 ? 'val-negative' : ''
}

function addTag() {
  const t = newTag.value.trim()
  if (t && localForm.value.tags.length < 4 && !localForm.value.tags.includes(t)) {
    localForm.value.tags.push(t)
  }
  newTag.value = ''
}

function removeTag(idx) {
  localForm.value.tags.splice(idx, 1)
}

function handleSave() {
  if (!canSave.value) return
  emit('update:form', { ...localForm.value })
  emit('save', {
    targetName: localForm.value.targetName || props.targetName,
    intimacy: localForm.value.intimacy,
    trust: localForm.value.trust,
    passion: localForm.value.passion,
    hostility: localForm.value.hostility,
    groups: [...localForm.value.groups],
    tags: [...localForm.value.tags]
  })
}
</script>

<style scoped>
.rel-edit-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7); display: flex; align-items: center;
  justify-content: center; z-index: 10002;
}
.rel-edit-modal {
  background: #2a2a2a; border-radius: 12px; width: 95%; max-width: 600px;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #444;
}
.modal-header h3 { margin: 0; color: #fff; font-size: 18px; }
.close-btn {
  background: #444; border: none; color: #ccc; width: 32px; height: 32px;
  border-radius: 50%; cursor: pointer; font-size: 16px;
}
.close-btn:hover { background: #c62828; color: #fff; }
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.form-section {
  background: #1a1a1a; border-radius: 8px; padding: 14px; margin-bottom: 12px;
}
.form-section h4 { margin: 0 0 10px; color: #ccc; font-size: 14px; }
.char-pair {
  display: flex; align-items: center; gap: 10px; font-size: 15px;
}
.char-name { color: #fff; font-weight: 600; }
.arrow { color: #666; }
.target-select {
  flex: 1; background: #2a2a2a; border: 1px solid #444; color: #fff;
  padding: 8px; border-radius: 6px; font-size: 14px;
}
/* 关系轴 */
.axis-row { margin-bottom: 12px; }
.axis-row:last-child { margin-bottom: 0; }
.axis-header { display: flex; justify-content: space-between; margin-bottom: 2px; }
.axis-name { color: #ccc; font-size: 13px; }
.axis-value { font-size: 13px; font-weight: 600; color: #aaa; }
.val-positive { color: #4CAF50; }
.val-negative { color: #F44336; }
.val-warn { color: #FF9800; }
.val-danger { color: #F44336; }
.axis-labels { display: flex; justify-content: space-between; font-size: 11px; color: #666; }
/* STYLE_PART2 */
.axis-slider {
  width: 100%; height: 6px; -webkit-appearance: none; appearance: none;
  background: #333; border-radius: 3px; outline: none;
}
.axis-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: #4CAF50; cursor: pointer; border: 2px solid #2a2a2a;
}
.slider-hostility::-webkit-slider-thumb { background: #F44336; }
/* 关系分组 */
.group-checkboxes { display: flex; flex-wrap: wrap; gap: 6px; }
.group-checkbox {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  background: #2a2a2a; border: 1px solid #444; border-radius: 4px;
  cursor: pointer; font-size: 12px; color: #ccc; transition: border-color 0.2s;
}
.group-checkbox input { display: none; }
.group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
/* 标签 */
.tag-count { color: #666; font-size: 12px; font-weight: normal; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.tag-item {
  display: flex; align-items: center; gap: 4px; padding: 3px 8px;
  background: #333; border-radius: 4px; color: #ccc; font-size: 12px;
}
.tag-remove {
  background: none; border: none; color: #888; cursor: pointer;
  font-size: 14px; padding: 0 2px; line-height: 1;
}
.tag-remove:hover { color: #F44336; }
.tag-input-row { display: flex; gap: 6px; }
.tag-input-row input {
  flex: 1; background: #2a2a2a; border: 1px solid #444; color: #fff;
  padding: 6px 10px; border-radius: 6px; font-size: 13px;
}
.btn-add-tag {
  background: #333; border: 1px solid #444; color: #ccc; padding: 6px 12px;
  border-radius: 6px; cursor: pointer; font-size: 13px;
}
.btn-add-tag:hover:not(:disabled) { background: #444; }
.btn-add-tag:disabled { opacity: 0.4; cursor: default; }
/* 底部 */
.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid #444;
}
.btn-save {
  background: #4CAF50; color: #fff; border: none; padding: 8px 24px;
  border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
}
.btn-save:hover:not(:disabled) { background: #45a049; }
.btn-save:disabled { opacity: 0.4; cursor: default; }
.btn-cancel {
  background: #444; color: #ccc; border: none; padding: 8px 20px;
  border-radius: 6px; cursor: pointer; font-size: 14px;
}
.btn-cancel:hover { background: #555; }

/* 可搜索下拉框 */
.searchable-select {
  position: relative;
  flex: 1;
}
.target-search-input {
  width: 100%;
  padding: 8px 12px;
  background: #1a1a1a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  box-sizing: border-box;
}
.target-search-input:focus {
  border-color: #6366f1;
  outline: none;
}
.dropdown-list {
  position: absolute;
  top: 100%;
  left: 0; right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1a1a;
  border: 1px solid #555;
  border-top: none;
  border-radius: 0 0 6px 6px;
  z-index: 10;
}
.dropdown-item {
  padding: 8px 12px;
  cursor: pointer;
  color: #ddd;
  font-size: 13px;
}
.dropdown-item:hover {
  background: #333;
  color: #fff;
}
.dropdown-empty {
  padding: 8px 12px;
  color: #888;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 768px) {
  .rel-edit-modal {
    width: 100%; max-width: 100%; max-height: 100vh;
    height: 100vh; border-radius: 0;
  }
  .modal-header { padding: 12px 14px; }
  .modal-header h3 { font-size: 16px; }
  .modal-body { padding: 12px 14px; }
  .form-section { padding: 10px; margin-bottom: 10px; }
  .char-pair { flex-wrap: wrap; }
  .target-select { width: 100%; flex: unset; }

  /* 滑块触控优化 */
  .axis-slider { height: 8px; }
  .axis-slider::-webkit-slider-thumb { width: 22px; height: 22px; }

  /* 分组复选框触控区 */
  .group-checkbox { padding: 6px 10px; font-size: 13px; }

  /* 标签输入 */
  .tag-input-row { flex-direction: column; gap: 8px; }
  .tag-input-row input { padding: 10px; font-size: 14px; }
  .btn-add-tag { padding: 10px; font-size: 14px; }

  /* 底部按钮 */
  .modal-footer { padding: 12px 14px; }
  .btn-save, .btn-cancel { padding: 12px 20px; font-size: 15px; }
  .btn-save { flex: 1; }
}
</style>
