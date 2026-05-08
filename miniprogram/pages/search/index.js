const app = getApp()
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const { formatDate, formatAmount } = require('../../utils/helpers')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
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
    const dbInst = db.getDb()
    const kw = dbInst.command.regExp({ regexp: keyword, options: 'i' })
    try {
      const [resRes, incRes, purRes] = await Promise.all([
        dbInst.collection(COLLECTIONS.RESERVATION).where({
          customerName: kw,
          status: 'confirmed'
        }).limit(10).get(),
        dbInst.collection(COLLECTIONS.INCOME).where({
          source: kw
        }).limit(10).get(),
        dbInst.collection(COLLECTIONS.PURCHASE).where({
          item: kw
        }).limit(10).get()
      ])

      // Derive customers from reservations
      const customerMap = {}
      ;(resRes.data || []).forEach(r => {
        if (!customerMap[r.customerName]) {
          customerMap[r.customerName] = { name: r.customerName, count: 0 }
        }
        customerMap[r.customerName].count++
      })

      // Pre-format values for template rendering
      const reservations = (resRes.data || []).map(r => ({
        ...r, formattedDate: formatDate(r.date)
      }))
      const income = (incRes.data || []).map(i => ({
        ...i, formattedDate: formatDate(i.date), formattedAmount: formatAmount(i.amount)
      }))
      const purchases = (purRes.data || []).map(p => ({
        ...p, formattedAmount: formatAmount(p.amount)
      }))

      this.setData({
        searching: false,
        results: {
          reservations,
          income,
          purchases,
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
