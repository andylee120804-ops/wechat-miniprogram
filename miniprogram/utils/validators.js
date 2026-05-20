/**
 * validators.js - Validation utility functions
 */

/**
 * Validate required field
 * @param {*} value - The value to check
 * @param {string} fieldName - Field name for error message
 * @returns {{valid: boolean, message: string}}
 */
function validateRequired(value, fieldName) {
  fieldName = fieldName || '此字段'
  if (value === null || value === undefined || value === '') {
    return { valid: false, message: `${fieldName}不能为空` }
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { valid: false, message: `${fieldName}不能为空` }
  }
  return { valid: true, message: '' }
}

/**
 * Validate positive number
 * @param {*} value - The value to check
 * @param {string} fieldName - Field name for error message
 * @returns {{valid: boolean, message: string}}
 */
function validatePositiveNumber(value, fieldName) {
  fieldName = fieldName || '数值'
  if (value === null || value === undefined || value === '') {
    return { valid: false, message: `${fieldName}不能为空` }
  }
  const num = Number(value)
  if (isNaN(num)) {
    return { valid: false, message: `${fieldName}必须为数字` }
  }
  if (num <= 0) {
    return { valid: false, message: `${fieldName}必须大于0` }
  }
  return { valid: true, message: '' }
}

/**
 * Validate phone number (Chinese mobile format)
 * @param {string} phone - Phone number to validate
 * @returns {{valid: boolean, message: string}}
 */
function validatePhone(phone) {
  if (!phone) {
    return { valid: false, message: '手机号不能为空' }
  }
  const phoneRegex = /^1[3-9]\d{9}$/
  if (!phoneRegex.test(String(phone).trim())) {
    return { valid: false, message: '请输入正确的手机号' }
  }
  return { valid: true, message: '' }
}

/**
 * Validate guest count
 * @param {*} value - The guest count value
 * @returns {{valid: boolean, message: string}}
 */
function validateGuestCount(value) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, message: '人数不能为空' }
  }
  const num = Number(value)
  if (isNaN(num)) {
    return { valid: false, message: '人数必须为数字' }
  }
  if (num <= 0) {
    return { valid: false, message: '人数必须大于0' }
  }
  if (!Number.isInteger(num)) {
    return { valid: false, message: '人数必须为整数' }
  }
  if (num > 999) {
    return { valid: false, message: '人数不能超过999' }
  }
  return { valid: true, message: '' }
}

/**
 * Validate amount
 * @param {*} value - The amount value
 * @returns {{valid: boolean, message: string}}
 */
function validateAmount(value) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, message: '金额不能为空' }
  }
  const num = Number(value)
  if (isNaN(num)) {
    return { valid: false, message: '金额必须为数字' }
  }
  if (num <= 0) {
    return { valid: false, message: '金额必须大于0' }
  }
  if (num > 9999999.99) {
    return { valid: false, message: '金额超出范围' }
  }
  // Check decimal places
  const decimalPart = String(value).split('.')[1]
  if (decimalPart && decimalPart.length > 2) {
    return { valid: false, message: '金额最多保留两位小数' }
  }
  return { valid: true, message: '' }
}

/**
 * Validate date
 * @param {*} value - The date value
 * @param {string} fieldName - Field name for error message
 * @returns {{valid: boolean, message: string}}
 */
function validateDate(value, fieldName) {
  fieldName = fieldName || '日期'
  if (!value) {
    return { valid: false, message: `${fieldName}不能为空` }
  }
  const d = new Date(value)
  if (isNaN(d.getTime())) {
    return { valid: false, message: `${fieldName}格式不正确` }
  }
  return { valid: true, message: '' }
}

/**
 * Batch validate multiple rules
 * @param {Array<{validator: Function, value: *, fieldName: string}>} rules - Array of validation rules
 * @returns {{valid: boolean, errors: string[]}}
 */
function validate(rules) {
  if (!Array.isArray(rules)) {
    return { valid: true, errors: [] }
  }
  const errors = []
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    const result = rule.validator(rule.value, rule.fieldName)
    if (!result.valid) {
      errors.push(result.message)
    }
  }
  return {
    valid: errors.length === 0,
    errors: errors
  }
}

module.exports = {
  validateRequired,
  validatePositiveNumber,
  validatePhone,
  validateGuestCount,
  validateAmount,
  validateDate,
  validate
}
