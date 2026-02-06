<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

// 天赋定义（用于显示名称和效果）
const TALENT_DEFINITIONS = {
  t1: { name: '学神', desc: '知识经验获取+10%' },
  t2: { name: '社交达人', desc: '情商软上限+10' },
  t3: { name: '运动健将', desc: '体能/灵活软上限+5' },
  t4: { name: '万人迷', desc: '魅力软上限+10' },
  t5: { name: '小透明', desc: '社交存在感较低' },
  t6: { name: '过目不忘', desc: '知识经验获取+5%' },
  t7: { name: '天生财运', desc: '每月额外零花钱' },
  t8: { name: '第六感', desc: '特殊事件获得提示' },
  t9: { name: '钢铁心灵', desc: '心境软上限+20' },
  t10: { name: '动手能力MAX', desc: '艺术/编程经验+10%' },
  t11: { name: '言出法随', desc: '社交成功率大增' },
  t12: { name: '多面手', desc: '所有技能初始+1' }
}

// 活动效果（来自物品、装备等）
const activeEffects = computed(() => {
  return gameStore.player.activeEffects || []
})

// 临时效果（有倒计时的）
const temporaryEffects = computed(() => {
  return activeEffects.value.filter(e => e.turnsRemaining > 0)
})

// 永久效果（来自装备）
const permanentEffects = computed(() => {
  return activeEffects.value.filter(e => e.turnsRemaining === -1)
})

// 天赋加成
const talentEffects = computed(() => {
  const talents = gameStore.player.talents || []
  return talents.map(id => ({
    id,
    ...(TALENT_DEFINITIONS[id] || { name: id, desc: '未知效果' })
  }))
})

// 计算天赋的实际加成数值
const talentBonusSummary = computed(() => {
  const bonuses = gameStore.getTalentBonuses()
  const summary = []
  
  if (bonuses.expBonus.knowledge > 0) {
    summary.push({ label: '知识经验', value: `+${bonuses.expBonus.knowledge}%`, type: 'exp' })
  }
  if (bonuses.expBonus.skill.art > 0) {
    summary.push({ label: '艺术经验', value: `+${bonuses.expBonus.skill.art}%`, type: 'exp' })
  }
  if (bonuses.expBonus.skill.programming > 0) {
    summary.push({ label: '编程经验', value: `+${bonuses.expBonus.skill.programming}%`, type: 'exp' })
  }
  
  return summary
})

// 是否有任何效果需要显示
const hasEffects = computed(() => {
  return temporaryEffects.value.length > 0 || 
         permanentEffects.value.length > 0 || 
         talentEffects.value.length > 0
})

// 获取效果图标
const getEffectIcon = (effect) => {
  const type = effect.effectType || effect.sourceType
  switch (type) {
    case 'stat': return '📊'
    case 'expBonus': return '📈'
    case 'recoveryBonus': return '💚'
    case 'efficiencyBonus': return '⚡'
    case 'resistance': return '🛡️'
    case 'modifier': return '🔧'
    case 'item': return '🍔'
    case 'equipment': return '👕'
    case 'event': return '⭐'
    default: return '✨'
  }
}

// 格式化效果值
const formatValue = (effect) => {
  const sign = effect.value >= 0 ? '+' : ''
  const suffix = effect.isPercentage ? '%' : ''
  return `${sign}${effect.value}${suffix}`
}
</script>

