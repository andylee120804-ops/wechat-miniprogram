const { getDoc, COLLECTIONS } = require('../../../../utils/db')
const { formatDate, formatAmount } = require('../../../../utils/helpers')

Page({
  data: {
    purchase: null,
    loading: true
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.loadPurchase(id)
    }
  },

  async loadPurchase(id) {
    try {
      const data = await getDoc(COLLECTIONS.PURCHASE, id)
      this.setData({
        purchase: data,
        loading: false,
        dateStr: data ? formatDate(data.createdAt) : '',
        amountStr: data ? formatAmount(data.amount) : ''
      })
    } catch (err) {
      console.error('加载采购详情失败:', err)
      this.setData({ loading: false })
    }
  },

  onBack() {
    const ctx = wx.modelContext.getContext()
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '查看采购列表' },
        { type: 'api/call', data: { name: 'getPurchaseStatus', arguments: {} } }
      ]
    })
  }
})
