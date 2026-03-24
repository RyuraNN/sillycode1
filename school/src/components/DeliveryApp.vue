<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { 
  fetchProductCatalogFromWorldbook, 
  filterProductsByMonth, 
  filterProductsByCategory,
  getCategories,
  isEquipableProduct,
  getItemType
} from '../utils/deliveryWorldbook'

const emit = defineEmits(['close'])
const gameStore = useGameStore()

// 状态
const loading = ref(true)
const allProducts = ref([])
const currentCategory = ref('all')
const selectedProduct = ref(null)
const cart = ref([])
const showCart = ref(false)
const showOrderPanel = ref(false)
const selectedDeliveryTime = ref(null)
const searchQuery = ref('')
const categoryTabsRef = ref(null)
const isDragging = ref(false)
const startX = ref(0)
const scrollLeft = ref(0)

// 加载商品数据
onMounted(async () => {
  loading.value = true
  try {
    const products = await fetchProductCatalogFromWorldbook()
    if (products) {
      allProducts.value = products
    } else {
      // 没有从世界书加载到数据
      console.warn('[DeliveryApp] No products loaded from worldbook')
    }
  } catch (e) {
    console.error('[DeliveryApp] Error loading products:', e)
  }
  loading.value = false
})

// 当月可用商品
const availableProducts = computed(() => {
  const month = gameStore.world.gameTime.month
  return filterProductsByMonth(allProducts.value, month)
})

// 所有分类
const categories = computed(() => {
  const cats = getCategories(availableProducts.value)
  return [{ key: 'all', label: '全部' }, ...cats.map(c => ({ key: c, label: c }))]
})

// 过滤后的商品
const filteredProducts = computed(() => {
  let products = filterProductsByCategory(availableProducts.value, currentCategory.value)
  
  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase()
    products = products.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.description.toLowerCase().includes(query)
    )
  }
  
  return products
})

// 购物车商品数量
const cartItemCount = computed(() => {
  return cart.value.reduce((sum, item) => sum + item.quantity, 0)
})

// 购物车总价
const cartTotal = computed(() => {
  return cart.value.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
})

// 最早可送达时间（基于购物车商品的最小送货时间）
const earliestDeliveryHours = computed(() => {
  if (cart.value.length === 0) return 0
  return Math.max(...cart.value.map(item => item.product.deliveryTime?.min || 0))
})

// 可选送达时间列表
const deliveryTimeOptions = computed(() => {
  const options = []
  const { year, month, day, hour } = gameStore.world.gameTime
  const minHours = earliestDeliveryHours.value

  for (let i = 0; i < 24; i++) {
    const totalHours = minHours + i
    const target = new Date(year, month - 1, day, hour + totalHours, 0)
    const tYear = target.getFullYear()
    const tMonth = target.getMonth() + 1
    const tDay = target.getDate()
    const tHour = target.getHours()

    if (tHour >= 8 && tHour <= 22) {
      const dayDiff = Math.round((target.getTime() - new Date(year, month - 1, day).getTime()) / 86400000)
      const dayLabel = dayDiff === 0 ? '今天' : (dayDiff === 1 ? '明天' : `${tMonth}月${tDay}日`)
      options.push({
        label: `${dayLabel} ${String(tHour).padStart(2, '0')}:00`,
        value: { year: tYear, month: tMonth, day: tDay, hour: tHour }
      })
    }
  }
  return options.slice(0, 12)
})

// 点击商品
const selectProduct = (product) => {
  selectedProduct.value = product
}

// 关闭商品详情
const closeProductDetail = () => {
  selectedProduct.value = null
}

// 添加到购物车
const addToCart = (product) => {
  const existing = cart.value.find(item => item.product.id === product.id)
  if (existing) {
    existing.quantity++
  } else {
    cart.value.push({ product, quantity: 1 })
  }
  selectedProduct.value = null
}

// 从购物车移除
const removeFromCart = (productId) => {
  const index = cart.value.findIndex(item => item.product.id === productId)
  if (index > -1) {
    cart.value.splice(index, 1)
  }
}

// 修改购物车数量
const updateCartQuantity = (productId, delta) => {
  const item = cart.value.find(i => i.product.id === productId)
  if (item) {
    item.quantity += delta
    if (item.quantity <= 0) {
      removeFromCart(productId)
    }
  }
}

// 打开下单面板
const openOrderPanel = () => {
  if (cart.value.length === 0) return
  if (cartTotal.value > gameStore.player.money) {
    alert('余额不足！')
    return
  }
  selectedDeliveryTime.value = deliveryTimeOptions.value[0]?.value || null
  showOrderPanel.value = true
}

