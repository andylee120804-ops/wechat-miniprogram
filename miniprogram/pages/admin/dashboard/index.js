const app = getApp()
const { formatDate, formatAmount, getWeekRange, getMonthRange, getQuarterRange, getYearRange, getRoleName, getCategoryName, getIncomeTypeText, getExpenseCategoryName } = require('../../../utils/helpers')
const { log, LOG_TYPES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { getRingChartConfig, getBarChartConfig, getIncomeTypeColors, getExpenseTypeColors } = require('../../../utils/chart-config')
const { checkPermission } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    statusBarHeight: 0,
    // Period controls
    periodMode: 'preset', // 'preset' | 'custom'
    periodType: 'month',  // 'week' | 'month' | 'quarter' | 'year'
    periodOffset: 0,
    periodLabel: '',
    startDate: '',
    endDate: '',
    customStart: '',
    customEnd: '',
    // KPI totals
    totalIncome: 0,
    totalExpense: 0,
    profit: 0,
    incomeChange: 0,
    expenseChange: 0,
    profitChange: 0,
    // Chart
    chartType: 'ring',   // 'ring' | 'bar'
    chartTab: 'income',  // 'income' | 'expense'
    incomeChartData: null,
    expenseChartData: null,
    incomeChartWidth: 375,
    incomeChartHeight: 280,
    expenseChartWidth: 375,
    expenseChartHeight: 280,
    // Income type breakdown for legend
    incomeBreakdown: [],
    expenseBreakdown: [],
    // Fixed expenses
    fixedExpenses: [],
    showFixedExpenseModal: false,
    fixedExpenseName: '',
    fixedExpenseAmount: '',
    // Quick nav
    showQuickNav: false
  },

  onLoad: function() {
    const sysInfo = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sysInfo.statusBarHeight || 44 })
    this.setPeriodRange()
  },

  onShow: function() {
    if (!checkPermission('dashboard', 'view')) {
      wx.navigateBack()
      return
    }
    this.setData({ theme: app.getThemePageData() })
    this.setPeriodRange()
    this.loadData()
    this.loadFixedExpenses()
  },

  // ==================== Period Range ====================

  setPeriodRange: function() {
    var type = this.data.periodType
    var offset = this.data.periodOffset
    var range

    if (type === 'week') {
      range = getWeekRange(offset)
    } else if (type === 'month') {
      range = getMonthRange(offset)
    } else if (type === 'quarter') {
      range = getQuarterRange(offset)
    } else {
      range = getYearRange(offset)
    }

    this.setData({
      startDate: range.start,
      endDate: range.end,
      periodLabel: this.formatPeriodLabel(range.label, type)
    })
  },

  formatPeriodLabel: function(label, type) {
    if (!label) return ''
    var suffixMap = {
      week: '周报',
      month: '月报',
      quarter: '季报',
      year: '年报'
    }
    return label + ' ' + (suffixMap[type] || '')
  },

  prevPeriod: function() {
    this.setData({ periodOffset: this.data.periodOffset - 1 })
    this.setPeriodRange()
    this.loadData()
  },

  nextPeriod: function() {
    if (this.data.periodOffset >= 0) return
    this.setData({ periodOffset: this.data.periodOffset + 1 })
    this.setPeriodRange()
    this.loadData()
  },

  switchPeriodType: function(e) {
    var type = e.currentTarget.dataset.type
    this.setData({
      periodType: type,
      periodOffset: 0
    })
    this.setPeriodRange()
    this.loadData()
  },

  togglePeriodMode: function() {
    var mode = this.data.periodMode === 'preset' ? 'custom' : 'preset'
    this.setData({ periodMode: mode })
  },

  onCustomStartChange: function(e) {
    this.setData({ customStart: e.detail.value })
  },

  onCustomEndChange: function(e) {
    this.setData({ customEnd: e.detail.value })
  },

  onCustomQuery: function() {
    if (!this.data.customStart || !this.data.customEnd) {
      wx.showToast({ title: '请选择起止日期', icon: 'none' })
      return
    }
    if (this.data.customStart > this.data.customEnd) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({
      startDate: this.data.customStart,
      endDate: this.data.customEnd,
      periodLabel: this.data.customStart + ' ~ ' + this.data.customEnd
    })
    this.loadData()
  },

  // ==================== Data Loading ====================

  loadData: function() {
    var that = this
    that.setData({ loading: true })

    var startDate = that.data.startDate
    var endDate = that.data.endDate
    var dbInstance = wx.cloud.database()
    var cmd = dbInstance.command

    // Query current period data in parallel
    var incomePromise = dbInstance.collection(COLLECTIONS.INCOME).where({
      date: cmd.gte(startDate).and(cmd.lte(endDate))
    }).get()

    var purchasePromise = dbInstance.collection(COLLECTIONS.PURCHASE).where({
      date: cmd.gte(startDate).and(cmd.lte(endDate))
    }).get()

    var expensePromise = dbInstance.collection(COLLECTIONS.EXPENSE).where({
      date: cmd.gte(startDate).and(cmd.lte(endDate))
    }).get()

    var fixedExpensePromise = dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).where({
      date: cmd.gte(startDate).and(cmd.lte(endDate)),
      status: cmd.neq('deleted')
    }).get()

    var salaryPromise = dbInstance.collection(COLLECTIONS.STAFF).where({
      status: cmd.neq('inactive')
    }).get()

    // Calculate previous period for comparison
    var prevRange = that._getPreviousPeriodRange()
    var prevIncomePromise = dbInstance.collection(COLLECTIONS.INCOME).where({
      date: cmd.gte(prevRange.start).and(cmd.lte(prevRange.end))
    }).get()

    var prevPurchasePromise = dbInstance.collection(COLLECTIONS.PURCHASE).where({
      date: cmd.gte(prevRange.start).and(cmd.lte(prevRange.end))
    }).get()

    var prevExpensePromise = dbInstance.collection(COLLECTIONS.EXPENSE).where({
      date: cmd.gte(prevRange.start).and(cmd.lte(prevRange.end))
    }).get()

    var prevFixedExpensePromise = dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).where({
      date: cmd.gte(prevRange.start).and(cmd.lte(prevRange.end)),
      status: cmd.neq('deleted')
    }).get()

    Promise.all([
      incomePromise, purchasePromise, expensePromise, fixedExpensePromise, salaryPromise,
      prevIncomePromise, prevPurchasePromise, prevExpensePromise, prevFixedExpensePromise
    ]).then(function(results) {
      var incomeData = results[0].data || []
      var purchaseData = results[1].data || []
      var expenseData = results[2].data || []
      var fixedExpenseData = results[3].data || []
      var staffData = results[4].data || []
      var prevIncomeData = results[5].data || []
      var prevPurchaseData = results[6].data || []
      var prevExpenseData = results[7].data || []
      var prevFixedExpenseData = results[8].data || []

      // Calculate current period totals
      var totalIncome = 0
      var incomeByType = {}
      incomeData.forEach(function(item) {
        var amount = Number(item.amount) || 0
        totalIncome += amount
        var type = item.type || 'other'
        incomeByType[type] = (incomeByType[type] || 0) + amount
      })

      var totalPurchase = 0
      purchaseData.forEach(function(item) {
        totalPurchase += Number(item.amount) || 0
      })

      var totalExpense = 0
      var expenseByCategory = {}
      expenseData.forEach(function(item) {
        var amount = Number(item.amount) || 0
        totalExpense += amount
        var category = item.category || 'other'
        expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
      })
      // Also include fixed expenses (recurring: salary, rent, utilities, supplies, other)
      fixedExpenseData.forEach(function(item) {
        var amount = Number(item.amount) || 0
        totalExpense += amount
        var category = item.category || 'other'
        expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
      })

      var totalSalary = 0
      staffData.forEach(function(item) {
        totalSalary += Number(item.salary) || 0
      })

      var totalExpenseAll = totalPurchase + totalExpense + totalSalary
      var profit = totalIncome - totalExpenseAll

      // Calculate previous period totals for comparison
      var prevTotalIncome = 0
      prevIncomeData.forEach(function(item) {
        prevTotalIncome += Number(item.amount) || 0
      })
      var prevTotalPurchase = 0
      prevPurchaseData.forEach(function(item) {
        prevTotalPurchase += Number(item.amount) || 0
      })
      var prevTotalExpense = 0
      prevExpenseData.forEach(function(item) {
        prevTotalExpense += Number(item.amount) || 0
      })
      prevFixedExpenseData.forEach(function(item) {
        prevTotalExpense += Number(item.amount) || 0
      })
      var prevTotalExpenseAll = prevTotalPurchase + prevTotalExpense + totalSalary
      var prevProfit = prevTotalIncome - prevTotalExpenseAll

      var incomeChange = that._calcChange(totalIncome, prevTotalIncome)
      var expenseChange = that._calcChange(totalExpenseAll, prevTotalExpenseAll)
      var profitChange = that._calcChange(profit, prevProfit)

      // Prepare chart data
      that.prepareIncomeChart(incomeByType)
      that.prepareExpenseChart(expenseByCategory)

      that.setData({
        totalIncome: totalIncome,
        totalExpense: totalExpenseAll,
        profit: profit,
        incomeChange: incomeChange,
        expenseChange: expenseChange,
        profitChange: profitChange,
        loading: false
      })
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载仪表盘数据')
    })
  },

  _getPreviousPeriodRange: function() {
    var type = this.data.periodType
    var prevOffset = this.data.periodOffset - 1
    if (type === 'week') return getWeekRange(prevOffset)
    if (type === 'month') return getMonthRange(prevOffset)
    if (type === 'quarter') return getQuarterRange(prevOffset)
    return getYearRange(prevOffset)
  },

  _calcChange: function(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round((current - previous) / Math.abs(previous) * 100)
  },

  // ==================== Charts ====================

  switchChartTab: function(e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ chartTab: tab })
  },

  switchChartType: function(e) {
    var type = e.currentTarget.dataset.type
    this.setData({ chartType: type })
    // Re-prepare charts with current data
    this.loadData()
  },

  prepareIncomeChart: function(incomeByType) {
    var themeId = app.getTheme()
    var colors = getIncomeTypeColors(themeId)
    var types = ['dining', 'chess', 'liquor', 'teatime', 'service', 'other']
    var that = this

    var series = []
    var breakdown = []
    var totalForPercent = 0

    types.forEach(function(type) {
      var value = incomeByType[type] || 0
      totalForPercent += value
    })

    types.forEach(function(type, index) {
      var value = incomeByType[type] || 0
      if (value > 0) {
        series.push({ name: getIncomeTypeText(type), data: value })
        breakdown.push({
          name: getIncomeTypeText(type),
          value: value,
          color: colors[index],
          percent: totalForPercent > 0 ? (value / totalForPercent * 100).toFixed(1) : '0.0'
        })
      }
    })

    if (series.length === 0) {
      series.push({ name: '暂无数据', data: 1 })
    }

    var chartConfig
    if (that.data.chartType === 'ring') {
      chartConfig = getRingChartConfig(themeId, series, {
        width: that.data.incomeChartWidth,
        height: that.data.incomeChartHeight
      })
    } else {
      chartConfig = getBarChartConfig(themeId, types.map(function(t) { return getIncomeTypeText(t) }), [{
        name: '收入',
        data: types.map(function(t) { return incomeByType[t] || 0 })
      }], {
        width: that.data.incomeChartWidth,
        height: that.data.incomeChartHeight
      })
    }

    that.setData({
      incomeChartData: chartConfig,
      incomeBreakdown: breakdown
    })
  },

  prepareExpenseChart: function(expenseByCategory) {
    var themeId = app.getTheme()
    var colors = getExpenseTypeColors(themeId)
    var categories = ['salary', 'rent', 'utilities', 'supplies', 'other']
    var that = this

    var series = []
    var breakdown = []
    var totalForPercent = 0

    categories.forEach(function(cat) {
      var value = expenseByCategory[cat] || 0
      totalForPercent += value
    })

    categories.forEach(function(cat, index) {
      var value = expenseByCategory[cat] || 0
      if (value > 0) {
        series.push({ name: getExpenseCategoryName(cat), data: value })
        breakdown.push({
          name: getExpenseCategoryName(cat),
          value: value,
          color: colors[index],
          percent: totalForPercent > 0 ? (value / totalForPercent * 100).toFixed(1) : '0.0'
        })
      }
    })

    if (series.length === 0) {
      series.push({ name: '暂无数据', data: 1 })
    }

    var chartConfig
    if (that.data.chartType === 'ring') {
      chartConfig = getRingChartConfig(themeId, series, {
        width: that.data.expenseChartWidth,
        height: that.data.expenseChartHeight
      })
    } else {
      chartConfig = getBarChartConfig(themeId, categories.map(function(c) { return getExpenseCategoryName(c) }), [{
        name: '支出',
        data: categories.map(function(c) { return expenseByCategory[c] || 0 })
      }], {
        width: that.data.expenseChartWidth,
        height: that.data.expenseChartHeight
      })
    }

    that.setData({
      expenseChartData: chartConfig,
      expenseBreakdown: breakdown
    })
  },

  // ==================== Fixed Expenses ====================

  loadFixedExpenses: function() {
    var that = this
    var dbInstance = wx.cloud.database()

    dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).where({
      status: dbInstance.command.neq('deleted')
    }).orderBy('createdAt', 'desc').get().then(function(res) {
      var list = (res.data || []).map(function(item) {
        item.formattedAmount = formatAmount(item.amount)
        return item
      })
      that.setData({ fixedExpenses: list })
    }).catch(function(err) {
      handleCloudError(err, '加载固定支出')
    })
  },

  onFixedExpenseAdd: function() {
    var that = this
    var name = that.data.fixedExpenseName.trim()
    var amount = Number(that.data.fixedExpenseAmount)

    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    var dbInstance = wx.cloud.database()
    var now = dbInstance.serverDate()

    dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).add({
      data: {
        name: name,
        amount: amount,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    }).then(function() {
      wx.hideLoading()
      wx.showToast({ title: '添加成功', icon: 'success' })
      log(LOG_TYPES.EXPENSE_CREATE, '添加固定支出: ' + name)
      that.setData({
        showFixedExpenseModal: false,
        fixedExpenseName: '',
        fixedExpenseAmount: ''
      })
      that.loadFixedExpenses()
    }).catch(function(err) {
      wx.hideLoading()
      handleCloudError(err, '添加固定支出')
    })
  },

  onFixedExpenseDelete: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name

    wx.showModal({
      title: '确认删除',
      content: '确定删除固定支出"' + name + '"吗？',
      success: function(res) {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        var dbInstance = wx.cloud.database()
        dbInstance.collection(COLLECTIONS.FIXED_EXPENSE).doc(id).update({
          data: { status: 'deleted', updatedAt: dbInstance.serverDate() }
        }).then(function() {
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          log(LOG_TYPES.EXPENSE_DELETE, '删除固定支出: ' + name)
          that.loadFixedExpenses()
        }).catch(function(err) {
          wx.hideLoading()
          handleCloudError(err, '删除固定支出')
        })
      }
    })
  },

  onShowFixedExpenseModal: function() {
    this.setData({ showFixedExpenseModal: true })
  },

  onHideFixedExpenseModal: function() {
    this.setData({
      showFixedExpenseModal: false,
      fixedExpenseName: '',
      fixedExpenseAmount: ''
    })
  },

  onFixedExpenseNameInput: function(e) {
    this.setData({ fixedExpenseName: e.detail.value })
  },

  onFixedExpenseAmountInput: function(e) {
    this.setData({ fixedExpenseAmount: e.detail.value })
  },

  // ==================== Navigation ====================

  onStaffManage: function() {
    wx.navigateTo({ url: '/pages/admin/staff/index' })
  },

  onOperationLogs: function() {
    wx.navigateTo({ url: '/pages/admin/logs/index' })
  },

  onAttendance: function() {
    wx.navigateTo({ url: '/pages/admin/attendance/index' })
  },

  onBack: function() {
    wx.navigateBack()
  }
})
