<script setup>
/**
 * VirtualChatList.vue - 虚拟滚动聊天列表
 * 使用 vue-virtual-scroller 实现高性能消息渲染
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const props = defineProps({
  logs: {
    type: Array,
    required: true
  },
  debugMode: {
    type: Boolean,
    default: false
  },
  imageCacheMap: {
    type: Map,
    default: () => new Map()
  }
})

const emit = defineEmits([
  'imageClick',
  'retryImage',
  'contextMenu',
  'touchStart',
  'touchEnd',
  'scroll',
  'queueImageLoad',
  'debugClick'
])

const scrollerRef = ref(null)

// 消息内容缓存 - 避免重复计算
const contentCache = ref(new Map())

// 监听日志变化，清理旧缓存
watch(() => props.logs.length, () => {
  // 保留最近 100 条的缓存
  if (contentCache.value.size > 150) {
    const keysToKeep = new Set()
    const recentLogs = props.logs.slice(-100)
    recentLogs.forEach((log, idx) => {
      keysToKeep.add(getCacheKey(log, props.logs.length - 100 + idx))
    })
    
    for (const key of contentCache.value.keys()) {
      if (!keysToKeep.has(key)) {
        contentCache.value.delete(key)
      }
    }
  }
})

// 生成缓存键
const getCacheKey = (log, index) => {
  // 使用内容的前 50 字符 + 索引作为键
  const contentPrefix = (log.content || '').substring(0, 50)
  return `${index}_${contentPrefix}_${log.type}`
}

// 获取带缓存的显示内容
const getDisplayContent = (log, index) => {
  const cacheKey = getCacheKey(log, index)
  
  // 流式消息不缓存
  if (log.isStreaming) {
    return processContent(log, index)
  }
  
  if (contentCache.value.has(cacheKey)) {
    return contentCache.value.get(cacheKey)
  }
  
  const content = processContent(log, index)
  contentCache.value.set(cacheKey, content)
  return content
}

// 处理内容（原 getDisplayContentWithIndex 逻辑）
const processContent = (log, index) => {
  let content = log.content
  
  if (props.debugMode) {
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
    
    const url = props.imageCacheMap.get(id)
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
      emit('queueImageLoad', id)
      return `<div class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
                <span class="img-spinner"></span>
                <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">图片加载中...</span>
              </div>`
    }
  })

  return content
}

// Debug 内容格式化（简化版本）
const formatDebugContent = (content) => {
  // 简化的 debug 格式化
  return content
    .replace(/\[GAME_DATA\]/g, '<span class="debug-tag" style="color: #ff9800; background: rgba(255,152,0,0.1); padding: 2px 6px; border-radius: 4px; cursor: pointer;">[GAME_DATA]</span>')
    .replace(/\[\/GAME_DATA\]/g, '<span class="debug-tag" style="color: #ff9800; background: rgba(255,152,0,0.1); padding: 2px 6px; border-radius: 4px;">[/GAME_DATA]</span>')
}

// 消息项高度估算
const messageMinHeight = 60

// 为虚拟滚动准备的数据
const virtualItems = computed(() => {
  return props.logs.map((log, index) => ({
    ...log,
    _index: index,
    _id: `log_${index}_${log.type}`
  }))
})

// 事件处理 - 使用事件委托
const handleItemClick = (event, item) => {
  if (props.debugMode) {
    const target = event.target.closest('.debug-tag, .debug-data')
    if (target) {
      emit('debugClick', event, item._index)
      return
    }
  }
  
  const trigger = event.target.closest('.image-trigger')
  if (trigger) {
    const imgId = trigger.dataset.imgId
    const prompt = decodeURIComponent(trigger.dataset.prompt)
    const history = trigger.dataset.history || ''
    const originalTag = decodeURIComponent(trigger.dataset.originalTag || '')
    
    emit('imageClick', {
      imgId,
      prompt,
      history,
      logIndex: item._index,
      originalTag
    })
    return
  }

  const retryBtn = event.target.closest('.retry-image-btn')
  if (retryBtn) {
    const errorDiv = retryBtn.closest('.image-error')
    if (errorDiv) {
      emit('retryImage', {
        reqId: errorDiv.dataset.reqId,
        prompt: decodeURIComponent(errorDiv.dataset.prompt),
        logIndex: item._index
      })
    }
  }
}

const handleContextMenu = (event, item) => {
  event.preventDefault()
  emit('contextMenu', event, item._index)
}

let touchTimer = null

const handleTouchStart = (item) => {
  touchTimer = setTimeout(() => {
    emit('touchStart', item._index)
  }, 800)
}

const handleTouchEnd = () => {
  if (touchTimer) {
    clearTimeout(touchTimer)
    touchTimer = null
  }
  emit('touchEnd')
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (scrollerRef.value) {
      scrollerRef.value.scrollToBottom()
    }
  })
}

// 滚动事件（防抖）
let scrollTimeout = null
const handleScroll = (event) => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }
  scrollTimeout = setTimeout(() => {
    emit('scroll', event)
  }, 100)
}

// 暴露方法给父组件
defineExpose({
  scrollToBottom,
  scrollerRef
})
</script>

<template>
  <div class="virtual-chat-container">
    <RecycleScroller
      ref="scrollerRef"
      class="scroller"
      :items="virtualItems"
      :min-item-size="messageMinHeight"
      key-field="_id"
      v-slot="{ item }"
      @scroll="handleScroll"
    >
      <div 
        class="log-item" 
        :class="item.type"
        @click="handleItemClick($event, item)"
        @contextmenu="handleContextMenu($event, item)"
        @touchstart="handleTouchStart(item)"
        @touchend="handleTouchEnd"
        @touchmove="handleTouchEnd"
      >
        <div 
          class="log-content" 
          v-html="getDisplayContent(item, item._index)"
        ></div>
      </div>
    </RecycleScroller>
  </div>
</template>

<style scoped>
.virtual-chat-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.scroller {
  height: 100%;
}

.log-item {
  padding: 12px 16px;
  margin-bottom: 8px;
  border-radius: 12px;
  word-wrap: break-word;
  line-height: 1.6;
}

.log-item.player {
  background: linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(184, 134, 11, 0.08) 100%);
  border-left: 3px solid rgba(218, 165, 32, 0.6);
  margin-left: 20px;
}

.log-item.ai {
  background: linear-gradient(135deg, rgba(139, 69, 19, 0.08) 0%, rgba(160, 82, 45, 0.05) 100%);
  border-left: 3px solid rgba(139, 69, 19, 0.4);
  margin-right: 20px;
}

.log-item.summary {
  background: linear-gradient(135deg, rgba(100, 149, 237, 0.1) 0%, rgba(65, 105, 225, 0.08) 100%);
  border-left: 3px solid rgba(65, 105, 225, 0.5);
  font-style: italic;
  font-size: 0.9em;
}

.log-content {
  color: #3e2723;
  font-size: 1rem;
}

/* 夜间模式 */
:deep(.dark-mode) .log-item.player {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
  border-left-color: rgba(99, 102, 241, 0.6);
}

:deep(.dark-mode) .log-item.ai {
  background: linear-gradient(135deg, rgba(30, 30, 60, 0.8) 0%, rgba(40, 40, 70, 0.6) 100%);
  border-left-color: rgba(139, 92, 246, 0.4);
}

:deep(.dark-mode) .log-content {
  color: #e0e7ff;
}
</style>
