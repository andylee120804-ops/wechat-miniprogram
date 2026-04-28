const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { validateRequired, validateAmount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { checkPermission } = require('../../utils/permission')
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
    categoryOptions: [
      { value: 'meat', label: '肉类' },
      { value: 'seafood', label: '海鲜' },
      { value: 'vegetable', label: '蔬菜' },
      { value: 'fruit', label: '水果' },
      { value: 'drink', label: '饮品' },
      { value: 'seasoning', label: '调味品' },
      { value: 'supplies', label: '日用品' },
      { value: 'equipment', label: '设备' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad: function(options) {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.setData({ theme: app.getThemePageData() })

    // Set today's date as default
    var today = formatDate(new Date())
    this.setData({ date: today })

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadPurchase(options.id)
    }
  },

  loadPurchase: function(id) {
    var that = this
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
  },

  onCategorySelect: function(e) {
    var value = e.currentTarget.dataset.value
    this.setData({ category: value })
  },

  onRemarkInput: function(e) {
    this.setData({ remark: e.detail.value })
  },

  validate: function() {
    var errors = {}
    var itemResult = validateRequired(this.data.item, '物品名称')
    if (!itemResult.valid) errors.item = itemResult.message

    var amountResult = validateAmount(this.data.amount)
    if (!amountResult.valid) errors.amount = amountResult.message

    this.setData({ errors: errors })
    return Object.keys(errors).length === 0
  },

  onSubmit: function() {
    if (this.data.submitting) return
    if (!this.validate()) return

    var that = this
    var userInfo = app.globalData.userInfo || {}

    var data = {
      item: this.data.item.trim(),
      amount: Number(this.data.amount),
      category: this.data.category,
      date: this.data.date,
      remark: this.data.remark.trim(),
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
      if (!checkPermission('purchase', 'edit')) {
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
      if (!checkPermission('purchase', 'add')) {
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
    var that = this
    this.setData({ showDeleteModal: false })

    if (!checkPermission('purchase', 'delete')) return

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
