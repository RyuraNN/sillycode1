<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { calculateRelationshipScore, getEmotionalState, RELATIONSHIP_AXES, DEFAULT_RELATIONSHIPS } from '../data/relationshipData'
import { findNpcLocation } from '../utils/npcScheduleSystem'
import { getItem } from '../data/mapData'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const selectedCharName = ref(null)

// 辅助函数：获取角色的完整关系数据 (合并 Store 和 Default，并过滤被排除的角色)
const getCharRelations = (charName) => {
    const storeData = gameStore.npcRelationships[charName]?.relations || {}
    const defaultData = DEFAULT_RELATIONSHIPS[charName] || {}
    
    // 合并关系数据，Store 优先
    const merged = { ...defaultData, ...storeData }
    
    // 关键修复：从 allClassData 构建实际名册白名单
    // 确保只有当前名册中存在的角色才会出现在关系图中
    // 这比使用 npcRelationships 的 keys 更可靠，因为 npcRelationships 可能包含残留数据
    const rosterNames = new Set()
    rosterNames.add(gameStore.player.name)
    // 也添加 "Player" 和 "玩家" 作为玩家的别名
    rosterNames.add('Player')
    rosterNames.add('玩家')
    
    for (const classInfo of Object.values(gameStore.allClassData || {})) {
        if (classInfo.headTeacher?.name) rosterNames.add(classInfo.headTeacher.name)
        if (Array.isArray(classInfo.teachers)) {
            classInfo.teachers.forEach(t => { if (t.name) rosterNames.add(t.name) })
        }
        if (Array.isArray(classInfo.students)) {
            classInfo.students.forEach(s => { if (s.name) rosterNames.add(s.name) })
        }
    }
    
    const filtered = {}
    for (const [targetName, relation] of Object.entries(merged)) {
        if (rosterNames.has(targetName)) {
            filtered[targetName] = relation
        }
    }
    return filtered
}

// 辅助函数：检查是否与玩家有关系
const hasPlayerRelation = (charName) => {
    const relations = getCharRelations(charName)
    const playerName = gameStore.player.name
    
    // 检查是否存在玩家相关的条目 (玩家自定义名、"Player"、"玩家")
    return !!(relations[playerName] || relations['Player'] || relations['玩家'])
}

// 角色列表数据 (仅显示与玩家有关系的角色)
const charList = computed(() => {
  // 先按 name 去重（保留第一个出现的），防止底层数据有重复 NPC
  const seen = new Set()
  const uniqueNpcs = gameStore.npcs.filter(npc => {
    if (seen.has(npc.name)) return false
    seen.add(npc.name)
    return true
  })
  
  return uniqueNpcs
    .filter(npc => hasPlayerRelation(npc.name))
    .map(npc => {
        // 尝试获取更多详细信息
        const fullData = gameStore.npcRelationships[npc.name] || {}
        
        // 获取与玩家的关系数据
        const relations = getCharRelations(npc.name)
        const playerRel = relations[gameStore.player.name] || relations['Player'] || relations['玩家']
        
        // 实时计算
        const score = calculateRelationshipScore(playerRel)
        
        // Pass genders
        const playerGender = gameStore.player.gender || 'male'
        const npcGender = gameStore.npcRelationships[npc.name]?.gender || npc.gender || 'female'
        
        const emotion = getEmotionalState(playerRel, playerGender, npcGender)
        
        // 获取实时位置和心情
        const locationId = findNpcLocation(npc.id, gameStore)
        const locationItem = locationId ? getItem(locationId) : null
        const locationName = locationItem ? locationItem.name : '未知'
        
        const moodMap = {
          happy: { icon: '😄', text: '开心' },
          sad: { icon: '😢', text: '难过' },
          stressed: { icon: '😣', text: '焦虑' },
          energetic: { icon: '⚡', text: '元气' },
          tired: { icon: '😫', text: '疲惫' },
          angry: { icon: '😠', text: '生气' },
          romantic: { icon: '💖', text: '心动' },
          neutral: { icon: '😐', text: '平静' }
        }
        
        const moodInfo = npc.mood ? (moodMap[npc.mood] || { icon: '😐', text: npc.mood }) : { icon: '😐', text: '平静' }

        return {
          ...npc,
          fullData,
          calculatedScore: score,
          emotionalState: emotion,
          currentLocation: locationName,
          moodInfo,
          moodReason: npc.moodReason
        }
    })
    .sort((a, b) => {
      // 按照计算出的好感度排序
      return b.calculatedScore - a.calculatedScore
    })
})

const currentChar = computed(() => {
    if (!selectedCharName.value) return null
    return charList.value.find(c => c.name === selectedCharName.value) || null
})

const selectChar = (char) => {
  selectedCharName.value = char.name
}

// === 关系数据处理 ===
const playerRelations = computed(() => {
    if (!currentChar.value) return null
    
    const relations = getCharRelations(currentChar.value.name)
    
    // 尝试匹配玩家名字
    const relation = relations[gameStore.player.name] || relations['Player'] || relations['玩家']
    
    return relation
})

