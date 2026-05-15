# 宴会菜价自动同步采购 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "宴会菜价" category to purchase module and auto-sync reservation dishPrice to purchase records.

**Architecture:** Add `banquet` category to existing purchase category system. In reservation submit flow, sync dishPrice to purchase collection with `sourceReservationId` linking. In reservation cancel flow, remove linked purchase records.

**Tech Stack:** WeChat Mini Program, Cloud Database, 17 existing pages/components

---

### Task 1: Add 'banquet' category to helpers.js

**Files:**
- Modify: `miniprogram/utils/helpers.js:161-174`

- [ ] **Step 1: Add 'banquet' mapping to `getCategoryName()`**

Edit `miniprogram/utils/helpers.js`, in `getCategoryName()` add `banquet: '宴会菜价'`:

```js
function getCategoryName(category) {
  const categoryMap = {
    meat: '肉类',
    seafood: '海鲜',
    vegetable: '蔬菜',
    fruit: '水果',
    drink: '饮品',
    seasoning: '调味品',
    supplies: '日用品',
    equipment: '设备',
    banquet: '宴会菜价',
    other: '其他'
  }
  return categoryMap[category] || category || '其他'
}
```

- [ ] **Step 2: Verify change works** — No test needed, function is pure and trivial.

---

### Task 2: Add 'banquet' to purchase list page category filter

**Files:**
- Modify: `miniprogram/pages/purchase/index.js:8-19`

- [ ] **Step 1: Add 'banquet' entry to ALL_CATEGORIES**

```js
const ALL_CATEGORIES = [
  { id: '', name: '全部', count: 0 },
  { id: 'meat', name: '肉类', count: 0 },
  { id: 'seafood', name: '海鲜', count: 0 },
  { id: 'vegetable', name: '蔬菜', count: 0 },
  { id: 'fruit', name: '水果', count: 0 },
  { id: 'drink', name: '饮品', count: 0 },
  { id: 'seasoning', name: '调味品', count: 0 },
  { id: 'supplies', name: '日用品', count: 0 },
  { id: 'equipment', name: '设备', count: 0 },
  { id: 'banquet', name: '宴会菜价', count: 0 },
  { id: 'other', name: '其他', count: 0 }
]
```

- [ ] **Step 2: No WXML change needed** — `filter-chips` already renders dynamically from `ALL_CATEGORIES`.

---

### Task 3: Add 'banquet' to purchase-add page category selector

**Files:**
- Modify: `miniprogram/pages/purchase-add/index.js:24-35`
- Modify: `miniprogram/pages/purchase-add/index.wxml` (no change needed — renders from `categoryOptions` dynamically)

- [ ] **Step 1: Add 'banquet' option to categoryOptions**

```js
categoryOptions: [
  { value: 'meat', label: '肉类' },
  { value: 'seafood', label: '海鲜' },
  { value: 'vegetable', label: '蔬菜' },
  { value: 'fruit', label: '水果' },
  { value: 'drink', label: '饮品' },
  { value: 'seasoning', label: '调味品' },
  { value: 'supplies', label: '日用品' },
  { value: 'equipment', label: '设备' },
  { value: 'banquet', label: '宴会菜价' },
  { value: 'other', label: '其他' }
]
```

- [ ] **Step 2: No WXML change needed** — pills render from `categoryOptions` dynamically.

---

### Task 4: Auto-sync dishPrice to purchase in reservation-add onSubmit

**Files:**
- Modify: `miniprogram/pages/reservation-add/index.js:331-426`

This is the core logic. After the reservation is saved (both create and edit), sync to purchase collection.

- [ ] **Step 1: Add helper function to sync banquet purchase record**

Add a new method `syncBanquetPurchase(docData, reservationId)` to the page:

