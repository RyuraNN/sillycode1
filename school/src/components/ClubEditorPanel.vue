<!-- 社团编辑器面板 -->
<template>
  <div class="club-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <div class="search-box">
        <input
          v-model="searchQuery"
          placeholder="搜索社团名称..."
          class="search-input"
        />
      </div>
      <button class="btn-ai-generate" :disabled="generating"
        @click="showGenPanel = !showGenPanel">
        🤖 AI自动生成
      </button>
      <button class="btn-add" @click="$emit('add-club')">
        ＋ 新建社团
      </button>
    </div>

    <!-- AI生成面板 -->
    <div v-if="showGenPanel" class="ai-gen-panel">
      <div class="gen-mode-select">
        <label class="radio-label" :class="{ active: clubMode === 'original' }">
          <input type="radio" v-model="clubMode" value="original" /> 原作向
        </label>
        <label class="radio-label" :class="{ active: clubMode === 'creative' }">
          <input type="radio" v-model="clubMode" value="creative" /> 原创向
        </label>
        <button class="btn-start-gen" :disabled="generating"
          @click="$emit('generate-clubs', clubMode)">
          {{ generating ? (progress ? `⏳ 生成中 ${progress} 批...` : '⏳ 生成中...') : '🚀 开始生成' }}
        </button>
      </div>
      <p class="gen-hint">活动地点需要生成后在社团编辑中通过地图编辑器手动设置</p>
      <div v-if="clubError" class="gen-error">❌ {{ clubError }}</div>
      <div v-if="clubResults.length > 0" class="gen-preview">
        <div class="preview-header">
          <span>预览：{{ clubResults.length }} 个社团</span>
          <div class="preview-actions">
            <button class="btn-apply" @click="$emit('apply-clubs')">✅ 应用</button>
            <button class="btn-cancel-gen" @click="handleCancelGenerate">✖ 取消</button>
          </div>
        </div>
        <div class="preview-list">
          <div v-for="club in clubResults" :key="club.id" class="preview-item"
            :class="{ 'has-conflict': conflictInfo[club.id] }">
            <div class="preview-main">
              <span class="preview-name">{{ club.name }}</span>
              <span class="preview-members">👥 {{ club.members?.length || 0 }}人</span>
              <span class="preview-advisor">
                指导: {{ club.advisor || '无' }}
                <span v-if="isNewAdvisor(club.advisor)" class="new-advisor-tag">🆕新</span>
              </span>
              <span v-if="club.activityDay" class="preview-day">📅 {{ club.activityDay }}</span>
            </div>
            <div v-if="conflictInfo[club.id]" class="preview-conflicts">
              <div v-for="(c, ci) in conflictInfo[club.id]" :key="ci" class="conflict-line">
                ⚠️ {{ c.msg }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 社团列表 -->
    <div class="club-list">
      <div
        v-for="club in filteredClubs"
        :key="club.id"
        class="club-card"
        @click="$emit('edit-club', club)"
      >
        <div class="club-header">
          <span class="club-name">{{ club.name }}</span>
          <span v-if="club.mode === 'restricted' || club.id === 'student_council'" class="club-mode restricted">🔵 特殊</span>
          <span v-else class="club-mode normal">🟢 普通</span>
          <span v-if="club.activityDay" class="club-day">{{ club.activityDay }}</span>
        </div>

        <div v-if="club.description" class="club-desc">{{ club.description }}</div>

        <div class="club-meta">
          <span v-if="getPresidentText(club)" class="meta-item">
            👤 {{ getPresidentText(club) }}
          </span>
          <span class="meta-item">
            👥 {{ (club.members || []).length }}人
          </span>
          <span v-if="club.coreSkill" class="meta-item">
            🎯 {{ club.coreSkill }}
          </span>
        </div>

        <div class="club-actions">
          <button class="btn-edit" @click.stop="$emit('edit-club', club)">编辑</button>
          <button
            class="btn-delete"
            @click.stop="$emit('delete-club', club.id)"
          >删除</button>
        </div>
      </div>

      <div v-if="filteredClubs.length === 0" class="empty-state">
        暂无社团，点击"新建社团"创建一个吧
      </div>
    </div>

    <!-- 回收站 -->
    <div v-if="deletedClubs.length > 0" class="recycle-bin">
      <div class="recycle-header" @click="showRecycleBin = !showRecycleBin">
        🗑️ 回收站 ({{ deletedClubs.length }})
        <span class="toggle-icon">{{ showRecycleBin ? '▼' : '▶' }}</span>
      </div>
      <div v-if="showRecycleBin" class="recycle-list">
        <div v-for="club in deletedClubs" :key="club.id" class="recycle-item">
          <span class="recycle-name">{{ club.name }}</span>
          <div class="recycle-actions">
            <button class="btn-restore" @click="$emit('restore-club', club.id)">↩ 恢复</button>
            <button class="btn-confirm-delete" @click="$emit('confirm-delete', club.id)">🗑️ 永久删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 统计 -->
    <div class="editor-footer">
      共 {{ clubArray.length }} 个社团
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  clubs: { type: Object, default: () => ({}) },
  generating: { type: Boolean, default: false },
  clubResults: { type: Array, default: () => [] },
  clubError: { type: String, default: '' },
  progress: { type: String, default: '' },
  newAdvisors: { type: Array, default: () => [] },
  deletedClubs: { type: Array, default: () => [] }
})

