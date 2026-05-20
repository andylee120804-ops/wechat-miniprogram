# 采购单据照片上传功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add receipt photo upload (max 3 images) to purchase-add and purchase-detail pages, with camera+album source, preview, delete, and cloud storage persistence.

**Architecture:** Images stored as `receiptImages` array inside purchase documents. Cloud storage path `purchase-receipts/{purchaseId}_{timestamp}.jpg`. Upload uses `wx.chooseMedia` + `wx.cloud.uploadFile`. Detail page operates on DB directly; add page batches with form submit.

**Tech Stack:** WeChat Mini Program (WXML/WXSS/JS), wx.cloud storage, existing db.js helpers, existing theme-card/theme-badge components.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `miniprogram/pages/purchase-add/index.js` | Add receipt image data, upload/delete handlers, submit logic |
| Modify | `miniprogram/pages/purchase-add/index.wxml` | Add receipt images card UI |
| Modify | `miniprogram/pages/purchase-add/index.wxss` | Add receipt image thumbnail styles |
| Modify | `miniprogram/pages/purchase-detail/index.js` | Add receipt image load, preview, upload, delete handlers |
| Modify | `miniprogram/pages/purchase-detail/index.wxml` | Add receipt images card UI |
| Modify | `miniprogram/pages/purchase-detail/index.wxss` | Add receipt image thumbnail styles |

No new files needed. No new cloud functions needed. No new collections needed.

---

### Task 1: Add receipt image styles to purchase-add

**Files:**
- Modify: `miniprogram/pages/purchase-add/index.wxss`

- [ ] **Step 1: Add receipt image CSS rules at the end of purchase-add/index.wxss**

```css
/* Receipt Images */
.receipt-section {
  margin-top: 16rpx;
}

.receipt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.receipt-count {
  font-size: 22rpx;
}

.receipt-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.receipt-thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  position: relative;
  overflow: hidden;
}

.receipt-thumb-image {
  width: 100%;
  height: 100%;
}

.receipt-thumb-del {
  position: absolute;
  top: 0;
  right: 0;
  width: 32rpx;
  height: 32rpx;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.receipt-thumb-del text {
  font-size: 20rpx;
  color: #F87171;
  line-height: 1;
}

.receipt-add {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.receipt-add-icon {
  font-size: 44rpx;
  line-height: 1;
}

.receipt-add-text {
  font-size: 18rpx;
  margin-top: 4rpx;
}
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/pages/purchase-add/index.wxss
git commit -m "feat: add receipt image thumbnail styles for purchase-add"
```

---

### Task 2: Add receipt image UI to purchase-add WXML

**Files:**
- Modify: `miniprogram/pages/purchase-add/index.wxml`

- [ ] **Step 1: Insert the receipt images card after the remark card (after line 104 `</theme-card>`) and before the approver row (line 107)**

Insert this block between the closing `</theme-card>` of the remark section and the `<!-- 审批人展示 -->` comment:

```xml
    <!-- Receipt Images -->
    <theme-card theme="{{theme}}" class="mt-md">
      <view class="p-lg">
        <view class="receipt-header">
          <text class="text-bodySmall" style="color: {{theme.textPrimary || '#F5F0E8'}}; font-weight: 600;">单据照片</text>
          <text class="receipt-count" style="color: {{theme.textMuted || '#5C5C72'}};">{{receiptImages.length}}/3</text>
        </view>
        <view class="receipt-grid">
          <view class="receipt-thumb" wx:for="{{receiptImages}}" wx:key="fileID">
            <image class="receipt-thumb-image" src="{{item.fileID}}" mode="aspectFill" />
            <view class="receipt-thumb-del" data-index="{{index}}" bindtap="onRemoveReceiptImage">
              <text>×</text>
            </view>
          </view>
          <view class="receipt-add" wx:if="{{receiptImages.length < 3}}"
            style="background: rgba(201,169,110,0.1); border: 1.5rpx dashed rgba(201,169,110,0.4);"
            bindtap="onAddReceiptImage">
            <text class="receipt-add-icon" style="color: {{theme.accentColor || '#C9A96E'}};">+</text>
            <text class="receipt-add-text" style="color: {{theme.textMuted || '#5C5C72'}};">上传</text>
          </view>
        </view>
      </view>
    </theme-card>
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/pages/purchase-add/index.wxml
git commit -m "feat: add receipt images card UI to purchase-add page"
```

---

### Task 3: Add receipt image logic to purchase-add JS

