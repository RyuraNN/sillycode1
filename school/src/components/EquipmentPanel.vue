<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const slots = [
  { key: 'hat', label: '帽子', icon: '🧢' },
  { key: 'outer', label: '外套', icon: '🧥' },
  { key: 'inner', label: '内搭', icon: '👕' },
  { key: 'pants', label: '下装', icon: '👖' },
  { key: 'socks', label: '袜子', icon: '🧦' },
  { key: 'shoes', label: '鞋子', icon: '👟' },
  { key: 'accessory', label: '饰品', icon: '💍' }
]

const selectedSlot = ref(null)

// 获取当前槽位的装备
const getEquippedItem = (slotKey) => {
  return gameStore.player.equipment[slotKey]
}

// 获取当前槽位可装备的物品
const availableItems = computed(() => {
  if (!selectedSlot.value) return []
  
  // 映射槽位到分类
  const categoryMap = {
    'hat': '服饰-帽子',
    'outer': '服饰-外套',
    'inner': '服饰-内搭',
    'pants': '服饰-下装',
    'socks': '服饰-袜子',
    'shoes': '服饰-鞋子',
    'accessory': '服饰-饰品'
  }
  
  const targetCategory = categoryMap[selectedSlot.value]
  
  return gameStore.player.inventory.filter(item => 
    item.type === 'clothing' && item.category === targetCategory
  )
})

// 装备物品
const equip = (item) => {
  if (selectedSlot.value) {
    gameStore.equipItem(item, selectedSlot.value)
    selectedSlot.value = null
  }
}

// 卸下物品
const unequip = (slotKey) => {
  gameStore.unequipItem(slotKey)
}

// 格式化效果显示
const formatEffect = (effect) => {
  if (!effect || effect.length === 0) return '无效果'
  return effect.map(e => {
    const sign = e.value > 0 ? '+' : ''
    const percent = e.isPercentage ? '%' : ''
    return `${e.attribute}${sign}${e.value}${percent}`
  }).join(', ')
}
</script>

<template>
  <div class="equipment-panel" :class="{ 'dark-mode': gameStore.settings.darkMode }">
    <div class="panel-header">
      <span>装备</span>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    
    <div class="equipment-container">
      <!-- 角色形象区域 (预留) -->
      <div class="character-preview">
        <div class="avatar-placeholder">
          <img :src="gameStore.player.avatar" alt="角色" class="avatar-img" />
        </div>
      </div>
      
      <!-- 装备槽位 -->
      <div class="slots-grid">
        <div 
          v-for="slot in slots" 
          :key="slot.key"
          class="slot-item"
          :class="{ active: selectedSlot === slot.key, filled: !!getEquippedItem(slot.key) }"
          @click="selectedSlot = selectedSlot === slot.key ? null : slot.key"
        >
          <div class="slot-icon">{{ slot.icon }}</div>
          <div class="slot-label">{{ slot.label }}</div>
          
          <!-- 已装备物品显示 -->
          <div v-if="getEquippedItem(slot.key)" class="equipped-item">
            <div class="item-name">{{ getEquippedItem(slot.key).name }}</div>
            <button class="unequip-btn" @click.stop="unequip(slot.key)">×</button>
          </div>
          <div v-else class="empty-slot">空</div>
        </div>
      </div>
    </div>
    
    <!-- 物品选择区域 -->
    <div v-if="selectedSlot" class="item-selector">
      <div class="selector-header">
        选择{{ slots.find(s => s.key === selectedSlot)?.label }}
      </div>
      <div class="selector-list">
        <div v-if="availableItems.length === 0" class="empty-list">
          没有可用的装备
        </div>
        <div 
          v-for="item in availableItems" 
          :key="item.id"
          class="selector-item"
          @click="equip(item)"
        >
          <div class="item-info">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-effect">{{ formatEffect(item.effects) }}</div>
          </div>
          <button class="equip-btn">装备</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.equipment-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 360px;
  height: 500px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  z-index: 2000;
  font-family: 'Ma Shan Zheng', cursive;
}

.equipment-panel.dark-mode {
  background: #1a1a1a;
  color: #e0e0e0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.2rem;
  font-weight: bold;
  color: #333;
}

.dark-mode .panel-header {
  border-bottom-color: #333;
  color: #e0e0e0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  line-height: 1;
}

.equipment-container {
  flex: 1;
  display: flex;
  padding: 16px;
  gap: 16px;
  overflow-y: auto;
}

.character-preview {
  width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #eee;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slots-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slot-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.dark-mode .slot-item {
  border-color: #333;
}

.slot-item:hover {
  background-color: #f9f9f9;
}

.dark-mode .slot-item:hover {
  background-color: #2a2a2a;
}

.slot-item.active {
  border-color: #ff6b35;
  background-color: #fff5f0;
}

.dark-mode .slot-item.active {
  background-color: rgba(255, 107, 53, 0.1);
  border-color: #ff6b35;
}

.slot-item.filled {
  background-color: #f0f9ff;
  border-color: #bae6fd;
}

.dark-mode .slot-item.filled {
  background-color: rgba(186, 230, 253, 0.1);
  border-color: #0ea5e9;
}

.slot-icon {
  font-size: 20px;
  margin-right: 8px;
  width: 30px;
  text-align: center;
}

.slot-label {
  font-size: 14px;
  color: #666;
  width: 40px;
}

.equipped-item {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-left: 8px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.dark-mode .item-name {
  color: #e0e0e0;
}

.empty-slot {
  flex: 1;
  font-size: 12px;
  color: #ccc;
  text-align: center;
}

.unequip-btn {
  background: none;
  border: none;
  color: #ff3b30;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

/* 物品选择器 */
.item-selector {
  height: 200px;
  border-top: 1px solid #eee;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-radius: 0 0 12px 12px;
}

.dark-mode .item-selector {
  background: #222;
  border-top-color: #333;
}

.selector-header {
  padding: 8px 16px;
  font-size: 14px;
  color: #666;
  border-bottom: 1px solid #eee;
}

.dark-mode .selector-header {
  color: #aaa;
  border-bottom-color: #333;
}

.selector-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-list {
  text-align: center;
  color: #999;
  padding: 20px;
  font-size: 13px;
}

.selector-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  border: 1px solid #eee;
}

.dark-mode .selector-item {
  background: #2a2a2a;
  border-color: #333;
}

.selector-item:hover {
  border-color: #ff6b35;
}

.dark-mode .selector-item:hover {
  border-color: #ff6b35;
}

.item-info {
  flex: 1;
}

.item-effect {
  font-size: 12px;
  color: #2e7d32;
}

.equip-btn {
  padding: 4px 12px;
  background: #ff6b35;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
}
</style>