```js
/**
 * Sync dishPrice to purchase collection as banquet category
 */
async syncBanquetPurchase(docData, reservationId) {
  try {
    const dishPrice = docData.dishPrice
    const dbCmd = db.getDb().command

    // Look for existing banquet purchase linked to this reservation
    const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
      sourceReservationId: reservationId
    })

    if (dishPrice > 0) {
      const remark = (docData.customerName || '') + ' - ' + (docData.roomName || '')
      const purchaseData = {
        amount: dishPrice,
        category: 'banquet',
        date: typeof docData.date === 'object'
          ? docData.date.getFullYear() + '-' + String(docData.date.getMonth() + 1).padStart(2, '0') + '-' + String(docData.date.getDate()).padStart(2, '0')
          : docData.date,
        remark: remark,
        item: '',
        purchaseBy: docData.createdBy || docData.purchaseBy || '',
        purchaseByName: docData.createdByName || docData.purchaseByName || '',
        sourceReservationId: reservationId
      }
      if (!purchaseData.purchaseBy) {
        delete purchaseData.purchaseBy
        delete purchaseData.purchaseByName
      }

      if (existing.data && existing.data.length > 0) {
        // Update existing record
        await db.updateDoc(COLLECTIONS.PURCHASE, existing.data[0]._id, purchaseData)
      } else {
        // Create new record
        await db.addDoc(COLLECTIONS.PURCHASE, purchaseData)
      }
    } else {
      // dishPrice is 0 or empty — delete any existing linked purchase
      if (existing.data && existing.data.length > 0) {
        await db.deleteDoc(COLLECTIONS.PURCHASE, existing.data[0]._id)
      }
    }
    return true
  } catch (err) {
    console.warn('[banquet-sync] 同步宴会菜价失败:', err)
    // Don't throw — sync failure should not block reservation save
    return false
  }
}
```

- [ ] **Step 2: Call syncBanquetPurchase after reservation save**

In `onSubmit`, after the successful save (after `db.addDoc` or `db.updateDoc`), add the sync call.

For **create** flow (after line 411 `const result = await db.addDoc(...)`):

```js
// After: const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
docData.createdBy = userInfo._id || ''
docData.createdByName = userInfo.name || userInfo.nickName || ''
const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
// Sync banquet purchase
this.syncBanquetPurchase({ ...docData, _id: result._id }, result._id)
log(LOG_TYPES.RESERVATION_CREATE, '创建预约: ' + docData.customerName, { id: result._id })
```

For **edit** flow (after line 390 `await db.updateDoc(...)`):

```js
await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
// Sync banquet purchase
this.syncBanquetPurchase({ ...docData, _id: this.data.id }, this.data.id)
```

Note: For the edit flow, `createdBy` and `createdByName` won't be in `docData`, so use `userInfo` from the current user context. Actually, looking more carefully, `docData` for edit doesn't have `createdBy`/`createdByName`. We should pass the userInfo separately. Let me revise:

Actually, the `docData` for create has `createdBy` and `createdByName`, but for edit it doesn't. The `syncBanquetPurchase` function needs the user info. Let me adjust to also accept the userInfo:

Better approach: In `onSubmit`, after the try block's success path, just call sync and pass necessary data:

```js
// In the success path, after setting docData but before the isEdit check:
const userInfo = app.globalData.userInfo || {}
```

Then after save, call:

```js
// After successful save (both create and edit paths)
const syncData = {
  ...docData,
  purchaseBy: userInfo._id || '',
  purchaseByName: userInfo.name || userInfo.nickName || ''
}
this.syncBanquetPurchase(syncData, this.data.isEdit ? this.data.id : result._id)
```

Let me reconsider. In the create path, `docData` is already set with `createdBy`/`createdByName`. In the edit path, it's not. I'll handle this by passing the `syncedBy` info to the sync function.

Actually wait — there's a subtle issue. In the edit path, `syncBanquetPurchase` needs to know the `_id`, which is `this.data.id`. In the create path, it's `result._id`. Let me structure the code correctly.

