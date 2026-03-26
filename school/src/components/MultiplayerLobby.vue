<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import {
  getOrCreatePlayerId,
  createRoom,
  listRooms,
  getRoomInfo,
  connectToRoom,
  disconnect,
  sendMessage,
  sendPlayerUpdate,
  sendWorldbookSyncRequest,
} from '../utils/multiplayerWs'
import {
  generateWorldbookHash,
  checkAndSyncWorldbook,
  acceptHostWorldbook,
  getSyncWorldbookSnapshot,
  generateWorldbookSpotSamples,
} from '../utils/multiplayerSync'
import { getAuthToken, getDisplayName } from '../utils/multiplayerAuth'
import GameStart from './GameStart.vue'

const emit = defineEmits(['back', 'enter-game'])

/** 解析房间列表中的 host_features JSON 字符串 */
function parseHostFeatures(raw) {
  if (!raw) return { assistantAI: false, rag: false, summary: false }
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return { assistantAI: false, rag: false, summary: false } }
}

/** 获取当前玩家的系统功能状态 */
function getLocalFeatures() {
  return {
    assistantAI: !!gameStore.settings?.assistantAI?.enabled,
    rag: !!gameStore.settings?.ragSystem?.enabled,
    summary: !!gameStore.settings?.summarySystem?.enabled,
  }
}

const gameStore = useGameStore()
const mpStore = useMultiplayerStore()

// ── 视图状态 ──
const view = ref('main') // 'main' | 'create' | 'join' | 'browse' | 'preset' | 'connecting' | 'save_select' | 'character_create' | 'waiting_room' | 'wb_sync'
const isLoading = ref(false)
const errorMessage = ref('')

// ── 联机存档 ──
const mpSaves = ref([])

// ── 创建房间 ──
const createForm = ref({
  roomName: '',
  isPublic: true,
  password: '',
  maxPlayers: 10,
  trustPolicy: 'open',
})

// ── 加入房间 ──
const joinRoomId = ref('')
const joinPassword = ref('')
const pendingRoomInfo = ref(null) // 验证通过的房间信息，用于预设选择后连接

// ── 房间列表 ──
const publicRooms = ref([])

// ── 预设选择 ──
const presets = ref([])
const selectedPreset = ref(null)
const showPresetPicker = ref(false)

// ── 世界书同步 ──
const wbSyncStatus = ref('') // '' | 'checking' | 'mismatch' | 'syncing' | 'done' | 'error'
const wbSyncError = ref('')

// ── 存档分发 ──
const saveTransferStatus = ref('') // '' | 'requesting' | 'receiving' | 'done' | 'error'
const saveTransferProgress = ref({ received: 0, total: 0 })
const saveTransferError = ref('')

// ── 计算属性 ──
const canCreate = computed(() => {
  return createForm.value.roomName.trim()
})

const canJoin = computed(() => {
  return joinRoomId.value.trim()
})

const characterName = computed(() => gameStore.player?.name || '')
const discordName = computed(() => getDisplayName() || '')
const playerName = computed(() => {
  const discord = discordName.value
  const char = characterName.value
  if (discord && char) return `${discord}（${char}）`
  return discord || char || 'Player'
})

// ── 生命周期 ──
onMounted(() => {
  loadPresets()
  // 监听世界书同步事件
  window.addEventListener('mp:worldbook_data_request', onWorldbookDataRequest)
  window.addEventListener('mp:worldbook_data', onWorldbookDataReceived)
  // 监听存档分发事件
  window.addEventListener('mp:save_transfer_started', onSaveTransferStarted)
  window.addEventListener('mp:save_transfer_progress', onSaveTransferProgress)
  window.addEventListener('mp:save_transfer_complete', onSaveTransferComplete)
  window.addEventListener('mp:save_transfer_error', onSaveTransferFailed)
})

onUnmounted(() => {
  window.removeEventListener('mp:worldbook_data_request', onWorldbookDataRequest)
  window.removeEventListener('mp:worldbook_data', onWorldbookDataReceived)
  window.removeEventListener('mp:save_transfer_started', onSaveTransferStarted)
  window.removeEventListener('mp:save_transfer_progress', onSaveTransferProgress)
  window.removeEventListener('mp:save_transfer_complete', onSaveTransferComplete)
  window.removeEventListener('mp:save_transfer_error', onSaveTransferFailed)
})

// ── 世界书同步事件处理 ──

/** 房主端：收到其他玩家请求世界书数据 */
async function onWorldbookDataRequest(event) {
  if (!mpStore.isHost) return
  try {
    const snapshot = await getSyncWorldbookSnapshot()
    sendMessage('worldbook_data', { snapshot })
  } catch (e) {
    console.error('[MultiplayerLobby] Failed to send worldbook data:', e)
  }
}

/** 加入端：收到房主的世界书数据 */
async function onWorldbookDataReceived(event) {
  const { snapshot } = event.detail || {}
  if (!snapshot) {
    wbSyncStatus.value = 'error'
    wbSyncError.value = '未收到世界书数据'
    return
  }

  wbSyncStatus.value = 'syncing'
  try {
    const success = await acceptHostWorldbook(snapshot, {
      roomId: mpStore.roomId,
      hostName: mpStore.hostName,
    })
    if (success) {
      wbSyncStatus.value = 'done'
      // 1.5 秒后进入后续流程
      setTimeout(() => {
        checkPostConnectFlow()
      }, 1500)
    } else {
      wbSyncStatus.value = 'error'
      wbSyncError.value = '同步失败'
    }
  } catch (e) {
    wbSyncStatus.value = 'error'
    wbSyncError.value = e.message || '同步出错'
  }
}

