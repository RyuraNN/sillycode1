// -*- coding: utf-8 -*-
/**
 * 角色关系系统数据结构和默认值
 */

// 关系分组类型 (对应手机通讯录分组)
export const RELATIONSHIP_GROUPS = {
  classmate: { name: '同学', color: '#607D8B' },
  friend: { name: '朋友', color: '#4CAF50' },
  closeFriend: { name: '密友', color: '#2196F3' },
  lover: { name: '恋人', color: '#E91E63' },
  family: { name: '家人', color: '#795548' },
  clubMember: { name: '社团成员', color: '#FF9800' },
  senior: { name: '前辈', color: '#9C27B0' },
  junior: { name: '后辈', color: '#00BCD4' },
  teacher_student: { name: '师生', color: '#795548' },
  other: { name: '其他', color: '#9E9E9E' }
}

// 关系轴说明
export const RELATIONSHIP_AXES = {
  intimacy: {
    name: '亲密度',
    description: '情感距离',
    min: -100,
    max: 100,
    labels: { min: '疏远', max: '亲密' }
  },
  trust: {
    name: '信赖度',
    description: '可靠性判断',
    min: -100,
    max: 100,
    labels: { min: '猜忌', max: '信赖' }
  },
  passion: {
    name: '激情度',
    description: '浪漫吸引力',
    min: -100,
    max: 100,
    labels: { min: '反感', max: '热情' }
  },
  hostility: {
    name: '敌意',
    description: '负面关系强度',
    min: 0,
    max: 100,
    labels: { min: '无', max: '死敌' }
  }
}

// 性格轴说明
export const PERSONALITY_AXES = {
  order: {
    name: '秩序',
    description: '守序/混乱倾向',
    min: -100,
    max: 100,
    labels: { min: '混乱', max: '守序' }
  },
  altruism: {
    name: '利他',
    description: '利他/利己倾向',
    min: -100,
    max: 100,
    labels: { min: '利己', max: '利他' }
  },
  tradition: {
    name: '传统',
    description: '传统/革新倾向',
    min: -100,
    max: 100,
    labels: { min: '革新', max: '传统' }
  },
  peace: {
    name: '和平',
    description: '和平/暴力倾向',
    min: -100,
    max: 100,
    labels: { min: '暴力', max: '和平' }
  }
}

// 行动优先级说明
export const PRIORITY_TYPES = {
  academics: { name: '学业', icon: '📚' },
  social: { name: '社交', icon: '👥' },
  hobbies: { name: '爱好', icon: '🎮' },
  survival: { name: '生存', icon: '💪' },
  club: { name: '社团', icon: '🏫' }
}

/**
 * 默认角色关系网络
 * 格式：{ 源角色名: { 目标角色名: RelationshipData } }
 * 
 * RelationshipData 结构：
 * {
 *   intimacy: number,    // 亲密度 -100到100
 *   trust: number,       // 信赖度 -100到100
 *   passion: number,     // 激情度 -100到100
 *   hostility: number,   // 敌意 0到100
 *   groups: string[],    // 分组标签
 *   tags: string[],      // 印象标签
 * }
 */
