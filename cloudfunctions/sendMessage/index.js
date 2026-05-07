const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// Modules that only admin can access; boss is excluded
const ADMIN_ONLY_MODULES = ['staff', 'venueSettings', 'minAmount']

/**
 * Find staff record by wechatId (preferred) or OPENID fallback.
 * wechatId is more reliable since _openid may be shared across staff records.
 */
async function findStaffByCaller(OPENID, wechatId) {
  if (wechatId) {
    var staffRes = await db.collection('staff').where({ wechatId: wechatId }).get()
    if (staffRes.data && staffRes.data.length > 0) return staffRes.data[0]
  }
  var staffRes = await db.collection('staff').where({ _openid: OPENID }).get()
  if (staffRes.data && staffRes.data.length > 0) {
    if (wechatId) {
      var match = staffRes.data.find(s => s.wechatId === wechatId)
      if (match) return match
    }
    return staffRes.data[0]
  }
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
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('sendMessage错误:', err)
    return { success: false, message: '操作失败' }
  }
}

async function createAnnouncement(event) {
  const { title, content, priority, needsConfirm, startDate, endDate, callerWechatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
  }

  const caller = await findStaffByCaller(OPENID, callerWechatId)
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
  const { announcementId, staffId, callerWechatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!announcementId || !staffId) {
    return { success: false, message: '参数不完整' }
  }

  // Verify caller is a valid staff member
  const caller = await findStaffByCaller(OPENID, callerWechatId)
  if (!caller) {
    return { success: false, message: '无权限操作' }
  }

  // Check if already read to avoid duplicate push
  const annRes = await db.collection('announcement').doc(announcementId).get()
  if (!annRes.data) {
    return { success: false, message: '公告不存在' }
  }
  if ((annRes.data.readBy || []).includes(staffId)) {
    return { success: true }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: {
      readBy: _.push(staffId)
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

  const caller = await findStaffByCaller(OPENID, callerWechatId)
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

  const caller = await findStaffByCaller(OPENID, callerWechatId)
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
  const result = await db.collection('settings').where({ key: 'venue_info' }).get()
  const data = result.data && result.data.length > 0 ? result.data[0] : {}

  return {
    success: true,
    data: {
      venueName: data.venueName || '听澜轩',
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
