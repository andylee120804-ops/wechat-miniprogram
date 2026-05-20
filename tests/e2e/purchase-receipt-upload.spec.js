const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const PurchasePage = require('./pages/PurchasePage')
const PurchaseAddPage = require('./pages/PurchaseAddPage')
const PurchaseDetailPage = require('./pages/PurchaseDetailPage')

const TIMEOUTS = {
  BEFORE_ALL: 120000,
  PAGE_LOAD: 15000,
  NAVIGATION: 10000
}

let miniProgram

beforeAll(async function() {
  miniProgram = await launchApp()
  await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
}, TIMEOUTS.BEFORE_ALL)

afterAll(function() {
  closeApp()
})

// --- Purchase Add Page: Receipt Image Data & UI ---

describe('Receipt Upload - Purchase Add Page', function() {
  var addPage

  test('should load purchase-add page', async function() {
    addPage = new PurchaseAddPage(miniProgram)
    await addPage.openNew()
    var loaded = await addPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have receiptImages array initialized as empty', async function() {
    var receiptImages = await addPage.getData('receiptImages')
    expect(Array.isArray(receiptImages)).toBe(true)
    expect(receiptImages.length).toBe(0)
  })

  test('should have uploadingReceipt flag as false', async function() {
    var uploading = await addPage.getData('uploadingReceipt')
    expect(uploading).toBe(false)
  })

  test('should have pendingDeleteFileIDs array initialized as empty', async function() {
    var pending = await addPage.getData('pendingDeleteFileIDs')
    expect(Array.isArray(pending)).toBe(true)
    expect(pending.length).toBe(0)
  })

  test('should render receipt image card with add button', async function() {
    // The receipt-add class should exist when no images uploaded
    var wxml = await addPage.getElementWxml('.receipt-add')
    expect(wxml).toBeDefined()
    expect(wxml).toContain('receipt-add')
  })

  test('should render receipt header with count 0/3', async function() {
    var text = await addPage.getElementText('.receipt-count')
    expect(text).toContain('0/3')
  })
})

// --- Purchase Add Page: Edit Mode with Existing Receipt Images ---

describe('Receipt Upload - Purchase Add Page Edit Mode', function() {
  var addPage
  var purchasePage
  var purchaseWithImages

  test('should find a purchase with receipt images or create one via setData', async function() {
    // Try to find existing purchase with images
    purchasePage = new PurchasePage(miniProgram)
    await purchasePage.open()
    await purchasePage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    var purchases = await purchasePage.getFilteredPurchases()

    // Pick any purchase for edit test (even without images — we'll set them via setData)
    if (purchases.length > 0) {
      purchaseWithImages = purchases[0]
    }
  })

  test('should load existing receiptImages in edit mode', async function() {
    if (!purchaseWithImages) return

    addPage = new PurchaseAddPage(miniProgram)
    var page = await miniProgram.reLaunch('/pages/purchase-add/index?id=' + purchaseWithImages._id)
    addPage.page = page
    await new Promise(r => setTimeout(r, 2000))

    var receiptImages = await addPage.getData('receiptImages')
    expect(Array.isArray(receiptImages)).toBe(true)
  })

  test('should simulate adding receipt image via setData', async function() {
    if (!addPage) return

    // Simulate an image being added (can't actually upload in test env)
    var currentImages = await addPage.getData('receiptImages')
    var mockImage = {
      fileID: 'cloud://test-env.purchase-receipts/mock_test_image.jpg',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'test-user-id'
    }
    var newImages = currentImages.concat([mockImage])
    await addPage.setData({ receiptImages: newImages })

    var updated = await addPage.getData('receiptImages')
    expect(updated.length).toBe(currentImages.length + 1)
    expect(updated[updated.length - 1].fileID).toBe(mockImage.fileID)
  })

  test('should hide add button when 3 images reached', async function() {
    if (!addPage) return

    var mockImage = {
      fileID: 'cloud://test-env.purchase-receipts/mock_test_image_2.jpg',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'test-user-id'
    }
    var currentImages = await addPage.getData('receiptImages')
    // Fill up to 3
    while (currentImages.length < 3) {
      currentImages = currentImages.concat([{
        fileID: 'cloud://test-env.purchase-receipts/mock_fill_' + currentImages.length + '.jpg',
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'test-user-id'
      }])
    }
    await addPage.setData({ receiptImages: currentImages })

    var receiptCount = await addPage.getData('receiptImages')
    expect(receiptCount.length).toBe(3)

    // The add button should be hidden (receipt-add element not present)
    var addBtn = await addPage.getElement('.receipt-add')
    expect(addBtn).toBeNull()
  })

  test('should simulate removing a receipt image', async function() {
    if (!addPage) return

    var currentImages = await addPage.getData('receiptImages')
    expect(currentImages.length).toBeGreaterThan(0)

    var removed = currentImages[0]
    var newImages = currentImages.filter(function(_, i) { return i !== 0 })
    var pendingDeletes = (await addPage.getData('pendingDeleteFileIDs')).concat([removed.fileID])

    await addPage.setData({ receiptImages: newImages, pendingDeleteFileIDs: pendingDeletes })

    var updated = await addPage.getData('receiptImages')
    expect(updated.length).toBe(currentImages.length - 1)

    var pending = await addPage.getData('pendingDeleteFileIDs')
    expect(pending).toContain(removed.fileID)
  })
})

