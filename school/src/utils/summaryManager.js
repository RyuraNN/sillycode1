import { useGameStore } from '../stores/gameStore'
import { callAssistantAI } from './assistantAI'
import { extractKeywordsFromSummary, embedSummary, buildRAGHistory, isRAGReady } from './ragService'

/**
 * 总结系统管理器
 * 负责生成、存储和管理大小总结
 */

// 总结生成提示词模板
// 纯总结模式的 System Prompt (用于大/超级总结)
const SUMMARY_AI_SYSTEM_PROMPT = `你是一个专业的剧情总结助手。你的任务是阅读给定的剧情片段或多个小总结，并将其整合成一个连贯、精简的大总结。
请务必将总结内容严格包裹在用户要求的 XML 标签中（例如 <major_summary> 或 <super_summary>）。
绝对不要输出任何标签之外的内容（如前言、解释、思考过程等）。专注于剧情脉络、关键转折和角色关系变化。`

const MINOR_SUMMARY_PROMPT = `[任务：生成本轮剧情小总结]
请阅读以下正文内容，生成一个详细的剧情总结。

总结要求：
1. 保留关键剧情发展、角色行动、对话要点
2. 保留重要的情感变化和关系进展
3. 字数控制在100-200字
4. 直接输出总结内容，不要添加任何前言或解释
5. 遵循以下格式：
    日期|年月日时分
    标题|给这次总结的内容起一个20字左右的标题
    地点|当前位置
    人物|当前场景内的角色
    描述|这次正文的摘要总结
    人物关系|这次正文中人物关系的变化
    重要信息|这次正文中的重要信息
    角色意图|场景中各角色接下来想要做的事情或目标
    互动内容|与玩家的关键互动（请求、邀约、约定、承诺等）
    待办事项|尚未完成的约定或任务（如有，没有则写"无"）

正文内容：
{content}

请用以下格式输出（必须严格遵循格式）：
<minor_summary>总结内容</minor_summary>`

const MAJOR_SUMMARY_PROMPT = `[任务：合并小总结]
请将以下多个小总结合并为一个精简版本。

要求：
1. 保留核心剧情脉络
2. 合并重复信息
3. 删除次要细节
4. 字数控制在300字以内
5. 直接输出总结内容，不要添加任何前言或解释
6. 保持格式不变。

待合并的小总结：
{summaries}

请用以下格式输出（必须严格遵循格式）：
<major_summary>你的合并总结</major_summary>`


const DIARY_PROMPT = `[任务：生成每日日记]
请将以下某一天内的所有剧情小总结，整理成一篇结构化的每日日记。

要求：
1. 按事件组织内容（而非按楼层顺序），将属于同一事件的内容合并为一段
2. 每个事件块包含：时间段、地点、涉及人物、事件经过、关系变化（如有）、角色意图、互动与约定
3. 事件按时间顺序排列
4. 记录所有关键剧情转折、情感变化、重要对话要点，不要遗漏
5. 合并重复信息，删除无意义的过渡描述
6. 直接输出日记内容，不要添加任何前言或解释

日期：{date}

该日的剧情小总结（按时间顺序）：
{summaries}

请用以下格式输出（必须严格遵循格式）：
<diary>
{date}

## [事件标题1]
时间：[具体时间段]
地点：[地点]
人物：[涉及角色]
经过：[事件描述]
关系变化：[如有变化则记录]
角色意图：[各角色接下来的计划或目标]
互动与约定：[与玩家的关键互动、约定、承诺]

## [事件标题2]
...

## 当日要点
- [当天最重要的信息/转折/关系变化]

## 未完成事项
- [跨日的约定、待办、承诺等（如有，没有则写"无"）]
</diary>`

/**
 * 清理内容中的图片相关标签（用于发送给AI处理）
 * @param {string} content 内容
 * @returns {string} 清理后的内容
 */
