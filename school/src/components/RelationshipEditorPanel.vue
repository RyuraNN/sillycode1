<!-- 关系编辑器面板 - 左右分栏布局 -->
<template>
  <div class="rel-editor-panel" :class="{ 'has-selection': !!selectedChar }">
    <!-- 左侧：角色列表 -->
    <div class="left-panel">
      <div class="panel-toolbar">
        <input v-model="searchQuery" placeholder="搜索角色..." class="search-input" />
        <select v-model="filterMode" class="filter-select">
          <option value="all">全部</option>
          <option value="hasRelations">有关系</option>
          <option value="noRelations">无关系</option>
          <option value="ghostOnly">仅幽灵角色</option>
        </select>
      </div>
      <div class="char-list">
        <div
          v-for="char in filteredCharacters"
          :key="char.name"
          class="char-card"
          :class="{ selected: selectedChar === char.name, ghost: char.ghost }"
          @click="selectedChar = char.name"
        >
          <span class="gender-icon">{{ char.ghost ? '👻' : (char.gender === 'male' ? '♂' : char.gender === 'female' ? '♀' : '?') }}</span>
          <span class="char-name">{{ char.name }}</span>
          <span class="ref-badge" v-if="char.ghost">被引用 ×{{ char.refCount }}</span>
          <span class="rel-badge" v-else-if="char.relCount > 0">{{ char.relCount }}</span>
        </div>
        <div v-if="filteredCharacters.length === 0" class="empty-hint">无匹配角色</div>
      </div>
      <div class="panel-footer">
        <span>共 {{ allCharacters.length }} 个角色</span>
      </div>
    </div>

    <!-- 右侧：选中角色详情 -->
    <div class="right-panel">
      <template v-if="selectedCharData">
        <!-- 角色信息头 -->
        <div class="char-header">
          <div class="char-info">
            <button class="btn-back-mobile" @click="selectedChar = ''">←</button>
            <span class="gender-icon large">{{ selectedCharData.gender === 'male' ? '♂' : selectedCharData.gender === 'female' ? '♀' : '?' }}</span>
            <h3>{{ selectedChar }}</h3>
            <span class="rel-count">{{ selectedRelations.length }} 条关系</span>
          </div>
          <div class="char-actions">
            <button class="btn-action btn-add" @click="$emit('add-relationship', selectedChar)" title="添加关系">➕ 添加</button>
            <button class="btn-action btn-clear" @click="$emit('clear-char-relations', selectedChar)" title="清空所有关系">🗑️ 清空关系</button>
            <button class="btn-action btn-warn" @click="$emit('clear-char-impressions', selectedChar)" title="清除印象标签">🏷️ 清除印象</button>
            <button class="btn-action btn-danger" @click="$emit('remove-character', selectedChar)" title="完全移除角色">⚠️ 移除角色</button>
          </div>
        </div>

        <!-- 关系搜索与排序 -->
        <div class="rel-toolbar">
          <input v-model="relSearchQuery" placeholder="搜索关系..." class="search-input small" />
          <select v-model="relSortBy" class="sort-select">
            <option value="name">按名字</option>
            <option value="intimacy">按亲密度</option>
            <option value="trust">按信赖度</option>
            <option value="hostility">按敌意</option>
          </select>
        </div>

        <!-- 关系列表 -->
        <div class="rel-list">
          <div v-for="rel in sortedRelations" :key="rel.target" class="rel-card">
            <div class="rel-card-header">
              <span class="rel-target-name">{{ rel.target }}</span>
              <div class="rel-groups">
                <span
                  v-for="g in rel.groups"
                  :key="g"
                  class="group-tag"
                  :style="{ background: getGroupColor(g), color: '#fff' }"
                >{{ getGroupName(g) }}</span>
              </div>
              <div class="rel-card-actions">
                <button class="btn-sm btn-edit" @click="$emit('edit-relationship', selectedChar, rel.target)">✏️</button>
                <button class="btn-sm btn-del" @click="$emit('delete-relationship', selectedChar, rel.target)">🗑️</button>
              </div>
            </div>

            <!-- 4轴数值条 -->
            <div class="axes-compact">
              <div class="axis-bar-row" v-for="axisKey in ['intimacy','trust','passion']" :key="axisKey">
                <span class="axis-label">{{ axisNames[axisKey] }}</span>
                <div class="bar-track bidirectional">
                  <div class="bar-center"></div>
                  <div
                    class="bar-fill"
                    :class="rel[axisKey] >= 0 ? 'positive' : 'negative'"
                    :style="getBarStyle(axisKey, rel[axisKey])"
                  ></div>
                </div>
                <span class="axis-val" :class="rel[axisKey] >= 0 ? 'val-pos' : 'val-neg'">{{ rel[axisKey] }}</span>
              </div>
              <div class="axis-bar-row">
                <span class="axis-label">{{ axisNames.hostility }}</span>
                <div class="bar-track unidirectional">
                  <div
                    class="bar-fill hostility"
                    :style="{ width: rel.hostility + '%' }"
                  ></div>
                </div>
                <span class="axis-val val-hostility">{{ rel.hostility }}</span>
              </div>
            </div>

            <!-- 印象标签 -->
            <div v-if="rel.tags && rel.tags.length" class="rel-tags">
              <span v-for="(tag, i) in rel.tags" :key="i" class="impression-tag">{{ tag }}</span>
            </div>
          </div>
          <div v-if="sortedRelations.length === 0" class="empty-hint">暂无关系数据</div>
        </div>

        <!-- 反向关系折叠区 -->
        <div v-if="reverseRelations.length > 0" class="reverse-section">
          <button class="reverse-toggle" @click="showReverse = !showReverse">
            {{ showReverse ? '▼' : '▶' }} 反向关系 ({{ reverseRelations.length }})
          </button>
          <div v-if="showReverse" class="reverse-list">
            <div v-for="rev in reverseRelations" :key="rev.source" class="rel-card readonly">
              <div class="rel-card-header">
                <span class="rel-target-name">{{ rev.source }} → {{ selectedChar }}</span>
                <div class="rel-groups">
                  <span v-for="g in rev.groups" :key="g" class="group-tag"
                    :style="{ background: getGroupColor(g), color: '#fff' }">{{ getGroupName(g) }}</span>
                </div>
              </div>
              <div class="axes-compact">
                <div class="axis-bar-row" v-for="axisKey in ['intimacy','trust','passion']" :key="axisKey">
                  <span class="axis-label">{{ axisNames[axisKey] }}</span>
                  <div class="bar-track bidirectional">
                    <div class="bar-center"></div>
                    <div class="bar-fill" :class="rev[axisKey] >= 0 ? 'positive' : 'negative'"
                      :style="getBarStyle(axisKey, rev[axisKey])"></div>
                  </div>
                  <span class="axis-val" :class="rev[axisKey] >= 0 ? 'val-pos' : 'val-neg'">{{ rev[axisKey] }}</span>
                </div>
                <div class="axis-bar-row">
                  <span class="axis-label">{{ axisNames.hostility }}</span>
                  <div class="bar-track unidirectional">
                    <div class="bar-fill hostility" :style="{ width: rev.hostility + '%' }"></div>
                  </div>
                  <span class="axis-val val-hostility">{{ rev.hostility }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 幽灵角色视图 -->
      <template v-else-if="isGhostSelected">
        <div class="char-header ghost-header">
          <div class="char-info">
            <span class="gender-icon large">👻</span>
            <h3>{{ selectedChar }}</h3>
            <span class="rel-count ghost-hint">幽灵角色</span>
          </div>
          <div class="char-actions">
            <button class="btn-action btn-danger" @click="$emit('clear-ghost-references', selectedChar)">🗑️ 清除所有引用</button>
          </div>
        </div>
        <div class="ghost-notice">
          <p>该角色不存在于关系数据中，但被以下 {{ ghostReferences.length }} 个角色引用：</p>
        </div>
        <div class="rel-list">
          <div v-for="rev in ghostReferences" :key="rev.source" class="rel-card readonly">
            <div class="rel-card-header">
              <span class="rel-target-name">{{ rev.source }} → {{ selectedChar }}</span>
              <div class="rel-groups">
                <span v-for="g in rev.groups" :key="g" class="group-tag"
                  :style="{ background: getGroupColor(g), color: '#fff' }">{{ getGroupName(g) }}</span>
              </div>
            </div>
            <div class="axes-compact">
              <div class="axis-bar-row" v-for="axisKey in ['intimacy','trust','passion']" :key="axisKey">
                <span class="axis-label">{{ axisNames[axisKey] }}</span>
                <div class="bar-track bidirectional">
                  <div class="bar-center"></div>
                  <div class="bar-fill" :class="rev[axisKey] >= 0 ? 'positive' : 'negative'"
                    :style="getBarStyle(axisKey, rev[axisKey])"></div>
                </div>
                <span class="axis-val" :class="rev[axisKey] >= 0 ? 'val-pos' : 'val-neg'">{{ rev[axisKey] }}</span>
              </div>
              <div class="axis-bar-row">
                <span class="axis-label">{{ axisNames.hostility }}</span>
                <div class="bar-track unidirectional">
                  <div class="bar-fill hostility" :style="{ width: rev.hostility + '%' }"></div>
                </div>
                <span class="axis-val val-hostility">{{ rev.hostility }}</span>
              </div>
            </div>
            <div v-if="rev.tags && rev.tags.length" class="rel-tags">
              <span v-for="(tag, i) in rev.tags" :key="i" class="impression-tag">{{ tag }}</span>
            </div>
          </div>
          <div v-if="ghostReferences.length === 0" class="empty-hint">无引用数据</div>
        </div>
      </template>

      <div v-else class="empty-state">
        <p>👈 选择一个角色查看关系详情</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { RELATIONSHIP_GROUPS } from '../data/relationshipData'

const props = defineProps({
  npcRelationships: { type: Object, default: () => ({}) }
})

defineEmits([
  'edit-relationship', 'delete-relationship', 'add-relationship',
  'clear-char-relations', 'clear-char-impressions', 'remove-character',
  'clear-ghost-references'
])

const searchQuery = ref('')
const filterMode = ref('all')
const selectedChar = ref('')
const relSearchQuery = ref('')
const relSortBy = ref('name')
const showReverse = ref(false)

const axisNames = { intimacy: '亲密', trust: '信赖', passion: '激情', hostility: '敌意' }

// 角色列表（含幽灵角色）
const allCharacters = computed(() => {
  const rels = props.npcRelationships || {}
  const topKeys = new Set(Object.keys(rels))

  // 收集幽灵角色：只作为关系目标存在，自身无顶层条目
  const ghostRefCount = {}
  for (const charData of Object.values(rels)) {
    for (const target of Object.keys(charData?.relations || {})) {
      if (!topKeys.has(target)) {
        ghostRefCount[target] = (ghostRefCount[target] || 0) + 1
      }
    }
  }

  const normal = Object.keys(rels).map(name => ({
    name,
    gender: rels[name]?.gender || 'unknown',
    relCount: Object.keys(rels[name]?.relations || {}).length,
    ghost: false,
    refCount: 0
  }))

  const ghosts = Object.entries(ghostRefCount).map(([name, count]) => ({
    name,
    gender: 'unknown',
    relCount: 0,
    ghost: true,
    refCount: count
  }))

  return [...normal, ...ghosts].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
})

const filteredCharacters = computed(() => {
  let list = allCharacters.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q))
  }
  if (filterMode.value === 'hasRelations') list = list.filter(c => c.relCount > 0)
  else if (filterMode.value === 'noRelations') list = list.filter(c => c.relCount === 0 && !c.ghost)
  else if (filterMode.value === 'ghostOnly') list = list.filter(c => c.ghost)
  return list
})

