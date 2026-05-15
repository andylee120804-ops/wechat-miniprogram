# 采购审批流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为采购模块引入审批工作流：申请 → 审批 → 报销，同时兼容直接采购和宴会自动生成。

**Architecture:** 在现有 `purchase` 集合上增加 `status` 字段来驱动状态流转，新增 `purchase_approval_log` 集合做审计日志，通过 `settings` 集合的 `approvalRules` 配置审批规则。UI 层在采购列表每行加状态标签，采购详情页底部栏按状态+角色动态变化，新增待办清单页聚合审批/报销任务。

**Tech Stack:** 微信小程序原生框架 + 微信云开发（云数据库 + 云函数）

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `pages/admin/approval-settings/index.js` | 审批规则配置页面逻辑 |
| `pages/admin/approval-settings/index.wxml` | 审批规则配置页面模板 |
| `pages/admin/approval-settings/index.wxss` | 审批规则配置页面样式 |
| `pages/admin/approval-settings/index.json` | 审批规则配置页面配置 |
| `pages/todo/index.js` | 我的待办清单页面逻辑 |
| `pages/todo/index.wxml` | 我的待办清单页面模板 |
| `pages/todo/index.wxss` | 我的待办清单页面样式 |
| `pages/todo/index.json` | 我的待办清单页面配置 |

### Modified Files
| File | Change |
|------|--------|
| `app.json` | 注册 2 个新页面 |
| `utils/permission.js` | 新增 APPROVE/REIMBURSE action |
| `utils/db.js` | 新增 APPROVAL_LOG 集合常量 |
| `utils/helpers.js` | 新增 getApprovalStatusName/Color 工具函数 |
| `components/theme-badge/index.js` | 新增 approvalStatus 类型颜色映射 |
| `pages/purchase/index.js` | 加载时统计 reimbursed 总额、card 加 status 字段 |
| `pages/purchase/index.wxml` | card 内增加状态标签展示 |
| `pages/purchase-add/index.js` | 加载审批规则、写入 approverId、计算初始 status |
| `pages/purchase-add/index.wxml` | 表单增加审批人展示行 |
| `pages/purchase-detail/index.js` | 动态底部栏、审批日志加载、审批/报销操作 |
| `pages/purchase-detail/index.wxml` | 状态标签、审批字段、日志时间线、动态按钮 |
| `pages/purchase-detail/index.wxss` | 新增审批日志样式 |
| `pages/index/index.js` | 加载待办计数 |
| `pages/index/index.wxml` | 待办区块 UI |
| `pages/index/index.wxss` | 待办区块样式 |
| `pages/me/index.js` | buildMenuGroups 加入待办菜单项 |
| `pages/me/index.wxml` | 无变化（菜单项由 js 数据驱动） |
| `pages/admin/staff-add/index.js` | 加载/保存 approve/reimburse 权限 |
| `pages/admin/staff-add/index.wxml` | 新增审批/报销权限开关 |
| `cloudfunctions/autoSyncReservation/index.js` | 读取 approvalRules，按规则设置 status |
| `cloudfunctions/sendMessage/index.js` | 新增 getApprovalSettings/updateApprovalSettings action |

---

### Task 1: 基础设施 — 常量与工具函数

**Files:**
- Modify: `utils/permission.js`
- Modify: `utils/db.js`
- Modify: `utils/helpers.js`

- [ ] **Step 1: 在 permission.js 中新增 APPROVE/REIMBURSE action**

```javascript
// 修改 utils/permission.js 第7-12行的 ACTIONS 定义
const ACTIONS = {
  VIEW: 'view',
  ADD: 'add',
  EDIT: 'edit',
  DELETE: 'delete',
  APPROVE: 'approve',
  REIMBURSE: 'reimburse'
}
```

- [ ] **Step 2: 在 db.js 中新增 APPROVAL_LOG 集合常量**

```javascript
// 修改 utils/db.js 第12-26行的 COLLECTIONS 对象，新增一行
const COLLECTIONS = {
  STAFF: 'staff',
  RESERVATION: 'reservation',
  PURCHASE: 'purchase',
  INCOME: 'income',
  EXPENSE: 'expense',
  FIXED_EXPENSE: 'fixed_expense',
  CLOCKIN: 'clockin',
  LOG: 'log',
  OPERATION_LOG: 'operation_log',
  ANNOUNCEMENT: 'announcement',
  NOTIFICATION_LOG: 'notification_log',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
  APPROVAL_LOG: 'purchase_approval_log'
}
```

- [ ] **Step 3: 在 helpers.js 中新增审批状态工具函数**

```javascript
// 在 helpers.js 末尾 module.exports 之前添加

function getApprovalStatusName(status) {
  const map = {
    pending: '待审批',
    approved: '已批准',
    rejected: '已拒绝',
    reimbursed: '已报销'
  }
  return map[status] || status || ''
}

function getApprovalStatusColor(status) {
  const map = {
    pending: '#FBBF24',
    approved: '#4ADE80',
    rejected: '#F87171',
    reimbursed: '#9CA3AF'
  }
  return map[status] || '#9CA3AF'
}

// 在 module.exports 中加入
module.exports = {
  // ... 现有导出
  getApprovalStatusName,
  getApprovalStatusColor
}
```

- [ ] **Step 4: Commit**

```bash
git add utils/permission.js utils/db.js utils/helpers.js
git commit -m "chore: add approval action constants, collection, and status helpers"
```

---

### Task 2: theme-badge 组件 — 新增 approvalStatus 类型

**Files:**
- Modify: `components/theme-badge/index.js`

- [ ] **Step 1: 在 theme-badge observer 中新增 approvalStatus 类型分支**

```javascript
// 修改 components/theme-badge/index.js，在 observers 的 if-else 链中
// 在最后一个 else if 之后、else 之前插入

} else if (type === 'approvalStatus') {
  const colors = {
    'pending': '#FBBF24',
    'approved': '#4ADE80',
    'rejected': '#F87171',
    'reimbursed': '#9CA3AF'
  }
  const color = colors[status] || '#9CA3AF'
  const labels = {
    'pending': '待审批',
    'approved': '已批准',
    'rejected': '已拒绝',
    'reimbursed': '已报销'
  }
  const label = labels[status] || ''
  this.setData({ bgColor: color + '22', textColor: color, displayText: text || label })
```

- [ ] **Step 2: Commit**

```bash
git add components/theme-badge/index.js
git commit -m "feat: add approvalStatus type to theme-badge component"
```

---

### Task 3: 采购审批设置页 — 新增页面

**Files:**
- Create: `pages/admin/approval-settings/index.js`
- Create: `pages/admin/approval-settings/index.wxml`
- Create: `pages/admin/approval-settings/index.wxss`
- Create: `pages/admin/approval-settings/index.json`
- Modify: `app.json`

- [ ] **Step 1: 在 app.json 注册新页面**

在 `app.json` 的 `pages` 数组中，`"pages/admin/venue-settings/index"` 之后新增：

```json
"pages/admin/approval-settings/index",
```

- [ ] **Step 2: 创建 index.json**

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

- [ ] **Step 3: 创建 index.js — 完整的页面逻辑**

