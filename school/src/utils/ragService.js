import { useGameStore } from '../stores/gameStore'
import { cleanImageTags, removeThinking } from './summaryManager'

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

// ==================== Query 改写 ====================

/**
 * 使用 assistantAI 改写检索 query
 * 将相对时间、代词指代等转换为具体描述，提升向量检索精度
 * @param {string} userInput 原始用户输入
 * @param {object} gameTime 当前游戏时间
 * @param {object|null} lastRound 最近一轮上下文 { playerMsg, aiReply }
 * @returns {Promise<string>} 改写后的 query
 */
export async function rewriteQueryWithAI(userInput, gameTime, lastRound) {
  const gameStore = useGameStore()
  const { apiUrl, apiKey, model } = gameStore.settings.assistantAI
  if (!apiUrl || !apiKey) return userInput

  const systemPrompt = `你是一个查询改写助手。将用户的输入改写为适合语义检索的查询文本。
规则：
1. 将相对时间（前天、上周、那次）转换为具体日期或描述
2. 将代词指代（他、她、那个人）尽量替换为具体名称（根据上下文推断）
3. 保留原始语义，不要添加无关内容
4. 直接输出改写后的文本，不要解释
5. 如果输入已经足够明确，原样返回即可`

  let contextBlock = ''
  if (lastRound) {
    if (lastRound.playerMsg) contextBlock += `[玩家上一轮输入] ${lastRound.playerMsg}\n`
    if (lastRound.aiReply) contextBlock += `[AI上一轮回复摘要] ${cleanImageTags(lastRound.aiReply).slice(0, 800)}\n`
  }

  const userPrompt = `当前游戏时间：${gameTime.year}年${gameTime.month}月${gameTime.day}日 ${gameTime.hour}:${String(gameTime.minute).padStart(2, '0')}
${contextBlock}
[当前玩家输入] ${userInput}

请将当前玩家输入改写为适合语义检索的查询文本：`

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
      max_tokens: 300
    })
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Query rewrite API 错误 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  let result = (data.choices?.[0]?.message?.content || '').trim()
  result = removeThinking(result).trim()
  return result || userInput
}

// ==================== 向量生成与存储 ====================

/**
 * 为单个总结生成并存储向量
 * @param {object} summary SummaryData 对象（引用，会直接修改 embedding 字段）
 * @returns {Promise<boolean>} 是否成功
 */
