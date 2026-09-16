var _h = require('../../utils/helpers')
var formatDate = _h.formatDate
var getReservationStatusText = _h.getReservationStatusText
var getChinaToday = _h.getChinaToday
var createChinaDate = _h.createChinaDate
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const reservationConfig = require('../../utils/reservationConfig')
const { buildBlockedBanner } = require('../../utils/blocked-date')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    currentYear: 0,
    currentMonth: 0,
    selectedDate: '',
    reservations: [],
    markDates: [],
    groupedReservations: {},
    blockedDates: [],
    blockedByDate: {},
    blockedBanner: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setActiveByPage('/pages/reservation/index')
    }
    if (!hasPermission('reservation', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看预约', icon: 'none' })
      return
    }
    const app = getApp()
    const theme = app.getThemePageData()
    const today = getChinaToday()

    // Preserve current calendar month AND selectedDate when returning from
    // sub-pages, so the user's exact position (including adjacent-month
    // selections like tapping Sep 1 on the August panel) is maintained.
    var hasMonth = this.data && this.data.currentMonth && this.data.currentYear
    var year = hasMonth ? Number(this.data.currentYear) : Number(today.slice(0, 4))
    var month = hasMonth ? Number(this.data.currentMonth) : Number(today.slice(5, 7))
    var selectedDate = today

    // If we have a preserved month AND a previously selected date that
    // belongs to a DIFFERENT month (e.g. user tapped Sep 1 on the August
    // panel), sync the calendar panel to show that selected month instead
    // of forcing back to the preserved month.
    if (hasMonth && this.data.selectedDate) {
      var prevSelected = this.data.selectedDate
      var selYear = Number(prevSelected.slice(0, 4))
      var selMonth = Number(prevSelected.slice(5, 7))
      if (selYear !== year || selMonth !== month) {
        // selectedDate is in a different month — follow the selected date
        year = selYear
        month = selMonth
        selectedDate = prevSelected
      }
    }

    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      currentYear: year,
      currentMonth: month,
      selectedDate: selectedDate
    })
    this.loadMonthReservations(year, month)
  },

  async loadMonthReservations(year, month) {
    try {
      this.setData({ loading: true })
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const monthStr = String(month).padStart(2, '0')
      const monthFirst = createChinaDate(year + '-' + monthStr + '-01')
      // Extend 7 days before the month start so adjacent-month dates
      // visible on the calendar panel also get their dot markers.
      var startDate = new Date(monthFirst.getTime() - 7 * 86400000)
      // Use China Standard Time to compute lastDay, avoiding timezone skew
      // when the device is not in UTC+8 (e.g. dai's case on 7.31 viewing August).
      var nextMonth = month === 12 ? 1 : month + 1
      var nextMonthYear = month === 12 ? year + 1 : year
      var nextMonthStr = String(nextMonth).padStart(2, '0')
      var nextMonthFirst = createChinaDate(nextMonthYear + '-' + nextMonthStr + '-01')
      var lastDayDate = new Date(nextMonthFirst.getTime() - 86400000)
      var lastDay = lastDayDate.getUTCDate()
      var monthEnd = createChinaDate(year + '-' + monthStr + '-' + String(lastDay).padStart(2, '0'), 23, 59, 59)
      // Extend 7 days after the month end to cover next-month calendar cells.
      var endDate = new Date(monthEnd.getTime() + 7 * 86400000)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(startDate).and(_.lte(endDate)),
        status: _.neq('cancelled')
      }, 'date', 'asc')

      await this.loadMonthBlocked(year, month)

      const rawData = res.data || []
      const markDates = []
      const markDateSet = {}
      rawData.forEach(function(r) {
        const dateStr = formatDate(r.date)
        if (!markDateSet[dateStr]) {
          markDateSet[dateStr] = true
          markDates.push(dateStr)
        }
      })

      this.setData({ markDates })

      // Load day reservations for currently selected date
      this.loadDayReservations(this.data.selectedDate)
    } catch (err) {
      handleCloudError(err, '加载月预约')
      this.setData({ loading: false })
    }
  },

  async loadMonthBlocked(year, month) {
    try {
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const monthStr = String(month).padStart(2, '0')
      const monthFirst = createChinaDate(year + '-' + monthStr + '-01')
      var startDate = new Date(monthFirst.getTime() - 7 * 86400000)
      var nextMonth = month === 12 ? 1 : month + 1
      var nextMonthYear = month === 12 ? year + 1 : year
      var nextMonthStr = String(nextMonth).padStart(2, '0')
      var nextMonthFirst = createChinaDate(nextMonthYear + '-' + nextMonthStr + '-01')
      var lastDayDate = new Date(nextMonthFirst.getTime() - 86400000)
      var lastDay = lastDayDate.getUTCDate()
      var monthEnd = createChinaDate(year + '-' + monthStr + '-' + String(lastDay).padStart(2, '0'), 23, 59, 59)
      var endDate = new Date(monthEnd.getTime() + 7 * 86400000)

      const startStr = formatDate(startDate)
      const endStr = formatDate(endDate)
      const res = await db.queryAll(COLLECTIONS.BLOCKED_DATE, {
        date: _.gte(startStr).and(_.lte(endStr))
      })

      const rawData = res.data || []
      const blockedDates = rawData.map(function(r) {
        return { dateStr: r.date, slots: r.slots, reason: r.reason }
      })
      const blockedByDate = {}
      rawData.forEach(function(r) { blockedByDate[r.date] = r })

      this.setData({
        blockedDates,
        blockedByDate,
        blockedBanner: buildBlockedBanner(blockedByDate[this.data.selectedDate])
      })
    } catch (err) {
      console.warn('加载封禁日期失败:', err)
    }
  },

  async loadDayReservations(dateStr) {
    if (!dateStr) return
    const requestToken = (this.dayReservationsRequestToken || 0) + 1
    this.dayReservationsRequestToken = requestToken
    try {
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      // Use China Standard Time boundaries for date range queries
      const dayStart = createChinaDate(dateStr)
      const dayEnd = createChinaDate(dateStr, 23, 59, 59)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, {
        date: _.gte(dayStart).and(_.lte(dayEnd))
      }, 'time', 'asc')

      if (!this.isCurrentDayReservationRequest(dateStr, requestToken)) return

      const rawData = res.data || []
      const reservations = rawData.map(function(r) {
        // 优先显示菜价金额，否则显示标准餐标
        const displayPrice = (r.dishPrice && r.dishPrice > 0) ? r.dishPrice : r.standard
        return { ...r, statusText: getReservationStatusText(r.status), displayPrice, storedValueLabel: '' }
      })
      var grouped = await this.groupByRoomDynamic(reservations)

      if (!this.isCurrentDayReservationRequest(dateStr, requestToken)) return

      this.setData({
        reservations,
        groupedReservationsDynamic: grouped,
        loading: false
      })

      await this.refreshStoredValueMarkersForReservations(dateStr, requestToken, reservations)
    } catch (err) {
      if (!this.isCurrentDayReservationRequest(dateStr, requestToken)) return
      handleCloudError(err, '加载日预约')
      this.setData({ loading: false })
    }
  },

  isCurrentDayReservationRequest(dateStr, requestToken) {
    if (this.dayReservationsRequestToken !== requestToken) return false
    if (!this.data || !this.data.selectedDate) return true
    return this.data.selectedDate === dateStr
  },

  async refreshStoredValueMarkersForReservations(dateStr, requestToken, reservations) {
    // 优先用内存缓存即时渲染已知储值客户，避免每次切日期都等云函数返回。
    if (!this._storedValueMarkerCache) {
      this._storedValueMarkerCache = {}
    }
    const cachedMaps = this._buildStoredValueMapsFromCache(reservations, this._storedValueMarkerCache)
    // 缓存命中部分先渲染一遍，让用户立刻看到已知储值标签
    if (Object.keys(cachedMaps.accountsByKey).length > 0) {
      const cachedReservations = this.applyStoredValueMarkers(
        reservations,
        cachedMaps.accountsByKey,
        cachedMaps.conflictsByKey
      )
      if (this.isCurrentDayReservationRequest(dateStr, requestToken)) {
        var groupedCached = await this.groupByRoomDynamic(cachedReservations)
        if (this.isCurrentDayReservationRequest(dateStr, requestToken)) {
          this.setData({
            reservations: cachedReservations,
            groupedReservationsDynamic: groupedCached
          })
        }
      }
    }

    const storedValueMaps = await this.loadStoredValueAccountsForReservations(reservations)
    if (!this.isCurrentDayReservationRequest(dateStr, requestToken)) return

    const reservationsWithStoredValue = this.applyStoredValueMarkers(
      reservations,
      storedValueMaps.accountsByKey,
      storedValueMaps.conflictsByKey
    )
    var grouped = await this.groupByRoomDynamic(reservationsWithStoredValue)
    if (!this.isCurrentDayReservationRequest(dateStr, requestToken)) return

    this.setData({
      reservations: reservationsWithStoredValue,
      groupedReservationsDynamic: grouped
    })
  },

  _buildStoredValueMapsFromCache(reservations, cache) {
    const accountsByKey = {}
    ;(reservations || []).forEach((reservation) => {
      const key = this.getStoredValueCustomerKey(reservation)
      if (!key) return
      if (cache[key] === true) {
        accountsByKey[key] = { hasPositiveBalance: true }
      }
    })
    return { accountsByKey, conflictsByKey: {} }
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

  async loadStoredValueAccountsForReservations(reservations) {
    if (!this._storedValueMarkerCache) {
      this._storedValueMarkerCache = {}
    }
    const cache = this._storedValueMarkerCache

    // 收集所有客户 key（去重），区分缓存命中与未命中
    const uniqueCustomers = []
    const seenKeys = new Set()
    const allKeys = []
    ;(reservations || []).forEach((reservation) => {
      const key = this.getStoredValueCustomerKey(reservation)
      if (!key || seenKeys.has(key)) return
      seenKeys.add(key)
      allKeys.push(key)
      // 缓存已命中（true / false 都算查过）则跳过云函数调用
      if (cache[key] !== undefined) return
      uniqueCustomers.push({
        phone: String(reservation.phone || '').trim(),
        customerName: String(reservation.customerName || reservation.name || '').trim()
      })
    })

    // 缓存完全命中，直接合成结果返回
    if (uniqueCustomers.length === 0 || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      const accountsByKey = {}
      allKeys.forEach((key) => {
        if (cache[key] === true) accountsByKey[key] = { hasPositiveBalance: true }
      })
      return { accountsByKey, conflictsByKey: {} }
    }

    try {
      const responses = await Promise.all(this.getStoredValueMarkerBatches(uniqueCustomers).map((customerBatch) => wx.cloud.callFunction({
        name: 'storedValue',
        data: {
          action: 'queryPositiveBalanceMarkers',
          permissionModule: 'reservation',
          customers: customerBatch
        }
      })))

      // 把结果回写缓存：有正余额 → true，没返回 marker 的客户 → false
      const returnedKeys = new Set()
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
            cache[key] = true
            returnedKeys.add(key)
          })
        })
      })

      // 云函数成功返回后，本次查询但未命中的客户标记为 false（无储值），下次不再查询
      uniqueCustomers.forEach((customer) => {
        const key = this.getStoredValueCustomerKey(customer)
        if (key && cache[key] === undefined) cache[key] = false
      })

      const accountsByKey = {}
      allKeys.forEach((key) => {
        if (cache[key] === true) accountsByKey[key] = { hasPositiveBalance: true }
      })
      return { accountsByKey, conflictsByKey: {} }
    } catch (err) {
      return { accountsByKey: {}, conflictsByKey: {} }
    }
  },

  buildStoredValueLabel(reservation, accountsByKey, conflictsByKey) {
    const key = this.getStoredValueCustomerKey(reservation)
    if (!key) return ''
    if (conflictsByKey[key]) return '储值冲突'
    const account = accountsByKey[key]
    if (!account) return ''
    return account.hasPositiveBalance === true ? '储值' : ''
  },

  applyStoredValueMarkers(reservations, accountsByKey, conflictsByKey) {
    return (reservations || []).map((reservation) => ({
      ...reservation,
      storedValueLabel: this.buildStoredValueLabel(reservation, accountsByKey || {}, conflictsByKey || {})
    }))
  },

  async groupByRoomDynamic(reservations) {
    var rooms = await reservationConfig.loadRooms()
    var enabledRooms = rooms.filter(function(r) { return r.enabled })
    var sortOrder = {}
    enabledRooms.forEach(function(r, i) { sortOrder[r.id] = i })

    var exclusiveOrder = { noon: 0, night: 1, full: 2 }
    var exclusiveLabels = { noon: '午包场', night: '晚包场', full: '全天包场' }

    // Predefined palette for group colors (cycled)
    var GROUP_COLORS = [
      { bg: 'rgba(201,169,110,0.15)', text: '#C9A96E' },
      { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA' },
      { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80' },
      { bg: 'rgba(168,130,255,0.15)', text: '#A882FF' },
      { bg: 'rgba(251,191,36,0.15)', text: '#FBBF24' },
      { bg: 'rgba(248,113,113,0.15)', text: '#F87171' },
      { bg: 'rgba(45,212,191,0.15)', text: '#2DD4BF' }
    ]

    var grouped = {}
    var colorIdx = 0
    reservations.forEach(function(r) {
      var et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      var key, label
      if (et !== 'none') {
        key = et
        label = exclusiveLabels[et] || '包场'
      } else {
        key = r.room || 'big'
        label = r.roomName || key
      }
      if (!grouped[key]) {
        var ci = colorIdx % GROUP_COLORS.length
        grouped[key] = {
          key: key, label: label, items: [],
          color: GROUP_COLORS[ci].bg, textColor: GROUP_COLORS[ci].text
        }
        colorIdx++
      }
      grouped[key].items.push(r)
    })

    // Sort: exclusive groups first, then rooms by order
    var keys = Object.keys(grouped)
    keys.sort(function(a, b) {
      var aEx = exclusiveOrder[a] !== undefined
      var bEx = exclusiveOrder[b] !== undefined
      if (aEx !== bEx) return aEx ? -1 : 1
      if (aEx && bEx) return (exclusiveOrder[a] !== undefined ? exclusiveOrder[a] : 99) - (exclusiveOrder[b] !== undefined ? exclusiveOrder[b] : 99)
      return (sortOrder[a] !== undefined ? sortOrder[a] : 99) - (sortOrder[b] !== undefined ? sortOrder[b] : 99)
    })

    var result = []
    keys.forEach(function(k) { result.push(grouped[k]) })
    return result
  },

  onDayTap(e) {
    const date = e.detail.date
    if (!date) return
    this.setData({
      selectedDate: date,
      blockedBanner: buildBlockedBanner(this.data.blockedByDate[date])
    })
    this.loadDayReservations(date)
  },

  onMonthChange(e) {
    const year = e.detail.year
    const month = e.detail.month
    this.setData({ currentYear: year, currentMonth: month })
    this.loadMonthReservations(year, month)
    // Invalidate any in-flight day-level request from the previous month
    // so stale day reservations don't overwrite the new month's results.
    this.dayReservationsRequestToken = (this.dayReservationsRequestToken || 0) + 1
  },

  onAddReservation() {
    if (!hasPermission('reservation', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限创建预约', icon: 'none' })
      return
    }
    const blockedRecord = this.data.blockedByDate[this.data.selectedDate]
    if (blockedRecord && blockedRecord.slots && blockedRecord.slots.length === 2) {
      wx.showModal({
        title: '该日期已封禁',
        content: (blockedRecord.reason || '休息') + '（全天），无法创建预约',
        showCancel: false
      })
      return
    }
    const today = getChinaToday()
    if (this.data.selectedDate < today) {
      wx.showToast({ title: '不能创建过去日期的预约', icon: 'none' })
      return
    }
    wx.vibrateShort({ type: 'light' })
    wx.navigateTo({
      url: '/pages/reservation-add/index?date=' + this.data.selectedDate
    })
  },

  onReservationTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/reservation-detail/index?id=' + id
    })
  }
})