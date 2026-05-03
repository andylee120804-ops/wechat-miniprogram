# 预约分享功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 员工在预约详情页可将预定信息通过微信分享给客人，客人点开卡片查看预定详情和会所地址。

**Architecture:** 微信小程序原生分享 + 分享落地页 + 会所地址管理后台。通过 `sendMessage` 云函数管理会所设置（venue_info），通过 `db.getDoc` 读取预约数据，通过 `wx.shareAppMessage` 实现原生分享。

**Tech Stack:** 微信小程序 + 微信云开发

---

### Task 1: 云函数 — sendMessage 新增 getSettings / updateSettings

**Files:**
- Modify: `cloudfunctions/sendMessage/index.js`

- [ ] **Step 1: 添加 getSettings 和 updateSettings action**

在 `cloudfunctions/sendMessage/index.js` 的 switch 中，在 `case 'deleteAnnouncement'` 之后，`default` 之前，新增两个 case：

```javascript
      case 'getSettings':
        return await getSettings(event)
      case 'updateSettings':
        return await updateSettings(event)
```

- [ ] **Step 2: 添加 getSettings 函数**

在 `deleteAnnouncement` 函数之后，`exports.main` 之前，新增：

```javascript
async function getSettings(event) {
  const result = await db.collection('settings').where({ key: 'venue_info' }).get()
  const data = result.data && result.data.length > 0 ? result.data[0] : {}
  return {
    success: true,
    data: {
      venueName: data.venueName || '听澜轩',
      venueAddress: data.venueAddress || ''
    }
  }
}
```

- [ ] **Step 3: 添加 updateSettings 函数（含权限校验）**

在 `getSettings` 函数之后添加：

```javascript
async function updateSettings(event) {
  const { wxContext } = cloud.getWXContext()
  const { venueName, venueAddress } = event

  if (!venueName || !venueAddress) {
    return { success: false, message: '会所名称和地址不能为空' }
  }

  // 校验请求者角色
  const staffRes = await db.collection('staff').where({ _openid: wxContext.OPENID }).get()
  const staff = staffRes.data && staffRes.data[0]
  if (!staff || (staff.role !== 'boss' && staff.role !== 'admin')) {
    return { success: false, message: '无权限执行此操作' }
  }

  const existing = await db.collection('settings').where({ key: 'venue_info' }).get()
  if (existing.data && existing.data.length > 0) {
    await db.collection('settings').doc(existing.data[0]._id).update({
      data: { venueName, venueAddress, updatedAt: db.serverDate() }
    })
  } else {
    await db.collection('settings').add({
      data: { key: 'venue_info', venueName, venueAddress, createdAt: db.serverDate(), updatedAt: db.serverDate() }
    })
  }

  return { success: true }
}
```

- [ ] **Step 4: 检查文件末尾是否有 module.exports**

确认 `sendMessage/index.js` 末尾的 `exports.main` 正确导出。不需要额外操作。

---

### Task 2: 会所设置管理页面

**Files:**
- Create: `miniprogram/pages/admin/venue-settings/index.js`
- Create: `miniprogram/pages/admin/venue-settings/index.wxml`
- Create: `miniprogram/pages/admin/venue-settings/index.wxss`

- [ ] **Step 1: 创建 JS 逻辑文件**

创建 `miniprogram/pages/admin/venue-settings/index.js`：

```javascript
const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    venueName: '',
    venueAddress: '',
    loading: true,
    saving: false
  },

  onLoad() {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadSettings()
  },

  onBack() {
    wx.navigateBack()
  },

  async loadSettings() {
    try {
      wx.showLoading({ title: '加载中' })
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success) {
        this.setData({
          venueName: res.result.data.venueName,
          venueAddress: res.result.data.venueAddress
        })
      }
      wx.hideLoading()
      this.setData({ loading: false })
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '加载设置')
      this.setData({ loading: false })
    }
  },

  onNameInput(e) {
    this.setData({ venueName: e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ venueAddress: e.detail.value })
  },

  async onSave() {
    if (this.data.saving) return
    const { venueName, venueAddress } = this.data
    if (!venueName.trim()) {
      wx.showToast({ title: '请输入会所名称', icon: 'none' })
      return
    }
    if (!venueAddress.trim()) {
      wx.showToast({ title: '请输入会所地址', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'updateSettings', venueName: venueName.trim(), venueAddress: venueAddress.trim() }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '保存设置')
    }

    this.setData({ saving: false })
  }
})
```

