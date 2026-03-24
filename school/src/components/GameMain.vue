<script setup>
/**
 * GameMain.vue - 游戏主界面
 * 重构版本：使用子组件和 Composables 进行解耦
 */

import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'

// 外部依赖
import { generateReply, generateStreaming, stopGeneration } from '../utils/stClient'
import { requestImageGeneration } from '../utils/imageGenerator'
import { parseSocialTags, extractSuggestedReplies, extractTucao } from '../utils/messageParser'
import { deleteSocialMessage, deleteMomentFromWorldbook } from '../utils/socialWorldbook'
import { optimizeWorldbook, setVariableParsingWorldbookStatus, fetchMapDataFromWorldbook, syncClassWorldbookState, setupTeacherClassEntries } from '../utils/worldbookParser'
import { callAssistantAI, callImageAnalysisAI } from '../utils/assistantAI'
import { setMapData } from '../data/mapData'
import { processPostReply, buildSummarizedHistory, extractSummary, removeThinking, removeSummariesAfterFloor } from '../utils/summaryManager'
import { getErrorMessage } from '../utils/errorUtils'

// 工具函数
import { parseGameData, applyGameData, mergeGameData, deepMerge, generateDetailedChanges } from '../utils/gameDataParser'
import { cleanSystemTags, parseInsertImageTags, insertImagesAtAnchors } from '../utils/contentCleaner'
import { formatDebugContent, parseDebugData, parseDebugTag } from '../utils/debugFormatter'

// Composables
import { useImageCache, loadImagesFromLog } from '../composables/useImageCache'
import { useScrollControl } from '../composables/useScrollControl'
import { useDanmaku } from '../composables/useDanmaku'
import { useEventCarousel } from '../composables/useEventCarousel'

// 子组件
import TimeDisplay from './TimeDisplay.vue'
import AvatarDisplay from './AvatarDisplay.vue'
import CharacterInfo from './CharacterInfo.vue'
import InventoryPanel from './InventoryPanel.vue'
import EquipmentPanel from './EquipmentPanel.vue'
import MapPanel from './MapPanel.vue'
import SavePanel from './SavePanel.vue'
import PhoneSystem from './PhoneSystem.vue'

// 新拆分的子组件
import EventBanner from './game/EventBanner.vue'
import EventIndicator from './game/EventIndicator.vue'
import DanmakuLayer from './game/DanmakuLayer.vue'
import SuggestionsPanel from './game/SuggestionsPanel.vue'
import SummaryInputModal from './game/SummaryInputModal.vue'
import WarningModal from './game/WarningModal.vue'
import MessageEditModal from './game/MessageEditModal.vue'
import ImageInteractionPanel from './game/ImageInteractionPanel.vue'
import DebugAssistantPanel from './game/DebugAssistantPanel.vue'
import VariableChangesPanel from './game/VariableChangesPanel.vue'

// 样式
import '../styles/game-main.css'

const emit = defineEmits(['back'])
const gameStore = useGameStore()

// Composables
const { imageCacheMap, queueImageLoad, saveAndCache, cleanup: cleanupImageCache } = useImageCache()
const { autoScrollEnabled, showNewMessageTip, scrollToBottom, handleNewContent, handleUserScroll, resetAutoScroll, handleNewMessageTipClick } = useScrollControl()
const { danmakuList, showDanmaku } = useDanmaku()
const { currentEvent, isBannerCollapsed } = useEventCarousel({ manageLifecycle: true })

// 基础状态
const isLeftSidebarOpen = ref(true)
const isMobile = ref(false)
const showPhone = ref(false)
const inputText = ref('')
const gameLog = ref([])
const isGenerating = ref(false)
const isAssistantProcessing = ref(false)
const processingStage = ref('') // 'rag' | 'generating' | ''
const ragErrors = ref([]) // RAG 管线错误列表
const summaryErrors = ref([]) // 小总结生成错误列表
const showMapPanel = ref(false)
const showEquipmentPanel = ref(false)
const showSavePanel = ref(false)
const savePanelMode = ref('save')
const showCommandPanel = ref(false)
const showMenu = ref(false)
const contentAreaRef = ref(null)
const textareaRef = ref(null)
const showGeminiTip = ref(false)
const hasContentWarning = ref(false)
const showWarningDetail = ref(false)

// 吐槽小剧场
const tucaoContent = ref('')
const showTucaoPanel = ref(false)

// 建议回复
const suggestedReplies = ref([])

// 图片交互面板
const showImagePanel = ref(false)
const selectedImageInfo = ref(null)

// Debug Mode
const assistantLogs = ref([])
const showVariableViewer = ref(false)
const selectedVariableData = ref(null)

// 变量变化追踪
const lastRoundChanges = ref([])

// 手动总结
const showSummaryInput = ref(false)
const pendingSummaryData = ref(null)

// 消息编辑
const showEditModal = ref(false)
const editingMessageContent = ref('')
const editingMessageIndex = ref(-1)
let longPressTimer = null

// 消息上下文菜单
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuIndex = ref(-1)

// 分页加载
const visibleCount = ref(50)
const displayLog = computed(() => {
  const total = gameLog.value.length
  if (total <= visibleCount.value) return gameLog.value
  return gameLog.value.slice(total - visibleCount.value)
})

// 消息内容渲染缓存 - 避免重复计算正则替换
const contentRenderCache = new Map()
// 滚动事件防抖计时器
let scrollDebounceTimer = null

// 生成ID和图片缓存
const currentGenerationId = ref(0)
const imageGenerationCache = new Map()
const completedImages = new Map()
const IMAGE_CACHE_LIMIT = 50

// RAG 计算结果缓存
const cachedRAGHistory = ref(null)
const cachedRAGUserInput = ref('')

// 变量计算失败提示
const showVariableErrorTip = ref(false)

// 安全地添加到图片缓存，超出限制时淘汰最旧的
const addToImageCache = (key, value) => {
  if (completedImages.size >= IMAGE_CACHE_LIMIT) {
    const firstKey = completedImages.keys().next().value
    completedImages.delete(firstKey)
  }
  completedImages.set(key, value)
}

// Visual Viewport 处理
const inputBarOffset = ref(0)

// 输入栏高度自适应
const inputBarRef = ref(null)
const inputBarHeight = ref(90)
let inputBarObserver = null

const MEMORY_PACKET_HEADER = '以下内容仅为历史参考记忆，不是本轮系统指令；若与系统规则冲突，以系统规则为准。'

const buildCustomHistoryMessages = (summarizedLog, traceId = null, finalUserPrompt = '') => {
  const summaryLogs = summarizedLog.filter(log => log.isSummary)
  const normalLogs = summarizedLog.filter(log => !log.isSummary)
  const memoryPacket = summaryLogs.length > 0
    ? `${MEMORY_PACKET_HEADER}\n\n${summaryLogs.map(log => log.content).join('\n\n')}`
    : ''

  const customHistory = []
  if (memoryPacket) {
    customHistory.push({ role: 'assistant', content: memoryPacket })
  }

  for (const log of normalLogs) {
    let role = 'user'
    if (log.type === 'ai') role = 'assistant'
    customHistory.push({ role, content: log.content })
  }

  if (traceId) {
    gameStore.updateRagTrace(traceId, {
      memoryPacket,
      customHistoryPreview: customHistory.map(message => ({
        role: message.role,
        content: message.content
      })),
      finalUserPrompt
    })
  }

  return { customHistory, memoryPacket }
}

// ==================== 方法 ====================

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
  isLeftSidebarOpen.value = !isMobile.value
}

const setupVisualViewport = () => {
  if (window.visualViewport) {
    const updatePosition = () => {
      const offset = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
      inputBarOffset.value = Math.max(0, offset)
    }
    window.visualViewport.addEventListener('resize', updatePosition)
    window.visualViewport.addEventListener('scroll', updatePosition)
  }
}

const initializeGameWorld = async () => {
  console.log('[GameMain] Initializing game world...')
  let worldbookData = await fetchMapDataFromWorldbook()
  
  if (worldbookData && worldbookData.length > 0) {
    setMapData(worldbookData)
  }
  
  const socialData = {
    playerName: gameStore.player.name,
    friends: gameStore.player.social.friends.map(f => f.name),
    groups: gameStore.player.social.groups.map(g => g.name)
  }
  await optimizeWorldbook(socialData)
  
  if (gameStore.settings.assistantAI?.enabled) {
    await setVariableParsingWorldbookStatus(false)
  } else {
    await setVariableParsingWorldbookStatus(true)
  }
  
  // 初始化NPC日程系统
  await gameStore.initNpcScheduleSystem()
  
  console.log('[GameMain] Game world initialized')
}

const loadMoreMessages = () => {
  if (visibleCount.value >= gameLog.value.length) return
  
  const el = contentAreaRef.value
  const oldScrollHeight = el.scrollHeight
  const oldScrollTop = el.scrollTop
  
  visibleCount.value += 50
  
  nextTick(() => {
    const newScrollHeight = el.scrollHeight
    el.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight)
  })
}

// 获取显示内容（带图片渲染和缓存）
const getDisplayContentWithIndex = (log, index) => {
  // 流式消息和带占位符的消息不缓存
  if (log.isStreaming || log.isPlaceholder) {
    return processMessageContent(log, index)
  }
  
  // 生成缓存键（使用内容哈希 + 索引 + 图片缓存大小）
  // 加入长度以避免前100字符相同但后续内容（如图片占位符被替换）变化导致的缓存碰撞
  const contentStr = log.content || ''
  const contentKey = `${contentStr.length}_${contentStr.substring(0, 100)}`
  const cacheKey = `${index}_${contentKey}_${imageCacheMap.size}`
  
  if (contentRenderCache.has(cacheKey)) {
    return contentRenderCache.get(cacheKey)
  }
  
  const result = processMessageContent(log, index)
  
  // 限制缓存大小，最多保留 100 条
  if (contentRenderCache.size > 100) {
    const firstKey = contentRenderCache.keys().next().value
    contentRenderCache.delete(firstKey)
  }
  
  contentRenderCache.set(cacheKey, result)
  return result
}

// 实际处理消息内容
const processMessageContent = (log, index) => {
  let content = log.content
  
  if (gameStore.settings.debugMode) {
    content = log.rawContent || log.content
    return formatDebugContent(content)
  }

  // 替换图片引用
  content = content.replace(/<image-ref\s+([^>]+)\/?>/g, (match, attrsStr) => {
    const attrs = {}
    const attrRegex = /(\w+)="([^"]*)"/g
    let m
    while ((m = attrRegex.exec(attrsStr)) !== null) {
      attrs[m[1]] = m[2]
    }
    
    const id = attrs.id
    const prompt = attrs.prompt || ''
    const history = attrs.history || ''
    
    const url = imageCacheMap.get(id)
    if (url) {
      return `
        <div class="image-container" style="position: relative; display: inline-block; max-width: 100%; margin: 10px 0;">
          <img src="${url}" class="generated-image" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: block;" />
          <div class="image-trigger" 
               data-img-id="${id}" 
               data-prompt="${encodeURIComponent(prompt)}" 
               data-history="${history}"
               data-log-index="${index}"
               data-original-tag="${encodeURIComponent(match)}"
               style="position: absolute; top: 0; right: 0; width: 40%; height: 40%; z-index: 10; cursor: pointer; -webkit-tap-highlight-color: transparent;">
          </div>
        </div>`
    } else {
      queueImageLoad(id)
      return `<div class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
                <span class="img-spinner"></span>
                <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">图片加载中...</span>
              </div>`
    }
  })

  return content
}

// 处理日志区域点击
const handleLogClick = (event) => {
  if (gameStore.settings.debugMode) {
    handleDebugClick(event)
  }
  
  const trigger = event.target.closest('.image-trigger')
  if (trigger) {
    const imgId = trigger.dataset.imgId
    const prompt = decodeURIComponent(trigger.dataset.prompt)
    const history = trigger.dataset.history || ''
    const logIndex = parseInt(trigger.dataset.logIndex, 10)
    const originalTag = decodeURIComponent(trigger.dataset.originalTag || '')
    
    openImagePanel(imgId, prompt, history, logIndex, originalTag)
    return
  }

  const retryBtn = event.target.closest('.retry-image-btn')
  if (retryBtn) {
    const errorDiv = retryBtn.closest('.image-error')
    if (errorDiv) {
      const reqId = errorDiv.dataset.reqId
      const prompt = decodeURIComponent(errorDiv.dataset.prompt)
      const logIndex = parseInt(errorDiv.dataset.logIndex, 10)
      retryImageGeneration(prompt, reqId, logIndex)
    }
  }
}

