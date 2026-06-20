const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')
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
    categoryLabels: {
      meat: '🥩 肉类', seafood: '🦐 海鲜', vegetable: '🥬 蔬菜', fruit: '🍎 水果',
      drink: '🍷 饮品', seasoning: '🧂 调味品', supplies: '🧹 日用品',
      equipment: '🔧 设备', banquet: '🍽 宴会菜价', other: '📦 其他'
    },
    autoPurchaseEnabled: true,
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
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })

    // 只有admin可以访问此页面
    var userInfo = app.globalData.userInfo || {}
    var role = userInfo.role || ''
    if (role !== 'admin') {
      wx.showToast({ title: '此页面仅管理员可访问', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
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
      var userInfo = app.globalData.userInfo || {}
      var rulesRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getApprovalSettings', callerWechatId: userInfo.wechatId || '' }
      })
      if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
        var d = rulesRes.result.data
        that.setData({
          enabled: d.enabled !== false,
          autoPurchaseEnabled: d.autoPurchaseEnabled !== false,
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

    // 加载员工和权限，只显示有审批/报销权限的人
    try {
      var staffRes = await db.queryAll(COLLECTIONS.STAFF, {})
      var staffList = (staffRes.data || []).filter(function(s) { return !s.deleted })
      var permRes = await db.queryAll(COLLECTIONS.PERMISSIONS, {})
      var permList = permRes.data || []

      // 构建有审批/报销权限的员工ID集合
      // boss 和 admin 默认拥有审批和报销权限
      var canApproveIds = {}
      var canReimburseIds = {}
      staffList.forEach(function(s) {
        if (s.role === 'boss' || s.role === 'admin') {
          canApproveIds[s._id] = true
          canReimburseIds[s._id] = true
        }
      })
      permList.forEach(function(p) {
        var purchasePerm = (p.permissions || []).find(function(mod) { return mod.module === 'purchase' })
        if (purchasePerm && purchasePerm.actions) {
          if (purchasePerm.actions.includes('approve') || purchasePerm.actions.includes('*')) {
            canApproveIds[p.staffId] = true
          }
          if (purchasePerm.actions.includes('reimburse') || purchasePerm.actions.includes('*')) {
            canReimburseIds[p.staffId] = true
          }
        }
      })

      var approverOpts = []
      var reimburserOpts = []
      var aIdx = -1
      var rIdx = -1

      staffList.forEach(function(s) {
        var item = { id: s._id, name: s.name || s.nickName || '' }
        if (canApproveIds[s._id]) {
          if (s._id === that.data.defaultApproverId) aIdx = approverOpts.length
          approverOpts.push(item)
        }
        if (canReimburseIds[s._id]) {
          if (s._id === that.data.defaultReimburserId) rIdx = reimburserOpts.length
          reimburserOpts.push(item)
        }
      })

      // 如果当前设置的默认人不在列表中（可能权限被移除），仍然加入
      if (that.data.defaultApproverId && aIdx < 0) {
        var foundA = staffList.find(function(s) { return s._id === that.data.defaultApproverId })
        if (foundA) {
          aIdx = approverOpts.length
          approverOpts.push({ id: foundA._id, name: foundA.name || foundA.nickName || '' })
        }
      }
      if (that.data.defaultReimburserId && rIdx < 0) {
        var foundR = staffList.find(function(s) { return s._id === that.data.defaultReimburserId })
        if (foundR) {
          rIdx = reimburserOpts.length
          reimburserOpts.push({ id: foundR._id, name: foundR.name || foundR.nickName || '' })
        }
      }

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

  onToggleAutoPurchase: function(e) { this.setData({ autoPurchaseEnabled: !!e.detail.value }) },

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
            autoPurchaseEnabled: that.data.autoPurchaseEnabled,
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
