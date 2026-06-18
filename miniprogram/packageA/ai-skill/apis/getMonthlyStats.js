/**
 * getMonthlyStats - 获取月度采购/收支统计
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatAmount, getMonthRange } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getMonthlyStats({ type, category, month }) {
  try {
    if (!hasPermission('dashboard', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看统计数据的权限' }] }
    }

    const statsType = type || 'finance'
    const range = getMonthRange(0)
    const targetMonth = month || range.monthStr

    if (statsType === 'purchase') {
      return await getPurchaseStats(targetMonth, category)
    }
    return await getFinanceStats(targetMonth)
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `获取月度统计失败: ${err.message}` }]
    }
  }
}

async function getPurchaseStats(month, category) {
  const dbInst = require('../../../utils/db').getDb()
  const _ = dbInst.command

  const [y, m] = month.split('-')
  const monthStart = `${y}-${m}-01`
  const monthEnd = `${y}-${m}-${new Date(parseInt(y), parseInt(m), 0).getDate()}`

  // 调用云函数获取采购总额和分类汇总（与经营报表同源：只算 !status || reimbursed）
  const financeRes = await wx.cloud.callFunction({
    name: 'getFinanceStats',
    data: { startDate: monthStart, endDate: monthEnd, periodType: 'month' }
  })
  const fResult = financeRes.result
  const cloudData = (fResult && fResult.success && fResult.data) ? fResult.data : null

  // 本地查询采购列表（展示具体记录和各状态明细）
  const where = { date: _.gte(monthStart).and(_.lte(monthEnd)) }
  if (category) {
    where.category = category
  }
  const { data: purchases } = await queryAll(
    COLLECTIONS.PURCHASE,
    where,
    'date',
    'desc'
  )

  // 按状态分组展示（让用户了解各状态采购情况）
  const byStatus = {}
  const byCategoryLocal = {}
  for (const p of purchases) {
    const s = p.status || 'pending'
    byStatus[s] = (byStatus[s] || 0) + (p.amount || 0)
    const cat = p.category || '其他'
    if (!byCategoryLocal[cat]) {
      byCategoryLocal[cat] = { count: 0, amount: 0 }
    }
    byCategoryLocal[cat].count += 1
    byCategoryLocal[cat].amount += (p.amount || 0)
  }

  // 总额使用云函数口径（经营报表同源），分类也优先用云函数
  const totalAmount = cloudData ? cloudData.totalPurchase : purchases.reduce((sum, r) => sum + (r.amount || 0), 0)
  const byCategory = cloudData && cloudData.purchaseByCategory
    ? Object.fromEntries(
        Object.entries(cloudData.purchaseByCategory).map(([k, v]) => [k, { count: 0, amount: Math.round(v * 100) / 100 }])
      )
    : byCategoryLocal

  const detail = category
    ? `${month} ${category}类采购：经营报表口径合计¥${formatAmount(totalAmount)}（共${purchases.length}笔记录）`
    : `${month} 采购：经营报表口径合计¥${formatAmount(totalAmount)}（共${purchases.length}笔记录，含待审批/已拒绝等非报表口径）`

  return {
    isError: false,
    content: [{ type: 'text', text: detail }],
    structuredContent: {
      month,
      type: 'purchase',
      // 经营报表口径总额（只算 !status || reimbursed）
      totalAmount: Math.round(totalAmount * 100) / 100,
      details: {
        totalCount: purchases.length,
        // 经营报表口径分类
        byCategory: Object.fromEntries(
          Object.entries(byCategory).map(([k, v]) => [
            k,
            { count: v.count, amount: Math.round(v.amount * 100) / 100 }
          ])
        ),
        // 各状态金额（供用户了解审批情况）
        byStatus: Object.fromEntries(
          Object.entries(byStatus).map(([k, v]) => [k, Math.round(v * 100) / 100])
        )
      }
    }
  }
}

async function getFinanceStats(month) {
  const [y, m] = month.split('-')
  // date field is stored as "YYYY-MM-DD" string
  const monthStart = `${y}-${m}-01`
  const monthEnd = `${y}-${m}-${new Date(parseInt(y), parseInt(m), 0).getDate()}`

  // 调用云函数（与经营报表共用唯一计算源）
  const financeRes = await wx.cloud.callFunction({
    name: 'getFinanceStats',
    data: { startDate: monthStart, endDate: monthEnd, periodType: 'month' }
  })
  if (!financeRes.result || !financeRes.result.success) {
    return {
      isError: true,
      content: [{ type: 'text', text: '获取财务统计失败' }]
    }
  }
  const finance = financeRes.result.data

  const totalIncome = finance.totalIncome
  const totalExpense = finance.totalExpense // 一次性支出 + 固定支出（不含采购和工资）
  const totalPurchase = finance.totalPurchase
  const totalFixed = finance.totalFixed
  const totalSalary = finance.totalSalary
  const totalExpenseAll = finance.totalExpenseAll // 采购 + 运营支出 + 工资（经营报表"总支出"）
  const netProfit = finance.netProfit

  // 经营报表"总支出" = 采购 + 运营支出 + 工资，文本完全对应
  const summary = `${month} 收入¥${formatAmount(totalIncome)}，总支出（含采购+运营+工资）¥${formatAmount(totalExpenseAll)}（采购${formatAmount(totalPurchase)} + 运营${formatAmount(totalExpense)} + 工资${formatAmount(totalSalary)}），净利润¥${formatAmount(netProfit)}`

  return {
    isError: false,
    content: [{ type: 'text', text: summary }],
    structuredContent: {
      month,
      type: 'finance',
      totalAmount: Math.round(netProfit * 100) / 100,
      details: {
        income: Math.round(totalIncome * 100) / 100,
        // ⚠️ 经营报表"总支出" = 采购 + 运营支出 + 工资
        totalExpenseAll: Math.round(totalExpenseAll * 100) / 100,
        operationExpense: Math.round(totalExpense * 100) / 100,
        fixedExpense: Math.round(totalFixed * 100) / 100,
        purchase: Math.round(totalPurchase * 100) / 100,
        salary: Math.round(totalSalary * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        incomeByCategory: Object.fromEntries(
          Object.entries(finance.incomeByType).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        expenseByCategory: Object.fromEntries(
          Object.entries(finance.expenseByCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        purchaseByCategory: Object.fromEntries(
          Object.entries(finance.purchaseByCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
        )
      }
    }
  }
}

module.exports = getMonthlyStats
