<template>
  <div class="schedule-app" :class="{ 'vacation-mode': isVacation && activeTab === 'schedule' }">
    <!-- 头部 -->
    <div class="schedule-header">
      <div class="header-title">
        <span class="app-logo">🏫</span>
        <span class="app-name">天华通</span>
      </div>
      <div class="header-subtitle">{{ getHeaderSubtitle }}</div>
    </div>

    <!-- 标签页导航 (5个tab) -->
    <div class="tab-nav">
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        <span class="tab-icon">📅</span>
        <span class="tab-label">课表</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'clubs' }"
        @click="activeTab = 'clubs'"
      >
        <span class="tab-icon">🎭</span>
        <span class="tab-label">社团</span>
        <span v-if="hasNewClubNotification" class="tab-badge">!</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'grades' }"
        @click="activeTab = 'grades'"

      >
        <span class="tab-icon">📊</span>
        <span class="tab-label">成绩</span>
        <span v-if="hasNewExam" class="tab-badge">!</span>
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'forum' }"
        @click="activeTab = 'forum'"
      >
        <span class="tab-icon">📝</span>
        <span class="tab-label">论坛</span>
        <span v-if="pendingForumCount > 0" class="tab-badge">{{ pendingForumCount }}</span>
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'profile' }"
        @click="activeTab = 'profile'"
      >
        <span class="tab-icon">🆔</span>
        <span class="tab-label">档案</span>
      </div>
    </div>

    <!-- 课表标签页内容 -->
    <div v-if="activeTab === 'schedule'" class="tab-content">
      <!-- 假期模式 -->
      <div v-if="isVacation" class="vacation-overlay">
        <div class="vacation-content">
          <div class="vacation-icon">🌴</div>
          <div class="vacation-title">{{ vacationName }}</div>
          <div class="vacation-text">假期中，无课程安排</div>
          <div class="vacation-hint">好好休息，享受假期吧！</div>
        </div>
      </div>

      <!-- 课表网格 -->
      <div v-else class="schedule-table-container">
        <table class="schedule-table">
          <!-- 表头：星期 -->
          <thead>
            <tr>
              <th class="period-header">节次</th>
              <th v-for="day in weekdays" :key="day.en" class="day-header" :class="{ 'today': isToday(day.en) }">
                <div class="day-name">{{ day.cn }}</div>
              </th>
            </tr>
          </thead>
          <!-- 表体：课程 -->
          <tbody>
            <tr v-for="period in periods" :key="period.period" class="period-row">
              <td class="period-cell">
                <div class="period-num">{{ period.period }}</div>
                <div class="period-time">{{ period.start }}</div>
                <div class="period-time">{{ period.end }}</div>
              </td>
              <td 
                v-for="day in weekdays" 
                :key="day.en + '-' + period.period" 
                class="class-cell"
                :class="{ 
                  'today': isToday(day.en),
                  'current': isCurrentClass(day.en, period.period),
                  'holiday-cell': getHolidayInfo(day.en, period)?.holidayType === 'full',
                  'exam-cell': getHolidayInfo(day.en, period)?.holidayType === 'exam',
                  'partial-holiday-cell': ['am_off', 'pm_off'].includes(getHolidayInfo(day.en, period)?.holidayType),
                  'empty': isEmptySlot(day.en, period.period) && !getHolidayInfo(day.en, period)
                }"
              >
                <!-- 优先显示假期信息 -->
                <template v-if="getHolidayInfo(day.en, period)">
                  <div class="holiday-content">
                    <span class="holiday-icon" v-if="getHolidayInfo(day.en, period).holidayType === 'exam'">📝</span>
                    <span class="holiday-icon" v-else>🏖️</span>
                    <span class="holiday-name">{{ getHolidayInfo(day.en, period).eventInfo?.name }}</span>
                  </div>
                </template>
                
                <!-- 否则显示课程 -->
                <template v-else-if="!isEmptySlot(day.en, period.period)">
                  <div class="class-subject">{{ getClassInfo(day.en, period.period)?.subject }}</div>
                  <div class="class-location">{{ getClassInfo(day.en, period.period)?.location }}</div>
                  <!-- 教师模式下显示班级 -->
                  <div v-if="gameStore.player.role === 'teacher'" class="class-name-tag">{{ getClassInfo(day.en, period.period)?.className }}</div>
                </template>
                
                <!-- 空课 -->
                <template v-else>
                  <div class="empty-slot">-</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部信息 -->
      <div class="schedule-footer">
        <div class="class-info">
          <span class="label">{{ gameStore.player.role === 'teacher' ? '班主任：' : '班级：' }}</span>
          <span class="value">{{ gameStore.player.role === 'teacher' ? (gameStore.player.homeroomClassIds?.length > 0 ? gameStore.player.homeroomClassIds.join(', ') : (gameStore.player.homeroomClassId || '未担任')) : (playerClass || '未分配') }}</span>
        </div>
        <div class="week-info" v-if="!isVacation">
          <span class="label">{{ termName }} </span>
          <span class="value">第 {{ weekNumber }} 周</span>
        </div>
        <div class="week-info vacation-tag" v-else>
          <span class="value">🌴 假期中</span>
        </div>
      </div>

      <!-- 选修课选择器 (仅学生) -->
      <ElectiveCourseSelector v-if="playerClass && !isVacation && gameStore.player.role !== 'teacher'" />

      <!-- 无课表提示（非假期时） -->
      <div v-if="!hasSchedule && !isVacation" class="no-schedule">
        <div class="no-schedule-icon">📚</div>
        <div class="no-schedule-text">暂无课表数据</div>
        <div class="no-schedule-hint">{{ gameStore.player.role === 'teacher' ? '暂无教学安排' : '请先在游戏中分配班级' }}</div>
      </div>
    </div>

    <!-- 社团标签页内容 -->
    <div v-if="activeTab === 'clubs'" class="tab-content clubs-content">
      <!-- 我的社团区域 -->
      <div v-if="joinedClubsCount > 0" class="my-clubs-section">
        <div class="section-header">
          <div class="section-icon-wrapper">
            <span class="section-icon">⭐</span>
          </div>
          <span class="section-title">我的社团</span>
          <span class="section-count">{{ joinedClubsCount }}个</span>
        </div>
        <div class="club-cards-grid">
          <div 
            v-for="club in joinedClubs" 
            :key="club.id" 
            class="club-card my-club"
            @click="selectedClub = club"
          >
            <div class="club-card-bg"></div>
            <div class="club-card-content">
              <div class="club-avatar">
                <span class="club-emoji">🎭</span>
              </div>
              <div class="club-details">
                <div class="club-name">{{ club.name }}</div>
                <div class="club-stats">
                  <span class="stat-item">
                    <span class="stat-icon">👥</span>
                    {{ club.members?.length || 0 }}人
                  </span>
                  <span class="stat-item">
                    <span class="stat-icon">📅</span>
                    {{ club.activityDay || '未定' }}
                  </span>
                </div>
                <div v-if="club.location" class="club-location">
                  <span class="location-icon">📍</span>
                  {{ club.location }}
                </div>
              </div>
              <div class="club-role-badge president" v-if="isPresident(club, gameStore.player.name)">
                <span>部长</span>
              </div>
              <div class="club-role-badge vice-president" v-else-if="isVicePresident(club, gameStore.player.name)">
                <span>副部长</span>
              </div>
              <div class="club-role-badge member" v-else>
                <span>成员</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建社团横幅 -->
      <div class="create-club-section" v-if="gameStore.player.role !== 'teacher'">
        <div class="create-club-card" @click="showCreateClubModal = true">
          <div class="create-card-glow"></div>
          <div class="create-card-content">
            <div class="create-icon-wrapper">
              <span class="create-icon">✨</span>
              <div class="create-icon-ring"></div>
            </div>
            <div class="create-text">
              <div class="create-title">创建新社团</div>
              <div class="create-desc">召集志同道合的伙伴，开启你的社团传奇！</div>
            </div>
            <div class="create-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- 其他社团列表 -->
      <div class="other-clubs-section">
        <div class="section-header">
          <div class="section-icon-wrapper">
            <span class="section-icon">📋</span>
          </div>
          <span class="section-title">{{ joinedClubsCount > 0 ? '其他社团' : '社团列表' }}</span>
        </div>
        
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <div class="loading-text">加载中...</div>
        </div>

        <div v-else-if="availableClubs.length === 0" class="empty-state">
          <div class="empty-illustration">
            <span class="empty-icon">🎭</span>
            <div class="empty-particles">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div class="empty-text">暂无可加入的社团</div>
          <div class="empty-hint">创建一个属于你的社团吧！</div>
        </div>

        <div v-else class="club-cards-list">
          <div 
            v-for="club in availableClubs" 
            :key="club.id" 
            class="club-card available"
            :class="{ 'disabled': !canJoinClub(club.id) }"
            @click="selectedClub = club"
          >
            <div class="club-card-content">
              <div class="club-avatar">
                <span class="club-emoji">🎭</span>
              </div>
              <div class="club-details">
                <div class="club-name">{{ club.name }}</div>
                <div class="club-stats">
                  <span class="stat-item">
                    <span class="stat-icon">👥</span>
                    {{ club.members?.length || 0 }}人
                  </span>
                  <span class="stat-item">
                    <span class="stat-icon">📅</span>
                    {{ club.activityDay || '未定' }}
                  </span>
                </div>
                <div class="club-desc">{{ truncate(club.description, 40) }}</div>
              </div>
              <div class="club-action">
                <template v-if="gameStore.player.role === 'teacher'">
                  <button 
                    v-if="!club.advisor"
                    class="join-btn"
                    @click.stop="handleJoinClub(club.id)"
                  >
                    <span class="btn-icon">👨‍🏫</span>
                    指导
                  </button>
                  <span v-else class="disabled-hint">
                    <span class="lock-icon">🔒</span>
                    已有指导
                  </span>
                </template>
                <template v-else>
                  <button 
                    v-if="canJoinClub(club.id)"
                    class="join-btn"
                    @click.stop="handleJoinClub(club.id)"
                  >
                    <span class="btn-icon">✋</span>
                    申请
                  </button>
                  <span v-else class="disabled-hint">
                    <span class="lock-icon">🔒</span>
                    需邀请
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 社团详情弹窗 -->
      <Teleport to="body">
      <div v-if="selectedClub" class="club-modal-overlay" @click.self="selectedClub = null">
        <div class="club-modal">
          <div class="modal-header-bg"></div>
          <div class="modal-header">
            <div class="modal-club-avatar">
              <span class="club-emoji-lg">🎭</span>
            </div>
            <div class="modal-club-title">{{ selectedClub.name }}</div>
            <button class="modal-close" @click="selectedClub = null">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="modal-body">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-icon">👨‍🏫</span>
                <div class="info-content">
                  <span class="info-label">指导老师</span>
                  <span class="info-value">{{ selectedClub.advisor || '无' }}</span>
                </div>
              </div>
              <div class="info-item">
                <span class="info-icon">👑</span>
                <div class="info-content">
                  <span class="info-label">部长</span>
                  <span class="info-value">{{ formatRoleList(selectedClub.president) }}</span>
                </div>
              </div>
              <div class="info-item" v-if="selectedClub.vicePresident && (Array.isArray(selectedClub.vicePresident) ? selectedClub.vicePresident.length > 0 : selectedClub.vicePresident)">
                <span class="info-icon">🎖️</span>
                <div class="info-content">
                  <span class="info-label">副部长</span>
                  <span class="info-value">{{ formatRoleList(selectedClub.vicePresident) }}</span>
                </div>
              </div>
              <div class="info-item">
                <span class="info-icon">🎯</span>
                <div class="info-content">
                  <span class="info-label">核心技能</span>
                  <span class="info-value">{{ selectedClub.coreSkill || '无' }}</span>
                </div>
              </div>
              <div class="info-item">
                <span class="info-icon">📅</span>
                <div class="info-content">
                  <span class="info-label">活动日</span>
                  <span class="info-value">{{ selectedClub.activityDay || '未定' }}</span>
                </div>
              </div>
              <div class="info-item">
                <span class="info-icon">📍</span>
                <div class="info-content">
                  <span class="info-label">活动地点</span>
                  <span class="info-value">{{ selectedClub.location || '未定' }}</span>
                </div>
              </div>
            </div>

            <div class="info-section">
              <div class="section-label">
                <span class="label-icon">📝</span>
                社团介绍
              </div>
              <div class="section-content desc-box">
                {{ selectedClub.description || '暂无介绍' }}
              </div>
            </div>

            <div class="info-section">
              <div class="section-label">
                <span class="label-icon">👥</span>
                现有成员 ({{ selectedClub.members?.length || 0 }}人)
              </div>
              <div class="member-chips">
                <span v-for="member in selectedClub.members" :key="member" class="member-chip">
                  {{ member }}
                </span>
                <span v-if="!selectedClub.members?.length" class="no-members">暂无成员</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <template v-if="isClubMember(selectedClub.id)">
              <div class="status-box success">
                <span class="status-icon">✅</span>
                <div class="status-text">
                  <div class="status-title">你已是该社团成员</div>
                  <div class="status-hint">退出社团需通过剧情进行</div>
                </div>
              </div>
              <button v-if="isPresident(selectedClub, gameStore.player.name)" class="action-btn invite" @click="openInviteModal">
                <span>💌</span> 邀请成员
              </button>
            </template>
            <template v-else-if="isApplyingTo(selectedClub.id)">
              <div class="status-box pending">
                <span class="status-icon">⏳</span>
                <div class="status-text">
                  <div class="status-title">申请审核中...</div>
                  <div class="status-hint">社长正在审核，请继续剧情对话 (剩余: {{ gameStore.events.clubApplication.remainingTurns }}回合)</div>
                </div>
              </div>
            </template>
            <template v-else-if="canJoinClub(selectedClub.id)">
              <button class="action-btn primary" @click="handleJoinClub(selectedClub.id)">
                <span>✋</span> 申请加入
              </button>
            </template>
            <template v-else>
              <div class="status-box locked">
                <span class="status-icon">🔒</span>
                <div class="status-text">
                  <div class="status-title">暂时无法加入</div>
                  <div class="status-hint" v-if="gameStore.events.clubApplication">正在申请其他社团</div>
                  <div class="status-hint" v-else>已加入社团，需通过成员邀请加入更多</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      </Teleport>

      <!-- 创建社团弹窗 -->
      <Teleport to="body">
      <div v-if="showCreateClubModal" class="club-modal-overlay" @click.self="showCreateClubModal = false">
        <div class="club-modal create-modal">
          <div class="modal-header-bg create-bg"></div>
          <div class="modal-header">
            <div class="modal-club-avatar">
              <span class="club-emoji-lg">✨</span>
            </div>
            <div class="modal-club-title">创建新社团</div>
            <button class="modal-close" @click="showCreateClubModal = false">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="modal-body form-body">
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">📛</span>
                社团名称
              </label>
              <input v-model="createClubForm.name" placeholder="请输入社团名称" class="form-input" />
            </div>
            
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">👨‍🏫</span>
                指导老师 (可选)
              </label>
              <select v-model="createClubForm.advisor" class="form-select">
                <option value="">无</option>
                <option v-for="teacher in allTeachers" :key="teacher.name" :value="teacher.name">
                  {{ teacher.name }} ({{ teacher.className || '教师' }})
                </option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">🎯</span>
                核心技能
              </label>
              <select v-model="createClubForm.coreSkill" class="form-select">
                <option value="">无</option>
                <option v-for="(name, key) in skillNames" :key="key" :value="name">{{ name }}</option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">📅</span>
                活动日
              </label>
              <select v-model="createClubForm.activityDay" class="form-select">
                <option value="未定">未定</option>
                <option value="每日">每日</option>
                <option value="周一">周一</option>
                <option value="周二">周二</option>
                <option value="周三">周三</option>
                <option value="周四">周四</option>
                <option value="周五">周五</option>
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">📍</span>
                活动地点
              </label>
              <div class="location-input-group">
                <input 
                  v-model="createClubForm.location" 
                  placeholder="点击右侧按钮在地图上创建" 
                  class="form-input location-input" 
                  readonly
                />
                <button class="map-select-btn" @click="openMapForLocationSelect">
                  <span class="btn-icon">🗺️</span>
                  <span class="btn-text">选择</span>
                </button>
              </div>
              <div v-if="createClubForm.location" class="location-preview">
                <span class="preview-icon">📍</span>
                <span class="preview-text">{{ createClubForm.location }}</span>
                <button class="clear-btn" @click="createClubForm.location = ''">×</button>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">📝</span>
                社团介绍
              </label>
              <textarea v-model="createClubForm.description" placeholder="简单介绍一下你的社团..." class="form-textarea"></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="action-btn secondary" @click="showCreateClubModal = false">取消</button>
            <button class="action-btn primary" @click="handleCreateClub" :disabled="!createClubForm.name">
              <span>✨</span> 立即创建
            </button>
          </div>
        </div>
      </div>
      </Teleport>

      <!-- 邀请成员弹窗 -->
      <Teleport to="body">
      <div v-if="showInviteModal" class="club-modal-overlay" @click.self="showInviteModal = false">
        <div class="club-modal invite-modal">
          <div class="modal-header-bg invite-bg"></div>
          <div class="modal-header">
            <div class="modal-club-avatar">
              <span class="club-emoji-lg">💌</span>
            </div>
            <div class="modal-club-title">邀请加入{{ selectedClub?.name }}</div>
            <button class="modal-close" @click="showInviteModal = false">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="modal-body form-body">
            <div class="form-group">
              <label class="form-label">
                <span class="label-icon">👤</span>
                选择邀请对象
              </label>
              <select v-model="inviteTarget" class="form-select">
                <option value="" disabled>请选择角色</option>
                <option 
                  v-for="npc in availableNpcs" 
                  :key="npc.id" 
                  :value="npc.name"
                >
                  {{ npc.name }} (好感度: {{ npc.affinity }})
                </option>
              </select>
            </div>
            <div class="invite-hint" v-if="inviteTarget">
              <div class="hint-icon">💡</div>
              <div class="hint-text">邀请将作为剧情指令发送，对方会根据好感度和性格决定是否接受。</div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="action-btn secondary" @click="showInviteModal = false">取消</button>
            <button class="action-btn primary" @click="handleInviteMember" :disabled="!inviteTarget">
              <span>💌</span> 发送邀请
            </button>
          </div>
        </div>
      </div>
      </Teleport>

      <!-- 拒绝通知弹窗 -->
      <Teleport to="body">
      <div v-if="gameStore.events.clubRejection" class="club-modal-overlay" @click.self="gameStore.confirmClubRejection()">
        <div class="rejection-modal">
          <div class="rejection-icon">❌</div>
          <div class="rejection-title">申请被拒绝</div>
          <div class="rejection-info">
            <div class="rejection-club">{{ gameStore.events.clubRejection.clubName }}</div>
            <div class="rejection-from">来自: {{ gameStore.events.clubRejection.from }}</div>
          </div>
          <div class="rejection-reason">
            "{{ gameStore.events.clubRejection.reason }}"
          </div>
          <button class="confirm-btn" @click="gameStore.confirmClubRejection()">
            确定
          </button>
        </div>
      </div>
      </Teleport>

      <!-- 操作提示 -->
      <transition name="toast">
        <div v-if="actionMessage" class="action-toast" :class="actionMessage.type">
          <span class="toast-icon">{{ actionMessage.type === 'success' ? '✅' : '❌' }}</span>
          <span class="toast-text">{{ actionMessage.text }}</span>
        </div>
      </transition>

      <!-- 地图编辑器 (选择模式) -->
      <Teleport to="body">
        <MapEditorPanel 
          v-if="showMapEditor"
          :selection-mode="true"
          selection-title="创建社团活动室"
          :occupied-locations="occupiedLocations"
          @close="showMapEditor = false"
          @location-selected="handleLocationSelected"
        />
      </Teleport>
    </div>

    <!-- 成绩标签页内容 -->
    <div v-if="activeTab === 'grades'" class="tab-content">
      <ReportCard />
    </div>

    <!-- 论坛标签页内容 -->
    <div v-if="activeTab === 'forum'" class="tab-content forum-content">
      <ForumApp />
    </div>

    <!-- 档案标签页内容 -->
    <div v-if="activeTab === 'profile'" class="tab-content profile-content">
      <!-- 证件卡 -->
      <div class="student-id-card" :class="{ 'teacher-card': gameStore.player.role === 'teacher' }">
        <div class="card-header">
          <div class="school-logo">🏫</div>
          <div class="school-name-text">天华高级中学</div>
          <div class="card-title">{{ gameStore.player.role === 'teacher' ? '教职员证' : '学生证' }}</div>
        </div>
        <div class="card-body">
          <div class="student-photo">
            <img :src="gameStore.player.avatar" alt="头像">
          </div>
          <div class="student-info">
            <div class="info-row">
              <span class="info-label">姓名</span>
              <span class="info-value">{{ gameStore.player.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ gameStore.player.role === 'teacher' ? '职务' : '年级' }}</span>
              <span class="info-value">{{ gameStore.player.role === 'teacher' ? '教师' : (gameStore.player.gradeYear ? `${gameStore.player.gradeYear}年级` : '未知') }}</span>
            </div>
            
            <!-- 教师显示教授班级 -->
            <template v-if="gameStore.player.role === 'teacher'">
              <div class="info-row">
                <span class="info-label">班主任</span>
                <span class="info-value">{{ gameStore.player.homeroomClassIds?.length > 0 ? gameStore.player.homeroomClassIds.join(', ') : (gameStore.player.homeroomClassId || '无') }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">教工号</span>
                <span class="info-value">{{ studentId.replace('TH', 'THT') }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">入职年份</span>
                <span class="info-value">{{ admissionYear }}</span>
              </div>
            </template>
            
            <!-- 学生显示班级 -->
            <template v-else>
              <div class="info-row">
                <span class="info-label">班级</span>
                <span class="info-value">{{ gameStore.player.classId || '未分配' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">学号</span>
                <span class="info-value">{{ studentId }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">入学年份</span>
                <span class="info-value">{{ admissionYear }}</span>
              </div>
            </template>
          </div>
        </div>
        <div class="card-footer">
          <div class="barcode">|| | ||| | || |||| |||</div>
          <div class="card-hint">此证仅限本人使用</div>
        </div>
      </div>

      <!-- 教师：教学信息 -->
      <template v-if="gameStore.player.role === 'teacher'">
        <div class="skills-section">
          <div class="section-title">
            <span class="section-icon">🏫</span>
            <span>教学信息</span>
          </div>
          <div class="teacher-info-list">
            <div class="teacher-info-item">
              <span class="teacher-info-label">教授班级</span>
              <span class="teacher-info-value">{{ gameStore.player.teachingClasses?.length ? gameStore.player.teachingClasses.join('、') : '无' }}</span>
            </div>
            <div class="teacher-info-item">
              <span class="teacher-info-label">教授科目</span>
              <span class="teacher-info-value">{{ gameStore.player.teachingSubjects?.length ? gameStore.player.teachingSubjects.join('、') : '无' }}</span>
            </div>
            <div class="teacher-info-item">
              <span class="teacher-info-label">选修课程</span>
              <span class="teacher-info-value">{{ getElectiveNames(gameStore.player.teachingElectives) }}</span>
            </div>
            <div class="teacher-info-item">
              <span class="teacher-info-label">指导社团</span>
              <span class="teacher-info-value">{{ gameStore.player.advisorClubs?.length ? gameStore.player.advisorClubs.join('、') : '无' }}</span>
            </div>
          </div>
        </div>

        <div class="skills-section">
          <div class="section-title">
            <span class="section-icon">🎨</span>
            <span>个人技能</span>
          </div>
          <div class="skills-grid">
            <div v-for="(level, key) in gameStore.player.skills" :key="key" class="skill-item">
              <div class="skill-header">
                <span class="skill-name">{{ skillNames[key] || key }}</span>
                <span class="skill-level">Lv.{{ level }}</span>
              </div>
              <div class="skill-progress-bg">
                <div
                  class="skill-progress-bar skill-bar"
                  :style="{ width: `${gameStore.player.skillExps[key] || 0}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 学生：学科 + 职业技能 -->
      <template v-else>
      <div class="skills-section">
        <div class="section-title">
          <span class="section-icon">📚</span>
          <span>学科技能</span>
        </div>
        <div class="skills-grid">
          <div v-for="(level, key) in gameStore.player.subjects" :key="key" class="skill-item">
            <div class="skill-header">
              <span class="skill-name">{{ subjectNames[key] || key }}</span>
              <span class="skill-level">Lv.{{ level }}</span>
            </div>
            <div class="skill-progress-bg">
              <div 
                class="skill-progress-bar subject-bar" 
                :style="{ width: `${gameStore.player.subjectExps[key] || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 选修课程 -->
      <div class="skills-section" v-if="gameStore.player.selectedElectives?.length">
        <div class="section-title">
          <span class="section-icon">📝</span>
          <span>选修课程</span>
        </div>
        <div class="elective-tags">
          <span v-for="id in gameStore.player.selectedElectives" :key="id" class="elective-tag">
            {{ getCourseById(id)?.name || id }}
          </span>
        </div>
      </div>

      <div class="skills-section">
        <div class="section-title">
          <span class="section-icon">🎨</span>
          <span>职业技能</span>
        </div>
        <div class="skills-grid">
          <div v-for="(level, key) in gameStore.player.skills" :key="key" class="skill-item">
            <div class="skill-header">
              <span class="skill-name">{{ skillNames[key] || key }}</span>
              <span class="skill-level">Lv.{{ level }}</span>
            </div>
            <div class="skill-progress-bg">
              <div 
                class="skill-progress-bar skill-bar" 
                :style="{ width: `${gameStore.player.skillExps[key] || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { getCourseById } from '../data/coursePoolData'
import { TIME_SLOTS, getWeekdayEnglish, getTermInfo, checkDayStatus } from '../utils/scheduleGenerator'
import ForumApp from './ForumApp.vue'
import ElectiveCourseSelector from './ElectiveCourseSelector.vue'
import MapEditorPanel from './MapEditorPanel.vue'
import ReportCard from './ReportCard.vue'

const gameStore = useGameStore()

// 标签页状态
const activeTab = ref('schedule')

// 红点清除：切换到社团 tab 时标记所有社团为已查看，切换到成绩 tab 时清除考试红点，切换到论坛 tab 时清除论坛红点
watch(activeTab, (val) => {
  if (val === 'clubs') {
    const allClubs = gameStore.world.allClubs || {}
    gameStore.notifications.viewedClubIds = Object.keys(allClubs)
  }
  if (val === 'grades') {
    if (gameStore.notifications.unviewedExamIds?.length) {
      gameStore.notifications.unviewedExamIds = []
    }
  }
  if (val === 'forum') {
    // 清除论坛待处理指令（红点）
    if (gameStore.player.forum?.pendingCommands?.length) {
      gameStore.player.forum.pendingCommands = []
    }
  }
})
const loading = ref(false)
const selectedClub = ref(null)
const actionMessage = ref(null)
const showCreateClubModal = ref(false)
const showInviteModal = ref(false)
const showMapEditor = ref(false)
const createClubForm = ref({
  name: '',
  description: '',
  coreSkill: '',
  activityDay: '未定',
  location: '',
  advisor: ''
})
const inviteTarget = ref('')

// 星期配置
const weekdays = [
  { en: 'Monday', cn: '周一' },
  { en: 'Tuesday', cn: '周二' },
  { en: 'Wednesday', cn: '周三' },
  { en: 'Thursday', cn: '周四' },
  { en: 'Friday', cn: '周五' }
]

// 节次配置（来自 scheduleGenerator）
const periods = TIME_SLOTS.map(slot => ({
  period: slot.period,
  start: slot.start,
  end: slot.end,
  type: slot.type
}))

// 获取学期信息
const termInfo = computed(() => {
  const { year, month, day } = gameStore.world.gameTime
  return getTermInfo(year, month, day)
})

// 是否在假期中
const isVacation = computed(() => termInfo.value.isVacation)

// 假期名称
const vacationName = computed(() => termInfo.value.vacationName || '假期')

// 是否有课表
const hasSchedule = computed(() => {
  if (isVacation.value) return false
  return gameStore.player.schedule && Object.keys(gameStore.player.schedule).length > 0
})

// 玩家班级
const playerClass = computed(() => gameStore.player.classId)

// 当前周数
const weekNumber = computed(() => termInfo.value.weekNumber)

// 学期名称
const termName = computed(() => termInfo.value.termName || '')

// 是否有新考试（用于tab badge）
const hasNewExam = computed(() => {
  const history = gameStore.academic.examHistory || []
  return history.length > 0
})

// 计算本周每一天的日期
const weekDateMap = computed(() => {
  const { year, month, day, weekday } = gameStore.world.gameTime
  const currentWeekdayEn = getWeekdayEnglish(weekday)
  
  const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const currentIndex = weekdayOrder.indexOf(currentWeekdayEn)
  
  const map = {}
  if (currentIndex === -1) return map
  
  const currentDateObj = new Date(year, month - 1, day)
  
  weekdays.forEach((wd, index) => {
    const diff = index - currentIndex
    const targetDate = new Date(currentDateObj)
    targetDate.setDate(currentDateObj.getDate() + diff)
    
    map[wd.en] = {
      year: targetDate.getFullYear(),
      month: targetDate.getMonth() + 1,
      day: targetDate.getDate()
    }
  })
  
  return map
})

// 计算本周每一天的状态
const dayStatusMap = computed(() => {
  const map = {}
  for (const [dayEn, date] of Object.entries(weekDateMap.value)) {
    map[dayEn] = checkDayStatus(date.month, date.day, date.year)
  }
  return map
})

// 判断某天某节课是否被假期/考试覆盖
function getHolidayInfo(dayEn, period) {
  const status = dayStatusMap.value[dayEn]
  if (!status) return null
  
  if (status.holidayType === 'full' || status.holidayType === 'exam') {
    return status
  }
  
  if (status.holidayType === 'am_off' && period.type === 'morning') {
    return status
  }
  
  if (status.holidayType === 'pm_off' && period.type === 'afternoon') {
    return status
  }
  
  return null
}

// 头部副标题
const getHeaderSubtitle = computed(() => {
  if (activeTab.value === 'schedule') {
    return isVacation.value ? vacationName.value : '本周课表'
  } else if (activeTab.value === 'clubs') {
    return '社团活动'
  } else if (activeTab.value === 'grades') {
    return gameStore.player.role === 'teacher' ? '班级成绩总览' : '考试成绩'
  } else if (activeTab.value === 'forum') {
    return '校园论坛'
  } else if (activeTab.value === 'profile') {
    return '个人档案'
  } else {
    return ''
  }
})

// 入学年份（推算）
const admissionYear = computed(() => {
  if (gameStore.player.academicYear) {
    return gameStore.player.academicYear - (gameStore.player.gradeYear - 1)
  }
  return gameStore.world.gameTime.year - (gameStore.player.gradeYear - 1)
})

// 学生证号（生成一个模拟的）
const studentId = computed(() => {
  const base = gameStore.meta.currentRunId.substring(0, 4).toUpperCase()
  return `TH${admissionYear.value}${base}01`
})

const subjectNames = {
  literature: '语文',
  math: '数学',
  english: '英语',
  humanities: '文综',
  sciences: '理综',
  art: '艺术',
  sports: '体育'
}

const skillNames = {
  programming: '编程',
  painting: '绘画',
  guitar: '吉他',
  piano: '钢琴',
  urbanLegend: '怪谈',
  cooking: '烹饪',
  hacking: '黑客',
  socialMedia: '社媒',
  photography: '摄影',
  videoEditing: '剪辑'
}

// 将选修课 ID 数组转为课程名称
const getElectiveNames = (ids) => {
  if (!ids?.length) return '无'
  return ids.map(id => getCourseById(id)?.name || id).join('、')
}

// 待处理论坛指令数量
const pendingForumCount = computed(() => {
  return gameStore.player.forum?.pendingCommands?.length || 0
})

// 是否有新社团通知（邀请或申请结果）
const hasNewClubNotification = computed(() => {
  return !!(gameStore.events.clubInvitation || gameStore.events.clubRejection)
})

// 已加入社团数量
const joinedClubsCount = computed(() => gameStore.player.joinedClubs.length)

// 已加入的社团列表
const joinedClubs = computed(() => {
  return gameStore.player.joinedClubs
    .map(id => gameStore.world.allClubs[id])
    .filter(club => club)
})

// 可加入的社团（未加入的）
const availableClubs = computed(() => {
  return Object.values(gameStore.world.allClubs).filter(
    club => !gameStore.player.joinedClubs.includes(club.id)
  )
})

// 已被占用的活动室名称列表
const occupiedLocations = computed(() => {
  const locations = []
  Object.values(gameStore.world.allClubs).forEach(club => {
    if (club.location && club.location.trim()) {
      locations.push(club.location.trim())
    }
  })
  return locations
})

// 所有教师列表（用于指导老师选择）
const allTeachers = computed(() => {
  const teacherMap = new Map();
  
  if (gameStore.world.allClassData) {
    for (const [classId, classData] of Object.entries(gameStore.world.allClassData)) {
      if (classData.headTeacher && classData.headTeacher.name) {
        if (!teacherMap.has(classData.headTeacher.name)) {
          teacherMap.set(classData.headTeacher.name, {
            name: classData.headTeacher.name,
            className: classData.name || classId,
            role: '班主任'
          });
        }
      }
      if (classData.teachers && Array.isArray(classData.teachers)) {
        classData.teachers.forEach(t => {
          if (t.name && !teacherMap.has(t.name)) {
            teacherMap.set(t.name, {
              name: t.name,
              className: t.subject || '教师',
              role: '教师'
            });
          }
        })
      }
    }
  }
  return Array.from(teacherMap.values());
})

function isApplyingTo(clubId) {
  return gameStore.events.clubApplication && gameStore.events.clubApplication.clubId === clubId
}

function canJoinClub(clubId) {
  if (gameStore.player.role === 'teacher') {
    if (gameStore.player.joinedClubs.includes(clubId)) return false
    const club = gameStore.world.allClubs[clubId]
    if (club && club.advisor) return false
    return true
  }

  const club = gameStore.world.allClubs[clubId]
  if (club?.mode === 'restricted' || clubId === 'student_council') return false
  if (gameStore.player.joinedClubs.includes(clubId)) return false
  if (gameStore.events.clubApplication) return false
  if (gameStore.player.joinedClubs.length === 0) return true
  return false
}

function isClubMember(clubId) {
  return gameStore.player.joinedClubs.includes(clubId)
}

function isPresident(club, name) {
  if (!club || !club.president) return false
  if (Array.isArray(club.president)) {
    return club.president.includes(name)
  }
  return club.president === name
}

function isVicePresident(club, name) {
  if (!club || !club.vicePresident) return false
  if (Array.isArray(club.vicePresident)) {
    return club.vicePresident.includes(name)
  }
  return club.vicePresident === name
}

function formatRoleList(roleData) {
  if (!roleData) return '无'
  if (Array.isArray(roleData)) {
    return roleData.join('、')
  }
  return roleData
}

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

async function handleJoinClub(clubId) {
  if (!canJoinClub(clubId)) return
  
  if (gameStore.player.role === 'teacher') {
    const result = await gameStore.becomeClubAdvisor(clubId)
    actionMessage.value = {
      type: result.success ? 'success' : 'error',
      text: result.message
    }
    if (result.success) {
      selectedClub.value = null
    }
    setTimeout(() => { actionMessage.value = null }, 3000)
    return
  }
  
  const result = await gameStore.applyToJoinClub(clubId)
  
  actionMessage.value = {
    type: result.success ? 'success' : 'error',
    text: result.message
  }
  
  if (result.success) {
    selectedClub.value = null
  }
  
  setTimeout(() => {
    actionMessage.value = null
  }, 3000)
}

function isToday(dayEn) {
  const todayEn = getWeekdayEnglish(gameStore.world.gameTime.weekday)
  return todayEn === dayEn
}

function isCurrentClass(dayEn, periodNum) {
  if (!isToday(dayEn)) return false
  
  const { hour, minute } = gameStore.world.gameTime
  const currentMinutes = hour * 60 + minute
  
  const slot = TIME_SLOTS.find(s => s.period === periodNum)
  if (!slot) return false
  
  const [startH, startM] = slot.start.split(':').map(Number)
  const [endH, endM] = slot.end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

function getClassInfo(dayEn, periodNum) {
  if (!hasSchedule.value) return null
  
  const daySchedule = gameStore.player.schedule[dayEn]
  if (!daySchedule) return null
  
  const classInfo = daySchedule.find(c => c.period === periodNum)
  if (!classInfo || classInfo.isEmpty) return null
  
  return classInfo
}

function isEmptySlot(dayEn, periodNum) {
  const info = getClassInfo(dayEn, periodNum)
  return !info
}

function calculateAffinity(npcName) {
  const relationData = gameStore.world.npcRelationships?.[npcName]?.relations?.[gameStore.player.name]
  if (!relationData) {
    const reverseRelation = gameStore.world.npcRelationships?.[gameStore.player.name]?.relations?.[npcName]
    if (reverseRelation) {
      const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = reverseRelation
      return Math.round((intimacy + trust + passion - hostility) / 3)
    }
    return 0
  }
  const { intimacy = 0, trust = 0, passion = 0, hostility = 0 } = relationData
  return Math.round((intimacy + trust + passion - hostility) / 3)
}

const availableNpcs = computed(() => {
  if (!selectedClub.value) return []
  return gameStore.world.npcs
    .filter(npc => {
      const hasRelation = gameStore.world.npcRelationships[npc.name] || 
                          gameStore.world.npcRelationships[gameStore.player.name]?.relations?.[npc.name]
      if (!hasRelation) return false
      if (selectedClub.value.members && selectedClub.value.members.includes(npc.name)) return false
      return true
    })
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      affinity: calculateAffinity(npc.name)
    }))
    .sort((a, b) => b.affinity - a.affinity)
})

function openInviteModal() {
  inviteTarget.value = ''
  showInviteModal.value = true
}

function openMapForLocationSelect() {
  showMapEditor.value = true
}

function handleLocationSelected(location) {
  createClubForm.value.location = location.name
  showMapEditor.value = false
}

async function handleCreateClub() {
  if (!createClubForm.value.name) return
  
  if (createClubForm.value.location && occupiedLocations.value.includes(createClubForm.value.location)) {
    actionMessage.value = {
      type: 'error',
      text: `活动室"${createClubForm.value.location}"已被其他社团占用`
    }
    setTimeout(() => { actionMessage.value = null }, 3000)
    return
  }
  
  const result = await gameStore.createClub({
    name: createClubForm.value.name,
    description: createClubForm.value.description,
    coreSkill: createClubForm.value.coreSkill,
    activityDay: createClubForm.value.activityDay,
    location: createClubForm.value.location,
    advisor: createClubForm.value.advisor
  })
  
  actionMessage.value = {
    type: result.success ? 'success' : 'error',
    text: result.message
  }
  
  if (result.success) {
    showCreateClubModal.value = false
    createClubForm.value = {
      name: '',
      description: '',
      coreSkill: '',
      activityDay: '未定',
      location: '',
      advisor: ''
    }
  }
  
  setTimeout(() => {
    actionMessage.value = null
  }, 3000)
}

async function handleInviteMember() {
  if (!inviteTarget.value || !selectedClub.value) return
  
  const result = await gameStore.inviteNpcToClub(selectedClub.value.id, inviteTarget.value)
  
  actionMessage.value = {
    type: result.success ? 'success' : 'error',
    text: result.message
  }
  
  if (result.success) {
    showInviteModal.value = false
    inviteTarget.value = ''
  }
  
  setTimeout(() => {
    actionMessage.value = null
  }, 3000)
}

onMounted(async () => {
  if (Object.keys(gameStore.world.allClubs).length === 0) {
    loading.value = true
    await gameStore.loadClubData()
    loading.value = false
  }
})
</script>

<style scoped>
.schedule-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow: hidden;
}

.schedule-app.vacation-mode {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.schedule-header {
  padding: 12px 16px;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 18px;
  font-weight: bold;
}

.app-logo {
  font-size: 22px;
}

.header-subtitle {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 2px;
}

/* 标签页导航 - 适配5个tab */
.tab-nav {
  display: flex;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 2px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.15);
  border-bottom: 2px solid #ffd93d;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 11px;
  font-weight: 500;
}

.tab-badge {
  position: absolute;
  top: 4px;
  right: calc(50% - 26px);
  background: #ff6b6b;
  color: white;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 10px;
  min-width: 14px;
  text-align: center;
}

/* 标签页内容 */
.tab-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* 课表相关样式 */
.vacation-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.vacation-content {
  text-align: center;
  padding: 30px;
}

.vacation-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.vacation-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.vacation-text {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.vacation-hint {
  font-size: 12px;
  opacity: 0.7;
}

.schedule-table-container {
  padding: 8px;
}

.schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 10px;
}

.schedule-table th,
.schedule-table td {
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 4px 2px;
  text-align: center;
  vertical-align: middle;
}

.period-header {
  width: 40px;
  background: rgba(0, 0, 0, 0.3);
  font-weight: bold;
}

.day-header {
  background: rgba(0, 0, 0, 0.2);
  font-weight: bold;
}

.day-header.today {
  background: rgba(255, 215, 0, 0.3);
}

.day-name {
  font-size: 11px;
}

.period-cell {
  background: rgba(0, 0, 0, 0.2);
}

.period-num {
  font-weight: bold;
  font-size: 12px;
}

.period-time {
  font-size: 8px;
  opacity: 0.7;
}

.class-cell {
  background: rgba(255, 255, 255, 0.05);
  min-height: 50px;
  transition: all 0.2s;
}

.class-cell.today {
  background: rgba(255, 215, 0, 0.1);
}

.class-cell.current {
  background: rgba(76, 175, 80, 0.4);
  box-shadow: inset 0 0 0 2px rgba(76, 175, 80, 0.8);
}

.class-cell.empty {
  background: rgba(0, 0, 0, 0.1);
}

.class-subject {
  font-weight: bold;
  font-size: 10px;
  color: #fff;
  margin-bottom: 2px;
  word-break: break-all;
}

.class-location {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.7);
  word-break: break-all;
}

.empty-slot {
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.schedule-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
  flex-shrink: 0;
}

.schedule-footer .label {
  opacity: 0.7;
}

.schedule-footer .value {
  font-weight: bold;
}

.vacation-tag {
  color: #ffd93d;
}

.no-schedule {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 20px 30px;
  border-radius: 12px;
}

.no-schedule-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.no-schedule-text {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
}

.no-schedule-hint {
  font-size: 12px;
  opacity: 0.7;
}

.period-row:nth-child(3) td {
  border-bottom: 2px solid rgba(255, 215, 0, 0.5);
}

/* ==================== 社团页面样式 ==================== */
.clubs-content {
  padding: 16px;
  padding-bottom: 80px;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 100%);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.section-icon-wrapper {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-icon {
  font-size: 18px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.section-count {
  font-size: 12px;
  opacity: 0.7;
  background: rgba(255,255,255,0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.my-clubs-section {
  margin-bottom: 20px;
}

.club-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.club-card {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.club-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.club-card.my-club {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(56, 142, 60, 0.15) 100%);
  border-color: rgba(76, 175, 80, 0.3);
}

.club-card.my-club:hover {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.25) 0%, rgba(56, 142, 60, 0.2) 100%);
}

.club-card-bg {
  position: absolute;
  top: 0;
  right: 0;
  width: 120px;
  height: 120px;
  background: radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 70%);
  pointer-events: none;
}

.club-card-content {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 16px;
  gap: 14px;
}

.club-avatar {
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.club-emoji { font-size: 26px; }

.club-details { flex: 1; min-width: 0; }

.club-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.club-stats { display: flex; gap: 12px; margin-bottom: 4px; }
.stat-item { display: flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.8; }
.stat-icon { font-size: 12px; }

.club-location { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.7; margin-top: 4px; }
.location-icon { font-size: 11px; }

.club-desc { font-size: 12px; opacity: 0.7; margin-top: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.club-role-badge { position: absolute; top: 12px; right: 12px; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.club-role-badge.president { background: linear-gradient(135deg, #ffd93d 0%, #ff9800 100%); color: #333; }
.club-role-badge.member { background: rgba(255, 255, 255, 0.15); color: #fff; }

.club-action { flex-shrink: 0; align-self: center; }

.join-btn { display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); }
.join-btn:hover { transform: scale(1.05); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }
.btn-icon { font-size: 14px; }

.disabled-hint { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #ffd93d; opacity: 0.8; }
.lock-icon { font-size: 12px; }
.club-card.disabled { opacity: 0.6; }

/* 创建社团 */
.create-club-section { margin-bottom: 20px; }
.create-club-card { position: relative; background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%); border-radius: 16px; padding: 20px; cursor: pointer; overflow: hidden; border: 1px dashed rgba(255, 255, 255, 0.3); transition: all 0.3s; }
.create-club-card:hover { background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%); border-color: rgba(255, 255, 255, 0.5); transform: translateY(-2px); }
.create-card-glow { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 50%); animation: pulse 3s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
.create-card-content { position: relative; display: flex; align-items: center; gap: 16px; }
.create-icon-wrapper { position: relative; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; }
.create-icon { font-size: 32px; z-index: 1; animation: sparkle 2s ease-in-out infinite; }
@keyframes sparkle { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.1) rotate(5deg); } }
.create-icon-ring { position: absolute; inset: 0; border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 50%; animation: ring-pulse 2s ease-in-out infinite; }
@keyframes ring-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.5; } }
.create-text { flex: 1; }
.create-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.create-desc { font-size: 12px; opacity: 0.8; }
.create-arrow { color: rgba(255, 255, 255, 0.6); transition: transform 0.2s; }
.create-club-card:hover .create-arrow { transform: translateX(4px); color: white; }

/* 其他社团列表 */
.other-clubs-section { margin-top: 8px; }
.club-cards-list { display: flex; flex-direction: column; gap: 10px; }
.club-card.available .club-card-content { padding: 14px 16px; }

/* 加载和空状态 */
.loading-state, .empty-state { text-align: center; padding: 40px 20px; }
.loading-spinner { width: 36px; height: 36px; border: 3px solid rgba(255, 255, 255, 0.2); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 14px; opacity: 0.7; }
.empty-illustration { position: relative; display: inline-block; margin-bottom: 16px; }
.empty-icon { font-size: 56px; opacity: 0.5; }
.empty-particles { position: absolute; inset: 0; }
.empty-particles span { position: absolute; width: 6px; height: 6px; background: rgba(255, 255, 255, 0.3); border-radius: 50%; animation: particle-float 3s ease-in-out infinite; }
.empty-particles span:nth-child(1) { top: 0; left: 20%; animation-delay: 0s; }
.empty-particles span:nth-child(2) { top: 30%; right: 10%; animation-delay: 0.5s; }
.empty-particles span:nth-child(3) { bottom: 10%; left: 30%; animation-delay: 1s; }
@keyframes particle-float { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; } 50% { transform: translateY(-10px) scale(1.2); opacity: 0.6; } }
.empty-text { font-size: 15px; font-weight: 500; margin-bottom: 6px; }
.empty-hint { font-size: 12px; opacity: 0.6; }

/* ==================== 社团弹窗样式 ==================== */
.club-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 20px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.club-modal { width: 100%; max-width: 420px; max-height: calc(100% - 40px); background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); animation: modal-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); touch-action: pan-y; }
@keyframes modal-pop { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.modal-header-bg { display: none; }
.modal-header-bg.create-bg { display: none; }
.modal-header-bg.invite-bg { display: none; }
.modal-header { position: relative; display: flex; align-items: center; gap: 14px; padding: 20px; z-index: 1; flex-shrink: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px 20px 0 0; }
.create-modal .modal-header { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); }
.invite-modal .modal-header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.modal-club-avatar { width: 60px; height: 60px; background: rgba(255, 255, 255, 0.2); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); }
.club-emoji-lg { font-size: 32px; }
.modal-club-title { flex: 1; font-size: 20px; font-weight: 600; }
.modal-close { width: 36px; height: 36px; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.modal-close:hover { background: rgba(255, 255, 255, 0.25); transform: scale(1.1); }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
.info-item { display: flex; align-items: flex-start; gap: 10px; background: rgba(255, 255, 255, 0.08); padding: 12px; border-radius: 12px; }
.info-icon { font-size: 20px; }
.info-content { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 11px; opacity: 0.7; }
.info-value { font-size: 13px; font-weight: 500; }
.info-section { margin-bottom: 16px; }
.section-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 8px; opacity: 0.9; }
.label-icon { font-size: 14px; }
.section-content { background: rgba(255, 255, 255, 0.08); padding: 12px; border-radius: 12px; }
.desc-box { font-size: 13px; line-height: 1.6; opacity: 0.9; }
.member-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.member-chip { background: rgba(255, 255, 255, 0.12); padding: 6px 12px; border-radius: 16px; font-size: 12px; }
.no-members { font-size: 12px; opacity: 0.5; }
.modal-footer { padding: 16px 20px; background: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
.status-box { flex: 1; display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 12px; }
.status-box.success { background: rgba(76, 175, 80, 0.2); }
.status-box.pending { background: rgba(255, 193, 7, 0.2); }
.status-box.locked { background: rgba(255, 255, 255, 0.08); }
.status-icon { font-size: 20px; }
.status-text { display: flex; flex-direction: column; gap: 2px; }
.status-title { font-size: 13px; font-weight: 600; }
.status-hint { font-size: 11px; opacity: 0.7; }
.action-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s; }
.action-btn.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
.action-btn.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
.action-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.secondary { background: rgba(255, 255, 255, 0.1); color: white; }
.action-btn.secondary:hover { background: rgba(255, 255, 255, 0.15); }
.action-btn.invite { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; }

