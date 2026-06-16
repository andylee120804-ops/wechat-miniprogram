/**
 * conflict-check.js - Reservation conflict detection.
 *
 * Checks the reservation collection for time/room conflicts based on
 * exclusiveType semantics:
 * - 'none': same room + same time slot (or any full-day exclusive on same room)
 * - 'noon': same room + any noon-time reservation (or full on same room)
 * - 'night': same room + any night-time reservation (or full on same room)
 * - 'full': any reservation on this date for this room
 */
const db = require('../../../utils/db')
const { COLLECTIONS } = require('../../../utils/db')
const { getRoomName } = require('../../../utils/helpers')

/**
 * Throws an Error with a Chinese message if a conflict is found.
 * @param {Object} params
 * @param {string} params.dateStr - YYYY-MM-DD
 * @param {string} params.time - 时段 (中午/晚上 etc.)
 * @param {string} params.room - room id
 * @param {string} params.exclusiveType - none/noon/night/full
 * @param {boolean} params.isEdit - true if editing existing reservation
 * @param {string} [params.id] - reservation id when editing (excluded from conflicts)
 */
async function checkReservationConflict({ dateStr, time, room, exclusiveType, isEdit, id }) {
  try {
    const dbInstance = db.getDb()
    const _ = dbInstance.command

    const parts = dateStr.split('-')
    const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
    const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

    const conditions = [
      { date: _.gte(dayStart).and(_.lte(dayEnd)) },
      { status: 'confirmed' }
    ]

    if (isEdit && id) {
      conditions.push({ _id: _.neq(id) })
    }

    if (exclusiveType === 'none') {
      conditions.push(_.or([
        { time: time, room: room },
        { exclusiveType: 'full', room: room }
      ]))
    } else if (exclusiveType === 'noon') {
      conditions.push(_.or([
        { time: '中午', room: room },
        { exclusiveType: 'full', room: room }
      ]))
    } else if (exclusiveType === 'night') {
      conditions.push(_.or([
        { time: '晚上', room: room },
        { exclusiveType: 'full', room: room }
      ]))
    }
    // 'full': check all reservations on this date for this room (no extra filter)

    const where = _.and(conditions)
    const res = await db.queryAll(COLLECTIONS.RESERVATION, where)
    if (res.data && res.data.length > 0) {
      if (exclusiveType === 'full') {
        throw new Error('该时段已被包场（全天），请更换时间')
      } else if (exclusiveType === 'noon') {
        throw new Error('该时段已被包场（中午），请更换时间')
      } else if (exclusiveType === 'night') {
        throw new Error('该时段已被包场（晚上），请更换时间')
      }
      throw new Error('该时段【' + getRoomName(room) + '】已有预约，请更换时间或包厢')
    }
  } catch (err) {
    if (err.message && (err.message.indexOf('已被包场') !== -1 || err.message.indexOf('已有预约') !== -1)) {
      throw err
    }
    // Other errors (network, etc.) are silently swallowed — let main flow handle them
  }
}

module.exports = { checkReservationConflict }
