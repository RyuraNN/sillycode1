<template>
  <div class="memory-graph-overlay">
    <!-- 顶部工具栏 -->
    <div class="memory-graph-header">
      <div class="header-left">
        <span class="header-title">🕸️ 记忆图谱</span>
        <!-- 视图切换 -->
        <div class="view-tabs">
          <button :class="['tab-btn', { active: viewMode === 'graph' }]" @click="switchView('graph')">图谱</button>
          <button :class="['tab-btn', { active: viewMode === 'timeline' }]" @click="switchView('timeline')">时间轴</button>
          <button :class="['tab-btn', { active: viewMode === 'tree' }]" @click="switchView('tree')">树状图</button>
          <button :class="['tab-btn', { active: viewMode === 'vector' }]" @click="switchView('vector')">向量</button>
        </div>
      </div>
      <div class="header-right">
        <!-- 筛选 (不适用于向量视图) -->
        <select v-if="viewMode !== 'vector'" v-model="filterType" class="filter-select" @change="applyFilter">
          <option value="all">全部</option>
          <option value="character">仅人物</option>
          <option value="location">仅地点</option>
        </select>
        <!-- 搜索 (不适用于向量视图，向量视图有自己的搜索) -->
        <div v-if="viewMode !== 'vector'" class="search-box">
          <input v-model="searchQuery" placeholder="搜索节点..." @input="onSearch" />
          <span v-if="searchQuery" class="clear-search" @click="searchQuery = ''; onSearch()">×</span>
        </div>
        <!-- 重置 -->
        <button class="icon-btn" @click="resetView" title="重置视图">↺</button>
        <!-- 路径查找 (不适用于向量视图) -->
        <button v-if="viewMode !== 'vector'" :class="['icon-btn', { active: pathFindMode.active }]" @click="togglePathFind" title="路径查找">⤳</button>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
    </div>

    <!-- 主画布 -->
    <div class="canvas-container" ref="containerRef">
      <canvas ref="canvasRef"
        @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp"
        @wheel.prevent="onWheel" @dblclick="onDoubleClick" @contextmenu.prevent="onContextMenu"
        @touchstart.prevent="onTouchStart" @touchmove.prevent="onTouchMove" @touchend.prevent="onTouchEnd">
      </canvas>

      <!-- 迷你地图 -->
      <div class="minimap" v-if="nodes.length > 0 && (viewMode === 'graph' || viewMode === 'vector')" ref="minimapRef"
        @mousedown="onMinimapDown" @mousemove="onMinimapMove" @mouseup="onMinimapUp">
        <canvas ref="minimapCanvas"></canvas>
        <div class="minimap-viewport" :style="minimapViewportStyle"></div>
      </div>

      <!-- 向量视图控制面板 -->
      <div class="vector-controls" v-if="viewMode === 'vector'">
        <div class="vector-control-row">
          <label class="vector-label">相似度连线</label>
          <input type="checkbox" v-model="showSimilarityEdges" @change="renderVectorView" />
        </div>
        <div class="vector-control-row" v-if="showSimilarityEdges">
          <label class="vector-label">阈值 {{ (similarityThreshold * 100).toFixed(0) }}%</label>
          <input type="range" v-model.number="similarityThreshold" min="0.7" max="0.95" step="0.01" @input="renderVectorView" />
        </div>
        <div class="vector-control-row">
          <input v-model="vectorSearchQuery" placeholder="语义搜索..." class="vector-search-input" @keyup.enter="searchVectorSimilarity" />
          <button class="vector-search-btn" @click="searchVectorSimilarity" :disabled="vectorSearching">
            {{ vectorSearching ? '...' : '搜' }}
          </button>
        </div>
        <div class="vector-stats">
          {{ vectorNodes.length }} 个向量节点
        </div>
      </div>

      <!-- 时间轴滑块 -->
      <div class="time-slider" v-if="viewMode === 'timeline' && timeRange.min !== timeRange.max">
        <input type="range" v-model.number="timeRange.start" :min="timeRange.min" :max="timeRange.max" @input="renderTimeline" />
        <input type="range" v-model.number="timeRange.end" :min="timeRange.min" :max="timeRange.max" @input="renderTimeline" />
        <div class="time-labels">
          <span>{{ formatFloor(timeRange.start) }}</span>
          <span>{{ formatFloor(timeRange.end) }}</span>
        </div>
      </div>
    </div>
    <!-- 悬浮提示 -->
    <div v-if="hoveredNode && !showDetailPanel && viewMode !== 'vector'" class="tooltip" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">{{ hoveredNode.label }}</div>
      <div class="tooltip-type">{{ hoveredNode.type === 'character' ? '👤 人物' : '📍 地点' }}</div>
      <div class="tooltip-count">出现 {{ hoveredNode.count }} 次</div>
      <div v-if="hoveredNodeNeighbors.length" class="tooltip-neighbors">
        <span v-for="(nb, i) in hoveredNodeNeighbors.slice(0, 6)" :key="i" class="tooltip-nb-tag">{{ nb }}</span>
      </div>
    </div>

    <!-- 向量视图悬浮提示 -->
    <div v-if="hoveredVectorNode && !showDetailPanel && viewMode === 'vector'" class="tooltip vector-tooltip" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">第{{ hoveredVectorNode.id }}层</div>
      <div class="tooltip-type">{{ hoveredVectorNode.label }}</div>
      <div class="tooltip-meta" v-if="hoveredVectorNode.summary.date">{{ hoveredVectorNode.summary.date }}</div>
      <div class="tooltip-keywords" v-if="hoveredVectorNode.summary.keywords?.length">
        <span v-for="(kw, i) in hoveredVectorNode.summary.keywords.slice(0, 5)" :key="i" class="tooltip-nb-tag">{{ kw }}</span>
      </div>
      <div class="tooltip-content">{{ truncateContent(hoveredVectorNode.summary.content, 80) }}</div>
    </div>

    <!-- 右键/长按菜单 -->
    <div v-if="contextMenu.show" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <div class="menu-item" @click="viewNodeDetail(contextMenu.node)">📋 查看详情</div>
      <div class="menu-item" @click="focusOnNode(contextMenu.node)">🎯 以此为中心</div>
      <div class="menu-item" @click="switchToTreeView(contextMenu.node)">🌳 树状图展开</div>
      <div class="menu-item" @click="toggleNodeHidden(contextMenu.node)">
        {{ contextMenu.node?.hidden ? '👁️ 显示节点' : '🙈 隐藏节点' }}
      </div>
      <div v-if="pathFindMode.active" class="menu-item" @click="setPathNode(contextMenu.node)">
        {{ !pathFindMode.start ? '🅰️ 设为起点' : '🅱️ 设为终点' }}
      </div>
    </div>

    <!-- 侧边详情面板 -->
    <transition name="slide-panel">
      <div v-if="showDetailPanel && detailNode && viewMode !== 'vector'" class="detail-panel">
        <div class="panel-header">
          <span class="panel-title">{{ detailNode.label }}</span>
          <button class="panel-close" @click="showDetailPanel = false">×</button>
        </div>
        <div class="panel-body">
          <div class="detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ detailNode.type === 'character' ? '👤 人物' : '📍 地点' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">出现次数</span>
            <span class="detail-value">{{ detailNode.count }}</span>
          </div>
          <div class="detail-row" v-if="detailNode.firstAppear">
            <span class="detail-label">首次出现</span>
            <span class="detail-value">{{ formatFloor(detailNode.firstAppear) }}</span>
          </div>
          <div class="detail-row" v-if="detailNode.lastAppear">
            <span class="detail-label">最近出现</span>
            <span class="detail-value">{{ formatFloor(detailNode.lastAppear) }}</span>
          </div>

          <div class="detail-section">
            <div class="section-header">关联实体 ({{ detailNodeRelations.length }})</div>
            <div class="relation-list">
              <div v-for="rel in detailNodeRelations" :key="rel.id" class="relation-item" @click="jumpToNode(rel)">
                <span class="rel-icon">{{ rel.type === 'character' ? '👤' : '📍' }}</span>
                <span class="rel-name">{{ rel.label }}</span>
                <span class="rel-weight">{{ rel.weight }}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="section-header">相关事件 ({{ detailNode.relatedEvents?.length || 0 }})</div>
            <div class="event-list">
              <div v-for="(ev, i) in detailNode.relatedEvents || []" :key="i" class="event-item">
                <span class="event-floor" v-if="ev.floor">{{ formatFloor(ev.floor) }}</span>
                <span class="event-title">{{ ev.title || ev }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 向量视图详情面板 -->
    <transition name="slide-panel">
      <div v-if="showDetailPanel && detailVectorNode && viewMode === 'vector'" class="detail-panel">
        <div class="panel-header">
          <span class="panel-title">第{{ detailVectorNode.id }}层</span>
          <button class="panel-close" @click="showDetailPanel = false">×</button>
        </div>
        <div class="panel-body">
          <div class="detail-row" v-if="detailVectorNode.summary.date">
            <span class="detail-label">日期</span>
            <span class="detail-value">{{ detailVectorNode.summary.date }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">向量维度</span>
            <span class="detail-value">{{ detailVectorNode.embedding?.length || 0 }}</span>
          </div>

          <div class="detail-section" v-if="detailVectorNode.summary.keywords?.length">
            <div class="section-header">关键词</div>
            <div class="keyword-tags">
              <span v-for="(kw, i) in detailVectorNode.summary.keywords" :key="i" class="keyword-tag">{{ kw }}</span>
            </div>
          </div>

          <div class="detail-section">
            <div class="section-header">总结内容</div>
            <div class="summary-content">{{ detailVectorNode.summary.content }}</div>
          </div>

          <div class="detail-section" v-if="similarVectorNodes.length">
            <div class="section-header">相似总结 (Top 5)</div>
            <div class="relation-list">
              <div v-for="item in similarVectorNodes" :key="item.node.id" class="relation-item" @click="focusVectorNode(item.node)">
                <span class="rel-icon">📄</span>
                <span class="rel-name">第{{ item.node.id }}层</span>
                <span class="rel-weight">{{ (item.score * 100).toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 路径查找提示 -->
    <div v-if="pathFindMode.active" class="path-find-hint">
      <span v-if="!pathFindMode.start">点击选择起点</span>
      <span v-else-if="!pathFindMode.end">起点: {{ pathFindMode.start.label }} → 点击选择终点</span>
      <span v-else>{{ pathFindMode.start.label }} → {{ pathFindMode.end.label }} ({{ pathResult.length - 1 }}步)</span>
      <button class="hint-btn" @click="clearPathFind">清除</button>
    </div>

    <!-- 空数据提示 -->
    <div v-if="nodeCount === 0 && viewMode !== 'vector'" class="empty-hint">暂无数据。请先生成一些小总结，系统会自动提取人物和地点关键词。</div>
    <div v-if="vectorNodes.length === 0 && viewMode === 'vector'" class="empty-hint">暂无向量数据。请确保小总结已生成 Embedding 向量（需启用 RAG 系统）。</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { extractKeywordsFromSummary, cosineSimilarity, callEmbeddingAPI } from '../utils/ragService'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// === Refs ===
const canvasRef = ref(null)
const containerRef = ref(null)
const minimapRef = ref(null)
const minimapCanvas = ref(null)

// === State ===
const viewMode = ref('graph')
const filterType = ref('all')
const searchQuery = ref('')
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)
const nodeCount = ref(0)
const showDetailPanel = ref(false)
const detailNode = ref(null)
const contextMenu = ref({ show: false, x: 0, y: 0, node: null })
const pathFindMode = ref({ active: false, start: null, end: null })
const pathResult = ref([])
const treeRootNode = ref(null)
const timeRange = ref({ min: 0, max: 0, start: 0, end: 0 })

// === Vector View State ===
const vectorNodes = ref([])
const similarityThreshold = ref(0.8)
const showSimilarityEdges = ref(false)
const vectorSearchQuery = ref('')
const vectorSearchResults = ref([]) // 相似度排序的节点 ID
const vectorSearching = ref(false)
const hoveredVectorNode = ref(null)
const selectedVectorNode = ref(null)
const detailVectorNode = ref(null)

// === Graph Data ===
let nodes = []
let edges = []
let filteredNodes = []
let filteredEdges = []
let nodeById = new Map()
let neighborMap = new Map()
let edgeMap = new Map()

// === Camera & Canvas ===
let camera = { x: 0, y: 0, zoom: 1 }
let animId = null
let logicalW = 0, logicalH = 0
let dpr = 1

// === Interaction State ===
let dragging = null
let panning = false
let panStart = { x: 0, y: 0 }
let camStart = { x: 0, y: 0 }
let minimapDragging = false
let touchMode = null
let lastPinchDist = 0
let longPressTimer = null
const LONG_PRESS_DELAY = 400

// === Computed ===
const hoveredNodeNeighbors = computed(() => {
  if (!hoveredNode.value) return []
  const set = neighborMap.get(hoveredNode.value.id)
  return set ? [...set].slice(0, 8) : []
})

const detailNodeRelations = computed(() => {
  if (!detailNode.value) return []
  const relations = []
  for (const e of filteredEdges) {
    if (e.source === detailNode.value.id) {
      const n = nodeById.get(e.target)
      if (n && !n.hidden) relations.push({ ...n, weight: e.weight })
    } else if (e.target === detailNode.value.id) {
      const n = nodeById.get(e.source)
      if (n && !n.hidden) relations.push({ ...n, weight: e.weight })
    }
  }
  return relations.sort((a, b) => b.weight - a.weight)
})

// 计算当前选中向量节点的相似节点
const similarVectorNodes = computed(() => {
  if (!detailVectorNode.value || vectorNodes.value.length < 2) return []
  const current = detailVectorNode.value
  const results = []
  for (const node of vectorNodes.value) {
    if (node.id === current.id) continue
    const score = cosineSimilarity(current.embedding, node.embedding)
    if (score > 0.5) results.push({ node, score })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5)
})

const minimapViewportStyle = computed(() => {
  const nodeList = viewMode.value === 'vector' ? vectorNodes.value : nodes
  if (!nodeList.length || logicalW === 0) return { display: 'none' }
  const mmW = 120, mmH = 80
  const bounds = getGraphBounds()
  const scale = Math.min(mmW / (bounds.width + 100), mmH / (bounds.height + 100))
  const vpW = (logicalW / camera.zoom) * scale
  const vpH = (logicalH / camera.zoom) * scale
  const vpX = ((-camera.x / camera.zoom) - bounds.minX + 50) * scale - vpW / 2 + mmW / 2
  const vpY = ((-camera.y / camera.zoom) - bounds.minY + 50) * scale - vpH / 2 + mmH / 2
  return {
    width: Math.max(10, vpW) + 'px',
    height: Math.max(10, vpH) + 'px',
    left: Math.max(0, Math.min(mmW - vpW, vpX)) + 'px',
    top: Math.max(0, Math.min(mmH - vpH, vpY)) + 'px'
  }
})

// === Build Graph Data ===
function buildGraphData() {
  const summaries = gameStore.player.summaries.filter(s => s.type === 'minor')
  const nodeMap = new Map()
  const edgeMapLocal = new Map()
  let minFloor = Infinity, maxFloor = 0

  for (const s of summaries) {
    const kw = s.keywords || extractKeywordsFromSummary(s.content)
    if (!kw || kw.length === 0) continue

    const content = s.content || ''
    const floor = s.floor || 0
    if (floor > 0) {
      minFloor = Math.min(minFloor, floor)
      maxFloor = Math.max(maxFloor, floor)
    }

    const locMatch = content.match(/^地点[|｜](.+)$/im)
    const locNames = locMatch ? locMatch[1].split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean) : []
    const titleMatch = content.match(/^标题[|｜](.+)$/im)
    const title = titleMatch ? titleMatch[1].trim() : ''

    for (const k of kw) {
      const type = locNames.includes(k) ? 'location' : 'character'
      if (!nodeMap.has(k)) {
        nodeMap.set(k, {
          id: k, label: k, type, count: 0,
          x: 0, y: 0, vx: 0, vy: 0,
          relatedEvents: [],
          firstAppear: floor || null,
          lastAppear: floor || null,
          hidden: false
        })
      }
      const node = nodeMap.get(k)
      node.count++
      if (floor) {
        if (!node.firstAppear || floor < node.firstAppear) node.firstAppear = floor
        if (!node.lastAppear || floor > node.lastAppear) node.lastAppear = floor
      }
      if (title && !node.relatedEvents.find(e => e.title === title)) {
        node.relatedEvents.push({ title, floor, date: s.date })
      }
    }

    for (let i = 0; i < kw.length; i++) {
      for (let j = i + 1; j < kw.length; j++) {
        const key = [kw[i], kw[j]].sort().join('||')
        if (!edgeMapLocal.has(key)) {
          edgeMapLocal.set(key, { source: kw[i], target: kw[j], weight: 0, events: [] })
        }
        const edge = edgeMapLocal.get(key)
        edge.weight++
        if (title) edge.events.push({ title, floor, date: s.date })
      }
    }
  }

  nodes = Array.from(nodeMap.values())
  edges = Array.from(edgeMapLocal.values())
  nodeCount.value = nodes.length

  nodeById = new Map(nodes.map(n => [n.id, n]))
  neighborMap = new Map()
  edgeMap = new Map()
  for (const n of nodes) neighborMap.set(n.id, new Set())
  for (const e of edges) {
    neighborMap.get(e.source)?.add(e.target)
    neighborMap.get(e.target)?.add(e.source)
    edgeMap.set(`${e.source}||${e.target}`, e)
    edgeMap.set(`${e.target}||${e.source}`, e)
  }

  timeRange.value = {
    min: minFloor === Infinity ? 0 : minFloor,
    max: maxFloor,
    start: minFloor === Infinity ? 0 : minFloor,
    end: maxFloor
  }

  applyFilter()
}

// === Vector View Functions ===

/**
 * 构建向量节点数据
 */
function buildVectorData() {
  const summaries = gameStore.player.summaries.filter(
    s => s.type === 'minor' && s.embedding?.length > 0
  )
  if (summaries.length === 0) {
    vectorNodes.value = []
    return
  }

  // 获取时间范围用于颜色计算
  let minFloor = Infinity, maxFloor = 0
  for (const s of summaries) {
    if (s.floor > 0) {
      minFloor = Math.min(minFloor, s.floor)
      maxFloor = Math.max(maxFloor, s.floor)
    }
  }
  const floorRange = maxFloor - minFloor || 1

  // 提取标签
  const getLabel = (s) => {
    const titleMatch = s.content?.match(/^标题[|｜](.+)$/im)
    if (titleMatch) return titleMatch[1].trim().slice(0, 15)
    if (s.keywords?.length) return s.keywords[0]
    return `第${s.floor}层`
  }

  // 构建节点
  const nodes = summaries.map(s => {
    const t = (s.floor - minFloor) / floorRange
    // 颜色从浅蓝到深蓝渐变
    const r = Math.round(180 - t * 100)
    const g = Math.round(200 - t * 80)
    const b = Math.round(255 - t * 55)
    return {
      id: s.floor,
      summary: s,
      embedding: s.embedding,
      x: 0,
      y: 0,
      label: getLabel(s),
      color: `rgb(${r},${g},${b})`
    }
  })

  vectorNodes.value = nodes

  // PCA 降维
  if (nodes.length >= 2) {
    const coords = simplePCA(nodes.map(n => n.embedding))
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = coords[i][0]
      nodes[i].y = coords[i][1]
    }
  }

  layoutVector()
}

/**
 * 简化 PCA 降维算法
 * 使用幂迭代法计算前两个主成分
 */
function simplePCA(vectors) {
  const n = vectors.length
  if (n === 0) return []
  const dim = vectors[0].length

  // 1. 计算均值
  const mean = new Array(dim).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i]
  }
  for (let i = 0; i < dim; i++) mean[i] /= n

  // 2. 中心化
  const centered = vectors.map(v => v.map((x, i) => x - mean[i]))

  // 3. 幂迭代法求主成分
  const getPC = (data, deflate = null) => {
    let pc = new Array(dim).fill(0).map(() => Math.random() - 0.5)
    // 归一化
    let norm = Math.sqrt(pc.reduce((s, x) => s + x * x, 0))
    pc = pc.map(x => x / norm)

    for (let iter = 0; iter < 50; iter++) {
      // X^T * X * pc
      const newPc = new Array(dim).fill(0)
      for (const row of data) {
        const dot = row.reduce((s, x, i) => s + x * pc[i], 0)
        for (let i = 0; i < dim; i++) newPc[i] += row[i] * dot
      }
      // 去除已有主成分的影响
      if (deflate) {
        const proj = newPc.reduce((s, x, i) => s + x * deflate[i], 0)
        for (let i = 0; i < dim; i++) newPc[i] -= proj * deflate[i]
      }
      norm = Math.sqrt(newPc.reduce((s, x) => s + x * x, 0))
      if (norm < 1e-10) break
      pc = newPc.map(x => x / norm)
    }
    return pc
  }

  const pc1 = getPC(centered)
  const pc2 = getPC(centered, pc1)

  // 4. 投影到 2D
  return centered.map(row => [
    row.reduce((s, x, i) => s + x * pc1[i], 0),
    row.reduce((s, x, i) => s + x * pc2[i], 0)
  ])
}

