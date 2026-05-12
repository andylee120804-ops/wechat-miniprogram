const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const ReservationPage = require('./pages/ReservationPage')
const PurchasePage = require('./pages/PurchasePage')
const IncomePage = require('./pages/IncomePage')

describe('Cross-Tab UI Consistency', () => {
  let miniProgram
  let reservationPage
  let purchasePage
  let incomePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    reservationPage = new ReservationPage(miniProgram)
    purchasePage = new PurchasePage(miniProgram)
    incomePage = new IncomePage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  // --- Month label format consistency ---

  test('reservation month label uses YYYY年M月 format', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const text = await reservationPage.getMonthLabelText()
    expect(text).toMatch(/^\d{4}年\d{1,2}月$/)
  })

  test('purchase month label uses YYYY年M月 format', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const text = await purchasePage.getMonthLabelText()
    expect(text).toMatch(/^\d{4}年\d{1,2}月$/)
  })

  test('income month label uses YYYY年M月 format', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const text = await incomePage.getMonthLabelText()
    expect(text).toMatch(/^\d{4}年\d{1,2}月$/)
  })

  test('all three tabs show the same current month', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)
    const resMonth = await reservationPage.getMonthLabelText()

    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)
    const purMonth = await purchasePage.getMonthLabelText()

    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)
    const incMonth = await incomePage.getMonthLabelText()

    // All three should reference the same current month
    expect(purMonth).toBe(resMonth)
    expect(incMonth).toBe(resMonth)
  })

  // --- Month navigation works ---

  test('purchase: navigating prev month changes label', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const before = await purchasePage.getMonthLabelText()
    await purchasePage.navigatePrevMonth()
    await purchasePage.waitForData('loading', false, 15000)

    const after = await purchasePage.getMonthLabelText()
    expect(after).not.toBe(before)
    expect(after).toMatch(/^\d{4}年\d{1,2}月$/)
  })

  test('income: navigating prev month changes label', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const before = await incomePage.getMonthLabelText()
    await incomePage.navigatePrevMonth()
    await incomePage.waitForData('loading', false, 15000)

    const after = await incomePage.getMonthLabelText()
    expect(after).not.toBe(before)
    expect(after).toMatch(/^\d{4}年\d{1,2}月$/)
  })

  // --- Amount display ---

  test('purchase summary amount is visible and formatted', async () => {
    await purchasePage.open()
    await purchasePage.waitForData('loading', false, 15000)

    const dataAmount = await purchasePage.getTotalFormatted()
    const textAmount = await purchasePage.getSummaryAmountText()

    // Rendered text should contain the formatted amount
    if (dataAmount && textAmount) {
      expect(textAmount).toContain(dataAmount)
    }
    expect(textAmount).toMatch(/^¥\d/)
  })

  test('income summary amount is visible and formatted', async () => {
    await incomePage.open()
    await incomePage.waitForData('loading', false, 15000)

    const dataAmount = await incomePage.getTotalAmount()
    const textAmount = await incomePage.getSummaryAmountText()

    if (dataAmount && textAmount) {
      expect(textAmount).toContain(dataAmount)
    }
    expect(textAmount).toMatch(/^¥\d/)
  })
})
