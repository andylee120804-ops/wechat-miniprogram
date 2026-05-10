# 预约分享模板样式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在预约分享功能中新增模板样式选择，支持商务/友情两种风格，客人打开分享页时看到对应设计。

**Architecture:** 通过在 shareConfig 中新增 `template` 字段标识风格，在 reservation-share 页根据该字段动态切换 CSS class。字段 Emoji 通过 JS 层动态数组控制，避免 WXML 模板限制。

**Tech Stack:** 微信小程序 WXML/WXSS/JS，云开发数据库

---

## 文件变更总览

| 文件 | 职责 |
|------|------|
| `miniprogram/pages/reservation-share/index.wxss` | 新增 business/friend 样式 |
| `miniprogram/pages/reservation-share/index.wxml` | 模板 class 绑定 + 动态字段图标渲染 |
| `miniprogram/pages/reservation-share/index.js` | 加载模板字段映射配置 |
| `miniprogram/pages/reservation-detail/index.js` | 分享弹窗中新增模板选择器 |

---

## Task 1: reservation-share 样式扩展

**Files:**
- Modify: `miniprogram/pages/reservation-share/index.wxss`

- [ ] **Step 1: 在 index.wxss 末尾添加 business 和 friend 样式**

在文件末尾添加以下内容：

```wxss
/* ===== 商务风格 ===== */
.business .page {
  background: linear-gradient(180deg, #F5F6F8 0%, #EBECF0 100%);
}
.business .venue-header {
  background: linear-gradient(135deg, #1C2433 0%, #2a3244 100%);
}
.business .top-band {
  background: linear-gradient(90deg, transparent, #C9A96E, transparent);
}
.business .close-btn {
  background: #1C2433;
  box-shadow: 0 2rpx 8rpx rgba(28,36,51,0.3);
}
.business .close-icon {
  color: #C9A96E;
}
.business .title-text {
  color: #C9A96E;
}
.business .detail-item {
  border-bottom-color: #E0E2E6;
}
.business .label-text {
  color: #888;
}
.business .address-action {
  background: #1C2433;
}
.business .address-copy {
  color: #C9A96E;
}
.business .footer-divider {
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.3), transparent);
}
.business .footer-text {
  color: #CCC5B5;
}

/* ===== 友情风格 ===== */
.friend .page {
  background: linear-gradient(180deg, #F0F8FF 0%, #E3F0FA 100%);
}
.friend .venue-header {
  background: linear-gradient(135deg, #4A90D9 0%, #5BA0E8 100%);
}
.friend .top-band {
  background: linear-gradient(90deg, transparent, #4A90D9, transparent);
}
.friend .close-btn {
  background: #E8F4FD;
  box-shadow: 0 2rpx 8rpx rgba(59,130,200,0.15);
}
.friend .close-icon {
  color: #4A90D9;
}
.friend .title-text {
  color: #4A90D9;
}
.friend .detail-item {
  border-bottom-color: #D0E4F5;
}
.friend .label-text {
  color: #7BAFD4;
}
.friend .address-action {
  background: #E8F4FD;
}
.friend .address-copy {
  color: #4A90D9;
}
.friend .footer-divider {
  background: linear-gradient(90deg, transparent, rgba(74,144,217,0.3), transparent);
}
.friend .footer-text {
  color: #B0CCF0;
}
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/pages/reservation-share/index.wxss
git commit -m "feat(share): 添加 business/friend 模板样式"
```

---

## Task 2: reservation-share 页面结构调整

**Files:**
- Modify: `miniprogram/pages/reservation-share/index.wxml`
- Modify: `miniprogram/pages/reservation-share/index.js`

### 2.1 修改 index.js — 添加模板配置和字段映射

在 `data` 中新增 `templateConfig` 对象：

```js
data: {
  // ...现有字段
  templateConfig: {
    business: {
      headerEmojis: ['🏛️'],
      fieldEmojis: ['📋', '⌚', '🏠', '👔', '📝', '💌']
    },
    friend: {
      headerEmojis: ['🍻', '🤗'],
      fieldEmojis: ['📆', '🌙', '🏠', '🥂', '📝', '💌']
    }
  }
},
```

在 `loadData()` 中，解析 `template` 字段并设置 `templateClass`：

```js
const template = res.shareConfig?.template || 'business'
const templateData = this.data.templateConfig[template]
const reservation = {
  ...res,
  // ...现有字段
  templateClass: template,
  headerEmojis: templateData.headerEmojis,
  fieldEmojis: templateData.fieldEmojis
}
```

### 2.2 修改 index.wxml — 动态 class 和 Emoji

在 `.page` view 上绑定动态 class：

```wxml
<view class="page {{templateClass}}">
```

在 venue-header 中将静态 Emoji 替换为动态渲染：

```wxml
<view class="venue-name-row">
  <text class="venue-heart" wx:for="{{headerEmojis}}" wx:key="*this">{{item}}</text>
  <text class="venue-name">{{venueName}}</text>
</view>
```

