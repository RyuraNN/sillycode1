/**
 * 弹幕系统 Composable
 * 负责弹幕的显示和生命周期管理
 */

import { ref } from 'vue'

/**
 * 弹幕系统 Composable
 * @returns {Object} 弹幕相关的方法和状态
 */
export function useDanmaku() {
  const danmakuList = ref([])

  /**
   * 显示弹幕
   * @param {Array<string>} changes - 变化描述列表
   */
  const showDanmaku = (changes) => {
    if (!changes || changes.length === 0) return
    
    changes.forEach((text, index) => {
      setTimeout(() => {
        danmakuList.value.push({
          id: Date.now() + index,
          text: text,
          top: 10 + Math.random() * 40 + '%' // 随机高度
        })
        
        // 5秒后移除
        setTimeout(() => {
          danmakuList.value.shift()
        }, 5000)
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
