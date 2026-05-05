const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    venueName: '',
    venueAddress: '',
    venueLatitude: '',
    venueLongitude: '',
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
          venueName: res.result.data.venueName || '',
          venueAddress: res.result.data.venueAddress || '',
          venueLatitude: res.result.data.venueLatitude || '',
          venueLongitude: res.result.data.venueLongitude || ''
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

  onPickLocation() {
    const that = this
    // Step 1: check current permission status
    wx.getSetting({
      success(settingRes) {
        const locationAuth = settingRes.authSetting['scope.userLocation']
        if (locationAuth === false) {
          // User previously denied — guide to settings
          wx.showModal({
            title: '需要位置权限',
            content: '您之前拒绝了位置权限，请在设置中手动开启',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting({
                  success(openRes) {
                    if (openRes.authSetting['scope.userLocation']) {
                      that._doChooseLocation()
                    }
                  }
                })
              }
            }
          })
        } else {
          // Not yet authorized or already authorized — try directly
          that._doChooseLocation()
        }
      },
      fail() {
        // getSetting failed, try chooseLocation directly
        that._doChooseLocation()
      }
    })
  },

  _doChooseLocation() {
    const that = this
    wx.chooseLocation({
      latitude: that.data.venueLatitude ? Number(that.data.venueLatitude) : undefined,
      longitude: that.data.venueLongitude ? Number(that.data.venueLongitude) : undefined,
      success(res) {
        that.setData({
          venueLatitude: String(res.latitude),
          venueLongitude: String(res.longitude),
          venueAddress: res.address || res.name || that.data.venueAddress
        })
      },
      fail(err) {
        const msg = err.errMsg || ''
        if (msg.indexOf('cancel') !== -1) return
        if (msg.indexOf('auth deny') !== -1 || msg.indexOf('authorize') !== -1) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中允许使用位置信息后重试',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '请先在工具栏设置模拟位置', icon: 'none', duration: 3000 })
        }
      }
    })
  },

  async onSave() {
    if (this.data.saving) return
    const { venueName, venueAddress, venueLatitude, venueLongitude } = this.data
    if (!venueName.trim()) {
      wx.showToast({ title: '请输入食堂名称', icon: 'none' })
      return
    }
    if (!venueAddress.trim()) {
      wx.showToast({ title: '请输入食堂地址', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateSettings',
          venueName: venueName.trim(),
          venueAddress: venueAddress.trim(),
          venueLatitude: venueLatitude.trim(),
          venueLongitude: venueLongitude.trim()
        }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        // 同步更新到全局
        app.globalData.venueName = venueName.trim()
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
