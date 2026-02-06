/**
 * 天气生成器 v2.0
 * 采用连续天气流模式，模拟真实天气的自然演变
 * 天气不受日期边界影响，是一个连续的自然过程
 */

import { seededRandom } from './random.js'

// ============ 天气类型定义 ============

// 天气类型及其属性
export const WEATHER_TYPES = {
  sunny: { name: '晴', icon: '☀️', category: 'clear', severity: 0 },
  partly_cloudy: { name: '多云', icon: '⛅', category: 'cloudy', severity: 1 },
  cloudy: { name: '阴', icon: '☁️', category: 'cloudy', severity: 2 },
  overcast: { name: '阴沉', icon: '🌥️', category: 'cloudy', severity: 3 },
  light_rain: { name: '小雨', icon: '🌧️', category: 'rain', severity: 4 },
  rain: { name: '中雨', icon: '🌧️', category: 'rain', severity: 5 },
  heavy_rain: { name: '大雨', icon: '⛈️', category: 'rain', severity: 6 },
  thunderstorm: { name: '雷雨', icon: '⛈️', category: 'storm', severity: 7 },
  light_snow: { name: '小雪', icon: '🌨️', category: 'snow', severity: 4 },
  snow: { name: '中雪', icon: '❄️', category: 'snow', severity: 5 },
  heavy_snow: { name: '大雪', icon: '❄️', category: 'snow', severity: 6 },
  fog: { name: '雾', icon: '🌫️', category: 'fog', severity: 2 },
  haze: { name: '霾', icon: '😷', category: 'haze', severity: 3 }
}

// 季节定义
export const SEASONS = {
  spring: { months: [3, 4, 5], name: '春季', baseTemp: 18, tempRange: 10, dayNightDiff: 8 },
  summer: { months: [6, 7, 8], name: '夏季', baseTemp: 30, tempRange: 6, dayNightDiff: 6 },
  autumn: { months: [9, 10, 11], name: '秋季', baseTemp: 16, tempRange: 12, dayNightDiff: 10 },
  winter: { months: [12, 1, 2], name: '冬季', baseTemp: 4, tempRange: 8, dayNightDiff: 12 }
}

// ============ 季节天气转换矩阵 ============
// 每个季节有不同的天气转换概率
// 格式: { 当前天气: { 可转换的天气: 权重 } }

const SPRING_TRANSITIONS = {
  sunny: { sunny: 40, partly_cloudy: 45, cloudy: 10, fog: 5 },
  partly_cloudy: { sunny: 25, partly_cloudy: 40, cloudy: 30, fog: 5 },
  cloudy: { sunny: 10, partly_cloudy: 25, cloudy: 35, overcast: 25, light_rain: 5 },
  overcast: { partly_cloudy: 10, cloudy: 30, overcast: 35, light_rain: 20, fog: 5 },
  light_rain: { cloudy: 15, overcast: 30, light_rain: 40, rain: 15 },
  rain: { overcast: 10, light_rain: 35, rain: 40, heavy_rain: 15 },
  heavy_rain: { light_rain: 20, rain: 45, heavy_rain: 35 },
  fog: { sunny: 30, partly_cloudy: 40, cloudy: 20, fog: 10 },
  haze: { partly_cloudy: 30, cloudy: 40, haze: 30 }
}

const SUMMER_TRANSITIONS = {
  sunny: { sunny: 55, partly_cloudy: 30, cloudy: 10, thunderstorm: 5 },
  partly_cloudy: { sunny: 30, partly_cloudy: 40, cloudy: 20, thunderstorm: 10 },
  cloudy: { sunny: 15, partly_cloudy: 30, cloudy: 30, overcast: 15, thunderstorm: 10 },
  overcast: { partly_cloudy: 15, cloudy: 30, overcast: 25, light_rain: 15, thunderstorm: 15 },
  light_rain: { cloudy: 20, overcast: 25, light_rain: 30, rain: 15, thunderstorm: 10 },
  rain: { overcast: 15, light_rain: 30, rain: 30, heavy_rain: 15, thunderstorm: 10 },
  heavy_rain: { rain: 35, heavy_rain: 35, thunderstorm: 30 },
  thunderstorm: { sunny: 25, partly_cloudy: 30, cloudy: 20, rain: 15, thunderstorm: 10 },
  fog: { sunny: 50, partly_cloudy: 40, fog: 10 },
  haze: { partly_cloudy: 40, cloudy: 30, haze: 30 }
}

