/**
 * index.js - SKILL 入口，注册所有 Atomic API 和中间件
 */
const getReservations = require('./apis/getReservations')
const checkAvailability = require('./apis/checkAvailability')
const getTodaySummary = require('./apis/getTodaySummary')
const getMonthlyStats = require('./apis/getMonthlyStats')
const createReservation = require('./apis/createReservation')
const cancelReservation = require('./apis/cancelReservation')
const updateReservationStatus = require('./apis/updateReservationStatus')
const getCustomerInfo = require('./apis/getCustomerInfo')
const getIncomeDetail = require('./apis/getIncomeDetail')
const addIncome = require('./apis/addIncome')
const getExpenseDetail = require('./apis/getExpenseDetail')
const addExpense = require('./apis/addExpense')
const addFixedExpense = require('./apis/addFixedExpense')
const getPurchaseStatus = require('./apis/getPurchaseStatus')
const submitPurchase = require('./apis/submitPurchase')
const approvePurchase = require('./apis/approvePurchase')
const reimbursePurchase = require('./apis/reimbursePurchase')
const getAttendance = require('./apis/getAttendance')
const getInsights = require('./apis/getInsights')

// 创建 SKILL 实例
const skill = wx.modelContext.createSkill('/packageA/ai-skill')

// 注册所有 Atomic API
skill.registerAPI('getReservations', getReservations)
skill.registerAPI('checkAvailability', checkAvailability)
skill.registerAPI('getTodaySummary', getTodaySummary)
skill.registerAPI('getMonthlyStats', getMonthlyStats)
skill.registerAPI('createReservation', createReservation)
skill.registerAPI('cancelReservation', cancelReservation)
skill.registerAPI('updateReservationStatus', updateReservationStatus)
skill.registerAPI('getCustomerInfo', getCustomerInfo)
skill.registerAPI('getIncomeDetail', getIncomeDetail)
skill.registerAPI('addIncome', addIncome)
skill.registerAPI('getExpenseDetail', getExpenseDetail)
skill.registerAPI('addExpense', addExpense)
skill.registerAPI('addFixedExpense', addFixedExpense)
skill.registerAPI('getPurchaseStatus', getPurchaseStatus)
skill.registerAPI('submitPurchase', submitPurchase)
skill.registerAPI('approvePurchase', approvePurchase)
skill.registerAPI('reimbursePurchase', reimbursePurchase)
skill.registerAPI('getAttendance', getAttendance)
skill.registerAPI('getInsights', getInsights)

// 权限校验中间件：确保用户已登录
skill.use(async (ctx, next) => {
  const app = getApp()
  if (!app || !app.globalData.isLogin) {
    return {
      isError: true,
      content: [{ type: 'text', text: '请先登录后再使用此功能' }]
    }
  }
  await next()
})

// API 级权限映射表
const API_PERMISSIONS = {
  getReservations:        { module: 'reservation', action: 'view' },
  checkAvailability:      { module: 'reservation', action: 'view' },
  getCustomerInfo:        { module: 'reservation', action: 'view' },
  createReservation:      { module: 'reservation', action: 'add' },
  cancelReservation:      { module: 'reservation', action: 'edit' },
  updateReservationStatus:{ module: 'reservation', action: 'edit' },
  getTodaySummary:        { module: 'dashboard', action: 'view' },
  getMonthlyStats:        { module: 'dashboard', action: 'view' },
  getInsights:            { module: 'dashboard', action: 'view' },
  getIncomeDetail:        { module: 'income', action: 'view' },
  addIncome:              { module: 'income', action: 'add' },
  getExpenseDetail:       { module: 'expense', action: 'view' },
  addExpense:             { module: 'expense', action: 'add' },
  addFixedExpense:        { module: 'expense', action: 'add' },
  getPurchaseStatus:      { module: 'purchase', action: 'view' },
  submitPurchase:         { module: 'purchase', action: 'add' },
  approvePurchase:        { module: 'purchase', action: 'approve' },
  reimbursePurchase:      { module: 'purchase', action: 'reimburse' },
  getAttendance:          { module: 'attendance', action: 'view' }
}

// 权限中间件：每个 API 在执行前校验模块+操作权限
const { hasPermission } = require('../../utils/permission')
skill.use(async (ctx, next) => {
  const perm = API_PERMISSIONS[ctx.name]
  if (perm && !hasPermission(perm.module, perm.action)) {
    const actionLabels = {
      view: '查看', add: '新增', edit: '编辑', delete: '删除', approve: '审批', reimburse: '报销'
    }
    const label = actionLabels[perm.action] || perm.action
    return {
      isError: true,
      content: [{ type: 'text', text: `您没有${label}该功能的权限，请联系管理员` }]
    }
  }
  await next()
})

// 日志中间件：记录 API 调用
skill.use(async (ctx, next) => {
  const start = Date.now()
  try {
    await next()
    console.log(`[AI-Skill] ${ctx.name} OK ${Date.now() - start}ms`)
  } catch (err) {
    console.error(`[AI-Skill] ${ctx.name} FAIL ${Date.now() - start}ms:`, err)
    return {
      isError: true,
      content: [{ type: 'text', text: '操作执行失败，请稍后重试' }]
    }
  }
})
