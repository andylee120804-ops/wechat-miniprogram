# Complete SKILL Example: Reservation Query

> A full working example of a reservation query SKILL for a private club Mini Program.

## 1. app.json Configuration

```json
{
  "lazyCodeLoading": "requiredComponents",
  "subPackages": [
    {
      "root": "packageA/reservation-skill",
      "independent": true,
      "pages": [
        "pages/reservation-detail/index"
      ]
    }
  ],
  "agent": {
    "skills": [
      {
        "name": "reservation",
        "description": "查询和管理预约信息，包括查看今日预约、检查房间可用性、创建新预约",
        "path": "packageA/reservation-skill"
      }
    ],
    "instruction": "AGENTS.md",
    "pageMetadata": "page-meta.json"
  }
}
```

## 2. AGENTS.md (Global Prompts)

```markdown
# 听澜轩会所助手

你是一个高端私人会所的智能助手。你可以帮助客人查询预约、查看房间可用性、了解会所服务。

## 服务范围
- 预约查询和创建
- 房间可用性检查
- 会所服务介绍

## 行为规范
- 使用礼貌、专业的语气
- 涉及价格时使用"元"为单位
- 不透露其他客人的隐私信息
```

## 3. SKILL.md

```markdown
# 预约查询技能

提供预约信息查询和房间可用性检查功能。

## 可用操作
- 查询今日/指定日期的预约列表
- 检查指定房间在指定日期的可用性
- 创建新预约（需确认客人信息）
```

## 4. mcp.json

```json
{
  "apis": [
    {
      "name": "getReservations",
      "description": "查询指定日期的预约列表",
      "_meta": {
        "ui": {
          "componentPath": "components/reservation-card/index"
        }
      },
      "inputSchema": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "查询日期，格式 YYYY-MM-DD，不传则默认今天"
          },
          "room": {
            "type": "string",
            "description": "房间名称筛选，如'大包'、'小包'"
          }
        }
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "date": { "type": "string" },
          "reservations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "guestName": { "type": "string" },
                "room": { "type": "string" },
                "time": { "type": "string" },
                "status": { "type": "string" },
                "guestCount": { "type": "number" }
              }
            }
          }
        }
      }
    },
    {
      "name": "checkAvailability",
      "description": "检查指定房间在指定日期的可用时段",
      "_meta": {
        "ui": {
          "componentPath": "components/availability-card/index"
        }
      },
      "inputSchema": {
        "type": "object",
        "properties": {
          "room": {
            "type": "string",
            "description": "房间名称"
          },
          "date": {
            "type": "string",
            "description": "日期，格式 YYYY-MM-DD"
          }
        },
        "required": ["room", "date"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "room": { "type": "string" },
          "date": { "type": "string" },
          "availableSlots": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "startTime": { "type": "string" },
                "endTime": { "type": "string" }
              }
            }
          }
        }
      }
    }
  ],
  "components": [
    {
      "path": "components/reservation-card/index",
      "relatedPage": "/packageA/reservation-skill/pages/reservation-detail/index",
      "expirable": true,
      "expiredText": "预约数据已过期",
      "permissions": {
        "scope.dynamic": {
          "desc": "实时刷新预约状态"
        }
      }
    },
    {
      "path": "components/availability-card/index",
      "permissions": {
        "scope.dynamic": {
          "desc": "实时查询房间可用性"
        }
      }
    }
  ]
}
```

## 5. Atomic API Implementation

```js
// apis/getReservations.js
const db = wx.cloud.database()
const _ = db.command

async function getReservations({ date, room }) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0]

    let query = db.collection('reservation').where({
      date: targetDate
    })

    if (room) {
      query = query.where({ room: room })
    }

    const { data: reservations } = await query.get()

    return {
      isError: false,
      content: [{
        type: 'text',
        text: `已为您查询到${targetDate}共${reservations.length}条预约`
      }],
      structuredContent: {
        date: targetDate,
        reservations: reservations.map(r => ({
          id: r._id,
          guestName: r.guestName,
          room: r.room,
          time: r.time,
          status: r.status,
          guestCount: r.guestCount
        }))
      }
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `查询预约失败: ${err.message}` }]
    }
  }
}

module.exports = getReservations
```

