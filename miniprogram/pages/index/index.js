const app = getApp()
var _helpers = require('../../utils/helpers')
var formatDate = _helpers.formatDate
var getChinaToday = _helpers.getChinaToday
var createChinaDate = _helpers.createChinaDate
var _perm = require('../../utils/permission')
var hasPermission = _perm.hasPermission
var ACTIONS = _perm.ACTIONS
var _dbmod = require('../../utils/db')
var COLLECTIONS = _dbmod.COLLECTIONS
var db = require('../../utils/db')
var _ff = require('../../utils/feature-flags')
var AI_ENABLED = _ff.AI_ENABLED
var reservationChange = require('../../utils/reservation-change')

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
    monthlyFixedCost: '0.00',
    showSummary: false,
    canAddReservation: false,
    canAddPurchase: false,
    canAddIncome: false,
    unreadAnnouncementCount: 0,
    hasUrgentUnread: false,
    pendingApprovalCount: 0,
    pendingReimburseCount: 0,
    showTodo: false,
    showAIEntry: false,
    venueName: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setActiveByPage('/pages/index/index')
    }
    // 从预约详情返回后，检查是否还有未读变动需要继续显示
    if (this._pendingChangeReminderRefresh) {
      this._pendingChangeReminderRefresh = false
      this._checkRemainingChanges()
    }
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      venueName: app.globalData.venueName,
      todayDate: getChinaToday(),
      showSummary: hasPermission('income', ACTIONS.VIEW),
      canAddReservation: hasPermission('reservation', ACTIONS.ADD),
      canAddPurchase: hasPermission('purchase', ACTIONS.ADD),
      canAddIncome: hasPermission('income', ACTIONS.ADD),
      showTodo: hasPermission('purchase', ACTIONS.APPROVE) || hasPermission('purchase', ACTIONS.REIMBURSE),
      showAIEntry: AI_ENABLED && hasPermission('ai', ACTIONS.VIEW)
    })
    // 30秒内不重复查询，切换 tab 回来时直接用缓存
    const now = Date.now()
    if (this._lastLoadTime && now - this._lastLoadTime < 30000) {
      // 缓存命中也要重启公告轮播（onHide 时已清掉定时器）
      if (this.data.announcements && this.data.announcements.length > 1) {
        this.startMarqueeCycle()
      }
      this.showReservationChangeReminder()
      return
    }

    // 预拉取缓存恢复场地名称（不等云函数返回）
    if (app.globalData.prefetchData && !this._lastLoadTime && app.globalData.prefetchData.venueName) {
      this.setData({ venueName: app.globalData.prefetchData.venueName })
    }

    this.loadData()
    this.checkAISupport()
  },

  async loadData() {
    this.setData({ loading: true })

    if (this._loadTimeoutId) clearTimeout(this._loadTimeoutId)

    // Timeout protection - fail fast if page doesn't respond
    this._loadTimeoutId = setTimeout(() => {
      this._loadTimeoutId = null
      if (this.data.loading) {
        console.warn('首页加载超时，强制结束加载状态')
        this.setData({ loading: false })
      }
    }, 8000)

    try {
      const dbInst = db.getDb()
      const _ = dbInst.command
      const today = getChinaToday()

      // Calculate tomorrow in China timezone by parsing today's string
      var parts = today.split('-')
      var tomorrowDate = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + 1))
      const tomorrow = formatDate(tomorrowDate)

      const todayStart = createChinaDate(today)
      const todayEnd = createChinaDate(today, 23, 59, 59)
      const tomorrowStart = createChinaDate(tomorrow)
      const tomorrowEnd = createChinaDate(tomorrow, 23, 59, 59)

      // 核心数据并行查询：用 queryAll 绕过云数据库单次读取条数限制
      var canViewFinanceSummary = hasPermission('income', ACTIONS.VIEW)
      var _allRes = await Promise.all([
        db.queryAll(COLLECTIONS.RESERVATION, {
          date: _.gte(todayStart).and(_.lte(todayEnd)),
          status: 'confirmed'
        }, 'time', 'asc'),
        db.queryAll(COLLECTIONS.RESERVATION, {
          date: _.gte(tomorrowStart).and(_.lte(tomorrowEnd)),
          status: 'confirmed'
        }, 'time', 'asc'),
        canViewFinanceSummary ? db.queryAll(COLLECTIONS.INCOME, { date: today }) : Promise.resolve({ data: [] }),
        canViewFinanceSummary ? db.queryAll(COLLECTIONS.EXPENSE, { date: today }) : Promise.resolve({ data: [] }),
        canViewFinanceSummary ? db.queryAll(COLLECTIONS.PURCHASE, { date: today }) : Promise.resolve({ data: [] }),
        canViewFinanceSummary ? db.queryAll(COLLECTIONS.FIXED_EXPENSE, { active: true }) : Promise.resolve({ data: [] })
      ])
      var todayRes = _allRes[0]
      var tomorrowRes = _allRes[1]
      var todayIncomeRes = _allRes[2]
      var todayExpenseRes = _allRes[3]
      var todayPurchaseRes = _allRes[4]
      var fixedExpenseRes = _allRes[5]

      // 公告非阻塞查询（用 .get() 代替 queryAll）
      let announcementsData = []
      let unreadAnnouncementCount = 0
      let hasUrgentUnread = false
      try {
        const userInfo = app.globalData.userInfo
        const announcementRes = await db.queryAll(COLLECTIONS.ANNOUNCEMENT, { active: true }, 'createdAt', 'desc')
        announcementsData = (announcementRes.data || []).filter(a => {
          if (!a.startDate && !a.endDate) {
            return formatDate(a.createdAt) === today
          }
          if (a.startDate && a.startDate > today) return false
          if (a.endDate && a.endDate < today) return false
          return true
        })
        if (userInfo && userInfo._id) {
          unreadAnnouncementCount = announcementsData.filter(a => !(a.readBy || []).includes(userInfo._id)).length
          hasUrgentUnread = announcementsData.some(a => !(a.readBy || []).includes(userInfo._id) && a.priority === 'urgent')
        }
      } catch (e) {
        console.log('公告查询失败，不影响首页显示:', e.errMsg)
      }

      const lunchRes = (todayRes.data || []).filter(r => r.time === '中午')
      const dinnerRes = (todayRes.data || []).filter(r => r.time === '晚上')
      const tomorrowData = tomorrowRes.data || []
      const tomorrowPreview = tomorrowData.slice(0, 3)

      // 整数分运算避免浮点精度丢失
      var toCents = function(a) { var n = Number(a); return Math.round(n ? n * 100 : 0) }
      var fromCents = function(c) { return (c / 100).toFixed(2) }
      var incomeCents = (todayIncomeRes.data || []).reduce(function(s, item) { return s + toCents(item.amount) }, 0)
      var expenseCents = (todayExpenseRes.data || []).reduce(function(s, item) { return s + toCents(item.amount) }, 0)
      expenseCents += (todayPurchaseRes.data || []).filter(function(p) { return !p.status || p.status === 'reimbursed' }).reduce(function(s, item) { return s + toCents(item.amount) }, 0)

      var monthlyFixedCostCents = 0
      ;(fixedExpenseRes.data || []).forEach(function(item) {
        if (item.monthlyAmount) {
          if (item.startDate && item.startDate > today) return
          if (item.endDate && item.endDate < today) return
          monthlyFixedCostCents += toCents(item.monthlyAmount)
        }
      })

      this.setData({
        loading: false,
        lunchReservations: lunchRes,
        dinnerReservations: dinnerRes,
        tomorrowReservations: tomorrowData,
        tomorrowPreview: tomorrowPreview,
        todayIncome: fromCents(incomeCents),
        todayExpense: fromCents(expenseCents),
        monthlyFixedCost: fromCents(monthlyFixedCostCents),
        announcements: announcementsData,
        currentAnnouncementIndex: 0,
        currentAnnouncement: announcementsData.length > 0 ? announcementsData[0] : null,
        announcementEmoji: announcementsData.length > 0 ? this.getPriorityEmoji(announcementsData[0].priority) : '📢',
        unreadAnnouncementCount: unreadAnnouncementCount,
        hasUrgentUnread: hasUrgentUnread
      })
      this._lastLoadTime = Date.now()
      this.startMarqueeCycle()
      if (this.data.showTodo) {
        this.loadTodoCounts()
      }
      this.showReservationChangeReminder()
    } catch (err) {
      console.error('加载首页数据失败:', err)
      this.setData({ loading: false })
    } finally {
      if (this._loadTimeoutId) { clearTimeout(this._loadTimeoutId); this._loadTimeoutId = null }
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
    var id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/reservation-detail/index?id=' + encodeURIComponent(id) })
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
    var ann = this.data.currentAnnouncement
    if (ann && ann._id) {
      wx.navigateTo({ url: '/pages/announcement-detail/index?id=' + encodeURIComponent(ann._id) })
    } else {
      wx.switchTab({ url: '/pages/announcements/index' })
    }
  },

  onNotificationTap() {
    var ann = this.data.currentAnnouncement
    if (this.data.unreadAnnouncementCount > 0 && ann && ann._id) {
      wx.navigateTo({ url: '/pages/announcement-detail/index?id=' + encodeURIComponent(ann._id) })
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

    // 节奏：5s 滚到最左 + 10s 停留 = 15s 一轮，到下一条
    this._marqueeTimer = setInterval(() => {
      const nextIndex = (this.data.currentAnnouncementIndex + 1) % announcements.length
      const next = announcements[nextIndex]
      // 通过 currentAnnouncementIndex 奇偶切换 a/b class 重启 CSS 动画，不再使用 marqueeReset 双 setData
      this.setData({
        currentAnnouncementIndex: nextIndex,
        currentAnnouncement: next,
        announcementEmoji: this.getPriorityEmoji(next.priority)
      })
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
      // 与 todo 页面逻辑一致：待报销 = approved 且非自己提交的采购单
      var reimbursedRes = await dbInst.collection(COLLECTIONS.PURCHASE)
        .where({
          status: 'approved',
          purchaseBy: _.neq(userInfo._id)
        }).count()
      this.setData({
        pendingApprovalCount: pendingRes.total || 0,
        pendingReimburseCount: reimbursedRes.total || 0
      })
    } catch (e) {
      console.error('加载待办计数失败:', e.errMsg || e.message || e)
    }
  },

  onTodoTap() {
    if (!hasPermission('purchase', ACTIONS.APPROVE) && !hasPermission('purchase', ACTIONS.REIMBURSE)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/todo/index' })
  },

  async showReservationChangeReminder() {
    if (this._reservationChangeReminderShowing || !hasPermission('reservation', ACTIONS.VIEW)) return
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) return

    try {
      var changes = await reservationChange.queryUnreadImportantChanges(userInfo._id)
      if (!changes.length) return
      this._reservationChangeReminderShowing = true
      this._renderChangeReminder(changes)
    } catch (e) {
      this._reservationChangeReminderShowing = false
    }
  },

  _renderChangeReminder(changes) {
    var visibleChanges = changes.slice(0, 5)
    var moreCount = changes.length - visibleChanges.length
    this._reservationChangeAllChanges = changes
    this._reservationChangeVisibleChanges = visibleChanges
    this.setData({
      changeReminderVisible: true,
      changeReminderTitle: reservationChange.getReservationChangeReminderTitle(visibleChanges, getChinaToday()),
      changeReminderItems: visibleChanges,
      changeReminderMore: moreCount > 0 ? moreCount : 0
    })
  },

  async onChangeReminderClose() {
    var userInfo = app.globalData.userInfo
    var visibleChanges = this._reservationChangeVisibleChanges || []
    this.setData({ changeReminderVisible: false })
    this._reservationChangeReminderShowing = false
    if (userInfo && userInfo._id && visibleChanges.length) {
      try {
        await reservationChange.markChangesRead(visibleChanges, userInfo._id)
      } catch (e) {
        console.error('标记变动已读失败:', e.errMsg || e.message || e)
      }
    }
  },

  async onChangeReminderConfirm() {
    // 查看详情：跳转第一条，返回后自动刷新剩余未读
    var userInfo = app.globalData.userInfo
    var visibleChanges = this._reservationChangeVisibleChanges || []
    if (!visibleChanges.length) {
      this.setData({ changeReminderVisible: false })
      this._reservationChangeReminderShowing = false
      return
    }
    var firstChange = visibleChanges[0]
    // 先标记这一条已读
    if (userInfo && userInfo._id && firstChange._id) {
      try {
        await reservationChange.markChangesRead([firstChange], userInfo._id)
      } catch (e) {
        console.error('标记变动已读失败:', e.errMsg || e.message || e)
      }
    }
    this.setData({ changeReminderVisible: false })
    this._pendingChangeReminderRefresh = true
    if (firstChange.reservationId) {
      wx.navigateTo({ url: '/pages/reservation-detail/index?id=' + encodeURIComponent(firstChange.reservationId) })
    } else {
      // 没有关联预约ID，直接检查剩余
      this._checkRemainingChanges()
    }
  },

  // 点击单条变动直接跳转详情
  async onChangeReminderItemTap(e) {
    var index = e.currentTarget.dataset.index
    var visibleChanges = this._reservationChangeVisibleChanges || []
    var change = visibleChanges[index]
    if (!change) return
    var userInfo = app.globalData.userInfo
    if (userInfo && userInfo._id && change._id) {
      try {
        await reservationChange.markChangesRead([change], userInfo._id)
      } catch (e) {
        console.error('标记变动已读失败:', e.errMsg || e.message || e)
      }
    }
    this.setData({ changeReminderVisible: false })
    this._pendingChangeReminderRefresh = true
    if (change.reservationId) {
      wx.navigateTo({ url: '/pages/reservation-detail/index?id=' + encodeURIComponent(change.reservationId) })
    } else {
      this._checkRemainingChanges()
    }
  },

  // 检查剩余未读变动，有则继续弹窗
  async _checkRemainingChanges() {
    var userInfo = app.globalData.userInfo
    if (!userInfo || !userInfo._id) {
      this._reservationChangeReminderShowing = false
      return
    }
    try {
      var changes = await reservationChange.queryUnreadImportantChanges(userInfo._id)
      if (changes.length) {
        this._renderChangeReminder(changes)
      } else {
        this._reservationChangeReminderShowing = false
      }
    } catch (e) {
      this._reservationChangeReminderShowing = false
    }
  },

  onHide() {
    if (this._marqueeTimer) {
      clearInterval(this._marqueeTimer)
      this._marqueeTimer = null
    }
    if (this._marqueeResumeTimer) {
      clearTimeout(this._marqueeResumeTimer)
      this._marqueeResumeTimer = null
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  checkAISupport() {
    // onShow 中已设置了 showAIEntry 初始值，此处仅做设备能力降级
    if (typeof wx.checkIsSupportAgent === 'function') {
      wx.checkIsSupportAgent({
        success: (res) => {
          // Only hide if device explicitly doesn't support agent;
          // isSupport=true or API uncertainty → keep showing (permission already granted)
          if (res.isSupport === false) {
            this.setData({ showAIEntry: false })
          }
        },
        fail: () => {
          // API 不支持时保持权限值，不强制隐藏
        }
      })
    }
  },

  // 打开 AI 助手
  onOpenAI() {
    wx.navigateTo({ url: '/pages/ai-chat/index' })
  }
})