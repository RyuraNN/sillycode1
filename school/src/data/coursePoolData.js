/**
 * 课程池数据
 * 包含所有年级的必修课和选修课
 */

// ============ 选课倾向类型定义 ============

/**
 * 选课倾向类型
 * 每个倾向对应一类课程，用于NPC自动选课
 */
export const ELECTIVE_PREFERENCES = {
  music: {
    name: '音乐',
    icon: '🎵',
    description: '偏好音乐相关课程'
  },
  sports: {
    name: '体育',
    icon: '⚽',
    description: '偏好体育运动类课程'
  },
  arts: {
    name: '艺术',
    icon: '🎨',
    description: '偏好美术设计类课程'
  },
  tech: {
    name: '科技',
    icon: '💻',
    description: '偏好信息技术类课程'
  },
  life: {
    name: '生活',
    icon: '🏠',
    description: '偏好生活技能类课程'
  },
  academic: {
    name: '学术',
    icon: '📚',
    description: '偏好学术研究类课程'
  },
  performance: {
    name: '表演',
    icon: '🎭',
    description: '偏好表演艺术类课程'
  },
  general: {
    name: '综合',
    icon: '🌟',
    description: '无特定偏好，随机选择'
  }
}

/**
 * 倾向到课程关键词的映射
 * 用于根据倾向筛选适合的选修课
 */
export const PREFERENCE_COURSE_KEYWORDS = {
  music: ['音乐', '声乐', '作词', '作曲', '和声', '乐器'],
  sports: ['体育', '运动', '教练', '保健', '生理'],
  arts: ['美术', '艺术', '设计', '绘画', '鉴赏'],
  tech: ['信息', '编程', '媒体', '计算机', '技术'],
  life: ['家政', '营养', '烹饪', '生活'],
  academic: ['逻辑', '心理', '文学', '文化', '哲学', '研究', '外语'],
  performance: ['舞蹈', '表演', '舞台', '戏剧', '镜头'],
  general: [] // 匹配所有
}

// ============ 初始数据（用于重置） ============

const DEFAULT_UNIVERSAL_ELECTIVES = [
  {
    id: 'univ_pe_gto',
    name: '体育',
    teacher: '鬼冢英吉',
    teacherGender: 'male',
    origin: 'GTO',
    location: 'track_and_field',
    type: 'elective',
    availableFor: ['通用']
  },
  {
    id: 'univ_pe_karasuma',
    name: '体育',
    teacher: '乌间惟臣',
    teacherGender: 'male',
    origin: '暗杀教室',
    location: 'gymnasium',
    type: 'elective',
    availableFor: ['通用']
  },
  {
    id: 'univ_music',
    name: '音乐',
    teacher: '泷昇',
    teacherGender: 'male',
    origin: '吹响吧！上低音号',
    location: 'music_room_1',
    type: 'elective',
    availableFor: ['通用']
  },
  {
    id: 'univ_art',
    name: '美术',
    teacher: '幸田实果子',
    teacherGender: 'female',
    origin: '近所物语',
    location: 'art_room_1',
    type: 'elective',
    availableFor: ['通用']
  },
  {
    id: 'univ_it',
    name: '信息技术',
    teacher: '桥田至',
    teacherGender: 'male',
    origin: '命运石之门',
    location: 'computer_room',
    type: 'elective',
    availableFor: ['通用']
  },
  {
    id: 'univ_home_ec',
    name: '家政',
    teacher: '坂本太郎',
    teacherGender: 'male',
    origin: '坂本日常',
    location: 'home_economics_room',
    type: 'elective',
    availableFor: ['通用']
  }
]

