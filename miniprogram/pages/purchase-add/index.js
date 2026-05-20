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
    category: 'banquet',
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
    approverName: '',
    receiptImages: [],
    uploadingReceipt: false,
    pendingDeleteFileIDs: [],
    categoryOptions: [
      { value: 'banquet', label: '🍽 宴会菜价' },
      { value: 'meat', label: '🥩 肉类' },
      { value: 'seafood', label: '🦐 海鲜' },
      { value: 'vegetable', label: '🥬 蔬菜' },
      { value: 'fruit', label: '🍎 水果' },
      { value: 'drink', label: '🍷 饮品' },
      { value: 'seasoning', label: '🧂 调味品' },
      { value: 'supplies', label: '🧹 日用品' },
      { value: 'equipment', label: '🔧 设备' },
      { value: 'other', label: '📦 其他' }
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
    } else {
      this.checkDefaultBanquet()
    }
    this.loadApprovalPreview()
  },

  // --- Settings 缓存：避免重复查询 ---
  async loadSettings(cached) {
    if (cached) return cached
    const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
    const settings = {}
    ;(res.data || []).forEach(s => { if (!(s.key in settings)) settings[s.key] = s.value })
    return settings
  },

  async checkDefaultBanquet() {
    try {
      const settings = await this.loadSettings()
      if (settings.serviceChargeEnabled && settings.serviceChargeEnabledDate) {
        this.setData({ category: 'banquet' })
        this.loadAvailableReservations(settings)
      }
    } catch (err) {
      console.warn('[purchase-add] 检查默认分类失败:', err)
    }
  },

  // 加载审批预览信息（默认审批人姓名）
  loadApprovalPreview: async function() {
    try {
      var userInfo = app.globalData.userInfo || {}
      var res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings', callerWechatId: userInfo.wechatId || '' }
      })
      if (res.result && res.result.success && res.result.data) {
        var rules = res.result.data
        this.setData({ approverName: rules.defaultApproverName || '' })
      }
    } catch (e) {
      // 静默忽略加载失败
    }
  },

  async loadAvailableReservations(cachedSettings) {
    try {
      const settings = await this.loadSettings(cachedSettings)
      const enabledDate = settings.serviceChargeEnabledDate
      if (!enabledDate) {
        this.setData({ recentReservations: [], pickerItems: [], pickerIndex: -1 })
        return
      }
      const now = new Date()
      const todayStr = formatDate(now)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
      // [Fix #1] 使用 Date 对象比较而非字符串比较，避免格式异常时结果不可预期
      const enabledDateObj = new Date(enabledDate + 'T00:00:00')
      const startDate = enabledDateObj > thirtyDaysAgo ? enabledDateObj : thirtyDaysAgo
      const endDate = new Date(todayStr + 'T23:59:59')
      const _db = db.getDb()
      const _ = _db.command
      const resvRes = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(startDate).and(_.lte(endDate)),
        status: 'confirmed'
      })
      const allReservations = resvRes.data || []
      // Single query: find all linked banquet purchases for these reservations
      const allIds = allReservations.map(function(r) { return r._id })
      let linkedIds = new Set()
      if (allIds.length > 0) {
        try {
          const linkedRes = await db.queryAll(COLLECTIONS.PURCHASE, {
            sourceReservationId: _.in(allIds),
            category: 'banquet'
          })
          ;(linkedRes.data || []).forEach(function(p) { linkedIds.add(p.sourceReservationId) })
        } catch (e) {
          console.warn('[purchase-add] 查询关联采购失败:', e)
        }
      }
      const available = allReservations.filter(function(r) {
        return !linkedIds.has(r._id)
      })
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
        remark: data.remark || '',
        receiptImages: data.receiptImages || [],
        sourceReservationId: data.sourceReservationId || ''
      })

      // 编辑模式：回填关联预约（与 income-add 保持一致）
      if (data.category === 'banquet' && data.sourceReservationId) {
        that.loadAvailableReservations().then(function() {
          var idx = that.data.recentReservations.findIndex(function(r) {
            return r._id === data.sourceReservationId
          })
          if (idx >= 0) {
            that.setData({
              selectedReservation: that.data.recentReservations[idx],
              pickerIndex: idx,
              reservationId: data.sourceReservationId
            })
          }
        })
      }
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

  onAddReceiptImage: function() {
    var that = this
    if (this.data.uploadingReceipt) return
    var remaining = 3 - this.data.receiptImages.length
    if (remaining <= 0) return

    wx.showActionSheet({
      itemList: ['📷 拍照', '🖼 从相册选择'],
      success: function(res) {
        var sourceType = res.tapIndex === 0 ? ['camera'] : ['album']
        wx.chooseMedia({
          count: remaining,
          mediaType: ['image'],
          sourceType: sourceType,
          sizeType: ['compressed'],
          success: function(chooseRes) {
            var files = chooseRes.tempFiles || []
            that.uploadReceiptFiles(files)
          }
        })
      }
    })
  },

  uploadReceiptFiles: function(files) {
    var that = this
    if (!files || files.length === 0) return

    that.setData({ uploadingReceipt: true })
    wx.showLoading({ title: '上传中' })

    var uploadPromises = files.map(function(file, index) {
      var ext = file.tempFilePath.match(/\.\w+$/)
      var extStr = ext ? ext[0] : '.jpg'
      var cloudPath = 'purchase-receipts/temp_' + Date.now() + '_' + index + extStr

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
      var newImages = that.data.receiptImages.concat(results).slice(0, 3)
      that.setData({ receiptImages: newImages, uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    }).catch(function(err) {
      that.setData({ uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    })
  },

  onRemoveReceiptImage: function(e) {
    var that = this
    var index = e.currentTarget.dataset.index
    var removed = this.data.receiptImages[index]
    if (!removed) return

    wx.showModal({
      title: '删除确认',
      content: '确定删除该单据照片吗？',
      confirmColor: '#F87171',
      success: function(res) {
        if (!res.confirm) return
        var newImages = that.data.receiptImages.filter(function(_, i) { return i !== index })
        var pendingDeletes = that.data.pendingDeleteFileIDs
        if (removed.fileID) {
          pendingDeletes = pendingDeletes.concat([removed.fileID])
        }
        that.setData({ receiptImages: newImages, pendingDeleteFileIDs: pendingDeletes })
      }
    })
  },

  // [Fix #4] validate 增加 item 非空校验（宴会菜价场景豁免）
  validate: function() {
    const errors = {}

    if (!this.data.date) {
      errors.date = '请选择采购日期'
    }

    if (!this.data.category) {
      errors.category = '请选择采购分类'
    }

    // 宴会菜价可由预约自动填充品名，其他分类要求手动输入
    if (!this.data.item.trim() && this.data.category !== 'banquet') {
      errors.item = '请输入采购项目名称'
    }

    const amountResult = validateAmount(this.data.amount)
    if (!amountResult.valid) errors.amount = amountResult.message

    this.setData({ errors: errors })
    var keys = Object.keys(errors)
    if (keys.length > 0) {
      wx.showToast({ title: errors[keys[0]], icon: 'none' })
    }
    return keys.length === 0
  },

  // --- [Fix #2] 从 onSubmit 中拆分的子方法 ---

  // 判断是否需要审批并填充 status/approver 字段
  async determineApprovalStatus(data) {
    try {
      var userInfo = app.globalData.userInfo || {}
      var rulesRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings', callerWechatId: userInfo.wechatId || '' }
      })
      if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
        var rules = rulesRes.result.data
        var needApproval = false
        if (rules.enabled !== false) {
          if (rules.categories && rules.categories[data.category] === true) {
            needApproval = true
            var threshold = Number(rules.amountThreshold) || 0
            if (threshold > 0 && data.amount <= threshold) {
              needApproval = false
            }
          }
        }
        // If the submitter IS the designated approver, skip approval
        if (needApproval && data.purchaseBy === rules.defaultApproverId) {
          needApproval = false
        }
        // Always record designated approver name for display
        data.approverName = rules.defaultApproverName || ''
        data.approverId = rules.defaultApproverId || ''
        if (needApproval) {
          data.status = 'pending'
        }
      }
    } catch (e) {
      console.warn('[purchase-add] 获取审批设置失败，默认通过:', e)
    }
    return data
  },

  // 新增模式下用正式 purchaseId 重传图片（替代临时路径）
  async reuploadReceiptImages(purchaseId, receiptImages) {
    if (!receiptImages || receiptImages.length === 0) return receiptImages
    var reuploadPromises = receiptImages.map(function(img, idx) {
      return new Promise(function(resolve) {
        wx.cloud.downloadFile({
          fileID: img.fileID,
          success: function(dlRes) {
            var newCloudPath = 'purchase-receipts/' + purchaseId + '_' + Date.now() + '_' + idx + '.jpg'
            wx.cloud.uploadFile({
              cloudPath: newCloudPath,
              filePath: dlRes.tempFilePath,
              success: function(uploadRes) {
                wx.cloud.deleteFile({ fileList: [img.fileID] }).catch(function() {})
                resolve({
                  fileID: uploadRes.fileID,
                  uploadedAt: img.uploadedAt,
                  uploadedBy: img.uploadedBy
                })
              },
              fail: function() {
                console.warn('[purchase-add] 重新上传图片时上传失败，保留原始文件')
                resolve({
                  fileID: img.fileID,
                  uploadedAt: img.uploadedAt,
                  uploadedBy: img.uploadedBy,
                  _reuploadFailed: true
                })
              }
            })
          },
          fail: function() {
            console.warn('[purchase-add] 重新上传图片时下载失败，保留原始文件:', img.fileID)
            resolve({
              fileID: img.fileID,
              uploadedAt: img.uploadedAt,
              uploadedBy: img.uploadedBy,
              _reuploadFailed: true
            })
          }
        })
      })
    })
    return Promise.all(reuploadPromises)
  },

  // 写入审批日志
  async submitApprovalLog(purchaseId, userInfo, data) {
    if (data.status !== 'pending') return
    await db.addDoc(COLLECTIONS.APPROVAL_LOG, {
      purchaseId: purchaseId,
      action: 'submit',
      operatorId: userInfo._id,
      operatorName: userInfo.name || userInfo.nickName,
      remark: '',
      createdAt: db.getDb().serverDate()
    }).catch(function(e) {
      console.warn('[purchase-add] 写入审批日志失败:', e)
    })
  },

  // --- 提交主入口 ---
  onSubmit: async function() {
    if (this.data.submitting) return
    if (!this.validate()) return

    const that = this
    const userInfo = app.globalData.userInfo || {}

    var data = {
      item: this.data.item.trim(),
      amount: Number(this.data.amount),
      category: this.data.category,
      date: this.data.date,
      remark: this.data.remark.trim(),
      receiptImages: this.data.receiptImages,
      sourceReservationId: this.data.sourceReservationId || '',
      purchaseBy: userInfo._id || '',
      purchaseByName: userInfo.name || userInfo.nickName || ''
    }

    if (!data.purchaseBy) {
      delete data.purchaseBy
      delete data.purchaseByName
    }

    // 审批规则判断
    data.status = 'approved'
    try {
      data = await this.determineApprovalStatus(data)
    } catch (e) {
      console.error('[purchase-add] determineApprovalStatus error:', e)
      wx.showToast({ title: '获取审批规则失败', icon: 'none' })
      return
    }

    that.setData({ submitting: true })
    wx.showLoading({ title: that.data.isEdit ? '保存中...' : '添加中...' })

    // Safety: auto-reset submitting after 30s to prevent permanent lock
    setTimeout(function() {
      if (that.data.submitting) {
        that.setData({ submitting: false })
        wx.hideLoading()
      }
    }, 30000)

    if (that.data.isEdit) {
      if (!checkPermission('purchase', ACTIONS.EDIT)) {
        that.setData({ submitting: false })
        wx.hideLoading()
        wx.showToast({ title: '无权编辑采购，请联系管理员', icon: 'none', duration: 3000 })
        return
      }
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, data).then(function() {
        // Clean up deleted images from cloud storage
        if (that.data.pendingDeleteFileIDs.length > 0) {
          wx.cloud.deleteFile({ fileList: that.data.pendingDeleteFileIDs }).catch(function(e) {
            console.warn('清理云存储图片失败:', e)
          })
        }
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_UPDATE, '更新采购: ' + data.item, { id: that.data.id, amount: data.amount })
        that.setData({ submitting: false })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function() { wx.switchTab({ url: '/pages/purchase/index' }) }, 1500)
      }).catch(function(err) {
        that.setData({ submitting: false })
        wx.hideLoading()
        handleCloudError(err, '保存采购记录')
      })
    } else {
      if (!checkPermission('purchase', ACTIONS.ADD)) {
        that.setData({ submitting: false })
        wx.hideLoading()
        wx.showToast({ title: '无权操作新增采购，请联系管理员分配权限', icon: 'none', duration: 3000 })
        return
      }
      // [Fix #5] 等待图片重传和审批日志完成后再提示成功
      db.addDoc(COLLECTIONS.PURCHASE, data).then(async function(result) {
        var finalImages = await that.reuploadReceiptImages(result._id, that.data.receiptImages)
        await db.updateDoc(COLLECTIONS.PURCHASE, result._id, { receiptImages: finalImages }).catch(function(e) {
          console.warn('更新单据图片路径失败:', e)
        })

        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_CREATE, '新增采购: ' + data.item, { amount: data.amount, category: data.category })
        await that.submitApprovalLog(result._id, userInfo, data)

        that.setData({ submitting: false })
        wx.showToast({ title: '添加成功', icon: 'success' })
        setTimeout(function() { wx.switchTab({ url: '/pages/purchase/index' }) }, 1500)
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
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/purchase/index' })
    }
  }
})
