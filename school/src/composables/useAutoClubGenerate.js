/**
 * 社团自动生成 Composable
 * AI调用、解析、创建社团
 */
import { ref } from 'vue'
import { removeThinking } from '../utils/summaryManager'

export function useAutoClubGenerate() {
  const generating = ref(false)
  const clubResults = ref([])
  const clubError = ref('')

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
  function buildClubPrompt(characters, mode, existingClubs) {
    const existingList = Object.entries(existingClubs || {})
      .map(([id, club]) => `- ${club.name || id} (${id})`)
      .join('\n') || '(无)'

    const charList = characters.map(c => {
      return `- ${c.name} (${c.origin || '未知'}) ${c.role === 'teacher' ? '教师' : '学生'} 班级:${c.classId || '未分配'}`
    }).join('\n')

    const modeDesc = mode === 'original'
      ? '原作向：基于角色原作中的社团/组织进行还原'
      : '原创向：根据角色特点创造新的有趣社团'

    return `你是社团生成助手。根据角色列表生成社团。

模式: ${modeDesc}

[现有社团]
${existingList}

[角色列表]
${charList}

[规则]
1. 每个社团需要一名指导老师(advisor)和至少2名成员
2. 社团ID格式: 原作向用 "auto_作品缩写_社团缩写"，原创向用 "creative_关键词"
3. 不要与现有社团重复（如重复则只列出需要添加的新成员）
4. 每个社团3-8名成员为宜
5. 活动日从 monday/tuesday/wednesday/thursday/friday 中选择

返回格式:
<club_result>
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

    return { clubs, additions }
  }

  /**
   * 生成社团
   */
  async function generateClubs(characters, mode, existingClubs) {
    if (!window.generateRaw) {
      clubError.value = 'AI生成接口不可用'
      return { success: false, message: clubError.value }
    }

    generating.value = true
    clubError.value = ''

    try {
      const prompt = buildClubPrompt(characters, mode, existingClubs)
      const result = await window.generateRaw({
        user_input: prompt,
        ordered_prompts: [
          { role: 'system', content: '你是社团生成助手。只返回结构化XML数据。' },
          'user_input',
        ],
        should_stream: false
      })

      if (!result || result === '__ERROR__' || result === '__STOPPED__') {
        throw new Error('AI调用失败')
      }

      const parsed = parseClubResponse(result)
      clubResults.value = parsed.clubs
      return { success: true, clubs: parsed.clubs, additions: parsed.additions }
    } catch (e) {
      console.error('[AutoClub] Error:', e)
      clubError.value = e.message
      return { success: false, message: e.message }
    } finally {
      generating.value = false
    }
  }

  /**
   * 应用社团结果到gameStore
   */
  async function applyClubResults(clubs, additions, gameStore, createClubFn, addMemberFn) {
    const results = { created: 0, updated: 0 }

    for (const club of clubs) {
      try {
        await createClubFn(club, gameStore.currentRunId)
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
            await addMemberFn(addition.clubId, memberName, existingClub, gameStore.currentRunId)
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
    clubError.value = ''
  }

  return {
    generating,
    clubResults,
    clubError,
    generateClubs,
    applyClubResults,
    resetClubs
  }
}
