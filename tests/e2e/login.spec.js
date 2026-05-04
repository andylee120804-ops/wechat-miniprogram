const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')

describe('Login Page', () => {
  let miniProgram
  let loginPage

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(() => {
    closeApp()
  })

  beforeEach(async () => {
    loginPage = new LoginPage(miniProgram)
    await loginPage.open()
  })

  test('should display brand name and form data', async () => {
    const brandName = await loginPage.getData('venueName')
    expect(brandName).toBeDefined()

    const wechatId = await loginPage.getData('wechatId')
    expect(typeof wechatId).toBe('string')

    const loading = await loginPage.getData('loading')
    expect(typeof loading).toBe('boolean')
  })

  test('should show error when submitting empty wechatId', async () => {
    await loginPage.setData({ wechatId: '' })
    await loginPage.tapLogin()

    const shaking = await loginPage.isShaking()
    expect(shaking).toBe(true)
  })

  test('should set wechatId via setData', async () => {
    await loginPage.setData({ wechatId: 'test_user' })
    const wechatId = await loginPage.getData('wechatId')
    expect(wechatId).toBe('test_user')
  })

  test('should set phone via setData', async () => {
    await loginPage.setData({ phone: '13800138000' })
    const phone = await loginPage.getData('phone')
    expect(phone).toBe('13800138000')
  })

  test('should attempt login with valid wechatId', async () => {
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()

    const loading = await loginPage.getData('loading')
    expect(typeof loading).toBe('boolean')
  })

  test('should clear loading state after login attempt', async () => {
    await loginPage.setData({ wechatId: 'nonexistent_user_12345' })
    await loginPage.tapLogin()

    const maxWait = 10000
    const start = Date.now()
    let loading = true
    while (loading && Date.now() - start < maxWait) {
      loading = await loginPage.getData('loading')
      if (!loading) break
      await new Promise(r => setTimeout(r, 500))
    }
    expect(loading).toBe(false)
  })

  test('should shake card on invalid login and stop after timeout', async () => {
    await loginPage.setData({ wechatId: '' })
    await loginPage.tapLogin()

    const shaking = await loginPage.isShaking()
    expect(shaking).toBe(true)

    await new Promise(r => setTimeout(r, 600))
    const shakingAfter = await loginPage.isShaking()
    expect(shakingAfter).toBe(false)
  })
})
