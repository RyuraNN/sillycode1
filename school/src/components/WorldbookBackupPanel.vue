<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { restoreWorldbookBackup, deleteWorldbookBackup } from '../utils/multiplayerSync'

const emit = defineEmits(['close'])

const mpStore = useMultiplayerStore()

const isRestoring = ref(false)
const isDeleting = ref(false)
const activeBackupId = ref(null)
const confirmDeleteId = ref(null)
const statusMessage = ref('')

onMounted(() => {
  mpStore.loadBackups()
})

const backups = computed(() => {
  return [...mpStore.worldbookBackups].sort((a, b) => b.timestamp - a.timestamp)
})

const sourceLabel = {
  'multiplayer_sync': '联机同步',
  'manual': '手动备份',
  'restore_swap': '恢复前备份',
  'initial': '初始备份',
}

function formatDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function handleRestore(backupId) {
  if (isRestoring.value) return
  isRestoring.value = true
  activeBackupId.value = backupId
  statusMessage.value = ''

  try {
    const success = await restoreWorldbookBackup(backupId)
    if (success) {
      statusMessage.value = '世界书恢复成功！当前版本已自动备份。'
    } else {
      statusMessage.value = '恢复失败，请重试。'
    }
  } catch (e) {
    statusMessage.value = `恢复出错: ${e.message || '未知错误'}`
  } finally {
    isRestoring.value = false
    activeBackupId.value = null
  }
}

async function handleDelete(backupId) {
  if (isDeleting.value) return
  isDeleting.value = true

  try {
    await deleteWorldbookBackup(backupId)
    confirmDeleteId.value = null
  } catch (e) {
    statusMessage.value = `删除失败: ${e.message || '未知错误'}`
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div class="wb-backup-overlay" @click.self="emit('close')">
    <div class="wb-backup-panel">
      <div class="wb-backup-header">
        <h2>世界书备份管理</h2>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>

      <!-- 状态消息 -->
      <div v-if="statusMessage" class="wb-status" :class="{ success: statusMessage.includes('成功') }">
        {{ statusMessage }}
      </div>

      <!-- 备份列表 -->
      <div class="wb-backup-list" v-if="backups.length > 0">
        <div v-for="backup in backups" :key="backup.id" class="wb-backup-item">
          <div class="backup-info">
            <div class="backup-main">
              <span class="backup-source">{{ sourceLabel[backup.source] || backup.source }}</span>
              <span class="backup-count">{{ backup.entryCount }} 条</span>
            </div>
            <div class="backup-meta">
              <span>{{ formatDate(backup.timestamp) }}</span>
              <span v-if="backup.hostName" class="backup-host">房主: {{ backup.hostName }}</span>
              <span v-if="backup.roomId" class="backup-room">{{ backup.roomId }}</span>
            </div>
            <div v-if="backup.label" class="backup-label">{{ backup.label }}</div>
          </div>

          <div class="backup-actions">
            <!-- 恢复 -->
            <button class="wb-btn restore"
              :disabled="isRestoring"
              @click="handleRestore(backup.id)">
              {{ isRestoring && activeBackupId === backup.id ? '恢复中...' : '恢复' }}
            </button>

            <!-- 删除 -->
            <template v-if="confirmDeleteId === backup.id">
              <button class="wb-btn danger" :disabled="isDeleting" @click="handleDelete(backup.id)">
                确认删除
              </button>
              <button class="wb-btn" @click="confirmDeleteId = null">取消</button>
            </template>
            <button v-else class="wb-btn delete" @click="confirmDeleteId = backup.id">删除</button>
          </div>
        </div>
      </div>

      <div v-else class="wb-empty">
        暂无世界书备份
      </div>

      <div class="wb-backup-footer">
        <p class="wb-hint">恢复操作会自动备份当前世界书，可安全回退。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-backup-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9000;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.wb-backup-panel {
  background: linear-gradient(135deg, rgba(30, 20, 12, 0.97) 0%, rgba(45, 30, 18, 0.97) 100%);
  border: 1px solid rgba(218, 165, 32, 0.35);
  border-radius: 12px;
  width: 480px;
  max-width: 95vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 248, 220, 0.06);
  color: rgba(255, 248, 220, 0.9);
}

.wb-backup-panel::-webkit-scrollbar { width: 5px; }
.wb-backup-panel::-webkit-scrollbar-track { background: rgba(139, 69, 19, 0.1); }
.wb-backup-panel::-webkit-scrollbar-thumb { background: rgba(218, 165, 32, 0.25); border-radius: 3px; }

.wb-backup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(218, 165, 32, 0.2);
}

