const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEFAULT_VENUE_ID = 'legacy-default'
function normalizeVenueId(venueId) { return venueId || DEFAULT_VENUE_ID }

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { staffId, staffData, permissions } = event

  if (!staffId) {
    return { success: false, message: '缺少员工ID' }
  }

  const db = cloud.database()

  try {
    const callerRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .limit(1)
      .get()
    const caller = callerRes.data && callerRes.data[0]
    if (!caller || caller.role !== 'admin') {
      return { success: false, message: '只有管理员可以操作员工' }
    }
    const callerVenueId = normalizeVenueId(caller.venueId)

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

      let existingPerm = await db.collection('permissions').where({ staffId, venueId: callerVenueId }).get()
      // Fallback for legacy records without venueId
      if (existingPerm.data.length === 0) {
        existingPerm = await db.collection('permissions').where({ staffId }).get()
      }
      if (existingPerm.data && existingPerm.data.length > 0) {
        await db.collection('permissions').doc(existingPerm.data[0]._id).update({
          data: {
            permissions: permArray,
            venueId: callerVenueId,
            updatedAt: db.serverDate()
          }
        })
      } else {
        await db.collection('permissions').add({
          data: {
            staffId,
            venueId: callerVenueId,
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
