/**
 * Multiplayer Store - 联机状态管理
 * 独立于 gameStore，管理所有联机相关的运行时状态
 */
import { defineStore } from 'pinia'
import type {
  RemotePlayerInfo,
  RoomInfo,
  RoomSettings,
  MultiplayerChatMessage,
  ConversationGroup,
  VoteData,
  TurnAction,
  TimeWarning,
  NpcMemoryEntry,
  NpcChatSnippet,
  WorldbookBackup,
  ChatLogEntry,
} from './gameStoreTypes'

export const useMultiplayerStore = defineStore('multiplayer', {
  state: () => ({
    // ── 连接状态 ──
    isConnected: false,
    isConnecting: false,
    connectionError: null as string | null,

    // ── 房间信息 ──
    roomId: null as string | null,
    roomName: null as string | null,
    roomSettings: null as RoomSettings | null,
    isHost: false,
    hostId: null as string | null,
    hostName: null as string | null,
    gameMode: 'normal' as string,

    // ── 玩家 ──
    players: {} as Record<string, RemotePlayerInfo>,
    localPlayerId: null as string | null,

    // ── 对话组 ──
    conversationGroup: null as ConversationGroup | null,
    pendingTurnActions: [] as TurnAction[],
    turnPending: false,         // 是否正在等待其他玩家行动
    turnTimeout: 0,             // 剩余等待秒数
    turnInitiator: null as string | null, // 发起本轮的玩家
    typingPlayers: {} as Record<string, string>, // playerId → playerName
    actionPhase: 'idle' as 'idle' | 'phase1' | 'typing' | 'warning' | 'submitted', // 非 host 行动阶段

    // ── 时间同步 ──
    roundNumber: 0,
    roundStatus: 'idle' as 'idle' | 'waiting' | 'in_progress' | 'completed',
    timeWarning: null as TimeWarning | null,

    // ── 观战 ──
    isSpectating: false,
    spectateTarget: null as string | null,
    spectateLog: [] as ChatLogEntry[],
    spectateMode: null as 'time_gap' | 'spectator_only' | null,
    spectateVisibleLayers: 4,
    isSpectatorOnly: false, // 以纯观战者身份加入房间（无角色）
    spectateLayersCooldownEnd: 0, // 层数调整冷却截止时间戳
    pendingSpectateRequest: null as { playerId: string; playerName: string; mode?: string } | null,
    spectateViewers: [] as string[], // 谁在观看我的游戏

    // ── 聊天 ──
    worldChat: [] as MultiplayerChatMessage[],
    unreadCount: 0,
    chatChannel: 'public' as string,

    // ── 投票 ──
    activeVote: null as VoteData | null,

    // ── 世界书备份 ──
    worldbookBackups: [] as WorldbookBackup[],
    hostWorldbookHash: null as string | null,

    // ── 共享 RunId ──
    roomRunId: null as string | null,
    originalRunId: null as string | null, // 加入前保存的本地 runId，退出时恢复

    // ── NPC 记忆（联机共享） ──
    sharedNpcMemories: {} as Record<string, NpcMemoryEntry[]>,

    // ── NPC 聊天历史（跨玩家交互） ──
    sharedNpcChatHistory: {} as Record<string, NpcChatSnippet[]>,

    // ── 房间游戏时间（用于检测时间差） ──
    roomGameTime: null as { year: number; month: number; day: number; hour: number; minute: number; weekDay?: number } | null,

    // ── 同地点玩家 ──
    playersAtMyLocation: [] as Array<{ playerId: string; playerName: string }>,

    // ── AFK 状态 ──
    isAfk: false, // 自己是否被标记为 AFK
    afkPlayers: {} as Record<string, boolean>, // playerId → true 表示该玩家 AFK

    // ── 房主断线 ──
    hostDisconnected: false,
    hostDisconnectTime: null as number | null,

    // ── 网络 ──
    latency: 0,

    // ── 离线玩家追踪 ──
    offlinePlayers: {} as Record<string, { playerId: string; playerName: string; disconnectedAt: number; lastLocation?: string }>,

    // ── UI 控制 ──
    showLobby: false,
    showChat: false,
    showHUD: true,
    showSpectateList: false,
  }),

  getters: {
    playerCount: (state) => Object.keys(state.players).length,

    playerList: (state) => Object.values(state.players),

    otherPlayers: (state) => {
      return Object.values(state.players).filter(p => p.playerId !== state.localPlayerId)
    },

    isInConversationGroup: (state) => !!state.conversationGroup,

    conversationMembers: (state) => {
      if (!state.conversationGroup) return []
      return state.conversationGroup.memberIds
        .map(id => state.players[id])
        .filter(Boolean)
    },

    isMultiplayerActive: (state) => state.isConnected && !!state.roomId,
  },

  actions: {
    // ── Welcome 处理 ──
    handleWelcome(data: {
      roomInfo: RoomInfo
      players: RemotePlayerInfo[]
      recentChat: any[]
      hostWorldbookHash: string | null
      npcMemories: Record<string, NpcMemoryEntry[]>
      npcChatHistory?: Record<string, NpcChatSnippet[]>
      isHost: boolean
    }) {
      this.roomId = data.roomInfo.roomId
      this.roomName = data.roomInfo.roomName
      this.roomSettings = data.roomInfo.settings
      this.isHost = data.isHost
      this.hostId = data.roomInfo.hostId
      this.hostName = data.roomInfo.hostName
      this.gameMode = data.roomInfo.settings?.gameMode || 'normal'
      this.isConnected = true
      this.isConnecting = false
      this.connectionError = null
      this.hostDisconnected = false

      // 设置玩家列表
      this.players = {}
      for (const p of data.players) {
        this.players[p.playerId] = p
      }

      // 聊天记录
      this.worldChat = (data.recentChat || []).map((m: any) => ({
        playerId: m.player_id,
        playerName: m.player_name,
        content: m.content,
        channel: m.channel || 'public',
        createdAt: m.created_at,
      }))

      // 世界书 hash
      this.hostWorldbookHash = data.hostWorldbookHash

      // 共享 RunId：非房主玩家覆盖本地 runId
      if (data.roomInfo.roomRunId) {
        this.roomRunId = data.roomInfo.roomRunId
        if (!data.isHost) {
          import('./gameStore').then(({ useGameStore }) => {
            const gameStore = useGameStore()
            this.originalRunId = gameStore.meta.currentRunId
            gameStore.meta.currentRunId = data.roomInfo.roomRunId!
            console.log('[MultiplayerStore] Override local runId to room runId:', data.roomInfo.roomRunId)
          })
        }
      }

      // NPC 记忆
      this.sharedNpcMemories = data.npcMemories || {}

      // NPC 聊天历史
      this.sharedNpcChatHistory = data.npcChatHistory || {}
    },

    // ── 玩家加入/离开 ──
    handlePlayerJoined(data: RemotePlayerInfo) {
      this.players[data.playerId] = data

      // 如果是重连的离线玩家，计算离线时长并触发成长事件
      const offline = this.offlinePlayers[data.playerId]
      if (offline) {
        const offlineDurationMs = Date.now() - offline.disconnectedAt
        delete this.offlinePlayers[data.playerId]

        // 发出自定义事件，让 offlineGrowth 处理
        if (offlineDurationMs > 60_000) { // 至少离线 1 分钟才触发
          window.dispatchEvent(new CustomEvent('mp:player_reconnected', {
            detail: {
              playerId: data.playerId,
              playerName: data.playerName,
              offlineDurationMs,
              lastLocation: offline.lastLocation
            }
          }))
        }
      }
    },

    handlePlayerLeft(data: { playerId: string; playerName: string }) {
      // 记录离线玩家信息
      const player = this.players[data.playerId]
      this.offlinePlayers[data.playerId] = {
        playerId: data.playerId,
        playerName: data.playerName,
        disconnectedAt: Date.now(),
        lastLocation: player?.location
      }

      delete this.players[data.playerId]

      // 如果在对话组中，移除
      if (this.conversationGroup) {
        this.conversationGroup.memberIds = this.conversationGroup.memberIds.filter(
          id => id !== data.playerId
        )
        if (this.conversationGroup.memberIds.length <= 1) {
          this.conversationGroup = null
        }
      }
    },

    // ── 聊天 ──
    handleChat(data: { content: string; channel: string }, from: string, fromName: string) {
      this.worldChat.push({
        playerId: from,
        playerName: fromName,
        content: data.content,
        channel: data.channel,
        createdAt: Date.now(),
      })

      // 限制本地聊天记录条数
      if (this.worldChat.length > 200) {
        this.worldChat = this.worldChat.slice(-200)
      }

      if (!this.showChat) {
        this.unreadCount++
      }
    },

    // ── 玩家 features 更新 ──
    handleFeatureUpdate(data: { playerId: string; features: { assistantAI: boolean; rag: boolean; summary: boolean } }) {
      const player = this.players[data.playerId]
      if (player) {
        player.features = data.features
      }
    },

    // ── 信任等级变更 ──
    handleTrustLevelChange(data: { playerId: string; trustLevel: string; reason?: string }) {
      const player = this.players[data.playerId]
      if (player) {
        player.trustLevel = data.trustLevel as any
      }
    },

    // ── 玩家状态更新 ──
    handlePlayerUpdate(data: { stats: Partial<RemotePlayerInfo> }, from: string) {
      const player = this.players[from]
      if (player) {
        Object.assign(player, data.stats)
      }
    },

    // ── 位置变更 ──
    handleLocationChange(data: { location: string }, from: string) {
      const player = this.players[from]
      if (player) {
        player.location = data.location
      }
    },

    // ── 同地点玩家更新 ──
    handlePlayersAtLocation(data: { locationId: string; players: Array<{ playerId: string; playerName: string }> }) {
      this.playersAtMyLocation = data.players.filter(p => p.playerId !== this.localPlayerId)
    },

    // ── 对话组 ──
    handleConversationJoined(data: { groupId: string; playerId: string; playerName: string; group: ConversationGroup }) {
      this.conversationGroup = data.group
    },

    handleConversationLeft(data: { playerId: string; playerName: string; groupId: string }) {
      if (this.conversationGroup) {
        // 如果是自己离开（如位置变更导致自动退出），直接清除对话组
        if (data.playerId === this.localPlayerId) {
          this.conversationGroup = null
          return
        }
        this.conversationGroup.memberIds = this.conversationGroup.memberIds.filter(
          id => id !== data.playerId
        )
        if (this.conversationGroup.memberIds.length <= 1) {
          this.conversationGroup = null
        }
      }
    },

    // ── 回合 ──
    handleTurnPending(data: { groupId: string; initiator: string; timeout: number }) {
      this.turnPending = true
      this.turnTimeout = data.timeout
      this.turnInitiator = data.initiator
    },

    handleTurnAdvance(data: { roundNumber: number; roomGameTime?: any }) {
      this.roundNumber = data.roundNumber
      this.roundStatus = 'idle'
      this.timeWarning = null
      // 新回合开始，清除所有 AFK 状态
      this.isAfk = false
      this.afkPlayers = {}
      if (data.roomGameTime) {
        this.roomGameTime = data.roomGameTime
      }
    },

    handleTimeWarning(data: TimeWarning) {
      this.timeWarning = data
    },

    // ── NPC 记忆 ──
    handleNpcMemoryUpdate(data: { npcName: string; memory: NpcMemoryEntry }) {
      if (!this.sharedNpcMemories[data.npcName]) {
        this.sharedNpcMemories[data.npcName] = []
      }
      this.sharedNpcMemories[data.npcName].push(data.memory)

      // 限制每个 NPC 最多 50 条记忆
      if (this.sharedNpcMemories[data.npcName].length > 50) {
        this.sharedNpcMemories[data.npcName] = this.sharedNpcMemories[data.npcName].slice(-50)
      }
    },

    // ── 投票 ──
    handleVoteStart(data: VoteData) {
      this.activeVote = { ...data, myVote: undefined }
    },

    handleVoteResult(data: { winner: string; counts: Record<string, number>; newHostId?: string; newHostName?: string }) {
      if (this.activeVote) {
        this.activeVote.result = data.winner
        this.activeVote.counts = data.counts
      }

      // 如果选举了新房主
      if (data.newHostId) {
        this.hostId = data.newHostId
        this.hostName = data.newHostName || null
        this.isHost = data.newHostId === this.localPlayerId
        this.hostDisconnected = false
      }

      // 3 秒后清除投票
      setTimeout(() => {
        this.activeVote = null
      }, 3000)
    },

    // ── 房主断线 ──
    handleHostDisconnected() {
      this.hostDisconnected = true
      this.hostDisconnectTime = Date.now()
    },

    handleHostReconnected() {
      this.hostDisconnected = false
      this.hostDisconnectTime = null
    },

    // ── 观战 ──
    handleSpectateResponse(data: { approved: boolean; targetId: string; targetName: string; mode?: string; visibleLayers?: number }) {
      if (data.approved) {
        this.isSpectating = true
        this.spectateTarget = data.targetId
        this.spectateMode = (data.mode as 'time_gap' | 'spectator_only') || 'time_gap'
        this.spectateVisibleLayers = data.visibleLayers || 4
      }
    },

    handleSpectateStream(data: { chatLog: ChatLogEntry[]; ended?: boolean }) {
      if (data.ended) {
        // 被观战者断线，自动退出观战
        this.isSpectating = false
        this.spectateTarget = null
        this.spectateLog = []
        this.spectateMode = null
        return
      }
      // 使用动态层数限制
      const log = data.chatLog || []
      this.spectateLog = log.slice(-(this.spectateVisibleLayers || 4))
    },

    handleSpectateAutoExit() {
      // 时间差观战自动退出（时间已同步）
      this.isSpectating = false
      this.spectateTarget = null
      this.spectateLog = []
      this.spectateMode = null
    },

    handleSpectateLayersUpdated(data: { visibleLayers: number }) {
      this.spectateVisibleLayers = data.visibleLayers || 4
    },

    handleSpectateStarted(data: { spectatorId: string; spectatorName?: string; mode?: string }) {
      if (!this.spectateViewers.includes(data.spectatorId)) {
        this.spectateViewers.push(data.spectatorId)
      }
    },

    handleSpectateStopped(data: { spectatorId: string }) {
      this.spectateViewers = this.spectateViewers.filter(id => id !== data.spectatorId)
    },

    // ── 房间设置更新 ──
    handleRoomUpdate(data: { settings: RoomSettings }) {
      this.roomSettings = data.settings
    },

    // ── 重置 ──
    reset() {
      // 恢复原始 runId（如果被覆盖过）
      if (this.originalRunId && this.roomRunId) {
        import('./gameStore').then(({ useGameStore }) => {
          const gameStore = useGameStore()
          if (gameStore.meta.currentRunId === this.roomRunId) {
            gameStore.meta.currentRunId = this.originalRunId!
            console.log('[MultiplayerStore] Restored original runId:', this.originalRunId)
          }
        })
      }

      this.isConnected = false
      this.isConnecting = false
      this.connectionError = null
      this.roomId = null
      this.roomName = null
      this.roomSettings = null
      this.isHost = false
      this.hostId = null
      this.hostName = null
      this.players = {}
      this.conversationGroup = null
      this.pendingTurnActions = []
      this.turnPending = false
      this.roundNumber = 0
      this.roundStatus = 'idle'
      this.timeWarning = null
      this.isSpectating = false
      this.spectateTarget = null
      this.spectateLog = []
      this.spectateMode = null
      this.spectateVisibleLayers = 4
      this.isSpectatorOnly = false
      this.spectateLayersCooldownEnd = 0
      this.pendingSpectateRequest = null
      this.spectateViewers = []
      this.worldChat = []
      this.unreadCount = 0
      this.activeVote = null
      this.hostDisconnected = false
      this.hostDisconnectTime = null
      this.sharedNpcMemories = {}
      this.sharedNpcChatHistory = {}
      this.playersAtMyLocation = []
      this.roomGameTime = null
      this.isAfk = false
      this.afkPlayers = {}
      this.offlinePlayers = {}
      this.showLobby = false
      this.latency = 0
      this.roomRunId = null
      this.originalRunId = null
    },

    // ── 世界书备份管理 ──
    loadBackups() {
      try {
        const stored = localStorage.getItem('school_worldbook_backups')
        if (stored) {
          this.worldbookBackups = JSON.parse(stored)
        }
      } catch (e) {
        console.error('[MultiplayerStore] Failed to load worldbook backups:', e)
      }
    },

    saveBackupMeta(backup: WorldbookBackup) {
      this.worldbookBackups.push(backup)
      // 最多保留 20 个备份
      if (this.worldbookBackups.length > 20) {
        this.worldbookBackups = this.worldbookBackups.slice(-20)
      }
      localStorage.setItem('school_worldbook_backups', JSON.stringify(this.worldbookBackups))
    },

    removeBackupMeta(backupId: string) {
      this.worldbookBackups = this.worldbookBackups.filter(b => b.id !== backupId)
      localStorage.setItem('school_worldbook_backups', JSON.stringify(this.worldbookBackups))
    },

    hasBackups(): boolean {
      return this.worldbookBackups.length > 0
    },
  }
})