```javascript
const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const db = require('../../../utils/db')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    saving: false,
    enabled: true,
    categories: {
      meat: false, seafood: false, vegetable: false, fruit: false,
      drink: false, seasoning: false, supplies: false, equipment: false,
      banquet: false, other: false
    },
    amountThreshold: 0,
    defaultApproverId: '',
    defaultApproverName: '',
    defaultReimburserId: '',
    defaultReimburserName: '',
    approverList: [],
    reimburserList: [],
    approverIndex: 0,
    reimburserIndex: 0
  },

  onLoad() {
    if (!hasPermission('purchase', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限修改设置', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow() {
    this.loadAll()
  },

  async loadAll() {
    wx.showLoading({ title: '加载中' })
    try {
      // Load approval rules from settings
      var rulesRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings' }
      })
      if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
        var d = rulesRes.result.data
        this.setData({
          enabled: d.enabled !== false,
          categories: Object.assign({}, this.data.categories, d.categories || {}),
          amountThreshold: d.amountThreshold || 0,
          defaultApproverId: d.defaultApproverId || '',
          defaultApproverName: d.defaultApproverName || '',
          defaultReimburserId: d.defaultReimburserId || '',
          defaultReimburserName: d.defaultReimburserName || ''
        })
      }

      // Load staff lists for pickers
      var staffRes = await db.queryAll(COLLECTIONS.STAFF, { deleted: _.exists(false) })
      // ... but cloud can't do _.exists(false) directly, so use a workaround:
    } catch (err) {
      handleCloudError(err, '加载审批设置')
    }

    try {
      // Load approver candidates: staff who have 'approve' for 'purchase'
      var staffAll = await db.queryAll(COLLECTIONS.STAFF, {})
      var staffList = staffAll.data || []
      var approvers = []
      var reimbursers = []
      var approverIdx = 0
      var reimburserIdx = 0

      staffList.forEach(function(s) {
        // boss and admin always have approve and reimburse
        var isManager = s.role === 'boss' || s.role === 'admin'
        if (isManager || true) {
          // For now include all active staff; exact permission filtering can be refined
          var item = { id: s._id, name: s.name || s.nickName || '' }
          // Actually, we should only include staff with approve/reimburse permissions
          // but permissions are per-staff-config. For simplicity, include all staff with
          // role that makes sense (admin, boss, or any staff)
          // Let's include all non-deleted staff
          if (!s.deleted) {
            if (s._id === this.data.defaultApproverId) approverIdx = approvers.length
            if (s._id === this.data.defaultReimburserId) reimburserIdx = reimbursers.length
            approvers.push(item)
            reimbursers.push(item)
          }
        }
      }.bind(this))

      this.setData({
        approverList: approvers,
        reimburserList: reimbursers,
        approverIndex: approverIdx,
        reimburserIndex: reimburserIdx,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      handleCloudError(err, '加载员工列表')
    }

    wx.hideLoading()
  },

  onSwitchEnabled(e) { this.setData({ enabled: !!e.detail.value }) },

  onCategoryToggle(e) {
    var key = e.currentTarget.dataset.key
    var cats = this.data.categories
    cats[key] = !cats[key]
    this.setData({ categories: cats })
  },

  onThresholdInput(e) {
    this.setData({ amountThreshold: Number(e.detail.value) || 0 })
  },

  onApproverChange(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.approverList[idx]
    this.setData({
      approverIndex: idx,
      defaultApproverId: item ? item.id : '',
      defaultApproverName: item ? item.name : ''
    })
  },

  onReimburserChange(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.reimburserList[idx]
    this.setData({
      reimburserIndex: idx,
      defaultReimburserId: item ? item.id : '',
      defaultReimburserName: item ? item.name : ''
    })
  },

  async onSave() {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      var res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateApprovalSettings',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          approvalRules: {
            enabled: this.data.enabled,
            categories: this.data.categories,
            amountThreshold: this.data.amountThreshold,
            defaultApproverId: this.data.defaultApproverId,
            defaultApproverName: this.data.defaultApproverName,
            defaultReimburserId: this.data.defaultReimburserId,
            defaultReimburserName: this.data.defaultReimburserName
          }
        }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '保存审批设置')
    }
    this.setData({ saving: false })
  },

  onBack() { wx.navigateBack() }
})
```

Actually, wait — there's an issue. The `db.queryAll` to get staff needs to filter out deleted ones. Let me fix the staff query to use `{ deleted: false }` — but since not all staff have a `deleted` field, I should use a broader approach. Let me fix the code.

- [ ] **Step 3 (revised): 创建 index.js**

```javascript
var app = getApp()
var { handleCloudError } = require('../../../utils/error-handler')
var { hasPermission, ACTIONS } = require('../../../utils/permission')
var db = require('../../../utils/db')
var { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    saving: false,
    enabled: true,
    categories: {
      meat: false, seafood: false, vegetable: false, fruit: false,
      drink: false, seasoning: false, supplies: false, equipment: false,
      banquet: false, other: false
    },
    amountThreshold: 0,
    defaultApproverId: '',
    defaultApproverName: '',
    defaultReimburserId: '',
    defaultReimburserName: '',
    approverList: [],
    reimburserList: [],
    approverIndex: -1,
    reimburserIndex: -1
  },

  categoryLabels: {
    meat: '肉类', seafood: '海鲜', vegetable: '蔬菜', fruit: '水果',
    drink: '饮品', seasoning: '调味品', supplies: '日用品',
    equipment: '设备', banquet: '宴会菜价', other: '其他'
  },

  onLoad: function() {
    var canEdit = hasPermission('purchase', ACTIONS.EDIT)
    if (!canEdit) {
      wx.showToast({ title: '无权限修改设置', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function() {
    this.loadAll()
  },

  loadAll: async function() {
    var that = this
    that.setData({ loading: true })
    wx.showLoading({ title: '加载中' })

    try {
      // Load approval rules
      var rulesRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings' }
      })
      if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
        var d = rulesRes.result.data
        that.setData({
          enabled: d.enabled !== false,
          categories: that._mergeCategories(d.categories),
          amountThreshold: d.amountThreshold || 0,
          defaultApproverId: d.defaultApproverId || '',
          defaultApproverName: d.defaultApproverName || '',
          defaultReimburserId: d.defaultReimburserId || '',
          defaultReimburserName: d.defaultReimburserName || ''
        })
      }

      // Load staff for picker
      var staffRes = await db.queryAll(COLLECTIONS.STAFF, {})
      var staffList = (staffRes.data || []).filter(function(s) { return !s.deleted })
      var approverOpts = []
      var reimburserOpts = []
      var aIdx = -1
      var rIdx = -1

      staffList.forEach(function(s) {
        var item = { id: s._id, name: s.name || s.nickName || '' }
        if (s._id === that.data.defaultApproverId) aIdx = approverOpts.length
        if (s._id === that.data.defaultReimburserId) rIdx = reimburserOpts.length
        approverOpts.push(item)
        reimburserOpts.push(item)
      })

      that.setData({
        approverList: approverOpts,
        reimburserList: reimburserOpts,
        approverIndex: aIdx,
        reimburserIndex: rIdx,
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载审批设置')
    }
    wx.hideLoading()
  },

  _mergeCategories: function(saved) {
    var defaults = {
      meat: false, seafood: false, vegetable: false, fruit: false,
      drink: false, seasoning: false, supplies: false, equipment: false,
      banquet: false, other: false
    }
    if (!saved) return defaults
    for (var k in defaults) {
      if (saved.hasOwnProperty(k)) defaults[k] = !!saved[k]
    }
    return defaults
  },

  onToggleEnabled: function(e) { this.setData({ enabled: !!e.detail.value }) },

  onCategoryToggle: function(e) {
    var key = e.currentTarget.dataset.key
    var cats = Object.assign({}, this.data.categories)
    cats[key] = !cats[key]
    this.setData({ categories: cats })
  },

  onThresholdInput: function(e) {
    var val = parseInt(e.detail.value, 10)
    this.setData({ amountThreshold: isNaN(val) ? 0 : val })
  },

  onApproverChange: function(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.approverList[idx]
    this.setData({
      approverIndex: idx,
      defaultApproverId: item ? item.id : '',
      defaultApproverName: item ? item.name : ''
    })
  },

  onReimburserChange: function(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.reimburserList[idx]
    this.setData({
      reimburserIndex: idx,
      defaultReimburserId: item ? item.id : '',
      defaultReimburserName: item ? item.name : ''
    })
  },

  onSave: async function() {
    if (this.data.saving) return
    var that = this
    that.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      var res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateApprovalSettings',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          approvalRules: {
            enabled: that.data.enabled,
            categories: that.data.categories,
            amountThreshold: that.data.amountThreshold,
            defaultApproverId: that.data.defaultApproverId,
            defaultApproverName: that.data.defaultApproverName,
            defaultReimburserId: that.data.defaultReimburserId,
            defaultReimburserName: that.data.defaultReimburserName
          }
        }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '保存审批设置')
    }
    that.setData({ saving: false })
  },

  onBack: function() { wx.navigateBack() }
})
```

