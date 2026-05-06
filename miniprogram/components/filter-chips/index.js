Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    items: {
      type: Array,
      value: [{ id: '', name: '全部', count: 0 }]
    },
    activeId: {
      type: String,
      value: ''
    }
  },

  methods: {
    onChipTap: function(e) {
      const id = e.currentTarget.dataset.id;
      this.triggerEvent('change', { id: id });
    }
  }
})