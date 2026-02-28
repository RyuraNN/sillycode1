/**
 * 压缩工具模块
 * 使用 pako (gzip) 压缩存档数据
 */

import pako from 'pako'

/**
 * 压缩数据
 * @param {string} jsonString - JSON字符串
 * @returns {string} Base64编码的压缩数据
 */
export function compressData(jsonString) {
  try {
    // 将字符串转换为 Uint8Array
    const uint8Array = new TextEncoder().encode(jsonString)

    // 使用 gzip 压缩
    const compressed = pako.gzip(uint8Array, { level: 9 })

    // 转换为 Base64
    const base64 = btoa(String.fromCharCode.apply(null, compressed))

    return base64
  } catch (e) {
    console.error('[Compression] Failed to compress data:', e)
    throw new Error('压缩失败')
  }
}

/**
 * 解压数据
 * @param {string} base64String - Base64编码的压缩数据
 * @returns {string} 解压后的JSON字符串
 */
export function decompressData(base64String) {
  try {
    // Base64 解码
    const binaryString = atob(base64String)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // gzip 解压
    const decompressed = pako.ungzip(bytes)

    // 转换回字符串
    const jsonString = new TextDecoder().decode(decompressed)

    return jsonString
  } catch (e) {
    console.error('[Compression] Failed to decompress data:', e)
    throw new Error('解压失败，存档可能已损坏')
  }
}

/**
 * 检测数据是否已压缩
 * @param {any} data - 要检测的数据
 * @returns {boolean} 是否为压缩格式
 */
export function isCompressed(data) {
  if (!data || typeof data !== 'object') {
    return false
  }
  return data.compressed === true && typeof data.data === 'string' && typeof data.version === 'number'
}
