const mockShowToast = jest.fn()

const mockApp = {
  globalData: {
    userInfo: { _id: 'user1', name: 'Admin', nickName: 'Admin' },
    statusBarHeight: 44
  },
  getThemePageData: jest.fn(() => ({}))
}

global.wx = {
  getWindowInfo: jest.fn(() => ({ statusBarHeight: 44 })),
  showToast: mockShowToast,
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  navigateBack: jest.fn(),
  switchTab: jest.fn(),
  cloud: {
    callFunction: jest.fn(() => Promise.resolve({ result: { success: true, data: {} } })),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(() => Promise.resolve())
  }
}

global.getApp = jest.fn(() => mockApp)

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: jest.fn(() => Promise.resolve({ data: [] })),
  addDoc: jest.fn(() => Promise.resolve({ _id: 'purchase1' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  getDoc: jest.fn(() => Promise.resolve(null)),
  getDb: jest.fn(() => ({ serverDate: jest.fn(() => new Date()) })),
  COLLECTIONS: {
    PURCHASE: 'purchase',
    SETTINGS: 'settings',
    RESERVATION: 'reservation',
    APPROVAL_LOG: 'purchase_approval_log'
  }
}))

jest.mock('../../miniprogram/utils/logger', () => ({
  log: jest.fn(),
  LOG_TYPES: {
    PURCHASE_CREATE: 'purchase_create',
    PURCHASE_UPDATE: 'purchase_update',
    PURCHASE_DELETE: 'purchase_delete'
  }
}))

jest.mock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn()
}))

jest.mock('../../miniprogram/utils/permission', () => ({
  hasPermission: jest.fn(() => true),
  checkPermission: jest.fn(() => true),
  ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
}))

let pageInstance
const originalPage = global.Page

beforeAll(() => {
  global.Page = jest.fn((pageDef) => {
    pageInstance = pageDef
    pageInstance.data = { ...pageDef.data }
    pageInstance.setData = jest.fn((data) => {
      Object.assign(pageInstance.data, data)
    })
  })
})

afterAll(() => {
  global.Page = originalPage
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
  pageInstance = null
  require('../../miniprogram/pages/purchase-add/index.js')
})

describe('purchase-add amount input', () => {
  test('rejects negative amount input and keeps previous amount', () => {
    pageInstance.data.amount = '12'

    pageInstance.onAmountInput({ detail: { value: '-123.45' } })

    expect(pageInstance.data.amount).toBe('12')
  })

  test('rejects minus sign as first input and keeps amount empty', () => {
    pageInstance.onAmountInput({ detail: { value: '-' } })

    expect(pageInstance.data.amount).toBe('')
  })

  test('blocks submission when amount is negative in state', () => {
    pageInstance.data = {
      ...pageInstance.data,
      date: '2026-06-18',
      category: 'meat',
      item: '牛肉',
      amount: '-1',
      sourceReservationId: ''
    }

    expect(pageInstance.validate()).toBe(false)
    expect(pageInstance.data.errors.amount).toBe('金额必须大于0')
  })
})
