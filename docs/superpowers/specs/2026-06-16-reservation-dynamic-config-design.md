# 预约新增页面动态配置设计

> 日期: 2026-06-16
> 状态: Draft v2（已整合评审反馈）
> 范围: 预约管理设置 + 预约新增动态渲染 + 下游适配

## 1. 背景与目标

### 当前痛点

- **房间硬编码** — 只有「大包厢 / 小包厢 / 棋牌室」3 个选项，写死在 `reservation-add/index.js` 的 `roomOptions` 里
- **包场模式固定** — 不/午/晚/全 4 种，无法按房间分别配置；且包场时 room 被强制设为 `'big'`
- **时段固定** — 只有「中午 / 晚上」，无法按房间自定义
- **表单字段固定** — 人数/菜价/手机号等哪些必填，全部硬编码逻辑
- **餐标固定** — 500/600/800 选项写死，无法按房间配不同餐标
- **改任何一项都要改代码** — 新增一个「中包厢」需要改 JS + WXML + helpers + 冲突检测

### 目标

管理员（admin role only）可通过设置页面自由配置：
1. 增删改房间，按房间配置包场模式/时段/餐标
2. 增删表单字段（系统预置不可删，可隐藏；自定义字段可增删）
3. 按房间标记字段隐藏
4. 预约新增页完全从配置动态渲染，零硬编码

## 2. 架构决策

**方案选择: Settings 集合扩展（方案 A）**

在现有 `settings` 集合中新增 2 条文档（`reservation_rooms` 和 `reservation_form_config`），值存 JSON 对象。预约页加载时读取配置，动态渲染表单。

选择理由：
- 房间数量通常 ≤ 10，JSON 不会大，读写性能无忧
- 沿用现有 settings 集合模式，改动最少
- 不新增集合，不需要改 COLLECTIONS 常量
- 未来如果房间 > 20，可以无痛迁移到独立集合

## 3. 数据模型

### 3.1 reservation_rooms

```js
// settings 集合中 key = 'reservation_rooms' 的文档
{
  key: 'reservation_rooms',
  _version: 1,           // 乐观锁版本号，每次写入 +1
  value: [
    {
      id: 'big',
      name: '大包厢',
      enabled: true,
      order: 0,
      exclusiveTypes: ['none', 'noon', 'night', 'full'],
      timeSlots: ['中午', '晚上'],
      standards: [500, 600, 800],
      partnerStandard: 300,
      defaultStandard: 500
    },
    {
      id: 'small',
      name: '小包厢',
      enabled: true,
      order: 1,
      exclusiveTypes: ['none', 'noon', 'night', 'full'],
      timeSlots: ['中午', '晚上'],
      standards: [500, 600],
      partnerStandard: 300,
      defaultStandard: 500
    },
    {
      id: 'chess',
      name: '棋牌室',
      enabled: true,
      order: 2,
      exclusiveTypes: [],
      timeSlots: ['中午', '晚上'],
      standards: [],
      partnerStandard: 0,
      defaultStandard: 0
    }
  ]
}
```

**字段说明：**
- `id` — 房间唯一标识。老房间保持 big/small/chess，新房间用 `room_N` 格式自动生成
- `name` — 显示名称，管理员可改
- `enabled` — 停用后预约页不显示，但不物理删除，保证历史预约数据可读
- `order` — 排序权重，数字越小越靠前
- `exclusiveTypes` — 可选值: `none`(不包场) / `noon`(午包场) / `night`(晚包场) / `full`(全天包场)
- `timeSlots` — 时段字符串数组，支持自定义（如 `['下午']`）
- `standards` — 餐标数字数组

### 3.2 包场模式与 room 的关系（P0 关键澄清）

**核心语义变更：包场的 room 存储该房间的 id**

| 场景 | room 存储 | exclusiveType | 含义 |
|------|-----------|---------------|------|
| 大包厢不包场 | `'big'` | `'none'` | 大包厢普通预约 |
| 大包厢午包场 | `'big'` | `'noon'` | 大包厢中午包场 |
| 小包厢午包场 | `'small'` | `'noon'` | 小包厢中午包场 |
| 大包厢全天包场 | `'big'` | `'full'` | 大包厢全天包场 |

