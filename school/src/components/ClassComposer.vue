<!-- 班级组合器组件 -->
<template>
  <div class="class-composer">
    <!-- 工具栏 -->
    <div class="composer-toolbar">
      <div class="class-selector">
        <label>目标班级：</label>
        <select v-model="localTargetClass">
          <option v-for="(classInfo, classId) in classes" :key="classId" :value="classId">
            {{ classInfo.name || classId }}
          </option>
        </select>
      </div>

      <div class="preset-selector">
        <label>预设：</label>
        <select v-model="localPreset">
          <option value="default">默认名册</option>
          <option value="blank">空白名册</option>
        </select>
      </div>

      <button class="btn-add-class" @click="$emit('addClass')">
        ＋ 新建班级
      </button>
      <button class="btn-set-classroom" @click="$emit('setClassroom')">
        🏫 设置教室
      </button>
    </div>

    <!-- 主内容区 -->
    <div class="composer-content">
      <!-- 窄屏切换标签 -->
      <div class="composer-panel-tabs">
        <button
          :class="{ active: composerPanel === 'class' }"
          @click="composerPanel = 'class'"
        >
          当前班级
        </button>
        <button
          :class="{ active: composerPanel === 'pool' }"
          @click="composerPanel = 'pool'"
        >
          可用角色
        </button>
      </div>

      <!-- 左侧：当前班级 -->
      <div class="current-class-panel" v-show="composerPanel === 'class' || !isMobile">
        <div class="panel-header">
          <h4>{{ classData.name || '未命名班级' }}</h4>
          <span v-if="classData.classroomId" class="classroom-tag" title="教室">🏫 {{ classData.classroomId }}</span>
          <span class="member-count">
            {{ totalMembers }}人
          </span>
        </div>

        <div class="class-members">
          <!-- 班主任 -->
          <div class="member-section">
            <h5>班主任</h5>
            <div v-if="classData.headTeacher?.name" class="member-item">
              <span class="member-name">{{ classData.headTeacher.name }}</span>
              <span class="member-origin">{{ getCleanOrigin(classData.headTeacher.origin) }}</span>
              <button class="btn-remove" @click="$emit('removeHeadTeacher')">✕</button>
            </div>
            <div v-else class="empty-slot">未设置</div>
          </div>

          <!-- 科任教师 -->
          <div class="member-section">
            <h5>科任教师（{{ teachers.length }}）</h5>
            <div class="member-list">
              <div v-for="(teacher, idx) in teachers" :key="idx" class="member-item">
                <span class="member-name">{{ teacher.name }}</span>
                <span class="member-subject">{{ teacher.subject }}</span>
                <span class="member-origin">{{ getCleanOrigin(teacher.origin) }}</span>
                <button class="btn-remove" @click="$emit('removeTeacher', idx)">✕</button>
              </div>
            </div>
          </div>

          <!-- 学生 -->
          <div class="member-section">
            <h5>学生（{{ students.length }}）</h5>
            <div class="member-list">
              <div v-for="(student, idx) in students" :key="idx" class="member-item">
                <span class="member-name">{{ student.name }}</span>
                <span class="member-gender">{{ student.gender === 'male' ? '♂' : '♀' }}</span>
                <span class="member-origin">{{ getCleanOrigin(student.origin) }}</span>
                <button class="btn-remove" @click="$emit('removeStudent', idx)">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：可用角色池 -->
      <div class="character-pool-panel" v-show="composerPanel === 'pool' || !isMobile">
        <div class="panel-header">
          <h4>可用角色</h4>
          <span class="pool-count">{{ filteredCharacters.length }}人</span>
        </div>

        <!-- 筛选工具栏 -->
        <div class="pool-filters">
          <input
            v-model="localSearchQuery"
            placeholder="搜索..."
            class="filter-input"
          />

          <select v-model="localRoleFilter" class="filter-select">
            <option value="all">全部</option>
            <option value="student">学生</option>
            <option value="teacher">教师</option>
            <option value="pending">待入学</option>
          </select>

          <select v-model="localWorkFilter" class="filter-select">
            <option value="">全部作品</option>
            <option v-for="work in availableWorks" :key="work.name" :value="work.name">
              {{ work.name }} ({{ work.count }})
            </option>
          </select>

          <label class="filter-checkbox">
            <input type="checkbox" v-model="localShowUnassigned" />
            仅未分配
          </label>

          <label class="filter-checkbox">
            <input type="checkbox" v-model="localShowInRoster" />
            名册内已勾选
          </label>

          <label class="filter-checkbox">
            <input type="checkbox" v-model="localShowUserCreated" />
            玩家添加
          </label>

          <label class="filter-checkbox">
            <input type="checkbox" v-model="localGroupView" />
            按作品分组
          </label>
        </div>

        <!-- 角色列表 -->
        <div class="pool-list">
          <!-- 分组视图 -->
          <template v-if="localGroupView">
            <div v-for="(chars, work) in localGroupedCharacters" :key="work" class="work-group">
              <div class="work-header" @click="toggleWorkGroup(work)">
                <span class="work-name">{{ work }}</span>
                <span class="work-count">{{ chars.length }}人</span>
                <span class="work-added" v-if="getWorkAddedCount(work) > 0">
                  已添加{{ getWorkAddedCount(work) }}
                </span>
                <span class="expand-icon">{{ expandedWorks[work] ? '▼' : '▶' }}</span>
              </div>
              <div v-if="expandedWorks[work]" class="work-characters">
                <div
                  v-for="char in chars"
                  :key="char.name"
                  class="pool-char-item"
                  :class="{ assigned: char.isAssigned }"
                  @click="$emit('addCharacter', char)"
                >
                  <span class="char-name">{{ char.name }}</span>
                  <span class="char-gender">{{ char.gender === 'male' ? '♂' : '♀' }}</span>
                  <span class="char-role">{{ getRoleLabel(char) }}</span>
                  <span v-if="char.isAssigned" class="char-assigned">
                    {{ char.assignedTo }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <!-- 列表视图 -->
          <template v-else>
            <div
              v-for="char in filteredCharacters"
              :key="char.name"
              class="pool-char-item"
              :class="{ assigned: char.isAssigned }"
              @click="$emit('addCharacter', char)"
            >
              <span class="char-name">{{ char.name }}</span>
              <span class="char-gender">{{ char.gender === 'male' ? '♂' : '♀' }}</span>
              <span class="char-role">{{ getRoleLabel(char) }}</span>
              <span class="char-origin">{{ getCleanOrigin(char.origin) }}</span>
              <span v-if="char.isAssigned" class="char-assigned">
                {{ char.assignedTo }}
              </span>
            </div>
          </template>

          <div v-if="filteredCharacters.length === 0" class="empty-state">
            没有符合条件的角色
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="composer-footer">
      <button class="btn-save" @click="$emit('save')">
        保存变更
      </button>
      <button class="btn-cancel" @click="$emit('cancel')">
        取消
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  classes: Object,
  targetClass: String,
  preset: String,
  classData: Object,
  availableCharacters: Array,
  searchQuery: String,
  roleFilter: String,
  workFilter: String,
  showUnassigned: Boolean,
  showInRoster: Boolean,
  showUserCreated: Boolean,
  groupView: Boolean,
  availableWorks: Array,
  groupedCharacters: Object
})

