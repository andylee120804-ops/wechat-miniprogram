Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    text: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'info'
    },
    closable: {
      type: Boolean,
      value: true
    }
  },

  data: {
    visible: true,
    typeIcon: 'ℹ️'
  },

  observers: {
    'type': function(type) {
      var icons = {
        'info': 'ℹ️',
        'warning': '⚠️',
        'urgent': '🔴'
      };
      this.setData({
        typeIcon: icons[type] || 'ℹ️'
      });
    }
  },

  methods: {
    onTap: function() {
      this.triggerEvent('tap', {});
    },

    onClose: function() {
      this.setData({ visible: false });
      this.triggerEvent('close', {});
    }
  }
})