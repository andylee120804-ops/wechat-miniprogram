const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const PurchasePage = require('./pages/PurchasePage')

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

describe('Purchase Page - Boss Role', () => {
  let miniProgram
  let purchasePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    purchasePage = new PurchasePage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('should load purchase page successfully (boss has view permission)', async () => {
    await purchasePage.open()
    const loaded = await purchasePage.waitForData('loading', false, 15000)
    expect(loaded).toBe(true)

    const loading = await purchasePage.isLoading()
    expect(loading).toBe(false)
  })

  test('should display current month string', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const monthStr = await purchasePage.getMonthStr()
    expect(monthStr).toBeDefined()
    expect(typeof monthStr).toBe('string')
  })

  test('should have category filter chips', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const categories = await purchasePage.getCategories()
    expect(Array.isArray(categories)).toBe(true)
    // Should have at least 'all' category
    expect(categories.length).toBeGreaterThan(0)
  })

  test('should have active category selected', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const activeCategory = await purchasePage.getActiveCategory()
    expect(activeCategory).toBeDefined()
    expect(typeof activeCategory).toBe('string')
  })

  test('should have total formatted amount', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const total = await purchasePage.getTotalFormatted()
    expect(total).toBeDefined()
  })

  test('should have filtered purchases list', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const purchases = await purchasePage.getFilteredPurchases()
    expect(Array.isArray(purchases)).toBe(true)
  })

  test('should load theme data', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const theme = await purchasePage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surfaceColor).toBeDefined()
  })
})
