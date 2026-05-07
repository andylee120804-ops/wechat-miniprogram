const app = getApp()
const { formatDateTime, formatDate } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    announcement: null,
    formattedTime: '',
    formattedDate: '',
    displayDateText: '',
    needsConfirm: false,
    confirming: false,
    dayAnnouncements: [],
    canEdit: false,
    showEditModal: false,
    editTitle: '',
    editContent: '',
    editPriority: 'normal',
    editNeedsConfirm: false,
    editStartDate: '',
    editEndDate: ''
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
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
      const dbInst = db.getDb()
      const res = await dbInst.collection(COLLECTIONS.ANNOUNCEMENT).doc(id).get()
      if (!res.data) {
        wx.showToast({ title: '公告不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const announcement = res.data
      const userInfo = app.globalData.userInfo
      const isCreator = userInfo && (announcement.createdBy === userInfo._id || announcement.createdBy === userInfo._openid)
      const readBy = announcement.readBy || []
      const userId = userInfo._id
      const userOpenid = userInfo._openid || ''
      const isRead = readBy.includes(userId) || (userOpenid && readBy.includes(userOpenid))
      const isAdmin = userInfo && userInfo.role === 'admin'
      const needsConfirm = !!(announcement.needsConfirm === true && !isRead && !isCreator && !isAdmin)
      const readCount = readBy.length
      const canEdit = !!(isCreator || isAdmin)

      const dateStr = formatDate(new Date())
      const allRes = await db.queryAll(COLLECTIONS.ANNOUNCEMENT, { active: true }, 'createdAt', 'desc')
      const allAnnouncements = allRes.data || []
      const dayList = allAnnouncements.filter(a => {
        if (a._id === id) return false
        if (formatDate(a.createdAt) !== dateStr) return false
        if (!a.startDate && !a.endDate) {
          return formatDate(a.createdAt) === dateStr
        }
        if (a.startDate && a.startDate > dateStr) return false
        if (a.endDate && a.endDate < dateStr) return false
        return true
      })

      let readStaff = []
      let unreadStaff = []
      const staffRes = await db.queryAll(COLLECTIONS.STAFF, { status: 'active' })
      const staffList = staffRes.data || []

      // Resolve creator name via cloud function (createdBy may be OPENID, not readable on client)
      const creatorId = announcement.createdBy || ''
      const creatorFromStaff = staffList.find(s => s._id === creatorId)
      let creatorName = (creatorFromStaff && creatorFromStaff.name) || ''
      if (!creatorName && creatorId) {
        try {
          const crRes = await wx.cloud.callFunction({
            name: 'sendMessage',
            data: { action: 'resolveCreator', createdBy: creatorId, announcementId: id }
          })
          console.log('DEBUG resolveCreator result:', JSON.stringify(crRes.result))
          if (crRes.result && crRes.result.success) {
            creatorName = crRes.result.name
          }
        } catch (e) {
          console.error('DEBUG resolveCreator error:', e)
        }
      }
      creatorName = creatorName || announcement.createdByName || '未知'
      console.log('DEBUG final creatorName:', creatorName)

      if (announcement.needsConfirm) {
        const readByIds = announcement.readBy || []
        staffList.forEach(s => {
          if (readByIds.includes(s._id)) {
            readStaff.push({ name: s.name || '未知', id: s._id })
          } else {
            unreadStaff.push({ name: s.name || '未知', id: s._id })
          }
        })
      }

      this.setData({
        loading: false,
        announcement: { ...announcement, createdByName: creatorName },
        formattedTime: formatDateTime(announcement.createdAt),
        formattedDate: formatDate(announcement.createdAt),
        displayDateText: this._calcDisplayDate(announcement),
        needsConfirm,
        readCount,
        canEdit,
        dayAnnouncements: dayList,
        readStaff,
        unreadStaff
      })
    } catch (err) {
      handleCloudError(err, '加载公告')
      this.setData({ loading: false })
    }
  },

  _calcDisplayDate(announcement) {
    const start = announcement.startDate || formatDate(announcement.createdAt)
    const end = announcement.endDate && announcement.endDate !== start ? announcement.endDate : ''
    return end ? start + ' 至 ' + end : start
  },

  onBack() {
    wx.navigateBack()
  },

  onEdit() {
    const { announcement } = this.data
    if (!announcement) return
    this.setData({
      showEditModal: true,
      editTitle: announcement.title,
      editContent: announcement.content,
      editPriority: announcement.priority || 'normal',
      editNeedsConfirm: !!announcement.needsConfirm,
      editStartDate: announcement.startDate || '',
      editEndDate: announcement.endDate || ''
    })
  },

  onCloseEditModal() {
    this.setData({ showEditModal: false })
  },

  onEditTitleInput(e) {
    this.setData({ editTitle: e.detail.value })
  },

  onEditContentInput(e) {
    this.setData({ editContent: e.detail.value })
  },

  onEditPriorityChange(e) {
    this.setData({ editPriority: e.currentTarget.dataset.priority })
  },

  onEditNeedsConfirmChange(e) {
    this.setData({ editNeedsConfirm: e.detail.value })
  },

  onEditStartDateChange(e) {
    const val = e.detail.value
    if (this.data.editEndDate && val > this.data.editEndDate) {
      wx.showToast({ title: '起始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ editStartDate: val })
  },

  onEditEndDateChange(e) {
    const val = e.detail.value
    if (this.data.editStartDate && val < this.data.editStartDate) {
      wx.showToast({ title: '结束日期不能早于起始日期', icon: 'none' })
      return
    }
    this.setData({ editEndDate: val })
  },

  async onSaveEdit() {
    const { announcement, editTitle, editContent, editPriority, editNeedsConfirm, editStartDate, editEndDate } = this.data
    if (!editTitle.trim() || !editContent.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' })
      return
    }
    if (editStartDate && editEndDate && editStartDate > editEndDate) {
      wx.showToast({ title: '起始日期不能晚于结束日期', icon: 'none' })
      return
    }
    try {
      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateAnnouncement',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          announcementId: announcement._id,
          title: editTitle.trim(),
          content: editContent.trim(),
          priority: editPriority,
          needsConfirm: editNeedsConfirm,
          startDate: editStartDate,
          endDate: editEndDate
        }
      })
      wx.showToast({ title: '修改成功', icon: 'success' })
      this.setData({ showEditModal: false })
      this.loadData(announcement._id)
    } catch (err) {
      handleCloudError(err, '修改公告')
    }
  },

  async onConfirmRead() {
    const { announcement, confirming } = this.data
    if (confirming || !announcement) return
    const userInfo = app.globalData.userInfo
    this.setData({ confirming: true })
    try {
      const markRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'markRead',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          announcementId: announcement._id,
          staffId: userInfo._id
        }
      })
      console.log('DEBUG markRead result:', JSON.stringify(markRes.result))
      wx.showToast({ title: '已确认', icon: 'success' })
      this.setData({ needsConfirm: false })
      this.loadData(announcement._id)
    } catch (err) {
      handleCloudError(err, '确认已读')
    } finally {
      this.setData({ confirming: false })
    }
  },

  onDeleteDirect() {
    const { announcement } = this.data
    if (!announcement) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除此公告吗？',
      confirmText: '删除',
      confirmColor: '#F87171',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.callFunction({
            name: 'sendMessage',
            data: {
              action: 'deleteAnnouncement',
              callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
              announcementId: announcement._id
            }
          })
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1000)
        } catch (err) {
          handleCloudError(err, '删除公告')
        }
      }
    })
  },

  onDeleteFromEdit() {
    const { announcement } = this.data
    if (!announcement) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除此公告吗？',
      confirmText: '删除',
      confirmColor: '#F87171',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.callFunction({
            name: 'sendMessage',
            data: {
              action: 'deleteAnnouncement',
              callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
              announcementId: announcement._id
            }
          })
          wx.showToast({ title: '已删除', icon: 'success' })
          this.setData({ showEditModal: false })
          setTimeout(() => wx.navigateBack(), 1000)
        } catch (err) {
          handleCloudError(err, '删除公告')
        }
      }
    })
  },

  onDayAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    if (id && id !== (this.data.announcement && this.data.announcement._id)) {
      this.setData({ announcementId: id })
      this.loadData(id)
    }
  }
})
