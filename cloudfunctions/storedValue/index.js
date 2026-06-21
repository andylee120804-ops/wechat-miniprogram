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
    return phone
  }

  return String(customer.customerName || customer.name || '').trim()
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
  await authorize('customer', 'view')

  const customerKey = getCustomerKey(event)
  if (!customerKey) {
    return fail('缺少客户信息')
  }

  const account = await findSingleAccount(customerKey)
  return ok(account)
}

async function queryAccountsByCustomers(event = {}) {
  await authorize('income', 'add')

  const normalized = normalizeCustomerInputs(event.customers)
  if (normalized.isTooMany) {
    return fail(`一次最多查询${MAX_CUSTOMER_BATCH_SIZE}个客户`)
  }

  const accounts = await Promise.all(
    normalized.customers.map(async (customer) => findSingleAccount(customer.key))
  )

  return ok(accounts.filter(Boolean))
}

async function findSingleAccount(customerKey) {
  const db = cloud.database()
  const result = await db.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
    .where({ customerKey })
    .limit(1)
    .get()

  return result.data[0] || null
}

async function recharge() {
  return fail('充值功能未启用')
}

async function settleIncomeWithStoredValue() {
  return fail('储值抵扣功能未启用')
}

async function getStats() {
  return fail('储值统计功能未启用')
}

exports.main = async (event = {}) => {
  const actionHandlers = {
    queryAccountByCustomer,
    queryAccountsByCustomers,
    recharge,
    settleIncomeWithStoredValue,
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
  normalizeCustomerInputs,
  authorize
}
