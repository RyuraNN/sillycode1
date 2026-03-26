/**
 * aiProviders.js - 多模型提供商适配器
 * 支持 OpenAI / DeepSeek / KIMI / MiniMax / 豆包 / GLM / Claude
 */

export const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3-mini'],
    format: 'openai',
    placeholder: 'sk-...',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    format: 'openai',
    placeholder: 'sk-...',
  },
  kimi: {
    label: 'KIMI (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.5', 'moonshot-v1-auto', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    format: 'openai',
    placeholder: 'sk-...',
  },
  minimax: {
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    models: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'],
    format: 'openai',
    placeholder: 'eyJ...',
  },
  doubao: {
    label: '豆包 (Doubao)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-1.5-pro-256k', 'doubao-1.5-pro-32k', 'doubao-1.5-lite-32k', 'doubao-1.5-thinking-pro'],
    format: 'openai',
    placeholder: '接入点ID 或 API Key',
    note: '模型名也可使用火山方舟的接入点 ID (ep-xxx)',
  },
  glm: {
    label: 'GLM (智谱AI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-flash', 'glm-4-flashx', 'glm-4-long'],
    format: 'openai',
    placeholder: 'API Key',
  },
  claude: {
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    format: 'claude',
    placeholder: 'sk-ant-...',
  },
  gemini: {
    label: 'Gemini (Google AI)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    format: 'openai',
    placeholder: 'AIza...',
  },
  vertex: {
    label: 'Vertex AI (Google Cloud)',
    baseUrl: '',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    format: 'openai',
    placeholder: 'Google Cloud Access Token',
    vertexFields: true,
    regions: ['global', 'us-central1', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-southeast1'],
  },
  custom: {
    label: '自定义 (OpenAI兼容)',
    baseUrl: '',
    models: [],
    format: 'openai',
    placeholder: 'API Key',
  },
}

/**
 * 根据 Vertex 项目ID和接入点构建 API 地址
 */
export function buildVertexApiUrl(projectId, region = 'global') {
  if (!projectId) return ''
  const r = region || 'global'
  const host = r === 'global'
    ? 'aiplatform.googleapis.com'
    : `${r}-aiplatform.googleapis.com`
  return `https://${host}/v1beta1/projects/${projectId}/locations/${r}/endpoints/openapi`
}

/**
 * 获取提供商列表（用于 UI 下拉框）
 */
export function getProviderList() {
  return Object.entries(PROVIDER_PRESETS).map(([key, preset]) => ({
    key,
    label: preset.label,
  }))
}

/**
 * 切换渠道时保存当前渠道配置，加载目标渠道配置
 * @param {Object} assistantAI - gameStore.settings.assistantAI 的引用
 * @param {string} oldProvider - 切换前的渠道 key
 * @param {string} newProvider - 切换后的渠道 key
 * @returns {Array<{id: string}>} 模型列表（用于 UI 下拉）
 */
export function switchProviderConfig(assistantAI, oldProvider, newProvider) {
  // 1. 保存旧渠道的配置
  if (!assistantAI.channelConfigs) assistantAI.channelConfigs = {}
  if (oldProvider) {
    const cfg = {
      apiUrl: assistantAI.apiUrl || '',
      apiKey: assistantAI.apiKey || '',
      model: assistantAI.model || '',
    }
    // 保存 vertex 专属字段
    if (oldProvider === 'vertex') {
      cfg.vertexProjectId = assistantAI.vertexProjectId || ''
      cfg.vertexRegion = assistantAI.vertexRegion || 'global'
    }
    assistantAI.channelConfigs[oldProvider] = cfg
  }

  // 2. 加载目标渠道的已保存配置
  const saved = assistantAI.channelConfigs[newProvider]
  const preset = PROVIDER_PRESETS[newProvider] || PROVIDER_PRESETS.custom

  if (saved) {
    // 有已保存配置 → 恢复
    assistantAI.apiUrl = saved.apiUrl
    assistantAI.apiKey = saved.apiKey
    assistantAI.model = saved.model
    if (newProvider === 'vertex') {
      assistantAI.vertexProjectId = saved.vertexProjectId || ''
      assistantAI.vertexRegion = saved.vertexRegion || 'global'
    }
  } else {
    // 无已保存配置 → 用预设默认值，不填 apiKey
    assistantAI.apiUrl = preset.baseUrl || ''
    assistantAI.apiKey = ''
    assistantAI.model = preset.models?.[0] || ''
    if (newProvider === 'vertex') {
      assistantAI.vertexProjectId = ''
      assistantAI.vertexRegion = 'global'
    }
  }

  // 3. 返回模型列表
  return (preset.models || []).map(id => ({ id }))
}