// ── 预设管理 ──
function loadPresets() {
  try {
    const stored = localStorage.getItem('school_game_start_presets')
    if (stored) {
      presets.value = JSON.parse(stored)
    }
  } catch (e) {
    console.error('[MultiplayerLobby] Failed to load presets:', e)
  }
}

// ── 创建房间 ──
async function handleCreate() {
  if (!canCreate.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    const playerId = getOrCreatePlayerId()
    const result = await createRoom({
      roomName: createForm.value.roomName.trim(),
      hostId: playerId,
      hostName: playerName.value,
      settings: {
        maxPlayers: createForm.value.maxPlayers,
        isPublic: createForm.value.isPublic,
        password: createForm.value.password || null,
        gameMode: gameStore.player?.gameMode || 'normal',
        allowSpectators: true,
        trustPolicy: createForm.value.trustPolicy,
      },
      gameTime: gameStore.world?.gameTime || null,
      weekNumber: gameStore.events?.weekNumber || 1,
      hostFeatures: getLocalFeatures(),
      roomRunId: gameStore.meta?.currentRunId || null,
    })

    // 创建后立即连接
    connectToRoom(result.roomId, {
      playerId,
      playerName: playerName.value,
      role: gameStore.player?.role || 'student',
      classId: gameStore.player?.classId || '',
      avatar: gameStore.player?.avatar || '',
      token: getAuthToken() || undefined,
      features: getLocalFeatures(),
    })

    view.value = 'connecting'
    waitForConnection()
  } catch (e) {
    errorMessage.value = e.message || '创建房间失败'
  } finally {
    isLoading.value = false
  }
}

// ── 加入房间 - 验证后直接连接，连接后再选角色 ──
async function handleJoin() {
  if (!canJoin.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    // 先检查房间是否存在
    const info = await getRoomInfo(joinRoomId.value.trim().toUpperCase())
    pendingRoomInfo.value = info
    // 直接连接，连接后通过 checkPostConnectFlow 路由到预设/角色创建
    doConnect()
  } catch (e) {
    errorMessage.value = e.message || '加入房间失败'
    isLoading.value = false
  }
}

// ── 加入者选择预设后进入角色创建（自动加载预设） ──
function applyPresetAndContinue(preset) {
  selectedPreset.value = preset
  view.value = 'character_create'
}

function skipPresetAndContinue() {
  selectedPreset.value = null
  view.value = 'character_create'
}

function doConnect() {
  isLoading.value = true
  const playerId = getOrCreatePlayerId()

  // 如果选择了预设，使用预设中的角色信息
  let pName = playerName.value
  let pRole = gameStore.player?.role || 'student'
  let pClassId = gameStore.player?.classId || ''
  let pAvatar = gameStore.player?.avatar || ''

  if (selectedPreset.value?.data) {
    const d = selectedPreset.value.data
    pRole = d.playerRole || pRole
    if (d.formData?.name) pName = d.formData.name
    if (d.formData?.classId) pClassId = d.formData.classId
  }

  connectToRoom(joinRoomId.value.trim().toUpperCase(), {
    playerId,
    playerName: pName,
    role: pRole,
    classId: pClassId,
    avatar: pAvatar,
    password: joinPassword.value || undefined,
    token: getAuthToken() || undefined,
    features: getLocalFeatures(),
  })

  view.value = 'connecting'
  waitForConnection()
}

// ── 从列表加入 ──
function joinFromList(room) {
  joinRoomId.value = room.room_id
  view.value = 'join'
}

// ── 刷新房间列表 ──
async function refreshRoomList() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const result = await listRooms()
    publicRooms.value = result.rooms || []
  } catch (e) {
    errorMessage.value = e.message || '获取房间列表失败'
  } finally {
    isLoading.value = false
  }
}

// ── 等待连接完成 ──
function waitForConnection() {
  const maxWait = 15000
  const start = Date.now()

  const check = () => {
    if (mpStore.isConnected) {
      isLoading.value = false
      // 连接成功后检查世界书同步
      checkWorldbookAfterConnect()
      return
    }
    if (mpStore.connectionError) {
      errorMessage.value = mpStore.connectionError
      isLoading.value = false
      view.value = 'main'
      return
    }
    if (Date.now() - start > maxWait) {
      errorMessage.value = '连接超时'
      isLoading.value = false
      view.value = 'main'
      disconnect()
      return
    }
    setTimeout(check, 200)
  }
  check()
}

