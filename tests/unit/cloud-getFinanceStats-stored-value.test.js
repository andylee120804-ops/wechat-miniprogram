function buildRangeCommand() {
  return {
    gte: jest.fn((value) => ({
      __op: 'gte',
      value,
      and(other) {
        return { __op: 'range', start: value, end: other && other.value }
      }
    })),
    lte: jest.fn((value) => ({ __op: 'lte', value }))
  }
}

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

function formatChinaDate(value) {
  if (!value) return ''
  const shifted = new Date(value.getTime() + CHINA_TIME_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return formatChinaDate(value)
  if (typeof value.toDate === 'function') return formatChinaDate(value.toDate())
  return ''
}

function normalizeComparableValue(value, expected) {
  if (!value) return value
  if (expected instanceof Date) {
    if (value instanceof Date) return value.getTime()
    if (typeof value.toDate === 'function') return value.toDate().getTime()
    return new Date(value).getTime()
  }
  return normalizeDate(value)
}

function matchesWhere(item, where) {
  if (!where) return true
  return Object.keys(where).every((key) => {
    const expected = where[key]
    if (expected && expected.__op === 'range') {
      const actual = normalizeComparableValue(item[key], expected.start)
      const start = expected.start instanceof Date ? expected.start.getTime() : expected.start
      const end = expected.end instanceof Date ? expected.end.getTime() : expected.end
      return actual >= start && actual <= end
    }
    return item[key] === expected
  })
}

function createCollection(name, dataByCollection, collectionCalls) {
  const state = { where: null, skip: 0, limit: dataByCollection[name] ? dataByCollection[name].length : 100 }
  const chain = {
    where: jest.fn((where) => {
      state.where = where
      collectionCalls.push({ name, where })
      return chain
    }),
    limit: jest.fn((limit) => {
      state.limit = limit
      return chain
    }),
    skip: jest.fn((skip) => {
      state.skip = skip
      return chain
    }),
    count: jest.fn(() => {
      const rows = (dataByCollection[name] || []).filter((item) => matchesWhere(item, state.where))
      return Promise.resolve({ total: rows.length })
    }),
    get: jest.fn(() => {
      const rows = (dataByCollection[name] || []).filter((item) => matchesWhere(item, state.where))
      return Promise.resolve({ data: rows.slice(state.skip, state.skip + state.limit) })
    })
  }
  return chain
}

function loadFunction(dataByCollection) {
  jest.resetModules()
  const collectionCalls = []
  const db = {
    command: buildRangeCommand(),
    collection: jest.fn((name) => createCollection(name, dataByCollection, collectionCalls))
  }
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'cloud1-d9gwvttcr864f8021',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: 'openid-admin' }))
  }

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true })

  const mod = require('../../cloudfunctions/getFinanceStats/index.js')
  return { main: mod.main, collectionCalls }
}

describe('getFinanceStats stored value stats', () => {
  test('returns active stored value recharge, consume, and current balance without double counting income', async () => {
    const activeRechargeRows = Array.from({ length: 101 }, (_, index) => ({
      _id: `recharge-${index}`,
      type: 'recharge',
      status: 'active',
      amount: 10,
      createTime: new Date('2026-06-10T10:00:00Z')
    }))

    const { main, collectionCalls } = loadFunction({
      staff: [{ _id: 'staff-admin', role: 'admin', status: 'active', boundOpenid: 'openid-admin' }],
      permissions: [],
      income: [{ _id: 'income-1', date: '2026-06-10', amount: 1010, type: 'other', settlementMode: 'stored_value_recharge' }],
      purchase: [],
      expense: [],
      fixed_expense: [],
      stored_value_transaction: [
        ...activeRechargeRows,
        { _id: 'consume-1', type: 'consume', status: 'active', amount: 300, createTime: new Date('2026-06-11T10:00:00Z') },
        { _id: 'inactive-recharge', type: 'recharge', status: 'voided', amount: 999, createTime: new Date('2026-06-12T10:00:00Z') },
        { _id: 'old-consume', type: 'consume', status: 'active', amount: 888, createTime: new Date('2026-05-31T10:00:00Z') }
      ],
      stored_value_account: [
        { _id: 'account-1', status: 'active', balance: 600 },
        { _id: 'account-2', status: 'active', balance: 400.25 },
        { _id: 'account-inactive', status: 'inactive', balance: 999 }
      ]
    })

    const result = await main({ startDate: '2026-06-01', endDate: '2026-06-30', periodType: 'month' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({
      totalIncome: 1010,
      storedValueRecharge: 1010,
      storedValueConsume: 300,
      storedValueBalance: 1000.25
    }))
    const transactionWhere = collectionCalls.find((call) => call.name === 'stored_value_transaction').where
    expect(transactionWhere).toEqual({
      status: 'active',
      createTime: { __op: 'range', start: new Date('2026-06-01T00:00:00+08:00'), end: new Date('2026-06-30T23:59:59.999+08:00') }
    })
    expect(collectionCalls).toEqual(expect.arrayContaining([
      { name: 'stored_value_account', where: { status: 'active' } }
    ]))
  })

  test('counts Timestamp-like createTime objects in the requested period', async () => {
    const { main } = loadFunction({
      staff: [{ _id: 'staff-admin', role: 'admin', status: 'active', boundOpenid: 'openid-admin' }],
      permissions: [],
      income: [],
      purchase: [],
      expense: [],
      fixed_expense: [],
      stored_value_transaction: [
        {
          _id: 'timestamp-recharge',
          type: 'recharge',
          status: 'active',
          amount: 200,
          createTime: { toDate: () => new Date('2026-06-21T03:00:00Z') }
        }
      ],
      stored_value_account: []
    })

    const result = await main({ startDate: '2026-06-21', endDate: '2026-06-21', periodType: 'week' }, {})

    expect(result.success).toBe(true)
    expect(result.data.storedValueRecharge).toBe(200)
    expect(result.data.storedValueConsume).toBe(0)
  })

  test('uses China business date instead of UTC date for Date createTime boundaries', async () => {
    const { main } = loadFunction({
      staff: [{ _id: 'staff-admin', role: 'admin', status: 'active', boundOpenid: 'openid-admin' }],
      permissions: [],
      income: [],
      purchase: [],
      expense: [],
      fixed_expense: [],
      stored_value_transaction: [
        {
          _id: 'beijing-midnight-recharge',
          type: 'recharge',
          status: 'active',
          amount: 321,
          createTime: new Date('2026-06-20T16:30:00Z')
        },
        {
          _id: 'previous-business-day-recharge',
          type: 'recharge',
          status: 'active',
          amount: 999,
          createTime: new Date('2026-06-20T15:59:59Z')
        }
      ],
      stored_value_account: []
    })

    const result = await main({ startDate: '2026-06-21', endDate: '2026-06-21', periodType: 'week' }, {})

    expect(result.success).toBe(true)
    expect(result.data.storedValueRecharge).toBe(321)
  })
})
