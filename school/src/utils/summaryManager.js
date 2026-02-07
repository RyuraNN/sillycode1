import { useGameStore } from '../stores/gameStore'
import { callAssistantAI } from './assistantAI'

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

const SUPER_SUMMARY_PROMPT = `[任务：合并大总结]
请将以下多个大总结合并为一个超精简版本。

要求：
1. 只保留最关键的剧情转折点
2. 高度压缩信息
3. 字数控制在200字以内
4. 直接输出总结内容，不要添加任何前言或解释

待合并的大总结：
{summaries}

请用以下格式输出（必须严格遵循格式）：
<super_summary>你的超级总结</super_summary>`

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

/**
 * 移除AI响应中的思维链内容
 * @param {string} content AI响应内容
 * @returns {string} 清理后的内容
 */
export function removeThinking(content) {
  if (!content) return ''
  // 移除常见的思维链标签及其内容
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<extrathink>[\s\S]*?<\/extrathink>/gi, '')
    .trim()
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
    super: 'super_summary'
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
    const summary = {
      floor,
      type: 'minor',
      content: preGeneratedSummary,
      coveredFloors: [floor],
      timestamp: Date.now()
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

    const summary = {
      floor,
      type: 'minor',
      content: summaryContent,
      coveredFloors: [floor],
      timestamp: Date.now()
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
 * 生成超级总结（合并多个大总结或超级总结）
 * @param {number[]} sourceFloors 要合并的来源总结的floor标识列表
 * @param {'major' | 'super'} sourceType 来源类型
 * @returns {Promise<{success: boolean, summary?: object, error?: string}>}
 */
export async function generateSuperSummary(sourceFloors, sourceType = 'major') {
  const gameStore = useGameStore()
  
  if (!gameStore.settings.summarySystem?.enabled) {
    return { success: false, error: 'Summary system is disabled' }
  }

  // 获取对应的来源总结
  const sourceSummaries = gameStore.player.summaries
    .filter(s => s.type === sourceType && sourceFloors.includes(s.floor))
    .sort((a, b) => a.floor - b.floor)

  if (sourceSummaries.length === 0) {
    return { success: false, error: `No ${sourceType} summaries found for given floors` }
  }

  // 收集所有覆盖的原始楼层
  const allCoveredFloors = []
  sourceSummaries.forEach(s => {
    allCoveredFloors.push(...s.coveredFloors)
  })

  const summariesText = sourceSummaries
    .map((s, i) => `【楼层${s.coveredFloors[0]}-${s.coveredFloors[s.coveredFloors.length - 1]}】\n${s.content}`)
    .join('\n\n')

  const prompt = SUPER_SUMMARY_PROMPT.replace('{summaries}', summariesText)

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
      response = `<super_summary>（Mock超级总结）合并了${sourceSummaries.length}个${sourceType}总结的内容。</super_summary>`
    }

    const summaryContent = extractSummary(response, 'super')
    
    if (!summaryContent) {
      console.warn('[SummaryManager] Failed to extract super summary from response')
      return { success: false, error: 'Failed to extract summary' }
    }

    const summary = {
      floor: Math.max(...sourceFloors),
      type: 'super',
      content: summaryContent,
      coveredFloors: [...new Set(allCoveredFloors)].sort((a, b) => a - b),
      timestamp: Date.now()
    }

    // 保存到store
    addSummary(summary)

    console.log(`[SummaryManager] Generated super summary covering floors ${allCoveredFloors.join(', ')}`)
    return { success: true, summary }
  } catch (e) {
    console.error('[SummaryManager] Error generating super summary:', e)
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
 * 检查是否需要生成大总结
 * @param {number} currentFloor 当前楼层
 * @returns {{needed: boolean, floors?: number[]}}
 */
export function checkMajorSummaryNeeded(currentFloor) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  
  if (!settings?.enabled || !settings.useAssistantForSummary) {
    return { needed: false }
  }
  
  // 获取所有小总结
  const minorSummaries = gameStore.player.summaries
    .filter(s => s.type === 'minor')
    .sort((a, b) => a.floor - b.floor)
  
  // 获取已经被大总结覆盖的楼层
  const coveredByMajor = new Set()
  gameStore.player.summaries
    .filter(s => s.type === 'major')
    .forEach(s => s.coveredFloors.forEach(f => coveredByMajor.add(f)))
  
  // 找出未被覆盖的小总结，且必须已经超出保护范围（距离 > 25）
  // 这样保证生成的“大总结”包含的所有内容都是已经可以显示的
  const uncoveredMinors = minorSummaries.filter(s => {
    if (coveredByMajor.has(s.floor)) return false
    
    // 检查距离：只有当小总结距离当前楼层超过 majorSummaryStartFloor 时，才认为它可以被合并
    // 对应需求：等待小总结超出的层数大于5的时候再用大总结进行替换
    const distance = currentFloor - s.floor
    return distance >= settings.majorSummaryStartFloor
  })
  
  if (uncoveredMinors.length >= settings.minorCountForMajor) {
    // 取最老的 N 个小总结进行合并
    const toMerge = uncoveredMinors.slice(0, settings.minorCountForMajor)
    return {
      needed: true,
      floors: toMerge.map(s => s.floor)
    }
  }
  
  return { needed: false }
}

/**
 * 检查是否需要生成超级总结（支持递归）
 * @param {number} currentFloor 当前楼层
 * @returns {{needed: boolean, summaryFloors?: number[], sourceType?: 'major' | 'super'}}
 */
export function checkSuperSummaryNeeded(currentFloor) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  
  if (!settings?.enabled || !settings.useAssistantForSummary) {
    return { needed: false }
  }
  
  // 1. 检查大总结是否需要合并
  const majorSummaries = gameStore.player.summaries
    .filter(s => s.type === 'major')
    .sort((a, b) => a.floor - b.floor)
  
  // 获取已经被超级总结覆盖的大总结
  const coveredBySuper = new Set()
  const superSummaries = gameStore.player.summaries
    .filter(s => s.type === 'super')
    .sort((a, b) => a.floor - b.floor) // 排序以便后续处理

  superSummaries.forEach(s => {
    majorSummaries.forEach(m => {
      // 检查覆盖关系：如果大总结的所有楼层都在超级总结的覆盖范围内
      if (m.coveredFloors.every(f => s.coveredFloors.includes(f))) {
        coveredBySuper.add(m.floor)
      }
    })
  })
  
  // 筛选未被覆盖的大总结，且必须是“生效”的大总结
  // 生效定义：在游戏中实际替换了上下文（即距离 > majorSummaryStartFloor）
  // 我们检查大总结的最大楼层是否也超出了保护范围，确保整个大总结都已经生效
  const uncoveredMajors = majorSummaries.filter(s => {
    if (coveredBySuper.has(s.floor)) return false

    const maxFloor = Math.max(...s.coveredFloors)
    const distance = currentFloor - maxFloor
    return distance >= settings.majorSummaryStartFloor
  })
  
  if (uncoveredMajors.length >= settings.majorCountForSuper) {
    const toMerge = uncoveredMajors.slice(0, settings.majorCountForSuper)
    return {
      needed: true,
      summaryFloors: toMerge.map(s => s.floor),
      sourceType: 'major'
    }
  }

  // 2. 检查超级总结是否需要递归合并
  // 逻辑：如果有一组超级总结，它们没有被更高级的超级总结覆盖
  // "更高级" 是指覆盖范围更大的超级总结
  const coveredSupers = new Set()
  
  superSummaries.forEach(parent => {
    superSummaries.forEach(child => {
      if (parent === child) return
      // 如果 child 被 parent 完全覆盖（且 parent 范围更大），则 child 已经被合并
      if (child.coveredFloors.every(f => parent.coveredFloors.includes(f)) && 
          parent.coveredFloors.length > child.coveredFloors.length) {
        coveredSupers.add(child.floor)
      }
    })
  })

  // 同样需要检查超级总结是否“生效”，虽然超级总结通常肯定很老了，但保持逻辑一致性
  const uncoveredSupers = superSummaries.filter(s => {
    if (coveredSupers.has(s.floor)) return false
    
    const maxFloor = Math.max(...s.coveredFloors)
    const distance = currentFloor - maxFloor
    return distance >= settings.majorSummaryStartFloor
  })

  if (uncoveredSupers.length >= settings.majorCountForSuper) { // 复用大总结的阈值设置
    const toMerge = uncoveredSupers.slice(0, settings.majorCountForSuper)
    return {
      needed: true,
      summaryFloors: toMerge.map(s => s.floor),
      sourceType: 'super'
    }
  }
  
  return { needed: false }
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
  
  // 2. 异步检查是否需要生成大总结（仅在使用辅助AI时）
  // 使用 setTimeout 将其放入下一个 tick，不阻塞当前返回
  if (settings.useAssistantForSummary && gameStore.settings.assistantAI?.enabled) {
    setTimeout(async () => {
      try {
        const majorCheck = checkMajorSummaryNeeded(floor)
        if (majorCheck.needed) {
          console.log('[SummaryManager] Generating major summary for floors:', majorCheck.floors)
          await generateMajorSummary(majorCheck.floors)
        }
        
        // 3. 检查是否需要生成超级总结 (循环检查以支持多层递归)
        let superCheck = checkSuperSummaryNeeded(floor)
        while (superCheck.needed) {
          console.log(`[SummaryManager] Generating super summary from ${superCheck.sourceType}s:`, superCheck.summaryFloors)
          await generateSuperSummary(superCheck.summaryFloors, superCheck.sourceType)
          
          // 重新检查，看是否能继续向上合并
          superCheck = checkSuperSummaryNeeded(floor)
        }
      } catch (e) {
        console.error('[SummaryManager] Error in background summary generation:', e)
      }
    }, 0)
  }

  return { success: true }
}