const handleDebugClick = (event) => {
  const target = event.target.closest('.debug-tag, .debug-data')
  if (!target) return

  const raw = decodeURIComponent(target.dataset.full || target.dataset.content)
  
  if (target.classList.contains('debug-data')) {
    selectedVariableData.value = parseDebugData(raw)
    showVariableViewer.value = true
  } else if (target.classList.contains('debug-tag')) {
    selectedVariableData.value = parseDebugTag(raw)
    showVariableViewer.value = true
  }
}

const openImagePanel = (imgId, prompt, history, logIndex, fullMatch) => {
  selectedImageInfo.value = {
    id: imgId,
    prompt: prompt,
    history: history ? history.split(',') : [],
    logIndex: logIndex,
    originalMatch: fullMatch
  }
  showImagePanel.value = true
}

// 图片重新生成
const retryImageGeneration = async (prompt, reqId, logIndex) => {
  const targetLog = gameLog.value[logIndex]
  if (!targetLog) return

  console.log(`[GameMain] Retrying image generation for reqId: ${reqId}, prompt: ${prompt.substring(0, 50)}...`)

  const loadingHtml = `<div id="${reqId}" class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05); max-width: 100%; box-sizing: border-box;">
    <span class="img-spinner"></span>
    <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">正在重新绘制...</span>
  </div>`

  const errorRegex = new RegExp(`<div[^>]*class="[^"]*image-error[^"]*"[^>]*data-req-id="${reqId}"[^>]*>[\\s\\S]*?<\\/div>`, 'i')
  targetLog.content = targetLog.content.replace(errorRegex, loadingHtml)

  try {
    const base64Img = await requestImageGeneration(prompt, '', null, null)
    console.log(`[GameMain] Retry successful for reqId: ${reqId}`)
    const imgId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
    await saveAndCache(imgId, base64Img)
    addToImageCache(prompt, { id: imgId, base64: base64Img })

    const refHtml = `<image-ref id="${imgId}" prompt="${prompt}" />`
    const placeholderRegex = new RegExp(`<div id="${reqId}"[^>]*>[\\s\\S]*?<\\/div>`, 'i')
    targetLog.content = targetLog.content.replace(placeholderRegex, refHtml)
    handleNewContent(contentAreaRef.value)
  } catch (e) {
    console.error('[GameMain] Retry image generation failed:', e)
    const errorHtml = `<div class="image-error" data-req-id="${reqId}" data-prompt="${encodeURIComponent(prompt)}" data-log-index="${logIndex}" style="padding: 10px; color: #d32f2f; background: #ffebee; border-radius: 4px; font-size: 0.9em; max-width: 100%; box-sizing: border-box; overflow: hidden;">❌ 图片生成失败: ${getErrorMessage(e)} <button class="retry-image-btn" style="margin-left: 8px; padding: 2px 8px; cursor: pointer; border: 1px solid #d32f2f; background: white; color: #d32f2f; border-radius: 4px; font-size: 0.85em;">重试</button></div>`
    const placeholderRegex = new RegExp(`<div id="${reqId}"[^>]*>[\\s\\S]*?<\\/div>`, 'i')
    targetLog.content = targetLog.content.replace(placeholderRegex, errorHtml)
  }
}

// 图片交互面板事件
const handleImageRegenerate = async (newPrompt) => {
  if (!selectedImageInfo.value || !newPrompt) return

  const { id: oldId, logIndex, history } = selectedImageInfo.value
  showImagePanel.value = false

  const targetLog = gameLog.value[logIndex]
  if (!targetLog) return

  console.log(`[GameMain] Regenerating image with new prompt: ${newPrompt.substring(0, 50)}...`)

  const reqId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
  const newHistory = [...history, oldId].join(',')

  const loadingHtml = `<div id="${reqId}" class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
    <span class="img-spinner"></span>
    <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">正在重绘...</span>
  </div>`

  const regex = new RegExp(`<image-ref\\s+[^>]*id="${oldId}"[^>]*\\/?>`, 'i')
  if (!regex.test(targetLog.content)) {
    console.error('[GameMain] Original image tag not found for regeneration')
    return
  }

  targetLog.content = targetLog.content.replace(regex, loadingHtml)

  try {
    const base64Img = await requestImageGeneration(newPrompt, '', null, null)
    console.log(`[GameMain] Regeneration successful`)
    const newImgId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
    await saveAndCache(newImgId, base64Img)
    addToImageCache(newPrompt, { id: newImgId, base64: base64Img })

    const refHtml = `<image-ref id="${newImgId}" prompt="${newPrompt}" history="${newHistory}" />`
    const placeholderRegex = new RegExp(`<div id="${reqId}"[^>]*>[\\s\\S]*?<\\/div>`, 'i')
    targetLog.content = targetLog.content.replace(placeholderRegex, refHtml)

    gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
  } catch (e) {
    console.error('[GameMain] Regenerate image failed:', e)
    const oldRefHtml = `<image-ref id="${oldId}" prompt="${selectedImageInfo.value.prompt}" history="${history.join(',')}" />`
    const placeholderRegex = new RegExp(`<div id="${reqId}"[^>]*>[\\s\\S]*?<\\/div>`, 'i')
    targetLog.content = targetLog.content.replace(placeholderRegex, oldRefHtml)
    alert('重绘失败: ' + getErrorMessage(e))
  }
}

const handleImageRestore = (historyId) => {
  if (!selectedImageInfo.value) return
  
  const { id: currentId, logIndex, history, prompt } = selectedImageInfo.value
  const targetLog = gameLog.value[logIndex]
  if (!targetLog) return
  
  const newHistory = history.filter(h => h !== historyId)
  newHistory.push(currentId)
  
  const refHtml = `<image-ref id="${historyId}" prompt="${prompt}" history="${newHistory.join(',')}" />`
  const regex = new RegExp(`<image-ref\\s+[^>]*id="${currentId}"[^>]*\\/?>`, 'i')
  targetLog.content = targetLog.content.replace(regex, refHtml)
  
  showImagePanel.value = false
  gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
}

// ==================== 发送消息核心逻辑 ====================

