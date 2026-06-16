/**
 * settings-cache.js - Per-instance settings cache for reservation-add page.
 *
 * Caches the full settings collection in memory (page-scoped) so that
 * shouldSync/isDishPriceRequired/syncIncome/syncBanquetPurchase don't repeatedly
 * query the same data within a single page session.
 *
 * Usage:
 *   const cache = createSettingsCache()
 *   const settings = await cache.get()
 */
const db = require('../../../utils/db')
const { COLLECTIONS } = require('../../../utils/db')

function createSettingsCache() {
  let cached = null

  return {
    async get() {
      if (cached) return cached
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = {}
      ;(res.data || []).forEach(function(s) {
        if (!(s.key in settings)) {
          settings[s.key] = s.key === 'approval_rules' ? s : (s.value !== undefined ? s.value : s)
        }
      })
      cached = settings
      return cached
    },

    invalidate() {
      cached = null
    }
  }
}

module.exports = { createSettingsCache }
