const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTIONS = {
  STAFF: 'staff',
  PURCHASE: 'purchase',
  INCOME: 'income',
  EXPENSE: 'expense',
  FIXED_EXPENSE: 'fixed_expense'
}

const INCOME_TYPE_TEXT = {
  meal: '餐费',
  room: '包厢费',
  service: '服务费',
  other: '其他'
}

const PURCHASE_CATEGORY_TEXT = {
  meat: '肉类',
  seafood: '海鲜',
  vegetable: '蔬菜',
  fruit: '水果',
  drink: '酒水',
  seasoning: '调料',
  supplies: '用品',
  equipment: '设备',
  other: '其他'
}

const EXPENSE_CATEGORY_TEXT = {
  salary: '工资',
  rent: '租金',
  utilities: '水电',
  supplies: '用品',
  other: '其他'
}

const ROLE_TEXT = {
  boss: '老板',
  admin: '管理员',
  chef: '厨师',
  waiter: '服务员',
  purchase: '采购主管'
}

function safeCell(value) {
  if (typeof value !== 'string') return value
  if (/^[=+\-@\t\r]/.test(value)) return "'" + value
  return value
}

function safeRows(rows) {
  return rows.map(function(row) {
    return row.map(safeCell)
  })
}

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildExcelHtml(rows) {
  const body = safeRows(rows).map(function(row) {
    return '<tr>' + row.map(function(cell) {
      return '<td style="mso-number-format:\\@">' + escapeHtml(cell) + '</td>'
    }).join('') + '</tr>'
  }).join('')
  return '<html><head><meta charset="UTF-8"></head><body><table>' + body + '</table></body></html>'
}

function formatDate(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0')
  }
  return String(value).split('T')[0]
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

async function fetchAll(collection, where) {
  const MAX = 100
  let all = []
  const countRes = await db.collection(collection).where(where).count()
  const total = countRes.total || 0
  const batches = Math.ceil(total / MAX)
  for (let i = 0; i < batches; i++) {
    const res = await db.collection(collection).where(where).skip(i * MAX).limit(MAX).get()
    all = all.concat(res.data || [])
  }
  return all
}

function calcProratedMonths(itemStart, periodStart, periodEnd, periodMonths) {
  const pStart = new Date(periodStart + 'T00:00:00')
  const pEnd = new Date(periodEnd + 'T23:59:59')
  const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
  const activeStart = start > pStart ? start : pStart
  if (activeStart >= pEnd) return 0
  const totalDays = (pEnd - pStart) / 86400000
  const activeDays = (pEnd - activeStart) / 86400000
  return periodMonths * (activeDays / totalDays)
}

function isFixedExpenseActive(itemStart, itemEnd, periodStart, periodEnd) {
  const pStart = new Date(periodStart + 'T00:00:00')
  const pEnd = new Date(periodEnd + 'T23:59:59')
  const start = itemStart ? new Date(itemStart + 'T00:00:00') : pStart
  const end = itemEnd ? new Date(itemEnd + 'T23:59:59') : pEnd
  if (end < pStart || start > pEnd) return false
  return true
}

