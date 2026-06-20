function createChain(getResult) {
  const result = getResult || { data: [] }
  const chain = {
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    count: jest.fn(() => Promise.resolve({ total: (result.data || []).length })),
    get: jest.fn(() => Promise.resolve(result))
  }
  return chain
}

function loadFunction(options) {
  jest.resetModules()
  options = options || {}
  const staffData = options.staffData || []
  const permissionsData = options.permissionsData || []

  const collections = options.collections || {}
  const db = {
    command: {
      gte: jest.fn((value) => ({ and: jest.fn(() => ({ op: 'range', value })) })),
      lte: jest.fn((value) => ({ op: 'lte', value }))
    },
    collection: jest.fn((name) => {
      if (name === 'staff') return createChain({ data: staffData.length ? staffData : (collections.staff || []) })
      if (name === 'permissions') return createChain({ data: permissionsData })
      return createChain({ data: collections[name] || [] })
    })
  }

  const cloud = {
    DYNAMIC_CURRENT_ENV: 'cloud1-d9gwvttcr864f8021',
    init: jest.fn(),
    database: jest.fn(() => db),
    getWXContext: jest.fn(() => ({ OPENID: options.openid || 'openid-user' })),
    uploadFile: jest.fn(() => Promise.resolve({ fileID: 'cloud://file.xls' })),
    getTempFileURL: jest.fn(() => Promise.resolve({ fileList: [{ tempFileURL: 'https://example.com/file.xls' }] }))
  }

  jest.doMock('wx-server-sdk', () => cloud, { virtual: true })

  const mod = require('../../cloudfunctions/exportReportXlsx/index.js')
  return { main: mod.main, cloud }
}

const baseEvent = {
  periodLabel: '本月',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  periodType: 'month'
}

describe('exportReportXlsx security', () => {
  test('rejects unknown caller before uploading file', async () => {
    const { main, cloud } = loadFunction({ staffData: [] })

    const result = await main(baseEvent, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(cloud.uploadFile).not.toHaveBeenCalled()
  })

  test('rejects non-admin and non-boss dashboard viewer', async () => {
    const { main, cloud } = loadFunction({
      staffData: [{ _id: 'staff1', role: 'waiter', status: 'active', boundOpenid: 'openid-user' }],
      permissionsData: [{ permissions: [{ module: 'dashboard', actions: ['view'] }] }]
    })

    const result = await main(baseEvent, {})

    expect(result.success).toBe(false)
    expect(result.message).toContain('无权限')
    expect(cloud.uploadFile).not.toHaveBeenCalled()
  })

  test('allows boss to export reports', async () => {
    const { main, cloud } = loadFunction({
      staffData: [{ _id: 'boss1', role: 'boss', status: 'active', boundOpenid: 'openid-user' }]
    })

    const result = await main(baseEvent, {})

    expect(result.success).toBe(true)
    expect(cloud.uploadFile).toHaveBeenCalled()
  })

  test('escapes formula-leading strings before writing worksheet cells for admin export', async () => {
    const { main, cloud } = loadFunction({
      staffData: [{ _id: 'admin1', role: 'admin', status: 'active', boundOpenid: 'openid-user' }],
      collections: {
        income: [{ date: '2026-06-01', type: '=SUM(1,1)', source: '+cmd', amount: 1, collectedByName: '@user', remark: '-danger' }]
      }
    })

    const result = await main(baseEvent, {})

    expect(result.success).toBe(true)
    const html = cloud.uploadFile.mock.calls[0][0].fileContent.toString('utf8')
    expect(html).toContain('&#39;=SUM(1,1)')
    expect(html).toContain('&#39;+cmd')
    expect(html).toContain('&#39;@user')
    expect(html).toContain('&#39;-danger')
  })

  test('keeps daily expense, fixed expense, and salary breakdown totals separate', async () => {
    const { main, cloud } = loadFunction({
      staffData: [{ _id: 'admin1', role: 'admin', status: 'active', boundOpenid: 'openid-user', salary: 3000, hireDate: '2026-01-01', name: '老板' }],
      collections: {
        expense: [{ date: '2026-06-01', category: 'other', name: '日常', amount: 100 }],
        fixed_expense: [{ name: '租金', monthlyAmount: 200, startDate: '2026-01-01' }]
      }
    })

    const result = await main(baseEvent, {})

    expect(result.success).toBe(true)
    const html = cloud.uploadFile.mock.calls[0][0].fileContent.toString('utf8')
    expect(html).toContain('<td style="mso-number-format:\\@">日常支出</td><td style="mso-number-format:\\@">100.00</td>')
    expect(html).toContain('<td style="mso-number-format:\\@">工资</td><td style="mso-number-format:\\@">2957.00</td>')
    expect(html).toContain('<td style="mso-number-format:\\@">固定支出</td><td style="mso-number-format:\\@">200.00</td>')
    expect(html).toContain('<td style="mso-number-format:\\@">总支出</td><td style="mso-number-format:\\@">3257.00</td>')
  })
})
