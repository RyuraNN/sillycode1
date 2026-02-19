<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { mapData, getChildren, getItem, setMapData, addMapItem } from '../data/mapData'
import { fetchMapDataFromWorldbook, saveMapDataToWorldbook } from '../utils/worldbookParser'
import { useGameStore } from '../stores/gameStore'

// 支持选择模式的 props
const props = defineProps({
  selectionMode: {
    type: Boolean,
    default: false
  },
  selectionTitle: {
    type: String,
    default: '选择地点'
  },
  occupiedLocations: {
    type: Array,
    default: () => []
  },
  // 初始导航到的父地点ID（默认天华学园）
  initialParentId: {
    type: String,
    default: 'tianhua_high_school'
  },
  // 预填充创建表单的ID
  prefillId: {
    type: String,
    default: ''
  },
  // 预填充创建表单的名称
  prefillName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'open-event-editor', 'location-selected'])
const gameStore = useGameStore()

// 编辑状态
const currentParentId = ref(props.initialParentId || 'tianhua_high_school') // 使用 prop 或默认显示天华学园
const path = ref([]) // 导航路径
const mapViewport = ref(null)

// 视口变换
const scale = ref(1)
const offset = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })

// 拖拽/缩放状态
const interactionState = reactive({
  type: null, // 'move', 'resize', 'pan'
  itemId: null,
  startMouse: { x: 0, y: 0 },
  startGrid: { x: 0, y: 0, w: 0, h: 0 }, // 记录拖拽前的网格状态
  resizeHandle: null // 'tl', 'tr', 'bl', 'br'
})

// 长按/双击检测
const lastTap = ref({ time: 0, id: null })
const pendingAction = ref(null) // { timer, startX, startY, item, handle }
const lastTouchDistance = ref(0) // 双指缩放距离
const viewDragStart = ref({ x: 0, y: 0 }) // 视口拖拽起始位置 (用于区分点击和平移)

// 选中的地点
const selectedItem = ref(null)

// 可用标签列表
const availableTags = [
  { value: 'Outdoor', label: '户外' },
  { value: 'Social', label: '社交' },
  { value: 'Entertainment', label: '娱乐' },
  { value: 'Date Spot', label: '约会圣地' },
  { value: 'Study', label: '学习' },
  { value: 'Rest', label: '休息' },
  { value: 'Workplace', label: '工作场所' },
  { value: 'Shopping', label: '购物' },
  { value: 'Dining', label: '餐饮' }
]

// 面包屑状态
const isBreadcrumbExpanded = ref(false)
const breadcrumbContainer = ref(null)
const isDraggingBreadcrumb = ref(false)
const breadcrumbStartX = ref(0)
const breadcrumbScrollLeft = ref(0)

// 面包屑拖拽处理
const startBreadcrumbDrag = (e) => {
  isDraggingBreadcrumb.value = true
  breadcrumbStartX.value = e.clientX
  if (breadcrumbContainer.value) {
    breadcrumbScrollLeft.value = breadcrumbContainer.value.scrollLeft
  }
}

const onBreadcrumbDrag = (e) => {
  if (!isDraggingBreadcrumb.value || !breadcrumbContainer.value) return
  e.preventDefault()
  const delta = e.clientX - breadcrumbStartX.value
  breadcrumbContainer.value.scrollLeft = breadcrumbScrollLeft.value - delta
}

const stopBreadcrumbDrag = () => {
  isDraggingBreadcrumb.value = false
}

// 弹窗状态
const showEditModal = ref(false)
const showCreateModal = ref(false)
const editingItem = ref({}) // 用于表单绑定的临时对象
const createPos = ref({ x: 0, y: 0 }) // 创建新地点时的网格坐标
const hasPartTimeJob = ref(false) // 是否包含兼职岗位
const tempRequirements = ref('') // 临时存储招聘要求字符串

// 当前层级的子地点
const currentItems = computed(() => {
  return getChildren(currentParentId.value)
})

const availableEvents = computed(() => {
  return Array.from(gameStore.eventLibrary.values()).map(e => ({
    id: e.id,
    name: e.name
  }))
})

// 初始化
onMounted(async () => {
  // 确保事件数据已加载
  if (gameStore.eventLibrary.size === 0) {
    await gameStore.loadEventData()
  }

  // 加载数据
  const worldbookData = await fetchMapDataFromWorldbook()
  if (worldbookData && worldbookData.length > 0) {
    setMapData(worldbookData)
  }
  
  // 尝试定位到合理的初始位置
  if (currentParentId.value && !getItem(currentParentId.value)) {
    // 如果找不到指定地点，尝试回退到天华学园
    if (getItem('tianhua_high_school')) {
      currentParentId.value = 'tianhua_high_school'
    } else {
      // 回退到根节点
      currentParentId.value = null
    }
  }

  // 构建面包屑
  updatePath()
  setTimeout(centerMap, 100)
})