/* 表单样式 */
.form-body { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.form-input, .form-select, .form-textarea { width: 100%; padding: 12px 14px; border: 2px solid rgba(255, 255, 255, 0.15); border-radius: 12px; background: rgba(0, 0, 0, 0.2); color: white; font-size: 14px; transition: all 0.2s; box-sizing: border-box; }
.form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2); }
.form-input::placeholder, .form-textarea::placeholder { color: rgba(255, 255, 255, 0.4); }
.form-textarea { min-height: 80px; resize: vertical; }
.form-select option { background: #2a5298; color: white; }

/* 活动室选择 */
.location-input-group { display: flex; gap: 8px; }
.location-input { flex: 1; cursor: pointer; }
.map-select-btn { display: flex; align-items: center; gap: 6px; padding: 12px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.map-select-btn:hover { transform: scale(1.02); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
.location-preview { display: flex; align-items: center; gap: 8px; background: rgba(76, 175, 80, 0.2); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(76, 175, 80, 0.3); }
.preview-icon { font-size: 16px; }
.preview-text { flex: 1; font-size: 13px; font-weight: 500; }
.clear-btn { width: 24px; height: 24px; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 50%; color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.clear-btn:hover { background: rgba(255, 255, 255, 0.25); }

/* 邀请提示 */
.invite-hint { display: flex; gap: 10px; background: rgba(255, 193, 7, 0.15); padding: 12px; border-radius: 10px; border: 1px solid rgba(255, 193, 7, 0.3); }
.hint-icon { font-size: 18px; }
.hint-text { font-size: 12px; line-height: 1.5; opacity: 0.9; }

/* 拒绝弹窗 */
.rejection-modal { background: white; color: #333; padding: 28px; border-radius: 20px; width: 300px; text-align: center; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4); animation: modal-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.rejection-icon { font-size: 56px; margin-bottom: 16px; }
.rejection-title { font-size: 20px; font-weight: bold; margin-bottom: 12px; color: #ef5350; }
.rejection-info { margin-bottom: 12px; font-size: 13px; color: #666; }
.rejection-club { font-weight: bold; color: #333; font-size: 15px; }
.rejection-reason { background: #f5f5f5; padding: 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; margin-bottom: 20px; font-style: italic; color: #555; border-left: 4px solid #ef5350; }
.confirm-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #ef5350 0%, #e53935 100%); color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.2s; }
.confirm-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(239, 83, 80, 0.4); }

/* Toast */
.action-toast { position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 14px 24px; border-radius: 16px; font-size: 14px; font-weight: 500; z-index: 101; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3); }
.action-toast.success { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; }
.action-toast.error { background: linear-gradient(135deg, #ef5350 0%, #e53935 100%); color: white; }
.toast-icon { font-size: 18px; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* ==================== 档案页面样式 ==================== */
.profile-content { padding: 16px; padding-bottom: 80px; background: #f0f2f5; color: #333; }
.student-id-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); margin-bottom: 20px; position: relative; border: 1px solid #e0e0e0; }
.student-id-card::before { content: "TIANHUA"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 40px; font-weight: bold; color: rgba(0,0,0,0.03); pointer-events: none; z-index: 0; }
.card-header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 10px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 3px solid #ffd93d; }
.school-logo { font-size: 20px; }
.school-name-text { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
.card-title { margin-left: auto; font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; }
.card-body { display: flex; padding: 16px; gap: 16px; position: relative; z-index: 1; }
.student-photo { width: 70px; height: 90px; background: #eee; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
.student-photo img { width: 100%; height: 100%; object-fit: cover; }
.student-info { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.student-info .info-row { display: flex; align-items: center; border-bottom: 1px dashed #eee; padding-bottom: 4px; }
.student-info .info-label { font-size: 11px; color: #888; width: 50px; }
.student-info .info-value { font-size: 13px; font-weight: bold; color: #333; }
.card-footer { background: #f9f9f9; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; }
.barcode { font-family: 'Courier New', Courier, monospace; font-weight: bold; font-size: 10px; letter-spacing: 2px; opacity: 0.6; transform: scaleY(1.5); }
.card-hint { font-size: 9px; color: #aaa; }

.skills-section { background: white; border-radius: 12px; padding: 12px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.skills-section .section-title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: bold; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #eee; color: #333; }
.skills-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.skill-item { margin-bottom: 4px; }
.skill-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; }
.skill-name { color: #555; font-weight: 500; }
.skill-level { color: #1e3c72; font-weight: bold; }
.skill-progress-bg { height: 6px; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
.skill-progress-bar { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
.subject-bar { background: linear-gradient(90deg, #4caf50, #8bc34a); }
.skill-bar { background: linear-gradient(90deg, #2196f3, #03a9f4); }

/* 选修课标签 */
.elective-tags { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 15px; }
.elective-tag { padding: 5px 12px; background: rgba(33, 150, 243, 0.15); border-radius: 16px; color: #64B5F6; font-size: 13px; }

/* 教师信息列表 */
.teacher-info-list { display: flex; flex-direction: column; gap: 10px; }
.teacher-info-item { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; background: #f5f7fa; border-radius: 8px; border-left: 3px solid #1e3c72; }
.teacher-info-label { font-size: 12px; color: #888; min-width: 60px; flex-shrink: 0; }
.teacher-info-value { font-size: 13px; color: #333; font-weight: 500; word-break: break-all; }
.teacher-card .card-header { background: linear-gradient(135deg, #2a5298 0%, #1e3c72 100%); border-bottom-color: #90caf9; }

/* 论坛内容区域 */
.forum-content { height: 100%; }

.holiday-cell { background: rgba(255, 99, 71, 0.15) !important; color: rgba(255, 255, 255, 0.8); }
.exam-cell { background: rgba(155, 89, 182, 0.2) !important; color: rgba(255, 255, 255, 0.9); }
.partial-holiday-cell { background: rgba(255, 159, 67, 0.15) !important; }
.holiday-content { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; font-size: 10px; }
.holiday-icon { font-size: 14px; margin-bottom: 2px; }
.holiday-name { font-weight: bold; text-align: center; line-height: 1.2; }
</style>