/** 连接成功后检查世界书同步 */
async function checkWorldbookAfterConnect() {
  // 房主不需要同步，但需要上传抽查样本
  if (mpStore.isHost) {
    // Phase 4: 异步上传世界书抽查样本
    generateWorldbookSpotSamples(20).then(samples => {
      if (samples.length > 0) {
        sendMessage('worldbook_spot_samples', { samples })
      }
    }).catch(() => {})
    checkPostConnectFlow()
    return
  }

  const hostHash = mpStore.hostWorldbookHash
  if (!hostHash) {
    // 房主没有设置世界书 hash，跳过同步
    checkPostConnectFlow()
    return
  }

  wbSyncStatus.value = 'checking'
  view.value = 'wb_sync'

  try {
    const result = await checkAndSyncWorldbook(hostHash)
    if (result.match) {
      wbSyncStatus.value = 'done'
      setTimeout(() => {
        checkPostConnectFlow()
      }, 500)
    } else {
      // 不一致，显示同步确认
      wbSyncStatus.value = 'mismatch'
    }
  } catch (e) {
    wbSyncStatus.value = 'error'
    wbSyncError.value = e.message || '检查失败'
  }
}

/** 用户确认同步世界书 */
function acceptWorldbookSync() {
  wbSyncStatus.value = 'syncing'
  sendWorldbookSyncRequest()
  // 数据会通过 mp:worldbook_data 事件回调处理
}

/** 用户拒绝同步，断开连接 */
function rejectWorldbookSync() {
  disconnect()
  view.value = 'main'
  errorMessage.value = '已拒绝世界书同步，无法加入房间'
}

/** 跳过同步（不下载房主世界书） */
function skipWorldbookSync() {
  wbSyncStatus.value = 'done'
  checkPostConnectFlow()
}

/** 连接成功后根据角色路由到正确视图 */
function checkPostConnectFlow() {
  if (mpStore.isHost) {
    // 房主：检查是否有联机存档或角色预设
    loadMpSaves()
    if (mpSaves.value.length > 0 || presets.value.length > 0) {
      view.value = 'save_select'
    } else {
      view.value = 'character_create'
    }
  } else {
    // 加入者：检查是否有预设
    if (presets.value.length > 0) {
      view.value = 'preset'
    } else {
      view.value = 'character_create'
    }
  }
}

/** 加载联机存档列表（从 gameStore） */
function loadMpSaves() {
  mpSaves.value = gameStore._ui.mpSaveSnapshots || []
}

/** 房主选择了联机存档 */
async function selectMpSave(save) {
  try {
    isLoading.value = true
    // 恢复存档状态
    await gameStore.restoreSnapshot(save.id || save.runId)
    isLoading.value = false
    view.value = 'waiting_room'
  } catch (e) {
    errorMessage.value = '加载存档失败: ' + (e.message || e)
    isLoading.value = false
  }
}

/** 房主选择了角色预设（从 save_select 界面）—— 路由到角色创建自动加载 */
function selectPresetForHost(preset) {
  selectedPreset.value = preset
  view.value = 'character_create'
}

/** 角色创建返回：根据是否有可选项决定返回哪个视图 */
function handleCharacterCreateBack() {
  if (mpStore.isHost) {
    // 房主：如果有存档/预设可选，回到 save_select；否则回到 waiting_room
    if (mpSaves.value.length > 0 || presets.value.length > 0) {
      view.value = 'save_select'
    } else {
      view.value = 'waiting_room'
    }
  } else {
    // 加入者：如果有预设可选，回到 preset；否则回到 waiting_room
    if (presets.value.length > 0) {
      view.value = 'preset'
    } else {
      view.value = 'waiting_room'
    }
  }
}

/** 角色创建完成（GameStart emit startGame） */
function onCharacterCreated() {
  selectedPreset.value = null // 预设已通过 GameStart 应用，清除引用

  // 角色创建后更新服务器上的玩家名（含角色名）
  const newName = playerName.value
  sendPlayerUpdate({
    playerName: newName,
    role: gameStore.player?.role || 'student',
    classId: gameStore.player?.classId || '',
  })

  view.value = 'waiting_room'
}

// ── 存档分发事件处理 ──
function onSaveTransferStarted() {
  saveTransferStatus.value = 'requesting'
  saveTransferProgress.value = { received: 0, total: 0 }
  saveTransferError.value = ''
}

function onSaveTransferProgress(event) {
  saveTransferStatus.value = 'receiving'
  const { received, total } = event.detail
  saveTransferProgress.value = { received, total }
}

function onSaveTransferComplete() {
  saveTransferStatus.value = 'done'
  setTimeout(() => { saveTransferStatus.value = '' }, 3000)
}

function onSaveTransferFailed(event) {
  saveTransferStatus.value = 'error'
  saveTransferError.value = event.detail?.error || '传输失败'
}

async function requestSaveDownload() {
  const { requestSaveFromHost } = await import('../utils/saveDistribution')
  requestSaveFromHost()
}

// ── 断开 ──
function handleDisconnect() {
  disconnect()
  view.value = 'main'
}

function handleBack() {
  if (mpStore.isConnected) {
    // 已连接时返回不断开，只是关闭面板
    emit('back')
  } else {
    emit('back')
  }
}

/** 从等待大厅进入游戏 */
function enterGame() {
  console.log('[MultiplayerLobby] enterGame: isConnected =', mpStore.isConnected, 'roomId =', mpStore.roomId, 'isMultiplayerActive =', mpStore.isMultiplayerActive)
  emit('enter-game')
}

function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleTimeString()
}
</script>