// 更新面包屑路径
const updatePath = () => {
  if (currentParentId.value) {
    let current = getItem(currentParentId.value)
    const tempPath = []
    while (current) {
      tempPath.unshift(current)
      current = getItem(current.parentId)
    }
    path.value = tempPath
  } else {
    path.value = []
  }
}

// 自动居中
const centerMap = () => {
  if (!currentItems.value.length) {
    offset.value = { x: 0, y: 0 }
    return
  }
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const unit = 100
  
  let hasValidGrid = false
  currentItems.value.forEach(item => {
    if (!item.grid) return
    const x = item.grid.x * unit
    const y = item.grid.y * unit
    const w = item.grid.w * unit
    const h = item.grid.h * unit
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
    hasValidGrid = true
  })

  if (!hasValidGrid) {
    offset.value = { x: 0, y: 0 }
    return
  }

  const viewportW = window.innerWidth * 0.9
  const viewportH = window.innerHeight * 0.9
  const contentCenterX = (minX + maxX) / 2
  const contentCenterY = (minY + maxY) / 2
  
  offset.value = {
    x: viewportW / 2 - contentCenterX,
    y: viewportH / 2 - contentCenterY
  }
  scale.value = 1
}

// 导航
const navigateTo = (item) => {
  currentParentId.value = item.id
  selectedItem.value = null
  updatePath()
  offset.value = { x: 0, y: 0 }
  scale.value = 1
  centerMap()
}

const navigateUp = () => {
  if (path.value.length > 0) {
    // 回到上一级
    const current = path.value[path.value.length - 1]
    currentParentId.value = current.parentId
    updatePath()
    centerMap()
  }
}

const navigateToBreadcrumb = (index) => {
  if (index === -1) {
    currentParentId.value = null
  } else {
    currentParentId.value = path.value[index].id
  }
  updatePath()
  centerMap()
}

// 坐标转换工具
const screenToWorld = (screenX, screenY) => {
  const rect = mapViewport.value.getBoundingClientRect()
  const localX = screenX - rect.left - offset.value.x
  const localY = screenY - rect.top - offset.value.y
  return {
    x: localX / scale.value,
    y: localY / scale.value
  }
}

const worldToGrid = (worldX, worldY) => {
  return {
    x: Math.floor(worldX / 100),
    y: Math.floor(worldY / 100)
  }
}

// 激活拖拽模式（由长按触发）
const activateDrag = () => {
  if (!pendingAction.value) return
  
  const { item, handle, startX, startY } = pendingAction.value
  
  // 停止平移（如果已经开始）
  interactionState.type = handle ? 'resize' : 'move'
  interactionState.itemId = item.id
  interactionState.startMouse = { x: startX, y: startY }
  interactionState.resizeHandle = handle
  
  if (!item.grid) item.grid = { x: 0, y: 0, w: 1, h: 1 }
  interactionState.startGrid = { ...item.grid }
  
  selectedItem.value = item // 选中
  pendingAction.value = null
}

