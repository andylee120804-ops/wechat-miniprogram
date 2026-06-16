const { formatDate, getRoomName, getExclusiveTypeName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { validateRequired, validateGuestCount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const reservationConfig = require('../../utils/reservationConfig')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    isEdit: false,
    id: '',
    date: '',
    time: '',
    exclusiveType: 'none',
    room: '',
    standard: 0,
    isPartner: false,
    standardPicked: false,
    submitting: false,
    bossList: [],
    showBossPicker: false,
    selectedBossIndex: -1,
    errors: {},
    showDeleteModal: false,

    // ── Dynamic config-driven data ──
    roomOptions: [],       // enabled rooms from config
    rooms: [],             // all rooms (including disabled)
    currentRoomConfig: null,
    timeOptions: [],
    exclusiveOptions: [],
    standardOptions: [],
    partnerStandard: 0,
    defaultStandard: 0,
    allowNoStandard: false,
    formConfigFields: [],  // raw fields from config
    formFields: [],        // resolved fields for current room
    formData: {},          // values keyed by field.id
    _dishPriceRequired: false
  },

  async onLoad(options) {
    var app = getApp()
    var theme = app.getThemePageData()
    var today = formatDate(new Date())
    this.setData({
      theme: theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      date: today,
      todayDate: today
    })

    await this.loadReservationConfig()

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadReservation(options.id)
    } else if (options.date) {
      if (options.date < today) {
        wx.showModal({
          title: '无法创建',
          content: '不能创建过去日期的预约',
          showCancel: false,
          complete: function() { wx.navigateBack() }
        })
      } else {
        this.setData({ date: options.date })
      }
    }
    this.loadDishPriceRequired()
  },

  async loadReservationConfig() {
    try {
      var rooms = await reservationConfig.loadRooms()
      var formConfig = await reservationConfig.loadFormConfig()
      var enabledRooms = rooms.filter(function(r) { return r.enabled })
        .sort(function(a, b) { return a.order - b.order })
      var firstRoom = enabledRooms[0] || rooms[0]

      // Build initial formData from field definitions
      var formData = {}
      formConfig.fields.forEach(function(f) {
        formData[f.id] = f.type === 'number' ? '' : ''
      })

      this.setData({
        rooms: rooms,
        roomOptions: enabledRooms,
        formConfigFields: formConfig.fields,
        formData: formData,
        room: firstRoom ? firstRoom.id : '',
        currentRoomConfig: firstRoom
      })

      if (firstRoom) {
        this.applyRoomConfig(firstRoom)
      }

      // Load boss list for partner mode
      this.loadBossList()
    } catch (err) {
      console.warn('加载预约配置失败:', err)
      // Fall back to defaults already in reservationConfig
      this.loadBossList()
    }
  },

  applyRoomConfig(roomConfig) {
    var resolved = reservationConfig.resolveFields(
      this.data.formConfigFields, roomConfig.id
    )

    var updates = {
      timeOptions: roomConfig.timeSlots,
      exclusiveOptions: roomConfig.exclusiveTypes,
      standardOptions: roomConfig.standards,
      partnerStandard: roomConfig.partnerStandard,
      defaultStandard: roomConfig.defaultStandard,
      allowNoStandard: roomConfig.standards.length === 0,
      formFields: resolved
    }

    // Reset time/exclusive if current selection not in new room's options
    if (!roomConfig.timeSlots.includes(this.data.time)) {
      updates.time = roomConfig.timeSlots[0] || ''
    }
    if (!roomConfig.exclusiveTypes.includes(this.data.exclusiveType)) {
      updates.exclusiveType = roomConfig.exclusiveTypes.includes('none') ? 'none' :
        roomConfig.exclusiveTypes[0] || 'none'
    }

    this.setData(updates)
  },

  async loadBossList() {
    try {
      var res = await db.queryAll(COLLECTIONS.STAFF, { role: 'boss', status: 'active' })
      if (res.data && res.data.length > 0) {
        this.setData({ bossList: res.data })
      }
    } catch (err) {
      console.warn('加载老板名单失败:', err)
    }
  },

  onBack() { wx.navigateBack() },

  async loadReservation(id) {
    try {
      wx.showLoading({ title: '加载中' })
      var res = await db.getDoc(COLLECTIONS.RESERVATION, id)
      if (!res) {
        wx.showToast({ title: '预约不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      var isPartner = res.isPartner || false
      var selectedBossIndex = -1
      if (isPartner && this.data.bossList.length > 0) {
        selectedBossIndex = this.data.bossList.findIndex(function(b) { return b.name === res.customerName })
      }

      // Restore formData from reservation doc
      var formData = {}
      this.data.formConfigFields.forEach(function(f) {
        if (f.builtin) {
          formData[f.id] = res[f.id] !== undefined ? String(res[f.id]) : ''
        }
      })
      // Custom fields from customFields object
      var customFields = res.customFields || {}
      this.data.formConfigFields.forEach(function(f) {
        if (!f.builtin && customFields[f.id] !== undefined) {
          formData[f.id] = String(customFields[f.id])
        }
      })

      // Set room — backward compat: old bookings with exclusiveType != none may have room='big'
      var room = res.room || 'big'
      var roomConfig = this.data.roomOptions.find(function(r) { return r.id === room })
      if (!roomConfig) {
        // Fallback: use the raw room value even if not in config (old data)
        roomConfig = this.data.rooms.find(function(r) { return r.id === room }) || this.data.currentRoomConfig
      }

      var hasStandard = res.standard !== undefined && res.standard !== null && res.standard !== 0

      this.setData({
        date: formatDate(res.date),
        time: res.time || '中午',
        exclusiveType: res.exclusiveType || (res.isExclusive ? 'full' : 'none'),
        room: room,
        currentRoomConfig: roomConfig,
        standard: hasStandard ? res.standard : 0,
        isPartner: isPartner,
        standardPicked: hasStandard || isPartner,
        selectedBossIndex: selectedBossIndex,
        formData: formData
      })

      if (roomConfig) {
        this.applyRoomConfig(roomConfig)
      }

      this.loadDishPriceRequired()
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '加载预约')
    }
  },

  onDateChange(e) {
    var selected = e.detail.value
    var today = formatDate(new Date())
    if (selected < today) {
      wx.showToast({ title: '不能选择过去的日期', icon: 'none' })
      return
    }
    this.setData({ date: selected })
    this.clearError('date')
    this.loadDishPriceRequired()
  },

  selectTime(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ time: e.currentTarget.dataset.value })
    this.clearError('time')
  },

  selectExclusive(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ exclusiveType: e.currentTarget.dataset.value })
    this.clearError('room')
  },

  selectRoom(e) {
    wx.vibrateShort({ type: 'light' })
    var roomId = e.currentTarget.dataset.value
    var roomConfig = this.data.roomOptions.find(function(r) { return r.id === roomId })
    if (!roomConfig) return

    var oldRoom = this.data.room
    this.setData({ room: roomId, currentRoomConfig: roomConfig })
    this.applyRoomConfig(roomConfig)

    // Clear values for fields hidden in the new room
    var oldFields = reservationConfig.resolveFields(this.data.formConfigFields, oldRoom)
    var newFields = reservationConfig.resolveFields(this.data.formConfigFields, roomId)
    var updates = {}
    oldFields.forEach(function(f) {
      if (!newFields.find(function(nf) { return nf.id === f.id })) {
        updates['formData.' + f.id] = ''
      }
    })
    if (Object.keys(updates).length > 0) {
      this.setData(updates)
    }

    this.clearError('room')
    this.loadDishPriceRequired()
  },

  selectStandard(e) {
    wx.vibrateShort({ type: 'light' })
    var value = Number(e.currentTarget.dataset.value)
    if (this.data.standard === value && this.data.standardPicked) {
      if (this.data.isPartner) {
        this.setData({ standard: 0, standardPicked: false })
        this.clearError('standard')
        return
      }
      if (!this.data.allowNoStandard) {
        wx.showToast({ title: '设置要求必须选择餐标', icon: 'none' })
        return
      }
      this.setData({ standard: 0, standardPicked: false })
    } else {
      this.setData({ standard: value, standardPicked: true })
    }
    this.clearError('standard')
  },

  togglePartner() {
    wx.vibrateShort({ type: 'light' })
    var newVal = !this.data.isPartner
    var updates = { isPartner: newVal, selectedBossIndex: -1 }
    if (newVal) {
      updates.standard = this.data.partnerStandard
      updates.standardPicked = true
    } else {
      if (!this.data.allowNoStandard) {
        updates.standard = 0
        updates.standardPicked = false
      } else {
        var defaultStd = this.data.defaultStandard
        updates.standard = defaultStd || 0
        updates.standardPicked = !!updates.standard
      }
    }
    this.setData(updates)
    this.clearError('standard')
  },

  onBossPickerTap() {
    if (this.data.bossList.length > 0) {
      this.setData({ showBossPicker: true })
    }
  },

  onBossSelect(e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var boss = this.data.bossList[index]
    if (boss) {
      this.setData({
        formData: Object.assign({}, this.data.formData, { customerName: boss.name }),
        selectedBossIndex: index,
        showBossPicker: false
      })
      this.clearError('customerName')
    }
  },

  onBossPickerClose() {
    this.setData({ showBossPicker: false })
  },

  // ── Dynamic field input handlers ─────────────────────────────────

  onFieldInput(e) {
    var fieldId = e.currentTarget.dataset.fieldid
    var key = 'formData.' + fieldId
    this.setData({ [key]: e.detail.value })
    if (fieldId !== 'remark') {
      this.clearError(fieldId)
    }
  },

  onSelectOptionToggle(e) {
    var fieldId = e.currentTarget.dataset.fieldid
    var option = e.currentTarget.dataset.option
    var current = this.data.formData[fieldId] || ''
    var selected = current ? current.split(',') : []
    var idx = selected.indexOf(option)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(option)
    }
    var key = 'formData.' + fieldId
    this.setData({ [key]: selected.join(',') })
  },

  onSelectOptionAdd(e) {
    var fieldId = e.currentTarget.dataset.fieldid
    var value = e.detail.value.trim()
    if (!value) return
    var current = this.data.formData[fieldId] || ''
    var selected = current ? current.split(',') : []
    if (!selected.includes(value)) {
      selected.push(value)
    }
    var key = 'formData.' + fieldId
    this.setData({ [key]: selected.join(',') })
  },

  // ── Validation & Submit ──────────────────────────────────────────

  async loadDishPriceRequired() {
    var required = await this.isDishPriceRequired(this.data.date)
    this.setData({ _dishPriceRequired: required })
  },

  async _getSettingsCache() {
    if (!this._settingsCache) {
      var res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      var settings = {}
      ;(res.data || []).forEach(function(s) {
        if (!(s.key in settings)) {
          settings[s.key] = s.key === 'approval_rules' ? s : (s.value !== undefined ? s.value : s)
        }
      })
      this._settingsCache = settings
    }
    return this._settingsCache
  },

  async shouldSync(dateStr) {
    try {
      var settings = await this._getSettingsCache()
      if (!settings.serviceChargeEnabled) return false
      if (!settings.serviceChargeEnabledDate) return false
      if (dateStr < settings.serviceChargeEnabledDate) return false
      return true
    } catch (err) {
      console.warn('[shouldSync] 检查失败:', err)
      return false
    }
  },

  async isAutoPurchaseEnabled() {
    try {
      var settings = await this._getSettingsCache()
      var rules = settings.approval_rules
      if (!rules) return true
      return rules.autoPurchaseEnabled !== false
    } catch (err) {
      console.warn('[isAutoPurchaseEnabled] 检查失败:', err)
      return true
    }
  },

  async isDishPriceRequired(dateStr) {
    try {
      var settings = await this._getSettingsCache()
      if (!settings.serviceChargeEnabled) return false
      if (!settings.serviceChargeEnabledDate) return false
      return dateStr >= settings.serviceChargeEnabledDate
    } catch (err) {
      console.warn('[validate] 检查菜价必填失败:', err)
      return false
    }
  },

  clearError(field) {
    if (this.data.errors[field]) {
      this.setData({ errors: Object.assign({}, this.data.errors, { [field]: '' }) })
    }
  },

  isPastDate(dateStr) {
    var today = new Date()
    var todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0')
    return dateStr < todayStr
  },

  validate() {
    var errors = {}
    var data = this.data
    var formData = data.formData
    var allowNoStandard = data.allowNoStandard

    var dateResult = validateRequired(data.date, '日期')
    if (!dateResult.valid) errors.date = dateResult.message
    if (!errors.date && data.date < formatDate(new Date())) {
      errors.date = '不能选择过去的日期'
    }

    // Validate resolved form fields
    this.data.formFields.forEach(function(f) {
      if (!f.visible) return
      var val = formData[f.id]
      if (f.required) {
        if (f.id === 'customerName') {
          var nameResult = validateRequired(val, '客户姓名')
          if (!nameResult.valid) errors.customerName = nameResult.message
        } else if (f.id === 'guestCount') {
          var guestResult = validateGuestCount(val)
          if (!guestResult.valid) errors.guestCount = guestResult.message
        } else {
          if (val === undefined || val === null || String(val).trim() === '') {
            errors[f.id] = '请填写' + f.label
          }
        }
      }
      // Phone format
      if (f.id === 'phone' && val && String(val).trim()) {
        var phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(String(val).trim())) {
          errors.phone = '请输入正确的手机号'
        }
      }
      // Dish price conditional required
      if (f.id === 'dishPrice' && data._dishPriceRequired) {
        var dp = Number(val) || 0
        if (dp <= 0) {
          errors.dishPrice = '服务费模式下菜价必须填写'
        }
      }
      // Select type required
      if (f.type === 'select' && f.required) {
        if (!val || String(val).trim() === '') {
          errors[f.id] = '请选择' + f.label
        }
      }
    })

    if (data.exclusiveType === 'none' && !data.room) {
      errors.room = '请选择包厢'
    }

    if (!allowNoStandard && !data.standardPicked) {
      errors.standard = '请选择餐标'
    }

    this.setData({ errors: errors })
    return Object.keys(errors).length === 0
  },

  async onSubmit() {
    if (this.data.submitting) return

    if (this.isPastDate(this.data.date)) {
      wx.showModal({
        title: '无法操作',
        content: this.data.isEdit ? '预约已经过期无法修改' : '不能创建过去日期的预约',
        showCancel: false
      })
      this.setData({ submitting: false })
      return
    }

    if (!this.data.allowNoStandard && !this.data.standardPicked) {
      wx.showModal({
        title: '餐标未选择',
        content: '当前的房间设置要求必须选择餐标，请在「餐标」区域点击选择一项',
        showCancel: false
      })
      return
    }

    var dishPriceRequired = await this.isDishPriceRequired(this.data.date)
    this.setData({ _dishPriceRequired: dishPriceRequired })

    if (!this.validate()) {
      var errKeys = Object.keys(this.data.errors)
      wx.showToast({ title: errKeys.length > 0 ? this.data.errors[errKeys[0]] : '请检查表单', icon: 'none' })
      return
    }

    if (this.data.isEdit && !hasPermission('reservation', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限修改预约', icon: 'none' })
      return
    }
    if (!this.data.isEdit && !hasPermission('reservation', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限创建预约', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中' })

    try {
      await this.checkReservationConflict()

      var app = getApp()
      var userInfo = app.globalData.userInfo || {}
      var formData = this.data.formData
      var roomConfig = this.data.currentRoomConfig || {}

      // Build docData — builtin fields top-level, custom in customFields
      var docData = {}
      var customFields = {}

      this.data.formFields.forEach(function(f) {
        var raw = formData[f.id]
        if (f.builtin) {
          if (f.id === 'guestCount') {
            docData.guestCount = Number(raw) || 0
          } else if (f.id === 'dishPrice') {
            docData.dishPrice = Number(raw) || 0
          } else {
            docData[f.id] = typeof raw === 'string' ? raw.trim() : raw
          }
        } else {
          // Custom field
          customFields[f.id] = f.type === 'number' ? (Number(raw) || 0) :
                               (typeof raw === 'string' ? raw.trim() : raw)
        }
      })

      var et = this.data.exclusiveType
      var roomName = getExclusiveTypeName(et, this.data.room)

      docData.date = new Date(this.data.date + 'T00:00:00')
      docData.time = this.data.time
      docData.exclusiveType = et
      docData.isPartner = this.data.isPartner
      docData.room = this.data.room  // Always store actual room id
      docData.roomName = roomName
      docData.standard = Number(this.data.standard) || 0
      docData.customFields = customFields
      docData.hasIncome = false

      // If chess room and no standards, ensure standard field is 0
      if (roomConfig.standards && roomConfig.standards.length === 0 && et === 'none') {
        docData.standard = 0
      }

      if (this.data.isEdit) {
        var oldData = await db.getDoc(COLLECTIONS.RESERVATION, this.data.id)
        await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)

        var dateStr = formatDate(docData.date)
        if (await this.shouldSync(dateStr)) {
          var oldDishPrice = oldData ? (Number(oldData.dishPrice) || 0) : 0
          var newDishPrice = Number(docData.dishPrice) || 0
          var oldCustomerName = oldData ? (oldData.customerName || '') : ''
          var oldRoomName = oldData ? (oldData.roomName || '') : ''
          var hasDishPriceChanged = newDishPrice !== oldDishPrice
          var hasRemarkChanged = docData.customerName !== oldCustomerName || docData.roomName !== oldRoomName

          if (hasDishPriceChanged || hasRemarkChanged) {
            if (this.isPastDate(dateStr)) {
              await this.showSyncConfirmDialog()
            }
            var isTodayOrPast = dateStr <= formatDate(new Date())
            if (isTodayOrPast) {
              var autoPurchaseEnabled = await this.isAutoPurchaseEnabled()
              if (autoPurchaseEnabled) {
                await this.syncBanquetPurchase(docData, this.data.id, false)
              }
              if (hasDishPriceChanged || hasRemarkChanged) {
                await this.syncIncome(docData, this.data.id, false)
              }
            }
          }
        }

        if (oldData) {
          var changes = {}
          var trackedFields = { standard: '餐标', roomName: '包厢', time: '时段', customerName: '客户', phone: '电话', guestCount: '人数', date: '日期', exclusiveType: '包场类型', remark: '备注', isPartner: '股东', dishPrice: '菜价' }
          Object.keys(trackedFields).forEach(function(f) {
            var oval = oldData[f]
            var nval = docData[f]
            if (String(oval) !== String(nval)) {
              changes[trackedFields[f]] = { from: oval, to: nval }
            }
          })
          log(LOG_TYPES.RESERVATION_UPDATE, docData.customerName + ' 修改预约', { id: this.data.id, changes: changes })
        } else {
          log(LOG_TYPES.RESERVATION_UPDATE, '更新预约: ' + docData.customerName, { id: this.data.id })
        }
        wx.showToast({ title: '更新成功', icon: 'success' })
      } else {
        docData.status = 'confirmed'
        docData.createdBy = userInfo._id || ''
        docData.createdByName = userInfo.name || userInfo.nickName || ''
        var result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
        var dateStr2 = formatDate(docData.date)
        var isToday = dateStr2 === formatDate(new Date())
        if (isToday && await this.shouldSync(dateStr2)) {
          var autoPurchaseEnabled2 = await this.isAutoPurchaseEnabled()
          if (autoPurchaseEnabled2) {
            await this.syncBanquetPurchase(docData, result._id, true)
          }
          await this.syncIncome(docData, result._id, true)
        }
        log(LOG_TYPES.RESERVATION_CREATE, '创建预约: ' + docData.customerName, { id: result._id })
        wx.showToast({ title: '创建成功', icon: 'success' })
      }

      setTimeout(function() { wx.navigateBack() }, 1500)
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      if (err.message && (err.message.indexOf('已被包场') !== -1 || err.message.indexOf('已有预约') !== -1)) {
        wx.showModal({ title: '已被预约！', content: '时间有冲突了哦！', showCancel: false })
      } else {
        handleCloudError(err, '保存预约')
      }
    }
  },

  async checkReservationConflict() {
    try {
      var dbInstance = db.getDb()
      var _ = dbInstance.command

      var parts = this.data.date.split('-')
      var dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
      var dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

      var et = this.data.exclusiveType
      var room = this.data.room

      var conditions = [
        { date: _.gte(dayStart).and(_.lte(dayEnd)) },
        { status: 'confirmed' }
      ]

      if (this.data.isEdit) {
        conditions.push({ _id: _.neq(this.data.id) })
      }

      // Per spec §3.2: conflicts are per-room
      if (et === 'none') {
        // Regular: same time + same room, OR full-day exclusive on same room
        conditions.push(_.or([
          { time: this.data.time, room: room },
          { exclusiveType: 'full', room: room }
        ]))
      } else if (et === 'noon') {
        conditions.push(_.or([
          { time: '中午', room: room },
          { exclusiveType: 'full', room: room }
        ]))
      } else if (et === 'night') {
        conditions.push(_.or([
          { time: '晚上', room: room },
          { exclusiveType: 'full', room: room }
        ]))
      }
      // 'full': check ALL reservations for this room

      var where = _.and(conditions)
      var res = await db.queryAll(COLLECTIONS.RESERVATION, where)
      if (res.data && res.data.length > 0) {
        if (et === 'full') {
          throw new Error('该时段已被包场（全天），请更换时间')
        } else if (et === 'noon') {
          throw new Error('该时段已被包场（中午），请更换时间')
        } else if (et === 'night') {
          throw new Error('该时段已被包场（晚上），请更换时间')
        }
        throw new Error('该时段【' + getRoomName(room) + '】已有预约，请更换时间或包厢')
      }
    } catch (err) {
      if (err.message && (err.message.indexOf('已被包场') !== -1 || err.message.indexOf('已有预约') !== -1)) {
        throw err
      }
    }
  },

  async syncBanquetPurchase(docData, reservationId, isCreate) {
    try {
      var standards = this.data.currentRoomConfig ? this.data.currentRoomConfig.standards : []
      var noStandard = standards.length === 0 && docData.exclusiveType === 'none'
      if (noStandard) return

      var dishPrice = Number(docData.dishPrice) || 0
      var existing = await db.queryAll(COLLECTIONS.PURCHASE, { sourceReservationId: reservationId })
      var hasExisting = existing.data && existing.data.length > 0
      var first = hasExisting ? existing.data[0] : null

      if (dishPrice > 0) {
        var app = getApp()
        var userInfo = app.globalData.userInfo || {}
        var remark = (docData.customerName || '') + ' - ' + (docData.roomName || '')
        var now = new Date()

        var settings = await this._getSettingsCache()
        var rules = settings.approval_rules || {}
        var needBanquetApproval = !!(rules && rules.enabled !== false && (rules.categories || {}).banquet === true)
        var amountThreshold = rules && rules.amountThreshold ? Number(rules.amountThreshold) : Infinity
        var needApproval = needBanquetApproval || (dishPrice > amountThreshold)

        var purchaseData = {
          amount: dishPrice, category: 'banquet',
          date: formatDate(docData.date), remark: remark, item: '',
          purchaseBy: userInfo._id || '', purchaseByName: userInfo.name || userInfo.nickName || '',
          sourceReservationId: reservationId, autoGenerated: true,
          status: needApproval ? 'pending' : 'approved',
          approverName: needApproval ? (rules.defaultApproverName || '') : '宴会创建自动批复',
          ...(needApproval
            ? { approverId: rules.defaultApproverId || '' }
            : { approvedAt: now })
        }
        if (!purchaseData.purchaseBy) delete purchaseData.purchaseBy

        if (hasExisting) {
          if (!isCreate) await db.updateDoc(COLLECTIONS.PURCHASE, first._id, purchaseData)
        } else {
          var addResult = await db.addDoc(COLLECTIONS.PURCHASE, purchaseData)
          if (!needApproval) {
            await db.addDoc(COLLECTIONS.APPROVAL_LOG, {
              purchaseId: addResult._id, action: 'approved',
              operatorId: '', operatorName: '宴会创建自动批复',
              remark: '宴会预约创建时自动批复', createdAt: now
            }).catch(function(e) { console.warn('[banquet-sync] 自动审批日志写入失败:', e) })
          }
        }
      } else {
        if (first && first.autoGenerated) {
          await db.deleteDoc(COLLECTIONS.PURCHASE, first._id)
        }
      }
    } catch (err) {
      console.warn('[banquet-sync] 同步宴会菜价失败:', err)
    }
  },

  async syncIncome(docData, reservationId, isCreate) {
    try {
      var standards = this.data.currentRoomConfig ? this.data.currentRoomConfig.standards : []
      var noStandard = standards.length === 0 && docData.exclusiveType === 'none'
      var dishPrice = Number(docData.dishPrice) || 0
      if (noStandard) return
      if (dishPrice <= 0) return

      var time = docData.time || '中午'
      var settings = await this._getSettingsCache()
      var chargeNoon = Number(settings.serviceChargeNoon) || 0
      var chargeNight = Number(settings.serviceChargeNight) || 0
      var charge = time === '中午' ? chargeNoon : chargeNight
      var amount = dishPrice + charge

      var existing = await db.queryAll(COLLECTIONS.INCOME, { reservationId: reservationId })
      var hasExisting = existing.data && existing.data.length > 0
      var first = hasExisting ? existing.data[0] : null

      var app = getApp()
      var userInfo = app.globalData.userInfo || {}

      var incomeData = {
        type: 'dining', amount: amount,
        date: formatDate(docData.date),
        source: docData.customerName || '',
        reservationId: reservationId,
        remark: '',
        collectedBy: userInfo._id || '',
        collectedByName: userInfo.name || '',
        calcMode: 'dishPrice',
        dishPrice: dishPrice,
        serviceCharge: charge,
        guestCount: docData.guestCount || 0,
        standard: docData.standard || 0,
        roomName: docData.roomName || '',
        autoGenerated: true
      }

      if (hasExisting) {
        if (!isCreate) await db.updateDoc(COLLECTIONS.INCOME, first._id, incomeData)
      } else {
        await db.addDoc(COLLECTIONS.INCOME, incomeData)
        await db.updateDoc(COLLECTIONS.RESERVATION, reservationId, { hasIncome: true })
      }
    } catch (err) {
      console.warn('[banquet-sync] 同步收入失败:', err)
    }
  },

  async deleteBanquetPurchase(reservationId) {
    try {
      var purchases = await db.queryAll(COLLECTIONS.PURCHASE, { sourceReservationId: reservationId, autoGenerated: true })
      for (var i = 0; i < (purchases.data || []).length; i++) {
        await db.deleteDoc(COLLECTIONS.PURCHASE, purchases.data[i]._id)
      }
      var incomes = await db.queryAll(COLLECTIONS.INCOME, { reservationId: reservationId, autoGenerated: true })
      for (var j = 0; j < (incomes.data || []).length; j++) {
        await db.deleteDoc(COLLECTIONS.INCOME, incomes.data[j]._id)
      }
    } catch (err) {
      console.warn('[banquet-sync] 删除关联记录失败:', err)
    }
  },

  showSyncConfirmDialog() {
    return new Promise(function(resolve, reject) {
      wx.showModal({
        title: '同步确认',
        content: '该预约已有采购和收入记录，修改将同步更新，是否继续？',
        success: function(res) {
          if (res.confirm) resolve()
          else reject(new Error('用户取消同步'))
        }
      })
    })
  },

  onDelete() {
    if (!hasPermission('reservation', ACTIONS.DELETE)) {
      wx.showToast({ title: '无权限删除预约', icon: 'none' })
      return
    }
    this.setData({ showDeleteModal: true })
  },

  onCloseDeleteModal() {
    this.setData({ showDeleteModal: false })
  },

  async onConfirmDelete() {
    this.setData({ showDeleteModal: false })
    try {
      wx.showLoading({ title: '删除中' })
      await this.deleteBanquetPurchase(this.data.id)
      await db.deleteDoc(COLLECTIONS.RESERVATION, this.data.id)
      log(LOG_TYPES.RESERVATION_DELETE, '删除预约: ' + this.data.customerName, { id: this.data.id })
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(function() { wx.navigateBack() }, 1500)
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '删除预约')
    }
  }
})
