/**
 * RoomIndex Durable Object
 * 全局单例，维护公开房间列表
 */
import { DurableObject } from 'cloudflare:workers'

export class RoomIndex extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS public_rooms (
        room_id TEXT PRIMARY KEY,
        room_name TEXT,
        host_name TEXT,
        game_mode TEXT DEFAULT 'normal',
        player_count INTEGER DEFAULT 0,
        max_players INTEGER DEFAULT 10,
        game_time TEXT,
        week_number INTEGER DEFAULT 1,
        host_features TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `)
    // 迁移：为已有表添加 host_features 列
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE public_rooms ADD COLUMN host_features TEXT`)
    } catch {}

  }

  async registerRoom(roomId, roomName, hostName, gameMode, maxPlayers, hostFeatures) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO public_rooms (room_id, room_name, host_name, game_mode, player_count, max_players, host_features, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      roomId, roomName, hostName, gameMode || 'normal', maxPlayers || 10,
      hostFeatures ? JSON.stringify(hostFeatures) : null,
      Date.now(), Date.now()
    )
  }

  async updatePlayerCount(roomId, count) {
    this.ctx.storage.sql.exec(
      `UPDATE public_rooms SET player_count = ?, updated_at = ? WHERE room_id = ?`,
      count, Date.now(), roomId
    )
    // 如果人数为 0，设置 alarm 延迟清理
    if (count === 0) {
      this.scheduleAlarm(Date.now() + 300_000)
    }
  }

  async updateRoomGameState(roomId, gameTime, weekNumber) {
    this.ctx.storage.sql.exec(
      `UPDATE public_rooms SET game_time = ?, week_number = ?, updated_at = ? WHERE room_id = ?`,
      gameTime ? JSON.stringify(gameTime) : null, weekNumber || 1, Date.now(), roomId
    )
  }

  async removeRoom(roomId) {
    this.ctx.storage.sql.exec(`DELETE FROM public_rooms WHERE room_id = ?`, roomId)
  }

  /** 暂存 OAuth token（供前端轮询，5 分钟 TTL） */
  async storeAuthToken(nonce, data) {
    await this.ctx.storage.put(`auth:${nonce}`, { ...data, _expiresAt: Date.now() + 300_000 })
    // 确保 alarm 在 5 分钟后触发（DO 只能有一个 alarm，取最近的时间）
    this.scheduleAlarm(Date.now() + 300_000)
  }

  /** 获取并消费 OAuth token（一次性） */
  async getAuthToken(nonce) {
    const key = `auth:${nonce}`
    const data = await this.ctx.storage.get(key)
    if (data) await this.ctx.storage.delete(key)
    return data || null
  }

  /** 确保 alarm 被设置（不覆盖更早的 alarm） */
  async scheduleAlarm(desiredTime) {
    try {
      const current = await this.ctx.storage.getAlarm()
      if (!current || desiredTime < current) {
        await this.ctx.storage.setAlarm(desiredTime)
      }
    } catch {
      this.ctx.storage.setAlarm(desiredTime).catch(() => {})
    }
  }

  async alarm() {
    const now = Date.now()

    // 1. 清理空房间（player_count=0 且超过 5 分钟未更新）
    this.ctx.storage.sql.exec(
      `DELETE FROM public_rooms WHERE player_count = 0 AND updated_at < ?`, now - 300_000
    )

    // 2. 清理过期的 OAuth token
    const allKV = await this.ctx.storage.list({ prefix: 'auth:' })
    for (const [key, value] of allKV) {
      if (value?._expiresAt && value._expiresAt < now) {
        await this.ctx.storage.delete(key)
      }
    }
  }

  async listPublicRooms() {
    // 清理超过 24 小时未更新的房间
    const cutoff = Date.now() - 86400000
    this.ctx.storage.sql.exec(`DELETE FROM public_rooms WHERE updated_at < ?`, cutoff)
    // 兜底：清理超过 5 分钟的空房间
    const emptyCutoff = Date.now() - 300_000
    this.ctx.storage.sql.exec(`DELETE FROM public_rooms WHERE player_count = 0 AND updated_at < ?`, emptyCutoff)

    return [...this.ctx.storage.sql.exec(
      `SELECT room_id, room_name, host_name, game_mode, player_count, max_players, game_time, week_number, host_features, created_at, updated_at
       FROM public_rooms ORDER BY updated_at DESC LIMIT 50`
    )]
  }
}
