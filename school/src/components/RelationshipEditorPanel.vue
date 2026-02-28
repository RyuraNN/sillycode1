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
          <option value="inRoster">在名录中</option>
          <option value="notInRoster">不在名录中</option>
        </select>
        <button
          class="btn-batch-toggle"
          :class="{ active: charBatchMode }"
          @click="toggleCharBatchMode"
          title="批量选择角色"
        >
          ☑️
        </button>
        <button
          class="btn-clear-all"
          @click="handleClearAllRelationships"
          title="清空所有角色的关系数据"
        >
          🗑️
        </button>
      </div>

      <!-- 角色批量模式工具栏 -->
      <div v-if="charBatchMode" class="batch-toolbar-left char-batch">
        <div class="batch-info">已选 {{ charBatchSelected.size }} 个角色</div>
        <button
          class="btn-batch-select-all"
          @click="selectAllFilteredChars"
          title="全选当前筛选结果"
        >
          ☑️ 全选
        </button>
        <button
          class="btn-batch-danger"
          @click="handleBatchDeleteCharacters"
          :disabled="charBatchSelected.size === 0"
          title="删除选中角色的所有关系"
        >
          🗑️ 删除 ({{ charBatchSelected.size }})
        </button>
        <button class="btn-batch-cancel" @click="cancelCharBatchMode">
          取消
        </button>
      </div>

      <!-- 原有的幽灵角色清理按钮 -->
      <div v-else class="batch-toolbar-left">
        <button class="btn-batch-small" @click="emit('clear-all-ghosts')" title="清除所有幽灵角色">
          👻 清除所有幽灵角色
        </button>
      </div>
      <div class="char-list">
        <div
          v-for="char in filteredCharacters"
          :key="char.name"
          class="char-card"
          :class="{
            selected: selectedChar === char.name,
            ghost: char.ghost,
            'not-in-roster': !char.ghost && !char.inRoster,
            'batch-selected': charBatchMode && charBatchSelected.has(char.name)
          }"
          @click="handleCharCardClick(char)"
        >
          <!-- 批量模式复选框 -->
          <label v-if="charBatchMode" class="batch-checkbox" @click.stop>
            <input
              type="checkbox"
              :checked="charBatchSelected.has(char.name)"
              @change="toggleCharSelection(char.name)"
            />
          </label>

          <span class="gender-icon">{{ char.ghost ? '👻' : (char.gender === 'male' ? '♂' : char.gender === 'female' ? '♀' : '?') }}</span>
          <span class="char-name">{{ char.name }}</span>
          <span class="char-origin-tag" v-if="char.origin">{{ cleanOrigin(char.origin) }}</span>

          <!-- 未在名录中的标记 -->
          <span v-if="!char.ghost && !char.inRoster" class="not-in-roster-badge" title="不在名录中">📋</span>

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
            <button class="btn-action btn-add" @click="emit('add-relationship', selectedChar)" title="添加关系">➕ 添加</button>
            <button class="btn-action" :class="batchMode ? 'btn-active' : 'btn-batch'" @click="toggleBatchMode" title="批量选择">☑️ 批量</button>
            <button v-if="batchMode && batchSelected.size > 0" class="btn-action btn-danger" @click="handleBatchDelete" title="删除选中">🗑️ 删除({{ batchSelected.size }})</button>
            <button class="btn-action btn-clear" @click="emit('clear-char-relations', selectedChar)" title="清空所有关系">🗑️ 清空关系</button>
            <button class="btn-action btn-warn" @click="emit('clear-char-impressions', selectedChar)" title="清除印象标签">🏷️ 清除印象</button>
            <button class="btn-action btn-danger" @click="emit('remove-character', selectedChar)" title="完全移除角色">⚠️ 移除角色</button>
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
          <div v-for="rel in sortedRelations" :key="rel.target" class="rel-card" :class="{ 'batch-selected': batchMode && batchSelected.has(rel.target) }">
            <div class="rel-card-header">
              <label v-if="batchMode" class="batch-checkbox" @click.stop>
                <input type="checkbox" :checked="batchSelected.has(rel.target)" @change="toggleRelSelection(rel.target)" />
              </label>
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
                <button class="btn-sm btn-edit" @click="emit('edit-relationship', selectedChar, rel.target)">✏️</button>
                <button class="btn-sm btn-del" @click="emit('delete-relationship', selectedChar, rel.target)">🗑️</button>
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
            <button class="btn-action btn-danger" @click="emit('clear-ghost-references', selectedChar)">🗑️ 清除所有引用</button>
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
  npcRelationships: { type: Object, default: () => ({}) },
  allClassData: { type: Object, default: () => ({}) },
  characterPool: { type: Array, default: () => [] },
  currentRosterState: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'edit-relationship', 'delete-relationship', 'add-relationship',
  'clear-char-relations', 'clear-char-impressions', 'remove-character',
  'clear-ghost-references', 'clear-all-ghosts', 'batch-delete-relationships',
  'batch-delete-characters', 'clear-all-relationships'  // 新增
])

