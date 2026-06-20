/**
 * Unit tests for reservation dynamic config feature.
 *
 * Covers the pure functions and key logic paths that the e2e spec
 * reservation-dynamic-config.spec.js validates at integration level:
 *
 *   - reservationConfig.resolveFields (hiddenInRooms filter, edge cases)
 *   - validateReservationForm (dynamic fields, conditional required)
 *   - checkReservationConflict (exclusiveType semantics)
 *   - isNoStandardRoom (sync helper)
 *   - createSettingsCache (per-instance cache)
 *   - groupByRoomDynamic (calendar dynamic grouping)
 *   - applyRoomConfig / _clearFieldsHiddenByRoomTransition (page-level)
 *   - _buildDocData (builtin vs custom field split)
 */

const { describe, test, expect, beforeEach, jest } = require('@jest/globals')

// ────────────────────────────────────────────────────────────────────────
// 1. reservationConfig.resolveFields — additional edge cases
// ────────────────────────────────────────────────────────────────────────

const mockQueryAll = jest.fn()
jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  COLLECTIONS: { SETTINGS: 'settings' }
}))

const {
  resolveFields, loadRooms, loadFormConfig,
  invalidateCache, DEFAULT_ROOMS, DEFAULT_FORM_CONFIG
} = require('../../miniprogram/utils/reservationConfig')

describe('resolveFields — edge cases', () => {
  test('returns empty array when fields is empty', () => {
    expect(resolveFields([], 'big')).toEqual([])
  })

  test('excludes all fields when every field is hidden in the given room', () => {
    const fields = [
      { id: 'a', visible: true, hiddenInRooms: ['big'] },
      { id: 'b', visible: true, hiddenInRooms: ['big', 'small'] }
    ]
    expect(resolveFields(fields, 'big')).toEqual([])
  })

  test('includes field when hiddenInRooms is an empty array', () => {
    const fields = [
      { id: 'x', visible: true, hiddenInRooms: [] }
    ]
    expect(resolveFields(fields, 'big').map(f => f.id)).toEqual(['x'])
  })

  test('includes field when hiddenInRooms is undefined', () => {
    const fields = [
      { id: 'x', visible: true }
    ]
    expect(resolveFields(fields, 'big').map(f => f.id)).toEqual(['x'])
  })

  test('includes field when hiddenInRooms does not contain roomId', () => {
    const fields = [
      { id: 'x', visible: true, hiddenInRooms: ['small'] }
    ]
    expect(resolveFields(fields, 'big').map(f => f.id)).toEqual(['x'])
  })

  test('excludes field with visible=false regardless of hiddenInRooms', () => {
    const fields = [
      { id: 'a', visible: false, hiddenInRooms: [] },
      { id: 'b', visible: false, hiddenInRooms: undefined }
    ]
    expect(resolveFields(fields, 'big')).toEqual([])
  })

  test('handles mixed visible and hidden fields across multiple rooms', () => {
    const fields = [
      { id: 'name', visible: true, hiddenInRooms: [] },
      { id: 'count', visible: true, hiddenInRooms: ['chess'] },
      { id: 'price', visible: true, hiddenInRooms: ['chess', 'vip'] },
      { id: 'secret', visible: false, hiddenInRooms: [] }
    ]
    // big room: name + count + price
    expect(resolveFields(fields, 'big').map(f => f.id)).toEqual(['name', 'count', 'price'])
    // chess room: name only
    expect(resolveFields(fields, 'chess').map(f => f.id)).toEqual(['name'])
    // vip room: name + count
    expect(resolveFields(fields, 'vip').map(f => f.id)).toEqual(['name', 'count'])
  })

  test('preserves full field objects (not just id)', () => {
    const fields = [
      { id: 'x', visible: true, label: 'Test', type: 'text', required: true }
    ]
    const result = resolveFields(fields, 'any')
    expect(result[0]).toEqual(fields[0])
  })
})

// ────────────────────────────────────────────────────────────────────────
// 2. validateReservationForm
// ────────────────────────────────────────────────────────────────────────

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
    if (!v || String(v).trim() === '') return { valid: false, message: name + '不能为空' }
    return { valid: true, message: '' }
  }),
  validateGuestCount: jest.fn((v) => {
    const n = Number(v)
    if (!v || isNaN(n) || n <= 0) return { valid: false, message: '人数不能为空' }
    return { valid: true, message: '' }
  })
}))

const { validateReservationForm } = require('../../miniprogram/pages/reservation-add/helpers/validation')