**与旧代码的对比：** 旧代码中包场时 room 强制为 `'big'`（包场=大包厢包场）。新设计中包场是按房间独立的——小包厢也可以包场，room 存该房间自身的 id。

**冲突检测规则更新：**
- `none`（普通预约）：同 room + 同 time 冲突
- `noon`（午包场）：同 room + time 为「中午」的所有预约冲突
- `night`（晚包场）：同 room + time 为「晚上」的所有预约冲突
- `full`（全天包场）：同 room 的所有预约冲突

> 注意：变更后不再存在"某房间全天包场阻塞其他房间"的语义。如果业务需要"全店包场"，管理员需对所有启用房间启用 `full` 包场模式。

### 3.3 reservation_form_config

```js
// settings 集合中 key = 'reservation_form_config' 的文档
{
  key: 'reservation_form_config',
  _version: 1,           // 乐观锁版本号
  value: {
    fields: [
      { id: 'customerName', label: '客户姓名', type: 'text',
        builtin: true, visible: true, required: true,
        hiddenInRooms: [] },
      { id: 'phone',        label: '手机号',   type: 'text',
        builtin: true, visible: true, required: false,
        hiddenInRooms: [] },
      { id: 'guestCount',   label: '人数',     type: 'number',
        builtin: true, visible: true, required: true,
        hiddenInRooms: ['chess'] },
      { id: 'dishPrice',    label: '预定菜价', type: 'number',
        builtin: true, visible: true, required: false,
        hiddenInRooms: ['chess'] },
      { id: 'remark',       label: '备注',     type: 'textarea',
        builtin: true, visible: true, required: false,
        hiddenInRooms: [] },
      { id: 'tea_type',     label: '茶水类型', type: 'select',
        builtin: false, visible: true, required: false,
        options: ['龙井', '铁观音', '普洱', '毛峰'],
        hiddenInRooms: ['big', 'small'] },
      { id: 'table_fee',    label: '台费',     type: 'number',
        builtin: false, visible: true, required: true,
        hiddenInRooms: [] }
    ]
  }
}
```

**字段说明：**
- `fields` — 统一字段池。`builtin: true` 不可删除（只能隐藏），`builtin: false` 可增删
- `type` — 字段类型。MVP 支持: `text`(文本输入) / `number`(数字输入) / `textarea`(多行文本) / `select`(下拉选择)
- `options` — 仅 `type: 'select'` 时存在，字符串数组
- `hiddenInRooms` — 替代原 `overrides`。直接标记该字段在哪些房间下隐藏，简化为一个字段级数组
- 自定义字段的 `id` 格式: 自动生成 `custom_N`

**hiddenInRooms 替代 overrides 的理由：**
- 实际业务场景仅为"棋牌室不显示人数/菜价"，不需要逐房间配置 required 差异
- `hiddenInRooms: ['chess']` 比 `overrides: { chess: { guestCount: { visible: false } } }` 简单得多
- 查找时只需 `field.hiddenInRooms?.includes(currentRoom)` 一行判断
- 未来若需 per-room required 覆盖，可扩展为 `requiredInRooms: { chess: true }` 或升级回 overrides

### 3.4 预约文档存储结构

```js
{
  date: Date,
  time: '中午',
  room: 'big',              // 房间 id（从配置来）
  roomName: '大包厢',        // 快照，防止改名后丢失
  exclusiveType: 'noon',    // 包场类型，room 存该房间 id
  isPartner: false,
  standard: 600,
  // 内置字段（保持现有结构，向前兼容）
  customerName: '张三',
  phone: '13800138000',
  guestCount: 8,
  dishPrice: 5000,
  remark: '要辣',
  // 自定义字段（新增）
  customFields: {
    tea_type: '龙井',
    table_fee: 100
  },
  // 元数据
  status: 'confirmed',
  hasIncome: false,
  createdBy: 'xxx',
  createdByName: '张三'
}
```

**向前兼容要点：**
- 内置字段（customerName / phone / guestCount 等）保持顶层存储，老数据照常读取
- 自定义字段统一放 `customFields` 对象，不污染顶层结构
- `roomName` 快照写入，防止房间改名后详情页丢失信息
- 已有预约文档无 `customFields` → 读取时默认 `{}`
- 老数据中 `exclusiveType !== 'none'` 时 room 可能为 `'big'`（旧逻辑），编辑时需兼容读取

