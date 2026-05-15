const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    todayDate: '',
    announcements: [],
    currentAnnouncementIndex: 0,
    currentAnnouncement: null,
    announcementEmoji: '📢',
    marqueePaused: false,
    lunchReservations: [],
    dinnerReservations: [],
    tomorrowReservations: [],
    tomorrowPreview: [],
    todayIncome: '0.00',
    todayExpense: '0.00',
    monthlyFixedCost: 0,
    showSummary: false,
    canAddReservation: false,
    canAddPurchase: false,
    canAddIncome: false,
    unreadAnnouncementCount: 0,
    hasUrgentUnread: false,
    marqueeReset: false,
    pendingApprovalCount: 0,
    pendingReimburseCount: 0,
    showTodo: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 })
    }
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      venueName: app.globalData.venueName,
      todayDate: formatDate(new Date()),
      showSummary: hasPermission('income', ACTIONS.VIEW),
      canAddReservation: hasPermission('reservation', ACTIONS.ADD),
      canAddPurchase: hasPermission('purchase', ACTIONS.ADD),
      canAddIncome: hasPermission('income', ACTIONS.ADD),
      showTodo: hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE)
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })

    // Timeout protection - fail fast if page doesn't respond
    const timeoutId = setTimeout(() => {
      if (this.data.loading) {
        console.warn('首页加载超时，强制结束加载状态')
        this.setData({ loading: false })
      }
    }, 10000) // 10 second timeout

    try {
      const dbInst = db.getDb()
      const _ = dbInst.command
      const now = new Date()
      const today = formatDate(now)

      const tomorrowDate = new Date(now)
      tomorrowDate.setDate(tomorrowDate.getDate() + 1)

      // Build date ranges for today and tomorrow
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const tomorrowStart = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 0, 0, 0)
      const tomorrowEnd = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate(), 23, 59, 59)

      // Query core data first (parallel)
      const [todayRes, tomorrowRes, todayIncomeRes, todayExpenseRes, todayPurchaseRes, fixedExpenseItemsRes] = await Promise.all([
        dbInst.collection(COLLECTIONS.RESERVATION).where({
          date: _.gte(todayStart).and(_.lte(todayEnd)),
          status: 'confirmed'
        }).orderBy('time', 'asc').get(),
        dbInst.collection(COLLECTIONS.RESERVATION).where({
          date: _.gte(tomorrowStart).and(_.lte(tomorrowEnd)),
          status: 'confirmed'
        }).orderBy('time', 'asc').get(),
        // Income/expense dates stored as "YYYY-MM-DD" strings — use exact string match
        dbInst.collection(COLLECTIONS.INCOME).where({
          date: today
        }).get(),
        dbInst.collection(COLLECTIONS.EXPENSE).where({
          date: today
        }).get(),
        // Today's purchase costs
        dbInst.collection(COLLECTIONS.PURCHASE).where({
          date: today
        }).get(),
        // Fixed expense items (new format: monthlyAmount items; old format: date-based)
        db.queryAll(COLLECTIONS.FIXED_EXPENSE, { active: true })
      ])

      // Query announcement separately (non-blocking) - don't let it block the page
      let announcementsData = []
      let unreadAnnouncementCount = 0
      let hasUrgentUnread = false
      try {
        const userInfo = app.globalData.userInfo
        const announcementRes = await db.queryAll(COLLECTIONS.ANNOUNCEMENT, { active: true }, 'createdAt', 'desc')
        announcementsData = (announcementRes.data || []).filter(a => {
          // No startDate/endDate: only visible on creation day
          if (!a.startDate && !a.endDate) {
            return formatDate(a.createdAt) === today
          }
          if (a.startDate && a.startDate > today) return false
          if (a.endDate && a.endDate < today) return false
          return true
        })
        // Count unread announcements and check for urgent unread
        if (userInfo && userInfo._id) {
          unreadAnnouncementCount = announcementsData.filter(a => !(a.readBy || []).includes(userInfo._id)).length
          hasUrgentUnread = announcementsData.some(a => !(a.readBy || []).includes(userInfo._id) && a.priority === 'urgent')
        }
      } catch (e) {
        console.log('公告查询失败，不影响首页显示:', e.errMsg)
        announcementsData = []
      }

      const lunchRes = (todayRes.data || []).filter(r => r.time === '中午')
      const dinnerRes = (todayRes.data || []).filter(r => r.time === '晚上')
      const tomorrowData = tomorrowRes.data || []
      const tomorrowPreview = tomorrowData.slice(0, 3)

      const todayIncomeTotal = (todayIncomeRes.data || []).reduce((sum, item) => sum + (item.amount || 0), 0)
      const todayExpenseTotal = (todayExpenseRes.data || []).reduce((sum, item) => sum + (item.amount || 0), 0) +
        (todayPurchaseRes.data || []).filter(function(p) { return !p.status || p.status === 'reimbursed' }).reduce(function(sum, item) { return sum + (item.amount || 0) }, 0)
      // Fixed costs: sum monthlyAmount (new format), only include currently active items
      let monthlyFixedCostTotal = 0
      ;(fixedExpenseItemsRes.data || []).forEach(item => {
        if (item.monthlyAmount) {
          // Only include items active today (with startDate/endDate filtering)
          if (item.startDate && item.startDate > today) return
          if (item.endDate && item.endDate < today) return
          monthlyFixedCostTotal += Number(item.monthlyAmount) || 0
        }
      })

      console.log('首页数据:', {
        todayCount: todayRes.data?.length || 0,
        tomorrowCount: tomorrowData.length,
        announcementCount: announcementsData.length
      })

      this.setData({
        loading: false,
        lunchReservations: lunchRes,
        dinnerReservations: dinnerRes,
        tomorrowReservations: tomorrowData,
        tomorrowPreview: tomorrowPreview,
        todayIncome: todayIncomeTotal.toFixed(2),
        todayExpense: todayExpenseTotal.toFixed(2),
        monthlyFixedCost: monthlyFixedCostTotal,
        announcements: announcementsData,
        currentAnnouncementIndex: 0,
        currentAnnouncement: announcementsData.length > 0 ? announcementsData[0] : null,
        announcementEmoji: announcementsData.length > 0 ? this.getPriorityEmoji(announcementsData[0].priority) : '📢',
        unreadAnnouncementCount: unreadAnnouncementCount,
        hasUrgentUnread: hasUrgentUnread
      })
      this.startMarqueeCycle()
      if (this.data.showTodo) {
        this.loadTodoCounts()
      }
    } catch (err) {
      console.error('加载首页数据失败:', err)
      this.setData({ loading: false })
    } finally {
      clearTimeout(timeoutId)
    }
  },

  onAddReservation() {
    if (!hasPermission('reservation', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/reservation-add/index' })
  },

  onAddPurchase() {
    if (!hasPermission('purchase', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/purchase-add/index' })
  },

  onAddIncome() {
    if (!hasPermission('income', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/income-add/index' })
  },

  onReservationTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/reservation-detail/index?id=${id}` })
  },

  onIncomeTap() {
    wx.switchTab({ url: '/pages/income/index' })
  },

  onExpenseTap() {
    wx.switchTab({ url: '/pages/purchase/index' })
  },

  onViewAllReservations() {
    wx.switchTab({ url: '/pages/reservation/index' })
  },

  onAnnouncementTap() {
    const ann = this.data.currentAnnouncement
    if (ann && ann._id) {
      wx.navigateTo({ url: `/pages/announcement-detail/index?id=${ann._id}` })
    } else {
      wx.switchTab({ url: '/pages/announcements/index' })
    }
  },

  onNotificationTap() {
    const ann = this.data.currentAnnouncement
    if (this.data.unreadAnnouncementCount > 0 && ann && ann._id) {
      wx.navigateTo({ url: `/pages/announcement-detail/index?id=${ann._id}` })
    } else {
      wx.switchTab({ url: '/pages/announcements/index' })
    }
  },

  onMarqueeTouchStart() {
    this.setData({ marqueePaused: true })
    if (this._marqueeTimer) {
      clearInterval(this._marqueeTimer)
      this._marqueeTimer = null
    }
  },

  onMarqueeTouchEnd() {
    clearTimeout(this._marqueeResumeTimer)
    this._marqueeResumeTimer = setTimeout(() => {
      this.setData({ marqueePaused: false })
      this.startMarqueeCycle()
    }, 300)
  },

  getPriorityEmoji(priority) {
    const map = { urgent: '🚨', important: '⚠️', normal: '📢' }
    return map[priority] || '📢'
  },

  startMarqueeCycle() {
    if (this._marqueeTimer) clearInterval(this._marqueeTimer)
    const announcements = this.data.announcements
    if (announcements.length <= 1) return

    this._marqueeTimer = setInterval(() => {
      const nextIndex = (this.data.currentAnnouncementIndex + 1) % announcements.length
      const next = announcements[nextIndex]
      // Restart CSS marquee animation by briefly removing the element
      this.setData({ marqueeReset: true })
      setTimeout(() => {
        this.setData({
          currentAnnouncementIndex: nextIndex,
          currentAnnouncement: next,
          announcementEmoji: this.getPriorityEmoji(next.priority),
          marqueeReset: false
        })
      }, 60)
    }, 15000)
  },

  loadTodoCounts: async function() {
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) return
    try {
      var dbInst = db.getDb()
      var _ = dbInst.command
      var pendingRes = await dbInst.collection(COLLECTIONS.PURCHASE)
        .where({
          status: 'pending',
          approverId: userInfo._id,
          purchaseBy: _.neq(userInfo._id)
        }).count()
      var reimbursedRes = await dbInst.collection(COLLECTIONS.PURCHASE)
        .where({ status: 'approved' }).count()
      this.setData({
        pendingApprovalCount: pendingRes.total || 0,
        pendingReimburseCount: reimbursedRes.total || 0
      })
    } catch (e) {}
  },

  onTodoTap() {
    wx.navigateTo({ url: '/pages/todo/index' })
  },

  onHide() {
    if (this._marqueeTimer) {
      clearInterval(this._marqueeTimer)
      this._marqueeTimer = null
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  }
})