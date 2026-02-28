<!-- 社团编辑模态框 -->
<template>
  <Teleport to="body">
    <div v-if="show" class="club-edit-overlay" @click.self="$emit('close')">
      <div class="club-edit-modal">
        <div class="modal-header">
          <h3>{{ isEditing ? '编辑社团' : '新建社团' }}</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="modal-body">
          <!-- 基本信息 -->
          <div class="form-section">
            <h4>基本信息</h4>
            <div class="form-row">
              <label>社团名称 *</label>
              <input v-model="localForm.name" placeholder="社团名称" />
            </div>

            <div v-if="!isEditing" class="form-row">
              <label>社团ID（可选）</label>
              <input v-model="localForm.customId" placeholder="留空则自动生成 player_club_xxx" />
              <span class="form-hint">自定义ID可创建系统级社团，如 art_club、music_club</span>
            </div>

            <div class="form-row">
              <label>描述</label>
              <textarea v-model="localForm.description" placeholder="社团简介..." rows="3"></textarea>
            </div>

            <div class="form-row">
              <label>核心技能</label>
              <input v-model="localForm.coreSkill" placeholder="如：编程、绘画、音乐" />
            </div>
          </div>

          <!-- 活动信息 -->
          <div class="form-section">
            <h4>活动信息</h4>
            <div class="form-row">
              <label>活动日</label>
              <select v-model="localForm.activityDay">
                <option value="">未设置</option>
                <option value="每周一">每周一</option>
                <option value="每周二">每周二</option>
                <option value="每周三">每周三</option>
                <option value="每周四">每周四</option>
                <option value="每周五">每周五</option>
                <option value="每周六">每周六</option>
                <option value="每周日">每周日</option>
                <option value="每日">每日</option>
              </select>
            </div>

            <div class="form-row">
              <label>社团模式</label>
              <div class="mode-options">
                <label class="mode-option">
                  <input type="radio" v-model="localForm.mode" value="normal" />
                  <span class="mode-label">🟢 普通社团</span>
                  <span class="mode-desc">成员可自由申请加入</span>
                </label>
                <label class="mode-option">
                  <input type="radio" v-model="localForm.mode" value="restricted" />
                  <span class="mode-label">🔵 特殊社团</span>
                  <span class="mode-desc">不可主动申请，需邀请加入（类似学生会）</span>
                </label>
              </div>
            </div>

            <div class="form-row">
              <label>活动地点</label>
              <div class="location-selector">
                <span class="location-display">{{ locationName || '未选择' }}</span>
                <button class="btn-select-location" @click="$emit('select-location')">
                  📍 选择地点
                </button>
              </div>
            </div>
          </div>

          <!-- 人员信息 -->
          <div class="form-section">
            <h4>人员信息</h4>
            <div class="form-row">
              <label>指导老师</label>
              <input v-model="localForm.advisor" placeholder="指导老师姓名" />
            </div>

            <div class="form-row">
              <label>部长</label>
              <input v-model="localForm.president" placeholder="部长姓名" />
            </div>

            <div class="form-row">
              <label>副部长</label>
              <input v-model="localForm.vicePresident" placeholder="副部长姓名" />
            </div>
          </div>

          <!-- 成员管理（仅编辑模式） -->
          <div v-if="isEditing" class="form-section">
            <div class="section-header">
              <h4>成员管理 <span class="member-count">{{ (localForm.members || []).length }}人</span></h4>
              <div class="member-tools">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="allowTextSelect" />
                  <span>允许选择文字</span>
                </label>
                <button
                  class="btn-remove-ghosts"
                  @click="removeGhostMembers"
                  :disabled="ghostMembers.size === 0"
                  title="移除所有幽灵成员"
                >
                  👻 清除幽灵 ({{ ghostMembers.size }})
                </button>
              </div>
            </div>
            <div class="members-list" :class="{ 'allow-select': allowTextSelect }">
              <span
                v-for="(member, idx) in (localForm.members || [])"
                :key="idx"
                class="member-tag"
                :class="{ 'ghost': ghostMembers.has(member) }"
              >
                {{ member }}
                <button class="member-remove" @click="removeMember(idx)">✕</button>
              </span>
              <span v-if="!(localForm.members || []).length" class="no-members">暂无成员</span>
            </div>
            <div class="member-add-row">
              <input
                v-model="newMemberName"
                placeholder="输入成员姓名后回车添加"
                @keyup.enter="addMember"
              />
              <button class="btn-add-member" @click="addMember">添加</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="handleSave">
            {{ isEditing ? '保存' : '创建' }}
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
import { ref, computed } from 'vue'

const props = defineProps({
  show: Boolean,
  form: Object,
  isEditing: Boolean,
  locationName: { type: String, default: '' },
  characterPool: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'save', 'update:form', 'select-location'])

const localForm = computed({
  get: () => props.form,
  set: (val) => emit('update:form', val)
})

const newMemberName = ref('')
const allowTextSelect = ref(false)

// 计算哪些成员是幽灵角色
const ghostMembers = computed(() => {
  if (!props.characterPool || !localForm.value.members) return new Set()
  const validNames = new Set(props.characterPool.map(c => c.name))
  return new Set(localForm.value.members.filter(name => !validNames.has(name)))
})

