const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    venueName: '',
    venueAddress: '',
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
          venueName: res.result.data.venueName,
          venueAddress: res.result.data.venueAddress
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

  async onSave() {
    if (this.data.saving) return
    const { venueName, venueAddress } = this.data
    if (!venueName.trim()) {
      wx.showToast({ title: '请输入会所名称', icon: 'none' })
      return
    }
    if (!venueAddress.trim()) {
      wx.showToast({ title: '请输入会所地址', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'updateSettings', venueName: venueName.trim(), venueAddress: venueAddress.trim() }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
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
