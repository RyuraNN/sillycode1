/**
 * 卡版本检测与游戏版本号管理
 */
import { getCurrentBookName } from './worldbookHelper'

export type CardEdition = 'elyrene' | 'original' | 'unknown'

/** 唯一版本号来源，更新只改这里 */
export const GAME_VERSION = 'V2.6'

/**
 * 通过世界书名称关键词检测当前绑定的卡版本
 * Elyrene = 唯版，Original = 雪乃版
 */
export function detectCardEdition(): CardEdition {
  const bookName = getCurrentBookName()
  if (!bookName) return 'unknown'
  const lower = bookName.toLowerCase()
  if (lower.includes('elyrene')) return 'elyrene'
  if (lower.includes('original')) return 'original'
  return 'unknown'
}

/** 完整标签（用于开屏面板等英文场景） */
export function getEditionLabel(edition: CardEdition): string {
  switch (edition) {
    case 'elyrene': return 'Elyrene Edition'
    case 'original': return 'Original Edition'
    default: return '未检测到卡版本'
  }
}

/** 短标签（用于存档卡片等中文场景） */
export function getEditionShortLabel(edition: CardEdition): string {
  switch (edition) {
    case 'elyrene': return '唯版'
    case 'original': return '雪乃版'
    default: return ''
  }
}
