const BasePage = require('./BasePage')

class MinAmountPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'min-amount/index')
  }

  // --- Data assertions ---

  async getMinRoom() { return this.getData('min_room') }
  async getMinNoon() { return this.getData('min_noon') }
  async getMinNight() { return this.getData('min_night') }
  async getMinFull() { return this.getData('min_full') }
  async getServiceChargeEnabled() { return this.getData('serviceChargeEnabled') }
  async getServiceChargeNoon() { return this.getData('serviceChargeNoon') }
  async getServiceChargeNight() { return this.getData('serviceChargeNight') }
  async getServiceChargeEnabledDate() { return this.getData('serviceChargeEnabledDate') }
  async getLoading() { return this.getData('loading') }
  async isLoading() { return this.getData('loading') }

  // --- Actions ---

  async setMinRoom(val) { return this.setData({ min_room: val }) }
  async setMinNoon(val) { return this.setData({ min_noon: val }) }
  async setMinNight(val) { return this.setData({ min_night: val }) }
  async setMinFull(val) { return this.setData({ min_full: val }) }
  async setServiceChargeEnabled(val) { return this.setData({ serviceChargeEnabled: val }) }
  async setServiceChargeNoon(val) { return this.setData({ serviceChargeNoon: val }) }
  async setServiceChargeNight(val) { return this.setData({ serviceChargeNight: val }) }
  async setServiceChargeEnabledDate(val) { return this.setData({ serviceChargeEnabledDate: val }) }

  async saveSettings() { return this.callMethod('onSave') }
  async toggleServiceCharge() { return this.callMethod('onServiceChargeSwitch', { detail: { value: true } }) }
  async toggleServiceChargeOff() { return this.callMethod('onServiceChargeSwitch', { detail: { value: false } }) }

  async waitForLoad(timeout) { return this.waitForData('theme', undefined, timeout) }
}

module.exports = MinAmountPage
