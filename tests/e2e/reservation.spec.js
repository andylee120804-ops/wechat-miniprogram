const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const ReservationPage = require('./pages/ReservationPage')

describe('Reservation Page', () => {
  let miniProgram
  let reservationPage

  beforeAll(async () => {
    miniProgram = await launchApp()

    const loginPage = new LoginPage(miniProgram)
    await loginPage.open()
    await loginPage.setData({ wechatId: TEST_ACCOUNTS.boss.wechatId })
    await loginPage.tapLogin()
    await new Promise(r => setTimeout(r, 3000))

    reservationPage = new ReservationPage(miniProgram)
  })

  afterAll(async () => {
    await closeApp()
  })

  test('should load reservation page', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 10000)

    const loading = await reservationPage.isLoading()
    expect(loading).toBe(false)
  })

  test('should have selected date', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 10000)

    const selectedDate = await reservationPage.getSelectedDate()
    expect(selectedDate).toBeDefined()
    expect(typeof selectedDate).toBe('string')
  })

  test('should have reservation list data', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 10000)

    const reservations = await reservationPage.getReservations()
    expect(Array.isArray(reservations)).toBe(true)
  })

  test('should have grouped reservations', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 10000)

    const grouped = await reservationPage.getGroupedReservations()
    expect(grouped).toBeDefined()
    expect(typeof grouped).toBe('object')
  })

  test('should load theme data', async () => {
    await reservationPage.open()

    const theme = await reservationPage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surfaceColor || theme.surface).toBeDefined()
  })

  test('should have calendar data', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 10000)

    const currentYear = await reservationPage.getData('currentYear')
    const currentMonth = await reservationPage.getData('currentMonth')

    expect(typeof currentYear).toBe('number')
    expect(typeof currentMonth).toBe('number')
  })
})