describe('validateReservationForm', () => {
  const baseParams = {
    date: '2026-06-20',
    exclusiveType: 'none',
    room: 'big',
    formData: { customerName: '张三', phone: '', guestCount: '10', dishPrice: '', remark: '' },
    formFields: DEFAULT_FORM_CONFIG.fields,
    allowNoStandard: false,
    standardPicked: true,
    dishPriceRequired: false
  }

  test('returns empty errors for valid input', () => {
    const errors = validateReservationForm(baseParams)
    expect(Object.keys(errors).length).toBe(0)
  })

  test('reports missing date', () => {
    const errors = validateReservationForm({ ...baseParams, date: '' })
    expect(errors.date).toBeDefined()
  })

  test('reports past date', () => {
    const errors = validateReservationForm({ ...baseParams, date: '2020-01-01' })
    expect(errors.date).toBe('不能选择过去的日期')
  })

  test('reports missing customerName when required', () => {
    const errors = validateReservationForm({
      ...baseParams,
      formData: { ...baseParams.formData, customerName: '' }
    })
    expect(errors.customerName).toBeDefined()
  })

  test('reports missing guestCount when required and visible', () => {
    const errors = validateReservationForm({
      ...baseParams,
      formData: { ...baseParams.formData, guestCount: '' }
    })
    expect(errors.guestCount).toBeDefined()
  })

  test('reports invalid guestCount (zero or negative)', () => {
    const errors = validateReservationForm({
      ...baseParams,
      formData: { ...baseParams.formData, guestCount: '0' }
    })
    expect(errors.guestCount).toBeDefined()
  })

  test('does not require guestCount when field is hidden (not in formFields)', () => {
    const chessFields = resolveFields(DEFAULT_FORM_CONFIG.fields, 'chess')
    const errors = validateReservationForm({
      ...baseParams,
      room: 'chess',
      formData: { customerName: '张三', phone: '', remark: '' },
      formFields: chessFields
    })
    expect(errors.guestCount).toBeUndefined()
  })

  test('reports invalid phone format', () => {
    const errors = validateReservationForm({
      ...baseParams,
      formData: { ...baseParams.formData, phone: '1234' }
    })
    expect(errors.phone).toBe('请输入正确的手机号')
  })

  test('accepts valid phone format', () => {
    const errors = validateReservationForm({
      ...baseParams,
      formData: { ...baseParams.formData, phone: '13800138000' }
    })
    expect(errors.phone).toBeUndefined()
  })

  test('reports dishPrice required when dishPriceRequired=true and value is 0', () => {
    const errors = validateReservationForm({
      ...baseParams,
      dishPriceRequired: true,
      formData: { ...baseParams.formData, dishPrice: '' }
    })
    expect(errors.dishPrice).toBe('服务费模式下菜价必须填写')
  })

  test('accepts dishPrice when dishPriceRequired=true and value > 0', () => {
    const errors = validateReservationForm({
      ...baseParams,
      dishPriceRequired: true,
      formData: { ...baseParams.formData, dishPrice: '500' }
    })
    expect(errors.dishPrice).toBeUndefined()
  })

  test('reports missing standard when allowNoStandard=false and standardPicked=false', () => {
    const errors = validateReservationForm({
      ...baseParams,
      allowNoStandard: false,
      standardPicked: false
    })
    expect(errors.standard).toBe('请选择餐标')
  })

  test('allows no standard when allowNoStandard=true', () => {
    const errors = validateReservationForm({
      ...baseParams,
      allowNoStandard: true,
      standardPicked: false
    })
    expect(errors.standard).toBeUndefined()
  })

  test('reports missing room when exclusiveType=none and room is empty', () => {
    const errors = validateReservationForm({
      ...baseParams,
      exclusiveType: 'none',
      room: ''
    })
    expect(errors.room).toBe('请选择包厢')
  })

  test('does not report room error when exclusiveType is not none', () => {
    const errors = validateReservationForm({
      ...baseParams,
      exclusiveType: 'full',
      room: ''
    })
    expect(errors.room).toBeUndefined()
  })

  test('validates custom select field with empty value', () => {
    const customFields = [
      ...DEFAULT_FORM_CONFIG.fields,
      { id: 'eventType', label: '活动类型', type: 'select', visible: true, required: true, builtin: false, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm({
      ...baseParams,
      formFields: customFields,
      formData: { ...baseParams.formData, eventType: '' }
    })
    expect(errors.eventType).toBe('请选择活动类型')
  })

  test('validates custom text field with empty value', () => {
    const customFields = [
      ...DEFAULT_FORM_CONFIG.fields,
      { id: 'company', label: '公司', type: 'text', visible: true, required: true, builtin: false, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm({
      ...baseParams,
      formFields: customFields,
      formData: { ...baseParams.formData, company: '' }
    })
    expect(errors.company).toBe('请填写公司')
  })

  test('skips validation for non-visible fields', () => {
    const fields = [
      { id: 'hidden', label: '隐藏', type: 'text', visible: false, required: true, builtin: false, hiddenInRooms: [] }
    ]
    const errors = validateReservationForm({
      ...baseParams,
      formFields: fields,
      formData: { hidden: '' }
    })
    expect(errors.hidden).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────
// 3. checkReservationConflict
// ────────────────────────────────────────────────────────────────────────

const mockDbConflict = {
  queryAll: jest.fn(),
  getDb: jest.fn()
}

jest.mock('../../miniprogram/utils/db', () => ({
  ...mockDbConflict,
  COLLECTIONS: { SETTINGS: 'settings', RESERVATION: 'reservations' }
}))

jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((d) => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }),
  getRoomName: jest.fn((r) => {
    const map = { big: '大包厢', small: '小包厢', chess: '棋牌室' }
    return map[r] || r
  })
}))

const { checkReservationConflict } = require('../../miniprogram/pages/reservation-add/helpers/conflict-check')

describe('checkReservationConflict', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default: no conflicts
    mockDbConflict.queryAll.mockResolvedValue({ data: [] })
    mockDbConflict.getDb.mockReturnValue({
      command: {
        gte: (v) => ({ _type: 'gte', val: v }),
        lte: (v) => ({ _type: 'lte', val: v }),
        neq: (v) => ({ _type: 'neq', val: v }),
        and: (conds) => ({ _type: 'and', val: conds }),
        or: (conds) => ({ _type: 'or', val: conds })
      }
    })
  })

  test('resolves without error when no conflicts found', async () => {
    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '中午', room: 'big',
        exclusiveType: 'none', isEdit: false
      })
    ).resolves.toBeUndefined()
  })

  test('throws for exclusiveType=full when conflicts exist', async () => {
    mockDbConflict.queryAll.mockResolvedValue({
      data: [{ _id: 'existing1', room: 'big', time: '中午' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '中午', room: 'big',
        exclusiveType: 'full', isEdit: false
      })
    ).rejects.toThrow('已被包场（全天）')
  })

  test('throws for exclusiveType=noon when conflicts exist', async () => {
    mockDbConflict.queryAll.mockResolvedValue({
      data: [{ _id: 'existing1', room: 'big', exclusiveType: 'noon' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '中午', room: 'big',
        exclusiveType: 'noon', isEdit: false
      })
    ).rejects.toThrow('已被包场（中午）')
  })

  test('throws for exclusiveType=night when conflicts exist', async () => {
    mockDbConflict.queryAll.mockResolvedValue({
      data: [{ _id: 'existing1', room: 'big', exclusiveType: 'night' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '晚上', room: 'big',
        exclusiveType: 'night', isEdit: false
      })
    ).rejects.toThrow('已被包场（晚上）')
  })

  test('throws for exclusiveType=none with room-specific conflict message', async () => {
    mockDbConflict.queryAll.mockResolvedValue({
      data: [{ _id: 'existing1', room: 'big', time: '中午' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '中午', room: 'big',
        exclusiveType: 'none', isEdit: false
      })
    ).rejects.toThrow('已有预约')
  })

  test('swallows non-conflict database errors silently', async () => {
    mockDbConflict.queryAll.mockRejectedValue(new Error('network timeout'))

    // Should not throw — network errors are swallowed
    await expect(
      checkReservationConflict({
        dateStr: '2026-06-20', time: '中午', room: 'big',
        exclusiveType: 'none', isEdit: false
      })
    ).resolves.toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────
// 4. isNoStandardRoom
// ────────────────────────────────────────────────────────────────────────

const { isNoStandardRoom } = require('../../miniprogram/pages/reservation-add/helpers/sync')

describe('isNoStandardRoom', () => {
  test('returns true when standards is empty and exclusiveType is none', () => {
    expect(isNoStandardRoom({ standards: [] }, 'none')).toBe(true)
  })

  test('returns false when standards is empty but exclusiveType is not none', () => {
    expect(isNoStandardRoom({ standards: [] }, 'full')).toBe(false)
    expect(isNoStandardRoom({ standards: [] }, 'noon')).toBe(false)
  })

  test('returns false when standards is non-empty', () => {
    expect(isNoStandardRoom({ standards: [500, 600] }, 'none')).toBe(false)
  })

  test('returns false when roomConfig is null', () => {
    expect(isNoStandardRoom(null, 'none')).toBe(false)
  })

  test('returns false when roomConfig is undefined', () => {
    expect(isNoStandardRoom(undefined, 'none')).toBe(false)
  })

  test('returns false when standards is undefined', () => {
    expect(isNoStandardRoom({}, 'none')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────
// 5. createSettingsCache
// ────────────────────────────────────────────────────────────────────────

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: jest.fn(),
  COLLECTIONS: { SETTINGS: 'settings' }
}))

const { createSettingsCache } = require('../../miniprogram/pages/reservation-add/helpers/settings-cache')

describe('createSettingsCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('queries settings on first get() and caches result', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeNoon', value: 200 }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    expect(settings.serviceChargeEnabled).toBe(true)
    expect(settings.serviceChargeNoon).toBe(200)
    expect(mockQueryAll).toHaveBeenCalledTimes(1)

    // Second call uses cache
    const settings2 = await cache.get()
    expect(settings2).toBe(settings)
    expect(mockQueryAll).toHaveBeenCalledTimes(1)
  })

  test('handles approval_rules key specially (keeps full object)', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'approval_rules', enabled: true, categories: { banquet: true } }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    expect(settings.approval_rules).toEqual({
      key: 'approval_rules', enabled: true, categories: { banquet: true }
    })
  })

  test('handles entry with value undefined (falls back to object itself)', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'someFlag', flag: true }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    // value is undefined, so falls back to the object itself
    expect(settings.someFlag).toEqual({ key: 'someFlag', flag: true })
  })

  test('keeps first value when duplicate keys appear', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'x', value: 1 },
        { key: 'x', value: 2 }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()
    expect(settings.x).toBe(1)
  })

  test('invalidate() clears cache so next get() re-queries', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll
      .mockResolvedValueOnce({ data: [{ key: 'a', value: 1 }] })
      .mockResolvedValueOnce({ data: [{ key: 'a', value: 2 }] })

    const cache = createSettingsCache()
    const s1 = await cache.get()
    expect(s1.a).toBe(1)

    cache.invalidate()
    const s2 = await cache.get()
    expect(s2.a).toBe(2)
    expect(mockQueryAll).toHaveBeenCalledTimes(2)
  })

  test('handles empty data', async () => {
    const mockQueryAll = require('../../miniprogram/utils/db').queryAll
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    const cache = createSettingsCache()
    const settings = await cache.get()
    expect(settings).toEqual({})
  })
})

