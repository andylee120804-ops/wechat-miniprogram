const { formatDate, formatDateTime, getRoomName, getReservationStatusText, getExclusiveTypeName } = require('../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const { log, LOG_TYPES } = require('../../utils/logger')
const { handleCloudError } = require('../../utils/error-handler')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    id: '',
    reservation: null,
    loading: true,
    showCancelModal: false,
    showShareModal: false,
    shareTitle: '',
    shareAddress: '',
    shareLatitude: '',
    shareLongitude: '',
    shareRemark: '',
    shareCoverImageUrl: '',
    selectedTemplate: 'business'  // 默认商务风格
  },

  onLoad(options) {
    const app = getApp()
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, id: options.id })
  },

  onShow() {
    if (this.data.id && !this._isLoading) {
      this.loadData()
    }
  },

  async loadData() {
    this._isLoading = true
    try {
      this.setData({ loading: true })
      const [res, settingsRes] = await Promise.all([
        db.getDoc(COLLECTIONS.RESERVATION, this.data.id),
        this.loadVenueSettings()
      ])
      if (!res) {
        wx.showToast({ title: '预约不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const et = res.exclusiveType || (res.isExclusive ? 'full' : 'none')
      const reservation = {
        ...res,
        statusText: getReservationStatusText(res.status),
        dateDisplay: formatDate(res.date),
        roomNameDisplay: getExclusiveTypeName(et, res.room),
        createdAtDisplay: res.createdAt ? formatDateTime(res.createdAt) : (res._createTime ? formatDateTime(res._createTime) : ''),
        exclusiveType: et
      }

      this.setData({
        reservation,
        loading: false
      })
    } catch (err) {
      handleCloudError(err, '加载预约详情')
      this.setData({ loading: false })
    } finally {
      this._isLoading = false
    }
  },

  async loadVenueSettings() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success && res.result.data) {
        const d = res.result.data
        // 下载分享封面图到本地临时路径
        const coverFileID = d.shareCoverImageFileID || ''
        if (coverFileID) {
          wx.cloud.downloadFile({
            fileID: coverFileID,
            success: (dlRes) => {
              this.setData({ shareCoverImageUrl: dlRes.tempFilePath })
            },
            fail: () => {}
          })
        }
        this.setData({
          shareAddress: d.venueAddress || '',
          shareLatitude: d.venueLatitude || '',
          shareLongitude: d.venueLongitude || ''
        })
      }
    } catch (err) {
      console.warn('加载场地设置失败:', err)
    }
  },

  onBack() {
    // 如果正在加载中，先提示用户等待
    if (this.data.loading) {
      wx.showToast({ title: '正在加载，请稍候', icon: 'none' })
      return
    }

    // 关闭所有可能打开的 Modal，避免遮罩拦截点击
    if (this.data.showCancelModal || this.data.showShareModal) {
      this.setData({
        showCancelModal: false,
        showShareModal: false
      })
      return
    }

    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({
        fail: function(err) {
          // navigateBack 失败时的兜底方案
          console.warn('[reservation-detail] navigateBack failed:', err)
          wx.reLaunch({ url: '/pages/index/index' })
        }
      })
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  onEdit() {
    if (!hasPermission('reservation', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/reservation-add/index?id=' + this.data.id
    })
  },

  onCancel() {
    if (!hasPermission('reservation', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    this.setData({ showCancelModal: true })
  },

  onCloseCancel() {
    this.setData({ showCancelModal: false })
  },

  async onConfirmCancel() {
    this.setData({ showCancelModal: false })
    try {
      wx.showLoading({ title: '处理中' })
      await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, { status: 'cancelled' })
      await this.deleteBanquetPurchase(this.data.id)
      log(LOG_TYPES.RESERVATION_UPDATE, '取消预约: ' + (this.data.reservation.customerName || ''))
      wx.hideLoading()
      wx.showToast({ title: '已取消', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '取消预约')
    }
  },

  onShareToGuest() {
    if (!hasPermission('reservation', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const r = this.data.reservation
    const defaultTitle = (r.customerName || '预约') + ' · 预定信息'
    const saved = r.shareConfig || {}
    // Auto-generated titles (ending with " · 预定信息") refresh with current customer name;
    // user-customized titles are preserved
    const isAutoGenerated = saved.shareTitle && saved.shareTitle.endsWith(' · 预定信息')
    this.setData({
      showShareModal: true,
      shareTitle: (saved.shareTitle && !isAutoGenerated) ? saved.shareTitle : defaultTitle,
      shareAddress: saved.shareAddress || this.data.shareAddress,
      shareRemark: saved.shareRemark || '',
      selectedTemplate: saved.template || 'business'  // 新增
    })
  },

  onCloseShareModal() {
    this.setData({ showShareModal: false })
  },

  onShareTitleInput(e) {
    this.setData({ shareTitle: e.detail.value })
  },

  onShareAddressInput(e) {
    this.setData({ shareAddress: e.detail.value })
  },

  onShareRemarkInput(e) {
    this.setData({ shareRemark: e.detail.value })
  },

  onTemplateSelect(e) {
    const template = e.currentTarget.dataset.id
    const r = this.data.reservation
    const customerName = (r && r.customerName) || '预约'
    const title = template === 'friend'
      ? '朋友们，不见不散！'
      : customerName + ' · 预定信息'
    this.setData({ selectedTemplate: template, shareTitle: title })
  },

  _buildShareConfig() {
    const { shareTitle, shareAddress, shareRemark, shareLatitude, shareLongitude, selectedTemplate } = this.data
    return { shareTitle, shareAddress, shareRemark, shareLatitude, shareLongitude, template: selectedTemplate }
  },

  async onConfirmShare() {
    const shareConfig = this._buildShareConfig()
    try {
      await db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, { shareConfig })
      const reservation = { ...this.data.reservation, shareConfig }
      this.setData({ showShareModal: false, reservation })
      wx.showToast({ title: '分享详情已保存', icon: 'success' })
    } catch (err) {
      handleCloudError(err, '保存分享详情')
    }
  },

  onShareAndSave() {
    this.setData({ showShareModal: false })
    const shareConfig = this._buildShareConfig()
    // 同步更新本地数据，确保再次打开分享时能看到刚才保存的内容
    const reservation = { ...this.data.reservation, shareConfig }
    this.setData({ reservation })
    db.updateDoc(COLLECTIONS.RESERVATION, this.data.id, { shareConfig }).catch(err => {
      console.warn('保存分享配置失败:', err)
    })
  },

  onShareAppMessage() {
    const title = this.data.shareTitle || (this.data.reservation ? this.data.reservation.customerName + ' · 预定信息' : '预定信息')
    const shareData = {
      title,
      path: '/pages/reservation-share/index?id=' + this.data.id
    }
    if (this.data.shareCoverImageUrl) {
      shareData.imageUrl = this.data.shareCoverImageUrl
    }
    return shareData
  },

  async deleteBanquetPurchase(reservationId) {
    try {
      const purchases = await db.queryAll(COLLECTIONS.PURCHASE, {
        sourceReservationId: reservationId
      })
      for (const p of (purchases.data || [])) {
        await db.deleteDoc(COLLECTIONS.PURCHASE, p._id)
      }
      const incomes = await db.queryAll(COLLECTIONS.INCOME, {
        reservationId: reservationId
      })
      for (const inc of (incomes.data || [])) {
        await db.deleteDoc(COLLECTIONS.INCOME, inc._id)
      }
    } catch (err) {
      console.warn('[banquet-sync] 删除关联记录失败:', err)
    }
  }
})