<template>
  <div class="mp-lobby-wrapper">
    <!-- 角色创建（全屏，不在 lobby panel 内） -->
    <GameStart
      v-if="view === 'character_create'"
      mode="multiplayer"
      :initialPreset="selectedPreset"
      @back="handleCharacterCreateBack"
      @start-game="onCharacterCreated"
    />

    <div v-else class="mp-lobby-panel">
      <div class="mp-lobby-header">
        <button class="back-link" @click="handleBack">&larr; 返回主菜单</button>
        <h2>联机大厅</h2>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMessage" class="mp-error">
        {{ errorMessage }}
        <button @click="errorMessage = ''" class="dismiss-btn">&times;</button>
      </div>

      <!-- 等待大厅 -->
      <div v-if="view === 'waiting_room'" class="mp-waiting-room">
        <div class="room-badge">
          <span class="room-id">{{ mpStore.roomId }}</span>
          <span class="room-name">{{ mpStore.roomName }}</span>
          <span v-if="mpStore.isHost" class="host-badge">房主</span>
        </div>

        <div class="waiting-player-list">
          <h3>房间成员 ({{ mpStore.playerCount }})</h3>
          <div v-for="p in mpStore.playerList" :key="p.playerId" class="player-item">
            <span class="player-name" :class="{ 'is-self': p.playerId === mpStore.localPlayerId, 'is-host': p.playerId === mpStore.hostId }">
              {{ p.playerName }}
            </span>
            <span class="player-role">{{ p.role === 'teacher' ? '教师' : '学生' }}</span>
          </div>
        </div>

        <!-- 存档下载（非房主） -->
        <div v-if="!mpStore.isHost" class="save-transfer-section">
          <div v-if="saveTransferStatus === 'receiving'" class="transfer-progress">
            <span>下载存档中... {{ saveTransferProgress.received }}/{{ saveTransferProgress.total }}</span>
            <div class="transfer-bar">
              <div class="transfer-bar-fill" :style="{ width: (saveTransferProgress.total ? (saveTransferProgress.received / saveTransferProgress.total * 100) : 0) + '%' }"></div>
            </div>
          </div>
          <div v-else-if="saveTransferStatus === 'done'" class="transfer-done">存档下载完成</div>
          <div v-else-if="saveTransferStatus === 'error'" class="transfer-error">{{ saveTransferError }}</div>
          <button
            v-else
            class="mp-btn small full-width"
            @click="requestSaveDownload"
            :disabled="saveTransferStatus === 'requesting'"
          >
            {{ saveTransferStatus === 'requesting' ? '请求中...' : '下载房主存档' }}
          </button>
        </div>

        <div class="waiting-actions">
          <button v-if="mpStore.isHost" class="mp-btn primary full-width" @click="enterGame">开始游戏</button>
          <button v-else class="mp-btn primary full-width" disabled>等待房主开始游戏...</button>
          <button class="mp-btn danger full-width" @click="handleDisconnect">断开连接</button>
        </div>
      </div>

      <!-- 存档/预设选择（房主） -->
      <div v-else-if="view === 'save_select'" class="mp-form">
        <button class="back-btn" @click="view = 'waiting_room'">&larr; 跳过选择</button>
        <h3>选择存档或角色</h3>
        <p class="preset-hint">选择一个联机存档继续游戏，或使用角色预设开始新游戏。</p>

        <div v-if="mpSaves.length > 0" class="save-section">
          <h4 class="section-label">联机存档</h4>
          <div class="preset-list">
            <div v-for="(save, i) in mpSaves" :key="'save-' + i"
              class="preset-item" @click="selectMpSave(save)">
              <div class="preset-item-header">
                <span class="preset-name">{{ save.label || save.playerName || '存档 ' + (i + 1) }}</span>
                <span class="preset-role">{{ save.gameTime ? `第${save.gameTime.year}年` : '' }}</span>
              </div>
              <div class="preset-detail">
                <span>{{ save.playerName || '未知角色' }}</span>
                <span v-if="save.timestamp" class="preset-time">{{ new Date(save.timestamp).toLocaleDateString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="presets.length > 0" class="save-section">
          <h4 class="section-label">角色预设</h4>
          <div class="preset-list">
            <div v-for="(preset, i) in presets" :key="'preset-' + i"
              class="preset-item" @click="selectPresetForHost(preset)">
              <div class="preset-item-header">
                <span class="preset-name">{{ preset.name }}</span>
                <span class="preset-role">{{ preset.data?.playerRole === 'teacher' ? '教师' : '学生' }}</span>
              </div>
              <div class="preset-detail">
                <span>{{ preset.data?.formData?.name || '未命名' }}</span>
                <span v-if="preset.timestamp" class="preset-time">{{ new Date(preset.timestamp).toLocaleDateString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <button class="mp-btn full-width" @click="view = 'character_create'" style="margin-top: 12px;">
          新建角色
        </button>
      </div>

      <!-- 连接中 -->
      <div v-else-if="view === 'connecting'" class="mp-connecting">
        <div class="spinner"></div>
        <p>正在连接...</p>
      </div>

      <!-- 主菜单 -->
      <div v-else-if="view === 'main'" class="mp-main">
        <div class="mp-btn-group">
          <button class="mp-btn primary" @click="view = 'create'">创建房间</button>
          <button class="mp-btn" @click="view = 'join'">加入房间</button>
          <button class="mp-btn" @click="view = 'browse'; refreshRoomList()">浏览房间</button>
        </div>
      </div>

      <!-- 创建房间 -->
      <div v-else-if="view === 'create'" class="mp-form">
        <button class="back-btn" @click="view = 'main'">&larr; 返回</button>
        <h3>创建房间</h3>

        <div class="form-group">
          <label>房间名称</label>
          <input v-model="createForm.roomName" placeholder="输入房间名称" maxlength="30" />
        </div>

        <div class="form-group">
          <label>最大人数</label>
          <input type="number" v-model.number="createForm.maxPlayers" min="2" max="20" />
        </div>

        <div class="form-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="createForm.isPublic" />
            <span>公开房间（显示在房间列表中）</span>
          </label>
        </div>

        <div class="form-group" v-if="!createForm.isPublic">
          <label>房间密码</label>
          <input v-model="createForm.password" placeholder="可选" type="password" />
        </div>

        <div class="form-group">
          <label>准入要求</label>
          <select v-model="createForm.trustPolicy" class="mp-select">
            <option value="open">开放（所有人）</option>
            <option value="relaxed">服务器成员</option>
            <option value="strict">仅已验证成员</option>
          </select>
        </div>

        <button class="mp-btn primary full-width" @click="handleCreate" :disabled="!canCreate || isLoading">
          {{ isLoading ? '创建中...' : '创建房间' }}
        </button>
      </div>

      <!-- 加入房间 -->
      <div v-else-if="view === 'join'" class="mp-form">
        <button class="back-btn" @click="view = 'main'">&larr; 返回</button>
        <h3>加入房间</h3>

        <div class="form-group">
          <label>房间 ID</label>
          <input v-model="joinRoomId" placeholder="输入6位房间ID" maxlength="6" style="text-transform: uppercase" />
        </div>

        <div class="form-group">
          <label>密码（如需要）</label>
          <input v-model="joinPassword" placeholder="可选" type="password" />
        </div>

        <button class="mp-btn primary full-width" @click="handleJoin" :disabled="!canJoin || isLoading">
          {{ isLoading ? '验证中...' : '下一步' }}
        </button>
      </div>

      <!-- 预设选择（加入者，已连接后） -->
      <div v-else-if="view === 'preset'" class="mp-form">
        <button class="back-btn" @click="view = 'waiting_room'">&larr; 跳过选择</button>
        <h3>选择角色预设</h3>
        <p class="preset-hint">选择一个已保存的角色预设，或使用当前角色直接加入。</p>

        <div v-if="mpStore.roomName" class="pending-room-info">
          <span>已加入: </span>
          <strong>{{ mpStore.roomName }}</strong>
        </div>

        <div class="preset-list">
          <div class="preset-item current" @click="skipPresetAndContinue">
            <div class="preset-item-header">
              <span class="preset-name">当前角色</span>
              <span class="preset-role">{{ gameStore.player?.role === 'teacher' ? '教师' : '学生' }}</span>
            </div>
            <div class="preset-detail">{{ gameStore.player?.name || 'Player' }}</div>
          </div>

          <div v-for="(preset, i) in presets" :key="i"
            class="preset-item" @click="applyPresetAndContinue(preset)">
            <div class="preset-item-header">
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-role">{{ preset.data?.playerRole === 'teacher' ? '教师' : '学生' }}</span>
            </div>
            <div class="preset-detail">
              {{ preset.data?.formData?.name || '未命名' }}
              <span v-if="preset.timestamp" class="preset-time">
                {{ new Date(preset.timestamp).toLocaleDateString() }}
              </span>
            </div>
          </div>
        </div>

        <button class="mp-btn full-width" @click="view = 'character_create'" style="margin-top: 12px;">
          新建角色
        </button>
      </div>

      <!-- 浏览房间 -->
      <div v-else-if="view === 'browse'" class="mp-form">
        <button class="back-btn" @click="view = 'main'">&larr; 返回</button>
        <div class="browse-header">
          <h3>公开房间</h3>
          <button class="mp-btn small" @click="refreshRoomList" :disabled="isLoading">刷新</button>
        </div>

        <div v-if="isLoading" class="loading-text">加载中...</div>
        <div v-else-if="publicRooms.length === 0" class="empty-text">暂无公开房间</div>
        <div v-else class="room-list">
          <div v-for="room in publicRooms" :key="room.room_id" class="room-list-item" @click="joinFromList(room)">
            <div class="room-list-main">
              <span class="room-list-name">{{ room.room_name }}</span>
              <span class="room-list-id">{{ room.room_id }}</span>
            </div>
            <div class="room-list-meta">
              <span>房主: {{ room.host_name }}</span>
              <span class="room-host-features" v-if="room.host_features">
                <span v-if="parseHostFeatures(room.host_features).assistantAI" class="feat-tag feat-ai" title="房主已启用变量辅助AI">AI</span>
                <span v-if="parseHostFeatures(room.host_features).rag" class="feat-tag feat-rag" title="房主已启用RAG记忆">RAG</span>
                <span v-if="parseHostFeatures(room.host_features).summary" class="feat-tag feat-sum" title="房主已启用总结系统">总结</span>
              </span>
              <span>{{ room.player_count }}/{{ room.max_players }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 世界书同步 -->
      <div v-else-if="view === 'wb_sync'" class="mp-form wb-sync-view">
        <h3>世界书同步</h3>

        <div v-if="wbSyncStatus === 'checking'" class="wb-sync-state">
          <div class="spinner"></div>
          <p>正在检查世界书一致性...</p>
        </div>

        <div v-else-if="wbSyncStatus === 'mismatch'" class="wb-sync-state">
          <div class="wb-sync-icon warn">!</div>
          <p>你的世界书与房主不一致。</p>
          <p class="wb-sync-hint">同步将备份你的当前世界书，然后用房主的世界书替换。你可以在主菜单恢复备份。</p>
          <div class="wb-sync-actions">
            <button class="mp-btn primary" @click="acceptWorldbookSync">同步世界书</button>
            <button class="mp-btn" @click="skipWorldbookSync">跳过同步</button>
            <button class="mp-btn danger" @click="rejectWorldbookSync">取消加入</button>
          </div>
        </div>

        <div v-else-if="wbSyncStatus === 'syncing'" class="wb-sync-state">
          <div class="spinner"></div>
          <p>正在同步世界书...</p>
        </div>

        <div v-else-if="wbSyncStatus === 'done'" class="wb-sync-state">
          <div class="wb-sync-icon done">&#10003;</div>
          <p>世界书同步完成</p>
        </div>

        <div v-else-if="wbSyncStatus === 'error'" class="wb-sync-state">
          <div class="wb-sync-icon error">&times;</div>
          <p>{{ wbSyncError || '同步出错' }}</p>
          <div class="wb-sync-actions">
            <button class="mp-btn" @click="skipWorldbookSync">跳过同步继续</button>
            <button class="mp-btn danger" @click="rejectWorldbookSync">取消加入</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
/* ═══════════════════════════════════════════════════════
   联机大厅 — 全屏面板布局（类似 GameStart）
   色板: 棕 rgba(139,69,19) / 金 rgba(218,165,32) / 奶油白 rgba(255,248,220)
   ═══════════════════════════════════════════════════════ */

.mp-lobby-wrapper {
  width: 100%;
  max-height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
}

.mp-lobby-panel {
  background: linear-gradient(135deg, rgba(30, 20, 12, 0.97) 0%, rgba(45, 30, 18, 0.97) 100%);
  border: 1px solid rgba(218, 165, 32, 0.35);
  border-radius: 12px;
  padding: 0;
  width: 520px;
  max-width: 100%;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 248, 220, 0.06);
  color: rgba(255, 248, 220, 0.9);
  margin: 0 auto;
}

.mp-lobby-panel::-webkit-scrollbar { width: 5px; }
.mp-lobby-panel::-webkit-scrollbar-track { background: rgba(139, 69, 19, 0.1); }
.mp-lobby-panel::-webkit-scrollbar-thumb { background: rgba(218, 165, 32, 0.25); border-radius: 3px; }

/* ── Header ── */
.mp-lobby-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(218, 165, 32, 0.2);
}

.back-link {
  background: none;
  border: none;
  color: rgba(218, 165, 32, 0.5);
  cursor: pointer;
  padding: 0;
  font-size: 0.82rem;
  text-align: left;
  transition: color 0.3s ease;
  align-self: flex-start;
}
.back-link:hover { color: rgba(255, 215, 0, 0.9); }

.mp-lobby-header h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 500;
  letter-spacing: 3px;
  background: linear-gradient(180deg, rgba(255, 248, 220, 1) 0%, rgba(218, 165, 32, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Error ── */
.mp-error {
  margin: 10px 22px 0;
  padding: 10px 14px;
  background: rgba(180, 60, 40, 0.2);
  border: 1px solid rgba(220, 80, 60, 0.35);
  border-radius: 8px;
  font-size: 0.88rem;
  color: rgba(255, 200, 180, 0.95);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dismiss-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 4px;
  opacity: 0.7;
}
.dismiss-btn:hover { opacity: 1; }

/* ── Content sections ── */
.mp-main, .mp-form, .mp-waiting-room, .mp-connecting {
  padding: 18px 22px 22px;
}

/* ── Waiting Room ── */
.mp-waiting-room .room-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.waiting-player-list {
  margin-bottom: 18px;
}
.waiting-player-list h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(255, 248, 220, 0.8);
  letter-spacing: 0.5px;
}

.waiting-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Save Transfer ── */
.save-transfer-section {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.transfer-progress span {
  font-size: 0.82rem;
  color: rgba(255, 248, 220, 0.7);
}

.transfer-bar {
  margin-top: 6px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.transfer-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #daa520, #f0c040);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.transfer-done {
  font-size: 0.85rem;
  color: #66bb6a;
  text-align: center;
}

.transfer-error {
  font-size: 0.85rem;
  color: #ef5350;
  text-align: center;
}

/* ── Save Select / Character Create ── */
.save-section {
  margin-bottom: 16px;
}

.section-label {
  margin: 0 0 8px;
  font-size: 0.82rem;
  font-weight: 500;
  color: rgba(218, 165, 32, 0.6);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}


/* ── Form controls ── */
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  display: block;
  font-size: 0.82rem;
  color: rgba(218, 165, 32, 0.7);
  margin-bottom: 5px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(218, 165, 32, 0.25);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 248, 220, 0.95);
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
}
.form-group input::placeholder {
  color: rgba(218, 165, 32, 0.3);
}
.form-group input:focus {
  border-color: rgba(218, 165, 32, 0.55);
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 12px rgba(218, 165, 32, 0.1);
}

.mp-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(218, 165, 32, 0.25);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 248, 220, 0.95);
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
  transition: all 0.3s ease;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.mp-select option {
  background: #1a120a;
  color: rgba(255, 248, 220, 0.95);
}
.mp-select:focus {
  border-color: rgba(218, 165, 32, 0.55);
  background: rgba(0, 0, 0, 0.35);
}

.form-row {
  margin-bottom: 12px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.88rem;
  min-height: 40px;
  color: rgba(255, 248, 220, 0.8);
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: rgba(218, 165, 32, 0.8);
}

/* ── Buttons ── */
.mp-btn-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mp-btn {
  position: relative;
  padding: 12px 20px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid rgba(218, 165, 32, 0.3);
  background: linear-gradient(135deg,
    rgba(139, 69, 19, 0.25) 0%,
    rgba(160, 82, 45, 0.3) 50%,
    rgba(139, 69, 19, 0.25) 100%);
  color: rgba(255, 248, 220, 0.9);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  backdrop-filter: blur(4px);
  overflow: hidden;
}
.mp-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.4s;
}
.mp-btn:hover:not(:disabled)::before {
  left: 100%;
}
.mp-btn:hover:not(:disabled) {
  background: linear-gradient(135deg,
    rgba(218, 165, 32, 0.35) 0%,
    rgba(184, 134, 11, 0.4) 50%,
    rgba(218, 165, 32, 0.35) 100%);
  border-color: rgba(255, 215, 0, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(218, 165, 32, 0.15);
  color: rgba(255, 248, 220, 1);
}
.mp-btn:active:not(:disabled) {
  transform: translateY(0);
}
.mp-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mp-btn.primary {
  background: linear-gradient(135deg,
    rgba(218, 165, 32, 0.3) 0%,
    rgba(184, 134, 11, 0.35) 50%,
    rgba(218, 165, 32, 0.3) 100%);
  border-color: rgba(218, 165, 32, 0.45);
}
.mp-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg,
    rgba(218, 165, 32, 0.45) 0%,
    rgba(184, 134, 11, 0.5) 50%,
    rgba(218, 165, 32, 0.45) 100%);
  border-color: rgba(255, 215, 0, 0.6);
  box-shadow: 0 4px 20px rgba(218, 165, 32, 0.25);
}
.mp-btn.danger {
  background: rgba(180, 60, 40, 0.2);
  border-color: rgba(220, 80, 60, 0.35);
  color: rgba(255, 200, 180, 0.95);
}
.mp-btn.danger:hover:not(:disabled) {
  background: rgba(200, 60, 40, 0.35);
  border-color: rgba(220, 80, 60, 0.5);
}
.mp-btn.small {
  padding: 5px 12px;
  min-height: 30px;
  font-size: 0.82rem;
  letter-spacing: 0.5px;
}
.mp-btn.full-width {
  width: 100%;
  margin-top: 6px;
}

