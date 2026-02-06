<script setup>
import { ref, computed } from 'vue'
import { 
  UNIVERSAL_ELECTIVES, 
  GRADE_1_COURSES, 
  GRADE_2_COURSES, 
  GRADE_3_COURSES, 
  IDOL_COURSES,
  resetCourseData
} from '../data/coursePoolData'

const emit = defineEmits(['close'])

const activeTab = ref('universal')
const activeSubTab = ref('required') // for grades that have both
const showMobileSidebar = ref(false)

const tabs = [
  { id: 'universal', label: '通用选修', icon: '📚' },
  { id: 'g1', label: '一年级', icon: '1️⃣' },
  { id: 'g2', label: '二年级', icon: '2️⃣' },
  { id: 'g3', label: '三年级', icon: '3️⃣' },
  { id: 'idol1', label: '偶像科一年', icon: '⭐' },
  { id: 'idol2', label: '偶像科二年', icon: '🌟' },
  { id: 'idol3', label: '偶像科三年', icon: '✨' }
]

const currentList = computed(() => {
  switch (activeTab.value) {
    case 'universal':
      return UNIVERSAL_ELECTIVES
    case 'g1':
      return activeSubTab.value === 'required' ? GRADE_1_COURSES.required : GRADE_1_COURSES.electives
    case 'g2':
      return activeSubTab.value === 'required' ? GRADE_2_COURSES.required : GRADE_2_COURSES.electives
    case 'g3':
      return activeSubTab.value === 'required' ? GRADE_3_COURSES.required : GRADE_3_COURSES.electives
    case 'idol1':
      return activeSubTab.value === 'required' ? IDOL_COURSES.grade1.required : IDOL_COURSES.grade1.electives
    case 'idol2':
      return activeSubTab.value === 'required' ? IDOL_COURSES.grade2.required : IDOL_COURSES.grade2.electives
    case 'idol3':
      return activeSubTab.value === 'required' ? IDOL_COURSES.grade3.required : IDOL_COURSES.grade3.electives
    default:
      return []
  }
})

// Current array to modify (for adding/removing)
const currentArray = computed(() => currentList.value)

const editingCourse = ref(null)
const isNew = ref(false)

const startEdit = (course) => {
  editingCourse.value = JSON.parse(JSON.stringify(course))
  isNew.value = false
}

const startAdd = () => {
  editingCourse.value = {
    id: `custom_${Date.now()}`,
    name: '',
    teacher: '',
    teacherGender: 'female',
    origin: '自定义',
    location: 'classroom',
    type: activeTab.value === 'universal' ? 'elective' : activeSubTab.value,
    availableFor: []
  }
  isNew.value = true
}

const saveEdit = () => {
  if (!editingCourse.value.name) {
    alert('请输入课程名称')
    return
  }
  
  if (isNew.value) {
    currentArray.value.push(editingCourse.value)
  } else {
    const index = currentArray.value.findIndex(c => c.id === editingCourse.value.id)
    if (index !== -1) {
      currentArray.value[index] = editingCourse.value
    }
  }
  editingCourse.value = null
}

const deleteCourse = (course) => {
  if (confirm(`确定要删除课程"${course.name}"吗？`)) {
    const index = currentArray.value.findIndex(c => c.id === course.id)
    if (index !== -1) {
      currentArray.value.splice(index, 1)
    }
  }
}

const handleReset = () => {
  if (confirm('确定要重置所有课程数据吗？这将丢失所有未保存的修改。')) {
    resetCourseData()
  }
}

const selectTab = (tabId) => {
  activeTab.value = tabId
  showMobileSidebar.value = false
}

