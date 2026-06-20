/**
 * helpers.js - Enhanced utility functions for the mini-program
 */

// ==================== Date/Time Formatting ====================

/**
 * China Standard Time offset in hours (UTC+8).
 * Used throughout the app to ensure consistent date display regardless
 * of the user's device timezone — critical for a Chinese business app
 * where reservation dates must align with the venue's local calendar.
 */
var CST_HOURS = 8

/**
 * Extract date/time parts in China Standard Time (UTC+8).
 * Works by shifting the UTC timestamp forward by CST_HOURS, then
 * reading UTC methods so the result is independent of device timezone.
 *
 * @param {Date|string|number} date - Input date value
 * @returns {Object|null} { year, month, day, hours, minutes } or null if invalid
 */
function getChinaDateParts(date) {
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return null
  var chinaTime = new Date(d.getTime() + CST_HOURS * 3600000)
  return {
    year: chinaTime.getUTCFullYear(),
    month: chinaTime.getUTCMonth() + 1,
    day: chinaTime.getUTCDate(),
    hours: chinaTime.getUTCHours(),
    minutes: chinaTime.getUTCMinutes()
  }
}

/**
 * Format date as YYYY-MM-DD (in China Standard Time).
 * If the input is already a YYYY-MM-DD string, returns it directly.
 */
function formatDate(date) {
  if (!date) return ''
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  var parts = getChinaDateParts(date)
  if (!parts) return ''
  return parts.year + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0')
}

/**
 * Format date as YYYY-MM-DD HH:mm (in China Standard Time).
 */
function formatDateTime(date) {
  if (!date) return ''
  var parts = getChinaDateParts(date)
  if (!parts) return ''
  var dateStr = parts.year + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0')
  var timeStr = String(parts.hours).padStart(2, '0') + ':' + String(parts.minutes).padStart(2, '0')
  return dateStr + ' ' + timeStr
}

/**
 * Format time as HH:mm (in China Standard Time).
 */
function formatTime(date) {
  if (!date) return ''
  var parts = getChinaDateParts(date)
  if (!parts) return ''
  return String(parts.hours).padStart(2, '0') + ':' + String(parts.minutes).padStart(2, '0')
}

/**
 * Get today's date string in China Standard Time (YYYY-MM-DD).
 * Use this instead of formatDate(new Date()) for "today" comparisons
 * to ensure consistent behavior across timezones.
 */
function getChinaToday() {
  var parts = getChinaDateParts(new Date())
  if (!parts) return ''
  return parts.year + '-' + String(parts.month).padStart(2, '0') + '-' + String(parts.day).padStart(2, '0')
}

/**
 * Create a Date object representing midnight in China Standard Time.
 * Use this for database queries and date storage to ensure timezone
 * consistency regardless of where the user is physically located.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {number} [hours=0] - Hour in CST
 * @param {number} [minutes=0] - Minute
 * @param {number} [seconds=0] - Second
 * @returns {Date} Date object at the specified China time
 */
function createChinaDate(dateStr, hours, minutes, seconds) {
  // Use != null (catches both null and undefined) rather than || 0,
  // so explicit 0 values work correctly and the intention is clearer.
  hours = hours != null ? hours : 0
  minutes = minutes != null ? minutes : 0
  seconds = seconds != null ? seconds : 0
  return new Date(dateStr + 'T' +
    String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '+08:00')
}

/**
 * Get week range with offset (0 = current week, -1 = last week, etc.)
 * Returns {start, end, label}
 */
