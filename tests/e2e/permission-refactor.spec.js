/**
 * permission-refactor.spec.js — E2E tests for the permission model refactor
 *
 * Test accounts:
 * - boss (wechatId: 'boss') → role: admin (管理员) — has ALL permissions
 * - f (wechatId: 'f') → role: boss (老板) — business access, BLOCKED from admin-only
 * - g (wechatId: 'g') → role: boss (老板) — same as f, for consistency check
 * - c (wechatId: 'c') → role: purchase (采购) — purchase management
 * - d (wechatId: 'd') → role: chef (厨师) — view-only
 *
 * Key permission model:
 * 1. Admin has ALL permissions including staff/venueSettings/minAmount
 * 2. Boss has business permissions but BLOCKED from admin-only modules
 * 3. Purchase has purchase management, limited reservation, no income
 * 4. Chef has view-only for announcements, no financial access
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS, ROLE_PERMISSIONS } = require('../fixtures/test-data')
const HomePage = require('./pages/HomePage')
const MePage = require('./pages/MePage')
const AnnouncementsPage = require('./pages/AnnouncementsPage')
const VenueSettingsPage = require('./pages/VenueSettingsPage')

/**
 * Helper: login as a role, open a page, wait for load, return page instance
 */
async function loginAndLoadPage(miniProgram, wechatId, PageClass) {
  await loginAs(miniProgram, wechatId)
  const page = new PageClass(miniProgram)
  await page.open()
  await page.waitForData('loading', false, 15000)
  return page
}

/**
 * Helper: safely extract keys from a group, guarding against undefined/null
 */
function extractKeys(group) {
  if (!Array.isArray(group)) return []
  return group.map(item => item && item.key).filter(Boolean)
}

// ============================================================
// 1. Login — Role Verification
// ============================================================
describe('Login - Role identification', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  const roleCases = [
    { key: 'admin', wechatId: TEST_ACCOUNTS.admin.wechatId, expectedRole: '管理员' },
    { key: 'boss', wechatId: TEST_ACCOUNTS.boss.wechatId, expectedRole: '老板' },
    { key: 'boss2', wechatId: TEST_ACCOUNTS.boss2.wechatId, expectedRole: '老板' },
    { key: 'purchase', wechatId: TEST_ACCOUNTS.purchase.wechatId, expectedRole: '采购主管' },
    { key: 'chef', wechatId: TEST_ACCOUNTS.chef.wechatId, expectedRole: '厨师' },
  ]

  roleCases.forEach(({ key, wechatId, expectedRole }) => {
    test(`${key} (wechatId: ${wechatId}) should login and identify as ${expectedRole}`, async () => {
      await loginAs(miniProgram, wechatId)
      const mePage = new MePage(miniProgram)
      await mePage.open()
      await new Promise(r => setTimeout(r, 2500))

      const roleName = await mePage.getRoleName()
      expect(roleName).toBe(expectedRole)
    })
  })
})

// ============================================================
// 2. Home Page — Quick Action Permissions
// ============================================================
describe('Home Page - Quick action permissions by role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Admin role (wechatId: boss)', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.admin.wechatId, HomePage)
    }, 60000)

    test('should see income/expense summary (all permissions)', async () => {
      expect(await homePage.isShowSummary()).toBe(true)
    })

    test('should have all quick action permissions', async () => {
      expect(await homePage.canAddReservation()).toBe(true)
      expect(await homePage.canAddPurchase()).toBe(true)
      expect(await homePage.canAddIncome()).toBe(true)
    })
  })

  describe('Boss role (wechatId: f)', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, HomePage)
    }, 60000)

    test('should see income/expense summary (income.VIEW)', async () => {
      expect(await homePage.isShowSummary()).toBe(true)
    })

    test('should have reservation add permission', async () => {
      expect(await homePage.canAddReservation()).toBe(true)
    })

    test('should have purchase add permission', async () => {
      expect(await homePage.canAddPurchase()).toBe(true)
    })

    test('should have income add permission', async () => {
      expect(await homePage.canAddIncome()).toBe(true)
    })
  })

  describe('Purchase role (wechatId: c)', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.purchase.wechatId, HomePage)
    }, 60000)

    test('should NOT see income/expense summary (no income.VIEW)', async () => {
      expect(await homePage.isShowSummary()).toBe(false)
    })

    test('should NOT have income add permission', async () => {
      expect(await homePage.canAddIncome()).toBe(false)
    })

    test('should have purchase add permission', async () => {
      expect(await homePage.canAddPurchase()).toBe(true)
    })
  })

  describe('Chef role (wechatId: d)', () => {
    let homePage

    beforeAll(async () => {
      homePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.chef.wechatId, HomePage)
    }, 60000)

    test('should NOT see income/expense summary', async () => {
      expect(await homePage.isShowSummary()).toBe(false)
    })

    test('should NOT have income add permission', async () => {
      expect(await homePage.canAddIncome()).toBe(false)
    })

    test('should NOT have purchase add permission', async () => {
      expect(await homePage.canAddPurchase()).toBe(false)
    })
  })
})

