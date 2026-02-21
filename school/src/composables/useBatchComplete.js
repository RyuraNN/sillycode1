// 批量补全功能 Composable
import { ref } from 'vue'
import { BASE_RANGES, POTENTIAL_MAP, SUBJECT_TRAITS } from '../data/academicData'
import { setRelationship, getRelationship } from '../utils/relationshipManager'
import { removeThinking } from '../utils/summaryManager'

export function useBatchComplete() {
  const batchProcessing = ref(false)
  const batchProgress = ref({ current: 0, total: 0, status: '' })
  const batchResults = ref([])
  const batchResumeIndex = ref(0)
  const batchChunksCache = ref([])
  const batchCandidatesCache = ref([])

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

  const deepClone = (data) => JSON.parse(JSON.stringify(data))

  // 获取待处理角色列表
  const getBatchCandidates = (selection, fullRosterSnapshot, characterPool) => {
    let candidates = []
    const { mode, targetClass } = selection

    if (mode === 'class' && targetClass) {
      const classInfo = fullRosterSnapshot[targetClass]
      if (classInfo) {
        if (classInfo.headTeacher?.name) candidates.push(classInfo.headTeacher)
        if (Array.isArray(classInfo.teachers)) candidates.push(...classInfo.teachers)
        if (Array.isArray(classInfo.students)) candidates.push(...classInfo.students)
      }
    } else if (mode === 'missing_academic') {
      candidates = characterPool.filter(c =>
        c.role === 'student' &&
        (!c.academicProfile || (c.academicProfile.level === 'avg' && c.academicProfile.potential === 'medium' && (!c.academicProfile.traits || c.academicProfile.traits.length === 0)))
      )
    } else if (mode === 'missing_personality') {
      candidates = characterPool.filter(c =>
        !c.personality || (c.personality.order === 0 && c.personality.altruism === 0 && c.personality.tradition === 0 && c.personality.peace === 50)
      )
    } else if (mode === 'by_class') {
      // by_class 模式下返回所有班级的全部角色（扁平列表）
      for (const classInfo of Object.values(fullRosterSnapshot)) {
        if (classInfo.headTeacher?.name) candidates.push(classInfo.headTeacher)
        if (Array.isArray(classInfo.teachers)) candidates.push(...classInfo.teachers)
        if (Array.isArray(classInfo.students)) candidates.push(...classInfo.students)
      }
    } else if (mode === 'all') {
      candidates = [...characterPool]
    }

    // 去重
    const unique = new Map()
    candidates.forEach(c => {
      if (c.name) unique.set(c.name, c)
    })
    return Array.from(unique.values())
  }

  // 构建批量补全Prompt
  const buildBatchPrompt = (chars, options) => {
    const academicLevelKeys = Object.keys(BASE_RANGES).join(', ')
    const academicPotentialKeys = Object.keys(POTENTIAL_MAP).join(', ')
    const traitKeys = Object.keys(SUBJECT_TRAITS).join(', ')

    let requestDesc = '请根据角色的原作设定，补充以下缺失信息：\n'
    if (options.academic) requestDesc += `- 学业能力评估 (level/potential/traits)\n`
    if (options.personality) requestDesc += `- 性格四维倾向 (order/altruism/tradition/peace)\n`
    if (options.relationships) requestDesc += `- 与其他角色的关系 (relationships)\n`

    let charListStr = chars.map(c => `- ${c.name} (${c.origin || '未知作品'}) [身份: ${c.role === 'teacher' ? '教师' : '学生'}]`).join('\n')

    return `你是一个角色数据补全助手。请根据提供的角色列表，基于其原作设定补充完整的详细属性。

任务目标：
${requestDesc}

角色列表：
${charListStr}

核心规则：
1. 只返回结构化的XML指令，不要输出任何叙事文本。
2. 即使角色信息不全，也请根据名字和原作进行合理推断。
3. 性格四维轴：order(秩序感,-100混乱~100守序), altruism(利他性,-100利己~100利他), tradition(传统性,-100革新~100传统), peace(和平性,-100好斗~100温和)
4. 学力评估：level(${academicLevelKeys}), potential(${academicPotentialKeys}), traits(${traitKeys}，可多选)
5. 关系：仅列出与列表中角色或知名原作角色尽可能多的全部关系（如果有关系的话，如果角色间没有直接关系或者交集很少的话也不要强行加上。）

返回格式：
<roster_update>
  <char name="角色名">
    <personality order="数值" altruism="数值" tradition="数值" peace="数值" />
    <academic level="等级" potential="潜力" traits="特长1,特长2" />
    <relationships>
      <rel target="对象名" intimacy="0-100" trust="0-100" />
    </relationships>
  </char>
</roster_update>`
  }

  // 解析批量补全响应
  const parseBatchResponse = (text, originalChars) => {
    // 预处理：移除可能的包裹标签和干扰内容
    text = text.replace(/<\/?content[^>]*>/gi, '')
    text = removeThinking(text)
    text = text.replace(/<\/?response[^>]*>/gi, '')
    text = text.replace(/```xml\s*/gi, '').replace(/```\s*/gi, '')

    const updates = []
    const charRegex = /<char\s+name="([^"]+)">([\s\S]*?)<\/char>/g
    let match

    while ((match = charRegex.exec(text)) !== null) {
      const name = match[1]
      const body = match[2]
      const original = originalChars.find(c => c.name === name)
      if (!original) continue

      const updated = deepClone(original)
      const changes = []

      // 解析性格
      const pMatch = body.match(/<personality\s+([^/]+)\/>/)
      if (pMatch) {
        const pa = parseAttributes(pMatch[1])
        const newPersonality = {
          order: clampValue(parseInt(pa.order) || 0, -100, 100),
          altruism: clampValue(parseInt(pa.altruism) || 0, -100, 100),
          tradition: clampValue(parseInt(pa.tradition) || 0, -100, 100),
          peace: clampValue(parseInt(pa.peace) || 50, -100, 100)
        }

        if (JSON.stringify(original.personality) !== JSON.stringify(newPersonality)) {
          updated.personality = newPersonality
          changes.push('性格倾向')
        }
      }

      // 解析学力
      const aMatch = body.match(/<academic\s+([^/]+)\/>/)
      if (aMatch) {
        const aa = parseAttributes(aMatch[1])
        const newAcademic = {
          level: BASE_RANGES[aa.level] ? aa.level : 'avg',
          potential: POTENTIAL_MAP[aa.potential] ? aa.potential : 'medium',
          traits: aa.traits ? aa.traits.split(/[,，]/).map(t => t.trim()).filter(t => t && SUBJECT_TRAITS[t]) : []
        }

        if (!original.academicProfile ||
          original.academicProfile.level !== newAcademic.level ||
          original.academicProfile.potential !== newAcademic.potential ||
          (original.academicProfile.traits || []).join(',') !== newAcademic.traits.join(',')) {
          updated.academicProfile = newAcademic
          changes.push('学力档案')
        }
      }

      // 解析关系
      const rels = []
      const relRegex = /<rel\s+([^/]+)\/>/g
      let relMatch
      while ((relMatch = relRegex.exec(body)) !== null) {
        const ra = parseAttributes(relMatch[1])
        rels.push({
          target: ra.target,
          intimacy: clampValue(parseInt(ra.intimacy) || 0, 0, 100),
          trust: clampValue(parseInt(ra.trust) || 0, 0, 100)
        })
      }
      if (rels.length > 0) {
        updated._tempRelationships = rels
        changes.push(`关系(${rels.length})`)
      }

      if (changes.length > 0) {
        updates.push({ name, original, updated, changes })
      }
    }
    return updates
  }

  // 开始批量处理
  const startBatchProcess = async (selection, fullRosterSnapshot, characterPool, startFromChunk = 0) => {
    if (typeof startFromChunk !== 'number') startFromChunk = 0

    let candidates, chunks

    // 尝试从 localStorage 检测未完成的批次
    if (startFromChunk === 0) {
      const savedProgress = localStorage.getItem('batchProgress')
      if (savedProgress) {
        try {
          const progress = JSON.parse(savedProgress)
          const timeSinceLastSave = Date.now() - progress.timestamp
          // 如果保存时间在 1 小时内，返回 canResume 让 UI 层询问用户
          if (timeSinceLastSave < 3600000 && progress.resumeIndex > 0 && progress.candidates && progress.chunks) {
            console.log('[BatchComplete] Found unfinished batch process, can resume from chunk', progress.resumeIndex)
            batchCandidatesCache.value = progress.candidates
            batchChunksCache.value = progress.chunks
            batchResumeIndex.value = progress.resumeIndex
            return { success: false, canResume: true, resumeIndex: progress.resumeIndex }
          }
        } catch (e) {
          console.warn('[BatchComplete] Failed to restore progress:', e)
          localStorage.removeItem('batchProgress')
        }
      }
    }

    if (startFromChunk > 0 && batchChunksCache.value.length > 0) {
      candidates = batchCandidatesCache.value
      chunks = batchChunksCache.value
    } else {
      candidates = getBatchCandidates(selection, fullRosterSnapshot, characterPool)
      if (candidates.length === 0) {
        return { success: false, message: '未找到符合条件的角色' }
      }

      chunks = []
      if (selection.mode === 'by_class') {
        // 按班级分块：每个班级一个 chunk
        for (const [classId, classInfo] of Object.entries(fullRosterSnapshot)) {
          const classChunk = []
          if (classInfo.headTeacher?.name) classChunk.push(classInfo.headTeacher)
          if (Array.isArray(classInfo.teachers)) classChunk.push(...classInfo.teachers)
          if (Array.isArray(classInfo.students)) classChunk.push(...classInfo.students)
          if (classChunk.length > 0) chunks.push(classChunk)
        }
      } else {
        const CHUNK_SIZE = 10
        for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
          chunks.push(candidates.slice(i, i + CHUNK_SIZE))
        }
      }

      batchCandidatesCache.value = candidates
      batchChunksCache.value = chunks

      if (startFromChunk === 0) {
        batchResults.value = []
      }
    }

    if (!window.generate) {
      return { success: false, message: 'AI生成接口不可用' }
    }

    const processedCount = chunks.slice(0, startFromChunk).reduce((sum, c) => sum + c.length, 0)
    batchProcessing.value = true
    batchProgress.value = { current: processedCount, total: candidates.length, status: '准备中...' }

    try {
      for (let i = startFromChunk; i < chunks.length; i++) {
        const chunk = chunks[i]
        const processed = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0)
        batchProgress.value = {
          current: processed,
          total: candidates.length,
          status: `正在处理第 ${i + 1}/${chunks.length} 批 (${chunk.length}人)...`
        }

        batchResumeIndex.value = i

        // 保存进度到 localStorage
        try {
          localStorage.setItem('batchProgress', JSON.stringify({
            resumeIndex: i,
            candidates: batchCandidatesCache.value,
            chunks: batchChunksCache.value,
            timestamp: Date.now()
          }))
        } catch (e) {
          console.warn('[BatchComplete] Failed to save progress:', e)
        }

        const prompt = buildBatchPrompt(chunk, selection.options)

        const result = await window.generateRaw({
          user_input: prompt,
          ordered_prompts: [
            { role: 'system', content: '你是角色数据补全助手。只返回结构化XML数据。' },
            'user_input',
          ],
          should_stream: false
        })

        if (result && result !== '__ERROR__' && result !== '__STOPPED__') {
          const updates = parseBatchResponse(result, chunk)
          batchResults.value.push(...updates)
        }

        await new Promise(r => setTimeout(r, 500))
      }

      batchProgress.value = {
        current: candidates.length,
        total: candidates.length,
        status: '处理完成！请确认变更。'
      }
      batchResumeIndex.value = 0

      // 清理保存的进度
      localStorage.removeItem('batchProgress')

      return { success: true }
    } catch (e) {
      console.error('Batch process error:', e)
      batchProgress.value.status = `第 ${batchResumeIndex.value + 1}/${chunks.length} 批处理时发生错误: ${e.message}`
      return { success: false, message: e.message }
    } finally {
      batchProcessing.value = false
    }
  }

  // 应用批量变更
  const applyBatchChanges = (characterPool, selection) => {
    if (batchResults.value.length === 0) return 0

    let appliedCount = 0

    for (const item of batchResults.value) {
      const idx = characterPool.findIndex(c => c.name === item.name)
      if (idx !== -1) {
        const target = characterPool[idx]
        if (item.changes.includes('性格倾向')) {
          const orig = target.personality
          const isDefaultPersonality = !orig || (orig.order === 0 && orig.altruism === 0 && orig.tradition === 0 && orig.peace === 50)
          if (selection.options.overwrite || isDefaultPersonality) {
            target.personality = item.updated.personality
          }
        }
        if (item.changes.includes('学力档案')) {
          const orig = target.academicProfile
          const isDefaultAcademic = !orig || (orig.level === 'avg' && orig.potential === 'medium' && (!orig.traits || orig.traits.length === 0))
          if (selection.options.overwrite || isDefaultAcademic) {
            target.academicProfile = item.updated.academicProfile
          }
        }

        // 处理关系更新
        if (item.updated._tempRelationships && item.updated._tempRelationships.length > 0) {
          if (selection.options.relationships) {
            for (const rel of item.updated._tempRelationships) {
              const existing = getRelationship(item.name, rel.target)
              if (existing && !selection.options.overwrite) {
                continue
              }

              setRelationship(item.name, rel.target, {
                intimacy: rel.intimacy,
                trust: rel.trust,
                passion: 0,
                hostility: 0,
                tags: []
              })
            }
          }
        }

        appliedCount++
      }
    }

    return appliedCount
  }

  return {
    batchProcessing,
    batchProgress,
    batchResults,
    batchResumeIndex,
    startBatchProcess,
    applyBatchChanges
  }
}
