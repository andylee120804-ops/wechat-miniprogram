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
          period: result.period || result.date || '',
          totalIncome: result.totalIncome || 0,
          totalExpense: result.totalExpense || 0,
          totalFixed: result.totalFixed || 0,
          netProfit: result.netProfit || 0,
          count: result.count || 0,
          byType: result.byType || result.byCategory || {},
          recentIncomes: result.recentIncomes || result.recentExpenses || [],
          mode: data.result.structuredContent.totalFixed !== undefined ? 'expense' : 'income'
        })

        const viewCtx = wx.modelContext.getViewContext(this)
        viewCtx.setRelatedPage({ query: `period=${result.period || ''}` })
      })
    }
  },

  methods: {
    onRefresh() {
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '刷新数据' },
          { type: 'api/call', data: { name: this.data.mode === 'expense' ? 'getExpenseDetail' : 'getIncomeDetail', arguments: {} } }
        ]
      })
    }
  }
})
