<script setup>
import { ref, watch, onMounted, onUnmounted, onBeforeUnmount, computed, nextTick } from 'vue'
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
  getSavedSession,
  clearSavedSessionManual,
  sendGameStart,
  sendPlayerStatus,
  sendKick,
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

function parseRoomGameTime(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

function formatRoomMode(mode) {
  const map = {
    normal: '普通',
    tianlong: '天龙',
    challenge: '挑战',
    hard: '困难',
  }
  return map[mode] || mode || '未知'
}

function formatRoomTime(rawGameTime, weekNumber) {
  const gameTime = parseRoomGameTime(rawGameTime)
  const weekNum = Number(weekNumber)
  const weekLabel = Number.isFinite(weekNum) && weekNum > 0 ? `第${weekNum}周` : ''

  if (!gameTime || typeof gameTime !== 'object') {
    return weekLabel || '时间未知'
  }

  const month = Number(gameTime.month) || 1
  const day = Number(gameTime.day) || 1
  const hour = String(Number(gameTime.hour) || 0).padStart(2, '0')
  const minute = String(Number(gameTime.minute) || 0).padStart(2, '0')
  const dateLabel = `${month}/${day} ${hour}:${minute}`
  return weekLabel ? `${weekLabel} · ${dateLabel}` : dateLabel
}

const WB_DIFF_MAX_ITEMS = 300
const WB_HIDE_CONTEXT_PREF_KEY = 'school_mp_wb_hide_context'

function normalizeDiffValue(value) {
  if (Array.isArray(value)) return value.map(normalizeDiffValue)
  if (value && typeof value === 'object') {
    const normalized = {}
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeDiffValue(value[key])
    }
    return normalized
  }
  return value
}

function entryDiffKey(entry, index) {
  return String(entry?.uid || entry?.id || entry?.name || `#${index}`)
}

function entryDiffPreview(entry) {
  if (!entry) return '（无）'
  const primary = entry.content || entry.comment || entry.memo || entry.text || entry.name
  if (primary && typeof primary === 'string') {
    return primary.replace(/\s+/g, ' ').trim().slice(0, 120) || '（空）'
  }
  try {
    return JSON.stringify(entry).slice(0, 120)
  } catch {
    return '（无法预览）'
  }
}

function entryDiffRaw(entry) {
  if (!entry) return 'null'
  try {
    return JSON.stringify(normalizeDiffValue(entry), null, 2)
  } catch {
    return String(entry)
  }
}

function computeLineDiff(leftText, rightText) {
  const leftLines = String(leftText || '').split('\n')
  const rightLines = String(rightText || '').split('\n')
  const m = leftLines.length
  const n = rightLines.length

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (leftLines[i] === rightLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const rows = []
  let i = 0
  let j = 0
  let leftNo = 1
  let rightNo = 1

  while (i < m && j < n) {
    if (leftLines[i] === rightLines[j]) {
      rows.push({ type: 'context', leftNo, rightNo, text: leftLines[i] })
      i += 1
      j += 1
      leftNo += 1
      rightNo += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'remove', leftNo, rightNo: null, text: leftLines[i] })
      i += 1
      leftNo += 1
    } else {
      rows.push({ type: 'add', leftNo: null, rightNo, text: rightLines[j] })
      j += 1
      rightNo += 1
    }
  }

  while (i < m) {
    rows.push({ type: 'remove', leftNo, rightNo: null, text: leftLines[i] })
    i += 1
    leftNo += 1
  }

  while (j < n) {
    rows.push({ type: 'add', leftNo: null, rightNo, text: rightLines[j] })
    j += 1
    rightNo += 1
  }

  return rows
}

