<template>
  <div class="memory-graph-overlay">
    <div class="memory-graph-header">
      <span>🕸️ 记忆图谱</span>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    <canvas ref="canvasRef" @mousedown="onMouseDown" @mousemove="onMouseMove"
      @mouseup="onMouseUp" @wheel.prevent="onWheel"
      @touchstart.prevent="onTouchStart" @touchmove.prevent="onTouchMove"
      @touchend.prevent="onTouchEnd"></canvas>
    <div v-if="hoveredNode" class="tooltip"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">{{ hoveredNode.label }}</div>
      <div class="tooltip-type">{{ hoveredNode.type === 'character' ? '👤 人物' : '📍 地点' }}</div>
      <div class="tooltip-count">出现次数: {{ hoveredNode.count }}</div>
      <div v-if="hoveredNodeNeighbors.length" class="tooltip-neighbors">
        <div class="tooltip-neighbors-label">关联:</div>
        <span v-for="(nb, i) in hoveredNodeNeighbors.slice(0, 8)" :key="i" class="tooltip-nb-tag">{{ nb }}</span>
      </div>
      <div v-if="hoveredNode.relatedEvents?.length" class="tooltip-events">
        <div v-for="(ev, i) in hoveredNode.relatedEvents.slice(0, 5)" :key="i" class="tooltip-event">{{ ev }}</div>
      </div>
    </div>
    <div v-if="nodeCount === 0" class="empty-hint">暂无数据。请先生成一些小总结，系统会自动提取人物和地点关键词。</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { extractKeywordsFromSummary } from '../utils/ragService'

const emit = defineEmits(['close'])
const gameStore = useGameStore()
const canvasRef = ref(null)
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)
const nodeCount = ref(0)

// Graph data (plain arrays, layout is static so no need for deep reactivity)
let nodes = []
let edges = []
let nodeById = new Map()
let neighborMap = new Map() // nodeId -> Set of neighbor ids
let animId = null
let camera = { x: 0, y: 0, zoom: 1 }
let dragging = null
let panning = false
let panStart = { x: 0, y: 0 }
let camStart = { x: 0, y: 0 }
let logicalW = 0, logicalH = 0
let dpr = 1

// Hovered node neighbors (computed from neighborMap)
const hoveredNodeNeighbors = computed(() => {
  if (!hoveredNode.value) return []
  const set = neighborMap.get(hoveredNode.value.id)
  return set ? [...set] : []
})

// ==================== Build Graph Data ====================

function buildGraphData() {
  const summaries = gameStore.player.summaries.filter(s => s.type === 'minor')
  const nodeMap = new Map()
  const edgeMap = new Map()

  for (const s of summaries) {
    const kw = s.keywords || extractKeywordsFromSummary(s.content)
    if (!kw || kw.length === 0) continue

    const content = s.content || ''
    const locMatch = content.match(/^地点[|｜](.+)$/im)
    const locNames = locMatch ? locMatch[1].split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean) : []

    for (const k of kw) {
      const type = locNames.includes(k) ? 'location' : 'character'
      if (!nodeMap.has(k)) {
        nodeMap.set(k, {
          id: k, label: k, type, count: 0,
          x: 0, y: 0, relatedEvents: []
        })
      }
      const node = nodeMap.get(k)
      node.count++
      const titleMatch = content.match(/^标题[|｜](.+)$/im)
      if (titleMatch) {
        const title = titleMatch[1].trim()
        if (!node.relatedEvents.includes(title)) node.relatedEvents.push(title)
      }
    }

    for (let i = 0; i < kw.length; i++) {
      for (let j = i + 1; j < kw.length; j++) {
        const key = [kw[i], kw[j]].sort().join('||')
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { source: kw[i], target: kw[j], weight: 0 })
        }
        edgeMap.get(key).weight++
      }
    }
  }

  nodes = Array.from(nodeMap.values())
  edges = Array.from(edgeMap.values())
  nodeCount.value = nodes.length

  // Build lookup maps
  nodeById = new Map(nodes.map(n => [n.id, n]))
  neighborMap = new Map()
  for (const n of nodes) neighborMap.set(n.id, new Set())
  for (const e of edges) {
    neighborMap.get(e.source)?.add(e.target)
    neighborMap.get(e.target)?.add(e.source)
  }
}

// ==================== Concentric Static Layout ====================

