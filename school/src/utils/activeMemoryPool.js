/**
 * 滑动窗口记忆保持器
 * 在连续对话轮次间维护一个有限容量的记忆快照窗口，
 * 根据命中/缺席动态调整每条记忆的显著度，实现话题漂移感知与自然淡出。
 */

import { getSummaryCoverageKey } from './ragService'

// ==================== 默认配置 ====================

const HOLDER_MAX_ENTRIES = 30
const COSINE_FADE_FACTOR = 0.95        // 语义通道：慢淡出
const PRECISION_FADE_FACTOR = 0.7       // 精排通道：快淡出
const STALENESS_ONSET_TURNS = 5         // 连续命中超过此轮次后开始钝化
const TOPIC_DRIFT_OVERLAP_MIN = 0.2     // 重叠率低于此值判定为话题漂移

// ==================== 创建保持器 ====================

/**
 * 构造一个空的记忆保持器
 * @param {object} opts 可选覆盖参数
 * @returns {object} 保持器实例
 */
export function createMemoryHolder(opts = {}) {
  return {
    entries: new Map(),           // summaryKey → HolderEntry
    turnCounter: 0,
    priorKeySnapshot: new Set(),
    params: {
      maxEntries: opts.maxEntries ?? HOLDER_MAX_ENTRIES,
      cosineFade: opts.cosineFade ?? COSINE_FADE_FACTOR,
      precisionFade: opts.precisionFade ?? PRECISION_FADE_FACTOR,
      stalenessOnset: opts.stalenessOnset ?? STALENESS_ONSET_TURNS,
      topicDriftOverlapMin: opts.topicDriftOverlapMin ?? TOPIC_DRIFT_OVERLAP_MIN
    }
  }
}

// ==================== HolderEntry 构造 ====================

function buildHolderEntry(summaryKey, turn, score) {
  return {
    summaryKey,
    cosineChannel: score,         // 语义相似度通道强度
    precisionChannel: score,      // 精排通道强度
    salience: score,              // 最终显著度
    hitStreak: 1,                 // 连续命中轮次计数
    firstSeenTurn: turn,
    latestHitTurn: turn
  }
}

// ==================== 显著度压缩（Logistic 映射） ====================

function logisticSquash(x) {
  // 将 (0,1) 区间内的值做 S 曲线压缩，中心 0.5，斜率 5
  return 1 / (1 + Math.exp(-5 * (x - 0.5)))
}

// ==================== 话题漂移判定 ====================

/**
 * 比较前后两轮的 summaryKey 集合重叠率，判定是否发生了话题漂移
 * @param {object} holder 保持器
 * @param {Set<string>} incomingKeys 新一轮的候选 key
 * @returns {boolean}
 */
export function detectTopicDrift(holder, incomingKeys) {
  if (holder.priorKeySnapshot.size === 0) return false
  let overlapCount = 0
  for (const k of incomingKeys) {
    if (holder.priorKeySnapshot.has(k)) overlapCount++
  }
  const ratio = overlapCount / Math.max(1, holder.priorKeySnapshot.size)
  return ratio < holder.params.topicDriftOverlapMin
}

// ==================== 单轮推进 ====================

/**
 * 以新一批候选推进保持器状态，返回更新后的保持器与排名靠前的条目
 * @param {object} holder 保持器（不直接修改，返回新对象）
 * @param {Array<{ summary: object, score: number }>} incoming 本轮新检索到的候选
 * @param {number} turn 当前轮次号
 * @returns {{ holder: object, rankedEntries: Array<{ summaryKey: string, salience: number }> }}
 */
