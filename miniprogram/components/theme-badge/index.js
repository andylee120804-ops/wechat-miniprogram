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
        const colors = {
          '肉': '#EF4444', 'meat': '#EF4444',
          '海鲜': '#3B82F6', 'seafood': '#3B82F6',
          '蔬': '#22C55E', 'vegetable': '#22C55E',
          '果': '#F59E0B', 'fruit': '#F59E0B',
          '酒水': '#8B5CF6', 'drink': '#8B5CF6',
          '调料': '#6B7280', 'seasoning': '#6B7280',
          '用品': '#14B8A6', 'supplies': '#14B8A6',
          '设备': '#F97316', 'equipment': '#F97316',
          '宴': '#D4A843', 'banquet': '#D4A843',
          '其他': '#9CA3AF', 'other': '#9CA3AF'
        }
        const key = status || text
        let color = colors[key] || '#9CA3AF'
        this.setData({ bgColor: color + '22', textColor: color, displayText: displayText })
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
      } else {
        this.setData({ displayText: displayText })
      }
    }
  }
})