- [ ] **Step 2: 创建 WXML 页面结构**

创建 `miniprogram/pages/admin/venue-settings/index.wxml`：

```xml
<view class="page" style="background: {{theme.surfaceColor || '#1A1A2E'}}; min-height: 100vh;">
  <!-- Custom Navigation Bar -->
  <view class="nav-bar" style="background: {{theme.gradientHeader || theme.surfaceColor}}; padding-top: {{statusBarHeight}}px;">
    <view class="nav-bar-content">
      <view class="nav-back" bindtap="onBack">
        <text class="nav-back-icon" style="color: {{theme.textPrimary || '#F5F0E8'}}">❮</text>
      </view>
      <text class="nav-title" style="color: {{theme.textPrimary || '#F5F0E8'}}">会所设置</text>
      <view class="nav-action"></view>
    </view>
  </view>

  <view class="page-content" style="padding-top: {{statusBarHeight + 44}}px;">
    <view wx:if="{{loading}}" class="loading-state" style="padding: 60rpx; text-align: center;">
      <text style="color: {{theme.textMuted || '#5C5C72'}};">加载中...</text>
    </view>

    <view wx:if="{{!loading}}" class="form-wrapper" style="padding: 32rpx;">
      <view class="form-card" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 20rpx; padding: 32rpx;">
        <view class="form-item" style="margin-bottom: 32rpx;">
          <text class="form-label" style="color: {{theme.textSecondary || '#9A9AB0'}}; font-size: 28rpx; display: block; margin-bottom: 12rpx;">会所名称</text>
          <input class="form-input" value="{{venueName}}" bindinput="onNameInput" placeholder="请输入会所名称" placeholder-style="color: {{theme.textMuted || '#5C5C72'}}"
            style="background: {{theme.glassBg || 'rgba(255,255,255,0.05)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 12rpx; padding: 24rpx; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx; width: 100%; box-sizing: border-box;" />
        </view>
        <view class="form-item">
          <text class="form-label" style="color: {{theme.textSecondary || '#9A9AB0'}}; font-size: 28rpx; display: block; margin-bottom: 12rpx;">会所地址</text>
          <textarea class="form-textarea" value="{{venueAddress}}" bindinput="onAddressInput" placeholder="请输入会所地址" placeholder-style="color: {{theme.textMuted || '#5C5C72'}}"
            style="background: {{theme.glassBg || 'rgba(255,255,255,0.05)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 12rpx; padding: 24rpx; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx; width: 100%; box-sizing: border-box; min-height: 160rpx;" />
        </view>
      </view>

      <view class="save-btn-wrapper" style="margin-top: 48rpx;">
        <button class="save-btn" bindtap="onSave" loading="{{saving}}" disabled="{{saving}}"
          style="background: {{theme.accentColor || '#C9A96E'}}; color: {{theme.textInverse || '#0F0F1A'}}; width: 100%; border-radius: 16rpx; padding: 28rpx; font-size: 30rpx; font-weight: 600; border: none;">
          {{saving ? '保存中...' : '保存设置'}}
        </button>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 WXSS 样式**

创建 `miniprogram/pages/admin/venue-settings/index.wxss`：

```css
.page { width: 100%; }
.nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.nav-bar-content { display: flex; align-items: center; justify-content: space-between; height: 44px; padding: 0 16px; }
.nav-back { width: 60px; height: 44px; display: flex; align-items: center; }
.nav-back-icon { font-size: 20px; }
.nav-title { font-size: 17px; font-weight: 600; }
.nav-action { width: 60px; }
.page-content { padding-bottom: 40px; }
.form-input { height: 72rpx; }
.form-textarea { height: auto; }
```

---

### Task 3: 注册新页面路径 + 添加「我的」页面菜单项

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/me/index.js`

- [ ] **Step 1: 在 app.json pages 数组中添加新页面路径**

在 `app.json` 的 `pages` 数组中，在 `"pages/min-amount/index"` 之后添加：

```json
    "pages/reservation-share/index",
    "pages/admin/venue-settings/index"
```

