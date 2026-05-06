const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { log } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    isEdit: false,
    id: '',
    canEdit: false,
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

  async onLoad(options) {
    const isEdit = !!(options && options.id)
    const canEdit = isEdit ? hasPermission('income', ACTIONS.EDIT) : hasPermission('income', ACTIONS.ADD)
    if (!canEdit) {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    const today = formatDate(new Date())
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, date: today, isEdit, canEdit, id: options.id || '' })
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      await this.loadExisting()
    }
    this.loadRecentReservations()
  },

  async loadExisting() {
    try {
      const d = await db.getDoc(COLLECTIONS.INCOME, this.data.id)
      if (!d) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const noReservation = !d.reservationId
      let selectedReservation = null
      let pickerIndex = -1
      if (!noReservation) {
        try {
          selectedReservation = await db.getDoc(COLLECTIONS.RESERVATION, d.reservationId)
        } catch (e) {
          console.warn('[IncomeAdd] 加载关联预约失败:', e)
        }
      }
      this.setData({
        type: d.type || 'dining',
        amount: String(d.amount || ''),
        date: d.date || formatDate(new Date()),
        noReservation,
        reservationId: d.reservationId || '',
        remark: d.remark || '',
        selectedReservation,
        pickerIndex
      })
    } catch (err) {
      handleCloudError(err, '加载收入')
    }
  },

  async loadRecentReservations() {
    try {
      const that = this
      const now = new Date()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

      const results = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: db.getDb().command.gte(thirtyDaysAgo).and(db.getDb().command.lte(todayEnd)),
        status: db.getDb().command.in(['reserved', 'confirmed'])
      })

      const allReservations = results.data || []
      const currentReservationId = that.data.reservationId
      // Filter out reservations linked to other income records, but keep the current one
      const available = allReservations.filter(function(r) {
        return r.hasIncome !== true || r._id === currentReservationId
      })

      // Sort by date descending
      available.sort(function(a, b) { return (b.date || 0) - (a.date || 0) })

      // Build picker items
      const items = available.map(function(r) {
        const dateStr = formatDate(r.date)
        const parts = dateStr.split('-')
        const month = parseInt(parts[1]) || 0
        const day = parseInt(parts[2]) || 0
        const room = r.roomName || (r.room === 'big' ? '大包厢' : '小包厢')
        return month + '月' + day + '日：' + (r.time || '') + ' ' + (r.customerName || '') + ' ' + room
      })

      // In edit mode, find the index of the currently linked reservation
      let pickerIndex = -1
      if (currentReservationId) {
        pickerIndex = available.findIndex(function(r) { return r._id === currentReservationId })
        if (pickerIndex >= 0 && that.data.selectedReservation) {
          // Use the full reservation data from the list
          that.setData({ selectedReservation: available[pickerIndex] })
        }
      }

      that.setData({ recentReservations: available, pickerItems: items, pickerIndex })
    } catch (err) {
      console.warn('[IncomeAdd] 加载最近预约失败:', err)
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

  getMinAmountKey(reservation) {
    const et = reservation.exclusiveType || (reservation.isExclusive ? 'full' : 'none')
    const roomKey = et !== 'none' ? et : 'room'
    return 'min_amount_' + roomKey
  },

  async getMinAmountForReservation(reservation) {
    if (!reservation) return null
    // 合作方简餐（standard=300，未选正餐）不检查最低消费
    if (reservation.isPartner && reservation.standard === 300) return null
    const key = this.getMinAmountKey(reservation)
    const minAmount = await this.getMinAmount(key)
    return minAmount || null
  },

  async onSubmit() {
    const { type, amount, date, noReservation, reservationId, remark } = this.data
    if (!amount || parseFloat(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    // 关联预约时检查金额是否满足最低消费，不足则自动调整
    if (!noReservation && reservationId && this.data.selectedReservation) {
      const minAmount = await this.getMinAmountForReservation(this.data.selectedReservation)
      if (minAmount && parseFloat(amount) < minAmount) {
        this.setData({ amount: String(minAmount) })
        wx.showToast({ title: '已按最低消费 ¥' + minAmount + ' 计算', icon: 'none' })
      }
    }

    this.setData({ submitting: true })
    try {
      const userInfo = app.globalData.userInfo

      const data = {
        type,
        amount: parseFloat(amount),
        date: date,
        source: this.data.selectedReservation ? this.data.selectedReservation.customerName : (noReservation ? '无预约' : ''),
        reservationId: noReservation ? '' : reservationId,
        remark,
        collectedBy: userInfo._id,
        collectedByName: userInfo.name
      }

      // Sync fields from linked reservation so income-detail can display them
      if (!noReservation && reservationId && this.data.selectedReservation) {
        data.guestCount = this.data.selectedReservation.guestCount
        data.standard = this.data.selectedReservation.standard
        data.roomName = this.data.selectedReservation.roomName
      }

      if (!this.data.isEdit) {
        await db.addDoc(COLLECTIONS.INCOME, data)
        if (reservationId) {
          await db.updateDoc(COLLECTIONS.RESERVATION, reservationId, { hasIncome: true })
        }
        log('INCOME_CREATE', { type, amount: data.amount, source: data.source })
      } else {
        await db.updateDoc(COLLECTIONS.INCOME, this.data.id, data)
        log('INCOME_UPDATE', { type, amount: data.amount })
      }

      wx.showToast({ title: '保存成功', icon: 'success' })
      // 成功后不重置 submitting，保持按钮禁用直到页面返回
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      this.setData({ submitting: false })
      handleCloudError(err, '保存收入')
    }
  }
})