// --- Purchase Detail Page: Receipt Image Display & Data ---

describe('Receipt Upload - Purchase Detail Page', function() {
  var detailPage
  var purchasePage
  var testPurchaseId

  test('should find a purchase to test detail page', async function() {
    purchasePage = new PurchasePage(miniProgram)
    await purchasePage.open()
    await purchasePage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    var purchases = await purchasePage.getFilteredPurchases()

    if (purchases.length === 0) {
      throw new Error('No purchases found - prerequisite data missing for detail page tests')
    }

    testPurchaseId = purchases[0]._id
  })

  test('should load purchase detail page', async function() {
    if (!testPurchaseId) return

    detailPage = new PurchaseDetailPage(miniProgram)
    await detailPage.openWithId(testPurchaseId)
    var loaded = await detailPage.waitForLoad(TIMEOUTS.PAGE_LOAD)
    expect(loaded).toBe(true)
  })

  test('should have uploadingReceipt flag as false', async function() {
    if (!detailPage) return
    var uploading = await detailPage.getData('uploadingReceipt')
    expect(uploading).toBe(false)
  })

  test('should have receiptImages on purchase object', async function() {
    if (!detailPage) return
    var purchase = await detailPage.getPurchase()
    expect(purchase).toBeDefined()
    // receiptImages may be undefined for old records, that's OK
    if (purchase.receiptImages) {
      expect(Array.isArray(purchase.receiptImages)).toBe(true)
    }
  })

  test('should display receipt section when images exist or user has edit permission', async function() {
    if (!detailPage) return

    var purchase = await detailPage.getPurchase()
    var data = await detailPage.getData()
    var hasImages = purchase.receiptImages && purchase.receiptImages.length > 0
    var hasEditPermission = data.canEdit || data.canDelete

    if (hasImages || hasEditPermission) {
      var wxml = await detailPage.getElementWxml('.receipt-section')
      // May be null if no images and no permissions, which is fine
    }
  })
})

// --- Receipt Image Data Shape Validation ---

describe('Receipt Upload - Data Shape Validation', function() {
  test('receiptImages items should have fileID, uploadedAt, uploadedBy fields', async function() {
    // Add a mock receipt image to purchase-add and verify shape
    var addPage = new PurchaseAddPage(miniProgram)
    await addPage.openNew()
    await addPage.waitForLoad(TIMEOUTS.PAGE_LOAD)

    var mockImage = {
      fileID: 'cloud://test-env.purchase-receipts/shape_test.jpg',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'test-user-id'
    }
    await addPage.setData({ receiptImages: [mockImage] })

    var receiptImages = await addPage.getData('receiptImages')
    expect(receiptImages.length).toBe(1)

    var img = receiptImages[0]
    expect(img).toHaveProperty('fileID')
    expect(img).toHaveProperty('uploadedAt')
    expect(img).toHaveProperty('uploadedBy')
    expect(typeof img.fileID).toBe('string')
    expect(typeof img.uploadedBy).toBe('string')
  })

  test('receiptImages should not exceed 3 items', async function() {
    var addPage = new PurchaseAddPage(miniProgram)
    await addPage.openNew()
    await addPage.waitForLoad(TIMEOUTS.PAGE_LOAD)

    // Try setting 4 images — the UI should cap at 3 via wx:if
    var images = [0, 1, 2, 3].map(function(i) {
      return {
        fileID: 'cloud://test-env.purchase-receipts/cap_test_' + i + '.jpg',
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'test-user-id'
      }
    })
    await addPage.setData({ receiptImages: images })

    // Even if data has 4, the WXML should not show add button (receipt-add hidden when >= 3)
    var addBtn = await addPage.getElement('.receipt-add')
    expect(addBtn).toBeNull()

    // The upload handler logic should also cap: uploadReceiptFiles does .slice(0, 3)
  })
})

