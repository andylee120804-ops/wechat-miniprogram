Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    status: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'status'
    },
    text: {
      type: String,
      value: ''
    },
    size: {
      type: String,
      value: 'md'
    },
    pulse: {
      type: Boolean,
      value: false
    }
  },
  data: {
    bgColor: 'rgba(150,150,170,0.2)',
    textColor: '#9A9AB0',
    displayText: ''
  },
  observers: {
    'status, type, theme, text': function(status, type, theme, text) {
      const displayText = text || status || ''

      if (type === 'status') {
        const tagColors = theme.tags || {};
        const statusColors = tagColors[status] || { bg: 'rgba(150,150,170,0.2)', text: '#9A9AB0' };
        this.setData({ bgColor: statusColors.bg, textColor: statusColors.text, displayText: displayText })
      } else if (type === 'role') {
        const roleColors = theme.roleTags || {};
        const roleColor = roleColors[status] || { bg: 'rgba(150,150,170,0.2)', text: '#9A9AB0' };
        this.setData({ bgColor: roleColor.bg, textColor: roleColor.text, displayText: displayText })
      } else if (type === 'category') {
        this.setData({ bgColor: 'rgba(150,150,170,0.2)', textColor: '#9A9AB0', displayText: displayText })
      } else if (type === 'expense') {
        const colors = {
          '工资': '#EF4444', 'salary': '#EF4444',
          '租金': '#F59E0B', 'rent': '#F59E0B',
          '水电': '#3B82F6', 'utilities': '#3B82F6',
          '用品': '#22C55E', 'supplies': '#22C55E',
          '物资': '#22C55E',
          '其他': '#9CA3AF', 'other': '#9CA3AF'
        }
        const key = status || text
        let color = colors[key] || '#9CA3AF'
        this.setData({ bgColor: color + '22', textColor: color, displayText: displayText })
      } else if (type === 'approvalStatus') {
        var colors = {
          'pending': '#FBBF24',
          'approved': '#4ADE80',
          'rejected': '#F87171',
          'reimbursed': '#9CA3AF'
        }
        var color = colors[status] || '#9CA3AF'
        var labels = {
          'pending': '待审批',
          'approved': '已批准',
          'rejected': '已拒绝',
          'reimbursed': '已报销'
        }
        var label = labels[status] || ''
        this.setData({ bgColor: color + '22', textColor: color, displayText: text || label })
      } else {
        this.setData({ displayText: displayText })
      }
    }
  }
})
