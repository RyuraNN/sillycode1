<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import CustomOptionPanel from './CustomOptionPanel.vue'
import AttributeAllocationPanel from './AttributeAllocationPanel.vue'
import StudentProfile from './StudentProfile.vue'
import ClassRosterPanel from './ClassRosterPanel.vue'
import CourseEditor from './CourseEditor.vue'
import SchoolRosterFilterPanel from './SchoolRosterFilterPanel.vue'
import EventEditorPanel from './EventEditorPanel.vue'
import NpcScheduleEditorPanel from './NpcScheduleEditorPanel.vue'
import DataTransferPanel from './DataTransferPanel.vue'
import { setPlayerClass } from '../utils/worldbookParser'
import { DEFAULT_FORUM_POSTS, saveForumToWorldbook } from '../utils/forumWorldbook'
import { getCoursePoolState } from '../data/coursePoolData'

const emit = defineEmits(['back', 'startGame'])
const gameStore = useGameStore()

onMounted(async () => {
  await gameStore.loadClassData()
})

const showProfile = ref(false)
const showRoster = ref(false)
const showCourseEditor = ref(false)
const showFilterPanel = ref(false)
const showEventEditor = ref(false)
const showScheduleEditor = ref(false)
const showTransferPanel = ref(false)

const formData = ref({
  name: '',
  characterFeature: '', // 角色特征
  backgroundStory: '', // 角色背景故事
  gender: 'male',
  classId: '',
  gameMode: 'normal', // 默认普通模式
  familyBackground: 'f1', // 默认普通家庭
  childhood: ['', '', ''],
  elementary: ['', '', ''],
  middleSchool: ['', '', ''],
  talents: ['', '', '', '', '', ''],
  allocatedAttributes: {
    attributes: {},
    subjects: {},
    skills: {},
    potentials: {}
  }
})

// 默认自定义数据结构
const defaultCustomData = () => ({
  optionName: '',
  description: '',
  money: 1000,
  attributes: { iq: 0, eq: 0, physique: 0, flexibility: 0, charm: 0, mood: 0 },
  subjects: { literature: 0, math: 0, english: 0, humanities: 0, sciences: 0, art: 0, sports: 0 },
  skills: { programming: 0, painting: 0, guitar: 0, piano: 0, urbanLegend: 0, cooking: 0, hacking: 0, socialMedia: 0, photography: 0, videoEditing: 0 }
})

// 自定义选项数据
const customData = ref({
  family: defaultCustomData(),
  childhood: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  elementary: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  middleSchool: [defaultCustomData(), defaultCustomData(), defaultCustomData()],
  talents: [defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData(), defaultCustomData()],
  classRoster: null // 存储班级名册的修改
})

// 监听班级选择变化，重置名册数据
watch(() => formData.value.classId, (newId) => {
  if (newId && gameStore.allClassData[newId]) {
    customData.value.classRoster = JSON.parse(JSON.stringify(gameStore.allClassData[newId]))
  } else {
    customData.value.classRoster = null
  }
})

// 处理全校名册筛选关闭后的刷新
const handleFilterClose = () => {
  showFilterPanel.value = false
  // 如果当前已选班级，需要刷新本地数据，因为全校筛选可能修改了该班级数据
  if (formData.value.classId && gameStore.allClassData[formData.value.classId]) {
    console.log('[GameStart] Refreshing local roster after filter update')
    customData.value.classRoster = JSON.parse(JSON.stringify(gameStore.allClassData[formData.value.classId]))
  }
}

// 生成班级名册文本
const classInfoText = computed(() => {
  const roster = customData.value.classRoster
  if (!roster) return '（请选择班级以查看名册）'

  let text = `【班级】${roster.name || formData.value.classId}\n`
  text += `【班主任】${roster.headTeacher?.name || '未设置'}\n`
  
  const teachers = roster.teachers || []
  if (teachers.length > 0) {
    text += `【科任教师】\n`
    teachers.forEach(t => {
      text += `  - ${t.subject || '未设置'}: ${t.name || '未设置'}\n`
    })
  }

  const students = roster.students || []
  if (students.length > 0) {
    text += `【学生名单 (${students.length}人)】\n`
    // 每行显示3个学生，避免列表过长
    const names = students.map(s => s.name || '未知')
    for (let i = 0; i < names.length; i += 3) {
      text += `  ${names.slice(i, i + 3).join(', ')}\n`
    }
  }

  return text
})

// 属性映射表 (中文 -> 英文)
const attrMap = {
  '智商': 'iq', '情商': 'eq', '体能': 'physique', '灵活': 'flexibility', '魅力': 'charm', '心境': 'mood',
  '语文': 'literature', '数学': 'math', '外语': 'english', '文科综合': 'humanities', '理科综合': 'sciences', '艺术': 'art', '体育': 'sports',
  '编程': 'programming', '绘画': 'painting', '吉他演奏': 'guitar', '钢琴演奏': 'piano', '都市传说': 'urbanLegend', '烹饪': 'cooking', '黑客技术': 'hacking', '社交媒体运营': 'socialMedia', '摄影': 'photography', '视频编辑': 'videoEditing'
}

// 属性定义
const attributesList = [
  { key: 'iq', label: '智商' },
  { key: 'eq', label: '情商' },
  { key: 'physique', label: '体能' },
  { key: 'flexibility', label: '灵活' },
  { key: 'charm', label: '魅力' },
  { key: 'mood', label: '心境' }
]