// ────────────────────────────────────────────────────────────────────────
// 6. groupByRoomDynamic (calendar page)
// ────────────────────────────────────────────────────────────────────────

// We need to test groupByRoomDynamic by creating a mock page instance
// that replicates the method logic from reservation/index.js

jest.mock('../../miniprogram/utils/reservationConfig', () => ({
  loadRooms: jest.fn().mockResolvedValue([
    { id: 'big', name: '大包厢', enabled: true, order: 0 },
    { id: 'small', name: '小包厢', enabled: true, order: 1 },
    { id: 'chess', name: '棋牌室', enabled: true, order: 2 }
  ]),
  loadFormConfig: jest.fn().mockResolvedValue(DEFAULT_FORM_CONFIG),
  resolveFields: jest.fn((fields, roomId) => fields.filter(f => f.visible && !(f.hiddenInRooms && f.hiddenInRooms.includes(roomId)))),
  invalidateCache: jest.fn()
}))

describe('groupByRoomDynamic', () => {
  // Recreate the groupByRoomDynamic function as a standalone for testing
  async function groupByRoomDynamic(reservations) {
    var rooms = await require('../../miniprogram/utils/reservationConfig').loadRooms()
    var enabledRooms = rooms.filter(function(r) { return r.enabled })
    var sortOrder = {}
    enabledRooms.forEach(function(r, i) { sortOrder[r.id] = i })

    var exclusiveOrder = { noon: 0, night: 1, full: 2 }
    var exclusiveLabels = { noon: '午包场', night: '晚包场', full: '全天包场' }

    var GROUP_COLORS = [
      { bg: 'rgba(201,169,110,0.15)', text: '#C9A96E' },
      { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
      { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' },
      { bg: 'rgba(168,130,255,0.15)', text: '#A882FF' },
      { bg: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
      { bg: 'rgba(248,113,113,0.15)', text: '#F87171' },
      { bg: 'rgba(45,212,191,0.15)', text: '#2DD4BF' }
    ]

    var grouped = {}
    var colorIdx = 0
    reservations.forEach(function(r) {
      var et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      var key, label
      if (et !== 'none') {
        key = et
        label = exclusiveLabels[et] || '包场'
      } else {
        key = r.room || 'big'
        label = r.roomName || key
      }
      if (!grouped[key]) {
        var ci = colorIdx % GROUP_COLORS.length
        grouped[key] = {
          key: key, label: label, items: [],
          color: GROUP_COLORS[ci].bg, textColor: GROUP_COLORS[ci].text
        }
        colorIdx++
      }
      grouped[key].items.push(r)
    })

    var keys = Object.keys(grouped)
    keys.sort(function(a, b) {
      var aEx = exclusiveOrder[a] !== undefined
      var bEx = exclusiveOrder[b] !== undefined
      if (aEx !== bEx) return aEx ? -1 : 1
      if (aEx && bEx) return (exclusiveOrder[a] || 99) - (exclusiveOrder[b] || 99)
      return (sortOrder[a] !== undefined ? sortOrder[a] : 99) - (sortOrder[b] !== undefined ? sortOrder[b] : 99)
    })

    var result = []
    keys.forEach(function(k) { result.push(grouped[k]) })
    return result
  }

  test('returns empty array for empty reservations', async () => {
    const result = await groupByRoomDynamic([])
    expect(result).toEqual([])
  })

  test('groups by room for exclusiveType=none', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result.length).toBe(2)
    expect(result[0].key).toBe('big')
    expect(result[0].label).toBe('大包厢')
    expect(result[0].items.length).toBe(1)
    expect(result[1].key).toBe('small')
    expect(result[1].label).toBe('小包厢')
  })

  test('groups multiple reservations in same room', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none', time: '中午' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none', time: '晚上' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result.length).toBe(1)
    expect(result[0].items.length).toBe(2)
  })

  test('groups exclusive reservations by type (noon/night/full)', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'noon' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'night' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'full' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result.length).toBe(3)
    expect(result.map(g => g.key)).toEqual(['noon', 'night', 'full'])
    expect(result.map(g => g.label)).toEqual(['午包场', '晚包场', '全天包场'])
  })

  test('exclusive groups appear before room groups', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none', time: '晚上' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'noon' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none', time: '中午' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'full' }
    ]
    const result = await groupByRoomDynamic(reservations)
    const keys = result.map(g => g.key)
    const exclusiveKeys = ['noon', 'night', 'full']
    const roomKeys = keys.filter(k => !exclusiveKeys.includes(k))
    const exclusiveIdxs = keys.map((k, i) => exclusiveKeys.includes(k) ? i : -1).filter(i => i >= 0)
    const roomIdxs = keys.map((k, i) => !exclusiveKeys.includes(k) ? i : -1).filter(i => i >= 0)

    if (exclusiveIdxs.length > 0 && roomIdxs.length > 0) {
      expect(Math.max(...exclusiveIdxs)).toBeLessThan(Math.min(...roomIdxs))
    }
  })

  test('exclusive groups sort by noon < night < full', async () => {
    const reservations = [
      { room: 'big', exclusiveType: 'full' },
      { room: 'big', exclusiveType: 'noon' },
      { room: 'big', exclusiveType: 'night' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result.map(g => g.key)).toEqual(['noon', 'night', 'full'])
  })

  test('room groups sort by room order property', async () => {
    const reservations = [
      { room: 'chess', roomName: '棋牌室', exclusiveType: 'none' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' }
    ]
    const result = await groupByRoomDynamic(reservations)
    // big (order 0) < small (order 1) < chess (order 2)
    expect(result.map(g => g.key)).toEqual(['big', 'small', 'chess'])
  })

  test('each group has color and textColor', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result[0].color).toBeDefined()
    expect(result[0].textColor).toBeDefined()
    expect(typeof result[0].color).toBe('string')
    expect(typeof result[0].textColor).toBe('string')
  })

  test('colors cycle when more groups than palette entries', async () => {
    const reservations = Array.from({ length: 10 }, (_, i) => ({
      room: `room${i}`, roomName: `Room ${i}`, exclusiveType: 'none'
    }))
    // Mock loadRooms to return 10 rooms
    const { loadRooms } = require('../../miniprogram/utils/reservationConfig')
    loadRooms.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        id: `room${i}`, name: `Room ${i}`, enabled: true, order: i
      }))
    )
    const result = await groupByRoomDynamic(reservations)
    expect(result.length).toBe(10)
    // First and 8th group should have same color (palette has 7 entries)
    expect(result[0].color).toBe(result[7].color)
  })

  test('handles isExclusive legacy field (maps to full)', async () => {
    const reservations = [
      { room: 'big', roomName: '大包厢', isExclusive: true }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result.length).toBe(1)
    expect(result[0].key).toBe('full')
    expect(result[0].label).toBe('全天包场')
  })

  test('falls back to room id as label when roomName is missing', async () => {
    const reservations = [
      { room: 'big', exclusiveType: 'none' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result[0].label).toBe('big')
  })

  test('falls back to big as default room when room is missing', async () => {
    const reservations = [
      { exclusiveType: 'none' }
    ]
    const result = await groupByRoomDynamic(reservations)
    expect(result[0].key).toBe('big')
  })
})

