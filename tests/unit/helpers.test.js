/**
 * Unit tests for helpers.js
 */
const helpers = require('../../miniprogram/utils/helpers')

describe('helpers', () => {
  describe('formatDate', () => {
    it('should format Date object to YYYY-MM-DD', () => {
      const date = new Date(2024, 0, 15) // January 15, 2024
      const result = helpers.formatDate(date)
      expect(result).toBe('2024-01-15')
    })

    it('should format date string to YYYY-MM-DD', () => {
      const result = helpers.formatDate('2024-03-20')
      expect(result).toBe('2024-03-20')
    })

    it('should return empty string for null', () => {
      expect(helpers.formatDate(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(helpers.formatDate(undefined)).toBe('')
    })

    it('should return empty string for invalid date', () => {
      expect(helpers.formatDate('invalid')).toBe('')
    })

    it('should pad single digit month and day', () => {
      const date = new Date(2024, 0, 5) // January 5
      const result = helpers.formatDate(date)
      expect(result).toBe('2024-01-05')
    })
  })

  describe('formatTime', () => {
    it('should format time to HH:mm', () => {
      const date = new Date(2024, 0, 1, 9, 30)
      const result = helpers.formatTime(date)
      expect(result).toBe('09:30')
    })

    it('should return empty string for null', () => {
      expect(helpers.formatTime(null)).toBe('')
    })

    it('should pad single digit hours and minutes', () => {
      const date = new Date(2024, 0, 1, 8, 5)
      const result = helpers.formatTime(date)
      expect(result).toBe('08:05')
    })
  })

  describe('formatDateTime', () => {
    it('should format date and time', () => {
      const date = new Date(2024, 5, 15, 14, 30)
      const result = helpers.formatDateTime(date)
      expect(result).toBe('2024-06-15 14:30')
    })

    it('should return empty string for null', () => {
      expect(helpers.formatDateTime(null)).toBe('')
    })
  })

  describe('getWeekRange', () => {
    it('should return current week range', () => {
      const result = helpers.getWeekRange(0)
      expect(result).toHaveProperty('start')
      expect(result).toHaveProperty('end')
      expect(result).toHaveProperty('label')
      expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should return last week range', () => {
      const result = helpers.getWeekRange(-1)
      expect(result.label).toBe('上周')
    })

    it('should return correct week number info', () => {
      const result = helpers.getWeekRange(0)
      expect(result).toHaveProperty('weekNum')
      expect(result).toHaveProperty('year')
      expect(typeof result.weekNum).toBe('number')
      expect(typeof result.year).toBe('number')
    })

    it('should handle offset of 0 as default', () => {
      const result1 = helpers.getWeekRange()
      const result2 = helpers.getWeekRange(0)
      expect(result1.label).toBe(result2.label)
    })
  })

  describe('getMonthRange', () => {
    it('should return current month range', () => {
      const result = helpers.getMonthRange(0)
      expect(result).toHaveProperty('start')
      expect(result).toHaveProperty('end')
      expect(result).toHaveProperty('label')
      expect(result).toHaveProperty('monthStr')
      expect(result.label).toMatch(/^\d{4}年\d+月$/)
    })

    it('should return last month range', () => {
      const result = helpers.getMonthRange(-1)
      const currentDate = new Date()
      const expectedMonth = currentDate.getMonth() // Last month
      expect(result.monthStr).toMatch(/^\d{4}-\d{2}$/)
    })

    it('should handle offset of 0 as default', () => {
      const result1 = helpers.getMonthRange()
      const result2 = helpers.getMonthRange(0)
      expect(result1.label).toBe(result2.label)
    })
  })

  describe('getYearRange', () => {
    it('should return current year range', () => {
      const result = helpers.getYearRange(0)
      expect(result).toHaveProperty('start')
      expect(result).toHaveProperty('end')
      expect(result).toHaveProperty('label')
      expect(result.label).toMatch(/^\d{4}年$/)
    })

    it('should return last year range', () => {
      const result = helpers.getYearRange(-1)
      const currentYear = new Date().getFullYear()
      expect(result.label).toBe(`${currentYear - 1}年`)
    })
  })

  describe('getWeekNumber', () => {
    it('should return valid ISO week number', () => {
      const result = helpers.getWeekNumber(new Date(2024, 0, 1))
      expect(result).toHaveProperty('year')
      expect(result).toHaveProperty('week')
      expect(result.week).toBeGreaterThanOrEqual(1)
      expect(result.week).toBeLessThanOrEqual(53)
    })

    it('should return {0, 0} for invalid date', () => {
      const result = helpers.getWeekNumber('invalid')
      expect(result).toEqual({ year: 0, week: 0 })
    })
  })

  describe('formatAmount', () => {
    it('should format amount with 2 decimal places', () => {
      expect(helpers.formatAmount(1234)).toBe('1,234.00')
      expect(helpers.formatAmount(1000000)).toBe('1,000,000.00')
    })

    it('should return 0.00 for null', () => {
      expect(helpers.formatAmount(null)).toBe('0.00')
    })

    it('should return 0.00 for undefined', () => {
      expect(helpers.formatAmount(undefined)).toBe('0.00')
    })

    it('should return 0.00 for empty string', () => {
      expect(helpers.formatAmount('')).toBe('0.00')
    })

    it('should format decimal amounts', () => {
      expect(helpers.formatAmount(99.9)).toBe('99.90')
      expect(helpers.formatAmount(0.5)).toBe('0.50')
    })
  })

  describe('getRoleName', () => {
    it('should return Chinese name for valid roles', () => {
      expect(helpers.getRoleName('boss')).toBe('老板')
      expect(helpers.getRoleName('admin')).toBe('管理员')
      expect(helpers.getRoleName('purchase')).toBe('采购主管')
      expect(helpers.getRoleName('chef')).toBe('厨师')
      expect(helpers.getRoleName('waiter')).toBe('服务员')
    })

    it('should return unknown for invalid role', () => {
      // Returns input value when not in map, unless null/undefined
      expect(helpers.getRoleName('invalid')).toBe('invalid')
    })

    it('should return input for unknown role', () => {
      expect(helpers.getRoleName('custom')).toBe('custom')
    })
  })

  describe('getCategoryName', () => {
    it('should return Chinese name for valid categories', () => {
      expect(helpers.getCategoryName('meat')).toBe('肉类')
      expect(helpers.getCategoryName('seafood')).toBe('海鲜')
      expect(helpers.getCategoryName('vegetable')).toBe('蔬菜')
      expect(helpers.getCategoryName('drink')).toBe('饮品')
    })

    it('should return input for unknown category', () => {
      // Returns input value when not in map, unless null/undefined
      expect(helpers.getCategoryName('invalid')).toBe('invalid')
    })
  })

  describe('getIncomeTypeText', () => {
    it('should return Chinese name for valid types', () => {
      expect(helpers.getIncomeTypeText('dining')).toBe('餐饮')
      expect(helpers.getIncomeTypeText('chess')).toBe('棋牌')
      expect(helpers.getIncomeTypeText('liquor')).toBe('酒水')
      expect(helpers.getIncomeTypeText('service')).toBe('服务')
    })
  })

  describe('getReservationStatusText', () => {
    it('should return 已取消 for cancelled status', () => {
      expect(helpers.getReservationStatusText('cancelled')).toBe('已取消')
    })

    it('should return 正常 for other statuses', () => {
      expect(helpers.getReservationStatusText('confirmed')).toBe('正常')
      expect(helpers.getReservationStatusText('pending')).toBe('正常')
      expect(helpers.getReservationStatusText('')).toBe('正常')
    })
  })

  describe('getExpenseCategoryName', () => {
    it('should return Chinese name for valid categories', () => {
      expect(helpers.getExpenseCategoryName('salary')).toBe('工资')
      expect(helpers.getExpenseCategoryName('rent')).toBe('房租')
      expect(helpers.getExpenseCategoryName('utilities')).toBe('水电')
    })
  })

  describe('getRoomName', () => {
    it('should return Chinese name for valid rooms', () => {
      expect(helpers.getRoomName('big')).toBe('大包厢')
      expect(helpers.getRoomName('small')).toBe('小包厢')
    })

    it('should return input for unknown room', () => {
      // Returns input value when not in map
      expect(helpers.getRoomName('medium')).toBe('medium')
    })

    it('should return name from reservationConfig cache when available', () => {
      // Prime the cache via reservationConfig
      var config = require('../../miniprogram/utils/reservationConfig')
      var origFn = config._getRoomsCache
      config._getRoomsCache = function() {
        return [{ id: 'vip', name: 'VIP厅' }, { id: 'big', name: '大包厢VIP' }]
      }
      expect(helpers.getRoomName('vip')).toBe('VIP厅')
      // Cache takes priority over hardcoded map
      expect(helpers.getRoomName('big')).toBe('大包厢VIP')
      config._getRoomsCache = origFn
    })
  })

  describe('getExclusiveTypeName', () => {
    it('should return 包场（午） for noon', () => {
      expect(helpers.getExclusiveTypeName('noon')).toBe('包场（午）')
    })

    it('should return 包场（晚） for night', () => {
      expect(helpers.getExclusiveTypeName('night')).toBe('包场（晚）')
    })

    it('should return 包场（全天） for full', () => {
      expect(helpers.getExclusiveTypeName('full')).toBe('包场（全天）')
    })

    it('should return room name for none', () => {
      expect(helpers.getExclusiveTypeName('none', 'big')).toBe('大包厢')
    })
  })

  describe('calcWorkDuration', () => {
    it('should return formatted duration', () => {
      const clockIn = new Date(2024, 0, 1, 9, 0)
      const clockOut = new Date(2024, 0, 1, 17, 30)
      expect(helpers.calcWorkDuration(clockIn, clockOut)).toBe('8h 30m')
    })

    it('should return -- for null clockIn', () => {
      expect(helpers.calcWorkDuration(null, new Date())).toBe('--')
    })

    it('should return -- for null clockOut', () => {
      expect(helpers.calcWorkDuration(new Date(), null)).toBe('--')
    })

    it('should return -- for negative duration', () => {
      const clockIn = new Date(2024, 0, 1, 17, 0)
      const clockOut = new Date(2024, 0, 1, 9, 0)
      expect(helpers.calcWorkDuration(clockIn, clockOut)).toBe('--')
    })

    it('should handle string date inputs', () => {
      const clockIn = '2024-01-01T09:00:00'
      const clockOut = '2024-01-01T18:00:00'
      expect(helpers.calcWorkDuration(clockIn, clockOut)).toBe('9h 0m')
    })
  })

  describe('isLate', () => {
    it('should return true if after threshold', () => {
      const clockIn = new Date(2024, 0, 1, 9, 30)
      expect(helpers.isLate(clockIn)).toBe(true)
    })

    it('should return false if at threshold', () => {
      const clockIn = new Date(2024, 0, 1, 9, 0)
      expect(helpers.isLate(clockIn)).toBe(false)
    })

    it('should return false if before threshold', () => {
      const clockIn = new Date(2024, 0, 1, 8, 30)
      expect(helpers.isLate(clockIn)).toBe(false)
    })

    it('should return false for null', () => {
      expect(helpers.isLate(null)).toBe(false)
    })

    it('should use custom threshold', () => {
      const clockIn = new Date(2024, 0, 1, 10, 0)
      expect(helpers.isLate(clockIn, '10:30')).toBe(false)
      expect(helpers.isLate(clockIn, '09:30')).toBe(true)
    })
  })
})