.back-btn {
  background: none;
  border: none;
  color: rgba(218, 165, 32, 0.5);
  cursor: pointer;
  padding: 2px 0;
  font-size: 0.88rem;
  margin-bottom: 10px;
  transition: color 0.3s ease;
}
.back-btn:hover { color: rgba(255, 215, 0, 0.9); }

.mp-form h3 {
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 500;
  color: rgba(255, 248, 220, 0.95);
  letter-spacing: 1px;
}

/* ── Connected ── */
.room-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.room-id {
  font-family: monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: rgba(255, 215, 0, 0.9);
  background: rgba(218, 165, 32, 0.15);
  padding: 4px 10px;
  border-radius: 6px;
  letter-spacing: 2px;
  border: 1px solid rgba(218, 165, 32, 0.25);
}
.room-name {
  font-size: 0.95rem;
  color: rgba(255, 248, 220, 0.75);
}

.connected-info {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 0.88rem;
  margin-bottom: 14px;
  color: rgba(255, 248, 220, 0.55);
}

.host-badge {
  background: rgba(218, 165, 32, 0.2);
  color: rgba(255, 215, 0, 0.9);
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  border: 1px solid rgba(218, 165, 32, 0.3);
  letter-spacing: 0.5px;
}

.connected-players {
  margin-bottom: 14px;
  max-height: 200px;
  overflow-y: auto;
}