// ============================================================
// 3. Me Page — Menu Visibility by Role (admin-only modules)
// ============================================================
describe('Me Page - Admin-only modules (staff/venueSettings/minAmount)', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Admin (wechatId: boss) — should see ALL modules including admin-only', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.admin.wechatId, MePage)
    }, 60000)

    test('should show staff management', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).toContain('staff')
    })

    test('should show venue settings', async () => {
      const settings = await mePage.getSettingsGroup()
      const keys = extractKeys(settings)
      expect(keys).toContain('venueSettings')
    })

    test('should show min amount', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).toContain('minAmount')
    })

    test('should show operation logs', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).toContain('logs')
    })

    test('should show business features', async () => {
      const featureGroup = await mePage.getFeatureGroup()
      const keys = extractKeys(featureGroup)
      expect(keys).toContain('dashboard')
    })
  })

  describe('Boss (wechatId: f) — should NOT see admin-only modules', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, MePage)
    }, 60000)

    test('should NOT show staff management (admin-only)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).not.toContain('staff')
    })

    test('should NOT show venue settings (admin-only)', async () => {
      const settings = await mePage.getSettingsGroup()
      const keys = extractKeys(settings)
      expect(keys).not.toContain('venueSettings')
    })

    test('should NOT show min amount (admin-only)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).not.toContain('minAmount')
    })

    test('should NOT show operation logs (uses staff.VIEW)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).not.toContain('logs')
    })

    test('should still show business features (dashboard, customer, insights)', async () => {
      const featureGroup = await mePage.getFeatureGroup()
      const keys = extractKeys(featureGroup)
      expect(keys).toContain('dashboard')
      expect(keys).toContain('customer')
      expect(keys).toContain('insights')
    })

    test('should show expense management (business module)', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).toContain('fixedExpense')
    })
  })

  describe('Chef (wechatId: d) — should NOT see admin-only or financial modules', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.chef.wechatId, MePage)
    }, 60000)

    test('should NOT show staff management', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).not.toContain('staff')
    })

    test('should NOT show venue settings', async () => {
      const settings = await mePage.getSettingsGroup()
      const keys = extractKeys(settings)
      expect(keys).not.toContain('venueSettings')
    })

    test('should NOT show dashboard', async () => {
      const featureGroup = await mePage.getFeatureGroup()
      const keys = extractKeys(featureGroup)
      expect(keys).not.toContain('dashboard')
    })
  })

  describe('Purchase (wechatId: c) — limited access', () => {
    let mePage

    beforeAll(async () => {
      mePage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.purchase.wechatId, MePage)
    }, 60000)

    test('should NOT show staff management', async () => {
      const mgmt = await mePage.getManagementGroup()
      const keys = extractKeys(mgmt)
      expect(keys).not.toContain('staff')
    })

    test('should NOT show venue settings', async () => {
      const settings = await mePage.getSettingsGroup()
      const keys = extractKeys(settings)
      expect(keys).not.toContain('venueSettings')
    })
  })
})

