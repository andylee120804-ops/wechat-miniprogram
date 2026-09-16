const crypto = require('crypto')

const cloud = loadCloud()

initCloud(cloud)

const COLLECTIONS = {
  STAFF: 'staff',
  PERMISSIONS: 'permissions',
  RESERVATION: 'reservation',
  INCOME: 'income',
  STORED_VALUE_ACCOUNT: 'stored_value_account',
  STORED_VALUE_TRANSACTION: 'stored_value_transaction'
}

const MAX_CUSTOMER_BATCH_SIZE = 50
const RECENT_TRANSACTION_LIMIT = 20
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000
const DEFAULT_VENUE_ID = 'legacy-default'

function normalizeVenueId(venueId) {
  return venueId || DEFAULT_VENUE_ID
}

// Backward-compatible venue match: legacy docs (no venueId) belong to the
// original venue and are visible to any caller; once docs are tagged, they
// are scoped to their venue. The cloud function is the trust boundary, so
// filtering in memory before returning to the client is sufficient.
function isItemInVenue(item, venueId) {
  if (!item) return false
  return !item.venueId || item.venueId === venueId
}

function loadCloud() {
  try {
    return require('wx-server-sdk')
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      throw error
    }

    return {
      DYNAMIC_CURRENT_ENV: 'dynamic-current-env',
      init: () => undefined,
      database: () => {
        throw new Error('wx-server-sdk is unavailable')
      },
      getWXContext: () => ({ OPENID: '' })
    }
  }
}

function initCloud(cloudSdk) {
  try {
    cloudSdk.init({ env: cloudSdk.DYNAMIC_CURRENT_ENV })
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      throw error
    }
  }
}

function ok(data) {
  return { success: true, data }
}

function fail(message) {
  return { success: false, message }
}

function toAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }
  return Math.round(amount * 100) / 100
}

function calculateSettlement(balance, amount) {
  const availableBalance = toAmount(balance)
  const payableAmount = toAmount(amount)

  if (availableBalance <= 0) {
    return {
      mode: 'stored_empty',
      deductedAmount: 0,
      incomeAmount: payableAmount,
      balanceAfter: 0
    }
  }

  if (availableBalance >= payableAmount) {
    return {
      mode: 'stored_full',
      deductedAmount: payableAmount,
      incomeAmount: 0,
      balanceAfter: toAmount(availableBalance - payableAmount)
    }
  }

  return {
    mode: 'stored_partial',
    deductedAmount: availableBalance,
    incomeAmount: toAmount(payableAmount - availableBalance),
    balanceAfter: 0
  }
}

function buildReservationSnapshot(reservation = {}) {
  return {
    customerName: reservation.customerName || '',
    phone: reservation.phone || '',
    date: reservation.date || '',
    time: reservation.time || '',
    roomName: reservation.roomName || ''
  }
}

function getCustomerKey(customer = {}) {
  const phone = String(customer.phone || '').trim()
  if (phone) {
    return `phone:${phone}`
  }

  const name = String(customer.customerName || customer.name || '').trim()
  return name ? `name:${name}` : ''
}

function buildStoredValueAccountId(customerKey) {
  const hash = crypto.createHash('sha256')
    .update(String(customerKey || ''), 'utf8')
    .digest('hex')
  return `stored_value_account_${hash}`
}

function isAccountCreateConflictError(error) {
  const message = String((error && error.message) || error || '').toLowerCase()
  return message.includes('conflict') || message.includes('duplicate') || message.includes('already') || message.includes('exist')
}

function getLegacyCustomerKeys(customer = {}) {
  const phone = String(customer.phone || '').trim()
  return phone ? [phone] : []
}

function normalizeCustomer(customer = {}) {
  return {
    phone: String(customer.phone || '').trim(),
    customerName: String(customer.customerName || '').trim(),
    name: String(customer.name || '').trim()
  }
}

function removeEmptyCustomerFields(customer) {
  return Object.keys(customer).reduce((result, key) => {
    if (!customer[key]) {
      return result
    }

    return Object.assign({}, result, { [key]: customer[key] })
  }, {})
}

function normalizeCustomerInputs(customers) {
  const inputCustomers = Array.isArray(customers) ? customers : []
  const seenKeys = {}
  const normalizedCustomers = []
  let isTooMany = false

  inputCustomers.forEach((customer) => {
    if (!customer || typeof customer !== 'object' || isTooMany) {
      return
    }

    const normalizedCustomer = removeEmptyCustomerFields(normalizeCustomer(customer))
    const key = getCustomerKey(normalizedCustomer)
    if (!key || seenKeys[key]) {
      return
    }

    seenKeys[key] = true
    if (normalizedCustomers.length >= MAX_CUSTOMER_BATCH_SIZE) {
      isTooMany = true
      return
    }

    normalizedCustomers.push({ key, customer: normalizedCustomer })
  })

  return { customers: normalizedCustomers, isTooMany }
}

function getBoundAtTime(staff) {
  if (!staff || !staff.boundAt) {
    return 0
  }

  const time = new Date(staff.boundAt).getTime()
  return Number.isFinite(time) ? time : 0
}

function selectLatestBoundStaff(staffList) {
  if (!Array.isArray(staffList) || staffList.length === 0) {
    return null
  }

  return staffList
    .slice()
    .sort((current, next) => getBoundAtTime(next) - getBoundAtTime(current))[0]
}

