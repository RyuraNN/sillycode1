/**
 * GameStore 类型定义
 * 从 gameStore.ts 中拆分出来的所有接口和类型
 */

// ==================== 聊天与存档相关 ====================

/** 聊天日志条目 */
export interface ChatLogEntry {
  type: 'player' | 'ai'
  content: string
  snapshot?: GameStateData // 该消息产生时的游戏状态快照
  preVariableSnapshot?: GameStateData // 应用变量前的快照（用于重Roll）
  rawContent?: string // 原始回复内容（用于重Roll）
}

/** 存档快照 */
export interface SaveSnapshot {
  id: string                    // 唯一标识符 (时间戳)
  timestamp: number             // 保存时间
  label: string                 // 用户可编辑的标签
  messageIndex: number          // 对应的聊天楼层索引
  gameState?: GameStateData     // [可选] 完整的 gameStore 状态快照
  chatLog?: ChatLogEntry[]      // [可选] 到该楼层为止的聊天历史
  // 元数据（用于列表显示）
  gameTime?: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
  }
  location?: string
}

/** 纯游戏状态数据（不含快照，用于存档） */
export interface GameStateData {
  player: PlayerStats
  npcs: NpcStats[]
  npcRelationships: Record<string, NpcFullData>
  gameTime: {
    year: number
    month: number
    day: number
    weekday: string
    hour: number
    minute: number
  }
  settings: {
    difficulty: 'easy' | 'normal' | 'hard'
    bgmVolume: number
    titleFont: string
    bodyFont: string
    darkMode: boolean
  }
  worldState: any
  allClassData: any
}

// ==================== 物品与装备相关 ====================

/** 物品接口（扩展版） */
export interface Item {
  id: string
  name: string
  description: string
  type: 'consumable' | 'book' | 'clothing' | 'key_item' | 'misc' | 'gift' | 'entertainment' | 'exercise' | 'daily'
  effect?: string
  count: number
  category?: string
  durability?: number
  maxDurability?: number
  effectDuration?: number | string
  effects?: Array<{ attribute: string; value: number; isPercentage: boolean }>
  productData?: any
}

/** 待送达订单 */
export interface PendingDelivery {
  id: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    product: any
  }>
  total: number
  orderTime: {
    year: number
    month: number
    day: number
    hour: number
  }
  deliveryTime: {
    day: number
    hour: number
  }
  status: 'pending' | 'delivered'
}

/** 装备槽位 */
export interface EquipmentSlots {
  hat: Item | null
  outer: Item | null
  inner: Item | null
  pants: Item | null
  socks: Item | null
  shoes: Item | null
  accessory: Item | null
}

/** 活动效果（临时buff/debuff） */
export interface ActiveEffect {
  id: string
  name: string
  source: string
  sourceType: 'item' | 'equipment' | 'event'
  effectType: 'stat' | 'expBonus' | 'recoveryBonus' | 'efficiencyBonus' | 'resistance' | 'modifier'
  attribute: string
  value: number
  isPercentage: boolean
  turnsRemaining: number
  startTime: { year: number; month: number; day: number; hour: number }
}

/** 商品库存数据 */
export interface ProductStock {
  [productId: string]: {
    currentStock: number
    lastRestockDate: string
  }
}

// ==================== 总结系统相关 ====================

/** 总结数据 */
export interface SummaryData {
  floor: number
  type: 'minor' | 'major' | 'super'
  content: string
  coveredFloors: number[]
  timestamp: number
}

/** 总结系统设置 */
export interface SummarySystemSettings {
  enabled: boolean
  minorSummaryStartFloor: number
  majorSummaryStartFloor: number
  minorCountForMajor: number
  majorCountForSuper: number
  useAssistantForSummary?: boolean
}

// ==================== 玩家相关 ====================

/** 玩家属性 */
export interface PlayerStats {
  name: string
  characterFeature: string
  backgroundStory: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  exp: number
  gold: number
  money: number
  avatar: string
  freePoints: number
  totalExp: number
  
  attributes: {
    iq: number
    eq: number
    physique: number
    flexibility: number
    charm: number
    mood: number
  }
  
  potentials: {
    iq: number
    eq: number
    physique: number
    flexibility: number
    charm: number
    mood: number
  }