const searchQuery = ref('')
const filterMode = ref('inRoster')
const selectedChar = ref('')
const relSearchQuery = ref('')
const relSortBy = ref('name')
const showReverse = ref(false)
const batchMode = ref(false)
const batchSelected = ref(new Set())

// 角色级别批量模式
const charBatchMode = ref(false)
const charBatchSelected = ref(new Set())

const axisNames = { intimacy: '亲密', trust: '信赖', passion: '激情', hostility: '敌意' }

/**
 * 检查角色是否在名录中（已勾选）
 * 优先级：
 * 1. 检查 role 字段（如果存在）
 * 2. 检查是否在班级中被勾选
 * 3. 检查是否是教师（通过 allClassData）
 */
function isCharInRoster(charName) {
  // 优先检查 characterPool 中的 role 字段
  if (props.characterPool && Array.isArray(props.characterPool)) {
    const char = props.characterPool.find(c => c.name === charName)
    if (char && char.role) {
      // 学生和教师算在名录中，校外人员不算
      if (char.role === 'student' || char.role === 'teacher') {
        return true
      }
      if (char.role === 'external') {
        return false
      }
      // 其他 role（如 'staff'）继续后续检查
    }
  }

  // 如果没有 characterPool 或找不到角色，检查 allClassData
  if (props.allClassData) {
    for (const classData of Object.values(props.allClassData)) {
      // 检查是否是教师
      if (classData.headTeacher?.name === charName) {
        if (classData.headTeacher.role === 'external') return false
        return true
      }
      if (classData.teachers?.some(t => t.name === charName)) {
        const teacher = classData.teachers.find(t => t.name === charName)
        if (teacher?.role === 'external') return false
        return true
      }

      // 检查是否是学生
      if (classData.students?.some(s => s.name === charName)) {
        const student = classData.students.find(s => s.name === charName)
        if (student?.role === 'external') return false
        return true
      }
    }
  }

  // 检查是否在名录状态中被勾选
  if (props.currentRosterState && Object.keys(props.currentRosterState).length > 0) {
    for (const [classId, students] of Object.entries(props.currentRosterState)) {
      if (students[charName] === true) {
        return true
      }
    }
    return false
  }

  // 无名录状态时，默认所有角色都在名录中
  return true
}

