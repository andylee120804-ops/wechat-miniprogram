# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

听澜轩进阶版小程序 — 基于微信云开发的私人会所管理系统（AppID: `wx0937941245b3c0be`，云环境: `cloud1-d9gwvttcr864f8021`），位于 `C:\Users\Andy\miniprograme\`。

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
| `theme.js` | 主题系统，4套主题（ink-gold/cloud-pearl/neon-night/zen-mist） | `getCurrentThemeId()`、`getThemePageData(themeId)`、`THEMES` |

### 主题系统
- 入口：`app.js` 的 `loadTheme()` / `applyTheme()` / `setTheme()`
- 页面通过 `app.getThemePageData()` 获取当前主题色值对象
- 主题对象结构：`{ surface, cardBg, textPrimary, textSecondary, accentColor, amountPositive, amountNegative, tags, roleTags, ... }`

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

### 权限模型
- 5角色：`boss` / `admin` / `purchase` / `chef` / `waiter`
- boss 绕过所有权限检查
- 其他角色通过 `hasPermission(module, ACTIONS.VIEW/ADD/EDIT/DELETE)` 检查
- **注意**：权限系统同时存在于 `app.hasPermission()`（app.js）和 `utils/permission.js` 导出的 `hasPermission()`，两者逻辑一致，引用统一的 `ACTIONS` 常量

### 云函数（6个）
- `login` — 微信ID登录认证
- `getPermissions` — 加载员工权限
- `checkReservation` — 预约冲突检测
- `sendMessage` — 公告CRUD + 已读标记
- `generateReport` — 报表数据聚合
- `getInsights` — 经营洞察（绕过100条限制）

## 页面结构

- **TabBar页面**（5个）：首页 `/pages/index/`、预约 `/pages/reservation/`、采购 `/pages/purchase/`、收入 `/pages/income/`、我的 `/pages/me/`
- **功能页面**：预约(新增/详情)、采购(新增/详情)、收入(新增/详情)、打卡 `/pages/clockin/`
- **管理后台**：仪表盘 `/pages/admin/dashboard/`、员工 `/pages/admin/staff/`、支出 `/pages/admin/expense/`、日志 `/pages/admin/logs/`、出勤 `/pages/admin/attendance/`
- **新增功能**：全局搜索 `/pages/search/`、客户管理 `/pages/customer/`、经营洞察 `/pages/insights/`、公告 `/pages/announcements/`

## 组件清单

- **新增9个**：`glass-card`、`stat-card`、`search-bar`、`filter-chips`、`empty-state`、`calendar`、`skeleton`、`swipe-action`、`notification-bar`、`tab-bar`
- **增强8个**：`theme-card`(glass模式)、`theme-btn`(加载+触感)、`theme-badge`(category/expense类型)、`theme-form-item`、`theme-modal`(底部抽屉)、`theme-switcher`、`ucharts`、`tab-bar`

## 已知架构约束

1. **云数据库100条限制**：列表页统一用 `db.queryAll()` 或 `db.queryPage()`，禁止直接 `.get()` 后遍历
2. **集合名单一**：所有 `db.collection('xxx')` 必须引用 `COLLECTIONS.XXX`，不得硬编码字符串
3. **theme-badge 支持类型**：目前支持 `status`、`role`、`category`、`expense`，新增类型需在 observer 中补充颜色映射
4. **logger双写**：写日志同时写入 `operation_log` 云集合和本地Storage，`getRecentLogs()` 优先读云端、失败时回退本地
5. **dashboard支出统计**：同时读取 `expense` 和 `fixed_expense` 两集合合并计算总支出
6. **全局statusBarHeight**：`app.js onLaunch` 已注入 `globalData.statusBarHeight`，各页面无需重复获取
7. **permission action 常量**：统一用 `ACTIONS.VIEW` / `ACTIONS.ADD` / `ACTIONS.EDIT` / `ACTIONS.DELETE`，不得用字符串 `'view'` / `'read'` 等

## 实施计划位置

详细实施计划保存在：`C:\Users\Andy\.claude\plans\sharded-nibbling-dragon.md`
