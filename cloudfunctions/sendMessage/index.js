const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// Modules that only admin can access; boss is excluded
const ADMIN_ONLY_MODULES = ['staff', 'venueSettings', 'minAmount']
const MAX_CHANGE_ACK_IDS = 20
const CHANGE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/

async function findStaffByCaller(OPENID, callerWechatId) {
  if (!callerWechatId) return null
  var matchedRes = await db.collection('staff')
    .where({ wechatId: callerWechatId, boundOpenid: OPENID, status: 'active' })
    .limit(1)
    .get()
  if (matchedRes.data && matchedRes.data.length > 0) return matchedRes.data[0]
  return null
}

async function findStaffByOpenid(OPENID) {
  var staffRes = await db.collection('staff')
    .where({ boundOpenid: OPENID, status: 'active' })
    .limit(1)
    .get()
  if (staffRes.data && staffRes.data.length > 0) return staffRes.data[0]
  return null
}

/**
 * Check if a staff member has permission for a module/action.
 * Mirrors client-side permission.js logic:
 * - admin: all permissions
 * - boss: all except admin-only modules (staff, venueSettings, minAmount)
 * - other roles: check their permissions collection
 */
async function hasPermission(staff, module, action) {
  if (!staff) return false
  if (staff.role === 'admin') return true
  if (staff.role === 'boss') return !ADMIN_ONLY_MODULES.includes(module)

  // Other roles: look up their permission assignment
  var permRes = await db.collection('permissions').where({ staffId: staff._id }).get()
  if (!permRes.data || permRes.data.length === 0) return false
  var perms = permRes.data[0].permissions || []
  var perm = perms.find(p => p.module === module)
  if (!perm) return false
  var actions = perm.actions || []
  return actions.includes(action) || actions.includes('*')
}

exports.main = async (event, context) => {
  const { action } = event

  try {
    switch (action) {
      case 'createAnnouncement':
        return await createAnnouncement(event)
      case 'getAnnouncements':
        return await getAnnouncements(event)
      case 'markRead':
        return await markRead(event)
      case 'deleteAnnouncement':
        return await deleteAnnouncement(event)
      case 'updateAnnouncement':
        return await updateAnnouncement(event)
      case 'getSettings':
        return await getSettings(event)
      case 'updateSettings':
        return await updateSettings(event)
      case 'resolveCreator':
        return await resolveCreator(event)
      case 'getApprovalSettings':
        return await getApprovalSettings(event)
      case 'updateApprovalSettings':
        return await updateApprovalSettings(event)
      case 'getCustomerNameSuggestions':
        return await getCustomerNameSuggestions(event)
      case 'refreshCustomerNameTop':
        return await refreshCustomerNameTop(event)
      case 'getReservationChanges':
        return await getReservationChanges(event)
      case 'markReservationChangesRead':
        return await markReservationChangesRead(event)
      case 'cancelReservationWithChange':
        return await cancelReservationWithChange(event)
      case 'deleteReservationWithChange':
        return await deleteReservationWithChange(event)
      case 'updateReservationAmountWithChange':
        return await updateReservationAmountWithChange(event)
      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('sendMessage错误:', err)
    return { success: false, message: '操作失败: ' + err.message }
  }
}

async function createAnnouncement(event) {
  const { title, content, priority, needsConfirm, startDate, endDate, callerWechatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
  }

  const caller = await findStaffByOpenid(OPENID)
  if (!caller || !(await hasPermission(caller, 'announcement', 'add'))) {
    return { success: false, message: '无权限创建公告' }
  }
  const createdBy = caller._id
  const createdByName = caller.name

  const result = await db.collection('announcement').add({
    data: {
      title,
      content,
      priority: priority || 'normal',
      needsConfirm: !!needsConfirm,
      startDate: startDate || '',
      endDate: endDate || '',
      createdBy: createdBy || '',
      createdByName: createdByName || '',
      active: true,
      readBy: needsConfirm ? [createdBy] : [],
      createdAt: new Date()
    }
  })

  return { success: true, data: { _id: result._id } }
}

async function getAnnouncements(event) {
  const { limit = 20, skip = 0 } = event
  const { OPENID } = cloud.getWXContext()
  const caller = await findStaffByOpenid(OPENID)
  if (!caller || !(await hasPermission(caller, 'announcement', 'view'))) {
    return { success: false, message: '无权限查看公告' }
  }

  const result = await db.collection('announcement')
    .where({ active: true })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get()

  const total = (await db.collection('announcement')
    .where({ active: true })
    .count()).total

  return { success: true, data: result.data, total }
}

async function markRead(event) {
  const { announcementId } = event
  const { OPENID } = cloud.getWXContext()

  if (!announcementId) {
    return { success: false, message: '参数不完整' }
  }

  const caller = await findStaffByOpenid(OPENID)
  if (!caller) {
    return { success: false, message: '无权限操作' }
  }

  const annRes = await db.collection('announcement').doc(announcementId).get()
  if (!annRes.data) {
    return { success: false, message: '公告不存在' }
  }
  if ((annRes.data.readBy || []).includes(caller._id)) {
    return { success: true }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: {
      readBy: _.addToSet(caller._id)
    }
  })

  return { success: true }
}