- [ ] **Step 4: 创建 index.wxml**

```xml
<view class="page" style="background: {{theme.surfaceColor || '#1A1A2E'}};">
  <view class="nav-bar" style="background: {{theme.gradientHeader || theme.surfaceColor}}; padding-top: {{statusBarHeight}}px; height: {{statusBarHeight + 44}}px; box-sizing: border-box;">
    <view class="nav-bar-content">
      <view class="nav-back" bindtap="onBack"><text class="nav-back-icon" style="color: {{theme.textPrimary || '#F5F0E8'}};">❮</text></view>
      <text class="nav-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">采购审批设置</text>
      <view class="nav-action"></view>
    </view>
  </view>

  <view class="page-content" wx:if="{{!loading}}">
    <!-- 全局开关 -->
    <view class="settings-section">
      <view class="section-title" style="color: {{theme.accentColor || '#C9A96E'}};">全局设置</view>
      <view class="setting-row" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <text style="color: {{theme.textPrimary || '#F5F0E8'}};">启用审批流程</text>
        <switch checked="{{enabled}}" bindchange="onToggleEnabled" color="{{theme.accentColor || '#C9A96E'}}" />
      </view>
    </view>

    <!-- 类目开关 -->
    <view class="settings-section">
      <view class="section-title" style="color: {{theme.accentColor || '#C9A96E'}};">需要审批的采购类目</view>
      <view class="category-grid">
        <view class="category-item" wx:for="{{['meat','seafood','vegetable','fruit','drink','seasoning','supplies','equipment','banquet','other']}}" wx:key="*this"
          data-key="{{item}}" bindtap="onCategoryToggle"
          style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{categories[item] ? (theme.accentColor || '#C9A96E') : (theme.borderColor || 'rgba(255,255,255,0.10)')}};">
          <text style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item === 'meat' ? '肉类' : item === 'seafood' ? '海鲜' : item === 'vegetable' ? '蔬菜' : item === 'fruit' ? '水果' : item === 'drink' ? '饮品' : item === 'seasoning' ? '调味品' : item === 'supplies' ? '日用品' : item === 'equipment' ? '设备' : item === 'banquet' ? '宴会菜价' : '其他'}}</text>
          <view wx:if="{{categories[item]}}" style="color: {{theme.accentColor || '#C9A96E'}}; font-size: 30rpx;">✓</view>
        </view>
      </view>
    </view>

    <!-- 金额门槛 -->
    <view class="settings-section">
      <view class="section-title" style="color: {{theme.accentColor || '#C9A96E'}};">金额门槛</view>
      <view class="setting-row" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <text style="color: {{theme.textPrimary || '#F5F0E8'}};">超过此金额需审批</text>
        <view class="threshold-input-wrap">
          <input class="threshold-input" type="digit" value="{{amountThreshold || ''}}" placeholder="0" bindinput="onThresholdInput" style="color: {{theme.textPrimary || '#F5F0E8'}};" />
          <text style="color: {{theme.textSecondary || '#9A9AB0'}};">元</text>
        </view>
      </view>
    </view>

    <!-- 默认审批人 -->
    <view class="settings-section">
      <view class="section-title" style="color: {{theme.accentColor || '#C9A96E'}};">默认审批人</view>
      <view class="setting-row" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <text style="color: {{theme.textPrimary || '#F5F0E8'}};">审批人</text>
        <picker value="{{approverIndex}}" range="{{approverList}}" range-key="name" bindchange="onApproverChange">
          <text style="color: {{approverIndex >= 0 ? (theme.textPrimary || '#F5F0E8') : (theme.textMuted || '#5C5C72')}};">{{approverIndex >= 0 ? approverList[approverIndex].name : '请选择'}}</text>
        </picker>
      </view>
    </view>

    <!-- 默认报销人 -->
    <view class="settings-section">
      <view class="section-title" style="color: {{theme.accentColor || '#C9A96E'}};">默认报销人</view>
      <view class="setting-row" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <text style="color: {{theme.textPrimary || '#F5F0E8'}};">报销确认人</text>
        <picker value="{{reimburserIndex}}" range="{{reimburserList}}" range-key="name" bindchange="onReimburserChange">
          <text style="color: {{reimburserIndex >= 0 ? (theme.textPrimary || '#F5F0E8') : (theme.textMuted || '#5C5C72')}};">{{reimburserIndex >= 0 ? reimburserList[reimburserIndex].name : '请选择'}}</text>
        </picker>
      </view>
    </view>

    <!-- Save -->
    <view class="save-section" style="padding-bottom: env(safe-area-inset-bottom);">
      <view class="save-btn {{saving ? 'saving' : ''}}" bindtap="onSave"
        style="background: {{theme.gradientButton || 'linear-gradient(135deg, #C9A96E 0%, #D4B87A 100%)'}}; box-shadow: {{theme.shadowMd || '0 8rpx 24rpx rgba(0,0,0,0.28)'}};">
        <text style="color: {{theme.textInverse || '#0F0F1A'}};">{{saving ? '保存中...' : '保存设置'}}</text>
      </view>
    </view>

    <view style="height: 60rpx;"></view>
  </view>

  <!-- Loading -->
  <view wx:if="{{loading}}" style="display: flex; justify-content: center; padding-top: 400rpx;">
    <text style="color: {{theme.textMuted || '#5C5C72'}};">加载中...</text>
  </view>
</view>
```

- [ ] **Step 5: 创建 index.wxss**

```css
@import '../../../styles/mixins.wxss';

.page { min-height: 100vh; }

.nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.nav-bar-content { display: flex; align-items: center; justify-content: space-between; height: 88rpx; padding: 0 24rpx; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; }
.nav-back-icon { font-size: 44rpx; font-weight: 300; }
.nav-title { font-size: 34rpx; font-weight: 600; }
.nav-action { min-width: 64rpx; }

.page-content { padding-top: calc(env(safe-area-inset-top, 44px) + 88rpx + 20rpx); padding-left: 32rpx; padding-right: 32rpx; }

.settings-section { margin-top: 28rpx; }
.section-title { font-size: 26rpx; font-weight: 600; margin-bottom: 12rpx; padding-left: 4rpx; }

.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 28rpx; border-radius: 16rpx; }

.category-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.category-item { display: flex; justify-content: space-between; align-items: center; padding: 18rpx 24rpx; border-radius: 14rpx; flex: 0 0 calc(50% - 8rpx); box-sizing: border-box; font-size: 28rpx; }

.threshold-input-wrap { display: flex; align-items: center; gap: 8rpx; }
.threshold-input { width: 120rpx; text-align: right; font-size: 28rpx; }

.save-section { margin-top: 48rpx; padding-bottom: 40rpx; }
.save-btn { padding: 28rpx; border-radius: 20rpx; text-align: center; }
.save-btn.saving { opacity: 0.6; }
```

- [ ] **Step 6: Commit**

```bash
git add pages/admin/approval-settings/ app.json
git commit -m "feat: add approval settings page"
```

---

### Task 4: sendMessage 云函数 — 新增审批设置 action

**Files:**
- Modify: `cloudfunctions/sendMessage/index.js`

- [ ] **Step 1: 在 sendMessage/index.js 中新增 getApprovalSettings 和 updateApprovalSettings**

在 `exports.main` 的 `switch` 中新增两个 case：