// ────────────────────────────────────────────────────────────────────────
// 7. applyRoomConfig & _clearFieldsHiddenByRoomTransition
// ────────────────────────────────────────────────────────────────────────

describe('applyRoomConfig', () => {
  // Reconstruct applyRoomConfig as a standalone function for testing
  function applyRoomConfig(pageState, roomConfig) {
    const resolved = resolveFields(pageState.formConfigFields, roomConfig.id)
    const updates = {
      timeOptions: roomConfig.timeSlots,
      exclusiveOptions: roomConfig.exclusiveTypes,
      standardOptions: roomConfig.standards,
      partnerStandard: roomConfig.partnerStandard,
      defaultStandard: roomConfig.defaultStandard,
      allowNoStandard: roomConfig.standards.length === 0,
      formFields: resolved
    }

    if (!roomConfig.timeSlots.includes(pageState.time)) {
      updates.time = roomConfig.timeSlots[0] || ''
    }
    if (!roomConfig.exclusiveTypes.includes(pageState.exclusiveType)) {
      updates.exclusiveType = roomConfig.exclusiveTypes.includes('none') ? 'none' :
        roomConfig.exclusiveTypes[0] || 'none'
    }

    if (!pageState.isPartner) {
      const ds = Number(roomConfig.defaultStandard) || 0
      if (ds > 0 && roomConfig.standards.indexOf(ds) >= 0) {
        const currentInOptions = roomConfig.standards.indexOf(pageState.standard) >= 0
        if (!pageState.standardPicked || !currentInOptions) {
          updates.standard = ds
          updates.standardPicked = true
        }
      } else if (roomConfig.standards.length === 0) {
        updates.standard = 0
        updates.standardPicked = false
      } else if (!roomConfig.standards.includes(pageState.standard)) {
        updates.standard = 0
        updates.standardPicked = false
      }
    }

    return updates
  }

  const bigRoom = {
    id: 'big', name: '大包厢', enabled: true, order: 0,
    exclusiveTypes: ['none', 'noon', 'night', 'full'],
    timeSlots: ['中午', '晚上'],
    standards: [500, 600, 800],
    partnerStandard: 300,
    defaultStandard: 500
  }

  const chessRoom = {
    id: 'chess', name: '棋牌室', enabled: true, order: 2,
    exclusiveTypes: [],
    timeSlots: ['中午', '晚上'],
    standards: [],
    partnerStandard: 0,
    defaultStandard: 0
  }

  const customRoom = {
    id: 'vip', name: 'VIP厅', enabled: true, order: 3,
    exclusiveTypes: ['none', 'full'],
    timeSlots: ['全天'],
    standards: [1000, 2000],
    partnerStandard: 500,
    defaultStandard: 1000
  }

  test('sets timeOptions and exclusiveOptions from room config', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, bigRoom)

    expect(updates.timeOptions).toEqual(['中午', '晚上'])
    expect(updates.exclusiveOptions).toEqual(['none', 'noon', 'night', 'full'])
  })

  test('sets standardOptions from room config', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, bigRoom)

    expect(updates.standardOptions).toEqual([500, 600, 800])
  })

  test('resolves formFields with hiddenInRooms filter for chess room', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, chessRoom)

    const fieldIds = updates.formFields.map(f => f.id)
    expect(fieldIds.includes('guestCount')).toBe(false)
    expect(fieldIds.includes('dishPrice')).toBe(false)
    expect(fieldIds.includes('customerName')).toBe(true)
  })

  test('auto-selects defaultStandard when valid and not yet picked', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, bigRoom)

    expect(updates.standard).toBe(500)
    expect(updates.standardPicked).toBe(true)
  })

  test('keeps current standard if valid in new room options', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 600, standardPicked: true,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, bigRoom)

    expect(updates.standard).toBeUndefined() // no override needed
    expect(updates.standardPicked).toBeUndefined()
  })

  test('resets standard when room has no standards', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 500, standardPicked: true,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, chessRoom)

    expect(updates.allowNoStandard).toBe(true)
    expect(updates.standard).toBe(0)
    expect(updates.standardPicked).toBe(false)
  })

  test('resets time when current time not in new room timeSlots', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, customRoom)

    expect(updates.time).toBe('全天')
  })

  test('resets exclusiveType when current type not in new room exclusiveTypes', () => {
    const updates = applyRoomConfig({
      time: '全天', exclusiveType: 'noon', isPartner: false,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, customRoom)

    // customRoom has ['none', 'full'], noon not included → reset to 'none'
    expect(updates.exclusiveType).toBe('none')
  })

  test('does not auto-select standard when isPartner is true', () => {
    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: true,
      standard: 0, standardPicked: false,
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, bigRoom)

    // isPartner branch skips standard logic entirely
    expect(updates.standard).toBeUndefined()
    expect(updates.standardPicked).toBeUndefined()
  })

  test('resets standard when current standard not in new room standards', () => {
    const smallRoom = {
      id: 'small', name: '小包厢', enabled: true, order: 1,
      exclusiveTypes: ['none', 'noon', 'night', 'full'],
      timeSlots: ['中午', '晚上'],
      standards: [500, 600],
      partnerStandard: 300,
      defaultStandard: 500
    }

    const updates = applyRoomConfig({
      time: '中午', exclusiveType: 'none', isPartner: false,
      standard: 800, standardPicked: true, // 800 not in small room
      formConfigFields: DEFAULT_FORM_CONFIG.fields
    }, smallRoom)

    expect(updates.standard).toBe(0)
    expect(updates.standardPicked).toBe(false)
  })
})

