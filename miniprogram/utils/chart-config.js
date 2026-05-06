/**
 * chart-config.js - Enhanced chart configuration builder for uCharts
 * Generates theme-aware chart configurations for ring, bar, and line charts.
 */

const { THEMES, getCurrentThemeId } = require('../styles/themes')

// Chart color palettes per theme
const CHART_PALETTES = {
  'ink-gold': ['#C9A96E', '#E8D5A8', '#4ADE80', '#F87171', '#60A5FA', '#A78BFA', '#FBBF24', '#06D6A0', '#F43F5E'],
  'cloud-pearl': ['#5B7FFF', '#8DA4FF', '#16A34A', '#DC2626', '#7C3AED', '#D97706', '#2563EB', '#22C55E', '#EF4444'],
  'neon-night': ['#8B5CF6', '#06D6A0', '#A78BFA', '#F43F5E', '#60A5FA', '#FBBF24', '#34D399', '#FB7185', '#818CF8'],
  'zen-mist': ['#8B7355', '#B8A088', '#5A7D4A', '#A0522D', '#6B7B8D', '#B8860B', '#6B5740', '#7A9668', '#9B6B40']
}

// Income type colors (6 types: dining, chess, liquor, teatime, service, other)
const INCOME_COLORS = {
  'ink-gold': ['#C9A96E', '#E8D5A8', '#4ADE80', '#60A5FA', '#A78BFA', '#6B7B8D'],
  'cloud-pearl': ['#5B7FFF', '#16A34A', '#D97706', '#7C3AED', '#2563EB', '#909399'],
  'neon-night': ['#8B5CF6', '#06D6A0', '#FBBF24', '#60A5FA', '#A78BFA', '#6B7B8D'],
  'zen-mist': ['#8B7355', '#5A7D4A', '#B8860B', '#6B7B8D', '#6B5740', '#909399']
}

// Expense category colors (5 categories: salary, rent, utilities, supplies, other)
const EXPENSE_COLORS = {
  'ink-gold': ['#F87171', '#C9A96E', '#60A5FA', '#4ADE80', '#6B7B8D'],
  'cloud-pearl': ['#DC2626', '#5B7FFF', '#D97706', '#16A34A', '#909399'],
  'neon-night': ['#F43F5E', '#8B5CF6', '#60A5FA', '#06D6A0', '#6B7B8D'],
  'zen-mist': ['#A0522D', '#8B7355', '#6B7B8D', '#5A7D4A', '#909399']
}

/**
 * Get color palette for a theme
 */
function _getPalette(themeId) {
  return CHART_PALETTES[themeId] || CHART_PALETTES['ink-gold']
}

/**
 * Get theme colors for chart background/text
 */
function _getThemeColors(themeId) {
  const theme = THEMES[themeId] || THEMES['ink-gold']
  return {
    background: theme.isDark ? '#1A1A2E' : '#FFFFFF',
    textPrimary: theme.text.primary,
    textSecondary: theme.text.secondary,
    textMuted: theme.text.muted,
    divider: theme.divider,
    accent: theme.accent,
    isDark: theme.isDark
  }
}

/**
 * Build ring (donut/pie) chart configuration
 * @param {string} theme - Theme ID
 * @param {Array} series - [{name, data}] series data
 * @param {object} opts - Optional overrides {width, height, title, subtitle, ...}
 * @returns {object} uCharts config object
 */
