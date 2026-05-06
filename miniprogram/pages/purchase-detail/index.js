const app = getApp()
const { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { checkPermission, ACTIONS, hasPermission } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    id: '',
    purchase: null,
    showDeleteModal: false,
    canEdit: false,
    canDelete: false
  },

  onLoad: function(options) {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.setData({ theme: app.getThemePageData() })
    if (options.id) {
      this.setData({ id: options.id })
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
    }
  },

  onShow: function() {
    this.setData({
      canEdit: hasPermission('purchase', ACTIONS.EDIT),
      canDelete: hasPermission('purchase', ACTIONS.DELETE)
    })
    if (this.data.id) this.loadPurchase(this.data.id)
  },

  loadPurchase: function(id) {
    const that = this
    that.setData({ loading: true })

    db.getDoc(COLLECTIONS.PURCHASE, id).then(function(data) {
      if (!data) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      const purchase = {
        ...data,
        categoryName: getCategoryName(data.category),
        formattedAmount: formatAmount(data.amount),
        formattedDate: formatDate(data.date),
        formattedCreatedAt: formatDate(data.createdAt)
      }

      that.setData({
        purchase: purchase,
        loading: false,
        canEdit: hasPermission('purchase', ACTIONS.EDIT),
        canDelete: hasPermission('purchase', ACTIONS.DELETE)
      })
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购详情')
    })
  },

  onEdit: function() {
    if (!checkPermission('purchase', ACTIONS.EDIT)) return
    wx.navigateTo({ url: '/pages/purchase-add/index?id=' + this.data.id })
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
      log(LOG_TYPES.PURCHASE_DELETE, '删除采购: ' + (that.data.purchase ? that.data.purchase.item : ''), { id: that.data.id })
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
