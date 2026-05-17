# 我的采购申请查询页面 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在"我的"页面待办分组中新增"我的采购申请"入口，进入后可查看当前用户提交的所有采购记录及其状态分布（待审批/未付款/已完成/已拒绝），支持按状态卡片筛选。

**Architecture:** 新增独立页面 `pages/my-purchases/`，通过 `db.queryAll()` 一次性加载当前用户全部采购记录，客户端分组计数 + 过滤。修改 `me/index.js` 和 `me/index.wxml` 新增入口项。

**Tech Stack:** 微信小程序 + 云数据库

---

### 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `miniprogram/pages/my-purchases/index.json` | 创建 | 页面配置（导航栏样式、下拉刷新等） |
| `miniprogram/pages/my-purchases/index.wxml` | 创建 | 页面模板（导航栏、状态卡片、采购列表、空状态） |
| `miniprogram/pages/my-purchases/index.wxss` | 创建 | 页面样式（卡片布局、列表样式） |
| `miniprogram/pages/my-purchases/index.js` | 创建 | 页面逻辑（数据加载、状态分组、卡片筛选） |
| `miniprogram/pages/me/index.js` | 修改 | 新增 pendingGroup 数据和路由映射 |
| `miniprogram/pages/me/index.wxml` | 修改 | 待办分组从硬编码单项改为 wx:for 动态渲染 |

---

### Task 1: 创建页面配置和模板

**Files:**
- Create: `miniprogram/pages/my-purchases/index.json`

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "glass-card": "../../components/glass-card/index",
    "theme-badge": "../../components/theme-badge/index"
  },
  "enablePullDownRefresh": false
}
```

- [ ] **Step 1: 创建 index.json**

```bash
mkdir -p "c:\Users\Andy\miniprograme\miniprogram\pages\my-purchases"
```

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "glass-card": "../../components/glass-card/index",
    "theme-badge": "../../components/theme-badge/index"
  },
  "enablePullDownRefresh": false
}
```

### Task 2: 创建页面样式

**Files:**
- Create: `miniprogram/pages/my-purchases/index.wxss`

```css
/* Status cards row */
.status-cards {
  display: flex;
  gap: 12rpx;
  padding: 24rpx 32rpx 16rpx;
}

.status-card {
  flex: 1;
  border-radius: 12rpx;
  padding: 16rpx 8rpx;
  text-align: center;
  transition: opacity 0.2s;
}

.status-card:active {
  opacity: 0.7;
}

.status-card-num {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.2;
}

.status-card-label {
  font-size: 22rpx;
  margin-top: 4rpx;
  opacity: 0.6;
}

/* Active card highlight */
.status-card.active {
  border-width: 2rpx;
  border-style: solid;
}

/* Section title between cards and list */
.section-header {
  padding: 16rpx 32rpx 12rpx;
  font-size: 24rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Purchase list */
.purchase-list {
  padding: 0 32rpx;
}

.purchase-item {
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 12rpx;
}

.purchase-item:active {
  opacity: 0.7;
}

.purchase-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.purchase-item-name {
  font-size: 30rpx;
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.purchase-item-amount {
  font-size: 30rpx;
  font-weight: 700;
  margin-left: 16rpx;
  flex-shrink: 0;
}

.purchase-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.purchase-item-meta-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.meta-tag {
  border-radius: 8rpx;
  padding: 4rpx 16rpx;
  font-size: 24rpx;
}

.meta-text {
  font-size: 24rpx;
}

.status-dot {
  display: inline-block;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  margin-right: 8rpx;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 160rpx;
}

.empty-state-icon {
  font-size: 80rpx;
}

.empty-state-text {
  font-size: 30rpx;
  margin-top: 24rpx;
}
```

- [ ] **Step 1: 创建 index.wxss**

用上述 CSS 内容写入文件。

### Task 3: 创建页面逻辑

**Files:**
- Create: `miniprogram/pages/my-purchases/index.js`

