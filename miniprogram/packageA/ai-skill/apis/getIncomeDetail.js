/**
 * getIncomeDetail - 查询收入明细
 * Atomic API for WeChat Mini Program AI SKILL
 * 总额数据调用云函数 getFinanceStats（与经营报表同源），明细列表本地查询
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount, getMonthRange } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getIncomeDetail({ date, month, type }) {
  try {
    if (!hasPermission('income', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看收入数据的权限' }] }
    }

    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command
    let where = {}
    let startDate, endDate

    if (date) {
      where.date = date
      startDate = endDate = date
    } else if (month) {
      const [y, m] = month.split('-')
      startDate = `${y}-${m}-01`
      endDate = `${y}-${m}-${new Date(parseInt(y), parseInt(m), 0).getDate()}`
      where.date = _.gte(startDate).and(_.lte(endDate))
    } else {
      const range = getMonthRange(0)
      startDate = range.start
      endDate = range.end
      where.date = _.gte(startDate).and(_.lte(endDate))
    }

    if (type) {
      const typeMap = { '餐饮': 'dining', '棋牌': 'chess', '酒水': 'liquor', '茶时': 'teatime', '服务': 'service', '其他': 'other' }
      where.type = typeMap[type] || type
    }

    // 明细列表本地查询（展示具体记录）
    const { data: incomes } = await queryAll(COLLECTIONS.INCOME, where, 'date', 'desc')

    // 总额数据调用云函数（与经营报表同源）
    const financeRes = await wx.cloud.callFunction({
      name: 'getFinanceStats',
      data: { startDate, endDate, periodType: date ? 'day' : 'month' }
    })
    const fResult = financeRes.result
    const finance = (fResult && fResult.success && fResult.data) ? fResult.data : null

    const period = date || month || getMonthRange(0).monthStr

    if (finance) {
      const byType = finance.incomeByType || {}
      const typeBreakdown = Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([t, a]) => `${t}: ${formatAmount(a)}元`)
        .join(', ')

      const summary = `${period} 收入总计 ${formatAmount(finance.totalIncome)}元（经营报表口径），分类：${typeBreakdown || '暂无'}`
      return {
        isError: false,
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          period,
          totalAmount: Math.round(finance.totalIncome * 100) / 100,
          byType: Object.fromEntries(
            Object.entries(byType).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          count: incomes.length,
          recentIncomes: incomes.slice(0, 10).map(i => ({
            date: formatDate(i.date),
            type: i.type || '',
            amount: i.amount || 0,
            description: i.description || i.remark || ''
          }))
        }
      }
    }

    // 云函数失败降级：本地 reduce（收入口径本身一致：无 status 过滤）
    const totalAmount = incomes.reduce((s, i) => s + (i.amount || 0), 0)
    const byType = {}
    incomes.forEach(i => {
      const t = i.type || 'other'
      byType[t] = (byType[t] || 0) + (i.amount || 0)
    })
    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([t, a]) => `${t}: ${formatAmount(a)}元`)
      .join(', ')

    const summary = `${period} 收入总计 ${formatAmount(totalAmount)}元，分类：${typeBreakdown || '暂无'}（⚠️降级数据）`
    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        period,
        totalAmount: Math.round(totalAmount * 100) / 100,
        count: incomes.length,
        byType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        recentIncomes: incomes.slice(0, 10).map(i => ({
          date: formatDate(i.date),
          type: i.type || '',
          amount: i.amount || 0,
          description: i.description || i.remark || ''
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询收入失败: ${err.message}` }] }
  }
}

module.exports = getIncomeDetail
