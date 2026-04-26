const app = getApp()
const { formatAmount, formatDate } = require('../../utils/helpers')
const { getLineChartConfig, getBarChartConfig, getIncomeTypeColors } = require('../../utils/chart-config')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    busiestDay: { date: '', count: 0 },
    topIncomeSource: { type: '', amount: 0, typeName: '' },
    avgDailyRevenue: '0.00',
    topCustomer: { name: '', visits: 0 },
    revenueChart: null,
    weeklyChart: null,
    insights: []
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // Call getInsights cloud function for aggregated data
      const [busiestRes, trendRes, topSourceRes, customerRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'getInsights',
          data: { action: 'busiestDays', startDate: formatDate(monthStart), endDate: formatDate(now), top: 1 }
        }),
        wx.cloud.callFunction({
          name: 'getInsights',
          data: { action: 'revenueTrend', period: 'month', months: 6 }
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

      const purchaseRes = await db.collection(COLLECTIONS.PURCHASE).where({
        date: _.gte(monthStart)
      }).get()

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

      // Revenue trend chart
      let revenueChart = null
      if (trendRes.result.success && trendRes.result.data.length > 0) {
        const trendData = trendRes.result.data
        const categories = trendData.map(d => d.month)
        const series = [{ name: '收入', data: trendData.map(d => d.amount) }]
        revenueChart = getLineChartConfig(this.data.theme, categories, series, {
          canvasWidth: 650,
          canvasHeight: 300
        })
      }

      this.setData({
        loading: false,
        busiestDay: busiestRes.result.success ? (busiestRes.result.data[0] || { date: '-', count: 0 }) : { date: '-', count: 0 },
        topIncomeSource: topSourceRes.result.success ? (topSourceRes.result.data[0] || { type: '-', amount: 0, typeName: '-' }) : { type: '-', amount: 0, typeName: '-' },
        avgDailyRevenue: formatAmount(avgDaily),
        topCustomer: customerRes.result.success ? (customerRes.result.data[0] || { name: '-', visits: 0 }) : { name: '-', visits: 0 },
        insights,
        revenueChart
      })
    } catch (err) {
      handleCloudError(err, '经营洞察')
      this.setData({ loading: false })
    }
  }
})
