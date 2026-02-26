<!-- 角色编辑器组件 -->
<template>
  <div class="character-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <div class="search-box">
        <input
          v-model="localSearchQuery"
          placeholder="搜索角色名或作品..."
          class="search-input"
        />
      </div>

      <div class="filter-group">
        <select v-model="localRoleFilter" class="filter-select">
          <option value="all">全部身份</option>
          <option value="student">学生</option>
          <option value="teacher">教师</option>
          <option value="staff">职工</option>
          <option value="pending">待入学</option>
        </select>

        <select v-model="localWorkFilter" class="filter-select">
          <option value="">全部作品</option>
          <option v-for="work in availableWorks" :key="work" :value="work">
            {{ work }}
          </option>
        </select>

        <select v-model="genderFilter" class="filter-select">
          <option value="">全部性别</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>

        <select v-model="classFilter" class="filter-select">
          <option value="">全部班级</option>
          <option v-for="cls in availableClasses" :key="cls.id" :value="cls.id">
            {{ cls.name }}
          </option>
        </select>

        <select v-model="sortBy" class="filter-select">
          <option value="default">默认排序</option>
          <option value="name">按名字</option>
          <option value="gender">按性别</option>
          <option value="class">按班级</option>
          <option value="origin">按作品</option>
        </select>
      </div>

      <button class="btn-add" @click="$emit('add')">
        ＋ 添加角色
      </button>
    </div>

    <!-- 角色列表 -->
    <div class="character-list">
      <div
        v-for="char in filteredCharacters"
        :key="char.name"
        class="character-card"
        @click="$emit('edit', char)"
      >
        <div class="char-header">
          <span class="char-name">{{ char.name }}</span>
          <span class="char-gender">{{ char.gender === 'male' ? '♂' : '♀' }}</span>
          <span class="char-role">{{ getRoleLabel(char) }}</span>
        </div>

        <div class="char-info">
          <span class="char-origin">{{ getCleanOrigin(char.origin) }}</span>
          <span v-if="char.classId" class="char-class">
            {{ getClassName(char.classId) }}
          </span>
          <span v-if="char.grade === 0" class="char-pending">待入学</span>
        </div>

        <div v-if="char.role === 'teacher' && char.subject" class="char-subject">
          {{ char.subject }}
        </div>

        <div v-if="char.role === 'staff'" class="char-staff-info">
          {{ char.staffTitle }} - {{ char.workplace || '未设置' }}
        </div>

        <div class="char-actions">
          <button
            class="btn-edit"
            @click.stop="$emit('edit', char)"
          >
            编辑
          </button>
          <button
            class="btn-delete"
            @click.stop="$emit('delete', char)"
          >
            删除
          </button>
        </div>
      </div>

      <div v-if="filteredCharacters.length === 0" class="empty-state">
        <p>没有找到符合条件的角色</p>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="editor-stats">
      <span>共 {{ characterPool.length }} 个角色</span>
      <span>学生 {{ studentCount }}</span>
      <span>教师 {{ teacherCount }}</span>
      <span>职工 {{ staffCount }}</span>
      <span v-if="pendingCount > 0">待入学 {{ pendingCount }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  characterPool: Array,
  searchQuery: String,
  roleFilter: String,
  workFilter: String,
  classes: Object
})

const emit = defineEmits([
  'add',
  'edit',
  'delete',
  'update:searchQuery',
  'update:roleFilter',
  'update:workFilter'
])

const genderFilter = ref('')
const classFilter = ref('')
const sortBy = ref('default')

const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val)
})

const localRoleFilter = computed({
  get: () => props.roleFilter,
  set: (val) => emit('update:roleFilter', val)
})

const localWorkFilter = computed({
  get: () => props.workFilter,
  set: (val) => emit('update:workFilter', val)
})

// 提取干净的作品名
const getCleanOrigin = (origin) => {
  if (!origin) return '未知'
  const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
  return match ? match[1] : origin
}

// 获取班级名称
const getClassName = (classId) => {
  return props.classes[classId]?.name || classId
}

// 获取身份标签
const getRoleLabel = (char) => {
  if (char.role === 'student') return '学生'
  if (char.role === 'teacher') return char.isHeadTeacher ? '班主任' : '教师'
  if (char.role === 'staff') return '职工'
  return '未知'
}

// 可用作品列表
const availableWorks = computed(() => {
  const works = new Set()
  props.characterPool.forEach(c => {
    const work = getCleanOrigin(c.origin)
    if (work !== '未知') works.add(work)
  })
  return Array.from(works).sort()
})