async function authorize(requiredModule, requiredAction) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext && wxContext.OPENID
  if (!openid) {
    throw new Error('无权限')
  }

  const db = cloud.database()
  let staffQuery = db.collection(COLLECTIONS.STAFF)
    .where({ boundOpenid: openid, status: 'active' })

  if (typeof staffQuery.orderBy === 'function') {
    staffQuery = staffQuery.orderBy('boundAt', 'desc')
  }

  const staffResult = await staffQuery.get()
  const staff = selectLatestBoundStaff(staffResult.data)

  if (!staff) {
    throw new Error('无权限')
  }

  staff.venueId = normalizeVenueId(staff.venueId)

  if (staff.role === 'admin' || staff.role === 'boss') {
    return staff
  }

  const permissionResult = await db.collection(COLLECTIONS.PERMISSIONS)
    .where({ staffId: staff._id })
    .get()
  const permissionDoc = permissionResult.data && permissionResult.data[0]
  const permissions = permissionDoc && Array.isArray(permissionDoc.permissions) ? permissionDoc.permissions : []
  const modulePermission = permissions.find((permission) => permission.module === requiredModule)
  const actions = modulePermission && Array.isArray(modulePermission.actions) ? modulePermission.actions : []

  if (actions.includes(requiredAction) || actions.includes('*')) {
    return staff
  }

  throw new Error('无权限')
}

async function queryAccountByCustomer(event = {}) {
  const staff = await authorize('income', 'add')

  const customerKey = getCustomerKey(event)
  if (!customerKey) {
    return fail('缺少客户信息')
  }

  const db = cloud.database()
  const match = await findAccountByCustomerInCollection(db, event)
  if (match.error) {
    return fail(match.error)
  }
  if (!match.account) {
    return ok({ account: null, transactions: [] })
  }
  // 场地隔离：忽略明确属于其他场地的账户（legacy 无 venueId 账户仍可访问）
  if (match.account.venueId && match.account.venueId !== staff.venueId) {
    return ok({ account: null, transactions: [] })
  }

  const transactions = await findRecentTransactions(db, match.account._id)
  return ok({
    account: minimizeAccount(match.account),
    transactions: transactions.map(minimizeTransaction)
  })
}

async function queryAccountsByCustomers(event = {}) {
  const staff = await authorize('income', 'add')

  const normalized = normalizeCustomerInputs(event.customers)
  if (normalized.isTooMany) {
    return fail(`一次最多查询${MAX_CUSTOMER_BATCH_SIZE}个客户`)
  }

  const db = cloud.database()
  const matches = await Promise.all(
    normalized.customers.map(async (customer) => findAccountByCustomerInCollection(db, customer.customer))
  )

  const errorMatch = matches.find((match) => match && match.error)
  if (errorMatch) {
    return fail(errorMatch.error)
  }

  const accounts = []
  const seenIds = {}
  matches.forEach((match) => {
    if (!match || !match.account || seenIds[match.account._id]) {
      return
    }
    // 场地隔离：跳过明确属于其他场地的账户
    if (match.account.venueId && match.account.venueId !== staff.venueId) {
      return
    }
    seenIds[match.account._id] = true
    accounts.push(minimizeAccount(match.account))
  })

  return ok(accounts)
}

function normalizeMarkerPermissionModule(permissionModule) {
  const moduleName = String(permissionModule || '').trim()
  return moduleName === 'customer' || moduleName === 'reservation' ? moduleName : ''
}

function buildRequestMatchKeys(normalizedCustomer = {}, key = '') {
  const phone = String(normalizedCustomer.phone || '').trim()
  const customerName = String(normalizedCustomer.customerName || normalizedCustomer.name || '').trim()
  const keys = []

  if (key) keys.push(key)
  if (phone) keys.push(phone)
  if (customerName) {
    keys.push(`name:${customerName}`)
    keys.push(customerName)
  }

  return keys.filter((matchKey, index) => matchKey && keys.indexOf(matchKey) === index)
}

function minimizePositiveBalanceMarker(customer = {}) {
  return {
    matchKeys: buildRequestMatchKeys(customer.customer, customer.key),
    hasPositiveBalance: true
  }
}

async function queryPositiveBalanceMarkers(event = {}) {
  const permissionModule = normalizeMarkerPermissionModule(event.permissionModule)
  if (!permissionModule) {
    throw new Error('无权限')
  }

  const staff = await authorize(permissionModule, 'view')

  const normalized = normalizeCustomerInputs(event.customers)
  if (normalized.isTooMany) {
    return fail(`一次最多查询${MAX_CUSTOMER_BATCH_SIZE}个客户`)
  }

  if (normalized.customers.length === 0) {
    return ok([])
  }

  const db = cloud.database()
  // 一次性加载所有 active 账户到内存，避免对每个客户串行发起 1~3 次数据库查询。
  // stored_value_account 通常账户数量级较小（百级以内），全量加载远比 N 次 where 查询快。
  const allAccounts = await fetchAll(db, COLLECTIONS.STORED_VALUE_ACCOUNT, { status: 'active' })

  // 建立内存索引：customerKey / phone / customerName
  // 语义与 findAccountByCustomerInCollection 保持一致（key 优先 → phone → 同名唯一）
  const accountByCustomerKey = {}
  const accountByPhone = {}
  const accountsByName = {}
  allAccounts.forEach((account) => {
    // 场地隔离：跳过明确属于其他场地的账户
    if (account.venueId && account.venueId !== staff.venueId) {
      return
    }
    const customerKey = String(account.customerKey || '').trim()
    if (customerKey) accountByCustomerKey[customerKey] = account
    const phone = String(account.phone || '').trim()
    if (phone) accountByPhone[phone] = account
    const name = String(account.customerName || account.name || '').trim()
    if (name) {
      if (!accountsByName[name]) accountsByName[name] = []
      accountsByName[name].push(account)
    }
  })

  const markers = []
  const seenIds = {}
  normalized.customers.forEach((entry) => {
    const key = entry.key
    const phone = String((entry.customer && entry.customer.phone) || '').trim()
    const customerName = String(
      (entry.customer && (entry.customer.customerName || entry.customer.name)) || ''
    ).trim()

    let account = null

    // 1. 按 customerKey 精确匹配
    if (key && accountByCustomerKey[key]) {
      account = accountByCustomerKey[key]
    }

    // 2. 按 phone 匹配（legacy 兼容）
    if (!account && phone && accountByPhone[phone]) {
      account = accountByPhone[phone]
    }

    // 3. 无 phone 时按 name 匹配（同名多账户视为冲突，跳过）
    if (!account && !phone && customerName && accountsByName[customerName]) {
      if (accountsByName[customerName].length === 1) {
        account = accountsByName[customerName][0]
      }
    }

    if (!account) return
    if (seenIds[account._id]) return
    if (toAmount(account.balance) <= 0) return

    seenIds[account._id] = true
    markers.push(minimizePositiveBalanceMarker(entry))
  })

  return ok(markers)
}

