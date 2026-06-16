const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const ReservationPage = require('./pages/ReservationPage')

describe('Reservation Page - Boss Role', () => {
  let miniProgram
  let reservationPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    reservationPage = new ReservationPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('should load reservation page successfully (boss has view permission)', async () => {
    await reservationPage.open()
    const loaded = await reservationPage.waitForData('loading', false, 15000)
    expect(loaded).toBe(true)

    const loading = await reservationPage.isLoading()
    expect(loading).toBe(false)
  })

  test('should have selected date set to today', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const selectedDate = await reservationPage.getSelectedDate()
    expect(selectedDate).toBeDefined()
    expect(typeof selectedDate).toBe('string')
    // Should be a date string (YYYY-MM-DD format)
    expect(selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('should have reservation list data', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const reservations = await reservationPage.getReservations()
    expect(Array.isArray(reservations)).toBe(true)
  })

  test('should have grouped reservations by time', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const grouped = await reservationPage.getGroupedReservations()
    expect(Array.isArray(grouped)).toBe(true)
    // Each group should have key, label, items, color, textColor
    grouped.forEach((g) => {
      expect(typeof g.key).toBe('string')
      expect(typeof g.label).toBe('string')
      expect(Array.isArray(g.items)).toBe(true)
    })
  })

  test('should load theme data with correct keys', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const theme = await reservationPage.getData('theme')
    expect(theme).toBeDefined()
    expect(theme.surfaceColor).toBeDefined()
  })

  test('should have calendar data (year + month)', async () => {
    await reservationPage.open()
    await reservationPage.waitForData('loading', false, 15000)

    const currentYear = await reservationPage.getData('currentYear')
    const currentMonth = await reservationPage.getData('currentMonth')

    expect(typeof currentYear).toBe('number')
    expect(typeof currentMonth).toBe('number')
    expect(currentYear).toBeGreaterThanOrEqual(2024)
    expect(currentMonth).toBeGreaterThanOrEqual(1)
    expect(currentMonth).toBeLessThanOrEqual(12)
  })
})
