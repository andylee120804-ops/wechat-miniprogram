/**
 * addIncome - 录入收入记录
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { addDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate, getIncomeTypeText } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

const INCOME_TYPE_MAP = {
  '餐饮': 'dining', '饭': 'dining', '菜': 'dining',
  '棋牌': 'chess', '麻将': 'chess',
  '酒水': 'liquor', '酒': 'liquor', '饮料': 'liquor',
  '茶水': 'teatime', '茶': 'teatime', '茶时': 'teatime',
  '服务': 'service', '服务费': 'service',
  '其他': 'other'
}
const VALID_TYPES = ['dining', 'chess', 'liquor', 'teatime', 'service', 'other']

async function addIncome({ type, amount, date, source, remark }) {
  try {
    if (!hasPermission('income', ACTIONS.ADD)) {
      return { isError: true, content: [{ type: 'text', text: '您没有录入收入的权限' }] }
    }

    // Normalize type — must be explicitly provided
    if (!type || !String(type).trim()) {
      return { isError: true, content: [{ type: 'text', text: '请提供收入类型，可选：餐饮/棋牌/酒水/茶水/服务/其他' }] }
    }
    const rawType = String(type).trim()
    const normalizedType = INCOME_TYPE_MAP[rawType] || rawType
    if (!VALID_TYPES.includes(normalizedType)) {
      return { isError: true, content: [{ type: 'text', text: `无效的收入类型 "${type}"，可选：餐饮/棋牌/酒水/茶水/服务/其他` }] }
    }

    // Amount validation
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      return { isError: true, content: [{ type: 'text', text: '请提供有效的收入金额（必须大于0）' }] }
    }

    // Date validation
    const incomeDate = date || formatDate(new Date())
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(incomeDate)) {
      return { isError: true, content: [{ type: 'text', text: '日期格式不正确，请使用YYYY-MM-DD格式' }] }
    }

    const app = getApp()
    const userInfo = app.globalData.userInfo || {}

    const docData = {
      type: normalizedType,
      amount: numAmount,
      date: incomeDate,
      source: String(source || '').trim() || '手动录入',
      remark: String(remark || '').trim(),
      collectedBy: userInfo._id || '',
      collectedByName: userInfo.name || userInfo.nickName || ''
    }

    const result = await addDoc(COLLECTIONS.INCOME, docData)

    log(LOG_TYPES.INCOME_CREATE, `录入收入(AI): ${getIncomeTypeText(normalizedType)} ${numAmount}元`, { id: result._id })

    const summary = `收入录入成功！${getIncomeTypeText(normalizedType)} | ${numAmount}元 | ${incomeDate}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: result._id,
        type: normalizedType,
        typeName: getIncomeTypeText(normalizedType),
        amount: numAmount,
        date: incomeDate,
        source: docData.source
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `录入收入失败: ${err.message}` }] }
  }
}

module.exports = addIncome
