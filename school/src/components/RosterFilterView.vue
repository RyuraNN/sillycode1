<!-- 名册筛选视图组件 -->
<template>
  <div class="roster-filter-view">
    <!-- 工具栏 -->
    <div class="filter-toolbar">
      <div class="search-box">
        <input
          v-model="localSearchQuery"
          placeholder="搜索角色或作品..."
          class="search-input"
        />
      </div>

      <button class="btn-filters" @click="localShowFilters = !localShowFilters">
        {{ localShowFilters ? '隐藏筛选' : '显示筛选' }}
      </button>

      <button class="btn-expand-all" @click="$emit('expandAll')">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </button>
    </div>

    <!-- 高级筛选器 -->
    <div v-if="localShowFilters" class="advanced-filters">
      <div class="filter-row">
        <label>社团：</label>
        <select v-model="localClubFilter">
          <option value="">全部</option>
          <option v-for="club in availableClubs" :key="club" :value="club">
            {{ club }}
          </option>
        </select>
      </div>

      <div class="filter-row">
        <label>选课倾向：</label>
        <select v-model="localElectiveFilter">
          <option value="">全部</option>
          <option value="general">综合</option>
          <option value="music">音乐</option>
          <option value="sports">体育</option>
          <option value="arts">艺术</option>
          <option value="tech">科技</option>
          <option value="life">生活</option>
          <option value="academic">学术</option>
          <option value="performance">表演</option>
        </select>
      </div>

      <div class="filter-row">
        <label>性别：</label>
        <select v-model="localGenderFilter">
          <option value="">全部</option>
          <option value="female">女</option>
          <option value="male">男</option>
        </select>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>共 {{ totalStats.total }} 人</span>
      <span>已选 {{ totalStats.selected }} 人</span>
      <span>{{ filteredCount }} 个作品</span>
    </div>

    <!-- 学生列表（按作品分组） -->
    <div class="roster-list">
      <div v-for="(students, workName) in filteredGroups" :key="workName" class="work-group">
        <div class="work-header" @click="$emit('toggleWork', workName)">
          <input
            type="checkbox"
            :checked="getWorkStats(workName).all"
            :indeterminate="!getWorkStats(workName).all && !getWorkStats(workName).none"
            @click.stop="$emit('toggleWorkSelection', workName)"
          />
          <span class="work-name">{{ workName }}</span>
          <span class="work-stats">
            {{ getWorkStats(workName).selected }} / {{ getWorkStats(workName).total }}
          </span>
          <span class="expand-icon">{{ expandedWorks[workName] ? '▼' : '▶' }}</span>
        </div>

        <div v-if="expandedWorks[workName]" class="work-students">
          <div
            v-for="student in students"
            :key="student.name"
            class="student-item"
            :class="{ selected: isSelected(student) }"
          >
            <input
              type="checkbox"
              :checked="isSelected(student)"
              @change="$emit('toggleStudent', student)"
            />
            <div class="student-main-info">
              <span class="student-name">{{ student.name }}</span>
              <span class="student-gender">{{ student.gender === 'male' ? '♂' : '♀' }}</span>
            </div>
            <span class="student-class">{{ student.className }}</span>

            <div class="student-meta">
              <div v-if="student.clubs && student.clubs.length > 0" class="student-clubs">
                <span
                  v-for="club in student.clubs"
                  :key="club.id"
                  class="club-tag"
                  :class="{ 'has-role': club.role }"
                >
                  {{ club.name }}{{ club.role ? `(${club.role})` : '' }}
                </span>
              </div>
              <span class="student-elective">{{ getElectiveLabel(student.electivePref) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredCount === 0" class="empty-state">
        <p>没有找到符合条件的角色</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  filteredGroups: Object,
  expandedWorks: Object,
  searchQuery: String,
  showFilters: Boolean,
  clubFilter: String,
  electiveFilter: String,
  genderFilter: String,
  availableClubs: Array,
  totalStats: Object,
  currentRosterState: Object,
  allExpanded: Boolean
})

const emit = defineEmits([
  'toggleWork',
  'toggleWorkSelection',
  'toggleStudent',
  'expandAll',
  'update:searchQuery',
  'update:showFilters',
  'update:clubFilter',
  'update:electiveFilter',
  'update:genderFilter'
])

const localSearchQuery = computed({
  get: () => props.searchQuery,
  set: (val) => emit('update:searchQuery', val)
})

const localShowFilters = computed({
  get: () => props.showFilters,
  set: (val) => emit('update:showFilters', val)
})

const localClubFilter = computed({
  get: () => props.clubFilter,
  set: (val) => emit('update:clubFilter', val)
})

const localElectiveFilter = computed({
  get: () => props.electiveFilter,
  set: (val) => emit('update:electiveFilter', val)
})