async function deleteAnnouncement(event) {
  const { announcementId, callerWechatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!announcementId) {
    return { success: false, message: '缺少公告ID' }
  }

  const caller = await findStaffByOpenid(OPENID)
  if (!caller) {
    return { success: false, message: '无权限删除公告' }
  }
  const annRes = await db.collection('announcement').doc(announcementId).get()
  if (!annRes.data) {
    return { success: false, message: '公告不存在' }
  }
  var isCreator = annRes.data.createdBy === caller._id
  if (!isCreator && !(await hasPermission(caller, 'announcement', 'delete'))) {
    return { success: false, message: '只有公告发布者或有权限者才能删除' }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: { active: false }
  })

  return { success: true }
}

async function updateAnnouncement(event) {
  const { announcementId, title, content, priority, needsConfirm, startDate, endDate, callerWechatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!announcementId) {
    return { success: false, message: '缺少公告ID' }
  }

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
  }

  const caller = await findStaffByOpenid(OPENID)
  if (!caller) {
    return { success: false, message: '无权限修改公告' }
  }
  const annRes = await db.collection('announcement').doc(announcementId).get()
  if (!annRes.data) {
    return { success: false, message: '公告不存在' }
  }
  var isCreator = annRes.data.createdBy === caller._id
  if (!isCreator && !(await hasPermission(caller, 'announcement', 'edit'))) {
    return { success: false, message: '只有公告发布者或有权限者才能修改' }
  }

  const updateData = {
    title: title.trim(),
    content: content.trim(),
    priority: priority || 'normal',
    needsConfirm: !!needsConfirm,
    startDate: startDate || '',
    endDate: endDate || '',
    updatedAt: db.serverDate()
  }

  await db.collection('announcement').doc(announcementId).update({
    data: updateData
  })

  return { success: true }
}

async function resolveCreator(event) {
  const { createdBy, announcementId } = event
  const { OPENID } = cloud.getWXContext()
  const caller = await findStaffByOpenid(OPENID)
  if (!caller || !(await hasPermission(caller, 'announcement', 'view'))) {
    return { success: false, message: '无权限查看公告' }
  }

  // First try to find by createdBy as staff _id or wechatId
  if (createdBy) {
    var staffRes = await db.collection('staff').where({ _id: createdBy }).get()
    if (staffRes.data && staffRes.data.length > 0) {
      return { success: true, name: staffRes.data[0].name || '未知' }
    }
    staffRes = await db.collection('staff').where({ wechatId: createdBy }).get()
    if (staffRes.data && staffRes.data.length > 0) {
      return { success: true, name: staffRes.data[0].name || '未知' }
    }
  }

  // Fallback: read announcement's _openid and createdByName
  if (announcementId) {
    try {
      var annRes = await db.collection('announcement').doc(announcementId).get()
      if (annRes.data) {
        // If the announcement has a valid createdByName that's not an _id, use it
        if (annRes.data.createdByName && !annRes.data.createdByName.match(/^[0-9a-f]{10,}$/)) {
          return { success: true, name: annRes.data.createdByName }
        }
        // Try matching by _openid, but need wechatId to disambiguate
        if (annRes.data._openid) {
          staffRes = await db.collection('staff').where({ _openid: annRes.data._openid }).get()
          if (staffRes.data && staffRes.data.length === 1) {
            return { success: true, name: staffRes.data[0].name || '未知' }
          }
          // Multiple staff share same _openid, cannot determine which one
        }
      }
    } catch (e) { /* ignore */ }
  }

  return { success: true, name: '未知' }
}

