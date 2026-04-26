/**
 * ucharts-lite - 轻量级微信小程序图表渲染引擎
 * 支持折线图(line)和环形图(ring)，canvas2d模式
 */

function uCharts(opts) {
  this.opts = opts
  this.canvas = null
  this.ctx = null
  this.pixelRatio = opts.pixelRatio || 1
  this.width = opts.width
  this.height = opts.height
  this.canvasId = opts.canvasId
  this.chartData = opts.chartData || {}
  this.categories = opts.categories || []
  this.series = opts.series || []
  this.type = opts.type
  this.animation = opts.animation !== false
  this.padding = opts.padding || [20, 20, 10, 50]
  this.color = opts.color || ['#C9A96E', '#E85A71', '#67B68D', '#E8A87C', '#9B7EBD', '#5D6D7E']
  this.background = opts.background || '#FFFFFF'
  this.legend = opts.legend || { show: true }
  this.xAxis = opts.xAxis || {}
  this.yAxis = opts.yAxis || {}
  this.dataLabel = opts.dataLabel !== false
  this.dataPointShape = opts.dataPointShape !== false
  this.extra = opts.extra || {}
  this.title = opts.title || {}
  this.subtitle = opts.subtitle || {}
  this._touchPoints = []
}

uCharts.prototype.render = function(canvas, ctx) {
  this.canvas = canvas
  this.ctx = ctx

  if (this.type === 'line') {
    this._drawLineChart()
  } else if (this.type === 'ring') {
    this._drawRingChart()
  }
}

uCharts.prototype._drawLineChart = function() {
  const ctx = this.ctx
  const w = this.width
  const h = this.height
  const padding = this.padding
  const pr = this.pixelRatio

  const chartLeft = padding[3] * pr
  const chartTop = padding[0] * pr
  const chartRight = w - padding[1] * pr
  const chartBottom = h - padding[2] * pr
  const chartWidth = chartRight - chartLeft
  const chartHeight = chartBottom - chartTop

  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = this.background
  ctx.fillRect(0, 0, w, h)

  // Calculate data range
  let minVal = 0, maxVal = 0
  this.series.forEach(s => {
    s.data.forEach(v => {
      if (v < minVal) minVal = v
      if (v > maxVal) maxVal = v
    })
  })
  if (this.yAxis.data && this.yAxis.data[0]) {
    if (this.yAxis.data[0].min !== undefined) minVal = this.yAxis.data[0].min
    if (this.yAxis.data[0].max !== undefined) maxVal = this.yAxis.data[0].max
  }
  const range = maxVal - minVal || 1

  // Draw Y axis grid
  const ySteps = 5
  const yFontColor = this.yAxis.fontColor || '#999999'
  const yFontSize = (this.yAxis.fontSize || 10) * pr
  const gridColor = this.yAxis.gridColor || '#E8E8E8'
  const dashLen = (this.yAxis.dashLength || 4) * pr
  const gridType = this.yAxis.gridType || 'dash'

  ctx.font = `${yFontSize}px sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  for (let i = 0; i <= ySteps; i++) {
    const y = chartBottom - (i / ySteps) * chartHeight
    const val = minVal + (i / ySteps) * range

    // Grid line
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 1
    if (gridType === 'dash') {
      ctx.setLineDash([dashLen, dashLen])
    }
    ctx.beginPath()
    ctx.moveTo(chartLeft, y)
    ctx.lineTo(chartRight, y)
    ctx.stroke()
    ctx.setLineDash([])

    // Y label
    ctx.fillStyle = yFontColor
    ctx.fillText(Math.round(val), chartLeft - 6 * pr, y)
  }

  // Draw X axis labels
  const catCount = this.categories.length
  const xFontSize = (this.xAxis.fontSize || 10) * pr
  const xFontColor = this.xAxis.fontColor || '#999999'
  const labelCount = this.xAxis.labelCount || catCount
  const step = Math.max(1, Math.ceil(catCount / labelCount))

  ctx.font = `${xFontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = xFontColor

  for (let i = 0; i < catCount; i += step) {
    const x = chartLeft + (i / Math.max(1, catCount - 1)) * chartWidth
    ctx.fillText(this.categories[i], x, chartBottom + 4 * pr)
  }

  // Draw lines
  const lineWidth = (this.extra.line && this.extra.line.width || 2) * pr
  const curveType = this.extra.line && this.extra.line.type || 'straight'

  this.series.forEach((s, si) => {
    const color = this.color[si % this.color.length]
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const points = s.data.map((v, i) => ({
      x: chartLeft + (i / Math.max(1, catCount - 1)) * chartWidth,
      y: chartBottom - ((v - minVal) / range) * chartHeight
    }))

    ctx.beginPath()
    if (curveType === 'curve' && points.length > 2) {
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const cpx = (prev.x + curr.x) / 2
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y)
      }
    } else {
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
    }
    ctx.stroke()

    // Data points
    if (this.dataPointShape) {
      const shapeType = this.extra.line && this.extra.line.activeType || 'hollow'
      const radius = 3 * pr
      points.forEach(p => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        if (shapeType === 'hollow') {
          ctx.strokeStyle = color
          ctx.lineWidth = 2 * pr
          ctx.stroke()
          ctx.fillStyle = this.background
          ctx.fill()
        } else {
          ctx.fillStyle = color
          ctx.fill()
        }
      })
    }
  })

  // Legend
  if (this.legend.show) {
    const legendFontSize = (this.legend.fontSize || 11) * pr
    const legendFontColor = this.legend.fontColor || '#666666'
    const itemGap = (this.legend.itemGap || 16) * pr
    ctx.font = `600 ${legendFontSize}px sans-serif`
    ctx.textBaseline = 'middle'

    let legendX = chartRight
    const legendY = chartTop

    for (let i = this.series.length - 1; i >= 0; i--) {
      const s = this.series[i]
      const textWidth = ctx.measureText(s.name).width
      const totalWidth = textWidth + 16 * pr + itemGap

      ctx.textAlign = 'right'
      ctx.fillStyle = legendFontColor
      ctx.fillText(s.name, legendX, legendY + legendFontSize / 2)

      // Color dot
      ctx.fillStyle = this.color[i % this.color.length]
      ctx.beginPath()
      ctx.arc(legendX - textWidth - 8 * pr, legendY + legendFontSize / 2, 4 * pr, 0, Math.PI * 2)
      ctx.fill()

      legendX -= totalWidth
    }
  }
}

