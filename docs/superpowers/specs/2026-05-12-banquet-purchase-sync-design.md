# 宴会菜价自动同步采购设计

## 概述

在采购分类中新增「宴会菜价」分类，预约创建/编辑时自动将菜价同步到采购清单，取消预约时自动删除关联的采购记录。

## 背景

当前预约的菜价（`dishPrice`）仅用于收入计算（菜价+服务费模式），与采购模块没有任何关联。实际业务中，宴会相关的食材采购成本需要与预约的菜价收入对应追踪，方便后续核对利润。

## 数据模型

### 采购记录（`purchase` 集合）新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `sourceReservationId` | string | 关联的预约 `_id`，用于自动同步定位 |

现有字段在自动同步时的取值：

| 字段 | 自动同步时的值 |
|------|---------------|
| `category` | `'banquet'` |
| `amount` | 预约的 `dishPrice` |
| `date` | 预约日期（YYYY-MM-DD） |
| `remark` | `"客人姓名 - 房间信息"` |
| `item` | 留空 |
| `purchaseBy / purchaseByName` | 当前操作用户 |

### 采购分类新增

在现有 9 个分类（`meat`, `seafood`, `vegetable`, `fruit`, `drink`, `seasoning`, `supplies`, `equipment`, `other`）基础上新增：

| 值 | 显示名 |
|----|--------|
| `banquet` | 宴会菜价 |

## 功能设计

### 1. 采购分类增加"宴会菜价"

- `getCategoryName()` 增加 `'banquet' → '宴会菜价'` 映射
- 采购列表页的分类筛选增加"宴会菜价"标签
- 采购新增页的分类选择器中增加"宴会菜价"选项
- "宴会菜价"记录可以像普通采购记录一样手动新增、编辑、删除

### 2. 预约提交时自动同步

在 `reservation-add/index.js` 的 `onSubmit` 中新增逻辑：

```
IF dishPrice > 0:
  查找 purchase 集合 WHERE sourceReservationId == 当前预约Id
  IF 存在:
    UPDATE amount = dishPrice, date = 预约日期, remark = "客人姓名 - 房间"
  ELSE:
    CREATE { category: 'banquet', amount: dishPrice, date: 预约日期, 
             remark: "客人姓名 - 房间", sourceReservationId: 预约Id, ... }
ELSE:
  查找 purchase 集合 WHERE sourceReservationId == 当前预约Id
  IF 存在:
    DELETE 关联记录
```

### 3. 取消预约时自动删除

在预约详情页的取消操作中，查找并删除 `sourceReservationId` 匹配的采购记录。

### 4. 预约详情展示关联信息

预约详情页可展示是否已同步宴会菜价及金额。

## 涉及的修改文件

| 文件 | 改动 |
|------|------|
| `utils/helpers.js` | `getCategoryName()` 增加 `'banquet'` 映射 |
| `pages/purchase/index.js` | 筛选分类增加"宴会菜价" |
| `pages/purchase/index.wxml` | 筛选器增加"宴会菜价"标签 |
| `pages/purchase-add/index.js` | 分类选项中增加"宴会菜价" |
| `pages/purchase-add/index.wxml` | 分类选择器增加"宴会菜价" |
| `pages/reservation-add/index.js` | `onSubmit` 中新增同步/更新/删除采购记录逻辑 |
| `pages/reservation-detail/index.js` | 取消预约时删除关联采购记录 |
| `pages/reservation-detail/index.wxml` | 可选：展示已同步宴会菜价信息 |

## 注意事项

- 手动创建的宴会菜价记录没有 `sourceReservationId`，不受自动同步影响
- 自动同步仅覆盖 `sourceReservationId` 匹配的记录
- 自动同步使用 `db` 工具层的 `queryAll`/`addDoc`/`updateDoc`/`deleteDoc`，遵循现有数据访问模式
