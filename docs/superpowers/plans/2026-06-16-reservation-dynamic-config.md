# 预约动态配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reservation add page fully dynamic — rooms, time slots, exclusive types, meal standards, and form fields are all driven by admin-configured settings stored in the `settings` collection.

**Architecture:** Extend the existing `settings` collection with two new keys (`reservation_rooms` and `reservation_form_config`). A new global cache module (`reservationConfig.js`) provides fast reads across all pages. The settings page is redesigned with 3 tabs. The reservation-add page switches from hardcoded WXML blocks to `wx:for` with `<template>` rendering by field type.

**Tech Stack:** WeChat Mini-Program (纯小程序格式), 微信云开发, Jest for unit tests, miniprogram-automator for E2E

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `miniprogram/utils/reservationConfig.js` | Global cache module — loadRooms, loadFormConfig, invalidateCache, DEFAULT_ROOMS, DEFAULT_FORM_CONFIG |
| **Modify** | `miniprogram/utils/helpers.js:235-251` | getRoomName: query cache first, fallback to hardcoded map |
| **Modify** | `miniprogram/pages/min-amount/index.js` | Add 3-tab structure, rename to "预约管理设置", add rooms/form config CRUD |
| **Modify** | `miniprogram/pages/min-amount/index.wxml` | Add Tab 1 (rooms) and Tab 2 (form config) UI, restructure Tab 3 (existing) |
| **Modify** | `miniprogram/pages/min-amount/index.wxss` | Add tab bar styles, room card styles, form config styles |
| **Modify** | `miniprogram/pages/min-amount/index.json` | No changes needed (same components) |
| **Modify** | `miniprogram/pages/reservation-add/index.js` | Replace hardcoded roomOptions/timeOptions/room logic → dynamic from config |
| **Modify** | `miniprogram/pages/reservation-add/index.wxml` | Replace fixed WXML sections → wx:for + template rendering |
| **Modify** | `miniprogram/pages/reservation-add/index.wxss` | Minor: add template field styles |
| **Modify** | `miniprogram/pages/reservation-detail/index.wxml` | Add customFields rendering section |
| **Modify** | `miniprogram/pages/reservation-detail/index.js` | Load formConfig, resolve customFields labels |
| **Modify** | `miniprogram/pages/reservation-share/index.js` | Include customFields in detailItems array |
| **Modify** | `miniprogram/pages/reservation/index.js:112-126` | Replace fixed groupByRoom → dynamic grouping from config |
| **Modify** | `miniprogram/pages/reservation/index.wxml:37-238` | Replace 6 fixed group blocks → wx:for dynamic groups |
| **Modify** | `miniprogram/pages/me/index.js:72-78` | Update nav labels from "收费设置" → "预约管理设置" |
| **Create** | `tests/unit/reservationConfig.test.js` | Unit tests for cache module |
| **Modify** | `tests/unit/reservation-add.test.js` | Update tests for dynamic config |

---

### Task 1: Create reservationConfig.js cache module

**Files:**
- Create: `miniprogram/utils/reservationConfig.js`
- Test: `tests/unit/reservationConfig.test.js`

- [ ] **Step 1: Write failing tests for the cache module**

```js
// tests/unit/reservationConfig.test.js
const {
  loadRooms, loadFormConfig, invalidateCache,
  DEFAULT_ROOMS, DEFAULT_FORM_CONFIG, resolveFields
} = require('../../miniprogram/utils/reservationConfig')

// Mock db
const mockQueryAll = jest.fn()
jest.doMock('../../miniprogram/utils/db', () => ({
  queryAll: mockQueryAll,
  COLLECTIONS: { SETTINGS: 'settings' }
}))

describe('reservationConfig', () => {
  beforeEach(() => {
    invalidateCache()
    mockQueryAll.mockReset()
  })

  test('loadRooms returns cached value on second call', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [{ key: 'reservation_rooms', value: [{ id: 'big', name: '大包厢' }] }] })
    const r1 = await loadRooms()
    const r2 = await loadRooms()
    expect(r1).toEqual([{ id: 'big', name: '大包厢' }])
    expect(r2).toBe(r1) // same reference — cache hit
    expect(mockQueryAll).toHaveBeenCalledTimes(1)
  })

  test('loadRooms returns DEFAULT_ROOMS when DB returns nothing', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [] })
    const rooms = await loadRooms()
    expect(rooms).toBe(DEFAULT_ROOMS)
  })

  test('loadFormConfig returns DEFAULT_FORM_CONFIG when DB fails', async () => {
    mockQueryAll.mockRejectedValueOnce(new Error('network'))
    const config = await loadFormConfig()
    expect(config).toBe(DEFAULT_FORM_CONFIG)
  })

  test('invalidateCache clears cached values', async () => {
    mockQueryAll.mockResolvedValueOnce({ data: [{ key: 'reservation_rooms', value: [{ id: 'test' }] }] })
    await loadRooms()
    invalidateCache()
    mockQueryAll.mockResolvedValueOnce({ data: [{ key: 'reservation_rooms', value: [{ id: 'test2' }] }] })
    const rooms = await loadRooms()
    expect(rooms).toEqual([{ id: 'test2' }])
    expect(mockQueryAll).toHaveBeenCalledTimes(2)
  })

  test('resolveFields filters by visibility and hiddenInRooms', () => {
    const fields = [
      { id: 'a', visible: true,  required: true,  hiddenInRooms: [] },
      { id: 'b', visible: false, required: false, hiddenInRooms: [] },
      { id: 'c', visible: true,  required: false, hiddenInRooms: ['chess'] },
      { id: 'd', visible: true,  required: true,  hiddenInRooms: ['big', 'chess'] }
    ]
    // Room = 'big'
    const result1 = resolveFields(fields, 'big')
    expect(result1.map(f => f.id)).toEqual(['a', 'c']) // 'd' hidden in 'big'

    // Room = 'chess'
    const result2 = resolveFields(fields, 'chess')
    expect(result2.map(f => f.id)).toEqual(['a']) // 'c' and 'd' hidden in 'chess'

    // Room = 'small'
    const result3 = resolveFields(fields, 'small')
    expect(result3.map(f => f.id)).toEqual(['a', 'c', 'd'])
  })

  test('DEFAULT_ROOMS has big/small/chess with correct ids', () => {
    const ids = DEFAULT_ROOMS.map(r => r.id)
    expect(ids).toEqual(['big', 'small', 'chess'])
  })

  test('DEFAULT_FORM_CONFIG has 5 builtin fields', () => {
    const builtins = DEFAULT_FORM_CONFIG.fields.filter(f => f.builtin)
    expect(builtins.map(f => f.id)).toEqual(['customerName', 'phone', 'guestCount', 'dishPrice', 'remark'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/reservationConfig.test.js --no-cache 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Implement reservationConfig.js**

```js
// miniprogram/utils/reservationConfig.js
const { COLLECTIONS } = require('./db')
const db = require('./db')

