Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    confirmText: {
      type: String,
      value: '确认'
    },
    cancelText: {
      type: String,
      value: '取消'
    },
    showCancel: {
      type: Boolean,
      value: true
    },
    showFooter: {
      type: Boolean,
      value: true
    },
    position: {
      type: String,
      value: 'center'
    },
    blur: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    onMaskTap() {
      this.triggerEvent('close')
    },
    onCancel() {
      this.triggerEvent('close')
    },
    onConfirm() {
      this.triggerEvent('confirm')
    }
  }
})