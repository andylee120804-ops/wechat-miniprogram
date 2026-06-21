const storedValue = require('../../cloudfunctions/storedValue/index')

function createChain(getResult, hooks) {
  const chain = {
    where: jest.fn((where) => {
      if (hooks && hooks.onWhere) hooks.onWhere(where)
      return chain
    }),
    orderBy: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] })),
    update: jest.fn((payload) => {
      if (hooks && hooks.onUpdate) hooks.onUpdate(null, payload)
      return Promise.resolve({ stats: { updated: 1 } })
    })
  }
  return chain
}

function createDocChain(id, hooks) {
  const chain = {
    update: jest.fn((payload) => {
      if (hooks && hooks.onUpdate) hooks.onUpdate(id, payload)
      return Promise.resolve({ stats: { updated: 1 } })
    })
  }
  return chain
}

function createCollection(name, getResult, hooks) {
  const collection = createChain(getResult, hooks)
  collection.add = jest.fn((payload) => {
    if (hooks && hooks.onAdd) hooks.onAdd(name, payload)
    return Promise.resolve({ _id: `${name}-new-id` })
  })
  collection.doc = jest.fn((id) => createDocChain(id, hooks))
  return collection
}

function loadStoredValueFunction(options) {
  jest.resetModules()
  options = options || {}
  const accountReads = []
  const whereCalls = []
  const adds = []
  const updates = []
  const outsideAdds = []
  const outsideUpdates = []
  const transactionAdds = []
  const transactionUpdates = []
  const accountDataQueue = Array.isArray(options.accountDataSequence) ? options.accountDataSequence.slice() : null

  function getAccountResult() {
    if (accountDataQueue && accountDataQueue.length > 0) {
      return { data: accountDataQueue.shift() }
    }

    return { data: options.accountData || [] }
  }

  function createHooks(isTransaction) {
    return {
      onWhere: (name, where) => whereCalls.push({ name, where }),
      onAdd: (name, payload) => {
        const entry = { name, payload }
        adds.push(entry)
        if (isTransaction) {
          transactionAdds.push(entry)
          return
        }
        outsideAdds.push(entry)
      },
      onUpdate: (id, payload) => {
        const entry = { id, payload }
        updates.push(entry)
        if (isTransaction) {
          transactionUpdates.push(entry)
          return
        }
        outsideUpdates.push(entry)
      }
    }
  }

  function createDb(isTransaction) {
    const hooks = createHooks(isTransaction)
    return {
      collection: jest.fn((name) => {
        if (name === 'staff') return createCollection(name, { data: options.staffData || [] }, { onWhere: (where) => hooks.onWhere(name, where), onAdd: hooks.onAdd, onUpdate: hooks.onUpdate })
        if (name === 'permissions') return createCollection(name, { data: options.permissionsData || [] }, { onWhere: (where) => hooks.onWhere(name, where), onAdd: hooks.onAdd, onUpdate: hooks.onUpdate })
        if (name === 'stored_value_account') {
          return createCollection(name, getAccountResult(), {
            onWhere: (where) => {
              accountReads.push(where)
              hooks.onWhere(name, where)
            },
            onAdd: hooks.onAdd,
            onUpdate: hooks.onUpdate
          })
        }
        return createCollection(name, { data: [] }, { onWhere: (where) => hooks.onWhere(name, where), onAdd: hooks.onAdd, onUpdate: hooks.onUpdate })
      })
    }
  }

  const transactionDb = createDb(true)
  const db = createDb(false)
  db.runTransaction = jest.fn(async (callback) => {
    if (options.rejectRunTransaction) {
      return Promise.reject(new Error(options.rejectRunTransaction))
    }

    const result = await callback(transactionDb)
    if (options.rejectRunTransactionAfterCallback) {
      throw new Error(options.rejectRunTransactionAfterCallback)
    }

    return result
  })

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'cloud1-d9gwvttcr864f8021',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: options.openid || 'openid-user' }))
  }

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true })

  const mod = require('../../cloudfunctions/storedValue/index')
  return { main: mod.main, testApi: mod.__test__, db, cloud, accountReads, whereCalls, adds, updates, outsideAdds, outsideUpdates, transactionAdds, transactionUpdates }
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

  test('builds deterministic customer keys from normalized phone before name', () => {
    expect(storedValue.__test__.getCustomerKey({ phone: ' 13800000000 ', customerName: '张三' })).toBe('phone:13800000000')
    expect(storedValue.__test__.getCustomerKey({ phone: '', customerName: ' 张三 ' })).toBe('name:张三')
    expect(storedValue.__test__.getCustomerKey({ name: ' 李四 ' })).toBe('name:李四')
    expect(storedValue.__test__.getCustomerKey({ phone: '', customerName: '' })).toBe('')
  })

  test('builds stored-value recharge income payload', () => {
    const payload = storedValue.__test__.buildRechargeIncomeData({
      customerName: '张三',
      amount: 1000,
      paymentMethod: 'wechat',
      remark: '6月充值'
    }, {
      _id: 'account-1'
    }, {
      _id: 'staff-1',
      name: '管理员'
    })

    expect(payload).toEqual(expect.objectContaining({
      type: 'other',
      categoryLabel: '储值充值',
      settlementMode: 'stored_value_recharge',
      storedValueAccountId: 'account-1',
      originalAmount: 1000,
      deductedAmount: 0,
      amount: 1000,
      source: '张三',
      paymentMethod: 'wechat',
      remark: '储值充值：6月充值',
      collectedBy: 'staff-1',
      collectedByName: '管理员'
    }))
  })
})