const DEFAULT_GRADE_1_COURSES = {
  required: [
    {
      id: 'g1_chinese',
      name: '现代国语',
      teacher: '平冢静',
      teacherGender: 'female',
      origin: '我的青春恋爱物语果然有问题。',
      location: 'classroom_1a',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_classics',
      name: '古典文学',
      teacher: '吉田松阳',
      teacherGender: 'male',
      origin: '银魂',
      location: 'classroom_1b',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_math1',
      name: '基础数学I',
      teacher: '武田一鉄',
      teacherGender: 'male',
      origin: '排球少年!!',
      location: 'classroom_1a',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_math2',
      name: '基础数学II',
      teacher: '根津老师',
      teacherGender: 'male',
      origin: '再见！绝望先生',
      location: 'classroom_1b',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_english',
      name: '基础英语',
      teacher: '伊莉娜·耶拉比琪',
      teacherGender: 'female',
      origin: '暗杀教室',
      location: 'classroom_1a',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_history',
      name: '世界历史',
      teacher: '维尔维特·维斯·维',
      teacherGender: 'male',
      origin: '君主·埃尔梅罗二世事件簿',
      location: 'classroom_1c',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_geography',
      name: '地理',
      teacher: '维尔维特·维斯·维',
      teacherGender: 'male',
      origin: '君主·埃尔梅罗二世事件簿',
      location: 'classroom_1c',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_physics',
      name: '物理入门',
      teacher: '冈部伦太郎',
      teacherGender: 'male',
      origin: '命运石之门',
      location: 'classroom_1d',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_chemistry',
      name: '化学入门',
      teacher: '牧濑红莉栖',
      teacherGender: 'female',
      origin: '命运石之门',
      location: 'sb_chemistry_lab',
      type: 'required',
      availableFor: ['1年级']
    },
    {
      id: 'g1_biology',
      name: '生物入门',
      teacher: '大蛇丸',
      teacherGender: 'male',
      origin: '火影忍者',
      location: 'sb_biology_lab',
      type: 'required',
      availableFor: ['1年级']
    }
  ],
  electives: []
}

const DEFAULT_GRADE_2_COURSES = {
  required: [
    {
      id: 'g2_math',
      name: '高等数学II',
      teacher: '武田一鉄',
      teacherGender: 'male',
      origin: '排球少年!!',
      location: 'classroom_2a',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_essay',
      name: '议论文写作',
      teacher: '平冢静',
      teacherGender: 'female',
      origin: '我的青春恋爱物语果然有问题。',
      location: 'classroom_2a',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_english',
      name: '高级英语',
      teacher: '伊莉娜·耶拉比琪',
      teacherGender: 'female',
      origin: '暗杀教室',
      location: 'classroom_2a',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_jp_history',
      name: '日本史',
      teacher: '维尔维特·维斯·维',
      teacherGender: 'male',
      origin: '君主·埃尔梅罗二世事件簿',
      location: 'classroom_2b',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_chemistry',
      name: '高级化学',
      teacher: '牧濑红莉栖',
      teacherGender: 'female',
      origin: '命运石之门',
      location: 'sb_chemistry_lab',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_modern_lit',
      name: '现代文B',
      teacher: '吉田松阳',
      teacherGender: 'male',
      origin: '银魂',
      location: 'classroom_2d',
      type: 'required',
      availableFor: ['2年级']
    },
    {
      id: 'g2_world_geo',
      name: '世界地理',
      teacher: '维尔维特·维斯·维',
      teacherGender: 'male',
      origin: '君主·埃尔梅罗二世事件簿',
      location: 'classroom_2d',
      type: 'required',
      availableFor: ['2年级']
    }
  ],
  electives: [
    {
      id: 'g2_english_conv',
      name: '英语会话',
      teacher: '伊莉娜·耶拉比琪',
      teacherGender: 'female',
      origin: '暗杀教室',
      location: 'classroom_2b',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_literature',
      name: '文学鉴赏',
      teacher: '山中佐和子',
      teacherGender: 'female',
      origin: '轻音少女',
      location: 'classroom_2b',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_logic',
      name: '逻辑学',
      teacher: '槙岛圣护',
      teacherGender: 'male',
      origin: '心理测量者',
      location: 'classroom_2c',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_psychology',
      name: '心理学入门',
      teacher: '折原临也',
      teacherGender: 'male',
      origin: '无头骑士异闻录',
      location: 'classroom_2c',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_interpersonal',
      name: '人际关系学',
      teacher: '平冢静',
      teacherGender: 'female',
      origin: '我的青春恋爱物语果然有问题。',
      location: 'classroom_2d',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_media',
      name: '媒体素养',
      teacher: '桥田至',
      teacherGender: 'male',
      origin: '命运石之门',
      location: 'computer_room_2',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_programming',
      name: '编程实践',
      teacher: '桥田至',
      teacherGender: 'male',
      origin: '命运石之门',
      location: 'computer_room_2',
      type: 'elective',
      availableFor: ['2年级']
    },
    {
      id: 'g2_art_appreciation',
      name: '艺术鉴赏',
      teacher: '幸田实果子',
      teacherGender: 'female',
      origin: '近所物语',
      location: 'art_room_1',
      type: 'elective',
      availableFor: ['2年级']
    }
  ]
}

