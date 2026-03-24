<script setup>
import { ref, watch, onMounted } from 'vue'
import HomeLayout from './components/HomeLayout.vue'
import SplashScreen from './components/SplashScreen.vue'
import { useGameStore } from './stores/gameStore'
import { requestPersistence, clearAllData } from './utils/indexedDB'
import { loadCoursePoolFromWorldbook } from './data/coursePoolData'
import { isWorldbookAvailable, getCurrentBookName } from './utils/worldbookHelper'
import { getErrorMessage } from './utils/errorUtils'

const gameStore = useGameStore()

// 世界书加载等待弹窗状态
const showWorldbookWaitModal = ref(false)
const isInitializing = ref(true)
const initError = ref('')

// 初始化崩溃恢复状态
const showCrashRecovery = ref(false)
const crashError = ref('')
const isClearing = ref(false)
const initTimedOut = ref(false)

// 开屏面板状态
const showSplashScreen = ref(false)

function onEnterGame() {
  showSplashScreen.value = false
}

/**
 * 检测世界书 API 是否已就绪（名称 + 内容都已加载）
 * @param {boolean} lenient - 宽松模式：只检查API和名称，不验证条目内容
 * @returns {Promise<boolean>}
 */
async function checkWorldbookReady(lenient = false) {
  try {
    // 使用 helper 检查 API 可用性
    if (!isWorldbookAvailable()) {
      console.log('[App] Worldbook API not available')
      return false
    }

    // 尝试获取世界书名称（包括角色卡和聊天绑定）
    const bookName = getCurrentBookName()

    if (!bookName) {
      console.log('[App] No worldbook bound (checked char + chat bindings)')
      return false
    }

    // 宽松模式：有名称就算就绪（用户手动确认时使用）
    if (lenient) {
      console.log('[App] Lenient mode: worldbook name found, skipping content check')
      return true
    }

    // 严格模式：验证世界书条目内容已实际加载
    try {
      const entries = await window.getWorldbook(bookName)
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        console.log('[App] Worldbook names available but entries not yet loaded for:', bookName)
        return false
      }
      console.log(`[App] Worldbook "${bookName}" verified: ${entries.length} entries loaded`)
    } catch (wbError) {
      console.log(`[App] getWorldbook("${bookName}") threw error (content not ready?):`, getErrorMessage(wbError))
      return false
    }

    console.log('[App] Worldbook ready:', bookName)
    return true
  } catch (e) {
    console.log('[App] Error checking worldbook:', getErrorMessage(e))
    return false
  }
}

/**
 * 执行初始化（带全局错误捕获和超时保护）
 */
async function doInitialize() {
  try {
    isInitializing.value = true
    initError.value = ''
    initTimedOut.value = false
    
    // 设置初始化总超时保护（90 秒）
    // 如果初始化超过这个时间，说明有操作卡住了
    const initTimeoutTimer = setTimeout(() => {
      if (isInitializing.value) {
        console.error('[App] ⏰ Initialization timed out after 90s!')
        initTimedOut.value = true
        isInitializing.value = false
        crashError.value = '初始化超时（90秒），可能是旧存档数据不兼容导致。'
        showCrashRecovery.value = true
        showWorldbookWaitModal.value = false
      }
    }, 90000)
    
    // 尝试申请持久化存储
    try {
      await requestPersistence()
    } catch (e) {
      console.warn('[App] requestPersistence failed:', e)
    }
    
    // 初始化时从本地存储加载存档
    await gameStore.initFromStorage()

    // 加载自定义课程池 (需要 currentRunId)
    let courseLoaded = false
    try {
      courseLoaded = await loadCoursePoolFromWorldbook(gameStore.meta.currentRunId)
    } catch (e) {
      console.warn('[App] loadCoursePoolFromWorldbook failed:', e)
    }
    gameStore._ui.worldbookLoadResults.courseData = !!courseLoaded

    clearTimeout(initTimeoutTimer)

    if (!initTimedOut.value) {
      console.log('[App] Initialization complete')
      showWorldbookWaitModal.value = false
      showCrashRecovery.value = false
      // 显示开屏面板，等待用户点击进入
      showSplashScreen.value = true
    }
  } catch (e) {
    console.error('[App] ❌ Critical initialization error:', e)
    crashError.value = `初始化失败: ${getErrorMessage(e)}`
    showCrashRecovery.value = true
    showWorldbookWaitModal.value = false
  } finally {
    isInitializing.value = false
  }
}

/**
 * 用户点击确认按钮
 */
async function onConfirmWorldbookReady() {
  // 先严格检查
  let ready = await checkWorldbookReady(false)
  if (!ready) {
    // 严格检查失败，尝试宽松检查（只要有世界书名称就行）
    ready = await checkWorldbookReady(true)
    if (ready) {
      console.log('[App] Strict check failed but lenient check passed, proceeding with initialization')
    }
  }
  if (ready) {
    await doInitialize()
  } else {
    initError.value = '未检测到绑定的世界书。请确认角色卡已绑定世界书后重试。'
  }
}

/**
 * 清除所有缓存数据并重新加载页面
 */
async function onClearCacheAndReload() {
  isClearing.value = true
  try {
    console.log('[App] Clearing all cached data...')
    
    // 清除 IndexedDB
    await clearAllData()
    
    // 清除 localStorage 中的相关数据
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('school_game_')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    
    console.log('[App] All cached data cleared, reloading...')
    
    // 重新加载页面
    window.location.reload()
  } catch (e) {
    console.error('[App] Failed to clear cache:', e)
    // 最后手段：尝试删除整个 IndexedDB 数据库
    try {
      indexedDB.deleteDatabase('SchoolSimulatorDB')
    } catch (e2) {
      console.error('[App] Failed to delete database:', e2)
    }
    window.location.reload()
  }
}

/**
 * 跳过缓存加载，使用默认数据启动
 */
