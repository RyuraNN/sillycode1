/**
 * 校规世界书管理工具
 * 用于管理校园公告APP中的校规数据与世界书同步
 */

// 世界书条目名前缀
const SCHOOL_RULE_WORLDBOOK_PREFIX = '[SchoolRules:'

/**
 * 获取校规世界书的完整名称
 * @param {string} runId 当前运行ID
 * @returns {string} 世界书条目名称
 */
export function getSchoolRuleWorldbookName(runId) {
  return `${SCHOOL_RULE_WORLDBOOK_PREFIX}${runId}] 天华高级中学校规`
}

/**
 * 性别中文映射
 */
const GENDER_MAP = {
  male: '男性',
  female: '女性'
}

/**
 * 角色类型中文映射
 */
const ROLE_MAP = {
  student: '学生',
  teacher: '教师',
  staff: '教职人员'
}

/**
 * 将校规格式化为世界书内容
 * @param {Array} rules 校规列表
 * @returns {string} 格式化后的内容
 */
export function formatRulesForWorldbook(rules) {
  // 只输出生效中的校规
  const activeRules = rules.filter(r => r.status === 'active')

  if (activeRules.length === 0) {
    return '--天华高级中学校规记录开始--\n\n当前无生效校规。\n\n--天华高级中学校规记录结束--'
  }

  let content = '--天华高级中学校规记录开始--\n\n'
  content += '⚠️ 以下校规均为天华高级中学正式颁布的校园规定，仅在校园范围内生效（校外无需遵守）。\n'
  content += '所有适用对象必须遵守这些校规，即使某些校规看起来不太寻常。\n'
  content += '角色对校规的反应应符合其性格特征：\n'
  content += '- 顺从/乖巧的角色会认真遵守\n'
  content += '- 腼腆/害羞的角色可能会感到尴尬但仍会遵守\n'
  content += '- 聪明的角色可能会在不违规的前提下想办法减轻校规对自己的影响\n'
  content += '- 叛逆的角色可能会在私下表达不满，但在公开场合仍需遵守\n'
  content += '- 角色可以讨论校规、吐槽校规，但不能公然违反\n\n'

  for (const rule of activeRules) {
    const genderStr = rule.targets.gender.map(g => GENDER_MAP[g] || g).join('、')
    const roleStr = rule.targets.roles.map(r => ROLE_MAP[r] || r).join('、')

    content += `校规ID|${rule.id}\n`
    content += `标题|${rule.title}\n`
    content += `内容|${rule.content}\n`
    content += `适用性别|${genderStr || '全部'}\n`
    content += `适用角色|${roleStr || '全部'}\n`
    if (rule.isWeird) {
      content += `特殊标记|此校规较为特殊，但已正式生效，所有适用对象必须遵守。角色应以符合自身性格的方式来应对这条校规。\n`
    }
    content += '\n'
  }

  const pausedCount = rules.filter(r => r.status === 'paused').length
  if (pausedCount > 0) {
    content += `(另有${pausedCount}条校规已暂停，不在生效范围内)\n`
  }

  content += '\n--天华高级中学校规记录结束--'

  return content
}

/**
 * 保存校规到世界书
 * @param {Array} rules 校规列表
 * @param {string} runId 运行ID
 */
