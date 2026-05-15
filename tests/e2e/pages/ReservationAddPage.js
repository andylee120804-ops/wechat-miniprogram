const BasePage = require('./BasePage')

class ReservationAddPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'reservation-add/index')
  }

  // --- Data assertions ---

  async getStandard() {
    return this.getData('standard')
  }

  async getStandardOptions() {
    return this.getData('standardOptions')
  }

  async getPartnerStandard() {
    return this.getData('partnerStandard')
  }

  async getDefaultStandard() {
    return this.getData('defaultStandard')
  }

  async getAllowNoStandard() {
    return this.getData('allowNoStandard')
  }

  async getIsPartner() {
    return this.getData('isPartner')
  }

  async getStandardPicked() {
    return this.getData('standardPicked')
  }

  async getCustomerName() {
    return this.getData('customerName')
  }

  async getDishPrice() {
    return this.getData('dishPrice')
  }

  async getBossList() {
    return this.getData('bossList')
  }

  async getSelectedBossIndex() {
    return this.getData('selectedBossIndex')
  }

  async getLoading() {
    return this.getData('loading')
  }

  async getIsEdit() {
    return this.getData('isEdit')
  }

  // --- Actions ---

  async togglePartner() {
    return this.callMethod('togglePartner')
  }

  async selectStandard(value) {
    return this.setData({ standard: value, standardPicked: true })
  }

  async setCustomerName(name) {
    return this.setData({ customerName: name })
  }

  async setPhone(phone) {
    return this.setData({ phone: phone })
  }

  async setGuestCount(count) {
    return this.setData({ guestCount: String(count) })
  }

  async setDate(dateStr) {
    return this.setData({ date: dateStr })
  }

  async setTime(time) {
    return this.setData({ time: time })
  }

  async setRoom(room) {
    return this.setData({ room: room })
  }

  async setDishPrice(val) {
    return this.setData({ dishPrice: String(val) })
  }

  async submit() {
    return this.callMethod('onSubmit')
  }

  async loadVenueSettings() {
    return this.callMethod('loadVenueSettings')
  }

  async loadBossList() {
    return this.callMethod('loadBossList')
  }

  // --- Form field order verification ---

  async getFormFieldsOrder() {
    const page = this.page || await this.miniProgram.currentPage()
    const card = await page.$('theme-card')
    if (!card) return null
    const inputs = await card.$$('.form-input')
    if (!inputs || inputs.length === 0) return null
    const labels = await card.$$('.form-label')
    return labels
  }
}

module.exports = ReservationAddPage
