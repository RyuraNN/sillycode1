<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { calculateRelationshipScore, getEmotionalState, RELATIONSHIP_AXES, DEFAULT_RELATIONSHIPS } from '../data/relationshipData'
import { findNpcLocation } from '../utils/npcScheduleSystem'
import { getItem } from '../data/mapData'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const selectedCharName = ref(null)
const canvasRef = ref(null)
const sphereContainerRef = ref(null)

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

// === 球形关系图逻辑 ===
let ctx = null
let animationFrameId = null
let nodes = []
let edges = []
let rotationX = 0
let rotationY = 0
let currentRotationX = 0
let currentRotationY = 0
let isDragging = false
let lastMouseX = 0
let lastMouseY = 0

// 初始化关系图数据
const initGraphData = () => {
    if (!currentChar.value) return
    
    nodes = []
    edges = []
    
    const centerCharName = currentChar.value.name
    
    // 获取合并后的关系数据
    const relations = getCharRelations(centerCharName)
    
    // 1. 添加中心节点
    nodes.push({
        id: centerCharName,
        name: centerCharName,
        avatar: currentChar.value.avatar || null,
        isCenter: true,
        x: 0, y: 0, z: 0,
        color: '#FF6B6B'
    })
    
    // 获取所有目标角色名
    const targetNames = Object.keys(relations).filter(name => {
        return true
    })
    
    if (targetNames.length > 0) {
        // 限制节点数量，避免过于拥挤
        const maxNodes = 30
        const displayTargets = targetNames.slice(0, maxNodes)
        
        // 2. 分布周围节点 (斐波那契球面分布)
        const phi = Math.PI * (3 - Math.sqrt(5)) // 黄金角
        
        displayTargets.forEach((targetName, i) => {
            const relData = relations[targetName]
            
            // 计算球面坐标
            const y = 1 - (i / (displayTargets.length - 1)) * 2 // y goes from 1 to -1
            const radius = Math.sqrt(1 - y * y) // radius at y
            
            const theta = phi * i
            
            const x = Math.cos(theta) * radius
            const z = Math.sin(theta) * radius
            
            // 缩放半径
            const R = 120 
            
            nodes.push({
                id: targetName,
                name: targetName,
                isCenter: false,
                x: x * R,
                y: y * R,
                z: z * R,
                color: getNodeColor(relData),
                relation: relData
            })
            
            // 添加连线
            edges.push({
                source: centerCharName,
                target: targetName,
                color: getEdgeColor(relData),
                width: getEdgeWidth(relData)
            })
        })
    }
}

const getNodeColor = (rel) => {
    if (rel.hostility > 50) return '#FF6B6B' // 红 (敌对)
    if (rel.passion > 50) return '#FF85B3' // 粉 (激情)
    if (rel.trust > 60) return '#4ECDC4' // 青绿 (信赖)
    if (rel.intimacy > 60) return '#45B7D1' // 天蓝 (亲密)
    return '#96CEB4' // 柔绿
}

const getEdgeColor = (rel) => {
    if (rel.hostility > 50) return '#FF6B6B' // 红 (敌对)
    if (rel.passion > 50) return '#FF85B3' // 粉 (激情)
    if (rel.trust > 60) return '#4ECDC4' // 青绿 (信赖)
    if (rel.intimacy > 60) return '#45B7D1' // 天蓝 (亲密)
    return '#A8E6CF' // 柔绿
}

const getEdgeWidth = (rel) => {
    const score = Math.max(rel.intimacy, rel.trust, rel.passion, rel.hostility)
    return 1 + (score / 100) * 2.5
}

const initCanvas = () => {
    if (!canvasRef.value) return
    const canvas = canvasRef.value
    // 设置高分辨率
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    // 初始旋转
    currentRotationY = 0.005 
}

