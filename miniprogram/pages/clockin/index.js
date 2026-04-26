const app = getApp()
const { formatDate, formatTime, calcWorkDuration, isLate } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    hasClockedIn: false,
    hasClockedOut: false,
    clockInTime: '',
    clockOutTime: '',
    clockInTimeStr: '',
    clockOutTimeStr: '',
    location: '',
    locationText: '',
    monthlyRecords: []
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme })
    this.checkTodayStatus()
    this.loadMonthlyRecords()
  },

  async checkTodayStatus() {
    try {
      const userInfo = app.globalData.userInfo
      if (!userInfo) {
        this.setData({ loading: false })
        return
      }

      const now = new Date()
      const todayStr = formatDate(now)
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.CLOCKIN, {
        staffId: userInfo._id,
        date: _.gte(dayStart).and(_.lte(dayEnd))
      }, 'createdAt', 'desc')

      const records = res.data || []
      if (records.length > 0) {
        const today = records[0]
        const clockInTime = today.clockInTime ? new Date(today.clockInTime) : null
        const clockOutTime = today.clockOutTime ? new Date(today.clockOutTime) : null

        this.setData({
          hasClockedIn: !!today.clockInTime,
          hasClockedOut: !!today.clockOutTime,
          clockInTime: today.clockInTime || '',
          clockOutTime: today.clockOutTime || '',
          clockInTimeStr: clockInTime ? formatTime(clockInTime) : '',
          clockOutTimeStr: clockOutTime ? formatTime(clockOutTime) : '',
          location: today.clockInLocation || '',
          locationText: today.clockInLocationText || '',
          todayRecordId: today._id,
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
          todayRecordId: '',
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
          isLate: isLate(clockIn)
        }
      })

      this.setData({ monthlyRecords: records })
    } catch (err) {
      handleCloudError(err, '加载月度记录')
    }
  },

  onClockTap() {
    if (this.data.hasClockedIn && !this.data.hasClockedOut) {
      this.onClockOut()
    } else {
      this.onClockIn()
    }
  },

  async onClockIn() {
    if (this.data.hasClockedIn) {
      wx.showToast({ title: '今日已打卡', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '打卡中...' })
      const locationData = await this.getLocation()
      const userInfo = app.globalData.userInfo
      const now = new Date()

      const res = await db.addDoc('clockin', {
        staffId: userInfo._id,
        staffName: userInfo.name || '',
        date: now,
        clockInTime: now,
        clockInLocation: locationData.location,
        clockInLocationText: locationData.locationText
      })

      log(LOG_TYPES.ATTENDANCE_CLOCK_IN, userInfo.name + ' 上班打卡')

      this.setData({
        hasClockedIn: true,
        clockInTime: now,
        clockInTimeStr: formatTime(now),
        location: locationData.location,
        locationText: locationData.locationText,
        todayRecordId: res._id
      })

      wx.vibrateShort({ type: 'medium' })
      wx.hideLoading()
      wx.showToast({ title: '上班打卡成功', icon: 'success' })
      this.loadMonthlyRecords()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '上班打卡')
    }
  },

  async onClockOut() {
    if (!this.data.hasClockedIn) {
      wx.showToast({ title: '请先上班打卡', icon: 'none' })
      return
    }

    if (this.data.hasClockedOut) {
      wx.showToast({ title: '今日已下班打卡', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '打卡中...' })
      const locationData = await this.getLocation()
      const userInfo = app.globalData.userInfo
      const now = new Date()

      await db.updateDoc('clockin', this.data.todayRecordId, {
        clockOutTime: now,
        clockOutLocation: locationData.location,
        clockOutLocationText: locationData.locationText
      })

      log(LOG_TYPES.ATTENDANCE_CLOCK_OUT, userInfo.name + ' 下班打卡')

      this.setData({
        hasClockedOut: true,
        clockOutTime: now,
        clockOutTimeStr: formatTime(now)
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

  getLocation() {
    return new Promise(function(resolve, reject) {
      wx.getLocation({
        type: 'gcj02',
        success: function(res) {
          const location = res.latitude + ',' + res.longitude
          // Reverse geocode using QQ Map SDK or just show coordinates
          const locationText = res.latitude.toFixed(4) + ', ' + res.longitude.toFixed(4)
          resolve({ location: location, locationText: locationText })
        },
        fail: function(err) {
          // If location fails, still allow clock-in with empty location
          console.warn('[ClockIn] Location failed:', err)
          resolve({ location: '', locationText: '无法获取位置' })
        }
      })
    })
  }
})
