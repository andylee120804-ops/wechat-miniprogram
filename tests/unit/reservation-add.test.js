/**
 * Unit tests for reservation-add page methods
 * Focuses on: _getSettingsCache, shouldSync, isDishPriceRequired,
 * syncBanquetPurchase, syncIncome, deleteBanquetPurchase, isPastDate
 */

// Use the real COLLECTIONS constant
const { COLLECTIONS } = require('../../miniprogram/utils/db')

// Mock db module
const mockDb = {
  queryAll: jest.fn(),
  queryPage: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDb: jest.fn()
}

jest.doMock('../../miniprogram/utils/db', () => ({
  ...mockDb,
  COLLECTIONS, // keep real collection names
  PAGE_SIZE: 20
}))

jest.doMock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((d) => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }),
  getRoomName: jest.fn((r) => r === 'big' ? '大包厢' : '小包厢'),
  getExclusiveTypeName: jest.fn((et, room) => {
    if (!et || et === 'none') return room === 'big' ? '大包厢' : '小包厢'
    const map = { noon: '包场（午）', night: '包场（晚）', full: '包场（全天）' }
    return map[et] || '包场'
  })
}))
jest.doMock('../../miniprogram/utils/permission', () => ({
  hasPermission: jest.fn(() => true),
  checkPermission: jest.fn(() => true),
  ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
}))
jest.doMock('../../miniprogram/utils/validators', () => ({
  validateRequired: jest.fn((v, name) => {
    if (!v) return { valid: false, message: name + '不能为空' }
    return { valid: true, message: '' }
  }),
  validateGuestCount: jest.fn((v) => {
    const n = Number(v)
    if (!v || isNaN(n) || n <= 0) return { valid: false, message: '人数不能为空' }
    return { valid: true, message: '' }
  })
}))
jest.doMock('../../miniprogram/utils/logger', () => ({
  log: jest.fn(),
  LOG_TYPES: { RESERVATION_CREATE: 'create', RESERVATION_UPDATE: 'update', RESERVATION_DELETE: 'delete' }
}))
jest.doMock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn()
}))
jest.doMock('../../miniprogram/utils/reservationConfig', () => ({
  loadRooms: jest.fn().mockResolvedValue([
    { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500, 600, 800], partnerStandard: 300, defaultStandard: 500 },
    { id: 'small', name: '小包厢', enabled: true, order: 1, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500, 600], partnerStandard: 300, defaultStandard: 500 },
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

// Helper: create a page-like object with the methods under test
function createPageInstance() {
  const instance = {
    data: {
      errors: {},
      date: '2026-05-20',
      _dishPriceRequired: false,
      isEdit: false,
      id: '',
      submitting: false,
      allowNoStandard: false,
      standardPicked: true,
      isPartner: false,
      standard: 500,
      time: '中午',
      room: 'big',
      exclusiveType: 'none',
      formData: {
        customerName: '测试客户',
        phone: '',
        guestCount: '10',
        remark: '',
        dishPrice: '1000'
      },
      bossList: [],
      selectedBossIndex: -1,
      roomOptions: [
        { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500, 600, 800], partnerStandard: 300, defaultStandard: 500 },
        { id: 'small', name: '小包厢', enabled: true, order: 1, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500, 600], partnerStandard: 300, defaultStandard: 500 },
        { id: 'chess', name: '棋牌室', enabled: true, order: 2, exclusiveTypes: [], timeSlots: ['中午','晚上'], standards: [], partnerStandard: 0, defaultStandard: 0 }
      ],
      currentRoomConfig: { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none','noon','night','full'], timeSlots: ['中午','晚上'], standards: [500, 600, 800], partnerStandard: 300, defaultStandard: 500 },
      formConfigFields: [
        { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true, hiddenInRooms: [] },
        { id: 'phone', label: '手机号', type: 'text', builtin: true, visible: true, required: false, hiddenInRooms: [] },
        { id: 'guestCount', label: '人数', type: 'number', builtin: true, visible: true, required: true, hiddenInRooms: ['chess'] },
        { id: 'dishPrice', label: '预定菜价', type: 'number', builtin: true, visible: true, required: false, hiddenInRooms: ['chess'] },
        { id: 'remark', label: '备注', type: 'textarea', builtin: true, visible: true, required: false, hiddenInRooms: [] }
      ],
      formFields: [
        { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true, hiddenInRooms: [] },
        { id: 'phone', label: '手机号', type: 'text', builtin: true, visible: true, required: false, hiddenInRooms: [] },
        { id: 'guestCount', label: '人数', type: 'number', builtin: true, visible: true, required: true, hiddenInRooms: [] },
        { id: 'dishPrice', label: '预定菜价', type: 'number', builtin: true, visible: true, required: false, hiddenInRooms: [] },
        { id: 'remark', label: '备注', type: 'textarea', builtin: true, visible: true, required: false, hiddenInRooms: [] }
      ]
    },
    setData: jest.fn(function(updates) {
      Object.assign(this.data, updates)
    }),
    _settingsCache: null,

    async _getSettingsCache() {
      if (!this._settingsCache) {
        const res = await mockDb.queryAll(COLLECTIONS.SETTINGS, {})
        const settings = {}
        ;(res.data || []).forEach(s => {
          if (!(s.key in settings)) {
            // approval_rules stores fields at top level (no .value), other settings use .value
            settings[s.key] = s.key === 'approval_rules' ? s : (s.value !== undefined ? s.value : s)
          }
        })
        this._settingsCache = settings
      }
      return this._settingsCache
    },

    async shouldSync(dateStr) {
      try {
        const settings = await this._getSettingsCache()
        if (!settings.serviceChargeEnabled) return false
        if (!settings.serviceChargeEnabledDate) return false
        if (dateStr < settings.serviceChargeEnabledDate) return false
        return true
      } catch (err) {
        return false
      }
    },

    async isDishPriceRequired(dateStr) {
      try {
        const settings = await this._getSettingsCache()
        if (!settings.serviceChargeEnabled) return false
        if (!settings.serviceChargeEnabledDate) return false
        return dateStr >= settings.serviceChargeEnabledDate
      } catch (err) {
        return false
      }
    },

    async syncBanquetPurchase(docData, reservationId, isCreate) {
      try {
        // Rooms without standards don't need purchase records
        var standards = this.data.currentRoomConfig ? this.data.currentRoomConfig.standards : null
        var noStandard = standards && standards.length === 0 && docData.exclusiveType === 'none'
        if (noStandard) return

        const dishPrice = Number(docData.dishPrice) || 0
        const existing = await mockDb.queryAll(COLLECTIONS.PURCHASE, {
          sourceReservationId: reservationId
        })
        const hasExisting = existing.data && existing.data.length > 0
        const first = hasExisting ? existing.data[0] : null

        if (dishPrice > 0) {
          const app = getApp()
          const userInfo = app.globalData.userInfo || {}
          const remark = (docData.customerName || '') + ' - ' + (docData.roomName || '')
          const now = new Date()

          // Respect approval rules (consistent with cloud function)
          const settings = await this._getSettingsCache()
          const rules = settings.approval_rules || {}
          const needBanquetApproval = !!(rules && rules.enabled !== false && (rules.categories || {}).banquet === true)
          const amountThreshold = rules && rules.amountThreshold ? Number(rules.amountThreshold) : Infinity
          const needApproval = needBanquetApproval || (dishPrice > amountThreshold)

          const purchaseData = {
            amount: dishPrice, category: 'banquet',
            date: '2026-05-20', remark, item: '',
            purchaseBy: userInfo._id || '', purchaseByName: userInfo.name || '',
            sourceReservationId: reservationId, autoGenerated: true,
            status: needApproval ? 'pending' : 'approved',
            approverName: needApproval ? (rules.defaultApproverName || '') : '宴会创建自动批复',
            ...(needApproval
              ? { approverId: rules.defaultApproverId || '' }
              : { approvedAt: now })
          }
          if (!purchaseData.purchaseBy) delete purchaseData.purchaseBy

          if (hasExisting) {
            if (!isCreate) await mockDb.updateDoc(COLLECTIONS.PURCHASE, first._id, purchaseData)
          } else {
            const addResult = await mockDb.addDoc(COLLECTIONS.PURCHASE, purchaseData)
            // 写入审批日志（仅自动批复时记录）
            if (!needApproval) {
              await mockDb.addDoc(COLLECTIONS.APPROVAL_LOG, {
                purchaseId: addResult._id,
                action: 'approved',
                operatorId: '',
                operatorName: '宴会创建自动批复',
                remark: '宴会预约创建时自动批复',
                createdAt: now
              }).catch(function(e) { console.warn('[banquet-sync] 自动审批日志写入失败:', e) })
            }
          }
        } else {
          // dishPrice is 0 — delete autoGenerated record only
          if (first && first.autoGenerated) {
            await mockDb.deleteDoc(COLLECTIONS.PURCHASE, first._id)
          }
        }
      } catch (err) {
        // silent
      }
    },

    async syncIncome(docData, reservationId, isCreate) {
      try {
        var standards = this.data.currentRoomConfig ? this.data.currentRoomConfig.standards : null
        var noStandard = standards && standards.length === 0 && docData.exclusiveType === 'none'
        if (noStandard) return

        const dishPrice = Number(docData.dishPrice) || 0
        if (dishPrice <= 0) return
        const time = docData.time || '中午'
        const settings = await this._getSettingsCache()
        const chargeNoon = Number(settings.serviceChargeNoon) || 0
        const chargeNight = Number(settings.serviceChargeNight) || 0
        const charge = time === '中午' ? chargeNoon : chargeNight
        const amount = dishPrice + charge

        const existing = await mockDb.queryAll(COLLECTIONS.INCOME, { reservationId })
        const hasExisting = existing.data && existing.data.length > 0
        const first = hasExisting ? existing.data[0] : null

        const app = getApp()
        const userInfo = app.globalData.userInfo || {}

        const incomeData = {
          type: 'dining',
          amount,
          date: '2026-05-20',
          source: docData.customerName || '',
          reservationId,
          remark: '',
          collectedBy: userInfo._id || '',
          collectedByName: userInfo.name || '',
          calcMode: 'dishPrice',
          dishPrice,
          serviceCharge: charge,
          guestCount: docData.guestCount || 0,
          standard: docData.standard || 0,
          roomName: docData.roomName || '',
          autoGenerated: true
        }

        if (hasExisting) {
          if (!isCreate) await mockDb.updateDoc(COLLECTIONS.INCOME, first._id, incomeData)
        } else {
          await mockDb.addDoc(COLLECTIONS.INCOME, incomeData)
          await mockDb.updateDoc(COLLECTIONS.RESERVATION, reservationId, { hasIncome: true })
        }
      } catch (err) {
        // silent
      }
    },

    async deleteBanquetPurchase(reservationId) {
      try {
        const purchases = await mockDb.queryAll(COLLECTIONS.PURCHASE, {
          sourceReservationId: reservationId,
          autoGenerated: true
        })
        for (const p of (purchases.data || [])) {
          await mockDb.deleteDoc(COLLECTIONS.PURCHASE, p._id)
        }
        const incomes = await mockDb.queryAll(COLLECTIONS.INCOME, {
          reservationId: reservationId,
          autoGenerated: true
        })
        for (const inc of (incomes.data || [])) {
          await mockDb.deleteDoc(COLLECTIONS.INCOME, inc._id)
        }
      } catch (err) {
        // silent
      }
    },

    isPastDate(dateStr) {
      const today = new Date()
      const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0')
      return dateStr < todayStr
    },

    clearError(field) {
      if (this.data.errors[field]) {
        this.setData({ errors: { ...this.data.errors, [field]: '' } })
      }
    }
  }
  return instance
}

describe('reservation-add: _getSettingsCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should query settings and cache result', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNight', value: 300 }
      ]
    })

    const settings = await page._getSettingsCache()
    expect(settings.serviceChargeEnabled).toBe(true)
    expect(settings.serviceChargeNoon).toBe(200)
    expect(mockDb.queryAll).toHaveBeenCalledTimes(1)

    // Second call should use cache
    const settings2 = await page._getSettingsCache()
    expect(settings2).toBe(settings)
    expect(mockDb.queryAll).toHaveBeenCalledTimes(1)
  })

  it('should handle duplicate keys by keeping first', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNoon', value: 999 }
      ]
    })

    const settings = await page._getSettingsCache()
    expect(settings.serviceChargeNoon).toBe(200)
  })

  it('should handle empty data', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({ data: [] })

    const settings = await page._getSettingsCache()
    expect(settings).toEqual({})
  })
})

