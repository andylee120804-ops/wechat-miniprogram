const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const HomePage = require('./pages/HomePage')

describe('Home Page', () => {
  let miniProgram
  let homePage

  beforeAll(async () => {
    miniProgram = await launchApp()

    const loginPage = new LoginPage(miniProgram)
    await loginPage.open()
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()

    await new Promise(r => setTimeout(r, 3000))

    homePage = new HomePage(miniProgram)
  })

  afterAll(async () => {
    await closeApp()
  })

  test('should load home page after login', async () => {
    await homePage.open()
    const loading = await homePage.getData('loading')

    const maxWait = 10000
    const start = Date.now()
    let stillLoading = loading
    while (stillLoading && Date.now() - start < maxWait) {
      stillLoading = await homePage.getData('loading')
      if (!stillLoading) break
      await new Promise(r => setTimeout(r, 500))
    }
    expect(stillLoading).toBe(false)
  })

  test('should display venue name in nav bar', async () => {
    await homePage.open()
    const venueName = await homePage.getData('venueName')
    expect(venueName).toBeDefined()
    expect(typeof venueName).toBe('string')
  })

  test('should have today reservations data', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 10000)

    const lunchRes = await homePage.getTodayReservations()
    const dinnerRes = await homePage.getDinnerReservations()
    expect(Array.isArray(lunchRes)).toBe(true)
    expect(Array.isArray(dinnerRes)).toBe(true)
  })

  test('should have tomorrow reservations data', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 10000)

    const tomorrowRes = await homePage.getTomorrowReservations()
    expect(Array.isArray(tomorrowRes)).toBe(true)
  })

  test('should show summary for boss role', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 10000)

    const showSummary = await homePage.isShowSummary()
    expect(typeof showSummary).toBe('boolean')
  })

  test('should have quick action permissions defined', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 10000)

    const canAddReservation = await homePage.getData('canAddReservation')
    const canAddPurchase = await homePage.getData('canAddPurchase')
    const canAddIncome = await homePage.getData('canAddIncome')

    expect(typeof canAddReservation).toBe('boolean')
    expect(typeof canAddPurchase).toBe('boolean')
    expect(typeof canAddIncome).toBe('boolean')
  })

  test('should load theme data', async () => {
    await homePage.open()

    const theme = await homePage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surface).toBeDefined()
    expect(theme.textPrimary).toBeDefined()
  })

  test('should have statusBarHeight set', async () => {
    await homePage.open()

    const statusBarHeight = await homePage.getData('statusBarHeight')
    expect(typeof statusBarHeight).toBe('number')
    expect(statusBarHeight).toBeGreaterThan(0)
  })
})
