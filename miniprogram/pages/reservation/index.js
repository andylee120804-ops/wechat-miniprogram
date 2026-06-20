var _h = require('../../utils/helpers')
var formatDate = _h.formatDate
var getReservationStatusText = _h.getReservationStatusText
var getChinaToday = _h.getChinaToday
var createChinaDate = _h.createChinaDate
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const reservationConfig = require('../../utils/reservationConfig')

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
      this.getTabBar().setActiveByPage('/pages/reservation/index')
    }
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看预约', icon: 'none' })
      return
    }
    const app = getApp()
    const theme = app.getThemePageData()
    const now = new Date()
    const today = getChinaToday()
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

      const monthStr = String(month).padStart(2, '0')
      const startDate = createChinaDate(year + '-' + monthStr + '-01')
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = createChinaDate(year + '-' + monthStr + '-' + String(lastDay).padStart(2, '0'), 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(startDate).and(_.lte(endDate)),
        status: _.neq('cancelled')
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

      // Use China Standard Time boundaries for date range queries
      const dayStart = createChinaDate(dateStr)
      const dayEnd = createChinaDate(dateStr, 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(dayStart).and(_.lte(dayEnd))
      }, 'time', 'asc')

      const rawData = res.data || []
      const reservations = rawData.map(function(r) {
        // 优先显示菜价金额，否则显示标准餐标
        const displayPrice = (r.dishPrice && r.dishPrice > 0) ? r.dishPrice : r.standard
        return { ...r, statusText: getReservationStatusText(r.status), displayPrice }
      })
      var grouped = await this.groupByRoomDynamic(reservations)

      this.setData({
        reservations: reservations,
        groupedReservationsDynamic: grouped,
        loading: false
      })
    } catch (err) {
      handleCloudError(err, '加载日预约')
      this.setData({ loading: false })
    }
  },

  async groupByRoomDynamic(reservations) {
    var rooms = await reservationConfig.loadRooms()
    var enabledRooms = rooms.filter(function(r) { return r.enabled })
    var sortOrder = {}
    enabledRooms.forEach(function(r, i) { sortOrder[r.id] = i })

    var exclusiveOrder = { noon: 0, night: 1, full: 2 }
    var exclusiveLabels = { noon: '午包场', night: '晚包场', full: '全天包场' }

    // Predefined palette for group colors (cycled)
    var GROUP_COLORS = [
      { bg: 'rgba(201,169,110,0.15)', text: '#C9A96E' },
      { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
      { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' },
      { bg: 'rgba(168,130,255,0.15)', text: '#A882FF' },
      { bg: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
      { bg: 'rgba(248,113,113,0.15)', text: '#F87171' },
      { bg: 'rgba(45,212,191,0.15)', text: '#2DD4BF' }
    ]

    var grouped = {}
    var colorIdx = 0
    reservations.forEach(function(r) {
      var et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      var key, label
      if (et !== 'none') {
        key = et
        label = exclusiveLabels[et] || '包场'
      } else {
        key = r.room || 'big'
        label = r.roomName || key
      }
      if (!grouped[key]) {
        var ci = colorIdx % GROUP_COLORS.length
        grouped[key] = {
          key: key, label: label, items: [],
          color: GROUP_COLORS[ci].bg, textColor: GROUP_COLORS[ci].text
        }
        colorIdx++
      }
      grouped[key].items.push(r)
    })

    // Sort: exclusive groups first, then rooms by order
    var keys = Object.keys(grouped)
    keys.sort(function(a, b) {
      var aEx = exclusiveOrder[a] !== undefined
      var bEx = exclusiveOrder[b] !== undefined
      if (aEx !== bEx) return aEx ? -1 : 1
      if (aEx && bEx) return (exclusiveOrder[a] !== undefined ? exclusiveOrder[a] : 99) - (exclusiveOrder[b] !== undefined ? exclusiveOrder[b] : 99)
      return (sortOrder[a] !== undefined ? sortOrder[a] : 99) - (sortOrder[b] !== undefined ? sortOrder[b] : 99)
    })

    var result = []
    keys.forEach(function(k) { result.push(grouped[k]) })
    return result
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
    const today = getChinaToday()
    if (this.data.selectedDate < today) {
      wx.showToast({ title: '不能创建过去日期的预约', icon: 'none' })
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