/**
 * School Multiplayer - Cloudflare Worker 入口
 * 路由层：HTTP/WS 路由、房间分发
 */

export { SchoolRoom } from './SchoolRoom.js'
export { RoomIndex } from './RoomIndex.js'
import { signJWT, verifyJWT } from './jwtUtils.js'

// RoomIndex DO 用于 OAuth token 暂存（全局单例，100% 可靠）
function getRoomIndex(env) {
  return env.ROOM_INDEX.get(env.ROOM_INDEX.idFromName('global'))
}

function json(data, status = 200, origin = null, env = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) }
  })
}

function corsHeaders(origin, env) {
  const allowed = getAllowedOrigin(origin, env)
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

/** 检查 Origin 是否在白名单中 */
function getAllowedOrigin(origin, env) {
  if (!origin || origin === 'null') return '*' // iframe/file:// 发送 Origin: null
  // 开发环境放行 localhost
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin
  const allowed = env?.MP_ALLOWED_ORIGIN
  if (allowed && origin === allowed) return origin
  return allowed || '*'
}

function isOriginAllowed(origin, env) {
  if (!origin || origin === 'null') return true // 无 Origin 或 null（iframe/file://）放行
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true
  const allowed = env?.MP_ALLOWED_ORIGIN
  if (!allowed) return true // 未配置白名单时放行
  return origin === allowed
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin')

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
    }

    // Origin 白名单检查
    if (!isOriginAllowed(origin, env)) {
      return json({ error: 'Forbidden origin' }, 403, origin, env)
    }

    try {
      // ── Discord OAuth 路由 ──
      if (path === '/auth/discord' && request.method === 'GET') {
        const workerBase = `${url.protocol}//${url.host}`
        const nonce = url.searchParams.get('nonce') || ''
        return handleAuthStart(env, origin, workerBase, nonce)
      }
      if (path === '/auth/discord/callback' && request.method === 'GET') {
        const workerBase = `${url.protocol}//${url.host}`
        return await handleAuthCallback(url, env, workerBase)
      }
      if (path === '/auth/poll' && request.method === 'GET') {
        return await handleAuthPoll(url, origin, env)
      }
      if (path === '/auth/verify' && request.method === 'GET') {
        return handleAuthVerify(request, env, origin)
      }

      // ── WebSocket 连接 ──
      if (path.startsWith('/ws/room/')) {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return json({ error: 'Expected WebSocket upgrade' }, 426)
        }
        const roomId = path.split('/ws/room/')[1]?.split('?')[0]
        if (!roomId) return json({ error: 'Missing room ID' }, 400)

        const stub = env.SCHOOL_ROOM.get(env.SCHOOL_ROOM.idFromName(roomId))
        return stub.fetch(request)
      }

      // ── REST API: 创建房间 ──
      if (path === '/api/rooms' && request.method === 'POST') {
        const body = await request.json()
        const roomId = generateRoomId()
        const stub = env.SCHOOL_ROOM.get(env.SCHOOL_ROOM.idFromName(roomId))
        await stub.initRoom(roomId, body)

        // 注册到公开房间索引
        if (body.settings?.isPublic !== false) {
          const indexStub = env.ROOM_INDEX.get(env.ROOM_INDEX.idFromName('global'))
          await indexStub.registerRoom(roomId, body.roomName || '未命名房间', body.hostName || '???', body.settings?.gameMode || 'normal', body.settings?.maxPlayers || 10, body.hostFeatures || null)
        }

        return json({ roomId, roomName: body.roomName }, 200, origin, env)
      }

      // ── REST API: 房间列表 ──
      if (path === '/api/rooms' && request.method === 'GET') {
        const indexStub = env.ROOM_INDEX.get(env.ROOM_INDEX.idFromName('global'))
        const rooms = await indexStub.listPublicRooms()
        return json({ rooms }, 200, origin, env)
      }

      // ── REST API: 房间详情 ──
      if (path.startsWith('/api/rooms/') && request.method === 'GET') {
        const roomId = path.split('/api/rooms/')[1]
        if (!roomId) return json({ error: 'Missing room ID' }, 400)
        const stub = env.SCHOOL_ROOM.get(env.SCHOOL_ROOM.idFromName(roomId))
        const info = await stub.getRoomInfo()
        if (!info) return json({ error: 'Room not found' }, 404, origin, env)
        return json(info, 200, origin, env)
      }

      return json({ error: 'Not found' }, 404, origin, env)
    } catch (err) {
      console.error('[Worker] Error:', err)
      return json({ error: err.message || 'Internal error' }, 500, origin, env)
    }
  }
}

// ── Discord OAuth 处理函数 ──

const DISCORD_API = 'https://discord.com/api/v10'

/**
 * GET /auth/discord — 发起 OAuth 授权
 */
async function handleAuthStart(env, origin, workerBase, nonce = '') {
  // HMAC 自验证 state，格式: nonce|uuid|signature（不需要存储）
  const stateId = crypto.randomUUID()
  const payload = nonce ? `${nonce}|${stateId}` : `|${stateId}`
  const sig = await hmacSign(payload, env.JWT_SECRET)
  const state = `${payload}|${sig}`

  const redirectUri = `${workerBase}/auth/discord/callback`
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
    prompt: 'consent',
  })

  return Response.redirect(`https://discord.com/oauth2/authorize?${params}`, 302)
}

/**
 * GET /auth/discord/callback — OAuth 回调，换 token → 获取用户信息 → 签发 JWT
 */