.player-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(139, 69, 19, 0.12);
  border: 1px solid rgba(218, 165, 32, 0.1);
  margin-bottom: 4px;
  transition: background 0.2s;
}
.player-item:hover {
  background: rgba(139, 69, 19, 0.2);
}

.player-name {
  font-size: 0.9rem;
  color: rgba(255, 248, 220, 0.85);
}
.player-name.is-self {
  color: rgba(255, 215, 0, 0.95);
}
.player-name.is-host::after {
  content: ' ★';
  color: rgba(255, 215, 0, 0.8);
}

.player-role {
  font-size: 0.78rem;
  color: rgba(218, 165, 32, 0.5);
}

/* ── Connecting ── */
.mp-connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 22px;
}
.mp-connecting p {
  color: rgba(255, 248, 220, 0.7);
  font-size: 0.9rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(218, 165, 32, 0.2);
  border-top-color: rgba(255, 215, 0, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 14px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Room list ── */
.browse-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.browse-header h3 {
  margin: 0;
}

.loading-text, .empty-text {
  text-align: center;
  color: rgba(218, 165, 32, 0.4);
  padding: 20px 0;
  font-size: 0.9rem;
}

.room-list {
  max-height: 300px;
  overflow-y: auto;
}

.room-list-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(139, 69, 19, 0.12);
  border: 1px solid rgba(218, 165, 32, 0.12);
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 40px;
}
.room-list-item:hover {
  background: rgba(218, 165, 32, 0.15);
  border-color: rgba(218, 165, 32, 0.35);
  box-shadow: 0 2px 10px rgba(218, 165, 32, 0.08);
}

.room-list-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.room-list-name {
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(255, 248, 220, 0.9);
}

.room-list-id {
  font-family: monospace;
  font-size: 0.82rem;
  color: rgba(255, 215, 0, 0.7);
}

.room-list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.78rem;
  color: rgba(218, 165, 32, 0.5);
  gap: 6px;
  flex-wrap: wrap;
}

