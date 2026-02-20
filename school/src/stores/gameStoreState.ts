/**
 * GameStore 初始状态
 * 从 gameStore.ts 中拆分出来的初始 state 定义
 */

import type { GameState } from './gameStoreTypes'

/**
 * 创建初始游戏状态
 */
export function createInitialState(): GameState {
  return {
    currentRunId: Date.now().toString(36),
    currentFloor: 0,
    mapSelectionMode: false,
    mapSelectionCallback: null,
    allClassData: {},
    allClubs: {},
    graduatedNpcs: [],
    lastAcademicYear: 0,
    clubApplication: null,
    clubRejection: null,
    clubInvitation: null,
    npcRelationships: {},
    characterNotes: {},
    player: {
      name: 'Player',
      gender: 'male',
      characterFeature: '',
      backgroundStory: '',
      gameMode: 'normal',
      level: 1,
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      exp: 0,
      gold: 0,
      money: 0,
      avatar: 'https://files.catbox.moe/efg1xe.png',
      freePoints: 5,
      totalExp: 0,
      attributes: {
        iq: 60,
        eq: 60,
        physique: 60,
        flexibility: 60,
        charm: 60,
        mood: 60
      },
      potentials: {
        iq: 85,
        eq: 85,
        physique: 85,
        flexibility: 85,
        charm: 85,
        mood: 85
      },
      subjects: {
        literature: 15,
        math: 15,
        english: 15,
        humanities: 15,
        sciences: 15,
        art: 15,
        sports: 15
      },
      skills: {
        programming: 0,
        painting: 0,
        guitar: 0,
        piano: 0,
        urbanLegend: 0,
        cooking: 0,
        hacking: 0,
        socialMedia: 0,
        photography: 0,
        videoEditing: 0
      },
      inventory: [],
      talents: [],
      joinedClubs: [],
      flags: {},
      subjectExps: {
        literature: 0, math: 0, english: 0, humanities: 0, sciences: 0, art: 0, sports: 0
      },
      skillExps: {
        programming: 0, painting: 0, guitar: 0, piano: 0, urbanLegend: 0, cooking: 0, hacking: 0, socialMedia: 0, photography: 0, videoEditing: 0
      },
      classRoster: null,
      classId: '',
      schedule: null,
      selectedElectives: [],
      electivesLockedForTerm: null,
      location: 'th_main_gate',
      pendingCommands: [],
      holdMessages: [],
      socialReadStatus: {},
      systemNotifications: [],
      social: {
        friends: [],
        groups: [],
        moments: []
      },
      customCalendarEvents: [],
      forum: {
        posts: [],
        pendingCommands: []
      },
      activeEvents: [],
      eventHistory: [],
      scheduledEvents: [],
      health: 100,
      relationships: {
        hasLover: false,
        friendCount: 2,
        bestFriendCount: 0,
        rivalCount: 0
      },
      currentGoal: '',
      newGameGuideTurns: 0,
      gradeYear: 1,
      academicYear: 2024,
      pendingDeliveries: [],
      equipment: {
        hat: null,
        outer: null,
        inner: null,
        pants: null,
        socks: null,
        shoes: null,
        accessory: null
      },
      outfitSlots: {},
      activeEffects: [],
      productStock: {},
      summaries: [],
      schoolRules: [],
      partTimeJob: {
        currentJob: null,
        isWorking: false,
        workStartTime: null,
        totalEarnings: 0,
        history: [],
        lastWorkInfo: null
      },
      
      // 教师系统
      role: 'student',
      teachingClasses: [],
      homeroomClassId: null,
      teachingSubjects: [],
      teachingElectives: [],
      advisorClubs: []
    },
    npcs: [],
    gameTime: {
      year: 2024,
      month: 4,
      day: 1,
      weekday: 'Monday',
      hour: 8,
      minute: 0
    },
    settings: {
      difficulty: 'normal',
      bgmVolume: 50,
      titleFont: "'Ma Shan Zheng', cursive",
      bodyFont: "'Arial', sans-serif",
      darkMode: false,
      streamResponse: true,
      socialHistoryLimit: 50,
      forumWorldbookLimit: 20,
      customRegexList: [
        { id: 'default_content', pattern: '<content>([\\s\\S]*?)<\\/content>', enabled: true },
        { id: 'response_content', pattern: '<response>([\\s\\S]*?)<\\/response>', enabled: true }
      ],
      customContentTags: ['content', '正文', 'gametxt', 'game', 'response'],
      assistantAI: {
        enabled: false,
        apiUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.85
      },
      summarySystem: {
        enabled: true,
        enableSuperSummary: true,
        minorSummaryStartFloor: 8,
        majorSummaryStartFloor: 25,
        minorCountForMajor: 5,
        majorCountForSuper: 3,
        useAssistantForSummary: true
      },
      suggestedReplies: false,
      enterToSend: true,
      independentImageGeneration: false,
      imageGenerationPrompt: '',
      imageContextDepth: 0,
      customImageAnalysisPrompt: '',
      customInstructionsPrompt: null,
      customStylePrompt: null,
      customCoreRulesPrompt: null,
      bannedWords: {
        enabled: true,
        customContent: null,
        position: 'style'
      },
      debugMode: false,
      debugUnlocked: false,
      snapshotLimit: 10,
      snapshotMode: 'delta',
      useGeminiMode: false
    },
    saveSnapshots: [],
    currentChatLog: [],
    pendingRestoreLog: null,
    eventLibrary: new Map(),
    eventTriggers: [],
    eventChecks: {
      lastDaily: '',
      lastWeekly: '',
      lastMonthly: ''
    },
    // 学业系统
    examHistory: [],
    electiveAcademicData: {},
    lastExamDate: null,
    customCoursePool: null,
    npcElectiveSelections: {},
    worldState: {
      economy: 100,
      weather: {
        current: {
          weather: 'sunny',
          weatherName: '晴',
          icon: '☀️',
          temperature: 22,
          tempHigh: 25,
          tempLow: 18
        },
        forecast: [],
        lastUpdateDate: '',
        season: 'spring',
        previousHour: 8,
        lastChangeInfo: null
      }
    }
  }
}

/**
 * 创建玩家初始状态（用于新游戏重置）
 */
export function createInitialPlayerState() {
  return createInitialState().player
}

/**
 * 创建游戏时间初始状态
 */
export function createInitialGameTime() {
  return {
    year: 2024,
    month: 4,
    day: 1,
    weekday: 'Monday',
    hour: 8,
    minute: 0
  }
}

/**
 * 创建世界状态初始值
 */
export function createInitialWorldState() {
  return {
    economy: 100,
    weather: {
      current: {
        weather: 'sunny',
        weatherName: '晴',
        icon: '☀️',
        temperature: 22,
        tempHigh: 25,
        tempLow: 18
      },
      forecast: [],
      lastUpdateDate: '',
      season: 'spring',
      previousHour: 8,
      lastChangeInfo: null
    }
  }
}
