const BasePage = require('./BasePage')

class IncomePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'income/index')
  }

  async getCurrentMonth() {
    return this.getData('currentMonth')
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
}

module.exports = IncomePage
