import { useGameStore } from '../stores/gameStore'
import { getCurrentBookName } from './worldbookHelper'

const ENTRY_PREFIX = '[Social:'
const MOMENT_PREFIX = '[Moment:'

// 获取当前运行 ID
function getCurrentRunId() {
  const gameStore = useGameStore()
  return gameStore.currentRunId || 'default'
}

// 生成条目前缀 [Social:runId:
function getEntryPrefix(runId) {
  return `[Social:${runId}:`
}

// 生成朋友圈条目前缀
function getMomentPrefix(runId) {
  return `[Moment:${runId}:`
}

// 规范化 ID：将 npc_ 前缀替换为 char_
function normalizeId(id) {
  if (typeof id === 'string' && id.startsWith('npc_')) {
    return id.replace('npc_', 'char_')
  }
  return id
}

// 解析条目内容 (支持 JSON 和 纯文本)
function parseEntryContent(content) {
  // 1. 尝试解析 JSON (兼容旧数据)
  try {
    const data = JSON.parse(content)
    if (data.messages) return data
  } catch (e) {
    // 忽略错误，尝试解析文本
  }

  // 2. 解析纯文本格式
  // --同桌聊天记录开始--
  // [系统信息: 2条未读]
  // 同桌: 消息1
  // Player: 消息2
  // --同桌聊天记录结束--
  const messages = []
  let unreadCount = 0
  const lines = content.split('\n')
  const gameStore = useGameStore()
  const playerName = gameStore.player.name

  for (const line of lines) {
    // 忽略首尾标签
    if (line.startsWith('--') && line.endsWith('--')) continue

    const sysMatch = line.match(/^\[系统信息:\s*(\d+)条未读\]/)
    if (sysMatch) {
      unreadCount = parseInt(sysMatch[1], 10)
      continue
    }

    const msgMatch = line.match(/^(.+?):\s*(.*)$/)
    if (msgMatch) {
      const sender = msgMatch[1]
      const text = msgMatch[2]
      messages.push({
        id: Date.now() + Math.random(), // 伪造 ID
        type: sender === playerName ? 'self' : 'other',
        sender: sender,
        content: text,
        time: '' // 丢失时间信息
      })
    }
  }

  return { messages, unreadCount }
}

// 格式化条目内容 (精简文本格式，带包裹标签)
function formatEntryContent(data, name, members = null) {
  const gameStore = useGameStore()
  const limit = gameStore.settings.socialHistoryLimit || 50
  const recentMessages = data.messages.slice(-limit)
  
  let text = `--${name}聊天记录开始--\n`
  
  // 如果是群聊且提供了成员列表，添加成员信息
  if (members && members.length > 0) {
    text += `[成员] ${members.join(', ')}\n`
  }
  
  text += `[系统信息: ${data.unreadCount || 0}条未读]\n`
  
  for (const msg of recentMessages) {
    // 确保有 sender
    const sender = msg.sender || (msg.type === 'self' ? 'Player' : 'Unknown')
    // 移除换行符，避免格式混乱
    const content = msg.content.replace(/\n/g, ' ')
    text += `${sender}: ${content}\n`
  }
  
  text += `--${name}聊天记录结束--`
  return text
}

// 格式化朋友圈内容为精简文本（用于世界书）
function formatMomentContent(moment) {
  let text = `[朋友圈动态] ${moment.name}: ${moment.content}`
  
  // 添加点赞信息
  if (moment.likes && moment.likes.length > 0) {
    const likeNames = moment.likes.map(l => l.name).join('、')
    text += `\n[点赞] ${likeNames}`
  }
  
  // 添加评论信息（最多显示3条最新评论）
  if (moment.comments && moment.comments.length > 0) {
    const recentComments = moment.comments.slice(-3)
    for (const comment of recentComments) {
      text += `\n[评论] ${comment.name}: ${comment.content}`
    }
  }
  
  text += `\n(ID: ${moment.id})`
  
  return text
}

