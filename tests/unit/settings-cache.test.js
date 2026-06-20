/**
 * Unit tests for reservation-add/helpers/settings-cache.js
 *
 * Tests the createSettingsCache factory function.
 */

const mockQueryAll = jest.fn()

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  COLLECTIONS: { SETTINGS: 'settings' }
}))

const { createSettingsCache } = require('../../miniprogram/pages/reservation-add/helpers/settings-cache')

describe('createSettingsCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('queries settings on first get() call', async () => {
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
  })

  test('returns cached result on subsequent get() calls', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ key: 'serviceChargeEnabled', value: true }]
    })

    const cache = createSettingsCache()
    const s1 = await cache.get()
    const s2 = await cache.get()

    expect(s2).toBe(s1) // same reference
    expect(mockQueryAll).toHaveBeenCalledTimes(1)
  })

  test('stores approval_rules as full object (not .value)', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'approval_rules', enabled: true, categories: { banquet: true } }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    expect(settings.approval_rules).toEqual({ key: 'approval_rules', enabled: true, categories: { banquet: true } })
  })

  test('handles settings with undefined value by using the object itself', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'someKey', value: undefined, data: 'fallback' }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    // When value is undefined, falls back to the object itself
    expect(settings.someKey).toEqual({ key: 'someKey', value: undefined, data: 'fallback' })
  })

  test('keeps first occurrence when duplicate keys exist', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNoon', value: 999 }
      ]
    })

    const cache = createSettingsCache()
    const settings = await cache.get()

    expect(settings.serviceChargeNoon).toBe(200)
  })

  test('handles empty data', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    const cache = createSettingsCache()
    const settings = await cache.get()

    expect(settings).toEqual({})
  })

  test('invalidate() clears cache so next get() re-queries', async () => {
    mockQueryAll
      .mockResolvedValueOnce({ data: [{ key: 'serviceChargeEnabled', value: true }] })
      .mockResolvedValueOnce({ data: [{ key: 'serviceChargeEnabled', value: false }] })

    const cache = createSettingsCache()
    const s1 = await cache.get()
    expect(s1.serviceChargeEnabled).toBe(true)

    cache.invalidate()

    const s2 = await cache.get()
    expect(s2.serviceChargeEnabled).toBe(false)
    expect(mockQueryAll).toHaveBeenCalledTimes(2)
  })

  test('each cache instance is independent', async () => {
    mockQueryAll
      .mockResolvedValueOnce({ data: [{ key: 'a', value: 1 }] })
      .mockResolvedValueOnce({ data: [{ key: 'b', value: 2 }] })

    const cache1 = createSettingsCache()
    const cache2 = createSettingsCache()

    const s1 = await cache1.get()
    const s2 = await cache2.get()

    expect(s1.a).toBe(1)
    expect(s2.b).toBe(2)
  })
})
