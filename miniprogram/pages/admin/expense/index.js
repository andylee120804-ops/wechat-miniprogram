const app = getApp()
const { formatAmount, formatDate, buildChanges } = require('../../../utils/helpers')
const { validateAmount } = require('../../../utils/validators')
const { log, LOG_TYPES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { hasPermission, checkPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

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
    submitting: false,
    startDate: '',
    endDate: '',
    _monthlyBtnBg: '',
    _monthlyBtnColor: '',
    _yearlyBtnBg: '',
    _yearlyBtnColor: ''
  },

  onShow() {
    if (!hasPermission('expense', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    this.setData({
      theme: app.getThemePageData(),
      statusBarHeight: app.globalData.statusBarHeight || 44
    })
    this._updateCycleStyles()
    this.loadData()
  },

  _updateCycleStyles() {
    const t = this.data.theme
    const isMonthly = this.data.cycle === 'monthly'
    this.setData({
      _monthlyBtnBg: isMonthly ? (t.accentColor || '#C9A96E') : (t.glassBg || 'rgba(255,255,255,0.06)'),
      _monthlyBtnColor: isMonthly ? (t.textInverse || '#0F0F1A') : (t.textSecondary || '#9A9AB0'),
      _yearlyBtnBg: !isMonthly ? (t.accentColor || '#C9A96E') : (t.glassBg || 'rgba(255,255,255,0.06)'),
      _yearlyBtnColor: !isMonthly ? (t.textInverse || '#0F0F1A') : (t.textSecondary || '#9A9AB0')
    })
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await db.queryAll(COLLECTIONS.FIXED_EXPENSE, { active: true }, 'createdAt', 'desc')

      const items = (res.data || []).map(item => {
        const monthlyAmount = Number(item.monthlyAmount || item.amount || 0)
        const isYearly = item.cycle === 'yearly'
        const theme = this.data.theme
        return Object.assign({}, item, {
          monthlyAmount,
          formattedMonthly: formatAmount(monthlyAmount),
          formattedOriginal: formatAmount(item.amount || 0),
          _cycleColor: isYearly ? (theme.accentColor || '#C9A96E') : (theme.textMuted || '#5C5C72'),
          _cycleBg: isYearly ? 'rgba(201,169,110,0.14)' : (theme.glassBg || 'rgba(255,255,255,0.06)')
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
    this._updateCycleStyles()
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
      endDate: item.endDate || '',
      _oldData: { name: item.name || '', amount: item.amount !== undefined ? String(item.amount) : '', cycle: item.cycle || 'monthly', description: item.description || '' }
    })
    this._updateCycleStyles()
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
    this._updateCycleStyles()
  },

  calcSplitHint(amount, cycle) {
    if (cycle === 'yearly' && amount) {
      const num = parseFloat(amount)
      if (num > 0) return '每月分摊: ¥' + (num / 12).toFixed(2)
    }
    return ''
  },

  // [Fix #1] 新增 submitting 防重；[Fix #4] 合并新增/编辑分支；[Fix #3] 使用 validateAmount
  onSave() {
    if (this.data.submitting) return
    const { name, amount, cycle, description, startDate, endDate } = this.data
    if (!name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' })
      return
    }
    const amountResult = validateAmount(amount)
    if (!amountResult.valid) {
      wx.showToast({ title: amountResult.message, icon: 'none' })
      return
    }
    const numAmount = Number(amount)
    if (numAmount <= 0) {
      wx.showToast({ title: '金额必须大于0', icon: 'none' })
      return
    }

    const monthlyAmount = cycle === 'yearly' ? numAmount / 12 : numAmount

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...' })
    const dbInst = db.getDb()
    const data = {
      name: name.trim(),
      amount: numAmount,
      cycle,
      monthlyAmount,
      description: description || '',
      startDate: startDate || formatDate(new Date()),
      endDate: endDate || '',
      updatedAt: dbInst.serverDate()
    }

    const promise = this.data.isEdit && this.data.editId
      ? db.updateDoc(COLLECTIONS.FIXED_EXPENSE, this.data.editId, data)
      : db.addDoc(COLLECTIONS.FIXED_EXPENSE, Object.assign({}, data, {
          createdAt: dbInst.serverDate(), active: true
        }))

    promise.then(() => {
      wx.hideLoading()
      const action = this.data.isEdit ? '更新' : '新增'
      const logType = this.data.isEdit ? LOG_TYPES.EXPENSE_UPDATE : LOG_TYPES.EXPENSE_CREATE
      if (this.data.isEdit) {
        var logExtra = buildChanges(this.data._oldData || {}, data, { name: '名称', amount: '金额', cycle: '周期', description: '说明' }, { amount: true }, { cycle: { monthly: '月付', yearly: '年付' } }) || {}
        log(logType, action + '固定成本: ' + data.name + ' ¥' + numAmount + '/' + (cycle === 'yearly' ? '年' : '月'), logExtra)
      } else {
        log(logType, action + '固定成本: ' + data.name + ' ¥' + numAmount + '/' + (cycle === 'yearly' ? '年' : '月'))
      }
      wx.showToast({ title: this.data.isEdit ? '保存成功' : '添加成功', icon: 'success' })
      this.setData({ showModal: false, submitting: false })
      this.loadData()
    }).catch(err => {
      this.setData({ submitting: false })
      wx.hideLoading()
      handleCloudError(err, (this.data.isEdit ? '更新' : '添加') + '固定成本')
    })
  },

  // [Fix #2] 权限检查前置到确认弹窗之前
  onDelete() {
    if (!checkPermission('expense', ACTIONS.DELETE)) {
      wx.showToast({ title: '无权限删除', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + this.data.name + '」吗？',
      confirmColor: '#F87171',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        db.updateDoc(COLLECTIONS.FIXED_EXPENSE, this.data.editId, { active: false })
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
    const val = e.detail.value
    if (this.data.endDate && val > this.data.endDate) {
      wx.showToast({ title: '起始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ startDate: val })
  },

  onEndDateChange(e) {
    const val = e.detail.value
    if (this.data.startDate && val < this.data.startDate) {
      wx.showToast({ title: '结束日期不能早于起始日期', icon: 'none' })
      return
    }
    this.setData({ endDate: val })
  }
})
