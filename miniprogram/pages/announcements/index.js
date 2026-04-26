const app = getApp()
const { formatDateTime } = require('../../utils/helpers')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')

Page({
  data: {
    theme: {},
    loading: true,
    announcements: [],
    isAdmin: false,
    showCreateModal: false,
    createTitle: '',
    createContent: '',
    createPriority: 'normal',
    expandedId: ''
  },

  onShow() {
    const theme = app.getThemePageData()
    const userInfo = app.globalData.userInfo
    const isAdmin = userInfo && (userInfo.role === 'boss' || userInfo.role === 'admin')
    this.setData({ theme, isAdmin })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'sendMessage', data: { action: 'getAnnouncements', limit: 50 } })
      if (res.result.success) {
        this.setData({ loading: false, announcements: res.result.data })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      handleCloudError(err, '加载公告')
      this.setData({ loading: false })
    }
  },

  onAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    const userInfo = app.globalData.userInfo
    // Mark as read
    wx.cloud.callFunction({ name: 'sendMessage', data: { action: 'markRead', announcementId: id, staffId: userInfo._id } }).catch(() => {})
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  onAddAnnouncement() {
    this.setData({ showCreateModal: true, createTitle: '', createContent: '', createPriority: 'normal' })
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

  async onSaveAnnouncement() {
    const { createTitle, createContent, createPriority } = this.data
    if (!createTitle.trim() || !createContent.trim()) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' })
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