```javascript
case 'getApprovalSettings':
  return await getApprovalSettings(event)
case 'updateApprovalSettings':
  return await updateApprovalSettings(event)
```

在文件末尾（`updateSettings` 函数之后）新增两个函数：

```javascript
async function getApprovalSettings(event) {
  var result = await db.collection('settings').where({ key: 'approval_rules' }).get()
  var data = result.data && result.data.length > 0 ? result.data[0] : {}

  return {
    success: true,
    data: {
      enabled: data.enabled !== undefined ? data.enabled : true,
      categories: data.categories || {},
      amountThreshold: data.amountThreshold || 0,
      defaultApproverId: data.defaultApproverId || '',
      defaultApproverName: data.defaultApproverName || '',
      defaultReimburserId: data.defaultReimburserId || '',
      defaultReimburserName: data.defaultReimburserName || ''
    }
  }
}

async function updateApprovalSettings(event) {
  var { OPENID } = cloud.getWXContext()
  var { approvalRules, callerWechatId } = event

  if (!approvalRules) {
    return { success: false, message: '缺少审批设置数据' }
  }

  // Verify caller — must have purchase edit permission (admin or configured)
  var staff = await findStaffByCaller(OPENID, callerWechatId)
  if (!staff || !(await hasPermission(staff, 'purchase', 'edit'))) {
    return { success: false, message: '无权限修改审批设置' }
  }

  var updateData = {
    enabled: !!approvalRules.enabled,
    categories: approvalRules.categories || {},
    amountThreshold: Number(approvalRules.amountThreshold) || 0,
    defaultApproverId: approvalRules.defaultApproverId || '',
    defaultApproverName: approvalRules.defaultApproverName || '',
    defaultReimburserId: approvalRules.defaultReimburserId || '',
    defaultReimburserName: approvalRules.defaultReimburserName || '',
    updatedAt: db.serverDate()
  }

  var existing = await db.collection('settings').where({ key: 'approval_rules' }).get()
  if (existing.data && existing.data.length > 0) {
    await db.collection('settings').doc(existing.data[0]._id).update({ data: updateData })
  } else {
    updateData.key = 'approval_rules'
    updateData.createdAt = db.serverDate()
    await db.collection('settings').add({ data: updateData })
  }

  return { success: true }
}
```

- [ ] **Step 2: 上传并部署云函数**

在微信开发者工具中，右键 `cloudfunctions/sendMessage` → 上传并部署：云端安装依赖。等待部署完成。

- [ ] **Step 3: Commit**

```bash
git add cloudfunctions/sendMessage/index.js
git commit -m "feat: add approval settings actions to sendMessage cloud function"
```

---

### Task 5: autoSyncReservation 云函数 — 遵循审批规则

**Files:**
- Modify: `cloudfunctions/autoSyncReservation/index.js`

- [ ] **Step 1: 在 autoSyncReservation 中读取 approvalRules 并设置 status**

修改生成 purchase 记录处的代码。找到现有代码中 `db.collection('purchase').add({ data: { ... } })` 处：

```javascript
// 替换现有 purchase add 代码块（约第83-94行），改为:
// 读取审批规则
var rulesRes = await db.collection('settings').where({ key: 'approval_rules' }).get()
var rules = (rulesRes.data && rulesRes.data.length > 0) ? rulesRes.data[0] : {}

// 判断 banquet 类目是否需要审批
var needApproval = false
if (rules && rules.enabled !== false) {
  var cats = rules.categories || {}
  if (cats.banquet === true) needApproval = true
  if (!needApproval && rules.amountThreshold && dishPrice > Number(rules.amountThreshold)) needApproval = true
}

if (!purchaseRes.data || purchaseRes.data.length === 0) {
  var customerName = r.customerName || ''
  var roomName = r.roomName || ''
  var remark = customerName + ' - ' + roomName

  var purchaseData = {
    amount: dishPrice,
    category: 'banquet',
    date: resDate,
    remark: remark,
    item: '',
    sourceReservationId: r._id,
    autoGenerated: true,
    status: needApproval ? 'pending' : 'approved',
    createdTime: db.serverDate()
  }

  // 如果需要审批，设置默认审批人
  if (needApproval) {
    purchaseData.approverId = rules.defaultApproverId || ''
    purchaseData.approverName = rules.defaultApproverName || ''
  }

  await db.collection('purchase').add({ data: purchaseData })
  created++
}
```

- [ ] **Step 2: 上传并部署云函数**

在微信开发者工具中，右键 `cloudfunctions/autoSyncReservation` → 上传并部署。

- [ ] **Step 3: Commit**

```bash
git add cloudfunctions/autoSyncReservation/index.js
git commit -m "feat: autoSyncReservation respects approval rules for banquet category"
```

---

### Task 6: 采购添加页 — 审批规则判断 + 审批人展示

**Files:**
- Modify: `pages/purchase-add/index.js`
- Modify: `pages/purchase-add/index.wxml`

- [ ] **Step 1: 修改 purchase-add/index.js — 提交时计算 status**

在 `onSubmit` 方法中，把现有的 `db.addDoc` 或 `db.updateDoc` 调用改为在写入前计算 status，并加入 approverId/approverName 字段。

```javascript
// 在 onSubmit 函数中，准备 data 时，首先是获取审批规则，然后计算 status

// 在 onSubmit 的开头权限检查后，加入审批规则加载和 status 计算
onSubmit: async function() {
  // ... 现有的字段验证代码保持不变 ...

  var data = {
    item: item,
    amount: amountNum,
    category: category,
    date: date,
    remark: remark,
    sourceReservationId: resvId || '',
    purchaseBy: userInfo._id,
    purchaseByName: userInfo.name || userInfo.nickName,
  }

  // 加载审批规则，决定初始 status
  try {
    var rulesRes = await wx.cloud.callFunction({
      name: 'sendMessage',
      data: { action: 'getApprovalSettings' }
    })
    if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
      var rules = rulesRes.result.data
      var needApproval = false
      if (rules.enabled !== false) {
        // 类目检查
        var cats = rules.categories || {}
        if (cats[category] === true) needApproval = true
        // 金额检查
        if (!needApproval && rules.amountThreshold && amountNum > Number(rules.amountThreshold)) {
          needApproval = true
        }
      }
      if (needApproval) {
        data.status = 'pending'
        data.approverId = rules.defaultApproverId || ''
        data.approverName = rules.defaultApproverName || ''
      } else {
        data.status = 'approved'
      }
    } else {
      // 读取失败，默认 approved（不阻塞提交）
      data.status = 'approved'
    }
  } catch (err) {
    // 云函数调用失败，默认 approved
    data.status = 'approved'
  }

  // ... 继续现有的 addDoc / updateDoc 逻辑 ...
}
```

- [ ] **Step 2: 修改 purchase-add/index.js — 提交后写审批日志**

在成功添加采购记录后，如果 `data.status === 'pending'`，写入审批日志：

```javascript
// 在 addDoc 成功后，如果 isNew:
if (isNew && data.status === 'pending') {
  db.addDoc(COLLECTIONS.APPROVAL_LOG, {
    purchaseId: result._id,
    action: 'submit',
    operatorId: userInfo._id,
    operatorName: userInfo.name || userInfo.nickName,
    remark: '',
    createdAt: db.getDb().serverDate()
  })
}
```

- [ ] **Step 3: 修改 purchase-add/index.wxml — 增加审批人展示行**

在表单字段（category、amount 等）之后、提交按钮之前，增加一行：

```xml
<view class="approver-row" wx:if="{{approverName}}" style="margin: 16rpx 0;">
  <text style="color: {{theme.textSecondary || '#9A9AB0'}};">审批人：</text>
  <text style="color: {{theme.accentColor || '#C9A96E'}};">{{approverName}}</text>
</view>
```

- [ ] **Step 4: 在 purchase-add/index.js 的 onLoad/onShow 中加载默认审批人展示**

