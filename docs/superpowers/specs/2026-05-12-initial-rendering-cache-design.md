# 初始渲染缓存优化设计

## 概述

利用微信小程序「初始渲染缓存（Initial Rendering Cache）」特性，在 app.json 中启用 `static` 模式，让视图层无需等待逻辑层初始化即可展示首帧缓存，消除冷启动白屏。

## 背景

### 问题

冷启动时逻辑层初始化耗时较长（加载小程序代码、初始化页面对象、发送数据给视图层），用户会看到标准载入画面或白屏。当前项目所有页面均使用 `loading: true` 初始状态配合骨架屏/加载动画，但首次渲染仍需等待逻辑层初始化完成。

### 初始渲染缓存原理

启用后，视图层无需等待逻辑层初始化，可直接将页面初始 `data` 的渲染结果从持久化缓存中取出并提前展示给用户。

工作流程：
1. 首次打开页面 → 将初始数据渲染结果写入持久化缓存区域
2. 后续冷启动打开 → 检查缓存 → 有则直接展示
3. 交互延迟 → 缓存展示期间页面不能响应事件，等逻辑层初始化完毕后恢复交互

## 设计

### 改动范围

**一个文件，一行配置** — 在 `app.json` 的 `window` 段中加入：

```json
{
  "window": {
    "initialRenderingCache": "static"
  }
}
```

### 模式选择：`static`

选择 `static` 模式的理由：
- 所有页面初始 `data.loading = true`，正是 `static` 的最佳匹配场景
- 无需任何 JS/WXML 改动
- `dynamic` 模式需在 `onReady` 中调用 `setInitialRenderingCache`，有额外渲染开销
- `capture` 模式需要基础库 3.7.4+ 且收益增量有限

### 影响页面

| 页面 | 初始 data 渲染内容 | 效果 |
|------|-------------------|------|
| 首页 (index) | `<skeleton>` 骨架屏 | 冷启立即见骨架，消除 2-3 秒白屏 |
| 登录页 (login) | `autoLoginLoading: true` 转圈 | 冷启即见「登录中…」状态 |
| 预约列表 (reservation) | `loading: true` + 骨架屏 | 冷启即见加载骨架 |
| 收入列表 (income) | `loading: true` + 骨架屏 | 同上 |
| 采购列表 (purchase) | `loading: true` + 骨架屏 | 同上 |
| 预约分享页 (reservation-share) | `loading: true` + loading-dots | 外部分享页冷启即见加载动画 |
| 其他 21 个功能页 | 各自的初始 loading 状态 | 统一消除白屏 |

### 前提条件

项目已满足的优化前置条件：
- `app.json` 已配置 `"lazyCodeLoading": "requiredComponents"`（按需注入组件）
- 所有页面使用 `custom` 导航栏样式

### 用户交互影响

- 缓存展示期间页面不可交互（无法点击、滚动），但骨架屏/加载状态本身无交互元素
- 逻辑层初始化完成后无缝替换为真实内容
- 缓存可能被基础库更新或存储回收清除，框架自动降级为无缓存

### 安全性

- 仅缓存首帧渲染快照，不含用户敏感数据
- 不涉及网络请求缓存
- 不改变任何业务逻辑

## 实施步骤

1. 在 `miniprogram/app.json` 的 `window` 对象中添加 `"initialRenderingCache": "static"`
2. 验证编译无错误
3. 在微信开发者工具中真机调试，确认冷启动时骨架屏/加载状态立即展示
4. 提交代码

## 参考

- [微信官方文档 - 初始渲染缓存](https://developers.weixin.qq.com/miniprogram/dev/framework/view/initial-rendering-cache.html)
- [首屏渲染优化建议](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeC.html)