const emit = defineEmits(['add-club', 'edit-club', 'delete-club', 'generate-clubs', 'apply-clubs', 'cancel-generate', 'restore-club', 'confirm-delete'])

const searchQuery = ref('')
const showGenPanel = ref(false)
const clubMode = ref('original')
const showRecycleBin = ref(false)

function handleCancelGenerate() {
  showGenPanel.value = false
  emit('cancel-generate')
}

// 冲突检测
const conflictInfo = computed(() => {
  if (!props.clubResults.length) return {}
  const clubs = props.clubs || {}
  const info = {}
  for (const result of props.clubResults) {
    const conflicts = []
    // ID冲突
    if (clubs[result.id]) {
      conflicts.push({ type: 'id', msg: `与现有社团"${clubs[result.id].name}"ID重复，将合并成员` })
    }
    // 成员已在其他社团
    const memberConflicts = []
    for (const member of (result.members || [])) {
      const existingClubs = []
      for (const [cid, c] of Object.entries(clubs)) {
        if ((c.members || []).includes(member)) existingClubs.push(c.name || cid)
      }
      if (existingClubs.length > 0) {
        memberConflicts.push(`${member}(已在${existingClubs.join('、')})`)
      }
    }
    if (memberConflicts.length > 0) {
      conflicts.push({ type: 'member', msg: `成员重叠: ${memberConflicts.join('; ')}` })
    }
    if (conflicts.length > 0) info[result.id] = conflicts
  }
  return info
})

const clubArray = computed(() => {
  return Object.values(props.clubs || {})
})

const filteredClubs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return clubArray.value
  return clubArray.value.filter(c =>
    c.name?.toLowerCase().includes(q) ||
    c.description?.toLowerCase().includes(q)
  )
})

const getPresidentText = (club) => {
  if (!club.president) return ''
  return Array.isArray(club.president) ? club.president.join(', ') : club.president
}

const newAdvisorNames = computed(() => new Set((props.newAdvisors || []).map(a => a.name)))
const isNewAdvisor = (name) => name && newAdvisorNames.value.has(name)
</script>

<style scoped>
.club-editor { display: flex; flex-direction: column; height: 100%; }

