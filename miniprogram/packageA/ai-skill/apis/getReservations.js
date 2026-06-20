/**
 * getReservations - 查询指定日期的预约列表
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

const ROOM_MAP = { '大包': 'big', '大包厢': 'big', '小包': 'small', '小包厢': 'small', '棋牌': 'chess', '棋牌室': 'chess' }
const ROOM_NAMES = { big: '大包厢', small: '小包厢', chess: '棋牌室' }

async function getReservations({ date, room }) {
  try {
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看预约的权限' }] }
    }

    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command
    const targetDate = date || formatDate(new Date())

    // Date range filter
    const parts = targetDate.split('-')
    const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
    const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

    const where = { date: _.gte(dayStart).and(_.lte(dayEnd)), status: _.neq('cancelled') }
    if (room) {
      const normalizedRoom = ROOM_MAP[room] || room
      where.room = normalizedRoom
    }

    const { data: reservations } = await queryAll(
      COLLECTIONS.RESERVATION,
      where,
      'time',
      'asc'
    )

    const roomLabel = room ? (ROOM_MAP[room] ? ROOM_NAMES[ROOM_MAP[room]] : room) : ''
    const summary = room
      ? `${targetDate} ${roomLabel}共${reservations.length}个预约`
      : `${targetDate} 共${reservations.length}个预约`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        date: targetDate,
        total: reservations.length,
        reservations: reservations.map(r => ({
          id: r._id,
          customerName: r.customerName || '',
          room: r.room || '',
          roomName: r.roomName || '',
          time: r.time || '',
          status: r.status || 'pending',
          guestCount: r.guestCount || 0,
          exclusiveType: r.exclusiveType || 'none',
          phone: r.phone || '',
          standard: r.standard || 0
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询预约失败: ${err.message}` }] }
  }
}

module.exports = getReservations
