/**
 * addExpense - 录入一次性支出
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { addDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate, getExpenseCategoryName } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

const CATEGORY_MAP = {
  '工资': 'salary', '薪资': 'salary', '人工': 'salary',
  '房租': 'rent', '租金': 'rent', '铺租': 'rent',
  '水电': 'utilities', '水电费': 'utilities', '水费': 'utilities', '电费': 'utilities',
  '物资': 'supplies', '物料': 'supplies', '用品': 'supplies',
  '其他': 'other'
}
const VALID_CATEGORIES = ['salary', 'rent', 'utilities', 'supplies', 'other']

async function addExpense({ name, amount, date, category, remark }) {
  try {
    if (!hasPermission('expense', ACTIONS.ADD)) {
      return { isError: true, content: [{ type: 'text', text: '您没有录入支出的权限' }] }
    }

    if (!name || !String(name).trim()) {
      return { isError: true, content: [{ type: 'text', text: '请提供支出项目名称' }] }
    }

    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      return { isError: true, content: [{ type: 'text', text: '请提供有效的支出金额（必须大于0）' }] }
    }

    // Normalize category — must be explicitly provided
    if (!category || !String(category).trim()) {
      return { isError: true, content: [{ type: 'text', text: '请提供支出分类，可选：工资/房租/水电/物资/其他' }] }
    }
    const rawCategory = String(category).trim()
    const normalizedCategory = CATEGORY_MAP[rawCategory] || rawCategory
    if (!VALID_CATEGORIES.includes(normalizedCategory)) {
      return { isError: true, content: [{ type: 'text', text: `无效的支出分类 "${category}"，可选：工资/房租/水电/物资/其他` }] }
    }

    const expenseDate = date || formatDate(new Date())
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(expenseDate)) {
      return { isError: true, content: [{ type: 'text', text: '日期格式不正确，请使用YYYY-MM-DD格式' }] }
    }

    const app = getApp()
    const userInfo = app.globalData.userInfo || {}

    const docData = {
      name: String(name).trim(),
      amount: numAmount,
      date: expenseDate,
      category: normalizedCategory,
      remark: String(remark || '').trim(),
      createdBy: userInfo._id || '',
      createdByName: userInfo.name || userInfo.nickName || ''
    }

    const result = await addDoc(COLLECTIONS.EXPENSE, docData)

    log(LOG_TYPES.EXPENSE_CREATE, `录入支出(AI): ${name} ${numAmount}元`, { id: result._id })

    const catName = getExpenseCategoryName(normalizedCategory)
    const summary = `支出录入成功！${name} | ${catName} | ${numAmount}元 | ${expenseDate}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: result._id,
        name: docData.name,
        category: normalizedCategory,
        categoryName: catName,
        amount: numAmount,
        date: expenseDate
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `录入支出失败: ${err.message}` }] }
  }
}

module.exports = addExpense