**Files:**
- Modify: `miniprogram/pages/purchase-add/index.js`

- [ ] **Step 1: Add `receiptImages` and `uploadingReceipt` to data**

In the `data:` object (after line 23 `approverName: ''`), add:

```javascript
    receiptImages: [],
    uploadingReceipt: false,
    pendingDeleteFileIDs: [],
```

- [ ] **Step 2: Load existing receiptImages in edit mode**

In the `loadPurchase` method, inside the `that.setData({...})` call (around line 172), add `receiptImages` to the setData:

Find this block:
```javascript
      that.setData({
        item: data.item || '',
        amount: data.amount !== undefined ? String(data.amount) : '',
        category: data.category || 'meat',
        date: data.date || formatDate(new Date()),
        remark: data.remark || ''
      })
```

Replace with:
```javascript
      that.setData({
        item: data.item || '',
        amount: data.amount !== undefined ? String(data.amount) : '',
        category: data.category || 'meat',
        date: data.date || formatDate(new Date()),
        remark: data.remark || '',
        receiptImages: data.receiptImages || []
      })
```

- [ ] **Step 3: Add `onAddReceiptImage` handler**

Insert after the `onRemarkInput` method (after line 223):

```javascript
  onAddReceiptImage: function() {
    var that = this
    if (this.data.uploadingReceipt) return
    var remaining = 3 - this.data.receiptImages.length
    if (remaining <= 0) return

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function(res) {
        var files = res.tempFiles || []
        that.uploadReceiptFiles(files)
      }
    })
  },

  uploadReceiptFiles: function(files) {
    var that = this
    if (!files || files.length === 0) return

    that.setData({ uploadingReceipt: true })
    wx.showLoading({ title: '上传中' })

    var uploadPromises = files.map(function(file, index) {
      var ext = file.tempFilePath.match(/\.\w+$/)
      var extStr = ext ? ext[0] : '.jpg'
      var cloudPath = 'purchase-receipts/temp_' + Date.now() + '_' + index + extStr

      return new Promise(function(resolve, reject) {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: file.tempFilePath,
          success: function(uploadRes) {
            var userInfo = app.globalData.userInfo || {}
            resolve({
              fileID: uploadRes.fileID,
              uploadedAt: new Date(),
              uploadedBy: userInfo._id || ''
            })
          },
          fail: function(err) {
            console.warn('上传单据图片失败:', err)
            reject(err)
          }
        })
      })
    })

    Promise.all(uploadPromises).then(function(results) {
      var newImages = that.data.receiptImages.concat(results).slice(0, 3)
      that.setData({ receiptImages: newImages, uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    }).catch(function(err) {
      that.setData({ uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    })
  },

  onRemoveReceiptImage: function(e) {
    var that = this
    var index = e.currentTarget.dataset.index
    var removed = this.data.receiptImages[index]
    if (!removed) return

    wx.showModal({
      title: '删除确认',
      content: '确定删除该单据照片吗？',
      confirmColor: '#F87171',
      success: function(res) {
        if (!res.confirm) return
        var newImages = that.data.receiptImages.filter(function(_, i) { return i !== index })
        var pendingDeletes = that.data.pendingDeleteFileIDs
        if (removed.fileID) {
          pendingDeletes = pendingDeletes.concat([removed.fileID])
        }
        that.setData({ receiptImages: newImages, pendingDeleteFileIDs: pendingDeletes })
      }
    })
  },
```

- [ ] **Step 4: Update `onSubmit` to include receiptImages**

In the `onSubmit` method, find the `const data = {` block (around line 250). Add `receiptImages` after the `remark` line:

Find:
```javascript
      remark: this.data.remark.trim(),
      sourceReservationId: this.data.sourceReservationId || '',
```

Replace with:
```javascript
      remark: this.data.remark.trim(),
      receiptImages: this.data.receiptImages,
      sourceReservationId: this.data.sourceReservationId || '',
```

- [ ] **Step 5: After new purchase addDoc succeeds, update receipt image cloudPaths**

In the `onSubmit` method, inside the `db.addDoc` success handler (around line 322), after `var result = ...`, we need to rename cloud files to use the real purchaseId. But since `wx.cloud` has no rename API, we keep the `temp_` prefix for new purchases — the fileID is already valid and stored. No extra step needed for new purchases.

However, for the **edit mode** `db.updateDoc` success handler (around line 306), after the update succeeds, clean up pending deleted cloud files:

Find the edit-mode updateDoc success handler:
```javascript
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, data).then(function() {
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_UPDATE, '更新采购: ' + data.item, { id: that.data.id, amount: data.amount })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function() { wx.navigateBack() }, 1500)
      })
```

Replace with:
```javascript
      db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, data).then(function() {
        // Clean up deleted images from cloud storage
        if (that.data.pendingDeleteFileIDs.length > 0) {
          wx.cloud.deleteFile({ fileList: that.data.pendingDeleteFileIDs }).catch(function(e) {
            console.warn('清理云存储图片失败:', e)
          })
        }
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_UPDATE, '更新采购: ' + data.item, { id: that.data.id, amount: data.amount })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function() { wx.navigateBack() }, 1500)
      })
```

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/purchase-add/index.js
git commit -m "feat: add receipt image upload/delete logic to purchase-add"
```

---

### Task 4: Add receipt image styles to purchase-detail

**Files:**
- Modify: `miniprogram/pages/purchase-detail/index.wxss`

- [ ] **Step 1: Add receipt image CSS rules at the end of purchase-detail/index.wxss**

```css
/* Receipt Images */
.receipt-section {
  padding: 0 8rpx;
}

.receipt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.receipt-header-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.receipt-count {
  font-size: 22rpx;
}

.receipt-add-link {
  font-size: 24rpx;
}

.receipt-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.receipt-thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  position: relative;
  overflow: hidden;
}

.receipt-thumb-image {
  width: 100%;
  height: 100%;
}

