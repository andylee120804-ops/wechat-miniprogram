const app = getApp()
const { formatAmount, formatDate } = require('../../../utils/helpers')
const { log, LOG_TYPES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { checkPermission } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    items: [],
    totalMonthly: 0,
    totalMonthlyFormatted: '0.00',
    showModal: false,
    isEdit: false,
    editId: '',
    name: '',
    amount: '',
    cycle: 'monthly',
    description: '',
    splitHint: '',
    startDate: '',
    endDate: ''
  },

  onShow() {
    if (!checkPermission('expense', 'view')) {
      wx.navigateBack()
      return
    }
    this.setData({
      theme: app.getThemePageData(),
      statusBarHeight: app.globalData.statusBarHeight || 44
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection(COLLECTIONS.FIXED_EXPENSE)
        .orderBy('createdAt', 'desc')
        .get()

      const items = (res.data || []).map(item => {
        const monthlyAmount = Number(item.monthlyAmount || item.amount || 0)
        return Object.assign({}, item, {
          monthlyAmount,
          formattedMonthly: formatAmount(monthlyAmount),
          formattedOriginal: formatAmount(item.amount || 0)
        })
      })

      let totalMonthly = 0
      items.forEach(item => { totalMonthly += item.monthlyAmount })

      this.setData({
        items,
        totalMonthly,
        totalMonthlyFormatted: formatAmount(totalMonthly),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      handleCloudError(err, '加载固定成本')
    }
  },

  onAdd() {
    this.setData({
      showModal: true,
      isEdit: false,
      editId: '',
      name: '',
      amount: '',
      cycle: 'monthly',
      description: '',
      splitHint: '',
      startDate: formatDate(new Date()),
      endDate: ''
    })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find(i => i._id === id)
    if (!item) return
    const amountStr = String(item.amount || '')
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id,
      name: item.name || '',
      amount: amountStr,
      cycle: item.cycle || 'monthly',
      description: item.description || '',
      splitHint: this.calcSplitHint(amountStr, item.cycle || 'monthly'),
      startDate: item.startDate || formatDate(new Date()),
      endDate: item.endDate || ''
    })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onAmountInput(e) {
    const amount = e.detail.value
    this.setData({ amount, splitHint: this.calcSplitHint(amount, this.data.cycle) })
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  onCycleChange(e) {
    const cycle = e.currentTarget.dataset.cycle
    this.setData({ cycle, splitHint: this.calcSplitHint(this.data.amount, cycle) })
  },

  calcSplitHint(amount, cycle) {
    if (cycle === 'yearly' && amount) {
      const num = parseFloat(amount)
      if (num > 0) return '每月分摊: ¥' + (num / 12).toFixed(2)
    }
    return ''
  },

  onSave() {
    const { name, amount, cycle, description, startDate, endDate } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' })
      return
    }
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    const monthlyAmount = cycle === 'yearly' ? numAmount / 12 : numAmount

    wx.showLoading({ title: '保存中...' })
    const db = wx.cloud.database()
    const data = {
      name: name.trim(),
      amount: numAmount,
      cycle,
      monthlyAmount,
      description: description || '',
      startDate: startDate || formatDate(new Date()),
      endDate: endDate || '',
      updatedAt: db.serverDate()
    }

    if (this.data.isEdit && this.data.editId) {
      db.collection(COLLECTIONS.FIXED_EXPENSE).doc(this.data.editId).update({ data })
        .then(() => {
          wx.hideLoading()
          log(LOG_TYPES.EXPENSE_UPDATE, '更新固定成本: ' + data.name + ' ¥' + numAmount + '/' + (cycle === 'yearly' ? '年' : '月'))
          wx.showToast({ title: '保存成功', icon: 'success' })
          this.setData({ showModal: false })
          this.loadData()
        })
        .catch(err => {
          wx.hideLoading()
          handleCloudError(err, '更新固定成本')
        })
    } else {
      data.createdAt = db.serverDate()
      db.collection(COLLECTIONS.FIXED_EXPENSE).add({ data })
        .then(() => {
          wx.hideLoading()
          log(LOG_TYPES.EXPENSE_CREATE, '新增固定成本: ' + data.name + ' ¥' + numAmount + '/' + (cycle === 'yearly' ? '年' : '月'))
          wx.showToast({ title: '添加成功', icon: 'success' })
          this.setData({ showModal: false })
          this.loadData()
        })
        .catch(err => {
          wx.hideLoading()
          handleCloudError(err, '添加固定成本')
        })
    }
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + this.data.name + '」吗？',
      confirmColor: '#F87171',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        wx.cloud.database().collection(COLLECTIONS.FIXED_EXPENSE).doc(this.data.editId).remove()
          .then(() => {
            wx.hideLoading()
            log(LOG_TYPES.EXPENSE_DELETE, '删除固定成本: ' + this.data.name)
            wx.showToast({ title: '已删除', icon: 'success' })
            this.setData({ showModal: false })
            this.loadData()
          })
          .catch(err => {
            wx.hideLoading()
            handleCloudError(err, '删除固定成本')
          })
      }
    })
  },

  onModalClose() {
    this.setData({ showModal: false })
  },

  onBack() {
    wx.navigateBack()
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value })
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value })
  }
})
