<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { syncSocialToStore, getSocialData, saveSocialData, saveMomentToWorldbook } from '../utils/socialWorldbook'
import { setItem, getItem, removeItem } from '../utils/indexedDB'
import { getAllCharacterNames } from '../utils/relationshipManager'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

const activeTab = ref('chats') // 'chats', 'contacts', 'moments'
const activeChat = ref(null) // 当前打开的聊天对象（好友或群组）
const showChatMenu = ref(false)
const showInviteModal = ref(false)
const showActionSheet = ref(false) // 聊天界面的加号菜单
const showMainActionSheet = ref(false) // 主界面的加号菜单
const showMediaModal = ref(false) // 多媒体发送模态框
const mediaType = ref('') // 'image', 'file', 'location', 'transfer'
const mediaForm = ref({ name: '', size: '', desc: '', location: '', amount: '', note: '' })
const showAddFriendModal = ref(false) // 添加好友模态框
const searchKeyword = ref('')
const searchResults = ref([])
const selectedFriends = ref([])
const newGroupName = ref('') // 新建群聊名称
const chatContentRef = ref(null)
const replyTarget = ref(null)

// 获取当前聊天的已读/未读状态（仅私聊）
const currentChatReadStatus = computed(() => {
  if (!activeChat.value || activeChat.value.type !== 'friend') return null
  if (!gameStore.player.socialReadStatus) return null
  return gameStore.player.socialReadStatus[activeChat.value.id] || null
})

// 判断某条消息是否是最后一条玩家消息
const isLastSelfMessage = (msg) => {
  if (msg.type !== 'self') return false
  const selfMessages = currentMessages.value.filter(m => m.type === 'self')
  if (selfMessages.length === 0) return false
  return selfMessages[selfMessages.length - 1].id === msg.id
}

