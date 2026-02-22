/**
 * 带种子的伪随机数生成器 (mulberry32)
 * 高质量 PRNG，分布均匀，周期 2^32
 */
export function seededRandom(seed) {
  let s = seed | 0
  return function() {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
