const app = getApp()
const { formatDate, formatAmount } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    customerName: '',
    loading: true,
    totalVisits: 0,
    totalSpending: '0.00',
    preferredRoom: '',
    lastVisit: '',
    visitHistory: []
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    const name = decodeURIComponent(options.name || '')
    this.setData({ theme, customerName: name, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    try {
      const dbInst = wx.cloud.database()
      const [resRes, incRes] = await Promise.all([
        db.queryAll(COLLECTIONS.RESERVATION, {
          customerName: this.data.customerName,
          status: dbInst.command.neq('cancelled')
        }, 'date', 'desc'),
        db.queryAll(COLLECTIONS.INCOME, {
          source: this.data.customerName
        })
      ])

      const history = resRes.data
      const totalSpending = incRes.data.reduce((s, i) => s + (i.amount || 0), 0)

      // Preferred room
      const roomCount = {}
      history.forEach(h => {
        const room = h.roomName || h.room || '未知'
        roomCount[room] = (roomCount[room] || 0) + 1
      })
      const preferredRoom = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '未知'

      this.setData({
        loading: false,
        totalVisits: history.length,
        totalSpending: formatAmount(totalSpending),
        preferredRoom,
        lastVisit: history[0] ? formatDate(history[0].date) : '-',
        visitHistory: history.slice(0, 20)
      })
    } catch (err) {
      this.setData({ loading: false })
    }
  }
})
