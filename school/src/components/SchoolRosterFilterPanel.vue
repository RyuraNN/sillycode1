<!-- -*- coding: utf-8 -*- -->
<script setup>
import { ref, onMounted, computed, watch, toRaw } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { updateClassDataInWorldbook } from '../utils/worldbookParser'
import { saveRosterBackup, getRosterBackup } from '../utils/indexedDB'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// 状态
const loading = ref(true)
const saving = ref(false)
const isLocked = ref(false) // 默认解锁
const fullRosterSnapshot = ref({}) // Master Backup (All students ever seen)
const currentRosterState = ref({}) // Current Selection State (ClassID -> StudentName -> Boolean)
const originGroups = ref({}) // Origin -> Student List

// 搜索
const searchQuery = ref('')

// 初始化
onMounted(async () => {
  await loadData()
})

const loadData = async () => {
  loading.value = true
  try {
    // 1. 尝试从 IndexedDB 加载备份
    let backupData = await getRosterBackup()
    
    // 2. 获取当前内存中的数据 (从 Worldbook 加载的)
    const currentData = gameStore.allClassData
    
    if (!backupData || Object.keys(backupData).length === 0) {
      // 如果没有备份，使用当前数据作为备份
      console.log('[RosterFilter] Creating new backup from current data')
      backupData = JSON.parse(JSON.stringify(currentData))
      await saveRosterBackup(backupData)
    } else {
      // 如果有备份，检查是否有当前数据中的新学生（Custom Added），合并进去
      console.log('[RosterFilter] Merging current data into backup')
      let hasChanges = false
      for (const [classId, classInfo] of Object.entries(currentData)) {
        if (!backupData[classId]) {
          backupData[classId] = JSON.parse(JSON.stringify(classInfo))
          hasChanges = true
        } else {
          // 合并学生
          const backupStudents = backupData[classId].students || []
          const currentStudents = classInfo.students || []
          
          currentStudents.forEach(curr => {
            if (!backupStudents.find(b => b.name === curr.name)) {
              // 确保推入的是普通对象，避免 Proxy
              backupStudents.push(JSON.parse(JSON.stringify(toRaw(curr))))
              hasChanges = true
            }
          })
          backupData[classId].students = backupStudents
        }
      }
      // 更新备份
      if (hasChanges) {
        await saveRosterBackup(backupData)
      }
    }
    
    fullRosterSnapshot.value = backupData
    
    // 3. 初始化当前选中状态
    // 如果学生存在于 gameStore.allClassData 中，则为 true
    const state = {}
    const groups = {}
    
    // 遍历备份数据（因为它是全集）
    for (const [classId, classInfo] of Object.entries(backupData)) {
      if (!classInfo.students) continue
      
      const currentClassInfo = currentData[classId]
      const currentStudentNames = new Set((currentClassInfo?.students || []).map(s => s.name))
      
      state[classId] = {}
      
      classInfo.students.forEach(student => {
        // 设置选中状态
        state[classId][student.name] = currentStudentNames.has(student.name)
        
        // 分组 logic
        // 提取 Origin (e.g., "(孤独摇滚)" -> "孤独摇滚")
        let origin = '未知'
        if (student.origin) {
          // 尝试去除括号
          const match = student.origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
          origin = match ? match[1] : student.origin
        }
        
        if (!groups[origin]) groups[origin] = []
        groups[origin].push({
          ...student,
          classId,
          className: classInfo.name
        })
      })
    }
    
    currentRosterState.value = state
    
    // 对分组进行排序 (按人数降序)
    const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)
    const sortedGroupsObj = {}
    sortedGroups.forEach(key => {
      sortedGroupsObj[key] = groups[key]
    })
    originGroups.value = sortedGroupsObj
    
  } catch (e) {
    console.error('[RosterFilter] Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// 统计逻辑
const getWorkStats = (workName) => {
  const students = originGroups.value[workName] || []
  const total = students.length
  const selected = students.reduce((sum, s) => {
    return sum + (currentRosterState.value[s.classId]?.[s.name] ? 1 : 0)
  }, 0)
  return { total, selected, all: total > 0 && total === selected, none: selected === 0 }
}

// 切换整个作品
const toggleWork = (workName) => {
  const stats = getWorkStats(workName)
  const targetState = !stats.all // 如果全选了，则全不选；否则全选
  
  const students = originGroups.value[workName] || []
  students.forEach(s => {
    if (!currentRosterState.value[s.classId]) currentRosterState.value[s.classId] = {}
    currentRosterState.value[s.classId][s.name] = targetState
  })
}

// 过滤显示
const filteredGroups = computed(() => {
  if (!searchQuery.value) return originGroups.value
  
  const query = searchQuery.value.toLowerCase()
  const result = {}
  
  for (const [workName, students] of Object.entries(originGroups.value)) {
    // 匹配作品名
    if (workName.toLowerCase().includes(query)) {
      result[workName] = students
      continue
    }
    
    // 匹配学生名
    const matchedStudents = students.filter(s => s.name.toLowerCase().includes(query))
    if (matchedStudents.length > 0) {
      result[workName] = matchedStudents
    }
  }
  return result
})

// 总统计
const totalStats = computed(() => {
  let totalStudents = 0
  let selectedStudents = 0
  
  for (const [workName] of Object.entries(originGroups.value)) {
    const stats = getWorkStats(workName)
    totalStudents += stats.total
    selectedStudents += stats.selected
  }
  
  return { total: totalStudents, selected: selectedStudents }
})

// 保存并应用
const handleSave = async () => {
  saving.value = true
  try {
    const changes = [] // 记录修改了的班级ID
    
    // 1. 更新内存中的 gameStore.allClassData
    for (const [classId, studentStateMap] of Object.entries(currentRosterState.value)) {
      const fullClass = fullRosterSnapshot.value[classId]
      if (!fullClass) continue
      
      const activeStudents = fullClass.students.filter(s => studentStateMap[s.name])
      
      // 更新 gameStore
      if (gameStore.allClassData[classId]) {
        // 检查是否有变化
        const currentCount = gameStore.allClassData[classId].students?.length || 0
        const newCount = activeStudents.length
        
        // 简单判断是否有变化 (数量不同，或者内容不同)
        // 为确保准确，总是更新
        // 使用 toRaw 和 JSON 序列化确保移除 Proxy
        gameStore.allClassData[classId].students = JSON.parse(JSON.stringify(toRaw(activeStudents)))
        changes.push(classId)
      }
    }
    
    // 2. 同步到世界书
    console.log('[RosterFilter] Syncing changes to Worldbook for classes:', changes)
    let successCount = 0
    for (const classId of changes) {
      const success = await updateClassDataInWorldbook(classId, gameStore.allClassData[classId])
      if (success) successCount++
    }

    // 3. 处理备份更新 (解锁模式下永久删除)
    if (!isLocked.value) {
      console.log('[RosterFilter] Unlocked mode: Updating backup to remove unchecked students')
      const newBackup = {}
      
      // 基于当前选择构建新的备份
      for (const [classId, studentStateMap] of Object.entries(currentRosterState.value)) {
        const fullClass = fullRosterSnapshot.value[classId]
        if (!fullClass) continue
        
        // 只保留选中的学生
        const keepStudents = fullClass.students.filter(s => studentStateMap[s.name])
        
        if (keepStudents.length > 0) {
          // 使用 toRaw 确保对象是纯净的
          const rawClass = toRaw(fullClass)
          newBackup[classId] = JSON.parse(JSON.stringify(rawClass))
          newBackup[classId].students = JSON.parse(JSON.stringify(toRaw(keepStudents)))
        }
      }
      
      await saveRosterBackup(newBackup)
      fullRosterSnapshot.value = newBackup // 更新当前快照
    }
    
    alert(`已更新 ${successCount} 个班级的世界书条目！` + (!isLocked.value ? '\n(已同步更新备份，未选中的角色已永久删除)' : ''))
    emit('close')
    
  } catch (e) {
    console.error('[RosterFilter] Error saving:', e)
    alert('保存失败，请检查控制台')
  } finally {
    saving.value = false
  }
}

// 还原重置
const handleReset = () => {
  if (confirm('确定要将所有选择还原为初始状态（全选）吗？')) {
    for (const [classId, map] of Object.entries(currentRosterState.value)) {
      for (const name in map) {
        map[name] = true
      }
    }
  }
}

// 重新读取世界书
const refreshData = async () => {
  if (isLocked.value) {
    alert('当前名册为锁定状态，请先解锁后再读取新名册')
    return
  }
  
  if (confirm('确定要重新读取世界书中的名册数据吗？这将刷新当前显示的名册结构。')) {
    loading.value = true
    try {
      console.log('[RosterFilter] Refreshing data from Worldbook...')
      await gameStore.loadClassData()
      await loadData()
      alert('名册数据已更新')
    } catch (e) {
      console.error('[RosterFilter] Error refreshing data:', e)
      alert('更新失败，请检查控制台')
    } finally {
      loading.value = false
    }
  }
}

// 展开状态管理
const expandedWorks = ref({})
const toggleExpand = (work) => {
  expandedWorks.value[work] = !expandedWorks.value[work]
}

// 全部展开/收起 (性能优化：批量更新)
const expandAll = () => {
  const works = Object.keys(filteredGroups.value)
  if (works.length === 0) return

  // 检查是否全部已展开
  let allExpanded = true
  for (const work of works) {
    if (!expandedWorks.value[work]) {
      allExpanded = false
      break
    }
  }
  
  // 创建新对象以触发一次性响应式更新，而不是循环触发
  const newExpandedState = { ...expandedWorks.value }
  const targetState = !allExpanded
  
  for (const work of works) {
    newExpandedState[work] = targetState
  }
  
  expandedWorks.value = newExpandedState
}
</script>

<template>
  <Teleport to="body">
    <div class="filter-panel-overlay" @click.self="$emit('close')">
      <div class="filter-panel">
      <div class="panel-header">
        <div class="header-left">
          <span class="header-icon">🎭</span>
          <h3>全校名册筛选</h3>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="panel-body">
        <!-- 顶部工具栏 -->
        <div class="toolbar">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              type="text" 
              v-model="searchQuery" 
              placeholder="搜索作品或角色..." 
              class="search-input" 
            />
            <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">×</button>
          </div>
          <div class="toolbar-actions">
            <button class="toolbar-btn" @click="expandAll" title="全部展开/收起">
              📂
            </button>
          </div>
        </div>
        
        <!-- 统计信息 -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-icon">📚</span>
            <span class="stat-label">作品数</span>
            <span class="stat-value">{{ Object.keys(originGroups).length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">👥</span>
            <span class="stat-label">已选/总数</span>
            <span class="stat-value highlight">{{ totalStats.selected }} / {{ totalStats.total }}</span>
          </div>
          <div class="stat-progress">
            <div 
              class="progress-fill" 
              :style="{ width: totalStats.total ? (totalStats.selected / totalStats.total * 100) + '%' : '0%' }"
            ></div>
          </div>
        </div>

        <!-- 教师区域 -->
        <div class="section teacher-section">
          <div class="section-header">
            <span class="section-icon">👨‍🏫</span>
            <h4>教师名册</h4>
          </div>
          <div class="placeholder-box">
            <span class="placeholder-icon">🚧</span>
            <span>功能开发中，敬请期待</span>
          </div>
        </div>

        <!-- 学生区域 -->
        <div class="section student-section">
          <div class="section-header">
            <span class="section-icon">👩‍🎓</span>
            <h4>学生列表</h4>
          </div>
          
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <span>加载中...</span>
          </div>
          
          <div v-else class="work-list">
            <div v-for="(students, work) in filteredGroups" :key="work" class="work-group">
              <div 
                class="work-header" 
                :class="{ 
                  'all-selected': getWorkStats(work).all, 
                  'none-selected': getWorkStats(work).none,
                  'expanded': expandedWorks[work]
                }"
                @click="toggleExpand(work)"
              >
                <div class="header-left">
                  <label class="checkbox-wrapper" @click.stop>
                    <input 
                      type="checkbox" 
                      :checked="getWorkStats(work).all" 
                      :indeterminate="!getWorkStats(work).all && !getWorkStats(work).none"
                      @change="toggleWork(work)"
                    />
                    <span class="checkmark"></span>
                  </label>
                  <span class="work-name">{{ work }}</span>
                  <span class="count-badge" :class="{ 'full': getWorkStats(work).all }">
                    {{ getWorkStats(work).selected }} / {{ getWorkStats(work).total }}
                  </span>
                </div>
                <button class="expand-btn">
                  <span class="expand-icon">{{ expandedWorks[work] ? '▲' : '▼' }}</span>
                </button>
              </div>
              
              <!-- 移除 Transition 以提高大量元素渲染时的性能 -->
              <div v-if="expandedWorks[work]" class="student-grid">
                  <div 
                    v-for="student in students" 
                    :key="`${work}-${student.classId}-${student.name}`" 
                    class="student-card" 
                    :class="{ inactive: !currentRosterState[student.classId][student.name] }"
                    @click="currentRosterState[student.classId][student.name] = !currentRosterState[student.classId][student.name]"
                  >
                    <div class="card-checkbox">
                      <input 
                        type="checkbox" 
                        v-model="currentRosterState[student.classId][student.name]"
                        @click.stop
                      />
                    </div>
                    <div class="card-content">
                      <span class="student-name">{{ student.name }}</span>
                      <span class="class-tag">{{ student.classId }}</span>
                    </div>
                  </div>
                </div>
            </div>
            
            <div v-if="Object.keys(filteredGroups).length === 0" class="empty-state">
              <span class="empty-icon">🔎</span>
              <p>未找到匹配的结果</p>
              <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''">清除搜索</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="panel-footer">
        <div class="left-actions">
          <button class="action-btn text-btn" @click="handleReset">
            🔄 重置全选
          </button>
          <button class="action-btn text-btn" @click="refreshData">
            📥 读取新名册
          </button>
          <div class="lock-wrapper">
            <button 
              class="action-btn icon-btn" 
              :class="{ 'locked': isLocked, 'unlocked': !isLocked }"
              @click="isLocked = !isLocked"
              :title="isLocked ? '名册已锁定：禁用的角色可在二周目恢复' : '名册已解锁：保存后将永久删除禁用的角色'"
            >
              {{ isLocked ? '🔒 已锁定 (安全)' : '🔓 已解锁 (危险)' }}
            </button>
          </div>
        </div>
        <div class="right-actions">
          <button class="action-btn secondary" @click="$emit('close')">取消</button>
          <button class="action-btn primary" @click="handleSave" :disabled="saving">
            <span v-if="saving" class="btn-spinner"></span>
            <span>{{ saving ? '同步中...' : '💾 确认并同步' }}</span>
          </button>
        </div>
      </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 基础变量 */
.filter-panel-overlay {
  --primary-color: #d32f2f;
  --primary-light: #ff6659;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --bg-paper: #fdfbf3;
  --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.15);
  --shadow-strong: 0 8px 30px rgba(0, 0, 0, 0.25);
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
}

/* 遮罩层 */
.filter-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  padding: 10px;
  box-sizing: border-box;
}

/* 主面板 */
.filter-panel {
  width: 100%;
  max-width: 900px;
  height: 90vh;
  max-height: 800px;
  background: linear-gradient(135deg, #fdfbf3 0%, #fff9e6 100%);
  border-radius: 16px;
  box-shadow: var(--shadow-strong);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #ffecb3 0%, #ffe082 100%);
  border-bottom: 2px solid #ffd54f;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.panel-header .header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 1.5rem;
}

.panel-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.4rem;
  font-family: 'Ma Shan Zheng', cursive;
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

/* 内容区 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.search-wrapper {
  flex: 1;
  max-width: 400px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  font-size: 1rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 40px 12px 42px;
  border: 2px solid #e0e0e0;
  border-radius: 25px;
  font-size: 1rem;
  transition: all var(--transition-fast);
  background: white;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.1);
}

.clear-search {
  position: absolute;
  right: 12px;
  background: #e0e0e0;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #666;
  transition: all var(--transition-fast);
}

.clear-search:hover {
  background: #bbb;
  color: white;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all var(--transition-fast);
}

.toolbar-btn:hover {
  border-color: var(--primary-color);
  background: #fff5f5;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff 0%, #f5f5f5 100%);
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 1.2rem;
}

.stat-label {
  color: #666;
  font-size: 0.9rem;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 1.1rem;
}

.stat-value.highlight {
  color: var(--primary-color);
}

.stat-progress {
  flex: 1;
  min-width: 100px;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--success-color) 0%, #81c784 100%);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* 区块 */
.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f0f0;
}

.section-icon {
  font-size: 1.2rem;
}

.section h4 {
  margin: 0;
  color: var(--primary-color);
  font-size: 1.1rem;
  font-family: 'Ma Shan Zheng', cursive;
}

.placeholder-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
  border-radius: 12px;
  color: #888;
  font-size: 0.95rem;
}