// ==================== 游戏内时间辅助函数 ====================
// 获取游戏内当前时间的格式化字符串 (HH:mm)
const getGameTimeString = () => {
  const { hour, minute } = gameStore.world.gameTime
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// 获取游戏内时间戳（用于排序和计算相对时间）
const getGameTimestamp = () => {
  const { year, month, day, hour, minute } = gameStore.world.gameTime
  return new Date(year, month - 1, day, hour, minute).getTime()
}

// 角色性别映射表 (用于头像颜色区分)
const characterGenders = {
  // 男性角色
  '比企谷八幡': 'male', '白银御行': 'male', '阿虚': 'male', '折木奉太郎': 'male', 
  '绫小路清隆': 'male', '五条新菜': 'male', '石上优': 'male', '宫村伊澄': 'male',
  '梓川咲太': 'male', '有马公生': 'male', '岡崎朋也': 'male', '立花泷': 'male',
  '坂本': 'male', '日向翔阳': 'male', '影山飞雄': 'male', '安艺伦也': 'male',
  '高须龙儿': 'male', '富樫勇太': 'male', '伊藤诚': 'male', '冈部伦太郎': 'male',
  '李小狼': 'male', '只野仁人': 'male', '上杉风太郎': 'male', '大路饼藏': 'male',
  '市川京太郎': 'male', '石田将也': 'male', '越前龙马': 'male', '黑子テツヤ': 'male',
  '七濑遥': 'male', '武田一鉄': 'male', '泷昇': 'male', '鬼冢英吉': 'male',
  '乌间惟臣': 'male', '桥田至': 'male', '真壁政宗': 'male', '久世政近': 'male',
  '和泉': 'male', '志贺春树': 'male', '滨边隆弘': 'male', '桃城武': 'male',
  '黄瀬涼太': 'male', '橘真琴': 'male', '西岛': 'male', '吉田松阳': 'male',
  '坂田银时': 'male', '安昙小太郎': 'male', '河村隆': 'male', '不二周助': 'male',
  '绿间真太郎': 'male', '高尾和成': 'male', '松冈凛': 'male', '大蛇丸': 'male',
  '佐助': 'male', '榊原恒一': 'male', '勅使河原直哉': 'male', '樱木花道': 'male',
  '流川枫': 'male', '宫城良田': 'male', '水户洋平': 'male', '加贺优树': 'male',
  '月岛萤': 'male', '山口忠': 'male', '大石秀一郎': 'male', '火神大我': 'male',
  '椎名旭': 'male', '桐岛郁弥': 'male', '天野雪辉': 'male', '古泉一树': 'male',
  '石川透': 'male', '浅村悠太': 'male', '乾貞治': 'male', '海堂薫': 'male',
  '赤木刚宪': 'male', '木暮公延': 'male', '三井寿': 'male', '神原秋人': 'male',
  '名濑博臣': 'male', '高木社长': 'male', '菊丸英二': 'male', '紫原敦': 'male',
  '赤司征十郎': 'male', '山崎宗介': 'male', '三日月三郎': 'male', '木之本桃矢': 'male',
  '月城雪兔': 'male', '永束友宏': 'male', '泽村大地': 'male', '菅原孝支': 'male',
  '东峰旭': 'male', '西谷夕': 'male', '粟屋麦': 'male', '根津老师': 'male',
  '维尔维特·维斯·维': 'male', '塔野薰': 'male', '小泉': 'male', 'プロデューサー': 'male',
  '有栖川誉': 'male', '折原临也': 'male', '槙岛圣护': 'male', '久保田吉伸': 'male',
  '黑沼': 'male', '丸山': 'male', '八木': 'male', '手冢国光': 'male', '青峰大辉': 'male',
  '北宇治吹奏部部长': 'male', '福部里志': 'male', '春原阳平': 'male', '乙坂有宇': 'male',
  '高城丈士朗': 'male', '北村祐作': 'male', '高山P': 'male', '神田空太': 'male',
  '三鹰仁': 'male', '鸣宫凪砂': 'male', '渡亮太': 'male', '赤城': 'male',

  // 女性角色
  '雪之下雪乃': 'female', '由比滨结衣': 'female', '一色彩羽': 'female', '四宫辉夜': 'female',
  '藤原千花': 'female', '早坂爱': 'female', '伊井野弥子': 'female', '凉宫春日': 'female',
  '长门有希': 'female', '朝比奈实玖瑠': 'female', '平泽唯': 'female', '秋山澪': 'female',
  '田井中律': 'female', '琴吹紬': 'female', '中野梓': 'female', '堀北铃音': 'female',
  '轻井泽惠': 'female', '一之濑帆波': 'female', '坂柳有栖': 'female', '喜多川海梦': 'female',
  '后藤一里': 'female', '伊地知虹夏': 'female', '喜多郁代': 'female', '山田凉': 'female',
  '高松灯': 'female', '千早爱音': 'female', '要乐奈': 'female', '椎名立希': 'female',
  '长崎素世': 'female', '北白川玉子': 'female', '常盘绿': 'female', '饭冢美代': 'female',
  '山田杏奈': 'female', '西宫硝子': 'female', '西宫结弦': 'female', '植野直花': 'female',
  '佐原爱': 'female', '我妻由乃': 'female', '爱城华恋': 'female', '神乐光': 'female',
  '島田真夢': 'female', '林田藍里': 'female', '平冢静': 'female', '伊莉娜·耶拉比琪': 'female',
  '冬月梓': 'female', '高坂丽奈': 'female', '幸田实果子': 'female', '中野一花': 'female',
  '中野二乃': 'female', '中野三玖': 'female', '中野四叶': 'female', '中野五月': 'female',
  '水野茜': 'female', '安达垣爱姬': 'female', '小岩井吉乃': 'female', '双叶妙': 'female',
  '艾莉': 'female', '猫崎享': 'female', '式守': 'female', '山内樱良': 'female',
  '恭子': 'female', '雨流美弥音': 'female', '古见硝子': 'female',
  '长名奈奈': 'female', '山井恋': 'female', '木之本樱': 'female', '大道寺知世': 'female',
  '小糸侑': 'female', '七海灯子': 'female', '花城杏子': 'female',
  '高野千鹤': 'female', '谷地仁花': 'female', '清水洁子': 'female', '春日野椿': 'female',
  '天堂真矢': 'female', '西条クロディーヌ': 'female', '片山実波': 'female', '牧濑红莉栖': 'female',
  '桂言叶': 'female', '西园寺世界': 'female', '加藤乙女': 'female', '甘露寺七海': 'female',
  '见崎鸣': 'female', '赤泽泉美': 'female', '彩子': 'female', '秋月律子': 'female',
  '千石千寻': 'female', '山中佐和子': 'female', '本田未央': 'female',
  '岛村卯月': 'female', '双叶杏': 'female', '诸星琪拉莉': 'female', '城崎美嘉': 'female',
  '赤城米莉亚': 'female', '早坂美玲': 'female', '大崎甜花': 'female', '大崎甘奈': 'female',
  '三峰结华': 'female', '田中摩美々': 'female', '杜野凛世': 'female', '风野灯织': 'female',
  '樱木真乃': 'female', '八宫巡': 'female', '铃木羽那': 'female', '加藤惠': 'female',
  '霞之丘诗羽': 'female', '泽村·斯宾塞·英梨梨': 'female', '氷堂美智留': 'female', '逢坂大河': 'female',
  '櫛枝实乃梨': 'female', '川嶋亚美': 'female', '高垣枫': 'female', '十时爱梨': 'female',
  '片桐早苗': 'female', '川岛瑞树': 'female', '橘爱丽丝': 'female', '白坂小梅': 'female',
  '幽谷雾子': 'female', '白濑咲耶': 'female', '西城树里': 'female', '绿川真奈': 'female',
  '樋口円香': 'female', '樱岛麻衣': 'female', '古贺朋绘': 'female', '双叶理央': 'female',
  '丰浜和香': 'female', '梓川花楓': 'female', '椎名真白': 'female', '青山七海': 'female',
  '上井草美咲': 'female', '皆川茜': 'female', '安乐冈花火': 'female',
  '宫园薰': 'female', '椿明音': 'female', '森川由绮': 'female',
  '绪方理奈': 'female', '绫濑乃绘里子': 'female', '绫濑小春': 'female', '宫水三叶': 'female',
  '奥寺美纪': 'female', '宫水四叶': 'female', '高坂穗乃果': 'female', '南小鸟': 'female',
  '园田海未': 'female', '星空凛': 'female', '小泉花阳': 'female', '花柳香子': 'female',
  '石动双叶': 'female', '岡本未夕': 'female', '丹生谷森夏': 'female', '凸守早苗': 'female',
  '五月七日茴香': 'female', '小鸟游六花': 'female', '堀京子': 'female', '吉川由纪': 'female',
  '绫濑沙季': 'female', '樱井奈奈': 'female', '田中望': 'female', '菊池茜': 'female',
  '鸟井真理': 'female', '名濑美月': 'female', '栗山未来': 'female', '绫濑绘里': 'female',
  '东条希': 'female', '七瀬佳乃': 'female', '菊間夏夜': 'female', '久海菜々美': 'female',
  '茅野枫': 'female', '黄前久美子': 'female', '加藤叶月': 'female', '川岛绿辉': 'female',
  '田中明日香': 'female', '高桥夏纪': 'female', '吉川优纪': 'female', '星见纯那': 'female',
  '千反田爱瑠': 'female', '伊原摩耶花': 'female', '古河渚': 'female', '藤林杏': 'female',
  '藤林椋': 'female', '坂上智代': 'female', '一之濑琴美': 'female', '友利奈绪': 'female',
  '西森柚咲': 'female', '大场奈奈': 'female', '佐久间麻由': 'female', '藤原肇': 'female',
  '小日向美穗': 'female', '芹泽朝日': 'female', '有栖川夏叶': 'female', '和泉爱依': 'female',
  '福丸小糸': 'female'
}

// 朋友圈封面相关
const momentsCover = ref(null)
const MOMENTS_COVER_KEY = 'social_moments_cover'
const DEFAULT_COVER = 'https://files.catbox.moe/kxz1kx.jpg'

const getAvatarGenderClass = (item) => {
  if (!item) return ''
  // 检查 gender 字段
  if (item.gender === 'female' || item.gender === '女') return 'avatar-female'
  if (item.gender === 'male' || item.gender === '男') return 'avatar-male'
  
  // 尝试从名字推断
  if (item.name && characterGenders[item.name]) {
    const gender = characterGenders[item.name]
    if (gender === 'female') return 'avatar-female'
    if (gender === 'male') return 'avatar-male'
  }
  
  return ''
}
const coverInputRef = ref(null)

// 朋友圈发布相关
const showPostMomentModal = ref(false)
const momentContent = ref('')
const isPostingMoment = ref(false)

// 朋友圈评论相关
const showCommentModal = ref(false)
const commentTargetMoment = ref(null)
const commentContent = ref('')

// 获取好友和群组列表
const friends = computed(() => gameStore.player.social.friends)
const groups = computed(() => gameStore.player.social.groups)

// 分类好友列表
const normalContacts = computed(() => friends.value.filter(f => !f.isSystem))
const systemContacts = computed(() => friends.value.filter(f => f.isSystem))

// 检查拒绝好友通知
const checkNotifications = () => {
  if (!gameStore.player.social.notifications) return
  
  const rejectedList = gameStore.player.social.notifications.filter(n => n.type === 'friend_rejected')
  if (rejectedList.length > 0) {
    rejectedList.forEach(n => {
      alert(`【好友申请被拒绝】\n${n.name} 拒绝了你的申请。\n理由：${n.reason}`)
    })
    // 移除已读通知
    gameStore.player.social.notifications = gameStore.player.social.notifications.filter(n => n.type !== 'friend_rejected')
  }
}

// 获取当前群聊成员
const currentGroupMembers = computed(() => {
  if (!activeChat.value || activeChat.value.type !== 'group') return []
  const group = groups.value.find(g => g.id === activeChat.value.id)
  if (!group) return []
  
  return group.members.map(memberId => {
    if (memberId === 'player') {
      return { id: 'player', name: gameStore.player.name, avatar: gameStore.player.avatar }
    }
    const friend = friends.value.find(f => f.id === memberId)
    if (friend) return friend
    const npc = gameStore.world.npcs.find(n => n.id === memberId)
    if (npc) return { id: npc.id, name: npc.name, avatar: '👤', gender: npc.gender }
    // 如果ID本身看起来像名字（非ID格式），直接使用
    if (!memberId.startsWith('char_') && !memberId.startsWith('npc_')) {
      return { id: memberId, name: memberId, avatar: '👤' }
    }
    return { id: memberId, name: '未知成员', avatar: '?' }
  })
})

// 根据发送者名字获取头像信息
const getSenderInfo = (senderName) => {
  if (!senderName) return null
  
  // 1. 尝试在好友列表中查找
  const friend = friends.value.find(f => f.name === senderName)
  if (friend) return friend
  
  // 2. 尝试在所有 NPC 中查找
  const npc = gameStore.world.npcs.find(n => n.name === senderName)
  if (npc) return { name: npc.name, avatar: '👤', gender: npc.gender }
  
  // 3. 尝试在群成员中查找（可能已经是 ID）
  if (activeChat.value && activeChat.value.type === 'group') {
     const member = currentGroupMembers.value.find(m => m.name === senderName || m.id === senderName)
     if (member) return member
  }
  
  return { name: senderName, avatar: '👤' }
}

// 可邀请的好友列表 (排除已在群里的)
const availableFriends = computed(() => {
  if (!activeChat.value) return []
  
  if (activeChat.value.type === 'group') {
    const group = groups.value.find(g => g.id === activeChat.value.id)
    if (!group) return []
    return friends.value.filter(f => !group.members.includes(f.id))
  } else if (activeChat.value.type === 'friend') {
    // 私聊建群：排除当前聊天对象
    return friends.value.filter(f => f.id !== activeChat.value.id)
  }
  return []
})

// 模拟的最近消息列表
const chatSessions = computed(() => {
  const sessions = []
  groups.value.forEach(group => {
    sessions.push({
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      lastMessage: group.lastMessage || group.announcement,
      time: group.lastMessageTime || '12:00',
      type: 'group',
      unread: group.unreadCount || 0
    })
  })
  friends.value.forEach(friend => {
    sessions.push({
      id: friend.id,
      name: friend.name,
      avatar: friend.avatar,
      lastMessage: friend.lastMessage || friend.signature,
      time: friend.lastMessageTime || '昨天',
      type: 'friend',
      unread: friend.unreadCount || 0
    })
  })
  return sessions
})

const showFriends = ref(true)
const showGroups = ref(true)
const showSystem = ref(true)

const currentMessages = ref([])

const scrollToBottom = async () => {
    await nextTick()
    if (chatContentRef.value) {
        chatContentRef.value.scrollTop = chatContentRef.value.scrollHeight
    }
}

// 判断是否为图片源（支持 http, https, data:image, 本地路径）
const isImage = (avatar) => {
  if (!avatar || typeof avatar !== 'string') return false
  return avatar.startsWith('http') || avatar.startsWith('data:image') || avatar.startsWith('/') || avatar.startsWith('./')
}

// 消息解析与分类
const parseMessage = (content) => {
    if (!content) return { type: 'text', text: '' }
    
    // 图片: 发送[图片] name (size): desc
    const imgMatch = content.match(/^发送\[图片\]\s+(.*?)\s+\((.*?)\):\s+(.*)$/)
    if (imgMatch) return { type: 'image', name: imgMatch[1], size: imgMatch[2], desc: imgMatch[3] }

    // 文件: 发送[文件] name (size): desc
    const fileMatch = content.match(/^发送\[文件\]\s+(.*?)\s+\((.*?)\):\s+(.*)$/)
    if (fileMatch) return { type: 'file', name: fileMatch[1], size: fileMatch[2], desc: fileMatch[3] }

    // 定位: 发送[定位] location
    const locMatch = content.match(/^发送\[定位\]\s+(.*)$/)
    if (locMatch) return { type: 'location', address: locMatch[1] }
    
    // 转账: 转账 amount元: note
    const transferMatch = content.match(/^转账\s+(\d+)元:\s+(.*)$/)
    if (transferMatch) return { type: 'transfer', amount: transferMatch[1], note: transferMatch[2] }

    return { type: 'text', text: content }
}

const formatText = (text) => {
  if (!text) return ''
  return text.replace(/\\n/g, '\n')
}

const loadMessages = async () => {
  if (!activeChat.value) return
  const data = await getSocialData(activeChat.value.id)
  if (data) {
    currentMessages.value = data.messages
  } else {
    currentMessages.value = []
  }
  await scrollToBottom()
}

const openChat = async (session) => {
  activeChat.value = session
  showChatMenu.value = false 
  await loadMessages()

  if (session.unread > 0) {
    gameStore.updateSocialStatus(session.id, session.type, { unreadCount: 0 })
    const data = await getSocialData(session.id)
    if (data) {
      data.unreadCount = 0
      await saveSocialData(session.id, session.name, data)
    }
  }
}

watch(() => {
  if (!activeChat.value) return null
  const list = activeChat.value.type === 'friend' ? gameStore.player.social.friends : gameStore.player.social.groups
  const item = list.find(i => i.id === activeChat.value.id)
  return item ? item.lastMessageTime : null
}, async (newVal, oldVal) => {
  if (newVal !== oldVal) {
    await loadMessages()
    if (activeChat.value) {
       gameStore.updateSocialStatus(activeChat.value.id, activeChat.value.type, { unreadCount: 0 })
    }
  }
})

const closeChat = () => {
  activeChat.value = null
  showChatMenu.value = false
}

const toggleMenu = () => {
  showChatMenu.value = !showChatMenu.value
}

const openInviteModal = () => {
  showInviteModal.value = true
  showChatMenu.value = false
  showActionSheet.value = false
  selectedFriends.value = []
  newGroupName.value = ''
}

const openMediaModal = (type) => {
  mediaType.value = type
  mediaForm.value = { name: '', size: '', desc: '', location: '', amount: '', note: '' }
  showMediaModal.value = true
  showActionSheet.value = false
}

const sendMediaMessage = async () => {
  let content = ''
  let rollbackData = null

  if (mediaType.value === 'image') {
    content = `发送[图片] ${mediaForm.value.name} (${mediaForm.value.size}): ${mediaForm.value.desc}`
  } else if (mediaType.value === 'file') {
    content = `发送[文件] ${mediaForm.value.name} (${mediaForm.value.size}): ${mediaForm.value.desc}`
  } else if (mediaType.value === 'location') {
    content = `发送[定位] ${mediaForm.value.location}`
  } else if (mediaType.value === 'transfer') {
    const amount = parseInt(mediaForm.value.amount)
    if (isNaN(amount) || amount <= 0) {
      alert('请输入有效的金额')
      return
    }
    if (gameStore.player.money < amount) {
      alert('余额不足')
      return
    }
    
    // 扣款并设置回滚数据
    gameStore.player.money -= amount
    rollbackData = { type: 'transfer', amount: amount }
    
    content = `转账 ${amount}元: ${mediaForm.value.note}`
  }

  if (content) {
    await sendContent(content, rollbackData)
  }
  showMediaModal.value = false
}

const selectLocationFromMap = () => {
  gameStore.startMapSelection((location) => {
    mediaForm.value.location = location
  })
}

const inviteFriends = async () => {
  // 群聊邀请逻辑
  if (activeChat.value.type === 'group') {
    if (selectedFriends.value.length === 0) return
    
    const group = groups.value.find(g => g.id === activeChat.value.id)
    if (!group) return

    group.members.push(...selectedFriends.value)
    const newNames = friends.value.filter(f => selectedFriends.value.includes(f.id)).map(f => f.name).join('、')
    const sysMsg = `你邀请 ${newNames} 加入了群聊`
    
    const data = await getSocialData(group.id) || { messages: [], unreadCount: 0 }
    data.messages.push({
      id: getGameTimestamp(),
      type: 'other', 
      sender: '系统',
      content: sysMsg,
      time: getGameTimeString(),
      floor: gameStore.meta.currentFloor
    })
    
    await saveSocialData(group.id, group.name, data, [], gameStore.meta.currentFloor)
    await loadMessages()
    showInviteModal.value = false
  } 
  // 私聊建群逻辑
  else if (activeChat.value.type === 'friend') {
    if (selectedFriends.value.length === 0 || !newGroupName.value.trim()) return
    
    // 创建新群组
    const groupId = Date.now().toString()
    const members = ['player', activeChat.value.id, ...selectedFriends.value]
    
    const newGroup = {
      id: groupId,
      name: newGroupName.value.trim(),
      avatar: '👥',
      members: members,
      announcement: '群聊已创建',
      messages: [],
      unreadCount: 0
    }
    
    gameStore.player.social.groups.push(newGroup)
    
    // 构建系统提示词
    const inviteeNames = friends.value
      .filter(f => selectedFriends.value.includes(f.id) || f.id === activeChat.value.id)
      .map(f => f.name)
      .join('、')
      
    const sysMsg = `${gameStore.player.name}邀请${inviteeNames}加入了群聊【${newGroup.name}】`
    
    // 添加指令让AI知晓
    gameStore.addCommand({
      id: Date.now(),
      text: `[系统通知] ${sysMsg}`,
      type: 'other' // 或者标记为 system_notice
    })
    
    // 保存世界书
    await saveSocialData(newGroup.id, newGroup.name, { messages: [], unreadCount: 0 }, members.map(mid => {
        if (mid === 'player') return gameStore.player.name
        const f = friends.value.find(f => f.id === mid)
        if (f) return f.name
        return null
    }).filter(n => n), gameStore.meta.currentFloor)
    
    showInviteModal.value = false
    
    // 切换到新群聊
    await openChat({
      id: newGroup.id,
      name: newGroup.name,
      avatar: newGroup.avatar,
      lastMessage: '群聊已创建',
      time: '刚刚',
      type: 'group',
      unread: 0
    })
  }
}

const leaveGroup = async () => {
  if (!confirm('确定要退出该群聊吗？')) return
  const groupId = activeChat.value.id
  const index = gameStore.player.social.groups.findIndex(g => g.id === groupId)
  if (index > -1) {
    gameStore.player.social.groups.splice(index, 1)
  }
  closeChat()
}

const messageInput = ref('')

const sendMessage = async () => {
  if (!messageInput.value.trim()) return
  await sendContent(messageInput.value)
  messageInput.value = ''
  replyTarget.value = null
}

const setReply = (msg) => {
  // 查找发送者名字
  let senderName = '未知'
  if (msg.type === 'self') {
    senderName = gameStore.player.name
  } else {
    // 尝试解析 msg.sender 或从群成员查找
    if (msg.sender && msg.sender !== '系统') {
      senderName = msg.sender
    } else if (activeChat.value.type === 'friend') {
      senderName = activeChat.value.name
    } else {
      senderName = '群友'
    }
  }
  
  // 解析消息内容（处理图片等）
  const parsed = parseMessage(msg.content)
  let previewContent = parsed.text
  if (parsed.type === 'image') previewContent = '[图片]'
  else if (parsed.type === 'file') previewContent = '[文件]'
  else if (parsed.type === 'location') previewContent = '[定位]'
  else if (parsed.type === 'transfer') previewContent = '[转账]'

  replyTarget.value = {
    id: msg.id,
    senderName,
    content: previewContent,
    originalContent: msg.content
  }
}

const cancelReply = () => {
  replyTarget.value = null
}

const sendContent = async (content, rollbackData = null) => {
  const time = getGameTimeString()
  const msgId = getGameTimestamp()
  const cmdPrefix = activeChat.value.type === 'group' ? '[群聊]' : '[私聊]'
  let cmdText = `发送消息给 ${cmdPrefix} ${activeChat.value.name}: ${content}`
  
  const metadata = {
    chatId: activeChat.value.id,
    msgId: msgId,
    content: content
  }

  if (replyTarget.value) {
    metadata.replyTo = {
      name: replyTarget.value.senderName,
      content: replyTarget.value.content
    }
    // 更新 cmdText 以包含回复信息（作为备份，主要逻辑在 prompts.js）
    cmdText = `${gameStore.player.name}在${cmdPrefix}：${activeChat.value.name}，中回复了${replyTarget.value.senderName}的“${replyTarget.value.content}”消息，回复内容是：${content}`
  }
  
  gameStore.addCommand({
    id: msgId,
    text: cmdText,
    type: 'social_msg',
    metadata: metadata,
    rollbackData: rollbackData
  })

  // 清除旧的已读/未读状态（玩家发了新消息，旧状态不再有意义）
  if (gameStore.player.socialReadStatus && gameStore.player.socialReadStatus[activeChat.value.id]) {
    delete gameStore.player.socialReadStatus[activeChat.value.id]
  }

  // 添加到待回复消息列表 (holdMessages) 以确保持续提示 AI
  if (!gameStore.player.holdMessages) {
    gameStore.player.holdMessages = []
  }
  // 避免重复 (基于 msgId)
  if (!gameStore.player.holdMessages.some(m => m.metadata && m.metadata.msgId === msgId)) {
    gameStore.player.holdMessages.push({
      id: msgId,
      text: cmdText, // 复用 command 的文本
      type: 'social_msg',
      metadata: metadata
    })
  }

  currentMessages.value.push({
    id: msgId,
    type: 'self',
    content: content,
    time: time,
    floor: gameStore.meta.currentFloor
  })
  await scrollToBottom()
  
  const data = await getSocialData(activeChat.value.id) || { messages: [], unreadCount: 0 }
  data.messages.push({
    id: msgId,
    type: 'self',
    content: content,
    time: time,
    floor: gameStore.meta.currentFloor
  })
  await saveSocialData(activeChat.value.id, activeChat.value.name, data, [], gameStore.meta.currentFloor)

  if (activeChat.value) {
    gameStore.updateSocialStatus(activeChat.value.id, activeChat.value.type, {
      lastMessage: content,
      lastMessageTime: time
    })
  }
}

onMounted(() => {
  syncSocialToStore()
  // 加载自定义朋友圈封面
  loadMomentsCover()
  // 检查通知
  checkNotifications()
})

// 朋友圈封面功能
const loadMomentsCover = async () => {
  try {
    const saved = await getItem(MOMENTS_COVER_KEY)
    if (saved) {
      momentsCover.value = saved
    }
  } catch (e) {
    console.error('加载朋友圈封面失败:', e)
  }
}

const handleCoverUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }
  
  if (file.size > 2 * 1024 * 1024) {
    alert('图片大小不能超过 2MB')
    return
  }
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result
    if (base64 && typeof base64 === 'string') {
      momentsCover.value = base64
      try {
        await setItem(MOMENTS_COVER_KEY, base64)
      } catch (err) {
        console.error('保存封面失败:', err)
        alert('保存失败，请检查控制台')
      }
    }
  }
  reader.readAsDataURL(file)
}

