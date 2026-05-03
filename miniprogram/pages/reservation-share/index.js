const { formatDate, getRoomName } = require('../../utils/helpers')
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
    remark: ''
  },

  onLoad(options) {
    if (!options.id) {
      this.setData({ loading: false, error: true })
      return
    }
    // Data passed from share modal (if shared via app)
    const title = options.title || ''
    const addr = options.addr || ''
    const lat = options.lat || ''
    const lng = options.lng || ''
    var initData = {}
    if (title) initData.shareTitle = decodeURIComponent(title)
    if (addr) initData.venueAddress = decodeURIComponent(addr)
    if (lat) initData.venueLatitude = lat
    if (lng) initData.venueLongitude = lng
    if (Object.keys(initData).length > 0) this.setData(initData)
    this.loadData(options.id, !!addr)
  },

  async loadData(id, hasAddress) {
    try {
      const tasks = [db.getDoc(COLLECTIONS.RESERVATION, id)]
      // Only load venue settings if address not already provided from share modal
      if (!hasAddress) {
        tasks.push(this.loadVenueSettings())
      }
      const [reservationRes] = await Promise.all(tasks)

      if (!reservationRes) {
        this.setData({ loading: false, error: true })
        return
      }

      const r = reservationRes
      const et = r.exclusiveType || (r.isExclusive ? 'full' : 'none')
      let roomName = ''
      if (et === 'none') {
        roomName = getRoomName(r.room)
      } else if (et === 'noon') {
        roomName = '包场（午）'
      } else if (et === 'night') {
        roomName = '包场（晚）'
      } else if (et === 'full') {
        roomName = '包场（全天）'
      }

      this.setData({
        loading: false,
        shareTitle: this.data.shareTitle || (r.customerName || '预约') + ' · 预定信息',
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
      if (res.result && res.result.success) {
        this.setData({
          venueName: res.result.data.venueName || '听澜轩',
          venueAddress: res.result.data.venueAddress || '',
          venueLatitude: res.result.data.venueLatitude || '',
          venueLongitude: res.result.data.venueLongitude || ''
        })
      }
    } catch (err) {
      // Silent fail, use defaults
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
