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
    return this.getData('categoryOptions')
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
    // PurchaseAdd has no 'loading' field; wait for categoryOptions to populate instead
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const categories = await this.getData('categoryOptions')
      if (Array.isArray(categories) && categories.length > 0) {
        return true
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return false
  }
}

module.exports = PurchaseAddPage