```js
var app = getApp()
var { handleCloudError } = require('../../utils/error-handler')
var { COLLECTIONS } = require('../../utils/db')
var { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
var db = require('../../utils/db')

// Status definitions for cards (custom labels for submitter's view)
var STATUS_CONFIG = [
  { key: 'pending', label: '待审批', color: '#FBBF24', borderColor: 'rgba(251,191,36,0.3)', bgColor: 'rgba(251,191,36,0.12)' },
  { key: 'approved', label: '未付款', color: '#3B82F6', borderColor: 'rgba(59,130,246,0.3)', bgColor: 'rgba(59,130,246,0.12)' },
  { key: 'reimbursed', label: '已完成', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.3)', bgColor: 'rgba(74,222,128,0.12)' },
  { key: 'rejected', label: '已拒绝', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)', bgColor: 'rgba(248,113,113,0.12)' }
]

// Generate empty count map for all statuses
function emptyCountMap() {
  var map = {}
  STATUS_CONFIG.forEach(function(s) { map[s.key] = 0 })
  return map
}

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    statusCards: [],           // [{ key, label, count, color, borderColor, bgColor }]
    activeStatus: '',          // '' = all, or a status key
    filteredList: [],          // current list to display
    sectionLabel: '',          // e.g. "待审批 (3)"
    hasRecords: false,         // whether user has submitted any purchases
    allItems: []               // all fetched purchases (for client-side filtering)
  },

  onLoad: function () {
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function () {
    this.loadData()
  },

  loadData: async function () {
    var that = this
    that.setData({ loading: true })

    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }

    try {
      var res = await db.queryAll(COLLECTIONS.PURCHASE, { purchaseBy: userInfo._id })
      var allItems = (res.data || []).sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

      // Count by status
      var counts = emptyCountMap()
      allItems.forEach(function(item) {
        var status = item.status || 'reimbursed'
        if (counts[status] !== undefined) counts[status]++
      })

      // Build status cards data
      var statusCards = STATUS_CONFIG.map(function(s) {
        return { ...s, count: counts[s.key] }
      })

      var hasRecords = allItems.length > 0
      var sectionLabel = hasRecords ? '全部 (' + allItems.length + ')' : ''

      that.setData({
        allItems: allItems,
        statusCards: statusCards,
        hasRecords: hasRecords,
        sectionLabel: sectionLabel,
        activeStatus: '',
        filteredList: allItems.map(function(item) { return that._formatItem(item) }),
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购记录')
    }
  },

  _formatItem: function (item) {
    var status = item.status || 'reimbursed'
    var statusLabel = this._getStatusLabel(status)
    var statusColor = this._getStatusColor(status)
    return {
      _id: item._id,
      item: item.item || '',
      amount: item.amount || 0,
      category: item.category || '',
      date: item.date || '',
      purchaseBy: item.purchaseBy || '',
      status: status,
      categoryName: getCategoryName(item.category),
      formattedAmount: formatAmount(item.amount),
      formattedDate: formatDate(item.date),
      statusLabel: statusLabel,
      statusColor: statusColor
    }
  },

  _getStatusLabel: function (status) {
    var map = { pending: '待审批', approved: '未付款', reimbursed: '已完成', rejected: '已拒绝' }
    return map[status] || ''
  },

  _getStatusColor: function (status) {
    var map = { pending: '#FBBF24', approved: '#3B82F6', reimbursed: '#4ADE80', rejected: '#F87171' }
    return map[status] || '#9CA3AF'
  },

  onCardTap: function (e) {
    var key = e.currentTarget.dataset.key || ''
    var activeStatus = this.data.activeStatus === key ? '' : key
    this._applyFilter(activeStatus)
  },

  _applyFilter: function (activeStatus) {
    var items = this.data.allItems
    var filtered = activeStatus
      ? items.filter(function(item) { return (item.status || 'reimbursed') === activeStatus })
      : items

    var label = activeStatus
      ? this._getStatusLabel(activeStatus) + ' (' + filtered.length + ')'
      : '全部 (' + items.length + ')'

    this.setData({
      activeStatus: activeStatus,
      filteredList: filtered.map(function(item) { return this._formatItem(item) }, this),
      sectionLabel: label
    })
  },

  onItemTap: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  },

  onBack: function () {
    wx.navigateBack()
  }
})
```

