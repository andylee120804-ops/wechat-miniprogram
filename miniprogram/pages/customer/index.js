const app = getApp()
const { formatDate, formatAmount } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    loading: true,
    customers: [],
    filteredCustomers: [],
    searchKeyword: '',
    sortBy: 'visits'
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadCustomers()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadCustomers() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection(COLLECTIONS.RESERVATION).where({
        status: db.command.neq('cancelled')
      }).get()

      // Aggregate by customerName
      const map = {}
      res.data.forEach(r => {
        const name = r.customerName || '未知'
        if (!map[name]) {
          map[name] = { name, visits: 0, totalAmount: 0, lastVisit: r.date, preferredRoom: r.roomName || r.room }
        }
        map[name].visits++
        if (r.date > map[name].lastVisit) {
          map[name].lastVisit = r.date
          map[name].preferredRoom = r.roomName || r.room
        }
      })

      // Also query income to get spending
      const incomeRes = await db.collection(COLLECTIONS.INCOME).where({}).get()
      incomeRes.data.forEach(i => {
        const name = i.source
        if (map[name]) {
          map[name].totalAmount = (map[name].totalAmount || 0) + (i.amount || 0)
        }
      })

      let customers = Object.values(map)
      customers.sort((a, b) => b.visits - a.visits)
      this.setData({ loading: false, customers, filteredCustomers: customers })
      this.applyFilter()
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    this.applyFilter()
  },

  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    this.setData({ sortBy })
    this.applyFilter()
  },

  applyFilter() {
    let filtered = this.data.customers
    if (this.data.searchKeyword) {
      const kw = this.data.searchKeyword.toLowerCase()
      filtered = filtered.filter(c => c.name.toLowerCase().includes(kw))
    }
    if (this.data.sortBy === 'visits') {
      filtered.sort((a, b) => b.visits - a.visits)
    } else if (this.data.sortBy === 'spending') {
      filtered.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
    }
    this.setData({ filteredCustomers: filtered })
  },

  onCustomerTap(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({ url: `/pages/customer-detail/index?name=${encodeURIComponent(name)}` })
  }
})
