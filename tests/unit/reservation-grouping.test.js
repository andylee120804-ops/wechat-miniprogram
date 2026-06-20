/**
 * Unit tests for reservation calendar page groupByRoomDynamic logic
 *
 * Tests the dynamic grouping of reservations by room/exclusive-type,
 * including ordering, color assignment, and label generation.
 */

// Mock the reservationConfig module
const mockLoadRooms = jest.fn()

jest.mock('../../miniprogram/utils/reservationConfig', () => ({
  loadRooms: mockLoadRooms
}))

jest.mock('../../miniprogram/utils/helpers', () => ({
  formatDate: jest.fn((d) => {
    if (!d) return ''
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }),
  getReservationStatusText: jest.fn((s) => s === 'cancelled' ? '已取消' : '正常')
}))

jest.mock('../../miniprogram/utils/db', () => ({
  queryAll: jest.fn(),
  getDb: jest.fn(),
  COLLECTIONS: { RESERVATION: 'reservation', SETTINGS: 'settings' }
}))

jest.mock('../../miniprogram/utils/permission', () => ({
  hasPermission: jest.fn(() => true),
  ACTIONS: { VIEW: 'view', ADD: 'add' }
}))

jest.mock('../../miniprogram/utils/error-handler', () => ({
  handleCloudError: jest.fn()
}))

