import { useGameStore } from '../stores/gameStore'
import { cleanImageTags, removeThinking } from './summaryManager'
import { getNpcsAtLocation } from './npcScheduleSystem.js'

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

// ==================== 增强召回模式 ====================

/**
 * 使用 assistantAI 分析召回的总结，识别不相关/已完成的总结并生成补充查询
 * @param {string} userInput 用户当前输入
 * @param {Array<{summary: object, score: number}>} ragSummaries 召回的总结列表
 * @param {object} gameTime 当前游戏时间
 * @returns {Promise<{pruneFloors: number[], additionalQuery: string}>}
 */
export async function analyzeRecalledSummaries(userInput, ragSummaries, gameTime) {
  const gameStore = useGameStore()
  const { apiUrl, apiKey, model } = gameStore.settings.assistantAI
  if (!apiUrl || !apiKey) {
    return { pruneFloors: [], additionalQuery: '' }
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
    console.warn('[Enhanced Recall] Failed to get location NPCs:', e.message)
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
      console.warn('[Enhanced Recall] Failed to get close NPCs:', e.message)
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
      console.warn('[Enhanced Recall] Failed to extract mentioned NPCs:', e.message)
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
   - **重要**：生成一个综合的补充查询文本，包含所有需要补充的信息点
   - **时间表达规范**：必须使用绝对日期（如"2024年4月15日"），不要使用相对时间（如"前天"、"大前天"、"上周"）

**输出格式** (XML):
<analysis>
<prune>
<floor>楼层号1</floor>
<floor>楼层号2</floor>
</prune>
<additional_query>
综合补充查询文本（如果需要补充多个信息点，用空格或顿号连接，例如"小明的约定 2024年4月13日的事件 图书馆的活动"）
</additional_query>
</analysis>

如果无需剪枝或补充，对应标签留空即可。`

  const summariesText = ragSummaries
    .map((item, idx) => `[${idx + 1}] 楼层${item.summary.floor} | 相关度${(item.score * 100).toFixed(0)}%\n${item.summary.content}`)
    .join('\n\n')

  const userPrompt = `**用户当前输入**: ${userInput}

**召回的历史总结**:
${summariesText}

请分析上述召回结果，输出剪枝建议和补充查询：`

  let endpoint = apiUrl.replace(/\/+$/, '')
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions'
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

    // 解析 XML 输出
    const pruneFloors = []
    let additionalQuery = ''

    // 提取 <floor> 标签
    const floorMatches = result.matchAll(/<floor>(\d+)<\/floor>/g)
    for (const match of floorMatches) {
      const floor = parseInt(match[1], 10)
      if (!isNaN(floor)) pruneFloors.push(floor)
    }

    // 提取 <additional_query> 标签（单个）
    const queryMatch = result.match(/<additional_query>(.+?)<\/additional_query>/s)
    if (queryMatch) {
      additionalQuery = queryMatch[1].trim()
    }

    return { pruneFloors, additionalQuery }
  } catch (e) {
    console.warn('[Enhanced Recall] Analysis failed:', e.message)
    return { pruneFloors: [], additionalQuery: '' }
  }
}

/**
 * 对补充查询执行二次检索
 * @param {string} query 补充查询文本
 * @param {Set<number>} excludeFloors 需要排除的楼层集合
 * @param {number} topN 返回的结果数量
 * @returns {Promise<Array<{summary: object, score: number}>>}
 */
export async function executeAdditionalQuery(query, excludeFloors, topN) {
  const gameStore = useGameStore()
  const results = []

  try {
    // 向量检索
    const queryEmbedding = await callEmbeddingAPI(query)
    if (!queryEmbedding || queryEmbedding.length === 0) return results

    const candidates = gameStore.player.summaries
      .filter(s => s.type === 'minor' && s.embedding && s.embedding.length > 0 && !excludeFloors.has(s.floor))
      .map(s => ({
        summary: s,
        score: cosineSimilarity(queryEmbedding, s.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(50, topN * 2)) // 取 topN*2 个候选

    if (candidates.length === 0) return results

    // Rerank
    const reranked = await rerankSummaries(query, candidates, topN)
    results.push(...reranked)
  } catch (e) {
    console.warn(`[Enhanced Recall] Additional query failed: "${query}"`, e.message)
  }

  return results
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

  // 4.5. 增强召回模式：分析召回结果并补充查询
  if (ragSettings.enhancedRecall && gameStore.settings.assistantAI?.enabled && ragSummaries.length > 0) {
    try {
      // 1. 分析召回结果
      const { pruneFloors, additionalQuery } = await analyzeRecalledSummaries(
        userInput, ragSummaries, gameStore.gameTime
      )

      // 2. 剪枝：移除标记的总结
      if (pruneFloors.length > 0) {
        console.log('[Enhanced Recall] Pruning floors:', pruneFloors)
        ragSummaries = ragSummaries.filter(item => !pruneFloors.includes(item.summary.floor))
      }

      // 3. 补充查询：二次检索（单次调用）
      if (additionalQuery) {
        console.log('[Enhanced Recall] Additional query:', additionalQuery)
        const enhancedExcludeSet = new Set([
          ...excludeSet,
          ...ragSummaries.map(item => item.summary.floor)
        ])

        const additionalResults = await executeAdditionalQuery(
          additionalQuery,
          enhancedExcludeSet,
          Math.ceil(topN / 2)
        )

        // 4. 合并结果并去重
        if (additionalResults.length > 0) {
          const floorSet = new Set(ragSummaries.map(item => item.summary.floor))
          const uniqueAdditional = additionalResults.filter(
            item => !floorSet.has(item.summary.floor)
          )
          console.log('[Enhanced Recall] Added summaries:', uniqueAdditional.length)
          ragSummaries.push(...uniqueAdditional)
        }
      }
    } catch (e) {
      console.warn('[Enhanced Recall] Enhancement failed, using original results:', e.message)
      errors.push({ stage: 'enhancedRecall', message: e.message })
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
