/**
 * 社团自动生成 Composable
 * AI调用、解析、创建社团
 */
import { ref } from 'vue'
import { removeThinking } from '../utils/summaryManager'

export function useAutoClubGenerate() {
  const generating = ref(false)
  const clubResults = ref([])
  const clubAdditions = ref([])
  const clubError = ref('')
  const progress = ref('')
  const newAdvisors = ref([])

  const parseAttributes = (attrStr) => {
    const attrs = {}
    const regex = /(\w+)="([^"]*)"/g
    let m
    while ((m = regex.exec(attrStr)) !== null) {
      attrs[m[1]] = m[2]
    }
    return attrs
  }

  /**
   * 构建社团生成Prompt
   */
  function buildClubPrompt(characters, mode, existingClubs, extraTeachers = []) {
    const existingList = Object.entries(existingClubs || {})
      .map(([id, club]) => `- ${club.name || id} (${id}) 成员:${(club.members || []).join(',')}`)
      .join('\n') || '(无)'

    // 构建角色→所属社团映射
    const charClubMap = {}
    for (const [clubId, club] of Object.entries(existingClubs || {})) {
      for (const member of (club.members || [])) {
        if (!charClubMap[member]) charClubMap[member] = []
        charClubMap[member].push(club.name || clubId)
      }
    }

    const roleMap = { student: '学生', teacher: '教师', staff: '职工', external: '校外人员' }
    const charList = characters.map(c => {
      const roleLabel = roleMap[c.role] || c.role || '学生'
      const extra = c.staffTitle ? ` 职务:${c.staffTitle}` : ''
      const classInfo = (c.role === 'staff' || c.role === 'external') ? '' : ` 班级:${c.classId || '未分配'}`
      const clubInfo = charClubMap[c.name] ? ` 已加入:[${charClubMap[c.name].join(',')}]` : ''
      return `- ${c.name} (${c.origin || '未知'}) ${roleLabel}${extra}${classInfo}${clubInfo}`
    }).join('\n')

    // 可用教师列表（本批角色中的教师 + 前批新建的教师）
    const teachersFromPool = characters.filter(c => c.role === 'teacher')
    const allTeachers = [...teachersFromPool.map(c => `- ${c.name} (${c.origin || '未知'})`)]
    for (const t of extraTeachers) {
      if (!teachersFromPool.find(c => c.name === t.name)) {
        allTeachers.push(`- ${t.name} (${t.origin || '未知'}) [前批新建]`)
      }
    }
    const teacherList = allTeachers.join('\n') || '(无教师角色)'

    const modeDesc = mode === 'original'
      ? '原作向：基于角色原作中的社团/组织进行还原'
      : '原创向：根据角色特点创造新的有趣社团'

    return `你是社团生成助手。根据角色列表生成社团。

模式: ${modeDesc}

[现有社团]
${existingList}

[角色列表]
${charList}

[可用教师]
${teacherList}

[规则]
1. 社团可以有指导老师(advisor)，也可以没有。如果原作社团没有指导老师则留空。如需指导老师，优先从[可用教师]中选择
2. 社团ID格式: 原作向用 "auto_作品缩写_社团缩写"，原创向用 "creative_关键词"
3. 不要与现有社团重复（如重复则用add_to_existing只列出需要添加的新成员）
4. 每个社团3-8名成员为宜
5. 活动日从 monday/tuesday/wednesday/thursday/friday 中选择
6. 角色可以同时加入多个社团，但请注意已加入社团的信息，避免安排过多社团
7. 如果确实需要指导老师但可用教师不足，可以创建新教师，但必须提供完整的全名（姓+名，不要缩写或加"老师"后缀）和来源作品(origin)。新教师用 new_advisor 标签声明

返回格式:
<club_result>
  <new_advisor name="完整全名" origin="来源作品" gender="male或female" />
  <club name="社团名" id="club_id" description="描述"
    advisor="指导老师" president="部长" vice_president="副部长"
    core_skill="核心技能" activity_day="活动日" location="地点">
    <member name="成员名" />
  </club>
  <add_to_existing club_id="已有社团ID">
    <member name="新成员名" />
  </add_to_existing>
</club_result>

注意：只返回XML格式数据，不要输出其他内容。`
  }

  /**
   * 解析社团生成响应
   */
  function parseClubResponse(text) {
    text = text.replace(/<\/?content[^>]*>/gi, '')
    text = removeThinking(text)
    text = text.replace(/<\/?response[^>]*>/gi, '')
    text = text.replace(/```xml\s*/gi, '').replace(/```\s*/gi, '')

    const clubs = []
    const additions = []

    // 解析新社团
    const clubRegex = /<club\s+([^>]*?)>([\s\S]*?)<\/club>/g
    let match
    while ((match = clubRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      const body = match[2]
      const members = []
      const memberRegex = /<member\s+([^/]*?)\/>/g
      let mMatch
      while ((mMatch = memberRegex.exec(body)) !== null) {
        const ma = parseAttributes(mMatch[1])
        if (ma.name) members.push(ma.name)
      }

      clubs.push({
        id: attrs.id || `auto_${Date.now()}`,
        name: attrs.name || '',
        description: attrs.description || '',
        advisor: attrs.advisor || '',
        president: attrs.president || '',
        vicePresident: attrs.vice_president || '',
        coreSkill: attrs.core_skill || '',
        activityDay: attrs.activity_day || '',
        location: attrs.location || '',
        members
      })
    }

    // 解析添加到现有社团
    const addRegex = /<add_to_existing\s+([^>]*?)>([\s\S]*?)<\/add_to_existing>/g
    while ((match = addRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      const body = match[2]
      const members = []
      const memberRegex = /<member\s+([^/]*?)\/>/g
      let mMatch
      while ((mMatch = memberRegex.exec(body)) !== null) {
        const ma = parseAttributes(mMatch[1])
        if (ma.name) members.push(ma.name)
      }
      if (attrs.club_id && members.length > 0) {
        additions.push({ clubId: attrs.club_id, members })
      }
    }

    // 解析新教师声明
    const parsedNewAdvisors = []
    const advisorRegex = /<new_advisor\s+([^/]*?)\/>/g
    while ((match = advisorRegex.exec(text)) !== null) {
      const attrs = parseAttributes(match[1])
      if (attrs.name) {
        parsedNewAdvisors.push({
          name: attrs.name,
          origin: attrs.origin || '',
          gender: attrs.gender || ''
        })
      }
    }

    return { clubs, additions, newAdvisors: parsedNewAdvisors }
  }

  /**
   * 将角色分批，避免单次 prompt 过大
   */
  const BATCH_SIZE = 25

  function splitIntoBatches(characters, mode) {
    if (characters.length <= BATCH_SIZE) return [characters]

    if (mode === 'original') {
      // 原作向：按 origin 分组，同作品角色在同一批
      const groups = {}
      for (const c of characters) {
        const key = c.origin || '未知'
        if (!groups[key]) groups[key] = []
        groups[key].push(c)
      }
      const batches = []
      let current = []
      for (const group of Object.values(groups)) {
        if (current.length + group.length > BATCH_SIZE && current.length > 0) {
          batches.push(current)
          current = []
        }
        current.push(...group)
      }
      if (current.length > 0) batches.push(current)
      return batches
    } else {
      const batches = []
      for (let i = 0; i < characters.length; i += BATCH_SIZE) {
        batches.push(characters.slice(i, i + BATCH_SIZE))
      }
      return batches
    }
  }

  /**
   * 生成社团（自动分批）
   */
  async function generateClubs(characters, mode, existingClubs) {
    if (!window.generateRaw) {
      clubError.value = 'AI生成接口不可用'
      return { success: false, message: clubError.value }
    }

    generating.value = true
    clubError.value = ''
    clubResults.value = []
    clubAdditions.value = []
    newAdvisors.value = []
    progress.value = ''

    const batches = splitIntoBatches(characters, mode)
    const accumulatedClubs = { ...(existingClubs || {}) }
    const allClubs = []
    const allAdditions = []
    const allNewAdvisors = []

    try {
      for (let i = 0; i < batches.length; i++) {
        progress.value = batches.length > 1 ? `${i + 1}/${batches.length}` : ''

        const prompt = buildClubPrompt(batches[i], mode, accumulatedClubs, allNewAdvisors)
        const result = await window.generateRaw({
          user_input: prompt,
          ordered_prompts: [
            { role: 'system', content: '你是社团生成助手。只返回结构化XML数据。' },
            'user_input',
          ],
          should_stream: false
        })

        if (!result || result === '__ERROR__' || result === '__STOPPED__') {
          throw new Error(`第${i + 1}批AI调用失败`)
        }

        const parsed = parseClubResponse(result)
        allClubs.push(...parsed.clubs)
        allAdditions.push(...parsed.additions)

        // 累积新教师（去重）
        for (const advisor of (parsed.newAdvisors || [])) {
          if (!allNewAdvisors.find(a => a.name === advisor.name)) {
            allNewAdvisors.push(advisor)
          }
        }

        // 将本批结果注入累积上下文，供下一批参考
        for (const club of parsed.clubs) {
          accumulatedClubs[club.id] = { name: club.name, members: club.members, advisor: club.advisor }
        }
        for (const addition of parsed.additions) {
          if (accumulatedClubs[addition.clubId]) {
            const ec = accumulatedClubs[addition.clubId]
            ec.members = [...(ec.members || []), ...addition.members]
          }
        }

        // 实时更新预览
        clubResults.value = [...allClubs]
        clubAdditions.value = [...allAdditions]
        newAdvisors.value = [...allNewAdvisors]
      }

      progress.value = ''
      return { success: true, clubs: allClubs, additions: allAdditions, newAdvisors: allNewAdvisors }
    } catch (e) {
      console.error('[AutoClub] Error:', e)
      clubError.value = e.message
      return { success: false, message: e.message }
    } finally {
      generating.value = false
      progress.value = ''
    }
  }

  /**
   * 应用社团结果到gameStore
   */
  async function applyClubResults(clubs, additions, gameStore, createClubFn, addMemberFn, runId = null) {
    const results = { created: 0, updated: 0, merged: 0 }

    for (const club of clubs) {
      try {
        const existing = gameStore.allClubs?.[club.id]
        if (existing) {
          // ID冲突：合并成员到现有社团
          const newMembers = (club.members || []).filter(m => !(existing.members || []).includes(m))
          for (const memberName of newMembers) {
            await addMemberFn(club.id, memberName, existing, runId)
            if (!existing.members) existing.members = []
            if (!existing.members.includes(memberName)) {
              existing.members.push(memberName)
            }
          }
          results.merged++
          continue
        }

        await createClubFn(club, runId)
        if (!gameStore.allClubs) gameStore.allClubs = {}
        gameStore.allClubs[club.id] = {
          name: club.name,
          advisor: club.advisor,
          president: club.president,
          vicePresident: club.vicePresident,
          members: club.members,
          coreSkill: club.coreSkill,
          activityDay: club.activityDay,
          location: club.location,
          description: club.description
        }
        results.created++
      } catch (e) {
        console.error(`[AutoClub] Failed to create club ${club.id}:`, e)
      }
    }

    for (const addition of additions) {
      try {
        const existingClub = gameStore.allClubs?.[addition.clubId]
        if (existingClub) {
          for (const memberName of addition.members) {
            await addMemberFn(addition.clubId, memberName, existingClub, runId)
            if (!existingClub.members) existingClub.members = []
            if (!existingClub.members.includes(memberName)) {
              existingClub.members.push(memberName)
            }
          }
          results.updated++
        }
      } catch (e) {
        console.error(`[AutoClub] Failed to add members to ${addition.clubId}:`, e)
      }
    }

    return results
  }

  function resetClubs() {
    generating.value = false
    clubResults.value = []
    clubAdditions.value = []
    clubError.value = ''
    progress.value = ''
    newAdvisors.value = []
  }

  return {
    generating,
    clubResults,
    clubAdditions,
    clubError,
    progress,
    newAdvisors,
    generateClubs,
    applyClubResults,
    resetClubs
  }
}
