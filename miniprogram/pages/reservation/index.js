const { formatDate, getRoomName, getReservationStatusText } = require('../../utils/helpers')
const { hasPermission } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    currentYear: 0,
    currentMonth: 0,
    selectedDate: '',
    reservations: [],
    markDates: [],
    groupedReservations: {}
  },

  onShow() {
    if (!hasPermission('reservation', 'view')) {
      wx.showToast({ title: '无权限查看预约', icon: 'none' })
      return
    }
    const app = getApp()
    const theme = app.getThemePageData()
    const now = new Date()
    const today = formatDate(now)
    this.setData({
      theme,
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

      const reservations = res.data || []
      const markDates = []
      const markDateSet = {}
      reservations.forEach(function(r) {
        const dateStr = formatDate(r.date)
        if (!markDateSet[dateStr]) {
          markDateSet[dateStr] = true
          markDates.push(dateStr)
        }
        r.statusText = getReservationStatusText(r.status)
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

      const reservations = res.data || []
      // Add statusText to each reservation
      reservations.forEach(function(r) {
        r.statusText = getReservationStatusText(r.status)
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
    const groups = { exclusive: [], big: [], small: [] }
    reservations.forEach(function(r) {
      let key = r.room || 'big'
      if (r.isExclusive) key = 'exclusive'
      if (groups[key]) {
        groups[key].push(r)
      } else {
        groups.big.push(r)
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
    if (!hasPermission('reservation', 'create')) {
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