// 鼠标交互处理
const handleMouseDown = (e, item, handle) => {
  if (e.button !== 0) return 

  // 如果点击的是地点，不阻止冒泡，允许视口也接收事件进行平移
  // 但是启动一个长按计时器
  
  if (item) {
    // 准备长按逻辑
    const timer = setTimeout(() => activateDrag(), 300) // 300ms 长按
    pendingAction.value = {
      timer,
      startX: e.clientX,
      startY: e.clientY,
      item,
      handle
    }
  } else {
    // 点击空白处，直接平移
    interactionState.type = 'pan'
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    viewDragStart.value = { x: e.clientX, y: e.clientY }
  }
  
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (e) => {
  // 检查是否取消长按
  if (pendingAction.value) {
    const dist = Math.hypot(e.clientX - pendingAction.value.startX, e.clientY - pendingAction.value.startY)
    if (dist > 5) {
      clearTimeout(pendingAction.value.timer)
      pendingAction.value = null
      // 继续平移逻辑（不需要做额外操作，因为平移逻辑在下面）
    }
  }

  // 正常交互逻辑
  if (interactionState.type === 'pan') {
    const dx = e.clientX - lastMousePos.value.x
    const dy = e.clientY - lastMousePos.value.y
    offset.value.x += dx
    offset.value.y += dy
    lastMousePos.value = { x: e.clientX, y: e.clientY }
    return
  }
  
  if (interactionState.type === 'move' || interactionState.type === 'resize') {
    // 如果已经激活了拖拽，更新位置
    updateInteraction(e.clientX, e.clientY)
  } else if (!pendingAction.value && !interactionState.type && itemFromPoint(e.clientX, e.clientY)) {
     // 如果没有 pendingAction 且没有 interactionState（比如平移被取消但还在按着？不对）
     // 这里的逻辑是：如果 pendingAction 存在，我们在等长按。
     // 如果移动了，pendingAction 被清空，此时如果没有 interactionState.type，说明是在视口上移动（平移）
     // 但是 handleMouseDown(null) 已经设置了 type='pan'。
     // 如果是 handleMouseDown(item)，我们没设置 type。事件冒泡到 handleMouseDown(null)？
     // 不，handleMouseDown(item) 没有 stopPropagation。
     // 所以 handleMouseDown(null) 会被触发！
     // 我们需要在 handleMouseDown(null) 里判断是否已经点击了 item。
     // 但 item 的 handler 先触发。
  }
}

const handleMouseUp = (e) => {
  if (pendingAction.value) {
    clearTimeout(pendingAction.value.timer)
    // 如果是点击 item 且没有移动太多，视为点击/选中
    const { item } = pendingAction.value
    if (item) {
      handleItemClick(item)
    }
    pendingAction.value = null
  }

  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
  
  interactionState.type = null
  interactionState.itemId = null
}

// 触摸交互处理
const handleTouchStart = (e, item, handle) => {
  // 双指缩放初始化
  if (e.touches.length === 2) {
    const touch1 = e.touches[0]
    const touch2 = e.touches[1]
    lastTouchDistance.value = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    return
  }

  const touch = e.touches[0]
  const now = Date.now()
  
  // 双击检测
  if (item && lastTap.value.id === item.id && now - lastTap.value.time < 300) {
    handleItemDblClick(item)
    lastTap.value = { time: 0, id: null }
    if (pendingAction.value) clearTimeout(pendingAction.value.timer)
    pendingAction.value = null
    e.preventDefault()
    return
  }
  
  if (item) {
    lastTap.value = { time: now, id: item.id }
    
    // 启动长按
    const timer = setTimeout(() => activateDrag(), 300)
    pendingAction.value = {
      timer,
      startX: touch.clientX,
      startY: touch.clientY,
      item,
      handle
    }
    // 不阻止冒泡，允许平移
  } else {
    lastTap.value = { time: 0, id: null }
    interactionState.type = 'pan'
    lastMousePos.value = { x: touch.clientX, y: touch.clientY }
    viewDragStart.value = { x: touch.clientX, y: touch.clientY }
  }
  
  window.addEventListener('touchmove', handleTouchMove, { passive: false })
  window.addEventListener('touchend', handleTouchEnd)
}

const handleTouchMove = (e) => {
  // 双指缩放处理
  if (e.touches.length === 2) {
    e.preventDefault()
    const touch1 = e.touches[0]
    const touch2 = e.touches[1]
    const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    
    const delta = dist - lastTouchDistance.value
    const oldScale = scale.value
    // 灵敏度调整，限制缩放范围
    const newScale = Math.max(0.1, Math.min(5, oldScale + delta * 0.005))
    
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
    return
  }

  const touch = e.touches[0]
  
  if (pendingAction.value) {
    const dist = Math.hypot(touch.clientX - pendingAction.value.startX, touch.clientY - pendingAction.value.startY)
    if (dist > 5) {
      clearTimeout(pendingAction.value.timer)
      pendingAction.value = null
    }
  }

  // 如果已经激活了拖拽，阻止默认滚动
  if (interactionState.type === 'move' || interactionState.type === 'resize') {
    e.preventDefault() 
    updateInteraction(touch.clientX, touch.clientY)
  } else if (interactionState.type === 'pan') {
    e.preventDefault() // 平移也阻止默认滚动
    const dx = touch.clientX - lastMousePos.value.x
    const dy = touch.clientY - lastMousePos.value.y
    offset.value.x += dx
    offset.value.y += dy
    lastMousePos.value = { x: touch.clientX, y: touch.clientY }
  }
}

const handleTouchEnd = (e) => {
  if (pendingAction.value) {
    clearTimeout(pendingAction.value.timer)
    const { item } = pendingAction.value
    if (item) {
      handleItemClick(item)
    }
    pendingAction.value = null
  }

  window.removeEventListener('touchmove', handleTouchMove)
  window.removeEventListener('touchend', handleTouchEnd)
  
  interactionState.type = null
  interactionState.itemId = null
}

const updateInteraction = (clientX, clientY) => {
  const item = mapData.find(i => i.id === interactionState.itemId)
  if (!item) return
  if (!item.grid) item.grid = { x: 0, y: 0, w: 1, h: 1 }

  const dx = (clientX - interactionState.startMouse.x) / scale.value
  const dy = (clientY - interactionState.startMouse.y) / scale.value
  
  const dGridX = Math.round(dx / 100)
  const dGridY = Math.round(dy / 100)
  
  if (interactionState.type === 'move') {
    item.grid.x = interactionState.startGrid.x + dGridX
    item.grid.y = interactionState.startGrid.y + dGridY
  } else if (interactionState.type === 'resize') {
    const handle = interactionState.resizeHandle
    
    if (handle === 'br') { 
      const newW = Math.max(1, interactionState.startGrid.w + dGridX)
      const newH = Math.max(1, interactionState.startGrid.h + dGridY)
      item.grid.w = newW
      item.grid.h = newH
    } else if (handle === 'tl') { 
      const newX = Math.min(interactionState.startGrid.x + dGridX, interactionState.startGrid.x + interactionState.startGrid.w - 1)
      const newY = Math.min(interactionState.startGrid.y + dGridY, interactionState.startGrid.y + interactionState.startGrid.h - 1)
      const newW = interactionState.startGrid.w - (newX - interactionState.startGrid.x)
      const newH = interactionState.startGrid.h - (newY - interactionState.startGrid.y)
      item.grid.x = newX
      item.grid.y = newY
      item.grid.w = newW
      item.grid.h = newH
    } else if (handle === 'tr') { 
      const newY = Math.min(interactionState.startGrid.y + dGridY, interactionState.startGrid.y + interactionState.startGrid.h - 1)
      const newW = Math.max(1, interactionState.startGrid.w + dGridX)
      const newH = interactionState.startGrid.h - (newY - interactionState.startGrid.y)
      item.grid.y = newY
      item.grid.w = newW
      item.grid.h = newH
    } else if (handle === 'bl') { 
      const newX = Math.min(interactionState.startGrid.x + dGridX, interactionState.startGrid.x + interactionState.startGrid.w - 1)
      const newW = interactionState.startGrid.w - (newX - interactionState.startGrid.x)
      const newH = Math.max(1, interactionState.startGrid.h + dGridY)
      item.grid.x = newX
      item.grid.w = newW
      item.grid.h = newH
    }
  }
}

// 视口点击处理
const handleViewportClick = (e) => {
  // 如果是移动操作结束后的点击，忽略
  // 只有真正的点击空白处才触发
  if (e.target.closest('.map-item')) return
  
  // 检查是否发生了拖拽 (移动距离超过 5px)
  const dist = Math.hypot(e.clientX - viewDragStart.value.x, e.clientY - viewDragStart.value.y)
  if (dist > 5) return

  const worldPos = screenToWorld(e.clientX, e.clientY)
  const gridPos = worldToGrid(worldPos.x, worldPos.y)
  
  createPos.value = gridPos
  editingItem.value = {
    id: props.prefillId || '',
    name: props.prefillName || '新地点',
    type: '地点',
    parentId: currentParentId.value,
    grid: { x: gridPos.x, y: gridPos.y, w: 2, h: 2 },
    desc: '',
    openTime: '全天',
    unlockCondition: '无',
    tags: []
  }
  showCreateModal.value = true
}

const handleItemClick = (item) => {
  selectedItem.value = item
}

const handleItemDblClick = (item) => {
  const children = getChildren(item.id)
  if (children.length > 0) {
    navigateTo(item)
  } else {
    openEditModal(item)
  }
}

const handleWheel = (e) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(5, scale.value + delta))
  
  const rect = mapViewport.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  
  const worldX = (mouseX - offset.value.x) / scale.value
  const worldY = (mouseY - offset.value.y) / scale.value
  
  offset.value.x = mouseX - worldX * newScale
  offset.value.y = mouseY - worldY * newScale
  scale.value = newScale
}

