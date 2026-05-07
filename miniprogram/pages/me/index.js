const app = getApp()
const { getRoleName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    userInfo: null,
    roleName: '',
    managementGroup: [],
    featureGroup: [],
    settingsGroup: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 4 })
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
      featureGroup.push({ key: 'customer', icon: '👤', text: '客户管理' })
      featureGroup.push({ key: 'insights', icon: '🔍', text: '经营洞察' })
    }
    if (hasPermission('expense', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'fixedExpense', icon: '🏠', text: '固定成本' })
    }
    // Admin-only settings
    if (hasPermission('minAmount', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'minAmount', icon: '💰', text: '最低消费设置' })
    }
    if (hasPermission('venueSettings', ACTIONS.VIEW)) {
      settingsGroup.push({ key: 'venueSettings', icon: '🏠', text: '食堂设置' })
    }
    settingsGroup.push({ key: 'about', icon: 'ℹ️', text: '关于' })

    this.setData({
      managementGroup,
      featureGroup,
      settingsGroup
    })
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
      about: ''
    }

    if (key === 'about') {
      wx.showModal({
        title: '关于',
        content: (app.globalData.venueName || '听澜轩') + '智慧管理系统 v1.0.0',
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
