const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const PurchasePage = require('./pages/PurchasePage')

describe('Purchase Page', () => {
  let miniProgram
  let purchasePage

  beforeAll(async () => {
    miniProgram = await launchApp()

    const loginPage = new LoginPage(miniProgram)
    await loginPage.open()
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()
    await new Promise(r => setTimeout(r, 3000))

    purchasePage = new PurchasePage(miniProgram)
  })

  afterAll(async () => {
    await closeApp()
  })

  test('should load purchase page', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const loading = await purchasePage.isLoading()
    expect(loading).toBe(false)
  })

  test('should display month string', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const monthStr = await purchasePage.getMonthStr()
    expect(monthStr).toBeDefined()
    expect(typeof monthStr).toBe('string')
  })

  test('should have category filter chips', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const categories = await purchasePage.getCategories()
    expect(Array.isArray(categories)).toBe(true)
  })

  test('should have active category', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const activeCategory = await purchasePage.getActiveCategory()
    expect(activeCategory).toBeDefined()
  })

  test('should have total formatted amount', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const total = await purchasePage.getTotalFormatted()
    expect(total).toBeDefined()
  })

  test('should have filtered purchases list', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 10000)

    const purchases = await purchasePage.getFilteredPurchases()
    expect(Array.isArray(purchases)).toBe(true)
  })

  test('should load theme data', async () => {
    await purchasePage.open()

    const theme = await purchasePage.getData('theme')
    expect(theme).toBeDefined()
  })
})
