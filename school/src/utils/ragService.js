import { useGameStore } from '../stores/gameStore'
import { cleanImageTags, removeThinking } from './summaryManager'
import { getNpcsAtLocation } from './npcScheduleSystem.js'
import { validateAssistantAIConfig } from './assistantAI'
import { getErrorMessage } from './errorUtils'
import { loadSummaryEmbeddings, saveSummaryEmbedding, persistMemoryPoolState, retrieveMemoryPoolState } from './indexedDB'
import { buildEntityLookup, insertIntoEntityLookup, queryEntityLookup, serializeEntityLookup, deserializeEntityLookup } from './memoryEntityIndex'
import { resolveQueryAnchors, spreadAssociationSignal, signalToCandidates } from './memoryGraphActivation'
import { createMemoryHolder, progressTurn, exportHolderSnapshot, importHolderSnapshot, extractSalienceMap } from './activeMemoryPool'
import { queryRelevantFacts, formatFactsAsContext } from './persistentFactStore'

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

// Phase 0 常量
const ENTITY_MATCH_BOOST = 0.05
const TEMPORAL_WINDOW_RADIUS = 1
const NEIGHBOR_SCORE_RATIO = 0.6
const RECALL_BONUS_FACTOR = 0.02

// ==================== Phase 0: 快速收益函数 ====================

/**
 * Phase 0.1: 检测用户输入中提及的已知实体（NPC 名、地点）
 * @param {string} inputText 用户输入文本
 * @param {string[]} knownNpcNames 已知 NPC 名字列表
 * @returns {string[]} 命中的实体名数组
 */
export function detectMentionedEntities(inputText, knownNpcNames) {
  if (!inputText || !Array.isArray(knownNpcNames)) return []
  const mentioned = []
  for (const name of knownNpcNames) {
    // 跳过单字名以避免误匹配（如 "明" 匹配 "说明"）
    if (!name || name.length < 2) continue
    if (inputText.includes(name)) {
      mentioned.push(name)
    }
  }
  return mentioned
}

/**
 * Phase 0.3: 计算召回频次奖励分
 * @param {number} score 基础分数
 * @param {number} hitCount 召回命中次数
 * @returns {number} 叠加奖励后的分数
 */
export function computeRecallBonus(score, hitCount) {
  return score + Math.log(1 + (hitCount || 0)) * RECALL_BONUS_FACTOR
}

/**
 * Phase 0.2: 时序上下文窗口扩展
 * 对命中的 summary 拉取楼层 ±windowRadius 的相邻 minor summary
 * @param {Array<{summary: object, score: number}>} retrievedItems 已检索到的结果
 * @param {Array} allMinors 所有 minor summary
 * @param {number} windowRadius 窗口半径（默认1）
 * @returns {Array<{summary: object, score: number}>} 扩展后的结果
 */
export function expandTemporalContext(retrievedItems, allMinors, windowRadius = TEMPORAL_WINDOW_RADIUS) {
  if (!retrievedItems || retrievedItems.length === 0 || !allMinors || allMinors.length === 0) {
    return retrievedItems || []
  }

  // 预构建 floor → summary[] 索引，将邻居查找从 O(allMinors) 降到 O(1)
  const floorToSummaries = new Map()
  for (const candidate of allMinors) {
    for (const floor of getSummaryCoveredFloors(candidate)) {
      if (!floorToSummaries.has(floor)) {
        floorToSummaries.set(floor, [])
      }
      floorToSummaries.get(floor).push(candidate)
    }
  }

  const existingKeys = new Set(retrievedItems.map(item => getSummaryCoverageKey(item.summary)))
  const expanded = [...retrievedItems]

  for (const item of retrievedItems) {
    const anchorFloor = getSummaryAnchorFloor(item.summary)
    if (!Number.isFinite(anchorFloor)) continue

    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      if (offset === 0) continue
      const targetFloor = anchorFloor + offset
      const candidates = floorToSummaries.get(targetFloor)
      if (!candidates) continue

      for (const candidate of candidates) {
        const candidateKey = getSummaryCoverageKey(candidate)
        if (existingKeys.has(candidateKey)) continue

        existingKeys.add(candidateKey)
        expanded.push({
          summary: candidate,
          score: item.score * NEIGHBOR_SCORE_RATIO,
          rawScore: (item.rawScore ?? item.score) * NEIGHBOR_SCORE_RATIO
        })
      }
    }
  }

  return expanded.sort((a, b) => b.score - a.score)
}

