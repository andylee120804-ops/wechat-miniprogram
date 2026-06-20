const { formatDate, formatAmount, getChinaToday } = require('./helpers')

function getTomorrow(today) {
  const parts = today.split('-')
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1))
  return formatDate(date)
}

function isUnreadForUser(change, userId) {
  if (!change || !userId) return false
  return !(change.ackUsers || []).includes(userId)
}

function filterUnreadImportantChanges(changes, userId, today) {
  const todayStr = today || getChinaToday()
  const tomorrow = getTomorrow(todayStr)
  return (changes || [])
    .filter(function(change) {
      return change && change.important === true &&
        change.reservationDate >= todayStr && change.reservationDate <= tomorrow &&
        isUnreadForUser(change, userId)
    })
    .sort(function(a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    })
}

function getReservationChangeReminderTitle(changes, today) {
  const todayStr = today || getChinaToday()
  const tomorrowStr = getTomorrow(todayStr)
  const allChanges = changes || []

  const todayChanges = allChanges.filter(function(c) { return c && c.reservationDate === todayStr })
  const tomorrowChanges = allChanges.filter(function(c) { return c && c.reservationDate === tomorrowStr })

  // 根据变动类型生成精确标题
  const hasTodayCancel = todayChanges.some(function(c) { return c.changeType === 'cancelled' })
  const hasTodayOther = todayChanges.some(function(c) { return c.changeType !== 'cancelled' })
  const hasTomorrowCancel = tomorrowChanges.some(function(c) { return c.changeType === 'cancelled' })
  const hasTomorrowOther = tomorrowChanges.some(function(c) { return c.changeType !== 'cancelled' })

  if (hasTodayOther && hasTodayCancel) return '今天预约变动'
  if (hasTodayCancel && !hasTodayOther) return '今天预约取消'
  if (hasTodayOther && !hasTodayCancel) return '今天预约变动'

  if (hasTomorrowOther && hasTomorrowCancel) return '明天预约变动'
  if (hasTomorrowCancel && !hasTomorrowOther) return '明天预约取消'
  if (hasTomorrowOther && !hasTomorrowCancel) return '明天预约变动'

  return '预约变动'
}

function getCustomerName(reservation) {
  return reservation && reservation.customerName ? reservation.customerName : '未命名客户'
}

function getRoomName(reservation) {
  return reservation && (reservation.roomName || reservation.roomNameDisplay || reservation.room) ?
    (reservation.roomName || reservation.roomNameDisplay || reservation.room) : '未指定包厢'
}

function buildCancelledChange(reservation, operator) {
  const reservationDate = formatDate(reservation.date)
  const customerName = getCustomerName(reservation)
  const roomName = getRoomName(reservation)
  return {
    reservationId: reservation._id || reservation.id || '',
    changeType: 'cancelled',
    title: '预约已取消',
    summary: reservationDate + ' ' + (reservation.time || '') + ' ' + roomName + ' ' + customerName + ' 预约已取消',
    before: { status: reservation.status || 'confirmed' },
    after: { status: 'cancelled' },
    reservationDate: reservationDate,
    reservationTime: reservation.time || '',
    customerName: customerName,
    roomName: roomName,
    operatorId: operator._id || '',
    operatorName: operator.name || operator.nickName || '',
    important: true,
    ackUsers: []
  }
}

function buildAmountChangedChange(oldReservation, newReservation, operator) {
  const reservationDate = formatDate(newReservation.date)
  const customerName = getCustomerName(newReservation)
  const roomName = getRoomName(newReservation)
  const oldStandard = Number(oldReservation.standard) || 0
  const newStandard = Number(newReservation.standard) || 0
  const oldDishPrice = Number(oldReservation.dishPrice) || 0
  const newDishPrice = Number(newReservation.dishPrice) || 0
  const changes = []

  if (oldStandard !== newStandard) {
    changes.push('餐标 ¥' + formatAmount(oldStandard) + ' → ¥' + formatAmount(newStandard))
  }
  if (oldDishPrice !== newDishPrice) {
    changes.push('菜价 ¥' + formatAmount(oldDishPrice) + ' → ¥' + formatAmount(newDishPrice))
  }

  return {
    reservationId: newReservation._id || newReservation.id || oldReservation._id || oldReservation.id || '',
    changeType: 'amount_changed',
    title: '预约金额变化',
    summary: reservationDate + ' ' + (newReservation.time || '') + ' ' + roomName + ' ' + customerName + ' ' + changes.join('，'),
    before: { standard: oldStandard, dishPrice: oldDishPrice },
    after: { standard: newStandard, dishPrice: newDishPrice },
    reservationDate: reservationDate,
    reservationTime: newReservation.time || '',
    customerName: customerName,
    roomName: roomName,
    operatorId: operator._id || '',
    operatorName: operator.name || operator.nickName || '',
    important: true,
    ackUsers: []
  }
}

async function queryUnreadImportantChanges(userId) {
  if (!userId) return []
  const app = getApp()
  const res = await wx.cloud.callFunction({
    name: 'sendMessage',
    data: {
      action: 'getReservationChanges',
      callerWechatId: app.globalData.userInfo && app.globalData.userInfo.wechatId
    }
  })
  if (!res.result || !res.result.success) return []
  return res.result.data || []
}

async function markChangesRead(changes, userId) {
  if (!userId) return
  const app = getApp()
  const changeIds = (changes || []).filter(function(change) {
    return change && change._id
  }).map(function(change) {
    return change._id
  })
  if (!changeIds.length) return
  await wx.cloud.callFunction({
    name: 'sendMessage',
    data: {
      action: 'markReservationChangesRead',
      changeIds: changeIds,
      callerWechatId: app.globalData.userInfo && app.globalData.userInfo.wechatId
    }
  })
}

module.exports = {
  getTomorrow,
  isUnreadForUser,
  filterUnreadImportantChanges,
  getReservationChangeReminderTitle,
  buildCancelledChange,
  buildAmountChangedChange,
  queryUnreadImportantChanges,
  markChangesRead
}
