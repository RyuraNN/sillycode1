<script setup>
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { fetchModels, IMAGE_ANALYSIS_PROMPT } from '../utils/assistantAI'
import { generateBatchSummaries } from '../utils/summaryManager'
import SummaryViewer from './SummaryViewer.vue'

defineEmits(['back'])

const gameStore = useGameStore()
const modelList = ref([])
const isLoadingModels = ref(false)
const newContentTag = ref('')
const showSummaryViewer = ref(false)
const showBatchModal = ref(false)
const batchSize = ref(10)
const isBatchProcessing = ref(false)
const batchProgress = ref({ current: 0, total: 0 })
const debugClicks = ref(0)
let debugClickTimer = null

// 重置生图系统提示词
const resetImageSystemPrompt = () => {
  if (confirm('确定要重置生图系统指令为默认值吗？')) {
    gameStore.settings.customImageAnalysisPrompt = ''
    gameStore.saveToStorage()
  }
}

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

const handleCreditsClick = () => {
  if (gameStore.settings.debugUnlocked) return

  debugClicks.value++
  
  if (debugClickTimer) clearTimeout(debugClickTimer)
  
  // 2秒内没有继续点击则重置
  debugClickTimer = setTimeout(() => {
    debugClicks.value = 0
  }, 2000)

  if (debugClicks.value >= 10) {
    gameStore.settings.debugUnlocked = true
    gameStore.settings.debugMode = true
    gameStore.saveToStorage()
    // 可以加一个简单的提示，或者静默开启
    console.log('Debug mode unlocked!')
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
</script>

<template>
  <div class="settings-overlay">
    <div class="settings-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <button class="back-btn" @click="$emit('back')">
          <span class="back-icon">←</span>
        </button>
        <h2 class="panel-title">游戏设置</h2>
        <div class="header-spacer"></div>
      </div>

      <!-- 内容区 -->
      <div class="panel-content">
        <!-- 基础设置卡片 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">💬</span>
            <h3 class="card-title">消息设置</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">流式传输</span>
                <span class="setting-hint">开启打字机效果，实时显示 AI 生成内容</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.streamResponse" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">回车发送消息</span>
                <span class="setting-hint">关闭后需要点击发送按钮发送</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.enterToSend" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">建议回复</span>
                <span class="setting-hint">在 AI 回复后生成 3-4 个建议回复选项</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.suggestedReplies" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">社交消息保留条数</span>
                <span class="setting-hint">控制存入世界书的消息数量，影响 AI 上下文记忆</span>
              </div>
              <div class="setting-control">
                <input 
                  type="range" 
                  v-model.number="gameStore.settings.socialHistoryLimit" 
                  min="10" 
                  max="100" 
                  step="5"
                  class="range-slider"
                  @change="gameStore.saveToStorage()"
                >
                <span class="range-value">{{ gameStore.settings.socialHistoryLimit }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">消息快照保留层数</span>
                <span class="setting-hint">控制保留游戏状态快照的消息数量（用于撤回）。减少层数可显著降低内存占用和卡顿。</span>
              </div>
              <div class="setting-control">
                <input 
                  type="range" 
                  v-model.number="gameStore.settings.snapshotLimit" 
                  min="2" 
                  max="50" 
                  step="1"
                  class="range-slider"
                  @change="gameStore.saveToStorage()"
                >
                <span class="range-value">{{ gameStore.settings.snapshotLimit || 10 }}</span>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">快照模式</span>
                <span class="setting-hint">增量模式只记录变化，大幅降低内存占用（推荐长期游戏使用）</span>
              </div>
              <div class="setting-control">
                <select 
                  v-model="gameStore.settings.snapshotMode" 
                  class="model-select"
                  style="width: 100px;"
                  @change="gameStore.saveToStorage()"
                >
                  <option value="delta">增量模式</option>
                  <option value="full">完整模式</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- 正文提取设置 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">📝</span>
            <h3 class="card-title">正文提取设置</h3>
          </div>
          <div class="card-body">
            <p class="card-description">
              系统将只显示被以下标签包裹的内容（支持流式输出）。<br>
              添加时只需输入标签名（如 story），系统会自动识别 <story>...</story>。
            </p>
            
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
              <button class="add-btn-small" @click="addContentTag">添加</button>
            </div>
          </div>
        </div>

        <!-- 论坛设置 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">🌐</span>
            <h3 class="card-title">论坛设置</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">世界书帖子数量</span>
                <span class="setting-hint">控制存入世界书的论坛帖子数量（节省 AI Token）</span>
              </div>
              <div class="setting-control">
                <input 
                  type="range" 
                  v-model.number="gameStore.settings.forumWorldbookLimit" 
                  min="5" 
                  max="50" 
                  step="5"
                  class="range-slider"
                  @change="gameStore.saveToStorage()"
                >
                <span class="range-value">{{ gameStore.settings.forumWorldbookLimit }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 剧情总结系统 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">📚</span>
            <h3 class="card-title">剧情总结系统</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">启用总结系统</span>
                <span class="setting-hint">自动将旧剧情合并为摘要，节省上下文并保持记忆</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.summarySystem.enabled" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <transition name="expand">
              <div v-if="gameStore.settings.summarySystem.enabled" class="sub-settings">
                <div class="setting-row">
                  <div class="setting-info">
                    <span class="setting-label">原文保留层数</span>
                    <span class="setting-hint">最近 N 层保持原文，超过则使用小总结</span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.summarySystem.minorSummaryStartFloor" 
                      min="5" 
                      max="50" 
                      step="1"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.summarySystem.minorSummaryStartFloor }}</span>
                  </div>
                </div>

                <div class="setting-row">
                  <div class="setting-info">
                    <span class="setting-label">小总结保留层数</span>
                    <span class="setting-hint">最近 N 层使用小总结，超过则使用大/超级总结</span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.summarySystem.majorSummaryStartFloor" 
                      min="20" 
                      max="100" 
                      step="5"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.summarySystem.majorSummaryStartFloor }}</span>
                  </div>
                </div>

                <div class="setting-row">
                  <div class="setting-info">
                    <span class="setting-label">大总结触发阈值 (小总结数)</span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.summarySystem.minorCountForMajor" 
                      min="3" 
                      max="10" 
                      step="1"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.summarySystem.minorCountForMajor }}</span>
                  </div>
                </div>

                <div class="setting-row">
                  <div class="setting-info">
                    <span class="setting-label">超级总结触发阈值 (大总结数)</span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.summarySystem.majorCountForSuper" 
                      min="2" 
                      max="5" 
                      step="1"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.summarySystem.majorCountForSuper }}</span>
                  </div>
                </div>

              </div>
            </transition>
          </div>
        </div>

        <!-- 辅助AI卡片 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">🤖</span>
            <h3 class="card-title">变量解析助手</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">启用助手</span>
                <span class="setting-hint">助手AI将负责解析正文中的变量变化，减轻主AI负担</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.assistantAI.enabled" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <transition name="expand">
              <div v-if="gameStore.settings.assistantAI.enabled" class="sub-settings">
                <div class="input-group">
                  <label class="input-label">API 地址</label>
                  <input 
                    type="text" 
                    v-model="gameStore.settings.assistantAI.apiUrl" 
                    placeholder="例如: https://api.openai.com/v1" 
                    class="text-input"
                    @change="gameStore.saveToStorage()"
                  >
                </div>

                <div class="input-group">
                  <label class="input-label">API Key</label>
                  <input 
                    type="password" 
                    v-model="gameStore.settings.assistantAI.apiKey" 
                    placeholder="sk-..." 
                    class="text-input"
                    @change="gameStore.saveToStorage()"
                  >
                </div>

                <div class="input-group">
                  <label class="input-label">模型</label>
                  <div class="model-input-row">
                    <input 
                      type="text" 
                      v-model="gameStore.settings.assistantAI.model" 
                      placeholder="gpt-3.5-turbo" 
                      class="text-input flex-1"
                      @change="gameStore.saveToStorage()"
                    >
                    <button class="fetch-btn" @click="loadModels" :disabled="isLoadingModels">
                      {{ isLoadingModels ? '加载中...' : '拉取列表' }}
                    </button>
                  </div>
                  <select 
                    v-if="modelList.length > 0" 
                    v-model="gameStore.settings.assistantAI.model" 
                    class="model-select"
                    @change="gameStore.saveToStorage()"
                  >
                    <option v-for="m in modelList" :key="m.id" :value="m.id">{{ m.id }}</option>
                  </select>
                </div>

                <div class="input-group">
                  <label class="input-label">温度 (Temperature)</label>
                  <div class="range-row">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.assistantAI.temperature" 
                      min="0" 
                      max="2" 
                      step="0.05"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.assistantAI.temperature.toFixed(2) }}</span>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>

        <!-- 生图设置卡片 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">🎨</span>
            <h3 class="card-title">独立生图</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">启用独立生图</span>
                <span class="setting-hint">由辅助AI自动识别剧情并生成插图 (需要启用变量解析助手)</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.independentImageGeneration" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <transition name="expand">
              <div v-if="gameStore.settings.independentImageGeneration" class="sub-settings">
                <div class="input-group">
                  <label class="input-label">画风/质量提示词 (可选)</label>
                  <input 
                    type="text" 
                    v-model="gameStore.settings.imageGenerationPrompt" 
                    placeholder="例如: masterpiece, best quality, anime style" 
                    class="text-input"
                    @change="gameStore.saveToStorage()"
                  >
                  <p class="setting-hint" style="margin-top: 5px;">
                    这些词会自动添加到每次生图请求中。
                  </p>
                </div>

                <div class="input-group">
                  <label class="input-label">生图上下文层数: {{ gameStore.settings.imageContextDepth || 0 }}</label>
                  <div class="range-row">
                    <input 
                      type="range" 
                      v-model.number="gameStore.settings.imageContextDepth" 
                      min="0" 
                      max="10" 
                      step="1"
                      class="range-slider"
                      @change="gameStore.saveToStorage()"
                    >
                    <span class="range-value">{{ gameStore.settings.imageContextDepth || 0 }}</span>
                  </div>
                  <p class="setting-hint" style="margin-top: 5px;">
                    发送给生图AI的历史对话数量。0表示仅发送当前回复，增加上下文可提高生图准确性。
                  </p>
                </div>

                <div class="input-group">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label class="input-label">生图系统指令 (高级)</label>
                    <button class="text-btn" @click="resetImageSystemPrompt" v-if="gameStore.settings.customImageAnalysisPrompt">恢复默认</button>
                  </div>
                  <textarea 
                    v-model="gameStore.settings.customImageAnalysisPrompt" 
                    class="text-input prompt-textarea"
                    :placeholder="IMAGE_ANALYSIS_PROMPT"
                    @change="gameStore.saveToStorage()"
                  ></textarea>
                  <p class="setting-hint" style="margin-top: 5px;">
                    控制生图AI如何识别场景和提取锚点。留空则使用默认指令。
                    <br>可用占位符: {userStylePrompt}
                  </p>
                </div>
              </div>
            </transition>
          </div>
        </div>

        <!-- 制作名单 -->
        <div class="settings-card">
          <div class="card-header">
            <span class="card-icon">👥</span>
            <h3 class="card-title">制作名单</h3>
          </div>
          <div class="card-body credits-body">
            <p>原作者：墨沈</p>
            <p @click="handleCreditsClick" style="cursor: pointer; user-select: none;">重置：Elyrene</p>
            <p>版本号 V2.0fix</p>
            <p>免费发布于DC类脑社区</p>
          </div>
        </div>

        <!-- Debug 设置 (隐蔽) -->
        <div v-if="gameStore.settings.debugUnlocked" class="settings-card" style="border-color: rgba(255, 99, 71, 0.5);">
          <div class="card-header" style="background: rgba(255, 99, 71, 0.1);">
            <span class="card-icon">🐛</span>
            <h3 class="card-title" style="color: #ff6347;">开发者模式</h3>
          </div>
          <div class="card-body">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">启用 Debug 模式</span>
                <span class="setting-hint">显示原始指令、变量监视器和辅助 AI 输出</span>
              </div>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input type="checkbox" v-model="gameStore.settings.debugMode" @change="gameStore.saveToStorage()">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- 总结查看器覆盖层 -->
  <transition name="fade">
    <div v-if="showSummaryViewer" class="summary-overlay-container">
      <SummaryViewer @close="showSummaryViewer = false" />
    </div>
  </transition>

  <!-- 批量生成模态框 -->
  <div v-if="showBatchModal" class="summary-overlay-container">
    <div class="settings-card" style="width: 90%; max-width: 400px; background: #2d2d35; border: 1px solid rgba(255,255,255,0.1);">
      <div class="card-header">
        <span class="card-icon">🤖</span>
        <h3 class="card-title">批量补齐总结</h3>
      </div>
      <div class="card-body">
        <p class="card-description">
          将自动扫描缺失总结的楼层，并调用辅助AI分批生成大总结。
          <br>注意：此操作可能会消耗大量 Token。
        </p>
        
        <div v-if="!isBatchProcessing">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">每批处理层数</span>
            </div>
            <div class="setting-control">
              <select v-model="batchSize" class="model-select" style="width: 80px;">
                <option :value="5">5层</option>
                <option :value="10">10层</option>
                <option :value="20">20层</option>
                <option :value="50">50层</option>
              </select>
            </div>
          </div>
          
          <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button class="add-btn secondary" style="flex: 1;" @click="showBatchModal = false">取消</button>
            <button class="add-btn" style="flex: 1;" @click="startBatchGeneration">开始生成</button>
          </div>
        </div>

        <div v-else style="text-align: center; padding: 20px;">
          <div class="setting-label" style="margin-bottom: 10px;">
            正在处理... ({{ batchProgress.current }} / {{ batchProgress.total }})
          </div>
          <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
            <div 
              style="height: 100%; background: #667eea; transition: width 0.3s;"
              :style="{ width: batchProgress.total ? (batchProgress.current / batchProgress.total * 100) + '%' : '0%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-overlay-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(20, 20, 30, 0.95) 0%, rgba(40, 30, 50, 0.95) 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.settings-panel {
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  background: linear-gradient(180deg, rgba(45, 40, 55, 0.98) 0%, rgba(35, 30, 45, 0.98) 100%);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.back-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(-2px);
}

