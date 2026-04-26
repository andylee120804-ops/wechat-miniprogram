const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { staffId } = event

  if (!staffId) {
    return { success: false, message: '请提供员工ID' }
  }

  const db = cloud.database()

  try {
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
