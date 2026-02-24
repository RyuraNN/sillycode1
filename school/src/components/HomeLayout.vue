<script setup>
import { ref, defineAsyncComponent } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { switchSaveSlot, restoreWorldbookFromStore } from '../utils/socialWorldbook'
import { clearAllData } from '../utils/indexedDB'
import { getAllBookNames } from '../utils/worldbookHelper'
import { syncClubWorldbookState, syncClassWorldbookState, setPlayerClass } from '../utils/worldbookParser'

// 使用异步组件以优化首屏加载性能
const GameStart = defineAsyncComponent(() => import('./GameStart.vue'))
const SavePanel = defineAsyncComponent(() => import('./SavePanel.vue'))
const Settings = defineAsyncComponent(() => import('./Settings.vue'))
const GameMain = defineAsyncComponent(() => import('./GameMain.vue'))
const MapEditorPanel = defineAsyncComponent(() => import('./MapEditorPanel.vue'))
const EventEditorPanel = defineAsyncComponent(() => import('./EventEditorPanel.vue'))
const NpcScheduleEditorPanel = defineAsyncComponent(() => import('./NpcScheduleEditorPanel.vue'))

const gameStore = useGameStore()
const currentView = ref('menu') // 'menu', 'start', 'load', 'settings', 'game'
const showMapEditor = ref(false)
const showEventEditor = ref(false)
const showScheduleEditor = ref(false)
const showResetModal = ref(false)
const resetConfirmText = ref('')
const isResetting = ref(false)

const showMenu = () => {
  currentView.value = 'menu'
}

const startGame = async () => {
  // GameStart 组件已经完成了初始化，这里只需要切换视图
  currentView.value = 'game'
}

const handleRestore = async (snapshot) => {
  // 设置待恢复的日志，以便 GameMain 挂载时读取
  gameStore.setPendingRestoreLog(snapshot.chatLog)
  // 不再需要手动调用世界书同步，因为 restoreSnapshot (在 SavePanel 中被调用) 已经包含在 rebuildWorldbookState 中处理了
  // 且现在 rebuildWorldbookState 是被 await 等待完成的，所以可以安全切换视图
  
  // 切换到游戏视图
  currentView.value = 'game'
}

const handleSavePanelClose = () => {
  // 只有在当前是 load 视图时才返回 menu
  // 如果已经被 restore 切换到了 game，就不应该切回 menu
  if (currentView.value === 'load') {
    currentView.value = 'menu'
  }
}

