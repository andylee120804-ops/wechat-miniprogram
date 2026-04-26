const { formatDate, getRoomName, getReservationStatusText } = require('../../utils/helpers')
const { hasPermission } = require('../../utils/permission')
const { validateRequired, validatePositiveNumber, validateGuestCount } = require('../../utils/validators')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    isEdit: false,
    id: '',
    date: '',
    time: '中午',
    isExclusive: false,
    room: 'big',
    standard: 300,
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
    standardOptions: [300, 500, 600, 800],
    errors: {},
    showDeleteModal: false
  },

  onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    const today = formatDate(new Date())
    this.setData({ theme, date: today })

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadReservation(options.id)
    } else if (options.date) {
      this.setData({ date: options.date })
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
      this.setData({
        date: formatDate(res.date),
        time: res.time || '中午',
        isExclusive: !!res.isExclusive,
        room: res.room || 'big',
        standard: res.standard || 300,
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

  toggleExclusive() {
    wx.vibrateShort({ type: 'light' })
    const newVal = !this.data.isExclusive
    this.setData({
      isExclusive: newVal,
      room: newVal ? '' : this.data.room
    })
  },

  selectRoom(e) {
    if (this.data.isExclusive) return
    wx.vibrateShort({ type: 'light' })
    this.setData({ room: e.currentTarget.dataset.value })
    this.clearError('room')
  },

  selectStandard(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ standard: e.currentTarget.dataset.value })
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

    if (!data.isExclusive && !data.room) {
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

    if (this.data.isEdit && !hasPermission('reservation', 'update')) {
      wx.showToast({ title: '无权限修改预约', icon: 'none' })
      return
    }
    if (!this.data.isEdit && !hasPermission('reservation', 'create')) {
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

      const docData = {
        date: new Date(this.data.date + 'T00:00:00'),
        time: this.data.time,
        isExclusive: this.data.isExclusive,
        room: this.data.isExclusive ? 'big' : this.data.room,
        roomName: this.data.isExclusive ? '包场' : getRoomName(this.data.room),
        standard: Number(this.data.standard),
        customerName: this.data.customerName.trim(),
        phone: this.data.phone.trim(),
        guestCount: Number(this.data.guestCount),
        remark: this.data.remark.trim(),
        hasIncome: false
      }

      if (this.data.isEdit) {
        await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, docData)
        log(LOG_TYPES.RESERVATION_UPDATE, '更新预约: ' + docData.customerName, { id: this.data.id })
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
      handleCloudError(err, '保存预约')
    }
  },

  async checkReservationConflict() {
    try {
      const dbInstance = db.getDb()
      const _ = dbInstance.command

      const parts = this.data.date.split('-')
      const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
      const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

      const where = {
        date: _.gte(dayStart).and(_.lte(dayEnd)),
        time: this.data.time,
        status: _.neq('cancelled')
      }

      if (this.data.isEdit) {
        where._id = _.neq(this.data.id)
      }

      if (this.data.isExclusive) {
        // Exclusive blocks all rooms
      } else {
        where.room = this.data.room
      }

      const res = await db.queryAll(COLLECTIONS.RESERVATION, where)
      if (res.data && res.data.length > 0) {
        throw new Error('该时段已存在预约，请更换时间或包厢')
      }
    } catch (err) {
      if (err.message && err.message.indexOf('已存在预约') !== -1) {
        throw err
      }
      // Non-conflict errors: let them pass silently
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