<template>
  <div class="effects-panel" v-if="hasEffects">
    <div class="panel-header">
      <span class="header-icon">✨</span>
      <span>活跃效果</span>
    </div>

    <!-- 临时效果 -->
    <div v-if="temporaryEffects.length > 0" class="effects-section">
      <div class="section-title">⏳ 临时增益</div>
      <div class="effects-list">
        <div v-for="effect in temporaryEffects" :key="effect.id" class="effect-item temp">
          <span class="effect-icon">{{ getEffectIcon(effect) }}</span>
          <span class="effect-name">{{ effect.name }}</span>
          <span class="effect-value" :class="{ positive: effect.value > 0, negative: effect.value < 0 }">
            {{ formatValue(effect) }}
          </span>
          <span class="effect-duration">{{ effect.turnsRemaining }}回合</span>
        </div>
      </div>
    </div>

    <!-- 装备效果 -->
    <div v-if="permanentEffects.length > 0" class="effects-section">
      <div class="section-title">👕 装备加成</div>
      <div class="effects-list">
        <div v-for="effect in permanentEffects" :key="effect.id" class="effect-item perm">
          <span class="effect-icon">{{ getEffectIcon(effect) }}</span>
          <span class="effect-name">{{ effect.name }}</span>
          <span class="effect-value" :class="{ positive: effect.value > 0, negative: effect.value < 0 }">
            {{ formatValue(effect) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 天赋效果 -->
    <div v-if="talentEffects.length > 0" class="effects-section">
      <div class="section-title">🌟 天赋被动</div>
      <div class="effects-list">
        <div v-for="talent in talentEffects" :key="talent.id" class="effect-item talent">
          <span class="effect-icon">🎯</span>
          <span class="effect-name">{{ talent.name }}</span>
          <span class="effect-desc">{{ talent.desc }}</span>
        </div>
      </div>
      <!-- 天赋加成汇总 -->
      <div v-if="talentBonusSummary.length > 0" class="bonus-summary">
        <span v-for="bonus in talentBonusSummary" :key="bonus.label" class="bonus-tag">
          {{ bonus.label }} {{ bonus.value }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.effects-panel {
  margin-top: 10px;
  padding: 10px;
  border-top: 1px solid rgba(139, 69, 19, 0.15);
  font-family: 'Ma Shan Zheng', cursive;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1.1rem;
  color: #5d4037;
  margin-bottom: 10px;
  font-weight: bold;
}

.header-icon {
  font-size: 1.2rem;
}

.effects-section {
  margin-bottom: 12px;
}

.section-title {
  font-size: 0.9rem;
  color: #8d6e63;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(139, 69, 19, 0.1);
}

.effects-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.effect-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.5);
}

.effect-item.temp {
  background: linear-gradient(90deg, rgba(255, 193, 7, 0.15) 0%, rgba(255, 235, 59, 0.1) 100%);
  border-left: 3px solid #ffc107;
}

.effect-item.perm {
  background: linear-gradient(90deg, rgba(76, 175, 80, 0.15) 0%, rgba(129, 199, 132, 0.1) 100%);
  border-left: 3px solid #4caf50;
}

.effect-item.talent {
  background: linear-gradient(90deg, rgba(103, 58, 183, 0.15) 0%, rgba(149, 117, 205, 0.1) 100%);
  border-left: 3px solid #673ab7;
}

.effect-icon {
  font-size: 1rem;
  min-width: 20px;
  text-align: center;
}

.effect-name {
  flex: 1;
  color: #3e2723;
  font-weight: 500;
}

.effect-value {
  font-weight: bold;
  min-width: 40px;
  text-align: right;
}

.effect-value.positive {
  color: #2e7d32;
}

.effect-value.negative {
  color: #c62828;
}

.effect-duration {
  font-size: 0.75rem;
  color: #ff6f00;
  background: rgba(255, 111, 0, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 50px;
  text-align: center;
}

.effect-desc {
  color: #6d4c41;
  font-size: 0.8rem;
  font-style: italic;
}

.bonus-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dotted rgba(103, 58, 183, 0.2);
}

.bonus-tag {
  background: linear-gradient(135deg, #673ab7 0%, #9c27b0 100%);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

/* 夜间模式 */
:global(.dark-mode) .effects-panel {
  border-top-color: rgba(99, 102, 241, 0.2);
}

:global(.dark-mode) .panel-header {
  color: #e0e7ff;
}

:global(.dark-mode) .section-title {
  color: #a5b4fc;
  border-bottom-color: rgba(99, 102, 241, 0.2);
}

:global(.dark-mode) .effect-item {
  background: rgba(30, 30, 50, 0.5);
}

:global(.dark-mode) .effect-item.temp {
  background: linear-gradient(90deg, rgba(255, 193, 7, 0.2) 0%, rgba(255, 235, 59, 0.1) 100%);
}

:global(.dark-mode) .effect-item.perm {
  background: linear-gradient(90deg, rgba(76, 175, 80, 0.2) 0%, rgba(129, 199, 132, 0.1) 100%);
}

:global(.dark-mode) .effect-item.talent {
  background: linear-gradient(90deg, rgba(103, 58, 183, 0.25) 0%, rgba(149, 117, 205, 0.15) 100%);
}

:global(.dark-mode) .effect-name {
  color: #e0e7ff;
}

:global(.dark-mode) .effect-desc {
  color: #a5b4fc;
}

:global(.dark-mode) .effect-value.positive {
  color: #81c784;
}

:global(.dark-mode) .effect-value.negative {
  color: #ef5350;
}

:global(.dark-mode) .bonus-summary {
  border-top-color: rgba(103, 58, 183, 0.3);
}
</style>