function getWeekRange(offset) {
  offset = offset != null ? offset : 0
  // 使用 CST 当天日期，确保周边界不受设备本地时区影响
  var todayCST = getChinaToday()
  var todayDateCST = createChinaDate(todayCST) // CST 当天 00:00:00
  var dayOfWeek = todayDateCST.getUTCDay() || 7 // Sunday = 7

  // CST 本周一 00:00:00 的时间戳
  var mondayTS = todayDateCST.getTime() - (dayOfWeek - 1) * 86400000 + offset * 7 * 86400000
  var mondayCST = new Date(mondayTS)

  // For current week (offset=0), end date is today (prorate to today)
  // For past weeks, end date is Sunday of that week
  var endCST
  if (offset === 0) {
    endCST = new Date(todayDateCST.getTime() + 86400000 - 1) // CST 当天 23:59:59.999
  } else {
    endCST = new Date(mondayTS + 7 * 86400000 - 1) // CST 周日 23:59:59.999
  }

  var weekInfo = getWeekNumber(mondayCST)
  var weekNum = weekInfo.week
  var year = weekInfo.year
  var label = offset === 0 ? '本周' : offset === -1 ? '上周' : `${year}年第${weekNum}周`

  return {
    start: formatDate(mondayCST),
    end: formatDate(endCST),
    label: label,
    weekNum: weekNum,
    year: year
  }
}

/**
 * Get month range with offset (0 = current month, -1 = last month, etc.)
 * Returns {start, end, label, monthStr}
 */
function getMonthRange(offset) {
  offset = offset != null ? offset : 0
  // 使用 CST 当天日期，确保月边界不受设备本地时区影响
  var todayCST = getChinaToday()
  var parts = todayCST.split('-').map(Number)
  var targetMonth = parts[1] - 1 + offset // zero-based month
  var targetYear = parts[0] + Math.floor(targetMonth / 12)
  targetMonth = ((targetMonth % 12) + 12) % 12

  // CST 目标月第一天 00:00:00
  var startStr = targetYear + '-' + String(targetMonth + 1).padStart(2, '0') + '-01'
  var start = createChinaDate(startStr)

  // For current month (offset=0), end date is today (prorate salary to today)
  // For past months, end date is last day of that month
  var end
  if (offset === 0) {
    end = new Date(createChinaDate(todayCST).getTime() + 86400000 - 1) // CST 当天 23:59:59.999
  } else {
    // next month first day CST 00:00:00, subtract 1ms = last ms of target month
    var nextMonth = targetMonth === 11 ? 0 : targetMonth + 1
    var nextYear = targetMonth === 11 ? targetYear + 1 : targetYear
    var nextMonthStr = nextYear + '-' + String(nextMonth + 1).padStart(2, '0') + '-01'
    var nextMonthStart = createChinaDate(nextMonthStr)
    end = new Date(nextMonthStart.getTime() - 1)
  }

  var monthStr = targetYear + '-' + String(targetMonth + 1).padStart(2, '0')
  var label = targetYear + '年' + (targetMonth + 1) + '月'

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: label,
    monthStr: monthStr
  }
}

/**
 * Get year range with offset (0 = current year, -1 = last year, etc.)
 * Returns {start, end, label}
 */
function getYearRange(offset) {
  offset = offset != null ? offset : 0
  // 使用 CST 当天日期，确保年边界不受设备本地时区影响
  var todayCST = getChinaToday()
  var parts = todayCST.split('-').map(Number)
  var targetYear = parts[0] + offset

  var startStr = targetYear + '-01-01'
  var start = createChinaDate(startStr)

  // For current year, use today as end date (YTD); for past years, use Dec 31
  var end
  if (offset === 0) {
    end = new Date(createChinaDate(todayCST).getTime() + 86400000 - 1) // CST 当天 23:59:59.999
  } else {
    end = new Date(createChinaDate(targetYear + '-12-31').getTime() + 86400000 - 1)
  }

  var label = targetYear + '年'

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: label
  }
}

// ==================== Amount Formatting ====================

/**
 * Format amount with locale zh-CN and 2 decimal places
 */
