const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BEIJING_OFFSET = 8 * 60 * 60 * 1000

// ===== 北京时间工具函数（与 autoSyncReservation、getInsights 保持同步） =====

// 将 Date 对象转为北京时间日期字符串 YYYY-MM-DD
function formatDateStr(d) {
  const local = new Date(d.getTime() + BEIJING_OFFSET)
  return local.getUTCFullYear() + '-' + String(local.getUTCMonth() + 1).padStart(2, '0') + '-' + String(local.getUTCDate()).padStart(2, '0')
}

// 北京时间 dateStr 的 00:00:00 → 对应的 UTC Date 对象
function beijingStart(dateStr) {
  return new Date(new Date(dateStr + 'T00:00:00').getTime() - BEIJING_OFFSET)
}

// 分页获取全部记录（单个 .get() 最多100条）
async function fetchAll(db, collection, where) {
  const MAX = 100
  let all = []
  let offset = 0
  while (true) {
    const res = await db.collection(collection).where(where)
      .skip(offset)
      .limit(MAX)
      .get()
    all = all.concat(res.data)
    if (res.data.length < MAX) break
    offset += MAX
  }
  return all
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const db = cloud.database()

  try {
    // 1. Auto-detect user via OPENID
    const staffRes = await db.collection('staff')
      .where({ boundOpenid: OPENID, status: 'active' })
      .get()

    if (!staffRes.data.length) {
      return { success: false, message: '未绑定员工' }
    }

    // Most recently bound account wins
    staffRes.data.sort((a, b) => {
      const aTime = a.boundAt ? new Date(a.boundAt).getTime() : 0
      const bTime = b.boundAt ? new Date(b.boundAt).getTime() : 0
      return bTime - aTime
    })

    const user = staffRes.data[0]
    const userData = {
      _id: user._id,
      name: user.name,
      role: user.role,
      roleName: getRoleName(user.role),
      wechatId: user.wechatId,
      phone: user.phone || ''
    }
    if (user.permissionsUpdatedAt) {
      userData.permissionsUpdatedAt = user.permissionsUpdatedAt
    }

    // 2. Get permissions
    let permissions = []
    try {
      const permRes = await db.collection('permissions')
        .where({ staffId: user._id })
        .get()
      if (permRes.data.length) {
        permissions = permRes.data[0].modules || []
      }
    } catch (e) { /* ignore */ }

    // 3. Get venue name
    let venueName = ''
    try {
      const settingsRes = await db.collection('settings').get()
      if (settingsRes.data.length && settingsRes.data[0].venueName) {
        venueName = settingsRes.data[0].venueName
      }
    } catch (e) { /* ignore */ }

    // 4. Current month range — 使用北京时间
    const now = new Date()
    const todayStr = formatDateStr(now)
    const monthStr = todayStr.substring(0, 7)
    const monthStartStr = monthStr + '-01'
    const monthStart = beijingStart(monthStartStr)

    // 5. Current month purchase count & total (for home page stats)
    let purchaseStats = { count: 0, total: 0 }
    try {
      const purchaseAll = await fetchAll(db, 'purchase', {
        date: db.command.gte(monthStartStr).and(db.command.lte(todayStr))
      })
      purchaseStats.count = purchaseAll.length
      purchaseStats.total = purchaseAll.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    } catch (e) { /* ignore */ }

    // 6. Current month income count & total
    let incomeStats = { count: 0, total: 0 }
    try {
      const incomeAll = await fetchAll(db, 'income', {
        date: db.command.gte(monthStartStr).and(db.command.lte(todayStr))
      })
      incomeStats.count = incomeAll.length
      incomeStats.total = incomeAll.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    } catch (e) { /* ignore */ }

    return {
      success: true,
      data: {
        user: userData,
        permissions,
        venueName,
        monthStr,
        purchaseStats,
        incomeStats
      }
    }
  } catch (err) {
    console.error('[prefetchData] 失败:', err)
    return { success: false, message: '预拉取失败' }
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
