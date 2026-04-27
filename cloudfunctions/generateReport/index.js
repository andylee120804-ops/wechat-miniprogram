const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event

  try {
    switch (action) {
      case 'monthlySummary':
        return await monthlySummary(event)
      case 'periodReport':
        return await periodReport(event)
      case 'customerReport':
        return await customerReport(event)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('generateReport错误:', err)
    return { success: false, message: '报表生成失败' }
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

async function monthlySummary(event) {
  const { month } = event
  if (!month) return { success: false, message: '请提供月份' }

  // Income/purchase dates stored as "YYYY-MM-DD" strings — query with strings
  const startDateStr = month + '-01'
  const d = new Date(month + '-01')
  const endDateObj = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth() + 1).padStart(2, '0') + '-' + String(endDateObj.getDate()).padStart(2, '0')

  const [incomes, purchases, expenses] = await Promise.all([
    fetchAll('income', { date: _.gte(startDateStr).and(_.lte(endDateStr)) }),
    fetchAll('purchase', { date: _.gte(startDateStr).and(_.lte(endDateStr)) }),
    fetchAll('expense', { month })
  ])

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0)
  const totalPurchase = purchases.reduce((s, p) => s + (p.amount || 0), 0)
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  const incomeByType = {}
  incomes.forEach(i => { incomeByType[i.type] = (incomeByType[i.type] || 0) + (i.amount || 0) })

  const purchaseByCategory = {}
  purchases.forEach(p => { purchaseByCategory[p.category] = (purchaseByCategory[p.category] || 0) + (p.amount || 0) })

  const expenseByCategory = {}
  expenses.forEach(e => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (e.amount || 0) })

  return {
    success: true,
    data: {
      month,
      totalIncome,
      totalPurchase,
      totalExpense,
      profit: totalIncome - totalPurchase - totalExpense,
      incomeCount: incomes.length,
      purchaseCount: purchases.length,
      expenseCount: expenses.length,
      incomeByType,
      purchaseByCategory,
      expenseByCategory
    }
  }
}

async function periodReport(event) {
  const { startDate, endDate } = event
  if (!startDate || !endDate) return { success: false, message: '请提供日期范围' }

  // income/purchase dates are "YYYY-MM-DD" strings
  const [incomes, purchases, expenses] = await Promise.all([
    fetchAll('income', { date: _.gte(startDate).and(_.lte(endDate)) }),
    fetchAll('purchase', { date: _.gte(startDate).and(_.lte(endDate)) }),
    fetchAll('expense', { createdAt: _.gte(new Date(startDate + 'T00:00:00')).and(_.lte(new Date(endDate + 'T23:59:59'))) })
  ])

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0)
  const totalPurchase = purchases.reduce((s, p) => s + (p.amount || 0), 0)
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  return {
    success: true,
    data: {
      startDate,
      endDate,
      totalIncome,
      totalPurchase,
      totalExpense,
      profit: totalIncome - totalPurchase - totalExpense,
      incomeCount: incomes.length,
      purchaseCount: purchases.length,
      expenseCount: expenses.length
    }
  }
}

async function customerReport(event) {
  const { customerName } = event
  if (!customerName) return { success: false, message: '请提供客户名称' }

  const reservations = await fetchAll('reservation', { customerName })
  const incomes = await fetchAll('income', { source: customerName })

  const totalSpending = incomes.reduce((s, i) => s + (i.amount || 0), 0)

  const roomCount = {}
  reservations.forEach(r => {
    const room = r.roomName || r.room || '未知'
    roomCount[room] = (roomCount[room] || 0) + 1
  })

  const preferredRoom = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0]

  return {
    success: true,
    data: {
      customerName,
      totalVisits: reservations.length,
      totalSpending,
      preferredRoom: preferredRoom ? preferredRoom[0] : '无',
      lastVisit: reservations.length > 0 ? reservations[0].date : null,
      roomDistribution: roomCount
    }
  }
}