// 确认下单
const confirmOrder = () => {
  if (!selectedDeliveryTime.value) return

  // 余额二次校验
  if (cartTotal.value > gameStore.player.money) {
    alert('余额不足，无法下单！')
    return
  }

  // 扣款
  gameStore.player.money -= cartTotal.value
  
  // 创建订单
  const order = {
    id: Date.now().toString(),
    items: cart.value.map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      product: item.product
    })),
    total: cartTotal.value,
    orderTime: {
      year: gameStore.world.gameTime.year,
      month: gameStore.world.gameTime.month,
      day: gameStore.world.gameTime.day,
      hour: gameStore.world.gameTime.hour
    },
    deliveryTime: selectedDeliveryTime.value,
    status: 'pending'
  }
  
  // 添加到待送达订单
  gameStore.addPendingDelivery(order)
  
  // 清空购物车
  cart.value = []
  showOrderPanel.value = false
  showCart.value = false
  
  alert('订单提交成功！')
}

// 格式化效果显示
const formatEffect = (effect) => {
  if (!effect || effect.length === 0) return '无'
  return effect.map(e => {
    const sign = e.value > 0 ? '+' : ''
    const percent = e.isPercentage ? '%' : ''
    return `${e.attribute}${sign}${e.value}${percent}`
  }).join(', ')
}

// 格式化生效时间
const formatDuration = (hours) => {
  if (hours === 0) return '立即'
  if (hours === '永久') return '永久'
  if (hours < 24) return `${hours}小时`
  if (hours % 24 === 0) return `${hours / 24}天`
  if (hours % 168 === 0) return `${hours / 168}周`
  return `${hours}小时`
}

// 鼠标拖拽滚动逻辑
const startDrag = (e) => {
  isDragging.value = true
  startX.value = e.pageX - categoryTabsRef.value.offsetLeft
  scrollLeft.value = categoryTabsRef.value.scrollLeft
}

const stopDrag = () => {
  isDragging.value = false
}

const doDrag = (e) => {
  if (!isDragging.value) return
  e.preventDefault()
  const x = e.pageX - categoryTabsRef.value.offsetLeft
  const walk = (x - startX.value) * 2 // 滚动速度倍率
  categoryTabsRef.value.scrollLeft = scrollLeft.value - walk
}
</script>