async function onSkipCacheAndContinue() {
  showCrashRecovery.value = false
  console.log('[App] Skipping cache load, starting with defaults...')
  // 不执行 initFromStorage，直接以默认状态启动
  // 但仍然需要重建世界书状态
  try {
    isInitializing.value = true
    // 尝试加载课程池
    const courseLoaded = await loadCoursePoolFromWorldbook(gameStore.meta.currentRunId)
    gameStore._ui.worldbookLoadResults.courseData = !!courseLoaded
    await gameStore.rebuildWorldbookState()
    await gameStore.initializeNpcRelationships()
  } catch (e) {
    console.warn('[App] rebuildWorldbookState failed after skip:', e)
  } finally {
    isInitializing.value = false
    showSplashScreen.value = true
  }
}

onMounted(async () => {
  // 自动轮询等待世界书就绪（逐步递增间隔，最多约 30 秒）
  // SillyTavern 加载世界书条目内容需要时间，不能仅凭名称就判定就绪
  const pollDelays = [300, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5000]
  
  for (const delay of pollDelays) {
    const ready = await checkWorldbookReady()
    if (ready) {
      console.log('[App] Worldbook ready after polling, initializing...')
      await doInitialize()
      return
    }
    console.log(`[App] Worldbook not ready, retrying in ${delay}ms...`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  
  // 最后一次检测
  const finalCheck = await checkWorldbookReady()
  if (finalCheck) {
    console.log('[App] Worldbook ready on final check, initializing...')
    await doInitialize()
    return
  }
  
  // 超时后才显示手动确认弹窗
  console.log('[App] Worldbook not ready after polling, showing wait modal')
  showWorldbookWaitModal.value = true
  isInitializing.value = false
})

// 监听夜间模式变化
watch(() => gameStore.settings.darkMode, (isDark) => {
  if (isDark) {
    document.body.classList.add('dark-mode')
  } else {
    document.body.classList.remove('dark-mode')
  }
}, { immediate: true })
</script>

<template>
  <div class="app-container">
    <!-- 世界书加载等待弹窗 -->
    <div v-if="showWorldbookWaitModal" class="worldbook-wait-modal-overlay">
      <div class="worldbook-wait-modal">
        <div class="modal-icon">⏳</div>
        <h2 class="modal-title">正在初始化...</h2>
        <p class="modal-text">
          请等待 SillyTavern 加载完世界书后，点击下方按钮继续。
        </p>
        <p class="modal-hint">
          💡 提示：如果您看到左侧世界书列表已加载完成，即可点击确认。
        </p>
        <div v-if="initError" class="modal-error">
          ⚠️ {{ initError }}
        </div>
        <button 
          class="modal-confirm-btn"
          :disabled="isInitializing"
          @click="onConfirmWorldbookReady"
        >
          {{ isInitializing ? '初始化中...' : '确认' }}
        </button>
      </div>
    </div>

    <!-- 初始化崩溃恢复弹窗 -->
    <div v-if="showCrashRecovery" class="worldbook-wait-modal-overlay">
      <div class="worldbook-wait-modal crash-recovery-modal">
        <div class="modal-icon">⚠️</div>
        <h2 class="modal-title">初始化遇到问题</h2>
        <p class="modal-text">
          {{ crashError }}
        </p>
        <p class="modal-hint">
          💡 这通常是因为浏览器缓存中的旧版存档数据与当前版本不兼容。<br>
          建议先尝试"清除缓存重试"。如果您有导出的存档文件，可以在清除后重新导入。
        </p>
        <div class="crash-recovery-actions">
          <button 
            class="modal-confirm-btn crash-btn-clear"
            :disabled="isClearing"
            @click="onClearCacheAndReload"
          >
            {{ isClearing ? '清除中...' : '🗑️ 清除缓存并重试' }}
          </button>
          <button 
            class="modal-confirm-btn crash-btn-skip"
            @click="onSkipCacheAndContinue"
          >
            ⏭️ 跳过缓存，使用默认数据
          </button>
        </div>
      </div>
    </div>

    <!-- 开屏提示面板 -->
    <SplashScreen
      v-if="showSplashScreen"
      :load-results="gameStore._ui.worldbookLoadResults"
      @enter="onEnterGame"
    />

    <HomeLayout v-if="!showSplashScreen && !isInitializing" />
  </div>
</template>

<style>
/* ========================================
   CSS 变量定义 - 夜间模式调色板
   ======================================== */
:root {
  /* 浅色模式变量（默认） */
  --bg-primary: #fdfbf3;
  --bg-secondary: #fff9e6;
  --bg-card: #ffffff;
  --bg-input: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --text-primary: #333333;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border-color: #dcdcdc;
  --border-light: #e0e0e0;
  --accent-color: #8b4513;
  --accent-hover: #a0522d;
  --player-msg-bg: #e3f2fd;
  --player-msg-text: #0d47a1;
  --shadow-color: rgba(0, 0, 0, 0.1);
}

/* 夜间模式变量 - 使用舒适的深蓝灰色调，更加明亮温和 */
body.dark-mode {
  --bg-primary: #1e2433;
  --bg-secondary: #2a3241;
  --bg-card: #323b4e;
  --bg-input: #3a4459;
  --bg-hover: rgba(255, 255, 255, 0.1);
  --text-primary: #eef1f5;
  --text-secondary: #b8c4d4;
  --text-muted: #8a9bb0;
  --border-color: #3f4a5e;
  --border-light: #4d5a70;
  --accent-color: #5da4e8;
  --accent-hover: #7ab8f5;
  --player-msg-bg: #2d4a6a;
  --player-msg-text: #c5dff7;
  --shadow-color: rgba(0, 0, 0, 0.25);
}

/* ========================================
   全局重置
   ======================================== */
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden; /* 强制隐藏滚动条 */
}

body {
  background-color: #1a1a1a;
  font-family: 'Arial', sans-serif;
  transition: background-color 0.3s ease, color 0.3s ease;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Ma Shan Zheng', cursive;
}

#app {
  width: 100%;
  height: 100%;
  min-height: 800px; /* 恢复最小高度，防止 iframe 无限变短 */
  overflow: hidden;
  position: relative;
}

.app-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* ========================================
   夜间模式 - 全局基础样式
   ======================================== */
body.dark-mode {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

/* ========================================
   夜间模式 - 主布局容器
   ======================================== */
body.dark-mode .game-main {
  background-color: var(--bg-primary) !important;
}

body.dark-mode .home-layout::before {
  background-color: rgba(0, 0, 0, 0.55) !important;
}

/* ========================================
   夜间模式 - 侧边栏
   ======================================== */
body.dark-mode .sidebar,
body.dark-mode .left-sidebar {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary);
}

