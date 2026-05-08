/**
 * notify.js - Notification and reminder manager
 * Manages unread notification counts and tab bar badges,
 * plus checks for upcoming reservations.
 */

const { formatDate, formatTime } = require('./helpers')
const { COLLECTIONS } = require('./db')

const UNREAD_COUNT_KEY = 'unreadCount'
const TAB_NOTIFICATION_INDEX = 4

/**
 * Get the current unread notification count from local storage.
 * @returns {number} Unread count (0 if none)
 */
function getUnreadCount() {
  try {
    const count = wx.getStorageSync(UNREAD_COUNT_KEY)
    if (typeof count === 'number' && count > 0) {
      return count
    }
  } catch (e) {
    console.warn('[Notify] Failed to get unread count:', e)
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
        index: TAB_NOTIFICATION_INDEX,
        text: String(count)
      }).catch(err => {
        console.warn('[Notify] Failed to set tab bar badge:', err)
      })
    } else {
      wx.removeStorageSync(UNREAD_COUNT_KEY)
      wx.removeTabBarBadge({
        index: TAB_NOTIFICATION_INDEX
      }).catch(err => {
        console.warn('[Notify] Failed to remove tab bar badge:', err)
      })
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
      index: TAB_NOTIFICATION_INDEX
    }).catch(err => {
      console.warn('[Notify] Failed to remove tab bar badge on clear:', err)
    })
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
  const current = getUnreadCount()
  setUnreadCount(current + delta)
}

/**
 * Check for upcoming reservations within the next 2 hours today.
 * Queries the cloud database for today's reservations that have
 * a start time within the next 2 hours and are not cancelled.
 * @returns {Promise<Array>} Array of upcoming reservation objects
 */
async function checkUpcomingReservations() {
  try {
    const db = wx.cloud.database()
    const now = new Date()
    const todayStr = formatDate(now)
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const twoHoursStr = formatTime(twoHoursLater)
    const nowStr = formatTime(now)

    const res = await db.collection(COLLECTIONS.RESERVATION)
      .where({
        date: todayStr,
        time: db.command.gte(nowStr).and(db.command.lte(twoHoursStr)),
        status: 'confirmed'
      })
      .orderBy('time', 'asc')
      .limit(20)
      .get()
    return res.data || []
  } catch (err) {
    console.error('[Notify] Failed to check upcoming reservations:', err)
    return []
  }
}

module.exports = {
  getUnreadCount: getUnreadCount,
  setUnreadCount: setUnreadCount,
  clearUnreadCount: clearUnreadCount,
  incrementUnread: incrementUnread,
  checkUpcomingReservations: checkUpcomingReservations
}