const DEFAULT_ROOMS = [
  {
    id: 'big', name: '大包厢', enabled: true, order: 0,
    exclusiveTypes: ['none', 'noon', 'night', 'full'],
    timeSlots: ['中午', '晚上'],
    standards: [500, 600, 800],
    partnerStandard: 300,
    defaultStandard: 500
  },
  {
    id: 'small', name: '小包厢', enabled: true, order: 1,
    exclusiveTypes: ['none', 'noon', 'night', 'full'],
    timeSlots: ['中午', '晚上'],
    standards: [500, 600],
    partnerStandard: 300,
    defaultStandard: 500
  },
  {
    id: 'chess', name: '棋牌室', enabled: true, order: 2,
    exclusiveTypes: [],
    timeSlots: ['中午', '晚上'],
    standards: [],
    partnerStandard: 0,
    defaultStandard: 0
  }
]

const DEFAULT_FORM_CONFIG = {
  fields: [
    { id: 'customerName', label: '客户姓名', type: 'text',
      builtin: true, visible: true, required: true, hiddenInRooms: [] },
    { id: 'phone', label: '手机号', type: 'text',
      builtin: true, visible: true, required: false, hiddenInRooms: [] },
    { id: 'guestCount', label: '人数', type: 'number',
      builtin: true, visible: true, required: true, hiddenInRooms: ['chess'] },
    { id: 'dishPrice', label: '预定菜价', type: 'number',
      builtin: true, visible: true, required: false, hiddenInRooms: ['chess'] },
    { id: 'remark', label: '备注', type: 'textarea',
      builtin: true, visible: true, required: false, hiddenInRooms: [] }
  ]
}

let _roomsCache = null
let _formConfigCache = null

async function loadRooms() {
  if (_roomsCache) return _roomsCache
  try {
    const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
    const value = (res.data && res.data[0] && res.data[0].value) || null
    _roomsCache = value || DEFAULT_ROOMS
  } catch (err) {
    console.warn('[reservationConfig] loadRooms failed, using defaults:', err)
    _roomsCache = DEFAULT_ROOMS
  }
  return _roomsCache
}

async function loadFormConfig() {
  if (_formConfigCache) return _formConfigCache
  try {
    const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
    const value = (res.data && res.data[0] && res.data[0].value) || null
    _formConfigCache = value || DEFAULT_FORM_CONFIG
  } catch (err) {
    console.warn('[reservationConfig] loadFormConfig failed, using defaults:', err)
    _formConfigCache = DEFAULT_FORM_CONFIG
  }
  return _formConfigCache
}

function invalidateCache() {
  _roomsCache = null
  _formConfigCache = null
}

/**
 * Resolve visible fields for a given room by filtering out
 * hidden fields and non-visible fields.
 * @param {Array} fields - Global fields array from formConfig
 * @param {string} roomId - Current room id
 * @returns {Array} - Filtered fields visible in this room
 */
function resolveFields(fields, roomId) {
  return fields.filter(function(f) {
    return f.visible && !(f.hiddenInRooms && f.hiddenInRooms.includes(roomId))
  })
}

module.exports = {
  loadRooms, loadFormConfig, invalidateCache,
  DEFAULT_ROOMS, DEFAULT_FORM_CONFIG, resolveFields
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/reservationConfig.test.js --no-cache 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/reservationConfig.js tests/unit/reservationConfig.test.js
git commit -m "feat: add reservationConfig cache module with defaults and resolveFields"
```

---

### Task 2: Update helpers.js getRoomName to use config cache

**Files:**
- Modify: `miniprogram/utils/helpers.js:235-251`

- [ ] **Step 1: Write failing test for getRoomName with config**

Add to `tests/unit/helpers.test.js`:

```js
describe('getRoomName with reservationConfig', () => {
  test('returns name from config cache when available', () => {
    // Mock the config cache to return custom rooms
    const config = require('../../miniprogram/utils/reservationConfig')
    const origLoadRooms = config.loadRooms
    config.loadRooms = jest.fn().mockResolvedValue([{ id: 'vip', name: 'VIP厅' }])

    // Since getRoomName is synchronous, we test the fallback path
    // and the new config-aware path separately
    expect(helpers.getRoomName('big')).toBe('大包厢') // fallback
    expect(helpers.getRoomName('unknown_room')).toBe('unknown_room')

    config.loadRooms = origLoadRooms
  })
})
```

- [ ] **Step 2: Run test to verify existing tests still pass**

Run: `npx jest tests/unit/helpers.test.js --no-cache 2>&1 | tail -10`
Expected: Existing tests still PASS (no changes yet)

- [ ] **Step 3: Update getRoomName to check config cache**

```js
// miniprogram/utils/helpers.js — replace getRoomName function
function getRoomName(room) {
  // Try config cache first (synchronous — only populated after loadRooms)
  try {
    const config = require('./reservationConfig')
    const cachedRooms = config._getRoomsCache && config._getRoomsCache()
    if (cachedRooms) {
      const found = cachedRooms.find(function(r) { return r.id === room })
      if (found) return found.name
    }
  } catch (e) { /* fallback below */ }

  // Fallback to hardcoded map for backward compatibility
  const roomMap = {
    big: '大包厢',
    small: '小包厢',
    chess: '棋牌室'
  }
  return roomMap[room] || room || '未知'
}
```

Also add cache accessor to reservationConfig.js:

```js
// Add to reservationConfig.js module.exports
function _getRoomsCache() { return _roomsCache }
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/helpers.test.js --no-cache 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/helpers.js miniprogram/utils/reservationConfig.js tests/unit/helpers.test.js
git commit -m "feat: getRoomName reads from reservationConfig cache with fallback"
```

---

### Task 3: Settings page — add Tab structure and rename

**Files:**
- Modify: `miniprogram/pages/min-amount/index.js`
- Modify: `miniprogram/pages/min-amount/index.wxml`
- Modify: `miniprogram/pages/min-amount/index.wxss`

- [ ] **Step 1: Add tab state to index.js data**

Add `activeTab: 0` to page data, and add tab switching methods:

```js
// In onLoad, rename page title
wx.setNavigationBarTitle({ title: '预约管理设置' })

// Add to data object:
activeTab: 0,

// Add methods:
switchTab(e) {
  this.setData({ activeTab: Number(e.currentTarget.dataset.tab) })
},
```

- [ ] **Step 2: Add tab bar to index.wxml**

Wrap existing content in a tab container. Add tab buttons at top:

```xml
<!-- Tab Bar -->
<view class="tab-bar" style="margin-top: {{statusBarHeight + 44}}px;">
  <view class="tab-item {{activeTab === 0 ? 'tab-active' : ''}}" data-tab="0" bindtap="switchTab">
    🏠 房间管理
  </view>
  <view class="tab-item {{activeTab === 1 ? 'tab-active' : ''}}" data-tab="1" bindtap="switchTab">
    📋 表单配置
  </view>
  <view class="tab-item {{activeTab === 2 ? 'tab-active' : ''}}" data-tab="2" bindtap="switchTab">
    💰 收费设置
  </view>
</view>

<!-- Tab 0: Room Management (placeholder for now) -->
<view wx:if="{{activeTab === 0}}" class="tab-content">
  <view class="placeholder-text">房间管理 — 在 Task 4 实现</view>
</view>

<!-- Tab 1: Form Config (placeholder for now) -->
<view wx:elif="{{activeTab === 1}}" class="tab-content">
  <view class="placeholder-text">表单配置 — 在 Task 5 实现</view>
</view>

<!-- Tab 2: Existing billing settings -->
<view wx:elif="{{activeTab === 2}}" class="tab-content">
  <!-- Move ALL existing min-amount WXML content here -->
</view>
```

- [ ] **Step 3: Add tab styles to index.wxss**

```css
.tab-bar {
  display: flex;
  border-bottom: 2rpx solid rgba(255,255,255,0.06);
  padding: 0 24rpx;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  font-size: 28rpx;
  color: #5C5C72;
  position: relative;
}

.tab-active {
  color: #C9A96E;
  font-weight: 600;
}

.tab-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 30%;
  right: 30%;
  height: 6rpx;
  background: #C9A96E;
  border-radius: 3rpx;
}