## 4. 设置页面 UI

### 4.1 页面重组

现有「收费设置」页（min-amount）改名为「预约管理设置」，内容重组为 3 个 Tab：
- Tab 1: 🏠 房间管理
- Tab 2: 📋 表单配置
- Tab 3: 💰 收费设置（原有内容原封迁移）

权限: 仅 admin 角色可访问。

### 4.2 Tab 1: 房间管理

**列表视图：**
- 卡片列表展示所有房间
- 每个卡片预览关键配置（包场/时段/餐标），使用 pill 标签
- 停用的房间半透明 + 红色「已停用」标签
- 底部虚线框「＋ 添加房间」
- 右上角「恢复默认」按钮（二次确认后重建默认配置）

**房间编辑（底部抽屉弹窗）：**
- 房间名称（输入框）
- 启用状态（开关）
- 排序权重（数字输入）
- 支持的包场模式（多选 pill: 不包场/午/晚/全天）
- 支持的时段（多选 pill + 可自定义输入新时段）
- 餐标选项（可增删的 pill 标签，点 ✕ 删除，底部「添加餐标」输入）
- 股东餐标（数字输入）
- 默认餐标（数字输入）
- 停用房间 / 保存 按钮

**新增房间：**
- 自动生成 id (`room_N`)，用户填写 name
- 其余配置项默认值参照首个已有房间

### 4.3 Tab 2: 表单配置

**全局可用字段：**
- 每个字段一行：字段名 + 显示 checkbox + 必填 checkbox + 隐藏房间多选
- 系统预置字段标记「系统」标签，不可删除，但可隐藏
- 自定义字段标记「自定义」+ 类型标签，有 ✕ 删除按钮
- select 类型字段显示选项列表（pill 标签，可增删）
- 底部「添加字段」输入行：字段名 + 类型下拉（文本/数字/多行文本/选择）+ 添加按钮

**隐藏房间配置（替代"按房间覆盖"折叠面板）：**
- 每个字段行右侧有「隐藏于」按钮，弹出已启用房间列表多选
- 选中后该字段在对应房间下不渲染
- UI 展示：字段行末尾显示 pill 标签如「隐藏: 棋牌室」，点击可编辑

### 4.4 Tab 3: 收费设置

原有 min-amount 页内容原封迁移。原有 settings key（min_amount_* / serviceCharge*）不变。

### 4.5 恢复默认配置

设置页右上角「恢复默认」按钮：
- 二次确认弹窗："将恢复到系统默认配置，当前配置将被覆盖，确认？"
- 确认后重新写入硬编码默认值（big/small/chess + 5 个内置字段）
- _version 重置为 1

## 5. 配置缓存机制

### 5.1 全局缓存模块

新增 `utils/reservationConfig.js`：

```js
let _roomsCache = null
let _formConfigCache = null

async function loadRooms() {
  if (_roomsCache) return _roomsCache
  const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
  _roomsCache = (res.data && res.data[0] && res.data[0].value) || null
  if (!_roomsCache) _roomsCache = DEFAULT_ROOMS  // 硬编码降级
  return _roomsCache
}

async function loadFormConfig() {
  if (_formConfigCache) return _formConfigCache
  const res = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_form_config' })
  _formConfigCache = (res.data && res.data[0] && res.data[0].value) || null
  if (!_formConfigCache) _formConfigCache = DEFAULT_FORM_CONFIG
  return _formConfigCache
}

function invalidateCache() {
  _roomsCache = null
  _formConfigCache = null
}

module.exports = { loadRooms, loadFormConfig, invalidateCache, DEFAULT_ROOMS, DEFAULT_FORM_CONFIG }
```

### 5.2 缓存使用策略

- 预约新增页 / 详情页 / 分享页 / 日历页：使用缓存版本，首次加载后不再重复查询
- 设置页保存配置后：调用 `invalidateCache()`
- 页面 onShow 时：不重新加载（配置变更不频繁）
- 网络失败降级：返回硬编码默认值，页面正常可用

### 5.3 配置写入并发控制

每次写入配置时带上 `_version` 字段：