const AUTUMN_TRANSITIONS = {
  sunny: { sunny: 60, partly_cloudy: 30, cloudy: 8, fog: 2 },
  partly_cloudy: { sunny: 35, partly_cloudy: 45, cloudy: 18, fog: 2 },
  cloudy: { sunny: 20, partly_cloudy: 35, cloudy: 35, overcast: 8, fog: 2 },
  overcast: { partly_cloudy: 20, cloudy: 40, overcast: 30, light_rain: 10 },
  light_rain: { cloudy: 25, overcast: 35, light_rain: 30, rain: 10 },
  rain: { overcast: 20, light_rain: 40, rain: 35, heavy_rain: 5 },
  heavy_rain: { light_rain: 30, rain: 50, heavy_rain: 20 },
  fog: { sunny: 40, partly_cloudy: 35, cloudy: 15, fog: 10 },
  haze: { partly_cloudy: 25, cloudy: 35, overcast: 15, haze: 25 }
}

const WINTER_TRANSITIONS = {
  sunny: { sunny: 45, partly_cloudy: 35, cloudy: 15, fog: 5 },
  partly_cloudy: { sunny: 25, partly_cloudy: 40, cloudy: 30, fog: 5 },
  cloudy: { sunny: 10, partly_cloudy: 25, cloudy: 40, overcast: 20, fog: 5 },
  overcast: { partly_cloudy: 10, cloudy: 35, overcast: 35, light_snow: 15, light_rain: 5 },
  light_rain: { cloudy: 20, overcast: 35, light_rain: 30, rain: 10, light_snow: 5 },
  rain: { overcast: 20, light_rain: 40, rain: 30, heavy_rain: 5, snow: 5 },
  heavy_rain: { light_rain: 25, rain: 45, heavy_rain: 20, snow: 10 },
  light_snow: { cloudy: 15, overcast: 30, light_snow: 40, snow: 15 },
  snow: { overcast: 15, light_snow: 35, snow: 40, heavy_snow: 10 },
  heavy_snow: { light_snow: 20, snow: 50, heavy_snow: 30 },
  fog: { sunny: 30, partly_cloudy: 30, cloudy: 25, fog: 15 },
  haze: { partly_cloudy: 20, cloudy: 35, overcast: 20, haze: 25 }
}

// 季节转换矩阵映射
const SEASON_TRANSITIONS = {
  spring: SPRING_TRANSITIONS,
  summer: SUMMER_TRANSITIONS,
  autumn: AUTUMN_TRANSITIONS,
  winter: WINTER_TRANSITIONS
}

// ============ 时段特征配置 ============
// 不同时段有不同的天气倾向

const TIME_PERIOD_MODIFIERS = {
  // 凌晨 (0-6点): 容易起雾
  dawn: {
    hours: [0, 2, 4],
    fogChance: 0.15,
    thunderstormChance: 0.02
  },
  // 早晨 (6-10点): 雾散去
  morning: {
    hours: [6, 8],
    fogChance: 0.08,
    thunderstormChance: 0.05
  },
  // 午后 (10-14点): 天气稳定
  midday: {
    hours: [10, 12],
    fogChance: 0.01,
    thunderstormChance: 0.10
  },
  // 下午 (14-18点): 夏季易有雷阵雨
  afternoon: {
    hours: [14, 16],
    fogChance: 0.01,
    thunderstormChance: 0.25
  },
  // 傍晚 (18-22点): 天气趋于稳定
  evening: {
    hours: [18, 20],
    fogChance: 0.03,
    thunderstormChance: 0.08
  },
  // 夜间 (22-24点): 可能起雾
  night: {
    hours: [22],
    fogChance: 0.10,
    thunderstormChance: 0.03
  }
}

// ============ 天气持续性配置 ============
// 不同天气的平均持续时段数和稳定性