/**
 * 获取指定 ID 的社交数据
 * @param {string} id 好友或群组 ID
 * @returns {Promise<Object|null>} { messages: [], unreadCount: 0 }
 */
export async function getSocialData(id) {
  id = normalizeId(id)
  
  // 1. 优先从 Store 获取 (全量数据)
  const gameStore = useGameStore()
  const isFriend = gameStore.player.social.friends.find(f => f.id === id)
  const isGroup = gameStore.player.social.groups.find(g => g.id === id)
  const storeItem = isFriend || isGroup
  
  if (storeItem && storeItem.messages && storeItem.messages.length > 0) {
    return {
      messages: [...storeItem.messages], // 返回副本，避免引用污染
      unreadCount: storeItem.unreadCount || 0
    }
  }

  // 2. 如果 Store 没有，尝试从世界书获取 (兜底)
  const bookName = getCurrentBookName()
  if (!bookName) return null

  const runId = getCurrentRunId()
  const prefix = getEntryPrefix(runId)

  try {
    const entries = await window.getWorldbook(bookName)
    const entry = entries.find(e => e.name.startsWith(`${prefix}${id}]`))
    
    if (entry) {
      return parseEntryContent(entry.content)
    }
  } catch (e) {
    console.error('[SocialWorldbook] Error getting social data:', e)
  }
  return null
}

/**
 * 保存社交数据（创建或更新条目，同时更新 Store）
 * @param {string} id 好友或群组 ID
 * @param {string} name 显示名称（用于条目标题和关键词）
 * @param {Object} data 数据对象 { messages: [], unreadCount: 0 }
 * @param {Array} keys 关键词列表（通常是好友名或群成员名）
 * @param {number} floor 当前楼层 (可选)
 */
export async function saveSocialData(id, name, data, keys = [], floor = 0) {
  const bookName = getCurrentBookName()
  if (!bookName) return false

  id = normalizeId(id)
  const runId = getCurrentRunId()
  const prefix = getEntryPrefix(runId)
  const gameStore = useGameStore()

  // 处理消息发送者名称并添加楼层
  if (data.messages) {
    data.messages = data.messages.map(msg => {
      const newMsg = { ...msg }
      if (newMsg.type === 'self') {
        newMsg.sender = gameStore.player.name
      } else if (newMsg.type === 'other') {
        newMsg.sender = newMsg.sender || name
      }
      if (floor > 0 && !newMsg.floor) {
        newMsg.floor = floor
      }
      return newMsg
    })
  }

  // 1. 更新 Store (全量备份)
  const isFriend = gameStore.player.social.friends.find(f => f.id === id)
  const isGroup = gameStore.player.social.groups.find(g => g.id === id)
  const storeItem = isFriend || isGroup

  if (storeItem) {
    // 更新元数据
    let lastMsg = ''
    let lastTime = ''
    if (data.messages.length > 0) {
      const last = data.messages[data.messages.length - 1]
      lastMsg = last.content
      lastTime = last.time
    }
    
    storeItem.lastMessage = lastMsg
    storeItem.lastMessageTime = lastTime
    storeItem.unreadCount = data.unreadCount
    // 更新完整消息记录
    storeItem.messages = data.messages
  }

  // 2. 更新世界书 (精简存储)
  // 自动获取群成员作为关键词
  let allKeys = [...keys]
  if (isGroup && storeItem.members) {
    // 获取所有成员的名字
    const memberNames = storeItem.members.map(memberId => {
      if (memberId === 'player') return gameStore.player.name
      const friend = gameStore.player.social.friends.find(f => f.id === memberId)
      if (friend) return friend.name
      // 如果不是好友，尝试从 NPC 列表获取（这里假设 NPC 列表存在且包含所有 NPC）
      const npc = gameStore.npcs.find(n => n.id === memberId)
      if (npc) return npc.name
      return null
    }).filter(n => n)
    allKeys = [...allKeys, ...memberNames]
  }

  // 确保 keys 包含 name
  const uniqueKeys = [...new Set([...allKeys, name])]
  const entryName = `${prefix}${id}] ${name}`
  
  // 获取成员名称列表（仅用于群聊）
  let memberNames = null
  if (isGroup && storeItem.members) {
    memberNames = storeItem.members.map(memberId => {
      if (memberId === 'player') return gameStore.player.name
      const friend = gameStore.player.social.friends.find(f => f.id === memberId)
      if (friend) return friend.name
      const npc = gameStore.npcs.find(n => n.id === memberId)
      if (npc) return npc.name
      return null
    }).filter(n => n)
  }
  
  const content = formatEntryContent(data, name, memberNames) // 传入成员列表

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      const existingIndex = entries.findIndex(e => e.name.startsWith(`${prefix}${id}]`))
      
      const newEntry = {
        uid: existingIndex > -1 ? entries[existingIndex].uid : Date.now(),
        name: entryName,
        content: content,
        enabled: true,
        strategy: {
          type: 'constant', // 蓝灯
          keys: uniqueKeys,
          keys_secondary: { logic: 'not_all', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'after_character_definition',
          order: 5
        },
        probability: 100,
        recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
        effect: { sticky: null, cooldown: null, delay: null }
      }

      if (existingIndex > -1) {
        entries[existingIndex] = { ...entries[existingIndex], ...newEntry, uid: entries[existingIndex].uid }
      } else {
        console.log(`[SocialWorldbook] Creating new entry for ${id} (RunID: ${runId})`)
        entries.push(newEntry)
      }
      return entries
    })

    return true
  } catch (e) {
    console.error('[SocialWorldbook] Error saving social data:', e)
    return false
  }
}

