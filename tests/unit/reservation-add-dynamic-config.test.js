/**
 * Unit tests for reservation-add page dynamic config methods
 *
 * Tests the page-level methods that drive the dynamic configuration:
 *   - loadReservationConfig
 *   - applyRoomConfig
 *   - selectRoom
 *   - _clearFieldsHiddenByRoomTransition
 *   - _buildDocData
 *
 * These are tested by constructing a page-like object with the same
 * method implementations, similar to the existing reservation-add.test.js
 * pattern.
 */

const reservationConfig = require('../../miniprogram/utils/reservationConfig')

// Mock reservationConfig
jest.mock('../../miniprogram/utils/reservationConfig', () => ({
  loadRooms: jest.fn(),
  loadFormConfig: jest.fn(),
  resolveFields: jest.fn((fields, roomId) =>
    fields.filter(f => f.visible && !(f.hiddenInRooms && f.hiddenInRooms.includes(roomId)))
  ),
  invalidateCache: jest.fn()
}))

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: jest.fn(),
  getDb: jest.fn(),
  COLLECTIONS: { SETTINGS: 'settings', RESERVATION: 'reservation', STAFF: 'staff' }
}))

jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((d) => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }),
  getExclusiveTypeName: jest.fn((et, room) => {
    if (!et || et === 'none') return room === 'big' ? '大包厢' : '小包厢'
    const map = { noon: '包场（午）', night: '包场（晚）', full: '包场（全天）' }
    return map[et] || '包场'
  })
}))

jest.mock('../../miniprogram/utils/permission', () => ({
  hasPermission: jest.fn(() => true),
  ACTIONS: { VIEW: 'view', ADD: 'add', EDIT: 'edit', DELETE: 'delete' }
}))

jest.mock('../../miniprogram/utils/logger', () => ({
  log: jest.fn(),
  LOG_TYPES: { RESERVATION_CREATE: 'create', RESERVATION_UPDATE: 'update', RESERVATION_DELETE: 'delete' }
}))

jest.mock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn()
}))

