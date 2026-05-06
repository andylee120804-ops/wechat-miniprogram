const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { staffId } = event
  const { OPENID } = cloud.getWXContext()

  if (!staffId) {
    return { success: false, message: '请提供员工ID' }
  }

  const db = cloud.database()

  try {
    // Verify caller identity: must be requesting own permissions or be boss/admin
    const callerRes = await db.collection('staff').where({ _openid: OPENID }).get()
    const caller = callerRes.data && callerRes.data[0]
    if (!caller) {
      return { success: false, message: '无法验证调用者身份' }
    }

    const isSelfRequest = caller._id === staffId
    const isAuthorized = isSelfRequest || caller.role === 'boss' || caller.role === 'admin'
    if (!isAuthorized) {
      return { success: false, message: '无权限查看他人权限' }
    }

    const staffResult = await db.collection('staff').doc(staffId).get()
    if (staffResult.data.role === 'boss') {
      return {
        success: true,
        data: [{ module: '*', actions: ['*'] }]
      }
    }

    const permResult = await db.collection('permissions')
      .where({ staffId })
      .get()

    if (permResult.data.length === 0) {
      return { success: true, data: [] }
    }

    return {
      success: true,
      data: permResult.data[0].permissions
    }
  } catch (err) {
    console.error('获取权限失败:', err)
    return { success: false, message: '获取权限失败' }
  }
}
