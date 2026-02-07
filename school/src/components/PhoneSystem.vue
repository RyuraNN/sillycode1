<script setup>
import { defineEmits, ref, onMounted, onUnmounted, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { fetchModels, IMAGE_ANALYSIS_PROMPT } from '../utils/assistantAI'
import { generateBatchSummaries } from '../utils/summaryManager'
import { setVariableParsingWorldbookStatus } from '../utils/worldbookParser'
import { setItem, getItem, removeItem } from '../utils/indexedDB'
import SocialApp from './SocialApp.vue'
import SummaryViewer from './SummaryViewer.vue'
import CalendarApp from './CalendarApp.vue'
import ScheduleApp from './ScheduleApp.vue'
import WeatherApp from './WeatherApp.vue'
import DeliveryApp from './DeliveryApp.vue'
import PartTimeJobApp from './PartTimeJobApp.vue'
import RosterApp from './RosterApp.vue'

const emit = defineEmits(['close', 'open-app'])
const gameStore = useGameStore()

const currentApp = ref(null)
const customWallpaper = ref(null) // 自定义壁纸 Base64
const fileInputRef = ref(null) // 文件输入引用
const modelList = ref([])
const isLoadingModels = ref(false)
const showSummaryViewer = ref(false)
const showBatchModal = ref(false)
const batchSize = ref(10)
const isBatchProcessing = ref(false)
const batchProgress = ref({ current: 0, total: 0 })
const newContentTag = ref('')

// 批量生成总结
const startBatchGeneration = async () => {
  if (!gameStore.currentChatLog || gameStore.currentChatLog.length === 0) {
    alert('没有聊天记录可供处理')
    return
  }
  
  if (!gameStore.settings.assistantAI.enabled) {
    alert('请先开启辅助AI')
    return
  }

  isBatchProcessing.value = true
  batchProgress.value = { current: 0, total: 0 }
  
  try {
    await generateBatchSummaries(gameStore.currentChatLog, batchSize.value, (current, total) => {
      batchProgress.value = { current, total }
    })
    alert('批量生成完成！')
    showBatchModal.value = false
  } catch (e) {
    console.error(e)
    alert('生成过程中出错: ' + e.message)
  } finally {
    isBatchProcessing.value = false
  }
}

// 重置生图系统提示词
const resetImageSystemPrompt = () => {
  if (confirm('确定要重置生图系统指令为默认值吗？')) {
    gameStore.settings.customImageAnalysisPrompt = ''
    gameStore.saveToStorage()
  }
}

const addContentTag = () => {
  if (!newContentTag.value) return
  
  // 清洗标签：移除 < > / 空格
  const cleanTag = newContentTag.value.replace(/[<>\/\s]/g, '')
  
  if (cleanTag && !gameStore.settings.customContentTags.includes(cleanTag)) {
    gameStore.settings.customContentTags.push(cleanTag)
    gameStore.saveToStorage()
  }
  newContentTag.value = ''
}

const removeContentTag = (tag) => {
  const index = gameStore.settings.customContentTags.indexOf(tag)
  if (index > -1) {
    // 至少保留一个 content 标签
    if (gameStore.settings.customContentTags.length <= 1 && tag === 'content') {
      alert('必须至少保留 content 标签')
      return
    }
    gameStore.settings.customContentTags.splice(index, 1)
    gameStore.saveToStorage()
  }
}

const WALLPAPER_STORAGE_KEY = 'school_phone_wallpaper'
const DEFAULT_WALLPAPER = 'https://files.catbox.moe/kxz1kx.jpg'

const totalUnreadCount = computed(() => {
  let count = 0
  if (gameStore.player.social.friends) {
    gameStore.player.social.friends.forEach(f => count += (f.unreadCount || 0))
  }
  if (gameStore.player.social.groups) {
    gameStore.player.social.groups.forEach(g => count += (g.unreadCount || 0))
  }
  return count
})

const loadModels = async () => {
  if (!gameStore.settings.assistantAI.apiUrl || !gameStore.settings.assistantAI.apiKey) {
    alert('请先填写 API 地址和 Key')
    return
  }
  isLoadingModels.value = true
  try {
    const models = await fetchModels(gameStore.settings.assistantAI.apiUrl, gameStore.settings.assistantAI.apiKey)
    modelList.value = models
    if (models.length > 0 && !gameStore.settings.assistantAI.model) {
      gameStore.settings.assistantAI.model = models[0].id
    }
  } catch (e) {
    alert('获取模型列表失败: ' + e.message)
  } finally {
    isLoadingModels.value = false
  }
}

const apps = [
  { id: 'social', name: '社交', icon: '💬', color: 'linear-gradient(135deg, #07c160 0%, #1aad19 100%)' },
  { id: 'calendar', name: '日历', icon: '📅', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'weather', name: '天气', icon: '🌤️', color: 'linear-gradient(135deg, #56CCF2 0%, #2F80ED 100%)' },
  { id: 'delivery', name: '外卖', icon: '🛵', color: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)' },
  { id: 'parttime', name: '兼职', icon: '💼', color: 'linear-gradient(135deg, #ff9500 0%, #ff7f00 100%)' },
  { id: 'roster', name: '天华名录', icon: '📇', color: 'linear-gradient(135deg, #1976D2 0%, #2196F3 100%)' },
  { id: 'schedule', name: '天华通', icon: '🏫', color: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' },
  { id: 'map', name: '地图', icon: '🗺️', color: 'linear-gradient(135deg, #34c759 0%, #30b94d 100%)' },
  { id: 'save', name: '存档', icon: '💾', color: 'linear-gradient(135deg, #5ac8fa 0%, #32ade6 100%)' },
  { id: 'load', name: '读取', icon: '📂', color: 'linear-gradient(135deg, #ff2d55 0%, #ff3b30 100%)' },
  { id: 'darkmode', name: '显示', icon: '🌙', color: 'linear-gradient(135deg, #636366 0%, #48484a 100%)' },
  { id: 'fullscreen', name: '全屏', icon: '⛶', color: 'linear-gradient(135deg, #32ade6 0%, #007aff 100%)' },
  { id: 'settings', name: '设置', icon: '⚙️', color: 'linear-gradient(135deg, #8e8e93 0%, #636366 100%)' },
  { id: 'exit', name: '主菜单', icon: '🚪', color: 'linear-gradient(135deg, #ff3b30 0%, #ff453a 100%)' }
]

// 游戏内时间显示
const currentTime = computed(() => {
    const hour = String(gameStore.gameTime.hour || 8).padStart(2, '0')
    const minute = String(gameStore.gameTime.minute || 0).padStart(2, '0')
    return `${hour}:${minute}`
})

onMounted(() => {
    // 加载自定义壁纸
    loadWallpaper()
})

onUnmounted(() => {
    // 清理（如果将来有需要清理的资源）
})

const handleAppClick = (appId) => {
  if (appId === 'social') {
    currentApp.value = 'social'
  } else if (appId === 'calendar') {
    currentApp.value = 'calendar'
  } else if (appId === 'weather') {
    currentApp.value = 'weather'
  } else if (appId === 'delivery') {
    currentApp.value = 'delivery'
  } else if (appId === 'parttime') {
    currentApp.value = 'parttime'
  } else if (appId === 'roster') {
    currentApp.value = 'roster'
  } else if (appId === 'schedule') {
    currentApp.value = 'schedule'
  } else if (appId === 'settings') {
    currentApp.value = 'settings'
  } else {
    emit('open-app', appId)
  }
}

// 壁纸相关功能
const loadWallpaper = async () => {
  try {
    const saved = await getItem(WALLPAPER_STORAGE_KEY)
    if (saved) {
      customWallpaper.value = saved
    }
  } catch (e) {
    console.error('加载壁纸失败:', e)
  }
}

const handleWallpaperUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  // 验证是否为图片
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }
  
  // 限制文件大小（2MB）
  if (file.size > 2 * 1024 * 1024) {
    alert('图片大小不能超过 2MB')
    return
  }
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result
    if (base64 && typeof base64 === 'string') {
      customWallpaper.value = base64
      try {
        await setItem(WALLPAPER_STORAGE_KEY, base64)
      } catch (err) {
        console.error('保存壁纸失败:', err)
        alert('保存失败，请检查控制台')
      }
    }
  }
  reader.readAsDataURL(file)
}

