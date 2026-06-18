/**
 * getExpenseDetail - 查询支出明细
 * Atomic API for WeChat Mini Program AI SKILL
 * 总额数据调用云函数 getFinanceStats（与经营报表同源），明细列表本地查询
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount, getMonthRange } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getExpenseDetail({ date, month, category }) {
  try {
    if (!hasPermission('expense', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看支出数据的权限' }] }
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

    if (category) {
      where.category = category
    }

    // 明细列表本地查询（展示具体记录）
    const { data: expenses } = await queryAll(COLLECTIONS.EXPENSE, where, 'date', 'desc')
    const localTotalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    const localByCategory = {}
    expenses.forEach(e => {
      const cat = e.category || '其他'
      localByCategory[cat] = (localByCategory[cat] || 0) + (e.amount || 0)
    })

    // 总额数据调用云函数（与经营报表同源）
    const financeRes = await wx.cloud.callFunction({
      name: 'getFinanceStats',
      data: { startDate, endDate, periodType: date ? 'day' : 'month' }
    })
    const fResult = financeRes.result
    const finance = (fResult && fResult.success && fResult.data) ? fResult.data : null

    const period = date || month || getMonthRange(0).monthStr

    if (finance) {
      // 云函数口径：totalExpense = 一次性支出 + 固定支出；totalFixed = 固定支出月折算
      const catBreakdown = Object.entries(finance.expenseByCategory || localByCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([c, a]) => `${c}: ${formatAmount(a)}元`)
        .join(', ')

      const summary = `${period} 运营支出 ${formatAmount(finance.totalExpense)}元（含固定支出${formatAmount(finance.totalFixed)}元）${catBreakdown ? '，分类：' + catBreakdown : ''}`
      return {
        isError: false,
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          period,
          // 经营报表口径
          totalExpense: Math.round(finance.totalExpense * 100) / 100,
          totalFixed: Math.round(finance.totalFixed * 100) / 100,
          expenseByCategory: Object.fromEntries(
            Object.entries(finance.expenseByCategory || {}).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          count: expenses.length,
          recentExpenses: expenses.slice(0, 10).map(e => ({
            date: formatDate(e.date),
            category: e.category || '',
            amount: e.amount || 0,
            description: e.description || e.remark || ''
          }))
        }
      }
    }

    // 云函数失败降级
    const catBreakdown = Object.entries(localByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([c, a]) => `${c}: ${formatAmount(a)}元`)
      .join(', ')

    const summary = `${period} 一次性支出 ${formatAmount(localTotalExpense)}元（${catBreakdown || '暂无'}）⚠️固定支出和工资未计入，请查看经营报表获取准确数据`
    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        period,
        totalExpense: Math.round(localTotalExpense * 100) / 100,
        totalFixed: 0,
        _warning: '降级数据，固定支出未计入',
        count: expenses.length,
        byCategory: Object.fromEntries(
          Object.entries(localByCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        recentExpenses: expenses.slice(0, 10).map(e => ({
          date: formatDate(e.date),
          category: e.category || '',
          amount: e.amount || 0,
          description: e.description || e.remark || ''
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询支出失败: ${err.message}` }] }
  }
}

module.exports = getExpenseDetail