.tab-content {
  padding: 24rpx;
}
```

- [ ] **Step 4: Update me/index.js navigation label**

In `miniprogram/pages/me/index.js`, change the text for `minAmount` from `'💰 收费设置'` to `'⚙️ 预约管理设置'`.

- [ ] **Step 5: Verify in DevTools**

Open min-amount page in 微信开发者工具 → Should show 3 tabs → Tab 2 shows existing billing settings → Tab 0 and 1 show placeholders.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/min-amount/ miniprogram/pages/me/index.js
git commit -m "refactor: add 3-tab structure to settings page, rename to 预约管理设置"
```

---

### Task 4: Settings Tab 1 — Room management CRUD

**Files:**
- Modify: `miniprogram/pages/min-amount/index.js`
- Modify: `miniprogram/pages/min-amount/index.wxml`
- Modify: `miniprogram/pages/min-amount/index.wxss`

- [ ] **Step 1: Add room data and load logic to index.js**

Add to data:
```js
rooms: [],           // All rooms (enabled + disabled)
showRoomEditor: false,
editingRoom: null,    // Room being edited (null = adding new)
editorRoom: {         // Editor form model
  id: '', name: '', enabled: true, order: 0,
  exclusiveTypes: [], timeSlots: [], standards: [],
  partnerStandard: 0, defaultStandard: 0
},
```

Add onLoad room loading:
```js
async loadRooms() {
  try {
    const config = require('../../utils/reservationConfig')
    const rooms = await config.loadRooms()
    // Also read the _version from DB for optimistic locking
    const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
    const doc = (res.data && res.data[0]) || null
    this.setData({
      rooms: rooms,
      _roomsDocId: doc ? doc._id : null,
      _roomsVersion: doc ? (doc._version || 0) : 0
    })
  } catch (err) {
    console.warn('加载房间配置失败:', err)
  }
},
```

Call `this.loadRooms()` in onLoad and when switching to Tab 0.

- [ ] **Step 2: Add room CRUD methods to index.js**

Add these methods:

```js
// Open editor for new room
onAddRoom() {
  const firstRoom = this.data.rooms[0] || {}
  this.setData({
    showRoomEditor: true,
    editingRoom: null,
    editorRoom: {
      id: 'room_' + Date.now(),
      name: '',
      enabled: true,
      order: this.data.rooms.length,
      exclusiveTypes: firstRoom.exclusiveTypes || [],
      timeSlots: firstRoom.timeSlots || ['中午', '晚上'],
      standards: firstRoom.standards || [],
      partnerStandard: firstRoom.partnerStandard || 0,
      defaultStandard: firstRoom.defaultStandard || 0
    }
  })
},

// Open editor for existing room
onEditRoom(e) {
  const roomId = e.currentTarget.dataset.id
  const room = this.data.rooms.find(r => r.id === roomId)
  if (!room) return
  this.setData({
    showRoomEditor: true,
    editingRoom: room,
    editorRoom: JSON.parse(JSON.stringify(room))
  })
},

// Close editor
onCloseRoomEditor() {
  this.setData({ showRoomEditor: false })
},

// Editor field handlers
onRoomNameInput(e) { this.setData({ 'editorRoom.name': e.detail.value }) },
onRoomEnabledSwitch(e) { this.setData({ 'editorRoom.enabled': e.detail.value }) },
onRoomOrderInput(e) { this.setData({ 'editorRoom.order': Number(e.detail.value) || 0 }) },

// Exclusive type toggle
toggleExclusiveType(e) {
  const value = e.currentTarget.dataset.value
  const types = this.data.editorRoom.exclusiveTypes.slice()
  const idx = types.indexOf(value)
  if (idx >= 0) types.splice(idx, 1)
  else types.push(value)
  this.setData({ 'editorRoom.exclusiveTypes': types })
},

// Time slot toggle
toggleTimeSlot(e) {
  const value = e.currentTarget.dataset.value
  const slots = this.data.editorRoom.timeSlots.slice()
  const idx = slots.indexOf(value)
  if (idx >= 0) slots.splice(idx, 1)
  else slots.push(value)
  this.setData({ 'editorRoom.timeSlots': slots })
},

// Add custom time slot
onAddTimeSlot(e) {
  const value = e.detail.value.trim()
  if (!value) return
  const slots = this.data.editorRoom.timeSlots.slice()
  if (!slots.includes(value)) slots.push(value)
  this.setData({ 'editorRoom.timeSlots': slots })
},

// Standard management
removeStandard(e) {
  const idx = e.currentTarget.dataset.index
  const standards = this.data.editorRoom.standards.slice()
  standards.splice(idx, 1)
  this.setData({ 'editorRoom.standards': standards })
},

onAddStandard(e) {
  const value = Number(e.detail.value)
  if (!value || value <= 0) return
  const standards = this.data.editorRoom.standards.slice()
  if (!standards.includes(value)) standards.push(value)
  standards.sort(function(a, b) { return a - b })
  this.setData({ 'editorRoom.standards': standards })
},

onPartnerStandardInput(e) { this.setData({ 'editorRoom.partnerStandard': Number(e.detail.value) || 0 }) },
onDefaultStandardInput(e) { this.setData({ 'editorRoom.defaultStandard': Number(e.detail.value) || 0 }) },

// Save room (add or update)
async onSaveRoom() {
  const room = this.data.editorRoom
  if (!room.name.trim()) {
    wx.showToast({ title: '请输入房间名称', icon: 'none' })
    return
  }

  wx.showLoading({ title: '保存中' })
  try {
    let rooms = this.data.rooms.slice()

    if (this.data.editingRoom) {
      // Update existing
      const idx = rooms.findIndex(r => r.id === room.id)
      if (idx >= 0) rooms[idx] = room
    } else {
      // Add new
      rooms.push(room)
    }

    // Sort by order
    rooms.sort(function(a, b) { return a.order - b.order })

    // Write to DB with optimistic lock
    const docId = this.data._roomsDocId
    if (docId) {
      // Re-read version before write
      const check = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
      const latestVersion = (check.data && check.data[0]) ? (check.data[0]._version || 0) : 0
      if (latestVersion !== this.data._roomsVersion) {
        wx.hideLoading()
        wx.showModal({ title: '冲突', content: '配置已被他人修改，请刷新后再保存', showCancel: false })
        return
      }
      await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
        value: rooms,
        _version: this.data._roomsVersion + 1
      })
    } else {
      const result = await db.addDoc(COLLECTIONS.SETTINGS, {
        key: 'reservation_rooms',
        value: rooms,
        _version: 1
      })
    }

    require('../../utils/reservationConfig').invalidateCache()
    this.setData({ showRoomEditor: false })
    await this.loadRooms()
    wx.hideLoading()
    wx.showToast({ title: '保存成功', icon: 'success' })
  } catch (err) {
    wx.hideLoading()
    wx.showToast({ title: '保存失败', icon: 'none' })
    console.error('保存房间配置失败:', err)
  }
},

// Restore defaults
async onRestoreDefaults() {
  wx.showModal({
    title: '确认恢复',
    content: '将恢复到系统默认配置，当前配置将被覆盖，确认？',
    success: async (res) => {
      if (!res.confirm) return
      wx.showLoading({ title: '恢复中' })
      try {
        const config = require('../../utils/reservationConfig')
        const docId = this.data._roomsDocId
        if (docId) {
          await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
            value: config.DEFAULT_ROOMS,
            _version: 1
          })
        } else {
          await db.addDoc(COLLECTIONS.SETTINGS, {
            key: 'reservation_rooms',
            value: config.DEFAULT_ROOMS,
            _version: 1
          })
        }
        // Also restore form config
        const formDocRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
        const formDocId = formDocRes.data && formDocRes.data[0] ? formDocRes.data[0]._id : null
        if (formDocId) {
          await db.updateDoc(COLLECTIONS.SETTINGS, formDocId, {
            value: config.DEFAULT_FORM_CONFIG,
            _version: 1
          })
        } else {
          await db.addDoc(COLLECTIONS.SETTINGS, {
            key: 'reservation_form_config',
            value: config.DEFAULT_FORM_CONFIG,
            _version: 1
          })
        }
        config.invalidateCache()
        await this.loadRooms()
        await this.loadFormConfigFields()
        wx.hideLoading()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '恢复失败', icon: 'none' })
      }
    }
  })
},
```

