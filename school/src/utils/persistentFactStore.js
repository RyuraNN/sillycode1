/**
 * Phase 3.2: 持久事实提取
 * 从 minor summary 内容中提取持久化信息（性格特征、关系状态、承诺约定）
 */

// ==================== 事实提取 ====================

/**
 * 从总结内容中提取持久化事实
 * 解析结构化 summary 中的人物关系、重要信息、角色意图等字段
 * @param {string} summaryContent 小总结内容
 * @param {number} sourceFloor 来源楼层
 * @returns {Array<{ entity: string, factCategory: string, content: string, sourceFloor: number, extractedAt: number, isActive: boolean }>}
 */
export function extractPersistentFacts(summaryContent, sourceFloor) {
  if (!summaryContent) return []

  const facts = []
  const lines = summaryContent.split('\n')
  const now = Date.now()

  // 提取结构化字段
  const sections = {}
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([^|｜\n]+)[|｜](.+)$/)
    if (match) {
      sections[match[1].trim()] = match[2].trim()
    }
  }

  // 提取涉及的人物名
  const characterNames = sections['人物']
    ? sections['人物'].split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
    : []

  // 人物关系 → relationship 类型事实
  if (sections['人物关系'] && characterNames.length > 0) {
    const relationContent = sections['人物关系']
    // 尝试为每个提及的人物创建关系事实
    for (const name of characterNames) {
      if (relationContent.includes(name)) {
        facts.push({
          entity: name,
          factCategory: 'relationship',
          content: relationContent,
          sourceFloor,
          extractedAt: now,
          isActive: true
        })
      }
    }
    // 如果没有匹配到具体人物，关联第一个人物
    if (facts.length === 0 && characterNames.length > 0) {
      facts.push({
        entity: characterNames[0],
        factCategory: 'relationship',
        content: relationContent,
        sourceFloor,
        extractedAt: now,
        isActive: true
      })
    }
  }

  // 重要信息 → trait/commitment 事实
  if (sections['重要信息']) {
    const importantContent = sections['重要信息']
    // 包含承诺、约定、计划等关键词的视为 commitment
    const commitmentKeywords = ['约定', '承诺', '计划', '打算', '准备', '答应', '约好', '说好', '决定', '要去', '会去']
    const isCommitment = commitmentKeywords.some(kw => importantContent.includes(kw))

    const targetEntity = characterNames.length > 0 ? characterNames[0] : '玩家'

    facts.push({
      entity: targetEntity,
      factCategory: isCommitment ? 'commitment' : 'trait',
      content: importantContent,
      sourceFloor,
      extractedAt: now,
      isActive: true
    })
  }

  // 角色意图 → commitment 事实
  if (sections['角色意图']) {
    const intentContent = sections['角色意图']
    const targetEntity = characterNames.length > 0 ? characterNames[0] : '玩家'

    facts.push({
      entity: targetEntity,
      factCategory: 'commitment',
      content: intentContent,
      sourceFloor,
      extractedAt: now,
      isActive: true
    })
  }

  return facts
}

// ==================== 事实合并 ====================

/**
 * 将新事实合并入已有事实库（不可变模式）
 * 去重：相同 entity + factCategory + 相似 content 视为重复
 * @param {Array} newFacts 新提取的事实
 * @param {Array} existing 已有事实
 * @returns {Array} 合并后的事实数组（新对象）
 */
export function mergePersistentFacts(newFacts, existing) {
  if (!newFacts || newFacts.length === 0) return existing || []

  const result = [...(existing || [])]

  for (const newFact of newFacts) {
    // 检查是否重复
    const isDuplicate = result.some(existingFact =>
      existingFact.entity === newFact.entity &&
      existingFact.factCategory === newFact.factCategory &&
      isSimilarContent(existingFact.content, newFact.content)
    )

    if (!isDuplicate) {
      result.push({ ...newFact })
    }
  }

  return result
}

/**
 * 提取文本的 bigram 集合（相邻两字符对）
 * 比单字符集更能区分语序不同的句子，如 "小美喜欢画画" vs "小美讨厌画画"
 */
function extractBigrams(text) {
  const bigrams = new Set()
  for (let i = 0; i < text.length - 1; i++) {
    bigrams.add(text[i] + text[i + 1])
  }
  return bigrams
}

/**
 * 内容相似度判断（bigram Jaccard）
 * 使用相邻字符对而非单字符集，能更好地区分语序和语义差异
 */
function isSimilarContent(a, b) {
  if (!a || !b) return false
  if (a === b) return true

  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b

  // 短文本直接包含检查
  if (longer.includes(shorter)) return true

  // 文本过短时退化为直接比较
  if (shorter.length < 3) return false

  // 使用 bigram Jaccard 相似度
  const bigramsA = extractBigrams(a)
  const bigramsB = extractBigrams(b)
  let intersection = 0
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++
  }
  const union = bigramsA.size + bigramsB.size - intersection
  const jaccard = union > 0 ? intersection / union : 0

  return jaccard > 0.6
}

// ==================== 事实查询 ====================

/**
 * 按实体名查找相关事实
 * @param {string[]} entities 实体名列表
 * @param {Array} factStore 事实库
 * @returns {Array} 匹配的事实列表
 */
export function queryRelevantFacts(entities, factStore) {
  if (!entities || entities.length === 0 || !factStore || factStore.length === 0) {
    return []
  }

  const entitySet = new Set(entities)
  return factStore.filter(fact => fact.isActive && entitySet.has(fact.entity))
}

/**
 * 将事实列表格式化为可注入上下文的文本
 * @param {Array} facts 事实列表
 * @returns {string} 格式化文本
 */
export function formatFactsAsContext(facts) {
  if (!facts || facts.length === 0) return ''

  const grouped = new Map()
  for (const fact of facts) {
    if (!grouped.has(fact.entity)) {
      grouped.set(fact.entity, [])
    }
    grouped.get(fact.entity).push(fact)
  }

  const lines = ['[持久记忆]']
  for (const [entity, entityFacts] of grouped) {
    lines.push(`• ${entity}:`)
    for (const fact of entityFacts) {
      const tag = fact.factCategory === 'trait' ? '特征'
        : fact.factCategory === 'relationship' ? '关系'
        : '承诺'
      lines.push(`  - [${tag}] ${fact.content}`)
    }
  }

  return lines.join('\n')
}
