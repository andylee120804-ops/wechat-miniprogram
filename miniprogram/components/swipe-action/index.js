Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    actions: {
      type: Array,
      value: [{ text: '编辑', type: 'primary' }, { text: '删除', type: 'danger' }]
    },
    threshold: {
      type: Number,
      value: 80
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    translateX: 0,
    startX: 0,
    isRevealed: false
  },

  methods: {
    onTouchStart: function(e) {
      if (this.data.disabled) return;
      this.setData({
        startX: e.touches[0].clientX
      });
    },

    onTouchMove: function(e) {
      if (this.data.disabled) return;
      var deltaX = e.touches[0].clientX - this.data.startX;
      var maxSwipe = -this.data.threshold * this.data.actions.length;
      var newTranslateX = this.data.isRevealed ? deltaX + maxSwipe : deltaX;

      // Limit translateX between maxSwipe and 0
      if (newTranslateX > 0) newTranslateX = 0;
      if (newTranslateX < maxSwipe) newTranslateX = maxSwipe;

      this.setData({
        translateX: newTranslateX
      });
    },

    onTouchEnd: function() {
      if (this.data.disabled) return;
      var maxSwipe = -this.data.threshold * this.data.actions.length;
      var halfThreshold = this.data.threshold / 2;

      if (this.data.isRevealed) {
        // Currently revealed, check if we should close
        if (this.data.translateX > maxSwipe + halfThreshold) {
          this.setData({
            translateX: 0,
            isRevealed: false
          });
        } else {
          this.setData({
            translateX: maxSwipe,
            isRevealed: true
          });
        }
      } else {
        // Currently closed, check if we should open
        if (this.data.translateX < -halfThreshold) {
          this.setData({
            translateX: maxSwipe,
            isRevealed: true
          });
        } else {
          this.setData({
            translateX: 0,
            isRevealed: false
          });
        }
      }
    },

    onActionTap: function(e) {
      var index = e.currentTarget.dataset.index;
      var action = this.data.actions[index];
      this.triggerEvent('actiontap', { index: index, action: action });
      // Close after action tap
      this.close();
    },

    close: function() {
      this.setData({
        translateX: 0,
        isRevealed: false
      });
    }
  }
})