// 经历数据
const childhoodOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'c1', name: '沉迷阅读（10点）', cost: 10, desc: '总是在图书馆度过，不善交际。', effects: { attr: { '智商': 3, '情商': -1 } } },
  { id: 'c2', name: '街头霸王（10点）', cost: 10, desc: '经常和附近的孩子打架，头脑简单。', effects: { attr: { '体能': 3, '智商': -1 } } },
  { id: 'c3', name: '万众瞩目（10点）', cost: 10, desc: '从小就是孩子王，有些自负。', effects: { attr: { '情商': 3, '心境': -2 } } },
  { id: 'c4', name: '体弱多病（-15点）', cost: -15, desc: '经常出入医院，错过了很多集体活动。', effects: { attr: { '体能': -3 } } },
  { id: 'c5', name: '艺术熏陶（10点）', cost: 10, desc: '从小学习钢琴或绘画，占用了大量运动时间。', effects: { attr: { '魅力': 3, '体能': -1 } } },
  { id: 'c6', name: '勤工俭学（5点）', cost: 5, desc: '很早就开始打工，见识了社会的复杂。', effects: { attr: { '心境': 2 } } },
  { id: 'c7', name: '随风奔跑（10点）', cost: 10, desc: '热衷于田径和各种运动，但对学习缺乏兴趣。', effects: { attr: { '灵活': 3, '智商': -1 } } },
  { id: 'c8', name: '孤独的思考者（5点）', cost: 5, desc: '总是独来独往，喜欢观察和思考。', effects: { attr: { '心境': 5, '情商': -1 } } },
  { id: 'c9', name: '神秘的邂逅（20点）', cost: 20, desc: '幼时曾遇到过无法解释的奇妙事件，解锁“都市传说”初始技能。', effects: { skill: { '都市传说': 1 } } },
  { id: 'c10', name: '动物朋友（5点）', cost: 5, desc: '总是和附近的流浪猫狗玩在一起。', effects: { attr: { '情商': 1, '魅力': 1 } } },
  { id: 'c11', name: '拆卸专家（5点）', cost: 5, desc: '对家里的各种电器都很好奇并付诸行动。', effects: { attr: { '智商': 2 } } },
  { id: 'c12', name: '谎言神童（10点）', cost: 10, desc: '你很小就学会了如何用谎言达成目的。', effects: { attr: { '情商': 2, '心境': -1 } } }
]

const elementaryOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'e1', name: '奥数冠军（15点）', cost: 15, desc: '在各种数学竞赛中崭露头角。', effects: { knowledge: { '数学': 5 }, attr: { '智商': 1 } } },
  { id: 'e2', name: '作文新星（10点）', cost: 10, desc: '你的作文经常被当作范文朗读。', effects: { knowledge: { '语文': 5 }, attr: { '魅力': 1 } } },
  { id: 'e3', name: '运动健将（10点）', cost: 10, desc: '校运会记录的保持者。', effects: { attr: { '体能': 2, '灵活': 1 } } },
  { id: 'e4', name: '电脑小天才（15点）', cost: 15, desc: '很早就接触了计算机并展现出天赋。', effects: { skill: { '编程': 1 }, attr: { '智商': 1 } } },
  { id: 'e5', name: '大队长（10点）', cost: 10, desc: '作为学生干部，锻炼了管理和交际能力。', effects: { attr: { '情商': 2 } } },
  { id: 'e6', name: '校园小霸王（-10点）', cost: -10, desc: '因为经常欺负同学而臭名昭著。', effects: { attr: { '体能': 2, '情商': -2, '魅力': -2 } } },
  { id: 'e7', name: '小小发明家（15点）', cost: 15, desc: '热爱科学实验，偶尔会引发小小的骚动。', effects: { knowledge: { '理科综合': 3 }, skill: { '编程': 1 }, attr: { '魅力': -1 } } },
  { id: 'e8', name: '故事大王（10点）', cost: 10, desc: '总能绘声绘色地讲述各种故事。', effects: { attr: { '魅力': 2, '情商': 1 } } },
  { id: 'e9', name: '乐器神童（15点）', cost: 15, desc: '在音乐方面展现出非凡的才能。', effects: { skill: { '钢琴演奏': 1 }, attr: { '魅力': 2 } } },
  { id: 'e10', name: '家务能手（5点）', cost: 5, desc: '帮助父母分担家务，厨艺小有所成。', effects: { knowledge: { '艺术': 1 }, attr: { '心境': 2 } } },
  { id: 'e11', name: '转学生（0点）', cost: 0, desc: '小学时转学，需要适应新环境。', effects: { attr: { '情商': 1, '心境': -1 } } },
  { id: 'e12', name: '被孤立者（-15点）', cost: -15, desc: '因为某个原因，被班上的同学孤立。', effects: { attr: { '心境': -5, '情商': -2 } } }
]

const middleSchoolOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这段经历。' },
  { id: 'm1', name: '中二病全开（5点）', cost: 5, desc: '沉浸在自己的幻想世界里。', effects: { skill: { '都市传说': 2 }, attr: { '情商': -1 } } },
  { id: 'm2', name: '叛逆的摇滚魂（15点）', cost: 15, desc: '组建了自己的第一支乐队。', effects: { skill: { '吉他演奏': 2 }, attr: { '魅力': 2 } } },
  { id: 'm3', name: '学生会精英（20点）', cost: 20, desc: '在学生会身居高位，处理各种复杂事务。', effects: { attr: { '情商': 3, '智商': 1 } } },
  { id: 'm4', name: '网瘾少年（-5点）', cost: -5, desc: '将大量时间投入到了网络游戏中。', effects: { attr: { '灵活': 2, '体能': -2 }, knowledge: { '数学': -5 } } },
  { id: 'm5', name: '早恋（10点）', cost: 10, desc: '经历了一段青涩的恋爱。', effects: { attr: { '情商': 2, '心境': 5 }, knowledge: { '外语': -5 } } },
  { id: 'm6', name: '发奋图强（20点）', cost: 20, desc: '为了考上天华学园而拼命学习。', effects: { knowledge: { all: 3 }, attr: { '心境': -5 } } },
  { id: 'm7', name: '博客写手（10点）', cost: 10, desc: '经营着一个颇有人气的个人博客。', effects: { skill: { '编程': 1 }, attr: { '魅力': 1 } } },
  { id: 'm8', name: '料理达人（10点）', cost: 10, desc: '你的厨艺让家人和朋友赞不绝口。', effects: { knowledge: { '艺术': 2 }, attr: { '魅力': 1 } } },
  { id: 'm9', name: '秘密社团（15点）', cost: 15, desc: '加入了一个研究超自然现象的秘密社团。', effects: { skill: { '都市传说': 3 }, attr: { '智商': 1 } } },
  { id: 'm10', name: '打架专家（-5点）', cost: -5, desc: '因为某些原因，你经常参与斗殴事件。', effects: { attr: { '体能': 3, '灵活': 2, '魅力': -2 } } },
  { id: 'm11', name: '偶像应援（10点）', cost: 10, desc: '你是某个地下偶像的狂热粉丝。', effects: { attr: { '情商': 2 } } },
  { id: 'm12', name: '班级图书角（5点）', cost: 5, desc: '你负责管理班级的图书角，读了大量闲书。', effects: { knowledge: { '语文': 3 }, attr: { '智商': 1 } } }
]

