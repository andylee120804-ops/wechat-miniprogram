const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEFAULT_VENUE_ID = 'legacy-default'

exports.main = async (event, context) => {
  const { action } = event

  if (action === 'phoneAuth') {
    return {
      success: false,
      message: '鸿蒙端手机号登录需要服务端验证 AccessToken 后再启用，当前已安全禁用'
    }
  }

  if (action === 'joinVenue') {
    return {
      success: false,
      message: '加入场地需要可信身份验证后再启用，当前已安全禁用'
    }
  }

  if (action === 'createStaffForNewVenue') {
    return {
      success: false,
      message: '创建场地员工需要可信身份验证后再启用，当前已安全禁用'
    }
  }

  if (action === 'verifySession') {
    return verifySession(event, context)
  }

  if (action === 'autoLogin') {
    return autoLogin(event, context)
  }

  if (action === 'logout') {
    return logoutAction(event, context)
  }

  if (action === 'unbindWechat') {
    return unbindWechatAction(event, context)
  }

  return wechatIdLogin(event)
}

function normalizeVenueId(venueId) {
  return venueId || DEFAULT_VENUE_ID
}

function buildUserData(user) {
  const data = {
    _id: user._id,
    venueId: normalizeVenueId(user.venueId),
    name: user.name,
    role: user.role,
    roleName: getRoleName(user.role),
    wechatId: user.wechatId || '',
    phone: user.phone || '',
    cloudbaseUserId: user.cloudbaseUserId || ''
  }
  if (user.permissionsUpdatedAt) {
    data.permissionsUpdatedAt = user.permissionsUpdatedAt
  }
  return data
}

function getRoleName(role) {
  const roleNames = {
    boss: '老板',
    admin: '管理员',
    purchase: '采购主管',
    chef: '厨师',
    waiter: '服务员'
  }
  return roleNames[role] || role
}

async function wechatIdLogin(event) {
  const { wechatId } = event

  if (!wechatId) {
    return { success: false, message: '请提供微信号' }
  }

  const db = cloud.database()
  const { OPENID } = cloud.getWXContext()

  try {
    const result = await db.collection('staff')
      .where({
        wechatId: wechatId.trim(),
        status: 'active'
      })
      .get()

    if (result.data.length === 0) {
      return { success: false, message: '未找到匹配的账号，请联系管理员' }
    }

    const user = result.data[0]

    if (user.loginRevoked) {
      return { success: false, message: '当前账号已退出，请联系管理员重新启用' }
    }

    if (user.boundOpenid && user.boundOpenid !== OPENID) {
      return { success: false, message: '该账号已绑定其他微信，请联系管理员解绑' }
    }

    await db.collection('staff').doc(user._id).update({
      data: {
        boundOpenid: OPENID,
        boundAt: db.serverDate(),
        boundOpenidLocked: true,
        loginRevoked: false,
        venueId: normalizeVenueId(user.venueId)
      }
    })

    user.venueId = normalizeVenueId(user.venueId)

    return {
      success: true,
      data: buildUserData(user),
      forceReLogin: !!user.permissionsUpdatedAt
    }
  } catch (err) {
    console.error('登录失败:', err)
    return { success: false, message: '登录失败，请重试' }
  }
}

async function autoLogin(event, context) {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    const result = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .get()

    if (!result.data.length) {
      return { success: false, message: '当前微信未绑定员工账号' }
    }

    result.data.sort((a, b) => {
      const aTime = a.boundAt ? new Date(a.boundAt).getTime() : 0
      const bTime = b.boundAt ? new Date(b.boundAt).getTime() : 0
      return bTime - aTime
    })

    const user = result.data[0]
    if (user.loginRevoked) {
      return { success: false, message: '当前账号已退出，请手动登录' }
    }
    user.venueId = normalizeVenueId(user.venueId)
    return { success: true, data: buildUserData(user), autoLogin: true }
  } catch (err) {
    console.error('自动登录失败:', err)
    return { success: false, message: '自动登录失败' }
  }
}

async function verifySession(event, context) {
  const { staffId, cloudbaseUserId } = event
  const db = cloud.database()

  try {
    if (cloudbaseUserId) {
      return {
        success: false,
        message: '鸿蒙端会话验证需要服务端验证 AccessToken 后再启用，当前已安全禁用'
      }
    }

    const { OPENID } = cloud.getWXContext()
    if (!staffId) return { success: false, message: '缺少身份信息' }

    const staffRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .get()

    if (staffRes.data.length === 0) return { success: false, message: '当前微信未绑定员工' }

    staffRes.data.sort((a, b) => {
      const aTime = a.boundAt ? new Date(a.boundAt).getTime() : 0
      const bTime = b.boundAt ? new Date(b.boundAt).getTime() : 0
      return bTime - aTime
    })

    const currentStaff = staffRes.data[0]
    if (currentStaff.loginRevoked) return { success: false, message: '当前账号已退出，请重新登录' }
    if (currentStaff._id !== staffId) return { success: false, message: '身份不匹配' }
    currentStaff.venueId = normalizeVenueId(currentStaff.venueId)
    return { success: true, data: buildUserData(currentStaff) }
  } catch (err) {
    console.error('会话验证失败:', err)
    return { success: false, message: '会话验证失败' }
  }
}

async function logoutAction(event, context) {
  const { staffId, cloudbaseUserId } = event
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    if (cloudbaseUserId) {
      return {
        success: false,
        message: '鸿蒙端退出需要服务端验证 AccessToken 后再启用，当前已安全禁用'
      }
    }

    if (!staffId) return { success: false, message: '缺少身份信息' }
    const staffRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .limit(1)
      .get()
    const staff = staffRes.data && staffRes.data[0]
    if (!staff || staff._id !== staffId) return { success: false, message: '身份不匹配' }
    await db.collection('staff').doc(staffId).update({ data: { loginRevoked: true, logoutAt: db.serverDate() } })
    return { success: true }
  } catch (err) {
    console.error('退出登录失败:', err)
    return { success: false, message: '退出登录失败' }
  }
}

async function unbindWechatAction(event, context) {
  const { staffId } = event
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    if (!staffId) return { success: false, message: '缺少员工ID' }

    // Verify caller is admin
    const callerRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .limit(1)
      .get()
    const caller = callerRes.data && callerRes.data[0]
    if (!caller) return { success: false, message: '无法验证管理员身份' }
    if (caller.role !== 'admin') return { success: false, message: '仅管理员可解绑微信' }

    // Verify target staff belongs to same venue
    const targetRes = await db.collection('staff').doc(staffId).get()
    const target = targetRes && targetRes.data
    if (!target) return { success: false, message: '员工不存在' }
    const callerVenueId = caller.venueId || 'legacy-default'
    const targetVenueId = target.venueId || 'legacy-default'
    if (callerVenueId !== targetVenueId) {
      return { success: false, message: '无权限操作其他场地的员工' }
    }

    // Clear boundOpenid so the staff can login with a new WeChat
    await db.collection('staff').doc(staffId).update({
      data: {
        boundOpenid: db.command.remove(),
        boundAt: db.command.remove(),
        boundOpenidLocked: db.command.remove(),
        loginRevoked: false
      }
    })

    return { success: true, message: '解绑成功，该员工可使用新微信登录' }
  } catch (err) {
    console.error('解绑微信失败:', err)
    return { success: false, message: '解绑微信失败' }
  }
}