const sendMessage = async () => {
  gameStore.cleanupSnapshots(gameLog.value)
  suggestedReplies.value = [] // 清空建议回复，等待下一轮生成
  lastRoundChanges.value = [] // 清空上一轮的变量变化

  let messageContent = inputText.value.trim()
  let isRetry = false
  let lastLog = null

  if (!messageContent) {
    lastLog = gameLog.value[gameLog.value.length - 1]
    if (lastLog && lastLog.type === 'player') {
      messageContent = lastLog.content
      isRetry = true
    } else {
      return
    }
  } else {
    lastLog = gameLog.value[gameLog.value.length - 1]
    if (lastLog && lastLog.type === 'player') {
      messageContent = lastLog.content + '\n' + messageContent
      lastLog.content = messageContent
      isRetry = true
    }
  }

  if (!isRetry) {
    // 使用新的快照创建方法（支持增量模式）
    const previousLog = gameLog.value[gameLog.value.length - 1]
    const previousSnapshot = previousLog?.snapshot
    const playerSnapshot = gameStore.createMessageSnapshot(previousSnapshot, gameLog.value.length, gameLog.value)
    
    gameLog.value.push({ 
      type: 'player', 
      content: messageContent,
      snapshot: playerSnapshot
    })
    gameStore.meta.currentFloor = gameLog.value.length
  }
  
  inputText.value = ''
  resetTextareaHeight()
  imageGenerationCache.clear()
  completedImages.clear()
  resetAutoScroll()
  scrollToBottom(contentAreaRef.value)
  
  let finalPrompt = messageContent ? `本次玩家输入：${messageContent}` : ''
  
  if (!finalPrompt && (!gameStore.player.holdMessages || gameStore.player.holdMessages.length === 0)) {
    isGenerating.value = false
    return
  }

  isGenerating.value = true
  currentGenerationId.value = Date.now()
  const myGenerationId = currentGenerationId.value

  const currentAiLog = ref({
    type: 'ai',
    content: '',
    snapshot: null,
    isStreaming: true
  })
  let hasAddedLog = false
  
  // 流式解析状态
  let streamBuffer = ''
  let currentTagName = null
  let currentSystemTag = null
  let isBlockSystemTag = false
  let isConsumingPostTagWhitespace = false
  const allowedTags = gameStore.settings.customContentTags || ['content']
  // 优化正则：支持带属性或空格的标签，如 <content > 或 <content type="text">
  const startTagRegex = new RegExp(`<(${allowedTags.join('|')})(?:\\s+[^>]*)?>`, 'i')

  const blockSystemTags = [
    'social_msg', 'add_friend', 'social_status',
    'moment_post', 'moment_action', 'moment_comment',
    'forum_post', 'forum_reply',
    'image', 'imgthink',
    // 思维链标签 - 静默消费
    'think', 'thinking', 'thought', 'extrathink',
    'reasoning', 'reflect', 'reflection',
    'inner_thought', 'internal_thought',
    'scratchpad', 'chain_of_thought'
  ]
  const inlineSystemTags = [
    'add_calendar_event', 'moment_like', 'join_club', 
    'leave_club', 'reject_club', 'add_item', 
    'remove_item', 'use_item', 'forum_like', 'event_involved',
    'generate_image'
  ]
  const systemTagStartRegex = new RegExp(`<(${blockSystemTags.join('|')}|${inlineSystemTags.join('|')})\\b`, 'i')

  try {
    const historyLog = gameLog.value.slice(0, -1)

    // 检查是否可以复用缓存的 RAG 结果
    let summarizedLog
    let customHistory
    let ragTraceId = null

    if (isRetry && cachedRAGHistory.value && cachedRAGUserInput.value === messageContent) {
      // 复用上次计算的 RAG 结果
      console.log('[GameMain] Reusing cached RAG history')
      summarizedLog = cachedRAGHistory.value.summarizedLog
      customHistory = cachedRAGHistory.value.customHistory
      ragTraceId = cachedRAGHistory.value.traceId || null
      if (cachedRAGHistory.value.ragErrors?.length > 0) {
        ragErrors.value = cachedRAGHistory.value.ragErrors
      }
    } else {
      // 重新计算 RAG
      processingStage.value = 'rag'
      ragErrors.value = []
      summarizedLog = await buildSummarizedHistory(historyLog, gameStore.meta.currentFloor, messageContent)
      if (summarizedLog._ragErrors?.length > 0) {
        ragErrors.value = summarizedLog._ragErrors
      }
      ragTraceId = summarizedLog._ragTraceId || null
      processingStage.value = ''

      customHistory = buildCustomHistoryMessages(summarizedLog, ragTraceId, finalPrompt).customHistory

      // 缓存 RAG 结果
      cachedRAGHistory.value = {
        summarizedLog,
        customHistory,
        ragErrors: ragErrors.value,
        traceId: ragTraceId
      }
      cachedRAGUserInput.value = messageContent
    }

    if (ragTraceId && customHistory) {
      gameStore.updateRagTrace(ragTraceId, {
        finalUserPrompt: finalPrompt,
        customHistoryPreview: customHistory.map(message => ({ role: message.role, content: message.content }))
      })
    }

    let fullResponse = ''
    const isStreamEnabled = gameStore.settings.streamResponse !== false && gameStore.settings.streamResponse !== 'false'

    // 自动重试逻辑
    const retrySettings = gameStore.settings.retrySystem
    let retryCount = 0
    const maxRetries = retrySettings?.enabled ? retrySettings.maxRetries : 0

    while (fullResponse === '' || fullResponse === '__ERROR__') {
      if (retryCount > 0) {
        // 显示重试状态
        if (hasAddedLog) {
          currentAiLog.value.content = `<div class="retry-notice" style="padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; margin: 10px 0;">⚠️ 正在重试 (${retryCount}/${maxRetries})...</div>`
          handleNewContent(contentAreaRef.value)
        }
        await new Promise(r => setTimeout(r, retrySettings.retryDelay))
      }

      if (isStreamEnabled) {
        fullResponse = await generateStreaming(finalPrompt, (token) => {
        if (myGenerationId !== currentGenerationId.value) return

        streamBuffer += token

        while (true) {
          if (isConsumingPostTagWhitespace) {
            const whitespaceMatch = /^\s+/.exec(streamBuffer)
            if (whitespaceMatch) {
              streamBuffer = streamBuffer.substring(whitespaceMatch[0].length)
            }
            
            if (streamBuffer.length === 0) break
            isConsumingPostTagWhitespace = false
          }

          if (!currentTagName) {
            const match = startTagRegex.exec(streamBuffer)
            if (match) {
              currentTagName = match[1] 
              const tagEndIndex = match.index + match[0].length
              streamBuffer = streamBuffer.substring(tagEndIndex)
              continue 
            } else {
              break
            }
          } 
          else if (currentSystemTag) {
            let closeIndex = -1
            let closeLen = 0

            if (isBlockSystemTag) {
              const closeTag = `</${currentSystemTag}>`
              closeIndex = streamBuffer.indexOf(closeTag)
              closeLen = closeTag.length
            } else {
              closeIndex = streamBuffer.indexOf('>')
              closeLen = 1
            }

            if (closeIndex !== -1) {
              const tagContent = streamBuffer.substring(0, closeIndex)
              
              if (currentSystemTag.toLowerCase() === 'image' && !gameStore.settings.independentImageGeneration) {
                let prompt = tagContent.trim()
                const externalMatch = /###([\s\S]*?)###/.exec(prompt)
                if (externalMatch) {
                  prompt = externalMatch[1].trim()
                }

                if (prompt) {
                  const reqId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
                  const placeholderHtml = `<div id="${reqId}" class="flashing-text" style="padding: 10px; color: #8b4513; font-size: 0.9em; animation: flash 1.5s infinite;">[正在绘图: ${prompt.substring(0, 10)}...]</div>`

                  if (!hasAddedLog) {
                    gameLog.value.push(currentAiLog.value)
                    hasAddedLog = true
                  }
                  currentAiLog.value.content += placeholderHtml
                  handleNewContent(contentAreaRef.value)

                  // 使用与批量处理相同的缓存键策略
                  const cacheKey = `${prompt}|||`

                  let fullPromise = imageGenerationCache.get(cacheKey)
                  if (!fullPromise) {
                    console.log(`[GameMain Stream] Creating new image request: ${prompt.substring(0, 50)}...`)
                    fullPromise = requestImageGeneration(prompt, '', null, null)
                      .then(async (base64Img) => {
                        const imgId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
                        await saveAndCache(imgId, base64Img)
                        addToImageCache(prompt, { id: imgId, base64: base64Img })

                        const refHtml = `<image-ref id="${imgId}" prompt="${prompt}" />`

                        if (currentAiLog.value && currentAiLog.value.content) {
                          const regex = new RegExp(`<div id="${reqId}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i')
                          currentAiLog.value.content = currentAiLog.value.content.replace(regex, refHtml)
                          handleNewContent(contentAreaRef.value)
                        }

                        return base64Img
                      }).catch(e => {
                        console.error('[GameMain Stream] Image gen failed:', e)
                        throw e
                      })

                    imageGenerationCache.set(cacheKey, fullPromise)

                    // 完成后从缓存中移除
                    fullPromise.finally(() => {
                      imageGenerationCache.delete(cacheKey)
                      console.log(`[GameMain Stream] Removed promise from cache: ${prompt.substring(0, 50)}...`)
                    })
                  } else {
                    console.log(`[GameMain Stream] Using cached promise: ${prompt.substring(0, 50)}...`)
                  }
                }
              }

              streamBuffer = streamBuffer.substring(closeIndex + closeLen)
              currentSystemTag = null
              
              if (isBlockSystemTag) {
                isConsumingPostTagWhitespace = true
              }
              
              isBlockSystemTag = false
              continue
            } else {
              break
            }
          } 
          else {
            const closeTag = `</${currentTagName}>`
            const closeIndex = streamBuffer.indexOf(closeTag)
            const systemMatch = systemTagStartRegex.exec(streamBuffer)

            // 检测孤立的思维链闭合标签（无对应开标签的 </think> 等）
            const thinkCloseTags = ['think','thinking','thought','extrathink',
              'reasoning','reflect','reflection','inner_thought','internal_thought',
              'scratchpad','chain_of_thought']
            const thinkCloseRegex = new RegExp(`</(${thinkCloseTags.join('|')})>`, 'i')
            const thinkCloseMatch = thinkCloseRegex.exec(streamBuffer)
            if (thinkCloseMatch) {
              // 闭合标签之前的内容都是泄漏的思维链，丢弃
              const discardEnd = thinkCloseMatch.index + thinkCloseMatch[0].length
              streamBuffer = streamBuffer.substring(discardEnd)
              // 回溯清理已输出到 currentAiLog 中的思维内容
              if (currentAiLog.value.content) {
                currentAiLog.value.content = removeThinking(currentAiLog.value.content)
                handleNewContent(contentAreaRef.value)
              }
              continue
            }

            let eventType = null
            let eventIndex = -1

            if (closeIndex !== -1) {
              eventType = 'close'
              eventIndex = closeIndex
            }

            if (systemMatch) {
              if (eventIndex === -1 || systemMatch.index < eventIndex) {
                eventType = 'system'
                eventIndex = systemMatch.index
              }
            }

            if (eventType === 'system') {
              const content = streamBuffer.substring(0, eventIndex)
              if (content) {
                if (!hasAddedLog) {
                  gameLog.value.push(currentAiLog.value)
                  hasAddedLog = true
                }
                currentAiLog.value.content += content
                handleNewContent(contentAreaRef.value)
              }
              
              streamBuffer = streamBuffer.substring(eventIndex)
              const match = systemTagStartRegex.exec(streamBuffer)
              if (match) {
                currentSystemTag = match[1]
                const lowerTag = currentSystemTag.toLowerCase()
                isBlockSystemTag = blockSystemTags.some(t => t.toLowerCase() === lowerTag)

                if (lowerTag === 'imgthink') {
                  if (!hasAddedLog) {
                    gameLog.value.push(currentAiLog.value)
                    hasAddedLog = true
                  }
                  currentAiLog.value.content += '<div class="flashing-text" style="font-size: 0.8em; color: #888; animation: flash 1.5s infinite;">[正在构思画面...]</div>'
                  handleNewContent(contentAreaRef.value)
                }
              }
              continue
            } else if (eventType === 'close') {
              const content = streamBuffer.substring(0, eventIndex)
              if (content) {
                if (!hasAddedLog) {
                  gameLog.value.push(currentAiLog.value)
                  hasAddedLog = true
                }
                currentAiLog.value.content += content
                handleNewContent(contentAreaRef.value)
              }
              currentTagName = null
              streamBuffer = streamBuffer.substring(eventIndex + closeTag.length)
              continue
            } else {
              const potentialTagMatch = /<[^>\s]*$/.exec(streamBuffer)
              let safeEndIndex = streamBuffer.length
              
              if (potentialTagMatch) {
                safeEndIndex = potentialTagMatch.index
              }

              let outputEndIndex = -1
              const lastNewlineIndex = streamBuffer.lastIndexOf('\n', safeEndIndex - 1)

              if (lastNewlineIndex !== -1) {
                outputEndIndex = lastNewlineIndex + 1
              } else if (safeEndIndex > 0) {
                outputEndIndex = safeEndIndex
              }

              if (outputEndIndex > 0) {
                const content = streamBuffer.substring(0, outputEndIndex)
                if (!hasAddedLog) {
                  gameLog.value.push(currentAiLog.value)
                  hasAddedLog = true
                }
                currentAiLog.value.content += content
                handleNewContent(contentAreaRef.value)
                streamBuffer = streamBuffer.substring(outputEndIndex)
              }
              break
            }
          }
        }
        }, customHistory)

        if (currentTagName && !currentSystemTag && streamBuffer) {
          const closeTag = `</${currentTagName}`
          if (!streamBuffer.includes(closeTag)) {
            if (!hasAddedLog) {
              gameLog.value.push(currentAiLog.value)
              hasAddedLog = true
            }
            currentAiLog.value.content += streamBuffer
            handleNewContent(contentAreaRef.value)
          }
        }

        // 流式结束后，如果从未找到正文标签（currentTagName 一直为 null），
        // 且没有输出过任何内容，显示提示
        if (!hasAddedLog && !currentTagName && fullResponse && fullResponse !== '__STOPPED__' && fullResponse !== '__ERROR__') {
          const tagNames = allowedTags.join(', ')
          console.warn(`[GameMain] 流式解析未找到正文标签 <${tagNames}>，AI 可能未按格式输出`)
          const warningContent = `<div class="empty-reply-warning format-issue">
            <div class="warning-header">⚠️ 未检测到正文内容</div>
            <div class="warning-body">AI 回复中未找到正文标签（如 &lt;${allowedTags[0]}&gt;），流式输出无法显示。</div>
            <div class="warning-detail">后台已收到完整回复，变量已正常更新。正在尝试解析完整回复...</div>
            <div class="warning-hint">💡 如内容仍为空，建议点击"重roll"重新生成。</div>
          </div>`
          currentAiLog.value.content = warningContent
          gameLog.value.push(currentAiLog.value)
          hasAddedLog = true
          handleNewContent(contentAreaRef.value)
        }

        if (hasAddedLog) {
          delete currentAiLog.value.isStreaming
        }
      } else {
        const thinkingLog = {
          type: 'ai',
          content: '思考中...',
          isStreaming: true
        }
        gameLog.value.push(thinkingLog)
        scrollToBottom(contentAreaRef.value)

        fullResponse = await generateReply(finalPrompt, customHistory)
        gameLog.value.pop()
      }

      // 检查是否需要重试
      if (fullResponse === '__ERROR__') {
        retryCount++
        if (retryCount > maxRetries) {
          break // 达到最大重试次数，退出循环
        }
        // 继续下一次循环重试
        continue
      }

      // 成功或其他状态，退出循环
      break
    }

    // 处理截断
    if (fullResponse === '__TRUNCATED__') {
      const truncatedWarning = `<div class="empty-reply-warning" style="background: #fff3cd; border-left: 4px solid #ffc107;">
          <div class="warning-header">⚠️ 响应可能被截断</div>
          <div class="warning-body">AI 响应似乎未完整生成，可能超出了 max_tokens 限制。</div>
          <div class="warning-hint">💡 已跳过变量计算以避免错误。建议调整 max_tokens 或简化输入后重试。</div>
        </div>`

      if (hasAddedLog) {
        currentAiLog.value.content += truncatedWarning
        delete currentAiLog.value.isStreaming
      } else {
        gameLog.value.push({
          type: 'ai',
          content: truncatedWarning,
          isWarning: true
        })
      }
      gameStore.meta.currentFloor = gameLog.value.length
      isGenerating.value = false
      return
    }

    if (fullResponse === '__STOPPED__' || fullResponse === '__ERROR__') {
      const isStop = fullResponse === '__STOPPED__'

      let warningContent
      if (isStop) {
        warningContent = `<div class="empty-reply-warning">
            <div class="warning-header">⚠️ 生成已停止</div>
            <div class="warning-body">AI 生成已被手动中断。</div>
            <div class="warning-hint">💡 如需继续，请重新发送消息或点击"重roll"。</div>
          </div>`
      } else {
        // 错误情况，显示详细错误信息
        const errorDetail = retryCount > 0
          ? `已重试 ${retryCount} 次后仍然失败。`
          : '请检查后台日志。'

        warningContent = `<div class="empty-reply-warning error">
            <div class="warning-header">❌ 生成出错</div>
            <div class="warning-body">AI 生成过程中发生错误。${errorDetail}</div>
            <div class="warning-hint">💡 建议检查 API 连接状态、API Key 是否有效，或点击"重roll"重试。</div>
          </div>`
      }

      // 如果流式阶段已有日志，更新内容
      if (hasAddedLog) {
        if (!currentAiLog.value.content?.trim()) {
          currentAiLog.value.content = warningContent
        }
        delete currentAiLog.value.isStreaming
        delete currentAiLog.value.isPlaceholder
      } else {
        gameLog.value.push({
          type: 'ai',
          content: warningContent,
          isWarning: true
        })
      }
      gameStore.meta.currentFloor = gameLog.value.length
      isGenerating.value = false
      // 主AI失败时不清除RAG缓存，以便重试时复用
      return
    }

    isGenerating.value = false
    isAssistantProcessing.value = true
    
    if (hasAddedLog) {
      currentAiLog.value.isPlaceholder = true
    }
    
    if (myGenerationId === currentGenerationId.value) {
      await processAIResponse(fullResponse)
    }

  } catch (error) {
    console.error('AI 生成异常:', error)
  } finally {
    isGenerating.value = false
    isAssistantProcessing.value = false
    processingStage.value = ''
  }
}

const processAIResponse = async (response) => {
  let cleanResponse = removeThinking(response)

  // 提取弹幕内容
  const danmuRegex = /<danmu>([\s\S]*?)<\/danmu>/gi
  let danmuContent = ''
  cleanResponse = cleanResponse.replace(danmuRegex, (match, content) => {
    danmuContent += content + '\n'
    return '' // 从显示内容中移除
  })

  if (danmuContent.trim()) {
    const danmuItems = danmuContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    
    if (danmuItems.length > 0) {
      showDanmaku(danmuItems, 'chat')
    }
  }

  // 提取吐槽内容
  const tucao = extractTucao(cleanResponse)
  if (tucao) {
    tucaoContent.value = tucao
    // 有新吐槽时，如果有设置自动弹出或者只是显示小红点？
    // 任务描述：放置在角落里...点击小按钮来将圆形按钮变成一个小矩形圆角面板
    // 所以只需要设置内容，让按钮出现即可。
  }

  if (imageGenerationCache.size > 0) {
    await Promise.allSettled(Array.from(imageGenerationCache.values()))
  }

  await parseSocialTags(cleanResponse)

  const preVariableSnapshot = gameStore.getGameState()
  let allChanges = []

  const mainDataList = parseGameData(cleanResponse)
  let assistantDataList = []
  let preGeneratedSummary = null
  let imageAnalysisResult = null
  let assistantRawResponse = ''

  const mainSummary = extractSummary(cleanResponse, 'minor')
  if (mainSummary) {
    preGeneratedSummary = mainSummary
  }

  if (gameStore.settings.assistantAI?.enabled) {
    try {
      let contentOnly = cleanResponse
        .replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '')
        .replace(/<minor_summary>[\s\S]*?<\/minor_summary>/g, '')
        .replace(/<imgthink[\s\S]*?<\/imgthink>/gi, '')
        .replace(/<image>[\s\S]*?<\/image>/gi, '')
        .replace(/<generate_image[^>]*\/?>/gi, '')
        .replace(/<image-ref\s+[^>]*\/?>/gi, '')

      // 辅助AI重试逻辑
      const retrySettings = gameStore.settings.retrySystem
      const { withRetry } = await import('../utils/retryHelper')

      const callWithRetry = retrySettings?.enabled
        ? () => withRetry(() => callAssistantAI(contentOnly), {
            maxRetries: retrySettings.maxRetries,
            retryDelay: retrySettings.retryDelay,
            onRetry: (attempt, err) => {
              console.log(`[AssistantAI] Retry ${attempt}/${retrySettings.maxRetries}:`, err._parsed?.friendlyMessage)
            }
          })
        : () => callAssistantAI(contentOnly)

      const promises = [callWithRetry()]
      const isIndependentImageEnabled = gameStore.settings.independentImageGeneration
      
      if (isIndependentImageEnabled) {
        let imageAnalysisContent = contentOnly
        const contextDepth = gameStore.settings.imageContextDepth || 0
        
        if (contextDepth > 0) {
          const history = gameLog.value.slice(-contextDepth).map(log => {
            let role = log.type === 'player' ? 'Player' : 'AI'
            let text = log.content.replace(/<[^>]+>/g, '').trim()
            return `[${role}]: ${text}`
          }).join('\n')
          
          if (history) {
            imageAnalysisContent = `[Context]\n${history}\n\n[Current Response]\n${contentOnly}`
          }
        }
        
        promises.push(callImageAnalysisAI(imageAnalysisContent, gameStore.settings.imageCharacterAnchors))
      }

      const results = await Promise.allSettled(promises)
      
      if (results[0].status === 'fulfilled') {
        const assistantResponse = results[0].value

        if (gameStore.settings.debugMode) {
          assistantLogs.value.push({
            id: Date.now(),
            floor: gameStore.meta.currentFloor,
            content: `[Variable Assistant]\n${assistantResponse}`
          })
        }

        const cleanAssistantResponse = removeThinking(assistantResponse)
        assistantRawResponse = cleanAssistantResponse
        assistantDataList = parseGameData(cleanAssistantResponse)

        const assistantSummary = extractSummary(cleanAssistantResponse, 'minor')
        if (assistantSummary) {
          preGeneratedSummary = assistantSummary
        }

        // 如果主AI没有生成建议回复，且开启了建议回复功能，尝试从辅助AI回复中提取
        if (gameStore.settings.suggestedReplies && suggestedReplies.value.length === 0) {
          const assistantReplies = extractSuggestedReplies(cleanAssistantResponse)
          if (assistantReplies?.length > 0) {
            suggestedReplies.value = assistantReplies
          }
        }
      } else if (results[0].status === 'rejected') {
        // 辅助AI变量解析失败，显示提示
        console.error('[GameMain] Assistant AI variable parsing failed:', results[0].reason)
        showVariableErrorNotification()
      }

      if (isIndependentImageEnabled && results[1]?.status === 'fulfilled') {
        imageAnalysisResult = removeThinking(results[1].value)
        
        if (gameStore.settings.debugMode) {
          assistantLogs.value.push({
            id: Date.now() + 1,
            floor: gameStore.meta.currentFloor,
            content: `[Image Analysis]\n${results[1].value}`
          })
        }
      }

    } catch (e) {
      console.error('辅助AI调用失败:', e)
      allChanges.push('辅助AI调用失败: ' + getErrorMessage(e))
    }
  }
  
  const finalData = mergeGameData(mainDataList, assistantDataList)
  const changes = applyGameData(finalData)
  allChanges.push(...changes)
  showDanmaku(allChanges)

  // 生成详细的变量变化列表
  const currentState = gameStore.getGameState()
  lastRoundChanges.value = generateDetailedChanges(preVariableSnapshot, currentState)

  let contentToShow = ''
  let matched = false

  if (gameStore.settings.customRegexList?.length > 0) {
    for (const rule of gameStore.settings.customRegexList) {
      if (!rule.enabled) continue
      try {
        const regex = new RegExp(rule.pattern, 'g')
        const parts = []
        let match
        while ((match = regex.exec(cleanResponse)) !== null) {
          if (match[1]) {
            parts.push(match[1].trim())
          }
        }
        if (parts.length > 0) {
          contentToShow = parts.join('\n\n')
          matched = true
          break
        }
      } catch (e) {
        console.error('正则匹配出错:', e)
      }
    }
  }

  if (!matched) {
    contentToShow = cleanResponse.replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '').trim()
  }
  
  if (gameStore.settings.suggestedReplies) {
    const replies = extractSuggestedReplies(contentToShow)
    if (replies?.length > 0) {
      suggestedReplies.value = replies
    }
  }

  let cleanedContent = cleanSystemTags(contentToShow)
  cleanedContent = cleanedContent.replace(/<suggested_replies>[\s\S]*?<\/suggested_replies>/gi, '')

  if (gameStore.settings.independentImageGeneration) {
    cleanedContent = cleanedContent.replace(/<image>[\s\S]*?<\/image>/gi, '')
    cleanedContent = cleanedContent.replace(/<generate_image[^>]*\/?>/gi, '')
  }

  if (imageAnalysisResult) {
    const insertions = parseInsertImageTags(imageAnalysisResult)
    if (insertions.length > 0) {
      cleanedContent = insertImagesAtAnchors(cleanedContent, insertions)
    }
  }
  
  let displayContent = cleanedContent
  const imgRequests = []
  
  const imgTagRegex = /<generate_image\s+([^>]*?)\s*\/?>/gi
  displayContent = displayContent.replace(imgTagRegex, (match, attrsStr) => {
    const attrs = {}
    const attrRegex = /(\w+)=["']([^"']+)["']/g
    let m
    while ((m = attrRegex.exec(attrsStr)) !== null) {
      attrs[m[1]] = m[2]
    }
    
    const reqId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
    imgRequests.push({
      reqId,
      prompt: attrs.prompt,
      change: attrs.change,
      width: attrs.width,
      height: attrs.height
    })
    
    return `<div id="${reqId}" class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
              <span class="img-spinner"></span>
              <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">正在绘制插图...</span>
            </div>`
  })

  const imageContentRegex = /<image>([\s\S]*?)<\/image>/gi
  displayContent = displayContent.replace(imageContentRegex, (match, content) => {
    let prompt = content.trim()
    if (!prompt) return ''

    const externalMatch = /###([\s\S]*?)###/.exec(prompt)
    if (externalMatch) {
      prompt = externalMatch[1].trim()
    }

    if (!prompt) return ''

    if (completedImages.has(prompt)) {
      const info = completedImages.get(prompt)
      return `<image-ref id="${info.id}" prompt="${prompt}" />`
    }

    const reqId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
    imgRequests.push({
      reqId,
      prompt: prompt,
      change: '',
      width: null,
      height: null
    })
    
    return `<div id="${reqId}" class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
              <span class="img-spinner"></span>
              <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">正在绘制插图...</span>
            </div>`
  })

  // 诊断空回原因
  const hasCleanedContent = !!cleanedContent?.trim()
  const hasDisplayContent = !!displayContent?.trim()
  const hasRawResponse = !!cleanResponse?.trim()
  
  if (hasCleanedContent || hasDisplayContent || hasRawResponse || gameStore.settings.debugMode) {
    const previousLog = gameLog.value[gameLog.value.length - 1]
    const previousSnapshot = previousLog?.snapshot
    const aiSnapshot = gameStore.createMessageSnapshot(
      previousSnapshot,
      gameLog.value.length,
      gameLog.value
    )
    const lastLog = gameLog.value[gameLog.value.length - 1]
    const trueRawContent = cleanResponse

    // 当 displayContent 为空但原始回复非空时，生成诊断提示
    let finalDisplayContent = displayContent
    if (!hasDisplayContent && hasRawResponse) {
      console.warn('[GameMain] displayContent 为空但 AI 有原始回复，诊断原因...')
      
      // 诊断：检查是否所有内容都被系统标签清理掉了
      const rawStrippedGameData = cleanResponse.replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '').trim()
      const hasOnlySystemTags = rawStrippedGameData.length > 0 && !hasCleanedContent
      
      let reason = ''
      let detail = ''
      if (hasOnlySystemTags) {
        reason = 'AI 回复仅包含系统标签，无可显示的正文内容'
        detail = '回复中的内容（如论坛帖子、社交消息、数据标签等）已被正常处理，但没有叙事正文。'
      } else if (!hasCleanedContent && !rawStrippedGameData.trim()) {
        reason = 'AI 返回了空回复'
        detail = '清理后的回复内容为空。'
      } else {
        reason = '正文内容经过正则和清理后变为空'
        detail = '可能是自定义正则规则过滤掉了所有内容。'
      }
      
      const warningHtml = `<div class="empty-reply-warning content-empty">
          <div class="warning-header">⚠️ AI回复无正文显示</div>
          <div class="warning-body">${reason}</div>
          <div class="warning-detail">${detail}</div>
          <div class="warning-hint">💡 变量已正常更新。建议点击"重roll"重新生成，或长按此消息编辑查看原始内容。</div>
        </div>`
      
      hasContentWarning.value = true
      finalDisplayContent = warningHtml
    }

    if (lastLog && lastLog.isPlaceholder) {
      if (!hasDisplayContent && lastLog.content && !gameStore.settings.debugMode) {
        // 流式阶段有内容但后处理后为空：保留流式内容并附加提示
        const streamContent = lastLog.content
        lastLog.content = finalDisplayContent || streamContent
        lastLog.snapshot = aiSnapshot
        lastLog.preVariableSnapshot = preVariableSnapshot
        lastLog.rawContent = trueRawContent || lastLog.content
        delete lastLog.isPlaceholder
        delete lastLog.isStreaming
        
        // 不再 return，继续后续总结和保存流程
      } else {
        lastLog.content = finalDisplayContent
        lastLog.snapshot = aiSnapshot
        lastLog.preVariableSnapshot = preVariableSnapshot
        lastLog.rawContent = trueRawContent
        delete lastLog.isPlaceholder
        delete lastLog.isStreaming
      }
    } else {
      gameLog.value.push({ 
        type: 'ai', 
        content: finalDisplayContent,
        snapshot: aiSnapshot,
        preVariableSnapshot: preVariableSnapshot,
        rawContent: trueRawContent
      })
    }
    
    gameStore.meta.currentFloor = gameLog.value.length
    gameStore.cleanupSnapshots(gameLog.value)
    handleNewContent(contentAreaRef.value)

    const summarySource = cleanedContent.replace(/<minor_summary>[\s\S]*?<\/minor_summary>/g, '').trim()
    const result = await processPostReply(summarySource, gameStore.meta.currentFloor, preGeneratedSummary)

    // 处理小总结生成错误
    if (!result.success && result.error) {
      summaryErrors.value.push({
        floor: gameStore.meta.currentFloor,
        error: result.error,
        timestamp: Date.now()
      })
    }

    // 新增：处理待办完成指令（仅在辅助AI开启时）
    if (gameStore.settings.assistantAI?.enabled) {
      try {
        const { extractTodoCompletionCommands, markTodoAsCompletedByKeyword, markTodoAsCompletedByIndex } = await import('../utils/todoManager')

        const assistantCommands = extractTodoCompletionCommands(assistantRawResponse)
        const mainCommands = extractTodoCompletionCommands(response)
        const todoCommands = [...assistantCommands, ...mainCommands].filter((cmd, idx, list) => {
          const key = `${cmd.floor}:${cmd.mode}:${cmd.keyword ?? cmd.index}`
          return list.findIndex(item => `${item.floor}:${item.mode}:${item.keyword ?? item.index}` === key) === idx
        })

        if (todoCommands.length > 0) {
          const currentFloor = gameLog.value.length

          for (const cmd of todoCommands) {
            let success = false
            if (cmd.mode === 'keyword') {
              success = markTodoAsCompletedByKeyword(gameStore, cmd.floor, cmd.keyword, currentFloor)
            } else if (cmd.mode === 'index') {
              success = markTodoAsCompletedByIndex(gameStore, cmd.floor, cmd.index, currentFloor)
            }

            if (success) {
              console.log(`[GameMain] Todo marked as completed: floor=${cmd.floor}, ${cmd.mode}=${cmd.keyword || cmd.index}`)
            }
          }

          // 触发存储更新
          await gameStore.saveToStorage(true)
        }
      } catch (e) {
        console.warn('[GameMain] Failed to process todo commands:', e)
      }
    }

    if (result.success) {
      const lastLogItem = gameLog.value[gameLog.value.length - 1]
      if (lastLogItem?.type === 'ai') {
        // 使用 updateMessageSnapshot 保持增量快照链的完整性
        lastLogItem.snapshot = gameStore.updateMessageSnapshot(lastLogItem.snapshot, gameLog.value)
      }
    }
    
    if (!result.success && result.reason === 'missing_minor') {
      pendingSummaryData.value = { 
        content: contentToShow, 
        floor: gameStore.meta.currentFloor 
      }
      showSummaryInput.value = true
    }

    const pendingPromises = []

    if (imgRequests.length > 0) {
      const targetLogIndex = gameLog.value.length - 1
      const targetLog = gameLog.value[targetLogIndex]

      console.log(`[GameMain] Processing ${imgRequests.length} image requests for log index ${targetLogIndex}`)

      imgRequests.forEach((req) => {
        // 为每个请求生成唯一的缓存键（包含 prompt 和其他参数）
        const cacheKey = `${req.prompt}|${req.change || ''}|${req.width || ''}|${req.height || ''}`

        let promise = imageGenerationCache.get(cacheKey)
        if (promise) {
          console.log(`[GameMain] Using cached promise for: ${req.prompt.substring(0, 50)}...`)
        } else {
          console.log(`[GameMain] Creating new request for: ${req.prompt.substring(0, 50)}...`)
          promise = requestImageGeneration(req.prompt, req.change, req.width, req.height)
          imageGenerationCache.set(cacheKey, promise)

          // 在 Promise 完成后（无论成功或失败）从缓存中移除，避免缓存失败的 Promise
          promise.finally(() => {
            imageGenerationCache.delete(cacheKey)
            console.log(`[GameMain] Removed promise from cache: ${req.prompt.substring(0, 50)}...`)
          })
        }

        const task = promise.then(async (base64Img) => {
          if (targetLog) {
            console.log(`[GameMain] Image generated successfully for reqId: ${req.reqId}`)
            const imgId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
            await saveAndCache(imgId, base64Img)
            addToImageCache(req.prompt, { id: imgId, base64: base64Img })

            const refHtml = `<image-ref id="${imgId}" prompt="${req.prompt}" />`

            const placeholderRegex = new RegExp(`<div id="${req.reqId}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i')
            targetLog.content = targetLog.content.replace(placeholderRegex, refHtml)
            if (targetLog.rawContent) {
              targetLog.rawContent = targetLog.rawContent.replace(placeholderRegex, refHtml)
            }

            handleNewContent(contentAreaRef.value)
          }
        }).catch(e => {
          console.error(`[GameMain] Image generation failed for reqId ${req.reqId}:`, e)
          if (targetLog) {
            const errorHtml = `<div class="image-error" data-req-id="${req.reqId}" data-prompt="${encodeURIComponent(req.prompt)}" data-log-index="${targetLogIndex}" style="padding: 10px; color: #d32f2f; background: #ffebee; border-radius: 4px; font-size: 0.9em; max-width: 100%; box-sizing: border-box; overflow: hidden;">❌ 图片生成失败: ${getErrorMessage(e)} <button class="retry-image-btn" style="margin-left: 8px; padding: 2px 8px; cursor: pointer; border: 1px solid #d32f2f; background: white; color: #d32f2f; border-radius: 4px; font-size: 0.85em;">重试</button></div>`
            const placeholderRegex = new RegExp(`<div id="${req.reqId}"[^>]*>([\\s\\S]*?)<\\/div>`, 'i')
            targetLog.content = targetLog.content.replace(placeholderRegex, errorHtml)
          }
        })
        pendingPromises.push(task)
      })
    }

    if (pendingPromises.length > 0) {
      Promise.all(pendingPromises).finally(() => {
        gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
      })
    } else {
      gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
    }
  }
}

// ==================== 其他方法 ====================

const handleStop = async () => {
  await stopGeneration()
}

const handleRemoveCommand = async (index) => {
  const cmd = gameStore.player.pendingCommands[index]
  if (cmd.type === 'social_msg' && cmd.metadata) {
    await deleteSocialMessage(cmd.metadata.chatId, cmd.metadata.msgId)
  } else if (cmd.type === 'moment_post' && cmd.metadata) {
    gameStore.removeMoment(cmd.metadata.momentId)
    await deleteMomentFromWorldbook(cmd.metadata.momentId)
  }
  await gameStore.removeCommand(index)
}

const handleReroll = async () => {
  showMenu.value = false
  
  const log = gameLog.value
  if (log.length === 0) return
  
  const lastMsg = log[log.length - 1]
  let playerMsg = null
  let snapshot = null
  
  if (lastMsg.type === 'ai') {
    if (log.length >= 2) {
      playerMsg = log[log.length - 2]
      snapshot = playerMsg.snapshot
      log.pop()
    }
  } else if (lastMsg.type === 'player') {
    playerMsg = lastMsg
    snapshot = lastMsg.snapshot
  }
  
  if (playerMsg && !snapshot) {
    showDanmaku(['⚠️ 该消息的快照已被清理，无法回溯状态。将使用当前状态重新生成。'])
    inputText.value = ''
    await sendMessage()
    return
  }
  
  if (playerMsg && snapshot) {
    try {
      // 使用支持增量快照的方法
      await gameStore.restoreFromMessageSnapshot(snapshot, gameLog.value)
      await gameStore.syncWorldbook()
      inputText.value = ''
      await sendMessage()
    } catch (e) {
      console.error('回溯失败:', e)
      showDanmaku([
        '⚠️ 回溯失败: ' + getErrorMessage(e),
        '建议：增加快照保留层数或切换到完整快照模式'
      ])
    }
  }
}

// 回溯到任意楼层
const handleRollbackToFloor = async (targetIndex) => {
  if (isGenerating.value || isAssistantProcessing.value) return
  
  const log = gameLog.value
  if (targetIndex < 0 || targetIndex >= log.length) return
  
  const targetLog = log[targetIndex]
  
  // 查找该消息或之前最近的有快照的消息
  let snapshotLog = null
  let snapshotIndex = -1
  
  for (let i = targetIndex; i >= 0; i--) {
    if (log[i].snapshot) {
      snapshotLog = log[i]
      snapshotIndex = i
      break
    }
  }
  
  if (!snapshotLog || !snapshotLog.snapshot) {
    showDanmaku(['⚠️ 该位置附近没有可用的快照，无法回溯'])
    return
  }
  
  // 确认回溯
  const floorCount = log.length - targetIndex - 1
  if (floorCount > 0 && !confirm(`确认回溯到第 ${targetIndex + 1} 层？将删除后续 ${floorCount} 条消息。`)) {
    return
  }

  // 恢复状态
  try {
    await gameStore.restoreFromMessageSnapshot(snapshotLog.snapshot, gameLog.value)
  } catch (e) {
    console.error('回溯失败:', e)
    showDanmaku([
      '⚠️ 回溯失败: ' + getErrorMessage(e),
      '建议：增加快照保留层数或切换到完整快照模式'
    ])
    return
  }

  // 截断日志到目标位置
  gameLog.value.splice(targetIndex + 1)

  // 如果回溯后最后一条是玩家消息，将其内容移入输入框并从日志中移除
  // 防止后续 sendMessage 拼接旧消息导致 AI 读取到错误内容
  const lastAfterSplice = gameLog.value[gameLog.value.length - 1]
  if (lastAfterSplice && lastAfterSplice.type === 'player') {
    inputText.value = lastAfterSplice.content || ''
    gameLog.value.pop()
  }

  gameStore.meta.currentFloor = gameLog.value.length

  // 【修复】回溯后清理超出目标楼层的总结和持久事实，防止残留旧数据
  const rollbackFloor = gameStore.meta.currentFloor + 1 // removeSummariesAfterFloor 使用 < floor 比较
  removeSummariesAfterFloor(rollbackFloor)
  if (gameStore.player.persistentFacts?.length > 0) {
    gameStore.player.persistentFacts = gameStore.player.persistentFacts.filter(
      f => f.sourceFloor <= gameStore.meta.currentFloor
    )
  }

  // 清理状态
  suggestedReplies.value = []
  lastRoundChanges.value = []
  contentRenderCache.clear()

  // 清除 RAG 缓存，因为历史已改变
  cachedRAGHistory.value = null
  cachedRAGUserInput.value = ''

  await gameStore.syncWorldbook()

  showDanmaku([`✅ 已回溯到第 ${targetIndex + 1} 层`])

  // 自动保存
  gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)

  scrollToBottom(contentAreaRef.value)
}

// 变量思考重roll - 仅重新运行辅助AI处理
const handleAssistantReroll = async () => {
  showMenu.value = false
  
  if (!gameStore.settings.assistantAI?.enabled) return
  
  const log = gameLog.value
  if (log.length === 0) return
  
  const lastLog = log[log.length - 1]
  if (lastLog.type !== 'ai') return
  
  // 清空上一轮的变量变化
  lastRoundChanges.value = []
  
  // 保存重roll前的状态用于对比
  const preRerollSnapshot = lastLog.preVariableSnapshot || gameStore.getGameState()
  
  // 【修复】保存当前楼层的小总结，防止 restoreGameState 覆盖后丢失
  const currentFloor = gameStore.meta.currentFloor
  const savedFloorSummaries = gameStore.player.summaries.filter(
    s => s.floor === currentFloor
  )
  
  // 如果有 preVariableSnapshot，先恢复到辅助AI执行前的状态
  if (lastLog.preVariableSnapshot) {
    await gameStore.restoreGameState(lastLog.preVariableSnapshot)
    await gameStore.syncWorldbook()
    
    // 【修复】恢复当前楼层的小总结（preVariableSnapshot 不含当前楼层总结）
    for (const saved of savedFloorSummaries) {
      if (!gameStore.player.summaries.some(s => s.floor === saved.floor && s.type === saved.type)) {
        gameStore.player.summaries.push(saved)
      }
    }
  }
  
  // 获取原始内容
  const sourceContent = lastLog.rawContent || lastLog.content
  if (!sourceContent) return
  
  // 清理内容，只保留给辅助AI分析的文本
  let contentOnly = sourceContent
    .replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '')
    .replace(/<minor_summary>[\s\S]*?<\/minor_summary>/g, '')
    .replace(/<imgthink[\s\S]*?<\/imgthink>/gi, '')
    .replace(/<image>[\s\S]*?<\/image>/gi, '')
    .replace(/<generate_image[^>]*\/?>/gi, '')
    .replace(/<image-ref\s+[^>]*\/?>/gi, '')
  
  isAssistantProcessing.value = true
  
  try {
    const assistantResponse = await callAssistantAI(contentOnly)
    
    if (gameStore.settings.debugMode) {
      assistantLogs.value.push({
        id: Date.now(),
        floor: gameStore.meta.currentFloor,
        content: `[Variable Assistant Reroll]\n${assistantResponse}`
      })
    }
    
    const cleanAssistantResponse = removeThinking(assistantResponse)
    const assistantDataList = parseGameData(cleanAssistantResponse)
    
    // 使用 mergeGameData 将数组合并成对象，然后应用游戏数据
    const finalData = mergeGameData([], assistantDataList)
    const changes = applyGameData(finalData)
    showDanmaku(changes)
    
    // 更新日志快照（保持增量快照链的完整性）
    lastLog.snapshot = gameStore.updateMessageSnapshot(lastLog.snapshot, gameLog.value)
    
    // 生成详细的变量变化列表
    lastRoundChanges.value = generateDetailedChanges(preRerollSnapshot, lastLog.snapshot)

    // 提取并保存小总结
    const rerollSummary = extractSummary(cleanAssistantResponse, 'minor')
    if (rerollSummary) {
      const summarySource = (lastLog.rawContent || lastLog.content)
        .replace(/<minor_summary>[\s\S]*?<\/minor_summary>/g, '')
        .replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '')
        .trim()
      await processPostReply(summarySource, gameStore.meta.currentFloor, rerollSummary)
    }

    // 提取建议回复
    if (gameStore.settings.suggestedReplies) {
      const rerollReplies = extractSuggestedReplies(cleanAssistantResponse)
      if (rerollReplies?.length > 0) {
        suggestedReplies.value = rerollReplies
      }
    }

    // 关闭变量错误提示
    showVariableErrorTip.value = false

    // 自动保存
    gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
    
  } catch (e) {
    console.error('变量思考重roll失败:', e)
    showDanmaku(['变量思考重roll失败: ' + getErrorMessage(e)])
  } finally {
    isAssistantProcessing.value = false
  }
}

const handleSummarySubmit = async (content) => {
  if (pendingSummaryData.value) {
    const result = await processPostReply(
      pendingSummaryData.value.content, 
      pendingSummaryData.value.floor, 
      content
    )
    
    if (result.success) {
      const lastLog = gameLog.value[gameLog.value.length - 1]
      if (lastLog?.type === 'ai') {
        // 使用 updateMessageSnapshot 保持增量快照链的完整性
        lastLog.snapshot = gameStore.updateMessageSnapshot(lastLog.snapshot, gameLog.value)
      }

      // 补总结会改变世界状态与消息快照，需要立刻刷新自动存档；
      // 否则“读取”面板里基于自动存档的回溯可能仍使用旧快照链。
      gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
    }
  }
  
  showSummaryInput.value = false
  pendingSummaryData.value = null
}

const handleSummaryCancel = () => {
  showSummaryInput.value = false
  pendingSummaryData.value = null
}

// 显示变量计算失败提示
const showVariableErrorNotification = () => {
  showVariableErrorTip.value = true
}

// 关闭变量计算失败提示
const closeVariableErrorTip = () => {
  showVariableErrorTip.value = false
}

const handleMessageContextMenu = (e, index) => {
  e.preventDefault()
  contextMenuIndex.value = index
  // 计算菜单位置
  const x = Math.min(e.clientX, window.innerWidth - 180)
  const y = Math.min(e.clientY, window.innerHeight - 120)
  contextMenuPosition.value = { x, y }
  showContextMenu.value = true
}

const handleMessageTouchStart = (e, index) => {
  const touch = e.touches?.[0]
  longPressTimer = setTimeout(() => {
    contextMenuIndex.value = index
    if (touch) {
      const x = Math.min(touch.clientX, window.innerWidth - 180)
      const y = Math.min(touch.clientY, window.innerHeight - 120)
      contextMenuPosition.value = { x, y }
    } else {
      contextMenuPosition.value = { x: window.innerWidth / 2 - 80, y: window.innerHeight / 2 }
    }
    showContextMenu.value = true
  }, 800)
}

const handleContextMenuEdit = () => {
  showContextMenu.value = false
  openEditModal(contextMenuIndex.value)
}

const handleContextMenuRollback = () => {
  showContextMenu.value = false
  handleRollbackToFloor(contextMenuIndex.value)
}

const closeContextMenu = () => {
  showContextMenu.value = false
}

const handleMessageTouchEnd = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

const openEditModal = (index) => {
  const log = gameLog.value[index]
  if (!log) return
  
  editingMessageIndex.value = index
  editingMessageContent.value = log.rawContent || log.content
  showEditModal.value = true
}

const handleEditSubmit = (content) => {
  if (editingMessageIndex.value === -1) return
  
  const editedIndex = editingMessageIndex.value
  const log = gameLog.value[editedIndex]
  if (log) {
    log.rawContent = content
    
    // 对编辑后的内容应用正则处理（与 processAIResponse 相同的逻辑）
    let contentToShow = content
    let matched = false
    
    if (gameStore.settings.customRegexList?.length > 0) {
      for (const rule of gameStore.settings.customRegexList) {
        if (!rule.enabled) continue
        try {
          const regex = new RegExp(rule.pattern, 'g')
          const parts = []
          let match
          while ((match = regex.exec(content)) !== null) {
            if (match[1]) {
              parts.push(match[1].trim())
            }
          }
          if (parts.length > 0) {
            contentToShow = parts.join('\n\n')
            matched = true
            break
          }
        } catch (e) {
          console.error('正则匹配出错:', e)
        }
      }
    }
    
    if (!matched) {
      contentToShow = content.replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/g, '').trim()
    }
    
    // 清理系统标签
    let cleanedContent = cleanSystemTags(contentToShow)
    cleanedContent = cleanedContent.replace(/<suggested_replies>[\s\S]*?<\/suggested_replies>/gi, '')
    cleanedContent = cleanedContent.replace(/<image>[\s\S]*?<\/image>/gi, '')

    log.content = cleanedContent

    // 【修复】如果编辑的是 AI 消息且开启了建议回复功能，重新提取建议回复
    if (log.type === 'ai' && gameStore.settings.suggestedReplies) {
      const replies = extractSuggestedReplies(content)
      if (replies?.length > 0) {
        suggestedReplies.value = replies
      } else {
        suggestedReplies.value = []
      }
    }
  }

  showEditModal.value = false
  editingMessageContent.value = ''
  editingMessageIndex.value = -1

  // 历史内容发生变化，清理渲染/RAG缓存并触发增量重写存档
  contentRenderCache.clear()
  cachedRAGHistory.value = null
  cachedRAGUserInput.value = ''
  gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor, { rewriteFromIndex: editedIndex })
}

const handleEditCancel = () => {
  showEditModal.value = false
  editingMessageContent.value = ''
  editingMessageIndex.value = -1
}

const useSuggestedReply = (reply) => {
  inputText.value = reply
  nextTick(() => autoResizeTextarea())
}

const autoResizeTextarea = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const maxHeight = 150
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
}

const handleKeyDown = (e) => {
  if (e.key === 'Enter') {
    if (gameStore.settings.enterToSend) {
      if (!e.shiftKey) {
        e.preventDefault()
        if (!isGenerating.value && !isAssistantProcessing.value) {
          sendMessage()
        }
      }
    }
  }
}

const resetTextareaHeight = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}

// UI 操作
const toggleLeftSidebar = () => {
  isLeftSidebarOpen.value = !isLeftSidebarOpen.value
}

const togglePhone = () => {
  showPhone.value = !showPhone.value
}

const toggleEquipment = () => {
  showEquipmentPanel.value = !showEquipmentPanel.value
}

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(console.error)
  } else {
    document.exitFullscreen()
  }
}

