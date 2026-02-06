import {
  getCurrentClassStatus,
  getTodayScheduleSummary,
  getWeekdayChinese,
  getTermInfo,
  checkDayStatus,
  WEEKDAY_MAP,
  SPECIAL_EVENTS
} from './scheduleGenerator'
import { calculateTotalDays } from './eventSystem'
import { exportRelationshipsForWorldbook } from './relationshipManager'
import { getEmotionalState } from '../data/relationshipData'
import { getItem, getPartTimeJobInfo } from '../data/mapData'
import { getElectiveCourses } from '../data/coursePoolData'
import { getNpcsAtLocation } from './npcScheduleSystem'

/**
 * 构建天气相关的提示词
 * @param {Object} gameState 游戏状态对象
 * @returns {string} 天气提示词
 */
export const buildWeatherPrompt = (gameState) => {
  if (!gameState.worldState || !gameState.worldState.weather || !gameState.worldState.weather.current) {
    return ''
  }

  const weather = gameState.worldState.weather.current
  let prompt = `\n[当前天气] ${weather.icon} ${weather.weatherName}，气温${weather.temperature}°C\n`
  
  // 检查天气变化 (从状态中读取)
  const changeInfo = gameState.worldState.weather.lastChangeInfo
  if (changeInfo) {
    prompt += `[天气变化] ${changeInfo.reason} (从${changeInfo.fromWeather}转为${changeInfo.toWeather})\n`
  }
  
  return prompt
}

/**
 * 构建社交相关的提示词
 * @param {Object} gameState 游戏状态
 * @returns {string} 社交提示词
 */
export const buildSocialPrompt = (gameState) => {
  const { player } = gameState
  let prompt = ''

  // 1. 处理好友申请 (持久化请求)
  if (player.social && player.social.outgoingRequests && player.social.outgoingRequests.length > 0) {
    for (const req of player.social.outgoingRequests) {
      prompt += `\n[好友申请] ${player.name}向"${req.targetName}"发送了好友申请。如果不通过，请回复<reject_friend name="${req.targetName}" reason="拒绝理由" />；如果通过，请回复<add_friend name="${req.targetName}" />\n`
    }
  }
  
  // 2. 处理待回复消息 (持久化 - 替代 pendingCommands 中的 social_msg)
  if (player.holdMessages && player.holdMessages.length > 0) {
    for (const msg of player.holdMessages) {
      if (msg.type === 'social_msg' && msg.metadata && msg.metadata.chatId) {
        // 1. 尝试查找对应的群组
        const group = player.social.groups.find(g => g.id === msg.metadata.chatId)
        
        if (group) {
          // 获取群成员列表
          const memberNames = group.members.map(memberId => {
            if (memberId === 'player') return player.name
            const friend = player.social.friends.find(f => f.id === memberId)
            if (friend) return friend.name
            const npc = gameState.npcs.find(n => n.id === memberId)
            if (npc) return npc.name
            if (!memberId.startsWith('char_') && !memberId.startsWith('npc_')) return memberId
            return '未知成员'
          }).join('、')
          
          // 检查是否是回复消息
          const content = msg.metadata.content || msg.text.split(': ').pop()
          
          if (msg.metadata.replyTo) {
            const { name: replyName, content: replyContent } = msg.metadata.replyTo
            prompt += `\n[待回复-群聊] ${player.name} 在群聊"${group.name}"中回复了 ${replyName} 的消息"${replyContent}"，回复内容是：${content}\n`
            prompt += `[群聊成员] 该群聊内的成员有：${memberNames}\n`
          } else {
            prompt += `\n[待回复-群聊] ${player.name}在群聊"${group.name}"中发言（尚未收到回复），内容是：${content}。该群聊内的成员有：${memberNames}\n`
          }
        } else {
          // 2. 尝试查找好友 (私聊)
          const friend = player.social.friends.find(f => f.id === msg.metadata.chatId)
          const npc = gameState.npcs.find(n => n.id === msg.metadata.chatId)
          const targetName = friend ? friend.name : (npc ? npc.name : null)
          
          if (targetName) {
             const content = msg.metadata.content || msg.text.split(': ').pop()
             if (msg.metadata.replyTo) {
                const { name: replyName, content: replyContent } = msg.metadata.replyTo
                prompt += `\n[待回复-私聊] ${player.name} 回复了 ${replyName} 的消息"${replyContent}"，回复内容是：${content}\n`
             } else {
                prompt += `\n[待回复-私聊] ${player.name}给"${targetName}"发送了私聊消息（尚未收到回复），内容是：${content}。\n`
             }
          }
        }
      }
    }
  }

  // 3. 处理 pendingCommands 中的社交相关指令
  if (player.pendingCommands && player.pendingCommands.length > 0) {
    for (const cmd of player.pendingCommands) {
      // 处理 moment_post (朋友圈)
      if (cmd.type === 'moment_post' && cmd.metadata) {
         const { content } = cmd.metadata
         prompt += `\n[朋友圈动态] ${player.name}发布了一条朋友圈：${content}。请相关角色进行点赞或评论互动。\n`
      }
      // 处理 social_msg (私聊/群聊消息)
      else if (cmd.type === 'social_msg' && cmd.metadata && cmd.metadata.chatId) {
        const group = player.social.groups.find(g => g.id === cmd.metadata.chatId)
        
        if (group) {
          const memberNames = group.members.map(memberId => {
            if (memberId === 'player') return player.name
            const friend = player.social.friends.find(f => f.id === memberId)
            if (friend) return friend.name
            const npc = gameState.npcs.find(n => n.id === memberId)
            if (npc) return npc.name
            if (!memberId.startsWith('char_') && !memberId.startsWith('npc_')) return memberId
            return '未知成员'
          }).join('、')
          
          const content = cmd.metadata.content || cmd.text.split(': ').pop()
          
          if (cmd.metadata.replyTo) {
            const { name: replyName, content: replyContent } = cmd.metadata.replyTo
            prompt += `\n[待回复-群聊] ${player.name} 在群聊"${group.name}"中回复了 ${replyName} 的消息"${replyContent}"，回复内容是：${content}\n`
            prompt += `[群聊成员] 该群聊内的成员有：${memberNames}\n`
          } else {
            prompt += `\n[待回复-群聊] ${player.name}在群聊"${group.name}"中发言（尚未收到回复），内容是：${content}。该群聊内的成员有：${memberNames}\n`
          }
        } else {
          const friend = player.social.friends.find(f => f.id === cmd.metadata.chatId)
          const npc = gameState.npcs.find(n => n.id === cmd.metadata.chatId)
          const targetName = friend ? friend.name : (npc ? npc.name : null)
          
          if (targetName) {
            const content = cmd.metadata.content || cmd.text.split(': ').pop()
            if (cmd.metadata.replyTo) {
              const { name: replyName, content: replyContent } = cmd.metadata.replyTo
              prompt += `\n[待回复-私聊] ${player.name} 回复了 ${replyName} 的消息"${replyContent}"，回复内容是：${content}\n`
            } else {
              prompt += `\n[待回复-私聊] ${player.name}给"${targetName}"发送了私聊消息（尚未收到回复），内容是：${content}。\n`
            }
          }
        }
      }
      // 处理 add_friend_request (好友申请)
      else if (cmd.type === 'add_friend_request' && cmd.metadata) {
        const { targetName } = cmd.metadata
        prompt += `\n[好友申请] ${player.name}向"${targetName}"发送了好友申请。如果不通过，请回复<reject_friend name="${targetName}" reason="拒绝理由" />；如果通过，请回复<add_friend name="${targetName}" />\n`
      }
    }
  }

  return prompt
}