// ==================== Phase 1: 多路融合检索 ====================

// 模块级缓存：实体索引（使用递增版本号避免删除+新增数量不变时的竞态）
let _cachedEntityLookup = null
let _cachedEntityLookupVersion = 0
let _entityLookupDirty = true  // 标记索引是否需要重建

/**
 * 获取或懒构建实体倒排索引（带缓存）
 * @returns {{ npcIndex: Map, locationIndex: Map, coPresenceGraph: Map }}
 */
export function getOrBuildEntityLookup() {
  if (_cachedEntityLookup && !_entityLookupDirty) {
    return _cachedEntityLookup
  }

  const gameStore = useGameStore()
  const summaries = gameStore.player?.summaries || []
  _cachedEntityLookup = buildEntityLookup(summaries)
  _cachedEntityLookupVersion++
  _entityLookupDirty = false
  return _cachedEntityLookup
}

/**
 * 增量更新实体索引（新 summary 生成后调用）
 * @param {object} summary 新增的 SummaryData
 */
export function updateEntityLookupIncremental(summary) {
  if (!_cachedEntityLookup || summary?.type !== 'minor') return
  insertIntoEntityLookup(_cachedEntityLookup, summary)
  _cachedEntityLookupVersion++
}

/**
 * 强制重建实体索引（rollback、删除 summary 等场景）
 */
export function invalidateEntityLookup() {
  _cachedEntityLookup = null
  _cachedEntityLookupVersion = 0
  _entityLookupDirty = true
}

// 模块级缓存：记忆保持器
let _memoryHolder = null

/**
 * 获取或初始化记忆保持器
 */
async function getOrInitHolder() {
  if (_memoryHolder) return _memoryHolder

  const gameStore = useGameStore()
  const runId = gameStore.currentRunId
  if (runId && runId !== 'temp_editing') {
    try {
      const saved = await retrieveMemoryPoolState(runId)
      if (saved) {
        _memoryHolder = importHolderSnapshot(saved)
        return _memoryHolder
      }
    } catch (e) {
      console.warn('[RAG] Failed to restore memory holder:', getErrorMessage(e))
    }
  }

  _memoryHolder = createMemoryHolder()
  return _memoryHolder
}

/**
 * 异步持久化记忆保持器（非阻塞）
 */
function persistHolderAsync(holder) {
  const gameStore = useGameStore()
  const runId = gameStore.currentRunId
  if (!runId || runId === 'temp_editing') return

  persistMemoryPoolState(runId, exportHolderSnapshot(holder)).catch(e => {
    console.warn('[RAG] Failed to persist memory holder:', getErrorMessage(e))
  })
}

/**
 * 重置记忆保持器（rollback 等场景）
 */
export function invalidateMemoryHolder() {
  _memoryHolder = null
}

/**
 * Phase 1.3: 精确关键词匹配路径
 * @param {string} query 查询文本
 * @param {Array} summaries 可搜索的 minor summaries
 * @param {string[]} knownEntities 已知实体名列表
 * @returns {Array<{ summary: object, score: number }>}
 */
