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
    detailPopup: null,
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
            parsedDetails: that.parseDetails(entry.detail, entry.extra)
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

  // 统一的隐藏字段常量
  _hiddenKeys: { id: true, _id: true, deletedBy: true, staffId: true, deletedByName: true, changes: true },

  parseDetails: function(detailsJson, extraJson) {
    var hiddenKeys = this._hiddenKeys
    var pairs = []
    // Parse detail field
    if (detailsJson) {
      if (typeof detailsJson === 'string') {
        try {
          var parsed = JSON.parse(detailsJson)
          pairs = pairs.concat(this._objectToPairs(parsed))
        } catch (e) {
          // detail is a readable string, skip (popup description will show it)
        }
      } else if (typeof detailsJson === 'object') {
        pairs = pairs.concat(this._objectToPairs(detailsJson))
      }
    }
    // Parse extra field (don't duplicate keys already in detail, skip changes/id)
    if (extraJson && typeof extraJson === 'object') {
      var existingKeys = {}
      if (typeof detailsJson === 'object' && detailsJson !== null) {
        for (var k in detailsJson) { existingKeys[k] = true }
      } else if (typeof detailsJson === 'string') {
        try {
          var parsed2 = JSON.parse(detailsJson)
          for (var k2 in parsed2) { existingKeys[k2] = true }
        } catch (e) { /* ignore */ }
      }
      for (var ek in extraJson) {
        if (Object.prototype.hasOwnProperty.call(extraJson, ek) && !existingKeys[ek] && !hiddenKeys[ek]) {
          var keyMap = {
            amount: '金额', category: '分类', item: '项目', type: '类型',
            role: '角色', name: '姓名', source: '来源', reason: '原因',
            title: '标题', cycle: '周期', status: '状态'
          }
          var val = ek === 'amount' ? '¥' + extraJson[ek] : String(extraJson[ek])
          pairs.push({ key: keyMap[ek] || ek, value: val })
        }
      }
    }
    // 过滤掉隐藏字段
    return pairs.filter(function(p) { return !hiddenKeys[p.key] && p.key !== '记录ID' && p.key !== '员工ID' && p.key !== '删除人' && p.key !== '删除人ID' && p.key !== '变更内容' })
  },

  _objectToPairs: function(obj) {
    var hiddenKeys = this._hiddenKeys
    var pairs = []
    var keyMap = {
      wechatId: '微信号',
      amount: '金额',
      category: '分类',
      item: '项目',
      type: '类型',
      role: '角色',
      name: '姓名'
    }
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (hiddenKeys[key]) continue
        pairs.push({
          key: keyMap[key] || key,
          value: String(obj[key])
        })
      }
    }
    return pairs
  },

  /**
   * 点击日志条目，显示详情弹窗
   */
  onLogTap: function(e) {
    const idx = e.currentTarget.dataset.index
    const log = this.data.logs[idx]
    if (!log) return

    const description = this.buildDetailDescription(log)
    const allDetails = this._buildAllDetails(log)

    this.setData({
      detailPopup: {
        ...log,
        description: description,
        allDetails: allDetails
      }
    })
  },

  /**
   * 构建易读的操作描述 — 重点说清楚"做了什么"、"对象是谁/什么"
   * 例如："删除采购 ¥500 关于物料的采购"
   */
  buildDetailDescription: function(log) {
    var type = log.type || ''
    var detail = log.detail || ''
    var extra = log.extra || {}

    // 解析 detail（可能是字符串或对象）
    var detailObj = {}
    if (typeof detail === 'string') {
      try { detailObj = JSON.parse(detail) } catch (e) { /* text detail */ }
    } else if (typeof detail === 'object' && detail !== null) {
      detailObj = detail
    }

    var amount = extra.amount || detailObj.amount
    var item = extra.item || detailObj.item
    var category = extra.category || detailObj.category
    var source = extra.source || detailObj.source
    var name = extra.name || detailObj.name
    var role = extra.role || detailObj.role
    var reason = extra.reason
    var changes = extra.changes

    // 审批类操作的 detail 描述更具体
    if (typeof detail === 'string') {
      // 审批通过/拒绝/确认付款 等已有清晰描述
      if (detail.indexOf('审批通过') === 0 || detail.indexOf('审批拒绝') === 0 || detail.indexOf('确认付款') === 0) {
        var desc = detail
        if (reason) desc += '。原因：' + reason
        return desc
      }
    }

    if (type.indexOf('PURCHASE') === 0) {
      return this._buildPurchaseDesc(type, amount, item, category, reason, changes)
    }
    if (type.indexOf('INCOME') === 0) {
      return this._buildIncomeDesc(type, amount, detailObj.type || category, source, reason, changes)
    }
    if (type.indexOf('EXPENSE') === 0) {
      return this._buildExpenseDesc(type, amount, name, reason, changes)
    }
    if (type.indexOf('RESERVATION') === 0) {
      return this._buildReservationDesc(type, detail, extra, reason, changes)
    }
    if (type.indexOf('STAFF') === 0) {
      return this._buildStaffDesc(type, name, role, reason, changes)
    }
    if (type.indexOf('ANNOUNCEMENT') === 0) {
      return this._buildAnnouncementDesc(type, detailObj.title || extra.title, reason)
    }
    if (type.indexOf('ATTENDANCE') === 0) {
      return typeof detail === 'string' ? detail : LOG_TYPE_NAMES[type] || type
    }

    // 通用
    if (typeof detail === 'string' && detail) return detail
    return LOG_TYPE_NAMES[type] || type
  },

  // 采购描述：说清楚删除/创建了哪笔采购
  _buildPurchaseDesc: function(type, amount, item, category, reason, changes) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了'
    else if (type.indexOf('_CREATE') > -1) actionWord = '新增了'
    else if (type.indexOf('_UPDATE') > -1) actionWord = '修改了'
    else actionWord = '操作了'

    var target = '采购'
    if (item) target = '「' + item + '」采购'
    else if (category) target = category + '采购'

    var desc = actionWord + target
    if (amount) desc += '  ¥' + amount
    if (category && item) desc += '（' + category + '）'
    if (changes) desc += '，' + this._formatChanges(changes)
    if (reason) desc += '。原因：' + reason
    return desc
  },

  _buildIncomeDesc: function(type, amount, incomeType, source, reason, changes) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了'
    else if (type.indexOf('_CREATE') > -1) actionWord = '新增了'
    else if (type.indexOf('_UPDATE') > -1) actionWord = '修改了'
    else actionWord = '操作了'

    var target = '收入'
    if (incomeType) target = incomeType + '收入'

    var desc = actionWord + target
    if (amount) desc += '  ¥' + amount
    if (source) desc += '  来源：' + source
    if (changes) desc += '，' + this._formatChanges(changes)
    if (reason) desc += '。原因：' + reason
    return desc
  },

  _buildExpenseDesc: function(type, amount, name, reason, changes) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了'
    else if (type.indexOf('_CREATE') > -1) actionWord = '新增了'
    else if (type.indexOf('_UPDATE') > -1) actionWord = '修改了'
    else actionWord = '操作了'

    var target = '支出'
    if (name) target = '「' + name + '」支出'

    var desc = actionWord + target
    if (amount) desc += '  ¥' + amount
    if (changes) desc += '，' + this._formatChanges(changes)
    if (reason) desc += '。原因：' + reason
    return desc
  },

  _buildReservationDesc: function(type, detail, extra, reason, changes) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了'
    else if (type.indexOf('_CREATE') > -1) actionWord = '新增了'
    else if (type.indexOf('_UPDATE') > -1) actionWord = '修改了'
    else actionWord = '操作了'

    var customerName = ''
    if (typeof detail === 'string') {
      var m1 = detail.match(/预约[:：]\s*(.+)/)
      var m2 = detail.match(/^(.+?)[\s]+(修改|更新|取消)/)
      if (m1) customerName = m1[1].trim()
      else if (m2) customerName = m2[1].trim()
    }

    var target = '预约'
    if (customerName) target = customerName + '的预约'

    var desc = actionWord + target
    if (changes) desc += '，' + this._formatChanges(changes)
    if (reason) desc += '。原因：' + reason
    return desc
  },

  _buildStaffDesc: function(type, name, role, reason, changes) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了员工'
    else if (type.indexOf('_CREATE') > -1) actionWord = '新增了员工'
    else if (type.indexOf('_UPDATE') > -1) actionWord = '修改了员工'
    else actionWord = '操作了员工'

    var desc = actionWord
    if (name) desc += ' ' + name
    if (role) desc += '（' + role + '）'
    if (changes) desc += '，' + this._formatChanges(changes)
    if (reason) desc += '。原因：' + reason
    return desc
  },

  _buildAnnouncementDesc: function(type, title, reason) {
    var actionWord = ''
    if (type.indexOf('_DELETE') > -1) actionWord = '删除了公告'
    else if (type.indexOf('_CREATE') > -1) actionWord = '发布了公告'
    else actionWord = '操作了公告'

    var desc = actionWord
    if (title) desc += '「' + title + '」'
    if (reason) desc += '。原因：' + reason
    return desc
  },

  /** 格式化变更内容，展示"字段从旧值变新值" */
  _formatChanges: function(changes) {
    if (!changes) return ''
    if (typeof changes === 'string') return changes
    if (typeof changes !== 'object') return String(changes)
    var parts = []
    for (var k in changes) {
      if (!Object.prototype.hasOwnProperty.call(changes, k)) continue
      var label = k // changes 的 key 可能已经是中文（预约变更用的是中文字段名）
      var v = changes[k]
      // 支持 { from, to } / { oldVal, newVal } / { old, new } 格式
      if (v && typeof v === 'object' && ('from' in v || 'to' in v || 'oldVal' in v || 'newVal' in v || 'old' in v || 'new' in v)) {
        var oldV = v.from !== undefined ? v.from : (v.oldVal !== undefined ? v.oldVal : v.old)
        var newV = v.to !== undefined ? v.to : (v.newVal !== undefined ? v.newVal : v.new)
        var oldStr = this._formatChangeValue(oldV, !!v.isAmount)
        var newStr = this._formatChangeValue(newV, !!v.isAmount)
        parts.push(label + '从' + oldStr + '变' + newStr)
      } else {
        parts.push(label + '：' + String(v))
      }
    }
    return parts.join('，')
  },

  /** 变更值的格式化 */
  _formatChangeValue: function(val, isAmount) {
    if (val === null || val === undefined) return '-'
    var s = String(val)
    if (isAmount) return '¥' + s
    return s
  },

  /**
   * 构建详情弹窗中所有字段列表（过滤掉内部ID，变更内容展开为单独行）
   */
  _buildAllDetails: function(log) {
    var detail = log.detail || ''
    var extra = log.extra || {}
    var detailObj = {}
    if (typeof detail === 'string') {
      try { detailObj = JSON.parse(detail) } catch (e) { /* ignore */ }
    } else if (typeof detail === 'object' && detail !== null) {
      detailObj = detail
    }

    // 不展示的内部字段
    var hiddenKeys = { id: true, _id: true, deletedBy: true, staffId: true, deletedByName: true }
    // 中文名映射
    var keyMap = {
      amount: '金额', category: '分类', item: '项目', type: '类型',
      role: '角色', name: '姓名', source: '来源', reason: '原因',
      title: '标题', cycle: '周期', status: '状态', date: '日期',
      remark: '备注', wechatId: '微信号',
      customerName: '客户', phone: '电话'
    }
    // 重要的字段排在前面（changes 特殊处理，不放这里）
    var importantOrder = ['item', 'amount', 'category', 'source', 'type', 'name', 'role', 'status', 'date', 'customerName', 'phone', 'reason', 'remark', 'title', 'cycle', 'wechatId']

    var rows = []
    var addedKeys = {}

    // 先按重要顺序提取 detail 中的字段
    for (var i = 0; i < importantOrder.length; i++) {
      var ik = importantOrder[i]
      if (detailObj[ik] !== undefined && !hiddenKeys[ik]) {
        rows.push({ key: keyMap[ik] || ik, value: this._formatFieldValue(ik, detailObj[ik]) })
        addedKeys[ik] = true
      }
    }
    // detail 中剩余字段（跳过 changes，单独展开）
    for (var k in detailObj) {
      if (!Object.prototype.hasOwnProperty.call(detailObj, k)) continue
      if (addedKeys[k] || hiddenKeys[k] || k === 'changes') continue
      rows.push({ key: keyMap[k] || k, value: this._formatFieldValue(k, detailObj[k]) })
      addedKeys[k] = true
    }

    // 从 extra 提取（不重复、跳过 changes 和 id 类字段）
    for (var ek in extra) {
      if (!Object.prototype.hasOwnProperty.call(extra, ek)) continue
      if (addedKeys[ek] || hiddenKeys[ek] || ek === 'changes') continue
      rows.push({ key: keyMap[ek] || ek, value: this._formatFieldValue(ek, extra[ek]) })
    }

    // 最后展开 changes 为单独行，每个变更字段一行
    var changesData = extra.changes || detailObj.changes
    if (changesData && typeof changesData === 'object') {
      for (var ck in changesData) {
        if (!Object.prototype.hasOwnProperty.call(changesData, ck)) continue
        var cv = changesData[ck]
        if (cv && typeof cv === 'object' && ('from' in cv || 'to' in cv || 'oldVal' in cv || 'newVal' in cv || 'old' in cv || 'new' in cv)) {
          var oldV = cv.from !== undefined ? cv.from : (cv.oldVal !== undefined ? cv.oldVal : cv.old)
          var newV = cv.to !== undefined ? cv.to : (cv.newVal !== undefined ? cv.newVal : cv.new)
          rows.push({ key: ck, value: this._formatChangeValue(oldV, !!cv.isAmount) + ' → ' + this._formatChangeValue(newV, !!cv.isAmount) })
        } else {
          rows.push({ key: ck, value: String(cv) })
        }
      }
    } else if (changesData && typeof changesData === 'string') {
      rows.push({ key: '变更内容', value: changesData })
    }

    return rows
  },

  /** 格式化字段值，金额加前缀 */
  _formatFieldValue: function(key, value) {
    if (value === null || value === undefined) return '-'
    // 金额类字段
    if (key === 'amount') return '¥' + value
    return String(value)
  },

  hideDetail: function() {
    this.setData({ detailPopup: null })
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