export function cleanImageTags(content) {
  if (!content) return ''
  return content
    // 图片引用标签
    .replace(/<image-ref\s+[^>]*\/?>/gi, '')
    // 图片加载占位符
    .replace(/<div[^>]*class="[^"]*image-loading-placeholder[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    // 图片错误提示
    .replace(/<div[^>]*class="[^"]*image-error[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
}

// 已知的指令标签列表（这些标签不应该以孤立闭合标签形式出现在正文中）
const INSTRUCTION_TAGS = [
  'social_msg', 'group_msg', 'add_friend', 'social_status',
  'moment_post', 'moment_action', 'moment_comment', 'moment_like',
  'forum_post', 'forum_reply', 'forum_like',
  'join_club', 'leave_club', 'reject_club', 'advise_club',
  'club_invite_accept', 'club_invite_reject', 'join_group',
  'add_calendar_event', 'event_involved',
  'add_item', 'remove_item', 'use_item',
  'update_impression', 'image', 'generate_image',
  'minor_summary', 'major_summary', 'super_summary', 'diary',
  'content'
]

/**
 * 移除没有对应开标签的孤立闭合标签
 * 思维块内未闭合的指令标签被移除后，其闭合标签可能残留在正文中
 * @param {string} text
 * @returns {string}
 */
function removeOrphanedClosingTags(text) {
  for (const tag of INSTRUCTION_TAGS) {
    const closeRegex = new RegExp(`<\\/${tag}>`, 'gi')
    const openRegex = new RegExp(`<${tag}[\\s>]`, 'gi')

    const opens = [...text.matchAll(openRegex)]
    const closes = [...text.matchAll(closeRegex)]

    if (closes.length > opens.length) {
      let excess = closes.length - opens.length
      text = text.replace(closeRegex, (match) => {
        if (excess > 0) {
          excess--
          return ''
        }
        return match
      })
    }
  }
  return text
}

// 已知的思维链标签变体
const THINKING_TAGS = [
  'think', 'thinking', 'thought', 'extrathink', 'think_nya~',
  'reasoning', 'reflect', 'reflection',
  'inner_thought', 'internal_thought',
  'scratchpad', 'chain_of_thought'
]

/**
 * 移除AI响应中的思维链内容
 * 处理闭合标签、未闭合标签和孤立闭合标签三种情况
 * @param {string} content AI响应内容
 * @returns {string} 清理后的内容
 */
export function removeThinking(content) {
  if (!content) return ''

  let cleaned = content

  // 第一轮：移除正常闭合的思维标签
  for (const tag of THINKING_TAGS) {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`<${escapedTag}>[\\s\\S]*?<\\/${escapedTag}>`, 'gi')
    cleaned = cleaned.replace(regex, '')
  }

  // 第二轮：移除未闭合的思维标签（从开标签到字符串末尾）
  for (const tag of THINKING_TAGS) {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`<${escapedTag}>[\\s\\S]*$`, 'gi')
    cleaned = cleaned.replace(regex, '')
  }

  // 第三轮（新增）：移除孤立的闭合思维标签及其之前的内容
  // 场景：后端只输出 </think> 而没有 <think>，此时 </think> 之前的所有内容都是思维链
  for (const tag of THINKING_TAGS) {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`^[\\s\\S]*?<\\/${escapedTag}>`, 'gi')
    cleaned = cleaned.replace(regex, '')
  }

  // 第四轮：清理孤立的闭合标签（思维块内未闭合指令标签的残留）
  cleaned = removeOrphanedClosingTags(cleaned)

  return cleaned.trim()
}

/**
 * 从AI响应中提取总结内容
 * @param {string} response AI响应
 * @param {string} type 总结类型 'minor' | 'major' | 'super'
 * @returns {string|null} 提取的总结内容
 */
export function extractSummary(response, type) {
  if (!response) return null
  
  // 先清理思维链，防止思维链中的标签干扰
  const cleanResponse = removeThinking(response)

  const tagMap = {
    minor: 'minor_summary',
    major: 'major_summary',
    super: 'super_summary',
    diary: 'diary'
  }
  const tag = tagMap[type]
  if (!tag) return null

  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const match = regex.exec(cleanResponse)
  return match ? match[1].trim() : null
}

/**
 * 生成小总结
 * @param {string} content 正文内容
 * @param {number} floor 楼层号
 * @param {boolean} useAssistant 是否使用辅助AI
 * @param {string} [preGeneratedSummary] 预生成的总结内容
 * @returns {Promise<{success: boolean, summary?: object, error?: string}>}
 */
