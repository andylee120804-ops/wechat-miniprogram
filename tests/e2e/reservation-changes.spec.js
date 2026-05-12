const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const VenueSettingsPage = require('./pages/VenueSettingsPage')
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

// =============================================
// 1. 食堂设置 → 餐标配置
// =============================================
describe('食堂设置 - 餐标配置', () => {
  let miniProgram
  let venuePage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    venuePage = new VenueSettingsPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('页面加载且可编辑', async () => {
    await venuePage.open()
    await venuePage.waitForData('loading', false, 15000)
    const canEdit = await venuePage.getCanEdit()
    expect(canEdit).toBe(true)
  })

  test('餐标字段已加载默认值', async () => {
    await venuePage.open()
    await venuePage.waitForData('loading', false, 15000)

    const mealStandards = await venuePage.getMealStandards()
    const partnerStandard = await venuePage.getPartnerStandard()
    const defaultStandard = await venuePage.getDefaultStandard()
    const allowNoStandard = await venuePage.getAllowNoStandard()

    expect(typeof mealStandards).toBe('string')
    expect(mealStandards.length).toBeGreaterThan(0)
    expect(partnerStandard).toBeDefined()
    expect(String(partnerStandard).length).toBeGreaterThan(0)
    expect(defaultStandard).toBeDefined()
    expect(typeof allowNoStandard).toBe('boolean')
  })

  test('页面可设置餐标值且onSave正常调用', async () => {
    await venuePage.open()
    await venuePage.waitForData('loading', false, 15000)

    // setData 修改页面数据
    await venuePage.setMealStandards('400,600,800,1000')
    await venuePage.setPartnerStandard('350')
    await venuePage.setDefaultStandard('400')
    await venuePage.setAllowNoStandard(true)

    // 验证页面数据已被设置
    const ms = await venuePage.getMealStandards()
    expect(ms).toBe('400,600,800,1000')

    // onSave 不抛出异常（不验证云端持久化）
    await expect(venuePage.saveSettings()).resolves.not.toThrow()
  }, 30000)

  test('恢复默认值', async () => {
    await venuePage.open()
    await venuePage.waitForData('loading', false, 15000)

    await venuePage.setMealStandards('500,600,800')
    await venuePage.setPartnerStandard('300')
    await venuePage.setDefaultStandard('500')
    await venuePage.setAllowNoStandard(false)

    await expect(venuePage.saveSettings()).resolves.not.toThrow()
  }, 30000)
})

// =============================================
// 2. 预定页 → 餐标配置、股东Boss选择器、输入次序
// =============================================
describe('预定页 - 餐标配置与股东Boss选择器', () => {
  let miniProgram
  let addPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    addPage = new ReservationAddPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('餐标配置从设置中加载', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    const standardOptions = await addPage.getStandardOptions()
    const partnerStandard = await addPage.getPartnerStandard()

    expect(Array.isArray(standardOptions)).toBe(true)
    expect(standardOptions.length).toBeGreaterThan(0)
    expect(typeof partnerStandard).toBe('number')
    expect(partnerStandard).toBeGreaterThan(0)
  })

  test('股东模式加载老板列表', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    await addPage.togglePartner()
    await new Promise(r => setTimeout(r, 1000))

    const isPartner = await addPage.getIsPartner()
    expect(isPartner).toBe(true)

    const bossList = await addPage.getBossList()
    expect(Array.isArray(bossList)).toBe(true)
    if (bossList.length > 0) {
      expect(bossList[0].name).toBeDefined()
      const customerName = await addPage.getCustomerName()
      expect(customerName).toBe(bossList[0].name)
    }
  })

  test('取消股东模式后恢复手动输入', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    await addPage.togglePartner()
    await new Promise(r => setTimeout(r, 500))
    expect(await addPage.getIsPartner()).toBe(true)

    await addPage.togglePartner()
    await new Promise(r => setTimeout(r, 500))
    expect(await addPage.getIsPartner()).toBe(false)

    const selectedIndex = await addPage.getSelectedBossIndex()
    expect(selectedIndex).toBe(-1)
  })

  test('人数输入在手机号之前', async () => {
    await addPage.open()
    await new Promise(r => setTimeout(r, 3000))

    // 通过页面数据检查：人数(guestCount)字段在WXML中应在手机号(phone)之前
    // 使用 textmate 方式获取卡片内所有 label 的文字顺序
    const page = await addPage.page || await miniProgram.currentPage()
    const card = await page.$('theme-card')
    const inputs = await card.$$('input')
    const guestCountInputs = []
    const phoneInputs = []
    let guestIdx = -1
    let phoneIdx = -1
    if (inputs && inputs.length > 0) {
      for (let i = 0; i < inputs.length; i++) {
        const placeholder = await inputs[i].property('placeholder')
        if (placeholder === '请输入用餐人数') guestIdx = i
        if (placeholder === '请输入手机号') phoneIdx = i
      }
    }
    // 如果找到了两个输入框，验证人数在手机号之前
    if (guestIdx !== -1 && phoneIdx !== -1) {
      expect(guestIdx).toBeLessThan(phoneIdx)
    }
  })
})

