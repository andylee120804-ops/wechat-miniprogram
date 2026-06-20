/**
 * Theme System - Premium WeChat Mini-Program
 *
 * Single theme: ink-gold (墨金). All other themes have been removed.
 */

const INK_GOLD_THEME = {
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
    fab: 'linear-gradient(145deg, #E8D5A8 0%, #C9A96E 40%, #A68B4B 100%)',
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
    md: '0 8rpx 24rpx rgba(0, 0, 0, 0.28), 0 4rpx 16rpx rgba(201, 169, 110, 0.20)',
    lg: '0 16rpx 48rpx rgba(0, 0, 0, 0.36)'
  },

  // Glow
  glow: {
    accent: ''
  }
}

/**
 * Get the current theme ID from storage.
 * Always returns 'ink-gold'.
 * @returns {string} Theme ID
 */
function getCurrentThemeId() {
  return 'ink-gold'
}

/**
 * Get a flat object of all theme tokens suitable for page data binding.
 * @param {string} themeId - Theme ID (defaults to current theme)
 * @returns {object} Flat object with camelCase keys for setData binding
 */
function getThemePageData(themeId) {
  const theme = INK_GOLD_THEME
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
  flat.accentBg = theme.accentBg || (theme.accent + '26')
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

const THEMES = { 'ink-gold': INK_GOLD_THEME }

module.exports = { THEMES, getCurrentThemeId, getThemePageData }