const DEFAULT_GRADE_3_COURSES = {
  required: [
    {
      id: 'g3_thesis',
      name: '毕业论文指导',
      teacher: '平冢静',
      teacherGender: 'female',
      origin: '我的青春恋爱物语果然有问题。',
      location: 'classroom_3a',
      type: 'required',
      availableFor: ['3年级']
    },
    {
      id: 'g3_counseling',
      name: '升学相谈',
      teacher: '全体教师',
      teacherGender: 'male',
      origin: '学校',
      location: 'classroom_3a',
      type: 'required',
      availableFor: ['3年级']
    },
    {
      id: 'g3_physics',
      name: '高等物理',
      teacher: '冈部伦太郎',
      teacherGender: 'male',
      origin: '命运石之门',
      location: 'classroom_3a',
      type: 'required',
      availableFor: ['3年级']
    },
    {
      id: 'g3_classics',
      name: '古典文学研究',
      teacher: '吉田松阳',
      teacherGender: 'male',
      origin: '银魂',
      location: 'classroom_3c',
      type: 'required',
      availableFor: ['3年级']
    }
  ],
  electives: [
    {
      id: 'g3_society',
      name: '现代社会研究',
      teacher: '折原临也',
      teacherGender: 'male',
      origin: '无头骑士异闻录',
      location: 'classroom_3a',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_free',
      name: '自由选修',
      teacher: '全体教师',
      teacherGender: 'male',
      origin: '学校',
      location: 'various',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_culture',
      name: '比较文化学',
      teacher: '维尔维特·维斯·维',
      teacherGender: 'male',
      origin: '君主·埃尔梅罗二世事件簿',
      location: 'classroom_3b',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_art_history',
      name: '艺术史',
      teacher: '幸田实果子',
      teacherGender: 'female',
      origin: '近所物语',
      location: 'art_room_1',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_health',
      name: '体育保健',
      teacher: '乌间惟臣',
      teacherGender: 'male',
      origin: '暗杀教室',
      location: 'gymnasium',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_second_lang',
      name: '第二外语',
      teacher: '茅野枫',
      teacherGender: 'female',
      origin: '暗杀教室',
      location: 'classroom_3b',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_supernatural',
      name: '超自然研究',
      teacher: '平冢静',
      teacherGender: 'female',
      origin: '我的青春恋爱物语果然有问题。',
      location: 'classroom_3c',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_social_psych',
      name: '社会心理学',
      teacher: '折原临也',
      teacherGender: 'male',
      origin: '无头骑士异闻录',
      location: 'classroom_3c',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_sports_physio',
      name: '运动生理学',
      teacher: '乌间惟臣',
      teacherGender: 'male',
      origin: '暗杀教室',
      location: 'gymnasium',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_coaching',
      name: '教练学入门',
      teacher: '鬼冢英吉',
      teacherGender: 'male',
      origin: 'GTO',
      location: 'gymnasium',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_sports_news',
      name: '英语体育新闻',
      teacher: '伊莉娜·耶拉比琪',
      teacherGender: 'female',
      origin: '暗杀教室',
      location: 'classroom_3d',
      type: 'elective',
      availableFor: ['3年级']
    },
    {
      id: 'g3_nutrition',
      name: '营养学',
      teacher: '大蛇丸',
      teacherGender: 'male',
      origin: '火影忍者',
      location: 'sb_biology_lab',
      type: 'elective',
      availableFor: ['3年级']
    }
  ]
}

