const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('sendMessage错误:', err)
    return { success: false, message: '操作失败' }
  }
}

async function createAnnouncement(event) {
  const { title, content, priority, needsConfirm, createdBy, createdByName, startDate, endDate } = event

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
  }

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
      readBy: [],
      createdAt: new Date()
    }
  })

  return { success: true, data: { _id: result._id } }
}

async function getAnnouncements(event) {
  const { limit = 20, skip = 0 } = event

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
  const { announcementId, staffId } = event

  if (!announcementId || !staffId) {
    return { success: false, message: '参数不完整' }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: {
      readBy: _.push(staffId)
    }
  })

  return { success: true }
}

async function deleteAnnouncement(event) {
  const { announcementId } = event

  if (!announcementId) {
    return { success: false, message: '缺少公告ID' }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: { active: false }
  })

  return { success: true }
}

async function updateAnnouncement(event) {
  const { announcementId, title, content, priority, needsConfirm, startDate, endDate } = event

  if (!announcementId) {
    return { success: false, message: '缺少公告ID' }
  }

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
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

async function getSettings(event) {
  const result = await db.collection('settings').where({ key: 'venue_info' }).get()
  const data = result.data && result.data.length > 0 ? result.data[0] : {}
  return {
    success: true,
    data: {
      venueName: data.venueName || '听澜轩',
      venueAddress: data.venueAddress || '',
      venueLatitude: data.venueLatitude || '',
      venueLongitude: data.venueLongitude || ''
    }
  }
}

async function updateSettings(event) {
  const { OPENID } = cloud.getWXContext()
  const { venueName, venueAddress, venueLatitude, venueLongitude } = event

  if (!venueName || !venueAddress) {
    return { success: false, message: '会所名称和地址不能为空' }
  }

  // 校验请求者角色
  const staffRes = await db.collection('staff').where({ _openid: OPENID }).get()
  const staff = staffRes.data && staffRes.data[0]
  if (!staff || (staff.role !== 'boss' && staff.role !== 'admin')) {
    return { success: false, message: '无权限执行此操作' }
  }

  const updateData = { venueName, venueAddress, venueLatitude: venueLatitude || '', venueLongitude: venueLongitude || '', updatedAt: db.serverDate() }

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