jest.mock('../../miniprogram/utils/validators', () => ({
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

jest.mock('../../miniprogram/pages/reservation-add/helpers/settings-cache', () => ({
  createSettingsCache: jest.fn(() => ({ get: jest.fn(), invalidate: jest.fn() }))
}))

jest.mock('../../miniprogram/pages/reservation-add/helpers/sync', () => ({
  syncBanquetPurchase: jest.fn(),
  syncIncome: jest.fn(),
  deleteBanquetPurchase: jest.fn(),
  isNoStandardRoom: jest.fn()
}))

jest.mock('../../miniprogram/pages/reservation-add/helpers/conflict-check', () => ({
  checkReservationConflict: jest.fn()
}))

jest.mock('../../miniprogram/pages/reservation-add/helpers/validation', () => ({
  validateReservationForm: jest.fn(() => ({}))
}))

const DEFAULT_ROOMS = [
  { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none', 'noon', 'night', 'full'], timeSlots: ['中午', '晚上'], standards: [500, 600, 800], partnerStandard: 300, defaultStandard: 500 },
  { id: 'small', name: '小包厢', enabled: true, order: 1, exclusiveTypes: ['none', 'noon', 'night', 'full'], timeSlots: ['中午', '晚上'], standards: [500, 600], partnerStandard: 300, defaultStandard: 500 },
  { id: 'chess', name: '棋牌室', enabled: true, order: 2, exclusiveTypes: [], timeSlots: ['中午', '晚上'], standards: [], partnerStandard: 0, defaultStandard: 0 }
]

const DEFAULT_FORM_CONFIG = {
  fields: [
    { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true, hiddenInRooms: [] },
    { id: 'guestCount', label: '人数', type: 'number', builtin: true, visible: true, required: true, hiddenInRooms: ['chess'] },
    { id: 'dishPrice', label: '预定菜价', type: 'number', builtin: true, visible: true, required: false, hiddenInRooms: ['chess'] },
    { id: 'phone', label: '手机号', type: 'text', builtin: true, visible: true, required: false, hiddenInRooms: [] },
    { id: 'remark', label: '备注', type: 'textarea', builtin: true, visible: true, required: false, hiddenInRooms: [] }
  ]
}

/**
 * Create a page-like instance with the dynamic config methods.
 */
function createPageInstance() {
  const instance = {
    data: {
      isEdit: false,
      id: '',
      date: '2099-06-01',
      time: '',
      exclusiveType: 'none',
      room: '',
      standard: 0,
      isPartner: false,
      standardPicked: false,
      roomOptions: [],
      rooms: [],
      currentRoomConfig: null,
      timeOptions: [],
      exclusiveOptions: [],
      standardOptions: [],
      partnerStandard: 0,
      defaultStandard: 0,
      allowNoStandard: false,
      formConfigFields: [],
      formFields: [],
      formData: {},
      _dishPriceRequired: false,
      errors: {}
    },
    setData: jest.fn(function(updates) {
      // Handle dot-notation keys like 'formData.guestCount'
      Object.keys(updates).forEach(key => {
        if (key.includes('.')) {
          const parts = key.split('.')
          let obj = this.data
          for (let i = 0; i < parts.length - 1; i++) {
            if (obj[parts[i]] === undefined) obj[parts[i]] = {}
            obj = obj[parts[i]]
          }
          obj[parts[parts.length - 1]] = updates[key]
        } else {
          this.data[key] = updates[key]
        }
      })
    }),

    async loadReservationConfig() {
      try {
        const rooms = await reservationConfig.loadRooms()
        const formConfig = await reservationConfig.loadFormConfig()
        const enabledRooms = rooms.filter(r => r.enabled).sort((a, b) => a.order - b.order)
        const firstRoom = enabledRooms[0] || rooms[0]

        const formData = {}
        formConfig.fields.forEach(f => { formData[f.id] = '' })

        this.setData({
          rooms,
          roomOptions: enabledRooms,
          formConfigFields: formConfig.fields,
          formData,
          room: firstRoom ? firstRoom.id : '',
          currentRoomConfig: firstRoom
        })

        if (firstRoom) {
          this.applyRoomConfig(firstRoom)
        }
      } catch (err) {
        console.warn('加载预约配置失败:', err)
      }
    },

    applyRoomConfig(roomConfig) {
      const resolved = reservationConfig.resolveFields(
        this.data.formConfigFields, roomConfig.id
      )

      const updates = {
        timeOptions: roomConfig.timeSlots,
        exclusiveOptions: roomConfig.exclusiveTypes,
        standardOptions: roomConfig.standards,
        partnerStandard: roomConfig.partnerStandard,
        defaultStandard: roomConfig.defaultStandard,
        allowNoStandard: roomConfig.standards.length === 0,
        formFields: resolved
      }

      if (!roomConfig.timeSlots.includes(this.data.time)) {
        updates.time = roomConfig.timeSlots[0] || ''
      }
      if (!roomConfig.exclusiveTypes.includes(this.data.exclusiveType)) {
        updates.exclusiveType = roomConfig.exclusiveTypes.includes('none') ? 'none' :
          roomConfig.exclusiveTypes[0] || 'none'
      }

      if (!this.data.isPartner) {
        const ds = Number(roomConfig.defaultStandard) || 0
        if (ds > 0 && roomConfig.standards.indexOf(ds) >= 0) {
          const currentInOptions = roomConfig.standards.indexOf(this.data.standard) >= 0
          if (!this.data.standardPicked || !currentInOptions) {
            updates.standard = ds
            updates.standardPicked = true
          }
        } else if (roomConfig.standards.length === 0) {
          updates.standard = 0
          updates.standardPicked = false
        } else if (!roomConfig.standards.includes(this.data.standard)) {
          updates.standard = 0
          updates.standardPicked = false
        }
      }

      this.setData(updates)
    },

    selectRoom(roomId) {
      const roomConfig = this.data.roomOptions.find(r => r.id === roomId)
      if (!roomConfig) return

      const previousRoomId = this.data.room
      this.setData({ room: roomId, currentRoomConfig: roomConfig })
      this.applyRoomConfig(roomConfig)
      this._clearFieldsHiddenByRoomTransition(previousRoomId, roomId)
    },

    _clearFieldsHiddenByRoomTransition(oldRoomId, newRoomId) {
      const oldFields = reservationConfig.resolveFields(this.data.formConfigFields, oldRoomId)
      const newFields = reservationConfig.resolveFields(this.data.formConfigFields, newRoomId)
      const updates = {}
      oldFields.forEach(f => {
        if (!newFields.find(nf => nf.id === f.id)) {
          updates['formData.' + f.id] = ''
        }
      })
      if (Object.keys(updates).length > 0) {
        this.setData(updates)
      }
    },

    _buildDocData() {
      const formData = this.data.formData
      const roomConfig = this.data.currentRoomConfig || {}
      const docData = {}
      const customFields = {}

      this.data.formFields.forEach(f => {
        const raw = formData[f.id]
        if (f.builtin) {
          if (f.id === 'guestCount') {
            docData.guestCount = Number(raw) || 0
          } else if (f.id === 'dishPrice') {
            docData.dishPrice = Number(raw) || 0
          } else {
            docData[f.id] = typeof raw === 'string' ? raw.trim() : raw
          }
        } else {
          customFields[f.id] = f.type === 'number' ? (Number(raw) || 0) :
            (typeof raw === 'string' ? raw.trim() : raw)
        }
      })

      const et = this.data.exclusiveType
      docData.date = new Date(this.data.date + 'T00:00:00')
      docData.time = this.data.time
      docData.exclusiveType = et
      docData.isPartner = this.data.isPartner
      docData.room = this.data.room
      docData.roomName = require('../../miniprogram/utils/helpers').getExclusiveTypeName(et, this.data.room)
      docData.standard = Number(this.data.standard) || 0
      docData.customFields = customFields
      docData.hasIncome = false

      if (roomConfig.standards && roomConfig.standards.length === 0 && et === 'none') {
        docData.standard = 0
      }

      return docData
    }
  }
  return instance
}

describe('loadReservationConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('loads rooms and form config, sets enabled rooms sorted by order', async () => {
    reservationConfig.loadRooms.mockResolvedValueOnce(DEFAULT_ROOMS)
    reservationConfig.loadFormConfig.mockResolvedValueOnce(DEFAULT_FORM_CONFIG)

    const page = createPageInstance()
    await page.loadReservationConfig()

    expect(page.data.rooms).toEqual(DEFAULT_ROOMS)
    expect(page.data.roomOptions.length).toBe(3)
    expect(page.data.roomOptions.map(r => r.id)).toEqual(['big', 'small', 'chess'])
    expect(page.data.room).toBe('big')
    expect(page.data.formConfigFields.length).toBe(5)
  })

  test('initializes formData with empty strings for each field id', async () => {
    reservationConfig.loadRooms.mockResolvedValueOnce(DEFAULT_ROOMS)
    reservationConfig.loadFormConfig.mockResolvedValueOnce(DEFAULT_FORM_CONFIG)

    const page = createPageInstance()
    await page.loadReservationConfig()

    expect(page.data.formData.customerName).toBe('')
    expect(page.data.formData.phone).toBe('')
    expect(page.data.formData.guestCount).toBe('')
    expect(page.data.formData.dishPrice).toBe('')
    expect(page.data.formData.remark).toBe('')
  })

  test('filters to enabled rooms only', async () => {
    const rooms = [
      { ...DEFAULT_ROOMS[0], enabled: true },
      { ...DEFAULT_ROOMS[1], enabled: false },
      { ...DEFAULT_ROOMS[2], enabled: true }
    ]
    reservationConfig.loadRooms.mockResolvedValueOnce(rooms)
    reservationConfig.loadFormConfig.mockResolvedValueOnce(DEFAULT_FORM_CONFIG)

    const page = createPageInstance()
    await page.loadReservationConfig()

    expect(page.data.roomOptions.length).toBe(2)
    expect(page.data.roomOptions.map(r => r.id)).toEqual(['big', 'chess'])
  })

  test('calls applyRoomConfig with first enabled room', async () => {
    reservationConfig.loadRooms.mockResolvedValueOnce(DEFAULT_ROOMS)
    reservationConfig.loadFormConfig.mockResolvedValueOnce(DEFAULT_FORM_CONFIG)

    const page = createPageInstance()
    await page.loadReservationConfig()

    // applyRoomConfig should have set timeOptions etc from big room
    expect(page.data.timeOptions).toEqual(['中午', '晚上'])
    expect(page.data.exclusiveOptions).toEqual(['none', 'noon', 'night', 'full'])
  })
})

describe('applyRoomConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('sets timeOptions, exclusiveOptions, standardOptions from room config', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields

    page.applyRoomConfig(DEFAULT_ROOMS[0]) // big

    expect(page.data.timeOptions).toEqual(['中午', '晚上'])
    expect(page.data.exclusiveOptions).toEqual(['none', 'noon', 'night', 'full'])
    expect(page.data.standardOptions).toEqual([500, 600, 800])
  })

  test('resolves formFields via resolveFields for the room', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields

    page.applyRoomConfig(DEFAULT_ROOMS[0]) // big

    // big room shows all fields
    const fieldIds = page.data.formFields.map(f => f.id)
    expect(fieldIds).toContain('guestCount')
    expect(fieldIds).toContain('dishPrice')
  })

  test('sets allowNoStandard=true for chess room (no standards)', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields

    page.applyRoomConfig(DEFAULT_ROOMS[2]) // chess

    expect(page.data.allowNoStandard).toBe(true)
    expect(page.data.standardOptions).toEqual([])
  })

  test('auto-selects defaultStandard when valid and not already picked', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.standardPicked = false

    page.applyRoomConfig(DEFAULT_ROOMS[0]) // big, defaultStandard=500

    expect(page.data.standard).toBe(500)
    expect(page.data.standardPicked).toBe(true)
  })

  test('keeps current standard if valid for new room and already picked', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.standardPicked = true
    page.data.standard = 600
    page.data.isPartner = false

    page.applyRoomConfig(DEFAULT_ROOMS[0]) // big, standards=[500,600,800]

    expect(page.data.standard).toBe(600) // kept
    expect(page.data.standardPicked).toBe(true)
  })

  test('resets standard when current is not in new room options', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.standardPicked = true
    page.data.standard = 800
    page.data.isPartner = false

    page.applyRoomConfig(DEFAULT_ROOMS[1]) // small, standards=[500,600]

    expect(page.data.standard).toBe(500) // falls back to defaultStandard
    expect(page.data.standardPicked).toBe(true)
  })

  test('clears standard for chess room (no standards)', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.standardPicked = true
    page.data.standard = 500
    page.data.isPartner = false

    page.applyRoomConfig(DEFAULT_ROOMS[2]) // chess

    expect(page.data.standard).toBe(0)
    expect(page.data.standardPicked).toBe(false)
  })

  test('resets time if current time not in new room timeSlots', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.time = '下午'

    page.applyRoomConfig(DEFAULT_ROOMS[0])

    expect(page.data.time).toBe('中午') // first timeSlot
  })

  test('resets exclusiveType if current not in new room exclusiveTypes', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.exclusiveType = 'full'

    page.applyRoomConfig(DEFAULT_ROOMS[2]) // chess has no exclusiveTypes

    expect(page.data.exclusiveType).toBe('none')
  })

  test('does not auto-select standard when isPartner is true', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.isPartner = true
    page.data.standardPicked = false
    page.data.standard = 0

    page.applyRoomConfig(DEFAULT_ROOMS[0])

    // standard should not be changed for partner
    expect(page.data.standard).toBe(0)
  })
})

