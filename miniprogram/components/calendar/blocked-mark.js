/**
 * blocked-mark.js - Pure calendar-cell marking for blocked dates.
 * Kept outside the Component so it can be unit tested.
 */

function applyBlockedFlags(days, blockedDates) {
  const set = {}
  ;(blockedDates || []).forEach(function(b) {
    if (b && b.dateStr) set[b.dateStr] = true
  })
  return (days || []).map(function(d) {
    if (set[d.dateStr]) return Object.assign({}, d, { isBlocked: true })
    return d
  })
}

module.exports = { applyBlockedFlags }
