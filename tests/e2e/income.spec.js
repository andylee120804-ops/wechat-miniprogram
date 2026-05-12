const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const IncomePage = require('./pages/IncomePage')

describe('Income Page - Boss Role', () => {
  let miniProgram
  let incomePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    incomePage = new IncomePage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('should load income page successfully (boss has view permission)', async () => {
    await incomePage.open()
    const loaded = await incomePage.waitForData('loading', false, 15000)
    expect(loaded).toBe(true)

    const loading = await incomePage.isLoading()
    expect(loading).toBe(false)
  })

  test('should display current month', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const month = await incomePage.getCurrentMonth()
    expect(month).toBeDefined()
    expect(typeof month).toBe('string')
  })

  test('should have type filter options', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const typeOptions = await incomePage.getTypeOptions()
    expect(Array.isArray(typeOptions)).toBe(true)
    // Should have at least 'all' option
    expect(typeOptions.length).toBeGreaterThan(0)
  })

  test('should have active type filter', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const activeType = await incomePage.getActiveType()
    expect(activeType).toBeDefined()
  })

  test('should have total amount', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const total = await incomePage.getTotalAmount()
    expect(total).toBeDefined()
  })

  test('should have filtered incomes list', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const incomes = await incomePage.getFilteredIncomes()
    expect(Array.isArray(incomes)).toBe(true)
  })

  test('should load theme data', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const theme = await incomePage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surfaceColor).toBeDefined()
  })
})
