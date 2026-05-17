const BasePage = require('./BasePage')

class MePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'me/index')
  }

  async getUserInfo() {
    return this.getData('userInfo')
  }

  async getRoleName() {
    return this.getData('roleName')
  }

  async getManagementGroup() {
    return this.getData('managementGroup')
  }

  async getFeatureGroup() {
    return this.getData('featureGroup')
  }

  async getSettingsGroup() {
    return this.getData('settingsGroup')
  }

  async getPendingGroup() {
    return this.getData('pendingGroup')
  }
}

module.exports = MePage
