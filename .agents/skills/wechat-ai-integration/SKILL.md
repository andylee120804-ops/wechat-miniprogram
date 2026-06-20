---
name: wechat-ai-integration
description: "Use when integrating WeChat Mini Program AI (小程序AI) — exposing Mini Program capabilities as SKILLs for AI to call. Covers SKILL declaration in app.json, mcp.json API schema, atomic API implementation (wx.modelContext.createSkill / registerAPI / use middleware), atomic components (model context, view context, card expiration), half-screen pages, knowledge base, page metadata, and Mini Program↔AI interaction (wx.openAgent / navigateBackAgent / checkIsSupportAgent). NOT for calling AI models (use ai-model-wechat), Node.js backend (use ai-model-nodejs), or browser (use ai-model-web). Keywords: 小程序AI, SKILL, mcp.json, wx.modelContext, createSkill, registerAPI, atomic API, atomic component, half-screen page, expireAllCards, openAgent, navigateBackAgent, 知识库, pageMetadata, AGENTS.md, instruction."
version: 1.0.0
alwaysApply: false
---

# WeChat Mini Program AI Integration

## Overview

WeChat Mini Program AI enables a Mini Program to **expose its capabilities as SKILLs** that the AI agent can call. The Mini Program becomes an AI-callable service — the AI decides which SKILL to invoke based on user intent, calls atomic APIs, and renders results via atomic components.

**Direction:** AI → Mini Program (AI calls your code). This is the **inverse** of `ai-model-wechat` (Mini Program → AI model).

## When to Use

- Making a Mini Program callable by WeChat's built-in AI agent
- Declaring SKILLs with atomic APIs and components
- Implementing `mcp.json` API schemas
- Building atomic components for AI-rendered cards
- Adding half-screen pages for detail views
- Configuring knowledge base for domain-specific Q&A
- Linking Mini Program pages from AI text responses
- Using `wx.openAgent` / `wx.navigateBackAgent` for AI ↔ Mini Program navigation

**Do NOT use for:**
- Calling AI models (generateText/streamText) → use `ai-model-wechat`
- Node.js backend AI → use `ai-model-nodejs`
- Browser/Web AI → use `ai-model-web`

---

## Architecture

```
User → AI Agent → SKILL Selection → Atomic API Call → Atomic Component Render
                     ↓                                    ↓
              Knowledge Base (fallback)          Half-Screen Page (detail)
```

---

## app.json Configuration

```json
{
  "lazyCodeLoading": "requiredComponents",
  "subPackages": [
    {
      "root": "packageA/weather-skill",
      "independent": true,
      "pages": []
    }
  ],
  "agent": {
    "skills": [
      {
        "name": "weather",
        "description": "查询天气业务",
        "path": "packageA/weather-skill"
      }
    ],
    "instruction": "AGENTS.md",
    "pageMetadata": "page-meta.json"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `lazyCodeLoading` | **Yes** | Must be `"requiredComponents"` |
| `subPackages` | **Yes** | SKILL must be in an independent subpackage |
| `agent.skills[].name` | Yes | SKILL name |
| `agent.skills[].description` | Yes | SKILL description for AI matching |
| `agent.skills[].path` | Yes | Absolute path to SKILL directory |
| `agent.instruction` | No | Path to global prompts file (max 10,000 bytes) |
| `agent.pageMetadata` | No | Path to page metadata file (max 8,000 bytes) |

**Limits:** Max 30 SKILLs per Mini Program.

---

## SKILL Directory Structure

```
packageA/weather-skill/
├── SKILL.md          # SKILL description (max 16,000 bytes, single file)
├── mcp.json          # API schema declarations (max 24,000 bytes)
├── components/       # Atomic components directory
│   └── weather-card/
│       ├── index.js
│       ├── index.wxml
│       ├── index.wxss
│       └── index.json
├── apis/             # Atomic API implementations
│   └── getWeather.js
└── index.js          # Register all atomic APIs
```

---

## mcp.json — API Schema Declaration

```json
{
  "apis": [
    {
      "name": "getWeather",
      "description": "查询当前位置或某地的未来一段时间的天气",
      "_meta": {
        "ui": {
          "componentPath": "components/weather-card/index"
        }
      },
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "要查询天气的地点"
          },
          "days": {
            "type": "number",
            "description": "预报天数，范围1-15，默认7"
          }
        },
        "required": ["days"]
      },
      "outputSchema": {}
    }
  ],
  "components": [
    {
      "path": "components/weather-card/index",
      "relatedPage": "/pages/weather-detail/index",
      "expirable": true,
      "expiredText": "天气数据已过期",
      "permissions": {
        "scope.dynamic": {
          "desc": "实时更新天气数据"
        }
      }
    }
  ]
}
```

### API Properties

| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Identifier, must match function name in index.js |
| `description` | Yes | API functionality description (AI uses this for selection) |
| `inputSchema` | Yes | Input parameters (JSON Schema object format) |
| `outputSchema` | Recommended | Schema for `structuredContent` return |
| `_meta.ui.componentPath` | No | Path to atomic component that renders the result |

### Image/File Input

Add `"format": "image"` or `"format": "file"` to inputSchema properties for user-uploaded content:

```json
{
  "name": "EditPhoto",
  "inputSchema": {
    "type": "object",
    "properties": {
      "imagePath": {
        "type": "string",
        "description": "本地图片路径",
        "format": "image"
      },
      "query": { "type": "string", "description": "用户的 P 图需求" }
    },
    "required": ["imagePath", "query"]
  }
}
```

---

## Atomic API Implementation

### Return Value

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `isError` | boolean | No (default false) | Error flag |
| `content` | ContentBlock[] | Yes | Text content for LLM (max 200KB) |
| `structuredContent` | object | No | Structured data for LLM (max 200KB) |
| `_meta` | object | No | Private data invisible to LLM (max 200KB) |

ContentBlock only supports `TextContent`: `{ type: "text", text: string }`

### Example

```js
// apis/getWeather.js
async function getWeather({ location, days }) {
  try {
    const res = await wx.request({
      url: 'https://api.weather.com/forecast',
      data: { location, days }
    })

    return {
      isError: false,
      content: [{ type: 'text', text: `已为您查询到${location}未来${days}天天气` }],
      structuredContent: {
        location,
        forecasts: res.data.forecasts
      }
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `查询失败: ${err.message}` }]
    }
  }
}

