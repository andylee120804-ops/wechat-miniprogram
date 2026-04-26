const { getCurrentThemeId, getThemePageData, THEMES } = require('./utils/theme')
const { COLLECTIONS } = require('./utils/db')

App({
  globalData: {
    userInfo: null,
    permissions: [],
    isLogin: false,
    theme: 'ink-gold',
    statusBarHeight: 44
  },

  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d9gwvttcr864f8021', traceUser: true })
    const sysInfo = wx.getSystemInfoSync()
    this.globalData.statusBarHeight = sysInfo.statusBarHeight || 44
    this.loadTheme()
    this.checkLogin()
  },

  loadTheme() {
    const themeId = getCurrentThemeId()
    this.globalData.theme = themeId
    this.applyTheme(themeId)
  },

  applyTheme(themeId) {
    const theme = THEMES[themeId] || THEMES['ink-gold']
    wx.setTabBarStyle({
      color: theme.tabBar.unselectedColor,
      selectedColor: theme.tabBar.selectedColor,
      backgroundColor: theme.tabBar.bg,
      borderStyle: theme.tabBar.borderStyle
    })
    wx.setNavigationBarColor({
      frontColor: theme.navBar.frontColor,
      backgroundColor: theme.navBar.bg,
      animation: { duration: 300, timingFunc: 'easeIn' }
    })
  },

  setTheme(themeId) {
    if (!THEMES[themeId]) return
    this.globalData.theme = themeId
    wx.setStorageSync('theme', themeId)
    this.applyTheme(themeId)
  },

  getTheme() { return this.globalData.theme },
  getThemeColors() { return THEMES[this.globalData.theme] || THEMES['ink-gold'] },
  getThemePageData() { return getThemePageData(this.globalData.theme) },

  checkForceRelogin(callback) {
    const userInfo = this.globalData.userInfo
    if (!userInfo) return
    const db = wx.cloud.database()
    db.collection(COLLECTIONS.STAFF).doc(userInfo._id).get().then(res => {
      const staff = res.data
      if (staff.permissionsUpdatedAt && (!userInfo.permissionsUpdatedAt ||
          staff.permissionsUpdatedAt > userInfo.permissionsUpdatedAt)) {
        wx.showModal({
          title: '权限变更',
          content: '您的权限已被更新，请重新登录',
          showCancel: false,
          success: () => {
            this.logout()
            wx.reLaunch({ url: '/pages/login/index' })
          }
        })
      } else if (callback) callback()
    }).catch(err => {
      console.error('检查权限变更失败:', err)
      if (callback) callback()
    })
  },

  checkLogin() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      this.globalData.isLogin = true
    }
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLogin = true
    wx.setStorageSync('userInfo', userInfo)
  },

  logout() {
    this.globalData.userInfo = null
    this.globalData.permissions = []
    this.globalData.isLogin = false
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('permissionsUpdatedAt')
  },

  hasPermission(module, action) {
    const perms = this.globalData.permissions
    if (perms.length === 0) return false
    const userInfo = this.globalData.userInfo
    if (userInfo && userInfo.role === 'boss') return true
    const perm = perms.find(p => p.module === module)
    if (!perm) return false
    return perm.actions.includes(action) || perm.actions.includes('*')
  }
})
