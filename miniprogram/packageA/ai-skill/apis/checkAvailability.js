/**
 * checkAvailability - 检查指定房间在指定日期的可用时段
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

const ROOM_MAP = { '大包': 'big', '大包厢': 'big', '小包': 'small', '小包厢': 'small', '棋牌': 'chess', '棋牌室': 'chess' }

// 时段定义：中午/晚上
const TIME_SLOTS = [
  { label: '中午', value: '中午' },
  { label: '晚上', value: '晚上' }
]

async function checkAvailability({ room, date }) {
  try {
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看预约的权限' }] }
    }

    const targetDate = date || formatDate(new Date())
    const normalizedRoom = ROOM_MAP[room] || room || 'big'

    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command

    // Query that day's reservations for the room
    const parts = targetDate.split('-')
    const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
    const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

    const { data: reservations } = await queryAll(
      COLLECTIONS.RESERVATION,
      {
        date: _.gte(dayStart).and(_.lte(dayEnd)),
        room: normalizedRoom,
        status: _.neq('cancelled')
      },
      'time',
      'asc'
    )

    const roomNames = { big: '大包厢', small: '小包厢', chess: '棋牌室' }
    const roomName = roomNames[normalizedRoom] || room

    // Mark booked slots
    const bookedSlots = []
    const bookedSet = new Set()

    for (const r of reservations) {
      const timeSlot = r.time || '中午'
      if (!bookedSet.has(timeSlot)) {
        bookedSet.add(timeSlot)
        bookedSlots.push({
          time: timeSlot,
          customerName: r.customerName || '已预约',
          exclusiveType: r.exclusiveType || 'none'
        })
      }

      // Full exclusive blocks all
      if (r.exclusiveType === 'full') {
        TIME_SLOTS.forEach(s => {
          if (!bookedSet.has(s.value)) {
            bookedSet.add(s.value)
            bookedSlots.push({ time: s.value, customerName: '全天包场', exclusiveType: 'full' })
          }
        })
      }
    }

    const availableSlots = TIME_SLOTS
      .filter(s => !bookedSet.has(s.value))
      .map(s => ({ time: s.value }))

    const summary = availableSlots.length > 0
      ? `${roomName}在${targetDate}有${availableSlots.length}个可用时段：${availableSlots.map(s => s.time).join('、')}`
      : `${roomName}在${targetDate}已全部被预约`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        room: normalizedRoom,
        roomName,
        date: targetDate,
        availableSlots,
        bookedSlots
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询可用性失败: ${err.message}` }] }
  }
}

module.exports = checkAvailability
