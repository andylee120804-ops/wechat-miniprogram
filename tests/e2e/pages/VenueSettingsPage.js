const BasePage = require('./BasePage')

class VenueSettingsPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'admin/venue-settings/index')
  }

  // --- Data assertions ---

  async getVenueName() {
    return this.getData('venueName')
  }

  async getVenueAddress() {
    return this.getData('venueAddress')
  }

  async getStandardList() {
    return this.getData('standardList')
  }

  async getPartnerStandard() {
    return this.getData('partnerStandard')
  }

  async getDefaultStandardValue() {
    return this.getData('defaultStandardValue')
  }

  async getDefaultStandardLabel() {
    return this.getData('defaultStandardLabel')
  }

  async getAllowNoStandard() {
    return this.getData('allowNoStandard')
  }

  async getLoading() {
    return this.getData('loading')
  }

  async getSaving() {
    return this.getData('saving')
  }

  async getCanEdit() {
    return this.getData('canEdit')
  }

  async isLoading() {
    return this.getData('loading')
  }

  // --- Actions ---

  async setVenueName(value) {
    return this.setData({ venueName: value })
  }

  async setVenueAddress(value) {
    return this.setData({ venueAddress: value })
  }

  async saveSettings() {
    return this.callMethod('onSave')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = VenueSettingsPage
