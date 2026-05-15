/**
 * Unit tests for notify.js
 */

// Mock wx before requiring notify
const wxMock = {
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  setTabBarBadge: jest.fn().mockResolvedValue(undefined),
  removeTabBarBadge: jest.fn().mockResolvedValue(undefined),
  cloud: {
    database: jest.fn()
  }
}
global.wx = wxMock

const notify = require('../../miniprogram/utils/notify')

describe('notify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    wxMock.getStorageSync.mockReturnValue(null)
  })

  describe('getUnreadCount', () => {
    it('should return 0 when no count stored', () => {
      wxMock.getStorageSync.mockReturnValue(null)
      expect(notify.getUnreadCount()).toBe(0)
    })

    it('should return stored count when > 0', () => {
      wxMock.getStorageSync.mockReturnValue(5)
      expect(notify.getUnreadCount()).toBe(5)
    })

    it('should return 0 when count is 0', () => {
      wxMock.getStorageSync.mockReturnValue(0)
      expect(notify.getUnreadCount()).toBe(0)
    })

    it('should return 0 when count is negative', () => {
      wxMock.getStorageSync.mockReturnValue(-1)
      expect(notify.getUnreadCount()).toBe(0)
    })

    it('should handle storage errors gracefully', () => {
      wxMock.getStorageSync.mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(notify.getUnreadCount()).toBe(0)
    })
  })

  describe('setUnreadCount', () => {
    it('should set count and show badge when count > 0', () => {
      notify.setUnreadCount(3)

      expect(wxMock.setStorageSync).toHaveBeenCalledWith('unreadCount', 3)
      expect(wxMock.setTabBarBadge).toHaveBeenCalledWith({
        index: 4,
        text: '3'
      })
    })

    it('should clear badge when count is 0', () => {
      notify.setUnreadCount(0)

      expect(wxMock.removeStorageSync).toHaveBeenCalledWith('unreadCount')
      expect(wxMock.removeTabBarBadge).toHaveBeenCalledWith({
        index: 4
      })
    })

    it('should clear badge when count is null', () => {
      notify.setUnreadCount(null)

      expect(wxMock.removeStorageSync).toHaveBeenCalledWith('unreadCount')
      expect(wxMock.removeTabBarBadge).toHaveBeenCalled()
    })

    it('should convert count to string for badge', () => {
      notify.setUnreadCount(10)

      expect(wxMock.setTabBarBadge).toHaveBeenCalledWith({
        index: 4,
        text: '10'
      })
    })

    it('should handle badge errors gracefully', () => {
      wxMock.setTabBarBadge.mockRejectedValue(new Error('Badge error'))
      expect(() => notify.setUnreadCount(1)).not.toThrow()
    })
  })

  describe('clearUnreadCount', () => {
    it('should clear storage and badge', () => {
      notify.clearUnreadCount()

      expect(wxMock.removeStorageSync).toHaveBeenCalledWith('unreadCount')
      expect(wxMock.removeTabBarBadge).toHaveBeenCalledWith({ index: 4 })
    })

    it('should handle errors gracefully', () => {
      wxMock.removeStorageSync.mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(() => notify.clearUnreadCount()).not.toThrow()
    })
  })

  describe('incrementUnread', () => {
    it('should increment by 1 by default', () => {
      wxMock.getStorageSync.mockReturnValue(5)
      notify.incrementUnread()

      expect(wxMock.setStorageSync).toHaveBeenCalledWith('unreadCount', 6)
    })

    it('should increment by custom delta', () => {
      wxMock.getStorageSync.mockReturnValue(5)
      notify.incrementUnread(3)

      expect(wxMock.setStorageSync).toHaveBeenCalledWith('unreadCount', 8)
    })

    it('should start from 0 when no count exists', () => {
      wxMock.getStorageSync.mockReturnValue(null)
      notify.incrementUnread()

      expect(wxMock.setStorageSync).toHaveBeenCalledWith('unreadCount', 1)
    })
  })

  describe('checkUpcomingReservations', () => {
    it('should query reservations for today', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ data: [] })
      }
      wxMock.cloud.database.mockReturnValue(mockDb)

      const result = await notify.checkUpcomingReservations()

      expect(result).toEqual([])
      expect(mockDb.collection).toHaveBeenCalledWith('reservation')
    })

    it('should handle database errors gracefully', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error('DB error'))
      }
      wxMock.cloud.database.mockReturnValue(mockDb)

      const result = await notify.checkUpcomingReservations()

      expect(result).toEqual([])
    })
  })
})
