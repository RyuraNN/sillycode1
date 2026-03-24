/**
 * RAG 运行态诊断 Actions
 * 仅保存在当前运行内存中，不写入存档、快照或导出
 */

import type { RagTraceEntry, RagTraceStep, RagTraceHistoryMessage } from '../gameStoreTypes'

const MAX_TRACE_TEXT_LENGTH = 6000

function clampText(value: unknown, max = MAX_TRACE_TEXT_LENGTH): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text
}

function sanitizeValue(value: any, depth = 0): any {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return clampText(value)
  if (typeof value !== 'object') return value
  if (depth > 6) return clampText(JSON.stringify(value))

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeValue(item, depth + 1))
  }

  const result: Record<string, any> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = sanitizeValue(item, depth + 1)
  }
  return result
}

function findTraceIndex(traces: RagTraceEntry[], traceId: string): number {
  return traces.findIndex(trace => trace.id === traceId)
}

function formatHistoryPreview(messages?: RagTraceHistoryMessage[]): string {
  if (!messages || messages.length === 0) return ''
  return messages
    .map(message => `[${message.role}]\n${message.content}`)
    .join('\n\n')
}

export const ragDiagnosticsActions = {
  startRagTrace(this: any, payload: Partial<RagTraceEntry> = {}) {
    if (!this._ui.ragDiagnostics) {
      this._ui.ragDiagnostics = { traces: [], activeTraceId: null, maxEntries: 15 }
    }

    const traceId = payload.id || `rag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const trace: RagTraceEntry = {
      id: traceId,
      createdAt: Date.now(),
      floor: Number(payload.floor) || this.meta.currentFloor || 0,
      userInput: clampText(payload.userInput || ''),
      cacheHit: !!payload.cacheHit,
      status: payload.status || 'running',
      totalMs: payload.totalMs,
      errors: Array.isArray(payload.errors) ? payload.errors.map(error => sanitizeValue(error)) : [],
      steps: Array.isArray(payload.steps) ? payload.steps.map(step => sanitizeValue(step)) : []
    }

    Object.assign(trace, sanitizeValue(payload))
    trace.id = traceId
    trace.steps = trace.steps || []
    trace.errors = trace.errors || []

    this._ui.ragDiagnostics.traces.unshift(trace)
    this._ui.ragDiagnostics.traces = this._ui.ragDiagnostics.traces.slice(0, this._ui.ragDiagnostics.maxEntries || 15)
    this._ui.ragDiagnostics.activeTraceId = traceId
    return traceId
  },

  updateRagTrace(this: any, traceId: string | null, patch: Partial<RagTraceEntry> = {}) {
    if (!traceId || !this._ui.ragDiagnostics?.traces) return
    const index = findTraceIndex(this._ui.ragDiagnostics.traces, traceId)
    if (index < 0) return

    const trace = this._ui.ragDiagnostics.traces[index]
    Object.assign(trace, sanitizeValue(patch))
  },

  appendRagTraceStep(this: any, traceId: string | null, step: Partial<RagTraceStep>) {
    if (!traceId || !this._ui.ragDiagnostics?.traces) return
    const index = findTraceIndex(this._ui.ragDiagnostics.traces, traceId)
    if (index < 0) return

    const trace = this._ui.ragDiagnostics.traces[index]
    const nextStep: RagTraceStep = {
      id: step.id || `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      stage: step.stage || 'unknown',
      title: step.title || step.stage || 'RAG Step',
      status: step.status || 'info',
      detail: step.detail ? clampText(step.detail) : undefined,
      data: step.data ? sanitizeValue(step.data) : undefined,
      timestamp: step.timestamp || Date.now()
    }
    trace.steps.push(nextStep)
  },

  finishRagTrace(this: any, traceId: string | null, patch: Partial<RagTraceEntry> = {}) {
    if (!traceId) return
    this.updateRagTrace(traceId, patch)
    const index = findTraceIndex(this._ui.ragDiagnostics?.traces || [], traceId)
    if (index >= 0) {
      const trace = this._ui.ragDiagnostics.traces[index]
      if (trace.status === 'running') {
        trace.status = trace.errors?.length > 0 ? 'warning' : 'success'
      }
    }
    if (this._ui.ragDiagnostics?.activeTraceId === traceId) {
      this._ui.ragDiagnostics.activeTraceId = null
    }
  },

  clearRagDiagnostics(this: any) {
    if (!this._ui.ragDiagnostics) {
      this._ui.ragDiagnostics = { traces: [], activeTraceId: null, maxEntries: 15 }
      return
    }
    this._ui.ragDiagnostics.traces = []
    this._ui.ragDiagnostics.activeTraceId = null
  },

  formatRagTraceForCopy(this: any, traceId: string, mode: 'full' | 'memory' | 'history' = 'full') {
    const trace = (this._ui.ragDiagnostics?.traces || []).find((item: RagTraceEntry) => item.id === traceId)
    if (!trace) return ''

    if (mode === 'memory') {
      return trace.memoryPacket || ''
    }

    if (mode === 'history') {
      return formatHistoryPreview(trace.customHistoryPreview)
    }

    const lines = [
      `# RAG Trace ${trace.id}`,
      `时间: ${new Date(trace.createdAt).toLocaleString()}`,
      `楼层: ${trace.floor}`,
      `状态: ${trace.status}`,
      `耗时: ${trace.totalMs ?? '-'} ms`,
      `CacheHit: ${trace.cacheHit ? 'yes' : 'no'}`,
      '',
      '## 用户输入',
      trace.userInput || '',
      '',
      '## 查询信息',
      `originalQuery: ${trace.originalQuery || ''}`,
      `contextualQuery: ${trace.contextualQuery || ''}`,
      `mainQuery: ${trace.mainQuery || ''}`,
      trace.proactiveQueries?.length ? `proactiveQueries: ${trace.proactiveQueries.join(' | ')}` : 'proactiveQueries: ',
      trace.enhancedQueries?.length ? `enhancedQueries: ${trace.enhancedQueries.join(' | ')}` : 'enhancedQueries: '
    ]

    if (trace.memoryPacket) {
      lines.push('', '## 记忆包', trace.memoryPacket)
    }

    if (trace.customHistoryPreview?.length) {
      lines.push('', '## Custom History', formatHistoryPreview(trace.customHistoryPreview))
    }

    if (trace.errors?.length) {
      lines.push('', '## Errors', JSON.stringify(trace.errors, null, 2))
    }

    if (trace.steps?.length) {
      lines.push('', '## Steps', JSON.stringify(trace.steps, null, 2))
    }

    return lines.join('\n')
  }
}
