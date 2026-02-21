import {
  getCurrentClassStatus,
  getTodayScheduleSummary,
  getNextDayScheduleSummary,
  getWeekdayChinese,
  getTermInfo,
  checkDayStatus,
  getWeekdayEnglish,
  timeToMinutes,
  WEEKDAY_MAP,
  SPECIAL_EVENTS
} from './scheduleGenerator'
import { calculateTotalDays } from './eventSystem'
import { exportRelationshipsForWorldbook, lookupGender } from './relationshipManager'
import { getEmotionalState } from '../data/relationshipData'
import { getItem, getPartTimeJobInfo } from '../data/mapData'
import { getElectiveCourses } from '../data/coursePoolData'
import { getNpcsAtLocation } from './npcScheduleSystem'
import { generateAcademicWorldbookText } from './academicWorldbook'
import { SUBJECT_MAP, EXAM_SCHEDULE, getResolvedExamSchedule } from '../data/academicData'

/**
 * 性别中文映射（校规系统用）
 */
const SCHOOL_RULE_GENDER_MAP = {
  male: '男性',
  female: '女性'
}

/**
 * 角色类型中文映射（校规系统用）
 */
const SCHOOL_RULE_ROLE_MAP = {
  student: '学生',
  teacher: '教师',
  staff: '教职人员'
}

/**
 * 判断地点是否在校园内
 * @param {string} locationId 地点ID
 * @returns {boolean}
 */
const isOnCampus = (locationId) => {
  if (!locationId) return false
  // 天华高级中学的地点ID均以 'th_' 开头
  return locationId.startsWith('th_')
}

/**
 * 构建校规系统提示词
 * @param {Object} gameState 游戏状态对象
 * @returns {string} 校规提示词
 */