async function getSettings(event) {
  // 只读设置用于启动加载场地信息，校验 OPENID 绑定的有效员工即可
  const { OPENID } = cloud.getWXContext()
  const caller = await findStaffByOpenid(OPENID)
  if (!caller) {
    return { success: false, message: '无权限访问' }
  }

  const result = await db.collection('settings').where({ key: 'venue_info' }).get()
  const data = result.data && result.data.length > 0 ? result.data[0] : {}

  return {
    success: true,
    data: {
      venueName: data.venueName || '小食堂',
      venueAddress: data.venueAddress || '',
      venueLatitude: data.venueLatitude || '',
      venueLongitude: data.venueLongitude || '',
      mealStandards: data.mealStandards || [500, 600, 800],
      partnerStandard: data.partnerStandard || 300,
      defaultStandard: data.defaultStandard !== undefined ? data.defaultStandard : '',
      allowNoStandard: data.allowNoStandard || false,
      venueMapImageFileID: data.venueMapImageFileID || '',
      shareCoverImageFileID: data.shareCoverImageFileID || ''
    }
  }
}

async function updateSettings(event) {
  const { OPENID } = cloud.getWXContext()
  const { venueName, venueAddress, venueLatitude, venueLongitude, mealStandards, partnerStandard, defaultStandard, allowNoStandard, venueMapImageFileID, shareCoverImageFileID } = event

  if (!venueName || !venueAddress) {
    return { success: false, message: '会所名称和地址不能为空' }
  }

  // 校验请求者角色 — venueSettings is admin-only
  const staff = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!staff || !(await hasPermission(staff, 'venueSettings', 'edit'))) {
    return { success: false, message: '无权限执行此操作' }
  }

  const updateData = { venueName, venueAddress, venueLatitude: venueLatitude || '', venueLongitude: venueLongitude || '', mealStandards: mealStandards || [500, 600, 800], partnerStandard: partnerStandard || 300, defaultStandard: defaultStandard !== undefined ? defaultStandard : '', allowNoStandard: !!allowNoStandard, venueMapImageFileID: venueMapImageFileID || '', shareCoverImageFileID: shareCoverImageFileID || '', updatedAt: db.serverDate() }

  const existing = await db.collection('settings').where({ key: 'venue_info' }).get()
  if (existing.data && existing.data.length > 0) {
    await db.collection('settings').doc(existing.data[0]._id).update({ data: updateData })
  } else {
    updateData.key = 'venue_info'
    updateData.createdAt = db.serverDate()
    await db.collection('settings').add({ data: updateData })
  }

  return { success: true }
}

function formatDate(date) {
  if (!date) return ''
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  var chinaTime = new Date(d.getTime() + 8 * 3600000)
  return chinaTime.getUTCFullYear() + '-' + String(chinaTime.getUTCMonth() + 1).padStart(2, '0') + '-' + String(chinaTime.getUTCDate()).padStart(2, '0')
}

function formatAmount(amount) {
  if (amount === null || amount === undefined || amount === '') return '0.00'
  return Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getToday() {
  return formatDate(new Date())
}

function createChinaDate(dateStr) {
  return new Date(dateStr + 'T00:00:00+08:00')
}

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(createChinaDate(value).getTime())
}

function getTomorrow(today) {
  var parts = today.split('-')
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1))
  return formatDate(date)
}

function getCustomerName(reservation) {
  return reservation && reservation.customerName ? reservation.customerName : '未命名客户'
}

function getRoomName(reservation) {
  return reservation && (reservation.roomName || reservation.roomNameDisplay || reservation.room) ?
    (reservation.roomName || reservation.roomNameDisplay || reservation.room) : '未指定包厢'
}

function createChinaDayEnd(dateStr) {
  return new Date(dateStr + 'T23:59:59+08:00')
}

