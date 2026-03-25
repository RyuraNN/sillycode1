/**
 * jwtUtils.js - JWT sign/verify using Web Crypto API
 * HMAC-SHA256 签名，无需第三方库（Cloudflare Workers 原生支持）
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Base64url 编码
 */
function base64urlEncode(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64url 解码
 */
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 获取 HMAC-SHA256 签名密钥
 */
async function getSigningKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/**
 * 签名 JWT
 * @param {Object} payload JWT payload
 * @param {string} secret 签名密钥
 * @param {number} expiresInSeconds 有效期（秒），默认 24h
 * @returns {Promise<string>} JWT token
 */
export async function signJWT(payload, secret, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(fullPayload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await getSigningKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))

  return `${signingInput}.${base64urlEncode(signature)}`
}

/**
 * 验证并解码 JWT
 * @param {string} token JWT token
 * @param {string} secret 签名密钥
 * @returns {Promise<{valid: boolean, payload?: Object, error?: string}>}
 */
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { valid: false, error: 'Invalid token format' }

    const [headerB64, payloadB64, signatureB64] = parts
    const signingInput = `${headerB64}.${payloadB64}`

    const key = await getSigningKey(secret)
    const signature = base64urlDecode(signatureB64)
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signingInput))

    if (!valid) return { valid: false, error: 'Invalid signature' }

    const payload = JSON.parse(decoder.decode(base64urlDecode(payloadB64)))

    // 检查过期
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' }
    }

    return { valid: true, payload }
  } catch (e) {
    return { valid: false, error: e.message || 'Token verification failed' }
  }
}
