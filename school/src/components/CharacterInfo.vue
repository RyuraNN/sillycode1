<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import AttributeLevelUp from './AttributeLevelUp.vue'
import ActiveEffectsPanel from './ActiveEffectsPanel.vue'

const gameStore = useGameStore()
const showLevelUp = ref(false)
const isExpanded = ref(true)

const emit = defineEmits(['save'])

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

const attributesList = [
  { key: 'iq', label: '智商' },
  { key: 'eq', label: '情商' },
  { key: 'physique', label: '体能' },
  { key: 'flexibility', label: '灵活' },
  { key: 'charm', label: '魅力' },
  { key: 'mood', label: '心境' }
]

const canLevelUp = computed(() => gameStore.player.freePoints > 0)
</script>

<template>
  <div class="character-info">
    <div class="basic-info">
      <div class="info-row">
        <span class="label">姓名：</span>
        <span class="value">{{ gameStore.player.name }}</span>
      </div>
      <div class="info-row">
        <span class="label">等级：</span>
        <span class="value">{{ gameStore.player.level }}</span>
      </div>
      <!-- 经验条 -->
      <div class="exp-bar-container">
        <div class="exp-bar" :style="{ width: `${gameStore.player.totalExp}%` }"></div>
      </div>
    </div>

    <div class="stats-panel">
      <div class="panel-header" @click="toggleExpand">
        <span>属性详情</span>
        <span class="toggle-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      </div>
      
      <div v-if="isExpanded" class="panel-content">
        <div class="money-row">
          <span class="label">金钱：</span>
          <span class="value">{{ gameStore.player.money }}</span>
        </div>

        <div class="attributes-list">
          <div v-for="attr in attributesList" :key="attr.key" class="attr-item">
            <span class="attr-label">{{ attr.label }}</span>
            <span class="attr-value">{{ gameStore.player.attributes[attr.key] }}</span>
          </div>
        </div>

        <button 
          class="level-up-btn" 
          :class="{ 'active': canLevelUp }"
          :disabled="!canLevelUp"
          @click="showLevelUp = true"
        >
          加点 {{ canLevelUp ? `(${gameStore.player.freePoints})` : '' }}
        </button>
      </div>
    </div>

    <AttributeLevelUp v-if="showLevelUp" @close="showLevelUp = false" @save="$emit('save')" />

    <!-- 活跃效果面板 -->
    <ActiveEffectsPanel />
  </div>
</template>

<style scoped>
.character-info {
  padding: 15px;
  border-bottom: 1px solid #dcdcdc;
  font-family: 'Ma Shan Zheng', cursive;
}

.basic-info {
  margin-bottom: 15px;
  text-align: center;
}

.info-row {
  margin-bottom: 8px;
  font-size: 1.1rem;
}

.label {
  color: #8b4513;
  margin-right: 5px;
}

.value {
  color: #333;
  font-weight: bold;
}

.exp-bar-container {
  width: 80%;
  height: 6px;
  background-color: #e0e0e0;
  border-radius: 3px;
  margin: 5px auto 0;
  overflow: hidden;
}

.exp-bar {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s ease;
}

.stats-panel {
  border-top: 1px dashed #ccc;
  padding-top: 10px;
}

.panel-header {
  padding: 5px 0;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1rem;
  color: #555;
  transition: color 0.3s;
}

.panel-header:hover {
  color: #8b4513;
}

.panel-content {
  padding: 10px;
}

.money-row {
  margin-bottom: 10px;
  border-bottom: 1px dashed #ccc;
  padding-bottom: 5px;
}

.attributes-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.attr-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.level-up-btn {
  width: 100%;
  padding: 5px;
  border: 1px solid #ccc;
  background-color: #f0f0f0;
  color: #999;
  border-radius: 4px;
  cursor: not-allowed;
  transition: all 0.3s;
}

.level-up-btn.active {
  background-color: #8b4513;
  color: white;
  border-color: #8b4513;
  cursor: pointer;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
</style>
