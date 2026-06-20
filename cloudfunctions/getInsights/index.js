const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const BEIJING_OFFSET = 8 * 60 * 60 * 1000
const ADMIN_ONLY_MODULES = ['staff', 'venueSettings', 'minAmount']
const ACTION_PERMISSIONS = {
  busiestDays: { module: 'dashboard', action: 'view' },
  customerFrequency: { module: 'dashboard', action: 'view' },
  revenueTrend: { module: 'dashboard', action: 'view' },
  topIncomeSources: { module: 'dashboard', action: 'view' },
  dashboardSummary: { module: 'dashboard', action: 'view' }
}

// ===== 北京时间工具函数（与 autoSyncReservation、prefetchData 保持同步） =====

// 将 Date 对象转为北京时间日期字符串 YYYY-MM-DD
function formatDateStr(d) {
  const local = new Date(d.getTime() + BEIJING_OFFSET)
  return local.getUTCFullYear() + '-' + String(local.getUTCMonth() + 1).padStart(2, '0') + '-' + String(local.getUTCDate()).padStart(2, '0')
}

// 北京时间 dateStr 的 00:00:00 → 对应的 UTC Date 对象
function beijingStart(dateStr) {
  return new Date(new Date(dateStr + 'T00:00:00').getTime() - BEIJING_OFFSET)
}

// 北京时间 dateStr 的 23:59:59.999 → 对应的 UTC Date 对象
function beijingEnd(dateStr) {
  return new Date(new Date(dateStr + 'T23:59:59.999').getTime() - BEIJING_OFFSET)
}

exports.main = async (event, context) => {
  const { action } = event

  try {
    const auth = await authorizeAction(action)
    if (!auth.success) return auth

    switch (action) {
      case 'busiestDays':
        return await busiestDays(event)
      case 'revenueTrend':
        return await revenueTrend(event)
      case 'topIncomeSources':
        return await topIncomeSources(event)
      case 'customerFrequency':
        return await customerFrequency(event)
      case 'dashboardSummary':
        return await dashboardSummary(event)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('getInsights错误:', err)
    return { success: false, message: '洞察计算失败' }
  }
}

async function authorizeAction(action) {
  const required = ACTION_PERMISSIONS[action]
  if (!required) return { success: true }

  const wxContext = cloud.getWXContext()
  const openid = wxContext && wxContext.OPENID
  if (!openid) return { success: false, message: '无权限访问经营洞察' }

  const staffRes = await db.collection('staff')
    .where({ boundOpenid: openid, status: 'active' })
    .limit(1)
    .get()
  const staff = staffRes.data && staffRes.data[0]
  if (!staff) return { success: false, message: '无权限访问经营洞察' }
  if (staff.role === 'admin') return { success: true, staff: staff }
  if (staff.role === 'boss' && !ADMIN_ONLY_MODULES.includes(required.module)) return { success: true, staff: staff }

  const permRes = await db.collection('permissions').where({ staffId: staff._id }).get()
  const permissions = permRes.data && permRes.data[0] && permRes.data[0].permissions ? permRes.data[0].permissions : []
  const perm = permissions.find(function(item) { return item.module === required.module })
  const actions = perm && perm.actions ? perm.actions : []
  if (actions.includes(required.action) || actions.includes('*')) return { success: true, staff: staff }

  return { success: false, message: '无权限访问经营洞察' }
}

async function fetchAll(collection, where) {
  const MAX = 100
  let all = []
  const count = (await db.collection(collection).where(where).count()).total
  const batches = Math.ceil(count / MAX)
  for (let i = 0; i < batches; i++) {
    const res = await db.collection(collection).where(where)
      .orderBy('createdAt', 'desc')
      .skip(i * MAX)
      .limit(MAX)
      .get()
    all = all.concat(res.data)
  }
  return all
}

async function busiestDays(event) {
  const { startDate, endDate, top = 5 } = event
  const todayStr = formatDateStr(new Date())
  const startStr = startDate || todayStr.substring(0, 7) + '-01'
  const endStr = endDate || todayStr
  const start = beijingStart(startStr)
  const end = beijingEnd(endStr)

  const reservations = await fetchAll('reservation', {
    date: _.gte(start).and(_.lte(end)),
    status: _.neq('cancelled')
  })

  const dayCount = {}
  reservations.forEach(r => {
    const day = r.date instanceof Date ? formatDateStr(r.date) : String(r.date).split('T')[0]
    dayCount[day] = (dayCount[day] || 0) + 1
  })

  const sorted = Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([date, count]) => ({ date, count }))

  return { success: true, data: sorted }
}