/**
 * 删除指定消息
 * @param {string} chatId 会话 ID
 * @param {number} msgId 消息 ID (时间戳)
 */
export async function deleteSocialMessage(chatId, msgId) {
  const bookName = getCurrentBookName()
  if (!bookName) return

  chatId = normalizeId(chatId)
  const runId = getCurrentRunId()
  const prefix = getEntryPrefix(runId)
  const gameStore = useGameStore()

  // 1. 从 Store 删除
  const isFriend = gameStore.player.social.friends.find(f => f.id === chatId)
  const isGroup = gameStore.player.social.groups.find(g => g.id === chatId)
  const storeItem = isFriend || isGroup

  if (storeItem && storeItem.messages) {
    const initialLength = storeItem.messages.length
    storeItem.messages = storeItem.messages.filter(m => m.id !== msgId)
    
    if (storeItem.messages.length !== initialLength) {
      console.log(`[SocialWorldbook] Deleted message ${msgId} from ${chatId} in Store`)
      
      // 更新元数据
      if (storeItem.messages.length > 0) {
        const last = storeItem.messages[storeItem.messages.length - 1]
        storeItem.lastMessage = last.content
        storeItem.lastMessageTime = last.time
      } else {
        storeItem.lastMessage = ''
        storeItem.lastMessageTime = ''
      }

      // 2. 刷新世界书 (使用 Store 中的新数据重新生成)
      // 我们需要 name 来调用 saveSocialData，从 storeItem 获取
      await saveSocialData(chatId, storeItem.name, {
        messages: storeItem.messages,
        unreadCount: storeItem.unreadCount
      })
    }
  }
}