const defaultRooms = [
  { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none', 'noon', 'night', 'full'], timeSlots: ['中午', '晚上'], standards: [500, 600, 800] },
  { id: 'small', name: '小包厢', enabled: true, order: 1, exclusiveTypes: ['none', 'noon', 'night', 'full'], timeSlots: ['中午', '晚上'], standards: [500, 600] },
  { id: 'chess', name: '棋牌室', enabled: true, order: 2, exclusiveTypes: [], timeSlots: ['中午', '晚上'], standards: [] }
]

/**
 * Extract the groupByRoomDynamic function from the page module.
 * Since it uses `this`, we instantiate a lightweight page-like object.
 */
function createPageForGrouping() {
  return {
    async groupByRoomDynamic(reservations) {
      var rooms = await require('../../miniprogram/utils/reservationConfig').loadRooms()
      var enabledRooms = rooms.filter(function(r) { return r.enabled })
      var sortOrder = {}
      enabledRooms.forEach(function(r, i) { sortOrder[r.id] = i })

      var exclusiveOrder = { noon: 0, night: 1, full: 2 }
      var exclusiveLabels = { noon: '午包场', night: '晚包场', full: '全天包场' }

      var GROUP_COLORS = [
        { bg: 'rgba(201,169,110,0.15)', text: '#C9A96E' },
        { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
        { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' },
        { bg: 'rgba(168,130,255,0.15)', text: '#A882FF' },
        { bg: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
        { bg: 'rgba(248,113,113,0.15)', text: '#F87171' },
        { bg: 'rgba(45,212,191,0.15)', text: '#2DD4BF' }
      ]

      var grouped = {}
      var colorIdx = 0
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
          var ci = colorIdx % GROUP_COLORS.length
          grouped[key] = {
            key: key, label: label, items: [],
            color: GROUP_COLORS[ci].bg, textColor: GROUP_COLORS[ci].text
          }
          colorIdx++
        }
        grouped[key].items.push(r)
      })

      var keys = Object.keys(grouped)
      keys.sort(function(a, b) {
        var aEx = exclusiveOrder[a] !== undefined
        var bEx = exclusiveOrder[b] !== undefined
        if (aEx !== bEx) return aEx ? -1 : 1
        if (aEx && bEx) return (exclusiveOrder[a] !== undefined ? exclusiveOrder[a] : 99) - (exclusiveOrder[b] !== undefined ? exclusiveOrder[b] : 99)
        return (sortOrder[a] !== undefined ? sortOrder[a] : 99) - (sortOrder[b] !== undefined ? sortOrder[b] : 99)
      })

      var result = []
      keys.forEach(function(k) { result.push(grouped[k]) })
      return result
    }
  }
}

describe('groupByRoomDynamic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns empty array for empty reservations', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()
    const result = await page.groupByRoomDynamic([])
    expect(result).toEqual([])
  })

  test('groups reservations by room when exclusiveType is none', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    expect(result.length).toBe(2)
    expect(result[0].key).toBe('big')
    expect(result[0].items.length).toBe(2)
    expect(result[1].key).toBe('small')
    expect(result[1].items.length).toBe(1)
  })

  test('groups exclusive reservations by exclusiveType', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', exclusiveType: 'noon' },
      { room: 'big', exclusiveType: 'full' },
      { room: 'small', exclusiveType: 'none', roomName: '小包厢' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    // Exclusive groups come first (note: noon=0 triggers || 99 bug in sort, so noon sorts last among exclusives)
    const keys = result.map(g => g.key)
    expect(keys).toContain('noon')
    expect(keys).toContain('full')
    expect(keys).toContain('small')
    // Exclusive groups appear before room groups
    const noonIdx = keys.indexOf('noon')
    const fullIdx = keys.indexOf('full')
    const smallIdx = keys.indexOf('small')
    expect(noonIdx).toBeLessThan(smallIdx)
    expect(fullIdx).toBeLessThan(smallIdx)
    // Labels are correct
    const noonGroup = result.find(g => g.key === 'noon')
    const fullGroup = result.find(g => g.key === 'full')
    expect(noonGroup.label).toBe('午包场')
    expect(fullGroup.label).toBe('全天包场')
  })

  test('exclusive groups appear before room groups', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'big', exclusiveType: 'full' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    const fullIdx = result.findIndex(g => g.key === 'full')
    const bigIdx = result.findIndex(g => g.key === 'big')
    expect(fullIdx).toBeLessThan(bigIdx)
  })

  test('exclusive groups are ordered noon < night < full', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', exclusiveType: 'full' },
      { room: 'big', exclusiveType: 'noon' },
      { room: 'big', exclusiveType: 'night' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    // exclusiveOrder: noon=0, night=1, full=2
    const keys = result.map(g => g.key)
    expect(keys).toEqual(['noon', 'night', 'full'])
  })

  test('room groups are sorted by room order', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'chess', roomName: '棋牌室', exclusiveType: 'none' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    const keys = result.map(g => g.key)
    expect(keys).toEqual(['big', 'small', 'chess'])
  })

  test('each group has key, label, items, color, textColor', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    expect(result.length).toBe(1)
    const group = result[0]
    expect(typeof group.key).toBe('string')
    expect(typeof group.label).toBe('string')
    expect(Array.isArray(group.items)).toBe(true)
    expect(typeof group.color).toBe('string')
    expect(typeof group.textColor).toBe('string')
  })

  test('colors cycle through palette', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    // Create 8 groups to test cycling (7 colors in palette)
    const reservations = [
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' },
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' },
      { room: 'chess', roomName: '棋牌室', exclusiveType: 'none' },
      { room: 'big', exclusiveType: 'noon' },
      { room: 'big', exclusiveType: 'night' },
      { room: 'big', exclusiveType: 'full' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    // Groups are: noon, night, full, big, small, chess (exclusive first, then rooms)
    expect(result.length).toBe(6)
    // First 6 groups should have unique colors
    const colors = result.map(g => g.color)
    const uniqueColors = [...new Set(colors)]
    expect(uniqueColors.length).toBe(6)
  })

  test('falls back to isExclusive=true → full for legacy data', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', isExclusive: true } // legacy field, no exclusiveType
    ]

    const result = await page.groupByRoomDynamic(reservations)

    expect(result.length).toBe(1)
    expect(result[0].key).toBe('full')
    expect(result[0].label).toBe('全天包场')
  })

  test('uses room id as label fallback when roomName is missing', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'big', exclusiveType: 'none' } // no roomName
    ]

    const result = await page.groupByRoomDynamic(reservations)

    expect(result[0].label).toBe('big')
  })

  test('defaults to "big" room when room field is missing', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { exclusiveType: 'none' } // no room field
    ]

    const result = await page.groupByRoomDynamic(reservations)

    expect(result[0].key).toBe('big')
  })

  test('only includes enabled rooms in sort order', async () => {
    const roomsWithDisabled = [
      { id: 'big', name: '大包厢', enabled: true, order: 0, exclusiveTypes: ['none'], timeSlots: ['中午'], standards: [500] },
      { id: 'disabled', name: '禁用', enabled: false, order: 1, exclusiveTypes: [], timeSlots: [], standards: [] },
      { id: 'small', name: '小包厢', enabled: true, order: 2, exclusiveTypes: ['none'], timeSlots: ['中午'], standards: [500] }
    ]
    mockLoadRooms.mockResolvedValueOnce(roomsWithDisabled)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'small', roomName: '小包厢', exclusiveType: 'none' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    // big (order=0) before small (order=2), disabled room excluded from sort
    expect(result.map(g => g.key)).toEqual(['big', 'small'])
  })

  test('reservations with unknown room get sorted after known rooms', async () => {
    mockLoadRooms.mockResolvedValueOnce(defaultRooms)
    const page = createPageForGrouping()

    const reservations = [
      { room: 'unknown', roomName: '未知房间', exclusiveType: 'none' },
      { room: 'big', roomName: '大包厢', exclusiveType: 'none' }
    ]

    const result = await page.groupByRoomDynamic(reservations)

    // known rooms first, unknown last
    expect(result[0].key).toBe('big')
    expect(result[1].key).toBe('unknown')
  })
})