// 可用班级列表
const availableClasses = computed(() => {
  if (!props.classes) return []
  return Object.entries(props.classes).map(([id, info]) => ({
    id,
    name: info.name || id
  })).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
})

// 过滤后的角色列表
const filteredCharacters = computed(() => {
  let result = props.characterPool

  // 身份筛选
  if (props.roleFilter !== 'all') {
    if (props.roleFilter === 'pending') {
      result = result.filter(c => c.role === 'student' && (c.grade === 0 || (!c.classId && !c.grade)))
    } else {
      result = result.filter(c => c.role === props.roleFilter)
    }
  }

  // 作品筛选
  if (props.workFilter) {
    result = result.filter(c => getCleanOrigin(c.origin) === props.workFilter)
  }

  // 性别筛选
  if (genderFilter.value) {
    result = result.filter(c => c.gender === genderFilter.value)
  }

  // 班级筛选
  if (classFilter.value) {
    result = result.filter(c => c.classId === classFilter.value)
  }

  // 搜索筛选
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.origin && c.origin.toLowerCase().includes(query))
    )
  }

  // 排序
  if (sortBy.value !== 'default') {
    result = [...result].sort((a, b) => {
      switch (sortBy.value) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '', 'zh')
        case 'gender':
          return (a.gender || '').localeCompare(b.gender || '')
        case 'class':
          return (a.classId || '').localeCompare(b.classId || '', 'zh')
        case 'origin':
          return getCleanOrigin(a.origin).localeCompare(getCleanOrigin(b.origin), 'zh')
        default:
          return 0
      }
    })
  }

  return result
})

// 统计信息
const studentCount = computed(() => {
  return props.characterPool.filter(c => c.role === 'student').length
})

const teacherCount = computed(() => {
  return props.characterPool.filter(c => c.role === 'teacher').length
})

const staffCount = computed(() => {
  return props.characterPool.filter(c => c.role === 'staff').length
})

const pendingCount = computed(() => {
  return props.characterPool.filter(c => c.role === 'student' && c.grade === 0).length
})
</script>

<style scoped>
.character-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  gap: 10px;
  padding: 15px;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
  flex-wrap: wrap;
}

.search-box {
  flex: 1;
  min-width: 200px;
}

.search-input {
  width: 100%;
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
}

.filter-group {
  display: flex;
  gap: 10px;
}

.filter-select {
  padding: 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
}

.btn-add {
  padding: 10px 20px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-add:hover {
  background: #45a049;
}

.character-list {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
  align-content: start;
}

.character-card {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.2s;
}

.character-card:hover {
  border-color: #666;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.char-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.char-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.char-gender {
  font-size: 18px;
  color: #4CAF50;
}

.char-role {
  padding: 2px 8px;
  background: #444;
  border-radius: 4px;
  font-size: 12px;
  color: #ccc;
}

.char-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
}

.char-origin {
  color: #999;
}

.char-class {
  padding: 2px 6px;
  background: #1a1a1a;
  border-radius: 4px;
  color: #4CAF50;
}

.char-pending {
  padding: 2px 6px;
  background: #FF9800;
  border-radius: 4px;
  color: white;
  font-size: 11px;
}

.char-subject,
.char-staff-info {
  font-size: 13px;
  color: #ccc;
  margin-bottom: 10px;
}

.char-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-edit,
.btn-delete {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-edit {
  background: #2196F3;
  color: white;
}

.btn-edit:hover {
  background: #0b7dda;
}

.btn-delete {
  background: #d32f2f;
  color: white;
}

.btn-delete:hover {
  background: #b71c1c;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px;
  color: #999;
}

.editor-stats {
  padding: 15px;
  background: #2a2a2a;
  border-top: 1px solid #444;
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #ccc;
}

.editor-stats span {
  padding: 4px 10px;
  background: #1a1a1a;
  border-radius: 4px;
}

/* 窄屏适配 */
@media (max-width: 768px) {
  .editor-toolbar {
    padding: 10px;
    gap: 8px;
  }

  .search-box {
    min-width: 100%;
    order: -1;
  }

  .filter-group {
    flex-wrap: wrap;
    width: 100%;
    gap: 8px;
  }

  .filter-select {
    flex: 1;
    min-width: calc(50% - 4px);
    padding: 8px;
    font-size: 13px;
  }

  .btn-add {
    width: 100%;
    padding: 10px;
  }

  .character-list {
    padding: 10px;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .editor-stats {
    padding: 10px;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
  }
}
</style>
