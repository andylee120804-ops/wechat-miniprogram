const app = getApp()
const { formatDateTime } = require('../../../utils/helpers')
const { LOG_TYPE_NAMES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

const DEFAULT_RANGE_DAYS = 180 // 默认查询近半年记录

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    logType: '',
    startDate: '',
    endDate: '',
    logs: [],
    logTypeOptions: [
      { id: '', name: '全部' },
      { id: 'INCOME_CREATE', name: '创建收入' },
      { id: 'INCOME_UPDATE', name: '更新收入' },
      { id: 'INCOME_DELETE', name: '删除收入' },
      { id: 'PURCHASE_CREATE', name: '创建采购' },
      { id: 'PURCHASE_UPDATE', name: '更新采购' },
      { id: 'PURCHASE_DELETE', name: '删除采购' },
      { id: 'EXPENSE_CREATE', name: '创建支出' },
      { id: 'EXPENSE_UPDATE', name: '更新支出' },
      { id: 'EXPENSE_DELETE', name: '删除支出' },
      { id: 'RESERVATION_CREATE', name: '创建预约' },
      { id: 'RESERVATION_UPDATE', name: '更新预约' },
      { id: 'RESERVATION_DELETE', name: '删除预约' },
      { id: 'ANNOUNCEMENT_CREATE', name: '创建公告' },
      { id: 'ANNOUNCEMENT_DELETE', name: '删除公告' },
      { id: 'STAFF_CREATE', name: '新增员工' },
      { id: 'STAFF_UPDATE', name: '更新员工' },
      { id: 'STAFF_DELETE', name: '删除员工' }
    ],
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onShow: function() {
    if (!hasPermission('staff', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限查看', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const sysInfo = wx.getWindowInfo()
    this.setData({
      theme: app.getThemePageData(),
      statusBarHeight: sysInfo.statusBarHeight || 44
    })
    this.loadData()
  },

  loadData: function() {
    const that = this
    that.setData({ loading: true, page: 1, logs: [], hasMore: true })
    that._fetchLogs(1)
  },

  _fetchLogs: function(page) {
    const that = this
    const dbInst = db.getDb()
    const where = {}

    if (that.data.logType) {
      where.type = that.data.logType
    }
    if (that.data.startDate) {
      where.timeStr = dbInst.command.gte(that.data.startDate)
    }
    if (that.data.endDate) {
      if (where.timeStr) {
        where.timeStr = dbInst.command.gte(that.data.startDate).and(dbInst.command.lte(that.data.endDate + ' 23:59:59'))
      } else {
        where.timeStr = dbInst.command.lte(that.data.endDate + ' 23:59:59')
      }
    }
    // 未指定日期范围时默认查近半年
    if (!that.data.startDate && !that.data.endDate) {
      const d = new Date()
      d.setDate(d.getDate() - DEFAULT_RANGE_DAYS)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      where.timeStr = dbInst.command.gte(year + '-' + month + '-' + day)
    }

    const skip = (page - 1) * that.data.pageSize
    dbInst.collection(COLLECTIONS.OPERATION_LOG).where(where)
      .orderBy('timestamp', 'desc')
      .skip(skip)
      .limit(that.data.pageSize)
      .get()
      .then(function(res) {
        const rawLogs = res.data || []
        const logs = rawLogs.map(function(entry) {
          return {
            ...entry,
            typeName: LOG_TYPE_NAMES[entry.type] || entry.type || '未知',
            formattedTime: entry.timeStr || formatDateTime(entry.timestamp),
            parsedDetails: that.parseDetails(entry.detail)
          }
        })

        const allLogs = page === 1 ? logs : that.data.logs.concat(logs)
        const hasMore = logs.length >= that.data.pageSize

        that.setData({
          logs: allLogs,
          page: page,
          hasMore: hasMore,
          loading: false
        })
      })
      .catch(function(err) {
        that.setData({ loading: false })
        // If collection doesn't exist yet, show empty state (first use)
        if (err.errCode === -502005) {
          return
        }
        handleCloudError(err, '加载操作日志')
      })
  },

  parseDetails: function(detailsJson) {
    if (!detailsJson) return []
    if (typeof detailsJson === 'string') {
      try {
        const parsed = JSON.parse(detailsJson)
        return this._objectToPairs(parsed)
      } catch (e) {
        return [{ key: '详情', value: detailsJson }]
      }
    }
    if (typeof detailsJson === 'object') {
      return this._objectToPairs(detailsJson)
    }
    return [{ key: '详情', value: String(detailsJson) }]
  },

  _objectToPairs: function(obj) {
    const pairs = []
    const keyMap = {
      wechatId: '微信号',
      amount: '金额',
      category: '分类',
      item: '项目',
      type: '类型',
      role: '角色',
      name: '姓名',
      staffId: '员工ID'
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        pairs.push({
          key: keyMap[key] || key,
          value: String(obj[key])
        })
      }
    }
    return pairs
  },

  onTypeChange: function(e) {
    this.setData({ logType: e.detail.id })
    this.loadData()
  },

  onTypeTap: function(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ logType: type })
    this.loadData()
  },

  onStartDateChange: function(e) {
    const val = e.detail.value
    if (this.data.endDate && val > this.data.endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ startDate: val })
  },

  onEndDateChange: function(e) {
    const val = e.detail.value
    if (this.data.startDate && val < this.data.startDate) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' })
      return
    }
    this.setData({ endDate: val })
  },

  onQuery: function() {
    if (this.data.startDate && this.data.endDate && this.data.startDate > this.data.endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.loadData()
  },

  loadMore: function() {
    if (!this.data.hasMore || this.data.loading) return
    this._fetchLogs(this.data.page + 1)
  },

  onBack: function() {
    wx.navigateBack()
  }
})