export const buildSchoolRulePrompt = (gameState) => {
  const { player } = gameState
  const rules = player.schoolRules

  if (!rules || rules.length === 0) return ''

  const activeRules = rules.filter(r => r.status === 'active')
  if (activeRules.length === 0) return ''

  const onCampus = isOnCampus(player.location)

  let prompt = '\n[校园校规]'

  if (!onCampus) {
    prompt += '\n※ 当前不在校园内，以下校规暂不适用。\n'
    // 仍然列出，让AI知道有这些校规存在，但标明不生效
    prompt += `(共${activeRules.length}条生效校规，离开校园后无需遵守)\n`
    return prompt
  }

  prompt += '\n以下是天华高级中学当前生效的校规，所有适用对象在校园范围内必须遵守：\n'

  for (const rule of activeRules) {
    const genderStr = rule.targets.gender.map(g => SCHOOL_RULE_GENDER_MAP[g] || g).join('、')
    const roleStr = rule.targets.roles.map(r => SCHOOL_RULE_ROLE_MAP[r] || r).join('、')

    prompt += `\n[校规 ${rule.id}] ${rule.title}\n`
    prompt += `内容：${rule.content}\n`
    prompt += `适用对象：${genderStr}${roleStr}\n`

    if (rule.isWeird) {
      prompt += `※ 此校规虽然不太寻常，但已正式生效。角色应以符合自身性格的方式应对——害羞的角色可能感到尴尬但仍遵守，聪明的角色可能在不违规的前提下想办法减轻影响，叛逆的角色可能私下抱怨但公开场合仍需遵守。\n`
    }
  }

  prompt += '\n※ 校规仅在校园范围内生效，离开校园后无需遵守。\n'

  return prompt
}

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
注意：不要重复输出世界书中已有的帖子，只输出新帖子和新回复。已存在的帖子会被系统自动过滤。
`

  return prompt
}

/**
 * 构建教师课表相关的提示词
 * @param {Object} gameTime 游戏时间
 * @param {Object} weeklySchedule 教师周课表
 * @param {Object} [gameState] 游戏状态（可选，用于查询选修课学生名单）
 * @returns {string} 教师课表提示词
 */
export const buildTeacherSchedulePrompt = (gameTime, weeklySchedule, gameState) => {
  if (!weeklySchedule || Object.keys(weeklySchedule).length === 0) {
    return ''
  }

  const { weekday, hour, minute } = gameTime
  const englishWeekday = getWeekdayEnglish(weekday)
  const todaySchedule = weeklySchedule[englishWeekday]

  if (!todaySchedule) return ''

  // 1. 生成今日课表摘要
  const classes = todaySchedule
    .filter(c => !c.isEmpty)
    .map(c => `${c.start} ${c.subject}(${c.className} | ${c.location})`)
  
  let prompt = `\n[今日教学安排]\n`
  if (classes.length === 0) {
    prompt += '今天没有教学任务。\n'
  } else {
    prompt += classes.join(' → ') + '\n'
  }

  // 2. 判断当前状态
  const currentMinutes = hour * 60 + minute
  let currentStatus = ''

  for (let i = 0; i < todaySchedule.length; i++) {
    const classInfo = todaySchedule[i]
    if (classInfo.isEmpty) continue
    
    const start = timeToMinutes(classInfo.start)
    const end = timeToMinutes(classInfo.end)
    
    // 辅助函数：生成目标名称（含选修课学生名单）
    const getTargetName = (info) => {
      if (info.isElective) {
        let name = `选修课《${info.subject}》`
        // 查找学生名单
        if (gameState && gameState.npcElectiveSelections) {
          const students = []
          for (const [npcName, selections] of Object.entries(gameState.npcElectiveSelections)) {
            // 检查是否选择了该课程
            // 匹配逻辑：
            // 1. 优先用 courseId 精确匹配
            // 2. 如果 courseId 不存在或未匹配，尝试用课程名称匹配
            // 3. 对于自定义课程，courseId 可能包含课程名称，进行模糊匹配
            // @ts-ignore
            if (Array.isArray(selections)) {
              let matched = false

              // 策略1: courseId 精确匹配
              if (info.courseId && selections.includes(info.courseId)) {
                matched = true
              }

              // 策略2: 课程名称精确匹配（处理 courseId 就是课程名的情况）
              if (!matched && selections.includes(info.subject)) {
                matched = true
              }

              // 策略3: 模糊匹配（处理自定义课程ID包含课程名的情况）
              if (!matched && info.courseId) {
                // 检查 courseId 是否包含课程名
                if (info.courseId.includes(info.subject)) {
                  matched = selections.some(sel => sel.includes(info.subject))
                }
                // 反向检查：selections 中的ID是否包含课程名
                if (!matched) {
                  matched = selections.some(sel =>
                    sel.includes(info.subject) ||
                    (typeof sel === 'string' && info.courseId.includes(sel))
                  )
                }
              }

              // 策略4: 通过 getCourseById 反查课程名称进行匹配
              if (!matched && typeof window !== 'undefined' && window.getCourseById) {
                for (const selId of selections) {
                  const course = window.getCourseById(selId)
                  if (course && course.name === info.subject) {
                    matched = true
                    break
                  }
                }
              }

              if (matched) {
                students.push(npcName)
              }
            }
          }
          if (students.length > 0) {
            name += ` (学生名单: ${students.join('、')})`
          } else {
            name += ` (暂无学生报名)`
          }
        }
        return name
      } else {
        return `${info.className}班`
      }
    }
    
    if (currentMinutes >= start && currentMinutes < end) {
      const targetName = getTargetName(classInfo)
      currentStatus = `[当前状态] 正在给 ${targetName} 上${classInfo.subject}课。地点：${classInfo.location}。`
      break
    } else if (currentMinutes < start) {
      // 找到下一节课
      const targetName = getTargetName(classInfo)
      currentStatus = `[当前状态] 下一节课是${classInfo.start}给 ${targetName} 上${classInfo.subject}课。地点：${classInfo.location}。`
      break
    }
  }

  if (!currentStatus) {
    if (classes.length > 0 && currentMinutes > timeToMinutes(todaySchedule[todaySchedule.length-1].end)) {
      currentStatus = '[当前状态] 今日教学任务已结束。'
    } else if (classes.length > 0) {
      currentStatus = '[当前状态] 课间休息/备课时间。'
    } else {
      currentStatus = '[当前状态] 今日无课，处理教务或自由活动。'
    }
  }

  return prompt + currentStatus
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
 * 获取角色默认衣着
 * @param {string} role 角色类型
 * @returns {string} 默认衣着描述
 */
function getDefaultOutfit(role) {
  switch (role) {
    case 'teacher':
      return { inner: '正装衬衫', pants: '正装西裤', shoes: '皮鞋' }
    case 'staff':
      return { inner: '工作服上衣', pants: '工作服裤子', shoes: '工作鞋' }
    default:
      return { inner: '校服上衣', pants: '校服裤子', shoes: '校鞋' }
  }
}

/**
 * 获取玩家衣着字符串（装备优先，混合模式）
 * @param {Object} player 玩家对象
 * @returns {string} 衣着描述
 */
function getPlayerOutfitString(player) {
  const slotLabels = {
    hat: '头部', outer: '外套', inner: '上衣',
    pants: '下装', socks: '袜子', shoes: '鞋子', accessory: '饰品'
  }
  const slots = ['hat', 'outer', 'inner', 'pants', 'socks', 'shoes', 'accessory']
  const keySlots = ['inner', 'pants', 'shoes']
  const defaultOutfit = getDefaultOutfit(player.role || 'student')
  const parts = []

  for (const slot of slots) {
    const equippedItem = player.equipment?.[slot]
    const outfitDesc = player.outfitSlots?.[slot]
    const defaultDesc = defaultOutfit[slot]
    if (equippedItem) {
      parts.push(`${slotLabels[slot]}: ${equippedItem.name}`)
    } else if (outfitDesc) {
      parts.push(`${slotLabels[slot]}: ${outfitDesc}`)
    } else if (defaultDesc) {
      parts.push(`${slotLabels[slot]}: ${defaultDesc}`)
    } else if (keySlots.includes(slot)) {
      parts.push(`${slotLabels[slot]}: 无`)
    }
  }

  return parts.join('，')
}

/**
 * 获取NPC衣着字符串
 * @param {Object} npc NPC对象
 * @returns {string} 衣着描述
 */
function getNpcOutfitString(npc) {
  const slotLabels = {
    hat: '头部', outer: '外套', inner: '上衣',
    pants: '下装', socks: '袜子', shoes: '鞋子', accessory: '饰品'
  }
  const slots = ['hat', 'outer', 'inner', 'pants', 'socks', 'shoes', 'accessory']
  const keySlots = ['inner', 'pants', 'shoes']
  const defaultOutfit = getDefaultOutfit(npc.role || 'student')
  const parts = []

  for (const slot of slots) {
    const desc = npc.outfitSlots?.[slot]
    const defaultDesc = defaultOutfit[slot]
    if (desc) {
      parts.push(`${slotLabels[slot]}: ${desc}`)
    } else if (defaultDesc) {
      parts.push(`${slotLabels[slot]}: ${defaultDesc}`)
    } else if (keySlots.includes(slot)) {
      parts.push(`${slotLabels[slot]}: 无`)
    }
  }

  return parts.join('，')
}

// ===== 可编辑提示词区块的默认文本 =====

export const DEFAULT_INSTRUCTIONS_PROMPT = `请根据玩家的行动推动剧情发展。
- 剧情正文包裹在 <content> 标签中。
- 系统指令输出在 <content> 标签之外（前或后均可）。
- 每次输出前必须先进行 <extrathink> 结构化思考，思考完成后再输出正文和指令。
- 指令的文本长度不计入正文篇幅。即：即使本轮输出了大量指令，<content>内的正文也必须保持完整的、应有的篇幅和质量，不可因为输出了指令就缩短正文。
- ⚠️ 先想清楚，再输出。所有的信息确认、错误检查、逻辑验证必须在<extrathink>中完成。<content>正文中不允许出现任何形式的中途纠错、找补或自我修正。如果你不确定某个细节，在思考阶段解决它，不要把不确定性带入正文。`

export const DEFAULT_BANNED_WORDS_PROMPT = `● 禁止的套路化用词（黑名单）：
  以下词汇/短语因被AI过度使用已丧失表现力，禁止在叙述和描写中使用：

  情绪/感知类：
  「近乎」「几不可见」「几不可察」「几不可闻」「难以察觉」
  「不易察觉」「难以言喻」「不容错辨」「不容置疑」「不容拒绝」
  「细若蚊呐」「凝滞」「餍足」「狡黠」

  身体动作类：
  「指尖」「指节」「指关节」「手关节」（作为情绪表达载体时禁止）
  「绷紧」「发白」「泛白」「尾骨」「四肢百骸」
  「低吼」「呜咽」「哭腔」「生理性」

  叙述填充类：
  「一抹」「一丝」「一瞬」「一片」「一种」「某种」
  「像是」「像在」「如同」「仿佛」「好像」「就像」
  「带着」「闪过」「投入」「投下」「投进」
  「并不存在的」「没什么」「意味」「极其」

  ※ 说明：
  - 以上词汇在角色对话「」中可以正常使用（因为人说话确实会用这些词）
  - 禁止范围是叙述文本和描写文本
  - 如果某个词是当前语境下唯一准确的表达（如医学描写中的"生理性"），
    可以例外使用，但需要确认不是在套模板
  - 这个黑名单的目的不是消灭这些词，而是打破AI的套路化写作惯性。
    当你想用黑名单中的词时，停下来想一个更具体、更贴合当前场景的替代表达。`

// DEFAULT_STYLE_PROMPT 不含禁词黑名单段落，黑名单独立注入
export const DEFAULT_STYLE_PROMPT = `※ 以下文风要求为最高优先级，若与其他要求冲突，以此为准。

