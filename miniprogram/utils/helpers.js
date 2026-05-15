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

  const weekInfo = getWeekNumber(monday)
  const weekNum = weekInfo.week
  const year = weekInfo.year
  const label = offset === 0 ? '本周' : offset === -1 ? '上周' : `${year}年第${weekNum}周`

  return {
    start: formatDate(monday),
    end: formatDate(sunday),
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
  const label = `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月`

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
  offset = offset || 0
  const now = new Date()
  const year = now.getFullYear() + offset

  const start = new Date(year, 0, 1)
  start.setHours(0, 0, 0, 0)
  // For current year, use today as end date (YTD); for past years, use Dec 31
  let end
  if (offset === 0) {
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end.setHours(23, 59, 59, 999)
  } else {
    end = new Date(year, 11, 31)
    end.setHours(23, 59, 59, 999)
  }

  const label = `${year}年`

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
 */
function getRoomName(room) {
  const roomMap = {
    big: '大包厢',
    small: '小包厢'
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
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return { year: 0, week: 0 }
  const temp = new Date(d.getTime())
  temp.setHours(0, 0, 0, 0)
  // Thursday of the same week determines the ISO year
  const thursday = new Date(temp.getTime())
  thursday.setDate(temp.getDate() + (4 - (temp.getDay() || 7)))
  const year = thursday.getFullYear()
  // January 4th is always in week 1
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() || 7
  const jan4Monday = new Date(jan4)
  jan4Monday.setDate(jan4.getDate() - jan4Day + 1)
  const week = Math.round((thursday.getTime() - jan4Monday.getTime()) / (7 * 86400000)) + 1
  return { year, week }
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

// ==================== Exports ====================

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
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
  getApprovalStatusColor
}
