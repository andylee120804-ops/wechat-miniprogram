/**
 * cache.js - Local cache with TTL (Time-To-Live)
 * Provides a simple key-value cache backed by wx storage
 * with automatic expiration support.
 */

// Prefix for all cache keys to avoid conflicts
var CACHE_PREFIX = 'cache_'
// Track all cache keys for the clear() function
var CACHE_INDEX_KEY = '_cache_index'

/**
 * Set a cache value with optional TTL.
 * @param {string} key - Cache key
 * @param {*} value - Value to cache (will be JSON-serialized)
 * @param {number} ttlMs - Time-to-live in milliseconds (default 5 minutes)
 */
function set(key, value, ttlMs) {
  ttlMs = ttlMs || 5 * 60 * 1000
  var fullKey = CACHE_PREFIX + key
  var item = {
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
  var fullKey = CACHE_PREFIX + key
  try {
    var raw = wx.getStorageSync(fullKey)
    if (!raw) return null

    var item = JSON.parse(raw)

    // Check expiration
    if (Date.now() > item.expiry) {
      wx.removeStorageSync(fullKey)
      _removeFromIndex(key)
      return null
    }

    return item.value
  } catch (e) {
    // Corrupted data, remove it
    try {
      wx.removeStorageSync(fullKey)
      _removeFromIndex(key)
    } catch (ignore) {}
    return null
  }
}

/**
 * Remove a specific cache entry.
 * @param {string} key - Cache key
 */
function remove(key) {
  var fullKey = CACHE_PREFIX + key
  try {
    wx.removeStorageSync(fullKey)
    _removeFromIndex(key)
  } catch (e) {
    // ignore
  }
}

/**
 * Clear all app-specific cache entries.
 * Removes every key that was set through this cache module.
 */
function clear() {
  try {
    var index = _getIndex()
    for (var i = 0; i < index.length; i++) {
      var fullKey = CACHE_PREFIX + index[i]
      try {
        wx.removeStorageSync(fullKey)
      } catch (ignore) {}
    }
    // Clear the index itself
    try {
      wx.removeStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY)
    } catch (ignore) {}
  } catch (e) {
    console.error('[Cache] Failed to clear cache:', e)
  }
}

/**
 * Internal: add a key to the cache index
 */
function _addToIndex(key) {
  try {
    var index = _getIndex()
    if (index.indexOf(key) === -1) {
      index.push(key)
      wx.setStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY, JSON.stringify(index))
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Internal: remove a key from the cache index
 */
function _removeFromIndex(key) {
  try {
    var index = _getIndex()
    var pos = index.indexOf(key)
    if (pos !== -1) {
      index.splice(pos, 1)
      wx.setStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY, JSON.stringify(index))
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Internal: get the cache index array
 */
function _getIndex() {
  try {
    var raw = wx.getStorageSync(CACHE_PREFIX + CACHE_INDEX_KEY)
    if (raw) {
      var parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    // ignore
  }
  return []
}

module.exports = {
  set: set,
  get: get,
  remove: remove,
  clear: clear
}
