const app = getApp()
const { getWeekRange, getMonthRange, getYearRange, getIncomeTypeText, getWeekNumber } = require('../../../utils/helpers')
const { handleCloudError } = require('../../../utils/error-handler')
const { getRingChartConfig, getIncomeTypeColors, getExpenseTypeColors } = require('../../../utils/chart-config')
const { checkPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    statusBarHeight: 44,
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
    const sysInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 44 })
    // Calculate chart size based on screen width (account for mx-lg margins + internal padding)
    const pxWidth = sysInfo.windowWidth
    // mx-lg = 24rpx each side; 750rpx = pxWidth px, so 1rpx = pxWidth/750
    const totalMargin = 48 * pxWidth / 750   // mx-lg both sides
    const innerPadding = 32 * pxWidth / 750   // card internal padding
    const chartSize = Math.min(Math.floor(pxWidth - totalMargin - innerPadding), 320)
    this.setData({ chartSize: Math.max(chartSize, 240) })
    // Generate week numbers 1-53
    const weeks = []
    for (let i = 1; i <= 53; i++) weeks.push(i)
    this.setData({ pickerWeeks: weeks })
    this.setPeriodRange()
  },

  onShow: function() {
    if (!checkPermission('dashboard', ACTIONS.VIEW)) {
      wx.navigateBack()
      return
    }
    this.setData({ theme: app.getThemePageData() })
    this.setPeriodRange()
    this.loadData()
  },

  // ==================== Period Range ====================

  setPeriodRange: function() {
    const type = this.data.periodType
    const offset = this.data.periodOffset
    let range

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
    const type = e.currentTarget.dataset.type
    this.setData({
      periodType: type,
      periodOffset: 0
    })
    this.setPeriodRange()
    this.loadData()
  },

  quickSelect: function(e) {
    const offset = parseInt(e.currentTarget.dataset.offset)
    const type = e.currentTarget.dataset.type
    this.setData({
      periodType: type,
      periodOffset: offset
    })
    this.setPeriodRange()
    this.loadData()
  },

  // ==================== Period Picker ====================

  showPeriodPicker: function() {
    const now = new Date()
    // Compute current year and period from current offset
    const type = this.data.periodType
    const offset = this.data.periodOffset
    const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1)

    let pickerYear = targetDate.getFullYear()
    let pickerMonth = targetDate.getMonth() + 1

    // For week type, compute the week number from current offset
    let pickerWeek = 1
    if (type === 'week') {
      const weekRange = getWeekRange(offset)
      pickerWeek = weekRange.weekNum || 1
      pickerYear = weekRange.year || pickerYear
    }

    // Build year list: current year ± 3
    const currentYear = now.getFullYear()
    const years = []
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
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
    const type = this.data.periodType
    const now = new Date()
    const pickerYear = this.data.pickerYear
    let offset

    if (type === 'year') {
      offset = pickerYear - now.getFullYear()
    } else if (type === 'month') {
      // Calculate offset in months from current month
      offset = (pickerYear - now.getFullYear()) * 12 + (this.data.pickerMonth - 1 - now.getMonth())
    } else {
      // week — compute offset from current ISO week
      const currentWeekInfo = getWeekNumber(now)
      const currentYear = currentWeekInfo.year
      const currentWeek = currentWeekInfo.week
      const targetYear = pickerYear
      const targetWeek = this.data.pickerWeek
      // Approximate week offset (years * 52 + week diff), then refine by checking Monday difference
      const approxOffset = (targetYear - currentYear) * 52 + (targetWeek - currentWeek)
      // Refine using actual Monday dates
      const currentMonday = this.getMondayOfWeek(currentYear, currentWeek)
      const targetMonday = this.getMondayOfWeek(targetYear, targetWeek)
      const diffDays = (targetMonday.getTime() - currentMonday.getTime()) / 86400000
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
    const jan4 = new Date(year, 0, 4)
    const jan4Day = jan4.getDay() || 7
    const jan4Monday = new Date(jan4)
    jan4Monday.setDate(jan4.getDate() - jan4Day + 1)
    const target = new Date(jan4Monday)
    target.setDate(jan4Monday.getDate() + (week - 1) * 7)
    target.setHours(0, 0, 0, 0)
    return target
  },

  onPickerCancel: function() {
    this.setData({ showPicker: false })
  },

  // ==================== Chart Mode Toggle ====================

  toggleChartMode: function() {
    const mode = this.data.chartMode === 'income' ? 'expense' : 'income'
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
    const that = this
    that.setData({ loading: true })

    const startDate = that.data.startDate
    const endDate = that.data.endDate

    // Query current period data
    const incomePromise = db.queryAll(COLLECTIONS.INCOME, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    const purchasePromise = db.queryAll(COLLECTIONS.PURCHASE, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    const expensePromise = db.queryAll(COLLECTIONS.EXPENSE, {
      date: db.getDb().command.gte(startDate).and(db.getDb().command.lte(endDate))
    })

    // Fixed expenses: new format (monthlyAmount items) + old format (date-based records)
    const fixedExpensePromise = db.queryAll(COLLECTIONS.FIXED_EXPENSE, { active: true })

    const salaryPromise = db.queryAll(COLLECTIONS.STAFF, {
      status: 'active'
    })

    Promise.all([
      incomePromise, purchasePromise, expensePromise, fixedExpensePromise, salaryPromise
    ]).then(function(results) {
      const incomeData = results[0].data || []
      const purchaseData = results[1].data || []
      const expenseData = results[2].data || []
      const fixedExpenseData = results[3].data || []
      const staffData = results[4].data || []

      // Calculate income totals
      let totalIncome = 0
      const incomeByType = {}
      incomeData.forEach(function(item) {
        const amount = Number(item.amount) || 0
        totalIncome += amount
        const type = item.type || 'other'
        incomeByType[type] = (incomeByType[type] || 0) + amount
      })

      // Calculate purchase totals (only count reimbursed or unset status)
      let totalPurchase = 0
      purchaseData.forEach(function(item) {
        if (!item.status || item.status === 'reimbursed') {
          totalPurchase += Number(item.amount) || 0
        }
      })

      // Calculate expense totals (expense + fixed_expense)
      let totalExpense = 0
      const expenseByCategory = {}
      expenseData.forEach(function(item) {
        const amount = Number(item.amount) || 0
        totalExpense += amount
        const category = item.category || 'other'
        expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
      })

      // Fixed expenses: new format (monthlyAmount) scaled to period; old format (date) matched by range
      let periodMonths = 1
      if (that.data.periodType === 'year') periodMonths = 12
      else if (that.data.periodType === 'week') periodMonths = 0.23

      const fixedByName = {}

      fixedExpenseData.forEach(function(item) {
        if (item.monthlyAmount) {
          // New format: recurring item with monthly amount — check active period
          // Only include if item is active during the selected period
          if (item.startDate && item.startDate > endDate) return
          if (item.endDate && item.endDate < startDate) return

          const monthlyVal = Number(item.monthlyAmount) || 0
          const amount = monthlyVal * periodMonths
          totalExpense += amount
          const name = item.name || '固定成本'
          fixedByName[name] = (fixedByName[name] || 0) + amount
        } else if (item.date && item.date >= startDate && item.date <= endDate) {
          // Old format: date-range matched record — use original category
          const amount = Number(item.amount || 0)
          totalExpense += amount
          const cat = item.category || 'other'
          expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount
        }
      })

      // Calculate salary totals (respect hireDate and scale by periodMonths)
      let totalSalary = 0
      staffData.forEach(function(item) {
        // Only include salary if staff was hired on or before the period end date
        if (item.hireDate && item.hireDate > endDate) return
        totalSalary += (Number(item.salary) || 0) * periodMonths
      })

      let totalExpenseAll = totalPurchase + totalExpense + totalSalary
      // Guard against NaN from bad data — prevents crash in .toFixed()
      if (isNaN(totalExpenseAll)) totalExpenseAll = 0
      const profit = totalIncome - totalExpenseAll

      // Prepare chart data — pass purchase and salary for expense chart
      const incomeResult = that.prepareIncomeChart(incomeByType)
      const expenseResult = that.prepareExpenseChart(expenseByCategory, totalPurchase, totalSalary, fixedByName)

      const incomeChartData = incomeResult.chartConfig
      const incomeBreakdown = incomeResult.breakdown
      const expenseChartData = expenseResult.chartConfig
      const expenseBreakdown = expenseResult.breakdown

      const currentChartData = that.data.chartMode === 'income' ? incomeChartData : expenseChartData
      const currentBreakdown = that.data.chartMode === 'income' ? incomeBreakdown : expenseBreakdown

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
    const themeId = app.getTheme()
    const colors = getIncomeTypeColors(themeId)
    const types = ['dining', 'chess', 'liquor', 'teatime', 'service', 'other']

    const series = []
    const breakdown = []
    let totalForPercent = 0

    types.forEach(function(type) {
      const value = incomeByType[type] || 0
      totalForPercent += value
    })

    types.forEach(function(type, index) {
      const value = incomeByType[type] || 0
      if (value > 0) {
        const color = colors[index]
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

    const chartConfig = getRingChartConfig(themeId, series, {
      width: this.data.chartSize,
      height: this.data.chartSize,
      colors: colors
    })

    return { chartConfig: chartConfig, breakdown: breakdown }
  },

  prepareExpenseChart: function(expenseByCategory, totalPurchase, totalSalary, fixedByName) {
    const themeId = app.getTheme()
    const colors = getExpenseTypeColors(themeId)
    // Expense composition: 采购 + 各类支出 + 工资
    const expenseItems = [
      { key: 'purchase', name: '采购', value: totalPurchase || 0 },
      { key: 'salary', name: '工资', value: totalSalary || 0 },
      { key: 'rent', name: '房租', value: expenseByCategory['rent'] || 0 },
      { key: 'utilities', name: '水电', value: expenseByCategory['utilities'] || 0 },
      { key: 'supplies', name: '物资', value: expenseByCategory['supplies'] || 0 },
      { key: 'other', name: '其他', value: expenseByCategory['other'] || 0 }
    ]

    // Break down fixed costs by name into separate chart entries
    if (fixedByName) {
      const fixedNames = Object.keys(fixedByName).sort()
      fixedNames.forEach(function(name) {
        expenseItems.push({ key: 'fixed_' + name, name: name, value: fixedByName[name] })
      })
    }

    const series = []
    const breakdown = []
    let totalForPercent = 0

    expenseItems.forEach(function(item) {
      totalForPercent += item.value
    })

    // Use distinct colors for each expense item (base 6 + extended for fixed cost names)
    const expenseColors = ['#F87171', '#C9A96E', '#60A5FA', '#4ADE80', '#FBBF24', '#6B7B8D', '#A78BFA', '#F472B6', '#34D399', '#FB923C', '#22D3EE', '#E879F9', '#FDE047']

    expenseItems.forEach(function(item, index) {
      if (item.value > 0) {
        const color = expenseColors[index]
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

    const chartConfig = getRingChartConfig(themeId, series, {
      width: this.data.chartSize,
      height: this.data.chartSize,
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
