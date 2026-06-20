function createChain(getResult, hooks) {
  hooks = hooks || {}
  const chain = {
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    count: jest.fn(() => Promise.resolve({ total: 0 })),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] }))
  }
  if (hooks.onWhere) {
    chain.where.mockImplementation((where) => {
      hooks.onWhere(where)
      return chain
    })
  }
  return chain
}

function loadFunction(options) {
  jest.resetModules()
  options = options || {}
  const financeCollectionReads = []
  const staffData = options.staffData || []
  const permissionsData = options.permissionsData || []

  const command = {
    gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'range', start: value })) })),
    lte: jest.fn((value) => ({ op: 'lte', value }))
  }

  const db = {
    command,
    collection: jest.fn((name) => {
      if (name === 'staff') return createChain({ data: staffData })
      if (name === 'permissions') return createChain({ data: permissionsData })
      financeCollectionReads.push(name)
      return createChain({ data: [] })
    })
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'cloud1-d9gwvttcr864f8021',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: options.openid || 'openid-user' }))
  }

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true })

  const mod = require('../../cloudfunctions/getFinanceStats/index.js')
  return { main: mod.main, financeCollectionReads, db, cloud }
}

describe('getFinanceStats auth', () => {
  test('rejects unknown caller before reading finance collections', async () => {
    const { main, financeCollectionReads } = loadFunction({ staffData: [] })

    const result = await main({ startDate: '2026-06-01', endDate: '2026-06-30' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(financeCollectionReads).toEqual([])
  })

  test('rejects staff without dashboard view even when event spoofs admin role', async () => {
    const { main, financeCollectionReads } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'income', actions: ['view'] }] }]
    })

    const result = await main({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      role: 'admin',
      permissions: [{ module: 'dashboard', actions: ['view'] }]
    }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(financeCollectionReads).toEqual([])
  })

  test('allows staff with dashboard view permission', async () => {
    const { main } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'dashboard', actions: ['view'] }] }]
    })

    const result = await main({ startDate: '2026-06-01', endDate: '2026-06-30' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({
      totalIncome: 0,
      totalExpenseAll: 0,
      netProfit: 0
    }))
  })
})
