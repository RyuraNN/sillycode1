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
    // 如果人数为 0，等一段时间后清理
    if (count === 0) {
      this.ctx.storage.sql.exec(
        `DELETE FROM public_rooms WHERE room_id = ? AND player_count = 0 AND updated_at < ?`,
        roomId, Date.now() - 300000 // 5分钟无人则删除
      )
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
    await this.ctx.storage.put(`auth:${nonce}`, data)
    // 5 分钟后自动删除
    this.ctx.storage.setAlarm(Date.now() + 300000).catch(() => {})
  }

  /** 获取并消费 OAuth token（一次性） */
  async getAuthToken(nonce) {
    const key = `auth:${nonce}`
    const data = await this.ctx.storage.get(key)
    if (data) await this.ctx.storage.delete(key)
    return data || null
  }

  async listPublicRooms() {
    // 清理超过 24 小时未更新的房间
    const cutoff = Date.now() - 86400000
    this.ctx.storage.sql.exec(`DELETE FROM public_rooms WHERE updated_at < ?`, cutoff)

    return [...this.ctx.storage.sql.exec(
      `SELECT room_id, room_name, host_name, game_mode, player_count, max_players, game_time, week_number, host_features, created_at, updated_at
       FROM public_rooms ORDER BY updated_at DESC LIMIT 50`
    )]
  }
}
