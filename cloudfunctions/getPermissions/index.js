const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEFAULT_VENUE_ID = 'legacy-default'

function normalizeVenueId(venueId) {
  return venueId || DEFAULT_VENUE_ID
}

exports.main = async (event, context) => {
  const { staffId, cloudbaseUserId, venueId } = event
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    let caller = null

    if (cloudbaseUserId) {
      return { success: false, message: '鸿蒙端权限获取需要服务端验证 AccessToken 后再启用，当前已安全禁用' }
    } else {
      const callerRes = await db.collection('staff')
        .where({ boundOpenid: OPENID, status: 'active' })
        .limit(1)
        .get()
      caller = callerRes.data && callerRes.data[0]
    }

    if (!caller) {
      return { success: false, message: '无法验证调用者身份' }
    }

    const callerVenueId = normalizeVenueId(caller.venueId)
    const targetVenueId = normalizeVenueId(venueId || caller.venueId)

    if (callerVenueId !== targetVenueId) {
      return { success: false, message: '无权限访问其他场地' }
    }

    const targetStaffId = staffId || caller._id
    const isSelfRequest = caller._id === targetStaffId
    const isAuthorized = isSelfRequest || caller.role === 'boss' || caller.role === 'admin'
    if (!isAuthorized) {
      return { success: false, message: '无权限查看他人权限' }
    }

    const staffResult = await db.collection('staff').doc(targetStaffId).get()
    const staff = staffResult && staffResult.data
    if (!staff) return { success: false, message: '员工不存在' }

    const staffVenueId = normalizeVenueId(staff.venueId)
    if (staffVenueId !== targetVenueId) {
      return { success: false, message: '员工不属于当前场地' }
    }

    if (staff.role === 'boss' || staff.role === 'admin') {
      return { success: true, data: [{ module: '*', actions: ['*'] }] }
    }

    // Try with venueId first, fallback to staffId-only query for legacy records without venueId
    let permResult = await db.collection('permissions')
      .where({ staffId: targetStaffId, venueId: targetVenueId })
      .get()

    if (permResult.data.length === 0) {
      permResult = await db.collection('permissions')
        .where({ staffId: targetStaffId })
        .get()
    }

    if (permResult.data.length === 0) {
      return { success: true, data: [] }
    }

    // Pick the record matching targetVenueId; if none, pick legacy record without venueId
    const matched = permResult.data.find(p => normalizeVenueId(p.venueId) === targetVenueId)
      || permResult.data.find(p => !p.venueId)
      || permResult.data[0]

    return { success: true, data: matched.permissions || [] }
  } catch (err) {
    console.error('获取权限失败:', err)
    return { success: false, message: '获取权限失败' }
  }
}
