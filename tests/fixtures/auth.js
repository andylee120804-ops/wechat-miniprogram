const LoginPage = require('../e2e/pages/LoginPage')

/**
 * Login as a specific wechatId and wait for the login flow to complete.
 * Clears previous session before logging in to prevent session leakage.
 * @param {object} miniProgram - The miniProgram automator instance
 * @param {string} wechatId - The wechatId to login with
 * @param {object} [options] - Optional config
 * @param {number} [options.maxWait=20000] - Max ms to wait for login to complete
 */
async function loginAs(miniProgram, wechatId, options = {}) {
  const maxWait = options.maxWait || 20000

  // Step 1: Clear previous session via evaluate (runs in miniProgram context)
  // This clears globalData.userInfo, globalData.permissions, and Storage
  try {
    await miniProgram.evaluate(function () {
      var app = getApp()
      if (app && app.logout) app.logout()
    })
  } catch (e) {
    // Ignore if evaluate fails
  }
  await new Promise(r => setTimeout(r, 300))

  // Step 2: Re-launch to login page and get a fresh page reference
  // reLaunch destroys all pages, so we must get a new reference
  const page = await miniProgram.reLaunch('/pages/login/index')
  await new Promise(r => setTimeout(r, 1000))

  // Step 3: Set wechatId and tap login on the fresh page
  await page.setData({ wechatId: wechatId })
  await new Promise(r => setTimeout(r, 200))
  await page.callMethod('onLogin')

  // Step 4: Wait for login to complete (loading becomes false)
  const start = Date.now()
  let loading = true
  while (loading && Date.now() - start < maxWait) {
    const data = await page.data()
    loading = data.loading
    if (!loading) break
    await new Promise(r => setTimeout(r, 500))
  }

  // Step 5: Wait for switchTab navigation and globalData to settle
  await new Promise(r => setTimeout(r, 2000))
}

/**
 * Logout by calling app.logout() via evaluate.
 */
async function logout(miniProgram) {
  try {
    await miniProgram.evaluate(function () {
      var app = getApp()
      if (app && app.logout) app.logout()
    })
  } catch (e) {
    // Ignore if evaluate fails
  }
  await new Promise(r => setTimeout(r, 500))
}

module.exports = { loginAs, logout }
