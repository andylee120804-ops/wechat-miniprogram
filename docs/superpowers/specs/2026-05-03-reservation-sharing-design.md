# 预约分享功能设计文档

## 概述

预约创建后，员工可将预定信息通过微信分享给客人（外部用餐人）。客人通过分享卡片打开专属页面查看预定详情和会所地址。

## 模块设计

### 模块 1：会所地址管理

**数据存储**：使用现有 `settings` 集合，key-value 方式

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `venue_name` | string | 听澜轩 | 会所名称 |
| `venue_address` | string | — | 会所地址，可编辑 |

**管理页面**：新增 `admin/venue-settings/` 页面
- 入口：管理后台 → 设置（新增导航项）
- 权限：仅 `boss` / `admin` 角色可见和操作
- 表单：会所名称 + 会所地址两个输入框
- 校验：两个字段均不能为空
- 保存：通过云函数 `sendMessage.getSettings` / `sendMessage.updateSettings` 操作

**云函数**：`sendMessage` 新增两个 action
- `getSettings` — 查询 `settings` 集合中 `key === 'venue_info'` 的文档，返回 `{ venueName, venueAddress }`。若无数据则返回空字符串
- `updateSettings` — 更新/插入 `{ key: 'venue_info', venueName, venueAddress }` 到 `settings` 集合。服务端校验请求者角色为 boss/admin，否则拒绝

### 模块 2：预约详情页分享按钮

**页面**：[miniprogram/pages/reservation-detail/](miniprogram/pages/reservation-detail/)

**UI 变更**：
- 底部新增「分享给客人」按钮（位于现有「修改」按钮旁）
- 权限：仅 `reservation.edit` 权限员工可见
- 点击行为：弹出自定义弹窗，包含：
  - 可编辑的分享标题输入框（默认值「{venue_name} · 预约信息」）
  - 「分享到微信」按钮
  - 取消按钮
- 点击「分享到微信」→ 触发 `wx.shareAppMessage`（通过 `onShareAppMessage` 实现）

**分享卡片（微信聊天中显示）**：
- 标题：员工在弹窗中输入的自定义标题
- path：`/pages/reservation-share/index?id={reservationId}`
- 图片：小程序默认图标或预约相关图片

### 模块 3：客人分享落地页

**新建页面**：`reservation-share/index`（不在 tabBar 中，纯展示页）

**URL 参数**：`id` — 预约记录的 `_id`

**页面布局**（从上到下）：
1. 顶部区域：会所名称（大号字）+ 简约装饰分隔线
2. 客户信息：姓名、电话
3. 预定详情卡片：
   - 日期
   - 时段（中午/晚上）
   - 包厢名称
   - 人数
   - 备注
4. 底部区域：会所地址（来自 `settings`）
5. 页脚：灰色小字「本信息由听澜轩提供」

**样式特点**：
- 纯展示，无任何操作按钮
- 卡片风格，适合在手机上阅读
- 加载状态显示 loading
- 预约不存在或数据异常时显示友好提示页

**数据获取**：
- 通过 `db.getDoc(COLLECTIONS.RESERVATION, id)` 读取预约数据
- 通过 `db.getDoc(COLLECTIONS.SETTINGS, 'venue_info')` 或云函数读取会所信息

## 技术细节

### 新增文件
- `miniprogram/pages/reservation-share/index.js`
- `miniprogram/pages/reservation-share/index.wxml`
- `miniprogram/pages/reservation-share/index.wxss`
- `miniprogram/pages/admin/venue-settings/index.js`
- `miniprogram/pages/admin/venue-settings/index.wxml`
- `miniprogram/pages/admin/venue-settings/index.wxss`

### 修改文件
- `cloudfunctions/sendMessage/index.js` — 新增 getSettings / updateSettings action
- `miniprogram/pages/reservation-detail/index.js` — 添加分享弹窗逻辑 + onShareAppMessage
- `miniprogram/pages/reservation-detail/index.wxml` — 添加分享按钮 + 自定义弹窗
- `miniprogram/utils/db.js` — 如有需要更新 COLLECTIONS（无需，SETTINGS 已存在）
- `app.json` — 注册新增页面路径

### 权限控制
- 分享按钮：`reservation.edit` 权限
- 会所设置页面：`boss` / `admin` 角色

### 数据流
```
新增预约 → 点击「分享给客人」→ 输入标题 → 选择微信聊天发送
                                           ↓
                                  客人点击卡片进入落地页
                                           ↓
                              fetch 预约数据 + 会所信息 → 展示
```

## 不包含的范围（YAGNI）
- 不发送微信订阅消息
- 不支持短信通知
- 不记录分享历史（可通过 operation_log 补充）
- 不支持多门店地址
- 不生成图片分享
- 预约页面不做编辑/删除操作