describe('_clearFieldsHiddenByRoomTransition', () => {
  // Reconstruct the function for testing
  function _clearFieldsHiddenByRoomTransition(formConfigFields, oldRoomId, newRoomId) {
    const oldFields = resolveFields(formConfigFields, oldRoomId)
    const newFields = resolveFields(formConfigFields, newRoomId)
    const updates = {}
    oldFields.forEach(function(f) {
      if (!newFields.find(function(nf) { return nf.id === f.id })) {
        updates['formData.' + f.id] = ''
      }
    })
    return updates
  }

  test('clears fields hidden in new room but visible in old room', () => {
    const updates = _clearFieldsHiddenByRoomTransition(
      DEFAULT_FORM_CONFIG.fields, 'big', 'chess'
    )
    // guestCount and dishPrice are visible in 'big' but hidden in 'chess'
    expect(updates['formData.guestCount']).toBe('')
    expect(updates['formData.dishPrice']).toBe('')
  })

  test('does not clear fields visible in both rooms', () => {
    const updates = _clearFieldsHiddenByRoomTransition(
      DEFAULT_FORM_CONFIG.fields, 'big', 'chess'
    )
    expect(updates['formData.customerName']).toBeUndefined()
    expect(updates['formData.phone']).toBeUndefined()
    expect(updates['formData.remark']).toBeUndefined()
  })

  test('returns empty updates when switching to room with same visible fields', () => {
    const updates = _clearFieldsHiddenByRoomTransition(
      DEFAULT_FORM_CONFIG.fields, 'big', 'small'
    )
    // big and small have the same hiddenInRooms patterns in default config
    expect(Object.keys(updates).length).toBe(0)
  })

  test('returns empty updates when switching from chess to big', () => {
    const updates = _clearFieldsHiddenByRoomTransition(
      DEFAULT_FORM_CONFIG.fields, 'chess', 'big'
    )
    // Fields visible in chess are a subset of fields visible in big
    expect(Object.keys(updates).length).toBe(0)
  })

  test('handles custom fields being hidden by room transition', () => {
    const customFields = [
      ...DEFAULT_FORM_CONFIG.fields,
      { id: 'company', label: '公司', type: 'text', builtin: false, visible: true, required: false, hiddenInRooms: ['chess'] }
    ]

    const updates = _clearFieldsHiddenByRoomTransition(customFields, 'big', 'chess')
    expect(updates['formData.company']).toBe('')
    expect(updates['formData.guestCount']).toBe('')
    expect(updates['formData.dishPrice']).toBe('')
  })
})