describe('reservation-add: shouldSync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return true when all conditions are met', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNight', value: 300 }
      ]
    })

    const result = await page.shouldSync('2026-05-20')
    expect(result).toBe(true)
  })

  it('should return false when serviceCharge is disabled', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [{ key: 'serviceChargeEnabled', value: false }]
    })

    const result = await page.shouldSync('2026-05-20')
    expect(result).toBe(false)
  })

  it('should return false when date is before enabledDate', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-06-01' }
      ]
    })

    const result = await page.shouldSync('2026-05-20')
    expect(result).toBe(false)
  })

  it('should return false on query error', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockRejectedValue(new Error('network'))

    const result = await page.shouldSync('2026-05-20')
    expect(result).toBe(false)
  })
})

describe('reservation-add: isDishPriceRequired', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return true when date is on or after enabledDate', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-05-01' }
      ]
    })

    expect(await page.isDishPriceRequired('2026-05-20')).toBe(true)
    expect(await page.isDishPriceRequired('2026-05-01')).toBe(true)
    expect(await page.isDishPriceRequired('2026-04-30')).toBe(false)
  })

  it('should return false when serviceCharge is disabled', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [{ key: 'serviceChargeEnabled', value: false }]
    })

    expect(await page.isDishPriceRequired('2026-05-20')).toBe(false)
  })

  it('should share cache with shouldSync', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNight', value: 300 }
      ]
    })

    await page.shouldSync('2026-05-20')
    await page.isDishPriceRequired('2026-05-20')
    expect(mockDb.queryAll).toHaveBeenCalledTimes(1)
  })
})