export async function generateMinorSummary(content, floor, useAssistant = true, preGeneratedSummary = null) {
  const gameStore = useGameStore()
  
  if (!gameStore.settings.summarySystem?.enabled) {
    return { success: false, error: 'Summary system is disabled' }
  }

  // 1. 如果有预生成的小总结，直接使用
  if (preGeneratedSummary) {
    const { year, month, day } = gameStore.gameTime
    const gameDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const summary = {
      floor,
      type: 'minor',
      content: preGeneratedSummary,
      coveredFloors: [floor],
      timestamp: Date.now(),
      gameDate
    }
    addSummary(summary)
    console.log(`[SummaryManager] Using pre-generated minor summary for floor ${floor}`)
    return { success: true, summary }
  }

  // 如果没有预生成总结，且辅助AI未开启，则不再单独调用主AI（根据新需求）
  if (!useAssistant && !gameStore.settings.summarySystem.useAssistantForSummary) {
     console.warn('[SummaryManager] Minor summary missed by main AI and assistant AI is disabled. Skipping.')
     return { success: false, error: 'Minor summary missed' }
  }

  // 如果没有预生成总结，但开启了辅助AI（可能是解析失败或其他原因），尝试补救
  const prompt = MINOR_SUMMARY_PROMPT.replace('{content}', content)

  try {
    let response
    
    if (useAssistant && gameStore.settings.summarySystem.useAssistantForSummary) {
      // 使用辅助AI生成 (使用纯总结模式)
      response = await callAssistantAI(prompt, { systemPrompt: SUMMARY_AI_SYSTEM_PROMPT })
    } else if (window.generate) {
      // 这里的逻辑已被废弃，因为主AI不再单独调用，但保留作为Mock或备用
      response = await window.generate({
        user_input: prompt,
        should_silence: true,
        max_chat_history: 0
      })
    } else {
      // Mock环境
      response = `<minor_summary>（Mock总结）这是第${floor}楼的剧情总结。${content.substring(0, 100)}...</minor_summary>`
    }

    const summaryContent = extractSummary(response, 'minor')
    
    if (!summaryContent) {
      console.warn('[SummaryManager] Failed to extract minor summary from response')
      return { success: false, error: 'Failed to extract summary' }
    }

    const { year, month, day } = gameStore.gameTime
    const gameDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const summary = {
      floor,
      type: 'minor',
      content: summaryContent,
      coveredFloors: [floor],
      timestamp: Date.now(),
      gameDate
    }

    // 保存到store
    addSummary(summary)

    console.log(`[SummaryManager] Generated minor summary for floor ${floor}`)
    return { success: true, summary }
  } catch (e) {
    console.error('[SummaryManager] Error generating minor summary:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 生成大总结（合并多个小总结）
 * @param {number[]} floors 要合并的楼层号列表
 * @returns {Promise<{success: boolean, summary?: object, error?: string}>}
 */
export async function generateMajorSummary(floors) {
  const gameStore = useGameStore()
  
  if (!gameStore.settings.summarySystem?.enabled) {
    return { success: false, error: 'Summary system is disabled' }
  }

  // 获取对应楼层的小总结
  const minorSummaries = gameStore.player.summaries
    .filter(s => s.type === 'minor' && floors.includes(s.floor))
    .sort((a, b) => a.floor - b.floor)

  if (minorSummaries.length === 0) {
    return { success: false, error: 'No minor summaries found for given floors' }
  }

  const summariesText = minorSummaries
    .map((s, i) => `【第${s.floor}楼】\n${s.content}`)
    .join('\n\n')

  const prompt = MAJOR_SUMMARY_PROMPT.replace('{summaries}', summariesText)

  try {
    let response
    
    if (gameStore.settings.summarySystem.useAssistantForSummary) {
      // 使用纯总结模式
      response = await callAssistantAI(prompt, { systemPrompt: SUMMARY_AI_SYSTEM_PROMPT })
    } else if (window.generate) {
      response = await window.generate({
        user_input: prompt,
        should_silence: true,
        max_chat_history: 0
      })
    } else {
      response = `<major_summary>（Mock大总结）合并了${floors.length}个小总结的内容。</major_summary>`
    }

    const summaryContent = extractSummary(response, 'major')
    
    if (!summaryContent) {
      console.warn('[SummaryManager] Failed to extract major summary from response')
      return { success: false, error: 'Failed to extract summary' }
    }

    const summary = {
      floor: Math.max(...floors), // 使用最大楼层号作为标识
      type: 'major',
      content: summaryContent,
      coveredFloors: floors,
      timestamp: Date.now()
    }

    // 保存到store
    addSummary(summary)

    console.log(`[SummaryManager] Generated major summary covering floors ${floors.join(', ')}`)
    return { success: true, summary }
  } catch (e) {
    console.error('[SummaryManager] Error generating major summary:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 添加总结到store
 * @param {object} summary 总结对象
 */
function addSummary(summary) {
  const gameStore = useGameStore()
  
  // 检查是否已存在相同楼层和类型的总结
  const existingIndex = gameStore.player.summaries.findIndex(
    s => s.floor === summary.floor && s.type === summary.type
  )
  
  if (existingIndex >= 0) {
    // 替换现有的
    gameStore.player.summaries[existingIndex] = summary
  } else {
    // 添加新的
    gameStore.player.summaries.push(summary)
  }
}

/**
 * 删除指定楼层及之后的所有总结（用于回溯）
 * @param {number} floor 起始楼层
 */
export function removeSummariesAfterFloor(floor) {
  const gameStore = useGameStore()
  gameStore.player.summaries = gameStore.player.summaries.filter(s => {
    // 对于小总结，直接比较楼层
    if (s.type === 'minor') {
      return s.floor < floor
    }
    // 对于大总结和超级总结，检查覆盖的楼层
    return s.coveredFloors.every(f => f < floor)
  })
}

/**
 * 删除指定楼层的总结（用于重Roll）
 * @param {number} floor 楼层号
 */
export function removeSummaryAtFloor(floor) {
  const gameStore = useGameStore()
  gameStore.player.summaries = gameStore.player.summaries.filter(s => {
    if (s.type === 'minor') {
      return s.floor !== floor
    }
    // 对于大/超级总结，如果包含该楼层，也需要删除
    return !s.coveredFloors.includes(floor)
  })
}

/**
 * 检查哪些日期需要生成日记（有小总结但没有日记的历史日期）
 * @param {string} currentGameDate 当前游戏日期 'YYYY-MM-DD'
 * @returns {string[]} 需要生成日记的日期列表
 */
export function checkDiaryNeeded(currentGameDate) {
  const gameStore = useGameStore()
  const summaries = gameStore.player.summaries || []

  // 收集所有有 gameDate 的 minor 总结的日期
  const minorDates = new Set()
  summaries.forEach(s => {
    if (s.type === 'minor' && s.gameDate) {
      minorDates.add(s.gameDate)
    }
  })

  // 收集已有日记的日期
  const diaryDates = new Set()
  summaries.forEach(s => {
    if (s.type === 'diary' && s.gameDate) {
      diaryDates.add(s.gameDate)
    }
  })

  // 找出有 minor 但没有 diary 且不是当天的日期
  const needed = []
  for (const date of minorDates) {
    if (!diaryDates.has(date) && date < currentGameDate) {
      needed.push(date)
    }
  }

  return needed.sort()
}

/**
 * 为指定游戏日期生成每日日记
 * @param {string} gameDate 游戏日期 'YYYY-MM-DD'
 * @returns {Promise<{success: boolean, summary?: object, error?: string}>}
 */
export async function generateDiary(gameDate, options = {}) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem

  if (!settings?.enabled) {
    return { success: false, error: 'Summary system is disabled' }
  }

  // 日记依赖辅助 AI
  if (!settings.useAssistantForSummary || !gameStore.settings.assistantAI?.enabled) {
    return { success: false, error: 'Assistant AI is required for diary generation' }
  }

  // dryRun 模式下跳过已存在检查
  if (!options.dryRun) {
    const existing = (gameStore.player.summaries || []).find(
      s => s.type === 'diary' && s.gameDate === gameDate
    )
    if (existing) {
      console.log(`[SummaryManager] Diary already exists for ${gameDate}, skipping`)
      return { success: true, summary: existing }
    }
  }

  // 收集该日期的所有 minor 总结
  const dayMinors = (gameStore.player.summaries || [])
    .filter(s => s.type === 'minor' && s.gameDate === gameDate)
    .sort((a, b) => a.floor - b.floor)

  if (dayMinors.length === 0) {
    return { success: false, error: `No minor summaries found for ${gameDate}` }
  }

  // 拼接小总结文本
  const summariesText = dayMinors
    .map((s, i) => `【第${s.floor}楼】\n${s.content}`)
    .join('\n\n')

  const prompt = DIARY_PROMPT
    .replace(/\{date\}/g, gameDate)
    .replace('{summaries}', summariesText)

  try {
    const response = await callAssistantAI(prompt, { systemPrompt: SUMMARY_AI_SYSTEM_PROMPT })
    const diaryContent = extractSummary(response, 'diary')

    if (!diaryContent) {
      console.warn('[SummaryManager] Failed to extract diary from response')
      return { success: false, error: 'Failed to extract diary' }
    }

    const coveredFloors = dayMinors.map(s => s.floor)
    const summary = {
      floor: Math.max(...coveredFloors),
      type: 'diary',
      content: diaryContent,
      coveredFloors,
      timestamp: Date.now(),
      gameDate
    }

    // dryRun 模式下只返回内容，不保存
    if (options.dryRun) {
      return { success: true, content: diaryContent, summary }
    }

    addSummary(summary)
    console.log(`[SummaryManager] Generated diary for ${gameDate}, covering floors: ${coveredFloors.join(',')}`)
    return { success: true, summary }
  } catch (e) {
    console.error(`[SummaryManager] Error generating diary for ${gameDate}:`, e)
    return { success: false, error: e.message }
  }
}

/**
 * 批量生成所有缺失的日记（手动触发）
 * @param {Function} [onProgress] 进度回调 (current, total, date)
 * @returns {Promise<{generated: number, failed: number}>}
 */
export async function generateBatchDiaries(onProgress) {
  const gameStore = useGameStore()
  const summaries = gameStore.player.summaries || []

  // 收集所有有 gameDate 的 minor 日期
  const minorDates = new Set()
  summaries.forEach(s => {
    if (s.type === 'minor' && s.gameDate) {
      minorDates.add(s.gameDate)
    }
  })

  // 收集已有日记的日期
  const diaryDates = new Set()
  summaries.forEach(s => {
    if (s.type === 'diary' && s.gameDate) {
      diaryDates.add(s.gameDate)
    }
  })

  // 找出所有缺失日记的日期
  const needed = [...minorDates].filter(d => !diaryDates.has(d)).sort()

  if (needed.length === 0) {
    return { generated: 0, failed: 0 }
  }

  let generated = 0
  let failed = 0

  for (let i = 0; i < needed.length; i++) {
    const date = needed[i]
    if (onProgress) onProgress(i + 1, needed.length, date)

    try {
      const result = await generateDiary(date)
      if (result.success) {
        generated++
      } else {
        failed++
        console.warn(`[SummaryManager] Failed to generate diary for ${date}:`, result.error)
      }
    } catch (e) {
      failed++
      console.error(`[SummaryManager] Error generating diary for ${date}:`, e)
    }
  }

  return { generated, failed }
}

/**
 * 获取指定楼层应该使用的内容类型
 * 
 * 逻辑说明：
 * - minorSummaryStartFloor: 最近 N 层保持原文，超过则使用小总结
 * - majorSummaryStartFloor: 最近 N 层使用小总结/原文，超过则尝试大总结
 * 
 * 例如: minorSummaryStartFloor=8, majorSummaryStartFloor=25, currentFloor=50
 * - 楼层 43-50 (距离 0-7): 原文
 * - 楼层 26-42 (距离 8-24): 小总结
 * - 楼层 1-25 (距离 25+): 大总结或超级总结
 * 
 * @param {number} targetFloor 目标楼层
 * @param {number} currentFloor 当前楼层
 * @returns {'original' | 'minor' | 'major' | 'super'} 应使用的内容类型
 */
export function getContentTypeForFloor(targetFloor, currentFloor) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  
  if (!settings?.enabled) {
    return 'original'
  }
  
  const distance = currentFloor - targetFloor
  
  if (distance < settings.minorSummaryStartFloor) {
    // 最近的楼层，保持原文
    return 'original'
  } else if (distance < settings.majorSummaryStartFloor) {
    // 中等距离，使用小总结
    return 'minor'
  } else {
    // 超过大总结起始距离，优先尝试大总结，其次超级总结
    // 注意：返回 'major' 而非 'super'，buildSummarizedHistory 会检查是否有超级总结覆盖
    return 'major'
  }
}

/**
 * 获取指定楼层的总结内容
 * @param {number} floor 楼层号
 * @param {string} type 总结类型
 * @returns {string|null} 总结内容
 */
export function getSummaryContent(floor, type) {
  const gameStore = useGameStore()
  
  if (type === 'minor') {
    const summary = gameStore.player.summaries.find(
      s => s.type === 'minor' && s.floor === floor
    )
    return summary?.content || null
  }
  
  if (type === 'major') {
    // 找到覆盖该楼层的大总结
    const summary = gameStore.player.summaries.find(
      s => s.type === 'major' && s.coveredFloors.includes(floor)
    )
    return summary?.content || null
  }
  
  if (type === 'super') {
    // 找到覆盖该楼层的超级总结
    const summary = gameStore.player.summaries.find(
      s => s.type === 'super' && s.coveredFloors.includes(floor)
    )
    return summary?.content || null
  }
  
  return null
}

/**
 * 处理AI回复后的总结生成（主入口）
 * @param {string} content 正文内容
 * @param {number} floor 当前楼层
 * @param {string} [preGeneratedMinorSummary] 预生成的小总结（从主回复或辅助回复中提取）
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function processPostReply(content, floor, preGeneratedMinorSummary = null) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  
  if (!settings?.enabled) {
    return { success: true } // 系统未开启视为成功（或跳过）
  }
  
  // 1. 生成小总结
  const minorResult = await generateMinorSummary(content, floor, settings.useAssistantForSummary, preGeneratedMinorSummary)

  if (!minorResult.success) {
    console.warn('[SummaryManager] Failed to generate minor summary:', minorResult.error)
    return { success: false, reason: minorResult.error === 'Minor summary missed' ? 'missing_minor' : 'error' }
  }

  // 1.5 RAG 扩展：提取关键词 + 生成向量
  if (minorResult.summary) {
    // 提取关键词（始终执行，不依赖 RAG 开关）
    const keywords = extractKeywordsFromSummary(minorResult.summary.content)
    if (keywords.length > 0) {
      minorResult.summary.keywords = keywords
    }
    // 如果 RAG 已启用且配置完整，异步生成向量
    if (isRAGReady()) {
      embedSummary(minorResult.summary).then(ok => {
        if (ok) {
          console.log(`[SummaryManager] Embedded summary for floor ${floor}`)
          gameStore.saveToStorage()
        }
      }).catch(() => {})
    }
  }
  
  // 2. 异步检查是否有需要生成日记的历史日期（兜底）
  // 使用 setTimeout 将其放入下一个 tick，不阻塞当前返回
  if (settings.useAssistantForSummary && gameStore.settings.assistantAI?.enabled) {
    setTimeout(async () => {
      try {
        const { year, month, day } = gameStore.gameTime
        const currentDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        const diaryCheck = checkDiaryNeeded(currentDate)
        for (const date of diaryCheck) {
          console.log('[SummaryManager] Generating diary for:', date)
          await generateDiary(date)
        }
      } catch (e) {
        console.error('[SummaryManager] Error in background diary generation:', e)
      }
    }, 0)
  }

  return { success: true }
}

/**
 * 构建带总结的历史消息（用于发送给AI）
 * @param {Array} chatLog 原始聊天记录
 * @param {number} currentFloor 当前楼层
 * @param {string} [userInput] 用户当前输入（RAG 模式用作检索 query）
 * @returns {Array|Promise<Array>} 处理后的聊天记录（用于构建上下文），RAG 模式下 result._ragErrors 包含错误信息
 */
export async function buildSummarizedHistory(chatLog, currentFloor, userInput) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem

  // RAG 分支：启用且有用户输入时走 RAG 路径
  if (isRAGReady() && userInput) {
    const { history, errors } = await buildRAGHistory(chatLog, currentFloor, userInput)
    if (errors && errors.length > 0) {
      history._ragErrors = errors
    }
    return history
  }
  
  if (!settings?.enabled || chatLog.length === 0) {
    return chatLog
  }
  
  const result = []
  // 用于跟踪哪些总结已被添加到结果中（避免重复输出同一个大/超级总结）
  const addedSummaryIds = new Set()
  
  for (let i = 0; i < chatLog.length; i++) {
    const log = chatLog[i]
    const logFloor = i + 1 // 假设楼层从1开始
    
    // 核心修复：先根据距离确定 contentType，这是最优先的判断
    const contentType = getContentTypeForFloor(logFloor, currentFloor)
    
    if (contentType === 'original') {
      // 最近的楼层，必须保持原文，无论是否被某个总结覆盖
      result.push({
        ...log,
        content: cleanImageTags(log.content)
      })
    } else if (contentType === 'minor') {
      // 中等距离：先查日记覆盖，再用小总结
      const diary = gameStore.player.summaries.find(
        s => s.type === 'diary' && s.coveredFloors && s.coveredFloors.includes(logFloor)
      )
      if (diary) {
        const summaryId = `diary_${diary.gameDate}`
        if (!addedSummaryIds.has(summaryId)) {
          result.push({
            type: 'summary',
            content: `[${diary.gameDate} 日记]\n${diary.content}`,
            isSummary: true,
            summaryType: 'diary'
          })
          addedSummaryIds.add(summaryId)
        }
        continue
      }
      const summary = getSummaryContent(logFloor, 'minor')
      if (summary) {
        result.push({
          ...log,
          type: log.type,
          content: `[楼层${logFloor}总结] ${summary}`,
          isSummary: true,
          summaryType: 'minor'
        })
      } else {
        // 没有小总结，使用原文
        result.push({
          ...log,
          content: cleanImageTags(log.content)
        })
      }
    } else if (contentType === 'major') {
      // 较远的距离：日记 > 旧super > 旧major > minor > 原文
      // 1. 先检查日记覆盖
      const diary = gameStore.player.summaries.find(
        s => s.type === 'diary' && s.coveredFloors && s.coveredFloors.includes(logFloor)
      )
      if (diary) {
        const summaryId = `diary_${diary.gameDate}`
        if (!addedSummaryIds.has(summaryId)) {
          result.push({
            type: 'summary',
            content: `[${diary.gameDate} 日记]\n${diary.content}`,
            isSummary: true,
            summaryType: 'diary'
          })
          addedSummaryIds.add(summaryId)
        }
        continue
      }

      // 2. 兼容旧数据：检查超级总结
      const superSummary = gameStore.player.summaries.find(
        s => s.type === 'super' && s.coveredFloors && s.coveredFloors.includes(logFloor)
      )

      if (superSummary) {
        const summaryId = `super_${superSummary.floor}`
        if (!addedSummaryIds.has(summaryId)) {
          const minFloor = Math.min(...superSummary.coveredFloors)
          const maxFloor = Math.max(...superSummary.coveredFloors)
          result.push({
            type: 'summary',
            content: `[楼层${minFloor}-${maxFloor}超级总结] ${superSummary.content}`,
            isSummary: true,
            summaryType: 'super',
            coveredFloors: superSummary.coveredFloors
          })
          addedSummaryIds.add(summaryId)
        }
        continue
      }

      // 3. 兼容旧数据：检查大总结
      const majorSummary = gameStore.player.summaries.find(
        s => s.type === 'major' && s.coveredFloors && s.coveredFloors.includes(logFloor)
      )

      if (majorSummary) {
        const summaryId = `major_${majorSummary.floor}`
        if (!addedSummaryIds.has(summaryId)) {
          const minFloor = Math.min(...majorSummary.coveredFloors)
          const maxFloor = Math.max(...majorSummary.coveredFloors)
          result.push({
            type: 'summary',
            content: `[楼层${minFloor}-${maxFloor}大总结] ${majorSummary.content}`,
            isSummary: true,
            summaryType: 'major',
            coveredFloors: majorSummary.coveredFloors
          })
          addedSummaryIds.add(summaryId)
        }
        continue
      }

      // 4. 回退到小总结
      const minorSummary = getSummaryContent(logFloor, 'minor')
      if (minorSummary) {
        result.push({
          ...log,
          content: `[楼层${logFloor}总结] ${minorSummary}`,
          isSummary: true,
          summaryType: 'minor'
        })
      } else {
        // 没有任何总结，使用原文
        result.push({
          ...log,
          content: cleanImageTags(log.content)
        })
      }
    }
  }
  
  return result
}

/**
 * 批量补齐小总结
 * 连续缺失的楼层会合并为一个小总结，非连续的单独生成
 * @param {Array} chatLog 完整聊天记录
 * @param {Function} onProgress 进度回调 (current, total)
 * @param {Object} [options] 额外选项
 * @param {boolean} [options.autoEmbed] 自动为新生成的总结计算向量
 * @returns {Promise<void>}
 */
export async function generateBatchSummaries(chatLog, onProgress, options = {}) {
  const gameStore = useGameStore()

  if (!gameStore.settings.summarySystem?.enabled) {
    throw new Error('Summary system is disabled')
  }

  // 1. 找出需要生成总结的楼层
  const floorsToProcess = []

  const coveredFloors = new Set()
  gameStore.player.summaries.forEach(s => {
    if (s.coveredFloors) {
      s.coveredFloors.forEach(f => coveredFloors.add(f))
    } else {
      coveredFloors.add(s.floor)
    }
  })

  chatLog.forEach((log, index) => {
    const floor = index + 1
    if (log.type === 'ai' && !coveredFloors.has(floor)) {
      floorsToProcess.push({ floor, content: log.content })
    }
  })

  if (floorsToProcess.length === 0) {
    return
  }

  // 2. 将连续楼层分组（连续缺失的合并为一组）
  const groups = []
  let currentGroup = []

  for (let i = 0; i < floorsToProcess.length; i++) {
    const item = floorsToProcess[i]
    if (currentGroup.length > 0) {
      const lastItem = currentGroup[currentGroup.length - 1]
      if (item.floor !== lastItem.floor + 1) {
        groups.push(currentGroup)
        currentGroup = []
      }
    }
    currentGroup.push(item)
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  // 3. 逐组处理
  const totalGroups = groups.length

  for (let i = 0; i < totalGroups; i++) {
    const group = groups[i]
    if (onProgress) {
      onProgress(i + 1, totalGroups)
    }

    if (group.length === 1) {
      // 单层：直接生成 minor 总结
      try {
        await generateMinorSummary(cleanImageTags(group[0].content), group[0].floor, true)
        // 自动计算向量
        if (options.autoEmbed) {
          const newSummary = (gameStore.player.summaries || []).find(s => s.floor === group[0].floor && s.type === 'minor' && !s.embedding)
          if (newSummary) await embedSummary(newSummary)
        }
      } catch (e) {
        console.error(`[SummaryManager] Error generating minor summary for floor ${group[0].floor}:`, e)
      }
    } else {
      // 多个连续层：合并内容生成一个 minor 总结
      console.log(`[SummaryManager] Merging floors ${group[0].floor}-${group[group.length - 1].floor} into one minor summary`)

      const mergedContent = group
        .map(item => `【第${item.floor}层】\n${cleanImageTags(item.content)}`)
        .join('\n\n')

      const prompt = `[任务：合并生成小总结]
请阅读以下连续的剧情片段（楼层 ${group[0].floor} 到 ${group[group.length - 1].floor}），生成一个详细的剧情小总结。

要求：
1. 概括这段剧情的核心发展，保留关键转折和重要信息
2. 严格用 <minor_summary>总结内容</minor_summary> 标签包裹
3. 总结格式：
    日期|年月日时分
    标题|给这次总结的内容起一个20字左右的标题
    地点|当前位置
    人物|当前场景内的角色
    描述|这次正文的摘要总结（200-400字）
    人物关系|人物关系的变化
    重要信息|重要信息
    角色意图|场景中各角色接下来想要做的事情或目标
    互动内容|与玩家的关键互动
    待办事项|尚未完成的约定或任务（如有，没有则写”无”）

剧情内容：
${mergedContent}`

      try {
        let response
        const settings = gameStore.settings.summarySystem
        if (settings.useAssistantForSummary) {
          response = await callAssistantAI(prompt, { systemPrompt: SUMMARY_AI_SYSTEM_PROMPT })
        } else if (window.generate) {
          response = await window.generate({
            user_input: prompt,
            should_silence: true,
            max_chat_history: 0
          })
        } else {
          response = `<minor_summary>（Mock合并总结）覆盖楼层 ${group.map(b => b.floor).join(', ')}</minor_summary>`
        }

        const summaryContent = extractSummary(response, 'minor')

        if (summaryContent) {
          const coveredGroupFloors = group.map(b => b.floor)
          // 尝试从总结中提取日期
          const dateMatch = summaryContent.match(/日期[|｜]([^\n]+)/)
          const gameDate = dateMatch ? dateMatch[1].trim() : undefined
          const summary = {
            floor: Math.max(...coveredGroupFloors),
            type: 'minor',
            content: summaryContent,
            coveredFloors: coveredGroupFloors,
            timestamp: Date.now(),
            ...(gameDate && { gameDate })
          }
          addSummary(summary)
          // 自动计算向量
          if (options.autoEmbed) {
            await embedSummary(summary)
          }
          console.log(`[SummaryManager] Merged minor summary for floors: ${coveredGroupFloors.join(',')}`)
        } else {
          console.warn(`[SummaryManager] Failed to extract summary for group ${i}`)
        }
      } catch (e) {
        console.error(`[SummaryManager] Error processing group ${i}:`, e)
      }
    }
  }

  // 批量处理完成后，统一保存到存储
  gameStore.saveToStorage()
  console.log('[SummaryManager] Batch summaries generation completed and saved')
}
