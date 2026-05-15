const app = getApp()
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    min_room: '',
    min_noon: '',
    min_night: '',
    min_full: '',
    serviceChargeEnabled: false,
    serviceChargeNoon: '',
    serviceChargeNight: '',
    serviceChargeEnabledDate: ''
  },

  onLoad() {
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44
    })
    if (!this.checkPermission()) return
    this.loadSettings()
  },

  checkPermission() {
    const userInfo = app.globalData.userInfo || {}
    if (userInfo.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return false
    }
    return true
  },

  async loadSettings() {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = res.data || []
      const data = {}
      const seenKey = new Set()
      settings.forEach(s => {
        if (seenKey.has(s.key)) return
        seenKey.add(s.key)
        if (s.key === 'min_amount_room') data.min_room = String(s.value || '')
        if (s.key === 'min_amount_noon') data.min_noon = String(s.value || '')
        if (s.key === 'min_amount_night') data.min_night = String(s.value || '')
        if (s.key === 'min_amount_full') data.min_full = String(s.value || '')
        if (s.key === 'serviceChargeEnabled') data.serviceChargeEnabled = !!s.value
        if (s.key === 'serviceChargeNoon') data.serviceChargeNoon = String(s.value || '')
        if (s.key === 'serviceChargeNight') data.serviceChargeNight = String(s.value || '')
        if (s.key === 'serviceChargeEnabledDate') data.serviceChargeEnabledDate = String(s.value || '')
      })
      this.setData(data)
    } catch (err) {
      // 集合不存在时静默使用默认值
      if (err.errCode === -502005) {
        console.warn('settings 集合尚未创建，使用默认值')
        return
      }
      console.error('加载设置失败', err)
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onRoomInput(e) { this.setData({ min_room: e.detail.value }) },
  onNoonInput(e) { this.setData({ min_noon: e.detail.value }) },
  onNightInput(e) { this.setData({ min_night: e.detail.value }) },
  onFullInput(e) { this.setData({ min_full: e.detail.value }) },

  onServiceChargeSwitch(e) {
    const enabled = e.detail.value
    const updates = { serviceChargeEnabled: enabled }
    if (enabled) {
      updates.serviceChargeEnabledDate = this.formatToday()
    } else {
      updates.serviceChargeEnabledDate = ''
    }
    this.setData(updates)
  },

  onServiceChargeNoonInput(e) { this.setData({ serviceChargeNoon: e.detail.value }) },
  onServiceChargeNightInput(e) { this.setData({ serviceChargeNight: e.detail.value }) },

  formatToday() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
  },

  async onSave() {
    wx.showLoading({ title: '保存中' })
    try {
      const items = [
        { key: 'min_amount_room', value: parseFloat(this.data.min_room) || 0 },
        { key: 'min_amount_noon', value: parseFloat(this.data.min_noon) || 0 },
        { key: 'min_amount_night', value: parseFloat(this.data.min_night) || 0 },
        { key: 'min_amount_full', value: parseFloat(this.data.min_full) || 0 },
        { key: 'serviceChargeEnabled', value: this.data.serviceChargeEnabled },
        { key: 'serviceChargeEnabledDate', value: this.data.serviceChargeEnabledDate },
        { key: 'serviceChargeNoon', value: parseFloat(this.data.serviceChargeNoon) || 0 },
        { key: 'serviceChargeNight', value: parseFloat(this.data.serviceChargeNight) || 0 }
      ]

      for (const item of items) {
        const existing = await db.queryAll(COLLECTIONS.SETTINGS, { key: item.key })
        if (existing.data && existing.data.length > 0) {
          await db.updateDoc(COLLECTIONS.SETTINGS, existing.data[0]._id, { value: item.value })
          // 清理重复文档，防止旧值覆盖新值
          for (let i = 1; i < existing.data.length; i++) {
            await db.deleteDoc(COLLECTIONS.SETTINGS, existing.data[i]._id)
          }
        } else {
          await db.addDoc(COLLECTIONS.SETTINGS, { key: item.key, value: item.value })
        }
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.hideLoading()
      if (err.errCode === -502005) {
        wx.showToast({
          title: '数据表未创建，请在云开发控制台创建 settings 集合',
          icon: 'none',
          duration: 3000
        })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  }
})