const DEFAULT_IDOL_COURSES = {
  grade1: {
    required: [
      {
        id: 'idol_1_vocal',
        name: '声乐基础',
        teacher: 'プロデューサー',
        teacherGender: 'male',
        origin: '偶像大师',
        location: 'music_room_1',
        type: 'required',
        availableFor: ['1年E班']
      },
      {
        id: 'idol_1_dance',
        name: '舞蹈基础',
        teacher: '千石千寻',
        teacherGender: 'female',
        origin: '樱花庄的宠物女孩',
        location: 'sub_gymnasium',
        type: 'required',
        availableFor: ['1年E班']
      },
      {
        id: 'idol_1_perform',
        name: '表演入门',
        teacher: '有栖川誉',
        teacherGender: 'male',
        origin: 'A3!',
        location: 'auditorium',
        type: 'required',
        availableFor: ['1年E班']
      },
      {
        id: 'idol_1_intro',
        name: '偶像学概论',
        teacher: '秋月律子',
        teacherGender: 'female',
        origin: '偶像大师',
        location: 'classroom_1e',
        type: 'required',
        availableFor: ['1年E班']
      },
      {
        id: 'idol_1_image',
        name: '形象设计',
        teacher: '幸田实果子',
        teacherGender: 'female',
        origin: '近所物语',
        location: 'classroom_1e',
        type: 'required',
        availableFor: ['1年E班']
      }
    ],
    electives: [
      {
        id: 'idol_1_theory',
        name: '乐理基础',
        teacher: '山中佐和子',
        teacherGender: 'female',
        origin: '轻音少女',
        location: 'classroom_1e',
        type: 'elective',
        availableFor: ['1年E班']
      }
    ]
  },
  grade2: {
    required: [
      {
        id: 'idol_2_vocal',
        name: '进阶声乐',
        teacher: 'プロデューサー',
        teacherGender: 'male',
        origin: '偶像大师',
        location: 'music_room_1',
        type: 'required',
        availableFor: ['2年E班']
      },
      {
        id: 'idol_2_jazz',
        name: '爵士舞',
        teacher: '千石千寻',
        teacherGender: 'female',
        origin: '樱花庄的宠物女孩',
        location: 'sub_gymnasium',
        type: 'required',
        availableFor: ['2年E班']
      },
      {
        id: 'idol_2_camera',
        name: '镜头表现力',
        teacher: '有栖川誉',
        teacherGender: 'male',
        origin: 'A3!',
        location: 'auditorium',
        type: 'required',
        availableFor: ['2年E班']
      },
      {
        id: 'idol_2_compose',
        name: '作词作曲',
        teacher: '高山P',
        teacherGender: 'male',
        origin: '偶像大师 闪耀色彩',
        location: 'music_room_1',
        type: 'required',
        availableFor: ['2年E班']
      },
      {
        id: 'idol_2_fan',
        name: '粉丝沟通',
        teacher: '秋月律子',
        teacherGender: 'female',
        origin: '偶像大师',
        location: 'classroom_2e',
        type: 'required',
        availableFor: ['2年E班']
      }
    ],
    electives: [
      {
        id: 'idol_2_harmony_basics',
        name: '和声基础',
        teacher: '山中佐和子',
        teacherGender: 'female',
        origin: '轻音少女',
        location: 'classroom_2e',
        type: 'elective',
        availableFor: ['2年E班']
      }
    ]
  },
  grade3: {
    required: [
      {
        id: 'idol_3_harmony',
        name: '高级和声',
        teacher: 'プロデューサー',
        teacherGender: 'male',
        origin: '偶像大师',
        location: 'music_room_1',
        type: 'required',
        availableFor: ['3年E班']
      },
      {
        id: 'idol_3_stage',
        name: '舞台剧表演',
        teacher: '有栖川誉',
        teacherGender: 'male',
        origin: 'A3!',
        location: 'auditorium',
        type: 'required',
        availableFor: ['3年E班']
      },
      {
        id: 'idol_3_career',
        name: '职业生涯规划',
        teacher: '秋月律子',
        teacherGender: 'female',
        origin: '偶像大师',
        location: 'classroom_3e',
        type: 'required',
        availableFor: ['3年E班']
      },
      {
        id: 'idol_3_media',
        name: '媒体应对',
        teacher: '高木社长',
        teacherGender: 'male',
        origin: '偶像大师',
        location: 'classroom_3e',
        type: 'required',
        availableFor: ['3年E班']
      },
      {
        id: 'idol_3_final',
        name: '毕业公演排练',
        teacher: '全体导师',
        teacherGender: 'male',
        origin: '偶像大师',
        location: 'auditorium',
        type: 'required',
        availableFor: ['3年E班']
      }
    ],
    electives: [
      {
        id: 'idol_3_compose_basics',
        name: '作词作曲基础',
        teacher: '山中佐和子',
        teacherGender: 'female',
        origin: '轻音少女',
        location: 'classroom_3e',
        type: 'elective',
        availableFor: ['3年E班']
      }
    ]
  }
}

// ============ 当前数据（可编辑） ============
// 使用深拷贝初始化

export let UNIVERSAL_ELECTIVES = JSON.parse(JSON.stringify(DEFAULT_UNIVERSAL_ELECTIVES))
export let GRADE_1_COURSES = JSON.parse(JSON.stringify(DEFAULT_GRADE_1_COURSES))
export let GRADE_2_COURSES = JSON.parse(JSON.stringify(DEFAULT_GRADE_2_COURSES))
export let GRADE_3_COURSES = JSON.parse(JSON.stringify(DEFAULT_GRADE_3_COURSES))
export let IDOL_COURSES = JSON.parse(JSON.stringify(DEFAULT_IDOL_COURSES))
export let CUSTOM_CLASS_COURSES = {} // { classId: { required: [], electives: [] } }

// ============ 世界书持久化 ============

const WB_ENTRY_NAME = '[CoursePool]'

/**
 * 将课程对象转换为文本行
 */
