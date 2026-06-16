/**
 * E2E tests for reservation dynamic config feature.
 *
 * Verifies that reservation-add page reads from reservationConfig (rooms +
 * form fields) and renders dynamically. Also verifies the calendar uses the
 * new dynamic grouping array.
 *
 * Prerequisites:
 *   - WeChat DevTools must be running with auto-port enabled
 *   - The settings collection should already contain reservation_rooms and
 *     reservation_form_config (or fall back to defaults)
 */
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const ReservationAddPage = require('./pages/ReservationAddPage')
const ReservationPage = require('./pages/ReservationPage')

describe('Reservation Dynamic Config — Admin role', () => {
  let miniProgram
  let addPage
  let calendarPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    await loginAs(miniProgram, TEST_ACCOUNTS.admin.wechatId)
    addPage = new ReservationAddPage(miniProgram)
    calendarPage = new ReservationPage(miniProgram)
  }, 60000)

  afterAll(async () => {
    await closeApp()
  })

  describe('reservation-add: dynamic config loading', () => {
    test('roomOptions populated from config (or defaults)', async () => {
      await addPage.open()
      // Wait for loadReservationConfig to complete
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      expect(Array.isArray(roomOptions)).toBe(true)
      expect(roomOptions.length).toBeGreaterThan(0)

      // Each room has the dynamic-config shape
      roomOptions.forEach((room) => {
        expect(typeof room.id).toBe('string')
        expect(typeof room.name).toBe('string')
        expect(room.enabled).toBe(true)
        expect(Array.isArray(room.exclusiveTypes)).toBe(true)
        expect(Array.isArray(room.timeSlots)).toBe(true)
        expect(Array.isArray(room.standards)).toBe(true)
      })
    })

    test('rooms sorted by order property', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      if (roomOptions.length < 2) return // can't verify with single room

      for (let i = 1; i < roomOptions.length; i++) {
        expect(roomOptions[i].order).toBeGreaterThanOrEqual(roomOptions[i - 1].order)
      }
    })

    test('initial room selection matches first enabled room', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const room = await addPage.getRoom()
      const roomOptions = await addPage.getRoomOptions()
      expect(room).toBe(roomOptions[0].id)
    })

    test('formFields resolved via hiddenInRooms filter', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const formFields = await addPage.getFormFields()
      expect(Array.isArray(formFields)).toBe(true)

      const formConfigFields = await addPage.getFormConfigFields()
      expect(formConfigFields.length).toBeGreaterThanOrEqual(formFields.length)

      // Every visible field should be present in formFields
      const room = await addPage.getRoom()
      formConfigFields.forEach((f) => {
        const isHidden = f.hiddenInRooms && f.hiddenInRooms.includes(room)
        const inResolved = formFields.find((rf) => rf.id === f.id) !== undefined
        if (f.visible && !isHidden) {
          expect(inResolved).toBe(true)
        } else {
          expect(inResolved).toBe(false)
        }
      })
    })

    test('chess room hides guestCount and dishPrice (default config)', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      const chess = roomOptions.find((r) => r.id === 'chess')
      if (!chess) return // chess room may have been deleted

      await addPage.selectRoom('chess')
      await new Promise(r => setTimeout(r, 500))

      const formFields = await addPage.getFormFields()
      const fieldIds = formFields.map((f) => f.id)
      expect(fieldIds.includes('guestCount')).toBe(false)
      expect(fieldIds.includes('dishPrice')).toBe(false)
      // customerName should still be visible
      expect(fieldIds.includes('customerName')).toBe(true)
    })
  })

  describe('reservation-add: room switching', () => {
    test('selectRoom updates timeOptions and exclusiveOptions', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      if (roomOptions.length < 2) return

      const firstRoom = roomOptions[0]
      const secondRoom = roomOptions[1]

      await addPage.selectRoom(firstRoom.id)
      await new Promise(r => setTimeout(r, 300))
      const time1 = await addPage.getTimeOptions()
      const ex1 = await addPage.getExclusiveOptions()

      await addPage.selectRoom(secondRoom.id)
      await new Promise(r => setTimeout(r, 300))
      const time2 = await addPage.getTimeOptions()
      const ex2 = await addPage.getExclusiveOptions()

      // Time options should match the selected room's config
      expect(JSON.stringify(time1)).toBe(JSON.stringify(firstRoom.timeSlots))
      expect(JSON.stringify(time2)).toBe(JSON.stringify(secondRoom.timeSlots))
      expect(JSON.stringify(ex1)).toBe(JSON.stringify(firstRoom.exclusiveTypes))
      expect(JSON.stringify(ex2)).toBe(JSON.stringify(secondRoom.exclusiveTypes))
    })

    test('defaultStandard auto-selected on room change when valid', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      // Find a room with a defaultStandard that's in standards
      const room = roomOptions.find((r) =>
        r.defaultStandard > 0 && r.standards.includes(r.defaultStandard)
      )
      if (!room) return // no qualifying room

      await addPage.selectRoom(room.id)
      await new Promise(r => setTimeout(r, 500))

      const standard = await addPage.getStandard()
      const picked = await addPage.getStandardPicked()
      const isPartner = await addPage.getIsPartner()
      if (!isPartner) {
        expect(standard).toBe(room.defaultStandard)
        expect(picked).toBe(true)
      }
    })

    test('switching to room without standards clears standard selection', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const roomOptions = await addPage.getRoomOptions()
      const noStdRoom = roomOptions.find((r) => r.standards.length === 0)
      if (!noStdRoom) return

      await addPage.selectRoom(noStdRoom.id)
      await new Promise(r => setTimeout(r, 500))

      const allowNoStandard = await addPage.getAllowNoStandard()
      const picked = await addPage.getStandardPicked()
      expect(allowNoStandard).toBe(true)
      expect(picked).toBe(false)
    })
  })

  describe('reservation-add: customFields support', () => {
    test('formData has entries for both builtin and custom fields', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const formConfigFields = await addPage.getFormConfigFields()
      const formData = await addPage.getFormData()

      formConfigFields.forEach((f) => {
        // Every field id should have an entry (initialized to '')
        expect(formData).toHaveProperty(f.id)
      })
    })

    test('setting custom field via setData updates formData', async () => {
      await addPage.open()
      await new Promise(r => setTimeout(r, 2000))

      const formConfigFields = await addPage.getFormConfigFields()
      const customField = formConfigFields.find((f) => !f.builtin)
      if (!customField) return // no custom fields configured

      await addPage.setFormField(customField.id, 'test value')
      await new Promise(r => setTimeout(r, 200))

      const formData = await addPage.getFormData()
      expect(formData[customField.id]).toBe('test value')
    })
  })

  describe('calendar page: dynamic grouping', () => {
    test('groupedReservationsDynamic is an array of group objects', async () => {
      await calendarPage.open()
      await calendarPage.waitForData('loading', false, 15000)

      const grouped = await calendarPage.getGroupedReservations()
      expect(Array.isArray(grouped)).toBe(true)

      grouped.forEach((g) => {
        expect(typeof g.key).toBe('string')
        expect(typeof g.label).toBe('string')
        expect(Array.isArray(g.items)).toBe(true)
        expect(typeof g.color).toBe('string')
        expect(typeof g.textColor).toBe('string')
      })
    })

    test('exclusive groups (noon/night/full) appear before room groups', async () => {
      await calendarPage.open()
      await calendarPage.waitForData('loading', false, 15000)

      const grouped = await calendarPage.getGroupedReservations()
      const exclusiveKeys = ['noon', 'night', 'full']
      let lastExclusiveIdx = -1
      let firstRoomIdx = -1

      grouped.forEach((g, idx) => {
        if (exclusiveKeys.includes(g.key)) lastExclusiveIdx = idx
        else if (firstRoomIdx === -1) firstRoomIdx = idx
      })

      if (lastExclusiveIdx >= 0 && firstRoomIdx >= 0) {
        expect(lastExclusiveIdx).toBeLessThan(firstRoomIdx)
      }
    })
  })
})