describe('reservation-add: syncBanquetPurchase', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('should create a new purchase when no existing record', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [] }) // purchase query (called first)
      .mockResolvedValueOnce({  // settings query (called second via _getSettingsCache)
        data: [
          { key: 'serviceChargeEnabled', value: true },
          { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
          { key: 'serviceChargeNoon', value: 200 },
          { key: 'serviceChargeNight', value: 300 },
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'p1' })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res1', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, expect.objectContaining({
      amount: 1000,
      category: 'banquet',
      sourceReservationId: 'res1',
      autoGenerated: true,
      remark: '张三 - 大包厢',
      status: 'approved',
      approverName: '宴会创建自动批复'
    }))
  })

  it('should create purchase with pending status when banquet approval required', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [] }) // purchase query
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: true, autoPurchaseEnabled: true, categories: { banquet: true }, defaultApproverId: 'approver1', defaultApproverName: '审批人' }
        ]
      })
    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'p-pending' })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 500,
      customerName: '需审批',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res-approval', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, expect.objectContaining({
      status: 'pending',
      approverId: 'approver1',
      approverName: '审批人'
    }))
  })

  it('should create purchase with pending status when dishPrice exceeds amountThreshold', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [] }) // purchase query
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: true, autoPurchaseEnabled: true, categories: { banquet: false }, amountThreshold: 500, defaultApproverId: 'app1', defaultApproverName: '大额审批人' }
        ]
      })
    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'p-threshold' })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 800,
      customerName: '大额',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res-threshold', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, expect.objectContaining({
      status: 'pending',
      approverId: 'app1',
      approverName: '大额审批人'
    }))
  })

  it('should write approval log only when auto-approved', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [] }) // purchase query
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'p-auto' })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 300,
      customerName: '自动批复',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res-auto', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.APPROVAL_LOG, expect.objectContaining({
      purchaseId: 'p-auto',
      action: 'approved',
      operatorName: '宴会创建自动批复'
    }))
  })

  it('should update existing purchase when isCreate is false', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [{ _id: 'p1', autoGenerated: true, amount: 800 }]
      })
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.updateDoc.mockReset()
    mockDb.updateDoc.mockResolvedValue({ updated: 1 })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1200,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res1', false)
    expect(mockDb.updateDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, 'p1', expect.objectContaining({
      amount: 1200
    }))
  })

  it('should NOT update existing purchase when isCreate is true', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [{ _id: 'p1', autoGenerated: true, amount: 800 }]
      })
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.updateDoc.mockReset()

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午'
    }

    await page.syncBanquetPurchase(docData, 'res1', true)
    expect(mockDb.updateDoc).not.toHaveBeenCalled()
  })

  it('should delete autoGenerated purchase when dishPrice is 0', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [{ _id: 'p1', autoGenerated: true, amount: 800 }]
      })
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.deleteDoc.mockReset()
    mockDb.deleteDoc.mockResolvedValue({ removed: 1 })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 0,
      customerName: '张三',
      roomName: '大包厢'
    }

    await page.syncBanquetPurchase(docData, 'res1', false)
    expect(mockDb.deleteDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, 'p1')
  })

  it('should NOT delete non-autoGenerated purchase when dishPrice is 0', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [{ _id: 'p1', autoGenerated: false, amount: 800 }]
      })
      .mockResolvedValueOnce({ // settings query
        data: [
          { key: 'approval_rules', enabled: false, autoPurchaseEnabled: true }
        ]
      })
    mockDb.deleteDoc.mockReset()

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 0,
      customerName: '张三',
      roomName: '大包厢'
    }

    await page.syncBanquetPurchase(docData, 'res1', false)
    expect(mockDb.deleteDoc).not.toHaveBeenCalled()
  })

  it('should skip chess room (no standards, exclusiveType=none)', async () => {
    const page = createPageInstance()
    // Simulate chess room config (no standards)
    page.data.currentRoomConfig = { id: 'chess', name: '棋牌室', standards: [] }

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 500,
      customerName: '棋客',
      roomName: '棋牌室',
      room: 'chess',
      exclusiveType: 'none'
    }

    await page.syncBanquetPurchase(docData, 'res1', true)
    expect(mockDb.queryAll).not.toHaveBeenCalled()
    expect(mockDb.addDoc).not.toHaveBeenCalled()
  })
})