确保位置在 `"pages/admin/attendance-detail/index"` 和现有 `"pages/min-amount/index"` 之间或之后，格式对齐（前导 4 空格）。完整的 pages 数组最终如下：

```json
  "pages": [
    "pages/login/index",
    "pages/index/index",
    "pages/reservation/index",
    "pages/reservation-add/index",
    "pages/reservation-detail/index",
    "pages/purchase/index",
    "pages/purchase-add/index",
    "pages/purchase-detail/index",
    "pages/income/index",
    "pages/income-add/index",
    "pages/income-detail/index",
    "pages/clockin/index",
    "pages/me/index",
    "pages/search/index",
    "pages/customer/index",
    "pages/customer-detail/index",
    "pages/insights/index",
    "pages/announcements/index",
    "pages/announcement-detail/index",
    "pages/admin/dashboard/index",
    "pages/admin/staff/index",
    "pages/admin/staff-add/index",
    "pages/admin/expense/index",
    "pages/admin/logs/index",
    "pages/admin/attendance/index",
    "pages/admin/attendance-detail/index",
    "pages/min-amount/index",
    "pages/reservation-share/index",
    "pages/admin/venue-settings/index"
  ]
```

- [ ] **Step 2: 在 me/index.js settingsGroup 中添加「会所设置」菜单项**

在 `buildMenuGroups()` 函数中，找到 `settingsGroup.push({ key: 'about', icon: 'ℹ️', text: '关于' })` 这一行，在它之前添加：

```javascript
    if (userInfo && (userInfo.role === 'boss' || userInfo.role === 'admin')) {
      settingsGroup.push({ key: 'venueSettings', icon: '🏠', text: '会所设置' })
    }
```

- [ ] **Step 3: 在 routes 映射中添加 venueSettings**

在 `onMenuTap` 函数的 `routes` 对象中，在 `about` 之前添加：

```javascript
      venueSettings: '/pages/admin/venue-settings/index',
```

---

### Task 4: 预约分享落地页（客人端）

**Files:**
- Create: `miniprogram/pages/reservation-share/index.js`
- Create: `miniprogram/pages/reservation-share/index.wxml`
- Create: `miniprogram/pages/reservation-share/index.wxss`

- [ ] **Step 1: 创建 JS 逻辑文件**

创建 `miniprogram/pages/reservation-share/index.js`：

```javascript
const { formatDate, getRoomName } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    loading: true,
    error: false,
    venueName: '听澜轩',
    venueAddress: '',
    customerName: '',
    phone: '',
    date: '',
    time: '',
    roomName: '',
    guestCount: '',
    remark: ''
  },

  onLoad(options) {
    if (options.id) {
      this.loadData(options.id)
    } else {
      this.setData({ loading: false, error: true })
    }
  },

  async loadData(id) {
    try {
      // 并行加载预约信息和会所设置
      const [reservationRes, settingsRes] = await Promise.all([
        db.getDoc(COLLECTIONS.RESERVATION, id),
        this.loadVenueSettings()
      ])

      if (!reservationRes) {
        this.setData({ loading: false, error: true })
        return
      }

      const r = reservationRes
      const et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      let roomName = ''
      if (et === 'none') {
        roomName = getRoomName(r.room)
      } else if (et === 'noon') {
        roomName = '包场（午）'
      } else if (et === 'night') {
        roomName = '包场（晚）'
      } else if (et === 'full') {
        roomName = '包场（全天）'
      }

      this.setData({
        loading: false,
        customerName: r.customerName || '',
        phone: r.phone || '',
        date: formatDate(r.date) || '',
        time: r.time || '',
        roomName: roomName,
        guestCount: r.guestCount || '',
        remark: r.remark || ''
      })
    } catch (err) {
      this.setData({ loading: false, error: true })
    }
  },

  async loadVenueSettings() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success) {
        this.setData({
          venueName: res.result.data.venueName || '听澜轩',
          venueAddress: res.result.data.venueAddress || ''
        })
      }
    } catch (err) {
      // 静默失败，使用默认值
    }
  }
})
```

- [ ] **Step 2: 创建 WXML 页面（干净卡片风格）**

创建 `miniprogram/pages/reservation-share/index.wxml`：