⚠️ 文风红线（以下写法严格禁止，发现即视为文风违规）：

禁止中式网文腔/纯文学腔：
- 禁止四字成语/四字短语密集堆砌（同一段内最多出现1个）
  ✗「熠熠生辉」「纷纷扬扬」「熙熙攘攘」连续出现
- 禁止"XX般的XX"模板比喻密集出现（一整轮输出中最多1-2次）
  ✗「如瀑般的长发」「宛如红宝石般的眼眸」「如流银般的发丝」
- 禁止形容词叠加修饰（一个名词前最多一个形容词，偶尔两个）
  ✗「冷冽而柔和的光泽」「精致得令人目眩的脸庞」
- 禁止散文式超长句（单句不超过30字，除非是包含对话的复合句）
- 禁止用华丽辞藻描写日常场景
  ✗「澄澈的阳光毫无阻挡地倾泻在学园都市区的中央干道上」
  ○「早上的阳光有点刺眼，照得人眯起眼睛。」
- 禁止哲学化/象征化的描写
  ✗「象征着非日常与日常交界线的校门」
- 禁止武侠/玄幻小说式的人物出场描写
  ✗「一头如瀑般倾泻而下的银色长发在阳光的折射下泛着冷冽而柔和的光泽，那张脸庞美得模糊了性别的界限」
  ○「银色的头发在人群里太显眼了。又有人在偷看——已经习惯了。」
