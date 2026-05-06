const BasePage = require('./BasePage')

class PurchasePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'purchase/index')
  }

  // --- Data assertions ---

  async getMonthStr() {
    return this.getData('monthStr')
  }

  async getMonthLabel() {
    return this.getData('monthLabel')
  }

  async getCategories() {
    return this.getData('categories')
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

  // --- Element-level rendering checks ---

  async getMonthLabelText() {
    const text = await this.getElementText('.month-label')
    return text ? text.trim() : null
  }

  async getSummaryAmountText() {
    const text = await this.getElementText('.text-display')
    return text ? text.trim() : null
  }

  async navigatePrevMonth() {
    await this.callMethod('onMonthPrev')
  }

  async navigateNextMonth() {
    await this.callMethod('onMonthNext')
  }
}

module.exports = PurchasePage