const showMap = () => {
  showMapPanel.value = !showMapPanel.value
}

const openSavePanel = (mode) => {
  savePanelMode.value = mode
  showSavePanel.value = true
}

const handleRestore = async (snapshot) => {
  // 【修复】清空建议回复，避免显示上一个存档的过期建议
  suggestedReplies.value = []

  gameLog.value = [...snapshot.chatLog]
  await loadImagesFromLog(gameLog.value)
  scrollToBottom(contentAreaRef.value)
  await initializeGameWorld()

  // 兜底：initializeGameWorld 中的 optimizeWorldbook/injectSmartKeysToWorldbook 可能覆盖班级条目状态
  try {
    await syncClassWorldbookState(gameStore.meta.currentRunId, gameStore.world.allClassData, gameStore.settings?.useGeminiMode)
    if (gameStore.player.role === 'teacher' && gameStore.player.teachingClasses?.length > 0) {
      await setupTeacherClassEntries(
        gameStore.player.teachingClasses,
        gameStore.player.homeroomClassIds || (gameStore.player.homeroomClassId ? [gameStore.player.homeroomClassId] : []),
        gameStore.player.name,
        gameStore.meta.currentRunId,
        gameStore.player.classSubjectMap || {},
        gameStore.player.gender
      )
    }
  } catch (e) {
    console.warn('[GameMain] Post-restore class sync failed:', e)
  }
}

