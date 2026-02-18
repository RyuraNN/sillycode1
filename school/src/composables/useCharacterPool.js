// 角色池管理 Composable
import { ref } from 'vue'
import { saveFullCharacterPool, getFullCharacterPool } from '../utils/indexedDB'
import { fetchSocialData } from '../utils/socialRelationshipsWorldbook'

export function useCharacterPool() {
  const characterPool = ref([])

  // 深拷贝辅助函数
  const deepClone = (data) => {
    return JSON.parse(JSON.stringify(data))
  }

  // 加载角色池
  const loadCharacterPool = async (fullRosterSnapshot) => {
    try {
      console.log('[CharacterPool] Loading character pool...')

      // 1. 获取持久化的角色池
      let savedPool = await getFullCharacterPool()
      if (!Array.isArray(savedPool)) {
        savedPool = []
      }
      const savedMap = new Map(savedPool.map(c => [c.name, c]))

      // 1.5 从世界书获取社交数据
      const socialData = await fetchSocialData()

      // 2. 从快照构建基础角色池
      const currentPool = []
      const addedNames = new Set()
      const teacherMap = new Map()
      const snapshot = fullRosterSnapshot

      if (!snapshot || Object.keys(snapshot).length === 0) {
        console.log('[CharacterPool] Snapshot is empty, waiting...')
        characterPool.value = savedPool
        return
      }

      for (const [classId, classInfo] of Object.entries(snapshot)) {
        // 处理教师（聚合多重身份）
        if (classInfo.headTeacher?.name) {
          const name = classInfo.headTeacher.name
          if (!teacherMap.has(name)) {
            teacherMap.set(name, {
              name: name,
              gender: classInfo.headTeacher.gender || 'female',
              origin: classInfo.headTeacher.origin || '',
              classId: classId,
              role: 'teacher',
              subjects: new Set(),
              subjectsByClass: {},
              isHeadTeacher: true,
              electivePreference: 'general',
              scheduleTag: '',
              personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
            })
          } else {
            const t = teacherMap.get(name)
            t.isHeadTeacher = true
            t.classId = classId
          }
        }

        // 科任教师
        const teachers = Array.isArray(classInfo.teachers) ? classInfo.teachers : []
        teachers.forEach(t => {
          if (!t.name) return

          if (!teacherMap.has(t.name)) {
            teacherMap.set(t.name, {
              name: t.name,
              gender: t.gender || 'female',
              origin: t.origin || '',
              classId: classId,
              role: 'teacher',
              subjects: new Set(),
              subjectsByClass: {},
              isHeadTeacher: false,
              electivePreference: 'general',
              scheduleTag: '',
              personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
            })
          }

          const teacherObj = teacherMap.get(t.name)
          if (t.subject) {
            teacherObj.subjectsByClass[classId] = t.subject
            t.subject.split(/[,，、]/).forEach(s => {
              const trimmed = s.trim()
              if (trimmed) teacherObj.subjects.add(trimmed)
            })
          }
        })

        // 处理学生
        const students = Array.isArray(classInfo.students) ? classInfo.students : []
        students.forEach(s => {
          if (s.name && !addedNames.has(s.name)) {
            const char = {
              name: s.name,
              gender: s.gender || 'female',
              origin: s.origin || '',
              classId,
              role: 'student',
              subject: '',
              isHeadTeacher: false,
              electivePreference: s.electivePreference || 'general',
              scheduleTag: s.scheduleTag || '',
              notes: s.notes || '',
              personality: s.personality || { order: 0, altruism: 0, tradition: 0, peace: 50 },
              academicProfile: s.academicProfile || { level: 'avg', potential: 'medium', traits: [] }
            }

            // 辅助函数：判断是否为默认值
            const isDefaultPersonality = (p) => {
              return p && p.order === 0 && p.altruism === 0 && p.tradition === 0 && p.peace === 50
            }
            const isDefaultAcademic = (a) => {
              return a && a.level === 'avg' && a.potential === 'medium' && (!a.traits || a.traits.length === 0)
            }

            // 数据合并优先级：用户手动编辑(savedMap) > 世界书最新数据(snapshot) > 社交数据(socialData)
            // 1. 先应用社交数据（最低优先级）
            if (socialData && socialData[s.name]) {
              const social = socialData[s.name]
              if (social.personality && !isDefaultPersonality(social.personality)) {
                char.personality = social.personality
              }
            }

            // 2. 再应用快照数据（中优先级）
            if (s.personality && !isDefaultPersonality(s.personality)) {
              char.personality = s.personality
            }
            if (s.academicProfile && !isDefaultAcademic(s.academicProfile)) {
              char.academicProfile = s.academicProfile
            }

            // 3. 最后应用已保存的数据（最高优先级 - 用户手动编辑）
            if (savedMap.has(s.name)) {
              const saved = savedMap.get(s.name)
              // 只有非默认值才覆盖
              if (saved.personality && !isDefaultPersonality(saved.personality)) {
                char.personality = saved.personality
              }
              if (saved.academicProfile && !isDefaultAcademic(saved.academicProfile)) {
                char.academicProfile = saved.academicProfile
              }
              if (saved.notes) char.notes = saved.notes
              if (saved.grade !== undefined) char.grade = saved.grade
              // 只有当快照没有非默认偏好时，才用已保存的覆盖
              if (saved.electivePreference && saved.electivePreference !== 'general') {
                char.electivePreference = saved.electivePreference
              }
              if (saved.scheduleTag) char.scheduleTag = saved.scheduleTag
            }

            // 4. 快照中的偏好优先级最高（来自世界书解析）
            if (s.electivePreference && s.electivePreference !== 'general') {
              char.electivePreference = s.electivePreference
            }

            currentPool.push(char)
            addedNames.add(s.name)
          }
        })
      }

      // 处理教师
      for (const teacher of teacherMap.values()) {
        const char = {
          name: teacher.name,
          gender: teacher.gender,
          origin: teacher.origin,
          classId: teacher.classId,
          role: 'teacher',
          subject: Array.from(teacher.subjects).join(', '),
          subjectsByClass: teacher.subjectsByClass,
          isHeadTeacher: teacher.isHeadTeacher,
          electivePreference: 'general',
          scheduleTag: '',
          personality: { order: 0, altruism: 0, tradition: 0, peace: 50 }
        }

        const isDefaultPersonality = (p) => {
          return p && p.order === 0 && p.altruism === 0 && p.tradition === 0 && p.peace === 50
        }

        // 1. 社交数据（低优先级）
        if (socialData && socialData[teacher.name]) {
          const social = socialData[teacher.name]
          if (social.personality && !isDefaultPersonality(social.personality)) {
            char.personality = social.personality
          }
        }

        // 2. 已保存的数据（高优先级 - 用户手动编辑）
        if (savedMap.has(teacher.name)) {
          const saved = savedMap.get(teacher.name)
          if (saved.personality && !isDefaultPersonality(saved.personality)) {
            char.personality = saved.personality
          }
          if (saved.notes) char.notes = saved.notes
          if (saved.assignments) char.assignments = saved.assignments
        }

        currentPool.push(char)
      }

      // 添加自定义角色
      for (const saved of savedPool) {
        if (!addedNames.has(saved.name) && !teacherMap.has(saved.name)) {
          currentPool.push(saved)
        }
      }

      characterPool.value = currentPool
      console.log('[CharacterPool] Loaded', currentPool.length, 'characters')

    } catch (e) {
      console.error('[CharacterPool] Error loading character pool:', e)
    }
  }

  // 保存角色池
  const saveCharacterPool = async () => {
    await saveFullCharacterPool(deepClone(characterPool.value))
  }

  // 同步角色池到快照
  const syncCharacterPoolToSnapshot = (fullRosterSnapshot) => {
    for (const classInfo of Object.values(fullRosterSnapshot)) {
      if (Array.isArray(classInfo.students)) {
        classInfo.students.forEach(s => {
          const poolChar = characterPool.value.find(c => c.name === s.name)
          if (poolChar) {
            if (poolChar.personality) s.personality = poolChar.personality
            if (poolChar.academicProfile) s.academicProfile = poolChar.academicProfile
            if (poolChar.electivePreference) s.electivePreference = poolChar.electivePreference
            if (poolChar.scheduleTag) s.scheduleTag = poolChar.scheduleTag
            if (poolChar.notes) s.notes = poolChar.notes
          }
        })
      }
    }
  }

  return {
    characterPool,
    loadCharacterPool,
    saveCharacterPool,
    syncCharacterPoolToSnapshot,
    deepClone
  }
}
