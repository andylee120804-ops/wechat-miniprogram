var app = getApp()
var { formatDate, formatDateTime, formatAmount, getCategoryName } = require('../../utils/helpers')
var { log, LOG_TYPES } = require('../../utils/logger')
var { handleCloudError } = require('../../utils/error-handler')
var { ACTIONS, hasPermission } = require('../../utils/permission')
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
    isReimburser: false,
    defaultReimburserName: '',
    approvalLogs: [],
    approvalStep: { badge: '', badgeBg: '', text: '', time: '' },
    reimburseStep: { badge: '', badgeBg: '', text: '', time: '' },
    uploadingReceipt: false
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

  loadPurchase: async function(id) {
    var that = this
    that.setData({ loading: true })

    db.getDoc(COLLECTIONS.PURCHASE, id).then(async function(data) {
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
      var canApprovePerm = hasPermission('purchase', ACTIONS.APPROVE)
      var isApprover = canApprovePerm && approverId === currentUserId && !isSubmitter
      var canReimbursePerm = hasPermission('purchase', ACTIONS.REIMBURSE)

      // Load approval settings (with cache, 5min TTL)
      var isReimburser = false
      var defaultReimburserName = ''
      var cacheKey = '_approvalSettingsCache'
      var cache = app.globalData[cacheKey]
      var nowMs = Date.now()
      var settings = null
      if (cache && cache.data && (nowMs - cache.time < 5 * 60 * 1000)) {
        settings = cache.data
      } else {
        try {
          var settingsRes = await wx.cloud.callFunction({
            name: 'sendMessage',
            data: { action: 'getApprovalSettings', callerWechatId: userInfo.wechatId || '' }
          })
          if (settingsRes.result && settingsRes.result.success && settingsRes.result.data) {
            settings = settingsRes.result.data
            app.globalData[cacheKey] = { data: settings, time: nowMs }
          }
        } catch (e) {
          console.warn('[purchase-detail] 获取审批设置失败:', e)
        }
      }
      if (settings) {
        isReimburser = canReimbursePerm && (settings.defaultReimburserId || '') === currentUserId
        defaultReimburserName = settings.defaultReimburserName || ''
      }

      // Final canReimburse: must have permission AND be the designated reimbuser
      var finalCanReimburse = canReimbursePerm && isReimburser

      var purchase = {
        ...data,
        receiptImages: data.receiptImages || [], // Ensure receiptImages is always an array
        status: status,
        categoryName: getCategoryName(data.category),
        formattedAmount: formatAmount(data.amount),
        formattedDate: formatDate(data.date),
        formattedCreatedAt: formatDateTime(data.createdAt),
        formattedApprovedAt: data.approvedAt ? formatDate(data.approvedAt) : '',
        formattedRejectedAt: data.rejectedAt ? formatDate(data.rejectedAt) : '',
        formattedReimbursedAt: data.reimbursedAt ? formatDate(data.reimbursedAt) : ''
      }

      // Only submitters can edit pending or rejected records
      var canEdit = isSubmitter && (status === 'pending' || status === 'rejected')
      // Submitters can delete pending or approved (not yet paid) records
      var canDelete = isSubmitter && (status === 'pending' || status === 'approved')

      that.setData({
        purchase: purchase,
        loading: false,
        canEdit: canEdit,
        canDelete: canDelete,
        canApprove: canApprovePerm,
        canReimburse: finalCanReimburse,
        isSubmitter: isSubmitter,
        isApprover: isApprover,
        isReimburser: isReimburser,
        defaultReimburserName: defaultReimburserName
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
          formattedTime: formatDateTime(item.createdAt)
        }
      })
      // Find completed actions
      var approved = logs.find(function(l) { return l.action === 'approved' })
      var rejected = logs.find(function(l) { return l.action === 'rejected' })
      var reimbursed = logs.find(function(l) { return l.action === 'reimbursed' })
      var status = (that.data.purchase || {}).status || ''

      // Step 2: approval step
      var approvalStep = { badge: '', badgeBg: '', text: '', time: '' }
      if (approved) {
        approvalStep = {
          badge: '通过', badgeBg: '#22C55E',
          text: (approved.operatorName || '') + ' 审批通过',
          time: approved.formattedTime
        }
      } else if (rejected) {
        approvalStep = {
          badge: '拒绝', badgeBg: '#EF4444',
          text: (rejected.operatorName || '') + ' 拒绝',
          time: rejected.formattedTime
        }
      } else if (status === 'pending') {
        approvalStep = {
          badge: '待审批', badgeBg: '#F59E0B',
          text: '等待审批人处理',
          time: ''
        }
      }

      // Step 3: reimburse step
      var reimburseStep = { badge: '', badgeBg: '', text: '', time: '' }
      if (reimbursed) {
        reimburseStep = {
          badge: '付款', badgeBg: '#3B82F6',
          text: (reimbursed.operatorName || '') + ' 确认付款',
          time: reimbursed.formattedTime
        }
      } else if (status === 'approved') {
        reimburseStep = {
          badge: '待付款', badgeBg: '#8B5CF6',
          text: '等待付款人确认付款',
          time: ''
        }
      }

      that.setData({ approvalLogs: logs, approvalStep: approvalStep, reimburseStep: reimburseStep })
    }).catch(function(err) {
      console.warn('加载审批日志失败:', err)
    })
  },

  onPreviewReceiptImage: function(e) {
    var index = e.currentTarget.dataset.index
    var images = this.data.purchase.receiptImages || []
    var urls = images.map(function(img) { return img.fileID })
    if (urls.length === 0) return
    wx.previewImage({
      current: urls[index] || urls[0],
      urls: urls
    })
  },

  onAddReceiptImage: function() {
    var that = this
    if (this.data.uploadingReceipt) return
    var currentImages = this.data.purchase.receiptImages || []
    var remaining = 3 - currentImages.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function(res) {
        var files = res.tempFiles || []
        that.uploadReceiptFiles(files)
      }
    })
  },

  uploadReceiptFiles: function(files) {
    var that = this
    if (!files || files.length === 0) return
    var purchaseId = that.data.id

    that.setData({ uploadingReceipt: true })
    wx.showLoading({ title: '上传中' })

    var uploadPromises = files.map(function(file, index) {
      var ext = file.tempFilePath.match(/\.\w+$/)
      var extStr = ext ? ext[0] : '.jpg'
      var cloudPath = 'purchase-receipts/' + purchaseId + '_' + Date.now() + '_' + index + extStr

      return new Promise(function(resolve, reject) {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: file.tempFilePath,
          success: function(uploadRes) {
            var userInfo = app.globalData.userInfo || {}
            resolve({
              fileID: uploadRes.fileID,
              uploadedAt: new Date(),
              uploadedBy: userInfo._id || ''
            })
          },
          fail: function(err) {
            console.warn('上传单据图片失败:', err)
            reject(err)
          }
        })
      })
    })

    Promise.all(uploadPromises).then(function(results) {
      var currentImages = that.data.purchase.receiptImages || []
      var newImages = currentImages.concat(results).slice(0, 3)

      return db.updateDoc(COLLECTIONS.PURCHASE, purchaseId, {
        receiptImages: newImages
      }).then(function() {
        that.setData({
          'purchase.receiptImages': newImages,
          uploadingReceipt: false
        })
        wx.hideLoading()
        wx.showToast({ title: '上传成功', icon: 'success' })
      })
    }).catch(function(err) {
      that.setData({ uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
      console.warn('上传单据图片失败:', err)
    })
  },

  onRemoveReceiptImage: function(e) {
    var that = this
    var index = e.currentTarget.dataset.index
    var currentImages = this.data.purchase.receiptImages || []
    var removed = currentImages[index]
    if (!removed) return

    wx.showModal({
      title: '删除确认',
      content: '确定删除该单据照片吗？',
      confirmColor: '#F87171',
      success: function(res) {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })

        var latestImages = that.data.purchase.receiptImages || []
        var newImages = latestImages.filter(function(_, i) { return i !== index })
        var removedFileID = (latestImages[index] || {}).fileID

        db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
          receiptImages: newImages
        }).then(function() {
          that.setData({ 'purchase.receiptImages': newImages })
          if (removedFileID) {
            wx.cloud.deleteFile({ fileList: [removedFileID] }).catch(function(e) {
              console.warn('删除云存储图片失败:', e)
            })
          }
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function(err) {
          wx.hideLoading()
          handleCloudError(err, '删除单据照片')
        })
      }
    })
  },

  onApprove: async function() {
    var that = this
    var userInfo = app.globalData.userInfo || {}
    var purchase = that.data.purchase
    if (!purchase) return

    // Verify current user is the designated approver (isApprover already excludes submitters)
    if (!that.data.isApprover) {
      wx.showToast({ title: '您不是指定审批人，无法操作', icon: 'none' })
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
    Promise.all([
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
        status: 'approved',
        approvedAt: now,
        approverId: userInfo._id || '',
        approverName: userInfo.name || ''
      }),
      db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'approved',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: '',
        createdAt: now
      })
    ]).then(function() {
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

    // Verify current user is the designated approver
    if (!that.data.isApprover) {
      wx.showToast({ title: '您不是指定审批人，无法操作', icon: 'none' })
      that.setData({ showRejectModal: false })
      return
    }

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
    Promise.all([
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: now,
        approverId: userInfo._id || '',
        approverName: userInfo.name || ''
      }),
      db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'rejected',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: reason.trim(),
        createdAt: now
      })
    ]).then(function() {
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

    // Verify current user is the designated reimbuser (isReimburser already checks permission)
    if (!that.data.isReimburser) {
      wx.showToast({ title: '您不是指定付款人，无法操作', icon: 'none' })
      return
    }

    wx.showLoading({ title: '确认付款中...' })

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
    Promise.all([
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
        status: 'reimbursed',
        reimbursedAt: now,
        reimburserId: userInfo._id || '',
        reimburserName: userInfo.name || ''
      }),
      db.addDoc(COLLECTIONS.APPROVAL_LOG, {
        purchaseId: that.data.id,
        action: 'reimbursed',
        operatorId: userInfo._id || '',
        operatorName: userInfo.name || '',
        remark: '',
        createdAt: now
      })
    ]).then(function() {
      wx.hideLoading()
      log(LOG_TYPES.PURCHASE_UPDATE, '确认付款: ' + (purchase.item || ''), { id: that.data.id })
      wx.showToast({ title: '已确认付款', icon: 'success' })
      that.loadPurchase(that.data.id)
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '确认付款')
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
      wx.showToast({ title: '无删除权限', icon: 'none' })
      return
    }

    wx.showLoading({ title: '删除中...' })
    db.deleteDoc(COLLECTIONS.PURCHASE, that.data.id).then(function() {
      // Clean up receipt images from cloud storage
      var receiptImages = that.data.purchase.receiptImages || []
      var fileIDs = receiptImages.map(function(img) { return img.fileID }).filter(Boolean)
      if (fileIDs.length > 0) {
        wx.cloud.deleteFile({ fileList: fileIDs }).catch(function(e) {
          console.warn('清理云存储单据图片失败:', e)
        })
      }
      // Clean up associated approval logs
      db.queryAll(COLLECTIONS.APPROVAL_LOG, { purchaseId: that.data.id }).then(function(res) {
        var logs = res.data || []
        var deletePromises = logs.map(function(l) { return db.deleteDoc(COLLECTIONS.APPROVAL_LOG, l._id) })
        return Promise.all(deletePromises)
      }).catch(function(e) {
        console.warn('清理审批日志失败:', e)
      })
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