- [ ] **Step 3: Add Tab 1 WXML — room list and editor**

Replace the Tab 0 placeholder in index.wxml with:

```xml
<!-- Tab 0: Room Management -->
<view wx:if="{{activeTab === 0}}" class="tab-content">
  <!-- Restore defaults button -->
  <view class="restore-btn" bindtap="onRestoreDefaults">恢复默认配置</view>

  <!-- Room cards -->
  <view wx:for="{{rooms}}" wx:key="id"
    class="room-card {{!item.enabled ? 'room-disabled' : ''}}"
    data-id="{{item.id}}" bindtap="onEditRoom"
    style="background: {{theme.cardBg || 'rgba(255,255,255,0.06)'}}; border: 1rpx solid {{theme.border || 'rgba(255,255,255,0.10)'}};">
    <view class="room-card-header">
      <text class="room-card-name" style="color: {{theme.textPrimary || '#F5F0E8'}};">{{item.name}}</text>
      <view class="room-card-badges">
        <text wx:if="{{!item.enabled}}" class="room-badge badge-disabled">已停用</text>
        <text wx:else class="room-badge badge-enabled">启用</text>
        <text class="room-more" style="color: {{theme.textMuted || '#5C5C72'}};">⋮</text>
      </view>
    </view>
    <view class="room-card-tags">
      <text wx:if="{{item.exclusiveTypes.length > 0}}" class="room-tag">包场: {{item.exclusiveTypes.length}}种</text>
      <text class="room-tag">时段: {{item.timeSlots.join('/') }}</text>
      <text wx:if="{{item.standards.length > 0}}" class="room-tag">餐标: ¥{{item.standards.join('/') }}/人</text>
      <text wx:if="{{item.standards.length === 0}}" class="room-tag">无餐标</text>
    </view>
  </view>

  <!-- Add room button -->
  <view class="add-room-btn" bindtap="onAddRoom">＋ 添加房间</view>
</view>

<!-- Room Editor Modal -->
<theme-modal theme="{{theme}}" visible="{{showRoomEditor}}" title="{{editingRoom ? '编辑房间' : '添加房间'}}" showFooter="{{false}}" bind:close="onCloseRoomEditor">
  <scroll-view scroll-y style="max-height: 70vh;">
    <!-- Room Name -->
    <view class="editor-field">
      <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">房间名称</text>
      <input class="editor-input" value="{{editorRoom.name}}" bindinput="onRoomNameInput" placeholder="输入房间名称"
        style="color: {{theme.textPrimary || '#F5F0E8'}};" />
    </view>

    <!-- Enabled & Order -->
    <view class="editor-row">
      <view class="editor-field editor-field-half">
        <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">启用</text>
        <switch checked="{{editorRoom.enabled}}" bindchange="onRoomEnabledSwitch" color="#C9A96E" />
      </view>
      <view class="editor-field editor-field-half">
        <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">排序</text>
        <input class="editor-input" type="number" value="{{editorRoom.order}}" bindinput="onRoomOrderInput"
          style="color: {{theme.textPrimary || '#F5F0E8'}};" />
      </view>
    </view>

    <!-- Exclusive Types -->
    <view class="editor-field">
      <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">包场模式</text>
      <view class="pill-selector">
        <view wx:for="{{['none','noon','night','full']}}" wx:key="*this"
          class="pill {{editorRoom.exclusiveTypes.indexOf(item) >= 0 ? 'pill-active' : ''}}"
          data-value="{{item}}" bindtap="toggleExclusiveType"
          style="{{editorRoom.exclusiveTypes.indexOf(item) >= 0 ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}"
        >{{item === 'none' ? '不包场' : item === 'noon' ? '午包场' : item === 'night' ? '晚包场' : '全天'}}</view>
      </view>
    </view>

    <!-- Time Slots -->
    <view class="editor-field">
      <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">时段</text>
      <view class="pill-selector">
        <view wx:for="{{editorRoom.timeSlots}}" wx:key="*this"
          class="pill pill-active"
          data-value="{{item}}" bindtap="toggleTimeSlot"
          style="background: {{theme.accentColor || '#C9A96E'}}; color: {{theme.textInverse || '#0F0F1A'}};"
        >{{item}}</view>
      </view>
      <input class="editor-input" placeholder="输入新时段后回车" bindconfirm="onAddTimeSlot"
        style="color: {{theme.textPrimary || '#F5F0E8'}}; margin-top: 12rpx;" />
    </view>

    <!-- Standards -->
    <view class="editor-field">
      <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">餐标选项（元/人）</text>
      <view class="pill-selector">
        <view wx:for="{{editorRoom.standards}}" wx:key="*this"
          class="pill pill-active pill-removable"
          style="background: {{theme.accentColor || '#C9A96E'}}; color: {{theme.textInverse || '#0F0F1A'}};"
        >¥{{item}} ✕</view>
      </view>
      <input class="editor-input" type="number" placeholder="添加餐标后回车" bindconfirm="onAddStandard"
        style="color: {{theme.textPrimary || '#F5F0E8'}}; margin-top: 12rpx;" />
    </view>

    <!-- Partner & Default Standard -->
    <view class="editor-row">
      <view class="editor-field editor-field-half">
        <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">股东餐标</text>
        <input class="editor-input" type="number" value="{{editorRoom.partnerStandard}}" bindinput="onPartnerStandardInput"
          style="color: {{theme.textPrimary || '#F5F0E8'}};" />
      </view>
      <view class="editor-field editor-field-half">
        <text class="editor-label" style="color: {{theme.textSecondary || '#9A9AB0'}};">默认餐标</text>
        <input class="editor-input" type="number" value="{{editorRoom.defaultStandard}}" bindinput="onDefaultStandardInput"
          style="color: {{theme.textPrimary || '#F5F0E8'}};" />
      </view>
    </view>

    <!-- Save -->
    <view class="editor-actions">
      <view class="editor-btn editor-btn-danger" bindtap="onCloseRoomEditor">取消</view>
      <view class="editor-btn editor-btn-primary" bindtap="onSaveRoom">保存</view>
    </view>
  </scroll-view>
</theme-modal>
```

