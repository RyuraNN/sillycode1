/**
 * SchoolRoom Durable Object
 * 一个 DO 实例 = 一个联机房间
 * 负责：连接管理、消息广播、状态同步、对话组协调、NPC记忆同步
 */
import { DurableObject } from 'cloudflare:workers'
import { verifyJWT } from './jwtUtils.js'

/** 消息频率限制：每个连接每秒最多 20 条 */
const RATE_LIMIT_PER_SECOND = 20
/** 聊天消息最大长度 */
const MAX_CHAT_LENGTH = 2000
/** 房主断线等待时间 (ms) */
const HOST_DISCONNECT_TIMEOUT = 60000
/** 投票超时 (ms) */
const VOTE_TIMEOUT = 30000

export class SchoolRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sessions = new Map() // WebSocket → SessionData
    this.roomInfo = null       // 内存缓存
    this.hostDisconnectTimer = null
    this.activeVote = null
    this.conversationGroups = new Map() // groupId → ConversationGroup
    this.turnState = new Map() // playerId → { timeDelta, completed }
    this.roundNumber = 0
    // Phase 3: 世界书定期校验
    this.wbCheckTimer = null
    this.wbCheckNonces = new Map() // nonce → { createdAt, type }
    this.wbCheckCount = 0
    this.roomGameTime = null // 房间最新游戏时间（来自玩家 turn_complete）
    this.gameStarted = false // 房间是否已开始游戏
    this.spectateMap = new Map() // spectatorId → { targetId, mode, excessTime? }
    this.spectateSettings = new Map() // targetPlayerId → { visibleLayers, lastLayerChange }
    this.pendingSpectateRequests = new Map() // requesterId → { targetId, mode, excessTime }

    // 休眠恢复：重建 sessions
    this.ctx.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment()
      if (attachment) {
        this.sessions.set(ws, attachment)
      }
    })

    // 自动心跳 (ping/pong)
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    )

    // 初始化数据库
    this.initDB()
  }

  initDB() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_info (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        class_id TEXT,
        avatar TEXT,
        game_mode TEXT,
        player_data TEXT,
        last_seen INTEGER,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        content TEXT NOT NULL,
        channel TEXT DEFAULT 'public',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS npc_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_name TEXT NOT NULL,
        time_str TEXT NOT NULL,
        content TEXT NOT NULL,
        witness TEXT,
        floor INTEGER,
        source_player TEXT,
        created_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS worldbook_hash (
        key TEXT PRIMARY KEY,
        hash TEXT,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS npc_chat_snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_name TEXT NOT NULL,
        player_name TEXT NOT NULL,
        snippet TEXT NOT NULL,
        game_time TEXT,
        created_at INTEGER
      );
    `)
  }

  // ── 配置管理 ──

  getConfig() {
    if (this.roomInfo) return this.roomInfo
    const cursor = this.ctx.storage.sql.exec(
      `SELECT value FROM room_info WHERE key = 'config'`
    )
    const row = [...cursor][0]
    this.roomInfo = row ? JSON.parse(row.value) : null
    return this.roomInfo
  }

  saveConfig(config) {
    this.roomInfo = config
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO room_info (key, value) VALUES ('config', ?)`,
      JSON.stringify(config)
    )
  }

  // ── RPC 方法 (Worker 调用) ──

  async initRoom(roomId, body) {
    const config = {
      roomId,
      roomName: body.roomName || '未命名房间',
      hostId: body.hostId || null,
      hostName: body.hostName || '???',
      createdAt: Date.now(),
      settings: {
        maxPlayers: body.settings?.maxPlayers || 10,
        isPublic: body.settings?.isPublic !== false,
        password: body.settings?.password || null,
        gameMode: body.settings?.gameMode || 'normal',
        allowSpectators: body.settings?.allowSpectators !== false,
      },
      gameTime: body.gameTime || null,
      weekNumber: body.weekNumber || 1,
      roomRunId: body.roomRunId || null,
    }
    this.saveConfig(config)

    // 保存房主的世界书 hash
    if (body.worldbookHash) {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO worldbook_hash (key, hash, updated_at) VALUES ('host', ?, ?)`,
        body.worldbookHash, Date.now()
      )
    }
  }

  async getRoomInfo() {
    const config = this.getConfig()
    if (!config) return null
    return {
      ...config,
      playerCount: this.sessions.size,
      players: [...this.sessions.values()].map(s => ({
        playerId: s.playerId,
        playerName: s.playerName,
        role: s.role,
        classId: s.classId,
        avatar: s.avatar,
        location: s.location,
      }))
    }
  }

  // ── WebSocket 连接 ──

  async fetch(request) {
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')
    const playerName = url.searchParams.get('playerName') || 'Anonymous'
    const role = url.searchParams.get('role') || 'student'
    const classId = url.searchParams.get('classId') || ''
    const avatar = url.searchParams.get('avatar') || ''
    const spectatorOnly = url.searchParams.get('spectatorOnly') === 'true'

    if (!playerId) {
      return new Response('Missing playerId', { status: 400 })
    }

    // 解析 JWT token（可选，用于 Discord 身份验证）
    let discordAuth = null
    const token = url.searchParams.get('token')
    if (token && this.env.JWT_SECRET) {
      const result = await verifyJWT(token, this.env.JWT_SECRET)
      if (result.valid) {
        discordAuth = result.payload
      }
    }

    // 解析玩家 features（assistantAI/RAG/summary 状态）
    let features = null
    const featuresParam = url.searchParams.get('features')
    if (featuresParam) {
      try { features = JSON.parse(featuresParam) } catch {}
    }

    const config = this.getConfig()

    // 检查密码
    if (config?.settings?.password) {
      const pw = url.searchParams.get('password')
      if (pw !== config.settings.password) {
        return new Response(JSON.stringify({ error: 'Wrong password' }), { status: 403 })
      }
    }

    // 检查人数限制
    if (config?.settings?.maxPlayers && this.sessions.size >= config.settings.maxPlayers) {
      return new Response(JSON.stringify({ error: 'Room is full' }), { status: 403 })
    }

    // Phase 6: 信任等级准入检查
    const trustPolicy = config?.settings?.trustPolicy || 'open'
    const playerTrust = discordAuth ? (discordAuth.verified ? 'verified' : discordAuth.guildMember ? 'member' : 'logged_in') : 'anonymous'
    const TRUST_ORDER = ['anonymous', 'logged_in', 'member', 'verified']
    const playerTrustIdx = TRUST_ORDER.indexOf(playerTrust)
    const minTrustMap = { strict: 3, relaxed: 2, open: 0 } // verified=3, member=2, anonymous=0
    const minTrustIdx = minTrustMap[trustPolicy] ?? 0
    if (playerTrustIdx < minTrustIdx) {
      const labels = { strict: '仅限已验证成员', relaxed: '仅限服务器成员', open: '开放' }
      return new Response(JSON.stringify({ error: `房间准入要求: ${labels[trustPolicy] || trustPolicy}` }), { status: 403 })
    }

    // 检查是否是重连（相同 playerId 的旧连接）
    for (const [ws, session] of this.sessions) {
      if (session.playerId === playerId) {
        try { ws.close(1000, 'replaced') } catch {}
        this.sessions.delete(ws)
        break
      }
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)

    const sessionData = {
      playerId,
      playerName,
      role,
      classId,
      avatar,
      location: '',
      joinedAt: Date.now(),
      lastMessageTime: 0,
      messageCount: 0,
      // Discord 身份
      discordId: discordAuth?.discordId || null,
      discordUsername: discordAuth?.username || null,
      verified: discordAuth?.verified || false,
      guildMember: discordAuth?.guildMember || false,
      trustLevel: discordAuth ? (discordAuth.verified ? 'verified' : discordAuth.guildMember ? 'member' : 'logged_in') : 'anonymous',
      // 玩家系统 features
      features: features || { assistantAI: false, rag: false, summary: false },
      spectatorOnly: spectatorOnly || false,
    }
    server.serializeAttachment(sessionData)
    this.sessions.set(server, sessionData)

    // 如果是房主（首个连接或 hostId 匹配），设置 hostId
    if (!config.hostId || config.hostId === playerId) {
      config.hostId = playerId
      config.hostName = playerName
      this.saveConfig(config)
    }

    // 持久化玩家
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO players (player_id, player_name, role, class_id, avatar, last_seen, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      playerId, playerName, role, classId, avatar, Date.now(), Date.now()
    )

    // 获取最近聊天记录
    const recentChat = [...this.ctx.storage.sql.exec(
      `SELECT player_id, player_name, content, channel, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 50`
    )].reverse()

    // 获取房主世界书 hash
    const wbHashRow = [...this.ctx.storage.sql.exec(
      `SELECT hash FROM worldbook_hash WHERE key = 'host'`
    )][0]

    // 获取所有 NPC 记忆
    const npcMemories = [...this.ctx.storage.sql.exec(
      `SELECT npc_name, time_str, content, witness, floor, created_at FROM npc_memories ORDER BY created_at ASC`
    )]

    // 获取 NPC 聊天片段（每个 NPC 最多 30 条）
    const npcChatSnippets = [...this.ctx.storage.sql.exec(
      `SELECT npc_name, player_name, snippet, game_time, created_at FROM npc_chat_snippets ORDER BY created_at ASC`
    )]

    // 发送欢迎消息
    server.send(JSON.stringify({
      type: 'welcome',
      data: {
        roomInfo: config,
        players: [...this.sessions.values()].map(s => ({
          playerId: s.playerId,
          playerName: s.playerName,
          role: s.role,
          classId: s.classId,
          avatar: s.avatar,
          location: s.location,
          trustLevel: s.trustLevel || 'anonymous',
          features: s.features || { assistantAI: false, rag: false, summary: false },
          spectatorOnly: s.spectatorOnly || false,
        })),
        recentChat,
        hostWorldbookHash: wbHashRow?.hash || null,
        npcMemories: this.groupNpcMemories(npcMemories),
        npcChatHistory: this.groupNpcChatSnippets(npcChatSnippets),
        isHost: playerId === config.hostId,
        roomGameTime: this.roomGameTime,
        roundNumber: this.roundNumber,
        gameStarted: this.gameStarted,
      },
      ts: Date.now()
    }))

    // 广播玩家加入
    this.broadcast(JSON.stringify({
      type: 'player_joined',
      data: {
        playerId, playerName, role, classId, avatar,
        trustLevel: sessionData.trustLevel,
        features: sessionData.features,
        spectatorOnly: sessionData.spectatorOnly || false,
      },
      ts: Date.now()
    }), server)

    // 如果房主重连，取消断线计时器
    if (playerId === config.hostId && this.hostDisconnectTimer) {
      clearTimeout(this.hostDisconnectTimer)
      this.hostDisconnectTimer = null
      this.broadcast(JSON.stringify({
        type: 'host_reconnected',
        data: { playerId },
        ts: Date.now()
      }))
    }

    // Phase 3: 当 2+ 玩家在线时启动世界书定期校验
    if (this.sessions.size >= 2 && !this.wbCheckTimer) {
      this.startWorldbookCheckTimer()
    }

    // 更新房间索引人数（加入时也要同步）
    this.updateRoomIndex()

    return new Response(null, { status: 101, webSocket: client })
  }

  // ── WebSocket 消息处理 ──

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return
    const session = this.sessions.get(ws)
    if (!session) return

    // 更新活动时间（AFK 检测用）
    session.lastActivity = Date.now()

    // 频率限制
    const now = Date.now()
    if (now - session.lastMessageTime < 1000) {
      session.messageCount++
      if (session.messageCount > RATE_LIMIT_PER_SECOND) {
        ws.send(JSON.stringify({ type: 'error', data: { code: 'RATE_LIMIT', message: 'Too many messages' }, ts: now }))
        return
      }
    } else {
      session.lastMessageTime = now
      session.messageCount = 1
    }

    let msg
    try { msg = JSON.parse(message) } catch { return }

    switch (msg.type) {
      case 'chat': this.handleChat(ws, session, msg.data); break
      case 'player_update': this.handlePlayerUpdate(ws, session, msg.data); break
      case 'location_change': this.handleLocationChange(ws, session, msg.data); break
      case 'player_init': this.handlePlayerInit(ws, session, msg.data); break
      case 'worldbook_sync_request': this.handleWorldbookSyncRequest(ws, session); break
      case 'worldbook_sync_complete': this.handleWorldbookSyncComplete(ws, session, msg.data); break
      case 'npc_memory_sync': this.handleNpcMemorySync(ws, session, msg.data); break
      case 'npc_move_sync': this.handleNpcMoveSync(ws, session, msg.data); break
      case 'npc_relationship_sync': this.handleNpcRelationshipSync(ws, session, msg.data); break
      case 'worldbook_entry_sync': this.handleWorldbookEntrySync(ws, session, msg.data); break
      case 'npc_chat_sync': this.handleNpcChatSync(ws, session, msg.data); break
      case 'join_conversation': this.handleJoinConversation(ws, session, msg.data); break
      case 'leave_conversation': this.handleLeaveConversation(ws, session); break
      case 'turn_action': this.handleTurnAction(ws, session, msg.data); break
      case 'turn_skip': this.handleTurnSkip(ws, session); break
      case 'turn_typing': this.handleTurnTyping(ws, session, msg.data); break
      case 'turn_complete': this.handleTurnComplete(ws, session, msg.data); break
      case 'afk_extend': this.handleAfkExtend(ws, session); break
      case 'activity_ping': this.handleActivityPing(ws, session); break
      case 'time_adjust': this.handleTimeAdjust(ws, session, msg.data); break
      case 'spectate_request': this.handleSpectateRequest(ws, session, msg.data); break
      case 'spectate_response': this.handleSpectateResponse(ws, session, msg.data); break
      case 'spectate_stream': this.handleSpectateStream(ws, session, msg.data); break
      case 'spectate_stop': this.handleSpectateStop(ws, session); break
      case 'spectate_set_layers': this.handleSpectateSetLayers(ws, session, msg.data); break
      case 'ai_response': this.handleAiResponse(ws, session, msg.data); break
      case 'vote_cast': this.handleVoteCast(ws, session, msg.data); break
      case 'npc_transfer_ack': this.handleNpcTransferAck(ws, session, msg.data); break
      case 'room_settings': this.handleRoomSettings(ws, session, msg.data); break
      case 'kick': this.handleKick(ws, session, msg.data); break
      case 'feature_update': this.handleFeatureUpdate(ws, session, msg.data); break
      case 'worldbook_verify_response': this.handleWorldbookVerifyResponse(ws, session, msg.data); break
      case 'worldbook_spot_samples': this.handleWorldbookSpotSamples(ws, session, msg.data); break
      case 'worldbook_spot_check_response': this.handleWorldbookSpotCheckResponse(ws, session, msg.data); break
      case 'save_request': this.handleSaveRequest(ws, session, msg.data); break
      case 'save_chunk': this.handleSaveChunk(ws, session, msg.data); break
      case 'offline_growth': this.handleOfflineGrowth(ws, session, msg.data); break
      case 'game_start': this.handleGameStart(ws, session); break
      case 'batch':
        for (const m of (msg.data?.messages || [])) {
          await this.webSocketMessage(ws, JSON.stringify(m))
        }
        break
    }
  }

  // ── 消息处理函数 ──

  handleChat(ws, session, data) {
    session.afkDeadline = Infinity // 聊天也算有操作 → 清除 AFK
    const { content, channel = 'public' } = data || {}
    if (!content || typeof content !== 'string' || content.length > MAX_CHAT_LENGTH) return

    this.ctx.storage.sql.exec(
      `INSERT INTO chat_messages (player_id, player_name, content, channel, created_at) VALUES (?, ?, ?, ?, ?)`,
      session.playerId, session.playerName, content, channel, Date.now()
    )

    // 频道路由
    if (channel.startsWith('whisper:')) {
      const targetId = channel.split(':')[1]
      this.sendToPlayer(targetId, JSON.stringify({
        type: 'chat',
        data: { content, channel },
        from: session.playerId,
        fromName: session.playerName,
        ts: Date.now()
      }))
      // 也发回给自己确认
      ws.send(JSON.stringify({
        type: 'chat',
        data: { content, channel },
        from: session.playerId,
        fromName: session.playerName,
        ts: Date.now()
      }))
    } else {
      this.broadcast(JSON.stringify({
        type: 'chat',
        data: { content, channel },
        from: session.playerId,
        fromName: session.playerName,
        ts: Date.now()
      }))
    }
  }

  handlePlayerUpdate(ws, session, data) {
    if (!data?.stats) return
    // 如果包含 playerName，同步更新 session
    if (data.stats.playerName) {
      session.playerName = data.stats.playerName
      ws.serializeAttachment(session)
    }
    this.broadcast(JSON.stringify({
      type: 'player_update',
      data: { stats: data.stats },
      from: session.playerId,
      ts: Date.now()
    }), ws)
  }

  handleLocationChange(ws, session, data) {
    if (!data?.location) return
    const oldLocation = session.location
    session.location = data.location
    ws.serializeAttachment(session)

    // 玩家离开地点时自动退出对话组
    if (oldLocation !== data.location) {
      this.handleLeaveConversation(ws, session)
    }

    this.broadcast(JSON.stringify({
      type: 'location_change',
      data: { location: data.location },
      from: session.playerId,
      fromName: session.playerName,
      ts: Date.now()
    }), ws)

    // 广播新旧地点的玩家列表
    this.broadcastPlayersAtLocation(data.location)
    if (oldLocation && oldLocation !== data.location) {
      this.broadcastPlayersAtLocation(oldLocation)
    }
  }

  handlePlayerInit(ws, session, data) {
    if (data?.publicState) {
      // 更新 session 中的玩家信息
      if (data.publicState.location) session.location = data.publicState.location
      if (data.publicState.classId) session.classId = data.publicState.classId
      ws.serializeAttachment(session)

      this.broadcast(JSON.stringify({
        type: 'player_init',
        data: { publicState: data.publicState },
        from: session.playerId,
        fromName: session.playerName,
        ts: Date.now()
      }), ws)
    }
  }

  handleWorldbookSyncRequest(ws, session) {
    // 找到房主的连接，请求世界书数据
    const config = this.getConfig()
    if (!config) return

    const hostWs = this.findPlayerWs(config.hostId)
    if (hostWs) {
      hostWs.send(JSON.stringify({
        type: 'worldbook_data_request',
        data: { requesterId: session.playerId, requesterName: session.playerName },
        ts: Date.now()
      }))
    }
  }

  handleWorldbookSyncComplete(ws, session, data) {
    // 玩家确认世界书同步完成
    this.broadcast(JSON.stringify({
      type: 'worldbook_sync_status',
      data: { playerId: session.playerId, playerName: session.playerName, success: data?.success },
      ts: Date.now()
    }))
  }

  handleNpcChatSync(ws, session, data) {
    if (!Array.isArray(data?.snippets) || data.snippets.length === 0) return

    for (const s of data.snippets) {
      if (!s.npcName || !s.snippet) continue
      this.ctx.storage.sql.exec(
        `INSERT INTO npc_chat_snippets (npc_name, player_name, snippet, game_time, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        s.npcName,
        session.playerName,
        s.snippet,
        s.gameTime || '',
        Date.now()
      )
    }

    // 广播给除发送者外的所有玩家
    this.broadcast(JSON.stringify({
      type: 'npc_chat_sync',
      data: {
        snippets: data.snippets.map(s => ({
          ...s,
          playerName: session.playerName
        }))
      },
      from: session.playerId,
      ts: Date.now()
    }), ws)
  }

  handleWorldbookEntrySync(ws, session, data) {
    if (!data?.action || !data?.bookName) return
    // 广播给除发送者外的所有玩家
    this.broadcast(JSON.stringify({
      type: 'worldbook_entry_sync',
      data,
      from: session.playerId,
      ts: Date.now()
    }), ws)
  }

  handleNpcMoveSync(ws, session, data) {
    if (!Array.isArray(data?.moves) || data.moves.length === 0) return
    // 广播给除发送者外的所有玩家
    this.broadcast(JSON.stringify({
      type: 'npc_move_sync',
      data: { moves: data.moves },
      from: session.playerId,
      ts: Date.now()
    }), ws)
  }

  handleNpcRelationshipSync(ws, session, data) {
    if (!Array.isArray(data?.updates) || data.updates.length === 0) return
    // 广播给除发送者外的所有玩家
    this.broadcast(JSON.stringify({
      type: 'npc_relationship_sync',
      data: { updates: data.updates },
      from: session.playerId,
      ts: Date.now()
    }), ws)
  }

  handleNpcMemorySync(ws, session, data) {
    if (!data?.npcName || !data?.memory) return

    const memory = data.memory
    // 持久化
    this.ctx.storage.sql.exec(
      `INSERT INTO npc_memories (npc_name, time_str, content, witness, floor, source_player, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      data.npcName,
      memory.time || '',
      memory.content || '',
      JSON.stringify(memory.witness || []),
      memory.floor || 0,
      session.playerId,
      Date.now()
    )

    // 广播给所有玩家
    this.broadcast(JSON.stringify({
      type: 'npc_memory_update',
      data: { npcName: data.npcName, memory },
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleJoinConversation(ws, session, data) {
    if (!data?.targetPlayerId) return
    const targetSession = this.findPlayerSession(data.targetPlayerId)
    if (!targetSession) return

    // 查找或创建对话组
    let group = this.findConversationGroupByPlayer(data.targetPlayerId)
    if (!group) {
      const groupId = `conv_${Date.now()}`
      group = {
        groupId,
        hostPlayerId: data.targetPlayerId,
        memberIds: [data.targetPlayerId],
        locationId: targetSession.location,
        sharedNpcs: [],
      }
      this.conversationGroups.set(groupId, group)
    }

    if (!group.memberIds.includes(session.playerId)) {
      group.memberIds.push(session.playerId)
    }

    // 通知对话组所有成员
    for (const memberId of group.memberIds) {
      this.sendToPlayer(memberId, JSON.stringify({
        type: 'conversation_joined',
        data: {
          groupId: group.groupId,
          playerId: session.playerId,
          playerName: session.playerName,
          group: { ...group },
        },
        ts: Date.now()
      }))
    }
  }

  handleLeaveConversation(ws, session) {
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (!group) return

    group.memberIds = group.memberIds.filter(id => id !== session.playerId)

    // 通知离开的玩家自己（清除客户端对话组状态）
    this.sendToPlayer(session.playerId, JSON.stringify({
      type: 'conversation_left',
      data: { playerId: session.playerId, playerName: session.playerName, groupId: group.groupId },
      ts: Date.now()
    }))

    // 通知剩余成员
    for (const memberId of group.memberIds) {
      this.sendToPlayer(memberId, JSON.stringify({
        type: 'conversation_left',
        data: { playerId: session.playerId, playerName: session.playerName, groupId: group.groupId },
        ts: Date.now()
      }))
    }

    // 如果组内只剩一人，解散
    if (group.memberIds.length <= 1) {
      this.conversationGroups.delete(group.groupId)
    }
  }

  handleTurnAction(ws, session, data) {
    session.afkDeadline = Infinity // 有操作 → 清除 AFK
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (!group) return

    // 转发给对话组的 host（AI 生成者）
    this.sendToPlayer(group.hostPlayerId, JSON.stringify({
      type: 'turn_action',
      data: { content: data?.content || '', playerInfo: data?.playerInfo || '', playerId: session.playerId, playerName: session.playerName },
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleTurnSkip(ws, session) {
    session.afkDeadline = Infinity // 有操作 → 清除 AFK
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (!group) return

    this.sendToPlayer(group.hostPlayerId, JSON.stringify({
      type: 'turn_skip',
      data: { playerId: session.playerId, playerName: session.playerName },
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleTurnTyping(ws, session, data) {
    session.afkDeadline = Infinity // 输入中也算有操作 → 清除 AFK
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (!group) return

    // 转发给对话组所有其他成员（含 host）
    for (const memberId of group.members) {
      if (memberId === session.playerId) continue
      this.sendToPlayer(memberId, JSON.stringify({
        type: 'turn_typing',
        data: { playerId: session.playerId, playerName: session.playerName, isTyping: data?.isTyping ?? true },
        ts: Date.now()
      }))
    }
  }

  handleTurnComplete(ws, session, data) {
    // 玩家完成回合 → 清除其 AFK 截止时间
    session.afkDeadline = Infinity
    // 如果之前是 AFK，清除并广播
    if (session.isAfk) {
      session.isAfk = false
      this.broadcast(JSON.stringify({
        type: 'afk_status_change',
        data: { playerId: session.playerId, isAfk: false },
        ts: Date.now()
      }))
    }

    this.turnState.set(session.playerId, {
      timeDelta: data?.timeDelta || 0,
      gameTime: data?.gameTime || null,
      completed: true,
    })

    // 更新房间游戏时间（取最新提交的非空时间）
    if (data?.gameTime) {
      this.roomGameTime = data.gameTime
    }

    // AFK 检查：超过截止时间的玩家自动视为完成
    const now = Date.now()
    // 排除观战者和纯观战加入的玩家
    const spectatorIds = new Set(this.spectateMap.keys())
    const onlineIds = [...this.sessions.values()]
      .filter(s => !s.spectatorOnly && !spectatorIds.has(s.playerId))
      .map(s => s.playerId)

    for (const s of this.sessions.values()) {
      if (s.afkDeadline && now > s.afkDeadline && !this.turnState.get(s.playerId)?.completed) {
        // 检查玩家是否最近有活动（浏览历史、滚动等）—— 如果30秒内有活动，自动延期而不是标记AFK
        if (s.lastActivity && (now - s.lastActivity) < 30000) {
          s.afkDeadline = now + 60000 // 再给60秒
          continue
        }
        this.turnState.set(s.playerId, { timeDelta: 0, gameTime: null, completed: true, afk: true })
        // 标记会话 AFK 状态
        s.isAfk = true
        // 通知该玩家被标记为 AFK
        const afkWs = this.findPlayerWs(s.playerId)
        if (afkWs) {
          afkWs.send(JSON.stringify({ type: 'afk_warning', data: { message: '你已被标记为挂机，本回合自动跳过' }, ts: now }))
        }
        // 广播 AFK 状态变更
        this.broadcast(JSON.stringify({
          type: 'afk_status_change',
          data: { playerId: s.playerId, isAfk: true },
          ts: now
        }))
      }
    }

    const allDone = onlineIds.every(id => this.turnState.get(id)?.completed)

    if (allDone) {
      // 计算基准时间（最小 timeDelta）
      const deltas = onlineIds.map(id => this.turnState.get(id)?.timeDelta || 0)
      const minDelta = Math.min(...deltas)

      // 检查时间差警告
      for (const [ws2, s] of this.sessions) {
        const playerDelta = this.turnState.get(s.playerId)?.timeDelta || 0
        if (playerDelta - minDelta > 20) {
          ws2.send(JSON.stringify({
            type: 'time_warning',
            data: { diff: playerDelta - minDelta, baseDelta: minDelta, yourDelta: playerDelta },
            ts: Date.now()
          }))
        }
      }

      this.roundNumber++
      this.turnState.clear()

      // 广播 turn_advance 并为所有玩家设置 AFK 截止时间
      const advanceTs = Date.now()
      this.broadcast(JSON.stringify({
        type: 'turn_advance',
        data: { roundNumber: this.roundNumber, roomGameTime: this.roomGameTime },
        ts: advanceTs
      }))

      // 回合推进后，开始计60s AFK 倒计时（排除观战者）
      const spectatorIdsForAfk = new Set(this.spectateMap.keys())
      for (const s of this.sessions.values()) {
        if (!s.spectatorOnly && !spectatorIdsForAfk.has(s.playerId)) {
          s.afkDeadline = advanceTs + 60000
        }
      }

      // 检查时间差观战者是否应该自动退出
      this.checkTimeGapSpectators(minDelta)
    }
  }

  handleActivityPing(ws, session) {
    // 前端检测到用户活跃（滚动、点击、按键等）时发送
    // 如果玩家之前是 AFK 状态，清除并广播
    if (session.isAfk) {
      session.isAfk = false
      this.broadcast(JSON.stringify({
        type: 'afk_status_change',
        data: { playerId: session.playerId, isAfk: false },
        ts: Date.now()
      }))
    }
    // 如果有 AFK 截止时间且快到了，自动延期
    if (session.afkDeadline && session.afkDeadline !== Infinity) {
      const remaining = session.afkDeadline - Date.now()
      if (remaining < 30000) {
        session.afkDeadline = Date.now() + 60000
      }
    }
  }

  handleAfkExtend(ws, session) {
    // 玩家申请延时 +2分钟
    if (session.afkDeadline && session.afkDeadline !== Infinity) {
      session.afkDeadline += 120000
    } else {
      session.afkDeadline = Date.now() + 120000
    }
    ws.send(JSON.stringify({ type: 'afk_extended', data: { newDeadline: session.afkDeadline }, ts: Date.now() }))
  }

  handleTimeAdjust(ws, session, data) {
    if (data?.adjustedDelta != null) {
      const state = this.turnState.get(session.playerId)
      if (state) {
        state.timeDelta = data.adjustedDelta
      }
    }
  }

  handleSpectateRequest(ws, session, data) {
    if (!data?.targetPlayerId) return
    // 存储待处理的观战请求（含模式信息）
    this.pendingSpectateRequests.set(session.playerId, {
      targetId: data.targetPlayerId,
      mode: data.mode || 'time_gap',
      excessTime: data.excessTime || 0,
    })
    this.sendToPlayer(data.targetPlayerId, JSON.stringify({
      type: 'spectate_request',
      data: { requesterId: session.playerId, requesterName: session.playerName, mode: data.mode || 'time_gap' },
      ts: Date.now()
    }))
  }

  handleSpectateResponse(ws, session, data) {
    if (!data?.requesterId) return
    const approved = !!data.approved
    const pending = this.pendingSpectateRequests.get(data.requesterId)
    this.pendingSpectateRequests.delete(data.requesterId)

    // 获取/创建被观战者的观战设置
    if (!this.spectateSettings.has(session.playerId)) {
      this.spectateSettings.set(session.playerId, { visibleLayers: 4, lastLayerChange: 0 })
    }
    const settings = this.spectateSettings.get(session.playerId)

    this.sendToPlayer(data.requesterId, JSON.stringify({
      type: 'spectate_response',
      data: {
        approved,
        targetId: session.playerId,
        targetName: session.playerName,
        mode: pending?.mode || 'time_gap',
        visibleLayers: settings.visibleLayers,
      },
      ts: Date.now()
    }))

    if (approved) {
      // 记录观战关系（含模式和时间差信息）
      this.spectateMap.set(data.requesterId, {
        targetId: session.playerId,
        mode: pending?.mode || 'time_gap',
        excessTime: pending?.excessTime || 0,
      })
      // 通知被观战者有新观众
      this.sendToPlayer(session.playerId, JSON.stringify({
        type: 'spectate_started',
        data: {
          spectatorId: data.requesterId,
          spectatorName: data.requesterName || data.requesterId,
          mode: pending?.mode || 'time_gap',
        },
        ts: Date.now()
      }))
    }
  }

  handleSpectateStream(ws, session, data) {
    // 被观战者发送 chatLog 更新 → 转发给所有观战者
    for (const [spectatorId, entry] of this.spectateMap) {
      if (entry.targetId === session.playerId) {
        this.sendToPlayer(spectatorId, JSON.stringify({
          type: 'spectate_stream',
          data: { chatLog: data?.chatLog || [] },
          ts: Date.now()
        }))
      }
    }
  }

  handleSpectateStop(ws, session) {
    const entry = this.spectateMap.get(session.playerId)
    if (entry) {
      this.spectateMap.delete(session.playerId)
      // 通知被观战者失去一个观众
      this.sendToPlayer(entry.targetId, JSON.stringify({
        type: 'spectate_stopped',
        data: { spectatorId: session.playerId },
        ts: Date.now()
      }))
    }
  }

  handleSpectateSetLayers(ws, session, data) {
    const layers = Math.max(1, Math.min(20, parseInt(data?.layers) || 4))
    if (!this.spectateSettings.has(session.playerId)) {
      this.spectateSettings.set(session.playerId, { visibleLayers: 4, lastLayerChange: 0 })
    }
    const settings = this.spectateSettings.get(session.playerId)

    // 300秒冷却检查
    const now = Date.now()
    const cooldownMs = 300000
    if (settings.lastLayerChange && (now - settings.lastLayerChange) < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - settings.lastLayerChange)) / 1000)
      ws.send(JSON.stringify({
        type: 'spectate_set_layers_error',
        data: { error: 'cooldown', remaining },
        ts: now
      }))
      return
    }

    settings.visibleLayers = layers
    settings.lastLayerChange = now

    // 通知被观战者确认
    ws.send(JSON.stringify({
      type: 'spectate_layers_updated',
      data: { visibleLayers: layers },
      ts: now
    }))

    // 通知所有观战此玩家的观战者
    for (const [spectatorId, entry] of this.spectateMap) {
      if (entry.targetId === session.playerId) {
        this.sendToPlayer(spectatorId, JSON.stringify({
          type: 'spectate_layers_updated',
          data: { visibleLayers: layers },
          ts: now
        }))
      }
    }
  }

  checkTimeGapSpectators(minDelta) {
    // 每轮结束后，减少时间差观战者的 excessTime
    const toRemove = []
    for (const [spectatorId, entry] of this.spectateMap) {
      if (entry.mode === 'time_gap') {
        entry.excessTime = (entry.excessTime || 0) - (minDelta || 0)
        if (entry.excessTime <= 0) {
          toRemove.push({ spectatorId, entry })
        }
      }
    }
    for (const { spectatorId, entry } of toRemove) {
      this.spectateMap.delete(spectatorId)
      this.sendToPlayer(spectatorId, JSON.stringify({
        type: 'spectate_auto_exit',
        data: { reason: 'time_synced' },
        ts: Date.now()
      }))
      this.sendToPlayer(entry.targetId, JSON.stringify({
        type: 'spectate_stopped',
        data: { spectatorId },
        ts: Date.now()
      }))
    }
  }

  // ── 存档分发 ──

  handleSaveRequest(ws, session, data) {
    // 转发给房主
    const hostSession = [...this.sessions.values()].find(s => s.playerId === this.hostId)
    if (!hostSession) return
    this.sendToPlayer(this.hostId, JSON.stringify({
      type: 'save_request',
      data: { requesterId: session.playerId, requesterName: session.playerName },
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleSaveChunk(ws, session, data) {
    // 房主发送的存档块 → 转发给目标玩家
    if (!data?.targetPlayerId) return
    this.sendToPlayer(data.targetPlayerId, JSON.stringify({
      type: 'save_chunk',
      data,
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleOfflineGrowth(ws, session, data) {
    // 房主发送的离线成长数据 → 转发给目标玩家
    if (!data?.targetPlayerId) return
    this.sendToPlayer(data.targetPlayerId, JSON.stringify({
      type: 'offline_growth',
      data,
      from: session.playerId,
      ts: Date.now()
    }))
  }

  handleAiResponse(ws, session, data) {
    // AI 生成者将回复广播给对话组
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (!group) return

    for (const memberId of group.memberIds) {
      if (memberId !== session.playerId) {
        this.sendToPlayer(memberId, JSON.stringify({
          type: 'ai_response',
          data: {
            content: data?.content || '',
            rawContent: data?.rawContent || '',
            groupId: group.groupId,
          },
          from: session.playerId,
          ts: Date.now()
        }))
      }
    }
  }

  handleVoteCast(ws, session, data) {
    if (!this.activeVote) return
    this.activeVote.votes[session.playerId] = data?.option

    // 检查是否所有人都投了
    const onlineIds = [...this.sessions.values()].map(s => s.playerId)
    const votedCount = onlineIds.filter(id => this.activeVote.votes[id] != null).length

    if (votedCount >= onlineIds.length) {
      this.resolveVote()
    }
  }

  handleNpcTransferAck(ws, session, data) {
    // 确认收到 NPC 转移
    if (!data?.npcName) return
    this.broadcast(JSON.stringify({
      type: 'npc_transfer_ack',
      data: { npcName: data.npcName, playerId: session.playerId, playerName: session.playerName },
      ts: Date.now()
    }))
  }

  handleRoomSettings(ws, session, data) {
    const config = this.getConfig()
    if (!config || session.playerId !== config.hostId) return
    if (data?.settings) {
      Object.assign(config.settings, data.settings)
      this.saveConfig(config)
      this.broadcast(JSON.stringify({
        type: 'room_update',
        data: { settings: config.settings },
        ts: Date.now()
      }))
    }
  }

  handleFeatureUpdate(ws, session, data) {
    if (!data?.features) return
    session.features = {
      assistantAI: !!data.features.assistantAI,
      rag: !!data.features.rag,
      summary: !!data.features.summary,
    }
    ws.serializeAttachment(session)

    this.broadcast(JSON.stringify({
      type: 'feature_update',
      data: { playerId: session.playerId, features: session.features },
      ts: Date.now()
    }))
  }

  handleKick(ws, session, data) {
    const config = this.getConfig()
    if (!config || session.playerId !== config.hostId) return
    if (!data?.targetId) return

    const targetWs = this.findPlayerWs(data.targetId)
    if (targetWs) {
      targetWs.send(JSON.stringify({
        type: 'kicked',
        data: { reason: data.reason || '被房主踢出' },
        ts: Date.now()
      }))
      targetWs.close(1000, 'kicked')
    }
  }

  handleGameStart(ws, session) {
    const config = this.getConfig()
    if (!config || session.playerId !== config.hostId) return // 仅房主可以开始

    this.gameStarted = true

    // 广播游戏开始
    this.broadcast(JSON.stringify({
      type: 'game_started',
      data: { startedBy: session.playerId },
      ts: Date.now()
    }))

    // 更新 RoomIndex 状态为 playing
    if (config.settings?.isPublic) {
      try {
        const indexStub = this.env.ROOM_INDEX.get(this.env.ROOM_INDEX.idFromName('global'))
        indexStub.updateRoomStatus(config.roomId, 'playing')
      } catch {}
    }
  }

  // ── WebSocket 关闭/错误 ──

  async webSocketClose(ws, code, reason) {
    const session = this.sessions.get(ws)
    this.sessions.delete(ws)

    if (!session) return

    // 更新最后在线
    this.ctx.storage.sql.exec(
      `UPDATE players SET last_seen = ? WHERE player_id = ?`,
      Date.now(), session.playerId
    )

    // 清理观战关系
    const spectateEntry = this.spectateMap.get(session.playerId)
    if (spectateEntry) {
      this.spectateMap.delete(session.playerId)
      this.sendToPlayer(spectateEntry.targetId, JSON.stringify({
        type: 'spectate_stopped',
        data: { spectatorId: session.playerId },
        ts: Date.now()
      }))
    }
    // 如果被观战的玩家断线，通知所有观战者
    for (const [spectatorId, entry] of this.spectateMap) {
      if (entry.targetId === session.playerId) {
        this.spectateMap.delete(spectatorId)
        this.sendToPlayer(spectatorId, JSON.stringify({
          type: 'spectate_stream',
          data: { chatLog: [], ended: true },
          ts: Date.now()
        }))
      }
    }
    // 清理观战设置和待处理请求
    this.spectateSettings.delete(session.playerId)
    this.pendingSpectateRequests.delete(session.playerId)

    // 广播离开
    this.broadcast(JSON.stringify({
      type: 'player_left',
      data: { playerId: session.playerId, playerName: session.playerName },
      ts: Date.now()
    }))

    // 断线玩家在对话组中 → 自动提交 skip 给 host
    const group = this.findConversationGroupByPlayer(session.playerId)
    if (group) {
      // 如果不是 host，给 host 发送自动跳过
      if (group.hostPlayerId !== session.playerId) {
        this.sendToPlayer(group.hostPlayerId, JSON.stringify({
          type: 'turn_skip',
          data: { playerId: session.playerId, playerName: session.playerName, auto: true },
          from: session.playerId,
          ts: Date.now()
        }))
      }
      group.memberIds = group.memberIds.filter(id => id !== session.playerId)
      if (group.memberIds.length <= 1) {
        this.conversationGroups.delete(group.groupId)
      }
    }

    // Phase 3: 停止世界书校验（无玩家或仅 1 人）
    if (this.sessions.size < 2 && this.wbCheckTimer) {
      this.stopWorldbookCheckTimer()
    }

    // 检查是否是房主断线
    const config = this.getConfig()
    if (config && session.playerId === config.hostId) {
      this.broadcast(JSON.stringify({
        type: 'host_disconnected',
        data: { timestamp: Date.now() },
        ts: Date.now()
      }))

      // 启动超时计时器
      this.hostDisconnectTimer = setTimeout(() => {
        this.startHostVote()
      }, HOST_DISCONNECT_TIMEOUT)
    }

    // 房间空了 → 清理
    if (this.sessions.size === 0) {
      await this.destroyRoom()
      return
    }

    // 更新房间索引的人数
    this.updateRoomIndex()
  }

  async webSocketError(ws, error) {
    console.error('[SchoolRoom] WebSocket error:', error)
    this.sessions.delete(ws)
  }

  // ── 投票系统 ──

  startHostVote() {
    const onlineIds = [...this.sessions.values()].map(s => s.playerId)
    if (onlineIds.length === 0) return

    this.activeVote = {
      voteId: `vote_${Date.now()}`,
      type: 'host_disconnect',
      options: ['new_host', 'single_player'],
      votes: {},
      startedAt: Date.now(),
    }

    this.broadcast(JSON.stringify({
      type: 'vote_start',
      data: {
        voteId: this.activeVote.voteId,
        type: 'host_disconnect',
        options: this.activeVote.options,
        timeout: VOTE_TIMEOUT,
      },
      ts: Date.now()
    }))

    // 投票超时
    setTimeout(() => {
      if (this.activeVote?.voteId === this.activeVote?.voteId) {
        this.resolveVote()
      }
    }, VOTE_TIMEOUT)
  }

  resolveVote() {
    if (!this.activeVote) return

    const counts = {}
    for (const option of this.activeVote.options) {
      counts[option] = 0
    }
    for (const vote of Object.values(this.activeVote.votes)) {
      if (vote && counts[vote] != null) counts[vote]++
    }

    // 找出最高票数
    let maxCount = 0
    let winners = []
    for (const [option, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count
        winners = [option]
      } else if (count === maxCount) {
        winners.push(option)
      }
    }

    // 平票随机选
    const winner = winners[Math.floor(Math.random() * winners.length)]

    // 如果选举新房主，随机选一个在线玩家
    let newHostId = null
    let newHostName = null
    if (winner === 'new_host') {
      const onlineSessions = [...this.sessions.values()]
      if (onlineSessions.length > 0) {
        const chosen = onlineSessions[Math.floor(Math.random() * onlineSessions.length)]
        newHostId = chosen.playerId
        newHostName = chosen.playerName
        const config = this.getConfig()
        if (config) {
          config.hostId = newHostId
          config.hostName = newHostName
          this.saveConfig(config)
        }
      }
    }

    this.broadcast(JSON.stringify({
      type: 'vote_result',
      data: { winner, counts, newHostId, newHostName },
      ts: Date.now()
    }))

    this.activeVote = null
  }

  // ── Phase 3+4: 世界书校验 ──

  startWorldbookCheckTimer() {
    if (this.wbCheckTimer) return
    // 每 120 秒触发一次校验
    this.wbCheckTimer = setInterval(() => {
      this.wbCheckCount++
      if (this.wbCheckCount % 2 === 1) {
        // 奇数次：全量 hash 校验
        this.requestWorldbookVerification()
      } else {
        // 偶数次：随机抽查
        this.requestSpotCheck()
      }
    }, 120000)
  }

  stopWorldbookCheckTimer() {
    if (this.wbCheckTimer) {
      clearInterval(this.wbCheckTimer)
      this.wbCheckTimer = null
    }
  }

  /** Phase 3: 全量 hash 校验 */
  requestWorldbookVerification() {
    const wbHashRow = [...this.ctx.storage.sql.exec(
      `SELECT hash FROM worldbook_hash WHERE key = 'host'`
    )][0]
    if (!wbHashRow?.hash) return

    const nonce = crypto.randomUUID()
    this.wbCheckNonces.set(nonce, { createdAt: Date.now(), type: 'full', hostHash: wbHashRow.hash })

    // 30 秒后清理过期 nonce
    setTimeout(() => this.wbCheckNonces.delete(nonce), 30000)

    this.broadcast(JSON.stringify({
      type: 'worldbook_verify_request',
      data: { nonce },
      ts: Date.now()
    }))
  }

  /** Phase 3: 处理客户端世界书校验响应 */
  handleWorldbookVerifyResponse(ws, session, data) {
    if (!data?.nonce || !data?.proof) return
    const entry = this.wbCheckNonces.get(data.nonce)
    if (!entry || entry.type !== 'full') return
    if (Date.now() - entry.createdAt > 30000) return

    // 服务端计算期望值: SHA-256(hostHash + ':' + nonce)
    this.verifyProof(entry.hostHash, data.nonce, data.proof).then(valid => {
      if (!valid) {
        this.handleWorldbookMismatch(session)
      }
    })
  }

  /** Phase 4: 随机抽查 */
  requestSpotCheck() {
    const rows = [...this.ctx.storage.sql.exec(
      `SELECT entry_key, content_hash FROM worldbook_spot_checks ORDER BY RANDOM() LIMIT 3`
    )]
    if (rows.length === 0) return

    const nonce = crypto.randomUUID()
    const keys = rows.map(r => r.entry_key)
    const hashMap = {}
    for (const r of rows) hashMap[r.entry_key] = r.content_hash

    this.wbCheckNonces.set(nonce, { createdAt: Date.now(), type: 'spot', hashMap })
    setTimeout(() => this.wbCheckNonces.delete(nonce), 30000)

    this.broadcast(JSON.stringify({
      type: 'worldbook_spot_check',
      data: { nonce, keys },
      ts: Date.now()
    }))
  }

  /** Phase 4: 房主上传抽查样本 */
  handleWorldbookSpotSamples(ws, session, data) {
    const config = this.getConfig()
    if (!config || session.playerId !== config.hostId) return
    if (!Array.isArray(data?.samples)) return

    // 创建抽查表（如不存在）
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS worldbook_spot_checks (
        entry_key TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL
      )
    `)

    // 清空旧数据并写入新样本
    this.ctx.storage.sql.exec(`DELETE FROM worldbook_spot_checks`)
    for (const s of data.samples) {
      if (s.key && s.hash) {
        this.ctx.storage.sql.exec(
          `INSERT OR REPLACE INTO worldbook_spot_checks (entry_key, content_hash) VALUES (?, ?)`,
          s.key, s.hash
        )
      }
    }
  }

  /** Phase 4: 处理抽查响应 */
  handleWorldbookSpotCheckResponse(ws, session, data) {
    if (!data?.nonce || !data?.proofs) return
    const entry = this.wbCheckNonces.get(data.nonce)
    if (!entry || entry.type !== 'spot') return
    if (Date.now() - entry.createdAt > 30000) return

    // 逐条验证
    let mismatchCount = 0
    const checks = Object.entries(data.proofs)
    Promise.all(checks.map(async ([key, proof]) => {
      const expectedHash = entry.hashMap[key]
      if (!expectedHash) return
      const valid = await this.verifyProof(expectedHash, data.nonce, proof)
      if (!valid) mismatchCount++
    })).then(() => {
      if (mismatchCount > 0) {
        this.handleWorldbookMismatch(session)
      }
    })
  }

  /** 计算并验证 proof: SHA-256(hash + ':' + nonce) */
  async verifyProof(expectedHash, nonce, clientProof) {
    const encoder = new TextEncoder()
    const raw = encoder.encode(`${expectedHash}:${nonce}`)
    const digest = await crypto.subtle.digest('SHA-256', raw)
    const arr = new Uint8Array(digest)
    let hex = ''
    for (const b of arr) hex += b.toString(16).padStart(2, '0')
    return hex === clientProof
  }

  /** 世界书不匹配时的处理 */
  handleWorldbookMismatch(session) {
    const config = this.getConfig()

    // Phase 6: 降级信任等级
    const TRUST_ORDER = ['anonymous', 'logged_in', 'member', 'verified']
    const currentIdx = TRUST_ORDER.indexOf(session.trustLevel || 'anonymous')
    if (currentIdx > 0) {
      session.trustLevel = TRUST_ORDER[currentIdx - 1]
      // 更新序列化附件
      const playerWs = this.findPlayerWs(session.playerId)
      if (playerWs) playerWs.serializeAttachment(session)
      // 广播信任等级变更
      this.broadcast(JSON.stringify({
        type: 'trust_level_change',
        data: { playerId: session.playerId, trustLevel: session.trustLevel, reason: 'worldbook_mismatch' },
        ts: Date.now()
      }))
    }

    // 通知该玩家
    const playerWs = this.findPlayerWs(session.playerId)
    if (playerWs) {
      playerWs.send(JSON.stringify({
        type: 'worldbook_mismatch_warning',
        data: { message: '你的世界书与房间不一致，请重新同步' },
        ts: Date.now()
      }))
    }
    // 通知房主
    if (config?.hostId && config.hostId !== session.playerId) {
      const hostWs = this.findPlayerWs(config.hostId)
      if (hostWs) {
        hostWs.send(JSON.stringify({
          type: 'worldbook_mismatch_alert',
          data: { playerId: session.playerId, playerName: session.playerName },
          ts: Date.now()
        }))
      }
    }
  }

  // ── 辅助函数 ──

  broadcast(message, exclude = null) {
    for (const [ws] of this.sessions) {
      if (ws !== exclude) {
        try { ws.send(message) } catch {}
      }
    }
  }

  sendToPlayer(playerId, message) {
    for (const [ws, session] of this.sessions) {
      if (session.playerId === playerId) {
        try { ws.send(message) } catch {}
        return
      }
    }
  }

  findPlayerWs(playerId) {
    for (const [ws, session] of this.sessions) {
      if (session.playerId === playerId) return ws
    }
    return null
  }

  findPlayerSession(playerId) {
    for (const [, session] of this.sessions) {
      if (session.playerId === playerId) return session
    }
    return null
  }

  findConversationGroupByPlayer(playerId) {
    for (const [, group] of this.conversationGroups) {
      if (group.memberIds.includes(playerId)) return group
    }
    return null
  }

  broadcastPlayersAtLocation(locationId) {
    const playersHere = [...this.sessions.values()]
      .filter(s => s.location === locationId)
      .map(s => ({ playerId: s.playerId, playerName: s.playerName }))

    for (const [ws, session] of this.sessions) {
      if (session.location === locationId) {
        ws.send(JSON.stringify({
          type: 'players_at_location',
          data: { locationId, players: playersHere },
          ts: Date.now()
        }))
      }
    }
  }

  groupNpcChatSnippets(rows) {
    const result = {}
    for (const row of rows) {
      if (!result[row.npc_name]) result[row.npc_name] = []
      result[row.npc_name].push({
        playerName: row.player_name,
        snippet: row.snippet,
        gameTime: row.game_time || '',
        createdAt: row.created_at,
      })
    }
    // 每个 NPC 最多保留最近 30 条
    for (const name of Object.keys(result)) {
      if (result[name].length > 30) {
        result[name] = result[name].slice(-30)
      }
    }
    return result
  }

  groupNpcMemories(rows) {
    const result = {}
    for (const row of rows) {
      if (!result[row.npc_name]) result[row.npc_name] = []
      result[row.npc_name].push({
        time: row.time_str,
        content: row.content,
        witness: row.witness ? JSON.parse(row.witness) : [],
        floor: row.floor,
      })
    }
    return result
  }

  async destroyRoom() {
    console.log('[SchoolRoom] Room empty, destroying...')
    // 清理计时器
    if (this.hostDisconnectTimer) {
      clearTimeout(this.hostDisconnectTimer)
      this.hostDisconnectTimer = null
    }
    if (this.wbCheckTimer) {
      this.stopWorldbookCheckTimer()
    }

    // 从公共房间索引中移除（先设为0人，再删除，双保险）
    try {
      const config = this.getConfig()
      if (config?.roomId) {
        const indexStub = this.env.ROOM_INDEX.get(this.env.ROOM_INDEX.idFromName('global'))
        await indexStub.updatePlayerCount(config.roomId, 0)
        await indexStub.removeRoom(config.roomId)
      }
    } catch (e) {
      console.error('[SchoolRoom] Failed to remove room from index:', e)
    }

    // 清空 DO 内所有 SQLite 数据
    try {
      this.ctx.storage.sql.exec(`DELETE FROM room_info`)
      this.ctx.storage.sql.exec(`DELETE FROM players`)
      this.ctx.storage.sql.exec(`DELETE FROM chat_messages`)
      this.ctx.storage.sql.exec(`DELETE FROM npc_memories`)
    } catch {}

    // 清空内存状态
    this.roomInfo = null
    this.conversationGroups.clear()
    this.turnState.clear()
    this.activeVote = null
    this.wbCheckNonces.clear()

    // 删除 DO 持久化存储（使 DO 实例可被回收）
    await this.ctx.storage.deleteAll()
  }

  async updateRoomIndex() {
    // 更新 RoomIndex 中的在线人数
    try {
      const config = this.getConfig()
      if (config?.settings?.isPublic) {
        const indexStub = this.env.ROOM_INDEX.get(this.env.ROOM_INDEX.idFromName('global'))
        await indexStub.updatePlayerCount(config.roomId, this.sessions.size)
      }
    } catch {}
  }
}