async function buildReportData(input) {
  const startDate = input.startDate
  const endDate = input.endDate
  const periodType = input.periodType || 'month'
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    throw new Error('日期范围无效')
  }

  const dateFilter = { date: _.gte(startDate).and(_.lte(endDate)) }
  const results = await Promise.all([
    fetchAll(COLLECTIONS.INCOME, dateFilter),
    fetchAll(COLLECTIONS.PURCHASE, dateFilter),
    fetchAll(COLLECTIONS.EXPENSE, dateFilter),
    fetchAll(COLLECTIONS.FIXED_EXPENSE, { active: true }),
    fetchAll(COLLECTIONS.STAFF, { status: 'active' })
  ])

  const incomeData = results[0]
  const purchaseData = results[1]
  const expenseData = results[2]
  const fixedExpenseData = results[3]
  const staffData = results[4]
  const dStart = new Date(startDate + 'T00:00:00')
  const dEnd = new Date(endDate + 'T23:59:59')
  const periodDays = (dEnd - dStart) / 86400000
  const periodMonths = periodDays / 30.4375
  let wholeMonths = 1
  if (periodType === 'year') {
    wholeMonths = (dEnd.getFullYear() - dStart.getFullYear()) * 12 + (dEnd.getMonth() - dStart.getMonth()) + 1
  }

  let totalIncome = 0
  const incomeItems = incomeData.map(function(item) {
    totalIncome += Number(item.amount) || 0
    return {
      date: formatDate(item.date),
      type: INCOME_TYPE_TEXT[item.type] || item.type || '其他',
      source: item.source || '',
      amount: (Number(item.amount) || 0).toFixed(2),
      collectedByName: item.collectedByName || '',
      remark: item.remark || ''
    }
  })

  let totalPurchase = 0
  const approvalStatusMap = { pending: '待审批', approved: '未付款', reimbursed: '已完成', rejected: '已拒绝' }
  const purchaseItems = purchaseData.map(function(item) {
    if (!item.status || item.status === 'reimbursed') totalPurchase += Number(item.amount) || 0
    return {
      date: formatDate(item.date),
      item: item.item || '',
      category: PURCHASE_CATEGORY_TEXT[item.category] || item.category || '其他',
      amount: (Number(item.amount) || 0).toFixed(2),
      purchaseByName: item.purchaseByName || '',
      status: approvalStatusMap[item.status] || item.status || '',
      remark: item.remark || ''
    }
  })

  let totalDailyExpense = 0
  const expenseItems = expenseData.map(function(item) {
    totalDailyExpense += Number(item.amount) || 0
    return {
      date: formatDate(item.date),
      category: EXPENSE_CATEGORY_TEXT[item.category] || item.category || '其他',
      name: item.name || '',
      amount: (Number(item.amount) || 0).toFixed(2),
      remark: item.remark || ''
    }
  })

  let totalFixedExpense = 0
  const fixedItems = []
  fixedExpenseData.forEach(function(item) {
    if (item.monthlyAmount) {
      const monthlyVal = Number(item.monthlyAmount) || 0
      if (!isFixedExpenseActive(item.startDate || null, item.endDate || null, startDate, endDate)) return
      const amount = monthlyVal * wholeMonths
      totalFixedExpense += amount
      fixedItems.push({
        name: item.name || '固定成本',
        monthlyAmount: monthlyVal.toFixed(2),
        periodAmount: amount.toFixed(2),
        startDate: item.startDate || '',
        endDate: item.endDate || ''
      })
    } else if (item.date && item.date >= startDate && item.date <= endDate) {
      const amount = Number(item.amount || 0)
      totalFixedExpense += amount
      expenseItems.push({
        date: formatDate(item.date),
        category: EXPENSE_CATEGORY_TEXT[item.category] || item.category || '其他',
        name: item.name || '',
        amount: amount.toFixed(2),
        remark: item.remark || ''
      })
    }
  })

  let totalSalary = 0
  const salaryItems = staffData.map(function(item) {
    if (item.hireDate && item.hireDate > endDate) return null
    const proratedMonths = calcProratedMonths(item.hireDate, startDate, endDate, periodMonths)
    const salary = Math.ceil((Number(item.salary) || 0) * proratedMonths)
    totalSalary += salary
    return {
      name: item.name || '员工',
      role: ROLE_TEXT[item.role] || item.role || '',
      monthlySalary: (Number(item.salary) || 0).toFixed(2),
      periodSalary: salary.toFixed(2),
      hireDate: item.hireDate || ''
    }
  }).filter(Boolean)

  const totalExpenseAll = totalPurchase + totalDailyExpense + totalFixedExpense + totalSalary
  const profit = totalIncome - totalExpenseAll

  return {
    periodLabel: input.periodLabel || '',
    startDate: startDate,
    endDate: endDate,
    totalIncome: totalIncome.toFixed(2),
    totalPurchase: totalPurchase.toFixed(2),
    totalExpense: totalDailyExpense.toFixed(2),
    totalFixedExpense: totalFixedExpense.toFixed(2),
    totalSalary: totalSalary.toFixed(2),
    totalExpenseAll: totalExpenseAll.toFixed(2),
    profit: profit.toFixed(2),
    incomeItems: incomeItems,
    purchaseItems: purchaseItems,
    expenseItems: expenseItems,
    fixedItems: fixedItems,
    salaryItems: salaryItems
  }
}

