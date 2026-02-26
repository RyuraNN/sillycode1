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
  cardEdition?: string    // 'elyrene' | 'original' | 'unknown'
  gameVersion?: string    // e.g. 'V2.4EX'
}

/** 纯游戏状态数据（不含快照，用于存档） */
export interface GameStateData {
  player: PlayerStats
  npcs: NpcStats[]
  npcRelationships: Record<string, NpcFullData>
  graduatedNpcs?: GraduatedNpc[]
  lastAcademicYear?: number
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
  allClubs?: Record<string, ClubData>
  currentRunId?: string
  currentFloor?: number
  // 学业系统
  examHistory?: ExamRecord[]
  lastExamDate?: string | null
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
    year?: number
    month?: number
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

/** 衣着槽位描述（文本） */
export interface OutfitSlots {
  hat?: string
  outer?: string
  inner?: string
  pants?: string
  socks?: string
  shoes?: string
  accessory?: string
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
  type: 'minor' | 'major' | 'super' | 'diary'  // diary: 每日日记，保留 major/super 兼容旧数据
  content: string
  coveredFloors: number[]
  timestamp: number
  gameDate?: string  // 'YYYY-MM-DD' 格式，diary 必填，minor 建议填
  keywords?: string[]        // 提取的关键词（人物名、地点名）
  embedding?: number[]       // 向量（RAG 模式使用）
}

/** RAG 记忆检索系统设置 */
export interface RAGSettings {
  enabled: boolean
  embedding: {
    apiUrl: string
    apiKey: string
    model: string
  }
  rerank: {
    apiUrl: string
    apiKey: string
    model: string
  }
  topK: number              // 向量召回数量，默认 50（范围 10-100）
  rerankTopN: number         // Rerank 后保留数量，默认 15（范围 5-30）
  useContextQuery: boolean   // 使用最近一轮对话作为检索 query，默认 true
  autoAdjust: boolean        // 根据总结数量自动调整 topK 和 rerankTopN
}

/** 总结系统设置 */
export interface SummarySystemSettings {
  enabled: boolean
  minorSummaryStartFloor: number
  // 保留旧字段兼容（不删除，不再用于新生成）
  majorSummaryStartFloor?: number
  minorCountForMajor?: number
  majorCountForSuper?: number
  enableSuperSummary?: boolean
  useAssistantForSummary?: boolean
}

// ==================== 玩家相关 ====================

/** 玩家属性 */
export interface PlayerStats {
  name: string
  gender: 'male' | 'female'
  characterFeature: string
  backgroundStory: string
  gameMode: string
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
  socialReadStatus: Record<string, 'hold' | 'pass'>
  systemNotifications: string[]
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
  gradeYear: number
  academicYear: number
  pendingDeliveries: PendingDelivery[]
  equipment: EquipmentSlots
  outfitSlots?: OutfitSlots  // AI设置的衣着描述（按槽位），装备栏为空时使用
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
  
  // 校规系统
  schoolRules: SchoolRule[]
  
