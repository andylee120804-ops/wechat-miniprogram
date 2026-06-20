const app = getApp()
const { hasPermission, ACTIONS } = require('../utils/permission')

// All possible tab items (in order)
const ALL_TAB_ITEMS = [
  { page: '/pages/index/index', text: '首页', icon: '/assets/icons/home.png', activeIcon: '/assets/icons/home-active.png' },
  { page: '/pages/reservation/index', text: '预约', icon: '/assets/icons/calendar.png', activeIcon: '/assets/icons/calendar-active.png' },
  { page: '/pages/purchase/index', text: '采购', icon: '/assets/icons/purchase.png', activeIcon: '/assets/icons/purchase-active.png', permission: { module: 'purchase', action: ACTIONS.VIEW } },
  { page: '/pages/income/index', text: '收入', icon: '/assets/icons/income.png', activeIcon: '/assets/icons/income-active.png', permission: { module: 'income', action: ACTIONS.VIEW } },
  { page: '/pages/me/index', text: '我的', icon: '/assets/icons/me.png', activeIcon: '/assets/icons/me-active.png' }
]

function getFilteredItems() {
  return ALL_TAB_ITEMS.filter(item => {
    if (!item.permission) return true
    return hasPermission(item.permission.module, item.permission.action)
  })
}

Component({
  data: {
    active: 0,
    theme: {},
    items: []
  },

  lifetimes: {
    attached() {
      const theme = app.getThemePageData()
      const items = getFilteredItems()
      this.setData({ theme, items })
    }
  },

  pageLifetimes: {
    show() {
      // Re-filter items on every page show to react to permission changes
      const items = getFilteredItems()
      // Determine active index from the current page route
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? '/' + currentPage.route : ''
      const activeIndex = items.findIndex(item => item.page === currentRoute)
      this.setData({ items, active: activeIndex >= 0 ? activeIndex : 0 })
    }
  },

  methods: {
    onTabTap(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.items[index]
      this.setData({ active: index })
      wx.switchTab({ url: item.page })
    },

    // Called by each tab page to set the active tab by page path
    setActiveByPage(pagePath) {
      const items = getFilteredItems()
      const activeIndex = items.findIndex(item => item.page === pagePath)
      this.setData({ items, active: activeIndex >= 0 ? activeIndex : 0 })
    }
  }
})
