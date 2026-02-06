import { reactive } from 'vue'

// 使用 reactive 使 mapData 响应式
export const mapData = reactive([])

export const getChildren = (parentId) => {
  return mapData.filter(item => item.parentId === parentId)
}

export const getItem = (id) => {
  return mapData.find(item => item.id === id)
}

// 获取兼职信息
export const getPartTimeJobInfo = (locationId) => {
  const item = getItem(locationId)
  return item ? item.partTimeJob : null
}

// 根据名称获取ID (用于AI指令解析)
export const getIdByName = (name) => {
  const item = mapData.find(item => item.name === name)
  return item ? item.id : null
}

// 设置地图数据
export const setMapData = (newData) => {
  // 清空现有数据
  mapData.splice(0, mapData.length)
  // 添加新数据
  mapData.push(...newData)
}

// 添加单个地点
export const addMapItem = (item) => {
  const index = mapData.findIndex(i => i.id === item.id)
  if (index > -1) {
    mapData[index] = item
  } else {
    mapData.push(item)
  }
}
