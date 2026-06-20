const mockApp = {
  globalData: {
    statusBarHeight: 44,
    venueName: '听澜轩',
    userInfo: { _id: 'u1' }
  },
  getThemePageData: jest.fn(() => ({}))
}

const COLLECTIONS = {
  RESERVATION: 'reservation',
  INCOME: 'income',
  EXPENSE: 'expense',
  PURCHASE: 'purchase',
  FIXED_EXPENSE: 'fixed_expense',
  ANNOUNCEMENT: 'announcement'
}

let pageInstance
let mockQueryAll
let mockHasPermission
let forbiddenCollection
const originalPage = global.Page

function capturePage(pageDef) {
  pageInstance = pageDef
  pageInstance.data = { ...pageDef.data }
  pageInstance.setData = jest.fn((data) => {
    Object.assign(pageInstance.data, data)
  })
}

function makeItems(count, factory) {
  return Array.from({ length: count }, function(_, index) {
    return factory(index)
  })
}

describe('home page queryAll loading', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    pageInstance = null

    global.getApp = jest.fn(() => mockApp)
    global.Page = jest.fn(capturePage)
    global.wx = {
      showToast: jest.fn(),
      switchTab: jest.fn(),
      navigateTo: jest.fn(),
      stopPullDownRefresh: jest.fn()
    }

    const command = {
      gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'gte-lte', value })) })),
      lte: jest.fn((value) => ({ op: 'lte', value }))
    }
    forbiddenCollection = jest.fn(() => {
      throw new Error('Home loadData must use db.queryAll for list and summary reads')
    })

    const todayReservations = makeItems(125, function(index) {
      return { _id: 'today-' + index, time: index < 75 ? '中午' : '晚上' }
    })
    const tomorrowReservations = makeItems(130, function(index) {
      return { _id: 'tomorrow-' + index, time: '中午' }
    })
    const incomes = makeItems(150, function(index) {
      return { _id: 'income-' + index, amount: 1 }
    })
    const expenses = makeItems(110, function(index) {
      return { _id: 'expense-' + index, amount: 2 }
    })
    const purchases = makeItems(105, function(index) {
      return { _id: 'purchase-' + index, amount: 3, status: 'reimbursed' }
    })
    const fixedExpenses = makeItems(101, function(index) {
      return { _id: 'fixed-' + index, monthlyAmount: 10 }
    })
    const announcements = makeItems(120, function(index) {
      return { _id: 'announcement-' + index, createdAt: '2026-06-20', readBy: [] }
    })

    mockQueryAll = jest.fn((collection) => {
      const responses = {
        reservation: mockQueryAll.mock.calls.filter(call => call[0] === 'reservation').length === 1
          ? todayReservations
          : tomorrowReservations,
        income: incomes,
        expense: expenses,
        purchase: purchases,
        fixed_expense: fixedExpenses,
        announcement: announcements
      }
      return Promise.resolve({ data: responses[collection] || [], total: (responses[collection] || []).length })
    })

    jest.doMock('../../miniprogram/utils/db', () => ({
      queryAll: mockQueryAll,
      getDb: jest.fn(() => ({ command, collection: forbiddenCollection })),
      COLLECTIONS
    }))

    jest.doMock('../../miniprogram/utils/helpers', () => ({
      formatDate: jest.fn((value) => typeof value === 'string' ? value : '2026-06-21'),
      getChinaToday: jest.fn(() => '2026-06-20'),
      createChinaDate: jest.fn((date) => date)
    }))

    mockHasPermission = jest.fn(() => true)
    jest.doMock('../../miniprogram/utils/permission', () => ({
      hasPermission: mockHasPermission,
      ACTIONS: { VIEW: 'view', ADD: 'add', APPROVE: 'approve', REIMBURSE: 'reimburse' }
    }))

    jest.doMock('../../miniprogram/utils/feature-flags', () => ({ AI_ENABLED: false }))

    jest.doMock('../../miniprogram/utils/reservation-change', () => ({
      queryUnreadImportantChanges: jest.fn(() => Promise.resolve([])),
      markChangesRead: jest.fn(),
      getReservationChangeReminderTitle: jest.fn(() => '今天预约')
    }))

    require('../../miniprogram/pages/index/index.js')
    pageInstance.startMarqueeCycle = jest.fn()
    pageInstance.showReservationChangeReminder = jest.fn()
    pageInstance.loadTodoCounts = jest.fn()
  })

  afterAll(() => {
    global.Page = originalPage
  })

  test('uses queryAll for home summary and list collections including more than 100 records', async () => {
    await pageInstance.loadData()

    expect(forbiddenCollection).not.toHaveBeenCalled()
    const collections = mockQueryAll.mock.calls.map(function(call) { return call[0] })
    expect(collections).toEqual(expect.arrayContaining([
      'reservation',
      'income',
      'expense',
      'purchase',
      'fixed_expense',
      'announcement'
    ]))
    expect(collections.filter(function(name) { return name === 'reservation' })).toHaveLength(2)
    expect(pageInstance.data.lunchReservations).toHaveLength(75)
    expect(pageInstance.data.dinnerReservations).toHaveLength(50)
    expect(pageInstance.data.tomorrowReservations).toHaveLength(130)
    expect(pageInstance.data.todayIncome).toBe('150.00')
    expect(pageInstance.data.todayExpense).toBe('535.00')
  })

  test('does not query finance collections when user cannot view income summary', async () => {
    mockHasPermission.mockImplementation((module, action) => {
      if (module === 'income' && action === 'view') return false
      return true
    })

    await pageInstance.loadData()

    const collections = mockQueryAll.mock.calls.map(function(call) { return call[0] })
    expect(collections).toEqual(expect.arrayContaining(['reservation', 'announcement']))
    expect(collections).not.toContain('income')
    expect(collections).not.toContain('expense')
    expect(collections).not.toContain('purchase')
    expect(collections).not.toContain('fixed_expense')
    expect(pageInstance.data.todayIncome).toBe('0.00')
    expect(pageInstance.data.todayExpense).toBe('0.00')
  })

  test('does not mark last load time when loading fails', async () => {
    mockQueryAll.mockImplementationOnce(() => Promise.reject(new Error('network')))

    await pageInstance.loadData()

    expect(pageInstance._lastLoadTime).toBeFalsy()
    expect(pageInstance.data.loading).toBe(false)
  })
})
