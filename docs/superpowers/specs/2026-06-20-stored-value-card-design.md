# 客户储值卡管理设计

> 日期: 2026-06-20
> 状态: Draft v4（已整合展示标签规范、防重复提交、实施编号修正）
> 范围: 客户详情充值、储值账户与流水、收入新增自动抵扣、仪表盘储值统计

## 1. 背景与目标

当前系统已有客户管理、预约管理、收入管理和经营报表。客户数据主要来自预约记录中的客户姓名，收入记录通过收入新增页手动关联预约。现在需要支持客户预充值：客户充值后在客户管理中标记为储值客户；后续该客户预约消费时，收入新增页识别储值余额并优先抵扣；充值到账按现有业务口径计入收入，储值抵扣部分不再生成消费收入，余额不足时仅差额生成收入。

### 目标

第一版只做必要闭环：

1. 客户详情页新增充值弹窗。
2. 新增储值账户集合。
3. 新增储值流水集合。
4. 收入新增页的预约列表显示储值标识和余额。
5. 收入保存时自动抵扣余额：余额足够不生成消费收入，余额不足只生成差额收入。
6. 仪表盘增加「储值充值 / 储值消费 / 储值余额」三张统计卡片。
7. 通过账户 `_version` 乐观锁、预约 `hasIncome` 标记和流水追溯字段，避免并发超扣、重复结算和账目断链。

### 非目标

第一版暂不做：

- 预约详情结账按钮。
- 独立储值卡管理入口。
- 强制手机号唯一识别。
- 余额调整审批、储值流水导出、客户合并。
- 模板消息或外部通知推送。

## 2. 核心业务规则

### 2.1 客户识别

第一版以客户姓名为主识别储值账户，手机号选填。

匹配规则：

1. 如果预约/收入上下文能拿到手机号，且储值账户也有手机号，则优先按手机号匹配。
2. 如果没有手机号，则按客户姓名精确匹配。
3. 如果按姓名查到多个 `active` 储值账户，云函数必须返回错误，要求补手机号或由管理员处理后再保存，不允许随机选一个账户。

### 2.2 充值规则

充值入口放在客户详情页。操作人输入充值金额、可选手机号、支付方式和备注后，系统执行：

1. 创建或更新储值账户。
2. 增加账户余额，同时递增 `_version`。
3. 写一条 `status: 'active'` 的储值流水，类型为 `recharge`。
4. 生成一条收入记录，表示充值到账。
5. 客户详情刷新余额、累计充值和最近流水。

充值金额按当前业务口径进入现有收入统计。为兼容现有收入分类、筛选、颜色和图表配置，充值收入第一版不新增顶层 `type` 枚举，统一使用现有 `type: 'other'`，再用 `settlementMode: 'stored_value_recharge'` 区分储值充值。UI 展示时若检测到 `settlementMode === 'stored_value_recharge'`，中文标签显示为「储值充值」，但收入列表筛选仍落在「其他」分类下。

充值收入必须带上储值关联字段：

```js
{
  type: 'other',
  categoryLabel: '储值充值',
  settlementMode: 'stored_value_recharge',
  storedValueAccountId: 'account_id',
  storedValueTransactionId: 'transaction_id',
  originalAmount: 1000,
  deductedAmount: 0,
  amount: 1000,
  remark: '储值充值'
}
```

### 2.3 消费抵扣规则

消费仍然走现有收入新增页，不新增预约详情结账。

员工选择预约并输入消费金额后，保存时系统按客户储值账户自动处理：

| 场景 | 处理结果 |
| --- | --- |
| 非储值客户 | 按现有逻辑生成全额 `income` 记录；更新预约 `hasIncome: true` |
| 储值客户余额足够 | 不生成消费 `income`；写一条 `consume` 储值流水；扣减余额；更新预约 `hasIncome: true` 和 `settlementMode: 'stored_full'` |
| 储值客户余额不足 | 扣完余额并写 `consume` 流水；差额生成 `income` 记录；更新预约 `hasIncome: true` 和 `settlementMode: 'stored_partial'` |
| 储值客户余额为 0 | 按普通客户生成全额 `income`；更新预约 `hasIncome: true` 和 `settlementMode: 'stored_empty'` |

储值抵扣部分不再计入收入，避免和充值收入重复统计。差额收入记录备注自动写明原消费金额、储值抵扣金额和差额金额。

