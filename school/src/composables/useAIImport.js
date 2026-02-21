// AI角色导入功能 Composable
import { ref } from 'vue'
import { ELECTIVE_PREFERENCES } from '../data/coursePoolData'
import { DEFAULT_TEMPLATES } from '../utils/npcScheduleSystem'
import { BASE_RANGES, POTENTIAL_MAP, SUBJECT_TRAITS } from '../data/academicData'
import { removeThinking } from '../utils/summaryManager'

export function useAIImport() {
  const aiImportLoading = ref(false)
  const aiImportError = ref('')
  const aiImportEntries = ref([{ work: '', character: '' }])
  const aiImportResults = ref({ found: [], notFound: [], workResults: [] })
  const aiImportStreamText = ref('')

  // 辅助函数
  const parseAttributes = (attrStr) => {
    const attrs = {}
    const regex = /(\w+)="([^"]*)"/g
    let m
    while ((m = regex.exec(attrStr)) !== null) {
      attrs[m[1]] = m[2]
    }
    return attrs
  }

  const clampValue = (val, min, max) => Math.max(min, Math.min(max, val))

  // 构建AI导入提示词
  const buildAIImportPrompt = () => {
    const templateKeys = Object.keys(DEFAULT_TEMPLATES).join(', ')
    const prefKeys = Object.keys(ELECTIVE_PREFERENCES).join(', ')
    const academicLevelKeys = Object.keys(BASE_RANGES).join(', ')
    const academicPotentialKeys = Object.keys(POTENTIAL_MAP).join(', ')
    const traitKeys = Object.keys(SUBJECT_TRAITS).join(', ')

    const entries = aiImportEntries.value.filter(e => e.work.trim())
    let querySection = ''
    const workOnlyEntries = entries.filter(e => !e.character.trim())
    const charEntries = entries.filter(e => e.character.trim())

    if (workOnlyEntries.length > 0) {
      querySection += '请列出以下作品中你认识的所有角色：\n'
      workOnlyEntries.forEach(e => { querySection += `- 作品：${e.work}\n` })
    }
    if (charEntries.length > 0) {
      querySection += '请查询以下角色的详细信息：\n'
      charEntries.forEach(e => { querySection += `- 作品：${e.work}，角色：${e.character}\n` })
    }

    return `你是一个角色数据库查询助手。你的唯一任务是根据用户提供的动漫/游戏/小说作品名和角色名，返回你知识库中已知的角色信息。

核心规则：
1. 绝对不允许编造角色。如果你不认识某个作品或角色，必须明确标记 found="false"。
2. 如果你只是模糊听过但不确定，也标记为 found="false"。宁可漏报也不能错报。
3. 只返回结构化的XML指令，不要输出任何叙事文本、解释或<content>标签。
4. 性格四维轴说明：order(秩序感,-100混乱~100守序), altruism(利他性,-100利己~100利他), tradition(传统性,-100革新~100传统), peace(和平性,-100好斗~100温和)
5. 选课倾向可选值：${prefKeys}
6. 日程模板可选值：${templateKeys}
7. 关系中的数值范围：intimacy(亲密度,0~100), trust(信赖度,0~100), passion(激情度,0~100), hostility(敌意度,0~100)
8. 角色分类建议：请根据角色在原作中的年龄、职业和身份，给出 role_suggestion (student/teacher/staff/uncertain) 和 role_reason (理由)。
9. 学力评估：level(${academicLevelKeys}), potential(${academicPotentialKeys}), traits(${traitKeys})

[返回格式 - 查询特定角色]
<roster_character name="角色名" work="作品名" found="true" gender="male或female" role_suggestion="student/teacher/staff/uncertain" role_reason="理由">
  <personality order="数值" altruism="数值" tradition="数值" peace="数值" />
  <academic level="等级" potential="潜力" traits="特长标签,逗号分隔" />
  <elective_preference>类型</elective_preference>
  <schedule_tag>模板ID</schedule_tag>
  <relationships>
    <rel target="同作品关系角色名" intimacy="数值" trust="数值" passion="数值" hostility="数值" tags="印象标签,逗号分隔" />
  </relationships>
</roster_character>

如果角色未找到：
<roster_character name="角色名" work="作品名" found="false" reason="未找到原因" />

[返回格式 - 查询作品中的所有角色]
<roster_work work="作品名" found="true">
  <char name="角色名1" gender="male或female" />
  <char name="角色名2" gender="male或female" />
</roster_work>

如果作品未找到：
<roster_work work="作品名" found="false" reason="未找到原因" />

${querySection}`
  }

  // 解析AI返回的响应
  const parseAIImportResponse = (text) => {
    // 预处理：移除可能的包裹标签和干扰内容
    text = text.replace(/<\/?content[^>]*>/gi, '') // 移除 <content> 标签
    text = removeThinking(text) // 移除思维链标签
    text = text.replace(/<\/?response[^>]*>/gi, '') // 移除 <response> 标签
    text = text.replace(/```xml\s*/gi, '').replace(/```\s*/gi, '') // 移除代码块标记

    const found = []
    const notFound = []
    const workResults = []
    const parsedNames = new Set()

    // 解析 <roster_character>...</roster_character>
    const charRegex = /<roster_character\s+([^>]+)>([\s\S]*?)<\/roster_character>/g
    let match
    while ((match = charRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      const body = match[2]
      parsedNames.add(attrs.name)

      if (attrs.found === 'false') {
        notFound.push({ name: attrs.name || '未知', work: attrs.work || '未知', reason: attrs.reason || 'AI知识库中无此角色' })
        continue
      }

      // 解析性格
      const pMatch = body.match(/<personality\s+([^/]+)\/>/)
      let personality = { order: 0, altruism: 0, tradition: 0, peace: 50 }
      if (pMatch) {
        const pa = parseAttributes(pMatch[1])
        personality = {
          order: clampValue(parseInt(pa.order) || 0, -100, 100),
          altruism: clampValue(parseInt(pa.altruism) || 0, -100, 100),
          tradition: clampValue(parseInt(pa.tradition) || 0, -100, 100),
          peace: clampValue(parseInt(pa.peace) || 50, -100, 100)
        }
      }

      // 解析学力
      const academicMatch = body.match(/<academic\s+([^/]+)\/>/)
      let academicProfile = { level: 'avg', potential: 'medium', traits: [] }
      if (academicMatch) {
        const aa = parseAttributes(academicMatch[1])
        academicProfile = {
          level: BASE_RANGES[aa.level] ? aa.level : 'avg',
          potential: POTENTIAL_MAP[aa.potential] ? aa.potential : 'medium',
          traits: aa.traits ? aa.traits.split(/[,，]/).map(t => t.trim()).filter(t => t && SUBJECT_TRAITS[t]) : []
        }
      }

      // 解析选课倾向
      const prefMatch = body.match(/<elective_preference>(.*?)<\/elective_preference>/)
      let electivePreference = 'general'
      if (prefMatch && ELECTIVE_PREFERENCES[prefMatch[1].trim()]) {
        electivePreference = prefMatch[1].trim()
      }

      // 解析日程模板
      const schedMatch = body.match(/<schedule_tag>(.*?)<\/schedule_tag>/)
      let scheduleTag = ''
      if (schedMatch && DEFAULT_TEMPLATES[schedMatch[1].trim()]) {
        scheduleTag = schedMatch[1].trim()
      }

      // 解析关系
      const relationships = []
      const relRegex = /<rel\s+([^/]+)\/>/g
      let relMatch
      while ((relMatch = relRegex.exec(body)) !== null) {
        const ra = parseAttributes(relMatch[1])
        relationships.push({
          target: ra.target || '',
          intimacy: clampValue(parseInt(ra.intimacy) || 0, 0, 100),
          trust: clampValue(parseInt(ra.trust) || 0, 0, 100),
          passion: clampValue(parseInt(ra.passion) || 0, 0, 100),
          hostility: clampValue(parseInt(ra.hostility) || 0, 0, 100),
          tags: ra.tags ? ra.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : []
        })
      }

      found.push({
        name: attrs.name || '未知',
        work: attrs.work || '未知',
        gender: attrs.gender || 'female',
        roleSuggestion: attrs.role_suggestion || 'student',
        roleReason: attrs.role_reason || '',
        personality,
        academicProfile,
        electivePreference,
        scheduleTag,
        relationships,
        selected: true
      })
    }

    // 解析自闭合的 <roster_character ... />
    const charSCRegex = /<roster_character\s+([^/]+)\s*\/>/g
    while ((match = charSCRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      if (parsedNames.has(attrs.name)) continue
      parsedNames.add(attrs.name)
      if (attrs.found === 'false') {
        notFound.push({ name: attrs.name || '未知', work: attrs.work || '未知', reason: attrs.reason || 'AI知识库中无此角色' })
      }
    }

    // 解析 <roster_work>...</roster_work>
    const workRegex = /<roster_work\s+([^>]+)>([\s\S]*?)<\/roster_work>/g
    const parsedWorks = new Set()
    while ((match = workRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      parsedWorks.add(attrs.work)
      if (attrs.found === 'false') {
        workResults.push({ work: attrs.work || '未知', found: false, reason: attrs.reason || '未找到该作品', characters: [] })
        continue
      }
      const chars = []
      const cRegex = /<char\s+([^/]+)\/>/g
      let cm
      while ((cm = cRegex.exec(match[2])) !== null) {
        const ca = parseAttributes(cm[1])
        chars.push({
          name: ca.name || '未知',
          gender: ca.gender || 'female',
          roleSuggestion: ca.role_suggestion || 'student',
          selected: true
        })
      }
      workResults.push({ work: attrs.work || '未知', found: true, characters: chars })
    }

    // 解析自闭合的 <roster_work ... />
    const workSCRegex = /<roster_work\s+([^/]+)\s*\/>/g
    while ((match = workSCRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      if (parsedWorks.has(attrs.work)) continue
      if (attrs.found === 'false') {
        workResults.push({ work: attrs.work || '未知', found: false, reason: attrs.reason || '未找到该作品', characters: [] })
      }
    }

    return { found, notFound, workResults }
  }

  // 提交AI查询
  const submitAIImport = async () => {
    const validEntries = aiImportEntries.value.filter(e => e.work.trim())
    if (validEntries.length === 0) {
      aiImportError.value = '请至少填写一个作品名'
      return { success: false }
    }
    if (!window.generate) {
      aiImportError.value = 'AI生成接口不可用（需要在SillyTavern环境中运行）'
      return { success: false }
    }

    aiImportLoading.value = true
    aiImportError.value = ''
    aiImportStreamText.value = ''

    try {
      const prompt = buildAIImportPrompt()
      console.log('[AI Import] Sending query to AI...')

      const result = await window.generateRaw({
        user_input: prompt,
        ordered_prompts: [
          { role: 'system', content: '你是角色数据库查询助手。只返回结构化XML数据，不要输出任何叙事内容、<content>标签或额外解释。' },
          'user_input',
        ],
        should_stream: false
      })

      if (!result || result === '__ERROR__' || result === '__STOPPED__') {
        aiImportError.value = 'AI生成失败或被中断，请重试'
        return { success: false }
      }

      console.log('[AI Import] Received response, parsing...')
      aiImportStreamText.value = result

      const parsed = parseAIImportResponse(result)
      aiImportResults.value = parsed

      if (parsed.found.length === 0 && parsed.notFound.length === 0 && parsed.workResults.length === 0) {
        aiImportError.value = '无法从AI回复中解析出有效数据，请重试'
        return { success: false }
      }

      return { success: true }
    } catch (e) {
      console.error('[AI Import] Error:', e)
      aiImportError.value = `AI调用失败: ${e.message}`
      return { success: false }
    } finally {
      aiImportLoading.value = false
    }
  }

  // 重置状态
  const resetAIImport = () => {
    aiImportEntries.value = [{ work: '', character: '' }]
    aiImportError.value = ''
    aiImportStreamText.value = ''
    aiImportResults.value = { found: [], notFound: [], workResults: [] }
  }

  return {
    aiImportLoading,
    aiImportError,
    aiImportEntries,
    aiImportResults,
    aiImportStreamText,
    submitAIImport,
    resetAIImport
  }
}
