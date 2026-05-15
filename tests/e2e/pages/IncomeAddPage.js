const BasePage = require('./BasePage')

class IncomeAddPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'income-add/index')
  }

  // --- Data assertions ---

  async getServiceChargeEnabled() { return this.getData('serviceChargeEnabled') }
  async getServiceChargeNoon() { return this.getData('serviceChargeNoon') }
  async getServiceChargeNight() { return this.getData('serviceChargeNight') }
  async getServiceChargeEnabledDate() { return this.getData('serviceChargeEnabledDate') }
  async getAmount() { return this.getData('amount') }
  async getSelectedReservation() { return this.getData('selectedReservation') }
  async getShowNoDishPriceModal() { return this.getData('showNoDishPriceModal') }
  async getRecentReservations() { return this.getData('recentReservations') }
  async getPickerIndex() { return this.getData('pickerIndex') }
  async getIsEdit() { return this.getData('isEdit') }
  async getSubmitting() { return this.getData('submitting') }
  async getNoReservation() { return this.getData('noReservation') }

  // --- Actions ---

  async setServiceChargeEnabled(val) { return this.setData({ serviceChargeEnabled: val }) }
  async setServiceChargeNoon(val) { return this.setData({ serviceChargeNoon: val }) }
  async setServiceChargeNight(val) { return this.setData({ serviceChargeNight: val }) }
  async setServiceChargeEnabledDate(val) { return this.setData({ serviceChargeEnabledDate: val }) }
  async setRecentReservations(list) { return this.setData({ recentReservations: list }) }
  async setAmount(val) { return this.setData({ amount: val }) }
  async setNoReservation(val) { return this.setData({ noReservation: val }) }

  async onReservationPickerChange(index) {
    return this.callMethod('onReservationPickerChange', { detail: { value: index } })
  }

  async onAmountInput(val) {
    return this.callMethod('onAmountInput', { detail: { value: val } })
  }

  async onSubmit() {
    return this.callMethod('onSubmit')
  }

  async loadServiceChargeSettings() {
    return this.callMethod('loadServiceChargeSettings')
  }

  async waitForLoad(timeout) {
    return this.waitForData('theme', undefined, timeout)
  }
}

module.exports = IncomeAddPage