describe('selectRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('updates room and currentRoomConfig', () => {
    const page = createPageInstance()
    page.data.roomOptions = DEFAULT_ROOMS
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.room = 'big'

    page.selectRoom('small')

    expect(page.data.room).toBe('small')
    expect(page.data.currentRoomConfig.id).toBe('small')
  })

  test('calls applyRoomConfig and _clearFieldsHiddenByRoomTransition', () => {
    const page = createPageInstance()
    page.data.roomOptions = DEFAULT_ROOMS
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.room = 'big'

    page.selectRoom('small')

    // Verify applyRoomConfig ran (timeOptions updated)
    expect(page.data.timeOptions).toEqual(['中午', '晚上'])
  })

  test('does nothing if roomId not found in roomOptions', () => {
    const page = createPageInstance()
    page.data.roomOptions = DEFAULT_ROOMS
    page.data.room = 'big'

    page.selectRoom('nonexistent')

    expect(page.data.room).toBe('big') // unchanged
  })
})

describe('_clearFieldsHiddenByRoomTransition', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('clears formData for fields visible in old room but hidden in new room', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.formData = {
      customerName: '张三',
      guestCount: '10',
      dishPrice: '500',
      remark: ''
    }

    // Switch from big (shows guestCount, dishPrice) to chess (hides them)
    page._clearFieldsHiddenByRoomTransition('big', 'chess')

    expect(page.data.formData.guestCount).toBe('')
    expect(page.data.formData.dishPrice).toBe('')
    expect(page.data.formData.customerName).toBe('张三') // still visible
  })

  test('does not clear fields visible in both rooms', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.formData = {
      customerName: '张三',
      phone: '13800138000',
      remark: '备注'
    }

    // Switch from big to small (all these fields visible in both)
    page._clearFieldsHiddenByRoomTransition('big', 'small')

    expect(page.data.formData.customerName).toBe('张三')
    expect(page.data.formData.phone).toBe('13800138000')
  })

  test('does not call setData when no fields to clear', () => {
    const page = createPageInstance()
    page.data.formConfigFields = DEFAULT_FORM_CONFIG.fields
    page.data.formData = { customerName: '张三' }
    const setDataCallsBefore = page.setData.mock.calls.length

    // big → small: no fields hidden
    page._clearFieldsHiddenByRoomTransition('big', 'small')

    expect(page.setData.mock.calls.length).toBe(setDataCallsBefore)
  })
})

