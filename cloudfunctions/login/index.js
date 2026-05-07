const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
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