module.exports = getWeather
```

### Register APIs

```js
// index.js
const getWeather = require('./apis/getWeather')

const skill = wx.modelContext.createSkill('/packageA/weather-skill')
skill.registerAPI('getWeather', getWeather)
```

### Middleware

```js
const skill = wx.modelContext.createSkill('/packageA/weather-skill')
skill.registerAPI('getWeather', getWeather)

// Auth + logging middleware
skill.use(async (ctx, next) => {
  // Ensure token exists
  const token = wx.getStorageSync('token')
  if (!token) {
    const { code } = await wx.login()
    const res = await wx.request({ url: 'https://api.example.com/auth', data: { code } })
    wx.setStorageSync('token', res.data.token)
  }

  const start = Date.now()
  try {
    await next()  // Call the actual API
    console.log(`[Skill] ${ctx.name} completed in ${Date.now() - start}ms`)
  } catch (err) {
    console.error(`[Skill] ${ctx.name} failed:`, err)
    throw err
  }
})
```

**Middleware context:** `{ name, skillPath, arguments }`
**Timeout:** Total middleware chain + API execution = 300s max
**Execution order:** Registration order (FIFO)

---

## Atomic Component

See [references/atomic-component.md](references/atomic-component.md) for full implementation details.

### Quick Pattern

```js
Component({
  lifetimes: {
    created() {
      const modelCtx = wx.modelContext.getContext(this)
      const viewCtx = wx.modelContext.getViewContext(this)
      const { NotificationType } = wx.modelContext

      // Listen for API results
      modelCtx.on(NotificationType.Result, (data) => {
        this.setData({ result: data.result.structuredContent })
      })

      // Get dimensions
      const { minHeight, maxHeight, width } = viewCtx.getDimensions()
    }
  }
})
```

---

## Card Expiration

```js
// Expire all cards (with optional filtering)
wx.modelContext.expireAllCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index'],
  match: 'latest'  // Only expire the most recent matching card
})

// Or from within a component
const viewCtx = wx.modelContext.getViewContext(this)
viewCtx.expirePreviousCards({
  componentPaths: ['packageA/weather-skill/components/weather-card/index']
})
```

### Expiration Event

```js
const { NotificationType } = wx.modelContext
const viewCtx = wx.modelContext.getViewContext(this)
viewCtx.on(NotificationType.Expire, (event) => {
  console.log('卡片已过期:', event.expiredText)
})
```

---

## Half-Screen Pages

Open from atomic component; scene values: 1433 or 1434.

```js
// Open half-screen page
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

// Preload for faster opening
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

