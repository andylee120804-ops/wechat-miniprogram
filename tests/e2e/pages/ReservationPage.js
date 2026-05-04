const BasePage = require('./BasePage')

class ReservationPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'reservation/index')
  }

  async getSelectedDate() {
    return this.getData('selectedDate')
  }

  async getReservations() {
    return this.getData('reservations')
  }

  async getGroupedReservations() {
    return this.getData('groupedReservations')
  }

  async isLoading() {
    return this.getData('loading')
  }
}

module.exports = ReservationPage
