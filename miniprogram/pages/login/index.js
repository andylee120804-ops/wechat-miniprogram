const app = getApp()

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    wechatId: '',
    loading: false,
    shakeAnimation: false,
    autoLoginLoading: true
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, venueName: app.globalData.venueName })
    if (!app.globalData.venueName) this.loadVenueName()
    // Monitor initial login check; once done, hide spinner and proceed normally
    this._waitForInitialLogin()
  },

  async _waitForInitialLogin() {
    if (app._initialLoginChecked) {
      this._finishAutoLoginFlow()
      return
    }
    const start = Date.now()
    while (!app._initialLoginChecked && Date.now() - start < 5000) {
      await new Promise(r => setTimeout(r, 100))
    }
    this._finishAutoLoginFlow()
  },

  _finishAutoLoginFlow() {
    this.setData({ autoLoginLoading: false })
    if (app.globalData.isLogin) {
      wx.switchTab({ url: '/pages/index/index' })
    }
  },

  async loadVenueName() {
    try {
      const res = await wx.cloud.callFunction({ name: 'sendMessage', data: { action: 'getSettings' } })
      if (res.result && res.result.success && res.result.data.venueName) {
        app.globalData.venueName = res.result.data.venueName
        this.setData({ venueName: res.result.data.venueName })
      }
    } catch (err) {
      console.warn('[Login] 加载场地名称失败:', err)
    }
  },

  onWechatIdInput(e) {
    this.setData({ wechatId: e.detail.value })
  },

  async onLogin() {
    const { wechatId } = this.data
    if (!wechatId || !wechatId.trim()) {
      wx.showToast({ title: '请输入用户名', icon: 'none' })
      this.shakeCard()
      return
    }

    this.setData({ loading: true })

    try {
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: { wechatId: wechatId.trim() }
      })

      const result = loginRes.result
      if (!result.success) {
        wx.showToast({ title: result.message, icon: 'none', duration: 3000 })
        this.shakeCard()
        return
      }

      app.setUserInfo(result.data)

      // Load permissions
      const permRes = await wx.cloud.callFunction({
        name: 'getPermissions',
        data: { staffId: result.data._id }
      })

      if (permRes.result && permRes.result.success && permRes.result.data) {
        app.globalData.permissions = permRes.result.data
      }

      // Log login
      const { log } = require('../../utils/logger')
      log('login', { wechatId: wechatId.trim() })

      // Check force re-login
      if (result.forceReLogin && result.data.permissionsUpdatedAt) {
        wx.setStorageSync('permissionsUpdatedAt', result.data.permissionsUpdatedAt)
      }

      wx.vibrateShort({ type: 'light' })
      wx.switchTab({ url: '/pages/index/index' })

    } catch (err) {
      const { handleCloudError } = require('../../utils/error-handler')
      handleCloudError(err, '登录')
      this.shakeCard()
    } finally {
      this.setData({ loading: false })
    }
  },

  shakeCard() {
    this.setData({ shakeAnimation: true })
    setTimeout(() => this.setData({ shakeAnimation: false }), 500)
  }
})
