const { formatDate, getRoomName } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const db = require('../../utils/db')

Page({
  data: {
    loading: true,
    error: false,
    venueName: '听澜轩',
    venueAddress: '',
    customerName: '',
    phone: '',
    date: '',
    time: '',
    roomName: '',
    guestCount: '',
    remark: ''
  },

  onLoad(options) {
    if (options.id) {
      this.loadData(options.id)
    } else {
      this.setData({ loading: false, error: true })
    }
  },

  async loadData(id) {
    try {
      // Parallel load reservation data and venue settings
      const [reservationRes] = await Promise.all([
        db.getDoc(COLLECTIONS.RESERVATION, id),
        this.loadVenueSettings()
      ])

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
          venueAddress: res.result.data.venueAddress || ''
        })
      }
    } catch (err) {
      // Silent fail, use defaults
    }
  }
})