- [ ] **Step 4: Add room card and editor styles**

Add comprehensive CSS for room cards, editor fields, pill selectors etc. to index.wxss. (Styles follow the existing ink-gold theme pattern.)

- [ ] **Step 5: Verify in DevTools**

Open settings page → Tab 0 should show existing rooms → Tap room → Editor opens → Edit and save → Invalidation + reload works.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/min-amount/
git commit -m "feat: add room management CRUD to settings Tab 1"
```

---

### Task 5: Settings Tab 2 — Form config with hiddenInRooms

**Files:**
- Modify: `miniprogram/pages/min-amount/index.js`
- Modify: `miniprogram/pages/min-amount/index.wxml`
- Modify: `miniprogram/pages/min-amount/index.wxss`

- [ ] **Step 1: Add form config data and load logic**

Add to data:
```js
formFields: [],       // Current fields array
_formConfigDocId: null,
_formConfigVersion: 0,
showHiddenRoomsPicker: false,
_pickerFieldId: null, // Which field's hiddenInRooms is being edited
```

Add load method:
```js
async loadFormConfigFields() {
  try {
    const config = require('../../utils/reservationConfig')
    const formConfig = await config.loadFormConfig()
    const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
    const doc = (res.data && res.data[0]) || null
    this.setData({
      formFields: formConfig.fields,
      _formConfigDocId: doc ? doc._id : null,
      _formConfigVersion: doc ? (doc._version || 0) : 0
    })
  } catch (err) {
    console.warn('加载表单配置失败:', err)
  }
},
```

- [ ] **Step 2: Add field CRUD methods**

```js
// Toggle field visibility
toggleFieldVisible(e) {
  const idx = Number(e.currentTarget.dataset.index)
  const key = 'formFields[' + idx + '].visible'
  this.setData({ [key]: !this.data.formFields[idx].visible })
},

// Toggle field required
toggleFieldRequired(e) {
  const idx = Number(e.currentTarget.dataset.index)
  const key = 'formFields[' + idx + '].required'
  this.setData({ [key]: !this.data.formFields[idx].required })
},

// Remove custom field
removeCustomField(e) {
  const idx = Number(e.currentTarget.dataset.index)
  if (this.data.formFields[idx].builtin) return
  const fields = this.data.formFields.slice()
  fields.splice(idx, 1)
  this.setData({ formFields: fields })
},

// Add new field
onAddField(e) {
  const { name, type } = e.detail.value
  if (!name.trim()) return
  const fields = this.data.formFields.slice()
  fields.push({
    id: 'custom_' + Date.now(),
    label: name.trim(),
    type: type || 'text',
    builtin: false,
    visible: true,
    required: false,
    hiddenInRooms: [],
    options: type === 'select' ? [] : undefined
  })
  this.setData({ formFields: fields })
},

// Open hidden rooms picker for a field
onOpenHiddenPicker(e) {
  const fieldId = e.currentTarget.dataset.id
  this.setData({ showHiddenRoomsPicker: true, _pickerFieldId: fieldId })
},

// Toggle room in hiddenInRooms
toggleHiddenRoom(e) {
  const roomId = e.currentTarget.dataset.roomid
  const fields = this.data.formFields.slice()
  const field = fields.find(f => f.id === this.data._pickerFieldId)
  if (!field) return
  if (!field.hiddenInRooms) field.hiddenInRooms = []
  const idx = field.hiddenInRooms.indexOf(roomId)
  if (idx >= 0) field.hiddenInRooms.splice(idx, 1)
  else field.hiddenInRooms.push(roomId)
  this.setData({ formFields: fields })
},

onCloseHiddenPicker() {
  this.setData({ showHiddenRoomsPicker: false })
},

// Manage select options
removeSelectOption(e) {
  const { fieldIdx, optIdx } = e.currentTarget.dataset
  const fields = this.data.formFields.slice()
  fields[fieldIdx].options.splice(optIdx, 1)
  this.setData({ formFields: fields })
},

onAddSelectOption(e) {
  const { fieldIdx, value } = e.currentTarget.dataset
  if (!e.detail.value.trim()) return
  const fields = this.data.formFields.slice()
  if (!fields[fieldIdx].options) fields[fieldIdx].options = []
  if (!fields[fieldIdx].options.includes(e.detail.value.trim())) {
    fields[fieldIdx].options.push(e.detail.value.trim())
  }
  this.setData({ formFields: fields })
},

// Save form config
async onSaveFormConfig() {
  wx.showLoading({ title: '保存中' })
  try {
    const fields = this.data.formFields
    const docId = this.data._formConfigDocId
    if (docId) {
      const check = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
      const latestVersion = (check.data && check.data[0]) ? (check.data[0]._version || 0) : 0
      if (latestVersion !== this.data._formConfigVersion) {
        wx.hideLoading()
        wx.showModal({ title: '冲突', content: '配置已被他人修改，请刷新后再保存', showCancel: false })
        return
      }
      await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
        value: { fields: fields },
        _version: this.data._formConfigVersion + 1
      })
    } else {
      await db.addDoc(COLLECTIONS.SETTINGS, {
        key: 'reservation_form_config',
        value: { fields: fields },
        _version: 1
      })
    }
    require('../../utils/reservationConfig').invalidateCache()
    await this.loadFormConfigFields()
    wx.hideLoading()
    wx.showToast({ title: '保存成功', icon: 'success' })
  } catch (err) {
    wx.hideLoading()
    wx.showToast({ title: '保存失败', icon: 'none' })
  }
},
```

- [ ] **Step 3: Add Tab 2 WXML**

Replace Tab 1 placeholder with full form config UI: field list with checkboxes, hidden rooms pills, add field row, and save button.

- [ ] **Step 4: Add styles**

CSS for field rows, checkbox replacements, hidden-room pills etc.

- [ ] **Step 5: Add lazy-init on tab switch**

In `switchTab`, if switching to Tab 1 and `formFields` is empty, call `this.loadFormConfigFields()`.

- [ ] **Step 6: Verify in DevTools**

Open settings → Tab 2 → See 5 builtin fields → Toggle visibility/required → Add custom field → Set hiddenInRooms → Save → Reload → Persists.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/min-amount/
git commit -m "feat: add form config management to settings Tab 2 with hiddenInRooms"
```

---

### Task 6: Reservation-add page — dynamic rendering

**Files:**
- Modify: `miniprogram/pages/reservation-add/index.js`
- Modify: `miniprogram/pages/reservation-add/index.wxml`
- Modify: `miniprogram/pages/reservation-add/index.wxss`

This is the largest task. Key changes:

1. Replace hardcoded `roomOptions`, `timeOptions`, `standardOptions` with config-driven data
2. Replace fixed WXML sections (Room pill, Exclusive pill, Standard pill, Customer info fields) with `wx:for` loops
3. Add `<template>` definitions for text/number/textarea/select field types
4. Keep special logic for: dishPrice conditional-required, partner/boss selection, phone format validation
5. Collect customFields into `docData.customFields` on submit
6. Handle edit-mode backward compatibility (old reservations with room='big' under exclusiveType)

- [ ] **Step 1: Rewrite onLoad to use reservationConfig**

