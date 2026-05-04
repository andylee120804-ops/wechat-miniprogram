const BasePage = require('./BasePage')

class HomePage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'index/index')
  }

  async getTodayReservations() {
    return this.getData('lunchReservations')
  }

  async getDinnerReservations() {
    return this.getData('dinnerReservations')
  }

  async getTomorrowReservations() {
    return this.getData('tomorrowReservations')
  }

  async getTodayIncome() {
    return this.getData('todayIncome')
  }

  async getTodayExpense() {
    return this.getData('todayExpense')
  }

  async isShowSummary() {
    return this.getData('showSummary')
  }

  async isLoading() {
    return this.getData('loading')
  }

  async canAddReservation() {
    return this.getData('canAddReservation')
  }

  async canAddPurchase() {
    return this.getData('canAddPurchase')
  }

  async canAddIncome() {
    return this.getData('canAddIncome')
  }
}

module.exports = HomePage
