import { useGameStore } from '../stores/gameStore'
import { cleanImageTags, removeThinking } from './summaryManager'
import { getNpcsAtLocation } from './npcScheduleSystem.js'
import { validateAssistantAIConfig } from './assistantAI'
import { getErrorMessage } from './errorUtils'

/**
 * RAG 记忆检索服务
 * 提供 Embedding 向量检索 + Rerank 重排序的双阶段检索管线
 * 当 ragSystem 未启用时，所有函数均为空操作，不影响现有系统
 */

// ==================== API 调用 ====================

/**
 * 调用 Embedding API（OpenAI 兼容 /v1/embeddings）
 * @param {string} text 待向量化的文本
 * @returns {Promise<number[]>} 向量数组
 */
export async function callEmbeddingAPI(text) {
  const gameStore = useGameStore()
  const cfg = gameStore.settings.ragSystem?.embedding
  if (!cfg?.apiUrl || !cfg?.apiKey || !cfg?.model) {
    throw new Error('Embedding API 未配置完整')
  }

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '')
  const url = baseUrl.endsWith('/embeddings') ? baseUrl : baseUrl + '/embeddings'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({ model: cfg.model, input: text })
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Embedding API 错误 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return data?.data?.[0]?.embedding || []
}

/**
 * 调用 Rerank API（OpenAI 兼容 /v1/rerank 或 /rerank）
 * @param {string} query 查询文本
 * @param {string[]} documents 候选文档列表
 * @param {number} topN 返回前 N 个结果
 * @returns {Promise<Array<{index: number, relevance_score: number}>>}
 */
export async function callRerankAPI(query, documents, topN) {
  const gameStore = useGameStore()
  const cfg = gameStore.settings.ragSystem?.rerank
  if (!cfg?.apiUrl || !cfg?.apiKey || !cfg?.model) {
    throw new Error('Rerank API 未配置完整')
  }

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '')
  const url = baseUrl.endsWith('/rerank') ? baseUrl : baseUrl + '/rerank'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({ model: cfg.model, query, documents, top_n: topN })
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Rerank API 错误 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return data?.results || data?.data || []
}

// ==================== 向量计算 ====================

/**
 * 余弦相似度
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ==================== 关键词提取 ====================

/**
 * 从小总结内容中提取关键词（人物名、地点名）
 * 解析 MINOR_SUMMARY_PROMPT 格式中的 人物|xxx 和 地点|xxx
 * @param {string} summaryContent 小总结内容
 * @returns {string[]} 关键词数组
 */
export function extractKeywordsFromSummary(summaryContent) {
  if (!summaryContent) return []
  const keywords = []
  const lines = summaryContent.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 人物|xxx 格式
    const charMatch = trimmed.match(/^人物[|｜](.+)$/i)
    if (charMatch) {
      const names = charMatch[1].split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
      keywords.push(...names)
      continue
    }
    // 匹配 地点|xxx 格式
    const locMatch = trimmed.match(/^地点[|｜](.+)$/i)
    if (locMatch) {
      const locs = locMatch[1].split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
      keywords.push(...locs)
    }
  }
  return [...new Set(keywords)]
}

const TRACE_TEXT_LIMIT = 6000
const TRACE_CANDIDATE_LIMIT = 10
const TRACE_DOC_LIMIT = 10
const RRF_K = 20

function clampTraceText(text, max = TRACE_TEXT_LIMIT) {
  if (text === null || text === undefined) return ''
  const value = String(text)
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value
}