/**
 * 构建论坛相关的提示词
 * @param {Object} player 玩家数据
 * @returns {string} 论坛提示词
 */
export const buildForumPrompt = (player) => {
  let prompt = ''
  let hasContent = false

  // 1. 处理旧版论坛指令队列 (backward compatibility)
  if (player.forum && player.forum.pendingCommands && player.forum.pendingCommands.length > 0) {
    if (!hasContent) { prompt += '\n[校园论坛动态]\n'; hasContent = true; }
    for (const cmd of player.forum.pendingCommands) {
      if (cmd.type === 'post' && cmd.post) {
        prompt += `${player.name} 在论坛【${cmd.post.board}】版块发布了帖子「${cmd.post.title}」: ${cmd.post.content.substring(0, 100)}${cmd.post.content.length > 100 ? '...' : ''}\n`
        if (cmd.turnsRemaining !== undefined) {
          prompt += `(此提醒剩余: ${cmd.turnsRemaining}回合)\n`
        }
      } else if (cmd.type === 'reply' && cmd.reply) {
        prompt += `${player.name} 回复了帖子【${cmd.reply.postId}】: ${cmd.reply.content}\n`
      }
    }
  }

  // 2. 处理新版通用指令队列中的论坛指令
  if (player.pendingCommands && player.pendingCommands.length > 0) {
    for (const cmd of player.pendingCommands) {
      if (cmd.metadata && (cmd.metadata.type === 'forum_post' || cmd.metadata.type === 'forum_reply')) {
        if (!hasContent) { prompt += '\n[校园论坛动态]\n'; hasContent = true; }
        
        if (cmd.metadata.type === 'forum_post') {
          const post = cmd.metadata.post
          prompt += `${player.name} 在论坛【${post.board}】版块发布了帖子「${post.title}」: ${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}\n`
        } else if (cmd.metadata.type === 'forum_reply') {
          const { post, replyContent } = cmd.metadata
          // 使用新格式
          prompt += `${player.name}，回复了帖子【${post.id}】【${post.title}】【${post.content}】：${replyContent}。[请感兴趣的大家一起互动一下吧]\n`
        }
      }
    }
  }

  // 论坛指令格式说明始终输出，让 AI 可以主动操作论坛
  prompt += `
[论坛指令格式]
AI可以使用以下标签来操作论坛（天华通APP）：
- 发帖: <forum_post board="版块" title="标题" from="作者" pinned="false">内容</forum_post>
- 回复: <forum_reply post_id="post_xxx" from="作者">回复内容</forum_reply>
- 点赞: <forum_like post_id="post_xxx" from="用户名" />
可用版块: 校园杂谈、学习交流、都市传说、失物招领、社团招新、二手交易
`

  return prompt
}

