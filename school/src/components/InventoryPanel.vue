<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const currentFilter = ref('all')
const expandedItem = ref(null)
const showUseResult = ref(false)
const useResultMessage = ref('')
const showDiscardConfirm = ref(false)
const itemToDiscard = ref(null)

const filters = [
  { key: 'all', label: '全部' },
  { key: 'consumable', label: '消耗' },
  { key: 'book', label: '书籍' },
  { key: 'clothing', label: '服装' },
  { key: 'gift', label: '礼物' },
  { key: 'entertainment', label: '娱乐' },
  { key: 'exercise', label: '锻炼' },
  { key: 'daily', label: '日用' },
  { key: 'key_item', label: '重要' },
  { key: 'misc', label: '杂项' }
]

const filteredItems = computed(() => {
  if (currentFilter.value === 'all') {
    return gameStore.player.inventory
  }
  return gameStore.player.inventory.filter(item => item.type === currentFilter.value)
})

const toggleItem = (id) => {
  if (expandedItem.value === id) {
    expandedItem.value = null
  } else {
    expandedItem.value = id
  }
}

// 格式化效果显示
const formatEffects = (effects) => {
  if (!effects || !Array.isArray(effects)) return null
  return effects.map(e => {
    const sign = e.value >= 0 ? '+' : ''
    const suffix = e.isPercentage ? '%' : ''
    return `${e.attribute}${sign}${e.value}${suffix}`
  }).join(', ')
}

// 格式化持续时间
const formatDuration = (duration) => {
  if (duration === undefined || duration === null) return null
  if (duration === 0) return '即时生效'
  if (duration === -1 || duration === '永久') return '永久'
  return `持续${duration}回合`
}

const initiateDiscard = (item) => {
  itemToDiscard.value = item
  showDiscardConfirm.value = true
}

const confirmDiscard = () => {
  if (itemToDiscard.value) {
    gameStore.discardItem(itemToDiscard.value)
    showResultToast(`已丢弃 1 个 ${itemToDiscard.value.name}`, 'info')
    showDiscardConfirm.value = false
    itemToDiscard.value = null
  }
}

const cancelDiscard = () => {
  showDiscardConfirm.value = false
  itemToDiscard.value = null
}

const useItem = (item) => {
  // 排除不可直接使用的类型
  if (item.type === 'clothing') {
    showResultToast('请在装备面板中装备此物品', 'warning')
    return
  }
  
  if (item.type === 'key_item') {
    showResultToast('关键物品无法直接使用', 'warning')
    return
  }

  // 通用使用逻辑 (消耗品、书籍、娱乐、锻炼等)
  gameStore.useItem(item)
  
  // 构建使用结果消息
  let message = `使用了 ${item.name}`
  if (item.effects && item.effects.length > 0) {
    const effectsStr = formatEffects(item.effects)
    const durationStr = formatDuration(item.effectDuration)
    message += `\n效果: ${effectsStr}`
    if (durationStr && durationStr !== '即时生效') {
      message += ` (${durationStr})`
    }
  }
  
  showResultToast(message, 'success')
}

// 显示使用结果提示
const showResultToast = (message, type = 'info') => {
  useResultMessage.value = message
  showUseResult.value = true
  setTimeout(() => {
    showUseResult.value = false
  }, 3000)
}
</script>

<template>
  <div class="inventory-panel">
    <div class="panel-header">
      <span>背包</span>
    </div>
    
    <div class="filter-bar">
      <button 
        v-for="filter in filters" 
        :key="filter.key"
        class="filter-btn"
        :class="{ active: currentFilter === filter.key }"
        @click="currentFilter = filter.key"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="items-list">
      <div v-if="filteredItems.length === 0" class="empty-hint">
        背包空空如也
      </div>
      <div 
        v-for="item in filteredItems" 
        :key="item.id" 
        class="item-row"
        @click="toggleItem(item.id)"
      >
        <div class="item-header">
          <span class="item-name">{{ item.name }}</span>
          <span class="item-count">x{{ item.count }}</span>
        </div>
        <div v-if="expandedItem === item.id" class="item-details">
          <p class="item-desc">{{ item.description }}</p>
          
          <!-- 旧版效果描述 -->
          <p class="item-effect" v-if="item.effect && typeof item.effect === 'string'">
            效果：{{ item.effect }}
          </p>
          
          <!-- 新版解析后的效果 -->
          <div v-if="item.effects && item.effects.length > 0" class="effects-info">
            <div class="effects-label">效果：</div>
            <div class="effects-list">
              <span 
                v-for="(effect, idx) in item.effects" 
                :key="idx" 
                class="effect-tag"
                :class="{ positive: effect.value > 0, negative: effect.value < 0 }"
              >
                {{ effect.attribute }}{{ effect.value >= 0 ? '+' : '' }}{{ effect.value }}{{ effect.isPercentage ? '%' : '' }}
              </span>
            </div>
          </div>
          
          <!-- 效果持续时间 -->
          <div v-if="item.effectDuration !== undefined && item.effectDuration !== null" class="duration-info">
            <span class="duration-label">持续：</span>
            <span class="duration-value">{{ formatDuration(item.effectDuration) }}</span>
          </div>
          
          <div class="item-actions">
            <button 
              v-if="item.type !== 'clothing' && item.type !== 'key_item'" 
              class="use-btn"
              @click.stop="useItem(item)"
            >
              使用
            </button>
            <button 
              v-if="item.type === 'clothing'" 
              class="equip-btn"
              @click.stop="$emit('open-equipment')"
            >
              装备
            </button>
            <button 
              class="discard-btn"
              @click.stop="initiateDiscard(item)"
            >
              丢弃
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用结果提示 -->
    <transition name="toast">
      <div v-if="showUseResult" class="use-result-toast">
        {{ useResultMessage }}
      </div>
    </transition>

    <!-- 丢弃确认弹窗 -->
    <Teleport to="body">
      <div v-if="showDiscardConfirm" class="modal-overlay">
        <div class="modal-content confirm-modal">
          <h3>确认丢弃</h3>
          <p class="confirm-text">确定要丢弃 1 个 <span class="highlight-name">{{ itemToDiscard?.name }}</span> 吗？</p>
          <div class="modal-actions">
            <button class="cancel-btn" @click="cancelDiscard">取消</button>
            <button class="confirm-btn" @click="confirmDiscard">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.inventory-panel {
  margin-top: 10px;
  border-top: 1px solid #dcdcdc;
  padding: 10px;
  font-family: 'Ma Shan Zheng', cursive;
  position: relative;
}