// =============================================
// 3. 预约详情 → 分享信息持久化
// =============================================
describe('预约详情 - 分享信息持久化', () => {
  let miniProgram
  let addPage
  let detailPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    addPage = new ReservationAddPage(miniProgram)
    detailPage = new ReservationDetailPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('分享模态框打开且有默认标题', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const showShareModal = await detailPage.getShowShareModal()
    expect(showShareModal).toBe(true)

    const shareTitle = await detailPage.getShareTitle()
    expect(shareTitle).toBeDefined()
    expect(shareTitle.length).toBeGreaterThan(0)
  }, 90000)

  test('保存分享信息后再次打开仍保留内容', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const testTitle = '定制分享标题'
    await detailPage.setShareTitle(testTitle)
    await detailPage.setShareRemark('定制备注')
    await new Promise(r => setTimeout(r, 300))

    await detailPage.onConfirmShare()
    await new Promise(r => setTimeout(r, 1500))

    expect(await detailPage.getShowShareModal()).toBe(false)

    const reservation = await detailPage.getReservation()
    expect(reservation).toBeDefined()
    expect(reservation.shareConfig).toBeDefined()
    expect(reservation.shareConfig.shareTitle).toBe(testTitle)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const shareTitleReloaded = await detailPage.getShareTitle()
    expect(shareTitleReloaded).toBe(testTitle)

    await detailPage.onCloseShareModal()
  }, 90000)

  test('分享模版默认选中商务风格', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const template = await detailPage.getSelectedTemplate()
    expect(template).toBe('business')
  })

  test('可以切换到友情风格', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    await detailPage.selectTemplate('friend')
    await new Promise(r => setTimeout(r, 300))

    const template = await detailPage.getSelectedTemplate()
    expect(template).toBe('friend')
  })

  test('可以切回商务风格', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    await detailPage.selectTemplate('friend')
    await new Promise(r => setTimeout(r, 200))

    await detailPage.selectTemplate('business')
    await new Promise(r => setTimeout(r, 200))

    const template = await detailPage.getSelectedTemplate()
    expect(template).toBe('business')
  })

  test('保存分享时模版选择持久化', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    await detailPage.selectTemplate('friend')
    await detailPage.setShareTitle('模版测试标题')
    await detailPage.setShareRemark('模版测试备注')
    await new Promise(r => setTimeout(r, 300))

    await detailPage.onConfirmShare()
    await new Promise(r => setTimeout(r, 1500))

    expect(await detailPage.getShowShareModal()).toBe(false)

    // 重新打开确认模版已保存
    const reservation = await detailPage.getReservation()
    expect(reservation).toBeDefined()
    expect(reservation.shareConfig).toBeDefined()
    expect(reservation.shareConfig.template).toBe('friend')

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const templateReloaded = await detailPage.getSelectedTemplate()
    expect(templateReloaded).toBe('friend')

    // 恢复成 business，免得影响其他测试
    await detailPage.selectTemplate('business')
    await detailPage.onShareAndSave()
    await new Promise(r => setTimeout(r, 1500))
  }, 90000)

  test('onShareAndSave后本地数据同步更新', async () => {
    const id = await findFirstReservationId(miniProgram)
    expect(id).toBeDefined()

    await detailPage.openWithId(id)
    await detailPage.waitForLoad(15000)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const testTitle = 'ShareAndSave测试'
    await detailPage.setShareTitle(testTitle)
    await new Promise(r => setTimeout(r, 300))

    await detailPage.onShareAndSave()
    await new Promise(r => setTimeout(r, 1500))

    expect(await detailPage.getShowShareModal()).toBe(false)

    const reservation = await detailPage.getReservation()
    expect(reservation).toBeDefined()
    expect(reservation.shareConfig).toBeDefined()
    expect(reservation.shareConfig.shareTitle).toBe(testTitle)

    await detailPage.onShareToGuest()
    await new Promise(r => setTimeout(r, 1000))

    const shareTitleReloaded = await detailPage.getShareTitle()
    expect(shareTitleReloaded).toBe(testTitle)

    await detailPage.onCloseShareModal()
  }, 90000)
})