async function assertReservationNoConflict(reservation, excludeId) {
  var dateStr = formatDate(reservation.date)
  var room = reservation.room || ''
  var time = reservation.time || ''
  var exclusiveType = reservation.exclusiveType || (reservation.isExclusive ? 'full' : 'none')
  if (!dateStr || !room) return

  var conditions = [
    { date: _.gte(createChinaDate(dateStr)).and(_.lte(createChinaDayEnd(dateStr))) },
    { status: 'confirmed' }
  ]
  if (excludeId) conditions.push({ _id: _.neq(excludeId) })

  if (exclusiveType === 'none') {
    conditions.push(_.or([
      { time: time, room: room },
      { exclusiveType: 'full', room: room },
      { isExclusive: true, room: room }
    ]))
  } else if (exclusiveType === 'noon') {
    conditions.push(_.or([
      { time: '中午', room: room },
      { exclusiveType: 'full', room: room },
      { isExclusive: true, room: room }
    ]))
  } else if (exclusiveType === 'night') {
    conditions.push(_.or([
      { time: '晚上', room: room },
      { exclusiveType: 'full', room: room },
      { isExclusive: true, room: room }
    ]))
  } else if (exclusiveType !== 'full') {
    return
  }

  var res = await db.collection('reservation').where(_.and(conditions)).limit(1).get()
  if (res.data && res.data.length > 0) {
    if (exclusiveType === 'full') throw new Error('该时段已被包场（全天），请更换时间')
    if (exclusiveType === 'noon') throw new Error('该时段已被包场（中午），请更换时间')
    if (exclusiveType === 'night') throw new Error('该时段已被包场（晚上），请更换时间')
    throw new Error('该时段该包厢已有预约，请更换时间或包厢')
  }
}

async function getConfiguredCustomerPresets() {
  var settingsRes = await db.collection('settings')
    .where({ key: 'reservation_customer_presets' })
    .limit(1)
    .get()
  var doc = settingsRes.data && settingsRes.data[0]
  return doc && Array.isArray(doc.value) ? doc.value : []
}

async function calculateTopCustomerNames(excludedNames) {
  var excluded = (excludedNames || []).reduce(function(map, name) {
    map[String(name).trim()] = true
    return map
  }, {})
  var res = await db.collection('reservation')
    .where({ status: _.neq('cancelled') })
    .field({ customerName: true })
    .limit(1000)
    .get()
  var counts = {}
  ;(res.data || []).forEach(function(item) {
    var name = String((item && item.customerName) || '').trim()
    if (!name || excluded[name]) return
    counts[name] = (counts[name] || 0) + 1
  })
  return Object.keys(counts)
    .sort(function(a, b) {
      var diff = counts[b] - counts[a]
      return diff !== 0 ? diff : a.localeCompare(b)
    })
    .slice(0, 2)
}

async function saveCustomerNameTop(names) {
  var existing = await db.collection('settings')
    .where({ key: 'reservation_customer_top' })
    .limit(1)
    .get()
  var data = { value: names, updatedAt: db.serverDate() }
  if (existing.data && existing.data.length > 0) {
    await db.collection('settings').doc(existing.data[0]._id).update({ data: data })
  } else {
    data.key = 'reservation_customer_top'
    data.createdAt = db.serverDate()
    await db.collection('settings').add({ data: data })
  }
}

async function getCustomerNameSuggestions(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'view'))) {
    return { success: false, message: '无权限查看客户标签' }
  }

  var configured = await getConfiguredCustomerPresets()
  var top = await calculateTopCustomerNames(configured)
  await saveCustomerNameTop(top)
  return { success: true, data: top }
}

async function refreshCustomerNameTop(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'view'))) {
    return { success: false, message: '无权限刷新客户标签' }
  }
  var configured = await getConfiguredCustomerPresets()
  var top = await calculateTopCustomerNames(configured)
  await saveCustomerNameTop(top)
  return { success: true, data: top }
}

function refreshCustomerNameTopLater() {
  getConfiguredCustomerPresets()
    .then(calculateTopCustomerNames)
    .then(saveCustomerNameTop)
    .catch(function(err) {
      console.warn('刷新客户标签缓存失败:', err)
    })
}