```xml
<view class="page" style="background: #F5F0E8; min-height: 100vh;">
  <!-- 加载状态 -->
  <view wx:if="{{loading}}" class="loading-state" style="display: flex; align-items: center; justify-content: center; min-height: 100vh;">
    <text style="color: #999; font-size: 28rpx;">加载中...</text>
  </view>

  <!-- 错误状态 -->
  <view wx:if="{{!loading && error}}" class="error-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 60rpx;">
    <text style="font-size: 64rpx; margin-bottom: 24rpx;">😕</text>
    <text style="color: #999; font-size: 28rpx;">预约信息不存在或已失效</text>
  </view>

  <!-- 内容区域 -->
  <view wx:if="{{!loading && !error}}" class="share-content" style="padding: 60rpx 40rpx; max-width: 640rpx; margin: 0 auto;">
    <!-- 顶部：会所名称 -->
    <view class="venue-header" style="text-align: center; margin-bottom: 48rpx;">
      <text style="font-size: 40rpx; font-weight: 700; color: #2D2D3A; letter-spacing: 4rpx;">{{venueName}}</text>
      <view style="width: 60rpx; height: 4rpx; background: #C9A96E; margin: 16rpx auto 0; border-radius: 2rpx;"></view>
    </view>

    <!-- 预定详情卡片 -->
    <view class="detail-card" style="background: #FFFFFF; border-radius: 20rpx; padding: 40rpx; box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.08);">
      <!-- 客户信息 -->
      <view class="info-row" style="margin-bottom: 32rpx;">
        <text style="font-size: 36rpx; font-weight: 600; color: #2D2D3A; display: block;">{{customerName}}</text>
        <text wx:if="{{phone}}" style="font-size: 28rpx; color: #999; margin-top: 8rpx; display: block;">{{phone}}</text>
      </view>

      <view style="height: 2rpx; background: #F0EDE8; margin-bottom: 32rpx;"></view>

      <!-- 预定明细 -->
      <view class="detail-item" style="display: flex; justify-content: space-between; padding: 16rpx 0;">
        <text style="font-size: 28rpx; color: #999;">日期</text>
        <text style="font-size: 28rpx; color: #2D2D3A; font-weight: 500;">{{date}}</text>
      </view>
      <view class="detail-item" style="display: flex; justify-content: space-between; padding: 16rpx 0;">
        <text style="font-size: 28rpx; color: #999;">时段</text>
        <text style="font-size: 28rpx; color: #2D2D3A; font-weight: 500;">{{time}}</text>
      </view>
      <view class="detail-item" style="display: flex; justify-content: space-between; padding: 16rpx 0;">
        <text style="font-size: 28rpx; color: #999;">包厢</text>
        <text style="font-size: 28rpx; color: #2D2D3A; font-weight: 500;">{{roomName}}</text>
      </view>
      <view class="detail-item" style="display: flex; justify-content: space-between; padding: 16rpx 0;">
        <text style="font-size: 28rpx; color: #999;">人数</text>
        <text style="font-size: 28rpx; color: #2D2D3A; font-weight: 500;">{{guestCount}}人</text>
      </view>
      <view class="detail-item" wx:if="{{remark}}" style="display: flex; justify-content: space-between; padding: 16rpx 0;">
        <text style="font-size: 28rpx; color: #999;">备注</text>
        <text style="font-size: 28rpx; color: #2D2D3A; font-weight: 500; max-width: 60%; text-align: right; word-break: break-all;">{{remark}}</text>
      </view>
    </view>

    <!-- 地址 -->
    <view wx:if="{{venueAddress}}" class="address-section" style="text-align: center; margin-top: 40rpx; padding: 32rpx; background: #FFFFFF; border-radius: 20rpx; box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.08);">
      <text style="font-size: 28rpx; color: #2D2D3A;">{{venueAddress}}</text>
    </view>

    <!-- 页脚 -->
    <view class="footer" style="text-align: center; margin-top: 60rpx;">
      <text style="font-size: 24rpx; color: #CCC;">本信息由{{venueName}}提供</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 创建 WXSS 样式**

创建 `miniprogram/pages/reservation-share/index.wxss`：

```css
.page { width: 100%; }
```

---

### Task 5: 预约详情页 — 添加分享弹窗和分享逻辑

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.js`
- Modify: `miniprogram/pages/reservation-detail/index.wxml`

