/**
 * getFinanceStats - 经营财务统计云函数（唯一权威计算源）
 *
 * 本函数是经营报表 (pages/admin/dashboard/index.js) 与 AI Skill
 * (packageA/ai-skill/apis/getInsights.js, getMonthlyStats.js) 共用的
 * 财务统计后端。任何口径变更只需修改本函数，前端与 AI 自动一致。
 *
 * 入参：
 *   - startDate: string  周期开始 YYYY-MM-DD
 *   - endDate:   string  周期结束 YYYY-MM-DD
 *   - periodType:string  'week' | 'month' | 'year'（影响固定支出 wholeMonths 折算）
 *
 * 返回：{ success, data: {...} }
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合名（与 miniprogram/utils/db.js COLLECTIONS 保持一致）
const COLLECTIONS = {
  STAFF: 'staff',
  PERMISSIONS: 'permissions',
  PURCHASE: 'purchase',
  INCOME: 'income',
  EXPENSE: 'expense',
  FIXED_EXPENSE: 'fixed_expense',
  STORED_VALUE_ACCOUNT: 'stored_value_account',
  STORED_VALUE_TRANSACTION: 'stored_value_transaction'
}

const ADMIN_ONLY_MODULES = ['staff', 'venueSettings', 'minAmount']
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

exports.main = async (event, context) => {
  const { startDate, endDate, periodType } = event
  if (!startDate || !endDate) {
    return { success: false, message: '缺少 startDate 或 endDate' }
  }
  try {
    const auth = await authorizeDashboardView()
    if (!auth.success) return auth

    const data = await computeFinanceStats(startDate, endDate, periodType || 'month')
    return { success: true, data: data }
  } catch (err) {
    console.error('getFinanceStats错误:', err)
    return { success: false, message: '财务统计失败: ' + (err.message || err) }
  }
}

async function authorizeDashboardView() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext && wxContext.OPENID
  if (!openid) return { success: false, message: '无权限访问财务统计' }

  const staffRes = await db.collection(COLLECTIONS.STAFF)
    .where({ boundOpenid: openid, status: 'active' })
    .limit(1)
    .get()
  const staff = staffRes.data && staffRes.data[0]
  if (!staff) return { success: false, message: '无权限访问财务统计' }
  if (staff.role === 'admin') return { success: true, staff: staff }
  if (staff.role === 'boss' && !ADMIN_ONLY_MODULES.includes('dashboard')) return { success: true, staff: staff }

  const permRes = await db.collection(COLLECTIONS.PERMISSIONS).where({ staffId: staff._id }).get()
  const permissions = permRes.data && permRes.data[0] && permRes.data[0].permissions ? permRes.data[0].permissions : []
  const dashboardPerm = permissions.find(function(perm) { return perm.module === 'dashboard' })
  const actions = dashboardPerm && dashboardPerm.actions ? dashboardPerm.actions : []
  if (actions.includes('view') || actions.includes('*')) return { success: true, staff: staff }

  return { success: false, message: '无权限访问财务统计' }
}

/**
 * 计算指定周期的财务统计。口径与经营报表页面完全一致。
 */
async function computeFinanceStats(startDate, endDate, periodType) {
  const dateFilter = { date: _.gte(startDate).and(_.lte(endDate)) }
  const storedValueTransactionFilter = {
    status: 'active',
    createTime: _.gte(getChinaBusinessDayStart(startDate)).and(_.lte(getChinaBusinessDayEnd(endDate)))
  }

  const [incomeData, purchaseData, expenseData, fixedData, staffData, storedValueTransactions, storedValueAccounts] = await Promise.all([
    fetchAll(COLLECTIONS.INCOME, dateFilter),
    fetchAll(COLLECTIONS.PURCHASE, dateFilter),
    fetchAll(COLLECTIONS.EXPENSE, dateFilter),
    fetchAll(COLLECTIONS.FIXED_EXPENSE, { active: true }),
    fetchAll(COLLECTIONS.STAFF, { status: 'active' }),
    fetchAll(COLLECTIONS.STORED_VALUE_TRANSACTION, storedValueTransactionFilter),
    fetchAll(COLLECTIONS.STORED_VALUE_ACCOUNT, { status: 'active' })
  ])

  // ===== 收入 =====
  let totalIncome = 0
  const incomeByType = {}
  incomeData.forEach(function (item) {
    const amount = Number(item.amount) || 0
    totalIncome += amount
    const type = item.type || 'other'
    incomeByType[type] = (incomeByType[type] || 0) + amount
  })

  // ===== 采购：只算已完成或未付款（reimbursed 或无 status），排除待审批/已拒绝 =====
  let totalPurchase = 0
  const purchaseByCategory = {}
  purchaseData.forEach(function (item) {
    if (!item.status || item.status === 'reimbursed') {
      const amount = Number(item.amount) || 0
      totalPurchase += amount
      const cat = item.category || 'other'
      purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + amount
    }
  })

  // ===== 一次性支出 =====
  let totalExpense = 0
  const expenseByCategory = {}
  expenseData.forEach(function (item) {
    const amount = Number(item.amount) || 0
    totalExpense += amount
    const cat = item.category || 'other'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount
  })

  // ===== 固定支出：新格式 monthlyAmount × wholeMonths + 旧格式按日期匹配 =====
  const dStart = new Date(startDate + 'T00:00:00')
  const dEnd = new Date(endDate + 'T23:59:59')
  const periodDays = (dEnd - dStart) / (1000 * 60 * 60 * 24)
  const periodMonths = periodDays / 30.4375
  let wholeMonths = 1
  if (periodType === 'year') {
    wholeMonths =
      (dEnd.getFullYear() - dStart.getFullYear()) * 12 +
      (dEnd.getMonth() - dStart.getMonth()) + 1
  }

  const fixedByName = {}
  fixedData.forEach(function (item) {
    if (item.monthlyAmount) {
      const monthlyVal = Number(item.monthlyAmount) || 0
      const itemStart = item.startDate || null
      const itemEnd = item.endDate || null
      if (!isFixedExpenseActive(itemStart, itemEnd, startDate, endDate)) return
      const amount = monthlyVal * wholeMonths
      totalExpense += amount
      const name = item.name || '固定成本'
      fixedByName[name] = (fixedByName[name] || 0) + amount
    } else if (item.date && item.date >= startDate && item.date <= endDate) {
      const amount = Number(item.amount || 0)
      totalExpense += amount
      const cat = item.category || 'other'
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount
    }
  })

  // ===== 员工工资：按 hireDate 折算 =====
  let totalSalary = 0
  staffData.forEach(function (item) {
    if (item.hireDate && item.hireDate > endDate) return
    const proratedMonths = calcProratedMonths(item.hireDate, null, startDate, endDate, periodMonths)
    totalSalary += Math.ceil((Number(item.salary) || 0) * proratedMonths)
  })

  // ===== 储值：额外核对指标，不重复计入收入 =====
  const storedValueStats = computeStoredValueStats(storedValueTransactions, storedValueAccounts, startDate, endDate)

  const totalFixed = Object.keys(fixedByName).reduce(function (s, k) { return s + fixedByName[k] }, 0)
  const totalExpenseAll = totalPurchase + totalExpense + totalSalary
  const netProfit = totalIncome - totalExpenseAll

  return {
    totalIncome: totalIncome,
    totalPurchase: totalPurchase,
    totalExpense: totalExpense, // 一次性支出 + 固定支出
    totalFixed: totalFixed,
    totalSalary: totalSalary,
    totalExpenseAll: totalExpenseAll, // 采购 + 支出 + 工资（与报表"总支出"一致）
    netProfit: netProfit,
    incomeByType: incomeByType,
    expenseByCategory: expenseByCategory,
    purchaseByCategory: purchaseByCategory,
    fixedByName: fixedByName,
    storedValueRecharge: storedValueStats.recharge,
    storedValueConsume: storedValueStats.consume,
    storedValueBalance: storedValueStats.balance
  }
}

