/**
 * Unit tests for reservation-add/helpers/conflict-check.js
 *
 * Tests the checkReservationConflict function that detects time/room
 * conflicts for reservations based on exclusiveType semantics.
 */

const mockQueryAll = jest.fn()
const mockGetDb = jest.fn(() => ({
  command: {
    gte: jest.fn((v) => ({ and: jest.fn((o) => ({ gte_val: v, and_val: o })) })),
    lte: jest.fn((v) => v),
    neq: jest.fn((v) => ({ neq_val: v })),
    or: jest.fn((arr) => ({ or_val: arr })),
    and: jest.fn((arr) => arr)
  }
}))

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  getDb: mockGetDb,
  COLLECTIONS: {
    SETTINGS: 'settings',
    RESERVATION: 'reservation'
  }
}))

jest.mock('../../miniprogram/utils/helpers', () => ({
  getRoomName: jest.fn((room) => {
    const map = { big: '大包厢', small: '小包厢', chess: '棋牌室' }
    return map[room] || room || '未知'
  }),
  createChinaDate: jest.fn((dateStr, hours, minutes, seconds) => ({ dateStr, hours, minutes, seconds }))
}))

const { checkReservationConflict } = require('../../miniprogram/pages/reservation-add/helpers/conflict-check')

describe('checkReservationConflict', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not throw when no conflicts found', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '中午',
        room: 'big',
        exclusiveType: 'none',
        isEdit: false
      })
    ).resolves.toBeUndefined()
  })

  test('throws for exclusiveType=full conflict', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ _id: 'existing1', room: 'big', exclusiveType: 'none' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '中午',
        room: 'big',
        exclusiveType: 'full',
        isEdit: false
      })
    ).rejects.toThrow('该时段已被包场（全天），请更换时间')
  })

  test('throws for exclusiveType=noon conflict', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ _id: 'existing2', room: 'big', time: '中午' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '中午',
        room: 'big',
        exclusiveType: 'noon',
        isEdit: false
      })
    ).rejects.toThrow('该时段已被包场（中午），请更换时间')
  })

  test('throws for exclusiveType=night conflict', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ _id: 'existing3', room: 'big', time: '晚上' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '晚上',
        room: 'big',
        exclusiveType: 'night',
        isEdit: false
      })
    ).rejects.toThrow('该时段已被包场（晚上），请更换时间')
  })

  test('checks all non-cancelled reservations so legacy reserved records still conflict', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    await checkReservationConflict({
      dateStr: '2099-06-01',
      time: '晚上',
      room: 'big',
      exclusiveType: 'night',
      isEdit: false
    })

    const where = mockQueryAll.mock.calls[0][1]
    expect(where[1]).toEqual({ status: { neq_val: 'cancelled' } })
  })

  test('checks night exclusive against any night reservation, not only current room', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    await checkReservationConflict({
      dateStr: '2099-06-01',
      time: '晚上',
      room: 'big',
      exclusiveType: 'night',
      isEdit: false
    })

    const where = mockQueryAll.mock.calls[0][1]
    expect(where[2].or_val).toContainEqual({ time: '晚上' })
    expect(where[2].or_val).not.toContainEqual({ time: '晚上', room: 'big' })
  })

  test('checks normal reservation against full exclusive legacy records in any room', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    await checkReservationConflict({
      dateStr: '2099-06-01',
      time: '晚上',
      room: 'small',
      exclusiveType: 'none',
      isEdit: false
    })

    const where = mockQueryAll.mock.calls[0][1]
    expect(where[2].or_val).toContainEqual({ exclusiveType: 'full' })
    expect(where[2].or_val).toContainEqual({ isExclusive: true })
  })

  test('checks normal reservation against same-slot exclusive in any room', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })

    await checkReservationConflict({
      dateStr: '2099-06-01',
      time: '晚上',
      room: 'small',
      exclusiveType: 'none',
      isEdit: false
    })

    const where = mockQueryAll.mock.calls[0][1]
    expect(where[2].or_val).toContainEqual({ exclusiveType: 'night' })
  })

  test('throws for exclusiveType=none with same room and time', async () => {
    mockQueryAll.mockResolvedValueOnce({
      data: [{ _id: 'existing4', room: 'big', time: '中午' }]
    })

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '中午',
        room: 'big',
        exclusiveType: 'none',
        isEdit: false
      })
    ).rejects.toThrow('已有预约')
  })

  test('throws when conflict check query fails', async () => {
    mockQueryAll.mockRejectedValueOnce(new Error('network failure'))

    await expect(
      checkReservationConflict({
        dateStr: '2099-06-01',
        time: '晚上',
        room: 'big',
        exclusiveType: 'night',
        isEdit: false
      })
    ).rejects.toThrow('预约冲突校验失败，请重试')
  })
})
