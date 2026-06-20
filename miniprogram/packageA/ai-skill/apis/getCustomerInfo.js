/**
 * getCustomerInfo - 查询客户信息及历史消费
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate, formatAmount } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getCustomerInfo({ name, phone }) {
  try {
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看客户信息的权限' }] }
    }

    if (!name && !phone) {
      return { isError: true, content: [{ type: 'text', text: '请提供客户姓名或手机号' }] }
    }

    // Find customer from reservation history
    const where = {}
    if (name) where.customerName = name
    if (phone) where.phone = phone

    const { data: reservations } = await queryAll(COLLECTIONS.RESERVATION, where, 'date', 'desc')

    if (reservations.length === 0) {
      return { isError: true, content: [{ type: 'text', text: `未找到客户${name || phone}的记录` }] }
    }

    // Stats
    const totalVisits = reservations.filter(r => r.status !== 'cancelled').length
    const totalCancelled = reservations.filter(r => r.status === 'cancelled').length
    const totalSpent = reservations.reduce((s, r) => s + (r.dishPrice || 0) + (r.standard || 0), 0)

    // Room preference
    const roomCount = {}
    reservations.forEach(r => {
      if (r.status !== 'cancelled' && r.roomName) {
        roomCount[r.roomName] = (roomCount[r.roomName] || 0) + 1
      }
    })
    const preferredRoom = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0]

    // Recent visits
    const recent = reservations.filter(r => r.status !== 'cancelled').slice(0, 5)
    const recentList = recent.map(r =>
      `${formatDate(r.date)} ${r.time || ''} ${r.roomName || ''} ${r.guestCount ? r.guestCount + '人' : ''}`
    ).join('\n')

    const summary = `客户${name || phone}：到店${totalVisits}次，取消${totalCancelled}次，偏好${preferredRoom ? preferredRoom[0] : '无'}，最近到店：\n${recentList}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        customerName: name || '',
        phone: phone || '',
        totalVisits,
        totalCancelled,
        totalSpent: Math.round(totalSpent * 100) / 100,
        preferredRoom: preferredRoom ? preferredRoom[0] : '',
        roomCount,
        recentVisits: recent.map(r => ({
          date: formatDate(r.date),
          time: r.time || '',
          roomName: r.roomName || '',
          guestCount: r.guestCount || 0,
          status: r.status
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询客户信息失败: ${err.message}` }] }
  }
}

module.exports = getCustomerInfo
