<script setup>
import { ref, computed, toRaw } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { mapData, setMapData } from '../data/mapData'
import { getScheduleConfig, setScheduleConfig, saveScheduleToWorldbook } from '../utils/npcScheduleSystem'
import { getCoursePoolState, restoreCoursePoolState, saveCoursePoolToWorldbook } from '../data/coursePoolData'
import { getFullCharacterPool, saveFullCharacterPool, saveRosterBackup } from '../utils/indexedDB'
import { updateClassDataInWorldbook, saveMapDataToWorldbook } from '../utils/worldbookParser'
import { getErrorMessage } from '../utils/errorUtils'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// ==================== 状态 ====================
const mode = ref('export') // 'export' | 'import'
const loading = ref(false)
const importFile = ref(null)
const importData = ref(null)
const importError = ref('')

// Debug 模式专用状态
const debugExportJson = ref('') // 导出的 JSON 文本
const showDebugExportPanel = ref(false) // 显示导出结果面板
const debugImportText = ref('') // 用户粘贴的导入文本

// 计算属性：是否为 Debug 模式
const isDebugMode = computed(() => gameStore.settings.debugMode)

// 导出选择
const exportSelection = ref({
  map: true,
  schedule: true,
  roster: true,
  characterPool: true,
  course: true,
  events: true,
  clubs: true,           // 新增
  relationships: true    // 新增
})

// 导入选择（根据文件内容动态生成）
const importSelection = ref({
  map: false,
  schedule: false,
  roster: false,
  characterPool: false,
  course: false,
  events: false,
  clubs: false,           // 新增
  relationships: false    // 新增
})

const syncToWorldbook = ref(false)

// 模块标签
const moduleLabels = {
  map: { name: '地图数据', icon: '🗺️', desc: '地图编辑器的自定义地点' },
  schedule: { name: 'NPC日程', icon: '📅', desc: 'NPC日程模板和配置' },
  roster: { name: '班级名册', icon: '📋', desc: '班级、教师和学生分配' },
  characterPool: { name: '角色池', icon: '👥', desc: '所有角色（含未分配）' },
  course: { name: '课程表', icon: '📚', desc: '课程池和选修课配置' },
  events: { name: '事件数据', icon: '🎭', desc: '自定义事件和触发器' },
  clubs: { name: '社团数据', icon: '🏫', desc: '所有社团和成员配置' },        // 新增
  relationships: { name: '关系数据', icon: '💞', desc: 'NPC关系和印象标签' }  // 新增
}

// 深拷贝辅助
const deepClone = (data) => {
  return JSON.parse(JSON.stringify(toRaw(data)))
}

