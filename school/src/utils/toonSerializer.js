import { encode } from '@toon-format/toon'

/**
 * Serialize a JSON object to TOON format string
 * Falls back to JSON.stringify if TOON encoding fails
 */
export function toTOON(obj) {
  try {
    return encode(obj)
  } catch (e) {
    console.warn('[TOON] Encode failed, falling back to JSON:', e)
    return JSON.stringify(obj, null, 2)
  }
}
