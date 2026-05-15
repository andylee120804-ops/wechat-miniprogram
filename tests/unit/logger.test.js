/**
 * Unit tests for logger.js
 */

// Create mock before requiring logger
const dbMock = {
  collection: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ data: [] }),
  add: jest.fn().mockResolvedValue({ _id: 'log-id' })
}

const wxMock = {
  cloud: {
    database: jest.fn(() => dbMock)
  },
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(() => '[]')
}

const mockApp = {
  globalData: {
    userInfo: { role: 'admin', name: 'Test Admin' }
  }
}

global.wx = wxMock
global.getApp = jest.fn(() => mockApp)

const logger = require('../../miniprogram/utils/logger')

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    wxMock.getStorageSync.mockReturnValue('[]')
  })

  describe('LOG_TYPES', () => {
    it('should define income related types', () => {
      expect(logger.LOG_TYPES).toHaveProperty('INCOME_CREATE')
      expect(logger.LOG_TYPES).toHaveProperty('INCOME_UPDATE')
      expect(logger.LOG_TYPES).toHaveProperty('INCOME_DELETE')
    })

    it('should define purchase related types', () => {
      expect(logger.LOG_TYPES).toHaveProperty('PURCHASE_CREATE')
      expect(logger.LOG_TYPES).toHaveProperty('PURCHASE_UPDATE')
      expect(logger.LOG_TYPES).toHaveProperty('PURCHASE_DELETE')
    })

    it('should define auth types', () => {
      expect(logger.LOG_TYPES).toHaveProperty('LOGIN')
      expect(logger.LOG_TYPES).toHaveProperty('LOGOUT')
    })
  })

  describe('LOG_TYPE_NAMES', () => {
    it('should have Chinese names for income types', () => {
      expect(logger.LOG_TYPE_NAMES['INCOME_CREATE']).toBe('创建收入')
      expect(logger.LOG_TYPE_NAMES['INCOME_UPDATE']).toBe('更新收入')
      expect(logger.LOG_TYPE_NAMES['INCOME_DELETE']).toBe('删除收入')
    })

    it('should have Chinese names for purchase types', () => {
      expect(logger.LOG_TYPE_NAMES['PURCHASE_CREATE']).toBe('创建采购')
    })

    it('should have Chinese names for auth types', () => {
      expect(logger.LOG_TYPE_NAMES['LOGIN']).toBe('登录')
      expect(logger.LOG_TYPE_NAMES['LOGOUT']).toBe('登出')
    })
  })

  describe('log function', () => {
    it('should call setStorageSync', () => {
      logger.log('LOGIN', 'User logged in')
      expect(wxMock.setStorageSync).toHaveBeenCalled()
    })

    it('should persist important operations', () => {
      logger.log('INCOME_CREATE', 'New income added')
      expect(dbMock.collection).toHaveBeenCalledWith('operation_log')
      expect(dbMock.add).toHaveBeenCalled()
    })

    it('should not persist LOGIN/LOGOUT', () => {
      logger.log('LOGIN', 'test')
      expect(dbMock.add).not.toHaveBeenCalled()
    })

    it('should call setStorageSync with array as second argument', () => {
      logger.log('LOGIN', 'test')
      expect(wxMock.setStorageSync).toHaveBeenCalledWith('app_logs', expect.any(Array))
    })
  })
})