  // 教师系统
  role: 'student' | 'teacher'
  teachingClasses: string[]          // 教授的班级ID列表 (1~5个)
  homeroomClassId: string | null     // [兼容] 旧版单班主任
  homeroomClassIds: string[]         // 担任班主任的班级ID列表 (支持多班主任)
  teachingSubjects: string[]         // [兼容] 旧版全局学科列表
  classSubjectMap: Record<string, string[]>  // 按班级分配学科 { '1-A': ['数学'], '1-B': ['英语'] }
  teachingElectives: string[]        // 教授的选修课ID列表
  advisorClubs: string[]             // 担任指导老师的社团ID列表
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
  aliveRemaining?: number
  location: string
  role?: 'student' | 'teacher' | 'staff' | 'external' | 'other'
  staffTitle?: string
  workplace?: string
  mood?: NpcMoodType
  moodReason?: string
  moodDuration?: number
  forcedLocation?: {
    locationId: string
    endTime: number // 绝对时间戳 (total hours)
  }
  outfitSlots?: OutfitSlots  // AI设置的衣着描述（按槽位）
  // 学业系统
  motivation?: number                     // 学习动力 0-100 (默认50)
  studyFocus?: string | null             // 当前专注科目 (可选)
  subjectGrowth?: Record<string, number> // 各科累积成长值
  academicProfile?: string               // 学力标签缓存 (从世界书解析)
  // 学业成长数据 (升级版)
  academicStats?: {
    overallPotential: string
    traits: string[]
    subjects: Record<string, { level: string; exp: number }>
  }
}

/** 社团数据 */
export interface ClubData {
  id: string
  name: string
  advisor?: string
  president?: string | string[]
  vicePresident?: string | string[]
  members: string[]
  coreSkill?: string
  activityDay?: string
  location?: string
  description?: string
  mode?: 'normal' | 'restricted'  // 社团模式：normal=可自由申请, restricted=不可主动申请(蓝灯)
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

// ==================== 校规系统相关 ====================

/** 校规条目 */
export interface SchoolRule {
  id: string                    // 唯一ID，如 'rule_001'
  title: string                 // 校规标题
  content: string               // 校规详细内容
  status: 'active' | 'paused'   // 生效/暂停
  targets: {
    gender: ('male' | 'female')[]           // 性别适用范围
    roles: ('student' | 'teacher' | 'staff' | 'external')[]  // 角色类型适用范围
  }
  createdAt: number             // 创建时间戳
  createdFloor: number          // 创建时的聊天楼层
  isWeird: boolean              // 是否标记为"奇怪校规"
}

// ==================== 学业系统相关 ====================

/** 考试记录 */
export interface ExamRecord {
  examId: string                                    // 如 '2024-05-monthly'
  examType: 'monthly' | 'midterm' | 'final'
  examDate: { year: number; month: number; day: number }
  results: Record<string, Record<string, Record<string, number>>>   // { "1-A": { "NPC名": { literature: 45, math: 37, ... } } }
  classRankings: Record<string, { avg: number; rank: number }>  // { "1-A": { avg: 68.5, rank: 2 } }
}

// ==================== 全局游戏状态 ====================

/** 全局游戏状态（包含存档快照） */
/** 毕业生数据 */
export interface GraduatedNpc {
  id: string
  name: string
  gender?: 'male' | 'female'
  origin?: string
  classId: string // 毕业时的班级
  graduationYear: number // 毕业年份
  clubsAtGraduation: string[] // 毕业时所属社团
}

export interface GameState {
  player: PlayerStats
  npcs: NpcStats[]
  npcRelationships: Record<string, NpcFullData>
  characterNotes: Record<string, string>
  graduatedNpcs: GraduatedNpc[]
  lastAcademicYear: number // 上次进级的学年（防止重复触发）
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
    ragSystem: RAGSettings
    suggestedReplies: boolean
    enterToSend: boolean
    independentImageGeneration: boolean
    imageGenerationPrompt: string
    imageContextDepth: number
    customImageAnalysisPrompt: string
    imageCharacterAnchors: Record<string, string>
    customInstructionsPrompt: string | null
    customStylePrompt: string | null
    customCoreRulesPrompt: string | null
    bannedWords: {
      enabled: boolean
      customContent: string | null
      position: 'instructions' | 'style' | 'coreRules'
    }
    debugMode: boolean
    debugUnlocked: boolean
    snapshotLimit: number
    snapshotMode: 'full' | 'delta'
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
  clubInvitation: {
    clubId: string
    clubName: string
    targetName: string
    remainingTurns: number
  } | null
  currentRunId: string
  currentFloor: number
  mapSelectionMode: boolean
  mapSelectionCallback: ((location: string) => void) | null
  eventLibrary: Map<string, any>
  eventTriggers: Array<any>
  eventChecks: EventChecks
  // 学业系统
  examHistory: ExamRecord[]
  electiveAcademicData: Record<string, { quality: number }>
  lastExamDate: string | null  // 上次考试日期 'YYYY-MM-DD'，防止重复触发
  customCoursePool: any | null
  npcElectiveSelections?: Record<string, string[]> // NPC选课记录 { NPC名: [课程ID] }
  // 红点/通知相关
  unviewedExamIds: string[]
  lastViewedWeeklyPreview: number
  viewedClubIds: string[]
  // 周报相关
  weeklySnapshot: any
  weeklyPreviewData: any
  showWeeklyPreview: boolean
  lastWeeklyPreviewWeek: number
  worldbookLoadResults: {
    classData: boolean | null
    clubData: boolean | null
    mapData: boolean | null
    partTimeData: boolean | null
    courseData: boolean | null
    eventData: boolean | null
    scheduleData: boolean | null
    shopData: boolean | null
    academicData: boolean | null
    tagData: boolean | null
    socialData: boolean | null
  }
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