export const DEFAULT_RELATIONSHIPS = {
  // === 1年A班 ===
  // 教师
  '平冢静': {
    '比企谷八幡': { intimacy: 60, trust: 70, passion: 10, hostility: 5, groups: ['teacher_student'], tags: ['令人操心的学生'] }
  },
  '武田一鉄': {
    '日向翔阳': { intimacy: 50, trust: 60, passion: 40, hostility: 0, groups: ['teacher_student'], tags: ['很有活力的学生'] }
  },
  '伊莉娜·耶拉比琪': {
    '乌间惟臣': { intimacy: 75, trust: 80, passion: 60, hostility: 0, groups: ['other'], tags: ['木头人同事'] }
  },
  '鬼冢英吉': {
    '冬月梓': { intimacy: 90, trust: 80, passion: 50, hostility: 0, groups: ['other'], tags: ['想约会'] }
  },
  '泷昇': {
    '高坂丽奈': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['teacher_student'], tags: ['有才华的学生'] }
  },
  '幸田实果子': {
    '矢泽艺术成员': { intimacy: 70, trust: 80, passion: 20, hostility: 0, groups: ['teacher_student'], tags: ['可爱的学生们'] }
  },
  // 孤独摇滚
  '后藤一里': {
    '伊地知虹夏': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['下北泽的大天使'] }
  },
  '伊地知虹夏': {
    '后藤一里': { intimacy: 70, trust: 65, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['虽然阴沉但吉他很帅'] }
  },
  '喜多郁代': {
    '后藤一里': { intimacy: 60, trust: 50, passion: 25, hostility: 0, groups: ['friend'], tags: ['吉他英雄'] }
  },
  '山田凉': {
    '后藤一里': { intimacy: 55, trust: 60, passion: 5, hostility: 0, groups: ['friend'], tags: ['借钱的好对象'] }
  },
  // MyGo
  '高松灯': {
    '千早爱音': { intimacy: 60, trust: 55, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['迷路时的同伴'] }
  },
  '千早爱音': {
    '高松灯': { intimacy: 65, trust: 60, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['放不下的主唱'] }
  },
  '要乐奈': {
    '高松灯': { intimacy: 50, trust: 40, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['有趣的女人'] }
  },
  '椎名立希': {
    '高松灯': { intimacy: 80, trust: 70, passion: 40, hostility: 0, groups: ['clubMember'], tags: ['最重要的人'] }
  },
  '长崎素世': {
    'MyGO成员': { intimacy: 40, trust: 30, passion: 5, hostility: 10, groups: ['clubMember'], tags: ['为了复活Crychic'] }
  },
  // 玉子市场
  '北白川玉子': {
    '大路饼藏': { intimacy: 85, trust: 90, passion: 40, hostility: 0, groups: ['closeFriend'], tags: ['一直在一起的饼藏'] }
  },
  '常盘绿': {
    '北白川玉子': { intimacy: 85, trust: 90, passion: 30, hostility: 0, groups: ['closeFriend'], tags: ['想守护她的笑容'] }
  },
  '饭冢美代': {
    '常盘绿': { intimacy: 70, trust: 75, passion: 5, hostility: 0, groups: ['friend'], tags: ['可靠的吐槽役'] }
  },
  '大路饼藏': {
    '北白川玉子': { intimacy: 85, trust: 85, passion: 70, hostility: 0, groups: ['lover'], tags: ['最喜欢但说不出口'] }
  },
  // 我心里危险的东西
  '山田杏奈': {
    '市川京太郎': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['最喜欢了'] }
  },
  '市川京太郎': {
    '山田杏奈': { intimacy: 90, trust: 95, passion: 75, hostility: 0, groups: ['lover'], tags: ['想独占的可爱'] }
  },
  // 声之形
  '西宫硝子': {
    '石田将也': { intimacy: 75, trust: 80, passion: 40, hostility: 0, groups: ['friend'], tags: ['帮助我的人'] }
  },
  '西宫结弦': {
    '西宫硝子': { intimacy: 95, trust: 100, passion: 0, hostility: 0, groups: ['family'], tags: ['最亲爱的姐姐'] }
  },
  '永束友宏': {
    '石田将也': { intimacy: 80, trust: 75, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['最好的朋友'] }
  },
  '植野直花': {
    '西宫硝子': { intimacy: -20, trust: 10, passion: 5, hostility: 60, groups: ['classmate'], tags: ['看着就烦躁'] }
  },
  '佐原爱': {
    '西宫硝子': { intimacy: 60, trust: 65, passion: 5, hostility: 0, groups: ['classmate'], tags: ['想重新做好朋友'] }
  },
  '石田将也': {
    '西宫硝子': { intimacy: 70, trust: 75, passion: 30, hostility: 5, groups: ['friend'], tags: ['想补偿她'] }
  },
  // 其他学生
  '越前龙马': {
    '手冢国光': { intimacy: 40, trust: 80, passion: 10, hostility: 5, groups: ['clubMember'], tags: ['我要击败的部长'] }
  },
  '黑子テツヤ': {
    '火神大我': { intimacy: 75, trust: 85, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['光与影'] }
  },
  '七濑遥': {
    '橘真琴': { intimacy: 90, trust: 95, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['真琴一直在一起'] }
  },
  '我妻由乃': {
    '天野雪辉': { intimacy: 100, trust: 100, passion: 100, hostility: 0, groups: ['lover'], tags: ['阿雪是我的'] }
  },
  '爱城华恋': {
    '神乐光': { intimacy: 85, trust: 80, passion: 60, hostility: 0, groups: ['closeFriend'], tags: ['约好了两个人一起'] }
  },
  '島田真夢': {
    '林田藍里': { intimacy: 60, trust: 60, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['WUG的伙伴'] }
  },

  // === 1年B班 ===
  // 教师
  '吉田松阳': {
    '坂田银时': { intimacy: 95, trust: 100, passion: 0, hostility: 0, groups: ['teacher_student'], tags: ['重要的弟子'] }
  },
  '根津老师': {
    '学生们': { intimacy: 10, trust: 10, passion: 0, hostility: 5, groups: ['teacher_student'], tags: ['绝望了'] }
  },
  '乌间惟臣': {
    '伊莉娜·耶拉比琪': { intimacy: 50, trust: 70, passion: 20, hostility: 0, groups: ['other'], tags: ['麻烦的女人'] }
  },
  '桥田至': {
    '冈部伦太郎': { intimacy: 70, trust: 80, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['疯狂科学家'] }
  },
  // 五等分的新娘
  '中野一花': {
    '上杉风太郎': { intimacy: 65, trust: 60, passion: 45, hostility: 0, groups: ['friend'], tags: ['成熟的大姐姐角色'] }
  },
  '中野二乃': {
    '上杉风太郎': { intimacy: 50, trust: 40, passion: 60, hostility: 20, groups: ['friend'], tags: ['喜欢那个笨蛋'] }
  },
  '中野三玖': {
    '上杉风太郎': { intimacy: 80, trust: 75, passion: 70, hostility: 0, groups: ['lover'], tags: ['最喜欢风太郎'] }
  },
  '中野四叶': {
    '上杉风太郎': { intimacy: 90, trust: 85, passion: 30, hostility: 0, groups: ['friend'], tags: ['一直支持你'] }
  },
  '中野五月': {
    '上杉风太郎': { intimacy: 65, trust: 75, passion: 20, hostility: 5, groups: ['friend'], tags: ['饭友'] }
  },
  '上杉风太郎': {
    '中野五月': { intimacy: 60, trust: 70, passion: 10, hostility: 5, groups: ['friend'], tags: ['大胃王'] }
  },
  // 月色真美
  '安昙小太郎': {
    '水野茜': { intimacy: 85, trust: 90, passion: 75, hostility: 0, groups: ['lover'], tags: ['月色真美'] }
  },
  '水野茜': {
    '安昙小太郎': { intimacy: 85, trust: 90, passion: 70, hostility: 0, groups: ['lover'], tags: ['红薯玩偶'] }
  },
  // 政宗君的复仇
  '真壁政宗': {
    '安达垣爱姬': { intimacy: 40, trust: 30, passion: 60, hostility: 30, groups: ['other'], tags: ['复仇对象'] }
  },
  '安达垣爱姬': {
    '真壁政宗': { intimacy: 30, trust: 20, passion: 50, hostility: 40, groups: ['other'], tags: ['猪脚'] }
  },
  '小岩井吉乃': {
    '安达垣爱姬': { intimacy: 70, trust: 60, passion: 0, hostility: 10, groups: ['other'], tags: ['主仆'] }
  },
  '双叶妙': {
    '真壁政宗': { intimacy: 20, trust: 30, passion: 40, hostility: 0, groups: ['friend'], tags: ['有趣的帅哥'] }
  },
  // 艾莉同学
  '久世政近': {
    '艾莉': { intimacy: 70, trust: 75, passion: 50, hostility: 0, groups: ['friend'], tags: ['邻座的俄语同学'] }
  },
  '艾莉': {
    '久世政近': { intimacy: 75, trust: 80, passion: 65, hostility: 0, groups: ['friend'], tags: ['笨蛋'] }
  },
  // 式守同学 (部分)
  '猫崎享': {
    '式守': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['式守最帅了'] }
  },
  // 我想吃掉你的胰脏
  '山内樱良': {
    '志贺春树': { intimacy: 90, trust: 95, passion: 60, hostility: 0, groups: ['closeFriend'], tags: ['关系最好的同学'] }
  },
  '男主“我/志贺春树”': {
    '山内樱良': { intimacy: 85, trust: 90, passion: 50, hostility: 0, groups: ['closeFriend'], tags: ['想成为你'] }
  },
  '滨边隆弘': {
    '山内樱良': { intimacy: 30, trust: 20, passion: 50, hostility: 10, groups: ['other'], tags: ['前男友'] }
  },
  '恭子': {
    '山内樱良': { intimacy: 85, trust: 80, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['最好的朋友'] }
  },
  // 其他学生
  '桃城武': {
    '越前龙马': { intimacy: 75, trust: 80, passion: 5, hostility: 0, groups: ['senior'], tags: ['越前那家伙'] }
  },
  '黄瀬涼太': {
    '黑子テツヤ': { intimacy: 70, trust: 65, passion: 20, hostility: 0, groups: ['friend'], tags: ['小黑子'] }
  },
  '橘真琴': {
    '七濑遥': { intimacy: 95, trust: 100, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['遥的监护人'] }
  },
  '雨流美弥音': {
    '西岛': { intimacy: 40, trust: 60, passion: 30, hostility: 0, groups: ['lover'], tags: ['那个警察'] }
  },
  '神乐光': {
    '爱城华恋': { intimacy: 85, trust: 80, passion: 60, hostility: 0, groups: ['closeFriend'], tags: ['一起Starlight'] }
  },
  '林田藍里': {
    '島田真夢': { intimacy: 60, trust: 55, passion: 5, hostility: 0, groups: ['friend'], tags: ['WUG的中心'] }
  },

  // === 1年C班 ===
  // 教师
  '维尔维特·维斯·维': {
    '伊斯坎达尔': { intimacy: 90, trust: 100, passion: 20, hostility: 0, groups: ['other'], tags: ['我的王(印象)'] }
  },
  // 古见同学
  '古见硝子': {
    '只野仁人': { intimacy: 85, trust: 95, passion: 60, hostility: 0, groups: ['lover'], tags: ['第一个朋友'] }
  },
  '只野仁人': {
    '古见硝子': { intimacy: 85, trust: 90, passion: 55, hostility: 0, groups: ['lover'], tags: ['想帮她交朋友'] }
  },
  '长名奈奈': {
    '只野仁人': { intimacy: 70, trust: 60, passion: 5, hostility: 10, groups: ['friend'], tags: ['青梅竹马?'] }
  },
  '山井恋': {
    '古见硝子': { intimacy: 90, trust: 10, passion: 100, hostility: 0, groups: ['other'], tags: ['神的信徒'] }
  },
  // 魔卡少女樱
  '木之本樱': {
    '李小狼': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['最喜欢的小狼'] }
  },
  '李小狼': {
    '木之本樱': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['绝对要保护樱'] }
  },
  '大道寺知世': {
    '木之本樱': { intimacy: 100, trust: 100, passion: 50, hostility: 0, groups: ['closeFriend'], tags: ['小樱最可爱'] }
  },
  '木之本桃矢': {
    '木之本樱': { intimacy: 80, trust: 90, passion: 5, hostility: 30, groups: ['family'], tags: ['怪兽妹妹'] }
  },
  '月城雪兔': {
    '木之本桃矢': { intimacy: 95, trust: 100, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['桃矢很温柔'] }
  },
  // 更衣人偶
  '五条新菜': {
    '喜多川海梦': { intimacy: 80, trust: 85, passion: 60, hostility: 0, groups: ['friend'], tags: ['海梦同学很耀眼'] }
  },
  '喜多川海梦': {
    '五条新菜': { intimacy: 90, trust: 90, passion: 85, hostility: 0, groups: ['lover'], tags: ['五条君最棒了'] }
  },
  // 终将成为你
  '小糸侑': {
    '七海灯子': { intimacy: 75, trust: 80, passion: 40, hostility: 0, groups: ['lover'], tags: ['喜欢你'] }
  },
  '七海灯子': {
    '小糸侑': { intimacy: 90, trust: 85, passion: 80, hostility: 0, groups: ['lover'], tags: ['只有你特别'] }
  },
  // 式守同学 (主角)
  '式守': {
    '和泉': { intimacy: 95, trust: 90, passion: 85, hostility: 0, groups: ['lover'], tags: ['由我来守护'] }
  },
  '和泉': {
    '式守': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['式守同学好帅'] }
  },
  // 通往夏天的隧道
  '塔野薰': {
    '花城杏子': { intimacy: 70, trust: 75, passion: 50, hostility: 0, groups: ['lover'], tags: ['共同探索隧道'] }
  },
  '花城杏子': {
    '塔野薰': { intimacy: 75, trust: 70, passion: 55, hostility: 0, groups: ['lover'], tags: ['只有两人的世界'] }
  },
  '小泉': {
    '塔野薰': { intimacy: 30, trust: 40, passion: 0, hostility: 10, groups: ['classmate'], tags: ['阴沉的家伙'] }
  },
  // 其他学生
  '河村隆': {
    '不二周助': { intimacy: 65, trust: 80, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['Burning!'] }
  },
  '绿间真太郎': {
    '高尾和成': { intimacy: 70, trust: 85, passion: 5, hostility: 10, groups: ['clubMember'], tags: ['尽人事'] }
  },
  '松冈凛': {
    '七濑遥': { intimacy: 60, trust: 50, passion: 40, hostility: 30, groups: ['friend'], tags: ['也是对手'] }
  },
  '春日野椿': {
    '天野雪辉': { intimacy: 20, trust: 10, passion: 30, hostility: 10, groups: ['other'], tags: ['御目方教'] }
  },
  '天堂真矢': {
    '西条クロディーヌ': { intimacy: 60, trust: 70, passion: 40, hostility: 20, groups: ['clubMember'], tags: ['劲敌'] }
  },
  '片山実波': {
    'WUG成员': { intimacy: 60, trust: 60, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['好吃的东西'] }
  },

  // === 1年D班 ===
  // 教师
  '冈部伦太郎': {
    '牧濑红莉栖': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['克里斯蒂娜'] }
  },
  '牧濑红莉栖': {
    '冈部伦太郎': { intimacy: 90, trust: 95, passion: 80, hostility: 5, groups: ['lover'], tags: ['疯狂科学家'] }
  },
  '大蛇丸': {
    '佐助': { intimacy: 10, trust: 5, passion: 80, hostility: 50, groups: ['other'], tags: ['容器'] }
  },
  // 日在校园
  '伊藤诚': {
    '桂言叶': { intimacy: 50, trust: 40, passion: 70, hostility: 0, groups: ['lover'], tags: ['女朋友'] }
  },
  '西园寺世界': {
    '伊藤诚': { intimacy: 70, trust: 40, passion: 85, hostility: 0, groups: ['lover'], tags: ['明明是我先来的'] }
  },
  '桂言叶': {
    '伊藤诚': { intimacy: 90, trust: 80, passion: 60, hostility: 0, groups: ['lover'], tags: ['诚君...'] }
  },
  '加藤乙女': {
    '伊藤诚': { intimacy: 40, trust: 30, passion: 50, hostility: 0, groups: ['friend'], tags: ['以前的伙伴'] }
  },
  '甘露寺七海': {
    '西园寺世界': { intimacy: 60, trust: 65, passion: 5, hostility: 0, groups: ['friend'], tags: ['世界的朋友'] }
  },
  // Another
  '榊原恒一': {
    '见崎鸣': { intimacy: 85, trust: 90, passion: 40, hostility: 0, groups: ['closeFriend'], tags: ['不存在的人'] }
  },
  '见崎鸣': {
    '榊原恒一': { intimacy: 80, trust: 85, passion: 30, hostility: 0, groups: ['closeFriend'], tags: ['小心玩偶'] }
  },
  '赤泽泉美': {
    '见崎鸣': { intimacy: 10, trust: 20, passion: 10, hostility: 60, groups: ['classmate'], tags: ['扰乱秩序'] }
  },
  '勅使河原直哉': {
    '榊原恒一': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['friend'], tags: ['风趣的家伙'] }
  },
  // 灌篮高手 (1年级组)
  '樱木花道': {
    '流川枫': { intimacy: 10, trust: 20, passion: 10, hostility: 90, groups: ['clubMember'], tags: ['死狐狸'] }
  },
  '宫城良田': {
    '彩子': { intimacy: 85, trust: 70, passion: 90, hostility: 0, groups: ['clubMember'], tags: ['彩子小姐'] }
  },
  '水户洋平': {
    '樱木花道': { intimacy: 90, trust: 95, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['樱木军团'] }
  },
  '彩子': {
    '宫城良田': { intimacy: 60, trust: 80, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['好好练球'] }
  },
  // 徒然喜欢你
  '高野千鹤': {
    '加贺优树': { intimacy: 50, trust: 60, passion: 40, hostility: 0, groups: ['friend'], tags: ['总是没自信'] }
  },
  '加贺优树': {
    '高野千鹤': { intimacy: 55, trust: 65, passion: 45, hostility: 0, groups: ['friend'], tags: ['为什么不讨厌我'] }
  },
  // 排球少年 (1年级组)
  '日向翔阳': {
    '影山飞雄': { intimacy: 60, trust: 70, passion: 30, hostility: 40, groups: ['clubMember'], tags: ['怪人快攻'] }
  },
  '影山飞雄': {
    '日向翔阳': { intimacy: 60, trust: 75, passion: 20, hostility: 40, groups: ['clubMember'], tags: ['笨蛋日向'] }
  },
  '月岛萤': {
    '山口忠': { intimacy: 70, trust: 80, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['吵死了山口'] }
  },
  '山口忠': {
    '月岛萤': { intimacy: 85, trust: 90, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['阿月最帅了'] }
  },
  '谷地仁花': {
    '清水洁子': { intimacy: 50, trust: 80, passion: 20, hostility: 0, groups: ['senior'], tags: ['洁子学姐好美'] }
  },

  // === 1年E班 (偶像科) ===
  // 教师
  '秋月律子': {
    '偶像们': { intimacy: 70, trust: 80, passion: 20, hostility: 0, groups: ['other'], tags: ['要好好练习'] }
  },
  'プロデューサー': {
    '偶像们': { intimacy: 70, trust: 90, passion: 10, hostility: 0, groups: ['other'], tags: ['大家的笑容'] }
  },
  '千石千寻': {
    '樱花庄': { intimacy: 50, trust: 60, passion: 5, hostility: 10, groups: ['other'], tags: ['别惹麻烦'] }
  },
  '有栖川誉': {
    '剧团': { intimacy: 70, trust: 70, passion: 50, hostility: 0, groups: ['other'], tags: ['诗兴大发'] }
  },
  '山中佐和子': {
    '轻音部': { intimacy: 60, trust: 70, passion: 20, hostility: 0, groups: ['other'], tags: ['顾问'] }
  },
  // 灰姑娘女孩
  '本田未央': {
    '岛村卯月': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['卯月Chan'] }
  },
  '双叶杏': {
    '诸星琪拉莉': { intimacy: 60, trust: 70, passion: 5, hostility: 0, groups: ['friend'], tags: ['要糖果'] }
  },
  '城崎美嘉': {
    '偶像们': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['魅力辣妹'] }
  },
  '赤城米莉亚': {
    '偶像们': { intimacy: 60, trust: 60, passion: 10, hostility: 0, groups: ['friend'], tags: ['大家一起玩'] }
  },
  '早坂美玲': {
    '偶像们': { intimacy: 40, trust: 50, passion: 10, hostility: 10, groups: ['friend'], tags: ['独眼'] }
  },
  // 闪耀色彩
  '大崎甜花': {
    '大崎甘奈': { intimacy: 95, trust: 100, passion: 10, hostility: 0, groups: ['family'], tags: ['双胞胎姐妹'] }
  },
  '大崎甘奈': {
    '大崎甜花': { intimacy: 100, trust: 100, passion: 20, hostility: 0, groups: ['family'], tags: ['守护甜花'] }
  },
  '三峰结华': {
    '田中摩美々': { intimacy: 65, trust: 70, passion: 10, hostility: 0, groups: ['friend'], tags: ['摩美々'] }
  },
  '杜野凛世': {
    '制作人': { intimacy: 80, trust: 90, passion: 70, hostility: 0, groups: ['other'], tags: ['您是凛世的一切'] }
  },
  '风野灯织': {
    '樱木真乃': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['friend'], tags: ['一起加油'] }
  },
  '八宫巡': {
    '樱木真乃': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['friend'], tags: ['真乃朋友'] }
  },
  '铃木羽那': {
    '偶像们': { intimacy: 50, trust: 50, passion: 5, hostility: 0, groups: ['friend'], tags: ['你好呀'] }
  },

  // === 2年A班 ===
  // 教师
  '折原临也': {
    '平和岛静雄': { intimacy: -50, trust: 0, passion: 10, hostility: 100, groups: ['other'], tags: ['小静去死'] }
  },
  '槙岛圣护': {
    '常守朱': { intimacy: -20, trust: 10, passion: 0, hostility: 60, groups: ['other'], tags: ['观察对象'] }
  },
  // 实教
  '绫小路清隆': {
    '轻井泽惠': { intimacy: 60, trust: 70, passion: 40, hostility: 0, groups: ['lover'], tags: ['好用的棋子'] }
  },
  '堀北铃音': {
    '绫小路清隆': { intimacy: 50, trust: 60, passion: 10, hostility: 10, groups: ['classmate'], tags: ['盟友'] }
  },
  '轻井泽惠': {
    '绫小路清隆': { intimacy: 80, trust: 70, passion: 90, hostility: 0, groups: ['lover'], tags: ['清隆'] }
  },
  '一之濑帆波': {
    '绫小路清隆': { intimacy: 65, trust: 70, passion: 50, hostility: 0, groups: ['friend'], tags: ['绫小路君'] }
  },
  '坂柳有栖': {
    '绫小路清隆': { intimacy: 50, trust: 60, passion: 60, hostility: 20, groups: ['other'], tags: ['宿敌'] }
  },
  // 辉夜大小姐
  '石上优': {
    '伊井野弥子': { intimacy: 40, trust: 50, passion: 10, hostility: 30, groups: ['clubMember'], tags: ['死正经'] }
  },
  '四宫辉夜': {
    '白银御行': { intimacy: 90, trust: 95, passion: 90, hostility: 10, groups: ['lover'], tags: ['真是可爱'] }
  },
  '白银御行': {
    '四宫辉夜': { intimacy: 90, trust: 95, passion: 90, hostility: 10, groups: ['lover'], tags: ['一定要让你告白'] }
  },
  '藤原千花': {
    '四宫辉夜': { intimacy: 80, trust: 85, passion: 10, hostility: 5, groups: ['closeFriend'], tags: ['辉夜同学'] }
  },
  '早坂爱': {
    '四宫辉夜': { intimacy: 85, trust: 90, passion: 5, hostility: 10, groups: ['other'], tags: ['主仆'] }
  },
  '伊井野弥子': {
    '石上优': { intimacy: 35, trust: 45, passion: 15, hostility: 30, groups: ['clubMember'], tags: ['不检点'] }
  },
  // 在下坂本
  '久保田吉伸': {
    '坂本': { intimacy: 80, trust: 90, passion: 10, hostility: 0, groups: ['friend'], tags: ['坂本君好帅'] }
  },
  '坂本': {
    '久保田吉伸': { intimacy: 60, trust: 50, passion: 5, hostility: 0, groups: ['friend'], tags: ['同学'] }
  },
  '黑沼': {
    '坂本': { intimacy: 40, trust: 30, passion: 10, hostility: 20, groups: ['classmate'], tags: ['装模作样'] }
  },
  '丸山': {
    '坂本': { intimacy: 30, trust: 20, passion: 0, hostility: 30, groups: ['classmate'], tags: ['不良'] }
  },
  '八木': {
    '坂本': { intimacy: 30, trust: 20, passion: 0, hostility: 30, groups: ['classmate'], tags: ['不良'] }
  },
  // 排球少年 (2/3年级)
  '澤村大地': {
    '菅原孝支': { intimacy: 85, trust: 95, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['靠你了'] }
  },
  '菅原孝支': {
    '东峰旭': { intimacy: 80, trust: 90, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['别怂'] }
  },
  '东峰旭': {
    '西谷夕': { intimacy: 75, trust: 85, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['多亏了西谷'] }
  },
  '西谷夕': {
    '东峰旭': { intimacy: 80, trust: 90, passion: 20, hostility: 0, groups: ['clubMember'], tags: ['前辈得分就好'] }
  },
  // 其他学生
  '手冢国光': {
    '大石秀一郎': { intimacy: 85, trust: 95, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['副部长'] }
  },
  '火神大我': {
    '黑子テツヤ': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['搭档'] }
  },
  '椎名旭': {
    '桐岛郁弥': { intimacy: 75, trust: 80, passion: 5, hostility: 0, groups: ['friend'], tags: ['一起游泳'] }
  },
  '天野雪辉': {
    '我妻由乃': { intimacy: 80, trust: 60, passion: 50, hostility: 10, groups: ['lover'], tags: ['有点可怕'] }
  },
  '西条クロディーヌ': {
    '天堂真矢': { intimacy: 60, trust: 70, passion: 40, hostility: 20, groups: ['clubMember'], tags: ['宿敌'] }
  },
  '七瀬佳乃': {
    'WUG成员': { intimacy: 60, trust: 60, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['队长'] }
  },

  // === 2年B班 ===
  // 轻音少女
  '平泽唯': {
    '中野梓': { intimacy: 85, trust: 80, passion: 30, hostility: 0, groups: ['closeFriend'], tags: ['梓喵'] }
  },
  '秋山澪': {
    '田井中律': { intimacy: 90, trust: 95, passion: 5, hostility: 5, groups: ['closeFriend'], tags: ['青梅竹马'] }
  },
  '田井中律': {
    '秋山澪': { intimacy: 90, trust: 95, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['害羞的澪'] }
  },
  '琴吹紬': {
    '平泽唯': { intimacy: 80, trust: 85, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['点心'] }
  },
  '中野梓': {
    '平泽唯': { intimacy: 75, trust: 70, passion: 10, hostility: 5, groups: ['clubMember'], tags: ['唯前辈'] }
  },
  // 吹响吧上低音号
  '黄前久美子': {
    '高坂丽奈': { intimacy: 85, trust: 90, passion: 60, hostility: 0, groups: ['closeFriend'], tags: ['特别的人'] }
  },
  '高坂丽奈': {
    '黄前久美子': { intimacy: 85, trust: 90, passion: 65, hostility: 0, groups: ['closeFriend'], tags: ['性格糟糕但喜欢'] }
  },
  '加藤叶月': {
    '川岛绿辉': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['friend'], tags: ['小绿'] }
  },
  '川岛绿辉': {
    '加藤叶月': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['friend'], tags: ['叶月'] }
  },
  '田中明日香': {
    '黄前久美子': { intimacy: 60, trust: 50, passion: 10, hostility: 20, groups: ['senior'], tags: ['特别的后辈'] }
  },
  '北宇治吹奏部部长': {
    '社团成员': { intimacy: 50, trust: 60, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['部长'] }
  },
  '三日月三郎': {
    '社团成员': { intimacy: 40, trust: 50, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['部员'] }
  },
  '高桥夏纪': {
    '吉川优纪': { intimacy: 70, trust: 65, passion: 5, hostility: 30, groups: ['friend'], tags: ['冤家'] }
  },
  '吉川优纪': {
    '高桥夏纪': { intimacy: 70, trust: 60, passion: 10, hostility: 40, groups: ['friend'], tags: ['优纪'] }
  },
  // 其他学生
  '大石秀一郎': {
    '菊丸英二': { intimacy: 90, trust: 95, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['黄金搭档'] }
  },
  '青峰大辉': {
    '黑子テツヤ': { intimacy: 50, trust: 40, passion: 20, hostility: 30, groups: ['friend'], tags: ['前光影'] }
  },
  '桐岛郁弥': {
    '七濑遥': { intimacy: 60, trust: 50, passion: 30, hostility: 20, groups: ['friend'], tags: ['不需要模仿'] }
  },
  '星见纯那': {
    '大场奈奈': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['室友'] }
  },
  '久海菜々美': {
    'WUG成员': { intimacy: 50, trust: 50, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['光之美少女'] }
  },

  // === 2年C班 ===
  // 冰菓
  '折木奉太郎': {
    '千反田爱瑠': { intimacy: 60, trust: 75, passion: 40, hostility: 0, groups: ['clubMember'], tags: ['我很好奇'] }
  },
  '千反田爱瑠': {
    '折木奉太郎': { intimacy: 70, trust: 85, passion: 50, hostility: 0, groups: ['clubMember'], tags: ['折木同学'] }
  },
  '福部里志': {
    '伊原摩耶花': { intimacy: 65, trust: 70, passion: 30, hostility: 10, groups: ['clubMember'], tags: ['里志'] }
  },
  '伊原摩耶花': {
    '福部里志': { intimacy: 70, trust: 70, passion: 60, hostility: 0, groups: ['lover'], tags: ['总是这样'] }
  },
  // CLANNAD
  '岡崎朋也': {
    '古河渚': { intimacy: 95, trust: 100, passion: 80, hostility: 0, groups: ['lover'], tags: ['谢谢你'] }
  },
  '古河渚': {
    '岡崎朋也': { intimacy: 95, trust: 100, passion: 80, hostility: 0, groups: ['lover'], tags: ['朋也君'] }
  },
  '藤林杏': {
    '岡崎朋也': { intimacy: 60, trust: 70, passion: 60, hostility: 10, groups: ['friend'], tags: ['笨蛋'] }
  },
  '藤林椋': {
    '岡崎朋也': { intimacy: 50, trust: 60, passion: 40, hostility: 0, groups: ['friend'], tags: ['占卜'] }
  },
  '坂上智代': {
    '岡崎朋也': { intimacy: 55, trust: 65, passion: 30, hostility: 0, groups: ['friend'], tags: ['早起一点'] }
  },
  '一之濑琴美': {
    '岡崎朋也': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['friend'], tags: ['剪书的朋友'] }
  },
  '春原阳平': {
    '岡崎朋也': { intimacy: 85, trust: 80, passion: 5, hostility: 20, groups: ['closeFriend'], tags: ['把妹妹介绍给我'] }
  },
  // Charlotte
  '乙坂有宇': {
    '友利奈绪': { intimacy: 80, trust: 85, passion: 70, hostility: 0, groups: ['lover'], tags: ['约好了'] }
  },
  '友利奈绪': {
    '乙坂有宇': { intimacy: 80, trust: 85, passion: 60, hostility: 0, groups: ['lover'], tags: ['作弊魔'] }
  },
  '高城丈士朗': {
    '西森柚咲': { intimacy: 20, trust: 10, passion: 90, hostility: 0, groups: ['other'], tags: ['粉丝'] }
  },
  '西森柚咲': {
    '高城丈士朗': { intimacy: 40, trust: 30, passion: 0, hostility: 10, groups: ['classmate'], tags: ['眼镜同学'] }
  },
  // 其他学生
  '菊丸英二': {
    '大石秀一郎': { intimacy: 90, trust: 95, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['特技击球'] }
  },
  '紫原敦': {
    '赤司征十郎': { intimacy: 60, trust: 80, passion: 5, hostility: 20, groups: ['clubMember'], tags: ['小赤司'] }
  },
  '山崎宗介': {
    '松冈凛': { intimacy: 85, trust: 90, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['为了凛'] }
  },
  '大场奈奈': {
    '星见纯那': { intimacy: 80, trust: 85, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['再演'] }
  },
  '菊間夏夜': {
    'WUG成员': { intimacy: 60, trust: 60, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['副队长'] }
  },

  // === 2年D班 ===
  // 我的青春恋爱物语
  '比企谷八幡': {
    '雪之下雪乃': { intimacy: 70, trust: 80, passion: 50, hostility: 5, groups: ['lover'], tags: ['真物'] }
  },
  '雪之下雪乃': {
    '比企谷八幡': { intimacy: 75, trust: 85, passion: 60, hostility: 0, groups: ['lover'], tags: ['依靠'] }
  },
  '由比滨结衣': {
    '比企谷八幡': { intimacy: 80, trust: 75, passion: 70, hostility: 0, groups: ['closeFriend'], tags: ['最喜欢了'] }
  },
  '一色彩羽': {
    '比企谷八幡': { intimacy: 50, trust: 60, passion: 40, hostility: 0, groups: ['junior'], tags: ['学长要负责'] }
  },
  // 路人女主
  '安艺伦也': {
    '加藤惠': { intimacy: 80, trust: 90, passion: 60, hostility: 0, groups: ['lover'], tags: ['我的女主角'] }
  },
  '加藤惠': {
    '安艺伦也': { intimacy: 85, trust: 90, passion: 50, hostility: 5, groups: ['lover'], tags: ['没救了'] }
  },
  '霞之丘诗羽': {
    '安艺伦也': { intimacy: 60, trust: 70, passion: 70, hostility: 10, groups: ['senior'], tags: ['伦理君'] }
  },
  '泽村·斯宾塞·英梨梨': {
    '安艺伦也': { intimacy: 50, trust: 50, passion: 60, hostility: 20, groups: ['friend'], tags: ['笨蛋伦也'] }
  },
  '氷堂美智留': {
    '安艺伦也': { intimacy: 60, trust: 65, passion: 10, hostility: 0, groups: ['family'], tags: ['表亲'] }
  },
  // 龙与虎
  '高须龙儿': {
    '逢坂大河': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['我的龙'] }
  },
  '逢坂大河': {
    '高须龙儿': { intimacy: 90, trust: 95, passion: 85, hostility: 5, groups: ['lover'], tags: ['笨狗'] }
  },
  '櫛枝实乃梨': {
    '逢坂大河': { intimacy: 85, trust: 90, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['大河的幸福'] }
  },
  '川嶋亚美': {
    '高须龙儿': { intimacy: 50, trust: 60, passion: 50, hostility: 10, groups: ['friend'], tags: ['如果是我的话'] }
  },
  '北村祐作': {
    '高须龙儿': { intimacy: 80, trust: 85, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['好家伙'] }
  },

  // === 2年E班 (偶像科) ===
  // 教师
  '高山P': {
    '偶像们': { intimacy: 60, trust: 80, passion: 40, hostility: 0, groups: ['other'], tags: ['制作人'] }
  },
  // 灰姑娘女孩
  '岛村卯月': {
    '渋谷凛': { intimacy: 85, trust: 90, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['凛酱'] }
  },
  '渋谷凛': {
    '岛村卯月': { intimacy: 85, trust: 90, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['卯月'] }
  },
  '神崎兰子': {
    '偶像们': { intimacy: 75, trust: 80, passion: 30, hostility: 0, groups: ['friend'], tags: ['共鸣'] }
  },
  '佐久间麻由': {
    '制作人': { intimacy: 60, trust: 40, passion: 100, hostility: 0, groups: ['other'], tags: ['命运的红线'] }
  },
  '藤原肇': {
    '偶像们': { intimacy: 50, trust: 60, passion: 10, hostility: 0, groups: ['friend'], tags: ['陶艺'] }
  },
  '小日向美穗': {
    '偶像们': { intimacy: 60, trust: 60, passion: 10, hostility: 0, groups: ['friend'], tags: ['害羞'] }
  },
  // 闪耀色彩
  '樱木真乃': {
    '风野灯织': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['灯织'] }
  },
  '田中摩美々': {
    '三峰结华': { intimacy: 70, trust: 75, passion: 10, hostility: 0, groups: ['friend'], tags: ['结华'] }
  },
  '芹泽朝日': {
    '偶像们': { intimacy: 30, trust: 40, passion: 0, hostility: 50, groups: ['friend'], tags: ['有趣的家伙'] }
  },
  '有栖川夏叶': {
    '偶像们': { intimacy: 60, trust: 70, passion: 30, hostility: 0, groups: ['friend'], tags: ['No.1'] }
  },
  '和泉爱依': {
    '芹泽朝日': { intimacy: 60, trust: 50, passion: 10, hostility: 0, groups: ['friend'], tags: ['朝日酱'] }
  },
  '福丸小糸': {
    '樋口円香': { intimacy: 70, trust: 60, passion: 5, hostility: 0, groups: ['friend'], tags: ['幼驯染'] }
  },

  // === 3年A班 ===
  // 青春猪头
  '樱岛麻衣': {
    '梓川咲太': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['最喜欢'] }
  },
  '梓川咲太': {
    '樱岛麻衣': { intimacy: 95, trust: 100, passion: 90, hostility: 0, groups: ['lover'], tags: ['麻衣桑'] }
  },
  '古贺朋绘': {
    '梓川咲太': { intimacy: 60, trust: 70, passion: 30, hostility: 0, groups: ['friend'], tags: ['屁股男'] }
  },
  '双叶理央': {
    '梓川咲太': { intimacy: 70, trust: 85, passion: 5, hostility: 0, groups: ['closeFriend'], tags: ['青春期症候群'] }
  },
  '丰浜和香': {
    '樱岛麻衣': { intimacy: 60, trust: 70, passion: 10, hostility: 30, groups: ['family'], tags: ['姐姐'] }
  },
  '梓川花楓': {
    '梓川咲太': { intimacy: 90, trust: 95, passion: 5, hostility: 0, groups: ['family'], tags: ['哥哥'] }
  },
  // 樱花庄
  '神田空太': {
    '椎名真白': { intimacy: 70, trust: 80, passion: 60, hostility: 0, groups: ['lover'], tags: ['照顾'] }
  },
  '椎名真白': {
    '神田空太': { intimacy: 75, trust: 85, passion: 50, hostility: 0, groups: ['lover'], tags: ['空太'] }
  },
  '青山七海': {
    '神田空太': { intimacy: 60, trust: 70, passion: 60, hostility: 0, groups: ['friend'], tags: ['笨蛋'] }
  },
  '上井草美咲': {
    '三鹰仁': { intimacy: 80, trust: 90, passion: 70, hostility: 0, groups: ['lover'], tags: ['外星人'] }
  },
  '三鹰仁': {
    '上井草美咲': { intimacy: 75, trust: 80, passion: 60, hostility: 10, groups: ['lover'], tags: ['美咲'] }
  },
  // 人渣的本愿
  '皆川茜': {
    '安乐冈花火': { intimacy: -10, trust: 0, passion: 10, hostility: 80, groups: ['other'], tags: ['情敌'] }
  },
  '安乐冈花火': {
    '粟屋麦': { intimacy: 40, trust: 50, passion: 60, hostility: 0, groups: ['friend'], tags: ['契约'] }
  },
  '粟屋麦': {
    '安乐冈花火': { intimacy: 40, trust: 50, passion: 60, hostility: 0, groups: ['friend'], tags: ['契约'] }
  },
  // 排球少年
  '鸣宫凪砂': {
    '排球部': { intimacy: 0, trust: 0, passion: 0, hostility: 0, groups: ['other'], tags: ['?'] }
  },
  '清水洁子': {
    '排球部': { intimacy: 80, trust: 90, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['经理'] }
  },

  // === 3年B班 ===
  // 四月是你的谎言
  '宫园薰': {
    '有马公生': { intimacy: 90, trust: 95, passion: 90, hostility: 0, groups: ['lover'], tags: ['友人A'] }
  },
  '有马公生': {
    '宫园薰': { intimacy: 80, trust: 90, passion: 85, hostility: 0, groups: ['lover'], tags: ['春天'] }
  },
  '椿明音': {
    '有马公生': { intimacy: 70, trust: 80, passion: 60, hostility: 0, groups: ['closeFriend'], tags: ['青梅竹马'] }
  },
  '渡亮太': {
    '有马公生': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['公生'] }
  },
  // 白色相簿 & 你的名字
  '森川由绮': {
    '绪方理奈': { intimacy: 70, trust: 75, passion: 10, hostility: 10, groups: ['friend'], tags: ['前辈'] }
  },
  '绫濑乃绘里子': {
    '学生们': { intimacy: 50, trust: 60, passion: 5, hostility: 0, groups: ['other'], tags: ['...'] }
  },
  '绫濑小春': {
    '学生们': { intimacy: 50, trust: 60, passion: 5, hostility: 0, groups: ['classmate'], tags: ['...'] }
  },
  '立花泷': {
    '宫水三叶': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['寻找你'] }
  },
  '宫水三叶': {
    '立花泷': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['那个人'] }
  },
  '奥寺美纪': {
    '立花泷': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['other'], tags: ['打工前辈'] }
  },
  '宫水四叶': {
    '宫水三叶': { intimacy: 80, trust: 90, passion: 5, hostility: 10, groups: ['family'], tags: ['姐姐'] }
  },
  // Love Live
  '高坂穗乃果': {
    '南小鸟': { intimacy: 95, trust: 100, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['一起做偶像'] }
  },
  '南小鸟': {
    '高坂穗乃果': { intimacy: 95, trust: 100, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['支持穗乃果'] }
  },
  '园田海未': {
    '高坂穗乃果': { intimacy: 90, trust: 95, passion: 10, hostility: 20, groups: ['closeFriend'], tags: ['太乱来了'] }
  },
  '星空凛': {
    '小泉花阳': { intimacy: 90, trust: 95, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['花阳亲'] }
  },
  // 其他学生
  '不二周助': {
    '手冢国光': { intimacy: 85, trust: 90, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['对手'] }
  },
  '赤司征十郎': {
    '黑子テツヤ': { intimacy: 60, trust: 50, passion: 30, hostility: 10, groups: ['clubMember'], tags: ['违背我意愿'] }
  },
  '花柳香子': {
    '石动双叶': { intimacy: 80, trust: 85, passion: 40, hostility: 10, groups: ['closeFriend'], tags: ['青梅竹马'] }
  },
  '岡本未夕': {
    'WUG成员': { intimacy: 60, trust: 60, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['Miyu'] }
  },

  // === 3年C班 ===
  // 凉宫春日 & 中二病
  '凉宫春日': {
    '阿虚': { intimacy: 70, trust: 80, passion: 60, hostility: 0, groups: ['clubMember'], tags: ['被选中的人'] }
  },
  '阿虚': {
    '凉宫春日': { intimacy: 60, trust: 70, passion: 30, hostility: 20, groups: ['clubMember'], tags: ['团长'] }
  },
  '长门有希': {
    '阿虚': { intimacy: 50, trust: 80, passion: 20, hostility: 0, groups: ['clubMember'], tags: ['观察对象'] }
  },
  '朝比奈实玖瑠': {
    '阿虚': { intimacy: 40, trust: 50, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['阿虚桑'] }
  },
  '古泉一树': {
    '凉宫春日': { intimacy: 50, trust: 60, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['精神安定'] }
  },
  '富樫勇太': {
    '小鸟游六花': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['契约'] }
  },
  '小鸟游六花': {
    '富樫勇太': { intimacy: 90, trust: 95, passion: 80, hostility: 0, groups: ['lover'], tags: ['漆黑烈焰使'] }
  },
  '丹生谷森夏': {
    '凸守早苗': { intimacy: 40, trust: 50, passion: 10, hostility: 60, groups: ['friend'], tags: ['冒牌森大人'] }
  },
  '五月七日茴香': {
    '富樫勇太': { intimacy: 60, trust: 70, passion: 5, hostility: 0, groups: ['clubMember'], tags: ['学弟'] }
  },
  // 堀与宫村
  '堀京子': {
    '宫村伊澄': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['宫村'] }
  },
  '宫村伊澄': {
    '堀京子': { intimacy: 95, trust: 100, passion: 85, hostility: 0, groups: ['lover'], tags: ['堀同学'] }
  },
  '石川透': {
    '吉川由纪': { intimacy: 70, trust: 80, passion: 40, hostility: 0, groups: ['friend'], tags: ['暧昧'] }
  },
  '吉川由纪': {
    '石川透': { intimacy: 70, trust: 80, passion: 45, hostility: 0, groups: ['friend'], tags: ['喜欢'] }
  },
  // 义妹生活
  '浅村悠太': {
    '绫濑沙季': { intimacy: 75, trust: 80, passion: 60, hostility: 0, groups: ['lover'], tags: ['义妹'] }
  },
  '绫濑沙季': {
    '浅村悠太': { intimacy: 75, trust: 80, passion: 60, hostility: 0, groups: ['lover'], tags: ['义兄'] }
  },
  // 其他学生
  '乾貞治': {
    '海堂薫': { intimacy: 60, trust: 70, passion: 5, hostility: 10, groups: ['clubMember'], tags: ['数据'] }
  },
  '天堂真矢': {
    '西条クロディーヌ': { intimacy: 60, trust: 70, passion: 40, hostility: 20, groups: ['clubMember'], tags: ['劲敌'] }
  },

  // === 3年D班 ===
  // 灌篮高手 (3年级)
  '流川枫': {
    '樱木花道': { intimacy: 10, trust: 20, passion: 10, hostility: 90, groups: ['clubMember'], tags: ['大白痴'] }
  },
  '赤木刚宪': {
    '木暮公延': { intimacy: 90, trust: 95, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['称霸全国'] }
  },
  '木暮公延': {
    '赤木刚宪': { intimacy: 90, trust: 95, passion: 10, hostility: 0, groups: ['closeFriend'], tags: ['副队'] }
  },
  '三井寿': {
    '赤木刚宪': { intimacy: 60, trust: 70, passion: 10, hostility: 20, groups: ['clubMember'], tags: ['不想输'] }
  },
  '彩子': {
    '宫城良田': { intimacy: 60, trust: 80, passion: 10, hostility: 0, groups: ['clubMember'], tags: ['问题儿童'] }
  },
  // 女子高中生虚度日常
  '樱井奈奈': {
    '田中望': { intimacy: 60, trust: 70, passion: 5, hostility: 10, groups: ['friend'], tags: ['笨蛋'] }
  },
  '田中望': {
    '菊池茜': { intimacy: 80, trust: 85, passion: 5, hostility: 10, groups: ['friend'], tags: ['阿宅'] }
  },
  '菊池茜': {
    '田中望': { intimacy: 75, trust: 80, passion: 5, hostility: 30, groups: ['friend'], tags: ['笨蛋'] }
  },
  '鸟井真理': {
    '田中望': { intimacy: 50, trust: 60, passion: 5, hostility: 0, groups: ['friend'], tags: ['有趣'] }
  },
  // 吹响/境界/LL
  '高坂丽奈': {
    '滝昇': { intimacy: 70, trust: 60, passion: 70, hostility: 0, groups: ['other'], tags: ['特别'] }
  },
  '名濑美月': {
    '名濑博臣': { intimacy: 60, trust: 80, passion: 5, hostility: 40, groups: ['family'], tags: ['变态哥哥'] }
  },
  '名濑博臣': {
    '名濑美月': { intimacy: 80, trust: 85, passion: 10, hostility: 0, groups: ['family'], tags: ['妹妹的爱'] }
  },
  '神原秋人': {
    '栗山未来': { intimacy: 85, trust: 90, passion: 75, hostility: 0, groups: ['lover'], tags: ['眼镜美少女'] }
  },
  '栗山未来': {
    '神原秋人': { intimacy: 85, trust: 90, passion: 70, hostility: 0, groups: ['lover'], tags: ['不高兴'] }
  },
  '绫濑绘里': {
    '东条希': { intimacy: 90, trust: 95, passion: 20, hostility: 0, groups: ['closeFriend'], tags: ['谢谢'] }
  },

  // === 3年E班 (偶像科) ===
  // 教师
  '高木社长': {
    '偶像们': { intimacy: 60, trust: 80, passion: 5, hostility: 0, groups: ['other'], tags: ['潜力'] }
  },
  // 灰姑娘女孩
  '高垣枫': {
    '制作人': { intimacy: 60, trust: 70, passion: 10, hostility: 0, groups: ['friend'], tags: ['喝酒吗'] }
  },
  '十时爱梨': {
    '偶像们': { intimacy: 60, trust: 60, passion: 20, hostility: 0, groups: ['friend'], tags: ['天热'] }
  },
  '片桐早苗': {
    '高垣枫': { intimacy: 70, trust: 75, passion: 5, hostility: 0, groups: ['friend'], tags: ['酒友'] }
  },
  '川岛瑞树': {
    '偶像们': { intimacy: 60, trust: 70, passion: 5, hostility: 0, groups: ['senior'], tags: ['可爱'] }
  },
  '橘爱丽丝': {
    '偶像们': { intimacy: 40, trust: 50, passion: 5, hostility: 0, groups: ['friend'], tags: ['叫我橘'] }
  },
  '白坂小梅': {
    '偶像们': { intimacy: 50, trust: 50, passion: 10, hostility: 0, groups: ['friend'], tags: ['那个孩子'] }
  },
  // 闪耀色彩
  '幽谷雾子': {
    '田中摩美々': { intimacy: 70, trust: 75, passion: 10, hostility: 0, groups: ['friend'], tags: ['绷带'] }
  },
  '白濑咲耶': {
    '三峰结华': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['friend'], tags: ['帅气'] }
  },
  '三峰结华': {
    '白濑咲耶': { intimacy: 75, trust: 80, passion: 10, hostility: 0, groups: ['friend'], tags: ['L\'Antica'] }
  },
  '西城树里': {
    '杜野凛世': { intimacy: 70, trust: 75, passion: 10, hostility: 0, groups: ['friend'], tags: ['吃拉面'] }
  },
  '绿川真奈': {
    '偶像们': { intimacy: 50, trust: 50, passion: 5, hostility: 0, groups: ['friend'], tags: ['开心'] }
  },
  '樋口円香': {
    '制作人': { intimacy: 20, trust: 10, passion: 0, hostility: 80, groups: ['other'], tags: ['去死如何'] }
  }
}

