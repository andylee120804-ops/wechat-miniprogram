const { formatDate, getRoomName, getReservationStatusText } = require('../../utils/helpers')
const { hasPermission } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    id: '',
    reservation: null,
    loading: true,
    showCancelModal: false,
    showShareModal: false,
    shareTitle: '',
    shareAddress: '',
    shareLatitude: '',
    shareLongitude: ''
  },

  onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, id: options.id })
    this.loadData()
  },

  onShow() {
    if (this.data.id) {
      this.loadData()
    }
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      const [res, settingsRes] = await Promise.all([
        db.getDoc(COLLECTIONS.RESERVATION, this.data.id),
        this.loadVenueSettings()
      ])
      if (!res) {
        wx.showToast({ title: '预约不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      res.statusText = getReservationStatusText(res.status)
      res.dateDisplay = formatDate(res.date)
      // exclusiveType兼容
      const et = res.exclusiveType || (res.isExclusive ? 'full' : 'none')
      res.roomNameDisplay = et === 'none' ? getRoomName(res.room) :
                           (et === 'noon' ? '包场（午）' :
                            et === 'night' ? '包场（晚）' : '包场（全体）')
      res.exclusiveType = et

      this.setData({
        reservation: res,
        loading: false
      })
    } catch (err) {
      handleCloudError(err, '加载预约详情')
      this.setData({ loading: false })
    }
  },

  async loadVenueSettings() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success) {
        this.setData({
          shareAddress: res.result.data.venueAddress || '',
          shareLatitude: res.result.data.venueLatitude || '',
          shareLongitude: res.result.data.venueLongitude || ''
        })
      }
    } catch (err) {
      // Silent fail
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onEdit() {
    if (!hasPermission('reservation', 'edit')) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/reservation-add/index?id=' + this.data.id
    })
  },

  onCancel() {
    if (!hasPermission('reservation', 'edit')) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    this.setData({ showCancelModal: true })
  },

  onCloseCancel() {
    this.setData({ showCancelModal: false })
  },

  async onConfirmCancel() {
    this.setData({ showCancelModal: false })
    try {
      wx.showLoading({ title: '处理中' })
      await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, { status: 'cancelled' })
      log(LOG_TYPES.RESERVATION_UPDATE, '取消预约: ' + (this.data.reservation.customerName || ''))
      wx.hideLoading()
      wx.showToast({ title: '已取消', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '取消预约')
    }
  },

  onShareToGuest() {
    if (!hasPermission('reservation', 'edit')) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const r = this.data.reservation
    const defaultTitle = (r.customerName || '预约') + ' · 预定信息'
    this.setData({ showShareModal: true, shareTitle: defaultTitle })
  },

  onCloseShareModal() {
    this.setData({ showShareModal: false })
  },

  onShareTitleInput(e) {
    this.setData({ shareTitle: e.detail.value })
  },

  onShareAddressInput(e) {
    this.setData({ shareAddress: e.detail.value })
  },

  // Called via bindtap before open-type="share" triggers onShareAppMessage
  onShareAndSave() {
    this.setData({ showShareModal: false })
    // Fire-and-forget: save the updated address to cloud in background
    const addr = this.data.shareAddress || ''
    const lat = this.data.shareLatitude || ''
    const lng = this.data.shareLongitude || ''
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: { action: 'getSettings' }
    }).then(settingsRes => {
      if (!settingsRes.result || !settingsRes.result.success) return
      wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateSettings',
          venueName: settingsRes.result.data.venueName || '听澜轩',
          venueAddress: addr,
          venueLatitude: lat,
          venueLongitude: lng
        }
      }).catch(() => {})
    }).catch(() => {})
  },

  onShareAppMessage() {
    var title = this.data.shareTitle || (this.data.reservation ? this.data.reservation.customerName + ' · 预定信息' : '预定信息')
    var addr = this.data.shareAddress || ''
    var lat = this.data.shareLatitude || ''
    var lng = this.data.shareLongitude || ''
    var path = '/pages/reservation-share/index?id=' + this.data.id
    path += '&title=' + encodeURIComponent(title)
    if (addr) path += '&addr=' + encodeURIComponent(addr)
    if (lat && lng) path += '&lat=' + lat + '&lng=' + lng
    return {
      title: title,
      path: path
    }
  }
})