async function findSingleAccount(customerKey) {
  const db = cloud.database()
  return findSingleAccountInCollection(db, customerKey)
}

async function findSingleAccountInCollection(collectionProvider, customerKey) {
  const result = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
    .where({ customerKey, status: 'active' })
    .limit(1)
    .get()

  return result.data[0] || null
}

async function findAccountsByNameInCollection(collectionProvider, customerName) {
  if (!customerName) {
    return []
  }

  const result = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
    .where({ customerName, status: 'active' })
    .limit(2)
    .get()

  return Array.isArray(result.data) ? result.data : []
}

async function findAccountByCustomerInCollection(collectionProvider, customer = {}) {
  const phone = String(customer.phone || '').trim()
  const customerName = String(customer.customerName || customer.name || '').trim()
  const customerKey = getCustomerKey(customer)
  let keyedAccount = null

  if (customerKey) {
    keyedAccount = await findSingleAccountInCollection(collectionProvider, customerKey)
  }

  if (!phone && customerName) {
    const nameAccounts = await findAccountsByNameInCollection(collectionProvider, customerName)
    if (nameAccounts.length > 1) {
      return { error: '同名客户存在多个储值账户，请补充手机号' }
    }
    if (keyedAccount) {
      return { account: keyedAccount }
    }
    if (nameAccounts.length === 1) {
      return { account: nameAccounts[0] }
    }
    return { account: null }
  }

  if (keyedAccount) {
    return { account: keyedAccount }
  }

  const legacyMatch = await findLegacyAccountInCollection(collectionProvider, customer)
  if (legacyMatch.error) {
    return { error: legacyMatch.error }
  }
  if (legacyMatch.account) {
    return { account: legacyMatch.account }
  }

  return { account: null }
}

function buildAccountMatchKeys(account = {}) {
  const keys = []
  const customerKey = String(account.customerKey || '').trim()
  const phone = String(account.phone || '').trim()
  const customerName = String(account.customerName || account.name || '').trim()

  if (customerKey) keys.push(customerKey)
  if (phone) {
    keys.push(phone)
    keys.push(`phone:${phone}`)
  }
  if (customerName) {
    keys.push(`name:${customerName}`)
    keys.push(customerName)
  }

  return keys.filter((key, index) => key && keys.indexOf(key) === index)
}

function minimizeAccount(account = {}) {
  return {
    _id: account._id,
    customerKey: account.customerKey || '',
    customerName: account.customerName || account.name || '',
    phone: account.phone || '',
    balance: toAmount(account.balance),
    status: account.status || 'active',
    matchKeys: buildAccountMatchKeys(account)
  }
}

function minimizeTransaction(transaction = {}) {
  return {
    _id: transaction._id,
    type: transaction.type || '',
    amount: toAmount(transaction.amount || transaction.deductedAmount),
    balanceAfter: toAmount(transaction.balanceAfter),
    date: transaction.date || '',
    createTime: transaction.createTime || '',
    updateTime: transaction.updateTime || '',
    remark: transaction.remark || '',
    reservationSnapshot: transaction.reservationSnapshot || null,
    status: transaction.status || 'active'
  }
}

async function findRecentTransactions(collectionProvider, accountId) {
  if (!accountId) {
    return []
  }

  // Fetch both 'active' and 'reversed' transactions so the customer detail
  // page can show the full audit trail. We query by accountId only and filter
  // in memory to avoid depending on db.command inside transactions.
  let query = collectionProvider.collection(COLLECTIONS.STORED_VALUE_TRANSACTION)
    .where({ accountId })
  if (typeof query.orderBy === 'function') {
    query = query.orderBy('createTime', 'desc')
  }
  if (typeof query.limit === 'function') {
    query = query.limit(RECENT_TRANSACTION_LIMIT)
  }
  const result = await query.get()
  const allData = Array.isArray(result.data) ? result.data : []
  const filtered = allData.filter(function (item) {
    const status = item.status || 'active'
    return status === 'active' || status === 'reversed'
  })
  return filtered.slice(0, RECENT_TRANSACTION_LIMIT)
}

async function findRechargeByRequestId(collectionProvider, requestId) {
  const result = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_TRANSACTION)
    .where({ requestId, type: 'recharge' })
    .limit(1)
    .get()

  return result.data[0] || null
}

async function getDocumentById(collectionProvider, collectionName, id) {
  if (!id) {
    return null
  }

  const result = await collectionProvider.collection(collectionName).doc(id).get()
  return result.data || null
}