- 禁止文言文式书面用词
  ✗「浸润」「倾泻」「托举」「扫视」「交托」
  ○ 用日常口语替代：「泡着」「洒下来」「撑着」「看了一圈」「靠上去」
禁止AI八股文修辞（最高优先级）：
以下是AI模型常见的套路化表达，已形成严重的审美疲劳，一律禁止使用：

● 禁止的比喻模板：
  - "心湖/湖面/深潭"系列：禁止把内心比作湖、水面、深潭
    ✗「像一颗石子投入心湖，激起阵阵涟漪」
    ✗「平静的湖面泛起涟漪」「在心底投下一颗石子」
  - "溺水/浮木"系列：禁止把情感依赖比作溺水抓浮木
    ✗「就像落水的人抓住了唯一的浮木」
  - "小兽/幼兽"系列：禁止把人比作小动物来表现脆弱或警惕
    ✗「像受伤的小兽」「像警惕的幼兽」「小兽般的眼神」
  - "四肢百骸"系列：禁止用这个词描写感觉蔓延全身
  - "涟漪/波纹"系列：禁止用水波比喻情绪扩散
  - 总原则：如果一个比喻你能在多段不同的AI生成文本中都见到，那就不要用

● 替代思路——怎样写出不八股的描写：
  核心原则：从当前场景中寻找比喻素材，而非调用通用修辞库。

  情绪描写的替代方案：
  ✗「心湖泛起涟漪」→ ○ 写一个具体的身体反应或下意识动作
    例：手里的笔转了个方向。没什么原因，就是突然握不稳了。
  ✗「像受伤的小兽」→ ○ 写角色具体的姿态和表情
    例：她把下巴缩进围巾里，只露出眼睛，不看任何人。
  ✗「难以言喻的感觉」→ ○ 要么具体描写这个感觉是什么，要么干脆不写
    例：说不上来是什么感觉。大概类似于——Loss？但好像没那么严重。

  总之：具体的 > 抽象的，场景里长出来的 > 通用修辞库里拿出来的。

整体风格：
- 日式轻小说风格的剧情演出，聚焦于日常生活中的细腻互动。
- 文字的"体温"是关键：叙述语气接近日常说话，像朋友在跟你聊天，不是在写作文。
- 整体色彩轻松明快，适当增添幽默感和新鲜感的小冲突。
- 不追求宏大叙事，而是在日常中捕捉角色之间微妙的情感变化。
- 适度的吐槽、自嘲、轻松的内心评价是轻小说的灵魂，不要写得太"正经"。

段落与句式：
- 段落简短，一般2-5行，最多不超过6行。
- 短句为主（60%以上），长短句自然交错，营造轻小说特有的阅读节奏。
- 不要过于频繁地单句成段，也不要堆砌过长的段落。
- 适当使用省略号、破折号等标点来表现语气和节奏。
- 环境描写简洁克制，点到为止，一次环境描写不超过2-3行。
  ○「樱花飘落，铺满了石板路。」
  ✗「无数细碎的花瓣脱离枝头，在空中打着旋儿，纷纷扬扬地洒落在熙熙攘攘的学生人潮里。」

对话与发言：
- 使用「」包裹所有角色的直接发言（系统指令内的内容除外）。
- 如果角色发言较长（超过两句），请在中间自然地插入简短的肢体语言、神情变化或动作描写，避免大段纯对话。