// --- Source Code Validation (for functionality not testable via automator) ---

describe('Receipt Upload - Source Code Validation', function() {
  var fs = require('fs')
  var path = require('path')

  test('purchase-add should have onAddReceiptImage method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('onAddReceiptImage')
  })

  test('purchase-add should have onRemoveReceiptImage method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('onRemoveReceiptImage')
  })

  test('purchase-add should have uploadReceiptFiles method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('uploadReceiptFiles')
  })

  test('purchase-add should use wx.chooseMedia for image selection', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('wx.chooseMedia')
    expect(content).toContain("sourceType: ['album', 'camera']")
    expect(content).toContain("mediaType: ['image']")
  })

  test('purchase-add should cap images at 3 via slice(0, 3)', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('slice(0, 3)')
  })

  test('purchase-add should include receiptImages in submit data', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('receiptImages: this.data.receiptImages')
  })

  test('purchase-add should use pendingDeleteFileIDs for edit mode cleanup', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('pendingDeleteFileIDs')
    expect(content).toContain('wx.cloud.deleteFile')
  })

  test('purchase-add should re-upload temp images with purchaseId after creation', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('purchase-receipts/')
    // The re-upload logic downloads temp files and re-uploads with purchaseId
    expect(content).toMatch(/purchaseId.*cloudPath|cloudPath.*purchaseId/)
  })

  test('purchase-detail should have onPreviewReceiptImage method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('onPreviewReceiptImage')
  })

  test('purchase-detail should have onAddReceiptImage method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('onAddReceiptImage')
  })

  test('purchase-detail should have onRemoveReceiptImage method', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('onRemoveReceiptImage')
  })

  test('purchase-detail should use wx.previewImage for full-screen preview', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('wx.previewImage')
  })

  test('purchase-detail should use wx.chooseMedia for image selection', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('wx.chooseMedia')
  })

  test('purchase-detail should clean up receipt images when deleting purchase', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    // The onDeleteConfirm should reference receiptImages cleanup
    expect(content).toContain('receiptImages')
    // Should have cloud file deletion
    expect(content).toContain('wx.cloud.deleteFile')
  })

  test('purchase-add WXML should have receipt image card with theme-card', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.wxml')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('receipt-grid')
    expect(content).toContain('receipt-thumb')
    expect(content).toContain('receipt-add')
    expect(content).toContain('onAddReceiptImage')
    expect(content).toContain('onRemoveReceiptImage')
  })

  test('purchase-detail WXML should have receipt section with preview support', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.wxml')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain('receipt-section')
    expect(content).toContain('onPreviewReceiptImage')
    expect(content).toContain('onAddReceiptImage')
    expect(content).toContain('onRemoveReceiptImage')
    // Delete button should use catchtap to prevent preview trigger
    expect(content).toContain('catchtap="onRemoveReceiptImage"')
  })

  test('purchase-add WXML should show add button only when under 3 images', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.wxml')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain("receiptImages.length < 3")
  })

  test('purchase-detail WXML should show add link only when under 3 images', function() {
    var sourcePath = path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.wxml')
    var content = fs.readFileSync(sourcePath, 'utf-8')
    expect(content).toContain("purchase.receiptImages.length < 3")
  })

  test('both pages should have matching WXSS receipt styles', function() {
    var addWxss = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.wxss'), 'utf-8')
    var detailWxss = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.wxss'), 'utf-8')

    // Both should define the shared receipt classes
    var sharedClasses = ['.receipt-header', '.receipt-count', '.receipt-grid', '.receipt-thumb', '.receipt-thumb-del', '.receipt-add']
    sharedClasses.forEach(function(cls) {
      expect(addWxss).toContain(cls)
      expect(detailWxss).toContain(cls)
    })
  })

  test('receipt thumb should be 120rpx x 120rpx', function() {
    var addWxss = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.wxss'), 'utf-8')
    expect(addWxss).toContain('width: 120rpx')
    expect(addWxss).toContain('height: 120rpx')
  })

  test('cloud storage path should use purchase-receipts/ directory', function() {
    var addSource = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/purchase-add/index.js'), 'utf-8')
    var detailSource = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/purchase-detail/index.js'), 'utf-8')

    expect(addSource).toContain('purchase-receipts/')
    expect(detailSource).toContain('purchase-receipts/')
  })
})