async function findLegacyAccountInCollection(collectionProvider, event = {}) {
  const legacyKeys = getLegacyCustomerKeys(event)

  for (let index = 0; index < legacyKeys.length; index += 1) {
    const legacyKey = legacyKeys[index]
    const result = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ customerKey: legacyKey, status: 'active' })
      .limit(1)
      .get()

    if (result.data[0]) {
      return { account: result.data[0] }
    }
  }

  const phone = String(event.phone || '').trim()
  if (phone) {
    const phoneResult = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ phone, status: 'active' })
      .limit(1)
      .get()

    if (phoneResult.data[0]) {
      return { account: phoneResult.data[0] }
    }
    return { account: null }
  }

  const customerName = String(event.customerName || event.name || '').trim()
  if (customerName) {
    const nameAccounts = await findAccountsByNameInCollection(collectionProvider, customerName)
    if (nameAccounts.length > 1) {
      return { error: '同名客户存在多个储值账户，请补充手机号' }
    }
    if (nameAccounts.length === 1) {
      return { account: nameAccounts[0] }
    }
  }

  return { account: null }
}

async function findAccountByRechargeEventInCollection(collectionProvider, event = {}) {
  const match = await findAccountByCustomerInCollection(collectionProvider, event)
  if (match.error) {
    throw new Error(match.error)
  }

  return match.account || null
}

function formatDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatChinaDateString(date) {
  const shifted = new Date(date.getTime() + CHINA_TIME_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildRechargeIncomeData(event, account, staff) {
  const amount = toAmount(event.amount)
  const customerName = String(event.customerName || account.customerName || account.name || '').trim()
  const remark = String(event.remark || '').trim()
  const now = new Date()

  return {
    type: 'other',
    categoryLabel: '储值充值',
    settlementMode: 'stored_value_recharge',
    storedValueAccountId: account._id,
    originalAmount: amount,
    deductedAmount: 0,
    amount,
    source: customerName,
    paymentMethod: event.paymentMethod || '',
    remark: remark ? `储值充值：${remark}` : '储值充值',
    collectedBy: staff._id,
    collectedByName: staff.name || '',
    venueId: staff.venueId,
    date: formatDateString(now),
    createTime: now,
    updateTime: now,
    status: 'active'
  }
}

function buildSettlementRemark(baseRemark, originalAmount, deductedAmount, incomeAmount) {
  const remark = String(baseRemark || '').trim() || '储值抵扣'
  return `${remark}；原金额${toAmount(originalAmount)}，储值抵扣${toAmount(deductedAmount)}，实收${toAmount(incomeAmount)}`
}

function pickIncomeMetadata(incomeData) {
  const metadata = {}
  const allowedFields = ['guestCount', 'standard', 'roomName', 'calcMode', 'dishPrice', 'serviceCharge', 'autoGenerated', 'purchaseId']

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(incomeData, field)) {
      metadata[field] = incomeData[field]
    }
  })

  return metadata
}

function buildSettlementIncomeData(incomeData, account, transaction, settlement, staff) {
  const now = new Date()
  const originalAmount = toAmount(incomeData.amount)
  const deductedAmount = toAmount(settlement.deductedAmount)

  return Object.assign({}, pickIncomeMetadata(incomeData), {
    type: incomeData.type || 'dining',
    categoryLabel: incomeData.categoryLabel || '',
    settlementMode: settlement.mode,
    storedValueAccountId: account && account._id ? account._id : '',
    storedValueTransactionId: transaction && transaction._id ? transaction._id : '',
    reservationId: incomeData.reservationId || '',
    originalAmount,
    deductedAmount,
    amount: toAmount(settlement.incomeAmount),
    source: String(incomeData.source || incomeData.customerName || '').trim(),
    paymentMethod: incomeData.paymentMethod || '',
    remark: buildSettlementRemark(incomeData.remark, originalAmount, deductedAmount, settlement.incomeAmount),
    collectedBy: staff._id,
    collectedByName: staff.name || '',
    venueId: staff.venueId,
    date: incomeData.date || formatDateString(now),
    createTime: now,
    updateTime: now,
    // Mirror to createdAt/updatedAt — client-side db.addDoc uses these names,
    // and income list page sorts by createdAt. Without them, stored-value
    // settlement records would be sorted to the end or skipped.
    createdAt: now,
    updatedAt: now,
    status: 'active'
  })
}

async function getReservationById(collectionProvider, reservationId) {
  if (!reservationId) {
    return null
  }

  const result = await collectionProvider.collection(COLLECTIONS.RESERVATION)
    .doc(reservationId)
    .get()
  return result.data || null
}

function getSettlementCustomer(reservation, event = {}) {
  const snapshot = event.reservationSnapshot || {}
  if (reservation) {
    return {
      phone: reservation.phone || '',
      customerName: reservation.customerName || '',
      name: reservation.customerName || ''
    }
  }

  return {
    phone: event.phone || snapshot.phone || '',
    customerName: event.customerName || snapshot.customerName || event.source || '',
    name: event.name || event.source || ''
  }
}

async function findAccountBySettlementEventInCollection(collectionProvider, event = {}, reservation = null) {
  const customer = getSettlementCustomer(reservation, event)
  const match = await findAccountByCustomerInCollection(collectionProvider, customer)
  if (match.error) {
    throw new Error(match.error)
  }

  return match.account || null
}

function markReservationSettled(collectionProvider, reservationId, settlementData) {
  if (!reservationId) {
    return Promise.resolve(null)
  }

  return collectionProvider.collection(COLLECTIONS.RESERVATION)
    .doc(reservationId)
    .update({
      data: Object.assign({}, settlementData, {
        hasIncome: true,
        updateTime: new Date()
      })
    })
}

