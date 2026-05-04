const { test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')

describe('Basic automation', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(() => {
    closeApp()
  })

  test('can connect to mini program', async () => {
    expect(miniProgram).toBeDefined()
  })

  test('can navigate to login page', async () => {
    const page = await miniProgram.reLaunch('/pages/login/index')
    expect(page.path).toContain('login')
  })

  test('can read page data', async () => {
    const page = await miniProgram.reLaunch('/pages/login/index')
    const data = await page.data()
    expect(data.venueName).toBeDefined()
    expect(typeof data.loading).toBe('boolean')
  })

  test('can set page data', async () => {
    const page = await miniProgram.reLaunch('/pages/login/index')
    await page.setData({ wechatId: 'test_user' })
    const data = await page.data()
    expect(data.wechatId).toBe('test_user')
  })
})
