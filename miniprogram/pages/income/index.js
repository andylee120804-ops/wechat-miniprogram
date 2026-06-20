const app = getApp()
const { formatDate, formatAmount, getIncomeTypeText, getMonthRange } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

const INCOME_TYPES = [
  { id: 'dining', name: '餐饮' },
  { id: 'chess', name: '棋牌' },
  { id: 'liquor', name: '酒水' },
  { id: 'teatime', name: '茶时' },
  { id: 'service', name: '服务' },
  { id: 'other', name: '其他' }
]

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
      { id: '', name: '全部' }
    ],
    searchKeyword: '',
    // Sort
    sortField: 'createdAt', // 'date' = 收入日期, 'createdAt' = 创建日期
    // Date filter
    filterDate: '',
    filterDateDisplay: '',
    // Pagination
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setActiveByPage('/pages/income/index')
    }
    if (!hasPermission('income', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      wx.navigateBack()
      return
    }
    const range = getMonthRange(0)
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      monthOffset: 0,
      currentMonth: range.label,
      monthStr: range.monthStr,
      filterDate: '',
      filterDateDisplay: '',
      activeType: '',
      searchKeyword: ''
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true, page: 1, incomes: [], filteredIncomes: [] })
    try {
      const filterDate = this.data.filterDate
      let query

      if (filterDate) {
        // Specific date filter — use exact date string match (same format as stored data)
        query = { date: filterDate }
      } else {
        // Month filter
        const range = getMonthRange(this.data.monthOffset)
        query = {
          date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
        }
      }

      const res = await db.queryPage(COLLECTIONS.INCOME, query, 1, this.data.pageSize, this.data.sortField, 'desc')

      // Query all records for accurate total amount (same pattern as purchase page)
      const totalPromise = db.queryAll(COLLECTIONS.INCOME, query)

      const items = (res.data || []).map(i => ({
        ...i,
        typeText: getIncomeTypeText(i.type) || '其他',
        amountText: formatAmount(i.amount),
        dateText: formatDate(i.date)
      }))

      const allData = (await totalPromise).data || []
      const total = allData.reduce((s, i) => s + (i.amount || 0), 0)

      // Sort typeOptions by count descending ("全部" first), only show count on "全部"
      const typeCounts = {}
      allData.forEach(i => { const t = i.type || 'other'; typeCounts[t] = (typeCounts[t] || 0) + 1 })
      const sortedOptions = [
        { id: '', name: '全部', count: allData.length },
        ...INCOME_TYPES
          .map(t => ({ ...t, count: typeCounts[t.id] || 0 }))
          .filter(o => o.count > 0)
          .sort((a, b) => b.count - a.count)
          .map(({ count, ...rest }) => rest)
      ]

      this.setData({
        loading: false,
        incomes: items,
        filteredIncomes: items,
        totalAmount: formatAmount(total),
        hasMore: res.hasMore,
        page: 1,
        typeOptions: sortedOptions
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

    const filterDate = that.data.filterDate
    let query

    if (filterDate) {
      query = { date: filterDate }
    } else {
      const range = getMonthRange(that.data.monthOffset)
      query = {
        date: db.getDb().command.gte(range.start).and(db.getDb().command.lte(range.end))
      }
    }

    db.queryPage(COLLECTIONS.INCOME, query, that.data.page + 1, that.data.pageSize, that.data.sortField, 'desc').then(function(res) {
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
    this.setData({ monthOffset: offset, activeType: '', searchKeyword: '', filterDate: '', filterDateDisplay: '', currentMonth: range.label, monthStr: range.monthStr })
    this.loadData()
  },

  onNextMonth() {
    if (this.data.monthOffset >= 0) return
    const offset = this.data.monthOffset + 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, activeType: '', searchKeyword: '', filterDate: '', filterDateDisplay: '', currentMonth: range.label, monthStr: range.monthStr })
    this.loadData()
  },

  onDateChange(e) {
    const date = e.detail.value
    if (date) {
      const displayDate = date.replace(/-/g, '/')
      this.setData({ filterDate: date, filterDateDisplay: displayDate, activeType: '', searchKeyword: '' })
    } else {
      const range = getMonthRange(this.data.monthOffset)
      this.setData({ filterDate: '', filterDateDisplay: '', currentMonth: range.label })
    }
    this.loadData()
  },

  onClearDateFilter() {
    const range = getMonthRange(this.data.monthOffset)
    this.setData({ filterDate: '', filterDateDisplay: '', currentMonth: range.label })
    this.loadData()
  },

  onTypeChange(e) {
    this.setData({ activeType: e.detail.id || '' })
    this.applyFilter()
  },

  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    this.applyFilter()
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' })
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

  onSortToggle() {
    const newField = this.data.sortField === 'createdAt' ? 'date' : 'createdAt'
    this.setData({ sortField: newField })
    this.loadData()
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/income-detail/index?id=${id}` })
  }
})
