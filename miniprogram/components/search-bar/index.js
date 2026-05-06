Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    placeholder: {
      type: String,
      value: '搜索'
    },
    value: {
      type: String,
      value: ''
    },
    debounce: {
      type: Number,
      value: 300
    }
  },

  data: {
    innerValue: '',
    debounceTimer: null
  },

  observers: {
    'value': function(val) {
      if (val !== this.data.innerValue) {
        this.setData({ innerValue: val });
      }
    }
  },

  methods: {
    onInput: function(e) {
      const value = e.detail.value;
      this.setData({ innerValue: value });

      if (this.data.debounceTimer) {
        clearTimeout(this.data.debounceTimer);
      }

      let timer = setTimeout(function() {
        this.triggerEvent('search', { value: value });
      }.bind(this), this.data.debounce);

      this.setData({ debounceTimer: timer });
    },

    onClear: function() {
      this.setData({ innerValue: '' });
      if (this.data.debounceTimer) {
        clearTimeout(this.data.debounceTimer);
      }
      this.triggerEvent('clear', {});
      this.triggerEvent('search', { value: '' });
    },

    onFocus: function() {
      this.triggerEvent('focus', {});
    },

    onBlur: function() {
      this.triggerEvent('blur', {});
    }
  }
})