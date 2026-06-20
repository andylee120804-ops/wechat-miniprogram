const BasePage = require('./BasePage')

class ReservationAddPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'reservation-add/index')
  }

  // ── Config/state getters (post dynamic-config refactor) ───────

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

  async getRoom() {
    return this.getData('room')
  }

  async getRoomOptions() {
    return this.getData('roomOptions')
  }

  async getCurrentRoomConfig() {
    return this.getData('currentRoomConfig')
  }

  async getTimeOptions() {
    return this.getData('timeOptions')
  }

  async getExclusiveOptions() {
    return this.getData('exclusiveOptions')
  }

  async getFormFields() {
    return this.getData('formFields')
  }

  async getFormConfigFields() {
    return this.getData('formConfigFields')
  }

  async getFormData() {
    return this.getData('formData')
  }

  async getCustomerName() {
    const formData = await this.getData('formData')
    return formData ? formData.customerName : ''
  }

  async getDishPrice() {
    const formData = await this.getData('formData')
    return formData ? formData.dishPrice : ''
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

  // ── Actions ──────────────────────────────────────────────────

  async togglePartner() {
    return this.callMethod('togglePartner')
  }

  async selectStandard(value) {
    return this.setData({ standard: value, standardPicked: true })
  }

  async selectRoom(roomId) {
    return this.callMethod('selectRoom', { currentTarget: { dataset: { value: roomId } } })
  }

  async setRoomDirect(roomId) {
    return this.setData({ room: roomId })
  }

  async setFormField(fieldId, value) {
    return this.setData({ ['formData.' + fieldId]: value })
  }

  async setCustomerName(name) {
    return this.setData({ 'formData.customerName': name })
  }

  async setPhone(phone) {
    return this.setData({ 'formData.phone': phone })
  }

  async setGuestCount(count) {
    return this.setData({ 'formData.guestCount': String(count) })
  }

  async setDishPrice(val) {
    return this.setData({ 'formData.dishPrice': String(val) })
  }

  async setRemark(remark) {
    return this.setData({ 'formData.remark': remark })
  }

  async setDate(dateStr) {
    return this.setData({ date: dateStr })
  }

  async setTime(time) {
    return this.setData({ time: time })
  }

  async submit() {
    return this.callMethod('onSubmit')
  }

  async loadReservationConfig() {
    return this.callMethod('loadReservationConfig')
  }

  async loadBossList() {
    return this.callMethod('loadBossList')
  }
}

module.exports = ReservationAddPage