- [ ] **Step 1: 在 JS 中添加分享弹窗状态和逻辑**

在 `reservation-detail/index.js` 的 `data` 对象中添加：

```javascript
    showShareModal: false,
    shareTitle: '',
```

在 `onConfirmCancel` 方法之后添加分享相关的三个方法：

```javascript
  onShareToGuest() {
    if (!hasPermission('reservation', 'edit')) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    // 从预约数据中获取默认标题
    const defaultTitle = (this.data.reservation.customerName || '预约') + ' · 预定信息'
    this.setData({ showShareModal: true, shareTitle: defaultTitle })
  },

  onCloseShareModal() {
    this.setData({ showShareModal: false })
  },

  onShareTitleInput(e) {
    this.setData({ shareTitle: e.detail.value })
  },

  onShareViaWechat() {
    // 触发微信原生分享 — 通过 onShareAppMessage 实现
    this.setData({ showShareModal: false })
    // 存储分享标题供 onShareAppMessage 使用
    this._shareTitle = this.data.shareTitle
    // 调用 showActionSheet 来触发分享（小程序中触发 onShareAppMessage 需要用户点击 button 的 open-type="share"）
    // 实际上我们通过 button open-type="share" 来触发，所以这里不需要额外操作
    // 但是我们需要让按钮点击传递自定义标题
  },
```

在页面末尾（在最后的 `}` 之前）添加 `onShareAppMessage`：

```javascript
  onShareAppMessage() {
    const title = this._shareTitle || (this.data.reservation ? this.data.reservation.customerName + ' · 预定信息' : '预定信息')
    return {
      title: title,
      path: '/pages/reservation-share/index?id=' + this.data.id,
      success: function(res) {
        wx.showToast({ title: '分享成功', icon: 'success' })
      },
      fail: function(err) {
        wx.showToast({ title: '分享取消', icon: 'none' })
      }
    }
  }
```

注意：需要在页面 data 中添加 `_shareTitle` 变量或使用实例属性。由于小程序 Page 对象的限制，我们在实例上直接挂载 `_shareTitle` 属性。

- [ ] **Step 2: 修改 WXML — 底部栏中添加分享按钮和分享弹窗**

在 `reservation-detail/index.wxml` 中：

**修改底部操作栏（两栏改成三栏）：**

找到：
```xml
    <view class="bottom-bar" wx:if="{{reservation.status !== 'cancelled'}}">
      <view class="bottom-bar-inner two-btns">
        <view class="bar-btn bar-btn-danger" bindtap="onCancel">取消预约</view>
        <view class="bar-btn bar-btn-primary bar-btn-primary-wide" bindtap="onEdit">编辑</view>
      </view>
    </view>
```

替换为：
```xml
    <view class="bottom-bar" wx:if="{{reservation.status !== 'cancelled'}}">
      <view class="bottom-bar-inner three-btns">
        <view class="bar-btn bar-btn-outline" bindtap="onShareToGuest">分享给客人</view>
        <view class="bar-btn bar-btn-danger" bindtap="onCancel">取消预约</view>
        <view class="bar-btn bar-btn-primary" bindtap="onEdit">编辑</view>
      </view>
    </view>
```

**添加分享弹窗**（在取消弹窗 `</theme-modal>` 之后，`</block>` 之前）：

```xml
    <!-- Share Modal -->
    <theme-modal theme="{{theme}}" visible="{{showShareModal}}" title="分享给客人" confirmText="分享到微信" cancelText="取消" bind:confirm="onShareViaWechat" bind:close="onCloseShareModal">
      <view style="padding: 16rpx 0;">
        <text style="color: {{theme.textSecondary || '#9A9AB0'}}; font-size: 26rpx; display: block; margin-bottom: 16rpx;">分享标题</text>
        <input value="{{shareTitle}}" bindinput="onShareTitleInput" placeholder="请输入分享标题" placeholder-style="color: {{theme.textMuted || '#5C5C72'}}"
          style="background: {{theme.glassBg || 'rgba(255,255,255,0.05)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 12rpx; padding: 20rpx; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx; width: 100%; box-sizing: border-box;" />
      </view>
    </theme-modal>
```

注意：微信小程序的 `onShareAppMessage` 必须通过 `button open-type="share"` 触发，不能通过 JS 调用。所以弹窗底部放一个 `open-type="share"` 的按钮，不使用 modal 的 confirm 按钮。