const emit = defineEmits([
  'addClass',
  'setClassroom',
  'removeHeadTeacher',
  'removeTeacher',
  'removeStudent',
  'addCharacter',
  'save',
  'cancel',
  'update:targetClass',
  'update:preset',
  'update:searchQuery',
  'update:roleFilter',
  'update:workFilter',
  'update:showUnassigned',
  'update:showInRoster',
  'update:showUserCreated',
  'update:groupView'
])

const expandedWorks = ref({})
const composerPanel = ref('class')
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)

const isMobile = computed(() => windowWidth.value <= 768)

const onResize = () => { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

const localTargetClass = computed({
  get: () => props.targetClass,
  set: (val) => emit('update:targetClass', val)
})

const localPreset = computed({
  get: () => props.preset,
  set: (val) => emit('update:preset', val)
})

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

const localShowUnassigned = computed({
  get: () => props.showUnassigned,
  set: (val) => emit('update:showUnassigned', val)
})

const localShowInRoster = computed({
  get: () => props.showInRoster,
  set: (val) => emit('update:showInRoster', val)
})

const localShowUserCreated = computed({
  get: () => props.showUserCreated,
  set: (val) => emit('update:showUserCreated', val)
})

const localGroupView = computed({
  get: () => props.groupView,
  set: (val) => emit('update:groupView', val)
})

const teachers = computed(() => {
  return Array.isArray(props.classData.teachers) ? props.classData.teachers : []
})

const students = computed(() => {
  return Array.isArray(props.classData.students) ? props.classData.students : []
})

const totalMembers = computed(() => {
  let count = teachers.value.length + students.value.length
  if (props.classData.headTeacher?.name) count++
  return count
})

const filteredCharacters = computed(() => {
  let result = props.availableCharacters

  // 身份筛选
  if (props.roleFilter !== 'all') {
    if (props.roleFilter === 'pending') {
      result = result.filter(c => c.role === 'student' && c.grade === 0)
    } else {
      result = result.filter(c => c.role === props.roleFilter)
    }
  }

  // 作品筛选
  if (props.workFilter) {
    result = result.filter(c => getCleanOrigin(c.origin) === props.workFilter)
  }

  // 仅未分配
  if (props.showUnassigned) {
    result = result.filter(c => !c.isAssigned)
  }

  // 名册内已勾选
  if (props.showInRoster) {
    result = result.filter(c => c.inRoster)
  }

  // 玩家添加
  if (props.showUserCreated) {
    result = result.filter(c => c.userCreated)
  }

  // 搜索
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.origin && c.origin.toLowerCase().includes(query))
    )
  }

  return result
})