function getRingChartConfig(theme, series, opts) {
  opts = opts || {}
  const themeId = theme || getCurrentThemeId()
  const palette = opts.colors || _getPalette(themeId)
  const tc = _getThemeColors(themeId)
  const width = opts.width || 375
  const height = opts.height || 280

  return {
    type: 'ring',
    width: width,
    height: height,
    series: series,
    animation: true,
    rotate: false,
    rotateLock: false,
    background: tc.background,
    colorCount: palette.length,
    colors: palette,
    padding: opts.padding || [15, 15, 15, 15],
    title: opts.title || '',
    subtitle: opts.subtitle || '',
    dataLabel: opts.dataLabel !== false,
    legend: {
      show: false,
      position: 'bottom',
      float: 'center',
      padding: 5,
      margin: 0,
      fontSize: 12,
      lineHeight: 16,
      fontColor: tc.textSecondary,
      itemGap: 12
    },
    extra: {
      ring: {
        ringWidth: opts.ringWidth || 30,
        activeOpacity: 0.5,
        activeRadius: 8,
        offsetAngle: 0,
        labelWidth: 15,
        border: true,
        borderWidth: 2,
        borderColor: tc.background
      },
      tooltip: {
        show: true,
        borderRadius: 6,
        bgOpacity: 0.9,
        fontSize: 12,
        fontColor: tc.isDark ? '#F5F0E8' : '#303133',
        bgColor: tc.isDark ? '#252540' : '#FFFFFF'
      }
    },
    _pixelRatio: 1,
    _scrollDuration: 0
  }
}

/**
 * Build bar chart configuration
 * @param {string} theme - Theme ID
 * @param {Array} categories - X-axis labels (e.g. dates)
 * @param {Array} series - [{name, data}] series data
 * @param {object} opts - Optional overrides
 * @returns {object} uCharts config object
 */
function getBarChartConfig(theme, categories, series, opts) {
  opts = opts || {}
  const themeId = theme || getCurrentThemeId()
  const palette = _getPalette(themeId)
  const tc = _getThemeColors(themeId)
  const width = opts.width || 375
  const height = opts.height || 280

  return {
    type: 'column',
    width: width,
    height: height,
    categories: categories,
    series: series,
    animation: true,
    rotate: false,
    rotateLock: false,
    background: tc.background,
    colorCount: palette.length,
    colors: palette,
    padding: opts.padding || [18, 15, 5, 15],
    enableScroll: opts.enableScroll || false,
    dataLabel: opts.dataLabel !== false,
    dataPointShape: false,
    legend: {
      show: opts.showLegend !== false,
      position: opts.legendPosition || 'bottom',
      float: opts.legendFloat || 'center',
      padding: 5,
      margin: 0,
      fontSize: 12,
      lineHeight: 16,
      fontColor: tc.textSecondary,
      itemGap: 12
    },
    xAxis: {
      disabled: false,
      axisLine: true,
      axisLineColor: tc.divider,
      calibration: false,
      fontColor: tc.textSecondary,
      fontSize: 11,
      rotateLabel: opts.rotateLabel || false,
      itemCount: opts.itemCount || 5,
      boundaryGap: 'center',
      gridColor: tc.divider,
      gridType: 'solid',
      dashLength: 4,
      labelCount: opts.labelCount || 5,
      splitNumber: opts.splitNumber || 5
    },
    yAxis: {
      disabled: false,
      axisLine: false,
      axisLineColor: tc.divider,
      calibration: false,
      fontColor: tc.textSecondary,
      fontSize: 11,
      data: opts.yAxisData || [
        {
          min: opts.yMin,
          max: opts.yMax,
          format: opts.yFormat || function(val) { return val.toFixed(0) }
        }
      ],
      gridType: 'dash',
      dashLength: 4,
      gridColor: tc.divider,
      splitNumber: opts.ySplitNumber || 5
    },
    extra: {
      column: {
        type: 'group',
        width: opts.barWidth || 20,
        seriesGap: 2,
        categoryGap: 2,
        activeBgColor: tc.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        activeBgOpacity: 0.5,
        barBorderRadius: opts.barBorderRadius || [4, 4, 0, 0],
        meterBorder: 0,
        meterFillColor: palette[0]
      },
      tooltip: {
        show: true,
        borderRadius: 6,
        bgOpacity: 0.9,
        fontSize: 12,
        fontColor: tc.isDark ? '#F5F0E8' : '#303133',
        bgColor: tc.isDark ? '#252540' : '#FFFFFF'
      }
    },
    _pixelRatio: 1,
    _scrollDuration: 0
  }
}

/**
 * Build line/trend chart configuration
 * @param {string} theme - Theme ID
 * @param {Array} categories - X-axis labels
 * @param {Array} series - [{name, data, color?}] series data
 * @param {object} opts - Optional overrides {areaFill, smooth, ...}
 * @returns {object} uCharts config object
 */
