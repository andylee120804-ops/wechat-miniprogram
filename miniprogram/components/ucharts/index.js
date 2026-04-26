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
      this.initChart()
    }
  },
  methods: {
    initChart() {
      const query = wx.createSelectorQuery().in(this)
      query
        .select('#' + this.data.canvasId)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0]) return
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          canvas.width = res[0].width * dpr
          canvas.height = res[0].height * dpr
          ctx.scale(dpr, dpr)

          const opts = Object.assign({}, this.data.opts, {
            type: this.data.type,
            width: canvas.width,
            height: canvas.height,
            pixelRatio: dpr,
            canvasId: this.data.canvasId
          })

          const chart = new uCharts(opts)
          chart.render(canvas, ctx)
          this.setData({ chartInstance: chart })
        })
    },
    init(canvas, ctx) {
      const dpr = wx.getSystemInfoSync().pixelRatio
      const opts = Object.assign({}, this.data.opts, {
        type: this.data.type,
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