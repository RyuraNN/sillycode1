<script setup>
import { defineEmits, ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['back', 'close'])
const gameStore = useGameStore()

const snapshots = computed(() => {
  // 按时间倒序排列
  return [...gameStore.saveSnapshots].sort((a, b) => b.timestamp - a.timestamp)
})

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString()
}

const formatGameTime = (snapshot) => {
  // 1. 优先使用元数据中的时间
  if (snapshot.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameTime
    return `${year}年${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  // 2. 尝试从 gameState 中获取 (兼容旧数据)
  if (snapshot.gameState && snapshot.gameState.gameTime) {
    const { year, month, day, hour, minute } = snapshot.gameState.gameTime
    return `${year}年${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  return '未知时间'
}

// 辅助函数：安全获取位置
const getLocation = (snapshot) => {
  if (snapshot.location) return snapshot.location
  if (snapshot.gameState && snapshot.gameState.player) return snapshot.gameState.player.location
  return null
}

const handleLoad = async (snapshot) => {
  if (confirm(`确定要读取存档 "${snapshot.label}" 吗？\n当前未保存的进度将丢失。`)) {
    const result = gameStore.restoreSnapshot(snapshot.id)
    if (result) {
      alert('读取成功！')
      // 如果是在手机里打开的，可能需要关闭手机界面或者刷新
      // 这里简单触发 close 事件
      emit('close') 
    } else {
      alert('读取失败，存档可能已损坏。')
    }
  }
}

const handleDelete = (snapshot) => {
  if (confirm(`确定要删除存档 "${snapshot.label}" 吗？此操作不可撤销。`)) {
    gameStore.deleteSnapshot(snapshot.id)
  }
}
</script>

<template>
  <div class="load-panel">
    <div class="panel-header">
      <button class="back-btn" @click="$emit('back')">‹</button>
      <span class="title">读取存档</span>
      <div class="spacer"></div>
    </div>
    
    <div class="save-list">
      <div v-if="snapshots.length === 0" class="empty-state">
        暂无存档记录
      </div>
      
      <div v-for="save in snapshots" :key="save.id" class="save-item">
        <div class="save-info" @click="handleLoad(save)">
          <div class="save-label">{{ save.label }}</div>
          <div class="save-time">
            <span class="real-time">{{ formatDate(save.timestamp) }}</span>
          </div>
          <div class="game-info">
            <span class="game-time">游戏时间: {{ formatGameTime(save) }}</span>
            <span class="location" v-if="getLocation(save)">
              📍 {{ getLocation(save) }}
            </span>
          </div>
        </div>
        <div class="save-actions">
          <button class="delete-btn" @click.stop="handleDelete(save)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.load-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f2f2f7;
  color: #000;
}

.panel-header {
  height: 44px;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 0.5px solid rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #007aff;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 30px;
}

.title {
  font-size: 17px;
  font-weight: 600;
}

.spacer {
  width: 30px;
}

.save-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  color: #8e8e93;
  padding-top: 50px;
}

.save-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  transition: background-color 0.2s;
}

.save-item:active {
  background-color: #f2f2f7;
}

.save-info {
  flex: 1;
  cursor: pointer;
}

.save-label {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #000;
}

.save-time {
  font-size: 12px;
  color: #8e8e93;
  margin-bottom: 6px;
}

.game-info {
  font-size: 13px;
  color: #3a3a3c;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.location {
  color: #007aff;
}

.save-actions {
  margin-left: 12px;
  display: flex;
  align-items: center;
}

.delete-btn {
  background: none;
  border: none;
  font-size: 18px;
  padding: 8px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.delete-btn:hover {
  opacity: 1;
  color: #ff3b30;
}
</style>
