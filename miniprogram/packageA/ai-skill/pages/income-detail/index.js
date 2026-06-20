const { getDoc, COLLECTIONS } = require('../../../../utils/db')
const { formatDate, formatAmount } = require('../../../../utils/helpers')

Page({
  data: {
    income: null,
    loading: true
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.loadIncome(id)
    }
  },

  async loadIncome(id) {
    try {
      const data = await getDoc(COLLECTIONS.INCOME, id)
      this.setData({
        income: data,
        loading: false,
        dateStr: data ? formatDate(data.date) : '',
        amountStr: data ? formatAmount(data.amount) : ''
      })
    } catch (err) {
      console.error('加载收入详情失败:', err)
      this.setData({ loading: false })
    }
  },

  onBack() {
    const ctx = wx.modelContext.getContext()
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '查看收入列表' },
        { type: 'api/call', data: { name: 'getIncomeDetail', arguments: {} } }
      ]
    })
  }
})