.wb-backup-header h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: 2px;
  background: linear-gradient(180deg, rgba(255, 248, 220, 1) 0%, rgba(218, 165, 32, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(139, 69, 19, 0.3);
  border: 1px solid rgba(218, 165, 32, 0.3);
  color: rgba(255, 248, 220, 0.7);
  font-size: 1.3rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  line-height: 1;
}
.close-btn:hover {
  background: rgba(218, 165, 32, 0.4);
  border-color: rgba(255, 215, 0, 0.5);
  color: rgba(255, 248, 220, 1);
}

.wb-status {
  margin: 10px 22px 0;
  padding: 10px 14px;
  background: rgba(218, 165, 32, 0.12);
  border: 1px solid rgba(218, 165, 32, 0.25);
  border-radius: 8px;
  font-size: 0.85rem;
  color: rgba(255, 215, 0, 0.9);
}
.wb-status.success {
  background: rgba(80, 130, 80, 0.15);
  border-color: rgba(100, 180, 100, 0.3);
  color: rgba(140, 220, 140, 0.9);
}

.wb-backup-list {
  padding: 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-backup-item {
  padding: 12px 14px;
  background: rgba(139, 69, 19, 0.12);
  border: 1px solid rgba(218, 165, 32, 0.12);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  transition: background 0.2s;
}
.wb-backup-item:hover {
  background: rgba(139, 69, 19, 0.18);
}

.backup-info {
  flex: 1;
  min-width: 0;
}

.backup-main {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.backup-source {
  font-size: 0.88rem;
  font-weight: 500;
  color: rgba(255, 248, 220, 0.9);
}

.backup-count {
  font-size: 0.72rem;
  background: rgba(218, 165, 32, 0.15);
  padding: 1px 8px;
  border-radius: 4px;
  color: rgba(255, 215, 0, 0.75);
  border: 1px solid rgba(218, 165, 32, 0.2);
}

.backup-meta {
  display: flex;
  gap: 10px;
  font-size: 0.76rem;
  color: rgba(218, 165, 32, 0.5);
  flex-wrap: wrap;
}

.backup-host, .backup-room {
  color: rgba(218, 165, 32, 0.55);
}

.backup-label {
  font-size: 0.76rem;
  color: rgba(218, 165, 32, 0.45);
  margin-top: 4px;
  font-style: italic;
}

.backup-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}

.wb-btn {
  padding: 6px 14px;
  min-height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.2);
  color: rgba(255, 248, 220, 0.85);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}
.wb-btn:hover:not(:disabled) {
  background: rgba(218, 165, 32, 0.3);
  border-color: rgba(255, 215, 0, 0.4);
  color: rgba(255, 248, 220, 1);
}
.wb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wb-btn.restore {
  background: rgba(80, 130, 80, 0.2);
  border-color: rgba(100, 180, 100, 0.3);
  color: rgba(140, 220, 140, 0.9);
}
.wb-btn.restore:hover:not(:disabled) {
  background: rgba(80, 130, 80, 0.3);
  border-color: rgba(100, 180, 100, 0.45);
}

.wb-btn.delete {
  background: rgba(180, 60, 40, 0.12);
  border-color: rgba(220, 80, 60, 0.25);
  color: rgba(255, 180, 160, 0.85);
}
.wb-btn.delete:hover:not(:disabled) {
  background: rgba(180, 60, 40, 0.22);
  border-color: rgba(220, 80, 60, 0.4);
}

.wb-btn.danger {
  background: rgba(180, 60, 40, 0.2);
  border-color: rgba(220, 80, 60, 0.35);
  color: rgba(255, 180, 160, 0.95);
}

.wb-empty {
  text-align: center;
  padding: 36px 22px;
  color: rgba(218, 165, 32, 0.4);
  font-size: 0.9rem;
}

.wb-backup-footer {
  padding: 10px 22px 18px;
  border-top: 1px solid rgba(218, 165, 32, 0.12);
}

.wb-hint {
  margin: 0;
  font-size: 0.76rem;
  color: rgba(218, 165, 32, 0.4);
  text-align: center;
}

/* Mobile */
@media (max-width: 768px) {
  .wb-backup-panel {
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    border-radius: 0;
  }
  .wb-backup-header {
    padding: 14px 16px 12px;
  }
  .wb-backup-list {
    padding: 12px 16px;
  }
  .wb-backup-item {
    flex-direction: column;
    gap: 10px;
  }
  .backup-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .wb-btn {
    min-height: 44px;
    padding: 8px 16px;
  }
  .wb-backup-footer {
    padding: 10px 16px 18px;
  }
}
</style>
