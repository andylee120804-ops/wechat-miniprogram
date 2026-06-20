function createChain(getResult, hooks) {
  hooks = hooks || {}
  const chain = {
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    count: jest.fn(() => Promise.resolve({ total: getResult && getResult.data ? getResult.data.length : 0 })),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] }))
  }
  if (hooks.onGet) {
    chain.get.mockImplementation(() => {
      hooks.onGet()
      return Promise.resolve(getResult || { data: [] })
    })
  }
  return chain
}

function loadFunction(options) {
  jest.resetModules()
  options = options || {}
  const announcementReads = []
  const staffData = options.staffData || []
  const permissionsData = options.permissionsData || []
  const announcementsData = options.announcementsData || [{ _id: 'a1', title: '公告', active: true }]

  const command = {
    addToSet: jest.fn((value) => ({ op: 'addToSet', value })),
    gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'range', start: value })) })),
    lte: jest.fn((value) => ({ op: 'lte', value })),
    neq: jest.fn((value) => ({ op: 'neq', value })),
    in: jest.fn((value) => ({ op: 'in', value }))
  }

  const db = {
    command,
    collection: jest.fn((name) => {
      if (name === 'staff') return createChain({ data: staffData })
      if (name === 'permissions') return createChain({ data: permissionsData })
      if (name === 'announcement') {
        return createChain({ data: announcementsData }, {
          onGet: function() { announcementReads.push(name) }
        })
      }
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

  const mod = require('../../cloudfunctions/sendMessage/index.js')
  return { main: mod.main, announcementReads }
}

describe('sendMessage announcement auth', () => {
  test('getAnnouncements rejects unknown caller before reading announcements', async () => {
    const { main, announcementReads } = loadFunction({ staffData: [] })

    const result = await main({ action: 'getAnnouncements' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(announcementReads).toEqual([])
  })

  test('getAnnouncements rejects staff without announcement view permission', async () => {
    const { main, announcementReads } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'income', actions: ['view'] }] }]
    })

    const result = await main({ action: 'getAnnouncements' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(announcementReads).toEqual([])
  })

  test('getAnnouncements allows staff with announcement view permission', async () => {
    const { main } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'announcement', actions: ['view'] }] }]
    })

    const result = await main({ action: 'getAnnouncements' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  test('getSettings allows active OpenID-bound staff without callerWechatId', async () => {
    const { main } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }]
    })

    const result = await main({ action: 'getSettings' }, {})

    expect(result.success).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({ venueName: expect.any(String) }))
  })

  test('resolveCreator rejects unknown caller before resolving staff metadata', async () => {
    const { main } = loadFunction({ staffData: [] })

    const result = await main({ action: 'resolveCreator', createdBy: 'staff1' }, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
  })
})
