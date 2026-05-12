/**
 * Login as a specific wechatId without using the login page UI.
 * Since the app auto-logs in from cached credentials on launch,
 * we just need to set the userInfo directly via the cloud login function.
 *
 * @param {object} miniProgram - The miniProgram automator instance
 * @param {string} wechatId - The wechatId to login with
 * @param {object} [options] - Optional config
 * @param {number} [options.maxWait=20000] - Max ms to wait for login to complete
 */
async function loginAs(miniProgram, wechatId, options = {}) {
  const maxWait = options.maxWait || 20000

  // Step 1: Logout to clear any existing session
  try {
    await miniProgram.evaluate(function () {
      var app = getApp()
      if (app && app.logout) app.logout()
    })
  } catch (e) {}
  await new Promise(r => setTimeout(r, 300))

  // Step 2: Login via cloud function directly (no login page interaction)
  await miniProgram.evaluate(function (wid) {
    wx.cloud.callFunction({
      name: 'login',
      data: { action: 'loginByWechatId', wechatId: wid },
      success: function (res) {
        if (res.result && res.result.success) {
          var app = getApp()
          app.setUserInfo(res.result.data)
        }
      }
    })
  }, wechatId)

  // Step 3: Wait for login to complete
  const start = Date.now()
  let loggedIn = false
  while (Date.now() - start < maxWait) {
    try {
      loggedIn = await miniProgram.evaluate(function () {
        var app = getApp()
        return app.globalData.isLogin && app.globalData.userInfo !== null
      })
      if (loggedIn) break
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500))
  }

  // Step 4: Wait for state to settle
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
