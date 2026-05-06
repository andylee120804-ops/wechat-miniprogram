const app = getApp()
const { formatDate, formatTime, calcWorkDuration, isLate } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    selectedDate: '',
    isToday: true,
    hasClockedIn: false,
    hasClockedOut: false,
    clockInTime: '',
    clockOutTime: '',
    clockInTimeStr: '',
    clockOutTimeStr: '',
    location: '',
    locationText: '',
    monthlyRecords: [],
    // Makeup clock form
    makeupClockInTime: '',
    makeupClockOutTime: '',
    makeupReason: '',
    makeupCanSubmit: false
  },

  onLoad() {
    const today = formatDate(new Date())
    this.setData({ selectedDate: today, maxDate: today, isToday: true })
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.checkStatusByDate(this.data.selectedDate)
    this.loadMonthlyRecords()
  },

  onDateChange(e) {
    const date = e.detail.value
    const today = formatDate(new Date())
    const isToday = date === today
    this.setData({ selectedDate: date, isToday }, () => {
      this.checkStatusByDate(date)
    })
  },

  async checkStatusByDate(dateStr) {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) {
        this.setData({ loading: false })
        return
      }

      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const dayStart = new Date(dateStr + 'T00:00:00')
      const dayEnd = new Date(dateStr + 'T23:59:59')

      const res = await db.queryAll(COLLECTIONS.CLOCKIN, {
        staffId: userInfo._id,
        date: _.gte(dayStart).and(_.lte(dayEnd))
      }, 'createdAt', 'desc')

      const records = res.data || []
      if (records.length > 0) {
        const day = records[0]
        const clockInTime = day.clockInTime ? new Date(day.clockInTime) : null
        const clockOutTime = day.clockOutTime ? new Date(day.clockOutTime) : null

        this.setData({
          hasClockedIn: !!day.clockInTime,
          hasClockedOut: !!day.clockOutTime,
          clockInTime: day.clockInTime || '',
          clockOutTime: day.clockOutTime || '',
          clockInTimeStr: clockInTime ? formatTime(clockInTime) : '',
          clockOutTimeStr: clockOutTime ? formatTime(clockOutTime) : '',
          location: day.clockInLocation || '',
          locationText: day.clockInLocationText || '',
          recordId: day._id,
          loading: false
        })
      } else {
        this.setData({
          hasClockedIn: false,
          hasClockedOut: false,
          clockInTime: '',
          clockOutTime: '',
          clockInTimeStr: '',
          clockOutTimeStr: '',
          location: '',
          locationText: '',
          recordId: '',
          loading: false
        })
      }
    } catch (err) {
      handleCloudError(err, '检查打卡状态')
      this.setData({ loading: false })
    }
  },

  async loadMonthlyRecords() {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) return

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const res = await db.queryAll(COLLECTIONS.CLOCKIN, {
        staffId: userInfo._id,
        date: _.gte(monthStart).and(_.lte(monthEnd))
      }, 'date', 'desc')

      const records = (res.data || []).map(function(r) {
        const clockIn = r.clockInTime ? new Date(r.clockInTime) : null
        const clockOut = r.clockOutTime ? new Date(r.clockOutTime) : null
        return {
          _id: r._id,
          date: formatDate(r.date || r.clockInTime),
          clockInTimeStr: clockIn ? formatTime(clockIn) : '--',
          clockOutTimeStr: clockOut ? formatTime(clockOut) : '--',
          duration: calcWorkDuration(clockIn, clockOut),
          isLate: isLate(clockIn),
          isMakeUp: !!(r.isMakeUp)
        }
      })

      this.setData({ monthlyRecords: records })
    } catch (err) {
      handleCloudError(err, '加载月度记录')
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onClockTap() {
    if (this.data.hasClockedIn && !this.data.hasClockedOut) {
      this.onClockOut()
    } else {
      this.onClockIn()
    }
  },

  async onMakeUpClock() {
    const { selectedDate } = this.data
    wx.showModal({
      title: '确认补打卡',
      content: `确定要为 ${selectedDate} 提交补打卡申请吗？`,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          await this.doClockIn(true)
        }
      }
    })
  },

  onMakeUpClockInTimeChange(e) {
    const time = e.detail.value
    this.setData({ makeupClockInTime: time }, () => this.updateMakeupCanSubmit())
  },

  onMakeUpClockOutTimeChange(e) {
    const time = e.detail.value
    this.setData({ makeupClockOutTime: time }, () => this.updateMakeupCanSubmit())
  },

  onMakeupReasonInput(e) {
    const reason = e.detail.value
    this.setData({ makeupReason: reason }, () => this.updateMakeupCanSubmit())
  },

  updateMakeupCanSubmit() {
    const { makeupClockInTime, makeupClockOutTime, makeupReason, hasClockedIn, hasClockedOut } = this.data
    const needClockIn = !hasClockedIn
    const needClockOut = !hasClockedOut
    const hasClockIn = !!makeupClockInTime
    const hasClockOut = !!makeupClockOutTime
    const hasReason = !!(makeupReason && makeupReason.trim().length > 0)
    const timeFilled = (!needClockIn || hasClockIn) && (!needClockOut || hasClockOut)
    this.setData({ makeupCanSubmit: timeFilled && hasReason })
  },

  onMakeupSubmit() {
    const { makeupClockInTime, makeupClockOutTime, makeupReason, selectedDate, hasClockedIn, hasClockedOut } = this.data
    if (hasClockedIn && hasClockedOut) {
      wx.showToast({ title: '当日已完成打卡', icon: 'none' })
      return
    }
    if (!hasClockedIn && !hasClockedOut && (!makeupClockInTime || !makeupClockOutTime)) {
      wx.showToast({ title: '请选择上下班时间', icon: 'none' })
      return
    }
    if ((!hasClockedIn || !hasClockedOut) && (!makeupReason || !makeupReason.trim())) {
      wx.showToast({ title: '请填写补卡原因', icon: 'none' })
      return
    }
    this.doMakeupClock()
  },

  async onClockIn() {
    await this.doClockIn(false)
  },

  async doClockIn(isMakeUp) {
    const { hasClockedIn, selectedDate } = this.data
    if (hasClockedIn && !isMakeUp) {
      wx.showToast({ title: '当日已打卡', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '获取位置中...' })
      const locationData = await this.askLocation()
      wx.showLoading({ title: '打卡中...' })
      const userInfo = app.globalData.userInfo
      const clockTime = new Date()

      const res = await db.addDoc(COLLECTIONS.CLOCKIN, {
        staffId: userInfo._id,
        staffName: userInfo.name || '',
        date: new Date(selectedDate + 'T12:00:00'),
        clockInTime: clockTime,
        clockInLocation: locationData.location,
        clockInLocationText: locationData.locationText,
        isMakeUp: isMakeUp
      })

      log(LOG_TYPES.ATTENDANCE_CLOCK_IN, userInfo.name + ' ' + (isMakeUp ? '补打卡' : '上班打卡') + ' ' + selectedDate)

      this.setData({
        hasClockedIn: true,
        clockInTime: clockTime,
        clockInTimeStr: formatTime(clockTime),
        location: locationData.location,
        locationText: locationData.locationText,
        recordId: res._id
      })

      wx.vibrateShort({ type: 'medium' })
      wx.hideLoading()
      wx.showToast({ title: isMakeUp ? '补打卡申请已提交' : '上班打卡成功', icon: 'success' })
      this.loadMonthlyRecords()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '上班打卡')
    }
  },

  async doMakeupClock() {
    const { makeupClockInTime, makeupClockOutTime, makeupReason, selectedDate, recordId, hasClockedIn, hasClockedOut } = this.data
    try {
      wx.showLoading({ title: '提交中...' })
      const userInfo = app.globalData.userInfo

      // 场景A: 已有记录（补漏打卡）
      if (recordId) {
        const updateData = {}
        if (!hasClockedIn && makeupClockInTime) {
          const clockInDate = new Date(selectedDate + 'T' + makeupClockInTime + ':00')
          updateData.clockInTime = clockInDate
          updateData.clockInLocation = ''
          updateData.clockInLocationText = '补打卡（' + makeupReason.trim() + '）'
        }
        if (!hasClockedOut && makeupClockOutTime) {
          const clockOutDate = new Date(selectedDate + 'T' + makeupClockOutTime + ':00')
          updateData.clockOutTime = clockOutDate
          updateData.clockOutLocation = ''
          updateData.clockOutLocationText = '补打卡（' + makeupReason.trim() + '）'
        }
        updateData.isMakeUp = true
        updateData.makeupReason = makeupReason.trim()

        await db.updateDoc(COLLECTIONS.CLOCKIN, recordId, updateData)
        log(LOG_TYPES.ATTENDANCE_CLOCK_IN, userInfo.name + ' 补打卡 ' + selectedDate + ' 更新记录')
      } else {
        // 场景B: 无记录（新建完整记录）
        const clockInDate = new Date(selectedDate + 'T' + (makeupClockInTime || '09:00') + ':00')
        const clockOutDate = new Date(selectedDate + 'T' + (makeupClockOutTime || '18:00') + ':00')

        const newData = {
          staffId: userInfo._id,
          staffName: userInfo.name || '',
          date: new Date(selectedDate + 'T12:00:00'),
          clockInTime: clockInDate,
          clockOutTime: clockOutDate,
          clockInLocation: '',
          clockInLocationText: '补打卡（' + makeupReason.trim() + '）',
          clockOutLocation: '',
          clockOutLocationText: '补打卡（下班）',
          isMakeUp: true,
          makeupReason: makeupReason.trim()
        }

        // 只写入实际填写的时间
        if (!makeupClockInTime) delete newData.clockInTime
        if (!makeupClockOutTime) delete newData.clockOutTime

        await db.addDoc(COLLECTIONS.CLOCKIN, newData)
        log(LOG_TYPES.ATTENDANCE_CLOCK_IN, userInfo.name + ' 补打卡 ' + selectedDate + ' ' + (makeupClockInTime || '--') + '-' + (makeupClockOutTime || '--'))
      }

      wx.vibrateShort({ type: 'medium' })
      wx.hideLoading()
      wx.showToast({ title: '补打卡已提交', icon: 'success' })

      // Reset form
      this.setData({
        makeupClockInTime: '',
        makeupClockOutTime: '',
        makeupReason: '',
        makeupCanSubmit: false
      })

      this.checkStatusByDate(selectedDate)
      this.loadMonthlyRecords()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '补打卡')
    }
  },

  async onClockOut() {
    const { hasClockedIn, hasClockedOut, recordId } = this.data
    if (!hasClockedIn) {
      wx.showToast({ title: '当日未上班打卡', icon: 'none' })
      return
    }

    if (hasClockedOut) {
      wx.showToast({ title: '当日已下班打卡', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '获取位置中...' })
      const locationData = await this.askLocation()
      wx.showLoading({ title: '打卡中...' })
      const userInfo = app.globalData.userInfo
      const clockTime = new Date()

      await db.updateDoc(COLLECTIONS.CLOCKIN, recordId, {
        clockOutTime: clockTime,
        clockOutLocation: locationData.location,
        clockOutLocationText: locationData.locationText
      })

      log(LOG_TYPES.ATTENDANCE_CLOCK_OUT, userInfo.name + ' 下班打卡 ' + this.data.selectedDate)

      this.setData({
        hasClockedOut: true,
        clockOutTime: clockTime,
        clockOutTimeStr: formatTime(clockTime)
      })

      wx.vibrateShort({ type: 'medium' })
      wx.hideLoading()
      wx.showToast({ title: '下班打卡成功', icon: 'success' })
      this.loadMonthlyRecords()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '下班打卡')
    }
  },

  askLocation() {
    return new Promise(function(resolve) {
      wx.getSetting({
        success: function(res) {
          const authSetting = res.authSetting
          if (!authSetting['scope.userLocation']) {
            wx.authorize({
              scope: 'scope.userLocation',
              success: function() {
                getLocationOnce(resolve)
              },
              fail: function() {
                wx.showModal({
                  title: '位置权限',
                  content: '打卡将记录位置信息，请在设置中开启位置权限',
                  confirmText: '手动打卡',
                  cancelText: '取消',
                  success: function(modalRes) {
                    if (modalRes.confirm) {
                      resolve({ location: '', locationText: '手动打卡（位置未授权）' })
                    } else {
                      resolve({ location: '', locationText: '已取消' })
                    }
                  }
                })
              }
            })
          } else {
            getLocationOnce(resolve)
          }
        },
        fail: function() {
          getLocationOnce(resolve)
        }
      })

      function getLocationOnce(resolve) {
        wx.getLocation({
          type: 'gcj02',
          success: function(res) {
            const location = res.latitude + ',' + res.longitude
            const locationText = res.latitude.toFixed(4) + '°, ' + res.longitude.toFixed(4) + '°'
            resolve({ location: location, locationText: locationText })
          },
          fail: function() {
            resolve({ location: '', locationText: '定位失败（手动打卡）' })
          }
        })
      }
    })
  }
})
