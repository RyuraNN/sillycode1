<script setup>
import { ref, computed, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { FORUM_BOARDS, generatePostId, saveForumToWorldbook } from '../utils/forumWorldbook'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// 当前视图：list | detail | compose | reply
const currentView = ref('list')
const selectedBoard = ref('all')
const selectedPost = ref(null)
const isComposing = ref(false)
const isReplying = ref(false)

// 新帖子表单
const newPost = ref({
  board: '校园杂谈',
  title: '',
  content: ''
})

// 新回复内容
const replyContent = ref('')

// 获取帖子列表
const posts = computed(() => {
  return gameStore.player.forum?.posts || []
})

// 获取世界书显示数量限制
const worldbookLimit = computed(() => {
  return gameStore.settings.forumWorldbookLimit || 20
})

// 过滤后的帖子（按版块）
const filteredPosts = computed(() => {
  let result = [...posts.value]
  
  // 按版块筛选
  if (selectedBoard.value !== 'all') {
    result = result.filter(p => p.board === selectedBoard.value)
  }
  
  // 排序：置顶在前，然后按时间降序
  return result.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned - a.isPinned
    return b.timestamp - a.timestamp
  })
})

// 分离世界书内外的帖子
const worldbookPosts = computed(() => {
  return filteredPosts.value.slice(0, worldbookLimit.value)
})

const oldPosts = computed(() => {
  return filteredPosts.value.slice(worldbookLimit.value)
})

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// 切换版块
const selectBoard = (boardId) => {
  selectedBoard.value = boardId
}

// 查看帖子详情
const viewPost = (post) => {
  selectedPost.value = post
  currentView.value = 'detail'
}

// 返回列表
const goBack = () => {
  if (currentView.value === 'detail') {
    selectedPost.value = null
    currentView.value = 'list'
  } else if (currentView.value === 'compose') {
    isComposing.value = false
    currentView.value = 'list'
  } else if (currentView.value === 'reply') {
    isReplying.value = false
    replyContent.value = ''
    currentView.value = 'detail'
  }
}

// 打开发帖页面
const openCompose = () => {
  newPost.value = {
    board: selectedBoard.value === 'all' ? '校园杂谈' : selectedBoard.value,
    title: '',
    content: ''
  }
  isComposing.value = true
  currentView.value = 'compose'
}

// 发布帖子
const submitPost = async () => {
  if (!newPost.value.title.trim() || !newPost.value.content.trim()) {
    alert('请填写标题和内容')
    return
  }
  
  const post = {
    id: generatePostId(posts.value),
    board: newPost.value.board,
    title: newPost.value.title.trim(),
    author: gameStore.player.name,
    isPinned: false,
    content: newPost.value.content.trim(),
    replies: [],
    timestamp: Date.now(),
    floor: gameStore.currentFloor,
    likes: []
  }
  
  // 1. 本地更新
  gameStore.player.forum.posts.unshift(post)
  
  // 2. 更新世界书
  await saveForumToWorldbook(
    gameStore.player.forum.posts, 
    gameStore.currentRunId, 
    gameStore.settings.forumWorldbookLimit
  )
  
    // 3. 添加到待发送指令队列 (通知AI)
    gameStore.addCommand({
      id: Date.now(),
      text: `[论坛] ${gameStore.player.name} 在 ${post.board} 版块发布了新帖子：标题《${post.title}》，内容：${post.content}`,
      type: 'other', // 或者 forum_post
      metadata: {
        type: 'forum_post',
        post: post
      }
    })
  
  // 重置表单并返回
  newPost.value = { board: '校园杂谈', title: '', content: '' }
  isComposing.value = false
  currentView.value = 'list'
}

// 打开回复页面
const openReply = () => {
  replyContent.value = ''
  isReplying.value = true
  currentView.value = 'reply'
}