function formatAmount(amount) {
  if (amount === null || amount === undefined || amount === '') return '0.00'
  var num = Number(amount)
  if (isNaN(num)) return '0.00'
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// ==================== Name Mappings ====================

/**
 * Get role display name
 */
function getRoleName(role) {
  const roleMap = {
    boss: '老板',
    admin: '管理员',
    purchase: '采购主管',
    chef: '厨师',
    waiter: '服务员'
  }
  return roleMap[role] || role || '未知'
}

/**
 * Get category display name (10 categories)
 */
function getCategoryName(category) {
  const categoryMap = {
    meat: '肉类',
    seafood: '海鲜',
    vegetable: '蔬菜',
    fruit: '水果',
    drink: '饮品',
    seasoning: '调味品',
    supplies: '日用品',
    equipment: '设备',
    banquet: '宴会菜价',
    other: '其他'
  }
  return categoryMap[category] || category || '其他'
}

/**
 * Get income type display text (6 types)
 */
function getIncomeTypeText(type) {
  const typeMap = {
    dining: '餐饮',
    chess: '棋牌',
    liquor: '酒水',
    teatime: '茶时',
    service: '服务',
    other: '其他'
  }
  return typeMap[type] || type || '其他'
}

/**
 * Get reservation status display text
 */
function getReservationStatusText(status) {
  if (status === 'cancelled') return '已取消'
  return '正常'
}

/**
 * Get expense category display name (5 categories)
 */
function getExpenseCategoryName(category) {
  const categoryMap = {
    salary: '工资',
    rent: '房租',
    utilities: '水电',
    supplies: '物资',
    other: '其他'
  }
  return categoryMap[category] || category || '其他'
}

/**
 * Get room display name
 * Checks reservationConfig cache first, falls back to hardcoded map
 */
function getRoomName(room) {
  // Try config cache first (synchronous — only populated after loadRooms)
  // Only catch require errors; let any cache logic errors surface for debugging.
  var config = null
  try {
    config = require('./reservationConfig')
  } catch (e) {
    // Module not loadable — fall through to hardcoded map below
  }
  if (config && config._getRoomsCache) {
    var cachedRooms = config._getRoomsCache()
    if (cachedRooms) {
      var found = cachedRooms.find(function(r) { return r.id === room })
      if (found) return found.name
    }
  }

  // Fallback to hardcoded map — covers pre-config scenarios and old room ids
  var roomMap = {
    big: '大包厢',
    small: '小包厢',
    chess: '棋牌室'
  }
  return roomMap[room] || room || '未知'
}

/**
 * Get exclusive type display name
 */
function getExclusiveTypeName(exclusiveType, room) {
  if (!exclusiveType || exclusiveType === 'none') return getRoomName(room)
  const map = { noon: '包场（午）', night: '包场（晚）', full: '包场（全天）' }
  return map[exclusiveType] || '包场'
}

// ==================== ISO Week ====================

/**
 * Get ISO week number for a given date
 * Returns { year, week } where week is 1-53
 */
function getWeekNumber(date) {
  // 先转为 CST 日期，再用纯 UTC 计算 ISO 周数，不受设备本地时区影响
  var parts = getChinaDateParts(date)
  if (!parts) return { year: 0, week: 0 }

  // 用 Date.UTC 构建 CST 对应日期，getUTCDay 返回正确的 CST 星期几
  var dCST = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  var dayOfWeek = dCST.getUTCDay() || 7 // Sunday = 7

  // Thursday of the same week determines the ISO year
  var thursdayDate = new Date(dCST.getTime() + (4 - dayOfWeek) * 86400000)
  var isoYear = thursdayDate.getUTCFullYear()

  // January 4th is always in week 1
  var jan4 = new Date(Date.UTC(isoYear, 0, 4))
  var jan4Day = jan4.getUTCDay() || 7
  var jan4Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000)
  var week = Math.round((thursdayDate.getTime() - jan4Monday.getTime()) / (7 * 86400000)) + 1

  return { year: isoYear, week: week }
}

