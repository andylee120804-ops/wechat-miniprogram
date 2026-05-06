const { formatDate, getReservationStatusText } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    currentYear: 0,
    currentMonth: 0,
    selectedDate: '',
    reservations: [],
    markDates: [],
    groupedReservations: {}
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 })
    }
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看预约', icon: 'none' })
      return
    }
    const app = getApp()
    const theme = app.getThemePageData()
    const now = new Date()
    const today = formatDate(now)
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      selectedDate: today
    })
    this.loadMonthReservations(now.getFullYear(), now.getMonth() + 1)
  },

  async loadMonthReservations(year, month) {
    try {
      this.setData({ loading: true })
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(startDate).and(_.lte(endDate))
      }, 'date', 'asc')

      const rawData = res.data || []
      const markDates = []
      const markDateSet = {}
      const reservations = rawData.map(function(r) {
        const dateStr = formatDate(r.date)
        if (!markDateSet[dateStr]) {
          markDateSet[dateStr] = true
          markDates.push(dateStr)
        }
        return { ...r, statusText: getReservationStatusText(r.status) }
      })

      this.setData({ markDates })

      // Load day reservations for currently selected date
      this.loadDayReservations(this.data.selectedDate)
    } catch (err) {
      handleCloudError(err, '加载月预约')
      this.setData({ loading: false })
    }
  },

  async loadDayReservations(dateStr) {
    if (!dateStr) return
    try {
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      // Parse the selected date string to start and end of day
      const parts = dateStr.split('-')
      const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
      const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(dayStart).and(_.lte(dayEnd))
      }, 'time', 'asc')

      const rawData = res.data || []
      const reservations = rawData.map(function(r) {
        return { ...r, statusText: getReservationStatusText(r.status) }
      })
      const grouped = this.groupByRoom(reservations)

      this.setData({
        reservations,
        groupedReservations: grouped,
        loading: false
      })
    } catch (err) {
      handleCloudError(err, '加载日预约')
      this.setData({ loading: false })
    }
  },

  groupByRoom(reservations) {
    const groups = { noon: [], night: [], full: [], big: [], small: [] }
    reservations.forEach(function(r) {
      const et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      if (et !== 'none') {
        if (!groups[et]) groups[et] = []
        groups[et].push(r)
      } else {
        const key = r.room || 'big'
        if (groups[key]) groups[key].push(r)
        else groups.big.push(r)
      }
    })
    return groups
  },

  onDayTap(e) {
    const date = e.detail.date
    if (!date) return
    this.setData({ selectedDate: date })
    this.loadDayReservations(date)
  },

  onMonthChange(e) {
    const year = e.detail.year
    const month = e.detail.month
    this.setData({ currentYear: year, currentMonth: month })
    this.loadMonthReservations(year, month)
  },

  onAddReservation() {
    if (!hasPermission('reservation', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限创建预约', icon: 'none' })
      return
    }
    wx.vibrateShort({ type: 'light' })
    wx.navigateTo({
      url: '/pages/reservation-add/index?date=' + this.data.selectedDate
    })
  },

  onReservationTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/reservation-detail/index?id=' + id
    })
  }
})