/**
 * 计算储值统计。流水按查询期间过滤，账户余额为当前 active 余额合计。
 */
function computeStoredValueStats(transactions, accounts, startDate, endDate) {
  const stats = { recharge: 0, consume: 0, balance: 0 }

  transactions.forEach(function (item) {
    if (item.status !== 'active') return
    const itemDate = getStoredValueTransactionDate(item)
    if (!itemDate || itemDate < startDate || itemDate > endDate) return

    const amount = Number(item.amount) || 0
    if (item.type === 'recharge') {
      stats.recharge += amount
    } else if (item.type === 'consume') {
      stats.consume += amount
    }
  })

  accounts.forEach(function (item) {
    if (item.status !== 'active') return
    stats.balance += Number(item.balance) || 0
  })

  return stats
}

function getStoredValueTransactionDate(item) {
  return normalizeBusinessDate(item.date || item.createTime)
}

function normalizeBusinessDate(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10)
    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.getTime())) return formatChinaDate(parsedDate)
    return value.slice(0, 10)
  }
  if (value instanceof Date) return formatChinaDate(value)
  if (typeof value.toDate === 'function') return formatChinaDate(value.toDate())
  return String(value).slice(0, 10)
}

function formatChinaDate(date) {
  const shifted = new Date(date.getTime() + CHINA_TIME_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function getChinaBusinessDayStart(dateText) {
  return new Date(dateText + 'T00:00:00+08:00')
}

function getChinaBusinessDayEnd(dateText) {
  return new Date(dateText + 'T23:59:59.999+08:00')
}

/**
 * 分页查询全部记录，绕过云数据库 100 条限制。
 */
async function fetchAll(collection, where) {
  const MAX = 100
  let all = []
  const countRes = await db.collection(collection).where(where).count()
  const total = countRes.total
  if (total === 0) return []
  const batches = Math.ceil(total / MAX)
  for (let i = 0; i < batches; i++) {
    const res = await db.collection(collection).where(where).skip(i * MAX).limit(MAX).get()
    all = all.concat(res.data)
  }
  return all
}

/**
 * 按实际天数折算月数（用于工资按 hireDate 比例计算）。
 */
function calcProratedMonths(itemStart, itemEnd, periodStart, periodEnd, periodMonths) {
  const pStart = new Date(periodStart + 'T00:00:00')
  const pEnd = new Date(periodEnd + 'T23:59:59')
  const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
  const end = itemEnd ? new Date(itemEnd + 'T23:59:59') : pEnd
  const activeStart = start > pStart ? start : pStart
  const activeEnd = end < pEnd ? end : pEnd
  if (activeStart >= activeEnd) return 0
  const totalDays = (pEnd - pStart) / (1000 * 60 * 60 * 24)
  const activeDays = (activeEnd - activeStart) / (1000 * 60 * 60 * 24)
  return periodMonths * (activeDays / totalDays)
}

/**
 * 判断固定支出在报告周期内是否活跃。
 */
function isFixedExpenseActive(itemStart, itemEnd, periodStart, periodEnd) {
  const pStart = new Date(periodStart + 'T00:00:00')
  const pEnd = new Date(periodEnd + 'T23:59:59')
  const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
  const end = itemEnd ? new Date(itemEnd + 'T23:59:59') : pEnd
  if (end < pStart || start > pEnd) return false
  return true
}