const WEATHER_PERSISTENCE = {
  sunny: { minDuration: 4, maxDuration: 24, stability: 0.85 },      // 晴天持续4-48小时，很稳定
  partly_cloudy: { minDuration: 2, maxDuration: 12, stability: 0.70 }, // 多云2-24小时
  cloudy: { minDuration: 2, maxDuration: 16, stability: 0.75 },     // 阴天2-32小时
  overcast: { minDuration: 2, maxDuration: 10, stability: 0.70 },   // 阴沉2-20小时
  light_rain: { minDuration: 2, maxDuration: 18, stability: 0.65 }, // 小雨可以持续很久
  rain: { minDuration: 1, maxDuration: 8, stability: 0.60 },        // 中雨2-16小时
  heavy_rain: { minDuration: 1, maxDuration: 4, stability: 0.50 },  // 大雨2-8小时
  thunderstorm: { minDuration: 1, maxDuration: 3, stability: 0.40 }, // 雷雨2-6小时，不稳定
  light_snow: { minDuration: 2, maxDuration: 16, stability: 0.70 },
  snow: { minDuration: 2, maxDuration: 10, stability: 0.65 },
  heavy_snow: { minDuration: 1, maxDuration: 6, stability: 0.55 },
  fog: { minDuration: 1, maxDuration: 4, stability: 0.50 },         // 雾2-8小时
  haze: { minDuration: 3, maxDuration: 12, stability: 0.75 }        // 霾6-24小时
}

// ============ 工具函数 ============

/**
 * 将日期转为种子数
 */
function dateToSeed(year, month, day) {
  return year * 10000 + month * 100 + day
}

/**
 * 获取当前季节
 */
export function getSeason(month) {
  for (const [seasonKey, seasonData] of Object.entries(SEASONS)) {
    if (seasonData.months.includes(month)) {
      return { key: seasonKey, ...seasonData }
    }
  }
  return { key: 'spring', ...SEASONS.spring }
}

/**
 * 获取时段名称
 */
function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6) return 'dawn'
  if (hour >= 6 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

/**
 * 根据权重随机选择
 */
function weightedRandom(weights, random) {
  const entries = Object.entries(weights)
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0)
  if (totalWeight === 0) return entries[0]?.[0] || 'sunny'
  
  const randomValue = random() * totalWeight
  let cumulative = 0
  for (const [key, weight] of entries) {
    cumulative += weight
    if (randomValue < cumulative) {
      return key
    }
  }
  return entries[0][0]
}

/**
 * 获取星期名称
 */
function getWeekdayName(dayIndex) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[dayIndex]
}

// ============ 核心天气演变逻辑 ============

/**
 * 生成下一个时段的天气
 * @param {string} currentWeather 当前天气
 * @param {number} currentDuration 当前天气已持续的时段数
 * @param {string} seasonKey 季节
 * @param {number} hour 当前小时
 * @param {Function} random 随机函数
 * @returns {{ weather: string, duration: number }} 新天气和持续计数
 */
function evolveWeather(currentWeather, currentDuration, seasonKey, hour, random) {
  const persistence = WEATHER_PERSISTENCE[currentWeather] || WEATHER_PERSISTENCE.sunny
  const transitions = SEASON_TRANSITIONS[seasonKey] || SPRING_TRANSITIONS
  const period = getTimePeriod(hour)
  const periodMod = TIME_PERIOD_MODIFIERS[period]
  
  // 计算是否应该变化
  // 持续时间越长，变化概率越高
  let changeChance = 1 - persistence.stability
  
  // 如果已经持续超过最小时长，逐渐增加变化概率
  if (currentDuration >= persistence.minDuration) {
    const overTime = currentDuration - persistence.minDuration
    const maxOverTime = persistence.maxDuration - persistence.minDuration
    changeChance += (overTime / maxOverTime) * 0.5
  }
  
  // 如果还在最小时长内，大幅降低变化概率
  if (currentDuration < persistence.minDuration) {
    changeChance *= 0.2
  }
  
  // 时段特殊调整
  if (seasonKey === 'summer' && period === 'afternoon') {
    // 夏季午后，如果是晴天或多云，增加雷雨概率
    if (currentWeather === 'sunny' || currentWeather === 'partly_cloudy') {
      if (random() < periodMod.thunderstormChance) {
        return { weather: 'thunderstorm', duration: 1 }
      }
    }
  }
  
  // 凌晨起雾
  if (period === 'dawn' && currentWeather !== 'fog' && 
      (currentWeather === 'cloudy' || currentWeather === 'partly_cloudy' || currentWeather === 'sunny')) {
    if (random() < periodMod.fogChance) {
      return { weather: 'fog', duration: 1 }
    }
  }
  
  // 早晨雾散
  if (period === 'morning' && currentWeather === 'fog' && currentDuration >= 2) {
    if (random() < 0.6) {
      return { weather: 'sunny', duration: 1 }
    }
  }
  
  // 决定是否变化
  if (random() > changeChance) {
    // 保持当前天气
    return { weather: currentWeather, duration: currentDuration + 1 }
  }
  
  // 获取转换权重
  let transitionWeights = transitions[currentWeather]
  if (!transitionWeights) {
    // 如果当前天气在该季节没有定义转换，使用默认
    transitionWeights = { sunny: 30, partly_cloudy: 40, cloudy: 30 }
  }
  
  // 过滤掉当前天气的自我保持权重，因为我们已经决定要变化
  const filteredWeights = {}
  for (const [weather, weight] of Object.entries(transitionWeights)) {
    if (weather !== currentWeather) {
      filteredWeights[weather] = weight
    }
  }
  
  // 如果没有其他选项，保持当前
  if (Object.keys(filteredWeights).length === 0) {
    return { weather: currentWeather, duration: currentDuration + 1 }
  }
  
  const newWeather = weightedRandom(filteredWeights, random)
  return { weather: newWeather, duration: 1 }
}