function buildReservationChange(type, oldReservation, newReservation, caller) {
  var target = newReservation || oldReservation
  var reservationDate = formatDate(target.date)
  var customerName = getCustomerName(target)
  var roomName = getRoomName(target)

  if (type === 'cancelled') {
    return {
      reservationId: target._id || '',
      changeType: 'cancelled',
      title: '预约已取消',
      summary: reservationDate + ' ' + (target.time || '') + ' ' + roomName + ' ' + customerName + ' 预约已取消',
      before: { status: target.status || 'confirmed' },
      after: { status: 'cancelled' },
      reservationDate: reservationDate,
      reservationTime: target.time || '',
      customerName: customerName,
      roomName: roomName,
      operatorId: caller._id || '',
      operatorName: caller.name || '',
      important: true,
      ackUsers: [],
      createdAt: db.serverDate()
    }
  }

  var oldStandard = Number(oldReservation.standard) || 0
  var newStandard = Number(newReservation.standard) || 0
  var oldDishPrice = Number(oldReservation.dishPrice) || 0
  var newDishPrice = Number(newReservation.dishPrice) || 0
  var changes = []
  if (oldStandard !== newStandard) changes.push('餐标 ¥' + formatAmount(oldStandard) + ' → ¥' + formatAmount(newStandard))
  if (oldDishPrice !== newDishPrice) changes.push('菜价 ¥' + formatAmount(oldDishPrice) + ' → ¥' + formatAmount(newDishPrice))

  return {
    reservationId: newReservation._id || oldReservation._id || '',
    changeType: 'amount_changed',
    title: '预约金额变化',
    summary: reservationDate + ' ' + (newReservation.time || '') + ' ' + roomName + ' ' + customerName + ' ' + changes.join('，'),
    before: { standard: oldStandard, dishPrice: oldDishPrice },
    after: { standard: newStandard, dishPrice: newDishPrice },
    reservationDate: reservationDate,
    reservationTime: newReservation.time || '',
    customerName: customerName,
    roomName: roomName,
    operatorId: caller._id || '',
    operatorName: caller.name || '',
    important: true,
    ackUsers: [],
    createdAt: db.serverDate()
  }
}

async function cancelReservationWithChange(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'edit'))) {
    return { success: false, message: '无权限取消预约' }
  }
  if (!event.reservationId) return { success: false, message: '缺少预约ID' }

  var result = await db.runTransaction(async function(transaction) {
    var beforeRes = await transaction.collection('reservation').doc(event.reservationId).get()
    if (!beforeRes.data) throw new Error('预约不存在')
    var before = Object.assign({}, beforeRes.data, { _id: event.reservationId })
    var after = Object.assign({}, before, { status: 'cancelled' })
    await transaction.collection('reservation').doc(event.reservationId).update({
      data: { status: 'cancelled', updatedAt: db.serverDate() }
    })
    await transaction.collection('reservation_change_log').add({
      data: buildReservationChange('cancelled', before, after, caller)
    })
    return { before: before }
  })
  refreshCustomerNameTopLater()
  return { success: true, before: result.before }
}

async function deleteReservationWithChange(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'delete'))) {
    return { success: false, message: '无权限删除预约' }
  }
  if (!event.reservationId) return { success: false, message: '缺少预约ID' }

  var purchasesRes = await db.collection('purchase')
    .where({ sourceReservationId: event.reservationId, autoGenerated: true })
    .limit(100)
    .get()
  var incomesRes = await db.collection('income')
    .where({ reservationId: event.reservationId, autoGenerated: true })
    .limit(100)
    .get()
  var purchaseIds = (purchasesRes.data || []).map(function(item) { return item._id })
  var incomeIds = (incomesRes.data || []).map(function(item) { return item._id })

  var result = await db.runTransaction(async function(transaction) {
    var beforeRes = await transaction.collection('reservation').doc(event.reservationId).get()
    if (!beforeRes.data) throw new Error('预约不存在')
    var before = Object.assign({}, beforeRes.data, { _id: event.reservationId })
    var after = Object.assign({}, before, { status: 'cancelled' })
    for (var i = 0; i < purchaseIds.length; i++) {
      await transaction.collection('purchase').doc(purchaseIds[i]).remove()
    }
    for (var j = 0; j < incomeIds.length; j++) {
      await transaction.collection('income').doc(incomeIds[j]).remove()
    }
    await transaction.collection('reservation').doc(event.reservationId).remove()
    await transaction.collection('reservation_change_log').add({
      data: buildReservationChange('cancelled', before, after, caller)
    })
    return { before: before }
  })
  refreshCustomerNameTopLater()
  return { success: true, before: result.before }
}

