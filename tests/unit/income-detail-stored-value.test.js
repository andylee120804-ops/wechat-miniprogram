const originalPage = global.Page
const originalGetApp = global.getApp

let pageInstance
let mockDeleteDoc
let mockUpdateDoc
let mockGetDoc
let mockCheckPermission
let mockGetIncomeDisplayType

function capturePage(pageDef) {
  pageInstance = Object.assign({}, pageDef)
  pageInstance.data = Object.assign({}, pageDef.data)
  pageInstance.setData = jest.fn((data) => {
    pageInstance.data = Object.assign({}, pageInstance.data, data)
  })
}

function loadIncomeDetailPage() {
  jest.resetModules()
  pageInstance = null
  mockDeleteDoc = jest.fn(() => Promise.resolve({ deleted: 1 }))
  mockUpdateDoc = jest.fn(() => Promise.resolve({ updated: 1 }))
  mockGetDoc = jest.fn()
  mockCheckPermission = jest.fn(() => true)
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
    checkPermission: mockCheckPermission,
    ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
  }))
  jest.doMock('../../miniprogram/utils/db', () => ({
    getDoc: mockGetDoc,
    deleteDoc: mockDeleteDoc,
    updateDoc: mockUpdateDoc,
    COLLECTIONS: { INCOME: 'income', RESERVATION: 'reservation' }
  }))
  jest.doMock('../../miniprogram/utils/helpers', () => ({
    formatDate: jest.fn((value) => value || '2026-06-21'),
    formatAmount: jest.fn((value) => {
      if (value === null || value === undefined || value === '') return '0.00'
      const amount = Number(value)
      if (Number.isNaN(amount)) return '0.00'
      return amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    }),
    getIncomeDisplayType: mockGetIncomeDisplayType,
    getIncomeTypeText: jest.fn((value) => value),
    getRoomName: jest.fn((value) => value),
    getReservationStatusText: jest.fn((value) => value),
    getExclusiveTypeName: jest.fn((value, room) => room || value)
  }))
  jest.doMock('../../miniprogram/utils/logger', () => ({ log: jest.fn() }))
  jest.doMock('../../miniprogram/utils/error-handler', () => ({ handleCloudError: jest.fn() }))

  require('../../miniprogram/pages/income-detail/index')
  return pageInstance
}

describe('income-detail stored value edit/delete protection', () => {
  afterAll(() => {
    global.Page = originalPage
    global.getApp = originalGetApp
  })

  test.each(['stored_partial', 'stored_value_recharge', 'stored_empty'])('blocks direct edit for %s income', (settlementMode) => {
    const page = loadIncomeDetailPage()
    page.data.id = 'income-1'
    page.data.income = { _id: 'income-1', settlementMode }

    page.onEdit()

    expect(global.wx.navigateTo).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '储值关联收入不可直接编辑', icon: 'none' })
  })

  test.each(['stored_partial', 'stored_value_recharge', 'stored_empty'])('blocks delete modal for %s income', (settlementMode) => {
    const page = loadIncomeDetailPage()
    page.data.income = { _id: 'income-1', settlementMode }

    page.onDelete()

    expect(page.data.showDeleteModal).toBe(false)
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '储值关联收入不可直接删除', icon: 'none' })
  })

  test.each(['stored_partial', 'stored_value_recharge', 'stored_empty'])('blocks confirmed delete for %s income and does not reset reservation hasIncome', async (settlementMode) => {
    const page = loadIncomeDetailPage()
    page.data.id = 'income-1'
    page.data.showDeleteModal = true
    page.data.income = { _id: 'income-1', settlementMode, reservationId: 'res-1', type: 'dining', amount: 300 }

    await page.onConfirmDelete()

    expect(mockDeleteDoc).not.toHaveBeenCalled()
    expect(mockUpdateDoc).not.toHaveBeenCalled()
    expect(page.data.showDeleteModal).toBe(false)
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '储值关联收入不可直接删除', icon: 'none' })
  })

  test('deletes normal reservation income and resets reservation hasIncome', async () => {
    const page = loadIncomeDetailPage()
    page.data.id = 'income-1'
    page.data.income = { _id: 'income-1', settlementMode: 'normal', reservationId: 'res-1', type: 'dining', amount: 300 }

    await page.onConfirmDelete()

    expect(mockDeleteDoc).toHaveBeenCalledWith('income', 'income-1')
    expect(mockUpdateDoc).toHaveBeenCalledWith('reservation', 'res-1', { hasIncome: false })
  })

  test('loadData uses display type helper for stored-value recharge category label', async () => {
    const page = loadIncomeDetailPage()
    page.data.id = 'income-1'
    const storedRechargeIncome = {
      _id: 'income-1',
      type: 'other',
      categoryLabel: '储值充值',
      settlementMode: 'stored_value_recharge',
      amount: 1000,
      date: '2026-06-21'
    }
    mockGetDoc.mockResolvedValue(storedRechargeIncome)

    await page.loadData()

    expect(mockGetIncomeDisplayType).toHaveBeenCalledWith(storedRechargeIncome)
    expect(page.data.income.typeName).toBe('储值充值')
  })

  test('loadData exposes stored-value trace rows for detail rendering', async () => {
    const page = loadIncomeDetailPage()
    page.data.id = 'income-1'
    mockGetDoc.mockResolvedValue({
      _id: 'income-1',
      type: 'dining',
      settlementMode: 'stored_partial',
      amount: 300,
      originalAmount: 1800,
      deductedAmount: 500,
      date: '2026-06-21'
    })

    await page.loadData()

    expect(page.data.income).toEqual(expect.objectContaining({
      settlementMode: 'stored_partial',
      originalAmount: 1800,
      deductedAmount: 500,
      formattedOriginalAmount: '1,800.00',
      formattedDeductedAmount: '500.00',
      hasStoredPartialTrace: true,
      hasOriginalAmountTrace: true,
      hasStoredRechargeTrace: false
    }))
  })
})