// 发送回复
const submitReply = async () => {
  if (!replyContent.value.trim()) {
    alert('请输入回复内容')
    return
  }
  
  const content = replyContent.value.trim()
  const post = gameStore.player.forum.posts.find(p => p.id === selectedPost.value.id)
  
  if (post) {
    // 1. 本地更新
    if (!post.replies) post.replies = []
    post.replies.push({
      author: gameStore.player.name,
      content: content
    })
    
    // 2. 更新世界书
    await saveForumToWorldbook(
      gameStore.player.forum.posts, 
      gameStore.currentRunId, 
      gameStore.settings.forumWorldbookLimit
    )
    
    // 3. 添加到待发送指令队列 (通知AI)
    gameStore.addCommand({
      id: Date.now(),
      text: `${gameStore.player.name}，回复了帖子【${post.id}】【${post.title}】【${post.content}】：${content}。[请感兴趣的大家一起互动一下吧]`,
      type: 'other', // 或者 forum_reply
      metadata: {
        type: 'forum_reply',
        post: post,
        replyContent: content
      }
    })
  }
  
  // 重置并返回
  replyContent.value = ''
  isReplying.value = false
  currentView.value = 'detail'
}

// 点赞帖子
const likePost = (post) => {
  const playerName = gameStore.player.name
  if (!post.likes) post.likes = []
  
  if (post.likes.includes(playerName)) {
    // 取消点赞
    gameStore.unlikeForumPost(post.id)
  } else {
    // 点赞
    gameStore.addForumCommand({
      type: 'like',
      postId: post.id
    })
  }
}

// 检查是否已点赞
const hasLiked = (post) => {
  if (!post.likes) return false
  return post.likes.includes(gameStore.player.name)
}
</script>

