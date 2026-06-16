# 预约新增页面动态配置设计

> 日期: 2026-06-16
> 状态: Draft
> 范围: 预约管理设置 + 预约新增动态渲染

## 1. 背景与目标

### 当前痛点

- **房间硬编码** — 只有「大包厢 / 小包厢 / 棋牌室」3 个选项，写死在 `reservation-add/index.js` 的 `roomOptions` 里
- **包场模式固定** — 不/午/晚/全 4 种，无法按房间分别配置
- **时段固定** — 只有「中午 / 晚上」，无法按房间自定义
- **表单字段固定** — 人数/菜价/手机号等哪些必填，全部硬编码逻辑
- **餐标固定** — 500/600/800 选项写死，无法按房间配不同餐标
- **改任何一项都要改代码** — 新增一个「中包厢」需要改 JS + WXML + helpers + 冲突检测

### 目标

管理员（admin role only）可通过设置页面自由配置：
1. 增删改房间，按房间配置包场模式/时段/餐标
2. 增删表单字段（系统预置不可删，可隐藏；自定义字段可增删）
3. 按房间覆盖全局字段的显示/必填
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
  value: [
    {
      id: 'big',                // 唯一标识（用于数据库存取，不可改）
      name: '大包厢',            // 显示名称（可改）
      enabled: true,            // 是否启用
      order: 0,                 // 排序权重
      exclusiveTypes: ['none', 'noon', 'night', 'full'],  // 支持的包场模式
      timeSlots: ['中午', '晚上'],                          // 支持的时段
      standards: [500, 600, 800],                           // 餐标选项
      partnerStandard: 300,                                  // 股东餐标
      defaultStandard: 500                                   // 默认餐标
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
      exclusiveTypes: [],        // 棋牌室不支持包场
      timeSlots: ['中午', '晚上'],
      standards: [],             // 棋牌室无餐标
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
- `timeSlots` — 时段字符串数组，支持自定义（如 ['下午']）
- `standards` — 餐标数字数组

### 3.2 reservation_form_config

```js
// settings 集合中 key = 'reservation_form_config' 的文档
{
  key: 'reservation_form_config',
  value: {
    // 全局字段池（系统预置 + 自定义，统一结构）
    fields: [
      { id: 'customerName', label: '客户姓名', type: 'text',
        builtin: true, visible: true, required: true },
      { id: 'phone',        label: '手机号',   type: 'text',
        builtin: true, visible: true, required: false },
      { id: 'guestCount',   label: '人数',     type: 'number',
        builtin: true, visible: true, required: true },
      { id: 'dishPrice',    label: '预定菜价', type: 'number',
        builtin: true, visible: true, required: false },
      { id: 'remark',       label: '备注',     type: 'textarea',
        builtin: true, visible: true, required: false },
      // 管理员添加的自定义字段
      { id: 'table_fee',    label: '台费',     type: 'number',
        builtin: false, visible: true, required: true },
      { id: 'tea_fee',      label: '茶水费',   type: 'number',
        builtin: false, visible: true, required: false }
    ],
    // 按房间覆盖（只列与全局不同的字段，只能引用全局 fields 中的 id）
    overrides: {
      chess: {
        guestCount: { visible: false, required: false },
        dishPrice:  { visible: false, required: false }
      }
    }
  }
}
```

**字段说明：**
- `fields` — 统一字段池。`builtin: true` 不可删除（只能隐藏），`builtin: false` 可增删
- `type` — 字段类型。MVP 支持: `text`(文本输入) / `number`(数字输入) / `textarea`(多行文本)。`select`(下拉选择) 预留但不实现
- `overrides` — 按房间覆盖，只能引用全局 fields 中已有的字段 id，不能添加全局不存在的字段
- 自定义字段的 `id` 格式: `custom_N` 自动生成，或管理员输入的英文 key

### 3.3 预约文档存储结构

```js
{
  date: Date,
  time: '中午',
  room: 'big',              // 房间 id（从配置来）
  roomName: '大包厢',        // 快照，防止改名后丢失
  exclusiveType: 'none',
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
    table_fee: 100,
    tea_fee: 50
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

## 4. 设置页面 UI

### 4.1 页面重组

现有「收费设置」页（min-amount）改名为「预约管理设置」，内容重组为 3 个 Tab：
- Tab 1: 🏠 房间管理
- Tab 2: 📋 表单配置
- Tab 3: 💰 收费设置（原有内容原封迁移）

权限: 仅 admin 角色可访问（与现有 min-amount 页一致）。

### 4.2 Tab 1: 房间管理

**列表视图：**
- 卡片列表展示所有房间
- 每个卡片预览关键配置（包场/时段/餐标），使用 pill 标签
- 停用的房间半透明 + 红色「已停用」标签
- 底部虚线框「＋ 添加房间」

**房间编辑（底部抽屉弹窗）：**
- 房间名称（输入框）
- 启用状态（开关）
- 排序权重（数字输入）
- 支持的包场模式（多选 pill: 不包场/午/晚/全天）
- 支持的时段（多选 pill + 可自定义输入新时段）
- 餐标选项（可增删的 pill 标签，点 ✕ 删除，底部「添加餐标」输入）
- 股东餐标（数字输入）
- 默认餐标（数字输入 / 选择已有选项）
- 停用房间 / 保存 按钮

**新增房间：**
- 自动生成 id (`room_N`)，用户填写 name
- 其余配置项默认值参照首个已有房间

### 4.3 Tab 2: 表单配置

**全局可用字段：**
- 每个字段一行：字段名 + 显示 checkbox + 必填 checkbox
- 系统预置字段标记「系统」标签，不可删除，但可隐藏
- 自定义字段标记「自定义」+ 类型标签，有 ✕ 删除按钮
- 底部「添加字段」输入行：字段名 + 类型下拉（文本/数字/选择）+ 添加按钮

**按房间覆盖：**
- 折叠列表，每个启用房间一行，显示覆盖数量
- 展开后显示该房间的覆盖字段，每项有 ✕ 移除覆盖
- 底部「＋ 从全局字段添加覆盖」按钮，弹出全局字段列表选择（排除已覆盖的）
- 未覆盖的房间显示「无覆盖」

### 4.4 Tab 3: 收费设置

原有 min-amount 页内容原封迁移：
- 最低消费（大包厢/小包厢/午包场/晚包场/全天包场）
- 服务费开关 + 午/晚市服务费
- 原有 settings key（min_amount_* / serviceCharge*）不变

## 5. 预约新增页面 — 动态渲染

### 5.1 渲染逻辑

```
onLoad:
  1. loadConfig() → 读取 reservation_rooms + reservation_form_config
     - 若 reservation_rooms 不存在 → 自动写入默认配置（懒初始化）
  2. 合并 fields + overrides[当前房间] → resolvedFields
     - 对于每个字段: 取 overrides 中的值覆盖全局默认
  3. setData:
     - roomOptions ← rooms.filter(r => r.enabled).sort(by order)
     - timeOptions  ← 选中房间的 timeSlots
     - exclusiveOptions ← 选中房间的 exclusiveTypes
     - standardOptions  ← 选中房间的 standards
     - formFields ← resolvedFields.filter(f => f.visible)

selectRoom(新房间):
  1. 重新合并 fields + overrides[新房间] → resolvedFields
  2. 重新渲染: timeOptions / exclusiveOptions / standards / formFields
  3. 清空不适用的已填值（如切换到棋牌室时清空 guestCount）
```

### 5.2 验证逻辑

```
validate:
  遍历 resolvedFields:
    if required && value为空 → 报错

  特殊逻辑保留：
  - dishPrice 的"条件必填"（服务费模式下）仍由 shouldSync() 控制
  - customerName 在股东模式下选老板（股东逻辑不变）
  - 手机号格式校验保留
```

### 5.3 提交逻辑

```
onSubmit:
  docData = {}
  遍历 resolvedFields:
    if visible:
      if builtin → docData[field.id] = 收集的值（顶层字段）
      if !builtin → docData.customFields[field.id] = 收集的值

  docData.room = 选中房间的 id
  docData.roomName = 选中房间的 name（快照）
  docData.customFields = { ...自定义字段的值 }

  // 冲突检测、采购/收入同步等逻辑不变
```

### 5.4 编辑模式

- 编辑老预约时，若无 customFields → 默认 `{}`
- 内置字段照常从顶层读取
- 房间 id 不变，表单按当前配置渲染（使用当前配置的字段列表，老数据填充已有值）

## 6. 下游影响

### 6.1 必须改的页面

| 页面 | 改动内容 |
|------|----------|
| reservation-add | 全部动态渲染，从配置读取房间/时段/包场/餐标/字段 |
| reservation-detail | 显示 customFields 自定义字段值 |
| reservation-share | 分享模板遍历动态字段 |

### 6.2 需适配的页面

| 页面 | 改动内容 |
|------|----------|
| reservation (日历页) | 房间筛选 pill 从配置读取 enabled 的房间列表 |
| income-detail | 显示关联预约的 customFields |
| customer-detail | 预约时间线中展示 customFields |

### 6.3 小改

| 文件 | 改动内容 |
|------|----------|
| helpers.js getRoomName() | 优先读全局缓存的房间配置，fallback 到硬编码 map |
| checkReservationConflict | 冲突检测逻辑不变，仍按 room id + time + exclusiveType 组合判断 |
| autoSyncReservation (云函数) | customFields 透传，不影响金额计算 |

## 7. 迁移策略

### 7.1 零迁移启动

- **懒初始化**: 预约页 onLoad 时，若 `reservation_rooms` 不存在 → 自动写入当前硬编码的默认值（big/small/chess 三房间 + 5 个内置字段）
- **老数据兼容**: 已有预约文档无 `customFields` → 读取时默认 `{}`
- **老房间 id 兼容**: `big` / `small` / `chess` 三个 id 保持不变
- **helpers fallback**: `getRoomName()` 先查配置缓存，找不到再 fallback 到硬编码 map
- **设置页合并**: 现有 min-amount 页的「收费设置」内容原封迁入 Tab 3

### 7.2 配置缺失降级

若配置读取失败（网络/集合不存在）→ 使用硬编码默认值，页面正常可用。管理员进入设置页时 → 检测到无配置 → 自动初始化 + toast 提示「已创建默认配置」。

### 7.3 旧设置合并

`reservation_rooms` 中每个房间的 `standards` / `partnerStandard` / `defaultStandard` 与现有 `settings.mealStandards` / `settings.defaultStandard` / `settings.partnerStandard` 合并：首次写入 `reservation_rooms` 时从旧设置读取，之后以新配置为准。

## 8. 不在范围内

- 自定义字段的「选择」(select) 类型及其选项编辑（MVP 仅支持 text/number/textarea，select 类型预留字段定义但 UI 不开放）
- 自定义字段的排序（默认追加在末尾，后续可加拖拽排序）
- 房间的图片/图标配置
- 多语言支持
- 批量导入/导出配置