// 选中角色数据
const selectedCharData = computed(() => {
  if (!selectedChar.value) return null
  return props.npcRelationships?.[selectedChar.value] || null
})

// 是否选中了幽灵角色
const isGhostSelected = computed(() => {
  if (!selectedChar.value) return false
  const rels = props.npcRelationships || {}
  return !Object.prototype.hasOwnProperty.call(rels, selectedChar.value)
})

// 幽灵角色被引用的关系列表
const ghostReferences = computed(() => {
  if (!isGhostSelected.value || !selectedChar.value) return []
  const rels = props.npcRelationships || {}
  const result = []
  for (const [sourceName, charData] of Object.entries(rels)) {
    const rel = charData?.relations?.[selectedChar.value]
    if (rel) {
      result.push({
        source: sourceName,
        intimacy: rel.intimacy ?? 0, trust: rel.trust ?? 0,
        passion: rel.passion ?? 0, hostility: rel.hostility ?? 0,
        groups: rel.groups || [], tags: rel.tags || []
      })
    }
  }
  return result
})

const selectedRelations = computed(() => {
  if (!selectedCharData.value?.relations) return []
  const rels = selectedCharData.value.relations
  return Object.entries(rels).map(([target, data]) => ({
    target,
    intimacy: data.intimacy ?? 0,
    trust: data.trust ?? 0,
    passion: data.passion ?? 0,
    hostility: data.hostility ?? 0,
    groups: data.groups || [],
    tags: data.tags || []
  }))
})