const talentOptions = [
  { id: 'custom', name: '自定义（50点）', cost: 50, desc: '完全自定义这个天赋。' },
  { id: 't1', name: '学神（20点）', cost: 20, desc: '你的学习效率远超常人。', effect_desc: '智商软上限+10，知识经验获取+10%。', effects: { softCap: { '智商': 10 } } },
  { id: 't2', name: '社交达人（15点）', cost: 15, desc: '你天生就懂得如何与人打交道。', effect_desc: '情商软上限+10，社交判定加成。', effects: { softCap: { '情商': 10 } } },
  { id: 't3', name: '运动健将（15点）', cost: 15, desc: '你的身体仿佛为运动而生。', effect_desc: '体能和灵活软上限各+5。', effects: { softCap: { '体能': 5, '灵活': 5 } } },
  { id: 't4', name: '万人迷（20点）', cost: 20, desc: '你的魅力无人能挡。', effect_desc: '魅力软上限+10，初始好感增加。', effects: { softCap: { '魅力': 10 } } },
  { id: 't5', name: '小透明（-10点）', cost: -10, desc: '你没什么存在感，但也因此获得了更多可分配点数。', effect_desc: '社交场合中，你的初始存在感较低。', effects: {} },
  { id: 't6', name: '过目不忘（25点）', cost: 25, desc: '你拥有近乎完美的记忆力。', effect_desc: '所有知识水平的经验获取+5%。', effects: {} },
  { id: 't7', name: '天生财运（20点）', cost: 20, desc: '你总是能发现各种赚钱的机会。', effect_desc: '每月额外获得随机零花钱。', effects: {} },
  { id: 't8', name: '第六感（15点）', cost: 15, desc: '你有时能预感到即将发生的事情。', effect_desc: '在某些特殊事件中，会获得额外的提示。', effects: {} },
  { id: 't9', name: '钢铁心灵（15点）', cost: 15, desc: '你拥有强大的抗压能力。', effect_desc: '心境软上限+20，不容易陷入负面情绪。', effects: { softCap: { '心境': 20 } } },
  { id: 't10', name: '动手能力MAX（10点）', cost: 10, desc: '你擅长修理和制作各种东西。', effect_desc: '艺术和编程技能的经验获取+10%。', effects: {} },
  { id: 't11', name: '言出法随（30点）', cost: 30, desc: '你说的话似乎有种奇特的魔力，更容易说服他人。', effect_desc: '社交判定中，大幅提升成功率。', effects: {} },
  { id: 't12', name: '多面手（15点）', cost: 15, desc: '你对什么都懂一点。', effect_desc: '所有技能的初始等级+1。', effects: { skill: { all: 1 } } }
]

// 家庭背景选项
const familyOptions = {
  f1: { name: '普通家庭（20点）', cost: 20, money: 20000, desc: '标准的工薪阶层，初始财力中等。' },
  f2: { name: '富裕家庭（40点）', cost: 40, money: 300000, desc: '父母是成功的商人，初始财力丰厚。' },
  f3: { name: '书香门第（30点）', cost: 30, money: 100000, desc: '世代为学者，初始“智商”获得少量加成。', effects: { iq: 2 } },
  f4: { name: '体育世家（30点）', cost: 30, money: 50000, desc: '家族成员多为运动员。', effects: { physique: 2, flexibility: 1 } },
  f5: { name: '单亲家庭（15点）', cost: 15, money: 10000, desc: '与母亲/父亲一同生活。', effects: { eq: 2 } },
  f6: { name: '偏远乡村（10点）', cost: 10, money: 10000, desc: '来自乡下，初始财力较低。', effects: { physique: 1 } },
  f7: { name: '没落贵族（25点）', cost: 25, money: 20000, desc: '家族曾有过辉煌历史，持有一件“传家宝”。', items: [{ id: 'heirloom', name: '传家宝', description: '家族流传下来的神秘物品，似乎隐藏着某种力量。', type: 'key_item', effect: '未知', count: 1 }] },
  f8: { name: '艺术之家（30点）', cost: 30, money: 100000, desc: '父母是艺术家。', effects: { charm: 2 } },
  f9: { name: '家道中落（-10点）', cost: -10, money: 5000, desc: '曾经富裕但现在陷入困境。' },
  custom: { name: '自定义（50点）', cost: 50, desc: '完全自定义你的出身背景。' }
}

// 游戏模式定义
const gameModes = {
  dragon: { label: '天龙模式', points: 999 },
  story: { label: '剧情模式', points: 150 },
  normal: { label: '普通模式', points: 120 },
  challenge: { label: '挑战模式', points: 100 }
}

// 初始属性值 (参考 gameStore)
const initialStats = {
  attributes: { iq: 60, eq: 60, physique: 60, flexibility: 60, charm: 60, mood: 60 },
  potentials: { iq: 85, eq: 85, physique: 85, flexibility: 85, charm: 85, mood: 85 },
  subjects: { literature: 15, math: 15, english: 15, humanities: 15, sciences: 15, art: 15, sports: 15 },
  skills: { programming: 0, painting: 0, guitar: 0, piano: 0, urbanLegend: 0, cooking: 0, hacking: 0, socialMedia: 0, photography: 0, videoEditing: 0 }
}

