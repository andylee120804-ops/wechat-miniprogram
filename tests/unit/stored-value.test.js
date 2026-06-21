const storedValue = require('../../cloudfunctions/storedValue/index')

describe('stored value settlement helpers', () => {
  test('calculates full stored-value deduction', () => {
    const result = storedValue.__test__.calculateSettlement(1200, 800)
    expect(result).toEqual({ mode: 'stored_full', deductedAmount: 800, incomeAmount: 0, balanceAfter: 400 })
  })

  test('calculates partial stored-value deduction', () => {
    const result = storedValue.__test__.calculateSettlement(500, 800)
    expect(result).toEqual({ mode: 'stored_partial', deductedAmount: 500, incomeAmount: 300, balanceAfter: 0 })
  })

  test('calculates empty stored-value account as full income', () => {
    const result = storedValue.__test__.calculateSettlement(0, 800)
    expect(result).toEqual({ mode: 'stored_empty', deductedAmount: 0, incomeAmount: 800, balanceAfter: 0 })
  })

  test('builds readable reservation snapshot', () => {
    const snapshot = storedValue.__test__.buildReservationSnapshot({ customerName: '张三', phone: '13800000000', date: '2026-06-20', time: '晚上', roomName: '大包厢' })
    expect(snapshot).toEqual({ customerName: '张三', phone: '13800000000', date: '2026-06-20', time: '晚上', roomName: '大包厢' })
  })
})
