const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { action } = event

  if (action === 'verifySession') {
    return verifySession(event, context)
  }

  if (action === 'autoLogin') {
    return autoLogin(event, context)
  }

  if (action === 'logout') {
    return logoutAction(event, context)
  }

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

    // Bind/update OPENID so the most recent device to login gets auto-login
    await db.collection('staff').doc(user._id).update({
      data: {
        boundOpenid: OPENID,
        boundAt: db.serverDate()
      }
    })

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

function buildUserData(user) {
  const data = {
    _id: user._id,
    name: user.name,
    role: user.role,
    roleName: getRoleName(user.role),
    wechatId: user.wechatId,
    phone: user.phone || ''
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

async function autoLogin(event, context) {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    const result = await db.collection('staff')
      .where({
        boundOpenid: OPENID,
        status: 'active'
      })
      .get()

    if (!result.data.length) {
      return { success: false, message: '当前微信未绑定员工账号' }
    }

    // Sort by boundAt descending — most recently bound staff member wins
    result.data.sort((a, b) => {
      const aTime = a.boundAt ? new Date(a.boundAt).getTime() : 0
      const bTime = b.boundAt ? new Date(b.boundAt).getTime() : 0
      return bTime - aTime
    })

    const user = result.data[0]
    return {
      success: true,
      data: buildUserData(user),
      autoLogin: true
    }
  } catch (err) {
    console.error('自动登录失败:', err)
    return { success: false, message: '自动登录失败' }
  }
}

async function verifySession(event, context) {
  const { staffId } = event
  const { OPENID } = cloud.getWXContext()

  if (!staffId) {
    return { success: false, message: '缺少身份信息' }
  }

  const db = cloud.database()

  try {
    const staffRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .get()

    if (staffRes.data.length === 0) {
      return { success: false, message: '当前微信未绑定员工' }
    }

    // Sort by boundAt descending — most recently bound staff member matches
    staffRes.data.sort((a, b) => {
      const aTime = a.boundAt ? new Date(a.boundAt).getTime() : 0
      const bTime = b.boundAt ? new Date(b.boundAt).getTime() : 0
      return bTime - aTime
    })

    const currentStaff = staffRes.data[0]
    if (currentStaff._id !== staffId) {
      return { success: false, message: '身份不匹配' }
    }

    return {
      success: true,
      data: buildUserData(currentStaff)
    }
  } catch (err) {
    console.error('会话验证失败:', err)
    return { success: false, message: '会话验证失败' }
  }
}

async function logoutAction(event, context) {
  const { staffId } = event
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  if (!staffId) {
    return { success: false, message: '缺少身份信息' }
  }

  try {
    await db.collection('staff').doc(staffId).update({
      data: {
        boundOpenid: null
      }
    })
    return { success: true }
  } catch (err) {
    console.error('退出登录失败:', err)
    return { success: false, message: '退出登录失败' }
  }
}
