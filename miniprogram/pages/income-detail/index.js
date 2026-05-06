const app = getApp()
const { hasPermission, checkPermission, ACTIONS } = require('../../utils/permission')
const { log } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const { formatDate, formatAmount, getIncomeTypeText } = require('../../utils/helpers')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    id: '',
    income: null,
    loading: true,
    showDeleteModal: false,
    canEdit: false,
    canDelete: false
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      id: options.id,
      canEdit: hasPermission('income', ACTIONS.EDIT),
      canDelete: hasPermission('income', ACTIONS.DELETE)
    })
  },

  onShow() {
    if (this.data.id) this.loadData()
  },

  async loadData() {
    try {
      const res = await db.getDoc(COLLECTIONS.INCOME, this.data.id)
      if (!res) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const income = {
        ...res,
        typeName: getIncomeTypeText(res.type),
        formattedAmount: formatAmount(res.amount),
        formattedDate: formatDate(res.date)
      }
      this.setData({
        income,
        loading: false,
        canEdit: hasPermission('income', ACTIONS.EDIT),
        canDelete: hasPermission('income', ACTIONS.DELETE)
      })
    } catch (err) {
      handleCloudError(err, '加载收入详情')
      this.setData({ loading: false })
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onEdit() {
    if (!checkPermission('income', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/income-add/index?id=${this.data.id}` })
  },

  onDelete() {
    if (!checkPermission('income', ACTIONS.DELETE)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    this.setData({ showDeleteModal: true })
  },

  async onConfirmDelete() {
    this.setData({ showDeleteModal: false })
    try {
      const income = this.data.income
      await db.deleteDoc(COLLECTIONS.INCOME, this.data.id)
      if (income.reservationId) {
        await db.updateDoc(COLLECTIONS.RESERVATION, income.reservationId, { hasIncome: false })
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
