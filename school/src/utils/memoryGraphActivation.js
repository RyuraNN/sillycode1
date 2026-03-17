/**
 * 共现关联扩散
 * 从查询中识别的关键实体出发，沿共现关系图逐层扩散关联强度，
 * 发现与当前语境间接相关的记忆片段。
 */

// ==================== 查询锚点解析 ====================

/**
 * 从用户输入文本中解析出与已知 NPC 名匹配的锚点实体
 * 支持全名匹配和去姓后的名字匹配（≥2 字）
 * @param {string} userInput 用户输入
 * @param {string[]} npcNameList 全部 NPC 名
 * @returns {string[]} 去重后的锚点实体名
 */
export function resolveQueryAnchors(userInput, npcNameList) {
  if (!userInput || !Array.isArray(npcNameList)) return []

  const matched = []
  for (const name of npcNameList) {
    // 跳过单字名以避免 "小" 匹配 "小美"/"小李" 等误匹配
    if (!name || name.length < 2) continue
    if (userInput.includes(name)) {
      matched.push(name)
      continue
    }
    // 两字及以上名字去掉首字（姓）后尝试匹配
    const givenName = name.slice(1)
    if (givenName.length >= 2 && userInput.includes(givenName)) {
      matched.push(name)
    }
  }

  return [...new Set(matched)]
}

// ==================== 关联扩散 ====================

/**
 * 从锚点实体出发，沿共现关系图做多步关联扩散
 * @param {{ coPresenceGraph: Map<string, Map<string, number>> }} entityLookup 实体索引
 * @param {string[]} anchors 锚点实体列表
 * @param {object} opts 参数
 * @param {number} opts.maxSteps 最大扩散步数（默认 2）
 * @param {number} opts.attenuationPerStep 每步衰减系数（默认 0.55）
 * @param {number} opts.maxReachableNodes 最多可达节点数（默认 50）
 * @returns {Map<string, number>} 实体名 → 关联强度
 */
export function spreadAssociationSignal(entityLookup, anchors, opts = {}) {
  const {
    maxSteps = 2,
    attenuationPerStep = 0.55,
    maxReachableNodes = 50
  } = opts

  if (!entityLookup?.coPresenceGraph || !Array.isArray(anchors) || anchors.length === 0) {
    return new Map()
  }

  const graph = entityLookup.coPresenceGraph
  const signal = new Map()

  // 锚点直接注入强度 1.0
  for (const anchor of anchors) {
    signal.set(anchor, 1.0)
  }

  // 逐步沿边扩散
  let wavefront = [...anchors]

  for (let step = 0; step < maxSteps; step++) {
    const stepDecay = Math.pow(attenuationPerStep, step + 1)
    const nextWave = []

    for (const node of wavefront) {
      const neighbors = graph.get(node)
      if (!neighbors) continue

      const nodeSignal = signal.get(node) || 0

      for (const [neighbor, coCount] of neighbors) {
        // 共现频次归一化：5 次共现即视为最大关联
        const edgeStrength = Math.min(1, coCount / 5)
        const propagated = nodeSignal * stepDecay * edgeStrength

        // 保留最大值，避免多路径累加导致膨胀
        const existing = signal.get(neighbor) || 0
        if (propagated > existing) {
          signal.set(neighbor, propagated)
          nextWave.push(neighbor)
        }
      }
    }

    wavefront = nextWave
    if (signal.size >= maxReachableNodes) break
  }

  // 截断到上限
  if (signal.size > maxReachableNodes) {
    const ranked = [...signal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxReachableNodes)
    return new Map(ranked)
  }

  return signal
}

/**
 * 将扩散结果映射回 summary 候选列表
 * 通过实体倒排索引查找被激活实体所关联的 summary
 * @param {Map<string, number>} signalMap 实体 → 关联强度
 * @param {{ npcIndex: Map, locationIndex: Map }} entityLookup
 * @param {Map<string, object>} summaryByKey summaryKey → summary 对象映射
 * @returns {Array<{ summary: object, score: number }>}
 */
export function signalToCandidates(signalMap, entityLookup, summaryByKey) {
  if (!signalMap || signalMap.size === 0) return []

  const scored = new Map() // summaryKey → max score

  for (const [entity, strength] of signalMap) {
    const npcHits = entityLookup.npcIndex?.get(entity)
    if (npcHits) {
      for (const key of npcHits) {
        scored.set(key, Math.max(scored.get(key) || 0, strength))
      }
    }
    const locHits = entityLookup.locationIndex?.get(entity)
    if (locHits) {
      for (const key of locHits) {
        scored.set(key, Math.max(scored.get(key) || 0, strength))
      }
    }
  }

  const results = []
  for (const [summaryKey, score] of scored) {
    const summary = summaryByKey.get(summaryKey)
    if (summary) {
      results.push({ summary, score })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