const getRelationStyle = (val, max = 100) => {
    const percent = Math.max(0, Math.min(100, (val + 100) / 2)) // -100~100 -> 0~100
    return { width: `${percent}%` }
}
const getHostilityStyle = (val) => {
    const percent = Math.max(0, Math.min(100, val)) // 0~100
    return { width: `${percent}%` }
}

// 获取关系等级描述 (现在直接使用 data 层提供的函数，这里保留作为兼容或直接替换)
// 实际上 charList 已经预计算了，所以模板里可以直接用 char.emotionalState
// 但为了详情页方便，保留一个包装函数或者直接在模板调用 getEmotionalState
const getDisplayEmotionalState = (relation) => {
    // For detail view, we assume current selected char
    if (!currentChar.value) return getEmotionalState(relation)
    
    const playerGender = gameStore.player.gender || 'male'
    const npcGender = gameStore.npcRelationships[currentChar.value.name]?.gender || currentChar.value.gender || 'female'
    
    return getEmotionalState(relation, playerGender, npcGender)
}

// === 2D 力导向关系网络图 ===
const networkCanvasRef = ref(null)
const networkContainerRef = ref(null)
let netCtx = null
let netAnimId = null
let netNodes = []    // { id, name, x, y, vx, vy, pinned, color, isPlayer }
let netEdges = []    // { source, target, color, width, sourceIdx, targetIdx }

// 交互状态
let dragNode = null
let isPanning = false
let panOffsetX = 0, panOffsetY = 0
let lastPanX = 0, lastPanY = 0
let zoomScale = 1
const MIN_ZOOM = 0.3, MAX_ZOOM = 3
let mouseDownX = 0, mouseDownY = 0
const isGrabbing = ref(false)
let lastDragX = 0, lastDragY = 0
let lastDragTime = 0
let dragVelocityX = 0, dragVelocityY = 0

// 力导向参数
const REPULSION = 8000
const SPRING_K = 0.008
const SPRING_LEN = 200
const DAMPING = 0.85
const CENTER_GRAVITY = 0.003
const MAX_VELOCITY = 8

// 构建名册白名单
const getRosterNames = () => {
    const names = new Set()
    names.add(gameStore.player.name)
    for (const classInfo of Object.values(gameStore.allClassData || {})) {
        if (classInfo.headTeacher?.name) names.add(classInfo.headTeacher.name)
        if (Array.isArray(classInfo.teachers)) classInfo.teachers.forEach(t => { if (t.name) names.add(t.name) })
        if (Array.isArray(classInfo.students)) classInfo.students.forEach(s => { if (s.name) names.add(s.name) })
    }
    return names
}

// 初始化焦点关系网络数据（星形拓扑）
const initNetworkData = () => {
    netNodes = []
    netEdges = []
    const playerName = gameStore.player.name
    const focusName = selectedCharName.value || playerName
    const playerGender = gameStore.player.gender || 'male'

    // 收集与焦点角色有直接关系的角色（正向查找）
    const focusRelations = getCharRelations(focusName)
    const connectedNames = new Set()
    for (const [targetName, relData] of Object.entries(focusRelations)) {
        if (!relData) continue
        const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = relData
        if (intimacy === 0 && trust === 0 && passion === 0 && hostility === 0) continue
        connectedNames.add(targetName)
    }

    // 反向查找：其他角色关系中指向焦点的
    const rosterNames = getRosterNames()
    for (const name of rosterNames) {
        if (name === focusName) continue
        const rels = getCharRelations(name)
        const relToFocus = rels[focusName]
        if (!relToFocus) continue
        const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = relToFocus
        if (intimacy === 0 && trust === 0 && passion === 0 && hostility === 0) continue
        connectedNames.add(name)
    }

    // 过滤只保留名册中的角色，排除焦点自身
    const neighbors = [...connectedNames].filter(n => rosterNames.has(n) && n !== focusName)
    if (neighbors.length === 0) return

    const nameToIdx = {}

    // 焦点节点固定在中心
    const focusRel = getCharRelations(playerName)[focusName] || getCharRelations(focusName)[playerName]
    nameToIdx[focusName] = 0
    netNodes.push({
        id: focusName, name: focusName,
        x: 0, y: 0, vx: 0, vy: 0,
        pinned: true, isFocus: true,
        color: '#FFD700',
        score: focusRel ? calculateRelationshipScore(focusRel) : 0,
        emotionText: '',
        radius: 28
    })

    // 其他节点环形分布
    const count = neighbors.length
    neighbors.forEach((name, i) => {
        const angle = (2 * Math.PI * i) / count
        const r = SPRING_LEN * 1.2
        const rel = focusRelations[name] || getCharRelations(name)[focusName]
        const score = rel ? calculateRelationshipScore(rel) : 0
        const npcGender = gameStore.npcRelationships[name]?.gender || 'unknown'
        const emotionText = rel ? getEmotionalState(rel, playerGender, npcGender).text : '陌生'
        const nodeRadius = Math.max(20, name.length * 7)

        nameToIdx[name] = netNodes.length
        netNodes.push({
            id: name, name,
            x: Math.cos(angle) * r, y: Math.sin(angle) * r,
            vx: 0, vy: 0,
            pinned: false, isFocus: false,
            color: getNodeColor(rel),
            score, emotionText, radius: nodeRadius
        })
    })

    // 边：只连接焦点与周围节点（星形拓扑）
    for (const name of neighbors) {
        const si = nameToIdx[focusName]
        const ti = nameToIdx[name]
        if (si === undefined || ti === undefined) continue
        const rel = focusRelations[name] || getCharRelations(name)[focusName]
        const style = getEdgeStyle(rel)
        netEdges.push({
            source: focusName, target: name,
            sourceIdx: si, targetIdx: ti,
            color: style.color, width: style.width,
            dashPattern: style.dashPattern,
            label: style.label, score: style.score
        })
    }
}

