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
    var that = this
    wx.authorize({
      scope: 'scope.userLocation',
      success() {
        wx.chooseLocation({
          success(res) {
            that.setData({
              venueLatitude: String(res.latitude),
              venueLongitude: String(res.longitude),
              venueAddress: res.address || that.data.venueAddress
            })
          },
          fail() {
            wx.showToast({ title: '取消选择', icon: 'none' })
          }
        })
      },
      fail() {
        wx.showModal({
          title: '需要位置权限',
          content: '请先在开发者工具顶部模拟器工具栏点击「📍定位」按钮，设置一个模拟位置后再试',
          showCancel: false
        })
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
