const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { date, time, room, isExclusive, excludeId } = event

  if (!date || !time) {
    return { conflict: false, message: '参数不完整' }
  }

  try {
    let conflictQuery = {
      date: date,
      time: time,
      status: _.in(['reserved', 'confirmed'])
    }

    if (excludeId) {
      conflictQuery._id = _.neq(excludeId)
    }

    if (isExclusive) {
      const res = await db.collection('reservation')
        .where(conflictQuery)
        .get()

      if (res.data.length > 0) {
        return {
          conflict: true,
          message: '该时段已有预约，无法包场',
          conflictingReservations: res.data.map(r => ({
            room: r.roomName || r.room,
            customerName: r.customerName,
            time: r.time,
            status: r.status
          }))
        }
      }
    } else {
      const exclusiveQuery = { ...conflictQuery, isExclusive: true }
      const exclusiveRes = await db.collection('reservation')
        .where(exclusiveQuery)
        .get()

      if (exclusiveRes.data.length > 0) {
        return {
          conflict: true,
          message: '该时段已被包场，无法预约',
          conflictingReservations: exclusiveRes.data.map(r => ({
            room: '包场',
            customerName: r.customerName,
            time: r.time,
            status: r.status
          }))
        }
      }

      if (room) {
        const roomQuery = { ...conflictQuery, room: room }
        const roomRes = await db.collection('reservation')
          .where(roomQuery)
          .get()

        if (roomRes.data.length > 0) {
          return {
            conflict: true,
            message: '该房间此时段已有预约',
            conflictingReservations: roomRes.data.map(r => ({
              room: r.roomName || r.room,
              customerName: r.customerName,
              time: r.time,
              status: r.status
            }))
          }
        }
      }
    }

    return { conflict: false, message: '' }
  } catch (err) {
    console.error('预约冲突校验失败:', err)
    return { conflict: false, message: '校验失败，请重试' }
  }
}
