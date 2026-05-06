Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    type: {
      type: String,
      value: 'no-data'
    },
    title: {
      type: String,
      value: ''
    },
    description: {
      type: String,
      value: ''
    },
    actionText: {
      type: String,
      value: ''
    }
  },

  data: {
    icon: '',
    defaultTitle: ''
  },

  observers: {
    'type': function(type) {
      const icons = {
        'no-data': '📭',
        'no-result': '🔍',
        'no-reservation': '📅',
        'no-income': '💰',
        'no-purchase': '🛒',
        'no-attendance': '⏰'
      };
      const defaultTitles = {
        'no-data': '暂无数据',
        'no-result': '未找到结果',
        'no-reservation': '暂无预约',
        'no-income': '暂无收入记录',
        'no-purchase': '暂无消费记录',
        'no-attendance': '暂无考勤记录'
      };
      this.setData({
        icon: icons[type] || '📭',
        defaultTitle: defaultTitles[type] || '暂无数据'
      });
    }
  },

  methods: {
    onAction: function() {
      this.triggerEvent('action', {});
    }
  }
})