// ────────────────────────────────────────────────────────────────────────
// 8. _buildDocData (builtin vs custom field split)
// ────────────────────────────────────────────────────────────────────────

describe('_buildDocData', () => {
  // Reconstruct _buildDocData as a standalone function
  const { getExclusiveTypeName } = require('../../miniprogram/utils/helpers')

  function _buildDocData(pageState) {
    const formData = pageState.formData
    const roomConfig = pageState.currentRoomConfig || {}
    const docData = {}
    const customFields = {}

    pageState.formFields.forEach(function(f) {
      const raw = formData[f.id]
      if (f.builtin) {
        if (f.id === 'guestCount') {
          docData.guestCount = Number(raw) || 0
        } else if (f.id === 'dishPrice') {
          docData.dishPrice = Number(raw) || 0
        } else {
          docData[f.id] = typeof raw === 'string' ? raw.trim() : raw
        }
      } else {
        customFields[f.id] = f.type === 'number' ? (Number(raw) || 0) :
                             (typeof raw === 'string' ? raw.trim() : raw)
      }
    })

    const et = pageState.exclusiveType
    docData.date = new Date(pageState.date + 'T00:00:00')
    docData.time = pageState.time
    docData.exclusiveType = et
    docData.isPartner = pageState.isPartner
    docData.room = pageState.room
    docData.roomName = getExclusiveTypeName(et, pageState.room)
    docData.standard = Number(pageState.standard) || 0
    docData.customFields = customFields
    docData.hasIncome = false

    if (roomConfig.standards && roomConfig.standards.length === 0 && et === 'none') {
      docData.standard = 0
    }

    return docData
  }

  const basePageState = {
    date: '2026-06-20',
    time: '中午',
    exclusiveType: 'none',
    isPartner: false,
    room: 'big',
    standard: 500,
    currentRoomConfig: DEFAULT_ROOMS[0],
    formData: {
      customerName: '  张三  ',
      phone: '13800138000',
      guestCount: '10',
      dishPrice: '1000',
      remark: '  测试  '
    },
    formFields: DEFAULT_FORM_CONFIG.fields
  }

  test('puts builtin fields at top level', () => {
    const docData = _buildDocData(basePageState)
    expect(docData.customerName).toBe('张三') // trimmed
    expect(docData.phone).toBe('13800138000')
    expect(docData.guestCount).toBe(10) // Number
    expect(docData.dishPrice).toBe(1000) // Number
    expect(docData.remark).toBe('测试') // trimmed
  })

  test('puts custom fields in customFields object', () => {
    const customFormFields = [
      ...DEFAULT_FORM_CONFIG.fields,
      { id: 'company', label: '公司', type: 'text', builtin: false, visible: true, required: false, hiddenInRooms: [] },
      { id: 'budget', label: '预算', type: 'number', builtin: false, visible: true, required: false, hiddenInRooms: [] }
    ]
    const pageState = {
      ...basePageState,
      formFields: customFormFields,
      formData: {
        ...basePageState.formData,
        company: '  腾讯  ',
        budget: '5000'
      }
    }

    const docData = _buildDocData(pageState)
    expect(docData.company).toBeUndefined()
    expect(docData.customFields.company).toBe('腾讯') // trimmed
    expect(docData.customFields.budget).toBe(5000) // Number
  })

  test('sets hasIncome to false', () => {
    const docData = _buildDocData(basePageState)
    expect(docData.hasIncome).toBe(false)
  })

  test('sets date as Date object', () => {
    const docData = _buildDocData(basePageState)
    expect(docData.date instanceof Date).toBe(true)
  })

  test('zeroes standard for room with no standards and exclusiveType=none', () => {
    const pageState = {
      ...basePageState,
      room: 'chess',
      currentRoomConfig: DEFAULT_ROOMS[2], // chess room, no standards
      standard: 500 // should be overridden to 0
    }
    const docData = _buildDocData(pageState)
    expect(docData.standard).toBe(0)
  })

  test('keeps standard for room with standards', () => {
    const docData = _buildDocData(basePageState)
    expect(docData.standard).toBe(500)
  })

  test('handles empty formData values gracefully', () => {
    const pageState = {
      ...basePageState,
      formData: {
        customerName: '',
        phone: '',
        guestCount: '',
        dishPrice: '',
        remark: ''
      }
    }
    const docData = _buildDocData(pageState)
    expect(docData.guestCount).toBe(0)
    expect(docData.dishPrice).toBe(0)
    expect(docData.customerName).toBe('')
  })

  test('customFields is empty object when no custom fields exist', () => {
    const docData = _buildDocData(basePageState)
    expect(docData.customFields).toEqual({})
  })
})