// 计算当前基础属性 (初始 + 家庭 + 经历)
const baseStats = computed(() => {
  // 深拷贝初始值
  const stats = JSON.parse(JSON.stringify(initialStats))
  
  // 辅助函数：应用数据
  const applyData = (data) => {
    if (!data) return
    // 属性
    if (data.attributes) {
      for (const key in data.attributes) {
        if (stats.attributes[key] !== undefined) stats.attributes[key] += data.attributes[key]
      }
    }
    // 学科
    if (data.subjects) {
      for (const key in data.subjects) {
        if (stats.subjects[key] !== undefined) stats.subjects[key] += data.subjects[key]
      }
    }
    // 技能
    if (data.skills) {
      for (const key in data.skills) {
        if (stats.skills[key] !== undefined) stats.skills[key] += data.skills[key]
      }
    }
    // 潜力
    if (data.potentials) {
      for (const key in data.potentials) {
        if (stats.potentials[key] !== undefined) stats.potentials[key] += data.potentials[key]
      }
    }
  }

  // 1. 家庭背景
  if (formData.value.familyBackground === 'custom') {
    applyData(customData.value.family)
  } else {
    const family = familyOptions[formData.value.familyBackground]
    if (family && family.effects) {
      for (const key in family.effects) {
        if (stats.attributes[key] !== undefined) stats.attributes[key] += family.effects[key]
      }
    }
  }

  // 2. 经历加成
  const applyExpEffects = (ids, options, customDataArray) => {
    ids.forEach((id, index) => {
      if (id === 'custom') {
        applyData(customDataArray[index])
      } else {
        const exp = options.find(e => e.id === id)
        if (!exp || !exp.effects) return

        // 基础属性
        if (exp.effects.attr) {
          for (const key in exp.effects.attr) {
            const attrKey = attrMap[key]
            if (attrKey && stats.attributes[attrKey] !== undefined) {
              stats.attributes[attrKey] += exp.effects.attr[key]
            }
          }
        }
        // 学科
        if (exp.effects.knowledge) {
          if (exp.effects.knowledge.all) {
            for (const subjKey in stats.subjects) {
              stats.subjects[subjKey] += exp.effects.knowledge.all
            }
          } else {
            for (const key in exp.effects.knowledge) {
              const subjKey = attrMap[key]
              if (subjKey && stats.subjects[subjKey] !== undefined) {
                stats.subjects[subjKey] += exp.effects.knowledge[key]
              }
            }
          }
        }
        // 技能
        if (exp.effects.skill) {
          if (exp.effects.skill.all) {
            for (const skillKey in stats.skills) {
              stats.skills[skillKey] += exp.effects.skill.all
            }
          } else {
            for (const key in exp.effects.skill) {
              const skillKey = attrMap[key]
              if (skillKey && stats.skills[skillKey] !== undefined) {
                stats.skills[skillKey] += exp.effects.skill[key]
              }
            }
          }
        }
        // 软上限
        if (exp.effects.softCap) {
          for (const key in exp.effects.softCap) {
            const attrKey = attrMap[key]
            if (attrKey && stats.potentials[attrKey] !== undefined) {
              stats.potentials[attrKey] += exp.effects.softCap[key]
            }
          }
        }
      }
    })
  }

  applyExpEffects(formData.value.childhood, childhoodOptions, customData.value.childhood)
  applyExpEffects(formData.value.elementary, elementaryOptions, customData.value.elementary)
  applyExpEffects(formData.value.middleSchool, middleSchoolOptions, customData.value.middleSchool)
  applyExpEffects(formData.value.talents, talentOptions, customData.value.talents)

  return stats
})

// 计算属性分配消耗
const allocationCost = computed(() => {
  let cost = 0
  const data = formData.value.allocatedAttributes
  if (!data) return 0
  
  if (data.attributes) for (const key in data.attributes) cost += data.attributes[key]
  if (data.subjects) for (const key in data.subjects) cost += data.subjects[key]
  if (data.skills) for (const key in data.skills) cost += data.skills[key]
  if (data.potentials) for (const key in data.potentials) cost += data.potentials[key] * 2
  
  return cost
})

// 计算当前点数
const currentPoints = computed(() => {
  let points = gameModes[formData.value.gameMode]?.points || 0
  
  // 扣除家庭背景消耗
  const family = familyOptions[formData.value.familyBackground]
  if (family) {
    points -= family.cost
  }

  // 扣除经历消耗
  const deductExperienceCost = (ids, options) => {
    ids.forEach(id => {
      const exp = options.find(e => e.id === id)
      if (exp) points -= exp.cost
    })
  }

  deductExperienceCost(formData.value.childhood, childhoodOptions)
  deductExperienceCost(formData.value.elementary, elementaryOptions)
  deductExperienceCost(formData.value.middleSchool, middleSchoolOptions)
  deductExperienceCost(formData.value.talents, talentOptions)
  
  // 扣除属性分配消耗
  points -= allocationCost.value

  return points
})

const selectedFamily = computed(() => familyOptions[formData.value.familyBackground])

// 获取选中的经历对象
const getSelectedExperiences = (ids, options) => {
  return ids.map(id => options.find(e => e.id === id)).filter(Boolean)
}

const handleStart = async () => {
  // 表单验证
  if (!formData.value.name.trim()) {
    alert('请填写姓名！')
    const el = document.querySelector('input[placeholder="请输入姓名"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
      el.classList.add('shake-animation')
      setTimeout(() => el.classList.remove('shake-animation'), 500)
    }
    return
  }

  if (!formData.value.characterFeature.trim()) {
    alert('请填写角色特征！')
    const el = document.querySelector('input[placeholder="请输入角色特征（如：性格、外貌等）"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus()
      el.classList.add('shake-animation')
      setTimeout(() => el.classList.remove('shake-animation'), 500)
    }
    return
  }

  if (!formData.value.classId) {
    alert('请选择班级！')
    const el = document.querySelector('select') // 假设班级选择框是页面上靠前的 select 之一，或者可以通过更精确的选择器
    // 由于有多个 select，我们需要更精确地定位。班级选择框绑定了 formData.classId
    // 我们可以通过遍历 select 元素来找到绑定了 classId 的那个，或者简单地滚动到“基本信息”区域
    const classSelect = Array.from(document.querySelectorAll('select')).find(s => s.value === formData.value.classId || s.options[0].text === '请选择班级')
    if (classSelect) {
      classSelect.scrollIntoView({ behavior: 'smooth', block: 'center' })
      classSelect.focus()
      classSelect.classList.add('shake-animation')
      setTimeout(() => classSelect.classList.remove('shake-animation'), 500)
    }
    return
  }

  showProfile.value = true
  await nextTick()
}