/**
 * 将 PCA 结果映射到画布坐标
 */
function layoutVector() {
  const nodes = vectorNodes.value
  if (nodes.length === 0) return

  // 找到边界
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y)
    maxY = Math.max(maxY, n.y)
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = Math.min(400 / rangeX, 300 / rangeY)

  // 居中并缩放
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  for (const n of nodes) {
    n.x = (n.x - centerX) * scale
    n.y = (n.y - centerY) * scale
  }
}

/**
 * 渲染向量视图
 */
function renderVectorView() {
  // 触发重绘（draw 函数会根据 viewMode 选择渲染方式）
}

/**
 * 语义搜索
 */
async function searchVectorSimilarity() {
  const query = vectorSearchQuery.value.trim()
  if (!query || vectorNodes.value.length === 0) {
    vectorSearchResults.value = []
    return
  }

  vectorSearching.value = true
  try {
    // 尝试调用 Embedding API
    const queryEmbedding = await callEmbeddingAPI(query)
    if (queryEmbedding?.length > 0) {
      // 计算与所有节点的相似度
      const results = vectorNodes.value.map(n => ({
        id: n.id,
        score: cosineSimilarity(queryEmbedding, n.embedding)
      }))
      results.sort((a, b) => b.score - a.score)
      vectorSearchResults.value = results.slice(0, 10).map(r => r.id)
    } else {
      throw new Error('Empty embedding')
    }
  } catch (e) {
    console.warn('[Vector] Embedding API failed, fallback to keyword search:', e.message)
    // 降级为关键词匹配
    const queryLower = query.toLowerCase()
    const results = vectorNodes.value
      .filter(n => {
        const content = n.summary.content?.toLowerCase() || ''
        const keywords = (n.summary.keywords || []).join(' ').toLowerCase()
        return content.includes(queryLower) || keywords.includes(queryLower)
      })
      .map(n => n.id)
    vectorSearchResults.value = results.slice(0, 10)
  } finally {
    vectorSearching.value = false
  }
}

