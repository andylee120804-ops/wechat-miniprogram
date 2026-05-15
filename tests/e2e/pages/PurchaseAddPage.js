const BasePage = require('./BasePage')

class PurchaseAddPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'purchase-add/index')
  }

  async openNew() {
    this.page = await this.miniProgram.reLaunch('/pages/purchase-add/index')
    await new Promise(r => setTimeout(r, 1500))
    return this.page
  }

  async isLoading() {
    return this.getData('loading')
  }

  async getCategories() {
    return this.getData('categories')
  }

  // --- Approval-related ---

  async getApproverName() {
    return this.getData('approverName')
  }

  // --- Form interaction ---

  async selectCategory(category) {
    return this.setData({ category: category })
  }

  async setAmount(amount) {
    return this.setData({
      amount: String(amount),
      amountNum: Number(amount)
    })
  }

  async setItemName(name) {
    return this.setData({ item: name })
  }

  async setDate(date) {
    return this.setData({ date: date })
  }

  async setRemark(remark) {
    return this.setData({ remark: remark })
  }

  async submit() {
    return this.callMethod('onSubmit')
  }

  async loadApprovalPreview() {
    return this.callMethod('loadApprovalPreview')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = PurchaseAddPage