/**
 * 保存朋友圈到世界书
 * @param {Object} moment 朋友圈数据
 * @param {Array} keywords 关键词列表（好友名称）
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveMomentToWorldbook(moment, keywords = []) {
  const bookName = getCurrentBookName()
  if (!bookName) {
    console.warn('[SocialWorldbook] Worldbook not available for saving moment')
    return false
  }

  const runId = getCurrentRunId()
  const prefix = getMomentPrefix(runId)
  const entryName = `${prefix}${moment.id}] ${moment.name}`
  const content = formatMomentContent(moment)

  // 确保关键词包含作者名称
  const uniqueKeys = [...new Set([...keywords, moment.name])]

  console.log(`[SocialWorldbook] Saving moment ${moment.id} with keywords:`, uniqueKeys)

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      const idx = entries.findIndex(e => e.name.startsWith(`${prefix}${moment.id}]`))
      const newEntry = {
        name: entryName,
        content: content,
        enabled: true,
        strategy: {
          type: 'selective',
          keys: uniqueKeys,
          keys_secondary: { logic: 'not_all', keys: [] },
          scan_depth: 'same_as_global'
        },
        position: {
          type: 'after_character_definition',
          order: 5
        },
        recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
        effect: { sticky: null, cooldown: null, delay: null } // Added missing effect field to match structure if needed, or stick to what was there. Previous code for new entry had recursion but not effect? 
        // Wait, previous createWorldbookEntries had recursion but NOT effect. Previous update had recursion and NOT effect. 
        // I should stick to previous structure but merging.
      }
      
      // Note: saveSocialData's newEntry had effect. saveMomentToWorldbook's newEntry had recursion but not effect. I'll stick to what was there.
      
      if (idx > -1) {
         entries[idx] = { ...entries[idx], ...newEntry, uid: entries[idx].uid }
      } else {
         entries.push(newEntry)
      }
      return entries
    })

    console.log(`[SocialWorldbook] Moment ${moment.id} saved successfully`)
    return true
  } catch (e) {
    console.error('[SocialWorldbook] Error saving moment:', e)
    return false
  }
}

/**
 * 删除朋友圈世界书条目
 * @param {string} momentId 朋友圈ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteMomentFromWorldbook(momentId) {
  const bookName = getCurrentBookName()
  if (!bookName) return false

  const runId = getCurrentRunId()
  const prefix = getMomentPrefix(runId)

  try {
    await window.deleteWorldbookEntries(bookName, (entry) => {
      return entry.name.startsWith(`${prefix}${momentId}]`)
    })
    console.log(`[SocialWorldbook] Moment ${momentId} deleted from worldbook`)
    return true
  } catch (e) {
    console.error('[SocialWorldbook] Error deleting moment:', e)
    return false
  }
}

/**
 * 扫描世界书并同步元数据到 gameStore
 * (只同步 lastMessage, lastMessageTime, unreadCount)
 * 注意：如果世界书是纯文本，解析能力有限，主要依赖 Store
 */
export async function syncSocialToStore() {
  const bookName = getCurrentBookName()
  if (!bookName) return

  const gameStore = useGameStore()
  const runId = getCurrentRunId()
  const prefix = getEntryPrefix(runId)

  try {
    const entries = await window.getWorldbook(bookName)
    
    for (const entry of entries) {
      if (entry.name.startsWith(prefix)) {
        const idPart = entry.name.split(']')[0]
        const parts = idPart.split(':')
        if (parts.length >= 3) {
          const id = parts[2]
          const data = parseEntryContent(entry.content)
          
          let lastMsg = ''
          let lastTime = ''
          if (data.messages && data.messages.length > 0) {
            const last = data.messages[data.messages.length - 1]
            lastMsg = last.content
            // 文本格式丢失了时间，这里可能为空
            lastTime = last.time || '' 
          }

          const isFriend = gameStore.player.social.friends.find(f => f.id === id)
          const isGroup = gameStore.player.social.groups.find(g => g.id === id)
          const storeItem = isFriend || isGroup

          if (storeItem) {
            // 只有当 Store 中没有数据时才同步（避免覆盖更精确的数据）
            if (!storeItem.lastMessage) {
               storeItem.lastMessage = lastMsg
               storeItem.unreadCount = data.unreadCount
            }
            
            // 如果 store 中没有消息记录，尝试从世界书同步
            if (!storeItem.messages || storeItem.messages.length === 0) {
              storeItem.messages = data.messages
            }
          }
        }
      }
    }
    console.log('[SocialWorldbook] Synced social data to store')
  } catch (e) {
    console.error('[SocialWorldbook] Error syncing to store:', e)
  }
}

