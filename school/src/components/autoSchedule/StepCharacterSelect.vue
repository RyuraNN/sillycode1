<!-- Step1: 角色筛选多选 -->
<script setup>
import { ref, computed } from 'vue'
import { ELECTIVE_PREFERENCES } from '../../data/coursePoolData'

const props = defineProps({
  characterPool: { type: Array, default: () => [] },
  originGroups: { type: Map, default: () => new Map() },
  fullRosterSnapshot: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['next'])

const searchQuery = ref('')
const workFilter = ref('')
const genderFilter = ref('')
const prefFilter = ref('')
const roleFilter = ref('')
const selected = ref(new Set())
const expandedWorks = ref({})

// 按作品分组的角色列表
const groupedCharacters = computed(() => {
  const groups = {}
  const pool = props.characterPool || []

  pool.forEach(c => {
    if (!c.name) return
    const origin = c.origin || '未知作品'

    // 筛选
    if (searchQuery.value && !c.name.includes(searchQuery.value) && !origin.includes(searchQuery.value)) return
    if (workFilter.value && origin !== workFilter.value) return
    if (genderFilter.value && c.gender !== genderFilter.value) return
    if (prefFilter.value && c.electivePreference !== prefFilter.value) return
    if (roleFilter.value === 'student' && c.role !== 'student') return
    if (roleFilter.value === 'teacher' && c.role !== 'teacher') return
    if (roleFilter.value === 'staff' && c.role !== 'staff') return
    if (roleFilter.value === 'external' && c.role !== 'external') return
    if (roleFilter.value === 'unassigned' && c.classId) return

    if (!groups[origin]) groups[origin] = []
    groups[origin].push(c)
  })

  return groups
})

// 所有可用作品列表
const availableWorks = computed(() => {
  const works = new Set()
  ;(props.characterPool || []).forEach(c => {
    if (c.origin) works.add(c.origin)
  })
  return Array.from(works).sort((a, b) => a.localeCompare(b, 'zh'))
})

// 统计
const stats = computed(() => {
  const all = Array.from(selected.value)
  const pool = props.characterPool || []
  const students = all.filter(name => {
    const c = pool.find(p => p.name === name)
    return c && c.role === 'student'
  }).length
  const teachers = all.filter(name => {
    const c = pool.find(p => p.name === name)
    return c && c.role === 'teacher'
  }).length
  const staff = all.filter(name => {
    const c = pool.find(p => p.name === name)
    return c && c.role === 'staff'
  }).length
  const external = all.filter(name => {
    const c = pool.find(p => p.name === name)
    return c && c.role === 'external'
  }).length
  return { total: all.length, students, teachers, staff, external }
})

function toggleChar(name) {
  const s = new Set(selected.value)
  if (s.has(name)) s.delete(name)
  else s.add(name)
  selected.value = s
}

function toggleWork(origin, chars) {
  const s = new Set(selected.value)
  const allSelected = chars.every(c => s.has(c.name))
  chars.forEach(c => {
    if (allSelected) s.delete(c.name)
    else s.add(c.name)
  })
  selected.value = s
}

function selectAll() {
  const s = new Set()
  for (const chars of Object.values(groupedCharacters.value)) {
    chars.forEach(c => s.add(c.name))
  }
  selected.value = s
}

function selectNone() {
  selected.value = new Set()
}

function selectUnassigned() {
  const s = new Set()
  ;(props.characterPool || []).forEach(c => {
    if (!c.classId && c.name) s.add(c.name)
  })
  selected.value = s
}

function toggleExpand(origin) {
  expandedWorks.value[origin] = !expandedWorks.value[origin]
}

function getWorkSelectedCount(chars) {
  return chars.filter(c => selected.value.has(c.name)).length
}

function handleNext() {
  const pool = props.characterPool || []
  const selectedChars = pool.filter(c => selected.value.has(c.name))
  emit('next', selectedChars)
}
</script>

<template>
  <div class="step-char-select">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="🔍 搜索角色名/作品..."
      />
      <select v-model="workFilter" class="filter-select">
        <option value="">全部作品</option>
        <option v-for="w in availableWorks" :key="w" :value="w">{{ w }}</option>
      </select>
      <select v-model="genderFilter" class="filter-select">
        <option value="">全部性别</option>
        <option value="male">男</option>
        <option value="female">女</option>
      </select>
      <select v-model="prefFilter" class="filter-select">
        <option value="">全部偏好</option>
        <option v-for="(info, key) in ELECTIVE_PREFERENCES" :key="key" :value="key">
          {{ info.icon }} {{ info.name }}
        </option>
      </select>
      <select v-model="roleFilter" class="filter-select">
        <option value="">全部角色</option>
        <option value="student">学生</option>
        <option value="teacher">教师</option>
        <option value="staff">职工</option>
        <option value="external">校外人员</option>
        <option value="unassigned">仅未分班</option>
      </select>
    </div>

    <!-- 快捷操作 -->
    <div class="quick-actions">
      <button class="btn-quick" @click="selectAll">全选</button>
      <button class="btn-quick" @click="selectNone">全不选</button>
      <button class="btn-quick" @click="selectUnassigned">仅未分班</button>
      <button class="btn-quick" @click="roleFilter = 'student'">仅学生</button>
      <button class="btn-quick" @click="roleFilter = 'teacher'">仅教师</button>
    </div>

    <!-- 角色列表 -->
    <div class="char-list">
      <div v-for="(chars, origin) in groupedCharacters" :key="origin" class="work-group">
        <div class="work-header" @click="toggleExpand(origin)">
          <span class="expand-icon">{{ expandedWorks[origin] === false ? '▶' : '▼' }}</span>
          <span class="work-name">{{ origin }}</span>
          <span class="work-count">({{ getWorkSelectedCount(chars) }}/{{ chars.length }}已选)</span>
          <button class="btn-work-select" @click.stop="toggleWork(origin, chars)">
            {{ chars.every(c => selected.has(c.name)) ? '取消' : '全选' }}
          </button>
        </div>
        <div v-if="expandedWorks[origin] !== false" class="work-chars">
          <label
            v-for="c in chars"
            :key="c.name"
            class="char-item"
            :class="{ selected: selected.has(c.name) }"
          >
            <input
              type="checkbox"
              :checked="selected.has(c.name)"
              @change="toggleChar(c.name)"
            />
            <span class="char-name">{{ c.name }}</span>
            <span class="char-gender">{{ c.gender === 'male' ? '♂' : '♀' }}</span>
            <span class="char-role" :class="c.role">{{ c.role === 'teacher' ? '👩‍🏫 教师' : c.role === 'staff' ? '🔧 职工' : c.role === 'external' ? '🏢 校外' : '👩‍🎓 学生' }}</span>
            <span v-if="c.electivePreference && c.electivePreference !== 'general'" class="char-pref">
              {{ ELECTIVE_PREFERENCES[c.electivePreference]?.icon || '' }} {{ c.electivePreference }}
            </span>
            <span v-if="!c.classId" class="char-unassigned">未分班</span>
          </label>
        </div>
      </div>
      <div v-if="Object.keys(groupedCharacters).length === 0" class="empty-hint">
        没有符合条件的角色
      </div>
    </div>

    <!-- 底部统计 + 下一步 -->
    <div class="step-footer">
      <div class="stats">
        已选: <strong>{{ stats.total }}人</strong>
        (学生{{ stats.students }}, 教师{{ stats.teachers }}<span v-if="stats.staff">, 职工{{ stats.staff }}</span><span v-if="stats.external">, 校外{{ stats.external }}</span>)
        <span v-if="stats.total > 20" class="batch-hint">将分{{ Math.ceil(stats.total / 15) }}批处理</span>
      </div>
      <button class="btn-next" :disabled="stats.total === 0" @click="handleNext">
        开始排班 →
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-char-select {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #222;
  border-bottom: 1px solid #444;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  min-width: 150px;
  padding: 8px 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
}
.search-input:focus { border-color: #4CAF50; outline: none; }
.filter-select {
  padding: 8px 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  min-width: 90px;
}
.quick-actions {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.btn-quick {
  padding: 5px 12px;
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-quick:hover { background: #444; color: #fff; }
.char-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}
.work-group { margin-bottom: 4px; }
.work-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #2a2a2a;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}
.work-header:hover { background: #333; }
.expand-icon { color: #888; font-size: 11px; width: 14px; }
.work-name { font-weight: 600; color: #ddd; font-size: 14px; }
.work-count { color: #888; font-size: 12px; }
.btn-work-select {
  margin-left: auto;
  padding: 3px 10px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
}
.btn-work-select:hover { background: #555; }
.work-chars { padding: 4px 0 4px 22px; }
.char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.char-item:hover { background: rgba(255,255,255,0.05); }
.char-item.selected { background: rgba(76,175,80,0.1); }
.char-item input[type="checkbox"] { accent-color: #4CAF50; }
.char-name { color: #eee; font-size: 13px; }
.char-gender { font-size: 13px; }
.char-role {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  background: #444;
  color: #aaa;
}
.char-role.teacher { background: #1565C0; color: #fff; }
.char-role.staff { background: #6A1B9A; color: #fff; }
.char-role.external { background: #E65100; color: #fff; }
.char-pref { font-size: 11px; color: #888; }
.char-unassigned {
  font-size: 10px;
  color: #ff9800;
  background: rgba(255,152,0,0.15);
  padding: 1px 5px;
  border-radius: 3px;
}
.empty-hint {
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 14px;
}
.step-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #222;
  border-top: 1px solid #444;
  flex-shrink: 0;
}
.stats { color: #aaa; font-size: 13px; }
.stats strong { color: #fff; }
.batch-hint { color: #ff9800; font-size: 12px; margin-left: 8px; }
.btn-next {
  padding: 10px 24px;
  background: #4CAF50;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-next:hover:not(:disabled) { background: #45a049; }
.btn-next:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 768px) {
  .filter-bar { padding: 8px 10px; gap: 6px; }
  .filter-select { min-width: 70px; font-size: 11px; }
  .char-item { padding: 8px 10px; min-height: 44px; }
  .step-footer { flex-wrap: wrap; gap: 8px; }
  .btn-next { width: 100%; }
}
</style>