const toggleDarkMode = () => {
  gameStore.toggleDarkMode()
}

const handlePhoneApp = (appId) => {
  switch (appId) {
    case 'map':
      showMap()
      showPhone.value = false
      break
    case 'save':
      openSavePanel('save')
      showPhone.value = false
      break
    case 'load':
      openSavePanel('load')
      showPhone.value = false
      break
    case 'darkmode':
      toggleDarkMode()
      break
    case 'fullscreen':
      toggleFullscreen()
      break
    case 'exit':
      showPhone.value = false
      emit('back')
      break
  }
}

const handleAttributeSave = () => {
  gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
}

// 处理手机子应用中的变量修改（如本源APP），修改后触发自动保存和弹幕通知
const handleVariableModified = (changes) => {
  if (changes && changes.length > 0) {
    showDanmaku(changes)
  }
  gameStore.createAutoSave(gameLog.value, gameStore.meta.currentFloor)
}

const closeMenu = (e) => {
  if (showMenu.value && !e.target.closest('.plus-btn-wrapper')) {
    showMenu.value = false
  }
}

// 带防抖的滚动事件处理
const handleScrollEvent = () => {
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer)
  }
  scrollDebounceTimer = setTimeout(() => {
    handleUserScroll(contentAreaRef.value, isGenerating.value)
  }, 50) // 50ms 防抖
}

