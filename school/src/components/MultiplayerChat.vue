<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { sendChat } from '../utils/multiplayerWs'

const mpStore = useMultiplayerStore()

const chatInput = ref('')
const chatContainer = ref(null)
const isMinimized = ref(false)

// 当前频道消息
const filteredMessages = computed(() => {
  if (mpStore.chatChannel === 'public') {
    return mpStore.worldChat.filter(m => m.channel === 'public')
  }
  return mpStore.worldChat.filter(m =>
    m.channel === mpStore.chatChannel || m.channel === 'public'
  )
})

// 自动滚动
watch(() => mpStore.worldChat.length, async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
})

onMounted(() => {
  mpStore.unreadCount = 0
})

function handleSend() {
  const content = chatInput.value.trim()
  if (!content) return
  sendChat(content, mpStore.chatChannel)
  chatInput.value = ''
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function toggleMinimize() {
  isMinimized.value = !isMinimized.value
  if (!isMinimized.value) {
    mpStore.unreadCount = 0
  }
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="mp-chat" :class="{ minimized: isMinimized }">
    <!-- 标题栏 -->
    <div class="mp-chat-header" @click="toggleMinimize">
      <span class="chat-title">世界频道</span>
      <span v-if="isMinimized && mpStore.unreadCount > 0" class="unread-badge">
        {{ mpStore.unreadCount > 99 ? '99+' : mpStore.unreadCount }}
      </span>
      <span class="toggle-icon">{{ isMinimized ? '▲' : '▼' }}</span>
    </div>

    <!-- 聊天内容 -->
    <template v-if="!isMinimized">
      <div ref="chatContainer" class="mp-chat-messages">
        <div v-if="filteredMessages.length === 0" class="empty-chat">
          暂无消息
        </div>
        <div v-for="(msg, i) in filteredMessages" :key="i" class="chat-msg"
          :class="{ 'is-self': msg.playerId === mpStore.localPlayerId }">
          <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
          <span class="msg-name" :class="{ 'host-name': msg.playerId === mpStore.hostId }">
            {{ msg.playerName }}
          </span>
          <span class="msg-content">{{ msg.content }}</span>
        </div>
      </div>

      <!-- 输入 -->
      <div class="mp-chat-input">
        <input
          v-model="chatInput"
          placeholder="输入消息..."
          maxlength="500"
          @keydown="handleKeydown"
        />
        <button @click="handleSend" :disabled="!chatInput.trim()">发送</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Light mode — warm brown glass */
.mp-chat {
  position: fixed;
  bottom: 16px;
  left: 16px;
  width: 340px;
  max-height: 400px;
  background: rgba(255, 253, 245, 0.55);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 14px;
  z-index: 8000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(139, 69, 19, 0.08);
  transition: max-height 0.3s ease;
}

.mp-chat.minimized {
  max-height: 42px;
}

.mp-chat-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(139, 69, 19, 0.08);
  user-select: none;
  min-height: 42px;
}

.chat-title {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 500;
  color: #5d4037;
}

.unread-badge {
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  padding: 1px 7px;
  border-radius: 10px;
  margin-right: 8px;
}

.toggle-icon {
  color: #a1887f;
  font-size: 0.7rem;
}

.mp-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  max-height: 280px;
  min-height: 100px;
}

.mp-chat-messages::-webkit-scrollbar { width: 4px; }
.mp-chat-messages::-webkit-scrollbar-track { background: transparent; }
.mp-chat-messages::-webkit-scrollbar-thumb { background: rgba(139, 69, 19, 0.15); border-radius: 2px; }

.empty-chat {
  text-align: center;
  color: #bcaaa4;
  font-size: 0.85rem;
  padding: 24px 0;
}

.chat-msg {
  margin-bottom: 6px;
  font-size: 0.85rem;
  line-height: 1.4;
  word-break: break-word;
}

.msg-time {
  color: #bcaaa4;
  font-size: 0.75rem;
  margin-right: 6px;
}

.msg-name {
  color: #1976d2;
  font-weight: 500;
  margin-right: 6px;
}

.msg-name.host-name {
  color: #b8860b;
}

.chat-msg.is-self .msg-name {
  color: #2e7d32;
}

.msg-content {
  color: #4e342e;
}

.mp-chat-input {
  display: flex;
  padding: 8px 10px;
  border-top: 1px solid rgba(139, 69, 19, 0.08);
  gap: 8px;
}

.mp-chat-input input {
  flex: 1;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(139, 69, 19, 0.12);
  border-radius: 8px;
  padding: 8px 12px;
  color: #3e2723;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.mp-chat-input input::placeholder {
  color: #bcaaa4;
}

.mp-chat-input input:focus {
  border-color: rgba(139, 69, 19, 0.3);
}

.mp-chat-input button {
  padding: 8px 16px;
  min-height: 36px;
  background: rgba(139, 69, 19, 0.1);
  border: 1px solid rgba(139, 69, 19, 0.2);
  border-radius: 8px;
  color: #5d4037;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.mp-chat-input button:hover:not(:disabled) {
  background: rgba(139, 69, 19, 0.18);
  border-color: rgba(139, 69, 19, 0.3);
}

.mp-chat-input button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Dark mode ── */
:global(.dark-mode) .mp-chat {
  background: rgba(30, 20, 12, 0.75);
  border-color: rgba(218, 165, 32, 0.2);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
:global(.dark-mode) .mp-chat-header { border-bottom-color: rgba(218, 165, 32, 0.15); }
:global(.dark-mode) .chat-title { color: rgba(255, 248, 220, 0.9); }
:global(.dark-mode) .toggle-icon { color: rgba(218, 165, 32, 0.45); }
:global(.dark-mode) .mp-chat-messages::-webkit-scrollbar-thumb { background: rgba(218, 165, 32, 0.2); }
:global(.dark-mode) .empty-chat { color: rgba(218, 165, 32, 0.35); }
:global(.dark-mode) .msg-time { color: rgba(218, 165, 32, 0.4); }
:global(.dark-mode) .msg-name { color: rgba(255, 215, 0, 0.8); }
:global(.dark-mode) .msg-name.host-name { color: rgba(255, 215, 0, 0.95); }
:global(.dark-mode) .chat-msg.is-self .msg-name { color: rgba(140, 220, 140, 0.85); }
:global(.dark-mode) .msg-content { color: rgba(255, 248, 220, 0.75); }
:global(.dark-mode) .mp-chat-input { border-top-color: rgba(218, 165, 32, 0.15); }
:global(.dark-mode) .mp-chat-input input {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(218, 165, 32, 0.2);
  color: rgba(255, 248, 220, 0.9);
}
:global(.dark-mode) .mp-chat-input input::placeholder { color: rgba(218, 165, 32, 0.3); }
:global(.dark-mode) .mp-chat-input input:focus { border-color: rgba(218, 165, 32, 0.45); }
:global(.dark-mode) .mp-chat-input button {
  background: rgba(139, 69, 19, 0.15);
  border-color: rgba(218, 165, 32, 0.25);
  color: rgba(255, 248, 220, 0.8);
}
:global(.dark-mode) .mp-chat-input button:hover:not(:disabled) {
  background: rgba(218, 165, 32, 0.2);
}

@media (max-width: 768px) {
  .mp-chat {
    width: calc(100vw - 32px);
    bottom: 8px;
    left: 8px;
    right: 8px;
  }
  .mp-chat-header {
    min-height: 44px;
  }
  .mp-chat-input input {
    font-size: 16px;
    padding: 10px 12px;
  }
  .mp-chat-input button {
    min-height: 44px;
    padding: 8px 14px;
  }
}
</style>
