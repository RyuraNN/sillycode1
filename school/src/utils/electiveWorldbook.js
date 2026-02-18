import { useGameStore } from '../stores/gameStore'
import { getCourseById } from '../data/coursePoolData'
import { seededRandom } from './random'
import { getWeekdayChinese } from './scheduleGenerator'
import { getCurrentBookName, isWorldbookAvailable } from './worldbookHelper'

/**
 * 选修课世界书管理器
 * 负责检测课表重合并生成世界书条目
 */

// 条目命名前缀
const ENTRY_PREFIX = '选修课_'

/**
 * 检测世界书 API 是否可用
 * @returns {boolean}
 */
function isWorldbookApiReady() {
  return isWorldbookAvailable() &&
         typeof window.createWorldbookEntries === 'function' &&
         typeof window.deleteWorldbookEntries === 'function'
}

/**
 * 获取目标世界书名称
 * @returns {string|null}
 */
function getTargetWorldbookName() {
  return getCurrentBookName()
}

/**
 * 生成选修课世界书条目
 * @param {string} runId 当前存档运行ID
 * @param {Array} playerElectives 玩家选择的选修课ID列表
 * @param {Object} npcSelections NPC选课数据 { studentName: [courseId, ...] }
 * @param {Object} playerSchedule 玩家课表 (用于精确匹配时间段)
 */
export async function updateElectiveWorldbookEntries(runId, playerElectives, npcSelections, playerSchedule) {
  // 检查世界书 API 是否可用
  if (!isWorldbookApiReady()) {
    console.warn('[ElectiveWorldbook] Worldbook API not available, skipping update')
    return
  }

  const targetBook = getTargetWorldbookName()
  if (!targetBook) {
    console.warn('[ElectiveWorldbook] No target worldbook found, skipping update')
    return
  }
  
  try {

  console.log('[ElectiveWorldbook] Updating entries for run:', runId, 'in book:', targetBook)
  
  // 1. 清理旧条目（当前存档的）
  await window.deleteWorldbookEntries(targetBook, entry => 
    entry.name.startsWith(`${ENTRY_PREFIX}`) && entry.name.includes(`_${runId}`)
  )
  
  // 2. 遍历玩家课表，找到所有选修课的时间段
  // 数据结构：schedule[day][slotIndex]
  
  const newEntries = []
  
  // 遍历每一天
  for (const [day, slots] of Object.entries(playerSchedule)) {
    if (!Array.isArray(slots)) continue
    
    // 遍历每个时间段
    for (const slot of slots) {
      // 检查是否是选修课
      if (slot && slot.isElective && !slot.isEmpty && slot.courseId) {
        const courseId = slot.courseId
        const courseName = slot.subject
        
        // 3. 确定哪些NPC在 *这个具体时间段* 也选了这门课
        // 使用确定性随机数，基于 runId + studentName + courseId + day + period
        // 假设NPC选了这门课，有50%的概率被分到这个班级（如果这门课有多个时段）
        // 实际上，如果系统只生成了玩家的课表，我们只能模拟NPC的排课
        
        const classmates = ['你']
        
        // 遍历所有NPC的选择
        for (const [studentName, courses] of Object.entries(npcSelections)) {
          if (courses.includes(courseId)) {
            // NPC选了这门课，检查是否分配到同一班级
            // 种子：runId + 学生名 + 课程ID + 星期 + 节次
            // 这样对于同一个存档、同一个学生、同一节课，结果是固定的
            const seedStr = `${runId}_${studentName}_${courseId}_${day}_${slot.period}`
            // 简单哈希
            let hash = 0
            for (let i = 0; i < seedStr.length; i++) {
              hash = ((hash << 5) - hash) + seedStr.charCodeAt(i)
              hash |= 0
            }
            const rng = seededRandom(Math.abs(hash))
            
            // 假设有25%概率分到同班 (模拟4个班次)
            if (rng() > 0.75) {
              classmates.push(studentName)
            }
          }
        }
        
        // 4. 生成世界书条目
        // 条目名称包含时间信息以区分不同时段的同名课程
        // 格式：选修课_课程名_星期_节次_runId
        const weekdayCN = getWeekdayChinese(day)
        const entryName = `${ENTRY_PREFIX}${courseName}_${day}_${slot.period}_${runId}`
        const studentList = classmates.join(', ')
        
        const content = `[选修课信息]
时间：${weekdayCN} 第${slot.period}节
课程：${courseName}
教师：${slot.teacher || '未知'}
地点：${slot.location || '未知'}
同学：${studentList}
(这是玩家当前正在上的选修课)`

        newEntries.push({
          name: entryName,
          enabled: true,
          strategy: {
            type: 'constant', // 蓝灯
            keys: [],
            keys_secondary: { logic: 'not_all', keys: [] },
            scan_depth: 'same_as_global'
          },
          position: {
            type: 'after_character_definition',
            order: 5 
          },
          content: content,
          probability: 100,
          recursion: { prevent_outgoing: true },
          effect: {}
        })
      }
    }
  }
  
    if (newEntries.length > 0) {
      await window.createWorldbookEntries(targetBook, newEntries)
      console.log(`[ElectiveWorldbook] Created ${newEntries.length} entries`)
    }
  } catch (e) {
    console.error('[ElectiveWorldbook] Error updating entries:', e)
  }
}

/**
 * 清除所有选修课条目（用于新学期重置）
 * @param {string} runId 当前存档运行ID
 */
export async function clearElectiveEntries(runId) {
  if (!isWorldbookApiReady()) {
    console.warn('[ElectiveWorldbook] Worldbook API not available, skipping clear')
    return
  }

  const targetBook = getTargetWorldbookName()
  if (!targetBook) return

  try {
    await window.deleteWorldbookEntries(targetBook, entry => 
      entry.name.startsWith(`${ENTRY_PREFIX}`) && entry.name.includes(`_${runId}`)
    )
    console.log('[ElectiveWorldbook] Cleared all elective entries')
  } catch (e) {
    console.error('[ElectiveWorldbook] Error clearing entries:', e)
  }
}

/**
 * 同步选修课世界书状态（切换存档时调用）
 * @param {string} currentRunId 当前存档ID
 */
export async function syncElectiveWorldbookState(currentRunId) {
  // 检查 API 是否可用
  if (typeof window.updateWorldbookWith !== 'function') {
    console.warn('[ElectiveWorldbook] updateWorldbookWith not available, skipping sync')
    return
  }

  const targetBook = getTargetWorldbookName()
  if (!targetBook) {
    console.warn('[ElectiveWorldbook] No target worldbook, skipping sync')
    return
  }

  console.log(`[ElectiveWorldbook] Syncing state for run ${currentRunId}`)

  try {
    await window.updateWorldbookWith(targetBook, (entries) => {
      return entries.map(entry => {
        // 检查是否是选修课条目
        if (entry.name && entry.name.startsWith(ENTRY_PREFIX)) {
          // 检查 RunID 后缀
          // 格式: ..._runId
          const parts = entry.name.split('_')
          const entryRunId = parts[parts.length - 1]
          
          if (entryRunId === currentRunId) {
            return { ...entry, enabled: true }
          } else {
            // 其他存档的条目，禁用
            return { ...entry, enabled: false }
          }
        }
        return entry
      })
    })
  } catch (e) {
    console.error('[ElectiveWorldbook] Error syncing state:', e)
  }
}