/**
 * 聚焦向量节点
 */
function focusVectorNode(node) {
  if (!node) return
  camera.x = -node.x * camera.zoom
  camera.y = -node.y * camera.zoom
  selectedVectorNode.value = node
}

/**
 * 截断内容
 */
function truncateContent(content, maxLen) {
  if (!content) return ''
  // 移除格式行
  const lines = content.split('\n').filter(l => !l.match(/^(标题|人物|地点|时间)[|｜]/))
  const text = lines.join(' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// === Filter ===
function applyFilter() {
  filteredNodes = nodes.filter(n => {
    if (n.hidden) return false
    if (filterType.value === 'character' && n.type !== 'character') return false
    if (filterType.value === 'location' && n.type !== 'location') return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      if (!n.label.toLowerCase().includes(q)) return false
    }
    return true
  })
  const nodeIds = new Set(filteredNodes.map(n => n.id))
  filteredEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
  layoutCurrentView()
}

function onSearch() {
  applyFilter()
}

// === Layout Functions ===
function layoutCurrentView() {
  if (viewMode.value === 'graph') layoutConcentric()
  else if (viewMode.value === 'timeline') layoutTimeline()
  else if (viewMode.value === 'tree') layoutRadialTree()
  else if (viewMode.value === 'vector') layoutVector()
  renderMinimap()
}

function layoutConcentric() {
  if (filteredNodes.length === 0) return
  const sorted = [...filteredNodes].sort((a, b) => b.count - a.count)

  // 聚类：按关联强度分组（用于未来扇区分组优化）
  clusterNodes(sorted)
  const layers = [1]
  let total = 1, ring = 6
  while (total < sorted.length) {
    layers.push(ring)
    total += ring
    ring += 6
  }

  const baseSpacing = Math.max(60, Math.min(120, 700 / Math.sqrt(filteredNodes.length)))
  let idx = 0
  let clusterAngleOffset = 0

  for (let layer = 0; layer < layers.length && idx < sorted.length; layer++) {
    const count = layers[layer]
    const radius = layer === 0 ? 0 : layer * baseSpacing

    for (let k = 0; k < count && idx < sorted.length; k++) {
      const angle = (2 * Math.PI * k) / count - Math.PI / 2 + clusterAngleOffset
      sorted[idx].x = radius * Math.cos(angle)
      sorted[idx].y = radius * Math.sin(angle)
      idx++
    }
    clusterAngleOffset += 0.1
  }
}

function clusterNodes(nodes) {
  // 简单聚类：返回按关联分组的节点
  const visited = new Set()
  const clusters = []
  for (const n of nodes) {
    if (visited.has(n.id)) continue
    const cluster = [n]
    visited.add(n.id)
    const neighbors = neighborMap.get(n.id) || new Set()
    for (const nbId of neighbors) {
      if (!visited.has(nbId)) {
        const nb = nodeById.get(nbId)
        if (nb && filteredNodes.includes(nb)) {
          cluster.push(nb)
          visited.add(nbId)
        }
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

function layoutTimeline() {
  if (filteredNodes.length === 0) return
  const nodesWithTime = filteredNodes.filter(n => n.firstAppear)
  if (nodesWithTime.length === 0) return

  const { start, end } = timeRange.value
  const range = Math.max(1, end - start)
  const width = Math.max(logicalW - 100, range * 50)

  // 按类型分行
  const characters = nodesWithTime.filter(n => n.type === 'character')
  const locations = nodesWithTime.filter(n => n.type === 'location')

  const rowHeight = 60
  let y = -rowHeight

  for (const n of characters) {
    const t = (n.firstAppear - start) / range
    n.x = (t - 0.5) * width
    n.y = y
  }
  y += rowHeight * 2

  for (const n of locations) {
    const t = (n.firstAppear - start) / range
    n.x = (t - 0.5) * width
    n.y = y
  }
}

function layoutRadialTree() {
  if (filteredNodes.length === 0) return
  const root = treeRootNode.value || filteredNodes[0]
  if (!root) return

  const visited = new Set([root.id])
  const levels = [[root]]
  let currentLevel = [root]

  // BFS 构建层级
  while (currentLevel.length > 0 && levels.length < 5) {
    const nextLevel = []
    for (const n of currentLevel) {
      const neighbors = neighborMap.get(n.id) || new Set()
      for (const nbId of neighbors) {
        if (!visited.has(nbId)) {
          const nb = nodeById.get(nbId)
          if (nb && filteredNodes.includes(nb)) {
            nextLevel.push(nb)
            visited.add(nbId)
          }
        }
      }
    }
    if (nextLevel.length > 0) levels.push(nextLevel)
    currentLevel = nextLevel
  }

  // 径向布局
  const baseRadius = 100
  root.x = 0
  root.y = 0

  for (let lvl = 1; lvl < levels.length; lvl++) {
    const nodes = levels[lvl]
    const radius = lvl * baseRadius
    const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1)
    nodes.forEach((n, i) => {
      const angle = i * angleStep - Math.PI / 2
      n.x = radius * Math.cos(angle)
      n.y = radius * Math.sin(angle)
    })
  }

  // 未访问节点放外围
  const unvisited = filteredNodes.filter(n => !visited.has(n.id))
  const outerRadius = levels.length * baseRadius + 50
  unvisited.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(unvisited.length, 1)
    n.x = outerRadius * Math.cos(angle)
    n.y = outerRadius * Math.sin(angle)
  })
}

// === Path Finding (BFS) ===
function findShortestPath(startId, endId) {
  if (startId === endId) return [startId]
  const queue = [[startId]]
  const visited = new Set([startId])

  while (queue.length > 0) {
    const path = queue.shift()
    const current = path[path.length - 1]
    const neighbors = neighborMap.get(current) || new Set()

    for (const nbId of neighbors) {
      if (nbId === endId) return [...path, nbId]
      if (!visited.has(nbId) && nodeById.get(nbId) && !nodeById.get(nbId).hidden) {
        visited.add(nbId)
        queue.push([...path, nbId])
      }
    }
  }
  return []
}

// === Drawing ===
const COLORS = {
  character: '#4a8cff',
  location: '#4adc78',
  edgeLight: 'rgba(148,163,184,0.25)',
  edgeStrong: 'rgba(59,130,246,0.6)',
  edgeHighlight: 'rgba(59,130,246,0.9)',
  pathHighlight: '#f59e0b',
  searchMatch: '#f472b6',
  label: '#334155',
  bgCenter: '#f8fafc',
  bgEdge: '#e2e8f0'
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function getNodeRadius(n) { return clamp(8 + n.count * 1.5, 8, 24) }

function getGraphBounds() {
  // 向量视图使用向量节点
  const nodeList = viewMode.value === 'vector' ? vectorNodes.value : filteredNodes
  if (nodeList.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodeList) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y)
    maxY = Math.max(maxY, n.y)
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = logicalW, h = logicalH
  if (w === 0 || h === 0) return

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Background
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
  bgGrad.addColorStop(0, COLORS.bgCenter)
  bgGrad.addColorStop(1, COLORS.bgEdge)
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, w, h)

  ctx.translate(w / 2 + camera.x, h / 2 + camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  // Viewport culling
  const invZoom = 1 / camera.zoom
  const vpLeft = (-w / 2 - camera.x) * invZoom - 50
  const vpRight = (w / 2 - camera.x) * invZoom + 50
  const vpTop = (-h / 2 - camera.y) * invZoom - 50
  const vpBottom = (h / 2 - camera.y) * invZoom + 50

  function inViewport(x, y, margin = 0) {
    return x + margin > vpLeft && x - margin < vpRight && y + margin > vpTop && y - margin < vpBottom
  }

  // Vector view has its own drawing logic
  if (viewMode.value === 'vector') {
    drawVectorView(ctx, inViewport)
    ctx.restore()
    return
  }

  const selId = selectedNode.value?.id
  const pathSet = new Set(pathResult.value)
  const maxWeight = Math.max(1, ...filteredEdges.map(e => e.weight))
  const showAllEdges = filteredEdges.length < 80

  // Draw edges
  for (const e of filteredEdges) {
    if (!showAllEdges && e.weight < 2 && e.source !== selId && e.target !== selId) continue
    const a = nodeById.get(e.source)
    const b = nodeById.get(e.target)
    if (!a || !b) continue
    if (!inViewport((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(a.x - b.x) + Math.abs(a.y - b.y))) continue

    const isPath = pathSet.has(e.source) && pathSet.has(e.target) &&
      Math.abs(pathResult.value.indexOf(e.source) - pathResult.value.indexOf(e.target)) === 1
    const isHighlighted = selId && (e.source === selId || e.target === selId)
    const t = e.weight / maxWeight

    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = isPath ? COLORS.pathHighlight : (isHighlighted ? COLORS.edgeHighlight : (t > 0.4 ? COLORS.edgeStrong : COLORS.edgeLight))
    ctx.lineWidth = isPath ? 4 : (isHighlighted ? 2.5 : clamp(t * 3 + 0.5, 0.5, 3))
    ctx.stroke()

    // Weight label
    if (e.weight >= 3 && camera.zoom > 0.4) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      ctx.fillStyle = 'rgba(100,116,139,0.8)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(e.weight), mx, my - 4)
    }
  }

  // Draw nodes
  const showLabels = camera.zoom > 0.3
  const searchLower = searchQuery.value.toLowerCase()

  for (const n of filteredNodes) {
    const r = getNodeRadius(n)
    if (!inViewport(n.x, n.y, r + 30)) continue

    const isSelected = selId === n.id
    const isHovered = hoveredNode.value?.id === n.id
    const isPath = pathSet.has(n.id)
    const isSearchMatch = searchLower && n.label.toLowerCase().includes(searchLower)
    const isCharacter = n.type === 'character'
    const isTreeRoot = treeRootNode.value?.id === n.id

    // Glow
    if (isSelected || isHovered || isPath || isSearchMatch) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2)
      ctx.fillStyle = isPath ? 'rgba(245,158,11,0.3)' : (isSearchMatch ? 'rgba(244,114,182,0.3)' : (isCharacter ? 'rgba(74,140,255,0.25)' : 'rgba(74,220,120,0.25)'))
      ctx.fill()
    }

    // Node shape
    ctx.beginPath()
    if (isCharacter) {
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
    } else {
      const rr = 4
      ctx.moveTo(n.x - r + rr, n.y - r)
      ctx.lineTo(n.x + r - rr, n.y - r)
      ctx.quadraticCurveTo(n.x + r, n.y - r, n.x + r, n.y - r + rr)
      ctx.lineTo(n.x + r, n.y + r - rr)
      ctx.quadraticCurveTo(n.x + r, n.y + r, n.x + r - rr, n.y + r)
      ctx.lineTo(n.x - r + rr, n.y + r)
      ctx.quadraticCurveTo(n.x - r, n.y + r, n.x - r, n.y + r - rr)
      ctx.lineTo(n.x - r, n.y - r + rr)
      ctx.quadraticCurveTo(n.x - r, n.y - r, n.x - r + rr, n.y - r)
      ctx.closePath()
    }

    ctx.fillStyle = isTreeRoot ? '#7c3aed' : (isSelected ? '#1e40af' : (isCharacter ? COLORS.character : COLORS.location))
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#93c5fd' : 'rgba(255,255,255,0.8)'
    ctx.lineWidth = isSelected ? 2.5 : 1.5
    ctx.stroke()

    // Label
    if (showLabels) {
      ctx.fillStyle = isSearchMatch ? COLORS.searchMatch : COLORS.label
      ctx.font = `bold ${clamp(12, 10, 14)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(n.label, n.x, n.y + r + 14)
    }
  }

  // Timeline axis
  if (viewMode.value === 'timeline') {
    drawTimelineAxis(ctx)
  }

  ctx.restore()
}

function drawTimelineAxis(ctx) {
  const { start, end } = timeRange.value
  if (start === end) return
  const range = end - start
  const width = Math.max(logicalW - 100, range * 50)

  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-width / 2, 0)
  ctx.lineTo(width / 2, 0)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'

  const step = Math.max(1, Math.floor(range / 10))
  for (let f = start; f <= end; f += step) {
    const x = ((f - start) / range - 0.5) * width
    ctx.beginPath()
    ctx.moveTo(x, -5)
    ctx.lineTo(x, 5)
    ctx.stroke()
    ctx.fillText(formatFloor(f), x, 20)
  }
}

function drawVectorView(ctx, inViewport) {
  const nodes = vectorNodes.value
  if (nodes.length === 0) return

  const showLabels = camera.zoom > 0.3
  const searchSet = new Set(vectorSearchResults.value)
  const selId = selectedVectorNode.value?.id
  const hovId = hoveredVectorNode.value?.id

  // 绘制相似度连线
  if (showSimilarityEdges.value && nodes.length > 1) {
    const threshold = similarityThreshold.value
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const sim = cosineSimilarity(a.embedding, b.embedding)
        if (sim >= threshold) {
          if (!inViewport((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(a.x - b.x) + Math.abs(a.y - b.y))) continue
          const t = (sim - threshold) / (1 - threshold)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(139, 92, 246, ${0.2 + t * 0.5})`
          ctx.lineWidth = 0.5 + t * 2
          ctx.stroke()
        }
      }
    }
  }

  // 绘制节点
  const nodeRadius = 10
  for (const n of nodes) {
    if (!inViewport(n.x, n.y, nodeRadius + 30)) continue

    const isSelected = selId === n.id
    const isHovered = hovId === n.id
    const isSearchMatch = searchSet.has(n.id)

    // 光晕
    if (isSelected || isHovered || isSearchMatch) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, nodeRadius + 8, 0, Math.PI * 2)
      ctx.fillStyle = isSearchMatch ? 'rgba(244,114,182,0.4)' : 'rgba(139,92,246,0.3)'
      ctx.fill()
    }

    // 节点
    ctx.beginPath()
    ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2)
    ctx.fillStyle = isSelected ? '#7c3aed' : n.color
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#c4b5fd' : 'rgba(255,255,255,0.8)'
    ctx.lineWidth = isSelected ? 2.5 : 1.5
    ctx.stroke()

    // 标签
    if (showLabels) {
      ctx.fillStyle = isSearchMatch ? COLORS.searchMatch : COLORS.label
      ctx.font = `bold 11px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(n.label, n.x, n.y + nodeRadius + 14)
    }
  }
}

function tick() {
  draw()
  animId = requestAnimationFrame(tick)
}

// === Minimap ===
function renderMinimap() {
  const canvas = minimapCanvas.value
  if (!canvas) return

  // 向量视图使用向量节点
  if (viewMode.value === 'vector') {
    if (vectorNodes.value.length === 0) return
    renderVectorMinimap(canvas)
    return
  }

  if (filteredNodes.length === 0) return
  const ctx = canvas.getContext('2d')
  const mmW = 120, mmH = 80
  canvas.width = mmW * dpr
  canvas.height = mmH * dpr
  canvas.style.width = mmW + 'px'
  canvas.style.height = mmH + 'px'

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, 0, mmW, mmH)

  const bounds = getGraphBounds()
  const scale = Math.min(mmW / (bounds.width + 100), mmH / (bounds.height + 100)) * 0.8
  const offsetX = mmW / 2 - (bounds.minX + bounds.width / 2) * scale
  const offsetY = mmH / 2 - (bounds.minY + bounds.height / 2) * scale

  for (const e of filteredEdges) {
    const a = nodeById.get(e.source)
    const b = nodeById.get(e.target)
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(a.x * scale + offsetX, a.y * scale + offsetY)
    ctx.lineTo(b.x * scale + offsetX, b.y * scale + offsetY)
    ctx.strokeStyle = 'rgba(148,163,184,0.4)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  for (const n of filteredNodes) {
    ctx.beginPath()
    ctx.arc(n.x * scale + offsetX, n.y * scale + offsetY, 2, 0, Math.PI * 2)
    ctx.fillStyle = n.type === 'character' ? COLORS.character : COLORS.location
    ctx.fill()
  }
}

function renderVectorMinimap(canvas) {
  const nodes = vectorNodes.value
  const ctx = canvas.getContext('2d')
  const mmW = 120, mmH = 80
  canvas.width = mmW * dpr
  canvas.height = mmH * dpr
  canvas.style.width = mmW + 'px'
  canvas.style.height = mmH + 'px'

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(0, 0, mmW, mmH)

  // 计算边界
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y)
    maxY = Math.max(maxY, n.y)
  }
  const width = maxX - minX || 1
  const height = maxY - minY || 1

  const scale = Math.min(mmW / (width + 50), mmH / (height + 50)) * 0.8
  const offsetX = mmW / 2 - (minX + width / 2) * scale
  const offsetY = mmH / 2 - (minY + height / 2) * scale

  for (const n of nodes) {
    ctx.beginPath()
    ctx.arc(n.x * scale + offsetX, n.y * scale + offsetY, 2, 0, Math.PI * 2)
    ctx.fillStyle = n.color
    ctx.fill()
  }
}

// === Coordinate Helpers ===
function screenToWorld(sx, sy) {
  return {
    x: (sx - logicalW / 2 - camera.x) / camera.zoom,
    y: (sy - logicalH / 2 - camera.y) / camera.zoom
  }
}

function findNodeAt(wx, wy) {
  for (let i = filteredNodes.length - 1; i >= 0; i--) {
    const n = filteredNodes[i]
    const r = getNodeRadius(n) + 6
    if (Math.abs(wx - n.x) < r && Math.abs(wy - n.y) < r) return n
  }
  return null
}

function findVectorNodeAt(wx, wy) {
  const nodeRadius = 10
  for (let i = vectorNodes.value.length - 1; i >= 0; i--) {
    const n = vectorNodes.value[i]
    const r = nodeRadius + 6
    if (Math.abs(wx - n.x) < r && Math.abs(wy - n.y) < r) return n
  }
  return null
}

// === Mouse Events ===
function onMouseDown(e) {
  closeContextMenu()
  const rect = canvasRef.value.getBoundingClientRect()
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

  if (viewMode.value === 'vector') {
    const vnode = findVectorNodeAt(wp.x, wp.y)
    if (vnode) {
      selectedVectorNode.value = vnode
      detailVectorNode.value = vnode
      showDetailPanel.value = true
    } else {
      panning = true
      panStart = { x: e.clientX, y: e.clientY }
      camStart = { x: camera.x, y: camera.y }
      selectedVectorNode.value = null
    }
    return
  }

  const node = findNodeAt(wp.x, wp.y)

  if (node) {
    dragging = node
    selectedNode.value = node
    if (pathFindMode.value.active) setPathNode(node)
  } else {
    panning = true
    panStart = { x: e.clientX, y: e.clientY }
    camStart = { x: camera.x, y: camera.y }
    selectedNode.value = null
  }
}

function onMouseMove(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

  if (dragging) {
    dragging.x = wp.x
    dragging.y = wp.y
    renderMinimap()
  } else if (panning) {
    camera.x = camStart.x + (e.clientX - panStart.x)
    camera.y = camStart.y + (e.clientY - panStart.y)
  } else if (viewMode.value === 'vector') {
    const vnode = findVectorNodeAt(wp.x, wp.y)
    hoveredVectorNode.value = vnode
    hoveredNode.value = null
    if (vnode) {
      tooltipPos.value = { x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 }
    }
  } else {
    const node = findNodeAt(wp.x, wp.y)
    hoveredNode.value = node
    hoveredVectorNode.value = null
    if (node) {
      tooltipPos.value = { x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 }
    }
  }
}

function onMouseUp() {
  dragging = null
  panning = false
}

function onWheel(e) {
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  camera.zoom = clamp(camera.zoom * factor, 0.1, 6)
}

function onDoubleClick(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  const node = findNodeAt(wp.x, wp.y)
  if (node) {
    switchToTreeView(node)
  }
}

function onContextMenu(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  const node = findNodeAt(wp.x, wp.y)
  if (node) {
    contextMenu.value = { show: true, x: e.clientX - rect.left, y: e.clientY - rect.top, node }
  }
}

// === Touch Events ===
function getTouchPos(touch) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
}

function pinchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function onTouchStart(e) {
  closeContextMenu()
  clearLongPress()

  if (e.touches.length === 2) {
    touchMode = 'pinch'
    lastPinchDist = pinchDist(e.touches[0], e.touches[1])
    dragging = null
    return
  }

  if (e.touches.length === 1) {
    const pos = getTouchPos(e.touches[0])
    const wp = screenToWorld(pos.x, pos.y)
    const node = findNodeAt(wp.x, wp.y)

    if (node) {
      touchMode = 'drag'
      dragging = node
      selectedNode.value = node
      hoveredNode.value = node
      tooltipPos.value = { x: pos.x + 15, y: pos.y + 15 }

      // Long press detection
      longPressTimer = setTimeout(() => {
        contextMenu.value = { show: true, x: pos.x, y: pos.y, node }
        touchMode = null
        dragging = null
      }, LONG_PRESS_DELAY)
    } else {
      touchMode = 'pan'
      panning = true
      panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      camStart = { x: camera.x, y: camera.y }
      selectedNode.value = null
      hoveredNode.value = null
    }
  }
}

function onTouchMove(e) {
  clearLongPress()

  if (touchMode === 'pinch' && e.touches.length === 2) {
    const dist = pinchDist(e.touches[0], e.touches[1])
    if (lastPinchDist > 0) {
      camera.zoom = clamp(camera.zoom * (dist / lastPinchDist), 0.1, 6)
    }
    lastPinchDist = dist
    return
  }

  if (e.touches.length === 1) {
    const pos = getTouchPos(e.touches[0])
    const wp = screenToWorld(pos.x, pos.y)

    if (touchMode === 'drag' && dragging) {
      dragging.x = wp.x
      dragging.y = wp.y
      hoveredNode.value = dragging
      tooltipPos.value = { x: pos.x + 15, y: pos.y + 15 }
      renderMinimap()
    } else if (touchMode === 'pan') {
      camera.x = camStart.x + (e.touches[0].clientX - panStart.x)
      camera.y = camStart.y + (e.touches[0].clientY - panStart.y)
    }
  }
}

function onTouchEnd(e) {
  clearLongPress()

  // Double tap detection for tree view
  if (touchMode === 'drag' && dragging && e.touches.length === 0) {
    const now = Date.now()
    if (dragging._lastTap && now - dragging._lastTap < 300) {
      switchToTreeView(dragging)
    }
    dragging._lastTap = now
  }

  touchMode = null
  dragging = null
  panning = false
  lastPinchDist = 0
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// === Minimap Events ===
function onMinimapDown(e) {
  minimapDragging = true
  updateCameraFromMinimap(e)
}

function onMinimapMove(e) {
  if (minimapDragging) updateCameraFromMinimap(e)
}

function onMinimapUp() {
  minimapDragging = false
}

function updateCameraFromMinimap(e) {
  const rect = minimapRef.value.getBoundingClientRect()
  const mmW = 120, mmH = 80
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  const bounds = getGraphBounds()
  const scale = Math.min(mmW / (bounds.width + 100), mmH / (bounds.height + 100)) * 0.8

  const worldX = (mx - mmW / 2) / scale + bounds.minX + bounds.width / 2
  const worldY = (my - mmH / 2) / scale + bounds.minY + bounds.height / 2

  camera.x = -worldX * camera.zoom
  camera.y = -worldY * camera.zoom
}

// === Actions ===
function switchView(mode) {
  viewMode.value = mode
  if (mode !== 'tree') treeRootNode.value = null
  clearPathFind()
  // 向量视图需要单独构建数据
  if (mode === 'vector') {
    buildVectorData()
  } else {
    layoutCurrentView()
  }
  resetView()
}

function resetView() {
  camera.x = 0
  camera.y = 0
  camera.zoom = 1
}

function closeContextMenu() {
  contextMenu.value = { show: false, x: 0, y: 0, node: null }
}

function viewNodeDetail(node) {
  if (!node) return
  detailNode.value = node
  showDetailPanel.value = true
  closeContextMenu()
}

function focusOnNode(node) {
  if (!node) return
  camera.x = -node.x * camera.zoom
  camera.y = -node.y * camera.zoom
  selectedNode.value = node
  closeContextMenu()
}

function jumpToNode(node) {
  focusOnNode(node)
  detailNode.value = node
}

function switchToTreeView(node) {
  if (!node) return
  treeRootNode.value = node
  viewMode.value = 'tree'
  clearPathFind()
  layoutRadialTree()
  resetView()
  closeContextMenu()
}

function toggleNodeHidden(node) {
  if (!node) return
  node.hidden = !node.hidden
  applyFilter()
  closeContextMenu()
}

function togglePathFind() {
  if (pathFindMode.value.active) {
    clearPathFind()
  } else {
    pathFindMode.value = { active: true, start: null, end: null }
    pathResult.value = []
  }
}

function setPathNode(node) {
  if (!node || !pathFindMode.value.active) return

  if (!pathFindMode.value.start) {
    pathFindMode.value.start = node
  } else if (!pathFindMode.value.end && node.id !== pathFindMode.value.start.id) {
    pathFindMode.value.end = node
    pathResult.value = findShortestPath(pathFindMode.value.start.id, pathFindMode.value.end.id)
  }
  closeContextMenu()
}

function clearPathFind() {
  pathFindMode.value = { active: false, start: null, end: null }
  pathResult.value = []
}

function formatFloor(floor) {
  if (!floor) return ''
  return `第${floor}层`
}

// === Resize & Lifecycle ===
function resizeCanvas() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  dpr = window.devicePixelRatio || 1
  logicalW = container.clientWidth
  logicalH = container.clientHeight

  canvas.width = logicalW * dpr
  canvas.height = logicalH * dpr
  canvas.style.width = logicalW + 'px'
  canvas.style.height = logicalH + 'px'

  renderMinimap()
}

onMounted(() => {
  nextTick(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    document.addEventListener('click', handleOutsideClick)
    buildGraphData()
    tick()
  })
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  window.removeEventListener('resize', resizeCanvas)
  document.removeEventListener('click', handleOutsideClick)
  clearLongPress()
})

function handleOutsideClick(e) {
  if (contextMenu.value.show) {
    const menu = document.querySelector('.context-menu')
    if (menu && !menu.contains(e.target)) {
      closeContextMenu()
    }
  }
}

watch(filterType, applyFilter)
</script>

<style scoped>
.memory-graph-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  z-index: 20;
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
}

.memory-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 48px;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
}

.view-tabs {
  display: flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
}

.tab-btn {
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn.active {
  background: #fff;
  color: #1e40af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.filter-select {
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  color: #475569;
  background: #fff;
  cursor: pointer;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-box input {
  padding: 4px 24px 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  width: 120px;
  color: #334155;
}

.search-box input:focus {
  outline: none;
  border-color: #3b82f6;
}

.clear-search {
  position: absolute;
  right: 6px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
}

.icon-btn {
  width: 28px; height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-btn:hover { background: #f8fafc; color: #334155; }
.icon-btn.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.close-btn:hover { color: #475569; }

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

canvas {
  cursor: grab;
  display: block;
}
canvas:active { cursor: grabbing; }

/* Minimap */
.minimap {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 120px;
  height: 80px;
  background: rgba(255,255,255,0.95);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  overflow: hidden;
  cursor: crosshair;
}

.minimap canvas {
  cursor: crosshair;
}

.minimap-viewport {
  position: absolute;
  border: 2px solid #3b82f6;
  background: rgba(59,130,246,0.1);
  pointer-events: none;
  border-radius: 2px;
}

/* Time Slider */
.time-slider {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255,255,255,0.95);
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}

.time-slider input[type="range"] {
  width: 100%;
  cursor: pointer;
}

.time-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #64748b;
}

/* Tooltip */
.tooltip {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  color: #334155;
  font-size: 13px;
  pointer-events: none;
  max-width: 240px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 30;
}

.tooltip-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
  color: #1e293b;
}

.tooltip-type {
  color: #64748b;
  font-size: 12px;
  margin-bottom: 2px;
}

.tooltip-count {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 6px;
}

.tooltip-neighbors {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tooltip-nb-tag {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Context Menu */
.context-menu {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 40;
  min-width: 140px;
  overflow: hidden;
}

.menu-item {
  padding: 10px 14px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  transition: background 0.1s;
}

.menu-item:hover {
  background: #f1f5f9;
}

/* Detail Panel */
.detail-panel {
  position: absolute;
  right: 0;
  top: 0;
  width: 280px;
  height: 100%;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -4px 0 16px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  z-index: 25;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.panel-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #94a3b8;
  cursor: pointer;
}
.panel-close:hover { color: #475569; }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}

.detail-label {
  color: #64748b;
  font-size: 13px;
}

.detail-value {
  color: #1e293b;
  font-size: 13px;
  font-weight: 500;
}

.detail-section {
  margin-top: 16px;
}

.section-header {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e2e8f0;
}

.relation-list, .event-list {
  max-height: 200px;
  overflow-y: auto;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.relation-item:hover {
  background: #f1f5f9;
}

.rel-icon { font-size: 12px; }
.rel-name { flex: 1; font-size: 13px; color: #334155; }
.rel-weight {
  font-size: 11px;
  background: #e2e8f0;
  color: #64748b;
  padding: 2px 6px;
  border-radius: 10px;
}

.event-item {
  padding: 6px 0;
  border-bottom: 1px solid #f8fafc;
  font-size: 12px;
}

.event-floor {
  display: inline-block;
  background: #f1f5f9;
  color: #64748b;
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
  font-size: 11px;
}

.event-title {
  color: #475569;
}

/* Path Find Hint */
.path-find-hint {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #fef3c7;
  border: 1px solid #f59e0b;
  color: #92400e;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 30;
}

.hint-btn {
  background: #f59e0b;
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.empty-hint {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
}

/* Vector View Controls */
.vector-controls {
  position: absolute;
  left: 12px;
  bottom: 12px;
  background: rgba(255,255,255,0.95);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.vector-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vector-label {
  font-size: 12px;
  color: #475569;
  min-width: 80px;
}

.vector-control-row input[type="range"] {
  flex: 1;
  cursor: pointer;
}

.vector-control-row input[type="checkbox"] {
  cursor: pointer;
}

.vector-search-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  color: #334155;
}

.vector-search-input:focus {
  outline: none;
  border-color: #8b5cf6;
}

.vector-search-btn {
  padding: 4px 10px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.vector-search-btn:hover {
  background: #7c3aed;
}

.vector-search-btn:disabled {
  background: #c4b5fd;
  cursor: not-allowed;
}

.vector-stats {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}

/* Vector Tooltip */
.vector-tooltip .tooltip-content {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.vector-tooltip .tooltip-meta {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.vector-tooltip .tooltip-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

/* Vector Detail Panel */
.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.keyword-tag {
  font-size: 12px;
  background: #f1f5f9;
  color: #475569;
  padding: 3px 8px;
  border-radius: 4px;
}

.summary-content {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

/* Transitions */
.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.25s ease;
}
.slide-panel-enter-from, .slide-panel-leave-to {
  transform: translateX(100%);
}

/* Mobile Responsive */
@media (max-width: 640px) {
  .memory-graph-header {
    padding: 6px 10px;
    min-height: 44px;
  }

  .header-title {
    font-size: 14px;
  }

  .view-tabs {
    order: 10;
    width: 100%;
    justify-content: center;
    margin-top: 4px;
  }

  .tab-btn {
    flex: 1;
    padding: 6px 8px;
  }

  .filter-select {
    padding: 6px 8px;
    font-size: 13px;
  }

  .search-box input {
    width: 100px;
    padding: 6px 24px 6px 8px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .close-btn {
    font-size: 24px;
  }

  .minimap {
    width: 100px;
    height: 66px;
    right: 8px;
    bottom: 8px;
  }

  .tooltip {
    max-width: 200px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .tooltip-title { font-size: 13px; }

  .context-menu {
    min-width: 160px;
  }

  .menu-item {
    padding: 12px 16px;
    font-size: 14px;
  }

  .detail-panel {
    width: 100%;
    max-width: 300px;
  }

  .vector-controls {
    left: 8px;
    bottom: 8px;
    min-width: 160px;
    padding: 8px 10px;
  }

  .path-find-hint {
    top: auto;
    bottom: 80px;
    font-size: 12px;
    padding: 6px 12px;
  }

  .time-slider {
    width: calc(100% - 24px);
    max-width: 300px;
  }
}

@media (max-width: 400px) {
  .header-left {
    width: 100%;
    justify-content: space-between;
  }

  .header-right {
    width: 100%;
    justify-content: flex-end;
  }

  .search-box {
    flex: 1;
  }

  .search-box input {
    width: 100%;
  }

  .detail-panel {
    width: 100%;
    max-width: none;
  }
}
</style>