describe('reservation-add: syncIncome', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('should create new income with service charge from settings cache', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ // settings query (called first via _getSettingsCache)
        data: [
          { key: 'serviceChargeEnabled', value: true },
          { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
          { key: 'serviceChargeNoon', value: 200 },
          { key: 'serviceChargeNight', value: 300 }
        ]
      })
      .mockResolvedValueOnce({ data: [] }) // income query

    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'i1' })
    mockDb.updateDoc.mockReset()
    mockDb.updateDoc.mockResolvedValue({ updated: 1 })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午',
      guestCount: 10,
      standard: 500
    }

    await page.syncIncome(docData, 'res1', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.INCOME, expect.objectContaining({
      amount: 1200, // 1000 + 200 (noon)
      dishPrice: 1000,
      serviceCharge: 200,
      autoGenerated: true,
      reservationId: 'res1'
    }))
    expect(mockDb.updateDoc).toHaveBeenCalledWith(COLLECTIONS.RESERVATION, 'res1', { hasIncome: true })
  })

  it('should use night charge for evening reservations', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [
          { key: 'serviceChargeNoon', value: 200 },
          { key: 'serviceChargeNight', value: 300 }
        ]
      })
      .mockResolvedValueOnce({ data: [] })

    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'i1' })
    mockDb.updateDoc.mockReset()
    mockDb.updateDoc.mockResolvedValue({ updated: 1 })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 800,
      customerName: '李四',
      roomName: '小包厢',
      time: '晚上',
      guestCount: 6,
      standard: 600
    }

    await page.syncIncome(docData, 'res2', true)
    expect(mockDb.addDoc).toHaveBeenCalledWith(COLLECTIONS.INCOME, expect.objectContaining({
      amount: 1100, // 800 + 300 (night)
      serviceCharge: 300
    }))
  })

  it('should return early when dishPrice <= 0', async () => {
    const page = createPageInstance()

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 0,
      customerName: '张三',
      time: '中午'
    }

    await page.syncIncome(docData, 'res1', true)
    expect(mockDb.addDoc).not.toHaveBeenCalled()
  })

  it('should update existing income when isCreate is false', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [
          { key: 'serviceChargeNoon', value: 200 },
          { key: 'serviceChargeNight', value: 300 }
        ]
      })
      .mockResolvedValueOnce({
        data: [{ _id: 'i1', autoGenerated: true, amount: 1000 }]
      })

    mockDb.updateDoc.mockReset()
    mockDb.updateDoc.mockResolvedValue({ updated: 1 })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午',
      guestCount: 10,
      standard: 500
    }

    await page.syncIncome(docData, 'res1', false)
    expect(mockDb.updateDoc).toHaveBeenCalledWith(COLLECTIONS.INCOME, 'i1', expect.objectContaining({
      amount: 1200,
      dishPrice: 1000,
      serviceCharge: 200
    }))
    expect(mockDb.addDoc).not.toHaveBeenCalled()
  })

  it('should NOT update when isCreate is true and record exists', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({
        data: [
          { key: 'serviceChargeNoon', value: 200 },
          { key: 'serviceChargeNight', value: 300 }
        ]
      })
      .mockResolvedValueOnce({
        data: [{ _id: 'i1', autoGenerated: true, amount: 1000 }]
      })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午',
      guestCount: 10,
      standard: 500
    }

    await page.syncIncome(docData, 'res1', true)
    expect(mockDb.updateDoc).not.toHaveBeenCalled()
    expect(mockDb.addDoc).not.toHaveBeenCalled()
  })
})

