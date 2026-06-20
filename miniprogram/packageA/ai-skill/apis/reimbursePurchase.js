/**
 * reimbursePurchase - 标记采购已报销
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, updateDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

async function reimbursePurchase({ purchaseId, name }) {
  try {
    if (!hasPermission('purchase', ACTIONS.REIMBURSE)) {
      return { isError: true, content: [{ type: 'text', text: '您没有报销采购的权限' }] }
    }

    let target = null
    const dbInst = require('../../../utils/db').getDb()

    if (purchaseId) {
      try {
        const res = await dbInst.collection(COLLECTIONS.PURCHASE).doc(purchaseId).get()
        target = res.data
      } catch (e) {
        // Try partial ID match
        const { data: matches } = await queryAll(COLLECTIONS.PURCHASE, { status: 'approved' }, 'createdAt', 'desc')
        const found = matches.find(p => p._id.endsWith(purchaseId) || p._id.includes(purchaseId))
        if (!found) {
          return { isError: true, content: [{ type: 'text', text: '未找到该采购记录' }] }
        }
        target = found
      }
    } else if (name) {
      // Find by item name
      const { data: matches } = await queryAll(COLLECTIONS.PURCHASE, { status: 'approved' }, 'createdAt', 'desc')
      const found = matches.filter(p => (p.name || p.item || '').toLowerCase().includes(name.toLowerCase()))
      if (found.length === 0) {
        return { isError: true, content: [{ type: 'text', text: `未找到名称包含"${name}"的已审批采购记录` }] }
      }
      if (found.length > 1) {
        const list = found.slice(0, 5).map(p =>
          `ID:${p._id.slice(-6)} ${p.name || p.item} ${p.amount}元 ${formatDate(p.createdAt)}`
        ).join('\n')
        return {
          isError: true,
          content: [{ type: 'text', text: `找到${found.length}条匹配记录，请指定采购ID：\n${list}` }]
        }
      }
      target = found[0]
    } else {
      // Find the most recent approved purchase
      const { data: approvedList } = await queryAll(COLLECTIONS.PURCHASE, { status: 'approved' }, 'createdAt', 'desc')
      if (approvedList.length === 0) {
        return { isError: true, content: [{ type: 'text', text: '当前没有已审批待报销的采购记录' }] }
      }
      if (approvedList.length > 1) {
        const list = approvedList.slice(0, 5).map(p =>
          `ID:${p._id.slice(-6)} ${p.name || p.item} ${p.amount}元 ${formatDate(p.createdAt)}`
        ).join('\n')
        return {
          isError: true,
          content: [{ type: 'text', text: `有${approvedList.length}条已审批采购，请指定采购ID或名称：\n${list}` }]
        }
      }
      target = approvedList[0]
    }

    if (!target) {
      return { isError: true, content: [{ type: 'text', text: '未找到采购记录' }] }
    }

    if (target.status === 'reimbursed') {
      return { isError: true, content: [{ type: 'text', text: '该采购已报销' }] }
    }

    if (target.status !== 'approved') {
      return { isError: true, content: [{ type: 'text', text: `该采购状态为"${target.status}"，只有已审批的采购才能报销` }] }
    }

    const app = getApp()
    const userInfo = app.globalData.userInfo || {}

    await updateDoc(COLLECTIONS.PURCHASE, target._id, {
      status: 'reimbursed',
      reimbursedBy: userInfo._id || '',
      reimbursedByName: userInfo.name || '',
      reimbursedAt: dbInst.serverDate()
    })

    log(LOG_TYPES.PURCHASE_REIMBURSE, `采购报销(AI): ${target.name || target.item} ${target.amount}元`, { id: target._id })

    const summary = `采购已报销：${target.name || target.item} | ${target.amount}元 | ${formatDate(target.createdAt)}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: target._id,
        name: target.name || target.item || '',
        amount: target.amount || 0,
        category: target.category || '',
        status: 'reimbursed'
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `报销操作失败: ${err.message}` }] }
  }
}

module.exports = reimbursePurchase