/**
 * 构建带总结的历史消息（用于发送给AI）
 * @param {Array} chatLog 原始聊天记录
 * @param {number} currentFloor 当前楼层
 * @returns {Array} 处理后的聊天记录（用于构建上下文）
 */
export function buildSummarizedHistory(chatLog, currentFloor) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  
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
      // 中等距离，使用小总结
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
      // 较远的距离，允许使用大/超级总结
      // 先检查是否有超级总结覆盖该楼层
      const superSummary = gameStore.player.summaries.find(
        s => s.type === 'super' && s.coveredFloors && s.coveredFloors.includes(logFloor)
      )
      
      if (superSummary) {
        const summaryId = `super_${superSummary.floor}`
        if (!addedSummaryIds.has(summaryId)) {
          // 输出超级总结，并标记为已添加
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
        // 如果该超级总结已被添加过，则跳过这个楼层（不重复输出）
        continue
      }
      
      // 没有超级总结，检查大总结
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
        // 如果该大总结已被添加过，则跳过这个楼层
        continue
      }
      
      // 没有大/超级总结，回退到小总结
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
 * 批量生成总结
 * @param {Array} chatLog 完整聊天记录
 * @param {number} batchSize 每批处理的层数
 * @param {Function} onProgress 进度回调 (current, total)
 * @returns {Promise<void>}
 */
