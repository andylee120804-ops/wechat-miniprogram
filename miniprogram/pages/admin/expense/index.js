const app = getApp()
const { formatDate, formatAmount, getExpenseCategoryName, getMonthRange } = require('../../../utils/helpers')
const { log, LOG_TYPES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { checkPermission } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    currentMonth: 0,
    monthStr: '',
    monthLabel: '',
    expenses: [],
    totalAmount: 0,
    showModal: false,
    isEdit: false,
    editId: '',
    category: 'salary',
    amount: '',
    description: '',
    categoryOptions: [
      { id: 'salary', name: '工资' },
      { id: 'rent', name: '房租' },
      { id: 'utilities', name: '水电' },
      { id: 'supplies', name: '物资' },
      { id: 'other', name: '其他' }
    ]
  },

  onShow: function() {
    if (!checkPermission('expense', 'view')) {
      wx.navigateBack()
      return
    }
    const sysInfo = wx.getWindowInfo()
    this.setData({
      theme: app.getThemePageData(),
      statusBarHeight: sysInfo.statusBarHeight || 44
    })
    this.loadData()
  },

  loadData: function() {
    var that = this
    that.setData({ loading: true })

    var range = getMonthRange(that.data.currentMonth)
    var dbInstance = wx.cloud.database()

    dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).where({
      date: dbInstance.command.gte(range.start).and(dbInstance.command.lte(range.end))
    }).orderBy('date', 'desc').orderBy('createdAt', 'desc').get().then(function(res) {
      var expenses = res.data || []
      var totalAmount = 0

      expenses.forEach(function(e) {
        e.categoryName = getExpenseCategoryName(e.category)
        e.formattedAmount = formatAmount(e.amount)
        e.formattedDate = formatDate(e.date)
        totalAmount += Number(e.amount) || 0
      })

      that.setData({
        expenses: expenses,
        totalAmount: totalAmount,
        monthStr: range.monthStr,
        monthLabel: range.label,
        loading: false
      })
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载支出记录')
    })
  },

  onMonthChange: function(e) {
    var offset = e.currentTarget.dataset.offset
    var newMonth = this.data.currentMonth + (offset || 0)
    this.setData({ currentMonth: newMonth })
    this.loadData()
  },

  onPrevMonth: function() {
    this.setData({ currentMonth: this.data.currentMonth - 1 })
    this.loadData()
  },

  onNextMonth: function() {
    this.setData({ currentMonth: this.data.currentMonth + 1 })
    this.loadData()
  },

  onAddExpense: function() {
    if (!checkPermission('expense', 'add')) return
    this.setData({
      showModal: true,
      isEdit: false,
      editId: '',
      category: 'salary',
      amount: '',
      description: ''
    })
  },

  onExpenseTap: function(e) {
    if (!checkPermission('expense', 'edit')) return
    var id = e.currentTarget.dataset.id
    var expense = null
    for (var i = 0; i < this.data.expenses.length; i++) {
      if (this.data.expenses[i]._id === id) {
        expense = this.data.expenses[i]
        break
      }
    }
    if (!expense) return
    this.setData({
      showModal: true,
      isEdit: true,
      editId: id,
      category: expense.category || 'salary',
      amount: String(expense.amount || ''),
      description: expense.description || ''
    })
  },

  onCategoryChange: function(e) {
    this.setData({ category: e.detail.value })
  },

  onCategoryTap: function(e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ category: cat })
  },

  onAmountInput: function(e) {
    this.setData({ amount: e.detail.value })
  },

  onDescriptionInput: function(e) {
    this.setData({ description: e.detail.value })
  },

  onSaveExpense: function() {
    var that = this
    var amount = parseFloat(that.data.amount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }
    if (!that.data.category) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    var dbInstance = wx.cloud.database()
    var now = formatDate(new Date())
    var data = {
      category: that.data.category,
      amount: amount,
      description: that.data.description || '',
      date: now,
      updatedAt: dbInstance.serverDate()
    }

    if (that.data.isEdit && that.data.editId) {
      dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).doc(that.data.editId).update({
        data: data
      }).then(function() {
        wx.hideLoading()
        log(LOG_TYPES.EXPENSE_UPDATE, '更新支出: ' + getExpenseCategoryName(data.category) + ' ¥' + amount)
        wx.showToast({ title: '保存成功', icon: 'success' })
        that.setData({ showModal: false })
        that.loadData()
      }).catch(function(err) {
        wx.hideLoading()
        handleCloudError(err, '更新支出')
      })
    } else {
      data.createdAt = dbInstance.serverDate()
      dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).add({
        data: data
      }).then(function() {
        wx.hideLoading()
        log(LOG_TYPES.EXPENSE_CREATE, '新增支出: ' + getExpenseCategoryName(data.category) + ' ¥' + amount)
        wx.showToast({ title: '添加成功', icon: 'success' })
        that.setData({ showModal: false })
        that.loadData()
      }).catch(function(err) {
        wx.hideLoading()
        handleCloudError(err, '添加支出')
      })
    }
  },

  onDeleteExpense: function() {
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条支出记录吗？',
      confirmColor: that.data.theme.statusDanger || '#F87171',
      success: function(res) {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        wx.cloud.database().collection(COLLECTIONS.FIXED_EXPENSE).doc(that.data.editId).remove().then(function() {
          wx.hideLoading()
          log(LOG_TYPES.EXPENSE_DELETE, '删除支出: ' + getExpenseCategoryName(that.data.category))
          wx.showToast({ title: '已删除', icon: 'success' })
          that.setData({ showModal: false })
          that.loadData()
        }).catch(function(err) {
          wx.hideLoading()
          handleCloudError(err, '删除支出')
        })
      }
    })
  },

  onModalClose: function() {
    this.setData({ showModal: false })
  },

  onBack: function() {
    wx.navigateBack()
  }
})
