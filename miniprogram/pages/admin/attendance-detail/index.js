const app = getApp()
const { formatDate, formatTime, getMonthRange } = require('../../../utils/helpers')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    staffId: '',
    staffName: '',
    currentMonth: '',
    loading: true,
    totalDays: 0,
    totalHours: '0.0',
    totalLates: 0,
    totalEarlyLeaves: 0,
    records: [],
    calendarDays: [],
    workStartTime: '09:00',
    workEndTime: '18:00'
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    const name = decodeURIComponent(options.staffName || '')
    const range = getMonthRange(0)
    this.setData({ theme, staffId: options.staffId, staffName: name, currentMonth: range.label, monthOffset: 0, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadSettings()
    this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadSettings() {
    try {
      const startRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'work_start_time' })
      const endRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'work_end_time' })
      let workStartTime = '09:00'
      let workEndTime = '18:00'
      if (startRes.data && startRes.data.length > 0) workStartTime = String(startRes.data[0].value)
      if (endRes.data && endRes.data.length > 0) workEndTime = String(endRes.data[0].value)
      this.setData({ workStartTime, workEndTime })
    } catch (err) {
      console.error('加载考勤设置失败', err)
    }
  },

  getTimeMinutes(t) {
    if (!t) return -1
    const parts = t.split(':')
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const range = getMonthRange(this.data.monthOffset || 0)

      const res = await db.queryAll(COLLECTIONS.CLOCKIN, {
        staffId: this.data.staffId,
        date: db.getDb().command.gte(new Date(range.start + 'T00:00:00')).and(db.getDb().command.lte(new Date(range.end + 'T23:59:59')))
      }, 'date', 'asc')

      const { workStartTime, workEndTime } = this.data
      const startMinutes = this.getTimeMinutes(workStartTime)
      const endMinutes = this.getTimeMinutes(workEndTime)

      let totalHours = 0
      let totalLates = 0
      let totalEarlyLeaves = 0

      const records = (res.data || []).map(r => {
        let isLate = false
        let isEarlyLeave = false

        if (r.clockInTime) {
          const d = new Date(r.clockInTime)
          if (!isNaN(d.getTime())) {
            const min = d.getHours() * 60 + d.getMinutes()
            isLate = min > startMinutes
          }
        }
        if (r.clockOutTime) {
          const d = new Date(r.clockOutTime)
          if (!isNaN(d.getTime())) {
            const min = d.getHours() * 60 + d.getMinutes()
            isEarlyLeave = min < endMinutes
          }
        }

        if (isLate) totalLates++
        if (isEarlyLeave) totalEarlyLeaves++

        if (r.clockInTime && r.clockOutTime) {
          const ci = new Date(r.clockInTime)
          const co = new Date(r.clockOutTime)
          if (!isNaN(ci.getTime()) && !isNaN(co.getTime())) {
            const mins = (co.getHours() * 60 + co.getMinutes()) - (ci.getHours() * 60 + ci.getMinutes())
            if (mins > 0) totalHours += mins / 60
          }
        }

        return {
          ...r,
          dateStr: formatDate(r.date),
          clockInTime: r.clockInTime ? formatTime(new Date(r.clockInTime)) : '-',
          clockOutTime: r.clockOutTime ? formatTime(new Date(r.clockOutTime)) : '-',
          isLate,
          isEarlyLeave
        }
      })

      const totalDays = records.length

      const calendarDays = this.buildCalendar(records)

      this.setData({
        loading: false,
        records,
        totalDays,
        totalHours: totalHours.toFixed(1),
        totalLates,
        totalEarlyLeaves,
        calendarDays
      })
    } catch (err) {
      console.error('加载考勤详情失败', err)
      this.setData({ loading: false })
    }
  },

  buildCalendar(records) {
    const range = getMonthRange(this.data.monthOffset || 0)
    const d = new Date(range.start)
    const year = d.getFullYear()
    const month = d.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = formatDate(new Date())

    const clockedDates = {}
    records.forEach(r => { clockedDates[formatDate(r.date)] = true })

    const days = []
    for (let i = 0; i < firstDay; i++) days.push({ key: 'empty-' + i, day: '', empty: true })
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        key: 'day-' + dateStr,
        day,
        dateStr,
        isToday: dateStr === today,
        isClocked: !!clockedDates[dateStr]
      })
    }
    return days
  },

  prevMonth() {
    const offset = (this.data.monthOffset || 0) - 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, currentMonth: range.label })
    this.loadData()
  },

  nextMonth() {
    const offset = (this.data.monthOffset || 0) + 1
    if (offset > 0) return
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, currentMonth: range.label })
    this.loadData()
  }
})