function buildNormalIncomeData(incomeData, settlementMode, staff, account) {
  const now = new Date()
  const amount = toAmount(incomeData.amount)

  return Object.assign({}, pickIncomeMetadata(incomeData), {
    type: incomeData.type || 'dining',
    categoryLabel: incomeData.categoryLabel || '',
    settlementMode,
    storedValueAccountId: account && account._id ? account._id : '',
    reservationId: incomeData.reservationId || '',
    originalAmount: amount,
    deductedAmount: 0,
    amount,
    source: String(incomeData.source || incomeData.customerName || '').trim(),
    paymentMethod: incomeData.paymentMethod || '',
    remark: String(incomeData.remark || '').trim(),
    collectedBy: staff._id,
    collectedByName: staff.name || '',
    venueId: staff.venueId,
    date: incomeData.date || formatDateString(now),
    createTime: now,
    updateTime: now,
    // Mirror to createdAt/updatedAt — client-side db.addDoc uses these names,
    // and income list page sorts by createdAt. Without them, stored-value
    // settlement records would be sorted to the end or skipped.
    createdAt: now,
    updatedAt: now,
    status: 'active'
  })
}

function normalizeDateString(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value.slice(0, 10)
    }
    const parsed = new Date(value)
    if (Number.isFinite(parsed.getTime())) {
      return formatChinaDateString(parsed)
    }
    return value.slice(0, 10)
  }

  if (value instanceof Date) {
    return formatChinaDateString(value)
  }

  if (value && typeof value.toDate === 'function') {
    return formatChinaDateString(value.toDate())
  }

  return String(value).slice(0, 10)
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validateDateRange(start, end) {
  if (!start || !end) {
    return '缺少统计日期范围'
  }

  if (!isValidDateString(start) || !isValidDateString(end)) {
    return '统计日期格式不正确'
  }

  if (start > end) {
    return '统计开始日期不能晚于结束日期'
  }

  return ''
}

async function fetchAll(collectionProvider, collectionName, where) {
  const pageSize = 100
  const collection = collectionProvider.collection(collectionName)
  const allItems = []
  let offset = 0
  let shouldContinue = true

  while (shouldContinue) {
    let query = collection.where(where)
    if (typeof query.skip === 'function') {
      query = query.skip(offset)
    }
    if (typeof query.limit === 'function') {
      query = query.limit(pageSize)
    }

    const result = await query.get()
    const items = Array.isArray(result.data) ? result.data : []
    allItems.push(...items)
    shouldContinue = items.length === pageSize
    offset += pageSize
  }

  return allItems
}

function isDateInRange(value, start, end) {
  const date = normalizeDateString(value)
  return date >= start && date <= end
}

function sumAmount(items, fieldName) {
  return items.reduce((total, item) => toAmount(total + toAmount(item[fieldName])), 0)
}

async function recharge(event = {}) {
  const staff = await authorize('income', 'add')
  const customerName = String(event.customerName || '').trim()
  const phone = String(event.phone || '').trim()
  const amount = toAmount(event.amount)
  const requestId = String(event.requestId || event.idempotencyKey || '').trim()
  const customerKey = getCustomerKey({ phone, customerName })

  if (!customerName) {
    return fail('客户姓名不能为空')
  }

  if (amount <= 0) {
    return fail('充值金额必须大于0')
  }

  if (!requestId) {
    return fail('请求标识不能为空')
  }

  const db = cloud.database()
  const now = new Date()

  const result = await db.runTransaction(async (transaction) => {
    const existingRecharge = await findRechargeByRequestId(transaction, requestId)
    if (existingRecharge) {
      const existingAccount = await getDocumentById(transaction, COLLECTIONS.STORED_VALUE_ACCOUNT, existingRecharge.accountId)
      const existingIncome = await getDocumentById(transaction, COLLECTIONS.INCOME, existingRecharge.incomeId)
      return {
        account: existingAccount,
        transaction: existingRecharge,
        income: existingIncome,
        incomeId: existingRecharge.incomeId || '',
        idempotent: true
      }
    }

    const existingAccount = await findAccountByRechargeEventInCollection(transaction, { phone, customerName })
    let account = null
    let balanceBefore = 0

    if (existingAccount) {
      balanceBefore = toAmount(existingAccount.balance)
      const currentVersion = Number(existingAccount._version || 0)
      const updateData = {
        customerName: existingAccount.customerName || customerName,
        phone: existingAccount.phone || phone,
        customerKey,
        venueId: existingAccount.venueId || staff.venueId,
        balance: toAmount(balanceBefore + amount),
        totalRecharge: toAmount(toAmount(existingAccount.totalRecharge) + amount),
        updatedBy: staff._id,
        updatedByName: staff.name || '',
        updateTime: now,
        _version: currentVersion + 1
      }

      await transaction.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
        .doc(existingAccount._id)
        .update({ data: updateData })
      account = Object.assign({}, existingAccount, updateData)
    } else {
      const accountData = {
        customerName,
        phone,
        customerKey,
        venueId: staff.venueId,
        balance: amount,
        totalRecharge: amount,
        totalConsume: 0,
        status: 'active',
        _version: 1,
        createdBy: staff._id,
        createdByName: staff.name || '',
        updatedBy: staff._id,
        updatedByName: staff.name || '',
        createTime: now,
        updateTime: now
      }
      const accountId = buildStoredValueAccountId(customerKey)
      try {
        await transaction.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
          .doc(accountId)
          .set({ data: accountData })
      } catch (error) {
        if (isAccountCreateConflictError(error)) {
          throw new Error('储值账户正在创建，请重试')
        }
        throw error
      }
      account = Object.assign({}, accountData, { _id: accountId })
    }

    const incomeData = buildRechargeIncomeData(event, account, staff)
    const incomeResult = await transaction.collection(COLLECTIONS.INCOME).add({ data: incomeData })
    const transactionData = {
      type: 'recharge',
      status: 'active',
      requestId,
      accountId: account._id,
      venueId: staff.venueId,
      amount,
      balanceBefore,
      balanceAfter: toAmount(balanceBefore + amount),
      incomeId: incomeResult._id,
      operatorId: staff._id,
      operatorName: staff.name || '',
      remark: String(event.remark || '').trim(),
      createTime: now,
      updateTime: now
    }
    const transactionResult = await transaction.collection(COLLECTIONS.STORED_VALUE_TRANSACTION).add({ data: transactionData })
    const rechargeTransaction = Object.assign({}, transactionData, { _id: transactionResult._id })

    await transaction.collection(COLLECTIONS.INCOME)
      .doc(incomeResult._id)
      .update({ data: { storedValueTransactionId: transactionResult._id } })

    return { account, transaction: rechargeTransaction, incomeId: incomeResult._id }
  })

  return ok(result)
}