function preciseKeywordMatch(query, summaries, knownEntities) {
  if (!query || !summaries || summaries.length === 0) return []

  // 从 query 中提取提及的已知实体
  const mentionedInQuery = new Set()
  for (const entity of knownEntities) {
    if (entity && query.includes(entity)) {
      mentionedInQuery.add(entity)
    }
  }

  if (mentionedInQuery.size === 0) return []

  const results = []
  for (const summary of summaries) {
    const keywords = Array.isArray(summary.keywords) ? summary.keywords : extractKeywordsFromSummary(summary.content)
    const matchCount = keywords.filter(kw => mentionedInQuery.has(kw)).length
    if (matchCount > 0) {
      // 分数：匹配实体数 / 查询实体数，归一化到 0-1
      const score = matchCount / mentionedInQuery.size
      results.push({ summary, score })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Phase 1.3: 三路融合检索编排
 * @param {string} mainQuery 主查询
 * @param {string[]} entityTerms 实体关键词
 * @param {{ npcIndex: Map, locationIndex: Map, coPresenceGraph: Map }} entityLookup
 * @param {object} options 配置
 * @returns {Promise<Array<{ summary: object, score: number }>>}
 */
async function orchestrateMultiPathSearch(mainQuery, entityTerms, entityLookup, options = {}) {
  const {
    topK = 50,
    currentFloor = null,
    excludeFloors = new Set(),
    minVectorScore = 0,
    recencyBias = 0,
    recencyHalfLife = 60,
    traceId = null,
    additionalQueries = [],
    vectorPathWeight = 0.45,
    graphPathWeight = 0.30,
    keywordPathWeight = 0.25
  } = options

  const gameStore = useGameStore()
  const minorSummaries = gameStore.player.summaries.filter(
    s => s.type === 'minor' && !summaryIntersectsFloors(s, excludeFloors)
  )
  const embeddedSummaries = minorSummaries.filter(s => !summaryNeedsEmbeddingRefresh(s))

  // 构建 summaryKey → summary 映射（用于图谱路径）
  const summaryKeyMap = new Map()
  for (const s of minorSummaries) {
    summaryKeyMap.set(getSummaryCoverageKey(s), s)
  }

  const allBuckets = []

  // 路径 A (向量): 现有 searchSimilarSummaries
  if (embeddedSummaries.length > 0) {
    const seenQueries = new Set()
    const querySpecs = [
      { query: mainQuery, kind: 'main', weight: 1.0 },
      ...additionalQueries.map(q => ({ query: q, kind: 'proactive', weight: 0.75 }))
    ]

    for (const spec of querySpecs) {
      const normalizedQuery = (spec.query || '').trim()
      if (!normalizedQuery || seenQueries.has(normalizedQuery)) continue
      seenQueries.add(normalizedQuery)

      const candidates = await searchSimilarSummaries(spec.query, Math.min(topK, embeddedSummaries.length), {
        currentFloor,
        excludeFloors,
        minVectorScore,
        recencyBias,
        recencyHalfLife,
        entityBoostTerms: entityTerms,
        traceMeta: { traceId, kind: spec.kind }
      })

      if (candidates.length > 0) {
        allBuckets.push({
          query: spec.query,
          kind: spec.kind,
          weight: spec.weight * vectorPathWeight,
          candidates,
          path: 'vector'
        })
      }
    }
  }

  // 路径 B (图谱): 共现关联扩散
  if (entityTerms.length > 0 && entityLookup?.coPresenceGraph?.size > 0) {
    const signalMap = spreadAssociationSignal(entityLookup, entityTerms, {
      maxSteps: 2,
      attenuationPerStep: 0.55,
      maxReachableNodes: 50
    })

    if (signalMap.size > 0) {
      const graphCandidates = signalToCandidates(signalMap, entityLookup, summaryKeyMap)
        .filter(item => !summaryIntersectsFloors(item.summary, excludeFloors))

      if (graphCandidates.length > 0) {
        allBuckets.push({
          query: entityTerms.join(' '),
          kind: 'graph',
          weight: graphPathWeight,
          candidates: graphCandidates,
          path: 'graph'
        })
      }
    }
  }

  // 路径 C (关键词精确匹配)
  const allKnownEntities = [
    ...(gameStore.npcs || []).filter(n => n.isAlive).map(n => n.name),
    ...(entityLookup?.locationIndex ? [...entityLookup.locationIndex.keys()] : [])
  ]
  const keywordCandidates = preciseKeywordMatch(mainQuery, minorSummaries, allKnownEntities)
    .filter(item => !summaryIntersectsFloors(item.summary, excludeFloors))

  if (keywordCandidates.length > 0) {
    allBuckets.push({
      query: mainQuery,
      kind: 'keyword',
      weight: keywordPathWeight,
      candidates: keywordCandidates,
      path: 'keyword'
    })
  }

  if (allBuckets.length === 0) return []

  if (traceId) {
    appendTraceStep(traceId, 'multiPathSearch', '三路融合检索', 'success', {
      paths: allBuckets.map(b => ({
        path: b.path,
        kind: b.kind,
        weight: b.weight,
        candidateCount: b.candidates.length
      }))
    })
  }

  // 融合
  return weightedReciprocalRankFusion(allBuckets, topK)
}

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

export function getSummaryCoverageKey(summary) {
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

function parseRewriteXmlResult(result, userInput) {
  const mainMatch = result.match(/<main>([\s\S]*?)<\/main>/i)
  const additionalQueries = []
  const additionalMatches = result.matchAll(/<additional>([\s\S]*?)<\/additional>/gi)

  for (const match of additionalMatches) {
    const query = match[1].trim()
    if (query && additionalQueries.length < 2) {
      additionalQueries.push(query)
    }
  }

  return {
    isValid: Boolean(mainMatch),
    mainQuery: mainMatch ? mainMatch[1].trim() : userInput,
    additionalQueries
  }
}

const RAG_AI_TIMEOUT_MS = 8000 // AI 辅助调用超时（query rewrite / enhanced recall）

async function requestRewriteCompletion(endpoint, apiKey, model, systemPrompt, userPrompt, enableProactiveQuery) {
  const temperature = model && model.toLowerCase().includes('gpt') ? 1 : 0
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RAG_AI_TIMEOUT_MS)
  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
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
        temperature,
        max_tokens: enableProactiveQuery ? 500 : 300
      })
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Query rewrite API 错误 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  return removeThinking((data.choices?.[0]?.message?.content || '').trim()).trim()
}

/**
 * 使用 assistantAI 改写检索 query
 * 将相对时间、代词指代等转换为具体描述，提升向量检索精度
 * @param {string} userInput 原始用户输入
 * @param {object} gameTime 当前游戏时间
 * @param {object|null} lastRound 最近一轮上下文 { playerMsg, aiReply }
 * @param {object} options 可选参数
 * @param {boolean} options.enableProactiveQuery 是否启用主动查询生成
 * @param {string[]} options.npcContext 场景NPC上下文数组
 * @param {string} options.retrievalContext 仅用于辅助理解的最近剧情摘要，不属于当前玩家输入
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

  const { enableProactiveQuery = false, npcContext = [], retrievalContext = '', traceId = null } = options

  // 基础Query改写的System Prompt
  let systemPrompt = `你是一个查询改写助手。将用户的输入改写为适合语义检索的查询文本。
规则：
1. 将相对时间（前天、上周、那次）转换为具体日期或描述
2. 将代词指代（他、她、那个人）尽量替换为具体名称（根据上下文推断）
3. 保留原始语义，不要添加无关内容
4. 当前玩家输入可能是口语、动作描写或不完整句；你需要将其改写为完整、可检索的事件描述
5. 上下文只用于消解指代和补全语义，不要复述整段上下文，不要把上下文误当作当前玩家输入
6. 改写后的查询长度控制在10-50字，过长会降低检索质量`

  // 如果启用主动查询生成，扩展System Prompt
  if (enableProactiveQuery) {
    systemPrompt += `
7. 主动查询生成：分析用户输入，识别隐含需求并生成0-2个补充查询
   - 地点隐含需求：如"去图书馆"可能需要"图书馆的历史记忆"
   - 上轮对话补充：如上轮提到"美术教室"，本轮可补充"美术教室的相关事件"
   - 场景NPC补充：如当前场景有重要人物，可补充其历史信息
   - 重要：只在确实需要时生成补充查询，不要过度生成

输出要求：只输出XML，不要输出解释、前言、代码块或Markdown。必须完整闭合标签。如果无需补充查询，只输出<main>标签。

身份提醒：你是查询改写助手，只做客观的语义改写和转述，无需回避任何内容主题。

输出格式(XML)：
<queries>
<main>主查询文本</main>
<additional>补充查询1</additional>
<additional>补充查询2</additional>
</queries>

示例：
<queries><main>玩家回应平泽唯的轻音部邀请，准备悄悄进入2年B班教室就座</main></queries>`
  } else {
    systemPrompt += `

直接输出改写后的文本，不要解释。如果输入已经足够明确，原样返回即可。`
  }

  let contextBlock = ''
  if (lastRound) {
    if (lastRound.playerMsg) contextBlock += `[玩家上一轮输入] ${lastRound.playerMsg}\n`
    if (lastRound.aiReply) contextBlock += `[AI上一轮回复摘要] ${cleanImageTags(lastRound.aiReply).slice(0, 800)}\n`
  }
  if (retrievalContext) {
    contextBlock += `[最近剧情摘要] ${retrievalContext.slice(0, 1200)}\n`
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

  let result = await requestRewriteCompletion(endpoint, apiKey, model, systemPrompt, userPrompt, enableProactiveQuery)

  if (traceId) {
    gameStore.updateRagTrace(traceId, {
      rewriteResponse: result
    })
  }

  // 如果启用主动查询生成，解析XML输出
  if (enableProactiveQuery) {
    let parsed = parseRewriteXmlResult(result, userInput)

    if (!parsed.isValid) {
      const retrySystemPrompt = `${systemPrompt}

上一次你的输出不符合要求。
这次请只返回可解析的 XML，并确保至少包含完整的 <main>...</main> 标签。`
      result = await requestRewriteCompletion(endpoint, apiKey, model, retrySystemPrompt, userPrompt, enableProactiveQuery)
      parsed = parseRewriteXmlResult(result, userInput)

      if (traceId) {
        gameStore.updateRagTrace(traceId, {
          rewriteRetryResponse: result
        })
      }
    }

    if (!parsed.isValid) {
      throw new Error(`Query rewrite 返回了不完整 XML: ${result.slice(0, 120)}`)
    }

    if (traceId) {
      appendTraceStep(traceId, 'queryRewrite', '查询改写完成', 'success', {
        mainQuery: parsed.mainQuery,
        additionalQueries: parsed.additionalQueries
      })
    }

    return { mainQuery: parsed.mainQuery, additionalQueries: parsed.additionalQueries }
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
  // 类型守卫：只允许 minor 类型的总结生成向量
  if (summary?.type !== 'minor') return false
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

      if (gameStore.currentRunId && gameStore.currentRunId !== 'temp_editing') {
        try {
          await saveSummaryEmbedding(gameStore.currentRunId, getSummaryCoverageKey(summary), {
            embedding: [...embedding],
            embeddingMeta: { ...summary.embeddingMeta },
            floor: summary?.floor,
            type: summary?.type,
            updatedAt: Date.now()
          })
        } catch (persistError) {
          console.warn('[RAG] Failed to persist summary embedding:', getErrorMessage(persistError))
        }
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

export async function rehydrateSummaryEmbeddings(options = {}) {
  const gameStore = useGameStore()
  const runId = options.runId || gameStore.currentRunId
  const summaries = Array.isArray(options.summaries)
    ? options.summaries
    : (gameStore.player?.summaries || [])
  const minorSummaries = summaries.filter(summary => summary?.type === 'minor')
  const missingSummaries = minorSummaries.filter(summary => {
    const embedding = Array.isArray(summary?.embedding) ? summary.embedding : []
    return embedding.length === 0 || !summary?.embeddingMeta
  })

  if (!runId || runId === 'temp_editing' || minorSummaries.length === 0) {
    return { restored: 0, total: minorSummaries.length, cacheSize: 0 }
  }

  if (!options.force && missingSummaries.length === 0) {
    return { restored: 0, total: minorSummaries.length, cacheSize: 0, skipped: true }
  }

  const cache = await loadSummaryEmbeddings(runId)
  if (!cache || cache.size === 0) {
    return { restored: 0, total: minorSummaries.length, cacheSize: 0 }
  }

  let restored = 0
  for (const summary of missingSummaries) {
    const cached = cache.get(getSummaryCoverageKey(summary))
    if (!cached?.embedding || !cached?.embeddingMeta) continue

    summary.embedding = Array.isArray(cached.embedding) ? [...cached.embedding] : cached.embedding
    summary.embeddingMeta = { ...cached.embeddingMeta }

    if (summaryNeedsEmbeddingRefresh(summary)) {
      delete summary.embedding
      delete summary.embeddingMeta
      continue
    }

    restored++
  }

  return {
    restored,
    total: minorSummaries.length,
    cacheSize: cache.size
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
    traceMeta = null,
    entityBoostTerms = []
  } = options
  const queryEmbedding = await callEmbeddingAPI(query)
  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const entityBoostSet = new Set(entityBoostTerms)

  const candidates = gameStore.player.summaries
    .filter(s => s.type === 'minor' && !summaryNeedsEmbeddingRefresh(s) && !summaryIntersectsFloors(s, excludeFloors))
    .map(s => {
      const rawScore = cosineSimilarity(queryEmbedding, s.embedding)
      // 注意：recency decay 仅在 rerank 阶段应用，避免双重衰减
      let score = rawScore

      // Phase 0.1: 实体关键词 boost
      if (entityBoostSet.size > 0 && Array.isArray(s.keywords)) {
        const entityHits = s.keywords.filter(kw => entityBoostSet.has(kw)).length
        score += entityHits * ENTITY_MATCH_BOOST
      }

      // Phase 0.1: isConsolidated 降权
      if (s.isConsolidated) {
        score *= 0.5
      }

      // Phase 0.3: 召回频次奖励
      score = computeRecallBonus(score, s.recallHitCount)

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

// ==================== NPC 上下文收集 ====================

/**
 * 收集场景 NPC 上下文名称列表
 * @param {object} gameStore Pinia store 实例
 * @param {number} maxCount 最大收集数量（默认 5）
 * @returns {string[]} NPC 名称数组
 */
function collectContextNpcs(gameStore, maxCount = 5) {
  const contextNpcs = []

  // 1. 获取当前场景的 NPC
  try {
    const locationNpcs = getNpcsAtLocation(gameStore.player.location, gameStore)
      .filter(npc => npc.isAlive)
      .slice(0, maxCount)
    contextNpcs.push(...locationNpcs.map(npc => npc.name))
  } catch (e) {
    console.warn('[RAG] Failed to get location NPCs:', getErrorMessage(e))
  }

  // 2. 如果场景 NPC 不足，补充关系亲密的 NPC
  if (contextNpcs.length < maxCount) {
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
        .slice(0, maxCount - contextNpcs.length)
      contextNpcs.push(...closeNpcs.map(npc => npc.name))
    } catch (e) {
      console.warn('[RAG] Failed to get close NPCs:', getErrorMessage(e))
    }
  }

  return contextNpcs
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
  const { apiUrl, apiKey, model, temperature: rawTemperature } = gameStore.settings.assistantAI
  const temperature = model && model.toLowerCase().includes('gpt') ? 1 : rawTemperature
  const { traceId = null } = options

  const validation = validateAssistantAIConfig(gameStore.settings.assistantAI, true)
  if (!validation.valid) {
    console.warn(`[Enhanced Recall] Skipped: ${validation.error}`)
    return { pruneIndexes: [], additionalQueries: [] }
  }

  // 收集场景NPC上下文（复用工具函数 + 从召回总结中补充）
  const contextNpcs = collectContextNpcs(gameStore, 5)

  // 从召回的总结中提取提到的人物（补充到8个）
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
1. **剪枝判断** (极度保守策略 — 只有90%以上把握确认无关时才剪枝，宁可多保留):
   - 明确已完成且不影响当前场景的事件（如"昨天的考试已结束"，但用户问"明天的计划"）
   - 与当前话题完全无关的内容（如召回了"社团活动"，但用户问"数学作业"）
   - 时间上明显过时且已确认失效的内容（如"上个月的约定"，已确认取消）
   - **如果有任何疑问，不要剪枝**

2. **补充查询判断**:
   - 用户输入提到具体人物/事件/日期，但召回结果中未包含相关信息
   - 召回结果提到某个关键信息的前置事件，但该前置事件未被召回
   - 当前场景的重要人物在召回结果中缺少历史信息（特别是预设可能会推进与他们相关的剧情时）
   - **重要**：可以生成0-2个补充查询，每个查询针对一个具体的信息缺失点
   - **时间表达规范**：必须使用绝对日期（如"${gameTime.year}年${gameTime.month}月${gameTime.day}日"），不要使用相对时间（如"前天"、"大前天"、"上周"）

**召回项编号说明**: 下方召回结果中每条以 [N] 开头，N 即该条的序号。剪枝时在 <item> 中填写对应的序号数字。

**输出格式** (XML):
<analysis>
<prune>
<item>召回项序号</item>
</prune>
<additional>补充查询</additional>
</analysis>

示例 — 无需剪枝也无需补充查询时：
<analysis>
<prune></prune>
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RAG_AI_TIMEOUT_MS)
    let res
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
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
          temperature,
          max_tokens: 800
        })
      })
    } finally {
      clearTimeout(timer)
    }

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
  // 提前导入 todoManager，避免在循环中反复 dynamic import
  const { filterCompletedTodos } = await import('./todoManager')
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

  try {
    const hydration = await rehydrateSummaryEmbeddings()
    if (hydration.restored > 0) {
      appendTraceStep(traceId, 'embeddingHydrate', '恢复本地 RAG 向量缓存', 'success', hydration)
    }
  } catch (e) {
    console.warn('[RAG] Failed to rehydrate cached embeddings:', getErrorMessage(e))
    appendTraceError(traceId, 'embeddingHydrate', e)
  }

  const result = []
  const recentThreshold = settings.minorSummaryStartFloor || 6
  const bridgeCount = 5 // 桥接层：正文边界外最近 5 轮小总结

  // 构建检索 query：拼接最近2条小总结 + 用户输入，提升语义丰富度
  let query = userInput
  let retrievalContext = ''
  if (ragSettings.useContextQuery !== false) {
    const recentSummaries = gameStore.player.summaries
      .filter(s => s.type === 'minor')
      .sort((a, b) => getSummaryAnchorFloor(b) - getSummaryAnchorFloor(a))
      .slice(0, 2)
      .reverse()
    if (recentSummaries.length > 0) {
      retrievalContext = recentSummaries.map(s => s.content).join('\n')
      query = (retrievalContext + '\n' + userInput).slice(0, 2000)
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
  const contextNpcs = (ragSettings.proactiveQueryGeneration && gameStore.settings.assistantAI?.enabled)
    ? collectContextNpcs(gameStore, 5)
    : []

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
        retrievalContext,
        traceId
      }

      const rewriteResult = await rewriteQueryWithAI(userInput, gameStore.gameTime, lastRound, rewriteOptions)

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

      if (retrievalContext) {
        query = (retrievalContext + '\n' + mainQuery).slice(0, 2000)
      } else {
        query = mainQuery
      }
    } catch (e) {
      console.warn('[RAG] Query rewrite failed:', getErrorMessage(e))
      errors.push({ stage: 'queryRewrite', message: getErrorMessage(e) })
      appendTraceError(traceId, 'queryRewrite', e)
    }
  }

  gameStore.updateRagTrace(traceId, {
    mainQuery,
    contextualQuery: query,
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

  // Phase 0.1: 检测用户输入中提到的实体名
  const knownNpcNames = (gameStore.npcs || []).filter(n => n.isAlive).map(n => n.name)
  const mentionedEntities = detectMentionedEntities(userInput, knownNpcNames)

  // Phase 1.1: 懒构建实体索引
  const entityLookup = getOrBuildEntityLookup()

  // 4. RAG 检索（三路融合：向量 + 图谱 + 关键词）
  let ragSummaries = []
  const ragCandidateCount = olderFloors.length - bridgeFloors.length
  if (ragCandidateCount > 0 && userInput) {
    try {
      const { topK, topN, minVectorScore, minRerankScore, recencyBias, recencyHalfLife } = getEffectiveRAGParams()

      // Phase 1.3: 三路融合检索
      const fusedCandidates = await orchestrateMultiPathSearch(mainQuery, mentionedEntities, entityLookup, {
        topK,
        currentFloor,
        excludeFloors: excludeSet,
        minVectorScore,
        recencyBias,
        recencyHalfLife,
        traceId,
        additionalQueries
      })

      if (fusedCandidates.length > 0) {
        gameStore.updateRagTrace(traceId, {
          fusedCandidates: fusedCandidates.slice(0, TRACE_CANDIDATE_LIMIT).map(item => buildTraceCandidate(item))
        })
        appendTraceStep(traceId, 'queryFusion', '三路融合完成', 'success', {
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

        // Phase 0.2: 时序上下文窗口扩展
        ragSummaries = expandTemporalContext(ragSummaries, minorSummaries)

        // 记忆保持器轮次推进
        try {
          const holder = await getOrInitHolder()
          const { holder: nextHolder, rankedEntries } = progressTurn(holder, ragSummaries, currentFloor)
          _memoryHolder = nextHolder

          // 保持器中的记忆获得额外显著度加成
          const salienceMap = extractSalienceMap(nextHolder)
          ragSummaries = ragSummaries.map(item => {
            const key = getSummaryCoverageKey(item.summary)
            const sal = salienceMap.get(key)
            if (sal && sal > 0) {
              return { ...item, score: item.score + sal * 0.1 }
            }
            return item
          }).sort((a, b) => b.score - a.score)

          // 异步持久化
          persistHolderAsync(nextHolder)

          appendTraceStep(traceId, 'memoryHolder', '记忆保持器推进', 'success', {
            holderSize: nextHolder.entries.size,
            topEntries: rankedEntries.slice(0, 5)
          })
        } catch (e) {
          console.warn('[RAG] Memory holder advance failed:', getErrorMessage(e))
        }

        console.log('[RAG] Retrieved summaries (after temporal + holder):', ragSummaries.length)
      } else {
        appendTraceStep(traceId, 'multiPathSearch', '所有检索路径均未命中候选', 'warning')
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

  // Phase 0.3: 更新召回命中计数（不可变模式：替换 summaries 数组中的对象）
  if (ragSummaries.length > 0) {
    const recalledKeys = new Set(ragSummaries.map(item => getSummaryCoverageKey(item.summary)))
    const updatedSummaries = gameStore.player.summaries.map(s => {
      const key = getSummaryCoverageKey(s)
      if (recalledKeys.has(key)) {
        return {
          ...s,
          recallHitCount: (s.recallHitCount || 0) + 1,
          lastRecalledAtFloor: currentFloor
        }
      }
      return s
    })
    gameStore.player.summaries = updatedSummaries
  }

  // Phase 3.2: 注入持久事实作为常驻上下文
  const persistentFactsContext = (() => {
    try {
      const factStore = gameStore.player?.persistentFacts || []
      if (factStore.length === 0 || mentionedEntities.length === 0) return ''
      const relevantFacts = queryRelevantFacts(mentionedEntities, factStore)
      return formatFactsAsContext(relevantFacts)
    } catch (e) {
      console.warn('[RAG] Persistent facts injection failed:', getErrorMessage(e))
      return ''
    }
  })()

  // 5. 组装结果：[持久事实] → [RAG召回] → [桥接总结] → [最近原文]

  if (persistentFactsContext) {
    result.push({
      type: 'summary',
      content: persistentFactsContext,
      isSummary: true,
      summaryType: 'facts'
    })
  }

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