- [ ] **Step 1: 创建 index.js**

写入上述 JS 代码。

### Task 4: 创建页面模板

**Files:**
- Create: `miniprogram/pages/my-purchases/index.wxml`

```html
<view class="my-purchases-page" style="background: {{theme.surface || '#1A1A2E'}}; min-height: 100vh; padding-bottom: 120rpx; padding-top: {{statusBarHeight + 44}}px;">
  <!-- Custom Navigation Bar -->
  <view class="nav-bar" style="background: {{theme.gradientHeader || theme.surfaceColor}}; padding-top: {{statusBarHeight}}px; height: {{statusBarHeight + 44}}px; box-sizing: border-box;">
    <view class="nav-bar-content">
      <view class="nav-back" bindtap="onBack">
        <text class="nav-back-icon" style="color: {{theme.textPrimary || '#F5F0E8'}};">❮</text>
      </view>
      <text class="nav-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">我的采购</text>
      <view class="nav-action"></view>
    </view>
  </view>

  <!-- Skeleton Loading -->
  <view wx:if="{{loading}}" style="padding: 24rpx 32rpx;">
    <view wx:for="{{[1,2,3]}}" wx:key="*this" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border-radius: 20rpx; padding: 28rpx; margin-bottom: 16rpx; opacity: 0.5;">
      <view style="height: 32rpx; width: 60%; background: {{theme.border || 'rgba(255,255,255,0.06)'}}; border-radius: 8rpx; margin-bottom: 16rpx;"></view>
      <view style="height: 24rpx; width: 40%; background: {{theme.border || 'rgba(255,255,255,0.06)'}}; border-radius: 8rpx; margin-bottom: 12rpx;"></view>
      <view style="height: 24rpx; width: 30%; background: {{theme.border || 'rgba(255,255,255,0.06)'}}; border-radius: 8rpx;"></view>
    </view>
  </view>

  <!-- Content -->
  <view wx:else>
    <!-- Empty state: no records at all -->
    <view wx:if="{{!hasRecords}}" class="empty-state">
      <text class="empty-state-icon">📋</text>
      <text class="empty-state-text" style="color: {{theme.textMuted || '#5C5C72'}};">没有申请记录</text>
    </view>

    <!-- Has records -->
    <view wx:else>
      <!-- Status cards row -->
      <view class="status-cards">
        <view wx:for="{{statusCards}}" wx:key="key" class="status-card {{activeStatus === item.key ? 'active' : ''}}"
          data-key="{{item.key}}" bindtap="onCardTap"
          style="background: {{item.bgColor}}; border-color: {{item.borderColor}}; {{activeStatus === item.key ? 'border-width: 2rpx; border-style: solid;' : 'border-width: 0;'}}">
          <text class="status-card-num" style="color: {{item.color}};">{{item.count}}</text>
          <text class="status-card-label" style="color: {{item.color}};">{{item.label}}</text>
        </view>
      </view>

      <!-- All button -->
      <view style="padding: 0 32rpx 16rpx;">
        <view bindtap="onCardTap" data-key=""
          style="display: inline-block; padding: 8rpx 24rpx; border-radius: 999rpx; font-size: 24rpx; 
            {{activeStatus === '' ? 'background: ' + (theme.accentColor || '#C9A96E') + '; color: #0F0F1A; font-weight: 600;' : 'background: ' + (theme.elevated || '#252540') + '; color: ' + (theme.textSecondary || '#9A9AB0') + ';'}}">
          全部
        </view>
      </view>

      <!-- Section header -->
      <view class="section-header" style="color: {{theme.textMuted || 'rgba(245,240,232,0.40)'}};">
        <text>{{sectionLabel}}</text>
      </view>

      <!-- Empty filtered -->
      <view wx:if="{{filteredList.length === 0}}" class="empty-state" style="padding-top: 80rpx;">
        <text class="empty-state-text" style="color: {{theme.textMuted || '#5C5C72'}};">暂无此类状态的采购记录</text>
      </view>

      <!-- Purchase list -->
      <view class="purchase-list" wx:if="{{filteredList.length > 0}}">
        <view class="purchase-item" wx:for="{{filteredList}}" wx:key="_id" bindtap="onItemTap" data-id="{{item._id}}"
          style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.border || 'rgba(255,255,255,0.06)'}};">
          <view class="purchase-item-top">
            <text class="purchase-item-name" style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item.item}}</text>
            <text class="purchase-item-amount" style="color: {{theme.amountNegative || '#F87171'}};">-¥{{item.formattedAmount}}</text>
          </view>
          <view class="purchase-item-meta">
            <view class="purchase-item-meta-left">
              <view class="meta-tag" style="background: {{theme.elevated || '#252540'}};">
                <text style="color: {{theme.textSecondary || '#9A9AB0'}};">{{item.categoryName}}</text>
              </view>
              <text class="meta-text" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.formattedDate}}</text>
            </view>
            <text style="font-size: 24rpx; color: {{item.statusColor}};">{{item.statusLabel}}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 1: 创建 index.wxml**

写入上述 WXML 模板。

### Task 5: 修改「我的」页面 — 新增入口项和数据

**Files:**
- Modify: `miniprogram/pages/me/index.js`

在 `data` 中加入 `pendingGroup`：

```js
// 在 data: { ... } 中添加 pendingGroup
pendingGroup: [],
```

在 `buildMenuGroups()` 中构建待办分组数据（替代原来的硬编码逻辑）：

修改 `buildMenuGroups` 函数，找到 `hasTodoPerm` 相关的部分，改为构建 `pendingGroup` 数组：

```js
    // Build pending group (dynamic menu items)
    var pendingGroup = []
    if (hasTodoPerm) {
      pendingGroup.push({ key: 'todo', icon: '📋', text: '我的待办事项' + (pendingTotal > 0 ? '（' + pendingTotal + '）' : '') })
    }
    if (hasPermission('purchase', ACTIONS.ADD)) {
      pendingGroup.push({ key: 'myPurchases', icon: '📦', text: '我的采购申请' })
    }

    this.setData({
      managementGroup,
      featureGroup,
      settingsGroup,
      pendingGroup,
      hasTodoPermission: hasTodoPerm || hasPermission('purchase', ACTIONS.ADD)
    })