.room-host-features {
  display: inline-flex;
  gap: 3px;
  margin-left: 4px;
}

.feat-tag {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.4;
}

.feat-tag.feat-ai { background: rgba(218, 165, 32, 0.2); color: rgba(255, 215, 0, 0.8); }
.feat-tag.feat-rag { background: rgba(139, 69, 19, 0.25); color: rgba(218, 165, 32, 0.8); }
.feat-tag.feat-sum { background: rgba(184, 134, 11, 0.2); color: rgba(255, 200, 100, 0.8); }

/* ── Preset picker ── */
.preset-hint {
  font-size: 0.82rem;
  color: rgba(218, 165, 32, 0.5);
  margin: 0 0 12px;
  line-height: 1.4;
}

.pending-room-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(218, 165, 32, 0.1);
  border: 1px solid rgba(218, 165, 32, 0.2);
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.88rem;
}

.pending-room-info span {
  color: rgba(218, 165, 32, 0.55);
}

.pending-room-info strong {
  color: rgba(255, 248, 220, 0.95);
}

.room-mode {
  font-size: 0.72rem;
  background: rgba(218, 165, 32, 0.15);
  padding: 2px 7px;
  border-radius: 4px;
  color: rgba(255, 215, 0, 0.7);
  border: 1px solid rgba(218, 165, 32, 0.2);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.preset-item {
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(139, 69, 19, 0.12);
  border: 1px solid rgba(218, 165, 32, 0.12);
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 40px;
}
.preset-item:hover {
  background: rgba(218, 165, 32, 0.15);
  border-color: rgba(218, 165, 32, 0.35);
}

.preset-item.current {
  border-color: rgba(218, 165, 32, 0.35);
  background: rgba(218, 165, 32, 0.1);
}
.preset-item.current:hover {
  background: rgba(218, 165, 32, 0.2);
  border-color: rgba(255, 215, 0, 0.45);
}

.preset-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}