/**
 * 构建课程相关的提示词
 * @param {Object} gameTime 游戏时间
 * @param {Object} weeklySchedule 周课表
 * @returns {string} 课程提示词
 */
export const buildSchedulePrompt = (gameTime, weeklySchedule) => {
  if (!weeklySchedule || Object.keys(weeklySchedule).length === 0) {
    return ''
  }

  // 获取今日课表摘要
  const scheduleSummary = getTodayScheduleSummary(gameTime, weeklySchedule)
  
  // 获取当前课程状态
  const classStatus = getCurrentClassStatus(gameTime, weeklySchedule)
  
  let prompt = `\n[今日课表]\n${scheduleSummary}\n`
  
  // 根据课程状态添加详细信息
  switch (classStatus.status) {
    case 'in_class':
      prompt += `\n[当前状态] ${classStatus.message}`
      break
    case 'between_classes':
      if (classStatus.nextClass) {
        prompt += `\n[当前状态] 课间休息。${classStatus.message}`
      }
      break
    case 'before_school':
      if (classStatus.nextClass) {
        prompt += `\n[当前状态] 尚未开始上课。第一节课：${classStatus.nextClass.subject}，${classStatus.nextClass.start}开始，地点：${classStatus.nextClass.location}`
      }
      break
    case 'lunch':
      prompt += `\n[当前状态] ${classStatus.message}`
      if (classStatus.nextClass) {
        prompt += `。下午第一节课：${classStatus.nextClass.subject}，${classStatus.nextClass.start}开始，地点：${classStatus.nextClass.location}`
      }
      break
    case 'club_time':
      prompt += `\n[当前状态] ${classStatus.message}。学生可以参加社团活动或自由行动。`
      break
    case 'after_classes':
      prompt += `\n[当前状态] ${classStatus.message}`
      break
    case 'weekend':
    case 'holiday':
      prompt += `\n[当前状态] ${classStatus.message}`
      break
    default:
      break
  }
  
  // 如果有特殊事件，添加提示
  if (classStatus.eventInfo && classStatus.eventInfo.isSpecial) {
    prompt += `\n[特殊日期] 今天是${classStatus.eventInfo.name}。`
  }
  
  return prompt
}

/**
 * 构建兼职状态相关的提示词
 * @param {Object} gameState 游戏状态对象
 * @returns {string} 兼职状态提示词
 */
export const buildPartTimeJobPrompt = (gameState) => {
  const { player } = gameState
  const partTimeJob = player.partTimeJob
  
  if (!partTimeJob || !partTimeJob.currentJob) {
    return ''
  }
  
  let prompt = ''
  const jobInfo = getPartTimeJobInfo(partTimeJob.currentJob)
  const jobName = jobInfo ? jobInfo.name : partTimeJob.currentJob
  const locationObj = getItem(partTimeJob.currentJob)
  const locationName = locationObj ? locationObj.name : partTimeJob.currentJob
  
  // 基础兼职信息
  prompt += `\n[兼职状态] ${player.name}目前在"${locationName}"担任"${jobName}"兼职工作。`
  
  if (partTimeJob.isWorking) {
    // 正在工作中
    const workDuration = partTimeJob.workStartTime 
      ? Math.floor((Date.now() - partTimeJob.workStartTime) / 60000)
      : 0
    
    prompt += `\n[工作进行中] ${player.name}正在工作，已工作约${workDuration}分钟。`
    prompt += `\n[系统提示] 玩家处于兼职状态，请在剧情描写中体现其工作内容和状态。`
    
    if (jobInfo) {
      prompt += `\n[工作内容] ${jobInfo.description || '完成工作任务'}`
      if (jobInfo.hourlyWage) {
        prompt += `，时薪${jobInfo.hourlyWage}元`
      }
    }
  } else {
    // 已申请但未开始工作
    prompt += `（当前未在工作时间）`
  }
  
  // 累计收入
  if (partTimeJob.totalEarnings > 0) {
    prompt += `\n[兼职收入] 累计赚取：${partTimeJob.totalEarnings}元`
  }

  // 兼职结算提示 (持续两轮)
  if (partTimeJob.lastWorkInfo) {
    const { jobName, duration, earnings } = partTimeJob.lastWorkInfo
    const hours = Math.floor(duration / 60)
    const mins = duration % 60
    const timeStr = hours > 0 ? `${hours}小时${mins}分钟` : `${mins}分钟`
    
    prompt += `\n[兼职结算] ${player.name}刚刚完成了一次"${jobName}"的兼职工作。工作时长: ${timeStr}，获得工资: ${earnings}元。`
  }
  
  return prompt
}