  subjects: {
    literature: number
    math: number
    english: number
    humanities: number
    sciences: number
    art: number
    sports: number
  }

  skills: {
    programming: number
    painting: number
    guitar: number
    piano: number
    urbanLegend: number
    cooking: number
    hacking: number
    socialMedia: number
    photography: number
    videoEditing: number
  }

  inventory: Item[]
  talents: string[]
  joinedClubs: string[]
  flags: Record<string, boolean>
  subjectExps: Record<string, number>
  skillExps: Record<string, number>
  classRoster: any
  classId: string
  schedule: any
  selectedElectives: string[]
  electivesLockedForTerm: number | null
  location: string
  pendingCommands: CommandEntry[]
  holdMessages: CommandEntry[]
  social: {
    friends: Friend[]
    groups: Group[]
    moments: Moment[]
  }
  customCalendarEvents: CalendarEvent[]
  forum: ForumData
  activeEvents: ActiveEvent[]
  eventHistory: string[]
  scheduledEvents: ScheduledEvent[]
  health: number
  relationships: {
    hasLover: boolean
    friendCount: number
    bestFriendCount: number
    rivalCount: number
  }
  currentGoal: string
  newGameGuideTurns: number
  pendingDeliveries: PendingDelivery[]
  equipment: EquipmentSlots
  activeEffects: ActiveEffect[]
  productStock: ProductStock
  summaries: SummaryData[]
  partTimeJob: {
    currentJob: string | null
    isWorking: boolean
    workStartTime: number | null
    totalEarnings: number
    history: Array<{
      locationId: string
      jobName: string
      jobDescription: string
      startDate: string
      endDate: string | null
    }>
    lastWorkInfo: {
      jobName: string
      duration: number
      earnings: number
      turnsRemaining: number
    } | null
  }
}

// ==================== 日历与事件相关 ====================

/** 自定义日历事件 */
export interface CalendarEvent {
  id: string
  date: string
  name: string
  description?: string
  isRecurring?: boolean
  createdAt: number
}

/** 活动事件 */
export interface ActiveEvent {
  id: string
  name: string
  type: string
  description: string
  startDay: number
  duration: number
  isGhost: boolean
  playerInvolved: boolean
  promptTurns: number
}

/** 事件检查时间戳 */
export interface EventChecks {
  lastDaily: string
  lastWeekly: string
  lastMonthly: string
}

/** 预定事件 */
export interface ScheduledEvent {
  eventId: string
  scheduledDate: {
    year: number
    month: number
    day: number
  }
  event: any
}

// ==================== 论坛相关 ====================

/** 论坛帖子 */
export interface ForumPost {
  id: string
  board: string
  title: string
  author: string
  isPinned: boolean
  content: string
  replies: Array<{
    author: string
    content: string
  }>
  timestamp: number
  floor: number
  likes: string[]
}

/** 论坛指令 */
export interface ForumCommand {
  id: number | string
  type: 'post' | 'reply' | 'like'
  post?: ForumPost
  reply?: {
    postId: string
    author: string
    content: string
  }
  postId?: string
  turnsRemaining?: number
}

/** 论坛数据 */
export interface ForumData {
  posts: ForumPost[]
  pendingCommands: ForumCommand[]
}

// ==================== 指令与社交相关 ====================

/** 指令条目 */
export interface CommandEntry {
  id: number | string
  text: string
  type?: 'social_msg' | 'other' | 'item_use'
  metadata?: any
  rollbackData?: any
}

/** 社交消息 */
export interface ChatMessage {
  id: number
  type: 'self' | 'other'
  sender?: string
  content: string
  time: string
  floor: number
}

/** 朋友圈动态 */
export interface Moment {
  id: string
  userId: string
  name: string
  avatar: string
  content: string
  images: string[]
  time: string
  timestamp: number
  likes: Array<{ userId: string; name: string }>
  comments: Array<{ id: string; userId: string; name: string; content: string; time: string }>
}

/** 好友 */
export interface Friend {
  id: string
  name: string
  avatar: string
  signature: string
  gender?: 'male' | 'female'
  status?: 'online' | 'offline' | 'busy'
  lastMessage?: string
  lastMessageTime?: string
  unreadCount?: number
  messages?: ChatMessage[]
}

