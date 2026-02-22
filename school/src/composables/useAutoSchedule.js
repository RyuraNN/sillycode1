/**
 * 自动排班 Composable
 * AI调用、分块处理、XML解析、断点续传
 */
import { ref } from 'vue'
import { removeThinking } from '../utils/summaryManager'
import { ELECTIVE_PREFERENCES, getGradeFromClassId } from '../data/coursePoolData'
import { mapData, getItem } from '../data/mapData'

const CHUNK_SIZE = 15

export function useAutoSchedule() {
  const scheduling = ref(false)
  const scheduleProgress = ref({ current: 0, total: 0, status: '' })
  const scheduleResults = ref({ suitable: [], interesting: [] })
  const scheduleError = ref('')

  // 内部缓存
  let chunksCache = []
  let candidatesCache = []

  const deepClone = (data) => JSON.parse(JSON.stringify(data))

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
   * 构建现有班级信息摘要
   */
  function buildClassSummary(fullRosterSnapshot) {
    const lines = []
    for (const [classId, classInfo] of Object.entries(fullRosterSnapshot)) {
      const students = Array.isArray(classInfo.students) ? classInfo.students : []
      const studentCount = students.length
      const studentNames = students.map(s => s.name).filter(Boolean).join(', ')
      const ht = classInfo.headTeacher?.name || '无'
      const teachers = Array.isArray(classInfo.teachers)
        ? classInfo.teachers.map(t => `${t.name}(${t.subject || '未定'})`).join(', ') || '无'
        : '无'
      lines.push(`${classId} "${classInfo.name || classId}": 学生${studentCount}人 [${studentNames}], 班主任:${ht}, 科任:[${teachers}]`)
    }
    return lines.join('\n')
  }

  /**
   * 构建课程池摘要
   */
  function buildCourseSummary(coursePool) {
    if (!coursePool || coursePool.length === 0) return '(无课程数据)'
    const required = coursePool.filter(c => c.type === 'required')
    const elective = coursePool.filter(c => c.type === 'elective')
    const lines = []
    if (required.length > 0) {
      const byGrade = {}
      required.forEach(c => {
        const key = (c.availableFor || []).join('/') || '通用'
        if (!byGrade[key]) byGrade[key] = []
        byGrade[key].push(`${c.name}(${c.teacher || '无'})`)
      })
      lines.push('必修课:')
      for (const [grade, courses] of Object.entries(byGrade)) {
        lines.push(`  ${grade}: ${courses.join(', ')}`)
      }
    }
    if (elective.length > 0) {
      lines.push('选修课:')
      const byPref = {}
      elective.forEach(c => {
        const key = c.preference || 'general'
        if (!byPref[key]) byPref[key] = []
        byPref[key].push(`${c.name}(${c.teacher || '无'})`)
      })
      for (const [pref, courses] of Object.entries(byPref)) {
        const prefName = ELECTIVE_PREFERENCES[pref]?.name || pref
        lines.push(`  ${prefName}: ${courses.join(', ')}`)
      }
    }
    return lines.join('\n')
  }

  /**
   * 构建排班Prompt
   */
  function buildSchedulePrompt(chars, existingClasses, coursePool, batchIndex, totalBatches) {
    const classSummary = buildClassSummary(existingClasses)
    const courseSummary = buildCourseSummary(coursePool)
    const prefKeys = Object.keys(ELECTIVE_PREFERENCES).join(', ')
    const locationList = mapData
      .filter(item => item.id && item.name)
      .map(item => `${item.id}: ${item.name}`)
      .join(', ')

    const charList = chars.map(c => {
      const parts = [`- ${c.name} (${c.origin || '未知作品'}) ${c.gender === 'male' ? '男' : '女'}`]
      if (c.role === 'teacher') parts.push('教师')
      else if (c.role === 'staff') parts.push('职工')
      else if (c.role === 'external') parts.push('校外人员')
      else parts.push('学生')
      if (c.electivePreference && c.electivePreference !== 'general') {
        parts.push(`选课偏好:${c.electivePreference}`)
      }
      if (c.subject) parts.push(`科目:${c.subject}`)
      if (c.staffTitle) parts.push(`职务:${c.staffTitle}`)
      if (c.workplace) parts.push(`工作地点:${c.workplace}`)
      return parts.join(' ')
    }).join('\n')

    return `你是一个学校排班助手。请根据角色列表和现有班级信息，生成两种排班方案。
${totalBatches > 1 ? `\n[批次信息] 第${batchIndex + 1}/${totalBatches}批\n` : ''}
[现有班级信息]
${classSummary}

[现有课程池概要]
${courseSummary}

[可用选课偏好标签]
${prefKeys}

[待排班角色]
${charList}

[排班规则]
1. 同作品角色尽量分到同一班级
2. 每班学生数控制在25-35人
3. 教师可担任多个班级的班主任和多个科目的科任老师
4. 科任老师是班级的责任教师，不一定亲自上课
5. 如果教师适合授课，可额外分配选修课/必修课的授课任务
6. 为新课程指定选课偏好标签(preference)
7. 如果现有班级不够，可建议创建新班级(需提供班级ID和名称)
8. 班级ID格式: "年级-字母"，如 "1-A", "2-B", "3-C"
9. 选修课的 location 必须使用以下地点ID之一: ${locationList}
10. 职工(staff)和校外人员(external)不分配班级，而是分配工作地点(workplace)
11. 为职工/校外人员建议一个合理的工作地点名称(workplace_name)和地点ID(workplace_id)
12. workplace_id 优先使用已有地点ID: ${locationList}，如果没有合适的，可以建议新地点名称

[返回两种方案]
方案A(更合适): 逻辑合理、平衡、符合原作设定
方案B(更有趣): 创意性、意想不到但有趣的组合

返回格式:
<schedule_result>
  <plan type="suitable">
    <new_class id="班级ID" name="显示名称" />
    <assignment name="角色名" role="student" class="班级ID" reason="排班理由" />
    <assignment name="角色名" role="headTeacher" class="班级ID" reason="排班理由" />
    <assignment name="角色名" role="subjectTeacher" class="班级ID" subject="科目" reason="排班理由" />
    <teaching name="角色名" course_name="课程名" course_type="elective" grade="1" preference="选课偏好标签" location="教室ID" reason="授课理由" />
    <workplace_assignment name="角色名" role="staff|external" workplace_id="地点ID" workplace_name="地点显示名" staff_title="职务" reason="理由" />
  </plan>
  <plan type="interesting">
    ...同上格式...
  </plan>
</schedule_result>

注意：只返回XML格式数据，不要输出其他内容。每个角色必须在两个方案中都有assignment。`
  }

  /**
   * 解析AI响应XML
   */
  function parseScheduleResponse(text) {
    text = text.replace(/<\/?content[^>]*>/gi, '')
    text = removeThinking(text)
    text = text.replace(/<\/?response[^>]*>/gi, '')
    text = text.replace(/```xml\s*/gi, '').replace(/```\s*/gi, '')

    const result = { suitable: [], interesting: [], newClasses: { suitable: [], interesting: [] } }

    const planRegex = /<plan\s+type="(suitable|interesting)">([\s\S]*?)<\/plan>/g
    let planMatch
    while ((planMatch = planRegex.exec(text)) !== null) {
      const planType = planMatch[1]
      const planBody = planMatch[2]

      // 解析新班级
      const newClassRegex = /<new_class\s+([^/]*?)\/>/g
      let ncMatch
      while ((ncMatch = newClassRegex.exec(planBody)) !== null) {
        const attrs = parseAttributes(ncMatch[1])
        if (attrs.id) {
          result.newClasses[planType].push({ id: attrs.id, name: attrs.name || attrs.id })
        }
      }

      // 解析assignment
      const assignRegex = /<assignment\s+([^/]*?)\/>/g
      let aMatch
      while ((aMatch = assignRegex.exec(planBody)) !== null) {
        const attrs = parseAttributes(aMatch[1])
        if (attrs.name) {
          result[planType].push({
            type: 'assignment',
            name: attrs.name,
            role: attrs.role || 'student',
            classId: attrs.class || '',
            subject: attrs.subject || '',
            reason: attrs.reason || ''
          })
        }
      }

      // 解析teaching
      const teachRegex = /<teaching\s+([^/]*?)\/>/g
      let tMatch
      while ((tMatch = teachRegex.exec(planBody)) !== null) {
        const attrs = parseAttributes(tMatch[1])
        if (attrs.name) {
          result[planType].push({
            type: 'teaching',
            name: attrs.name,
            courseName: attrs.course_name || '',
            courseType: attrs.course_type || 'elective',
            grade: attrs.grade || 'universal',
            preference: attrs.preference || 'general',
            location: attrs.location || '',
            reason: attrs.reason || ''
          })
        }
      }

      // 解析workplace_assignment
      const wpRegex = /<workplace_assignment\s+([^/]*?)\/>/g
      let wpMatch
      while ((wpMatch = wpRegex.exec(planBody)) !== null) {
        const attrs = parseAttributes(wpMatch[1])
        if (attrs.name) {
          result[planType].push({
            type: 'workplace_assignment',
            name: attrs.name,
            role: attrs.role || 'external',
            workplaceId: attrs.workplace_id || '',
            workplaceName: attrs.workplace_name || '',
            staffTitle: attrs.staff_title || '',
            reason: attrs.reason || ''
          })
        }
      }
    }

    return result
  }

  /**
   * 合并多批次结果
   */
  function mergeResults(accumulated, batch) {
    accumulated.suitable.push(...batch.suitable)
    accumulated.interesting.push(...batch.interesting)
    batch.newClasses.suitable.forEach(nc => {
      if (!accumulated.newClasses.suitable.find(e => e.id === nc.id)) {
        accumulated.newClasses.suitable.push(nc)
      }
    })
    batch.newClasses.interesting.forEach(nc => {
      if (!accumulated.newClasses.interesting.find(e => e.id === nc.id)) {
        accumulated.newClasses.interesting.push(nc)
      }
    })
  }

  /**
   * 保存断点
   */
  function saveCheckpoint(data) {
    try {
      localStorage.setItem('autoScheduleCheckpoint', JSON.stringify({
        ...data,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.warn('[AutoSchedule] Failed to save checkpoint:', e)
    }
  }

  /**
   * 加载断点
   */
  function loadCheckpoint() {
    try {
      const saved = localStorage.getItem('autoScheduleCheckpoint')
      if (!saved) return null
      const data = JSON.parse(saved)
      if (Date.now() - data.timestamp > 3600000) {
        localStorage.removeItem('autoScheduleCheckpoint')
        return null
      }
      return data
    } catch (e) {
      localStorage.removeItem('autoScheduleCheckpoint')
      return null
    }
  }

  function clearCheckpoint() {
    localStorage.removeItem('autoScheduleCheckpoint')
  }

  /**
   * 开始自动排班
   */
  async function startAutoSchedule(selectedChars, existingClasses, coursePool, startFromChunk = 0) {
    if (!window.generateRaw) {
      scheduleError.value = 'AI生成接口不可用'
      return { success: false, message: scheduleError.value }
    }

    // 检查断点续传
    if (startFromChunk === 0) {
      const checkpoint = loadCheckpoint()
      if (checkpoint && checkpoint.resumeIndex > 0 && checkpoint.accumulated) {
        return { success: false, canResume: true, resumeIndex: checkpoint.resumeIndex, checkpoint }
      }
    }

    let chunks
    if (startFromChunk > 0 && chunksCache.length > 0) {
      chunks = chunksCache
    } else {
      if (selectedChars.length === 0) {
        return { success: false, message: '未选择任何角色' }
      }
      chunks = []
      for (let i = 0; i < selectedChars.length; i += CHUNK_SIZE) {
        chunks.push(selectedChars.slice(i, i + CHUNK_SIZE))
      }
      chunksCache = chunks
      candidatesCache = selectedChars
    }

    scheduling.value = true
    scheduleError.value = ''
    const accumulated = startFromChunk > 0
      ? (loadCheckpoint()?.accumulated || { suitable: [], interesting: [], newClasses: { suitable: [], interesting: [] } })
      : { suitable: [], interesting: [], newClasses: { suitable: [], interesting: [] } }

    try {
      for (let i = startFromChunk; i < chunks.length; i++) {
        const chunk = chunks[i]
        const processed = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0)
        scheduleProgress.value = {
          current: processed,
          total: candidatesCache.length,
          status: `正在处理第 ${i + 1}/${chunks.length} 批 (${chunk.length}人)...`
        }

        saveCheckpoint({
          resumeIndex: i,
          accumulated: deepClone(accumulated),
          selectedCharNames: candidatesCache.map(c => c.name)
        })

        const prompt = buildSchedulePrompt(chunk, existingClasses, coursePool, i, chunks.length)

        const result = await window.generateRaw({
          user_input: prompt,
          ordered_prompts: [
            { role: 'system', content: '你是学校排班助手。只返回结构化XML数据，不要输出任何叙事文本。' },
            'user_input',
          ],
          should_stream: false
        })

        if (result && result !== '__ERROR__' && result !== '__STOPPED__') {
          const batch = parseScheduleResponse(result)
          mergeResults(accumulated, batch)
        } else {
          throw new Error(`第${i + 1}批AI调用失败`)
        }

        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      // 按角色名分组结果
      scheduleResults.value = groupResultsByCharacter(accumulated, candidatesCache)
      scheduleProgress.value = {
        current: candidatesCache.length,
        total: candidatesCache.length,
        status: '排班完成！请选择方案。'
      }
      clearCheckpoint()
      return { success: true }
    } catch (e) {
      console.error('[AutoSchedule] Error:', e)
      scheduleError.value = e.message
      scheduleProgress.value.status = `处理出错: ${e.message}`
      return { success: false, message: e.message }
    } finally {
      scheduling.value = false
    }
  }

  /**
   * 将扁平结果按角色名分组，方便UI展示
   * 返回: { characters: [{ name, origin, role, suitable: {assignment, teachings[]}, interesting: {assignment, teachings[]} }], newClasses }
   */
  function groupResultsByCharacter(accumulated, originalChars) {
    const charMap = new Map()
    originalChars.forEach(c => {
      charMap.set(c.name, {
        name: c.name,
        origin: c.origin || '',
        gender: c.gender || '',
        role: c.role || 'student',
        suitable: { assignment: null, teachings: [] },
        interesting: { assignment: null, teachings: [] }
      })
    })

    for (const planType of ['suitable', 'interesting']) {
      for (const item of accumulated[planType]) {
        const entry = charMap.get(item.name)
        if (!entry) continue
        if (item.type === 'assignment') {
          entry[planType].assignment = item
        } else if (item.type === 'workplace_assignment') {
          entry[planType].assignment = item
        } else if (item.type === 'teaching') {
          entry[planType].teachings.push(item)
        }
      }
    }

    return {
      characters: Array.from(charMap.values()),
      newClasses: accumulated.newClasses
    }
  }

  /**
   * 应用用户选择到快照数据
   * @param {Object} choices - { [charName]: 'suitable' | 'interesting' }
   * @param {Object} fullRosterSnapshot
   * @param {Array} characterPool
   * @param {Object} currentRosterState
   * @returns {{ modifiedClasses: Set, newCourses: Array, newClasses: Array }}
   */
  function applyScheduleChoices(choices, fullRosterSnapshot, characterPool, currentRosterState) {
    const results = scheduleResults.value
    if (!results || !results.characters) return { modifiedClasses: new Set(), newCourses: [], newClasses: [] }

    const modifiedClasses = new Set()
    const newCourses = []
    const createdClasses = []
    const unresolvedLocations = []

    // 收集需要创建的新班级
    const neededNewClasses = new Set()
    for (const [charName, planType] of Object.entries(choices)) {
      const charResult = results.characters.find(c => c.name === charName)
      if (!charResult) continue
      const plan = charResult[planType]
      if (plan.assignment?.classId && !fullRosterSnapshot[plan.assignment.classId]) {
        neededNewClasses.add(plan.assignment.classId)
      }
    }

    // 创建新班级
    for (const classId of neededNewClasses) {
      const ncInfo = results.newClasses.suitable.find(nc => nc.id === classId)
        || results.newClasses.interesting.find(nc => nc.id === classId)
      const className = ncInfo?.name || classId
      fullRosterSnapshot[classId] = {
        name: className,
        headTeacher: null,
        teachers: [],
        students: []
      }
      if (!currentRosterState[classId]) {
        currentRosterState[classId] = {}
      }
      createdClasses.push({ id: classId, name: className })
      modifiedClasses.add(classId)
    }

    // 应用每个角色的选择
    for (const [charName, planType] of Object.entries(choices)) {
      const charResult = results.characters.find(c => c.name === charName)
      if (!charResult) continue
      const plan = charResult[planType]
      if (!plan.assignment) continue

      const poolChar = characterPool.find(c => c.name === charName)

      // 处理 workplace_assignment 类型（职工/校外人员）
      if (plan.assignment.type === 'workplace_assignment') {
        if (poolChar) {
          // 从旧班级移除
          if (poolChar.classId && fullRosterSnapshot[poolChar.classId]) {
            const oldClass = fullRosterSnapshot[poolChar.classId]
            if (oldClass.headTeacher?.name === charName) oldClass.headTeacher = null
            if (Array.isArray(oldClass.teachers)) {
              oldClass.teachers = oldClass.teachers.filter(t => t.name !== charName)
            }
            if (Array.isArray(oldClass.students)) {
              oldClass.students = oldClass.students.filter(s => s.name !== charName)
            }
            if (currentRosterState[poolChar.classId]) {
              delete currentRosterState[poolChar.classId][charName]
            }
            modifiedClasses.add(poolChar.classId)
          }

          poolChar.role = plan.assignment.role || 'external'
          poolChar.staffTitle = plan.assignment.staffTitle || poolChar.staffTitle || ''
          poolChar.workplace = plan.assignment.workplaceId || ''
          poolChar.classId = ''

          // 收集需要验证的地点
          if (plan.assignment.workplaceId && !getItem(plan.assignment.workplaceId)) {
            unresolvedLocations.push({
              charName: charName,
              workplaceId: plan.assignment.workplaceId,
              workplaceName: plan.assignment.workplaceName || plan.assignment.workplaceId
            })
          }
        }

        // 处理teaching条目
        for (const teaching of plan.teachings) {
          newCourses.push({
            name: teaching.courseName,
            type: teaching.courseType || 'elective',
            grade: teaching.grade || 'universal',
            preference: teaching.preference || 'general',
            teacher: charName,
            teacherGender: charResult.gender || poolChar?.gender || 'female',
            location: teaching.location || '',
            teacherOrigin: charResult.origin || poolChar?.origin || ''
          })
        }
        continue
      }

      const { role, classId, subject } = plan.assignment

      // 从旧班级移除
      if (poolChar?.classId && fullRosterSnapshot[poolChar.classId]) {
        const oldClass = fullRosterSnapshot[poolChar.classId]
        if (oldClass.headTeacher?.name === charName) oldClass.headTeacher = null
        if (Array.isArray(oldClass.teachers)) {
          oldClass.teachers = oldClass.teachers.filter(t => t.name !== charName)
        }
        if (Array.isArray(oldClass.students)) {
          oldClass.students = oldClass.students.filter(s => s.name !== charName)
        }
        if (currentRosterState[poolChar.classId]) {
          delete currentRosterState[poolChar.classId][charName]
        }
        modifiedClasses.add(poolChar.classId)
      }

      // 添加到新班级
      if (classId && fullRosterSnapshot[classId]) {
        const targetClass = fullRosterSnapshot[classId]
        const charEntry = {
          name: charName,
          gender: charResult.gender || (poolChar?.gender) || '',
          origin: charResult.origin || (poolChar?.origin) || ''
        }

        if (role === 'headTeacher') {
          targetClass.headTeacher = { ...charEntry, subject: subject || '' }
        } else if (role === 'subjectTeacher') {
          if (!Array.isArray(targetClass.teachers)) targetClass.teachers = []
          targetClass.teachers.push({ ...charEntry, subject: subject || '' })
        } else {
          // student
          if (!Array.isArray(targetClass.students)) targetClass.students = []
          targetClass.students.push(charEntry)
          if (!currentRosterState[classId]) currentRosterState[classId] = {}
          currentRosterState[classId][charName] = true
        }
        modifiedClasses.add(classId)
      }

      // 更新角色池
      if (poolChar) {
        poolChar.classId = classId
        if (role === 'headTeacher') {
          poolChar.role = 'teacher'
          poolChar.isHeadTeacher = true
          poolChar.subject = subject || poolChar.subject
        } else if (role === 'subjectTeacher') {
          poolChar.role = 'teacher'
          poolChar.isHeadTeacher = false
          poolChar.subject = subject || poolChar.subject
        } else {
          poolChar.role = 'student'
        }
      }

      // 处理teaching条目 → 注册新课程
      for (const teaching of plan.teachings) {
        newCourses.push({
          name: teaching.courseName,
          type: teaching.courseType || 'elective',
          grade: teaching.grade || 'universal',
          preference: teaching.preference || 'general',
          teacher: charName,
          teacherGender: charResult.gender || poolChar?.gender || 'female',
          location: teaching.location || '',
          teacherOrigin: charResult.origin || poolChar?.origin || ''
        })
      }
    }

    return { modifiedClasses, newCourses, newClasses: createdClasses, unresolvedLocations }
  }

  function resetSchedule() {
    scheduling.value = false
    scheduleProgress.value = { current: 0, total: 0, status: '' }
    scheduleResults.value = { suitable: [], interesting: [] }
    scheduleError.value = ''
    chunksCache = []
    candidatesCache = []
  }

  return {
    scheduling,
    scheduleProgress,
    scheduleResults,
    scheduleError,
    startAutoSchedule,
    applyScheduleChoices,
    resetSchedule,
    loadCheckpoint,
    clearCheckpoint
  }
}
