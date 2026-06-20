function createChain(getResult) {
  const chain = {
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    count: jest.fn(() => Promise.resolve({ total: 0 })),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] }))
  }
  return chain
}

function loadFunction(options) {
  jest.resetModules()
  options = options || {}
  const dataCollectionReads = []
  const staffData = options.staffData || []
  const permissionsData = options.permissionsData || []

  const command = {
    gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'range', start: value })) })),
    lte: jest.fn((value) => ({ op: 'lte', value })),
    neq: jest.fn((value) => ({ op: 'neq', value }))
  }

  const db = {
    command,
    collection: jest.fn((name) => {
      if (name === 'staff') return createChain({ data: staffData })
      if (name === 'permissions') return createChain({ data: permissionsData })
      dataCollectionReads.push(name)
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

  const mod = require('../../cloudfunctions/getInsights/index.js')
  return { main: mod.main, dataCollectionReads }
}

describe('getInsights auth', () => {
  test('rejects unknown caller before reading insight data', async () => {
    const { main, dataCollectionReads } = loadFunction({ staffData: [] })

    const result = await main({ action: 'topIncomeSources' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(dataCollectionReads).toEqual([])
  })

  test('topIncomeSources requires dashboard view permission, not just income view', async () => {
    const { main, dataCollectionReads } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'income', actions: ['view'] }] }]
    })

    const result = await main({
      action: 'topIncomeSources',
      permissions: [{ module: 'dashboard', actions: ['view'] }]
    }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(dataCollectionReads).toEqual([])
  })

  test('busiestDays requires dashboard view permission, not just reservation view', async () => {
    const { main, dataCollectionReads } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'reservation', actions: ['view'] }] }]
    })

    const result = await main({ action: 'busiestDays' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(dataCollectionReads).toEqual([])
  })

  test('allows action when dashboard view permission exists', async () => {
    const { main } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'dashboard', actions: ['view'] }] }]
    })

    const result = await main({ action: 'topIncomeSources' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })
})
