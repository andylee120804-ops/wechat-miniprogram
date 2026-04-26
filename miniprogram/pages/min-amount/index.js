const app = getApp()
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    min_big: '',
    min_small: '',
    min_noon: '',
    min_night: '',
    min_full: ''
  },

  onLoad() {
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44
    })
    this.checkPermission()
    this.loadSettings()
  },

  checkPermission() {
    const userInfo = app.globalData.userInfo || {}
    if (userInfo.role !== 'boss') {
      wx.showToast({ title: '仅老板可访问', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async loadSettings() {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = res.data || []
      const data = {}
      settings.forEach(s => {
        if (s.key === 'min_amount_big') data.min_big = String(s.value || '')
        if (s.key === 'min_amount_small') data.min_small = String(s.value || '')
        if (s.key === 'min_amount_noon') data.min_noon = String(s.value || '')
        if (s.key === 'min_amount_night') data.min_night = String(s.value || '')
        if (s.key === 'min_amount_full') data.min_full = String(s.value || '')
      })
      this.setData(data)
    } catch (err) {
      console.error('加载设置失败', err)
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onBigInput(e) { this.setData({ min_big: e.detail.value }) },
  onSmallInput(e) { this.setData({ min_small: e.detail.value }) },
  onNoonInput(e) { this.setData({ min_noon: e.detail.value }) },
  onNightInput(e) { this.setData({ min_night: e.detail.value }) },
  onFullInput(e) { this.setData({ min_full: e.detail.value }) },

  async onSave() {
    wx.showLoading({ title: '保存中' })
    try {
      const items = [
        { key: 'min_amount_big', value: parseFloat(this.data.min_big) || 0 },
        { key: 'min_amount_small', value: parseFloat(this.data.min_small) || 0 },
        { key: 'min_amount_noon', value: parseFloat(this.data.min_noon) || 0 },
        { key: 'min_amount_night', value: parseFloat(this.data.min_night) || 0 },
        { key: 'min_amount_full', value: parseFloat(this.data.min_full) || 0 }
      ]

      for (const item of items) {
        const existing = await db.queryAll(COLLECTIONS.SETTINGS, { key: item.key })
        if (existing.data && existing.data.length > 0) {
          await db.updateDoc(COLLECTIONS.SETTINGS, existing.data[0]._id, { value: item.value })
        } else {
          await db.addDoc(COLLECTIONS.SETTINGS, { key: item.key, value: item.value })
        }
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})