```

修改 `hasTodoPermission` 的判定逻辑：

改动前第83行 `const hasTodoPerm = hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)`

改动后需要把 `hasTodoPermission` 改为包含两种条件的 OR：审批待办 OR 采购申请入口。见上方代码。

在 `onMenuTap` 的 `routes` 中增加路由：

```js
// 在 routes 对象中增加
myPurchases: '/pages/my-purchases/index',
```

- [ ] **Step 1: 在 data 中添加 pendingGroup**

把 `pendingGroup: []` 加入 data 对象。

- [ ] **Step 2: 修改 buildMenuGroups 构建 pendingGroup 和 hasTodoPermission**

找到 `me/index.js` 第 83 行开始的代码块：

```js
    const hasTodoPerm = hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)

    this.setData({
      managementGroup,
      featureGroup,
      settingsGroup,
      hasTodoPermission: hasTodoPerm
    })

    // Load todo counts
    if (hasTodoPerm) {
      this.loadTodoCounts()
    }
```

替换为：

```js
    const hasTodoPerm = hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)
    const hasPurchaseAdd = hasPermission('purchase', ACTIONS.ADD)

    // Build pending group (dynamic menu items)
    var pendingGroup = []
    if (hasTodoPerm) {
      pendingGroup.push({ key: 'todo', icon: '📋', text: '我的待办事项' + (pendingTotal > 0 ? '（' + pendingTotal + '）' : '') })
    }
    if (hasPurchaseAdd) {
      pendingGroup.push({ key: 'myPurchases', icon: '📦', text: '我的采购申请' })
    }

    this.setData({
      managementGroup,
      featureGroup,
      settingsGroup,
      pendingGroup,
      hasTodoPermission: hasTodoPerm || hasPurchaseAdd
    })

    // Load todo counts
    if (hasTodoPerm) {
      this.loadTodoCounts()
    }
