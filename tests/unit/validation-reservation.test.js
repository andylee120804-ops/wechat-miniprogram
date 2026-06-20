/**
 * Unit tests for reservation-add/helpers/validation.js
 *
 * Tests the pure validateReservationForm function that powers the
 * reservation-add page's form validation.
 */

// Mock dependencies before requiring
jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((d) => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}))

jest.mock('../../miniprogram/utils/validators', () => ({
  validateRequired: jest.fn((v, name) => {
    if (v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === ''))
      return { valid: false, message: name + '不能为空' }
    return { valid: true, message: '' }
  }),
  validateGuestCount: jest.fn((v) => {
    const n = Number(v)
    if (v === null || v === undefined || v === '' || isNaN(n) || n <= 0)
      return { valid: false, message: '人数不能为空' }
    return { valid: true, message: '' }
  })
}))

const { validateReservationForm } = require('../../miniprogram/pages/reservation-add/helpers/validation')
const { formatDate } = require('../../miniprogram/utils/helpers')
const { validateRequired, validateGuestCount } = require('../../miniprogram/utils/validators')

// Helper: create default valid params
function createValidParams(overrides) {
  return {
    date: '2099-06-01',
    exclusiveType: 'none',
    room: 'big',
    formData: {
      customerName: '测试客户',
      phone: '13800138000',
      guestCount: '10',
      dishPrice: '500',
      remark: ''
    },
    formFields: [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true, hiddenInRooms: [] },
      { id: 'phone', label: '手机号', type: 'text', builtin: true, visible: true, required: false, hiddenInRooms: [] },
      { id: 'guestCount', label: '人数', type: 'number', builtin: true, visible: true, required: true, hiddenInRooms: [] },
      { id: 'dishPrice', label: '预定菜价', type: 'number', builtin: true, visible: true, required: false, hiddenInRooms: [] },
      { id: 'remark', label: '备注', type: 'textarea', builtin: true, visible: true, required: false, hiddenInRooms: [] }
    ],
    allowNoStandard: false,
    standardPicked: true,
    dishPriceRequired: false,
    ...overrides
  }
}

