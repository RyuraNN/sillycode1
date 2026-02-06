<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { mapData, getChildren, getItem, setMapData } from '../data/mapData'
import { fetchMapDataFromWorldbook } from '../utils/worldbookParser'
import { useGameStore } from '../stores/gameStore'
import { checkAccess } from '../utils/conditionChecker'
import { getNpcsAtLocation, getNpcCountAtLocation, trackNpc, untrackNpc, isNpcTracked, getTrackedNpcsWithLocations, findNpcLocation } from '../utils/npcScheduleSystem'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const isSelectionMode = computed(() => gameStore.mapSelectionMode)

const currentParentId = ref('tianhua_high_school') // 默认显示天华学园
const path = ref([]) // 导航路径
const mapViewport = ref(null) // 视口引用

// 地图变换状态
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const hasPerformedDrag = ref(false) // 标记是否执行了拖拽或缩放操作
const lastMousePos = ref({ x: 0, y: 0 })
const lastTouchDistance = ref(0)
const dragStartPos = ref({ x: 0, y: 0 }) // 记录拖拽起始位置，用于判断点击

// 末端节点弹窗状态
const showLeafModal = ref(false)
const currentLeafItem = ref(null)
const currentAccessStatus = ref({ allowed: true, reason: '' })

// NPC 在场面板状态
const npcPanelExpanded = ref(true)
const selectedNpcForTracking = ref(null)

// 计算当前显示的子地点
const currentItems = computed(() => {
  return getChildren(currentParentId.value)
})

// 计算当前位置的NPC列表
const currentLocationNpcs = computed(() => {
  // 如果当前正在查看某个地点（path的最后一项），获取该地点的NPC
  if (path.value.length > 0) {
    const currentLoc = path.value[path.value.length - 1]
    return getNpcsAtLocation(currentLoc.id, gameStore)
  }
  return []
})

// 计算被跟踪的NPC及其位置
const trackedNpcsInfo = computed(() => {
  return getTrackedNpcsWithLocations(gameStore)
})

// 获取地点的NPC数量（用于显示在地点卡片上）
const getLocationNpcCount = (locationId) => {
  return getNpcCountAtLocation(locationId)
}

// 切换NPC面板展开状态
const toggleNpcPanel = () => {
  npcPanelExpanded.value = !npcPanelExpanded.value
}

// 切换NPC跟踪状态
const toggleNpcTracking = (npcId) => {
  if (isNpcTracked(npcId)) {
    untrackNpc(npcId)
  } else {
    trackNpc(npcId)
  }
}

// 获取NPC角色类型标签
const getRoleLabel = (role) => {
  const labels = {
    student: '学生',
    teacher: '教师',
    other: '其他'
  }
  return labels[role] || role || '未知'
}

// 定位到某个NPC所在位置
const locateNpc = (npcId) => {
  const locationId = findNpcLocation(npcId, gameStore)
  if (locationId) {
    const locationItem = getItem(locationId)
    if (locationItem && locationItem.parentId) {
      // 导航到该地点的父级
      currentParentId.value = locationItem.parentId
      // 重建路径
      const tempPath = []
      let current = getItem(locationItem.parentId)
      while (current) {
        tempPath.unshift(current)
        current = getItem(current.parentId)
      }
      path.value = tempPath
    }
  }
}

// 检查地点访问权限
const checkItemAccess = (item) => {
  return checkAccess(item, gameStore, getItem)
}

// 定位到玩家
const centerOnPlayer = () => {
  const playerLocId = gameStore.player.location
  if (!playerLocId) return

  const playerItem = getItem(playerLocId)
  if (playerItem) {
    // 如果玩家在某个地点内，显示该地点的父级，这样能看到玩家所在的地点
    if (playerItem.parentId) {
      currentParentId.value = playerItem.parentId
    } else {
      // 如果玩家在顶层（如国家），显示顶层（null）
      currentParentId.value = null
    }
    // 自动居中会由 watch(currentParentId) 触发
  }
}

// 自动居中地图
const centerMap = () => {
  if (!currentItems.value.length) return

  // 计算边界框
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const unit = 100 // 网格单位
  
  currentItems.value.forEach(item => {
    const x = item.grid.x * unit
    const y = item.grid.y * unit
    const w = item.grid.w * unit
    const h = item.grid.h * unit
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  })

  // 视口中心
  const viewportW = window.innerWidth * 0.9 // 90% width
  const viewportH = window.innerHeight * 0.9 // 90% height
  
  // 内容中心
  const contentCenterX = (minX + maxX) / 2
  const contentCenterY = (minY + maxY) / 2
  
  offset.value = {
    x: 2500 - contentCenterX,
    y: 2500 - contentCenterY
  }
  scale.value = 1
}

// 初始化路径和位置
onMounted(async () => {
  // 尝试从世界书加载地图数据
  const worldbookData = await fetchMapDataFromWorldbook()
  if (worldbookData && worldbookData.length > 0) {
    console.log('Loaded map data from worldbook:', worldbookData.length, 'items')
    setMapData(worldbookData)
  }

  if (currentParentId.value) {
    let current = getItem(currentParentId.value)
    // 如果当前ID不存在（可能是因为数据更新了），重置为根节点或第一个国家
    if (!current && mapData.length > 0) {
      // 尝试找一个国家节点
      const nation = mapData.find(item => item.type === '国家')
      if (nation) {
        currentParentId.value = nation.id
        current = nation
      }
    }

    const tempPath = []
    while (current) {
      tempPath.unshift(current)
      current = getItem(current.parentId)
    }
    path.value = tempPath
  }
  // 稍微延迟以确保 DOM 渲染
  setTimeout(centerMap, 100)
})

