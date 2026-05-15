const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const MinAmountPage = require('./pages/MinAmountPage')
const IncomeAddPage = require('./pages/IncomeAddPage')

function makeReservation(dateStr, time, dishPrice, roomName) {
  return {
    _id: 'test_res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    date: new Date(dateStr),
    customerName: '测试客户',
    time: time,
    roomName: roomName || '大包厢',
    standard: 500,
    guestCount: 4,
    dishPrice: dishPrice || 0,
    isPartner: false,
    status: 'confirmed',
    room: 'big'
  }
}

describe('收入录入 - 服务费模式计算', () => {
  let miniProgram
  let incomeAddPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    // 等待自动登录完成
    await new Promise(r => setTimeout(r, 3000))
    incomeAddPage = new IncomeAddPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('收入录入页加载服务费设置', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    const enabled = await incomeAddPage.getServiceChargeEnabled()
    expect(typeof enabled).toBe('boolean')

    const noon = await incomeAddPage.getServiceChargeNoon()
    expect(typeof noon).toBe('number')

    const night = await incomeAddPage.getServiceChargeNight()
    expect(typeof night).toBe('number')
  })

  test('新模式：菜价+服务费=金额（中午）', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    // 设置服务费模式参数
    await incomeAddPage.setServiceChargeEnabled(true)
    await incomeAddPage.setServiceChargeEnabledDate('2026-01-01')
    await incomeAddPage.setServiceChargeNoon(200)
    await incomeAddPage.setServiceChargeNight(300)

    // 创建测试预约（中午）
    const testRes = makeReservation(new Date(), '中午', 1888, '大包厢')
    await incomeAddPage.setRecentReservations([testRes])

    // 选择第0个预约
    await incomeAddPage.onReservationPickerChange(0)
    await new Promise(r => setTimeout(r, 500))

    // 金额应为 dishPrice(1888) + 中午服务费(200) = 2088
    const amount = await incomeAddPage.getAmount()
    expect(amount).toBe('2088')
  })

  test('新模式：菜价+服务费=金额（晚上）', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    await incomeAddPage.setServiceChargeEnabled(true)
    await incomeAddPage.setServiceChargeEnabledDate('2026-01-01')
    await incomeAddPage.setServiceChargeNoon(200)
    await incomeAddPage.setServiceChargeNight(300)

    const testRes = makeReservation(new Date(), '晚上', 2000, '小包厢')
    await incomeAddPage.setRecentReservations([testRes])

    await incomeAddPage.onReservationPickerChange(0)
    await new Promise(r => setTimeout(r, 500))

    // 金额应为 dishPrice(2000) + 晚上服务费(300) = 2300
    const amount = await incomeAddPage.getAmount()
    expect(amount).toBe('2300')
  })

  test('新模式：预约没有dishPrice时弹出提示', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    await incomeAddPage.setServiceChargeEnabled(true)
    await incomeAddPage.setServiceChargeEnabledDate('2026-01-01')

    // dishPrice = 0
    const testRes = makeReservation(new Date(), '中午', 0)
    await incomeAddPage.setRecentReservations([testRes])

    await incomeAddPage.onReservationPickerChange(0)
    await new Promise(r => setTimeout(r, 500))

    // 金额应清空，弹窗显示
    const amount = await incomeAddPage.getAmount()
    expect(amount).toBe('')

    const showModal = await incomeAddPage.getShowNoDishPriceModal()
    expect(showModal).toBe(true)
  })

  test('服务费未启用时使用旧模式', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    // 关闭服务费
    await incomeAddPage.setServiceChargeEnabled(false)

    const testRes = makeReservation(new Date(), '中午', 1888)
    testRes.standard = 500
    testRes.guestCount = 4
    await incomeAddPage.setRecentReservations([testRes])

    await incomeAddPage.onReservationPickerChange(0)
    await new Promise(r => setTimeout(r, 500))

    // 旧模式用 standard × guestCount
    const amount = await incomeAddPage.getAmount()
    expect(amount).toBeDefined()
    const amountVal = parseFloat(amount)
    expect(amountVal).toBeGreaterThan(0)
  })

  test('无预约模式可正常开启', async () => {
    await incomeAddPage.open()
    await incomeAddPage.waitForLoad(15000)
    await new Promise(r => setTimeout(r, 2000))

    await incomeAddPage.setNoReservation(true)
    const noReservation = await incomeAddPage.getNoReservation()
    expect(noReservation).toBe(true)
  })
})
