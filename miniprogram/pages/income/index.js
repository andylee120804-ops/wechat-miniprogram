const app = getApp()
const { formatDate, formatAmount, getIncomeTypeText, getMonthRange } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    currentMonth: '',
    monthStr: '',
    incomes: [],
    filteredIncomes: [],
    totalAmount: '0.00',
    activeType: '',
    typeOptions: [
      { id: '', name: '全部' },
      { id: 'dining', name: '餐饮' },
      { id: 'chess', name: '棋牌' },
      { id: 'liquor', name: '酒水' },
      { id: 'teatime', name: '茶水' },
      { id: 'service', name: '服务' },
      { id: 'other', name: '其他' }
    ],
    searchKeyword: '',
    // Pagination
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onShow() {
    if (!app.hasPermission('income', 'view')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      wx.navigateBack()
      return
    }
    const theme = app.getThemePageData()
    const monthRange = getMonthRange(0)
    this.setData({ theme, currentMonth: monthRange.label, monthStr: monthRange.monthStr })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true, page: 1, incomes: [], filteredIncomes: [] })
    try {
      const range = getMonthRange(0)
      const res = await db.queryPage(COLLECTIONS.INCOME, {
        date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
      }, 1, this.data.pageSize, 'createdAt', 'desc')

      const total = (res.data || []).reduce((s, i) => s + (i.amount || 0), 0)
      this.setData({
        loading: false,
        incomes: res.data || [],
        filteredIncomes: res.data || [],
        totalAmount: formatAmount(total),
        hasMore: res.hasMore,
        page: 1,
        pageSize: this.data.pageSize
      })
      this.applyFilter()
    } catch (err) {
      handleCloudError(err, '加载收入数据')
      this.setData({ loading: false })
    }
  },

  onReachBottom: function() {
    if (this.data.loadingMore || !this.data.hasMore) return
    var that = this
    that.setData({ loadingMore: true })
    var range = getMonthRange(0)

    db.queryPage(COLLECTIONS.INCOME, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, that.data.page + 1, that.data.pageSize, 'createdAt', 'desc').then(function(res) {
      var newItems = res.data || []
      var allItems = that.data.incomes.concat(newItems)
      var total = allItems.reduce(function(s, i) { return s + (i.amount || 0) }, 0)
      that.setData({
        incomes: allItems,
        filteredIncomes: allItems,
        totalAmount: formatAmount(total),
        hasMore: res.hasMore,
        page: that.data.page + 1,
        loadingMore: false
      })
      that.applyFilter()
    }).catch(function() {
      that.setData({ loadingMore: false })
    })
  },

  onMonthChange(e) {
    const offset = e.currentTarget.dataset.offset || 0
    const range = getMonthRange(offset)
    this.setData({ currentMonth: range.label, monthStr: range.monthStr, activeType: '', searchKeyword: '' })
    this.loadData()
  },

  onTypeChange(e) {
    this.setData({ activeType: e.detail.value || '' })
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    this.applyFilter()
  },

  applyFilter() {
    let filtered = this.data.incomes
    if (this.data.activeType) {
      filtered = filtered.filter(i => i.type === this.data.activeType)
    }
    if (this.data.searchKeyword) {
      const kw = this.data.searchKeyword.toLowerCase()
      filtered = filtered.filter(i =>
        (i.source || '').toLowerCase().includes(kw) ||
        (i.remark || '').toLowerCase().includes(kw)
      )
    }
    this.setData({ filteredIncomes: filtered })
  },

  onAddIncome() {
    if (!app.hasPermission('income', 'add')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/income-add/index' })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/income-detail/index?id=${id}` })
  }
})