export async function saveSchoolRulesToWorldbook(rules, runId) {
  if (typeof createOrReplaceWorldbook === 'undefined') {
    console.warn('[SchoolRuleWorldbook] createOrReplaceWorldbook not available')
    return false
  }

  const worldbookName = getSchoolRuleWorldbookName(runId)
  const content = formatRulesForWorldbook(rules)

  try {
    // 获取角色卡绑定的世界书
    const charWorldbooks = await getCharWorldbookNames('current')
    const primaryWorldbook = charWorldbooks.primary

    if (!primaryWorldbook) {
      console.warn('[SchoolRuleWorldbook] No primary worldbook found for current character')
      return false
    }

    // 获取现有世界书
    let worldbook = []
    try {
      worldbook = await getWorldbook(primaryWorldbook)
    } catch (e) {
      console.log('[SchoolRuleWorldbook] Creating new worldbook entries')
    }

    // 查找现有的校规条目
    const existingIndex = worldbook.findIndex(entry =>
      entry.name && entry.name.includes(SCHOOL_RULE_WORLDBOOK_PREFIX) && entry.name.includes(runId)
    )

    const ruleEntry = {
      name: worldbookName,
      enabled: false, // 默认为禁用，因为内容已通过 prompts.js 手动注入到 System Prompt 中，避免重复
      strategy: {
        type: 'constant',
        keys: [],
        keys_secondary: { logic: 'and_any', keys: [] },
        scan_depth: 'same_as_global'
      },
      position: {
        type: 'before_character_definition',
        role: 'system',
        depth: 0,
        order: 6
      },
      content: content,
      probability: 100,
      recursion: {
        prevent_incoming: true,
        prevent_outgoing: true,
        delay_until: null
      },
      effect: {
        sticky: null,
        cooldown: null,
        delay: null
      }
    }

    if (existingIndex >= 0) {
      worldbook[existingIndex] = { ...worldbook[existingIndex], ...ruleEntry }
    } else {
      worldbook.push(ruleEntry)
    }

    await replaceWorldbook(primaryWorldbook, worldbook)
    console.log('[SchoolRuleWorldbook] School rules worldbook saved successfully')
    return true
  } catch (e) {
    console.error('[SchoolRuleWorldbook] Failed to save school rules worldbook:', e)
    return false
  }
}

/**
 * 删除校规世界书条目
 * @param {string} runId 运行ID
 */
export async function deleteSchoolRuleWorldbook(runId) {
  if (typeof getCharWorldbookNames === 'undefined') {
    return false
  }

  try {
    const charWorldbooks = await getCharWorldbookNames('current')
    const primaryWorldbook = charWorldbooks.primary

    if (!primaryWorldbook) return false

    const worldbook = await getWorldbook(primaryWorldbook)
    const filtered = worldbook.filter(entry =>
      !(entry.name && entry.name.includes(SCHOOL_RULE_WORLDBOOK_PREFIX) && entry.name.includes(runId))
    )

    if (filtered.length !== worldbook.length) {
      await replaceWorldbook(primaryWorldbook, filtered)
      console.log('[SchoolRuleWorldbook] School rules worldbook entry deleted')
    }
    return true
  } catch (e) {
    console.error('[SchoolRuleWorldbook] Failed to delete school rules worldbook:', e)
    return false
  }
}

/**
 * 切换存档槽位（开启当前 runId 的校规条目，关闭其他的）
 * @param {string} currentRunId 当前运行ID
 */
export async function switchSchoolRuleSlot(currentRunId) {
  if (typeof getCharWorldbookNames === 'undefined') {
    console.warn('[SchoolRuleWorldbook] getCharWorldbookNames not available')
    return
  }

  try {
    const charWorldbooks = await getCharWorldbookNames('current')
    const primaryWorldbook = charWorldbooks.primary

    if (!primaryWorldbook) {
      console.warn('[SchoolRuleWorldbook] No primary worldbook found')
      return
    }

    console.log(`[SchoolRuleWorldbook] Switching school rule slot to ${currentRunId}`)

    const worldbook = await getWorldbook(primaryWorldbook)

    const updatedEntries = worldbook.map(entry => {
      if (entry.name && entry.name.startsWith(SCHOOL_RULE_WORLDBOOK_PREFIX)) {
        let entryRunId = null

        const nameContent = entry.name.substring(SCHOOL_RULE_WORLDBOOK_PREFIX.length)
        const bracketIndex = nameContent.indexOf(']')

        if (bracketIndex > -1) {
          entryRunId = nameContent.substring(0, bracketIndex)
        }

        if (entryRunId) {
          // 校规条目始终保持禁用状态，因为通过 prompts.js 注入
          // 这里只需要确保它存在，不需要根据 runId 切换启用状态
          // 但为了防止逻辑混淆，我们确保所有校规条目都为 disabled
          if (entry.enabled) {
            console.log(`[SchoolRuleWorldbook] Ensuring entry is disabled: ${entry.name}`)
            return { ...entry, enabled: false }
          }
        }
      }
      return entry
    })

    await replaceWorldbook(primaryWorldbook, updatedEntries)
    console.log('[SchoolRuleWorldbook] School rule slot switch complete')
  } catch (e) {
    console.error('[SchoolRuleWorldbook] Error switching school rule slot:', e)
  }
}
