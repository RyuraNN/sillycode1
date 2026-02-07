/**
 * 弹幕系统 Composable
 * 负责弹幕的显示和生命周期管理
 */

import { ref } from 'vue'

// 全局状态（单例模式）
const danmakuList = ref([])

/**
 * 弹幕系统 Composable
 * @returns {Object} 弹幕相关的方法和状态
 */
export function useDanmaku() {
  /**
   * 显示弹幕
   * @param {Array<string>|Array<{text: string, type: string}>} changes - 变化描述列表
   * @param {string} [defaultType='system'] - 默认弹幕类型
   */
  const showDanmaku = (changes, defaultType = 'system') => {
    if (!changes || changes.length === 0) return
    
    changes.forEach((item, index) => {
      const text = typeof item === 'string' ? item : item.text
      const type = typeof item === 'string' ? defaultType : (item.type || defaultType)

      setTimeout(() => {
        danmakuList.value.push({
          id: Date.now() + index,
          text: text,
          type: type,
          top: 5 + Math.random() * 80 + '%' // 随机高度 5% - 85%
        })
        
        // 8秒后移除 (给足够时间飘过)
        setTimeout(() => {
          danmakuList.value.shift()
        }, 8000)
      }, index * 300) // 错开显示
    })
  }

  /**
   * 清空所有弹幕
   */
  const clearDanmaku = () => {
    danmakuList.value = []
  }

  return {
    danmakuList,
    showDanmaku,
    clearDanmaku
  }
}

export default useDanmaku
