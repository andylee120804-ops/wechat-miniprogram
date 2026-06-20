/**
 * getInsights - 经营洞察与智能建议
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount, getMonthRange } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getInsights({ period }) {
  try {
    if (!hasPermission('dashboard', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看经营洞察的权限' }] }
    }

    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command
    const now = new Date()
    const today = formatDate(now)
    const monthRange = getMonthRange(0)
    const mStart = new Date(monthRange.start + 'T00:00:00')
    const mEnd = new Date(monthRange.end + 'T23:59:59')

    // 财务统计：调用云函数（与经营报表共用唯一计算源）
    const financeRes = await wx.cloud.callFunction({
      name: 'getFinanceStats',
      data: { startDate: monthRange.start, endDate: monthRange.end, periodType: 'month' }
    })
    if (!financeRes.result || !financeRes.result.success) {
      return { isError: true, content: [{ type: 'text', text: '获取财务数据失败' }] }
    }
    const finance = financeRes.result.data

    // 预约数据单独查询（RESERVATION.date 是 Date 对象，财务核心模块不涉及）
    const resResult = await queryAll(COLLECTIONS.RESERVATION, {
      date: _.gte(mStart).and(_.lte(mEnd)),
      status: _.neq('cancelled')
    })
    const reservations = resResult.data || []

    const totalIncome = finance.totalIncome
    const totalExpense = finance.totalExpense // 一次性支出 + 固定支出（不含采购和工资）
    const totalFixed = finance.totalFixed
    const totalPurchase = finance.totalPurchase
    const totalSalary = finance.totalSalary
    const totalExpenseAll = finance.totalExpenseAll // 采购 + 运营支出 + 工资（经营报表"总支出"）
    const netProfit = finance.netProfit

    // Busiest days (top 5)
    const dayCount = {}
    reservations.forEach(r => {
      const d = formatDate(r.date)
      dayCount[d] = (dayCount[d] || 0) + 1
    })
    const busiestDays = Object.entries(dayCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Income by type — 复用 finance 已计算好的 incomeByType
    const topIncomeType = Object.entries(finance.incomeByType).sort((a, b) => b[1] - a[1])

    // Room popularity
    const roomCount = {}
    reservations.forEach(r => {
      const room = r.roomName || '未指定'
      roomCount[room] = (roomCount[room] || 0) + 1
    })

    // Time preference
    const timeCount = {}
    reservations.forEach(r => {
      const t = r.time || '未指定'
      timeCount[t] = (timeCount[t] || 0) + 1
    })

    // Generate insights text
    // 经营报表"总支出" = 采购 + 运营支出 + 工资，以下文本完全对应
    const insights = []
    insights.push(`📊 ${monthRange.label}经营概况（统计区间：${monthRange.start} 至 ${monthRange.end}）`)
    insights.push(`收入：${formatAmount(totalIncome)}元 | 总支出（含采购+运营+工资）：${formatAmount(totalExpenseAll)}元 | 净利润：${formatAmount(netProfit)}元${netProfit > 0 ? ' ✅' : ' ⚠️'}`)
    insights.push(`总支出明细：采购${formatAmount(totalPurchase)}元 + 运营支出${formatAmount(totalExpense)}元（含固定${formatAmount(totalFixed)}元）+ 工资${formatAmount(totalSalary)}元 = 总支出${formatAmount(totalExpenseAll)}元`)
    insights.push(`预约：${reservations.length}个`)

    if (busiestDays.length > 0) {
      insights.push(`最忙日：${busiestDays.map(([d, c]) => `${d}(${c}个)`).join(', ')}`)
    }
    if (topIncomeType.length > 0) {
      insights.push(`收入来源：${topIncomeType.map(([t, a]) => `${t} ${formatAmount(a)}元`).join(', ')}`)
    }

    // Smart suggestions
    const suggestions = []
    if (netProfit < 0) {
      suggestions.push('本月利润为负，建议关注支出控制')
    }
    if (totalPurchase > totalIncome * 0.6) {
      suggestions.push('采购占收入比例较高，建议优化采购成本')
    }
    const avgDailyIncome = totalIncome / (now.getDate())
    if (avgDailyIncome < 500) {
      suggestions.push('日均收入偏低，建议拓展客源或提升客单价')
    }
    if (busiestDays.length > 0) {
      suggestions.push(`最忙日期可提前备货，减少临时采购成本`)
    }

    const summary = insights.join('\n') + (suggestions.length ? '\n\n💡 建议：\n' + suggestions.join('\n') : '')

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        period: monthRange.label,
        totalIncome: Math.round(totalIncome * 100) / 100,
        // ⚠️ 关键：经营报表"总支出" = 采购 + 运营支出 + 工资，以下字段必须这样理解
        totalExpenseAll: Math.round(totalExpenseAll * 100) / 100, // = 经营报表"总支出"
        // 明细拆解（三者之和 = totalExpenseAll）
        totalPurchase: Math.round(totalPurchase * 100) / 100,
        operationExpense: Math.round(totalExpense * 100) / 100, // 运营支出（含固定）
        totalFixed: Math.round(totalFixed * 100) / 100,
        totalSalary: Math.round(totalSalary * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        reservationCount: reservations.length,
        busiestDays: busiestDays.map(([d, c]) => ({ date: d, count: c })),
        incomeByType: Object.fromEntries(topIncomeType.map(([k, v]) => [k, Math.round(v * 100) / 100])),
        roomCount,
        timeCount,
        suggestions
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `获取经营洞察失败: ${err.message}` }] }
  }
}

module.exports = getInsights
