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
const MAX_LOCK_RETRIES = 3

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

async function findAccountByRechargeEvent(event = {}) {
  const phone = String(event.phone || '').trim()
  const customerName = String(event.customerName || '').trim()

  if (phone) {
    const account = await findSingleAccount(phone)
    if (account) {
      return account
    }
  }

  if (customerName) {
    return findSingleAccount(customerName)
  }

  return null
}

function formatDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
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
    date: formatDateString(now),
    createTime: now,
    updateTime: now,
    status: 'active'
  }
}

async function updateAccountWithRetry(accountId, buildUpdate) {
  const db = cloud.database()
  let lastError = null

  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt += 1) {
    const latestResult = await db.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ _id: accountId })
      .limit(1)
      .get()
    const latestAccount = latestResult.data[0]

    if (!latestAccount) {
      throw new Error('储值账户不存在')
    }

    const currentVersion = Number(latestAccount._version || 0)
    const updateData = buildUpdate(latestAccount)
    const updateResult = await db.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ _id: accountId, _version: currentVersion })
      .update({ data: Object.assign({}, updateData, { _version: currentVersion + 1 }) })
    const updatedCount = updateResult.stats && updateResult.stats.updated

    if (updatedCount === 1) {
      return Object.assign({}, latestAccount, updateData, { _version: currentVersion + 1 })
    }

    lastError = new Error('储值账户版本冲突')
  }

  throw lastError || new Error('储值账户更新失败')
}

async function recharge(event = {}) {
  const staff = await authorize('income', 'add')
  const customerName = String(event.customerName || '').trim()
  const phone = String(event.phone || '').trim()
  const amount = toAmount(event.amount)

  if (!customerName) {
    return fail('客户姓名不能为空')
  }

  if (amount <= 0) {
    return fail('充值金额必须大于0')
  }

  const db = cloud.database()
  const now = new Date()
  const existingAccount = await findAccountByRechargeEvent({ phone, customerName })
  let account = null
  let balanceBefore = 0

  if (existingAccount) {
    balanceBefore = toAmount(existingAccount.balance)
    account = await updateAccountWithRetry(existingAccount._id, (latestAccount) => ({
      balance: toAmount(toAmount(latestAccount.balance) + amount),
      totalRecharge: toAmount(toAmount(latestAccount.totalRecharge) + amount),
      updatedBy: staff._id,
      updatedByName: staff.name || '',
      updateTime: now
    }))
    balanceBefore = toAmount(account.balance - amount)
  } else {
    const accountData = {
      customerName,
      phone,
      customerKey: phone || customerName,
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
    const accountResult = await db.collection(COLLECTIONS.STORED_VALUE_ACCOUNT).add({ data: accountData })
    account = Object.assign({}, accountData, { _id: accountResult._id })
  }

  const incomeData = buildRechargeIncomeData(event, account, staff)
  const incomeResult = await db.collection(COLLECTIONS.INCOME).add({ data: incomeData })
  const transactionData = {
    type: 'recharge',
    status: 'active',
    accountId: account._id,
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
  const transactionResult = await db.collection(COLLECTIONS.STORED_VALUE_TRANSACTION).add({ data: transactionData })
  const transaction = Object.assign({}, transactionData, { _id: transactionResult._id })

  await db.collection(COLLECTIONS.INCOME)
    .doc(incomeResult._id)
    .update({ data: { storedValueTransactionId: transactionResult._id } })

  return ok({ account, transaction, incomeId: incomeResult._id })
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
  authorize,
  buildRechargeIncomeData,
  formatDateString,
  updateAccountWithRetry
}
