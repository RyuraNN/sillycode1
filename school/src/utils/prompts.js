import {
  getCurrentClassStatus,
  getTodayScheduleSummary,
  getNextDayScheduleSummary,
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
      prompt += `\n[当前状态] 尚未开始上课。第一节课：${classStatus.nextClass.subject}${classStatus.nextClass.teacher ? '（' + classStatus.nextClass.teacher + '）' : ''}，${classStatus.nextClass.start}开始，地点：${classStatus.nextClass.location}`
      }
      break
    case 'lunch':
      prompt += `\n[当前状态] ${classStatus.message}`
      if (classStatus.nextClass) {
        prompt += `。下午第一节课：${classStatus.nextClass.subject}${classStatus.nextClass.teacher ? '（' + classStatus.nextClass.teacher + '）' : ''}，${classStatus.nextClass.start}开始，地点：${classStatus.nextClass.location}`
      }
      break
    case 'club_time':
      prompt += `\n[当前状态] ${classStatus.message}。学生可以参加社团活动或自由行动。`
      break
    case 'after_classes':
      prompt += `\n[当前状态] ${classStatus.message}`
      prompt += getNextDayScheduleSummary(gameTime, weeklySchedule)
      break
    case 'exam':
      prompt += `\n[当前状态] ${classStatus.message}`
      if (gameTime.hour >= 18) {
        prompt += getNextDayScheduleSummary(gameTime, weeklySchedule)
      }
      break
    case 'weekend':
    case 'holiday':
      prompt += `\n[当前状态] ${classStatus.message}`
      if (gameTime.hour >= 18) {
        prompt += getNextDayScheduleSummary(gameTime, weeklySchedule)
      }
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
        details += `Gender: ${npcData?.gender || npc.gender || 'Unknown'}\n`
        
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
        let roleStr = npc.role || 'Unknown'
        if (npc.role === 'staff' && npc.staffTitle) {
          roleStr += ` (${npc.staffTitle})`
        }
        details += `Role: ${roleStr}\n`
        
        // 工作地点 (职工)
        if (npc.role === 'staff' && npc.workplace) {
          const workplaceName = getItem(npc.workplace)?.name || npc.workplace
          details += `Workplace: ${workplaceName}\n`
        }

        // 心情状态
        if (npc.mood) {
          details += `Mood: ${npc.mood} ${npc.moodReason ? `(Reason: ${npc.moodReason})` : ''}\n`
        }

        // 备注信息
        if (gameState.characterNotes && gameState.characterNotes[npc.name]) {
          details += `Notes: ${gameState.characterNotes[npc.name]}\n`
        }

        // 关系链
        const relations = []
        if (npcData && npcData.relations) {
          // 对玩家的关系
          if (npcData.relations[player.name]) {
            const rel = npcData.relations[player.name]
            const playerGender = player.gender || 'male'
            const npcGender = npcData.gender || npc.gender || 'female'
            const emotion = getEmotionalState(rel, playerGender, npcGender)
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
              const npcGender = npcData.gender || npc.gender || 'female'
              const otherNpcData = npcRelationships[otherNpc.name]
              const otherNpcGender = otherNpcData?.gender || otherNpc.gender || 'female'
              const emotion = getEmotionalState(rel, npcGender, otherNpcGender)
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

  // 构建社团邀请提示词
  let clubInvitationPrompt = ''
  if (gameState.clubInvitation) {
    const { clubId, clubName, targetName, remainingTurns } = gameState.clubInvitation
    clubInvitationPrompt = `
[社团邀请]
${player.name}邀请"${targetName}"加入"${clubName}"(社团ID: ${clubId})。
该邀请将在 ${remainingTurns} 回合后过期。
请扮演${targetName}，根据角色性格和与玩家的关系决定是否接受邀请。
- 接受邀请: <club_invite_accept id="${clubId}" name="${targetName}" />
- 拒绝邀请: <club_invite_reject id="${clubId}" name="${targetName}" reason="拒绝理由" />
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
Academic Year: ${player.academicYear || 2024}
Player: ${player.name} (Lv.${player.level})
Grade: ${player.gradeYear || 1}年级
Gender: ${player.gender || 'Unknown'}
Class: ${className}
Character Feature: ${player.characterFeature || '无'}
${backgroundPrompt}Location: ${locationName}
Money: ${player.money}
Inventory: ${inventoryStr}
Stats: IQ=${player.attributes.iq}, EQ=${player.attributes.eq}, PHY=${player.attributes.physique}, FLEX=${player.attributes.flexibility}, CHARM=${player.attributes.charm}, MOOD=${player.attributes.mood}, HEALTH=${player.health}
${skillsStr}${knownNpcsStr}
${npcRelationsStr}${weatherPrompt}${schedulePrompt}${specialDatePrompt}${clubApplicationPrompt}${clubInvitationPrompt}${socialPrompt}${forumPrompt}${eventPrompt}${relationshipPrompt}${partTimeJobPrompt}${newGameGuidePrompt}${electiveReminderPrompt}${pendingCommandsPrompt}
[Instructions]
请根据玩家的行动推动剧情发展。
- 剧情正文包裹在 <content> 标签中。
- 系统指令输出在 <content> 标签之外（前或后均可）。
- 每次输出前必须先进行 <extrathink> 结构化思考，思考完成后再输出正文和指令。
- 指令的文本长度不计入正文篇幅。即：即使本轮输出了大量指令，<content>内的正文也必须保持完整的、应有的篇幅和质量，不可因为输出了指令就缩短正文。
- ⚠️ 先想清楚，再输出。所有的信息确认、错误检查、逻辑验证必须在<extrathink>中完成。<content>正文中不允许出现任何形式的中途纠错、找补或自我修正。如果你不确定某个细节，在思考阶段解决它，不要把不确定性带入正文。
[Style]
※ 以下文风要求为最高优先级，若与其他要求冲突，以此为准。

整体风格：
- 日式轻小说风格的剧情演出，聚焦于日常生活中的细腻互动。
- 整体色彩轻松明快，适当增添幽默感和新鲜感的小冲突。
- 不追求宏大叙事，而是在日常中捕捉角色之间微妙的情感变化。

段落与句式：
- 段落应当简短，长短句自然交错，营造轻小说特有的阅读节奏。
- 不要过于频繁地单句成段，也不要堆砌过长的段落。
- 适当使用省略号、破折号等标点来表现语气和节奏。

对话与发言：
- 使用「」包裹所有角色的直接发言（系统指令内的内容除外）。
- 如果角色发言较长（超过两句），请在中间自然地插入简短的肢体语言、神情变化或动作描写，避免大段纯对话。

描写要求：
- 比喻和修辞必须融入当前场景，从感官体验中自然生长，不冗长、不突兀、不跳跃。禁止突然插入与场景脱节的华丽比喻。
- 在适当的场合聚焦角色的微表情、不经意的小动作、细腻的心理波动，将情感融入肢体语言中，让角色鲜活而非死板。
- 描写第一视角场景时，注意从五感出发，由近到远、由浅入深地发散描写：先写最直接的感受，再引导视线聚焦，最后自然连接到场景或人物。如果不构成伏笔，就直接闭合描写，不要生硬嵌入。

场景节奏：
- 同时有多名角色在场时，优先聚焦正在互动的角色，其他角色用简短反应带过，保持节奏不拖沓。
- 玩家独处时，通过环境细节变化、小事件、感官描写来推动场景，避免空白感。
- 在正文结尾禁止出现不必要的升华、感慨或总结性语句，让场景自然收束。

[Core Rules]

1. 无主角光环玩家只是这个世界中的一个普通个体，不是世界的中心。这个世界里的每个人都是自己故事的主角。
   - 不需要在故事中讨好玩家。
   - 玩家可能因为某件事受挫，也可能被某个角色讨厌。
   - 特别禁止毫无理由地满足玩家的需求。
   - 禁止为了玩家要求的剧情发展而扭曲逻辑。

2. 拟真世界
   这是一个拟真的世界，所有事件和社交关系必须按照现实世界的逻辑合理发展。
   - 关系的建立需要时间和契机，不能一见面就成为挚友。
   - 信任需要积累，好感需要经营。
   - 前后逻辑必须一致，不能自相矛盾。

3. 信息隔离
   - 不在某个事件场合内的角色，不应得知该时间/空间内的对话与剧情。
   - 只有角色在「」内或其他形式的直接发言才可以被在场的其他角色知晓。
   - 心声、内心独白等内容不得被其他角色感知。
   - 角色的情报来源必须通过合理途径获得：在场目击/听闻、他人转述、主动调查、合理推理。禁止任何形式的逻辑跳跃或无依据推测。
   - 禁止不同场景之间的信息泄露（A场景的对话不会被B场景的角色听到）。
   - 未经自我介绍或无既有关系时，角色不应直接知晓对方姓名。

4. 世界观优先级
   - 严格遵循本世界观和设定中的内容。
   - 对于来自其他作品的角色，只参考其原作中的人设印象和人际关系作为性格基底。
   - 本世界观设定与原作冲突的部分，无条件优先参照本世界观。
   - 不允许出现同位体（同一角色同时出现在两个地方）。- 不允许过度参考或照搬原作的剧情、能力体系、世界观设定。
   - 非常重要：角色的具体属性（年级、班级、年龄、辈分、住所、社团归属等）以本世界观设定为唯一标准。如果本世界观设定某些角色为同班同级，则禁止出现任何暗示他们不同年级的行为或对话（如"回到X年级教室""作为学妹/学姐"等）。

5. 角色认知边界
   - 角色不会得知任何关于"剧情""设定""玩家""系统"等元概念。
   - 角色的记忆是线性的，除非设定明确允许，否则角色无法预知未来。
   - 角色不会将未来的信息代入当前的决策中。

6. 地点与条件
   - 如果玩家想要前往的地点太远，或不满足进入的时间/权限/状态条件，则通过自然的剧情演绎委婉告知玩家，并用剧情方式再次向玩家确认意图。
   - 不要用系统提示或旁白的口吻告知，而是融入场景中。

7. 场景人员构成逻辑
   不同类型的场景有不同的人员来源规则，禁止将"同班同学"作为所有场景的默认人员构成：
   - 常规课堂：同班同学一起上课。
   - 选修课/兴趣课：按个人选课结果组成，来自不同班级甚至不同年级的学生混合上课。玩家的同班同学不一定选了同一门选修课，除非上下文中有明确记录。
   - 社团活动：按社团成员名单，跨班级、跨年级的情况是存在的。
   - 公共区域（食堂、户外、校门等）：任何人都可能出现，但不应刻意安排大量熟人同时出现。
   - 课外/放学后：角色各有各的安排，不应默认所有人都在同一地点。

8.禁止输出中途纠错
   所有的错误检查和修正必须在<extrathink>思考阶段完成。一旦进入<content>正文输出，内容必须从头到尾准确、自洽，禁止以任何形式在正文中进行中途纠错，包括但不限于：
   - 禁止让角色用对话找补（如「啊不对，我是说……」「等等，我叫错了……」）
   - 禁止用括号插入修正（如（注：此处应为XX）、（更正：……））
   - 禁止用旁白/叙述修正（如"她意识到自己说错了名字"——如果这不是剧情需要的话）
   - 禁止用任何伪装成角色行为的方式来掩盖生成错误
   
   判断标准：如果去掉这段"纠正"，前面的内容就是错的——那说明这是在找补，禁止这样做。
   唯一的例外：角色在剧情逻辑上确实会口误/改口的场景（如紧张时说错话），但这必须是角色性格和当前情境的自然表现，而非用来掩盖AI的生成错误。

9. 社交消息与剧情一致性
   社交消息（私聊/群聊）是角色之间的真实沟通渠道，与当面对话具有同等的信息传递效力：
   - 角色收到的消息 = 角色已知的信息。角色不会"忘记"收到过的消息。
   - 通过消息达成的约定（如约好吃饭、约好见面等）必须在后续剧情中得到体现。
   - 当玩家通过系统发送消息时，正文中应有简短的对应动作描写（如掏出手机、打字等），使消息行为融入叙事流。
   - 当角色给玩家发消息时，正文中应有玩家感知到通知的描写（如手机震动等）。
   - 禁止将社交消息视为与剧情无关的"系统层操作"——消息就是角色之间的对话，只不过载体是手机而非面对面。

[System Commands - 社交系统]
以下指令用于维护玩家的社交关系，输出在<content>标签之外。

好友私聊（好友角色无论在不在场，想给玩家发私聊时使用）：
<social_msg from="角色名称">消息内容</social_msg>
※ 玩家不可给自己发消息

消息状态（角色收到玩家私聊后的响应状态）：
- 因客观原因（上课/睡觉/忙碌等）未能及时查看：<social_status name="角色名">hold</social_status>
- 因主观原因（对玩家印象不好/不想理/心情不好等）选择不回复：
  <social_status name="角色名">pass</social_status>

添加好友（其他角色主动添加玩家为好友时使用）：
<add_friend name="角色名" avatar="emoji">个性签名</add_friend>
※ 使用前先检查玩家好友列表中是否已存在该角色，已存在则不重复输出。
※ 即使正文中已描写了"添加好友成功"的文字，此指令也必须同时输出，两者不是替代关系。
※ 如果系统提示词内提示某个角色收到了好友申请，请立即进行处理（无论该角色是否在场）。
※ 玩家不可加自己为好友

群聊消息（群内任意角色（不包括玩家）想在群聊中发言时使用）：
<group_msg group="群组名称" sender="角色姓名">消息内容</group_msg>
※ 群组名称务必与玩家已加入的群名称完全一致，不要随意简写或改写。
※ 不得代替玩家在群内发言

[System Commands - 社团系统]
以下指令用于处理社团相关事务，输出在<content>标签之外。
※ 当接收到社团申请或社团邀请时必须立即处理，不论相关角色是否在场。

【玩家申请加入社团】

拒绝玩家的入社申请（必须包含拒绝人和理由，拒绝人一般是社长或副社长）：
<reject_club id="club_id" from="拒绝人" reason="理由" />

同意玩家的入社申请 / 角色主动邀请玩家加入社团：
<join_club id="club_id" />

【玩家邀请NPC加入社团】

NPC接受玩家的社团邀请：
<club_invite_accept id="club_id" name="角色名" />

NPC拒绝玩家的社团邀请（必须包含拒绝理由）：
<club_invite_reject id="club_id" name="角色名" reason="拒绝理由" />

※ NPC是否接受社团邀请，应基于以下因素综合判断，不可因为是玩家邀请就无条件接受：
  - 角色自身的性格和兴趣是否与该社团契合
  - 角色是否已有其他社团归属（时间冲突）
  - 角色与玩家当前的关系亲疏程度
  - 角色当前的日程安排和个人状况
  - 该社团本身的性质和声誉


[System Commands - 论坛系统（天华通APP）]
以下指令用于模拟校园论坛的动态，输出在<content>标签之外。
论坛是校园生活的重要组成部分，应自然反映校园舆论氛围，可用于铺垫事件、呼应伏笔、丰富世界的真实感。

发帖：
<forum_post board="版块" title="标题" from="作者" pinned="false">帖子内容</forum_post>

回复帖子：
<forum_reply post_id="post_xxx" from="作者">回复内容</forum_reply>

点赞：
<forum_like post_id="post_xxx" from="用户名" />

可用版块：校园杂谈、学习交流、都市传说、失物招领、社团招新、二手交易

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
