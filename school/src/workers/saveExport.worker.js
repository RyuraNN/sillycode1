const encoder = new TextEncoder()

function postStage(id, stage) {
  self.postMessage({ id, type: 'stage', stage })
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

function wrapCompressedExport(base64) {
  return JSON.stringify({
    version: 4,
    compressed: true,
    data: base64,
    timestamp: Date.now()
  })
}

function uint8ToBase64(uint8Array) {
  const CHUNK_SIZE = 8192
  let binaryString = ''

  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const chunk = uint8Array.subarray(i, i + CHUNK_SIZE)
    binaryString += String.fromCharCode.apply(null, chunk)
  }

  return btoa(binaryString)
}

async function gzipToBase64(jsonString) {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream not supported in worker')
  }

  const inputBytes = encoder.encode(jsonString)
  const compressedStream = new Blob([inputBytes]).stream().pipeThrough(new CompressionStream('gzip'))
  const compressedBuffer = await new Response(compressedStream).arrayBuffer()
  return uint8ToBase64(new Uint8Array(compressedBuffer))
}

async function buildExportText(exportObj, id) {
  let jsonString = ''

  postStage(id, 'serializing')
  try {
    jsonString = JSON.stringify(exportObj)
  } catch (error) {
    if (!isRangeLikeError(error)) {
      throw error
    }

    postStage(id, 'compacting')
    stripChatLogForEmergencyExport(exportObj)
    jsonString = JSON.stringify(exportObj)
  }

  try {
    postStage(id, 'compressing')
    const compressed = await gzipToBase64(jsonString)
    postStage(id, 'finalizing')
    return wrapCompressedExport(compressed)
  } catch (error) {
    postStage(id, 'fallback')
    return jsonString
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {}

  if (type !== 'export') {
    return
  }

  try {
    const text = await buildExportText(payload?.exportObj, id)
    postStage(id, 'encoding')
    const bytes = encoder.encode(text)
    self.postMessage({ id, type: 'result', buffer: bytes.buffer }, [bytes.buffer])
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: getErrorMessage(error)
    })
  }
}
