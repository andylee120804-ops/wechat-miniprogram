/**
 * Unit tests for permission.js
 * Tests role-based access control
 */

const permission = require('../../miniprogram/utils/permission')

// Mock getApp
const mockApp = {
  globalData: {
    userInfo: null,
    permissions: [],
    statusBarHeight: 20,
    theme: 'default'
  }
}

global.getApp = jest.fn(() => mockApp)

// Mock wx for checkPermission toast
global.wx = {
  showToast: jest.fn(),
  cloud: {
    database: jest.fn()
  }
}

describe('permission.js', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApp.globalData.userInfo = null
    mockApp.globalData.permissions = []
  })

  describe('ACTIONS constant', () => {
    test('exports correct action types', () => {
      expect(permission.ACTIONS.VIEW).toBe('view')
      expect(permission.ACTIONS.ADD).toBe('add')
      expect(permission.ACTIONS.EDIT).toBe('edit')
      expect(permission.ACTIONS.DELETE).toBe('delete')
    })
  })

  describe('hasPermission', () => {
    describe('admin role', () => {
      beforeEach(() => {
        mockApp.globalData.userInfo = { role: 'admin', name: 'Admin' }
      })

      test('has all permissions on all modules', () => {
        expect(permission.hasPermission('income', 'view')).toBe(true)
        expect(permission.hasPermission('income', 'add')).toBe(true)
        expect(permission.hasPermission('purchase', 'edit')).toBe(true)
        expect(permission.hasPermission('reservation', 'delete')).toBe(true)
      })

      test('can access admin-only modules', () => {
        expect(permission.hasPermission('staff', 'view')).toBe(true)
        expect(permission.hasPermission('venueSettings', 'edit')).toBe(true)
        expect(permission.hasPermission('minAmount', 'add')).toBe(true)
      })
    })

    describe('boss role', () => {
      beforeEach(() => {
        mockApp.globalData.userInfo = { role: 'boss', name: 'Boss' }
      })

      test('has all permissions on business modules', () => {
        expect(permission.hasPermission('income', 'view')).toBe(true)
        expect(permission.hasPermission('purchase', 'add')).toBe(true)
        expect(permission.hasPermission('reservation', 'edit')).toBe(true)
        expect(permission.hasPermission('expense', 'delete')).toBe(true)
      })

      test('cannot access admin-only modules', () => {
        expect(permission.hasPermission('staff', 'view')).toBe(false)
        expect(permission.hasPermission('venueSettings', 'edit')).toBe(false)
        expect(permission.hasPermission('minAmount', 'add')).toBe(false)
      })
    })

    describe('other roles with explicit permissions', () => {
      beforeEach(() => {
        mockApp.globalData.userInfo = { role: 'purchase', name: 'Purchaser' }
        mockApp.globalData.permissions = [
          { module: 'purchase', actions: ['view', 'add', 'edit'] },
          { module: 'reservation', actions: ['view', 'add', 'edit'] }
        ]
      })

      test('can access modules with explicit permission', () => {
        expect(permission.hasPermission('purchase', 'view')).toBe(true)
        expect(permission.hasPermission('purchase', 'add')).toBe(true)
        expect(permission.hasPermission('purchase', 'edit')).toBe(true)
      })

      test('cannot access modules without permission', () => {
        expect(permission.hasPermission('income', 'view')).toBe(false)
        expect(permission.hasPermission('staff', 'view')).toBe(false)
      })

      test('cannot access actions without permission', () => {
        expect(permission.hasPermission('purchase', 'delete')).toBe(false)
        expect(permission.hasPermission('reservation', 'delete')).toBe(false)
      })

      test('wildcard (*) grants all actions', () => {
        mockApp.globalData.permissions = [
          { module: 'income', actions: ['*'] }
        ]
        expect(permission.hasPermission('income', 'view')).toBe(true)
        expect(permission.hasPermission('income', 'add')).toBe(true)
        expect(permission.hasPermission('income', 'edit')).toBe(true)
        expect(permission.hasPermission('income', 'delete')).toBe(true)
      })
    })

    describe('edge cases', () => {
      test('returns false when app is not available', () => {
        global.getApp.mockReturnValue(null)
        expect(permission.hasPermission('income', 'view')).toBe(false)
        global.getApp.mockReturnValue(mockApp)
      })

      test('returns false when globalData is missing', () => {
        global.getApp.mockReturnValue({})
        expect(permission.hasPermission('income', 'view')).toBe(false)
        global.getApp.mockReturnValue(mockApp)
      })

      test('returns false when userInfo is missing', () => {
        mockApp.globalData.userInfo = null
        expect(permission.hasPermission('income', 'view')).toBe(false)
      })

      test('returns false when permissions array is empty', () => {
        mockApp.globalData.userInfo = { role: 'chef', name: 'Chef' }
        mockApp.globalData.permissions = []
        expect(permission.hasPermission('income', 'view')).toBe(false)
      })

      test('returns false when module not found in permissions', () => {
        mockApp.globalData.userInfo = { role: 'chef', name: 'Chef' }
        mockApp.globalData.permissions = [
          { module: 'announcement', actions: ['view'] }
        ]
        expect(permission.hasPermission('income', 'view')).toBe(false)
      })

      test('handles exception gracefully', () => {
        global.getApp.mockImplementation(() => {
          throw new Error('Unexpected error')
        })
        expect(permission.hasPermission('income', 'view')).toBe(false)
        global.getApp.mockReturnValue(mockApp)
      })
    })
  })

  describe('checkPermission', () => {
    beforeEach(() => {
      mockApp.globalData.userInfo = { role: 'admin', name: 'Admin' }
      jest.clearAllMocks()
    })

    test('returns true and shows no toast when permission granted', () => {
      const result = permission.checkPermission('income', 'view')
      expect(result).toBe(true)
      expect(global.wx.showToast).not.toHaveBeenCalled()
    })

    test('returns false and shows toast when permission denied', () => {
      mockApp.globalData.userInfo = { role: 'boss', name: 'Boss' }
      const result = permission.checkPermission('staff', 'view')
      expect(result).toBe(false)
      expect(global.wx.showToast).toHaveBeenCalledWith({
        title: '无权限执行此操作',
        icon: 'none',
        duration: 2000
      })
    })

    test('calls custom onDeny callback when provided', () => {
      mockApp.globalData.userInfo = { role: 'boss', name: 'Boss' }
      const mockCallback = jest.fn()
      const result = permission.checkPermission('staff', 'view', mockCallback)
      
      expect(result).toBe(false)
      expect(mockCallback).toHaveBeenCalled()
      expect(global.wx.showToast).not.toHaveBeenCalled()
    })

    test('uses default toast when onDeny is not a function', () => {
      mockApp.globalData.userInfo = { role: 'boss', name: 'Boss' }
      const result = permission.checkPermission('staff', 'view', 'not a function')
      
      expect(result).toBe(false)
      expect(global.wx.showToast).toHaveBeenCalled()
    })
  })
})
