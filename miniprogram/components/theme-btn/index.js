Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    type: {
      type: String,
      value: 'default'
    },
    text: {
      type: String,
      value: ''
    },
    disabled: {
      type: Boolean,
      value: false
    },
    block: {
      type: Boolean,
      value: false
    },
    size: {
      type: String,
      value: 'normal'
    },
    loading: {
      type: Boolean,
      value: false
    },
    icon: {
      type: String,
      value: ''
    }
  },
  methods: {
    onTap() {
      if (this.data.disabled || this.data.loading) return
      wx.vibrateShort({ type: 'light' })
      this.triggerEvent('tap')
    }
  }
})