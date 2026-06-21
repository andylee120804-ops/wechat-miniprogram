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

async function authorize(requiredModule, requiredAction, event = {}) {
  const staffId = event.staffId || event.operatorId
  if (!staffId) {
    return fail('缺少操作人信息')
  }

  const db = cloud.database()
  const staffResult = await db.collection(COLLECTIONS.STAFF).doc(staffId).get()
  const staff = staffResult.data

  if (!staff || staff.status === 'deleted') {
    return fail('操作人不存在')
  }

  if (staff.role === 'boss') {
    return ok(staff)
  }

  const permissions = staff.permissions || {}
  const modulePermissions = permissions[requiredModule] || {}
  if (modulePermissions[requiredAction]) {
    return ok(staff)
  }

  return fail('无权限操作')
}

async function queryAccountByCustomer(event = {}) {
  const customerKey = getCustomerKey(event)
  if (!customerKey) {
    return fail('缺少客户信息')
  }

  const account = await findSingleAccount(customerKey)
  return ok(account)
}

async function queryAccountsByCustomers(event = {}) {
  const customers = Array.isArray(event.customers) ? event.customers : []
  const accounts = await Promise.all(
    customers.map(async (customer) => {
      const customerKey = getCustomerKey(customer)
      if (!customerKey) {
        return null
      }
      return findSingleAccount(customerKey)
    })
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
  getCustomerKey
}
