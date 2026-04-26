const app = getApp()
const { formatDate, formatAmount, getIncomeTypeText } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    isEdit: false,
    id: '',
    type: 'dining',
    amount: '',
    date: '',
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

  async getMinAmount(key) {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, { key })
      if (res.data && res.data.length > 0) {
        return res.data[0].value
      }
    } catch (err) {}
    return null
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    const today = formatDate(new Date())
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, date: today })
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadExisting()
    }
    this.loadRecentReservations()
  },

  async loadExisting() {
    try {
      const dbInst = wx.cloud.database()
      const res = await dbInst.collection(COLLECTIONS.INCOME).doc(this.data.id).get()
      const d = res.data
      this.setData({
        type: d.type || 'dining',
        amount: String(d.amount || ''),
        date: d.date || formatDate(new Date()),
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
      var that = this
      var today = formatDate(new Date())
      var sevenDaysAgo = formatDate(new Date(Date.now() - 7 * 86400000))
      var sevenDaysLater = formatDate(new Date(Date.now() + 7 * 86400000))

      var results = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: db.getDb().command.gte(sevenDaysAgo).and(db.getDb().command.lte(sevenDaysLater)),
        status: db.getDb().command.in(['reserved', 'confirmed'])
      })

      // Filter out reservations already linked to income (hasIncome === true)
      var allReservations = results.data || []
      var available = allReservations.filter(function(r) { return r.hasIncome !== true })

      // Sort by date descending
      available.sort(function(a, b) { return (b.date || '').localeCompare(a.date || '') })

      that.setData({ recentReservations: available })
    } catch (err) {
      console.error('加载最近预约失败:', err)
    }
  },

  onBack() {
    wx.navigateBack()
  },

  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.value })
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
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
    const { type, amount, date, noReservation, reservationId, remark } = this.data
    if (!amount || parseFloat(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const dbInst = wx.cloud.database()
      const userInfo = app.globalData.userInfo

      const data = {
        type,
        amount: parseFloat(amount),
        date: date,
        source: this.data.selectedReservation ? this.data.selectedReservation.customerName : (noReservation ? '无预约' : ''),
        reservationId: noReservation ? '' : reservationId,
        remark,
        collectedBy: userInfo._id,
        collectedByName: userInfo.name,
        updatedAt: new Date()
      }

      // 最低消费软校验（仅关联预约时）
      if (!noReservation && reservationId && this.data.selectedReservation) {
        const et = this.data.selectedReservation.exclusiveType ||
                   (this.data.selectedReservation.isExclusive ? 'full' : 'none')
        const roomKey = et !== 'none' ? et : (this.data.selectedReservation.room || 'big')
        const key = 'min_amount_' + roomKey
        const minAmount = await this.getMinAmount(key)

        if (minAmount && parseFloat(amount) < minAmount) {
          wx.hideLoading()
          const confirm = await new Promise(resolve => {
            wx.showModal({
              title: '金额低于最低消费',
              content: `该包厢/包场最低消费为 ¥${minAmount}，当前金额 ¥${amount}，是否继续？`,
              success: res => resolve(res.confirm)
            })
          })
          if (!confirm) {
            this.setData({ submitting: false })
            return
          }
          wx.showLoading({ title: '保存中' })
        }
      }

      // Sync fields from linked reservation so income-detail can display them
      if (!noReservation && reservationId && this.data.selectedReservation) {
        data.guestCount = this.data.selectedReservation.guestCount
        data.standard = this.data.selectedReservation.standard
        data.roomName = this.data.selectedReservation.roomName
      }

      if (!this.data.isEdit) {
        data.createdAt = new Date()
        await dbInst.collection(COLLECTIONS.INCOME).add({ data })
        if (reservationId) {
          await dbInst.collection(COLLECTIONS.RESERVATION).doc(reservationId).update({ data: { hasIncome: true } })
        }
        log('INCOME_CREATE', { type, amount: data.amount, source: data.source })
      } else {
        await dbInst.collection(COLLECTIONS.INCOME).doc(this.data.id).update({ data })
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
