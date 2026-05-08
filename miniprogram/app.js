const { getCurrentThemeId, getThemePageData, THEMES } = require('./utils/theme')
const { COLLECTIONS, CLOUD_ENV } = require('./utils/db')

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
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
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
    this._loginPromise = this.checkLogin()
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
      console.warn('[App] 加载场地名称失败:', err)
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

  // Pages accessible without login
  _publicPages: ['/pages/login/index', '/pages/reservation-share/index'],

  async onShow() {
    // Wait for initial login check (auto-login) before guarding auth,
    // prevents flashing the login page while auto-login is in progress
    if (this._loginPromise) {
      await this._loginPromise
      this._loginPromise = null
    }
    this.refreshSession()
    this._guardAuth()
  },

  _authRedirecting: false,
  _guardAuth() {
    const pages = getCurrentPages()
    if (!pages.length || this._authRedirecting) return
    const route = '/' + pages[pages.length - 1].route

    if (this.globalData.isLogin) {
      if (route === '/pages/login/index') {
        wx.switchTab({ url: '/pages/index/index' })
      }
      return
    }

    if (this._publicPages.includes(route)) return
    this._authRedirecting = true
    wx.reLaunch({
      url: '/pages/login/index',
      complete: () => { this._authRedirecting = false }
    })
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
        let updatedInfo = {
          ...userInfo,
          name: staffRes.data.name,
          role: staffRes.data.role,
          phone: staffRes.data.phone || '',
          permissionsUpdatedAt: staffRes.data.permissionsUpdatedAt || userInfo.permissionsUpdatedAt
        }
        this.setUserInfo(updatedInfo)
      }
    } catch (err) {
      console.error('[refreshSession] 刷新状态失败:', err)
    }
  },

  async checkLogin() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      // 先乐观恢复，再异步校验 OPENID 是否匹配
      this.globalData.userInfo = userInfo
      this.globalData.isLogin = true

      try {
        const res = await wx.cloud.callFunction({
          name: 'login',
          data: { action: 'verifySession', staffId: userInfo._id }
        })
        if (res.result && res.result.success) {
          this.globalData.userInfo = res.result.data
          wx.setStorageSync('userInfo', res.result.data)
        } else {
          this.logout()
          // verifySession failed, try autoLogin
          await this._tryAutoLogin()
        }
      } catch (err) {
        console.warn('[checkLogin] 会话校验失败，保持当前状态:', err)
      }
      return
    }

    // No stored session, try auto-login via OPENID binding
    await this._tryAutoLogin()
  },

  async _tryAutoLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'autoLogin' }
      })
      if (res.result && res.result.success) {
        this.setUserInfo(res.result.data)
        // Load permissions after auto-login
        const permRes = await wx.cloud.callFunction({
          name: 'getPermissions',
          data: { staffId: res.result.data._id }
        })
        if (permRes.result && permRes.result.success && permRes.result.data) {
          this.globalData.permissions = permRes.result.data
        }
        // Redirect to main immediately after auto-login succeeds,
        // instead of waiting for onShow's _guardAuth call.
        // Defer to next microtask so isLogin=true is set first (guardAuth
        // sees the updated isLogin after logout→setUserInfo chain settles).
        Promise.resolve().then(() => this._guardAuth())
      }
    } catch (err) {
      console.warn('[autoLogin] 自动登录失败:', err)
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
    const userInfo = this.globalData.userInfo
    if (userInfo && userInfo.role === 'admin') return true
    // Boss can access everything except admin-only modules
    if (userInfo && userInfo.role === 'boss') {
      const adminOnlyModules = ['staff', 'venueSettings', 'minAmount']
      return !adminOnlyModules.includes(module)
    }
    const perms = this.globalData.permissions
    if (perms.length === 0) return false
    const perm = perms.find(p => p.module === module)
    if (!perm) return false
    return perm.actions.includes(action) || perm.actions.includes('*')
  }
})
