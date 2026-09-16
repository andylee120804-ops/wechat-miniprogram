const app = getApp()
const { COLLECTIONS } = require('../../utils/db')
const { formatDate, formatAmount } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    customers: [],
    filteredCustomers: [],
    searchKeyword: '',
    sortBy: 'visits'
  },

  onShow() {
    if (!hasPermission('customer', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    // Skip reload if we already have data loaded (avoids re-fetching on tab switch).
    // Pull-to-refresh or explicit reload will bypass this.
    if (this.data.customers && this.data.customers.length > 0 && !this._needsReload) {
      return
    }
    this.loadCustomers()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadCustomers() {
    this.setData({ loading: true })
    try {
      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        status: 'confirmed'
      })

      // Aggregate by customerName
      const map = {}
      ;(res.data || []).forEach(r => {
        const name = r.customerName || '未知'
        if (!map[name]) {
          map[name] = { name, visits: 0, totalAmount: 0, lastVisit: r.date, preferredRoom: r.roomName || r.room }
        }
        map[name].visits++
        if (r.date > map[name].lastVisit) {
          map[name].lastVisit = r.date
          map[name].preferredRoom = r.roomName || r.room
        }
      })

      // Also query income to get spending
      const incomeRes = await db.queryAll(COLLECTIONS.INCOME, {})
      ;(incomeRes.data || []).forEach(i => {
        const name = i.source
        if (map[name]) {
          map[name].totalAmount = (map[name].totalAmount || 0) + (i.amount || 0)
        }
      })

      let customers = Object.values(map)
      customers.sort((a, b) => b.visits - a.visits)
      // Pre-format values for template rendering
      customers = customers.map(c => ({
        ...c,
        nameInitial: (c.name || '?').charAt(0),
        formattedAmount: formatAmount(c.totalAmount || 0),
        formattedLastVisit: formatDate(c.lastVisit),
        storedValueLabel: ''
      }))
      const requestToken = (this.customerStoredValueRequestToken || 0) + 1
      this.customerStoredValueRequestToken = requestToken
      this._needsReload = false
      this.setData({ loading: false, customers, filteredCustomers: customers })
      this.applyFilter()
      this.refreshStoredValueMarkersForCustomers(customers, requestToken)
    } catch (err) {
      console.error('[Customer] 加载客户数据失败:', err)
      this.setData({ loading: false })
    }
  },

  onSearch(e) {
    this.setData({ searchKeyword: e.detail.value || '' })
    this.applyFilter()
  },

  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    this.setData({ sortBy })
    this.applyFilter()
  },

  onPullDownRefresh() {
    this._needsReload = true
    this.loadCustomers()
    setTimeout(function() { wx.stopPullDownRefresh() }, 1500)
  },

  applyFilter() {
    let filtered = this.data.customers.slice()
    if (this.data.searchKeyword) {
      const kw = this.data.searchKeyword.toLowerCase()
      filtered = filtered.filter(c => c.name.toLowerCase().includes(kw))
    }
    if (this.data.sortBy === 'visits') {
      filtered.sort((a, b) => b.visits - a.visits)
    } else if (this.data.sortBy === 'spending') {
      filtered.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
    }
    this.setData({ filteredCustomers: filtered })
  },

  getStoredValueCustomerKey(customer) {
    if (!customer) return ''
    const phone = String(customer.phone || '').trim()
    if (phone) return phone
    return String(customer.customerName || customer.name || '').trim()
  },

  getStoredValueAccountKey(account) {
    if (!account) return ''
    const phone = String(account.phone || '').trim()
    if (phone) return phone
    const customerKey = String(account.customerKey || '').trim()
    if (customerKey.indexOf('phone:') === 0) return customerKey.slice(6)
    if (customerKey.indexOf('name:') === 0) return customerKey.slice(5)
    return String(account.customerName || account.name || '').trim()
  },

  getStoredValueMarkerBatches(customers) {
    const batchSize = 50
    const batches = []
    for (let index = 0; index < customers.length; index += batchSize) {
      batches.push(customers.slice(index, index + batchSize))
    }
    return batches
  },

  normalizeStoredValueMatchKey(rawKey) {
    const key = String(rawKey || '').trim()
    if (key.indexOf('phone:') === 0) return key.slice(6)
    if (key.indexOf('name:') === 0) return key.slice(5)
    return key
  },

  async loadStoredValueAccountsForCustomers(customers) {
    const uniqueCustomers = []
    const seenKeys = new Set()
    ;(customers || []).forEach((customer) => {
      const key = this.getStoredValueCustomerKey(customer)
      if (!key || seenKeys.has(key)) return
      seenKeys.add(key)
      uniqueCustomers.push({
        phone: String(customer.phone || '').trim(),
        customerName: String(customer.customerName || customer.name || '').trim()
      })
    })

    if (uniqueCustomers.length === 0 || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      return { accountsByKey: {}, conflictsByKey: {} }
    }

    try {
      const responses = await Promise.all(this.getStoredValueMarkerBatches(uniqueCustomers).map((customerBatch) => wx.cloud.callFunction({
        name: 'storedValue',
        data: {
          action: 'queryPositiveBalanceMarkers',
          permissionModule: 'customer',
          customers: customerBatch
        }
      })))
      const accountsByKey = {}
      const conflictsByKey = {}

      responses.forEach((response) => {
        const result = response && response.result
        if (!result || result.success === false) {
          return
        }

        ;(result.data || []).forEach((marker) => {
          if (!marker || marker.hasPositiveBalance !== true) return
          const keys = Array.isArray(marker.matchKeys) && marker.matchKeys.length
            ? marker.matchKeys.map((key) => this.normalizeStoredValueMatchKey(key)).filter(Boolean)
            : []
          keys.forEach((key) => {
            if (!key) return
            accountsByKey[key] = { hasPositiveBalance: true }
          })
        })
      })

      return { accountsByKey, conflictsByKey }
    } catch (err) {
      return { accountsByKey: {}, conflictsByKey: {} }
    }
  },

  buildStoredValueLabel(customer, accountsByKey, conflictsByKey) {
    const key = this.getStoredValueCustomerKey(customer)
    if (!key) return ''
    if (conflictsByKey[key]) return ''
    const account = accountsByKey[key]
    if (!account) return ''
    return account.hasPositiveBalance === true ? '储值' : ''
  },

  applyStoredValueMarkers(customers, accountsByKey, conflictsByKey) {
    return (customers || []).map((customer) => ({
      ...customer,
      storedValueLabel: this.buildStoredValueLabel(customer, accountsByKey || {}, conflictsByKey || {})
    }))
  },

  async refreshStoredValueMarkersForCustomers(customers, requestToken) {
    const storedValueMaps = await this.loadStoredValueAccountsForCustomers(customers)
    if (this.customerStoredValueRequestToken !== requestToken) return

    const customersWithStoredValue = this.applyStoredValueMarkers(
      this.data.customers,
      storedValueMaps.accountsByKey,
      storedValueMaps.conflictsByKey
    )
    this.setData({ customers: customersWithStoredValue })
    this.applyFilter()
  },

  onCustomerTap(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({ url: `/pages/customer-detail/index?name=${encodeURIComponent(name)}` })
  }
})
