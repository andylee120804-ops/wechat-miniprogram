/**
 * db.js - Database abstraction layer for WeChat Cloud Database
 * Provides CRUD helpers, paginated queries, and batch reads
 * that bypass the cloud database's 100-record limit.
 */


const CLOUD_ENV = 'cloud1-d9gwvttcr864f8021'
const PAGE_SIZE = 20

// Standardized collection names — use these instead of hardcoded strings
const COLLECTIONS = {
  STAFF: 'staff',
  RESERVATION: 'reservation',
  PURCHASE: 'purchase',
  INCOME: 'income',
  EXPENSE: 'expense',          // one-time / variable expenses (dashboard)
  FIXED_EXPENSE: 'fixed_expense', // recurring expenses (admin expense page)
  CLOCKIN: 'clockin',
  LOG: 'log',
  OPERATION_LOG: 'operation_log',
  ANNOUNCEMENT: 'announcement',
  NOTIFICATION_LOG: 'notification_log',
  SETTINGS: 'settings',
  PERMISSIONS: 'permissions',
  APPROVAL_LOG: 'purchase_approval_log',
  RESERVATION_CHANGE_LOG: 'reservation_change_log'
}

/**
 * Get a cloud database instance
 * @returns {Object} WeChat cloud database instance
 */
function getDb() {
  return wx.cloud.database({ env: CLOUD_ENV })
}

/**
 * Query all records from a collection, bypassing the 100-record limit.
 * Uses batched queries to fetch all matching documents.
 * @param {string} collection - Collection name
 * @param {Object} where - Query conditions (default {})
 * @param {string} orderBy - Field to sort by (default 'createdAt')
 * @param {string} orderDir - Sort direction 'asc' or 'desc' (default 'desc')
 * @returns {Promise<{data: Array, total: number}>}
 */
async function queryAll(collection, where, orderBy, orderDir) {
  where = where || {}
  orderBy = orderBy || 'createdAt'
  orderDir = orderDir || 'desc'

  const db = getDb()
  const MAX_LIMIT = 20 // cloud db limit per query

  // Count total records
  const countRes = await db.collection(collection).where(where).count()
  const total = countRes.total

  if (total === 0) {
    return { data: [], total: 0 }
  }

  // Batch query to fetch all records
  let allData = []
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection(collection)
      .where(where)
      .orderBy(orderBy, orderDir)
      .skip(i * MAX_LIMIT)
      .limit(MAX_LIMIT)
      .get()
    allData.push(...res.data)
  }

  return { data: allData, total: total }
}

/**
 * Paginated query for list views with infinite scroll.
 * @param {string} collection - Collection name
 * @param {Object} where - Query conditions (default {})
 * @param {number} page - Page number, 1-based (default 1)
 * @param {number} pageSize - Records per page (default PAGE_SIZE)
 * @param {string} orderBy - Field to sort by (default 'createdAt')
 * @param {string} orderDir - Sort direction 'asc' or 'desc' (default 'desc')
 * @returns {Promise<{data: Array, total: number, page: number, pageSize: number, hasMore: boolean}>}
 */
async function queryPage(collection, where, page, pageSize, orderBy, orderDir) {
  where = where || {}
  page = page || 1
  pageSize = pageSize || PAGE_SIZE
  orderBy = orderBy || 'createdAt'
  orderDir = orderDir || 'desc'

  const db = getDb()
  const skip = (page - 1) * pageSize

  const res = await db.collection(collection)
    .where(where)
    .orderBy(orderBy, orderDir)
    .skip(skip)
    .limit(pageSize)
    .get()

  const countRes = await db.collection(collection).where(where).count()

  return {
    data: res.data,
    total: countRes.total,
    page: page,
    pageSize: pageSize,
    hasMore: skip + res.data.length < countRes.total
  }
}

/**
 * Add a document to a collection.
 * Automatically adds createdAt and updatedAt timestamps.
 * @param {string} collection - Collection name
 * @param {Object} data - Document data
 * @returns {Promise<Object>} The add result with _id
 */
async function addDoc(collection, data) {
  const db = getDb()
  const now = db.serverDate()
  const doc = { ...data, createdAt: now, updatedAt: now }
  return await db.collection(collection).add({ data: doc })
}

/**
 * Get a single document by ID.
 * @param {string} collection - Collection name
 * @param {string} id - Document _id
 * @returns {Promise<Object|null>} The document data or null if not found
 */
async function getDoc(collection, id) {
  const db = getDb()
  try {
    const res = await db.collection(collection).doc(id).get()
    return res.data
  } catch (err) {
    if (err.errCode === -1 || (err.errMsg && err.errMsg.includes('not exist'))) {
      return null
    }
    throw err
  }
}

/**
 * Update a document by ID.
 * Automatically updates the updatedAt timestamp.
 * @param {string} collection - Collection name
 * @param {string} id - Document _id
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} The update result
 */
async function updateDoc(collection, id, data) {
  const db = getDb()
  const updateData = { ...data, updatedAt: db.serverDate() }
  return await db.collection(collection).doc(id).update({ data: updateData })
}

/**
 * Delete a document by ID.
 * @param {string} collection - Collection name
 * @param {string} id - Document _id
 * @returns {Promise<Object>} The delete result
 */
async function deleteDoc(collection, id) {
  const db = getDb()
  return await db.collection(collection).doc(id).remove()
}

module.exports = {
  getDb,
  queryAll,
  queryPage,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  PAGE_SIZE,
  COLLECTIONS,
  CLOUD_ENV
}
