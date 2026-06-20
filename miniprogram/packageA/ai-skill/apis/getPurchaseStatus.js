/**
 * getPurchaseStatus - 查询采购状态
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getPurchaseStatus({ status, category, limit }) {
  try {
    if (!hasPermission('purchase', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看采购记录的权限' }] }
    }

    const where = {}
    if (status) {
      const statusMap = { '待审批': 'pending', '已审批': 'approved', '已批准': 'approved', '已拒绝': 'rejected', '已报销': 'reimbursed' }
      where.status = statusMap[status] || status
    }
    if (category) {
      where.category = category
    }

    const maxLimit = Math.min(Number(limit) || 10, 20)
    const { data: purchases, total } = await queryAll(COLLECTIONS.PURCHASE, where, 'createdAt', 'desc')
    const list = purchases.slice(0, maxLimit)

    const totalAmount = list.reduce((s, p) => s + (p.amount || 0), 0)

    const statusLabel = status || '全部'
    const purchaseList = list.map(p =>
      `${formatDate(p.createdAt)} ${p.name || p.item || ''} ${p.category || ''} ${formatAmount(p.amount)}元 ${p.status === 'approved' ? '✓已审批' : p.status === 'pending' ? '⏳待审批' : p.status === 'rejected' ? '✗已拒绝' : p.status === 'reimbursed' ? '💰已报销' : p.status}`
    ).join('\n')

    const summary = `${statusLabel}采购共${total}条（显示${list.length}条），合计${formatAmount(totalAmount)}元\n${purchaseList || '暂无记录'}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        total,
        totalAmount: Math.round(totalAmount * 100) / 100,
        purchases: list.map(p => ({
          id: p._id,
          name: p.name || p.item || '',
          category: p.category || '',
          amount: p.amount || 0,
          status: p.status,
          createdAt: formatDate(p.createdAt),
          purchaseBy: p.purchaseByName || ''
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询采购状态失败: ${err.message}` }] }
  }
}

module.exports = getPurchaseStatus