.panel-header {
  font-size: 1.2rem;
  color: #444;
  margin-bottom: 10px;
  font-weight: bold;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.filter-btn {
  padding: 2px 8px;
  border: 1px solid #ccc;
  background-color: #f9f9f9;
  border-radius: 10px;
  font-size: 0.8rem;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.filter-btn.active {
  background-color: #8b4513;
  color: white;
  border-color: #8b4513;
}

.items-list {
  max-height: 300px;
  overflow-y: auto;
}

.empty-hint {
  text-align: center;
  color: #999;
  padding: 20px;
  font-size: 0.9rem;
}

.item-row {
  border-bottom: 1px dashed #eee;
  padding: 8px 5px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.item-row:hover {
  background-color: rgba(0,0,0,0.02);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-name {
  color: #333;
  font-weight: bold;
}

.item-count {
  color: #666;
  font-size: 0.9rem;
}

.item-details {
  margin-top: 5px;
  padding: 8px;
  background-color: rgba(255,255,255,0.5);
  border-radius: 4px;
  font-size: 0.85rem;
}

.item-desc {
  margin: 0 0 8px 0;
  color: #555;
  line-height: 1.4;
}

.item-effect {
  margin: 0 0 5px 0;
  color: #2e7d32;
}

.effects-info {
  margin-bottom: 8px;
}

.effects-label {
  color: #666;
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.effects-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.effect-tag {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.effect-tag.positive {
  background: linear-gradient(135deg, rgba(46, 125, 50, 0.15) 0%, rgba(76, 175, 80, 0.1) 100%);
  color: #2e7d32;
  border: 1px solid rgba(46, 125, 50, 0.3);
}

.effect-tag.negative {
  background: linear-gradient(135deg, rgba(198, 40, 40, 0.15) 0%, rgba(239, 83, 80, 0.1) 100%);
  color: #c62828;
  border: 1px solid rgba(198, 40, 40, 0.3);
}

.duration-info {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 0.8rem;
}

.duration-label {
  color: #666;
}

.duration-value {
  color: #ff6f00;
  background: rgba(255, 111, 0, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.item-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.use-btn, .equip-btn {
  padding: 4px 12px;
  background: #8b4513;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.use-btn:hover, .equip-btn:hover {
  background: #a0522d;
  transform: translateY(-1px);
}

.equip-btn {
  background: #1976d2;
}

.equip-btn:hover {
  background: #1565c0;
}

.discard-btn {
  padding: 4px 12px;
  background: #d32f2f;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.discard-btn:hover {
  background: #b71c1c;
  transform: translateY(-1px);
}

/* 确认弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content.confirm-modal {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  text-align: center;
  border: 1px solid #e0e0e0;
}

.confirm-modal h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 1.1rem;
}

.confirm-text {
  color: #666;
  margin-bottom: 20px;
  font-size: 0.95rem;
}

.highlight-name {
  color: #d32f2f;
  font-weight: bold;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 15px;
}

.modal-actions button {
  padding: 6px 20px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.cancel-btn:hover {
  background: #e0e0e0;
}

.confirm-btn {
  background: #d32f2f;
  color: white;
}

.confirm-btn:hover {
  background: #b71c1c;
}

/* 使用结果提示 */
.use-result-toast {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #4caf50 0%, #43a047 100%);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.85rem;
  white-space: pre-line;
  text-align: center;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
  z-index: 100;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* 夜间模式 */
:global(.dark-mode) .inventory-panel {
  border-top-color: rgba(99, 102, 241, 0.2);
}

:global(.dark-mode) .panel-header {
  color: #e0e7ff;
}

:global(.dark-mode) .filter-btn {
  background-color: rgba(30, 30, 50, 0.5);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

:global(.dark-mode) .filter-btn.active {
  background-color: #6366f1;
  border-color: #6366f1;
  color: white;
}

:global(.dark-mode) .item-row {
  border-bottom-color: rgba(99, 102, 241, 0.1);
}

:global(.dark-mode) .item-row:hover {
  background-color: rgba(99, 102, 241, 0.05);
}

:global(.dark-mode) .item-name {
  color: #e0e7ff;
}

:global(.dark-mode) .item-count {
  color: #a5b4fc;
}

:global(.dark-mode) .item-details {
  background-color: rgba(30, 30, 50, 0.5);
}

:global(.dark-mode) .item-desc {
  color: #c4b5fd;
}

:global(.dark-mode) .effects-label,
:global(.dark-mode) .duration-label {
  color: #a5b4fc;
}

:global(.dark-mode) .use-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
}

:global(.dark-mode) .use-btn:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%);
}

:global(.dark-mode) .equip-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

:global(.dark-mode) .equip-btn:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}
</style>