.receipt-thumb-del {
  position: absolute;
  top: 0;
  right: 0;
  width: 32rpx;
  height: 32rpx;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.receipt-thumb-del text {
  font-size: 20rpx;
  color: #F87171;
  line-height: 1;
}

.receipt-add {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.receipt-add-icon {
  font-size: 44rpx;
  line-height: 1;
}

.receipt-add-text {
  font-size: 18rpx;
  margin-top: 4rpx;
}
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/pages/purchase-detail/index.wxss
git commit -m "feat: add receipt image thumbnail styles for purchase-detail"
```

---

### Task 5: Add receipt image UI to purchase-detail WXML

**Files:**
- Modify: `miniprogram/pages/purchase-detail/index.wxml`

- [ ] **Step 1: Insert the receipt images card after the detail card (after line 70 `</theme-card>`) and before the approval log section (line 73 `<!-- Approval Log Timeline -->`)**

Insert this block between the closing `</theme-card>` of the detail section and the `<!-- Approval Log Timeline -->` comment:

```xml
    <!-- Receipt Images -->
    <view class="receipt-section mt-lg" wx:if="{{purchase.receiptImages.length > 0 || canEdit || canDelete}}">
      <text class="text-subtitle" style="display: block; color: {{theme.textSecondary || '#9A9AB0'}}; margin-bottom: 16rpx;">单据照片</text>
      <view style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; border: 1rpx solid {{theme.borderColor || 'rgba(255,255,255,0.10)'}}; border-radius: 16rpx; padding: 20rpx;">
        <view class="receipt-header">
          <view class="receipt-header-right">
            <text class="receipt-count" style="color: {{theme.textMuted || '#5C5C72'}};">{{purchase.receiptImages.length || 0}}/3</text>
            <text class="receipt-add-link" style="color: {{theme.accentColor || '#C9A96E'}};" bindtap="onAddReceiptImage" wx:if="{{(purchase.receiptImages || []).length < 3}}">+ 添加</text>
          </view>
        </view>
        <view class="receipt-grid">
          <view class="receipt-thumb" wx:for="{{purchase.receiptImages}}" wx:key="fileID" data-index="{{index}}" bindtap="onPreviewReceiptImage">
            <image class="receipt-thumb-image" src="{{item.fileID}}" mode="aspectFill" />
            <view class="receipt-thumb-del" data-index="{{index}}" catchtap="onRemoveReceiptImage">
              <text>×</text>
            </view>
          </view>
          <view class="receipt-add" wx:if="{{(purchase.receiptImages || []).length < 3}}"
            style="background: rgba(201,169,110,0.1); border: 1.5rpx dashed rgba(201,169,110,0.4);"
            bindtap="onAddReceiptImage">
            <text class="receipt-add-icon" style="color: {{theme.accentColor || '#C9A96E'}};">+</text>
            <text class="receipt-add-text" style="color: {{theme.textMuted || '#5C5C72'}};">上传</text>
          </view>
        </view>
      </view>
    </view>
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/pages/purchase-detail/index.wxml
git commit -m "feat: add receipt images card UI to purchase-detail page"
```

---

### Task 6: Add receipt image logic to purchase-detail JS

**Files:**
- Modify: `miniprogram/pages/purchase-detail/index.js`

- [ ] **Step 1: Add `uploadingReceipt` to data**

In the `data:` object (after line 25 `approvalLogs: []`), add:

```javascript
    uploadingReceipt: false,
```

- [ ] **Step 2: Add `onPreviewReceiptImage` handler**

Insert after the `loadApprovalLogs` method (after line 118):

```javascript
  onPreviewReceiptImage: function(e) {
    var index = e.currentTarget.dataset.index
    var images = this.data.purchase.receiptImages || []
    var urls = images.map(function(img) { return img.fileID })
    if (urls.length === 0) return
    wx.previewImage({
      current: urls[index] || urls[0],
      urls: urls
    })
  },

  onAddReceiptImage: function() {
    var that = this
    if (this.data.uploadingReceipt) return
    var currentImages = this.data.purchase.receiptImages || []
    var remaining = 3 - currentImages.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function(res) {
        var files = res.tempFiles || []
        that.uploadReceiptFiles(files)
      }
    })
  },

  uploadReceiptFiles: function(files) {
    var that = this
    if (!files || files.length === 0) return
    var purchaseId = that.data.id

    that.setData({ uploadingReceipt: true })
    wx.showLoading({ title: '上传中' })

    var uploadPromises = files.map(function(file, index) {
      var ext = file.tempFilePath.match(/\.\w+$/)
      var extStr = ext ? ext[0] : '.jpg'
      var cloudPath = 'purchase-receipts/' + purchaseId + '_' + Date.now() + '_' + index + extStr

      return new Promise(function(resolve, reject) {
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: file.tempFilePath,
          success: function(uploadRes) {
            var userInfo = app.globalData.userInfo || {}
            resolve({
              fileID: uploadRes.fileID,
              uploadedAt: new Date(),
              uploadedBy: userInfo._id || ''
            })
          },
          fail: function(err) {
            console.warn('上传单据图片失败:', err)
            reject(err)
          }
        })
      })
    })

    Promise.all(uploadPromises).then(function(results) {
      var currentImages = that.data.purchase.receiptImages || []
      var newImages = currentImages.concat(results).slice(0, 3)

      return db.updateDoc(COLLECTIONS.PURCHASE, purchaseId, {
        receiptImages: newImages
      }).then(function() {
        that.setData({
          'purchase.receiptImages': newImages,
          uploadingReceipt: false
        })
        wx.hideLoading()
        wx.showToast({ title: '上传成功', icon: 'success' })
      })
    }).catch(function(err) {
      that.setData({ uploadingReceipt: false })
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
      console.warn('上传单据图片失败:', err)
    })
  },

  onRemoveReceiptImage: function(e) {
    var that = this
    var index = e.currentTarget.dataset.index
    var currentImages = this.data.purchase.receiptImages || []
    var removed = currentImages[index]
    if (!removed) return

    wx.showModal({
      title: '删除确认',
      content: '确定删除该单据照片吗？',
      confirmColor: '#F87171',
      success: function(res) {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中' })

        var newImages = currentImages.filter(function(_, i) { return i !== index })

        db.updateDoc(COLLECTIONS.PURCHASE, that.data.id, {
          receiptImages: newImages
        }).then(function() {
          that.setData({ 'purchase.receiptImages': newImages })
          // Delete cloud file (best-effort)
          if (removed.fileID) {
            wx.cloud.deleteFile({ fileList: [removed.fileID] }).catch(function(e) {
              console.warn('删除云存储图片失败:', e)
            })
          }
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function(err) {
          wx.hideLoading()
          handleCloudError(err, '删除单据照片')
        })
      }
    })
  },
```

- [ ] **Step 3: Update onDeleteConfirm to also clean up receipt cloud files**

In the `onDeleteConfirm` method, find the `db.deleteDoc` success handler (around line 324):

```javascript
    db.deleteDoc(COLLECTIONS.PURCHASE, that.data.id).then(function() {
      wx.hideLoading()
```

Replace with:

```javascript
    db.deleteDoc(COLLECTIONS.PURCHASE, that.data.id).then(function() {
      // Clean up receipt images from cloud storage
      var receiptImages = that.data.purchase.receiptImages || []
      var fileIDs = receiptImages.map(function(img) { return img.fileID }).filter(Boolean)
      if (fileIDs.length > 0) {
        wx.cloud.deleteFile({ fileList: fileIDs }).catch(function(e) {
          console.warn('清理云存储单据图片失败:', e)
        })
      }
      wx.hideLoading()
```

- [ ] **Step 4: Commit**

```bash
git add miniprogram/pages/purchase-detail/index.js
git commit -m "feat: add receipt image upload/delete/preview logic to purchase-detail"
```

---

### Task 7: Handle new-purchase receipt image upload (no purchaseId yet)

**Files:**
- Modify: `miniprogram/pages/purchase-add/index.js`

- [ ] **Step 1: Update `onSubmit` to upload images after purchase creation for new purchases**

In the `onSubmit` method, inside the **new purchase** branch (the `else` block starting around line 316), after `db.addDoc` succeeds, we need to rename cloud paths and update the receiptImages with the real purchaseId.

Find the new-purchase addDoc success handler:
```javascript
      db.addDoc(COLLECTIONS.PURCHASE, data).then(function(result) {
        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_CREATE, '新增采购: ' + data.item, { amount: data.amount, category: data.category })
```

Replace with:
```javascript
      db.addDoc(COLLECTIONS.PURCHASE, data).then(function(result) {
        // Update receipt image cloudPaths to use real purchaseId
        var purchaseId = result._id
        var receiptImages = that.data.receiptImages
        if (receiptImages.length > 0) {
          // Re-upload images with proper cloudPath using purchaseId
          var reuploadPromises = receiptImages.map(function(img, idx) {
            return new Promise(function(resolve) {
              // Download existing temp file then re-upload with proper path
              wx.cloud.downloadFile({
                fileID: img.fileID,
                success: function(dlRes) {
                  var newCloudPath = 'purchase-receipts/' + purchaseId + '_' + Date.now() + '_' + idx + '.jpg'
                  wx.cloud.uploadFile({
                    cloudPath: newCloudPath,
                    filePath: dlRes.tempFilePath,
                    success: function(uploadRes) {
                      // Delete the old temp file
                      wx.cloud.deleteFile({ fileList: [img.fileID] }).catch(function() {})
                      resolve({
                        fileID: uploadRes.fileID,
                        uploadedAt: img.uploadedAt,
                        uploadedBy: img.uploadedBy
                      })
                    },
                    fail: function() {
                      // Keep original if re-upload fails
                      resolve(img)
                    }
                  })
                },
                fail: function() {
                  resolve(img)
                }
              })
            })
          })

          Promise.all(reuploadPromises).then(function(finalImages) {
            db.updateDoc(COLLECTIONS.PURCHASE, purchaseId, { receiptImages: finalImages }).catch(function(e) {
              console.warn('更新单据图片路径失败:', e)
            })
          })
        }

        wx.hideLoading()
        log(LOG_TYPES.PURCHASE_CREATE, '新增采购: ' + data.item, { amount: data.amount, category: data.category })
```

- [ ] **Step 2: Commit**

```bash
git add miniprogram/pages/purchase-add/index.js
git commit -m "feat: re-upload receipt images with proper purchaseId after creation"
```

---

### Task 8: Visual verification in WeChat DevTools

**Files:** None (manual testing)

- [ ] **Step 1: Open WeChat DevTools and compile the project**

- [ ] **Step 2: Test purchase-add page — new purchase**
  - Navigate to purchase-add page
  - Verify receipt images card appears below remark card
  - Tap + button, choose an image from album
  - Verify thumbnail appears with × delete button
  - Tap × to delete, confirm modal appears, confirm → image removed
  - Upload up to 3 images, verify + button hides at 3
  - Submit the purchase, verify images saved (check cloud database)

- [ ] **Step 3: Test purchase-detail page**
  - Open a purchase record that has receipt images
  - Verify images display in the receipt card
  - Tap an image → verify `wx.previewImage` opens full screen
  - Tap + 添加 → upload additional image
  - Tap × on an image → confirm delete → image removed from DB and cloud

- [ ] **Step 4: Test purchase-add page — edit mode**
  - Open a purchase with existing receipt images in edit mode
  - Verify existing images load
  - Add a new image, remove an existing one
  - Save → verify changes persisted

- [ ] **Step 5: Test edge cases**
  - Upload with no network → verify error toast
  - Open detail page with purchase that has no images → verify empty state with + upload
  - Delete entire purchase record with images → verify cloud files cleaned up

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address visual testing issues for receipt image upload"
```
