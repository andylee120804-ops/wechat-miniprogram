describe('app prefetch data', () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    app = null
    global.App = jest.fn((appDef) => {
      app = appDef
    })

    global.wx = {
      setStorageSync: jest.fn(),
      getStorageSync: jest.fn(() => null),
      removeStorageSync: jest.fn(),
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(),
        database: jest.fn()
      },
      setTabBarStyle: jest.fn(),
      setNavigationBarColor: jest.fn(),
      getWindowInfo: jest.fn(() => ({ statusBarHeight: 44 })),
      getBackgroundFetchData: jest.fn(),
      onBackgroundFetchData: jest.fn()
    }

    jest.doMock('../../miniprogram/utils/theme', () => ({
      getCurrentThemeId: jest.fn(() => 'ink-gold'),
      getThemePageData: jest.fn(() => ({})),
      THEMES: {
        'ink-gold': {
          tabBar: {
            unselectedColor: '#999',
            selectedColor: '#fff',
            bg: '#000',
            borderStyle: 'black'
          },
          navBar: {
            frontColor: '#ffffff',
            bg: '#000000'
          }
        }
      }
    }))

    jest.doMock('../../miniprogram/utils/db', () => ({
      CLOUD_ENV: 'cloud1-d9gwvttcr864f8021',
      COLLECTIONS: { STAFF: 'staff' }
    }))

    require('../../miniprogram/app.js')
  })

  afterEach(() => {
    delete global.App
  })

  test('caches prefetch payload but does not authenticate user or activate permissions', () => {
    const prefetch = {
      user: { _id: 'staff1', role: 'admin' },
      permissions: [{ module: 'dashboard', actions: ['view'] }],
      venueName: '听澜轩'
    }

    app._applyPrefetchData(prefetch)

    expect(app.globalData.prefetchData).toEqual(prefetch)
    expect(app.globalData.userInfo).toBeNull()
    expect(app.globalData.isLogin).toBe(false)
    expect(app.globalData.permissions).toEqual([])
    expect(wx.setStorageSync).not.toHaveBeenCalledWith('userInfo', expect.anything())
    expect(app.globalData.venueName).toBe('听澜轩')
  })

  test('prefetch permissions alone must not become active permissions', () => {
    app._applyPrefetchData({
      permissions: [{ module: 'income', actions: ['view'] }]
    })

    expect(app.globalData.permissions).toEqual([])
    expect(app.globalData.isLogin).toBe(false)
  })
})