// 本地计算分组（基于已筛选的角色）
const localGroupedCharacters = computed(() => {
  const groups = {}
  filteredCharacters.value.forEach(c => {
    const work = getCleanOrigin(c.origin)
    if (!groups[work]) groups[work] = []
    groups[work].push(c)
  })
  const sorted = {}
  Object.keys(groups)
    .sort((a, b) => groups[b].length - groups[a].length)
    .forEach(k => sorted[k] = groups[k])
  return sorted
})

const getCleanOrigin = (origin) => {
  if (!origin) return '未知'
  const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
  return match ? match[1] : origin
}

const getRoleLabel = (char) => {
  if (char.role === 'student') return '学生'
  if (char.role === 'teacher') return char.isHeadTeacher ? '班主任' : '教师'
  if (char.role === 'staff') return '职工'
  return '未知'
}

const toggleWorkGroup = (work) => {
  expandedWorks.value[work] = !expandedWorks.value[work]
}

const getWorkAddedCount = (workName) => {
  const allMembers = [
    ...students.value,
    ...teachers.value
  ]
  if (props.classData.headTeacher?.name) {
    allMembers.push(props.classData.headTeacher)
  }
  return allMembers.filter(m => getCleanOrigin(m.origin) === workName).length
}
</script>

<style scoped>
.class-composer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
}

.composer-toolbar {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
  flex-wrap: wrap;
  align-items: center;
}

.class-selector,
.preset-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.class-selector label,
.preset-selector label {
  color: #999;
  font-size: 13px;
  white-space: nowrap;
}

.class-selector select,
.preset-selector select {
  padding: 7px 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
}

.btn-add-class {
  padding: 7px 14px;
  background: #4CAF50;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  margin-left: auto;
}

.btn-add-class:hover {
  background: #45a049;
}

.btn-set-classroom {
  padding: 7px 14px;
  background: #2196F3;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-set-classroom:hover {
  background: #1976D2;
}

.composer-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.composer-panel-tabs {
  display: none;
}

.current-class-panel,
.character-pool-panel {
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #252525;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.panel-header h4 {
  margin: 0;
  color: #fff;
  font-size: 14px;
}

.classroom-tag {
  padding: 3px 8px;
  background: rgba(33, 150, 243, 0.15);
  border-radius: 12px;
  color: #64B5F6;
  font-size: 12px;
}

.member-count,
.pool-count {
  padding: 3px 8px;
  background: #1a1a1a;
  border-radius: 12px;
  color: #4CAF50;
  font-size: 12px;
}

