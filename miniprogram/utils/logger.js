/**
 * logger.js - Logging utility with extended LOG_TYPES
 */

const { COLLECTIONS } = require('./db')

const LOG_TYPES = {
  // Income related
  INCOME_CREATE: 'INCOME_CREATE',
  INCOME_UPDATE: 'INCOME_UPDATE',
  INCOME_DELETE: 'INCOME_DELETE',

  // Purchase related
  PURCHASE_CREATE: 'PURCHASE_CREATE',
  PURCHASE_UPDATE: 'PURCHASE_UPDATE',
  PURCHASE_DELETE: 'PURCHASE_DELETE',

  // Expense related
  EXPENSE_CREATE: 'EXPENSE_CREATE',
  EXPENSE_UPDATE: 'EXPENSE_UPDATE',
  EXPENSE_DELETE: 'EXPENSE_DELETE',

  // Reservation related
  RESERVATION_CREATE: 'RESERVATION_CREATE',
  RESERVATION_UPDATE: 'RESERVATION_UPDATE',
  RESERVATION_DELETE: 'RESERVATION_DELETE',

  // Attendance related
  ATTENDANCE_CLOCK_IN: 'ATTENDANCE_CLOCK_IN',
  ATTENDANCE_CLOCK_OUT: 'ATTENDANCE_CLOCK_OUT',

  // Announcement related
  ANNOUNCEMENT_CREATE: 'ANNOUNCEMENT_CREATE',
  ANNOUNCEMENT_DELETE: 'ANNOUNCEMENT_DELETE',

  // Staff & permission related
  STAFF_CREATE: 'STAFF_CREATE',
  STAFF_UPDATE: 'STAFF_UPDATE',
  STAFF_DELETE: 'STAFF_DELETE',

  // General
  SEARCH: 'SEARCH',
  EXPORT: 'EXPORT',

  // Auth (not persisted)
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT'
}

const LOG_TYPE_NAMES = {
  INCOME_CREATE: '创建收入',
  INCOME_UPDATE: '更新收入',
  INCOME_DELETE: '删除收入',
  PURCHASE_CREATE: '创建采购',
  PURCHASE_UPDATE: '更新采购',
  PURCHASE_DELETE: '删除采购',
  EXPENSE_CREATE: '创建支出',
  EXPENSE_UPDATE: '更新支出',
  EXPENSE_DELETE: '删除支出',
  RESERVATION_CREATE: '创建预约',
  RESERVATION_UPDATE: '更新预约',
  RESERVATION_DELETE: '删除预约',
  ATTENDANCE_CLOCK_IN: '打卡签到',
  ATTENDANCE_CLOCK_OUT: '打卡签退',
  ANNOUNCEMENT_CREATE: '创建公告',
  ANNOUNCEMENT_DELETE: '删除公告',
  STAFF_CREATE: '新增员工',
  STAFF_UPDATE: '更新员工',
  STAFF_DELETE: '删除员工',
  SEARCH: '搜索',
  EXPORT: '导出',
  LOGIN: '登录',
  LOGOUT: '登出'
}

// Types that are persisted to operation_log (important operations only)
const PERSISTED_TYPES = new Set([
  'INCOME_CREATE', 'INCOME_UPDATE', 'INCOME_DELETE',
  'PURCHASE_CREATE', 'PURCHASE_UPDATE', 'PURCHASE_DELETE',
  'EXPENSE_CREATE', 'EXPENSE_UPDATE', 'EXPENSE_DELETE',
  'RESERVATION_CREATE', 'RESERVATION_UPDATE', 'RESERVATION_DELETE',
  'STAFF_CREATE', 'STAFF_UPDATE', 'STAFF_DELETE',
  'ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_DELETE'
])

const MAX_LOG_ENTRIES = 200
const LOG_RETENTION_DAYS = 30
const STORAGE_KEY = 'app_logs'

/**
 * Add a log entry
 * Only PERSISTED_TYPES are written to cloud operation_log and kept long-term.
 * LOGIN/LOGOUT and minor types are dropped silently.
 */
function log(type, detail, extra) {
  try {
    const app = getApp()
    const userInfo = app && app.globalData && app.globalData.userInfo
    const entry = {
      type: type,
      typeName: LOG_TYPE_NAMES[type] || type,
      detail: detail || '',
      extra: extra || null,
      operator: userInfo ? (userInfo.name || userInfo.nickName || userInfo.role || 'unknown') : 'unknown',
      timestamp: new Date().getTime(),
      timeStr: _formatLogTime(new Date())
    }

    // Only persist important operations (money + permission changes)
    if (PERSISTED_TYPES.has(type)) {
      const db = wx.cloud.database()
      db.collection(COLLECTIONS.OPERATION_LOG).add({ data: entry }).catch(() => {})
    }

    // Local cache keeps all types for debugging, but trimmed to retention period
    const logs = _getLogStorage()
    logs.unshift(entry)
    _trimLogs(logs)
    wx.setStorageSync(STORAGE_KEY, logs)

    console.log(`[Log] ${entry.typeName} - ${entry.detail}`)
  } catch (e) {
    console.error('[Logger] Failed to write log:', e)
  }
}

/**
 * Trim logs to retention period and max entries
 */
function _trimLogs(logs) {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
  // Remove logs older than 30 days
  let i = logs.length - 1
  while (i >= 0 && logs[i].timestamp < cutoff) {
    logs.splice(i, 1)
    i--
  }
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.length = MAX_LOG_ENTRIES
  }
}

/**
 * Get recent logs from cloud (last 30 days, important types only)
 * @param {number} limit - Max number of logs to return
 * @returns {Promise<Array>} Log entries
 */
async function getRecentLogs(limit) {
  limit = limit || 50
  try {
    const db = wx.cloud.database()
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
    const res = await db.collection(COLLECTIONS.OPERATION_LOG)
      .where({
        timestamp: db.command.gte(cutoff)
      })
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()
    return res.data || []
  } catch (e) {
    const logs = _getLogStorage()
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
    return logs.filter(function(entry) {
      return entry.timestamp >= cutoff
    }).slice(0, limit)
  }
}

/**
 * Get logs filtered by type (from cloud, last 30 days)
 * @param {string} type - LOG_TYPE to filter by
 * @param {number} limit - Max number of logs to return
 * @returns {Promise<Array>} Filtered log entries
 */
async function getLogsByType(type, limit) {
  limit = limit || 50
  try {
    const db = wx.cloud.database()
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
    const res = await db.collection(COLLECTIONS.OPERATION_LOG)
      .where({
        type: type,
        timestamp: db.command.gte(cutoff)
      })
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()
    return res.data || []
  } catch (e) {
    const logs = _getLogStorage()
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000
    return logs.filter(function(entry) {
      return entry.type === type && entry.timestamp >= cutoff
    }).slice(0, limit)
  }
}

/**
 * Internal: read logs from storage
 */
function _getLogStorage() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (raw && Array.isArray(raw)) {
      return raw
    }
  } catch (e) {
    // ignore
  }
  return []
}

/**
 * Internal: format time for log display
 */
function _formatLogTime(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

module.exports = {
  LOG_TYPES,
  LOG_TYPE_NAMES,
  log,
  getRecentLogs,
  getLogsByType
}