function serializeCourse(category, course, typeLabel) {
  let teacherStr = course.teacher || '未知教师'
  if (course.teacherGender) {
    teacherStr += ` ${course.teacherGender === 'male' ? '♂' : '♀'}`
  }
  if (course.origin && course.origin !== '自定义') {
    teacherStr += ` (${course.origin})`
  }
  
  return `${category}|${course.name}|${teacherStr}|${course.location || 'classroom'}|${typeLabel}`
}

/**
 * 解析文本行到课程对象
 */
function parseCourseLine(line) {
  const parts = line.split('|').map(s => s.trim())
  if (parts.length < 5) return null
  
  const [category, name, teacherInfo, location, typeLabel] = parts
  
  // 解析教师信息 "Name ♂ (Origin)"
  let teacher = teacherInfo
  let teacherGender = 'female' // 默认
  let origin = '自定义'
  
  const match = teacherInfo.match(/^(.+?)(?:\s+([♂♀]))?(?:\s+\((.+)\))?$/)
  if (match) {
    teacher = match[1]
    if (match[2]) teacherGender = match[2] === '♂' ? 'male' : 'female'
    if (match[3]) origin = match[3]
  }
  
  return {
    category,
    course: {
      id: `imported_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name,
      teacher,
      teacherGender,
      origin,
      location,
      type: typeLabel === '必修' ? 'required' : 'elective',
      availableFor: [category] // 简单处理
    },
    isRequired: typeLabel === '必修'
  }
}

/**
 * 保存课程池到世界书
 */
export async function saveCoursePoolToWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.updateWorldbookWith !== 'function') {
    console.warn('[CoursePool] Worldbook API not available')
    return false
  }

  let content = '# 课程池配置数据\n# 请勿随意修改格式\n\n'
  
  content += '# --- 通用课程 (所有年级可选) ---\n'
  UNIVERSAL_ELECTIVES.forEach(c => {
    content += serializeCourse('通用', c, '选修') + '\n'
  })
  
  const processGrade = (gradeName, data) => {
    content += `\n# --- ${gradeName} ---\n`
    data.required.forEach(c => content += serializeCourse(gradeName, c, '必修') + '\n')
    data.electives.forEach(c => content += serializeCourse(gradeName, c, '选修') + '\n')
  }
  
  processGrade('1年级', GRADE_1_COURSES)
  processGrade('2年级', GRADE_2_COURSES)
  processGrade('3年级', GRADE_3_COURSES)
  
  content += '\n# --- 偶像科专用 ---\n'
  const processIdol = (className, data) => {
    data.required.forEach(c => content += serializeCourse(className, c, '必修') + '\n')
    data.electives.forEach(c => content += serializeCourse(className, c, '选修') + '\n')
  }
  processIdol('1年E班', IDOL_COURSES.grade1)
  processIdol('2年E班', IDOL_COURSES.grade2)
  processIdol('3年E班', IDOL_COURSES.grade3)
  
  // 保存自定义班级课程
  Object.keys(CUSTOM_CLASS_COURSES).forEach(classId => {
    const data = CUSTOM_CLASS_COURSES[classId]
    if ((data.required && data.required.length > 0) || (data.electives && data.electives.length > 0)) {
      content += `\n# --- ${classId} (自定义) ---\n`
      if (data.required) {
        data.required.forEach(c => content += serializeCourse(classId, c, '必修') + '\n')
      }
      if (data.electives) {
        data.electives.forEach(c => content += serializeCourse(classId, c, '选修') + '\n')
      }
    }
  })
  
  try {
    const books = window.getCharWorldbookNames('current')
    // 优先保存到当前主世界书
    const bookName = books.primary || (books.additional && books.additional[0])
    
    if (!bookName) {
      console.warn('[CoursePool] No worldbook bound to current character')
      return false
    }

    await window.updateWorldbookWith(bookName, (entries) => {
      const newEntries = [...entries]
      const index = newEntries.findIndex(e => e.name === WB_ENTRY_NAME)
      
      const newEntry = {
        name: WB_ENTRY_NAME,
        content: content,
        key: ['system', 'course'],
        strategy: {
          type: 'selective' // 绿灯
        },
        position: {
          type: 'before_character_definition',
          order: 100
        },
        probability: 100,
        enabled: false, // 禁用，仅作为数据存储，不让AI看到
        recursion: {
          prevent_outgoing: true // 防止递归
        }
      }

      if (index !== -1) {
        // 更新现有条目
        newEntries[index] = { ...newEntries[index], ...newEntry }
      } else {
        // 创建新条目
        newEntries.push(newEntry)
      }
      
      return newEntries
    })

    console.log('[CoursePool] Saved to worldbook:', bookName)
    return true
  } catch (e) {
    console.error('[CoursePool] Save failed:', e)
    return false
  }
}

/**
 * 从世界书加载课程池
 */
export async function loadCoursePoolFromWorldbook() {
  if (typeof window.getCharWorldbookNames !== 'function' || typeof window.getWorldbook !== 'function') {
    console.warn('[CoursePool] Worldbook API not available')
    return false
  }

  try {
    const books = window.getCharWorldbookNames('current')
    const bookNames = []
    if (books && typeof books === 'object') {
      if (books.primary) bookNames.push(books.primary)
      if (Array.isArray(books.additional)) bookNames.push(...books.additional)
    } else if (Array.isArray(books)) {
      bookNames.push(...books)
    }

    let foundContent = null
    
    // 查找包含 [CoursePool] 的条目
    for (const name of bookNames) {
      const entries = await window.getWorldbook(name)
      if (!entries || !Array.isArray(entries)) continue
      
      const entry = entries.find(e => e.name === WB_ENTRY_NAME || (e.keys && e.keys.includes('CoursePool')))
      if (entry) {
        foundContent = entry.content
        console.log('[CoursePool] Found entry in book:', name)
        break
      }
    }

    if (!foundContent) {
      console.log('[CoursePool] No entry found, using defaults')
      return false
    }

    // 解析内容并更新内存
    const lines = foundContent.split('\n')
    
    // 清空现有数据
    UNIVERSAL_ELECTIVES.length = 0
    GRADE_1_COURSES.required.length = 0; GRADE_1_COURSES.electives.length = 0
    GRADE_2_COURSES.required.length = 0; GRADE_2_COURSES.electives.length = 0
    GRADE_3_COURSES.required.length = 0; GRADE_3_COURSES.electives.length = 0
    IDOL_COURSES.grade1.required.length = 0; IDOL_COURSES.grade1.electives.length = 0
    IDOL_COURSES.grade2.required.length = 0; IDOL_COURSES.grade2.electives.length = 0
    IDOL_COURSES.grade3.required.length = 0; IDOL_COURSES.grade3.electives.length = 0
    
    // 清空自定义班级数据
    for (const key in CUSTOM_CLASS_COURSES) delete CUSTOM_CLASS_COURSES[key]

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      
      const parsed = parseCourseLine(trimmed)
      if (!parsed) continue
      
      const { category, course, isRequired } = parsed
      
      if (category === '通用') {
        UNIVERSAL_ELECTIVES.push(course)
      } else if (category === '1年级') {
        isRequired ? GRADE_1_COURSES.required.push(course) : GRADE_1_COURSES.electives.push(course)
      } else if (category === '2年级') {
        isRequired ? GRADE_2_COURSES.required.push(course) : GRADE_2_COURSES.electives.push(course)
      } else if (category === '3年级') {
        isRequired ? GRADE_3_COURSES.required.push(course) : GRADE_3_COURSES.electives.push(course)
      } else if (category === '1年E班') {
        isRequired ? IDOL_COURSES.grade1.required.push(course) : IDOL_COURSES.grade1.electives.push(course)
      } else if (category === '2年E班') {
        isRequired ? IDOL_COURSES.grade2.required.push(course) : IDOL_COURSES.grade2.electives.push(course)
      } else if (category === '3年E班') {
        isRequired ? IDOL_COURSES.grade3.required.push(course) : IDOL_COURSES.grade3.electives.push(course)
      } else {
        // 自定义班级处理
        if (!CUSTOM_CLASS_COURSES[category]) {
          CUSTOM_CLASS_COURSES[category] = { required: [], electives: [] }
        }
        isRequired ? CUSTOM_CLASS_COURSES[category].required.push(course) : CUSTOM_CLASS_COURSES[category].electives.push(course)
      }
    }
    
    console.log('[CoursePool] Loaded successfully')
    return true
    
  } catch (e) {
    console.error('[CoursePool] Load failed:', e)
    return false
  }
}

