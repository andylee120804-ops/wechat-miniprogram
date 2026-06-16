/**
 * reservationConfig.js - Global cache module for reservation dynamic configuration.
 *
 * Loads room and form config from the `settings` collection (keys:
 * `reservation_rooms` and `reservation_form_config`). Results are cached
 * in-memory so that multiple pages share the same data without re-querying.
 *
 * Fallback: if the DB has no config (or the query fails), hardcoded defaults
 * are returned so pages always render.
 */

const db = require('./db')
const { COLLECTIONS } = require('./db')

// ── Hardcoded defaults (also used by "restore defaults") ──────────────

const DEFAULT_ROOMS = [
  {
    id: 'big', name: '大包厢', enabled: true, order: 0,
    exclusiveTypes: ['none', 'noon', 'night', 'full'],
    timeSlots: ['中午', '晚上'],
    standards: [500, 600, 800],
    partnerStandard: 300,
    defaultStandard: 500
  },
  {
    id: 'small', name: '小包厢', enabled: true, order: 1,
    exclusiveTypes: ['none', 'noon', 'night', 'full'],
    timeSlots: ['中午', '晚上'],
    standards: [500, 600],
    partnerStandard: 300,
    defaultStandard: 500
  },
  {
    id: 'chess', name: '棋牌室', enabled: true, order: 2,
    exclusiveTypes: [],
    timeSlots: ['中午', '晚上'],
    standards: [],
    partnerStandard: 0,
    defaultStandard: 0
  }
]

const DEFAULT_FORM_CONFIG = {
  fields: [
    { id: 'customerName', label: '客户姓名', type: 'text',
      builtin: true, visible: true, required: true, hiddenInRooms: [] },
    { id: 'phone', label: '手机号', type: 'text',
      builtin: true, visible: true, required: false, hiddenInRooms: [] },
    { id: 'guestCount', label: '人数', type: 'number',
      builtin: true, visible: true, required: true, hiddenInRooms: ['chess'] },
    { id: 'dishPrice', label: '预定菜价', type: 'number',
      builtin: true, visible: true, required: false, hiddenInRooms: ['chess'] },
    { id: 'remark', label: '备注', type: 'textarea',
      builtin: true, visible: true, required: false, hiddenInRooms: [] }
  ]
}

// ── Cache ─────────────────────────────────────────────────────────────

let _roomsCache = null
let _formConfigCache = null

/**
 * Load room list from DB. Returns cached version if available.
 * Falls back to DEFAULT_ROOMS when DB returns nothing or errors.
 * @returns {Promise<Array>} Array of room config objects
 */
async function loadRooms() {
  if (_roomsCache) return _roomsCache
  try {
    var res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
    var value = (res.data && res.data[0] && res.data[0].value) || null
    _roomsCache = value || DEFAULT_ROOMS
  } catch (err) {
    console.warn('[reservationConfig] loadRooms failed, using defaults:', err)
    _roomsCache = DEFAULT_ROOMS
  }
  return _roomsCache
}

/**
 * Load form config from DB. Returns cached version if available.
 * Falls back to DEFAULT_FORM_CONFIG when DB returns nothing or errors.
 * @returns {Promise<Object>} Form config with `fields` array
 */
async function loadFormConfig() {
  if (_formConfigCache) return _formConfigCache
  try {
    var res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
    var value = (res.data && res.data[0] && res.data[0].value) || null
    _formConfigCache = value || DEFAULT_FORM_CONFIG
  } catch (err) {
    console.warn('[reservationConfig] loadFormConfig failed, using defaults:', err)
    _formConfigCache = DEFAULT_FORM_CONFIG
  }
  return _formConfigCache
}

/**
 * Clear cached config. Call after settings page saves changes.
 */
function invalidateCache() {
  _roomsCache = null
  _formConfigCache = null
}

/**
 * Synchronous accessor for the rooms cache (only populated after loadRooms).
 * Returns null if cache is empty.
 * Used by helpers.js getRoomName for fast synchronous lookups.
 */
function _getRoomsCache() {
  return _roomsCache
}

/**
 * Resolve visible fields for a given room by filtering out
 * hidden fields and non-visible fields.
 * @param {Array} fields - Global fields array from formConfig
 * @param {string} roomId - Current room id
 * @returns {Array} - Filtered fields visible in this room
 */
function resolveFields(fields, roomId) {
  return fields.filter(function(f) {
    return f.visible && !(f.hiddenInRooms && f.hiddenInRooms.includes(roomId))
  })
}

module.exports = {
  loadRooms,
  loadFormConfig,
  invalidateCache,
  _getRoomsCache,
  resolveFields,
  DEFAULT_ROOMS,
  DEFAULT_FORM_CONFIG
}
