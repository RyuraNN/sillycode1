/**
 * 世界书辅助工具
 * 统一处理世界书名称获取，支持角色卡绑定、聊天绑定、全局世界书三种来源
 */

/**
 * 获取当前可用的世界书名称（优先级：角色卡 primary > 聊天绑定 > 角色卡 additional）
 * @returns {string|null} 世界书名称，或 null
 */
export function getCurrentBookName() {
  try {
    // 1. 角色卡绑定的世界书
    if (typeof window.getCharWorldbookNames === 'function') {
      const books = window.getCharWorldbookNames('current')
      if (books?.primary) return books.primary
      if (books?.additional?.length > 0) return books.additional[0]
    }

    // 2. 聊天绑定的世界书
    if (typeof window.getChatWorldbookName === 'function') {
      const chatBook = window.getChatWorldbookName('current')
      if (chatBook) return chatBook
    }

    return null
  } catch (e) {
    console.warn('[WorldbookHelper] Error getting book name:', e?.message || e)
    return null
  }
}

/**
 * 获取所有可用的世界书名称列表（去重）
 * @returns {string[]} 世界书名称数组
 */
export function getAllBookNames() {
  const names = new Set()
  try {
    if (typeof window.getCharWorldbookNames === 'function') {
      const books = window.getCharWorldbookNames('current')
      if (books?.primary) names.add(books.primary)
      if (books?.additional) books.additional.forEach(n => names.add(n))
    }
    if (typeof window.getChatWorldbookName === 'function') {
      const chatBook = window.getChatWorldbookName('current')
      if (chatBook) names.add(chatBook)
    }
  } catch (e) {
    console.warn('[WorldbookHelper] Error getting all book names:', e?.message || e)
  }
  return [...names]
}

/**
 * 检查世界书 API 是否可用
 * @returns {boolean}
 */
export function isWorldbookAvailable() {
  return typeof window.getWorldbook === 'function' &&
    (typeof window.getCharWorldbookNames === 'function' || typeof window.getChatWorldbookName === 'function')
}