function layoutNodes() {
  if (nodes.length === 0) return

  // Sort by count descending — most frequent at center
  const sorted = [...nodes].sort((a, b) => b.count - a.count)

  // Layer capacities: center 1, then 6, 12, 18, 24, ...
  const layers = [1]
  let total = 1
  let ring = 6
  while (total < sorted.length) {
    layers.push(ring)
    total += ring
    ring += 6
  }

  // Spacing: adapt to node count so hundreds of nodes don't overlap
  const baseSpacing = Math.max(50, Math.min(100, 600 / Math.sqrt(nodes.length)))

  let idx = 0
  for (let layer = 0; layer < layers.length && idx < sorted.length; layer++) {
    const count = layers[layer]
    const radius = layer === 0 ? 0 : layer * baseSpacing
    for (let k = 0; k < count && idx < sorted.length; k++) {
      const angle = (2 * Math.PI * k) / count - Math.PI / 2
      sorted[idx].x = radius * Math.cos(angle)
      sorted[idx].y = radius * Math.sin(angle)
      idx++
    }
  }
}

// ==================== Drawing ====================

const COLORS = {
  character: '#4a8cff',
  location: '#4adc78',
  characterGlow: 'rgba(74,140,255,0.15)',
  locationGlow: 'rgba(74,220,120,0.15)',
  edgeLight: 'rgba(148,163,184,0.25)',
  edgeStrong: 'rgba(59,130,246,0.6)',
  edgeHighlight: 'rgba(59,130,246,0.9)',
  label: '#334155',
  bgCenter: '#f8fafc',
  bgEdge: '#e2e8f0'
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

function getNodeRadius(n) {
  return clamp(6 + n.count * 1.5, 6, 22)
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = logicalW, h = logicalH
  if (w === 0 || h === 0) return

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Background gradient
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
  bgGrad.addColorStop(0, COLORS.bgCenter)
  bgGrad.addColorStop(1, COLORS.bgEdge)
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, w, h)

  ctx.translate(w / 2 + camera.x, h / 2 + camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  // Viewport culling bounds (in world coords)
  const invZoom = 1 / camera.zoom
  const vpLeft = (-w / 2 - camera.x) * invZoom - 30
  const vpRight = (w / 2 - camera.x) * invZoom + 30
  const vpTop = (-h / 2 - camera.y) * invZoom - 30
  const vpBottom = (h / 2 - camera.y) * invZoom + 30

  function inViewport(x, y, margin) {
    return x + margin > vpLeft && x - margin < vpRight && y + margin > vpTop && y - margin < vpBottom
  }

  // Draw edges (filter: weight >= 2 unless few edges, or highlighted)
  const showAllEdges = edges.length < 60
  const maxWeight = Math.max(1, ...edges.map(e => e.weight))
  const selId = selectedNode.value?.id

  for (const e of edges) {
    if (!showAllEdges && e.weight < 2 && e.source !== selId && e.target !== selId) continue
    const a = nodeById.get(e.source)
    const b = nodeById.get(e.target)
    if (!a || !b) continue
    if (!inViewport((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(a.x - b.x) + Math.abs(a.y - b.y))) continue

    const isHighlighted = selId && (e.source === selId || e.target === selId)
    const t = e.weight / maxWeight
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = isHighlighted ? COLORS.edgeHighlight : (t > 0.4 ? COLORS.edgeStrong : COLORS.edgeLight)
    ctx.lineWidth = isHighlighted ? 2.5 : clamp(t * 3 + 0.5, 0.5, 3)
    ctx.stroke()

    // Weight label for strong edges
    if (e.weight >= 3 && camera.zoom > 0.4) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      ctx.fillStyle = 'rgba(100,116,139,0.7)'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(e.weight), mx, my - 3)
    }
  }

  // Draw nodes
  const showLabels = camera.zoom > 0.35

  for (const n of nodes) {
    const r = getNodeRadius(n)
    if (!inViewport(n.x, n.y, r + 20)) continue

    const isSelected = selId === n.id
    const isHovered = hoveredNode.value?.id === n.id
    const isCharacter = n.type === 'character'

    // Outer glow
    if (isSelected || isHovered) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2)
      ctx.fillStyle = isCharacter ? 'rgba(74,140,255,0.2)' : 'rgba(74,220,120,0.2)'
      ctx.fill()
    }

    // Node shape
    ctx.beginPath()
    if (isCharacter) {
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
    } else {
      // Rounded rect for locations
      const rr = 3
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

    // Fill
    ctx.fillStyle = isSelected ? '#1e40af' : (isCharacter ? COLORS.character : COLORS.location)
    ctx.fill()
    // Stroke
    ctx.strokeStyle = isSelected ? '#93c5fd' : 'rgba(255,255,255,0.7)'
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()

    // Label
    if (showLabels) {
      ctx.fillStyle = COLORS.label
      ctx.font = `${clamp(11, 9, 13)}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(n.label, n.x, n.y + r + 13)
    }
  }

  ctx.restore()
}

function tick() {
  draw()
  animId = requestAnimationFrame(tick)
}

// ==================== Coordinate Helpers ====================

function screenToWorld(sx, sy) {
  return {
    x: (sx - logicalW / 2 - camera.x) / camera.zoom,
    y: (sy - logicalH / 2 - camera.y) / camera.zoom
  }
}

function findNodeAt(wx, wy) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    const r = getNodeRadius(n) + 4
    if (Math.abs(wx - n.x) < r && Math.abs(wy - n.y) < r) return n
  }
  return null
}

// ==================== Mouse Events ====================

function onMouseDown(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  const node = findNodeAt(wp.x, wp.y)
  if (node) {
    dragging = node
    selectedNode.value = node
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
    dragging.x = wp.x; dragging.y = wp.y
  } else if (panning) {
    camera.x = camStart.x + (e.clientX - panStart.x)
    camera.y = camStart.y + (e.clientY - panStart.y)
  } else {
    const node = findNodeAt(wp.x, wp.y)
    hoveredNode.value = node
    if (node) {
      tooltipPos.value = { x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 }
    }
  }
}

function onMouseUp() { dragging = null; panning = false }

function onWheel(e) {
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  camera.zoom = clamp(camera.zoom * factor, 0.15, 5)
}

// ==================== Touch Events ====================

let touchMode = null
let lastPinchDist = 0

function getTouchPos(touch) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
}

function pinchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function onTouchStart(e) {
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
      tooltipPos.value = { x: pos.x + 12, y: pos.y + 12 }
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
  if (touchMode === 'pinch' && e.touches.length === 2) {
    const dist = pinchDist(e.touches[0], e.touches[1])
    if (lastPinchDist > 0) {
      camera.zoom = clamp(camera.zoom * (dist / lastPinchDist), 0.15, 5)
    }
    lastPinchDist = dist
    return
  }
  if (e.touches.length === 1) {
    const pos = getTouchPos(e.touches[0])
    const wp = screenToWorld(pos.x, pos.y)
    if (touchMode === 'drag' && dragging) {
      dragging.x = wp.x; dragging.y = wp.y
      hoveredNode.value = dragging
      tooltipPos.value = { x: pos.x + 12, y: pos.y + 12 }
    } else if (touchMode === 'pan') {
      camera.x = camStart.x + (e.touches[0].clientX - panStart.x)
      camera.y = camStart.y + (e.touches[0].clientY - panStart.y)
    }
  }
}

function onTouchEnd() {
  touchMode = null
  dragging = null
  panning = false
  lastPinchDist = 0
}

// ==================== Resize & Lifecycle ====================

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  dpr = window.devicePixelRatio || 1
  logicalW = parent.clientWidth
  logicalH = parent.clientHeight - 44
  canvas.width = logicalW * dpr
  canvas.height = logicalH * dpr
  canvas.style.width = logicalW + 'px'
  canvas.style.height = logicalH + 'px'
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  buildGraphData()
  layoutNodes()
  tick()
})

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.memory-graph-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  z-index: 20;
  background: #f1f5f9;
  display: flex;
  flex-direction: column;
}

.memory-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
  font-size: 15px;
  font-weight: 600;
  height: 44px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}
.close-btn:hover { color: #475569; }

canvas {
  flex: 1;
  cursor: grab;
  display: block;
}
canvas:active { cursor: grabbing; }

.tooltip {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  color: #334155;
  font-size: 13px;
  pointer-events: none;
  max-width: 260px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 10;
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
  margin-bottom: 4px;
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
  align-items: center;
  margin-bottom: 6px;
}

.tooltip-neighbors-label {
  font-size: 11px;
  color: #94a3b8;
  margin-right: 2px;
}

.tooltip-nb-tag {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 4px;
}

.tooltip-events {
  border-top: 1px solid #e2e8f0;
  padding-top: 6px;
  margin-top: 2px;
}

.tooltip-event {
  font-size: 11px;
  color: #64748b;
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
}

@media (max-width: 480px) {
  .memory-graph-header {
    padding: 8px 12px;
    font-size: 13px;
    height: 36px;
  }
  .close-btn { font-size: 18px; }
  .tooltip {
    max-width: 200px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .tooltip-title { font-size: 13px; }
  .tooltip-event { font-size: 10px; }
  .empty-hint { font-size: 12px; padding: 0 20px; }
}
</style>
