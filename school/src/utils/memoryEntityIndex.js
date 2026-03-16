/**
 * Phase 1.1: 实体倒排索引
 * 为 NPC 名、地点建立 summaryKey 反查表，支持共现关系图
 */

import { extractKeywordsFromSummary, getSummaryCoverageKey } from './ragService'

// ==================== 索引构建 ====================

/**
 * 从所有 summary 构建实体倒排索引
 * @param {Array} summaries 所有 SummaryData
 * @returns {{ npcIndex: Map<string, Set<string>>, locationIndex: Map<string, Set<string>>, coPresenceGraph: Map<string, Map<string, number>> }}
 */
export function buildEntityLookup(summaries) {
  const npcIndex = new Map()
  const locationIndex = new Map()
  const coPresenceGraph = new Map()

  if (!Array.isArray(summaries)) {
    return { npcIndex, locationIndex, coPresenceGraph }
  }

  for (const summary of summaries) {
    if (summary?.type !== 'minor') continue
    insertIntoEntityLookup({ npcIndex, locationIndex, coPresenceGraph }, summary)
  }

  return { npcIndex, locationIndex, coPresenceGraph }
}

/**
 * 增量插入单条 summary 到索引
 * @param {{ npcIndex: Map, locationIndex: Map, coPresenceGraph: Map }} lookup
 * @param {object} summary SummaryData
 */
export function insertIntoEntityLookup(lookup, summary) {
  if (!summary || !lookup) return

  const summaryKey = getSummaryCoverageKey(summary)
  const content = summary.content || ''
  const keywords = Array.isArray(summary.keywords) && summary.keywords.length > 0
    ? summary.keywords
    : extractKeywordsFromSummary(content)

  // 分类关键词：从 content 中解析 人物 和 地点
  const npcNames = []
  const locationNames = []
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    const charMatch = trimmed.match(/^人物[|｜](.+)$/i)
    if (charMatch) {
      npcNames.push(...charMatch[1].split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean))
      continue
    }
    const locMatch = trimmed.match(/^地点[|｜](.+)$/i)
    if (locMatch) {
      locationNames.push(...locMatch[1].split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean))
    }
  }

  // 建立 NPC 倒排索引
  for (const name of npcNames) {
    if (!lookup.npcIndex.has(name)) {
      lookup.npcIndex.set(name, new Set())
    }
    lookup.npcIndex.get(name).add(summaryKey)
  }

  // 建立地点倒排索引
  for (const loc of locationNames) {
    if (!lookup.locationIndex.has(loc)) {
      lookup.locationIndex.set(loc, new Set())
    }
    lookup.locationIndex.get(loc).add(summaryKey)
  }

  // 更新共现关系图（所有实体两两共现）
  const allEntities = [...new Set([...npcNames, ...locationNames])]
  for (let i = 0; i < allEntities.length; i++) {
    for (let j = i + 1; j < allEntities.length; j++) {
      const a = allEntities[i]
      const b = allEntities[j]
      incrementCoPresence(lookup.coPresenceGraph, a, b)
      incrementCoPresence(lookup.coPresenceGraph, b, a)
    }
  }
}

function incrementCoPresence(graph, from, to) {
  if (!graph.has(from)) {
    graph.set(from, new Map())
  }
  const neighbors = graph.get(from)
  neighbors.set(to, (neighbors.get(to) || 0) + 1)
}

// ==================== 索引查询 ====================

/**
 * 查询实体索引，返回命中的 summaryKey 及其权重
 * @param {{ npcIndex: Map, locationIndex: Map }} lookup
 * @param {string[]} entities 实体名列表
 * @returns {Map<string, number>} summaryKey → 权重
 */
export function queryEntityLookup(lookup, entities) {
  const weightMap = new Map()
  if (!lookup || !Array.isArray(entities)) return weightMap

  for (const entity of entities) {
    const npcKeys = lookup.npcIndex.get(entity)
    if (npcKeys) {
      for (const key of npcKeys) {
        weightMap.set(key, (weightMap.get(key) || 0) + 1)
      }
    }
    const locKeys = lookup.locationIndex.get(entity)
    if (locKeys) {
      for (const key of locKeys) {
        weightMap.set(key, (weightMap.get(key) || 0) + 1)
      }
    }
  }

  return weightMap
}

/**
 * 查找与指定实体共现的其他实体
 * @param {{ coPresenceGraph: Map }} lookup
 * @param {string} entity 目标实体名
 * @returns {Array<{ entity: string, count: number }>} 按共现次数降序
 */
export function findCoPresenceEntities(lookup, entity) {
  if (!lookup?.coPresenceGraph?.has(entity)) return []

  const neighbors = lookup.coPresenceGraph.get(entity)
  return [...neighbors.entries()]
    .map(([name, count]) => ({ entity: name, count }))
    .sort((a, b) => b.count - a.count)
}

// ==================== 序列化 ====================

/**
 * 将索引序列化为可持久化的纯对象
 * @param {{ npcIndex: Map, locationIndex: Map, coPresenceGraph: Map }} lookup
 * @returns {object}
 */
export function serializeEntityLookup(lookup) {
  if (!lookup) return null

  const serializeMapOfSets = (map) => {
    const obj = {}
    for (const [key, set] of map) {
      obj[key] = [...set]
    }
    return obj
  }

  const serializeNestedMap = (map) => {
    const obj = {}
    for (const [key, innerMap] of map) {
      const inner = {}
      for (const [k, v] of innerMap) {
        inner[k] = v
      }
      obj[key] = inner
    }
    return obj
  }

  return {
    npcIndex: serializeMapOfSets(lookup.npcIndex),
    locationIndex: serializeMapOfSets(lookup.locationIndex),
    coPresenceGraph: serializeNestedMap(lookup.coPresenceGraph)
  }
}

/**
 * 从持久化数据还原索引
 * @param {object} data 序列化数据
 * @returns {{ npcIndex: Map, locationIndex: Map, coPresenceGraph: Map }}
 */
export function deserializeEntityLookup(data) {
  if (!data) {
    return { npcIndex: new Map(), locationIndex: new Map(), coPresenceGraph: new Map() }
  }

  const npcIndex = new Map()
  for (const [key, arr] of Object.entries(data.npcIndex || {})) {
    npcIndex.set(key, new Set(arr))
  }

  const locationIndex = new Map()
  for (const [key, arr] of Object.entries(data.locationIndex || {})) {
    locationIndex.set(key, new Set(arr))
  }

  const coPresenceGraph = new Map()
  for (const [key, inner] of Object.entries(data.coPresenceGraph || {})) {
    const innerMap = new Map()
    for (const [k, v] of Object.entries(inner)) {
      innerMap.set(k, v)
    }
    coPresenceGraph.set(key, innerMap)
  }

  return { npcIndex, locationIndex, coPresenceGraph }
}
