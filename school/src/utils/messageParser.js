import { getSocialData, saveSocialData, saveMomentToWorldbook } from './socialWorldbook'
import { useGameStore } from '../stores/gameStore'
import { removeThinking } from './summaryManager'
import { syncNpcMemory, syncLocationChange } from './multiplayerSync'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendMessage } from './multiplayerWs'

// 获取游戏内时间字符串 (HH:mm)
function getGameTimeString() {
  const gameStore = useGameStore()
  const { hour, minute } = gameStore.world.gameTime
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
import { saveForumToWorldbook, generatePostId } from './forumWorldbook'
import { updateRelationshipDelta, addRelationshipEvent, getRelationship, setRelationship, lookupGender, applyRelationshipWeights } from './relationshipManager'
import { getItemType } from './deliveryWorldbook'
import { generateCharId } from '../data/relationshipData'

// 玩家别名列表，AI 有时会用这些泛称代替实际玩家名
const PLAYER_ALIASES = ['玩家', 'player', 'Player', '主角', '主人公', 'MC', 'mc', 'user']

/**
 * 将玩家别名解析为实际玩家名
 * @param {string} name 角色名（可能是别名）
 * @param {Object} gameStore
 * @returns {string} 解析后的名称
 */
function resolvePlayerAlias(name, gameStore) {
  if (!name) return name
  if (PLAYER_ALIASES.includes(name.trim())) {
    return gameStore.player.name || name
  }
  return name
}

/**
 * 检查名称是否匹配玩家（真名或别名）
 */
function isPlayerName(name, gameStore) {
  if (!name || !gameStore?.player?.name) return false
  const n = name.trim()
  if (n === gameStore.player.name.trim()) return true
  return PLAYER_ALIASES.some(a => a.toLowerCase() === n.toLowerCase())
}

/**
 * 规范化文本，将全角字符转换为半角，去除首尾空白
 * @param {string} text 
 * @returns {string}
 */
function normalizeText(text) {
  if (!text) return ''
  return text
    .trim()
    .replace(/[\uff01-\uff5e]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); }) // 全角字母数字符号转半角
    .replace(/\u3000/g, ' ') // 全角空格转半角空格
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/：/g, ':').replace(/，/g, ',')
    .replace(/！/g, '!').replace(/？/g, '?')
}

/**
 * 查找社交对象（群组或好友）的 ID 和 名称
 * @param {string} identifier ID 或 名称
 * @param {Object} gameStore 
 * @returns {Object|null} { id, name, type }
 */
function findSocialTarget(identifier, gameStore) {
  if (!identifier) return null
  
  const normId = normalizeText(identifier)
  
  // 1. 尝试直接匹配 ID
  let group = gameStore.player.social.groups.find(g => g.id === identifier)
  if (group) return { id: group.id, name: group.name, type: 'group' }
  
  let friend = gameStore.player.social.friends.find(f => f.id === identifier)
  if (friend) return { id: friend.id, name: friend.name, type: 'friend' }

  let npc = gameStore.world.npcs.find(n => n.id === identifier)
  if (npc) return { id: npc.id, name: npc.name, type: 'npc' }

  // 2. 尝试匹配名称 (模糊匹配，忽略全角半角)
  group = gameStore.player.social.groups.find(g => normalizeText(g.name) === normId)
  if (group) return { id: group.id, name: group.name, type: 'group' }
  
  friend = gameStore.player.social.friends.find(f => normalizeText(f.name) === normId)
  if (friend) return { id: friend.id, name: friend.name, type: 'friend' }

  npc = gameStore.world.npcs.find(n => normalizeText(n.name) === normId)
  if (npc) return { id: npc.id, name: npc.name, type: 'npc' }

  // 3. 增强匹配：针对群组的模糊匹配
  // 解决 AI 回复时可能略微修改群名（如加后缀）导致无法匹配的问题
  const groupPartial = gameStore.player.social.groups.find(g => {
    const gName = normalizeText(g.name)
    // 只有当名字长度足够时才进行包含匹配，避免单字误配
    if (gName.length < 2 || normId.length < 2) return false
    return normId.includes(gName) || gName.includes(normId)
  })
  if (groupPartial) return { id: groupPartial.id, name: groupPartial.name, type: 'group' }
  
  return null
}

/**
 * 解析属性字符串为对象
 * @param {string} attrsStr 
 * @returns {Object}
 */
