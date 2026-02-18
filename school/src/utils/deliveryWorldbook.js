/**
 * 外卖系统世界书解析器
 *
 * 世界书条目格式：
 * 条目名称包含 "[商品目录]" 标记
 * 
 * 内容格式：
 * # 格式说明行（以#开头的会被忽略）
 * ID|food001
 * 名称|学生A套餐
 * 价格|150
 * 分类|餐饮
 * 上架时间|1,2,3,4,5,6,7,8,9,10,11,12
 * 生效时间|0
 * 耐久度|1
 * 库存|10
 * 最大库存|20
 * 补货周期|7
 * 送货时间|12-36
 * 描述|荤素搭配的营养套餐，能有效补充精力。
 * 效果|健康+5, 注意力+5
 */

/**
 * 解析单个商品数据
 * @param {string} text 商品文本块
 * @returns {Object|null} 解析后的商品对象
 */
function parseProductData(text) {
  const lines = text.split('\n')
  const product = {}

  const keyMap = {
    'ID': 'id',
    '名称': 'name',
    '价格': 'price',
    '分类': 'category',
    '上架时间': 'availableMonths',
    '生效时间': 'effectDuration',
    '耐久度': 'durability',
    '库存': 'stock',
    '最大库存': 'maxStock',
    '补货周期': 'restockDays',
    '送货时间': 'deliveryTime',
    '描述': 'description',
    '效果': 'effect'
  }

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('|')
    if (separatorIndex === -1) continue

    const key = line.substring(0, separatorIndex).trim()
    const value = line.substring(separatorIndex + 1).trim()

    if (keyMap[key]) {
      const mappedKey = keyMap[key]
      
      switch (mappedKey) {
        case 'price':
        case 'effectDuration':
        case 'durability':
        case 'stock':
        case 'maxStock':
        case 'restockDays':
          product[mappedKey] = parseInt(value, 10) || 0
          break
        case 'availableMonths':
          // 解析逗号分隔的月份数组
          product[mappedKey] = value.split(',').map(m => parseInt(m.trim(), 10)).filter(m => !isNaN(m))
          break
        case 'deliveryTime': {
          // 解析送货时间范围 "12-36" -> { min: 12, max: 36 }
          const parts = value.split('-')
          product[mappedKey] = {
            min: parseInt(parts[0], 10) || 0,
            max: parseInt(parts[1], 10) || parseInt(parts[0], 10) || 0
          }
          break
        }
        case 'effect':
          // 解析效果 "健康+5, 注意力+5" -> [{ attr: '健康', value: 5 }, ...]
          product[mappedKey] = parseEffects(value)
          break
        default:
          product[mappedKey] = value
      }
    }
  }

  return product.id ? product : null
}

/**
 * 解析效果字符串
 * @param {string} effectStr 效果字符串，如 "健康+5, 注意力+5" 或 "心境恢复效率+5%"
 * @returns {Array} 效果数组
 */
function parseEffects(effectStr) {
  if (!effectStr) return []
  
  const effects = []
  const parts = effectStr.split(',').map(p => p.trim()).filter(p => p)
  
  for (const part of parts) {
    // 匹配模式：属性名+/-数值(%)?
    const match = part.match(/^(.+?)([+-])(\d+)(%)?$/)
    if (match) {
      effects.push({
        attribute: match[1].trim(),
        value: parseInt(match[3], 10) * (match[2] === '-' ? -1 : 1),
        isPercentage: !!match[4]
      })
    }
  }
  
  return effects
}

/**
 * 从文本中解析所有商品
 * @param {string} content 世界书条目内容
 * @returns {Array} 商品数组
 */
export function parseProductCatalog(content) {
  const products = []
  
  // 按ID分割商品块
  const blocks = content.split(/(?=^ID\|)/m)
  
  for (const block of blocks) {
    if (!block.trim()) continue
    const product = parseProductData(block)
    if (product) {
      products.push(product)
    }
  }
  
  return products
}

/**
 * 从世界书获取商品目录
 * @returns {Promise<Array|null>} 商品数组，失败返回null
 */
export async function fetchProductCatalogFromWorldbook() {
  if (typeof window.getWorldbook !== 'function') {
    console.warn('[DeliveryWorldbook] Worldbook API not available')
    return null
  }

  try {
    const { getAllBookNames } = await import('./worldbookHelper.js')
    const bookNames = getAllBookNames()

    console.log('[DeliveryWorldbook] Scanning worldbooks for product catalog:', bookNames)

    let allProducts = []

    for (const name of bookNames) {
      let entries
      try {
        entries = await window.getWorldbook(name)
      } catch (e) {
        console.warn(`[DeliveryWorldbook] Worldbook "${name}" not accessible, skipping:`, e.message || e)
        continue
      }
      if (!entries || !Array.isArray(entries)) continue

      for (const entry of entries) {
        // 识别商品目录条目：名称包含 "[商品目录]"
        if (entry.name && entry.name.includes('[商品目录]')) {
          console.log('[DeliveryWorldbook] Found product catalog in entry:', entry.name)
          const products = parseProductCatalog(entry.content)
          if (products.length > 0) {
            allProducts = [...allProducts, ...products]
          }
        }
      }
    }

    if (allProducts.length > 0) {
      // 去重，以ID为准
      const uniqueProducts = []
      const idSet = new Set()
      
      for (const product of allProducts) {
        if (!idSet.has(product.id)) {
          uniqueProducts.push(product)
          idSet.add(product.id)
        }
      }
      
      console.log(`[DeliveryWorldbook] Loaded ${uniqueProducts.length} products`)
      return uniqueProducts
    }

  } catch (e) {
    console.error('[DeliveryWorldbook] Error fetching product catalog:', e)
  }

  return null
}