// ============ 状态管理函数 ============

/**
 * 重置课程数据为默认值
 */
export function resetCourseData() {
  // Mutate in place to preserve references
  UNIVERSAL_ELECTIVES.length = 0
  UNIVERSAL_ELECTIVES.push(...JSON.parse(JSON.stringify(DEFAULT_UNIVERSAL_ELECTIVES)))
  
  Object.assign(GRADE_1_COURSES, JSON.parse(JSON.stringify(DEFAULT_GRADE_1_COURSES)))
  Object.assign(GRADE_2_COURSES, JSON.parse(JSON.stringify(DEFAULT_GRADE_2_COURSES)))
  Object.assign(GRADE_3_COURSES, JSON.parse(JSON.stringify(DEFAULT_GRADE_3_COURSES)))
  Object.assign(IDOL_COURSES, JSON.parse(JSON.stringify(DEFAULT_IDOL_COURSES)))
  // 清空自定义班级
  for (const key in CUSTOM_CLASS_COURSES) delete CUSTOM_CLASS_COURSES[key]
}

/**
 * 获取当前课程池状态快照
 */
export function getCoursePoolState() {
  return {
    UNIVERSAL_ELECTIVES,
    GRADE_1_COURSES,
    GRADE_2_COURSES,
    GRADE_3_COURSES,
    IDOL_COURSES,
    CUSTOM_CLASS_COURSES
  }
}