/**
 * 创建或更新"社交关系"总览条目
 * 这是一个包含所有社交关系信息的概览条目
 */
export async function saveSocialRelationshipOverview() {
  const bookName = getCurrentBookName()
  if (!bookName) return false

  const gameStore = useGameStore()
  const runId = getCurrentRunId()
  const entryName = `[Social:${runId}] 社交关系`
  
  // 构建社交关系概览内容
  let content = '--社交关系概览开始--\n\n'
  
  // 添加好友信息
  content += '【好友列表】\n'
  if (gameStore.player.social.friends && gameStore.player.social.friends.length > 0) {
    for (const friend of gameStore.player.social.friends) {
      const unreadInfo = friend.unreadCount > 0 ? ` (${friend.unreadCount}条未读)` : ''
      content += `- ${friend.name}${unreadInfo}\n`
    }
  } else {
    content += '(暂无好友)\n'
  }
  
  content += '\n【群组列表】\n'
  if (gameStore.player.social.groups && gameStore.player.social.groups.length > 0) {
    for (const group of gameStore.player.social.groups) {
      const unreadInfo = group.unreadCount > 0 ? ` (${group.unreadCount}条未读)` : ''
      let memberInfo = ''
      if (group.members && group.members.length > 0) {
        const memberNames = group.members.map(memberId => {
          if (memberId === 'player') return gameStore.player.name
          const friend = gameStore.player.social.friends.find(f => f.id === memberId)
          if (friend) return friend.name
          const npc = gameStore.npcs.find(n => n.id === memberId)
          if (npc) return npc.name
          return null
        }).filter(n => n)
        memberInfo = ` [成员: ${memberNames.join(', ')}]`
      }
      content += `- ${group.name}${unreadInfo}${memberInfo}\n`
    }
  } else {
    content += '(暂无群组)\n'
  }
  
  content += '\n--社交关系概览结束--'

  try {
    const socialEntry = {
      name: entryName,
      content: content,
      enabled: true,
      strategy: {
        type: 'constant',
        keys: [],
        keys_secondary: { logic: 'not_all', keys: [] },
        scan_depth: 'same_as_global'
      },
      position: {
        type: 'after_character_definition',
        order: 5
      },
      probability: 100,
      recursion: { prevent_incoming: false, prevent_outgoing: true, delay_until: null },
      effect: { sticky: null, cooldown: null, delay: null }
    }

    await window.updateWorldbookWith(bookName, (entries) => {
      const idx = entries.findIndex(e => e.name === entryName)
      if (idx > -1) {
        entries[idx] = { ...entries[idx], ...socialEntry, uid: entries[idx].uid }
      } else {
        entries.push(socialEntry)
      }
      return entries
    })

    console.log('[SocialWorldbook] Social relationship overview saved')
    return true
  } catch (e) {
    console.error('[SocialWorldbook] Error saving social relationship overview:', e)
    return false
  }
}

/**
 * 切换存档槽位（开启当前 runId 的条目，关闭其他的）
 */