/**
 * 默认性格配置（按角色名）
 */
export const DEFAULT_PERSONALITIES = {
  // === 1年A班 ===
  '平冢静': { order: 60, altruism: 80, tradition: 40, peace: 50 },
  '武田一鉄': { order: 50, altruism: 70, tradition: 60, peace: 60 },
  '伊莉娜·耶拉比琪': { order: 30, altruism: 40, tradition: 10, peace: 50 },
  '鬼冢英吉': { order: 10, altruism: 80, tradition: 10, peace: 30 },
  '泷昇': { order: 80, altruism: 40, tradition: 90, peace: 70 },
  '幸田实果子': { order: 40, altruism: 60, tradition: 20, peace: 80 },
  
  '后藤一里': { order: 30, altruism: 40, tradition: 20, peace: 80 },
  '伊地知虹夏': { order: 50, altruism: 70, tradition: 30, peace: 60 },
  '喜多郁代': { order: 40, altruism: 60, tradition: 40, peace: 70 },
  '山田凉': { order: 60, altruism: 30, tradition: 50, peace: 50 },
  '高松灯': { order: 20, altruism: 60, tradition: 30, peace: 70 },
  '千早爱音': { order: 40, altruism: 50, tradition: 40, peace: 60 },
  '要乐奈': { order: 10, altruism: 20, tradition: 10, peace: 60 },
  '椎名立希': { order: 70, altruism: 40, tradition: 50, peace: 30 },
  '长崎素世': { order: 80, altruism: 30, tradition: 70, peace: 60 },
  '北白川玉子': { order: 50, altruism: 90, tradition: 80, peace: 90 },
  '常盘绿': { order: 60, altruism: 70, tradition: 50, peace: 70 },
  '饭冢美代': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '大路饼藏': { order: 50, altruism: 80, tradition: 60, peace: 80 },
  '山田杏奈': { order: 30, altruism: 70, tradition: 40, peace: 70 },
  '市川京太郎': { order: 40, altruism: 60, tradition: 30, peace: 60 },
  '西宫硝子': { order: 60, altruism: 90, tradition: 60, peace: 90 },
  '西宫结弦': { order: 70, altruism: 60, tradition: 50, peace: 60 },
  '永束友宏': { order: 40, altruism: 80, tradition: 40, peace: 70 },
  '植野直花': { order: 50, altruism: 30, tradition: 40, peace: 20 },
  '佐原爱': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '石田将也': { order: 40, altruism: 50, tradition: 40, peace: 50 },
  '越前龙马': { order: 40, altruism: 30, tradition: 30, peace: 40 },
  '黑子テツヤ': { order: 60, altruism: 80, tradition: 50, peace: 80 },
  '七濑遥': { order: 30, altruism: 40, tradition: 40, peace: 80 },
  '我妻由乃': { order: 20, altruism: -50, tradition: 20, peace: -80 },
  '爱城华恋': { order: 50, altruism: 80, tradition: 40, peace: 60 },
  '島田真夢': { order: 60, altruism: 70, tradition: 50, peace: 70 },

  // === 1年B班 ===
  '吉田松阳': { order: 20, altruism: 90, tradition: 30, peace: 80 },
  '根津老师': { order: 40, altruism: 20, tradition: 50, peace: 40 },
  '乌间惟臣': { order: 90, altruism: 70, tradition: 80, peace: 40 },
  '桥田至': { order: 30, altruism: 50, tradition: 20, peace: 70 },
  '中野一花': { order: 40, altruism: 70, tradition: 40, peace: 60 },
  '中野二乃': { order: 60, altruism: 50, tradition: 60, peace: 30 },
  '中野三玖': { order: 50, altruism: 60, tradition: 70, peace: 80 },
  '中野四叶': { order: 40, altruism: 90, tradition: 40, peace: 80 },
  '中野五月': { order: 70, altruism: 60, tradition: 60, peace: 70 },
  '上杉风太郎': { order: 80, altruism: 40, tradition: 60, peace: 60 },
  '安昙小太郎': { order: 50, altruism: 60, tradition: 70, peace: 80 },
  '水野茜': { order: 60, altruism: 60, tradition: 60, peace: 80 },
  '真壁政宗': { order: 70, altruism: 30, tradition: 50, peace: 50 },
  '安达垣爱姬': { order: 60, altruism: 20, tradition: 80, peace: 40 },
  '小岩井吉乃': { order: 80, altruism: 40, tradition: 70, peace: 60 },
  '双叶妙': { order: 30, altruism: 50, tradition: 40, peace: 70 },
  '久世政近': { order: 40, altruism: 50, tradition: 40, peace: 60 },
  '艾莉': { order: 70, altruism: 40, tradition: 60, peace: 50 },
  '猫崎享': { order: 40, altruism: 70, tradition: 40, peace: 70 },
  '山内樱良': { order: 40, altruism: 90, tradition: 40, peace: 80 },
  '男主“我/志贺春树”': { order: 70, altruism: 30, tradition: 50, peace: 80 },
  '滨边隆弘': { order: 50, altruism: 40, tradition: 50, peace: 50 },
  '恭子': { order: 60, altruism: 70, tradition: 50, peace: 60 },
  '桃城武': { order: 40, altruism: 70, tradition: 40, peace: 60 },
  '黄瀬涼太': { order: 40, altruism: 60, tradition: 30, peace: 70 },
  '橘真琴': { order: 70, altruism: 90, tradition: 60, peace: 90 },
  '雨流美弥音': { order: 20, altruism: 10, tradition: 10, peace: 10 },
  '神乐光': { order: 60, altruism: 50, tradition: 50, peace: 60 },
  '林田藍里': { order: 50, altruism: 60, tradition: 50, peace: 70 },

  // === 1年C班 ===
  '维尔维特·维斯·维': { order: 80, altruism: 50, tradition: 70, peace: 60 },
  '古见硝子': { order: 60, altruism: 70, tradition: 60, peace: 90 },
  '只野仁人': { order: 60, altruism: 90, tradition: 50, peace: 90 },
  '长名奈奈': { order: 10, altruism: 60, tradition: 20, peace: 70 },
  '山井恋': { order: 30, altruism: 10, tradition: 40, peace: 20 },
  '木之本樱': { order: 50, altruism: 95, tradition: 50, peace: 90 },
  '李小狼': { order: 70, altruism: 70, tradition: 80, peace: 60 },
  '大道寺知世': { order: 60, altruism: 90, tradition: 60, peace: 90 },
  '木之本桃矢': { order: 60, altruism: 70, tradition: 50, peace: 60 },
  '月城雪兔': { order: 50, altruism: 90, tradition: 50, peace: 90 },
  '五条新菜': { order: 80, altruism: 80, tradition: 90, peace: 80 },
  '喜多川海梦': { order: 30, altruism: 80, tradition: 20, peace: 70 },
  '小糸侑': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '七海灯子': { order: 70, altruism: 50, tradition: 60, peace: 60 },
  '式守': { order: 60, altruism: 80, tradition: 50, peace: 70 },
  '和泉': { order: 40, altruism: 70, tradition: 40, peace: 80 },
  '塔野薰': { order: 50, altruism: 40, tradition: 50, peace: 70 },
  '花城杏子': { order: 60, altruism: 50, tradition: 40, peace: 60 },
  '小泉': { order: 40, altruism: 30, tradition: 40, peace: 50 },
  '河村隆': { order: 60, altruism: 80, tradition: 60, peace: 70 },
  '绿间真太郎': { order: 80, altruism: 40, tradition: 80, peace: 60 },
  '松冈凛': { order: 40, altruism: 40, tradition: 40, peace: 40 },
  '春日野椿': { order: 50, altruism: 70, tradition: 80, peace: 60 },
  '天堂真矢': { order: 80, altruism: 30, tradition: 70, peace: 50 },
  '片山実波': { order: 50, altruism: 80, tradition: 50, peace: 80 },

  // === 1年D班 ===
  '冈部伦太郎': { order: 20, altruism: 80, tradition: 30, peace: 70 },
  '牧濑红莉栖': { order: 70, altruism: 70, tradition: 40, peace: 70 },
  '大蛇丸': { order: 80, altruism: -60, tradition: 10, peace: -40 },
  '伊藤诚': { order: 20, altruism: -20, tradition: 30, peace: 50 },
  '西园寺世界': { order: 40, altruism: 30, tradition: 40, peace: 40 },
  '桂言叶': { order: 50, altruism: 40, tradition: 60, peace: 20 },
  '加藤乙女': { order: 30, altruism: 20, tradition: 30, peace: 40 },
  '甘露寺七海': { order: 40, altruism: 50, tradition: 40, peace: 60 },
  '榊原恒一': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '见崎鸣': { order: 40, altruism: 50, tradition: 40, peace: 80 },
  '赤泽泉美': { order: 70, altruism: 40, tradition: 60, peace: 40 },
  '勅使河原直哉': { order: 30, altruism: 60, tradition: 30, peace: 70 },
  '樱木花道': { order: 10, altruism: 60, tradition: 20, peace: 30 },
  '宫城良田': { order: 30, altruism: 50, tradition: 30, peace: 40 },
  '水户洋平': { order: 50, altruism: 90, tradition: 40, peace: 70 },
  '彩子': { order: 60, altruism: 70, tradition: 50, peace: 60 },
  '高野千鹤': { order: 40, altruism: 50, tradition: 40, peace: 70 },
  '加贺优树': { order: 40, altruism: 60, tradition: 40, peace: 70 },
  '日向翔阳': { order: 30, altruism: 80, tradition: 30, peace: 70 },
  '影山飞雄': { order: 60, altruism: 30, tradition: 50, peace: 40 },
  '月岛萤': { order: 60, altruism: 20, tradition: 50, peace: 60 },
  '山口忠': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '谷地仁花': { order: 40, altruism: 60, tradition: 40, peace: 80 },

  // === 1年E班 ===
  '秋月律子': { order: 80, altruism: 60, tradition: 60, peace: 70 },
  'プロデューサー': { order: 70, altruism: 90, tradition: 50, peace: 80 },
  '千石千寻': { order: 30, altruism: 50, tradition: 20, peace: 70 },
  '有栖川誉': { order: 20, altruism: 60, tradition: 70, peace: 70 },
  '山中佐和子': { order: 30, altruism: 50, tradition: 20, peace: 60 },
  '本田未央': { order: 50, altruism: 80, tradition: 40, peace: 70 },
  '双叶杏': { order: 10, altruism: 20, tradition: 10, peace: 90 },
  '城崎美嘉': { order: 40, altruism: 70, tradition: 20, peace: 70 },
  '赤城米莉亚': { order: 30, altruism: 80, tradition: 30, peace: 80 },
  '早坂美玲': { order: 40, altruism: 50, tradition: 30, peace: 60 },
  '大崎甜花': { order: 20, altruism: 50, tradition: 40, peace: 90 },
  '大崎甘奈': { order: 70, altruism: 80, tradition: 60, peace: 80 },
  '三峰结华': { order: 40, altruism: 60, tradition: 30, peace: 70 },
  '杜野凛世': { order: 80, altruism: 60, tradition: 90, peace: 80 },
  '风野灯织': { order: 70, altruism: 50, tradition: 60, peace: 60 },
  '八宫巡': { order: 50, altruism: 90, tradition: 40, peace: 80 },
  '铃木羽那': { order: 50, altruism: 70, tradition: 40, peace: 70 },

  // === 2年A班 ===
  '折原临也': { order: 10, altruism: -60, tradition: 10, peace: -20 },
  '槙岛圣护': { order: 20, altruism: -50, tradition: 10, peace: -50 },
  '绫小路清隆': { order: 70, altruism: -10, tradition: 50, peace: 60 },
  '堀北铃音': { order: 80, altruism: 20, tradition: 70, peace: 50 },
  '轻井泽惠': { order: 40, altruism: 50, tradition: 30, peace: 60 },
  '一之濑帆波': { order: 60, altruism: 90, tradition: 50, peace: 80 },
  '坂柳有栖': { order: 70, altruism: 10, tradition: 60, peace: 60 },
  '石上优': { order: 30, altruism: 60, tradition: 40, peace: 70 },
  '四宫辉夜': { order: 80, altruism: 40, tradition: 90, peace: 50 },
  '白银御行': { order: 90, altruism: 70, tradition: 60, peace: 70 },
  '藤原千花': { order: 10, altruism: 60, tradition: 30, peace: 80 },
  '早坂爱': { order: 70, altruism: 50, tradition: 50, peace: 60 },
  '伊井野弥子': { order: 90, altruism: 60, tradition: 80, peace: 60 },
  '久保田吉伸': { order: 40, altruism: 50, tradition: 40, peace: 60 },
  '坂本': { order: 100, altruism: 90, tradition: 80, peace: 100 },
  '黑沼': { order: 40, altruism: 30, tradition: 40, peace: 50 },
  '丸山': { order: 30, altruism: 20, tradition: 30, peace: 40 },
  '八木': { order: 30, altruism: 20, tradition: 30, peace: 40 },
  '澤村大地': { order: 80, altruism: 90, tradition: 70, peace: 80 },
  '菅原孝支': { order: 70, altruism: 90, tradition: 60, peace: 90 },
  '东峰旭': { order: 40, altruism: 60, tradition: 50, peace: 80 },
  '西谷夕': { order: 30, altruism: 80, tradition: 40, peace: 50 },
  '手冢国光': { order: 90, altruism: 70, tradition: 80, peace: 80 },
  '火神大我': { order: 30, altruism: 60, tradition: 30, peace: 40 },
  '椎名旭': { order: 40, altruism: 50, tradition: 40, peace: 60 },
  '天野雪辉': { order: 30, altruism: 40, tradition: 40, peace: 50 },
  '西条クロディーヌ': { order: 60, altruism: 40, tradition: 50, peace: 50 },
  '七瀬佳乃': { order: 70, altruism: 80, tradition: 60, peace: 70 },

  // === 2年B班 ===
  '平泽唯': { order: 20, altruism: 80, tradition: 30, peace: 90 },
  '秋山澪': { order: 60, altruism: 70, tradition: 60, peace: 80 },
  '田井中律': { order: 30, altruism: 70, tradition: 30, peace: 70 },
  '琴吹紬': { order: 50, altruism: 90, tradition: 70, peace: 90 },
  '中野梓': { order: 70, altruism: 60, tradition: 60, peace: 80 },
  '黄前久美子': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '加藤叶月': { order: 50, altruism: 70, tradition: 40, peace: 70 },
  '川岛绿辉': { order: 60, altruism: 70, tradition: 50, peace: 80 },
  '高坂丽奈': { order: 70, altruism: 30, tradition: 50, peace: 60 },
  '田中明日香': { order: 60, altruism: 40, tradition: 50, peace: 60 },
  '北宇治吹奏部部长': { order: 60, altruism: 50, tradition: 60, peace: 70 },
  '三日月三郎': { order: 50, altruism: 50, tradition: 50, peace: 60 },
  '高桥夏纪': { order: 40, altruism: 60, tradition: 40, peace: 60 },
  '吉川优纪': { order: 40, altruism: 60, tradition: 40, peace: 60 },
  '大石秀一郎': { order: 80, altruism: 90, tradition: 70, peace: 90 },
  '青峰大辉': { order: 20, altruism: 20, tradition: 20, peace: 30 },
  '桐岛郁弥': { order: 40, altruism: 30, tradition: 40, peace: 60 },
  '星见纯那': { order: 70, altruism: 60, tradition: 60, peace: 70 },
  '久海菜々美': { order: 60, altruism: 50, tradition: 50, peace: 60 },

  // === 2年C班 ===
  '折木奉太郎': { order: 40, altruism: 30, tradition: 40, peace: 90 },
  '千反田爱瑠': { order: 60, altruism: 90, tradition: 90, peace: 90 },
  '福部里志': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '伊原摩耶花': { order: 70, altruism: 60, tradition: 60, peace: 60 },
  '岡崎朋也': { order: 30, altruism: 60, tradition: 30, peace: 60 },
  '古河渚': { order: 50, altruism: 90, tradition: 60, peace: 90 },
  '藤林杏': { order: 50, altruism: 70, tradition: 50, peace: 50 },
  '藤林椋': { order: 50, altruism: 80, tradition: 60, peace: 80 },
  '坂上智代': { order: 70, altruism: 70, tradition: 70, peace: 60 },
  '一之濑琴美': { order: 60, altruism: 80, tradition: 60, peace: 90 },
  '春原阳平': { order: 20, altruism: 50, tradition: 20, peace: 60 },
  '乙坂有宇': { order: 40, altruism: 30, tradition: 40, peace: 60 },
  '友利奈绪': { order: 50, altruism: 60, tradition: 40, peace: 70 },
  '高城丈士朗': { order: 60, altruism: 50, tradition: 50, peace: 70 },
  '西森柚咲': { order: 50, altruism: 70, tradition: 40, peace: 80 },
  '菊丸英二': { order: 40, altruism: 80, tradition: 40, peace: 80 },
  '紫原敦': { order: 20, altruism: 10, tradition: 30, peace: 50 },
  '山崎宗介': { order: 60, altruism: 50, tradition: 50, peace: 50 },
  '大场奈奈': { order: 70, altruism: 80, tradition: 70, peace: 70 },
  '菊間夏夜': { order: 50, altruism: 60, tradition: 50, peace: 60 },

  // === 2年D班 ===
  '比企谷八幡': { order: 30, altruism: 20, tradition: 30, peace: 60 },
  '雪之下雪乃': { order: 80, altruism: 40, tradition: 70, peace: 50 },
  '由比滨结衣': { order: 40, altruism: 90, tradition: 40, peace: 80 },
  '一色彩羽': { order: 30, altruism: 10, tradition: 30, peace: 70 },
  '安艺伦也': { order: 40, altruism: 60, tradition: 30, peace: 70 },
  '加藤惠': { order: 50, altruism: 60, tradition: 50, peace: 90 },
  '霞之丘诗羽': { order: 60, altruism: 40, tradition: 50, peace: 60 },
  '泽村·斯宾塞·英梨梨': { order: 30, altruism: 30, tradition: 30, peace: 50 },
  '氷堂美智留': { order: 20, altruism: 60, tradition: 20, peace: 70 },
  '高须龙儿': { order: 70, altruism: 80, tradition: 60, peace: 50 },
  '逢坂大河': { order: 20, altruism: 40, tradition: 30, peace: 20 },
  '櫛枝实乃梨': { order: 40, altruism: 90, tradition: 40, peace: 80 },
  '川嶋亚美': { order: 60, altruism: 10, tradition: 50, peace: 50 },
  '北村祐作': { order: 70, altruism: 80, tradition: 60, peace: 80 },

  // === 2年E班 ===
  '高山P': { order: 60, altruism: 80, tradition: 50, peace: 70 },
  '岛村卯月': { order: 60, altruism: 90, tradition: 50, peace: 90 },
  '渋谷凛': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '神崎兰子': { order: 30, altruism: 60, tradition: 70, peace: 80 },
  '佐久间麻由': { order: 40, altruism: 50, tradition: 50, peace: 60 },
  '藤原肇': { order: 70, altruism: 60, tradition: 90, peace: 80 },
  '小日向美穗': { order: 50, altruism: 80, tradition: 50, peace: 80 },
  '樱木真乃': { order: 50, altruism: 90, tradition: 50, peace: 90 },
  '田中摩美々': { order: 20, altruism: 40, tradition: 30, peace: 60 },
  '芹泽朝日': { order: 10, altruism: 20, tradition: 10, peace: 50 },
  '有栖川夏叶': { order: 70, altruism: 60, tradition: 50, peace: 70 },
  '和泉爱依': { order: 30, altruism: 70, tradition: 30, peace: 80 },
  '福丸小糸': { order: 60, altruism: 40, tradition: 50, peace: 70 },

  // === 3年A班 ===
  '樱岛麻衣': { order: 70, altruism: 70, tradition: 50, peace: 70 },
  '梓川咲太': { order: 40, altruism: 80, tradition: 40, peace: 70 },
  '古贺朋绘': { order: 40, altruism: 60, tradition: 40, peace: 70 },
  '双叶理央': { order: 80, altruism: 50, tradition: 70, peace: 80 },
  '丰浜和香': { order: 50, altruism: 60, tradition: 40, peace: 70 },
  '梓川花楓': { order: 50, altruism: 80, tradition: 40, peace: 80 },
  '神田空太': { order: 50, altruism: 70, tradition: 50, peace: 70 },
  '椎名真白': { order: 10, altruism: 50, tradition: 20, peace: 80 },
  '青山七海': { order: 70, altruism: 60, tradition: 60, peace: 70 },
  '上井草美咲': { order: 20, altruism: 80, tradition: 10, peace: 90 },
  '三鹰仁': { order: 40, altruism: 50, tradition: 30, peace: 60 },
  '皆川茜': { order: 40, altruism: -40, tradition: 30, peace: 60 },
  '安乐冈花火': { order: 40, altruism: 30, tradition: 40, peace: 60 },
  '粟屋麦': { order: 40, altruism: 30, tradition: 40, peace: 60 },
  '鸣宫凪砂': { order: 60, altruism: 50, tradition: 60, peace: 70 },
  '清水洁子': { order: 70, altruism: 70, tradition: 60, peace: 80 },

  // === 3年B班 ===
  '宫园薰': { order: 20, altruism: 90, tradition: 20, peace: 80 },
  '有马公生': { order: 60, altruism: 60, tradition: 60, peace: 80 },
  '椿明音': { order: 40, altruism: 80, tradition: 40, peace: 60 },
  '渡亮太': { order: 30, altruism: 70, tradition: 30, peace: 70 },
  '森川由绮': { order: 50, altruism: 80, tradition: 60, peace: 80 },
  '绫濑乃绘里子': { order: 50, altruism: 50, tradition: 50, peace: 50 },
  '绫濑小春': { order: 50, altruism: 60, tradition: 50, peace: 70 },
  '立花泷': { order: 40, altruism: 70, tradition: 40, peace: 60 },
  '宫水三叶': { order: 60, altruism: 70, tradition: 80, peace: 70 },
  '奥寺美纪': { order: 60, altruism: 60, tradition: 50, peace: 70 },
  '茅野枫': { order: 60, altruism: 80, tradition: 40, peace: 70 },
  '宫水四叶': { order: 50, altruism: 50, tradition: 70, peace: 60 },
  '高坂穗乃果': { order: 30, altruism: 90, tradition: 40, peace: 80 },
  '南小鸟': { order: 50, altruism: 90, tradition: 50, peace: 90 },
  '园田海未': { order: 80, altruism: 70, tradition: 80, peace: 70 },
  '星空凛': { order: 30, altruism: 80, tradition: 30, peace: 80 },
  '不二周助': { order: 60, altruism: 70, tradition: 60, peace: 80 },
  '赤司征十郎': { order: 90, altruism: 20, tradition: 90, peace: 50 },
  '花柳香子': { order: 60, altruism: 40, tradition: 90, peace: 60 },
  '岡本未夕': { order: 50, altruism: 70, tradition: 50, peace: 70 },

  // === 3年C班 ===
  '凉宫春日': { order: 10, altruism: 40, tradition: 10, peace: 60 },
  '阿虚': { order: 50, altruism: 60, tradition: 50, peace: 80 },
  '长门有希': { order: 90, altruism: 50, tradition: 50, peace: 100 },
  '朝比奈实玖瑠': { order: 40, altruism: 80, tradition: 50, peace: 80 },
  '古泉一树': { order: 70, altruism: 50, tradition: 60, peace: 70 },
  '富樫勇太': { order: 60, altruism: 80, tradition: 50, peace: 80 },
  '小鸟游六花': { order: 20, altruism: 70, tradition: 30, peace: 70 },
  '丹生谷森夏': { order: 60, altruism: 50, tradition: 50, peace: 60 },
  '五月七日茴香': { order: 30, altruism: 90, tradition: 40, peace: 100 },
  '堀京子': { order: 60, altruism: 80, tradition: 50, peace: 60 },
  '宫村伊澄': { order: 40, altruism: 70, tradition: 30, peace: 70 },
  '石川透': { order: 50, altruism: 80, tradition: 40, peace: 70 },
  '吉川由纪': { order: 40, altruism: 70, tradition: 40, peace: 70 },
  '浅村悠太': { order: 50, altruism: 60, tradition: 50, peace: 80 },
  '绫濑沙季': { order: 60, altruism: 40, tradition: 50, peace: 70 },
  '乾貞治': { order: 70, altruism: 50, tradition: 60, peace: 70 },

  // === 3年D班 ===
  '流川枫': { order: 30, altruism: 20, tradition: 30, peace: 40 },
  '赤木刚宪': { order: 80, altruism: 70, tradition: 80, peace: 60 },
  '木暮公延': { order: 70, altruism: 90, tradition: 60, peace: 90 },
  '三井寿': { order: 40, altruism: 50, tradition: 40, peace: 50 },
  '樱井奈奈': { order: 40, altruism: 60, tradition: 40, peace: 70 },
  '田中望': { order: 10, altruism: 50, tradition: 20, peace: 60 },
  '菊池茜': { order: 50, altruism: 40, tradition: 50, peace: 70 },
  '鸟井真理': { order: 60, altruism: 50, tradition: 50, peace: 80 },
  '名濑美月': { order: 60, altruism: 40, tradition: 70, peace: 60 },
  '名濑博臣': { order: 40, altruism: 70, tradition: 50, peace: 70 },
  '神原秋人': { order: 50, altruism: 80, tradition: 40, peace: 70 },
  '栗山未来': { order: 40, altruism: 60, tradition: 40, peace: 60 },
  '绫濑绘里': { order: 80, altruism: 70, tradition: 70, peace: 70 },

  // === 3年E班 ===
  '高木社长': { order: 60, altruism: 50, tradition: 60, peace: 70 },
  '高垣枫': { order: 40, altruism: 60, tradition: 40, peace: 80 },
  '十时爱梨': { order: 30, altruism: 80, tradition: 30, peace: 80 },
  '片桐早苗': { order: 50, altruism: 70, tradition: 40, peace: 70 },
  '川岛瑞树': { order: 60, altruism: 80, tradition: 50, peace: 80 },
  '橘爱丽丝': { order: 70, altruism: 40, tradition: 60, peace: 70 },
  '白坂小梅': { order: 30, altruism: 40, tradition: 30, peace: 60 },
  '幽谷雾子': { order: 50, altruism: 90, tradition: 50, peace: 80 },
  '白濑咲耶': { order: 70, altruism: 80, tradition: 70, peace: 70 },
  '西城树里': { order: 40, altruism: 60, tradition: 30, peace: 60 },
  '绿川真奈': { order: 50, altruism: 80, tradition: 40, peace: 80 },
  '樋口円香': { order: 60, altruism: 20, tradition: 50, peace: 60 }
}