/**
 * 生成连续的天气时段序列
 * @param {number} startYear 起始年
 * @param {number} startMonth 起始月
 * @param {number} startDay 起始日
 * @param {string} initialWeather 初始天气（可选）
 * @param {number} totalSlots 总时段数（每时段2小时，7天=84时段）
 * @returns {Array} 天气时段数组
 */
function generateContinuousWeatherStream(startYear, startMonth, startDay, initialWeather = null, totalSlots = 84) {
  // 使用日期作为种子，确保同一天生成相同的天气
  const baseSeed = dateToSeed(startYear, startMonth, startDay)
  const random = seededRandom(baseSeed)
  
  const slots = []
  const startDate = new Date(startYear, startMonth - 1, startDay)
  
  // 确定初始天气
  let currentWeather = initialWeather
  let currentDuration = 1
  
  if (!currentWeather) {
    const season = getSeason(startMonth)
    const seasonWeights = getSeasonInitialWeights(season.key)
    currentWeather = weightedRandom(seasonWeights, random)
  }
  
  // 生成每个时段
  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
    // 计算当前时段对应的日期和时间
    const slotDate = new Date(startDate.getTime() + slotIndex * 2 * 60 * 60 * 1000)
    const year = slotDate.getFullYear()
    const month = slotDate.getMonth() + 1
    const day = slotDate.getDate()
    const hour = slotDate.getHours()
    
    const season = getSeason(month)
    
    // 为每个时段使用确定性种子，确保回溯一致性
    const slotSeed = baseSeed * 100 + slotIndex
    const slotRandom = seededRandom(slotSeed)
    
    // 记录当前时段
    slots.push({
      slotIndex,
      year,
      month,
      day,
      hour,
      weather: currentWeather,
      season: season.key
    })
    
    // 演变到下一个时段
    const evolved = evolveWeather(currentWeather, currentDuration, season.key, hour, slotRandom)
    
    if (evolved.weather === currentWeather) {
      currentDuration = evolved.duration
    } else {
      currentWeather = evolved.weather
      currentDuration = 1
    }
  }
  
  return slots
}

/**
 * 获取季节的初始天气权重
 */
function getSeasonInitialWeights(seasonKey) {
  const weights = {
    spring: { sunny: 25, partly_cloudy: 35, cloudy: 25, light_rain: 10, fog: 5 },
    summer: { sunny: 45, partly_cloudy: 30, cloudy: 15, thunderstorm: 10 },
    autumn: { sunny: 40, partly_cloudy: 35, cloudy: 20, fog: 5 },
    winter: { sunny: 20, partly_cloudy: 30, cloudy: 35, light_snow: 10, fog: 5 }
  }
  return weights[seasonKey] || weights.spring
}

/**
 * 将连续时段数据聚合为每日预报
 * @param {Array} slots 时段数组
 * @returns {Array} 每日预报数组
 */