```javascript
// 在 onLoad 中加载审批设置，获取默认审批人名字用于展示
async loadApprovalPreview() {
  try {
    var res = await wx.cloud.callFunction({
      name: 'sendMessage',
      data: { action: 'getApprovalSettings' }
    })
    if (res.result && res.result.success && res.result.data) {
      var rules = res.result.data
      this.setData({ approverName: rules.defaultApproverName || '' })
    }
  } catch (e) { /* ignore */ }
}
```

- [ ] **Step 5: Commit**

```bash
git add pages/purchase-add/index.js pages/purchase-add/index.wxml
git commit -m "feat: purchase-add computes approval status and shows approver"
```

---

### Task 7: 采购列表页 — 状态标签 + 已报销总额

**Files:**
- Modify: `pages/purchase/index.js`
- Modify: `pages/purchase/index.wxml`

- [ ] **Step 1: 修改 purchase/index.js — 总额只统计 reimbursed**

在 `loadData` 的 Promise.all 回调中，修改总金额计算：

```javascript
// 修改 totalAmount 计算逻辑
var totalAmount = 0
allData.forEach(function(p) {
  // 只统计已报销的金额
  if (!p.status || p.status === 'reimbursed') {
    totalAmount += Number(p.amount) || 0
  }
})
```

- [ ] **Step 2: 修改 purchase/index.js — map 数据时增加 status 信息**

数据映射时传入 status、approvalStatusName：

```javascript
var { getApprovalStatusName } = require('../../utils/helpers')

// 在 map 回调中:
var purchases = (res.data || []).map(function(p) {
  return {
    ...p,
    categoryName: getCategoryName(p.category),
    formattedAmount: formatAmount(p.amount),
    formattedDate: formatDate(p.date),
    approvalStatusName: getApprovalStatusName(p.status)
  }
})
```

- [ ] **Step 3: 修改 purchase/index.wxml — 卡片内增加状态标签**

在每个 card 的 `card-meta` 中，在 category badge 后增加 approval status badge：

```xml
<theme-badge theme="{{theme}}" status="{{item.status || 'reimbursed'}}" type="approvalStatus" size="sm" />
```

- [ ] **Step 4: Commit**

```bash
git add pages/purchase/index.js pages/purchase/index.wxml
git commit -m "feat: purchase list shows approval status and reimbursed-only total"
```

---

### Task 8: 采购详情页 — 动态底部栏 + 审批日志

**Files:**
- Modify: `pages/purchase-detail/index.js`
- Modify: `pages/purchase-detail/index.wxml`
- Modify: `pages/purchase-detail/index.wxss`

这是最大的改动。按步骤推进：

- [ ] **Step 1: 修改 purchase-detail/index.js — 权限数据**

修改 `onShow` 和 `loadPurchase`，增加审批/报销相关权限和底栏按钮计算：

```javascript
// data 中新增字段
data: {
  theme: {},
  statusBarHeight: 44,
  loading: true,
  id: '',
  purchase: null,
  showDeleteModal: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,      // 新增
  canReimburse: false,    // 新增
  isSubmitter: false,     // 新增：当前用户是否是提交人
  isApprover: false,      // 新增：当前用户是否是指定的审批人
  approvalLogs: [],       // 新增：审批日志
  showRejectModal: false  // 新增：拒绝理由弹窗
}

// onShow 中增加
onShow: function() {
  this.setData({
    canEdit: hasPermission('purchase', ACTIONS.EDIT),
    canDelete: hasPermission('purchase', ACTIONS.DELETE),
    canApprove: hasPermission('purchase', ACTIONS.APPROVE),
    canReimburse: hasPermission('purchase', ACTIONS.REIMBURSE)
  })
  if (this.data.id) this.loadPurchase(this.data.id)
}
```

- [ ] **Step 2: 修改 purchase-detail/index.js — loadPurchase 计算按钮**

```javascript
loadPurchase: function(id) {
  var that = this
  that.setData({ loading: true })

  db.getDoc(COLLECTIONS.PURCHASE, id).then(async function(data) {
    if (!data) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }

    var userInfo = app.globalData.userInfo
    var currentUserId = userInfo ? userInfo._id : ''
    var status = data.status || 'reimbursed' // 旧记录兼容
    var isSubmitter = data.purchaseBy === currentUserId
    var isApprover = canApprove && data.approverId === currentUserId && !isSubmitter

    var { getApprovalStatusName, getCategoryName, formatAmount, formatDate } = require('../../utils/helpers')

    var purchase = {
      ...data,
      status: status,
      approvalStatusName: getApprovalStatusName(status),
      categoryName: getCategoryName(data.category),
      formattedAmount: formatAmount(data.amount),
      formattedDate: formatDate(data.date),
      formattedCreatedAt: formatDate(data.createdAt),
      formattedApprovedAt: data.approvedAt ? formatDate(data.approvedAt) : '',
      formattedRejectedAt: data.rejectedAt ? formatDate(data.rejectedAt) : '',
      formattedReimbursedAt: data.reimbursedAt ? formatDate(data.reimbursedAt) : ''
    }

    // Load approval logs
    var logs = []
    try {
      var logRes = await db.queryAll(COLLECTIONS.APPROVAL_LOG, { purchaseId: id }, 'createdAt', 'asc')
      logs = (logRes.data || []).map(function(l) {
        return {
          ...l,
          formattedTime: formatDate(l.createdAt) + ' ' + require('../../utils/helpers').formatTime(l.createdAt)
        }
      })
    } catch (e) { /* logs are non-critical */ }

    that.setData({
      purchase: purchase,
      loading: false,
      isSubmitter: isSubmitter,
      isApprover: isApprover,
      approvalLogs: logs,
      canEdit: isSubmitter && (status === 'pending' || status === 'rejected'),
      canDelete: isSubmitter && status === 'pending'
    })
  }).catch(function(err) {
    that.setData({ loading: false })
    handleCloudError(err, '加载采购详情')
  })
}
```

- [ ] **Step 3: 修改 purchase-detail/index.js — 审批/拒绝/报销操作**

```javascript
// 审批通过
onApprove: async function() {
  if (!hasPermission('purchase', ACTIONS.APPROVE)) return
  var that = this
  var userInfo = app.globalData.userInfo

  // 防自己审批
  if (that.data.purchase.purchaseBy === userInfo._id) {
    wx.showToast({ title: '不能审批自己提交的申请', icon: 'none' })
    return
  }

  wx.showLoading({ title: '审批中' })
  try {
    var now = db.getDb().serverDate()
    await db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'approved',
      approvedAt: now,
      approverId: userInfo._id,
      approverName: userInfo.name || userInfo.nickName
    })
    // Write approval log
    await db.addDoc(COLLECTIONS.APPROVAL_LOG, {
      purchaseId: that.data.id,
      action: 'approve',
      operatorId: userInfo._id,
      operatorName: userInfo.name || userInfo.nickName,
      remark: '',
      createdAt: now
    })
    wx.hideLoading()
    wx.showToast({ title: '已批准', icon: 'success' })
    setTimeout(function() { that.loadPurchase(that.data.id) }, 500)
  } catch (err) {
    wx.hideLoading()
    handleCloudError(err, '审批操作')
  }
},

// 拒绝
onShowReject: function() {
  this.setData({ showRejectModal: true })
},

onRejectConfirm: async function(e) {
  var reason = (e.detail && e.detail.value) || ''
  if (!reason.trim()) {
    wx.showToast({ title: '请填写拒绝理由', icon: 'none' })
    return
  }
  this.setData({ showRejectModal: false })
  var that = this
  var userInfo = app.globalData.userInfo

  wx.showLoading({ title: '处理中' })
  try {
    var now = db.getDb().serverDate()
    await db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'rejected',
      rejectionReason: reason.trim(),
      rejectedAt: now,
      approverId: userInfo._id,
      approverName: userInfo.name || userInfo.nickName
    })
    await db.addDoc(COLLECTIONS.APPROVAL_LOG, {
      purchaseId: that.data.id,
      action: 'reject',
      operatorId: userInfo._id,
      operatorName: userInfo.name || userInfo.nickName,
      remark: reason.trim(),
      createdAt: now
    })
    wx.hideLoading()
    wx.showToast({ title: '已拒绝', icon: 'none' })
    setTimeout(function() { that.loadPurchase(that.data.id) }, 500)
  } catch (err) {
    wx.hideLoading()
    handleCloudError(err, '拒绝操作')
  }
},

// 确认报销
onReimburse: async function() {
  if (!hasPermission('purchase', ACTIONS.REIMBURSE)) return
  var that = this
  var userInfo = app.globalData.userInfo

  wx.showLoading({ title: '确认中' })
  try {
    var now = db.getDb().serverDate()
    await db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'reimbursed',
      reimbursedAt: now,
      reimburserId: userInfo._id,
      reimburserName: userInfo.name || userInfo.nickName
    })
    await db.addDoc(COLLECTIONS.APPROVAL_LOG, {
      purchaseId: that.data.id,
      action: 'reimburse',
      operatorId: userInfo._id,
      operatorName: userInfo.name || userInfo.nickName,
      remark: '',
      createdAt: now
    })
    wx.hideLoading()
    wx.showToast({ title: '已确认报销', icon: 'success' })
    setTimeout(function() { that.loadPurchase(that.data.id) }, 500)
  } catch (err) {
    wx.hideLoading()
    handleCloudError(err, '报销确认')
  }
},

// 修改重提（从 rejected 状态）
onResubmit: function() {
  wx.navigateTo({ url: '/pages/purchase-add/index?id=' + this.data.id })
}
```