/**
 * 默认目标配置（按角色名）
 */
export const DEFAULT_GOALS = {
  '后藤一里': {
    immediate: '完成今天的乐队练习',
    shortTerm: '能在台上正常演出',
    longTerm: '成为被认可的吉他手'
  },
  '比企谷八幡': {
    immediate: '安静地度过今天',
    shortTerm: '完成奉仕部的委托',
    longTerm: '找到真正的东西'
  },
  '白银御行': {
    immediate: '让四宫先告白',
    shortTerm: '保持学业第一名',
    longTerm: '考入斯坦福大学'
  },
  '凉宫春日': {
    immediate: '寻找不可思议的事件',
    shortTerm: '让SOS团更有名',
    longTerm: '让世界变得更有趣'
  },
  '绫小路清隆': {
    immediate: '保持普通的生活',
    shortTerm: '让D班升到A班',
    longTerm: '证明教育的意义'
  }
}

/**
 * 默认行动优先级配置（按角色名）
 */
export const DEFAULT_PRIORITIES = {
  '后藤一里': { academics: 40, social: 20, hobbies: 90, survival: 30, club: 85 },
  '比企谷八幡': { academics: 60, social: 10, hobbies: 50, survival: 70, club: 40 },
  '白银御行': { academics: 100, social: 50, hobbies: 30, survival: 60, club: 80 },
  '凉宫春日': { academics: 70, social: 80, hobbies: 100, survival: 50, club: 95 },
  '绫小路清隆': { academics: 50, social: 30, hobbies: 20, survival: 90, club: 10 },
  '平泽唯': { academics: 20, social: 70, hobbies: 80, survival: 30, club: 90 },
  '雪之下雪乃': { academics: 90, social: 30, hobbies: 40, survival: 50, club: 60 },
}

