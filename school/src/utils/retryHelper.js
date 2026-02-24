/**
 * 自动重试系统工具
 * 提供错误解析和重试执行器
 */

/**
 * 解析错误信息，提取友好提示
 * @param {Error|string} error 错误对象或字符串
 * @returns {{code: number, friendlyMessage: string, detail: string}}
 */
export function parseErrorMessage(error) {
  const msg = error?.message || String(error)

  // 解析 "API Error: 429 - {...}" 格式
  const apiMatch = msg.match(/API Error:\s*(\d+)\s*-\s*(.*)/)
  if (apiMatch) {
    const code = parseInt(apiMatch[1])
    const detail = apiMatch[2]
    const codeMessages = {
      400: '请求格式错误',
      401: '认证失败，请检查 API Key',
      403: '权限不足',
      404: '接口不存在，请检查 API 地址',
      429: '请求过于频繁，已被限流',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务暂时不可用',
      504: '网关超时'
    }
    return {
      code,
      friendlyMessage: codeMessages[code] || `HTTP ${code}`,
      detail: detail.substring(0, 200)
    }
  }

  // 网络错误
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
    return { code: 0, friendlyMessage: '网络连接失败', detail: msg }
  }

  // Embedding/Rerank 特定错误
  if (msg.includes('Embedding API')) {
    return { code: -1, friendlyMessage: 'Embedding API 错误', detail: msg }
  }
  if (msg.includes('Rerank API')) {
    return { code: -1, friendlyMessage: 'Rerank API 错误', detail: msg }
  }

  return { code: -1, friendlyMessage: '未知错误', detail: msg.substring(0, 200) }
}

/**
 * 带重试的异步执行器
 * @param {Function} fn 要执行的异步函数
 * @param {Object} options 配置选项
 * @param {number} [options.maxRetries=3] 最大重试次数
 * @param {number} [options.retryDelay=2000] 重试延迟（毫秒）
 * @param {Function} [options.onRetry] 重试回调 (attempt, error) => void
 * @param {Function} [options.shouldRetry] 判断是否应该重试 (error) => boolean
 * @returns {Promise<any>} 执行结果
 */
export async function withRetry(fn, options = {}) {
  const { maxRetries = 3, retryDelay = 2000, onRetry, shouldRetry } = options
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      lastError._parsed = parseErrorMessage(error)

      // 如果已达到最大重试次数，抛出错误
      if (attempt >= maxRetries) break

      // 如果提供了 shouldRetry 函数且返回 false，停止重试
      if (shouldRetry && !shouldRetry(lastError)) break

      // 触发重试回调
      if (onRetry) onRetry(attempt + 1, lastError)

      // 等待后重试
      await new Promise(r => setTimeout(r, retryDelay))
    }
  }

  // 所有重试都失败，抛出最后一个错误
  throw lastError
}

/**
 * 格式化错误信息用于显示
 * @param {Error} error 带有 _parsed 属性的错误对象
 * @returns {string} 格式化后的错误信息
 */
export function formatErrorForDisplay(error) {
  if (!error._parsed) {
    error._parsed = parseErrorMessage(error)
  }

  const { friendlyMessage, detail, code } = error._parsed

  if (code > 0) {
    return `${friendlyMessage} (${code})\n${detail}`
  }
  return `${friendlyMessage}\n${detail}`
}