const localGenderFilter = computed({
  get: () => props.genderFilter,
  set: (val) => emit('update:genderFilter', val)
})

const filteredCount = computed(() => {
  return Object.keys(props.filteredGroups).length
})

const isSelected = (student) => {
  return props.currentRosterState[student.classId]?.[student.name] || false
}

const getWorkStats = (workName) => {
  const students = props.filteredGroups[workName] || []
  const total = students.length
  const selected = students.reduce((sum, s) => {
    return sum + (isSelected(s) ? 1 : 0)
  }, 0)
  return {
    total,
    selected,
    all: total > 0 && total === selected,
    none: selected === 0
  }
}

const getElectiveLabel = (pref) => {
  const labels = {
    general: '综合',
    music: '音乐',
    sports: '体育',
    arts: '艺术',
    tech: '科技',
    life: '生活',
    academic: '学术',
    performance: '表演'
  }
  return labels[pref] || pref || '综合'
}
</script>

<style scoped>
.roster-filter-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
}

.filter-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px;
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
  padding: 8px 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #4CAF50;
}

.btn-filters,
.btn-expand-all {
  padding: 8px 14px;
  background: #444;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-filters:hover,
.btn-expand-all:hover {
  background: #555;
}

.advanced-filters {
  padding: 12px;
  background: #252525;
  border-bottom: 1px solid #444;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-row label {
  color: #999;
  font-size: 13px;
  min-width: 70px;
}

.filter-row select {
  flex: 1;
  padding: 6px 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.filter-row select:focus {
  outline: none;
  border-color: #4CAF50;
}

.stats-bar {
  padding: 10px 12px;
  background: #252525;
  border-bottom: 1px solid #444;
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #999;
  flex-wrap: wrap;
}

.stats-bar span {
  padding: 4px 10px;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #333;
}

.roster-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.work-group {
  margin-bottom: 12px;
}

.work-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #2a2a2a;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.work-header:hover {
  background: #333;
  border-color: #444;
}

.work-header input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.work-name {
  font-weight: 500;
  color: #fff;
  font-size: 14px;
  flex: 1;
}

.work-stats {
  padding: 3px 8px;
  background: #4CAF50;
  border-radius: 12px;
  color: white;
  font-size: 11px;
  font-weight: 500;
}

.expand-icon {
  color: #999;
  font-size: 12px;
}

.work-students {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-left: 12px;
}

.student-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  gap: 6px 10px;
  padding: 10px 12px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 6px;
  transition: all 0.2s;
  align-items: center;
}

.student-item:hover {
  background: #2a2a2a;
  border-color: #444;
}

.student-item.selected {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.08);
}

.student-item input[type="checkbox"] {
  grid-row: 1 / 3;
  cursor: pointer;
  width: 16px;
  height: 16px;
  align-self: start;
  margin-top: 2px;
}

.student-main-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.student-name {
  font-weight: 500;
  color: #fff;
  font-size: 14px;
}

.student-gender {
  color: #4CAF50;
  font-size: 15px;
}

.student-class {
  grid-column: 3;
  grid-row: 1;
  padding: 3px 8px;
  background: #1a1a1a;
  border-radius: 4px;
  color: #999;
  font-size: 11px;
  white-space: nowrap;
}

.student-meta {
  grid-column: 2 / 4;
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.student-clubs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}

.club-tag {
  padding: 2px 6px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 3px;
  color: #888;
  font-size: 10px;
}

.club-tag.has-role {
  background: #2196F3;
  border-color: #2196F3;
  color: white;
}

.student-elective {
  padding: 3px 8px;
  background: #1a1a1a;
  border-radius: 4px;
  color: #888;
  font-size: 11px;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 14px;
}

/* 滚动条样式 */
.roster-list::-webkit-scrollbar {
  width: 8px;
}

.roster-list::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.roster-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.roster-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 窄屏适配 */
@media (max-width: 768px) {
  .filter-toolbar {
    padding: 8px;
  }

  .search-box {
    min-width: 120px;
  }

  .btn-filters,
  .btn-expand-all {
    padding: 6px 10px;
    font-size: 12px;
  }

  .advanced-filters {
    padding: 8px;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .filter-row label {
    min-width: 55px;
    font-size: 12px;
  }

  .filter-row select {
    font-size: 12px;
  }

  .stats-bar {
    padding: 8px;
    gap: 6px;
    font-size: 12px;
  }

  .roster-list {
    padding: 8px;
  }

  .student-item {
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    padding: 8px;
  }

  .student-class {
    grid-column: 2;
    grid-row: auto;
    justify-self: start;
  }

  .student-meta {
    grid-column: 1 / -1;
  }

  .work-header {
    padding: 8px 10px;
    gap: 6px;
  }

  .work-students {
    padding-left: 6px;
  }
}
</style>
