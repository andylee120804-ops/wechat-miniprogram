const app = getApp()
const { formatDate, formatTime, getRoleName, getMonthRange } = require('../../../utils/helpers')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    loading: true,
    currentMonth: '',
    staffAttendance: []
  },

  onLoad() {
    if (!app.hasPermission('attendance', 'view')) {
      wx.showToast({ title: '无权限查看考勤', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    const theme = app.getThemePageData()
    const range = getMonthRange(0)
    this.setData({ theme, currentMonth: range.label, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadData()
  },

  onShow() {
    // No permission check here - menu already validated permission before allowing navigation
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const range = getMonthRange(0)
      const start = new Date(range.start)
      const end = new Date(range.end + 'T23:59:59')

      const [staffRes, clockinRes] = await Promise.all([
        db.collection(COLLECTIONS.STAFF).where({ status: 'active' }).get(),
        db.collection(COLLECTIONS.CLOCKIN).where({
          date: db.command.gte(range.start).and(db.command.lte(range.end))
        }).get()
      ])

      const clockinMap = {}
      clockinRes.data.forEach(c => {
        if (!clockinMap[c.staffId]) clockinMap[c.staffId] = []
        clockinMap[c.staffId].push(c)
      })

      const staffAttendance = staffRes.data.map(s => {
        const records = clockinMap[s._id] || []
        const days = records.length
        const totalHours = records.reduce((sum, r) => {
          if (r.clockInTime && r.clockOutTime) {
            const [hi, mi] = r.clockInTime.split(':').map(Number)
            const [ho, mo] = r.clockOutTime.split(':').map(Number)
            return sum + (ho - hi) + (mo - mi) / 60
          }
          return sum
        }, 0)
        const lates = records.filter(r => r.clockInTime && r.clockInTime > '09:00').length
        return {
          _id: s._id,
          name: s.name,
          role: s.role,
          roleName: getRoleName(s.role),
          days,
          hours: totalHours.toFixed(1),
          lates,
          expanded: false,
          records: records.map(r => ({
            ...r,
            dateStr: formatDate(r.date),
            clockInTimeStr: r.clockInTime || '-',
            clockOutTimeStr: r.clockOutTime || '-',
            duration: r.clockInTime && r.clockOutTime ? this.calcDuration(r.clockInTime, r.clockOutTime) : '-',
            isLate: r.clockInTime && r.clockInTime > '09:00'
          }))
        }
      })

      this.setData({ loading: false, staffAttendance })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  calcDuration(clockIn, clockOut) {
    const [hi, mi] = clockIn.split(':').map(Number)
    const [ho, mo] = clockOut.split(':').map(Number)
    const mins = (ho * 60 + mo) - (hi * 60 + mi)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}h ${m}m`
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
  },

  toggleExpand(e) {
    const index = e.currentTarget.dataset.index
    const staff = this.data.staffAttendance
    staff[index].expanded = !staff[index].expanded
    this.setData({ staffAttendance: staff })
  },

  onStaffTap(e) {
    const { id, name } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/attendance-detail/index?staffId=${id}&staffName=${encodeURIComponent(name)}` })
  }
})
