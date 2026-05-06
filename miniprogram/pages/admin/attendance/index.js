const app = getApp()
const { formatDate, formatTime, getRoleName, getMonthRange } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    currentMonth: '',
    monthOffset: 0,
    staffAttendance: [],
    workStartTime: '09:00',
    workEndTime: '18:00',
    showSettings: false,
    settingsStartTime: '09:00',
    settingsEndTime: '18:00'
  },

  onLoad() {
    if (!hasPermission('attendance', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看考勤', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    const theme = app.getThemePageData()
    const range = getMonthRange(0)
    this.setData({ theme, currentMonth: range.label, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadSettings()
  },

  onShow() {
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
      this.setData({ workStartTime, workEndTime, settingsStartTime: workStartTime, settingsEndTime: workEndTime })
    } catch (err) {
      console.error('加载考勤设置失败', err)
    }
  },

  getTimeMinutes(t) {
    if (!t) return -1
    const parts = t.split(':')
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  },

  toTimeStr(v) {
    if (!v) return '-'
    const d = new Date(v)
    if (isNaN(d.getTime())) return String(v)
    return formatTime(d)
  },

  isLateTime(clockInTime, thresholdStr) {
    if (!clockInTime) return false
    const d = new Date(clockInTime)
    if (isNaN(d.getTime())) return false
    const clockInMin = d.getHours() * 60 + d.getMinutes()
    return clockInMin > this.getTimeMinutes(thresholdStr)
  },

  isEarlyLeaveTime(clockOutTime, thresholdStr) {
    if (!clockOutTime) return false
    const d = new Date(clockOutTime)
    if (isNaN(d.getTime())) return false
    const clockOutMin = d.getHours() * 60 + d.getMinutes()
    return clockOutMin < this.getTimeMinutes(thresholdStr)
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const range = getMonthRange(this.data.monthOffset)

      const [staffRes, clockinRes] = await Promise.all([
        db.queryAll(COLLECTIONS.STAFF, { status: 'active' }),
        db.queryAll(COLLECTIONS.CLOCKIN, {
          date: db.getDb().command.gte(new Date(range.start + 'T00:00:00')).and(db.getDb().command.lte(new Date(range.end + 'T23:59:59')))
        })
      ])

      const clockinMap = {}
      ;(clockinRes.data || []).forEach(c => {
        if (!clockinMap[c.staffId]) clockinMap[c.staffId] = []
        clockinMap[c.staffId].push(c)
      })

      const { workStartTime, workEndTime } = this.data
      const startMinutes = this.getTimeMinutes(workStartTime)
      const endMinutes = this.getTimeMinutes(workEndTime)

      const staffAttendance = (staffRes.data || []).map(s => {
        const records = clockinMap[s._id] || []
        const days = records.length
        let totalHours = 0
        let lates = 0
        let earlyLeaves = 0
        const mappedRecords = records.map(r => {
          const clockInStr = this.toTimeStr(r.clockInTime)
          const clockOutStr = this.toTimeStr(r.clockOutTime)
          const late = this.isLateTime(r.clockInTime, workStartTime)
          const early = this.isEarlyLeaveTime(r.clockOutTime, workEndTime)
          if (late) lates++
          if (early) earlyLeaves++

          let durationStr = '-'
          if (r.clockInTime && r.clockOutTime) {
            const ci = new Date(r.clockInTime)
            const co = new Date(r.clockOutTime)
            if (!isNaN(ci.getTime()) && !isNaN(co.getTime())) {
              const mins = (co.getHours() * 60 + co.getMinutes()) - (ci.getHours() * 60 + ci.getMinutes())
              if (mins > 0) {
                const h = Math.floor(mins / 60)
                const m = mins % 60
                durationStr = `${h}h ${m}m`
                totalHours += mins / 60
              }
            }
          }

          return {
            dateStr: formatDate(r.date),
            clockInTimeStr: clockInStr,
            clockOutTimeStr: clockOutStr,
            duration: durationStr,
            isLate: late,
            isEarlyLeave: early
          }
        })

        return {
          _id: s._id,
          name: s.name,
          nameInitial: (s.name || '?').charAt(0),
          role: s.role,
          roleName: getRoleName(s.role),
          days,
          hours: totalHours.toFixed(1),
          lates,
          earlyLeaves,
          expanded: false,
          records: mappedRecords
        }
      })

      this.setData({ loading: false, staffAttendance })
    } catch (err) {
      console.error('加载考勤数据失败', err)
      this.setData({ loading: false })
    }
  },

  prevMonth() {
    const offset = this.data.monthOffset - 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, currentMonth: range.label })
    this.loadData()
  },

  nextMonth() {
    const offset = this.data.monthOffset + 1
    const range = getMonthRange(offset)
    this.setData({ monthOffset: offset, currentMonth: range.label })
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
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings })
  },

  onSettingsStartChange(e) {
    this.setData({ settingsStartTime: e.detail.value })
  },

  onSettingsEndChange(e) {
    this.setData({ settingsEndTime: e.detail.value })
  },

  async onSaveWorkTime() {
    const { settingsStartTime, settingsEndTime } = this.data
    wx.showLoading({ title: '保存中' })
    try {
      // Save work_start_time
      const startExisting = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'work_start_time' })
      if (startExisting.data && startExisting.data.length > 0) {
        await db.updateDoc(COLLECTIONS.SETTINGS, startExisting.data[0]._id, { value: settingsStartTime })
      } else {
        await db.addDoc(COLLECTIONS.SETTINGS, { key: 'work_start_time', value: settingsStartTime })
      }

      // Save work_end_time
      const endExisting = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'work_end_time' })
      if (endExisting.data && endExisting.data.length > 0) {
        await db.updateDoc(COLLECTIONS.SETTINGS, endExisting.data[0]._id, { value: settingsEndTime })
      } else {
        await db.addDoc(COLLECTIONS.SETTINGS, { key: 'work_end_time', value: settingsEndTime })
      }

      this.setData({ workStartTime: settingsStartTime, workEndTime: settingsEndTime, showSettings: false })
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.loadData()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
