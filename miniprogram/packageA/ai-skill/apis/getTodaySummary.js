/**
 * getTodaySummary - 获取今日经营概览
 * Atomic API for WeChat Mini Program AI SKILL
 * 财务数据调用云函数 getFinanceStats（与经营报表同源）
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getTodaySummary() {
  try {
    if (!hasPermission('dashboard', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看经营概览的权限' }] }
    }

    const today = formatDate(new Date())
    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command

    // RESERVATION.date is Date object
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date()
    dayEnd.setHours(23, 59, 59, 999)
    const resDateFilter = { date: _.gte(dayStart).and(_.lte(dayEnd)) }

    // 预约数据本地查询（非财务数据，不存在口径差异）
    const resResult = await queryAll(COLLECTIONS.RESERVATION, { ...resDateFilter, status: _.neq('cancelled') })
    const reservationCount = resResult.total

    // Room stats
    const roomStats = {}
    for (const r of resResult.data) {
      const room = r.roomName || '未指定'
      roomStats[room] = (roomStats[room] || 0) + 1
    }

    // 财务数据调用云函数（与经营报表同源，避免口径差异）
    const financeRes = await wx.cloud.callFunction({
      name: 'getFinanceStats',
      data: { startDate: today, endDate: today, periodType: 'day' }
    })
    const fResult = financeRes.result

    if (fResult && fResult.success && fResult.data) {
      const f = fResult.data
      const summary = `今日${today}：${reservationCount}个预约，收入¥${formatAmount(f.totalIncome)}，总支出（含采购+运营+工资）¥${formatAmount(f.totalExpenseAll)}，净利润¥${formatAmount(f.netProfit)}${f.netProfit > 0 ? ' ✅' : ' ⚠️'}`
      return {
        isError: false,
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          date: today,
          reservationCount,
          totalIncome: Math.round(f.totalIncome * 100) / 100,
          totalExpenseAll: Math.round(f.totalExpenseAll * 100) / 100,
          totalPurchase: Math.round(f.totalPurchase * 100) / 100,
          operationExpense: Math.round(f.totalExpense * 100) / 100,
          totalFixed: Math.round(f.totalFixed * 100) / 100,
          totalSalary: Math.round(f.totalSalary * 100) / 100,
          netProfit: Math.round(f.netProfit * 100) / 100,
          roomStats,
          incomeByType: Object.fromEntries(
            Object.entries(f.incomeByType || {}).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          expenseByCategory: Object.fromEntries(
            Object.entries(f.expenseByCategory || {}).map(([k, v]) => [k, Math.round(v * 100) / 100])
          )
        }
      }
    }

    // 云函数失败降级：只展示预约数据，财务数据标注不可用
    return {
      isError: false,
      content: [{ type: 'text', text: `今日${today}：${reservationCount}个预约。⚠️财务数据暂不可用，请查看经营报表获取准确数据` }],
      structuredContent: {
        date: today,
        reservationCount,
        financeUnavailable: true,
        roomStats
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `获取今日概览失败: ${err.message}` }] }
  }
}

module.exports = getTodaySummary
