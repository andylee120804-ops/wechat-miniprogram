/**
 * blocked-date.js - Blocked reservation dates (holidays, closures...).
 *
 * One record per date in the blocked_date collection:
 *   { date: 'YYYY-MM-DD', slots: ['noon','night'], reason, createdBy, createdByName, createdAt }
 * slots contains 'noon' (中午) and/or 'night' (晚上); both present = full day.
 */
const db = require('./db')
const { COLLECTIONS } = db

async function getBlockedRecord(dateStr) {
  const res = await db.queryAll(COLLECTIONS.BLOCKED_DATE, { date: dateStr })
  return (res.data && res.data[0]) || null
}

function mergeSlots(base, extra) {
  const result = []
  ;(base || []).concat(extra || []).forEach(function(s) {
    if (result.indexOf(s) === -1) result.push(s)
  })
  return result
}

function isSlotBlocked(record, time) {
  if (!record || !Array.isArray(record.slots)) return false
  const slot = time === '晚上' ? 'night' : 'noon'
  return record.slots.indexOf(slot) !== -1
}

function isDateFullyBlocked(record) {
  return !!(
    record && Array.isArray(record.slots) &&
    record.slots.indexOf('noon') !== -1 && record.slots.indexOf('night') !== -1
  )
}

function blockedLabel(record) {
  if (!record || !Array.isArray(record.slots) || record.slots.length === 0) return ''
  const s = record.slots
  if (s.indexOf('noon') !== -1 && s.indexOf('night') !== -1) return '全天'
  if (s.indexOf('noon') !== -1) return '中午'
  if (s.indexOf('night') !== -1) return '晚上'
  return ''
}

function buildBlockedBanner(record) {
  if (!record) return ''
  const label = blockedLabel(record)
  if (!label) return ''
  const by = record.createdByName ? '（' + record.createdByName + '设置）' : ''
  return '本日封禁：' + label + (record.reason ? ' · ' + record.reason : '') + by
}

async function blockDate(dateStr, slots, reason, userInfo) {
  const mergedSlots = mergeSlots([], slots)
  const existing = await getBlockedRecord(dateStr)
  if (existing) {
    const data = { slots: mergeSlots(existing.slots, mergedSlots), reason: reason }
    await db.updateDoc(COLLECTIONS.BLOCKED_DATE, existing._id, data)
    return Object.assign({}, existing, data)
  }
  const result = await db.addDoc(COLLECTIONS.BLOCKED_DATE, {
    date: dateStr,
    slots: mergedSlots,
    reason: reason,
    createdBy: (userInfo && userInfo._id) || '',
    createdByName: (userInfo && (userInfo.name || userInfo.nickName)) || ''
  })
  return { _id: result._id, date: dateStr, slots: mergedSlots, reason: reason }
}

module.exports = {
  getBlockedRecord,
  mergeSlots,
  isSlotBlocked,
  isDateFullyBlocked,
  blockedLabel,
  buildBlockedBanner,
  blockDate
}
