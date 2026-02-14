<script setup>
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// 当前视图：list | detail | compose
const currentView = ref('list')
// 当前Tab: active | paused
const currentTab = ref('active')
// 选中的校规
const selectedRule = ref(null)
// 确认删除弹窗
const showDeleteConfirm = ref(false)

// 新校规表单
const newRule = ref({
  title: '',
  content: '',
  genderMale: true,
  genderFemale: true,
  roleStudent: true,
  roleTeacher: false,
  roleStaff: false,
  isWeird: false
})

// 获取校规列表
const rules = computed(() => {
  return gameStore.player.schoolRules || []
})

// 按状态过滤
const activeRules = computed(() => rules.value.filter(r => r.status === 'active'))
const pausedRules = computed(() => rules.value.filter(r => r.status === 'paused'))

const filteredRules = computed(() => {
  return currentTab.value === 'active' ? activeRules.value : pausedRules.value
})

// 性别标签映射
const genderLabel = { male: '男', female: '女' }
const roleLabel = { student: '学生', teacher: '教师', staff: '教职工' }

// 格式化目标标签
const formatTargets = (rule) => {
  const genders = rule.targets.gender.map(g => genderLabel[g] || g)
  const roles = rule.targets.roles.map(r => roleLabel[r] || r)
  return [...genders, ...roles]
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 查看详情
const viewDetail = (rule) => {
  selectedRule.value = rule
  currentView.value = 'detail'
}

// 返回
const goBack = () => {
  if (currentView.value === 'detail') {
    selectedRule.value = null
    currentView.value = 'list'
  } else if (currentView.value === 'compose') {
    currentView.value = 'list'
  }
}

// 打开发布页
const openCompose = () => {
  newRule.value = {
    title: '',
    content: '',
    genderMale: true,
    genderFemale: true,
    roleStudent: true,
    roleTeacher: false,
    roleStaff: false,
    isWeird: false
  }
  currentView.value = 'compose'
}

// 发布校规
const submitRule = () => {
  if (!newRule.value.title.trim()) {
    alert('请填写校规标题')
    return
  }
  if (!newRule.value.content.trim()) {
    alert('请填写校规内容')
    return
  }

  const genders = []
  if (newRule.value.genderMale) genders.push('male')
  if (newRule.value.genderFemale) genders.push('female')
  
  const roles = []
  if (newRule.value.roleStudent) roles.push('student')
  if (newRule.value.roleTeacher) roles.push('teacher')
  if (newRule.value.roleStaff) roles.push('staff')

  if (genders.length === 0) {
    alert('请至少选择一个适用性别')
    return
  }
  if (roles.length === 0) {
    alert('请至少选择一个适用角色类型')
    return
  }

  gameStore.addSchoolRule({
    title: newRule.value.title.trim(),
    content: newRule.value.content.trim(),
    targets: { gender: genders, roles: roles },
    isWeird: newRule.value.isWeird
  })

  currentView.value = 'list'
  currentTab.value = 'active'
}

// 切换校规状态
const toggleStatus = (rule) => {
  gameStore.toggleSchoolRuleStatus(rule.id)
  // 如果在详情页，更新引用
  if (selectedRule.value && selectedRule.value.id === rule.id) {
    selectedRule.value = rules.value.find(r => r.id === rule.id)
  }
}

// 删除校规
const confirmDelete = () => {
  if (selectedRule.value) {
    gameStore.deleteSchoolRule(selectedRule.value.id)
    selectedRule.value = null
    showDeleteConfirm.value = false
    currentView.value = 'list'
  }
}
</script>

<template>
  <div class="school-rule-app">
    <!-- 顶部导航栏 -->
    <div class="rule-header">
      <button v-if="currentView !== 'list'" class="back-btn" @click="goBack">‹</button>
      <span class="header-title">
        {{ currentView === 'list' ? '校园公告' :
           currentView === 'compose' ? '发布校规' : '校规详情' }}
      </span>
      <button v-if="currentView === 'list'" class="compose-btn" @click="openCompose">＋</button>
      <div v-else class="header-spacer"></div>
    </div>

    <!-- Tab 导航 (仅列表页) -->
    <div v-if="currentView === 'list'" class="tab-nav">
      <div 
        class="tab-item"
        :class="{ active: currentTab === 'active' }"
        @click="currentTab = 'active'"
      >
        生效中 ({{ activeRules.length }})
      </div>
      <div 
        class="tab-item"
        :class="{ active: currentTab === 'paused' }"
        @click="currentTab = 'paused'"
      >
        已暂停 ({{ pausedRules.length }})
      </div>
    </div>

    <!-- 校规列表 -->
    <div v-if="currentView === 'list'" class="rule-list">
      <div 
        v-for="rule in filteredRules" 
        :key="rule.id" 
        class="rule-card"
        :class="{ paused: rule.status === 'paused', weird: rule.isWeird }"
        @click="viewDetail(rule)"
      >
        <div class="rule-card-header">
          <span class="rule-id">{{ rule.id }}</span>
          <span v-if="rule.isWeird" class="weird-badge">⚡ 特殊</span>
          <span class="rule-date">{{ formatTime(rule.createdAt) }}</span>
        </div>
        <div class="rule-card-title">{{ rule.title }}</div>
        <div class="rule-card-content">{{ rule.content }}</div>
        <div class="rule-card-tags">
          <span 
            v-for="tag in formatTargets(rule)" 
            :key="tag" 
            class="target-tag"
          >{{ tag }}</span>
        </div>
        <div class="rule-card-footer">
          <span class="status-dot" :class="rule.status"></span>
          <span class="status-text">{{ rule.status === 'active' ? '生效中' : '已暂停' }}</span>
          <label class="mini-switch" @click.stop>
            <input 
              type="checkbox" 
              :checked="rule.status === 'active'" 
              @change="toggleStatus(rule)"
            >
            <span class="mini-slider"></span>
          </label>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredRules.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">
          {{ currentTab === 'active' ? '暂无生效校规' : '暂无暂停校规' }}
        </div>
        <button v-if="currentTab === 'active'" class="empty-action" @click="openCompose">
          发布第一条校规
        </button>
      </div>
    </div>

    <!-- 校规详情 -->
    <div v-if="currentView === 'detail' && selectedRule" class="rule-detail">
      <div class="detail-scroll">
        <div class="detail-status-bar" :class="selectedRule.status">
          <span class="status-dot" :class="selectedRule.status"></span>
          <span>{{ selectedRule.status === 'active' ? '🟢 当前生效' : '⏸️ 已暂停' }}</span>
        </div>

        <h2 class="detail-title">
          <span v-if="selectedRule.isWeird" class="weird-badge">⚡ 特殊</span>
          {{ selectedRule.title }}
        </h2>

        <div class="detail-meta">
          <span>编号：{{ selectedRule.id }}</span>
          <span>发布于：{{ formatTime(selectedRule.createdAt) }}</span>
        </div>

        <div class="detail-section">
          <div class="section-label">校规内容</div>
          <div class="detail-body">{{ selectedRule.content }}</div>
        </div>

        <div class="detail-section">
          <div class="section-label">适用对象</div>
          <div class="target-tags-detail">
            <span class="section-sub">性别：</span>
            <span 
              v-for="g in selectedRule.targets.gender" 
              :key="g" 
              class="target-tag-detail"
            >{{ genderLabel[g] }}</span>
          </div>
          <div class="target-tags-detail" style="margin-top: 8px;">
            <span class="section-sub">角色：</span>
            <span 
              v-for="r in selectedRule.targets.roles" 
              :key="r" 
              class="target-tag-detail"
            >{{ roleLabel[r] }}</span>
          </div>
        </div>

        <div v-if="selectedRule.isWeird" class="detail-section weird-note">
          <div class="section-label">⚡ 特殊校规说明</div>
          <p>此校规已被标记为"特殊校规"。虽然内容可能不太寻常，但已正式生效。游戏内角色会以符合自身性格的方式来应对这条校规。</p>
        </div>

        <div class="detail-actions">
          <button 
            class="action-btn toggle-btn"
            :class="selectedRule.status === 'active' ? 'pause' : 'resume'"
            @click="toggleStatus(selectedRule)"
          >
            {{ selectedRule.status === 'active' ? '⏸️ 暂停校规' : '▶️ 恢复生效' }}
          </button>
          <button class="action-btn delete-btn" @click="showDeleteConfirm = true">
            🗑️ 删除校规
          </button>
        </div>
      </div>
    </div>

    <!-- 发布校规 -->
    <div v-if="currentView === 'compose'" class="compose-view">
      <div class="compose-scroll">
        <div class="form-group">
          <label class="form-label">校规标题 *</label>
          <input 
            v-model="newRule.title" 
            type="text" 
            class="form-input" 
            placeholder="例如：校园内禁止奔跑"
            maxlength="50"
          />
        </div>

        <div class="form-group">
          <label class="form-label">校规内容 *</label>
          <textarea 
            v-model="newRule.content" 
            class="form-textarea" 
            placeholder="请详细描述校规内容..."
            rows="5"
          ></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">适用性别</label>
          <div class="checkbox-group">
            <label class="checkbox-item">
              <input type="checkbox" v-model="newRule.genderMale">
              <span class="checkbox-label">👦 男性</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="newRule.genderFemale">
              <span class="checkbox-label">👧 女性</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">适用角色</label>
          <div class="checkbox-group">
            <label class="checkbox-item">
              <input type="checkbox" v-model="newRule.roleStudent">
              <span class="checkbox-label">🎒 学生</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="newRule.roleTeacher">
              <span class="checkbox-label">👩‍🏫 教师</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="newRule.roleStaff">
              <span class="checkbox-label">🏢 教职工</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <div class="weird-toggle">
            <div class="weird-toggle-text">
              <span class="weird-toggle-label">⚡ 标记为特殊校规</span>
              <span class="weird-toggle-hint">开启后AI角色会以更丰富的性格反应来应对此校规</span>
            </div>
            <label class="mini-switch">
              <input type="checkbox" v-model="newRule.isWeird">
              <span class="mini-slider"></span>
            </label>
          </div>
        </div>

        <button class="submit-btn" @click="submitRule">📢 发布校规</button>
        <p class="compose-hint">校规发布后立即生效，仅在校园范围内有效</p>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal-box">
        <div class="modal-title">确认删除</div>
        <div class="modal-body">
          确定要删除校规「{{ selectedRule?.title }}」吗？此操作不可撤销。
        </div>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showDeleteConfirm = false">取消</button>
          <button class="modal-btn confirm" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.school-rule-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  overflow: hidden;
  position: relative;
}