const confirmSignature = async () => {
  // 重置游戏状态（隔离存档）
  await gameStore.startNewGame()

  // 这里将来会处理开始游戏的逻辑，比如保存数据到 store
  gameStore.setPlayerName(formData.value.name)
  gameStore.player.characterFeature = formData.value.characterFeature
  gameStore.player.backgroundStory = formData.value.backgroundStory
  gameStore.player.newGameGuideTurns = 3 // 初始化新游戏引导回合数
  
  // 设置世界书策略（选中班级蓝灯，其他绿灯）并创建班级群
  if (formData.value.classId) {
    await setPlayerClass(formData.value.classId)
    // 设置玩家班级并生成课表，这个函数会自动调用 joinClassGroup
    // 创建班级群并保存到世界书
    await gameStore.setPlayerClass(formData.value.classId)
  }

  // 辅助函数：应用自定义数据
  const applyCustomData = (data) => {
    // 属性
    for (const key in data.attributes) {
      // @ts-ignore
      gameStore.player.attributes[key] += data.attributes[key]
    }
    // 学科
    for (const key in data.subjects) {
      // @ts-ignore
      gameStore.player.subjects[key] += data.subjects[key]
    }
    // 技能
    for (const key in data.skills) {
      // @ts-ignore
      gameStore.player.skills[key] += data.skills[key]
    }
  }

  // 处理家庭背景
  if (formData.value.familyBackground === 'custom') {
    // 自定义背景
    gameStore.player.money = customData.value.family.money
    applyCustomData(customData.value.family)
  } else {
    // 预设背景
    const family = familyOptions[formData.value.familyBackground]
    if (family) {
      // 资金
      gameStore.player.money = family.money || 0
      
      // 属性加成
      if (family.effects) {
        for (const key in family.effects) {
          // @ts-ignore
          gameStore.player.attributes[key] += family.effects[key]
        }
      }
      
      // 物品
      if (family.items) {
        family.items.forEach(item => {
          // @ts-ignore
          gameStore.addItem(item)
        })
      }
    }
  }

  // 处理经历加成
  const applyEffects = (ids, options, customDataArray) => {
    ids.forEach((id, index) => {
      if (id === 'custom') {
        // 应用自定义经历数据
        applyCustomData(customDataArray[index])
      } else {
        const exp = options.find(e => e.id === id)
        if (!exp || !exp.effects) return

        // 基础属性
        if (exp.effects.attr) {
          for (const key in exp.effects.attr) {
            const attrKey = attrMap[key]
            if (attrKey) {
              // @ts-ignore
              gameStore.player.attributes[attrKey] += exp.effects.attr[key]
            }
          }
        }

        // 学科知识
        if (exp.effects.knowledge) {
          if (exp.effects.knowledge.all) {
            // 全科加成
            for (const subjKey in gameStore.player.subjects) {
              // @ts-ignore
              gameStore.player.subjects[subjKey] += exp.effects.knowledge.all
            }
          } else {
            for (const key in exp.effects.knowledge) {
              const subjKey = attrMap[key]
              if (subjKey) {
                // @ts-ignore
                gameStore.player.subjects[subjKey] += exp.effects.knowledge[key]
              }
            }
          }
        }

        // 生活技能
        if (exp.effects.skill) {
          if (exp.effects.skill.all) {
            // 全技能加成
            for (const skillKey in gameStore.player.skills) {
              // @ts-ignore
              gameStore.player.skills[skillKey] += exp.effects.skill.all
            }
          } else {
            for (const key in exp.effects.skill) {
              const skillKey = attrMap[key]
              if (skillKey) {
                // @ts-ignore
                gameStore.player.skills[skillKey] += exp.effects.skill[key]
              }
            }
          }
        }

        // 软上限 (潜力值)
        if (exp.effects.softCap) {
          for (const key in exp.effects.softCap) {
            const attrKey = attrMap[key]
            if (attrKey) {
              // @ts-ignore
              gameStore.player.potentials[attrKey] += exp.effects.softCap[key]
            }
          }
        }
      }
    })
  }

  applyEffects(formData.value.childhood, childhoodOptions, customData.value.childhood)
  applyEffects(formData.value.elementary, elementaryOptions, customData.value.elementary)
  applyEffects(formData.value.middleSchool, middleSchoolOptions, customData.value.middleSchool)
  applyEffects(formData.value.talents, talentOptions, customData.value.talents)

  // 应用属性分配
  const allocated = formData.value.allocatedAttributes
  if (allocated) {
    // 属性
    if (allocated.attributes) {
      for (const key in allocated.attributes) {
        // @ts-ignore
        gameStore.player.attributes[key] += allocated.attributes[key]
      }
    }
    // 潜力
    if (allocated.potentials) {
      for (const key in allocated.potentials) {
        // @ts-ignore
        gameStore.player.potentials[key] += allocated.potentials[key]
      }
    }
    // 学科
    if (allocated.subjects) {
      for (const key in allocated.subjects) {
        // @ts-ignore
        gameStore.player.subjects[key] += allocated.subjects[key]
      }
    }
    // 技能
    if (allocated.skills) {
      for (const key in allocated.skills) {
        // @ts-ignore
        gameStore.player.skills[key] += allocated.skills[key]
      }
    }
  }

  // 保存选中的天赋ID
  gameStore.player.talents = formData.value.talents.filter(Boolean)
  
  // 保存自定义课程池数据
  gameStore.customCoursePool = getCoursePoolState()

  // 初始化论坛默认帖子
  gameStore.player.forum.posts = JSON.parse(JSON.stringify(DEFAULT_FORUM_POSTS))
  console.log('[GameStart] Initialized forum with default posts:', gameStore.player.forum.posts.length)
  
  // 创建论坛世界书条目
  await saveForumToWorldbook(
    gameStore.player.forum.posts,
    gameStore.currentRunId,
    gameStore.settings.forumWorldbookLimit
  )
  console.log('[GameStart] Forum worldbook entry created')
  
  console.log('Start Game with:', formData.value, customData.value)
  emit('startGame')
}
</script>

