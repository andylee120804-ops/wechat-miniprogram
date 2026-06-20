var _h = require('../../utils/helpers')
var formatDate = _h.formatDate
var getExclusiveTypeName = _h.getExclusiveTypeName
var getChinaToday = _h.getChinaToday
var createChinaDate = _h.createChinaDate
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const reservationConfig = require('../../utils/reservationConfig')
const { createSettingsCache } = require('./helpers/settings-cache')
const { syncBanquetPurchase, deleteBanquetPurchase } = require('./helpers/sync')
const { checkReservationConflict } = require('./helpers/conflict-check')
const { validateReservationForm } = require('./helpers/validation')

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
    roomOptions: [],
    rooms: [],
    currentRoomConfig: null,
    timeOptions: [],
    exclusiveOptions: [],
    standardOptions: [],
    partnerStandard: 0,
    defaultStandard: 0,
    allowNoStandard: false,
    formConfigFields: [],
    formFields: [],
    formData: {},
    customerPresets: [],
    _dishPriceRequired: false
  },

  // ── Lifecycle ────────────────────────────────────────────────────

  async onLoad(options) {
    this._settingsCache = createSettingsCache()

    const app = getApp()
    const theme = app.getThemePageData()
    const today = getChinaToday()
    this.setData({
      theme: theme,
      statusBarHeight: app.globalData.statusBarHeight || 44,
      date: today,
      todayDate: today
    })

    await this.loadReservationConfig()
    // Eagerly warm settings cache to avoid first-interaction latency
    this._settingsCache.get().catch(function() { /* swallow */ })

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

  onBack() { wx.navigateBack() },

  // ── Config loading ───────────────────────────────────────────────

  async loadReservationConfig() {
    try {
      const rooms = await reservationConfig.loadRooms()
      const formConfig = await reservationConfig.loadFormConfig()
      const enabledRooms = rooms.filter(function(r) { return r.enabled })
        .sort(function(a, b) { return a.order - b.order })
      const firstRoom = enabledRooms[0] || rooms[0]

      const formData = {}
      formConfig.fields.forEach(function(f) {
        formData[f.id] = ''
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
      this.loadBossList()
      this.loadCustomerPresets()
    } catch (err) {
      console.warn('加载预约配置失败:', err)
      this.loadBossList()
      this.loadCustomerPresets()
    }
  },

  async loadCustomerPresets() {
    try {
      const settingsRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_customer_presets' })
      const doc = (settingsRes.data && settingsRes.data[0]) || null
      const configuredPresets = (doc && Array.isArray(doc.value)) ? doc.value : []
      this.setData({ customerPresets: configuredPresets })

      const app = getApp()
      const userInfo = app.globalData.userInfo || {}
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'getCustomerNameSuggestions',
          callerWechatId: userInfo.wechatId || ''
        }
      })
      if (res.result && res.result.success && Array.isArray(res.result.data)) {
        this.setData({ customerPresets: configuredPresets.concat(res.result.data) })
      }
    } catch (err) {
      if (err.errCode !== -502005) {
        console.warn('加载客户预设失败:', err)
      }
    }
  },

  onPickPresetCustomer(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    wx.vibrateShort({ type: 'light' })
    this.setData({
      formData: Object.assign({}, this.data.formData, { customerName: name })
    })
    this.clearError('customerName')
  },

  refreshCustomerNameTop() {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        action: 'refreshCustomerNameTop',
        callerWechatId: userInfo.wechatId || ''
      }
    }).catch(function(err) {
      console.warn('刷新客户标签缓存失败:', err)
    })
  },

  applyRoomConfig(roomConfig) {
    const resolved = reservationConfig.resolveFields(
      this.data.formConfigFields, roomConfig.id
    )

    // Normalize exclusiveTypes to canonical order so pill labels render
    // consistently regardless of the toggle history saved in DB.
    const EXCLUSIVE_ORDER = ['none', 'noon', 'night', 'full']
    const normalizedExclusive = EXCLUSIVE_ORDER.filter(function(t) {
      return roomConfig.exclusiveTypes && roomConfig.exclusiveTypes.indexOf(t) >= 0
    })

    const updates = {
      timeOptions: roomConfig.timeSlots,
      exclusiveOptions: normalizedExclusive,
      standardOptions: roomConfig.standards,
      partnerStandard: roomConfig.partnerStandard,
      defaultStandard: roomConfig.defaultStandard,
      allowNoStandard: roomConfig.standards.length === 0,
      formFields: resolved
    }

    if (!roomConfig.timeSlots.includes(this.data.time)) {
      updates.time = roomConfig.timeSlots[0] || ''
    }
    if (!roomConfig.exclusiveTypes.includes(this.data.exclusiveType)) {
      updates.exclusiveType = roomConfig.exclusiveTypes.includes('none') ? 'none' :
        roomConfig.exclusiveTypes[0] || 'none'
    }

    // Auto-select defaultStandard when valid; otherwise clear stale selection.
    if (!this.data.isPartner) {
      const ds = Number(roomConfig.defaultStandard) || 0
      if (ds > 0 && roomConfig.standards.indexOf(ds) >= 0) {
        const currentInOptions = roomConfig.standards.indexOf(this.data.standard) >= 0
        if (!this.data.standardPicked || !currentInOptions) {
          updates.standard = ds
          updates.standardPicked = true
        }
      } else if (roomConfig.standards.length === 0) {
        updates.standard = 0
        updates.standardPicked = false
      } else if (!roomConfig.standards.includes(this.data.standard)) {
        updates.standard = 0
        updates.standardPicked = false
      }
    }

    this.setData(updates)
  },

  async loadBossList() {
    try {
      const res = await db.queryAll(COLLECTIONS.STAFF, { role: 'boss', status: 'active' })
      if (res.data && res.data.length > 0) {
        this.setData({ bossList: res.data })
      }
    } catch (err) {
      console.warn('加载老板名单失败:', err)
    }
  },

  async loadReservation(id) {
    try {
      wx.showLoading({ title: '加载中' })
      const res = await db.getDoc(COLLECTIONS.RESERVATION, id)
      if (!res) {
        wx.showToast({ title: '预约不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }

      const isPartner = res.isPartner || false
      let selectedBossIndex = -1
      if (isPartner && this.data.bossList.length > 0) {
        selectedBossIndex = this.data.bossList.findIndex(function(b) { return b.name === res.customerName })
      }

      const formData = {}
      this.data.formConfigFields.forEach(function(f) {
        if (f.builtin) {
          formData[f.id] = res[f.id] !== undefined ? String(res[f.id]) : ''
        }
      })
      const customFields = res.customFields || {}
      this.data.formConfigFields.forEach(function(f) {
        if (!f.builtin && customFields[f.id] !== undefined) {
          formData[f.id] = String(customFields[f.id])
        }
      })

      const room = res.room || 'big'
      let roomConfig = this.data.roomOptions.find(function(r) { return r.id === room })
      if (!roomConfig) {
        roomConfig = this.data.rooms.find(function(r) { return r.id === room }) || this.data.currentRoomConfig
      }

      const hasStandard = res.standard !== undefined && res.standard !== null && res.standard !== 0

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

  // ── Field handlers ───────────────────────────────────────────────

  onDateChange(e) {
    const selected = e.detail.value
    const today = getChinaToday()
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
    const roomId = e.currentTarget.dataset.value
    const roomConfig = this.data.roomOptions.find(function(r) { return r.id === roomId })
    if (!roomConfig) return

    // Capture previous room id BEFORE any setData to avoid race when
    // user rapidly switches rooms.
    const previousRoomId = this.data.room
    this.setData({ room: roomId, currentRoomConfig: roomConfig })
    this.applyRoomConfig(roomConfig)
    this._clearFieldsHiddenByRoomTransition(previousRoomId, roomId)

    this.clearError('room')
    this.loadDishPriceRequired()
  },

  _clearFieldsHiddenByRoomTransition(oldRoomId, newRoomId) {
    const oldFields = reservationConfig.resolveFields(this.data.formConfigFields, oldRoomId)
    const newFields = reservationConfig.resolveFields(this.data.formConfigFields, newRoomId)
    const updates = {}
    oldFields.forEach(function(f) {
      if (!newFields.find(function(nf) { return nf.id === f.id })) {
        updates['formData.' + f.id] = ''
      }
    })
    if (Object.keys(updates).length > 0) {
      this.setData(updates)
    }
  },

  selectStandard(e) {
    wx.vibrateShort({ type: 'light' })
    const value = Number(e.currentTarget.dataset.value)
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
    const newVal = !this.data.isPartner
    const updates = { isPartner: newVal, selectedBossIndex: -1 }
    if (newVal) {
      updates.standard = this.data.partnerStandard
      updates.standardPicked = true
    } else {
      if (!this.data.allowNoStandard) {
        updates.standard = 0
        updates.standardPicked = false
      } else {
        const defaultStd = this.data.defaultStandard
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
    const index = parseInt(e.currentTarget.dataset.index, 10)
    const boss = this.data.bossList[index]
    if (boss) {
      this.setData({
        formData: { ...this.data.formData, customerName: boss.name },
        selectedBossIndex: index,
        showBossPicker: false
      })
      this.clearError('customerName')
    }
  },

  onBossPickerClose() {
    this.setData({ showBossPicker: false })
  },

  onFieldInput(e) {
    const fieldId = e.currentTarget.dataset.fieldid
    const key = 'formData.' + fieldId
    this.setData({ [key]: e.detail.value })
    if (fieldId !== 'remark') {
      this.clearError(fieldId)
    }
  },

  onSelectOptionToggle(e) {
    const fieldId = e.currentTarget.dataset.fieldid
    const option = e.currentTarget.dataset.option
    const current = this.data.formData[fieldId] || ''
    const selected = current ? current.split(',') : []
    const idx = selected.indexOf(option)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(option)
    }
    this.setData({ ['formData.' + fieldId]: selected.join(',') })
  },

  onSelectOptionAdd(e) {
    const fieldId = e.currentTarget.dataset.fieldid
    const value = e.detail.value.trim()
    if (!value) return
    const current = this.data.formData[fieldId] || ''
    const selected = current ? current.split(',') : []
    if (!selected.includes(value)) {
      selected.push(value)
    }
    this.setData({ ['formData.' + fieldId]: selected.join(',') })
  },

  // ── Settings cache wrappers ─────────────────────────────────────

  async loadDishPriceRequired() {
    const required = await this.isDishPriceRequired(this.data.date)
    this.setData({ _dishPriceRequired: required })
  },

  async shouldSync(dateStr) {
    try {
      const settings = await this._settingsCache.get()
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
      const settings = await this._settingsCache.get()
      const rules = settings.approval_rules
      if (!rules) return true
      return rules.autoPurchaseEnabled !== false
    } catch (err) {
      console.warn('[isAutoPurchaseEnabled] 检查失败:', err)
      return true
    }
  },

  async isDishPriceRequired(dateStr) {
    try {
      const settings = await this._settingsCache.get()
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
      this.setData({ errors: { ...this.data.errors, [field]: '' } })
    }
  },

  isPastDate(dateStr) {
    return dateStr < getChinaToday()
  },

  // ── Validation & submit ─────────────────────────────────────────

  validate() {
    const errors = validateReservationForm({
      date: this.data.date,
      exclusiveType: this.data.exclusiveType,
      room: this.data.room,
      formData: this.data.formData,
      formFields: this.data.formFields,
      allowNoStandard: this.data.allowNoStandard,
      standardPicked: this.data.standardPicked,
      dishPriceRequired: this.data._dishPriceRequired
    })
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

    const dishPriceRequired = await this.isDishPriceRequired(this.data.date)
    this.setData({ _dishPriceRequired: dishPriceRequired })

    if (!this.validate()) {
      const errKeys = Object.keys(this.data.errors)
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
      await checkReservationConflict({
        dateStr: this.data.date,
        time: this.data.time,
        room: this.data.room,
        exclusiveType: this.data.exclusiveType,
        isEdit: this.data.isEdit,
        id: this.data.id
      })

      const docData = this._buildDocData()

      if (this.data.isEdit) {
        await this._updateReservation(docData)
        wx.showToast({ title: '更新成功', icon: 'success' })
      } else {
        await this._createReservation(docData)
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

  _buildDocData() {
    const formData = this.data.formData
    const roomConfig = this.data.currentRoomConfig || {}
    const docData = {}
    const customFields = {}

    this.data.formFields.forEach(function(f) {
      const raw = formData[f.id]
      if (f.builtin) {
        if (f.id === 'guestCount') {
          docData.guestCount = Number(raw) || 0
        } else if (f.id === 'dishPrice') {
          docData.dishPrice = Number(raw) || 0
        } else {
          docData[f.id] = typeof raw === 'string' ? raw.trim() : raw
        }
      } else {
        customFields[f.id] = f.type === 'number' ? (Number(raw) || 0) :
                             (typeof raw === 'string' ? raw.trim() : raw)
      }
    })

    const et = this.data.exclusiveType
    docData.date = createChinaDate(this.data.date)
    docData.time = this.data.time
    docData.exclusiveType = et
    docData.isPartner = this.data.isPartner
    docData.room = this.data.room
    docData.roomName = getExclusiveTypeName(et, this.data.room)
    docData.standard = Number(this.data.standard) || 0
    docData.customFields = customFields
    docData.hasIncome = false

    if (roomConfig.standards && roomConfig.standards.length === 0 && et === 'none') {
      docData.standard = 0
    }

    return docData
  },

  async _createReservation(docData) {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const appUser = app.globalData.userInfo || {}
    docData.status = 'confirmed'
    docData.createdBy = userInfo._id || ''
    docData.createdByName = userInfo.name || userInfo.nickName || ''

    const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
    // 创建成功后，调用云函数写入变动日志（仅写日志，不影响预约记录的 _openid）
    try {
      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'logReservationCreated',
          reservationId: result._id,
          docData: docData,
          callerWechatId: appUser.wechatId || ''
        }
      })
    } catch (e) {
      console.warn('写入预约变动日志失败:', e)
    }
    this.refreshCustomerNameTop()
    const dateStr = formatDate(docData.date)
    const isToday = dateStr === getChinaToday()

    if (isToday && await this.shouldSync(dateStr)) {
      const settings = await this._settingsCache.get()
      const autoPurchaseEnabled = await this.isAutoPurchaseEnabled()
      if (autoPurchaseEnabled) {
        // syncBanquetPurchase now also generates income from the purchase + service charge
        await syncBanquetPurchase({
          docData: docData, reservationId: result._id, isCreate: true,
          roomConfig: this.data.currentRoomConfig, settings: settings, userInfo: userInfo
        })
      }
    }
    log(LOG_TYPES.RESERVATION_CREATE, '创建预约: ' + docData.customerName, { id: result._id })
  },

  async _updateReservation(docData) {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const appUser = getApp().globalData.userInfo || {}
    const updateRes = await wx.cloud.callFunction({
      name: 'sendMessage',
      data: {
        action: 'updateReservationAmountWithChange',
        reservationId: this.data.id,
        docData: docData,
        callerWechatId: appUser.wechatId || ''
      }
    })
    if (!updateRes.result || !updateRes.result.success) {
      throw new Error((updateRes.result && updateRes.result.message) || '更新预约失败')
    }
    this.refreshCustomerNameTop()
    const oldData = updateRes.result.before

    const dateStr = formatDate(docData.date)
    if (await this.shouldSync(dateStr)) {
      const oldDishPrice = oldData ? (Number(oldData.dishPrice) || 0) : 0
      const newDishPrice = Number(docData.dishPrice) || 0
      const oldCustomerName = oldData ? (oldData.customerName || '') : ''
      const oldRoomName = oldData ? (oldData.roomName || '') : ''
      const hasDishPriceChanged = newDishPrice !== oldDishPrice
      const hasRemarkChanged = docData.customerName !== oldCustomerName || docData.roomName !== oldRoomName

      if (hasDishPriceChanged || hasRemarkChanged) {
        if (this.isPastDate(dateStr)) {
          await this.showSyncConfirmDialog()
        }
        const isTodayOrPast = dateStr <= getChinaToday()
        if (isTodayOrPast) {
          const settings = await this._settingsCache.get()
          const autoPurchaseEnabled = await this.isAutoPurchaseEnabled()
          if (autoPurchaseEnabled) {
            // syncBanquetPurchase now also generates income from the purchase + service charge
            await syncBanquetPurchase({
              docData: docData, reservationId: this.data.id, isCreate: false,
              roomConfig: this.data.currentRoomConfig, settings: settings, userInfo: userInfo
            })
          }
        }
      }
    }

    if (oldData) {
      const changes = {}
      const trackedFields = {
        standard: '餐标', roomName: '包厢', time: '时段', customerName: '客户',
        phone: '电话', guestCount: '人数', date: '日期', exclusiveType: '包场类型',
        remark: '备注', isPartner: '股东', dishPrice: '菜价'
      }
      Object.keys(trackedFields).forEach(function(f) {
        if (String(oldData[f]) !== String(docData[f])) {
          changes[trackedFields[f]] = { from: oldData[f], to: docData[f] }
        }
      })
      log(LOG_TYPES.RESERVATION_UPDATE, docData.customerName + ' 修改预约', { id: this.data.id, changes: changes })
    } else {
      log(LOG_TYPES.RESERVATION_UPDATE, '更新预约: ' + docData.customerName, { id: this.data.id })
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

  // ── Delete ──────────────────────────────────────────────────────

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
      const app = getApp()
      const userInfo = app.globalData.userInfo || {}
      const deleteRes = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'deleteReservationWithChange',
          reservationId: this.data.id,
          callerWechatId: userInfo.wechatId || ''
        }
      })
      if (!deleteRes.result || !deleteRes.result.success) {
        throw new Error((deleteRes.result && deleteRes.result.message) || '删除预约失败')
      }
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
