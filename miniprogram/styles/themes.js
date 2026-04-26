/**
 * Theme System - Premium WeChat Mini-Program
 *
 * Four premium themes with full token coverage.
 * Each theme provides all color tokens needed by every page and component.
 */

const THEMES = {
  'ink-gold': {
    id: 'ink-gold',
    name: '墨金',
    description: '深邃墨色搭配金色点缀，尽显沉稳奢华',
    isDark: true,

    // Core palette
    primary: '#0F0F1A',
    surface: '#1A1A2E',
    elevated: '#252540',
    card: 'rgba(26, 26, 46, 0.85)',
    glass: 'rgba(255, 255, 255, 0.06)',

    accent: '#C9A96E',
    accentLight: '#E8D5A8',
    accentDark: '#A68B4B',
    accentBg: 'rgba(201,169,110,0.15)',

    // Gradients
    gradient: {
      header: 'linear-gradient(135deg, #1A1A2E 0%, #252540 100%)',
      button: 'linear-gradient(135deg, #C9A96E 0%, #E8D5A8 100%)',
      fab: 'linear-gradient(135deg, #C9A96E 0%, #D4B87A 100%)',
      avatar: 'linear-gradient(135deg, #C9A96E 0%, #8B6F3A 100%)',
      profit: 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)',
      loss: 'linear-gradient(135deg, #9B2335 0%, #C1404D 100%)'
    },

    // Text
    text: {
      primary: '#F5F0E8',
      secondary: 'rgba(245, 240, 232, 0.65)',
      muted: 'rgba(245, 240, 232, 0.40)',
      disabled: 'rgba(245, 240, 232, 0.20)',
      inverse: '#0F0F1A'
    },

    divider: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.10)',

    // Status
    status: {
      success: '#4ADE80',
      successBg: 'rgba(74, 222, 128, 0.12)',
      warning: '#FBBF24',
      warningBg: 'rgba(251, 191, 36, 0.12)',
      danger: '#F87171',
      dangerBg: 'rgba(248, 113, 113, 0.12)',
      info: '#60A5FA',
      infoBg: 'rgba(96, 165, 250, 0.12)'
    },

    // Amount (financial)
    amount: {
      positive: '#4ADE80',
      positiveBg: 'rgba(74, 222, 128, 0.10)',
      negative: '#F87171',
      negativeBg: 'rgba(248, 113, 113, 0.10)'
    },

    // Reservation tags
    tags: {
      reserved: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60A5FA' },
      confirmed: { bg: 'rgba(74, 222, 128, 0.15)', text: '#4ADE80' },
      cancelled: { bg: 'rgba(248, 113, 113, 0.15)', text: '#F87171' },
      completed: { bg: 'rgba(201, 169, 110, 0.15)', text: '#C9A96E' }
    },

    // Role tags
    roleTags: {
      boss: { bg: 'rgba(201, 169, 110, 0.18)', text: '#E8D5A8' },
      admin: { bg: 'rgba(139, 92, 246, 0.18)', text: '#A78BFA' },
      purchase: { bg: 'rgba(96, 165, 250, 0.18)', text: '#60A5FA' },
      chef: { bg: 'rgba(251, 191, 36, 0.18)', text: '#FBBF24' },
      waiter: { bg: 'rgba(74, 222, 128, 0.18)', text: '#4ADE80' }
    },

    // Navigation
    navBar: {
      bg: '#0F0F1A',
      frontColor: '#ffffff'
    },

    tabBar: {
      bg: '#0F0F1A',
      selectedColor: '#C9A96E',
      unselectedColor: 'rgba(245, 240, 232, 0.45)',
      borderStyle: 'black'
    },

    // Shadows
    shadows: {
      sm: '0 2rpx 8rpx rgba(0, 0, 0, 0.20)',
      md: '0 8rpx 24rpx rgba(0, 0, 0, 0.28)',
      lg: '0 16rpx 48rpx rgba(0, 0, 0, 0.36)'
    },

    // Glow (empty for non-neon themes)
    glow: {
      accent: ''
    }
  },

  'cloud-pearl': {
    id: 'cloud-pearl',
    name: '云珠',
    description: '清新云白搭配蓝光流转，简约优雅的商务格调',
    isDark: false,

    primary: '#2D3748',
    surface: '#F7F8FA',
    elevated: '#FFFFFF',
    card: 'rgba(255, 255, 255, 0.92)',
    glass: 'rgba(255, 255, 255, 0.70)',

    accent: '#5B7FFF',
    accentLight: '#8DA4FF',
    accentDark: '#3D5FCC',
    accentBg: 'rgba(91,127,255,0.15)',

    gradient: {
      header: 'linear-gradient(135deg, #5B7FFF 0%, #8DA4FF 100%)',
      button: 'linear-gradient(135deg, #5B7FFF 0%, #3D5FCC 100%)',
      fab: 'linear-gradient(135deg, #5B7FFF 0%, #7B96FF 100%)',
      avatar: 'linear-gradient(135deg, #5B7FFF 0%, #3D5FCC 100%)',
      profit: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
      loss: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
    },

    text: {
      primary: '#1A202C',
      secondary: 'rgba(26, 32, 44, 0.60)',
      muted: 'rgba(26, 32, 44, 0.38)',
      disabled: 'rgba(26, 32, 44, 0.20)',
      inverse: '#FFFFFF'
    },

    divider: 'rgba(0, 0, 0, 0.06)',
    border: 'rgba(0, 0, 0, 0.08)',

    status: {
      success: '#16A34A',
      successBg: 'rgba(22, 163, 74, 0.08)',
      warning: '#D97706',
      warningBg: 'rgba(217, 119, 6, 0.08)',
      danger: '#DC2626',
      dangerBg: 'rgba(220, 38, 38, 0.08)',
      info: '#2563EB',
      infoBg: 'rgba(37, 99, 235, 0.08)'
    },

    amount: {
      positive: '#16A34A',
      positiveBg: 'rgba(22, 163, 74, 0.08)',
      negative: '#DC2626',
      negativeBg: 'rgba(220, 38, 38, 0.08)'
    },

    tags: {
      reserved: { bg: 'rgba(37, 99, 235, 0.10)', text: '#2563EB' },
      confirmed: { bg: 'rgba(22, 163, 74, 0.10)', text: '#16A34A' },
      cancelled: { bg: 'rgba(220, 38, 38, 0.10)', text: '#DC2626' },
      completed: { bg: 'rgba(91, 127, 255, 0.10)', text: '#5B7FFF' }
    },

    roleTags: {
      boss: { bg: 'rgba(91, 127, 255, 0.10)', text: '#3D5FCC' },
      admin: { bg: 'rgba(139, 92, 246, 0.10)', text: '#7C3AED' },
      purchase: { bg: 'rgba(37, 99, 235, 0.10)', text: '#2563EB' },
      chef: { bg: 'rgba(217, 119, 6, 0.10)', text: '#D97706' },
      waiter: { bg: 'rgba(22, 163, 74, 0.10)', text: '#16A34A' }
    },

    navBar: {
      bg: '#F7F8FA',
      frontColor: '#000000'
    },

    tabBar: {
      bg: '#FFFFFF',
      selectedColor: '#5B7FFF',
      unselectedColor: 'rgba(26, 32, 44, 0.40)',
      borderStyle: 'white'
    },

    shadows: {
      sm: '0 2rpx 8rpx rgba(0, 0, 0, 0.06)',
      md: '0 8rpx 24rpx rgba(0, 0, 0, 0.08)',
      lg: '0 16rpx 48rpx rgba(0, 0, 0, 0.10)'
    },

    glow: {
      accent: ''
    }
  },

  'neon-night': {
    id: 'neon-night',
    name: '霓虹',
    description: '暗夜霓虹闪烁，紫光薄荷交织的赛博幻境',
    isDark: true,

    primary: '#0A0A14',
    surface: '#12122A',
    elevated: '#1E1E3A',
    card: 'rgba(18, 18, 42, 0.88)',
    glass: 'rgba(255, 255, 255, 0.04)',

    accent: '#8B5CF6',
    accentLight: '#A78BFA',
    accentDark: '#7C3AED',
    accentBg: 'rgba(139,92,246,0.15)',

    // Secondary accent for neon theme
    accent2: '#06D6A0',
    accent2Bg: 'rgba(6,214,160,0.15)',

    gradient: {
      header: 'linear-gradient(135deg, #12122A 0%, #1E1E3A 50%, #2D1B69 100%)',
      button: 'linear-gradient(135deg, #8B5CF6 0%, #06D6A0 100%)',
      fab: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
      avatar: 'linear-gradient(135deg, #8B5CF6 0%, #06D6A0 100%)',
      profit: 'linear-gradient(135deg, #06D6A0 0%, #34D399 100%)',
      loss: 'linear-gradient(135deg, #F43F5E 0%, #FB7185 100%)'
    },

    text: {
      primary: '#F0EEFF',
      secondary: 'rgba(240, 238, 255, 0.65)',
      muted: 'rgba(240, 238, 255, 0.40)',
      disabled: 'rgba(240, 238, 255, 0.20)',
      inverse: '#0A0A14'
    },

    divider: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(255, 255, 255, 0.08)',

    status: {
      success: '#06D6A0',
      successBg: 'rgba(6, 214, 160, 0.12)',
      warning: '#FBBF24',
      warningBg: 'rgba(251, 191, 36, 0.12)',
      danger: '#F43F5E',
      dangerBg: 'rgba(244, 63, 94, 0.12)',
      info: '#60A5FA',
      infoBg: 'rgba(96, 165, 250, 0.12)'
    },

    amount: {
      positive: '#06D6A0',
      positiveBg: 'rgba(6, 214, 160, 0.10)',
      negative: '#F43F5E',
      negativeBg: 'rgba(244, 63, 94, 0.10)'
    },

    tags: {
      reserved: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60A5FA' },
      confirmed: { bg: 'rgba(6, 214, 160, 0.15)', text: '#06D6A0' },
      cancelled: { bg: 'rgba(244, 63, 94, 0.15)', text: '#F43F5E' },
      completed: { bg: 'rgba(139, 92, 246, 0.15)', text: '#A78BFA' }
    },

    roleTags: {
      boss: { bg: 'rgba(139, 92, 246, 0.20)', text: '#A78BFA' },
      admin: { bg: 'rgba(6, 214, 160, 0.20)', text: '#06D6A0' },
      purchase: { bg: 'rgba(96, 165, 250, 0.20)', text: '#60A5FA' },
      chef: { bg: 'rgba(251, 191, 36, 0.20)', text: '#FBBF24' },
      waiter: { bg: 'rgba(6, 214, 160, 0.20)', text: '#34D399' }
    },

    navBar: {
      bg: '#0A0A14',
      frontColor: '#ffffff'
    },

    tabBar: {
      bg: '#0A0A14',
      selectedColor: '#8B5CF6',
      unselectedColor: 'rgba(240, 238, 255, 0.40)',
      borderStyle: 'black'
    },

    shadows: {
      sm: '0 2rpx 8rpx rgba(0, 0, 0, 0.30)',
      md: '0 8rpx 24rpx rgba(0, 0, 0, 0.40)',
      lg: '0 16rpx 48rpx rgba(0, 0, 0, 0.50)'
    },

    // Neon glow effects
    glow: {
      accent: '0 0 20rpx rgba(139, 92, 246, 0.50)'
    }
  },

  'zen-mist': {
    id: 'zen-mist',
    name: '禅雾',
    description: '温润雾白与大地色交融，禅意悠然的东方美学',
    isDark: false,

    primary: '#3D3229',
    surface: '#FAF6F1',
    elevated: '#FFFFFF',
    card: 'rgba(255, 255, 255, 0.95)',
    glass: 'rgba(250, 246, 241, 0.70)',

    accent: '#8B7355',
    accentLight: '#B8A088',
    accentDark: '#6B5740',
    accentBg: 'rgba(139,115,85,0.15)',

    gradient: {
      header: 'linear-gradient(135deg, #8B7355 0%, #B8A088 100%)',
      button: 'linear-gradient(135deg, #8B7355 0%, #6B5740 100%)',
      fab: 'linear-gradient(135deg, #8B7355 0%, #A08E74 100%)',
      avatar: 'linear-gradient(135deg, #8B7355 0%, #6B5740 100%)',
      profit: 'linear-gradient(135deg, #6B8F5B 0%, #5A7D4A 100%)',
      loss: 'linear-gradient(135deg, #A0522D 0%, #8B4513 100%)'
    },

    text: {
      primary: '#2D2418',
      secondary: 'rgba(45, 36, 24, 0.60)',
      muted: 'rgba(45, 36, 24, 0.38)',
      disabled: 'rgba(45, 36, 24, 0.20)',
      inverse: '#FFFFFF'
    },

    divider: 'rgba(0, 0, 0, 0.06)',
    border: 'rgba(0, 0, 0, 0.08)',

    status: {
      success: '#5A7D4A',
      successBg: 'rgba(90, 125, 74, 0.08)',
      warning: '#B8860B',
      warningBg: 'rgba(184, 134, 11, 0.08)',
      danger: '#A0522D',
      dangerBg: 'rgba(160, 82, 45, 0.08)',
      info: '#6B7B8D',
      infoBg: 'rgba(107, 123, 141, 0.08)'
    },

    amount: {
      positive: '#5A7D4A',
      positiveBg: 'rgba(90, 125, 74, 0.08)',
      negative: '#A0522D',
      negativeBg: 'rgba(160, 82, 45, 0.08)'
    },

    tags: {
      reserved: { bg: 'rgba(107, 123, 141, 0.10)', text: '#6B7B8D' },
      confirmed: { bg: 'rgba(90, 125, 74, 0.10)', text: '#5A7D4A' },
      cancelled: { bg: 'rgba(160, 82, 45, 0.10)', text: '#A0522D' },
      completed: { bg: 'rgba(139, 115, 85, 0.10)', text: '#8B7355' }
    },

    roleTags: {
      boss: { bg: 'rgba(139, 115, 85, 0.12)', text: '#6B5740' },
      admin: { bg: 'rgba(107, 123, 141, 0.12)', text: '#6B7B8D' },
      purchase: { bg: 'rgba(107, 123, 141, 0.12)', text: '#6B7B8D' },
      chef: { bg: 'rgba(184, 134, 11, 0.12)', text: '#B8860B' },
      waiter: { bg: 'rgba(90, 125, 74, 0.12)', text: '#5A7D4A' }
    },

    navBar: {
      bg: '#FAF6F1',
      frontColor: '#000000'
    },

    tabBar: {
      bg: '#FFFFFF',
      selectedColor: '#8B7355',
      unselectedColor: 'rgba(45, 36, 24, 0.40)',
      borderStyle: 'white'
    },

    shadows: {
      sm: '0 2rpx 8rpx rgba(61, 50, 41, 0.06)',
      md: '0 8rpx 24rpx rgba(61, 50, 41, 0.08)',
      lg: '0 16rpx 48rpx rgba(61, 50, 41, 0.10)'
    },

    glow: {
      accent: ''
    }
  }
}

