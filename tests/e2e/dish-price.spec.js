const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const ReservationAddPage = require('./pages/ReservationAddPage')
const ReservationDetailPage = require('./pages/ReservationDetailPage')
const HomePage = require('./pages/HomePage')

/** 从首页获取第一个有效预约的 _id */
async function findFirstReservationId(miniProgram) {
  const homePage = new HomePage(miniProgram)
  await homePage.open()
  await homePage.waitForData('loading', false, 15000)
  await new Promise(r => setTimeout(r, 2000))

  const lists = [
    await homePage.getTodayReservations(),
    await homePage.getDinnerReservations(),
    await homePage.getTomorrowReservations()
  ]
  for (const list of lists) {
    if (Array.isArray(list) && list.length > 0) {
      return list[0]._id
    }
  }
  return null
}

describe('预定菜价 dishPrice', () => {
  let miniProgram
  let addPage
  let detailPage
  let homePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    // 等待自动登录完成
    await new Promise(r => setTimeout(r, 3000))
    addPage = new ReservationAddPage(miniProgram)
    detailPage = new ReservationDetailPage(miniProgram)
    homePage = new HomePage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('预约新增页有菜价输入字段', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    const dishPrice = await addPage.getDishPrice()
    // 字段应存在且初始为空字符串
    expect(dishPrice !== undefined && dishPrice !== null).toBe(true)
    expect(dishPrice).toBe('')
  })

  test('可以设置菜价数值', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    await addPage.setDishPrice('1888')
    const dishPrice = await addPage.getDishPrice()
    expect(dishPrice).toBe('1888')
  })

  test('菜价支持浮点数', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    await addPage.setDishPrice('1280.50')
    const dishPrice = await addPage.getDishPrice()
    expect(dishPrice).toBe('1280.50')
  })

  test('菜价可以为空（选填）', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    await addPage.setDishPrice('')
    const dishPrice = await addPage.getDishPrice()
    expect(dishPrice).toBe('')
  })

  test('预约详情页加载正常且包含 dishPrice 字段', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    const reservation = await detailPage.getReservation()
    expect(reservation).toBeDefined()
    expect(reservation).toHaveProperty('dishPrice')
  })

  test('首页预约卡片数据包含 dishPrice', async () => {
    await homePage.open()
    await homePage.waitForData('loading', false, 15000)
    await new Promise(r => setTimeout(r, 2000))

    const lunchList = await homePage.getTodayReservations()
    if (Array.isArray(lunchList) && lunchList.length > 0) {
      expect(lunchList[0]).toHaveProperty('dishPrice')
    }

    const dinnerList = await homePage.getDinnerReservations()
    if (Array.isArray(dinnerList) && dinnerList.length > 0) {
      expect(dinnerList[0]).toHaveProperty('dishPrice')
    }

    const tomorrowList = await homePage.getTomorrowReservations()
    if (Array.isArray(tomorrowList) && tomorrowList.length > 0) {
      expect(tomorrowList[0]).toHaveProperty('dishPrice')
    }
  })
})