Here's the clean approach:

After the `else` block for create (line 407-413), and after the `if` block for edit (line 387-406), right before `setTimeout(function() { wx.navigateBack() }, 1500)` on line 416.

Looking at the actual code flow:

```js
if (this.data.isEdit) {
  // ... edit flow
  await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
  // ... logging
  wx.showToast({ title: '更新成功', icon: 'success' })
} else {
  docData.status = 'confirmed'
  docData.createdBy = userInfo._id || ''
  docData.createdByName = userInfo.name || userInfo.nickName || ''
  const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
  log(LOG_TYPES.RESERVATION_CREATE, '创建预约: ' + docData.customerName, { id: result._id })
  wx.showToast({ title: '创建成功', icon: 'success' })
}

setTimeout(function() { wx.navigateBack() }, 1500)
```

I should add the sync call before the setTimeout but after the toast. The reservation ID is either `this.data.id` (edit) or `result._id` (create).

Let me write the code more precisely:

```js
// After the if-else block, before setTimeout
const reservationId = this.data.isEdit ? this.data.id : result._id
this.syncBanquetPurchase(docData, reservationId, userInfo)
```

And update syncBanquetPurchase to accept userInfo:

Actually, I'll just include the userInfo in the method. The `app.globalData.userInfo` is already accessible from page context. But for caution, I'll pass userInfo.

Let me simplify — I'll just use `app` inside the method since it's already declared at page level:

Wait, looking at reservation-add/index.js again — it doesn't have `const app = getApp()` at the top! It uses `const app = getApp()` inside `onLoad` and `onSubmit`. So I need to access `app` in the method too.

Let me make the helper access `app` directly:

```js
async syncBanquetPurchase(docData, reservationId) {
  try {
    const dishPrice = Number(docData.dishPrice) || 0
    const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
      sourceReservationId: reservationId
    })

    if (dishPrice > 0) {
      const app = getApp()
      const userInfo = app.globalData.userInfo || {}
      const dateStr = typeof docData.date === 'object' && docData.date instanceof Date
        ? docData.date.getFullYear() + '-' + String(docData.date.getMonth() + 1).padStart(2, '0') + '-' + String(docData.date.getDate()).padStart(2, '0')
        : docData.date
      const remark = (docData.customerName || '') + ' - ' + (docData.roomName || '')
      const purchaseData = {
        amount: dishPrice,
        category: 'banquet',
        date: dateStr,
        remark: remark,
        item: '',
        purchaseBy: userInfo._id || '',
        purchaseByName: userInfo.name || userInfo.nickName || '',
        sourceReservationId: reservationId
      }
      if (!purchaseData.purchaseBy) {
        delete purchaseData.purchaseBy
        delete purchaseData.purchaseByName
      }

      if (existing.data && existing.data.length > 0) {
        await db.updateDoc(COLLECTIONS.PURCHASE, existing.data[0]._id, purchaseData)
      } else {
        await db.addDoc(COLLECTIONS.PURCHASE, purchaseData)
      }
    } else {
      if (existing.data && existing.data.length > 0) {
        await db.deleteDoc(COLLECTIONS.PURCHASE, existing.data[0]._id)
      }
    }
  } catch (err) {
    console.warn('[banquet-sync] 同步宴会菜价失败:', err)
  }
}
```

This is cleaner. Now for the call site, `docData` already has `customerName`, `roomName`, `dishPrice`, `date` set (lines 371-385). I just need to pass the reservation ID.

For create flow:
```js
const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
this.syncBanquetPurchase(docData, result._id)
log(LOG_TYPES.RESERVATION_CREATE, ...)
```

For edit flow:
```js
await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
this.syncBanquetPurchase(docData, this.data.id)
```

This is simple and clean. Let me finalize the plan.

- [ ] **Step 3: Add import of `db` if not already imported** — Already imported (line 7).

