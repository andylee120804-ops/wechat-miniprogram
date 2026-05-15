var app = getApp()
var { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
var { log, LOG_TYPES } = require('../../utils/logger')
var { handleCloudError } = require('../../utils/error-handler')
var { checkPermission, ACTIONS, hasPermission } = require('../../utils/permission')
var { COLLECTIONS } = require('../../utils/db')
var db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    id: '',
    purchase: null,
    showDeleteModal: false,
    showRejectModal: false,
    rejectionReason: '',
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canReimburse: false,
    isSubmitter: false,
    isApprover: false,
    approvalLogs: []
  },

  onLoad: function(options) {
    var sysInfo = wx.getWindowInfo()
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
      canDelete: hasPermission('purchase', ACTIONS.DELETE),
      canApprove: hasPermission('purchase', ACTIONS.APPROVE),
      canReimburse: hasPermission('purchase', ACTIONS.REIMBURSE)
    })
    if (this.data.id) this.loadPurchase(this.data.id)
  },

  loadPurchase: function(id) {
    var that = this
    that.setData({ loading: true })

    db.getDoc(COLLECTIONS.PURCHASE, id).then(function(data) {
      if (!data) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      var userInfo = app.globalData.userInfo || {}
      var currentUserId = userInfo._id || ''
      var status = data.status || 'reimbursed'
      var purchaseBy = data.purchaseBy || ''
      var approverId = data.approverId || ''
      var isSubmitter = purchaseBy === currentUserId
      var canApprove = hasPermission('purchase', ACTIONS.APPROVE)
      var isApprover = canApprove && approverId === currentUserId && !isSubmitter

      var purchase = {
        ...data,
        status: status,
        categoryName: getCategoryName(data.category),
        formattedAmount: formatAmount(data.amount),
        formattedDate: formatDate(data.date),
        formattedCreatedAt: formatDate(data.createdAt),
        formattedApprovedAt: data.approvedAt ? formatDate(data.approvedAt) : '',
        formattedRejectedAt: data.rejectedAt ? formatDate(data.rejectedAt) : '',
        formattedReimbursedAt: data.reimbursedAt ? formatDate(data.reimbursedAt) : ''
      }

      // Only submitters can edit pending or rejected records
      var canEdit = isSubmitter && (status === 'pending' || status === 'rejected')
      // Only submitters can delete pending records
      var canDelete = isSubmitter && status === 'pending'

      that.setData({
        purchase: purchase,
        loading: false,
        canEdit: canEdit,
        canDelete: canDelete,
        canApprove: canApprove,
        isSubmitter: isSubmitter,
        isApprover: isApprover
      })

      // Load approval logs
      that.loadApprovalLogs(id)
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购详情')
    })
  },

  loadApprovalLogs: function(purchaseId) {
    var that = this
    db.queryAll(COLLECTIONS.APPROVAL_LOG, { purchaseId: purchaseId }, 'createdAt', 'asc').then(function(result) {
      var logs = (result.data || []).map(function(item) {
        return {
          ...item,
          formattedTime: formatDate(item.createdAt)
        }
      })
      that.setData({ approvalLogs: logs })
    }).catch(function(err) {
      console.warn('加载审批日志失败:', err)
    })
  },

  onApprove: async function() {
    var that = this
    var userInfo = app.globalData.userInfo || {}
    var purchase = that.data.purchase
    if (!purchase) return

    // Self-approval guard
    if (userInfo._id === purchase.purchaseBy) {
      wx.showToast({ title: '不能审批自己的采购单', icon: 'none' })
      return
    }

    wx.showLoading({ title: '审批中...' })

    // Re-fetch to verify current status hasn't changed
    var currentDoc = await db.getDoc(COLLECTIONS.PURCHASE, that.data.id)
    if (!currentDoc) {
      wx.hideLoading()
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }
    if (currentDoc.status !== 'pending') {
      wx.hideLoading()
      wx.showToast({ title: '状态已变更，请刷新', icon: 'none' })
      that.loadPurchase(that.data.id)
      return
    }

    var now = new Date()
    db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'approved',
      approvedAt: now,
      approverId: userInfo._id || '',
      approverName: userInfo.name || ''
    }).then(function() {
      // Write approval log
      return db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'approved',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: '',
        createdAt: now
      })
    }).then(function() {
      wx.hideLoading()
      log(LOG_TYPES.PURCHASE_UPDATE, '审批通过: ' + (purchase.item || ''), { id: that.data.id })
      wx.showToast({ title: '已通过', icon: 'success' })
      that.loadPurchase(that.data.id)
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '审批采购')
    })
  },

  onShowReject: function() {
    this.setData({ showRejectModal: true, rejectionReason: '' })
  },

  onRejectionReasonInput: function(e) {
    this.setData({ rejectionReason: e.detail.value || '' })
  },

  onRejectConfirm: async function() {
    var that = this
    var reason = that.data.rejectionReason || ''
    if (!reason.trim()) {
      wx.showToast({ title: '请输入拒绝原因', icon: 'none' })
      return
    }

    that.setData({ showRejectModal: false })

    var userInfo = app.globalData.userInfo || {}
    var purchase = that.data.purchase
    if (!purchase) return

    wx.showLoading({ title: '处理中...' })

    // Re-fetch to verify current status hasn't changed
    var currentDoc = await db.getDoc(COLLECTIONS.PURCHASE, that.data.id)
    if (!currentDoc) {
      wx.hideLoading()
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }
    if (currentDoc.status !== 'pending') {
      wx.hideLoading()
      wx.showToast({ title: '状态已变更，请刷新', icon: 'none' })
      that.loadPurchase(that.data.id)
      return
    }

    var now = new Date()
    db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'rejected',
      rejectionReason: reason.trim(),
      rejectedAt: now,
      approverId: userInfo._id || '',
      approverName: userInfo.name || ''
    }).then(function() {
      // Write rejection log
      return db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'rejected',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: reason.trim(),
        createdAt: now
      })
    }).then(function() {
      wx.hideLoading()
      log(LOG_TYPES.PURCHASE_UPDATE, '审批拒绝: ' + (purchase.item || ''), { id: that.data.id, reason: reason.trim() })
      wx.showToast({ title: '已拒绝', icon: 'success' })
      that.loadPurchase(that.data.id)
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '拒绝采购')
    })
  },

  onRejectCancel: function() {
    this.setData({ showRejectModal: false, rejectionReason: '' })
  },

  onReimburse: async function() {
    var that = this
    var userInfo = app.globalData.userInfo || {}
    var purchase = that.data.purchase
    if (!purchase) return

    if (!hasPermission('purchase', ACTIONS.REIMBURSE)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }

    wx.showLoading({ title: '确认报销中...' })

    // Re-fetch to verify current status hasn't changed
    var currentDoc = await db.getDoc(COLLECTIONS.PURCHASE, that.data.id)
    if (!currentDoc) {
      wx.hideLoading()
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }
    if (currentDoc.status !== 'approved') {
      wx.hideLoading()
      wx.showToast({ title: '状态已变更，请刷新', icon: 'none' })
      that.loadPurchase(that.data.id)
      return
    }

    var now = new Date()
    db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
      status: 'reimbursed',
      reimbursedAt: now,
      reimburserId: userInfo._id || '',
      reimburserName: userInfo.name || ''
    }).then(function() {
      // Write reimbursement log
      return db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'reimbursed',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: '',
        createdAt: now
      })
    }).then(function() {
      wx.hideLoading()
      log(LOG_TYPES.PURCHASE_UPDATE, '确认报销: ' + (purchase.item || ''), { id: that.data.id })
      wx.showToast({ title: '已确认报销', icon: 'success' })
      that.loadPurchase(that.data.id)
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '确认报销')
    })
  },

  onResubmit: function() {
    wx.navigateTo({ url: '/pages/purchase-add/index?id=' + this.data.id })
  },

  onEdit: function() {
    if (!this.data.canEdit) return
    wx.navigateTo({ url: '/pages/purchase-add/index?id=' + this.data.id })
  },

  onDelete: function() {
    this.setData({ showDeleteModal: true })
  },

  onDeleteConfirm: function() {
    var that = this
    this.setData({ showDeleteModal: false })

    if (!this.data.canDelete) {
      wx.showToast({ title: '仅可删除待审批记录', icon: 'none' })
      return
    }

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
