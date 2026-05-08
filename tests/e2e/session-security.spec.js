const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs, logout } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')

/**
 * Session Security E2E Tests
 *
 * Validates the fix for the authentication bypass vulnerability:
 * After boss logs in on a device, another user opening the mini program
 * via a shared link should NOT inherit the boss session from Storage.
 *
 * The fix: checkLogin() now calls verifySession cloud function to validate
 * that the current OPENID matches the stored userInfo._id.
 * If mismatched, the session is cleared and user is redirected to login.
 */

describe('Session Security - Auth Bypass Prevention', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(() => {
    closeApp()
  })

  // ---------------------------------------------------------------
  // Test 1: Logout clears session — re-opening shows login page
  // ---------------------------------------------------------------
  test('after logout, app should require login again', async () => {
    // Login as boss
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)

    // Verify logged in
    const isLoggedIn = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLoggedIn).toBe(true)

    // Logout
    await logout(miniProgram)

    // Verify logged out
    const isStillLoggedIn = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isStillLoggedIn).toBe(false)

    // Verify userInfo is cleared from Storage
    const storageCleared = await miniProgram.evaluate(function () {
      return wx.getStorageSync('userInfo')
    })
    expect(storageCleared).toBeFalsy()

    // Re-launch to login page — should stay on login (not auto-navigate away)
    const loginPage = new LoginPage(miniProgram)
    await loginPage.open()
    await new Promise(r => setTimeout(r, 2000))

    const current = await miniProgram.currentPage()
    expect(current.path).toContain('login')
  })

  // ---------------------------------------------------------------
  // Test 2: Injecting a non-existent staffId into Storage
  //         triggers verifySession and clears the fake session
  // ---------------------------------------------------------------
  test('tampered Storage userInfo should be cleared after verifySession', async () => {
    // Ensure logged out first
    await logout(miniProgram)

    // Inject a fake userInfo with a non-existent staffId
    // This simulates: old session data from user A left in Storage,
    // but user B (different OPENID) opens the app.
    // Since no staff record matches both the OPENID and the fake _id,
    // verifySession should detect the mismatch and clear the session.
    const fakeUserInfo = {
      _id: 'FAKE_STAFF_ID_NOT_IN_DB_99999', // ID that won't match any real staff
      name: '伪造用户',
      role: 'boss',
      wechatId: 'fake_wechat_id',
      phone: ''
    }
    await miniProgram.evaluate(function (fakeInfo) {
      wx.setStorageSync('userInfo', fakeInfo)
      // Also set isLogin optimistically to simulate checkLogin's first step
      var app = getApp()
      app.globalData.userInfo = fakeInfo
      app.globalData.isLogin = true
    }, fakeUserInfo)

    // Verify the fake session was set
    const storedBefore = await miniProgram.evaluate(function () {
      return wx.getStorageSync('userInfo')
    })
    expect(storedBefore).toBeTruthy()
    expect(storedBefore._id).toBe('FAKE_STAFF_ID_NOT_IN_DB_99999')

    // Trigger checkLogin manually (simulates app restart reading Storage)
    // reLaunch does NOT re-trigger onLaunch, so we call checkLogin directly
    await miniProgram.evaluate(function () {
      var app = getApp()
      app.checkLogin()
    })
    await new Promise(r => setTimeout(r, 8000)) // Wait for async verifySession to complete

    // Check if session was cleared (verifySession detected mismatch)
    const isLoginAfter = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLoginAfter).toBe(false)

    // Storage should be cleaned up
    const storedAfter = await miniProgram.evaluate(function () {
      return wx.getStorageSync('userInfo')
    })
    expect(storedAfter).toBeFalsy()
  })

  // ---------------------------------------------------------------
  // Test 3: Legitimate session restore works correctly
  // ---------------------------------------------------------------
  test('legitimate login session should persist across re-launch', async () => {
    // Login as boss
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)

    // Verify logged in
    const isLoggedIn = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLoggedIn).toBe(true)

    // Re-launch to home page — checkLogin should restore session
    // In the automator, the OPENID matches (same dev environment),
    // so verifySession should succeed
    await miniProgram.reLaunch('/pages/index/index')
    await new Promise(r => setTimeout(r, 3000))

    const stillLoggedIn = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(stillLoggedIn).toBe(true)

    // userInfo should still have boss role
    const userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo).toBeTruthy()
    expect(userInfo.role).toBe('boss')
  })

  // ---------------------------------------------------------------
  // Test 4: Switching users clears previous identity completely
  // ---------------------------------------------------------------
  test('switching from boss to purchase clears boss identity', async () => {
    // Login as boss
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)

    let userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo.role).toBe('boss')

    // Login as purchase (different user)
    await loginAs(miniProgram, TEST_ACCOUNTS.purchase.wechatId)

    userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo).toBeTruthy()
    // In the automator, the OPENID is always the same (dev tools),
    // so this will be the boss's OPENID — the login by wechatId
    // still works because it's a direct login call, not session restore.
    // The key check: Storage now has the new user's info, not old boss
    const storedInfo = await miniProgram.evaluate(function () {
      return wx.getStorageSync('userInfo')
    })
    expect(storedInfo.wechatId).toBe(TEST_ACCOUNTS.purchase.wechatId)
  })

  // ---------------------------------------------------------------
  // Test 5: _guardAuth redirects to login when not authenticated
  // ---------------------------------------------------------------
  test('_guardAuth should redirect to login page when not authenticated', async () => {
    // Ensure logged out
    await logout(miniProgram)

    // Clear any leftover userInfo from Storage so checkLogin won't restore it
    await miniProgram.evaluate(function () {
      wx.removeStorageSync('userInfo')
      var app = getApp()
      app.globalData.isLogin = false
      app.globalData.userInfo = null
    })

    // Trigger _guardAuth manually (simulates onShow check)
    await miniProgram.evaluate(function () {
      var app = getApp()
      app._guardAuth()
    })
    await new Promise(r => setTimeout(r, 3000))

    // Should be redirected to login page — poll for it
    let path = ''
    for (let i = 0; i < 5; i++) {
      const current = await miniProgram.currentPage()
      path = current.path
      if (path.includes('login')) break
      await new Promise(r => setTimeout(r, 1000))
    }
    expect(path).toContain('login')
  })

  // ---------------------------------------------------------------
  // Test 6: Public pages accessible without login
  // ---------------------------------------------------------------
  test('reservation-share page should be accessible without login', async () => {
    await logout(miniProgram)

    // reservation-share is in _publicPages, should not redirect to login
    await miniProgram.reLaunch('/pages/reservation-share/index')
    await new Promise(r => setTimeout(r, 2000))

    const current = await miniProgram.currentPage()
    expect(current.path).toContain('reservation-share')
  })
})
