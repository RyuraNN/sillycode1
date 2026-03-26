/**
 * 论坛世界书管理工具
 * 用于管理天华通APP中的论坛帖子数据与世界书同步
 */

import { useGameStore } from '../stores/gameStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { getCurrentBookName } from './worldbookHelper'
import { sendWorldbookEntrySync } from './multiplayerWs'

// 世界书条目名前缀
const FORUM_WORLDBOOK_PREFIX = '[Forum:'

/**
 * 获取论坛世界书的完整名称
 * @param {string} runId 当前运行ID
 * @returns {string} 世界书条目名称
 */
export function getForumWorldbookName(runId) {
  return `${FORUM_WORLDBOOK_PREFIX}${runId}] 天华通论坛`
}

/**
 * 默认论坛帖子数据
 * 在新游戏开始时初始化
 */
export const DEFAULT_FORUM_POSTS = [
  {
    id: 'post_001',
    board: '校园杂谈',
    title: '【寻物启事】有人看到我的学生证了吗？',
    author: '由比滨结衣',
    isPinned: false,
    content: '呜哇...今天下午好像把学生证弄丢了，找了一圈都没找到...有没有好心人看到一个挂着小狗挂件的学生证？如果找到了请联系2年D班的由比滨结衣，万分感谢！',
    replies: [],
    timestamp: Date.now() - 86400000 * 3, // 3天前
    floor: 0,
    likes: []
  },
  {
    id: 'post_002',
    board: '学习交流',
    title: '【求助】下周的数学小测范围有人知道吗？',
    author: '加藤惠',
    isPinned: false,
    content: '请问有谁知道下周平冢老师的数学小测大概会考哪些内容吗？感觉范围好广，有点不知道从哪里开始复习...',
    replies: [
      { author: '雪乃下雪乃', content: '范围是教科书第三章的全部内容，重点在函数部分。自己预习。' }
    ],
    timestamp: Date.now() - 86400000 * 2, // 2天前
    floor: 0,
    likes: []
  },
  {
    id: 'post_003',
    board: '都市传说',
    title: '【讨论】关于旧校舍七大不可思议事件，有人了解吗？',
    author: '凉宫春日',
    isPinned: true,
    content: '我对我们学校的七大不可思议传说非常感兴趣！特别是"打不开的音乐教室"和"天台的徘徊者"！有没有人知道更详细的情报？或者有谁愿意和我一起去探险的？SOS团随时欢迎新团员！',
    replies: [
      { author: '折木奉太郎', content: '节能主义者建议不要去探究这种麻烦事。' },
      { author: '冈崎朋也', content: '听起来很有趣的样子，不过旧校舍晚上真的会锁门吗？' }
    ],
    timestamp: Date.now() - 86400000 * 5, // 5天前
    floor: 0,
    likes: ['阿虚']
  },
  {
    id: 'post_004',
    board: '校园杂谈',
    title: '轻音部，今天也在绝赞喝茶中！',
    author: '田井中律',
    isPinned: false,
    content: '今天小紬又带了超——好吃的蛋糕来活动室！感觉我们社团的活动经费是不是都用来买点心了啊（笑）。顺便一提，下个月的文化祭我们轻音部会参加哦！敬请期待！【图片】一张摆满了精致点心和红茶的桌子照片。',
    replies: [
      { author: '平泽唯', content: '蛋糕超好吃！下次也想吃！(≧▽≦)' }
    ],
    timestamp: Date.now() - 86400000 * 1, // 1天前
    floor: 0,
    likes: ['的山的']
  },
  {
    id: 'post_005',
    board: '失物招领',
    title: '在图书馆捡到一个笔记本',
    author: '长门有希',
    isPinned: false,
    content: '在三楼阅览室角落捡到一个黑色的笔记本，没有写名字。失主请到奉仕部活动室认领。',
    replies: [],
    timestamp: Date.now() - 86400000 * 4, // 4天前
    floor: 0,
    likes: []
  }
]

/**
 * 论坛版块列表
 */
export const FORUM_BOARDS = [
  { id: 'all', name: '全部', icon: '📋' },
  { id: '校园杂谈', name: '校园杂谈', icon: '💬' },
  { id: '学习交流', name: '学习交流', icon: '📚' },
  { id: '都市传说', name: '都市传说', icon: '👻' },
  { id: '失物招领', name: '失物招领', icon: '🔍' },
  { id: '社团招新', name: '社团招新', icon: '🎭' },
  { id: '二手交易', name: '二手交易', icon: '💰' }
]