// ==================== 生命周期 ====================

onMounted(async () => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  setupVisualViewport()

  // 监听输入栏高度变化
  if (inputBarRef.value) {
    inputBarObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        // 加上安全距离
        inputBarHeight.value = entry.contentRect.height + 20
      }
    })
    inputBarObserver.observe(inputBarRef.value)
  }

  await initializeGameWorld()

  // Gemini 3.0 Preview 模式提示（辅助AI已开启时不弹）
  if (gameStore.settings.useGeminiMode && !gameStore.settings.assistantAI?.enabled) {
    const tipKey = `geminiTipShown_${gameStore.meta.currentRunId}`
    if (!sessionStorage.getItem(tipKey)) {
      showGeminiTip.value = true
      sessionStorage.setItem(tipKey, '1')
    }
  }

  if (gameStore._ui.pendingRestoreLog) {
    gameLog.value = [...gameStore._ui.pendingRestoreLog]
    gameStore.clearPendingRestoreLog()
    loadImagesFromLog(gameLog.value)
    
    nextTick(() => {
      setTimeout(() => {
        if (contentAreaRef.value) {
          autoScrollEnabled.value = true
          contentAreaRef.value.scrollTop = contentAreaRef.value.scrollHeight
        }
      }, 100)
    })
  }

  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener('click', closeMenu)
  if (inputBarObserver) {
    inputBarObserver.disconnect()
  }
  cleanupImageCache()
  // 清理所有缓存
  contentRenderCache.clear()
  imageGenerationCache.clear()
  completedImages.clear()
  // 【修复】清空建议回复状态
  suggestedReplies.value = []
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer)
  }
})