async function authorizeDashboardView() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext && wxContext.OPENID
  if (!openid) return { success: false, message: '无权限导出报表' }

  const staffRes = await db.collection('staff')
    .where({ boundOpenid: openid, status: 'active' })
    .limit(1)
    .get()
  const staff = staffRes.data && staffRes.data[0]
  if (!staff || (staff.role !== 'admin' && staff.role !== 'boss')) return { success: false, message: '无权限导出报表' }
  return { success: true, staff: staff }
}

exports.main = async (event, context) => {
  try {
    const auth = await authorizeDashboardView()
    if (!auth.success) return auth
    const reportData = await buildReportData(event || {})

    // ============ Single Sheet: 经营报表 ============
    const rows = []

    // --- 汇总 ---
    rows.push(['经营报表 - ' + (reportData.periodLabel || '')])
    rows.push(['日期范围', reportData.startDate + ' ~ ' + reportData.endDate])
    rows.push([])
    rows.push(['项目', '金额'])
    rows.push(['总收入', reportData.totalIncome])
    rows.push(['总支出', reportData.totalExpenseAll])
    rows.push(['净利润', reportData.profit])
    rows.push([])
    rows.push(['支出构成', '金额'])
    rows.push(['采购', reportData.totalPurchase])
    rows.push(['日常支出', reportData.totalExpense])
    rows.push(['工资', reportData.totalSalary])
    rows.push(['固定支出', reportData.totalFixedExpense])
    rows.push([])

    // --- 收入明细 ---
    rows.push(['【收入明细】'])
    rows.push(['日期', '类型', '来源', '金额', '收款人', '备注'])
    ;(reportData.incomeItems || []).forEach(function(item) {
      rows.push([item.date, item.type, item.source, item.amount, item.collectedByName, item.remark])
    })
    rows.push(['', '', '合计', reportData.totalIncome, '', ''])
    rows.push([])

    // --- 采购明细 ---
    rows.push(['【采购明细】'])
    rows.push(['日期', '品名', '类别', '金额', '采购人', '状态', '备注'])
    ;(reportData.purchaseItems || []).forEach(function(item) {
      rows.push([item.date, item.item, item.category, item.amount, item.purchaseByName, item.status, item.remark])
    })
    rows.push(['', '', '合计', reportData.totalPurchase, '', '', ''])
    rows.push([])

    // --- 支出明细 ---
    rows.push(['【支出明细】'])
    rows.push(['日期', '类别', '名称', '金额', '备注'])
    ;(reportData.expenseItems || []).forEach(function(item) {
      rows.push([item.date, item.category, item.name, item.amount, item.remark])
    })

    // 固定支出
    const fixedItems = reportData.fixedItems || []
    if (fixedItems.length > 0) {
      rows.push([])
      rows.push(['--- 固定支出明细 ---'])
      rows.push(['项目名称', '月均金额', '期间金额', '起始日期', '结束日期'])
      fixedItems.forEach(function(fi) {
        rows.push([fi.name, fi.monthlyAmount, fi.periodAmount, fi.startDate, fi.endDate])
      })
      rows.push(['小计', '', reportData.totalFixedExpense])
    }

    // 工资
    const salaryItems = reportData.salaryItems || []
    if (salaryItems.length > 0) {
      rows.push([])
      rows.push(['--- 工资明细 ---'])
      rows.push(['员工姓名', '职位', '月薪', '期间工资', '入职日期'])
      salaryItems.forEach(function(si) {
        rows.push([si.name, si.role, si.monthlySalary, si.periodSalary, si.hireDate])
      })
      rows.push(['小计', '', '', reportData.totalSalary])
    }

    rows.push([])
    rows.push(['支出合计', '', '', reportData.totalExpenseAll])

    // ============ Generate Excel-compatible HTML buffer ============
    const buf = Buffer.from(buildExcelHtml(rows), 'utf8')

    // Upload to cloud storage
    const fileName = '经营报表_' + reportData.startDate + '_' + reportData.endDate + '.xls'
    const cloudPath = 'exports/' + fileName
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buf
    })

    // Get temporary download URL
    const urlRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    })

    const url = urlRes.fileList[0].tempFileURL

    return {
      success: true,
      fileID: uploadRes.fileID,
      url: url,
      fileName: fileName
    }
  } catch (err) {
    console.error('exportReportXlsx错误:', err)
    return { success: false, message: '导出失败: ' + (err.message || err) }
  }
}