describe('validateReservationForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── Happy path ────────────────────────────────────────────────────

  test('returns empty errors for valid form data', () => {
    const errors = validateReservationForm(createValidParams())
    expect(Object.keys(errors).length).toBe(0)
  })

  // ── Date validation ───────────────────────────────────────────────

  test('errors.date when date is empty', () => {
    validateRequired.mockReturnValueOnce({ valid: false, message: '日期不能为空' })
    const errors = validateReservationForm(createValidParams({ date: '' }))
    expect(errors.date).toBe('日期不能为空')
  })

  test('errors.date when date is in the past', () => {
    formatDate.mockReturnValueOnce('2099-01-01')
    const errors = validateReservationForm(createValidParams({ date: '2020-01-01' }))
    expect(errors.date).toBe('不能选择过去的日期')
  })

  test('no date error for today', () => {
    formatDate.mockReturnValueOnce('2099-06-01')
    const errors = validateReservationForm(createValidParams({ date: '2099-06-01' }))
    expect(errors.date).toBeUndefined()
  })

  // ── customerName validation ───────────────────────────────────────

  test('errors.customerName when required and empty', () => {
    validateRequired.mockImplementationOnce((v, name) => ({ valid: false, message: name + '不能为空' }))
    const errors = validateReservationForm(createValidParams({
      formData: { customerName: '', phone: '', guestCount: '10', dishPrice: '', remark: '' }
    }))
    expect(errors.customerName).toBe('客户姓名不能为空')
  })

  // ── guestCount validation ─────────────────────────────────────────

  test('errors.guestCount when required and empty', () => {
    validateGuestCount.mockReturnValueOnce({ valid: false, message: '人数不能为空' })
    const errors = validateReservationForm(createValidParams({
      formData: { customerName: '张三', phone: '', guestCount: '', dishPrice: '', remark: '' }
    }))
    expect(errors.guestCount).toBe('人数不能为空')
  })

  // ── Phone validation ──────────────────────────────────────────────

  test('errors.phone when format is invalid', () => {
    const errors = validateReservationForm(createValidParams({
      formData: { customerName: '张三', phone: '123', guestCount: '10', dishPrice: '', remark: '' }
    }))
    expect(errors.phone).toBe('请输入正确的手机号')
  })

  test('no phone error when empty and not required', () => {
    const errors = validateReservationForm(createValidParams({
      formData: { customerName: '张三', phone: '', guestCount: '10', dishPrice: '', remark: '' }
    }))
    expect(errors.phone).toBeUndefined()
  })

  test('no phone error for valid Chinese mobile number', () => {
    const errors = validateReservationForm(createValidParams({
      formData: { customerName: '张三', phone: '13800138000', guestCount: '10', dishPrice: '', remark: '' }
    }))
    expect(errors.phone).toBeUndefined()
  })

  // ── select field validation ───────────────────────────────────────

  test('errors for required select field when empty', () => {
    const formFields = [
      { id: 'mealType', label: '用餐类型', type: 'select', visible: true, required: true, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm(createValidParams({
      formFields,
      formData: { mealType: '' }
    }))
    expect(errors.mealType).toBe('请选择用餐类型')
  })

  // ── Generic required field ────────────────────────────────────────

  test('errors for generic required field when empty', () => {
    const formFields = [
      { id: 'address', label: '地址', type: 'text', visible: true, required: true, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm(createValidParams({
      formFields,
      formData: { address: '' }
    }))
    expect(errors.address).toBe('请填写地址')
  })

  test('no error for non-visible field even if required', () => {
    const formFields = [
      { id: 'hidden', label: '隐藏字段', type: 'text', visible: false, required: true, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm(createValidParams({
      formFields,
      formData: { hidden: '' }
    }))
    expect(errors.hidden).toBeUndefined()
  })

  // ── dishPrice conditional required (service charge mode) ──────────

  test('errors.dishPrice when dishPriceRequired and dishPrice <= 0', () => {
    const errors = validateReservationForm(createValidParams({
      dishPriceRequired: true,
      formData: { customerName: '张三', phone: '', guestCount: '10', dishPrice: '0', remark: '' }
    }))
    expect(errors.dishPrice).toBe('服务费模式下菜价必须填写')
  })

  test('no dishPrice error when dishPriceRequired but dishPrice > 0', () => {
    const errors = validateReservationForm(createValidParams({
      dishPriceRequired: true,
      formData: { customerName: '张三', phone: '', guestCount: '10', dishPrice: '500', remark: '' }
    }))
    expect(errors.dishPrice).toBeUndefined()
  })

  test('no dishPrice error when not dishPriceRequired', () => {
    const errors = validateReservationForm(createValidParams({
      dishPriceRequired: false,
      formData: { customerName: '张三', phone: '', guestCount: '10', dishPrice: '0', remark: '' }
    }))
    expect(errors.dishPrice).toBeUndefined()
  })

  // ── Room validation ───────────────────────────────────────────────

  test('errors.room when exclusiveType is none and room is empty', () => {
    const errors = validateReservationForm(createValidParams({ exclusiveType: 'none', room: '' }))
    expect(errors.room).toBe('请选择包厢')
  })

  test('no room error when exclusiveType is not none', () => {
    const errors = validateReservationForm(createValidParams({ exclusiveType: 'full', room: '' }))
    expect(errors.room).toBeUndefined()
  })

  // ── Standard validation ───────────────────────────────────────────

  test('errors.standard when allowNoStandard is false and standardPicked is false', () => {
    const errors = validateReservationForm(createValidParams({ allowNoStandard: false, standardPicked: false }))
    expect(errors.standard).toBe('请选择餐标')
  })

  test('no standard error when allowNoStandard is true', () => {
    const errors = validateReservationForm(createValidParams({ allowNoStandard: true, standardPicked: false }))
    expect(errors.standard).toBeUndefined()
  })

  test('no standard error when standardPicked is true', () => {
    const errors = validateReservationForm(createValidParams({ allowNoStandard: false, standardPicked: true }))
    expect(errors.standard).toBeUndefined()
  })

  // ── Custom fields ─────────────────────────────────────────────────

  test('validates custom required fields', () => {
    const formFields = [
      { id: 'customField', label: '自定义字段', type: 'text', visible: true, required: true, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm(createValidParams({
      formFields,
      formData: { customField: '' }
    }))
    expect(errors.customField).toBe('请填写自定义字段')
  })

  test('no error for custom non-required field', () => {
    const formFields = [
      { id: 'customOptional', label: '选填', type: 'text', visible: true, required: false, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm(createValidParams({
      formFields,
      formData: { customOptional: '' }
    }))
    expect(errors.customOptional).toBeUndefined()
  })

  // ── Multiple errors ───────────────────────────────────────────────

  test('returns multiple errors when several fields are invalid', () => {
    validateRequired.mockImplementation((v, name) => ({ valid: false, message: name + '不能为空' }))
    validateGuestCount.mockReturnValue({ valid: false, message: '人数不能为空' })

    const errors = validateReservationForm(createValidParams({
      date: '',
      room: '',
      allowNoStandard: false,
      standardPicked: false,
      formData: { customerName: '', phone: '', guestCount: '', dishPrice: '', remark: '' }
    }))
    expect(Object.keys(errors).length).toBeGreaterThanOrEqual(3)
    expect(errors.date).toBeDefined()
    expect(errors.standard).toBeDefined()
  })
})