- [ ] **Step 4: Actually integrate the calls into the two code paths**

For create path (after line 411):
```js
const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
this.syncBanquetPurchase(docData, result._id)  // ADD THIS LINE
log(LOG_TYPES.RESERVATION_CREATE, '创建预约: ' + docData.customerName, { id: result._id })
```

For edit path (after line 390):
```js
await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
this.syncBanquetPurchase(docData, this.data.id)  // ADD THIS LINE
```

---

### Task 5: Delete banquet purchase when cancelling reservation

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.js:132-145`

- [ ] **Step 1: Add syncBanquetPurchase delete method to reservation-detail page**

Add this helper method after `onConfirmCancel`:

```js
async deleteBanquetPurchase(reservationId) {
  try {
    const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
      sourceReservationId: reservationId
    })
    if (existing.data && existing.data.length > 0) {
      await db.deleteDoc(COLLECTIONS.PURCHASE, existing.data[0]._id)
    }
  } catch (err) {
    console.warn('[banquet-sync] 删除宴会菜价失败:', err)
  }
}
```

- [ ] **Step 2: Call it in onConfirmCancel after updateDoc**

```js
async onConfirmCancel() {
  this.setData({ showCancelModal: false })
  try {
    wx.showLoading({ title: '处理中' })
    await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, { status: 'cancelled' })
    await this.deleteBanquetPurchase(this.data.id)  // ADD THIS LINE
    log(LOG_TYPES.RESERVATION_UPDATE, '取消预约: ' + (this.data.reservation.customerName || ''))
    wx.hideLoading()
    wx.showToast({ title: '已取消', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 1500)
  } catch (err) {
    wx.hideLoading()
    handleCloudError(err, '取消预约')
  }
}
```

---

### Task 6: Handle banquet purchase when deleting reservation

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.js` (same `deleteBanquetPurchase` handles this too) — Actually, the delete is in `reservation-add/index.js onConfirmDelete`. Let me check...

Looking at reservation-add/index.js, `onConfirmDelete` (line 503) deletes a reservation in edit mode. We should also clean up banquet purchase there.

Wait, actually `onConfirmDelete` in reservation-add/index.js is for when you're editing a reservation and click "delete" at the bottom. This is a hard delete, not cancel. We should clean up here too.

- [ ] **Step 1: Add deleteBanquetPurchase to reservation-add page**

Actually, I should keep it DRY. Both pages need this. But these are page methods, not shared utilities. For simplicity, I'll add the same helper to reservation-add/index.js since `syncBanquetPurchase` already handles deleting (when dishPrice is 0). But in the delete case, we don't have `docData` — we have `this.data.id`.

Let me add a simple helper to reservation-add/index.js:

```js
async deleteBanquetPurchase(reservationId) {
  try {
    const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
      sourceReservationId: reservationId
    })
    if (existing.data && existing.data.length > 0) {
      await db.deleteDoc(COLLECTIONS.PURCHASE, existing.data[0]._id)
    }
  } catch (err) {
    console.warn('[banquet-sync] 删除宴会菜价失败:', err)
  }
}
```

- [ ] **Step 2: Call it in onConfirmDelete before/after deleteDoc**

```js
async onConfirmDelete() {
  this.setData({ showDeleteModal: false })
  try {
    wx.showLoading({ title: '删除中' })
    await this.deleteBanquetPurchase(this.data.id)  // ADD THIS LINE — delete banquet record first
    await db.deleteDoc(COLLECTIONS.RESERVATION, this.data.id)
    log(LOG_TYPES.RESERVATION_DELETE, '删除预约: ' + this.data.customerName, { id: this.data.id })
    wx.hideLoading()
    wx.showToast({ title: '已删除', icon: 'success' })
    setTimeout(function() { wx.navigateBack() }, 1500)
  } catch (err) {
    wx.hideLoading()
    handleCloudError(err, '删除预约')
  }
}
```