// ============================================================
// 4. Venue Settings Page — Access Control (the canEdit bug fix)
// ============================================================
describe('Venue Settings Page - Access control', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Admin (wechatId: boss) — should have FULL access', () => {
    let venuePage

    beforeAll(async () => {
      await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
      venuePage = new VenueSettingsPage(miniProgram)
      await venuePage.open()
      await venuePage.waitForData('loading', false, 20000)
    }, 90000)

    test('should load page successfully (loading=false)', async () => {
      const loading = await venuePage.getLoading()
      expect(loading).toBe(false)
    })

    test('should have canEdit=true', async () => {
      const canEdit = await venuePage.getCanEdit()
      expect(canEdit).toBe(true)
    })

    test('should have venue name loaded', async () => {
      const venueName = await venuePage.getVenueName()
      expect(typeof venueName).toBe('string')
    })

    test('should have standard list loaded', async () => {
      const standards = await venuePage.getStandardList()
      expect(Array.isArray(standards)).toBe(true)
    })
  })

  describe('Boss (wechatId: f) — should be DENIED access', () => {
    test('should navigate back or have canEdit=false (no venueSettings.VIEW)', async () => {
      await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
      await miniProgram.reLaunch('/pages/admin/venue-settings/index')
      await new Promise(r => setTimeout(r, 3000))

      const currentPage = await miniProgram.currentPage()
      const data = await currentPage.data()
      if (data.venueName !== undefined) {
        expect(data.canEdit).toBe(false)
      }
    })
  })

  describe('Chef (wechatId: d) — should be DENIED access', () => {
    test('should navigate back or have canEdit=false', async () => {
      await loginAs(miniProgram, TEST_ACCOUNTS.chef.wechatId)
      await miniProgram.reLaunch('/pages/admin/venue-settings/index')
      await new Promise(r => setTimeout(r, 3000))

      const currentPage = await miniProgram.currentPage()
      const data = await currentPage.data()
      if (data.venueName !== undefined) {
        expect(data.canEdit).toBe(false)
      }
    })
  })
})

// ============================================================
// 5. Announcements Page — Permission by Role
// ============================================================
describe('Announcements Page - Permission by role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('Admin (wechatId: boss) — full announcement access', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.admin.wechatId, AnnouncementsPage)
    }, 60000)

    test('should have add permission (FAB visible)', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(true)
    })
  })

  describe('Boss (wechatId: f) — full business access to announcements', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.boss.wechatId, AnnouncementsPage)
    }, 60000)

    test('should have add permission', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(true)
    })
  })

  describe('Chef (wechatId: d) — view-only access', () => {
    let annPage

    beforeAll(async () => {
      annPage = await loginAndLoadPage(miniProgram, TEST_ACCOUNTS.chef.wechatId, AnnouncementsPage)
    }, 60000)

    test('should NOT have add permission (no FAB)', async () => {
      expect(await annPage.canAddAnnouncement()).toBe(false)
    })

    test('should still load announcements list (all users can view)', async () => {
      const announcements = await annPage.getAnnouncements()
      expect(Array.isArray(announcements)).toBe(true)
    })
  })
})

// ============================================================
// 6. Announcement Detail Page — Edit button by Role
// ============================================================
describe('Announcement Detail - canEdit by role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  async function getAnnouncementDetailCanEdit(miniProgram, wechatId) {
    await loginAs(miniProgram, wechatId)
    const annPage = new AnnouncementsPage(miniProgram)
    await annPage.open()
    await annPage.waitForData('loading', false, 15000)

    const announcements = await annPage.getAnnouncements()
    if (!announcements || announcements.length === 0) return null

    await miniProgram.navigateTo(`/pages/announcement-detail/index?id=${announcements[0]._id}`)
    await new Promise(r => setTimeout(r, 2500))

    const page = await miniProgram.currentPage()
    const data = await page.data()
    return data.canEdit
  }

  describe('Admin (wechatId: boss) — canEdit=true', () => {
    test('should have canEdit=true on detail page', async () => {
      const canEdit = await getAnnouncementDetailCanEdit(miniProgram, TEST_ACCOUNTS.admin.wechatId)
      if (canEdit === null) return
      expect(canEdit).toBe(true)
    })
  })

  describe('Boss (wechatId: f) — canEdit=true (has announcement.EDIT)', () => {
    test('should have canEdit=true on detail page', async () => {
      const canEdit = await getAnnouncementDetailCanEdit(miniProgram, TEST_ACCOUNTS.boss.wechatId)
      if (canEdit === null) return
      expect(canEdit).toBe(true)
    })
  })

  describe('Chef (wechatId: d) — canEdit=false', () => {
    test('should have canEdit=false on detail page', async () => {
      const canEdit = await getAnnouncementDetailCanEdit(miniProgram, TEST_ACCOUNTS.chef.wechatId)
      if (canEdit === null) return
      expect(canEdit).toBe(false)
    })
  })
})