// ==================== 导出功能 ====================
const handleExport = async () => {
  loading.value = true
  try {
    const exportData = {
      version: '1.0',
      timestamp: Date.now(),
      exportDate: new Date().toLocaleString('zh-CN'),
      modules: {}
    }

    // 收集选中的模块数据
    if (exportSelection.value.map) {
      // 如果内存中的 mapData 为空，尝试从世界书加载
      let mapToExport = mapData
      if (mapData.length === 0) {
        const { fetchMapDataFromWorldbook } = await import('../utils/worldbookParser')
        const worldbookMap = await fetchMapDataFromWorldbook()
        if (worldbookMap && worldbookMap.length > 0) {
          mapToExport = worldbookMap
        }
      }
      if (mapToExport.length > 0) {
        exportData.modules.map = deepClone(mapToExport)
      }
    }

    if (exportSelection.value.schedule) {
      let scheduleToExport = getScheduleConfig()
      // 如果内存中的 schedule 为空或没有模板，尝试从世界书加载
      if (!scheduleToExport || !scheduleToExport.templates || Object.keys(scheduleToExport.templates).length === 0) {
        const { loadScheduleDataFromWorldbook } = await import('../utils/npcScheduleSystem')
        await loadScheduleDataFromWorldbook()
        scheduleToExport = getScheduleConfig()
      }
      if (scheduleToExport && Object.keys(scheduleToExport).length > 0) {
        exportData.modules.schedule = deepClone(scheduleToExport)
      }
    }

    if (exportSelection.value.roster) {
      let roster = deepClone(gameStore.allClassData)
      // 如果内存中的 roster 为空，尝试从世界书加载
      if (!roster || Object.keys(roster).length === 0) {
        const { fetchClassDataFromWorldbook } = await import('../utils/worldbookParser')
        const worldbookRoster = await fetchClassDataFromWorldbook()
        if (worldbookRoster && Object.keys(worldbookRoster).length > 0) {
          roster = worldbookRoster
        }
      }
      if (roster && Object.keys(roster).length > 0) {
        exportData.modules.roster = roster
      }
    }

    if (exportSelection.value.characterPool) {
      const pool = await getFullCharacterPool()
      if (pool && pool.length > 0) {
        exportData.modules.characterPool = pool
      }
    }

    if (exportSelection.value.course) {
      exportData.modules.course = deepClone(getCoursePoolState())
    }

    if (exportSelection.value.events) {
      // eventLibrary 是 Map，需要转换为数组
      const eventArray = []
      for (const [id, event] of gameStore.eventLibrary) {
        eventArray.push({ id, ...deepClone(event) })
      }
      exportData.modules.events = {
        library: eventArray,
        triggers: deepClone(gameStore.eventTriggers),
        calendar: deepClone(gameStore.player.customCalendarEvents || [])
      }
    }

    if (exportSelection.value.clubs) {
      const clubs = deepClone(gameStore.allClubs || {})
      if (Object.keys(clubs).length > 0) {
        exportData.modules.clubs = clubs
      }
    }

    if (exportSelection.value.relationships) {
      const relationships = deepClone(gameStore.npcRelationships || {})
      if (Object.keys(relationships).length > 0) {
        exportData.modules.relationships = relationships
      }
    }

    const jsonString = JSON.stringify(exportData, null, 2)

    // Debug 模式：显示文本框面板
    if (isDebugMode.value) {
      debugExportJson.value = jsonString
      showDebugExportPanel.value = true
    } else {
      // 正常模式：下载文件
      const date = new Date()
      const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`
      const fileName = `天华校园_自定义数据_${dateStr}.json`

      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      alert('导出成功！')
    }

  } catch (e) {
    console.error('[DataTransfer] Export error:', e)
    alert('导出失败：' + getErrorMessage(e))
  } finally {
    loading.value = false
  }
}

// Debug 模式：复制导出的 JSON 到剪贴板
const copyExportJson = async () => {
  try {
    await navigator.clipboard.writeText(debugExportJson.value)
    alert('已复制到剪贴板！')
  } catch (e) {
    console.error('[DataTransfer] Copy error:', e)
    alert('复制失败，请手动选择复制')
  }
}

// Debug 模式：关闭导出面板
const closeDebugExportPanel = () => {
  showDebugExportPanel.value = false
  debugExportJson.value = ''
}

// Debug 模式：解析粘贴的 JSON 文本
const parseDebugImportText = () => {
  importError.value = ''
  importData.value = null

  if (!debugImportText.value.trim()) {
    importError.value = '请粘贴 JSON 数据'
    return
  }

  try {
    const data = JSON.parse(debugImportText.value)
    
    // 验证格式
    if (!data.version || !data.modules) {
      throw new Error('无效的数据格式')
    }

    importData.value = data

    // 根据数据内容设置可导入的模块
    importSelection.value = {
      map: !!data.modules.map,
      schedule: !!data.modules.schedule,
      roster: !!data.modules.roster,
      characterPool: !!data.modules.characterPool,
      course: !!data.modules.course,
      events: !!data.modules.events,
      clubs: !!data.modules.clubs,
      relationships: !!data.modules.relationships
    }

  } catch (err) {
    importError.value = 'JSON 解析失败：' + getErrorMessage(err)
    importData.value = null
  }
}

// ==================== 导入功能 ====================
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (!file) return

  importFile.value = file
  importData.value = null
  importError.value = ''

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      
      // 验证格式
      if (!data.version || !data.modules) {
        throw new Error('无效的数据格式')
      }

      importData.value = data

      // 根据文件内容设置可导入的模块
      importSelection.value = {
        map: !!data.modules.map,
        schedule: !!data.modules.schedule,
        roster: !!data.modules.roster,
        characterPool: !!data.modules.characterPool,
        course: !!data.modules.course,
        events: !!data.modules.events,
        clubs: !!data.modules.clubs,
        relationships: !!data.modules.relationships
      }

    } catch (err) {
      importError.value = '文件解析失败：' + getErrorMessage(err)
      importData.value = null
    }
  }
  reader.onerror = () => {
    importError.value = '文件读取失败'
  }
  reader.readAsText(file)
}

const availableModules = computed(() => {
  if (!importData.value) return []
  return Object.keys(importData.value.modules).filter(key => importData.value.modules[key])
})

const handleImport = async () => {
  if (!importData.value) return

  loading.value = true
  try {
    const data = importData.value.modules
    const results = []

    // 导入地图
    if (importSelection.value.map && data.map && Array.isArray(data.map) && data.map.length > 0) {
      setMapData(data.map)
      if (syncToWorldbook.value) {
        await saveMapDataToWorldbook(data.map)
      }
      results.push('地图数据')
    }

    // 导入日程
    if (importSelection.value.schedule && data.schedule) {
      setScheduleConfig(data.schedule)
      if (syncToWorldbook.value) {
        await saveScheduleToWorldbook()
      }
      results.push('NPC日程')
    }

    // 导入班级名册
    if (importSelection.value.roster && data.roster && Object.keys(data.roster).length > 0) {
      // 更新 gameStore
      const rosterClone = deepClone(data.roster)
      for (const [classId, classInfo] of Object.entries(rosterClone)) {
        gameStore.allClassData[classId] = classInfo
        // 如果开启同步，更新世界书
        if (syncToWorldbook.value) {
          await updateClassDataInWorldbook(classId, classInfo, true)
        }
      }
      // 同步到 IndexedDB
      await saveRosterBackup(rosterClone)
      results.push('班级名册')
    }

    // 导入角色池
    if (importSelection.value.characterPool && data.characterPool && Array.isArray(data.characterPool) && data.characterPool.length > 0) {
      await saveFullCharacterPool(deepClone(data.characterPool))
      results.push('角色池')
    }

    // 导入课程
    if (importSelection.value.course && data.course) {
      restoreCoursePoolState(data.course)
      gameStore.customCoursePool = JSON.parse(JSON.stringify(data.course))
      if (syncToWorldbook.value) {
        await saveCoursePoolToWorldbook()
      }
      results.push('课程表')
    }

    // 导入事件
    if (importSelection.value.events && data.events) {
      // 清空并重建 eventLibrary
      gameStore.eventLibrary.clear()
      if (data.events.library) {
        for (const event of data.events.library) {
          const id = event.id
          const eventData = { ...event }
          delete eventData.id // 移除多余的 id 字段
          gameStore.eventLibrary.set(id, eventData)
        }
      }

      // 恢复触发器
      if (data.events.triggers) {
        gameStore.eventTriggers = [...data.events.triggers]
      }

      // 恢复日历事件
      if (data.events.calendar) {
        gameStore.player.customCalendarEvents = [...data.events.calendar]
      }

      results.push('事件数据')
    }

    // 导入社团数据
    if (importSelection.value.clubs && data.clubs && Object.keys(data.clubs).length > 0) {
      gameStore.allClubs = deepClone(data.clubs)
      console.log('[DataTransfer] Imported clubs:', Object.keys(data.clubs).length)
      results.push('社团数据')
    }

    // 导入关系数据
    if (importSelection.value.relationships && data.relationships && Object.keys(data.relationships).length > 0) {
      gameStore.npcRelationships = deepClone(data.relationships)

      // 保存到 IndexedDB
      if (gameStore.currentRunId && gameStore.currentRunId !== 'temp_editing') {
        const { saveNpcRelationships } = await import('../utils/indexedDB')
        await saveNpcRelationships(gameStore.currentRunId, deepClone(data.relationships))
      }

      // 同步到世界书
      if (syncToWorldbook.value) {
        const { syncRelationshipsToWorldbook } = await import('../utils/relationshipManager')
        await syncRelationshipsToWorldbook()
      }

      console.log('[DataTransfer] Imported relationships:', Object.keys(data.relationships).length)
      results.push('关系数据')
    }

    if (results.length > 0) {
      alert(`成功导入：${results.join('、')}`)
      emit('close')
    } else {
      alert('未选择任何模块导入')
    }

  } catch (e) {
    console.error('[DataTransfer] Import error:', e)
    alert('导入失败：' + getErrorMessage(e))
  } finally {
    loading.value = false
  }
}

// ==================== 辅助 ====================
const selectedExportCount = computed(() => {
  return Object.values(exportSelection.value).filter(Boolean).length
})

const selectedImportCount = computed(() => {
  return Object.values(importSelection.value).filter(Boolean).length
})

const toggleAllExport = (val) => {
  for (const key in exportSelection.value) {
    exportSelection.value[key] = val
  }
}

const toggleAllImport = (val) => {
  if (!importData.value) return
  for (const key in importSelection.value) {
    if (importData.value.modules[key]) {
      importSelection.value[key] = val
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="transfer-overlay" @click.self="$emit('close')">
      <div class="transfer-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-content">
            <span class="header-icon">📦</span>
            <h3>导出/导入自定义设置</h3>
          </div>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- 模式切换 -->
        <div class="mode-tabs">
          <button 
            class="mode-tab" 
            :class="{ active: mode === 'export' }"
            @click="mode = 'export'"
          >
            📤 导出数据
          </button>
          <button 
            class="mode-tab" 
            :class="{ active: mode === 'import' }"
            @click="mode = 'import'"
          >
            📥 导入数据
          </button>
        </div>

        <!-- 内容区 -->
        <div class="panel-body">
          <!-- 导出模式 -->
          <div v-if="mode === 'export'" class="mode-content">
            <!-- Debug 模式导出结果面板 -->
            <div v-if="showDebugExportPanel" class="debug-export-panel">
              <div class="debug-panel-header">
                <span class="debug-icon">🔧</span>
                <span>Debug 模式 - 导出数据</span>
                <button class="debug-close-btn" @click="closeDebugExportPanel">×</button>
              </div>
              <div class="debug-panel-content">
                <p class="debug-hint">复制下方 JSON 数据，可在其他设备粘贴导入：</p>
                <textarea 
                  class="debug-textarea" 
                  :value="debugExportJson" 
                  readonly
                  @focus="$event.target.select()"
                ></textarea>
                <div class="debug-actions">
                  <button class="action-btn secondary" @click="copyExportJson">📋 复制到剪贴板</button>
                  <button class="action-btn" @click="closeDebugExportPanel">关闭</button>
                </div>
              </div>
            </div>

            <!-- 正常导出选择界面 -->
            <template v-else>
              <div class="mode-intro">
                <p>选择要导出的数据模块，生成 JSON 文件供分享或备份。</p>
                <p v-if="isDebugMode" class="debug-note">🔧 Debug 模式：导出后将显示文本框而非下载文件</p>
              </div>

              <div class="select-actions">
                <button class="select-btn" @click="toggleAllExport(true)">全选</button>
                <button class="select-btn" @click="toggleAllExport(false)">全不选</button>
                <span class="select-count">已选 {{ selectedExportCount }} 项</span>
              </div>

              <div class="module-list">
                <label 
                  v-for="(info, key) in moduleLabels" 
                  :key="key" 
                  class="module-item"
                  :class="{ selected: exportSelection[key] }"
                >
                  <input type="checkbox" v-model="exportSelection[key]" />
                  <span class="module-icon">{{ info.icon }}</span>
                  <div class="module-info">
                    <span class="module-name">{{ info.name }}</span>
                    <span class="module-desc">{{ info.desc }}</span>
                  </div>
                  <span class="check-mark">✓</span>
                </label>
              </div>

              <div class="action-area">
                <button 
                  class="action-btn primary" 
                  @click="handleExport" 
                  :disabled="loading || selectedExportCount === 0"
                >
                  <span v-if="loading" class="spinner"></span>
                  <span>{{ loading ? '导出中...' : (isDebugMode ? '🔧 生成 JSON' : '📥 生成并下载') }}</span>
                </button>
              </div>
            </template>
          </div>

          <!-- 导入模式 -->
          <div v-if="mode === 'import'" class="mode-content">
            <div class="mode-intro">
              <p v-if="!isDebugMode">上传之前导出的 JSON 文件，选择要导入的模块。</p>
              <p v-else>🔧 Debug 模式：粘贴导出的 JSON 数据，点击解析后导入。</p>
            </div>

            <!-- Debug 模式：文本输入区域 -->
            <div v-if="isDebugMode" class="debug-import-section">
              <textarea 
                v-model="debugImportText"
                class="debug-import-textarea"
                placeholder="在此粘贴 JSON 数据..."
                :disabled="!!importData"
              ></textarea>
              <div class="debug-import-actions">
                <button 
                  v-if="!importData"
                  class="action-btn secondary" 
                  @click="parseDebugImportText"
                  :disabled="!debugImportText.trim()"
                >
                  🔍 解析数据
                </button>
                <button 
                  v-else
                  class="action-btn secondary" 
                  @click="importData = null; debugImportText = ''; importError = ''"
                >
                  🔄 重新输入
                </button>
              </div>
            </div>

            <!-- 正常模式：文件选择 -->
            <div v-else class="file-upload-area">
              <input 
                type="file" 
                accept=".json,application/json"
                @change="handleFileSelect"
                id="import-file-input"
                class="file-input"
              />
              <label for="import-file-input" class="file-label">
                <span class="upload-icon">📂</span>
                <span v-if="!importFile">点击选择文件或拖放到此处</span>
                <span v-else class="file-name">{{ importFile.name }}</span>
              </label>
            </div>

            <!-- 错误提示 -->
            <div v-if="importError" class="error-message">
              ⚠️ {{ importError }}
            </div>

            <!-- 文件信息 -->
            <div v-if="importData" class="file-info">
              <div class="info-row">
                <span class="info-label">版本：</span>
                <span class="info-value">{{ importData.version }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">导出时间：</span>
                <span class="info-value">{{ importData.exportDate || new Date(importData.timestamp).toLocaleString('zh-CN') }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">包含模块：</span>
                <span class="info-value">{{ availableModules.length }} 个</span>
              </div>
            </div>

            <!-- 模块选择 -->
            <div v-if="importData" class="import-section">
              <div class="select-actions">
                <button class="select-btn" @click="toggleAllImport(true)">全选</button>
                <button class="select-btn" @click="toggleAllImport(false)">全不选</button>
                <span class="select-count">已选 {{ selectedImportCount }} 项</span>
              </div>

              <div class="options-row">
                <label class="checkbox-label" title="尝试将导入的数据同步更新到世界书条目中（可能会覆盖现有条目）">
                  <input type="checkbox" v-model="syncToWorldbook">
                  <span>立刻同步到世界书</span>
                </label>
              </div>

              <div class="module-list">
                <label 
                  v-for="(info, key) in moduleLabels" 
                  :key="key" 
                  class="module-item"
                  :class="{ 
                    selected: importSelection[key], 
                    disabled: !importData.modules[key] 
                  }"
                >
                  <input 
                    type="checkbox" 
                    v-model="importSelection[key]"
                    :disabled="!importData.modules[key]"
                  />
                  <span class="module-icon">{{ info.icon }}</span>
                  <div class="module-info">
                    <span class="module-name">{{ info.name }}</span>
                    <span class="module-desc">
                      {{ importData.modules[key] ? info.desc : '(文件中不包含此数据)' }}
                    </span>
                  </div>
                  <span class="check-mark" v-if="importData.modules[key]">✓</span>
                  <span class="unavailable-mark" v-else>—</span>
                </label>
              </div>
            </div>

            <div class="action-area">
              <button 
                class="action-btn primary" 
                @click="handleImport" 
                :disabled="loading || !importData || selectedImportCount === 0"
              >
                <span v-if="loading" class="spinner"></span>
                <span>{{ loading ? '导入中...' : '📤 确认导入' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 底部提示 -->
        <div class="panel-footer">
          <span class="footer-tip">💡 提示：导入会覆盖现有数据，建议先导出备份</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.transfer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  padding: 16px;
  box-sizing: border-box;
}

.transfer-panel {
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  background: linear-gradient(135deg, #fdfbf3 0%, #fff9e6 100%);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
}

.header-icon {
  font-size: 1.5rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-family: 'Ma Shan Zheng', cursive;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

/* 模式切换 */
.mode-tabs {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  background: #fafafa;
  flex-shrink: 0;
}

.mode-tab {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  font-family: 'Ma Shan Zheng', cursive;
  color: #666;
  transition: all 0.2s ease;
  border-bottom: 3px solid transparent;
}

.mode-tab:hover {
  background: #f0f0f0;
}

.mode-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
  background: white;
}

/* 内容区 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  -webkit-overflow-scrolling: touch;
}

.mode-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mode-intro {
  background: #e3f2fd;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #1565c0;
}

.mode-intro p {
  margin: 0;
}

/* 选择操作 */
.select-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-btn {
  padding: 6px 12px;
  background: #e0e0e0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.select-btn:hover {
  background: #d0d0d0;
}

.select-count {
  margin-left: auto;
  color: #666;
  font-size: 0.85rem;
}

/* 模块列表 */
.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.module-item:hover:not(.disabled) {
  border-color: #667eea;
  background: #f8f9ff;
}

.module-item.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, #f0f4ff 0%, #e8ecff 100%);
}

.module-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.module-item input[type="checkbox"] {
  display: none;
}

.module-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.module-info {
  flex: 1;
  min-width: 0;
}

.module-name {
  display: block;
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

.module-desc {
  display: block;
  font-size: 0.8rem;
  color: #888;
  margin-top: 2px;
}

.check-mark {
  font-size: 1.2rem;
  color: #667eea;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.module-item.selected .check-mark {
  opacity: 1;
}

.unavailable-mark {
  font-size: 1.2rem;
  color: #ccc;
}

/* 文件上传 */
.file-upload-area {
  position: relative;
}

.file-input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.file-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: white;
  border: 2px dashed #ccc;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.file-label:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.upload-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.file-name {
  color: #667eea;
  font-weight: 600;
}

/* 错误信息 */
.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
}

/* 文件信息 */
.file-info {
  background: #f5f5f5;
  padding: 12px 16px;
  border-radius: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 0.9rem;
}

.info-label {
  color: #666;
}

.info-value {
  color: #333;
  font-weight: 500;
}

/* 导入区域 */
.import-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.options-row {
  padding: 8px 12px;
  background: #fff3e0;
  border: 1px solid #ffe0b2;
  border-radius: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #e65100;
  font-size: 0.95rem;
  font-weight: 500;
}

.checkbox-label input {
  width: 18px;
  height: 18px;
  accent-color: #f57c00;
}

/* 操作区 */
.action-area {
  padding-top: 8px;
}

.action-btn {
  width: 100%;
  padding: 14px 24px;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1.1rem;
  font-family: 'Ma Shan Zheng', cursive;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.35);
}

.action-btn.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.45);
}

.action-btn:disabled {
  background: #bdbdbd;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部 */
.panel-footer {
  padding: 12px 20px;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.footer-tip {
  font-size: 0.85rem;
  color: #888;
}

/* 滚动条 */
.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.panel-body::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}

/* Debug 模式提示 */
.debug-note {
  margin-top: 8px;
  padding: 6px 10px;
  background: #fff3e0;
  border-radius: 4px;
  color: #e65100;
  font-size: 0.85rem;
}

/* Debug 导出面板 */
.debug-export-panel {
  background: #f5f5f5;
  border: 2px solid #ff9800;
  border-radius: 12px;
  overflow: hidden;
}

.debug-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
  font-weight: 600;
}

.debug-icon {
  font-size: 1.2rem;
}

.debug-close-btn {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.debug-close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.debug-panel-content {
  padding: 16px;
}

.debug-hint {
  margin: 0 0 12px;
  color: #666;
  font-size: 0.9rem;
}

.debug-textarea {
  width: 100%;
  height: 200px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  line-height: 1.4;
  resize: vertical;
  background: white;
  box-sizing: border-box;
}

.debug-textarea:focus {
  outline: none;
  border-color: #ff9800;
}

.debug-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.debug-actions .action-btn {
  flex: 1;
  padding: 10px 16px;
  font-size: 0.95rem;
}

.action-btn.secondary {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(255, 152, 0, 0.35);
}

.action-btn.secondary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 152, 0, 0.45);
}

/* Debug 导入区域 */
.debug-import-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.debug-import-textarea {
  width: 100%;
  height: 150px;
  padding: 12px;
  border: 2px dashed #ff9800;
  border-radius: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  line-height: 1.4;
  resize: vertical;
  background: #fffbf5;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.debug-import-textarea:focus {
  outline: none;
  border-style: solid;
  border-color: #ff9800;
  background: white;
}

.debug-import-textarea:disabled {
  background: #f5f5f5;
  border-color: #ccc;
  color: #666;
}

.debug-import-actions {
  display: flex;
  justify-content: center;
}

.debug-import-actions .action-btn {
  width: auto;
  padding: 10px 24px;
}

/* 移动端适配 */
@media (max-width: 480px) {
  .transfer-panel {
    max-height: 100vh;
    border-radius: 0;
  }

  .panel-header {
    padding: 14px 16px;
  }

  .panel-header h3 {
    font-size: 1.1rem;
  }

  .panel-body {
    padding: 16px;
  }

  .module-item {
    padding: 10px 12px;
  }

  .module-icon {
    font-size: 1.3rem;
  }

  .file-label {
    padding: 24px 16px;
  }

  .debug-textarea,
  .debug-import-textarea {
    height: 120px;
    font-size: 0.8rem;
  }

  .debug-actions {
    flex-direction: column;
  }
}
</style>
