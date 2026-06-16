const app = getApp()
const { getRoleName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    userInfo: null,
    roleName: '',
    managementGroup: [],
    featureGroup: [],
    settingsGroup: [],
    pendingApprovalCount: 0,
    pendingReimburseCount: 0,
    pendingTotal: 0,
    hasTodoPermission: false,
    pendingGroup: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setActiveByPage('/pages/me/index')
    }
    const theme = app.getThemePageData()
    const userInfo = app.globalData.userInfo || null
    const roleName = userInfo ? getRoleName(userInfo.role) : ''

    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      userInfo,
      roleName
    })

    this.buildMenuGroups()
  },

  buildMenuGroups() {
    const managementGroup = []
    const featureGroup = []
    const settingsGroup = []
    const userInfo = app.globalData.userInfo || {}

    // Staff management — hasPermission now correctly blocks boss
    if (hasPermission('staff', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'staff', icon: '👥', text: '员工管理' })
    }
    if (hasPermission('attendance', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'attendance', icon: '🗓', text: '出勤统计' })
    }
    managementGroup.push({ key: 'clockin', icon: '🕐', text: '打卡' })
    managementGroup.push({ key: 'announcements', icon: '📢', text: '公告通知' })
    // Logs use staff VIEW permission — boss cannot access
    if (hasPermission('staff', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'logs', icon: '📋', text: '操作日志' })
    }

    // Feature group — boss and admin both get business features
    if (hasPermission('dashboard', ACTIONS.VIEW)) {
      featureGroup.push({ key: 'dashboard', icon: '📊', text: '经营报表' })
      featureGroup.push({ key: 'customer', icon: '💁', text: '客户管理' })
      featureGroup.push({ key: 'insights', icon: '🔍', text: '经营洞察' })
    }
    if (hasPermission('expense', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'fixedExpense', icon: '🏠', text: '固定成本' })
    }
    // Approval settings — admin only
    if (userInfo.role === 'admin') {
      managementGroup.push({ key: 'approvalSettings', icon: '✅', text: '采购审批设置' })
    }
    // Admin-only settings
    if (hasPermission('minAmount', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'minAmount', icon: '⚙️', text: '预约管理设置' })
    }
    if (hasPermission('venueSettings', ACTIONS.VIEW)) {
      settingsGroup.push({ key: 'venueSettings', icon: '🏠', text: '食堂设置' })
    }
    settingsGroup.push({ key: 'about', icon: 'ℹ️', text: '关于' })

    const hasTodoPerm = hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)
    const hasPurchaseAdd = hasPermission('purchase', ACTIONS.ADD)

    // Build pending group (dynamic menu items)
    var pendingGroup = []
    if (hasTodoPerm) {
      pendingGroup.push({ key: 'todo', icon: '📋', text: '我的待办事项', count: this.data.pendingTotal || 0 })
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
  },

  loadTodoCounts: async function() {
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) return
    try {
      var dbInst = db.getDb()
      var _ = dbInst.command
      var pendingRes = await dbInst.collection(COLLECTIONS.PURCHASE)
        .where({
          status: 'pending',
          approverId: userInfo._id,
          purchaseBy: _.neq(userInfo._id)
        }).count()
      var reimbursedRes = await dbInst.collection(COLLECTIONS.PURCHASE)
        .where({ status: 'approved' }).count()
      var total = (pendingRes.total || 0) + (reimbursedRes.total || 0)
      this.setData({
        pendingApprovalCount: pendingRes.total || 0,
        pendingReimburseCount: reimbursedRes.total || 0,
        pendingTotal: total
      })
      // Rebuild menu to update badge count
      this.buildMenuGroups()
    } catch (e) {
      console.warn('[me] 加载待办数量失败:', e)
    }
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key
    const routes = {
      dashboard: '/pages/admin/dashboard/index',
      staff: '/pages/admin/staff/index',
      attendance: '/pages/admin/attendance/index',
      clockin: '/pages/clockin/index',
      announcements: '/pages/announcements/index',
      customer: '/pages/customer/index',
      insights: '/pages/insights/index',
      minAmount: '/pages/min-amount/index',
      fixedExpense: '/pages/admin/expense/index',
      logs: '/pages/admin/logs/index',
      venueSettings: '/pages/admin/venue-settings/index',
      approvalSettings: '/pages/admin/approval-settings/index',
      todo: '/pages/todo/index',
      myPurchases: '/pages/my-purchases/index',
      about: ''
    }

    if (key === 'about') {
      wx.showModal({
        title: '关于',
        content: (app.globalData.venueName || '四兄弟的小地方') + '2026四月开始了',
        showCancel: false
      })
      return
    }

    const url = routes[key]
    if (url) {
      try {
        wx.navigateTo({ url })
      } catch (err) {
        wx.showToast({ title: '页面加载失败', icon: 'none' })
      }
    }
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      confirmColor: '#F87171',
      success: function(res) {
        if (res.confirm) {
          log(LOG_TYPES.LOGOUT, '用户主动登出')
          app.logout()
          wx.reLaunch({ url: '/pages/login/index' })
        }
      }
    })
  }
})
