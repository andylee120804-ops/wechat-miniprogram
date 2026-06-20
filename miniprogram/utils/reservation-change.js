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
        change.operatorId !== userId &&
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

  // 判断今天各类型变动
  const hasTodayCreated = todayChanges.some(function(c) { return c.changeType === 'created' })
  const hasTodayCancel = todayChanges.some(function(c) { return c.changeType === 'cancelled' })
  const hasTodayOther = todayChanges.some(function(c) { return c.changeType !== 'cancelled' && c.changeType !== 'created' })

  // 判断明天各类型变动
  const hasTomorrowCreated = tomorrowChanges.some(function(c) { return c.changeType === 'created' })
  const hasTomorrowCancel = tomorrowChanges.some(function(c) { return c.changeType === 'cancelled' })
  const hasTomorrowOther = tomorrowChanges.some(function(c) { return c.changeType !== 'cancelled' && c.changeType !== 'created' })

  const hasTodayAny = todayChanges.length > 0
  const hasTomorrowAny = tomorrowChanges.length > 0

  // 今天和明天都有变动时，判断能否合并显示
  if (hasTodayAny && hasTomorrowAny) {
    // 同类型变动合并
    if (hasTodayCreated && hasTomorrowCreated && !hasTodayCancel && !hasTomorrowCancel && !hasTodayOther && !hasTomorrowOther) return '今天/明天新增预约'
    if (hasTodayCancel && hasTomorrowCancel && !hasTodayCreated && !hasTomorrowCreated && !hasTodayOther && !hasTomorrowOther) return '今天/明天预约取消'
    if (hasTodayOther && hasTomorrowOther && !hasTodayCreated && !hasTomorrowCreated && !hasTodayCancel && !hasTomorrowCancel) return '今天/明天预约变动'
    // 类型不完全一致，用通用标题
    return '今天/明天预约变动'
  }

  // 只有今天
  if (hasTodayAny) {
    if (hasTodayCreated && !hasTodayCancel && !hasTodayOther) return '今天新增预约'
    if (hasTodayCancel && !hasTodayCreated && !hasTodayOther) return '今天预约取消'
    if (hasTodayOther && !hasTodayCreated && !hasTodayCancel) return '今天预约变动'
    return '今天预约变动'
  }

  // 只有明天
  if (hasTomorrowAny) {
    if (hasTomorrowCreated && !hasTomorrowCancel && !hasTomorrowOther) return '明天新增预约'
    if (hasTomorrowCancel && !hasTomorrowCreated && !hasTomorrowOther) return '明天预约取消'
    if (hasTomorrowOther && !hasTomorrowCreated && !hasTomorrowCancel) return '明天预约变动'
    return '明天预约变动'
  }

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

function buildCreatedChange(reservation, operator) {
  const reservationDate = formatDate(reservation.date)
  const customerName = getCustomerName(reservation)
  const roomName = getRoomName(reservation)
  return {
    reservationId: reservation._id || reservation.id || '',
    changeType: 'created',
    title: '新增预约',
    summary: reservationDate + ' ' + (reservation.time || '') + ' ' + roomName + ' ' + customerName + ' 新增预约',
    before: {},
    after: { status: 'confirmed' },
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
  buildCreatedChange,
  buildAmountChangedChange,
  queryUnreadImportantChanges,
  markChangesRead
}