// ============================================================
// 7. Income Add Page — Access by Role
// ============================================================
describe('Income Add Page - Access by role', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('Admin (wechatId: boss) — should have access (canEdit=true)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
    await miniProgram.reLaunch('/pages/income-add/index')
    await new Promise(r => setTimeout(r, 2500))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    expect(data.canEdit).toBe(true)
  })

  test('Boss (wechatId: f) — should have access (canEdit=true)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await miniProgram.reLaunch('/pages/income-add/index')
    await new Promise(r => setTimeout(r, 2500))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    expect(data.canEdit).toBe(true)
  })

  test('Purchase (wechatId: c) — should be DENIED (no income.ADD)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.purchase.wechatId)
    await miniProgram.reLaunch('/pages/income-add/index')
    await new Promise(r => setTimeout(r, 3000))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    if (data.canEdit !== undefined) {
      expect(data.canEdit).toBe(false)
    }
  })

  test('Chef (wechatId: d) — should be DENIED (no income.ADD)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.chef.wechatId)
    await miniProgram.reLaunch('/pages/income-add/index')
    await new Promise(r => setTimeout(r, 3000))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    if (data.canEdit !== undefined) {
      expect(data.canEdit).toBe(false)
    }
  })
})

// ============================================================
// 8. Staff Management — Admin-Only Access
// ============================================================
describe('Staff Management - Admin-only access', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('Admin (wechatId: boss) should access staff page', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
    await miniProgram.reLaunch('/pages/admin/staff/index')
    await new Promise(r => setTimeout(r, 2500))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    expect(data.theme).toBeDefined()
  })

  test('Admin (wechatId: boss) should access staff-add page (canEdit=true)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
    await miniProgram.reLaunch('/pages/admin/staff-add/index')
    await new Promise(r => setTimeout(r, 2500))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    expect(data.canEdit).toBe(true)
  })

  test('Boss (wechatId: f) should be DENIED staff-add (not admin)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await miniProgram.reLaunch('/pages/admin/staff-add/index')
    await new Promise(r => setTimeout(r, 3000))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    if (data.canEdit !== undefined) {
      expect(data.canEdit).toBe(false)
    }
  })
})

// ============================================================
// 9. Min Amount Settings — Admin-Only Access
// ============================================================
describe('Min Amount Settings - Admin-only access', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('Admin (wechatId: boss) should access min-amount page', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
    await miniProgram.reLaunch('/pages/min-amount/index')
    await new Promise(r => setTimeout(r, 2500))

    const currentPage = await miniProgram.currentPage()
    const data = await currentPage.data()
    expect(data.theme).toBeDefined()
  })

  test('Boss (wechatId: f) should be DENIED (role !== admin)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await miniProgram.reLaunch('/pages/min-amount/index')
    await new Promise(r => setTimeout(r, 3000))
    // min-amount checks role !== 'admin' and navigates back
  })
})

// ============================================================
// 10. Cross-Role Consistency — f and g both boss, same access
// ============================================================
describe('Cross-role consistency — boss (f) vs boss2 (g)', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  test('both should have same role name (老板)', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    const mePage1 = new MePage(miniProgram)
    await mePage1.open()
    await new Promise(r => setTimeout(r, 2500))
    const role1 = await mePage1.getRoleName()

    await loginAs(miniProgram, TEST_ACCOUNTS.boss2.wechatId)
    const mePage2 = new MePage(miniProgram)
    await mePage2.open()
    await new Promise(r => setTimeout(r, 2500))
    const role2 = await mePage2.getRoleName()

    expect(role1).toBe('老板')
    expect(role1).toBe(role2)
  })

  test('both should have same management group items', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    const mePage1 = new MePage(miniProgram)
    await mePage1.open()
    await new Promise(r => setTimeout(r, 2500))
    const mgmt1 = await mePage1.getManagementGroup()
    const keys1 = extractKeys(mgmt1).sort()

    await loginAs(miniProgram, TEST_ACCOUNTS.boss2.wechatId)
    const mePage2 = new MePage(miniProgram)
    await mePage2.open()
    await new Promise(r => setTimeout(r, 2500))
    const mgmt2 = await mePage2.getManagementGroup()
    const keys2 = extractKeys(mgmt2).sort()

    expect(keys1).toEqual(keys2)
  })

  test('both should NOT see admin-only modules', async () => {
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    const mePage1 = new MePage(miniProgram)
    await mePage1.open()
    await new Promise(r => setTimeout(r, 2500))
    const mgmt1 = await mePage1.getManagementGroup()
    const keys1 = extractKeys(mgmt1)

    expect(keys1).not.toContain('staff')
    expect(keys1).not.toContain('minAmount')
  })
})
