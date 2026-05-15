/**
 * Unit test setup - mocks WeChat API globals
 */

// Mock wx global object
global.wx = {
  cloud: {
    database: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ data: [] }),
      add: jest.fn().mockResolvedValue({ _id: 'test-id' }),
      update: jest.fn().mockResolvedValue({ updated: 1 }),
      remove: jest.fn().mockResolvedValue({ removed: 1 }),
      count: jest.fn().mockResolvedValue({ total: 0 }),
      serverDate: jest.fn().mockReturnValue(new Date())
    })
  },
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  showToast: jest.fn(),
  hideLoading: jest.fn(),
  setTabBarBadge: jest.fn().mockResolvedValue(undefined),
  removeTabBarBadge: jest.fn().mockResolvedValue(undefined),
  showModal: jest.fn()
}

// Mock getApp
global.getApp = jest.fn().mockReturnValue({
  globalData: {
    userInfo: null,
    permissions: []
  }
})
