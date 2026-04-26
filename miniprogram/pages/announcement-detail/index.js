const app = getApp()
const { formatDateTime, formatDate } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    loading: true,
    announcement: null,
    formattedTime: '',
    needsConfirm: false,
    confirming: false,
    prevAnn: null,
    nextAnn: null,
    dayAnnouncements: []
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    // Validate id: must be non-empty string
    const id = options.id && typeof options.id === 'string' ? options.id.trim() : ''
    if (id) {
      this.setData({ announcementId: id })
      this.loadData(id)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async loadData(id) {
    if (!id) {
      console.error('loadData called with empty id')
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection(COLLECTIONS.ANNOUNCEMENT).doc(id).get()
      if (!res.data) {
        wx.showToast({ title: '公告不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const announcement = res.data
      const userInfo = app.globalData.userInfo
      const isRead = (announcement.readBy || []).includes(userInfo._id)
      // needsConfirm 默认为 false，兼容旧公告（没有此字段）
      const needsConfirm = !!(announcement.needsConfirm === true && !isRead)


      // Load all same-day announcements for navigation
      const annDate = announcement.createdAt
      const dateStr = formatDate(annDate) // "YYYY-MM-DD" in local time

      // Query all active announcements and filter by date in JavaScript
      const allRes = await db.collection(COLLECTIONS.ANNOUNCEMENT).where({ active: true }).orderBy('createdAt', 'desc').get()
      const allAnnouncements = allRes.data || []

      // Filter same day in local time
      const dayList = allAnnouncements.filter(a => formatDate(a.createdAt) === dateStr)
      const currentIndex = dayList.findIndex(a => a._id === id)
      const prevAnn = currentIndex < dayList.length - 1 ? dayList[currentIndex + 1] : null
      const nextAnn = currentIndex > 0 ? dayList[currentIndex - 1] : null

      this.setData({
        loading: false,
        announcement,
        formattedTime: formatDateTime(announcement.createdAt),
        needsConfirm,
        prevAnn,
        nextAnn,
        dayAnnouncements: dayList
      })
    } catch (err) {
      handleCloudError(err, '加载公告')
      this.setData({ loading: false })
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onPrevAnnouncement() {
    const { prevAnn } = this.data
    if (prevAnn) {
      this.setData({ announcementId: prevAnn._id })
      this.loadData(prevAnn._id)
    }
  },

  onNextAnnouncement() {
    const { nextAnn } = this.data
    if (nextAnn) {
      this.setData({ announcementId: nextAnn._id })
      this.loadData(nextAnn._id)
    }
  },

  async onConfirmRead() {
    const { announcement, confirming } = this.data
    if (confirming || !announcement) return
    const userInfo = app.globalData.userInfo
    this.setData({ confirming: true })
    try {
      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'markRead',
          announcementId: announcement._id,
          staffId: userInfo._id
        }
      })
      wx.showToast({ title: '已确认', icon: 'success' })
      this.setData({ needsConfirm: false })
      // Reload to update readBy count
      this.loadData(announcement._id)
    } catch (err) {
      handleCloudError(err, '确认已读')
    } finally {
      this.setData({ confirming: false })
    }
  },

  onDayAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    if (id && id !== (this.data.announcement && this.data.announcement._id)) {
      this.setData({ announcementId: id })
      this.loadData(id)
    }
  }
})