/**
 * Calculate work duration between clock-in and clock-out
 * Returns "8h 30m" format
 */
function calcWorkDuration(clockIn, clockOut) {
  if (!clockIn || !clockOut) return '--'

  const start = clockIn instanceof Date ? clockIn : new Date(clockIn)
  const end = clockOut instanceof Date ? clockOut : new Date(clockOut)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '--'

  const diffMs = end.getTime() - start.getTime()
  if (diffMs < 0) return '--'

  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

/**
 * Check if clock-in time is late
 * @param {string|Date} clockInTime - The clock-in time
 * @param {string} threshold - Time threshold in HH:mm format, default '09:00'
 * @returns {boolean}
 */
function isLate(clockInTime, threshold) {
  threshold = threshold || '09:00'
  if (!clockInTime) return false

  var parts = getChinaDateParts(clockInTime)
  if (!parts) return false

  var thresholdParts = threshold.split(':').map(Number)
  var thresholdHours = thresholdParts[0]
  var thresholdMinutes = thresholdParts[1]
  var clockInMinutes = parts.hours * 60 + parts.minutes
  var thresholdTotalMinutes = thresholdHours * 60 + thresholdMinutes

  return clockInMinutes > thresholdTotalMinutes
}

/**
 * Get display name for approval status
 * @param {string} status - pending / approved / rejected / reimbursed
 * @returns {string}
 */
function getApprovalStatusName(status) {
  var map = {
    pending: '待审批',
    approved: '已批准',
    rejected: '已拒绝',
    reimbursed: '已报销'
  }
  return map[status] || status || ''
}

/**
 * Get theme color for approval status
 * @param {string} status - pending / approved / rejected / reimbursed
 * @returns {string} hex color
 */
function getApprovalStatusColor(status) {
  var map = {
    pending: '#FBBF24',
    approved: '#4ADE80',
    rejected: '#F87171',
    reimbursed: '#9CA3AF'
  }
  return map[status] || '#9CA3AF'
}

// ==================== Change Tracking ====================

/**
 * 对比新旧数据，生成变更记录
 * @param {Object} oldData - 旧数据
 * @param {Object} newData - 新数据
 * @param {Object} trackedFields - { fieldKey: '中文名' }
 * @param {Object} [amountFields] - { fieldKey: true } 标记为金额的字段
 * @param {Object} [valueMaps] - { fieldKey: { rawValue: '显示值' } } 枚举值映射
 * @returns {Object|null} { changes: { 中文名: { from, to, isAmount } } } 或 null
 */
function buildChanges(oldData, newData, trackedFields, amountFields, valueMaps) {
  var changes = {}
  amountFields = amountFields || {}
  valueMaps = valueMaps || {}
  Object.keys(trackedFields).forEach(function(f) {
    var oldVal = oldData[f] != null ? oldData[f] : ''
    var newVal = newData[f] != null ? newData[f] : ''
    // 应用枚举值映射
    if (valueMaps[f]) {
      oldVal = valueMaps[f][oldVal] || oldVal
      newVal = valueMaps[f][newVal] || newVal
    }
    if (String(oldVal) !== String(newVal)) {
      changes[trackedFields[f]] = { from: oldVal, to: newVal, isAmount: !!amountFields[f] }
    }
  })
  return Object.keys(changes).length > 0 ? { changes: changes } : null
}

// ==================== Exports ====================

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  getChinaToday,
  createChinaDate,
  getChinaDateParts,
  getWeekRange,
  getMonthRange,
  getYearRange,
  getWeekNumber,
  formatAmount,
  getRoleName,
  getCategoryName,
  getIncomeTypeText,
  getReservationStatusText,
  getExpenseCategoryName,
  getRoomName,
  getExclusiveTypeName,
  calcWorkDuration,
  isLate,
  getApprovalStatusName,
  getApprovalStatusColor,
  buildChanges
}