const triggerCoverInput = () => {
  coverInputRef.value?.click()
}

const coverStyle = computed(() => {
  const url = momentsCover.value || DEFAULT_COVER
  return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%), url('${url}') center/cover no-repeat`
})

// 获取朋友圈动态列表（只显示好友和自己的）
const moments = computed(() => {
  const list = gameStore.player.social.moments || []
  return list.filter(m => {
    return m.userId === 'player' || gameStore.isFriend(m.userId)
  }).sort((a, b) => b.timestamp - a.timestamp)
})

// 格式化时间显示（基于游戏内时间）
const formatMomentTime = (timestamp) => {
  const now = getGameTimestamp()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  
  // 使用游戏内日期格式化
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// 打开发布朋友圈弹窗
const openPostMomentModal = () => {
  momentContent.value = ''
  showPostMomentModal.value = true
}

// 发布朋友圈
const postMoment = async () => {
  if (!momentContent.value.trim() || isPostingMoment.value) return
  
  isPostingMoment.value = true
  
  try {
    const timestamp = getGameTimestamp()
    const momentId = timestamp.toString()
    const time = getGameTimeString()
    
    const newMoment = {
      id: momentId,
      userId: 'player',
      name: gameStore.player.name,
      avatar: gameStore.player.avatar,
      content: momentContent.value.trim(),
      images: [],
      time: time,
      timestamp: timestamp,
      likes: [],
      comments: []
    }
    
    // 添加到 Store
    gameStore.addMoment(newMoment)
    
    // 保存到世界书（关键词为玩家所有好友的名称）
    const keywords = gameStore.getAllFriendNames()
    await saveMomentToWorldbook(newMoment, keywords)

    // 添加到待发送指令队列，让 AI 知晓
    gameStore.addCommand({
      id: Date.now(),
      text: `${gameStore.player.name} 发送了一条朋友圈: ${newMoment.content}`,
      type: 'moment_post',
      metadata: {
        momentId: newMoment.id,
        content: newMoment.content
      }
    })
    
    console.log('[SocialApp] Posted moment:', momentContent.value.substring(0, 50))
    
    // 关闭弹窗
    showPostMomentModal.value = false
    momentContent.value = ''
  } catch (e) {
    console.error('[SocialApp] Error posting moment:', e)
    alert('发布失败，请重试')
  } finally {
    isPostingMoment.value = false
  }
}

// 点赞朋友圈
const toggleLike = async (moment) => {
  const userId = 'player'
  const alreadyLiked = moment.likes.some(l => l.userId === userId)
  
  if (alreadyLiked) {
    gameStore.removeMomentLike(moment.id, userId)
  } else {
    gameStore.addMomentLike(moment.id, userId, gameStore.player.name)
  }
  
  // 更新世界书
  const updatedMoment = gameStore.getMoment(moment.id)
  if (updatedMoment) {
    const keywords = updatedMoment.userId === 'player' 
      ? gameStore.getAllFriendNames()
      : [updatedMoment.name, ...gameStore.getAllFriendNames()]
    await saveMomentToWorldbook(updatedMoment, keywords)
  }
}

// 检查是否已点赞
const hasLiked = (moment) => {
  return moment.likes && moment.likes.some(l => l.userId === 'player')
}

// 打开评论弹窗
const openCommentModal = (moment) => {
  commentTargetMoment.value = moment
  commentContent.value = ''
  showCommentModal.value = true
}

// 发送评论
const postComment = async () => {
  if (!commentContent.value.trim() || !commentTargetMoment.value) return
  
  const commentId = getGameTimestamp().toString()
  const time = getGameTimeString()
  
  gameStore.addMomentComment(commentTargetMoment.value.id, {
    id: commentId,
    userId: 'player',
    name: gameStore.player.name,
    content: commentContent.value.trim(),
    time: time
  })
  
  // 更新世界书
  const updatedMoment = gameStore.getMoment(commentTargetMoment.value.id)
  if (updatedMoment) {
    const keywords = updatedMoment.userId === 'player' 
      ? gameStore.getAllFriendNames()
      : [updatedMoment.name, ...gameStore.getAllFriendNames()]
    await saveMomentToWorldbook(updatedMoment, keywords)
  }
  
  showCommentModal.value = false
  commentContent.value = ''
  commentTargetMoment.value = null
}

// 添加好友相关逻辑
const openAddFriendModal = async () => {
  searchKeyword.value = ''
  searchResults.value = []
  
  // 确保角色数据已加载
  // 如果 allClassData 为空且 npcs 也为空，尝试重新加载数据
  if (Object.keys(gameStore.world.allClassData || {}).length === 0 && (gameStore.world.npcs || []).length === 0) {
    console.log('[SocialApp] Character data not loaded, attempting to load...')
    try {
      await gameStore.loadClassData()
      await gameStore.loadClubData()
    } catch (e) {
      console.error('[SocialApp] Failed to load character data:', e)
    }
  }
  
  showAddFriendModal.value = true
}

const performSearch = () => {
  if (!searchKeyword.value.trim()) {
    searchResults.value = []
    return
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  const allNames = getAllCharacterNames(gameStore)
  
  searchResults.value = allNames.filter(name => {
    // 确保 name 是有效的字符串
    if (!name || typeof name !== 'string') return false
    // 排除自己
    if (name === gameStore.player.name) return false
    // 排除已是好友的
    if (friends.value.some(f => f.name === name)) return false
    // 匹配名字
    return name.toLowerCase().includes(keyword)
  })
}

const checkIsRequested = (charName) => {
  const inPending = gameStore.player.pendingCommands.some(c => 
    c.type === 'add_friend_request' && c.metadata?.targetName === charName
  )
  const inOutgoing = gameStore.player.social.outgoingRequests && gameStore.player.social.outgoingRequests.some(r => r.targetName === charName)
  return inPending || inOutgoing
}

const handleSendFriendRequest = (charName) => {
  if (checkIsRequested(charName)) return
  
  // 1. 添加到指令队列 (用于UI显示本回合操作)
  gameStore.addCommand({
    id: Date.now(),
    text: `[系统提醒] ${gameStore.player.name}向${charName}发送了好友申请，请及时处理。`,
    type: 'add_friend_request',
    metadata: { targetName: charName }
  })

  // 2. 添加到持久化请求列表 (用于 System Prompt 持续提示)
  if (!gameStore.player.social.outgoingRequests) {
    gameStore.player.social.outgoingRequests = []
  }
  // 避免重复添加
  const exists = gameStore.player.social.outgoingRequests.some(r => r.targetName === charName)
  if (!exists) {
    gameStore.player.social.outgoingRequests.push({
      id: Date.now(),
      targetName: charName,
      timestamp: Date.now()
    })
  }
}
</script>

<template>
  <div class="social-app">
    <!-- 主界面 (Main View) - RECONSTRUCTED -->
    <transition name="fade" mode="out-in">
      <div v-if="!activeChat" class="main-view">
        <div class="app-header main-header">
          <span class="header-title main-title" v-if="activeTab === 'chats'">消息</span>
          <span class="header-title main-title" v-else-if="activeTab === 'contacts'">通讯录</span>
          <span class="header-title main-title" v-else-if="activeTab === 'moments'">朋友圈</span>
          <div class="header-actions">
            <!-- 朋友圈发布按钮 -->
            <button v-if="activeTab === 'moments'" class="header-icon-btn" @click="openPostMomentModal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </button>
            <button class="header-icon-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button class="header-icon-btn" @click="showMainActionSheet = true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- 主界面遮罩层 -->
        <div v-if="showMainActionSheet" class="action-mask" @click="showMainActionSheet = false"></div>

        <!-- 主界面加号菜单 -->
        <transition name="slide-up">
          <div v-if="showMainActionSheet" class="action-sheet main-sheet">
            <div class="action-list-vertical">
              <div class="action-list-item" @click="openAddFriendModal(); showMainActionSheet = false">
                <div class="list-item-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                </div>
                <div class="list-item-content">
                  <span class="list-item-title">添加朋友</span>
                  <span class="list-item-desc">搜索并添加新的好友</span>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <div class="app-content">
          <!-- 消息列表 -->
          <div v-if="activeTab === 'chats'" class="chat-list">
            <div v-if="chatSessions.length === 0" class="empty-state">
              <div class="empty-icon">💬</div>
              <span>暂无消息</span>
            </div>
            <div v-for="session in chatSessions" :key="session.id" class="chat-item" @click="openChat(session)">
              <div class="item-avatar-wrapper">
                <div class="item-avatar" :class="activeTab === 'contacts' ? getAvatarGenderClass(session) : ''">
                   <img v-if="isImage(session.avatar)" :src="session.avatar" />
                   <span v-else class="avatar-emoji">{{ session.avatar || '👤' }}</span>
                </div>
                <div v-if="session.unread > 0" class="unread-badge">{{ session.unread }}</div>
              </div>
              <div class="item-info">
                <div class="item-top">
                  <span class="item-name">{{ session.name }}</span>
                  <span class="item-time">{{ session.time }}</span>
                </div>
                <span class="item-msg">{{ session.lastMessage }}</span>
              </div>
            </div>
          </div>

          <!-- 通讯录 -->
          <div v-if="activeTab === 'contacts'" class="contact-list">
            <!-- 系统通知 -->
            <div v-if="systemContacts.length > 0" class="contact-group">
              <div class="group-header" @click="showSystem = !showSystem">
                <span class="arrow-icon" :class="{ expanded: showSystem }">▶</span>
                <span>系统通知</span>
                <span class="group-count">{{ systemContacts.length }}</span>
              </div>
              <div v-if="showSystem" class="group-content">
                <div v-for="contact in systemContacts" :key="contact.id" class="contact-item" @click="openChat({ ...contact, type: 'friend' })">
                  <div class="item-avatar sm">
                    <span class="avatar-emoji">{{ contact.avatar || '🔔' }}</span>
                  </div>
                  <div class="contact-info">
                    <span class="item-name">{{ contact.name }}</span>
                    <span class="item-status online">
                      <span class="status-dot"></span>
                      系统
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 群组 -->
            <div class="contact-group">
              <div class="group-header" @click="showGroups = !showGroups">
                <span class="arrow-icon" :class="{ expanded: showGroups }">▶</span>
                <span>群聊</span>
                <span class="group-count">{{ groups.length }}</span>
              </div>
              <div v-if="showGroups" class="group-content">
                <div v-for="group in groups" :key="group.id" class="contact-item" @click="openChat({ ...group, type: 'group' })">
                  <div class="item-avatar sm">
                    <span class="avatar-emoji">{{ group.avatar || '👥' }}</span>
                  </div>
                  <div class="contact-info">
                    <span class="item-name">{{ group.name }}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 好友 -->
            <div class="contact-group">
              <div class="group-header" @click="showFriends = !showFriends">
                <span class="arrow-icon" :class="{ expanded: showFriends }">▶</span>
                <span>好友</span>
                <span class="group-count">{{ normalContacts.length }}</span>
              </div>
              <div v-if="showFriends" class="group-content">
                <div v-for="friend in normalContacts" :key="friend.id" class="contact-item" @click="openChat({ ...friend, type: 'friend' })">
                  <div class="item-avatar sm" :class="getAvatarGenderClass(friend)">
                    <img v-if="isImage(friend.avatar)" :src="friend.avatar" />
                    <span v-else class="avatar-emoji">{{ friend.avatar || '👤' }}</span>
                  </div>
                  <div class="contact-info">
                    <span class="item-name">{{ friend.name }}</span>
                    <span class="item-status" :class="friend.status || 'offline'">
                      <span class="status-dot"></span>
                      {{ friend.status === 'online' ? '在线' : '离线' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 朋友圈 -->
          <div v-if="activeTab === 'moments'" class="moments-list">
            <div class="moment-cover" :style="{ background: coverStyle }">
              <button class="change-cover-btn" @click="triggerCoverInput">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </button>
              <input type="file" ref="coverInputRef" @change="handleCoverUpload" accept="image/*" style="display: none;">
              <div class="user-info-overlay">
                <span class="user-name">{{ gameStore.player.name }}</span>
                <div class="user-avatar">
                  <img v-if="isImage(gameStore.player.avatar)" :src="gameStore.player.avatar" />
                  <span v-else>{{ gameStore.player.avatar || '👤' }}</span>
                </div>
              </div>
            </div>
            
            <div class="moment-feed">
              <div v-if="moments.length === 0" class="empty-moments">
                暂无动态
              </div>
              <div v-for="moment in moments" :key="moment.id" class="moment-item">
                <div class="moment-avatar" :class="getAvatarGenderClass({ name: moment.name })">
                  <img v-if="isImage(moment.avatar)" :src="moment.avatar" />
                  <span v-else>{{ moment.avatar || '👤' }}</span>
                </div>
                <div class="moment-content">
                  <div class="moment-name">{{ moment.name }}</div>
                  <div class="moment-text">{{ formatText(moment.content) }}</div>
                  
                  <div class="moment-footer">
                    <span class="moment-time">{{ formatMomentTime(moment.timestamp) }}</span>
                    <div class="moment-actions">
                      <button class="action-btn like-btn" :class="{ liked: hasLiked(moment) }" @click="toggleLike(moment)">
                        <svg width="20" height="20" viewBox="0 0 24 24" :fill="hasLiked(moment) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                      </button>
                      <button class="action-btn comment-btn" @click="openCommentModal(moment)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div v-if="(moment.likes && moment.likes.length > 0) || (moment.comments && moment.comments.length > 0)" class="moment-interactions">
                    <div v-if="moment.likes && moment.likes.length > 0" class="likes-list">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="margin-right: 4px;">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                      </svg>
                      {{ moment.likes.map(l => l.name).join(', ') }}
                    </div>
                    <div v-if="moment.comments && moment.comments.length > 0" class="comments-list">
                      <div v-for="comment in moment.comments" :key="comment.id" class="comment-item">
                        <span class="comment-user">{{ comment.name }}:</span>
                        <span class="comment-content">{{ formatText(comment.content) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="tab-bar">
          <div class="tab-item" :class="{ active: activeTab === 'chats' }" @click="activeTab = 'chats'">
            <div class="tab-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <span class="tab-text">消息</span>
          </div>
          <div class="tab-item" :class="{ active: activeTab === 'contacts' }" @click="activeTab = 'contacts'">
            <div class="tab-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <span class="tab-text">通讯录</span>
          </div>
          <div class="tab-item" :class="{ active: activeTab === 'moments' }" @click="activeTab = 'moments'">
            <div class="tab-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <span class="tab-text">朋友圈</span>
          </div>
        </div>
      </div>
    </transition>

    <!-- 聊天详情页 -->
    <transition name="slide-left">
      <div v-if="activeChat" class="chat-detail">
        <div class="app-header">
          <button class="back-btn" @click="closeChat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="header-title">{{ activeChat.name }}</span>
          <button class="menu-btn" @click="toggleMenu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>

        <!-- 群聊菜单 -->
        <transition name="fade-slide">
          <div v-if="showChatMenu && activeChat.type === 'group'" class="chat-menu">
            <div class="menu-members">
              <div v-for="member in currentGroupMembers" :key="member.id" class="menu-member">
                <div class="member-avatar" :class="getAvatarGenderClass(member)">
                  <img v-if="member.avatar && member.avatar.startsWith('http')" :src="member.avatar" />
                  <span v-else class="avatar-icon">{{ member.avatar || '👤' }}</span>
                </div>
                <span class="member-name">{{ member.name }}</span>
              </div>
              <div class="menu-member add-btn-member" @click="openInviteModal">
                <div class="member-avatar plus">
                  <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
                <span class="member-name">邀请</span>
              </div>
            </div>
            <button class="leave-btn" @click="leaveGroup">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              退出群聊
            </button>
          </div>
        </transition>

        <!-- 聊天内容 -->
        <div class="chat-content" ref="chatContentRef">
          <div v-for="msg in currentMessages" :key="msg.id" class="message-row" :class="msg.type">
            <div v-if="msg.type === 'other'" class="avatar-container">
              <template v-if="activeChat.type === 'group' && msg.sender">
                <!-- 群聊显示发送者头像 -->
                <div class="avatar-box" :class="getAvatarGenderClass(getSenderInfo(msg.sender))" :title="msg.sender">
                  <img v-if="getSenderInfo(msg.sender) && isImage(getSenderInfo(msg.sender).avatar)" :src="getSenderInfo(msg.sender).avatar" alt="" />
                  <span v-else class="avatar-emoji">{{ (getSenderInfo(msg.sender) && getSenderInfo(msg.sender).avatar) || '👤' }}</span>
                </div>
              </template>
              <template v-else>
                 <!-- 私聊或无发送者信息，显示当前聊天对象头像 -->
                 <div class="avatar-box">
                  <img v-if="isImage(activeChat.avatar)" :src="activeChat.avatar" alt="" />
                  <span v-else class="avatar-emoji">{{ activeChat.avatar || '👤' }}</span>
                </div>
              </template>
            </div>
            
            <div class="message-content-wrapper">
               <!-- 群聊显示发送者名字 -->
               <div v-if="activeChat.type === 'group' && msg.sender && msg.type === 'other'" class="message-sender-name">
                 {{ msg.sender }}
               </div>
               
               <div class="message-bubble" :class="{ 'media-bubble': parseMessage(msg.content).type !== 'text' }">
                 <!-- 文本消息 -->
                 <span v-if="parseMessage(msg.content).type === 'text'" style="white-space: pre-wrap">{{ formatText(msg.content) }}</span>
                 
                 <!-- 图片消息 -->
                 <div v-else-if="parseMessage(msg.content).type === 'image'" class="media-content image-msg">
                     <div class="media-icon">🖼️</div>
                     <div class="media-info">
                         <div class="media-title">{{ parseMessage(msg.content).name }}</div>
                         <div class="media-desc">{{ parseMessage(msg.content).size }}</div>
                     </div>
                 </div>

                 <!-- 文件消息 -->
                 <div v-else-if="parseMessage(msg.content).type === 'file'" class="media-content file-msg">
                     <div class="media-icon">📄</div>
                     <div class="media-info">
                         <div class="media-title">{{ parseMessage(msg.content).name }}</div>
                         <div class="media-desc">{{ parseMessage(msg.content).size }}</div>
                     </div>
                 </div>

                 <!-- 定位消息 -->
                 <div v-else-if="parseMessage(msg.content).type === 'location'" class="media-content loc-msg">
                     <div class="media-top">
                         <div class="media-title">{{ parseMessage(msg.content).address }}</div>
                         <div class="media-desc">位置信息</div>
                     </div>
                     <div class="media-map-preview">🗺️</div>
                 </div>

                 <!-- 转账消息 -->
                 <div v-else-if="parseMessage(msg.content).type === 'transfer'" class="media-content transfer-msg">
                     <div class="transfer-top">
                         <div class="transfer-icon">¥</div>
                         <div class="transfer-info">
                             <div class="transfer-amount">¥{{ parseMessage(msg.content).amount }}</div>
                             <div class="transfer-note">{{ parseMessage(msg.content).note || '转账给朋友' }}</div>
                         </div>
                     </div>
                     <div class="transfer-bottom">微信转账</div>
                 </div>
              </div>
              
              <!-- 已读/未读状态标识（仅在私聊中最后一条玩家消息下显示） -->
              <div v-if="msg.type === 'self' && isLastSelfMessage(msg) && currentChatReadStatus" class="read-status-indicator" :class="currentChatReadStatus">
                <span v-if="currentChatReadStatus === 'pass'" class="read-label">已读</span>
                <span v-else-if="currentChatReadStatus === 'hold'" class="read-label">未读</span>
              </div>
            </div>
            
            <div v-if="msg.type === 'self'" class="avatar-container">
               <div class="avatar-box self-avatar-box">
                 <img v-if="isImage(gameStore.player.avatar)" :src="gameStore.player.avatar" alt="" />
                 <span v-else class="avatar-emoji">{{ gameStore.player.avatar || '👤' }}</span>
               </div>
            </div>
            
            <!-- 回复按钮 (悬停显示或总是显示) -->
            <div class="msg-actions">
              <button class="msg-action-btn" @click="setReply(msg)" title="回复">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 14L4 9l5-5"/>
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
                </svg>
              </button>
            </div>
          </div>
          <div v-if="currentMessages.length === 0" class="empty-chat">
             <div class="empty-icon">💬</div>
             <span>开始聊天吧</span>
          </div>
        </div>
        
        <!-- 回复引用显示 -->
        <div v-if="replyTarget" class="reply-preview-bar">
          <div class="reply-info">
            <span class="reply-name">回复 {{ replyTarget.senderName }}:</span>
            <span class="reply-text">{{ replyTarget.content }}</span>
          </div>
          <button class="close-reply-btn" @click="cancelReply">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="chat-input-area">
          <button class="icon-btn voice-btn">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
             </svg>
          </button>
          <input v-model="messageInput" @keyup.enter="sendMessage" type="text" placeholder="发消息..." />
          <button class="icon-btn emoji-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
              <line x1="9" y1="9" x2="9.01" y2="9"></line>
              <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
          </button>
          <transition name="scale-fade" mode="out-in">
              <button v-if="messageInput.trim()" key="send" class="send-btn" @click="sendMessage">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
              <button v-else key="more" class="icon-btn more-btn" @click="showActionSheet = !showActionSheet">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <circle cx="12" cy="12" r="10"/>
                   <line x1="12" y1="8" x2="12" y2="16"/>
                   <line x1="8" y1="12" x2="16" y2="12"/>
                 </svg>
              </button>
          </transition>
        </div>

        <!-- 遮罩层，用于点击外部收起 ActionSheet -->
        <div v-if="showActionSheet" class="action-mask" @click="showActionSheet = false"></div>

        <!-- 加号菜单 -->
        <transition name="slide-up">
          <div v-if="showActionSheet" class="action-sheet">
            <div class="action-grid">
              <div class="action-item" @click="openMediaModal('image')">
                <div class="action-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </div>
                <span>图片</span>
              </div>
              <div class="action-item" @click="openMediaModal('file')">
                <div class="action-icon" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                </div>
                <span>文件</span>
              </div>
              <div class="action-item" @click="openMediaModal('location')">
                <div class="action-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
                <span>定位</span>
              </div>
              <div v-if="activeChat.type === 'friend'" class="action-item" @click="openMediaModal('transfer')">
                <div class="action-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
                <span>转账</span>
              </div>
              <div v-if="activeChat.type === 'group' || activeChat.type === 'friend'" class="action-item" @click="openInviteModal">
                <div class="action-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                </div>
                <span>{{ activeChat.type === 'group' ? '邀请' : '发起群聊' }}</span>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>

    <!-- 多媒体发送模态框 -->
    <transition name="fade">
      <div v-if="showMediaModal" class="modal-overlay" @click.self="showMediaModal = false">
        <div class="modal-card">
          <h3 v-if="mediaType === 'image'">发送图片</h3>
          <h3 v-else-if="mediaType === 'file'">发送文件</h3>
          <h3 v-else-if="mediaType === 'location'">发送定位</h3>
          <h3 v-else-if="mediaType === 'transfer'">转账</h3>

          <div class="form-group">
            <template v-if="mediaType === 'image' || mediaType === 'file'">
              <input type="text" v-model="mediaForm.name" :placeholder="mediaType === 'image' ? '图片名称' : '文件名称'" class="moment-textarea" style="margin-bottom: 8px;" />
              <input type="text" v-model="mediaForm.size" placeholder="大小 (如 2MB)" class="moment-textarea" style="margin-bottom: 8px;" />
              <input type="text" v-model="mediaForm.desc" placeholder="描述/备注" class="moment-textarea" />
            </template>

            <template v-else-if="mediaType === 'location'">
              <div class="location-select">
                <input type="text" v-model="mediaForm.location" placeholder="位置名称" class="moment-textarea" />
                <button class="map-btn" @click="selectLocationFromMap">🗺️</button>
              </div>
            </template>

            <template v-else-if="mediaType === 'transfer'">
              <div class="amount-input">
                <span class="currency">¥</span>
                <input type="number" v-model="mediaForm.amount" placeholder="0.00" />
              </div>
              <div style="font-size: 12px; color: #666; margin-top: 4px; margin-bottom: 12px;">
                当前余额: ¥{{ gameStore.player.money }}
              </div>
              <input type="text" v-model="mediaForm.note" placeholder="转账备注" class="moment-textarea" />
            </template>
          </div>

          <div class="modal-actions">
            <button class="cancel-btn" @click="showMediaModal = false">取消</button>
            <button class="confirm-btn" @click="sendMediaMessage">发送</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 邀请好友/选择好友模态框 -->
    <transition name="fade">
      <div v-if="showInviteModal" class="modal-overlay" @click.self="showInviteModal = false">
        <div class="modal-card">
          <h3>{{ activeChat.type === 'group' ? '邀请好友' : '发起群聊' }}</h3>
          
          <!-- 私聊建群时需要输入群名 -->
          <div v-if="activeChat.type === 'friend'" class="form-group" style="margin-bottom: 12px;">
             <input type="text" v-model="newGroupName" placeholder="请输入群聊名称" />
          </div>

          <div class="friend-list-scroll">
            <div v-if="availableFriends.length > 0" class="friend-list-check">
              <div v-for="friend in availableFriends" :key="friend.id" class="friend-check-item">
                <label>
                  <input type="checkbox" :value="friend.id" v-model="selectedFriends">
                  <span class="checkmark"></span>
                  <div class="check-avatar" :class="getAvatarGenderClass(friend)">
                    <img v-if="friend.avatar && friend.avatar.startsWith('http')" :src="friend.avatar" />
                    <span v-else>{{ friend.avatar || '👤' }}</span>
                  </div>
                  <span class="check-name">{{ friend.name }}</span>
                </label>
              </div>
            </div>
            <div v-else class="no-friends">
              <span>没有可邀请的好友</span>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="showInviteModal = false">取消</button>
            <button class="confirm-btn" @click="inviteFriends" 
              :disabled="selectedFriends.length === 0 || (activeChat.type === 'friend' && !newGroupName.trim())">
              确定
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 发布朋友圈模态框 -->
    <transition name="fade">
      <div v-if="showPostMomentModal" class="modal-overlay" @click.self="showPostMomentModal = false">
        <div class="modal-card">
          <h3>发布动态</h3>
          <div class="form-group">
            <textarea 
              v-model="momentContent" 
              placeholder="分享新鲜事..." 
              rows="4" 
              class="moment-textarea"
            ></textarea>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="showPostMomentModal = false" :disabled="isPostingMoment">取消</button>
            <button class="confirm-btn" @click="postMoment" :disabled="!momentContent.trim() || isPostingMoment">
              {{ isPostingMoment ? '发布中...' : '发布' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 评论模态框 -->
    <transition name="fade">
      <div v-if="showCommentModal" class="modal-overlay" @click.self="showCommentModal = false">
        <div class="modal-card">
          <h3>评论</h3>
          <div class="form-group">
            <textarea 
              v-model="commentContent" 
              placeholder="写下你的评论..." 
              rows="3" 
              class="moment-textarea"
            ></textarea>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="showCommentModal = false">取消</button>
            <button class="confirm-btn" @click="postComment" :disabled="!commentContent.trim()">发送</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 添加好友模态框 -->
    <transition name="fade">
      <div v-if="showAddFriendModal" class="modal-overlay" @click.self="showAddFriendModal = false">
        <div class="modal-card add-friend-card">
          <h3>添加朋友</h3>
          <div class="search-box">
            <div class="search-icon">🔍</div>
            <input 
              type="text" 
              v-model="searchKeyword" 
              @input="performSearch" 
              placeholder="输入角色名搜索" 
              class="search-input"
            />
          </div>
          
          <div class="search-results">
            <div v-if="searchResults.length === 0 && searchKeyword" class="empty-results">
              未找到相关角色
            </div>
            <div v-for="name in searchResults" :key="name" class="result-item">
              <div class="result-info">
                <div class="result-avatar" :class="getAvatarGenderClass({ name })">
                  <span>{{ '👤' }}</span>
                </div>
                <span class="result-name">{{ name }}</span>
              </div>
              <button 
                class="add-btn" 
                :class="{ disabled: checkIsRequested(name) }"
                @click="handleSendFriendRequest(name)"
                :disabled="checkIsRequested(name)"
              >
                {{ checkIsRequested(name) ? '已申请' : '添加' }}
              </button>
            </div>
          </div>
          
          <div class="modal-actions">
            <button class="cancel-btn" @click="showAddFriendModal = false">关闭</button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
/* ==================== CSS 变量与主题 ==================== */
.social-app {
  --primary: #07c160;
  --primary-dark: #06ad56;
  --primary-light: rgba(7, 193, 96, 0.1);
  --bg-primary: #ededed;
  --bg-secondary: #f7f7f7;
  --bg-card: #ffffff;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --border-color: rgba(0, 0, 0, 0.05);
  --bubble-self: #95ec69;
  --bubble-other: #ffffff;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  
  width: 100%;
  height: 100%;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow: hidden;
  color: var(--text-primary);
  position: relative;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

/* ==================== 主视图与聊天详情 - Flexbox 布局 ==================== */
.main-view, .chat-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  background: var(--bg-primary);
}

/* ==================== 头部 Header ==================== */
.app-header {
  height: 48px;
  min-height: 48px;
  background: rgba(237, 237, 237, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  flex-shrink: 0;
  z-index: 20;
}

.main-header {
  justify-content: space-between;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  text-align: center;
}

.main-title {
  text-align: left;
  padding-left: 4px;
}

.back-btn, .menu-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  border-radius: 50%;
  transition: background 0.2s;
  background: transparent;
  border: none;
}

.back-btn:active, .menu-btn:active {
  background: rgba(0,0,0,0.05);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  border-radius: 50%;
  transition: background 0.2s;
  background: transparent;
  border: none;
}

.header-icon-btn:active {
  background: rgba(0,0,0,0.05);
}

/* ==================== 内容区域 ==================== */
.app-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* 隐藏滚动条 */
.app-content::-webkit-scrollbar,
.chat-content::-webkit-scrollbar,
.friend-list-scroll::-webkit-scrollbar,
.moments-list::-webkit-scrollbar {
  display: none;
  width: 0;
}

.app-content,
.chat-content,
.friend-list-scroll,
.moments-list {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* ==================== 底部导航 Tab Bar ==================== */
.tab-bar {
  height: 56px;
  min-height: 56px;
  background: rgba(247, 247, 247, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid var(--border-color);
  display: flex;
  flex-shrink: 0;
  z-index: 30;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-tertiary);
  transition: color 0.2s;
  cursor: pointer;
}

.tab-item:active {
  opacity: 0.7;
}

.tab-item.active {
  color: var(--primary);
}

.tab-item.active .tab-icon svg {
  fill: var(--primary);
  stroke: var(--primary);
}

.tab-icon {
  width: 24px;
  height: 24px;
}

.tab-icon svg {
  width: 100%;
  height: 100%;
}

.tab-text {
  font-size: 10px;
  font-weight: 500;
}

/* ==================== 消息列表 ==================== */
.chat-list {
  padding-bottom: 20px;
}

.chat-item {
  display: flex;
  padding: 12px 16px;
  background: var(--bg-card);
  border-bottom: 0.5px solid var(--border-color);
  align-items: center;
  transition: background-color 0.15s;
  cursor: pointer;
}

.chat-item:active {
  background: #f0f0f0;
}

.item-avatar-wrapper {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.item-avatar {
  width: 48px;
  height: 48px;
  background: white;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.item-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-avatar .avatar-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 性别区分的头像样式 */
.item-avatar.avatar-male .avatar-emoji,
.avatar-box.avatar-male .avatar-emoji,
.moment-avatar.avatar-male span,
.member-avatar.avatar-male span,
.check-avatar.avatar-male {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.item-avatar.avatar-female .avatar-emoji,
.avatar-box.avatar-female .avatar-emoji,
.moment-avatar.avatar-female span,
.member-avatar.avatar-female span,
.check-avatar.avatar-female {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

/* 默认头像（未知性别）- 现代紫蓝渐变 */
.item-avatar.avatar-default .avatar-emoji,
.avatar-box.avatar-default .avatar-emoji,
.moment-avatar.avatar-default span,
.member-avatar.avatar-default span,
.check-avatar.avatar-default {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.item-avatar.sm {
  width: 40px;
  height: 40px;
  font-size: 22px;
  margin-right: 12px;
}

.item-avatar.sm .avatar-emoji {
  font-size: 22px;
}

.unread-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ff3b30;
  color: white;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(255, 59, 48, 0.3);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.item-name {
  font-weight: 500;
  font-size: 16px;
  color: var(--text-primary);
}

.item-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.item-msg {
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.empty-state, .empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
  gap: 12px;
}

/* 主界面菜单样式 */
.main-sheet {
  padding: 0;
  background: var(--bg-card);
  bottom: 56px; /* TabBar 高度 */
}

.action-list-vertical {
  display: flex;
  flex-direction: column;
}

.action-list-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 0.5px solid var(--border-color);
  cursor: pointer;
  transition: background 0.2s;
}

.action-list-item:active {
  background: var(--bg-secondary);
}

.list-item-icon {
  width: 24px;
  height: 24px;
  margin-right: 16px;
  color: var(--text-primary);
}

.list-item-content {
  display: flex;
  flex-direction: column;
}

.list-item-title {
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 500;
}

.list-item-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* 添加好友模态框 */
.add-friend-card {
  max-height: 500px;
  display: flex;
  flex-direction: column;
}

.search-box {
  display: flex;
  align-items: center;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 16px;
}

.search-icon {
  margin-right: 8px;
  font-size: 14px;
  color: var(--text-tertiary);
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 15px;
  color: var(--text-primary);
  outline: none;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
}

.empty-results {
  text-align: center;
  color: var(--text-tertiary);
  padding: 20px;
  font-size: 14px;
}

.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--border-color);
}

.result-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
}

.result-avatar.avatar-male {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.result-avatar.avatar-female {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.result-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.add-btn {
  padding: 6px 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.add-btn:active {
  background: #e0e0e0;
}

.add-btn.disabled {
  opacity: 0.6;
  cursor: default;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

/* ==================== 联系人列表 ==================== */
.contact-list {
  padding-bottom: 20px;
}

.contact-group {
  margin-bottom: 1px;
}

.group-header {
  padding: 10px 16px;
  background: var(--bg-secondary);
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 10;
}

.arrow-icon {
  transition: transform 0.2s;
  color: var(--text-tertiary);
}

.arrow-icon.expanded {
  transform: rotate(90deg);
}

.group-count {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 12px;
}

.group-content {
  background: var(--bg-card);
}

.contact-item {
  display: flex;
  padding: 12px 16px;
  align-items: center;
  border-bottom: 0.5px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.contact-item:active {
  background: #f0f0f0;
}

.contact-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-status {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ccc;
}

.item-status.online {
  color: var(--primary);
}

.item-status.online .status-dot {
  background: var(--primary);
}

.item-status.offline {
  color: var(--text-tertiary);
}

/* ==================== 朋友圈 ==================== */
.moments-list {
  overflow-y: auto;
}

.moment-cover {
  height: 280px;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%), 
              url('https://files.catbox.moe/kxz1kx.jpg') center/cover no-repeat;
  position: relative;
}

.change-cover-btn {
  position: absolute;
  bottom: 20px;
  left: 16px;
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.4);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.change-cover-btn:hover {
  background: rgba(0, 0, 0, 0.6);
}

.change-cover-btn:active {
  transform: scale(0.95);
}

.user-info-overlay {
  position: absolute;
  bottom: 20px;
  right: 16px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.user-name {
  font-size: 18px;
  color: white;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  margin-bottom: 8px;
}

.user-avatar {
  width: 68px;
  height: 68px;
  border-radius: var(--radius-md);
  background: white;
  padding: 2px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
}

.user-avatar span {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  font-size: 32px;
  background: #f0f0f0;
  border-radius: 10px;
}

.moment-feed {
  padding: 16px;
  padding-bottom: 80px;
  background: var(--bg-primary);
}

.moment-item {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  box-shadow: var(--shadow-sm);
}

.moment-avatar {
  width: 44px;
  height: 44px;
  background: white;
  border-radius: var(--radius-sm);
  margin-right: 12px;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.moment-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-avatar span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 24px;
  /* 背景色由上层 class 控制，移除默认背景 */
}

.moment-content {
  flex: 1;
  min-width: 0;
}

.moment-name {
  color: #576b95;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 6px;
}

.moment-text {
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-primary);
  margin-bottom: 8px;
  white-space: pre-wrap;
}

.moment-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tag {
  font-size: 12px;
  color: #576b95;
  background: rgba(87, 107, 149, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.moment-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.moment-time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.moment-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-radius: 50%;
  transition: all 0.2s;
  background: transparent;
  border: none;
}

.action-btn:active {
  background: rgba(0,0,0,0.05);
}

.like-btn:active, .like-btn.liked {
  color: #ff3b30;
}

.moment-interactions {
  background: #f7f7f7;
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
  font-size: 13px;
}

.likes-list {
  color: #576b95;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.likes-list svg {
  fill: #576b95;
  stroke: none;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-user {
  color: #576b95;
  font-weight: 500;
  margin-right: 4px;
}

.comment-content {
  color: var(--text-primary);
  white-space: pre-wrap;
}

.empty-moments {
  text-align: center;
  padding: 40px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}

/* 夜间模式下的操作按钮 - 确保透明背景 */
:global(body.dark-mode) .action-btn {
  background: transparent !important;
  color: var(--text-tertiary);
}

:global(body.dark-mode) .action-btn:active {
  background: rgba(255,255,255,0.1) !important;
}

/* 夜间模式下的顶部按钮 */
:global(body.dark-mode) .back-btn,
:global(body.dark-mode) .menu-btn,
:global(body.dark-mode) .header-icon-btn {
  background: transparent !important;
  color: var(--text-primary) !important;
}

:global(body.dark-mode) .back-btn:active,
:global(body.dark-mode) .menu-btn:active,
:global(body.dark-mode) .header-icon-btn:active {
  background: rgba(255,255,255,0.1) !important;
}

/* 夜间模式下的聊天输入框按钮 */
:global(body.dark-mode) .icon-btn {
  background: transparent !important;
  color: var(--text-secondary) !important;
}

:global(body.dark-mode) .icon-btn:active {
  background: rgba(255,255,255,0.1) !important;
}

/* ==================== 聊天详情 ==================== */
.chat-detail {
  z-index: 10;
}

.chat-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f3f3f3;
  -webkit-overflow-scrolling: touch;
}

.message-row {
  display: flex;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message-row.self {
  justify-content: flex-end;
}

.avatar-container {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.message-row.other .avatar-container {
  margin-right: 10px;
}

.message-row.self .avatar-container {
  margin-left: 10px;
}

.avatar {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #e8e8e8 0%, #d8d8d8 100%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar span {
  display: flex;
  align-items: center;
  justify-content: center;
}

.self-avatar {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
}

/* 新的头像框样式 - 统一图片和 emoji 显示 */
.avatar-box {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background: white;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.avatar-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.msg-actions {
  display: flex;
  align-items: center;
  padding: 0 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-row:hover .msg-actions {
  opacity: 1;
}

.msg-action-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.msg-action-btn:hover {
  background: #f0f0f0;
  color: var(--primary);
}

/* 移动端总是显示回复按钮，或者放在气泡旁边 */
@media (max-width: 768px) {
  .msg-actions {
    opacity: 1; /* 移动端总是可见 */
  }
}

.reply-preview-bar {
  background: var(--bg-secondary);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 0.5px solid var(--border-color);
  font-size: 13px;
}

.reply-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-left: 8px;
  border-left: 3px solid var(--primary);
}

.reply-name {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.reply-text {
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-reply-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  padding: 4px;
  cursor: pointer;
  display: flex;
}

.avatar-box .avatar-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 22px;
  background: linear-gradient(135deg, #e8e8e8 0%, #d8d8d8 100%);
}

.self-avatar-box .avatar-emoji {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 6px;
  max-width: 70%;
  font-size: 15px;
  line-height: 1.5;
  position: relative;
  word-wrap: break-word;
  box-shadow: var(--shadow-sm);
  background-color: var(--bubble-other);
}

.message-row.self .message-bubble {
  background-color: var(--bubble-self);
}

/* 气泡小三角 */
.message-bubble::before {
  content: "";
  position: absolute;
  top: 12px;
  width: 0;
  height: 0;
  border-style: solid;
}

.message-row.other .message-bubble::before {
  left: -6px;
  border-width: 5px 6px 5px 0;
  border-color: transparent var(--bubble-other) transparent transparent;
}

.message-row.self .message-bubble:not(.media-bubble)::before {
  right: -6px;
  border-width: 5px 0 5px 6px;
  border-color: transparent transparent transparent var(--bubble-self);
}

.message-bubble.media-bubble {
  padding: 0;
  overflow: hidden;
  background: white;
  max-width: 240px;
}

.message-bubble.media-bubble::before {
  display: none;
}

.message-content-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.message-sender-name {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 2px;
  margin-left: 2px;
}

.message-row.self .message-content-wrapper {
  align-items: flex-end;
}

.message-row .message-bubble {
  max-width: 100%; /* wrapper 已经控制了宽度 */
}

/* 媒体内容样式 */
.media-content {
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 10px;
}

.image-msg .media-icon, .file-msg .media-icon {
  font-size: 36px;
}

.media-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.media-title {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* 定位样式 */
.loc-msg {
  flex-direction: column;
  align-items: stretch;
  padding: 0;
}

.loc-msg .media-top {
  padding: 12px;
}

.media-map-preview {
  width: 100%;
  height: 100px;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}

/* 转账样式 */
.transfer-msg {
  flex-direction: column;
  padding: 0;
  background: linear-gradient(135deg, #fa9d3b 0%, #f7b733 100%) !important;
  color: white;
}

.transfer-top {
  display: flex;
  padding: 16px;
  align-items: center;
}

.transfer-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 600;
  margin-right: 12px;
}

.transfer-amount {
  font-size: 20px;
  font-weight: 600;
}

.transfer-note {
  font-size: 13px;
  opacity: 0.9;
  margin-top: 2px;
}

.transfer-bottom {
  background: rgba(0,0,0,0.1);
  padding: 8px 16px;
  font-size: 12px;
  opacity: 0.8;
}

/* ==================== 聊天输入框 ==================== */
.chat-input-area {
  min-height: 56px;
  background: var(--bg-secondary);
  border-top: 0.5px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 8px 10px;
  gap: 8px;
  flex-shrink: 0;
  z-index: 30;
}

.chat-input-area input {
  flex: 1;
  width: 0; /* 关键：允许 input 缩小以适应 flex 容器 */
  height: 36px;
  border: none;
  border-radius: 4px;
  padding: 0 12px;
  background: var(--bg-card);
  font-size: 16px;
  color: var(--text-primary);
}

.chat-input-area input::placeholder {
  color: var(--text-tertiary);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  border-radius: 50%;
  transition: all 0.2s;
  flex-shrink: 0;
  background: transparent;
  border: none;
}

.icon-btn:active {
  background: rgba(0,0,0,0.05);
}

.send-btn {
  width: 36px;
  height: 36px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn:active {
  background: var(--primary-dark);
  transform: scale(0.95);
}

/* ==================== 群聊菜单 ==================== */
.chat-menu {
  position: absolute;
  top: 48px;
  right: 0;
  left: 0;
  background: var(--bg-card);
  z-index: 25;
  padding: 20px 16px;
  box-shadow: var(--shadow-lg);
}

.menu-members {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  max-height: 300px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px; /* 避免滚动条遮挡 */
}

/* 自定义滚动条 */
.menu-members::-webkit-scrollbar {
  width: 4px;
  display: block;
}

.menu-members::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.1);
  border-radius: 2px;
}

.menu-member {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.member-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  /* 移除默认背景，由 class 控制 */
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-avatar.plus {
  border: 1.5px dashed #ccc;
  background: transparent;
  color: #999;
  cursor: pointer;
}

.member-name {
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  width: 100%;
  text-overflow: ellipsis;
}

.leave-btn {
  width: 100%;
  padding: 14px;
  background: var(--bg-secondary);
  color: #ff3b30;
  font-size: 15px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s;
  border: none;
}

.leave-btn:active {
  background: #f0f0f0;
}

/* ==================== 加号菜单 ==================== */
.action-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
}

.action-sheet {
  position: absolute;
  bottom: 56px;
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  padding: 20px 16px 24px;
  z-index: 50;
  border-top: 0.5px solid var(--border-color);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px 12px;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.action-item span {
  font-size: 12px;
  color: var(--text-secondary);
}

.action-icon {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s;
}

.action-item:active .action-icon {
  transform: scale(0.95);
}

/* ==================== 模态框 ==================== */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.modal-card {
  width: 85%;
  max-width: 320px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px 20px;
  box-shadow: var(--shadow-lg);
  animation: modal-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes modal-pop {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-card h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  text-align: center;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.modal-actions button {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s;
}

.cancel-btn {
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.cancel-btn:active {
  background: #e5e5e5;
}

.confirm-btn {
  background: var(--primary);
  color: white;
}

.confirm-btn:active {
  background: var(--primary-dark);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.friend-list-scroll {
  max-height: 240px;
  overflow-y: auto;
}

.friend-check-item {
  padding: 12px 0;
  border-bottom: 0.5px solid var(--border-color);
}

.friend-check-item:last-child {
  border-bottom: none;
}

.friend-check-item label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.friend-check-item input[type="checkbox"] {
  display: none;
}

.checkmark {
  width: 22px;
  height: 22px;
  border: 2px solid #ddd;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.friend-check-item input:checked + .checkmark {
  background: var(--primary);
  border-color: var(--primary);
}

.friend-check-item input:checked + .checkmark::after {
  content: '✓';
  color: white;
  font-size: 12px;
  font-weight: 600;
}

.check-avatar {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #e8e8e8 0%, #d8d8d8 100%); /* 默认背景 */
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.check-name {
  font-size: 15px;
  color: var(--text-primary);
}

.no-friends {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 20px;
  color: var(--text-tertiary);
  gap: 8px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-wrapper {
  position: relative;
}

.input-wrapper input,
.form-group input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  font-size: 15px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.input-wrapper input:focus,
.form-group input:focus {
  border-color: var(--primary);
  outline: none;
}

.moment-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  font-size: 15px;
  resize: none;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.moment-textarea:focus {
  border-color: var(--primary);
  outline: none;
}

.amount-input {
  display: flex;
  align-items: center;
}

.amount-input .currency {
  position: absolute;
  left: 14px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.amount-input input {
  padding-left: 32px;
  font-size: 20px;
  font-weight: 500;
}

.location-select {
  display: flex;
  gap: 8px;
}

.location-select input {
  flex: 1;
}

.map-btn {
  width: 44px;
  height: 44px;
  background: var(--primary);
  color: white;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.map-btn:active {
  background: var(--primary-dark);
}

/* ==================== 动画 ==================== */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
}

.slide-left-leave-to {
  transform: translateX(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.scale-fade-enter-active,
.scale-fade-leave-active {
  transition: all 0.15s ease;
}

.scale-fade-enter-from,
.scale-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.list-enter-active,
.list-leave-active {
  transition: all 0.25s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.list-leave-to {
  opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* ==================== 统一头像样式 (放在最后以保证优先级) ==================== */

/* 默认头像样式 (紫色系) */
.item-avatar .avatar-emoji,
.avatar-box .avatar-emoji,
.moment-avatar span,
.member-avatar .avatar-icon,
.check-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* 男性头像样式 (蓝色系) */
.item-avatar.avatar-male .avatar-emoji,
.avatar-box.avatar-male .avatar-emoji,
.moment-avatar.avatar-male span,
.member-avatar.avatar-male .avatar-icon,
.check-avatar.avatar-male {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

/* 女性头像样式 (粉色系) */
.item-avatar.avatar-female .avatar-emoji,
.avatar-box.avatar-female .avatar-emoji,
.moment-avatar.avatar-female span,
.member-avatar.avatar-female .avatar-icon,
.check-avatar.avatar-female {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

/* ==================== 已读/未读状态标识 ==================== */
.read-status-indicator {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
  padding-right: 2px;
}

.read-status-indicator .read-label {
  font-size: 11px;
  font-weight: 500;
}

.read-status-indicator.pass .read-label {
  color: #576b95;
}

.read-status-indicator.hold .read-label {
  color: var(--text-tertiary);
}
</style>
