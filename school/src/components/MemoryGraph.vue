<template>
  <div class="memory-graph-overlay">
    <div class="memory-graph-header">
      <span>🕸️ 记忆图谱</span>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    <canvas ref="canvasRef" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @wheel="onWheel" @touchstart.prevent="onTouchStart" @touchmove.prevent="onTouchMove" @touchend.prevent="onTouchEnd"></canvas>
    <div v-if="hoveredNode" class="tooltip" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-title">{{ hoveredNode.label }}</div>
      <div class="tooltip-type">{{ hoveredNode.type === 'character' ? '人物' : '地点' }}</div>
      <div class="tooltip-count">出现次数: {{ hoveredNode.count }}</div>
      <div v-if="hoveredNode.relatedEvents && hoveredNode.relatedEvents.length" class="tooltip-events">
        <div v-for="(ev, i) in hoveredNode.relatedEvents.slice(0, 5)" :key="i" class="tooltip-event">{{ ev }}</div>
      </div>
    </div>
    <div v-if="nodes.length === 0" class="empty-hint">暂无数据。请先生成一些小总结，系统会自动提取人物和地点关键词。</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { extractKeywordsFromSummary } from '../utils/ragService'

const emit = defineEmits(['close'])
const gameStore = useGameStore()
const canvasRef = ref(null)
const hoveredNode = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
const selectedNode = ref(null)

// Graph state
let nodes = []
let edges = []
let animId = null
let camera = { x: 0, y: 0, zoom: 1 }
let dragging = null
let panning = false
let panStart = { x: 0, y: 0 }
let camStart = { x: 0, y: 0 }

function buildGraphData() {
  const summaries = gameStore.player.summaries.filter(s => s.type === 'minor')
  const nodeMap = new Map()
  const edgeMap = new Map()

  for (const s of summaries) {
    const kw = s.keywords || extractKeywordsFromSummary(s.content)
    if (!kw || kw.length === 0) continue

    // Classify keywords by parsing summary content
    const content = s.content || ''
    const locMatch = content.match(/^地点[|｜](.+)$/im)
    const locNames = locMatch ? locMatch[1].split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean) : []

    for (const k of kw) {
      const type = locNames.includes(k) ? 'location' : 'character'
      if (!nodeMap.has(k)) {
        nodeMap.set(k, {
          id: k, label: k, type, count: 0,
          x: (Math.random() - 0.5) * 400,
          y: (Math.random() - 0.5) * 400,
          vx: 0, vy: 0, relatedEvents: []
        })
      }
      const node = nodeMap.get(k)
      node.count++
      // Extract title for related events
      const titleMatch = content.match(/^标题[|｜](.+)$/im)
      if (titleMatch) {
        const title = titleMatch[1].trim()
        if (!node.relatedEvents.includes(title)) node.relatedEvents.push(title)
      }
    }

    // Create edges between co-occurring keywords
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
}

// Force simulation
const REPULSION = 5000
const SPRING_K = 0.005
const SPRING_LEN = 120
const DAMPING = 0.9