export async function switchSaveSlot() {
  const bookName = getCurrentBookName()
  if (!bookName) return

  const currentRunId = getCurrentRunId()
  const chatGeneralPrefix = '[Social:'
  const momentGeneralPrefix = '[Moment:'

  console.log(`[SocialWorldbook] Switching save slot to ${currentRunId}`)

  try {
    await window.updateWorldbookWith(bookName, (entries) => {
      return entries.map(entry => {
        let entryRunId = null
        
        // 解析 runId
        if (entry.name && entry.name.startsWith(chatGeneralPrefix)) {
          // 格式: [Social:runId:id] 或 [Social:runId] 社交关系
          // 去掉前缀后: runId:id]... 或 runId]...
          const content = entry.name.substring(chatGeneralPrefix.length)
          const colonIndex = content.indexOf(':')
          const bracketIndex = content.indexOf(']')
          
          if (colonIndex > -1 && (bracketIndex === -1 || colonIndex < bracketIndex)) {
              // runId:id]...
              entryRunId = content.substring(0, colonIndex)
          } else if (bracketIndex > -1) {
              // runId]...
              entryRunId = content.substring(0, bracketIndex)
          }
        } else if (entry.name && entry.name.startsWith(momentGeneralPrefix)) {
          // 格式: [Moment:runId:id]
          const content = entry.name.substring(momentGeneralPrefix.length)
          const colonIndex = content.indexOf(':')
          const bracketIndex = content.indexOf(']')
          
          if (colonIndex > -1 && (bracketIndex === -1 || colonIndex < bracketIndex)) {
              entryRunId = content.substring(0, colonIndex)
          } else if (bracketIndex > -1) {
              entryRunId = content.substring(0, bracketIndex)
          }
        }

        if (entryRunId) {
          // 确保 runId 精确匹配
          const isCurrent = entryRunId === currentRunId
          if (isCurrent && !entry.enabled) {
            console.log(`[SocialWorldbook] Enabling entry: ${entry.name}`)
            return { ...entry, enabled: true }
          } else if (!isCurrent && entry.enabled) {
            console.log(`[SocialWorldbook] Disabling entry: ${entry.name}`)
            return { ...entry, enabled: false }
          }
        }
        
        return entry
      })
    })
  } catch (e) {
    console.error('[SocialWorldbook] Error switching save slot:', e)
  }
}

/**
 * 从 Store 恢复世界书（回溯机制）
 * 读取 Store 中的完整历史，过滤掉当前楼层之后的消息，然后覆盖写入世界书
 * 也会创建在世界书中缺失但 Store 中存在的条目
 * [性能优化版] 使用 Map 预处理数据，避免在回调中进行 O(N*M) 的全量遍历
 */