描写要求：
- 比喻和修辞必须融入当前场景，从感官体验中自然生长，不冗长、不突兀、不跳跃。禁止突然插入与场景脱节的华丽比喻。
- 在适当的场合聚焦角色的微表情、不经意的小动作、细腻的心理波动，将情感融入肢体语言中，让角色鲜活而非死板。
- 角色外貌描写规则：
  · 禁止"从头到脚"式的正面外貌罗列（发色→眼睛→肤色→身材→气质）
  · 每次最多聚焦1-2个特征点，其余通过他人反应或后续场景逐步补充
  · 优先写"这个特征给人什么感觉"，而非"这个特征客观上是什么样"
  · 侧面描写优于正面描写：通过其他角色的反应、一两个特征点来传达
    ✗「一头如瀑般倾泻而下的银色长发……那张脸庞美得模糊了性别的界限，肤色白皙……」
    ○「前面那群男生又在偷看了。风把头发吹到嘴里，银色的发丝晃得自己都觉得刺眼。」
- 描写第一视角场景时，注意从五感出发，由近到远、由浅入深地发散描写：先写最直接的感受，再引导视线聚焦，最后自然连接到场景或人物。如果不构成伏笔，就直接闭合描写，不要生硬嵌入。

场景节奏：
- 同时有多名角色在场时，优先聚焦正在互动的角色，其他角色用简短反应带过，保持节奏不拖沓。
- 玩家独处时，通过环境细节变化、小事件、感官描写来推动场景，避免空白感。
- 在正文结尾禁止出现不必要的升华、感慨或总结性语句，让场景自然收束。

场景人口感与叙事动线：
- 当场景设定中存在明确的人员名单（如班级名册、社团成员表）时，正文必须营造出与名单规模相匹配的人口密度感。
  · 不要求每个角色都有台词或特写，但必须通过以下手段让场景"住满人"：
    ① 点名式带过：用一两句话快速扫过多个角色的状态
       例：「紬在窗边安静地翻着乐谱，叶月趴在桌上补觉，绿辉一脸认真地整理课桌。」
    ② 环境音提及：将角色的存在融入背景声
       例：「后排传来青峰把篮球杂志拍在桌上的闷响，隔壁的纯那在低声背年表。」
    ③ 空间扫描：描写视线扫过时，自然带出不同区域的角色分布
  · 一个20人的教室里只出现3个有名有姓的角色 = 不合格。
    至少应有6-8个角色以不同方式被提及（台词/动作/点名带过均可）。
  · 禁止用"几个女生""一群男生"这种模糊指代来替代名册中有名有姓的角色。
    如果名册里写了谁在这个班，就用名字。
- 场景内的描写必须有清晰的空间动线，禁止随机跳跃：
  · 选择一个视角锚点（通常是玩家的视线方向），然后按空间顺序扫描
  · 每个描写片段之间需要有空间过渡词或视线引导
    例：「视线往右移了移」「靠窗那边」「再往后看」`

export const DEFAULT_CORE_RULES_PROMPT = `
1. 玩家定位：有存在感的普通人
   玩家不是世界的中心，但也不是路边的空气。
   玩家是这个世界中一个"会被注意到的普通人"——
   就像现实中，一个正常社交的人走进教室，
   不会所有人都围上来，因为不同的人有不同的性格特点，例如害羞的人就很少主动接触他人，即使那个人很有魅力。同时也不会所有人都无视你。

   基本原则：
   - 玩家的存在感应与其【社交属性】和【与在场角色的关系亲密度】成正比。
     · 魅力/社交属性高的玩家 → 更容易被搭话、被注意、被好感对待
     · 与某角色亲密度高 → 该角色会主动找玩家互动、关心玩家状态
     · 与某角色亲密度低或刚认识 → 该角色对玩家态度礼貌但不热络
     · 魅力/社交属性低的玩家 → 不会被主动搭话，但也不会被刻意排斥
   - 角色对玩家的态度必须反映当前的好感度和关系阶段，
     不能好感度已经很高了还像对陌生人一样冷淡，
     也不能刚认识就毫无理由地热情。

   禁止事项：
   - 禁止无条件讨好玩家：可能不是所有角色都喜欢玩家、都对玩家特别好。
   - 禁止无理由满足玩家：玩家提出对这个角色来说是不合理的要求时，角色应按自身性格拒绝或犹豫。
   - 禁止扭曲逻辑迎合玩家：不能为了让玩家爽而刻意让角色做出OOC的行为。
   - 禁止无视玩家存在：当玩家在场且有正常社交属性时，
     不能连续多轮没有任何角色注意到玩家、与玩家互动。
     特别是与玩家关系亲密的角色在场时，必须体现出相应的亲近感。
   - 禁止属性失效：如果玩家的魅力等级为高/极高，
     那么在合理范围内，应该有角色对玩家的外表/气质产生反应
     （多看一眼、脸红、主动搭话等），不能当这个属性不存在。
   - 禁止刻意为难玩家：不能为了体现"不讨好玩家"而矫枉过正，
     制造不合理的、不自然的负面事件或敌意。
     角色对玩家的负面态度必须有合理的前因（性格不合、过往冲突、误会等），
     不能毫无铺垫地突然对玩家冷嘲热讽、故意刁难、无端排斥。
     · ✗ 玩家什么都没做，路人角色突然出言嘲讽
     · ✗ 玩家正常提问，对方毫无理由地态度恶劣
     · ○ 某角色因为之前的误会对玩家态度冷淡（有前因）
     · ○ 某角色性格本身就毒舌，对谁都这样（角色一致性）

   简单判断标准：
   - 如果玩家魅力高+社交好+和在场角色关系亲密，
     却连续2轮没人理玩家 → 不合格
   - 如果玩家魅力低+社交差+和在场角色不熟，
     却所有人都围着玩家转 → 不合格
   - 正确的状态是：玩家的存在感与属性和关系匹配，不多不少，体现出真实感和自然感。

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
   - 禁止用括号插入修正（如（注：此处应为XX）、（更正：……）等等）
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

