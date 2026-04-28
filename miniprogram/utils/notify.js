/**
 * notify.js - Notification and reminder manager
 * Manages unread notification counts and tab bar badges,
 * plus checks for upcoming reservations.
 */

var UNREAD_COUNT_KEY = 'unreadCount'

/**
 * Get the current unread notification count from local storage.
 * @returns {number} Unread count (0 if none)
 */
function getUnreadCount() {
  try {
    var count = wx.getStorageSync(UNREAD_COUNT_KEY)
    if (typeof count === 'number' && count > 0) {
      return count
    }
  } catch (e) {
    // ignore
  }
  return 0
}

/**
 * Set the unread notification count and update the tab bar badge.
 * Pass 0 to clear the badge.
 * @param {number} count - The new unread count
 */
function setUnreadCount(count) {
  count = count || 0
  try {
    if (count > 0) {
      wx.setStorageSync(UNREAD_COUNT_KEY, count)
      wx.setTabBarBadge({
        index: 4,
        text: String(count)
      }).catch(function() {})
    } else {
      wx.removeStorageSync(UNREAD_COUNT_KEY)
      wx.removeTabBarBadge({
        index: 4
      }).catch(function() {})
    }
  } catch (e) {
    console.error('[Notify] Failed to set unread count:', e)
  }
}

/**
 * Clear the unread count and remove the tab bar badge.
 */
function clearUnreadCount() {
  try {
    wx.removeStorageSync(UNREAD_COUNT_KEY)
    wx.removeTabBarBadge({
      index: 4
    }).catch(function() {})
  } catch (e) {
    console.error('[Notify] Failed to clear unread count:', e)
  }
}

/**
 * Increment unread count by a delta value.
 * @param {number} delta - Amount to add (default 1)
 */
function incrementUnread(delta) {
  delta = delta || 1
  var current = getUnreadCount()
  setUnreadCount(current + delta)
}

/**
 * Check for upcoming reservations within the next 2 hours today.
 * Queries the cloud database for today's reservations that have
 * a start time within the next 2 hours and are not cancelled.
 * @returns {Promise<Array>} Array of upcoming reservation objects
 */
function checkUpcomingReservations() {
  var { COLLECTIONS } = require('./db')
  var db = wx.cloud.database({ env: 'cloud1-d9gwvttcr864f8021' })
  var now = new Date()
  var todayStr = _formatDate(now)
  var twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  var twoHoursStr = _formatTime(twoHoursLater)
  var nowStr = _formatTime(now)

  return db.collection(COLLECTIONS.RESERVATION)
    .where({
      date: todayStr,
      time: db.command.gte(nowStr).and(db.command.lte(twoHoursStr)),
      status: db.command.in(['reserved', 'confirmed'])
    })
    .orderBy('time', 'asc')
    .limit(20)
    .get()
    .then(function(res) {
      return res.data || []
    })
    .catch(function(err) {
      console.error('[Notify] Failed to check upcoming reservations:', err)
      return []
    })
}

/**
 * Internal: format date as YYYY-MM-DD
 */
function _formatDate(d) {
  var year = d.getFullYear()
  var month = String(d.getMonth() + 1).padStart(2, '0')
  var day = String(d.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

/**
 * Internal: format time as HH:mm
 */
function _formatTime(d) {
  var hours = String(d.getHours()).padStart(2, '0')
  var minutes = String(d.getMinutes()).padStart(2, '0')
  return hours + ':' + minutes
}

module.exports = {
  getUnreadCount: getUnreadCount,
  setUnreadCount: setUnreadCount,
  clearUnreadCount: clearUnreadCount,
  incrementUnread: incrementUnread,
  checkUpcomingReservations: checkUpcomingReservations
}
