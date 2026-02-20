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
      <button class="btn-add" @click="$emit('add-club')">
        ＋ 新建社团
      </button>
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

    <!-- 统计 -->
    <div class="editor-footer">
      共 {{ clubArray.length }} 个社团
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  clubs: { type: Object, default: () => ({}) }
})

defineEmits(['add-club', 'edit-club', 'delete-club'])

const searchQuery = ref('')

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

.editor-footer {
  padding: 8px 0; text-align: right;
  color: #888; font-size: 12px; flex-shrink: 0;
}
</style>
