const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event

  try {
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
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const end = endDate ? new Date(endDate + 'T23:59:59') : new Date()

  const reservations = await fetchAll('reservation', {
    date: _.gte(start).and(_.lte(end)),
    status: _.neq('cancelled')
  })

  const dayCount = {}
  reservations.forEach(r => {
    const day = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0]
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
  const now = new Date()
  const data = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = d
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const incomes = await fetchAll('income', { date: _.gte(start).and(_.lte(end)) })
    const total = incomes.reduce((s, inc) => s + (inc.amount || 0), 0)

    data.push({ month: monthStr, amount: total })
  }

  return { success: true, data }
}

async function topIncomeSources(event) {
  const { startDate, endDate } = event
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const end = endDate ? new Date(endDate + 'T23:59:59') : new Date()

  const incomes = await fetchAll('income', { date: _.gte(start).and(_.lte(end)) })

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
  const since = new Date()
  since.setMonth(since.getMonth() - months)

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
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [todayIncome, monthIncome, todayReservations, monthReservations] = await Promise.all([
    fetchAll('income', { date: todayStr }),
    fetchAll('income', { date: _.gte(monthStart) }),
    fetchAll('reservation', { date: todayStr, status: _.neq('cancelled') }),
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
