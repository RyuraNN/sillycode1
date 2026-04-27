const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, ch => HTML_ESCAPE_MAP[ch])
}

export function escapeHtmlAttribute(value) {
  return escapeHtml(value)
}

export function decodeDataAttribute(value) {
  try {
    return decodeURIComponent(value || '')
  } catch {
    return value || ''
  }
}

function parseImageRefAttrs(attrsStr) {
  const attrs = {}
  const attrRegex = /(\w+)="([^"]*)"/g
  let match
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

export function renderContentWithSafeImageRefs(content, options = {}) {
  const source = String(content ?? '')
  const imageRefRegex = /<image-ref\s+([^>]+)\/?>/g
  let rendered = ''
  let lastIndex = 0
  let match

  while ((match = imageRefRegex.exec(source)) !== null) {
    rendered += escapeHtml(source.slice(lastIndex, match.index))
    rendered += renderImageRef(match[0], match[1], options)
    lastIndex = match.index + match[0].length
  }

  rendered += escapeHtml(source.slice(lastIndex))
  return rendered
}

function renderImageRef(originalTag, attrsStr, options) {
  const attrs = parseImageRefAttrs(attrsStr)
  const id = attrs.id || ''
  const prompt = attrs.prompt || ''
  const history = attrs.history || ''
  const logIndex = options.logIndex ?? ''
  const url = options.getImageUrl?.(id)

  if (url) {
    return `
      <div class="image-container" style="position: relative; display: inline-block; max-width: 100%; margin: 10px 0;">
        <img src="${escapeHtmlAttribute(url)}" class="generated-image" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: block;" />
        <div class="image-trigger"
             data-img-id="${escapeHtmlAttribute(id)}"
             data-prompt="${escapeHtmlAttribute(encodeURIComponent(prompt))}"
             data-history="${escapeHtmlAttribute(encodeURIComponent(history))}"
             data-log-index="${escapeHtmlAttribute(logIndex)}"
             data-original-tag="${escapeHtmlAttribute(encodeURIComponent(originalTag))}"
             style="position: absolute; top: 0; right: 0; width: 40%; height: 40%; z-index: 10; cursor: pointer; -webkit-tap-highlight-color: transparent;">
        </div>
      </div>`
  }

  options.queueImageLoad?.(id)
  return `<div class="image-loading-placeholder" style="padding: 20px; text-align: center; border: 1px dashed #ccc; border-radius: 8px; margin: 10px 0; background: rgba(0,0,0,0.05);">
            <span class="img-spinner"></span>
            <span style="vertical-align: middle; color: #5d4037; font-size: 0.9em;">图片加载中...</span>
          </div>`
}
