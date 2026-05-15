const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    saving: false,
    enabled: true,
    categories: {
      meat: false, seafood: false, vegetable: false, fruit: false,
      drink: false, seasoning: false, supplies: false, equipment: false,
      banquet: false, other: false
    },
    amountThreshold: 0,
    defaultApproverId: '',
    defaultApproverName: '',
    defaultReimburserId: '',
    defaultReimburserName: '',
    approverList: [],
    reimburserList: [],
    approverIndex: -1,
    reimburserIndex: -1
  },

  onLoad: function() {
    var canEdit = hasPermission('purchase', ACTIONS.EDIT)
    if (!canEdit) {
      wx.showToast({ title: '无权限修改设置', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function() {
    this.loadAll()
  },

  loadAll: async function() {
    var that = this
    that.setData({ loading: true })
    wx.showLoading({ title: '加载中' })

    try {
      // 加载审批规则
      var rulesRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings' }
      })
      if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
        var d = rulesRes.result.data
        that.setData({
          enabled: d.enabled !== false,
          categories: that._mergeCategories(d.categories),
          amountThreshold: d.amountThreshold || 0,
          defaultApproverId: d.defaultApproverId || '',
          defaultApproverName: d.defaultApproverName || '',
          defaultReimburserId: d.defaultReimburserId || '',
          defaultReimburserName: d.defaultReimburserName || ''
        })
      }
    } catch (err) {
      handleCloudError(err, '加载审批设置')
    }

    // 加载员工列表用于选择器
    try {
      var staffRes = await db.queryAll(COLLECTIONS.STAFF, {})
      var staffList = (staffRes.data || []).filter(function(s) { return !s.deleted })
      var approverOpts = []
      var reimburserOpts = []
      var aIdx = -1
      var rIdx = -1

      staffList.forEach(function(s) {
        var item = { id: s._id, name: s.name || s.nickName || '' }
        if (s._id === that.data.defaultApproverId) aIdx = approverOpts.length
        if (s._id === that.data.defaultReimburserId) rIdx = reimburserOpts.length
        approverOpts.push(item)
        reimburserOpts.push(item)
      })

      that.setData({
        approverList: approverOpts,
        reimburserList: reimburserOpts,
        approverIndex: aIdx,
        reimburserIndex: rIdx,
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载员工列表')
    }
    wx.hideLoading()
  },

  // 合并已保存的类目配置，确保所有键都存在
  _mergeCategories: function(saved) {
    var defaults = {
      meat: false, seafood: false, vegetable: false, fruit: false,
      drink: false, seasoning: false, supplies: false, equipment: false,
      banquet: false, other: false
    }
    if (!saved) return defaults
    var merged = {}
    for (var k in defaults) {
      merged[k] = saved.hasOwnProperty(k) ? !!saved[k] : defaults[k]
    }
    return merged
  },

  onToggleEnabled: function(e) { this.setData({ enabled: !!e.detail.value }) },

  onCategoryToggle: function(e) {
    var key = e.currentTarget.dataset.key
    var cats = {}
    var src = this.data.categories
    for (var k in src) { cats[k] = src[k] }
    cats[key] = !cats[key]
    this.setData({ categories: cats })
  },

  onThresholdInput: function(e) {
    var val = parseInt(e.detail.value, 10)
    this.setData({ amountThreshold: isNaN(val) ? 0 : val })
  },

  onApproverChange: function(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.approverList[idx]
    this.setData({
      approverIndex: idx,
      defaultApproverId: item ? item.id : '',
      defaultApproverName: item ? item.name : ''
    })
  },

  onReimburserChange: function(e) {
    var idx = parseInt(e.detail.value, 10)
    var item = this.data.reimburserList[idx]
    this.setData({
      reimburserIndex: idx,
      defaultReimburserId: item ? item.id : '',
      defaultReimburserName: item ? item.name : ''
    })
  },

  onSave: async function() {
    if (this.data.saving) return
    var that = this
    that.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      var res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateApprovalSettings',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          approvalRules: {
            enabled: that.data.enabled,
            categories: that.data.categories,
            amountThreshold: that.data.amountThreshold,
            defaultApproverId: that.data.defaultApproverId,
            defaultApproverName: that.data.defaultApproverName,
            defaultReimburserId: that.data.defaultReimburserId,
            defaultReimburserName: that.data.defaultReimburserName
          }
        }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '保存审批设置')
    }
    that.setData({ saving: false })
  },

  onBack: function() { wx.navigateBack() }
})
