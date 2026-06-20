const { queryAll, COLLECTIONS } = require('../../../../utils/db')

Page({
  data: {
    reservation: null,
    loading: true
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.loadReservation(id)
    }
  },

  async loadReservation(id) {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection(COLLECTIONS.RESERVATION).doc(id).get()
      this.setData({ reservation: data, loading: false })
    } catch (err) {
      console.error('加载预约详情失败:', err)
      this.setData({ loading: false })
    }
  },

  onBack() {
    const ctx = wx.modelContext.getContext()
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '返回预约列表' },
        { type: 'api/call', data: { name: 'getReservations', arguments: {} } }
      ]
    })
  }
})
