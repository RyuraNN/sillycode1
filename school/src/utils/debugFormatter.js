/**
 * Debug 格式化器
 * 负责在 Debug 模式下格式化内容以便调试
 */

/**
 * 格式化 Debug 模式下的内容
 * @param {string} text - 原始文本
 * @returns {string} 格式化后的 HTML
 */
export const formatDebugContent = (text) => {
  if (!text) return ''
  
  // 转义 HTML
  let processed = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // 高亮标签 <...>
  processed = processed.replace(/&lt;(\/?[a-zA-Z0-9_]+)(.*?)&gt;/g, (match) => {
    return `<span class="debug-tag" data-full="${encodeURIComponent(match)}" style="color: #4caf50; cursor: pointer; font-family: monospace; border-bottom: 1px dashed #4caf50;">${match}</span>`
  })

  // 高亮 [GAME_DATA]
  processed = processed.replace(/\[GAME_DATA\]([\s\S]*?)\[\/GAME_DATA\]/g, (match) => {
    return `<span class="debug-data" data-content="${encodeURIComponent(match)}" style="color: #4caf50; cursor: pointer; font-family: monospace; border: 1px solid #4caf50; display: block; padding: 4px; margin: 4px 0;">${match}</span>`
  })

  // 换行
  return processed.replace(/\n/g, '<br>')
}

/**
 * 解析 Debug 模式下点击的数据
 * @param {string} raw - 原始编码的数据
 * @returns {Object|null} 解析后的对象
 */
export const parseDebugData = (raw) => {
  try {
    const jsonStr = raw.replace(/\[\/?GAME_DATA\]/g, '')
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('Debug parse error:', e)
    return null
  }
}

/**
 * 解析 Debug 模式下点击的标签
 * @param {string} raw - 原始编码的标签
 * @returns {Object} 包含 raw 和 type 的对象
 */
export const parseDebugTag = (raw) => {
  return { raw: raw, type: 'tag' }
}
