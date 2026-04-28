const app = getApp()
const { checkPermission } = require('../../utils/permission')
const { log } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    id: '',
    income: null,
    loading: true,
    showDeleteModal: false,
    canEdit: false,
    canDelete: false
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, id: options.id })
    this.loadData()
  },

  async loadData() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection(COLLECTIONS.INCOME).doc(this.data.id).get()
      this.setData({
        income: res.data,
        loading: false,
        canEdit: checkPermission('income', 'edit'),
        canDelete: checkPermission('income', 'delete')
      })
    } catch (err) {
      handleCloudError(err, '加载收入详情')
      this.setData({ loading: false })
    }
  },

  onShow() {
    if (this.data.id) this.loadData()
  },

  onBack() {
    wx.navigateBack()
  },

  onEdit() {
    if (!checkPermission('income', 'edit')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/income-add/index?id=${this.data.id}` })
  },

  onDelete() {
    if (!checkPermission('income', 'delete')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    this.setData({ showDeleteModal: true })
  },

  async onConfirmDelete() {
    this.setData({ showDeleteModal: false })
    try {
      const db = wx.cloud.database()
      const income = this.data.income
      await db.collection(COLLECTIONS.INCOME).doc(this.data.id).remove()
      if (income.reservationId) {
        await db.collection(COLLECTIONS.RESERVATION).doc(income.reservationId).update({ data: { hasIncome: false } })
      }
      log('INCOME_DELETE', { type: income.type, amount: income.amount })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      handleCloudError(err, '删除收入')
    }
  },

  onCloseDelete() {
    this.setData({ showDeleteModal: false })
  }
})
