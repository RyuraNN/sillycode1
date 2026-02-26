<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { detectCardEdition, getEditionLabel, GAME_VERSION } from '../utils/editionDetector'
import { isBlacklistedDomain } from '../utils/domainBlacklist'

defineProps({
  loadResults: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['enter'])

const cardEdition = computed(() => detectCardEdition())
const editionLabel = computed(() => getEditionLabel(cardEdition.value))

const isBlacklisted = ref(false)
const countdown = ref(15)
let countdownTimer = null

onMounted(() => {
  if (isBlacklistedDomain()) {
    isBlacklisted.value = true
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const dataModules = [
  { key: 'classData', icon: '🏫', label: '班级数据' },
  { key: 'clubData', icon: '🎭', label: '社团数据' },
  { key: 'mapData', icon: '🗺️', label: '地图数据' },
  { key: 'partTimeData', icon: '💼', label: '兼职数据' },
  { key: 'courseData', icon: '📚', label: '课程数据' },
  { key: 'eventData', icon: '📋', label: '事件数据' },
  { key: 'scheduleData', icon: '🕐', label: '角色日程数据' },
  { key: 'shopData', icon: '🛒', label: '商品目录' },
  { key: 'academicData', icon: '📊', label: '学力数据' },
  { key: 'tagData', icon: '🏷️', label: '角色标签数据' },
  { key: 'socialData', icon: '💬', label: '社交关系数据' },
]

function getStatusIcon(val) {
  if (val === null) return '⏳'
  return val ? '🟢' : '🔴'
}

const announcements = [
  {
    icon: '🤖',
    html: 'RAG 记忆系统的 API 请填写<b>嵌入/重排序模型</b>，不要填聊天模型。<a href="https://docs.google.com/document/d/1P-NINc-hnFGgDH8W2yCqB7-w_rpmOEFhkyQE-J7Bj8M/edit?usp=sharing" target="_blank" rel="noopener">向量教程</a>'
  },
  {
    icon: '⚙️',
    text: '请关闭预设中的「文风」和「小总结/概要」避免与游戏系统冲突。'
  },
  {
    icon: '💎',
    text: 'Gemini 用户：如使用 Gemini 3.0 Pro Preview，请在主菜单中开启「Gemini 3.0 Preview 模式」以获得最佳体验。'
  },
  {
    icon: '🖼️',
    text: '独立生图功能请查看首楼说明。'
  },
  {
    icon: '📖',
    text: '两张卡（雪乃卡/唯卡）的世界书存在差异，请勿混用存档。'
  },
  {
    icon: '🆓',
    text: '本项目免费发布于 DC 类脑社区，请不要为此角色卡付费。'
  },
]
</script>

<template>
  <div class="splash-overlay">
    <div class="splash-panel">
      <div v-if="isBlacklisted" class="blacklist-warning">
        ⚠️ 本项目免费发布于 DC 类脑社区，请不要为此角色卡和昂贵的API付费，大型集群和官方渠道以外第三方API可能会出现大大小小的奇怪问题。如果你为此付了费，你很有可能上当了。
      </div>
      <h1 class="splash-title">📜 天华校园RE</h1>
      <p class="splash-subtitle">世界书数据加载状态</p>
      <p class="splash-version" :class="{ 'version-unknown': cardEdition === 'unknown' }">
        {{ editionLabel }} · {{ GAME_VERSION }}
      </p>

      <div class="status-grid">
        <div
          v-for="mod in dataModules"
          :key="mod.key"
          class="status-item"
          :class="{ 'status-ok': loadResults[mod.key] === true, 'status-fail': loadResults[mod.key] === false }"
        >
          <span class="status-icon">{{ mod.icon }}</span>
          <span class="status-label">{{ mod.label }}</span>
          <span class="status-indicator">{{ getStatusIcon(loadResults[mod.key]) }}</span>
        </div>
      </div>

      <div class="announcements">
        <h2 class="announcements-title">📢 公告与提示</h2>
        <ul class="announcement-list">
          <li v-for="(a, i) in announcements" :key="i" class="announcement-item">
            <span class="announcement-icon">{{ a.icon }}</span>
            <span v-if="a.html" class="announcement-text" v-html="a.html"></span>
            <span v-else class="announcement-text">{{ a.text }}</span>
          </li>
        </ul>
      </div>

      <button
        class="enter-btn"
        :disabled="isBlacklisted && countdown > 0"
        @click="emit('enter')"
      >
        <template v-if="isBlacklisted && countdown > 0">
          ⏳ 请阅读上方警告（{{ countdown }}秒）
        </template>
        <template v-else>
          🎮 进入游戏
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 20, 10, 0.85);
  backdrop-filter: blur(6px);
}

.splash-panel {
  width: 680px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  background: linear-gradient(135deg, #fdf6e3 0%, #fff9ed 100%);
  border: 2px solid #c9a96e;
  border-radius: 16px;
  padding: 32px 36px;
  box-shadow: 0 8px 32px rgba(120, 80, 20, 0.35);
  color: #4a3520;
}

.splash-title {
  text-align: center;
  font-size: 28px;
  margin: 0 0 4px;
  color: #6b4226;
  font-family: 'Ma Shan Zheng', cursive;
}

.splash-subtitle {
  text-align: center;
  font-size: 14px;
  color: #8a7050;
  margin: 0 0 4px;
}

.splash-version {
  text-align: center;
  font-size: 13px;
  color: #8b4513;
  margin: 0 0 20px;
  font-weight: 500;
}

.splash-version.version-unknown {
  color: #999;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin-bottom: 24px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(201, 169, 110, 0.12);
  font-size: 14px;
  transition: background 0.2s;
}

.status-item.status-fail {
  background: rgba(220, 80, 60, 0.1);
}

.status-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.status-label {
  flex: 1;
}

.status-indicator {
  font-size: 14px;
  flex-shrink: 0;
}

.announcements {
  border-top: 1px solid #dcc89e;
  padding-top: 16px;
  margin-bottom: 24px;
}

.announcements-title {
  font-size: 18px;
  margin: 0 0 12px;
  color: #6b4226;
  font-family: 'Ma Shan Zheng', cursive;
}

.announcement-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.announcement-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(201, 169, 110, 0.08);
}

.announcement-icon {
  flex-shrink: 0;
  font-size: 15px;
  margin-top: 1px;
}

.announcement-text {
  flex: 1;
}

.announcement-text a {
  color: #8b4513;
  text-decoration: underline;
}

.enter-btn {
  display: block;
  width: 100%;
  padding: 14px;
  font-size: 18px;
  font-family: 'Ma Shan Zheng', cursive;
  background: linear-gradient(135deg, #8b4513, #a0522d);
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 12px rgba(139, 69, 19, 0.3);
}

.enter-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(139, 69, 19, 0.4);
}

.enter-btn:active {
  transform: translateY(0);
}

.enter-btn:disabled {
  background: #999;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.enter-btn:disabled:hover {
  transform: none;
  box-shadow: none;
}

.blacklist-warning {
  background: #dc3545;
  color: #fff;
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 16px;
  animation: warning-pulse 2s ease-in-out infinite;
}

@keyframes warning-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
  50% { box-shadow: 0 0 16px 4px rgba(220, 53, 69, 0.6); }
}

/* 暗色模式 */
body.dark-mode .splash-overlay {
  background: rgba(10, 14, 22, 0.9);
}

body.dark-mode .splash-panel {
  background: linear-gradient(135deg, #1e2433 0%, #2a3241 100%);
  border-color: #4d5a70;
  color: #eef1f5;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

body.dark-mode .splash-title,
body.dark-mode .announcements-title {
  color: #7ab8f5;
}

body.dark-mode .splash-subtitle {
  color: #8a9bb0;
}

body.dark-mode .splash-version {
  color: #7ab8f5;
}

body.dark-mode .splash-version.version-unknown {
  color: #6a7585;
}

body.dark-mode .status-item {
  background: rgba(93, 164, 232, 0.1);
}

body.dark-mode .status-item.status-fail {
  background: rgba(220, 80, 60, 0.15);
}

body.dark-mode .announcements {
  border-color: #3f4a5e;
}

body.dark-mode .announcement-item {
  background: rgba(93, 164, 232, 0.06);
}

body.dark-mode .announcement-text a {
  color: #7ab8f5;
}

body.dark-mode .enter-btn {
  background: linear-gradient(135deg, #5da4e8, #4a8fd4);
  box-shadow: 0 4px 12px rgba(93, 164, 232, 0.3);
}

body.dark-mode .enter-btn:hover {
  box-shadow: 0 6px 16px rgba(93, 164, 232, 0.4);
}

body.dark-mode .enter-btn:disabled {
  background: #555;
  box-shadow: none;
}

body.dark-mode .enter-btn:disabled:hover {
  box-shadow: none;
}

/* 滚动条美化 */
.splash-panel::-webkit-scrollbar {
  width: 6px;
}

.splash-panel::-webkit-scrollbar-track {
  background: transparent;
}

.splash-panel::-webkit-scrollbar-thumb {
  background: rgba(139, 69, 19, 0.3);
  border-radius: 3px;
}

body.dark-mode .splash-panel::-webkit-scrollbar-thumb {
  background: rgba(93, 164, 232, 0.3);
}
</style>
