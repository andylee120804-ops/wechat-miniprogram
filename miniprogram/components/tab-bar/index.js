Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    active: {
      type: Number,
      value: 0
    }
  },
  data: {
    items: [
      { page: '/pages/index/index', text: '首页', icon: '🏠' },
      { page: '/pages/reservation/index', text: '预约', icon: '📅' },
      { page: '/pages/purchase/index', text: '采购', icon: '🛒' },
      { page: '/pages/income/index', text: '收入', icon: '💰' },
      { page: '/pages/me/index', text: '我的', icon: '👤' }
    ]
  },
  methods: {
    onTabTap(e) {
      const index = e.currentTarget.dataset.index
      const page = e.currentTarget.dataset.page
      if (index === this.data.active) return
      wx.switchTab({ url: page })
    }
  }
})