const resetWallpaper = async () => {
  customWallpaper.value = null
  try {
    await removeItem(WALLPAPER_STORAGE_KEY)
  } catch (e) {
    console.error('重置壁纸失败:', e)
  }
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const wallpaperStyle = () => {
  const url = customWallpaper.value || DEFAULT_WALLPAPER
  return `url('${url}') center/cover no-repeat`
}

const handleHomeClick = () => {
  if (currentApp.value) {
    currentApp.value = null
  } else {
    // 再次点击Home键退出手机
    emit('close')
  }
}
</script>

<template>
  <div class="phone-overlay" @click.self="$emit('close')">
    <div class="phone-container">
      <div class="phone-bezel">
        <!-- 侧边按钮 -->
        <div class="phone-buttons left-side">
           <div class="btn-mute"></div>
           <div class="btn-vol-up"></div>
           <div class="btn-vol-down"></div>
        </div>
        <div class="phone-buttons right-side">
           <div class="btn-power"></div>
        </div>
        <!-- 屏幕区域 -->
        <div class="phone-screen-area">
          <div class="phone-screen" :style="{ background: wallpaperStyle() }">
            <!-- 状态栏 -->
            <div class="status-bar" :class="{ 'app-active': !!currentApp }">
              <span class="time">{{ currentTime }}</span>
              <div class="notch">
                <div class="camera"></div>
                <div class="speaker"></div>
              </div>
              <div class="status-icons">
                <svg class="signal" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="1" y="14" width="4" height="8" rx="1"/>
                  <rect x="7" y="10" width="4" height="12" rx="1"/>
                  <rect x="13" y="6" width="4" height="16" rx="1"/>
                  <rect x="19" y="2" width="4" height="20" rx="1"/>
                </svg>
                <svg class="wifi" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 18c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0-6c3.03 0 5.78 1.23 7.76 3.22l-2.12 2.12A7.967 7.967 0 0012 15c-2.21 0-4.21.9-5.66 2.34l-2.12-2.12A10.962 10.962 0 0112 12zm0-6c4.42 0 8.44 1.79 11.33 4.69l-2.12 2.12A12.96 12.96 0 0012 9c-3.59 0-6.85 1.46-9.21 3.81L.67 10.69A15.971 15.971 0 0112 6z"/>
                </svg>
                <div class="battery">
                  <div class="battery-body">
                    <div class="battery-level"></div>
                  </div>
                  <div class="battery-cap"></div>
                </div>
              </div>
            </div>
            
            <!-- 应用容器 - 使用 Flexbox 让内容正确填充 -->
            <div class="screen-content">
              <!-- 应用内容 -->
              <transition name="app-scale">
                <div v-if="currentApp === 'social'" class="app-container">
                  <SocialApp @close="currentApp = null" />
                </div>
                <div v-else-if="currentApp === 'calendar'" class="app-container calendar-app-container">
                  <CalendarApp />
                </div>
                <div v-else-if="currentApp === 'weather'" class="app-container weather-app-container">
                  <WeatherApp />
                </div>
                <div v-else-if="currentApp === 'delivery'" class="app-container delivery-app-container">
                  <DeliveryApp @close="currentApp = null" />
                </div>
                <div v-else-if="currentApp === 'schedule'" class="app-container schedule-app-container">
                  <ScheduleApp />
                </div>
                <div v-else-if="currentApp === 'parttime'" class="app-container parttime-app-container">
                  <PartTimeJobApp @close="currentApp = null" />
                </div>
                <div v-else-if="currentApp === 'roster'" class="app-container roster-app-container">
                  <RosterApp @close="currentApp = null" />
                </div>
                <div v-else-if="currentApp === 'settings'" class="app-container settings-app">
                  <!-- 设置页面 -->
                  <div class="settings-header">
                    <button class="back-btn" @click="currentApp = null">‹</button>
                    <span class="settings-title">设置</span>
                    <div class="header-spacer"></div>
                  </div>
                  <div class="settings-content">
                    <div class="settings-section">
                      <h3 class="section-title">壁纸</h3>
                      <div class="wallpaper-preview">
                        <img v-if="customWallpaper" :src="customWallpaper" alt="当前壁纸" />
                        <img v-else :src="DEFAULT_WALLPAPER" alt="默认壁纸" />
                      </div>
                      <div class="wallpaper-actions">
                        <input 
                          type="file" 
                          ref="fileInputRef" 
                          accept="image/*" 
                          @change="handleWallpaperUpload" 
                          style="display: none;"
                        />
                        <button class="action-btn primary" @click="triggerFileInput">
                          📷 选择图片
                        </button>
                        <button 
                          class="action-btn secondary" 
                          @click="resetWallpaper"
                          :disabled="!customWallpaper"
                        >
                          🔄 恢复默认
                        </button>
                      </div>
                      <p class="hint">支持 JPG/PNG，最大 2MB</p>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">通用设置</h3>
                      <div class="setting-item">
                        <span class="setting-label">流式传输</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.streamResponse" @change="gameStore.saveToStorage()">
                          <span class="slider"></span>
                        </label>
                      </div>
                      <p class="hint">开启打字机效果，实时显示 AI 生成内容</p>

                      <div class="setting-item" style="margin-top: 15px;">
                        <span class="setting-label">回车发送消息</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.enterToSend" @change="gameStore.saveToStorage()">
                          <span class="slider"></span>
                        </label>
                      </div>
                      <p class="hint">关闭后需要点击发送按钮发送</p>
                      
                      <div class="setting-item" style="margin-top: 15px;">
                        <span class="setting-label">建议回复</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.suggestedReplies" @change="gameStore.saveToStorage()">
                          <span class="slider"></span>
                        </label>
                      </div>
                      <p class="hint">在 AI 回复后生成 3-4 个建议回复选项</p>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">社交设置</h3>
                      <div class="setting-item">
                        <span class="setting-label">保留消息条数</span>
                        <span class="setting-value">{{ gameStore.settings.socialHistoryLimit }}</span>
                      </div>
                      <div class="slider-container">
                        <input 
                          type="range" 
                          v-model.number="gameStore.settings.socialHistoryLimit" 
                          min="10" 
                          max="100" 
                          step="5"
                          @change="gameStore.saveToStorage()"
                          class="setting-slider"
                        />
                      </div>
                      <p class="hint">控制存入世界书的消息数量，影响 AI 记忆</p>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">正文提取设置</h3>
                      <div class="tags-container">
                        <div v-for="tag in gameStore.settings.customContentTags" :key="tag" class="tag-item">
                          <span class="tag-text"><{{ tag }}></span>
                          <button class="tag-delete-btn" @click="removeContentTag(tag)" v-if="tag !== 'content' || gameStore.settings.customContentTags.length > 1">×</button>
                        </div>
                      </div>
                      <div class="add-tag-row">
                        <input 
                          type="text" 
                          v-model="newContentTag" 
                          placeholder="输入标签名..." 
                          class="text-input"
                          @keyup.enter="addContentTag"
                        >
                        <button class="action-btn primary small-btn" @click="addContentTag">添加</button>
                      </div>
                      <p class="hint" style="margin-top: 8px;">
                        系统将只显示被以上标签包裹的内容（支持流式输出）。
                      </p>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">论坛设置</h3>
                      <div class="setting-item">
                        <span class="setting-label">世界书帖子数量</span>
                        <span class="setting-value">{{ gameStore.settings.forumWorldbookLimit }}</span>
                      </div>
                      <div class="slider-container">
                        <input 
                          type="range" 
                          v-model.number="gameStore.settings.forumWorldbookLimit" 
                          min="5" 
                          max="50" 
                          step="5"
                          @change="gameStore.saveToStorage()"
                          class="setting-slider"
                        />
                      </div>
                      <p class="hint">控制存入世界书的论坛帖子数量（节省 AI Token）</p>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">变量解析助手 (Assistant AI)</h3>
                      <div class="setting-item">
                        <span class="setting-label">启用助手</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.assistantAI.enabled" @change="() => {
                            gameStore.saveToStorage()
                            setVariableParsingWorldbookStatus(!gameStore.settings.assistantAI.enabled)
                          }">
                          <span class="slider"></span>
                        </label>
                      </div>
                      
                      <div v-if="gameStore.settings.assistantAI.enabled" class="assistant-settings">
                        <div class="input-row">
                          <label>API 地址</label>
                          <input type="text" v-model="gameStore.settings.assistantAI.apiUrl" placeholder="例如: https://api.openai.com/v1" @change="gameStore.saveToStorage()">
                        </div>
                        <div class="input-row">
                          <label>API Key</label>
                          <input type="password" v-model="gameStore.settings.assistantAI.apiKey" placeholder="sk-..." @change="gameStore.saveToStorage()">
                        </div>
                        <div class="input-row">
                          <label>模型</label>
                          <div class="model-select">
                            <input type="text" v-model="gameStore.settings.assistantAI.model" placeholder="gpt-3.5-turbo" @change="gameStore.saveToStorage()">
                            <button class="action-btn secondary small-btn" @click="loadModels" :disabled="isLoadingModels">
                              {{ isLoadingModels ? '...' : '拉取' }}
                            </button>
                          </div>
                        </div>
                        <div v-if="modelList.length > 0" class="model-list-hint">
                          <select v-model="gameStore.settings.assistantAI.model" @change="gameStore.saveToStorage()">
                            <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.id }}</option>
                          </select>
                        </div>
                        <div class="input-row">
                          <label>温度: {{ gameStore.settings.assistantAI.temperature }}</label>
                          <div class="slider-container">
                            <input 
                              type="range" 
                              v-model.number="gameStore.settings.assistantAI.temperature" 
                              min="0" 
                              max="2" 
                              step="0.05"
                              @change="gameStore.saveToStorage()"
                              class="setting-slider"
                            >
                          </div>
                        </div>
                        <p class="hint">助手AI将负责解析正文中的变量变化，减轻主AI负担。</p>
                      </div>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">独立生图</h3>
                      <div class="setting-item">
                        <span class="setting-label">启用独立生图</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.independentImageGeneration" @change="gameStore.saveToStorage()">
                          <span class="slider"></span>
                        </label>
                      </div>
                      <p class="hint" style="margin-bottom: 10px;">
                        由辅助AI自动识别剧情并生成插图 (需要启用变量解析助手)
                      </p>
                      
                      <div v-if="gameStore.settings.independentImageGeneration" class="assistant-settings">
                        <div class="input-row">
                          <label>画风/质量提示词</label>
                          <input 
                            type="text" 
                            v-model="gameStore.settings.imageGenerationPrompt" 
                            placeholder="例如: masterpiece, anime style" 
                            @change="gameStore.saveToStorage()"
                          >
                        </div>
                        <p class="hint">这些词会自动添加到每次生图请求中。</p>

                        <div class="input-row">
                          <label>生图上下文层数: {{ gameStore.settings.imageContextDepth || 0 }}</label>
                          <div class="slider-container">
                            <input 
                              type="range" 
                              v-model.number="gameStore.settings.imageContextDepth" 
                              min="0" 
                              max="10" 
                              step="1"
                              @change="gameStore.saveToStorage()"
                              class="setting-slider"
                            >
                          </div>
                        </div>
                        <p class="hint">发送给生图AI的历史对话数量。</p>

                        <div class="input-row" style="margin-top: 10px;">
                          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <label>系统指令 (高级)</label>
                            <button class="text-btn" @click="resetImageSystemPrompt" v-if="gameStore.settings.customImageAnalysisPrompt">恢复默认</button>
                          </div>
                          <textarea 
                            v-model="gameStore.settings.customImageAnalysisPrompt" 
                            class="prompt-textarea"
                            :placeholder="IMAGE_ANALYSIS_PROMPT"
                            @change="gameStore.saveToStorage()"
                          ></textarea>
                        </div>
                        <p class="hint">控制生图AI的识别逻辑。留空则使用默认指令。</p>
                      </div>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">剧情总结系统</h3>
                      
                      <div class="setting-item">
                        <span class="setting-label">启用总结系统</span>
                        <label class="switch">
                          <input type="checkbox" v-model="gameStore.settings.summarySystem.enabled" @change="gameStore.saveToStorage()">
                          <span class="slider"></span>
                        </label>
                      </div>

                      <div v-if="gameStore.settings.summarySystem.enabled">
                        <div class="setting-item">
                          <span class="setting-label">小总结起始楼层</span>
                          <span class="setting-value">{{ gameStore.settings.summarySystem.minorSummaryStartFloor }}</span>
                        </div>
                        <div class="slider-container">
                          <input 
                            type="range" 
                            v-model.number="gameStore.settings.summarySystem.minorSummaryStartFloor" 
                            min="5" 
                            max="50" 
                            step="1"
                            @change="gameStore.saveToStorage()"
                            class="setting-slider"
                          />
                        </div>

                        <div class="setting-item">
                          <span class="setting-label">大总结起始楼层</span>
                          <span class="setting-value">{{ gameStore.settings.summarySystem.majorSummaryStartFloor }}</span>
                        </div>
                        <div class="slider-container">
                          <input 
                            type="range" 
                            v-model.number="gameStore.settings.summarySystem.majorSummaryStartFloor" 
                            min="20" 
                            max="100" 
                            step="5"
                            @change="gameStore.saveToStorage()"
                            class="setting-slider"
                          />
                        </div>


                        <div class="setting-item">
                          <span class="setting-label">大总结触发阈值</span>
                          <span class="setting-value">{{ gameStore.settings.summarySystem.minorCountForMajor }}个小总结</span>
                        </div>
                        <div class="slider-container">
                          <input 
                            type="range" 
                            v-model.number="gameStore.settings.summarySystem.minorCountForMajor" 
                            min="3" 
                            max="10" 
                            step="1"
                            @change="gameStore.saveToStorage()"
                            class="setting-slider"
                          />
                        </div>

                        <div class="setting-item">
                          <span class="setting-label">超级总结触发阈值</span>
                          <span class="setting-value">{{ gameStore.settings.summarySystem.majorCountForSuper }}个大总结</span>
                        </div>
                        <div class="slider-container">
                          <input 
                            type="range" 
                            v-model.number="gameStore.settings.summarySystem.majorCountForSuper" 
                            min="2" 
                            max="5" 
                            step="1"
                            @change="gameStore.saveToStorage()"
                            class="setting-slider"
                          />
                        </div>
                        
                        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                          <button class="action-btn primary" style="width: 100%;" @click="showSummaryViewer = true">
                            📋 查看/修改总结
                          </button>
                          <button class="action-btn secondary" style="width: 100%;" @click="showBatchModal = true">
                            🤖 批量补齐总结
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="settings-section">
                      <h3 class="section-title">制作名单</h3>
                      <div class="credits-body">
                        <p>原作者：墨沈</p>
                        <p>重置：Elyrene</p>
                        <p>版本号 V1.0fix</p>
                        <p>免费发布于DC类脑社区</p>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 总结查看器覆盖层 -->
                  <transition name="app-scale">
                    <SummaryViewer v-if="showSummaryViewer" @close="showSummaryViewer = false" />
                  </transition>

                  <!-- 批量生成模态框 -->
                  <div v-if="showBatchModal" class="batch-modal-overlay">
                    <div class="batch-modal">
                      <div class="batch-modal-header">
                        <span>🤖 批量补齐总结</span>
                        <button class="batch-close-btn" @click="showBatchModal = false" v-if="!isBatchProcessing">×</button>
                      </div>
                      <div class="batch-modal-body">
                        <p class="batch-description">
                          将自动扫描缺失总结的楼层，并调用辅助AI分批生成大总结。
                          <br>注意：此操作可能会消耗大量 Token。
                        </p>
                        
                        <div v-if="!isBatchProcessing">
                          <div class="setting-item">
                            <span class="setting-label">每批处理层数</span>
                            <select v-model="batchSize" class="batch-select">
                              <option :value="5">5层</option>
                              <option :value="10">10层</option>
                              <option :value="20">20层</option>
                              <option :value="50">50层</option>
                            </select>
                          </div>
                          
                          <div style="margin-top: 20px; display: flex; gap: 10px;">
                            <button class="action-btn secondary" style="flex: 1;" @click="showBatchModal = false">取消</button>
                            <button class="action-btn primary" style="flex: 1;" @click="startBatchGeneration">开始生成</button>
                          </div>
                        </div>

                        <div v-else style="text-align: center; padding: 20px 0;">
                          <div class="setting-label" style="margin-bottom: 10px;">
                            正在处理... ({{ batchProgress.current }} / {{ batchProgress.total }})
                          </div>
                          <div class="batch-progress-bar">
                            <div 
                              class="batch-progress-fill"
                              :style="{ width: batchProgress.total ? (batchProgress.current / batchProgress.total * 100) + '%' : '0%' }"
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>

              <!-- 主屏幕 -->
              <div v-show="!currentApp" class="home-screen">
                <div class="app-grid">
                  <div 
                    v-for="app in apps" 
                    :key="app.id" 
                    class="app-item"
                    @click="handleAppClick(app.id)"
                  >
                    <div class="app-icon" :style="{ background: app.color }">
                      {{ app.icon }}
                      <div v-if="app.id === 'social' && totalUnreadCount > 0" class="notification-badge">
                        {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
                      </div>
                    </div>
                    <span class="app-name">{{ app.name }}</span>
                  </div>
                </div>

                <!-- Dock 栏 -->
                <div class="dock-bar">
                  <div class="dock-bg"></div>
                  <div class="dock-icons">
                    <div class="dock-item" @click="handleAppClick('social')">
                      <div class="app-icon" style="background: linear-gradient(135deg, #07c160 0%, #1aad19 100%)">
                        💬
                        <div v-if="totalUnreadCount > 0" class="notification-badge">
                          {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
                        </div>
                      </div>
                    </div>
                    <div class="dock-item" @click="handleAppClick('map')">
                      <div class="app-icon" style="background: linear-gradient(135deg, #34c759 0%, #30b94d 100%)">🗺️</div>
                    </div>
                    <div class="dock-item" @click="handleAppClick('save')">
                      <div class="app-icon" style="background: linear-gradient(135deg, #5ac8fa 0%, #32ade6 100%)">💾</div>
                    </div>
                    <div class="dock-item" @click="handleAppClick('settings')">
                      <div class="app-icon" style="background: linear-gradient(135deg, #8e8e93 0%, #636366 100%)">⚙️</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 实体 Home 按钮区域 -->
        <div class="phone-chin">
          <button class="home-button" @click="handleHomeClick">
            <div class="home-icon"></div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.phone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.phone-container {
  width: 340px;
  height: 700px;
  position: relative;
  animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from { 
    transform: translateY(80px) scale(0.95); 
    opacity: 0; 
  }
  to { 
    transform: translateY(0) scale(1); 
    opacity: 1; 
  }
}

.phone-bezel {
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, #2c2c2e 0%, #1c1c1e 50%, #2c2c2e 100%);
  border-radius: 48px;
  padding: 12px;
  box-shadow: 
    inset 0 0 0 1px rgba(255,255,255,0.1),
    inset 0 1px 0 rgba(255,255,255,0.15),
    0 0 0 1px rgba(0,0,0,0.5),
    0 25px 60px rgba(0,0,0,0.5),
    0 10px 20px rgba(0,0,0,0.3);
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 侧边按钮 */
.phone-buttons {
  position: absolute;
  z-index: 5;
}

.left-side {
  left: -3px;
  top: 100px;
}

.right-side {
  right: -3px;
  top: 140px;
}

.btn-mute {
  width: 3px;
  height: 24px;
  background: linear-gradient(90deg, #1c1c1e 0%, #3a3a3c 50%, #1c1c1e 100%);
  border-radius: 0 2px 2px 0;
  margin-bottom: 16px;
}

.btn-vol-up, .btn-vol-down {
  width: 3px;
  height: 44px;
  background: linear-gradient(90deg, #1c1c1e 0%, #3a3a3c 50%, #1c1c1e 100%);
  border-radius: 0 2px 2px 0;
  margin-bottom: 8px;
}

.btn-power {
  width: 3px;
  height: 64px;
  background: linear-gradient(90deg, #1c1c1e 0%, #3a3a3c 50%, #1c1c1e 100%);
  border-radius: 2px 0 0 2px;
}

/* 屏幕区域 */
.phone-screen-area {
  width: 100%;
  flex: 1;
  background: #000;
  border-radius: 36px;
  overflow: hidden;
  position: relative;
  box-shadow: 
    inset 0 0 0 1px rgba(255,255,255,0.05),
    0 0 1px rgba(0,0,0,0.8);
}

.phone-screen {
  width: 100%;
  height: 100%;
  background: url('https://files.catbox.moe/kxz1kx.jpg') center/cover no-repeat;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 壁纸遮罩 */
.phone-screen::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 100%);
  pointer-events: none;
  z-index: 0;
}

/* 状态栏 */
.status-bar {
  height: 44px;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  z-index: 20;
  position: relative;
  flex-shrink: 0;
  transition: background-color 0.3s, color 0.3s;
}

.status-bar.app-active {
  background-color: rgba(237, 237, 237, 0.95); /* 适配应用头部颜色 */
  color: #000; /* 深色文字 */
}

/* 在应用激活时反转状态栏图标颜色 */
.status-bar.app-active .signal,
.status-bar.app-active .wifi {
  filter: none;
}

.status-bar.app-active .battery-body {
  border-color: rgba(0,0,0,0.35);
}

.status-bar.app-active .battery-level {
  background-color: #000;
}

.status-bar.app-active .battery-cap {
  background-color: rgba(0,0,0,0.35);
}

.time {
  width: 54px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* 刘海 */
.notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 28px;
  background: #000;
  border-radius: 0 0 18px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 4px;
}

.camera {
  width: 10px;
  height: 10px;
  background: radial-gradient(circle at 30% 30%, #3a3a3c, #1c1c1e);
  border-radius: 50%;
  box-shadow: 
    inset 0 0 2px rgba(0,0,0,0.8),
    0 0 0 1px rgba(255,255,255,0.1);
}

.speaker {
  width: 40px;
  height: 4px;
  background: #2c2c2e;
  border-radius: 2px;
}

.status-icons {
  display: flex;
  gap: 5px;
  align-items: center;
  width: 54px;
  justify-content: flex-end;
}

.signal, .wifi {
  width: 16px;
  height: 16px;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5));
}

.battery {
  display: flex;
  align-items: center;
  gap: 1px;
}

.battery-body {
  width: 22px;
  height: 10px;
  border: 1.5px solid rgba(255,255,255,0.9);
  border-radius: 3px;
  padding: 1px;
  display: flex;
  align-items: stretch;
}

.battery-level {
  flex: 0.75;
  background: #fff;
  border-radius: 1px;
}

.battery-cap {
  width: 2px;
  height: 5px;
  background: rgba(255,255,255,0.9);
  border-radius: 0 1px 1px 0;
}

/* 屏幕内容区域 */
.screen-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  z-index: 5;
  display: flex;
  flex-direction: column;
}

/* 应用容器 - 完全填充 */
.app-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background: #fff;
  border-radius: 0;
}

/* 主屏幕 */
.home-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.app-grid {
  flex: 1;
  padding: 0 20px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: min-content;
  gap: 24px 16px;
  align-content: start;
}

.app-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.1s;
}

.app-item:active {
  transform: scale(0.9);
}

.app-item:active .app-icon {
  filter: brightness(0.85);
}

.app-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  box-shadow: 
    0 4px 12px rgba(0,0,0,0.2),
    inset 0 1px 0 rgba(255,255,255,0.2);
  color: #fff;
  transition: filter 0.15s, transform 0.1s;
  position: relative;
}

