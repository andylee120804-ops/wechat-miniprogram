const { formatDate, getRoomName, getExclusiveTypeName } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    loading: true,
    error: false,
    shareTitle: '',
    venueName: '听澜轩',
    venueAddress: '',
    venueLatitude: '',
    venueLongitude: '',
    customerName: '',
    phone: '',
    date: '',
    time: '',
    roomName: '',
    guestCount: '',
    remark: '',
    shareRemark: ''
  },

  onLoad(options) {
    if (!options.id) {
      this.setData({ loading: false, error: true })
      return
    }
    this.loadData(options.id)
  },

  async loadData(id) {
    try {
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

      this.setData({
        loading: false,
        shareTitle: sc.shareTitle || (r.customerName || '预约') + ' · 预定信息',
        shareRemark: sc.shareRemark || '',
        customerName: r.customerName || '',
        phone: r.phone || '',
        date: formatDate(r.date) || '',
        time: r.time || '',
        roomName: roomName,
        guestCount: r.guestCount || '',
        remark: r.remark || ''
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
        this.setData({
          venueName: res.result.data.venueName || '听澜轩',
          venueAddress: res.result.data.venueAddress || '',
          venueLatitude: res.result.data.venueLatitude || '',
          venueLongitude: res.result.data.venueLongitude || ''
        })
      }
    } catch (err) {
      console.warn('加载场地设置失败:', err)
    }
  },

  onAddressTap() {
    const { venueAddress, venueLatitude, venueLongitude } = this.data
    if (!venueAddress) return

    // If coordinates available, open map navigation
    if (venueLatitude && venueLongitude) {
      wx.openLocation({
        latitude: parseFloat(venueLatitude),
        longitude: parseFloat(venueLongitude),
        name: this.data.venueName,
        address: venueAddress,
        fail: () => {
          // Fallback: copy to clipboard
          this.copyAddress(venueAddress)
        }
      })
    } else {
      // No coordinates - copy to clipboard
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
  }
})