/**
 * 将帖子格式化为世界书内容
 * @param {Array} posts 帖子列表
 * @param {number} limit 限制数量
 * @returns {string} 格式化后的内容
 */
export function formatPostsForWorldbook(posts, limit = 20) {
  // 排序：置顶在前，然后按时间降序
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned
    return b.timestamp - a.timestamp
  })

  // 取前N条
  const displayPosts = sortedPosts.slice(0, limit)
  const hiddenCount = sortedPosts.length - limit

  let content = '--天华通论坛帖子记录开始--\n\n'

  for (const post of displayPosts) {
    content += `ID|${post.id}\n`
    content += `版块|${post.board}\n`
    content += `标题|${post.title}\n`
    content += `作者|${post.author}\n`
    content += `置顶|${post.isPinned}\n`
    content += `内容|${post.content}\n`
    content += `回复|${JSON.stringify(post.replies)}\n\n`
  }

  if (hiddenCount > 0) {
    content += `\n------------旧帖子分割线------------\n`
    content += `(还有${hiddenCount}条旧帖子未写入世界书，仅在APP中可查看)\n`
  }

  content += '\n--天华通论坛帖子记录结束--'

  return content
}

/**
 * 保存论坛帖子到世界书
 * @param {Array} posts 帖子列表
 * @param {string} runId 运行ID
 * @param {number} limit 世界书中保存的帖子数量限制
 */
export async function saveForumToWorldbook(posts, runId, limit = 20) {
  if (typeof createOrReplaceWorldbook === 'undefined') {
    console.warn('[ForumWorldbook] createOrReplaceWorldbook not available')
    return false
  }

  const worldbookName = getForumWorldbookName(runId)
  const content = formatPostsForWorldbook(posts, limit)

  try {
    // 首先检查是否已有角色卡绑定的世界书
    const primaryWorldbook = getCurrentBookName()

    if (!primaryWorldbook) {
      console.warn('[ForumWorldbook] No primary worldbook found for current character')
      return false
    }

    // 获取现有世界书
    let worldbook = []
    try {
      worldbook = await getWorldbook(primaryWorldbook)
    } catch (e) {
      console.log('[ForumWorldbook] Creating new worldbook entries')
    }

    // 查找现有的论坛条目
    const existingIndex = worldbook.findIndex(entry => 
      entry.name && entry.name.includes(FORUM_WORLDBOOK_PREFIX) && entry.name.includes(runId)
    )

    const forumEntry = {
      name: worldbookName,
      enabled: true,
      strategy: {
        type: 'constant',
        keys: [],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global'
      },
      position: {
        type: 'before_character_definition',
        role: 'system',
        depth: 0,
        order: 5
      },
      content: content,
      probability: 100,
      recursion: {
        prevent_incoming: true,
        prevent_outgoing: true,
        delay_until: null
      },
      effect: {
        sticky: null,
        cooldown: null,
        delay: null
      }
    }

    if (existingIndex >= 0) {
      // 更新现有条目
      worldbook[existingIndex] = { ...worldbook[existingIndex], ...forumEntry }
    } else {
      // 添加新条目
      worldbook.push(forumEntry)
    }

    await replaceWorldbook(primaryWorldbook, worldbook)
    console.log('[ForumWorldbook] Forum worldbook saved successfully')

    // 联机广播论坛条目变更
    try {
      const mpStore = useMultiplayerStore()
      if (mpStore.isMultiplayerActive) {
        sendWorldbookEntrySync({
          action: 'upsert',
          bookName: primaryWorldbook,
          entry: JSON.parse(JSON.stringify(forumEntry))
        })
      }
    } catch (_) { /* 静默忽略 */ }

    return true
  } catch (e) {
    console.error('[ForumWorldbook] Failed to save forum worldbook:', e)
    return false
  }
}

/**
 * 从世界书加载论坛帖子（用于恢复存档）
 * @param {string} runId 运行ID
 * @returns {Array|null} 帖子列表或null
 */
export async function loadForumFromWorldbook(runId) {
  if (typeof getWorldbook === 'undefined') {
    console.warn('[ForumWorldbook] Worldbook API not available')
    return null
  }

  try {
    const primaryWorldbook = getCurrentBookName()

    if (!primaryWorldbook) return null

    const worldbook = await getWorldbook(primaryWorldbook)
    const forumEntry = worldbook.find(entry => 
      entry.name && entry.name.includes(FORUM_WORLDBOOK_PREFIX) && entry.name.includes(runId)
    )

    if (!forumEntry) return null

    // 解析内容还原帖子
    return parseWorldbookContent(forumEntry.content)
  } catch (e) {
    console.error('[ForumWorldbook] Failed to load forum from worldbook:', e)
    return null
  }
}