.notification-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: #ff3b30;
  color: white;
  font-size: 12px;
  height: 20px;
  min-width: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  z-index: 10;
  font-weight: bold;
  box-sizing: border-box;
  border: 1.5px solid #fff;
}

.app-name {
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  font-weight: 500;
  text-align: center;
}

/* Dock 栏 */
.dock-bar {
  height: 88px;
  padding: 0 12px 8px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
  margin-top: auto;
}

.dock-bg {
  position: absolute;
  bottom: 8px;
  left: 12px;
  right: 12px;
  height: 76px;
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 22px;
  box-shadow: 
    inset 0 0 0 0.5px rgba(255,255,255,0.3),
    0 2px 10px rgba(0,0,0,0.1);
}

.dock-icons {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  position: relative;
  z-index: 1;
}

.dock-item {
  cursor: pointer;
  transition: transform 0.1s;
}

.dock-item:active {
  transform: scale(0.9);
}

.dock-item .app-icon {
  width: 52px;
  height: 52px;
  font-size: 26px;
  border-radius: 12px;
}

/* 底部 Home 按钮区域 */
.phone-chin {
  height: 52px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.home-button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(145deg, #2c2c2e 0%, #1c1c1e 100%);
  border: 2px solid #3a3a3c;
  cursor: pointer;
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 2px 4px rgba(0,0,0,0.3);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.home-icon {
  width: 16px;
  height: 16px;
  border: 2px solid #636366;
  border-radius: 4px;
  transition: border-color 0.15s;
}

.home-button:hover .home-icon {
  border-color: #8e8e93;
}

.home-button:active {
  transform: scale(0.95);
  background: linear-gradient(145deg, #1c1c1e 0%, #2c2c2e 100%);
}

.home-button:active .home-icon {
  border-color: #aeaeb2;
}

/* 应用动画 */
.app-scale-enter-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.app-scale-leave-active {
  transition: all 0.25s ease-in;
}

.app-scale-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.app-scale-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* 设置页面样式 */
.settings-app {
  background: #f2f2f7;
  display: flex;
  flex-direction: column;
}

.settings-header {
  height: 44px;
  background: rgba(237, 237, 237, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #007aff;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
}

.settings-title {
  font-size: 17px;
  font-weight: 600;
  color: #000;
}

.header-spacer {
  width: 30px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
}

.settings-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  margin-bottom: 20px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 15px;
}

.setting-label {
  color: #000;
}

.setting-value {
  color: #8e8e93;
}

.slider-container {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.setting-slider {
  width: 100%;
  accent-color: #007aff;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #8e8e93;
  text-transform: uppercase;
  margin: 0 0 12px 0;
}

.wallpaper-preview {
  width: 100%;
  height: 160px;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
  background: #f0f0f0;
}

.wallpaper-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wallpaper-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.action-btn {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.action-btn:active {
  opacity: 0.7;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: #007aff;
  color: #fff;
}

.action-btn.secondary {
  background: #e5e5ea;
  color: #000;
}

.small-btn {
  padding: 4px 8px;
  font-size: 12px;
  min-width: 50px;
}

.assistant-settings {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-row label {
  font-size: 13px;
  color: #000;
}

.input-row input[type="text"],
.input-row input[type="password"] {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f2f2f7;
  font-size: 14px;
  box-sizing: border-box;
}

.model-select {
  display: flex;
  gap: 8px;
}

.model-select input {
  flex: 1;
}

.model-list-hint select {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f2f2f7;
  font-size: 14px;
}

.hint {
  font-size: 12px;
  color: #8e8e93;
  margin: 0;
  text-align: center;
}

/* 标签管理样式 */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 122, 255, 0.1);
  border: 1px solid rgba(0, 122, 255, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
  color: #007aff;
  font-family: monospace;
  font-size: 0.85rem;
}

.tag-delete-btn {
  background: none;
  border: none;
  color: #007aff;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  opacity: 0.6;
}

.tag-delete-btn:hover {
  opacity: 1;
  color: #ff3b30;
}

.add-tag-row {
  display: flex;
  gap: 8px;
}

.add-tag-row .text-input {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f2f2f7;
  font-size: 14px;
  outline: none;
}

.credits-body {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8e8e93;
  padding: 10px 0;
}

.credits-body p {
  margin: 0;
  font-size: 0.9rem;
}

.prompt-textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f2f2f7;
  font-size: 12px;
  font-family: monospace;
  box-sizing: border-box;
  resize: vertical;
  line-height: 1.3;
}

.text-btn {
  background: none;
  border: none;
  color: #007aff;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.dark-mode .prompt-textarea {
  background: #2c2c2e;
  border-color: #3a3a3c;
  color: #fff;
}

.dark-mode .text-btn {
  color: #0a84ff;
}

/* 批量生成模态框样式 */
.batch-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.batch-modal {
  width: 90%;
  max-width: 280px;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.batch-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #f2f2f7;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
  font-weight: 600;
  font-size: 15px;
}

.batch-close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #8e8e93;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.batch-modal-body {
  padding: 16px;
}

.batch-description {
  font-size: 13px;
  color: #8e8e93;
  margin: 0 0 16px 0;
  line-height: 1.4;
  text-align: center;
}

.batch-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f2f2f7;
  font-size: 14px;
  min-width: 80px;
}

.batch-progress-bar {
  width: 100%;
  height: 6px;
  background: #e5e5ea;
  border-radius: 3px;
  overflow: hidden;
}

.batch-progress-fill {
  height: 100%;
  background: #007aff;
  transition: width 0.3s ease;
}
</style>