const draw = () => {
    if (!ctx || !canvasRef.value) return
    const width = canvasRef.value.width / (window.devicePixelRatio || 1)
    const height = canvasRef.value.height / (window.devicePixelRatio || 1)
    const centerX = width / 2
    const centerY = height / 2
    
    // 清除画布并绘制渐变背景
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) / 2)
    gradient.addColorStop(0, '#1a2a3a')
    gradient.addColorStop(1, '#0d1520')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    
    // 更新旋转
    if (!isDragging) {
        rotationY += 0.003 // 自动旋转
    }
    
    // 缓动
    currentRotationX += (rotationX - currentRotationX) * 0.1
    currentRotationY += (rotationY - currentRotationY) * 0.1
    
    // 投影并排序节点
    const projectedNodes = nodes.map(node => {
        // 旋转
        let x = node.x
        let y = node.y
        let z = node.z
        
        // 绕Y轴旋转
        const cosY = Math.cos(currentRotationY)
        const sinY = Math.sin(currentRotationY)
        const x1 = x * cosY - z * sinY
        const z1 = z * cosY + x * sinY
        
        // 绕X轴旋转
        const cosX = Math.cos(currentRotationX)
        const sinX = Math.sin(currentRotationX)
        const y2 = y * cosX - z1 * sinX
        const z2 = z1 * cosX + y * sinX
        
        // 透视投影
        const scale = 300 / (300 + z2) // 视距 300
        const screenX = centerX + x1 * scale
        const screenY = centerY + y2 * scale
        
        return {
            ...node,
            screenX,
            screenY,
            scale,
            zIndex: z2
        }
    })
    
    // 按 Z 轴排序 (画后面的先画)
    projectedNodes.sort((a, b) => b.zIndex - a.zIndex)
    
    // 绘制连线（带发光效果）
    edges.forEach(edge => {
        const sourceNode = projectedNodes.find(n => n.id === edge.source)
        const targetNode = projectedNodes.find(n => n.id === edge.target)
        
        if (sourceNode && targetNode) {
            const alpha = Math.min(1, Math.max(0.15, (sourceNode.scale + targetNode.scale) / 2 - 0.2))
            
            // 外发光
            ctx.beginPath()
            ctx.moveTo(sourceNode.screenX, sourceNode.screenY)
            ctx.lineTo(targetNode.screenX, targetNode.screenY)
            ctx.strokeStyle = edge.color
            ctx.lineWidth = (edge.width + 3) * ((sourceNode.scale + targetNode.scale) / 2)
            ctx.globalAlpha = alpha * 0.3
            ctx.stroke()
            
            // 主线
            ctx.beginPath()
            ctx.moveTo(sourceNode.screenX, sourceNode.screenY)
            ctx.lineTo(targetNode.screenX, targetNode.screenY)
            ctx.strokeStyle = edge.color
            ctx.lineWidth = edge.width * ((sourceNode.scale + targetNode.scale) / 2)
            ctx.globalAlpha = alpha
            ctx.stroke()
        }
    })
    ctx.globalAlpha = 1
    
    // 绘制节点
    projectedNodes.forEach(node => {
        const size = (node.isCenter ? 10 : 5) * node.scale
        const fontSize = (node.isCenter ? 13 : 10) * node.scale
        const alpha = Math.min(1, Math.max(0.4, node.scale))
        
        // 节点外发光
        ctx.beginPath()
        ctx.arc(node.screenX, node.screenY, size + 4, 0, Math.PI * 2)
        const glowGradient = ctx.createRadialGradient(
            node.screenX, node.screenY, size,
            node.screenX, node.screenY, size + 8
        )
        glowGradient.addColorStop(0, node.color + '80')
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.globalAlpha = alpha
        ctx.fill()
        
        // 绘制节点
        ctx.beginPath()
        ctx.arc(node.screenX, node.screenY, size, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.globalAlpha = alpha
        ctx.fill()
        
        // 节点边框
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5 * node.scale
        ctx.globalAlpha = alpha * 0.6
        ctx.stroke()
        
        // 绘制文字
        ctx.globalAlpha = alpha
        ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        
        // 文字阴影
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 4
        ctx.fillText(node.name, node.screenX, node.screenY + size + 4)
        ctx.shadowBlur = 0
    })
    
    ctx.globalAlpha = 1
    animationFrameId = requestAnimationFrame(draw)
}

// 交互事件处理
const handleStart = (e) => {
    isDragging = true
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    lastMouseX = clientX
    lastMouseY = clientY
}

const handleMove = (e) => {
    if (!isDragging) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    const deltaX = clientX - lastMouseX
    const deltaY = clientY - lastMouseY
    
    rotationY += deltaX * 0.01
    rotationX += deltaY * 0.01
    
    lastMouseX = clientX
    lastMouseY = clientY
    
    if (e.cancelable) e.preventDefault() // 防止页面滚动
}

const handleEnd = () => {
    isDragging = false
}

// 监听 selectedCharName 变化
watch(selectedCharName, async (newVal) => {
    if (newVal) {
        await nextTick()
        initGraphData()
        initCanvas()
        if (animationFrameId) cancelAnimationFrame(animationFrameId)
        draw()
    } else {
        if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
})

// 监听数据变化以支持回溯刷新
watch(() => currentChar.value?.fullData, (newVal) => {
    if (selectedCharName.value && newVal) {
        nextTick(() => {
            initGraphData()
        })
    }
}, { deep: true })

onUnmounted(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
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

      <!-- 球形动态关系图 -->
      <div class="section graph-section">
          <div class="section-title">
            <span class="title-icon">🌐</span>
            人际关系网
            <span class="section-hint">拖动旋转查看</span>
          </div>
          <div 
            class="canvas-wrapper" 
            ref="sphereContainerRef"
            @mousedown="handleStart"
            @mousemove="handleMove"
            @mouseup="handleEnd"
            @mouseleave="handleEnd"
            @touchstart="handleStart"
            @touchmove="handleMove"
            @touchend="handleEnd"
          >
              <canvas ref="canvasRef"></canvas>
              <div class="canvas-overlay"></div>
          </div>
          <div class="graph-legend">
              <div class="legend-item">
                  <span class="dot blue"></span>
                  <span>亲密</span>
              </div>
              <div class="legend-item">
                  <span class="dot green"></span>
                  <span>信赖</span>
              </div>
              <div class="legend-item">
                  <span class="dot pink"></span>
                  <span>激情</span>
              </div>
              <div class="legend-item">
                  <span class="dot red"></span>
                  <span>敌意</span>
              </div>
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
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  cursor: move;
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);
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
  box-shadow: inset 0 0 40px rgba(0,0,0,0.15);
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

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.dot.blue { background: linear-gradient(135deg, #45B7D1 0%, #2196F3 100%); }
.dot.green { background: linear-gradient(135deg, #4ECDC4 0%, #4CAF50 100%); }
.dot.pink { background: linear-gradient(135deg, #FF85B3 0%, #E91E63 100%); }
.dot.red { background: linear-gradient(135deg, #FF6B6B 0%, #D32F2F 100%); }
</style>
