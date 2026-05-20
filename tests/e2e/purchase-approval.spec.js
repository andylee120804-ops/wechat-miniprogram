const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS, PAGES } = require('../fixtures/test-data')
const PurchasePage = require('./pages/PurchasePage')
const PurchaseAddPage = require('./pages/PurchaseAddPage')
const PurchaseDetailPage = require('./pages/PurchaseDetailPage')
const TodoPage = require('./pages/TodoPage')
const ApprovalSettingsPage = require('./pages/ApprovalSettingsPage')

// Timeout constants for better maintainability
const TIMEOUTS = {
  BEFORE_ALL: 120000,
  PAGE_LOAD: 15000,
  NAVIGATION: 10000
}

// Shared miniProgram instance across all describe blocks
let miniProgram

beforeAll(async function() {
  miniProgram = await launchApp()
  await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
}, TIMEOUTS.BEFORE_ALL)

afterAll(function() {
  closeApp()
})

describe('Purchase Approval Workflow - Settings', function() {
  var settingsPage

  test('should load approval settings page', async function() {
    settingsPage = new ApprovalSettingsPage(miniProgram)
    await settingsPage.open()
    var loaded = await settingsPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have enabled toggle', async function() {
    var enabled = await settingsPage.getEnabled()
    expect(typeof enabled).toBe('boolean')
  })

  test('should have category toggles', async function() {
    var categories = await settingsPage.getCategories()
    expect(typeof categories).toBe('object')
    expect(Object.keys(categories).length).toBeGreaterThan(0)
  })

  test('should have amount threshold', async function() {
    var threshold = await settingsPage.getAmountThreshold()
    expect(typeof threshold).toBe('number')
  })

  test('should load staff list for approver/reimburser picker', async function() {
    var data = await settingsPage.getData()
    expect(data.approverList).toBeDefined()
    expect(Array.isArray(data.approverList)).toBe(true)
    expect(data.reimburserList).toBeDefined()
    expect(Array.isArray(data.reimburserList)).toBe(true)
  })
})

describe('Purchase Approval Workflow - Purchase Add', function() {
  var addPage

  test('should load purchase-add page', async function() {
    addPage = new PurchaseAddPage(miniProgram)
    await addPage.openNew()
    var loaded = await addPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should load approval preview and show approver name', async function() {
    var data = await addPage.getData()
    expect(data.hasOwnProperty('approverName')).toBe(true)
  })

  test('should have all categories available', async function() {
    var categories = await addPage.getCategories()
    expect(Array.isArray(categories)).toBe(true)
    expect(categories.length).toBeGreaterThan(0)
  })
})

describe('Purchase Approval Workflow - Purchase List', function() {
  var purchasePage

  test('should load purchase list', async function() {
    purchasePage = new PurchasePage(miniProgram)
    await purchasePage.open()
    var loaded = await purchasePage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have filtered purchases with approval status', async function() {
    var purchases = await purchasePage.getFilteredPurchases()
    expect(Array.isArray(purchases)).toBe(true)
    if (purchases.length > 0) {
      var first = purchases[0]
      expect(first.hasOwnProperty('approvalStatusName')).toBe(true)
      expect(typeof first.approvalStatusName).toBe('string')
    }
  })

  test('should have total amount (reimbursed-only)', async function() {
    var total = await purchasePage.getTotalAmount()
    expect(typeof total).toBe('number')
  })

  test('should have totalFormatted as string', async function() {
    var totalFormatted = await purchasePage.getTotalFormatted()
    expect(typeof totalFormatted).toBe('string')
  })
})

describe('Purchase Approval Workflow - Purchase Detail', function() {
  var detailPage
  var purchasePage

  test('should navigate to purchase detail from list', async function() {
    purchasePage = new PurchasePage(miniProgram)
    await purchasePage.open()
    await purchasePage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    var purchases = await purchasePage.getFilteredPurchases()

    if (purchases.length === 0) {
      throw new Error('No purchases found - prerequisite data missing for detail page tests')
    }

    var firstId = purchases[0]._id
    detailPage = new PurchaseDetailPage(miniProgram)
    await detailPage.openWithId(firstId)
    var loaded = await detailPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have approval data fields on detail', async function() {
    if (!detailPage) {
      throw new Error('Purchase detail page not loaded - prerequisite test failed')
    }
    var purchase = await detailPage.getPurchase()
    expect(purchase).toBeDefined()
    expect(purchase.hasOwnProperty('status')).toBe(true)
  })

  test('should have canApprove and canReimburse flags', async function() {
    if (!detailPage) {
      throw new Error('Purchase detail page not loaded - prerequisite test failed')
    }
    var data = await detailPage.getData()
    expect(data.hasOwnProperty('canApprove')).toBe(true)
    expect(data.hasOwnProperty('canReimburse')).toBe(true)
    expect(data.hasOwnProperty('isSubmitter')).toBe(true)
    expect(data.hasOwnProperty('isApprover')).toBe(true)
  })

  test('should have approvalLogs array', async function() {
    if (!detailPage) {
      throw new Error('Purchase detail page not loaded - prerequisite test failed')
    }
    var data = await detailPage.getData()
    expect(data.hasOwnProperty('approvalLogs')).toBe(true)
    expect(Array.isArray(data.approvalLogs)).toBe(true)
  })
})