function getLineChartConfig(theme, categories, series, opts) {
  opts = opts || {}
  const themeId = theme || getCurrentThemeId()
  const palette = _getPalette(themeId)
  const tc = _getThemeColors(themeId)
  const width = opts.width || 375
  const height = opts.height || 280

  // Apply per-series custom colors
  const coloredSeries = series.map(function(s, i) {
    return { ...s, color: s.color || palette[i % palette.length] }
  })

  return {
    type: 'line',
    width: width,
    height: height,
    categories: categories,
    series: coloredSeries,
    animation: true,
    rotate: false,
    rotateLock: false,
    background: tc.background,
    colorCount: palette.length,
    colors: palette,
    padding: opts.padding || [18, 15, 5, 15],
    enableScroll: opts.enableScroll || false,
    dataLabel: opts.dataLabel || false,
    dataPointShape: opts.dataPointShape !== false,
    dataPointShapeType: 'hollow',
    legend: {
      show: opts.showLegend !== false,
      position: opts.legendPosition || 'bottom',
      float: opts.legendFloat || 'center',
      padding: 5,
      margin: 0,
      fontSize: 12,
      lineHeight: 16,
      fontColor: tc.textSecondary,
      itemGap: 12
    },
    xAxis: {
      disabled: false,
      axisLine: true,
      axisLineColor: tc.divider,
      calibration: false,
      fontColor: tc.textSecondary,
      fontSize: 11,
      rotateLabel: opts.rotateLabel || false,
      itemCount: opts.itemCount || 5,
      boundaryGap: 'justify',
      gridColor: tc.divider,
      gridType: 'solid',
      dashLength: 4,
      labelCount: opts.labelCount || 5,
      splitNumber: opts.splitNumber || 5
    },
    yAxis: {
      disabled: false,
      axisLine: false,
      axisLineColor: tc.divider,
      calibration: false,
      fontColor: tc.textSecondary,
      fontSize: 11,
      data: opts.yAxisData || [
        {
          min: opts.yMin,
          max: opts.yMax,
          format: opts.yFormat || function(val) { return val.toFixed(0) }
        }
      ],
      gridType: 'dash',
      dashLength: 4,
      gridColor: tc.divider,
      splitNumber: opts.ySplitNumber || 5
    },
    extra: {
      line: {
        type: 'curve',
        width: opts.lineWidth || 2,
        activeType: 'hollow',
        activeWidth: 6,
        activeColor: tc.accent,
        linearType: 'none',
        linearOpacity: 0.3,
        addLine: false,
        // Smooth bezier curves
        smooth: opts.smooth !== false,
        // Area fill under the line
        area: opts.areaFill || false,
        areaOpacity: opts.areaOpacity || 0.15
      },
      tooltip: {
        show: true,
        borderRadius: 6,
        bgOpacity: 0.9,
        fontSize: 12,
        fontColor: tc.isDark ? '#F5F0E8' : '#303133',
        bgColor: tc.isDark ? '#252540' : '#FFFFFF',
        horizLine: true,
        xAxisHoriLine: true
      }
    },
    _pixelRatio: 1,
    _scrollDuration: 0
  }
}

/**
 * Get ordered color array for 6 income types
 * Order: dining, chess, liquor, teatime, service, other
 * @param {string} themeId - Theme ID
 * @returns {Array<string>} Color array
 */
function getIncomeTypeColors(themeId) {
  themeId = themeId || getCurrentThemeId()
  return INCOME_COLORS[themeId] || INCOME_COLORS['ink-gold']
}

/**
 * Get ordered color array for expense categories
 * Order: salary, rent, utilities, supplies, other
 * @param {string} themeId - Theme ID
 * @returns {Array<string>} Color array
 */
function getExpenseTypeColors(themeId) {
  themeId = themeId || getCurrentThemeId()
  return EXPENSE_COLORS[themeId] || EXPENSE_COLORS['ink-gold']
}

module.exports = {
  getRingChartConfig,
  getBarChartConfig,
  getLineChartConfig,
  getIncomeTypeColors,
  getExpenseTypeColors
}