watch(currentParentId, () => {
  setTimeout(centerMap, 50)
})

// 处理地点点击
const handleItemClick = (item) => {
  const children = getChildren(item.id)
  if (children.length === 0) {
    // 末端节点，显示确认弹窗（即使是选择模式也通过弹窗确认）
    currentLeafItem.value = item
    currentAccessStatus.value = checkItemAccess(item)
    showLeafModal.value = true
  } else {
    // 进入下一级
    path.value.push(item)
    currentParentId.value = item.id
    offset.value = { x: 0, y: 0 }
    scale.value = 1
  }
}

// 确认前往或选择
const confirmTravel = () => {
  if (currentLeafItem.value) {
    if (isSelectionMode.value) {
      // 选择模式：返回地点名称
      gameStore.finishMapSelection(currentLeafItem.value.name)
      emit('close')
      showLeafModal.value = false
      return
    }

    // 正常模式：前往
    const access = checkItemAccess(currentLeafItem.value)
    if (!access.allowed) {
      console.warn('无法前往:', access.reason)
      return
    }
    console.log('前往:', currentLeafItem.value.name)
    gameStore.addCommand(`(前往: ${currentLeafItem.value.name})`)
    emit('close')
    showLeafModal.value = false
  }
}

// 发送当前所在（父级）位置（仅选择模式）
const selectCurrentLocation = () => {
  if (path.value.length > 0) {
    const currentLoc = path.value[path.value.length - 1]
    gameStore.finishMapSelection(currentLoc.name)
    emit('close')
  } else {
    // 可能是根节点，或者未选择
    // 可以尝试获取 currentParentId 对应的名称
    if (currentParentId.value) {
      const item = getItem(currentParentId.value)
      if (item) {
        gameStore.finishMapSelection(item.name)
        emit('close')
      }
    }
  }
}

// 跳转到面包屑中的某一级
const navigateToBreadcrumb = (index) => {
  if (index === -1) {
    path.value = []
    currentParentId.value = null
  } else {
    path.value = path.value.slice(0, index + 1)
    currentParentId.value = path.value[path.value.length - 1].id
  }
}

// 前往当前地点 (仅正常模式)
const goThere = () => {
  const target = path.value.length > 0 ? path.value[path.value.length - 1] : null
  if (target) {
    const access = checkItemAccess(target)
    if (!access.allowed) {
      alert(`无法前往: ${access.reason}`)
      return
    }
    console.log('前往:', target.name)
    gameStore.addCommand(`(前往: ${target.name})`)
    emit('close') // 暂时先关闭地图
  }
}

// 拖拽逻辑
const startDrag = (e) => {
  // 移除阻止逻辑，允许在地点上开始拖拽
  isDragging.value = true
  hasPerformedDrag.value = false
  if (e.type === 'touchstart') {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      lastTouchDistance.value = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
      hasPerformedDrag.value = true // 双指操作直接视为拖拽/缩放
    } else {
      lastMousePos.value = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      dragStartPos.value = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  } else {
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    dragStartPos.value = { x: e.clientX, y: e.clientY }
  }
}

const onDrag = (e) => {
  if (!isDragging.value) return
  e.preventDefault() // 防止滚动

  if (e.type === 'touchmove') {
    if (e.touches.length === 2) {
      // 双指缩放
      hasPerformedDrag.value = true
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
      const delta = dist - lastTouchDistance.value
      
      const oldScale = scale.value
      // 降低灵敏度 (0.01 -> 0.005)
      const newScale = Math.min(Math.max(0.1, oldScale + delta * 0.005), 5)
      
      // 计算双指中心点 (相对于视口中心)
      const rect = mapViewport.value.getBoundingClientRect()
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top
      const viewportCenterX = rect.width / 2
      const viewportCenterY = rect.height / 2
      
      // 向量: 视口中心 -> 捏合中心
      const vecX = centerX - viewportCenterX
      const vecY = centerY - viewportCenterY
      
      // 调整偏移量以保持捏合中心下的点不动
      if (oldScale !== 0) {
        const ratio = newScale / oldScale
        offset.value.x = vecX - (vecX - offset.value.x) * ratio
        offset.value.y = vecY - (vecY - offset.value.y) * ratio
      }

      scale.value = newScale
      lastTouchDistance.value = dist
    } else {
      // 单指拖拽
      const deltaX = e.touches[0].clientX - lastMousePos.value.x
      const deltaY = e.touches[0].clientY - lastMousePos.value.y
      offset.value.x += deltaX
      offset.value.y += deltaY
      lastMousePos.value = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      
      // 检查是否超过移动阈值
      if (!hasPerformedDrag.value) {
        const dist = Math.hypot(e.touches[0].clientX - dragStartPos.value.x, e.touches[0].clientY - dragStartPos.value.y)
        if (dist > 5) hasPerformedDrag.value = true
      }
    }
  } else {
    // 鼠标拖拽
    const deltaX = e.clientX - lastMousePos.value.x
    const deltaY = e.clientY - lastMousePos.value.y
    offset.value.x += deltaX
    offset.value.y += deltaY
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    
    // 检查是否超过移动阈值
    if (!hasPerformedDrag.value) {
      const dist = Math.hypot(e.clientX - dragStartPos.value.x, e.clientY - dragStartPos.value.y)
      if (dist > 5) hasPerformedDrag.value = true
    }
  }
}