/**
 * 获取今日特殊日期提示词
 * @param {Object} gameTime 游戏时间
 * @param {Array} customCalendarEvents 自定义日历事件
 * @returns {string} 特殊日期提示词
 */
export const buildSpecialDatePrompt = (gameTime, customCalendarEvents = []) => {
  const { year, month, day } = gameTime
  const specialDates = []
  
  // 1. 检查系统预设的特殊事件
  const dayStatus = checkDayStatus(month, day)
  if (dayStatus.eventInfo) {
    specialDates.push(dayStatus.eventInfo.name)
  }
  
  // 2. 检查特殊纪念日
  for (const event of SPECIAL_EVENTS) {
    if (event.month === month && event.day === day) {
      if (!specialDates.includes(event.name)) {
        specialDates.push(event.name)
      }
    }
  }
  
  // 3. 检查自定义事件
  if (customCalendarEvents && customCalendarEvents.length > 0) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const monthDayStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    for (const event of customCalendarEvents) {
      // 完整日期匹配
      if (event.date === dateStr) {
        specialDates.push(event.name)
      }
      // 每年重复的事件
      else if (event.isRecurring && event.date === monthDayStr) {
        specialDates.push(event.name)
      }
    }
  }
  
  if (specialDates.length === 0) return ''
  
  return `\n[特殊提醒] 今天是${specialDates.join('、')}。`
}

/**
 * 获取事件类型的中文前缀
 * @param {string} type 
 * @returns {string}
 */
const getEventTypePrefix = (type) => {
  const typeMap = {
    '全校性': '全校通知',
    '年级性': '年级通知',
    '班级性': '班级通知',
    '社团性': '社团活动',
    '个人': '个人事件',
    '突发': '突发事件',
    '传闻': '校园传闻',
    '地区性': '地区活动',
    '校际': '校际交流',
    '特殊日': '特殊日期',
    '假期': '假期通知',
    '人际': '人际关系',
    '文化性': '文化活动'
  }
  return typeMap[type] || '事件通知'
}

/**
 * 构建事件系统提示词
 * @param {Object} player 玩家数据
 * @param {Object} gameTime 游戏时间
 * @returns {string}
 */
export const buildEventPrompt = (player, gameTime) => {
  if (!player.activeEvents || player.activeEvents.length === 0) {
    return ''
  }
  
  let prompt = '\n'
  const currentTotalDays = calculateTotalDays(gameTime)
  
  for (const event of player.activeEvents) {
    const elapsedDays = currentTotalDays - event.startDay
    const remainingDays = event.duration - elapsedDays
    
    if (event.isGhost && !event.playerInvolved) {
      // 怪谈类事件 - 持续提示直到玩家卷入
      prompt += `[${getEventTypePrefix('传闻')}] ${event.name} (event_id: ${event.id})\n`
      prompt += `${event.description}\n`
    } else if (elapsedDays === 0) {
      // 事件刚开始
      prompt += `[${getEventTypePrefix(event.type)}·开始] ${event.name}\n`
      prompt += `${event.description}\n`
      if (event.duration > 1) {
        prompt += `(持续${event.duration}天)\n`
      }
      prompt += '\n'
    } else if (remainingDays > 0) {
      // 事件进行中
      prompt += `[${getEventTypePrefix(event.type)}·进行中] ${event.name}\n`
      prompt += `${event.description}\n`
      prompt += `(第${elapsedDays + 1}天/共${event.duration}天)\n\n`
    } else if (remainingDays === 0) {
      // 事件最后一天
      prompt += `[${getEventTypePrefix(event.type)}·最后一天] ${event.name}\n`
      prompt += `${event.description}\n\n`
    }
  }
  
  return prompt
}

/**
 * 游戏状态提示词模板
 * @param {Object} gameState 游戏状态对象
 * @returns {string} 格式化后的提示词内容
 */
