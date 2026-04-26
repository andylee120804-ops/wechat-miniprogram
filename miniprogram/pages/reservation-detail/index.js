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
    showCancelModal: false
  },

  onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, id: options.id })
    this.loadData()
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      const res = await db.getDoc(COLLECTIONS.RESERVATION, this.data.id)
      if (!res) {
        wx.showToast({ title: '预约不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      res.statusText = getReservationStatusText(res.status)
      res.dateDisplay = formatDate(res.date)
      res.roomNameDisplay = res.isExclusive ? '包场' : getRoomName(res.room)

      this.setData({
        reservation: res,
        loading: false
      })
    } catch (err) {
      handleCloudError(err, '加载预约详情')
      this.setData({ loading: false })
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
  }
})