const openEditModal = (item) => {
  const copy = JSON.parse(JSON.stringify(item))
  if (!copy.grid) copy.grid = { x: 0, y: 0, w: 1, h: 1 }
  if (!copy.tags) copy.tags = [] // 确保 tags 存在
  editingItem.value = copy
  
  // 初始化兼职设置状态
  if (copy.partTimeJob) {
    hasPartTimeJob.value = true
    tempRequirements.value = (copy.partTimeJob.requirements || []).join(',')
  } else {
    hasPartTimeJob.value = false
    tempRequirements.value = ''
    // 初始化空对象以防报错，但在保存时如果 hasPartTimeJob 为 false 会被清除
    editingItem.value.partTimeJob = {
      title: '',
      salary: '',
      requirements: [],
      description: ''
    }
  }
  
  showEditModal.value = true
}

const saveEdit = () => {
  const item = mapData.find(i => i.id === editingItem.value.id)
  if (item) {
    // 处理兼职数据
    if (hasPartTimeJob.value) {
      if (!editingItem.value.partTimeJob) editingItem.value.partTimeJob = {}
      // 处理数组
      editingItem.value.partTimeJob.requirements = tempRequirements.value
        .split(/[,\n]/) // 支持逗号或换行分隔
        .map(s => s.trim())
        .filter(s => s)
    } else {
      delete editingItem.value.partTimeJob
    }
    
    Object.assign(item, editingItem.value)
  }
  showEditModal.value = false
}

const createItem = () => {
  if (!editingItem.value.id) {
    alert('请输入ID')
    return
  }
  if (mapData.find(i => i.id === editingItem.value.id)) {
    alert('ID已存在')
    return
  }
  
  // 检查是否与已占用的活动室冲突
  if (props.selectionMode && props.occupiedLocations.includes(editingItem.value.name)) {
    alert(`"${editingItem.value.name}" 已被其他社团占用，请使用其他名称`)
    return
  }
  
  addMapItem({ ...editingItem.value })
  showCreateModal.value = false
  
  if (editingItem.value.parentId === currentParentId.value) {
    selectedItem.value = getItem(editingItem.value.id)
  }
  
  // 如果是选择模式，创建后立即回传并关闭
  if (props.selectionMode) {
    emit('location-selected', {
      id: editingItem.value.id,
      name: editingItem.value.name
    })
    emit('close')
  }
}

