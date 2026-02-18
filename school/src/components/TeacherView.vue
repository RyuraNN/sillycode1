<!-- 教师视图组件 -->
<template>
  <div class="teacher-view">
    <!-- 工具栏 -->
    <div class="teacher-toolbar">
      <div class="view-mode-switch">
        <button
          :class="{ active: localViewMode === 'work' }"
          @click="localViewMode = 'work'"
        >
          按作品分组
        </button>
        <button
          :class="{ active: localViewMode === 'class' }"
          @click="localViewMode = 'class'"
        >
          按班级分组
        </button>
      </div>

      <button class="btn-expand-all" @click="$emit('expandAll')">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </button>

      <button class="btn-add-teacher" @click="$emit('addTeacher')">
        ＋ 添加教师
      </button>
    </div>

    <!-- 教师列表 -->
    <div class="teacher-list">
      <div v-for="(teachers, groupName) in teacherGroups" :key="groupName" class="teacher-group">
        <div class="group-header" @click="$emit('toggleGroup', groupName)">
          <span class="group-name">{{ groupName }}</span>
          <span class="group-count">{{ teachers.length }}人</span>
          <span class="expand-icon">{{ expandedGroups[groupName] ? '▼' : '▶' }}</span>
        </div>

        <div v-if="expandedGroups[groupName]" class="group-teachers">
          <div
            v-for="teacher in teachers"
            :key="teacher.name"
            class="teacher-item"
          >
            <div class="teacher-header">
              <span class="teacher-name">{{ teacher.name }}</span>
              <span class="teacher-gender">{{ teacher.gender === 'male' ? '♂' : '♀' }}</span>
              <span v-if="teacher.isHeadTeacher" class="teacher-badge head-teacher">
                班主任
              </span>
            </div>

            <div class="teacher-info">
              <span class="teacher-origin">{{ getCleanOrigin(teacher.origin) }}</span>

              <!-- 按班级分组时显示角色 -->
              <span v-if="localViewMode === 'class' && teacher.displayRole" class="teacher-role">
                {{ teacher.displayRole }}
              </span>

              <!-- 按作品分组时显示任职信息 -->
              <div v-if="localViewMode === 'work' && teacher.assignments" class="teacher-assignments">
                <div
                  v-for="(assignment, idx) in teacher.assignments"
                  :key="idx"
                  class="assignment-item"
                >
                  <span class="assignment-class">{{ assignment.className }}</span>
                  <span class="assignment-role">{{ assignment.role }}</span>
                </div>
              </div>
            </div>

            <div class="teacher-actions">
              <button class="btn-edit" @click="$emit('editTeacher', teacher)">
                编辑
              </button>
              <button class="btn-delete" @click="$emit('deleteTeacher', teacher)">
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(teacherGroups).length === 0" class="empty-state">
        <p>暂无教师数据</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  teacherGroups: Object,
  expandedGroups: Object,
  viewMode: String,
  allExpanded: Boolean
})

const emit = defineEmits([
  'toggleGroup',
  'expandAll',
  'addTeacher',
  'editTeacher',
  'deleteTeacher',
  'update:viewMode'
])

const localViewMode = computed({
  get: () => props.viewMode,
  set: (val) => emit('update:viewMode', val)
})

const getCleanOrigin = (origin) => {
  if (!origin) return '未知'
  const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
  return match ? match[1] : origin
}
</script>

<style scoped>
.teacher-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
}

.teacher-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
  align-items: center;
  flex-wrap: wrap;
}

.view-mode-switch {
  display: flex;
  gap: 0;
  background: #1a1a1a;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #444;
}

.view-mode-switch button {
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  white-space: nowrap;
}

.view-mode-switch button.active {
  background: #4CAF50;
  color: white;
}

.view-mode-switch button:hover:not(.active) {
  background: #2a2a2a;
  color: #ccc;
}

.btn-expand-all,
.btn-add-teacher {
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

.btn-expand-all:hover {
  background: #555;
}

.btn-add-teacher {
  background: #4CAF50;
  margin-left: auto;
}

.btn-add-teacher:hover {
  background: #45a049;
}

.teacher-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.teacher-group {
  margin-bottom: 12px;
}

.group-header {
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

.group-header:hover {
  background: #333;
  border-color: #444;
}

.group-name {
  font-weight: 500;
  color: #fff;
  font-size: 14px;
  flex: 1;
}

.group-count {
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

.group-teachers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-left: 12px;
}

.teacher-item {
  padding: 12px;
  background: #252525;
  border: 1px solid #333;
  border-radius: 6px;
  transition: all 0.2s;
}

.teacher-item:hover {
  background: #2a2a2a;
  border-color: #444;
}

.teacher-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.teacher-name {
  font-weight: 500;
  color: #fff;
  font-size: 14px;
}

.teacher-gender {
  color: #4CAF50;
  font-size: 15px;
}

.teacher-badge {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 500;
}

.teacher-badge.head-teacher {
  background: #FF9800;
  color: white;
}

.teacher-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}

.teacher-origin {
  color: #888;
  font-size: 12px;
}

.teacher-role {
  color: #aaa;
  font-size: 13px;
}

.teacher-assignments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.assignment-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: #1a1a1a;
  border-radius: 4px;
}

.assignment-class {
  padding: 3px 8px;
  background: #2a2a2a;
  border-radius: 4px;
  color: #4CAF50;
  font-size: 11px;
  font-weight: 500;
}

.assignment-role {
  color: #999;
  font-size: 12px;
}

.teacher-actions {
  display: flex;
  gap: 6px;
}

.btn-edit,
.btn-delete {
  flex: 1;
  padding: 7px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  font-weight: 500;
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
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 14px;
}

/* 滚动条样式 */
.teacher-list::-webkit-scrollbar {
  width: 8px;
}

.teacher-list::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.teacher-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.teacher-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