### 2.4 防重复结算

虽然第一版不做预约详情结账按钮，收入新增页保存成功后仍必须标记预约已处理，防止同一预约重复生成收入或重复扣储值。

云函数保存前检查：

1. 如果 `incomeData.reservationId` 存在，读取预约。
2. 如果预约已有 `hasIncome === true`，返回错误：该预约已生成收入或已完成储值抵扣。
3. 保存成功后更新预约：

```js
{
  hasIncome: true,
  settlementMode: 'normal' | 'stored_full' | 'stored_partial' | 'stored_empty',
  settlementAmount: 800,
  storedValueDeducted: 500,
  incomeAmount: 300,
  storedValueAccountId: 'account_id',
  storedValueTransactionId: 'transaction_id',
  incomeId: 'income_id',
  settledAt: serverDate,
  settledBy: 'operator_id'
}
```

### 2.5 仪表盘统计与核对规则

仪表盘新增三张卡片：

- **储值充值**：当前统计周期内 `stored_value_transaction.type === 'recharge' && status === 'active'` 的金额合计。
- **储值消费**：当前统计周期内 `stored_value_transaction.type === 'consume' && status === 'active'` 的金额合计。
- **储值余额**：当前所有启用储值账户余额合计，不按时间周期过滤。

现有营业收入卡片默认仍按 `income` 集合统计。由于储值充值会写入 `income`，营业收入文案需要标注「含储值预收款」，或者在仪表盘同时展示解释项：

```text
营业收入（含预收款） = 普通消费收入 + 差额收入 + 储值充值
储值余额 = 累计储值充值 - 累计储值消费 - 已取消/回滚调整
已确认消费参考 = 普通消费收入 + 差额收入 + 储值消费
```

第一版不改变利润公式，仍按现有 `income - expense` 计算；但 UI 必须通过储值三卡说明哪些金额是预收、哪些是储值消耗，避免老板误以为储值消费又产生了一次收入。

## 3. 数据模型

### 3.1 新增集合: stored_value_account

```js
{
  _id: 'account_id',
  customerName: '张三',
  phone: '',
  balance: 1200,
  totalRecharge: 3000,
  totalConsume: 1800,
  status: 'active',
  _version: 7,
  remark: '',
  createdBy: 'operator_id',
  createdByName: '操作人',
  updatedBy: 'operator_id',
  updatedByName: '操作人',
  createdAt: serverDate,
  updatedAt: serverDate
}
```

字段说明：

- `customerName`：必填，第一版主要匹配字段。
- `phone`：选填，有值时优先用于匹配。
- `balance`：当前可用余额。
- `totalRecharge`：累计充值金额，只统计 `active` 充值流水。
- `totalConsume`：累计储值抵扣金额，只统计 `active` 消费流水。
- `status`：`active` 或 `disabled`；第一版默认只使用 `active`。
- `_version`：乐观锁版本号，每次余额变动必须加 1。

### 3.2 新增集合: stored_value_transaction

```js
{
  _id: 'transaction_id',
  accountId: 'account_id',
  customerName: '张三',
  phone: '',
  type: 'consume',
  status: 'active',
  amount: 800,
  balanceBefore: 2000,
  balanceAfter: 1200,
  reservationId: 'reservation_id',
  reservationSnapshot: {
    date: '2026-06-20',
    time: '晚上',
    roomName: '大包厢',
    customerName: '张三'
  },
  incomeId: '',
  originalAmount: 800,
  incomeAmount: 0,
  paymentMethod: '',
  remark: '储值卡抵扣',
  operatorId: 'operator_id',
  operatorName: '操作人',
  createdAt: serverDate,
  updatedAt: serverDate
}
```

`type` 可选值：

- `recharge`：充值。
- `consume`：预约消费储值抵扣。
- `adjust`：余额调整，第一版预留但不开放入口。

`status` 可选值：

- `active`：有效流水，参与余额与统计。
- `reverted`：已冲正，第一版只预留。
- `cancelled`：已取消，第一版只预留。

所有统计只计算 `status === 'active'` 的流水。

`consume` 流水必须写入 `reservationSnapshot`，用于客户详情最近流水展示，避免只显示不可读的 `reservationId`。快照至少包含预约日期、时段、房间名和客户姓名。后续即使预约被修改或删除，储值流水仍能说明这笔抵扣对应哪次消费。

