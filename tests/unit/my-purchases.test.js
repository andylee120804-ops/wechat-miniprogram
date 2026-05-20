/**
 * Unit tests for my-purchases/index.js
 * Tests the My Purchases page functionality including data loading,
 * filtering, formatting, and user interactions.
 */

// ==================== Mocks Setup ====================

const mockNavigateTo = jest.fn()
const mockNavigateBack = jest.fn()
const mockRedirectTo = jest.fn()
const mockShowToast = jest.fn()
const mockHideLoading = jest.fn()
const mockConsoleError = jest.fn()

const wxMock = {
  cloud: { database: jest.fn() },
  navigateTo: mockNavigateTo,
  navigateBack: mockNavigateBack,
  redirectTo: mockRedirectTo,
  showToast: mockShowToast,
  hideLoading: mockHideLoading,
  console: { error: mockConsoleError }
}

global.wx = wxMock

// Mock getApp
const mockGetThemePageData = jest.fn(() => ({}))
const mockGlobalData = {
  userInfo: null,
  statusBarHeight: 44,
  theme: 'default'
}

const mockApp = {
  getThemePageData: mockGetThemePageData,
  globalData: mockGlobalData
}

global.getApp = jest.fn(() => mockApp)

// Mock database module
const mockQueryAll = jest.fn()
const mockCOLLECTIONS = {
  PURCHASE: 'purchase',
  STAFF: 'staff',
  RESERVATION: 'reservation',
  INCOME: 'income',
  EXPENSE: 'expense',
  FIXED_EXPENSE: 'fixed_expense',
  CLOCKIN: 'clockin',
  LOG: 'log',
  OPERATION_LOG: 'operation_log',
  ANNOUNCEMENT: 'announcement',
  NOTIFICATION_LOG: 'notification_log',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
  APPROVAL_LOG: 'purchase_approval_log'
}

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  COLLECTIONS: mockCOLLECTIONS,
  getDb: jest.fn(),
  PAGE_SIZE: 20,
  CLOUD_ENV: 'cloud1-d9gwvttcr864f8021'
}))

jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((date) => {
    if (!date) return ''
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }),
  formatAmount: jest.fn((amount) => {
    if (amount === null || amount === undefined || amount === '') return '0.00'
    return Number(amount).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }),
  getCategoryName: jest.fn((category) => {
    const map = {
      meat: '肉类', seafood: '海鲜', vegetable: '蔬菜', fruit: '水果',
      drink: '饮品', seasoning: '调味品', supplies: '日用品',
      equipment: '设备', banquet: ' banquet菜价', other: '其他'
    }
    return map[category] || category || '其他'
  }),
  formatDateTime: jest.fn(),
  formatTime: jest.fn(),
  getWeekRange: jest.fn(),
  getMonthRange: jest.fn(),
  getYearRange: jest.fn(),
  getWeekNumber: jest.fn(),
  getRoleName: jest.fn(),
  getIncomeTypeText: jest.fn(),
  getReservationStatusText: jest.fn(),
  getExpenseCategoryName: jest.fn(),
  getRoomName: jest.fn(),
  getExclusiveTypeName: jest.fn(),
  calcWorkDuration: jest.fn(),
  isLate: jest.fn(),
  getApprovalStatusName: jest.fn(),
  getApprovalStatusColor: jest.fn()
}))

jest.mock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn(),
  ERROR_MESSAGES: {
    '-1': '网络连接失败，请检查网络',
    '-501001': '数据库操作失败',
    '-502001': '云函数调用失败',
    'default': '操作失败，请重试'
  }
}))

// ==================== Test Setup ====================

const helpers = require('../../miniprogram/utils/helpers')
const errorhandler = require('../../miniprogram/utils/error-handler')

let pageInstance = null
const originalPage = global.Page

beforeAll(() => {
  global.Page = jest.fn((pageDef) => {
    pageInstance = pageDef
    pageInstance._setDataCalls = []
    pageInstance.setData = jest.fn((data) => {
      pageInstance._setDataCalls.push(data)
      Object.assign(pageInstance.data, data)
    })
    pageInstance.data = { ...pageInstance.data }
  })
})

afterAll(() => {
  global.Page = originalPage
})