body.dark-mode .sidebar-header {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .sidebar-header h3 {
  color: var(--text-primary) !important;
}

body.dark-mode .sidebar-content {
  color: var(--text-primary);
}

/* ========================================
   夜间模式 - 顶部栏
   ======================================== */
body.dark-mode .top-bar {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
  backdrop-filter: none;
}

body.dark-mode .page-title {
  color: var(--text-primary) !important;
}

body.dark-mode .toggle-btn {
  color: var(--text-secondary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .toggle-btn:hover {
  background-color: var(--bg-hover) !important;
}

/* ========================================
   夜间模式 - 内容区域和日志
   ======================================== */
body.dark-mode .content-area {
  background-color: var(--bg-primary);
}

body.dark-mode .log-content {
  background-color: transparent !important;
  color: var(--text-primary) !important;
  box-shadow: none !important;
}

body.dark-mode .log-item.player .log-content {
  background-color: transparent !important;
  color: var(--player-msg-text) !important;
}

/* 夜间模式下的分割线 */
body.dark-mode .log-item::after {
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent) !important;
}

/* ========================================
   夜间模式 - 输入栏
   ======================================== */
body.dark-mode .input-bar-container {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .main-input {
  background-color: var(--bg-input) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .main-input::placeholder {
  color: var(--text-muted) !important;
}

body.dark-mode .main-input:focus {
  border-color: var(--accent-color) !important;
}

body.dark-mode .send-btn {
  background-color: var(--accent-color) !important;
  color: #fff !important;
}

body.dark-mode .send-btn:hover {
  background-color: var(--accent-hover) !important;
}

body.dark-mode .send-btn.stop-btn {
  background-color: #c62828 !important;
}

body.dark-mode .send-btn.stop-btn:hover {
  background-color: #b71c1c !important;
}

/* ========================================
   夜间模式 - 指令面板
   ======================================== */
body.dark-mode .command-btn {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .command-btn:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .command-panel {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
  box-shadow: 0 4px 10px var(--shadow-color);
}

body.dark-mode .command-header {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .command-item {
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .close-small {
  color: var(--text-muted) !important;
}

/* ========================================
   夜间模式 - 通用面板和卡片
   ======================================== */
body.dark-mode .panel,
body.dark-mode .save-panel,
body.dark-mode .preview-content,
body.dark-mode .modal,
body.dark-mode .modal-content {
  background-color: var(--bg-card) !important;
  color: var(--text-primary);
  border-color: var(--border-color) !important;
}

body.dark-mode .panel-header,
body.dark-mode .preview-header,
body.dark-mode .modal-header {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .panel-header h2,
body.dark-mode .panel-header h3,
body.dark-mode .preview-header h3 {
  color: var(--text-primary) !important;
}

/* ========================================
   夜间模式 - 存档面板
   ======================================== */
body.dark-mode .save-panel-content {
  background-color: var(--bg-primary) !important;
}

body.dark-mode .snapshot-item {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .snapshot-item:hover,
body.dark-mode .snapshot-item.clickable:hover {
  background-color: var(--bg-hover) !important;
  border-color: var(--accent-color) !important;
}

body.dark-mode .chat-preview-item {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .chat-preview-item:hover {
  background-color: var(--bg-hover) !important;
  border-color: var(--accent-color) !important;
}

body.dark-mode .io-btn {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .io-btn:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .new-save-btn {
  background-color: var(--accent-color) !important;
}

body.dark-mode .new-save-btn:hover {
  background-color: var(--accent-hover) !important;
}

/* ========================================
   夜间模式 - 地图面板
   ======================================== */
body.dark-mode .map-panel {
  background-color: var(--bg-primary) !important;
}

body.dark-mode .map-header {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .map-header h3,
body.dark-mode .location-title {
  color: var(--text-primary) !important;
}

body.dark-mode .map-container {
  background-color: #2a3540 !important; /* 深色地图背景 */
}

body.dark-mode .map-item {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .map-item:hover {
  background-color: var(--bg-secondary) !important;
}

body.dark-mode .location-details {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .leaf-modal {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

/* ========================================
   夜间模式 - 手机系统
   ======================================== */
body.dark-mode .phone-overlay {
  background-color: rgba(0, 0, 0, 0.6) !important;
}

body.dark-mode .phone-frame {
  /* 手机外框保持深色，不需要特别修改 */
}

/* ========================================
   夜间模式 - 角色信息和物品面板
   ======================================== */
body.dark-mode .character-info,
body.dark-mode .inventory-panel,
body.dark-mode .time-display,
body.dark-mode .avatar-display {
  color: var(--text-primary);
}

body.dark-mode .label {
  color: var(--text-secondary) !important;
}

body.dark-mode .value {
  color: var(--text-primary) !important;
}

body.dark-mode .progress-bar {
  background-color: var(--border-color) !important;
}

body.dark-mode .filter-btn {
  background-color: var(--bg-card) !important;
  color: var(--text-secondary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .filter-btn.active {
  background-color: var(--accent-color) !important;
  color: #fff !important;
  border-color: var(--accent-color) !important;
}

body.dark-mode .item-row {
  color: var(--text-primary) !important;
}

body.dark-mode .item-row:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .item-name {
  color: var(--text-primary) !important;
}

body.dark-mode .item-count {
  color: var(--text-secondary) !important;
}

/* ========================================
   夜间模式 - 属性面板
   ======================================== */
body.dark-mode .attr-row,
body.dark-mode .stat-row {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .attr-label,
body.dark-mode .stat-label {
  color: var(--text-secondary) !important;
}

body.dark-mode .attr-value,
body.dark-mode .stat-value {
  color: var(--text-primary) !important;
}

body.dark-mode .level-up-btn {
  background-color: var(--bg-card) !important;
  color: var(--text-muted) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .level-up-btn.active {
  background-color: var(--accent-color) !important;
  color: #fff !important;
  border-color: var(--accent-color) !important;
}

/* ========================================
   夜间模式 - 按钮通用样式
   ======================================== */
body.dark-mode .sys-btn,
body.dark-mode .menu-item,
body.dark-mode .action-btn {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .sys-btn:hover,
body.dark-mode .menu-item:hover,
body.dark-mode .action-btn:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .action-btn.primary {
  background-color: var(--accent-color) !important;
  color: #fff !important;
  border-color: var(--accent-color) !important;
}

body.dark-mode .action-btn.primary:hover {
  background-color: var(--accent-hover) !important;
}

/* ========================================
   夜间模式 - 文字和标签
   ======================================== */
body.dark-mode .label-text,
body.dark-mode .chat-text {
  color: var(--text-primary) !important;
}

body.dark-mode .info-label,
body.dark-mode .preview-hint,
body.dark-mode .hint-text {
  color: var(--text-muted) !important;
}

body.dark-mode .desc-text {
  color: var(--text-secondary) !important;
}

/* ========================================
   夜间模式 - 遮罩层
   ======================================== */
body.dark-mode .overlay,
body.dark-mode .chat-preview-overlay {
  background-color: rgba(0, 0, 0, 0.7) !important;
}

/* ========================================
   夜间模式 - 圆形按钮（全屏/夜间切换）
   ======================================== */
body.dark-mode .fullscreen-circle-btn {
  background-color: var(--bg-card);
  border-color: var(--border-color);
  color: var(--text-primary);
}

body.dark-mode .fullscreen-circle-btn:hover {
  background-color: var(--bg-hover);
}

/* ========================================
   夜间模式 - 悬浮手机按钮
   ======================================== */
body.dark-mode .floating-phone-btn {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
  box-shadow: -2px 0 5px var(--shadow-color);
}

body.dark-mode .floating-phone-btn:hover {
  background-color: var(--bg-hover) !important;
}

/* ========================================
   夜间模式 - 纸张风格面板（GameStart等）
   ======================================== */
body.dark-mode .paper-panel {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .paper-panel .game-title {
  color: var(--accent-color) !important;
}

body.dark-mode .paper-panel .input-field {
  color: var(--text-primary) !important;
  border-color: var(--accent-color) !important;
  background-color: transparent !important;
}

body.dark-mode .paper-panel .experience-list {
  background-color: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
}

/* ========================================
   夜间模式 - 社交应用
   ======================================== */
body.dark-mode .social-app,
body.dark-mode .chat-container {
  background-color: var(--bg-primary) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .friend-item,
body.dark-mode .group-item {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
}

body.dark-mode .friend-item:hover,
body.dark-mode .group-item:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .message-bubble {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .message-bubble.self {
  background-color: var(--player-msg-bg) !important;
  color: var(--player-msg-text) !important;
}

/* ========================================
   夜间模式 - 班级花名册
   ======================================== */
body.dark-mode .class-roster-panel {
  background-color: var(--bg-card) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .role-card {
  background-color: var(--bg-secondary) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .role-card:hover {
  border-color: var(--accent-color) !important;
}

/* ========================================
   夜间模式 - 手机系统 (PhoneSystem)
   ======================================== */
body.dark-mode .phone-screen::before {
  background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%) !important;
}

body.dark-mode .app-container-phone,
body.dark-mode .phone-screen .app-container {
  background-color: #1a1814 !important;
}

body.dark-mode .status-bar.app-active {
  background-color: #252220 !important;
  color: #e8e4df !important;
}

body.dark-mode .status-bar.app-active .battery-body {
  border-color: rgba(232, 228, 223, 0.5) !important;
}

body.dark-mode .status-bar.app-active .battery-level {
  background-color: #e8e4df !important;
}

body.dark-mode .status-bar.app-active .battery-cap {
  background-color: rgba(232, 228, 223, 0.5) !important;
}

/* ========================================
   夜间模式 - 社交软件 (SocialApp) - 覆盖 CSS 变量
   ======================================== */
body.dark-mode .social-app {
  --primary: #4ade80 !important;
  --primary-dark: #22c55e !important;
  --primary-light: rgba(74, 222, 128, 0.15) !important;
  --bg-primary: #1a1814 !important;
  --bg-secondary: #252220 !important;
  --bg-card: #2d2a26 !important;
  --text-primary: #e8e4df !important;
  --text-secondary: #b5b0a8 !important;
  --text-tertiary: #8a857d !important;
  --border-color: rgba(255, 255, 255, 0.08) !important;
  --bubble-self: #2a4a3a !important;
  --bubble-other: #2d2a26 !important;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.2) !important;
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3) !important;
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.4) !important;
}

body.dark-mode .social-app .app-header {
  background: rgba(37, 34, 32, 0.95) !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .header-title {
  color: #e8e4df !important;
}

body.dark-mode .social-app .back-btn,
body.dark-mode .social-app .menu-btn,
body.dark-mode .social-app .header-icon-btn {
  color: #e8e4df !important;
}

body.dark-mode .social-app .tab-bar {
  background: rgba(37, 34, 32, 0.95) !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .tab-item {
  color: #8a857d !important;
}

body.dark-mode .social-app .tab-item.active {
  color: #4ade80 !important;
}

body.dark-mode .social-app .chat-item {
  background: #2d2a26 !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .chat-item:active {
  background: #353230 !important;
}

body.dark-mode .social-app .item-name {
  color: #e8e4df !important;
}

body.dark-mode .social-app .item-msg,
body.dark-mode .social-app .item-time {
  color: #8a857d !important;
}

body.dark-mode .social-app .chat-content {
  background: #1a1814 !important;
}

body.dark-mode .social-app .message-bubble {
  background-color: #2d2a26 !important;
  color: #e8e4df !important;
}

body.dark-mode .social-app .message-row.self .message-bubble {
  background-color: #2a4a3a !important;
  color: #d1fae5 !important;
}

body.dark-mode .social-app .message-row.other .message-bubble::before {
  border-color: transparent #2d2a26 transparent transparent !important;
}

body.dark-mode .social-app .message-row.self .message-bubble:not(.media-bubble)::before {
  border-color: transparent transparent transparent #2a4a3a !important;
}

body.dark-mode .social-app .chat-input-area {
  background: #252220 !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .chat-input-area input {
  background: #353230 !important;
  color: #e8e4df !important;
}

body.dark-mode .social-app .chat-input-area input::placeholder {
  color: #8a857d !important;
}

body.dark-mode .social-app .icon-btn {
  color: #b5b0a8 !important;
}

body.dark-mode .social-app .send-btn {
  background: #4ade80 !important;
  color: #1a1814 !important;
}

body.dark-mode .social-app .chat-menu {
  background: #2d2a26 !important;
}

body.dark-mode .social-app .member-name {
  color: #b5b0a8 !important;
}

body.dark-mode .social-app .leave-btn {
  background: #353230 !important;
}

body.dark-mode .social-app .action-sheet {
  background: #252220 !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .action-item span {
  color: #b5b0a8 !important;
}

body.dark-mode .social-app .group-header {
  background: #252220 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .social-app .group-content {
  background: #2d2a26 !important;
}

body.dark-mode .social-app .contact-item {
  border-color: rgba(255, 255, 255, 0.05) !important;
}

body.dark-mode .social-app .contact-item:active {
  background: #353230 !important;
}

body.dark-mode .social-app .moment-feed {
  background: #1a1814 !important;
}

body.dark-mode .social-app .moment-item {
  background: #2d2a26 !important;
}

body.dark-mode .social-app .moment-text {
  color: #e8e4df !important;
}

body.dark-mode .social-app .moment-name {
  color: #93c5fd !important;
}

body.dark-mode .social-app .tag {
  background: rgba(147, 197, 253, 0.15) !important;
  color: #93c5fd !important;
}

body.dark-mode .social-app .modal-overlay {
  background: rgba(0,0,0,0.7) !important;
}

body.dark-mode .social-app .modal-card {
  background: #2d2a26 !important;
  color: #e8e4df !important;
}

body.dark-mode .social-app .modal-card h3 {
  color: #e8e4df !important;
}

body.dark-mode .social-app .cancel-btn {
  background: #353230 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .social-app .confirm-btn {
  background: #4ade80 !important;
  color: #1a1814 !important;
}

body.dark-mode .social-app .input-wrapper input,
body.dark-mode .social-app .form-group input {
  background: #353230 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: #e8e4df !important;
}

body.dark-mode .social-app .check-name {
  color: #e8e4df !important;
}

body.dark-mode .social-app .checkmark {
  border-color: #4a4641 !important;
}

body.dark-mode .social-app .empty-state,
body.dark-mode .social-app .empty-chat,
body.dark-mode .social-app .no-friends {
  color: #8a857d !important;
}

/* ========================================
   夜间模式 - 学生档案 (StudentProfile)
   ======================================== */
body.dark-mode .profile-overlay {
  background-color: rgba(0, 0, 0, 0.85) !important;
}

body.dark-mode .profile-paper {
  background-color: #2d2a26 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7) !important;
  color: #e8e4df !important;
}

body.dark-mode .profile-header {
  border-color: #4a4641 !important;
}

body.dark-mode .profile-header h2 {
  color: #d4a574 !important;
}

body.dark-mode .section h3 {
  background-color: rgba(255, 255, 255, 0.05) !important;
  border-left-color: #d4a574 !important;
  color: #e8e4df !important;
}

body.dark-mode .info-item,
body.dark-mode .info-row {
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .profile-paper .label {
  color: #b5b0a8 !important;
}

body.dark-mode .confirm-text {
  color: #8a857d !important;
}

body.dark-mode .signature-area {
  border-color: #4a4641 !important;
}

body.dark-mode .signature-area:hover {
  background-color: rgba(212, 165, 116, 0.1) !important;
}

body.dark-mode .click-sign {
  color: #d4a574 !important;
}

body.dark-mode .profile-paper .back-btn {
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
  background: transparent !important;
}

body.dark-mode .profile-paper .back-btn:hover {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

/* ========================================
   全局过渡效果
   ======================================== */
.game-main,
.sidebar,
.top-bar,
.content-area,
.input-bar-container,
.log-content,
.panel,
.modal,
.command-panel,
.map-panel,
.save-panel,
.social-app,
.profile-paper {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

/* ========================================
   夜间模式 - 加号按钮和菜单
   ======================================== */
body.dark-mode .plus-btn {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
  color: var(--text-primary) !important;
}

body.dark-mode .plus-btn:hover {
  background-color: var(--bg-hover) !important;
}

body.dark-mode .menu-popup {
  background-color: var(--bg-card) !important;
  border-color: var(--border-color) !important;
  box-shadow: 0 4px 10px var(--shadow-color) !important;
}

body.dark-mode .menu-item {
  color: var(--text-primary) !important;
}

body.dark-mode .menu-item:hover {
  background-color: var(--bg-hover) !important;
}

/* ========================================
   夜间模式 - 课程编辑器 (CourseEditor)
   ======================================== */
body.dark-mode .modal-overlay {
  background-color: rgba(0, 0, 0, 0.7) !important;
}

body.dark-mode .modal-content {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5) !important;
}

body.dark-mode .modal-header {
  background: linear-gradient(135deg, #3d3830 0%, #35302a 100%) !important;
  border-color: #4a4641 !important;
}

body.dark-mode .modal-header h2 {
  color: #e8e4df !important;
}

body.dark-mode .close-btn {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #b5b0a8 !important;
}

body.dark-mode .close-btn:hover {
  background: #d32f2f !important;
  color: white !important;
}

body.dark-mode .mobile-current-tab {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .dropdown-arrow {
  color: #8a857d !important;
}

body.dark-mode .sidebar {
  background: linear-gradient(180deg, #252220 0%, #1a1814 100%) !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .sidebar-header {
  background: linear-gradient(135deg, #3d3830 0%, #35302a 100%) !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .sidebar-close {
  color: #b5b0a8 !important;
}

body.dark-mode .sidebar-item {
  color: #b5b0a8 !important;
  border-left-color: transparent !important;
}

body.dark-mode .sidebar-item:hover {
  background: rgba(212, 165, 116, 0.1) !important;
  color: #d4a574 !important;
}

body.dark-mode .sidebar-item.active {
  background: #2d2a26 !important;
  border-left-color: #d4a574 !important;
  color: #d4a574 !important;
}

body.dark-mode .sidebar-footer {
  background: #1a1814 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .reset-btn {
  background: linear-gradient(135deg, #c62828 0%, #b71c1c 100%) !important;
}

body.dark-mode .sidebar-backdrop {
  background: rgba(0, 0, 0, 0.6) !important;
}

body.dark-mode .main-content {
  background: #1a1814 !important;
}

body.dark-mode .sub-tabs {
  border-color: #3d3a36 !important;
}

body.dark-mode .sub-tab-btn {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .sub-tab-btn:hover {
  border-color: #d4a574 !important;
  color: #d4a574 !important;
}

body.dark-mode .sub-tab-btn.active {
  background: linear-gradient(135deg, #d4a574 0%, #c49464 100%) !important;
  border-color: transparent !important;
  color: #1a1814 !important;
}

body.dark-mode .course-list {
  background: #252220 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .list-header {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  border-color: #3d3a36 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .list-row {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .list-row:hover {
  background: #353230 !important;
}

body.dark-mode .course-name {
  color: #e8e4df !important;
}

body.dark-mode .mobile-info {
  color: #8a857d !important;
}

body.dark-mode .col-teacher,
body.dark-mode .col-location {
  color: #b5b0a8 !important;
}

body.dark-mode .origin-tag {
  background: linear-gradient(135deg, rgba(147, 197, 253, 0.15) 0%, rgba(147, 197, 253, 0.1) 100%) !important;
  color: #93c5fd !important;
}

body.dark-mode .add-row {
  background: linear-gradient(135deg, rgba(147, 197, 253, 0.1) 0%, rgba(45, 42, 38, 0.5) 100%) !important;
  color: #93c5fd !important;
}

body.dark-mode .add-row:hover {
  background: linear-gradient(135deg, rgba(147, 197, 253, 0.2) 0%, rgba(147, 197, 253, 0.1) 100%) !important;
}

body.dark-mode .edit-btn {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .edit-btn:hover {
  background: rgba(147, 197, 253, 0.15) !important;
  border-color: #93c5fd !important;
  color: #93c5fd !important;
}

body.dark-mode .del-btn {
  background: #2d2a26 !important;
  border-color: rgba(239, 83, 80, 0.3) !important;
  color: #ef5350 !important;
}

body.dark-mode .del-btn:hover {
  background: rgba(239, 83, 80, 0.15) !important;
  border-color: #ef5350 !important;
}

body.dark-mode .empty-state {
  color: #8a857d !important;
}

body.dark-mode .add-first-btn {
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%) !important;
}

body.dark-mode .edit-modal-overlay {
  background: rgba(0, 0, 0, 0.6) !important;
}

body.dark-mode .edit-modal {
  background: #2d2a26 !important;
}

body.dark-mode .edit-modal-header {
  background: linear-gradient(135deg, #3d3830 0%, #35302a 100%) !important;
  border-color: #4a4641 !important;
}

body.dark-mode .edit-modal-header h3 {
  color: #e8e4df !important;
}

body.dark-mode .modal-close {
  color: #b5b0a8 !important;
}

body.dark-mode .modal-close:hover {
  background: rgba(255, 255, 255, 0.1) !important;
}

body.dark-mode .edit-modal-body {
  background: #2d2a26 !important;
}

body.dark-mode .form-row label {
  color: #b5b0a8 !important;
}

body.dark-mode .form-row input,
body.dark-mode .form-row select {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .form-row input:focus,
body.dark-mode .form-row select:focus {
  border-color: #d4a574 !important;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15) !important;
}

body.dark-mode .form-row input::placeholder {
  color: #8a857d !important;
}

body.dark-mode .edit-modal-footer {
  background: #252220 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .cancel-btn {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .cancel-btn:hover {
  background: #3d3a36 !important;
  border-color: #5a5651 !important;
}

/* ========================================
   夜间模式 - 全校名册筛选 (SchoolRosterFilterPanel)
   ======================================== */
body.dark-mode .filter-panel-overlay {
  background-color: rgba(0, 0, 0, 0.7) !important;
}

body.dark-mode .filter-panel {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5) !important;
}

body.dark-mode .filter-panel .panel-header {
  background: linear-gradient(135deg, #3d3830 0%, #35302a 100%) !important;
  border-color: #4a4641 !important;
}

body.dark-mode .filter-panel .panel-header h3 {
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .panel-body {
  background: #1a1814 !important;
}

body.dark-mode .filter-panel .toolbar {
  background: transparent !important;
}

body.dark-mode .filter-panel .search-input {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .search-input:focus {
  border-color: #d4a574 !important;
}

body.dark-mode .filter-panel .search-input::placeholder {
  color: #8a857d !important;
}

body.dark-mode .filter-panel .clear-search {
  background: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .filter-panel .clear-search:hover {
  background: #5a5651 !important;
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .toolbar-btn {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .toolbar-btn:hover {
  border-color: #d4a574 !important;
  background: rgba(212, 165, 116, 0.1) !important;
}

body.dark-mode .filter-panel .stats-bar {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .stat-icon {
  color: #b5b0a8 !important;
}

body.dark-mode .filter-panel .stat-label {
  color: #8a857d !important;
}

body.dark-mode .filter-panel .stat-value {
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .stat-value.highlight {
  color: #d4a574 !important;
}

body.dark-mode .filter-panel .stat-progress {
  background: #3d3a36 !important;
}

body.dark-mode .filter-panel .progress-fill {
  background: linear-gradient(90deg, #4ade80 0%, #22c55e 100%) !important;
}

body.dark-mode .filter-panel .section-header {
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .section h4 {
  color: #d4a574 !important;
}

body.dark-mode .filter-panel .placeholder-box {
  background: linear-gradient(135deg, #252220 0%, #1a1814 100%) !important;
  color: #8a857d !important;
}

body.dark-mode .filter-panel .work-group {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .work-group:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

body.dark-mode .filter-panel .work-header {
  background: linear-gradient(135deg, #353230 0%, #2d2a26 100%) !important;
}

body.dark-mode .filter-panel .work-header:hover {
  background: linear-gradient(135deg, #3d3a36 0%, #353230 100%) !important;
}

body.dark-mode .filter-panel .work-header.all-selected {
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(34, 197, 94, 0.1) 100%) !important;
  border-left-color: #4ade80 !important;
}

body.dark-mode .filter-panel .work-header.none-selected {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.15) 0%, rgba(239, 83, 80, 0.1) 100%) !important;
  border-left-color: #ef5350 !important;
}

body.dark-mode .filter-panel .work-header.expanded {
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .checkmark {
  background: #353230 !important;
  border-color: #5a5651 !important;
}

body.dark-mode .filter-panel .checkbox-wrapper input:checked ~ .checkmark {
  background: #4ade80 !important;
  border-color: #4ade80 !important;
}

body.dark-mode .filter-panel .checkbox-wrapper input:indeterminate ~ .checkmark {
  background: #ff9800 !important;
  border-color: #ff9800 !important;
}

body.dark-mode .filter-panel .work-name {
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .count-badge {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #b5b0a8 !important;
}

body.dark-mode .filter-panel .count-badge.full {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important;
  color: #1a1814 !important;
}

body.dark-mode .filter-panel .expand-icon {
  color: #8a857d !important;
}

body.dark-mode .filter-panel .student-grid {
  background: #252220 !important;
}

body.dark-mode .filter-panel .student-card {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .student-card:hover {
  border-color: #d4a574 !important;
  box-shadow: 0 2px 8px rgba(212, 165, 116, 0.2) !important;
}

body.dark-mode .filter-panel .student-card.inactive {
  background: #1a1814 !important;
  opacity: 0.6 !important;
}

body.dark-mode .filter-panel .card-checkbox input {
  accent-color: #4ade80 !important;
}

body.dark-mode .filter-panel .student-name {
  color: #e8e4df !important;
}

body.dark-mode .filter-panel .class-tag {
  background: #353230 !important;
  color: #8a857d !important;
}

body.dark-mode .filter-panel .empty-state {
  color: #8a857d !important;
}

body.dark-mode .filter-panel .clear-btn {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .filter-panel .clear-btn:hover {
  border-color: #d4a574 !important;
  color: #d4a574 !important;
}

body.dark-mode .filter-panel .loading-spinner {
  border-color: #3d3a36 !important;
  border-top-color: #d4a574 !important;
}

body.dark-mode .filter-panel .panel-footer {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .filter-panel .text-btn {
  color: #93c5fd !important;
}

body.dark-mode .filter-panel .text-btn:hover {
  background: rgba(147, 197, 253, 0.1) !important;
}

body.dark-mode .filter-panel .action-btn.secondary {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .filter-panel .action-btn.secondary:hover {
  background: #3d3a36 !important;
  border-color: #5a5651 !important;
}

body.dark-mode .filter-panel .action-btn.primary {
  background: linear-gradient(135deg, #d4a574 0%, #c49464 100%) !important;
  color: #1a1814 !important;
}

body.dark-mode .filter-panel .action-btn.primary:hover {
  box-shadow: 0 6px 16px rgba(212, 165, 116, 0.4) !important;
}

body.dark-mode .filter-panel .action-btn.primary:disabled {
  background: #4a4641 !important;
  color: #8a857d !important;
}

/* ========================================
   夜间模式 - 事件编辑器 (EventEditorPanel)
   ======================================== */
body.dark-mode .event-editor-overlay {
  background-color: rgba(0, 0, 0, 0.7) !important;
}

body.dark-mode .event-editor-panel {
  background: linear-gradient(135deg, #2d2a26 0%, #252220 100%) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5) !important;
}

body.dark-mode .event-editor-panel .panel-header {
  background: linear-gradient(135deg, #c62828 0%, #b71c1c 100%) !important;
}

body.dark-mode .event-editor-panel .back-btn {
  background: rgba(255, 255, 255, 0.15) !important;
}

body.dark-mode .event-editor-panel .back-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
}

body.dark-mode .event-editor-panel .close-btn {
  background: rgba(255, 255, 255, 0.15) !important;
  color: white !important;
}

body.dark-mode .event-editor-panel .close-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
}

body.dark-mode .event-list-sidebar {
  background: #252220 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .search-bar {
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .search-input {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .search-input:focus {
  border-color: #d4a574 !important;
}

body.dark-mode .event-editor-panel .search-input::placeholder {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .add-btn {
  background: linear-gradient(135deg, #c62828 0%, #b71c1c 100%) !important;
}

body.dark-mode .event-editor-panel .stats-mini {
  background: #1a1814 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .stat-tag {
  background: #3d3a36 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .stat-tag.custom {
  background: rgba(147, 197, 253, 0.15) !important;
  color: #93c5fd !important;
}

body.dark-mode .event-editor-panel .stat-tag.calendar {
  background: rgba(255, 152, 0, 0.15) !important;
  color: #ffb74d !important;
}

body.dark-mode .event-editor-panel .event-item {
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .event-item:hover {
  background: #353230 !important;
}

body.dark-mode .event-editor-panel .event-item.active {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.15) 0%, rgba(239, 83, 80, 0.1) 100%) !important;
  border-left-color: #ef5350 !important;
}

body.dark-mode .event-editor-panel .event-item.virtual {
  background: rgba(255, 152, 0, 0.08) !important;
}

body.dark-mode .event-editor-panel .event-item.virtual.active {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 152, 0, 0.1) 100%) !important;
  border-left-color: #ff9800 !important;
}

body.dark-mode .event-editor-panel .event-name {
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .event-type-tag {
  background: #3d3a36 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .virtual-tag {
  background: rgba(255, 152, 0, 0.15) !important;
  color: #ffb74d !important;
}

body.dark-mode .event-editor-panel .empty-list {
  color: #8a857d !important;
}

body.dark-mode .event-detail-area {
  background: #1a1814 !important;
}

body.dark-mode .event-editor-panel .empty-state {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .empty-hint {
  color: #5a5651 !important;
}

body.dark-mode .event-editor-panel .detail-header {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .detail-header h3 {
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .action-btn.edit {
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%) !important;
}

body.dark-mode .event-editor-panel .action-btn.delete {
  background: #2d2a26 !important;
  border-color: rgba(239, 83, 80, 0.3) !important;
  color: #ef5350 !important;
}

body.dark-mode .event-editor-panel .action-btn.delete:hover {
  background: rgba(239, 83, 80, 0.15) !important;
  border-color: #ef5350 !important;
}

body.dark-mode .event-editor-panel .detail-card {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .detail-row {
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .detail-label {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .detail-value {
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .detail-value.code {
  background: #353230 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .type-badge {
  background: linear-gradient(135deg, rgba(239, 83, 80, 0.15) 0%, rgba(239, 83, 80, 0.1) 100%) !important;
  color: #ef5350 !important;
}

body.dark-mode .event-editor-panel .detail-section {
  background: #2d2a26 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .section-title {
  color: #e8e4df !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .trigger-display-card {
  background: #353230 !important;
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .trigger-display-card.readonly {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 152, 0, 0.05) 100%) !important;
  border-color: rgba(255, 152, 0, 0.3) !important;
}

body.dark-mode .event-editor-panel .trigger-type-badge {
  background: #1976d2 !important;
}

body.dark-mode .event-editor-panel .trigger-type-badge.fixed_date {
  background: #ff9800 !important;
}

body.dark-mode .event-editor-panel .trigger-type-badge.random {
  background: #9c27b0 !important;
}

body.dark-mode .event-editor-panel .trigger-type-badge.composite {
  background: #00bcd4 !important;
}

body.dark-mode .event-editor-panel .trigger-weight {
  background: #3d3a36 !important;
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .trigger-content {
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .description-box {
  background: #353230 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .no-data {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .edit-form {
  background: #2d2a26 !important;
}

body.dark-mode .event-editor-panel .form-header {
  background: linear-gradient(135deg, #3d3830 0%, #35302a 100%) !important;
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .form-header h3 {
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .form-section {
  background: #353230 !important;
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .section-header-row {
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .add-trigger-btn {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important;
  color: #1a1814 !important;
}

body.dark-mode .event-editor-panel .form-row label {
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .input-field {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #e8e4df !important;
}

body.dark-mode .event-editor-panel .input-field:focus {
  border-color: #d4a574 !important;
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.15) !important;
}

body.dark-mode .event-editor-panel .input-field:disabled {
  background: #1a1814 !important;
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .input-field::placeholder {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .hint {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .hint-box {
  background: rgba(255, 152, 0, 0.1) !important;
  border-color: rgba(255, 152, 0, 0.3) !important;
  color: #ffb74d !important;
}

body.dark-mode .event-editor-panel .no-triggers {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .trigger-edit-card {
  background: #2d2a26 !important;
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .trigger-card-header {
  border-color: #4a4641 !important;
}

body.dark-mode .event-editor-panel .trigger-index {
  color: #8a857d !important;
}

body.dark-mode .event-editor-panel .delete-trigger-btn:hover {
  background: rgba(239, 83, 80, 0.15) !important;
}

body.dark-mode .event-editor-panel .checkbox-label {
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .form-footer {
  background: #252220 !important;
  border-color: #3d3a36 !important;
}

body.dark-mode .event-editor-panel .save-btn {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important;
  color: #1a1814 !important;
}

body.dark-mode .event-editor-panel .cancel-btn {
  background: #353230 !important;
  border-color: #4a4641 !important;
  color: #b5b0a8 !important;
}

body.dark-mode .event-editor-panel .cancel-btn:hover {
  background: #3d3a36 !important;
  border-color: #5a5651 !important;
}

/* ========================================
   世界书加载等待弹窗样式
   ======================================== */
.worldbook-wait-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(8px);
}

.worldbook-wait-modal {
  background: linear-gradient(135deg, #2d2a26 0%, #1a1814 100%);
  border-radius: 16px;
  padding: 40px 50px;
  max-width: 450px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(212, 165, 116, 0.3);
  animation: modal-appear 0.3s ease-out;
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.worldbook-wait-modal .modal-icon {
  font-size: 64px;
  margin-bottom: 20px;
  animation: icon-pulse 2s ease-in-out infinite;
}

@keyframes icon-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.worldbook-wait-modal .modal-title {
  color: #e8e4df;
  font-size: 1.6rem;
  margin: 0 0 16px 0;
  font-weight: 500;
}

.worldbook-wait-modal .modal-text {
  color: #b5b0a8;
  font-size: 1rem;
  line-height: 1.6;
  margin: 0 0 16px 0;
}

.worldbook-wait-modal .modal-hint {
  color: #d4a574;
  font-size: 0.9rem;
  line-height: 1.5;
  margin: 0 0 24px 0;
  padding: 12px;
  background: rgba(212, 165, 116, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(212, 165, 116, 0.2);
}

.worldbook-wait-modal .modal-error {
  color: #ef5350;
  font-size: 0.9rem;
  margin: 0 0 16px 0;
  padding: 10px;
  background: rgba(239, 83, 80, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(239, 83, 80, 0.3);
}

.worldbook-wait-modal .modal-confirm-btn {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  color: #1a1814;
  border: none;
  padding: 14px 40px;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(74, 222, 128, 0.3);
}

.worldbook-wait-modal .modal-confirm-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(74, 222, 128, 0.4);
}

.worldbook-wait-modal .modal-confirm-btn:disabled {
  background: #4a4641;
  color: #8a857d;
  cursor: not-allowed;
  box-shadow: none;
}

/* ========================================
   初始化崩溃恢复弹窗样式
   ======================================== */
.crash-recovery-modal .modal-icon {
  animation: none !important;
}

.crash-recovery-modal .modal-title {
  color: #ef5350 !important;
}

.crash-recovery-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.crash-btn-clear {
  background: linear-gradient(135deg, #ef5350 0%, #c62828 100%) !important;
  color: #fff !important;
  box-shadow: 0 4px 15px rgba(239, 83, 80, 0.3) !important;
}

.crash-btn-clear:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(239, 83, 80, 0.4) !important;
}

.crash-btn-skip {
  background: #353230 !important;
  color: #b5b0a8 !important;
  box-shadow: none !important;
  border: 1px solid #4a4641;
}

.crash-btn-skip:hover {
  background: #3d3a36 !important;
  color: #e8e4df !important;
  box-shadow: none !important;
}
</style>
