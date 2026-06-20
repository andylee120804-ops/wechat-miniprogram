# Atomic Component Implementation Reference

> Detailed reference for building atomic components in WeChat Mini Program AI SKILLs.

## Component Lifecycle & Context

```js
Component({
  lifetimes: {
    created() {
      // 1. Get model context (data flow)
      const modelCtx = wx.modelContext.getContext(this)

      // 2. Get view context (UI control)
      const viewCtx = wx.modelContext.getViewContext(this)

      // 3. Get notification types
      const { NotificationType } = wx.modelContext

      // 4. Listen for API input data
      modelCtx.on(NotificationType.Input, (data) => {
        console.log('API input:', data)
      })

      // 5. Listen for API result data
      modelCtx.on(NotificationType.Result, (data) => {
        console.log('API result:', data)
        this.setData({
          result: data.result.structuredContent,
          error: data.result.isError
        })
      })

      // 6. Get component dimensions
      const { minHeight, maxHeight, width } = viewCtx.getDimensions()
      this.setData({ minHeight, maxHeight, width })

      // 7. Listen for overflow
      viewCtx.on(NotificationType.Overflow, (data) => {
        console.log('Overflow:', data.contentHeight, data.overflowHeight, data.maxHeight)
      })
    }
  }
})
```

## NotificationType Constants

| Type | Description | Data Shape |
|------|-------------|------------|
| `Input` | API input data | `{ arguments: Record<string, any> }` |
| `Result` | API output data | `{ result: { isError, content, structuredContent, _meta } }` |
| `Expire` | Card expiration event | `{ expiredText: string }` |
| `Overflow` | Content overflow | `{ contentHeight, overflowHeight, maxHeight }` |

## Component Constraints

| Constraint | Detail |
|------------|--------|
| **Width** | Varies with screen width |
| **Height** | min = 4:1 ratio, max = 1:1 ratio. Fixed at init, cannot change |
| **Supported events** | Only tap click, Image load, Image error |
| **Default capabilities** | No network requests, no cloud development, no timers |
| **No page-opening** | Cannot navigate to other pages |
| **No animations** | No animation APIs |
| **No vertical scrolling** | No overflow-y scroll |
| **Follow-up messages** | Use `ModelContext.sendFollowUpMessage` |
| **Half-screen pages** | Supported via `viewCtx.openDetailPage` |

## Dynamic Component Permission

For components needing real-time content (wx.request, timers, cloud calls), declare in `mcp.json`:

```json
{
  "components": [
    {
      "path": "components/weather-card/index",
      "permissions": {
        "scope.dynamic": {
          "desc": "实时获取天气数据并更新卡片内容"
        }
      }
    }
  ]
}
```

Without this permission, the component **cannot** make network requests or use timers.

## Card Expiration

### Declaration in mcp.json

```json
{
  "components": [
    {
      "path": "components/ride-card/index",
      "expirable": true,
      "expiredText": "店铺已关闭"
    }
  ]
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `expirable` | boolean | No | false | Whether card can expire |
| `expiredText` | string | No | "服务已过期" | Text shown when expired |

### Expiration APIs

**Global — expireAllCards:**

```js
// Expire all eligible cards
wx.modelContext.expireAllCards(): Promise<{ errMsg: string }>

// Filter by component path
wx.modelContext.expireAllCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index']
})

// Only expire the latest matching card
wx.modelContext.expireAllCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index'],
  match: 'latest'
})
```

**Component-level — expirePreviousCards:**

```js
const viewCtx = wx.modelContext.getViewContext(this)

// Expire all previous cards from this component
viewCtx.expirePreviousCards(): Promise<{ errMsg: string }>

// With filtering
viewCtx.expirePreviousCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index'],
  match: 'latest'
})
```

### Listen for Expiration

```js
Component({
  lifetimes: {
    created() {
      const { NotificationType } = wx.modelContext
      const viewCtx = wx.modelContext.getViewContext(this)

      viewCtx.on(NotificationType.Expire, (event) => {
        console.log('卡片已过期:', event.expiredText)
        // Cleanup logic: cancel timers, abort requests, etc.
      })
    }
  }
})
```

## Related Page Association

Associate a Mini Program page with the component's card. The card title bar shows an entry to the page.

### Declare in mcp.json

```json
{
  "components": [
    {
      "path": "components/weather-card/index",
      "relatedPage": "/pages/weather-detail/index"
    }
  ]
}
```

### Dynamically Set Page Query

```js
Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const viewCtx = wx.modelContext.getViewContext(this)

      modelCtx.on(NotificationType.Result, (data) => {
        const { orderId } = data.result.structuredContent
        this.setData({ orderId })

        // Set query params for related page
        viewCtx.setRelatedPage({ query: `orderId=${orderId}` })

        // Or with path override
        viewCtx.setRelatedPage({ path: '/pages/detail/index', query: `orderId=${orderId}` })
      })
    }
  }
})
```

Scene values for related page entry: 1442 or 1443.

## Half-Screen Pages

### Opening

```js
Component({
  methods: {
    showDetail() {
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.openDetailPage({
        url: '/packageA/pages/weather-detail?foo=bar'
      })
    }
  }
})
```

Scene values: 1433 or 1434.

### Preloading

```js
Component({
  lifetimes: {
    attached() {
      const viewCtx = wx.modelContext.getViewContext(this)
      viewCtx.preloadDetailPage({
        url: '/packageA/pages/weather-detail?foo=bar'
      })
    }
  }
})
```

### Sending Follow-Up Messages from Half-Screen Page

**Mini Program page:**

```js
Page({
  onTap() {
    const ctx = wx.modelContext.getContext()
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '选择拿铁' },
        {
          type: 'api/call',
          data: { name: 'selectGoods', arguments: {} }
        }
      ]
    })
  }
})
```

**web-view H5 page:**

```js
wx.ready(function () {
  WeixinJSBridge.invoke('invokeMiniProgramAPI', {
    name: 'sendFollowUpMessage',
    arg: {
      content: [
        { type: 'text', text: '选择拿铁' },
        { type: 'api/call', data: { name: 'selectGoods', arguments: {} } }
      ]
    }
  }, function (res) {})
})
```

### Half-Screen Page Constraints

- ❌ No navigation to other apps (公众号, 视频号, other Mini Programs)
- ❌ No page routing interfaces
- ❌ No advertising interfaces or components
- ✅ Can use `sendFollowUpMessage` to trigger API calls

## Get Close Button Position (Half-Screen)

```js
wx.getDetailPageCloseButtonBoundingClientRect()
```

Returns the bounding rect of the close button in the half-screen page, useful for positioning UI elements to avoid overlap.
