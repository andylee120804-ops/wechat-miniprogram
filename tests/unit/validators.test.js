/**
 * Unit tests for validators.js
 * Tests form validation utilities
 */

const validators = require('../../miniprogram/utils/validators')

describe('validators.js', () => {
  describe('validateRequired', () => {
    test('returns invalid for null', () => {
      const result = validators.validateRequired(null, '姓名')
      expect(result.valid).toBe(false)
      expect(result.message).toBe('姓名不能为空')
    })

    test('returns invalid for undefined', () => {
      const result = validators.validateRequired(undefined, '姓名')
      expect(result.valid).toBe(false)
    })

    test('returns invalid for empty string', () => {
      const result = validators.validateRequired('', '姓名')
      expect(result.valid).toBe(false)
    })

    test('returns invalid for whitespace-only string', () => {
      const result = validators.validateRequired('   ', '姓名')
      expect(result.valid).toBe(false)
    })

    test('returns valid for non-empty value', () => {
      const result = validators.validateRequired('张三', '姓名')
      expect(result.valid).toBe(true)
      expect(result.message).toBe('')
    })

    test('returns valid for zero', () => {
      const result = validators.validateRequired(0, '数量')
      expect(result.valid).toBe(true)
    })

    test('returns valid for false', () => {
      const result = validators.validateRequired(false, '状态')
      expect(result.valid).toBe(true)
    })

    test('uses default field name', () => {
      const result = validators.validateRequired('')
      expect(result.message).toBe('此字段不能为空')
    })
  })

  describe('validatePositiveNumber', () => {
    test('returns invalid for null', () => {
      const result = validators.validatePositiveNumber(null)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('不能为空')
    })

    test('returns invalid for empty string', () => {
      const result = validators.validatePositiveNumber('')
      expect(result.valid).toBe(false)
    })

    test('returns invalid for non-numeric string', () => {
      const result = validators.validatePositiveNumber('abc')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('必须为数字')
    })

    test('returns invalid for zero', () => {
      const result = validators.validatePositiveNumber(0)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('必须大于0')
    })

    test('returns invalid for negative number', () => {
      const result = validators.validatePositiveNumber(-5)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('必须大于0')
    })

    test('returns valid for positive number', () => {
      const result = validators.validatePositiveNumber(5)
      expect(result.valid).toBe(true)
    })

    test('returns valid for positive decimal', () => {
      const result = validators.validatePositiveNumber(5.5)
      expect(result.valid).toBe(true)
    })

    test('returns valid for string number', () => {
      const result = validators.validatePositiveNumber('100')
      expect(result.valid).toBe(true)
    })
  })

  describe('validatePhone', () => {
    test('returns invalid for empty phone', () => {
      const result = validators.validatePhone('')
      expect(result.valid).toBe(false)
      expect(result.message).toBe('手机号不能为空')
    })

    test('returns invalid for null', () => {
      const result = validators.validatePhone(null)
      expect(result.valid).toBe(false)
    })

    test('returns invalid for invalid format', () => {
      expect(validators.validatePhone('12345').valid).toBe(false)
      expect(validators.validatePhone('abc12345678').valid).toBe(false)
      expect(validators.validatePhone('12345678901').valid).toBe(false) // wrong prefix
    })

    test('returns valid for correct Chinese mobile format', () => {
      expect(validators.validatePhone('13812345678').valid).toBe(true)
      expect(validators.validatePhone('15912345678').valid).toBe(true)
      expect(validators.validatePhone('18812345678').valid).toBe(true)
      expect(validators.validatePhone('19912345678').valid).toBe(true)
    })

    test('trims whitespace', () => {
      const result = validators.validatePhone('  13812345678  ')
      expect(result.valid).toBe(true)
    })
  })

  describe('validateGuestCount', () => {
    test('returns invalid for null', () => {
      const result = validators.validateGuestCount(null)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('人数不能为空')
    })

    test('returns invalid for empty string', () => {
      const result = validators.validateGuestCount('')
      expect(result.valid).toBe(false)
    })

    test('returns invalid for non-numeric', () => {
      const result = validators.validateGuestCount('abc')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('人数必须为数字')
    })

    test('returns invalid for zero', () => {
      const result = validators.validateGuestCount(0)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('人数必须大于0')
    })

    test('returns invalid for negative', () => {
      const result = validators.validateGuestCount(-5)
      expect(result.valid).toBe(false)
    })

    test('returns invalid for decimal', () => {
      const result = validators.validateGuestCount(5.5)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('人数必须为整数')
    })

    test('returns invalid for exceeding max', () => {
      const result = validators.validateGuestCount(1000)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('人数不能超过999')
    })

    test('returns valid for integer in range', () => {
      expect(validators.validateGuestCount(1).valid).toBe(true)
      expect(validators.validateGuestCount(999).valid).toBe(true)
      expect(validators.validateGuestCount(50).valid).toBe(true)
    })
  })

  describe('validateAmount', () => {
    test('returns invalid for null', () => {
      const result = validators.validateAmount(null)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额不能为空')
    })

    test('returns invalid for empty string', () => {
      const result = validators.validateAmount('')
      expect(result.valid).toBe(false)
    })

    test('returns invalid for non-numeric', () => {
      const result = validators.validateAmount('abc')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额必须为数字')
    })

    test('returns invalid for negative', () => {
      const result = validators.validateAmount(-100)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额必须大于0')
    })

    test('returns invalid for exceeding max', () => {
      const result = validators.validateAmount(10000000)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额超出范围')
    })

    test('returns invalid for more than 2 decimal places', () => {
      const result = validators.validateAmount('100.123')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额最多保留两位小数')
    })

    test('returns invalid for zero', () => {
      const result = validators.validateAmount(0)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('金额必须大于0')
    })

    test('returns valid for positive amount', () => {
      expect(validators.validateAmount(100).valid).toBe(true)
      expect(validators.validateAmount('100').valid).toBe(true)
      expect(validators.validateAmount(100.5).valid).toBe(true)
      expect(validators.validateAmount('100.5').valid).toBe(true)
      expect(validators.validateAmount('100.55').valid).toBe(true)
    })
  })

  describe('validateDate', () => {
    test('returns invalid for null', () => {
      const result = validators.validateDate(null)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('不能为空')
    })

    test('returns invalid for invalid date string', () => {
      const result = validators.validateDate('not-a-date')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('格式不正确')
    })

    test('returns valid for valid date string', () => {
      const result = validators.validateDate('2025-01-15')
      expect(result.valid).toBe(true)
    })

    test('returns valid for Date object', () => {
      const result = validators.validateDate(new Date())
      expect(result.valid).toBe(true)
    })

    test('uses custom field name', () => {
      const result = validators.validateDate('', '预约日期')
      expect(result.message).toContain('预约日期')
    })
  })

  describe('validate (batch validation)', () => {
    test('returns valid for empty rules array', () => {
      const result = validators.validate([])
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('returns valid for non-array input', () => {
      const result = validators.validate('not an array')
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('validates multiple rules', () => {
      const rules = [
        { validator: validators.validateRequired, value: 'test', fieldName: '姓名' },
        { validator: validators.validatePhone, value: '13812345678' },
        { validator: validators.validateAmount, value: 100 }
      ]
      const result = validators.validate(rules)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    test('collects all errors', () => {
      const rules = [
        { validator: validators.validateRequired, value: '', fieldName: '姓名' },
        { validator: validators.validatePhone, value: '' },
        { validator: validators.validateAmount, value: -1 }
      ]
      const result = validators.validate(rules)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBe(3)
      expect(result.errors).toContain('姓名不能为空')
      expect(result.errors).toContain('手机号不能为空')
      expect(result.errors).toContain('金额必须大于0')
    })

    test('handles mixed valid and invalid rules', () => {
      const rules = [
        { validator: validators.validateRequired, value: 'valid', fieldName: '姓名' },
        { validator: validators.validatePhone, value: 'invalid' }
      ]
      const result = validators.validate(rules)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBe(1)
    })
  })
})
