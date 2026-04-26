const app = getApp()
const { formatDate, formatTime, getMonthRange } = require('../../../utils/helpers')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    staffId: '',
    staffName: '',
    currentMonth: '',
    loading: true,
    totalDays: 0,
    totalHours: '0.0',
    totalLates: 0,
    records: [],
    calendarDays: []
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    const name = decodeURIComponent(options.staffName || '')
    const range = getMonthRange(0)
    this.setData({ theme, staffId: options.staffId, staffName: name, currentMonth: range.label })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const range = getMonthRange(0)

      const res = await db.collection(COLLECTIONS.CLOCKIN).where({
        staffId: this.data.staffId,
        date: db.command.gte(range.start).and(db.command.lte(range.end))
      }).orderBy('date', 'asc').get()

      const records = res.data.map(r => ({
        ...r,
        dateStr: formatDate(r.date),
        isLate: r.clockInTime && r.clockInTime > '09:00'
      }))

      const totalDays = records.length
      const totalHours = records.reduce((sum, r) => {
        if (r.clockInTime && r.clockOutTime) {
          const [hi, mi] = r.clockInTime.split(':').map(Number)
          const [ho, mo] = r.clockOutTime.split(':').map(Number)
          return sum + (ho - hi) + (mo - mi) / 60
        }
        return sum
      }, 0)
      const totalLates = records.filter(r => r.isLate).length

      const calendarDays = this.buildCalendar(records)

      this.setData({
        loading: false,
        records,
        totalDays,
        totalHours: totalHours.toFixed(1),
        totalLates,
        calendarDays
      })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  buildCalendar(records) {
    const range = getMonthRange(0)
    const d = new Date(range.start)
    const year = d.getFullYear()
    const month = d.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = formatDate(new Date())

    const clockedDates = {}
    records.forEach(r => { clockedDates[formatDate(r.date)] = true })

    const days = []
    for (let i = 0; i < firstDay; i++) days.push({ day: '', empty: true })
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        day,
        dateStr,
        isToday: dateStr === today,
        isClocked: !!clockedDates[dateStr]
      })
    }
    return days
  },

  prevMonth() {
    const range = getMonthRange(-1)
    this.setData({ currentMonth: range.label })
    this.loadData()
  },

  nextMonth() {
    const range = getMonthRange(1)
    this.setData({ currentMonth: range.label })
    this.loadData()
  }
})
