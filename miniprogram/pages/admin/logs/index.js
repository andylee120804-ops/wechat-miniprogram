const app = getApp()
const { formatDateTime } = require('../../../utils/helpers')
const { LOG_TYPE_NAMES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { checkPermission } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')

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
      { id: 'ATTENDANCE_CLOCK_IN', name: '打卡签到' },
      { id: 'ATTENDANCE_CLOCK_OUT', name: '打卡签退' },
      { id: 'ANNOUNCEMENT_CREATE', name: '创建公告' },
      { id: 'ANNOUNCEMENT_DELETE', name: '删除公告' },
      { id: 'STAFF_CREATE', name: '新增员工' },
      { id: 'STAFF_UPDATE', name: '更新员工' },
      { id: 'STAFF_DELETE', name: '删除员工' },
      { id: 'SEARCH', name: '搜索' },
      { id: 'EXPORT', name: '导出' },
      { id: 'LOGIN', name: '登录' },
      { id: 'LOGOUT', name: '登出' }
    ],
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onShow: function() {
    if (!checkPermission('staff', 'view')) {
      wx.navigateBack()
      return
    }
    var sysInfo = wx.getWindowInfo()
    this.setData({
      theme: app.getThemePageData(),
      statusBarHeight: sysInfo.statusBarHeight || 44
    })
    this.loadData()
  },

  loadData: function() {
    var that = this
    that.setData({ loading: true, page: 1, logs: [], hasMore: true })
    that._fetchLogs(1)
  },

  _fetchLogs: function(page) {
    var that = this
    var dbInstance = wx.cloud.database()
    var where = {}

    if (that.data.logType) {
      where.type = that.data.logType
    }
    if (that.data.startDate) {
      where.timeStr = dbInstance.command.gte(that.data.startDate)
    }
    if (that.data.endDate) {
      if (where.timeStr) {
        where.timeStr = dbInstance.command.gte(that.data.startDate).and(dbInstance.command.lte(that.data.endDate + ' 23:59:59'))
      } else {
        where.timeStr = dbInstance.command.lte(that.data.endDate + ' 23:59:59')
      }
    }

    var skip = (page - 1) * that.data.pageSize
    dbInstance.collection(COLLECTIONS.OPERATION_LOG).where(where)
      .orderBy('timestamp', 'desc')
      .skip(skip)
      .limit(that.data.pageSize)
      .get()
      .then(function(res) {
        var logs = res.data || []
        logs.forEach(function(entry) {
          entry.typeName = LOG_TYPE_NAMES[entry.type] || entry.type || '未知'
          entry.formattedTime = entry.timeStr || formatDateTime(entry.timestamp)
          entry.parsedDetails = that.parseDetails(entry.detail)
        })

        var allLogs = page === 1 ? logs : that.data.logs.concat(logs)
        var hasMore = logs.length >= that.data.pageSize

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
          console.warn('operation_log 集合不存在，请先在云开发控制台创建')
          return
        }
        handleCloudError(err, '加载操作日志')
      })
  },

  parseDetails: function(detailsJson) {
    if (!detailsJson) return []
    if (typeof detailsJson === 'string') {
      try {
        var parsed = JSON.parse(detailsJson)
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
    var pairs = []
    var keyMap = {
      wechatId: '微信号',
      amount: '金额',
      category: '分类',
      item: '项目',
      type: '类型',
      role: '角色',
      name: '姓名',
      staffId: '员工ID'
    }
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
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
    var type = e.currentTarget.dataset.type
    this.setData({ logType: type })
    this.loadData()
  },

  onStartDateChange: function(e) {
    this.setData({ startDate: e.detail.value })
  },

  onEndDateChange: function(e) {
    this.setData({ endDate: e.detail.value })
  },

  onQuery: function() {
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
