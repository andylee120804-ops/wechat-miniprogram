const { formatDate, getRoomName, getExclusiveTypeName } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')
const app = getApp()

Page({
  data: {
    loading: true,
    error: false,
    statusBarHeight: 44,
    shareTitle: '',
    venueName: '',
    venueAddress: '',
    venueLatitude: '',
    venueLongitude: '',
    venueMapImage: '',
    venueMapImageFileID: '',
    customerName: '',
    phone: '',
    date: '',
    time: '',
    roomName: '',
    guestCount: '',
    remark: '',
    shareRemark: '',
    templateClass: '',
    headerEmojis: [],
    detailItems: [],
    templateConfig: {
      business: {
        headerEmojis: ['❤️'],
        fieldEmojis: ['📋', '⌚', '🏠', '👔', '📝', '💌']
      },
      friend: {
        headerEmojis: ['🍻', '🤗'],
        fieldEmojis: ['📆', '🌙', '🏠', '🥂', '📝', '💌']
      }
    }
  },

  onLoad(options) {
    const menuBtn = wx.getMenuButtonBoundingClientRect()
    const top = menuBtn ? menuBtn.top : (app.globalData.statusBarHeight || 44)
    this.setData({ statusBarHeight: top })
    if (!options.id) {
      this.setData({ loading: false, error: true })
      return
    }
    this.loadData(options.id)
  },

  async loadData(id) {
    try {
      this.setData({ loading: true })
      const [reservationRes] = await Promise.all([
        db.getDoc(COLLECTIONS.RESERVATION, id),
        this.loadVenueSettings()
      ])

      if (!reservationRes) {
        this.setData({ loading: false, error: true })
        return
      }

      const r = reservationRes
      const sc = r.shareConfig || {}
      const et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      const roomName = getExclusiveTypeName(et, r.room)

      // 地址优先用 shareConfig 中的自定义地址，无则回退到食堂全局设置（loadVenueSettings 已加载）
      const shareAddr = sc.shareAddress || this.data.venueAddress || ''
      const shareLat = sc.shareLatitude || this.data.venueLatitude || ''
      const shareLng = sc.shareLongitude || this.data.venueLongitude || ''

      // Parse template from shareConfig and build detailItems with dynamic emojis
      const validTemplates = ['business', 'friend']
      const template = validTemplates.includes(sc.template) ? sc.template : 'business'
      const templateData = this.data.templateConfig[template]

      const EMOJI_FALLBACKS = ['📅', '🕐', '🚪', '👔', '📝', '💌']
      const detailItems = [
        { icon: templateData.fieldEmojis[0] || EMOJI_FALLBACKS[0], label: '日期', value: formatDate(r.date) },
        { icon: templateData.fieldEmojis[1] || EMOJI_FALLBACKS[1], label: '时段', value: r.time || '' },
        { icon: templateData.fieldEmojis[2] || EMOJI_FALLBACKS[2], label: '包厢', value: roomName, iconClass: 'label-icon-accent' },
        { icon: templateData.fieldEmojis[3] || EMOJI_FALLBACKS[3], label: '人数', value: (r.guestCount || '') + '人' }
      ]
      // 客人看到的「温馨提示」：只有 sc.shareRemark（员工在弹窗里填写的）才显示
      if (sc.shareRemark) detailItems.push({ icon: templateData.fieldEmojis[5] || EMOJI_FALLBACKS[5], label: '温馨提示', value: sc.shareRemark })

      // Custom fields from reservation
      var cf = r.customFields || {}
      var cfKeys = Object.keys(cf)
      if (cfKeys.length > 0) {
        try {
          var config = require('../../utils/reservationConfig')
          var formConfig = await config.loadFormConfig()
          cfKeys.forEach(function(key) {
            var fd = formConfig.fields.find(function(f) { return f.id === key })
            if (fd && cf[key] !== undefined && cf[key] !== '' && cf[key] !== 0) {
              detailItems.push({ icon: '📋', label: fd.label, value: String(cf[key]) })
            }
          })
        } catch (e) { /* ignore config load failures */ }
      }

      // 根据模板生成默认标题
      const defaultTitle = template === 'friend'
        ? '朋友们，不见不散！'
        : (r.customerName || '预约') + ' · 预定信息'
      this.setData({
        loading: false,
        shareTitle: sc.shareTitle || defaultTitle,
        shareRemark: sc.shareRemark || '',
        customerName: r.customerName || '',
        phone: r.phone || '',
        date: formatDate(r.date) || '',
        time: r.time ? r.time + ' ' + (r.time === '中午' ? '12:00' : '18:30') : '',
        roomName: roomName,
        guestCount: r.guestCount || '',
        remark: '',
        venueAddress: shareAddr,
        venueLatitude: shareLat,
        venueLongitude: shareLng,
        templateClass: template,
        headerEmojis: templateData.headerEmojis,
        detailItems: detailItems
      })
    } catch (err) {
      this.setData({ loading: false, error: true })
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
        this.setData({
          venueName: d.venueName || '',
          venueAddress: d.venueAddress || '',
          venueLatitude: d.venueLatitude || '',
          venueLongitude: d.venueLongitude || '',
          venueMapImage: '',
          venueMapImageFileID: d.venueMapImageFileID || ''
        })
        if (d.venueMapImageFileID) {
          this._downloadMapImage(d.venueMapImageFileID)
        }
      }
    } catch (err) {
      console.warn('加载场地设置失败:', err)
    }
  },

  _downloadMapImage(fileID) {
    if (!fileID) return
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        this.setData({ venueMapImage: res.tempFilePath })
      },
      fail: (err) => {
        console.error('下载导航图失败:', err)
      }
    })
  },

  onAddressTap() {
    const { venueAddress, venueLatitude, venueLongitude } = this.data
    if (!venueAddress) return

    if (venueLatitude && venueLongitude) {
      wx.openLocation({
        latitude: parseFloat(venueLatitude),
        longitude: parseFloat(venueLongitude),
        name: this.data.venueName,
        address: venueAddress,
        fail: () => {
          this.copyAddress(venueAddress)
        }
      })
    } else {
      this.copyAddress(venueAddress)
    }
  },

  copyAddress(address) {
    wx.setClipboardData({
      data: address,
      success() {
        wx.showToast({ title: '地址已复制，可粘贴到地图导航', icon: 'none', duration: 2500 })
      }
    })
  },

  onMapImageTap() {
    const url = this.data.venueMapImage
    if (!url) return
    wx.previewImage({
      urls: [url],
      current: url
    })
  },

  onClose() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
    } else {
      wx.exitMiniProgram()
    }
  }
})