.placeholder-icon {
  font-size: 1.5rem;
}

/* 作品列表 */
.work-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-group {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  transition: all var(--transition-fast);
}

.work-group:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.work-header {
  padding: 14px 16px;
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
  border-left: 4px solid transparent;
}

.work-header:hover {
  background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
}

.work-header.all-selected {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border-left-color: var(--success-color);
}

.work-header.none-selected {
  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
  border-left-color: #ef5350;
}

.work-header.expanded {
  border-bottom: 1px solid #e0e0e0;
}

.work-header .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

/* 自定义复选框 */
.checkbox-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  width: 0;
  height: 0;
}

.checkmark {
  width: 22px;
  height: 22px;
  border: 2px solid #bbb;
  border-radius: 6px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.checkbox-wrapper input:checked ~ .checkmark {
  background: var(--success-color);
  border-color: var(--success-color);
}

.checkbox-wrapper input:checked ~ .checkmark::after {
  content: '✓';
  color: white;
  font-size: 14px;
  font-weight: bold;
}

.checkbox-wrapper input:indeterminate ~ .checkmark {
  background: var(--warning-color);
  border-color: var(--warning-color);
}

.checkbox-wrapper input:indeterminate ~ .checkmark::after {
  content: '−';
  color: white;
  font-size: 16px;
  font-weight: bold;
}

.work-name {
  font-weight: 600;
  font-size: 1rem;
  color: #333;
}

.count-badge {
  background: rgba(0, 0, 0, 0.08);
  padding: 4px 12px;
  border-radius: 15px;
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.count-badge.full {
  background: linear-gradient(135deg, var(--success-color) 0%, #81c784 100%);
  color: white;
}

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all var(--transition-fast);
}

.expand-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.expand-icon {
  font-size: 0.8rem;
  color: #888;
}

/* 学生网格 */
.student-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  background: #fafafa;
}

.student-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.student-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.15);
  transform: translateY(-1px);
}

