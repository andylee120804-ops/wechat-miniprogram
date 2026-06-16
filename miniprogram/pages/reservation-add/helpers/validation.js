/**
 * validation.js - Form validation for reservation-add.
 *
 * Pure validation function that takes the page's data snapshot and
 * resolved formFields, and returns an `errors` object keyed by field id.
 */
const { formatDate } = require('../../../utils/helpers')
const { validateRequired, validateGuestCount } = require('../../../utils/validators')

/**
 * Validate the reservation form.
 * @param {Object} params
 * @param {string} params.date - YYYY-MM-DD
 * @param {string} params.exclusiveType
 * @param {string} params.room
 * @param {Object} params.formData - Map of fieldId → value
 * @param {Array} params.formFields - Resolved fields visible in current room
 * @param {boolean} params.allowNoStandard - true when room has no standards
 * @param {boolean} params.standardPicked - whether standard was selected
 * @param {boolean} params.dishPriceRequired - true if service charge mode active
 * @returns {Object} errors keyed by field id (empty when valid)
 */
function validateReservationForm({
  date, exclusiveType, room, formData, formFields,
  allowNoStandard, standardPicked, dishPriceRequired
}) {
  const errors = {}

  const dateResult = validateRequired(date, '日期')
  if (!dateResult.valid) errors.date = dateResult.message
  if (!errors.date && date < formatDate(new Date())) {
    errors.date = '不能选择过去的日期'
  }

  formFields.forEach(function(f) {
    if (!f.visible) return
    const val = formData[f.id]

    if (f.required) {
      if (f.id === 'customerName') {
        const nameResult = validateRequired(val, '客户姓名')
        if (!nameResult.valid) errors.customerName = nameResult.message
      } else if (f.id === 'guestCount') {
        const guestResult = validateGuestCount(val)
        if (!guestResult.valid) errors.guestCount = guestResult.message
      } else if (f.type === 'select') {
        if (!val || String(val).trim() === '') {
          errors[f.id] = '请选择' + f.label
        }
      } else {
        if (val === undefined || val === null || String(val).trim() === '') {
          errors[f.id] = '请填写' + f.label
        }
      }
    }

    // Phone format
    if (f.id === 'phone' && val && String(val).trim()) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(String(val).trim())) {
        errors.phone = '请输入正确的手机号'
      }
    }

    // Dish price conditional required (service charge mode)
    if (f.id === 'dishPrice' && dishPriceRequired) {
      const dp = Number(val) || 0
      if (dp <= 0) {
        errors.dishPrice = '服务费模式下菜价必须填写'
      }
    }
  })

  if (exclusiveType === 'none' && !room) {
    errors.room = '请选择包厢'
  }

  if (!allowNoStandard && !standardPicked) {
    errors.standard = '请选择餐标'
  }

  return errors
}

module.exports = { validateReservationForm }