function uniqueQueries(queries, limit = 2) {
  const seen = new Set()
  const result = []
  for (const query of queries || []) {
    const normalized = (query || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function getSummaryCoveredFloors(summary) {
  const floors = Array.isArray(summary?.coveredFloors) && summary.coveredFloors.length > 0
    ? summary.coveredFloors
    : [summary?.floor]
  return [...new Set(floors.filter(floor => Number.isFinite(floor)))].sort((a, b) => a - b)
}

function getSummaryMinFloor(summary) {
  const floors = getSummaryCoveredFloors(summary)
  return floors.length > 0 ? floors[0] : summary?.floor
}

function getSummaryMaxFloor(summary) {
  const floors = getSummaryCoveredFloors(summary)
  return floors.length > 0 ? floors[floors.length - 1] : summary?.floor
}

function getSummaryAnchorFloor(summary) {
  return getSummaryMaxFloor(summary)
}

function getSummaryCoverageKey(summary) {
  const floors = getSummaryCoveredFloors(summary)
  return `${summary?.type || 'minor'}:${floors.join(',')}`
}

function summaryIntersectsFloors(summary, floorSet) {
  if (!floorSet || floorSet.size === 0) return false
  return getSummaryCoveredFloors(summary).some(floor => floorSet.has(floor))
}

function formatSummaryFloorLabel(summary, prefix = '楼层') {
  const minFloor = getSummaryMinFloor(summary)
  const maxFloor = getSummaryMaxFloor(summary)
  return minFloor === maxFloor ? `${prefix}${maxFloor}` : `${prefix}${minFloor}-${maxFloor}`
}

function previewSummaryContent(content, max = 220) {
  const normalized = clampTraceText((content || '').replace(/\s+/g, ' ').trim(), max)
  return normalized
}

function parseStructuredSummaryContent(content) {
  if (!content) return {}
  const sections = {}
  const lines = content.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([^|｜\n]+)[|｜](.+)$/)
    if (!match) continue
    sections[match[1].trim()] = match[2].trim()
  }
  return sections
}

function hashText(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(16)
}

function buildEmbeddingText(summary) {
  const sections = parseStructuredSummaryContent(summary?.content || '')
  const orderedFields = [
    ['标题', '标题'],
    ['日期', '日期'],
    ['地点', '地点'],
    ['人物', '人物'],
    ['描述', '描述'],
    ['人物关系', '人物关系'],
    ['重要信息', '重要信息'],
    ['角色意图', '角色意图'],
    ['互动内容', '互动内容'],
    ['待办事项', '待办事项']
  ]
  const semanticLines = orderedFields
    .map(([sourceKey, label]) => sections[sourceKey] ? `${label}: ${sections[sourceKey]}` : '')
    .filter(Boolean)

  if (semanticLines.length >= 3) {
    return semanticLines.join('\n')
  }

  return summary?.content || ''
}

export function summaryNeedsEmbeddingRefresh(summary) {
  if (!summary || summary.type !== 'minor') return false

  const gameStore = useGameStore()
  const expectedModel = gameStore.settings.ragSystem?.embedding?.model || ''
  const embedding = Array.isArray(summary.embedding) ? summary.embedding : []
  const meta = summary.embeddingMeta

  if (embedding.length === 0) return true
  if (!meta) return true
  if (!meta.model || meta.model !== expectedModel) return true
  if (!Number.isFinite(meta.dims) || meta.dims !== embedding.length) return true

  const contentHash = hashText(buildEmbeddingText(summary))
  return meta.contentHash !== contentHash
}

function getTrace(traceId) {
  const gameStore = useGameStore()
  return (gameStore.ragDiagnostics?.traces || []).find(trace => trace.id === traceId) || null
}

function appendTraceStep(traceId, stage, title, status = 'info', data, detail) {
  if (!traceId) return
  const gameStore = useGameStore()
  gameStore.appendRagTraceStep(traceId, {
    stage,
    title,
    status,
    detail,
    data
  })
}

function appendTraceError(traceId, stage, error) {
  if (!traceId) return
  const gameStore = useGameStore()
  const trace = getTrace(traceId)
  const nextErrors = [...(trace?.errors || []), { stage, message: getErrorMessage(error) }]
  gameStore.updateRagTrace(traceId, {
    errors: nextErrors,
    status: 'warning'
  })
}

function buildTraceCandidate(item, extra = {}) {
  const summary = item.summary || item
  return {
    summaryKey: getSummaryCoverageKey(summary),
    floor: summary.floor,
    minFloor: getSummaryMinFloor(summary),
    maxFloor: getSummaryMaxFloor(summary),
    coveredFloors: getSummaryCoveredFloors(summary),
    type: summary.type,
    score: item.score,
    rawScore: item.rawScore,
    preview: previewSummaryContent(summary.content),
    ...extra
  }
}

function weightedReciprocalRankFusion(queryBuckets, topK) {
  const fusedMap = new Map()

  for (const bucket of queryBuckets) {
    for (let i = 0; i < bucket.candidates.length; i++) {
      const candidate = bucket.candidates[i]
      const summaryKey = getSummaryCoverageKey(candidate.summary)
      const rankScore = bucket.weight / (RRF_K + i + 1)
      if (!fusedMap.has(summaryKey)) {
        fusedMap.set(summaryKey, {
          summary: candidate.summary,
          score: 0,
          rawScore: candidate.rawScore ?? candidate.score ?? 0,
          sourceKinds: new Set(),
          sourceQueries: new Set()
        })
      }

      const fused = fusedMap.get(summaryKey)
      fused.score += rankScore
      fused.rawScore = Math.max(fused.rawScore, candidate.rawScore ?? candidate.score ?? 0)
      fused.sourceKinds.add(bucket.kind)
      fused.sourceQueries.add(bucket.query)
    }
  }

  return [...fusedMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// ==================== Query 改写 ====================

/**
 * 使用 assistantAI 改写检索 query
 * 将相对时间、代词指代等转换为具体描述，提升向量检索精度
 * @param {string} userInput 原始用户输入
 * @param {object} gameTime 当前游戏时间
 * @param {object|null} lastRound 最近一轮上下文 { playerMsg, aiReply }
 * @param {object} options 可选参数
 * @param {boolean} options.enableProactiveQuery 是否启用主动查询生成
 * @param {string[]} options.npcContext 场景NPC上下文数组
 * @returns {Promise<string|object>} 改写后的 query，或 { mainQuery, additionalQueries }
 */
export async function rewriteQueryWithAI(userInput, gameTime, lastRound, options = {}) {
  const gameStore = useGameStore()
  const { apiUrl, apiKey, model } = gameStore.settings.assistantAI

  const validation = validateAssistantAIConfig(gameStore.settings.assistantAI, true)
  if (!validation.valid) {
    console.warn(`[RAG] Query rewrite skipped: ${validation.error}`)
    return userInput
  }

  const { enableProactiveQuery = false, npcContext = [], traceId = null } = options

  // 基础Query改写的System Prompt
  let systemPrompt = `你是一个查询改写助手。将用户的输入改写为适合语义检索的查询文本。
规则：
1. 将相对时间（前天、上周、那次）转换为具体日期或描述
2. 将代词指代（他、她、那个人）尽量替换为具体名称（根据上下文推断）
3. 保留原始语义，不要添加无关内容`

  // 如果启用主动查询生成，扩展System Prompt
  if (enableProactiveQuery) {
    systemPrompt += `
4. **主动查询生成**：分析用户输入，识别隐含需求并生成0-2个补充查询
   - 地点隐含需求：如"去图书馆"可能需要"图书馆的历史记忆"
   - 上轮对话补充：如上轮提到"美术教室"，本轮可补充"美术教室的相关事件"
   - 场景NPC补充：如当前场景有重要人物，可补充其历史信息
   - **重要**：只在确实需要时生成补充查询，不要过度生成
   - **限制**：补充查询数量为0-2个

**输出格式** (XML)：
<queries>
<main>主查询文本</main>
<additional>补充查询1</additional>
<additional>补充查询2</additional>
</queries>

如果无需补充查询，只输出<main>标签即可。`
  } else {
    systemPrompt += `
4. 直接输出改写后的文本，不要解释
5. 如果输入已经足够明确，原样返回即可`
  }

  let contextBlock = ''
  if (lastRound) {
    if (lastRound.playerMsg) contextBlock += `[玩家上一轮输入] ${lastRound.playerMsg}\n`
    if (lastRound.aiReply) contextBlock += `[AI上一轮回复摘要] ${cleanImageTags(lastRound.aiReply).slice(0, 800)}\n`
  }

  // 添加NPC上下文（如果启用主动查询）
  let npcContextBlock = ''
  if (enableProactiveQuery && npcContext.length > 0) {
    npcContextBlock = `\n**当前场景人物**: ${npcContext.join('、')}\n（如果用户输入隐含需要这些人物的历史信息，可以考虑生成补充查询）`
  }

  const userPrompt = `当前游戏时间：${gameTime.year}年${gameTime.month}月${gameTime.day}日 ${gameTime.hour}:${String(gameTime.minute).padStart(2, '0')}
${contextBlock}${npcContextBlock}
[当前玩家输入] ${userInput}

请将当前玩家输入改写为适合语义检索的查询文本：`

  if (traceId) {
    gameStore.updateRagTrace(traceId, {
      rewritePrompt: {
        system: systemPrompt,
        user: userPrompt
      }
    })
    appendTraceStep(traceId, 'queryRewrite', '查询改写请求', 'info', {
      promptUserLength: userPrompt.length,
      proactiveEnabled: enableProactiveQuery,
      npcContext
    })
  }

  let endpoint = apiUrl.replace(/\/+$/, '')
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions'
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: model && model.toLowerCase().includes('gpt') ? 1 : 0.3,
      max_tokens: enableProactiveQuery ? 500 : 300
    })
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Query rewrite API 错误 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  let result = (data.choices?.[0]?.message?.content || '').trim()
  result = removeThinking(result).trim()

  if (traceId) {
    gameStore.updateRagTrace(traceId, {
      rewriteResponse: result
    })
  }

  // 如果启用主动查询生成，解析XML输出
  if (enableProactiveQuery) {
    const mainMatch = result.match(/<main>(.+?)<\/main>/s)
    const mainQuery = mainMatch ? mainMatch[1].trim() : (result || userInput)

    const additionalQueries = []
    const additionalMatches = result.matchAll(/<additional>(.+?)<\/additional>/gs)
    for (const match of additionalMatches) {
      const query = match[1].trim()
      if (query && additionalQueries.length < 2) {
        additionalQueries.push(query)
      }
    }

    if (traceId) {
      appendTraceStep(traceId, 'queryRewrite', '查询改写完成', 'success', {
        mainQuery,
        additionalQueries
      })
    }

    return { mainQuery, additionalQueries }
  }

  if (traceId) {
    appendTraceStep(traceId, 'queryRewrite', '查询改写完成', 'success', {
      mainQuery: result || userInput,
      additionalQueries: []
    })
  }

  // 未启用主动查询，返回字符串（向后兼容）
  return result || userInput
}

// ==================== 向量生成与存储 ====================

/**
 * 为单个总结生成并存储向量
 * @param {object} summary SummaryData 对象（引用，会直接修改 embedding 字段）
 * @returns {Promise<boolean>} 是否成功
 */
export async function embedSummary(summary) {
  const gameStore = useGameStore()
  try {
    const embeddingText = buildEmbeddingText(summary)
    const embedding = await callEmbeddingAPI(embeddingText)
    if (embedding && embedding.length > 0) {
      summary.embedding = embedding
      summary.embeddingMeta = {
        model: gameStore.settings.ragSystem?.embedding?.model || '',
        dims: embedding.length,
        contentHash: hashText(embeddingText),
        updatedAt: Date.now()
      }
      return true
    }
    return false
  } catch (e) {
    console.warn('[RAG] embedSummary failed:', getErrorMessage(e))
    const traceId = gameStore.ragDiagnostics?.activeTraceId || gameStore.ragDiagnostics?.traces?.[0]?.id || null
    appendTraceError(traceId, 'embedding', e)
    appendTraceStep(traceId, 'embedding', '向量生成失败', 'error', {
      floor: summary?.floor,
      summaryKey: getSummaryCoverageKey(summary),
      embeddingText: clampTraceText(buildEmbeddingText(summary))
    }, getErrorMessage(e))
    return false
  }
}

/**
 * 批量为已有总结补齐向量
 * @param {function} progressCallback (current, total) => void
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function batchEmbedSummaries(progressCallback) {
  const gameStore = useGameStore()
  const summaries = gameStore.player.summaries.filter(
    s => s.type === 'minor' && summaryNeedsEmbeddingRefresh(s)
  )
  let success = 0, failed = 0
  for (let i = 0; i < summaries.length; i++) {
    if (progressCallback) progressCallback(i + 1, summaries.length)
    const ok = await embedSummary(summaries[i])
    if (ok) success++; else failed++
    // 简单限速，避免 API 过载
    if (i < summaries.length - 1) await new Promise(r => setTimeout(r, 200))
  }
  // 持久化
  gameStore.saveToStorage()
  return { success, failed }
}

// ==================== 动态参数计算 ====================

/**
 * 根据总结数量自动计算 topK 和 rerankTopN
 * @param {number} summaryCount 已向量化的 minor 总结数量
 * @returns {{ topK: number, topN: number }}
 */
export function calcAutoRAGParams(summaryCount) {
  // topK: 取总结数量的 25%，夹在 10-100 之间
  const topK = Math.max(10, Math.min(100, Math.round(summaryCount * 0.25)))
  // topN: 取 topK 的 30%，夹在 3-30 之间
  const topN = Math.max(3, Math.min(30, Math.round(topK * 0.3)))
  return { topK, topN }
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function calcRecencyMultiplier(distance, recencyBias, recencyHalfLife) {
  const normalizedDistance = Math.max(0, distance)
  const bias = clampNumber(recencyBias, 0, 1, 0.25)
  const halfLife = Math.max(1, clampNumber(recencyHalfLife, 1, 9999, 60))
  const recencyWeight = Math.exp(-normalizedDistance / halfLife)
  return (1 - bias) + (bias * recencyWeight)
}

function adjustScoreByRecency(score, floor, currentFloor, recencyBias, recencyHalfLife) {
  if (!Number.isFinite(currentFloor) || !Number.isFinite(floor)) return score
  const distance = Math.max(0, currentFloor - floor)
  return score * calcRecencyMultiplier(distance, recencyBias, recencyHalfLife)
}

/**
 * 获取生效的 RAG 参数（自动调整 or 手动设置）
 * @returns {{ topK: number, topN: number }}
 */
export function getEffectiveRAGParams() {
  const gameStore = useGameStore()
  const ragSettings = gameStore.settings.ragSystem
  const thresholds = {
    minVectorScore: clampNumber(ragSettings.minVectorScore, 0, 1, 0.35),
    minRerankScore: clampNumber(ragSettings.minRerankScore, 0, 1, 0.15),
    recencyBias: clampNumber(ragSettings.recencyBias, 0, 1, 0.25),
    recencyHalfLife: clampNumber(ragSettings.recencyHalfLife, 1, 300, 60)
  }
  if (ragSettings.autoAdjust) {
    const summaryCount = gameStore.player.summaries.filter(
      s => s.type === 'minor' && !summaryNeedsEmbeddingRefresh(s)
    ).length
    return { ...calcAutoRAGParams(summaryCount), ...thresholds }
  }
  return {
    topK: ragSettings.topK || 50,
    topN: ragSettings.rerankTopN || 15,
    ...thresholds
  }
}

// ==================== 检索与重排序 ====================

/**
 * 向量检索：从所有已向量化的 minor 总结中找出最相似的 topK 个
 * @param {string} query 查询文本
 * @param {number} topK 返回数量
 * @param {object} options 可选参数
 * @param {number} options.currentFloor 当前楼层，用于旧记忆衰减
 * @param {Set<number>} options.excludeFloors 需要排除的楼层
 * @param {number} options.minVectorScore 最低向量分数阈值
 * @param {number} options.recencyBias 旧记忆衰减强度
 * @param {number} options.recencyHalfLife 旧记忆半衰期（楼层）
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function searchSimilarSummaries(query, topK, options = {}) {
  const gameStore = useGameStore()
  const {
    currentFloor = null,
    excludeFloors = new Set(),
    minVectorScore = 0,
    recencyBias = 0,
    recencyHalfLife = 60,
    traceMeta = null
  } = options
  const queryEmbedding = await callEmbeddingAPI(query)
  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const candidates = gameStore.player.summaries
    .filter(s => s.type === 'minor' && !summaryNeedsEmbeddingRefresh(s) && !summaryIntersectsFloors(s, excludeFloors))
    .map(s => {
      const rawScore = cosineSimilarity(queryEmbedding, s.embedding)
      const score = adjustScoreByRecency(rawScore, getSummaryAnchorFloor(s), currentFloor, recencyBias, recencyHalfLife)
      return {
        summary: s,
        score,
        rawScore
      }
    })
    .filter(item => item.score >= minVectorScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK))

  if (traceMeta?.traceId) {
    const trace = getTrace(traceMeta.traceId)
    const perQueryCandidates = [...(trace?.perQueryCandidates || []), {
      query,
      kind: traceMeta.kind,
      candidates: candidates.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item, {
        sourceQuery: query,
        sourceKind: traceMeta.kind
      }))
    }]
    gameStore.updateRagTrace(traceMeta.traceId, { perQueryCandidates })
    appendTraceStep(traceMeta.traceId, 'embeddingSearch', `向量检索：${traceMeta.kind}`, 'success', {
      query,
      candidateCount: candidates.length,
      topCandidates: perQueryCandidates[perQueryCandidates.length - 1].candidates
    })
  }

  return candidates
}

/**
 * Rerank 重排序：对候选总结进行精排
 * @param {string} query 查询文本
 * @param {Array<{summary: object, score: number}>} candidates 候选列表
 * @param {number} topN 保留数量
 * @param {object} options 可选参数
 * @param {number} options.currentFloor 当前楼层，用于旧记忆衰减
 * @param {number} options.minRerankScore 最低 rerank 分数阈值
 * @param {number} options.recencyBias 旧记忆衰减强度
 * @param {number} options.recencyHalfLife 旧记忆半衰期（楼层）
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function rerankSummaries(query, candidates, topN, options = {}) {
  if (candidates.length === 0) return []
  const {
    currentFloor = null,
    minRerankScore = 0,
    recencyBias = 0,
    recencyHalfLife = 60,
    traceMeta = null
  } = options
  try {
    const documents = candidates.map(c => c.summary.content)
    if (traceMeta?.traceId) {
      const gameStore = useGameStore()
      gameStore.updateRagTrace(traceMeta.traceId, {
        rerankRequest: {
          query,
          topN,
          documentsPreview: documents.slice(0, TRACE_DOC_LIMIT).map(doc => clampTraceText(doc, 500))
        }
      })
    }
    const results = await callRerankAPI(query, documents, topN)
    if (traceMeta?.traceId) {
      const gameStore = useGameStore()
      gameStore.updateRagTrace(traceMeta.traceId, {
        rerankResponse: results.slice(0, TRACE_DOC_LIMIT)
      })
      appendTraceStep(traceMeta.traceId, 'rerank', 'Rerank 完成', 'success', {
        query,
        resultCount: results.length,
        topResults: results.slice(0, TRACE_DOC_LIMIT)
      })
    }
    // 按 relevance_score 排序，映射回原始 summary
    return results
      .map(r => {
        const summary = candidates[r.index]?.summary
        const rawScore = r.relevance_score || 0
        if (!summary) return null
        return {
          summary,
          score: adjustScoreByRecency(rawScore, getSummaryAnchorFloor(summary), currentFloor, recencyBias, recencyHalfLife),
          rawScore
        }
      })
      .filter(Boolean)
      .filter(item => item.score >= minRerankScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
  } catch (e) {
    console.warn('[RAG] Rerank failed, falling back to embedding order:', getErrorMessage(e))
    appendTraceError(traceMeta?.traceId, 'rerank', e)
    appendTraceStep(traceMeta?.traceId, 'rerank', 'Rerank 失败，回退向量顺序', 'warning', {
      query,
      candidateCount: candidates.length
    }, getErrorMessage(e))
    return candidates
      .slice(0, topN)
  }
}

// ==================== 增强召回模式 ====================

/**
 * 使用 assistantAI 分析召回的总结，识别不相关/已完成的总结并生成补充查询
 * @param {string} userInput 用户当前输入
 * @param {Array<{summary: object, score: number}>} ragSummaries 召回的总结列表
 * @param {object} gameTime 当前游戏时间
 * @returns {Promise<{pruneIndexes: number[], additionalQueries: string[]}>}
 */
export async function analyzeRecalledSummaries(userInput, ragSummaries, gameTime, options = {}) {
  const gameStore = useGameStore()
  const { apiUrl, apiKey, model } = gameStore.settings.assistantAI
  const { traceId = null } = options

  const validation = validateAssistantAIConfig(gameStore.settings.assistantAI, true)
  if (!validation.valid) {
    console.warn(`[Enhanced Recall] Skipped: ${validation.error}`)
    return { pruneIndexes: [], additionalQueries: [] }
  }

  // 收集场景NPC上下文
  const contextNpcs = []

  // 1. 获取当前场景的NPC（最多5个）
  try {
    const locationNpcs = getNpcsAtLocation(gameStore.player.location, gameStore)
      .filter(npc => npc.isAlive)
      .slice(0, 5)
    contextNpcs.push(...locationNpcs.map(npc => npc.name))
  } catch (e) {
    console.warn('[Enhanced Recall] Failed to get location NPCs:', getErrorMessage(e))
  }

  // 2. 如果场景NPC不足5个，补充关系亲密的NPC
  if (contextNpcs.length < 5) {
    try {
      const closeNpcs = gameStore.npcs
        .filter(npc => npc.isAlive && !contextNpcs.includes(npc.name))
        .filter(npc => {
          const rel = gameStore.npcRelationships?.[npc.name]?.relations?.[gameStore.player.name]
          return rel && (rel.intimacy > 60 || rel.trust > 60)
        })
        .sort((a, b) => {
          const relA = gameStore.npcRelationships?.[a.name]?.relations?.[gameStore.player.name]
          const relB = gameStore.npcRelationships?.[b.name]?.relations?.[gameStore.player.name]
          const scoreA = (relA?.intimacy || 0) + (relA?.trust || 0)
          const scoreB = (relB?.intimacy || 0) + (relB?.trust || 0)
          return scoreB - scoreA
        })
        .slice(0, 5 - contextNpcs.length)
      contextNpcs.push(...closeNpcs.map(npc => npc.name))
    } catch (e) {
      console.warn('[Enhanced Recall] Failed to get close NPCs:', getErrorMessage(e))
    }
  }

  // 3. 从召回的总结中提取提到的人物（补充到8个）
  if (contextNpcs.length < 8) {
    try {
      const mentionedNpcs = new Set()
      for (const item of ragSummaries) {
        const keywords = extractKeywordsFromSummary(item.summary.content)
        for (const keyword of keywords) {
          const npc = gameStore.npcs.find(n => n.name === keyword && n.isAlive)
          if (npc && !contextNpcs.includes(npc.name)) {
            mentionedNpcs.add(npc.name)
          }
        }
      }
      contextNpcs.push(...Array.from(mentionedNpcs).slice(0, 8 - contextNpcs.length))
    } catch (e) {
      console.warn('[Enhanced Recall] Failed to extract mentioned NPCs:', getErrorMessage(e))
    }
  }

  // 构建NPC上下文文本
  const npcContext = contextNpcs.length > 0
    ? `\n\n**当前场景最可能出现的人物**: ${contextNpcs.join('、')}\n（如果用户输入或召回结果提到这些人物，但缺少相关历史信息，可以考虑在补充查询中包含）`
    : ''

  // 计算相对日期的绝对值（用于提示AI）
  const yesterday = new Date(gameTime.year, gameTime.month - 1, gameTime.day)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayBeforeYesterday = new Date(gameTime.year, gameTime.month - 1, gameTime.day)
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2)

  const systemPrompt = `你是一个智能记忆过滤助手。你的任务是分析RAG系统召回的历史总结，判断哪些总结与当前剧情生成无关，以及是否需要补充查询。

**当前游戏时间**: ${gameTime.year}年${gameTime.month}月${gameTime.day}日 ${gameTime.hour}:${String(gameTime.minute).padStart(2, '0')}
**昨天日期**: ${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日
**前天日期**: ${dayBeforeYesterday.getFullYear()}年${dayBeforeYesterday.getMonth() + 1}月${dayBeforeYesterday.getDate()}日${npcContext}

**分析原则**:
1. **剪枝判断** (保守策略，宁可保留有疑问的总结):
   - 明确已完成的事件 (如"昨天的考试已结束"，但用户问"明天的计划")
   - 完全无关的话题 (如召回了"社团活动"，但用户问"数学作业")
   - 时间上明显过时的内容 (如召回了"上个月的约定"，但已确认取消)

2. **补充查询判断**:
   - 用户输入提到具体人物/事件/日期，但召回结果中未包含相关信息
   - 召回结果提到某个关键信息的前置事件，但该前置事件未被召回
   - 当前场景的重要人物在召回结果中缺少历史信息（特别是预设可能会推进与他们相关的剧情时）
   - **重要**：可以生成0-2个补充查询，每个查询针对一个具体的信息缺失点
   - **时间表达规范**：必须使用绝对日期（如"2024年4月15日"），不要使用相对时间（如"前天"、"大前天"、"上周"）

**输出格式** (XML):
<analysis>
<prune>
<item>召回项序号1</item>
<item>召回项序号2</item>
</prune>
<additional>补充查询1</additional>
<additional>补充查询2</additional>
</analysis>

如果无需剪枝或补充，对应标签留空即可。`

  const summariesText = ragSummaries
    .map((item, idx) => `[${idx + 1}] ${formatSummaryFloorLabel(item.summary)} | 相关度${(item.score * 100).toFixed(0)}%\n${item.summary.content}`)
    .join('\n\n')

  const userPrompt = `**用户当前输入**: ${userInput}

**召回的历史总结**:
${summariesText}

请分析上述召回结果，输出剪枝建议和补充查询：`

  let endpoint = apiUrl.replace(/\/+$/, '')
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions'
  }

  if (traceId) {
    gameStore.updateRagTrace(traceId, {
      analyzerPrompt: {
        system: systemPrompt,
        user: userPrompt
      }
    })
    appendTraceStep(traceId, 'enhancedRecall', '增强召回分析请求', 'info', {
      recalledCount: ragSummaries.length
    })
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      throw new Error(`Enhanced recall API 错误 (${res.status}): ${errText}`)
    }

    const data = await res.json()
    let result = (data.choices?.[0]?.message?.content || '').trim()
    result = removeThinking(result).trim()

    if (traceId) {
      gameStore.updateRagTrace(traceId, {
        analyzerResponse: result
      })
    }

    // 解析 XML 输出
    const pruneIndexes = []
    const additionalQueries = []

    // 提取 <item> 标签
    const itemMatches = result.matchAll(/<item>(\d+)<\/item>/g)
    for (const match of itemMatches) {
      const itemIndex = parseInt(match[1], 10)
      if (!isNaN(itemIndex)) pruneIndexes.push(itemIndex)
    }

    // 提取 <additional> 标签（多个）
    const queryMatches = result.matchAll(/<additional>(.+?)<\/additional>/gs)
    for (const match of queryMatches) {
      const query = match[1].trim()
      if (query && additionalQueries.length < 2) {
        additionalQueries.push(query)
      }
    }

    if (traceId) {
      gameStore.updateRagTrace(traceId, {
        pruneIndexes,
        enhancedQueries: additionalQueries
      })
      appendTraceStep(traceId, 'enhancedRecall', '增强召回分析完成', 'success', {
        pruneIndexes,
        additionalQueries
      })
    }

    return { pruneIndexes, additionalQueries: uniqueQueries(additionalQueries, 2) }
  } catch (e) {
    console.warn('[Enhanced Recall] Analysis failed:', getErrorMessage(e))
    appendTraceError(traceId, 'enhancedRecall', e)
    appendTraceStep(traceId, 'enhancedRecall', '增强召回分析失败', 'warning', null, getErrorMessage(e))
    return { pruneIndexes: [], additionalQueries: [] }
  }
}

