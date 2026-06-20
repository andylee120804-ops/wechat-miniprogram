function createDoc() {
  return {
    update: jest.fn(() => Promise.resolve({ updated: 1 }))
  }
}

function createChain(getResult) {
  const chain = {
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    get: jest.fn(() => Promise.resolve(getResult || { data: [] })),
    doc: jest.fn(() => createDoc()),
    add: jest.fn(() => Promise.resolve({ _id: 'perm1' }))
  }
  return chain
}

function loadFunction(options) {
  jest.resetModules()
  options = options || {}
  const staffUpdates = []
  const staffData = options.staffData || []
  const permissionData = options.permissionData || []

  const db = {
    serverDate: jest.fn(() => new Date('2026-06-20T00:00:00Z')),
    collection: jest.fn((name) => {
      if (name === 'staff') {
        const chain = createChain({ data: staffData })
        chain.doc = jest.fn((id) => ({
          update: jest.fn((payload) => {
            staffUpdates.push({ id, payload })
            return Promise.resolve({ updated: 1 })
          })
        }))
        return chain
      }
      if (name === 'permissions') return createChain({ data: permissionData })
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

  const mod = require('../../cloudfunctions/updateStaff/index.js')
  return { main: mod.main, staffUpdates }
}

describe('updateStaff auth', () => {
  const event = {
    staffId: 'target1',
    callerRole: 'admin',
    staffData: { name: '员工', role: 'waiter', wechatId: 'w1', phone: '', salary: 100, hireDate: '2026-01-01' },
    permissions: {}
  }

  test('rejects forged callerRole when OPENID is not an admin staff', async () => {
    const { main, staffUpdates } = loadFunction({
      staffData: [{ _id: 'caller1', role: 'waiter', boundOpenid: 'openid-user', status: 'active' }]
    })

    const result = await main(event, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('只有管理员')
    expect(staffUpdates).toEqual([])
  })

  test('allows real admin resolved by OPENID', async () => {
    const { main, staffUpdates } = loadFunction({
      staffData: [{ _id: 'admin1', role: 'admin', boundOpenid: 'openid-user', status: 'active' }]
    })

    const result = await main(event, {})

    expect(result.success).toBe(true)
    expect(staffUpdates.some(item => item.id === 'target1')).toBe(true)
  })
})