```js
// 读
const doc = await db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })
const currentVersion = doc.data[0]._version || 0

// 写（条件更新）
const result = await db.updateDoc(COLLECTIONS.SETTINGS, docId, {
  ...newConfig,
  _version: currentVersion + 1
})

// 若读取到写入期间版本已被他人修改
// 方案：先读最新版本 → 提示用户"配置已被修改，请刷新后再保存"
```

微信云数据库不支持原子条件更新，因此采用乐观锁模式：
1. 保存时读取当前 `_version`
2. 写入前再次读取，若 `_version` 变化 → 提示冲突
3. 无变化 → 写入并 `_version + 1`

## 6. 预约新增页面 — 动态渲染

### 6.1 渲染逻辑

```
onLoad:
  1. loadRooms() + loadFormConfig() → 从缓存读取配置
     - 若返回硬编码降级值（缓存未命中 + DB 无数据）→ 使用降级值，页面正常可用
  2. 合并 fields + 当前房间的 hiddenInRooms 过滤 → resolvedFields
     - resolvedFields = fields.filter(f => f.visible && !f.hiddenInRooms?.includes(currentRoom))
  3. setData:
     - roomOptions ← rooms.filter(r => r.enabled).sort(by order)
     - timeOptions  ← 当前选中房间的 timeSlots
     - exclusiveOptions ← 当前选中房间的 exclusiveTypes
     - standardOptions  ← 当前选中房间的 standards
     - currentRoomConfig ← 当前选中房间的完整配置
     - formFields ← resolvedFields（含 label, type, required, options 等渲染信息）

selectRoom(新房间):
  1. 从 roomOptions 中找到新房间的完整配置
  2. 重新过滤 formFields（基于新房间的 hiddenInRooms）
  3. 重新渲染: timeOptions / exclusiveOptions / standards / formFields
  4. 清空不适用的已填值：
     - 旧房间有该字段且已填值 → 新房间隐藏了该字段 → 清空
     - 切换时保留通用字段的值（如 customerName, phone, remark）
```

### 6.2 WXML 动态渲染方案

使用 `<template>` 按 type 渲染字段：

```xml
<block wx:for="{{formFields}}" wx:key="id">
  <!-- 文本输入 -->
  <template wx:if="{{item.type === 'text'}}" is="field-text" data="{{field: item, value: formData[item.id], theme}}" />
  <!-- 数字输入 -->
  <template wx:elif="{{item.type === 'number'}}" is="field-number" data="{{field: item, value: formData[item.id], theme}}" />
  <!-- 多行文本 -->
  <template wx:elif="{{item.type === 'textarea'}}" is="field-textarea" data="{{field: item, value: formData[item.id], theme}}" />
  <!-- 下拉选择 -->
  <template wx:elif="{{item.type === 'select'}}" is="field-select" data="{{field: item, value: formData[item.id], theme}}" />
</block>
```

select 类型字段交互：pill 多选标签 + 可输入新选项。

### 6.3 验证逻辑

```
validate:
  遍历 resolvedFields:
    if required && formData[field.id] 为空 → 报错

  特殊逻辑保留：
  - dishPrice 的"条件必填"（服务费模式下）仍由 shouldSync() 控制
  - customerName 在股东模式下选老板（股东逻辑不变）
  - 手机号格式校验保留
```

### 6.4 提交逻辑

```
onSubmit:
  docData = {}
  customFields = {}

  遍历 resolvedFields:
    if builtin → docData[field.id] = formData[field.id]
    if !builtin → customFields[field.id] = formData[field.id]

  docData.room = 选中房间的 id
  docData.roomName = 选中房间的 name（快照）
  docData.exclusiveType = 选中的包场类型
  docData.customFields = customFields

  // 冲突检测、采购/收入同步等逻辑不变
```

### 6.5 编辑模式

- 编辑老预约时，若无 `customFields` → 默认 `{}`
- 内置字段照常从顶层读取
- 房间 id 不变，表单按当前配置渲染（使用当前配置的字段列表，老数据填充已有值）
- 老数据中 `exclusiveType !== 'none'` 时 room 可能为 `'big'`（旧逻辑），读取兼容：如果配置中找不到对应的 room，仍使用文档中的 room 值

## 7. 配置初始化策略

### 7.1 懒初始化仅限管理员触发

**修改要点：预约页 onLoad 不再触发初始化写入。**