### Send Follow-Up Message from Half-Screen Page

```js
Page({
  onSelectItem() {
    const ctx = wx.modelContext.getContext()
    ctx.sendFollowUpMessage({
      content: [
        { type: 'text', text: '选择拿铁' },
        { type: 'api/call', data: { name: 'selectGoods', arguments: {} } }
      ]
    })
  }
})
```

**Half-screen constraints:** No navigation away, no page routing, no advertising.

---

## Knowledge Base

Domain-specific content for AI to retrieve when no SKILL matches.

| Aspect | Detail |
|--------|--------|
| Entry | 微信公众平台 > 基础功能 > AI能力 > 知识库 |
| Formats | PDF, DOC, DOCX, PPT, PPTX, TXT, MD, XLSX |
| Max single file | 10MB |
| Max total files | 10 |
| Workflow | Upload → Test recall → Publish to production |

---

## Page Metadata (Text Links)

AI can include short links to Mini Program pages in text responses. Scene values: 1435 or 1436.

```json
{
  "pages": [
    {
      "path": "pages/home/home",
      "name": "首页",
      "description": "展示最新的内容和推荐"
    },
    {
      "path": "pages/detail/detail",
      "name": "商品详情",
      "description": "展示特定商品的信息",
      "query": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "商品的唯一标识符" }
        },
        "required": ["id"]
      }
    }
  ]
}
```

---

## Mini Program ↔ AI Navigation

### Open AI Interface

```js
// Check support first
wx.checkIsSupportAgent({
  success(res) {
    if (res.isSupport) {
      wx.openAgent({
        followUpMessage: '帮我查询明天的天气',
        context: '当前页面: 首页'
      })
    }
  }
})

// Listen for capsule entry
function onOpen() {
  return { followUpMessage: '从首页进入', context: '' }
}
wx.onAgentOpen(onOpen)
wx.offAgentOpen(onOpen)
```

### Return to AI Interface

```js
wx.navigateBackAgent({
  followUpMessage: {
    content: [
      { type: 'text', text: '选择拿铁' },
      { type: 'api/call', data: { name: 'selectGoods', arguments: {} } }
    ]
  },
  context: ''
})
```

---

## API Quick Reference

| API | Description |
|-----|-------------|
| `wx.modelContext.createSkill(skillPath)` | Create skill instance |
| `skill.registerAPI(name, handler)` | Register atomic API handler |
| `skill.use(middleware)` | Register middleware |
| `wx.modelContext.getContext(this)` | Get model context in component |
| `wx.modelContext.getViewContext(this)` | Get view context in component |
| `wx.modelContext.NotificationType` | Notification type constants |
| `wx.modelContext.expireAllCards(opts?)` | Expire all eligible cards |
| `viewCtx.openDetailPage({url})` | Open half-screen page |
| `viewCtx.preloadDetailPage({url})` | Preload half-screen page |
| `viewCtx.expirePreviousCards(opts?)` | Expire previous cards from component |
| `viewCtx.getDimensions()` | Get component dimensions |
| `viewCtx.setRelatedPage({query})` | Set related page query |
| `ctx.sendFollowUpMessage(content)` | Send follow-up message |
| `wx.openAgent(opts)` | Open AI interface |
| `wx.navigateBackAgent(opts)` | Return to AI interface |
| `wx.checkIsSupportAgent(opts)` | Check AI support |
| `wx.onAgentOpen(cb)` | Listen for AI open |
| `wx.offAgentOpen(cb)` | Remove AI open listener |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `lazyCodeLoading: "requiredComponents"` | Required for SKILL subpackages |
| SKILL not in independent subpackage | Must set `independent: true` in subPackages |
| `mcp.json` API name ≠ index.js function name | Must match exactly |
| Missing `outputSchema` | Recommended — helps AI parse structured results |
| Returning raw data instead of `{content, structuredContent}` | Must follow return value format |
| Component without `scope.dynamic` permission using wx.request | Declare in mcp.json components |
| Hardcoding component height | Width/height determined at init, use `getDimensions()` |
| Using page navigation in half-screen page | Not allowed — use `sendFollowUpMessage` instead |
| Exceeding 200KB content/structuredContent limit | Split large responses |
| Middleware timeout > 300s total | Total chain + API must complete within 300s |

---

## Related Skills

- **ai-model-wechat** — Calling AI models from Mini Program (`wx.cloud.extend.AI`)
- **miniprogram-development** — General Mini Program development
- **cloudbase** — CloudBase platform and services
