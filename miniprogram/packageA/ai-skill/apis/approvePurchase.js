/**
 * approvePurchase - 审批采购申请
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, updateDoc, addDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function approvePurchase({ purchaseId, action, remark }) {
  try {
    // action: 'approve' or 'reject'
    const approvalAction = action === 'reject' ? 'reject' : 'approve'

    if (!hasPermission('purchase', ACTIONS.APPROVE)) {
      return { isError: true, content: [{ type: 'text', text: '您没有审批采购的权限' }] }
    }

    if (!purchaseId) {
      // Find the most recent pending purchase
      const { data: pendingList } = await queryAll(COLLECTIONS.PURCHASE, { status: 'pending' }, 'createdAt', 'desc')
      if (pendingList.length === 0) {
        return { isError: true, content: [{ type: 'text', text: '当前没有待审批的采购申请' }] }
      }
      if (pendingList.length > 1) {
        const list = pendingList.slice(0, 5).map(p =>
          `ID:${p._id.slice(-6)} ${p.name || p.item} ${p.amount}元 ${p.purchaseByName || ''}`
        ).join('\n')
        return {
          isError: true,
          content: [{ type: 'text', text: `有${pendingList.length}条待审批，请指定采购ID：\n${list}` }]
        }
      }
      purchaseId = pendingList[0]._id
    }

    // Find the purchase
    const dbInst = require('../../../utils/db').getDb()
    let purchase
    try {
      const res = await dbInst.collection(COLLECTIONS.PURCHASE).doc(purchaseId).get()
      purchase = res.data
    } catch (e) {
      // Try partial ID match
      const { data: matches } = await queryAll(COLLECTIONS.PURCHASE, { status: 'pending' }, 'createdAt', 'desc')
      const found = matches.find(p => p._id.endsWith(purchaseId) || p._id.includes(purchaseId))
      if (!found) {
        return { isError: true, content: [{ type: 'text', text: '未找到该采购记录' }] }
      }
      purchase = found
      purchaseId = found._id
    }

    if (purchase.status !== 'pending') {
      return { isError: true, content: [{ type: 'text', text: `该采购单状态为"${purchase.status}"，无法审批` }] }
    }

    const newStatus = approvalAction === 'approve' ? 'approved' : 'rejected'
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}

    await updateDoc(COLLECTIONS.PURCHASE, purchaseId, { status: newStatus })

    // Log the approval
    await addDoc(COLLECTIONS.APPROVAL_LOG, {
      purchaseId,
      action: approvalAction,
      approverId: userInfo._id || '',
      approverName: userInfo.name || '',
      remark: String(remark || '').trim()
    })

    const statusText = approvalAction === 'approve' ? '已批准' : '已拒绝'
    const summary = `采购${statusText}：${purchase.name || purchase.item} | ${purchase.amount}元`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: purchaseId,
        name: purchase.name || purchase.item || '',
        amount: purchase.amount || 0,
        status: newStatus,
        purchaseByName: purchase.purchaseByName || ''
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `审批操作失败: ${err.message}` }] }
  }
}

module.exports = approvePurchase
