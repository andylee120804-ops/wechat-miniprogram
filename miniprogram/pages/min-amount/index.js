const app = getApp()
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
var _h = require('../../utils/helpers')
var getChinaToday = _h.getChinaToday

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    activeTab: 0,

    // ── Tab 2: Existing billing settings ──
    min_room: '',
    min_noon: '',
    min_night: '',
    min_full: '',
    serviceChargeEnabled: false,
    serviceChargeNoon: '',
    serviceChargeNight: '',
    serviceChargeEnabledDate: '',

    // ── Tab 0: Room management ──
    rooms: [],
    enabledRooms: [],
    showRoomEditor: false,
    editingRoom: null,
    editorRoom: {
      id: '', name: '', enabled: true, order: 0,
      exclusiveTypes: [], timeSlots: [], standards: [],
      partnerStandard: 0, defaultStandard: 0
    },

    // ── Tab 1: Form config ──
    formFields: [],
    showHiddenPicker: false,
    _pickerFieldId: null,
    pickerHiddenRooms: {},   // { roomId: true } — populated when picker opens
    _newFieldName: '',
    _newFieldType: 'text',
    _newFieldTypeIndex: 0,
    _newOptionValues: {},    // { fieldIdx: value } — controlled inputs for option add

    // ── Tab 3: Customer presets ──
    customerPresets: [],
    _newCustomerName: '',
    _customerPresetsDocId: null,
    _customerPresetsVersion: 0,

    // ── Editor controlled inputs ──
    _newTimeSlotValue: '',
    _newStandardValue: '',

    // ── Internal ──
    _roomsDocId: null,
    _roomsVersion: 0,
    _formConfigDocId: null,
    _formConfigVersion: 0,
    _mealStandards: [],
    _defaultStandard: 0,
    _partnerStandard: 0
  },

  onLoad() {
    const theme = app.getThemePageData()
    this.setData({
      theme,
      statusBarHeight: app.globalData.statusBarHeight || 44
    })
    if (!this.checkPermission()) return
    this.loadSettings()
    this.loadRooms()
    this.loadFormConfigFields()
    this.loadCustomerPresets()
    this.ensureConfigInitialized()
  },

  checkPermission() {
    var userInfo = app.globalData.userInfo || {}
    if (userInfo.role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return false
    }
    return true
  },

  // ── Tab switching ──────────────────────────────────────────────

  switchTab(e) {
    this.setData({ activeTab: Number(e.currentTarget.dataset.tab) })
  },

  // ── Tab 2: Billing settings (original) ─────────────────────────

  async loadSettings() {
    try {
      var res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      var settings = res.data || []
      var data = {}
      var seenKey = new Set()
      settings.forEach(function(s) {
        if (seenKey.has(s.key)) return
        seenKey.add(s.key)
        if (s.key === 'min_amount_room') data.min_room = String(s.value || '')
        if (s.key === 'min_amount_noon') data.min_noon = String(s.value || '')
        if (s.key === 'min_amount_night') data.min_night = String(s.value || '')
        if (s.key === 'min_amount_full') data.min_full = String(s.value || '')
        if (s.key === 'serviceChargeEnabled') data.serviceChargeEnabled = !!s.value
        if (s.key === 'serviceChargeNoon') data.serviceChargeNoon = String(s.value || '')
        if (s.key === 'serviceChargeNight') data.serviceChargeNight = String(s.value || '')
        if (s.key === 'serviceChargeEnabledDate') data.serviceChargeEnabledDate = String(s.value || '')
        // Save old meal standards for lazy-init merge
        if (s.key === 'mealStandards') data._mealStandards = s.value || []
        if (s.key === 'defaultStandard') data._defaultStandard = s.value || 0
        if (s.key === 'partnerStandard') data._partnerStandard = s.value || 0
      })
      this.setData(data)
    } catch (err) {
      if (err.errCode === -502005) {
        console.warn('settings 集合尚未创建，使用默认值')
        return
      }
      console.error('加载设置失败', err)
    }
  },

  onBack() { wx.navigateBack() },

  onRoomInput(e) { this.setData({ min_room: e.detail.value }) },
  onNoonInput(e) { this.setData({ min_noon: e.detail.value }) },
  onNightInput(e) { this.setData({ min_night: e.detail.value }) },
  onFullInput(e) { this.setData({ min_full: e.detail.value }) },

  onServiceChargeSwitch(e) {
    var enabled = e.detail.value
    var updates = { serviceChargeEnabled: enabled }
    if (enabled) {
      updates.serviceChargeEnabledDate = this.formatToday()
    } else {
      updates.serviceChargeEnabledDate = ''
    }
    this.setData(updates)
  },

  onServiceChargeNoonInput(e) { this.setData({ serviceChargeNoon: e.detail.value }) },
  onServiceChargeNightInput(e) { this.setData({ serviceChargeNight: e.detail.value }) },

  formatToday() {
    return getChinaToday()
  },

  async onSave() {
    wx.showLoading({ title: '保存中' })
    try {
      var items = [
        { key: 'min_amount_room', value: parseFloat(this.data.min_room) || 0 },
        { key: 'min_amount_noon', value: parseFloat(this.data.min_noon) || 0 },
        { key: 'min_amount_night', value: parseFloat(this.data.min_night) || 0 },
        { key: 'min_amount_full', value: parseFloat(this.data.min_full) || 0 },
        { key: 'serviceChargeEnabled', value: this.data.serviceChargeEnabled },
        { key: 'serviceChargeEnabledDate', value: this.data.serviceChargeEnabledDate },
        { key: 'serviceChargeNoon', value: parseFloat(this.data.serviceChargeNoon) || 0 },
        { key: 'serviceChargeNight', value: parseFloat(this.data.serviceChargeNight) || 0 }
      ]

      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var existing = await db.queryAll(COLLECTIONS.SETTINGS, { key: item.key })
        if (existing.data && existing.data.length > 0) {
          await db.updateDoc(COLLECTIONS.SETTINGS, existing.data[0]._id, { value: item.value })
          for (var j = 1; j < existing.data.length; j++) {
            await db.deleteDoc(COLLECTIONS.SETTINGS, existing.data[j]._id)
          }
        } else {
          await db.addDoc(COLLECTIONS.SETTINGS, { key: item.key, value: item.value })
        }
      }

      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      if (err.errCode === -502005) {
        wx.showToast({
          title: '数据表未创建，请在云开发控制台创建 settings 集合',
          icon: 'none',
          duration: 3000
        })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  },

  // ── Tab 0: Room management ────────────────────────────────────

  async loadRooms() {
    try {
      var config = require('../../utils/reservationConfig')
      var rooms = await config.loadRooms()
      var res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
      var doc = (res.data && res.data[0]) || null
      this.setData({
        rooms: rooms,
        enabledRooms: rooms.filter(function(r) { return r.enabled }),
        _roomsDocId: doc ? doc._id : null,
        _roomsVersion: doc ? (doc._version || 0) : 0
      })
    } catch (err) {
      console.warn('加载房间配置失败:', err)
    }
  },

  onAddRoom() {
    var firstRoom = this.data.rooms[0] || {}
    this.setData({
      showRoomEditor: true,
      editingRoom: null,
      _newTimeSlotValue: '',
      _newStandardValue: '',
      editorRoom: {
        id: 'room_' + Date.now(),
        name: '',
        enabled: true,
        order: this.data.rooms.length,
        exclusiveTypes: firstRoom.exclusiveTypes || [],
        timeSlots: firstRoom.timeSlots || ['中午', '晚上'],
        standards: firstRoom.standards || [],
        partnerStandard: firstRoom.partnerStandard || 0,
        defaultStandard: firstRoom.defaultStandard || 0
      }
    })
  },

  onEditRoom(e) {
    var roomId = e.currentTarget.dataset.id
    var room = this.data.rooms.find(function(r) { return r.id === roomId })
    if (!room) return
    this.setData({
      showRoomEditor: true,
      editingRoom: room,
      _newTimeSlotValue: '',
      _newStandardValue: '',
      editorRoom: JSON.parse(JSON.stringify(room))
    })
  },

  onCloseRoomEditor() {
    this.setData({ showRoomEditor: false })
  },

  onRoomNameInput(e) { this.setData({ 'editorRoom.name': e.detail.value }) },
  onRoomEnabledSwitch(e) { this.setData({ 'editorRoom.enabled': e.detail.value }) },
  onRoomOrderInput(e) { this.setData({ 'editorRoom.order': Number(e.detail.value) || 0 }) },

  toggleExclusiveType(e) {
    var value = e.currentTarget.dataset.value
    var types = this.data.editorRoom.exclusiveTypes.slice()
    var idx = types.indexOf(value)
    if (idx >= 0) types.splice(idx, 1)
    else types.push(value)
    this.setData({ 'editorRoom.exclusiveTypes': types })
  },

  toggleTimeSlot(e) {
    var value = e.currentTarget.dataset.value
    var slots = this.data.editorRoom.timeSlots.slice()
    var idx = slots.indexOf(value)
    if (idx >= 0) slots.splice(idx, 1)
    else slots.push(value)
    this.setData({ 'editorRoom.timeSlots': slots })
  },

  onNewTimeSlotInput(e) { this.setData({ _newTimeSlotValue: e.detail.value }) },

  onAddTimeSlotTap(e) {
    // Triggered by + button (no detail.value) or by bindconfirm (has detail.value)
    var value = (e && e.detail && e.detail.value !== undefined)
      ? e.detail.value
      : this.data._newTimeSlotValue
    value = String(value || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入时段名称', icon: 'none' })
      return
    }
    var slots = this.data.editorRoom.timeSlots.slice()
    if (slots.includes(value)) {
      wx.showToast({ title: '时段已存在', icon: 'none' })
      return
    }
    slots.push(value)
    this.setData({ 'editorRoom.timeSlots': slots, _newTimeSlotValue: '' })
  },

  removeStandard(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var standards = this.data.editorRoom.standards.slice()
    standards.splice(idx, 1)
    this.setData({ 'editorRoom.standards': standards })
  },

  onNewStandardInput(e) { this.setData({ _newStandardValue: e.detail.value }) },

  onAddStandardTap(e) {
    var raw = (e && e.detail && e.detail.value !== undefined)
      ? e.detail.value
      : this.data._newStandardValue
    var value = Number(raw)
    if (!value || value <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }
    var standards = this.data.editorRoom.standards.slice()
    if (standards.includes(value)) {
      wx.showToast({ title: '该餐标已存在', icon: 'none' })
      return
    }
    standards.push(value)
    standards.sort(function(a, b) { return a - b })
    this.setData({ 'editorRoom.standards': standards, _newStandardValue: '' })
  },

  onPartnerStandardInput(e) { this.setData({ 'editorRoom.partnerStandard': Number(e.detail.value) || 0 }) },
  onDefaultStandardInput(e) { this.setData({ 'editorRoom.defaultStandard': Number(e.detail.value) || 0 }) },

  async onSaveRoom() {
    var room = this.data.editorRoom
    if (!room.name.trim()) {
      wx.showToast({ title: '请输入房间名称', icon: 'none' })
      return
    }

    // Normalize exclusiveTypes to canonical order so pill labels render
    // consistently across rooms regardless of toggle history.
    var EXCLUSIVE_ORDER = ['none', 'noon', 'night', 'full']
    room.exclusiveTypes = EXCLUSIVE_ORDER.filter(function(t) {
      return room.exclusiveTypes && room.exclusiveTypes.indexOf(t) >= 0
    })

    // Validate: defaultStandard should be in standards (if both are set)
    var ds = Number(room.defaultStandard) || 0
    if (ds > 0 && room.standards && room.standards.length > 0 && room.standards.indexOf(ds) < 0) {
      wx.showModal({
        title: '默认餐标无效',
        content: '默认餐标必须是餐标选项中的一项，是否将默认餐标改为 ¥' + room.standards[0] + '？',
        success: function(res) {
          if (res.confirm) {
            this.setData({ 'editorRoom.defaultStandard': room.standards[0] })
          }
        }.bind(this)
      })
      return
    }

    wx.showLoading({ title: '保存中' })
    try {
      var rooms = this.data.rooms.slice()

      if (this.data.editingRoom) {
        var idx = rooms.findIndex(function(r) { return r.id === room.id })
        if (idx >= 0) rooms[idx] = room
      } else {
        rooms.push(room)
      }

      rooms.sort(function(a, b) { return a.order - b.order })

      // Optimistic lock check
      var docId = this.data._roomsDocId
      if (!docId) {
        // _roomsDocId may be stale (e.g. ensureConfigInitialized created the doc
        // after loadRooms ran). Re-query to avoid duplicate-key errors.
        var preCheck = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
        if (preCheck.data && preCheck.data.length > 0) {
          docId = preCheck.data[0]._id
          this.setData({
            _roomsDocId: docId,
            _roomsVersion: preCheck.data[0]._version || 0
          })
        }
      }
      if (docId) {
        // NOTE: Best-effort optimistic lock (TOCTOU window exists — acceptable
        // for low-concurrency admin-only settings page).
        var check = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
        var latestVersion = (check.data && check.data[0]) ? (check.data[0]._version || 0) : 0
        if (latestVersion !== this.data._roomsVersion) {
          wx.hideLoading()
          wx.showModal({ title: '冲突', content: '配置已被他人修改，请刷新后再保存', showCancel: false })
          return
        }
        await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
          value: rooms,
          _version: latestVersion + 1
        })
      } else {
        await db.addDoc(COLLECTIONS.SETTINGS, {
          key: 'reservation_rooms',
          value: rooms,
          _version: 1
        })
      }

      require('../../utils/reservationConfig').invalidateCache()
      this.setData({ showRoomEditor: false })
      await this.loadRooms()
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error('保存房间配置失败:', err)
    }
  },

  async onRestoreDefaults() {
    wx.showModal({
      title: '确认恢复',
      content: '将恢复到系统默认配置，当前配置将被覆盖，确认？',
      success: async function(res) {
        if (!res.confirm) return
        wx.showLoading({ title: '恢复中' })
        try {
          var config = require('../../utils/reservationConfig')
          var docId = this.data._roomsDocId
          if (docId) {
            await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
              value: config.DEFAULT_ROOMS,
              _version: 1
            })
          } else {
            await db.addDoc(COLLECTIONS.SETTINGS, {
              key: 'reservation_rooms',
              value: config.DEFAULT_ROOMS,
              _version: 1
            })
          }
          // Also restore form config
          var formDocRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
          var formDocId = formDocRes.data && formDocRes.data[0] ? formDocRes.data[0]._id : null
          if (formDocId) {
            await db.updateDoc(COLLECTIONS.SETTINGS, formDocId, {
              value: config.DEFAULT_FORM_CONFIG,
              _version: 1
            })
          } else {
            await db.addDoc(COLLECTIONS.SETTINGS, {
              key: 'reservation_form_config',
              value: config.DEFAULT_FORM_CONFIG,
              _version: 1
            })
          }
          config.invalidateCache()
          await this.loadRooms()
          await this.loadFormConfigFields()
          wx.hideLoading()
          wx.showToast({ title: '已恢复默认', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '恢复失败', icon: 'none' })
        }
      }.bind(this)
    })
  },

  // ── Tab 1: Form config ────────────────────────────────────────

  async loadFormConfigFields() {
    try {
      var config = require('../../utils/reservationConfig')
      var formConfig = await config.loadFormConfig()
      var res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
      var doc = (res.data && res.data[0]) || null
      this.setData({
        formFields: formConfig.fields,
        _formConfigDocId: doc ? doc._id : null,
        _formConfigVersion: doc ? (doc._version || 0) : 0
      })
    } catch (err) {
      console.warn('加载表单配置失败:', err)
    }
  },

  toggleFieldVisible(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var key = 'formFields[' + idx + '].visible'
    this.setData({ [key]: !this.data.formFields[idx].visible })
  },

  toggleFieldRequired(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var key = 'formFields[' + idx + '].required'
    this.setData({ [key]: !this.data.formFields[idx].required })
  },

  removeCustomField(e) {
    var idx = Number(e.currentTarget.dataset.index)
    if (this.data.formFields[idx].builtin) return
    var fields = this.data.formFields.slice()
    fields.splice(idx, 1)
    this.setData({ formFields: fields })
  },

  onNewFieldNameInput(e) { this.setData({ _newFieldName: e.detail.value }) },

  onNewFieldTypeChange(e) {
    var types = ['text', 'number', 'textarea', 'select']
    this.setData({
      _newFieldType: types[Number(e.detail.value)],
      _newFieldTypeIndex: Number(e.detail.value)
    })
  },

  onAddFieldTap() {
    var name = this.data._newFieldName.trim()
    if (!name) return
    var fields = this.data.formFields.slice()
    fields.push({
      id: 'custom_' + Date.now(),
      label: name,
      type: this.data._newFieldType || 'text',
      builtin: false,
      visible: true,
      required: false,
      hiddenInRooms: [],
      options: this.data._newFieldType === 'select' ? [] : undefined
    })
    this.setData({ formFields: fields, _newFieldName: '', _newFieldType: 'text', _newFieldTypeIndex: 0 })
  },

  onOpenHiddenPicker(e) {
    var fieldId = e.currentTarget.dataset.id
    var field = this.data.formFields.find(function(f) { return f.id === fieldId })
    var hiddenMap = {}
    if (field && field.hiddenInRooms) {
      field.hiddenInRooms.forEach(function(rid) { hiddenMap[rid] = true })
    }
    this.setData({
      showHiddenPicker: true,
      _pickerFieldId: fieldId,
      pickerHiddenRooms: hiddenMap
    })
  },

  toggleHiddenRoom(e) {
    var roomId = e.currentTarget.dataset.roomid
    var fieldId = this.data._pickerFieldId
    var fields = this.data.formFields.slice()
    var fieldIdx = fields.findIndex(function(f) { return f.id === fieldId })
    if (fieldIdx < 0) return

    // Build new hiddenInRooms array immutably
    var oldHidden = fields[fieldIdx].hiddenInRooms || []
    var newHidden
    var idx = oldHidden.indexOf(roomId)
    if (idx >= 0) {
      newHidden = oldHidden.slice(0, idx).concat(oldHidden.slice(idx + 1))
    } else {
      newHidden = oldHidden.concat([roomId])
    }

    // Replace field with a new object (don't mutate)
    fields[fieldIdx] = Object.assign({}, fields[fieldIdx], { hiddenInRooms: newHidden })

    // Update picker map
    var hiddenMap = Object.assign({}, this.data.pickerHiddenRooms)
    if (idx >= 0) delete hiddenMap[roomId]
    else hiddenMap[roomId] = true

    this.setData({ formFields: fields, pickerHiddenRooms: hiddenMap })
  },

  onCloseHiddenPicker() {
    this.setData({ showHiddenPicker: false })
  },

  removeSelectOption(e) {
    var fieldIdx = Number(e.currentTarget.dataset.fieldidx)
    var optIdx = Number(e.currentTarget.dataset.optidx)
    var fields = this.data.formFields.slice()
    fields[fieldIdx].options.splice(optIdx, 1)
    this.setData({ formFields: fields })
  },

  onNewOptionInput(e) {
    var fieldIdx = Number(e.currentTarget.dataset.fieldidx)
    var newOpts = Object.assign({}, this.data._newOptionValues)
    newOpts[fieldIdx] = e.detail.value
    this.setData({ _newOptionValues: newOpts })
  },

  onAddSelectOptionTap(e) {
    var fieldIdx = Number(e.currentTarget.dataset.fieldidx)
    var raw = (e && e.detail && e.detail.value !== undefined)
      ? e.detail.value
      : (this.data._newOptionValues[fieldIdx] || '')
    var value = String(raw || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入选项内容', icon: 'none' })
      return
    }
    var fields = this.data.formFields.slice()
    if (!fields[fieldIdx].options) fields[fieldIdx].options = []
    if (fields[fieldIdx].options.includes(value)) {
      wx.showToast({ title: '选项已存在', icon: 'none' })
      return
    }
    fields[fieldIdx].options.push(value)
    var newOpts = Object.assign({}, this.data._newOptionValues)
    delete newOpts[fieldIdx]
    this.setData({ formFields: fields, _newOptionValues: newOpts })
  },

  async onSaveFormConfig() {
    wx.showLoading({ title: '保存中' })
    try {
      var fields = this.data.formFields
      var docId = this.data._formConfigDocId
      if (!docId) {
        var preCheck = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
        if (preCheck.data && preCheck.data.length > 0) {
          docId = preCheck.data[0]._id
          this.setData({
            _formConfigDocId: docId,
            _formConfigVersion: preCheck.data[0]._version || 0
          })
        }
      }
      if (docId) {
        // NOTE: Best-effort optimistic lock (TOCTOU window exists — acceptable
        // for low-concurrency admin-only settings page).
        var check = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
        var latestVersion = (check.data && check.data[0]) ? (check.data[0]._version || 0) : 0
        if (latestVersion !== this.data._formConfigVersion) {
          wx.hideLoading()
          wx.showModal({ title: '冲突', content: '配置已被他人修改，请刷新后再保存', showCancel: false })
          return
        }
        await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
          value: { fields: fields },
          _version: latestVersion + 1
        })
      } else {
        await db.addDoc(COLLECTIONS.SETTINGS, {
          key: 'reservation_form_config',
          value: { fields: fields },
          _version: 1
        })
      }
      require('../../utils/reservationConfig').invalidateCache()
      await this.loadFormConfigFields()
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // ── Tab 3: Customer presets ───────────────────────────────────

  async loadCustomerPresets() {
    try {
      var res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_customer_presets' })
      var doc = (res.data && res.data[0]) || null
      var value = (doc && Array.isArray(doc.value)) ? doc.value : []
      this.setData({
        customerPresets: value,
        _customerPresetsDocId: doc ? doc._id : null,
        _customerPresetsVersion: doc ? (doc._version || 0) : 0
      })
    } catch (err) {
      if (err.errCode === -502005) {
        // settings collection not yet created — fine, empty state
        return
      }
      console.warn('加载客户预设失败:', err)
    }
  },

  onNewCustomerInput(e) { this.setData({ _newCustomerName: e.detail.value }) },

  onAddCustomerPresetTap(e) {
    var raw = (e && e.detail && e.detail.value !== undefined)
      ? e.detail.value
      : this.data._newCustomerName
    var value = String(raw || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入客户姓名', icon: 'none' })
      return
    }
    var presets = this.data.customerPresets.slice()
    if (presets.includes(value)) {
      wx.showToast({ title: '该客户已存在', icon: 'none' })
      return
    }
    presets.push(value)
    this.setData({ customerPresets: presets, _newCustomerName: '' })
  },

  onRemoveCustomerPreset(e) {
    var idx = Number(e.currentTarget.dataset.index)
    var presets = this.data.customerPresets.slice()
    presets.splice(idx, 1)
    this.setData({ customerPresets: presets })
  },

  async onSaveCustomerPresets() {
    wx.showLoading({ title: '保存中' })
    try {
      var presets = this.data.customerPresets
      var docId = this.data._customerPresetsDocId
      if (!docId) {
        var preCheck = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_customer_presets' })
        if (preCheck.data && preCheck.data.length > 0) {
          docId = preCheck.data[0]._id
          this.setData({
            _customerPresetsDocId: docId,
            _customerPresetsVersion: preCheck.data[0]._version || 0
          })
        }
      }
      if (docId) {
        // NOTE: Best-effort optimistic lock (TOCTOU window exists — acceptable
        // for low-concurrency admin-only settings page).
        var check = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_customer_presets' })
        var latestVersion = (check.data && check.data[0]) ? (check.data[0]._version || 0) : 0
        if (latestVersion !== this.data._customerPresetsVersion) {
          wx.hideLoading()
          wx.showModal({ title: '冲突', content: '配置已被他人修改，请刷新后再保存', showCancel: false })
          return
        }
        await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
          value: presets,
          _version: latestVersion + 1
        })
        this.setData({ _customerPresetsVersion: latestVersion + 1 })
      } else {
        var addRes = await db.addDoc(COLLECTIONS.SETTINGS, {
          key: 'reservation_customer_presets',
          value: presets,
          _version: 1
        })
        this.setData({
          _customerPresetsDocId: (addRes && addRes._id) || null,
          _customerPresetsVersion: 1
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('保存客户预设失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // ── Lazy initialization (admin-only) ──────────────────────────

  async ensureConfigInitialized() {
    try {
      var config = require('../../utils/reservationConfig')
      var roomsRes = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
      if (!roomsRes.data || roomsRes.data.length === 0) {
        // Merge old venue settings into default rooms
        var mealStandards = this.data._mealStandards || [500, 600, 800]
        var defaultStandard = this.data._defaultStandard || 0
        var partnerStandard = this.data._partnerStandard || 300

        var defaultRooms = JSON.parse(JSON.stringify(config.DEFAULT_ROOMS))
        if (defaultRooms[0]) {
          defaultRooms[0].standards = Array.isArray(mealStandards) ? mealStandards : [500, 600, 800]
          defaultRooms[0].partnerStandard = partnerStandard
          defaultRooms[0].defaultStandard = typeof defaultStandard === 'number' && defaultStandard > 0 ? defaultStandard : 500
        }

        await db.addDoc(COLLECTIONS.SETTINGS, {
          key: 'reservation_rooms',
          value: defaultRooms,
          _version: 1
        })

        var defaultFormConfig = JSON.parse(JSON.stringify(config.DEFAULT_FORM_CONFIG))
        await db.addDoc(COLLECTIONS.SETTINGS, {
          key: 'reservation_form_config',
          value: defaultFormConfig,
          _version: 1
        })

        config.invalidateCache()
        // Refresh local state so subsequent saves go through update, not add.
        await this.loadRooms()
        await this.loadFormConfigFields()
        wx.showToast({ title: '已创建默认配置', icon: 'none', duration: 2000 })
      }
    } catch (err) {
      console.warn('初始化配置失败:', err)
    }
  }
})
