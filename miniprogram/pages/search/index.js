const app = getApp()
const { formatDate, formatAmount } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    keyword: '',
    recentSearches: [],
    activeTab: 'all',
    results: { reservations: [], income: [], purchases: [], customers: [] },
    searching: false,
    tabs: ['all', 'reservations', 'income', 'purchases']
  },

  onShow() {
    const theme = app.getThemePageData()
    const recent = wx.getStorageSync('recentSearches') || []
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, recentSearches: recent })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onSearch(e) {
    const keyword = e.detail.value || ''
    if (!keyword.trim()) return
    this.setData({ keyword })
    this.saveRecent(keyword)
    this.searchAll(keyword)
  },

  saveRecent(keyword) {
    let recent = this.data.recentSearches.filter(s => s !== keyword)
    recent.unshift(keyword)
    recent = recent.slice(0, 10)
    wx.setStorageSync('recentSearches', recent)
    this.setData({ recentSearches: recent })
  },

  async searchAll(keyword) {
    this.setData({ searching: true })
    const db = wx.cloud.database()
    const kw = db.command.regExp({ regexp: keyword, options: 'i' })
    try {
      const [resRes, incRes, purRes] = await Promise.all([
        db.collection(COLLECTIONS.RESERVATION).where({
          customerName: kw,
          status: db.command.neq('cancelled')
        }).limit(10).get(),
        db.collection(COLLECTIONS.INCOME).where({
          source: kw
        }).limit(10).get(),
        db.collection(COLLECTIONS.PURCHASE).where({
          item: kw
        }).limit(10).get()
      ])

      // Derive customers from reservations
      const customerMap = {}
      resRes.data.forEach(r => {
        if (!customerMap[r.customerName]) {
          customerMap[r.customerName] = { name: r.customerName, count: 0 }
        }
        customerMap[r.customerName].count++
      })

      this.setData({
        searching: false,
        results: {
          reservations: resRes.data,
          income: incRes.data,
          purchases: purRes.data,
          customers: Object.values(customerMap)
        }
      })
    } catch (err) {
      this.setData({ searching: false })
    }
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  onRecentTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.searchAll(keyword)
  },

  clearRecentSearches() {
    wx.removeStorageSync('recentSearches')
    this.setData({ recentSearches: [] })
  },

  onClear() {
    this.setData({ keyword: '', results: { reservations: [], income: [], purchases: [], customers: [] } })
  },

  onResultTap(e) {
    const { id, type } = e.currentTarget.dataset
    const pages = {
      reservation: `/pages/reservation-detail/index?id=${id}`,
      income: `/pages/income-detail/index?id=${id}`,
      purchase: `/pages/purchase-detail/index?id=${id}`,
      customer: `/pages/customer-detail/index?name=${id}`
    }
    if (pages[type]) wx.navigateTo({ url: pages[type] })
  }
})