.back-icon {
  font-size: 18px;
}

.panel-title {
  font-size: 1.4rem;
  font-weight: 600;
  color: white;
  margin: 0;
  letter-spacing: 0.5px;
}

.header-spacer {
  width: 40px;
}

/* 内容区 */
.panel-content {
  flex: 1;
  min-height: 0; /* 修复 Flexbox 嵌套滚动问题 */
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

/* 设置卡片 */
.settings-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  flex-shrink: 0; /* 防止在空间不足时被挤压 */
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.card-icon {
  font-size: 1.3rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.card-body {
  padding: 16px 20px;
}

.card-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

/* 设置行 */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 0.95rem;
  color: white;
  font-weight: 500;
}

.setting-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 开关样式 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}

.toggle-switch.small {
  width: 40px;
  height: 22px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.15);
  transition: 0.3s;
  border-radius: 26px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch.small .toggle-slider:before {
  height: 16px;
  width: 16px;
}

.toggle-switch input:checked + .toggle-slider {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.toggle-switch.small input:checked + .toggle-slider:before {
  transform: translateX(18px);
}

/* 范围滑块 */
.range-slider {
  width: 120px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  outline: none;
  -webkit-appearance: none;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.range-value {
  min-width: 36px;
  text-align: center;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

/* 子设置区域 */
.sub-settings {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 输入组 */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.text-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 0.9rem;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.text-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.text-input:focus {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(0, 0, 0, 0.3);
}

.flex-1 {
  flex: 1;
}

/* 模型输入行 */
.model-input-row {
  display: flex;
  gap: 10px;
}

.fetch-btn {
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.fetch-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.fetch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.model-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: white;
  font-size: 0.9rem;
  outline: none;
  margin-top: 8px;
}

/* 范围行 */
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.range-row .range-slider {
  flex: 1;
}

/* 正则列表 */
.regex-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.regex-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.regex-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.regex-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 0.85rem;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
}

.regex-input:focus {
  border-color: rgba(102, 126, 234, 0.5);
}

.regex-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(220, 53, 69, 0.3);
  border-color: rgba(220, 53, 69, 0.5);
  color: #ff6b6b;
}

/* 标签管理 */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(102, 126, 234, 0.2);
  border: 1px solid rgba(102, 126, 234, 0.3);
  padding: 4px 10px;
  border-radius: 6px;
  color: #a5b4fc;
  font-family: monospace;
  font-size: 0.9rem;
}

.tag-delete-btn {
  background: none;
  border: none;
  color: #a5b4fc;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}

.tag-delete-btn:hover {
  opacity: 1;
  color: #ff6b6b;
}

.add-tag-row {
  display: flex;
  gap: 8px;
}

.add-btn-small {
  padding: 0 16px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
}

.add-btn-small:hover {
  opacity: 0.9;
}

/* 添加正则行 */
.add-regex-row {
  display: flex;
  gap: 10px;
}

.add-btn {
  padding: 12px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.add-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.add-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.add-btn.secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: none;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .settings-panel {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .setting-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .setting-control {
    width: 100%;
    margin-top: 10px;
  }

  .range-slider {
    flex: 1;
    width: 100%;
  }

  .model-input-row {
    flex-direction: column;
  }
}

.credits-body {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  padding: 24px;
}

.credits-body p {
  margin: 0;
  font-size: 0.95rem;
}

.prompt-textarea {
  min-height: 150px;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.4;
  resize: vertical;
}

.text-btn {
  background: none;
  border: none;
  color: #a5b4fc;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.text-btn:hover {
  color: white;
}
</style>
