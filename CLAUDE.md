# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

听澜轩进阶版小程序 — 基于微信云开发的私人会所管理系统（AppID: `wx0937941245b3c0be`，云环境: `cloud1-d9gwvttcr864f8021`），位于 `C:\Users\Andy\miniprograme\`。

从旧版 `club-management` 完全重写UI和架构，累计 **46次提交**，**27个页面**，**17个组件**，**6个云函数**。

## 快速运行

使用微信开发者工具打开 `C:\Users\Andy\miniprograme\` 目录，点击「编译」即可。无需额外构建命令，所有代码为纯微信小程序格式。

## 技术架构

### 云环境
- **微信云开发**：数据库（集合） + 云函数（6个） + 云存储
- 云函数根目录：`cloudfunctions/`
- 小程序根目录：`miniprogram/`

### 核心工具层（`miniprogram/utils/`）

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `db.js` | 数据库抽象层，`COLLECTIONS` 常量定义所有集合名 | `queryAll`(绕过100条限制)、`queryPage`(分页)、`addDoc/getDoc/updateDoc/deleteDoc` |
| `permission.js` | 角色权限检查，`ACTIONS` 定义 view/add/edit/delete | `hasPermission(module, action)`、`checkPermission`(带toast提示) |
| `logger.js` | 操作日志，写入 `operation_log` 集合 + 本地Storage双保险 | `log(type, detail, extra)`、`getRecentLogs()`、`LOG_TYPES` |
| `helpers.js` | 日期/金额格式化、范围计算（周/月/季/年） | `formatDate/Time/Amount`、`getMonthRange(offset)`、`getRoleName`、`isLate` |
| `theme.js` | 主题系统，当前仅用2套主题，others removed | `getCurrentThemeId()`、`getThemePageData(themeId)`、`THEMES` |
| `cache.js` | 本地缓存管理（TTL） | `setCache(key, data, ttl)`、`getCache(key)` |
| `validators.js` | 表单校验工具 | `validateRequired`、`validatePhone`、`validateAmount` |
| `error-handler.js` | 错误统一处理 | `handleError(err, context)` |
| `export.js` | 数据导出工具 | `exportToImage/Csv` |
| `notify.js` | 通知管理 | `sendNotification(type, data)` |
| `chart-config.js` | 图表配置，依赖 `isDark` 主题属性 | `getPieChartOpts`、`getBarChartOpts` |

### 主题系统
- 入口：`app.js` 的 `loadTheme()` / `applyTheme()` / `setTheme()`
- 页面通过 `app.getThemePageData()` 获取当前主题色值对象
- 主题对象结构：`{ surface, cardBg, textPrimary, textSecondary, accentColor, amountPositive, amountNegative, tags, roleTags, ... }`
- **注意**：原设计4主题（墨金/云白/霓虹/禅雾），后移除3个非墨金主题及主题切换器，当前仅墨金可用

### 数据集合（统一用 `COLLECTIONS` 常量）
- `staff` — 员工
- `reservation` — 预约
- `purchases` — 采购（注意复数）
- `income` — 收入
- `expense` — 流动支出（dashboard 统计用）
- `fixed_expense` — 固定支出（admin/expense 页面用）
- `clockin` — 打卡记录
- `operation_log` — 操作日志（云端）
- `announcement` — 公告
- `notification_log` — 通知记录
- `settings` — 最低消费等设置（后新增）

### 权限模型
- 5角色：`boss` / `admin` / `purchase` / `chef` / `waiter`
- boss 绕过所有权限检查
- 其他角色通过 `hasPermission(module, ACTIONS.VIEW/ADD/EDIT/DELETE)` 检查
- **注意**：权限系统同时存在于 `app.hasPermission()`（app.js）和 `utils/permission.js` 导出的 `hasPermission()`，两者逻辑一致，引用统一的 `ACTIONS` 常量

### 云函数（6个）
- `login` — 微信ID登录认证
- `getPermissions` — 加载员工权限
- `checkReservation` — 预约冲突检测（支持四态包场）
- `sendMessage` — 公告CRUD + 已读标记
- `generateReport` — 报表数据聚合
- `getInsights` — 经营洞察（绕过100条限制）

## 完整功能清单

### 核心模块（12个）
| 模块 | 说明 | 状态 |
|------|------|------|
| 登录 | 微信ID登录 + 云函数认证 + 权限加载 + 强制重登 | ✅ 已完成 |
| 首页 | 今日预约/收入/采购汇总 + 快捷操作 + 紧急公告红点 | ✅ 已完成 |
| 预约管理 | 日历视图 + CRUD + 四态包场(不/午/晚/全体) + 冲突检测 | ✅ 已增强 |
| 采购管理 | 月度列表 + 9类筛选(肉/海鲜/蔬/果/酒水/调料/用品/设备/其他) | ✅ 已完成 |
| 收入管理 | 月度列表 + 6类 + 关联预约 + 最低消费软校验 | ✅ 已增强 |
| 打卡考勤 | 上下班打卡 + GPS + 补打卡模式 + 迟到检测 | ✅ 已增强 |
| 经营报表 | 净利润中心 + 收入/支出环形图 + 周/月/季/年切换 | ✅ 已完成 |
| 员工管理 | 5角色CRUD + 5模块细粒度权限 + 软删除 | ✅ 已完成 |
| 支出管理 | 5类(工资/租金/水电/用品/其他) + 弹窗表单 | ✅ 已完成 |
| 操作日志 | 20种日志类型 + 类型+日期筛选 + 详情解析 | ✅ 已完成 |
| 出勤统计 | 月度汇总 + 每人出勤天/工时/迟到 + 日历视图 | ✅ 已完成 |
| 食堂设置 | 全局场所名称/地址/Logo动态化 | ✅ 后新增 |

### 新增功能（6个）
| 功能 | 页面 | 说明 |
|------|------|------|
| 全局搜索 | `pages/search/` | 跨模块搜索预约/收入/采购，近期搜索历史 |
| 客户管理 | `pages/customer/` + `pages/customer-detail/` | 来访次数/总消费/偏好房间/时间线 |
| 经营洞察 | `pages/insights/` | 最忙日/收入趋势/TOP来源/回头客排名 |
| 公告通知 | `pages/announcements/` + `pages/announcement-detail/` | 发布/已读确认/紧急标记/同日导航 |
| 预约分享 | `pages/reservation-share/` | 员工分享预定信息给客人，含地址编辑+地图选点 |
| 最低消费设置 | `pages/min-amount/` | 大包/小包/午包场/晚包场/全体包场最低消费 |

### 设计系统
| 项目 | 说明 |
|------|------|
| 样式工具 | `styles/tokens.js` `themes.js` `animations.js` `mixins.wxss` `bottom-bar.wxss` |
| 布局规范 | Display 56rpx / Title1 44rpx / Title2 36rpx / Body 30rpx / Caption 26rpx |
| 间距系统 | 4/8/12/16/24/32/48/64/96rpx |
| 圆角系统 | 8/12/16/24/32/48/999rpx |
| 动画规范 | 瞬态100ms / 快速200ms / 常规300ms / 慢速500ms |
| 底部栏统一 | `styles/bottom-bar.wxss` 统一所有页面底部操作栏 |

### 组件清单（17个）
- **新增10个**：`glass-card` `stat-card` `search-bar` `filter-chips` `empty-state` `calendar` `skeleton` `swipe-action` `notification-bar` `tab-bar`
- **增强7个**：`theme-card`(glass模式) `theme-btn`(加载+触感) `theme-badge`(category/expense) `theme-form-item` `theme-modal`(底部抽屉) `ucharts` `tab-bar`
- **已移除**：`theme-switcher`（随非墨金主题一起移除）

### 页面结构（27个）
- **TabBar5个**：首页/预约/采购/收入/我的
- **功能页7个**：预约新增/详情/分享、采购新增/详情、收入新增/详情、最低消费设置
- **打卡1个**：`clockin/`
- **新功能5个**：搜索/客户/客户详情/洞察/公告/公告详情
- **管理后台7个**：仪表盘/员工/员工新增/支出/日志/出勤/出勤详情/食堂设置
- **登录1个**：`login/`

### 测试
- **E2E测试框架**：基于 `miniprogram-automator`
- **测试用例**：26个跨角色权限测试

## 已知架构约束

1. **云数据库100条限制**：列表页统一用 `db.queryAll()` 或 `db.queryPage()`，禁止直接 `.get()` 后遍历
2. **集合名单一**：所有 `db.collection('xxx')` 必须引用 `COLLECTIONS.XXX`，不得硬编码字符串
3. **theme-badge 支持类型**：目前支持 `status`、`role`、`category`、`expense`，新增类型需在 observer 中补充颜色映射
4. **logger双写**：写日志同时写入 `operation_log` 云集合和本地Storage，`getRecentLogs()` 优先读云端、失败时回退本地
5. **dashboard支出统计**：同时读取 `expense` 和 `fixed_expense` 两集合合并计算总支出
6. **全局statusBarHeight**：`app.js onLaunch` 已注入 `globalData.statusBarHeight`，各页面无需重复获取
7. **permission action 常量**：统一用 `ACTIONS.VIEW` / `ACTIONS.ADD` / `ACTIONS.EDIT` / `ACTIONS.DELETE`，不得用字符串 `'view'` / `'read'` 等
8. **预约包场兼容**：新数据用 `exclusiveType`(none/noon/night/full)，老数据仍用 `isExclusive` boolean，读取时需兼容回退

## 开发经验与教训

### 架构层面

1. **常量先行，后期改代价大**
   `COLLECTIONS` 和 `ACTIONS` 常量在项目中期才引入，导致前期写的大量硬编码字符串需要全文替换。新项目应在 `db.js` 和 `permission.js` 初始提交时就定义好。

2. **全局注入优于页面重复获取**
   `statusBarHeight` 最初每个页面重复调用 `getSystemInfoSync()`，后期才改为 `app.js` 统一注入。全局通用的信息统一在 `app.js onLaunch` 中获取并存入 `globalData`。

3. **主题系统过度设计**
   原计划4主题 + 切换器，投入了大量精力在设计 token 和多个主题色值。最终实际只用了墨金1个主题，其余被移除。核心功能未经验证前，避免在非核心炫技功能上投入过大。

4. **统一组件优于分散样式**
   底部操作栏统一到 `bottom-bar.wxss` 后，新增页面只需 `@import` + 一个类名，消除了各页面样式不一致和溢出问题。

5. **双写策略有效**
   `logger.js` 的云端+本地Storage双保险，在云函数故障时提供了可靠的降级方案。重要的数据写入应考虑多路径保障。

6. **数据迁移可零成本**
   保持与旧版同一云环境和字段结构，新旧版本可并行运行共享数据。数据库 schema 变更（如 exclusiveType）做向前兼容读取即可。

### 微信小程序特有坑

1. **WXML模板限制**：`{{}}` 内只支持简单三元表达式，不支持函数调用、复杂运算。需要复杂逻辑必须用 WXS 或先在 JS 层算好再 setData
2. **WXS能力有限**：独立作用域，不能 `require` JS 模块，不能调 `wx.*` API
3. **`setData` 每次最大1MB**：列表页不要一次性 setData 整个大数组
4. **`image` 必须设 `mode`**：否则图片拉伸，常用 `widthFix`/`aspectFill`
5. **`scroll-view` 必须指定具体高度**：不能用 `height: 100%` 继承
6. **`fixed` 定位 + 键盘弹出时行为异常**：输入框要避开底部 fixed 元素
7. **页面栈最多10层**：`wx.navigateTo` 超限后无响应，需用 `wx.redirectTo` 或 `wx.navigateBack`
8. **自定义组件样式隔离**：组件内无法继承页面样式，需 `externalClasses` 或 `addGlobalClass`
9. **不支持高级CSS**：没有 `::v-deep`、`:has()`、`:nth-child()`
10. **`background-image` 不支持本地图片**
11. **云函数冷启动**：首次调用或长时间未调用时慢1-3秒

### 曾修复的典型Bug

| Bug | 根因 | 修复 |
|-----|------|------|
| 底部双按钮溢出 | flex布局未设max-width限制 | 加 `flex:1; max-width:50%` |
| 双导航栏叠加 | 新增页缺 `navigationStyle:custom` | json中添加配置 |
| WXML标签错配 | expense页 `</text>`应为`</view>` | 修正闭合标签 |
| 集合名不一致 | `reservations`(复数) vs `reservation`(单数) 混用 | 统一到COLLECTIONS常量 |
| income-detail显示未存字段 | 展示了guestCount等字段但未从预约同步 | 在income-add中同步写入 |
| 权限action名混用 | `'read'` vs `'view'` | 统一到ACTIONS.VIEW |
| theme-badge默认灰 | 只处理了status/role，category/expense无映射 | 补充颜色映射 |
| 食堂保存不同步 | 保存后未更新globalData.venueName | 保存后同步更新 |
| 公告已读按钮不显示 | needsConfirm判断有误 | 修复逻辑，底部固定 |
| 紧急公告无区分 | 已读/未读红点未区分紧急程度 | 加hasUrgentUnread字段 |
| 内容容器偏左 | staff-add固定width:716rpx | 改为自适应 |
| 打卡日期无限制 | 过去日期可正常打卡 | 强制补打卡模式+确认弹窗 |

## 实施计划位置

详细实施计划保存在：`C:\Users\Andy\.claude\plans\sharded-nibbling-dragon.md`