function simulate() {
  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      let dx = a.x - b.x, dy = a.y - b.y
      let dist = Math.sqrt(dx * dx + dy * dy) || 1
      let force = REPULSION / (dist * dist)
      let fx = (dx / dist) * force, fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
  }
  // Spring forces along edges
  for (const e of edges) {
    const a = nodes.find(n => n.id === e.source)
    const b = nodes.find(n => n.id === e.target)
    if (!a || !b) continue
    let dx = b.x - a.x, dy = b.y - a.y
    let dist = Math.sqrt(dx * dx + dy * dy) || 1
    let force = SPRING_K * (dist - SPRING_LEN)
    let fx = (dx / dist) * force, fy = (dy / dist) * force
    a.vx += fx; a.vy += fy
    b.vx -= fx; b.vy -= fy
  }
  // Apply velocity with damping
  for (const n of nodes) {
    if (dragging && dragging.id === n.id) continue
    n.vx *= DAMPING; n.vy *= DAMPING
    n.x += n.vx; n.y += n.vy
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w / 2 + camera.x, h / 2 + camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  // Draw edges
  const maxWeight = Math.max(1, ...edges.map(e => e.weight))
  for (const e of edges) {
    const a = nodes.find(n => n.id === e.source)
    const b = nodes.find(n => n.id === e.target)
    if (!a || !b) continue
    const isHighlighted = selectedNode.value && (e.source === selectedNode.value.id || e.target === selectedNode.value.id)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = isHighlighted ? 'rgba(100,200,255,0.8)' : 'rgba(100,150,200,0.2)'
    ctx.lineWidth = (e.weight / maxWeight) * 4 + 0.5
    ctx.stroke()
  }

  // Draw nodes
  for (const n of nodes) {
    const isSelected = selectedNode.value && selectedNode.value.id === n.id
    const radius = Math.min(8 + n.count * 2, 24)
    // Glow
    const glow = ctx.createRadialGradient(n.x, n.y, radius * 0.5, n.x, n.y, radius * 2)
    const color = n.type === 'character' ? '80,140,255' : '80,220,120'
    glow.addColorStop(0, `rgba(${color},${isSelected ? 0.5 : 0.25})`)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(n.x - radius * 2, n.y - radius * 2, radius * 4, radius * 4)
    // Node shape
    ctx.beginPath()
    if (n.type === 'location') {
      // Square for locations
      ctx.rect(n.x - radius, n.y - radius, radius * 2, radius * 2)
    } else {
      // Circle for characters
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
    }
    ctx.fillStyle = n.type === 'character' ? '#4a8cff' : '#4adc78'
    if (isSelected) ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Label
    ctx.fillStyle = '#e0e0e0'
    ctx.font = `${Math.max(10, 12 - nodes.length * 0.05)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(n.label, n.x, n.y + radius + 14)
  }
  ctx.restore()
}

function tick() {
  simulate()
  draw()
  animId = requestAnimationFrame(tick)
}

function screenToWorld(sx, sy) {
  const canvas = canvasRef.value
  const w = canvas.width, h = canvas.height
  return {
    x: (sx - w / 2 - camera.x) / camera.zoom,
    y: (sy - h / 2 - camera.y) / camera.zoom
  }
}

function findNodeAt(wx, wy) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    const r = Math.min(8 + n.count * 2, 24)
    if (Math.abs(wx - n.x) < r + 4 && Math.abs(wy - n.y) < r + 4) return n
  }
  return null
}

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
    dragging.vx = 0; dragging.vy = 0
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
  e.preventDefault()
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  camera.zoom = Math.max(0.2, Math.min(5, camera.zoom * factor))
}

// Touch support
let touchMode = null // 'drag' | 'pan' | 'pinch'
let lastPinchDist = 0

function getTouchPos(touch) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
}

function pinchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    // Pinch zoom
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
      const scale = dist / lastPinchDist
      camera.zoom = Math.max(0.2, Math.min(5, camera.zoom * scale))
    }
    lastPinchDist = dist
    return
  }
  if (e.touches.length === 1) {
    const pos = getTouchPos(e.touches[0])
    const wp = screenToWorld(pos.x, pos.y)
    if (touchMode === 'drag' && dragging) {
      dragging.x = wp.x; dragging.y = wp.y
      dragging.vx = 0; dragging.vy = 0
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

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  canvas.width = parent.clientWidth
  canvas.height = parent.clientHeight - 40
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  buildGraphData()
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
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
}

.memory-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: rgba(255,255,255,0.05);
  color: #e0e0e0;
  font-size: 15px;
  font-weight: bold;
  height: 40px;
  box-sizing: border-box;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.close-btn:hover { color: #fff; }

canvas {
  flex: 1;
  width: 100%;
  cursor: grab;
  touch-action: none;
}
canvas:active { cursor: grabbing; }

.tooltip {
  position: absolute;
  background: rgba(20, 20, 40, 0.95);
  border: 1px solid rgba(100, 150, 255, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  color: #e0e0e0;
  font-size: 13px;
  pointer-events: none;
  max-width: 260px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  z-index: 10;
}

.tooltip-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
  color: #fff;
}

.tooltip-type {
  color: #8ab4f8;
  font-size: 12px;
  margin-bottom: 4px;
}

.tooltip-count {
  color: #aaa;
  font-size: 12px;
  margin-bottom: 6px;
}

.tooltip-events {
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 6px;
  margin-top: 2px;
}

.tooltip-event {
  font-size: 11px;
  color: #bbb;
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  color: #666;
  font-size: 14px;
  text-align: center;
}

/* 窄屏适配 */
@media (max-width: 480px) {
  .memory-graph-header {
    padding: 8px 12px;
    font-size: 13px;
    height: 36px;
  }
  .close-btn {
    font-size: 18px;
  }
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
