const originalPage = global.Page
const originalGetApp = global.getApp

let pageInstance
let mockCallFunction
let mockQueryAll
let mockAddDoc
let mockUpdateDoc
let mockLog
let mockHandleCloudError

function capturePage(pageDef) {
  pageInstance = Object.assign({}, pageDef)
  pageInstance.data = Object.assign({}, pageDef.data)
  pageInstance.setData = jest.fn((data) => {
    pageInstance.data = Object.assign({}, pageInstance.data, data)
  })
}

function loadIncomeAddPage() {
  jest.resetModules()
  pageInstance = null

  mockCallFunction = jest.fn()
  mockQueryAll = jest.fn(() => Promise.resolve({ data: [] }))
  mockAddDoc = jest.fn(() => Promise.resolve({ _id: 'income-new-id' }))
  mockUpdateDoc = jest.fn(() => Promise.resolve({ updated: 1 }))
  mockLog = jest.fn()
  mockHandleCloudError = jest.fn()

  global.getApp = jest.fn(() => ({
    globalData: { statusBarHeight: 44, userInfo: { _id: 'staff-1', name: '收银员' } },
    getThemePageData: jest.fn(() => ({}))
  }))
  global.Page = jest.fn(capturePage)
  global.wx = {
    cloud: { callFunction: mockCallFunction },
    showToast: jest.fn(),
    navigateBack: jest.fn(),
    switchTab: jest.fn()
  }

  jest.doMock('../../miniprogram/utils/permission', () => ({
    hasPermission: jest.fn(() => true),
    ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
  }))
  jest.doMock('../../miniprogram/utils/db', () => ({
    queryAll: mockQueryAll,
    addDoc: mockAddDoc,
    updateDoc: mockUpdateDoc,
    getDoc: jest.fn(),
    getDb: jest.fn(() => ({
      command: {
        gte: jest.fn(() => ({ and: jest.fn() })),
        lte: jest.fn(),
        in: jest.fn((values) => ({ $in: values }))
      }
    })),
    COLLECTIONS: {
      RESERVATION: 'reservation',
      INCOME: 'income',
      SETTINGS: 'settings'
    }
  }))
  jest.doMock('../../miniprogram/utils/helpers', () => ({
    formatDate: jest.fn((value) => value || '2026-06-21'),
    buildChanges: jest.fn(() => ({}))
  }))
  jest.doMock('../../miniprogram/utils/logger', () => ({ log: mockLog }))
  jest.doMock('../../miniprogram/utils/error-handler', () => ({ handleCloudError: mockHandleCloudError }))

  require('../../miniprogram/pages/income-add/index')
  return pageInstance
}

describe('income-add stored value settlement', () => {
  afterAll(() => {
    global.Page = originalPage
    global.getApp = originalGetApp
  })

  test('loads stored-value accounts for unique reservation customers and maps conflicts by phone-or-name key', async () => {
    const page = loadIncomeAddPage()
    mockCallFunction.mockResolvedValue({
      result: {
        success: true,
        data: [
          { _id: 'account-1', phone: '13800000000', customerName: '张三', balance: 500 },
          { _id: 'account-old', customerKey: 'name:李四', customerName: '李四', balance: 100 },
          { _id: 'account-new', customerKey: 'name:李四', customerName: '李四', balance: 200 }
        ]
      }
    })

    const result = await page.loadStoredValueAccountsForReservations([
      { phone: '13800000000', customerName: '张三' },
      { phone: '13800000000', customerName: '重复' },
      { customerName: '李四' }
    ])

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'storedValue',
      data: {
        action: 'queryAccountsByCustomers',
        customers: [
          { phone: '13800000000', customerName: '张三' },
          { phone: '', customerName: '李四' }
        ]
      }
    })
    expect(result.accountsByKey['13800000000']._id).toBe('account-1')
    expect(result.conflictsByKey['李四']).toBe(true)
  })

  test('computes stored-value preview from selected reservation and amount input', () => {
    const page = loadIncomeAddPage()
    page.data.selectedReservation = { phone: '13800000000', customerName: '张三' }
    page.data.amount = '800'
    page.data.storedValueAccountsByKey = { '13800000000': { _id: 'account-1', balance: 500 } }

    page.updateStoredValuePreview()

    expect(page.data.selectedStoredValueAccount._id).toBe('account-1')
    expect(page.data.storedValuePreview).toEqual({
      balance: 500,
      balanceText: '500.00',
      originalAmount: 800,
      originalAmountText: '800.00',
      deducted: 500,
      deductedText: '500.00',
      incomeAmount: 300,
      incomeAmountText: '300.00'
    })
    expect(page.data.storedValueConflictMessage).toBe('')
  })

  test('uses normal addDoc for no-reservation create instead of stored-value settlement', async () => {
    const page = loadIncomeAddPage()
    page.data.amount = '100'
    page.data.noReservation = true
    page.data.reservationId = ''

    await page.onSubmit()

    expect(mockCallFunction).not.toHaveBeenCalled()
    expect(mockAddDoc).toHaveBeenCalledWith('income', expect.objectContaining({ amount: 100, reservationId: '' }))
  })

  test('uses stored-value settlement for create mode with reservation and avoids normal addDoc', async () => {
    const page = loadIncomeAddPage()
    page.data.amount = '800'
    page.data.reservationId = 'res-1'
    page.data.selectedReservation = { _id: 'res-1', customerName: '张三', phone: '13800000000', guestCount: 4, standard: 200, roomName: '大包厢', date: '2026-06-21' }
    mockCallFunction.mockResolvedValue({ result: { success: true, data: { settlementMode: 'stored_partial', deductedAmount: 500, incomeAmount: 300 } } })

    await page.onSubmit()

    expect(mockAddDoc).not.toHaveBeenCalled()
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'storedValue',
      data: expect.objectContaining({
        action: 'settleIncomeWithStoredValue',
        reservationId: 'res-1',
        amount: 800,
        incomeData: expect.objectContaining({ amount: 800, reservationId: 'res-1' }),
        reservationSnapshot: expect.objectContaining({ _id: 'res-1', customerName: '张三' })
      })
    })
  })

  test('edit mode preserves existing update behavior and does not call storedValue', async () => {
    const page = loadIncomeAddPage()
    page.data.isEdit = true
    page.data.id = 'income-1'
    page.data.amount = '800'
    page.data.reservationId = 'res-1'
    page.data.selectedReservation = { _id: 'res-1', customerName: '张三', date: '2026-06-21' }

    await page.onSubmit()

    expect(mockCallFunction).not.toHaveBeenCalled()
    expect(mockUpdateDoc).toHaveBeenCalledWith('income', 'income-1', expect.objectContaining({ amount: 800 }))
  })
})
