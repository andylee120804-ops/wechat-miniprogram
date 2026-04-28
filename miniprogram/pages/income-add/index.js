const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { log } = require('../../utils/logger')
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
    pickerIndex: -1,
    pickerItems: [],
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
    } catch (err) { console.error('[IncomeAdd] 获取最低消费失败:', err) }
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
      var now = new Date()
      var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      var thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

      var results = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: db.getDb().command.gte(thirtyDaysAgo).and(db.getDb().command.lte(todayEnd)),
        status: db.getDb().command.in(['reserved', 'confirmed'])
      })

      // Filter out reservations already linked to income (hasIncome === true)
      var allReservations = results.data || []
      var available = allReservations.filter(function(r) { return r.hasIncome !== true })

      // Sort by date descending
      available.sort(function(a, b) { return (b.date || 0) - (a.date || 0) })

      // Build picker items: "M月D日：time customerName roomName"
      var items = available.map(function(r) {
        var dateStr = formatDate(r.date)
        var parts = dateStr.split('-')
        var month = parseInt(parts[1]) || 0
        var day = parseInt(parts[2]) || 0
        var room = r.roomName || (r.room === 'big' ? '大包厢' : '小包厢')
        return month + '月' + day + '日：' + (r.time || '') + ' ' + (r.customerName || '') + ' ' + room
      })

      that.setData({ recentReservations: available, pickerItems: items, pickerIndex: -1 })
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
    this.setData({ noReservation: !this.data.noReservation, reservationId: '', selectedReservation: null, pickerIndex: -1 })
  },

  onReservationPickerChange(e) {
    const index = e.detail.value
    const res = this.data.recentReservations[index]
    if (!res) return

    // Calculate with partner discount
    let unitPrice = res.standard || 0
    if (res.isPartner && unitPrice > 300) {
      unitPrice = unitPrice * 0.8
    }
    let estimatedAmount = Math.round(unitPrice * (res.guestCount || 0))

    // Check minimum amount and auto-adjust
    this.calculateFinalAmount(res, estimatedAmount, index)
  },

  async calculateFinalAmount(res, estimatedAmount, index) {
    // Partner-only pricing (standard=300, no meal price selected) — skip minimum amount
    if (res.isPartner && res.standard === 300) {
      this.setData({
        reservationId: res._id,
        selectedReservation: res,
        pickerIndex: index,
        amount: String(estimatedAmount)
      })
      return
    }

    const et = res.exclusiveType || (res.isExclusive ? 'full' : 'none')
    const roomKey = et !== 'none' ? et : 'room'
    const key = 'min_amount_' + roomKey
    const minAmount = await this.getMinAmount(key)

    let finalAmount = estimatedAmount
    if (minAmount && estimatedAmount < minAmount) {
      finalAmount = minAmount
      wx.showToast({ title: '已按最低消费 ¥' + minAmount + ' 计算', icon: 'none' })
    }

    this.setData({
      reservationId: res._id,
      selectedReservation: res,
      pickerIndex: index,
      amount: String(finalAmount)
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

      // 最低消费已在选择预约时自动计算，无需重复校验

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
