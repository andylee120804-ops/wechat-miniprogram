const app = getApp()
const { formatAmount, formatDate } = require('../../utils/helpers')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    loading: true,
    busiestDay: { date: '', count: 0 },
    topIncomeSource: { type: '', amount: 0, typeName: '' },
    avgDailyRevenue: '0.00',
    topCustomer: { name: '', visits: 0 },
    insights: []
  },

  onShow() {
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
      const db = wx.cloud.database()
      const _ = db.command
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
      const monthIncome = await db.collection(COLLECTIONS.INCOME).where({
        date: _.gte(monthStart)
      }).get()

      const totalMonthIncome = monthIncome.data.reduce((s, i) => s + (i.amount || 0), 0)
      const daysInMonth = now.getDate()
      const avgDaily = daysInMonth > 0 ? totalMonthIncome / daysInMonth : 0

      // Process insights
      const insights = []

      if (busiestRes.result.success && busiestRes.result.data.length > 0) {
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

      if (topSourceRes.result.success && topSourceRes.result.data.length > 0) {
        const ts = topSourceRes.result.data[0]
        insights.push({
          icon: '💰',
          title: '最大收入来源',
          desc: `${incomeTypeMap[ts.type] || ts.type} 占比最高 ¥${formatAmount(ts.amount)}`,
          color: 'success'
        })
      }

      if (customerRes.result.success && customerRes.result.data.length > 0) {
        const tc = customerRes.result.data[0]
        insights.push({
          icon: '🏆',
          title: '回头客冠军',
          desc: `${tc.name} 近3月来访 ${tc.visits} 次`,
          color: 'accent'
        })
      }

      const [reservationRes, purchaseRes] = await Promise.all([
        db.collection(COLLECTIONS.RESERVATION).where({
          date: _.gte(monthStart),
          status: _.neq('cancelled')
        }).get(),
        db.collection(COLLECTIONS.PURCHASE).where({
          date: _.gte(monthStart)
        }).get()
      ])

      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const lastPurchase = await db.collection(COLLECTIONS.PURCHASE).where({
        date: _.gte(lastMonthStart).and(_.lte(lastMonthEnd))
      }).get()

      const curTotal = purchaseRes.data.reduce((s, p) => s + (p.amount || 0), 0)
      const prevTotal = lastPurchase.data.reduce((s, p) => s + (p.amount || 0), 0)
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
      var roomDays = { big: 0, small: 0 }
      var timeCount = { noon: 0, night: 0 }
      var roomDateSet = { big: {}, small: {} }
      var timeNameMap = { noon: '中午', night: '晚上' }
      ;(reservationRes.data || []).forEach(function(r) {
        var dateStr = formatDate(r.date)
        var room = r.room || 'big'
        var time = r.time
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
      var totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      insights.push({
        icon: '🚪',
        title: '包厢利用率',
        desc: '大包厢 ' + roomDays.big + '天 (' + Math.round(roomDays.big / totalDays * 100) + '%)  小包厢 ' + roomDays.small + '天 (' + Math.round(roomDays.small / totalDays * 100) + '%)',
        color: 'accent'
      })
      var totalResTime = timeCount.noon + timeCount.night
      if (totalResTime > 0) {
        insights.push({
          icon: '⏰',
          title: '时段偏好',
          desc: '中午 ' + Math.round(timeCount.noon / totalResTime * 100) + '% (' + timeCount.noon + '次)  晚上 ' + Math.round(timeCount.night / totalResTime * 100) + '% (' + timeCount.night + '次)',
          color: 'warning'
        })
      }

      // Most popular purchase category
      var categoryNameMap = {
        meat: '肉类', seafood: '海鲜', vegetable: '蔬菜', fruit: '水果',
        drink: '饮品', seasoning: '调味品', supplies: '日用品', equipment: '设备', other: '其他'
      }
      var categoryCount = {}
      ;(purchaseRes.data || []).forEach(function(p) {
        var cat = p.category || 'other'
        categoryCount[cat] = (categoryCount[cat] || 0) + 1
      })
      var topCat = ''
      var topCatCount = 0
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
        busiestDay: busiestRes.result.success ? (busiestRes.result.data[0] || { date: '-', count: 0 }) : { date: '-', count: 0 },
        topIncomeSource: topSourceRes.result.success ? (topSourceRes.result.data[0] || { type: '-', amount: 0, typeName: '-' }) : { type: '-', amount: 0, typeName: '-' },
        avgDailyRevenue: formatAmount(avgDaily),
        topCustomer: customerRes.result.success ? (customerRes.result.data[0] || { name: '-', visits: 0 }) : { name: '-', visits: 0 },
        insights
      })
    } catch (err) {
      handleCloudError(err, '经营洞察')
      this.setData({ loading: false })
    }
  }
})