const sortedRelations = computed(() => {
  let list = selectedRelations.value
  if (relSearchQuery.value) {
    const q = relSearchQuery.value.toLowerCase()
    list = list.filter(r => r.target.toLowerCase().includes(q))
  }
  const key = relSortBy.value
  if (key === 'name') return [...list].sort((a, b) => a.target.localeCompare(b.target, 'zh'))
  return [...list].sort((a, b) => Math.abs(b[key]) - Math.abs(a[key]))
})

// 反向关系
const reverseRelations = computed(() => {
  if (!selectedChar.value) return []
  const rels = props.npcRelationships || {}
  const myRelTargets = new Set(Object.keys(selectedCharData.value?.relations || {}))
  const result = []
  for (const [sourceName, charData] of Object.entries(rels)) {
    if (sourceName === selectedChar.value) continue
    const rel = charData?.relations?.[selectedChar.value]
    if (rel && !myRelTargets.has(sourceName)) {
      result.push({
        source: sourceName,
        intimacy: rel.intimacy ?? 0, trust: rel.trust ?? 0,
        passion: rel.passion ?? 0, hostility: rel.hostility ?? 0,
        groups: rel.groups || [], tags: rel.tags || []
      })
    }
  }
  return result
})

function getGroupColor(key) { return RELATIONSHIP_GROUPS[key]?.color || '#666' }
function getGroupName(key) { return RELATIONSHIP_GROUPS[key]?.name || key }