在 detail-list 中，将静态 Emoji 替换为动态数组渲染。注意：当前 WXML 结构是每个字段单独一行，需要改为循环渲染或保持静态结构。

为保持向后兼容，推荐方案是在 JS 层构造 `detailItems` 数组：

```js
// 在 loadData 中构造
const detailItems = [
  { icon: templateData.fieldEmojis[0], label: '日期', value: formatDate(res.date) },
  { icon: templateData.fieldEmojis[1], label: '时段', value: res.timeSlot },
  { icon: templateData.fieldEmojis[2], label: '包厢', value: roomName },
  { icon: templateData.fieldEmojis[3], label: '人数', value: res.guestCount + '人' }
]
if (res.remark) detailItems.push({ icon: templateData.fieldEmojis[4], label: '备注', value: res.remark })
if (res.shareRemark) detailItems.push({ icon: templateData.fieldEmojis[5], label: '温馨提示', value: res.shareRemark })

this.setData({ detailItems })
```

WXML 改为循环：

```wxml
<view class="detail-list">
  <view class="detail-item" wx:for="{{detailItems}}" wx:key="label">
    <view class="detail-label">
      <text class="label-icon">{{item.icon}}</text>
      <text class="label-text">{{item.label}}</text>
    </view>
    <text class="detail-value {{item.label === '备注' || item.label === '温馨提示' ? 'detail-value-remark' : ''}}">{{item.value}}</text>
  </view>
</view>
```

- [ ] **Step 3: 修改 index.js 添加 templateConfig 和 detailItems 构造逻辑**

修改 `data` 初始化和 `loadData()` 方法。

- [ ] **Step 4: 修改 index.wxml 绑定动态 class 和循环渲染**

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/reservation-share/index.js miniprogram/pages/reservation-share/index.wxml
git commit -m "feat(share): 实现模板动态样式和字段图标切换"
```

---

## Task 3: reservation-detail 分享弹窗新增模板选择器

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.js`

### 3.1 在分享弹窗中添加模板选择数据和方法

在 `data` 中新增：

```js
showShareModal: false,
// ...现有字段
templateOptions: [
  { id: 'business', label: '商务风格', desc: '高端正式' },
  { id: 'friend', label: '友情风格', desc: '温馨亲切' }
],
selectedTemplate: 'business'
```

在 `onShareToGuest()` 中初始化选中值：

```js
onShareToGuest() {
  const saved = r.shareConfig || {}
  const isAutoGenerated = saved.shareTitle && saved.shareTitle.endsWith(' · 预定信息')
  this.setData({
    showShareModal: true,
    shareTitle: (saved.shareTitle && !isAutoGenerated) ? saved.shareTitle : defaultTitle,
    shareAddress: saved.shareAddress || this.data.shareAddress,
    shareRemark: saved.shareRemark || '',
    selectedTemplate: saved.template || 'business'  // 新增
  })
}
```

新增模板选择方法：

```js
onTemplateSelect(e) {
  this.setData({ selectedTemplate: e.currentTarget.dataset.id })
},
```

### 3.2 修改 _buildShareConfig 保存 template

```js
_buildShareConfig() {
  const { shareTitle, shareAddress, shareRemark, shareLatitude, shareLongitude, selectedTemplate } = this.data
  return { shareTitle, shareAddress, shareRemark, shareLatitude, shareLongitude, template: selectedTemplate }
}
```

- [ ] **Step 6: 在 data 中添加 templateOptions 和 selectedTemplate**

- [ ] **Step 7: 在 onShareToGuest 中初始化 selectedTemplate**

- [ ] **Step 8: 新增 onTemplateSelect 方法**

- [ ] **Step 9: 修改 _buildShareConfig 包含 template 字段**

- [ ] **Step 10: 提交**

```bash
git add miniprogram/pages/reservation-detail/index.js
git commit -m "feat(detail): 分享弹窗新增模板选择器"
```

---

## Task 4: reservation-detail 分享弹窗 UI（模板选择卡片）

**Files:**
- Modify: `miniprogram/pages/reservation-detail/index.wxml`（如果需要）
- Modify: `miniprogram/pages/reservation-detail/index.wxss`（如果需要）

> 注：如果当前分享弹窗是纯 JS 动态创建的 `wx.showModal` 或自定义 modal 组件，需根据实际弹窗实现方式决定是否需要新增 WXML/WXSS。如果使用现有 modal 组件，则只需修改 JS 层数据绑定。

- [ ] **Step 11: 如弹窗支持，添加模板选择卡片 UI**

- [ ] **Step 12: 提交**

---

## 验证计划

1. 商务风格验证：在 reservation-detail 分享弹窗选择商务风格，保存后打开分享页，确认背景为浅灰色、头部为深蓝灰、标题香槟金
2. 友情风格验证：选择友情风格，确认背景浅蓝、头部天蓝、标题蓝色
3. 字段 Emoji 验证：确认商务风格显示 📋 ⌚ 🏠 👔，友情风格显示 📆 🌙 🏠 🥂
4. 数据持久化验证：关闭再打开分享弹窗，确认上次选中的模板仍被选中