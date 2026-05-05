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

  test('should display venue name from cloud', async () => {
    const venueName = await loginPage.getData('venueName')
    expect(venueName).toBeDefined()
    expect(typeof venueName).toBe('string')
  })

  test('should have wechatId and phone input fields', async () => {
    const wechatId = await loginPage.getData('wechatId')
    expect(typeof wechatId).toBe('string')

    const phone = await loginPage.getData('phone')
    expect(typeof phone).toBe('string')
  })

  test('should show error when submitting empty wechatId', async () => {
    await loginPage.setData({ wechatId: '' })
    await loginPage.tapLogin()

    const shaking = await loginPage.isShaking()
    expect(shaking).toBe(true)
  })

  test('should set wechatId via setData', async () => {
    await loginPage.setData({ wechatId: 'a' })
    const wechatId = await loginPage.getData('wechatId')
    expect(wechatId).toBe('a')
  })

  test('should login successfully with wechatId "a" and navigate to home', async () => {
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()

    // Wait for loading to complete
    const maxWait = 15000
    const start = Date.now()
    let loading = true
    while (loading && Date.now() - start < maxWait) {
      loading = await loginPage.getData('loading')
      if (!loading) break
      await new Promise(r => setTimeout(r, 500))
    }
    expect(loading).toBe(false)

    // After successful login, page should have navigated away
    await new Promise(r => setTimeout(r, 1500))
    const currentPage = await miniProgram.currentPage()
    expect(currentPage.path).not.toContain('login')
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
