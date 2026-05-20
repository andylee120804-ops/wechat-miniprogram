# 采购单据照片上传功能设计

## 概述

在采购新增页（purchase-add）和采购详情页（purchase-detail）增加单据照片上传功能，支持拍照和相册选择，最多3张，详情页可追加/删除/全屏预览。

## 需求

- 上传入口：purchase-add 和 purchase-detail 两个页面
- 图片来源：拍照 + 相册（`wx.chooseMedia`）
- 数量限制：每次采购最多3张
- 详情页交互：可追加上传、可删除、点击全屏预览（`wx.previewImage`）
- 新增页交互：上传/删除，随表单一起提交

## 数据模型

### purchase 集合新增字段

```
receiptImages: [
  {
    fileID: String,      // 云存储 fileID
    uploadedAt: Date,    // 上传时间
    uploadedBy: String   // 上传人 _id
  }
]
```

数组最多3个元素。图片文件存储在云存储 `purchase-receipts/{purchaseId}_{timestamp}.jpg`。

### 删除规则

- 删除采购记录时，同步删除对应云存储文件
- 删除单张图片时，删除云存储文件 + 从 `receiptImages` 数组中移除

## UI 设计

### 方案：独立卡片区（方案B）

单据照片放在独立 theme-card 内，与其它详情行分开。

### purchase-add 页面

在备注 card 下方新增「单据照片」card：

- 标题「单据照片」，右侧显示 `已上传数/3` 计数
- 缩略图 120rpx × 120rpx，圆角 12rpx
- 已上传图片右上角有 × 删除按钮
- 右侧显示 +号虚线框上传按钮
- 达到3张时 +号按钮隐藏
- 编辑模式时加载已有 receiptImages，允许追加或删除

### purchase-detail 页面

在详情 card 下方新增「单据照片」card：

- 标题行右侧显示计数 + 「+ 添加」文字链接
- 缩略图同上 120rpx
- 点击图片 → `wx.previewImage` 全屏预览，支持左右滑动
- 已上传图片右上角 × 删除按钮
- 无图片时显示空状态 + +号虚线框上传入口
- 上传/删除直接操作数据库（不经过审批流程）

## 技术实现

### 上传流程

1. 用户点击 +号或「+ 添加」
2. `wx.chooseMedia({ count: 剩余张数, mediaType: ['image'], sourceType: ['album', 'camera'] })`
3. 获取 tempFilePath
4. `wx.cloud.uploadFile({ cloudPath: 'purchase-receipts/{purchaseId}_{timestamp}.jpg', filePath: tempFilePath })`
5. 将 `{ fileID, uploadedAt, uploadedBy }` push 到 receiptImages 数组
6. `db.updateDoc(COLLECTIONS.PURCHASE, id, { receiptImages: newArray })`

### 删除流程

1. 用户点击 × 或长按删除
2. `wx.showModal` 确认
3. 从 receiptImages 数组中移除目标项
4. `wx.cloud.deleteFile({ fileList: [fileID] })` 删除云存储文件
5. `db.updateDoc(COLLECTIONS.PURCHASE, id, { receiptImages: newArray })`

### 预览流程

1. 用户点击图片缩略图
2. `wx.previewImage({ current: currentUrl, urls: allUrls })` 全屏预览

### 新增页特殊处理

新增采购时无 purchaseId，上传流程分两步：

1. 先提交采购记录获取 _id
2. 再上传图片，cloudPath 使用该 _id
3. 最后 updateDoc 写入 receiptImages

或者采用临时方案：cloudPath 使用 `temp_{timestamp}_{index}` 前缀，提交后重命名。推荐方案1，先提交再上传。

### 已有图片加载

详情页和编辑页加载采购记录时，需将 receiptImages 中的 fileID 下载为临时路径用于展示：

- 使用 `wx.cloud.getTempFileURL` 获取临时链接，image 组件直接用 fileID 也能展示（微信云存储 fileID 可直接用于 image src）

## 边界情况

- 网络中断时上传失败：toast 提示，不清空已选图片让用户重试
- 云存储文件删除失败：不影响数据库操作，记录 warn 日志
- 并发上传同一采购的图片：每次操作都先读取最新 receiptImages 再修改，避免覆盖
- 编辑页图片操作随表单一起提交：追加的图片先上传到云存储记录 fileID，删除的图片标记待删除，点「保存修改」时统一写入数据库和清理云存储。若用户返回取消编辑，已上传的云存储文件成为孤儿文件（可接受，体积小且不影响功能）
