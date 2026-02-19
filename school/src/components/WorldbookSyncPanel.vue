<!-- 世界书同步面板 - 拉取对比 + 冲突解决 + 合并写回 -->
<script setup>
import { ref, watch, computed } from 'vue'
import { fetchAndDiffAll, applyResolvedDiffs, formatValueForDisplay } from '../utils/worldbookDiff'
import { isWorldbookAvailable } from '../utils/worldbookHelper'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['close'])

// 状态机: idle → loading → reviewing | empty | error → applying → done
const state = ref('idle')
const diffs = ref([])
const errorMsg = ref('')

const CATEGORY_META = {
  classes: { icon: '📚', label: '班级' },
  clubs: { icon: '🎯', label: '社团' },
  academic: { icon: '📊', label: '学力' },
  coursePool: { icon: '📝', label: '课程池' }
}

// 按 category 分组
const groupedDiffs = computed(() => {
  const groups = {}
  for (const d of diffs.value) {
    if (!groups[d.category]) groups[d.category] = []
    groups[d.category].push(d)
  }
  return groups
})

const worldbookCount = computed(() => diffs.value.filter(d => d.choice === 'worldbook').length)

function close() {
  if (state.value === 'applying') return
  state.value = 'idle'
  emit('close')
}

async function startSync() {
  if (!isWorldbookAvailable()) {
    state.value = 'error'
    errorMsg.value = '世界书 API 不可用，请确认在 SillyTavern 环境中运行。'
    return
  }
  state.value = 'loading'
  errorMsg.value = ''
  diffs.value = []

  try {
    const result = await fetchAndDiffAll()
    if (result.error && result.diffs.length === 0) {
      state.value = 'error'
      errorMsg.value = result.error
      return
    }
    if (result.error) {
      errorMsg.value = result.error
    }
    diffs.value = result.diffs
    state.value = diffs.value.length > 0 ? 'reviewing' : 'empty'
  } catch (e) {
    state.value = 'error'
    errorMsg.value = '拉取失败: ' + (e.message || e)
  }
}

function chooseAll(choice) {
  diffs.value.forEach(d => { d.choice = choice })
}

async function applyChanges() {
  state.value = 'applying'
  try {
    await applyResolvedDiffs(diffs.value)
    state.value = 'done'
    setTimeout(() => close(), 2000)
  } catch (e) {
    state.value = 'error'
    errorMsg.value = '写入失败: ' + (e.message || e)
  }
}

function formatVal(val) {
  return formatValueForDisplay(val)
}