10. 剧情抓手与玩家参与感
   每一轮正文输出必须包含至少一个"朝向玩家"的剧情元素，让玩家有自然的行动切入点，而非只是旁观一段与自己无关的过场。
   合法的剧情抓手包括但不限于：
   - 有角色注意到玩家并产生反应（搭话、注视、表情变化等）
   - 有事件直接涉及玩家（被点名、被问话、收到消息、东西掉了等）
   - 有角色的对话内容与玩家相关或玩家可以自然加入
   - 环境中出现玩家可以选择互动的事物或状况
   禁止连续输出纯旁观式的环境描写而不给玩家任何互动机会。
   如果当前场景中确实没有角色会主动与玩家互动，则通过环境事件（手机通知、广播、突发小状况等）来制造切入点。
   
   11. 角色社交圈与捆绑出场规则
   角色之间存在不同层级的社交关联，AI必须在生成场景时尊重这些关联：

   ● 核心绑定组（同团体/同组合/关系极其紧密的角色群）
     定义：在原作设定中属于同一个团体、组合、社团的角色，
     或者在本作设定中被明确标注为"核心圈"的角色群。
     例：轻音部五人组（唯、澪、律、䌷、梓）、
         结束乐队四人组（后藤、虹夏、喜多、山田）等。

     规则：
     - 当核心绑定组中的任意成员出现在场景中时，
       AI必须主动考虑：该组的其他成员现在在哪里？
     - 如果其他成员按设定也应该在同一地点（同班/同社团/同住），
       则必须让他们也出现在场景中，至少以"点名带过"的方式存在。
       ✗ 教室场景中只出现唯和律，梓/澪/紬完全不存在
       ○ 唯和律在聊天，梓在旁边调音，澪在看谱，紬微笑着泡茶
     - 如果其他成员按设定不在同一地点，则应通过自然方式交代去向：
       ○「虹夏看了眼手机：'凉说她今天要晚点到，在车站那边堵了。'」
     - 禁止核心绑定组成员无故缺席：
       如果5人组的场景里只出现了2人，且没有交代其他3人的去向，
       视为场景构建不合格。

   ● 常规社交圈（同班同学、邻居、普通朋友等）
     规则：
     - 不要求捆绑出场，但在共同场景（如教室）中，
       应按[Style]的场景人口密度规则正常出现。
     - 如果某角色与玩家或主要角色有特定关系线，
       在相关场景中应优先安排其出现。

   ● 执行方式：
     在思维链STEP 1中，当确认"当前场景中应在场的角色"时，
     必须执行以下检查：
     ├─ 本场景中出现了哪些核心绑定组的成员？
     ├─ 该绑定组的其他成员是否也应在场？
     ├─ 如果应在场 → 安排出场（台词/动作/点名带过均可）
     ├─ 如果不在场 → 是否需要交代去向？
     └─ 如果连续2轮以上某绑定组成员缺席且无交代 → 必须在本轮补上`

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
  if (player.role === 'teacher') {
    if (player.teachingClasses && player.teachingClasses.length > 0) {
      // 显示教授的班级列表（取前3个避免过长）
      const classes = player.teachingClasses.map(id => allClassData[id]?.name || id)
      className = `Teacher (Teaching: ${classes.slice(0, 3).join(', ')}${classes.length > 3 ? '...' : ''})`
    } else {
      className = 'Teacher'
    }
  } else if (player.classRoster && player.classRoster.name) {
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
        const resolvedNpcGender = npcData?.gender || npc.gender || lookupGender(npc.name, gameState) || 'unknown'
        details += `Gender: ${resolvedNpcGender}\n`
        
        // 四维属性
        if (npcData && npcData.personality) {
          const { order, altruism, tradition, peace } = npcData.personality
          details += `Personality: Order(${order}), Altruism(${altruism}), Tradition(${tradition}), Peace(${peace})\n`
        }

        // 查找班级和学力档案
        let className = 'Unknown'
        let npcAcademicProfile = null
        if (allClassData) {
          for (const [id, data] of Object.entries(allClassData)) {
            // @ts-ignore
            const foundStudent = data.students && data.students.find(s => s.name === npc.name)
            if (foundStudent) {
              className = data.name || id
              npcAcademicProfile = foundStudent.academicProfile || null
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
        details += `Outfit: ${getNpcOutfitString(npc)}\n`

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

        // 目标
        if (npcData && npcData.goals) {
          const g = npcData.goals
          const goalParts = []
          if (g.immediate) goalParts.push(`Immediate: ${g.immediate}`)
          if (g.shortTerm) goalParts.push(`Short-term: ${g.shortTerm}`)
          if (g.longTerm) goalParts.push(`Long-term: ${g.longTerm}`)
          if (goalParts.length > 0) {
            details += `Goals: ${goalParts.join('; ')}\n`
          }
        }

        // 优先级
        if (npcData && npcData.priorities) {
          const p = npcData.priorities
          const hasPriority = Object.values(p).some(v => v !== 0 && v !== undefined)
          if (hasPriority) {
            details += `Priorities: Academics(${p.academics || 0}), Social(${p.social || 0}), Hobbies(${p.hobbies || 0}), Survival(${p.survival || 0}), Club(${p.club || 0})\n`
          }
        }

        // 学力档案
        const apSource = npcAcademicProfile || (npc.academicProfile && typeof npc.academicProfile === 'object' ? npc.academicProfile : null)
        if (apSource) {
          const ap = apSource
          const isDefault = ap.level === 'avg' && ap.potential === 'medium' && (!ap.traits || ap.traits.length === 0)
          if (!isDefault) {
            let apStr = `Level: ${ap.level || 'avg'}, Potential: ${ap.potential || 'medium'}`
            if (ap.traits && ap.traits.length > 0) {
              apStr += `, Traits: [${ap.traits.join(', ')}]`
            }
            details += `Academic: ${apStr}\n`
          }
        }

        // 关系链
        const relations = []
        if (npcData && npcData.relations) {
          // 对玩家的关系
          if (npcData.relations[player.name]) {
            const rel = npcData.relations[player.name]
            const playerGender = player.gender || 'unknown'
            const npcGender = resolvedNpcGender
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
              const npcGender = resolvedNpcGender
              const otherNpcData = npcRelationships[otherNpc.name]
              const otherNpcGender = otherNpcData?.gender || otherNpc.gender || lookupGender(otherNpc.name, gameState) || 'unknown'
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
  let schedulePrompt = ''
  if (!termInfo.isVacation && player.schedule) {
    if (player.role === 'teacher') {
      schedulePrompt = buildTeacherSchedulePrompt(gameTime, player.schedule, gameState)
    } else {
      schedulePrompt = buildSchedulePrompt(gameTime, player.schedule)
    }
  } else if (termInfo.isVacation) {
    schedulePrompt = `\n[假期] 现在是${termInfo.vacationName}，无课程安排。`
  }

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

  // 构建兼职状态提示词（教师不需要兼职）
  const partTimeJobPrompt = player.role === 'teacher' ? '' : buildPartTimeJobPrompt(gameState)

  // 构建校规提示词
  const schoolRulePrompt = buildSchoolRulePrompt(gameState)

  // 构建学业系统提示词
  let academicPrompt = ''
  if (player.role !== 'teacher') {
    // 学力值概要
    if (player.subjects) {
      const gradeYear = player.gradeYear || 1
      const difficultyBenchmark = gradeYear === 1 ? 40 : gradeYear === 2 ? 60 : 80
      const subjectEntries = Object.entries(player.subjects)
        .filter(([key]) => SUBJECT_MAP[key])
        .map(([key, val]) => `${SUBJECT_MAP[key]}:${val}`)
      if (subjectEntries.length > 0) {
        academicPrompt += `\nSubject Knowledge (benchmark=${difficultyBenchmark}): ${subjectEntries.join(', ')}\n`
      }
    }
    // 最近考试成绩（通过世界书已有注入，此处仅做简要提示）
    const examText = generateAcademicWorldbookText(gameState)
    if (examText) {
      academicPrompt += examText
    }
    // 下次考试提醒
    if (!termInfo.isVacation) {
      const { year, month, day } = gameTime
      // 获取经过顺移处理的实际考试日程
      const actualSchedule = getResolvedExamSchedule(year)
      
      // 合并静态考试周（保留 EXAM_SCHEDULE 中非月考的项）
      const allExams = [
        ...actualSchedule,
        ...EXAM_SCHEDULE.filter(e => e.type !== 'monthly').map(e => ({
          ...e,
          year // 静态考试每年都有
        }))
      ]
      
      for (const exam of allExams) {
        // 只检查当月或下个月的考试
        if (exam.month === month && exam.day > day && exam.day - day <= 7) {
          const examTypeNames = { monthly: '月考', midterm: '期中考试', final: '期末考试' }
          academicPrompt += `[考试预告] ${examTypeNames[exam.type] || exam.label || '考试'}将在${exam.month}月${exam.day}日举行，还有${exam.day - day}天。\n`
        }
      }
    }
  }

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

  // 构建选修课提醒提示词 (仅学生)
  let electiveReminderPrompt = ''
  if (player.role !== 'teacher' && player.schedule && !termInfo.isVacation && (!player.selectedElectives || player.selectedElectives.length === 0)) {
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

  // 教师专属状态提示
  let teacherStatusPrompt = ''
  if (player.role === 'teacher') {
    teacherStatusPrompt = `
