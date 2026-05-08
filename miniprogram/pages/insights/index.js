const app = getApp()
const { formatAmount, formatDate } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    busiestDay: { date: '', count: 0 },
    avgDailyRevenue: '0.00',
    insights: []
  },

  onShow() {
    if (!hasPermission('dashboard', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
    this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const dbInst = db.getDb()
      const _ = dbInst.command
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // Call getInsights cloud function for aggregated data
      const [busiestRes, topSourceRes, customerRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'getInsights',
          data: { action: 'busiestDays', startDate: formatDate(monthStart), endDate: formatDate(now), top: 1 }
        }),
        wx.cloud.callFunction({
          name: 'getInsights',
          data: { action: 'topIncomeSources', startDate: formatDate(monthStart), endDate: formatDate(now) }
        }),
        wx.cloud.callFunction({
          name: 'getInsights',
          data: { action: 'customerFrequency', months: 3 }
        })
      ])

      // Monthly revenue for avg daily calculation
      const monthIncome = await db.queryAll(COLLECTIONS.INCOME, {
        date: _.gte(monthStart)
      })

      const totalMonthIncome = (monthIncome.data || []).reduce((s, i) => s + (i.amount || 0), 0)
      const daysInMonth = now.getDate()
      const avgDaily = daysInMonth > 0 ? totalMonthIncome / daysInMonth : 0

      // Process insights
      const insights = []

      if (busiestRes.result && busiestRes.result.success && busiestRes.result.data && busiestRes.result.data.length > 0) {
        const bd = busiestRes.result.data[0]
        insights.push({
          icon: '📅',
          title: '最忙的一天',
          desc: `${bd.date} 有 ${bd.count} 个预约`,
          color: 'warning'
        })
      }

      const incomeTypeMap = {
        dining: '餐饮', chess: '棋牌', liquor: '酒水',
        teatime: '茶水', service: '服务', other: '其他'
      }

      if (topSourceRes.result && topSourceRes.result.success && topSourceRes.result.data && topSourceRes.result.data.length > 0) {
        const ts = topSourceRes.result.data[0]
        insights.push({
          icon: '💰',
          title: '最大收入来源',
          desc: `${incomeTypeMap[ts.type] || ts.type} 占比最高 ¥${formatAmount(ts.amount)}`,
          color: 'success'
        })
      }

      if (customerRes.result && customerRes.result.success && customerRes.result.data && customerRes.result.data.length > 0) {
        const tc = customerRes.result.data[0]
        insights.push({
          icon: '🏆',
          title: '回头客冠军',
          desc: `${tc.name} 近3月来访 ${tc.visits} 次`,
          color: 'accent'
        })
      }

      const [reservationRes, purchaseRes] = await Promise.all([
        db.queryAll(COLLECTIONS.RESERVATION, {
          date: _.gte(monthStart),
          status: 'confirmed'
        }),
        db.queryAll(COLLECTIONS.PURCHASE, {
          date: _.gte(monthStart)
        })
      ])

      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const lastPurchase = await db.queryAll(COLLECTIONS.PURCHASE, {
        date: _.gte(lastMonthStart).and(_.lte(lastMonthEnd))
      })

      const curTotal = (purchaseRes.data || []).reduce((s, p) => s + (p.amount || 0), 0)
      const prevTotal = (lastPurchase.data || []).reduce((s, p) => s + (p.amount || 0), 0)
      if (prevTotal > 0) {
        const pct = Math.round(((curTotal - prevTotal) / prevTotal) * 100)
        insights.push({
          icon: pct > 0 ? '📈' : '📉',
          title: '采购趋势',
          desc: `本月采购${pct > 0 ? '增长' : '减少'} ${Math.abs(pct)}%`,
          color: pct > 0 ? 'danger' : 'success'
        })
      }

      // Room utilization: count unique days per room
      const roomDays = { big: 0, small: 0 }
      const timeCount = { noon: 0, night: 0 }
      const roomDateSet = { big: {}, small: {} }
      ;(reservationRes.data || []).forEach(function(r) {
        const dateStr = formatDate(r.date)
        const room = r.room || 'big'
        const time = r.time
        // Room utilization (count unique days per room)
        if (room === 'big' || room === 'small') {
          if (!roomDateSet[room][dateStr]) {
            roomDateSet[room][dateStr] = true
            roomDays[room]++
          }
        }
        // Time slot preference
        if (time === '中午' || time === '晚上') {
          timeCount[time === '中午' ? 'noon' : 'night']++
        }
      })
      const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      insights.push({
        icon: '🚪',
        title: '包厢利用率',
        desc: '大包厢 ' + roomDays.big + '天 (' + Math.round(roomDays.big / totalDays * 100) + '%)  小包厢 ' + roomDays.small + '天 (' + Math.round(roomDays.small / totalDays * 100) + '%)',
        color: 'accent'
      })
      const totalResTime = timeCount.noon + timeCount.night
      if (totalResTime > 0) {
        insights.push({
          icon: '⏰',
          title: '时段偏好',
          desc: '中午 ' + Math.round(timeCount.noon / totalResTime * 100) + '% (' + timeCount.noon + '次)  晚上 ' + Math.round(timeCount.night / totalResTime * 100) + '% (' + timeCount.night + '次)',
          color: 'warning'
        })
      }

      // Most popular purchase category
      const categoryNameMap = {
        meat: '肉类', seafood: '海鲜', vegetable: '蔬菜', fruit: '水果',
        drink: '饮品', seasoning: '调味品', supplies: '日用品', equipment: '设备', other: '其他'
      }
      const categoryCount = {}
      ;(purchaseRes.data || []).forEach(function(p) {
        const cat = p.category || 'other'
        categoryCount[cat] = (categoryCount[cat] || 0) + 1
      })
      let topCat = ''
      let topCatCount = 0
      Object.keys(categoryCount).forEach(function(c) {
        if (categoryCount[c] > topCatCount) {
          topCat = c
          topCatCount = categoryCount[c]
        }
      })
      if (topCat) {
        insights.push({
          icon: '🛒',
          title: '热购品类',
          desc: (categoryNameMap[topCat] || topCat) + ' ' + topCatCount + '次',
          color: 'success'
        })
      }

      this.setData({
        loading: false,
        busiestDay: (busiestRes.result && busiestRes.result.success && busiestRes.result.data) ? (busiestRes.result.data[0] || { date: '-', count: 0 }) : { date: '-', count: 0 },
        avgDailyRevenue: formatAmount(avgDaily),
        insights
      })
    } catch (err) {
      handleCloudError(err, '经营洞察')
      this.setData({ loading: false })
    }
  }
})