const deleteItem = () => {
  if (!confirm(`确定要删除 ${editingItem.value.name} 吗？`)) return
  
  const index = mapData.findIndex(i => i.id === editingItem.value.id)
  if (index > -1) {
    mapData.splice(index, 1)
  }
  showEditModal.value = false
  selectedItem.value = null
}

const saveToWorldbook = async () => {
  const success = await saveMapDataToWorldbook(mapData)
  if (success) {
    alert('保存成功！')
  } else {
    alert('保存失败，请检查控制台日志。')
  }
}

const getItemStyle = (item) => {
  const unit = 100
  if (!item.grid) return { display: 'none' }
  return {
    left: `${item.grid.x * unit}px`,
    top: `${item.grid.y * unit}px`,
    width: `${item.grid.w * unit}px`,
    height: `${item.grid.h * unit}px`,
    zIndex: selectedItem.value?.id === item.id ? 100 : 1
  }
}

// 获取地点类型图标
const getTypeIcon = (type) => {
  const icons = {
    '国家': '🌍',
    '城市': '🏙️',
    '区域': '📍',
    '地点': '🏢',
    '房间': '🚪'
  }
  return icons[type] || '📌'
}

// 辅助函数：判断点是否在任何 item 上
const itemFromPoint = (x, y) => {
  // 简单判断，这里不需要精确，只是为了处理 mousemove 时的逻辑覆盖
  return false 
}
</script>