- [ ] **Step 4: 修改 purchase-detail/index.wxml — 增加状态标签和审批字段**

在现有的 Amount Hero 区域增加状态标签，在详情卡片中按 status 条件显示审批相关字段。

已在 mockup 中展示过，此处以 WXML 语法实现。关键改动：

```xml
<!-- 在 hero-section 中增加 status badge -->
<theme-badge theme="{{theme}}" status="{{purchase.status || 'reimbursed'}}" type="approvalStatus" text="{{purchase.approvalStatusName}}" size="md" />

<!-- 在详情卡片中，按条件显示审批/报销字段 -->
<view wx:if="{{purchase.approverName}}" class="detail-row ...">
  <text class="detail-label">审批人</text>
  <text class="detail-value">{{purchase.approverName}}</text>
</view>
<view wx:if="{{purchase.rejectionReason}}" class="detail-row ...">
  <text class="detail-label">拒绝理由</text>
  <text class="detail-value" style="color: {{theme.statusDanger || '#F87171'}};">{{purchase.rejectionReason}}</text>
</view>
<view wx:if="{{purchase.reimburserName}}" class="detail-row ...">
  <text class="detail-label">报销人</text>
  <text class="detail-value">{{purchase.reimburserName}}</text>
</view>

<!-- 审批日志时间线 -->
<view wx:if="{{approvalLogs.length > 0}}" class="log-section mt-lg">
  <text class="section-title" style="color: {{theme.textSecondary || '#9A9AB0'}};">审批日志</text>
  <view wx:for="{{approvalLogs}}" wx:key="_id" class="log-item">
    <text class="log-time" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.formattedTime}}</text>
    <text class="log-action" style="color: {{theme.textPrimary || '#F5F0E8'}};">
      {{item.operatorName}} {{item.action === 'submit' ? '提交申请' : item.action === 'approve' ? '审批通过' : item.action === 'reject' ? '拒绝' : item.action === 'reimburse' ? '确认报销' : ''}}
    </text>
    <text wx:if="{{item.remark}}" class="log-remark" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.remark}}</text>
  </view>
</view>

<!-- 底部栏 — 按状态+角色动态变化 -->
<view class="bottom-bar" wx:if="{{!loading && purchase}}">
  <!-- pending + 审批人(非提交人) -->
  <view wx:if="{{purchase.status === 'pending' && isApprover}}" class="bottom-bar-inner two-btns">
    <view class="bar-btn bar-btn-danger" bindtap="onShowReject">拒绝</view>
    <view class="bar-btn bar-btn-primary bar-btn-primary-wide" bindtap="onApprove">通过</view>
  </view>
  <!-- pending + 提交人 -->
  <view wx:if="{{purchase.status === 'pending' && isSubmitter && !isApprover}}" class="bottom-bar-inner one-btn">
    <view wx:if="{{canEdit}}" class="bar-btn bar-btn-primary bar-btn-primary-wide" bindtap="onEdit">编辑</view>
  </view>
  <!-- approved + 有报销权限 -->
  <view wx:if="{{purchase.status === 'approved' && canReimburse}}" class="bottom-bar-inner one-btn">
    <view class="bar-btn bar-btn-primary bar-btn-primary-wide" bindtap="onReimburse">确认报销</view>
  </view>
  <!-- rejected + 提交人 -->
  <view wx:if="{{purchase.status === 'rejected' && isSubmitter}}" class="bottom-bar-inner one-btn">
    <view class="bar-btn bar-btn-primary bar-btn-primary-wide" bindtap="onResubmit">修改重提</view>
  </view>
  <!-- reimbursed: 无操作按钮 -->
</view>
```

- [ ] **Step 5: 修改 purchase-detail/index.wxss — 增加日志样式**

```css
.log-section { padding: 0 8rpx; }
.log-item { padding: 12rpx 0; border-left: 2rpx solid rgba(201,169,110,0.3); padding-left: 24rpx; margin-left: 8rpx; }
.log-time { font-size: 24rpx; display: block; }
.log-action { font-size: 26rpx; display: block; margin-top: 2rpx; }
.log-remark { font-size: 24rpx; display: block; margin-top: 4rpx; opacity: 0.7; }
```

- [ ] **Step 6: Commit**

```bash
git add pages/purchase-detail/
git commit -m "feat: purchase detail adds approval actions, status display, and log timeline"
```

---

### Task 9: 首页 — 待办区块 + 今日采购统计过滤

**Files:**
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`

**Files:**
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`

- [ ] **Step 0: 修改 index.js — 今日采购支出仅统计 reimbursed**

找到 `loadData` 中计算 `todayExpenseTotal` 的代码（约第135-136行），修改采购累加部分：

```javascript
// 原代码:
(todayPurchaseRes.data || []).reduce((sum, item) => sum + (item.amount || 0), 0)
// 改为 (只统计已报销的):
(todayPurchaseRes.data || []).filter(function(p) { return !p.status || p.status === 'reimbursed' }).reduce(function(sum, item) { return sum + (item.amount || 0) }, 0)
```

这将确保首页「今日支出」数字只包含已报销的采购。

- [ ] **Step 1: 修改 index.js — 加载待办计数**

在 `data` 中新增：

```javascript
pendingApprovalCount: 0,
pendingReimburseCount: 0,
showTodo: false
```

在 `onShow` 中增加是否显示待办的判断：

```javascript
showTodo: hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)
```

在 `loadData` 函数末尾（`setData` 调用之后），异步加载待办计数：

```javascript
// 如果用户有审批/报销权限，异步加载待办计数
if (this.data.showTodo) {
  this.loadTodoCounts()
}
```

新增方法：

```javascript
loadTodoCounts: async function() {
  var userInfo = app.globalData.userInfo
  if (!userInfo || !userInfo._id) return

  try {
    var dbInst = db.getDb()
    var _ = dbInst.command

    // 待审批: status=pending AND approverId=currentUser AND purchaseBy != currentUser
    var pendingRes = await dbInst.collection(COLLECTIONS.PURCHASE)
      .where({
        status: 'pending',
        approverId: userInfo._id,
        purchaseBy: _.neq(userInfo._id)
      })
      .count()

    // 待报销: status=approved
    var reimbursedRes = await dbInst.collection(COLLECTIONS.PURCHASE)
      .where({ status: 'approved' })
      .count()

    this.setData({
      pendingApprovalCount: pendingRes.total || 0,
      pendingReimburseCount: reimbursedRes.total || 0
    })
  } catch (e) {
    console.log('加载待办计数失败:', e)
  }
}
```