/**
 * Legacy theme ID migration map.
 * Maps old single-word theme IDs to the new premium theme IDs.
 */
const LEGACY_THEME_MAP = {
  green: 'ink-gold',
  red: 'neon-night',
  silver: 'cloud-pearl'
}

/**
 * Get the current theme ID from storage.
 * Migrates any legacy theme IDs automatically.
 * Falls back to 'ink-gold' if no theme is set.
 * @returns {string} Theme ID
 */
function getCurrentThemeId() {
  let themeId = wx.getStorageSync('theme')
  if (!themeId) {
    return 'ink-gold'
  }
  // Migrate legacy IDs
  if (LEGACY_THEME_MAP[themeId]) {
    themeId = LEGACY_THEME_MAP[themeId]
    wx.setStorageSync('theme', themeId)
  }
  // Validate that the theme exists
  if (!THEMES[themeId]) {
    return 'ink-gold'
  }
  return themeId
}

/**
 * Flatten a nested object into dot-notation keys.
 * e.g. { text: { primary: '#fff' } } -> { 'text.primary': '#fff' }
 * @param {object} obj - Nested object
 * @param {string} prefix - Key prefix for recursion
 * @returns {object} Flat object with dot-notation keys
 */
function _flatten(obj, prefix) {
  const result = {}
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? prefix + key.charAt(0).toUpperCase() + key.slice(1) : key
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.rgba !== 'function') {
      // Check if it's a plain object (not a string, number, etc.)
      if (Object.prototype.toString.call(value) === '[object Object]') {
        Object.assign(result, _flatten(value, fullKey))
      } else {
        result[fullKey] = value
      }
    } else {
      result[fullKey] = value
    }
  }
  return result
}