const toggleDarkMode = () => {
  gameStore.toggleDarkMode()
}

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`)
    })
  } else {
    document.exitFullscreen()
  }
}

const onGeminiModeChange = async () => {
  if (gameStore.settings.useGeminiMode) {
    gameStore.settings.summarySystem.enabled = true
  }
  gameStore.saveToStorage()

  // 同步世界书灯光颜色状态
  try {
    // 同步社团世界书状态（蓝灯/绿灯切换）
    await syncClubWorldbookState(gameStore.currentRunId, gameStore.settings.useGeminiMode)

    // 同步班级世界书状态（蓝灯/绿灯切换）
    await syncClassWorldbookState(gameStore.currentRunId, gameStore.allClassData, gameStore.settings.useGeminiMode)

    // 如果玩家已经选择了班级，重新设置玩家班级（确保玩家班级始终是蓝灯）
    if (gameStore.player.classId) {
      await setPlayerClass(gameStore.player.classId, gameStore.settings.useGeminiMode)
    }

    console.log('[HomeLayout] Worldbook lamp colors synced for Gemini mode:', gameStore.settings.useGeminiMode)
  } catch (e) {
    console.error('[HomeLayout] Failed to sync worldbook state:', e)
  }
}

async function clearRunIdWorldbookEntries() {
  if (typeof window.deleteWorldbookEntries !== 'function') return

  const runIdPrefixes = ['[Social:', '[Moment:', '[Impression:', '[Forum:', '[Jobs:']
  const electivePrefix = '[Elective:'

  const bookNames = getAllBookNames()
  for (const bookName of bookNames) {
    try {
      await window.deleteWorldbookEntries(bookName, (entry) => {
        if (!entry.name) return false

        for (const prefix of runIdPrefixes) {
          if (entry.name.startsWith(prefix)) return true
        }

        if (entry.name.startsWith(electivePrefix)) return true

        if (entry.name.startsWith('[Class:')) {
          const inner = entry.name.slice(7)
          const closeBracket = inner.indexOf(']')
          const content = closeBracket > -1 ? inner.substring(0, closeBracket) : inner
          if (content.includes(':')) return true
        }

        if (entry.name.startsWith('[Club:')) {
          const inner = entry.name.slice(6)
          const closeBracket = inner.indexOf(']')
          const content = closeBracket > -1 ? inner.substring(0, closeBracket) : inner
          if (content.includes(':')) return true
        }

        return false
      })
    } catch (e) {
      console.warn(`[HomeLayout] Failed to clear worldbook entries from ${bookName}:`, e)
    }
  }
}

async function resetGame() {
  if (resetConfirmText.value !== '确认重置') return
  isResetting.value = true
  try {
    await clearRunIdWorldbookEntries()
    await clearAllData()

    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('school_game_')) keysToRemove.push(key)
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    localStorage.removeItem('batchProgress')

    window.location.reload()
  } catch (e) {
    console.error('[HomeLayout] Reset failed:', e)
    alert('重置失败，请尝试手动清除浏览器缓存。')
    isResetting.value = false
  }
}
</script>

<template>
  <div class="home-layout">
    <!-- 地图编辑器入口 -->
    <div v-if="currentView === 'menu' && !showMapEditor && !showScheduleEditor" class="top-left-btns">
      <button class="fullscreen-circle-btn" @click="showMapEditor = true" title="地图编辑器">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-globe" viewBox="0 0 16 16">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
        </svg>
      </button>
      <button class="fullscreen-circle-btn" @click="showScheduleEditor = true" title="NPC日程编辑器">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-calendar3" viewBox="0 0 16 16">
          <path d="M14 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zM1 3.857C1 3.384 1.448 3 2 3h12c.552 0 1 .384 1 .857v10.286c0 .473-.448.857-1 .857H2c-.552 0-1-.384-1-.857V3.857z"/>
          <path d="M6.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-9 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
        </svg>
      </button>
    </div>

    <div v-if="currentView !== 'game'" class="top-right-btns">
      <button class="fullscreen-circle-btn" @click="toggleDarkMode" title="切换夜间模式">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-moon-stars" viewBox="0 0 16 16">
          <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278zM4.858 1.311A7.269 7.269 0 0 0 1.025 7.71c0 4.02 3.279 7.276 7.319 7.276a7.316 7.316 0 0 0 5.205-2.162c-.337.042-.68.063-1.029.063-4.61 0-8.343-3.714-8.343-8.29 0-1.167.242-2.278.681-3.286z"/>
          <path d="M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.734 1.734 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.734 1.734 0 0 0 9.31 6.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.734 1.734 0 0 0 1.097-1.097l.387-1.162zM13.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732l-.774-.258a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L13.863.1z"/>
        </svg>
      </button>
      <button class="fullscreen-circle-btn" @click="toggleFullscreen" title="切换全屏">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path fill-rule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"/>
        </svg>
      </button>
      <button v-if="currentView === 'menu'" class="fullscreen-circle-btn reset-btn" @click="showResetModal = true" title="重置游戏">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
      </button>
    </div>

    <!-- 游戏主界面 -->
    <GameMain v-if="currentView === 'game'" @back="showMenu" />

    <!-- 主菜单 -->
    <div v-else-if="currentView === 'menu'" class="menu-container">
      <h1 class="game-title">天华学园模拟器</h1>
      
      <div class="button-group">
        <button class="menu-btn" @click="currentView = 'start'">开始游戏</button>
        <button class="menu-btn" @click="currentView = 'load'">读取存档</button>
        <button class="menu-btn" @click="currentView = 'settings'">游戏设置</button>
      </div>

      <label class="gemini-mode-toggle" :class="{ active: gameStore.settings.useGeminiMode }">
        <input type="checkbox" v-model="gameStore.settings.useGeminiMode" @change="onGeminiModeChange">
        <span class="gemini-checkbox"></span>
        <span class="gemini-label">Gemini 3.0 Preview 模式</span>
      </label>
    </div>

    <!-- 子面板 -->
    <div v-else class="panel-container">
      <GameStart v-if="currentView === 'start'" @back="showMenu" @start-game="startGame" />
      <SavePanel 
        v-if="currentView === 'load'" 
        mode="load"
        @close="handleSavePanelClose" 
        @restore="handleRestore"
      />
      <Settings v-if="currentView === 'settings'" @back="showMenu" />
    </div>
    
    <!-- 地图编辑器层 -->
    <MapEditorPanel 
      v-if="showMapEditor" 
      @close="showMapEditor = false" 
      @open-event-editor="showEventEditor = true"
    />
    
    <!-- 事件编辑器层 -->
    <EventEditorPanel v-if="showEventEditor" @close="showEventEditor = false" />

    <!-- NPC日程编辑器层 -->
    <NpcScheduleEditorPanel
      v-if="showScheduleEditor"
      @close="showScheduleEditor = false"
    />

    <!-- 重置确认弹窗 -->
    <div v-if="showResetModal" class="reset-modal-overlay" @click.self="showResetModal = false">
      <div class="reset-modal">
        <h3>⚠️ 重置游戏</h3>
        <p>此操作将清除所有游戏数据，包括存档、设置和世界书动态条目。此操作不可撤销。</p>
        <p>请输入「<strong>确认重置</strong>」以继续：</p>
        <input v-model="resetConfirmText" placeholder="请输入 确认重置" :disabled="isResetting" />
        <div class="reset-modal-actions">
          <button @click="showResetModal = false; resetConfirmText = ''" :disabled="isResetting">取消</button>
          <button class="reset-confirm-btn"
            :disabled="resetConfirmText !== '确认重置' || isResetting"
            @click="resetGame">
            {{ isResetting ? '重置中...' : '确认重置' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-layout {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background-image: url('https://files.catbox.moe/kxz1kx.jpg');
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

/* 背景动态光效 */
.home-layout::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(ellipse at 20% 80%, rgba(139, 69, 19, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(218, 165, 32, 0.1) 0%, transparent 50%),
    linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
  transition: background-color 0.3s ease;
  z-index: 0;
}

/* 确保内容在遮罩之上 */
.home-layout > * {
  position: relative;
  z-index: 1;
}

.menu-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
}

.game-title {
  color: white;
  font-size: 3.5rem;
  margin-bottom: 2rem;
  position: absolute;
  top: 18%;
  text-align: center;
  font-weight: 300;
  letter-spacing: 8px;
  text-shadow: 
    0 0 40px rgba(218, 165, 32, 0.5),
    0 4px 20px rgba(0, 0, 0, 0.8),
    0 0 80px rgba(139, 69, 19, 0.3);
  background: linear-gradient(180deg, 
    rgba(255, 248, 220, 1) 0%, 
    rgba(218, 165, 32, 1) 50%,
    rgba(184, 134, 11, 1) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: title-glow 3s ease-in-out infinite;
}

@keyframes title-glow {
  0%, 100% { 
    filter: drop-shadow(0 0 20px rgba(218, 165, 32, 0.4));
  }
  50% { 
    filter: drop-shadow(0 0 30px rgba(218, 165, 32, 0.6));
  }
}

/* 标题装饰线 */
.game-title::before,
.game-title::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 80px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(218, 165, 32, 0.8), transparent);
}

.game-title::before {
  right: calc(100% + 20px);
}

.game-title::after {
  left: calc(100% + 20px);
}

.button-group {
  display: flex;
  gap: 2.5rem;
  position: absolute;
  bottom: 22%;
}

.menu-btn {
  position: relative;
  padding: 18px 50px;
  font-size: 1.3rem;
  font-weight: 500;
  letter-spacing: 3px;
  background: linear-gradient(135deg, 
    rgba(139, 69, 19, 0.3) 0%, 
    rgba(160, 82, 45, 0.4) 50%,
    rgba(139, 69, 19, 0.3) 100%);
  border: 1px solid rgba(218, 165, 32, 0.4);
  color: rgba(255, 248, 220, 0.95);
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

/* 按钮光泽效果 */
.menu-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent, 
    rgba(255, 255, 255, 0.15), 
    transparent);
  transition: left 0.5s;
}

.menu-btn:hover::before {
  left: 100%;
}

.menu-btn:hover {
  background: linear-gradient(135deg, 
    rgba(218, 165, 32, 0.4) 0%, 
    rgba(184, 134, 11, 0.5) 50%,
    rgba(218, 165, 32, 0.4) 100%);
  border-color: rgba(255, 215, 0, 0.6);
  transform: translateY(-3px);
  box-shadow: 
    0 8px 30px rgba(218, 165, 32, 0.3),
    0 4px 15px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 240, 1);
}

.menu-btn:active {
  transform: translateY(-1px);
}

.panel-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, rgba(20, 15, 10, 0.7) 0%, rgba(40, 30, 20, 0.7) 100%);
  backdrop-filter: blur(5px);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .game-title {
    font-size: 2rem;
    top: 12%;
    text-align: center;
    width: 90%;
    letter-spacing: 4px;
  }

  .game-title::before,
  .game-title::after {
    display: none;
  }

  .button-group {
    flex-direction: column;
    gap: 1.2rem;
    bottom: 18%;
  }

  .menu-btn {
    padding: 14px 40px;
    font-size: 1.1rem;
    width: 220px;
    letter-spacing: 2px;
  }
}

.fullscreen-circle-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.4) 0%, rgba(160, 82, 45, 0.5) 100%);
  border: 1px solid rgba(218, 165, 32, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 248, 220, 0.9);
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.fullscreen-circle-btn:hover {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.5) 0%, rgba(184, 134, 11, 0.6) 100%);
  border-color: rgba(255, 215, 0, 0.6);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(218, 165, 32, 0.3);
}

.top-right-btns {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 100;
  display: flex;
  gap: 12px;
}

.top-left-btns {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 100;
  display: flex;
  gap: 12px;
}

.gemini-mode-toggle {
  position: absolute;
  bottom: 12%;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: rgba(255, 248, 220, 0.5);
  font-size: 0.9rem;
  transition: color 0.3s ease;
}

.gemini-mode-toggle.active {
  color: rgba(255, 215, 0, 0.9);
}

.gemini-mode-toggle input[type="checkbox"] {
  display: none;
}

.gemini-checkbox {
  width: 16px;
  height: 16px;
  border: 1px solid rgba(218, 165, 32, 0.5);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.gemini-mode-toggle.active .gemini-checkbox {
  background: rgba(218, 165, 32, 0.6);
  border-color: rgba(255, 215, 0, 0.8);
}

.gemini-mode-toggle.active .gemini-checkbox::after {
  content: '✓';
  font-size: 11px;
  color: #fff;
}

.gemini-mode-toggle:hover {
  color: rgba(255, 248, 220, 0.8);
}

.reset-btn {
  background: linear-gradient(135deg, rgba(139, 40, 40, 0.4) 0%, rgba(160, 50, 50, 0.5) 100%);
  border-color: rgba(220, 80, 80, 0.4);
}

.reset-btn:hover {
  background: linear-gradient(135deg, rgba(200, 60, 60, 0.5) 0%, rgba(180, 40, 40, 0.6) 100%);
  border-color: rgba(255, 100, 100, 0.6);
  box-shadow: 0 6px 20px rgba(200, 60, 60, 0.3);
}

.reset-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.reset-modal {
  background: linear-gradient(135deg, #2a1f1f 0%, #1a1215 100%);
  border: 1px solid rgba(220, 80, 80, 0.4);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
  color: rgba(255, 240, 240, 0.9);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.reset-modal h3 {
  margin: 0 0 16px 0;
  font-size: 1.3rem;
  color: rgba(255, 180, 180, 0.95);
}

.reset-modal p {
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgba(255, 220, 220, 0.8);
}

.reset-modal input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(220, 80, 80, 0.3);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 240, 240, 0.9);
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 20px;
  transition: border-color 0.3s ease;
}

.reset-modal input:focus {
  border-color: rgba(220, 80, 80, 0.6);
}

.reset-modal input:disabled {
  opacity: 0.5;
}

.reset-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.reset-modal-actions button {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 240, 240, 0.8);
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.3s ease;
}

.reset-modal-actions button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.reset-modal-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.reset-confirm-btn {
  background: rgba(200, 60, 60, 0.4) !important;
  border-color: rgba(220, 80, 80, 0.5) !important;
  color: rgba(255, 200, 200, 0.95) !important;
}

.reset-confirm-btn:hover:not(:disabled) {
  background: rgba(200, 60, 60, 0.6) !important;
}
</style>
