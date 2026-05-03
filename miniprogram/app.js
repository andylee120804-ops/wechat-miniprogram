const { getCurrentThemeId, getThemePageData, THEMES } = require('./utils/theme')
const { COLLECTIONS } = require('./utils/db')

App({
  globalData: {
    userInfo: null,
    permissions: [],
    isLogin: false,
    theme: 'ink-gold',
    statusBarHeight: 44,
    venueName: ''
  },

  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d9gwvttcr864f8021', traceUser: true })
    // Get status bar height - use new API if available, fallback otherwise
    try {
      if (typeof wx.getWindowInfo === 'function') {
        const sysInfo = wx.getWindowInfo()
        this.globalData.statusBarHeight = sysInfo.statusBarHeight || 44
      } else {
        // Fallback for older SDK versions
        const sysInfo = wx.getSystemInfoSync()
        this.globalData.statusBarHeight = sysInfo.statusBarHeight || 44
      }
    } catch (e) {
      this.globalData.statusBarHeight = 44
    }
    this.loadTheme()
    this.checkLogin()
    this.loadVenueName()
  },

  async loadVenueName() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success && res.result.data.venueName) {
        this.globalData.venueName = res.result.data.venueName
      }
    } catch (err) {
      // Silent — fallback to '听澜轩' in pages
    }
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

  onShow() {
    this.refreshSession()
  },

  _lastRefreshTime: 0,

  async refreshSession() {
    const userInfo = this.globalData.userInfo
    if (!userInfo) return
    const now = Date.now()
    if (now - this._lastRefreshTime < 30000) return
    this._lastRefreshTime = now
    try {
      const permRes = await wx.cloud.callFunction({
        name: 'getPermissions',
        data: { staffId: userInfo._id }
      })
      if (permRes.result && permRes.result.success) {
        this.globalData.permissions = permRes.result.data
      }
      const db = wx.cloud.database()
      const staffRes = await db.collection(COLLECTIONS.STAFF).doc(userInfo._id).get()
      if (staffRes.data) {
        let updatedInfo = Object.assign({}, userInfo, {
          name: staffRes.data.name,
          role: staffRes.data.role,
          phone: staffRes.data.phone || '',
          permissionsUpdatedAt: staffRes.data.permissionsUpdatedAt || userInfo.permissionsUpdatedAt
        })
        this.setUserInfo(updatedInfo)
      }
    } catch (err) {
      console.error('[refreshSession] 刷新状态失败:', err)
    }
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