```js
// apis/checkAvailability.js
const db = wx.cloud.database()

async function checkAvailability({ room, date }) {
  try {
    // Get all reservations for the room on that date
    const { data: reservations } = await db.collection('reservation')
      .where({ room, date })
      .get()

    // Calculate available slots (assuming 10:00-22:00 operating hours)
    const bookedSlots = reservations.map(r => ({
      start: r.startTime,
      end: r.endTime
    }))

    const availableSlots = calculateAvailableSlots('10:00', '22:00', bookedSlots)

    return {
      isError: false,
      content: [{
        type: 'text',
        text: `${room}在${date}有${availableSlots.length}个可用时段`
      }],
      structuredContent: {
        room,
        date,
        availableSlots
      }
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `查询可用性失败: ${err.message}` }]
    }
  }
}

function calculateAvailableSlots(openTime, closeTime, bookedSlots) {
  // Simplified: return full day minus booked
  // In production, implement proper time slot calculation
  const slots = []
  // ... time slot logic
  return slots
}

module.exports = checkAvailability
```

## 6. Register APIs (index.js)

```js
// index.js
const getReservations = require('./apis/getReservations')
const checkAvailability = require('./apis/checkAvailability')

const skill = wx.modelContext.createSkill('/packageA/reservation-skill')

// Register APIs
skill.registerAPI('getReservations', getReservations)
skill.registerAPI('checkAvailability', checkAvailability)

// Auth middleware
skill.use(async (ctx, next) => {
  const token = wx.getStorageSync('auth_token')
  if (!token) {
    return {
      isError: true,
      content: [{ type: 'text', text: '请先登录后再使用此功能' }]
    }
  }
  await next()
})

// Logging middleware
skill.use(async (ctx, next) => {
  const start = Date.now()
  try {
    await next()
    console.log(`[Skill] ${ctx.name} OK ${Date.now() - start}ms`)
  } catch (err) {
    console.error(`[Skill] ${ctx.name} FAIL:`, err)
    throw err
  }
})
```

## 7. Atomic Component

```js
// components/reservation-card/index.js
Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const viewCtx = wx.modelContext.getViewContext(this)
      const { NotificationType } = wx.modelContext

      modelCtx.on(NotificationType.Result, (data) => {
        if (data.result.isError) {
          this.setData({ error: true, errorMsg: data.result.content[0].text })
          return
        }

        const { date, reservations } = data.result.structuredContent
        this.setData({ date, reservations, loaded: true })

        // Set related page with date query
        viewCtx.setRelatedPage({ query: `date=${date}` })
      })
    }
  },

  methods: {
    onTapItem(e) {
      const { id } = e.currentTarget.dataset
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({
        url: `/packageA/reservation-skill/pages/reservation-detail/index?id=${id}`
      })
    },

    onRefresh() {
      // Trigger re-query via follow-up message
      const modelCtx = wx.modelContext.getContext(this)
      modelCtx.sendFollowUpMessage({
        content: [
          { type: 'text', text: '刷新预约列表' },
          { type: 'api/call', data: { name: 'getReservations', arguments: {} } }
        ]
      })
    }
  }
})
```

```xml
<!-- components/reservation-card/index.wxml -->
<view class="card">
  <view class="card-header">
    <text class="date">{{date}} 预约</text>
    <text class="count">{{reservations.length}}条</text>
  </view>
  <view class="card-body" wx:if="{{loaded}}">
    <view class="item" wx:for="{{reservations}}" wx:key="id" bindtap="onTapItem" data-id="{{item.id}}">
      <text class="time">{{item.time}}</text>
      <text class="room">{{item.room}}</text>
      <text class="guest">{{item.guestName}} {{item.guestCount}}人</text>
    </view>
    <view class="empty" wx:if="{{reservations.length === 0}}">
      <text>暂无预约</text>
    </view>
  </view>
  <view class="error" wx:if="{{error}}">
    <text>{{errorMsg}}</text>
  </view>
</view>
```

## 8. Page Metadata (page-meta.json)

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "name": "首页",
      "description": "今日预约汇总和快捷操作"
    },
    {
      "path": "pages/reservation/detail/index",
      "name": "预约详情",
      "description": "查看预约的详细信息",
      "query": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "预约ID"
          }
        },
        "required": ["id"]
      }
    }
  ]
}
```
