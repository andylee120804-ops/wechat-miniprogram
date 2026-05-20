/**
 * Unit tests for admin/expense/index.js
 * Tests Fixed Expense page functionality including data loading,
 * CRUD operations, cycle switching, and date validation.
 */

// ==================== Mocks Setup ====================

const mockNavigateBack = jest.fn()
const mockShowToast = jest.fn()
const mockHideLoading = jest.fn()
const mockShowLoading = jest.fn()
const mockShowModal = jest.fn()

global.wx = {
  cloud: { database: jest.fn() },
  navigateBack: mockNavigateBack,
  showToast: mockShowToast,
  hideLoading: mockHideLoading,
  showLoading: mockShowLoading,
  showModal: mockShowModal,
  console: { warn: jest.fn(), error: jest.fn() }
}

// Mock getApp
const mockGetThemePageData = jest.fn(() => ({}))
const mockGlobalData = {
  userInfo: { _id: 'user1', name: 'Admin', nickName: 'Admin' },
  statusBarHeight: 44,
  theme: 'default'
}
const mockApp = {
  getThemePageData: mockGetThemePageData,
  globalData: mockGlobalData
}
global.getApp = jest.fn(() => mockApp)

// Mock COLLECTIONS
const mockCOLLECTIONS = {
  FIXED_EXPENSE: 'fixed_expense',
  PURCHASE: 'purchase',
  STAFF: 'staff',
  RESERVATION: 'reservation',
  INCOME: 'income',
  EXPENSE: 'expense',
  CLOCKIN: 'clockin',
  LOG: 'log',
  OPERATION_LOG: 'operation_log',
  ANNOUNCEMENT: 'announcement',
  NOTIFICATION_LOG: 'notification_log',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
  APPROVAL_LOG: 'purchase_approval_log'
}

// Mock db module
const mockQueryAll = jest.fn()
const mockAddDoc = jest.fn()
const mockUpdateDoc = jest.fn()
const mockGetDb = jest.fn(() => ({
  serverDate: jest.fn(() => new Date('2026-01-01T00:00:00Z'))
}))

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  getDb: mockGetDb,
  COLLECTIONS: mockCOLLECTIONS,
  PAGE_SIZE: 20,
  CLOUD_ENV: 'cloud1-d9gwvttcr864f8021'
}))

// Mock helpers
jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((date) => {
    if (!date) return ''
    if (date instanceof Date && isNaN(date.getTime())) return ''
    if (typeof date === 'string') return date
    const d = new Date(date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }),
  formatAmount: jest.fn((amount) => {
    if (amount === null || amount === undefined || amount === '') return '0.00'
    return Number(amount).toFixed(2)
  })
}))

// Mock logger
const mockLog = jest.fn()
jest.mock('../../miniprogram/utils/logger', () => ({
  log: mockLog,
  LOG_TYPES: {
    EXPENSE_CREATE: 'expense_create',
    EXPENSE_UPDATE: 'expense_update',
    EXPENSE_DELETE: 'expense_delete',
    PURCHASE_CREATE: 'purchase_create',
    PURCHASE_UPDATE: 'purchase_update',
    PURCHASE_DELETE: 'purchase_delete'
  }
}))

// Mock error-handler
jest.mock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn(),
  ERROR_MESSAGES: {
    '-1': '网络连接失败',
    default: '操作失败，请重试'
  }
}))

// Mock validators
const mockValidateAmount = jest.fn()
jest.mock('../../miniprogram/utils/validators', () => ({
  validateAmount: mockValidateAmount
}))

// Mock permission
jest.mock('../../miniprogram/utils/permission', () => ({
  hasPermission: jest.fn(() => true),
  checkPermission: jest.fn(() => true),
  ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
}))

// ==================== Test Setup ====================

let pageInstance = null
const originalPage = global.Page

beforeAll(() => {
  global.Page = jest.fn((pageDef) => {
    pageInstance = Object.assign({}, pageDef)
    pageInstance._setDataCalls = []
    pageInstance.setData = jest.fn((data) => {
      pageInstance._setDataCalls.push(data)
      Object.assign(pageInstance.data, data)
    })
    pageInstance.data = { ...pageDef.data }
  })
})

afterAll(() => {
  global.Page = originalPage
})