export async function embedSummary(summary) {
  try {
    const embedding = await callEmbeddingAPI(summary.content)
    if (embedding && embedding.length > 0) {
      summary.embedding = embedding
      return true
    }
    return false
  } catch (e) {
    console.warn('[RAG] embedSummary failed:', e.message)
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
    s => s.type === 'minor' && !s.embedding
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

/**
 * 获取生效的 RAG 参数（自动调整 or 手动设置）
 * @returns {{ topK: number, topN: number }}
 */
export function getEffectiveRAGParams() {
  const gameStore = useGameStore()
  const ragSettings = gameStore.settings.ragSystem
  if (ragSettings.autoAdjust) {
    const summaryCount = gameStore.player.summaries.filter(
      s => s.type === 'minor' && s.embedding && s.embedding.length > 0
    ).length
    return calcAutoRAGParams(summaryCount)
  }
  return { topK: ragSettings.topK || 50, topN: ragSettings.rerankTopN || 15 }
}

// ==================== 检索与重排序 ====================

/**
 * 向量检索：从所有已向量化的 minor 总结中找出最相似的 topK 个
 * @param {string} query 查询文本
 * @param {number} topK 返回数量
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function searchSimilarSummaries(query, topK) {
  const gameStore = useGameStore()
  const queryEmbedding = await callEmbeddingAPI(query)
  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const candidates = gameStore.player.summaries
    .filter(s => s.type === 'minor' && s.embedding && s.embedding.length > 0)
    .map(s => ({
      summary: s,
      score: cosineSimilarity(queryEmbedding, s.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return candidates
}

/**
 * Rerank 重排序：对候选总结进行精排
 * @param {string} query 查询文本
 * @param {Array<{summary: object, score: number}>} candidates 候选列表
 * @param {number} topN 保留数量
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function rerankSummaries(query, candidates, topN) {
  if (candidates.length === 0) return []
  try {
    const documents = candidates.map(c => c.summary.content)
    const results = await callRerankAPI(query, documents, topN)
    // 按 relevance_score 排序，映射回原始 summary
    return results
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
      .slice(0, topN)
      .map(r => ({
        summary: candidates[r.index].summary,
        score: r.relevance_score || 0
      }))
  } catch (e) {
    console.warn('[RAG] Rerank failed, falling back to embedding order:', e.message)
    return candidates.slice(0, topN)
  }
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

  if (!chatLog || chatLog.length === 0) return { history: chatLog, errors }

  const result = []
  const recentThreshold = settings.minorSummaryStartFloor || 6
  const bridgeCount = 5 // 桥接层：正文边界外最近 5 轮小总结

  // 构建检索 query：拼接最近2条小总结 + 用户输入，提升语义丰富度
  let query = userInput
  if (ragSettings.useContextQuery !== false) {
    const recentSummaries = gameStore.player.summaries
      .filter(s => s.type === 'minor')
      .sort((a, b) => b.floor - a.floor)
      .slice(0, 2)
      .reverse()
    if (recentSummaries.length > 0) {
      const summaryContext = recentSummaries.map(s => s.content).join('\n')
      query = (summaryContext + '\n' + userInput).slice(0, 2000)
    }
  }

  // Query 改写：使用 assistantAI 解析相对时间/代词指代
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
      query = await rewriteQueryWithAI(query, gameStore.gameTime, lastRound)
    } catch (e) {
      console.warn('[RAG] Query rewrite failed:', e.message)
      errors.push({ stage: 'queryRewrite', message: e.message })
    }
  }

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

  // 3. 桥接层：查找对应小总结，按楼层升序注入
  const bridgeSummaries = []
  for (const floor of [...bridgeFloors].sort((a, b) => a - b)) {
    const summary = gameStore.player.summaries.find(
      s => s.type === 'minor' && s.floor === floor
    )
    if (summary) {
      bridgeSummaries.push({
        type: 'summary',
        content: `[桥接总结 楼层${floor}] ${summary.content}`,
        isSummary: true,
        summaryType: 'bridge'
      })
    }
  }

  // 4. RAG 检索（排除原文层和桥接层楼层的总结）
  let ragSummaries = []
  const ragCandidateCount = olderFloors.length - bridgeFloors.length
  if (ragCandidateCount > 0 && userInput) {
    try {
      const { topK, topN } = getEffectiveRAGParams()

      const embeddedSummaries = gameStore.player.summaries.filter(
        s => s.type === 'minor' && s.embedding && s.embedding.length > 0 && !excludeSet.has(s.floor)
      )
      if (embeddedSummaries.length <= topN) {
        ragSummaries = embeddedSummaries.map(s => ({ summary: s, score: 1 }))
      } else {
        const candidates = await searchSimilarSummaries(query, topK)
        const filtered = candidates.filter(c => !excludeSet.has(c.summary.floor))
        if (filtered.length > 0) {
          ragSummaries = await rerankSummaries(query, filtered, topN)
        }
      }
    } catch (e) {
      console.warn('[RAG] retrieval failed:', e.message)
      errors.push({ stage: 'ragRetrieval', message: e.message })
    }
  }

  // 5. 组装结果：[RAG召回] → [桥接总结] → [最近原文]

  if (ragSummaries.length > 0) {
    const sorted = ragSummaries.sort((a, b) => a.summary.floor - b.summary.floor)
    for (const item of sorted) {
      const s = item.summary
      result.push({
        type: 'summary',
        content: `[RAG召回 楼层${s.floor} | 相关度${(item.score * 100).toFixed(0)}%] ${s.content}`,
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

  return { history: result, errors }
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
