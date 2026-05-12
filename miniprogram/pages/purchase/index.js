const app = getApp()
const { formatDate, formatAmount, getCategoryName, getMonthRange } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { checkPermission, ACTIONS, hasPermission } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

const ALL_CATEGORIES = [
  { id: '', name: '全部', count: 0 },
  { id: 'meat', name: '肉类', count: 0 },
  { id: 'seafood', name: '海鲜', count: 0 },
  { id: 'vegetable', name: '蔬菜', count: 0 },
  { id: 'fruit', name: '水果', count: 0 },
  { id: 'drink', name: '饮品', count: 0 },
  { id: 'seasoning', name: '调味品', count: 0 },
  { id: 'supplies', name: '日用品', count: 0 },
  { id: 'equipment', name: '设备', count: 0 },
  { id: 'banquet', name: '宴会菜价', count: 0 },
  { id: 'other', name: '其他', count: 0 }
]

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
    totalFormatted: '0.00',
    totalCount: 0,
    activeCategory: '',
    categories: ALL_CATEGORIES.map(function(c) { return Object.assign({}, c) }),
    searchKeyword: '',
    // Pagination
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onLoad: function() {
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.setData({ theme: app.getThemePageData() })
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 })
    }
    this.loadData()
  },

  loadData: function() {
    const that = this
    that.setData({ loading: true, page: 1, purchases: [], filteredPurchases: [] })

    const range = getMonthRange(that.data.currentMonth)

    // Query all records in month for accurate total amount
    const totalPromise = db.queryAll(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    })

    // Query first page for display
    const pagePromise = db.queryPage(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, 1, that.data.pageSize, 'date', 'desc')

    Promise.all([totalPromise, pagePromise]).then(function(results) {
      const allData = results[0].data || []
      let totalAmount = 0
      allData.forEach(function(p) { totalAmount += Number(p.amount) || 0 })

      const res = results[1]
      const purchases = (res.data || []).map(function(p) {
        return {
          ...p,
          categoryName: getCategoryName(p.category),
          formattedAmount: formatAmount(p.amount),
          formattedDate: formatDate(p.date)
        }
      })

      const categoryCounts = {}
      ALL_CATEGORIES.forEach(function(cat) { categoryCounts[cat.id] = 0 })

      allData.forEach(function(p) {
        if (p.category && categoryCounts[p.category] !== undefined) categoryCounts[p.category]++
      })
      categoryCounts[''] = allData.length

      // Only show categories that have records, plus "全部" (all)
      const updatedCategories = ALL_CATEGORIES.filter(function(cat) {
        return cat.id === '' || (categoryCounts[cat.id] || 0) > 0
      }).map(function(cat) {
        return { ...cat, count: categoryCounts[cat.id] || 0 }
      })

      that.setData({
        purchases: purchases,
        filteredPurchases: purchases,
        totalAmount: totalAmount,
        totalFormatted: formatAmount(totalAmount),
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
    const that = this
    that.setData({ loadingMore: true })
    const range = getMonthRange(that.data.currentMonth)

    db.queryPage(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, that.data.page + 1, that.data.pageSize, 'date', 'desc').then(function(res) {
      const newItems = (res.data || []).map(function(p) {
        return {
          ...p,
          categoryName: getCategoryName(p.category),
          formattedAmount: formatAmount(p.amount),
          formattedDate: formatDate(p.date)
        }
      })
      const allItems = that.data.purchases.concat(newItems)
      that.setData({
        purchases: allItems,
        filteredPurchases: allItems,
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
    const offset = e.currentTarget.dataset.offset
    const newMonth = this.data.currentMonth + (offset || 0)
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
    const purchases = this.data.purchases
    const activeCategory = this.data.activeCategory
    const keyword = this.data.searchKeyword.trim().toLowerCase()

    const filtered = purchases.filter(function(p) {
      const matchCategory = !activeCategory || p.category === activeCategory
      const matchSearch = !keyword ||
        (p.item && p.item.toLowerCase().includes(keyword)) ||
        (p.remark && p.remark.toLowerCase().includes(keyword)) ||
        (p.purchaseByName && p.purchaseByName.toLowerCase().includes(keyword)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(keyword))
      return matchCategory && matchSearch
    })

    this.setData({ filteredPurchases: filtered })
  },

  onAddPurchase: function() {
    if (!checkPermission('purchase', ACTIONS.ADD)) return
    wx.navigateTo({ url: '/pages/purchase-add/index' })
  },

  onItemTap: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase-detail/index?id=' + id })
  }
})
