const storedValue = require('../../cloudfunctions/storedValue/index')

function createChain(getResult, hooks) {
  const chain = {
    where: jest.fn((where) => {
      if (hooks && hooks.onWhere) hooks.onWhere(where)
      return chain
    }),
    orderBy: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] }))
  }
  return chain
}

function loadStoredValueFunction(options) {
  jest.resetModules()
  options = options || {}
  const accountReads = []
  const whereCalls = []

  const db = {
    collection: jest.fn((name) => {
      if (name === 'staff') return createChain({ data: options.staffData || [] }, { onWhere: (where) => whereCalls.push({ name, where }) })
      if (name === 'permissions') return createChain({ data: options.permissionsData || [] }, { onWhere: (where) => whereCalls.push({ name, where }) })
      if (name === 'stored_value_account') {
        return createChain({ data: options.accountData || [] }, {
          onWhere: (where) => {
            accountReads.push(where)
            whereCalls.push({ name, where })
          }
        })
      }
      return createChain({ data: [] }, { onWhere: (where) => whereCalls.push({ name, where }) })
    })
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'cloud1-d9gwvttcr864f8021',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: options.openid || 'openid-user' }))
  }

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true })

  const mod = require('../../cloudfunctions/storedValue/index')
  return { main: mod.main, testApi: mod.__test__, db, cloud, accountReads, whereCalls }
}

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

describe('stored value query authorization', () => {
  test('rejects queryAccountByCustomer when event spoofs privileged staff id', async () => {
    const { main, accountReads, whereCalls } = loadStoredValueFunction({ staffData: [] })

    const result = await main({
      action: 'queryAccountByCustomer',
      staffId: 'boss1',
      operatorId: 'admin1',
      phone: '13800000000'
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe('无权限')
    expect(accountReads).toEqual([])
    expect(whereCalls).toContainEqual({
      name: 'staff',
      where: { boundOpenid: 'openid-user', status: 'active' }
    })
  })

  test('rejects queryAccountsByCustomers when newest bound staff lacks permission despite older privileged staff', async () => {
    const { main, accountReads, whereCalls } = loadStoredValueFunction({
      staffData: [
        { _id: 'older-admin', role: 'admin', status: 'active', boundOpenid: 'openid-user', boundAt: '2026-06-01T00:00:00.000Z' },
        { _id: 'newer-waiter', role: 'waiter', status: 'active', boundOpenid: 'openid-user', boundAt: '2026-06-20T00:00:00.000Z' }
      ],
      permissionsData: [{ staffId: 'newer-waiter', permissions: [{ module: 'income', actions: ['view'] }] }]
    })

    const result = await main({
      action: 'queryAccountsByCustomers',
      staffId: 'older-admin',
      customers: [{ phone: '13800000000' }]
    })

    expect(result).toEqual({ success: false, message: '无权限' })
    expect(accountReads).toEqual([])
    expect(whereCalls).toContainEqual({ name: 'permissions', where: { staffId: 'newer-waiter' } })
  })

  test('allows queryAccountsByCustomers when newest bound staff has income add permission', async () => {
    const { main, accountReads, whereCalls } = loadStoredValueFunction({
      staffData: [
        { _id: 'older-waiter', role: 'waiter', status: 'active', boundOpenid: 'openid-user', boundAt: '2026-06-01T00:00:00.000Z' },
        { _id: 'newer-cashier', role: 'waiter', status: 'active', boundOpenid: 'openid-user', boundAt: '2026-06-20T00:00:00.000Z' }
      ],
      permissionsData: [{ staffId: 'newer-cashier', permissions: [{ module: 'income', actions: ['add'] }] }]
    })

    const result = await main({
      action: 'queryAccountsByCustomers',
      customers: [
        { phone: '13800000000', customerName: '张三' },
        { phone: ' 13800000000 ', customerName: '重复' },
        { customerName: '李四' }
      ]
    })

    expect(result.success).toBe(true)
    expect(accountReads).toEqual([{ customerKey: '13800000000' }, { customerKey: '李四' }])
    expect(whereCalls).toContainEqual({ name: 'permissions', where: { staffId: 'newer-cashier' } })
  })

  test('allows queryAccountsByCustomers with income add permission and deduplicates lookups', async () => {
    const { main, accountReads } = loadStoredValueFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ staffId: 'staff1', permissions: [{ module: 'income', actions: ['add'] }] }]
    })

    const result = await main({
      action: 'queryAccountsByCustomers',
      customers: [
        { phone: '13800000000', customerName: '张三' },
        { phone: ' 13800000000 ', customerName: '重复' },
        { customerName: '李四' }
      ]
    })

    expect(result.success).toBe(true)
    expect(accountReads).toEqual([{ customerKey: '13800000000' }, { customerKey: '李四' }])
  })

  test('rejects queryAccountsByCustomers when more than 50 unique customers are requested', async () => {
    const { main, accountReads } = loadStoredValueFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ staffId: 'staff1', permissions: [{ module: 'income', actions: ['add'] }] }]
    })
    const customers = Array.from({ length: 51 }, (_, index) => ({ phone: `138000000${String(index).padStart(2, '0')}` }))

    const result = await main({ action: 'queryAccountsByCustomers', customers })

    expect(result).toEqual({ success: false, message: '一次最多查询50个客户' })
    expect(accountReads).toEqual([])
  })
})

describe('stored value customer input normalization', () => {
  test('deduplicates customers by phone before customerName and ignores empty entries', () => {
    const result = storedValue.__test__.normalizeCustomerInputs([
      { phone: '13800000000', customerName: '张三' },
      { phone: ' 13800000000 ', customerName: '重复' },
      { customerName: '李四' },
      { name: '王五' },
      {},
      null,
      'invalid'
    ])

    expect(result).toEqual({
      customers: [
        { key: '13800000000', customer: { phone: '13800000000', customerName: '张三' } },
        { key: '李四', customer: { customerName: '李四' } },
        { key: '王五', customer: { name: '王五' } }
      ],
      isTooMany: false
    })
  })

  test('flags more than 50 unique customers before database fan-out', () => {
    const customers = Array.from({ length: 51 }, (_, index) => ({ phone: `138000000${String(index).padStart(2, '0')}` }))

    const result = storedValue.__test__.normalizeCustomerInputs(customers)

    expect(result.isTooMany).toBe(true)
    expect(result.customers).toHaveLength(50)
  })
})
