const BasePage = require('./BasePage')

class LoginPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'login/index')
  }

  async inputWechatId(wechatId) {
    await this.setData({ wechatId })
  }

  async inputPhone(phone) {
    await this.setData({ phone })
  }

  async tapLogin() {
    await this.callMethod('onLogin')
  }

  async login(wechatId, phone) {
    await this.inputWechatId(wechatId)
    if (phone) await this.inputPhone(phone)
    await this.tapLogin()
  }

  async isLoading() {
    return this.getData('loading')
  }

  async isShaking() {
    return this.getData('shakeAnimation')
  }
}

module.exports = LoginPage