const addMember = () => {
  const name = newMemberName.value.trim()
  if (!name) return
  if (!localForm.value.members) localForm.value.members = []
  if (localForm.value.members.includes(name)) {
    newMemberName.value = ''
    return
  }
  localForm.value.members.push(name)
  newMemberName.value = ''
}

const removeMember = (index) => {
  if (localForm.value.members) {
    localForm.value.members.splice(index, 1)
  }
}

const removeGhostMembers = () => {
  const ghosts = Array.from(ghostMembers.value)
  if (ghosts.length === 0) {
    alert('当前没有幽灵成员')
    return
  }

  if (!confirm(`确定要移除 ${ghosts.length} 个幽灵成员吗？\n\n${ghosts.join('、')}`)) {
    return
  }

  localForm.value.members = localForm.value.members.filter(name => !ghostMembers.value.has(name))
}

const handleSave = () => {
  if (!localForm.value.name?.trim()) {
    alert('请填写社团名称')
    return
  }
  emit('save')
}
</script>

<style scoped>
.club-edit-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
}

.club-edit-modal {
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

.modal-header h3 { margin: 0; color: #fff; font-size: 18px; }

.close-btn {
  background: none; border: none; color: #999;
  font-size: 24px; cursor: pointer; padding: 0;
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: all 0.2s;
}
.close-btn:hover { background: #444; color: #fff; }

.modal-body { padding: 20px; overflow-y: auto; flex: 1; }

.form-section {
  margin-bottom: 25px; padding: 15px;
  background: #1a1a1a; border-radius: 8px;
}
.form-section h4 { margin: 0 0 15px 0; color: #fff; font-size: 16px; }

.form-row { margin-bottom: 15px; }
.form-row label { display: block; color: #ccc; margin-bottom: 8px; font-size: 14px; }

.form-row input:not([type]),
.form-row input[type="text"],
.form-row select,
.form-row textarea {
  width: 100%; padding: 10px;
  background: #2a2a2a; border: 1px solid #444;
  border-radius: 6px; color: #fff; font-size: 14px;
}
.form-row textarea { resize: vertical; font-family: inherit; }

.location-selector {
  display: flex; align-items: center; gap: 10px;
}
.location-display {
  flex: 1; padding: 10px;
  background: #2a2a2a; border: 1px solid #444;
  border-radius: 6px; color: #ccc; font-size: 14px;
}
.btn-select-location {
  padding: 8px 14px; background: #3a6ea5; color: #fff;
  border: none; border-radius: 6px; cursor: pointer;
  font-size: 13px; white-space: nowrap; transition: all 0.2s;
}
.btn-select-location:hover { background: #4a7eb5; }

.mode-options { display: flex; flex-direction: column; gap: 8px; }
.mode-option {
  display: flex; align-items: center; gap: 8px;
  padding: 10px; background: #2a2a2a; border: 1px solid #444;
  border-radius: 6px; cursor: pointer; transition: all 0.2s;
}
.mode-option:has(input:checked) { border-color: #4CAF50; background: #2a3a2a; }
.mode-option input[type="radio"] { margin: 0; cursor: pointer; }
.mode-label { color: #fff; font-size: 14px; font-weight: 500; }
.mode-desc { color: #999; font-size: 12px; margin-left: auto; }
.form-hint { color: #888; font-size: 12px; margin-top: 4px; display: block; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.member-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.btn-remove-ghosts {
  padding: 4px 8px;
  background: #FF9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.btn-remove-ghosts:hover {
  background: #F57C00;
}

.btn-remove-ghosts:disabled {
  background: #555;
  color: #888;
  cursor: not-allowed;
}

.member-count { color: #888; font-size: 13px; font-weight: 400; margin-left: 6px; }
.members-list {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px; background: #2a2a2a; border: 1px solid #444;
  border-radius: 6px; min-height: 40px; margin-bottom: 10px;
  user-select: none;
}
.members-list.allow-select {
  user-select: text;
}
.member-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; background: #3a3a3a; border: 1px solid #555;
  border-radius: 14px; color: #ddd; font-size: 13px;
}
.member-tag.ghost {
  border-color: #FF9800;
  background: rgba(255, 152, 0, 0.1);
}
.member-tag.ghost::before {
  content: '👻 ';
}
.member-remove {
  background: none; border: none; color: #999; cursor: pointer;
  font-size: 12px; padding: 0 2px; line-height: 1;
}
.member-remove:hover { color: #f44336; }
.no-members { color: #666; font-size: 13px; }
.member-add-row { display: flex; gap: 8px; }
.member-add-row input {
  flex: 1; padding: 8px 10px;
  background: #2a2a2a; border: 1px solid #444;
  border-radius: 6px; color: #fff; font-size: 13px;
}
.btn-add-member {
  padding: 8px 14px; background: #3a6ea5; color: #fff;
  border: none; border-radius: 6px; cursor: pointer;
  font-size: 13px; white-space: nowrap; transition: all 0.2s;
}
.btn-add-member:hover { background: #4a7eb5; }

.modal-footer {
  padding: 20px; border-top: 1px solid #444;
  display: flex; gap: 10px; justify-content: flex-end;
}
.modal-footer button {
  padding: 10px 20px; border: none; border-radius: 6px;
  cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;
}
.btn-primary { background: #4CAF50; color: white; }
.btn-primary:hover { background: #45a049; }
.btn-secondary { background: #666; color: white; }
.btn-secondary:hover { background: #555; }
</style>