beforeEach(() => {
  jest.clearAllMocks()
  mockNavigateTo.mockClear()
  mockNavigateBack.mockClear()
  mockRedirectTo.mockClear()
  mockShowToast.mockClear()
  mockHideLoading.mockClear()

  mockGetThemePageData.mockReturnValue({})
  mockGlobalData.userInfo = null
  mockGlobalData.statusBarHeight = 44

  delete require.cache[require.resolve('../../miniprogram/pages/my-purchases/index.js')]
  pageInstance = null

  require('../../miniprogram/pages/my-purchases/index.js')
})

// ==================== Test Suites ====================

describe('MyPurchasesPage', () => {
  describe('Page Initialization', () => {
    it('should register a Page with correct initial data', () => {
      expect(pageInstance).not.toBeNull()
      expect(pageInstance.data).toBeDefined()
      expect(pageInstance.data.theme).toEqual({})
      expect(pageInstance.data.statusBarHeight).toBe(44)
      expect(pageInstance.data.loading).toBe(true)
      expect(pageInstance.data.statusCards).toEqual([])
      expect(pageInstance.data.activeStatus).toBe('')
      expect(pageInstance.data.filteredList).toEqual([])
      expect(pageInstance.data.sectionLabel).toBe('')
      expect(pageInstance.data.hasRecords).toBe(false)
    })

    it('should have all required methods', () => {
      expect(typeof pageInstance.onLoad).toBe('function')
      expect(typeof pageInstance.onShow).toBe('function')
      expect(typeof pageInstance.loadPurchases).toBe('function')
      expect(typeof pageInstance.onCardTap).toBe('function')
      expect(typeof pageInstance._formatItem).toBe('function')
      expect(typeof pageInstance.onItemTap).toBe('function')
      expect(typeof pageInstance.onBack).toBe('function')
    })
  })

  describe('onLoad', () => {
    it('should set theme and statusBarHeight from app', () => {
      mockGetThemePageData.mockReturnValue({ primaryColor: '#000' })
      mockGlobalData.statusBarHeight = 50

      pageInstance.onLoad()

      expect(mockGetThemePageData).toHaveBeenCalled()
      expect(pageInstance.setData).toHaveBeenCalledWith({
        theme: { primaryColor: '#000' },
        statusBarHeight: 50
      })
    })

    it('should use default statusBarHeight if not set', () => {
      mockGlobalData.statusBarHeight = null

      pageInstance.onLoad()

      expect(pageInstance.setData).toHaveBeenCalledWith({
        theme: {},
        statusBarHeight: 44
      })
    })
  })

  describe('onShow', () => {
    it('should redirect to login if userInfo is not available', () => {
      mockGlobalData.userInfo = null

      pageInstance.onShow()

      expect(mockRedirectTo).toHaveBeenCalledWith({
        url: '/pages/login/index'
      })
    })

    it('should redirect to login if userInfo._id is not available', () => {
      mockGlobalData.userInfo = { name: 'Test' }

      pageInstance.onShow()

      expect(mockRedirectTo).toHaveBeenCalledWith({
        url: '/pages/login/index'
      })
    })

    it('should call loadPurchases with userId when logged in', () => {
      mockGlobalData.userInfo = { _id: 'user123' }
      pageInstance.loadPurchases = jest.fn()

      pageInstance.onShow()

      expect(pageInstance.loadPurchases).toHaveBeenCalledWith('user123')
    })
  })

  describe('loadPurchases', () => {
    beforeEach(() => {
      pageInstance.data = {
        ...pageInstance.data,
        loading: false,
        statusCards: [],
        filteredList: []
      }
    })

    it('should set loading to true when starting data load', async () => {
      mockGlobalData.userInfo = { _id: 'user123' }
      mockQueryAll.mockResolvedValue({ data: [] })

      await pageInstance.loadPurchases('user123')

      const setDataCalls = pageInstance.setData.mock.calls
      const loadingTrueCall = setDataCalls.find(call => call[0].loading === true)
      expect(loadingTrueCall).toBeDefined()
    })

    it('should query purchase collection with correct params', async () => {
      mockGlobalData.userInfo = { _id: 'user123' }
      mockQueryAll.mockResolvedValue({ data: [] })

      await pageInstance.loadPurchases('user123')

      expect(mockQueryAll).toHaveBeenCalledWith(
        COLLECTIONS.PURCHASE,
        { purchaseBy: 'user123' }
      )
    })

    it('should load and process purchase data correctly', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: 'p1', item: 'Item 1', amount: 100, category: 'meat', date: '2024-01-15', status: 'pending', createdAt: '2024-01-15T10:00:00Z' },
        { _id: 'p2', item: 'Item 2', amount: 200, category: 'seafood', date: '2024-01-16', status: 'approved', createdAt: '2024-01-16T10:00:00Z' },
        { _id: 'p3', item: 'Item 3', amount: 300, category: 'vegetable', date: '2024-01-17', status: 'pending', createdAt: '2024-01-17T10:00:00Z' }
      ]})

      await pageInstance.loadPurchases('user123')

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.loading).toBe(false)
      expect(finalCall.hasRecords).toBe(true)
      expect(finalCall.allList).toHaveLength(3)
      expect(finalCall.statusCards).toHaveLength(4)
      expect(finalCall.filteredList).toHaveLength(3)
    })

    it('should build status cards with correct counts', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', status: 'pending', createdAt: '2024-01-15' },
        { _id: '2', status: 'pending', createdAt: '2024-01-16' },
        { _id: '3', status: 'approved', createdAt: '2024-01-17' },
        { _id: '4', status: 'reimbursed', createdAt: '2024-01-18' },
        { _id: '5', status: 'rejected', createdAt: '2024-01-19' },
        { _id: '6', status: 'pending', createdAt: '2024-01-20' }
      ]})

      await pageInstance.loadPurchases('user123')

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      const cards = finalCall.statusCards
      expect(cards.find(c => c.key === 'pending').count).toBe(3)
      expect(cards.find(c => c.key === 'approved').count).toBe(1)
      expect(cards.find(c => c.key === 'reimbursed').count).toBe(1)
      expect(cards.find(c => c.key === 'rejected').count).toBe(1)
    })

    it('should handle empty purchase list', async () => {
      mockQueryAll.mockResolvedValue({ data: [] })

      await pageInstance.loadPurchases('user123')

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.loading).toBe(false)
      expect(finalCall.hasRecords).toBe(false)
      expect(finalCall.allList).toEqual([])
    })

    it('should handle database error gracefully', async () => {
      const mockError = new Error('Database connection failed')
      mockQueryAll.mockRejectedValue(mockError)

      await pageInstance.loadPurchases('user123')

      const loadingFalseCall = pageInstance.setData.mock.calls.find(call => call[0].loading === false)
      expect(loadingFalseCall).toBeDefined()
      expect(errorhandler.handleCloudError).toHaveBeenCalledWith(mockError, '加载采购记录')
    })

    it('should set correct sectionLabel with total count', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', status: 'pending', createdAt: '2024-01-15' },
        { _id: '2', status: 'approved', createdAt: '2024-01-16' }
      ]})

      await pageInstance.loadPurchases('user123')

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.sectionLabel).toBe('全部 (2)')
    })
  })

  describe('_formatItem', () => {
    it('should format a purchase item correctly with helpers', () => {
      const item = { _id: 'p1', item: 'Test', amount: 1500, category: 'meat', date: '2024-01-15', status: 'pending' }

      const result = pageInstance._formatItem(item)

      expect(result.categoryName).toBeDefined()
      expect(result.formattedAmount).toBeDefined()
      expect(result.formattedDate).toBeDefined()
      expect(result.item).toBe('Test')
      expect(result.amount).toBe(1500)
    })

    it('should spread original item properties', () => {
      const item = { _id: 'p1', customField: 'value' }

      const result = pageInstance._formatItem(item)

      expect(result.customField).toBe('value')
      expect(result._id).toBe('p1')
    })
  })

  describe('onCardTap', () => {
    beforeEach(() => {
      pageInstance.data = {
        ...pageInstance.data,
        activeStatus: '',
        statusCards: [
          { key: 'pending', label: '待审批', color: '#FBBF24', count: 2 },
          { key: 'approved', label: '未付款', color: '#3B82F6', count: 1 },
          { key: 'reimbursed', label: '已完成', color: '#4ADE80', count: 1 },
          { key: 'rejected', label: '已拒绝', color: '#F87171', count: 0 }
        ],
        allList: [
          { _id: '1', status: 'pending' },
          { _id: '2', status: 'pending' },
          { _id: '3', status: 'approved' },
          { _id: '4', status: 'reimbursed' }
        ],
        filteredList: []
      }
    })

    it('should filter by status when tapping a card', () => {
      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'pending' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          activeStatus: 'pending',
          filteredList: expect.arrayContaining([
            expect.objectContaining({ _id: '1', status: 'pending' }),
            expect.objectContaining({ _id: '2', status: 'pending' })
          ])
        })
      )
    })

    it('should reset filter when tapping same card again', () => {
      pageInstance.data.activeStatus = 'pending'

      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'pending' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          activeStatus: '',
          filteredList: expect.objectContaining({ length: 4 }),
          sectionLabel: '全部 (4)'
        })
      )
    })

    it('should reset filter when tapping empty key', () => {
      pageInstance.data.activeStatus = 'pending'

      pageInstance.onCardTap({ currentTarget: { dataset: { key: '' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          activeStatus: ''
        })
      )
    })

    it('should update sectionLabel with card label and count', () => {
      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'approved' } } })

      const setDataCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(setDataCall.sectionLabel).toBe('未付款 (1)')
    })

    it('should use fallback to filteredList when allList is missing', () => {
      delete pageInstance.data.allList
      pageInstance.data.filteredList = [
        { _id: '1', status: 'pending' },
        { _id: '2', status: 'approved' }
      ]

      pageInstance.onCardTap({ currentTarget: { dataset: { key: '' } } })

      const setDataCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(setDataCall.sectionLabel).toBe('全部 (2)')
    })

    it('should handle missing dataset gracefully', () => {
      pageInstance.onCardTap({ currentTarget: {} })

      // Should reset since key will be undefined which equals '' or activeStatus('')
      expect(pageInstance.setData).toHaveBeenCalled()
    })
  })

  describe('onItemTap', () => {
    it('should navigate to purchase detail page with id', () => {
      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'purchase123' } } })

      expect(mockNavigateTo).toHaveBeenCalledWith({
        url: '/pages/purchase-detail/index?id=purchase123'
      })
    })

    it('should handle missing id', () => {
      pageInstance.onItemTap({ currentTarget: { dataset: {} } })

      expect(mockNavigateTo).toHaveBeenCalledWith({
        url: '/pages/purchase-detail/index?id=undefined'
      })
    })
  })

  describe('onBack', () => {
    it('should call wx.navigateBack', () => {
      pageInstance.onBack()
      expect(mockNavigateBack).toHaveBeenCalled()
    })
  })

  describe('Integration Tests', () => {
    it('should complete full flow: load then filter', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', status: 'pending', createdAt: '2024-01-20' },
        { _id: '2', status: 'approved', createdAt: '2024-01-19' },
        { _id: '3', status: 'pending', createdAt: '2024-01-18' }
      ]})

      await pageInstance.loadPurchases('user123')

      expect(pageInstance.data.hasRecords).toBe(true)
      expect(pageInstance.data.allList).toHaveLength(3)

      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'pending' } } })

      expect(pageInstance.data.activeStatus).toBe('pending')
      const filteredSetData = pageInstance.setData.mock.calls.find(c =>
        c[0].activeStatus === 'pending' && c[0].filteredList
      )
      expect(filteredSetData[0].filteredList).toHaveLength(2)
    })

    it('should handle multiple filter toggles', () => {
      pageInstance.data.activeStatus = ''
      pageInstance.data.statusCards = [
        { key: 'pending', label: '待审批' }, { key: 'approved', label: '未付款' }
      ]
      pageInstance.data.allList = [
        { _id: '1', status: 'pending' }, { _id: '2', status: 'approved' }, { _id: '3', status: 'pending' }
      ]

      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'pending' } } })
      expect(pageInstance.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeStatus: 'pending' })
      )

      pageInstance.data.activeStatus = 'pending'
      pageInstance.onCardTap({ currentTarget: { dataset: { key: 'pending' } } })
      expect(pageInstance.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeStatus: '' })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle large amounts in _formatItem', () => {
      const result = pageInstance._formatItem({ amount: 9999999.99 })
      expect(result.amount).toBe(9999999.99)
    })

    it('should handle special characters in item name', () => {
      const result = pageInstance._formatItem({ item: 'Test & "Special"' })
      expect(result.item).toBe('Test & "Special"')
    })

    it('should handle network error in loadPurchases', async () => {
      mockQueryAll.mockRejectedValue({ errCode: -1, message: 'network error' })

      await pageInstance.loadPurchases('user123')

      expect(errorhandler.handleCloudError).toHaveBeenCalled()
    })

    it('should handle permission error in loadPurchases', async () => {
      mockQueryAll.mockRejectedValue({ errCode: '-501001', message: 'permission denied' })

      await pageInstance.loadPurchases('user123')

      expect(errorhandler.handleCloudError).toHaveBeenCalled()
    })
  })
})