function getBarStyle(axisKey, val) {
  const pct = Math.abs(val) / 2
  if (val >= 0) return { left: '50%', width: pct + '%' }
  return { right: '50%', width: pct + '%' }
}
</script>

<style scoped>
.rel-editor-panel { display: flex; height: 100%; overflow: hidden; flex: 1; min-height: 0; }
/* 左侧面板 */
.left-panel {
  width: 260px; min-width: 220px; border-right: 1px solid #444;
  display: flex; flex-direction: column; background: #1e1e1e;
}
.panel-toolbar {
  display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid #333; flex-shrink: 0;
}
.search-input {
  flex: 1; background: #2a2a2a; border: 1px solid #444; color: #fff;
  padding: 7px 10px; border-radius: 6px; font-size: 13px; min-width: 0;
}
.search-input.small { font-size: 12px; padding: 5px 8px; }
.filter-select, .sort-select {
  background: #2a2a2a; border: 1px solid #444; color: #ccc;
  padding: 6px; border-radius: 6px; font-size: 12px;
}
.char-list { flex: 1; overflow-y: auto; padding: 6px; }
.char-card {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 6px; cursor: pointer; transition: background 0.15s;
  margin-bottom: 2px;
}
.char-card:hover { background: #2a2a2a; }
.char-card.selected { background: #2a3a2a; border: 1px solid #4CAF50; }
.gender-icon { font-size: 14px; width: 18px; text-align: center; }
.gender-icon.large { font-size: 22px; width: 28px; }
.char-card .char-name { flex: 1; color: #ddd; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel-badge {
  background: #4CAF50; color: #fff; font-size: 11px; padding: 1px 6px;
  border-radius: 10px; min-width: 18px; text-align: center;
}
.panel-footer {
  padding: 8px 12px; border-top: 1px solid #333; color: #666; font-size: 12px;
  flex-shrink: 0;
}
/* 右侧面板 */
.right-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.char-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #333; flex-shrink: 0;
  flex-wrap: wrap; gap: 8px;
}
.char-info { display: flex; align-items: center; gap: 8px; }
.char-info h3 { margin: 0; color: #fff; font-size: 18px; }
.rel-count { color: #888; font-size: 13px; }
.char-actions { display: flex; gap: 6px; flex-wrap: wrap; }
/* STYLE_PART2 */
.btn-action {
  padding: 4px 10px; border: 1px solid #444; border-radius: 5px;
  cursor: pointer; font-size: 12px; background: #2a2a2a; color: #ccc;
  transition: all 0.15s; white-space: nowrap;
}
.btn-action:hover { background: #333; }
.btn-add { border-color: #4CAF50; }
.btn-add:hover { background: #2a3a2a; color: #4CAF50; }
.btn-clear:hover { background: #3a2a2a; color: #FF9800; }
.btn-warn:hover { background: #3a3a2a; color: #FF9800; }
.btn-danger { border-color: #d32f2f; }
.btn-danger:hover { background: #3a1a1a; color: #F44336; }
/* 关系工具栏 */
.rel-toolbar {
  display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid #333; flex-shrink: 0;
}
/* 关系列表 */
.rel-list { flex: 1; overflow-y: auto; padding: 8px 16px; }
.rel-card {
  background: #2a2a2a; border: 1px solid #333; border-radius: 8px;
  padding: 10px 12px; margin-bottom: 8px; transition: border-color 0.15s;
}
.rel-card:hover { border-color: #555; }
.rel-card.readonly { opacity: 0.7; }
.rel-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.rel-target-name { color: #fff; font-weight: 600; font-size: 14px; }
.rel-groups { display: flex; gap: 4px; flex: 1; flex-wrap: wrap; }
.group-tag {
  padding: 1px 6px; border-radius: 3px; font-size: 11px; white-space: nowrap;
}
.rel-card-actions { display: flex; gap: 4px; }
.btn-sm {
  background: transparent; border: none; cursor: pointer; font-size: 14px;
  padding: 2px 4px; border-radius: 4px;
}
.btn-sm:hover { background: #444; }
/* 数值条 */
.axes-compact { display: flex; flex-direction: column; gap: 3px; }
.axis-bar-row { display: flex; align-items: center; gap: 6px; }
.axis-label { width: 32px; color: #888; font-size: 11px; text-align: right; flex-shrink: 0; }
.bar-track {
  flex: 1; height: 6px; background: #1a1a1a; border-radius: 3px;
  position: relative; overflow: hidden;
}
.bar-center {
  position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #555;
}
.bar-fill {
  position: absolute; top: 0; height: 100%; border-radius: 3px;
  transition: width 0.2s;
}
.bar-fill.positive { background: #4CAF50; }
.bar-fill.negative { background: #F44336; }
.bar-fill.hostility { background: #F44336; position: relative; }
.axis-val { width: 32px; font-size: 11px; text-align: right; flex-shrink: 0; }
.val-pos { color: #4CAF50; }
.val-neg { color: #F44336; }
.val-hostility { color: #FF9800; }
/* STYLE_PART3 */
/* 印象标签 */
.rel-tags { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.impression-tag {
  background: #333; color: #aaa; padding: 2px 6px; border-radius: 3px;
  font-size: 11px;
}
/* 反向关系 */
.reverse-section { padding: 8px 16px; border-top: 1px solid #333; flex-shrink: 0; }
.reverse-toggle {
  background: none; border: none; color: #888; cursor: pointer;
  font-size: 13px; padding: 4px 0; width: 100%; text-align: left;
}
.reverse-toggle:hover { color: #ccc; }
.reverse-list { margin-top: 6px; }
/* 空状态 */
.empty-state {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #666; font-size: 15px;
}
.empty-hint { color: #555; font-size: 13px; text-align: center; padding: 20px; }
/* 幽灵角色样式 */
.char-card.ghost { border-left: 3px solid #FF9800; }
.ref-badge {
  background: #FF9800; color: #fff; font-size: 10px; padding: 1px 6px;
  border-radius: 10px; white-space: nowrap;
}
.ghost-header { border-left: 3px solid #FF9800; }
.ghost-hint { color: #FF9800; font-size: 12px; }
.ghost-notice {
  padding: 10px 16px; color: #bbb; font-size: 13px;
  border-bottom: 1px solid #333; flex-shrink: 0;
}
.ghost-notice p { margin: 0; }

/* 宽屏隐藏返回按钮 */
.btn-back-mobile { display: none; }

@media (max-width: 768px) {
  .rel-editor-panel { flex-direction: column; }

  .left-panel {
    width: 100%; min-width: unset;
    border-right: none; border-bottom: 1px solid #444;
  }

  .right-panel { min-height: 0; }

  /* 选中角色后：隐藏列表，详情全屏 */
  .rel-editor-panel.has-selection .left-panel { display: none; }

  /* 返回按钮 */
  .btn-back-mobile {
    display: inline-flex; align-items: center;
    background: none; border: 1px solid #444; color: #ccc;
    padding: 4px 10px; border-radius: 5px; cursor: pointer;
    font-size: 13px; margin-right: 4px;
  }
  .btn-back-mobile:hover { background: #333; color: #fff; }

  /* 角色信息头纵向 */
  .char-header { flex-direction: column; align-items: flex-start; padding: 10px 12px; }
  .char-info { width: 100%; }
  .char-info h3 { font-size: 16px; }

  /* 操作按钮 2×2 网格 */
  .char-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .btn-action { font-size: 11px; padding: 6px 8px; text-align: center; }

  /* 工具栏和列表紧凑化 */
  .rel-toolbar { padding: 6px 10px; }
  .rel-list { padding: 6px 10px; }
  .rel-card { padding: 8px 10px; }
  .rel-card-header { flex-direction: column; align-items: flex-start; gap: 4px; }
  .rel-card-actions { align-self: flex-end; margin-top: -20px; }

  /* 数值条标签 */
  .axis-label { width: 28px; font-size: 10px; }

  /* 搜索栏 */
  .panel-toolbar { padding: 8px; gap: 4px; }
  .filter-select { max-width: 100px; font-size: 11px; }

  /* 反向关系 */
  .reverse-section { padding: 6px 10px; }
}

/* 暗色滚动条 */
.char-list::-webkit-scrollbar,
.rel-list::-webkit-scrollbar {
  width: 6px;
}
.char-list::-webkit-scrollbar-track,
.rel-list::-webkit-scrollbar-track {
  background: transparent;
}
.char-list::-webkit-scrollbar-thumb,
.rel-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.char-list::-webkit-scrollbar-thumb:hover,
.rel-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
