const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { validateAmount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { checkPermission, ACTIONS, hasPermission } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    isEdit: false,
    id: '',
    item: '',
    amount: '',
    category: 'meat',
    date: '',
    remark: '',
    submitting: false,
    showDeleteModal: false,
    errors: {},
    recentReservations: [],
    pickerItems: [],
    pickerIndex: -1,
    selectedReservation: null,
    sourceReservationId: '',
    categoryOptions: [
      { value: 'meat', label: '肉类' },
      { value: 'seafood', label: '海鲜' },
      { value: 'vegetable', label: '蔬菜' },
      { value: 'fruit', label: '水果' },
      { value: 'drink', label: '饮品' },
      { value: 'seasoning', label: '调味品' },
      { value: 'supplies', label: '日用品' },
      { value: 'equipment', label: '设备' },
      { value: 'banquet', label: '宴会菜价' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad: function(options) {
    const isEdit = !!(options && options.id)
    const canEdit = isEdit ? hasPermission('purchase', ACTIONS.EDIT) : hasPermission('purchase', ACTIONS.ADD)
    if (!canEdit) {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44, theme: app.getThemePageData(), isEdit, id: options.id || '', canEdit })

    // Set today's date as default
    const today = formatDate(new Date())
    this.setData({ date: today })

    if (isEdit) {
      this.loadPurchase(options.id)
    }
  },

  async loadAvailableReservations() {
    try {
      const settingsRes = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = {}
      ;(settingsRes.data || []).forEach(s => { settings[s.key] = s.value })
      const enabledDate = settings.serviceChargeEnabledDate
      if (!enabledDate) {
        this.setData({ recentReservations: [], pickerItems: [], pickerIndex: -1 })
        return
      }
      const now = new Date()
      const todayStr = formatDate(now)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
      const startDate = enabledDate > formatDate(thirtyDaysAgo)
        ? new Date(enabledDate + 'T00:00:00') : thirtyDaysAgo
      const endDate = new Date(todayStr + 'T23:59:59')
      const _db = db.getDb()
      const _ = _db.command
      const resvRes = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(startDate).and(_.lte(endDate)),
        status: 'confirmed'
      })
      const allReservations = resvRes.data || []
      const available = []
      for (const r of allReservations) {
        const linked = await db.queryAll(COLLECTIONS.PURCHASE, {
          sourceReservationId: r._id, category: 'banquet'
        })
        if (!linked.data || linked.data.length === 0) available.push(r)
      }
      available.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const items = available.map(r =>
        formatDate(r.date) + ' ' + (r.customerName || '') + ' ' + (r.time || '') + ' ' + (r.roomName || '')
      )
      this.setData({ recentReservations: available, pickerItems: items, pickerIndex: -1, selectedReservation: null })
    } catch (err) {
      console.warn('[purchase-add] 加载可用预约失败:', err)
    }
  },

  onReservationPickerChange(e) {
    const index = e.detail.value
    const res = this.data.recentReservations[index]
    if (!res) return
    const dishPrice = Number(res.dishPrice) || 0
    this.setData({
      reservationId: res._id, selectedReservation: res, pickerIndex: index,
      amount: dishPrice > 0 ? String(dishPrice) : '',
      date: formatDate(res.date),
      remark: (res.customerName || '') + ' - ' + (res.roomName || ''),
      sourceReservationId: res._id
    })
  },

  loadPurchase: function(id) {
    const that = this
    wx.showLoading({ title: '加载中...' })

    db.getDoc(COLLECTIONS.PURCHASE, id).then(function(data) {
      wx.hideLoading()
      if (!data) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }
      that.setData({
        item: data.item || '',
        amount: data.amount !== undefined ? String(data.amount) : '',
        category: data.category || 'meat',
        date: data.date || formatDate(new Date()),
        remark: data.remark || ''
      })
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '加载采购记录')
      setTimeout(function() { wx.navigateBack() }, 1500)
    })
  },

  onItemInput: function(e) {
    this.setData({ item: e.detail.value })
    if (this.data.errors.item) {
      this.setData({ 'errors.item': '' })
    }
  },

  onAmountInput: function(e) {
    this.setData({ amount: e.detail.value })
    if (this.data.errors.amount) {
      this.setData({ 'errors.amount': '' })
    }
  },

  onDateChange: function(e) {
    this.setData({ date: e.detail.value })
    if (this.data.errors.date) {
      this.setData({ 'errors.date': '' })
    }
  },

  onCategorySelect: function(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ category: value })
    if (this.data.errors.category) {
      this.setData({ 'errors.category': '' })
    }
    if (value === 'banquet') {
      this.loadAvailableReservations()
    } else {
      this.setData({ recentReservations: [], pickerItems: [], pickerIndex: -1,
        selectedReservation: null, sourceReservationId: '' })
    }
  },

  onRemarkInput: function(e) {
    this.setData({ remark: e.detail.value })
  },

  validate: function() {
    const errors = {}

    if (!this.data.date) {
      errors.date = '请选择采购日期'
    }

    if (!this.data.category) {
      errors.category = '请选择采购分类'
    }

    const amountResult = validateAmount(this.data.amount)
    if (!amountResult.valid) errors.amount = amountResult.message

    this.setData({ errors: errors })
    return Object.keys(errors).length === 0
  },

  onSubmit: function() {
    if (this.data.submitting) return
    if (!this.validate()) return

    const that = this
    const userInfo = app.globalData.userInfo || {}

    const data = {
      item: this.data.item.trim(),
      amount: Number(this.data.amount),
      category: this.data.category,
      date: this.data.date,
      remark: this.data.remark.trim(),
      sourceReservationId: this.data.sourceReservationId || '',
      purchaseBy: userInfo._id || '',
      purchaseByName: userInfo.name || userInfo.nickName || ''
    }

    if (!data.purchaseBy) {
      delete data.purchaseBy
      delete data.purchaseByName
    }

    that.setData({ submitting: true })
    wx.showLoading({ title: that.data.isEdit ? '保存中...' : '添加中...' })

    if (that.data.isEdit) {
      if (!checkPermission('purchase', ACTIONS.EDIT)) {
        that.setData({ submitting: false })
        wx.hideLoading()
        return
      }
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, data).then(function() {
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_UPDATE, '更新采购: ' + data.item, { id: that.data.id, amount: data.amount })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function() { wx.navigateBack() }, 1500)
      }).catch(function(err) {
        that.setData({ submitting: false })
        wx.hideLoading()
        handleCloudError(err, '保存采购记录')
      })
    } else {
      if (!checkPermission('purchase', ACTIONS.ADD)) {
        that.setData({ submitting: false })
        wx.hideLoading()
        return
      }
      db.addDoc(COLLECTIONS.PURCHASE, data).then(function() {
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_CREATE, '新增采购: ' + data.item, { amount: data.amount, category: data.category })
        wx.showToast({ title: '添加成功', icon: 'success' })
        setTimeout(function() { wx.navigateBack() }, 1500)
      }).catch(function(err) {
        that.setData({ submitting: false })
        wx.hideLoading()
        handleCloudError(err, '添加采购记录')
      })
    }
  },

  onDelete: function() {
    this.setData({ showDeleteModal: true })
  },

  onDeleteConfirm: function() {
    const that = this
    this.setData({ showDeleteModal: false })

    if (!checkPermission('purchase', ACTIONS.DELETE)) return

    wx.showLoading({ title: '删除中...' })
    db.deleteDoc(COLLECTIONS.PURCHASE, that.data.id).then(function() {
      wx.hideLoading()
      log(LOG_TYPES.PURCHASE_DELETE, '删除采购: ' + that.data.item, { id: that.data.id })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(function() { wx.navigateBack() }, 1500)
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '删除采购记录')
    })
  },

  onDeleteCancel: function() {
    this.setData({ showDeleteModal: false })
  },

  onBack: function() {
    wx.navigateBack()
  }
})