/* 顶部导航 */
.rule-header {
  height: 44px;
  background: linear-gradient(135deg, #c62828 0%, #e53935 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #fff;
  cursor: pointer;
  padding: 0;
  width: 30px;
}

.header-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.compose-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #fff;
  cursor: pointer;
  padding: 0;
  width: 30px;
  font-weight: bold;
}

.header-spacer {
  width: 30px;
}

/* Tab 导航 */
.tab-nav {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
  flex-shrink: 0;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-item.active {
  color: #c62828;
  border-bottom-color: #c62828;
}

/* 校规列表 */
.rule-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px;
}

.rule-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: transform 0.1s;
  border-left: 3px solid #4caf50;
}

.rule-card:active {
  transform: scale(0.98);
}

.rule-card.paused {
  border-left-color: #9e9e9e;
  opacity: 0.75;
}

.rule-card.weird {
  border-left-color: #ff9800;
}

.rule-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.rule-id {
  font-size: 11px;
  color: #999;
  font-family: monospace;
}

.weird-badge {
  font-size: 11px;
  background: #fff3e0;
  color: #e65100;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.rule-date {
  font-size: 11px;
  color: #999;
  margin-left: auto;
}

.rule-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #222;
  margin-bottom: 6px;
  line-height: 1.4;
}

