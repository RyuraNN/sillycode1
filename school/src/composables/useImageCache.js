/**
 * 图片缓存管理 Composable
 * 负责图片的加载、缓存和生命周期管理
 */

import { reactive, onUnmounted } from 'vue'
import { getImageFromDB, saveImageToDB } from '../utils/imageDB'

// 图片缓存 (ID -> BlobURL) - 使用全局变量以便跨组件共享
const imageCacheMap = reactive(new Map())
// 正在加载的图片集合 (防止重复请求)
const loadingImages = new Set()
// 图片加载队列
const imageLoadQueue = []
// 当前并发数
let activeImageLoads = 0
const MAX_CONCURRENT_IMAGE_LOADS = 3

/**
 * Base64 转 Blob URL
 * @param {string} base64 - Base64 编码的图片
 * @returns {Promise<string>} Blob URL
 */
export const base64ToBlobUrl = async (base64) => {
  const res = await fetch(base64)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/**
 * 处理图片加载队列
 */
const processImageLoadQueue = async () => {
  if (activeImageLoads >= MAX_CONCURRENT_IMAGE_LOADS || imageLoadQueue.length === 0) return

  const id = imageLoadQueue.shift()
  if (!id) return

  activeImageLoads++
  
  try {
    const blob = await getImageFromDB(id)
    if (blob) {
      // blob is now a Blob object (migrated or new)
      const url = URL.createObjectURL(blob)
      imageCacheMap.set(id, url)
    }
  } catch (e) {
    console.error(`Failed to load image ${id}:`, e)
  } finally {
    loadingImages.delete(id)
    activeImageLoads--
    // 继续处理下一个
    processImageLoadQueue()
  }
}

/**
 * 添加图片到加载队列
 * @param {string} id - 图片 ID
 */
export const queueImageLoad = (id) => {
  if (imageCacheMap.has(id) || loadingImages.has(id)) return
  
  loadingImages.add(id)
  imageLoadQueue.push(id)
  processImageLoadQueue()
}

/**
 * 从日志中加载图片
 * @param {Array} logs - 日志数组
 */
export const loadImagesFromLog = async (logs) => {
  const regex = /<image-ref\s+id="([^"]+)"/g
  
  // 仅预加载最近的 50 条消息中的图片
  const recentLogs = logs.slice(-50)
  
  for (const log of recentLogs) {
    const content = log.rawContent || log.content || ''
    let match
    while ((match = regex.exec(content)) !== null) {
      const id = match[1]
      queueImageLoad(id)
    }
  }
}

/**
 * 图片缓存 Composable
 * @returns {Object} 缓存管理相关的方法和状态
 */
export function useImageCache() {
  /**
   * 清理所有缓存，释放内存
   */
  const cleanup = () => {
    imageCacheMap.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    imageCacheMap.clear()
  }

  /**
   * 保存图片并添加到缓存
   * @param {string} id - 图片 ID
   * @param {string|Blob} data - Base64 编码的图片或 Blob
   * @returns {Promise<string>} Blob URL
   */
  const saveAndCache = async (id, data) => {
    // saveImageToDB handles conversion to Blob if needed and returns the stored Blob
    const blob = await saveImageToDB(id, data)
    const url = URL.createObjectURL(blob)
    imageCacheMap.set(id, url)
    return url
  }

  /**
   * 获取图片 URL
   * @param {string} id - 图片 ID
   * @returns {string|undefined} Blob URL 或 undefined
   */
  const getImageUrl = (id) => {
    return imageCacheMap.get(id)
  }

  /**
   * 检查图片是否已缓存
   * @param {string} id - 图片 ID
   * @returns {boolean}
   */
  const hasImage = (id) => {
    return imageCacheMap.has(id)
  }

  // 组件卸载时不自动清理，因为缓存是全局共享的
  // 如果需要清理，调用者应显式调用 cleanup()

  return {
    imageCacheMap,
    queueImageLoad,
    loadImagesFromLog,
    saveAndCache,
    getImageUrl,
    hasImage,
    cleanup,
    base64ToBlobUrl
  }
}

export default useImageCache