export async function restoreWorldbookFromStore() {
  const bookName = getCurrentBookName()
  if (!bookName) return

  const gameStore = useGameStore()
  const runId = getCurrentRunId()
  const chatPrefix = getEntryPrefix(runId)
  const momentPrefix = getMomentPrefix(runId)
  const currentFloor = gameStore.currentFloor || 0

  console.log(`[SocialWorldbook] Restoring worldbook from store (Floor: ${currentFloor})`)

  try {
    // 1. 预处理 Store 数据，构建查找表 (Map)
    // Key: entryName (预测的世界书条目名称), Value: { type, data, item }
    const storeDataMap = new Map()

    // 预处理好友
    for (const friend of gameStore.player.social.friends) {
      const entryName = `${chatPrefix}${friend.id}] ${friend.name}`
      storeDataMap.set(entryName, { type: 'chat', item: friend, isGroup: false })
    }

    // 预处理群组
    for (const group of gameStore.player.social.groups) {
      const entryName = `${chatPrefix}${group.id}] ${group.name}`
      storeDataMap.set(entryName, { type: 'chat', item: group, isGroup: true })
    }

    // 预处理朋友圈
    if (gameStore.player.social.moments) {
      for (const moment of gameStore.player.social.moments) {
        const entryName = `${momentPrefix}${moment.id}] ${moment.name}`
        storeDataMap.set(entryName, { type: 'moment', item: moment })
      }
    }

    // 2. 批量更新世界书
    await window.updateWorldbookWith(bookName, (entries) => {
      const processedEntries = []
      
      // 遍历现有条目，利用 Map 快速查找并更新
      for (const entry of entries) {
        // 检查是否是当前 runId 的社交条目
        if (entry.name.startsWith(chatPrefix) || entry.name.startsWith(momentPrefix)) {
          const storeData = storeDataMap.get(entry.name)
          
          if (storeData) {
            // Store 中存在该数据，更新条目内容
            const { type, item, isGroup } = storeData
            
            if (type === 'chat') {
              // 过滤掉未来楼层的消息
              const validMessages = item.messages ? item.messages.filter(m => !m.floor || m.floor <= currentFloor) : []
              
              // 如果有消息被回溯了，更新 store 中的数据以保持一致
              if (item.messages && validMessages.length !== item.messages.length) {
                item.messages = validMessages
                // 更新元数据
                if (validMessages.length > 0) {
                  const last = validMessages[validMessages.length - 1]
                  item.lastMessage = last.content
                  item.lastMessageTime = last.time
                } else {
                  item.lastMessage = ''
                  item.lastMessageTime = ''
                }
              }

              const newData = {
                unreadCount: item.unreadCount,
                messages: validMessages
              }

              // 获取群成员名称
              let memberNames = null
              if (isGroup && item.members) {
                memberNames = item.members.map(memberId => {
                  if (memberId === 'player') return gameStore.player.name
                  const friend = gameStore.player.social.friends.find(f => f.id === memberId)
                  if (friend) return friend.name
                  const npc = gameStore.npcs.find(n => n.id === memberId)
                  if (npc) return npc.name
                  return null
                }).filter(n => n)
              }

              processedEntries.push({
                ...entry,
                enabled: true,
                content: formatEntryContent(newData, item.name, memberNames),
                strategy: { ...entry.strategy, type: 'constant' }
              })
            } else if (type === 'moment') {
              processedEntries.push({
                ...entry,
                enabled: true,
                content: formatMomentContent(item)
              })
            }
            
            // 从 Map 中移除已处理的条目，剩下的就是需要新增的
            storeDataMap.delete(entry.name)
          } else {
            // Store 中不存在该条目（可能已被删除），禁用它
            // 注意：这里只处理当前 runId 的条目，其他 runId 的条目保持原样
            processedEntries.push({ ...entry, enabled: false })
          }
        } else {
          // 非当前 runId 的社交条目，或其他类型的条目，保持原样
          processedEntries.push(entry)
        }
      }

      // 3. 处理 Map 中剩余的数据（即 entries 中不存在的新数据）
      const newEntries = []
      
      for (const [entryName, { type, item, isGroup }] of storeDataMap.entries()) {
        if (type === 'chat') {
          const validMessages = item.messages ? item.messages.filter(m => !m.floor || m.floor <= currentFloor) : []
          
          let memberNames = null
          let uniqueKeys = [item.name]
          
          if (isGroup && item.members) {
            memberNames = item.members.map(memberId => {
                if (memberId === 'player') return gameStore.player.name
                const friend = gameStore.player.social.friends.find(f => f.id === memberId)
                if (friend) return friend.name
                const npc = gameStore.npcs.find(n => n.id === memberId)
                if (npc) return npc.name
                return null
            }).filter(n => n)
            uniqueKeys = [...new Set([...memberNames, item.name])]
          }

          const content = formatEntryContent({
            messages: validMessages,
            unreadCount: item.unreadCount
          }, item.name, memberNames)

          newEntries.push({
            name: entryName,
            content: content,
            enabled: true,
            strategy: {
              type: 'constant',
              keys: uniqueKeys,
              keys_secondary: { logic: 'not_all', keys: [] },
              scan_depth: 'same_as_global'
            },
            position: { type: 'after_character_definition', order: 5 },
            probability: 100,
            recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
            effect: { sticky: null, cooldown: null, delay: null }
          })
        } else if (type === 'moment') {
          const content = formatMomentContent(item)
          const uniqueKeys = [item.name]

          newEntries.push({
            name: entryName,
            content: content,
            enabled: true,
            strategy: {
              type: 'selective',
              keys: uniqueKeys,
              keys_secondary: { logic: 'not_all', keys: [] },
              scan_depth: 'same_as_global'
            },
            position: { type: 'after_character_definition', order: 5 },
            probability: 100,
            recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
            effect: { sticky: null, cooldown: null, delay: null }
          })
        }
      }

      return [...processedEntries, ...newEntries]
    })
    console.log('[SocialWorldbook] Restore completed successfully with optimized map lookup.')

  } catch (e) {
    console.error('[SocialWorldbook] Error restoring worldbook:', e)
  }
}