<template>
  <div class="forum-app">
    <!-- 顶部导航栏 -->
    <div class="forum-header">
      <button v-if="currentView !== 'list'" class="back-btn" @click="goBack">‹</button>
      <span class="header-title">
        {{ currentView === 'list' ? '天华通论坛' : 
           currentView === 'compose' ? '发布帖子' :
           currentView === 'reply' ? '回复帖子' : '帖子详情' }}
      </span>
      <button v-if="currentView === 'list'" class="compose-btn" @click="openCompose">✏️</button>
      <div v-else class="header-spacer"></div>
    </div>

    <!-- 版块导航 -->
    <div v-if="currentView === 'list'" class="board-nav">
      <div 
        v-for="board in FORUM_BOARDS" 
        :key="board.id"
        class="board-tab"
        :class="{ active: selectedBoard === board.id }"
        @click="selectBoard(board.id)"
      >
        <span class="board-icon">{{ board.icon }}</span>
        <span class="board-name">{{ board.name }}</span>
      </div>
    </div>

    <!-- 帖子列表 -->
    <div v-if="currentView === 'list'" class="post-list">
      <!-- 世界书内的帖子 -->
      <div 
        v-for="post in worldbookPosts" 
        :key="post.id" 
        class="post-item"
        :class="{ pinned: post.isPinned }"
        @click="viewPost(post)"
      >
        <div class="post-header">
          <span v-if="post.isPinned" class="pin-badge">📌置顶</span>
          <span class="post-board">{{ post.board }}</span>
          <span class="post-time">{{ formatTime(post.timestamp) }}</span>
        </div>
        <div class="post-title">{{ post.title }}</div>
        <div class="post-meta">
          <span class="post-author">👤 {{ post.author }}</span>
          <span class="post-stats">
            <span class="replies-count">💬 {{ post.replies?.length || 0 }}</span>
            <span class="likes-count">❤️ {{ post.likes?.length || 0 }}</span>
          </span>
        </div>
      </div>

      <!-- 旧帖子分割线 -->
      <div v-if="oldPosts.length > 0" class="old-posts-divider">
        <span class="divider-line"></span>
        <span class="divider-text">以下为旧帖子 (未写入世界书)</span>
        <span class="divider-line"></span>
      </div>

      <!-- 旧帖子 -->
      <div 
        v-for="post in oldPosts" 
        :key="post.id" 
        class="post-item old-post"
        :class="{ pinned: post.isPinned }"
        @click="viewPost(post)"
      >
        <div class="post-header">
          <span v-if="post.isPinned" class="pin-badge">📌置顶</span>
          <span class="post-board">{{ post.board }}</span>
          <span class="post-time">{{ formatTime(post.timestamp) }}</span>
        </div>
        <div class="post-title">{{ post.title }}</div>
        <div class="post-meta">
          <span class="post-author">👤 {{ post.author }}</span>
          <span class="post-stats">
            <span class="replies-count">💬 {{ post.replies?.length || 0 }}</span>
            <span class="likes-count">❤️ {{ post.likes?.length || 0 }}</span>
          </span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredPosts.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">暂无帖子</div>
        <button class="empty-action" @click="openCompose">发布第一个帖子</button>
      </div>
    </div>

    <!-- 帖子详情 -->
    <div v-if="currentView === 'detail' && selectedPost" class="post-detail">
      <div class="detail-content">
        <div class="detail-header">
          <span class="detail-board">{{ selectedPost.board }}</span>
          <span class="detail-time">{{ formatTime(selectedPost.timestamp) }}</span>
        </div>
        <h2 class="detail-title">
          <span v-if="selectedPost.isPinned" class="pin-badge">📌</span>
          {{ selectedPost.title }}
        </h2>
        <div class="detail-author">
          <span class="author-avatar">👤</span>
          <span class="author-name">{{ selectedPost.author }}</span>
        </div>
        <div class="detail-body">{{ selectedPost.content }}</div>
        
        <div class="detail-actions">
          <button 
            class="action-btn like-btn" 
            :class="{ liked: hasLiked(selectedPost) }"
            @click="likePost(selectedPost)"
          >
            {{ hasLiked(selectedPost) ? '❤️' : '🤍' }} {{ selectedPost.likes?.length || 0 }}
          </button>
          <button class="action-btn reply-btn" @click="openReply">
            💬 回复
          </button>
        </div>

        <!-- 回复列表 -->
        <div class="replies-section">
          <div class="replies-header">
            回复 ({{ selectedPost.replies?.length || 0 }})
          </div>
          <div v-if="selectedPost.replies?.length > 0" class="replies-list">
            <div v-for="(reply, index) in selectedPost.replies" :key="index" class="reply-item">
              <div class="reply-author">
                <span class="author-avatar">👤</span>
                <span class="author-name">{{ reply.author }}</span>
              </div>
              <div class="reply-content">{{ reply.content }}</div>
            </div>
          </div>
          <div v-else class="no-replies">暂无回复，快来抢沙发吧！</div>
        </div>
      </div>
    </div>

    <!-- 发帖页面 -->
    <div v-if="currentView === 'compose'" class="compose-view">
      <div class="form-group">
        <label class="form-label">版块</label>
        <select v-model="newPost.board" class="form-select">
          <option v-for="board in FORUM_BOARDS.filter(b => b.id !== 'all')" :key="board.id" :value="board.id">
            {{ board.icon }} {{ board.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">标题</label>
        <input 
          v-model="newPost.title" 
          type="text" 
          class="form-input" 
          placeholder="请输入帖子标题..."
          maxlength="50"
        />
      </div>
      <div class="form-group">
        <label class="form-label">内容</label>
        <textarea 
          v-model="newPost.content" 
          class="form-textarea" 
          placeholder="请输入帖子内容..."
          rows="8"
        ></textarea>
      </div>
      <button class="submit-btn" @click="submitPost">发布帖子</button>
      <p class="compose-hint">发布后将加入待处理队列，点击发送后生效</p>
    </div>

    <!-- 回复页面 -->
    <div v-if="currentView === 'reply'" class="reply-view">
      <div class="reply-target">
        回复：{{ selectedPost?.title }}
      </div>
      <div class="form-group">
        <textarea 
          v-model="replyContent" 
          class="form-textarea" 
          placeholder="请输入回复内容..."
          rows="6"
        ></textarea>
      </div>
      <button class="submit-btn" @click="submitReply">发送回复</button>
      <p class="compose-hint">回复后将加入待处理队列，点击发送后生效</p>
    </div>
  </div>
</template>

<style scoped>
.forum-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
}

/* 顶部导航 */
.forum-header {
  height: 44px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #fff;
  cursor: pointer;
  padding: 0;
  width: 30px;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.compose-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 30px;
}

.header-spacer {
  width: 30px;
}

/* 版块导航 */
.board-nav {
  display: flex;
  overflow-x: auto;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
  flex-shrink: 0;
  padding: 8px 0;
}

.board-nav::-webkit-scrollbar {
  display: none;
}

.board-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  min-width: 60px;
  cursor: pointer;
  transition: all 0.2s;
}

