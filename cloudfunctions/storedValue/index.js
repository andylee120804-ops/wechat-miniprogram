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
  return [
    String(customer.phone || '').trim(),
    String(customer.customerName || customer.name || '').trim()
  ].filter(Boolean)
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
  return findSingleAccountInCollection(db, customerKey)
}

async function findSingleAccountInCollection(collectionProvider, customerKey) {
  const result = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
    .where({ customerKey, status: 'active' })
    .limit(1)
    .get()

  return result.data[0] || null
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
      return result.data[0]
    }
  }

  const phone = String(event.phone || '').trim()
  if (phone) {
    const phoneResult = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ phone, status: 'active' })
      .limit(1)
      .get()

    if (phoneResult.data[0]) {
      return phoneResult.data[0]
    }
  }

  const customerName = String(event.customerName || event.name || '').trim()
  if (customerName) {
    const nameResult = await collectionProvider.collection(COLLECTIONS.STORED_VALUE_ACCOUNT)
      .where({ customerName, status: 'active' })
      .limit(1)
      .get()

    if (nameResult.data[0]) {
      return nameResult.data[0]
    }
  }

  return null
}

async function findAccountByRechargeEventInCollection(collectionProvider, event = {}) {
  const customerKey = getCustomerKey(event)
  if (!customerKey) {
    return null
  }

  const keyedAccount = await findSingleAccountInCollection(collectionProvider, customerKey)
  if (keyedAccount) {
    return keyedAccount
  }

  return findLegacyAccountInCollection(collectionProvider, event)
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

function buildSettlementRemark(baseRemark, originalAmount, deductedAmount, incomeAmount) {
  const remark = String(baseRemark || '').trim() || '储值抵扣'
  return `${remark}；原金额${toAmount(originalAmount)}，储值抵扣${toAmount(deductedAmount)}，实收${toAmount(incomeAmount)}`
}

function buildSettlementIncomeData(incomeData, account, transaction, settlement, staff) {
  const now = new Date()
  const originalAmount = toAmount(incomeData.amount)
  const deductedAmount = toAmount(settlement.deductedAmount)
  const incomeAmount = toAmount(settlement.incomeAmount)

  return {
    type: incomeData.type || 'dining',
    categoryLabel: incomeData.categoryLabel || '',
    settlementMode: settlement.mode,
    storedValueAccountId: account && account._id ? account._id : '',
    storedValueTransactionId: transaction && transaction._id ? transaction._id : '',
    reservationId: incomeData.reservationId || '',
    originalAmount,
    deductedAmount,
    amount: incomeAmount,
    source: String(incomeData.source || incomeData.customerName || '').trim(),
    paymentMethod: incomeData.paymentMethod || '',
    remark: buildSettlementRemark(incomeData.remark, originalAmount, deductedAmount, incomeAmount),
    collectedBy: staff._id,
    collectedByName: staff.name || '',
    date: incomeData.date || formatDateString(now),
    createTime: now,
    updateTime: now,
    status: 'active'
  }
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
  const customerKey = getCustomerKey(customer)
  if (customerKey) {
    const keyedAccount = await findSingleAccountInCollection(collectionProvider, customerKey)
    if (keyedAccount) {
      return keyedAccount
    }
  }

  return findLegacyAccountInCollection(collectionProvider, customer)
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

  return {
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
    date: incomeData.date || formatDateString(now),
    createTime: now,
    updateTime: now,
    status: 'active'
  }
}

function normalizeDateString(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.slice(0, 10)
  }

  if (value instanceof Date) {
    return formatDateString(value)
  }

  if (value && typeof value.toDate === 'function') {
    return formatDateString(value.toDate())
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
  const customerKey = getCustomerKey({ phone, customerName })

  if (!customerName) {
    return fail('客户姓名不能为空')
  }

  if (amount <= 0) {
    return fail('充值金额必须大于0')
  }

  const db = cloud.database()
  const now = new Date()

  const result = await db.runTransaction(async (transaction) => {
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
  const reservation = await getReservationById(db, reservationId)
  if (!reservation) {
    return fail('关联预约不存在')
  }

  if (reservation.hasIncome) {
    return fail('该预约已结算')
  }

  const account = await findAccountBySettlementEventInCollection(db, event, reservation)
  const incomeData = Object.assign({}, event, {
    reservationId,
    source: (reservation && reservation.customerName) || event.source || event.customerName || '',
    phone: (reservation && reservation.phone) || event.phone || ''
  })

  if (!account) {
    const now = new Date()
    const incomePayload = buildNormalIncomeData(incomeData, 'normal', staff, null)
    const incomeResult = await db.runTransaction(async (transaction) => {
      const transactionReservation = await getReservationById(transaction, reservationId)
      if (!transactionReservation) {
        throw new Error('关联预约不存在')
      }

      if (transactionReservation.hasIncome) {
        throw new Error('该预约已结算')
      }
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
      return createdIncome
    })
    return ok({ settlementMode: 'normal', incomeId: incomeResult._id })
  }

  const balanceBefore = toAmount(account.balance)
  if (balanceBefore <= 0) {
    const now = new Date()
    const incomePayload = buildNormalIncomeData(incomeData, 'stored_empty', staff, account)
    const incomeResult = await db.runTransaction(async (transaction) => {
      const transactionReservation = await getReservationById(transaction, reservationId)
      if (!transactionReservation) {
        throw new Error('关联预约不存在')
      }

      if (transactionReservation.hasIncome) {
        throw new Error('该预约已结算')
      }
      const createdIncome = await transaction.collection(COLLECTIONS.INCOME).add({ data: incomePayload })
      await markReservationSettled(transaction, reservationId, {
        settlementMode: 'stored_empty',
        storedValueAccountId: account._id,
        incomeId: createdIncome._id,
        originalAmount: amount,
        deductedAmount: 0,
        incomeAmount: amount,
        settledBy: staff._id,
        settledByName: staff.name || '',
        settledAt: now
      })
      return createdIncome
    })
    return ok({ settlementMode: 'stored_empty', incomeId: incomeResult._id, accountId: account._id })
  }

  const now = new Date()
  const settlement = calculateSettlement(balanceBefore, amount)
  const result = await db.runTransaction(async (transaction) => {
    const transactionReservation = await getReservationById(transaction, reservationId)
    if (!transactionReservation) {
      throw new Error('关联预约不存在')
    }

    if (transactionReservation.hasIncome) {
      throw new Error('该预约已结算')
    }

    const currentAccount = await findAccountBySettlementEventInCollection(transaction, event, transactionReservation)
    if (!currentAccount) {
      throw new Error('储值账户不存在')
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
      amount: freshSettlement.deductedAmount,
      balanceBefore: freshBalanceBefore,
      balanceAfter: freshSettlement.balanceAfter,
      incomeId: null,
      reservationId,
      reservationSnapshot: buildReservationSnapshot(transactionReservation || reservation || incomeData),
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

  return ok(Object.assign({}, result, { settlementMode: result.settlementMode || settlement.mode }))
}

async function getStats(event = {}) {
  await authorize('dashboard', 'view')

  const start = normalizeDateString(event.start)
  const end = normalizeDateString(event.end)
  const dateRangeError = validateDateRange(start, end)
  if (dateRangeError) {
    return fail(dateRangeError)
  }

  const db = cloud.database()
  const transactions = await fetchAll(db, COLLECTIONS.STORED_VALUE_TRANSACTION, { status: 'active' })
  const accounts = await fetchAll(db, COLLECTIONS.STORED_VALUE_ACCOUNT, { status: 'active' })
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
  buildStoredValueAccountId,
  normalizeCustomerInputs,
  authorize,
  buildRechargeIncomeData,
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