/**
 * 计算综合好感度分数
 * 公式：(亲密 * 0.4 + 信赖 * 0.4 + 激情 * 0.2) - (敌意 * 0.5)
 * @param {Object} relationship - 关系数据
 * @returns {number} -100 到 100
 */
export function calculateRelationshipScore(relationship) {
  if (!relationship) return 0
  const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = relationship
  
  // 计算基础分
  let score = (intimacy * 0.4) + (trust * 0.4) + (passion * 0.2) - (hostility * 0.5)
  
  // 限制范围
  return Math.max(-100, Math.min(100, Math.round(score)))
}

/**
 * 获取关系心意描述
 * @param {Object} relationship - 关系数据
 * @param {string} playerGender - 玩家性别 ('male' | 'female')
 * @param {string} targetGender - 目标角色性别 ('male' | 'female')
 * @returns {Object} { text: string, class: string }
 */
export function getEmotionalState(relationship, playerGender = 'male', targetGender = 'female') {
  if (!relationship) return { text: '陌生人', class: 'level-stranger' }
  
  const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = relationship
  const score = calculateRelationshipScore(relationship)
  
  // 检查是否允许浪漫关系
  // 如果玩家是男性，且目标也是男性，则不显示浪漫相关的状态
  const isRomanceBlocked = (playerGender === 'male' && targetGender === 'male')

  // 特殊状态判断 (优先级高)
  if (hostility >= 80) return { text: '死敌', class: 'level-hostile-extreme' }
  if (!isRomanceBlocked && hostility >= 40 && passion >= 50) return { text: '爱恨交织', class: 'level-complex' }
  if (hostility >= 50) return { text: '敌对', class: 'level-hostile' }
  
  // 正向状态判断
  if (!isRomanceBlocked && intimacy >= 80 && trust >= 80 && passion >= 70) return { text: '灵魂伴侣', class: 'level-soulmate' }
  if (!isRomanceBlocked && intimacy >= 70 && trust >= 70 && passion >= 50) return { text: '恋人', class: 'level-lover' }
  if (!isRomanceBlocked && passion >= 70 && intimacy < 40) return { text: '迷恋', class: 'level-crush' } // 单相思/憧憬
  
  if (intimacy >= 80 && trust >= 80) return { text: '挚友', class: 'level-best' }
  if (intimacy >= 60 && trust < 40) return { text: '损友', class: 'level-bad-friend' } 
  if (trust >= 70 && intimacy < 40) return { text: '可靠伙伴', class: 'level-partner' }
  
  // 基础
  if (score >= 60) return { text: '好友', class: 'level-good' }
  if (score >= 30) return { text: '朋友', class: 'level-friend' }
  if (score >= 10) return { text: '熟人', class: 'level-known' }
  if (score < -30) return { text: '厌恶', class: 'level-dislike' }
  
  return { text: '普通', class: 'level-stranger' }
}