const stopDrag = (e) => {
  if (!isDragging.value) return
  isDragging.value = false
  
  // 如果没有发生过拖拽/缩放，且点击的是 map-item，则触发点击逻辑
  if (!hasPerformedDrag.value) {
    const target = e.target.closest('.map-item')
    if (target) {
      const id = target.getAttribute('data-id')
      if (id) {
        const item = getItem(id)
        if (item) handleItemClick(item)
      }
    }
  }
}

// 滚轮缩放 (以鼠标为中心)
const onWheel = (e) => {
  e.preventDefault()
  
  const zoomIntensity = 0.1
  const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity
  const newScale = Math.min(Math.max(0.1, scale.value + delta), 5) // 扩大缩放范围
  
  // 计算鼠标相对于视口的位置
  const rect = mapViewport.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  
  const viewportW = rect.width
  const viewportH = rect.height
  
  // 计算鼠标点在地图“世界”中的逻辑坐标
  const worldMouseX = (mouseX - offset.value.x - viewportW / 2) / scale.value
  const worldMouseY = (mouseY - offset.value.y - viewportH / 2) / scale.value
  
  offset.value.x = mouseX - viewportW / 2 - worldMouseX * newScale
  offset.value.y = mouseY - viewportH / 2 - worldMouseY * newScale
  
  scale.value = newScale
}

// 地图容器样式
const mapContainerStyle = computed(() => {
  return {
    transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
    transformOrigin: 'center',
    transition: isDragging.value ? 'none' : 'transform 0.1s ease-out'
  }
})

// 获取地点的样式
const getItemStyle = (item) => {
  const unit = 100

  return {
    position: 'absolute',
    left: `${item.grid.x * unit}px`,
    top: `${item.grid.y * unit}px`,
    width: `${item.grid.w * unit}px`,
    height: `${item.grid.h * unit}px`,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '2px solid #8b4513',
    borderRadius: '8px',
    padding: '5px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center', // 居中对齐
    alignItems: 'center',
    textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: 1,
    overflow: 'hidden' // 确保子地点预览不溢出
  }
}

// 获取地点名称的样式 (动态字体大小)
const getItemNameStyle = (item) => {
  // 根据宽高中较小的一边来决定字体大小
  const minDim = Math.min(item.grid.w, item.grid.h)
  // 基础大小 1rem，每增加 1 个网格单位增加 0.2rem，上限 3rem
  const fontSize = Math.min(Math.max(0.9, 0.8 + minDim * 0.2), 3)
  
  return {
    fontSize: `${fontSize}rem`,
    zIndex: 10 // 确保文字在子地点之上
  }
}

// 计算预览缩放比例
const calculatePreviewScale = (item) => {
  const children = getChildren(item.id)
  if (children.length === 0) return 1

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  children.forEach(sub => {
    if (sub.grid.x < minX) minX = sub.grid.x
    if (sub.grid.y < minY) minY = sub.grid.y
    if (sub.grid.x + sub.grid.w > maxX) maxX = sub.grid.x + sub.grid.w
    if (sub.grid.y + sub.grid.h > maxY) maxY = sub.grid.y + sub.grid.h
  })

  if (minX === Infinity) return 1

  const contentW = (maxX - minX) || 1
  const contentH = (maxY - minY) || 1
  
  const parentW = item.grid.w
  const parentH = item.grid.h

  const scaleX = (parentW * 0.9) / contentW
  const scaleY = (parentH * 0.9) / contentH
  
  return Math.min(scaleX, scaleY, 0.8)
}