- [ ] **Step 2: 修改 index.wxml — 在快捷操作后增加待办区块**

```xml
<!-- 在快捷操作区块之后、Bottom spacing 之前 -->
<view wx:if="{{showTodo && (pendingApprovalCount > 0 || pendingReimburseCount > 0)}}" class="section-block section-todo" bindtap="onTodoTap">
  <view class="section-header">
    <text class="section-title" style="color: {{theme.textSecondary || '#9A9AB0'}}; font-size: 26rpx;">📋 待办</text>
  </view>
  <view class="todo-card" style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 16rpx;">
    <view class="todo-row" wx:if="{{pendingApprovalCount > 0}}" style="border-bottom: 1rpx solid {{theme.dividerColor || 'rgba(255,255,255,0.06)'}};">
      <text style="font-size: 40rpx;">🟡</text>
      <text style="flex:1; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx;">待审批</text>
      <view class="todo-badge" style="background: rgba(251,191,36,0.15); padding: 4rpx 16rpx; border-radius: 99rpx;">
        <text style="color: #FBBF24; font-size: 24rpx; font-weight: 700;">{{pendingApprovalCount}}</text>
      </view>
      <text style="color: {{theme.textMuted || 'rgba(245,240,232,0.4)'}}; font-size: 36rpx;">›</text>
    </view>
    <view class="todo-row" wx:if="{{pendingReimburseCount > 0}}">
      <text style="font-size: 40rpx;">💰</text>
      <text style="flex:1; color: {{theme.textPrimary || '#F5F0E8'}}; font-size: 28rpx;">待报销</text>
      <view class="todo-badge" style="background: rgba(74,222,128,0.15); padding: 4rpx 16rpx; border-radius: 99rpx;">
        <text style="color: #4ADE80; font-size: 24rpx; font-weight: 700;">{{pendingReimburseCount}}</text>
      </view>
      <text style="color: {{theme.textMuted || 'rgba(245,240,232,0.4)'}}; font-size: 36rpx;">›</text>
    </view>
  </view>
</view>
```

- [ ] **Step 3: 在 index.js 中增加 onTodoTap 方法**

```javascript
onTodoTap: function() {
  wx.navigateTo({ url: '/pages/todo/index' })
}
```

- [ ] **Step 4: Commit**

```bash
git add pages/index/
git commit -m "feat: add todo section on dashboard for approvers and reimbursers"
```

---

### Task 10: 我的页 — 待办菜单项

**Files:**
- Modify: `pages/me/index.js`

- [ ] **Step 1: 在 buildMenuGroups 中加入待办分组**

```javascript
// 在 buildMenuGroups 函数中，managementGroup 之后新增
var todoGroup = []
if (hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)) {
  todoGroup.push({ key: 'todo', icon: '📋', text: '我的待办' })
}
if (todoGroup.length > 0) {
  this.setData({ todoGroup: todoGroup })
}
```

- [ ] **Step 2: 在 data 中加入 todoGroup**

```javascript
data: {
  // ... existing ...
  todoGroup: []
}
```

- [ ] **Step 3: 在 index.wxml 中渲染待办分组**

无需修改 WXML，因为菜单项是由 `buildMenuGroups` 数据驱动动态生成的。只需确保 `onMenuTap` 的 routes 中包含 `todo` 键：

```javascript
// 在 onMenuTap 的 routes 中增加:
todo: '/pages/todo/index'
```

- [ ] **Step 4: Commit**

```bash
git add pages/me/index.js
git commit -m "feat: add todo menu entry in Me page"
```

---

### Task 11: 我的待办清单 — 新增页面

**Files:**
- Create: `pages/todo/index.js`
- Create: `pages/todo/index.wxml`
- Create: `pages/todo/index.wxss`
- Create: `pages/todo/index.json`

- [ ] **Step 1: 创建 index.json 并注册页面**

创建 `pages/todo/index.json`：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

在 `app.json` 的 `pages` 数组中新增一行（放在 admin 页面之前）：

```json
"pages/todo/index",
```

- [ ] **Step 2: 创建 index.js**

```javascript
var app = getApp()
var { handleCloudError } = require('../../utils/error-handler')
var { hasPermission, ACTIONS } = require('../../utils/permission')
var { COLLECTIONS } = require('../../utils/db')
var { formatDate, formatAmount, getCategoryName, getApprovalStatusName } = require('../../utils/helpers')
var db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    pendingApprovals: [],
    pendingReimbursements: []
  },

  onLoad: function() {
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function() {
    this.loadTodos()
  },

  loadTodos: async function() {
    var that = this
    that.setData({ loading: true })
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      that.setData({ loading: false })
      return
    }

    try {
      var dbInst = db.getDb()
      var _ = dbInst.command

      // 待审批
      var approvalRes = []
      if (hasPermission('purchase', ACTIONS.APPROVE)) {
        approvalRes = await dbInst.collection(COLLECTIONS.PURCHASE)
          .where({
            status: 'pending',
            approverId: userInfo._id,
            purchaseBy: _.neq(userInfo._id)
          })
          .orderBy('createdAt', 'desc')
          .get()
      }

      // 待报销
      var reimburseRes = []
      if (hasPermission('purchase', ACTIONS.REIMBURSE)) {
        reimburseRes = await dbInst.collection(COLLECTIONS.PURCHASE)
          .where({ status: 'approved' })
          .orderBy('approvedAt', 'desc')
          .get()
      }

      that.setData({
        pendingApprovals: (approvalRes.data || []).map(that._formatItem),
        pendingReimbursements: (reimburseRes.data || []).map(that._formatItem),
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载待办清单')
    }
  },

  _formatItem: function(item) {
    return {
      ...item,
      categoryName: getCategoryName(item.category),
      formattedAmount: formatAmount(item.amount),
      formattedDate: formatDate(item.date)
    }
  },

  onItemTap: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  },

  onBack: function() {
    wx.navigateBack()
  }
})
```

- [ ] **Step 3: 创建 index.wxml**

