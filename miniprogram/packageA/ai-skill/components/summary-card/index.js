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
          date: result.date || result.month,
          mode: result.type || 'daily',
          reservationCount: result.reservationCount || 0,
          totalIncome: result.totalIncome || result.details?.income || 0,
          totalExpense: result.totalExpense || result.details?.expense || 0,
          netProfit: result.netProfit || result.details?.netProfit || 0,
          roomStats: result.roomStats || {},
          byCategory: result.details?.byCategory || result.details?.incomeByCategory || {},
          month: result.month
        })
      })
    }
  },

  methods: {
    onRefresh() {
      const modelCtx = wx.modelContext.getContext(this)
      const apiName = this.data.mode === 'purchase' ? 'getMonthlyStats' : 'getTodaySummary'
      modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '刷新数据' },
          { type: 'api/call', data: { name: apiName, arguments: {} } }
        ]
      })
    }
  }
})
