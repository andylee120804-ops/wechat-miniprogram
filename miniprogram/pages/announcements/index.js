const app = getApp()
const { formatDate } = require('../../utils/helpers')
const { log } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { hasPermission } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    loading: true,
    announcements: [],
    canAddAnnouncement: false,
    canEditAnnouncement: false,
    canDeleteAnnouncement: false,
    showCreateModal: false,
    createTitle: '',
    createContent: '',
    createPriority: 'normal',
    createNeedsConfirm: false,
    createStartDate: '',
    createEndDate: '',
    expandedId: ''
  },

  onShow() {
    const theme = app.getThemePageData()
    const canAddAnnouncement = hasPermission('announcement', 'add')
    const canEditAnnouncement = hasPermission('announcement', 'edit')
    const canDeleteAnnouncement = hasPermission('announcement', 'delete')
    this.setData({ theme, canAddAnnouncement, canEditAnnouncement, canDeleteAnnouncement, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const today = formatDate(new Date())
      const res = await db.queryAll(COLLECTIONS.ANNOUNCEMENT, { active: true }, 'createdAt', 'desc')
      const announcements = (res.data || []).filter(ann => {
        if (!ann.startDate && !ann.endDate) {
          return formatDate(ann.createdAt) === today
        }
        if (ann.startDate && ann.startDate > today) return false
        if (ann.endDate && ann.endDate < today) return false
        return true
      }).map(ann => {
        const startDate = ann.startDate || formatDate(ann.createdAt)
        const endDate = ann.endDate && ann.endDate !== startDate ? ann.endDate : ''
        ann.displayDateRange = endDate ? startDate + '-' + endDate : startDate
        return ann
      })
      this.setData({ loading: false, announcements })
    } catch (err) {
      handleCloudError(err, '加载公告')
      this.setData({ loading: false })
    }
  },

  onAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/announcement-detail/index?id=${id}` })
    } else {
      wx.showToast({ title: '公告ID无效', icon: 'none' })
    }
  },

  onEditAnnouncement(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/announcement-detail/index?id=${id}` })
    }
  },

  onAddAnnouncement() {
    const today = formatDate(new Date())
    this.setData({ showCreateModal: true, createTitle: '', createContent: '', createPriority: 'normal', createNeedsConfirm: false, createStartDate: today, createEndDate: today })
  },

  onTitleInput(e) {
    this.setData({ createTitle: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ createContent: e.detail.value })
  },

  onPriorityChange(e) {
    this.setData({ createPriority: e.currentTarget.dataset.priority })
  },

  onNeedsConfirmChange(e) {
    this.setData({ createNeedsConfirm: e.detail.value })
  },

  onStartDateChange(e) {
    const val = e.detail.value
    const today = formatDate(new Date())
    if (val < today) {
      wx.showToast({ title: '起始日期不能早于今天', icon: 'none' })
      return
    }
    this.setData({ createStartDate: val })
    // Auto-update end date if it's before the new start date
    if (this.data.createEndDate && this.data.createEndDate < val) {
      this.setData({ createEndDate: val })
    }
  },

  onEndDateChange(e) {
    const val = e.detail.value
    if (val < this.data.createStartDate) {
      wx.showToast({ title: '结束日期不能早于起始日期', icon: 'none' })
      return
    }
    this.setData({ createEndDate: val })
  },

  async onSaveAnnouncement() {
    const { createTitle, createContent, createPriority, createNeedsConfirm, createStartDate, createEndDate } = this.data
    if (!createTitle.trim() || !createContent.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' })
      return
    }
    if (!createStartDate || !createEndDate) {
      wx.showToast({ title: '请设置显示起止日期', icon: 'none' })
      return
    }
    const userInfo = app.globalData.userInfo
    try {
      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'createAnnouncement',
          title: createTitle.trim(),
          content: createContent.trim(),
          priority: createPriority,
          needsConfirm: createNeedsConfirm,
          startDate: createStartDate,
          endDate: createEndDate,
          createdBy: userInfo._id,
          createdByName: userInfo.name
        }
      })
      log('ANNOUNCEMENT_CREATE', { title: createTitle })
      wx.showToast({ title: '发布成功', icon: 'success' })
      this.setData({ showCreateModal: false })
      this.loadData()
    } catch (err) {
      handleCloudError(err, '发布公告')
    }
  },

  onCloseModal() {
    this.setData({ showCreateModal: false })
  },

  async onDeleteAnnouncement(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除公告',
      content: '确定要删除此公告吗？',
      confirmText: '删除',
      confirmColor: '#F87171',
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({ name: 'sendMessage', data: { action: 'deleteAnnouncement', announcementId: id } })
            log('ANNOUNCEMENT_DELETE', {}, id)
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadData()
          } catch (err) {
            handleCloudError(err, '删除公告')
          }
        }
      }
    })
  },

  isUnread(ann) {
    const userInfo = app.globalData.userInfo
    return userInfo && !ann.readBy.includes(userInfo._id)
  }
})
