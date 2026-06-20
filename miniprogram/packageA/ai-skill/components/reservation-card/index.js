Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const viewCtx = wx.modelContext.getViewContext(this)
      const { NotificationType } = wx.modelContext

      modelCtx.on(NotificationType.Result, (data) => {
        if (data.result.isError) {
          this.setData({ error: true, errorMsg: data.result.content[0].text })
          return
        }

        const result = data.result.structuredContent
        this.setData({
          loaded: true,
          date: result.date,
          total: result.total || 0,
          reservations: result.reservations || [],
          availableSlots: result.availableSlots || [],
          bookedSlots: result.bookedSlots || [],
          mode: result.availableSlots ? 'availability' : 'list'
        })

        // 设置关联页面参数
        viewCtx.setRelatedPage({ query: `date=${result.date}` })
      })
    }
  },

  methods: {
    onTapItem(e) {
      const { id } = e.currentTarget.dataset
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({
        url: `/packageA/ai-skill/pages/reservation-detail/index?id=${id}`
      })
    },

    onBookSlot(e) {
      const { slot } = e.currentTarget.dataset
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: `我要预约${slot}` },
          { type: 'api/call', data: { name: 'getReservations', arguments: {} } }
        ]
      })
    }
  }
})
