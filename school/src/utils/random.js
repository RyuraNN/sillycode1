/**
 * 带种子的伪随机数生成器
 */
export function seededRandom(seed) {
  let s = seed
  return function() {
    s = Math.sin(s) * 10000
    return s - Math.floor(s)
  }
}
