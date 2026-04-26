const app = getApp()
const { getRoleName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    userInfo: null,
    roleName: '',
    showThemeSwitcher: false,
    managementGroup: [],
    featureGroup: [],
    settingsGroup: []
  },

  onShow() {
    const theme = app.getThemePageData()
    const userInfo = app.globalData.userInfo || null
    const roleName = userInfo ? getRoleName(userInfo.role) : ''

    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      userInfo,
      roleName,
      currentThemeId: app.getTheme() || 'ink-gold'
    })

    this.buildMenuGroups()
  },

  buildMenuGroups() {
    const managementGroup = []
    const featureGroup = []
    const settingsGroup = []

    // Management group
    if (hasPermission('dashboard', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'dashboard', icon: '📊', text: '经营报表' })
    }
    if (hasPermission('staff', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'staff', icon: '👥', text: '员工管理' })
    }
    if (hasPermission('attendance', ACTIONS.VIEW)) {
      managementGroup.push({ key: 'attendance', icon: '🗓', text: '出勤统计' })
    }
    managementGroup.push({ key: 'clockin', icon: '🕐', text: '打卡' })
    managementGroup.push({ key: 'announcements', icon: '📢', text: '公告通知' })

    // Feature group (boss only)
    const userInfo = app.globalData.userInfo
    if (userInfo && userInfo.role === 'boss') {
      featureGroup.push({ key: 'customer', icon: '👤', text: '客户管理' })
      featureGroup.push({ key: 'insights', icon: '🔍', text: '经营洞察' })
    }

    // Settings group
    settingsGroup.push({ key: 'theme', icon: '🎨', text: '主题选择' })
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
      about: ''
    }

    if (key === 'theme') {
      this.onThemeSwitch()
      return
    }

    if (key === 'about') {
      wx.showModal({
        title: '关于听澜轩',
        content: '听澜轩智慧会所管理系统 v1.0.0\n专注高端会所的预约、采购、收入与客户管理',
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

  onThemeSwitch() {
    this.setData({ showThemeSwitcher: true })
  },

  onThemeChange() {
    const theme = app.getThemePageData()
    this.setData({ theme })
  },

  onThemeClose() {
    this.setData({ showThemeSwitcher: false })
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