export async function generateBatchSummaries(chatLog, batchSize, onProgress) {
  const gameStore = useGameStore()
  
  if (!gameStore.settings.summarySystem?.enabled) {
    throw new Error('Summary system is disabled')
  }

  // 1. 找出需要生成总结的楼层
  // 条件：
  // - 是 AI 回复 (type === 'ai')
  // - 没有现有的总结 (minor/major/super) 覆盖
  // - 且不包括最新的几层（通常不需要立即总结，比如最后 5 层）
  //   但这里是“补齐”，所以只要符合条件都应该补。
  //   不过为了安全，最新的层通常还在变动，但如果它是历史记录中的，应该没问题。
  
  const floorsToProcess = []
  
  // 获取所有已被覆盖的楼层
  const coveredFloors = new Set()
  gameStore.player.summaries.forEach(s => {
    if (s.coveredFloors) {
      s.coveredFloors.forEach(f => coveredFloors.add(f))
    } else {
      coveredFloors.add(s.floor)
    }
  })

  // 遍历日志，识别缺口
  chatLog.forEach((log, index) => {
    const floor = index + 1
    if (log.type === 'ai' && !coveredFloors.has(floor)) {
      floorsToProcess.push({ floor, content: log.content })
    }
  })

  // 如果没有需要处理的楼层
  if (floorsToProcess.length === 0) {
    return
  }

  // 2. 分批
  const batches = []
  let currentBatch = []
  
  // 必须是连续的层才能放在一批里 (根据任务要求)
  // floorsToProcess 已经是按顺序的，但不一定是连续的整数
  
  for (let i = 0; i < floorsToProcess.length; i++) {
    const item = floorsToProcess[i]
    
    // 检查是否与上一个连续
    if (currentBatch.length > 0) {
      const lastItem = currentBatch[currentBatch.length - 1]
      if (item.floor !== lastItem.floor + 1) {
        // 不连续，结束当前批次
        batches.push(currentBatch)
        currentBatch = []
      }
    }
    
    currentBatch.push(item)
    
    // 检查是否达到批次大小
    if (currentBatch.length >= batchSize) {
      batches.push(currentBatch)
      currentBatch = []
    }
  }
  
  // 添加最后一个批次
  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  // 3. 逐批处理
  const totalBatches = batches.length
  
  for (let i = 0; i < totalBatches; i++) {
    const batch = batches[i]
    if (onProgress) {
      onProgress(i + 1, totalBatches)
    }
    
    // 构建 Prompt
    const floorsText = batch
      .map(item => `【第${item.floor}层】\n${item.content}`)
      .join('\n\n')
      
    // 使用大总结模板，稍微修改一下提示词
    const prompt = `[任务：批量生成剧情总结]
请阅读以下连续的剧情片段（来自楼层 ${batch[0].floor} 到 ${batch[batch.length - 1].floor}），将其直接整合成一个连贯的大总结。

要求：
1. 概括这段剧情的核心发展
2. 保留关键转折和重要信息
3. 字数控制在300字以内
4. 直接输出总结内容，不要添加任何前言或解释

剧情内容：
${floorsText}

请用以下格式输出（必须严格遵循格式）：
<major_summary>你的合并总结</major_summary>`

    try {
      // 使用纯总结模式调用辅助AI
      let response
      if (gameStore.settings.summarySystem.useAssistantForSummary) {
        response = await callAssistantAI(prompt, { systemPrompt: SUMMARY_AI_SYSTEM_PROMPT })
      } else if (window.generate) {
        // 备用
        response = await window.generate({
          user_input: prompt,
          should_silence: true,
          max_chat_history: 0
        })
      } else {
        response = `<major_summary>（Mock批量总结）覆盖楼层 ${batch.map(b => b.floor).join(', ')}</major_summary>`
      }

      const summaryContent = extractSummary(response, 'major')
      
      if (summaryContent) {
        const coveredBatchFloors = batch.map(b => b.floor)
        const summary = {
          floor: Math.max(...coveredBatchFloors),
          type: 'major',
          content: summaryContent,
          coveredFloors: coveredBatchFloors,
          timestamp: Date.now()
        }
        addSummary(summary)
        console.log(`[SummaryManager] Batch generated major summary for floors: ${coveredBatchFloors.join(',')}`)
      } else {
        console.warn(`[SummaryManager] Failed to extract summary for batch ${i}`)
      }
      
    } catch (e) {
      console.error(`[SummaryManager] Error processing batch ${i}:`, e)
      // 继续处理下一个批次
    }
  }
}