.rule-card-content {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.rule-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.target-tag {
  font-size: 11px;
  background: #e3f2fd;
  color: #1565c0;
  padding: 2px 8px;
  border-radius: 10px;
}

.rule-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  background: #4caf50;
}

.status-dot.paused {
  background: #9e9e9e;
}

.status-text {
  font-size: 12px;
  color: #666;
}

/* Mini Switch */
.mini-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  margin-left: auto;
  flex-shrink: 0;
}

.mini-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.mini-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 22px;
}

.mini-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.mini-switch input:checked + .mini-slider {
  background-color: #4caf50;
}

.mini-switch input:checked + .mini-slider:before {
  transform: translateX(18px);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  color: #999;
  margin-bottom: 20px;
}

.empty-action {
  background: linear-gradient(135deg, #c62828 0%, #e53935 100%);
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
}

/* 校规详情 */
.rule-detail {
  flex: 1;
  overflow: hidden;
}

.detail-scroll {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
}

.detail-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.detail-status-bar.active {
  background: #e8f5e9;
  color: #2e7d32;
}

.detail-status-bar.paused {
  background: #f5f5f5;
  color: #757575;
}

.detail-title {
  font-size: 20px;
  font-weight: 700;
  color: #222;
  margin: 0 0 10px;
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.detail-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
  margin-bottom: 20px;
}

.detail-section {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #888;
  margin-bottom: 8px;
}

.section-sub {
  font-size: 13px;
  color: #888;
  margin-right: 6px;
}

.detail-body {
  font-size: 15px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
}

.target-tags-detail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.target-tag-detail {
  font-size: 13px;
  background: #e3f2fd;
  color: #1565c0;
  padding: 4px 12px;
  border-radius: 12px;
}

.weird-note {
  background: #fff8e1;
  border: 1px solid #ffe082;
}

.weird-note p {
  font-size: 13px;
  color: #795548;
  line-height: 1.5;
  margin: 0;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
  padding-bottom: 20px;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.action-btn:active {
  opacity: 0.7;
}

.toggle-btn.pause {
  background: #fff3e0;
  color: #e65100;
}

.toggle-btn.resume {
  background: #e8f5e9;
  color: #2e7d32;
}

.delete-btn {
  background: #ffebee;
  color: #c62828;
}

/* 发布校规 */
.compose-view {
  flex: 1;
  overflow: hidden;
}

.compose-scroll {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
}

.form-group {
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
  color: #333;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #c62828;
}

.form-textarea {
  resize: none;
  font-family: inherit;
  line-height: 1.5;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.checkbox-item:has(input:checked) {
  background: #e3f2fd;
  border-color: #1565c0;
}

.checkbox-item input {
  display: none;
}

.checkbox-label {
  font-size: 14px;
  color: #333;
}

.weird-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 12px 14px;
}

.weird-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  margin-right: 12px;
}

.weird-toggle-label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.weird-toggle-hint {
  font-size: 11px;
  color: #999;
  line-height: 1.3;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #c62828 0%, #e53935 100%);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:active {
  opacity: 0.8;
}

.compose-hint {
  text-align: center;
  font-size: 12px;
  color: #999;
  margin-top: 12px;
  margin-bottom: 20px;
}

/* 删除确认弹窗 */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal-box {
  width: 85%;
  max-width: 280px;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  padding: 18px 16px 8px;
  text-align: center;
}

.modal-body {
  font-size: 14px;
  color: #666;
  padding: 8px 16px 20px;
  text-align: center;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  border-top: 1px solid #e5e5e5;
}

.modal-btn {
  flex: 1;
  padding: 14px;
  border: none;
  font-size: 16px;
  cursor: pointer;
  background: none;
}

.modal-btn.cancel {
  color: #007aff;
  border-right: 1px solid #e5e5e5;
}

.modal-btn.confirm {
  color: #ff3b30;
  font-weight: 600;
}

.modal-btn:active {
  background: #f0f0f0;
}
</style>
