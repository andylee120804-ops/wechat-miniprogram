const mockApp = {
  globalData: { statusBarHeight: 44, userInfo: { _id: 'u1', role: 'admin' } },
  getThemePageData: jest.fn(() => ({}))
}

let pageInstance
let mockQueryAll
const originalPage = global.Page

function capturePage(pageDef) {
  pageInstance = pageDef
  pageInstance.data = { ...pageDef.data }
  pageInstance.setData = jest.fn((data) => {
    Object.assign(pageInstance.data, data)
  })
}

describe('admin dashboard week picker', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    pageInstance = null
    mockApp.globalData.userInfo = { _id: 'u1', role: 'admin' }
    mockQueryAll = jest.fn(() => Promise.resolve({ data: [] }))

    global.getApp = jest.fn(() => mockApp)
    global.Page = jest.fn(capturePage)
    global.wx = {
      getWindowInfo: jest.fn(() => ({ windowWidth: 375, statusBarHeight: 44 })),
      navigateBack: jest.fn(),
      showToast: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      cloud: {
        callFunction: jest.fn(() => Promise.resolve({ result: { success: true, data: {} } }))
      }
    }

    jest.doMock('../../miniprogram/utils/helpers', () => ({
      getWeekRange: jest.fn(() => ({ start: '2026-05-11', end: '2026-05-17', label: '2026年第20周', weekNum: 20, year: 2026 })),
      getMonthRange: jest.fn(() => ({ start: '2026-05-01', end: '2026-05-31', label: '2026-05' })),
      getYearRange: jest.fn(() => ({ start: '2026-01-01', end: '2026-12-31', label: '2026年' })),
      getWeekNumber: jest.fn(() => ({ year: 2026, week: 20 })),
      getIncomeTypeText: jest.fn((type) => type),
      getCategoryName: jest.fn((type) => type),
      getExpenseCategoryName: jest.fn((type) => type),
      formatDate: jest.fn((date) => date)
    }))

    jest.doMock('../../miniprogram/utils/error-handler', () => ({
      handleCloudError: jest.fn()
    }))

    jest.doMock('../../miniprogram/utils/chart-config', () => ({
      getRingChartConfig: jest.fn(() => ({})),
      getIncomeTypeColors: jest.fn(() => ({})),
      getExpenseTypeColors: jest.fn(() => ({}))
    }))

    jest.doMock('../../miniprogram/utils/permission', () => ({
      checkPermission: jest.fn(() => true),
      ACTIONS: { VIEW: 'view' }
    }))

    jest.doMock('../../miniprogram/utils/db', () => ({
      queryAll: mockQueryAll,
      getDb: jest.fn(() => ({
        command: {
          gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'range', value })) })),
          lte: jest.fn((value) => ({ op: 'lte', value }))
        }
      })),
      COLLECTIONS: {
        INCOME: 'income',
        EXPENSE: 'expense',
        PURCHASE: 'purchase',
        FIXED_EXPENSE: 'fixed_expense',
        STAFF: 'staff'
      }
    }))

    require('../../miniprogram/pages/admin/dashboard/index.js')
    pageInstance.loadData = jest.fn()
    pageInstance.setPeriodRange = jest.fn()
  })

  afterAll(() => {
    global.Page = originalPage
  })

  test('week picker confirm does not throw and reloads data', () => {
    pageInstance.data.periodType = 'week'
    pageInstance.data.pickerYear = 2026
    pageInstance.data.pickerWeek = 20
    pageInstance.data.periodOffset = 0

    expect(() => pageInstance.onPickerConfirm()).not.toThrow()

    expect(pageInstance.data.showPicker).toBe(false)
    expect(typeof pageInstance.data.periodOffset).toBe('number')
    expect(pageInstance.setPeriodRange).toHaveBeenCalledTimes(1)
    expect(pageInstance.loadData).toHaveBeenCalledTimes(1)
  })

  test('non-admin and non-boss export is blocked before client-side detail queries', () => {
    mockApp.globalData.userInfo = { _id: 'u2', role: 'waiter' }
    pageInstance.data.loading = false
    pageInstance.data.startDate = '2026-06-01'
    pageInstance.data.endDate = '2026-06-30'

    pageInstance.onExportExcel()

    expect(mockQueryAll).not.toHaveBeenCalled()
    expect(wx.showLoading).not.toHaveBeenCalled()
    expect(wx.showToast).toHaveBeenCalledWith({ title: '仅老板和管理员可导出', icon: 'none' })
  })

  test('boss export calls cloud function without client-side detail queries', () => {
    mockApp.globalData.userInfo = { _id: 'boss1', role: 'boss' }
    pageInstance.data.loading = false
    pageInstance.data.startDate = '2026-06-01'
    pageInstance.data.endDate = '2026-06-30'
    pageInstance.data.periodType = 'month'
    pageInstance.data.periodLabel = '2026-06'

    pageInstance.onExportExcel()

    expect(wx.showLoading).toHaveBeenCalledWith({ title: '导出中...' })
    expect(mockQueryAll).not.toHaveBeenCalled()
    expect(wx.cloud.callFunction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'exportReportXlsx',
      data: {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        periodType: 'month',
        periodLabel: '2026-06'
      }
    }))
  })
})