// 计算子地点预览容器的样式（缩放以适应父级）
const getPreviewContainerStyle = (item) => {
  const children = getChildren(item.id)
  if (children.length === 0) return {}

  // 计算子地点的边界框
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  children.forEach(sub => {
    if (sub.grid.x < minX) minX = sub.grid.x
    if (sub.grid.y < minY) minY = sub.grid.y
    if (sub.grid.x + sub.grid.w > maxX) maxX = sub.grid.x + sub.grid.w
    if (sub.grid.y + sub.grid.h > maxY) maxY = sub.grid.y + sub.grid.h
  })

  if (minX === Infinity) return {}

  const contentW = (maxX - minX) || 1
  const contentH = (maxY - minY) || 1
  const unit = 100
  const scale = calculatePreviewScale(item)

  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${contentW * unit}px`,
    height: `${contentH * unit}px`,
    transform: `translate(-50%, -50%) scale(${scale})`,
    pointerEvents: 'none'
  }
}

// 获取子地点预览容器的内部样式
const getPreviewInnerStyle = (item) => {
  const children = getChildren(item.id)
  if (children.length === 0) return {}

  // 计算子地点的边界框
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  children.forEach(sub => {
    if (sub.grid.x < minX) minX = sub.grid.x
    if (sub.grid.y < minY) minY = sub.grid.y
    if (sub.grid.x + sub.grid.w > maxX) maxX = sub.grid.x + sub.grid.w
    if (sub.grid.y + sub.grid.h > maxY) maxY = sub.grid.y + sub.grid.h
  })

  if (minX === Infinity) return {}

  const unit = 100

  return {
    position: 'absolute', // 使用绝对定位
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    // 将内容平移，抵消左上角的空白偏移，使 (minX, minY) 对齐到容器 (0, 0)
    transform: `translate(-${minX * unit}px, -${minY * unit}px)`
  }
}

// 获取子地点的样式 (相对于父级，使用绝对单位)
const getSubItemStyle = (subItem, parentItem) => {
  const unit = 100
  const scale = calculatePreviewScale(parentItem)
  
  // 判断是否需要竖排 (高宽比 > 2)
  const isVertical = subItem.grid.h > subItem.grid.w * 2
  
  // 目标视觉字号约 14px，反向计算实际字号
  let fontSize = Math.max(14 / scale, 12)
  
  // 根据格子尺寸限制最大字号，防止撑破太小的格子
  // 如果是竖排，限制取决于宽度；如果是横排，限制取决于高度（或宽度，视文字长度而定）
  // 这里简单地用最小边长的一半作为限制，但保留最小 10px 的底线
  const minDim = Math.min(subItem.grid.w, subItem.grid.h) * unit
  if (minDim < fontSize) {
    fontSize = Math.max(minDim * 0.8, 10 / scale) // 允许稍微溢出，但不能太小
  }

  return {
    position: 'absolute',
    left: `${subItem.grid.x * unit}px`,
    top: `${subItem.grid.y * unit}px`,
    width: `${subItem.grid.w * unit}px`,
    height: `${subItem.grid.h * unit}px`,
    backgroundColor: 'rgba(200, 230, 201, 0.85)',
    color: '#333',
    border: `${1 / scale}px solid #888`,
    fontSize: `${fontSize}px`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    zIndex: 2,
    overflow: 'hidden',
    padding: `${2 / scale}px`,
    lineHeight: 1.2,
    wordBreak: 'break-word',
    writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb' // 智能竖排
  }
}
</script>

