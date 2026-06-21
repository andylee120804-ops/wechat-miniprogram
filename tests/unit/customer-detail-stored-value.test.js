const originalPage = global.Page
const originalGetApp = global.getApp

let pageInstance
let mockHasPermission
let mockCallFunction
let mockQueryAll

function capturePage(pageDef) {
  pageInstance = Object.assign({}, pageDef)
  pageInstance.data = Object.assign({}, pageDef.data)
  pageInstance.setData = jest.fn((data) => {
    pageInstance.data = Object.assign({}, pageInstance.data, data)
  })
}

function loadCustomerDetailPage(options) {
  jest.resetModules()
  pageInstance = null

  const canViewCustomer = options && Object.prototype.hasOwnProperty.call(options, 'canViewCustomer') ? options.canViewCustomer : true
  const canAddIncome = options && Object.prototype.hasOwnProperty.call(options, 'canAddIncome') ? options.canAddIncome : true

  mockHasPermission = jest.fn((module, action) => {
    if (module === 'customer' && action === 'view') return canViewCustomer
    if (module === 'income' && action === 'add') return canAddIncome
    return false
  })
  mockCallFunction = jest.fn()
  mockQueryAll = jest.fn(() => Promise.resolve({ data: [] }))

  global.getApp = jest.fn(() => ({
    globalData: { statusBarHeight: 44 },
    getThemePageData: jest.fn(() => ({}))
  }))
  global.Page = jest.fn(capturePage)
  global.wx = {
    cloud: { callFunction: mockCallFunction },
    showToast: jest.fn(),
    navigateBack: jest.fn()
  }

  jest.doMock('../../miniprogram/utils/permission', () => ({
    hasPermission: mockHasPermission,
    ACTIONS: { VIEW: 'view', ADD: 'add' }
  }))
  jest.doMock('../../miniprogram/utils/db', () => ({
    queryAll: mockQueryAll,
    COLLECTIONS: {
      RESERVATION: 'reservation',
      INCOME: 'income',
      STORED_VALUE_TRANSACTION: 'stored_value_transaction'
    }
  }))
  jest.doMock('../../miniprogram/utils/helpers', () => ({
    formatDate: jest.fn((value) => value || ''),
    formatDateTime: jest.fn((value) => value || ''),
    formatAmount: jest.fn((value) => Number(value || 0).toFixed(2))
  }))

  require('../../miniprogram/pages/customer-detail/index')
  return pageInstance
}