/** 群组 */
export interface Group {
  id: string
  name: string
  avatar: string
  members: string[]
  announcement: string
  lastMessage?: string
  lastMessageTime?: string
  unreadCount?: number
  messages?: ChatMessage[]
}

// ==================== NPC 相关 ====================

/** NPC 心情类型 */
export type NpcMoodType = 'happy' | 'sad' | 'stressed' | 'energetic' | 'tired' | 'angry' | 'romantic' | 'neutral'

/** NPC 属性 */
export interface NpcStats {
  id: string
  name: string
  gender?: 'male' | 'female'
  relationship: number
  isAlive: boolean
  location: string
  role?: 'student' | 'teacher' | 'other'
  mood?: NpcMoodType
  moodReason?: string
  moodDuration?: number
  forcedLocation?: {
    locationId: string
    endTime: number // 绝对时间戳 (total hours)
  }
}

/** 社团数据 */
export interface ClubData {
  id: string
  name: string
  advisor?: string
  president?: string
  vicePresident?: string
  members: string[]
  coreSkill?: string
  activityDay?: string
  location?: string
  description?: string
  activity?: number
  completedRequests?: number
  _bookName?: string
  _entryName?: string
  _strategy?: any
}

/** NPC 关系数据 */
export interface RelationshipData {
  intimacy: number
  trust: number
  passion: number
  hostility: number
  groups: string[]
  tags: string[]
  events: Array<{
    timestamp: number
    type: string
    description: string
    impact: any
  }>
}

/** NPC 完整数据（包含性格、目标、优先级和关系） */
export interface NpcFullData {
  personality: {
    order: number
    altruism: number
    tradition: number
    peace: number
  }
  goals: {
    immediate: string
    shortTerm: string
    longTerm: string
  }
  priorities: {
    academics: number
    social: number
    hobbies: number
    survival: number
    club: number
  }
  relations: Record<string, RelationshipData>
}

// ==================== 全局游戏状态 ====================

/** 全局游戏状态（包含存档快照） */
export interface GameState {
  player: PlayerStats
  npcs: NpcStats[]
  npcRelationships: Record<string, NpcFullData>
  gameTime: {
    year: number
    month: number
    day: number
    weekday: string
    hour: number
    minute: number
  }
  settings: {
    difficulty: 'easy' | 'normal' | 'hard'
    bgmVolume: number
    titleFont: string
    bodyFont: string
    darkMode: boolean
    streamResponse: boolean
    socialHistoryLimit: number
    forumWorldbookLimit: number
    customRegexList: Array<{ id: string; pattern: string; enabled: boolean }>
    customContentTags: string[]
    assistantAI: {
      enabled: boolean
      apiUrl: string
      apiKey: string
      model: string
      temperature: number
    }
    summarySystem: SummarySystemSettings
    suggestedReplies: boolean
    enterToSend: boolean
    independentImageGeneration: boolean
    imageGenerationPrompt: string
    imageContextDepth: number
    customImageAnalysisPrompt: string
    debugMode: boolean
    debugUnlocked: boolean
    snapshotLimit: number
  }
  saveSnapshots: SaveSnapshot[]
  currentChatLog: ChatLogEntry[]
  pendingRestoreLog: ChatLogEntry[] | null
  allClassData: any
  allClubs: Record<string, ClubData>
  clubApplication: {
    clubId: string
    clubName: string
    remainingTurns: number
  } | null
  clubRejection: {
    clubName: string
    from: string
    reason: string
  } | null
  currentRunId: string
  currentFloor: number
  mapSelectionMode: boolean
  mapSelectionCallback: ((location: string) => void) | null
  eventLibrary: Map<string, any>
  eventTriggers: Array<any>
  eventChecks: EventChecks
  customCoursePool: any | null
  worldState: {
    economy: number
    weather: {
      current: {
        weather: string
        weatherName: string
        icon: string
        temperature: number
        tempHigh: number
        tempLow: number
      }
      forecast: Array<{
        date: string
        year: number
        month: number
        day: number
        weekday: string
        weather: string
        weatherName: string
        icon: string
        category: string
        tempHigh: number
        tempLow: number
        hourly?: Array<{
          time: string
          weather: string
          weatherName: string
          icon: string
          temp: number
        }>
      }>
      lastUpdateDate: string
      season: string
      previousHour: number
      lastChangeInfo: any
    }
  }
}