### 3.3 income 储值关联字段

充值收入、差额收入都必须带储值追溯字段。

```js
{
  type: 'other',
  categoryLabel: '储值充值',
  settlementMode: 'normal' | 'stored_value_recharge' | 'stored_partial' | 'stored_empty',
  storedValueAccountId: 'account_id',
  storedValueTransactionId: 'transaction_id',
  reservationId: 'reservation_id',
  originalAmount: 800,
  deductedAmount: 500,
  amount: 300
}
```

说明：

- `categoryLabel`：可选展示标签字段，只用于需要覆盖现有 `type` 中文展示的收入记录。第一版仅 `settlementMode === 'stored_value_recharge'` 的充值收入写入 `categoryLabel: '储值充值'`；`stored_partial`、`stored_empty`、`normal` 不写该字段，仍按现有 `type` 显示餐饮/棋牌/酒水/茶时/服务/其他。
- `settlementMode`：储值结算模式。普通收入可缺省或为 `normal`；储值充值为 `stored_value_recharge`；储值差额收入为 `stored_partial`；储值账户余额为 0 时生成的全额收入为 `stored_empty`。
- `originalAmount`：原始消费额或充值额。
- `deductedAmount`：储值抵扣金额；充值记录为 0。
- `amount`：实际进入 `income` 的金额。
- `storedValueTransactionId`：差额收入关联本次消费流水；充值收入在流水创建后回填。

收入列表、收入详情和报表中用于展示中文类型的逻辑统一为：

```js
function getIncomeDisplayType(income) {
  return income.categoryLabel || getIncomeTypeText(income.type)
}
```

也就是优先展示 `categoryLabel`，没有时沿用现有 `getIncomeTypeText(type)`。收入筛选和图表分组仍使用 `type`，不使用 `categoryLabel`。

### 3.4 COLLECTIONS 常量

在 `miniprogram/utils/db.js` 增加：

```js
STORED_VALUE_ACCOUNT: 'stored_value_account',
STORED_VALUE_TRANSACTION: 'stored_value_transaction'
```

所有新增查询必须使用 `COLLECTIONS` 常量，不硬编码集合名。

## 4. 云函数接口设计

储值属于钱账操作，必须集中在云函数执行，避免前端多次写库导致半成功。第一版建议新增云函数 `storedValue`。

### 4.1 乐观锁更新策略

云函数更新账户余额时必须使用 `_version` 保护：

1. 读取账户，记录 `balanceBefore` 和 `_version`。
2. 计算 `balanceAfter`。
3. 更新时 where 条件包含 `_id` 和 `_version`。
4. 更新数据同时写入新余额、累计值和 `_version + 1`。
5. 如果更新数量为 0，说明并发冲突；重新读取账户并重试，最多重试 3 次。
6. 重试后仍失败，返回「余额正在变动，请重试」。
7. 消费扣款写后再次读取账户校验 `balance >= 0`；若发现负数，立即返回错误并写入异常日志，后续人工处理。

消费场景不得直接用前端传入余额计算，必须以云函数读取到的最新账户余额为准。

### 4.2 收入类型兼容

现有收入模块的 `type` 枚举用于分类筛选、颜色标记和图表统计。第一版不引入新的顶层 `type: 'stored_value_recharge'`，避免收入列表和图表出现未注册类型。

储值充值收入使用：

```js
{
  type: 'other',
  categoryLabel: '储值充值',
  settlementMode: 'stored_value_recharge'
}
```

页面展示优先级：

1. 如果 `settlementMode === 'stored_value_recharge'`，显示「储值充值」。
2. 否则按现有 `type` 显示餐饮、棋牌、酒水、茶时、服务、其他。

仪表盘营业收入仍包含这笔 `income`，并通过「含储值预收款」说明解释。

### 4.3 recharge

请求：

```js
{
  action: 'recharge',
  customerName: '张三',
  phone: '',
  amount: 1000,
  paymentMethod: 'wechat',
  remark: '6月充值',
  callerWechatId: 'operator_wechat_id'
}
```

处理：

