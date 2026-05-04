const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const IncomePage = require('./pages/IncomePage')

describe('Income Page', () => {
  let miniProgram
  let incomePage

  beforeAll(async () => {
    miniProgram = await launchApp()

    const loginPage = new LoginPage(miniProgram)
    await loginPage.open()
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()
    await new Promise(r => setTimeout(r, 3000))

    incomePage = new IncomePage(miniProgram)
  })

  afterAll(async () => {
    await closeApp()
  })

  test('should load income page', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const loading = await incomePage.isLoading()
    expect(loading).toBe(false)
  })

  test('should display current month', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const month = await incomePage.getCurrentMonth()
    expect(month).toBeDefined()
    expect(typeof month).toBe('string')
  })

  test('should have type filter options', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const typeOptions = await incomePage.getTypeOptions()
    expect(Array.isArray(typeOptions)).toBe(true)
  })

  test('should have active type filter', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const activeType = await incomePage.getActiveType()
    expect(activeType).toBeDefined()
  })

  test('should have total amount', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const total = await incomePage.getTotalAmount()
    expect(total).toBeDefined()
  })

  test('should have filtered incomes list', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 10000)

    const incomes = await incomePage.getFilteredIncomes()
    expect(Array.isArray(incomes)).toBe(true)
  })

  test('should load theme data', async () => {
    await incomePage.open()

    const theme = await incomePage.getData('theme')
    expect(theme).toBeDefined()
  })
})
