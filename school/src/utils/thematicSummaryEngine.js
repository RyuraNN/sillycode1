/**
 * Phase 3.1: 主题聚类总结
 * 将散落的 minor summary 按实体维度聚合为主题总结
 */

import { useGameStore } from '../stores/gameStore'
import { extractKeywordsFromSummary, getSummaryCoverageKey } from './ragService'
import { callAssistantAI } from './assistantAI'
import { getErrorMessage } from './errorUtils'

// ==================== 常量 ====================

const THEMATIC_AGGREGATION_INTERVAL = 30      // 每 30 楼触发一次主题聚合
const MIN_CLUSTER_SIZE = 5           // 最少 5 条 minor 才能聚合
const THEMATIC_SUMMARY_TAG = 'thematic'

// ==================== 按实体分组 ====================

/**
 * 按实体维度将 minor summary 分组
 * @param {Array} summaries 所有 SummaryData
 * @returns {Map<string, Array>} 实体名 → 相关 minor summary 列表
 */
export function groupSummariesByEntity(summaries) {
  const entityMap = new Map()

  for (const summary of summaries) {
    if (summary.type !== 'minor') continue
    if (summary.isConsolidated) continue

    const keywords = Array.isArray(summary.keywords) && summary.keywords.length > 0
      ? summary.keywords
      : extractKeywordsFromSummary(summary.content)

    for (const keyword of keywords) {
      if (!entityMap.has(keyword)) {
        entityMap.set(keyword, [])
      }
      entityMap.get(keyword).push(summary)
    }
  }

  return entityMap
}

// ==================== AI 生成主题总结 ====================

/**
 * 为指定实体生成主题总结
 * @param {string} entityName 实体名（NPC 名/地点名）
 * @param {Array} relatedSummaries 相关的 minor summary 列表
 * @returns {Promise<object|null>} 生成的 thematic SummaryData，或 null
 */
export async function synthesizeThematicSummary(entityName, relatedSummaries) {
  const gameStore = useGameStore()

  if (!gameStore.settings.assistantAI?.enabled) {
    console.warn('[ThematicSummary] Assistant AI not enabled, skipping synthesis')
    return null
  }

  const sortedSummaries = [...relatedSummaries].sort((a, b) => (a.floor || 0) - (b.floor || 0))
  const summaryTexts = sortedSummaries
    .map((s, i) => `[${i + 1}] 楼层${s.floor || '?'}: ${s.content}`)
    .join('\n\n')

  const coveredFloors = []
  for (const s of sortedSummaries) {
    if (Array.isArray(s.coveredFloors)) {
      coveredFloors.push(...s.coveredFloors)
    } else if (s.floor) {
      coveredFloors.push(s.floor)
    }
  }

  const prompt = `请根据以下与"${entityName}"相关的多条历史记录，生成一份关于"${entityName}"的主题总结。

要求：
1. 总结"${entityName}"在这些记录中的核心经历、性格特征、与玩家的关系变化
2. 按时间线梳理关键事件
3. 突出仍然有效的信息（承诺、约定、未解决的冲突等）
4. 忽略已经完成或过时的事项
5. 使用以下格式输出：

<thematic_summary>
主题|${entityName}
关键经历|（按时间线列出2-5个关键事件）
性格印象|（基于记录总结的性格特点）
关系状态|（当前与玩家的关系状态）
未解决事项|（尚未完结的约定、冲突、计划等，如果没有则写"无"）
</thematic_summary>

以下是相关历史记录：
${summaryTexts}`

  try {
    const response = await callAssistantAI(prompt, {
      systemPrompt: '你是一个记忆整理助手。请根据提供的历史记录片段，生成精炼的主题总结。只输出要求的格式内容，不要添加额外说明。'
    })

    // 提取 thematic_summary 标签内容
    const match = response.match(/<thematic_summary>([\s\S]*?)<\/thematic_summary>/i)
    const content = match ? match[1].trim() : response.trim()

    if (!content || content.length < 20) {
      console.warn(`[ThematicSummary] Generated content too short for entity: ${entityName}`)
      return null
    }

    const { year, month, day } = gameStore.gameTime
    const gameDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    return {
      floor: sortedSummaries[sortedSummaries.length - 1]?.floor || 0,
      type: THEMATIC_SUMMARY_TAG,
      content,
      coveredFloors: [...new Set(coveredFloors)].sort((a, b) => a - b),
      timestamp: Date.now(),
      gameDate,
      thematicSubject: entityName,
      keywords: [entityName]
    }
  } catch (e) {
    console.error(`[ThematicSummary] Failed to synthesize for ${entityName}:`, getErrorMessage(e))
    return null
  }
}

// ==================== 周期性主题聚合 ====================

/**
 * 周期性扫描未归档的 minor 集群，按实体维度生成主题总结
 * @param {object} options
 * @param {number} options.currentFloor 当前楼层
 * @returns {Promise<{ generated: number, errors: number }>}
 */
export async function runThematicAggregation(options = {}) {
  const gameStore = useGameStore()
  const { currentFloor = gameStore.currentFloor || 0 } = options

  // 检查是否到达反思间隔
  if (currentFloor % THEMATIC_AGGREGATION_INTERVAL !== 0) {
    return { generated: 0, errors: 0 }
  }

  const summaries = gameStore.player?.summaries || []
  const entityGroups = groupSummariesByEntity(summaries)

  let generated = 0
  let errors = 0

  for (const [entityName, relatedSummaries] of entityGroups) {
    // 跳过太小的集群
    if (relatedSummaries.length < MIN_CLUSTER_SIZE) continue

    // 检查是否已有该实体的 thematic summary
    const existingThematic = summaries.find(
      s => s.type === THEMATIC_SUMMARY_TAG && s.thematicSubject === entityName
    )
    // 如果已存在且覆盖了大部分记录，跳过
    if (existingThematic) {
      const newSinceThematic = relatedSummaries.filter(
        s => s.timestamp > existingThematic.timestamp
      )
      if (newSinceThematic.length < MIN_CLUSTER_SIZE) continue
    }

    try {
      const thematicSummary = await synthesizeThematicSummary(entityName, relatedSummaries)
      if (thematicSummary) {
        // 添加到 summaries（不可变模式）
        gameStore.player.summaries = [
          ...gameStore.player.summaries,
          thematicSummary
        ]

        // 标记源 minor 为已归档（不可变模式）
        const consolidatedKeys = new Set(relatedSummaries.map(s => getSummaryCoverageKey(s)))
        gameStore.player.summaries = gameStore.player.summaries.map(s => {
          if (s.type === 'minor' && consolidatedKeys.has(getSummaryCoverageKey(s)) && !s.isConsolidated) {
            return { ...s, isConsolidated: true }
          }
          return s
        })

        generated++
        console.log(`[ThematicSummary] Generated thematic summary for: ${entityName} (${relatedSummaries.length} sources)`)
      }
    } catch (e) {
      errors++
      console.error(`[ThematicSummary] Error generating for ${entityName}:`, getErrorMessage(e))
    }

    // 每次生成后短暂延迟，避免 API 过载
    if (generated > 0) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  if (generated > 0) {
    gameStore.saveToStorage()
  }

  console.log(`[ThematicSummary] Aggregation complete: ${generated} generated, ${errors} errors`)
  return { generated, errors }
}