/**
 * 解析世界书内容为帖子列表
 * @param {string} content 世界书内容
 * @returns {Array} 帖子列表
 */
function parseWorldbookContent(content) {
  const posts = []
  const lines = content.split('\n')
  let currentPost = null

  for (const line of lines) {
    if (line.startsWith('ID|')) {
      if (currentPost) posts.push(currentPost)
      currentPost = { id: line.substring(3), replies: [], likes: [] }
    } else if (currentPost) {
      if (line.startsWith('版块|')) currentPost.board = line.substring(3)
      else if (line.startsWith('标题|')) currentPost.title = line.substring(3)
      else if (line.startsWith('作者|')) currentPost.author = line.substring(3)
      else if (line.startsWith('置顶|')) currentPost.isPinned = line.substring(3) === 'true'
      else if (line.startsWith('内容|')) currentPost.content = line.substring(3)
      else if (line.startsWith('回复|')) {
        try {
          currentPost.replies = JSON.parse(line.substring(3))
        } catch (e) {
          currentPost.replies = []
        }
      }
    }
  }
  
  if (currentPost) posts.push(currentPost)
  return posts
}

/**
 * 删除论坛世界书条目
 * @param {string} runId 运行ID
 */
export async function deleteForumWorldbook(runId) {
  if (typeof updateWorldbookWith === 'undefined') {
    return false
  }

  try {
    const primaryWorldbook = getCurrentBookName()

    if (!primaryWorldbook) return false

    const worldbook = await getWorldbook(primaryWorldbook)
    const filtered = worldbook.filter(entry => 
      !(entry.name && entry.name.includes(FORUM_WORLDBOOK_PREFIX) && entry.name.includes(runId))
    )

    if (filtered.length !== worldbook.length) {
      await replaceWorldbook(primaryWorldbook, filtered)
      console.log('[ForumWorldbook] Forum worldbook entry deleted')
    }
    return true
  } catch (e) {
    console.error('[ForumWorldbook] Failed to delete forum worldbook:', e)
    return false
  }
}

/**
 * 生成新帖子ID
 * @param {Array} existingPosts 现有帖子列表
 * @returns {string} 新ID
 */
export function generatePostId(existingPosts) {
  const maxId = existingPosts.reduce((max, post) => {
    const match = post.id.match(/post_(\d+)/)
    if (match) {
      const num = parseInt(match[1])
      return num > max ? num : max
    }
    return max
  }, 0)
  return `post_${String(maxId + 1).padStart(3, '0')}`
}

/**
 * 切换存档槽位（开启当前 runId 的论坛条目，关闭其他的）
 * @param {string} currentRunId 当前运行ID
 */
export async function switchForumSlot(currentRunId) {
  if (typeof updateWorldbookWith === 'undefined') {
    console.warn('[ForumWorldbook] Worldbook API not available')
    return
  }

  try {
    const primaryWorldbook = getCurrentBookName()

    if (!primaryWorldbook) {
      console.warn('[ForumWorldbook] No primary worldbook found')
      return
    }

    console.log(`[ForumWorldbook] Switching forum slot to ${currentRunId}`)

    const worldbook = await getWorldbook(primaryWorldbook)
    
    // 更新所有论坛条目
    const updatedEntries = worldbook.map(entry => {
      // 检查是否是论坛条目 [Forum:runId] ...
      if (entry.name && entry.name.startsWith(FORUM_WORLDBOOK_PREFIX)) {
        let entryRunId = null
        
        // 解析 runId: [Forum:runId]...
        const content = entry.name.substring(FORUM_WORLDBOOK_PREFIX.length)
        const bracketIndex = content.indexOf(']')
        
        if (bracketIndex > -1) {
          entryRunId = content.substring(0, bracketIndex)
        }

        if (entryRunId) {
          const isCurrent = entryRunId === currentRunId
          
          if (isCurrent && !entry.enabled) {
            console.log(`[ForumWorldbook] Enabling entry: ${entry.name}`)
            return { ...entry, enabled: true }
          } else if (!isCurrent && entry.enabled) {
            console.log(`[ForumWorldbook] Disabling entry: ${entry.name}`)
            return { ...entry, enabled: false }
          }
        }
      }
      return entry
    })

    await replaceWorldbook(primaryWorldbook, updatedEntries)
    console.log('[ForumWorldbook] Forum slot switch complete')
  } catch (e) {
    console.error('[ForumWorldbook] Error switching forum slot:', e)
  }
}