1. 校验操作人有客户编辑权限或收入新增权限。
2. 校验客户姓名非空、金额大于 0。
3. 查找储值账户：优先 phone，其次 customerName；同名多个 active 账户则返回错误。
4. 不存在则创建账户，`balance = amount`、`totalRecharge = amount`、`_version = 1`。
5. 存在则用 `_version` 乐观锁增加余额和累计充值。
6. 新增 `income` 充值收入记录，使用 `type: 'other'`、`categoryLabel: '储值充值'`、`settlementMode: 'stored_value_recharge'`。
7. 新增 `stored_value_transaction` 充值流水，`status: 'active'`。
8. 回填充值 `income.storedValueTransactionId`。
9. 返回最新账户和流水。

返回：

```js
{
  success: true,
  data: {
    account: {},
    transaction: {},
    incomeId: 'income_id'
  }
}
```

### 4.4 settleIncomeWithStoredValue

收入新增页保存时调用。普通客户也可以走该接口，由云函数决定是否抵扣。

请求：

```js
{
  action: 'settleIncomeWithStoredValue',
  incomeData: {
    type: 'dining',
    amount: 800,
    date: '2026-06-20',
    reservationId: 'reservation_id',
    source: '张三',
    remark: ''
  },
  reservationSnapshot: {
    customerName: '张三',
    phone: '',
    date: '2026-06-20',
    time: '晚上',
    roomName: '大包厢'
  },
  callerWechatId: 'operator_wechat_id'
}
```

处理：

1. 校验操作人有收入新增权限。
2. 校验金额大于 0。
3. 如果存在 `reservationId`，检查预约 `hasIncome`；已处理则返回错误。
4. 按手机号或客户姓名匹配启用的储值账户；同名多个 active 账户则返回错误。
5. 未匹配到账户：生成全额 `income`，更新预约 `hasIncome`，返回 `mode: 'normal'`。
6. 匹配到账户但余额为 0：生成全额 `income`，写入储值关联字段，更新预约，返回 `mode: 'stored_empty'`。
7. 匹配到账户且余额大于 0：用 `_version` 乐观锁扣减 `min(balance, amount)`。
8. 写 `consume` 储值流水，`status: 'active'`，并写入 `reservationSnapshot`（日期、时段、房间名、客户姓名）。
9. 如果有差额，生成差额 `income`，带 `settlementMode: 'stored_partial'` 和储值追溯字段。
10. 如果无差额，不生成 `income`，但仍更新预约 `hasIncome: true` 和储值追溯字段。
11. 返回模式、抵扣金额、差额金额、流水 ID 和收入 ID。

返回：

```js
{
  success: true,
  data: {
    mode: 'stored_partial',
    account: {},
    deductedAmount: 500,
    incomeAmount: 300,
    incomeId: 'income_id',
    transactionId: 'transaction_id'
  }
}
```

### 4.5 queryAccountByCustomer

客户详情页和收入新增页用于查询储值账户。

请求：

```js
{
  action: 'queryAccountByCustomer',
  customerName: '张三',
  phone: ''
}
```

返回当前账户、最近 20 条 `status === 'active'` 流水。消费流水必须包含 `reservationSnapshot`，客户详情展示为「6月20日 晚上 大包厢 储值抵扣 ¥800」；如果历史流水缺少快照，则降级显示 `reservationId` 并提示「预约信息缺失」。若姓名匹配多个 active 账户，返回错误要求补手机号。

### 4.6 queryAccountsByCustomers

收入新增页加载最近预约时批量查询储值账户，避免逐条请求。

请求：

```js
{
  action: 'queryAccountsByCustomers',
  customers: [
    { customerName: '张三', phone: '' },
    { customerName: '李四', phone: '' }
  ]
}
```

返回以 `phone || customerName` 为 key 的账户映射。存在同名冲突的客户，返回 `conflicts` 列表，前端在预约项显示「储值账户冲突，需补手机号」。

### 4.7 getStats

仪表盘查询储值统计。

请求：

```js
{
  action: 'getStats',
  startDate: '2026-06-01',
  endDate: '2026-06-30'
}
```

返回：

```js
{
  success: true,
  data: {
    rechargeAmount: 3000,
    consumeAmount: 1800,
    balanceAmount: 1200
  }
}
```

## 5. 页面设计

### 5.1 客户详情页

在客户基本信息和消费统计下方新增「储值账户」卡片。

无储值账户时：

- 显示「暂无储值账户」。
- 显示按钮「充值开通」。

有储值账户时：

- 显示当前余额、累计充值、累计抵扣。
- 显示最近储值流水。
- 显示按钮「充值」。

充值弹窗字段：

