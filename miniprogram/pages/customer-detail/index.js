const app = getApp()
const { formatDate, formatDateTime, formatAmount } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const db = require('../../utils/db')

const PAYMENT_METHOD_OPTIONS = [
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'cash', label: '现金' },
  { value: 'bank', label: '银行转账' },
  { value: 'other', label: '其他' }
]

function toNumber(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100) / 100
}

function formatMoney(value) {
  return formatAmount(toNumber(value))
}

function getPaymentMethodLabel(value) {
  const option = PAYMENT_METHOD_OPTIONS.find(item => item.value === value)
  return option ? option.label : '微信'
}

function createRequestId() {
  return 'recharge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
}

function formatStoredValueAccount(account) {
  if (!account) return null
  return {
    ...account,
    balanceText: formatMoney(account.balance),
    totalRechargeText: formatMoney(account.totalRecharge),
    totalConsumeText: formatMoney(account.totalConsume)
  }
}

function buildConsumeTitle(transaction) {
  const snapshot = transaction.reservationSnapshot || {}
  const parts = [snapshot.date, snapshot.time, snapshot.roomName].filter(Boolean)
  if (!parts.length) return '储值抵扣'
  return parts.join(' ') + ' 储值抵扣'
}

function formatStoredValueTransaction(transaction) {
  const isRecharge = transaction.type === 'recharge'
  const amount = toNumber(transaction.amount || transaction.deductedAmount)
  const balance = toNumber(transaction.balanceAfter)
  return {
    ...transaction,
    title: isRecharge ? '储值充值' : buildConsumeTitle(transaction),
    typeLabel: isRecharge ? '充值' : '消费',
    amountText: (isRecharge ? '+' : '-') + '¥' + formatMoney(amount),
    balanceText: '余额 ¥' + formatMoney(balance),
    formattedTime: formatDateTime(transaction.createTime || transaction.updateTime || transaction.date),
    amountClass: isRecharge ? 'positive' : 'negative'
  }
}

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    customerName: '',
    customerNameInitial: '',
    loading: true,
    totalVisits: 0,
    totalSpending: '0.00',
    preferredRoom: '',
    lastVisit: '',
    visitHistory: [],
    storedValueAccount: null,
    storedValueTransactions: [],
    storedValueErrorMessage: '',
    canRecharge: false,
    showRechargeModal: false,
    rechargeAmount: '',
    rechargePhone: '',
    rechargePaymentMethod: 'wechat',
    rechargePaymentMethodLabel: '微信',
    rechargeRemark: '',
    rechargeRequestId: '',
    rechargeSubmitting: false,
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS
  },

  onLoad(options) {
    if (!hasPermission('customer', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    const name = decodeURIComponent(options.name || '')
    const canRecharge = hasPermission('income', ACTIONS.ADD)
    this.setData({ theme, customerName: name, customerNameInitial: (name || '?').charAt(0), statusBarHeight: app.globalData.statusBarHeight || 44, canRecharge })
  },

  onShow() {
    if (this.data.customerName) this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    try {
      const [resRes, incRes, storedValueData] = await Promise.all([
        db.queryAll(COLLECTIONS.RESERVATION, {
          customerName: this.data.customerName,
          status: 'confirmed'
        }, 'date', 'desc'),
        db.queryAll(COLLECTIONS.INCOME, {
          source: this.data.customerName
        }),
        this.loadStoredValueData()
      ])

      const history = resRes.data || []
      const totalSpending = (incRes.data || []).reduce((s, i) => s + (i.amount || 0), 0)

      // Preferred room
      const roomCount = {}
      history.forEach(h => {
        const room = h.roomName || h.room || '未知'
        roomCount[room] = (roomCount[room] || 0) + 1
      })
      const preferredRoom = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '未知'

      this.setData({
        loading: false,
        canRecharge: hasPermission('income', ACTIONS.ADD),
        totalVisits: history.length,
        totalSpending: formatAmount(totalSpending),
        preferredRoom,
        lastVisit: history[0] ? formatDate(history[0].date) : '-',
        visitHistory: history.slice(0, 20).map(h => ({
          ...h, formattedDate: formatDate(h.date)
        })),
        storedValueAccount: storedValueData.account,
        storedValueTransactions: storedValueData.transactions,
        storedValueErrorMessage: storedValueData.errorMessage
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载客户详情失败', icon: 'none' })
    }
  },

  async loadStoredValueData(optionalPhone) {
    try {
      const queryPhone = String(optionalPhone || (this.data.storedValueAccount && this.data.storedValueAccount.phone) || this.data.rechargePhone || '').trim()
      const result = await wx.cloud.callFunction({
        name: 'storedValue',
        data: {
          action: 'queryAccountByCustomer',
          customerName: this.data.customerName,
          phone: queryPhone
        }
      })

      const response = result.result || {}
      if (!response.success) {
        return {
          account: null,
          transactions: [],
          errorMessage: response.message || '储值账户加载失败，请重试'
        }
      }

      const payload = response.data || null
      const hasAccountEnvelope = !!(payload && Object.prototype.hasOwnProperty.call(payload, 'account'))
      const rawAccount = hasAccountEnvelope ? payload.account : payload
      const account = formatStoredValueAccount(rawAccount)
      const cloudTransactions = payload && Array.isArray(payload.transactions) ? payload.transactions : []
      const transactions = account ? cloudTransactions.map(formatStoredValueTransaction) : []

      return { account, transactions, errorMessage: '' }
    } catch (err) {
      return { account: null, transactions: [], errorMessage: '储值账户加载失败，请重试' }
    }
  },

  openRechargeModal() {
    if (!hasPermission('income', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      this.setData({ canRecharge: false })
      return
    }

    this.setData({
      canRecharge: true,
      showRechargeModal: true,
      rechargeAmount: '',
      rechargePhone: this.data.storedValueAccount ? (this.data.storedValueAccount.phone || '') : '',
      rechargePaymentMethod: 'wechat',
      rechargePaymentMethodLabel: '微信',
      rechargeRemark: '',
      rechargeRequestId: createRequestId(),
      rechargeSubmitting: false
    })
  },

  closeRechargeModal() {
    if (this.data.rechargeSubmitting) return
    this.setData({ showRechargeModal: false })
  },

  onRechargeAmountInput(e) {
    this.setData({ rechargeAmount: e.detail.value })
  },

  onRechargePhoneInput(e) {
    this.setData({ rechargePhone: e.detail.value })
  },

  onRechargeRemarkInput(e) {
    this.setData({ rechargeRemark: e.detail.value })
  },

  onRechargePaymentMethodChange(e) {
    const index = Number(e.detail.value || 0)
    const option = this.data.paymentMethodOptions[index] || this.data.paymentMethodOptions[0]
    this.setData({
      rechargePaymentMethod: option.value,
      rechargePaymentMethodLabel: option.label
    })
  },

  async submitRecharge() {
    if (this.data.rechargeSubmitting) return

    if (!hasPermission('income', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      this.setData({ canRecharge: false })
      return
    }

    const amount = toNumber(this.data.rechargeAmount)
    if (amount <= 0) {
      wx.showToast({ title: '请输入有效充值金额', icon: 'none' })
      return
    }

    const requestId = this.data.rechargeRequestId || createRequestId()
    this.setData({ rechargeSubmitting: true, rechargeRequestId: requestId })

    try {
      const result = await wx.cloud.callFunction({
        name: 'storedValue',
        data: {
          action: 'recharge',
          customerName: this.data.customerName,
          phone: String(this.data.rechargePhone || '').trim(),
          amount,
          requestId,
          paymentMethod: this.data.rechargePaymentMethod,
          remark: String(this.data.rechargeRemark || '').trim()
        }
      })

      const response = result.result || {}
      if (!response.success) {
        this.setData({ rechargeSubmitting: false })
        wx.showToast({ title: response.message || '充值失败', icon: 'none' })
        return
      }

      const rechargeAccount = response.data && response.data.account ? response.data.account : null
      const storedValueData = await this.loadStoredValueData((rechargeAccount && rechargeAccount.phone) || this.data.rechargePhone)
      this.setData({
        storedValueAccount: storedValueData.account,
        storedValueTransactions: storedValueData.transactions,
        storedValueErrorMessage: storedValueData.errorMessage,
        showRechargeModal: false,
        rechargeSubmitting: false,
        rechargeAmount: '',
        rechargeRemark: '',
        rechargeRequestId: ''
      })
      wx.showToast({ title: '充值成功', icon: 'success' })
    } catch (err) {
      this.setData({ rechargeSubmitting: false })
      wx.showToast({ title: '充值失败，请重试', icon: 'none' })
    }
  },

  getPaymentMethodLabel
})
