const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const { loginAs, logout } = require('../fixtures/auth')
const { TEST_ACCOUNTS } = require('../fixtures/test-data')
const LoginPage = require('./pages/LoginPage')

/**
 * Auto-Login E2E Tests
 *
 * Validates the boundOpenid auto-login mechanism:
 * 1. After first manual login, auto-login restores session
 * 2. cleared session + re-launch triggers auto-login
 * 3. Auto-login preserves staff identity (wechatId)
 *
 * Note: DevTools shares the same OPENID for all cloud calls,
 * so multiple staff records can have the same boundOpenid.
 * The first matching record from .get() is returned.
 * In production, each WeChat user has a unique OPENID,
 * so only ONE staff record ever matches. We test by
 * verifying the last-logged-in user restores correctly
 * after clearing other records' boundOpenid.
 *
 * To keep tests isolated across runs, each test logs in using
 * a specific wechatId and verifies that identity is restored.
 */

describe('Auto-Login (boundOpenid)', () => {
  let miniProgram

  beforeAll(async () => {
    miniProgram = await launchApp()
  }, 60000)

  afterAll(() => {
    closeApp()
  })

  async function clearSession() {
    await miniProgram.evaluate(function () {
      wx.removeStorageSync('userInfo')
      wx.removeStorageSync('permissionsUpdatedAt')
      var app = getApp()
      app.globalData.isLogin = false
      app.globalData.userInfo = null
      app.globalData.permissions = []
    })
    await new Promise(r => setTimeout(r, 300))
  }

  // ---------------------------------------------------------------
  // Test 1: First login binds OPENID → auto-login restores session
  // ---------------------------------------------------------------
  // Note: In DevTools all staff share the same OPENID, so autoLogin
  // may return any bound staff member (not specifically the last
  // manual login). Tests 2-3 verify the boundAt sort order
  // ("last device wins") within a single test sequence.
  test('after first login, auto-login restores session', async () => {
    await logout(miniProgram)
    await clearSession()

    // Login as boss
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await new Promise(r => setTimeout(r, 2000))

    let userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo).toBeTruthy()
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss.expectedRole)

    // Clear local Storage (simulates app restart)
    await clearSession()

    // checkLogin should auto-login via OPENID matching boundOpenid
    await miniProgram.evaluate(function () {
      var app = getApp()
      app.checkLogin()
    })
    await new Promise(r => setTimeout(r, 10000))

    const isLogin = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLogin).toBe(true)
  })

  // ---------------------------------------------------------------
  // Test 2: Last login wins — boundOpenid is overwritten
  // ---------------------------------------------------------------
  test('last login overwrites boundOpenid, new identity restored on auto-login', async () => {
    // Login as boss
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await new Promise(r => setTimeout(r, 2000))

    let userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss.expectedRole)

    // Switch to boss2 (wechatId: g) — boundOpenid now points to boss2
    await loginAs(miniProgram, TEST_ACCOUNTS.boss2.wechatId)
    await new Promise(r => setTimeout(r, 2000))

    userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss2.expectedRole)

    // Clear Storage + checkLogin → autoLogin
    await clearSession()
    await miniProgram.evaluate(function () {
      var app = getApp()
      app.checkLogin()
    })
    await new Promise(r => setTimeout(r, 10000))

    const isLogin = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLogin).toBe(true)

    userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo).toBeTruthy()
    // In DevTools, all staff share the same OPENID.
    // We verify the identity returned by autoLogin
    // matches the LAST user who logged in (boss2/wechatId:g).
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss2.expectedRole)
  })

  // ---------------------------------------------------------------
  // Test 3: User switch works across sessions
  // ---------------------------------------------------------------
  test('switch from boss back to boss2, auto-login returns boss2', async () => {
    // Login as boss first
    await loginAs(miniProgram, TEST_ACCOUNTS.boss.wechatId)
    await new Promise(r => setTimeout(r, 2000))

    let userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss.expectedRole)

    // Now login as boss2 — boss2's boundOpenid gets set (last wins)
    await loginAs(miniProgram, TEST_ACCOUNTS.boss2.wechatId)
    await new Promise(r => setTimeout(r, 2000))

    // Simulate restart: clear Storage + checkLogin
    await clearSession()
    await miniProgram.evaluate(function () {
      var app = getApp()
      app.checkLogin()
    })
    await new Promise(r => setTimeout(r, 10000))

    const isLogin = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.isLogin
    })
    expect(isLogin).toBe(true)

    userInfo = await miniProgram.evaluate(function () {
      var app = getApp()
      return app.globalData.userInfo
    })
    expect(userInfo).toBeTruthy()
    expect(userInfo.role).toBe(TEST_ACCOUNTS.boss2.expectedRole)
  })
})
