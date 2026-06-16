/**
 * Unit tests for reservationConfig cache module
 */

// Mock db module BEFORE requiring reservationConfig
const mockQueryAll = jest.fn()
jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  COLLECTIONS: { SETTINGS: 'settings' }
}))

const {
  loadRooms, loadFormConfig, invalidateCache,
  _getRoomsCache, resolveFields,
  DEFAULT_ROOMS, DEFAULT_FORM_CONFIG
} = require('../../miniprogram/utils/reservationConfig')

describe('reservationConfig', () => {
  beforeEach(() => {
    invalidateCache()
    mockQueryAll.mockReset()
  })

  // ── loadRooms ────────────────────────────────────────────────────

  describe('loadRooms', () => {
    test('returns rooms from DB on first call', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'vip', name: 'VIP厅' }] }]
      })
      const rooms = await loadRooms()
      expect(rooms).toEqual([{ id: 'vip', name: 'VIP厅' }])
      expect(mockQueryAll).toHaveBeenCalledTimes(1)
    })

    test('returns cached value on second call (no DB query)', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'big', name: '大包厢' }] }]
      })
      const r1 = await loadRooms()
      const r2 = await loadRooms()
      expect(r2).toBe(r1) // same reference → cache hit
      expect(mockQueryAll).toHaveBeenCalledTimes(1)
    })

    test('returns DEFAULT_ROOMS when DB returns empty array', async () => {
      mockQueryAll.mockResolvedValueOnce({ data: [] })
      const rooms = await loadRooms()
      expect(rooms).toBe(DEFAULT_ROOMS)
    })

    test('returns DEFAULT_ROOMS when DB throws', async () => {
      mockQueryAll.mockRejectedValueOnce(new Error('network failure'))
      const rooms = await loadRooms()
      expect(rooms).toBe(DEFAULT_ROOMS)
    })

    test('returns DEFAULT_ROOMS when value is null', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: null }]
      })
      const rooms = await loadRooms()
      expect(rooms).toBe(DEFAULT_ROOMS)
    })
  })

  // ── loadFormConfig ───────────────────────────────────────────────

  describe('loadFormConfig', () => {
    test('returns form config from DB', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_form_config', value: { fields: [{ id: 'x' }] } }]
      })
      const config = await loadFormConfig()
      expect(config).toEqual({ fields: [{ id: 'x' }] })
    })

    test('returns cached value on second call', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_form_config', value: { fields: [] } }]
      })
      const c1 = await loadFormConfig()
      const c2 = await loadFormConfig()
      expect(c2).toBe(c1)
      expect(mockQueryAll).toHaveBeenCalledTimes(1)
    })

    test('returns DEFAULT_FORM_CONFIG when DB returns nothing', async () => {
      mockQueryAll.mockResolvedValueOnce({ data: [] })
      const config = await loadFormConfig()
      expect(config).toBe(DEFAULT_FORM_CONFIG)
    })

    test('returns DEFAULT_FORM_CONFIG when DB throws', async () => {
      mockQueryAll.mockRejectedValueOnce(new Error('timeout'))
      const config = await loadFormConfig()
      expect(config).toBe(DEFAULT_FORM_CONFIG)
    })
  })

  // ── invalidateCache ──────────────────────────────────────────────

  describe('invalidateCache', () => {
    test('clears rooms cache so next loadRooms hits DB again', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'test1' }] }]
      })
      await loadRooms()
      invalidateCache()
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'test2' }] }]
      })
      const rooms = await loadRooms()
      expect(rooms).toEqual([{ id: 'test2' }])
      expect(mockQueryAll).toHaveBeenCalledTimes(2)
    })

    test('clears formConfig cache', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_form_config', value: { fields: [{ id: 'a' }] } }]
      })
      await loadFormConfig()
      invalidateCache()
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_form_config', value: { fields: [{ id: 'b' }] } }]
      })
      const config = await loadFormConfig()
      expect(config.fields).toEqual([{ id: 'b' }])
    })
  })

  // ── _getRoomsCache ───────────────────────────────────────────────

  describe('_getRoomsCache', () => {
    test('returns null before any loadRooms call', () => {
      expect(_getRoomsCache()).toBeNull()
    })

    test('returns cached rooms after loadRooms', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'big', name: '大包厢' }] }]
      })
      await loadRooms()
      expect(_getRoomsCache()).toEqual([{ id: 'big', name: '大包厢' }])
    })

    test('returns null after invalidateCache', async () => {
      mockQueryAll.mockResolvedValueOnce({
        data: [{ key: 'reservation_rooms', value: [{ id: 'big', name: '大包厢' }] }]
      })
      await loadRooms()
      invalidateCache()
      expect(_getRoomsCache()).toBeNull()
    })
  })

  // ── resolveFields ────────────────────────────────────────────────

  describe('resolveFields', () => {
    const fields = [
      { id: 'a', visible: true,  required: true,  hiddenInRooms: [] },
      { id: 'b', visible: false, required: false, hiddenInRooms: [] },
      { id: 'c', visible: true,  required: false, hiddenInRooms: ['chess'] },
      { id: 'd', visible: true,  required: true,  hiddenInRooms: ['big', 'chess'] }
    ]

    test('shows visible fields not hidden in the given room', () => {
      const result = resolveFields(fields, 'big')
      expect(result.map(f => f.id)).toEqual(['a', 'c'])
    })

    test('hides fields with matching hiddenInRooms', () => {
      const result = resolveFields(fields, 'chess')
      expect(result.map(f => f.id)).toEqual(['a'])
    })

    test('shows all visible fields when room has no exclusions', () => {
      const result = resolveFields(fields, 'small')
      expect(result.map(f => f.id)).toEqual(['a', 'c', 'd'])
    })

    test('excludes non-visible fields even if not hidden', () => {
      const result = resolveFields(fields, 'big')
      expect(result.find(f => f.id === 'b')).toBeUndefined()
    })

    test('handles undefined hiddenInRooms gracefully', () => {
      const fieldsNoHidden = [
        { id: 'x', visible: true, required: false }
      ]
      const result = resolveFields(fieldsNoHidden, 'any')
      expect(result.map(f => f.id)).toEqual(['x'])
    })
  })

  // ── DEFAULT constants ────────────────────────────────────────────

  describe('DEFAULT_ROOMS', () => {
    test('has big/small/chess with correct ids', () => {
      const ids = DEFAULT_ROOMS.map(r => r.id)
      expect(ids).toEqual(['big', 'small', 'chess'])
    })

    test('all rooms are enabled by default', () => {
      DEFAULT_ROOMS.forEach(r => {
        expect(r.enabled).toBe(true)
      })
    })

    test('big room has 3 standards', () => {
      expect(DEFAULT_ROOMS[0].standards).toEqual([500, 600, 800])
    })

    test('chess room has no exclusive types', () => {
      expect(DEFAULT_ROOMS[2].exclusiveTypes).toEqual([])
    })
  })

  describe('DEFAULT_FORM_CONFIG', () => {
    test('has 5 builtin fields', () => {
      const builtins = DEFAULT_FORM_CONFIG.fields.filter(f => f.builtin)
      expect(builtins.map(f => f.id)).toEqual([
        'customerName', 'phone', 'guestCount', 'dishPrice', 'remark'
      ])
    })

    test('guestCount is hidden in chess room', () => {
      const guestCount = DEFAULT_FORM_CONFIG.fields.find(f => f.id === 'guestCount')
      expect(guestCount.hiddenInRooms).toEqual(['chess'])
    })

    test('no custom fields by default', () => {
      const custom = DEFAULT_FORM_CONFIG.fields.filter(f => !f.builtin)
      expect(custom).toEqual([])
    })
  })
})
