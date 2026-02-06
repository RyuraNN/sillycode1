/**
 * 论坛相关 Actions
 */

import type { ForumCommand } from '../gameStoreTypes'

export const forumActions = {
  /**
   * 添加论坛指令到待处理队列
   */
  addForumCommand(this: any, command: ForumCommand) {
    if (command.type === 'post' && command.turnsRemaining === undefined) {
      command.turnsRemaining = 3
    }
    command.id = Date.now()
    this.player.forum.pendingCommands.push(command)
  },

  /**
   * 移除论坛指令
   */
  removeForumCommand(this: any, commandId: number | string) {
    const index = this.player.forum.pendingCommands.findIndex((c: ForumCommand) => c.id === commandId)
    if (index > -1) {
      this.player.forum.pendingCommands.splice(index, 1)
    }
  },

  /**
   * 取消点赞
   */
  unlikeForumPost(this: any, postId: string) {
    const post = this.player.forum.posts.find((p: any) => p.id === postId)
    if (post && post.likes) {
      const index = post.likes.indexOf(this.player.name)
      if (index > -1) {
        post.likes.splice(index, 1)
      }
    }
  },

  /**
   * 处理论坛回合结束（递减提醒计数）
   */
  handleForumTurnEnd(this: any) {
    for (const cmd of this.player.forum.pendingCommands) {
      if (cmd.turnsRemaining !== undefined && cmd.turnsRemaining > 0) {
        cmd.turnsRemaining--
      }
    }
  }
}
