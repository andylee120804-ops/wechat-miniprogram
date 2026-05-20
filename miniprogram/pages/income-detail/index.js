const app = getApp()
const { hasPermission, checkPermission, ACTIONS } = require('../../utils/permission')
const { log } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const { formatDate, formatAmount, getIncomeTypeText, getRoomName, getReservationStatusText, getExclusiveTypeName } = require('../../utils/helpers')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    id: '',
    income: null,
    reservation: null,
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
    this._isLoading = true
    try {
      this.setData({ loading: true })
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

      // 加载关联预约数据
      let reservation = null
      if (income.reservationId) {
        try {
          const resData = await db.getDoc(COLLECTIONS.RESERVATION, income.reservationId)
          if (resData) {
            const et = resData.exclusiveType || (resData.isExclusive ? 'full' : 'none')
            reservation = {
              ...resData,
              statusText: getReservationStatusText(resData.status),
              dateDisplay: formatDate(resData.date),
              roomNameDisplay: getExclusiveTypeName(et, resData.room),
              customerName: resData.customerName || '未知客户',
              phone: resData.phone || '',
              guestCount: resData.guestCount || 0,
              standard: resData.standard || 0,
              dishPrice: resData.dishPrice || 0,
              time: resData.time || '',
              remark: resData.remark || ''
            }
          }
        } catch (e) {
          console.warn('加载关联预约失败:', e)
        }
      }

      this.setData({
        income,
        reservation,
        loading: false,
        canEdit: hasPermission('income', ACTIONS.EDIT),
        canDelete: hasPermission('income', ACTIONS.DELETE)
      })
    } catch (err) {
      handleCloudError(err, '加载收入详情')
      this.setData({ loading: false })
    } finally {
      this._isLoading = false
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