describe('reservation-add: deleteBanquetPurchase', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('should delete only autoGenerated purchases and incomes', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [{ _id: 'p1' }, { _id: 'p2' }] })
      .mockResolvedValueOnce({ data: [{ _id: 'i1' }] })
    mockDb.deleteDoc.mockReset()
    mockDb.deleteDoc.mockResolvedValue({ removed: 1 })

    await page.deleteBanquetPurchase('res1')

    // Verify queryAll was called with autoGenerated: true
    expect(mockDb.queryAll).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, {
      sourceReservationId: 'res1',
      autoGenerated: true
    })
    expect(mockDb.queryAll).toHaveBeenCalledWith(COLLECTIONS.INCOME, {
      reservationId: 'res1',
      autoGenerated: true
    })
    expect(mockDb.deleteDoc).toHaveBeenCalledTimes(3)
    expect(mockDb.deleteDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, 'p1')
    expect(mockDb.deleteDoc).toHaveBeenCalledWith(COLLECTIONS.PURCHASE, 'p2')
    expect(mockDb.deleteDoc).toHaveBeenCalledWith(COLLECTIONS.INCOME, 'i1')
  })

  it('should handle empty results gracefully', async () => {
    const page = createPageInstance()
    mockDb.queryAll.mockReset()
    mockDb.queryAll
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
    mockDb.deleteDoc.mockReset()

    await page.deleteBanquetPurchase('res1')
    expect(mockDb.deleteDoc).not.toHaveBeenCalled()
  })
})

