/**
 * feature-flags.js - Feature flags for gradual rollout
 *
 * 当 AI Skill 还在审核/测试阶段时，将 AI_ENABLED 设为 false，
 * 所有 AI 入口（首页FAB、胶囊Agent、AI聊天页）将被隐藏。
 * 代码和文件保留在项目中，等审核通过后只需改为 true 即可恢复。
 *
 * 使用方式：
 *   const { AI_ENABLED } = require('../utils/feature-flags')
 *   if (AI_ENABLED) { ... }
 */
module.exports = {
  // AI 功能总开关 — 审核期间设为 false，审核通过后改为 true
  AI_ENABLED: false
}
