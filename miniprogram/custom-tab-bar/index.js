const app = getApp()

Component({
  data: {
    active: 0,
    theme: {},
    items: [
      { page: '/pages/index/index', text: '首页', icon: '/assets/icons/home.png', activeIcon: '/assets/icons/home-active.png' },
      { page: '/pages/reservation/index', text: '预约', icon: '/assets/icons/calendar.png', activeIcon: '/assets/icons/calendar-active.png' },
      { page: '/pages/purchase/index', text: '采购', icon: '/assets/icons/purchase.png', activeIcon: '/assets/icons/purchase-active.png' },
      { page: '/pages/income/index', text: '收入', icon: '/assets/icons/income.png', activeIcon: '/assets/icons/income-active.png' },
      { page: '/pages/me/index', text: '我的', icon: '/assets/icons/me.png', activeIcon: '/assets/icons/me-active.png' }
    ]
  },

  lifetimes: {
    attached() {
      const theme = app.getThemePageData()
      this.setData({ theme })
    }
  },

  methods: {
    onTabTap(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.items[index]
      this.setData({ active: index })
      wx.switchTab({ url: item.page })
    }
  }
})
