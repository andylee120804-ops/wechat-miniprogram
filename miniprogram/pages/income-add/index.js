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
    serviceChargeEnabled: false,
    serviceChargeEnabledDate: '',
    serviceChargeNoon: 0,
    serviceChargeNight: 0,
    showNoDishPriceModal: false,
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

  async loadServiceChargeSettings() {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = res.data || []
      const data = {}
      const seenKey = new Set()
      settings.forEach(function(s) {
        if (seenKey.has(s.key)) return
        seenKey.add(s.key)
        if (s.key === 'serviceChargeEnabled') data.serviceChargeEnabled = !!s.value
        if (s.key === 'serviceChargeEnabledDate') data.serviceChargeEnabledDate = String(s.value || '')
        if (s.key === 'serviceChargeNoon') data.serviceChargeNoon = Number(s.value) || 0
        if (s.key === 'serviceChargeNight') data.serviceChargeNight = Number(s.value) || 0
      })
      this.setData(data)
    } catch (err) {
      console.warn('[IncomeAdd] 加载服务费设置失败:', err)
    }
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
    await Promise.all([this.loadServiceChargeSettings(), this.loadRecentReservations()])
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
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
      const _db = db.getDb()
      const _ = _db.command

      const results = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(thirtyDaysAgo).and(_.lte(now)),
        status: 'confirmed'
      })

      let allReservations = results.data || []
      const currentReservationId = that.data.reservationId

      // 编辑模式：如果当前关联的预约不在列表中，单独查出来补上
      let currentRes = null
      if (currentReservationId && !allReservations.some(function(r) { return r._id === currentReservationId })) {
        try {
          currentRes = await db.getDoc(COLLECTIONS.RESERVATION, currentReservationId)
          if (currentRes) {
            // 补充 roomName 字段（数据库存的是 room: 'big'|'small'）
            if (!currentRes.roomName) {
              currentRes.roomName = currentRes.room === 'big' ? '大包厢' : '小包厢'
            }
            allReservations.unshift(currentRes)
          }
        } catch (e) {
          console.warn('[IncomeAdd] 加载当前关联预约失败:', e)
        }
      }

      // Query income collection directly to find which reservations are already linked
      const allIds = allReservations.map(function(r) { return r._id })
      let linkedIds = new Set()
      if (allIds.length > 0) {
        try {
          const incomeRes = await db.queryAll(COLLECTIONS.INCOME, {
            reservationId: _.in(allIds)
          })
          ;(incomeRes.data || []).forEach(function(i) { linkedIds.add(i.reservationId) })
        } catch (e) {
          console.warn('[IncomeAdd] 查询关联收入失败:', e)
        }
      }
      // Filter out reservations linked to other income records, but keep the current one
      const available = allReservations.filter(function(r) {
        return !linkedIds.has(r._id) || r._id === currentReservationId
      })

      // Sort by date descending (keep current reservation at top)
      available.sort(function(a, b) {
        if (a._id === currentReservationId) return -1
        if (b._id === currentReservationId) return 1
        return (b.date || 0) - (a.date || 0)
      })

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
      }
      if (pickerIndex >= 0 && !that.data.selectedReservation) {
        that.setData({ selectedReservation: available[pickerIndex] })
      }

      that.setData({ recentReservations: available, pickerItems: items, pickerIndex })
    } catch (err) {
      console.warn('[IncomeAdd] 加载最近预约失败:', err)
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/income/index' })
    }
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

    // Check whether to use new mode
    const resDateStr = formatDate(res.date)
    const useNewMode = this.data.serviceChargeEnabled
      && this.data.serviceChargeEnabledDate
      && resDateStr >= this.data.serviceChargeEnabledDate

    if (useNewMode) {
      // New mode: dishPrice + serviceCharge
      if (res.dishPrice > 0) {
        const charge = (res.time === '中午') ? this.data.serviceChargeNoon : this.data.serviceChargeNight
        const amount = res.dishPrice + charge
        this.setData({
          reservationId: res._id,
          selectedReservation: res,
          pickerIndex: index,
          amount: String(amount)
        })
      } else {
        // No dish price, prompt manual input
        this.setData({
          reservationId: res._id,
          selectedReservation: res,
          pickerIndex: index,
          amount: '',
          showNoDishPriceModal: true
        })
      }
    } else {
      // Old mode: standard × guestCount × discount
      let unitPrice = res.standard || 0
      if (res.isPartner) {
        unitPrice = unitPrice * 0.8
      }
      let estimatedAmount = Math.round(unitPrice * (res.guestCount || 0))
      this.calculateFinalAmount(res, estimatedAmount, index)
    }
  },

  async calculateFinalAmount(res, estimatedAmount, index) {
    // Partner-only pricing — skip minimum amount
    if (res.isPartner) {
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

  onCloseNoDishPriceModal() {
    this.setData({ showNoDishPriceModal: false })
  },

  getMinAmountKey(reservation) {
    const et = reservation.exclusiveType || (reservation.isExclusive ? 'full' : 'none')
    const roomKey = et !== 'none' ? et : 'room'
    return 'min_amount_' + roomKey
  },

  async getMinAmountForReservation(reservation) {
    if (!reservation) return null
    // 合作方不检查最低消费
    if (reservation.isPartner) return null
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
    // 新模式（菜价+服务费）跳过最低消费检查
    if (!noReservation && reservationId && this.data.selectedReservation) {
      const selRes = this.data.selectedReservation
      const resDateStr = formatDate(selRes.date)
      const useNewMode = this.data.serviceChargeEnabled
        && this.data.serviceChargeEnabledDate
        && resDateStr >= this.data.serviceChargeEnabledDate

      if (!useNewMode) {
        const minAmount = await this.getMinAmountForReservation(selRes)
        if (minAmount && parseFloat(amount) < minAmount) {
          this.setData({ amount: String(minAmount) })
          wx.showToast({ title: '已按最低消费 ¥' + minAmount + ' 计算', icon: 'none' })
        }
      }
    }

    this.setData({ submitting: true })
    try {
      const userInfo = app.globalData.userInfo

      const data = {
        type,
        amount: parseFloat(this.data.amount),
        date: date,
        source: this.data.selectedReservation ? this.data.selectedReservation.customerName : (noReservation ? '无预约' : ''),
        reservationId: noReservation ? '' : reservationId,
        remark,
        collectedBy: userInfo._id,
        collectedByName: userInfo.name
      }

      // Sync fields from linked reservation so income-detail can display them
      if (!noReservation && reservationId && this.data.selectedReservation) {
        const selRes = this.data.selectedReservation
        data.guestCount = selRes.guestCount
        data.standard = selRes.standard
        data.roomName = selRes.roomName

        // Check whether new mode applies
        const resDateStr = formatDate(selRes.date)
        const useNewMode = this.data.serviceChargeEnabled
          && this.data.serviceChargeEnabledDate
          && resDateStr >= this.data.serviceChargeEnabledDate

        if (useNewMode) {
          data.calcMode = 'dishPrice'
          data.dishPrice = selRes.dishPrice || 0
          const charge = (selRes.time === '中午') ? this.data.serviceChargeNoon : this.data.serviceChargeNight
          data.serviceCharge = charge
        }
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
