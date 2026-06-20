/**
 * updateReservationStatus - 更新预约状态（确认/完成/取消）
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, updateDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

const VALID_STATUSES = ['confirmed', 'completed', 'cancelled']
const STATUS_LABELS = { confirmed: '已确认', completed: '已完成', cancelled: '已取消' }

async function updateReservationStatus({ reservationId, customerName, date, time, room, status }) {
  try {
    if (!hasPermission('reservation', ACTIONS.EDIT)) {
      return { isError: true, content: [{ type: 'text', text: '您没有修改预约的权限' }] }
    }

    const normalizedStatus = String(status || '').trim().toLowerCase()
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return { isError: true, content: [{ type: 'text', text: `无效的状态 "${status}"，可选：confirmed(确认)/completed(完成)/cancelled(取消)` }] }
    }

    // Find reservation by ID or by criteria
    let target = null
    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command

    if (reservationId) {
      try {
        const res = await dbInst.collection(COLLECTIONS.RESERVATION).doc(reservationId).get()
        target = res.data
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: '未找到该预约记录' }] }
      }
    } else {
      const where = {}
      if (customerName) where.customerName = customerName
      if (room) where.room = room
      if (time) where.time = time
      if (date) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(date)) {
          return { isError: true, content: [{ type: 'text', text: '日期格式不正确，请使用YYYY-MM-DD格式' }] }
        }
        const parts = date.split('-')
        const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
        const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)
        where.date = _.gte(dayStart).and(_.lte(dayEnd))
      }

      const found = await queryAll(COLLECTIONS.RESERVATION, where, 'date', 'desc')
      if (found.data.length === 0) {
        return { isError: true, content: [{ type: 'text', text: '未找到匹配的预约记录，请提供客户姓名或日期' }] }
      }
      if (found.data.length > 1) {
        const list = found.data.slice(0, 5).map(r =>
          `ID:${r._id.slice(-6)} ${r.customerName} ${formatDate(r.date)} ${r.time || ''} ${r.roomName || ''} (${STATUS_LABELS[r.status] || r.status})`
        ).join('\n')
        return {
          isError: true,
          content: [{ type: 'text', text: `找到${found.data.length}条匹配预约，请指定预约ID：\n${list}` }]
        }
      }
      target = found.data[0]
    }

    if (!target) {
      return { isError: true, content: [{ type: 'text', text: '未找到该预约' }] }
    }

    if (target.status === normalizedStatus) {
      return { isError: true, content: [{ type: 'text', text: `该预约已经是"${STATUS_LABELS[normalizedStatus]}"状态` }] }
    }

    if (target.status === 'cancelled' && normalizedStatus !== 'cancelled') {
      return { isError: true, content: [{ type: 'text', text: '已取消的预约不能恢复，请重新创建' }] }
    }

    // Update status
    const updateData = { status: normalizedStatus }
    if (normalizedStatus === 'cancelled') {
      updateData.cancelledAt = dbInst.serverDate()
    } else if (normalizedStatus === 'completed') {
      updateData.completedAt = dbInst.serverDate()
    }

    await updateDoc(COLLECTIONS.RESERVATION, target._id, updateData)

    log(LOG_TYPES.RESERVATION_UPDATE, `更新预约状态(AI): ${target.customerName} → ${STATUS_LABELS[normalizedStatus]}`, { id: target._id })

    const summary = `预约状态已更新：${target.customerName} | ${formatDate(target.date)} ${target.time || ''} | ${target.roomName || ''} → ${STATUS_LABELS[normalizedStatus]}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: target._id,
        customerName: target.customerName,
        date: formatDate(target.date),
        time: target.time || '',
        roomName: target.roomName || '',
        status: normalizedStatus,
        statusLabel: STATUS_LABELS[normalizedStatus]
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `更新预约状态失败: ${err.message}` }] }
  }
}

module.exports = updateReservationStatus
