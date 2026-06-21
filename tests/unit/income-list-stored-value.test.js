const originalPage = global.Page
const originalGetApp = global.getApp

let pageInstance
let mockQueryPage
let mockQueryAll
let mockGetIncomeDisplayType

function capturePage(pageDef) {
  pageInstance = Object.assign({}, pageDef)
  pageInstance.data = Object.assign({}, pageDef.data)
  pageInstance.setData = jest.fn((data) => {
    pageInstance.data = Object.assign({}, pageInstance.data, data)
  })
}

function loadIncomeListPage() {
  jest.resetModules()
  pageInstance = null
  mockQueryPage = jest.fn()
  mockQueryAll = jest.fn()
  mockGetIncomeDisplayType = jest.fn((income) => income.categoryLabel || income.type)

  global.getApp = jest.fn(() => ({
    globalData: { statusBarHeight: 44 },
    getThemePageData: jest.fn(() => ({}))
  }))
  global.Page = jest.fn(capturePage)
  global.wx = {
    showToast: jest.fn(),
    navigateBack: jest.fn(),
    navigateTo: jest.fn()
  }

  jest.doMock('../../miniprogram/utils/permission', () => ({
    hasPermission: jest.fn(() => true),
    ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
  }))
  jest.doMock('../../miniprogram/utils/db', () => ({
    getDb: jest.fn(() => ({
      command: {
        gte: jest.fn(() => ({ and: jest.fn(() => 'date-range') })),
        lte: jest.fn(() => 'end-date')
      }
    })),
    queryPage: mockQueryPage,
    queryAll: mockQueryAll,
    COLLECTIONS: { INCOME: 'income' }
  }))
  jest.doMock('../../miniprogram/utils/helpers', () => ({
    formatDate: jest.fn((value) => value || '2026-06-21'),
    formatAmount: jest.fn((value) => `¥${value}`),
    getIncomeDisplayType: mockGetIncomeDisplayType,
    getIncomeTypeText: jest.fn((value) => value),
    getMonthRange: jest.fn(() => ({ label: '2026年06月', monthStr: '2026-06', start: '2026-06-01', end: '2026-06-30' }))
  }))
  jest.doMock('../../miniprogram/utils/error-handler', () => ({ handleCloudError: jest.fn() }))

  require('../../miniprogram/pages/income/index')
  return pageInstance
}

describe('income list stored value display', () => {
  afterAll(() => {
    global.Page = originalPage
    global.getApp = originalGetApp
  })

  test('loadData uses getIncomeDisplayType for item label but keeps filtering by raw type', async () => {
    const page = loadIncomeListPage()
    const storedRechargeIncome = {
      _id: 'income-1',
      type: 'other',
      categoryLabel: '储值充值',
      settlementMode: 'stored_value_recharge',
      amount: 1000,
      date: '2026-06-21'
    }
    const diningIncome = { _id: 'income-2', type: 'dining', amount: 300, date: '2026-06-21' }
    mockQueryPage.mockResolvedValue({ data: [storedRechargeIncome, diningIncome], hasMore: false })
    mockQueryAll.mockResolvedValue({ data: [storedRechargeIncome, diningIncome] })

    await page.loadData()
    page.setData({ activeType: 'other' })
    page.applyFilter()

    expect(mockGetIncomeDisplayType).toHaveBeenCalledWith(storedRechargeIncome)
    expect(page.data.incomes[0]).toEqual(expect.objectContaining({ type: 'other', typeText: '储值充值' }))
    expect(page.data.filteredIncomes).toEqual([expect.objectContaining({ _id: 'income-1', type: 'other' })])
  })
})