<template>
  <div class="map-overlay">
    <div class="map-panel">
      <div class="map-header" :class="{ 'selection-mode': isSelectionMode }">
        <div class="breadcrumb">
          <span v-if="isSelectionMode" class="mode-hint">请选择地点: </span>
          <span class="crumb" @click="navigateToBreadcrumb(-1)">世界</span>
          <span v-for="(item, index) in path" :key="item.id">
            > <span class="crumb" @click="navigateToBreadcrumb(index)">{{ item.name }}</span>
          </span>
        </div>
        <div class="header-controls">
          <button class="action-btn small" @click="centerOnPlayer" title="定位到玩家">📍</button>
          <button v-if="!isSelectionMode" class="action-btn small" @click="goThere">前往此处</button>
          <!-- 仅在选择模式且路径不为空时显示发送当前位置 -->
          <button v-if="isSelectionMode && path.length > 0" class="action-btn small" @click="selectCurrentLocation">发送当前位置</button>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>
      </div>

      <!-- 地图可视区域 -->
      <div 
        ref="mapViewport"
        class="map-viewport"
        @mousedown="startDrag"
        @mousemove="onDrag"
        @mouseup="stopDrag"
        @mouseleave="stopDrag"
        @touchstart="startDrag"
        @touchmove="onDrag"
        @touchend="stopDrag"
        @wheel="onWheel"
      >
        <div class="map-container" :style="mapContainerStyle">
          <div 
            v-for="item in currentItems" 
            :key="item.id" 
            class="map-item"
            :class="{ locked: !checkItemAccess(item).allowed }"
            :style="getItemStyle(item)"
            :data-id="item.id"
            :title="item.desc"
          >
            <div class="item-name" :style="getItemNameStyle(item)">{{ item.name }}</div>
            <div class="item-type">{{ item.type }}</div>
            <div v-if="item.openTime" class="item-time">{{ item.openTime }}</div>
            
            <!-- 玩家位置标记 -->
            <div v-if="item.id === gameStore.player.location" class="player-marker" title="当前位置">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-geo-alt-fill" viewBox="0 0 16 16">
                <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
              </svg>
            </div>

            <!-- 子地点预览容器 -->
            <div class="preview-container" :style="getPreviewContainerStyle(item)">
              <div class="preview-inner" :style="getPreviewInnerStyle(item)">
                <div 
                  v-for="subItem in getChildren(item.id)" 
                  :key="subItem.id" 
                  class="map-sub-item"
                  :style="getSubItemStyle(subItem, item)"
                  :title="subItem.name"
                >
                  {{ subItem.name }}
                </div>
              </div>
            </div>
          </div>
          
          <!-- 空白提示或网格线 -->
          <div v-if="currentItems.length === 0" class="empty-hint">
            此区域暂无详细地图数据
          </div>
        </div>
      </div>
      
      <!-- 详情面板（底部浮动） -->
      <div v-if="path.length > 0" class="detail-panel">
        <h3>{{ path[path.length - 1].name }}</h3>
        <p>{{ path[path.length - 1].desc }}</p>
        <div v-if="path[path.length - 1].openTime">
          <strong>开放时间:</strong> {{ path[path.length - 1].openTime }}
        </div>
        <div v-if="path[path.length - 1].unlockCondition">
          <strong>解锁条件:</strong> {{ path[path.length - 1].unlockCondition }}
        </div>
        <!-- 实时状态显示 -->
        <div v-if="!checkItemAccess(path[path.length - 1]).allowed" class="status-locked">
          ⛔ {{ checkItemAccess(path[path.length - 1]).reason }}
        </div>
      </div>

      <!-- NPC在场角色面板（右下角） -->
      <div class="npc-presence-panel" v-if="currentLocationNpcs.length > 0 || trackedNpcsInfo.length > 0">
        <div class="panel-header" @click="toggleNpcPanel">
          <span class="panel-title">👥 在场角色</span>
          <span class="npc-count" v-if="currentLocationNpcs.length > 0">({{ currentLocationNpcs.length }})</span>
          <span class="toggle-icon">{{ npcPanelExpanded ? '▼' : '▶' }}</span>
        </div>
        <div class="panel-content" v-if="npcPanelExpanded">
          <!-- 当前位置的NPC列表 -->
          <div v-if="currentLocationNpcs.length > 0" class="npc-section">
            <div class="section-title">📍 此处角色</div>
            <div 
              v-for="npc in currentLocationNpcs.slice(0, 10)" 
              :key="npc.id" 
              class="npc-item"
            >
              <span class="npc-avatar">{{ npc.gender === 'female' ? '👩' : '👨' }}</span>
              <span class="npc-name">{{ npc.name }}</span>
              <span class="npc-role">{{ getRoleLabel(npc.role) }}</span>
              <button 
                class="track-btn" 
                :class="{ tracked: isNpcTracked(npc.id) }"
                @click.stop="toggleNpcTracking(npc.id)"
                :title="isNpcTracked(npc.id) ? '取消跟踪' : '跟踪此角色'"
              >
                {{ isNpcTracked(npc.id) ? '📌' : '📍' }}
              </button>
            </div>
            <div v-if="currentLocationNpcs.length > 10" class="more-hint">
              ...还有 {{ currentLocationNpcs.length - 10 }} 人
            </div>
          </div>
          
          <!-- 被跟踪的NPC列表 -->
          <div v-if="trackedNpcsInfo.length > 0" class="npc-section tracked-section">
            <div class="section-title">🔍 跟踪中</div>
            <div 
              v-for="info in trackedNpcsInfo" 
              :key="info.npc.id" 
              class="npc-item tracked"
              @click="locateNpc(info.npc.id)"
            >
              <span class="npc-avatar">{{ info.npc.gender === 'female' ? '👩' : '👨' }}</span>
              <span class="npc-name">{{ info.npc.name }}</span>
              <span class="npc-location">@ {{ info.locationName }}</span>
              <button 
                class="track-btn tracked"
                @click.stop="toggleNpcTracking(info.npc.id)"
                title="取消跟踪"
              >
                ❌
              </button>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="currentLocationNpcs.length === 0 && trackedNpcsInfo.length === 0" class="empty-state">
            此处暂无角色
          </div>
        </div>
      </div>

      <!-- 前往/选择确认弹窗 -->
      <div v-if="showLeafModal" class="leaf-modal-overlay">
        <div class="leaf-modal">
          <h3>{{ isSelectionMode ? '选择确认' : '前往确认' }}</h3>
          <p>确定要{{ isSelectionMode ? '选择' : '前往' }} <strong>{{ currentLeafItem?.name }}</strong> 吗？</p>
          <p class="desc-text">{{ currentLeafItem?.desc }}</p>
          
          <div v-if="currentLeafItem?.openTime">
            <strong>开放时间:</strong> {{ currentLeafItem.openTime }}
          </div>
          <div v-if="currentLeafItem?.unlockCondition">
            <strong>解锁条件:</strong> {{ currentLeafItem.unlockCondition }}
          </div>

          <div v-if="!isSelectionMode && !currentAccessStatus.allowed" class="modal-warning">
            ⛔ {{ currentAccessStatus.reason }}
          </div>

          <div class="modal-actions">
            <button 
              class="action-btn" 
              :class="{ disabled: !isSelectionMode && !currentAccessStatus.allowed }"
              @click="confirmTravel"
              :disabled="!isSelectionMode && !currentAccessStatus.allowed"
            >
              {{ isSelectionMode ? '发送此位置' : '出发' }}
            </button>
            <button class="action-btn secondary" @click="showLeafModal = false">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== CSS 变量与主题 ==================== */