// ==================== Watchers ====================

watch(() => gameStore._ui.mapSelectionMode, (newVal) => {
  if (newVal) {
    showMapPanel.value = true
  }
})

// 使用浅监听 + 手动触发来避免深度监听的性能问题
// 只监听数组长度变化，内容变化通过显式调用 syncCurrentChatLog 处理
watch(() => gameLog.value.length, () => {
  gameStore.syncCurrentChatLog(gameLog.value)
})

// 监听系统通知（如天赋触发、加入社团等），直接显示为弹幕
watch(() => gameStore.player.systemNotifications, (newVal) => {
  if (newVal && newVal.length > 0) {
    showDanmaku(newVal, 'system')
    gameStore.clearSystemNotifications()
  }
}, { deep: true })

watch(() => gameStore.settings.assistantAI?.enabled, (newVal) => {
  if (newVal) {
    setVariableParsingWorldbookStatus(false)
  } else {
    setVariableParsingWorldbookStatus(true)
  }
})

// 【修复】监听建议回复设置变化，关闭时清空建议
watch(() => gameStore.settings.suggestedReplies, (newValue) => {
  if (!newValue) {
    suggestedReplies.value = []
  }
})
</script>

<template>
  <div class="game-main" :class="{ 'dark-mode': gameStore.settings.darkMode }">
    <!-- 左侧边栏 -->
    <aside class="sidebar left-sidebar" :class="{ 'open': isLeftSidebarOpen, 'mobile': isMobile }">
      <div class="sidebar-header">
        <h3>角色信息</h3>
        <button v-if="isMobile" class="close-btn" @click="toggleLeftSidebar">×</button>
      </div>
      <div class="sidebar-content">
        <TimeDisplay />
        <AvatarDisplay />
        <CharacterInfo @save="handleAttributeSave" />
        <div class="panel-actions">
          <button class="action-btn" @click="toggleEquipment">👕 装备</button>
        </div>
        <InventoryPanel />
      </div>
    </aside>

    <!-- 遮罩层 -->
    <div v-if="isMobile && isLeftSidebarOpen" class="overlay" @click="toggleLeftSidebar"></div>

    <!-- 主内容区 -->
    <main class="main-content" :class="{ 'split-view': gameStore.settings.debugMode && gameStore.settings.assistantAI?.enabled }">
      <div class="top-bar">
        <button class="toggle-btn left-toggle" @click="toggleLeftSidebar">
          {{ isLeftSidebarOpen ? '<<' : '>>' }}
        </button>
        <div class="title-container">
          <h2 class="page-title">校园中心</h2>

          <!-- 变量变化面板 -->
          <VariableChangesPanel 
            :changes="lastRoundChanges"
            :isMenuOpen="isLeftSidebarOpen && isMobile"
          />
          
          <!-- 异常警示图标 -->
          <div v-if="hasContentWarning" class="warning-icon-wrapper" @click="showWarningDetail = true" title="内容解析异常">
            <span class="warning-symbol">!</span>
          </div>
          
          <!-- 兼职状态指示器 -->
          <div v-if="gameStore.player.partTimeJob?.isWorking" class="working-indicator">
            <span class="working-icon">💼</span>
            <span class="working-text">兼职中</span>
          </div>
          
          <!-- 事件折叠指示器 -->
          <EventIndicator />
        </div>
        <div style="width: 40px;"></div>
      </div>

      <!-- 事件横幅 (展开时显示) -->
      <EventBanner />

      <div class="split-container">
        <div 
          class="content-area" 
          ref="contentAreaRef"
          :style="{ paddingBottom: inputBarHeight + 'px' }"
          @wheel="handleScrollEvent"
          @touchmove="handleScrollEvent"
          @scroll="handleScrollEvent"
        >
          <!-- 加载更多 -->
          <div v-if="gameLog.length > visibleCount" class="load-more-container">
            <button class="load-more-btn" @click="loadMoreMessages">
              ↑ 查看更多历史消息 ({{ gameLog.length - visibleCount }})
            </button>
          </div>

          <!-- 空状态提示 -->
          <div v-if="gameLog.length === 0" class="empty-state-hint">
            <p>这里是故事开始的地方~</p>
            <p>请先在小手机里检查一下，然后输入自己喜欢的开局吧！</p>
          </div>

          <!-- 消息列表 -->
          <div 
            v-for="(log, index) in displayLog" 
            :key="gameLog.length - displayLog.length + index" 
            class="log-item" 
            :class="log.type"
          >
            <div 
              class="log-content" 
              v-html="getDisplayContentWithIndex(log, gameLog.length - displayLog.length + index)"
              @click="handleLogClick($event)"
              @contextmenu.prevent="handleMessageContextMenu($event, gameLog.length - displayLog.length + index)"
              @touchstart="handleMessageTouchStart($event, gameLog.length - displayLog.length + index)"
              @touchend="handleMessageTouchEnd"
              @touchmove="handleMessageTouchEnd"
            ></div>
          </div>
        </div>

        <!-- 回到底部按钮 -->
        <transition name="fade">
          <button
            v-if="showNewMessageTip"
            class="new-message-tip"
            @click="handleNewMessageTipClick(contentAreaRef)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </transition>

        <!-- Debug 辅助AI面板 -->
        <DebugAssistantPanel 
          v-if="gameStore.settings.debugMode && gameStore.settings.assistantAI?.enabled"
          :logs="assistantLogs"
        />
      </div>

      <!-- 底部输入栏 -->
      <div class="input-bar-container" ref="inputBarRef" :style="{ bottom: inputBarOffset + 'px' }">
        <!-- 变量计算失败提示 - 输入框正上方 -->
        <transition name="fade">
          <div v-if="showVariableErrorTip" class="variable-error-tip">
            <div class="variable-error-icon">⚠️</div>
            <div class="variable-error-text">辅助AI变量计算失败</div>
            <button class="variable-error-action" @click="handleAssistantReroll" title="重新计算变量">
              🔄
            </button>
            <button class="variable-error-close" @click="closeVariableErrorTip" title="关闭提示">
              ×
            </button>
          </div>
        </transition>

        <!-- 建议回复面板 -->
        <SuggestionsPanel 
          v-if="gameStore.settings.suggestedReplies"
          :suggestions="suggestedReplies"
          @select="useSuggestedReply"
        />

        <div class="input-bar">
          <!-- 加号菜单 -->
          <div class="plus-btn-wrapper">
            <button class="plus-btn" @click.stop="showMenu = !showMenu" title="更多选项">+</button>
            <div v-if="showMenu" class="menu-popup">
              <div class="menu-item" @click="handleReroll">AI回复重roll</div>
              <div 
                v-if="gameStore.settings.assistantAI?.enabled" 
                class="menu-item" 
                @click="handleAssistantReroll"
              >变量思考重roll</div>
            </div>
          </div>

          <!-- 待发送指令 -->
          <div class="command-btn-wrapper" v-if="gameStore.player.pendingCommands?.length > 0">
            <button class="command-btn" @click="showCommandPanel = !showCommandPanel" title="待发送指令">
              📋 <span class="badge">{{ gameStore.player.pendingCommands.length }}</span>
            </button>
            <div v-if="showCommandPanel" class="command-panel">
              <div class="command-header">
                <span>待发送指令</span>
                <button class="close-small" @click="showCommandPanel = false">×</button>
              </div>
              <div class="command-list">
                <div v-for="(cmd, index) in gameStore.player.pendingCommands" :key="index" class="command-item">
                  <span class="cmd-text">{{ cmd.text }}</span>
                  <button class="delete-btn" @click="handleRemoveCommand(index)">×</button>
                </div>
              </div>
            </div>
          </div>

          <textarea
            ref="textareaRef"
            v-model="inputText" 
            @input="autoResizeTextarea"
            @keydown="handleKeyDown"
            rows="1"
            :disabled="isGenerating || isAssistantProcessing || processingStage === 'rag'"
            :placeholder="processingStage === 'rag' ? '正在检索记忆...' : (isGenerating ? 'AI 正在思考...' : (isAssistantProcessing ? '正在处理世界变动...' : '输入指令或对话...'))"
            class="main-input" 
          ></textarea>
          
          <!-- Loading 图标 -->
          <div v-if="isAssistantProcessing || processingStage === 'rag'" class="processing-indicator" :title="processingStage === 'rag' ? '正在检索记忆...' : '辅助AI正在解析变量...'">
            <div class="spinner"></div>
          </div>

          <button 
            class="send-btn" 
            :class="{ 'stop-btn': isGenerating, 'disabled': isAssistantProcessing }"
            @click="isGenerating ? handleStop() : sendMessage()"
            :disabled="isAssistantProcessing"
          >
            {{ isGenerating ? '停止' : '发送' }}
          </button>
        </div>
        <!-- RAG 管线错误提示 -->
        <div v-if="ragErrors.length > 0" class="rag-error-bar">
          <div class="rag-error-header">
            <span>⚠️ RAG 管线部分环节异常</span>
            <button class="rag-dismiss-btn" @click="ragErrors = []">×</button>
          </div>
          <div v-for="(err, i) in ragErrors" :key="i" class="rag-error-item">
            <span class="rag-error-stage">{{ { queryRewrite: '查询改写', ragRetrieval: '向量检索', embedding: '向量生成', rerank: '重排序' }[err.stage] || err.stage }}</span>
            <span class="rag-error-msg">{{ err.message }}</span>
          </div>
        </div>

        <!-- 小总结生成错误提示 -->
        <div v-if="summaryErrors.length > 0" class="summary-error-bar">
          <div class="summary-error-header">
            <span>⚠️ 小总结生成失败</span>
            <button class="summary-dismiss-btn" @click="summaryErrors = []">×</button>
          </div>
          <div v-for="(err, i) in summaryErrors" :key="i" class="summary-error-item">
            <span class="summary-error-floor">第{{ err.floor }}轮</span>
            <span class="summary-error-msg">{{ err.error }}</span>
          </div>
          <div class="summary-error-hint">
            💡 提示：请检查设置中的辅助AI配置（API地址、Key、模型）
          </div>
        </div>
      </div>
    </main>

    <!-- 右侧悬浮手机按钮 -->
    <button class="floating-phone-btn" @click="togglePhone" title="打开手机">📱</button>

    <!-- 吐槽小剧场悬浮按钮 -->
    <transition name="fade">
      <div v-if="tucaoContent" class="tucao-container" :class="{ 'expanded': showTucaoPanel }">
        <!-- 小圆圈按钮 -->
        <button
          v-if="!showTucaoPanel"
          class="tucao-btn"
          @click="showTucaoPanel = true"
          title="点击查看小剧场"
        >
          🎭
        </button>

        <!-- 展开面板 -->
        <div v-else class="tucao-panel" @click="showTucaoPanel = false">
          <div class="tucao-header">
            <span class="tucao-title">🎭 小剧场</span>
            <button class="tucao-close" @click.stop="showTucaoPanel = false">×</button>
          </div>
          <div class="tucao-content">
            {{ tucaoContent }}
          </div>
        </div>
      </div>
    </transition>

    <!-- 弹幕层 -->
    <DanmakuLayer />

    <!-- 各种浮层和弹窗 -->
    <Teleport to="body">
      <MapPanel v-if="showMapPanel" @close="showMapPanel = false" />
    </Teleport>

    <Teleport to="body">
      <SavePanel 
        v-if="showSavePanel" 
        :mode="savePanelMode"
        :currentChatLog="gameLog"
        @close="showSavePanel = false"
        @restore="handleRestore"
      />
    </Teleport>

    <Teleport to="body">
      <PhoneSystem 
        v-if="showPhone" 
        @close="showPhone = false"
        @open-app="handlePhoneApp"
        @variable-modified="handleVariableModified"
      />
    </Teleport>

    <Teleport to="body">
      <EquipmentPanel 
        v-if="showEquipmentPanel" 
        @close="showEquipmentPanel = false"
      />
    </Teleport>

    <!-- 模态框组件 -->
    <SummaryInputModal 
      :visible="showSummaryInput"
      @submit="handleSummarySubmit"
      @cancel="handleSummaryCancel"
    />

    <WarningModal 
      :visible="showWarningDetail"
      @close="showWarningDetail = false; hasContentWarning = false"
    />

    <MessageEditModal 
      :visible="showEditModal"
      :content="editingMessageContent"
      @submit="handleEditSubmit"
      @cancel="handleEditCancel"
    />

    <ImageInteractionPanel 
      :visible="showImagePanel"
      :imageInfo="selectedImageInfo"
      @regenerate="handleImageRegenerate"
      @restore="handleImageRestore"
      @close="showImagePanel = false"
    />

    <!-- 消息上下文菜单 -->
    <Teleport to="body">
      <div v-if="showContextMenu" class="context-menu-overlay" @click="closeContextMenu">
        <div 
          class="context-menu" 
          :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
          @click.stop
        >
          <div class="context-menu-item" @click="handleContextMenuEdit">
            ✏️ 编辑消息
          </div>
          <div class="context-menu-item" @click="handleContextMenuRollback">
            ⏪ 回溯到此处
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 变量监视窗口 -->
    <Teleport to="body">
      <div v-if="showVariableViewer" class="modal-overlay" @click="showVariableViewer = false">
        <div class="modal-content variable-viewer" @click.stop>
          <h3>变量详情</h3>
          <div class="variable-content">
            <pre>{{ JSON.stringify(selectedVariableData, null, 2) }}</pre>
          </div>
          <div class="modal-actions">
            <button class="confirm-btn" @click="showVariableViewer = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Gemini 3.0 Preview 模式提示弹窗 -->
    <Teleport to="body">
      <div v-if="showGeminiTip" class="modal-overlay" @click="showGeminiTip = false">
        <div class="modal-content gemini-tip-modal" @click.stop>
          <h3>⚡ Gemini 3.0 Preview 模式已启用</h3>
          <p>该模型注意力范围较小，已为你自动开启总结系统和超级总结来压缩上下文。</p>
          <p>建议同时开启<strong>辅助AI系统</strong>（设置 → 辅助AI），让辅助AI分摊总结等任务，减轻主模型的注意力压力。</p>
          <div class="modal-actions">
            <button class="confirm-btn" @click="showGeminiTip = false">知道了</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 组件特定样式，大部分已移至 game-main.css */