function aggregateToDaily(slots) {
  const dailyMap = new Map()
  
  for (const slot of slots) {
    const dateKey = `${slot.year}-${slot.month}-${slot.day}`
    
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        year: slot.year,
        month: slot.month,
        day: slot.day,
        date: `${String(slot.month).padStart(2, '0')}-${String(slot.day).padStart(2, '0')}`,
        weekday: getWeekdayName(new Date(slot.year, slot.month - 1, slot.day).getDay()),
        slots: [],
        weatherCounts: {},
        season: slot.season
      })
    }
    
    const dayData = dailyMap.get(dateKey)
    dayData.slots.push(slot)
    dayData.weatherCounts[slot.weather] = (dayData.weatherCounts[slot.weather] || 0) + 1
  }
  
  // 转换为数组并计算主天气
  const dailyList = []
  for (const [, dayData] of dailyMap) {
    // 找出出现最多的天气作为当天主天气
    let dominantWeather = 'sunny'
    let maxCount = 0
    for (const [weather, count] of Object.entries(dayData.weatherCounts)) {
      if (count > maxCount) {
        maxCount = count
        dominantWeather = weather
      }
    }
    
    const weatherInfo = WEATHER_TYPES[dominantWeather] || WEATHER_TYPES.sunny
    
    // 构建每2小时的详细数据
    const hourly = dayData.slots.map(slot => {
      const slotWeatherInfo = WEATHER_TYPES[slot.weather] || WEATHER_TYPES.sunny
      return {
        time: `${String(slot.hour).padStart(2, '0')}:00`,
        weather: slot.weather,
        weatherName: slotWeatherInfo.name,
        icon: slotWeatherInfo.icon,
        temp: 0 // 温度在后续计算
      }
    })
    
    dailyList.push({
      date: dayData.date,
      year: dayData.year,
      month: dayData.month,
      day: dayData.day,
      weekday: dayData.weekday,
      weather: dominantWeather,
      weatherName: weatherInfo.name,
      icon: weatherInfo.icon,
      category: weatherInfo.category,
      tempHigh: 0,
      tempLow: 0,
      hourly,
      season: dayData.season
    })
  }
  
  return dailyList.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    if (a.month !== b.month) return a.month - b.month
    return a.day - b.day
  })
}

// ============ 温度生成系统 ============

/**
 * 温度曲线：定义一天中不同时段的温度系数
 * 0.0 = 最低温，1.0 = 最高温
 */
const TEMP_CURVE = {
  0: 0.15,   // 凌晨0点
  2: 0.08,   // 凌晨2点
  4: 0.02,   // 凌晨4点 - 最低
  6: 0.10,   // 早晨6点
  8: 0.30,   // 上午8点
  10: 0.55,  // 上午10点
  12: 0.80,  // 中午12点
  14: 1.00,  // 下午2点 - 最高
  16: 0.95,  // 下午4点
  18: 0.75,  // 傍晚6点
  20: 0.50,  // 晚上8点
  22: 0.30   // 晚上10点
}

/**
 * 天气对温度的影响
 */
const WEATHER_TEMP_MODIFIERS = {
  sunny: { dayBonus: 3, nightBonus: -1 },      // 晴天白天更热，夜晚散热快
  partly_cloudy: { dayBonus: 1, nightBonus: 0 },
  cloudy: { dayBonus: -2, nightBonus: 2 },     // 阴天白天凉，夜晚保温
  overcast: { dayBonus: -3, nightBonus: 3 },
  light_rain: { dayBonus: -5, nightBonus: 0 },
  rain: { dayBonus: -6, nightBonus: -1 },
  heavy_rain: { dayBonus: -8, nightBonus: -2 },
  thunderstorm: { dayBonus: -7, nightBonus: -3 },
  light_snow: { dayBonus: -4, nightBonus: -2 },
  snow: { dayBonus: -6, nightBonus: -3 },
  heavy_snow: { dayBonus: -8, nightBonus: -4 },
  fog: { dayBonus: -2, nightBonus: 2 },        // 雾天保温
  haze: { dayBonus: -1, nightBonus: 1 }
}

/**
 * 生成温度数据
 * @param {Array} dailyForecast 每日预报数组
 * @param {number} startYear 起始年
 * @param {number} startMonth 起始月
 * @param {number} startDay 起始日
 */
