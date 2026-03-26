/**
 * multiplayerAuth.js - Discord OAuth 登录管理
 * 负责 token 存取、解码、过期检查
 */

import { getApiBaseUrl } from './multiplayerWs'

const AUTH_TOKEN_KEY = 'mp_auth_token'

/**
 * 获取存储的 JWT token
 * @returns {string|null}
 */
export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

/**
 * 解码 JWT payload（不验证签名，仅客户端使用）
 * @param {string} token
 * @returns {Object|null}
 */
function decodeJWTPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(payload)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

/**
 * 检查是否已登录（token 存在且未过期）
 * @returns {boolean}
 */
export function isAuthenticated() {
  const token = getAuthToken()
  if (!token) return false
  const payload = decodeJWTPayload(token)
  if (!payload?.exp) return false
  return payload.exp > Math.floor(Date.now() / 1000)
}

/**
 * 获取登录用户信息
 * @returns {{ discordId: string, username: string, globalName: string, nick: string|null, verified: boolean, guildMember: boolean, roles: string[] }|null}
 */
export function getAuthInfo() {
  const token = getAuthToken()
  if (!token) return null
  const payload = decodeJWTPayload(token)
  if (!payload) return null
  // 检查过期
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
  return {
    discordId: payload.discordId,
    username: payload.username,
    globalName: payload.globalName || payload.username,
    nick: payload.nick || null,
    verified: !!payload.verified,
    guildMember: !!payload.guildMember,
    roles: payload.roles || [],
  }
}

/**
 * 发起 Discord 登录（弹窗 + 轮询模式，兼容 iframe / file:// 协议）
 * @returns {Promise<string>} JWT token
 */
export function startDiscordLogin() {
  return new Promise((resolve, reject) => {
    const apiBase = getApiBaseUrl()
    const nonce = crypto.randomUUID()

    const w = 500, h = 700
    const left = (screen.width - w) / 2
    const top = (screen.height - h) / 2
    const popup = window.open(
      `${apiBase}/auth/discord?nonce=${nonce}`,
      'discord_oauth',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,status=no`
    )

    if (!popup) {
      reject(new Error('弹窗被浏览器拦截，请允许弹窗后重试'))
      return
    }

    console.log('[Auth] Popup opened, nonce:', nonce, 'polling:', `${apiBase}/auth/poll?nonce=${nonce}`)
    let settled = false

    // 轮询后端 /auth/poll 获取 token
    const pollInterval = setInterval(async () => {
      if (settled) return
      try {
        console.log('[Auth] Polling...')
        const res = await fetch(`${apiBase}/auth/poll?nonce=${nonce}`)
        console.log('[Auth] Poll response status:', res.status)
        const data = await res.json()
        console.log('[Auth] Poll data:', data)

        if (data.status === 'pending') return // 还没完成，继续等

        settled = true
        clearInterval(pollInterval)
        clearTimeout(timeoutId)

        if (data.status === 'ok' && data.token) {
          handleAuthCallback(data.token)
          resolve(data.token)
        } else {
          reject(new Error(data.error || 'OAuth 失败'))
        }
      } catch (err) {
        console.error('[Auth] Poll error:', err)
      }
    }, 2000)

    // 5 分钟超时
    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      clearInterval(pollInterval)
      reject(new Error('登录超时，请重试'))
    }, 300000)
  })
}

/**
 * 处理 OAuth 回调（存储 token）
 * @param {string} token JWT token
 */
export function handleAuthCallback(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

/**
 * 登出（清除 token）
 */
export function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

/**
 * 获取显示用的用户名（优先服务器昵称 > 全局名 > 用户名）
 * @returns {string|null}
 */
export function getDisplayName() {
  const info = getAuthInfo()
  if (!info) return null
  return info.nick || info.globalName || info.username
}