/**
 * 根据 provider 构建完整的 API 请求参数
 * @param {Object} config - { provider, apiUrl, apiKey, model, temperature }
 * @param {Array} messages - OpenAI 格式的 messages 数组
 * @returns {{ endpoint: string, fetchOptions: RequestInit }}
 */
export function buildApiRequest(config, messages) {
  const { provider = 'custom', apiUrl, apiKey, model, temperature } = config
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom
  const format = preset.format

  if (format === 'claude') {
    return buildClaudeRequest(config, messages)
  }

  return buildOpenAIRequest(config, messages)
}

/**
 * OpenAI 兼容格式请求
 */
function buildOpenAIRequest(config, messages) {
  const { apiUrl, apiKey, model, temperature } = config

  let endpoint = apiUrl
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions'
  }

  return {
    endpoint,
    fetchOptions: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
      }),
    },
  }
}

/**
 * Claude (Anthropic) 格式请求
 * - system 提取为顶层字段
 * - 使用 x-api-key 头
 * - 需要 max_tokens
 * - 不支持 assistant prefill 作为最后一条消息的特殊处理
 */
function buildClaudeRequest(config, messages) {
  const { apiUrl, apiKey, model, temperature } = config

  let endpoint = apiUrl
  if (!endpoint.endsWith('/v1/messages')) {
    endpoint = endpoint.replace(/\/+$/, '') + '/v1/messages'
  }

  // 提取 system message
  let systemContent = ''
  const claudeMessages = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent += (systemContent ? '\n\n' : '') + msg.content
    } else {
      claudeMessages.push({ role: msg.role, content: msg.content })
    }
  }

  // Claude 要求 messages 必须以 user 开头，且 user/assistant 交替
  // 如果最后一条是 assistant（prefill），Claude 也支持
  const body = {
    model,
    max_tokens: 8192,
    temperature,
    messages: claudeMessages,
  }

  if (systemContent) {
    body.system = systemContent
  }

  return {
    endpoint,
    fetchOptions: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
  }
}

/**
 * 从 API 响应中提取回复文本（不同格式）
 * @param {string} provider
 * @param {Object} data - 解析后的 JSON 响应
 * @returns {string}
 */
export function extractReply(provider, data) {
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom

  if (preset.format === 'claude') {
    // Claude: { content: [{ type: 'text', text: '...' }] }
    if (data.content && Array.isArray(data.content)) {
      return data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
    }
    return ''
  }

  // OpenAI: { choices: [{ message: { content: '...' } }] }
  return data.choices?.[0]?.message?.content || ''
}

/**
 * 根据 provider 构建获取模型列表的请求
 * @param {string} provider
 * @param {string} apiUrl
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export async function fetchProviderModels(provider, apiUrl, apiKey) {
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom

  // Claude 不支持 /models 端点，直接返回预设
  if (preset.format === 'claude') {
    return preset.models.map(id => ({ id }))
  }

  // OpenAI 兼容的 /models 端点
  let endpoint = apiUrl.replace(/\/+$/, '')
  if (endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/chat\/completions$/, '/models')
  } else {
    endpoint += '/models'
  }

  try {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!response.ok) throw new Error('Failed to fetch models')
    const data = await response.json()
    return data.data || []
  } catch (e) {
    console.error('[AIProviders] Fetch models failed:', e)
    // 回退到预设列表
    return preset.models.map(id => ({ id }))
  }
}