uCharts.prototype._drawRingChart = function() {
  const ctx = this.ctx
  const w = this.width
  const h = this.height
  const pr = this.pixelRatio

  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = this.background
  ctx.fillRect(0, 0, w, h)

  // Chart dimensions
  const legendHeight = this.legend.show ? 60 * pr : 0
  const centerX = w / 2
  const centerY = (h - legendHeight) / 2
  const outerRadius = Math.max(1, Math.min(w, h - legendHeight) / 2 - 20 * pr)
  const ringWidth = (this.extra.ring && this.extra.ring.ringWidth || 20) * pr
  const innerRadius = Math.max(0, outerRadius - ringWidth)
  if (outerRadius < ringWidth + 2 * pr) return
  const borderWidth = (this.extra.ring && this.extra.ring.borderWidth || 2) * pr
  const borderColor = this.extra.ring && this.extra.ring.borderColor || this.background

  // Calculate total
  let total = 0
  this.series.forEach(s => { total += s.data || 0 })
  if (total === 0) {
    return
  }

  // Draw rings
  let startAngle = -Math.PI / 2
  const activeOpacity = this.extra.ring && this.extra.ring.activeOpacity || 0.5

  this.series.forEach((s, i) => {
    const ratio = s.data / total
    const sweepAngle = ratio * Math.PI * 2
    const endAngle = startAngle + sweepAngle
    const color = s.color || this.color[i % this.color.length]

    // Draw arc
    ctx.beginPath()
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    // Border
    if (borderWidth > 0 && this.extra.ring && this.extra.ring.border) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      ctx.stroke()
    }

    startAngle = endAngle
  })

  // Center text
  if (this.title.name) {
    const titleFontSize = (this.title.fontSize || 14) * pr
    const titleColor = this.title.fontColor || '#333333'
    const titleOffsetY = (this.title.offsetY || 0) * pr
    ctx.font = `700 ${titleFontSize}px sans-serif`
    ctx.fillStyle = titleColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.title.name, centerX, centerY + titleOffsetY)
  }

  if (this.subtitle.name) {
    const subFontSize = (this.subtitle.fontSize || 10) * pr
    const subColor = this.subtitle.fontColor || '#999999'
    const subOffsetY = (this.subtitle.offsetY || 10) * pr
    ctx.font = `400 ${subFontSize}px sans-serif`
    ctx.fillStyle = subColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.subtitle.name, centerX, centerY + subOffsetY)
  }

  // Legend
  if (this.legend.show) {
    const legendFontSize = (this.legend.fontSize || 10) * pr
    const legendFontColor = this.legend.fontColor || '#666666'
    const itemGap = (this.legend.itemGap || 12) * pr
    ctx.font = `400 ${legendFontSize}px sans-serif`
    ctx.textBaseline = 'middle'

    const legendY = h - legendHeight + 20 * pr
    const legendStartX = 20 * pr

    let lx = legendStartX
    this.series.forEach((s, i) => {
      const color = s.color || this.color[i % this.color.length]

      // Color dot
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(lx + 6 * pr, legendY, 4 * pr, 0, Math.PI * 2)
      ctx.fill()

      // Label
      ctx.fillStyle = legendFontColor
      ctx.textAlign = 'left'
      const text = `${s.name} ${Math.round(s.data / total * 100)}%`
      ctx.fillText(text, lx + 16 * pr, legendY)

      lx += ctx.measureText(text).width + 32 * pr

      // Wrap to next line if needed
      if (lx > w - 60 * pr) {
        lx = legendStartX
      }
    })
  }
}

uCharts.prototype.updateData = function(data) {
  if (data.categories) this.categories = data.categories
  if (data.series) this.series = data.series
  if (data.title) this.title = { ...this.title, ...data.title }
  if (data.subtitle) this.subtitle = { ...this.subtitle, ...data.subtitle }
  this.render(this.canvas, this.ctx)
}

module.exports = uCharts