async function revenueTrend(event) {
  const { period = 'month', months = 6 } = event
  const data = []

  const bjNow = new Date(new Date().getTime() + BEIJING_OFFSET)
  const bjYear = bjNow.getUTCFullYear()
  const bjMonth = bjNow.getUTCMonth()

  for (let i = months - 1; i >= 0; i--) {
    let m = bjMonth - i
    let y = bjYear
    while (m < 0) { m += 12; y-- }
    const monthStr = y + '-' + String(m + 1).padStart(2, '0')
    const startStr = monthStr + '-01'
    // 月末日期
    const endOfM = new Date(y, m + 1, 0)
    const endStr = endOfM.getFullYear() + '-' + String(endOfM.getMonth() + 1).padStart(2, '0') + '-' + String(endOfM.getDate()).padStart(2, '0')

    const incomes = await fetchAll('income', { date: _.gte(startStr).and(_.lte(endStr)) })
    const total = incomes.reduce((s, inc) => s + (inc.amount || 0), 0)

    data.push({ month: monthStr, amount: total })
  }

  return { success: true, data }
}

async function topIncomeSources(event) {
  const { startDate, endDate } = event
  const todayStr = formatDateStr(new Date())
  const startStr = startDate || todayStr.substring(0, 7) + '-01'
  const endStr = endDate || todayStr

  const incomes = await fetchAll('income', { date: _.gte(startStr).and(_.lte(endStr)) })

  const byType = {}
  incomes.forEach(i => {
    byType[i.type] = (byType[i.type] || 0) + (i.amount || 0)
  })

  const sorted = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amount]) => ({ type, amount }))

  return { success: true, data: sorted }
}

async function customerFrequency(event) {
  const { months = 3 } = event
  const now = new Date()
  const todayStr = formatDateStr(now)
  // 使用纯字符串计算 months 个月前的日期
  const [year, month] = todayStr.split('-').map(Number)
  let sinceMonth = month - months
  let sinceYear = year
  while (sinceMonth <= 0) { sinceMonth += 12; sinceYear-- }
  const sinceStr = sinceYear + '-' + String(sinceMonth).padStart(2, '0') + '-01'
  const since = beijingStart(sinceStr)

  const reservations = await fetchAll('reservation', {
    date: _.gte(since),
    status: _.neq('cancelled')
  })

  const customerMap = {}
  reservations.forEach(r => {
    const name = r.customerName || '未知'
    if (!customerMap[name]) customerMap[name] = { name, visits: 0, lastDate: r.date }
    customerMap[name].visits++
  })

  const sorted = Object.values(customerMap)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20)

  return { success: true, data: sorted }
}

async function dashboardSummary(event) {
  const todayStr = formatDateStr(new Date())
  // 本月1号的北京时间范围
  const monthStartStr = todayStr.substring(0, 7) + '-01'
  const monthStart = beijingStart(monthStartStr)
  const todayEnd = beijingEnd(todayStr)

  const [todayIncome, monthIncome, todayReservations, monthReservations] = await Promise.all([
    fetchAll('income', { date: todayStr }),
    fetchAll('income', { date: _.gte(monthStartStr).and(_.lte(todayStr)) }),
    fetchAll('reservation', { date: _.gte(beijingStart(todayStr)).and(_.lte(todayEnd)), status: _.neq('cancelled') }),
    fetchAll('reservation', { date: _.gte(monthStart), status: _.neq('cancelled') })
  ])

  const todayIncomeTotal = todayIncome.reduce((s, i) => s + (i.amount || 0), 0)
  const monthIncomeTotal = monthIncome.reduce((s, i) => s + (i.amount || 0), 0)

  return {
    success: true,
    data: {
      todayIncome: todayIncomeTotal,
      monthIncome: monthIncomeTotal,
      todayReservations: todayReservations.length,
      monthReservations: monthReservations.length
    }
  }
}
