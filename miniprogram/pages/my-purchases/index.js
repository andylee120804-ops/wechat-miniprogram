var app = getApp()
var { handleCloudError } = require('../../utils/error-handler')
var { COLLECTIONS } = require('../../utils/db')
var { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
var db = require('../../utils/db')

// Status definitions for cards (custom labels for submitter's view)
var STATUS_CONFIG = [
  { key: 'pending', label: '待审批', color: '#FBBF24', borderColor: 'rgba(251,191,36,0.3)', bgColor: 'rgba(251,191,36,0.12)' },
  { key: 'approved', label: '未付款', color: '#3B82F6', borderColor: 'rgba(59,130,246,0.3)', bgColor: 'rgba(59,130,246,0.12)' },
  { key: 'reimbursed', label: '已完成', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.3)', bgColor: 'rgba(74,222,128,0.12)' },
  { key: 'rejected', label: '已拒绝', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)', bgColor: 'rgba(248,113,113,0.12)' }
]

// Generate empty count map for all statuses
function emptyCountMap() {
  var map = {}
  STATUS_CONFIG.forEach(function(s) { map[s.key] = 0 })
  return map
}

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    statusCards: [],           // [{ key, label, count, color, borderColor, bgColor }]
    activeStatus: '',          // '' = all, or a status key
    filteredList: [],          // current list to display
    sectionLabel: '',          // e.g. "待审批 (3)"
    hasRecords: false,         // whether user has submitted any purchases
    allItems: []               // all fetched purchases (for client-side filtering)
  },

  onLoad: function () {
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function () {
    this.loadData()
  },

  loadData: async function () {
    var that = this
    that.setData({ loading: true })

    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }

    try {
      var res = await db.queryAll(COLLECTIONS.PURCHASE, { purchaseBy: userInfo._id })
      var allItems = (res.data || []).sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })

      // Count by status
      var counts = emptyCountMap()
      allItems.forEach(function(item) {
        var status = item.status || 'reimbursed'
        if (counts[status] !== undefined) counts[status]++
      })

      // Build status cards data
      var statusCards = STATUS_CONFIG.map(function(s) {
        return { ...s, count: counts[s.key] }
      })

      var hasRecords = allItems.length > 0
      var sectionLabel = hasRecords ? '全部 (' + allItems.length + ')' : ''

      that.setData({
        allItems: allItems,
        statusCards: statusCards,
        hasRecords: hasRecords,
        sectionLabel: sectionLabel,
        activeStatus: '',
        filteredList: allItems.map(function(item) { return that._formatItem(item) }),
        loading: false
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购记录')
    }
  },

  _formatItem: function (item) {
    var status = item.status || 'reimbursed'
    var statusLabel = this._getStatusLabel(status)
    var statusColor = this._getStatusColor(status)
    return {
      _id: item._id,
      item: item.item || '',
      amount: item.amount || 0,
      category: item.category || '',
      date: item.date || '',
      purchaseBy: item.purchaseBy || '',
      status: status,
      categoryName: getCategoryName(item.category),
      formattedAmount: formatAmount(item.amount),
      formattedDate: formatDate(item.date),
      statusLabel: statusLabel,
      statusColor: statusColor
    }
  },

  _getStatusLabel: function (status) {
    var map = { pending: '待审批', approved: '未付款', reimbursed: '已完成', rejected: '已拒绝' }
    return map[status] || ''
  },

  _getStatusColor: function (status) {
    var map = { pending: '#FBBF24', approved: '#3B82F6', reimbursed: '#4ADE80', rejected: '#F87171' }
    return map[status] || '#9CA3AF'
  },

  onCardTap: function (e) {
    var key = e.currentTarget.dataset.key || ''
    var activeStatus = this.data.activeStatus === key ? '' : key
    this._applyFilter(activeStatus)
  },

  _applyFilter: function (activeStatus) {
    var items = this.data.allItems
    var filtered = activeStatus
      ? items.filter(function(item) { return (item.status || 'reimbursed') === activeStatus })
      : items

    var label = activeStatus
      ? this._getStatusLabel(activeStatus) + ' (' + filtered.length + ')'
      : '全部 (' + items.length + ')'

    this.setData({
      activeStatus: activeStatus,
      filteredList: filtered.map(function(item) { return this._formatItem(item) }, this),
      sectionLabel: label
    })
  },

  onItemTap: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  },

  onBack: function () {
    wx.navigateBack()
  }
})