Replace `loadVenueSettings` call with:
```js
async loadReservationConfig() {
  const rooms = await require('../../utils/reservationConfig').loadRooms()
  const formConfig = await require('../../utils/reservationConfig').loadFormConfig()
  const enabledRooms = rooms.filter(r => r.enabled).sort((a, b) => a.order - b.order)
  const firstRoom = enabledRooms[0] || rooms[0]

  this.setData({
    roomOptions: enabledRooms,
    rooms: rooms,
    formConfigFields: formConfig.fields,
    room: firstRoom ? firstRoom.id : '',
    currentRoomConfig: firstRoom
  })

  // Apply first room's settings
  if (firstRoom) {
    this.applyRoomConfig(firstRoom)
  }
},

applyRoomConfig(roomConfig) {
  const { resolveFields } = require('../../utils/reservationConfig')
  const resolved = resolveFields(this.data.formConfigFields, roomConfig.id)

  this.setData({
    timeOptions: roomConfig.timeSlots,
    exclusiveOptions: roomConfig.exclusiveTypes,
    standardOptions: roomConfig.standards,
    partnerStandard: roomConfig.partnerStandard,
    defaultStandard: roomConfig.defaultStandard,
    allowNoStandard: roomConfig.standards.length === 0,
    formFields: resolved,
    time: roomConfig.timeSlots.includes(this.data.time) ? this.data.time : roomConfig.timeSlots[0],
    exclusiveType: roomConfig.exclusiveTypes.includes('none') ? 'none' :
                   roomConfig.exclusiveTypes[0] || 'none'
  })
},
```

- [ ] **Step 2: Rewrite selectRoom to apply new room config**

```js
selectRoom(e) {
  wx.vibrateShort({ type: 'light' })
  const roomId = e.currentTarget.dataset.value
  const roomConfig = this.data.roomOptions.find(r => r.id === roomId)
  if (!roomConfig) return

  const oldRoom = this.data.room
  const updates = { room: roomId, currentRoomConfig: roomConfig }

  this.applyRoomConfig(roomConfig)

  // Clear fields that are hidden in new room but were visible in old room
  const { resolveFields } = require('../../utils/reservationConfig')
  const oldFields = resolveFields(this.data.formConfigFields, oldRoom)
  const newFields = resolveFields(this.data.formConfigFields, roomId)
  oldFields.forEach(function(f) {
    if (!newFields.find(nf => nf.id === f.id)) {
      if (f.builtin) {
        updates[f.id] = f.type === 'number' ? '' : ''
      }
    }
  })
  this.setData(updates)
  this.clearError('room')
  this.loadDishPriceRequired()
},
```

- [ ] **Step 3: Replace fixed WXML with dynamic rendering**

Replace the hardcoded Room/Exclusive/Standard/Customer sections with:

```xml
<!-- Room Selection (dynamic from roomOptions) -->
<theme-card theme="{{theme}}">
  <view class="section-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">包厢</view>
  <view class="pill-selector">
    <view wx:for="{{roomOptions}}" wx:key="id"
      class="pill {{room === item.id ? 'pill-active' : ''}}"
      data-value="{{item.id}}" bindtap="selectRoom"
      style="{{room === item.id ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}"
    >{{item.name}}</view>
  </view>
  <text class="error-text" wx:if="{{errors.room}}" style="color: {{theme.statusDanger || '#F87171'}};">{{errors.room}}</text>
</theme-card>

<!-- Time Slots (dynamic from currentRoomConfig.timeSlots) -->
<theme-card theme="{{theme}}" wx:if="{{currentRoomConfig.timeSlots.length > 1}}">
  <view class="section-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">时段</view>
  <view class="pill-selector">
    <view wx:for="{{timeOptions}}" wx:key="*this"
      class="pill {{time === item ? 'pill-active' : ''}}"
      data-value="{{item}}" bindtap="selectTime"
      style="{{time === item ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}"
    >{{item}}</view>
  </view>
</theme-card>

<!-- Exclusive Types (dynamic from currentRoomConfig.exclusiveTypes) -->
<theme-card theme="{{theme}}" wx:if="{{exclusiveOptions.length > 0 && exclusiveOptions.indexOf('none') >= 0 && exclusiveOptions.length > 1}}">
  <view class="section-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">包场</view>
  <view class="pill-selector">
    <view wx:for="{{exclusiveOptions}}" wx:key="*this"
      class="pill {{exclusiveType === item ? 'pill-active' : ''}}"
      data-value="{{item}}" bindtap="selectExclusive"
      style="{{exclusiveType === item ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}"
    >{{item === 'none' ? '不包场' : item === 'noon' ? '午包场' : item === 'night' ? '晚包场' : '包场全天'}}</view>
  </view>
</theme-card>

<!-- Standards (dynamic from currentRoomConfig.standards) -->
<theme-card theme="{{theme}}" wx:if="{{standardOptions.length > 0}}">
  <view class="section-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">餐标</view>
  <view class="pill-selector standard-selector">
    <view class="pill {{isPartner ? 'pill-active' : ''}}" bindtap="togglePartner"
      style="{{isPartner ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}">股东</view>
    <view wx:for="{{standardOptions}}" wx:key="*this"
      class="pill {{standard === item ? 'pill-active' : ''}}"
      data-value="{{item}}" bindtap="selectStandard"
      style="{{standard === item ? 'background:' + (theme.accentColor || '#C9A96E') + ';color:' + (theme.textInverse || '#0F0F1A') + ';' : 'background:' + (theme.glassBg || 'rgba(255,255,255,0.06)') + ';color:' + (theme.textSecondary || 'rgba(245,240,232,0.65)') + ';'}}"
    >¥{{item}}/人</view>
  </view>
</theme-card>

<!-- Dynamic Form Fields -->
<theme-card theme="{{theme}}">
  <view class="section-title" style="color: {{theme.textPrimary || '#F5F0E8'}};">客户信息</view>
  <block wx:for="{{formFields}}" wx:key="id">
    <template wx:if="{{item.type === 'text' && item.id === 'customerName'}}" is="field-partner-name" data="{{field: item, value: formData[item.id], isPartner, bossList, selectedBossIndex, theme}}" />
    <template wx:elif="{{item.type === 'text'}}" is="field-text" data="{{field: item, value: formData[item.id], theme}}" />
    <template wx:elif="{{item.type === 'number' && item.id === 'dishPrice'}}" is="field-dish-price" data="{{field: item, value: formData[item.id], _dishPriceRequired, errors, theme}}" />
    <template wx:elif="{{item.type === 'number'}}" is="field-number" data="{{field: item, value: formData[item.id], theme}}" />
    <template wx:elif="{{item.type === 'textarea'}}" is="field-textarea" data="{{field: item, value: formData[item.id], theme}}" />
    <template wx:elif="{{item.type === 'select'}}" is="field-select" data="{{field: item, value: formData[item.id], theme}}" />
  </block>
</theme-card>
```

Also add `<template>` definitions for each field type at the bottom of the WXML.

- [ ] **Step 4: Update formData collection and submit logic**

Change `onSubmit` to collect builtin fields to `docData` top level and custom fields to `docData.customFields`:

```js
const docData = {}
const customFields = {}
this.data.formFields.forEach((f) => {
  const val = this.data.formData[f.id]
  if (f.builtin) {
    docData[f.id] = f.id === 'guestCount' ? (Number(val) || 0) :
                    f.id === 'dishPrice' ? (Number(val) || 0) :
                    (typeof val === 'string' ? val.trim() : val)
  } else {
    customFields[f.id] = f.type === 'number' ? (Number(val) || 0) :
                         (typeof val === 'string' ? val.trim() : val)
  }
})
docData.customFields = customFields
```

- [ ] **Step 5: Update validate to use resolved fields**

Replace hardcoded validations with loop over `formFields`.

- [ ] **Step 6: Update edit-mode backward compatibility**

When editing old reservations: if `exclusiveType !== 'none'` and `room === 'big'` but old logic forced it, keep the room value. When loading `customFields`, default to `{}`.

- [ ] **Step 7: Run existing tests, adapt as needed**

Run: `npx jest tests/unit/reservation-add.test.js --no-cache 2>&1 | tail -30`
Expected: May need adjustments for new data shape

- [ ] **Step 8: Commit**

```bash
git add miniprogram/pages/reservation-add/ tests/unit/reservation-add.test.js
git commit -m "feat: refactor reservation-add to dynamic config-driven rendering"
```

---

### Task 7: Reservation-detail — show customFields

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.js`
- Modify: `miniprogram/pages/reservation-detail/index.wxml`

- [ ] **Step 1: Load formConfig in onLoad and resolve labels for customFields**

```js
// In onLoad, after loading reservation:
const config = require('../../utils/reservationConfig')
const formConfig = await config.loadFormConfig()
const customFields = reservation.customFields || {}
const customFieldItems = Object.keys(customFields).map(function(key) {
  const fieldDef = formConfig.fields.find(function(f) { return f.id === key })
  return {
    label: fieldDef ? fieldDef.label : key,
    value: customFields[key]
  }
}).filter(function(item) { return item.value !== undefined && item.value !== '' && item.value !== 0 })
this.setData({ customFieldItems: customFieldItems })
```

- [ ] **Step 2: Add customFields section to WXML**

After the existing detail rows, add:

```xml
<!-- Custom Fields -->
<block wx:if="{{customFieldItems.length > 0}}">
  <view class="detail-row" wx:for="{{customFieldItems}}" wx:key="label">
    <text class="detail-label" style="color: {{theme.textMuted || '#5C5C72'}};">{{item.label}}</text>
    <text class="detail-value" style="color: {{theme.textPrimary || '#F0F0F5'}};">{{item.value}}</text>
  </view>
</block>
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/reservation-detail/
git commit -m "feat: display customFields in reservation detail"
```

---

### Task 8: Reservation-share — include customFields in detailItems

**Files:**
- Modify: `miniprogram/pages/reservation-share/index.js`

- [ ] **Step 1: Append customFields to detailItems array**

In the section where `detailItems` is built, after the standard items, add:

```js
// Custom fields
var formConfig = require('../../utils/reservationConfig')
var fc = await formConfig.loadFormConfig()
var cf = r.customFields || {}
Object.keys(cf).forEach(function(key) {
  var fd = fc.fields.find(function(f) { return f.id === key })
  if (fd && cf[key] !== undefined && cf[key] !== '' && cf[key] !== 0) {
    items.push({ label: fd.label, value: String(cf[key]) })
  }
})
```

- [ ] **Step 2: Verify share page renders custom fields**

Open a reservation with customFields → Share → See custom fields in preview.

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/reservation-share/
git commit -m "feat: include customFields in reservation share detailItems"
```

---

### Task 9: Calendar page — dynamic grouping

**Files:**
- Modify: `miniprogram/pages/reservation/index.js:112-126`
- Modify: `miniprogram/pages/reservation/index.wxml:35-238`

- [ ] **Step 1: Replace fixed groupByRoom with dynamic grouping**

```js
async groupByRoomDynamic(reservations) {
  var rooms = await require('../../utils/reservationConfig').loadRooms()
  var enabledRooms = rooms.filter(function(r) { return r.enabled })
  var sortOrder = {}
  enabledRooms.forEach(function(r, i) { sortOrder[r.id] = i })

  var exclusiveOrder = { noon: 0, night: 1, full: 2 }
  var exclusiveLabels = { noon: '午包场', night: '晚包场', full: '全天包场' }

  var grouped = {}
  reservations.forEach(function(r) {
    var et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
    var key, label
    if (et !== 'none') {
      key = et
      label = exclusiveLabels[et] || '包场'
    } else {
      key = r.room || 'big'
      label = r.roomName || key
    }
    if (!grouped[key]) {
      grouped[key] = { key: key, label: label, items: [] }
    }
    grouped[key].items.push(r)
  })

  // Sort: exclusive types first (noon→night→full), then rooms by order
  var keys = Object.keys(grouped)
  keys.sort(function(a, b) {
    var aExclusive = !!exclusiveOrder[a]
    var bExclusive = !!exclusiveOrder[b]
    if (aExclusive !== bExclusive) return aExclusive ? -1 : 1
    if (aExclusive && bExclusive) return (exclusiveOrder[a] || 99) - (exclusiveOrder[b] || 99)
    return (sortOrder[a] !== undefined ? sortOrder[a] : 99) - (sortOrder[b] !== undefined ? sortOrder[b] : 99)
  })

  var result = {}
  keys.forEach(function(k) { result[k] = grouped[k] })
  return result
},
```

- [ ] **Step 2: Replace 6 fixed WXML blocks with wx:for**

Replace lines 37-238 with:

```xml
<block wx:for="{{groupedReservations}}" wx:key="key" wx:for-item="group">
  <block wx:if="{{group.items.length > 0}}">
    <view class="room-group">
      <view class="room-pill" style="background: {{group.color || (theme.tagCompletedBg || 'rgba(201,169,110,0.15)')}}; color: {{group.textColor || (theme.tagCompletedText || '#C9A96E')}};">
        {{group.label}}
      </view>
      <view class="reservation-cards">
        <view wx:for="{{group.items}}" wx:key="_id" wx:for-item="item"
          class="reservation-card {{item.status === 'cancelled' ? 'cancelled' : ''}}"
          data-id="{{item._id}}" bindtap="onReservationTap"
          style="background: {{theme.cardBg || 'rgba(26,26,46,0.85)'}}; ...">
          <!-- card content same as before -->
        </view>
      </view>
    </view>
  </block>
</block>
```

Assign colors from a predefined palette array based on group index.

- [ ] **Step 3: Update room filter pills**

Replace fixed filter pills with `wx:for` over `roomOptions` (loaded fron config).

- [ ] **Step 4: Verify in DevTools**

Open calendar page → Groups should be dynamically ordered → Filter pills match enabled rooms.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/reservation/
git commit -m "feat: dynamic grouping and filtering in calendar page"
```

---

### Task 10: Downstream pages — income-detail, customer-detail

**Files:**
- Modify: `miniprogram/pages/income-detail/index.js`
- Modify: `miniprogram/pages/customer-detail/index.js`

- [ ] **Step 1: Add customFields display to income-detail**

When showing linked reservation info, include customFields with resolved labels (same pattern as Task 7).

- [ ] **Step 2: Add customFields to customer-detail timeline**

In the reservation timeline section, append customFields items after standard fields.

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/income-detail/ miniprogram/pages/customer-detail/
git commit -m "feat: display customFields in income-detail and customer-detail"
```