```xml
<view class="page" style="background: {{theme.surfaceColor || '#1A1A2E'}};">
  <view class="nav-bar" style="background: {{theme.gradientHeader || theme.surfaceColor}}; padding-top: {{statusBarHeight}}px; height: {{statusBarHeight + 44}}px; box-sizing: border-box;">
    <view class="nav-bar-content">
      <view class="nav-back" bindtap="onBack"><text class="nav-back-icon" style="color: {{theme.textPrimary || '#F5F0E8'}};">❮</text></view>
      <text class="nav-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">我的待办</text>
      <view class="nav-action"></view>
    </view>
  </view>

  <view class="page-content" wx:if="{{!loading}}">
    <!-- 待审批 -->
    <view class="todo-section">
      <view class="section-title">
        <text>🟡 待审批</text>
        <text wx:if="{{pendingApprovals.length > 0}}" class="count-badge">{{pendingApprovals.length}}</text>
      </view>
      <view wx:if="{{pendingApprovals.length === 0}}" class="empty-hint">暂无待审批项</view>
      <view wx:for="{{pendingApprovals}}" wx:key="_id" class="todo-item" data-id="{{item._id}}" bindtap="onItemTap"
        style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <view class="todo-item-header">
          <text class="todo-name" style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item.item || '采购条目'}}</text>
          <text class="todo-amount" style="color: {{theme.amountNegative || '#F87171'}};">-¥{{item.formattedAmount}}</text>
        </view>
        <view class="todo-item-meta">
          <theme-badge theme="{{theme}}" status="{{item.category}}" type="category" text="{{item.categoryName}}" size="sm" />
          <text class="todo-submitter" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.purchaseByName}} 提交</text>
          <text class="todo-date" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.formattedDate}}</text>
        </view>
      </view>
    </view>

    <!-- 待报销 -->
    <view class="todo-section">
      <view class="section-title">
        <text>💰 待报销</text>
        <text wx:if="{{pendingReimbursements.length > 0}}" class="count-badge" style="color: #4ADE80; background: rgba(74,222,128,0.15);">{{pendingReimbursements.length}}</text>
      </view>
      <view wx:if="{{pendingReimbursements.length === 0}}" class="empty-hint">暂无待报销项</view>
      <view wx:for="{{pendingReimbursements}}" wx:key="_id" class="todo-item" data-id="{{item._id}}" bindtap="onItemTap"
        style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}};">
        <view class="todo-item-header">
          <text class="todo-name" style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item.item || '采购条目'}}</text>
          <text class="todo-amount" style="color: {{theme.amountNegative || '#F87171'}};">-¥{{item.formattedAmount}}</text>
        </view>
        <view class="todo-item-meta">
          <theme-badge theme="{{theme}}" status="{{item.category}}" type="category" text="{{item.categoryName}}" size="sm" />
          <text style="color: #4ADE80; font-size: 22rpx;">✅ 已批准</text>
          <text class="todo-submitter" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.approverName}} 审批</text>
          <text class="todo-date" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.formattedDate}}</text>
        </view>
      </view>
    </view>
  </view>

  <view wx:if="{{loading}}" style="display: flex; justify-content: center; padding-top: 400rpx;">
    <text style="color: {{theme.textMuted || '#5C5C72'}};">加载中...</text>
  </view>
</view>
```

- [ ] **Step 4: 创建 index.wxss**

```css
.page { min-height: 100vh; }
.nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.nav-bar-content { display: flex; align-items: center; justify-content: space-between; height: 88rpx; padding: 0 24rpx; }
.nav-back { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; }
.nav-back-icon { font-size: 44rpx; font-weight: 300; }
.nav-title { font-size: 34rpx; font-weight: 600; }
.nav-action { min-width: 64rpx; }
.page-content { padding-top: calc(env(safe-area-inset-top, 44px) + 88rpx + 20rpx); padding-left: 32rpx; padding-right: 32rpx; }

.todo-section { margin-top: 28rpx; }
.section-title { font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; display: flex; align-items: center; gap: 12rpx; padding-left: 4rpx; }
.count-badge { font-size: 24rpx; font-weight: 700; color: #FBBF24; background: rgba(251,191,36,0.15); padding: 4rpx 16rpx; border-radius: 99rpx; }
.empty-hint { text-align: center; padding: 40rpx 0; color: #5C5C72; font-size: 26rpx; }

.todo-item { padding: 24rpx; border-radius: 14rpx; margin-bottom: 12rpx; }
.todo-item:active { opacity: 0.8; }
.todo-item-header { display: flex; justify-content: space-between; align-items: flex-start; }
.todo-name { font-size: 30rpx; font-weight: 600; max-width: 340rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-amount { font-size: 32rpx; font-weight: 700; font-family: monospace; flex-shrink: 0; }
.todo-item-meta { display: flex; align-items: center; gap: 10rpx; margin-top: 12rpx; }
.todo-submitter { font-size: 24rpx; }
.todo-date { font-size: 24rpx; margin-left: auto; }
```

- [ ] **Step 5: Commit**

```bash
git add pages/todo/
git commit -m "feat: add todo list page for approvals and reimbursements"
```

---

### Task 12: 员工管理 — 审批/报销权限开关

**Files:**
- Modify: `pages/admin/staff-add/index.js`
- Modify: `pages/admin/staff-add/index.wxml`

- [ ] **Step 1: 修改 staff-add/index.js — 加载和保存权限时包含 approve/reimburse**

在加载权限的代码中，当读取 purchase 模块时，检查是否有 `approve` 和 `reimburse` action：

```javascript
// data 中新增
canApprovePurchase: false,
canReimbursePurchase: false

// 在 onLoad 加载权限数据后:
var purchasePerm = perms.find(function(p) { return p.module === 'purchase' })
if (purchasePerm && purchasePerm.actions) {
  that.setData({
    canApprovePurchase: purchasePerm.actions.includes('approve') || purchasePerm.actions.includes('*'),
    canReimbursePurchase: purchasePerm.actions.includes('reimburse') || purchasePerm.actions.includes('*')
  })
}
```

在保存权限时，将这些开关对应到 purchase 模块的 actions 数组中：

```javascript
// 构建 purchase actions 时:
var purchaseActions = purchasePerm.actions.filter(function(a) {
  return a !== 'approve' && a !== 'reimburse' && a !== '*'
})
if (canApprovePurchase) purchaseActions.push('approve')
if (canReimbursePurchase) purchaseActions.push('reimburse')
```

- [ ] **Step 2: 修改 staff-add/index.wxml — 增加开关 UI**

在 purchase 模块的权限开关组中，增加两行：

```xml
<view class="perm-extra" wx:if="{{hasPurchasePerm}}">
  <view class="extra-row">
    <text>可审批采购申请</text>
    <switch checked="{{canApprovePurchase}}" bindchange="onApprovePurchaseChange" color="{{theme.accentColor || '#C9A96E'}}" />
  </view>
  <view class="extra-row">
    <text>可确认采购报销</text>
    <switch checked="{{canReimbursePurchase}}" bindchange="onReimbursePurchaseChange" color="{{theme.accentColor || '#C9A96E'}}" />
  </view>
</view>
```

- [ ] **Step 3: Commit**

```bash
git add pages/admin/staff-add/
git commit -m "feat: add approve/reimburse permission toggles in staff management"
```

---

### Task 12b: 经营报表 — 采购支出仅统计 reimbursed

**Files:**
- Modify: `pages/admin/dashboard/index.js`

- [ ] **Step 1: 修改 admin/dashboard/index.js — purchase 统计过滤**

找到第310行附近的 `purchaseData.forEach`，加入 status 过滤：

```javascript
// 修改为:
purchaseData.forEach(function(item) {
  // 只统计已报销的采购
  if (!item.status || item.status === 'reimbursed') {
    totalPurchase += Number(item.amount) || 0
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add pages/admin/dashboard/index.js
git commit -m "fix: dashboard only counts reimbursed purchases"
```

---

### Task 13: 最终集成测试

- [ ] **Step 1: 在微信开发者工具中编译，检查无报错**

- [ ] **Step 2: 端到端测试**

测试流程：
1. 打开采购审批设置页 → 开启全局开关 → 勾选「设备」类目 → 设置默认审批人为「李四」→ 保存
2. 以「张三」身份登录（有采购 add 权限，无 approve 权限）→ 新增采购「空调维修」，分类选「设备」，金额 850 → 提交
3. 切换「李四」登录 → 首页看到待办（待审批 1）→ 进入待办清单 → 点击该条目 → 采购详情页显示【通过】【拒绝】按钮
4. 李四点击「通过」→ 记录改为 approved → 首页待办变为（待报销 1）
5. 以有 reimburse 权限的人登录 → 进入待办 → 点击确认报销 → 记录改为 reimbursed
6. 以张三身份登录 → 采购列表看到该条目从「待审批」→「已批准」→「已报销」的状态变化
7. 新增一个「肉类」采购（未勾选审批）→ 直接显示「已批准」→ 走报销流程
8. 测试拒绝：李四拒绝一个 pending 申请，填拒绝理由 → 张三看到「已拒绝」状态 + 理由 → 点击「修改重提」→ 编辑后重新提交

- [ ] **Step 3: Commit final adjustments**

```bash
git add -A
git commit -m "feat: final integration of purchase approval workflow"
```

---
