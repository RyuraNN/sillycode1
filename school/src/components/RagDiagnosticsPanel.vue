<script setup>
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const collapsed = ref(true)
const expandedTraceId = ref(null)

const traces = computed(() => gameStore.ragDiagnostics?.traces || [])

const toggleTrace = (traceId) => {
  expandedTraceId.value = expandedTraceId.value === traceId ? null : traceId
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString()
}

const formatCandidate = (candidate) => {
  if (!candidate) return ''
  const floorLabel = candidate.minFloor === candidate.maxFloor
    ? `楼层${candidate.maxFloor}`
    : `楼层${candidate.minFloor}-${candidate.maxFloor}`
  const score = Number.isFinite(candidate.score) ? `${(candidate.score * 100).toFixed(1)}%` : '-'
  return `${floorLabel} · ${score} · ${candidate.preview || ''}`
}

const formatHistoryPreview = (messages) => {
  if (!messages || messages.length === 0) return ''
  return messages.map(message => `[${message.role}]\n${message.content}`).join('\n\n')
}

const copyTrace = async (traceId, mode = 'full') => {
  const text = gameStore.formatRagTraceForCopy(traceId, mode)
  if (!text) {
    alert('没有可复制的内容')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    alert('已复制到剪贴板！')
  } catch (e) {
    alert('复制失败，请手动复制')
  }
}
</script>

<template>
  <div class="rag-debug-panel">
    <button class="debug-panel-toggle" @click="collapsed = !collapsed">
      <span>🧪 RAG 调试面板</span>
      <span>{{ collapsed ? '展开' : '收起' }}</span>
    </button>

    <div v-if="!collapsed" class="debug-panel-body">
      <div class="debug-panel-toolbar">
        <span class="debug-count">最近 {{ traces.length }} 条</span>
        <button class="toolbar-btn" @click="gameStore.clearRagDiagnostics()">清空记录</button>
      </div>

      <div v-if="traces.length === 0" class="debug-empty">
        暂无 RAG 调试记录。发送一条消息后，这里会显示 query 改写、候选召回、最终记忆包等内容。
      </div>

      <div v-for="trace in traces" :key="trace.id" class="trace-card">
        <div class="trace-header" @click="toggleTrace(trace.id)">
          <div class="trace-main">
            <div class="trace-title">第 {{ trace.floor }} 轮 · {{ formatTime(trace.createdAt) }}</div>
            <div class="trace-subtitle">
              {{ trace.mainQuery || trace.contextualQuery || trace.originalQuery || '未记录查询' }}
            </div>
          </div>
          <div class="trace-meta">
            <span class="trace-status" :class="trace.status">{{ trace.status }}</span>
            <span class="trace-ms">{{ trace.totalMs ?? '-' }} ms</span>
          </div>
        </div>

        <div class="trace-actions">
          <button class="toolbar-btn" @click.stop="copyTrace(trace.id, 'full')">复制本条</button>
          <button class="toolbar-btn" @click.stop="copyTrace(trace.id, 'memory')">复制记忆包</button>
          <button class="toolbar-btn" @click.stop="copyTrace(trace.id, 'history')">复制 customHistory</button>
        </div>

        <div v-if="expandedTraceId === trace.id" class="trace-body">
          <details open>
            <summary>查询输入</summary>
            <pre class="trace-pre">原始输入：{{ trace.userInput || '-' }}

原始Query：{{ trace.originalQuery || '-' }}

上下文Query：{{ trace.contextualQuery || '-' }}

主Query：{{ trace.mainQuery || '-' }}

主动查询：{{ (trace.proactiveQueries || []).join(' | ') || '-' }}

增强查询：{{ (trace.enhancedQueries || []).join(' | ') || '-' }}</pre>
          </details>

          <details>
            <summary>Query 改写 I/O</summary>
            <pre class="trace-pre">[Rewrite Prompt / System]
{{ trace.rewritePrompt?.system || '-' }}

[Rewrite Prompt / User]
{{ trace.rewritePrompt?.user || '-' }}

