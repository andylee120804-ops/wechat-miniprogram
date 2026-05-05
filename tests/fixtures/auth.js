const LoginPage = require('../e2e/pages/LoginPage')

/**
 * Login as a specific wechatId and wait for the login flow to complete.
 * Shared across all test specs to avoid duplication.
 * @param {object} miniProgram - The miniProgram automator instance
 * @param {string} wechatId - The wechatId to login with
 * @param {object} [options] - Optional config
 * @param {number} [options.maxWait=15000] - Max ms to wait for login to complete
 */
async function loginAs(miniProgram, wechatId, options = {}) {
  const maxWait = options.maxWait || 15000
  const loginPage = new LoginPage(miniProgram)
  await loginPage.open()
  await loginPage.setData({ wechatId })
  await loginPage.tapLogin()

  const start = Date.now()
  let loading = true
  while (loading && Date.now() - start < maxWait) {
    loading = await loginPage.getData('loading')
    if (!loading) break
    await new Promise(r => setTimeout(r, 500))
  }
  await new Promise(r => setTimeout(r, 1500))
}

/**
 * Logout by navigating to the me page and clearing globalData.
 */
async function logout(miniProgram) {
  const page = await miniProgram.reLaunch('/pages/me/index')
  await new Promise(r => setTimeout(r, 1000))
  // Clear user session via app method
  const app = await miniProgram.callMethod('clearSession')
  await new Promise(r => setTimeout(r, 500))
}

module.exports = { loginAs, logout }
