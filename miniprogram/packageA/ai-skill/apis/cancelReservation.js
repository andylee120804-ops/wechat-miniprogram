/**
 * cancelReservation - 取消预约
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, updateDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function cancelReservation({ reservationId, customerName, date, room, time }) {
  try {
    if (!hasPermission('reservation', ACTIONS.EDIT)) {
      return { isError: true, content: [{ type: 'text', text: '您没有取消预约的权限' }] }
    }

    // Find reservation by ID or by criteria
    let target = null

    if (reservationId) {
      const dbInst = require('../../../utils/db').getDb()
      const res = await dbInst.collection(COLLECTIONS.RESERVATION).doc(reservationId).get()
      target = res.data
    } else {
      // Search by criteria
      const dbInst = require('../../../utils/db').getDb()
      const _ = dbInst.command
      const where = { status: 'confirmed' }
      if (customerName) where.customerName = customerName
      if (room) where.room = room
      if (time) where.time = time
      if (date) {
        const parts = date.split('-')
        const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
        const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)
        where.date = _.gte(dayStart).and(_.lte(dayEnd))
      }

      const found = await queryAll(COLLECTIONS.RESERVATION, where, 'date', 'desc')
      if (found.data.length === 0) {
        return { isError: true, content: [{ type: 'text', text: '未找到匹配的预约记录' }] }
      }
      if (found.data.length > 1) {
        const list = found.data.slice(0, 5).map(r =>
          `${r.customerName} ${formatDate(r.date)} ${r.time || ''} ${r.roomName || ''}`
        ).join('\n')
        return {
          isError: true,
          content: [{ type: 'text', text: `找到${found.data.length}条匹配预约，请提供更精确的信息：\n${list}` }]
        }
      }
      target = found.data[0]
    }

    if (!target) {
      return { isError: true, content: [{ type: 'text', text: '未找到该预约' }] }
    }
    if (target.status === 'cancelled') {
      return { isError: true, content: [{ type: 'text', text: '该预约已取消' }] }
    }

    // Cancel it
    await updateDoc(COLLECTIONS.RESERVATION, target._id, {
      status: 'cancelled',
      cancelledAt: require('../../../utils/db').getDb().serverDate()
    })

    const summary = `已取消预约：${target.customerName} | ${formatDate(target.date)} ${target.time || ''} | ${target.roomName || ''}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: target._id,
        customerName: target.customerName,
        date: formatDate(target.date),
        time: target.time || '',
        roomName: target.roomName || '',
        status: 'cancelled'
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `取消预约失败: ${err.message}` }] }
  }
}

module.exports = cancelReservation