beforeEach(() => {
  jest.clearAllMocks()
  mockNavigateBack.mockClear()
  mockShowToast.mockClear()
  mockHideLoading.mockClear()
  mockShowLoading.mockClear()
  mockShowModal.mockClear()
  mockGetThemePageData.mockReturnValue({})
  mockGlobalData.userInfo = { _id: 'user1', name: 'Admin', nickName: 'Admin' }
  mockGlobalData.statusBarHeight = 44

  delete require.cache[require.resolve('../../miniprogram/pages/admin/expense/index.js')]
  pageInstance = null

  require('../../miniprogram/pages/admin/expense/index.js')
})

// ==================== Test Suites ====================

describe('ExpensePage', () => {
  describe('Page Initialization', () => {
    it('should register a Page with correct initial data', () => {
      expect(pageInstance).not.toBeNull()
      expect(pageInstance.data).toBeDefined()
      expect(pageInstance.data.theme).toEqual({})
      expect(pageInstance.data.statusBarHeight).toBe(44)
      expect(pageInstance.data.loading).toBe(true)
      expect(pageInstance.data.items).toEqual([])
      expect(pageInstance.data.totalMonthly).toBe(0)
      expect(pageInstance.data.totalMonthlyFormatted).toBe('0.00')
      expect(pageInstance.data.showModal).toBe(false)
      expect(pageInstance.data.isEdit).toBe(false)
      expect(pageInstance.data.submitting).toBe(false)
      expect(pageInstance.data.cycle).toBe('monthly')
      expect(pageInstance.data.categoryOptions).toBeUndefined()
    })

    it('should have all required methods', () => {
      expect(typeof pageInstance.onShow).toBe('function')
      expect(typeof pageInstance.loadData).toBe('function')
      expect(typeof pageInstance._updateCycleStyles).toBe('function')
      expect(typeof pageInstance.onAdd).toBe('function')
      expect(typeof pageInstance.onItemTap).toBe('function')
      expect(typeof pageInstance.onNameInput).toBe('function')
      expect(typeof pageInstance.onAmountInput).toBe('function')
      expect(typeof pageInstance.onDescriptionInput).toBe('function')
      expect(typeof pageInstance.onCycleChange).toBe('function')
      expect(typeof pageInstance.calcSplitHint).toBe('function')
      expect(typeof pageInstance.onSave).toBe('function')
      expect(typeof pageInstance.onDelete).toBe('function')
      expect(typeof pageInstance.onModalClose).toBe('function')
      expect(typeof pageInstance.onBack).toBe('function')
      expect(typeof pageInstance.onStartDateChange).toBe('function')
      expect(typeof pageInstance.onEndDateChange).toBe('function')
    })
  })

  describe('onShow', () => {
    let hasPermission

    beforeEach(() => {
      hasPermission = require('../../miniprogram/utils/permission').hasPermission
    })

    it('should redirect if no VIEW permission', () => {
      hasPermission.mockReturnValue(false)

      pageInstance.onShow()

      expect(mockShowToast).toHaveBeenCalledWith({ title: '无权限查看', icon: 'none' })
    })

    it('should set theme and statusBarHeight from app', () => {
      mockGetThemePageData.mockReturnValue({ primaryColor: '#000', accentColor: '#C9A96E' })
      mockGlobalData.statusBarHeight = 50

      pageInstance.onShow()

      expect(mockGetThemePageData).toHaveBeenCalled()
      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: { primaryColor: '#000', accentColor: '#C9A96E' },
          statusBarHeight: 50
        })
      )
    })

    it('should use default statusBarHeight if not set', () => {
      mockGlobalData.statusBarHeight = null

      pageInstance.onShow()

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({ statusBarHeight: 44 })
      )
    })

    it('should call _updateCycleStyles on show', () => {
      pageInstance._updateCycleStyles = jest.fn()

      pageInstance.onShow()

      expect(pageInstance._updateCycleStyles).toHaveBeenCalled()
    })

    it('should call loadData on show', () => {
      pageInstance.loadData = jest.fn()

      pageInstance.onShow()

      expect(pageInstance.loadData).toHaveBeenCalled()
    })
  })

  describe('_updateCycleStyles', () => {
    it('should set monthly active styles when cycle is monthly', () => {
      pageInstance.data.cycle = 'monthly'
      pageInstance.data.theme = { accentColor: '#C9A96E', glassBg: '#1a1a2e', textInverse: '#0F0F1A', textSecondary: '#9A9AB0' }

      pageInstance._updateCycleStyles()

      expect(pageInstance.setData).toHaveBeenCalledWith({
        _monthlyBtnBg: '#C9A96E',
        _monthlyBtnColor: '#0F0F1A',
        _yearlyBtnBg: '#1a1a2e',
        _yearlyBtnColor: '#9A9AB0'
      })
    })

    it('should set yearly active styles when cycle is yearly', () => {
      pageInstance.data.cycle = 'yearly'
      pageInstance.data.theme = { accentColor: '#C9A96E', glassBg: '#1a1a2e', textInverse: '#0F0F1A', textSecondary: '#9A9AB0' }

      pageInstance._updateCycleStyles()

      expect(pageInstance.setData).toHaveBeenCalledWith({
        _monthlyBtnBg: '#1a1a2e',
        _monthlyBtnColor: '#9A9AB0',
        _yearlyBtnBg: '#C9A96E',
        _yearlyBtnColor: '#0F0F1A'
      })
    })

    it('should fallback to defaults when theme properties are missing', () => {
      pageInstance.data.theme = {}
      pageInstance.data.cycle = 'monthly'

      pageInstance._updateCycleStyles()

      expect(pageInstance.setData).toHaveBeenCalledWith({
        _monthlyBtnBg: '#C9A96E',
        _monthlyBtnColor: '#0F0F1A',
        _yearlyBtnBg: 'rgba(255,255,255,0.06)',
        _yearlyBtnColor: '#9A9AB0'
      })
    })
  })

  describe('loadData', () => {
    it('should set loading to true when starting', async () => {
      mockQueryAll.mockResolvedValue({ data: [] })
      jest.spyOn(pageInstance, 'setData')

      await pageInstance.loadData()

      const loadingTrueCall = pageInstance.setData.mock.calls.find(call => call[0].loading === true)
      expect(loadingTrueCall).toBeDefined()
    })

    it('should query FIXED_EXPENSE with active:true', async () => {
      mockQueryAll.mockResolvedValue({ data: [] })

      await pageInstance.loadData()

      expect(mockQueryAll).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        { active: true },
        'createdAt',
        'desc'
      )
    })

    it('should format items and calculate total correctly', async () => {
      const mockItems = [
        { _id: '1', name: '房租', amount: 12000, cycle: 'monthly', monthlyAmount: 12000 },
        { _id: '2', name: '保险', amount: 12000, cycle: 'yearly', monthlyAmount: 1000 }
      ]
      mockQueryAll.mockResolvedValue({ data: mockItems })

      await pageInstance.loadData()

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.loading).toBe(false)
      expect(finalCall.items).toHaveLength(2)
      expect(finalCall.totalMonthly).toBe(13000)
      expect(finalCall.totalMonthlyFormatted).toBe('13000.00')
    })

    it('should set correct cycle colors for yearly vs monthly items', async () => {
      const mockItems = [
        { _id: '1', name: '房租', amount: 5000, cycle: 'monthly', monthlyAmount: 5000 },
        { _id: '2', name: '保险', amount: 12000, cycle: 'yearly', monthlyAmount: 1000 }
      ]
      mockQueryAll.mockResolvedValue({ data: mockItems })

      await pageInstance.loadData()

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      const items = finalCall.items
      expect(items[0]._cycleColor).toBe('#5C5C72')
      expect(items[1]._cycleColor).toBe('#C9A96E')
      expect(items[0]._cycleBg).toBe('rgba(255,255,255,0.06)')
      expect(items[1]._cycleBg).toBe('rgba(201,169,110,0.14)')
    })

    it('should handle empty data gracefully', async () => {
      mockQueryAll.mockResolvedValue({ data: [] })

      await pageInstance.loadData()

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.loading).toBe(false)
      expect(finalCall.items).toEqual([])
      expect(finalCall.totalMonthly).toBe(0)
    })

    it('should handle data being null/undefined', async () => {
      mockQueryAll.mockResolvedValue({ data: null })

      await pageInstance.loadData()

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.loading).toBe(false)
      expect(finalCall.items).toEqual([])
    })

    it('should handle missing amount fields gracefully', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', name: '未知', cycle: 'monthly' }
      ]})

      await pageInstance.loadData()

      const finalCall = pageInstance.setData.mock.calls[pageInstance.setData.mock.calls.length - 1][0]
      expect(finalCall.items[0].monthlyAmount).toBe(0)
    })

    it('should call handleCloudError on failure', async () => {
      const mockError = new Error('Database error')
      mockQueryAll.mockRejectedValue(mockError)
      const errorHandler = require('../../miniprogram/utils/error-handler')

      await pageInstance.loadData()

      const loadingFalseCall = pageInstance.setData.mock.calls.find(call => call[0].loading === false)
      expect(loadingFalseCall).toBeDefined()
      expect(errorHandler.handleCloudError).toHaveBeenCalledWith(mockError, '加载固定成本')
    })
  })

  describe('onAdd', () => {
    it('should reset form fields and show modal', () => {
      pageInstance._updateCycleStyles = jest.fn()

      pageInstance.onAdd()

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          showModal: true,
          isEdit: false,
          editId: '',
          name: '',
          amount: '',
          cycle: 'monthly',
          description: '',
          splitHint: ''
        })
      )
      expect(pageInstance._updateCycleStyles).toHaveBeenCalled()
    })
  })

  describe('onItemTap', () => {
    beforeEach(() => {
      pageInstance.data.items = [
        { _id: 'item1', name: '房租', amount: 5000, cycle: 'monthly', description: '办公室', startDate: '2026-01-01', endDate: '' },
        { _id: 'item2', name: '保险', amount: 12000, cycle: 'yearly', description: '', startDate: '2026-01-01', endDate: '2026-12-31' }
      ]
      pageInstance.calcSplitHint = jest.fn(() => '')
    })

    it('should fill edit form with item data for monthly cycle', () => {
      pageInstance._updateCycleStyles = jest.fn()

      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'item1' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          showModal: true,
          isEdit: true,
          editId: 'item1',
          name: '房租',
          amount: '5000',
          cycle: 'monthly',
          description: '办公室',
          startDate: '2026-01-01',
          endDate: ''
        })
      )
      expect(pageInstance._updateCycleStyles).toHaveBeenCalled()
    })

    it('should fill edit form for yearly cycle item', () => {
      pageInstance._updateCycleStyles = jest.fn()

      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'item2' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({
          isEdit: true,
          editId: 'item2',
          name: '保险',
          amount: '12000',
          cycle: 'yearly',
          endDate: '2026-12-31'
        })
      )
    })

    it('should return early if item not found', () => {
      pageInstance.setData.mockClear()

      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'nonexistent' } } })

      expect(pageInstance.setData).not.toHaveBeenCalled()
    })

    it('should call calcSplitHint with amount and cycle', () => {
      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'item1' } } })

      expect(pageInstance.calcSplitHint).toHaveBeenCalledWith('5000', 'monthly')
    })

    it('should handle item with null amount', () => {
      pageInstance.data.items = [
        { _id: 'item3', name: '免费项目', amount: null, cycle: 'monthly' }
      ]

      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'item3' } } })

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '' })
      )
    })
  })

  describe('Input Handlers', () => {
    it('onNameInput should set name from event', () => {
      pageInstance.onNameInput({ detail: { value: '新成本' } })
      expect(pageInstance.data.name).toBe('新成本')
    })

    it('onDescriptionInput should set description from event', () => {
      pageInstance.onDescriptionInput({ detail: { value: '备注信息' } })
      expect(pageInstance.data.description).toBe('备注信息')
    })

    it('onAmountInput should set amount and update splitHint', () => {
      pageInstance.calcSplitHint = jest.fn(() => 'split-600')

      pageInstance.onAmountInput({ detail: { value: '6000' } })

      expect(pageInstance.data.amount).toBe('6000')
      expect(pageInstance.calcSplitHint).toHaveBeenCalledWith('6000', 'monthly')
    })
  })

  describe('calcSplitHint', () => {
    it('should return monthly split for yearly cycle with amount', () => {
      const result = pageInstance.calcSplitHint('12000', 'yearly')
      expect(result).toBe('每月分摊: ¥1000.00')
    })

    it('should return empty for monthly cycle', () => {
      const result = pageInstance.calcSplitHint('5000', 'monthly')
      expect(result).toBe('')
    })

    it('should return empty for yearly cycle with zero amount', () => {
      const result = pageInstance.calcSplitHint('0', 'yearly')
      expect(result).toBe('')
    })

    it('should return empty when amount is empty string', () => {
      const result = pageInstance.calcSplitHint('', 'yearly')
      expect(result).toBe('')
    })

    it('should return empty when amount is falsy', () => {
      const result = pageInstance.calcSplitHint(null, 'yearly')
      expect(result).toBe('')
    })
  })

  describe('onCycleChange', () => {
    it('should switch to monthly cycle and update styles', () => {
      pageInstance._updateCycleStyles = jest.fn()
      pageInstance.calcSplitHint = jest.fn(() => '')

      pageInstance.onCycleChange({ currentTarget: { dataset: { cycle: 'monthly' } } })

      expect(pageInstance.data.cycle).toBe('monthly')
      expect(pageInstance._updateCycleStyles).toHaveBeenCalled()
    })

    it('should switch to yearly cycle and recalc splitHint', () => {
      pageInstance.data.amount = '12000'
      pageInstance._updateCycleStyles = jest.fn()

      pageInstance.onCycleChange({ currentTarget: { dataset: { cycle: 'yearly' } } })

      expect(pageInstance.data.cycle).toBe('yearly')
      expect(pageInstance.data.splitHint).toBe('每月分摊: ¥1000.00')
    })
  })

  describe('onSave', () => {
    it('should return early if submitting is true (anti-double-submit)', () => {
      pageInstance.data.submitting = true

      pageInstance.onSave()

      expect(mockShowToast).not.toHaveBeenCalled()
      expect(mockAddDoc).not.toHaveBeenCalled()
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('should show toast when name is empty', () => {
      pageInstance.data.name = ''
      pageInstance.data.amount = '100'

      pageInstance.onSave()

      expect(mockShowToast).toHaveBeenCalledWith({ title: '请输入项目名称', icon: 'none' })
    })

    it('should show toast when amount validation fails', () => {
      pageInstance.data.name = '成本1'
      pageInstance.data.amount = ''
      mockValidateAmount.mockReturnValue({ valid: false, message: '金额不能为空' })

      pageInstance.onSave()

      expect(mockShowToast).toHaveBeenCalledWith({ title: '金额不能为空', icon: 'none' })
    })

    it('should show toast when amount is zero or negative', () => {
      pageInstance.data.name = '成本1'
      pageInstance.data.amount = '0'
      mockValidateAmount.mockReturnValue({ valid: true })

      pageInstance.onSave()

      expect(mockShowToast).toHaveBeenCalledWith({ title: '金额必须大于0', icon: 'none' })
    })

    it('should call addDoc for new record', async () => {
      pageInstance.data.name = '新成本'
      pageInstance.data.amount = '5000'
      pageInstance.data.cycle = 'monthly'
      pageInstance.data.isEdit = false
      pageInstance.data.editId = ''
      mockValidateAmount.mockReturnValue({ valid: true })
      mockAddDoc.mockResolvedValue({ _id: 'new-id' })

      pageInstance.onSave()

      // Wait for promise chain
      await new Promise(setImmediate)

      expect(pageInstance.setData).toHaveBeenCalledWith(
        expect.objectContaining({ submitting: true })
      )
      expect(mockAddDoc).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        expect.objectContaining({
          name: '新成本',
          amount: 5000,
          cycle: 'monthly',
          monthlyAmount: 5000,
          active: true
        })
      )
      expect(mockLog).toHaveBeenCalledWith(
        'expense_create',
        expect.stringContaining('新增固定成本')
      )
      expect(mockShowToast).toHaveBeenCalledWith({ title: '添加成功', icon: 'success' })
      expect(pageInstance.data.showModal).toBe(false)
      expect(pageInstance.data.submitting).toBe(false)
    })

    it('should call updateDoc for existing record', async () => {
      pageInstance.data.name = '已存在成本'
      pageInstance.data.amount = '12000'
      pageInstance.data.cycle = 'yearly'
      pageInstance.data.isEdit = true
      pageInstance.data.editId = 'edit-id-123'
      mockValidateAmount.mockReturnValue({ valid: true })
      mockUpdateDoc.mockResolvedValue({ updated: 1 })

      pageInstance.onSave()

      await new Promise(setImmediate)

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        'edit-id-123',
        expect.objectContaining({
          name: '已存在成本',
          amount: 12000,
          cycle: 'yearly',
          monthlyAmount: 1000 // 12000 / 12
        })
      )
      expect(mockLog).toHaveBeenCalledWith(
        'expense_update',
        expect.stringContaining('更新固定成本')
      )
      expect(mockShowToast).toHaveBeenCalledWith({ title: '保存成功', icon: 'success' })
    })

    it('should handle error in onSave', async () => {
      const mockError = new Error('Save failed')
      pageInstance.data.name = '失败成本'
      pageInstance.data.amount = '100'
      pageInstance.data.cycle = 'monthly'
      pageInstance.data.isEdit = false
      mockValidateAmount.mockReturnValue({ valid: true })
      mockAddDoc.mockRejectedValue(mockError)
      const errorHandler = require('../../miniprogram/utils/error-handler')

      pageInstance.onSave()

      await new Promise(setImmediate)

      expect(errorHandler.handleCloudError).toHaveBeenCalledWith(mockError, '添加固定成本')
      expect(pageInstance.data.submitting).toBe(false)
    })

    it('should set submitting to false after error in onSave', async () => {
      mockAddDoc.mockRejectedValue(new Error('fail'))
      pageInstance.data.name = '测试'
      pageInstance.data.amount = '100'
      pageInstance.data.isEdit = false
      mockValidateAmount.mockReturnValue({ valid: true })

      pageInstance.onSave()

      await new Promise(setImmediate)

      expect(pageInstance.data.submitting).toBe(false)
    })
  })

  describe('onDelete', () => {
    let checkPermission

    beforeEach(() => {
      checkPermission = require('../../miniprogram/utils/permission').checkPermission
      pageInstance.data.name = '待删除项'
      pageInstance.data.editId = 'delete-id'
    })

    it('should show toast if no DELETE permission', () => {
      checkPermission.mockReturnValue(false)

      pageInstance.onDelete()

      expect(mockShowToast).toHaveBeenCalledWith({ title: '无权限删除', icon: 'none' })
      expect(mockShowModal).not.toHaveBeenCalled()
    })

    it('should show modal when user has permission', () => {
      pageInstance.onDelete()

      expect(mockShowModal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '确认删除',
          content: '确定要删除「待删除项」吗？',
          confirmColor: '#F87171'
        })
      )
    })

    it('should call updateDoc with active:false on confirm', async () => {
      mockUpdateDoc.mockResolvedValue({ updated: 1 })
      pageInstance.onDelete()

      // Simulate modal confirm
      const modalCall = mockShowModal.mock.calls[0][0]
      modalCall.success({ confirm: true })

      await new Promise(setImmediate)

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        'delete-id',
        { active: false }
      )
      expect(mockLog).toHaveBeenCalledWith('expense_delete', expect.stringContaining('删除固定成本'))
      expect(mockShowToast).toHaveBeenCalledWith({ title: '已删除', icon: 'success' })
      expect(pageInstance.data.showModal).toBe(false)
    })

    it('should not delete on modal cancel', () => {
      pageInstance.onDelete()

      const modalCall = mockShowModal.mock.calls[0][0]
      modalCall.success({ confirm: false })

      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('should handle delete error', async () => {
      const mockError = new Error('Delete failed')
      mockUpdateDoc.mockRejectedValue(mockError)
      const errorHandler = require('../../miniprogram/utils/error-handler')

      pageInstance.onDelete()

      const modalCall = mockShowModal.mock.calls[0][0]
      modalCall.success({ confirm: true })

      await new Promise(setImmediate)

      expect(errorHandler.handleCloudError).toHaveBeenCalledWith(mockError, '删除固定成本')
    })
  })

  describe('onModalClose', () => {
    it('should set showModal to false', () => {
      pageInstance.data.showModal = true

      pageInstance.onModalClose()

      expect(pageInstance.data.showModal).toBe(false)
    })
  })

  describe('onBack', () => {
    it('should call wx.navigateBack', () => {
      pageInstance.onBack()
      expect(mockNavigateBack).toHaveBeenCalled()
    })
  })

  describe('Date Change Handlers', () => {
    it('onStartDateChange should set startDate when valid', () => {
      pageInstance.data.endDate = '2026-12-31'

      pageInstance.onStartDateChange({ detail: { value: '2026-06-01' } })

      expect(pageInstance.data.startDate).toBe('2026-06-01')
    })

    it('onStartDateChange should show toast when start > end', () => {
      pageInstance.data.endDate = '2026-06-01'

      pageInstance.onStartDateChange({ detail: { value: '2026-12-31' } })

      expect(mockShowToast).toHaveBeenCalledWith({ title: '起始日期不能晚于结束日期', icon: 'none' })
      expect(pageInstance.data.startDate).toBeUndefined()
    })

    it('onStartDateChange should skip date validation when endDate is empty', () => {
      pageInstance.data.endDate = ''

      pageInstance.onStartDateChange({ detail: { value: '2026-06-01' } })

      expect(pageInstance.data.startDate).toBe('2026-06-01')
    })

    it('onEndDateChange should set endDate when valid', () => {
      pageInstance.data.startDate = '2026-01-01'

      pageInstance.onEndDateChange({ detail: { value: '2026-06-30' } })

      expect(pageInstance.data.endDate).toBe('2026-06-30')
    })

    it('onEndDateChange should show toast when end < start', () => {
      pageInstance.data.startDate = '2026-06-01'

      pageInstance.onEndDateChange({ detail: { value: '2026-01-01' } })

      expect(mockShowToast).toHaveBeenCalledWith({ title: '结束日期不能早于起始日期', icon: 'none' })
      expect(pageInstance.data.endDate).toBeUndefined()
    })

    it('onEndDateChange should skip validation when startDate is empty', () => {
      pageInstance.data.startDate = ''

      pageInstance.onEndDateChange({ detail: { value: '2026-06-01' } })

      expect(pageInstance.data.endDate).toBe('2026-06-01')
    })
  })

  describe('Integration Tests', () => {
    it('should complete onShow → loadData cycle', async () => {
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', name: '成本1', amount: 5000, cycle: 'monthly', monthlyAmount: 5000 }
      ]})

      pageInstance.onShow()

      // Wait for async loadData
      await new Promise(setImmediate)

      expect(pageInstance.data.theme).toEqual({})
      expect(pageInstance.data.items).toHaveLength(1)
      expect(pageInstance.data.totalMonthly).toBe(5000)
    })

    it('should complete onAdd → onSave → reload cycle', async () => {
      mockAddDoc.mockResolvedValue({ _id: 'new-id' })
      mockQueryAll.mockResolvedValue({ data: [
        { _id: '1', name: '新成本', amount: 3000, cycle: 'monthly', monthlyAmount: 3000 }
      ]})
      mockValidateAmount.mockReturnValue({ valid: true })

      pageInstance.onAdd()
      pageInstance.data.name = '新成本'
      pageInstance.data.amount = '3000'

      pageInstance.onSave()
      await new Promise(setImmediate)

      expect(mockAddDoc).toHaveBeenCalled()
      expect(pageInstance.data.showModal).toBe(false)

      // Verify loadData was called after save
      expect(mockQueryAll).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        { active: true },
        'createdAt',
        'desc'
      )
    })

    it('should complete edit flow: onItemTap → onSave → update', async () => {
      mockUpdateDoc.mockResolvedValue({ updated: 1 })
      mockValidateAmount.mockReturnValue({ valid: true })

      pageInstance.data.items = [
        { _id: 'edit-item', name: '旧名称', amount: 5000, cycle: 'monthly', monthlyAmount: 5000 }
      ]

      pageInstance.onItemTap({ currentTarget: { dataset: { id: 'edit-item' } } })

      // Modify and save
      pageInstance.data.name = '新名称'
      pageInstance.data.amount = '6000'

      pageInstance.onSave()
      await new Promise(setImmediate)

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        'edit-item',
        expect.objectContaining({
          name: '新名称',
          amount: 6000
        })
      )
      expect(mockLog).toHaveBeenCalledWith('expense_update', expect.stringContaining('新名称'))
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large amounts', async () => {
      pageInstance.data.name = '大额成本'
      pageInstance.data.amount = '9999999.99'
      pageInstance.data.cycle = 'monthly'
      pageInstance.data.isEdit = false
      mockValidateAmount.mockReturnValue({ valid: true })
      mockAddDoc.mockResolvedValue({ _id: 'large-id' })

      pageInstance.onSave()
      await new Promise(setImmediate)

      expect(mockAddDoc).toHaveBeenCalledWith(
        mockCOLLECTIONS.FIXED_EXPENSE,
        expect.objectContaining({ amount: 9999999.99 })
      )
    })

    it('should handle yearly amount division correctly', () => {
      pageInstance.data.amount = '100000'
      pageInstance.data.cycle = 'yearly'

      const hint = pageInstance.calcSplitHint('100000', 'yearly')

      expect(hint).toBe('每月分摊: ¥8333.33')
    })

    it('should handle missing description and dates in onAdd', () => {
      pageInstance.onAdd()

      expect(pageInstance.data.description).toBe('')
      expect(pageInstance.data.endDate).toBe('')
    })
  })
})
