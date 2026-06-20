/**
 * submitPurchase - 提交采购申请
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { addDoc, COLLECTIONS } = require('../../../utils/db')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { formatDate } = require('../../../utils/helpers')

const CATEGORY_MAP = {
  '肉类': 'meat', '海鲜': 'seafood', '蔬菜': 'vegetable', '水果': 'fruit',
  '饮品': 'drink', '酒水': 'drink', '调味品': 'seasoning', '调料': 'seasoning',
  '日用品': 'supplies', '用品': 'supplies', '设备': 'equipment',
  '宴会菜价': 'banquet', '宴会': 'banquet', '其他': 'other'
}

async function determineApprovalStatus(data) {
  try {
    var app = getApp()
    var userInfo = app.globalData.userInfo || {}
    var rulesRes = await wx.cloud.callFunction({
      name: 'sendMessage',
      data: { action: 'getApprovalSettings', callerWechatId: userInfo.wechatId || '' }
    })
    if (rulesRes.result && rulesRes.result.success && rulesRes.result.data) {
      var rules = rulesRes.result.data
      var needApproval = false
      if (rules.enabled !== false) {
        if (rules.categories && rules.categories[data.category] === true) {
          needApproval = true
          var threshold = Number(rules.amountThreshold) || 0
          if (threshold > 0 && data.amount <= threshold) {
            needApproval = false
          }
        }
      }
      // If the submitter IS the designated approver, skip approval
      if (needApproval && data.purchaseBy === rules.defaultApproverId) {
        needApproval = false
      }
      data.approverName = rules.defaultApproverName || ''
      data.approverId = rules.defaultApproverId || ''
      if (needApproval) {
        data.status = 'pending'
      }
    }
  } catch (e) {
    console.warn('[submitPurchase] 获取审批设置失败，默认通过:', e)
  }
  return data
}

/**
 * 查找可关联的预约（宴会菜价专用）
 * 返回未关联 banquet 采购的 confirmed 预约
 */
async function findAvailableReservation() {
  const db = require('../../../utils/db')
  const _db = db.getDb()
  const _ = _db.command

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const todayStr = formatDate(now)

  // 查询 settings 获取启用日期
  const settingsRes = await db.queryAll(COLLECTIONS.SETTINGS, {})
  const settings = {}
  ;(settingsRes.data || []).forEach(function(s) { if (!(s.key in settings)) settings[s.key] = s.value })
  const enabledDate = settings.serviceChargeEnabledDate
  if (!enabledDate) return null

  const enabledDateObj = new Date(enabledDate + 'T00:00:00')
  const startDate = enabledDateObj > thirtyDaysAgo ? enabledDateObj : thirtyDaysAgo
  const endDate = new Date(todayStr + 'T23:59:59')

  const resvRes = await db.queryAll(COLLECTIONS.RESERVATION, {
    date: _.gte(startDate).and(_.lte(endDate)),
    status: 'confirmed'
  })
  const allReservations = resvRes.data || []
  if (allReservations.length === 0) return null

  // 排除已关联 banquet 采购的预约
  const allIds = allReservations.map(function(r) { return r._id })
  let linkedIds = new Set()
  if (allIds.length > 0) {
    const linkedRes = await db.queryAll(COLLECTIONS.PURCHASE, {
      sourceReservationId: _.in(allIds),
      category: 'banquet'
    })
    ;(linkedRes.data || []).forEach(function(p) { linkedIds.add(p.sourceReservationId) })
  }

  const available = allReservations.filter(function(r) {
    return !linkedIds.has(r._id)
  })

  if (available.length === 0) return null
  // 返回最近日期的预约
  available.sort(function(a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime() })
  return available[0]
}

async function submitPurchase({ name, category, amount, quantity, unit, remark, reservationId }) {
  try {
    if (!hasPermission('purchase', ACTIONS.ADD)) {
      return { isError: true, content: [{ type: 'text', text: '您没有提交采购申请的权限' }] }
    }

    if (!name) {
      return { isError: true, content: [{ type: 'text', text: '请提供采购物品名称' }] }
    }
    if (!amount || Number(amount) <= 0) {
      return { isError: true, content: [{ type: 'text', text: '请提供有效的采购金额' }] }
    }

    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const normalizedCategory = CATEGORY_MAP[category] || category || 'other'

    // 宴会菜价必须关联预约
    let sourceReservationId = reservationId || ''
    if (normalizedCategory === 'banquet' && !sourceReservationId) {
      const reservation = await findAvailableReservation()
      if (!reservation) {
        return { isError: true, content: [{ type: 'text', text: '宴会菜价必须关联预约，但当前没有可关联的预约（无已确认预约或所有预约已关联采购）' }] }
      }
      sourceReservationId = reservation._id
    }

    const docData = {
      name: String(name).trim(),
      item: String(name).trim(),
      category: normalizedCategory,
      amount: Number(amount),
      quantity: Number(quantity) || 1,
      unit: String(unit || '').trim() || '份',
      remark: String(remark || '').trim(),
      sourceReservationId: sourceReservationId,
      status: 'approved',
      purchaseBy: userInfo._id || '',
      purchaseByName: userInfo.name || userInfo.nickName || '',
      date: formatDate(new Date())
    }

    if (!docData.purchaseBy) {
      delete docData.purchaseBy
      delete docData.purchaseByName
    }

    // Apply approval rules (aligned with purchase-add page logic)
    const processedData = await determineApprovalStatus(docData)

    const result = await addDoc(COLLECTIONS.PURCHASE, processedData)

    const statusText = processedData.status === 'pending' ? '待审批' : '已自动批复'
    const resvInfo = sourceReservationId ? '（已关联预约）' : ''
    const summary = `采购申请已提交：${name} | ${category || '其他'} | ${amount}元 | ${statusText}${resvInfo}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: result._id,
        name: processedData.name,
        category: normalizedCategory,
        amount: processedData.amount,
        status: processedData.status,
        purchaseByName: processedData.purchaseByName,
        sourceReservationId: sourceReservationId
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `提交采购失败: ${err.message}` }] }
  }
}

module.exports = submitPurchase