watch(() => props.visible, (v) => {
  if (v) startSync()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="sync-overlay" @click.self="close">
      <div class="sync-panel">
        <!-- 标题栏 -->
        <div class="sync-header">
          <span class="sync-title">📖 同步世界书</span>
          <button class="sync-close-btn" @click="close">✕</button>
        </div>

        <!-- loading -->
        <div v-if="state === 'loading'" class="sync-body sync-center">
          <div class="sync-spinner"></div>
          <p>正在读取世界书数据并对比差异…</p>
        </div>

        <!-- error -->
        <div v-else-if="state === 'error'" class="sync-body sync-center">
          <p class="sync-error-icon">⚠️</p>
          <p class="sync-error-text">{{ errorMsg }}</p>
          <button class="sync-btn sync-btn-retry" @click="startSync">重试</button>
        </div>

        <!-- empty -->
        <div v-else-if="state === 'empty'" class="sync-body sync-center">
          <p class="sync-ok-icon">✅</p>
          <p>当前数据与世界书完全一致，无需同步。</p>
          <p v-if="errorMsg" class="sync-warn-text">{{ errorMsg }}</p>
        </div>

        <!-- reviewing -->
        <div v-else-if="state === 'reviewing'" class="sync-body">
          <!-- 快捷操作栏 -->
          <div class="sync-toolbar">
            <span class="sync-diff-count">共 {{ diffs.length }} 处差异</span>
            <div class="sync-toolbar-actions">
              <button class="sync-btn sync-btn-sm sync-btn-wb" @click="chooseAll('worldbook')">全部使用世界书</button>
              <button class="sync-btn sync-btn-sm sync-btn-cur" @click="chooseAll('current')">全部保留当前</button>
            </div>
          </div>
          <p v-if="errorMsg" class="sync-warn-text" style="padding:0 20px">{{ errorMsg }}</p>

          <!-- 按 category 分组 -->
          <div class="sync-diff-list">
            <div v-for="(items, cat) in groupedDiffs" :key="cat" class="sync-category">
              <div class="sync-cat-title">{{ CATEGORY_META[cat]?.icon }} {{ CATEGORY_META[cat]?.label || cat }}（{{ items.length }}）</div>
              <div v-for="(d, idx) in items" :key="cat + idx" class="sync-diff-card">
                <div class="sync-diff-header">
                  <span class="sync-entity">{{ d.entityLabel }}</span>
                  <span class="sync-field">{{ d.fieldLabel }}</span>
                </div>
                <div class="sync-diff-choices">
                  <div class="sync-choice" :class="{ selected: d.choice === 'current' }" @click="d.choice = 'current'">
                    <div class="sync-choice-label">当前内存</div>
                    <div class="sync-choice-val">{{ formatVal(d.current) }}</div>
                  </div>
                  <div class="sync-choice sync-choice-wb" :class="{ selected: d.choice === 'worldbook' }" @click="d.choice = 'worldbook'">
                    <div class="sync-choice-label">世界书</div>
                    <div class="sync-choice-val">{{ formatVal(d.worldbook) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="sync-footer">
            <button class="sync-btn sync-btn-cancel" @click="close">取消</button>
            <button class="sync-btn sync-btn-apply" @click="applyChanges">确认同步（{{ worldbookCount }}项使用世界书）</button>
          </div>
        </div>

        <!-- applying -->
        <div v-else-if="state === 'applying'" class="sync-body sync-center">
          <div class="sync-spinner"></div>
          <p>正在写入…</p>
        </div>

        <!-- done -->
        <div v-else-if="state === 'done'" class="sync-body sync-center">
          <p class="sync-ok-icon">✅</p>
          <p>同步完成！</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sync-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}
.sync-panel {
  background: #1e1e1e;
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  overflow: hidden;
}
.sync-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #2a2a2a;
  border-bottom: 1px solid #444;
}
.sync-title { color: #fff; font-size: 18px; font-weight: 600; }
.sync-close-btn {
  background: none; border: none; color: #999; font-size: 20px; cursor: pointer;
  width: 32px; height: 32px; border-radius: 6px; transition: all 0.2s;
}
.sync-close-btn:hover { background: #444; color: #fff; }
.sync-body { flex: 1; overflow-y: auto; }
.sync-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; color: #ccc; gap: 12px; }
.sync-spinner {
  width: 36px; height: 36px; border: 3px solid #444; border-top-color: #64B5F6;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.sync-error-icon { font-size: 36px; margin: 0; }
.sync-error-text { color: #ef5350; text-align: center; }
.sync-ok-icon { font-size: 36px; margin: 0; }
.sync-warn-text { color: #FFA726; font-size: 13px; }
.sync-btn {
  padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
  font-size: 14px; font-weight: 500; transition: all 0.2s;
}
.sync-btn-retry { background: #42A5F5; color: #fff; }
.sync-btn-retry:hover { background: #1E88E5; }
.sync-btn-sm { padding: 5px 12px; font-size: 13px; }
.sync-btn-wb { background: #1565C0; color: #fff; }
.sync-btn-wb:hover { background: #0D47A1; }
.sync-btn-cur { background: #555; color: #fff; }
.sync-btn-cur:hover { background: #666; }
.sync-btn-cancel { background: #444; color: #ccc; }
.sync-btn-cancel:hover { background: #555; }
.sync-btn-apply { background: #43A047; color: #fff; }
.sync-btn-apply:hover { background: #2E7D32; }

.sync-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: #252525; border-bottom: 1px solid #333;
  position: sticky; top: 0; z-index: 1;
}
.sync-diff-count { color: #aaa; font-size: 14px; }
.sync-toolbar-actions { display: flex; gap: 8px; }
.sync-diff-list { padding: 12px 16px; }
.sync-category { margin-bottom: 16px; }
.sync-cat-title { color: #fff; font-size: 15px; font-weight: 600; margin-bottom: 8px; padding: 4px 0; }
.sync-diff-card {
  background: #2a2a2a; border-radius: 10px; padding: 12px; margin-bottom: 8px;
  border: 1px solid #333;
}
.sync-diff-header { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.sync-entity { color: #fff; font-weight: 500; font-size: 14px; }
.sync-field { color: #888; font-size: 13px; }
.sync-diff-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sync-choice {
  padding: 8px 10px; border-radius: 8px; border: 2px solid #444;
  cursor: pointer; transition: all 0.2s; background: #1e1e1e;
}
.sync-choice:hover { border-color: #666; }
.sync-choice.selected { border-color: #42A5F5; background: rgba(66,165,245,0.08); }
.sync-choice-wb .sync-choice-val { color: #64B5F6; }
.sync-choice-label { font-size: 11px; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.sync-choice-val {
  font-size: 13px; color: #ddd; word-break: break-all;
  max-height: 80px; overflow-y: auto; white-space: pre-wrap;
}
.sync-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; background: #252525; border-top: 1px solid #333;
}
@media (max-width: 600px) {
  .sync-panel { max-width: 100%; max-height: 100vh; border-radius: 0; }
  .sync-diff-choices { grid-template-columns: 1fr; }
}
</style>