// 辅助：获取可用的locations (简化列表)
const locationOptions = [
  { value: 'classroom', label: '班级教室' },
  { value: 'classroom_1a', label: '1-A教室' },
  { value: 'classroom_1b', label: '1-B教室' },
  { value: 'classroom_1c', label: '1-C教室' },
  { value: 'classroom_1d', label: '1-D教室' },
  { value: 'classroom_1e', label: '1-E教室' },
  { value: 'track_and_field', label: '田径场' },
  { value: 'gymnasium', label: '体育馆' },
  { value: 'sub_gymnasium', label: '第二体育馆' },
  { value: 'music_room_1', label: '第一音乐教室' },
  { value: 'music_room_2', label: '第二音乐教室' },
  { value: 'art_room_1', label: '美术教室' },
  { value: 'computer_room', label: '计算机室' },
  { value: 'sb_physics_lab', label: '物理实验室' },
  { value: 'sb_chemistry_lab', label: '化学实验室' },
  { value: 'sb_biology_lab', label: '生物实验室' },
  { value: 'home_economics_room', label: '家政教室' },
  { value: 'auditorium', label: '大礼堂' },
  { value: 'library', label: '图书馆' }
]

const currentTabLabel = computed(() => {
  const tab = tabs.find(t => t.id === activeTab.value)
  return tab ? `${tab.icon} ${tab.label}` : ''
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <div class="modal-header">
        <div class="header-left">
          <button class="menu-toggle" @click="showMobileSidebar = !showMobileSidebar">
            <span class="menu-icon">☰</span>
          </button>
          <h2>📖 课程表编辑器</h2>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <!-- 移动端当前分类显示 -->
      <div class="mobile-current-tab" @click="showMobileSidebar = true">
        <span>{{ currentTabLabel }}</span>
        <span class="dropdown-arrow">▼</span>
      </div>
      
      <div class="editor-layout">
        <!-- Sidebar: Categories -->
        <div class="sidebar" :class="{ 'mobile-open': showMobileSidebar }">
          <div class="sidebar-header">
            <span>课程分类</span>
            <button class="sidebar-close" @click="showMobileSidebar = false">×</button>
          </div>
          <div class="sidebar-scroll">
            <div 
              v-for="tab in tabs" 
              :key="tab.id"
              class="sidebar-item"
              :class="{ active: activeTab === tab.id }"
              @click="selectTab(tab.id)"
            >
              <span class="tab-icon">{{ tab.icon }}</span>
              <span class="tab-label">{{ tab.label }}</span>
            </div>
          </div>
          
          <div class="sidebar-footer">
            <button class="reset-btn" @click="handleReset">
              🔄 重置默认数据
            </button>
          </div>
        </div>
        
        <!-- 移动端侧边栏遮罩 -->
        <div 
          v-if="showMobileSidebar" 
          class="sidebar-backdrop" 
          @click="showMobileSidebar = false"
        ></div>
        
        <!-- Main Content -->
        <div class="main-content">
          <!-- Sub Tabs (Required/Elective) -->
          <div v-if="activeTab !== 'universal'" class="sub-tabs">
            <button 
              class="sub-tab-btn" 
              :class="{ active: activeSubTab === 'required' }"
              @click="activeSubTab = 'required'"
            >
              📕 必修课
            </button>
            <button 
              class="sub-tab-btn" 
              :class="{ active: activeSubTab === 'elective' }"
              @click="activeSubTab = 'elective'"
            >
              📗 选修课
            </button>
          </div>
          
          <!-- Course List -->
          <div class="course-list">
            <div class="list-header">
              <span class="col-name">课程名称</span>
              <span class="col-teacher">教师</span>
              <span class="col-location hide-mobile">地点</span>
              <span class="col-origin hide-mobile">来源</span>
              <span class="col-actions">操作</span>
            </div>
            
            <div class="list-body">
              <div 
                v-for="course in currentList" 
                :key="course.id" 
                class="list-row"
              >
                <span class="col-name">
                  <span class="course-name">{{ course.name }}</span>
                  <span class="mobile-info">
                    {{ course.teacher }} · {{ locationOptions.find(l => l.value === course.location)?.label || course.location }}
                  </span>
                </span>
                <span class="col-teacher hide-mobile">{{ course.teacher }}</span>
                <span class="col-location hide-mobile">{{ locationOptions.find(l => l.value === course.location)?.label || course.location }}</span>
                <span class="col-origin hide-mobile">
                  <span class="origin-tag">{{ course.origin }}</span>
                </span>
                <div class="col-actions actions">
                  <button class="edit-btn" @click="startEdit(course)" title="编辑">
                    <span class="btn-icon">✏️</span>
                    <span class="btn-text">编辑</span>
                  </button>
                  <button class="del-btn" @click="deleteCourse(course)" title="删除">
                    <span class="btn-icon">🗑️</span>
                    <span class="btn-text">删除</span>
                  </button>
                </div>
              </div>
              
              <div class="list-row add-row" @click="startAdd">
                <span class="add-icon">➕</span>
                <span>添加新课程</span>
              </div>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="currentList.length === 0" class="empty-state">
            <div class="empty-icon">📭</div>
            <p>暂无课程</p>
            <button class="add-first-btn" @click="startAdd">添加第一门课程</button>
          </div>
        </div>
      </div>
      
      <!-- Edit Modal (Nested) -->
      <Transition name="modal-fade">
        <div v-if="editingCourse" class="edit-modal-overlay" @click.self="editingCourse = null">
          <div class="edit-modal">
            <div class="edit-modal-header">
              <h3>{{ isNew ? '➕ 添加课程' : '✏️ 编辑课程' }}</h3>
              <button class="modal-close" @click="editingCourse = null">×</button>
            </div>
            
            <div class="edit-modal-body">
              <div class="form-row">
                <label>
                  <span class="label-icon">📝</span>
                  课程名称
                </label>
                <input v-model="editingCourse.name" placeholder="例如：高等数学" />
              </div>
              
              <div class="form-row">
                <label>
                  <span class="label-icon">👤</span>
                  教师姓名
                </label>
                <input v-model="editingCourse.teacher" placeholder="例如：王老师" />
              </div>
              
              <div class="form-row">
                <label>
                  <span class="label-icon">⚧</span>
                  教师性别
                </label>
                <select v-model="editingCourse.teacherGender">
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
              
              <div class="form-row">
                <label>
                  <span class="label-icon">🎬</span>
                  来源作品
                </label>
                <input v-model="editingCourse.origin" placeholder="例如：原创、某某动漫" />
              </div>
              
              <div class="form-row">
                <label>
                  <span class="label-icon">📍</span>
                  上课地点
                </label>
                <select v-model="editingCourse.location">
                  <option v-for="opt in locationOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                  <option value="custom">自定义...</option>
                </select>
                <input 
                  v-if="editingCourse.location === 'custom' || !locationOptions.some(o => o.value === editingCourse.location)" 
                  v-model="editingCourse.location" 
                  placeholder="输入地点ID"
                  class="custom-input"
                />
              </div>
            </div>
            
            <div class="edit-modal-footer">
              <button class="cancel-btn" @click="editingCourse = null">取消</button>
              <button class="save-btn" @click="saveEdit">
                <span>💾</span> 保存
              </button>
            </div>
          </div>
        </div>
      </Transition>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 基础变量 */
:root {
  --primary-color: #d32f2f;
  --primary-light: #ff6659;
  --primary-dark: #9a0007;
  --bg-paper: #fdfbf3;
  --bg-warm: #fff9e6;
  --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.15);
  --shadow-strong: 0 8px 30px rgba(0, 0, 0, 0.25);
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
}

/* 遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 10px;
  box-sizing: border-box;
}

/* 主内容区 */
.modal-content {
  background: linear-gradient(135deg, #fdfbf3 0%, #fff9e6 100%);
  width: 100%;
  max-width: 950px;
  height: 90vh;
  max-height: 700px;
  border-radius: 16px;
  box-shadow: var(--shadow-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* 头部 */
.modal-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff9c4 0%, #ffecb3 100%);
  border-bottom: 2px solid #ffd54f;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-toggle {
  display: none;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 18px;
}

.modal-header h2 {
  margin: 0;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.5rem;
  color: #333;
}

.close-btn {
  background: rgba(255, 255, 255, 0.8);
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: #ff5252;
  color: white;
  transform: rotate(90deg);
}

/* 移动端当前标签显示 */
.mobile-current-tab {
  display: none;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #eee;
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  justify-content: space-between;
  align-items: center;
}

.dropdown-arrow {
  color: #888;
  font-size: 0.8rem;
}

/* 编辑器布局 */
.editor-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 侧边栏 */
.sidebar {
  width: 200px;
  background: linear-gradient(180deg, #f8f8f8 0%, #f0f0f0 100%);
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: transform var(--transition-normal);
}

.sidebar-header {
  display: none;
  padding: 16px;
  background: linear-gradient(135deg, #fff9c4 0%, #ffecb3 100%);
  border-bottom: 1px solid #ffd54f;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #333;
}

.sidebar-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 0;
}

.sidebar-item {
  padding: 14px 20px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 10px;
  color: #555;
  border-left: 4px solid transparent;
}

.sidebar-item:hover {
  background: rgba(211, 47, 47, 0.08);
  color: var(--primary-color);
}

.sidebar-item.active {
  background: white;
  border-left-color: var(--primary-color);
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.tab-icon {
  font-size: 1.1rem;
}

.tab-label {
  font-size: 0.95rem;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: #f5f5f5;
}

.reset-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #ff5252 0%, #d32f2f 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.reset-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.4);
}

.sidebar-backdrop {
  display: none;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
  background: white;
}

/* 子标签 */
.sub-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f0f0f0;
  flex-shrink: 0;
}

.sub-tab-btn {
  padding: 10px 20px;
  border: 2px solid #e0e0e0;
  background: white;
  font-size: 0.95rem;
  cursor: pointer;
  color: #666;
  border-radius: 25px;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-tab-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.sub-tab-btn.active {
  background: linear-gradient(135deg, #ff5252 0%, #d32f2f 100%);
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.3);
}

/* 课程列表 */
.course-list {
  flex: 1;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.2fr 1fr 120px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
  font-weight: 600;
  border-bottom: 2px solid #e0e0e0;
  color: #444;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.list-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.list-row {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.2fr 1fr 120px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  align-items: center;
  font-size: 0.9rem;
  background: white;
  transition: all var(--transition-fast);
}

.list-row:hover {
  background: #fafafa;
}

.list-row:last-child {
  border-bottom: none;
}

.course-name {
  font-weight: 500;
  color: #333;
}

.mobile-info {
  display: none;
  font-size: 0.8rem;
  color: #888;
  margin-top: 4px;
}

.origin-tag {
  display: inline-block;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  color: #1976d2;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.add-row {
  color: #1976d2;
  cursor: pointer;
  justify-content: center;
  display: flex;
  gap: 8px;
  font-weight: 600;
  padding: 20px;
  background: linear-gradient(135deg, #e3f2fd 0%, #f5f5f5 100%);
  transition: all var(--transition-fast);
}

.add-row:hover {
  background: linear-gradient(135deg, #bbdefb 0%, #e3f2fd 100%);
}

.add-icon {
  font-size: 1.1rem;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-btn, .del-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 4px;
}

.edit-btn:hover {
  background: #e3f2fd;
  border-color: #1976d2;
  color: #1976d2;
}

.del-btn {
  color: #f44336;
  border-color: #ffcdd2;
}

.del-btn:hover {
  background: #ffebee;
  border-color: #f44336;
}

.btn-icon {
  font-size: 0.9rem;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #888;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.add-first-btn {
  margin-top: 20px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  transition: all var(--transition-fast);
}

.add-first-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(25, 118, 210, 0.4);
}

/* 编辑弹窗 */
.edit-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  box-sizing: border-box;
}

.edit-modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 450px;
  max-height: 90%;
  box-shadow: var(--shadow-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-modal-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff9c4 0%, #ffecb3 100%);
  border-bottom: 2px solid #ffd54f;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.edit-modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: rgba(0, 0, 0, 0.1);
}

.edit-modal-body {
  padding: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.form-row {
  margin-bottom: 18px;
}

.form-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: #555;
  margin-bottom: 8px;
  font-weight: 500;
}

.label-icon {
  font-size: 1rem;
}

.form-row input, .form-row select {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  transition: all var(--transition-fast);
  box-sizing: border-box;
}

.form-row input:focus, .form-row select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.1);
}

.custom-input {
  margin-top: 10px;
}

.edit-modal-footer {
  padding: 16px 20px;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.save-btn {
  padding: 12px 28px;
  background: linear-gradient(135deg, #4caf50 0%, #43a047 100%);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.save-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
}

.cancel-btn {
  padding: 12px 24px;
  background: white;
  color: #666;
  border: 2px solid #ddd;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

/* 过渡动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .edit-modal,
.modal-fade-leave-to .edit-modal {
  transform: scale(0.9) translateY(20px);
}

/* 自定义滚动条 */
.list-body::-webkit-scrollbar,
.sidebar-scroll::-webkit-scrollbar,
.edit-modal-body::-webkit-scrollbar {
  width: 6px;
}

.list-body::-webkit-scrollbar-track,
.sidebar-scroll::-webkit-scrollbar-track,
.edit-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.list-body::-webkit-scrollbar-thumb,
.sidebar-scroll::-webkit-scrollbar-thumb,
.edit-modal-body::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.list-body::-webkit-scrollbar-thumb:hover,
.sidebar-scroll::-webkit-scrollbar-thumb:hover,
.edit-modal-body::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .modal-content {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .modal-header h2 {
    font-size: 1.2rem;
  }
  
  .menu-toggle {
    display: flex;
  }
  
  .mobile-current-tab {
    display: flex;
  }
  
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 100;
    transform: translateX(-100%);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.2);
  }
  
  .sidebar.mobile-open {
    transform: translateX(0);
  }
  
  .sidebar-header {
    display: flex;
  }
  
  .sidebar-backdrop {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }
  
  .list-header {
    grid-template-columns: 1fr auto;
    padding: 12px;
  }
  
  .list-header .hide-mobile,
  .list-row .hide-mobile {
    display: none;
  }
  
  .list-row {
    grid-template-columns: 1fr auto;
    padding: 12px;
  }
  
  .col-name {
    display: flex;
    flex-direction: column;
  }
  
  .mobile-info {
    display: block;
  }
  
  .actions {
    flex-direction: column;
    gap: 6px;
  }
  
  .edit-btn, .del-btn {
    padding: 8px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }
  
  .btn-text {
    display: none;
  }
  
  .sub-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  
  .sub-tab-btn {
    flex-shrink: 0;
    padding: 8px 16px;
    font-size: 0.9rem;
  }
  
  .main-content {
    padding: 12px;
  }
  
  .edit-modal {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  
  .form-row input, .form-row select {
    padding: 14px;
    font-size: 16px; /* 防止 iOS 缩放 */
  }
}

/* 平板适配 */
@media (min-width: 769px) and (max-width: 1024px) {
  .sidebar {
    width: 180px;
  }
  
  .list-header {
    grid-template-columns: 2fr 1fr 1fr 100px;
  }
  
  .list-row {
    grid-template-columns: 2fr 1fr 1fr 100px;
  }
  
  .col-origin {
    display: none;
  }
}

/* 触摸设备优化 */
@media (hover: none) and (pointer: coarse) {
  .sidebar-item,
  .sub-tab-btn,
  .edit-btn,
  .del-btn,
  .add-row {
    min-height: 48px;
  }
  
  .list-row {
    padding: 16px;
  }
}
</style>