async function updateReservationAmountWithChange(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'edit'))) {
    return { success: false, message: '无权限修改预约' }
  }
  if (!event.reservationId || !event.docData) return { success: false, message: '参数不完整' }

  var beforeRes = await db.collection('reservation').doc(event.reservationId).get()
  if (!beforeRes.data) return { success: false, message: '预约不存在' }
  var before = Object.assign({}, beforeRes.data, { _id: event.reservationId })
  var docData = event.docData || {}
  var allowedFields = ['guestCount', 'dishPrice', 'customerName', 'phone', 'remark', 'date', 'time', 'exclusiveType', 'isPartner', 'room', 'roomName', 'standard', 'customFields']
  var updateData = {}
  allowedFields.forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(docData, field)) updateData[field] = docData[field]
  })
  if (docData.status && docData.status !== before.status) {
    return { success: false, message: '状态变更请使用专用接口' }
  }
  if (updateData.date) {
    var dateStr = formatDate(updateData.date)
    if (!isValidDateString(dateStr) || dateStr < getToday()) return { success: false, message: '预约日期无效' }
    updateData.date = createChinaDate(dateStr)
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'dishPrice')) {
    updateData.dishPrice = Number(updateData.dishPrice) || 0
    if (updateData.dishPrice < 0) return { success: false, message: '菜价不能为负数' }
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'standard')) {
    updateData.standard = Number(updateData.standard) || 0
    if (updateData.standard < 0) return { success: false, message: '餐标不能为负数' }
  }
  if (Object.prototype.hasOwnProperty.call(updateData, 'guestCount')) {
    updateData.guestCount = Number(updateData.guestCount) || 0
    if (updateData.guestCount < 0) return { success: false, message: '人数不能为负数' }
  }

  var after = Object.assign({}, before, updateData, { _id: event.reservationId })
  await assertReservationNoConflict(after, event.reservationId)
  updateData.updatedAt = db.serverDate()

  var oldStandard = Number(before.standard) || 0
  var newStandard = Number(after.standard) || 0
  var oldDishPrice = Number(before.dishPrice) || 0
  var newDishPrice = Number(after.dishPrice) || 0
  var shouldLogAmountChange = oldStandard !== newStandard || oldDishPrice !== newDishPrice

  await db.runTransaction(async function(transaction) {
    await transaction.collection('reservation').doc(event.reservationId).update({ data: updateData })
    if (shouldLogAmountChange) {
      await transaction.collection('reservation_change_log').add({
        data: buildReservationChange('amount_changed', before, after, caller)
      })
    }
  })
  return { success: true, before: before }
}

async function createReservationChange(event) {
  var { OPENID } = cloud.getWXContext()
  var { type, reservationId, before, after, callerWechatId } = event
  var caller = await findStaffByOpenid(OPENID)
  if (!caller || !(await hasPermission(caller, 'reservation', 'edit'))) {
    return { success: false, message: '无权限记录预约变动' }
  }
  if (!reservationId || (type !== 'cancelled' && type !== 'amount_changed')) {
    return { success: false, message: '参数不完整' }
  }

  var currentRes = await db.collection('reservation').doc(reservationId).get()
  if (!currentRes.data) return { success: false, message: '预约不存在' }
  var current = currentRes.data
  var oldReservation = Object.assign({}, current, before || {}, { _id: reservationId })
  var newReservation = Object.assign({}, current, after || {}, { _id: reservationId })

  if (type === 'cancelled' && current.status !== 'cancelled') {
    return { success: false, message: '预约状态未取消' }
  }
  if (type === 'amount_changed') {
    var currentStandard = Number(current.standard) || 0
    var currentDishPrice = Number(current.dishPrice) || 0
    var afterStandard = Number(newReservation.standard) || 0
    var afterDishPrice = Number(newReservation.dishPrice) || 0
    var beforeStandard = Number(oldReservation.standard) || 0
    var beforeDishPrice = Number(oldReservation.dishPrice) || 0
    if (currentStandard !== afterStandard || currentDishPrice !== afterDishPrice) {
      return { success: false, message: '金额变动与当前预约不一致' }
    }
    if (beforeStandard === afterStandard && beforeDishPrice === afterDishPrice) {
      return { success: false, message: '金额没有变化' }
    }
  }

  var change = buildReservationChange(type, oldReservation, newReservation, caller)
  await db.collection('reservation_change_log').add({ data: change })
  return { success: true }
}