<template>
  <div class="game-start-wrapper">
    <div class="paper-panel">
      <div class="header-section">
        <div class="header-actions">
          <button class="action-btn small" @click="showCourseEditor = true">编辑课程表</button>
          <button class="action-btn small" @click="showFilterPanel = true">筛选全校名册</button>
          <button class="action-btn small" @click="showScheduleEditor = true">角色日程编辑器</button>
          <button class="action-btn small" @click="showEventEditor = true">事件编辑器</button>
          <button class="action-btn small highlight" @click="showTransferPanel = true">导出/导入设置</button>
        </div>
        <img src="https://files.catbox.moe/efg1xe.png" alt="School Logo" class="school-logo" />
        <h1 class="doc-title">入学通知书</h1>
      </div>
      
      <div class="content-section">
        <p class="intro-text">请填写您的个人信息以完成注册。</p>
        
        <!-- 点数计数器 -->
        <div class="points-counter">
          <span class="points-label">可用点数：</span>
          <span class="points-value">{{ currentPoints }}</span>
        </div>

        <div class="form-section">
          <h3 class="section-title">一、基本信息</h3>
          
          <div class="form-row">
            <label>姓名：</label>
            <input type="text" v-model="formData.name" placeholder="请输入姓名" class="input-field" />
          </div>

          <div class="form-row">
            <label>性别：</label>
            <select v-model="formData.gender" class="input-field">
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>

          <div class="form-row">
            <label>特征：</label>
            <input type="text" v-model="formData.characterFeature" placeholder="请输入角色特征（如：性格、外貌等）" class="input-field" />
          </div>

          <div class="form-row" style="align-items: flex-start;">
            <label>背景：</label>
            <textarea 
              v-model="formData.backgroundStory" 
              placeholder="请输入人物背景故事（可选）" 
              class="input-field"
              style="height: 100px; resize: vertical;"
            ></textarea>
          </div>

          <div class="form-row">
            <label>班级：</label>
            <select v-model="formData.classId" class="input-field">
              <option value="" disabled>请选择班级</option>
              <option v-for="(data, id) in gameStore.allClassData" :key="id" :value="id">
                {{ data.name }}
              </option>
            </select>
          </div>

          <div class="class-info-box">
            <pre>{{ classInfoText }}</pre>
          </div>

          <!-- 班级名册按钮 -->
          <div v-if="formData.classId" class="roster-btn-container">
            <button class="action-btn small" @click="showRoster = true">修改班级名册</button>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">二、人生设定</h3>
          
          <div class="form-row">
            <label>人生目标：</label>
            <select v-model="formData.gameMode" class="input-field">
              <option v-for="(mode, key) in gameModes" :key="key" :value="key">
                {{ mode.label }} ({{ mode.points }}点)
              </option>
            </select>
          </div>

          <div class="form-row">
            <label>家庭背景：</label>
            <select v-model="formData.familyBackground" class="input-field">
              <option v-for="(opt, key) in familyOptions" :key="key" :value="key">
                {{ opt.name }}
              </option>
            </select>
          </div>
          
          <!-- 背景描述预览 -->
          <div v-if="selectedFamily && formData.familyBackground !== 'custom'" class="family-preview">
            <p class="family-desc">{{ selectedFamily.desc }}</p>
            <p class="family-money">初始资金：{{ selectedFamily.money }} 日元</p>
            <div v-if="selectedFamily.effects" class="family-effects">
              <span v-for="(val, key) in selectedFamily.effects" :key="key" class="effect-tag">
                {{ attributesList.find(a => a.key === key)?.label }}: +{{ val }}
              </span>
            </div>
            <div v-if="selectedFamily.items" class="family-items">
              <span v-for="item in selectedFamily.items" :key="item.id" class="item-tag">
                获得物品: {{ item.name }}
              </span>
            </div>
          </div>

          <!-- 自定义加点面板 (家庭背景) -->
          <CustomOptionPanel 
            v-if="formData.familyBackground === 'custom'" 
            v-model="customData.family" 
            :show-money="true"
          />
        </div>

        <!-- 经历选择部分 -->
        <div class="form-section">
          <h3 class="section-title">三、幼年经历</h3>
          <div v-for="(val, index) in formData.childhood" :key="'c'+index">
            <div class="form-row">
              <label>经历 {{ index + 1 }}：</label>
              <select v-model="formData.childhood[index]" class="input-field">
                <option value="">(无)</option>
                <option v-for="opt in childhoodOptions" :key="opt.id" :value="opt.id" :disabled="formData.childhood.includes(opt.id) && formData.childhood[index] !== opt.id">
                  {{ opt.name }}
                </option>
              </select>
            </div>
            <!-- 自定义面板 -->
            <CustomOptionPanel 
              v-if="formData.childhood[index] === 'custom'" 
              v-model="customData.childhood[index]" 
            />
          </div>
          <!-- 预览 -->
          <div v-if="getSelectedExperiences(formData.childhood, childhoodOptions).length > 0" class="family-preview">
            <div v-for="exp in getSelectedExperiences(formData.childhood, childhoodOptions)" :key="exp.id" class="exp-preview-item">
              <template v-if="exp.id !== 'custom'">
                <strong>{{ exp.name }}:</strong> {{ exp.desc }}
              </template>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">四、小学经历</h3>
          <div v-for="(val, index) in formData.elementary" :key="'e'+index">
            <div class="form-row">
              <label>经历 {{ index + 1 }}：</label>
              <select v-model="formData.elementary[index]" class="input-field">
                <option value="">(无)</option>
                <option v-for="opt in elementaryOptions" :key="opt.id" :value="opt.id" :disabled="formData.elementary.includes(opt.id) && formData.elementary[index] !== opt.id">
                  {{ opt.name }}
                </option>
              </select>
            </div>
            <!-- 自定义面板 -->
            <CustomOptionPanel 
              v-if="formData.elementary[index] === 'custom'" 
              v-model="customData.elementary[index]" 
            />
          </div>
          <!-- 预览 -->
          <div v-if="getSelectedExperiences(formData.elementary, elementaryOptions).length > 0" class="family-preview">
            <div v-for="exp in getSelectedExperiences(formData.elementary, elementaryOptions)" :key="exp.id" class="exp-preview-item">
              <template v-if="exp.id !== 'custom'">
                <strong>{{ exp.name }}:</strong> {{ exp.desc }}
              </template>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">五、初中经历</h3>
          <div v-for="(val, index) in formData.middleSchool" :key="'m'+index">
            <div class="form-row">
              <label>经历 {{ index + 1 }}：</label>
              <select v-model="formData.middleSchool[index]" class="input-field">
                <option value="">(无)</option>
                <option v-for="opt in middleSchoolOptions" :key="opt.id" :value="opt.id" :disabled="formData.middleSchool.includes(opt.id) && formData.middleSchool[index] !== opt.id">
                  {{ opt.name }}
                </option>
              </select>
            </div>
            <!-- 自定义面板 -->
            <CustomOptionPanel 
              v-if="formData.middleSchool[index] === 'custom'" 
              v-model="customData.middleSchool[index]" 
            />
          </div>
          <!-- 预览 -->
          <div v-if="getSelectedExperiences(formData.middleSchool, middleSchoolOptions).length > 0" class="family-preview">
            <div v-for="exp in getSelectedExperiences(formData.middleSchool, middleSchoolOptions)" :key="exp.id" class="exp-preview-item">
              <template v-if="exp.id !== 'custom'">
                <strong>{{ exp.name }}:</strong> {{ exp.desc }}
              </template>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">六、天赋选择</h3>
          <div v-for="(val, index) in formData.talents" :key="'t'+index">
            <div class="form-row">
              <label>天赋 {{ index + 1 }}：</label>
              <select v-model="formData.talents[index]" class="input-field">
                <option value="">(无)</option>
                <option v-for="opt in talentOptions" :key="opt.id" :value="opt.id" :disabled="formData.talents.includes(opt.id) && formData.talents[index] !== opt.id">
                  {{ opt.name }}
                </option>
              </select>
            </div>
            <!-- 自定义面板 -->
            <CustomOptionPanel 
              v-if="formData.talents[index] === 'custom'" 
              v-model="customData.talents[index]" 
            />
          </div>
          <!-- 预览 -->
          <div v-if="getSelectedExperiences(formData.talents, talentOptions).length > 0" class="family-preview">
            <div v-for="exp in getSelectedExperiences(formData.talents, talentOptions)" :key="exp.id" class="exp-preview-item">
              <template v-if="exp.id !== 'custom'">
                <strong>{{ exp.name }}:</strong> {{ exp.desc }} <span v-if="exp.effect_desc" style="color: #d32f2f; font-size: 0.85rem;">({{ exp.effect_desc }})</span>
              </template>
            </div>
          </div>
        </div>

        <!-- 属性分配面板 -->
        <AttributeAllocationPanel 
          v-model="formData.allocatedAttributes"
          :base-stats="baseStats"
          :remaining-points="currentPoints"
        />

        <div class="button-group">
          <button 
            class="action-btn" 
            @click="handleStart" 
            :disabled="currentPoints < 0"
            :title="currentPoints < 0 ? '点数不足，无法入学' : ''"
          >确认入学</button>
          <button class="action-btn secondary" @click="$emit('back')">返回</button>
        </div>
      </div>
    </div>

    <!-- 新生档案确认页 -->
    <StudentProfile 
      v-if="showProfile" 
      :form-data="formData" 
      :custom-data="customData"
      :options="{ family: familyOptions, childhood: childhoodOptions, elementary: elementaryOptions, middleSchool: middleSchoolOptions, talents: talentOptions }"
      @sign="confirmSignature"
      @back="showProfile = false"
    />

    <!-- 班级名册面板 -->
    <ClassRosterPanel 
      v-if="showRoster"
      v-model="customData.classRoster"
      :class-id="formData.classId"
      @close="showRoster = false"
    />

    <!-- 课程编辑器面板 -->
    <CourseEditor 
      v-if="showCourseEditor"
      @close="showCourseEditor = false"
    />

    <!-- 全校名册筛选面板 -->
    <SchoolRosterFilterPanel 
      v-if="showFilterPanel"
      @close="handleFilterClose"
    />

    <!-- 事件编辑器面板 -->
    <EventEditorPanel
      v-if="showEventEditor"
      @close="showEventEditor = false"
    />

    <!-- NPC日程编辑器面板 -->
    <NpcScheduleEditorPanel
      v-if="showScheduleEditor"
      @close="showScheduleEditor = false"
    />

    <!-- 数据迁移面板 -->
    <DataTransferPanel
      v-if="showTransferPanel"
      @close="showTransferPanel = false"
    />
  </div>