.map-overlay {
  --map-bg: linear-gradient(135deg, #e8f4f8 0%, #d4e8ec 50%, #c5dce3 100%);
  --map-grid-color: rgba(100, 150, 180, 0.15);
  --map-grid-major: rgba(100, 150, 180, 0.25);
  --panel-bg: #fdfbf3;
  --header-bg: rgba(255, 255, 255, 0.95);
  --header-border: rgba(0, 0, 0, 0.08);
  --text-primary: #2c3e50;
  --text-secondary: #666;
  --text-tertiary: #999;
  --accent-color: #3498db;
  --accent-warm: #e67e22;
  --danger-color: #e74c3c;
  --success-color: #27ae60;
  --card-bg: rgba(255, 255, 255, 0.95);
  --card-border: rgba(139, 69, 19, 0.3);
  --card-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  --modal-bg: rgba(0, 0, 0, 0.6);
  
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.map-panel {
  width: 92%;
  height: 92%;
  background: var(--panel-bg);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
  position: relative;
}

/* ==================== 头部 ==================== */
.map-header {
  padding: 12px 20px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--header-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 100;
}

.map-header.selection-mode {
  background: linear-gradient(90deg, rgba(39, 174, 96, 0.1) 0%, rgba(46, 204, 113, 0.05) 100%);
  border-bottom: 2px solid var(--success-color);
}

.mode-hint {
  color: var(--success-color);
  font-weight: 600;
  margin-right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.mode-hint::before {
  content: "📍";
}

.breadcrumb {
  font-size: 0.95rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.crumb {
  cursor: pointer;
  color: var(--accent-warm);
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.crumb:hover {
  background: rgba(230, 126, 34, 0.1);
  text-decoration: none;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-btn.small {
  padding: 8px 16px;
  font-size: 0.85rem;
  background: linear-gradient(135deg, var(--accent-warm) 0%, #d35400 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(230, 126, 34, 0.3);
}

.action-btn.small:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(230, 126, 34, 0.4);
}

.action-btn.small:active {
  transform: translateY(0);
}

.close-btn {
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  border-radius: 50%;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(231, 76, 60, 0.1);
  color: var(--danger-color);
}

/* ==================== 地图视口 ==================== */
.map-viewport {
  flex: 1;
  background: var(--map-bg);
  overflow: hidden;
  position: relative;
  cursor: grab;
  /* 精美网格背景 */
  background-image: 
    linear-gradient(var(--map-grid-major) 2px, transparent 2px),
    linear-gradient(90deg, var(--map-grid-major) 2px, transparent 2px),
    linear-gradient(var(--map-grid-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--map-grid-color) 1px, transparent 1px),
    var(--map-bg);
  background-size: 100px 100px, 100px 100px, 25px 25px, 25px 25px, 100% 100%;
  background-position: -2px -2px, -2px -2px, -1px -1px, -1px -1px, 0 0;
}

.map-viewport:active {
  cursor: grabbing;
}

/* 地图装饰 - 指南针 */
.map-viewport::before {
  content: "N";
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: var(--danger-color);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  z-index: 50;
  font-size: 14px;
}

.map-container {
  width: 5000px;
  height: 5000px;
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -2500px;
  margin-left: -2500px;
}

/* ==================== 地图项目卡片 ==================== */
.map-item {
  background: var(--card-bg) !important;
  border: 2px solid var(--card-border) !important;
  border-radius: 12px !important;
  box-shadow: var(--card-shadow), 0 0 0 1px rgba(255, 255, 255, 0.5) inset !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.map-item:hover {
  background: #fff !important;
  z-index: 10;
  transform: scale(1.05) translateY(-4px);
  border-color: var(--accent-color) !important;
  box-shadow: 0 8px 24px rgba(52, 152, 219, 0.25), 0 0 0 2px rgba(52, 152, 219, 0.1) !important;
}

.item-name {
  font-weight: 700;
  font-size: 1.1rem;
  margin-bottom: 6px;
  color: var(--text-primary);
  position: relative;
  z-index: 10;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8);
}

.item-type {
  font-size: 0.8rem;
  color: white;
  background: linear-gradient(135deg, var(--accent-color) 0%, #2980b9 100%);
  padding: 3px 10px;
  border-radius: 12px;
  position: relative;
  z-index: 10;
  display: inline-block;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(52, 152, 219, 0.2);
}

.item-time {
  font-size: 0.75rem;
  color: white;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 95%;
  background: linear-gradient(135deg, var(--danger-color) 0%, #c0392b 100%);
  padding: 2px 8px;
  border-radius: 8px;
  position: relative;
  z-index: 10;
  display: inline-block;
  font-weight: 500;
}

/* 玩家位置标记 */
.player-marker {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--danger-color);
  z-index: 20;
  filter: drop-shadow(0 2px 4px rgba(231, 76, 60, 0.4));
  animation: player-pulse 1.5s ease-in-out infinite;
}

@keyframes player-pulse {
  0%, 100% { 
    transform: translateY(0) scale(1); 
    opacity: 1;
  }
  50% { 
    transform: translateY(-6px) scale(1.1); 
    opacity: 0.8;
  }
}

.map-item.locked {
  filter: grayscale(80%) brightness(0.95);
  opacity: 0.75;
  background: linear-gradient(135deg, #e0e0e0 0%, #bdbdbd 100%) !important;
  border-color: #9e9e9e !important;
}

.map-item.locked:hover {
  transform: scale(1.02);
  box-shadow: var(--card-shadow) !important;
}

.empty-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.3rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.9);
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: var(--card-shadow);
}

/* ==================== 详情面板 ==================== */
.detail-panel {
  position: absolute;
  bottom: 24px;
  left: 24px;
  width: 320px;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.8);
  z-index: 80;
}

.detail-panel h3 {
  margin: 0 0 12px 0;
  color: var(--accent-warm);
  border-bottom: 2px solid rgba(230, 126, 34, 0.2);
  padding-bottom: 8px;
  font-size: 1.1rem;
}

.detail-panel p {
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.detail-panel div {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.detail-panel strong {
  color: var(--text-primary);
}

.status-locked {
  color: var(--danger-color);
  font-weight: 600;
  margin-top: 12px;
  padding: 10px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ==================== 子地点预览 ==================== */
.map-sub-item {
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px;
  border-radius: 6px !important;
  background: rgba(200, 230, 201, 0.9) !important;
  border: 1px solid rgba(76, 175, 80, 0.3) !important;
  font-weight: 500;
}

/* ==================== 模态框 ==================== */
.leaf-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--modal-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.leaf-modal {
  background: white;
  padding: 28px;
  border-radius: 20px;
  width: 340px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modal-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes modal-pop {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.leaf-modal h3 {
  margin: 0 0 16px 0;
  color: var(--accent-warm);
  font-size: 1.3rem;
}

.desc-text {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin: 16px 0;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.action-btn {
  padding: 12px 28px;
  background: linear-gradient(135deg, var(--success-color) 0%, #229954 100%);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(39, 174, 96, 0.4);
}

.action-btn.secondary {
  background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
  box-shadow: 0 4px 12px rgba(127, 140, 141, 0.3);
}

.action-btn.secondary:hover {
  box-shadow: 0 6px 16px rgba(127, 140, 141, 0.4);
}

.action-btn.disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  box-shadow: none;
}

.action-btn.disabled:hover {
  transform: none;
}

.modal-warning {
  color: var(--danger-color);
  font-weight: 600;
  margin: 16px 0;
  padding: 12px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 10px;
  border: 1px solid rgba(231, 76, 60, 0.2);
}

/* ==================== 夜间模式 ==================== */
:global(body.dark-mode) .map-overlay {
  --map-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  --map-grid-color: rgba(100, 180, 255, 0.08);
  --map-grid-major: rgba(100, 180, 255, 0.15);
  --panel-bg: linear-gradient(180deg, #1e1e2f 0%, #141421 100%);
  --header-bg: rgba(30, 30, 47, 0.95);
  --header-border: rgba(255, 255, 255, 0.08);
  --text-primary: #e8e8e8;
  --text-secondary: #a0a0a0;
  --text-tertiary: #707070;
  --accent-color: #4fc3f7;
  --accent-warm: #ffb74d;
  --danger-color: #ef5350;
  --success-color: #66bb6a;
  --card-bg: rgba(40, 40, 60, 0.95);
  --card-border: rgba(100, 180, 255, 0.2);
  --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(100, 180, 255, 0.05);
  --modal-bg: rgba(0, 0, 0, 0.8);
}

:global(body.dark-mode) .map-panel {
  background: var(--panel-bg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 100px rgba(100, 180, 255, 0.1);
}

:global(body.dark-mode) .map-viewport {
  /* 夜间星空效果 */
  background-image: 
    radial-gradient(1px 1px at 20px 30px, rgba(255, 255, 255, 0.3), transparent),
    radial-gradient(1px 1px at 40px 70px, rgba(255, 255, 255, 0.2), transparent),
    radial-gradient(1px 1px at 50px 160px, rgba(255, 255, 255, 0.3), transparent),
    radial-gradient(1px 1px at 90px 40px, rgba(255, 255, 255, 0.2), transparent),
    radial-gradient(1px 1px at 130px 80px, rgba(255, 255, 255, 0.3), transparent),
    radial-gradient(1px 1px at 160px 120px, rgba(255, 255, 255, 0.2), transparent),
    linear-gradient(var(--map-grid-major) 2px, transparent 2px),
    linear-gradient(90deg, var(--map-grid-major) 2px, transparent 2px),
    linear-gradient(var(--map-grid-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--map-grid-color) 1px, transparent 1px),
    var(--map-bg);
  background-size: 200px 200px, 200px 200px, 200px 200px, 200px 200px, 200px 200px, 200px 200px,
                   100px 100px, 100px 100px, 25px 25px, 25px 25px, 100% 100%;
}

:global(body.dark-mode) .map-viewport::before {
  background: rgba(30, 30, 47, 0.9);
  color: var(--accent-color);
  border: 1px solid rgba(100, 180, 255, 0.3);
  box-shadow: 0 2px 15px rgba(100, 180, 255, 0.2);
}

:global(body.dark-mode) .map-item {
  background: var(--card-bg) !important;
  border: 2px solid var(--card-border) !important;
  box-shadow: var(--card-shadow), 0 0 20px rgba(100, 180, 255, 0.05) inset !important;
}

:global(body.dark-mode) .map-item:hover {
  background: rgba(50, 50, 75, 0.98) !important;
  border-color: var(--accent-color) !important;
  box-shadow: 0 8px 30px rgba(79, 195, 247, 0.3), 0 0 30px rgba(79, 195, 247, 0.1) !important;
}

:global(body.dark-mode) .item-name {
  color: var(--text-primary);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

:global(body.dark-mode) .item-type {
  background: linear-gradient(135deg, var(--accent-color) 0%, #0288d1 100%);
}

:global(body.dark-mode) .map-item.locked {
  filter: brightness(0.6) saturate(0.3);
  background: rgba(60, 60, 80, 0.9) !important;
  border-color: rgba(100, 100, 120, 0.5) !important;
}

:global(body.dark-mode) .detail-panel {
  background: rgba(30, 30, 47, 0.95);
  border: 1px solid rgba(100, 180, 255, 0.15);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(100, 180, 255, 0.05);
}

:global(body.dark-mode) .detail-panel h3 {
  color: var(--accent-warm);
  border-bottom-color: rgba(255, 183, 77, 0.3);
}

:global(body.dark-mode) .leaf-modal {
  background: linear-gradient(180deg, #2a2a3e 0%, #1e1e2f 100%);
  border: 1px solid rgba(100, 180, 255, 0.2);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(100, 180, 255, 0.1);
}

:global(body.dark-mode) .leaf-modal h3 {
  color: var(--accent-warm);
}

:global(body.dark-mode) .desc-text {
  color: var(--text-secondary);
}

:global(body.dark-mode) .empty-hint {
  background: rgba(30, 30, 47, 0.95);
  color: var(--text-secondary);
  border: 1px solid rgba(100, 180, 255, 0.15);
}

:global(body.dark-mode) .map-sub-item {
  background: rgba(76, 175, 80, 0.2) !important;
  border-color: rgba(76, 175, 80, 0.4) !important;
  color: #a5d6a7 !important;
}

:global(body.dark-mode) .action-btn.small {
  background: linear-gradient(135deg, var(--accent-warm) 0%, #f57c00 100%);
}

:global(body.dark-mode) .close-btn {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}

:global(body.dark-mode) .close-btn:hover {
  background: rgba(239, 83, 80, 0.2);
  color: var(--danger-color);
}

:global(body.dark-mode) .crumb {
  color: var(--accent-warm);
}

:global(body.dark-mode) .crumb:hover {
  background: rgba(255, 183, 77, 0.15);
}

:global(body.dark-mode) .modal-warning {
  background: rgba(239, 83, 80, 0.15);
  border-color: rgba(239, 83, 80, 0.3);
}

:global(body.dark-mode) .status-locked {
  background: rgba(239, 83, 80, 0.15);
}

/* ==================== 移动端适配 ==================== */
@media (max-width: 768px) {
  .map-panel {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  .map-header {
    padding: 10px 16px;
  }

  .detail-panel {
    width: calc(100% - 32px);
    bottom: 16px;
    left: 16px;
    padding: 16px;
  }
  
  .item-name {
    font-size: 0.9rem;
  }

  .leaf-modal {
    width: 90%;
    max-width: 340px;
    padding: 24px;
  }

  .breadcrumb {
    font-size: 0.85rem;
  }

  .action-btn.small {
    padding: 6px 12px;
    font-size: 0.8rem;
  }
}

/* ==================== NPC在场面板样式 ==================== */
.npc-presence-panel {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 280px;
  max-height: 60vh;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.8);
  z-index: 90;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-header {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background: rgba(255, 255, 255, 0.8);
}

.panel-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.npc-count {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-left: 6px;
  font-weight: normal;
}

.toggle-icon {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  transition: transform 0.3s;
}

.panel-content {
  overflow-y: auto;
  flex: 1;
  padding: 0;
}

.npc-section {
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.npc-section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  padding: 0 16px 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.npc-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  transition: background 0.2s;
  cursor: default;
}

.npc-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.npc-item.tracked {
  cursor: pointer;
  background: rgba(52, 152, 219, 0.05);
}

.npc-item.tracked:hover {
  background: rgba(52, 152, 219, 0.1);
}

.npc-avatar {
  font-size: 1.2rem;
  margin-right: 10px;
  width: 24px;
  text-align: center;
}

.npc-name {
  font-size: 0.9rem;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.npc-role {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
}

.npc-location {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-right: 8px;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px;
  border-radius: 4px;
  opacity: 0.3;
  transition: all 0.2s;
}

.track-btn:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.05);
  transform: scale(1.1);
}

.track-btn.tracked {
  opacity: 1;
  color: var(--danger-color);
}

.more-hint {
  padding: 8px 16px;
  font-size: 0.8rem;
  color: var(--text-tertiary);
  text-align: center;
  font-style: italic;
}

.empty-state {
  padding: 30px 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.9rem;
}

/* 夜间模式适配 */
:global(body.dark-mode) .npc-presence-panel {
  background: rgba(30, 30, 47, 0.95);
  border-color: rgba(100, 180, 255, 0.15);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
}

:global(body.dark-mode) .panel-header {
  background: rgba(40, 40, 60, 0.5);
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

:global(body.dark-mode) .panel-header:hover {
  background: rgba(50, 50, 80, 0.8);
}

:global(body.dark-mode) .npc-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

:global(body.dark-mode) .npc-item.tracked {
  background: rgba(79, 195, 247, 0.1);
}

:global(body.dark-mode) .npc-item.tracked:hover {
  background: rgba(79, 195, 247, 0.2);
}

:global(body.dark-mode) .npc-role {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
}

:global(body.dark-mode) .track-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

:global(body.dark-mode) .npc-section {
  border-bottom-color: rgba(255, 255, 255, 0.05);
}
</style>