- 充值金额：必填，必须大于 0。
- 手机号：选填，默认带出账户手机号或客户详情中可推断手机号。
- 支付方式：默认微信，可选现金、微信、支付宝、银行转账、其他。
- 备注：选填。

提交按钮必须加前端 loading 锁，防止连续点击造成重复充值：

1. 点击确认后立即设置 `rechargeSubmitting: true`，按钮置灰并显示加载态。
2. 请求完成前忽略后续点击。
3. 成功后关闭弹窗、刷新客户详情数据，并显示成功提示。
4. 失败后恢复按钮可点击，保留弹窗输入，显示错误提示。

乐观锁只能保证余额更新不互相覆盖，不能判断用户是否误点两次充值；因此前端 loading 锁是第一版必需项。

### 5.2 收入新增页

加载最近预约时，批量查询这些预约客户的储值账户。

预约 picker 文案从：

```text
6月20日：晚上 张三 大包厢
```

增强为：

```text
6月20日：晚上 【储值】张三 余额 ¥1200 大包厢
```

余额为 0 时：

```text
6月20日：晚上 【储值·余额0】张三 大包厢
```

同名账户冲突时：

```text
6月20日：晚上 【储值冲突】张三 需补手机号 大包厢
```

选择储值客户预约后，在金额输入区域附近显示抵扣预览：

- 当前余额。
- 本次消费金额。
- 预计储值抵扣。
- 预计差额收入。

保存时调用 `storedValue.settleIncomeWithStoredValue`。根据返回模式提示：

- `stored_full`：已从储值余额抵扣 ¥X，未生成消费收入。
- `stored_partial`：储值抵扣 ¥X，差额收入 ¥Y 已记录。
- `stored_empty`：客户储值余额为 0，已生成全额收入。
- `normal`：保存成功。

编辑已有收入记录时：

- 普通收入按现有逻辑编辑。
- `settlementMode === 'stored_partial'` 的差额收入金额不可修改，避免与 `consume` 流水不一致。
- 储值充值收入金额不可在收入编辑页修改；需要后续冲正/取消功能处理。
- 收入列表和收入详情的类型显示必须使用 `income.categoryLabel || getIncomeTypeText(income.type)`，确保储值充值显示为「储值充值」，其他收入保持原有类型显示。

删除已有收入记录时：

- 普通收入按现有逻辑删除，并按现有逻辑回退预约 `hasIncome`。
- `settlementMode === 'stored_partial'` 的差额收入第一版禁止直接删除。页面提示「该收入关联储值抵扣，请先联系管理员处理储值流水」。这样避免删除差额 income 后预约 `hasIncome` 被置回 false、但储值 `consume` 流水仍 active 导致后续重复扣款。
- `settlementMode === 'stored_value_recharge'` 的充值收入第一版禁止直接删除。页面提示「储值充值已影响客户余额，请通过冲正流程处理」。这样避免充值 income 删除后余额和充值流水仍保留。
- `stored_full` 没有 income 记录可删；第一版不提供撤销入口。若确需撤销，由后续 `revertStoredValueSettlement` 冲正能力处理。
- 第一版不支持前端反向调整储值流水，所有储值冲正都必须经过云函数集中处理。

### 5.3 仪表盘

在现有收入、采购、利润等统计卡片附近新增三张储值卡片：

1. 储值充值：本期充值金额。
2. 储值消费：本期储值抵扣金额。
3. 储值余额：当前账户余额总额。

营业收入卡片标题或说明增加「含储值预收款」。三张储值卡片用于解释现金收入和储值消耗，不改变第一版利润公式。

## 6. 错误处理与边界

### 6.1 金额校验

- 充值金额必须大于 0。
- 消费金额必须大于 0。
- 扣款后余额不能小于 0。
- 差额金额小于 0 时按 0 处理。
- 前端传入的储值余额仅用于展示，云函数必须重新读取余额。

### 6.2 账户匹配冲突

如果按姓名查到多个启用账户，第一版返回错误并提示补手机号或联系管理员处理。不得接受同名风险继续扣款。

### 6.3 并发与部分失败

充值和消费抵扣必须由云函数统一完成。前端不能先更新余额再单独写流水或收入。账户余额更新必须使用 `_version` 乐观锁和重试机制。

如果余额更新成功但后续写流水或收入失败，云函数必须记录异常日志，返回明确错误；后续通过人工核对 `balance` 与流水公式修复。第一版不开放取消/冲正入口，但流水 `status` 已预留 `reverted/cancelled` 以支持后续补偿。

