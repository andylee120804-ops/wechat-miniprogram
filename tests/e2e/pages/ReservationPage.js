const BasePage = require('./BasePage')

class ReservationPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'reservation/index')
  }

  // --- Data assertions ---

  async getSelectedDate() {
    return this.getData('selectedDate')
  }

  async getReservations() {
    return this.getData('reservations')
  }

  async getGroupedReservations() {
    // Returns array of { key, label, items, color, textColor }
    return this.getData('groupedReservationsDynamic')
  }

  async isLoading() {
    return this.getData('loading')
  }

  // --- Element-level rendering checks ---

  async getMonthLabelText() {
    const page = await this.miniProgram.currentPage()
    const calendar = await page.$('calendar')
    if (!calendar) return null
    const title = await calendar.$('.calendar-title')
    if (!title) return null
    const text = await title.text()
    return text ? text.trim() : null
  }

  async navigatePrevMonth() {
    const page = await this.miniProgram.currentPage()
    const el = await page.$('.calendar-arrow')
    if (el) await el.tap()
  }

  async navigateNextMonth() {
    const page = await this.miniProgram.currentPage()
    const els = await page.$$('.calendar-arrow')
    if (els && els.length > 1) await els[1].tap()
  }
}

module.exports = ReservationPage