async function settleIncomeWithStoredValue(event = {}) {
  const staff = await authorize('income', 'add')
  const amount = toAmount(event.amount)
  const reservationId = String(event.reservationId || '').trim()

  if (amount <= 0) {
    return fail('结算金额必须大于0')
  }

  if (!reservationId) {
    return fail('储值结算必须关联预约')
  }

  const db = cloud.database()
  const result = await db.runTransaction(async (transaction) => {
    const transactionReservation = await getReservationById(transaction, reservationId)
    if (!transactionReservation) {
      throw new Error('关联预约不存在')
    }

    if (transactionReservation.hasIncome) {
      throw new Error('该预约已结算')
    }

    const now = new Date()
    const incomeData = Object.assign({}, event, {
      reservationId,
      customerName: transactionReservation.customerName || '',
      source: transactionReservation.customerName || '',
      phone: transactionReservation.phone || ''
    })
    const currentAccount = await findAccountBySettlementEventInCollection(transaction, {}, transactionReservation)

    if (!currentAccount) {
      const incomePayload = buildNormalIncomeData(incomeData, 'normal', staff, null)
      const createdIncome = await transaction.collection(COLLECTIONS.INCOME).add({ data: incomePayload })
      await markReservationSettled(transaction, reservationId, {
        settlementMode: 'normal',
        incomeId: createdIncome._id,
        originalAmount: amount,
        deductedAmount: 0,
        incomeAmount: amount,
        settledBy: staff._id,
        settledByName: staff.name || '',
        settledAt: now
      })

      return {
        settlementMode: 'normal',
        incomeId: createdIncome._id,
        originalAmount: amount,
        deductedAmount: 0,
        incomeAmount: amount
      }
    }

    const freshBalanceBefore = toAmount(currentAccount.balance)
    const freshSettlement = calculateSettlement(freshBalanceBefore, amount)

    if (freshSettlement.deductedAmount <= 0) {
      const incomePayload = buildNormalIncomeData(incomeData, 'stored_empty', staff, currentAccount)
      const createdIncome = await transaction.collection(COLLECTIONS.INCOME).add({ data: incomePayload })
      await markReservationSettled(transaction, reservationId, {
        settlementMode: 'stored_empty',
        storedValueAccountId: currentAccount._id,
        incomeId: createdIncome._id,
        originalAmount: amount,
        deductedAmount: 0,
        incomeAmount: amount,
        settledBy: staff._id,
        settledByName: staff.name || '',
        settledAt: now
      })

      return {
        settlementMode: 'stored_empty',
        accountId: currentAccount._id,
        transactionId: null,
        incomeId: createdIncome._id,
        originalAmount: amount,
        deductedAmount: 0,
        incomeAmount: amount,
        balanceAfter: freshBalanceBefore
      }
    }

    const currentVersion = Number(currentAccount._version || 0)
    const accountUpdate = {
      venueId: currentAccount.venueId || staff.venueId,
      balance: freshSettlement.balanceAfter,
      totalConsume: toAmount(toAmount(currentAccount.totalConsume) + freshSettlement.deductedAmount),
      updatedBy: staff._id,
      updatedByName: staff.name || '',
      updateTime: now,
      _version: currentVersion + 1
    }

    await transaction.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .doc(currentAccount._id)
      .update({ data: accountUpdate })

    const transactionData = {
      type: 'consume',
      status: 'active',
      accountId: currentAccount._id,
      venueId: staff.venueId,
      amount: freshSettlement.deductedAmount,
      balanceBefore: freshBalanceBefore,
      balanceAfter: freshSettlement.balanceAfter,
      incomeId: null,
      reservationId,
      reservationSnapshot: buildReservationSnapshot(transactionReservation),
      operatorId: staff._id,
      operatorName: staff.name || '',
      remark: String(event.remark || '').trim(),
      createTime: now,
      updateTime: now
    }
    const transactionResult = await transaction.collection(COLLECTIONS.STORED_VALUE_TRANSACTION).add({ data: transactionData })
    const consumeTransaction = Object.assign({}, transactionData, { _id: transactionResult._id })

    let incomeId = null
    if (freshSettlement.incomeAmount > 0) {
      const settlementIncomeData = buildSettlementIncomeData(incomeData, currentAccount, consumeTransaction, freshSettlement, staff)
      const incomeResult = await transaction.collection(COLLECTIONS.INCOME).add({ data: settlementIncomeData })
      incomeId = incomeResult._id
      await transaction.collection(COLLECTIONS.STORED_VALUE_TRANSACTION)
        .doc(transactionResult._id)
        .update({ data: { incomeId } })
    }

    await markReservationSettled(transaction, reservationId, {
      settlementMode: freshSettlement.mode,
      storedValueAccountId: currentAccount._id,
      storedValueTransactionId: transactionResult._id,
      incomeId,
      originalAmount: amount,
      deductedAmount: freshSettlement.deductedAmount,
      incomeAmount: freshSettlement.incomeAmount,
      settledBy: staff._id,
      settledByName: staff.name || '',
      settledAt: now
    })

    return {
      settlementMode: freshSettlement.mode,
      accountId: currentAccount._id,
      transactionId: transactionResult._id,
      incomeId,
      originalAmount: amount,
      deductedAmount: freshSettlement.deductedAmount,
      incomeAmount: freshSettlement.incomeAmount,
      balanceAfter: freshSettlement.balanceAfter
    }
  })

  return ok(result)
}