</template>

<style scoped>
.game-start-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.paper-panel {
  background-color: #fdfbf3; /* 护眼纸张色 */
  color: #333;
  padding: 3rem;
  border-radius: 2px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  width: 800px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .paper-panel {
    width: 95%;
    padding: 1.5rem;
    max-height: 85vh;
  }

  .header-section {
    margin-bottom: 20px;
  }

  .doc-title {
    font-size: 2rem;
  }

  .content-section {
    padding: 0;
  }

  .form-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-row label {
    width: 100%;
    margin-bottom: 5px;
  }

  .input-field {
    width: 100%;
  }

  .attributes-grid {
    grid-template-columns: 1fr;
  }

  .button-group {
    flex-direction: column;
    gap: 1rem;
  }

  .action-btn {
    width: 100%;
  }
}

.header-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 20px;
  margin-bottom: 30px;
  position: relative;
}

.header-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.doc-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 3rem;
  color: #d32f2f; /* 红色标题，配合红线 */
  margin: 10px 0 0 0;
  letter-spacing: 5px;
}

/* 红色横线分割 */
.header-section::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 10%; /* 稍微留白，不占满全宽，更有文件感 */
  width: 80%;
  height: 2px;
  background-color: #d32f2f; /* 红色 */
}

.school-logo {
  height: 100px; /* 根据实际图片调整 */
  object-fit: contain;
}