### 6.4 删除与冲正边界

第一版为防止账目断裂，所有涉及储值的 income 禁止直接删除：

- `stored_partial` 差额收入删除会导致差额 income 消失、储值消费流水仍 active、预约可能被错误置为未入账，因此必须拦截。
- `stored_value_recharge` 充值收入删除会导致 income 消失、储值余额和充值流水仍 active，因此必须拦截。
- `stored_full` 无 income 记录，无法通过收入详情删除撤销；第一版只允许保留记录。

后续如果要支持撤销，应新增云函数 `revertStoredValueSettlement`，由云函数统一完成：标记原流水 `status: 'reverted'`、恢复账户余额并递增 `_version`、更新预约追溯字段、按需要生成冲正 income 或标记原 income 状态。该能力不放入第一版实施范围。

### 6.5 权限

- 查看客户详情：沿用客户查看权限。
- 充值：需要客户编辑权限或收入新增权限，推荐 boss/admin 默认可操作。
- 收入新增自动抵扣：需要收入新增权限。
- 仪表盘储值卡片：沿用仪表盘查看权限。

## 7. 核对公式

每日或人工排查时使用以下公式核对：

```text
账户余额 = active充值流水合计 - active消费流水合计 + active调整流水合计
账户totalRecharge = active充值流水合计
账户totalConsume = active消费流水合计
营业收入（含预收款） = 普通income + 差额income + 储值充值income
已确认消费参考 = 普通income + 差额income + 储值消费流水
```

异常检查：

- 任一账户 `balance < 0` 必须告警。
- 任一 `stored_partial` income 必须有关联 `storedValueTransactionId`。
- 任一 `consume` 流水必须有关联 `reservationId` 和可读的 `reservationSnapshot`。
- 任一已抵扣预约必须有 `hasIncome: true`。

## 8. 测试计划

### 8.1 单元/逻辑测试

- 储值余额足够时，抵扣金额等于消费金额，差额为 0。
- 储值余额不足时，抵扣金额等于原余额，差额等于消费金额减原余额。
- 储值余额为 0 时，不写消费流水，生成全额收入。
- 非储值客户生成全额收入。
- 充值后账户余额、累计充值、充值流水和充值收入一致。
- `_version` 不匹配时重试；重试失败返回并发错误。
- 同名多个 active 账户时返回错误，不扣款。

### 8.2 集成测试

- 客户详情充值提交期间按钮置灰；连续点击不会发出第二次充值请求。
- 客户详情充值成功后，刷新显示余额和流水。
- 收入新增页预约列表能显示储值标识。
- 储值客户余额足够时保存收入，不新增消费收入但新增消费流水，并更新预约 `hasIncome`。
- 储值客户余额不足时保存收入，新增差额收入和消费流水，并写入储值关联字段。
- 重复保存同一预约时，第二次返回已处理错误。
- 差额收入编辑页金额不可修改。
- 储值差额收入和储值充值收入不可直接删除。
- 客户详情最近流水能展示消费流水对应的预约日期、时段和房间。
- 仪表盘储值三卡统计只计算 `status === 'active'` 流水。

### 8.3 回归测试

- 普通客户收入新增流程不受影响。
- 客户详情原有访问次数、总消费、偏好房间仍正常。
- 仪表盘原有收入、支出、利润统计仍正常，并显示「含储值预收款」说明。

## 9. 实施顺序建议

1. 增加 `COLLECTIONS` 常量和储值云函数。
2. 实现 `_version` 乐观锁工具、账户匹配工具和储值统计工具。
3. 实现客户详情充值弹窗、提交 loading 锁和账户/流水展示。
4. 实现收入新增页储值账户批量查询、picker 标识和抵扣预览。
5. 将收入新增保存接入储值抵扣云函数，并更新预约 `hasIncome` 与储值追溯字段。
6. 禁止编辑储值差额 income 的金额，并拦截储值差额收入/储值充值收入的直接删除。
7. 收入列表和详情接入 `categoryLabel` 优先展示逻辑。
8. 客户详情流水展示使用 `reservationSnapshot` 渲染消费流水。
9. 仪表盘增加储值统计卡片和「含储值预收款」说明。
10. 补充 E2E 或脚本测试覆盖关键路径。
