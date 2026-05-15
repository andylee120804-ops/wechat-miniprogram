/**
 * Unit tests for cache.js
 * Tests local cache management with TTL
 */

const cache = require('../../miniprogram/utils/cache')

// Access wx mock from setup
global.wx = {
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  console: {
    warn: jest.fn(),
    error: jest.fn()
  }
}

describe('cache.js', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear index for each test
    wx.getStorageSync.mockImplementation((key) => {
      if (key === 'cache__cache_index') {
        return null
      }
      return null
    })
  })

  describe('set', () => {
    test('stores value with expiry', () => {
      cache.set('testKey', { data: 'test' })
      
      expect(wx.setStorageSync).toHaveBeenCalled()
      const calls = wx.setStorageSync.mock.calls
      // Should be called twice: once for the value, once for the index
      expect(calls.length).toBeGreaterThanOrEqual(1)
      
      // Verify the stored value contains expiry
      const storedData = JSON.parse(calls[0][1])
      expect(storedData).toHaveProperty('value')
      expect(storedData).toHaveProperty('expiry')
      expect(storedData.value).toEqual({ data: 'test' })
    })

    test('uses default TTL of 5 minutes', () => {
      const beforeTime = Date.now()
      cache.set('testKey', 'value')
      
      const storedData = JSON.parse(wx.setStorageSync.mock.calls[0][1])
      const ttl = storedData.expiry - beforeTime
      expect(ttl).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100)
      expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000 + 100)
    })

    test('uses custom TTL when provided', () => {
      const beforeTime = Date.now()
      cache.set('testKey', 'value', 60000) // 1 minute
      
      const storedData = JSON.parse(wx.setStorageSync.mock.calls[0][1])
      const ttl = storedData.expiry - beforeTime
      expect(ttl).toBeGreaterThanOrEqual(59000)
      expect(ttl).toBeLessThanOrEqual(61000)
    })

    test('handles errors gracefully', () => {
      wx.setStorageSync.mockImplementationOnce(() => {
        throw new Error('Storage error')
      })
      
      // Should not throw
      expect(() => cache.set('testKey', 'value')).not.toThrow()
    })
  })

  describe('get', () => {
    test('returns cached value when not expired', () => {
      const futureExpiry = Date.now() + 5 * 60 * 1000
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'cache_testKey') {
          return JSON.stringify({ value: { data: 'test' }, expiry: futureExpiry })
        }
        return null
      })
      
      const result = cache.get('testKey')
      expect(result).toEqual({ data: 'test' })
    })

    test('returns null when key not found', () => {
      wx.getStorageSync.mockReturnValue(null)
      
      const result = cache.get('nonExistent')
      expect(result).toBeNull()
    })

    test('removes expired entry and returns null', () => {
      const pastExpiry = Date.now() - 1000
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'cache_testKey') {
          return JSON.stringify({ value: { data: 'test' }, expiry: pastExpiry })
        }
        return null
      })
      
      const result = cache.get('testKey')
      expect(result).toBeNull()
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_testKey')
    })

    test('handles corrupted JSON gracefully', () => {
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'cache_testKey') {
          return 'not valid json'
        }
        return null
      })
      
      const result = cache.get('testKey')
      expect(result).toBeNull()
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_testKey')
    })

    test('handles storage errors gracefully', () => {
      wx.getStorageSync.mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      const result = cache.get('testKey')
      expect(result).toBeNull()
    })
  })

  describe('remove', () => {
    test('removes cache entry', () => {
      cache.remove('testKey')
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_testKey')
    })

    test('removes from index after removal', () => {
      // First, set up the index
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'cache__cache_index') {
          return JSON.stringify(['testKey', 'otherKey'])
        }
        return null
      })
      
      cache.remove('testKey')
      
      // Should update the index
      const indexUpdateCall = wx.setStorageSync.mock.calls.find(
        call => call[0] === 'cache__cache_index'
      )
      expect(indexUpdateCall).toBeDefined()
      expect(JSON.parse(indexUpdateCall[1])).toEqual(['otherKey'])
    })

    test('handles errors gracefully', () => {
      wx.removeStorageSync.mockImplementationOnce(() => {
        throw new Error('Remove error')
      })
      
      expect(() => cache.remove('testKey')).not.toThrow()
    })
  })

  describe('clear', () => {
    test('clears all cached entries', () => {
      wx.getStorageSync.mockImplementation((key) => {
        if (key === 'cache__cache_index') {
          return JSON.stringify(['key1', 'key2', 'key3'])
        }
        return null
      })
      
      cache.clear()
      
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_key1')
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_key2')
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache_key3')
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache__cache_index')
    })

    test('handles empty index', () => {
      wx.getStorageSync.mockReturnValue(null)
      
      cache.clear()
      
      expect(wx.removeStorageSync).toHaveBeenCalledWith('cache__cache_index')
    })

    test('handles errors during clear gracefully', () => {
      wx.getStorageSync.mockImplementation(() => {
        throw new Error('Read error')
      })
      
      expect(() => cache.clear()).not.toThrow()
    })
  })
})