<template>
  <div class="editor-overlay">
    <div class="editor-panel">
      <!-- 顶部工具栏 -->
      <div class="editor-header" :class="{ 'selection-mode': props.selectionMode }">
        <div class="header-left">
          <div class="header-icon">{{ props.selectionMode ? '📍' : '🗺️' }}</div>
          <div class="header-content">
            <div class="title-row">
              <h2 class="header-title">{{ props.selectionMode ? props.selectionTitle : '地图编辑器' }}</h2>
              <button class="breadcrumb-toggle show-on-narrow" @click="isBreadcrumbExpanded = !isBreadcrumbExpanded">
                {{ isBreadcrumbExpanded ? '▲' : '▼' }} 路径
              </button>
            </div>
            
            <!-- 宽屏显示的面包屑 -->
            <div class="breadcrumb hide-on-narrow">
              <span class="crumb" @click="navigateToBreadcrumb(-1)">
                <span class="crumb-icon">🌍</span>
                世界
              </span>
              <span v-for="(item, index) in path" :key="item.id" class="crumb-wrapper">
                <span class="crumb-separator">›</span>
                <span class="crumb" @click="navigateToBreadcrumb(index)">{{ item.name }}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="controls">
          <button class="btn icon-btn" @click="centerMap" title="居中显示">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
          <button class="btn primary" @click="saveToWorldbook">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            保存到世界书
          </button>
          <button class="btn secondary" @click="$emit('close')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            关闭
          </button>
        </div>
      </div>

      <!-- 窄屏折叠面包屑栏 -->
      <div 
        v-if="isBreadcrumbExpanded" 
        class="breadcrumb-bar show-on-narrow"
        ref="breadcrumbContainer"
        @mousedown="startBreadcrumbDrag"
        @mousemove="onBreadcrumbDrag"
        @mouseup="stopBreadcrumbDrag"
        @mouseleave="stopBreadcrumbDrag"
      >
        <div class="breadcrumb-inner">
          <span class="crumb" @click="navigateToBreadcrumb(-1)">
            <span class="crumb-icon">🌍</span>
            世界
          </span>
          <span v-for="(item, index) in path" :key="item.id" class="crumb-wrapper">
            <span class="crumb-separator">›</span>
            <span class="crumb" @click="navigateToBreadcrumb(index)">{{ item.name }}</span>
          </span>
        </div>
      </div>

      <!-- 地图视口 -->
      <div 
        ref="mapViewport"
        class="map-viewport"
        @mousedown="handleMouseDown($event, null)"
        @touchstart="handleTouchStart($event, null)"
        @click="handleViewportClick"
        @wheel="handleWheel"
      >
        <!-- 缩放指示器 -->
        <div class="zoom-indicator">
          <span class="zoom-icon">🔍</span>
          {{ Math.round(scale * 100) }}%
        </div>
        
        <div 
          class="map-container"
          :style="{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
          }"
        >
          <!-- 背景网格层 (无限大) -->
          <div class="grid-layer"></div>

          <!-- 地点列表 -->
          <div 
            v-for="item in currentItems"
            :key="item.id"
            class="map-item"
            :class="{ selected: selectedItem?.id === item.id }"
            :style="getItemStyle(item)"
            @mousedown="handleMouseDown($event, item)"
            @touchstart="handleTouchStart($event, item)"
            @click.stop="handleItemClick(item)"
            @dblclick.stop="handleItemDblClick(item)"
          >
            <div class="item-glow"></div>
            <div class="item-content">
              <div class="item-icon">{{ getTypeIcon(item.type) }}</div>
              <div class="item-name">{{ item.name }}</div>
              <div class="item-id">{{ item.id }}</div>
            </div>

            <!-- 调整大小手柄 (仅选中时显示) -->
            <div v-if="selectedItem?.id === item.id" class="resize-handles">
              <div class="handle tl" @mousedown.stop="handleMouseDown($event, item, 'tl')" @touchstart.stop="handleTouchStart($event, item, 'tl')"></div>
              <div class="handle tr" @mousedown.stop="handleMouseDown($event, item, 'tr')" @touchstart.stop="handleTouchStart($event, item, 'tr')"></div>
              <div class="handle bl" @mousedown.stop="handleMouseDown($event, item, 'bl')" @touchstart.stop="handleTouchStart($event, item, 'bl')"></div>
              <div class="handle br" @mousedown.stop="handleMouseDown($event, item, 'br')" @touchstart.stop="handleTouchStart($event, item, 'br')"></div>
            </div>
            
            <!-- 编辑按钮 (选中时显示) -->
            <button
              v-if="selectedItem?.id === item.id && !props.selectionMode"
              class="edit-btn"
              @mousedown.stop
              @touchstart.stop
              @click.stop="openEditModal(item)"
            >
              ✏️ 编辑
            </button>
            <!-- 选择按钮 (选择模式 + 选中时显示) -->
            <button
              v-if="selectedItem?.id === item.id && props.selectionMode"
              class="edit-btn select-btn"
              @mousedown.stop
              @touchstart.stop
              @click.stop="emit('location-selected', { id: item.id, name: item.name }); emit('close')"
            >
              📍 选择
            </button>
          </div>
        </div>
        
        <!-- 提示信息 -->
        <div class="help-tip" :class="{ 'selection-tip': props.selectionMode }">
          <span v-if="props.selectionMode">📍 点击已有地点选择 · 点击空白处创建新地点</span>
          <span v-else>💡 点击空白处创建地点 · 长按拖动 · 双击进入/编辑</span>
        </div>
      </div>

      <!-- 编辑弹窗 -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-icon">✏️</span>
            <h3>编辑地点</h3>
            <button class="modal-close" @click="showEditModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label><span class="label-icon">🆔</span> ID</label>
              <input v-model="editingItem.id" disabled class="input-disabled">
            </div>
            <div class="form-group">
              <label><span class="label-icon">📝</span> 名称</label>
              <input v-model="editingItem.name" placeholder="输入地点名称">
            </div>
            <div class="form-group">
              <label><span class="label-icon">📁</span> 类型</label>
              <select v-model="editingItem.type">
                <option>国家</option>
                <option>城市</option>
                <option>区域</option>
                <option>地点</option>
                <option>房间</option>
              </select>
            </div>
            <div class="form-group">
              <label><span class="label-icon">📖</span> 描述</label>
              <textarea v-model="editingItem.desc" placeholder="输入地点描述..."></textarea>
            </div>

            <div class="form-group">
              <label><span class="label-icon">🏷️</span> 标签 (多选)</label>
              <div class="tags-container">
                <label 
                  v-for="tag in availableTags" 
                  :key="tag.value" 
                  class="tag-checkbox"
                  :class="{ active: editingItem.tags && editingItem.tags.includes(tag.value) }"
                >
                  <input 
                    type="checkbox" 
                    :value="tag.value" 
                    v-model="editingItem.tags"
                  >
                  {{ tag.label }}
                </label>
              </div>
            </div>

            <div class="form-group">
              <label><span class="label-icon">🕐</span> 开放时间</label>
              <input v-model="editingItem.openTime" placeholder="例如: 18:00-24:00 或 全天">
            </div>
            <div class="form-group">
              <label><span class="label-icon">🔓</span> 解锁条件</label>
              <div class="input-with-action">
                <select v-model="editingItem.unlockCondition">
                  <option value="无">无</option>
                  <option 
                    v-for="event in availableEvents" 
                    :key="event.id" 
                    :value="event.id"
                  >
                    {{ event.name }} ({{ event.id }})
                  </option>
                </select>
                <button class="action-icon-btn" @click="$emit('open-event-editor')" title="打开事件编辑器">
                  📝
                </button>
              </div>
            </div>

            <!-- 兼职设置 -->
            <div class="section-divider">
              <span class="divider-icon">💼</span>
              兼职设置
            </div>
            <div class="form-group checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="hasPartTimeJob">
                <span class="checkbox-custom"></span>
                启用兼职岗位
              </label>
            </div>

            <div v-if="hasPartTimeJob" class="part-time-job-form">
              <div class="form-group">
                <label>岗位名称</label>
                <input v-model="editingItem.partTimeJob.title" placeholder="例如: Live House场务">
              </div>
              <div class="form-group">
                <label>薪资待遇</label>
                <input v-model="editingItem.partTimeJob.salary" placeholder="例如: 1100/小时">
              </div>
              <div class="form-group">
                <label>招聘要求 (逗号分隔)</label>
                <input v-model="tempRequirements" placeholder="例如: 体能 > 70, 魅力 > 50">
              </div>
              <div class="form-group">
                <label>岗位描述</label>
                <textarea v-model="editingItem.partTimeJob.description" placeholder="工作内容描述..."></textarea>
              </div>
            </div>

            <div class="section-divider">
              <span class="divider-icon">📐</span>
              位置与尺寸
            </div>
            <div class="form-row">
              <div class="form-group half">
                <label>X 坐标</label>
                <input type="number" v-model.number="editingItem.grid.x">
              </div>
              <div class="form-group half">
                <label>Y 坐标</label>
                <input type="number" v-model.number="editingItem.grid.y">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group half">
                <label>宽度</label>
                <input type="number" v-model.number="editingItem.grid.w">
              </div>
              <div class="form-group half">
                <label>高度</label>
                <input type="number" v-model.number="editingItem.grid.h">
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn danger" @click="deleteItem">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              删除
            </button>
            <div class="right">
              <button class="btn secondary" @click="showEditModal = false">取消</button>
              <button class="btn primary" @click="saveEdit">确定保存</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建弹窗 -->
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal">
          <div class="modal-header create">
            <span class="modal-icon">✨</span>
            <h3>创建新地点</h3>
            <button class="modal-close" @click="showCreateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label><span class="label-icon">🆔</span> ID (唯一标识)</label>
              <input v-model="editingItem.id" placeholder="例如: new_place_1">
            </div>
            <div class="form-group">
              <label><span class="label-icon">📝</span> 名称</label>
              <input v-model="editingItem.name" placeholder="输入地点名称">
            </div>
            <div class="form-group">
              <label><span class="label-icon">📁</span> 类型</label>
              <select v-model="editingItem.type">
                <option>国家</option>
                <option>城市</option>
                <option>区域</option>
                <option>地点</option>
                <option>房间</option>
              </select>
            </div>
            <div class="form-group">
              <label><span class="label-icon">📖</span> 描述</label>
              <textarea v-model="editingItem.desc" placeholder="输入地点描述..."></textarea>
            </div>
          </div>
          <div class="form-actions">
            <div class="right full">
              <button class="btn secondary" @click="showCreateModal = false">取消</button>
              <button class="btn primary" @click="createItem">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                创建
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed !important;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 100000 !important; /* 必须高于社团创建弹窗 (99999) */
  display: flex;
  justify-content: center;
  align-items: center;
}

