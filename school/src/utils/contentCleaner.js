/**
 * 内容清洗器
 * 负责清理 AI 返回内容中的系统标签
 */

import { useGameStore } from '../stores/gameStore'

/**
 * 清洗系统标签
 * @param {string} text - 原始文本
 * @returns {string} 清洗后的文本
 */
export const cleanSystemTags = (text) => {
  const gameStore = useGameStore()
  let cleaned = text

  // 0. 移除 <safe> 标签及其内容
  cleaned = cleaned.replace(/<safe>[\s\S]*?<\/safe>/gi, '')
  
  // 0.1 清理残留的孤立 <safe> 或 </safe> 标签
  cleaned = cleaned.replace(/<\/?safe>/gi, '')

  // 0.5 准备白名单
  const contentTags = gameStore.settings.customContentTags || ['content']
  const htmlTags = [
    'button', 'span', 'div', 'p', 'br', 'b', 'i', 'strong', 'em', 'u', 's', 'strike', 
    'font', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'a', 'hr', 'small', 'big',
    'ruby', 'rt', 'rp', 'htmlcontent'
  ]
  const keepTags = ['think', 'thought', 'thinking', 'generate_image', ...contentTags, ...htmlTags]
  const keepPattern = keepTags.join('|')

  // 1. 移除已知系统标签
  const knownSystemTags = [
    /<image>[\s\S]*?<\/image>/gi,
    /<image_think>[\s\S]*?<\/image_think>/gi,
    /<imgthink[\s\S]*?<\/imgthink>/g,
    /<imgthink\s*\/?>/g,
    /<extrathink>[\s\S]*?<\/extrathink>/gi,
    /<tucao>[\s\S]*?<\/tucao>/gi,
    /<social_msg[\s\S]*?<\/social_msg>/g,
    /<add_friend[\s\S]*?<\/add_friend>/g,
    /<social_status[\s\S]*?<\/social_status>/g,
    /<add_calendar_event[\s\S]*?\/?>/g,
    /<moment_post[\s\S]*?<\/moment_post>/g,
    /<moment_action[\s\S]*?<\/moment_action>/g,
    /<moment_like[\s\S]*?\/?>/g,
    /<moment_comment[\s\S]*?<\/moment_comment>/g,
    /<join_club[\s\S]*?\/?>/g,
    /<leave_club[\s\S]*?\/?>/g,
    /<reject_club[\s\S]*?\/?>/g,
    /<add_item[\s\S]*?\/?>/g,
    /<remove_item[\s\S]*?\/?>/g,
    /<use_item[\s\S]*?\/?>/g,
    /<forum_post[\s\S]*?<\/forum_post>/g,
    /<forum_reply[\s\S]*?<\/forum_reply>/g,
    /<forum_like[\s\S]*?\/?>/g,
    /<event_involved[\s\S]*?\/?>/g,
    /<update_impression[\s\S]*?\/?>/g
  ]
  
  knownSystemTags.forEach(regex => {
    cleaned = cleaned.replace(regex, '')
  })

  // 1.5 处理 htmlcontent (保留内容)
  cleaned = cleaned.replace(/<htmlcontent\b[^>]*>([\s\S]*?)<\/htmlcontent>/gi, '$1')

  // 2. 移除通用未知标签 <tag>content</tag>，但保留白名单
  const tagRegex = new RegExp(`<(?!${keepPattern}\\b)([a-zA-Z0-9_]+)[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi')
  cleaned = cleaned.replace(tagRegex, '')

  // 3. 移除通用未知自闭合标签 <tag />，但保留白名单
  const selfClosingRegex = new RegExp(`<(?!${keepPattern}\\b)([a-zA-Z0-9_]+)[^>]*\\/>`, 'gi')
  cleaned = cleaned.replace(selfClosingRegex, '')

  // 4. 移除通用未知标签 [tag]content[/tag]
  cleaned = cleaned.replace(/\[([a-zA-Z0-9_]+)[^\]]*\][\s\S]*?\[\/\1\]/gi, '')
  
  // 5. 移除正文标签的外壳（保留内容）
  contentTags.forEach(tag => {
    const openTagRegex = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
    const closeTagRegex = new RegExp(`<\/${tag}>`, 'gi')
    cleaned = cleaned.replace(openTagRegex, '').replace(closeTagRegex, '')
  })
  
  // 移除因删除标签而产生的多余空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

/**
 * 解析插入图片指令
 * @param {string} content - 包含 <insert_image> 标签的文本
 * @returns {Array<{anchor: string, prompt: string}>} 插入指令数组
 */
export const parseInsertImageTags = (content) => {
  const regex = /<insert_image>([\s\S]*?)<\/insert_image>/gi
  const results = []
  let match
  
  while ((match = regex.exec(content)) !== null) {
    const inner = match[1]
    const anchorMatch = /<anchor>([\s\S]*?)<\/anchor>/i.exec(inner)
    const promptMatch = /<prompt>([\s\S]*?)<\/prompt>/i.exec(inner)
    
    if (anchorMatch && promptMatch) {
      results.push({
        anchor: anchorMatch[1].trim(),
        prompt: promptMatch[1].trim()
      })
    }
  }
  return results
}

/**
 * 模糊匹配并在锚点位置插入图片占位符
 * @param {string} content - 原始内容
 * @param {Array<{anchor: string, prompt: string}>} insertions - 插入指令数组
 * @returns {string} 处理后的内容
 */
export const insertImagesAtAnchors = (content, insertions) => {
  let result = content
  
  for (const { anchor, prompt } of insertions) {
    if (!anchor || !prompt) continue
    
    // 1. 尝试精确匹配
    let index = result.indexOf(anchor)
    
    // 2. 如果失败，尝试宽松匹配（忽略空白字符）
    if (index === -1) {
      const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = escapedAnchor.replace(/\s+/g, '\\s*')
      const regex = new RegExp(pattern)
      const match = regex.exec(result)
      if (match) {
        index = match.index
      }
    }
    
    if (index !== -1) {
      // 生成生图标签
      const imgTag = `<generate_image prompt="${prompt}" />`
      
      // 构建正则进行替换，确保只替换第一个匹配项
      const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
      const replaceRegex = new RegExp(escapedAnchor)
      
      result = result.replace(replaceRegex, (match) => {
        return match + '\n' + imgTag + '\n'
      })
    } else {
      console.warn(`[ContentCleaner] Anchor not found: "${anchor.substring(0, 20)}..."`)
    }
  }
  return result
}
