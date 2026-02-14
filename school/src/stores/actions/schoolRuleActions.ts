/**
 * 校规系统 Actions
 * 管理校园公告APP中的校规 CRUD 操作
 */

import { saveSchoolRulesToWorldbook } from '../../utils/schoolRuleWorldbook'

export const schoolRuleActions = {
  /**
   * 添加新校规
   */
  addSchoolRule(rule: {
    title: string
    content: string
    targets: {
      gender: ('male' | 'female')[]
      roles: ('student' | 'teacher' | 'staff')[]
    }
    isWeird?: boolean
  }) {
    // @ts-ignore
    const self = this as any

    // 生成ID
    const existingRules = self.player.schoolRules || []
    const maxId = existingRules.reduce((max: number, r: any) => {
      const match = r.id.match(/rule_(\d+)/)
      if (match) {
        const num = parseInt(match[1])
        return num > max ? num : max
      }
      return max
    }, 0)

    const newRule = {
      id: `rule_${String(maxId + 1).padStart(3, '0')}`,
      title: rule.title,
      content: rule.content,
      status: 'active' as const,
      targets: rule.targets,
      createdAt: Date.now(),
      createdFloor: self.currentFloor || 0,
      isWeird: rule.isWeird || false
    }

    if (!self.player.schoolRules) {
      self.player.schoolRules = []
    }
    self.player.schoolRules.push(newRule)

    // 同步世界书
    saveSchoolRulesToWorldbook(self.player.schoolRules, self.currentRunId)

    // 保存到存储
    self.saveToStorage()

    console.log(`[SchoolRule] Added rule: ${newRule.id} - ${newRule.title}`)
    return newRule
  },

  /**
   * 更新校规
   */
  updateSchoolRule(id: string, updates: Partial<{
    title: string
    content: string
    status: 'active' | 'paused'
    targets: {
      gender: ('male' | 'female')[]
      roles: ('student' | 'teacher' | 'staff')[]
    }
    isWeird: boolean
  }>) {
    // @ts-ignore
    const self = this as any
    const rules = self.player.schoolRules || []
    const rule = rules.find((r: any) => r.id === id)

    if (!rule) {
      console.warn(`[SchoolRule] Rule not found: ${id}`)
      return false
    }

    Object.assign(rule, updates)

    // 同步世界书
    saveSchoolRulesToWorldbook(self.player.schoolRules, self.currentRunId)

    // 保存到存储
    self.saveToStorage()

    console.log(`[SchoolRule] Updated rule: ${id}`)
    return true
  },

  /**
   * 切换校规状态（生效/暂停）
   */
  toggleSchoolRuleStatus(id: string) {
    // @ts-ignore
    const self = this as any
    const rules = self.player.schoolRules || []
    const rule = rules.find((r: any) => r.id === id)

    if (!rule) {
      console.warn(`[SchoolRule] Rule not found: ${id}`)
      return false
    }

    rule.status = rule.status === 'active' ? 'paused' : 'active'

    // 同步世界书
    saveSchoolRulesToWorldbook(self.player.schoolRules, self.currentRunId)

    // 保存到存储
    self.saveToStorage()

    console.log(`[SchoolRule] Toggled rule ${id} to ${rule.status}`)
    return true
  },

  /**
   * 删除校规
   */
  deleteSchoolRule(id: string) {
    // @ts-ignore
    const self = this as any
    if (!self.player.schoolRules) return false

    const index = self.player.schoolRules.findIndex((r: any) => r.id === id)
    if (index === -1) {
      console.warn(`[SchoolRule] Rule not found: ${id}`)
      return false
    }

    self.player.schoolRules.splice(index, 1)

    // 同步世界书
    saveSchoolRulesToWorldbook(self.player.schoolRules, self.currentRunId)

    // 保存到存储
    self.saveToStorage()

    console.log(`[SchoolRule] Deleted rule: ${id}`)
    return true
  }
}