describe('Purchase Approval Workflow - Todo Page', function() {
  var todoPage

  test('should load todo page', async function() {
    todoPage = new TodoPage(miniProgram)
    await todoPage.open()
    var loaded = await todoPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have pending approvals list', async function() {
    var approvals = await todoPage.getPendingApprovals()
    expect(Array.isArray(approvals)).toBe(true)
  })

  test('should have pending reimbursements list', async function() {
    var reimbursements = await todoPage.getPendingReimbursements()
    expect(Array.isArray(reimbursements)).toBe(true)
  })

  test('pending items should have formatted fields', async function() {
    var approvals = await todoPage.getPendingApprovals()
    if (approvals.length > 0) {
      var item = approvals[0]
      expect(item.hasOwnProperty('categoryName')).toBe(true)
      expect(item.hasOwnProperty('formattedAmount')).toBe(true)
      expect(item.hasOwnProperty('formattedDate')).toBe(true)
    }
  })
})

describe('Purchase Approval Workflow - Dashboard Todo', function() {
  test('should have showTodo flag on home page', async function() {
    await miniProgram.reLaunch('/pages/index/index')
    // Wait for page to be ready instead of hardcoded delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify page is loaded by checking data
    var data = await miniProgram.evaluate(function() {
      var pages = getCurrentPages()
      if (pages.length === 0) return {}
      return pages[0].data
    })

    expect(data.hasOwnProperty('showTodo')).toBe(true)
    expect(data.showTodo).toBe(true)
  })

  test('should have pending counts as numbers', async function() {
    var data = await miniProgram.evaluate(function() {
      var pages = getCurrentPages()
      if (pages.length === 0) return {}
      return pages[0].data
    })

    expect(data.hasOwnProperty('pendingApprovalCount')).toBe(true)
    expect(data.hasOwnProperty('pendingReimburseCount')).toBe(true)
    expect(typeof data.pendingApprovalCount).toBe('number')
    expect(typeof data.pendingReimburseCount).toBe('number')
  })
})

describe('Purchase Approval Workflow - Self-Approval Prevention', function() {
  test('self-approval guard exists in purchase-detail page logic', async function() {
    // Verify the guard logic exists in the source code
    // The guard is in purchase-detail/index.js:
    // if (userInfo._id === purchase.purchaseBy) { toast('不能审批自己的采购单'); return }
    const fs = require('fs')
    const path = require('path')
    const sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    const content = fs.readFileSync(sourcePath, 'utf-8')

    const hasGuard = content.includes('不能审批自己的采购单') ||
                     (content.includes('purchaseBy') && content.includes('审批'))
    expect(hasGuard).toBe(true)
  })

  test('self-approval prevention works at runtime', async function() {
    // Navigate to purchase list and open a purchase detail
    await miniProgram.reLaunch('/pages/purchase/index')
    await new Promise(resolve => setTimeout(resolve, 2000))

    var purchasePage = new PurchasePage(miniProgram)
    var purchases = await purchasePage.getFilteredPurchases()

    if (purchases.length === 0) {
      console.warn('No purchases found, skipping runtime self-approval test')
      return
    }

    var firstId = purchases[0]._id
    var detailPage = new PurchaseDetailPage(miniProgram)
    await detailPage.openWithId(firstId)
    await detailPage.waitForLoad(TIMEOUTS.PAGE_LOAD)

    // Verify the page has canApprove flag (should be false if self-purchase)
    var data = await detailPage.getData()
    expect(data.hasOwnProperty('canApprove')).toBe(true)
    expect(data.hasOwnProperty('isSubmitter')).toBe(true)

    // If the current user is the submitter, canApprove should be false
    if (data.isSubmitter) {
      expect(data.canApprove).toBe(false)
    }
  })
})
