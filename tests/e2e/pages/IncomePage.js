const BasePage = require('./BasePage')

class IncomePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'income/index')
  }

  // --- Data assertions ---

  async getCurrentMonth() {
    return this.getData('currentMonth')
  }

  async getMonthStr() {
    return this.getData('monthStr')
  }

  async getTypeOptions() {
    return this.getData('typeOptions')
  }

  async getActiveType() {
    return this.getData('activeType')
  }

  async getFilteredIncomes() {
    return this.getData('filteredIncomes')
  }

  async getTotalAmount() {
    return this.getData('totalAmount')
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
    const text = await this.getElementText('.summary-amount')
    return text ? text.trim() : null
  }

  async navigatePrevMonth() {
    await this.callMethod('onPrevMonth')
  }

  async navigateNextMonth() {
    await this.callMethod('onNextMonth')
  }
}

module.exports = IncomePage
