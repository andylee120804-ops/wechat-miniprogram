/**
 * addFixedExpense - 添加固定支出项
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { addDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

const VALID_CYCLES = ['monthly', 'yearly']

async function addFixedExpense({ name, amount, cycle, description, startDate, endDate }) {
  try {
    if (!hasPermission('expense', ACTIONS.ADD)) {
      return { isError: true, content: [{ type: 'text', text: '您没有添加固定支出的权限' }] }
    }

    if (!name || !String(name).trim()) {
      return { isError: true, content: [{ type: 'text', text: '请提供支出项目名称' }] }
    }

    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      return { isError: true, content: [{ type: 'text', text: '请提供有效的金额（必须大于0）' }] }
    }

    if (!cycle || !VALID_CYCLES.includes(cycle)) {
      return { isError: true, content: [{ type: 'text', text: '请提供付费周期，可选：monthly(月付)/yearly(年付)' }] }
    }
    const normalizedCycle = cycle
    const monthlyAmount = normalizedCycle === 'yearly' ? Math.round(numAmount / 12 * 100) / 100 : numAmount

    const expenseStartDate = startDate || formatDate(new Date())
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(expenseStartDate)) {
      return { isError: true, content: [{ type: 'text', text: '起始日期格式不正确，请使用YYYY-MM-DD格式' }] }
    }

    if (endDate && !dateRegex.test(endDate)) {
      return { isError: true, content: [{ type: 'text', text: '结束日期格式不正确，请使用YYYY-MM-DD格式' }] }
    }

    if (endDate && expenseStartDate > endDate) {
      return { isError: true, content: [{ type: 'text', text: '起始日期不能晚于结束日期' }] }
    }

    const docData = {
      name: String(name).trim(),
      amount: numAmount,
      cycle: normalizedCycle,
      monthlyAmount,
      description: String(description || '').trim(),
      startDate: expenseStartDate,
      endDate: endDate || '',
      active: true
    }

    const result = await addDoc(COLLECTIONS.FIXED_EXPENSE, docData)

    const cycleLabel = normalizedCycle === 'yearly' ? '年付' : '月付'
    log(LOG_TYPES.EXPENSE_CREATE, `添加固定支出(AI): ${name} ¥${numAmount}/${cycleLabel}`, { id: result._id })

    const summary = `固定支出添加成功！${name} | ¥${numAmount}/${cycleLabel} | 月均¥${monthlyAmount.toFixed(2)}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: result._id,
        name: docData.name,
        amount: numAmount,
        cycle: normalizedCycle,
        cycleLabel,
        monthlyAmount: monthlyAmount,
        startDate: expenseStartDate
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `添加固定支出失败: ${err.message}` }] }
  }
}

module.exports = addFixedExpense
