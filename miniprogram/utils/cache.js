/**
 * cache.js - Local cache with TTL (Time-To-Live)
 * Provides a simple key-value cache backed by wx storage
 * with automatic expiration support.
 */

const CACHE_PREFIX = 'cache_'
const CACHE_INDEX_KEY = '_cache_index'

/**
 * Set a cache value with optional TTL.
 * @param {string} key - Cache key
 * @param {*} value - Value to cache (will be JSON-serialized)
 * @param {number} ttlMs - Time-to-live in milliseconds (default 5 minutes)
 */
function set(key, value, ttlMs) {
  ttlMs = ttlMs || 5 * 60 * 1000
  const fullKey = CACHE_PREFIX + key
  const item = {
    value: value,
    expiry: Date.now() + ttlMs
  }

  try {
    wx.setStorageSync(fullKey, JSON.stringify(item))
    _addToIndex(key)
  } catch (e) {
    console.error('[Cache] Failed to set cache for key:', key, e)
  }
}

/**
 * Get a cached value. Returns null if expired or not found.
 * @param {string} key - Cache key
 * @returns {*} The cached value, or null if expired/missing
 */
function get(key) {
  const fullKey = CACHE_PREFIX + key
  try {
    const raw = wx.getStorageSync(fullKey)
    if (!raw) return null

    const item = JSON.parse(raw)

    // Check expiration
    if (Date.now() > item.expiry) {
      wx.removeStorageSync(fullKey)
      _removeFromIndex(key)
      return null
    }

    return item.value
  } catch (e) {
    console.warn('[Cache] Failed to read cache for key:', key, e)
    // Corrupted data, remove it
    try {
      wx.removeStorageSync(fullKey)
      _removeFromIndex(key)
    } catch (e2) {
      console.warn('[Cache] Failed to remove corrupted cache entry:', key, e2)
    }
    return null
  }
}

/**
 * Remove a specific cache entry.
 * @param {string} key - Cache key
 */
function remove(key) {
  const fullKey = CACHE_PREFIX + key
  try {
    wx.removeStorageSync(fullKey)
    _removeFromIndex(key)
  } catch (e) {
    console.warn('[Cache] Failed to remove cache for key:', key, e)
  }
}

/**
 * Clear all app-specific cache entries.
 * Removes every key that was set through this cache module.
 */
function clear() {
  try {
    const index = _getIndex()
    for (let i = 0; i < index.length; i++) {
      const fullKey = CACHE_PREFIX + index[i]
      try {
        wx.removeStorageSync(fullKey)
      } catch (e2) {
        console.warn('[Cache] Failed to remove cache entry during clear:', index[i], e2)
      }
    }
    // Clear the index itself
    try {
      wx.removeStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY)
    } catch (e2) {
      console.warn('[Cache] Failed to clear cache index:', e2)
    }
  } catch (e) {
    console.error('[Cache] Failed to clear cache:', e)
  }
}

/**
 * Internal: add a key to the cache index
 */
function _addToIndex(key) {
  try {
    const index = _getIndex()
    if (!index.includes(key)) {
      const newIndex = [...index, key]
      wx.setStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY, JSON.stringify(newIndex))
    }
  } catch (e) {
    console.warn('[Cache] Failed to add key to index:', key, e)
  }
}

/**
 * Internal: remove a key from the cache index
 */
function _removeFromIndex(key) {
  try {
    const index = _getIndex()
    const pos = index.indexOf(key)
    if (pos !== -1) {
      const newIndex = [...index.slice(0, pos), ...index.slice(pos + 1)]
      wx.setStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY, JSON.stringify(newIndex))
    }
  } catch (e) {
    console.warn('[Cache] Failed to remove key from index:', key, e)
  }
}

/**
 * Internal: get the cache index array
 */
function _getIndex() {
  try {
    const raw = wx.getStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.warn('[Cache] Failed to read cache index:', e)
  }
  return []
}

module.exports = {
  set: set,
  get: get,
  remove: remove,
  clear: clear
}