describe('customer detail stored-value recharge UI', () => {
  afterAll(() => {
    global.Page = originalPage
    global.getApp = originalGetApp
  })

  test('initializes canRecharge from income add permission during onLoad', () => {
    const page = loadCustomerDetailPage({ canAddIncome: false })

    page.onLoad({ name: encodeURIComponent('张三') })

    expect(page.data.canRecharge).toBe(false)
    expect(mockHasPermission).toHaveBeenCalledWith('income', 'add')
  })

  test('updates canRecharge from income add permission while loading data', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: false })
    page.data.customerName = '张三'
    page.loadStoredValueData = jest.fn(() => Promise.resolve({ account: null, transactions: [] }))

    await page.loadData()

    expect(page.data.canRecharge).toBe(false)
    expect(mockHasPermission).toHaveBeenCalledWith('income', 'add')
  })

  test('blocks opening recharge modal when user lacks income add permission', () => {
    const page = loadCustomerDetailPage({ canAddIncome: false })
    page.data.customerName = '张三'

    page.openRechargeModal()

    expect(page.data.showRechargeModal).toBe(false)
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '无权限', icon: 'none' })
  })

  test('blocks submitting recharge when user lacks income add permission', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: false })
    page.data.customerName = '张三'
    page.data.rechargeAmount = '100'

    await page.submitRecharge()

    expect(mockCallFunction).not.toHaveBeenCalled()
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '无权限', icon: 'none' })
  })

  test('queries stored-value account by explicit, account, then recharge phone', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    page.data.storedValueAccount = { phone: '13811111111' }
    page.data.rechargePhone = '13922222222'
    mockCallFunction.mockResolvedValue({ result: { success: true, data: null } })

    await page.loadStoredValueData('13700000000')
    await page.loadStoredValueData()
    page.data.storedValueAccount = null
    await page.loadStoredValueData()

    expect(mockCallFunction.mock.calls.map((call) => call[0].data.phone)).toEqual([
      '13700000000',
      '13811111111',
      '13922222222'
    ])
  })

  test('keeps payment method label in sync with selected option', () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })

    page.onRechargePaymentMethodChange({ detail: { value: '2' } })

    expect(page.data.rechargePaymentMethod).toBe('cash')
    expect(page.data.rechargePaymentMethodLabel).toBe('现金')
  })

  test('uses cloud function returned transactions and never directly reads stored-value transaction collection', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    mockCallFunction.mockResolvedValue({
      result: {
        success: true,
        data: {
          account: { _id: 'account-1', balance: 100 },
          transactions: [
            { _id: 'tx-1', type: 'recharge', amount: 100, balanceAfter: 100, createTime: '2026-06-21T10:00:00.000Z' }
          ]
        }
      }
    })

    const result = await page.loadStoredValueData()

    expect(mockQueryAll).not.toHaveBeenCalledWith('stored_value_transaction', expect.anything(), expect.anything(), expect.anything())
    expect(result.transactions).toEqual([expect.objectContaining({ _id: 'tx-1', title: '储值充值' })])
  })

  test('does not fall back to direct stored-value transaction reads when cloud response has only account', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    mockCallFunction.mockResolvedValue({
      result: {
        success: true,
        data: {
          account: { _id: 'account-1', balance: 100 },
          transactions: []
        }
      }
    })

    const result = await page.loadStoredValueData()

    expect(mockQueryAll).not.toHaveBeenCalledWith('stored_value_transaction', expect.anything(), expect.anything(), expect.anything())
    expect(result.transactions).toEqual([])
  })

  test('keeps stored-value backend ambiguity message instead of silently showing empty account', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    mockCallFunction.mockResolvedValue({
      result: {
        success: false,
        message: '同名客户存在多个储值账户，请补充手机号'
      }
    })

    await page.loadData()

    expect(page.data.storedValueErrorMessage).toBe('同名客户存在多个储值账户，请补充手机号')
    expect(page.data.storedValueAccount).toBeNull()
    expect(page.data.storedValueTransactions).toEqual([])
  })

  test('shows generic stored-value load failure when cloud function rejects', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    mockCallFunction.mockRejectedValue(new Error('network unavailable'))

    await page.loadData()

    expect(page.data.storedValueErrorMessage).toBe('储值账户加载失败，请重试')
    expect(page.data.storedValueAccount).toBeNull()
    expect(page.data.storedValueTransactions).toEqual([])
  })

  test('clears stored-value error message after successful account load', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    page.data.storedValueErrorMessage = '同名客户存在多个储值账户，请补充手机号'
    mockCallFunction.mockResolvedValue({
      result: {
        success: true,
        data: {
          account: { _id: 'account-1', balance: 100, totalRecharge: 100, totalConsume: 0 },
          transactions: []
        }
      }
    })

    await page.loadData()

    expect(page.data.storedValueErrorMessage).toBe('')
    expect(page.data.storedValueAccount).toEqual(expect.objectContaining({ _id: 'account-1' }))
  })

  test('submits recharge with a non-empty requestId for server idempotency', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    page.data.rechargeAmount = '100'
    page.data.rechargePhone = '13800000000'
    page.loadStoredValueData = jest.fn(() => Promise.resolve({ account: null, transactions: [] }))
    mockCallFunction.mockResolvedValue({ result: { success: true, data: { account: { phone: '13800000000' } } } })

    await page.submitRecharge()

    const rechargeCall = mockCallFunction.mock.calls.find((call) => call[0].data.action === 'recharge')
    expect(rechargeCall[0].data.requestId).toEqual(expect.any(String))
    expect(rechargeCall[0].data.requestId.length).toBeGreaterThan(10)
  })

  test('reloads stored-value account by returned account phone after successful recharge', async () => {
    const page = loadCustomerDetailPage({ canAddIncome: true })
    page.data.customerName = '张三'
    page.data.rechargeAmount = '100'
    page.data.rechargePhone = '13800000000'
    page.loadStoredValueData = jest.fn(() => Promise.resolve({ account: null, transactions: [] }))
    mockCallFunction.mockResolvedValue({
      result: {
        success: true,
        data: {
          account: { phone: '13812345678' }
        }
      }
    })

    await page.submitRecharge()

    expect(page.loadStoredValueData).toHaveBeenCalledWith('13812345678')
  })
})
