/**
 * Unit tests for calendar blocked-date marking logic
 */
const { applyBlockedFlags } = require('../../miniprogram/components/calendar/blocked-mark')

describe('applyBlockedFlags', () => {
  test('marks blocked dates and leaves others untouched', () => {
    const days = [
      { dateStr: '2026-09-01', day: 1, isMarked: false },
      { dateStr: '2026-09-02', day: 2, isMarked: true },
      { dateStr: '2026-09-03', day: 3, isMarked: false }
    ]
    const blocked = [
      { dateStr: '2026-09-02', slots: ['noon', 'night'], reason: '装修' }
    ]

    const result = applyBlockedFlags(days, blocked)

    expect(result[0].isBlocked).toBeUndefined()
    expect(result[1].isBlocked).toBe(true)
    expect(result[2].isBlocked).toBeUndefined()
    expect(result[1].isMarked).toBe(true) // 与已有圆点共存
  })

  test('returns a new array and does not mutate input', () => {
    const days = [{ dateStr: '2026-09-01', day: 1 }]
    const blocked = [{ dateStr: '2026-09-01', slots: ['noon'] }]

    const result = applyBlockedFlags(days, blocked)

    expect(result).not.toBe(days)
    expect(days[0].isBlocked).toBeUndefined()
  })

  test('handles empty inputs', () => {
    expect(applyBlockedFlags([], [{ dateStr: '2026-09-01' }])).toEqual([])
    expect(applyBlockedFlags([{ dateStr: '2026-09-01' }], [])[0].isBlocked).toBeUndefined()
    expect(applyBlockedFlags([{ dateStr: '2026-09-01' }], null)[0].isBlocked).toBeUndefined()
  })

  test('ignores blocked entries without dateStr', () => {
    const days = [{ dateStr: '2026-09-01', day: 1 }]
    const result = applyBlockedFlags(days, [{ slots: ['noon'] }])
    expect(result[0].isBlocked).toBeUndefined()
  })
})