/**
 * Get a flat object of all theme tokens suitable for page data binding.
 * Produces keys like: cardBg, accentColor, textPrimary, gradientHeader, etc.
 * @param {string} themeId - Theme ID (defaults to current theme)
 * @returns {object} Flat object with camelCase keys for setData binding
 */
function getThemePageData(themeId) {
  const id = themeId || getCurrentThemeId()
  const theme = THEMES[id]
  if (!theme) return {}

  const flat = {}

  // Direct top-level color properties
  flat.primaryColor = theme.primary
  flat.surfaceColor = theme.surface
  flat.elevatedColor = theme.elevated
  flat.cardBg = theme.card
  flat.glassBg = theme.glass
  flat.accentColor = theme.accent
  flat.accentLightColor = theme.accentLight
  flat.accentDarkColor = theme.accentDark
  if (theme.accent2) {
    flat.accent2Color = theme.accent2
    flat.accent2Bg = theme.accent2Bg || (theme.accent2 + '26')
  }
  flat.accentBg = theme.accentBg || (theme.accent + '26')  // 15% opacity hex
  flat.dividerColor = theme.divider
  flat.borderColor = theme.border
  flat.isDark = theme.isDark

  // Gradient
  flat.gradientHeader = theme.gradient.header
  flat.gradientButton = theme.gradient.button
  flat.gradientFab = theme.gradient.fab
  flat.gradientAvatar = theme.gradient.avatar
  flat.gradientProfit = theme.gradient.profit
  flat.gradientLoss = theme.gradient.loss

  // Text
  flat.textPrimary = theme.text.primary
  flat.textSecondary = theme.text.secondary
  flat.textMuted = theme.text.muted
  flat.textDisabled = theme.text.disabled
  flat.textInverse = theme.text.inverse

  // Status
  flat.statusSuccess = theme.status.success
  flat.statusSuccessBg = theme.status.successBg
  flat.statusWarning = theme.status.warning
  flat.statusWarningBg = theme.status.warningBg
  flat.statusDanger = theme.status.danger
  flat.statusDangerBg = theme.status.dangerBg
  flat.statusInfo = theme.status.info
  flat.statusInfoBg = theme.status.infoBg

  // Amount
  flat.amountPositive = theme.amount.positive
  flat.amountPositiveBg = theme.amount.positiveBg
  flat.amountNegative = theme.amount.negative
  flat.amountNegativeBg = theme.amount.negativeBg

  // Tags - reservation
  flat.tagReservedBg = theme.tags.reserved.bg
  flat.tagReservedText = theme.tags.reserved.text
  flat.tagConfirmedBg = theme.tags.confirmed.bg
  flat.tagConfirmedText = theme.tags.confirmed.text
  flat.tagCancelledBg = theme.tags.cancelled.bg
  flat.tagCancelledText = theme.tags.cancelled.text
  flat.tagCompletedBg = theme.tags.completed.bg
  flat.tagCompletedText = theme.tags.completed.text

  // Role tags
  flat.roleBossBg = theme.roleTags.boss.bg
  flat.roleBossText = theme.roleTags.boss.text
  flat.roleAdminBg = theme.roleTags.admin.bg
  flat.roleAdminText = theme.roleTags.admin.text
  flat.rolePurchaseBg = theme.roleTags.purchase.bg
  flat.rolePurchaseText = theme.roleTags.purchase.text
  flat.roleChefBg = theme.roleTags.chef.bg
  flat.roleChefText = theme.roleTags.chef.text
  flat.roleWaiterBg = theme.roleTags.waiter.bg
  flat.roleWaiterText = theme.roleTags.waiter.text

  // Nav bar
  flat.navBarBg = theme.navBar.bg
  flat.navBarFrontColor = theme.navBar.frontColor

  // Tab bar
  flat.tabBarBg = theme.tabBar.bg
  flat.tabBarSelectedColor = theme.tabBar.selectedColor
  flat.tabBarUnselectedColor = theme.tabBar.unselectedColor
  flat.tabBarBorderStyle = theme.tabBar.borderStyle

  // Shadows
  flat.shadowSm = theme.shadows.sm
  flat.shadowMd = theme.shadows.md
  flat.shadowLg = theme.shadows.lg

  // Glow
  flat.glowAccent = theme.glow.accent

  return flat
}

/**
 * Get a list of themes for the theme switcher UI.
 * @returns {Array<{id: string, name: string, description: string, previewColors: string[]}>}
 */
function getThemeList() {
  return [
    {
      id: 'ink-gold',
      name: THEMES['ink-gold'].name,
      description: THEMES['ink-gold'].description,
      previewColors: ['#1A1A2E', '#C9A96E', '#E8D5A8']
    },
    {
      id: 'cloud-pearl',
      name: THEMES['cloud-pearl'].name,
      description: THEMES['cloud-pearl'].description,
      previewColors: ['#F7F8FA', '#5B7FFF', '#8DA4FF']
    },
    {
      id: 'neon-night',
      name: THEMES['neon-night'].name,
      description: THEMES['neon-night'].description,
      previewColors: ['#12122A', '#8B5CF6', '#06D6A0']
    },
    {
      id: 'zen-mist',
      name: THEMES['zen-mist'].name,
      description: THEMES['zen-mist'].description,
      previewColors: ['#FAF6F1', '#8B7355', '#B8A088']
    }
  ]
}

module.exports = { THEMES, getCurrentThemeId, getThemePageData, getThemeList, LEGACY_THEME_MAP }
