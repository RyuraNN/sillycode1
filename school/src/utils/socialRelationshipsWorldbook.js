/**
 * 社交关系数据世界书管理工具
 * 负责将角色的性格、关系、目标等数据存储在世界书中
 * 该世界书条目默认禁用，仅作为数据存储使用，避免污染AI上下文
 */

import { DEFAULT_RELATIONSHIPS, DEFAULT_PERSONALITIES, DEFAULT_GOALS, DEFAULT_PRIORITIES } from '../data/relationshipData'

const ENTRY_NAME = '[Social_Data] 社交关系数据'
const ENTRY_KEY = ['social_data_storage'] // 触发词，虽然禁用状态下不会触发，但保持规范

/**
 * 确保社交数据世界书条目存在
 * 如果不存在，则使用 relationshipData.js 中的默认数据创建
 * @returns {Promise<Object>} 当前的社交数据
 */
export async function ensureSocialDataWorldbook() {
  // 如果不在 ST 环境下，返回默认数据
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return buildInitialData()
  }

  try {
    // 获取当前角色卡绑定的世界书名称
    const books = window.getCharWorldbookNames('current')
    const bookName = books?.primary || (books?.additional && books.additional[0])
    
    // 如果没有绑定任何世界书，返回默认数据
    if (!bookName) {
      console.warn('[SocialWorldbook] No worldbook bound to character, using default data')
      return buildInitialData()
    }

    // 读取或创建条目
    let entryData = null
    await window.updateWorldbookWith(bookName, (entries) => {
      const entry = entries.find(e => e.name === ENTRY_NAME)
      
      if (entry) {
        try {
          entryData = JSON.parse(entry.content)
        } catch (e) {
          console.warn('[SocialWorldbook] Failed to parse existing data, resetting to default')
          entryData = buildInitialData()
          entry.content = JSON.stringify(entryData, null, 2)
        }
      } else {
        console.log('[SocialWorldbook] Entry not found, creating default...')
        entryData = buildInitialData()
        entries.push({
          name: ENTRY_NAME,
          content: JSON.stringify(entryData, null, 2),
          key: ENTRY_KEY,
          enabled: false, // 关键：禁用状态
          position: 0,
          constant: false,
          selective: false
        })
      }
      return entries // 返回更新后的条目列表
    })

    return entryData || buildInitialData()
  } catch (e) {
    console.error('[SocialWorldbook] Error ensuring worldbook:', e)
    return buildInitialData()
  }
}

/**
 * 从世界书获取社交数据
 * @returns {Promise<Object|null>}
 */
export async function fetchSocialData() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getContext !== 'function') {
    return null
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookName = books?.primary || (books?.additional && books.additional[0])
    if (!bookName) return null

    // 获取上下文以读取世界书内容
    // 注意：updateWorldbookWith 不会返回内容，我们需要手动查找
    const context = await window.getContext()
    const worldbooks = context.worldInfo || []
    const book = worldbooks.find(b => b.name === bookName)
    
    if (book && book.entries) {
      const entry = Object.values(book.entries).find(e => e.name === ENTRY_NAME || (e.comment && e.comment === ENTRY_NAME))
      if (entry && entry.content) {
        return JSON.parse(entry.content)
      }
    }
    return null
  } catch (e) {
    console.error('[SocialWorldbook] Error fetching data:', e)
    return null
  }
}

/**
 * 深度合并两个对象（source 合并到 target，source 优先）
 * @param {Object} target 目标对象
 * @param {Object} source 源对象（优先）
 * @returns {Object} 合并后的对象
 */
function deepMergeSocialData(target, source) {
  if (!target) return source
  if (!source) return target
  
  const result = { ...target }
  
  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = result[key]
    
    if (sourceVal === null || sourceVal === undefined) continue
    
    if (typeof sourceVal === 'object' && !Array.isArray(sourceVal) && sourceVal !== null
        && typeof targetVal === 'object' && !Array.isArray(targetVal) && targetVal !== null) {
      // 递归合并嵌套对象
      result[key] = deepMergeSocialData(targetVal, sourceVal)
    } else {
      // 直接覆盖（包括数组、基本类型）
      result[key] = sourceVal
    }
  }
  
  return result
}

/**
 * 保存社交数据到世界书（增量合并模式）
 * 不会覆盖世界书中已有的其他角色数据，只合并传入的变更
 * @param {Object} data 要合并的社交数据对象（可以是部分数据）
 * @returns {Promise<boolean>}
 */
export async function saveSocialData(data) {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    return false
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookName = books?.primary || (books?.additional && books.additional[0])
    
    if (!bookName) {
      console.warn('[SocialWorldbook] No worldbook bound, cannot save data')
      return false
    }

    await window.updateWorldbookWith(bookName, (entries) => {
      const index = entries.findIndex(e => e.name === ENTRY_NAME)
      
      // 读取现有数据
      let existingData = {}
      if (index !== -1 && entries[index].content) {
        try {
          existingData = JSON.parse(entries[index].content)
        } catch (e) {
          console.warn('[SocialWorldbook] Failed to parse existing data during save, starting fresh')
          existingData = {}
        }
      }
      
      // 增量合并：将传入的 data 合并到现有数据上
      const mergedData = deepMergeSocialData(existingData, data)
      const content = JSON.stringify(mergedData, null, 2)
      
      const newEntry = {
        name: ENTRY_NAME,
        content: content,
        key: ENTRY_KEY,
        enabled: false, // 保持禁用
        position: 0,
        constant: false,
        selective: false
      }

      if (index !== -1) {
        // 更新现有条目
        entries[index] = { ...entries[index], ...newEntry, id: entries[index].id, uid: entries[index].uid }
      } else {
        // 创建新条目
        entries.push(newEntry)
      }
      
      return entries
    })
    
    console.log('[SocialWorldbook] Data saved (incremental merge) successfully')
    return true
  } catch (e) {
    console.error('[SocialWorldbook] Error saving data:', e)
    return false
  }
}

// ========== 内部辅助函数 ==========

/**
 * 构建初始数据结构
 */
function buildInitialData() {
  const data = {}
  
  // 收集所有涉及的角色名
  const allNames = new Set([
    ...Object.keys(DEFAULT_PERSONALITIES),
    ...Object.keys(DEFAULT_RELATIONSHIPS),
    ...Object.keys(DEFAULT_GOALS),
    ...Object.keys(DEFAULT_PRIORITIES)
  ])
  
  for (const name of allNames) {
    data[name] = {
      personality: DEFAULT_PERSONALITIES[name] || { order: 0, altruism: 0, tradition: 0, peace: 50 },
      relationships: DEFAULT_RELATIONSHIPS[name] || {},
      goals: DEFAULT_GOALS[name] || { immediate: '', shortTerm: '', longTerm: '' },
      priorities: DEFAULT_PRIORITIES[name] || { academics: 50, social: 50, hobbies: 50, survival: 50, club: 50 }
    }
  }
  
  return data
}