async function handleAuthCallback(url, env, workerBase) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const frontendBase = env.MP_ALLOWED_ORIGIN

  // 用户拒绝授权
  if (error) {
    return authResultPage(null, error, null)
  }

  // HMAC 验证 state（无需存储，自验证）
  if (!state) return authResultPage(null, 'invalid_state', null)
  const parts = state.split('|')
  if (parts.length !== 3) return authResultPage(null, 'invalid_state', null)
  const [nonceFromState, stateId, sig] = parts
  const expectedSig = await hmacSign(`${nonceFromState}|${stateId}`, env.JWT_SECRET)
  if (sig !== expectedSig) return authResultPage(null, 'invalid_state', null)
  const nonce = nonceFromState || ''

  if (!code) {
    if (nonce) await getRoomIndex(env).storeAuthToken(nonce, { error: 'missing_code' })
    return authResultPage(null, 'missing_code', nonce)
  }

  try {
    // 1. 用 code 换 access_token
    const redirectUri = `${workerBase}/auth/discord/callback`
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[Auth] Token exchange failed:', err)
      return Response.redirect(`${frontendBase}/#/mp-auth?error=token_failed`, 302)
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // 2. 获取用户基本信息
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!userRes.ok) {
      return Response.redirect(`${frontendBase}/#/mp-auth?error=user_fetch_failed`, 302)
    }
    const user = await userRes.json()

    // 3. 获取指定服务器的成员信息（含 roles）
    let guildMember = false
    let verified = false
    let roles = []
    let nick = null

    const guildId = env.DISCORD_GUILD_ID
    if (guildId) {
      const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (memberRes.ok) {
        const memberData = await memberRes.json()
        guildMember = true
        roles = memberData.roles || []
        nick = memberData.nick || null
        // 检查是否有指定身份组
        const verifiedRoleId = env.DISCORD_VERIFIED_ROLE_ID
        if (verifiedRoleId && roles.includes(verifiedRoleId)) {
          verified = true
        }
      }
      // 404 = 用户不在该服务器，不报错
    }

    // 4. 签发 JWT
    const jwtPayload = {
      discordId: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      nick,
      verified,
      guildMember,
      roles,
    }
    const token = await signJWT(jwtPayload, env.JWT_SECRET, 86400) // 24h

    // 存入 DO 供前端轮询
    if (nonce) {
      await getRoomIndex(env).storeAuthToken(nonce, { token })
    }
    return authResultPage(token, null, nonce)
  } catch (e) {
    console.error('[Auth] OAuth callback error:', e)
    if (nonce) { try { await getRoomIndex(env).storeAuthToken(nonce, { error: 'internal' }) } catch {} }
    return authResultPage(null, 'internal', nonce)
  }
}

/**
 * GET /auth/poll?nonce=xxx — 前端轮询 token
 */
async function handleAuthPoll(url, origin, env) {
  const nonce = url.searchParams.get('nonce')
  if (!nonce) return json({ status: 'error', error: 'missing_nonce' }, 400, origin, env)

  const entry = await getRoomIndex(env).getAuthToken(nonce)
  if (!entry) return json({ status: 'pending' }, 200, origin, env)

  if (entry.token) {
    return json({ status: 'ok', token: entry.token }, 200, origin, env)
  }
  return json({ status: 'error', error: entry.error }, 200, origin, env)
}

/** HMAC-SHA256 签名（用于 state 自验证） */
async function hmacSign(data, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  // 转为 URL-safe base64
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 返回一个 HTML 页面，通过 postMessage 将 token/error 传回父窗口（弹窗 OAuth 流程）
 */
function authResultPage(token, error, nonce = null) {
  const data = token
    ? `{ type: 'mp-auth-callback', nonce: ${JSON.stringify(nonce)}, token: ${JSON.stringify(token)} }`
    : `{ type: 'mp-auth-callback', nonce: ${JSON.stringify(nonce)}, error: ${JSON.stringify(error || 'unknown')} }`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Discord 登录</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#2b2d31;color:#dbdee1}
.card{text-align:center;padding:32px;border-radius:12px;background:#313338}
.ok{color:#57f287}.err{color:#ed4245}</style></head><body>
<div class="card">
${token ? '<p class="ok">\u2714 \u767b\u5f55\u6210\u529f\uff0c\u6b63\u5728\u8fd4\u56de...</p>' : '<p class="err">\u2716 \u767b\u5f55\u5931\u8d25: ' + (error || '') + '</p>'}
</div>
<script>
if (window.opener) {
  window.opener.postMessage(${data}, '*');
  setTimeout(() => window.close(), 1500);
} else {
  document.querySelector('.card').innerHTML += '<p style="margin-top:12px;font-size:14px;color:#949ba4">' +
    '\u8bf7\u8fd4\u56de\u5230\u6e38\u620f\u6807\u7b7e\u9875\u7ee7\u7eed\uff0c\u5fc5\u8981\u65f6\u518d\u624b\u52a8\u5173\u95ed\u6b64\u9875\u9762</p>';
}
</script></body></html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

/**
 * GET /auth/verify — 验证 JWT 有效性
 */
async function handleAuthVerify(request, env, origin) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ valid: false, error: 'Missing token' }, 401, origin, env)
  }

  const token = authHeader.slice(7)
  const result = await verifyJWT(token, env.JWT_SECRET)

  if (!result.valid) {
    return json({ valid: false, error: result.error }, 401, origin, env)
  }

  const p = result.payload
  return json({
    valid: true,
    discordId: p.discordId,
    username: p.username,
    globalName: p.globalName,
    nick: p.nick,
    verified: p.verified,
    guildMember: p.guildMember,
  }, 200, origin, env)
}