.class-members {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.member-section {
  margin-bottom: 16px;
}

.member-section h5 {
  margin: 0 0 8px 0;
  color: #999;
  font-size: 13px;
  font-weight: 500;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #252525;
  border-radius: 4px;
  border: 1px solid #333;
}

.member-name {
  font-weight: 500;
  color: #fff;
  font-size: 13px;
}

.member-gender {
  color: #4CAF50;
  font-size: 14px;
}

.member-subject,
.member-origin {
  color: #888;
  font-size: 12px;
}

.btn-remove {
  margin-left: auto;
  background: #d32f2f;
  border: none;
  color: white;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove:hover {
  background: #b71c1c;
}

.empty-slot {
  padding: 8px;
  color: #666;
  font-style: italic;
  text-align: center;
  font-size: 13px;
}

.pool-filters {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: #252525;
  border-bottom: 1px solid #333;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.filter-input,
.filter-select {
  padding: 6px 10px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.filter-input {
  flex: 1;
  min-width: 100px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.pool-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.work-group {
  margin-bottom: 10px;
}

.work-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #252525;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.work-header:hover {
  background: #2a2a2a;
}

.work-name {
  font-weight: 500;
  color: #fff;
  font-size: 13px;
  flex: 1;
}

.work-count {
  color: #888;
  font-size: 12px;
}

.work-added {
  padding: 2px 6px;
  background: #4CAF50;
  border-radius: 10px;
  color: white;
  font-size: 10px;
}

.expand-icon {
  color: #999;
  font-size: 11px;
}

.work-characters {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  padding-left: 12px;
}

.pool-char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: #252525;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.pool-char-item:hover {
  background: #2a2a2a;
  border-color: #4CAF50;
}

.pool-char-item.assigned {
  opacity: 0.5;
}

.char-name {
  font-weight: 500;
  color: #fff;
}

.char-gender {
  color: #4CAF50;
  font-size: 14px;
}

.char-role,
.char-origin {
  color: #888;
  font-size: 11px;
}

.char-assigned {
  margin-left: auto;
  padding: 2px 6px;
  background: #FF9800;
  border-radius: 10px;
  color: white;
  font-size: 10px;
}

.empty-state {
  text-align: center;
  padding: 30px;
  color: #666;
  font-size: 13px;
}

.composer-footer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: #2a2a2a;
  border-top: 1px solid #444;
  justify-content: flex-end;
  flex-shrink: 0;
}

.btn-save,
.btn-cancel {
  padding: 8px 18px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-save {
  background: #4CAF50;
  color: white;
}

.btn-save:hover {
  background: #45a049;
}

.btn-cancel {
  background: #666;
  color: white;
}

.btn-cancel:hover {
  background: #555;
}

/* 滚动条 */
.class-members::-webkit-scrollbar,
.pool-list::-webkit-scrollbar {
  width: 6px;
}

.class-members::-webkit-scrollbar-track,
.pool-list::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.class-members::-webkit-scrollbar-thumb,
.pool-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

/* 宽屏：左右分栏 */
@media (min-width: 769px) {
  .composer-content {
    flex-direction: row;
  }

  .current-class-panel {
    flex: 0 0 45%;
    border-right: 1px solid #333;
  }

  .character-pool-panel {
    flex: 1;
  }

  .composer-panel-tabs {
    display: none;
  }

  .current-class-panel,
  .character-pool-panel {
    display: flex !important;
  }
}

/* 窄屏：上下切换 */
@media (max-width: 768px) {
  .composer-panel-tabs {
    display: flex;
    background: #252525;
    border-bottom: 1px solid #333;
    padding: 0 12px;
    flex-shrink: 0;
  }

  .composer-panel-tabs button {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .composer-panel-tabs button.active {
    color: #4CAF50;
    border-bottom-color: #4CAF50;
  }

  .composer-toolbar {
    padding: 8px 10px;
    gap: 6px;
  }

  .class-selector label,
  .preset-selector label {
    font-size: 12px;
  }

  .class-selector select,
  .preset-selector select {
    padding: 6px 8px;
    font-size: 12px;
  }

  .pool-filters {
    padding: 8px 10px;
    gap: 6px;
  }
}
</style>