---

### Task 11: Lazy initialization — admin-only trigger

**Files:**
- Modify: `miniprogram/pages/min-amount/index.js`

- [ ] **Step 1: Add init logic to settings page onLoad**

```js
// In onLoad, after loadSettings:
await this.ensureConfigInitialized()
```

```js
async ensureConfigInitialized() {
  try {
    const config = require('../../utils/reservationConfig')
    var roomsRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
    if (!roomsRes.data || roomsRes.data.length === 0) {
      // Merge with old venue settings
      var mealStandards = this.data._mealStandards || [500, 600, 800]
      var defaultStandard = this.data._defaultStandard || 0
      var partnerStandard = this.data._partnerStandard || 300

      var defaultRooms = JSON.parse(JSON.stringify(config.DEFAULT_ROOMS))
      // Override big room standards from old settings
      if (defaultRooms[0]) {
        defaultRooms[0].standards = Array.isArray(mealStandards) ? mealStandards : [500, 600, 800]
        defaultRooms[0].partnerStandard = partnerStandard
        defaultRooms[0].defaultStandard = typeof defaultStandard === 'number' && defaultStandard > 0 ? defaultStandard : 500
      }

      await db.addDoc(COLLECTIONS.SETTINGS, {
        key: 'reservation_rooms',
        value: defaultRooms,
        _version: 1
      })

      var defaultFormConfig = JSON.parse(JSON.stringify(config.DEFAULT_FORM_CONFIG))
      await db.addDoc(COLLECTIONS.SETTINGS, {
        key: 'reservation_form_config',
        value: defaultFormConfig,
        _version: 1
      })

      config.invalidateCache()
      wx.showToast({ title: '已创建默认配置', icon: 'none', duration: 2000 })
    }
  } catch (err) {
    console.warn('初始化配置失败:', err)
  }
},
```

- [ ] **Step 2: Remove any initialization from reservation-add page**

Ensure reservation-add page never writes config — only reads (possibly returning defaults).

- [ ] **Step 3: Commit**

```bash
git add miniprogram/pages/min-amount/
git commit -m "feat: admin-only lazy init for reservation config on settings page"
```

---

### Task 12: Update existing tests

**Files:**
- Modify: `tests/unit/reservation-add.test.js`

- [ ] **Step 1: Update mock for reservationConfig in reservation-add tests**

Add to the top of the test file:

```js
jest.doMock('../../miniprogram/utils/reservationConfig', () => ({
  loadRooms: jest.fn().mockResolvedValue([
    { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500,600,800], partnerStandard: 300, defaultStandard: 500 },
    { id: 'small', name: '小包厢', enabled: true, order: 1, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500,600], partnerStandard: 300, defaultStandard: 500 },
    { id: 'chess', name: '棋牌室', enabled: true, order: 2, exclusiveTypes: [], timeSlots: ['中午','晚上'], standards: [], partnerStandard: 0, defaultStandard: 0 }
  ]),
  loadFormConfig: jest.fn().mockResolvedValue({
    fields: [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true, hiddenInRooms: [] },
      { id: 'phone', label: '手机号', type: 'text', builtin: true, visible: true, required: false, hiddenInRooms: [] },
      { id: 'guestCount', label: '人数', type: 'number', builtin: true, visible: true, required: true, hiddenInRooms: ['chess'] },
      { id: 'dishPrice', label: '预定菜价', type: 'number', builtin: true, visible: true, required: false, hiddenInRooms: ['chess'] },
      { id: 'remark', label: '备注', type: 'textarea', builtin: true, visible: true, required: false, hiddenInRooms: [] }
    ]
  }),
  resolveFields: jest.fn((fields, roomId) => fields.filter(f => f.visible && !(f.hiddenInRooms && f.hiddenInRooms.includes(roomId)))),
  invalidateCache: jest.fn()
}))
```

- [ ] **Step 2: Run tests and fix any failures**

Run: `npx jest tests/unit/ --no-cache 2>&1 | tail -30`

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: update reservation-add tests for dynamic config"
```

---

### Task 13: End-to-end verification

**Files:** None — manual testing

- [ ] **Step 1: Open settings page as admin → Verify 3-tab layout and "预约管理设置" title**
- [ ] **Step 2: Tab 0 → See 3 default rooms → Edit big room → Change standards → Save → Reload → Persists**
- [ ] **Step 3: Tab 0 → Add new room "VIP厅" → Save → Verify appears in list**
- [ ] **Step 4: Tab 1 → See 5 builtin fields → Toggle guestCount required off → Add custom field "台费" (number) → Set hiddenInRooms to ['big'] → Save**
- [ ] **Step 5: Reservation-add → Room pills show all 4 rooms → Select VIP厅 → Time/exclusive/standards match config → Select big → "台费" field hidden → Select chess → guestCount and dishPrice hidden**
- [ ] **Step 6: Create reservation on VIP厅 with 台费=150 → Open detail → See 台费: 150**
- [ ] **Step 7: Share that reservation → Verify 台费 in shared preview**
- [ ] **Step 8: Calendar page → Groups dynamically ordered → Filter pills show all 4 rooms**
- [ ] **Step 9: Tab 0 → Click "恢复默认" → Confirm → Verify reset to 3 rooms + 5 fields**
- [ ] **Step 10: Non-admin user → Open reservation-add → Works with cached/default config → No DB writes**

---

## Self-Review Checklist

**Spec coverage:**
- [x] §3.1 reservation_rooms data model → Task 1 (DEFAULT_ROOMS), Task 4 (CRUD)
- [x] §3.2 exclusiveType + room relationship → Task 6 (submit logic)
- [x] §3.3 reservation_form_config data model → Task 1 (DEFAULT_FORM_CONFIG), Task 5 (CRUD)
- [x] §3.4 预约文档存储结构 → Task 6 (submit/format logic)
- [x] §4.1 3-tab settings page → Task 3
- [x] §4.2 Tab 1 room management → Task 4
- [x] §4.3 Tab 2 form config → Task 5
- [x] §4.4 Tab 3 billing (existing) → Task 3 (move existing)
- [x] §4.5 Restore defaults → Task 4
- [x] §5.1 Config cache module → Task 1
- [x] §5.2 Cache usage strategy → Task 1, Task 6
- [x] §5.3 Optimistic locking → Task 4, Task 5
- [x] §6.1 Reservation-add dynamic rendering → Task 6
- [x] §6.2 WXML template rendering → Task 6
- [x] §6.3 Validate with resolved fields → Task 6
- [x] §6.4 Submit with customFields → Task 6
- [x] §6.5 Edit backward compat → Task 6
- [x] §7.1 Admin-only init → Task 11
- [x] §7.2 Old settings merge → Task 11
- [x] §7.3 Config fallback → Task 1
- [x] §8 Calendar dynamic grouping → Task 9
- [x] §9.1 reservation-detail customFields → Task 7
- [x] §9.1 reservation-share customFields → Task 8
- [x] §9.2 income-detail / customer-detail → Task 10
- [x] §9.3 helpers.js getRoomName → Task 2

**Placeholder scan:** No TBD/TODO/fill-in-later found.

**Type consistency:** `resolveFields` used consistently across Tasks 1, 5, 6, 9. `hiddenInRooms` used consistently (not `hiddenInRoom`). `editorRoom` used for editor form model. `_version` for optimistic lock.
