const BasePage = require('./BasePage')

class TodoPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'todo/index')
  }

  async getPendingApprovals() {
    return this.getData('pendingApprovals')
  }

  async getPendingReimbursements() {
    return this.getData('pendingReimbursements')
  }

  async isLoading() {
    return this.getData('loading')
  }

  async waitForLoad(timeout = 15000) {
    return this.waitForData('loading', false, timeout)
  }
}

module.exports = TodoPage
