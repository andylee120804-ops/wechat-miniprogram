/**
 * Unit tests for miniprogram/utils/blocked-date.js
 */

const mockQueryAll = jest.fn()
const mockUpdateDoc = jest.fn()
const mockAddDoc = jest.fn()

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  updateDoc: mockUpdateDoc,
  addDoc: mockAddDoc,
  COLLECTIONS: {
    BLOCKED_DATE: 'blocked_date'
  }
}))

const {
  getBlockedRecord,
  mergeSlots,
  isSlotBlocked,
  isDateFullyBlocked,
  blockedLabel,
  buildBlockedBanner,
  blockDate
} = require('../../miniprogram/utils/blocked-date')

describe('getBlockedRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns the first matching record for the date', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ date: '2026-10-01', slots: ['noon', 'night'], reason: '国庆' }]
    })

    const record = await getBlockedRecord('2026-10-01')

    expect(mockQueryAll).toHaveBeenCalledWith('blocked_date', { date: '2026-10-01' })
    expect(record.reason).toBe('国庆')
  })

  test('returns null when no record exists', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    const record = await getBlockedRecord('2026-10-02')

    expect(record).toBeNull()
  })
})

describe('mergeSlots', () => {
  test('merges and deduplicates slots', () => {
    expect(mergeSlots(['noon'], ['night'])).toEqual(['noon', 'night'])
    expect(mergeSlots(['noon', 'night'], ['noon'])).toEqual(['noon', 'night'])
    expect(mergeSlots([], ['noon'])).toEqual(['noon'])
    expect(mergeSlots(null, ['noon', 'night'])).toEqual(['noon', 'night'])
  })
})

describe('isSlotBlocked', () => {
  test('中午 maps to noon slot', () => {
    expect(isSlotBlocked({ slots: ['noon'] }, '中午')).toBe(true)
    expect(isSlotBlocked({ slots: ['night'] }, '中午')).toBe(false)
  })

  test('晚上 maps to night slot', () => {
    expect(isSlotBlocked({ slots: ['night'] }, '晚上')).toBe(true)
    expect(isSlotBlocked({ slots: ['noon'] }, '晚上')).toBe(false)
  })

  test('handles missing record or slots', () => {
    expect(isSlotBlocked(null, '中午')).toBe(false)
    expect(isSlotBlocked({ slots: [] }, '中午')).toBe(false)
    expect(isSlotBlocked({}, '中午')).toBe(false)
  })

  test('unknown time maps to neither slot and is not blocked', () => {
    expect(isSlotBlocked({ slots: ['noon', 'night'] }, '下午')).toBe(false)
    expect(isSlotBlocked({ slots: ['noon', 'night'] }, '')).toBe(false)
    expect(isSlotBlocked({ slots: ['noon'] }, '中午')).toBe(true) // 已知时段仍生效
  })
})

describe('isDateFullyBlocked', () => {
  test('true only when both noon and night are blocked', () => {
    expect(isDateFullyBlocked({ slots: ['noon', 'night'] })).toBe(true)
    expect(isDateFullyBlocked({ slots: ['noon'] })).toBe(false)
    expect(isDateFullyBlocked({ slots: ['night'] })).toBe(false)
    expect(isDateFullyBlocked(null)).toBe(false)
  })
})

describe('blockedLabel', () => {
  test('returns 全天 / 中午 / 晚上 / empty', () => {
    expect(blockedLabel({ slots: ['noon', 'night'] })).toBe('全天')
    expect(blockedLabel({ slots: ['noon'] })).toBe('中午')
    expect(blockedLabel({ slots: ['night'] })).toBe('晚上')
    expect(blockedLabel({ slots: [] })).toBe('')
    expect(blockedLabel(null)).toBe('')
  })
})

describe('buildBlockedBanner', () => {
  test('builds banner text with label, reason and operator', () => {
    const text = buildBlockedBanner({
      slots: ['noon', 'night'], reason: '国庆放假', createdByName: '张三'
    })
    expect(text).toBe('本日封禁：全天 · 国庆放假（张三设置）')
  })

  test('omits operator when createdByName missing', () => {
    const text = buildBlockedBanner({ slots: ['noon'], reason: '装修' })
    expect(text).toBe('本日封禁：中午 · 装修')
  })

  test('returns empty string for null record', () => {
    expect(buildBlockedBanner(null)).toBe('')
  })
})

describe('blockDate', () => {
  test('creates a new record when none exists', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })
    mockAddDoc.mockResolvedValueOnce({ _id: 'new-id' })

    const result = await blockDate('2026-10-01', ['noon', 'night'], '国庆', { _id: 'u1', name: '张三' })

    expect(mockAddDoc).toHaveBeenCalledWith('blocked_date', {
      date: '2026-10-01',
      slots: ['noon', 'night'],
      reason: '国庆',
      createdBy: 'u1',
      createdByName: '张三'
    })
    expect(result._id).toBe('new-id')
  })

  test('merges slots into existing record, preserving the first reason', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ _id: 'b1', date: '2026-10-01', slots: ['noon'], reason: '旧原因' }]
    })
    mockUpdateDoc.mockResolvedValueOnce({ updated: 1 })

    await blockDate('2026-10-01', ['night'], '新原因', { _id: 'u1', name: '张三' })

    expect(mockUpdateDoc).toHaveBeenCalledWith('blocked_date', 'b1', {
      slots: ['noon', 'night'],
      reason: '旧原因'
    })
  })
})