function parseAttributes(attrsStr) {
  const attrs = {}
  const attrRegex = /(\w+)=["']([^"']+)["']/g
  let match
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

/**
 * 解析角色信息 (ID 和 名称)
 * @param {Object} attrs 属性对象
 * @param {Object} gameStore 
 * @returns {Object} { charId, charName }
 */
function resolveCharInfo(attrs, gameStore) {
  // 防御：AI 不得以玩家身份操作朋友圈
  const nameToCheck = attrs.user || attrs.name
  if (isPlayerName(nameToCheck, gameStore)) {
    console.warn(`[MessageParser] 已拦截: AI 尝试以玩家身份操作朋友圈 (user/name="${nameToCheck}")`)
    return { charId: 'char_unknown', charName: '未知' }
  }

  let charId = attrs.from
  let charName = attrs.user || attrs.name

  // 1. 如果有名字没 ID，尝试查找 ID
  if (!charId && charName) {
    const target = findSocialTarget(charName, gameStore)
    if (target) {
      charId = target.id
      charName = target.name // 规范化名称
    }
  }

  // 2. 如果有 ID 没名字，尝试查找名字
  if (charId && !charName) {
    const friend = gameStore.player.social.friends.find(f => f.id === charId)
    if (friend) charName = friend.name
  }

  // 3. 默认回退 (如果没有匹配到，尝试使用最近好友，或者使用未知)
  if (!charId) {
    const recentFriend = gameStore.player.social.friends[0]
    if (recentFriend) {
      charId = recentFriend.id
      charName = charName || recentFriend.name
    } else {
      charId = 'char_unknown'
      charName = charName || '未知'
    }
  } else if (!charName) {
      charName = '未知'
  }

  return { charId, charName }
}

/**
 * 处理消息（私聊或群聊）
 */
async function processMessage(match, type, gameStore) {
  const attrsStr = match[1]
  const content = match[2].trim()
  const attrs = parseAttributes(attrsStr)

  // 解析发件人
  const sender = attrs.sender || (type === 'group' ? null : attrs.from)

  // 防御：AI 不得以玩家身份发送消息
  const senderToCheck = type === 'group' ? sender : attrs.from
  if (isPlayerName(senderToCheck, gameStore)) {
    console.warn(`[MessageParser] 已拦截: AI 尝试以玩家身份发送${type}消息 (${type === 'group' ? 'sender' : 'from'}="${senderToCheck}")`)
    return
  }

  // 解析目标 ID 和 Name
  let id, name
  
  if (type === 'group') {
      const groupName = attrs.group || attrs.from // 兼容写法
      const target = findSocialTarget(groupName, gameStore)
      
      if (target && target.type === 'group') {
          id = target.id
          name = target.name
      } else {
          // 如果没找到，使用原始名称
          id = groupName || 'unknown_group'
          name = groupName || '未知群聊'
      }
  } else {
      // social (私聊)
      const rawFrom = attrs.from
      const rawName = attrs.name
      let target = findSocialTarget(rawFrom, gameStore)
      if (!target && rawName) target = findSocialTarget(rawName, gameStore)
      
      if (target) {
          id = target.id
          name = target.name
      } else {
          id = rawFrom || 'unknown_chat'
          name = rawName || rawFrom || '未知聊天'
      }
  }

  const time = getGameTimeString()
  console.log(`[MessageParser] Received ${type} message in ${name} (${id}) from ${sender || 'unknown'}: ${content}`)

  // 获取现有数据
  let data = await getSocialData(id)
  if (!data) {
    data = { messages: [], unreadCount: 0 }
  }

  // 追加消息
  data.messages.push({
    id: Date.now(),
    type: 'other',
    content: content,
    sender: sender, 
    time: time,
    floor: gameStore.meta.currentFloor
  })
  data.unreadCount = (data.unreadCount || 0) + 1

  // 保存到世界书
  await saveSocialData(id, name, data, [], gameStore.meta.currentFloor)

  // 更新 Store
  const isFriend = gameStore.player.social.friends.some(f => f.id === id)
  const isGroup = gameStore.player.social.groups.some(g => g.id === id)

  if (isFriend) {
    gameStore.updateSocialStatus(id, 'friend', {
      lastMessage: content,
      lastMessageTime: time,
      unreadCount: data.unreadCount
    })
  } else if (isGroup) {
    gameStore.updateSocialStatus(id, 'group', {
      lastMessage: content,
      lastMessageTime: time,
      unreadCount: data.unreadCount
    })
  } else {
    // 只有当它是 social 类型，且不是群组时，才添加为新好友
    if (type === 'social' && !isGroup) {
       // 检测是否为系统通知
       const systemKeywords = ['系统', '教务', '通知', '公告', '后勤', '宿管', '社团', '学生会']
       const isSystem = systemKeywords.some(k => name.includes(k))

       gameStore.player.social.friends.push({
        id,
        name,
        avatar: isSystem ? '🔔' : '👤',
        signature: isSystem ? '系统通知' : '新朋友',
        status: 'online',
        lastMessage: content,
        lastMessageTime: time,
        unreadCount: data.unreadCount,
        isSystem: isSystem
      })
    }
  }

  // 清除待回复状态 (AI 已回复)
  // 移除该会话下的所有待回复消息，避免重复提示
  if (gameStore.player.holdMessages) {
    gameStore.player.holdMessages = gameStore.player.holdMessages.filter(m => 
      !(m.metadata && m.metadata.chatId === id)
    )
  }
  // 清除已读/未读标识（AI 已实际回复消息，不再需要显示状态）
  if (gameStore.player.socialReadStatus && gameStore.player.socialReadStatus[id]) {
    delete gameStore.player.socialReadStatus[id]
  }
}

/**
 * 解析 AI 响应中的社交标签
 * @param {string} text AI 返回的文本
 */
export async function parseSocialTags(rawText) {
  const gameStore = useGameStore()
  
  // 1. 预处理：移除思维链内容
  let text = removeThinking(rawText)

  // 2. 预处理：处理 <maintext> 标签
  // 如果存在 <maintext>，则只提取其中的内容（或者简单地移除标签保留内容，视需求而定）
  // 这里我们选择移除标签保留内容，以免干扰后续解析，或者如果只想解析 maintext 内的内容，可以做提取。
  // 鉴于后续是基于 regex 全局搜索，我们只要确保 tags 不被 maintext 包裹导致无法匹配（不会的），
  // 或者 maintext 之外还有 tags（应该被忽略？）。
  // 通常 <maintext> 包裹的是正文，tags 可能在正文内。
  // 我们简单地去掉 <maintext> 标签本身，保留内容。
  text = text.replace(/<\/?maintext>/gi, '')

  // 处理回合结束（计时器递减）
  gameStore.handleTurnEnd()

  // 1. 处理收到私聊消息 <social_msg ...>content</social_msg>
  const socialMsgRegex = /<social_msg\s+([^>]+)>(.*?)<\/social_msg>/gs
  let match
  
  while ((match = socialMsgRegex.exec(text)) !== null) {
    await processMessage(match, 'social', gameStore)
  }

  // 1.5. 处理收到群聊消息 <group_msg ...>content</group_msg>
  const groupMsgRegex = /<group_msg\s+([^>]+)>(.*?)<\/group_msg>/gs
  while ((match = groupMsgRegex.exec(text)) !== null) {
    await processMessage(match, 'group', gameStore)
  }

  // 2. 处理添加好友 <add_friend name="name" [id="id" avatar="emoji"]>signature</add_friend>
  // 改进：支持只提供 name，自动查找 ID 或生成 ID
  // 支持自闭合标签 <add_friend ... /> 和包含内容的标签 <add_friend ...>signature</add_friend>
  const friendRegex = /<add_friend\s+([^>]+?)(?:\s*\/?>|>(.*?)<\/add_friend>)/gs
  while ((match = friendRegex.exec(text)) !== null) {
    const attrsStr = match[1]
    const signature = match[2] ? match[2].trim() : (parseAttributes(attrsStr).signature || '新朋友')
    const attrs = parseAttributes(attrsStr)
    
    let name = attrs.name
    let id = attrs.id
    const avatar = attrs.avatar || '👤'
    
    // 如果没有名字，跳过
    if (!name) continue

    // 防御：AI 不得让玩家加自己为好友
    if (isPlayerName(name, gameStore)) {
      console.warn(`[MessageParser] 已拦截: AI 尝试添加玩家自己为好友 (name="${name}")`)
      continue
    }

    // 如果没有 ID 或 ID 无效，尝试查找或生成
    if (!id || id === 'unknown' || id === 'char_unknown') {
      const target = findSocialTarget(name, gameStore)
      if (target) {
        id = target.id
        name = target.name // 使用规范名称
      } else {
        id = generateCharId(name)
        // 如果是全新角色，确保添加到 NPCs (虽然添加好友会自动显示，但最好保持一致)
        const npcExists = gameStore.world.npcs.some(n => n.id === id)
        if (!npcExists) {
            gameStore.addNpc({
                id,
                name,
                gender: lookupGender(name, gameStore) || 'unknown',
                relationship: 0,
                isAlive: true,
                location: 'unknown',
                role: 'student'
            })
        }
      }
    }

    console.log(`[MessageParser] Adding friend ${name} (${id})`)

    // 移除持久化请求
    if (gameStore.player.social.outgoingRequests) {
        const reqIndex = gameStore.player.social.outgoingRequests.findIndex(r => r.targetName === name)
        if (reqIndex > -1) {
            gameStore.player.social.outgoingRequests.splice(reqIndex, 1)
        }
    }

    const exists = gameStore.player.social.friends.some(f => f.id === id)
    if (!exists) {
      gameStore.player.social.friends.push({
        id,
        name,
        avatar,
        signature,
        status: 'online',
        unreadCount: 0
      })
      await saveSocialData(id, name, { messages: [], unreadCount: 0 }, [], gameStore.meta.currentFloor)
    }
  }

  // 3. 处理社交状态 <social_status [id="char_id" | name="char_name"]>status</social_status>
  const statusRegex = /<social_status\s+([^>]+)>(.*?)<\/social_status>/gs
  while ((match = statusRegex.exec(text)) !== null) {
    const attrs = parseAttributes(match[1])
    const status = match[2].trim().toLowerCase()
    
    let id = attrs.id
    // 如果提供了 name，尝试查找 ID
    if (!id && attrs.name) {
      const target = findSocialTarget(attrs.name, gameStore)
      if (target) id = target.id
    }

    if (!id) continue

    console.log(`[MessageParser] Social status for ${id}: ${status}`)

    if (status === 'pass') {
      // 移除该会话的所有待回复提示
      if (gameStore.player.holdMessages) {
        gameStore.player.holdMessages = gameStore.player.holdMessages.filter(m => 
          !(m.metadata && m.metadata.chatId === id)
        )
      }
      // 标记为已读（已读不回）
      if (!gameStore.player.socialReadStatus) gameStore.player.socialReadStatus = {}
      gameStore.player.socialReadStatus[id] = 'pass'
    } else if (status === 'hold') {
      const data = await getSocialData(id)
      if (data && data.messages.length > 0) {
        const lastPlayerMsg = [...data.messages].reverse().find(m => m.type === 'self')
        if (lastPlayerMsg) {
          const exists = gameStore.player.holdMessages.some(m => m.metadata && m.metadata.chatId === id && m.metadata.msgId === lastPlayerMsg.id)
          if (!exists) {
            gameStore.player.holdMessages.push({
              id: Date.now(),
              text: `[系统提示] 你有未回复的消息: ${lastPlayerMsg.content}`,
              type: 'social_msg',
              metadata: { chatId: id, msgId: lastPlayerMsg.id, content: lastPlayerMsg.content }
            })
          }
          // 标记为未读
          if (!gameStore.player.socialReadStatus) gameStore.player.socialReadStatus = {}
          gameStore.player.socialReadStatus[id] = 'hold'
        }
      }
    }
  }


  // 4. 处理印象更新 <update_impression name="NPC名字" ... />
  const impressionRegex = /<update_impression\s+([^>]+?)\s*\/?>/g
  let impressionMatch
  while ((impressionMatch = impressionRegex.exec(text)) !== null) {
    const attrs = parseAttributes(impressionMatch[1])
    let npcName = attrs.name || attrs.target
    // 如果没有指定 name，无法更新
    if (!npcName) continue

    // 将玩家别名映射为实际玩家名
    npcName = resolvePlayerAlias(npcName, gameStore)

    // 默认更新 NPC -> Player 的关系
    const sourceName = npcName
    const targetCharName = gameStore.player.name

    const delta = {}
    // 支持 +N, -N 或直接 N
    const parseVal = (val) => {
      if (!val) return undefined
      if (val.startsWith('+') || val.startsWith('-')) return parseInt(val)
      // 如果是直接数值，我们需要 updateRelationshipDelta 支持绝对值吗？
      // updateRelationshipDelta 目前只支持增量。
      // 为了支持绝对值，我们需要先获取当前值，或者修改 updateRelationshipDelta。
      // 简单起见，我们假设 AI 使用 +N/-N。如果 AI 使用 N，我们把它当作设置值？
      // 为了安全，我们这里只处理增量。如果 AI 输出了 "50"，parseInt 会得到 50，会被当作 +50。
      // 这可能不是预期的。但提示词中说了 "数值使用 +N 或 -N 表示增减"。
      return parseInt(val)
    }

    if (attrs.intimacy) delta.intimacy = parseVal(attrs.intimacy)
    if (attrs.trust) delta.trust = parseVal(attrs.trust)
    if (attrs.passion) delta.passion = parseVal(attrs.passion)
    if (attrs.hostility) delta.hostility = parseVal(attrs.hostility)

    // 处理 add_tag 和 remove_tag
    const addTags = attrs.add_tag ? attrs.add_tag.split(',').map(t => t.trim()).filter(t => t) : []
    const removeTags = attrs.remove_tag ? attrs.remove_tag.split(',').map(t => t.trim()).filter(t => t) : []

    // 调用 updateRelationshipDelta 更新数值
    if (Object.keys(delta).length > 0) {
      // 确保源角色存在，如果不存在可能会创建默认值
      // 这里的 delta 包含增量
      const finalDelta = (targetCharName === gameStore.player.name)
        ? applyRelationshipWeights(delta, gameStore)
        : delta
      updateRelationshipDelta(sourceName, targetCharName, finalDelta)
    }

    // 处理标签更新 (如果只有标签更新，或者在数值更新后继续处理标签)
    if (addTags.length > 0 || removeTags.length > 0) {
      // 获取最新关系 (可能刚被 updateRelationshipDelta 更新过)
      const currentRel = getRelationship(sourceName, targetCharName) || { 
        intimacy: 0, trust: 0, passion: 0, hostility: 0, tags: [], groups: [] 
      }
      
      let newTags = [...(currentRel.tags || [])]
      
      // 移除标签
      if (removeTags.length > 0) {
        newTags = newTags.filter(t => !removeTags.includes(t))
      }
      
      // 添加标签
      if (addTags.length > 0) {
        addTags.forEach(t => {
          if (!newTags.includes(t)) newTags.push(t)
        })
      }
      
      // 如果标签有变化，或者这是新关系需要保存
      if (newTags.length !== (currentRel.tags || []).length || newTags.some(t => !(currentRel.tags || []).includes(t))) {
         setRelationship(sourceName, targetCharName, { ...currentRel, tags: newTags })
      }
    }
    
    console.log(`[MessageParser] Updated impression for ${sourceName}:`, delta, `Tags: +[${addTags}] -[${removeTags}]`)
  }

  // 5. 处理日历事件
  const calendarEventRegex = /<add_calendar_event\s+([^>]+?)\s*\/?>/g
  let calMatch
  while ((calMatch = calendarEventRegex.exec(text)) !== null) {
    const attrs = parseAttributes(calMatch[1])
    const date = attrs.date
    const name = attrs.name
    
    if (!date || !name) continue

    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const monthDayPattern = /^\d{2}-\d{2}$/
    
    if (datePattern.test(date) || monthDayPattern.test(date)) {
      const isRecurring = monthDayPattern.test(date)
      gameStore.addCalendarEvent({
        date: date,
        name: name,
        isRecurring: isRecurring
      })
    }
  }

  // 6. 朋友圈发布
  // 格式: <moment_post user="名字">内容</moment_post>
  const momentPostRegex = /<moment_post\s*([^>]*?)>(.*?)<\/moment_post>/gs
  let momentMatch
  while ((momentMatch = momentPostRegex.exec(text)) !== null) {
    const attrs = parseAttributes(momentMatch[1])
    const content = momentMatch[2].trim()
    const { charId, charName } = resolveCharInfo(attrs, gameStore)

    if (charId === 'char_unknown' && charName === '未知') continue

    const friend = gameStore.player.social.friends.find(f => f.id === charId)
    const avatar = friend ? friend.avatar : '👤'
    const timestamp = Date.now()
    const momentId = timestamp.toString()
    const time = getGameTimeString()

    const moment = {
      id: momentId,
      userId: charId,
      name: charName,
      avatar: avatar,
      content: content,
      images: [],
      time: time,
      timestamp: timestamp,
      likes: [],
      comments: []
    }

    gameStore.addMoment(moment)
    const keywords = [charName, ...gameStore.getAllFriendNames()]
    await saveMomentToWorldbook(moment, keywords)
  }

  // 7. 朋友圈点赞
  // 格式: <moment_like id="moment_id" user="名字" />
  const momentLikeRegex = /<moment_like\s+([^>]+?)\s*\/?>/g
  let likeMatch
  while ((likeMatch = momentLikeRegex.exec(text)) !== null) {
    const attrs = parseAttributes(likeMatch[1])
    const momentId = attrs.id
    const { charId, charName } = resolveCharInfo(attrs, gameStore)

    if (momentId && charId && charName) {
      const moment = gameStore.getMoment(momentId)
      if (moment) {
        const exists = moment.likes && moment.likes.some(l => l.userId === charId)
        if (!exists) {
          gameStore.addMomentLike(momentId, charId, charName)
          const updatedMoment = gameStore.getMoment(momentId)
          if (updatedMoment) {
            const keywords = [updatedMoment.name, ...gameStore.getAllFriendNames()]
            await saveMomentToWorldbook(updatedMoment, keywords)
          }
        }
      }
    }
  }

  // 8. 朋友圈评论
  // 格式: <moment_comment id="moment_id" user="名字">内容</moment_comment>
  const momentCommentRegex = /<moment_comment\s+([^>]+?)>(.*?)<\/moment_comment>/gs
  let commentMatch
  while ((commentMatch = momentCommentRegex.exec(text)) !== null) {
    const attrs = parseAttributes(commentMatch[1])
    const content = commentMatch[2].trim()
    const momentId = attrs.id
    const { charId, charName } = resolveCharInfo(attrs, gameStore)

    if (momentId && charId && charName && content) {
      const moment = gameStore.getMoment(momentId)
      if (moment) {
        const commentId = Date.now().toString()
        const time = getGameTimeString()
        gameStore.addMomentComment(momentId, {
          id: commentId,
          userId: charId,
          name: charName,
          content: content,
          time: time
        })
        
        const updatedMoment = gameStore.getMoment(momentId)
        if (updatedMoment) {
          const keywords = [updatedMoment.name, ...gameStore.getAllFriendNames()]
          await saveMomentToWorldbook(updatedMoment, keywords)
        }
      }
    }
  }

  // 10-12. 社团相关
  const joinClubRegex = /<join_club\s+([^>]+?)\s*\/?>/g
  let joinClubMatch
  while ((joinClubMatch = joinClubRegex.exec(text)) !== null) {
    const attrs = parseAttributes(joinClubMatch[1])
    if (attrs.id) {
      await gameStore.joinClubByInvitation(attrs.id)
    }
  }

  // 10.5 教师担任社团顾问 <advise_club id="club_id" />
  const adviseClubRegex = /<advise_club\s+([^>]+?)\s*\/?>/g
  let adviseClubMatch
  while ((adviseClubMatch = adviseClubRegex.exec(text)) !== null) {
    const attrs = parseAttributes(adviseClubMatch[1])
    if (attrs.id) {
      await gameStore.becomeClubAdvisor(attrs.id)
    }
  }

  const leaveClubRegex = /<leave_club\s+([^>]+?)\s*\/?>/g
  let leaveClubMatch
  while ((leaveClubMatch = leaveClubRegex.exec(text)) !== null) {
    const attrs = parseAttributes(leaveClubMatch[1])
    if (attrs.id) {
      await gameStore.leaveClubByCommand(attrs.id)
    }
  }

  const rejectClubRegex = /<reject_club\s+([^>]+?)\s*\/?>/g
  let rejectClubMatch
  while ((rejectClubMatch = rejectClubRegex.exec(text)) !== null) {
    const attrs = parseAttributes(rejectClubMatch[1])
    if (attrs.id && attrs.from && attrs.reason) {
      gameStore.rejectClubApplication(attrs.id, attrs.from, attrs.reason)
    }
  }

  // 11. 拒绝好友申请 <reject_friend name="name" reason="reason" />
  const rejectFriendRegex = /<reject_friend\s+([^>]+?)\s*\/?>/g
  let rejectFriendMatch
  while ((rejectFriendMatch = rejectFriendRegex.exec(text)) !== null) {
    const attrs = parseAttributes(rejectFriendMatch[1])
    const name = attrs.name
    const reason = attrs.reason || '对方拒绝了你的好友申请'
    
    if (name) {
       // 移除持久化请求
       if (gameStore.player.social.outgoingRequests) {
           const reqIndex = gameStore.player.social.outgoingRequests.findIndex(r => r.targetName === name)
           if (reqIndex > -1) {
               gameStore.player.social.outgoingRequests.splice(reqIndex, 1)
           }
       }

       // 添加到社交通知，等待玩家在 SocialApp 中查看
       if (!gameStore.player.social.notifications) {
           gameStore.player.social.notifications = []
       }
       gameStore.player.social.notifications.push({
           id: Date.now(),
           type: 'friend_rejected',
           name: name,
           reason: reason,
           time: getGameTimeString()
       })
    }
  }

  // 11.5 社团邀请处理
  const clubInviteAcceptRegex = /<club_invite_accept\s+([^>]+?)\s*\/?>/g
  let clubInviteAcceptMatch
  while ((clubInviteAcceptMatch = clubInviteAcceptRegex.exec(text)) !== null) {
    const attrs = parseAttributes(clubInviteAcceptMatch[1])
    if (attrs.id && attrs.name) {
      await gameStore.handleClubInviteAccepted(attrs.id, attrs.name)
    }
  }

  const clubInviteRejectRegex = /<club_invite_reject\s+([^>]+?)\s*\/?>/g
  let clubInviteRejectMatch
  while ((clubInviteRejectMatch = clubInviteRejectRegex.exec(text)) !== null) {
    const attrs = parseAttributes(clubInviteRejectMatch[1])
    if (attrs.id && attrs.name) {
      gameStore.handleClubInviteRejected(attrs.id, attrs.name, attrs.reason || '拒绝了邀请')
    }
  }

  // 12.5. 加入群聊 <join_group name="Group Name" members="A,B,C" [id="group_id"] />
  const joinGroupRegex = /<join_group\s+([^>]+?)\s*\/?>/g
  let joinGroupMatch
  while ((joinGroupMatch = joinGroupRegex.exec(text)) !== null) {
    const attrs = parseAttributes(joinGroupMatch[1])
    let groupId = attrs.id
    const groupName = attrs.name
    const memberNamesInput = attrs.members ? attrs.members.split(',').map(m => m.trim()).filter(m => m) : []

    if (!groupName) continue

    // 1. 确定 Group ID
    let group = null
    if (groupId) {
        group = gameStore.player.social.groups.find(g => g.id === groupId)
    } else {
        // 尝试按名字查找
        group = gameStore.player.social.groups.find(g => g.name === groupName)
        if (group) {
            groupId = group.id
        } else {
            // 生成新 ID
            groupId = `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        }
    }

    // 2. 解析成员 (将名字转换为 ID)
    const memberIds = memberNamesInput.map(name => {
        if (name === 'player' || name === gameStore.player.name) return 'player'
        
        // 查找 ID
        const target = findSocialTarget(name, gameStore)
        if (target) return target.id
        
        // 如果找不到，生成新 ID 并注册为 NPC
        const newId = generateCharId(name)
        const npcExists = gameStore.world.npcs.some(n => n.id === newId)
        if (!npcExists) {
            gameStore.addNpc({
                id: newId,
                name: name,
                gender: lookupGender(name, gameStore) || 'unknown',
                relationship: 0,
                isAlive: true,
                location: 'unknown',
                role: 'student'
            })
        }
        return newId
    })

    // 3. 更新或创建群组
    if (!group) {
      group = {
        id: groupId,
        name: groupName,
        avatar: '👥',
        members: [...new Set(['player', ...memberIds])], // 确保包含玩家
        announcement: '欢迎加入群聊',
        messages: [],
        unreadCount: 0
      }
      gameStore.player.social.groups.push(group)
    } else {
      group.members = [...new Set([...group.members, ...memberIds])]
    }

    // 4. 为 Worldbook 准备成员名字列表 (用于显示)
    const finalMemberNames = group.members.map(memberId => {
      if (memberId === 'player') return gameStore.player.name
      const friend = gameStore.player.social.friends.find(f => f.id === memberId)
      if (friend) return friend.name
      const npc = gameStore.world.npcs.find(n => n.id === memberId)
      if (npc) return npc.name
      return memberId 
    })

    await saveSocialData(group.id, group.name, {
      messages: group.messages || [],
      unreadCount: group.unreadCount || 0
    }, finalMemberNames, gameStore.meta.currentFloor)

    const welcomePrompt = `[系统提示] ${gameStore.player.name} 加入了 ${groupName}，群内成员有 ${finalMemberNames.join('、')}，大家欢迎一下吧。`
    gameStore.addCommand({
      id: Date.now(),
      text: welcomePrompt,
      type: 'other' 
    })
  }

  // 13. 物品操作
  const addItemRegex = /<add_item\s+([^>]+?)\s*\/?>/g
  let addItemMatch
  while ((addItemMatch = addItemRegex.exec(text)) !== null) {
    const attrsStr = addItemMatch[1]
    const attrs = {}
    const attrRegex = /(\w+)=["']([^"']+)["']/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) attrs[attrMatch[1]] = attrMatch[2]

    const count = parseInt(attrs.count || '1', 10)
    const name = attrs.name || '未知物品'
    const category = attrs.category || 'misc'
    const description = attrs.description || 'AI 未提供描述'

    let existingItem = gameStore.player.inventory.find(i => i.name === name)
    if (existingItem) {
      gameStore.addItem({ ...existingItem, count })
    } else {
      const newItemId = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      let type = 'misc'
      if (['consumable', 'book', 'clothing', 'gift', 'entertainment', 'exercise', 'daily', 'key_item', 'misc'].includes(category)) {
        type = category
      } else {
        type = getItemType({ category })
      }

      gameStore.addItem({
        id: newItemId,
        name: name,
        description: description,
        type: type,
        category: category,
        count: count,
        durability: 1,
        maxDurability: 1
      })
    }
  }

  const removeItemRegex = /<remove_item\s+([^>]+?)\s*\/?>/g
  let removeItemMatch
  while ((removeItemMatch = removeItemRegex.exec(text)) !== null) {
    const attrs = parseAttributes(removeItemMatch[1])
    const idOrName = attrs.id
    const count = parseInt(attrs.count || '1', 10)
    
    if (idOrName) {
      let item = gameStore.player.inventory.find(i => i.id === idOrName)
      if (!item) item = gameStore.player.inventory.find(i => i.name === idOrName)

      if (item) {
        item.count -= count
        if (item.count <= 0) {
          const index = gameStore.player.inventory.indexOf(item)
          gameStore.player.inventory.splice(index, 1)
        }
      }
    }
  }

  // 14-17. 论坛相关
  // 辅助函数：计算两个字符串的相似度（基于最长公共子序列比率）
  const calcSimilarity = (a, b) => {
    if (!a || !b) return 0
    if (a === b) return 1
    const shorter = a.length < b.length ? a : b
    const longer = a.length < b.length ? b : a
    if (longer.length === 0) return 1
    // 简化版：基于共有字符比率
    const shorterChars = new Set(shorter)
    let matchCount = 0
    for (const ch of longer) {
      if (shorterChars.has(ch)) matchCount++
    }
    return matchCount / longer.length
  }

  const forumPostRegex = /<forum_post\s+([^>]+)>(.*?)<\/forum_post>/gs
  let forumPostMatch
  while ((forumPostMatch = forumPostRegex.exec(text)) !== null) {
    const attrs = parseAttributes(forumPostMatch[1])
    const content = forumPostMatch[2].trim()

    if (attrs.board && attrs.title && attrs.from) {
      if (isPlayerName(attrs.from, gameStore)) {
        console.warn(`[MessageParser] 已拦截: AI 尝试以玩家身份发论坛帖 (from="${attrs.from}")`)
        continue
      }
      // 多层去重检查
      // 层1：精确匹配（标题+作者+内容完全一致），无时间限制
      const isExactDuplicate = gameStore.player.forum.posts.some(p =>
        p.title === attrs.title &&
        p.author === attrs.from &&
        p.content === content
      )

      // 层2：同作者同标题（AI可能微调了内容但本质是同一帖子）
      const isTitleAuthorDuplicate = !isExactDuplicate && gameStore.player.forum.posts.some(p =>
        p.title === attrs.title &&
        p.author === attrs.from
      )

      // 层3：内容高度相似（同作者，内容相似度>0.8）
      const isContentSimilar = !isExactDuplicate && !isTitleAuthorDuplicate && gameStore.player.forum.posts.some(p =>
        p.author === attrs.from &&
        p.board === attrs.board &&
        calcSimilarity(p.content, content) > 0.8
      )

      const isDuplicate = isExactDuplicate || isTitleAuthorDuplicate || isContentSimilar

      if (!isDuplicate) {
        const newPost = {
          id: generatePostId(gameStore.player.forum.posts),
          board: attrs.board,
          title: attrs.title,
          author: attrs.from,
          isPinned: attrs.pinned === 'true',
          content: content,
          replies: [],
          timestamp: Date.now(),
          floor: gameStore.meta.currentFloor,
          likes: []
        }
        gameStore.player.forum.posts.unshift(newPost)
        await saveForumToWorldbook(gameStore.player.forum.posts, gameStore.meta.currentRunId, gameStore.settings.forumWorldbookLimit)
      } else {
        const reason = isExactDuplicate ? 'exact' : isTitleAuthorDuplicate ? 'title+author' : 'content-similar'
        console.log(`[MessageParser] Duplicate forum post detected (${reason}), skipping: ${attrs.title}`)
      }
    }
  }

  // 收集本轮所有回复和点赞，最后统一保存
  let forumChanged = false

  const forumReplyRegex = /<forum_reply\s+([^>]+)>(.*?)<\/forum_reply>/gs
  let forumReplyMatch
  // 记录本轮已处理的回复（同作者对同帖子只保留第一条）
  const replyDedup = new Set()
  while ((forumReplyMatch = forumReplyRegex.exec(text)) !== null) {
    const attrs = parseAttributes(forumReplyMatch[1])
    const content = forumReplyMatch[2].trim()

    if (attrs.post_id && attrs.from) {
      if (isPlayerName(attrs.from, gameStore)) {
        console.warn(`[MessageParser] 已拦截: AI 尝试以玩家身份回复论坛帖 (from="${attrs.from}")`)
        continue
      }
      const postId = attrs.post_id
      // 本轮内同作者对同帖子只取第一条回复
      const batchKey = `${postId}::${attrs.from}`
      if (replyDedup.has(batchKey)) {
        console.log(`[MessageParser] Same-batch duplicate reply from ${attrs.from} to ${postId}, skipping`)
        continue
      }

      const post = gameStore.player.forum.posts.find(p => p.id === postId)
      if (post) {
        // 去重检查：精确匹配 或 同作者+内容高度相似
        const isDuplicateReply = post.replies && post.replies.some(r =>
          r.author === attrs.from && (r.content === content || calcSimilarity(r.content, content) > 0.8)
        )

        if (!isDuplicateReply) {
          if (!post.replies) post.replies = []
          post.replies.push({ author: attrs.from, content: content })
          replyDedup.add(batchKey)
          forumChanged = true

          if (post.author === gameStore.player.name) {
            const idx = gameStore.player.forum.pendingCommands.findIndex(cmd => cmd.type === 'post' && cmd.post.id === postId)
            if (idx > -1) gameStore.player.forum.pendingCommands.splice(idx, 1)
          }
        } else {
          console.log(`[MessageParser] Duplicate forum reply detected, skipping`)
        }
      }
    }
  }

  const forumLikeRegex = /<forum_like\s+([^>]+?)\s*\/?>/g
  let forumLikeMatch
  while ((forumLikeMatch = forumLikeRegex.exec(text)) !== null) {
    const attrs = parseAttributes(forumLikeMatch[1])

    if (attrs.post_id && attrs.from) {
      if (isPlayerName(attrs.from, gameStore)) {
        console.warn(`[MessageParser] 已拦截: AI 尝试以玩家身份点赞论坛帖 (from="${attrs.from}")`)
        continue
      }
      const postId = attrs.post_id
      const post = gameStore.player.forum.posts.find(p => p.id === postId)
      if (post) {
        if (!post.likes) post.likes = []
        if (!post.likes.includes(attrs.from)) {
          post.likes.push(attrs.from)
          forumChanged = true
        }
        if (post.author === gameStore.player.name) {
          const idx = gameStore.player.forum.pendingCommands.findIndex(cmd => cmd.type === 'post' && cmd.post.id === postId)
          if (idx > -1) gameStore.player.forum.pendingCommands.splice(idx, 1)
        }
      }
    }
  }

  // 回复和点赞统一保存一次
  if (forumChanged) {
    await saveForumToWorldbook(gameStore.player.forum.posts, gameStore.meta.currentRunId, gameStore.settings.forumWorldbookLimit)
  }

  // 清理过期提醒
  for (let i = gameStore.player.forum.pendingCommands.length - 1; i >= 0; i--) {
    if (gameStore.player.forum.pendingCommands[i].turnsRemaining <= 0) {
      gameStore.player.forum.pendingCommands.splice(i, 1)
    }
  }

  // 18. 事件卷入
  const eventInvolvedRegex = /<event_involved\s+([^>]+?)\s*\/?>/g
  let eventInvolvedMatch
  while ((eventInvolvedMatch = eventInvolvedRegex.exec(text)) !== null) {
    const attrs = parseAttributes(eventInvolvedMatch[1])
    if (attrs.id) {
      gameStore.markEventInvolved(attrs.id)
    }
  }

  // 19. 总结系统
  const minorSummaryRegex = /<minor_summary>(.*?)<\/minor_summary>/gs
  let minorMatch
  while ((minorMatch = minorSummaryRegex.exec(text)) !== null) {
    const content = minorMatch[1].trim()
    if (content) {
      gameStore.addSummary({
        type: 'minor',
        content: content,
        floor: gameStore.meta.currentFloor
      })
    }
  }

  // 20. 教学系统
  // 格式: <teach target="NPC名或班级ID" subject="科目" quality="perfect|good|normal|bad" />
  const teachRegex = /<teach\s+([^>]+?)\s*\/?>/g
  let teachMatch
  while ((teachMatch = teachRegex.exec(text)) !== null) {
    const attrs = parseAttributes(teachMatch[1])
    if (attrs.target && attrs.subject) {
      // 只有教师身份可以使用
      if (gameStore.player.role === 'teacher') {
        gameStore.performTeaching(attrs.target, attrs.subject, attrs.quality || 'normal')
      }
    }
  }

  // ══════ 联机模式指令 ══════

  // 21. NPC 记忆 <npc_memory npc="NPC名" time="时间">记忆内容</npc_memory>
  const npcMemoryRegex = /<npc_memory\s+([^>]+)>([\s\S]*?)<\/npc_memory>/gs
  let npcMemMatch
  while ((npcMemMatch = npcMemoryRegex.exec(text)) !== null) {
    const attrs = parseAttributes(npcMemMatch[1])
    const content = npcMemMatch[2].trim()
    const npcName = attrs.npc || attrs.name

    if (!npcName || !content) continue

    const timeStr = attrs.time || getGameTimeString()
    const memory = {
      time: timeStr,
      content: content,
      witness: [gameStore.player.name],
      floor: gameStore.meta.currentFloor,
      timestamp: Date.now(),
    }

    syncNpcMemory(npcName, memory)
    console.log(`[MessageParser] NPC memory recorded: ${npcName} - ${content.slice(0, 40)}...`)
  }

  // 22. NPC 转移 <transfer_npc npc="NPC名" to="目标玩家" reason="原因" />
  const transferNpcRegex = /<transfer_npc\s+([^>]+?)\s*\/?>/g
  let transferMatch
  while ((transferMatch = transferNpcRegex.exec(text)) !== null) {
    const attrs = parseAttributes(transferMatch[1])
    const npcName = attrs.npc || attrs.name
    const targetPlayer = attrs.to || attrs.target
    const reason = attrs.reason || ''

    if (!npcName || !targetPlayer) continue

    // 本地处理：NPC 离开当前场景
    const npc = gameStore.world.npcs.find(n => n.name === npcName)
    if (npc) {
      npc.isAlive = false
    }

    // 联机模式下通知服务端
    const mpStore = useMultiplayerStore()
    if (mpStore.isMultiplayerActive) {
      sendMessage('npc_transfer', { npcName, targetPlayer, reason })
    }

    console.log(`[MessageParser] NPC transfer: ${npcName} -> ${targetPlayer} (${reason})`)
  }

  // 23. NPC 跟随 <npc_follow npc="NPC名" action="start|stop" />
  const npcFollowRegex = /<npc_follow\s+([^>]+?)\s*\/?>/g
  let followMatch
  while ((followMatch = npcFollowRegex.exec(text)) !== null) {
    const attrs = parseAttributes(followMatch[1])
    const npcName = attrs.npc || attrs.name
    const action = attrs.action || 'start'

    if (!npcName) continue

    const npc = gameStore.world.npcs.find(n => n.name === npcName)
    if (npc) {
      npc.isFollowing = action === 'start'
      if (action === 'start') {
        npc.isAlive = true
      }
    }

    // 联机模式下通知服务端
    const mpStore = useMultiplayerStore()
    if (mpStore.isMultiplayerActive) {
      sendMessage('npc_follow', { npcName, action })
    }

    console.log(`[MessageParser] NPC follow: ${npcName} action=${action}`)
  }
}

/**
 * 提取建议回复
 * @param {string} text AI响应文本
 * @returns {string[]} 建议回复列表
 */
export function extractSuggestedReplies(text) {
  if (!text) return []
  
  // 1. 尝试匹配 <suggested_replies> 标签 (增强版正则，支持属性和空格)
  const regex = /<\s*suggested_replies[^>]*>([\s\S]*?)<\/\s*suggested_replies\s*>/i
  const match = regex.exec(text)
  
  if (match) {
    const content = match[1].trim()
    
    // 调试日志
    console.log('[MessageParser] Found suggested replies content:', content)

    try {
      // 尝试解析 JSON 数组
      const replies = JSON.parse(content)
      if (Array.isArray(replies)) {
        return replies
      }
    } catch (e) {
      console.warn('[MessageParser] Failed to parse suggested replies JSON:', e)
      
      // Fallback: 尝试修复常见的 JSON 格式错误
      try {
        // 1. 处理可能存在的中文引号问题
        let fixedContent = content.replace(/“/g, '"').replace(/”/g, '"')
        // 2. 尝试再次解析
        const replies = JSON.parse(fixedContent)
        if (Array.isArray(replies)) return replies
      } catch (e2) {
        // 忽略修复尝试的错误
      }

      // Fallback 2: 正则提取
      try {
        // 匹配双引号中的内容 (支持包含转义引号)
        // 注意：简单的 "([^"]+)" 无法处理内部有引号的情况，例如 "He said \"Hello\""
        // 这里使用稍复杂的正则尝试匹配字符串字面量
        const strRegex = /"((?:[^"\\]|\\.)*)"/g
        const extracted = []
        let m
        while ((m = strRegex.exec(content)) !== null) {
          // Unescape output (e.g. \" -> ")
          try {
             extracted.push(JSON.parse(`"${m[1]}"`))
          } catch (e) {
             extracted.push(m[1])
          }
        }
        
        if (extracted.length > 0) {
          console.log('[MessageParser] Fallback extracted replies:', extracted)
          return extracted
        }
      } catch (e3) {
        console.warn('[MessageParser] Failed to fallback parse suggested replies:', e3)
      }
    }
  }
  
  return []
}

/**
 * 处理游戏数据中的 NPC 心情更新
 * @param {Object} data - 解析后的 JSON 数据
 */
export function processNpcMoodUpdate(data) {
  if (!data || !data.npc_mood) return
  
  const gameStore = useGameStore()
  
  // Normalize to array
  const updates = Array.isArray(data.npc_mood) 
    ? data.npc_mood 
    : [data.npc_mood]

  updates.forEach(update => {
    const { name, mood, reason, duration } = update

    if (!name || !mood) {
      console.warn('[MessageParser] Invalid npc_mood update: missing name or mood', update)
      return
    }

    // 查找 NPC
    const npc = gameStore.world.npcs.find(n => n.name === name)
    if (!npc) {
      console.warn(`[MessageParser] NPC not found for mood update: ${name}`)
      return
    }

    // 验证心情类型
    const validMoods = ['happy', 'sad', 'stressed', 'energetic', 'tired', 'angry', 'romantic', 'neutral']
    if (!validMoods.includes(mood)) {
      console.warn(`[MessageParser] Invalid mood type: ${mood}`)
      return
    }

    // 更新 NPC 心情
    npc.mood = mood
    npc.moodReason = reason || ''
    npc.moodDuration = duration || 1

    console.log(`[MessageParser] Updated NPC mood: ${name} -> ${mood} (reason: ${reason || 'none'}, duration: ${duration || 1})`)
  })
}

/**
 * 提取吐槽内容
 * @param {string} text AI响应文本
 * @returns {string} 提取到的吐槽内容
 */
export function extractTucao(text) {
  if (!text) return ''
  const regex = /<tucao>([\s\S]*?)<\/tucao>/i
  const match = regex.exec(text)
  return match ? match[1].trim() : ''
}

/**
 * 处理游戏数据中的 NPC 关系更新
 * @param {Object} data - 解析后的 JSON 数据
 */
export function processNpcRelationshipUpdate(data) {
  if (!data || !data.npc_relationship) return

  // Normalize to array
  const updates = Array.isArray(data.npc_relationship) 
    ? data.npc_relationship 
    : [data.npc_relationship]

  const gameStore = useGameStore()

  updates.forEach(update => {
    let { source, target, delta, add_tags, add_groups, event } = update

    if (!source || !target) {
      console.warn('[MessageParser] Invalid npc_relationship update: missing source or target', update)
      return
    }

    // 将玩家别名映射为实际玩家名
    source = resolvePlayerAlias(source, gameStore)
    target = resolvePlayerAlias(target, gameStore)

    console.log(`[MessageParser] Updating relationship: ${source} -> ${target}`)

    // 1. 更新关系数值
    if (delta) {
      const finalDelta = (target === gameStore.player.name)
        ? applyRelationshipWeights(delta, gameStore)
        : delta
      updateRelationshipDelta(source, target, finalDelta)
    }

    // 2. 添加标签和分组
    if (add_tags || add_groups) {
      const current = getRelationship(source, target) || {}
      const newTags = [...(current.tags || [])]
      const newGroups = [...(current.groups || [])]
      
      if (add_tags && Array.isArray(add_tags)) {
        add_tags.forEach(tag => {
          if (!newTags.includes(tag)) newTags.push(tag)
        })
      }
      
      if (add_groups && Array.isArray(add_groups)) {
        add_groups.forEach(group => {
          if (!newGroups.includes(group)) newGroups.push(group)
        })
      }
      
      setRelationship(source, target, {
        ...current,
        tags: newTags,
        groups: newGroups
      })
    }

    // 3. 记录事件
    if (event) {
      addRelationshipEvent(source, target, event)
    }
  })
}
