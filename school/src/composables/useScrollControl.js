/**
 * 滚动控制 Composable
 * 负责聊天区域的滚动行为管理
 */

import { ref, nextTick } from 'vue'

/**
 * 滚动控制 Composable
 * @returns {Object} 滚动相关的方法和状态
 */
export function useScrollControl() {
  const autoScrollEnabled = ref(true)
  const showNewMessageTip = ref(false)
  let scrollAnimationId = null

  /**
   * 缓动函数: Ease-in-out
   * @param {number} t - 进度 (0-1)
   * @returns {number} 缓动后的进度
   */
  const easeInOutQuad = (t) => {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  /**
   * 平滑滚动到底部
   * @param {HTMLElement} el - 滚动容器元素
   */
  const scrollToBottom = (el) => {
    if (!el || !autoScrollEnabled.value) return

    nextTick(() => {
      const start = el.scrollTop
      const target = el.scrollHeight - el.clientHeight
      const distance = target - start
      
      // 如果距离很小，直接设置
      if (Math.abs(distance) < 5) {
        el.scrollTop = target
        return
      }

      const duration = 500 // 动画持续时间 ms
      const startTime = performance.now()

      // 如果已经在动画中，取消之前的
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId)
      }

      const animateScroll = (currentTime) => {
        const elapsed = currentTime - startTime
        
        if (elapsed < duration) {
          if (!autoScrollEnabled.value) {
            scrollAnimationId = null
            return
          }
          
          const progress = easeInOutQuad(elapsed / duration)
          el.scrollTop = start + distance * progress
          scrollAnimationId = requestAnimationFrame(animateScroll)
        } else {
          el.scrollTop = target
          scrollAnimationId = null
        }
      }

      scrollAnimationId = requestAnimationFrame(animateScroll)
    })
  }

  /**
   * 处理新内容（替代强制自动滚动）
   * @param {HTMLElement} el - 滚动容器元素
   */
  const handleNewContent = (el) => {
    if (!el) return
    
    // 判断是否接近底部 (例如 100px 阈值)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    
    if (isNearBottom) {
      // 如果已经在底部，保持跟随
      scrollToBottom(el)
    } else {
      // 否则显示新消息提示
      showNewMessageTip.value = true
    }
  }

  /**
   * 处理用户手动滚动
   * @param {HTMLElement} el - 滚动容器元素
   * @param {boolean} isGenerating - 是否正在生成中
   */
  const handleUserScroll = (el, isGenerating) => {
    // 只有在生成过程中，用户的手动滚动才会禁用自动滚动
    if (isGenerating) {
      autoScrollEnabled.value = false
    }
    
    // 检查是否滚动到底部，是则隐藏提示
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      if (isNearBottom) {
        showNewMessageTip.value = false
      }
    }
  }

  /**
   * 重置自动滚动状态
   */
  const resetAutoScroll = () => {
    autoScrollEnabled.value = true
  }

  /**
   * 点击新消息提示后的处理
   * @param {HTMLElement} el - 滚动容器元素
   */
  const handleNewMessageTipClick = (el) => {
    scrollToBottom(el)
    showNewMessageTip.value = false
  }

  return {
    autoScrollEnabled,
    showNewMessageTip,
    scrollToBottom,
    handleNewContent,
    handleUserScroll,
    resetAutoScroll,
    handleNewMessageTipClick
  }
}

export default useScrollControl
