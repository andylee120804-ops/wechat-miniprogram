const BasePage = require('./BasePage')

class PurchaseDetailPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'purchase-detail/index')
  }

  async openWithId(id) {
    this.page = await this.miniProgram.reLaunch('/pages/purchase-detail/index?id=' + id)
    await new Promise(r => setTimeout(r, 1500))
    return this.page
  }

  async getPurchase() {
    return this.getData('purchase')
  }

  async isLoading() {
    return this.getData('loading')
  }

  // --- Approval-related data ---

  async getApprovalLogs() {
    return this.getData('approvalLogs')
  }

  async canApprove() {
    return this.getData('canApprove')
  }

  async canReimburse() {
    return this.getData('canReimburse')
  }

  async isSubmitter() {
    return this.getData('isSubmitter')
  }

  async isApprover() {
    return this.getData('isApprover')
  }

  // --- Actions ---

  async onApprove() {
    return this.callMethod('onApprove')
  }

  async onShowReject() {
    return this.callMethod('onShowReject')
  }

  async onRejectConfirm(reason) {
    // Set the rejection reason data first, then confirm
    await this.setData({ rejectionReason: reason, showRejectModal: false })
    return this.callMethod('onRejectConfirm')
  }

  async onReimburse() {
    return this.callMethod('onReimburse')
  }

  async onResubmit() {
    return this.callMethod('onResubmit')
  }

  async onEdit() {
    return this.callMethod('onEdit')
  }

  async onDelete() {
    return this.callMethod('onDelete')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = PurchaseDetailPage