/**
 * Reverse a stored-value settlement: refund the deducted balance, archive the
 * consume transaction (keep it as an audit trail with status=reversed), delete
 * the income record, and reset reservation's hasIncome flag.
 *
 * Handles three settlement modes:
 * - stored_full: refund full deductedAmount, no cash income to worry about
 * - stored_partial: refund deductedAmount, the partial cash income is deleted too
 * - stored_value_recharge: reverse a recharge — deduct balance back, archive recharge tx
 * - stored_empty: just delete the income (nothing was deducted)
 */
function validateReverseTransaction(transaction, expected) {
  if (!transaction || transaction.status !== 'active') {
    throw new Error('储值流水已撤销或不存在')
  }
  if (expected.type && transaction.type !== expected.type) {
    throw new Error('储值流水类型不匹配')
  }
  if (expected.accountId && transaction.accountId !== expected.accountId) {
    throw new Error('储值流水账户不匹配')
  }
  if (expected.incomeId && transaction.incomeId !== expected.incomeId) {
    throw new Error('储值流水收入不匹配')
  }
  if (expected.reservationId && transaction.reservationId !== expected.reservationId) {
    throw new Error('储值流水预约不匹配')
  }
}

function getValidatedReverseAmount(transaction, expectedAmount) {
  const transactionAmount = toAmount(transaction && transaction.amount)
  if (transactionAmount !== toAmount(expectedAmount)) {
    throw new Error('储值流水金额不匹配')
  }
  return transactionAmount
}

function validateStoredFullTransactionOnly(transaction, fallbackReservationId) {
  if (!transaction || transaction.status !== 'active') {
    throw new Error('储值流水已撤销或不存在')
  }
  if (transaction.type !== 'consume') {
    throw new Error('储值流水类型不匹配')
  }
  if (transaction.incomeId) {
    throw new Error('储值流水收入不匹配')
  }
  if (!transaction.accountId || !(transaction.reservationId || fallbackReservationId)) {
    throw new Error('储值流水不存在')
  }
}

function buildStoredFullIncomeFromTransaction(storedValueTransaction, fallbackReservationId) {
  validateStoredFullTransactionOnly(storedValueTransaction, fallbackReservationId)
  const reservationId = storedValueTransaction.reservationId || fallbackReservationId || ''
  return {
    settlementMode: 'stored_full',
    storedValueAccountId: storedValueTransaction.accountId || '',
    storedValueTransactionId: storedValueTransaction._id || '',
    reservationId,
    deductedAmount: toAmount(storedValueTransaction.amount),
    amount: 0
  }
}