.preset-name {
  font-size: 0.92rem;
  font-weight: 500;
  color: rgba(255, 248, 220, 0.9);
}

.preset-role {
  font-size: 0.72rem;
  padding: 1px 8px;
  border-radius: 4px;
  background: rgba(139, 69, 19, 0.2);
  color: rgba(218, 165, 32, 0.7);
  border: 1px solid rgba(218, 165, 32, 0.15);
}

.preset-detail {
  font-size: 0.78rem;
  color: rgba(218, 165, 32, 0.5);
  display: flex;
  justify-content: space-between;
}

.preset-time {
  font-size: 0.72rem;
  color: rgba(218, 165, 32, 0.35);
}

/* ── Worldbook sync ── */
.wb-sync-view h3 {
  text-align: center;
  margin-bottom: 14px;
}

.wb-sync-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 0;
}

.wb-sync-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: 700;
}
.wb-sync-icon.warn {
  background: rgba(218, 165, 32, 0.2);
  border: 2px solid rgba(218, 165, 32, 0.5);
  color: rgba(255, 215, 0, 0.9);
}
.wb-sync-icon.done {
  background: rgba(80, 130, 80, 0.2);
  border: 2px solid rgba(100, 180, 100, 0.5);
  color: rgba(140, 220, 140, 0.9);
}
.wb-sync-icon.error {
  background: rgba(180, 60, 40, 0.2);
  border: 2px solid rgba(220, 80, 60, 0.5);
  color: rgba(255, 180, 160, 0.9);
}

.wb-sync-state p {
  margin: 0;
  text-align: center;
  color: rgba(255, 248, 220, 0.8);
  font-size: 0.9rem;
}

.wb-sync-hint {
  font-size: 0.8rem !important;
  color: rgba(218, 165, 32, 0.5) !important;
  max-width: 340px;
  line-height: 1.5;
}

.wb-sync-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 260px;
  margin-top: 6px;
}

.wb-sync-actions .mp-btn {
  width: 100%;
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .mp-lobby-wrapper {
    padding: 10px;
  }

  .mp-lobby-panel {
    width: 100%;
    border-radius: 8px;
  }

  .mp-lobby-header {
    padding: 14px 16px 12px;
  }

  .mp-main, .mp-form, .mp-waiting-room, .mp-connecting {
    padding: 14px 16px;
  }

  .mp-btn {
    min-height: 46px;
    font-size: 1rem;
  }

  .form-group input {
    padding: 12px;
    font-size: 16px;
  }

  .player-item {
    min-height: 40px;
  }
}
</style>
