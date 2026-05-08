const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { action } = event

  if (action === 'verifySession') {
    return verifySession(event, context)
  }

  const { wechatId } = event

  if (!wechatId) {
    return { success: false, message: '请提供微信号' }
  }

  const db = cloud.database()

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

    if (user.permissionsUpdatedAt) {
      return {
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          role: user.role,
          roleName: getRoleName(user.role),
          wechatId: user.wechatId,
          phone: user.phone || '',
          permissionsUpdatedAt: user.permissionsUpdatedAt
        },
        forceReLogin: true
      }
    }

    return {
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        role: user.role,
        roleName: getRoleName(user.role),
        wechatId: user.wechatId,
        phone: user.phone || ''
      }
    }
  } catch (err) {
    console.error('登录失败:', err)
    return { success: false, message: '登录失败，请重试' }
  }
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

async function verifySession(event, context) {
  const { staffId } = event
  const { OPENID } = cloud.getWXContext()

  if (!staffId) {
    return { success: false, message: '缺少身份信息' }
  }

  const db = cloud.database()

  try {
    const staffRes = await db.collection('staff')
      .where({ _openid: OPENID, status: 'active' })
      .get()

    if (staffRes.data.length === 0) {
      return { success: false, message: '当前微信未绑定员工' }
    }

    const currentStaff = staffRes.data[0]
    if (currentStaff._id !== staffId) {
      return { success: false, message: '身份不匹配' }
    }

    return {
      success: true,
      data: {
        _id: currentStaff._id,
        name: currentStaff.name,
        role: currentStaff.role,
        wechatId: currentStaff.wechatId,
        phone: currentStaff.phone || ''
      }
    }
  } catch (err) {
    console.error('会话验证失败:', err)
    return { success: false, message: '会话验证失败' }
  }
}
