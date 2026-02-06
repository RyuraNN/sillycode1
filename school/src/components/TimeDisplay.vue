<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { getItem } from '../data/mapData'

const gameStore = useGameStore()

const locationName = computed(() => {
  const locationId = gameStore.player.location
  const item = getItem(locationId)
  return item ? item.name : locationId
})

const formattedTime = computed(() => {
  const time = gameStore.gameTime || {}
  const year = time.year || 2024
  const month = time.month || 4
  const day = time.day || 1
  const weekday = time.weekday || '星期一'
  const hour = time.hour || 8
  const minute = time.minute || 0

  const minuteStr = minute.toString().padStart(2, '0')
  const hourStr = hour.toString().padStart(2, '0')
  return `${year}年${month}月${day}日 ${weekday} ${hourStr}:${minuteStr}`
})
</script>

<template>
  <div class="time-display">
    <div class="time-text">{{ formattedTime }}</div>
    <div class="location-text">📍 {{ locationName }}</div>
  </div>
</template>

<style scoped>
.time-display {
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid #e0e0e0;
  text-align: center;
  margin-bottom: 10px;
}

.time-text {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.1rem;
  color: #555;
  font-weight: bold;
}

.location-text {
  font-size: 0.9rem;
  color: #666;
  margin-top: 5px;
}
</style>
