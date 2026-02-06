/**
 * 玩家相关 Actions
 */

import type { PlayerStats, NpcStats, SummaryData } from '../gameStoreTypes'
import { getIdByName } from '../../data/mapData'
import { generateCharId } from '../../data/relationshipData'
import { updatePartTimeWorldbookEntry } from '../../utils/partTimeWorldbook'

export const playerActions = {
  /**
   * 更新玩家名字
   */
  setPlayerName(this: any, name: string) {
    this.player.name = name
    updatePartTimeWorldbookEntry(this.currentRunId, this.player.partTimeJob.history, this.player.name).catch((e: any) => console.error('[GameStore] Failed to update part-time worldbook name:', e))
  },

  /**
   * 设置头像
   */
  setAvatar(this: any, avatar: string) {
    this.player.avatar = avatar
  },

  /**
   * 玩家受到伤害
   */
  takeDamage(this: any, amount: number) {
    this.player.hp = Math.max(0, this.player.hp - amount)
  },

  /**
   * 玩家恢复生命
   */
  heal(this: any, amount: number) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount)
  },

  /**
   * 增加基础经验
   */
  addExp(this: any, amount: number) {
    this.player.totalExp += amount
    while (this.player.totalExp >= 100) {
      this.player.totalExp -= 100
      this.player.level++
      this.player.freePoints++
    }
  },

  /**
   * 获取天赋加成
   */
  getTalentBonuses(this: any): { 
    expBonus: { knowledge: number; skill: { art: number; programming: number; all: number } };
    softCapBonus: Record<string, number>;
  } {
    const result = {
      expBonus: {
        knowledge: 0,
        skill: {
          art: 0,
          programming: 0,
          all: 0
        }
      },
      softCapBonus: {} as Record<string, number>
    }

    if (!this.player.talents) return result

    for (const talentId of this.player.talents) {
      switch (talentId) {
        case 't1':
          result.softCapBonus['iq'] = (result.softCapBonus['iq'] || 0) + 10
          result.expBonus.knowledge += 10
          break
        case 't6':
          result.expBonus.knowledge += 5
          break
        case 't10':
          result.expBonus.skill.art += 10
          result.expBonus.skill.programming += 10
          break
      }
    }

    return result
  },

  /**
   * 增加学科经验
   */
  addSubjectExp(this: any, subject: string, amount: number) {
    if (this.player.subjectExps[subject] !== undefined) {
      const bonuses = this.getTalentBonuses()
      const multiplier = 1 + (bonuses.expBonus.knowledge / 100) + (this.getExpMultiplier('knowledge') - 1)
      const finalAmount = Math.round(amount * multiplier)
      
      this.player.subjectExps[subject] += finalAmount
      while (this.player.subjectExps[subject] >= 100) {
        this.player.subjectExps[subject] -= 100
        this.player.subjects[subject]++
      }
    }
  },

  /**
   * 增加技能经验
   */
  addSkillExp(this: any, skill: string, amount: number) {
    if (this.player.skillExps[skill] !== undefined) {
      const bonuses = this.getTalentBonuses()
      let multiplier = 1 + (this.getExpMultiplier('skill') - 1)
      
      if (skill === 'painting') {
        multiplier += bonuses.expBonus.skill.art / 100
      } else if (skill === 'programming') {
        multiplier += bonuses.expBonus.skill.programming / 100
      }
      multiplier += bonuses.expBonus.skill.all / 100
      
      const finalAmount = Math.round(amount * multiplier)
      
      this.player.skillExps[skill] += finalAmount
      while (this.player.skillExps[skill] >= 100) {
        this.player.skillExps[skill] -= 100
        this.player.skills[skill]++
      }
    }
  },

  /**
   * 增加属性
   */
  addAttribute(this: any, attrName: keyof PlayerStats['attributes']) {
    if (this.player.freePoints > 0) {
      if (this.player.attributes[attrName] >= this.player.potentials[attrName]) {
        console.warn(`[GameStore] Attribute ${attrName} reached potential limit`)
        return
      }
      this.player.attributes[attrName]++
      this.player.freePoints--
    }
  },

  /**
   * 增加潜力
   */
  addPotential(this: any, attrName: keyof PlayerStats['potentials']) {
    const cost = 5
    if (this.player.freePoints >= cost) {
      this.player.potentials[attrName]++
      this.player.freePoints -= cost
    }
  },

  /**
   * 添加总结
   */
  addSummary(this: any, data: Omit<SummaryData, 'timestamp' | 'coveredFloors'>) {
    if (!this.player.summaries) {
      this.player.summaries = []
    }
    this.player.summaries.push({
      ...data,
      coveredFloors: [],
      timestamp: Date.now()
    })
  },

  /**
   * 添加 NPC
   */
  addNpc(this: any, npc: NpcStats) {
    this.npcs.push(npc)
  },

  /**
   * 设置玩家位置
   */
  setLocation(this: any, locationId: string) {
    this.player.location = locationId
  },

  /**
   * 设置标志位
   */
  setFlag(this: any, flag: string, value: boolean = true) {
    this.player.flags[flag] = value
  },

  /**
   * 从 JSON 更新状态
   */
  updateFromJSON(this: any, data: any) {
    if (data.location) {
      const locationId = getIdByName(data.location) || data.location
      this.player.location = locationId
    }
    if (data.time) {
      const current = new Date(
        this.gameTime.year,
        this.gameTime.month - 1,
        this.gameTime.day,
        this.gameTime.hour,
        this.gameTime.minute
      )
      
      const targetTime = { ...this.gameTime, ...data.time }
      const target = new Date(
        targetTime.year,
        targetTime.month - 1,
        targetTime.day,
        targetTime.hour,
        targetTime.minute
      )
      
      const diffMs = target.getTime() - current.getTime()
      const diffMinutes = Math.round(diffMs / 60000)
      
      if (diffMinutes !== 0) {
        console.log(`[GameStore] Absolute time update detected. Delta: ${diffMinutes}m`)
        this.advanceTime(diffMinutes)
      }
    }
    if (data.time_delta) {
      const deltaHour = Number(data.time_delta.hour) || 0
      const deltaMinute = Number(data.time_delta.minute) || 0
      const totalMinutes = deltaHour * 60 + deltaMinute
      
      if (totalMinutes > 0) {
        this.advanceTime(totalMinutes)
      }
    }
    if (data.stats) {
      if (data.stats.freePoints) this.player.freePoints += data.stats.freePoints
      if (data.stats.hp) this.player.hp = Math.min(this.player.maxHp, Math.max(0, this.player.hp + data.stats.hp))
      if (data.stats.money) this.player.money += data.stats.money
      if (data.stats.health) this.player.health = Math.min(100, Math.max(0, this.player.health + data.stats.health))
      if (data.stats.mood) this.player.attributes.mood = Math.min(100, Math.max(0, this.player.attributes.mood + data.stats.mood))
    }
    if (data.exp) {
      if (data.exp.base) this.addExp(data.exp.base)
      
      if (data.exp.subjects) {
        for (const key in data.exp.subjects) {
          this.addSubjectExp(key, data.exp.subjects[key])
        }
      }

      if (data.exp.skills) {
        for (const key in data.exp.skills) {
          this.addSkillExp(key, data.exp.skills[key])
        }
      }
    }
    if (data.npcs && Array.isArray(data.npcs)) {
      data.npcs.forEach((newNpc: NpcStats) => {
        let existingNpc = null
        
        if (newNpc.id) {
          existingNpc = this.npcs.find((n: NpcStats) => n.id === newNpc.id)
        } else if (newNpc.name) {
          existingNpc = this.npcs.find((n: NpcStats) => n.name === newNpc.name)
        }

        if (newNpc.isAlive !== undefined) {
           if (typeof newNpc.isAlive === 'string') {
             // @ts-ignore
             newNpc.isAlive = newNpc.isAlive === 'true'
           }
        }

        // @ts-ignore
        const { relationship: ignoredRel, ...npcData } = newNpc

        if (existingNpc) {
          Object.assign(existingNpc, npcData)
        } else if (npcData.id) {
          // @ts-ignore
          if (npcData.relationship === undefined) npcData.relationship = 0
          this.npcs.push(npcData)
        } else if (npcData.name) {
          // @ts-ignore
          npcData.id = generateCharId(npcData.name)
          // @ts-ignore
          if (npcData.relationship === undefined) npcData.relationship = 0
          this.npcs.push(npcData)
          console.log('[GameStore] Added new NPC with generated ID:', npcData)
        } else {
          console.warn('[GameStore] Cannot add new NPC without ID or Name:', npcData)
        }
      })
    }

    if (data.delta) {
      for (const [path, value] of Object.entries(data.delta)) {
        this.applyDeltaUpdate(path, Number(value))
      }
    }

    if (data.set) {
      for (const [path, value] of Object.entries(data.set)) {
        this.applySetUpdate(path, value)
      }
    }
  },

  /**
   * 应用增量更新
   */
  applyDeltaUpdate(this: any, path: string, delta: number) {
    if (isNaN(delta)) return

    if (this.player.talents.includes('t9')) {
      const isMoodUpdate = path.includes('mood') || path.includes('心境')
      if (isMoodUpdate && delta < 0) {
        delta = Math.ceil(delta / 2)
        console.log('[天赋生效] 钢铁心灵生效，心境扣减减半')
      }
    }

    const parts = path.split('.')
    let current: any = this
    let targetKey = parts[parts.length - 1]
    
    const pathMap: Record<string, string> = {
      '玩家': 'player',
      '社团': 'allClubs',
      '世界状态': 'worldState',
      'clubs': 'allClubs'
    }

    for (let i = 0; i < parts.length - 1; i++) {
      let part = parts[i]
      part = pathMap[part] || part
      
      if (targetKey === 'energy' && part === 'attributes' && current === this.player) {
         this.player.mp = Math.max(0, this.player.mp + delta)
         console.log(`[GameStore] Redirected attributes.energy delta to player.mp: ${delta}`)
         return
      }

      if (current[part] === undefined) {
        if (current === this.allClubs) {
           if (current[part]) {
             current = current[part]
             continue
           }
           const club = Object.values(this.allClubs).find((c: any) => c.name === part)
           if (club) {
             current = club
             continue
           }
        }
        console.warn(`[GameStore] Invalid delta path: ${path}`)
        return
      }
      current = current[part]
    }

    if (typeof current[targetKey] === 'number') {
      current[targetKey] += delta
      if (targetKey !== 'money' && targetKey !== 'economy') {
         current[targetKey] = Math.max(0, current[targetKey])
      }
      if (['health', 'mood', 'iq', 'eq', 'physique', 'flexibility', 'charm', 'economy'].includes(targetKey)) {
         current[targetKey] = Math.min(100, current[targetKey])
      }
      console.log(`[GameStore] Delta update: ${path} += ${delta} -> ${current[targetKey]}`)
    } else {
      if (current[targetKey] === undefined && (targetKey === 'activity' || targetKey === 'completedRequests')) {
        current[targetKey] = delta
        console.log(`[GameStore] Initialized ${path} to ${delta}`)
      } else {
        console.warn(`[GameStore] Cannot apply delta to non-number: ${path}`)
      }
    }
  },

  /**
   * 应用直接设置更新
   */
  applySetUpdate(this: any, path: string, value: any) {
    const parts = path.split('.')
    let current: any = this
    let targetKey = parts[parts.length - 1]
    
    const pathMap: Record<string, string> = {
      '玩家': 'player',
      '社团': 'allClubs',
      '世界状态': 'worldState',
      'clubs': 'allClubs'
    }

    for (let i = 0; i < parts.length - 1; i++) {
      let part = parts[i]
      part = pathMap[part] || part
      
      if (current[part] === undefined) {
         if (current === this.allClubs) {
           if (current[part]) {
             current = current[part]
             continue
           }
           const club = Object.values(this.allClubs).find((c: any) => c.name === part)
           if (club) {
             current = club
             continue
           }
        }
        console.warn(`[GameStore] Invalid set path: ${path}`)
        return
      }
      current = current[part]
    }

    current[targetKey] = value
    console.log(`[GameStore] Set update: ${path} = ${value}`)
  }
}