.editor-panel {
  width: 95%;
  height: 95%;
  background: linear-gradient(135deg, #1a2332 0%, #0f1419 100%);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.editor-header {
  padding: 16px 24px;
  background: linear-gradient(135deg, #243447 0%, #1a2332 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0; /* 允许收缩 */
  flex: 1; /* 占据剩余空间 */
}

.header-icon {
  font-size: 32px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0; /* 允许子元素缩小 */
  flex: 1;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breadcrumb-toggle {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #b0bec5;
  font-size: 12px;
  padding: 2px 6px;
  cursor: pointer;
  display: none; /* 默认隐藏 */
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  user-select: none; /* 防止拖动时选中文本 */
}

.breadcrumb::-webkit-scrollbar {
  display: none;
}

.breadcrumb-bar {
  background: rgba(20, 25, 35, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  overflow-x: auto;
  white-space: nowrap;
  user-select: none;
  cursor: grab;
  /* 隐藏滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.breadcrumb-bar:active {
  cursor: grabbing;
}

.breadcrumb-bar::-webkit-scrollbar {
  display: none;
}

.breadcrumb-inner {
  display: flex;
  align-items: center;
  gap: 4px;
}

.show-on-narrow {
  display: none;
}

/* 响应式断点：800px 以下视为窄屏 */
@media (max-width: 800px) {
  .hide-on-narrow {
    display: none !important;
  }
  
  .show-on-narrow {
    display: flex !important;
  }
  
  .editor-header {
    padding: 12px 16px;
  }
}

.crumb-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.crumb {
  cursor: pointer;
  color: #64b5f6;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.crumb:hover {
  background: rgba(100, 181, 246, 0.15);
  color: #90caf9;
}

.crumb-icon {
  font-size: 14px;
}

.crumb-separator {
  color: #546e7a;
  font-weight: 300;
}

.controls {
  display: flex;
  gap: 12px;
  flex-shrink: 0; /* 防止按钮被压缩 */
}

.btn {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.btn.icon-btn {
  padding: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #b0bec5;
}

.btn.icon-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.btn.primary {
  background: linear-gradient(135deg, #4CAF50 0%, #43A047 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

/* 选择模式样式 */
.editor-header.selection-mode {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.help-tip.selection-tip {
  background: rgba(102, 126, 234, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #b0bec5;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.btn.danger {
  background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(239, 83, 80, 0.3);
}

.btn.danger:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 83, 80, 0.4);
}

.map-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
  background: linear-gradient(135deg, #1e2a38 0%, #15202b 100%);
}

.map-viewport:active {
  cursor: grabbing;
}

.zoom-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 13px;
  color: #b0bec5;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.zoom-icon {
  font-size: 14px;
}

.help-tip {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 12px;
  color: #78909c;
  z-index: 10;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.map-container {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

/* 虚线网格背景 */
.grid-layer {
  position: absolute;
  top: -5000px;
  left: -5000px;
  width: 10000px;
  height: 10000px;
  background-image: 
    radial-gradient(circle, rgba(100, 181, 246, 0.15) 1px, transparent 1px);
  background-size: 100px 100px;
  pointer-events: none;
}

.map-item {
  position: absolute;
  background: linear-gradient(135deg, rgba(38, 50, 66, 0.95) 0%, rgba(30, 42, 56, 0.95) 100%);
  border: 2px solid rgba(100, 181, 246, 0.3);
  border-radius: 12px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
  cursor: grab;
  transition: all 0.3s ease;
  overflow: hidden;
}

.map-item:active {
  cursor: grabbing;
}

.map-item:hover {
  border-color: rgba(100, 181, 246, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.map-item.selected {
  border-color: #ff9800;
  box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.25), 0 8px 25px rgba(255, 152, 0, 0.2);
  z-index: 100;
}

.item-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(100, 181, 246, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.map-item:hover .item-glow {
  opacity: 1;
}

.item-content {
  text-align: center;
  pointer-events: none;
  padding: 10px;
}

.item-icon {
  font-size: 24px;
  margin-bottom: 6px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.item-name {
  font-weight: 600;
  font-size: 14px;
  color: #ffffff;
  margin-bottom: 4px;
}

.item-id {
  font-size: 10px;
  color: #78909c;
  font-family: monospace;
}

/* 调整手柄 */
.resize-handles .handle {
  position: absolute;
  width: 14px;
  height: 14px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  border: 2px solid white;
  border-radius: 50%;
  z-index: 101;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.resize-handles .handle:hover {
  transform: scale(1.2);
}

.handle.tl { top: -7px; left: -7px; cursor: nwse-resize; }
.handle.tr { top: -7px; right: -7px; cursor: nesw-resize; }
.handle.bl { bottom: -7px; left: -7px; cursor: nesw-resize; }
.handle.br { bottom: -7px; right: -7px; cursor: nwse-resize; }

.edit-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(33, 150, 243, 0.3);
  transition: all 0.2s ease;
}

.edit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(33, 150, 243, 0.4);
}

.edit-btn.select-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
}

.edit-btn.select-btn:hover {
  box-shadow: 0 6px 14px rgba(102, 126, 234, 0.4);
}

/* 弹窗样式 */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 5000;
}

.modal {
  background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  border-radius: 16px;
  width: 520px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 24px;
  background: linear-gradient(135deg, #3182ce 0%, #2b6cb0 100%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header.create {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
}

.modal-icon {
  font-size: 24px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
  flex: 1;
}

.modal-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: white;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 13px;
  color: #e2e8f0;
}

.label-icon {
  font-size: 14px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 14px;
  transition: all 0.2s ease;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #4299e1;
  box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.2);
}

.form-group input.input-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.input-with-action {
  display: flex;
  gap: 10px;
}

.input-with-action select {
  flex: 1;
}

.action-icon-btn {
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s ease;
}

.action-icon-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.section-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 0 12px;
  margin: 8px 0 16px;
  font-weight: 600;
  color: #4299e1;
  font-size: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.divider-icon {
  font-size: 16px;
}

.checkbox-row {
  margin-bottom: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-weight: 500;
  color: #e2e8f0;
}

.checkbox-label input[type="checkbox"] {
  display: none;
}

.checkbox-custom {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.checkbox-label input:checked + .checkbox-custom {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  border-color: transparent;
}

.checkbox-label input:checked + .checkbox-custom::after {
  content: '✓';
  color: white;
  font-size: 14px;
  font-weight: bold;
}

.part-time-job-form {
  background: rgba(0, 0, 0, 0.2);
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  margin-bottom: 16px;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.tag-checkbox {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  user-select: none;
}

.tag-checkbox:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tag-checkbox.active {
  background: rgba(66, 153, 225, 0.2);
  border-color: #4299e1;
  color: #63b3ed;
}

.tag-checkbox input {
  display: none;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-group.half {
  flex: 1;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  padding: 20px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.form-actions .right {
  display: flex;
  gap: 12px;
}

.form-actions .right.full {
  width: 100%;
  justify-content: flex-end;
}
</style>