export const buildSystemPromptContent = (gameState) => {
  const { gameTime, player, npcs, npcRelationships, allClassData, allClubs } = gameState
  
  // 获取中文星期
  const weekdayChinese = getWeekdayChinese(gameTime.weekday)
  
  // 获取学期信息
  const termInfo = getTermInfo(gameTime.year, gameTime.month, gameTime.day)
  const termStr = termInfo.isVacation 
    ? `(${termInfo.vacationName})` 
    : `(${termInfo.termName} 第${termInfo.weekNumber}周)`
  
  const timeStr = `${gameTime.year}年${gameTime.month}月${gameTime.day}日 ${weekdayChinese} ${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')} ${termStr}`
  
  // 获取当前位置名称
  const locationObj = getItem(player.location)
  const locationName = locationObj ? locationObj.name : player.location

  // 构建背景故事提示词
  let backgroundPrompt = ''
  if (player.backgroundStory && player.backgroundStory.trim()) {
    backgroundPrompt = `Character Background: ${player.backgroundStory}\n`
  }

  // 获取班级名称
  let className = player.classId
  if (player.classRoster && player.classRoster.name) {
    className = player.classRoster.name
  }

  // 简化背包显示，仅显示前10个物品或简略信息
  const inventoryStr = player.inventory.length > 0 
    ? player.inventory.map(i => `${i.name}x${i.count}`).join(', ')
    : '无'

  // 构建技能信息
  let skillsStr = ''
  if (player.subjects) {
    const subjects = Object.entries(player.subjects)
      .map(([key, val]) => `${key}(Lv.${val})`)
      .join(', ')
    skillsStr += `Subjects: ${subjects}\n`
  }
  if (player.skills) {
    const skills = Object.entries(player.skills)
      .map(([key, val]) => `${key}(Lv.${val})`)
      .join(', ')
    skillsStr += `Skills: ${skills}`
  }

  // 构建相识角色列表
  let knownNpcsStr = ''
  if (npcRelationships) {
    const knownNames = []
    for (const charName of Object.keys(npcRelationships)) {
      const rel = npcRelationships[charName]?.relations?.[player.name]
      // 检查是否有有效关系数据 (非零数值或有标签/分组)
      if (rel && (
        rel.intimacy !== 0 || 
        rel.trust !== 0 || 
        rel.passion !== 0 || 
        rel.hostility !== 0 || 
        (rel.tags && rel.tags.length > 0) || 
        (rel.groups && rel.groups.length > 0)
      )) {
        knownNames.push(charName)
      }
    }
    
    if (knownNames.length > 0) {
      knownNpcsStr = `\n[Known NPCs] 和${player.name}已经相识的角色有：${knownNames.join(', ')}`
    }
  }

  // 构建在场 NPC 详细信息 (状态、属性、关系)
  let npcRelationsStr = ''
  if (npcs && npcRelationships) {
    // 使用 NPC 日程系统获取当前位置的 NPC
    const locationNpcs = getNpcsAtLocation(player.location, gameState)
    // 过滤出存活的 NPC
    const presentNpcs = locationNpcs.filter(npc => npc.isAlive)
    
    if (presentNpcs.length > 0) {
      const npcDetails = []
      const names = presentNpcs.map(n => n.name).join(', ')
      npcDetails.push(`\n[Characters Present at ${locationName}]: ${names}`)
      
      for (const npc of presentNpcs) {
        const npcData = npcRelationships[npc.name]
        let details = `\n[NPC Status: ${npc.name}]\n`
        details += `Status: Alive\n`
        
        // 四维属性
        if (npcData && npcData.personality) {
          const { order, altruism, tradition, peace } = npcData.personality
          details += `Personality: Order(${order}), Altruism(${altruism}), Tradition(${tradition}), Peace(${peace})\n`
        }

        // 查找班级
        let className = 'Unknown'
        if (allClassData) {
          for (const [id, data] of Object.entries(allClassData)) {
            // @ts-ignore
            if (data.students && data.students.some(s => s.name === npc.name)) {
              className = data.name || id
              break
            }
          }
        }
        details += `Class: ${className}\n`

        // 查找社团
        let clubNames = []
        if (allClubs) {
          for (const [id, data] of Object.entries(allClubs)) {
            // @ts-ignore
            if (data.members && data.members.includes(npc.name)) {
              clubNames.push(data.name || id)
            }
          }
        }
        details += `Club: ${clubNames.length > 0 ? clubNames.join(', ') : 'None'}\n`
        
        // 角色详情 (Role)
        details += `Role: ${npc.role || 'Unknown'}\n`

        // 心情状态
        if (npc.mood) {
          details += `Mood: ${npc.mood} ${npc.moodReason ? `(Reason: ${npc.moodReason})` : ''}\n`
        }

        // 关系链
        const relations = []
        if (npcData && npcData.relations) {
          // 对玩家的关系
          if (npcData.relations[player.name]) {
            const rel = npcData.relations[player.name]
            const emotion = getEmotionalState(rel)
            let relStr = `- To ${player.name}: [${emotion.text}] Intimacy(${rel.intimacy}), Trust(${rel.trust}), Passion(${rel.passion}), Hostility(${rel.hostility})`
            if (rel.tags && rel.tags.length > 0) {
              relStr += `, Tags: [${rel.tags.join(', ')}]`
            }
            relations.push(relStr)
          }

          // 对其他在场NPC的关系 (如果场上还有其他人)
          for (const otherNpc of presentNpcs) {
            if (otherNpc.id !== npc.id && npcData.relations[otherNpc.name]) {
              const rel = npcData.relations[otherNpc.name]
              const emotion = getEmotionalState(rel)
              relations.push(`- To ${otherNpc.name}: [${emotion.text}] Intimacy(${rel.intimacy}), Trust(${rel.trust}), Passion(${rel.passion}), Hostility(${rel.hostility})`)
            }
          }
        }

        if (relations.length > 0) {
          details += `Impressions:\n${relations.join('\n')}`
        }
        
        npcDetails.push(details)
      }

      if (npcDetails.length > 0) {
        npcRelationsStr = npcDetails.join('\n')
      }
    }
  }

  // 构建课表提示词（非假期时）
  const schedulePrompt = (player.schedule && !termInfo.isVacation)
    ? buildSchedulePrompt(gameTime, player.schedule)
    : (termInfo.isVacation ? `\n[假期] 现在是${termInfo.vacationName}，无课程安排。` : '')

  // 构建特殊日期提示词
  const specialDatePrompt = buildSpecialDatePrompt(gameTime, player.customCalendarEvents)

  // 构建社团申请提示词
  let clubApplicationPrompt = ''
  if (gameState.clubApplication) {
    const { clubId, clubName, remainingTurns } = gameState.clubApplication
    clubApplicationPrompt = `
[System Notice]
Player is applying to join the club "${clubName}" (Club ID: ${clubId}).
This application will expire in ${remainingTurns} turns.
As the president or person in charge, please decide whether to approve or reject.
- To approve, reply with: <join_club id="${clubId}" />
- To reject, reply with: <reject_club id="${clubId}" from="Name" reason="Reason" />
`
  }

  // 构建论坛提示词
  const forumPrompt = buildForumPrompt(player)

  // 构建事件提示词
  const eventPrompt = buildEventPrompt(player, gameTime)

  // 构建天气提示词
  const weatherPrompt = buildWeatherPrompt(gameState)

  // 构建NPC关系提示词（简略版，仅提示AI可以查询）
  // 完整关系网络通常通过世界书注入，这里只提示AI关注关系变化
  const relationshipPrompt = `
[NPC关系系统]
系统已启用NPC关系网络。你可以查看以下的数据来判定该角色对目标角色的印象。
关系轴：intimacy(亲密), trust(信赖), passion(激情), hostility(敌意)
`

  // 构建社交提示词
  const socialPrompt = buildSocialPrompt(gameState)

  // 构建兼职状态提示词
  const partTimeJobPrompt = buildPartTimeJobPrompt(gameState)

  // 构建新游戏引导提示词
  let newGameGuidePrompt = ''
  if (player.newGameGuideTurns > 0 && player.classId) {
    const classGroupId = `group_${player.classId}`
    const classGroup = player.social.groups.find(g => g.id === classGroupId)
    if (classGroup) {
      const memberNames = classGroup.members.map(memberId => {
        if (memberId === 'player') return player.name
        const friend = player.social.friends.find(f => f.id === memberId)
        if (friend) return friend.name
        const npc = npcs.find(n => n.id === memberId)
        if (npc) return npc.name
        if (!memberId.startsWith('char_') && !memberId.startsWith('npc_')) return memberId
        return '未知成员'
      }).join('、')
      
      newGameGuidePrompt = `\n[新学期引导] 同学们加入了"${classGroup.name}"。班级内的所有成员名单如下：${memberNames}。大家在班级群内聊天打招呼吧。\n`
    }
  }

  // 构建选修课提醒提示词
  let electiveReminderPrompt = ''
  if (player.schedule && !termInfo.isVacation && (!player.selectedElectives || player.selectedElectives.length === 0)) {
    const classStatus = getCurrentClassStatus(gameTime, player.schedule)
    // 不包括假期(已检查)、放学后、周末、节假日
    if (classStatus.status !== 'after_classes' && classStatus.status !== 'weekend' && classStatus.status !== 'holiday' && classStatus.status !== 'exam') {
      const electives = getElectiveCourses(player.classId)
      const electivesStr = electives.map(c => `${c.name}(老师:${c.teacher})`).join('、')
      electiveReminderPrompt = `\n[系统提示] 请班主任提醒'${player.name}'尽快在天华通APP上选择选修课程。现在可选的选修课程有：${electivesStr}。\n`
    }
  }

  // 构建通用待处理指令提示词（处理未被其他函数处理的 pendingCommands）
  let pendingCommandsPrompt = ''
  if (player.pendingCommands && player.pendingCommands.length > 0) {
    const unhandledCommands = []
    for (const cmd of player.pendingCommands) {
      // 跳过已在其他地方处理的类型
      if (cmd.type === 'moment_post') continue
      if (cmd.type === 'social_msg') continue
      if (cmd.type === 'add_friend_request') continue
      if (cmd.metadata?.type === 'forum_post') continue
      if (cmd.metadata?.type === 'forum_reply') continue
      
      // 处理其他类型的指令（包括 type === 'other' 或 type === 'item_use' 等）
      if (cmd.text) {
        unhandledCommands.push(cmd.text)
      }
    }
    
    if (unhandledCommands.length > 0) {
      pendingCommandsPrompt = '\n[待处理指令]\n' + unhandledCommands.join('\n') + '\n'
    }
  }

  let prompt = `
以下是当前的玩家状态和你需要注意的细节，你在生成回复时都需要参考以下内容。
如果和其他的玩家人设有冲突，请忽略其他位置的玩家人设，以下方的为主：
[Current Game State]
Time: ${timeStr}
Player: ${player.name} (Lv.${player.level})
Class: ${className}
Character Feature: ${player.characterFeature || '无'}
${backgroundPrompt}Location: ${locationName}
Money: ${player.money}
Inventory: ${inventoryStr}
Stats: IQ=${player.attributes.iq}, EQ=${player.attributes.eq}, PHY=${player.attributes.physique}, FLEX=${player.attributes.flexibility}, CHARM=${player.attributes.charm}, MOOD=${player.attributes.mood}, HEALTH=${player.health}
${skillsStr}${knownNpcsStr}
${npcRelationsStr}${weatherPrompt}${schedulePrompt}${specialDatePrompt}${clubApplicationPrompt}${socialPrompt}${forumPrompt}${eventPrompt}${relationshipPrompt}${partTimeJobPrompt}${newGameGuidePrompt}${electiveReminderPrompt}${pendingCommandsPrompt}
[Instructions]
请根据玩家的行动推动剧情发展。
[Style]
如果和其他的文风要求有冲突，请最优先参考以下要求
请参考以下的要求进行剧情演绎：
- 日式轻小说风格的剧情演出，聚焦于日常生活，适当增添一些新鲜感的小冲突和解决矛盾的过程。
- 整体是轻松日常的色彩和适当的幽默感，不进行冗长或突兀的比喻描写，应当融入场景，不跳跃。
- 在适当的场合聚焦于角色的细腻的心理与情感，微表情，还有不经意间的动作，描写出角色感情互动中的甜与酸，将人物情感融入肢体语言中，将角色写活，不生硬死板。
- 段落应当简短，交错的长短句会更有轻小说的感觉，但不能过于频繁的频繁分段或频繁的单句成段。
- 如果角色发言过长，请适当在中间插入一些简短的肢体语言或者神情描写。
- 使用「」包裹所有除了指令内以外的对话和角色发言内容。
- 同时有多名角色在场时注意保持节奏，优先聚焦于有互动的角色。
回复要求：
- 玩家只是这个世界的其中一个个体，玩家不是世界的中心，没有主角光环。或者说这个世界里的每个人都是主角，所以不需要在故事中讨好玩家。玩家可能会因为某件事情受挫，也会可能因为某件事情而被讨厌，特别不能毫无理由的满足玩家的需要，也禁止为玩家要求的剧情发展扭曲逻辑。请注意这是一个拟真的世界，任何事情和社交关系必须按照正常世界的要求进行合理化的发展，不能前后矛盾。
- 剧情正文请包裹在 <content> 标签中。
- 如果玩家想要加入的目标社团的成员因为某种原因，要拒绝玩家的社团加入申请，请输出<reject_club id="club_id" from="拒绝人" reason="理由" /> 必须要包含拒绝人和理由，拒绝人一般是该社团的社长或副社长。如果如果有角色想要让玩家加入某个社团，或者同意了玩家的社团加入申请，请使用<join_club id="club_id" />命令来让玩家加入社团。注意，当接收到社团申请消息时请立即处理，不论社团成员是否在场。
- 如果有玩家的好友角色（无论在不在场）想给玩家发送私聊社交消息的话，请输出<social_msg from="角色名称">消息内容</social_msg>
- 如果有角色收到玩家的私聊消息后，因为某种原因未能及时查看消息，例如上课或者睡觉等状态时请输出<social_status name="角色名">hold</social_status>以便在下一轮对话中继续处理。如果角色因为某种原因：例如对玩家印象不好，或其他的负面原因导致不想回玩家的这条消息。那么可以输出<social_status name="角色名">pass</social_status>（注意，此条目是为了给玩家增添沉浸感）
- 如果有群聊内的任意角色（不包括玩家）想要在群聊内发送消息的话，请输出<group_msg group="群组名称" sender="角色姓名">消息内容</group_msg> 注意：群组名称务必与玩家加入的群名称一致，不要随意简写。
- 如果有其他角色主动添加玩家为好友，先检查玩家社交关系中的好友列表（不是群组列表）内是否存在该角色，如果不存在的话请输出<add_friend name="角色名" avatar="emoji">个性签名</add_friend>（注意，如果剧情内输出了相关的添加好友成功的文字时，也要随之输出这个指令，因为正文内的加好友文字信息和这个指令不是替代关系）
- 如果系统提示词内提示某个角色收到了好友申请，请立即进行处理（无论在不在场）
- 注意，输出的xml格式的指令并不能计入正文内容的长度，也就是如果生成了指令，正文的长度也要随之加长。
- 如果某角色不在某个事件的场合内，那么ta不应得知另一个时间/空间的对话与剧情。任何角色或玩家在没有铺垫或不得知信息来源的情况下，不能凭空得知情报。角色的情报来源应该通过调查、探索、推理、猜测或向他人询问才能得知，而非进行任何形式的逻辑跳跃或推测。
- 角色不会得知到任何关于剧情、玩家、设定等概念。角色记忆是线性的，除非设定允许角色进行测算未来，否则角色无法预知未来，也不会将未来的信息代入到当前的决策中。
- 只有玩家或某角色在双引号或「」内或者其他形式的直接发言才可以被其他角色知晓，除此之外的内容，例如心声等不得当作角色可以直接获取的情报内容。不应出现未自我介绍或该角色和目标角色毫无关系的情况下，就知道姓名。也同样禁止另一个场景的A角色对话被不在该场景的B角色直接听到。
- 在输出正文的结尾禁止出现不必要的升华，不必要的升华会破坏剧情的沉浸感。
- 如果玩家想要前往的地点太远，或不满足进入的时间或条件，则委婉的告知玩家，并用自然的剧情演绎向再次玩家确认。
- 请严格遵循本世界观和设定中的内容，不允许出现同位体和过度参考原作设定的问题，只有人设和人际关系的印象需要参考原作设定，本世界观设定和原作冲突的部分优先参照本世界观的设定，一切按照本世界观和设定来推进剧情。
- “本次玩家输入”就是玩家在扮演玩家角色时想让玩家角色做的事，说的话，等等。除非有特定要求，否则在参考“本次玩家输入”的内容时，严格禁止在剧情演绎中替玩家扮演的角色说话，做事，描写心理活动，替玩家做决定等一系列玩家输入中没有涉及到的内容。
`

  // 如果开启了建议回复功能，要求AI生成建议回复
  if (gameState.settings?.suggestedReplies) {
    prompt += `- 请在回复的最后（所有内容之后）生成3-4个建议玩家回复的内容选项，使用JSON数组格式包裹在<suggested_replies>标签中。例如：<suggested_replies>["回复1", "回复2", "回复3", "回复4"]</suggested_replies>。这些回复应该符合当前情境，帮助不知道该说什么的玩家推进剧情。\n`
  }

  // 如果未开启辅助AI且开启了总结系统，要求主AI生成小总结
  if (gameState.settings?.summarySystem?.enabled && !gameState.settings?.assistantAI?.enabled) {
    prompt += `- 你必须在每次回复的正文底部生成一个格式为：
    日期|年月日时分
    标题|给这次总结的内容起一个20字左右的标题
    地点|当前位置
    人物|当前场景内的角色
    描述|这次正文的摘要总结
    人物关系|这次正文中人物关系的变化
    重要信息|这次正文中的重要信息
    的详细的剧情小总结（100-200字）。注意客观记录，不添加主观评价并用 <minor_summary>总结内容</minor_summary> 标签包裹。不可与其他标签混淆，也绝不可遗漏输出。\n`
  }
  
  return prompt
}

/**
 * 构建注入对象
 * @param {Object} gameState 游戏状态
 * @returns {Object} 符合 InjectionPrompt 结构的对象 (不含 id)
 */
export const buildSystemInjection = (gameState) => {
  return {
    role: 'system',
    content: buildSystemPromptContent(gameState),
    position: 'in_chat', // 插入到聊天中
    depth: 1, // 深度 0 表示插入到最新消息附近 (具体取决于 ST 设置，通常 0 是最底部或顶部，视实现而定，这里假设我们需要它生效)
    // 根据 generate.d.ts，generate 函数的 injects 不需要 id
    should_scan: true // 允许触发世界书
  }
}
