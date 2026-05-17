const BasePage = require('./BasePage')

class MyPurchasesPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'my-purchases/index')
  }

  async isLoading() {
    return this.getData('loading')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }

  async getStatusCards() {
    return this.getData('statusCards')
  }

  async getActiveStatus() {
    return this.getData('activeStatus')
  }

  async getSectionLabel() {
    return this.getData('sectionLabel')
  }

  async getFilteredList() {
    return this.getData('filteredList')
  }

  async getHasRecords() {
    return this.getData('hasRecords')
  }

  async tapStatusCard(statusKey) {
    // Filter by status via onCardTap handler
    await this.callMethod('onCardTap', { currentTarget: { dataset: { key: statusKey } } })
    await new Promise(r => setTimeout(r, 500))
  }

  async resetFilter() {
    await this.callMethod('onCardTap', { currentTarget: { dataset: { key: '' } } })
    await new Promise(r => setTimeout(r, 500))
  }
}

module.exports = MyPurchasesPage