<template>
  <div class="delivery-app">
    <!-- 头部 -->
    <div class="app-header">
      <button class="back-btn" @click="$emit('close')">‹</button>
      <span class="header-title">校园外卖</span>
      <button class="cart-btn" @click="showCart = true">
        🛒
        <span v-if="cartItemCount > 0" class="cart-badge">{{ cartItemCount }}</span>
      </button>
    </div>
    
    <!-- 搜索栏 -->
    <div class="search-bar">
      <input 
        type="text" 
        v-model="searchQuery" 
        placeholder="搜索商品..."
        class="search-input"
      />
    </div>
    
    <!-- 分类标签 -->
    <div 
      class="category-tabs" 
      ref="categoryTabsRef"
      @mousedown="startDrag"
      @mouseleave="stopDrag"
      @mouseup="stopDrag"
      @mousemove="doDrag"
    >
      <button 
        v-for="cat in categories" 
        :key="cat.key"
        class="category-tab"
        :class="{ active: currentCategory === cat.key }"
        @click="currentCategory = cat.key"
      >
        {{ cat.label }}
      </button>
    </div>
    
    <!-- 商品列表 -->
    <div class="product-list">
      <div v-if="loading" class="loading-state">
        加载中...
      </div>
      <div v-else-if="filteredProducts.length === 0" class="empty-state">
        暂无商品
      </div>
      <div 
        v-else
        v-for="product in filteredProducts" 
        :key="product.id"
        class="product-card"
        @click="selectProduct(product)"
      >
        <div class="product-icon">
          {{ product.category === '餐饮' ? '🍱' : 
             product.category === '零食' ? '🍿' :
             product.category === '学习用具' ? '📚' :
             product.category === '日用品' ? '🧴' :
             product.category === '娱乐' ? '🎮' :
             product.category === '锻炼' ? '🏋️' :
             product.category?.startsWith('服饰') ? '👕' :
             product.category === '礼物' ? '🎁' : '📦' }}
        </div>
        <div class="product-info">
          <div class="product-name">{{ product.name }}</div>
          <div class="product-desc">{{ product.description?.substring(0, 30) }}{{ product.description?.length > 30 ? '...' : '' }}</div>
          <div class="product-price">¥{{ product.price }}</div>
        </div>
        <button class="add-btn" @click.stop="addToCart(product)">+</button>
      </div>
    </div>
    
    <!-- 底部购物车提示 -->
    <div v-if="cartItemCount > 0 && !showCart" class="cart-bar" @click="showCart = true">
      <div class="cart-info">
        <span class="cart-count">{{ cartItemCount }}件商品</span>
        <span class="cart-total">¥{{ cartTotal }}</span>
      </div>
      <button class="checkout-btn">去结算</button>
    </div>
    
    <!-- 商品详情弹窗 -->
    <div v-if="selectedProduct" class="modal-overlay" @click="closeProductDetail">
      <div class="product-detail-modal" @click.stop>
        <div class="detail-header">
          <span class="detail-category">{{ selectedProduct.category }}</span>
          <button class="close-btn" @click="closeProductDetail">×</button>
        </div>
        <div class="detail-name">{{ selectedProduct.name }}</div>
        <div class="detail-price">¥{{ selectedProduct.price }}</div>
        <div class="detail-desc">{{ selectedProduct.description }}</div>
        
        <div class="detail-section">
          <div class="detail-label">效果</div>
          <div class="detail-value">{{ formatEffect(selectedProduct.effect) }}</div>
        </div>
        
        <div class="detail-section">
          <div class="detail-label">生效时间</div>
          <div class="detail-value">{{ formatDuration(selectedProduct.effectDuration) }}</div>
        </div>
        
        <div class="detail-section">
          <div class="detail-label">耐久度</div>
          <div class="detail-value">{{ selectedProduct.durability || 1 }}</div>
        </div>
        
        <div class="detail-section">
          <div class="detail-label">最快送达</div>
          <div class="detail-value">{{ selectedProduct.deliveryTime?.min || 0 }}小时后</div>
        </div>
        
        <button class="add-to-cart-btn" @click="addToCart(selectedProduct)">
          加入购物车
        </button>
      </div>
    </div>
    
    <!-- 购物车弹窗 -->
    <div v-if="showCart" class="modal-overlay" @click="showCart = false">
      <div class="cart-modal" @click.stop>
        <div class="cart-header">
          <span class="cart-title">购物车</span>
          <button class="close-btn" @click="showCart = false">×</button>
        </div>
        
        <div class="cart-list">
          <div v-if="cart.length === 0" class="empty-cart">
            购物车是空的
          </div>
          <div v-for="item in cart" :key="item.product.id" class="cart-item">
            <div class="cart-item-info">
              <div class="cart-item-name">{{ item.product.name }}</div>
              <div class="cart-item-price">¥{{ item.product.price }}</div>
            </div>
            <div class="cart-item-controls">
              <button class="qty-btn" @click="updateCartQuantity(item.product.id, -1)">-</button>
              <span class="qty-value">{{ item.quantity }}</span>
              <button class="qty-btn" @click="updateCartQuantity(item.product.id, 1)">+</button>
            </div>
          </div>
        </div>
        
        <div class="cart-footer">
          <div class="cart-summary">
            <span>合计：</span>
            <span class="total-price">¥{{ cartTotal }}</span>
          </div>
          <div class="balance-info">
            余额：¥{{ gameStore.player.money }}
          </div>
          <button 
            class="confirm-order-btn" 
            :disabled="cart.length === 0 || cartTotal > gameStore.player.money"
            @click="openOrderPanel"
          >
            {{ cartTotal > gameStore.player.money ? '余额不足' : '选择送达时间' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 选择送达时间弹窗 -->
    <div v-if="showOrderPanel" class="modal-overlay" @click="showOrderPanel = false">
      <div class="order-modal" @click.stop>
        <div class="order-header">
          <span class="order-title">选择送达时间</span>
          <button class="close-btn" @click="showOrderPanel = false">×</button>
        </div>
        
        <div class="delivery-time-list">
          <div 
            v-for="option in deliveryTimeOptions" 
            :key="`${option.value.year}-${option.value.month}-${option.value.day}-${option.value.hour}`"
            class="time-option"
            :class="{ selected: selectedDeliveryTime?.year === option.value.year && selectedDeliveryTime?.month === option.value.month && selectedDeliveryTime?.day === option.value.day && selectedDeliveryTime?.hour === option.value.hour }"
            @click="selectedDeliveryTime = option.value"
          >
            {{ option.label }}
          </div>
        </div>
        
        <div class="order-footer">
          <div class="order-summary">
            <div>商品总计：¥{{ cartTotal }}</div>
            <div v-if="selectedDeliveryTime">
              送达时间：{{ deliveryTimeOptions.find(o => o.value.year === selectedDeliveryTime.year && o.value.month === selectedDeliveryTime.month && o.value.day === selectedDeliveryTime.day && o.value.hour === selectedDeliveryTime.hour)?.label }}
            </div>
          </div>
          <button 
            class="place-order-btn"
            :disabled="!selectedDeliveryTime"
            @click="confirmOrder"
          >
            确认下单
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delivery-app {
  width: 100%;
  height: 100%;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-header {
  height: 44px;
  background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
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

.cart-btn {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  position: relative;
  padding: 4px;
}

.cart-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #ff3b30;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-bar {
  padding: 10px 12px;
  background: #fff;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #ff6b35;
}

.category-tabs {
  display: flex;
  padding: 8px 12px;
  background: #fff;
  gap: 8px;
  overflow-x: auto;
  flex-shrink: 0;
  border-bottom: 1px solid #eee;
  cursor: grab; /* 提示可拖拽 */
  user-select: none; /* 防止拖拽时选中文本 */
}

.category-tabs:active {
  cursor: grabbing;
}

.category-tab {
  padding: 6px 14px;
  border: none;
  background: #f0f0f0;
  border-radius: 16px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.category-tab.active {
  background: #ff6b35;
  color: #fff;
}

.product-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.loading-state,
.empty-state {
  text-align: center;
  color: #999;
  padding: 40px 20px;
  font-size: 14px;
}

.product-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  cursor: pointer;
  transition: transform 0.1s;
}

.product-card:active {
  transform: scale(0.98);
}

.product-icon {
  width: 50px;
  height: 50px;
  background: #f8f8f8;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-right: 12px;
  flex-shrink: 0;
}

.product-info {
  flex: 1;
  min-width: 0;
}

.product-name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.product-desc {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-price {
  font-size: 15px;
  font-weight: 600;
  color: #ff6b35;
}

.add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #ff6b35;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 10px;
}

.cart-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #333;
  color: #fff;
  flex-shrink: 0;
  cursor: pointer;
}

.cart-info {
  display: flex;
  gap: 12px;
}

.cart-count {
  font-size: 14px;
}

.cart-total {
  font-size: 18px;
  font-weight: 600;
}

.checkout-btn {
  padding: 10px 24px;
  background: #ff6b35;
  border: none;
  border-radius: 20px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* 弹窗样式 */
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

.product-detail-modal,
.cart-modal,
.order-modal {
  width: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  max-height: 80%;
  display: flex;
  flex-direction: column;
}

.detail-header,
.cart-header,
.order-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.detail-category {
  font-size: 13px;
  color: #ff6b35;
  background: #fff5f0;
  padding: 4px 10px;
  border-radius: 12px;
}

.cart-title,
.order-title {
  font-size: 17px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.detail-name {
  font-size: 20px;
  font-weight: 600;
  padding: 16px 16px 8px;
}

.detail-price {
  font-size: 24px;
  font-weight: 700;
  color: #ff6b35;
  padding: 0 16px 12px;
}

.detail-desc {
  font-size: 14px;
  color: #666;
  padding: 0 16px 16px;
  line-height: 1.5;
}

.detail-section {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #f5f5f5;
}

.detail-label {
  color: #999;
  font-size: 14px;
}

.detail-value {
  color: #333;
  font-size: 14px;
  font-weight: 500;
}

.add-to-cart-btn {
  margin: 16px;
  padding: 14px;
  background: #ff6b35;
  border: none;
  border-radius: 24px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

/* 购物车样式 */
.cart-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-cart {
  text-align: center;
  color: #999;
  padding: 40px 0;
}

.cart-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f5f5f5;
}

.cart-item-name {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 4px;
}

.cart-item-price {
  font-size: 14px;
  color: #ff6b35;
}

.cart-item-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qty-value {
  font-size: 15px;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

.cart-footer {
  padding: 16px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.cart-summary {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.total-price {
  font-size: 20px;
  font-weight: 700;
  color: #ff6b35;
}

.balance-info {
  font-size: 13px;
  color: #999;
  margin-bottom: 12px;
}

.confirm-order-btn,
.place-order-btn {
  width: 100%;
  padding: 14px;
  background: #ff6b35;
  border: none;
  border-radius: 24px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.confirm-order-btn:disabled,
.place-order-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* 送达时间选择 */
.delivery-time-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.time-option {
  padding: 12px 8px;
  border: 1px solid #ddd;
  border-radius: 8px;
  text-align: center;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.time-option.selected {
  border-color: #ff6b35;
  background: #fff5f0;
  color: #ff6b35;
}

.order-footer {
  padding: 16px;
  border-top: 1px solid #eee;
}

.order-summary {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.order-summary div {
  margin-bottom: 4px;
}
</style>
