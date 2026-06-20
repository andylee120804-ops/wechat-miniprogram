var app = getApp()
var { handleCloudError } = require('../../utils/error-handler')
var { COLLECTIONS } = require('../../utils/db')
var { formatDate, formatAmount, getCategoryName } = require('../../utils/helpers')
var db = require('../../utils/db')

// Status card config — maps to design doc L60-L65
var STATUS_MAP = [
  { key: 'pending', label: '待审批', color: '#FBBF24' },
  { key: 'approved', label: '未付款', color: '#3B82F6' },
  { key: 'reimbursed', label: '已完成', color: '#4ADE80' },
  { key: 'rejected', label: '已拒绝', color: '#F87171' }
]

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    activeStatus: '',
    statusCards: [],
    filteredList: [],
    hasRecords: false,
    sectionLabel: ''
  },

  onLoad: function () {
    var theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow: function () {
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }
    this.loadPurchases(userInfo._id)
  },

  loadPurchases: async function (userId) {
    var that = this
    that.setData({ loading: true })

    try {
      var res = await db.queryAll(COLLECTIONS.PURCHASE, { purchaseBy: userId }, 'date', 'desc')
      var list = (res.data || []).map(that._formatItem)

      // Filter to current month for counting and sorting
      var now = new Date()
      var monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
      var monthEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      var monthList = list.filter(function (item) {
        return item.date >= monthStart && item.date <= monthEnd
      })

      // Build status cards with current-month counts, sorted by count descending
      var statusCards = STATUS_MAP.map(function (s) {
        var count = monthList.filter(function (item) { return item.status === s.key }).length
        return { key: s.key, label: s.label, color: s.color, count: count }
      })
      // Add "全部" card then sort all by count
      statusCards.unshift({ key: '', label: '全部', color: '#C9A96E', count: monthList.length })
      statusCards.sort(function (a, b) { return b.count - a.count })

      that.setData({
        statusCards: statusCards,
        filteredList: list,
        allList: list,
        hasRecords: list.length > 0,
        loading: false,
        sectionLabel: '全部 (' + list.length + ')'
      })
    } catch (err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购记录')
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

  onCardTap: function (e) {
    var key = e.currentTarget.dataset.key
    var statusCards = this.data.statusCards
    var allList = this.data.allList || this.data.filteredList

    // Tap same card or empty key → reset to all
    if (key === '' || key === this.data.activeStatus) {
      this.setData({
        activeStatus: '',
        filteredList: allList,
        sectionLabel: '全部 (' + allList.length + ')'
      })
      return
    }

    var card = statusCards.find(function (c) { return c.key === key })
    var filtered = allList.filter(function (item) { return item.status === key })
    this.setData({
      activeStatus: key,
      filteredList: filtered,
      sectionLabel: (card ? card.label : '') + ' (' + filtered.length + ')'
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