.content-section {
  width: 100%;
  padding: 0 2rem;
  box-sizing: border-box;
}

.intro-text {
  text-align: center;
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #555;
}

.points-counter {
  text-align: center;
  margin-bottom: 2rem;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.5rem;
  color: #d32f2f;
  border: 2px solid #d32f2f;
  display: inline-block;
  padding: 5px 20px;
  border-radius: 50px; /* 椭圆印章风格 */
  transform: rotate(-2deg); /* 稍微倾斜，增加手写/印章感 */
}

.points-value {
  font-weight: bold;
  font-size: 1.8rem;
}

.form-section {
  width: 100%;
  margin-bottom: 2rem;
  text-align: left;
}

.section-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.8rem;
  color: #333;
  border-bottom: 1px solid #d32f2f; /* 细红线 */
  padding-bottom: 5px;
  margin-bottom: 20px;
}

.form-row {
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}

.form-row label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.4rem;
  width: 80px;
  color: #444;
}

.input-field {
  flex: 1;
  padding: 8px;
  font-size: 1.1rem;
  border: none;
  border-bottom: 1px solid #888; /* 下划线风格输入框 */
  background: transparent;
  outline: none;
  font-family: 'Arial', sans-serif; /* 输入内容用常规字体 */
}

.input-field:focus {
  border-bottom-color: #d32f2f;
}

.class-info-box {
  width: 100%;
  height: 150px; /* 稍微增高以便显示更多内容 */
  border: 1px solid #ccc;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 10px;
  margin-top: 10px;
  font-size: 0.9rem;
  color: #333;
  overflow-y: auto;
  border-radius: 4px;
  white-space: pre-wrap; /* 保留换行 */
  font-family: 'Courier New', Courier, monospace; /* 等宽字体对齐 */
}

.class-info-box pre {
  margin: 0;
  font-family: inherit;
}

.button-group {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.action-btn {
  padding: 10px 30px;
  font-size: 1.4rem;
  background-color: #d32f2f; /* 红色印章感 */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  font-family: 'Ma Shan Zheng', cursive;
  box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
}

.action-btn:hover {
  background-color: #b71c1c;
  transform: scale(1.05);
}

.action-btn:disabled {
  background-color: #9e9e9e;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.action-btn.secondary {
  background-color: #795548; /* 棕色 */
}

.action-btn.secondary:hover {
  background-color: #5d4037;
}

.roster-btn-container {
  text-align: center;
  margin-bottom: 10px;
}

.custom-panel {
  background-color: rgba(0, 0, 0, 0.03);
  padding: 20px;
  border-radius: 8px;
  border: 1px dashed #888;
  margin-bottom: 20px;
}

.unit {
  margin-left: 10px;
  color: #666;
  font-size: 0.9rem;
}

.attributes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  margin-top: 15px;
}

.attr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 8px;
  border-radius: 4px;
}

.attr-label {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.2rem;
  width: 50px;
}

.attr-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #888;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.attr-value {
  font-weight: bold;
  width: 20px;
  text-align: center;
}

.attr-potential {
  font-size: 0.8rem;
  color: #888;
  margin-left: 10px;
}

.points-info {
  text-align: right;
  margin-bottom: 10px;
  font-weight: bold;
  color: #555;
}

.no-points {
  color: #d32f2f;
}

.extra-options-section {
  margin-top: 20px;
  border-top: 1px dashed #ccc;
  padding-top: 15px;
}

.toggle-btn {
  width: 100%;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.1rem;
  color: #555;
  transition: background-color 0.3s;
}

.toggle-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.sub-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 1.3rem;
  color: #444;
  margin: 15px 0 10px 0;
  border-left: 3px solid #d32f2f;
  padding-left: 10px;
}

.family-preview {
  background-color: rgba(0, 0, 0, 0.03);
  padding: 15px;
  border-radius: 4px;
  margin-top: 10px;
  font-size: 0.95rem;
}

.family-desc {
  margin: 0 0 5px 0;
  color: #333;
}

.family-money {
  margin: 0 0 5px 0;
  color: #8b4513;
  font-weight: bold;
}

.family-effects, .family-items {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 5px;
}

.effect-tag {
  background-color: #e8f5e9;
  color: #2e7d32;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85rem;
  border: 1px solid #c8e6c9;
}

.item-tag {
  background-color: #fff3e0;
  color: #ef6c00;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85rem;
  border: 1px solid #ffe0b2;
}

.exp-preview-item {
  margin-bottom: 5px;
  font-size: 0.9rem;
  color: #555;
}

.shake-animation {
  animation: shake 0.5s;
  border-bottom-color: #d32f2f !important;
}

@keyframes shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(5px); }
  75% { transform: translateX(-5px); }
  100% { transform: translateX(0); }
}

.action-btn.small {
  font-size: 0.8rem;
  padding: 4px 10px;
  min-width: 90px;
}

.action-btn.small.highlight {
  background-color: #f57c00; /* 橙色高亮 */
}

.action-btn.small.highlight:hover {
  background-color: #ef6c00;
}
</style>
