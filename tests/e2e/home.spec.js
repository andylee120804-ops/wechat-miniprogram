const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const HomePage = require('./pages/HomePage')

async function loginAs(miniProgram, wechatId) {
  const loginPage = new LoginPage(miniProgram)
  await loginPage.open()
  await loginPage.setData({ wechatId })
  await loginPage.tapLogin()

  const maxWait = 15000
  const start = Date.now()
  let loading = true
  while (loading && Date.now() - start < maxWait) {
    loading = await loginPage.getData('loading')
    if (!loading) break
    await new Promise(r => setTimeout(r, 500))
  }
  await new Promise(r => setTimeout(r, 1500))
}

describe('Home Page - Boss Role', () => {
  let miniProgram
  let homePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    homePage = new HomePage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('should load home page after login', async () => {
    await homePage.open()
    const loaded = await homePage.waitForData('loading', false, 15000)
    expect(loaded).toBe(true)
  })

  test('should display venue name', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)

    const venueName = await homePage.getData('venueName')
    expect(venueName).toBeDefined()
    expect(typeof venueName).toBe('string')
  })

  test('should have today reservations (lunch + dinner)', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)

    const lunchRes = await homePage.getTodayReservations()
    const dinnerRes = await homePage.getDinnerReservations()
    expect(Array.isArray(lunchRes)).toBe(true)
    expect(Array.isArray(dinnerRes)).toBe(true)
  })

  test('should have tomorrow reservations', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)

    const tomorrowRes = await homePage.getTomorrowReservations()
    expect(Array.isArray(tomorrowRes)).toBe(true)
  })

  test('boss should see income/expense summary', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)

    const showSummary = await homePage.isShowSummary()
    // Boss has permission to view income, so showSummary should be true
    expect(showSummary).toBe(true)
  })

  test('boss should have all quick action permissions', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)

    const canAddReservation = await homePage.getData('canAddReservation')
    const canAddPurchase = await homePage.getData('canAddPurchase')
    const canAddIncome = await homePage.getData('canAddIncome')

    // Boss has all permissions
    expect(canAddReservation).toBe(true)
    expect(canAddPurchase).toBe(true)
    expect(canAddIncome).toBe(true)
  })

  test('should load theme data', async () => {
    await homePage.open()

    const theme = await homePage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surfaceColor).toBeDefined()
    expect(theme.textPrimary).toBeDefined()
  })

  test('should have statusBarHeight set', async () => {
    await homePage.open()

    const statusBarHeight = await homePage.getData('statusBarHeight')
    expect(typeof statusBarHeight).toBe('number')
    expect(statusBarHeight).toBeGreaterThan(0)
  })
})
