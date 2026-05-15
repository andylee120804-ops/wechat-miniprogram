var app = getApp()
var { handleCloudError } = require('../../utils/error-handler')
var { hasPermission, ACTIONS } = require('../../utils/permission')
var { COLLECTIONS } = require('../../utils/db')
var { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
var db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    pendingApprovals: [],
    pendingReimbursements: []
  },

  onLoad: function () {
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function () {
    this.loadTodos()
  },

  loadTodos: async function () {
    var that = this
    that.setData({ loading: true })
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      that.setData({ loading: false })
      return
    }

    try {
      var dbInst = db.getDb()
      var _ = dbInst.command

      var approvalItems = []
      if (hasPermission('purchase', ACTIONS.APPROVE)) {
        var approvalRes = await dbInst.collection(COLLECTIONS.PURCHASE)
          .where({
            status: 'pending',
            approverId: userInfo._id,
            purchaseBy: _.neq(userInfo._id)
          })
          .orderBy('createdAt', 'desc')
          .get()
        approvalItems = approvalRes.data || []
      }

      var reimburseItems = []
      if (hasPermission('purchase', ACTIONS.REIMBURSE)) {
        var reimburseRes = await dbInst.collection(COLLECTIONS.PURCHASE)
          .where({ status: 'approved' })
          .orderBy('approvedAt', 'desc')
          .get()
        reimburseItems = reimburseRes.data || []
      }

      that.setData({
        pendingApprovals: approvalItems.map(that._formatItem),
        pendingReimbursements: reimburseItems.map(that._formatItem),
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载待办清单')
    }
  },

  _formatItem: function (item) {
    return {
      ...item,
      categoryName: getCategoryName(item.category),
      formattedAmount: formatAmount(item.amount),
      formattedDate: formatDate(item.date)
    }
  },

  onItemTap: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  },

  onBack: function () {
    wx.navigateBack()
  }
})
