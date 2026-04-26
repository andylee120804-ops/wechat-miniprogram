const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    todayDate: '',
    latestAnnouncement: null,
    lunchReservations: [],
    dinnerReservations: [],
    tomorrowReservations: [],
    tomorrowPreview: [],
    todayIncome: '0.00',
    todayExpense: '0.00',
    showSummary: false,
    canAddReservation: false,
    canAddPurchase: false,
    canAddIncome: false
  },

  onShow() {
    const theme = app.getThemePageData()
    const userInfo = app.globalData.userInfo
    const isBoss = userInfo && userInfo.role === 'boss'
    this.setData({
      theme,
      todayDate: formatDate(new Date()),
      showSummary: isBoss,
      canAddReservation: app.hasPermission('reservation', 'add'),
      canAddPurchase: app.hasPermission('purchase', 'add'),
      canAddIncome: app.hasPermission('income', 'add')
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      const now = new Date()
      const today = formatDate(now)

      const tomorrowDate = new Date(now)
      tomorrowDate.setDate(tomorrowDate.getDate() + 1)
      const tomorrowStr = formatDate(tomorrowDate)

      // Build date ranges for today and tomorrow
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const tomorrowStart = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 0, 0, 0)
      const tomorrowEnd = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 23, 59, 59)

      // Query announcement separately to avoid blocking page load if collection doesn't exist
      let latestAnnouncement = null
      try {
        const announcementRes = await db.collection(COLLECTIONS.ANNOUNCEMENT).where({
          active: true
        }).orderBy('createdAt', 'desc').limit(1).get()
        const announcements = announcementRes.data || []
        latestAnnouncement = announcements.length > 0 ? announcements[0] : null
      } catch (e) {
        console.log('公告集合不存在或查询失败:', e.errMsg)
      }

      const [todayRes, tomorrowRes, todayIncomeRes, todayExpenseRes] = await Promise.all([
        db.collection(COLLECTIONS.RESERVATION).where({
          date: _.gte(todayStart).and(_.lte(todayEnd)),
          status: _.neq('cancelled')
        }).orderBy('time', 'asc').get(),
        db.collection(COLLECTIONS.RESERVATION).where({
          date: _.gte(tomorrowStart).and(_.lte(tomorrowEnd)),
          status: _.neq('cancelled')
        }).orderBy('time', 'asc').get(),
        db.collection(COLLECTIONS.INCOME).where({
          date: _.gte(todayStart).and(_.lte(todayEnd))
        }).get(),
        db.collection(COLLECTIONS.EXPENSE).where({
          date: _.gte(todayStart).and(_.lte(todayEnd))
        }).get()
      ])

      const lunchRes = (todayRes.data || []).filter(r => r.time === '中午')
      const dinnerRes = (todayRes.data || []).filter(r => r.time === '晚上')
      const tomorrowData = tomorrowRes.data || []
      const tomorrowPreview = tomorrowData.slice(0, 3)

      const todayIncomeTotal = (todayIncomeRes.data || []).reduce((sum, item) => sum + (item.amount || 0), 0)
      const todayExpenseTotal = (todayExpenseRes.data || []).reduce((sum, item) => sum + (item.amount || 0), 0)

      console.log('首页数据:', {
        todayCount: todayRes.data?.length || 0,
        tomorrowCount: tomorrowData.length,
        tomorrowStr: tomorrowStr,
        hasAnnouncement: !!latestAnnouncement
      })

      this.setData({
        loading: false,
        lunchReservations: lunchRes,
        dinnerReservations: dinnerRes,
        tomorrowReservations: tomorrowData,
        tomorrowPreview: tomorrowPreview,
        todayIncome: todayIncomeTotal.toFixed(2),
        todayExpense: todayExpenseTotal.toFixed(2),
        latestAnnouncement: latestAnnouncement
      })
    } catch (err) {
      console.error('加载首页数据失败:', err)
      this.setData({ loading: false })
    }
  },

  onAddReservation() {
    if (!app.hasPermission('reservation', 'add')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/reservation-add/index' })
  },

  onAddPurchase() {
    if (!app.hasPermission('purchase', 'add')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/purchase-add/index' })
  },

  onAddIncome() {
    if (!app.hasPermission('income', 'add')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/income-add/index' })
  },

  onReservationTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/reservation-detail/index?id=${id}` })
  },

  onViewAllReservations() {
    wx.switchTab({ url: '/pages/reservation/index' })
  },

  onAnnouncementTap() {
    wx.switchTab({ url: '/pages/announcements/index' })
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  }
})