function generateTemperatures(dailyForecast, startYear, startMonth, startDay) {
  const baseSeed = dateToSeed(startYear, startMonth, startDay)
  
  let prevDayAvgTemp = null
  
  for (let dayIndex = 0; dayIndex < dailyForecast.length; dayIndex++) {
    const dayData = dailyForecast[dayIndex]
    const season = SEASONS[dayData.season] || SEASONS.spring
    
    // 为每天生成独立随机种子
    const daySeed = baseSeed + dayIndex * 1000
    const random = seededRandom(daySeed)
    
    // 基础温度 = 季节基温 + 随机波动
    let baseTemp = season.baseTemp + (random() - 0.5) * season.tempRange
    
    // 如果有前一天温度，限制变化幅度
    if (prevDayAvgTemp !== null) {
      const maxChange = 5
      baseTemp = Math.max(prevDayAvgTemp - maxChange, Math.min(prevDayAvgTemp + maxChange, baseTemp))
    }
    
    // 根据当天主天气调整基础温度
    const weatherMod = WEATHER_TEMP_MODIFIERS[dayData.weather] || { dayBonus: 0, nightBonus: 0 }
    const avgWeatherMod = (weatherMod.dayBonus + weatherMod.nightBonus) / 2
    baseTemp += avgWeatherMod
    
    // 计算日夜温差
    const dayNightDiff = season.dayNightDiff
    
    // 计算最高最低温
    const tempHigh = Math.round(baseTemp + dayNightDiff / 2)
    const tempLow = Math.round(baseTemp - dayNightDiff / 2)
    
    dayData.tempHigh = tempHigh
    dayData.tempLow = tempLow
    
    // 为每个时段计算温度
    if (dayData.hourly) {
      for (const hourData of dayData.hourly) {
        const hour = parseInt(hourData.time.split(':')[0])
        const curve = TEMP_CURVE[hour] !== undefined ? TEMP_CURVE[hour] : 0.5
        
        // 基础温度插值
        let temp = tempLow + (tempHigh - tempLow) * curve
        
        // 根据该时段具体天气微调
        const hourWeatherMod = WEATHER_TEMP_MODIFIERS[hourData.weather] || { dayBonus: 0, nightBonus: 0 }
        const isDay = hour >= 6 && hour < 18
        temp += isDay ? hourWeatherMod.dayBonus * 0.3 : hourWeatherMod.nightBonus * 0.3
        
        hourData.temp = Math.round(temp)
      }
    }
    
    prevDayAvgTemp = baseTemp
  }
}

// ============ 对外接口函数 ============

/**
 * 生成7天天气预报（主入口函数）
 * @param {number} year 起始年
 * @param {number} month 起始月
 * @param {number} day 起始日
 * @param {string} currentWeather 当前天气类型（可选，用于延续之前的天气）
 * @param {string} lastWeatherOfPreviousDay 前一天最后时刻的天气（可选，用于平滑过渡）
 * @returns {Object} 完整天气数据
 */
export function generateWeatherForecast(year, month, day, currentWeather = null, lastWeatherOfPreviousDay = null) {
  // 使用传入的天气作为初始状态，优先使用 lastWeatherOfPreviousDay
  const initialWeather = lastWeatherOfPreviousDay || currentWeather
  
  // 生成连续的天气流（7天 = 84个时段）
  const weatherStream = generateContinuousWeatherStream(year, month, day, initialWeather, 84)
  
  // 聚合为每日预报
  const dailyForecast = aggregateToDaily(weatherStream)
  
  // 生成温度数据
  generateTemperatures(dailyForecast, year, month, day)
  
  // 获取当前季节
  const season = getSeason(month)
  
  // 构建当前时刻的天气信息
  const currentHour = new Date().getHours()
  const timePoint = Math.floor(currentHour / 2) * 2
  const timeStr = `${String(timePoint).padStart(2, '0')}:00`
  
  let currentTemp = Math.round((dailyForecast[0].tempHigh + dailyForecast[0].tempLow) / 2)
  let currentWeatherName = dailyForecast[0].weatherName
  let currentIcon = dailyForecast[0].icon
  let currentWeatherType = dailyForecast[0].weather
  
  if (dailyForecast[0].hourly) {
    const hourlyData = dailyForecast[0].hourly.find(h => h.time === timeStr)
    if (hourlyData) {
      currentTemp = hourlyData.temp
      currentWeatherName = hourlyData.weatherName
      currentIcon = hourlyData.icon
      currentWeatherType = hourlyData.weather
    }
  }
  
  return {
    current: {
      weather: currentWeatherType,
      weatherName: currentWeatherName,
      icon: currentIcon,
      temperature: currentTemp,
      tempHigh: dailyForecast[0].tempHigh,
      tempLow: dailyForecast[0].tempLow
    },
    forecast: dailyForecast,
    lastUpdateDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    season: season.key
  }
}

