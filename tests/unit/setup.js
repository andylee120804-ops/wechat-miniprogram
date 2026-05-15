/**
 * Unit test configuration for miniprogram utilities
 * Sets up Jest environment with WeChat API mocks
 */

// Mock WeChat API (wx)
const wxMock = {
  cloud: {
    database: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          count: jest.fn(() => Promise.resolve({ total: 0 })),
          orderBy: jest.fn(() => ({
            skip: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({ data: [] }))
              }))
            }))
          })),
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ data: [] }))
          })),
          get: jest.fn(() => Promise.resolve({ data: [] }))
        })),
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: {} })),
          update: jest.fn(() => Promise.resolve({ updated: 1 })),
          remove: jest.fn(() => Promise.resolve({ removed: 1 }))
        })),
        add: jest.fn(() => Promise.resolve({ _id: 'test-id' })),
        count: jest.fn(() => Promise.resolve({ total: 0 })),
        orderBy: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve({ data: [] }))
            }))
          }))
        }))
      }))
    }))
  },
  showToast: jest.fn(),
  hideLoading: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(() => null),
  removeStorageSync: jest.fn(),
  console: {
    warn: jest.fn(),
    error: jest.fn()
  }
}

// Mock getApp for permission tests
const mockApp = {
  globalData: {
    userInfo: null,
    permissions: [],
    statusBarHeight: 20,
    theme: 'default'
  }
}

global.wx = wxMock
global.getApp = jest.fn(() => mockApp)

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
  mockApp.globalData.userInfo = null
  mockApp.globalData.permissions = []
})