export function progressTurn(holder, incoming, turn) {
  const cfg = holder.params
  const nextEntries = new Map()
  const incomingKeys = new Set()

  // 建立本轮候选的 key→score 映射
  const incomingScores = new Map()
  for (const item of incoming) {
    const key = getSummaryCoverageKey(item.summary)
    incomingKeys.add(key)
    incomingScores.set(key, item.score)
  }

  // 话题漂移检测
  const drifted = detectTopicDrift(holder, incomingKeys)

  // 遍历已有条目：命中则强化，缺席则淡出
  for (const [key, entry] of holder.entries) {
    const isHit = incomingKeys.has(key)
    let cosine = entry.cosineChannel
    let precision = entry.precisionChannel
    let streak = entry.hitStreak

    if (isHit) {
      const freshVal = incomingScores.get(key) || 0
      cosine = Math.max(cosine, freshVal)
      precision = Math.max(precision, freshVal)
      streak = entry.hitStreak + 1
    } else {
      cosine *= cfg.cosineFade
      precision *= cfg.precisionFade
      streak = 0
    }

    // 话题漂移时全局大幅衰减
    if (drifted) {
      cosine *= 0.3
      precision *= 0.3
    }

    // 连续命中钝化：持续出现太久的记忆降低优先级
    if (streak > cfg.stalenessOnset) {
      const dampRatio = 1 - 0.1 * (streak - cfg.stalenessOnset)
      const floor = 0.3
      cosine *= Math.max(floor, dampRatio)
      precision *= Math.max(floor, dampRatio)
    }

    // Logistic 压缩得到最终显著度
    const blended = (cosine + precision) / 2
    const salience = logisticSquash(blended)

    nextEntries.set(key, {
      summaryKey: key,
      cosineChannel: cosine,
      precisionChannel: precision,
      salience,
      hitStreak: streak,
      firstSeenTurn: entry.firstSeenTurn,
      latestHitTurn: isHit ? turn : entry.latestHitTurn
    })
  }

  // 新候选入池
  for (const item of incoming) {
    const key = getSummaryCoverageKey(item.summary)
    if (!nextEntries.has(key)) {
      nextEntries.set(key, buildHolderEntry(key, turn, item.score))
    }
  }

  // 容量裁剪：按 salience 降序保留前 maxEntries
  const sorted = [...nextEntries.entries()]
    .sort((a, b) => b[1].salience - a[1].salience)

  const trimmed = new Map()
  const rankedEntries = []
  for (let i = 0; i < sorted.length && i < cfg.maxEntries; i++) {
    trimmed.set(sorted[i][0], sorted[i][1])
    rankedEntries.push({
      summaryKey: sorted[i][0],
      salience: sorted[i][1].salience
    })
  }

  return {
    holder: {
      ...holder,
      entries: trimmed,
      turnCounter: turn,
      priorKeySnapshot: incomingKeys
    },
    rankedEntries
  }
}

// ==================== 持久化辅助 ====================

/**
 * 将保持器导出为可 JSON 序列化的纯对象
 */
export function exportHolderSnapshot(holder) {
  if (!holder) return null
  const entriesObj = {}
  for (const [key, entry] of holder.entries) {
    entriesObj[key] = { ...entry }
  }
  return {
    entries: entriesObj,
    turnCounter: holder.turnCounter,
    priorKeySnapshot: [...holder.priorKeySnapshot],
    params: { ...holder.params }
  }
}

/**
 * 从持久化快照还原保持器
 */
export function importHolderSnapshot(snapshot) {
  if (!snapshot) return createMemoryHolder()

  const entries = new Map()
  for (const [key, entry] of Object.entries(snapshot.entries || {})) {
    entries.set(key, { ...entry })
  }

  return {
    entries,
    turnCounter: snapshot.turnCounter || 0,
    priorKeySnapshot: new Set(snapshot.priorKeySnapshot || []),
    params: snapshot.params ? { ...snapshot.params } : createMemoryHolder().params
  }
}

/**
 * 取出保持器中所有条目的 summaryKey → salience 映射
 */
export function extractSalienceMap(holder) {
  const map = new Map()
  if (!holder?.entries) return map
  for (const [key, entry] of holder.entries) {
    map.set(key, entry.salience)
  }
  return map
}