/**
 * 恢复课程池状态
 * @param {Object} state 状态对象
 */
export function restoreCoursePoolState(state) {
  if (!state) return
  if (state.UNIVERSAL_ELECTIVES) {
    UNIVERSAL_ELECTIVES.length = 0
    UNIVERSAL_ELECTIVES.push(...state.UNIVERSAL_ELECTIVES)
  }
  if (state.GRADE_1_COURSES) Object.assign(GRADE_1_COURSES, state.GRADE_1_COURSES)
  if (state.GRADE_2_COURSES) Object.assign(GRADE_2_COURSES, state.GRADE_2_COURSES)
  if (state.GRADE_3_COURSES) Object.assign(GRADE_3_COURSES, state.GRADE_3_COURSES)
  if (state.IDOL_COURSES) Object.assign(IDOL_COURSES, state.IDOL_COURSES)
  if (state.CUSTOM_CLASS_COURSES) {
    for (const key in CUSTOM_CLASS_COURSES) delete CUSTOM_CLASS_COURSES[key]
    Object.assign(CUSTOM_CLASS_COURSES, state.CUSTOM_CLASS_COURSES)
  }
}

// ============ 辅助函数 ============

/**
 * 从班级ID获取年级
 * @param {string} classId 班级ID，如 '1-A', '2-B', '3-E'
 * @returns {number} 年级数字 1, 2, 3
 */
export function getGradeFromClassId(classId) {
  if (!classId) return 1
  const match = classId.match(/^(\d)/)
  return match ? parseInt(match[1]) : 1
}

/**
 * 检查是否是偶像科班级
 * @param {string} classId 班级ID
 * @returns {boolean}
 */
export function isIdolClass(classId) {
  return classId && classId.endsWith('-E')
}

/**
 * 获取指定年级和班级的必修课列表
 * @param {string} classId 班级ID
 * @returns {Array} 必修课列表
 */
export function getRequiredCourses(classId) {
  const grade = getGradeFromClassId(classId)
  let courses = []
  
  // 偶像科使用专用课程
  if (isIdolClass(classId)) {
    if (grade === 1) courses = [...IDOL_COURSES.grade1.required]
    else if (grade === 2) courses = [...IDOL_COURSES.grade2.required]
    else if (grade === 3) courses = [...IDOL_COURSES.grade3.required]
  } else {
    // 普通班级
    if (grade === 1) courses = [...GRADE_1_COURSES.required]
    else if (grade === 2) courses = [...GRADE_2_COURSES.required]
    else if (grade === 3) courses = [...GRADE_3_COURSES.required]
  }

  // 合并自定义班级课程
  if (CUSTOM_CLASS_COURSES[classId] && CUSTOM_CLASS_COURSES[classId].required) {
    courses = [...courses, ...CUSTOM_CLASS_COURSES[classId].required]
  }
  
  return courses
}

/**
 * 获取指定年级和班级可选的选修课列表
 * @param {string} classId 班级ID
 * @returns {Array} 选修课列表（包含通用选修课和年级专属选修课）
 */
export function getElectiveCourses(classId) {
  const grade = getGradeFromClassId(classId)
  const electives = [...UNIVERSAL_ELECTIVES]
  
  // 偶像科学生也可以选通用选修课
  if (isIdolClass(classId)) {
    if (grade === 1) electives.push(...IDOL_COURSES.grade1.electives)
    if (grade === 2) electives.push(...IDOL_COURSES.grade2.electives)
    if (grade === 3) electives.push(...IDOL_COURSES.grade3.electives)
  } else {
    // 添加年级专属选修课
    if (grade === 2) {
      electives.push(...GRADE_2_COURSES.electives)
    } else if (grade === 3) {
      electives.push(...GRADE_3_COURSES.electives)
    }
  }

  // 合并自定义班级课程
  if (CUSTOM_CLASS_COURSES[classId] && CUSTOM_CLASS_COURSES[classId].electives) {
    electives.push(...CUSTOM_CLASS_COURSES[classId].electives)
  }
  
  return electives
}

