const app = getApp()
const { formatDate, formatAmount, getIncomeTypeText } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    isEdit: false,
    id: '',
    type: 'dining',
    amount: '',
    noReservation: false,
    reservationId: '',
    selectedReservation: null,
    recentReservations: [],
    remark: '',
    submitting: false,
    typeOptions: [
      { value: 'dining', label: '餐饮' },
      { value: 'chess', label: '棋牌' },
      { value: 'liquor', label: '酒水' },
      { value: 'teatime', label: '茶水' },
      { value: 'service', label: '服务' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({ theme })
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadExisting()
    }
    this.loadRecentReservations()
  },

  async loadExisting() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection(COLLECTIONS.INCOME).doc(this.data.id).get()
      const d = res.data
      this.setData({
        type: d.type || 'dining',
        amount: String(d.amount || ''),
        noReservation: !d.reservationId,
        reservationId: d.reservationId || '',
        remark: d.remark || ''
      })
    } catch (err) {
      handleCloudError(err, '加载收入')
    }
  },

  async loadRecentReservations() {
    try {
      const db = wx.cloud.database()
      const today = formatDate(new Date())
      const threeDaysAgo = formatDate(new Date(Date.now() - 3 * 86400000))
      const fourDaysLater = formatDate(new Date(Date.now() + 4 * 86400000))
      const res = await db.collection(COLLECTIONS.RESERVATION).where({
        date: db.command.gte(threeDaysAgo).and(db.command.lte(fourDaysLater)),
        status: db.command.in(['reserved', 'confirmed']),
        hasIncome: db.command.neq(true)
      }).get()
      this.setData({ recentReservations: res.data })
    } catch (err) {
      console.error('加载最近预约失败:', err)
    }
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.value })
  },

  toggleNoReservation() {
    this.setData({ noReservation: !this.data.noReservation, reservationId: '', selectedReservation: null })
  },

  onReservationSelect(e) {
    const res = e.currentTarget.dataset.res
    const estimatedAmount = (res.standard || 0) * (res.guestCount || 0)
    this.setData({
      reservationId: res._id,
      selectedReservation: res,
      amount: String(estimatedAmount)
    })
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  async onSubmit() {
    const { type, amount, noReservation, reservationId, remark } = this.data
    if (!amount || parseFloat(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const db = wx.cloud.database()
      const userInfo = app.globalData.userInfo
      const today = formatDate(new Date())

      const data = {
        type,
        amount: parseFloat(amount),
        date: today,
        source: this.data.selectedReservation ? this.data.selectedReservation.customerName : (noReservation ? '无预约' : ''),
        reservationId: noReservation ? '' : reservationId,
        remark,
        collectedBy: userInfo._id,
        collectedByName: userInfo.name,
        updatedAt: new Date()
      }

      // Sync fields from linked reservation so income-detail can display them
      if (!noReservation && reservationId && this.data.selectedReservation) {
        data.guestCount = this.data.selectedReservation.guestCount
        data.standard = this.data.selectedReservation.standard
        data.roomName = this.data.selectedReservation.roomName
      }

      if (!this.data.isEdit) {
        data.createdAt = new Date()
        await db.collection(COLLECTIONS.INCOME).add({ data })
        if (reservationId) {
          await db.collection(COLLECTIONS.RESERVATION).doc(reservationId).update({ data: { hasIncome: true } })
        }
        log('INCOME_CREATE', { type, amount: data.amount, source: data.source })
      } else {
        await db.collection(COLLECTIONS.INCOME).doc(this.data.id).update({ data })
        log('INCOME_UPDATE', { type, amount: data.amount })
      }

      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      handleCloudError(err, '保存收入')
    } finally {
      this.setData({ submitting: false })
    }
  }
})
