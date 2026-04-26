/**
 * Design Tokens - Premium WeChat Mini-Program
 *
 * Central source of truth for spacing, radius, elevation,
 * typography, animation, and font-family tokens.
 * All dimensional values are in rpx unless otherwise noted.
 */

const SPACING = {
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 96
}

const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  full: 999
}

const ELEVATION = {
  level0: 'none',
  level1: '0 2rpx 8rpx rgba(0, 0, 0, 0.08)',
  level2: '0 8rpx 24rpx rgba(0, 0, 0, 0.12)',
  level3: '0 16rpx 48rpx rgba(0, 0, 0, 0.16)',
  level4: '0 24rpx 64rpx rgba(0, 0, 0, 0.24)'
}

const TYPOGRAPHY = {
  display: { size: 56, weight: 800 },
  title1: { size: 44, weight: 700 },
  title2: { size: 36, weight: 600 },
  title3: { size: 32, weight: 600 },
  body: { size: 30, weight: 400 },
  bodySmall: { size: 28, weight: 400 },
  caption: { size: 26, weight: 400 },
  overline: { size: 24, weight: 500 }
}

const ANIMATION = {
  durationInstant: 100,
  durationFast: 200,
  durationNormal: 300,
  durationSlow: 500,
  durationSlower: 800,
  easeDefault: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  staggerDelay: 50
}

const FONT_FAMILY = {
  default: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
  mono: "'DIN Alternate', 'SF Mono', -apple-system, monospace"
}

module.exports = { SPACING, RADIUS, ELEVATION, TYPOGRAPHY, ANIMATION, FONT_FAMILY }
