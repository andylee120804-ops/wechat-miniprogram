const mockCallFunction = jest.fn(() => Promise.resolve({ result: { success: true, data: [] } }))

const mockApp = {
  globalData: {
    userInfo: { _id: 'u1', wechatId: 'coffee', name: '管理员' }
  }
}

global.wx = {
  cloud: {
    callFunction: mockCallFunction
  }
}

global.getApp = jest.fn(() => mockApp)

const reservationChange = require('../../miniprogram/utils/reservation-change')

describe('reservation-change filtering', () => {
  test('keeps unread important changes for today and tomorrow (including cancelled)', () => {
    const changes = [
      { _id: '1', important: true, reservationDate: '2026-06-19', ackUsers: [], changeType: 'amount_changed', summary: 'today', createdAt: '2026-06-19 10:00' },
      { _id: '2', important: true, reservationDate: '2026-06-20', ackUsers: [], changeType: 'amount_changed', summary: 'tomorrow', createdAt: '2026-06-19 11:00' },
      { _id: '3', important: true, reservationDate: '2026-06-21', ackUsers: [], changeType: 'amount_changed', summary: 'later', createdAt: '2026-06-19 12:00' },
      { _id: '4', important: false, reservationDate: '2026-06-19', ackUsers: [], changeType: 'amount_changed', summary: 'normal', createdAt: '2026-06-19 13:00' },
      { _id: '5', important: true, reservationDate: '2026-06-19', ackUsers: ['u1'], changeType: 'amount_changed', summary: 'read', createdAt: '2026-06-19 14:00' },
      { _id: '6', important: true, changeType: 'cancelled', reservationDate: '2026-06-19', ackUsers: [], summary: 'cancelled today', createdAt: '2026-06-19 15:00' }
    ]

    const result = reservationChange.filterUnreadImportantChanges(changes, 'u1', '2026-06-19')

    expect(result.map(item => item._id)).toEqual(['6', '2', '1'])
  })
})

describe('reservation-change reminder title', () => {
  test('returns "今天预约变动" for today non-cancelled change', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-20', summary: '今天变动', changeType: 'amount_changed' }
    ], '2026-06-20')

    expect(title).toBe('今天预约变动')
  })

  test('returns "今天预约取消" for cancelled-only today change', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-20', summary: '今天取消', changeType: 'cancelled' }
    ], '2026-06-20')

    expect(title).toBe('今天预约取消')
  })

  test('returns "今天预约变动" when today has both cancelled and other changes', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-20', summary: '今天取消', changeType: 'cancelled' },
      { reservationDate: '2026-06-20', summary: '今天金额变动', changeType: 'amount_changed' }
    ], '2026-06-20')

    expect(title).toBe('今天预约变动')
  })

  test('returns "明天预约变动" for tomorrow non-cancelled change', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-21', summary: '明天变动', changeType: 'amount_changed' }
    ], '2026-06-20')

    expect(title).toBe('明天预约变动')
  })

  test('returns "明天预约取消" for cancelled-only tomorrow change', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-21', summary: '明天取消', changeType: 'cancelled' }
    ], '2026-06-20')

    expect(title).toBe('明天预约取消')
  })

  test('prioritizes today title over tomorrow', () => {
    const title = reservationChange.getReservationChangeReminderTitle([
      { reservationDate: '2026-06-21', summary: '明天变动', changeType: 'amount_changed' },
      { reservationDate: '2026-06-20', summary: '今天变动', changeType: 'amount_changed' }
    ], '2026-06-20')

    expect(title).toBe('今天预约变动')
  })

  test('returns "预约变动" for changes without today or tomorrow date', () => {
    const title = reservationChange.getReservationChangeReminderTitle([], '2026-06-20')

    expect(title).toBe('预约变动')
  })
})

describe('reservation-change builders', () => {
  test('builds cancelled change summary', () => {
    const change = reservationChange.buildCancelledChange({
      _id: 'r1', date: '2026-06-19', time: '晚上', roomName: '大包', customerName: '张三', status: 'confirmed'
    }, { _id: 'u1', name: '管理员' })

    expect(change.changeType).toBe('cancelled')
    expect(change.important).toBe(true)
    expect(change.summary).toContain('张三 预约已取消')
    expect(change.operatorName).toBe('管理员')
  })

  test('builds amount changed change for standard and dish price', () => {
    const change = reservationChange.buildAmountChangedChange({
      _id: 'r1', date: '2026-06-19', time: '中午', roomName: '小包', customerName: '李四', standard: 1000, dishPrice: 200
    }, {
      _id: 'r1', date: '2026-06-19', time: '中午', roomName: '小包', customerName: '李四', standard: 1200, dishPrice: 300
    }, { _id: 'u1', name: '管理员' })

    expect(change.changeType).toBe('amount_changed')
    expect(change.summary).toContain('餐标 ¥1,000.00 → ¥1,200.00')
    expect(change.summary).toContain('菜价 ¥200.00 → ¥300.00')
  })
})

describe('reservation-change cloud calls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('marks only provided displayed changes as read through cloud function', async () => {
    await reservationChange.markChangesRead([
      { _id: 'c1' },
      { _id: 'c2' },
      { summary: 'hidden without id' }
    ], 'u1')

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'sendMessage',
      data: {
        action: 'markReservationChangesRead',
        changeIds: ['c1', 'c2'],
        callerWechatId: 'coffee'
      }
    })
  })
})