/**
 * 根据当前月份过滤可用商品
 * @param {Array} products 所有商品
 * @param {number} month 当前月份 (1-12)
 * @returns {Array} 当月可用的商品
 */
export function filterProductsByMonth(products, month) {
  if (!products || !Array.isArray(products)) return []
  return products.filter(p => p.availableMonths && p.availableMonths.includes(month))
}

/**
 * 根据分类过滤商品
 * @param {Array} products 商品列表
 * @param {string} category 分类名称
 * @returns {Array} 该分类的商品
 */
export function filterProductsByCategory(products, category) {
  if (!products || !Array.isArray(products)) return []
  if (category === 'all') return products
  return products.filter(p => p.category === category)
}

/**
 * 获取所有分类
 * @param {Array} products 商品列表
 * @returns {Array} 分类名称数组
 */
export function getCategories(products) {
  if (!products || !Array.isArray(products)) return []
  const categories = new Set()
  products.forEach(p => {
    if (p.category) categories.add(p.category)
  })
  return Array.from(categories)
}

/**
 * 判断商品是否为可装备类型
 * @param {Object} product 商品对象
 * @returns {boolean}
 */
export function isEquipableProduct(product) {
  if (!product || !product.category) return false
  // 服饰类商品可装备
  return product.category.startsWith('服饰')
}

/**
 * 获取装备槽位
 * @param {Object} product 商品对象
 * @returns {string|null} 槽位名称
 */
export function getEquipmentSlot(product) {
  if (!product || !product.category) return null
  
  const slotMap = {
    '服饰-帽子': 'hat',
    '服饰-外套': 'outer',
    '服饰-内搭': 'inner',
    '服饰-下装': 'pants',
    '服饰-袜子': 'socks',
    '服饰-鞋子': 'shoes',
    '服饰-饰品': 'accessory'
  }
  
  return slotMap[product.category] || null
}

/**
 * 获取物品类型（用于背包分类）
 * @param {Object} product 商品对象
 * @returns {string} 物品类型
 */
export function getItemType(product) {
  if (!product || !product.category) return 'misc'
  
  const category = product.category
  
  if (category === '餐饮' || category === '零食') return 'consumable'
  if (category === '学习用具') return 'book'
  if (category.startsWith('服饰')) return 'clothing'
  if (category === '礼物') return 'gift'
  if (category === '娱乐') return 'entertainment'
  if (category === '锻炼') return 'exercise'
  if (category === '日用品') return 'daily'
  
  return 'misc'
}

/**
 * 效果属性映射到游戏状态路径
 * @param {string} attribute 效果属性名
 * @returns {Object} { path: string, isTemp: boolean, statType: string }
 */
export function mapEffectToGamePath(attribute) {
  const mapping = {
    // 直接属性
    '健康': { path: 'player.health', isTemp: true, statType: 'stat' },
    '心境': { path: 'player.attributes.mood', isTemp: true, statType: 'stat' },
    '注意力': { path: 'player.attributes.iq', isTemp: true, statType: 'stat' },
    '魅力': { path: 'player.attributes.charm', isTemp: true, statType: 'stat' },
    '体能': { path: 'player.attributes.physique', isTemp: true, statType: 'stat' },
    '灵活': { path: 'player.attributes.flexibility', isTemp: true, statType: 'stat' },
    '智商': { path: 'player.attributes.iq', isTemp: true, statType: 'stat' },
    '情商': { path: 'player.attributes.eq', isTemp: true, statType: 'stat' },
    
    // 经验加成类（百分比）
    '数学知识经验获取效率': { path: 'exp.subjects.math', isTemp: true, statType: 'expBonus' },
    '英语知识经验获取效率': { path: 'exp.subjects.english', isTemp: true, statType: 'expBonus' },
    '编程技能经验获取效率': { path: 'exp.skills.programming', isTemp: true, statType: 'expBonus' },
    '吉他技能经验获取效率': { path: 'exp.skills.guitar', isTemp: true, statType: 'expBonus' },
    '绘画技能经验获取效率': { path: 'exp.skills.painting', isTemp: true, statType: 'expBonus' },
    
    // 恢复效率类
    '注意力恢复效率': { path: 'recovery.attention', isTemp: true, statType: 'recoveryBonus' },
    '心境恢复效率': { path: 'recovery.mood', isTemp: true, statType: 'recoveryBonus' },
    '学习效率': { path: 'efficiency.study', isTemp: true, statType: 'efficiencyBonus' },
    
    // 体能锻炼效率
    '体能锻炼效率': { path: 'efficiency.physique', isTemp: true, statType: 'efficiencyBonus' },
    '灵活锻炼效率': { path: 'efficiency.flexibility', isTemp: true, statType: 'efficiencyBonus' },
    
    // 抗性类
    '寒冷抗性': { path: 'resistance.cold', isTemp: true, statType: 'resistance' },
    '夜间学习时健康下降率': { path: 'modifier.nightStudyHealth', isTemp: true, statType: 'modifier' },
    '夏季户外活动时健康下降率': { path: 'modifier.summerOutdoorHealth', isTemp: true, statType: 'modifier' }
  }
  
  return mapping[attribute] || { path: `custom.${attribute}`, isTemp: true, statType: 'custom' }
}