describe('stored value recharge action', () => {
  test('rejects recharge when customerName is empty', async () => {
    const { main, accountReads, adds } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }]
    })

    const result = await main({ action: 'recharge', customerName: '   ', amount: 1000 })

    expect(result).toEqual({ success: false, message: '客户姓名不能为空' })
    expect(accountReads).toEqual([])
    expect(adds).toEqual([])
  })

  test('rejects recharge when amount is not positive', async () => {
    const { main, accountReads, adds } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }]
    })

    const result = await main({ action: 'recharge', customerName: '张三', amount: 0 })

    expect(result).toEqual({ success: false, message: '充值金额必须大于0' })
    expect(accountReads).toEqual([])
    expect(adds).toEqual([])
  })

  test('creates account, income and recharge transaction for new customer', async () => {
    const { main, accountReads, adds, updates } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }]
    })

    const result = await main({
      action: 'recharge',
      customerName: '张三',
      phone: '13800000000',
      amount: 1000,
      paymentMethod: 'wechat',
      remark: '6月充值',
      staffId: 'spoofed-staff'
    })

    expect(result.success).toBe(true)
    expect(accountReads).toEqual([
      { customerKey: 'phone:13800000000', status: 'active' },
      { customerKey: '13800000000', status: 'active' },
      { customerKey: '张三', status: 'active' },
      { phone: '13800000000', status: 'active' },
      { customerName: '张三', status: 'active' }
    ])
    expect(adds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'stored_value_account',
        payload: expect.objectContaining({
          data: expect.objectContaining({
            customerName: '张三',
            phone: '13800000000',
            customerKey: 'phone:13800000000',
            balance: 1000,
            totalRecharge: 1000,
            totalConsume: 0,
            status: 'active',
            _version: 1,
            createdBy: 'staff-1',
            createdByName: '管理员',
            updatedBy: 'staff-1',
            updatedByName: '管理员'
          })
        })
      }),
      expect.objectContaining({
        name: 'income',
        payload: expect.objectContaining({
          data: expect.objectContaining({
            settlementMode: 'stored_value_recharge',
            storedValueAccountId: 'stored_value_account-new-id',
            amount: 1000,
            source: '张三',
            collectedBy: 'staff-1'
          })
        })
      }),
      expect.objectContaining({
        name: 'stored_value_transaction',
        payload: expect.objectContaining({
          data: expect.objectContaining({
            type: 'recharge',
            status: 'active',
            accountId: 'stored_value_account-new-id',
            amount: 1000,
            balanceBefore: 0,
            balanceAfter: 1000,
            incomeId: 'income-new-id',
            operatorId: 'staff-1',
            operatorName: '管理员'
          })
        })
      })
    ]))
    expect(updates).toEqual([{
      id: 'income-new-id',
      payload: { data: { storedValueTransactionId: 'stored_value_transaction-new-id' } }
    }])
    expect(result.data).toEqual(expect.objectContaining({
      account: expect.objectContaining({ _id: 'stored_value_account-new-id', balance: 1000, totalRecharge: 1000 }),
      transaction: expect.objectContaining({ _id: 'stored_value_transaction-new-id', balanceBefore: 0, balanceAfter: 1000 }),
      incomeId: 'income-new-id'
    }))
  })

  test('updates existing account transactionally with correct balanceBefore', async () => {
    const { main, accountReads, adds, updates } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }],
      accountData: [{
        _id: 'account-1',
        customerName: '张三',
        phone: '13800000000',
        customerKey: 'phone:13800000000',
        balance: 200,
        totalRecharge: 500,
        totalConsume: 300,
        status: 'active',
        _version: 3
      }]
    })

    const result = await main({
      action: 'recharge',
      customerName: '张三',
      phone: '13800000000',
      amount: 1000,
      paymentMethod: 'cash',
      remark: ''
    })

    expect(result.success).toBe(true)
    expect(accountReads[0]).toEqual({ customerKey: 'phone:13800000000', status: 'active' })
    expect(updates).toEqual(expect.arrayContaining([
      {
        id: 'account-1',
        payload: { data: expect.objectContaining({ balance: 1200, totalRecharge: 1500, _version: 4, customerKey: 'phone:13800000000', updatedBy: 'staff-1' }) }
      },
      {
        id: 'income-new-id',
        payload: { data: { storedValueTransactionId: 'stored_value_transaction-new-id' } }
      }
    ]))
    expect(adds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'stored_value_transaction',
        payload: expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account-1',
            amount: 1000,
            balanceBefore: 200,
            balanceAfter: 1200
          })
        })
      })
    ]))
  })

  test('returns failure and performs no outside writes when transaction rollback is reported after attempted writes', async () => {
    const { main, db, outsideAdds, outsideUpdates, transactionAdds, transactionUpdates } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }],
      rejectRunTransactionAfterCallback: 'transaction rollback'
    })

    const result = await main({ action: 'recharge', customerName: '张三', phone: '13800000000', amount: 1000 })

    expect(result).toEqual({ success: false, message: 'transaction rollback' })
    expect(db.runTransaction).toHaveBeenCalledTimes(1)
    expect(transactionAdds.map((entry) => entry.name)).toEqual(['stored_value_account', 'income', 'stored_value_transaction'])
    expect(transactionUpdates).toEqual([{ id: 'income-new-id', payload: { data: { storedValueTransactionId: 'stored_value_transaction-new-id' } } }])
    expect(outsideAdds).toEqual([])
    expect(outsideUpdates).toEqual([])
  })

  test('updates legacy account found by phone and backfills customerKey', async () => {
    const { main, accountReads, adds, updates } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }],
      accountDataSequence: [[], [], [], [{
        _id: 'legacy-account',
        customerName: '张三',
        phone: '13800000000',
        balance: 100,
        totalRecharge: 100,
        totalConsume: 0,
        status: 'active',
        _version: 2
      }]]
    })

    const result = await main({ action: 'recharge', customerName: '张三', phone: '13800000000', amount: 500 })

    expect(result.success).toBe(true)
    expect(accountReads).toEqual([
      { customerKey: 'phone:13800000000', status: 'active' },
      { customerKey: '13800000000', status: 'active' },
      { customerKey: '张三', status: 'active' },
      { phone: '13800000000', status: 'active' }
    ])
    expect(adds.filter((entry) => entry.name === 'stored_value_account')).toEqual([])
    expect(updates).toEqual(expect.arrayContaining([
      {
        id: 'legacy-account',
        payload: { data: expect.objectContaining({ balance: 600, totalRecharge: 600, customerKey: 'phone:13800000000', _version: 3 }) }
      }
    ]))
  })

  test('updates account found by in-transaction re-check instead of creating duplicate first account', async () => {
    const { main, adds, updates } = loadStoredValueFunction({
      staffData: [{ _id: 'staff-1', name: '管理员', role: 'admin', status: 'active', boundOpenid: 'openid-user' }],
      accountDataSequence: [[{
        _id: 'account-concurrent',
        customerName: '张三',
        phone: '13800000000',
        customerKey: 'phone:13800000000',
        balance: 300,
        totalRecharge: 300,
        totalConsume: 0,
        status: 'active',
        _version: 1
      }]]
    })

    const result = await main({ action: 'recharge', customerName: '张三', phone: '13800000000', amount: 700 })

    expect(result.success).toBe(true)
    expect(adds.filter((entry) => entry.name === 'stored_value_account')).toEqual([])
    expect(updates).toEqual(expect.arrayContaining([
      {
        id: 'account-concurrent',
        payload: { data: expect.objectContaining({ balance: 1000, totalRecharge: 1000, customerKey: 'phone:13800000000' }) }
      }
    ]))
    expect(result.data.account).toEqual(expect.objectContaining({ _id: 'account-concurrent', balance: 1000, totalRecharge: 1000 }))
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
    expect(accountReads).toEqual([{ customerKey: 'phone:13800000000', status: 'active' }, { customerKey: 'name:李四', status: 'active' }])
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
    expect(accountReads).toEqual([{ customerKey: 'phone:13800000000', status: 'active' }, { customerKey: 'name:李四', status: 'active' }])
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
        { key: 'phone:13800000000', customer: { phone: '13800000000', customerName: '张三' } },
        { key: 'name:李四', customer: { customerName: '李四' } },
        { key: 'name:王五', customer: { name: '王五' } }
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