/**
 * 判断是否应该成为社交APP好友
 * @param {Object} relationship - 关系数据
 * @param {boolean} isPlayerInvolved - 是否涉及玩家
 * @returns {boolean}
 */
export function shouldBeSocialFriend(relationship, isPlayerInvolved = false) {
  if (!relationship) return false
  
  // 如果涉及玩家，不自动添加好友（由AI指令控制）
  if (isPlayerInvolved) return false
  
  // 正面关系条件：亲密度>30 或 信赖度>30，且敌意<20
  // 且分组包含朋友、密友、恋人、家人或社团成员
  const hasPositiveRelation = (
    (relationship.intimacy > 30 || relationship.trust > 30) &&
    relationship.hostility < 20
  )
  
  const hasValidGroup = relationship.groups && relationship.groups.some(g => 
    ['friend', 'closeFriend', 'lover', 'family', 'clubMember'].includes(g)
  )
  
  return hasPositiveRelation && hasValidGroup
}

/**
 * 获取关系描述文本 (已废弃，建议使用 getEmotionalState)
 * @param {Object} relationship - 关系数据
 * @returns {string}
 */
export function getRelationshipDescription(relationship) {
  return getEmotionalState(relationship).text
}

/**
 * 生成角色的社交APP ID
 * @param {string} name - 角色名
 * @returns {string}
 */
export function generateCharId(name) {
  // 简单的hash生成
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `char_${Math.abs(hash).toString(36)}`
}