describe('reservation-add: isPastDate', () => {
  it('should return false for today', () => {
    const page = createPageInstance()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(page.isPastDate(todayStr)).toBe(false)
  })

  it('should return true for yesterday', () => {
    const page = createPageInstance()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    expect(page.isPastDate(yesterdayStr)).toBe(true)
  })

  it('should return false for tomorrow', () => {
    const page = createPageInstance()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    expect(page.isPastDate(tomorrowStr)).toBe(false)
  })
})

describe('reservation-add: clearError', () => {
  it('should clear the specified error field', () => {
    const page = createPageInstance()
    page.data.errors = { customerName: '不能为空', phone: '格式错误' }
    page.clearError('customerName')
    expect(page.setData).toHaveBeenCalledWith({
      errors: { customerName: '', phone: '格式错误' }
    })
  })

  it('should do nothing when field has no error', () => {
    const page = createPageInstance()
    page.data.errors = { customerName: '不能为空' }
    page.clearError('phone')
    expect(page.setData).not.toHaveBeenCalled()
  })
})

describe('reservation-add: settings cache integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('should only query settings once across shouldSync, isDishPriceRequired, and syncIncome', async () => {
    const page = createPageInstance()
    page._settingsCache = null
    mockDb.queryAll.mockReset()
    mockDb.queryAll.mockResolvedValue({
      data: [
        { key: 'serviceChargeEnabled', value: true },
        { key: 'serviceChargeEnabledDate', value: '2026-01-01' },
        { key: 'serviceChargeNoon', value: 200 },
        { key: 'serviceChargeNight', value: 300 }
      ]
    })

    await page.shouldSync('2026-05-20')
    await page.isDishPriceRequired('2026-05-20')

    // For syncIncome, another queryAll for income check
    mockDb.queryAll.mockResolvedValueOnce({ data: [] })

    const docData = {
      date: new Date('2026-05-20'),
      dishPrice: 1000,
      customerName: '张三',
      roomName: '大包厢',
      time: '中午',
      guestCount: 10,
      standard: 500
    }
    mockDb.addDoc.mockReset()
    mockDb.addDoc.mockResolvedValue({ _id: 'i1' })
    mockDb.updateDoc.mockReset()
    mockDb.updateDoc.mockResolvedValue({ updated: 1 })

    await page.syncIncome(docData, 'res1', true)

    // Settings should only be queried once (the cached call)
    const settingsCalls = mockDb.queryAll.mock.calls.filter(
      call => call[0] === COLLECTIONS.SETTINGS
    )
    expect(settingsCalls.length).toBe(1)
  })
})
