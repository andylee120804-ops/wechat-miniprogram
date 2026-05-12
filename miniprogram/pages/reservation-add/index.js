const { formatDate, getRoomName, getExclusiveTypeName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { validateRequired, validateGuestCount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    isEdit: false,
    id: '',
    date: '',
    time: '中午',
    exclusiveType: 'none',
    room: 'big',
    standard: 0,
    isPartner: false,
    standardPicked: false,
    customerName: '',
    phone: '',
    guestCount: '',
    remark: '',
    dishPrice: '',
    submitting: false,
    timeOptions: ['中午', '晚上'],
    roomOptions: [
      { value: 'big', label: '大包厢' },
      { value: 'small', label: '小包厢' }
    ],
    standardOptions: [500, 600, 800],
    partnerStandard: 300,
    defaultStandard: 500,
    allowNoStandard: false,
    bossList: [],
    showBossPicker: false,
    selectedBossIndex: -1,
    errors: {},
    showDeleteModal: false
  },

  async onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    const today = formatDate(new Date())
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, date: today, todayDate: today })

    // 先加载餐标配置和老板名单（确保默认值就绪）
    await this.loadVenueSettings()

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadReservation(options.id)
    } else if (options.date) {
      this.setData({ date: options.date })
    }
  },

  async loadVenueSettings() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      console.log('[reservation-add] getSettings result:', JSON.stringify(res.result))
      if (res.result && res.result.success && res.result.data) {
        const d = res.result.data
        const standards = d.mealStandards || [500, 600, 800]
        const defaultStd = d.defaultStandard !== undefined && d.defaultStandard !== '' ? d.defaultStandard : 0
        const partnerStd = d.partnerStandard || 300

        // 明确默认值类型
        const isPartnerDefault = defaultStd === 'partner'
        // 有数值默认值（如 600）且在选项里才预填，否则为 0
        const numDefault = Number(defaultStd) || 0
        const validDefault = numDefault > 0 && standards.includes(numDefault) ? numDefault : 0

        // 明确告诉 UI 是否自动选中
        const shouldAutoSelect = defaultStd !== '' && defaultStd !== undefined && defaultStd !== 0

        this.setData({
          standardOptions: standards,
          partnerStandard: partnerStd,
          defaultStandard: defaultStd,
          allowNoStandard: d.allowNoStandard || false,
          standard: shouldAutoSelect ? (isPartnerDefault ? partnerStd : validDefault) : 0,
          standardPicked: shouldAutoSelect,
          isPartner: isPartnerDefault,
          selectedBossIndex: -1
        })
      }
    } catch (err) {
      console.warn('加载设置失败:', err)
      // 使用默认值
      this.setData({
        standardOptions: [500, 600, 800],
        partnerStandard: 300,
        defaultStandard: 500,
        allowNoStandard: false,
        standard: 0,
        standardPicked: false
      })
    }
    // 无论设置加载成功与否，都尝试加载老板列表
    this.loadBossList()
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

  onBack() {
    wx.navigateBack()
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
      if (isPartner && this.data.bossList.length === 0) {
        await this.loadBossList()
      }
      if (isPartner && this.data.bossList.length > 0) {
        selectedBossIndex = this.data.bossList.findIndex(function(b) { return b.name === res.customerName })
      }
      // 编辑模式：直接用原预约的餐标值，不自动填充默认值
      const hasStandard = res.standard !== undefined && res.standard !== null && res.standard !== 0
      this.setData({
        date: formatDate(res.date),
        time: res.time || '中午',
        exclusiveType: res.exclusiveType || (res.isExclusive ? 'full' : 'none'),
        room: res.room || 'big',
        standard: hasStandard ? res.standard : 0,
        isPartner: isPartner,
        standardPicked: hasStandard || isPartner,
        customerName: res.customerName || '',
        phone: res.phone || '',
        guestCount: res.guestCount ? String(res.guestCount) : '',
        remark: res.remark || '',
        dishPrice: res.dishPrice ? String(res.dishPrice) : '',
        selectedBossIndex: selectedBossIndex
      })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '加载预约')
    }
  },

  onDateChange(e) {
    const selected = e.detail.value
    const today = formatDate(new Date())
    if (selected < today) {
      wx.showToast({ title: '不能选择过去的日期', icon: 'none' })
      return
    }
    this.setData({ date: selected })
    this.clearError('date')
  },

  selectTime(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ time: e.currentTarget.dataset.value })
    this.clearError('time')
  },

  selectExclusive(e) {
    wx.vibrateShort({ type: 'light' })
    const value = e.currentTarget.dataset.value
    this.setData({ exclusiveType: value })
    this.clearError('room')
  },

  selectRoom(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ room: e.currentTarget.dataset.value })
    this.clearError('room')
  },

  selectStandard(e) {
    wx.vibrateShort({ type: 'light' })
    const value = Number(e.currentTarget.dataset.value)
    if (this.data.standard === value && this.data.standardPicked) {
      // 股东已选中时，餐标由股东满足，取消数字选项允许
      if (this.data.isPartner) {
        this.setData({ standard: 0, standardPicked: false })
        this.clearError('standard')
        return
      }
      // Only allow deselection if allowNoStandard is enabled
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

  togglePartner(e) {
    wx.vibrateShort({ type: 'light' })
    const newVal = !this.data.isPartner
    const updates = { isPartner: newVal, selectedBossIndex: -1 }
    if (newVal) {
      // 选股东：自动使用股东餐标
      updates.standard = this.data.partnerStandard
      updates.standardPicked = true
    } else {
      // 取消股东：如果要求必选餐标，重置为0让用户手动选
      if (!this.data.allowNoStandard) {
        updates.standard = 0
        updates.standardPicked = false
      } else {
        var defaultStd = this.data.defaultStandard
        if (defaultStd === 'partner') defaultStd = this.data.partnerStandard
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
        customerName: boss.name,
        selectedBossIndex: index,
        showBossPicker: false
      })
      this.clearError('customerName')
    }
  },

  onBossPickerClose() {
    this.setData({ showBossPicker: false })
  },

  onCustomerNameInput(e) {
    this.setData({ customerName: e.detail.value })
    this.clearError('customerName')
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
    this.clearError('phone')
  },

  onGuestCountInput(e) {
    this.setData({ guestCount: e.detail.value })
    this.clearError('guestCount')
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onDishPriceInput(e) {
    this.setData({ dishPrice: e.detail.value })
  },

  async syncBanquetPurchase(docData, reservationId, isCreate) {
    try {
      const dishPrice = Number(docData.dishPrice) || 0
      const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
        sourceReservationId: reservationId
      })
      const hasExisting = existing.data && existing.data.length > 0
      const first = hasExisting ? existing.data[0] : null

      if (dishPrice > 0) {
        const app = getApp()
        const userInfo = app.globalData.userInfo || {}
        const remark = (docData.customerName || '') + ' - ' + (docData.roomName || '')
        const purchaseData = {
          amount: dishPrice, category: 'banquet',
          date: formatDate(docData.date), remark, item: '',
          purchaseBy: userInfo._id || '', purchaseByName: userInfo.name || userInfo.nickName || '',
          sourceReservationId: reservationId, autoGenerated: true
        }
        if (!purchaseData.purchaseBy) delete purchaseData.purchaseBy

        if (hasExisting) {
          if (!isCreate) await db.updateDoc(COLLECTIONS.PURCHASE, first._id, purchaseData)
          // isCreate + hasExisting → skip (avoid duplicate)
        } else {
          await db.addDoc(COLLECTIONS.PURCHASE, purchaseData)
        }
      } else {
        // dishPrice is 0 — delete autoGenerated record only
        if (first && first.autoGenerated) {
          await db.deleteDoc(COLLECTIONS.PURCHASE, first._id)
        }
      }
    } catch (err) {
      console.warn('[banquet-sync] 同步宴会菜价失败:', err)
    }
  },

  async deleteBanquetPurchase(reservationId) {
    try {
      const existing = await db.queryAll(COLLECTIONS.PURCHASE, {
        sourceReservationId: reservationId
      })
      if (existing.data && existing.data.length > 0) {
        await db.deleteDoc(COLLECTIONS.PURCHASE, existing.data[0]._id)
      }
    } catch (err) {
      console.warn('[banquet-sync] 删除宴会菜价失败:', err)
    }
  },

  showSyncConfirmDialog() {
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '同步确认',
        content: '该预约已有采购和收入记录，修改将同步更新，是否继续？',
        success: (res) => {
          if (res.confirm) resolve()
          else reject(new Error('用户取消同步'))
        }
      })
    })
  },

  isPastDate(dateStr) {
    const today = new Date()
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0')
    return dateStr < todayStr
  },

  async shouldSync(dateStr) {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = {}
      ;(res.data || []).forEach(s => { settings[s.key] = s.value })
      if (!settings.serviceChargeEnabled) return false
      if (!settings.serviceChargeEnabledDate) return false
      if (dateStr < settings.serviceChargeEnabledDate) return false
      return true
    } catch (err) {
      console.warn('[shouldSync] 检查失败:', err)
      return false
    }
  },

  clearError(field) {
    if (this.data.errors[field]) {
      this.setData({ errors: { ...this.data.errors, [field]: '' } })
    }
  },

  async isDishPriceRequired(dateStr) {
    try {
      const res = await db.queryAll(COLLECTIONS.SETTINGS, {})
      const settings = {}
      ;(res.data || []).forEach(s => { settings[s.key] = s.value })
      if (!settings.serviceChargeEnabled) return false
      if (!settings.serviceChargeEnabledDate) return false
      return dateStr >= settings.serviceChargeEnabledDate
    } catch (err) {
      console.warn('[validate] 检查菜价必填失败:', err)
      return false
    }
  },

  validate() {
    const errors = {}
    const data = this.data

    const dateResult = validateRequired(data.date, '日期')
    if (!dateResult.valid) errors.date = dateResult.message

    if (!errors.date && data.date < formatDate(new Date())) {
      errors.date = '不能选择过去的日期'
    }

    const nameResult = validateRequired(data.customerName, '客户姓名')
    if (!nameResult.valid) errors.customerName = nameResult.message

    // Phone is optional; only validate format if provided
    if (data.phone && data.phone.trim()) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(String(data.phone).trim())) {
        errors.phone = '请输入正确的手机号'
      }
    }

    const guestResult = validateGuestCount(data.guestCount)
    if (!guestResult.valid) errors.guestCount = guestResult.message

    if (data.exclusiveType === 'none' && !data.room) {
      errors.room = '请选择包厢'
    }

    if (!data.allowNoStandard && !data.standardPicked) {
      errors.standard = '请选择餐标'
    }

    // Service fee mode: dishPrice is required
    if (this._dishPriceRequired) {
      const dp = Number(data.dishPrice) || 0
      if (dp <= 0) {
        errors.dishPrice = '服务费模式下菜价必须填写'
      }
    }

    this.setData({ errors })
    return Object.keys(errors).length === 0
  },

  async onSubmit() {
    if (this.data.submitting) return

    // Direct check: if allowNoStandard is off and no standard selected, block with modal
    if (!this.data.allowNoStandard && !this.data.standardPicked) {
      wx.showModal({
        title: '餐标未选择',
        content: '当前设置要求预约时必须选择餐标，请在「餐标」区域点击选择一项',
        showCancel: false
      })
      return
    }

    this._dishPriceRequired = await this.isDishPriceRequired(this.data.date)

    if (!this.validate()) {
      wx.showToast({ title: '请检查表单', icon: 'none' })
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
      // Check for conflicts
      await this.checkReservationConflict()

      const app = getApp()
      const userInfo = app.globalData.userInfo || {}

      const et = this.data.exclusiveType
      const roomName = getExclusiveTypeName(et, this.data.room)

      const docData = {
        date: new Date(this.data.date + 'T00:00:00'),
        time: this.data.time,
        exclusiveType: this.data.exclusiveType,
        isPartner: this.data.isPartner,
        room: et === 'none' ? this.data.room : 'big',
        roomName: roomName,
        standard: Number(this.data.standard),
        customerName: this.data.customerName.trim(),
        phone: this.data.phone.trim(),
        guestCount: Number(this.data.guestCount),
        remark: this.data.remark.trim(),
        dishPrice: Number(this.data.dishPrice) || 0,
        hasIncome: false
      }

      if (this.data.isEdit) {
        // Load old data for change tracking
        const oldData = await db.getDoc(COLLECTIONS.RESERVATION, this.data.id)
        await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)

        // Sync banquet purchase and income if conditions met
        const laterDate = formatDate(docData.date)
        if (await this.shouldSync(laterDate)) {
          const oldDishPrice = oldData ? (Number(oldData.dishPrice) || 0) : 0
          const newDishPrice = Number(docData.dishPrice) || 0
          const oldCustomerName = oldData ? (oldData.customerName || '') : ''
          const oldRoomName = oldData ? (oldData.roomName || '') : ''
          const hasDishPriceChanged = newDishPrice !== oldDishPrice
          const hasRemarkChanged = docData.customerName !== oldCustomerName || docData.roomName !== oldRoomName

          if (hasDishPriceChanged || hasRemarkChanged) {
            const dateStr = formatDate(docData.date)
            if (this.isPastDate(dateStr)) {
              await this.showSyncConfirmDialog()
            }
            await this.syncBanquetPurchase(docData, this.data.id, false)
            if (hasDishPriceChanged) {
              await this.syncIncome(docData, this.data.id, false)
            }
          }
        }
        // Log changes with before/after details
        if (oldData) {
          const changes = {}
          const trackedFields = { standard: '餐标', roomName: '包厢', time: '时段', customerName: '客户', phone: '电话', guestCount: '人数', date: '日期', exclusiveType: '包场类型', remark: '备注', isPartner: '股东', dishPrice: '菜价' }
          Object.keys(trackedFields).forEach(function(f) {
            const oldVal = oldData[f]
            const newVal = docData[f]
            if (String(oldVal) !== String(newVal)) {
              changes[trackedFields[f]] = { from: oldVal, to: newVal }
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
        const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)
        if (await this.shouldSync(formatDate(docData.date))) {
          await this.syncBanquetPurchase(docData, result._id, true)
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
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const parts = this.data.date.split('-')
      const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
      const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

      const et = this.data.exclusiveType

      // Build conditions
      const conditions = [
        { date: _.gte(dayStart).and(_.lte(dayEnd)) },
        { status: 'confirmed' }
      ]

      // When editing, exclude self
      if (this.data.isEdit) {
        conditions.push({ _id: _.neq(this.data.id) })
      }

      if (et === 'none') {
        // Regular room: same time + same room, OR any full-day exclusive
        conditions.push(_.or([
          { time: this.data.time, room: this.data.room },
          { exclusiveType: 'full' }
        ]))
      } else if (et === 'noon') {
        // Noon exclusive: same time slot, OR any full-day exclusive
        conditions.push(_.or([
          { time: '中午' },
          { exclusiveType: 'full' }
        ]))
      } else if (et === 'night') {
        // Night exclusive: same time slot, OR any full-day exclusive
        conditions.push(_.or([
          { time: '晚上' },
          { exclusiveType: 'full' }
        ]))
      }
      // 'full': check ALL reservations on this date (no extra filter needed)

      const where = _.and(conditions)

      const res = await db.queryAll(COLLECTIONS.RESERVATION, where)
      if (res.data && res.data.length > 0) {
        if (et === 'full') {
          throw new Error('该时段已被包场（全天），请更换时间')
        } else if (et === 'noon') {
          throw new Error('该时段已被包场（中午），请更换时间')
        } else if (et === 'night') {
          throw new Error('该时段已被包场（晚上），请更换时间')
        }
        throw new Error('该时段【' + getRoomName(this.data.room) + '】已有预约，请更换时间或包厢')
      }
    } catch (err) {
      if (err.message && (err.message.indexOf('已被包场') !== -1 || err.message.indexOf('已有预约') !== -1)) {
        throw err
      }
    }
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