/**
 * 获取指定小时的天气信息
 * @param {Object} weatherData 完整天气数据
 * @param {number} hour 当前小时 (0-23)
 * @returns {Object} 当前天气信息
 */
export function getCurrentWeatherAtHour(weatherData, hour) {
  if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
    return null
  }
  
  const today = weatherData.forecast[0]
  if (!today.hourly || today.hourly.length === 0) {
    return {
      weather: today.weather,
      weatherName: today.weatherName,
      icon: today.icon,
      temp: Math.round((today.tempHigh + today.tempLow) / 2)
    }
  }
  
  // 找到最接近的时间点
  const timePoint = Math.floor(hour / 2) * 2
  const timeStr = `${String(timePoint).padStart(2, '0')}:00`
  
  const hourlyData = today.hourly.find(h => h.time === timeStr)
  if (hourlyData) {
    return {
      weather: hourlyData.weather,
      weatherName: hourlyData.weatherName,
      icon: hourlyData.icon,
      temp: hourlyData.temp
    }
  }
  
  return {
    weather: today.weather,
    weatherName: today.weatherName,
    icon: today.icon,
    temp: Math.round((today.tempHigh + today.tempLow) / 2)
  }
}

/**
 * 检测天气变化（用于生成提示词）
 * @param {Object} weatherData 天气数据
 * @param {number} previousHour 上一个时间点
 * @param {number} currentHour 当前时间点
 * @returns {Object|null} 天气变化信息或null
 */
export function detectWeatherChange(weatherData, previousHour, currentHour) {
  if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
    return null
  }
  
  const today = weatherData.forecast[0]
  if (!today.hourly || today.hourly.length === 0) {
    return null
  }
  
  const prevTimePoint = Math.floor(previousHour / 2) * 2
  const currTimePoint = Math.floor(currentHour / 2) * 2
  
  if (prevTimePoint === currTimePoint) {
    return null // 同一时段，无变化
  }
  
  const prevTimeStr = `${String(prevTimePoint).padStart(2, '0')}:00`
  const currTimeStr = `${String(currTimePoint).padStart(2, '0')}:00`
  
  const prevHourly = today.hourly.find(h => h.time === prevTimeStr)
  const currHourly = today.hourly.find(h => h.time === currTimeStr)
  
  if (!prevHourly || !currHourly) {
    return null
  }
  
  if (prevHourly.weather !== currHourly.weather) {
    return {
      fromWeather: prevHourly.weatherName,
      toWeather: currHourly.weatherName,
      fromIcon: prevHourly.icon,
      toIcon: currHourly.icon,
      reason: generateWeatherChangeReason(prevHourly.weather, currHourly.weather)
    }
  }
  
  return null
}

/**
 * 生成天气变化原因描述
 */
function generateWeatherChangeReason(fromWeather, toWeather) {
  const fromInfo = WEATHER_TYPES[fromWeather]
  const toInfo = WEATHER_TYPES[toWeather]
  
  // 转晴
  if (toWeather === 'sunny') {
    if (fromInfo?.category === 'rain') {
      return '雨过天晴，阳光洒落'
    } else if (fromInfo?.category === 'cloudy') {
      return '云层散开，天空放晴'
    } else if (fromWeather === 'fog') {
      return '晨雾散去，阳光明媚'
    } else if (fromWeather === 'thunderstorm') {
      return '雷雨过后，天空放晴'
    }
    return '天气转晴'
  }
  
  // 转多云
  if (toWeather === 'partly_cloudy') {
    if (fromWeather === 'sunny') {
      return '天边飘来几朵云彩'
    } else if (fromInfo?.category === 'rain') {
      return '雨势渐停，云层变薄'
    }
    return '天空变得多云'
  }
  
  // 转阴
  if (toInfo?.category === 'cloudy') {
    if (fromWeather === 'sunny' || fromWeather === 'partly_cloudy') {
      return '云层逐渐聚集，遮住了阳光'
    } else if (fromInfo?.category === 'rain') {
      return '雨势渐停，但天空仍然阴沉'
    }
    return '天空变得阴沉'
  }
  
  // 开始下雨
  if (toInfo?.category === 'rain') {
    if (toWeather === 'light_rain') {
      return '天空开始飘起细雨'
    } else if (toWeather === 'rain') {
      return '雨势逐渐加大'
    } else if (toWeather === 'heavy_rain') {
      return '倾盆大雨从天而降'
    }
    return '开始下雨'
  }
  
  // 雷雨
  if (toWeather === 'thunderstorm') {
    return '乌云密布，雷声隆隆，暴风雨即将来临'
  }
  
  // 下雪
  if (toInfo?.category === 'snow') {
    if (toWeather === 'light_snow') {
      return '天空飘起了雪花'
    } else if (toWeather === 'snow') {
      return '雪越下越大'
    } else if (toWeather === 'heavy_snow') {
      return '漫天大雪纷飞'
    }
    return '开始下雪'
  }
  
  // 雾
  if (toWeather === 'fog') {
    return '雾气弥漫，能见度下降'
  }
  
  // 霾
  if (toWeather === 'haze') {
    return '空气质量下降，天空灰蒙蒙的'
  }
  
  return `天气从${fromInfo?.name || fromWeather}变为${toInfo?.name || toWeather}`
}

