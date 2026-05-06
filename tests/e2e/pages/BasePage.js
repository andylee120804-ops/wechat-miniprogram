class BasePage {
  constructor(miniProgram, pagePath) {
    this.miniProgram = miniProgram
    this.pagePath = pagePath
    this.page = null
  }

  async open() {
    this.page = await this.miniProgram.reLaunch(`/pages/${this.pagePath}`)
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

  // --- Element-level helpers ---

  async getElement(selector) {
    const page = this.page || await this.miniProgram.currentPage()
    return page.$(selector)
  }

  async getElementText(selector) {
    const el = await this.getElement(selector)
    if (!el) return null
    return el.text()
  }

  async getElementWxml(selector) {
    const el = await this.getElement(selector)
    if (!el) return null
    return el.wxml()
  }

  async getElementProperty(selector, prop) {
    const el = await this.getElement(selector)
    if (!el) return null
    return el.property(prop)
  }

  async tapElement(selector) {
    const el = await this.getElement(selector)
    if (el) await el.tap()
  }

  async inputTextField(selector, text) {
    const el = await this.getElement(selector)
    if (el) await el.input(text)
  }

  async screenshot(path) {
    const page = this.page || await this.miniProgram.currentPage()
    return page.screenshot({ path })
  }

  async elementScreenshot(selector, path) {
    const el = await this.getElement(selector)
    if (el) return el.screenshot({ path })
  }
}

module.exports = BasePage
