// 名册数据管理 Composable
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { saveRosterBackup, getRosterBackup } from '../utils/indexedDB'
import {
  createDefaultRosterBackupWorldbook,
  hasBackupWorldbook,
  fetchAcademicDataFromWorldbook
} from '../utils/worldbookParser'

export function useRosterData() {
  const gameStore = useGameStore()
  const loading = ref(true)
  const fullRosterSnapshot = ref({})
  const currentRosterState = ref({})
  const originGroups = ref({})

  // 提取干净的作品名（去掉括号）
  const getCleanOrigin = (origin) => {
    if (!origin) return '未知'
    const match = origin.match(/^[\(（\[【](.+?)[\)）\]】]$/)
    return match ? match[1] : origin
  }

  // 获取学生所属社团
  const getStudentClubs = (studentName) => {
    const clubs = []
    if (gameStore.allClubs) {
      for (const [clubId, club] of Object.entries(gameStore.allClubs)) {
        let role = ''
        let isMember = false

        if (club.president === studentName) role = '社长'
        else if (club.vicePresident === studentName) role = '副社长'
        else if (club.members?.includes(studentName)) isMember = true

        if (role || isMember) {
          clubs.push({ id: clubId, name: club.name, role })
        }
      }

      // 去重
      const uniqueMap = new Map()
      for (const c of clubs) {
        if (uniqueMap.has(c.name)) {
          const existing = uniqueMap.get(c.name)
          if (c.role && !existing.role) {
            uniqueMap.set(c.name, c)
          }
        } else {
          uniqueMap.set(c.name, c)
        }
      }

      return Array.from(uniqueMap.values())
    }
    return clubs
  }

  // 加载名册数据
  const loadData = async (forceUpdate = false) => {
    loading.value = true
    try {
      // 确保班级数据已加载
      if (!gameStore.allClassData || Object.keys(gameStore.allClassData).length === 0) {
        console.log('[RosterFilter] Class data not loaded, loading now...')
        await gameStore.loadClassData()
      }

      // 加载并合并学力数据
      const academicMap = await fetchAcademicDataFromWorldbook()
      if (academicMap && Object.keys(academicMap).length > 0) {
        console.log('[RosterFilter] Merging academic data from worldbook database...')
        for (const classInfo of Object.values(gameStore.allClassData)) {
          if (Array.isArray(classInfo.students)) {
            classInfo.students.forEach(s => {
              if (academicMap[s.name]) {
                s.academicProfile = academicMap[s.name]
              }
            })
          }
        }
      }

      let backupData = await getRosterBackup()
      const currentData = gameStore.allClassData

      if (!backupData || Object.keys(backupData).length === 0) {
        console.log('[RosterFilter] Creating new backup from current data')
        backupData = JSON.parse(JSON.stringify(currentData))
        await saveRosterBackup(backupData)

        const hasBackup = await hasBackupWorldbook()
        if (!hasBackup) {
          await createDefaultRosterBackupWorldbook(backupData)
        }
      } else {
        console.log('[RosterFilter] Merging current data into backup', forceUpdate ? '(Forced)' : '')
        let hasChanges = false
        for (const [classId, classInfo] of Object.entries(currentData)) {
          if (!backupData[classId]) {
            backupData[classId] = JSON.parse(JSON.stringify(classInfo))
            hasChanges = true
          } else {
            // 合并学生
            const backupStudents = Array.isArray(backupData[classId].students) ? backupData[classId].students : []
            const currentStudents = Array.isArray(classInfo.students) ? classInfo.students : []

            currentStudents.forEach(curr => {
              const existing = backupStudents.find(b => b.name === curr.name)
              if (!existing) {
                backupStudents.push(JSON.parse(JSON.stringify(curr)))
                hasChanges = true
              } else {
                if (forceUpdate) {
                  if (curr.electivePreference) {
                    existing.electivePreference = curr.electivePreference
                    hasChanges = true
                  }
                  if (curr.scheduleTag) {
                    existing.scheduleTag = curr.scheduleTag
                    hasChanges = true
                  }
                } else {
                  if ((!existing.electivePreference || existing.electivePreference === 'general') && curr.electivePreference && curr.electivePreference !== 'general') {
                    existing.electivePreference = curr.electivePreference
                    hasChanges = true
                  }
                  if (!existing.scheduleTag && curr.scheduleTag) {
                    existing.scheduleTag = curr.scheduleTag
                    hasChanges = true
                  }
                }
              }
            })
            backupData[classId].students = backupStudents

            // 合并教师
            const backupTeachers = Array.isArray(backupData[classId].teachers) ? backupData[classId].teachers : []
            const currentTeachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
            currentTeachers.forEach(curr => {
              const existing = backupTeachers.find(b => b.name === curr.name)
              if (!existing) {
                if (curr.name) {
                  backupTeachers.push(JSON.parse(JSON.stringify(curr)))
                  hasChanges = true
                }
              } else if (forceUpdate && curr.subject) {
                existing.subject = curr.subject
                hasChanges = true
              }
            })
            backupData[classId].teachers = backupTeachers

            // 合并班主任
            if (classInfo.headTeacher?.name && !backupData[classId].headTeacher?.name) {
              backupData[classId].headTeacher = JSON.parse(JSON.stringify(classInfo.headTeacher))
              hasChanges = true
            }
          }
        }
        if (hasChanges) {
          await saveRosterBackup(backupData)
        }
      }

      fullRosterSnapshot.value = backupData

      // 初始化选中状态
      const state = {}
      const groups = {}

      const worldbookStudentSets = {}
      if (forceUpdate) {
        for (const [classId, classInfo] of Object.entries(currentData)) {
          const students = Array.isArray(classInfo?.students) ? classInfo.students : []
          worldbookStudentSets[classId] = new Set(students.map(s => s.name))
        }
      }

      for (const [classId, classInfo] of Object.entries(backupData)) {
        const students = Array.isArray(classInfo.students) ? classInfo.students : []

        const currentClassInfo = currentData[classId]
        const currentStudentNames = new Set(
          Array.isArray(currentClassInfo?.students)
            ? currentClassInfo.students.map(s => s.name)
            : []
        )

        state[classId] = {}

        students.forEach(student => {
          if (forceUpdate) {
            const worldbookSet = worldbookStudentSets[classId]
            state[classId][student.name] = worldbookSet ? worldbookSet.has(student.name) : true
          } else {
            state[classId][student.name] = currentStudentNames.has(student.name)
          }

          const origin = getCleanOrigin(student.origin)

          if (!groups[origin]) groups[origin] = []
          groups[origin].push({
            ...student,
            classId,
            className: classInfo.name,
            clubs: getStudentClubs(student.name),
            electivePref: student.electivePreference || 'general'
          })
        })
      }

      currentRosterState.value = state

      const sortedGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)
      const sortedGroupsObj = {}
      sortedGroups.forEach(key => {
        sortedGroupsObj[key] = groups[key]
      })
      originGroups.value = sortedGroupsObj

      console.log('[RosterFilter] Data loaded, classes:', Object.keys(backupData).length)

    } catch (e) {
      console.error('[RosterFilter] Error loading data:', e)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    fullRosterSnapshot,
    currentRosterState,
    originGroups,
    loadData,
    getCleanOrigin,
    getStudentClubs
  }
}