async function getReservationChanges(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'view'))) {
    return { success: false, message: '无权限查看预约变动' }
  }

  var today = getToday()
  var tomorrow = getTomorrow(today)
  var result = await db.collection('reservation_change_log')
    .where({ important: true, reservationDate: _.gte(today).and(_.lte(tomorrow)) })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  var data = (result.data || []).filter(function(change) {
    return !(change.ackUsers || []).includes(caller._id)
  })
  return { success: true, data: data }
}

async function markReservationChangesRead(event) {
  var { OPENID } = cloud.getWXContext()
  var caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller || !(await hasPermission(caller, 'reservation', 'view'))) {
    return { success: false, message: '无权限确认预约变动' }
  }
  var ids = Array.isArray(event.changeIds) ? event.changeIds.filter(function(id) {
    return typeof id === 'string' && CHANGE_ID_PATTERN.test(id)
  }) : []
  if (ids.length > MAX_CHANGE_ACK_IDS) {
    return { success: false, message: '一次最多确认' + MAX_CHANGE_ACK_IDS + '条变动' }
  }
  var today = getToday()
  var tomorrow = getTomorrow(today)
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i]
    var changeRes = await db.collection('reservation_change_log').doc(id).get()
    var change = changeRes.data
    if (!change || change.important !== true) continue
    if (change.reservationDate < today || change.reservationDate > tomorrow) continue
    if ((change.ackUsers || []).includes(caller._id)) continue
    await db.collection('reservation_change_log').doc(id).update({
      data: { ackUsers: _.addToSet(caller._id) }
    })
  }
  return { success: true }
}

async function getApprovalSettings(event) {
  // 校验调用者为有效员工
  const { OPENID } = cloud.getWXContext()
  const caller = await findStaffByCaller(OPENID, event.callerWechatId)
  if (!caller) {
    return { success: false, message: '无权限访问' }
  }

  var result = await db.collection('settings').where({ key: 'approval_rules' }).get()
  var data = result.data && result.data.length > 0 ? result.data[0] : {}

  return {
    success: true,
    data: {
      enabled: data.enabled !== undefined ? data.enabled : true,
      autoPurchaseEnabled: data.autoPurchaseEnabled !== undefined ? data.autoPurchaseEnabled : true,
      categories: data.categories || {},
      amountThreshold: data.amountThreshold || 0,
      defaultApproverId: data.defaultApproverId || '',
      defaultApproverName: data.defaultApproverName || '',
      defaultReimburserId: data.defaultReimburserId || '',
      defaultReimburserName: data.defaultReimburserName || ''
    }
  }
}

async function updateApprovalSettings(event) {
  var { OPENID } = cloud.getWXContext()
  var { approvalRules, callerWechatId } = event

  if (!approvalRules) {
    return { success: false, message: '缺少审批设置数据' }
  }

  // Verify caller — must be admin
  var staff = await findStaffByOpenid(OPENID)
  if (!staff || staff.role !== 'admin') {
    return { success: false, message: '无权限修改审批设置' }
  }

  var updateData = {
    enabled: !!approvalRules.enabled,
    autoPurchaseEnabled: approvalRules.autoPurchaseEnabled !== undefined ? !!approvalRules.autoPurchaseEnabled : true,
    categories: approvalRules.categories || {},
    amountThreshold: Number(approvalRules.amountThreshold) || 0,
    defaultApproverId: approvalRules.defaultApproverId || '',
    defaultApproverName: approvalRules.defaultApproverName || '',
    defaultReimburserId: approvalRules.defaultReimburserId || '',
    defaultReimburserName: approvalRules.defaultReimburserName || '',
    updatedAt: db.serverDate()
  }

  var existing = await db.collection('settings').where({ key: 'approval_rules' }).get()
  if (existing.data && existing.data.length > 0) {
    await db.collection('settings').doc(existing.data[0]._id).update({ data: updateData })
  } else {
    updateData.key = 'approval_rules'
    updateData.createdAt = db.serverDate()
    await db.collection('settings').add({ data: updateData })
  }

  return { success: true }
}
