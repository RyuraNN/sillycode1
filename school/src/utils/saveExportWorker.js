import workerSource from '../workers/saveExport.worker.js?raw'
import { compressData } from './compressionUtils'

function canUseInlineWorker() {
  return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
}

function createInlineWorker() {
  const blob = new Blob([workerSource], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  return { worker, url }
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error || '未知错误')
}

function isRangeLikeError(error) {
  const message = getErrorMessage(error)
  const name = error?.name || ''
  return message.includes('Invalid string length') || name === 'RangeError'
}

function stripChatLogForEmergencyExport(exportObj) {
  if (!Array.isArray(exportObj?.snapshots)) return

  for (const snapshot of exportObj.snapshots) {
    if (!Array.isArray(snapshot?.chatLog)) continue
    snapshot.chatLog = snapshot.chatLog.map((log) => ({
      type: log?.type,
      content: log?.content
    }))
  }
}

function serializeExportOnMainThread(exportObj, onProgress) {
  onProgress?.('serializing')

  try {
    const jsonString = JSON.stringify(exportObj)

    try {
      onProgress?.('compressing')
      const compressed = compressData(jsonString)
      onProgress?.('finalizing')

      return JSON.stringify({
        version: 4,
        compressed: true,
        data: compressed,
        timestamp: Date.now()
      })
    } catch {
      onProgress?.('fallback')
      return jsonString
    }
  } catch (error) {
    if (!isRangeLikeError(error)) {
      throw error
    }

    onProgress?.('compacting')
    stripChatLogForEmergencyExport(exportObj)
    return JSON.stringify(exportObj)
  }
}

export async function buildSaveExportData(exportObj, options = {}) {
  const { asText = false, onProgress } = options

  if (canUseInlineWorker()) {
    try {
      const buffer = await new Promise((resolve, reject) => {
        const { worker, url } = createInlineWorker()
        const requestId = `save-export-${Date.now()}-${Math.random().toString(36).slice(2)}`

        const cleanup = () => {
          worker.terminate()
          URL.revokeObjectURL(url)
        }

        worker.onmessage = (event) => {
          const data = event.data || {}
          if (data.id !== requestId) return

          if (data.type === 'stage') {
            onProgress?.(data.stage)
            return
          }

          cleanup()

          if (data.type === 'result') {
            resolve(data.buffer)
            return
          }

          reject(new Error(data.error || '导出 Worker 执行失败'))
        }

        worker.onerror = (event) => {
          cleanup()
          reject(event.error || new Error(event.message || '导出 Worker 初始化失败'))
        }

        try {
          worker.postMessage({
            id: requestId,
            type: 'export',
            payload: { exportObj }
          })
        } catch (err) {
          cleanup()
          reject(err)
        }
      })

      if (asText) {
        return new TextDecoder().decode(buffer)
      }

      return new Blob([buffer], { type: 'application/json' })
    } catch (error) {
      console.warn('[Export] Worker export failed, falling back to main thread:', error)
    }
  }

  const text = serializeExportOnMainThread(exportObj, onProgress)
  if (asText) {
    return text
  }

  return new Blob([text], { type: 'application/json' })
}