/**
 * 对补充查询执行二次检索
 * @param {string|string[]} queries 补充查询文本或列表
 * @param {Set<number>} excludeFloors 需要排除的楼层集合
 * @param {number} topN 返回的结果数量
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function executeAdditionalQuery(queries, excludeFloors, topN, options = {}) {
  const queryList = uniqueQueries(Array.isArray(queries) ? queries : [queries], 2)
  if (queryList.length === 0) return []

  try {
    const gameStore = useGameStore()
    const { traceId = null, mainQuery = queryList[0] } = options
    const { topK, minVectorScore, minRerankScore, recencyBias, recencyHalfLife } = getEffectiveRAGParams()
    const queryBuckets = []

    for (const query of queryList) {
      const candidates = await searchSimilarSummaries(query, Math.min(topK, 50), {
        currentFloor: gameStore.currentFloor,
        excludeFloors,
        minVectorScore,
        recencyBias,
        recencyHalfLife,
        traceMeta: {
          traceId,
          kind: 'enhanced'
        }
      })

      if (candidates.length > 0) {
        queryBuckets.push({
          query,
          kind: 'enhanced',
          weight: 0.6,
          candidates
        })
      }
    }

    if (queryBuckets.length === 0) return []

    const fusedCandidates = weightedReciprocalRankFusion(queryBuckets, Math.min(topK, 50))
    if (traceId) {
      appendTraceStep(traceId, 'enhancedRecall', '增强召回候选融合', 'success', {
        fusedCandidates: fusedCandidates.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item))
      })
    }

    return await rerankSummaries(mainQuery, fusedCandidates, topN, {
      currentFloor: gameStore.currentFloor,
      minRerankScore,
      recencyBias,
      recencyHalfLife,
      traceMeta: {
        traceId,
        kind: 'enhanced'
      }
    })
  } catch (e) {
    console.warn(`[Enhanced Recall] Additional query failed: "${queryList.join(' | ')}"`, getErrorMessage(e))
    appendTraceError(options?.traceId, 'enhancedRecall', e)
  }

  return []
}

// ==================== RAG 历史构建 ====================

/**
 * RAG 模式的历史构建
 * 最近 N 楼保持原文，更早楼层通过向量检索 + Rerank 召回最相关的总结
 * 未召回的楼层不出现在上下文中，节省 token
 *
 * @param {Array} chatLog 原始聊天记录
 * @param {number} currentFloor 当前楼层
 * @param {string} userInput 用户当前输入（用作检索 query）
 * @returns {Promise<Array>} 处理后的聊天记录
 */