初始化时机：
1. **管理员进入设置页** → 检测 `reservation_rooms` 是否存在 → 不存在则写入默认配置 + toast 提示
2. **首次进入预约新增页** → 配置不存在时 → 使用硬编码降级值（纯读取，不写入数据库）

理由：
- 普通用户不应触发数据库写入
- 初始化是管理行为，应在管理页面触发
- 降级值保证任何场景下页面可用

### 7.2 旧设置合并

首次写入 `reservation_rooms` 时：
1. 读取现有 `settings.mealStandards` / `settings.defaultStandard` / `settings.partnerStandard`
2. 合并到默认房间配置中（覆盖 big 房间的 standards 等）
3. 写入后，`venue_info.mealStandards` 变为废弃字段，不再更新
4. 预约页加载餐标统一从 `reservation_rooms` 中当前房间的 `standards` 读取

### 7.3 配置缺失降级

若配置读取失败（网络/集合不存在）→ 使用 `reservationConfig.js` 中导出的 `DEFAULT_ROOMS` / `DEFAULT_FORM_CONFIG`，页面正常可用。

## 8. 日历页动态分组方案

### 8.1 当前问题

日历页有 6 个硬编码分组（午包场/晚包场/全天包场/大包厢/小包厢/棋牌室），每个分组在 WXML 中有独立的渲染块和颜色。

### 8.2 动态分组方案：两层推导

**分组键推导规则：**
- 若 `exclusiveType !== 'none'`：分组键 = `exclusiveType`（如 `noon` / `night` / `full`）
- 若 `exclusiveType === 'none'`：分组键 = `room`（如 `big` / `small` / `chess`）

**分组显示名：**
- exclusiveType 分组：使用固定的中文映射 `noon→午包场, night→晚包场, full→全天包场`
- room 分组：使用 `roomName` 快照（已存入预约文档）

**分组排序：**
1. exclusiveType 分组在前（noon → night → full）
2. room 分组在后（按 room 的 order 排序）

**颜色动态分配：**
- 使用预定义颜色数组，按分组索引循环分配
- 不再按房间硬编码颜色

### 8.3 房间筛选 pill

从 `loadRooms()` 获取 enabled 的房间列表，动态渲染 pill 标签。筛选条件改为 `room === 选中房间id` 且 `exclusiveType === 'none'`。

## 9. 下游影响

### 9.1 必须改的页面

| 页面 | 改动内容 |
|------|----------|
| reservation-add | 全部动态渲染，从配置读取房间/时段/包场/餐标/字段 |
| reservation-detail | 显示 customFields 自定义字段值（遍历当前配置的 fields 匹配 label） |
| reservation-share | 分享模板遍历动态字段 |

### 9.2 需适配的页面

| 页面 | 改动内容 |
|------|----------|
| reservation (日历页) | 房间筛选 pill 从配置读取；分组逻辑改为动态推导（见第 8 节） |
| income-detail | 显示关联预约的 customFields |
| customer-detail | 预约时间线中展示 customFields |

### 9.3 小改

| 文件 | 改动内容 |
|------|----------|
| helpers.js getRoomName() | 优先读 `loadRooms()` 缓存，fallback 到硬编码 map |
| checkReservationConflict (云函数) | 冲突检测改为按 room id + time + exclusiveType 判断，不再假设包场阻塞其他房间 |
| autoSyncReservation (云函数) | customFields 透传，不影响金额计算 |
| reservationConfig.js (新增) | 全局缓存模块 + 默认配置常量 + 缓存失效方法 |

### 9.4 配置读取优化

当前 `loadVenueSettings` 使用 `db.queryAll(COLLECTIONS.SETTINGS, {})` 全量扫描。新增 2 条文档后，性能影响可控（settings 集合总共约 15 条文档）。

优化方案：
- `reservationConfig.js` 内部使用精确查询 `db.queryAll(COLLECTIONS.SETTINGS, { key: 'reservation_rooms' })`
- 全量扫描仍保留在 `loadVenueSettings` 中（需要多有 key），不影响现有逻辑
- 缓存机制已在第 5 节设计，首次读取后不走数据库

## 10. 不在范围内

- 自定义字段的排序（默认追加在末尾，后续可加拖拽排序）
- 房间的图片/图标配置
- 多语言支持
- 批量导入/导出配置
