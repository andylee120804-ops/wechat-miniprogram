const { getThemeList, getCurrentThemeId } = require('../../styles/themes.js')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    theme: {
      type: Object,
      value: {}
    },
    themeId: {
      type: String,
      value: ''
    }
  },
  data: {
    themeList: [],
    currentTheme: '',
    showPanel: true
  },
  lifetimes: {
    attached() {
      const themeList = getThemeList()
      const currentTheme = this.data.themeId || getCurrentThemeId()
      this.setData({ themeList, currentTheme })
    }
  },
  methods: {
    onSelectTheme(e) {
      const id = e.currentTarget.dataset.id
      if (id === this.data.currentTheme) return
      const app = getApp()
      if (app && app.setTheme) {
        app.setTheme(id)
      }
      this.setData({ currentTheme: id })
      this.triggerEvent('themechange', { id })
    },
    onClose() {
      this.triggerEvent('close')
    }
  }
})