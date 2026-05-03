# 底部按钮优化：防止误删除

## Context

编辑页面的底部操作栏中，"保存修改"和"删除"按钮使用相同尺寸（`flex: 1`），用户容易误触删除。需要让保存/编辑等主按钮比删除/取消等危险按钮更大更醒目。

## 当前状态

共享样式在 `styles/bottom-bar.wxss`，所有 `.bar-btn` 默认 `flex: 1` 等宽。

### 受影响页面（6 个）

| 页面 | 危险按钮 | 主按钮 | 样式来源 |
|------|---------|--------|---------|
| `pages/reservation-add/index.wxml` | 删除 | 保存修改 | `bottom-bar.wxss` |
| `pages/purchase-add/index.wxml` | 删除 | 保存修改 | `bottom-bar.wxss` |
| `pages/purchase-detail/index.wxml` | 删除 | 编辑 | `bottom-bar.wxss` |
| `pages/income-detail/index.wxml` | 删除 | 编辑 | `bottom-bar.wxss` |
| `pages/reservation-detail/index.wxml` | 取消预约 | 编辑 | `bottom-bar.wxss` |
| `pages/admin/staff-add/index.wxml` | 删除员工 | 保存修改 | `bottom-bar.wxss` |

额外发现：`pages/admin/expense/index.wxml` 使用内联样式，删除按钮无 `flex`，保存按钮 `flex: 1`，比例已经不同，暂不修改。

## 方案

### Step 1: 修改 `styles/bottom-bar.wxss`

新增 `.bar-btn-primary-wide` 类：
```css
.bar-btn-primary-wide {
  flex: 2;
}
```

危险按钮保持 `flex: 1`，主按钮使用 `flex: 2`，形成 2:1 视觉比例。

### Step 2: 修改 6 个 WXML 文件

为每个页面的主按钮添加 `bar-btn-primary-wide` class：

1. **reservation-add/index.wxml:164** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`
2. **purchase-add/index.wxml:88** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`
3. **purchase-detail/index.wxml:68** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`
4. **income-detail/index.wxml:62** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`
5. **reservation-detail/index.wxml:70** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`
6. **admin/staff-add/index.wxml:68** — `bar-btn-primary` → `bar-btn-primary bar-btn-primary-wide`

## 验证

1. 语法验证所有修改的文件
2. 确认双按钮模式下主按钮宽度约为危险按钮 2 倍
3. 确认单按钮模式（`single-btn`）不受影响
4. 确认 `.safe-bottom-bar`（reservation-add 专用）不影响布局
