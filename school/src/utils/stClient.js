import { useGameStore } from '../stores/gameStore'
import { buildSystemInjection } from './prompts'

let isGenerationStopped = false

/**
 * 请求 AI 生成回复
 * @param {string} userInput 用户输入
 * @param {Array} customHistory 自定义聊天历史（可选，用于总结系统替换上下文）
 * @returns {Promise<string>} AI 回复全文，或者特殊标记 '__STOPPED__' / '__ERROR__'
 */
export async function generateReply(userInput, customHistory = null) {
  const gameStore = useGameStore()
  const injection = buildSystemInjection(gameStore.$state)
  isGenerationStopped = false

  // ST 环境
  if (window.generate) {
    try {
      console.log('[ST Client] Calling ST generate API...')
      
      const options = {
        user_input: userInput,
        // 注入系统提示词
        // 根据 generate.d.ts, injects 是 Omit<InjectionPrompt, 'id'>[]
        injects: [injection],
        should_stream: false
      }

      // 如果提供了自定义历史，使用 overrides 覆盖默认聊天记录
      if (customHistory) {
        console.log('[ST Client] Using custom chat history (summary system active)')
        options.overrides = {
          chat_history: {
            prompts: customHistory
          }
        }
      }

      const result = await window.generate(options)
      
      // 再次检查是否被停止（虽然 generate 应该会抛错或返回，但双重保险）
      if (isGenerationStopped) return '__STOPPED__'
      
      // 生成成功后清空指令队列
      gameStore.clearCommands()
      
      return result
    } catch (error) {
      console.error('[ST Client] Generation failed:', error)
      // 如果是因为停止而报错，返回停止标记
      if (isGenerationStopped) return '__STOPPED__'
      // 其他错误返回错误标记
      return '__ERROR__'
    }
  } else {
    console.error('[ST Client] ST API not found')
    return '__ERROR__'
  }
}

/**
 * 停止生成
 */
export async function stopGeneration() {
  isGenerationStopped = true
  if (window.stopAllGeneration) {
    console.log('[ST Client] Stopping generation...')
    return await window.stopAllGeneration()
  } else {
      console.warn('[ST Client] stopAllGeneration API not found')
    return false
  }
}

/**
 * 请求 AI 流式生成回复
 * @param {string} userInput 用户输入
 * @param {Function} onChunk 接收增量文本的回调函数 (text) => void
 * @param {Array} customHistory 自定义聊天历史
 * @returns {Promise<string>} 最终生成的完整回复
 */
export async function generateStreaming(userInput, onChunk, customHistory = null) {
  const gameStore = useGameStore()
  const injection = buildSystemInjection(gameStore.$state)
  isGenerationStopped = false

  if (!window.generate) {
    console.error('[ST Client] ST API not found')
    return '__ERROR__'
  }

  // 检查设置，防止硬编码导致即使关闭流式也强制流式
  // 兼容可能存在的字符串类型的 'false' 以及 undefined (默认为 true)
  const shouldStream = gameStore.settings.streamResponse !== false && gameStore.settings.streamResponse !== 'false'

  // 监听流式事件
  // 注意：需要确保 eventOn 和 iframe_events 可用
  // SillyTavern 扩展通常可以直接访问这些全局变量
  const eventHandler = (token) => {
    if (onChunk && typeof onChunk === 'function') {
      onChunk(token)
    }
  }

  let eventId = null
  // 只有在需要流式时才绑定事件监听器
  if (shouldStream && window.eventOn && window.iframe_events) {
    // 使用 INCREMENTALLY 获取增量更新
    eventId = window.eventOn(window.iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, eventHandler)
  } else if (!shouldStream) {
    console.log('[ST Client] Streaming disabled, skipping event listener binding')
  } else {
    console.warn('[ST Client] Streaming events not available, falling back to non-streaming')
  }

  try {
    console.log('[ST Client] Calling ST generate API (Streaming)...')

    const options = {
      user_input: userInput,
      injects: [injection],
      should_stream: shouldStream // 使用配置值
    }

    if (customHistory) {
      options.overrides = {
        chat_history: {
          prompts: customHistory
        }
      }
    }

    // 调用生成
    const result = await window.generate(options)
    
    if (isGenerationStopped) return '__STOPPED__'
    
    gameStore.clearCommands()
    return result

  } catch (error) {
    console.error('[ST Client] Generation failed:', error)
    if (isGenerationStopped) return '__STOPPED__'
    return '__ERROR__'
  } finally {
    // 清理事件监听
    if (window.eventOff && eventId !== null) {
      window.eventOff(eventId)
    }
  }
}