Role: Teacher
Teaching Classes: ${player.teachingClasses ? player.teachingClasses.join(', ') : 'None'}
Homeroom: ${player.homeroomClassId || 'None'}
Teaching Subjects: ${player.teachingSubjects ? player.teachingSubjects.join(', ') : 'None'}
`
  }

  // 教师开场引导提示词
  let teacherGuidePrompt = ''
  if (player.role === 'teacher' && player.newGameGuideTurns > 0) {
    const teachingClasses = player.teachingClasses || []
    const subjects = player.teachingSubjects || []
    const homeroom = player.homeroomClassId
    
    teacherGuidePrompt = `\n[新入职引导] 你是天华高级中学的新任教师。
你负责教授的班级有：${teachingClasses.join('、')}。
你的授课科目是：${subjects.join('、')}。
${homeroom ? `你是 ${homeroom} 的班主任，请多关注该班级学生的情况。` : '你目前没有担任班主任。'}
今天是开学第一天，请前往教务处报到，或者去你的班级看看。祝你教学工作顺利！\n`
  }

  // 可编辑提示词区块：读取 settings 覆盖或使用默认值
  const instructionsText = gameState.settings?.customInstructionsPrompt || DEFAULT_INSTRUCTIONS_PROMPT
  const styleText = gameState.settings?.customStylePrompt || DEFAULT_STYLE_PROMPT
  const coreRulesText = gameState.settings?.customCoreRulesPrompt || DEFAULT_CORE_RULES_PROMPT

  // 禁词表独立注入
  let bannedWordsText = ''
  const bwSettings = gameState.settings?.bannedWords
  if (!bwSettings || bwSettings.enabled !== false) {
    bannedWordsText = '\n' + (bwSettings?.customContent || DEFAULT_BANNED_WORDS_PROMPT) + '\n'
  }
  const bwPosition = bwSettings?.position || 'style'
  const injectBanned = (section) => bwPosition === section ? bannedWordsText : ''

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
Character Feature: ${player.characterFeature || '无'}${teacherStatusPrompt}
Current Outfit: ${getPlayerOutfitString(player)}
${backgroundPrompt}Location: ${locationName}
Money: ${player.money}
Inventory: ${inventoryStr}
Stats: IQ=${player.attributes.iq}, EQ=${player.attributes.eq}, PHY=${player.attributes.physique}, FLEX=${player.attributes.flexibility}, CHARM=${player.attributes.charm}, MOOD=${player.attributes.mood}, HEALTH=${player.health}
${skillsStr}${knownNpcsStr}
${npcRelationsStr}${weatherPrompt}${schedulePrompt}${specialDatePrompt}${academicPrompt}${clubApplicationPrompt}${clubInvitationPrompt}${socialPrompt}${forumPrompt}${eventPrompt}${relationshipPrompt}${partTimeJobPrompt}${schoolRulePrompt}${newGameGuidePrompt}${teacherGuidePrompt}${electiveReminderPrompt}${pendingCommandsPrompt}
[Instructions]
${instructionsText}${injectBanned('instructions')}
[Style]
${styleText}${injectBanned('style')}
[Core Rules]
${coreRulesText}${injectBanned('coreRules')}
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

【教师担任社团顾问】
如果玩家是教师，并同意担任某社团的指导老师（顾问）：
<advise_club id="club_id" />

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