describe('_buildDocData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('converts builtin fields correctly', () => {
    const page = createPageInstance()
    page.data.date = '2099-06-01'
    page.data.time = '中午'
    page.data.exclusiveType = 'none'
    page.data.room = 'big'
    page.data.standard = 500
    page.data.isPartner = false
    page.data.currentRoomConfig = DEFAULT_ROOMS[0]
    page.data.formData = {
      customerName: '张三',
      phone: '13800138000',
      guestCount: '10',
      dishPrice: '1000',
      remark: '测试备注'
    }
    page.data.formFields = DEFAULT_FORM_CONFIG.fields

    const docData = page._buildDocData()

    expect(docData.customerName).toBe('张三')
    expect(docData.phone).toBe('13800138000')
    expect(docData.guestCount).toBe(10)
    expect(docData.dishPrice).toBe(1000)
    expect(docData.remark).toBe('测试备注')
    expect(docData.standard).toBe(500)
    expect(docData.room).toBe('big')
    expect(docData.time).toBe('中午')
  })

  test('sets standard=0 for no-standard room with exclusiveType=none', () => {
    const page = createPageInstance()
    page.data.date = '2099-06-01'
    page.data.time = '中午'
    page.data.exclusiveType = 'none'
    page.data.room = 'chess'
    page.data.standard = 500 // even if somehow set
    page.data.isPartner = false
    page.data.currentRoomConfig = DEFAULT_ROOMS[2] // chess
    page.data.formData = { customerName: '张三' }
    page.data.formFields = [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true }
    ]

    const docData = page._buildDocData()

    expect(docData.standard).toBe(0)
  })

  test('handles custom fields in customFields object', () => {
    const page = createPageInstance()
    page.data.date = '2099-06-01'
    page.data.time = '中午'
    page.data.exclusiveType = 'none'
    page.data.room = 'big'
    page.data.standard = 500
    page.data.isPartner = false
    page.data.currentRoomConfig = DEFAULT_ROOMS[0]
    page.data.formData = {
      customerName: '张三',
      customText: '自定义值',
      customNum: '42'
    }
    page.data.formFields = [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true },
      { id: 'customText', label: '自定义文本', type: 'text', builtin: false, visible: true, required: false },
      { id: 'customNum', label: '自定义数字', type: 'number', builtin: false, visible: true, required: false }
    ]

    const docData = page._buildDocData()

    expect(docData.customerName).toBe('张三')
    expect(docData.customFields.customText).toBe('自定义值')
    expect(docData.customFields.customNum).toBe(42)
    expect(docData.customFields).not.toHaveProperty('customerName')
  })

  test('sets hasIncome to false', () => {
    const page = createPageInstance()
    page.data.date = '2099-06-01'
    page.data.time = '中午'
    page.data.exclusiveType = 'none'
    page.data.room = 'big'
    page.data.standard = 500
    page.data.isPartner = false
    page.data.currentRoomConfig = DEFAULT_ROOMS[0]
    page.data.formData = { customerName: '张三' }
    page.data.formFields = [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true }
    ]

    const docData = page._buildDocData()

    expect(docData.hasIncome).toBe(false)
  })

  test('trims string values for builtin fields', () => {
    const page = createPageInstance()
    page.data.date = '2099-06-01'
    page.data.time = '中午'
    page.data.exclusiveType = 'none'
    page.data.room = 'big'
    page.data.standard = 500
    page.data.isPartner = false
    page.data.currentRoomConfig = DEFAULT_ROOMS[0]
    page.data.formData = { customerName: '  张三  ' }
    page.data.formFields = [
      { id: 'customerName', label: '客户姓名', type: 'text', builtin: true, visible: true, required: true }
    ]

    const docData = page._buildDocData()

    expect(docData.customerName).toBe('张三')
  })
})
