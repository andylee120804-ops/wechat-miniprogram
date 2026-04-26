const app = getApp()
const { formatDate, formatAmount, getCategoryName, getMonthRange } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { hasPermission, checkPermission } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    currentMonth: 0,
    monthStr: '',
    monthLabel: '',
    purchases: [],
    filteredPurchases: [],
    totalAmount: 0,
    totalCount: 0,
    activeCategory: '',
    categories: [
      { id: '', name: '全部', count: 0 },
      { id: 'meat', name: '肉类', count: 0 },
      { id: 'seafood', name: '海鲜', count: 0 },
      { id: 'vegetable', name: '蔬菜', count: 0 },
      { id: 'fruit', name: '水果', count: 0 },
      { id: 'drink', name: '饮品', count: 0 },
      { id: 'seasoning', name: '调味品', count: 0 },
      { id: 'supplies', name: '日用品', count: 0 },
      { id: 'equipment', name: '设备', count: 0 },
      { id: 'other', name: '其他', count: 0 }
    ],
    searchKeyword: '',
    // Pagination
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onLoad: function() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.setData({ theme: app.getThemePageData() })
    this.loadData()
  },

  loadData: function() {
    var that = this
    that.setData({ loading: true, page: 1, purchases: [], filteredPurchases: [] })

    var range = getMonthRange(that.data.currentMonth)

    db.queryPage(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, 1, that.data.pageSize, 'date', 'desc').then(function(res) {
      var purchases = (res.data || []).map(function(p) {
        p.categoryName = getCategoryName(p.category)
        p.formattedAmount = formatAmount(p.amount)
        p.formattedDate = formatDate(p.date)
        return p
      })

      var totalAmount = 0
      var categoryCounts = {}
      that.data.categories.forEach(function(cat) { categoryCounts[cat.id] = 0 })

      purchases.forEach(function(p) {
        totalAmount += Number(p.amount) || 0
        if (p.category && categoryCounts[p.category] !== undefined) categoryCounts[p.category]++
      })
      categoryCounts[''] = purchases.length

      var updatedCategories = that.data.categories.map(function(cat) {
        return Object.assign({}, cat, { count: categoryCounts[cat.id] || 0 })
      })

      that.setData({
        purchases: purchases,
        filteredPurchases: purchases,
        totalAmount: totalAmount,
        totalCount: res.total,
        categories: updatedCategories,
        monthStr: range.monthStr,
        monthLabel: range.label,
        hasMore: res.hasMore,
        page: 1,
        pageSize: that.data.pageSize,
        loading: false
      })
      that.applyFilter()
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载采购记录')
    })
  },

  onReachBottom: function() {
    if (this.data.loadingMore || !this.data.hasMore) return
    var that = this
    that.setData({ loadingMore: true })
    var range = getMonthRange(that.data.currentMonth)

    db.queryPage(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, that.data.page + 1, that.data.pageSize, 'date', 'desc').then(function(res) {
      var newItems = (res.data || []).map(function(p) {
        p.categoryName = getCategoryName(p.category)
        p.formattedAmount = formatAmount(p.amount)
        p.formattedDate = formatDate(p.date)
        return p
      })
      var allItems = that.data.purchases.concat(newItems)
      var totalAmount = 0
      allItems.forEach(function(p) { totalAmount += Number(p.amount) || 0 })
      that.setData({
        purchases: allItems,
        filteredPurchases: allItems,
        totalAmount: totalAmount,
        hasMore: res.hasMore,
        page: that.data.page + 1,
        loadingMore: false
      })
      that.applyFilter()
    }).catch(function() {
      that.setData({ loadingMore: false })
    })
  },

  onMonthChange: function(e) {
    var offset = e.currentTarget.dataset.offset
    var newMonth = this.data.currentMonth + (offset || 0)
    this.setData({ currentMonth: newMonth })
    this.loadData()
  },

  onMonthPrev: function() {
    this.setData({ currentMonth: this.data.currentMonth - 1 })
    this.loadData()
  },

  onMonthNext: function() {
    this.setData({ currentMonth: this.data.currentMonth + 1 })
    this.loadData()
  },

  onCategoryChange: function(e) {
    this.setData({ activeCategory: e.detail.id })
    this.applyFilter()
  },

  onSearch: function(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    this.applyFilter()
  },

  onSearchClear: function() {
    this.setData({ searchKeyword: '' })
    this.applyFilter()
  },

  applyFilter: function() {
    var purchases = this.data.purchases
    var activeCategory = this.data.activeCategory
    var keyword = this.data.searchKeyword.trim().toLowerCase()

    var filtered = purchases.filter(function(p) {
      var matchCategory = !activeCategory || p.category === activeCategory
      var matchSearch = !keyword ||
        (p.item && p.item.toLowerCase().indexOf(keyword) !== -1) ||
        (p.remark && p.remark.toLowerCase().indexOf(keyword) !== -1) ||
        (p.purchaseByName && p.purchaseByName.toLowerCase().indexOf(keyword) !== -1) ||
        (p.categoryName && p.categoryName.toLowerCase().indexOf(keyword) !== -1)
      return matchCategory && matchSearch
    })

    this.setData({ filteredPurchases: filtered })
  },

  onAddPurchase: function() {
    if (!checkPermission('purchase', 'create')) return
    wx.navigateTo({ url: '/pages/purchase-add/index' })
  },

  onItemTap: function(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  }
})
