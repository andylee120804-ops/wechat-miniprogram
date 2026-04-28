const app = getApp()
const { getWeekRange, getMonthRange, getYearRange, getIncomeTypeText, getWeekNumber } = require('../../../utils/helpers')
const { handleCloudError } = require('../../../utils/error-handler')
const { getRingChartConfig, getIncomeTypeColors, getExpenseTypeColors } = require('../../../utils/chart-config')
const { checkPermission } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    statusBarHeight: 0,
    // Period controls
    periodType: 'month',
    periodOffset: 0,
    periodLabel: '',
    startDate: '',
    endDate: '',
    // KPI totals
    totalIncome: '0.00',
    totalExpense: '0.00',
    profit: '0.00',
    profitAbs: '0.00',
    // Chart
    chartMode: 'income',
    incomeChartData: null,
    expenseChartData: null,
    currentChartData: null,
    incomeBreakdown: [],
    expenseBreakdown: [],
    currentBreakdown: [],
    // Period picker
    showPicker: false,
    pickerYear: 2026,
    pickerMonth: 1,
    pickerWeek: 1,
    pickerYears: [],
    pickerMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    pickerWeeks: []
  },

  onLoad: function() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 44 })
    // Generate week numbers 1-53
    var weeks = []
    for (var i = 1; i <= 53; i++) weeks.push(i)
    this.setData({ pickerWeeks: weeks })
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
    // Always show the computed label from helpers (e.g. "2026-04" or "本周")
    return label
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

  quickSelect: function(e) {
    var offset = parseInt(e.currentTarget.dataset.offset)
    var type = e.currentTarget.dataset.type
    this.setData({
      periodType: type,
      periodOffset: offset
    })
    this.setPeriodRange()
    this.loadData()
  },

  // ==================== Period Picker ====================

  showPeriodPicker: function() {
    var now = new Date()
    // Compute current year and period from current offset
    var type = this.data.periodType
    var offset = this.data.periodOffset
    var targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1)

    var pickerYear = targetDate.getFullYear()
    var pickerMonth = targetDate.getMonth() + 1

    // For week type, compute the week number from current offset
    var pickerWeek = 1
    if (type === 'week') {
      var weekRange = getWeekRange(offset)
      pickerWeek = weekRange.weekNum || 1
      pickerYear = weekRange.year || pickerYear
    }

    // Build year list: current year ± 3
    var currentYear = now.getFullYear()
    var years = []
    for (var y = currentYear - 3; y <= currentYear + 1; y++) {
      years.push(y)
    }

    this.setData({
      showPicker: true,
      pickerYear: pickerYear,
      pickerMonth: pickerMonth,
      pickerWeek: pickerWeek,
      pickerYears: years
    })
  },

  onPickerYearSelect: function(e) {
    this.setData({ pickerYear: e.currentTarget.dataset.year })
  },

  onPickerMonthSelect: function(e) {
    this.setData({ pickerMonth: e.currentTarget.dataset.month })
  },

  onPickerWeekSelect: function(e) {
    this.setData({ pickerWeek: e.currentTarget.dataset.week })
  },

  onPickerConfirm: function() {
    var type = this.data.periodType
    var now = new Date()
    var pickerYear = this.data.pickerYear
    var offset

    if (type === 'year') {
      offset = pickerYear - now.getFullYear()
    } else if (type === 'month') {
      // Calculate offset in months from current month
      offset = (pickerYear - now.getFullYear()) * 12 + (this.data.pickerMonth - 1 - now.getMonth())
    } else {
      // week — compute offset from current ISO week
      var currentWeekInfo = getWeekNumber(now)
      var currentYear = currentWeekInfo.year
      var currentWeek = currentWeekInfo.week
      var targetYear = pickerYear
      var targetWeek = this.data.pickerWeek
      // Approximate week offset (years * 52 + week diff), then refine by checking Monday difference
      var approxOffset = (targetYear - currentYear) * 52 + (targetWeek - currentWeek)
      // Refine using actual Monday dates
      var currentMonday = this.getMondayOfWeek(currentYear, currentWeek)
      var targetMonday = this.getMondayOfWeek(targetYear, targetWeek)
      var diffDays = (targetMonday.getTime() - currentMonday.getTime()) / 86400000
      offset = Math.round(diffDays / 7)
    }

    this.setData({
      showPicker: false,
      periodOffset: offset
    })
    this.setPeriodRange()
    this.loadData()
  },

  // Helper to get Monday of a given ISO year/week
  getMondayOfWeek: function(year, week) {
    var jan4 = new Date(year, 0, 4)
    var jan4Day = jan4.getDay() || 7
    var jan4Monday = new Date(jan4)
    jan4Monday.setDate(jan4.getDate() - jan4Day + 1)
    var target = new Date(jan4Monday)
    target.setDate(jan4Monday.getDate() + (week - 1) * 7)
    target.setHours(0, 0, 0, 0)
    return target
  },

  onPickerCancel: function() {
    this.setData({ showPicker: false })
  },

  // ==================== Chart Mode Toggle ====================

  toggleChartMode: function() {
    var mode = this.data.chartMode === 'income' ? 'expense' : 'income'
    this.setData({
      chartMode: mode,
      currentChartData: mode === 'income' ? this.data.incomeChartData : this.data.expenseChartData,
      currentBreakdown: mode === 'income' ? this.data.incomeBreakdown : this.data.expenseBreakdown
    })
  },

  switchToIncome: function() {
    if (this.data.chartMode === 'income') return
    this.setData({
      chartMode: 'income',
      currentChartData: this.data.incomeChartData,
      currentBreakdown: this.data.incomeBreakdown
    })
  },

  switchToExpense: function() {
    if (this.data.chartMode === 'expense') return
    this.setData({
      chartMode: 'expense',
      currentChartData: this.data.expenseChartData,
      currentBreakdown: this.data.expenseBreakdown
    })
  },

  // ==================== Data Loading ====================

  loadData: function() {
    var that = this
    that.setData({ loading: true })

    var startDate = that.data.startDate
    var endDate = that.data.endDate

    // Query current period data
    var incomePromise = db.queryAll(COLLECTIONS.INCOME, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    var purchasePromise = db.queryAll(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    var expensePromise = db.queryAll(COLLECTIONS.EXPENSE, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    // Fixed expenses: new format (monthlyAmount items) + old format (date-based records)
    var fixedExpensePromise = db.queryAll(COLLECTIONS.FIXED_EXPENSE, {})

    var salaryPromise = db.queryAll(COLLECTIONS.STAFF, {
      status: db.getDb().command.neq('inactive')
    })

    Promise.all([
      incomePromise, purchasePromise, expensePromise, fixedExpensePromise, salaryPromise
    ]).then(function(results) {
      var incomeData = results[0].data || []
      var purchaseData = results[1].data || []
      var expenseData = results[2].data || []
      var fixedExpenseData = results[3].data || []
      var staffData = results[4].data || []

      // Calculate income totals
      var totalIncome = 0
      var incomeByType = {}
      incomeData.forEach(function(item) {
        var amount = Number(item.amount) || 0
        totalIncome += amount
        var type = item.type || 'other'
        incomeByType[type] = (incomeByType[type] || 0) + amount
      })

      // Calculate purchase totals
      var totalPurchase = 0
      purchaseData.forEach(function(item) {
        totalPurchase += Number(item.amount) || 0
      })

      // Calculate expense totals (expense + fixed_expense)
      var totalExpense = 0
      var expenseByCategory = {}
      expenseData.forEach(function(item) {
        var amount = Number(item.amount) || 0
        totalExpense += amount
        var category = item.category || 'other'
        expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
      })

      // Fixed expenses: new format (monthlyAmount) scaled to period; old format (date) matched by range
      var periodMonths = 1
      if (that.data.periodType === 'year') periodMonths = 12
      else if (that.data.periodType === 'week') periodMonths = 0.23

      var fixedByName = {}

      fixedExpenseData.forEach(function(item) {
        if (item.monthlyAmount) {
          // New format: recurring item with monthly amount — check active period
          // Only include if item is active during the selected period
          if (item.startDate && item.startDate > endDate) return
          if (item.endDate && item.endDate < startDate) return

          var monthlyVal = Number(item.monthlyAmount) || 0
          var amount = monthlyVal * periodMonths
          totalExpense += amount
          var name = item.name || '固定成本'
          fixedByName[name] = (fixedByName[name] || 0) + amount
        } else if (item.date && item.date >= startDate && item.date <= endDate) {
          // Old format: date-range matched record — use original category
          var amount = Number(item.amount || 0)
          totalExpense += amount
          var cat = item.category || 'other'
          expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount
        }
      })

      // Calculate salary totals (respect hireDate and scale by periodMonths)
      var totalSalary = 0
      staffData.forEach(function(item) {
        // Only include salary if staff was hired on or before the period end date
        if (item.hireDate && item.hireDate > endDate) return
        totalSalary += (Number(item.salary) || 0) * periodMonths
      })

      var totalExpenseAll = totalPurchase + totalExpense + totalSalary
      // Guard against NaN from bad data — prevents crash in .toFixed()
      if (isNaN(totalExpenseAll)) totalExpenseAll = 0
      var profit = totalIncome - totalExpenseAll

      // Prepare chart data — pass purchase and salary for expense chart
      var incomeResult = that.prepareIncomeChart(incomeByType)
      var expenseResult = that.prepareExpenseChart(expenseByCategory, totalPurchase, totalSalary, fixedByName)

      var incomeChartData = incomeResult.chartConfig
      var incomeBreakdown = incomeResult.breakdown
      var expenseChartData = expenseResult.chartConfig
      var expenseBreakdown = expenseResult.breakdown

      var currentChartData = that.data.chartMode === 'income' ? incomeChartData : expenseChartData
      var currentBreakdown = that.data.chartMode === 'income' ? incomeBreakdown : expenseBreakdown

      that.setData({
        totalIncome: totalIncome.toFixed(2),
        totalExpense: totalExpenseAll.toFixed(2),
        profit: profit.toFixed(2),
        profitAbs: Math.abs(profit).toFixed(2),
        incomeChartData: incomeChartData,
        expenseChartData: expenseChartData,
        incomeBreakdown: incomeBreakdown,
        expenseBreakdown: expenseBreakdown,
        currentChartData: currentChartData,
        currentBreakdown: currentBreakdown,
        loading: false
      })
    }).catch(function(err) {
      that.setData({ loading: false })
      handleCloudError(err, '加载仪表盘数据')
    })
  },

  // ==================== Charts ====================

  prepareIncomeChart: function(incomeByType) {
    var themeId = app.getTheme()
    var colors = getIncomeTypeColors(themeId)
    var types = ['dining', 'chess', 'liquor', 'teatime', 'service', 'other']

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
        var color = colors[index]
        series.push({ name: getIncomeTypeText(type), data: value, color: color })
        breakdown.push({
          name: getIncomeTypeText(type),
          value: value.toFixed(2),
          color: color,
          percent: totalForPercent > 0 ? (value / totalForPercent * 100).toFixed(1) : '0.0'
        })
      }
    })

    if (series.length === 0) {
      series.push({ name: '暂无数据', data: 1, color: colors[5] })
    }

    var chartConfig = getRingChartConfig(themeId, series, {
      width: 280,
      height: 280,
      colors: colors
    })

    return { chartConfig: chartConfig, breakdown: breakdown }
  },

  prepareExpenseChart: function(expenseByCategory, totalPurchase, totalSalary, fixedByName) {
    var themeId = app.getTheme()
    var colors = getExpenseTypeColors(themeId)
    // Expense composition: 采购 + 各类支出 + 工资
    var expenseItems = [
      { key: 'purchase', name: '采购', value: totalPurchase || 0 },
      { key: 'salary', name: '工资', value: totalSalary || 0 },
      { key: 'rent', name: '房租', value: expenseByCategory['rent'] || 0 },
      { key: 'utilities', name: '水电', value: expenseByCategory['utilities'] || 0 },
      { key: 'supplies', name: '物资', value: expenseByCategory['supplies'] || 0 },
      { key: 'other', name: '其他', value: expenseByCategory['other'] || 0 }
    ]

    // Break down fixed costs by name into separate chart entries
    if (fixedByName) {
      var fixedNames = Object.keys(fixedByName).sort()
      fixedNames.forEach(function(name) {
        expenseItems.push({ key: 'fixed_' + name, name: name, value: fixedByName[name] })
      })
    }

    var series = []
    var breakdown = []
    var totalForPercent = 0

    expenseItems.forEach(function(item) {
      totalForPercent += item.value
    })

    // Use distinct colors for each expense item (base 6 + extended for fixed cost names)
    var expenseColors = ['#F87171', '#C9A96E', '#60A5FA', '#4ADE80', '#FBBF24', '#6B7B8D', '#A78BFA', '#F472B6', '#34D399', '#FB923C', '#22D3EE', '#E879F9', '#FDE047']

    expenseItems.forEach(function(item, index) {
      if (item.value > 0) {
        var color = expenseColors[index]
        series.push({ name: item.name, data: item.value, color: color })
        breakdown.push({
          name: item.name,
          value: item.value.toFixed(2),
          color: color,
          percent: totalForPercent > 0 ? (item.value / totalForPercent * 100).toFixed(1) : '0.0'
        })
      }
    })

    if (series.length === 0) {
      series.push({ name: '暂无数据', data: 1, color: expenseColors[5] })
    }

    var chartConfig = getRingChartConfig(themeId, series, {
      width: 280,
      height: 280,
      colors: expenseColors
    })

    return { chartConfig: chartConfig, breakdown: breakdown }
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