/**
 * 根据选课倾向筛选推荐的选修课
 * @param {Array} electives 可选课程列表
 * @param {string} preference 倾向类型
 * @returns {Array} 筛选后的课程列表
 */
export function filterCoursesByPreference(electives, preference) {
  if (!preference || preference === 'general') {
    return electives
  }
  
  const keywords = PREFERENCE_COURSE_KEYWORDS[preference] || []
  if (keywords.length === 0) {
    return electives
  }
  
  return electives.filter(course => {
    return keywords.some(keyword => 
      course.name.includes(keyword) || 
      (course.teacher && course.teacher.includes(keyword))
    )
  })
}

/**
 * 根据倾向自动选择选修课
 * @param {string} classId 班级ID
 * @param {string} preference 选课倾向
 * @param {number} count 选择数量 (3-6)
 * @param {Function} rng 随机数生成器 (可选，默认为 Math.random)
 * @returns {Array} 选中的课程ID列表
 */
export function autoSelectElectives(classId, preference, count = 4, rng = Math.random) {
  const allElectives = getElectiveCourses(classId)
  const preferredCourses = filterCoursesByPreference(allElectives, preference)
  
  // 确保数量在3-6之间
  const targetCount = Math.max(3, Math.min(6, count))
  const selectedIds = []
  
  // 优先从偏好课程中选择
  const shuffledPreferred = [...preferredCourses].sort(() => rng() - 0.5)
  for (const course of shuffledPreferred) {
    if (selectedIds.length >= targetCount) break
    if (!selectedIds.includes(course.id)) {
      selectedIds.push(course.id)
    }
  }
  
  // 如果偏好课程不够，从全部选修课中补充
  if (selectedIds.length < targetCount) {
    const shuffledAll = [...allElectives].sort(() => rng() - 0.5)
    for (const course of shuffledAll) {
      if (selectedIds.length >= targetCount) break
      if (!selectedIds.includes(course.id)) {
        selectedIds.push(course.id)
      }
    }
  }
  
  return selectedIds
}

/**
 * 根据课程ID获取课程信息
 * @param {string} courseId 课程ID
 * @returns {Object|null} 课程信息
 */
export function getCourseById(courseId) {
  // 搜索所有课程池
  const allCourses = [
    ...UNIVERSAL_ELECTIVES,
    ...GRADE_1_COURSES.required,
    ...GRADE_2_COURSES.required,
    ...GRADE_2_COURSES.electives,
    ...GRADE_3_COURSES.required,
    ...GRADE_3_COURSES.electives,
    ...IDOL_COURSES.grade1.required,
    ...IDOL_COURSES.grade1.electives,
    ...IDOL_COURSES.grade2.required,
    ...IDOL_COURSES.grade2.electives,
    ...IDOL_COURSES.grade3.required,
    ...IDOL_COURSES.grade3.electives
  ]

  // 添加自定义课程
  Object.values(CUSTOM_CLASS_COURSES).forEach(data => {
    if (data.required) allCourses.push(...data.required)
    if (data.electives) allCourses.push(...data.electives)
  })
  
  return allCourses.find(c => c.id === courseId) || null
}

/**
 * 获取所有选修课（用于UI展示）
 * @returns {Array} 所有选修课列表
 */
export function getAllElectives() {
  const list = [
    ...UNIVERSAL_ELECTIVES,
    ...GRADE_2_COURSES.electives,
    ...GRADE_3_COURSES.electives,
    ...IDOL_COURSES.grade1.electives,
    ...IDOL_COURSES.grade2.electives,
    ...IDOL_COURSES.grade3.electives
  ]

  // 添加自定义选修课程
  Object.values(CUSTOM_CLASS_COURSES).forEach(data => {
    if (data.electives) list.push(...data.electives)
  })

  return list
}

/**
 * 初始化班级的自定义课程数据
 * @param {string} classId 
 */
export function initCustomClass(classId) {
  if (!CUSTOM_CLASS_COURSES[classId]) {
    CUSTOM_CLASS_COURSES[classId] = {
      required: [],
      electives: []
    }
  }
}

/**
 * 移除班级的自定义课程数据
 * @param {string} classId 
 */
export function removeCustomClass(classId) {
  if (CUSTOM_CLASS_COURSES[classId]) {
    delete CUSTOM_CLASS_COURSES[classId]
  }
}