const getNodeColor = (rel) => {
    if (!rel) return '#94a3b8'
    const score = calculateRelationshipScore(rel)
    const hostility = rel.hostility || 0
    const passion = rel.passion || 0
    if (hostility >= 50) return '#EF4444'
    if (passion >= 50 && hostility < 20) return '#EC4899'
    if (score >= 60) return '#3B82F6'
    if (score >= 30) return '#10B981'
    if (score >= 0) return '#94a3b8'
    return '#F97316'
}

const getEdgeStyle = (rel) => {
    const color = getNodeColor(rel)
    const score = rel ? calculateRelationshipScore(rel) : 0
    const absScore = Math.abs(score)
    const width = 1.5 + (absScore / 100) * 2.5
    const dashPattern = score < 10 ? [4, 4] : []
    const playerGender = gameStore.player.gender || 'male'
    const label = rel ? getEmotionalState(rel, playerGender).text : '陌生'
    return { color, width, dashPattern, label, score }
}

// 力导向物理模拟
const simulateForces = () => {
    const n = netNodes.length
    if (n === 0) return

    // 1. 节点间库仑斥力
    for (let i = 0; i < n; i++) {
        if (netNodes[i].pinned) continue
        for (let j = i + 1; j < n; j++) {
            let dx = netNodes[i].x - netNodes[j].x
            let dy = netNodes[i].y - netNodes[j].y
            let dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = REPULSION / (dist * dist)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            netNodes[i].vx += fx
            netNodes[i].vy += fy
            if (!netNodes[j].pinned) {
                netNodes[j].vx -= fx
                netNodes[j].vy -= fy
            }
        }
    }

    // 2. 边弹簧引力
    for (const edge of netEdges) {
        const a = netNodes[edge.sourceIdx]
        const b = netNodes[edge.targetIdx]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.sqrt(dx * dx + dy * dy) || 1
        const displacement = dist - SPRING_LEN
        const force = SPRING_K * displacement
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        if (!a.pinned) { a.vx += fx; a.vy += fy }
        if (!b.pinned) { b.vx -= fx; b.vy -= fy }
    }

    // 3. 向心力 + 速度衰减 + 位置更新
    for (const node of netNodes) {
        if (node.pinned) continue
        // 向心力
        node.vx -= node.x * CENTER_GRAVITY
        node.vy -= node.y * CENTER_GRAVITY
        // 衰减
        node.vx *= DAMPING
        node.vy *= DAMPING
        // 限速
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
        if (speed > MAX_VELOCITY) {
            node.vx = (node.vx / speed) * MAX_VELOCITY
            node.vy = (node.vy / speed) * MAX_VELOCITY
        }
        node.x += node.vx
        node.y += node.vy
    }
}

// 初始化 Canvas
const initCanvas = () => {
    if (!networkCanvasRef.value) return
    const canvas = networkCanvasRef.value
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    netCtx = canvas.getContext('2d')
    netCtx.scale(dpr, dpr)
}