function buildWorldbookSnapshotDiff(localSnapshot, hostSnapshot) {
  const localBooks = new Map((localSnapshot || []).map(book => [book.bookName, Array.isArray(book.entries) ? book.entries : []]))
  const hostBooks = new Map((hostSnapshot || []).map(book => [book.bookName, Array.isArray(book.entries) ? book.entries : []]))
  const allBookNames = new Set([...localBooks.keys(), ...hostBooks.keys()])

  const diffItems = []
  let added = 0
  let removed = 0
  let changed = 0
  let totalLocal = 0
  let totalHost = 0
  let truncated = false

  for (const entries of localBooks.values()) totalLocal += entries.length
  for (const entries of hostBooks.values()) totalHost += entries.length

  for (const bookName of allBookNames) {
    const localEntries = localBooks.get(bookName) || []
    const hostEntries = hostBooks.get(bookName) || []

    const localMap = new Map(localEntries.map((entry, idx) => [entryDiffKey(entry, idx), entry]))
    const hostMap = new Map(hostEntries.map((entry, idx) => [entryDiffKey(entry, idx), entry]))
    const allEntryKeys = new Set([...localMap.keys(), ...hostMap.keys()])

    for (const entryKey of allEntryKeys) {
      const localEntry = localMap.get(entryKey)
      const hostEntry = hostMap.get(entryKey)
      const entryId = `${bookName}::${entryKey}`
      if (!localEntry && hostEntry) {
        added += 1
        diffItems.push({
          id: `${entryId}::added`,
          type: 'added',
          bookName,
          entryName: hostEntry?.name || entryKey,
          localPreview: '（本地无此条目）',
          hostPreview: entryDiffPreview(hostEntry),
          localRaw: entryDiffRaw(null),
          hostRaw: entryDiffRaw(hostEntry)
        })
      } else if (localEntry && !hostEntry) {
        removed += 1
        diffItems.push({
          id: `${entryId}::removed`,
          type: 'removed',
          bookName,
          entryName: localEntry?.name || entryKey,
          localPreview: entryDiffPreview(localEntry),
          hostPreview: '（房主无此条目）',
          localRaw: entryDiffRaw(localEntry),
          hostRaw: entryDiffRaw(null)
        })
      } else {
        const localSig = JSON.stringify(normalizeDiffValue(localEntry))
        const hostSig = JSON.stringify(normalizeDiffValue(hostEntry))
        if (localSig !== hostSig) {
          changed += 1
          diffItems.push({
            id: `${entryId}::changed`,
            type: 'changed',
            bookName,
            entryName: localEntry?.name || hostEntry?.name || entryKey,
            localPreview: entryDiffPreview(localEntry),
            hostPreview: entryDiffPreview(hostEntry),
            localRaw: entryDiffRaw(localEntry),
            hostRaw: entryDiffRaw(hostEntry)
          })
        }
      }

      if (diffItems.length >= WB_DIFF_MAX_ITEMS) {
        truncated = true
        break
      }
    }

    if (truncated) break
  }

  return { diffItems, added, removed, changed, totalLocal, totalHost, truncated }
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
const joinAsSpectator = ref(false) // 以观战者身份加入
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
const wbDiffLoading = ref(false)
const wbDiffError = ref('')
const wbDiffItems = ref([])
const wbDiffFilter = ref('all') // all | changed | added | removed
const wbDiffSummary = ref({ totalLocal: 0, totalHost: 0, added: 0, removed: 0, changed: 0, truncated: false })
const wbHostSnapshotCache = ref(null)
const wbLocalSnapshotCache = ref([])
const wbExpandedDiffId = ref(null)
const wbHideContextRows = ref(readWbHideContextPref())
let wbDiffRequestToken = 0

function readWbHideContextPref() {
  try {
    const raw = localStorage.getItem(WB_HIDE_CONTEXT_PREF_KEY)
    if (raw == null) return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

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

const wbFilteredDiffItems = computed(() => {
  if (wbDiffFilter.value === 'all') return wbDiffItems.value
  return wbDiffItems.value.filter(item => item.type === wbDiffFilter.value)
})

function toggleDiffDetail(diffId) {
  wbExpandedDiffId.value = wbExpandedDiffId.value === diffId ? null : diffId
}

function getLineDiffRows(diff) {
  const rows = computeLineDiff(diff.localRaw, diff.hostRaw)
  if (!wbHideContextRows.value) return rows
  return rows.filter(row => row.type !== 'context')
}

watch(wbHideContextRows, (value) => {
  try {
    localStorage.setItem(WB_HIDE_CONTEXT_PREF_KEY, value ? '1' : '0')
  } catch {}
})

// ── 生命周期 ──
onMounted(() => {
  loadPresets()
  // 检查是否有上次意外断线的会话
  const session = getSavedSession()
  if (session && !mpStore.isConnected) {
    savedSession.value = session
  }
  // 监听游戏开始事件（非房主自动进入游戏）
  window.addEventListener('mp:game_started', onGameStarted)
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
  window.removeEventListener('mp:game_started', onGameStarted)
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
    wbDiffLoading.value = false
    return
  }

  if (wbSyncStatus.value === 'mismatch') {
    wbHostSnapshotCache.value = snapshot
    const diffResult = buildWorldbookSnapshotDiff(wbLocalSnapshotCache.value, snapshot)
    wbDiffItems.value = diffResult.diffItems
    wbDiffSummary.value = {
      totalLocal: diffResult.totalLocal,
      totalHost: diffResult.totalHost,
      added: diffResult.added,
      removed: diffResult.removed,
      changed: diffResult.changed,
      truncated: diffResult.truncated,
    }
    wbDiffError.value = ''
    wbDiffLoading.value = false
    return
  }

  if (wbSyncStatus.value !== 'syncing') {
    return
  }

  await applyHostSnapshot(snapshot)
}

async function applyHostSnapshot(snapshot) {
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

async function requestWorldbookDiffPreview() {
  const requestToken = ++wbDiffRequestToken
  wbDiffLoading.value = true
  wbDiffError.value = ''
  wbDiffItems.value = []
  wbDiffFilter.value = 'all'
  wbHostSnapshotCache.value = null
  wbExpandedDiffId.value = null
  wbHideContextRows.value = true

  try {
    wbLocalSnapshotCache.value = await getSyncWorldbookSnapshot()
  } catch (e) {
    wbDiffLoading.value = false
    wbDiffError.value = `读取本地世界书失败: ${e.message || e}`
    return
  }

  sendWorldbookSyncRequest()

  setTimeout(() => {
    if (requestToken !== wbDiffRequestToken) return
    if (wbSyncStatus.value !== 'mismatch') return
    if (!wbDiffLoading.value) return
    wbDiffLoading.value = false
    wbDiffError.value = '等待房主世界书数据超时。你仍可直接点击“同步世界书”。'
  }, 12000)
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
  goToCharacterCreate()
}

function skipPresetAndContinue() {
  selectedPreset.value = null
  goToCharacterCreate()
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
    spectatorOnly: joinAsSpectator.value || undefined,
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
      requestWorldbookDiffPreview()
    }
  } catch (e) {
    wbSyncStatus.value = 'error'
    wbSyncError.value = e.message || '检查失败'
  }
}

/** 用户确认同步世界书 */
function acceptWorldbookSync() {
  wbSyncStatus.value = 'syncing'
  wbDiffLoading.value = false
  if (wbHostSnapshotCache.value) {
    applyHostSnapshot(wbHostSnapshotCache.value)
    return
  }
  sendWorldbookSyncRequest()
}

/** 用户拒绝同步，断开连接 */
function rejectWorldbookSync() {
  disconnect()
  view.value = 'main'
  errorMessage.value = '已拒绝世界书同步，无法加入房间'
  wbDiffLoading.value = false
}

/** 连接成功后根据角色路由到正确视图 */
function checkPostConnectFlow() {
  if (joinAsSpectator.value) {
    // 纯观战者：跳过角色创建
    mpStore.isSpectatorOnly = true
    mpStore.showSpectateList = true
    if (mpStore.gameStarted) {
      // 游戏已在进行，直接进入
      enterGame()
    } else {
      view.value = 'waiting_room'
    }
    return
  }
  if (mpStore.isHost) {
    // 房主：检查是否有联机存档或角色预设
    loadMpSaves()
    if (mpSaves.value.length > 0 || presets.value.length > 0) {
      view.value = 'save_select'
    } else {
      goToCharacterCreate()
    }
  } else {
    // 加入者（非房主）
    if (mpStore.gameStarted) {
      // 游戏已在进行，跳过等待直接进入游戏
      enterGame()
    } else if (presets.value.length > 0) {
      view.value = 'preset'
    } else {
      goToCharacterCreate()
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
  goToCharacterCreate()
}

function goToCharacterCreate() {
  view.value = 'character_create'
  sendPlayerStatus('creating')
}

/** 角色创建返回：根据是否有可选项决定返回哪个视图 */
function handleCharacterCreateBack() {
  sendPlayerStatus('not_ready')

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
  const newRole = gameStore.player?.role || 'student'
  const newClassId = gameStore.player?.classId || ''
  sendPlayerUpdate({
    playerName: newName,
    role: newRole,
    classId: newClassId,
  })

  // 同步更新本地玩家列表（broadcast 不会回传给自己）
  const localPlayer = mpStore.players[mpStore.localPlayerId]
  if (localPlayer) {
    localPlayer.playerName = newName
    localPlayer.role = newRole
    localPlayer.classId = newClassId
  }

  view.value = 'waiting_room'
  sendPlayerStatus('ready')
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

// ── 准备状态 ──
const myLobbyStatus = computed(() => {
  const me = mpStore.players[mpStore.localPlayerId]
  return me?.lobbyStatus || 'not_ready'
})

const unreadyPlayerNames = computed(() => {
  return mpStore.playerList
    .filter(p => p.playerId !== mpStore.hostId && !p.spectatorOnly && p.lobbyStatus !== 'ready')
    .map(p => p.playerName)
})

const canHostStart = computed(() => {
  if (!mpStore.isHost) return false
  return unreadyPlayerNames.value.length === 0
})

function toggleReady() {
  const next = myLobbyStatus.value === 'ready' ? 'not_ready' : 'ready'
  sendPlayerStatus(next)
}

// ── 断开 ──
function handleDisconnect() {
  disconnect()
  view.value = 'main'
}

// 跟踪是否已进入游戏（enterGame 被调用过）
const hasEnteredGame = ref(false)

// 上次意外断线的会话信息
const savedSession = ref(null)

/** 重连到上次的房间 */
function handleReconnect() {
  const session = savedSession.value
  if (!session) return
  savedSession.value = null
  clearSavedSessionManual()
  connectToRoom(session.roomId, session.playerInfo)
  view.value = 'connecting'
  waitForConnection()
}

/** 忽略重连提示 */
function dismissReconnect() {
  savedSession.value = null
  clearSavedSessionManual()
}

function handleBack() {
  if (mpStore.isConnected && !hasEnteredGame.value) {
    // 还在大厅/等待室，未进入游戏 → 二次确认后断开连接
    if (!confirm('当前已连接到房间，确定要返回主菜单吗？')) return
    disconnect()
  }
  emit('back')
}

/** 从等待大厅进入游戏 */
function enterGame() {
  console.log('[MultiplayerLobby] enterGame: isConnected =', mpStore.isConnected, 'roomId =', mpStore.roomId, 'isMultiplayerActive =', mpStore.isMultiplayerActive)
  hasEnteredGame.value = true
  // 房主开始游戏时通知后端
  if (mpStore.isHost) {
    sendGameStart()
  }
  emit('enter-game')
}

/** 非房主收到 game_started 广播时自动进入游戏 */
function onGameStarted() {
  if (!mpStore.isHost && view.value === 'waiting_room') {
    enterGame()
  }
}

// 组件卸载时，如果还在连接且未进入游戏 → 断开
onBeforeUnmount(() => {
  if (mpStore.isConnected && !hasEnteredGame.value) {
    disconnect()
  }
})

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
            <span v-if="p.playerId === mpStore.hostId" class="status-tag host-tag">房主</span>
            <span v-else-if="p.lobbyStatus === 'ready'" class="status-tag ready-tag">已准备</span>
            <span v-else-if="p.lobbyStatus === 'creating'" class="status-tag creating-tag">创建角色中</span>
            <span v-else class="status-tag not-ready-tag">未准备</span>
            <button
              v-if="mpStore.isHost && p.playerId !== mpStore.localPlayerId"
              class="kick-btn"
              @click="sendKick(p.playerId, '被房主踢出')"
              title="踢出玩家"
            >✕</button>
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
          <template v-if="mpStore.isHost">
            <button
              class="mp-btn primary full-width"
              :disabled="!canHostStart"
              :title="canHostStart ? '' : `未准备: ${unreadyPlayerNames.join('、')}`"
              @click="enterGame"
            >开始游戏</button>
            <span v-if="!canHostStart" class="ready-hint">仍有玩家未准备，无法开始</span>
          </template>
          <template v-else>
            <button
              class="mp-btn full-width"
              :class="myLobbyStatus === 'ready' ? 'danger' : 'primary'"
              @click="toggleReady"
            >{{ myLobbyStatus === 'ready' ? '取消准备' : '准备' }}</button>
            <span class="ready-hint">等待房主开始游戏...</span>
          </template>
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

        <button class="mp-btn full-width" @click="goToCharacterCreate()" style="margin-top: 12px;">
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
        <!-- 断线重连提示 -->
        <div v-if="savedSession" class="mp-reconnect-banner">
          <div class="reconnect-info">
            <span class="reconnect-icon">⚠️</span>
            <div class="reconnect-text">
              <strong>检测到上次意外断线</strong>
              <span class="reconnect-detail">房间 {{ savedSession.roomId }}</span>
            </div>
          </div>
          <div class="reconnect-actions">
            <button class="mp-btn primary small" @click="handleReconnect">立即重连</button>
            <button class="mp-btn small" @click="dismissReconnect">忽略</button>
          </div>
        </div>

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

        <div class="form-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="joinAsSpectator" />
            <span>以观战者身份加入（无需创建角色）</span>
          </label>
        </div>

        <button class="mp-btn primary full-width" @click="handleJoin" :disabled="!canJoin || isLoading">
          {{ isLoading ? '验证中...' : joinAsSpectator ? '以观战者加入' : '下一步' }}
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

        <button class="mp-btn full-width" @click="goToCharacterCreate()" style="margin-top: 12px;">
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
              <span class="room-status-tag" :class="room.status === 'playing' ? 'status-playing' : 'status-waiting'">{{ room.status === 'playing' ? '游戏中' : '等待中' }}</span>
            </div>
            <div class="room-list-meta">
              <span>房主: {{ room.host_name }}</span>
              <span>模式: {{ formatRoomMode(room.game_mode) }}</span>
              <span>{{ formatRoomTime(room.game_time, room.week_number) }}</span>
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

          <div class="wb-diff-panel">
            <div class="wb-diff-summary">
              <span>本地条目：{{ wbDiffSummary.totalLocal }}</span>
              <span>房主条目：{{ wbDiffSummary.totalHost }}</span>
              <span>差异：{{ wbDiffSummary.added + wbDiffSummary.removed + wbDiffSummary.changed }}</span>
            </div>

            <div class="wb-diff-filter" role="tablist" aria-label="差异筛选">
              <button class="wb-diff-filter-btn" :class="{ active: wbDiffFilter === 'all' }" @click="wbDiffFilter = 'all'">全部</button>
              <button class="wb-diff-filter-btn" :class="{ active: wbDiffFilter === 'changed' }" @click="wbDiffFilter = 'changed'">变更 {{ wbDiffSummary.changed }}</button>
              <button class="wb-diff-filter-btn" :class="{ active: wbDiffFilter === 'added' }" @click="wbDiffFilter = 'added'">房主新增 {{ wbDiffSummary.added }}</button>
              <button class="wb-diff-filter-btn" :class="{ active: wbDiffFilter === 'removed' }" @click="wbDiffFilter = 'removed'">本地独有 {{ wbDiffSummary.removed }}</button>
            </div>

            <div v-if="wbDiffLoading" class="wb-diff-loading">正在拉取房主世界书并计算差异...</div>
            <div v-else-if="wbDiffError" class="wb-diff-error">{{ wbDiffError }}</div>
            <div v-else-if="wbDiffItems.length === 0" class="wb-diff-empty">可同步条目没有可展示差异（可能仅 hash 元数据不同）。</div>
            <div v-else class="wb-diff-list">
              <div v-for="(diff, idx) in wbFilteredDiffItems" :key="`${diff.bookName}-${diff.entryName}-${idx}`" class="wb-diff-item">
                <div class="wb-diff-item-head">
                  <span class="wb-diff-type" :class="`is-${diff.type}`">
                    {{ diff.type === 'changed' ? '变更' : diff.type === 'added' ? '房主新增' : '本地独有' }}
                  </span>
                  <span class="wb-diff-book">{{ diff.bookName }}</span>
                </div>
                <div class="wb-diff-entry">{{ diff.entryName }}</div>
                <div class="wb-diff-columns">
                  <div class="wb-diff-col">
                    <div class="wb-diff-col-label">本地</div>
                    <div class="wb-diff-col-value">{{ diff.localPreview }}</div>
                  </div>
                  <div class="wb-diff-col">
                    <div class="wb-diff-col-label">房主</div>
                    <div class="wb-diff-col-value">{{ diff.hostPreview }}</div>
                  </div>
                </div>

                <button class="wb-diff-expand-btn" @click="toggleDiffDetail(diff.id)">
                  {{ wbExpandedDiffId === diff.id ? '收起逐行 Diff' : '展开逐行 Diff（GitHub/IDE 风格）' }}
                </button>

                <div v-if="wbExpandedDiffId === diff.id" class="wb-line-diff-wrap">
                  <div class="wb-line-diff-toolbar">
                    <label class="wb-line-diff-toggle">
                      <input type="checkbox" v-model="wbHideContextRows" />
                      <span>仅看变更块（隐藏 context）</span>
                    </label>
                  </div>
                  <div class="wb-line-diff-scroll" role="region" aria-label="逐行 diff">
                    <div
                      v-for="(row, rowIdx) in getLineDiffRows(diff)"
                      :key="`${diff.id}-row-${rowIdx}`"
                      class="wb-line-diff-row"
                      :class="`is-${row.type}`"
                    >
                      <span class="wb-line-no">{{ row.leftNo ?? '' }}</span>
                      <span class="wb-line-no">{{ row.rightNo ?? '' }}</span>
                      <pre class="wb-line-code">{{ row.text || ' ' }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="wbDiffSummary.truncated" class="wb-diff-truncated">
              仅展示前 {{ WB_DIFF_MAX_ITEMS }} 条差异，请优先关注关键条目。
            </div>
          </div>

          <div class="wb-sync-actions">
            <button class="mp-btn primary" @click="acceptWorldbookSync">同步世界书</button>
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
            <button class="mp-btn primary" @click="acceptWorldbookSync">重试同步</button>
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

/* ── Reconnect Banner ── */
.mp-reconnect-banner {
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reconnect-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.reconnect-icon { font-size: 1.2rem; }
.reconnect-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
  color: #5d4037;
}
.reconnect-text strong { font-size: 0.9rem; }
.reconnect-detail {
  font-size: 0.78rem;
  color: #8d6e63;
  font-family: monospace;
}
.reconnect-actions {
  display: flex;
  gap: 8px;
}
.reconnect-actions .mp-btn.small {
  padding: 5px 14px;
  font-size: 0.78rem;
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

.player-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.1);
  margin-bottom: 4px;
}

.status-tag {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  margin-left: auto;
}
.host-tag { background: rgba(218, 165, 32, 0.3); color: #f0c040; }
.ready-tag { background: rgba(102, 187, 106, 0.25); color: #81c784; }
.creating-tag { background: rgba(255, 183, 77, 0.25); color: #ffb74d; }
.not-ready-tag { background: rgba(255, 255, 255, 0.08); color: rgba(255, 248, 220, 0.5); }

.kick-btn {
  background: none;
  border: none;
  color: rgba(255, 100, 100, 0.6);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.kick-btn:hover {
  color: #ff5252;
  background: rgba(255, 82, 82, 0.15);
}

.ready-hint {
  text-align: center;
  font-size: 0.78rem;
  color: rgba(255, 248, 220, 0.5);
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

.room-status-tag {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: auto;
}
.status-waiting {
  background: rgba(234, 179, 8, 0.2);
  color: rgba(234, 179, 8, 0.9);
}
.status-playing {
  background: rgba(34, 197, 94, 0.2);
  color: rgba(34, 197, 94, 0.9);
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

.wb-diff-panel {
  width: 100%;
  max-width: 640px;
  background: rgba(25, 20, 12, 0.45);
  border: 1px solid rgba(218, 165, 32, 0.22);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-diff-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.wb-diff-summary span {
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.18);
  color: rgba(255, 248, 220, 0.78);
  font-size: 0.75rem;
}

.wb-diff-filter {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  scrollbar-width: thin;
  padding-bottom: 2px;
}

.wb-diff-filter-btn {
  flex: 0 0 auto;
  border: 1px solid rgba(218, 165, 32, 0.25);
  background: rgba(139, 69, 19, 0.16);
  color: rgba(255, 248, 220, 0.8);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.76rem;
  cursor: pointer;
}

.wb-diff-filter-btn.active {
  background: rgba(218, 165, 32, 0.22);
  border-color: rgba(255, 215, 0, 0.45);
  color: rgba(255, 248, 220, 0.95);
}

.wb-diff-loading,
.wb-diff-error,
.wb-diff-empty,
.wb-diff-truncated {
  font-size: 0.78rem;
  text-align: center;
  color: rgba(255, 248, 220, 0.72);
}

.wb-diff-error {
  color: rgba(255, 200, 180, 0.9);
}

.wb-diff-truncated {
  color: rgba(218, 165, 32, 0.85);
}

.wb-diff-list {
  max-height: min(40vh, 320px);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.wb-diff-item {
  border: 1px solid rgba(218, 165, 32, 0.16);
  border-radius: 8px;
  background: rgba(18, 14, 8, 0.45);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wb-diff-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wb-diff-type {
  font-size: 0.7rem;
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid transparent;
  color: rgba(255, 248, 220, 0.86);
}

.wb-diff-type.is-changed {
  background: rgba(70, 130, 180, 0.2);
  border-color: rgba(100, 180, 220, 0.35);
}

.wb-diff-type.is-added {
  background: rgba(60, 140, 80, 0.2);
  border-color: rgba(100, 190, 120, 0.35);
}

.wb-diff-type.is-removed {
  background: rgba(170, 90, 60, 0.2);
  border-color: rgba(220, 120, 90, 0.35);
}

.wb-diff-book {
  font-size: 0.72rem;
  color: rgba(218, 165, 32, 0.8);
}

.wb-diff-entry {
  font-size: 0.82rem;
  color: rgba(255, 248, 220, 0.9);
  font-weight: 600;
  word-break: break-word;
}

.wb-diff-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.wb-diff-col {
  border-radius: 6px;
  border: 1px solid rgba(218, 165, 32, 0.15);
  background: rgba(139, 69, 19, 0.1);
  padding: 6px;
  min-width: 0;
}

.wb-diff-col-label {
  font-size: 0.68rem;
  color: rgba(218, 165, 32, 0.75);
  margin-bottom: 3px;
}

.wb-diff-col-value {
  font-size: 0.75rem;
  color: rgba(255, 248, 220, 0.78);
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}

.wb-diff-expand-btn {
  align-self: flex-start;
  border: 1px solid rgba(218, 165, 32, 0.3);
  background: rgba(218, 165, 32, 0.12);
  color: rgba(255, 248, 220, 0.9);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.72rem;
  cursor: pointer;
}

.wb-line-diff-wrap {
  border: 1px solid rgba(218, 165, 32, 0.18);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(16, 12, 8, 0.55);
}

.wb-line-diff-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(218, 165, 32, 0.16);
  background: rgba(139, 69, 19, 0.12);
}

.wb-line-diff-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 248, 220, 0.82);
  font-size: 0.72rem;
  user-select: none;
}

.wb-line-diff-toggle input {
  width: 16px;
  height: 16px;
}

.wb-line-diff-scroll {
  max-height: min(34vh, 280px);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
}

.wb-line-diff-row {
  display: grid;
  grid-template-columns: 42px 42px minmax(520px, 1fr);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.74rem;
  line-height: 1.35;
}

.wb-line-diff-row.is-context {
  background: rgba(255, 255, 255, 0.01);
}

.wb-line-diff-row.is-add {
  background: rgba(60, 140, 80, 0.18);
}

.wb-line-diff-row.is-remove {
  background: rgba(170, 90, 60, 0.2);
}

.wb-line-no {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 3px 6px;
  color: rgba(255, 248, 220, 0.55);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
}

.wb-line-code {
  margin: 0;
  padding: 3px 8px;
  white-space: pre;
  color: rgba(255, 248, 220, 0.86);
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

  .wb-diff-panel {
    max-width: 100%;
    padding: 8px;
  }

  .wb-diff-list {
    max-height: min(44vh, 300px);
  }

  .wb-diff-columns {
    grid-template-columns: 1fr;
  }

  .wb-diff-filter-btn {
    min-height: 36px;
    padding: 6px 10px;
  }

  .wb-line-diff-scroll {
    max-height: min(38vh, 240px);
  }

  .wb-line-diff-row {
    grid-template-columns: 34px 34px minmax(420px, 1fr);
    font-size: 0.7rem;
  }

  .wb-line-diff-toolbar {
    justify-content: flex-start;
  }

  .wb-line-diff-toggle {
    font-size: 0.7rem;
  }
}
</style>
