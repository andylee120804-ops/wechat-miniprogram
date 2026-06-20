Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const { NotificationType } = wx.modelContext

      modelCtx.on(NotificationType.Result, (data) => {
        if (data.result.isError) {
          this.setData({ error: true, errorMsg: data.result.content[0].text })
          return
        }

        const result = data.result.structuredContent
        this.setData({
          loaded: true,
          mode: data.result.structuredContent.id ? 'created' : 'cancelled',
          id: result.id || '',
          customerName: result.customerName || '',
          date: result.date || '',
          time: result.time || '',
          roomName: result.roomName || '',
          guestCount: result.guestCount || 0,
          status: result.status || '',
          phone: result.phone || ''
        })

        const viewCtx = wx.modelContext.getViewContext(this)
        if (result.id) {
          viewCtx.setRelatedPage({ query: `id=${result.id}` })
        }
      })
    }
  },

  methods: {
    onViewDetail() {
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({
        url: `/packageA/ai-skill/pages/reservation-detail/index?id=${this.data.id}`
      })
    },

    onBookAgain() {
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '再预约一个' }
        ]
      })
    }
  }
})