.editor-toolbar {
  display: flex; gap: 10px; padding: 10px 0;
  align-items: center; flex-shrink: 0;
}
.search-box { flex: 1; }
.search-input {
  width: 100%; padding: 8px 12px;
  background: #1a1a1a; border: 1px solid #444;
  border-radius: 6px; color: #fff; font-size: 14px;
}
.btn-add {
  padding: 8px 16px; background: #4CAF50; color: white;
  border: none; border-radius: 6px; cursor: pointer;
  font-size: 14px; white-space: nowrap; transition: all 0.2s;
}
.btn-add:hover { background: #45a049; }

.btn-ai-generate {
  padding: 8px 16px; background: #7c4dff; color: white;
  border: none; border-radius: 6px; cursor: pointer;
  font-size: 14px; white-space: nowrap; transition: all 0.2s;
}
.btn-ai-generate:hover { background: #651fff; }
.btn-ai-generate:disabled { opacity: 0.6; cursor: not-allowed; }

.ai-gen-panel {
  background: #2a2a2a; border: 1px solid #444;
  border-radius: 8px; padding: 12px 16px; margin-bottom: 8px;
}
.gen-mode-select {
  display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
}
.radio-label {
  display: flex; align-items: center; gap: 4px;
  color: #ccc; font-size: 13px; cursor: pointer;
  padding: 4px 10px; border-radius: 4px; transition: all 0.2s;
}
.radio-label.active { color: #fff; background: #333; }
.radio-label input[type="radio"] { accent-color: #7c4dff; }
.btn-start-gen {
  margin-left: auto; padding: 6px 14px;
  background: #7c4dff; color: white; border: none;
  border-radius: 6px; cursor: pointer; font-size: 13px;
  transition: all 0.2s;
}
.btn-start-gen:hover { background: #651fff; }
.btn-start-gen:disabled { opacity: 0.6; cursor: not-allowed; }
.gen-hint { color: #888; font-size: 12px; margin: 0 0 8px; }
.gen-error { color: #f44336; font-size: 13px; margin-bottom: 8px; }
.gen-preview { margin-top: 8px; }
.preview-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px; color: #ccc; font-size: 13px;
}
.preview-actions { display: flex; gap: 8px; }
.btn-apply {
  padding: 4px 12px; background: #4CAF50; color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.btn-apply:hover { background: #45a049; }
.btn-cancel-gen {
  padding: 4px 12px; background: #666; color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.btn-cancel-gen:hover { background: #555; }
.preview-list {
  max-height: 200px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
}
.preview-item {
  padding: 6px 10px; background: #1a1a1a; border-radius: 4px;
  font-size: 13px;
}
.preview-item.has-conflict { border-left: 3px solid #ff9800; }
.preview-main {
  display: flex; align-items: center; gap: 10px;
}
.preview-conflicts { margin-top: 4px; }
.conflict-line { color: #ff9800; font-size: 12px; }
.preview-name { color: #fff; font-weight: 500; }
.preview-members { color: #81c784; }
.preview-advisor { color: #aaa; }
.new-advisor-tag {
  color: #ff9800; font-size: 11px;
  background: rgba(255, 152, 0, 0.15);
  padding: 1px 4px; border-radius: 3px; margin-left: 4px;
}
.preview-day { color: #8bc34a; }

.club-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 0;
}

.club-card {
  background: #1a1a1a; border: 1px solid #333;
  border-radius: 8px; padding: 14px;
  cursor: pointer; transition: all 0.2s;
}
.club-card:hover { border-color: #4CAF50; background: #222; }

.club-header {
  display: flex; justify-content: space-between;
  align-items: center; margin-bottom: 6px;
}
.club-name { color: #fff; font-size: 15px; font-weight: 600; }
.club-day {
  color: #8bc34a; font-size: 12px;
  background: rgba(139, 195, 74, 0.15);
  padding: 2px 8px; border-radius: 4px;
}

.club-mode {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
}
.club-mode.restricted {
  color: #64b5f6; background: rgba(100, 181, 246, 0.15);
}
.club-mode.normal {
  color: #81c784; background: rgba(129, 199, 132, 0.15);
}

.club-desc {
  color: #999; font-size: 13px;
  margin-bottom: 8px;
  overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}

.club-meta {
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-bottom: 8px;
}
.meta-item { color: #aaa; font-size: 12px; }

.club-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-edit, .btn-delete {
  padding: 4px 12px; border: none; border-radius: 4px;
  cursor: pointer; font-size: 12px; transition: all 0.2s;
}
.btn-edit { background: #3a6ea5; color: white; }
.btn-edit:hover { background: #4a7eb5; }
.btn-delete { background: #c62828; color: white; }
.btn-delete:hover { background: #d32f2f; }

.empty-state {
  text-align: center; color: #666;
  padding: 40px 0; font-size: 14px;
}

.recycle-bin {
  flex-shrink: 0; border-top: 1px solid #333;
  margin-top: 4px; padding-top: 4px;
}
.recycle-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 8px; color: #888; font-size: 13px;
  cursor: pointer; border-radius: 4px; transition: background 0.2s;
}
.recycle-header:hover { background: #1a1a1a; }
.toggle-icon { font-size: 10px; }
.recycle-list {
  max-height: 150px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
  padding: 4px 0;
}
.recycle-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; background: #1a1a1a; border-radius: 4px;
  border-left: 3px solid #666;
}
.recycle-name { color: #999; font-size: 13px; text-decoration: line-through; }
.recycle-actions { display: flex; gap: 6px; }
.btn-restore {
  padding: 3px 10px; background: #3a6ea5; color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 11px;
}
.btn-restore:hover { background: #4a7eb5; }
.btn-confirm-delete {
  padding: 3px 10px; background: #c62828; color: white;
  border: none; border-radius: 4px; cursor: pointer; font-size: 11px;
}
.btn-confirm-delete:hover { background: #d32f2f; }

.editor-footer {
  padding: 8px 0; text-align: right;
  color: #888; font-size: 12px; flex-shrink: 0;
}
</style>