// 角色列表（含幽灵角色）
const allCharacters = computed(() => {
  const rels = props.npcRelationships || {}
  const topKeys = new Set(Object.keys(rels))

  // 构建 name -> origin 映射
  const originMap = {}
  // 从 characterPool 获取
  if (props.characterPool) {
    for (const c of props.characterPool) {
      if (c.name && c.origin) originMap[c.name] = c.origin
    }
  }
  // 从 allClassData 补充
  if (props.allClassData) {
    for (const classInfo of Object.values(props.allClassData)) {
      const persons = [
        ...(classInfo.headTeacher ? [classInfo.headTeacher] : []),
        ...(classInfo.teachers || []),
        ...(classInfo.students || [])
      ]
      for (const p of persons) {
        if (p.name && p.origin && !originMap[p.name]) originMap[p.name] = p.origin
      }
    }
  }

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
    origin: originMap[name] || '',
    relCount: Object.keys(rels[name]?.relations || {}).length,
    ghost: false,
    refCount: 0,
    inRoster: isCharInRoster(name)
  }))

  const ghosts = Object.entries(ghostRefCount).map(([name, count]) => ({
    name,
    gender: 'unknown',
    origin: originMap[name] || '',
    relCount: 0,
    ghost: true,
    refCount: count,
    inRoster: false
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
  else if (filterMode.value === 'inRoster') list = list.filter(c => !c.ghost && c.inRoster)
  else if (filterMode.value === 'notInRoster') list = list.filter(c => !c.ghost && !c.inRoster)
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

function cleanOrigin(origin) {
  if (!origin) return ''
  const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
  return match ? match[1] : origin
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) batchSelected.value = new Set()
}

function toggleRelSelection(target) {
  const s = new Set(batchSelected.value)
  if (s.has(target)) s.delete(target)
  else s.add(target)
  batchSelected.value = s
}

function handleBatchDelete() {
  if (batchSelected.value.size === 0) return
  const pairs = Array.from(batchSelected.value).map(target => ({
    source: selectedChar.value,
    target
  }))
  emit('batch-delete-relationships', pairs)
  batchSelected.value = new Set()
  batchMode.value = false
}

// 角色批量操作函数
function toggleCharBatchMode() {
  charBatchMode.value = !charBatchMode.value
  if (!charBatchMode.value) {
    charBatchSelected.value = new Set()
  }
}

function cancelCharBatchMode() {
  charBatchMode.value = false
  charBatchSelected.value = new Set()
}

function toggleCharSelection(charName) {
  const s = new Set(charBatchSelected.value)
  if (s.has(charName)) {
    s.delete(charName)
  } else {
    s.add(charName)
  }
  charBatchSelected.value = s
}

function handleCharCardClick(char) {
  if (charBatchMode.value) {
    toggleCharSelection(char.name)
  } else {
    selectedChar.value = char.name
  }
}

function handleBatchDeleteCharacters() {
  const count = charBatchSelected.value.size
  if (count === 0) return

  const charList = Array.from(charBatchSelected.value).slice(0, 10).join('、')
  const displayList = count > 10 ? charList + '...' : charList

  if (!confirm(`⚠️ 确定批量删除 ${count} 个角色的所有关系？\n\n${displayList}\n\n这将删除这些角色的所有关系数据（包括作为源和目标的关系）。`)) {
    return
  }

  emit('batch-delete-characters', Array.from(charBatchSelected.value))
  charBatchSelected.value = new Set()
  charBatchMode.value = false
}

function selectAllFilteredChars() {
  const s = new Set(charBatchSelected.value)
  for (const char of filteredCharacters.value) {
    if (!char.ghost) {  // 排除幽灵角色
      s.add(char.name)
    }
  }
  charBatchSelected.value = s
}

function handleClearAllRelationships() {
  const count = allCharacters.value.filter(c => !c.ghost && c.relCount > 0).length

  if (count === 0) {
    alert('当前没有任何关系数据')
    return
  }

  if (!confirm(`⚠️ 确定清空所有角色的关系数据？\n\n这将删除 ${count} 个角色的所有关系，此操作不可撤销！`)) {
    return
  }

  emit('clear-all-relationships')
}
</script>

<style scoped>
.rel-editor-panel { display: flex; height: 100%; overflow: hidden; flex: 1; min-height: 0; touch-action: pan-y; }
/* 左侧面板 */
.left-panel {
  width: 260px; min-width: 220px; border-right: 1px solid #444;
  display: flex; flex-direction: column; background: #1e1e1e;
  touch-action: pan-y;
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
.char-list { flex: 1; overflow-y: auto; padding: 6px; touch-action: pan-y; -webkit-overflow-scrolling: touch; }
.char-card {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 6px; cursor: pointer; transition: background 0.15s;
  margin-bottom: 2px; touch-action: manipulation;
}
.char-card:hover { background: #2a2a2a; }
.char-card.selected { background: #2a3a2a; border: 1px solid #4CAF50; }
.gender-icon { font-size: 14px; width: 18px; text-align: center; }
.gender-icon.large { font-size: 22px; width: 28px; }
.char-card .char-name { flex: 1; color: #ddd; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-origin-tag { font-size: 11px; color: #888; background: #2a2a2a; padding: 1px 5px; border-radius: 3px; white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
.rel-badge {
  background: #4CAF50; color: #fff; font-size: 11px; padding: 1px 6px;
  border-radius: 10px; min-width: 18px; text-align: center;
}
.panel-footer {
  padding: 8px 12px; border-top: 1px solid #333; color: #666; font-size: 12px;
  flex-shrink: 0;
}
/* 右侧面板 */
.right-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; touch-action: pan-y; }
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
.btn-active { border-color: #6366f1; background: #2a2a4a; color: #818cf8; }
.btn-batch { border-color: #666; }
.batch-checkbox { display: flex; align-items: center; margin-right: 4px; }
.batch-checkbox input { width: 16px; height: 16px; cursor: pointer; accent-color: #6366f1; }
.rel-card.batch-selected { border-color: #6366f1; background: rgba(99, 102, 241, 0.08); }
/* 批量操作工具栏 */
.batch-toolbar {
  padding: 8px 16px; border-bottom: 1px solid #333; flex-shrink: 0;
  display: flex; gap: 8px; background: rgba(255, 152, 0, 0.05);
}
.btn-batch {
  padding: 6px 12px; background: #FF9800; color: white;
  border: none; border-radius: 5px; cursor: pointer;
  font-size: 12px; transition: all 0.15s;
}
.btn-batch:hover { background: #F57C00; }

/* 左侧批量操作工具栏 */
.batch-toolbar-left {
  padding: 6px 10px; border-bottom: 1px solid #333; flex-shrink: 0;
  display: flex; gap: 6px; background: rgba(255, 152, 0, 0.05);
}
.btn-batch-small {
  padding: 5px 10px; background: #FF9800; color: white;
  border: none; border-radius: 5px; cursor: pointer;
  font-size: 11px; transition: all 0.15s; width: 100%;
}
.btn-batch-small:hover { background: #F57C00; }

/* 关系工具栏 */
.rel-toolbar {
  display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid #333; flex-shrink: 0;
}
/* 关系列表 */
.rel-list { flex: 1; overflow-y: auto; padding: 8px 16px; touch-action: pan-y; -webkit-overflow-scrolling: touch; }
.rel-card {
  background: #2a2a2a; border: 1px solid #333; border-radius: 8px;
  padding: 10px 12px; margin-bottom: 8px; transition: border-color 0.15s;
  touch-action: manipulation;
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

.btn-clear-all {
  padding: 6px 10px;
  background: #d32f2f;
  border: 1px solid #d32f2f;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  min-width: 32px;
}

.btn-clear-all:hover {
  background: #b71c1c;
}

.btn-batch-select-all {
  padding: 5px 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.btn-batch-select-all:hover {
  background: #45a049;
}

/* 宽屏隐藏返回按钮 */
.btn-back-mobile { display: none; }

@media (max-width: 768px) {
  .rel-editor-panel { flex-direction: column; }

  .left-panel {
    width: 100%; min-width: unset;
    border-right: none; border-bottom: 1px solid #444;
    flex: 1;
    min-height: 0;
  }

  .right-panel { min-height: 0; flex: 1; }

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

/* 角色批量模式样式 */
.char-batch {
  background: rgba(244, 67, 54, 0.08);
  border-bottom: 2px solid #F44336;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
}

.batch-info {
  flex: 1;
  color: #F44336;
  font-weight: 600;
  font-size: 12px;
}

.btn-batch-danger {
  padding: 5px 10px;
  background: #F44336;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.btn-batch-danger:hover:not(:disabled) {
  background: #D32F2F;
}

.btn-batch-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-batch-cancel {
  padding: 5px 10px;
  background: #666;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.btn-batch-cancel:hover {
  background: #888;
}

.btn-batch-toggle {
  padding: 6px 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  color: #ccc;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  min-width: 32px;
}

.btn-batch-toggle:hover {
  background: #333;
}

.btn-batch-toggle.active {
  background: #F44336;
  border-color: #F44336;
  color: white;
}

.char-card.batch-selected {
  border-color: #F44336;
  background: rgba(244, 67, 54, 0.1);
}

.char-card.not-in-roster {
  opacity: 0.6;
  border-left: 3px solid #666;
}

.not-in-roster-badge {
  font-size: 10px;
  opacity: 0.7;
  margin-left: auto;
}

.batch-checkbox {
  display: flex;
  align-items: center;
  margin-right: 6px;
  cursor: pointer;
  touch-action: manipulation;
}

.batch-checkbox input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
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