// ============ 辅助函数 ============

/**
 * 获取天气背景渐变色
 */
export function getWeatherGradient(weatherType) {
  const gradients = {
    sunny: 'linear-gradient(135deg, #56CCF2 0%, #2F80ED 100%)',
    partly_cloudy: 'linear-gradient(135deg, #89CFF0 0%, #5DADE2 100%)',
    cloudy: 'linear-gradient(135deg, #8E9EAB 0%, #B8C6DB 100%)',
    overcast: 'linear-gradient(135deg, #636e72 0%, #b2bec3 100%)',
    light_rain: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    rain: 'linear-gradient(135deg, #4B6CB7 0%, #182848 100%)',
    heavy_rain: 'linear-gradient(135deg, #1F1C2C 0%, #928DAB 100%)',
    thunderstorm: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    light_snow: 'linear-gradient(135deg, #E6DADA 0%, #274046 100%)',
    snow: 'linear-gradient(135deg, #D7DDE8 0%, #757F9A 100%)',
    heavy_snow: 'linear-gradient(135deg, #E8E8E8 0%, #5C5C5C 100%)',
    fog: 'linear-gradient(135deg, #B6BDBD 0%, #8A9A9A 100%)',
    haze: 'linear-gradient(135deg, #948E99 0%, #2E1437 100%)'
  }
  return gradients[weatherType] || gradients.sunny
}

/**
 * 获取天气描述（用于提示词）
 * @param {Object} weatherData 天气数据
 * @returns {string} 天气描述
 */
export function getWeatherDescription(weatherData) {
  if (!weatherData || !weatherData.current) {
    return '天气晴朗'
  }
  
  const { weatherName, temperature, icon } = weatherData.current
  return `${icon} ${weatherName}，气温${temperature}°C`
}

/**
 * 判断是否是恶劣天气
 * @param {string} weatherType 天气类型
 * @returns {boolean}
 */
export function isSevereWeather(weatherType) {
  const severeTypes = ['heavy_rain', 'thunderstorm', 'heavy_snow', 'haze']
  return severeTypes.includes(weatherType)
}

/**
 * 判断是否是雨天
 * @param {string} weatherType 天气类型
 * @returns {boolean}
 */
export function isRainyWeather(weatherType) {
  const rainyTypes = ['light_rain', 'rain', 'heavy_rain', 'thunderstorm']
  return rainyTypes.includes(weatherType)
}

/**
 * 判断是否是雪天
 * @param {string} weatherType 天气类型
 * @returns {boolean}
 */
export function isSnowyWeather(weatherType) {
  const snowyTypes = ['light_snow', 'snow', 'heavy_snow']
  return snowyTypes.includes(weatherType)
}

/**
 * 获取天气对户外活动的影响描述
 * @param {string} weatherType 天气类型
 * @returns {string}
 */
export function getWeatherActivityImpact(weatherType) {
  const impacts = {
    sunny: '非常适合户外活动',
    partly_cloudy: '适合户外活动',
    cloudy: '可以进行户外活动',
    overcast: '户外活动可能受影响',
    light_rain: '建议携带雨具',
    rain: '不适合户外活动',
    heavy_rain: '请避免外出',
    thunderstorm: '请待在室内，注意安全',
    light_snow: '注意保暖',
    snow: '路面可能湿滑，注意安全',
    heavy_snow: '建议减少外出',
    fog: '能见度低，出行注意安全',
    haze: '建议减少户外活动，戴好口罩'
  }
  return impacts[weatherType] || '天气状况一般'
}

// ============ 文件结束 ============
