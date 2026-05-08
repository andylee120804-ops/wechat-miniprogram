const BasePage = require('./BasePage')

class ReservationDetailPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'reservation-detail/index')
  }

  async getReservation() {
    return this.getData('reservation')
  }

  async getShareTitle() {
    return this.getData('shareTitle')
  }

  async getShareAddress() {
    return this.getData('shareAddress')
  }

  async getShareRemark() {
    return this.getData('shareRemark')
  }

  async getShowShareModal() {
    return this.getData('showShareModal')
  }

  async isLoading() {
    return this.getData('loading')
  }

  // --- Actions ---

  async openWithId(id) {
    this.page = await this.miniProgram.reLaunch(`/pages/reservation-detail/index?id=${id}`)
    await new Promise(r => setTimeout(r, 1500))
    return this.page
  }

  async onShareToGuest() {
    return this.callMethod('onShareToGuest')
  }

  async onConfirmShare() {
    return this.callMethod('onConfirmShare')
  }

  async onShareAndSave() {
    return this.callMethod('onShareAndSave')
  }

  async onCloseShareModal() {
    return this.callMethod('onCloseShareModal')
  }

  async setShareTitle(title) {
    return this.setData({ shareTitle: title })
  }

  async setShareAddress(addr) {
    return this.setData({ shareAddress: addr })
  }

  async setShareRemark(remark) {
    return this.setData({ shareRemark: remark })
  }

  async _buildShareConfig() {
    return this.callMethod('_buildShareConfig')
  }

  async loadData() {
    return this.callMethod('loadData')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = ReservationDetailPage
