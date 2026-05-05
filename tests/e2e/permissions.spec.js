const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS, ROLE_PERMISSIONS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')
const HomePage = require('./pages/HomePage')
const AnnouncementsPage = require('./pages/AnnouncementsPage')
const MePage = require('./pages/MePage')

/**
 * Helper: login as a role, open a page, wait for load, return page data
 */
async function loginAndLoadPage(miniProgram, wechatId, PageClass) {
  await loginAs(miniProgram, wechatId)
  const page = new PageClass(miniProgram)
  await page.open()
  await page.waitForData('loading', false, 15000)
  return page
}

// ============================================================
// Home Page — Cross-Role Permission Tests
// ============================================================
describe('Home Page - Permission by Role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  // --- Boss ---
  describe('Boss role', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, HomePage)
    }, 60000)

    test('should see income/expense summary', async () => {
      const showSummary = await homePage.getData('showSummary')
      expect(showSummary).toBe(true)
    })

    test('should have all quick action permissions', async () => {
      expect(await homePage.getData('canAddReservation')).toBe(true)
      expect(await homePage.getData('canAddPurchase')).toBe(true)
      expect(await homePage.getData('canAddIncome')).toBe(true)
    })

    test('should see announcements in marquee', async () => {
      const announcements = await homePage.getData('announcements')
      expect(Array.isArray(announcements)).toBe(true)
    })
  })

  // --- Purchase role (limited permissions - no income access) ---
  describe('Purchase role', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.purchase.wechatId, HomePage)
    }, 60000)

    test('should NOT see income/expense summary', async () => {
      const showSummary = await homePage.getData('showSummary')
      expect(showSummary).toBe(false)
    })

    test('should NOT have income add permission', async () => {
      const canAddIncome = await homePage.getData('canAddIncome')
      expect(canAddIncome).toBe(false)
    })

    test('should have purchase add permission', async () => {
      const canAddPurchase = await homePage.getData('canAddPurchase')
      expect(canAddPurchase).toBe(true)
    })

    test('should still see announcements (all users can view)', async () => {
      const announcements = await homePage.getData('announcements')
      expect(Array.isArray(announcements)).toBe(true)
    })
  })
})

// ============================================================
// Announcements Page — Permission by Role
// ============================================================
describe('Announcements Page - Permission by Role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  // --- Boss ---
  describe('Boss role', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, AnnouncementsPage)
    }, 60000)

    test('should have add permission (FAB button visible)', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(true)
    })

    test('should have edit permission', async () => {
      expect(await annPage.canEditAnnouncement()).toBe(true)
    })

    test('should have delete permission', async () => {
      expect(await annPage.canDeleteAnnouncement()).toBe(true)
    })

    test('should load announcements list', async () => {
      const announcements = await annPage.getAnnouncements()
      expect(Array.isArray(announcements)).toBe(true)
    })
  })

  // --- Chef (view only, no add/edit/delete for announcements) ---
  describe('Chef role', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.chef.wechatId, AnnouncementsPage)
    }, 60000)

    test('should NOT have add permission (no FAB)', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(false)
    })

    test('should NOT have edit permission', async () => {
      expect(await annPage.canEditAnnouncement()).toBe(false)
    })

    test('should NOT have delete permission', async () => {
      expect(await annPage.canDeleteAnnouncement()).toBe(false)
    })

    test('should still load announcements list (all users can view)', async () => {
      const announcements = await annPage.getAnnouncements()
      expect(Array.isArray(announcements)).toBe(true)
    })
  })

  // --- Admin (typically has full announcement access) ---
  describe('Admin role', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.admin.wechatId, AnnouncementsPage)
    }, 60000)

    test('should have add permission', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(true)
    })

    test('should have edit permission', async () => {
      expect(await annPage.canEditAnnouncement()).toBe(true)
    })
  })
})

// ============================================================
// Me Page — Menu Items by Role
// ============================================================
describe('Me Page - Menu Visibility by Role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Boss role', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, MePage)
    }, 60000)

    test('should show boss role name', async () => {
      const roleName = await mePage.getRoleName()
      expect(roleName).toBe('老板')
    })

    test('should show feature group (dashboard, customer, insights)', async () => {
      const featureGroup = await mePage.getFeatureGroup()
      expect(Array.isArray(featureGroup)).toBe(true)
      expect(featureGroup.length).toBeGreaterThan(0)
      const keys = featureGroup.map(item => item.key)
      expect(keys).toContain('dashboard')
      expect(keys).toContain('customer')
      expect(keys).toContain('insights')
    })

    test('should show management items (staff, attendance)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = mgmt.map(item => item.key)
      expect(keys).toContain('staff')
      expect(keys).toContain('attendance')
    })
  })

  describe('Chef role', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.chef.wechatId, MePage)
    }, 60000)

    test('should show chef role name', async () => {
      const roleName = await mePage.getRoleName()
      expect(roleName).toBe('厨师')
    })

    test('should NOT show feature group (boss only)', async () => {
      const featureGroup = await mePage.getFeatureGroup()
      expect(Array.isArray(featureGroup)).toBe(true)
      expect(featureGroup.length).toBe(0)
    })

    test('should NOT show staff management (no staff.VIEW permission)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = mgmt.map(item => item.key)
      expect(keys).not.toContain('staff')
    })

    test('should always show clockin and announcements', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = mgmt.map(item => item.key)
      expect(keys).toContain('clockin')
      expect(keys).toContain('announcements')
    })
  })
})

// ============================================================
// Announcement Detail Page — Edit/Delete by Permission
// ============================================================
describe('Announcement Detail - Permission by Role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Boss role', () => {
    test('should have canEdit=true on detail page', async () => {
      await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
      // Navigate to announcements list first
      const annPage = new AnnouncementsPage(miniProgram)
      await annPage.open()
      await annPage.waitForData('loading', false, 15000)

      const announcements = await annPage.getAnnouncements()
      if (announcements.length > 0) {
        // Navigate to detail
        await miniProgram.navigateTo(`/pages/announcement-detail/index?id=${announcements[0]._id}`)
        await new Promise(r => setTimeout(r, 2000))

        const page = await miniProgram.currentPage()
        const data = await page.data()
        expect(data.canEdit).toBe(true)
      }
    })
  })

  describe('Chef role', () => {
    test('should have canEdit=false on detail page (no edit/delete buttons)', async () => {
      await loginAs(miniProgram, TEST_ACCOUNTS.chef.wechatId)
      const annPage = new AnnouncementsPage(miniProgram)
      await annPage.open()
      await annPage.waitForData('loading', false, 15000)

      const announcements = await annPage.getAnnouncements()
      if (announcements.length > 0) {
        await miniProgram.navigateTo(`/pages/announcement-detail/index?id=${announcements[0]._id}`)
        await new Promise(r => setTimeout(r, 2000))

        const page = await miniProgram.currentPage()
        const data = await page.data()
        expect(data.canEdit).toBe(false)
      }
    })
  })
})