[Rewrite Response]
{{ trace.rewriteResponse || '-' }}</pre>
          </details>

          <details>
            <summary>候选与 Rerank</summary>
            <pre class="trace-pre">每个 Query 的候选：
{{ (trace.perQueryCandidates || []).map(item => `${item.kind}: ${item.query}\n- ${item.candidates.map(formatCandidate).join('\n- ')}`).join('\n\n') || '-' }}

融合候选：
{{ (trace.fusedCandidates || []).map(formatCandidate).join('\n') || '-' }}

Rerank Query：{{ trace.rerankRequest?.query || '-' }}

Rerank 文档预览：
{{ (trace.rerankRequest?.documentsPreview || []).join('\n---\n') || '-' }}

Rerank 返回：
{{ trace.rerankResponse?.length ? JSON.stringify(trace.rerankResponse, null, 2) : '-' }}</pre>
          </details>

          <details>
            <summary>增强召回</summary>
            <pre class="trace-pre">[Analyzer Prompt / System]
{{ trace.analyzerPrompt?.system || '-' }}

[Analyzer Prompt / User]
{{ trace.analyzerPrompt?.user || '-' }}

[Analyzer Response]
{{ trace.analyzerResponse || '-' }}

剪枝项：{{ (trace.pruneIndexes || []).join(', ') || '-' }}</pre>
          </details>

          <details>
            <summary>最终注入</summary>
            <pre class="trace-pre">最终召回：
{{ (trace.finalSummaries || []).map(formatCandidate).join('\n') || '-' }}

[Memory Packet]
{{ trace.memoryPacket || '-' }}

[Custom History Preview]
{{ formatHistoryPreview(trace.customHistoryPreview) || '-' }}

[Final User Prompt]
{{ trace.finalUserPrompt || '-' }}</pre>
          </details>

          <details v-if="trace.errors?.length > 0">
            <summary>错误信息</summary>
            <pre class="trace-pre">{{ JSON.stringify(trace.errors, null, 2) }}</pre>
          </details>

          <details>
            <summary>阶段日志</summary>
            <pre class="trace-pre">{{ trace.steps?.length ? JSON.stringify(trace.steps, null, 2) : '-' }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rag-debug-panel {
  margin-top: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.7);
}

.debug-panel-toggle {
  width: 100%;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.debug-panel-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.debug-panel-toolbar,
.trace-actions,
.trace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.trace-header {
  cursor: pointer;
}

.trace-card {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.92);
}

.trace-main {
  min-width: 0;
  flex: 1;
}

.trace-title {
  font-size: 12px;
  font-weight: 600;
}

.trace-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.trace-status,
.trace-ms,
.debug-count {
  font-size: 11px;
}

.trace-status {
  padding: 2px 8px;
  border-radius: 999px;
  text-transform: uppercase;
}

.trace-status.success { background: rgba(76, 175, 80, 0.15); color: #2e7d32; }
.trace-status.warning { background: rgba(255, 152, 0, 0.15); color: #ef6c00; }
.trace-status.error { background: rgba(244, 67, 54, 0.15); color: #c62828; }
.trace-status.running,
.trace-status.info { background: rgba(33, 150, 243, 0.15); color: #1565c0; }

.toolbar-btn {
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.trace-body details {
  margin-top: 8px;
}

.trace-body summary {
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.trace-pre {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  line-height: 1.5;
  font-family: Consolas, Monaco, monospace;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  padding: 10px;
}

.debug-empty {
  font-size: 12px;
  color: #666;
  line-height: 1.6;
}

:global(.dark-mode) .rag-debug-panel,
:global(.dark-mode) .trace-card,
:global(.dark-mode) .toolbar-btn {
  background: rgba(26, 26, 46, 0.88);
  border-color: rgba(255, 255, 255, 0.12);
  color: #e5e7eb;
}

:global(.dark-mode) .debug-panel-toggle {
  background: rgba(255, 255, 255, 0.06);
  color: #e5e7eb;
}

:global(.dark-mode) .trace-subtitle,
:global(.dark-mode) .debug-empty {
  color: #cbd5e1;
}

:global(.dark-mode) .trace-pre {
  background: rgba(255, 255, 255, 0.05);
  color: #e5e7eb;
}
</style>
