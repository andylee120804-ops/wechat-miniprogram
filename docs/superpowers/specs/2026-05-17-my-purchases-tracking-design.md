# 我的采购申请查询页面 — 设计文档

## 概述

在「我的」页面待办分组中新增「我的采购申请」入口，点击进入独立页面查看当前用户提交的所有采购记录及其审批状态分布。支持按状态筛选。

## 变更范围

### 新增文件
- `miniprogram/pages/my-purchases/index.js` — 页面逻辑
- `miniprogram/pages/my-purchases/index.wxml` — 页面模板
- `miniprogram/pages/my-purchases/index.wxss` — 页面样式
- `miniprogram/pages/my-purchases/index.json` — 页面配置

### 修改文件
- `miniprogram/pages/me/index.js` — 新增入口项和路由
- `miniprogram/pages/me/index.wxml` — 无变化（已有待办分组模板）

## 数据流

```
onShow()
  ↓
db.queryAll(COLLECTIONS.PURCHASE, { purchaseBy: currentUserId })
  ↓
按 status 字段分组计数 → 4个状态卡片数据
  ↓
default: activeStatus = '' (显示全部)
  ↓
点击卡片 → setData({ activeStatus }) → client-side filter 切换列表
```

查询使用 `db.queryAll()` 绕过云数据库 100 条限制，所有数据加载到客户端后做过滤，切换状态无网络延迟。

## 页面设计

```
┌──────────────────────────────┐
│  ← 我的采购                  │  自定义导航栏
├──────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│ │待审批 │ │未付款 │ │已完成 │ │已拒绝 │ │  4个紧凑状态卡片，2x2布局
│ │  3   │ │  2   │ │  8   │ │  1   │ │  点击过滤下方列表
│ └──────┘ └──────┘ └──────┘ └──────┘ │  默认选中全部(全部不高亮)
├──────────────────────────────┤
│ 待审批 (3)                    │  当前筛选状态的标签和计数
├──────────────────────────────┤
│ 五花肉 5斤         -¥380   │
│ 肉类 · 2026/05/17           │  采购列表项，点击跳转到 purchase-detail
├──────────────────────────────┤
│ 大虾 3斤           -¥560   │
│ 海鲜 · 2026/05/16           │
├──────────────────────────────┤
│ 暂无更多记录                  │  空状态提示
└──────────────────────────────┘
```

### 状态卡片映射

| 状态值 | 标签 | 颜色 | 说明 |
|--------|------|------|------|
| `pending` | 待审批 | `#FBBF24` (琥珀) | 已提交，等待审批人通过 |
| `approved` | 未付款 | `#3B82F6` (蓝) | 已审批通过，等待付款 |
| `reimbursed` | 已完成 | `#4ADE80` (绿) | 已付款完成 |
| `rejected` | 已拒绝 | `#F87171` (红) | 被审批人拒绝 |

## 用户交互

1. **页面加载** — 显示 skeleton 动画（同 todo 页 3 个占位块），加载完成后渲染卡片列表
2. **点击状态卡片** — 切换 `activeStatus`，列表立即过滤（无网络请求）
3. **点击采购项** — `wx.navigateTo` 到采购详情页
4. **返回** — 点击导航栏 ← 按钮

## 边界状态

| 场景 | 表现 |
|------|------|
| 用户从未提交过采购 | 不显示卡片，显示「没有申请记录」空状态 |
| 某一状态无记录 | 对应卡片显示 0，列表过滤后显示「暂无此类状态的采购记录」 |
| 加载失败 | `handleCloudError(err, '加载采购记录')` + toast |
| 所有记录 0 | 空状态「没有申请记录」 |

## 「我的」页面变更

### me/index.js 修改

在 `buildMenuGroups()` 的待办分组中增加条件判断和入口项：

- **可见条件**：`hasPermission('purchase', ACTIONS.ADD)` — 有采购权限的角色才能看到入口
- **菜单项**：`{ key: 'myPurchases', icon: '📦', text: '我的采购申请' }`
- **路由**：在 `onMenuTap` 中增加 `myPurchases: '/pages/my-purchases/index'`

### 权限影响分析

所有有 `purchase.add` 权限的角色（boss、admin、purchase 角色等）均可见此入口。无采购权限的角色（chef、waiter）不显示。

## 数据安全

- 仅查询 `purchaseBy === currentUserId` 的记录（当前用户本人提交的采购）
- 不访问其他用户的数据

## 无修改文件

不修改 `todo/index.js`、`todo/index.wxml`、`purchase/index.js`、`purchase-detail/index.js`。采购审批/付款流程不受影响。
