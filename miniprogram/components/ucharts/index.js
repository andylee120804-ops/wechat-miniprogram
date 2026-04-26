const uCharts = require('./ucharts.js')

Component({
  properties: {
    type: {
      type: String,
      value: 'ring'
    },
    opts: {
      type: Object,
      value: {}
    },
    chartData: {
      type: Object,
      value: {},
      observer: function() {
        if (this._ready) {
          this.initChart()
        }
      }
    },
    canvasId: {
      type: String,
      value: 'uchart-canvas'
    },
    canvasWidth: {
      type: Number,
      value: 350
    },
    canvasHeight: {
      type: Number,
      value: 250
    }
  },
  data: {
    chartInstance: null
  },
  lifetimes: {
    ready() {
      this._ready = true
      this.initChart()
    }
  },
  methods: {
    initChart() {
      const chartConfig = Object.keys(this.data.opts).length > 0 ? this.data.opts : this.data.chartData

      // Guard: skip if no chart config
      if (!chartConfig || !chartConfig.series || chartConfig.series.length === 0) {
        return
      }

      const query = wx.createSelectorQuery().in(this)
      query
        .select('#' + this.data.canvasId)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0]) return

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const sysInfo = wx.getDeviceInfo()
          const dpr = sysInfo.pixelRatio || 1

          canvas.width = res[0].width * dpr
          canvas.height = res[0].height * dpr
          ctx.scale(dpr, dpr)

          const opts = Object.assign({}, chartConfig, {
            width: canvas.width,
            height: canvas.height,
            pixelRatio: dpr,
            canvasId: this.data.canvasId
          })

          try {
            const chart = new uCharts(opts)
            chart.render(canvas, ctx)
            this.setData({ chartInstance: chart })
          } catch (e) {
            console.error('[ucharts] render error:', e)
          }
        })
    },
    init(canvas, ctx) {
      const chartConfig = Object.keys(this.data.opts).length > 0 ? this.data.opts : this.data.chartData

      if (!chartConfig || !chartConfig.series || chartConfig.series.length === 0) {
        return
      }

      const sysInfo = wx.getDeviceInfo()
      const dpr = sysInfo.pixelRatio || 1
      const opts = Object.assign({}, chartConfig, {
        width: canvas.width,
        height: canvas.height,
        pixelRatio: dpr,
        canvasId: this.data.canvasId
      })
      const chart = new uCharts(opts)
      chart.render(canvas, ctx)
      this.setData({ chartInstance: chart })
      return chart
    },
    updateData(data) {
      if (this.data.chartInstance) {
        this.data.chartInstance.updateData(data)
      }
    }
  }
})
