const BasePage = require('./BasePage')

class ApprovalSettingsPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'admin/approval-settings/index')
  }

  async getEnabled() {
    return this.getData('enabled')
  }

  async getCategories() {
    return this.getData('categories')
  }

  async getAmountThreshold() {
    return this.getData('amountThreshold')
  }

  async getDefaultApproverId() {
    return this.getData('defaultApproverId')
  }

  async getDefaultApproverName() {
    return this.getData('defaultApproverName')
  }

  async isLoading() {
    return this.getData('loading')
  }

  async isSaving() {
    return this.getData('saving')
  }

  // --- Actions ---

  async toggleEnabled() {
    return this.callMethod('onToggleEnabled', { detail: { value: !await this.getEnabled() } })
  }

  async toggleCategory(key) {
    return this.callMethod('onCategoryToggle', { currentTarget: { dataset: { key: key } } })
  }

  async setThreshold(value) {
    return this.callMethod('onThresholdInput', { detail: { value: String(value) } })
  }

  async save() {
    return this.callMethod('onSave')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = ApprovalSettingsPage
