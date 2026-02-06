/**
 * 事件轮播 Composable
 * 负责事件横幅的轮播显示
 */

import { ref, computed, watch, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

/**
 * 事件轮播 Composable
 * @returns {Object} 轮播相关的方法和状态
 */
export function useEventCarousel() {
  const gameStore = useGameStore()
  
  const currentEventIndex = ref(0)
  const isBannerCollapsed = ref(false)
  let carouselTimer = null

  // 获取活跃事件
  const activeEvents = computed(() => gameStore.getActiveEventsForBanner())
  
  // 当前显示的事件
  const currentEvent = computed(() => {
    if (activeEvents.value.length === 0) return null
    return activeEvents.value[currentEventIndex.value % activeEvents.value.length]
  })

  /**
   * 启动轮播
   */
  const startCarousel = () => {
    stopCarousel()
    if (activeEvents.value.length > 1) {
      carouselTimer = setInterval(() => {
        currentEventIndex.value = (currentEventIndex.value + 1) % activeEvents.value.length
      }, 5000)
    }
  }

  /**
   * 停止轮播
   */
  const stopCarousel = () => {
    if (carouselTimer) {
      clearInterval(carouselTimer)
      carouselTimer = null
    }
  }

  /**
   * 折叠横幅
   */
  const collapseBanner = () => {
    isBannerCollapsed.value = true
  }

  /**
   * 展开横幅
   */
  const expandBanner = () => {
    isBannerCollapsed.value = false
  }

  // 监听事件数量变化
  watch(() => activeEvents.value.length, () => {
    // 如果当前索引超出范围，重置
    if (currentEventIndex.value >= activeEvents.value.length) {
      currentEventIndex.value = 0
    }
    startCarousel()
  }, { immediate: true })

  // 组件卸载时停止轮播
  onUnmounted(() => {
    stopCarousel()
  })

  return {
    activeEvents,
    currentEvent,
    currentEventIndex,
    isBannerCollapsed,
    startCarousel,
    stopCarousel,
    collapseBanner,
    expandBanner
  }
}

export default useEventCarousel
