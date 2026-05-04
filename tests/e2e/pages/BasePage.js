class BasePage {
  constructor(miniProgram, pagePath) {
    this.miniProgram = miniProgram
    this.pagePath = pagePath
    this.page = null
  }

  async open() {
    this.page = await this.miniProgram.reLaunch(`/pages/${this.pagePath}`)
    // Wait for page to stabilize
    await new Promise(r => setTimeout(r, 1000))
    return this.page
  }

  async getData(key) {
    const page = this.page || await this.miniProgram.currentPage()
    const data = await page.data()
    if (key) return data[key]
    return data
  }

  async setData(data) {
    const page = this.page || await this.miniProgram.currentPage()
    await page.setData(data)
  }

  async callMethod(methodName, ...args) {
    const page = this.page || await this.miniProgram.currentPage()
    return page.callMethod(methodName, ...args)
  }

  async waitForData(key, expectedValue, timeout = 5000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const value = await this.getData(key)
      if (expectedValue === undefined ? value !== undefined : value === expectedValue) {
        return true
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return false
  }
}

module.exports = BasePage