async function reverseSettlement(event = {}) {
  const staff = await authorize('income', 'delete')
  const incomeId = String(event.incomeId || '').trim()
  const requestedTransactionId = String(event.transactionId || '').trim()
  if (!incomeId && !requestedTransactionId) {
    return fail('缺少收入记录ID')
  }

  const db = cloud.database()
  const now = new Date()

  let income = null
  if (incomeId) {
    const incomeDoc = await db.collection(COLLECTIONS.INCOME).doc(incomeId).get()
    income = incomeDoc && incomeDoc.data
    if (!income) {
      return fail('收入记录不存在')
    }
  } else {
    try {
      const transactionDoc = await db.collection(COLLECTIONS.STORED_VALUE_TRANSACTION).doc(requestedTransactionId).get()
      income = buildStoredFullIncomeFromTransaction(transactionDoc && transactionDoc.data, String(event.reservationId || '').trim())
    } catch (error) {
      return fail(error.message || '储值流水不存在')
    }
  }
  const settlementMode = String(income.settlementMode || '')
  if (settlementMode.indexOf('stored_') !== 0) {
    return fail('该收入记录非储值关联，无法反向结算')
  }

  const accountId = income.storedValueAccountId || ''
  const linkedTransactionId = income.storedValueTransactionId || ''
  if (incomeId && requestedTransactionId && requestedTransactionId !== linkedTransactionId) {
    return fail('储值流水不属于该收入')
  }
  const transactionId = linkedTransactionId || requestedTransactionId
  const deductedAmount = toAmount(income.deductedAmount)
  const reservationId = income.reservationId || ''

  const result = await db.runTransaction(async (transaction) => {
    let account = null
    if (accountId && (deductedAmount > 0 || settlementMode === 'stored_value_recharge')) {
      account = await getDocumentById(transaction, COLLECTIONS.STORED_VALUE_ACCOUNT, accountId)
      if (!account) {
        throw new Error('储值账户不存在')
      }
    }
    const storedValueTransaction = transactionId
      ? await getDocumentById(transaction, COLLECTIONS.STORED_VALUE_TRANSACTION, transactionId)
      : null

    if (settlementMode === 'stored_value_recharge') {
      validateReverseTransaction(storedValueTransaction, { type: 'recharge', accountId, incomeId })
      const rechargeAmount = getValidatedReverseAmount(storedValueTransaction, income.amount)
      const currentBalance = toAmount(account.balance)
      const rawBalanceAfterReverse = currentBalance - rechargeAmount
      if (rawBalanceAfterReverse < 0) {
        throw new Error('储值余额不足，无法撤销充值（可能已被消费）')
      }
      const newBalance = toAmount(rawBalanceAfterReverse)
      const currentVersion = Number(account._version || 0)
      await transaction.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
        .doc(accountId)
        .update({ data: {
          balance: newBalance,
          totalRecharge: toAmount(toAmount(account.totalRecharge) - rechargeAmount),
          updatedBy: staff._id,
          updatedByName: staff.name || '',
          updateTime: now,
          _version: currentVersion + 1
        } })

      // Archive the original recharge transaction
      if (transactionId) {
        await transaction.collection(COLLECTIONS.STORED_VALUE_TRANSACTION)
          .doc(transactionId)
          .update({ data: {
            status: 'reversed',
            reversedBy: staff._id,
            reversedByName: staff.name || '',
            reversedAt: now,
            reverseRemark: String(event.remark || '撤销充值').trim()
          } })
      }

      // Delete the income record (recharge income)
      await transaction.collection(COLLECTIONS.INCOME).doc(incomeId).remove()

      return {
        settlementMode,
        accountId,
        transactionId,
        incomeId,
        reversedAmount: rechargeAmount,
        balanceAfter: newBalance
      }
    }

    // For stored_full / stored_partial / stored_empty
    // 3a. Refund the balance if there was a deduction
    let reversedAmount = 0
    if (accountId && deductedAmount > 0) {
      validateReverseTransaction(storedValueTransaction, { type: 'consume', accountId, incomeId, reservationId })
      reversedAmount = getValidatedReverseAmount(storedValueTransaction, deductedAmount)
      const newBalance = toAmount(toAmount(account.balance) + reversedAmount)
      const currentVersion = Number(account._version || 0)
      await transaction.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
        .doc(accountId)
        .update({ data: {
          balance: newBalance,
          totalConsume: toAmount(toAmount(account.totalConsume) - reversedAmount),
          updatedBy: staff._id,
          updatedByName: staff.name || '',
          updateTime: now,
          _version: currentVersion + 1
        } })
    }

    // 3b. Archive the consume transaction (keep as audit trail)
    if (transactionId) {
      await transaction.collection(COLLECTIONS.STORED_VALUE_TRANSACTION)
        .doc(transactionId)
        .update({ data: {
          status: 'reversed',
          reversedBy: staff._id,
          reversedByName: staff.name || '',
          reversedAt: now,
          reverseRemark: String(event.remark || '撤销储值结算').trim()
        } })
    }

    if (incomeId) {
      await transaction.collection(COLLECTIONS.INCOME).doc(incomeId).remove()
    }

    // 3d. Reset reservation's hasIncome flag so it can be re-settled
    if (reservationId) {
      await transaction.collection(COLLECTIONS.RESERVATION)
        .doc(reservationId)
        .update({ data: {
          hasIncome: false,
          settlementMode: '',
          storedValueAccountId: '',
          storedValueTransactionId: '',
          incomeId: '',
          originalAmount: 0,
          deductedAmount: 0,
          incomeAmount: 0,
          settledBy: '',
          settledByName: '',
          settledAt: null,
          updateTime: now
        } })
    }

    return {
      settlementMode,
      accountId,
      transactionId,
      incomeId,
      reversedAmount,
      reservationId
    }
  })

  return ok(result)
}

async function getStats(event = {}) {
  const staff = await authorize('dashboard', 'view')

  const start = normalizeDateString(event.start)
  const end = normalizeDateString(event.end)
  const dateRangeError = validateDateRange(start, end)
  if (dateRangeError) {
    return fail(dateRangeError)
  }

  const db = cloud.database()
  const venueId = staff.venueId
  // 全量加载后在内存按场地过滤（向后兼容：无 venueId 的 legacy 数据视为本场地）
  const transactions = (await fetchAll(db, COLLECTIONS.STORED_VALUE_TRANSACTION, { status: 'active' })).filter((transaction) => isItemInVenue(transaction, venueId))
  const accounts = (await fetchAll(db, COLLECTIONS.STORED_VALUE_ACCOUNT, { status: 'active' })).filter((account) => isItemInVenue(account, venueId))
  const activeTransactions = transactions.filter((transaction) => transaction.status === 'active')
  const activeAccounts = accounts.filter((account) => account.status === 'active')
  const periodTransactions = activeTransactions.filter((transaction) => isDateInRange(transaction.createTime || transaction.date, start, end))
  const rechargeAmount = sumAmount(periodTransactions.filter((transaction) => transaction.type === 'recharge'), 'amount')
  const consumeAmount = sumAmount(periodTransactions.filter((transaction) => transaction.type === 'consume'), 'amount')
  const balanceAmount = sumAmount(activeAccounts, 'balance')

  return ok({ rechargeAmount, consumeAmount, balanceAmount })
}

exports.main = async (event = {}) => {
  const actionHandlers = {
    queryAccountByCustomer,
    queryAccountsByCustomers,
    queryPositiveBalanceMarkers,
    recharge,
    settleIncomeWithStoredValue,
    reverseSettlement,
    getStats
  }

  const handler = actionHandlers[event.action]
  if (!handler) {
    return fail('未知操作')
  }

  try {
    return await handler(event)
  } catch (error) {
    return fail(error.message || '储值卡操作失败')
  }
}

exports.__test__ = {
  calculateSettlement,
  buildReservationSnapshot,
  toAmount,
  getCustomerKey,
  buildStoredValueAccountId,
  normalizeCustomerInputs,
  normalizeMarkerPermissionModule,
  minimizePositiveBalanceMarker,
  authorize,
  buildRechargeIncomeData,
  pickIncomeMetadata,
  buildSettlementIncomeData,
  buildSettlementRemark,
  markReservationSettled,
  normalizeDateString,
  isValidDateString,
  validateDateRange,
  getSettlementCustomer,
  fetchAll,
  sumAmount,
  formatDateString
}