```

- [ ] **Step 3: 在 routes 中增加 myPurchases**

找到 `me/index.js` 中的 `routes` 对象（第125-140行），在 `todo` 后面增加：

```js
      myPurchases: '/pages/my-purchases/index',
```

### Task 6: 修改「我的」页面模板 — 动态渲染待办分组

**Files:**
- Modify: `miniprogram/pages/me/index.wxml`

将待办分组的硬编码单项（第48-61行）：

```html
    <!-- Todo Group -->
    <view class="menu-group mt-lg" wx:if="{{hasTodoPermission}}">
      <text class="menu-group-title text-overline" style="color: {{theme.textMuted || 'rgba(245,240,232,0.40)'}};">待办</text>
      <view class="menu-card" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 20rpx; overflow: hidden; box-shadow: {{theme.shadowSm || '0 2rpx 8rpx rgba(0,0,0,0.20)'}};">
        <view class="menu-item flex-row flex-between"
          data-key="todo" bindtap="onMenuTap">
          <view class="menu-item-left flex-row">
            <text class="menu-icon">📋</text>
            <text class="menu-text text-body" style="color: {{theme.textPrimary || '#F5F0E8'}};">我的待办事项{{pendingTotal > 0 ? '（' + pendingTotal + '）' : ''}}</text>
          </view>
          <text class="menu-arrow" style="color: {{theme.textMuted || 'rgba(245,240,232,0.40)'}};">›</text>
        </view>
      </view>
    </view>
```

替换为：

```html
    <!-- Todo Group -->
    <view class="menu-group mt-lg" wx:if="{{hasTodoPermission}}">
      <text class="menu-group-title text-overline" style="color: {{theme.textMuted || 'rgba(245,240,232,0.40)'}};">待办</text>
      <view class="menu-card" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 20rpx; overflow: hidden; box-shadow: {{theme.shadowSm || '0 2rpx 8rpx rgba(0,0,0,0.20)'}};">
        <view class="menu-item flex-row flex-between" wx:for="{{pendingGroup}}" wx:key="key"
          data-key="{{item.key}}" bindtap="onMenuTap"
          style="border-bottom: {{index < pendingGroup.length - 1 ? '1rpx solid ' + (theme.divider || 'rgba(255,255,255,0.08)') : 'none'}};">
          <view class="menu-item-left flex-row">
            <text class="menu-icon">{{item.icon}}</text>
            <text class="menu-text text-body" style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item.text}}</text>
          </view>
          <text class="menu-arrow" style="color: {{theme.textMuted || 'rgba(245,240,232,0.40)'}};">›</text>
        </view>
      </view>
    </view>
```

- [ ] **Step 1: 替换待办分组模板为 wx:for**

通过 Edit 工具将第48-61行替换为上述 wx:for 动态渲染版本。

### Task 7: 提交到 git

- [ ] **Step 1: Stage and commit**

```bash
cd "c:\Users\Andy\miniprograme"
git add miniprogram/pages/my-purchases/ miniprogram/pages/me/index.js miniprogram/pages/me/index.wxml
git commit -m "$(cat <<'EOF'
feat: add my purchases tracking page with status filtering

- New page pages/my-purchases showing user's submitted purchases
- 4 status cards (pending/approved/reimbursed/rejected) with counts
- Client-side filtering for instant status switching
- Entry point in me page todo group, visible for purchase.add users
- Todo group changed to wx:for dynamic rendering
EOF
)"
```
