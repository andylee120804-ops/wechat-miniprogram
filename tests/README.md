# E2E 测试指南

## 前置条件

1. **微信开发者工具** 已安装并登录
2. **微信开发者工具 CLI** 已开启（设置 → 安全 → 服务端口 → 开启）
3. **Node.js** >= 16 已安装

## 安装

```bash
npm install
```

## 运行测试

```bash
# 运行全部 E2E 测试
npm run test:e2e

# 运行单个模块测试
npm run test:e2e:login
npm run test:e2e:home
npm run test:e2e:reservation
npm run test:e2e:purchase
npm run test:e2e:income
```

## 目录结构

```
tests/
├── e2e/
│   ├── pages/              # Page Object Model
│   │   ├── BasePage.js     # 基类：通用操作
│   │   ├── LoginPage.js    # 登录页
│   │   ├── HomePage.js     # 首页
│   │   ├── ReservationPage.js  # 预约页
│   │   ├── PurchasePage.js     # 采购页
│   │   └── IncomePage.js       # 收入页
│   ├── login.spec.js       # 登录测试
│   ├── home.spec.js        # 首页测试
│   ├── reservation.spec.js # 预约测试
│   ├── purchase.spec.js    # 采购测试
│   └── income.spec.js      # 收入测试
├── fixtures/
│   ├── setup.js            # 小程序启动/关闭
│   └── test-data.js        # 测试账号和常量
└── README.md
```

## CLI 路径配置

`tests/fixtures/setup.js` 中的 `getDevToolsCliPath()` 会自动检测平台：

| 平台 | 默认路径 |
|------|----------|
| Windows | `C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat` |
| macOS | `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` |
| Linux | `/opt/wechatwebdevtools/cli` |

如果你的安装路径不同，修改 `getDevToolsCliPath()` 即可。

## 测试账号

在 `tests/fixtures/test-data.js` 中配置：

```javascript
const TEST_ACCOUNTS = {
  boss: { wechatId: 'boss_test', phone: '13800000001' },
  admin: { wechatId: 'admin_test', phone: '13800000002' },
  // ...
}
```

**注意**：测试账号需在云数据库 `staff` 集合中预先创建。

## 编写新测试

1. 在 `tests/e2e/pages/` 创建 Page Object（继承 `BasePage`）
2. 在 `tests/e2e/` 创建 `.spec.js` 测试文件
3. 使用 `launchApp()` / `closeApp()` 管理小程序生命周期

### Page Object 示例

```javascript
const BasePage = require('./BasePage')

class MyPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'my-page/index')  // 页面路径
  }

  async getMyData() {
    return this.getData('myDataKey')
  }

  async tapMyButton() {
    await this.callMethod('onMyButtonTap')
  }
}
```

### 测试用例示例

```javascript
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const { launchApp, closeApp } = require('../fixtures/setup')
const MyPage = require('./pages/MyPage')

describe('My Page', () => {
  let miniProgram
  let myPage

  beforeAll(async () => {
    miniProgram = await launchApp()
    myPage = new MyPage(miniProgram)
  })

  afterAll(async () => {
    await closeApp()
  })

  test('should load page', async () => {
    await myPage.open()
    const data = await myPage.getMyData()
    expect(data).toBeDefined()
  })
})
```

## 常见问题

### CLI 连接失败

确保微信开发者工具已开启服务端口：设置 → 安全 → 服务端口 → 开启

### 小程序启动超时

首次启动需要编译，可能需要 30-60 秒。`testTimeout` 已设为 60 秒。

### 云函数调用失败

测试环境使用真实的云环境 `cloud1-d9gwvttcr864f8021`，确保云函数已部署。

### 测试数据残留

E2E 测试可能创建测试数据，建议使用测试专用账号，定期清理。
