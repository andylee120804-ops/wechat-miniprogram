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

function normalizeDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return ''
}

function matchesWhere(item, where) {
  if (!where) return true
  return Object.keys(where).every((key) => {
    const expected = where[key]
    if (expected && expected.__op === 'range') {
      const actual = normalizeDate(item[key])
      return actual >= expected.start && actual <= expected.end
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
    expect(collectionCalls).toEqual(expect.arrayContaining([
      { name: 'stored_value_transaction', where: { status: 'active' } },
      { name: 'stored_value_account', where: { status: 'active' } }
    ]))
  })
})