.board-tab.active {
  color: #1e3c72;
}

.board-tab.active .board-icon {
  transform: scale(1.1);
}

.board-icon {
  font-size: 20px;
  margin-bottom: 4px;
  transition: transform 0.2s;
}

.board-name {
  font-size: 11px;
  white-space: nowrap;
}

/* 帖子列表 */
.post-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.post-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: transform 0.1s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.post-item:active {
  transform: scale(0.98);
}

.post-item.pinned {
  border-left: 3px solid #ff9500;
}

.post-item.old-post {
  opacity: 0.7;
  border-left: 3px solid #8e8e93;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pin-badge {
  font-size: 11px;
  background: #fff3e0;
  color: #ff9500;
  padding: 2px 6px;
  border-radius: 4px;
}

.post-board {
  font-size: 11px;
  color: #1e3c72;
  background: #e3f2fd;
  padding: 2px 6px;
  border-radius: 4px;
}

.post-time {
  font-size: 11px;
  color: #8e8e93;
  margin-left: auto;
}

.post-title {
  font-size: 15px;
  font-weight: 500;
  color: #000;
  margin-bottom: 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.post-author {
  font-size: 12px;
  color: #666;
}

.post-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #8e8e93;
}

/* 旧帖子分割线 */
.old-posts-divider {
  display: flex;
  align-items: center;
  margin: 16px 0;
  gap: 12px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    #ccc,
    #ccc 4px,
    transparent 4px,
    transparent 8px
  );
}

.divider-text {
  font-size: 11px;
  color: #8e8e93;
  white-space: nowrap;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  color: #8e8e93;
  margin-bottom: 20px;
}

.empty-action {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
}

/* 帖子详情 */
.post-detail {
  flex: 1;
  overflow-y: auto;
  background: #fff;
}

.detail-content {
  padding: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-board {
  font-size: 12px;
  color: #1e3c72;
  background: #e3f2fd;
  padding: 4px 8px;
  border-radius: 4px;
}

.detail-time {
  font-size: 12px;
  color: #8e8e93;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.detail-author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.author-avatar {
  font-size: 24px;
}

.author-name {
  font-size: 14px;
  color: #333;
}

.detail-body {
  font-size: 15px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  margin-bottom: 20px;
}

.detail-actions {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:active {
  transform: scale(0.95);
}

.like-btn.liked {
  background: #fff5f5;
  border-color: #ffcdd2;
  color: #f44336;
}

/* 回复列表 */
.replies-section {
  margin-top: 16px;
}

.replies-header {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.replies-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reply-item {
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.reply-author {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.reply-author .author-avatar {
  font-size: 18px;
}

.reply-author .author-name {
  font-size: 13px;
  font-weight: 500;
}

.reply-content {
  font-size: 14px;
  line-height: 1.5;
  color: #333;
}

.no-replies {
  text-align: center;
  color: #8e8e93;
  font-size: 14px;
  padding: 20px;
}

/* 发帖/回复页面 */
.compose-view,
.reply-view {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background: #fff;
}

.reply-target {
  font-size: 13px;
  color: #666;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.form-select,
.form-input,
.form-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  color: #333; /* 强制深色文字，防止在夜间模式下看不清 */
  box-sizing: border-box;
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #1e3c72;
}

.form-textarea {
  resize: none;
  font-family: inherit;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:active {
  opacity: 0.8;
}

.compose-hint {
  text-align: center;
  font-size: 12px;
  color: #8e8e93;
  margin-top: 12px;
}
</style>
