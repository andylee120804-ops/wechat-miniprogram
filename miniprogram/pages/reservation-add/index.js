const { formatDate, getRoomName } = require('../../utils/helpers')
const { hasPermission } = require('../../utils/permission')
const { validateRequired, validateGuestCount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 0,
    isEdit: false,
    id: '',
    date: '',
    time: '中午',
    exclusiveType: 'none',
    room: 'big',
    standard: 500,
    isPartner: false,
    standardPicked: false,
    customerName: '',
    phone: '',
    guestCount: '',
    remark: '',
    submitting: false,
    timeOptions: ['中午', '晚上'],
    roomOptions: [
      { value: 'big', label: '大包厢' },
      { value: 'small', label: '小包厢' }
    ],
    standardOptions: [500, 600, 800],
    errors: {},
    showDeleteModal: false
  },

  onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    const today = formatDate(new Date())
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, date: today })

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadReservation(options.id)
    } else if (options.date) {
      this.setData({ date: options.date })
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
      this.setData({
        date: formatDate(res.date),
        time: res.time || '中午',
        exclusiveType: res.exclusiveType || (res.isExclusive ? 'full' : 'none'),
        room: res.room || 'big',
        standard: res.standard || 500,
        isPartner: res.isPartner || false,
        standardPicked: true,
        customerName: res.customerName || '',
        phone: res.phone || '',
        guestCount: res.guestCount ? String(res.guestCount) : '',
        remark: res.remark || ''
      })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '加载预约')
    }
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
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
      // Toggle off — allow deselection for flexibility with partner/shareholder option
      this.setData({ standard: 0, standardPicked: false })
    } else {
      this.setData({ standard: value, standardPicked: true })
    }
    this.clearError('standard')
  },

  togglePartner(e) {
    wx.vibrateShort({ type: 'light' })
    const newVal = !this.data.isPartner
    const updates = { isPartner: newVal }
    if (newVal && !this.data.standardPicked) {
      updates.standard = 300
    } else if (!newVal && this.data.standard === 300) {
      updates.standard = 500
    }
    this.setData(updates)
    this.clearError('standard')
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

  clearError(field) {
    const errors = this.data.errors
    if (errors[field]) {
      errors[field] = ''
      this.setData({ errors })
    }
  },

  validate() {
    const errors = {}
    const data = this.data

    const dateResult = validateRequired(data.date, '日期')
    if (!dateResult.valid) errors.date = dateResult.message

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

    this.setData({ errors })
    return Object.keys(errors).length === 0
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.validate()) {
      wx.showToast({ title: '请检查表单', icon: 'none' })
      return
    }

    if (this.data.isEdit && !hasPermission('reservation', 'edit')) {
      wx.showToast({ title: '无权限修改预约', icon: 'none' })
      return
    }
    if (!this.data.isEdit && !hasPermission('reservation', 'add')) {
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
      let roomName = ''
      if (et === 'none') {
        roomName = getRoomName(this.data.room)
      } else if (et === 'noon') {
        roomName = '包场（中午）'
      } else if (et === 'night') {
        roomName = '包场（晚上）'
      } else if (et === 'full') {
        roomName = '包场全天'
      }

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
        hasIncome: false
      }

      if (this.data.isEdit) {
        // Load old data for change tracking
        const oldData = await db.getDoc(COLLECTIONS.RESERVATION, this.data.id)
        await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
        // Log changes with before/after details
        if (oldData) {
          var changes = {}
          var trackedFields = { standard: '餐标', roomName: '包厢', time: '时段', customerName: '客户', phone: '电话', guestCount: '人数', date: '日期', exclusiveType: '包场类型', remark: '备注', isPartner: '股东' }
          Object.keys(trackedFields).forEach(function(f) {
            var oldVal = oldData[f]
            var newVal = docData[f]
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
      var conditions = [
        { date: _.gte(dayStart).and(_.lte(dayEnd)) },
        { status: _.neq('cancelled') }
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

      var where = _.and(conditions)

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
    if (!hasPermission('reservation', 'delete')) {
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