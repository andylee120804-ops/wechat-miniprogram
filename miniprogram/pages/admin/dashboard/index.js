const app = getApp()
const { getWeekRange, getMonthRange, getYearRange, getWeekNumber, getIncomeTypeText, getCategoryName, getExpenseCategoryName, formatDate } = require('../../../utils/helpers')
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
    canExportReport: false,
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
    this.setData({
      theme: app.getThemePageData(),
      canExportReport: app.globalData.userInfo && (app.globalData.userInfo.role === 'admin' || app.globalData.userInfo.role === 'boss')
    })
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

    // 调用云函数获取财务统计（与 AI Skill 共用唯一计算源，口径永远一致）
    wx.cloud.callFunction({
      name: 'getFinanceStats',
      data: {
        startDate: startDate,
        endDate: endDate,
        periodType: that.data.periodType
      },
      success: function(res) {
        const result = res.result
        if (!result || !result.success) {
          that.setData({ loading: false })
          handleCloudError(new Error((result && result.message) || '加载失败'), '加载仪表盘数据')
          return
        }
        const f = result.data
        const totalIncome = f.totalIncome
        const totalExpenseAll = f.totalExpenseAll // 采购 + 运营支出 + 工资
        const profit = f.netProfit

        const incomeResult = that.prepareIncomeChart(f.incomeByType)
        const expenseResult = that.prepareExpenseChart(f.expenseByCategory, f.totalPurchase, f.totalSalary, f.fixedByName)

        const incomeChartData = incomeResult.chartConfig
        const incomeBreakdown = incomeResult.breakdown
        const expenseChartData = expenseResult.chartConfig
        const expenseBreakdown = expenseResult.breakdown

        that.setData({
          totalIncome: totalIncome.toFixed(2),
          totalExpense: totalExpenseAll.toFixed(2),
          profit: profit.toFixed(2),
          profitAbs: Math.abs(profit).toFixed(2),
          incomeChartData: incomeChartData,
          expenseChartData: expenseChartData,
          incomeBreakdown: incomeBreakdown,
          expenseBreakdown: expenseBreakdown,
          currentChartData: that.data.chartMode === 'income' ? incomeChartData : expenseChartData,
          currentBreakdown: that.data.chartMode === 'income' ? incomeBreakdown : expenseBreakdown,
          loading: false
        })
      },
      fail: function(err) {
        that.setData({ loading: false })
        handleCloudError(err, '加载仪表盘数据')
      }
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
      { key: 'salary', name: '工资', value: Math.ceil(totalSalary || 0) },
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

  // ==================== Export Excel ====================

  onExportExcel: function() {
    const that = this
    if (that.data.loading) return
    if (!app.globalData.userInfo || (app.globalData.userInfo.role !== 'admin' && app.globalData.userInfo.role !== 'boss')) {
      wx.showToast({ title: '仅老板和管理员可导出', icon: 'none' })
      return
    }
    wx.showLoading({ title: '导出中...' })

    wx.cloud.callFunction({
      name: 'exportReportXlsx',
      data: {
        startDate: that.data.startDate,
        endDate: that.data.endDate,
        periodType: that.data.periodType,
        periodLabel: that.data.periodLabel
      },
      success: function(res) {
          const result = res.result
          if (!result.success) {
            wx.hideLoading()
            wx.showToast({ title: result.message || '导出失败', icon: 'none' })
            return
          }
          // Download the file from cloud storage
          const fileID = result.fileID
          wx.cloud.downloadFile({
            fileID: fileID,
            success: function(downloadRes) {
              wx.hideLoading()
              // Open the file directly — user can share/save from the viewer
              wx.openDocument({
                filePath: downloadRes.tempFilePath,
                fileType: 'xls',
                showMenu: true,
                success: function() {
                  wx.showToast({ title: '打开成功', icon: 'success' })
                },
                fail: function(err) {
                  console.error('openDocument失败:', err)
                  // Fallback: share file to chat
                  wx.shareFileMessage({
                    filePath: downloadRes.tempFilePath,
                    fileName: result.fileName || '报表.xlsx',
                    fail: function() {
                      wx.showToast({ title: '打开文件失败', icon: 'none' })
                    }
                  })
                }
              })
            },
            fail: function(err) {
              wx.hideLoading()
              console.error('downloadFile失败:', err)
              wx.showToast({ title: '下载文件失败', icon: 'none' })
            }
          })
        },
        fail: function(err) {
          wx.hideLoading()
          console.error('exportReportXlsx调用失败:', err)
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      })
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
  },

  // ==================== Proration Helpers ====================

  /**
   * Calculate prorated months multiplier based on the overlap between
   * an item's active period and the report period.
   * Handles mid-period start/end dates for accurate expense allocation.
   * @param {string|null} itemStart - Item start date (YYYY-MM-DD) or null
   * @param {string|null} itemEnd - Item end date (YYYY-MM-DD) or null
   * @param {string} periodStart - Report period start (YYYY-MM-DD)
   * @param {string} periodEnd - Report period end (YYYY-MM-DD)
   * @param {number} periodMonths - Number of months in the period (computed from date range)
   * @returns {number} Prorated months multiplier (0 if no overlap)
   */
  calcProratedMonths: function(itemStart, itemEnd, periodStart, periodEnd, periodMonths) {
    const pStart = new Date(periodStart + 'T00:00:00')
    const pEnd = new Date(periodEnd + 'T23:59:59')

    const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
    const end = itemEnd ? new Date(itemEnd + 'T23:59:59') : pEnd

    const activeStart = start > pStart ? start : pStart
    const activeEnd = end < pEnd ? end : pEnd

    if (activeStart >= activeEnd) return 0

    const totalDays = (pEnd - pStart) / (1000 * 60 * 60 * 24)
    const activeDays = (activeEnd - activeStart) / (1000 * 60 * 60 * 24)

    return periodMonths * (activeDays / totalDays)
  },

  /**
   * Check if a fixed expense item is active (overlaps) during the report period.
   * Used for fixed expenses which are counted by whole months rather than prorated by day.
   * @param {string|null} itemStart - Item start date (YYYY-MM-DD) or null
   * @param {string|null} itemEnd - Item end date (YYYY-MM-DD) or null
   * @param {string} periodStart - Report period start (YYYY-MM-DD)
   * @param {string} periodEnd - Report period end (YYYY-MM-DD)
   * @returns {boolean} True if the item overlaps with the report period
   */
  isFixedExpenseActive: function(itemStart, itemEnd, periodStart, periodEnd) {
    const pStart = new Date(periodStart + 'T00:00:00')
    const pEnd = new Date(periodEnd + 'T23:59:59')

    const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
    const end = itemEnd ? new Date(itemEnd + 'T23:59:59') : pEnd

    // No overlap if item ends before period starts, or item starts after period ends
    if (end < pStart || start > pEnd) return false

    return true
  }
})