**修正后的分享弹窗 WXML（注意 button 有 open-type="share"，bindtap 只负责关闭弹窗）：**

```xml
    <!-- Share Modal -->
    <theme-modal theme="{{theme}}" visible="{{showShareModal}}" title="分享给客人" cancelText="取消" bind:close="onCloseShareModal">
      <view style="padding: 16rpx 0;">
        <text style="color: {{theme.textSecondary || '#9A9AB0'}}; font-size: 26rpx; display: block; margin-bottom: 16rpx;">分享标题</text>
        <input value="{{shareTitle}}" bindinput="onShareTitleInput" placeholder="请输入分享标题" placeholder-style="color: {{theme.textMuted || '#5C5C72'}}"
          style="background: {{theme.glassBg || 'rgba(255,255,255,0.05)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 12rpx; padding: 20rpx; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx; width: 100%; box-sizing: border-box;" />
        <view style="margin-top: 24rpx;">
          <button open-type="share" bindtap="onCloseShareModal"
            style="background: {{theme.accentColor || '#C9A96E'}}; color: {{theme.textInverse || '#0F0F1A'}}; width: 100%; border-radius: 12rpx; padding: 24rpx; font-size: 28rpx; font-weight: 600; border: none; line-height: 1.2;">
            分享到微信
          </button>
        </view>
      </view>
    </theme-modal>
```

按钮同时有 `open-type="share"`（触发微信原生分享）和 `bindtap="onCloseShareModal"`（关闭弹窗）。标题通过 `onShareTitleInput` 实时存入 `this.data.shareTitle`，`onShareAppMessage` 从中读取。

**删除 `onShareViaWechat` 方法**（不再需要），改为在 `onShareAppMessage` 中直接从 data 读取标题：

```javascript
  onShareAppMessage() {
    var title = this.data.shareTitle || (this.data.reservation ? this.data.reservation.customerName + ' · 预定信息' : '预定信息')
    return {
      title: title,
      path: '/pages/reservation-share/index?id=' + this.data.id
    }
  },
```

- [ ] **Step 3: 给 bottom-bar.wxss 添加三栏和 outline 按钮样式**

在 `miniprogram/styles/bottom-bar.wxss` 中，在 `.two-btns` 样式块之后添加：

```css
/* Three buttons - space between */
.bottom-bar-inner.three-btns {
  justify-content: space-between;
}

/* Outline button - subtle border only, for secondary actions */
.bar-btn-outline {
  background: transparent;
  color: #C9A96E;
  border: 1rpx solid rgba(201, 169, 110, 0.3);
}
```

---

### Task 6: 最终检查和提交

- [ ] **Step 1: 全局检查**

检查所有新增/修改文件：
- 所有引用路径正确
- `COLLECTIONS` 引用正确（使用 `COLLECTIONS.RESERVATION` 和 `COLLECTIONS.SETTINGS`）
- 权限控制到位（分享按钮需 `reservation.edit`，会所设置需 boss/admin）
- 主题风格一致

- [ ] **Step 2: 运行云函数上传**

```bash
cd cloudfunctions/sendMessage
npm install  # 确保依赖齐全
```
在微信开发者工具中右键 `sendMessage` 云函数 → 上传并部署。

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/sendMessage/index.js
git add miniprogram/app.json
git add miniprogram/pages/me/index.js
git add miniprogram/pages/reservation-detail/index.js
git add miniprogram/pages/reservation-detail/index.wxml
git add miniprogram/pages/reservation-share/index.js
git add miniprogram/pages/reservation-share/index.wxml
git add miniprogram/pages/reservation-share/index.wxss
git add miniprogram/pages/admin/venue-settings/index.js
git add miniprogram/pages/admin/venue-settings/index.wxml
git add miniprogram/pages/admin/venue-settings/index.wxss
git add docs/superpowers/specs/2026-05-03-reservation-sharing-design.md
git commit -m "feat: 预约分享功能 — 员工可分享预定信息给客人
- 会所地址管理后台（venue-settings）
- 预约详情页「分享给客人」弹窗（自定义标题 + 微信分享）
- 客人端分享落地页（reservation-share）
- 云函数 sendMessage 新增 getSettings/updateSettings"
```
