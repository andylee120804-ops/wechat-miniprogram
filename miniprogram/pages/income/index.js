const app = getApp()
const { formatDate, formatAmount, getIncomeTypeText, getMonthRange } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    monthOffset: 0,
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
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 })
    }
    if (!hasPermission('income', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      wx.navigateBack()
      return
    }
    const theme = app.getThemePageData()
    const range = getMonthRange(this.data.monthOffset)
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      currentMonth: range.label,
      monthStr: range.monthStr
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true, page: 1, incomes: [], filteredIncomes: [] })
    try {
      const range = getMonthRange(this.data.monthOffset)
      const res = await db.queryPage(COLLECTIONS.INCOME, {
        date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
      }, 1, this.data.pageSize, 'createdAt', 'desc')

      const total = (res.data || []).reduce((s, i) => s + (i.amount || 0), 0)
      const items = (res.data || []).map(i => ({
        ...i,
        typeText: getIncomeTypeText(i.type) || '其他',
        amountText: formatAmount(i.amount),
        dateText: formatDate(i.date)
      }))
      this.setData({
        loading: false,
        incomes: items,
        filteredIncomes: items,
        totalAmount: formatAmount(total),
        hasMore: res.hasMore,
        page: 1
      })
      this.applyFilter()
    } catch (err) {
      handleCloudError(err, '加载收入数据')
      this.setData({ loading: false })
    }
  },

  onReachBottom: function() {
    if (this.data.loadingMore || !this.data.hasMore) return
    const that = this
    that.setData({ loadingMore: true })
    const range = getMonthRange(that.data.monthOffset)

    db.queryPage(COLLECTIONS.INCOME, {
      date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
    }, that.data.page + 1, that.data.pageSize, 'createdAt', 'desc').then(function(res) {
      const newItems = (res.data || []).map(function(i) {
        return { ...i,
          typeText: getIncomeTypeText(i.type) || '其他',
          amountText: formatAmount(i.amount),
          dateText: formatDate(i.date)
        }
      })
      const allItems = that.data.incomes.concat(newItems)
      const total = allItems.reduce(function(s, i) { return s + (i.amount || 0) }, 0)
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

  onPrevMonth() {
    const offset = this.data.monthOffset - 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, activeType: '', searchKeyword: '', currentMonth: range.label, monthStr: range.monthStr })
    this.loadData()
  },

  onNextMonth() {
    if (this.data.monthOffset >= 0) return
    const offset = this.data.monthOffset + 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, activeType: '', searchKeyword: '', currentMonth: range.label, monthStr: range.monthStr })
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
    if (!hasPermission('income', ACTIONS.ADD)) {
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
