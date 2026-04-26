/**
 * helpers.js - Enhanced utility functions for the mini-program
 */

// ==================== Date/Time Formatting ====================

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format date as YYYY-MM-DD HH:mm
 */
function formatDateTime(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${formatDate(d)} ${formatTime(d)}`
}

/**
 * Format time as HH:mm
 */
function formatTime(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Get week range with offset (0 = current week, -1 = last week, etc.)
 * Returns {start, end, label}
 */
function getWeekRange(offset) {
  offset = offset || 0
  const now = new Date()
  const dayOfWeek = now.getDay() || 7 // Sunday = 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek + 1 + offset * 7)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const label = offset === 0 ? '本周' : offset === -1 ? '上周' : offset === 1 ? '下周' : `${offset > 0 ? offset + '周后' : Math.abs(offset) + '周前'}`

  return {
    start: formatDate(monday),
    end: formatDate(sunday),
    label: label
  }
}

/**
 * Get month range with offset (0 = current month, -1 = last month, etc.)
 * Returns {start, end, label, monthStr}
 */
function getMonthRange(offset) {
  offset = offset || 0
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + offset

  const targetDate = new Date(year, month, 1)
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)

  const monthStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
  const label = offset === 0 ? '本月' : offset === -1 ? '上月' : offset === 1 ? '下月' : monthStr

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: label,
    monthStr: monthStr
  }
}

/**
 * Get quarter range with offset (0 = current quarter, -1 = last quarter, etc.)
 * Returns {start, end, label}
 */
function getQuarterRange(offset) {
  offset = offset || 0
  const now = new Date()
  const year = now.getFullYear()
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const targetQuarter = currentQuarter + offset

  const actualYear = year + Math.floor(targetQuarter / 4)
  const actualQuarter = ((targetQuarter % 4) + 4) % 4

  const start = new Date(actualYear, actualQuarter * 3, 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(actualYear, actualQuarter * 3 + 3, 0)
  end.setHours(23, 59, 59, 999)

  const quarterNum = actualQuarter + 1
  const label = offset === 0 ? '本季度' : offset === -1 ? '上季度' : `${actualYear}年Q${quarterNum}`

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: label
  }
}

/**
 * Get year range with offset (0 = current year, -1 = last year, etc.)
 * Returns {start, end, label}
 */
function getYearRange(offset) {
  offset = offset || 0
  const now = new Date()
  const year = now.getFullYear() + offset

  const start = new Date(year, 0, 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(year, 11, 31)
  end.setHours(23, 59, 59, 999)

  const label = offset === 0 ? '今年' : offset === -1 ? '去年' : `${year}年`

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
  return Number(amount).toLocaleString('zh-CN', {
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
    admin: '行政主管',
    purchase: '采购主管',
    chef: '厨师',
    waiter: '服务员'
  }
  return roleMap[role] || role || '未知'
}

/**
 * Get category display name (9 categories)
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
 */
function getRoomName(room) {
  const roomMap = {
    big: '大包厢',
    small: '小包厢'
  }
  return roomMap[room] || room || '未知'
}

// ==================== NEW Enhancements ====================

/**
 * Get greeting based on current hour
 */
function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return '早上好'
  if (hour >= 12 && hour < 18) return '下午好'
  return '晚上好'
}

/**
 * Format relative time (e.g. "刚刚", "5分钟前", "2小时前", "昨天", "3天前")
 */
function formatRelativeTime(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays === 1) return '昨天'
  if (diffDays < 30) return `${diffDays}天前`

  // Beyond 30 days, return formatted date
  return formatDate(d)
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

  const d = clockInTime instanceof Date ? clockInTime : new Date(clockInTime)
  if (isNaN(d.getTime())) return false

  const [thresholdHours, thresholdMinutes] = threshold.split(':').map(Number)
  const clockInMinutes = d.getHours() * 60 + d.getMinutes()
  const thresholdTotalMinutes = thresholdHours * 60 + thresholdMinutes

  return clockInMinutes > thresholdTotalMinutes
}

// ==================== Exports ====================

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  getWeekRange,
  getMonthRange,
  getQuarterRange,
  getYearRange,
  formatAmount,
  getRoleName,
  getCategoryName,
  getIncomeTypeText,
  getReservationStatusText,
  getExpenseCategoryName,
  getRoomName,
  getGreeting,
  formatRelativeTime,
  calcWorkDuration,
  isLate
}