export async function buildRAGHistory(chatLog, currentFloor, userInput) {
  const gameStore = useGameStore()
  const settings = gameStore.settings.summarySystem
  const ragSettings = gameStore.settings.ragSystem
  const errors = [] // 收集各环节错误
  const traceId = gameStore.startRagTrace({
    floor: currentFloor,
    userInput,
    originalQuery: userInput,
    cacheHit: false,
    status: 'running',
    errors: []
  })
  const traceStartedAt = Date.now()

  if (!chatLog || chatLog.length === 0) {
    appendTraceStep(traceId, 'historyBuild', '无历史可检索', 'info')
    gameStore.finishRagTrace(traceId, {
      status: 'success',
      totalMs: Date.now() - traceStartedAt,
      finalSummaries: []
    })
    return { history: chatLog, errors, traceId }
  }

  const result = []
  const recentThreshold = settings.minorSummaryStartFloor || 6
  const bridgeCount = 5 // 桥接层：正文边界外最近 5 轮小总结

  // 构建检索 query：拼接最近2条小总结 + 用户输入，提升语义丰富度
  let query = userInput
  if (ragSettings.useContextQuery !== false) {
    const recentSummaries = gameStore.player.summaries
      .filter(s => s.type === 'minor')
      .sort((a, b) => getSummaryAnchorFloor(b) - getSummaryAnchorFloor(a))
      .slice(0, 2)
      .reverse()
    if (recentSummaries.length > 0) {
      const summaryContext = recentSummaries.map(s => s.content).join('\n')
      query = (summaryContext + '\n' + userInput).slice(0, 2000)
    }
  }

  gameStore.updateRagTrace(traceId, {
    originalQuery: userInput,
    contextualQuery: query
  })
  appendTraceStep(traceId, 'buildQuery', '构建检索 Query', 'success', {
    originalQuery: userInput,
    contextualQuery: query
  })

  // 收集场景NPC上下文（用于主动查询生成）
  const contextNpcs = []
  if (ragSettings.proactiveQueryGeneration && gameStore.settings.assistantAI?.enabled) {
    try {
      // 1. 获取当前场景的NPC（最多5个）
      const locationNpcs = getNpcsAtLocation(gameStore.player.location, gameStore)
        .filter(npc => npc.isAlive)
        .slice(0, 5)
      contextNpcs.push(...locationNpcs.map(npc => npc.name))

      // 2. 如果场景NPC不足5个，补充关系亲密的NPC
      if (contextNpcs.length < 5) {
        const closeNpcs = gameStore.npcs
          .filter(npc => npc.isAlive && !contextNpcs.includes(npc.name))
          .filter(npc => {
            const rel = gameStore.npcRelationships?.[npc.name]?.relations?.[gameStore.player.name]
            return rel && (rel.intimacy > 60 || rel.trust > 60)
          })
          .sort((a, b) => {
            const relA = gameStore.npcRelationships?.[a.name]?.relations?.[gameStore.player.name]
            const relB = gameStore.npcRelationships?.[b.name]?.relations?.[gameStore.player.name]
            const scoreA = (relA?.intimacy || 0) + (relA?.trust || 0)
            const scoreB = (relB?.intimacy || 0) + (relB?.trust || 0)
            return scoreB - scoreA
          })
          .slice(0, 5 - contextNpcs.length)
        contextNpcs.push(...closeNpcs.map(npc => npc.name))
      }
    } catch (e) {
      console.warn('[RAG] Failed to collect NPC context:', getErrorMessage(e))
    }
  }

  // Query 改写：使用 assistantAI 解析相对时间/代词指代 + 主动查询生成
  let mainQuery = query
  let additionalQueries = []

  if (gameStore.settings.assistantAI?.enabled && gameStore.settings.assistantAI?.apiUrl) {
    try {
      let lastRound = null
      if (chatLog.length >= 2) {
        const lastAi = chatLog[chatLog.length - 1]
        const lastPlayer = chatLog[chatLog.length - 2]
        lastRound = {
          playerMsg: lastPlayer?.type === 'player' ? (lastPlayer.content || '').slice(0, 500) : '',
          aiReply: lastAi?.type === 'ai' ? lastAi.content : ''
        }
      }

      // 构建rewriteOptions
      const rewriteOptions = {
        enableProactiveQuery: ragSettings.proactiveQueryGeneration || false,
        npcContext: contextNpcs,
        traceId
      }

      const rewriteResult = await rewriteQueryWithAI(query, gameStore.gameTime, lastRound, rewriteOptions)

      // 处理返回值：兼容字符串和对象两种格式
      if (typeof rewriteResult === 'string') {
        mainQuery = rewriteResult
      } else if (rewriteResult && typeof rewriteResult === 'object') {
        mainQuery = rewriteResult.mainQuery || query
        additionalQueries = uniqueQueries(rewriteResult.additionalQueries || [], 2)

        // 记录日志
        if (additionalQueries.length > 0) {
          console.log('[RAG] Proactive queries generated:', additionalQueries)
        }
      }
    } catch (e) {
      console.warn('[RAG] Query rewrite failed:', getErrorMessage(e))
      errors.push({ stage: 'queryRewrite', message: getErrorMessage(e) })
      appendTraceError(traceId, 'queryRewrite', e)
    }
  }

  gameStore.updateRagTrace(traceId, {
    mainQuery,
    proactiveQueries: additionalQueries
  })

  // 1. 分离最近楼层（Layer 1: 原文）和更早楼层
  const recentLogs = []
  const olderFloors = []

  for (let i = 0; i < chatLog.length; i++) {
    const logFloor = i + 1
    const distance = currentFloor - logFloor
    if (distance < recentThreshold) {
      recentLogs.push({ log: chatLog[i], floor: logFloor })
    } else {
      olderFloors.push(logFloor)
    }
  }

  // 2. 从更早楼层中分离桥接层（Layer 2）和 RAG 层（Layer 3）
  const sortedOlder = [...olderFloors].sort((a, b) => b - a)
  const bridgeFloors = sortedOlder.slice(0, bridgeCount)
  const bridgeSet = new Set(bridgeFloors)
  const recentFloorSet = new Set(recentLogs.map(r => r.floor))
  const excludeSet = new Set([...bridgeSet, ...recentFloorSet])
  const minorSummaries = gameStore.player.summaries.filter(s => s.type === 'minor')

  // 3. 桥接层：查找对应小总结，按楼层升序注入
  const bridgeSummaries = []
  const usedBridgeKeys = new Set()
  for (const floor of [...bridgeFloors].sort((a, b) => a - b)) {
    const summary = minorSummaries
      .filter(s => getSummaryCoveredFloors(s).includes(floor) && !usedBridgeKeys.has(getSummaryCoverageKey(s)))
      .sort((a, b) => {
        const spanA = getSummaryCoveredFloors(a).length
        const spanB = getSummaryCoveredFloors(b).length
        if (spanA !== spanB) return spanA - spanB
        return getSummaryAnchorFloor(b) - getSummaryAnchorFloor(a)
      })[0]
    if (summary) {
      usedBridgeKeys.add(getSummaryCoverageKey(summary))
      // 过滤已完成的待办事项
      let filteredContent = summary.content
      if (summary.completedTodos && summary.completedTodos.length > 0) {
        const { filterCompletedTodos } = await import('./todoManager')
        filteredContent = filterCompletedTodos(summary.content, summary.completedTodos)
      }

      bridgeSummaries.push({
        type: 'summary',
        content: `[桥接总结 ${formatSummaryFloorLabel(summary)}] ${filteredContent}`,
        isSummary: true,
        summaryType: 'bridge'
      })
    }
  }

  appendTraceStep(traceId, 'historyBuild', '桥接层构建完成', 'success', {
    bridgeFloors,
    bridgeSummaryCount: bridgeSummaries.length
  })

  // 4. RAG 检索（排除原文层和桥接层楼层的总结）
  let ragSummaries = []
  const ragCandidateCount = olderFloors.length - bridgeFloors.length
  if (ragCandidateCount > 0 && userInput) {
    try {
      const { topK, topN, minVectorScore, minRerankScore, recencyBias, recencyHalfLife } = getEffectiveRAGParams()

      const embeddedSummaries = minorSummaries.filter(
        s => !summaryNeedsEmbeddingRefresh(s) && !summaryIntersectsFloors(s, excludeSet)
      )

      if (embeddedSummaries.length === 0) {
        appendTraceStep(traceId, 'embeddingSearch', '无可用向量候选', 'warning', {
          excludedFloors: [...excludeSet]
        })
      } else {
        const seenQueries = new Set()
        const querySpecs = []
        for (const spec of [
          { query: mainQuery, kind: 'main', weight: 1.0 },
          ...additionalQueries.map(query => ({ query, kind: 'proactive', weight: 0.75 }))
        ]) {
          const normalizedQuery = (spec.query || '').trim()
          if (!normalizedQuery || seenQueries.has(normalizedQuery)) continue
          seenQueries.add(normalizedQuery)
          querySpecs.push({ ...spec, query: normalizedQuery })
        }

        gameStore.updateRagTrace(traceId, {
          searchQueries: querySpecs
        })

        const queryBuckets = []
        for (const spec of querySpecs) {
          const candidates = await searchSimilarSummaries(spec.query, Math.min(topK, embeddedSummaries.length), {
            currentFloor,
            excludeFloors: excludeSet,
            minVectorScore,
            recencyBias,
            recencyHalfLife,
            traceMeta: {
              traceId,
              kind: spec.kind
            }
          })
          if (candidates.length > 0) {
            queryBuckets.push({
              ...spec,
              candidates
            })
          }
        }

        if (queryBuckets.length > 0) {
          const fusedCandidates = weightedReciprocalRankFusion(queryBuckets, Math.min(topK, embeddedSummaries.length))
          gameStore.updateRagTrace(traceId, {
            fusedCandidates: fusedCandidates.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item))
          })
          appendTraceStep(traceId, 'queryFusion', '候选融合完成', 'success', {
            fusedCount: fusedCandidates.length,
            topCandidates: fusedCandidates.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item))
          })

          ragSummaries = await rerankSummaries(mainQuery, fusedCandidates, Math.min(topN, fusedCandidates.length), {
            currentFloor,
            minRerankScore,
            recencyBias,
            recencyHalfLife,
            traceMeta: {
              traceId,
              kind: 'main'
            }
          })
          console.log('[RAG] Retrieved summaries:', ragSummaries.length)
        } else {
          appendTraceStep(traceId, 'embeddingSearch', '所有 Query 都未命中候选', 'warning', {
            queries: querySpecs.map(item => item.query)
          })
        }
      }
    } catch (e) {
      console.warn('[RAG] retrieval failed:', getErrorMessage(e))
      errors.push({ stage: 'ragRetrieval', message: getErrorMessage(e) })
      appendTraceError(traceId, 'ragRetrieval', e)
    }
  }

  // 4.5. 增强召回模式：分析召回结果并补充查询
  if (ragSettings.enhancedRecall && gameStore.settings.assistantAI?.enabled && ragSummaries.length > 0) {
    try {
      // 1. 分析召回结果
      const { pruneIndexes, additionalQueries: enhancedQueries } = await analyzeRecalledSummaries(
        userInput, ragSummaries, gameStore.gameTime, { traceId }
      )

      // 2. 剪枝：移除标记的总结
      if (pruneIndexes.length > 0) {
        console.log('[Enhanced Recall] Pruning item indexes:', pruneIndexes)
        const pruneSet = new Set(pruneIndexes)
        ragSummaries = ragSummaries.filter((item, index) => !pruneSet.has(index + 1))
      }

      // 3. 补充查询：二次检索（支持多个查询）
      if (enhancedQueries && enhancedQueries.length > 0) {
        console.log('[Enhanced Recall] Additional queries:', enhancedQueries)
        const enhancedExcludeSet = new Set([...excludeSet])
        for (const item of ragSummaries) {
          for (const floor of getSummaryCoveredFloors(item.summary)) {
            enhancedExcludeSet.add(floor)
          }
        }

        const { topN } = getEffectiveRAGParams()

        try {
          const enhancedResults = await executeAdditionalQuery(
            enhancedQueries,
            enhancedExcludeSet,
            Math.ceil(topN / 2),
            {
              traceId,
              mainQuery
            }
          )

          if (enhancedResults.length > 0) {
            const summaryKeySet = new Set(ragSummaries.map(item => getSummaryCoverageKey(item.summary)))
            const uniqueAdditional = enhancedResults.filter(
              item => !summaryKeySet.has(getSummaryCoverageKey(item.summary))
            )
            if (uniqueAdditional.length > 0) {
              console.log('[Enhanced Recall] Added summaries:', uniqueAdditional.length)
              ragSummaries.push(...uniqueAdditional)
            }
          }
        } catch (e) {
          console.warn('[Enhanced Recall] Combined query failed:', getErrorMessage(e))
        }
      }
    } catch (e) {
      console.warn('[Enhanced Recall] Enhancement failed, using original results:', getErrorMessage(e))
      errors.push({ stage: 'enhancedRecall', message: getErrorMessage(e) })
      appendTraceError(traceId, 'enhancedRecall', e)
    }
  }

  // 5. 组装结果：[RAG召回] → [桥接总结] → [最近原文]

  if (ragSummaries.length > 0) {
    const sorted = [...ragSummaries].sort((a, b) => getSummaryAnchorFloor(a.summary) - getSummaryAnchorFloor(b.summary))
    for (const item of sorted) {
      const s = item.summary
      // 过滤已完成的待办事项
      let filteredContent = s.content
      if (s.completedTodos && s.completedTodos.length > 0) {
        const { filterCompletedTodos } = await import('./todoManager')
        filteredContent = filterCompletedTodos(s.content, s.completedTodos)
      }

      result.push({
        type: 'summary',
        content: `[RAG召回 ${formatSummaryFloorLabel(s)} | 相关度${(item.score * 100).toFixed(0)}%] ${filteredContent}`,
        isSummary: true,
        summaryType: 'rag'
      })
    }
  }

  result.push(...bridgeSummaries)

  for (const { log } of recentLogs) {
    result.push({
      ...log,
      content: cleanImageTags(log.content)
    })
  }

  const mergedTraceErrors = (() => {
    const combined = [...(getTrace(traceId)?.errors || []), ...errors]
    const seen = new Set()
    return combined.filter(item => {
      const key = `${item.stage}:${item.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  gameStore.finishRagTrace(traceId, {
    totalMs: Date.now() - traceStartedAt,
    status: mergedTraceErrors.length > 0 ? 'warning' : 'success',
    errors: mergedTraceErrors,
    finalSummaries: ragSummaries.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item))
  })

  return { history: result, errors, traceId }
}

/**
 * 检查 RAG 系统是否已完整配置并启用
 * @returns {boolean}
 */
export function isRAGReady() {
  const gameStore = useGameStore()
  const rag = gameStore.settings.ragSystem
  if (!rag?.enabled) return false
  const emb = rag.embedding
  const rer = rag.rerank
  return !!(emb?.apiUrl && emb?.apiKey && emb?.model && rer?.apiUrl && rer?.apiKey && rer?.model)
}