// 绘制网络图
let _breathT = 0
const drawNetwork = () => {
    if (!netCtx || !networkCanvasRef.value) return
    const width = networkCanvasRef.value.width / (window.devicePixelRatio || 1)
    const height = networkCanvasRef.value.height / (window.devicePixelRatio || 1)
    const cx = width / 2
    const cy = height / 2
    _breathT += 0.03

    // 物理模拟
    simulateForces()

    // 清除 + 浅色背景
    const gradient = netCtx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) / 2)
    gradient.addColorStop(0, '#f8fafc')
    gradient.addColorStop(1, '#e2e8f0')
    netCtx.fillStyle = gradient
    netCtx.fillRect(0, 0, width, height)

    netCtx.save()
    netCtx.translate(cx + panOffsetX, cy + panOffsetY)
    netCtx.scale(zoomScale, zoomScale)

    // 绘制边
    for (const edge of netEdges) {
        const a = netNodes[edge.sourceIdx]
        const b = netNodes[edge.targetIdx]
        // 外发光（浅色背景下降低透明度）
        netCtx.save()
        netCtx.setLineDash(edge.dashPattern || [])
        netCtx.beginPath()
        netCtx.moveTo(a.x, a.y)
        netCtx.lineTo(b.x, b.y)
        netCtx.strokeStyle = edge.color
        netCtx.lineWidth = edge.width + 3
        netCtx.globalAlpha = 0.08
        netCtx.stroke()
        // 主线
        netCtx.beginPath()
        netCtx.moveTo(a.x, a.y)
        netCtx.lineTo(b.x, b.y)
        netCtx.strokeStyle = edge.color
        netCtx.lineWidth = edge.width
        netCtx.globalAlpha = 0.75
        netCtx.stroke()
        netCtx.setLineDash([])
        netCtx.restore()

        // 边中点标签
        if (edge.label) {
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            netCtx.save()
            netCtx.font = '9px "Microsoft YaHei", sans-serif'
            const tw = netCtx.measureText(edge.label).width
            const pad = 4
            // 白色背景圆角矩形
            const bx = mx - tw / 2 - pad
            const by = my - 6 - pad
            const bw = tw + pad * 2
            const bh = 12 + pad * 2
            const br = 4
            netCtx.globalAlpha = 0.85
            netCtx.fillStyle = '#ffffff'
            netCtx.beginPath()
            netCtx.moveTo(bx + br, by)
            netCtx.lineTo(bx + bw - br, by)
            netCtx.quadraticCurveTo(bx + bw, by, bx + bw, by + br)
            netCtx.lineTo(bx + bw, by + bh - br)
            netCtx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh)
            netCtx.lineTo(bx + br, by + bh)
            netCtx.quadraticCurveTo(bx, by + bh, bx, by + bh - br)
            netCtx.lineTo(bx, by + br)
            netCtx.quadraticCurveTo(bx, by, bx + br, by)
            netCtx.closePath()
            netCtx.fill()
            // 文字
            netCtx.globalAlpha = 1
            netCtx.fillStyle = edge.color
            netCtx.textAlign = 'center'
            netCtx.textBaseline = 'middle'
            netCtx.fillText(edge.label, mx, my)
            netCtx.restore()
        }
    }
    netCtx.globalAlpha = 1

    // 绘制节点
    for (const node of netNodes) {
        const r = node.radius || 20

        // 焦点节点呼吸光环
        if (node.isFocus) {
            const breathR = r + 6 + Math.sin(_breathT) * 3
            const haloGrad = netCtx.createRadialGradient(node.x, node.y, r, node.x, node.y, breathR + 4)
            haloGrad.addColorStop(0, 'rgba(255,215,0,0.35)')
            haloGrad.addColorStop(1, 'rgba(255,215,0,0)')
            netCtx.beginPath()
            netCtx.arc(node.x, node.y, breathR + 4, 0, Math.PI * 2)
            netCtx.fillStyle = haloGrad
            netCtx.fill()
        }

        // 节点圆
        netCtx.beginPath()
        netCtx.arc(node.x, node.y, r, 0, Math.PI * 2)
        netCtx.fillStyle = node.color
        netCtx.fill()
        netCtx.strokeStyle = 'rgba(255,255,255,0.3)'
        netCtx.lineWidth = 1.5
        netCtx.stroke()

        // 名字绘制
        const name = node.name
        let fontSize = 10
        let drawInside = true
        if (name.length > 6) {
            fontSize = 8
            drawInside = false
        } else if (name.length > 4) {
            fontSize = 8
        }
        netCtx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`
        netCtx.textAlign = 'center'
        if (drawInside) {
            netCtx.fillStyle = '#ffffff'
            netCtx.textBaseline = 'middle'
            netCtx.fillText(name, node.x, node.y)
        } else {
            netCtx.fillStyle = '#334155'
            netCtx.textBaseline = 'top'
            netCtx.fillText(name, node.x, node.y + r + 3)
        }

        // emotionText 显示在节点下方
        if (node.emotionText && !node.isFocus) {
            const etY = drawInside ? node.y + r + 3 : node.y + r + 3 + fontSize + 2
            netCtx.font = '8px "Microsoft YaHei", sans-serif'
            netCtx.fillStyle = node.color
            netCtx.globalAlpha = 0.7
            netCtx.textAlign = 'center'
            netCtx.textBaseline = 'top'
            netCtx.fillText(node.emotionText, node.x, etY)
            netCtx.globalAlpha = 1
        }
    }

    netCtx.restore()

    // 离屏焦点箭头指示器
    const focusNode = netNodes.find(n => n.isFocus)
    if (focusNode) {
        const sx = cx + panOffsetX + focusNode.x * zoomScale
        const sy = cy + panOffsetY + focusNode.y * zoomScale
        const margin = 40
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) {
            const dx = sx - cx, dy = sy - cy
            const angle = Math.atan2(dy, dx)
            let edgeX = cx, edgeY = cy
            const cosA = Math.cos(angle), sinA = Math.sin(angle)
            const tRight = cosA > 0 ? (width - margin - cx) / cosA : Infinity
            const tLeft = cosA < 0 ? (margin - cx) / cosA : Infinity
            const tBottom = sinA > 0 ? (height - margin - cy) / sinA : Infinity
            const tTop = sinA < 0 ? (margin - cy) / sinA : Infinity
            const t = Math.min(
                tRight > 0 ? tRight : Infinity,
                tLeft > 0 ? tLeft : Infinity,
                tBottom > 0 ? tBottom : Infinity,
                tTop > 0 ? tTop : Infinity
            )
            if (t < Infinity) { edgeX = cx + cosA * t; edgeY = cy + sinA * t }
            netCtx.save()
            netCtx.translate(edgeX, edgeY)
            netCtx.rotate(angle)
            const arrowSize = 12
            netCtx.globalAlpha = 0.3
            netCtx.beginPath()
            netCtx.arc(0, 0, arrowSize + 4, 0, Math.PI * 2)
            netCtx.fillStyle = '#FFD700'
            netCtx.fill()
            netCtx.globalAlpha = 0.9
            netCtx.beginPath()
            netCtx.moveTo(arrowSize, 0)
            netCtx.lineTo(-arrowSize / 2, -arrowSize / 2)
            netCtx.lineTo(-arrowSize / 2, arrowSize / 2)
            netCtx.closePath()
            netCtx.fillStyle = '#FFD700'
            netCtx.fill()
            netCtx.strokeStyle = 'rgba(0,0,0,0.2)'
            netCtx.lineWidth = 1
            netCtx.stroke()
            netCtx.restore()
        }
    }

    netAnimId = requestAnimationFrame(drawNetwork)
}

// 坐标转换：屏幕坐标 → 图坐标
const screenToGraph = (clientX, clientY) => {
    const rect = networkCanvasRef.value.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const cx = width / 2
    const cy = height / 2
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
        x: (sx - cx - panOffsetX) / zoomScale,
        y: (sy - cy - panOffsetY) / zoomScale
    }
}

// 查找点击的节点
const findNodeAt = (gx, gy) => {
    // 反向遍历（后绘制的在上面）
    for (let i = netNodes.length - 1; i >= 0; i--) {
        const node = netNodes[i]
        const hitR = (node.radius || 20) + 6
        const dx = gx - node.x
        const dy = gy - node.y
        if (dx * dx + dy * dy <= hitR * hitR) return node
    }
    return null
}

// 交互事件
const handleStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    mouseDownX = clientX
    mouseDownY = clientY

    const { x, y } = screenToGraph(clientX, clientY)
    const hit = findNodeAt(x, y)

    if (hit) {
        dragNode = hit
        dragNode.pinned = true
        isGrabbing.value = true
        const { x, y } = screenToGraph(clientX, clientY)
        lastDragX = x; lastDragY = y
        lastDragTime = performance.now()
        dragVelocityX = 0; dragVelocityY = 0
    } else {
        isPanning = true
        lastPanX = clientX
        lastPanY = clientY
        isGrabbing.value = true
    }
}

const handleMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    if (dragNode) {
        const { x, y } = screenToGraph(clientX, clientY)
        const now = performance.now()
        const dt = now - lastDragTime
        if (dt > 0) {
            const alpha = 0.4
            dragVelocityX = alpha * (x - lastDragX) / (dt / 16) + (1 - alpha) * dragVelocityX
            dragVelocityY = alpha * (y - lastDragY) / (dt / 16) + (1 - alpha) * dragVelocityY
        }
        lastDragX = x; lastDragY = y; lastDragTime = now
        dragNode.x = x
        dragNode.y = y
        dragNode.vx = 0
        dragNode.vy = 0
    } else if (isPanning) {
        panOffsetX += clientX - lastPanX
        panOffsetY += clientY - lastPanY
        lastPanX = clientX
        lastPanY = clientY
    }

    if (e.cancelable) e.preventDefault()
}

const handleEnd = (e) => {
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY

    // 判断是否为点击（位移很小）
    const dx = clientX - mouseDownX
    const dy = clientY - mouseDownY
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        const { x, y } = screenToGraph(clientX, clientY)
        const hit = findNodeAt(x, y)
        if (hit && !hit.isFocus) {
            // 点击节点 → 跳转到该角色详情
            selectedCharName.value = hit.id
        }
    }

    if (dragNode) {
        const timeSinceLastMove = performance.now() - lastDragTime
        if (timeSinceLastMove < 150) {
            const maxFlick = MAX_VELOCITY * 2
            dragNode.vx = Math.max(-maxFlick, Math.min(maxFlick, dragVelocityX))
            dragNode.vy = Math.max(-maxFlick, Math.min(maxFlick, dragVelocityY))
        }
        if (!dragNode.isFocus) dragNode.pinned = false
        dragNode = null
    }
    isPanning = false
    isGrabbing.value = false
}

const handleWheel = (e) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = zoomScale * delta
    if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return

    // 以鼠标位置为中心缩放
    const rect = networkCanvasRef.value.getBoundingClientRect()
    const mx = e.clientX - rect.left - rect.width / 2 - panOffsetX
    const my = e.clientY - rect.top - rect.height / 2 - panOffsetY
    panOffsetX -= mx * (delta - 1)
    panOffsetY -= my * (delta - 1)
    zoomScale = newZoom
}

// 启动网络图
const startNetwork = () => {
    initNetworkData()
    initCanvas()
    if (netAnimId) cancelAnimationFrame(netAnimId)
    // 重置视图
    panOffsetX = 0
    panOffsetY = 0
    zoomScale = 1
    drawNetwork()
}

// watch: 切换角色时重建图（焦点过滤）
watch(selectedCharName, async (newVal) => {
    if (!newVal) return
    await nextTick()
    await nextTick()
    startNetwork()
})

// watch: 数据变化时重建图
watch(() => gameStore.npcRelationships, () => {
    if (selectedCharName.value) {
        nextTick(() => {
            initNetworkData()
        })
    }
}, { deep: true })

watch(charList, () => {
    if (selectedCharName.value) {
        nextTick(() => {
            initNetworkData()
        })
    }
}, { deep: true })

onUnmounted(() => {
    if (netAnimId) cancelAnimationFrame(netAnimId)
})
</script>

<template>
  <div class="roster-app">
    <!-- 头部 -->
    <div class="header" :class="{ 'detail-mode': currentChar }">
      <div v-if="currentChar" class="back-btn" @click="selectedCharName = null">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </div>
      <div class="title-wrapper">
        <div class="title">{{ currentChar ? currentChar.name : '天华名录' }}</div>
        <div v-if="!currentChar" class="subtitle">已认识 {{ charList.length }} 位角色</div>
      </div>
      <div class="header-decoration"></div>
    </div>

    <!-- 列表视图 -->
    <div v-if="!currentChar" class="list-container">
      <div 
        v-for="(char, index) in charList" 
        :key="char.id" 
        class="char-item"
        :style="{ '--delay': index * 0.05 + 's' }"
        @click="selectChar(char)"
      >
        <div class="avatar-box">
          <div class="avatar-glow"></div>
          <img v-if="char.avatar" :src="char.avatar" class="avatar-img" />
          <div v-else class="avatar-placeholder">{{ char.name[0] }}</div>
        </div>
        <div class="char-info">
          <div class="char-name">{{ char.name }}</div>
          <div class="char-meta">
            <div class="relationship-badge" :class="char.emotionalState.class">
              {{ char.emotionalState.text }}
            </div>
            <span class="relationship-value">❤️ {{ char.calculatedScore }}</span>
          </div>
          <div class="char-status">
            <span class="location-badge">📍 {{ char.currentLocation }}</span>
            <span class="mood-badge" v-if="char.moodReason" :title="char.moodReason">
              {{ char.moodInfo.icon }} {{ char.moodInfo.text }}
            </span>
            <span class="mood-badge" v-else>
              {{ char.moodInfo.icon }} {{ char.moodInfo.text }}
            </span>
          </div>
        </div>
        <div class="arrow">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
      </div>
      <div v-if="charList.length === 0" class="empty-tip">
        <div class="empty-icon">📖</div>
        <div class="empty-text">暂无认识的角色</div>
        <div class="empty-hint">与校园中的人物互动来建立关系吧</div>
      </div>
    </div>

    <!-- 详情视图 -->
    <div v-else class="detail-container">
      <!-- 头部信息卡片 -->
      <div class="info-card">
          <div class="card-bg-pattern"></div>
          <div class="top-row">
              <div class="big-avatar">
                  <div class="avatar-ring"></div>
                  <img v-if="currentChar.avatar" :src="currentChar.avatar" />
                  <div v-else class="placeholder">{{ currentChar.name[0] }}</div>
              </div>
              <div class="basic-stats">
                  <div class="stat-row highlight">
                      <span class="stat-icon">❤️</span>
                      <span class="label">好感度</span>
                      <span class="value">{{ calculateRelationshipScore(playerRelations) }}</span>
                  </div>
                  <div class="stat-row">
                      <span class="stat-icon">📍</span>
                      <span class="label">{{ currentChar.currentLocation }}</span>
                  </div>
                  <div class="stat-row" v-if="currentChar.moodReason" :title="currentChar.moodReason">
                      <span class="stat-icon">{{ currentChar.moodInfo.icon }}</span>
                      <span class="label">{{ currentChar.moodInfo.text }}</span>
                  </div>
                  <div class="stat-row" v-else>
                      <span class="stat-icon">{{ currentChar.moodInfo.icon }}</span>
                      <span class="label">{{ currentChar.moodInfo.text }}</span>
                  </div>
                  <div class="relation-level-display">
                      <span class="level-label">关系等级</span>
                      <span class="level-badge" :class="getDisplayEmotionalState(playerRelations).class">
                          {{ getDisplayEmotionalState(playerRelations).text }}
                      </span>
                  </div>
              </div>
          </div>
          
          <div class="tags-row" v-if="playerRelations && playerRelations.tags">
              <span v-for="tag in playerRelations.tags" :key="tag" class="roster-tag">{{ tag }}</span>
          </div>
      </div>

      <!-- 玩家关系四维 -->
      <div class="section" v-if="playerRelations">
          <div class="section-title">
            <span class="title-icon">💫</span>
            我的印象
          </div>
          <div class="relation-bars">
              <div class="bar-group">
                  <div class="bar-header">
                      <span class="bar-icon">💙</span>
                      <span class="bar-label">亲密</span>
                      <span class="bar-value">{{ playerRelations.intimacy }}</span>
                  </div>
                  <div class="progress-bg">
                      <div class="progress-fill intimacy" :style="getRelationStyle(playerRelations.intimacy)">
                          <div class="progress-glow"></div>
                      </div>
                  </div>
              </div>
              <div class="bar-group">
                  <div class="bar-header">
                      <span class="bar-icon">💚</span>
                      <span class="bar-label">信赖</span>
                      <span class="bar-value">{{ playerRelations.trust }}</span>
                  </div>
                  <div class="progress-bg">
                      <div class="progress-fill trust" :style="getRelationStyle(playerRelations.trust)">
                          <div class="progress-glow"></div>
                      </div>
                  </div>
              </div>
              <div class="bar-group">
                  <div class="bar-header">
                      <span class="bar-icon">💗</span>
                      <span class="bar-label">激情</span>
                      <span class="bar-value">{{ playerRelations.passion }}</span>
                  </div>
                  <div class="progress-bg">
                      <div class="progress-fill passion" :style="getRelationStyle(playerRelations.passion)">
                          <div class="progress-glow"></div>
                      </div>
                  </div>
              </div>
              <div class="bar-group">
                  <div class="bar-header">
                      <span class="bar-icon">🔥</span>
                      <span class="bar-label">敌意</span>
                      <span class="bar-value">{{ playerRelations.hostility }}</span>
                  </div>
                  <div class="progress-bg">
                      <div class="progress-fill hostility" :style="getHostilityStyle(playerRelations.hostility)">
                          <div class="progress-glow"></div>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      <!-- 全局关系网络图 -->
      <div class="section graph-section">
          <div class="section-title">
            <span class="title-icon">🌐</span>
            人际关系网
            <span class="section-hint">拖动平移 · 滚轮缩放 · 点击角色跳转</span>
          </div>
          <div
            class="canvas-wrapper"
            :class="{ grabbing: isGrabbing }"
            ref="networkContainerRef"
            @mousedown="handleStart"
            @mousemove="handleMove"
            @mouseup="handleEnd"
            @mouseleave="handleEnd"
            @touchstart="handleStart"
            @touchmove="handleMove"
            @touchend="handleEnd"
            @wheel.prevent="handleWheel"
          >
              <canvas ref="networkCanvasRef"></canvas>
              <div class="canvas-overlay"></div>
          </div>
          <div class="graph-legend">
              <div class="legend-item"><span class="legend-line solid blue"></span><span>亲密好友</span></div>
              <div class="legend-item"><span class="legend-line solid green"></span><span>友好</span></div>
              <div class="legend-item"><span class="legend-line solid pink"></span><span>浪漫</span></div>
              <div class="legend-item"><span class="legend-line solid red"></span><span>敌对</span></div>
              <div class="legend-item"><span class="legend-line dashed gray"></span><span>普通/冷淡</span></div>
          </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roster-app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #e8f4fd 0%, #f0f7fb 50%, #fafcfe 100%);
  color: #333;
  overflow: hidden;
}

.header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: linear-gradient(135deg, #4A90D9 0%, #357ABD 50%, #2E6BA8 100%);
  color: white;
  box-shadow: 0 4px 20px rgba(74, 144, 217, 0.35);
  z-index: 10;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.header.detail-mode {
  background: linear-gradient(135deg, #5B9FE6 0%, #4A90D9 100%);
}

.header-decoration {
  position: absolute;
  right: -50px;
  top: -50px;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
  border-radius: 50%;
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(10px);
  margin-right: 12px;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(255,255,255,0.25);
  transform: scale(1.05);
}

.back-btn svg {
  width: 24px;
  height: 24px;
}

.title-wrapper {
  flex: 1;
}

.title {
  font-weight: 700;
  font-size: 18px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.subtitle {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 2px;
}

.list-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.char-item {
  background: white;
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: slideIn 0.4s ease both;
  animation-delay: var(--delay);
  border: 1px solid rgba(74, 144, 217, 0.08);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.char-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(74, 144, 217, 0.15), 0 4px 10px rgba(0,0,0,0.08);
  border-color: rgba(74, 144, 217, 0.2);
}

.char-item:active {
  transform: translateY(0);
}

.avatar-box {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: visible;
  margin-right: 14px;
  position: relative;
  flex-shrink: 0;
}

.avatar-glow {
  position: absolute;
  inset: -4px;
  background: linear-gradient(135deg, #4A90D9 0%, #7CB9F0 100%);
  border-radius: 50%;
  opacity: 0.3;
  filter: blur(6px);
  z-index: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  position: relative;
  z-index: 1;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #4A90D9 0%, #7CB9F0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: bold;
  color: white;
  position: relative;
  z-index: 1;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.online-indicator {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  background: #4ECDC4;
  border-radius: 50%;
  border: 2px solid white;
  z-index: 2;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.char-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 6px;
  color: #2c3e50;
}

.char-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.relationship-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 20px;
  font-weight: 600;
}

.level-best {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  color: #7B5800;
}

.level-good {
  background: linear-gradient(135deg, #FF85B3 0%, #FF6B9D 100%);
  color: white;
}

.level-friend {
  background: linear-gradient(135deg, #4ECDC4 0%, #45B7D1 100%);
  color: white;
}

.level-known {
  background: linear-gradient(135deg, #A8E6CF 0%, #88D8B0 100%);
  color: #3D7A5C;
}

.level-stranger {
  background: #e9ecef;
  color: #6c757d;
}

.level-soulmate {
  background: linear-gradient(135deg, #FF69B4 0%, #BA55D3 50%, #9370DB 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(186, 85, 211, 0.3);
}

.level-lover {
  background: linear-gradient(135deg, #FF1493 0%, #FF69B4 100%);
  color: white;
}

.level-complex {
  background: linear-gradient(135deg, #9C27B0 0%, #673AB7 100%);
  color: white;
}

.level-hostile-extreme {
  background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%);
  color: white;
}

.level-hostile {
  background: #FFCDD2;
  color: #C62828;
}

.level-bad-friend {
  background: #FFE0B2;
  color: #E65100;
}

.level-partner {
  background: #BBDEFB;
  color: #0D47A1;
}

.level-crush {
  background: #F8BBD0;
  color: #C2185B;
  border: 1px dashed #EC407A;
}

.level-dislike {
  background: #CFD8DC;
  color: #455A64;
}

.level-cold {
  background: #ECEFF1;
  color: #78909C;
}

.relationship-value {
  font-size: 12px;
  color: #e74c3c;
  font-weight: 500;
}

.char-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
}

.location-badge {
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}

.mood-badge {
  color: #64748b;
  background: #fff0f3;
  padding: 2px 6px;
  border-radius: 4px;
  color: #d63384;
}

.location-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  color: #1976d2;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.arrow {
  color: #cbd5e1;
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
}

.char-item:hover .arrow {
  transform: translateX(4px);
  color: #4A90D9;
}

.empty-tip {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 18px;
  color: #64748b;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: #94a3b8;
}

/* 详情页样式 */
.detail-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.info-card {
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.card-bg-pattern {
  position: absolute;
  top: 0;
  right: 0;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle at top right, rgba(74, 144, 217, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.top-row {
  display: flex;
  gap: 20px;
  position: relative;
  z-index: 1;
}

.big-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: visible;
  position: relative;
  flex-shrink: 0;
}

.avatar-ring {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4A90D9 0%, #7CB9F0 50%, #4ECDC4 100%);
  animation: ringRotate 4s linear infinite;
}

@keyframes ringRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.big-avatar::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: white;
  z-index: 1;
}

.big-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  position: relative;
  z-index: 2;
}

.big-avatar .placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #4A90D9 0%, #7CB9F0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: bold;
  color: white;
  position: relative;
  z-index: 2;
}

.basic-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.stat-row.highlight {
  padding: 8px 12px;
  background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
  border-radius: 12px;
}

.stat-icon {
  font-size: 16px;
}

.stat-row .label {
  color: #64748b;
  flex: 1;
}

.stat-row .value {
  font-weight: 600;
  color: #2c3e50;
}

.relation-level-display {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.level-label {
  font-size: 12px;
  color: #94a3b8;
}

.level-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}

.roster-tag {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  color: #475569;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 20px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.roster-tag:hover {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
}

.section {
  background: white;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
}

.section-hint {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
  margin-left: auto;
}

.bar-group {
  margin-bottom: 16px;
}

.bar-group:last-child {
  margin-bottom: 0;
}

.bar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.bar-icon {
  font-size: 14px;
}

.bar-label {
  font-size: 13px;
  color: #64748b;
  flex: 1;
}

.bar-value {
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
}

.progress-bg {
  height: 10px;
  background: #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.progress-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%);
}

.progress-fill.intimacy { 
  background: linear-gradient(90deg, #64B5F6 0%, #42A5F5 50%, #2196F3 100%);
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
}

.progress-fill.trust { 
  background: linear-gradient(90deg, #81C784 0%, #66BB6A 50%, #4CAF50 100%);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
}

.progress-fill.passion { 
  background: linear-gradient(90deg, #F06292 0%, #EC407A 50%, #E91E63 100%);
  box-shadow: 0 2px 8px rgba(233, 30, 99, 0.4);
}

.progress-fill.hostility { 
  background: linear-gradient(90deg, #EF5350 0%, #E53935 50%, #D32F2F 100%);
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.4);
}

.canvas-wrapper {
  width: 100%;
  height: 340px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  cursor: grab;
  border: 1px solid #e2e8f0;
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.05);
}

.canvas-wrapper.grabbing {
  cursor: grabbing;
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.canvas-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 16px;
  box-shadow: inset 0 0 30px rgba(0,0,0,0.05);
}

.graph-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 14px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  border-radius: 2px;
}

.legend-line.solid { border: none; }
.legend-line.dashed { border-top: 2px dashed; height: 0; background: none !important; }

.legend-line.blue { background: #3B82F6; border-color: #3B82F6; }
.legend-line.green { background: #10B981; border-color: #10B981; }
.legend-line.pink { background: #EC4899; border-color: #EC4899; }
.legend-line.red { background: #EF4444; border-color: #EF4444; }
.legend-line.gray { background: #94a3b8; border-color: #94a3b8; }
</style>
