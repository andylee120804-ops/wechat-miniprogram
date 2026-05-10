# 预约分享模板样式设计

## 1. 概述

**功能目标**：在分享预约信息给客人前，允许员工选择不同的模板风格，客人打开分享页面时看到对应风格的设计。

**模板数量**：2 个（商务 / 友情）

---

## 2. 视觉规范

### 2.1 商务风格

| 元素 | 规范 |
|------|------|
| 背景渐变 | `#F5F6F8` → `#EBECF0`（浅灰） |
| 头部背景 | `linear-gradient(135deg, #1C2433 0%, #2a3244 100%)`（深蓝灰） |
| 标题颜色 | `#C9A96E`（香槟金） |
| 关闭按钮 | 圆形深蓝灰底 `#1C2433`，图标香槟金 |
| 导航按钮 | 深蓝灰底，香槟金字 |
| 头部 Emoji | 🏛️ |
| 字段 Emoji | 📋 ⌚ 🏠 👔 |
| 分割线 | `rgba(201,169,110,0.3)` 半透明香槟金 |

### 2.2 友情风格

| 元素 | 规范 |
|------|------|
| 背景渐变 | `#F0F8FF` → `#E3F0FA`（浅蓝） |
| 头部背景 | `linear-gradient(135deg, #4A90D9 0%, #5BA0E8 100%)`（天蓝） |
| 标题颜色 | `#4A90D9`（蓝色） |
| 关闭按钮 | 圆形浅蓝底 `#E8F4FD`，图标蓝色 |
| 导航按钮 | 浅蓝底，蓝色字 |
| 头部 Emoji | 🍻 🤗 |
| 字段 Emoji | 📆 🌙 🏠 🥂 |
| 分割线 | `rgba(74,144,217,0.3)` 半透明蓝 |

---

## 3. 字段映射

| 字段 | 商务 Emoji | 友情 Emoji |
|------|-----------|------------|
| 日期 | 📋 | 📆 |
| 时段 | ⌚ | 🌙 |
| 包厢 | 🏠 | 🏠 |
| 人数 | 👔 | 🥂 |
| 备注 | 📝 | 📝 |
| 温馨提示 | 💌 | 💌 |

---

## 4. 技术实现

### 4.1 shareConfig 扩展

在 `shareConfig` 对象中新增 `template` 字段：

```js
// reservation-detail/index.js
const shareConfig = {
  shareTitle,     // 分享标题（用户自定义）
  shareAddress,   // 地址（用户编辑）
  shareRemark,    // 温馨提示（用户编辑）
  shareLatitude,  // 纬度
  shareLongitude, // 经度
  template: 'business' | 'friend'  // 新增
}
```

### 4.2 模板选择 UI

在 reservation-detail 的分享弹窗中新增模板选择器：

- 两个卡片并排，实时预览
- 默认选中当前模板（无则以 `business` 替代）
- 选中后高亮边框 + 阴影

### 4.3 reservation-share 样式切换

```js
// index.wxss
/* 商务样式 */
.business .page { background: linear-gradient(180deg, #F5F6F8 0%, #EBECF0 100%); }
.business .venue-header { background: linear-gradient(135deg, #1C2433 0%, #2a3244 100%); }
.business .close-btn { background: #1C2433; }
.business .close-icon { color: #C9A96E; }
.business .title-text { color: #C9A96E; }
.business .address-action { background: #1C2433; }
.business .address-copy { color: #C9A96E; }

/* 友情样式 */
.friend .page { background: linear-gradient(180deg, #F0F8FF 0%, #E3F0FA 100%); }
.friend .venue-header { background: linear-gradient(135deg, #4A90D9 0%, #5BA0E8 100%); }
.friend .close-btn { background: #E8F4FD; }
.friend .close-icon { color: #4A90D9; }
.friend .title-text { color: #4A90D9; }
.friend .address-action { background: #E8F4FD; }
.friend .address-copy { color: #4A90D9; }
```

```js
// index.wxss - 字段 Emoji 映射
.business .label-icon:nth-child(1) { }  // 📋
.business .label-icon:nth-child(2) { }  // ⌚
.business .label-icon:nth-child(3) { }  // 🏠
.business .label-icon:nth-child(4) { }  // 👔

.friend .label-icon:nth-child(1) { }  // 📆
.friend .label-icon:nth-child(2) { }  // 🌙
.friend .label-icon:nth-child(3) { }  // 🏠
.friend .label-icon:nth-child(4) { }  // 🥂
```

> **注意**：WXML 中 Emoji 无法通过 CSS 切换，需在 JS 层根据 `template` 字段动态设置字段图标数组。

### 4.4 页面结构

```
reservation-share/index.wxml
├── view.page (动态 class: "page {{templateClass}}")
│   ├── top-bar
│   │   └── close-btn
│   ├── top-band
│   ├── card
│   │   ├── venue-header (头部 Emoji 动态)
│   │   ├── title-banner
│   │   └── detail-list (字段图标动态数组)
│   ├── address-card
│   ├── map-card
│   └── footer
```

---

## 5. 实现文件

| 文件 | 改动 |
|------|------|
| `miniprogram/pages/reservation-detail/index.js` | 新增模板选择弹窗 UI |
| `miniprogram/pages/reservation-share/index.wxml` | 模板 class 绑定 + 动态字段图标 |
| `miniprogram/pages/reservation-share/index.wxss` | 新增 business/friend 样式 |
| `miniprogram/pages/reservation-share/index.js` | 加载模板字段映射配置 |

---

## 6. 交互流程

```
员工进入预约详情页
    ↓
点击「分享给客人」
    ↓
弹出分享弹窗 → 顶部显示模板选择器（两个卡片）
    ↓
选择模板（business / friend）
    ↓
点击「保存并分享」
    ↓
shareConfig 写入数据库 + 调用 onShareAppMessage
    ↓
客人打开分享页 → 根据 template 字段加载对应样式
```

---

## 7. 设计预览

见 `docs/superpowers/specs/template-preview.html`