.student-card.inactive {
  opacity: 0.5;
  background: #f5f5f5;
}

.card-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--success-color);
}

.card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.student-name {
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.class-tag {
  font-size: 0.75rem;
  color: #888;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
  align-self: flex-start;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 20px;
  color: #888;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.5;
}

.clear-btn {
  margin-top: 16px;
  padding: 10px 20px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 20px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.clear-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: #888;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f0f0f0;
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部 */
.panel-footer {
  padding: 16px 20px;
  border-top: 2px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 12px;
}

.right-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  font-family: 'Ma Shan Zheng', cursive;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn.primary {
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.3);
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.4);
}

.action-btn.primary:disabled {
  background: #bdbdbd;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

.action-btn.secondary {
  background: white;
  color: #666;
  border: 2px solid #ddd;
}

.action-btn.secondary:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

.text-btn {
  background: none;
  color: #1976d2;
  padding: 8px 16px;
  border-radius: 8px;
}

.text-btn:hover {
  background: rgba(25, 118, 210, 0.1);
}

.icon-btn {
  font-size: 0.9rem;
  border: 1px solid #ccc;
  background: #f5f5f5;
  color: #666;
  margin-left: 10px;
}

.icon-btn.locked {
  background: #e8f5e9;
  border-color: #4caf50;
  color: #2e7d32;
}

.icon-btn.unlocked {
  background: #ffebee;
  border-color: #ef5350;
  color: #c62828;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 过渡动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
}

/* 自定义滚动条 */
.panel-body::-webkit-scrollbar {
  width: 8px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.panel-body::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .filter-panel {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .panel-header h3 {
    font-size: 1.2rem;
  }
  
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-wrapper {
    max-width: none;
  }
  
  .toolbar-actions {
    justify-content: flex-end;
  }
  
  .stats-bar {
    padding: 12px 16px;
    gap: 12px;
  }
  
  .stat-progress {
    width: 100%;
    order: 10;
  }
  
  .student-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    padding: 12px;
    gap: 10px;
  }
  
  .student-card {
    padding: 10px;
  }
  
  .panel-footer {
    padding: 12px 16px;
  }
  
  .action-btn {
    padding: 10px 18px;
    font-size: 0.95rem;
  }
  
  .left-actions {
    width: 100%;
    margin-bottom: 8px;
  }
  
  .right-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .action-btn.secondary,
  .action-btn.primary {
    flex: 1;
  }
}

/* 触摸设备优化 */
@media (hover: none) and (pointer: coarse) {
  .work-header,
  .student-card,
  .action-btn,
  .toolbar-btn {
    min-height: 48px;
  }
  
  .student-card {
    padding: 14px 12px;
  }
  
  .search-input {
    font-size: 16px; /* 防止 iOS 缩放 */
  }
}
</style>