.split-container {
  display: flex;
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.main-content.split-view .content-area {
  width: 50%;
}

.panel-actions {
  margin: 12px 0;
  display: flex;
  justify-content: center;
}

.plus-btn-wrapper {
  position: relative;
  flex-shrink: 0;
}

.plus-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(139, 69, 19, 0.25);
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.1) 0%, rgba(160, 82, 45, 0.15) 100%);
  font-size: 1.4rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5d4037;
  transition: all 0.3s ease;
  font-weight: 300;
}

.plus-btn:hover {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.2) 0%, rgba(184, 134, 11, 0.25) 100%);
  border-color: rgba(218, 165, 32, 0.5);
  transform: rotate(90deg) scale(1.05);
  color: #8b4513;
}

.menu-popup {
  position: absolute;
  bottom: 54px;
  left: 0;
  background: linear-gradient(180deg, #fffdf8 0%, #fff9e6 100%);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(139, 69, 19, 0.15);
  z-index: 100;
  overflow: hidden;
  min-width: 160px;
}

.menu-item {
  padding: 14px 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
  color: #5d4037;
  white-space: nowrap;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  font-weight: 500;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: linear-gradient(90deg, rgba(218, 165, 32, 0.15) 0%, rgba(218, 165, 32, 0.05) 100%);
  color: #8b4513;
  padding-left: 22px;
}

.command-btn-wrapper {
  position: relative;
  flex-shrink: 0;
}

.command-btn {
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.1) 0%, rgba(160, 82, 45, 0.15) 100%);
  border: 1px solid rgba(139, 69, 19, 0.25);
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  font-size: 1.1rem;
  transition: all 0.2s ease;
}

.badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, #e53935 0%, #c62828 100%);
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.command-panel {
  position: absolute;
  bottom: 54px;
  left: 0;
  width: 280px;
  background: linear-gradient(180deg, #fffdf8 0%, #fff9e6 100%);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(139, 69, 19, 0.15);
  z-index: 30;
  overflow: hidden;
}

.command-header {
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(218, 165, 32, 0.1) 0%, transparent 100%);
  border-bottom: 1px solid rgba(139, 69, 19, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 0.9rem;
  color: #5d4037;
}

.close-small {
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  color: #8b4513;
  line-height: 1;
  opacity: 0.7;
  transition: all 0.2s;
}

.command-list {
  max-height: 220px;
  overflow-y: auto;
}

.command-item {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #5d4037;
}

.cmd-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 12px;
}

.delete-btn {
  background: none;
  border: none;
  color: #c62828;
  cursor: pointer;
  font-size: 1.3rem;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}

.processing-indicator {
  position: absolute;
  right: 120px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
}

.rag-error-bar {
  background: rgba(180, 83, 9, 0.15);
  border: 1px solid rgba(180, 83, 9, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 6px 0 0;
  font-size: 12px;
}

.rag-error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #b45309;
  font-weight: 500;
  margin-bottom: 4px;
}

.rag-dismiss-btn {
  background: none;
  border: none;
  color: #b45309;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.rag-error-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  color: #92400e;
}

.rag-error-stage {
  background: rgba(180, 83, 9, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
}

.rag-error-msg {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 小总结错误提示 */
.summary-error-bar {
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 6px 0 0;
  font-size: 12px;
  animation: slideDown 0.3s ease;
}

.summary-error-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #dc2626;
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 4px;
}

.summary-dismiss-btn {
  background: none;
  border: none;
  color: #dc2626;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.summary-dismiss-btn:hover {
  opacity: 0.7;
}

.summary-error-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  color: #991b1b;
}

.summary-error-floor {
  background: rgba(220, 38, 38, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
}

.summary-error-msg {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-error-hint {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(220, 38, 38, 0.2);
  color: #991b1b;
  font-size: 11px;
}

.new-message-tip {
  position: absolute;
  bottom: 80px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #475569;
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
.new-message-tip:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.new-message-tip:active {
  transform: translateY(0);
}


.load-more-container {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  margin-bottom: 10px;
}

.load-more-btn {
  background: rgba(139, 69, 19, 0.1);
  border: 1px solid rgba(139, 69, 19, 0.2);
  color: #5d4037;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.85rem;
}

.warning-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff5722;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 10px;
  box-shadow: 0 0 10px rgba(255, 87, 34, 0.6);
  animation: pulse-glow 2s infinite;
}

.warning-symbol {
  color: white;
  font-weight: bold;
  font-size: 1rem;
}

@keyframes pulse-glow {
  0% { box-shadow: 0 0 5px rgba(255, 87, 34, 0.4); }
  50% { box-shadow: 0 0 15px rgba(255, 87, 34, 0.8); }
  100% { box-shadow: 0 0 5px rgba(255, 87, 34, 0.4); }
}

.working-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: linear-gradient(135deg, #ff9500 0%, #ff7f00 100%);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(255, 149, 0, 0.4);
}

.working-text {
  font-size: 0.8rem;
  font-weight: 600;
  color: white;
}

/* 变量监视器 */
.variable-viewer {
  max-width: 800px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.variable-content {
  flex: 1;
  overflow-y: auto;
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.variable-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}

.modal-content {
  background: #fffdf8;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(139, 69, 19, 0.2);
}

.modal-content h3 {
  margin: 0 0 16px 0;
  color: #5d4037;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-btn {
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 500;
  background: linear-gradient(135deg, #8b4513 0%, #a0522d 100%);
  border: none;
  color: #fff;
}

/* 夜间模式补充 */
.dark-mode .plus-btn,
.dark-mode .command-btn {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.dark-mode .menu-popup,
.dark-mode .command-panel {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  border-color: rgba(99, 102, 241, 0.25);
}

.dark-mode .menu-item,
.dark-mode .command-item,
.dark-mode .command-header {
  color: #e0e7ff;
  border-bottom-color: rgba(99, 102, 241, 0.1);
}

.dark-mode .new-message-tip {
  background: rgba(30, 30, 50, 0.6);
  color: #c7d2fe;
  border-color: rgba(99, 102, 241, 0.2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(99, 102, 241, 0.1);
}

.dark-mode .load-more-btn {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.dark-mode .variable-content {
  background: #0f0f1a;
  color: #ccc;
}

.dark-mode .modal-content {
  background: #1a1a2e;
  border-color: rgba(99, 102, 241, 0.3);
}

.dark-mode .modal-content h3 {
  color: #e0e7ff;
}

.dark-mode .confirm-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 吐槽小剧场样式 */
.tucao-container {
  position: fixed;
  bottom: 160px; /* 在手机按钮上方 */
  right: 20px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.tucao-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
  border: 2px solid #fff;
  box-shadow: 0 4px 10px rgba(255, 154, 158, 0.4);
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  animation: float 3s ease-in-out infinite;
}

.tucao-btn:hover {
  transform: scale(1.1) rotate(10deg);
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0px); }
}

.tucao-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 12px;
  width: 260px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 154, 158, 0.3);
  transform-origin: bottom right;
  animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
}

@keyframes pop-in {
  0% { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}

.tucao-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
}

.tucao-title {
  font-weight: bold;
  color: #ff6b6b;
  font-size: 0.9rem;
}

.tucao-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
}

.tucao-content {
  color: #555;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.dark-mode .tucao-panel {
  background: rgba(30, 30, 46, 0.95);
  border-color: rgba(255, 154, 158, 0.2);
}

.dark-mode .tucao-content {
  color: #e0e0e0;
}

.dark-mode .tucao-title {
  color: #ff9a9e;
}

/* 上下文菜单样式 */
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1100;
  background: transparent;
}

.context-menu {
  position: fixed;
  background: linear-gradient(180deg, #fffdf8 0%, #fff9e6 100%);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(139, 69, 19, 0.2);
  overflow: hidden;
  min-width: 160px;
  animation: pop-in 0.15s ease-out;
}

.context-menu-item {
  padding: 12px 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
  color: #5d4037;
  white-space: nowrap;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  font-weight: 500;
  user-select: none;
}

.context-menu-item:last-child {
  border-bottom: none;
}

.context-menu-item:hover {
  background: linear-gradient(90deg, rgba(218, 165, 32, 0.15) 0%, rgba(218, 165, 32, 0.05) 100%);
  color: #8b4513;
}

.context-menu-item:active {
  background: rgba(218, 165, 32, 0.25);
}

.dark-mode .context-menu {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  border-color: rgba(99, 102, 241, 0.25);
}

.dark-mode .context-menu-item {
  color: #e0e7ff;
  border-bottom-color: rgba(99, 102, 241, 0.1);
}

.dark-mode .context-menu-item:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.gemini-tip-modal {
  max-width: 420px;
}

.gemini-tip-modal h3 {
  margin-bottom: 12px;
  font-size: 1.1rem;
}

.gemini-tip-modal p {
  margin-bottom: 8px;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #ccc;
}

.gemini-tip-modal strong {
  color: #ffd700;
}
</style>
