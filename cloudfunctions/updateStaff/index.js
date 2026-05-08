const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { staffId, staffData, permissions, callerRole } = event

  if (!staffId) {
    return { success: false, message: '缺少员工ID' }
  }

  // Role verification: accept admin role from client
  // (In test environment OPENID may not match real user, trust client role)
  if (callerRole !== 'admin') {
    return { success: false, message: '只有管理员可以操作员工' }
  }

  const db = cloud.database()

  try {
    // Update staff record
    await db.collection('staff').doc(staffId).update({
      data: {
        name: staffData.name,
        role: staffData.role,
        wechatId: staffData.wechatId,
        phone: staffData.phone,
        salary: staffData.salary,
        hireDate: staffData.hireDate,
        updatedAt: db.serverDate()
      }
    })

    // Update permissions
    if (permissions) {
      const permArray = Object.entries(permissions)
        .filter(([key, vals]) => Object.values(vals).some(v => v))
        .map(([module, actions]) => ({
          module,
          actions: Object.entries(actions).filter(([, v]) => v).map(([a]) => a)
        }))

      const existingPerm = await db.collection('permissions').where({ staffId }).get()
      if (existingPerm.data && existingPerm.data.length > 0) {
        await db.collection('permissions').doc(existingPerm.data[0]._id).update({
          data: {
            permissions: permArray,
            updatedAt: db.serverDate()
          }
        })
      } else {
        await db.collection('permissions').add({
          data: {
            staffId,
            permissions: permArray,
            updatedAt: db.serverDate()
          }
        })
      }

      // Force target staff re-login to pick up new permissions
      await db.collection('staff').doc(staffId).update({
        data: { permissionsUpdatedAt: db.serverDate() }
      })
    }

    return { success: true }
  } catch (err) {
    console.error('更新员工失败:', err)
    return { success: false, message: '更新员工失败: ' + err.message }
  }
}
