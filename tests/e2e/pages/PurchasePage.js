const BasePage = require('./BasePage')

class PurchasePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'purchase/index')
  }

  async getMonthStr() {
    return this.getData('monthStr')
  }

  async getActiveCategory() {
    return this.getData('activeCategory')
  }

  async getFilteredPurchases() {
    return this.getData('filteredPurchases')
  }

  async getTotalFormatted() {
    return this.getData('totalFormatted')
  }

  async isLoading() {
    return this.getData('loading')
  }
}

module.exports = PurchasePage
