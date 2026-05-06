Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    label: {
      type: String,
      value: ''
    },
    value: {
      type: null,
      value: ''
    },
    change: {
      type: Number,
      value: 0
    },
    absChange: {
      type: Number,
      value: 0
    },
    trend: {
      type: String,
      value: 'neutral'
    },
    icon: {
      type: String,
      value: ''
    },
    prefix: {
      type: String,
      value: '¥'
    },
    showPrefix: {
      type: Boolean,
      value: true
    }
  },
  observers: {
    'change': function(val) {
      this.setData({ absChange: Math.abs(val || 0) })
    }
  }
})