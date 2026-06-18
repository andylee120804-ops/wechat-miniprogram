const app = getApp()
const { formatDate, formatAmount, getMonthRange } = require('../../utils/helpers')
const { COLLECTIONS } = require('../../utils/db')
const { hasPermission, ACTIONS } = require('../../utils/permission')
const db = require('../../utils/db')

const ROOM_MAP = { '大包': 'big', '大包厢': 'big', '小包': 'small', '小包厢': 'small', '棋牌': 'chess', '棋牌室': 'chess' }
const TIME_MAP = { '中午': '中午', '晚上': '晚上', '午': '中午', '晚': '晚上' }
const VALID_ROOMS = ['big', 'small', 'chess']
const VALID_TIMES = ['中午', '晚上']
const MAX_INPUT_LENGTH = 500

const SYSTEM_PROMPT = '你是"小食堂"的AI助手，一个餐饮/场所经营管理小程序的智能助手。\n你可以查看经营数据，也可以帮助用户执行各种操作。\n\n【你能做的事情】\n1. 查看经营数据：预约、收入、支出、采购、考勤等\n2. 创建/取消/更新预约状态\n3. 录入收入记录（餐饮/棋牌/酒水/茶水/服务/其他）\n4. 录入一次性支出（工资/房租/水电/物资/其他）\n5. 添加固定支出项（月付/年付）\n6. 提交采购申请、审批采购、标记采购报销\n7. 查看考勤记录\n8. 提供经营洞察和建议\n\n【预约创建规则 - 必须严格遵守】\n当用户想创建预约时，你需要从对话中提取以下信息：\n- customerName: 客户姓名（**必填**，不能为空）\n- date: 日期（**必填**，格式YYYY-MM-DD，今天是__TODAY__，不能是过去的日期）\n- time: 时段（**必填**，只能是"中午"或"晚上"，必须向用户确认是中午还是晚上，不能自行默认）\n- room: 包厢（**必填**，"big"大包厢/"small"小包厢/"chess"棋牌室，必须向用户确认要哪个包厢，不能自行默认）\n- guestCount: 人数（**必填**，棋牌室时填0，其他房间必须≥1）\n- dishPrice: 菜价（**必填**，非棋牌室时必须大于0，不能为空或0）\n- phone: 手机号（选填，如提供必须是11位手机号格式）\n- remark: 备注（选填）\n- standard: 餐标（选填，常见值500/600/800）\n\n**重要：必须追问所有缺少的必填项（客户姓名、日期、时段、包厢、人数、菜价）才能创建预约，绝对不能跳过！**\n如果用户没有明确说是中午还是晚上，必须追问"请问是中午还是晚上？"。如果用户没有明确要哪个包厢，必须追问"请问要大包厢、小包厢还是棋牌室？"。绝对不能用默认值替代用户的回答！\n只有当所有必填项都确认后，才能创建预约。\n如果信息完整，请用以下JSON格式回复（不要加其他内容）：\n[BOOKING]{"customerName":"xxx","date":"2026-06-11","time":"中午","room":"big","guestCount":4,"phone":"","remark":"","standard":0,"dishPrice":500}[/BOOKING]\n\n【查询规则】\n当用户问数据相关问题时，直接基于提供的数据回答，不要说"无法直接查询"。\n分析经营情况时，必须同时考虑收入、支出（含固定支出）和采购成本，综合计算净利润。\n\n用中文回复，语气亲切友好，回答简洁实用。'

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    messages: [],
    inputText: '',
    isLoading: false,
    streamingText: '',
    scrollToId: '',
    keyboardHeight: 0,
    inputBarHeight: 0,
    scrollViewHeight: 0,
    quickActions: [
      { icon: '📋', text: '今日预约', query: '今天有哪些预约？', perm: { module: 'reservation', action: 'view' } },
      { icon: '➕', text: '新建预约', query: '帮我创建一个预约', perm: { module: 'reservation', action: 'add' } },
      { icon: '💰', text: '本月营收', query: '这个月收入怎么样？', perm: { module: 'income', action: 'view' } },
      { icon: '📊', text: '今日概况', query: '给我看看今天的经营概况', perm: { module: 'dashboard', action: 'view' } },
      { icon: '🛒', text: '采购审批', query: '有哪些采购待审批？', perm: { module: 'purchase', action: 'approve' } },
      { icon: '💡', text: '经营建议', query: '给我一些经营建议', perm: { module: 'dashboard', action: 'view' } },
      { icon: '💵', text: '录入收入', query: '帮我录入一笔收入', perm: { module: 'income', action: 'add' } },
      { icon: '💸', text: '录入支出', query: '帮我录入一笔支出', perm: { module: 'expense', action: 'add' } }
    ],
    visibleQuickActions: []
  },

  _msgIdCounter: 0,
  _model: null,
  _onKeyboardHeightChange: null,

  onLoad() {
    // Feature flag guard: AI not enabled yet
    const { AI_ENABLED } = require('../../utils/feature-flags')
    if (!AI_ENABLED) {
      wx.showToast({ title: 'AI功能即将上线', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/index/index' })
        })
      }, 1500)
      return
    }

    // Permission guard: must have AI view permission
    if (!hasPermission('ai', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限使用AI助手', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/index/index' })
        })
      }, 1500)
      return
    }

    const theme = app.getThemePageData()
    const statusBarHeight = app.globalData.statusBarHeight || 44

    // Calculate scroll-view height after measuring input-bar
    try {
      const sysInfo = wx.getSystemInfoSync()
      const safeBottom = sysInfo.safeArea ? sysInfo.screenHeight - sysInfo.safeArea.bottom : 0
      // Estimate: will be corrected by actual measurement below
      const estimatedInputBar = 56 + safeBottom
      const scrollViewHeight = sysInfo.windowHeight - estimatedInputBar
      this.setData({ scrollViewHeight: Math.max(scrollViewHeight, 300) })
    } catch (e) {
      this.setData({ scrollViewHeight: 500 })
    }

    // Filter quick actions by current user's permissions
    const visibleQuickActions = this.data.quickActions.filter(item => {
      return hasPermission(item.perm.module, item.perm.action)
    })

    this.setData({
      theme,
      statusBarHeight,
      visibleQuickActions
    })
    // Listen for keyboard height changes
    this._onKeyboardHeightChange = res => {
      this.setData({ keyboardHeight: res.height || 0 })
      if (res.height > 0) {
        setTimeout(() => this._scrollToBottom(), 100)
      }
    }
    wx.onKeyboardHeightChange(this._onKeyboardHeightChange)
    // Measure input bar height and recalculate scroll-view
    setTimeout(() => {
      this.createSelectorQuery()
        .select('.input-bar')
        .boundingClientRect(rect => {
          if (rect) {
            try {
              const sysInfo = wx.getSystemInfoSync()
              const correctedHeight = sysInfo.windowHeight - rect.height
              this.setData({
                inputBarHeight: rect.height,
                scrollViewHeight: Math.max(correctedHeight, 300)
              })
            } catch (e) {
              this.setData({ inputBarHeight: rect.height })
            }
          }
        })
        .exec()
    }, 300)
  },

  onUnload() {
    if (this._onKeyboardHeightChange) {
      wx.offKeyboardHeightChange(this._onKeyboardHeightChange)
      this._onKeyboardHeightChange = null
    }
  },

  onShow() {
    const theme = app.getThemePageData()
    this.setData({ theme })
  },

  _getModel() {
    if (this._model) return this._model
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      wx.showToast({ title: '当前微信版本不支持AI', icon: 'none' })
      return null
    }
    this._model = wx.cloud.extend.AI.createModel('hunyuan-v3')
    return this._model
  },

  _genId() {
    return 'msg-' + (++this._msgIdCounter)
  },

  _scrollToBottom() {
    this.setData({ scrollToId: 'scroll-bottom' })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onQuickAction(e) {
    const query = e.currentTarget.dataset.query
    this.setData({ inputText: query })
    this._sendMessage(query)
  },

  onSend() {
    const text = this.data.inputText.trim()
    if (!text || this.data.isLoading) return
    if (text.length > MAX_INPUT_LENGTH) {
      wx.showToast({ title: '消息太长，请精简后发送', icon: 'none' })
      return
    }
    this._sendMessage(text)
  },

  /**
   * Parse [BOOKING]...[/BOOKING] from AI response and create reservation
   */
  async _handleBookingCommand(fullText) {
    const match = fullText.match(/\[BOOKING\]([\s\S]*?)\[\/BOOKING\]/)
    if (!match) return null

    try {
      const booking = JSON.parse(match[1])

      // Validate required fields - same rules as reservation-add page
      if (!booking.customerName || !String(booking.customerName).trim()) {
        return { success: false, error: '缺少客户姓名，请提供客人名字' }
      }
      if (!booking.date) {
        return { success: false, error: '缺少日期，请提供预约日期（如2026-06-13）' }
      }

      // Date format validation
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(booking.date)) {
        return { success: false, error: '日期格式不正确，请使用YYYY-MM-DD格式（如2026-06-13）' }
      }

      // Validate time - must be explicitly provided, no default
      if (!booking.time) {
        return { success: false, error: '未指定时段，请先确认是中午还是晚上再创建预约' }
      }

      // Normalize time
      const normalizedTime = TIME_MAP[booking.time] || booking.time
      if (!VALID_TIMES.includes(normalizedTime)) {
        return { success: false, error: '无效的时段，可选：中午/晚上，请先确认时段' }
      }

      // Validate room - must be explicitly provided, no default
      if (!booking.room) {
        return { success: false, error: '未指定包厢，请先确认要大包厢、小包厢还是棋牌室' }
      }

      // Normalize room for conditional validation
      const normalizedRoom = ROOM_MAP[booking.room] || booking.room
      if (!VALID_ROOMS.includes(normalizedRoom)) {
        return { success: false, error: `无效的房间类型，可选：大包/小包/棋牌` }
      }

      const isChessRoom = normalizedRoom === 'chess'

      // Non-chess rooms require guestCount >= 1
      if (!isChessRoom) {
        const gc = Number(booking.guestCount)
        if (!gc || gc < 1 || !Number.isInteger(gc) || gc > 999) {
          return { success: false, error: '非棋牌室预约人数必须为1-999之间的整数' }
        }
      }

      // Phone format validation (if provided)
      if (booking.phone && String(booking.phone).trim()) {
        const phoneRegex = /^1[3-9]\d{9}$/
        if (!phoneRegex.test(String(booking.phone).trim())) {
          return { success: false, error: '手机号格式不正确，请提供11位手机号' }
        }
      }

      // Dish price validation: required for non-chess rooms
      if (!isChessRoom) {
        const dp = Number(booking.dishPrice)
        if (!dp || dp <= 0) {
          return { success: false, error: '非棋牌室预约必须填写菜价，请提供菜价金额' }
        }
      }

      // Room name mapping
      const roomNames = { big: '大包厢', small: '小包厢', chess: '棋牌室' }
      const roomName = roomNames[normalizedRoom] || '大包厢'

      // Check permission
      if (!hasPermission('reservation', ACTIONS.ADD)) {
        return { success: false, error: '您没有创建预约的权限' }
      }

      // Check past date
      const today = formatDate(new Date())
      if (booking.date < today) {
        return { success: false, error: '不能创建过去日期的预约' }
      }

      // Check reservation conflict (aligned with reservation-add page logic)
      const dbInst = db.getDb()
      const _ = dbInst.command
      const parts = booking.date.split('-')
      const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
      const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

      // AI chat only creates non-exclusive reservations (exclusiveType='none')
      // So conflict = same time + same room, OR any full-day exclusive on that date
      const conflictRes = await db.queryAll(COLLECTIONS.RESERVATION, _.and([
        { date: _.gte(dayStart).and(_.lte(dayEnd)) },
        { status: 'confirmed' },
        _.or([
          { time: normalizedTime, room: normalizedRoom },
          { exclusiveType: 'full' }
        ])
      ]))

      if (conflictRes.data && conflictRes.data.length > 0) {
        // Check if conflict is from full-day exclusive
        const fullExclusive = conflictRes.data.some(r => r.exclusiveType === 'full')
        if (fullExclusive) {
          return { success: false, error: `${booking.date} 该日期已被包场（全天），请更换时间` }
        }
        return { success: false, error: `${booking.date} ${normalizedTime} ${roomName}已有预约，时间冲突` }
      }

      // Create reservation
      const userInfo = app.globalData.userInfo || {}
      const docData = {
        date: new Date(booking.date + 'T00:00:00'),
        time: normalizedTime,
        exclusiveType: 'none',
        isPartner: false,
        room: normalizedRoom,
        roomName: roomName,
        standard: Number(booking.standard) || 0,
        customerName: String(booking.customerName).trim(),
        phone: String(booking.phone || '').trim(),
        guestCount: isChessRoom ? 0 : (Number(booking.guestCount) || 0),
        remark: String(booking.remark || '').trim(),
        dishPrice: isChessRoom ? 0 : (Number(booking.dishPrice) || 0),
        hasIncome: false,
        status: 'confirmed',
        createdBy: userInfo._id || '',
        createdByName: userInfo.name || userInfo.nickName || ''
      }

      const result = await db.addDoc(COLLECTIONS.RESERVATION, docData)

      return {
        success: true,
        data: {
          id: result._id,
          customerName: docData.customerName,
          date: booking.date,
          time: docData.time,
          roomName: roomName,
          guestCount: docData.guestCount
        }
      }
    } catch (err) {
      console.error('[AI Chat] Booking error:', err)
      return { success: false, error: '创建预约失败，请稍后重试或手动创建' }
    }
  },

  /**
   * Fetch purchase context data (reusable to avoid duplicate queries)
   */
  async _fetchPurchaseContext(dbInst, monthStartDate) {
    const _ = dbInst.command
    const monthPurchase = await db.queryAll(COLLECTIONS.PURCHASE, {
      createdAt: _.gte(monthStartDate)
    })
    const purchaseData = monthPurchase.data || []
    const totalPurchase = purchaseData.reduce((s, p) => s + (p.amount || 0), 0)
    const purchaseByCategory = {}
    purchaseData.forEach(p => {
      const cat = p.category || '其他'
      purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + (p.amount || 0)
    })
    const pendingCount = purchaseData.filter(p => p.status === 'pending').length
    return { purchaseData, totalPurchase, purchaseByCategory, pendingCount }
  },

  /**
   * Fetch business data as context for AI based on user's question keywords
   */
  async _fetchDataContext(userText) {
    const dbInst = db.getDb()
    const _ = dbInst.command
    const now = new Date()
    const today = formatDate(now)
    const monthRange = getMonthRange(0)
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1)

    const contextParts = []
    const text = userText.toLowerCase()

    // Permission-gated keywords: only fetch data the user is allowed to see
    const permReservation = hasPermission('reservation', ACTIONS.VIEW)
    const permIncome = hasPermission('income', ACTIONS.VIEW)
    const permExpense = hasPermission('expense', ACTIONS.VIEW)
    const permPurchase = hasPermission('purchase', ACTIONS.VIEW)
    const permDashboard = hasPermission('dashboard', ACTIONS.VIEW)

    // Keywords mapping (gated by permissions)
    const needReservation = permReservation && (text.includes('预约') || text.includes('今天') || text.includes('明天') || text.includes('排班') || text.includes('忙'))
    const needIncome = permIncome && (text.includes('收入') || text.includes('营业') || text.includes('营收') || text.includes('赚') || text.includes('进账'))
    const needExpense = permExpense && (text.includes('支出') || text.includes('花费') || text.includes('开销') || text.includes('成本') || text.includes('花了') || text.includes('费用'))
    const needPurchase = permPurchase && (text.includes('采购') || text.includes('进货') || text.includes('买'))
    const needSummary = permDashboard && (text.includes('经营') || text.includes('建议') || text.includes('怎么样') || text.includes('总结') || text.includes('概况') || text.includes('状况') || text.includes('情况') || text.includes('分析'))
    const hasAnyPerm = permReservation || permIncome || permExpense || permPurchase || permDashboard
    // needSummary implies expense+purchase+income for complete business overview
    const needAll = hasAnyPerm && (needSummary || (text.length < 10 && !needReservation && !needIncome && !needExpense && !needPurchase))
    const effectiveNeedExpense = needExpense || (needSummary && permExpense)
    const effectiveNeedPurchase = needPurchase || (needSummary && permPurchase)
    const effectiveNeedIncome = needIncome || (needSummary && permIncome)

    // Cache purchase data to avoid duplicate queries
    let purchaseCache = null
    // Cache cloud function result to avoid duplicate calls
    let financeCache = null

    try {
      if (needReservation || needAll) {
        const todayRes = await db.queryAll(COLLECTIONS.RESERVATION, {
          date: _.gte(new Date(now.getFullYear(), now.getMonth(), now.getDate())).and(_.lt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))),
          status: _.neq('cancelled')
        }, 'time', 'asc')
        const todayList = (todayRes.data || []).map(r =>
          `${r.customerName || '未知'} ${r.time || ''} ${r.guestCount ? r.guestCount + '人' : ''} ${r.roomName || ''} ${r.status === 'completed' ? '✓已完成' : r.status === 'confirmed' ? '已确认' : '待确认'}`
        ).join('\n')
        contextParts.push(`【今日预约(${today}) 共${todayRes.total}个】\n${todayList || '暂无预约'}`)

        const monthRes = await db.queryAll(COLLECTIONS.RESERVATION, {
          date: _.gte(monthStartDate),
          status: _.neq('cancelled')
        })
        contextParts.push(`【本月预约总数】${monthRes.total}个`)
      }

      if (effectiveNeedIncome || needAll) {
        // 收入总额使用云函数数据（与经营报表同源）
        if (!financeCache) {
          financeCache = await wx.cloud.callFunction({
            name: 'getFinanceStats',
            data: { startDate: monthRange.start, endDate: monthRange.end, periodType: 'month' }
          })
        }
        const fResult = financeCache.result
        if (fResult && fResult.success && fResult.data) {
          const f = fResult.data
          const incomeByType = f.incomeByType || {}
          const typeBreakdown = Object.entries(incomeByType).map(([t, a]) => `${t}: ${formatAmount(a)}元`).join(', ')
          contextParts.push(`【本月收入（经营报表口径）】总计 ${formatAmount(f.totalIncome)}元\n分类: ${typeBreakdown || '暂无'}`)
        } else {
          // 云函数失败降级
          const monthIncome = await db.queryAll(COLLECTIONS.INCOME, {
            date: _.gte(monthRange.start).and(_.lte(monthRange.end))
          })
          const incomeList = (monthIncome.data || [])
          const totalIncome = incomeList.reduce((s, i) => s + (i.amount || 0), 0)
          const byType = {}
          incomeList.forEach(i => {
            const type = i.type || '其他'
            byType[type] = (byType[type] || 0) + (i.amount || 0)
          })
          const typeBreakdown = Object.entries(byType).map(([t, a]) => `${t}: ${formatAmount(a)}元`).join(', ')
          contextParts.push(`【本月收入（降级数据）】总计 ${formatAmount(totalIncome)}元\n分类: ${typeBreakdown || '暂无'}`)
        }

        // 今日收入单独查询（云函数月度数据不含今日拆分，需本地补充）
        const todayIncome = await db.queryAll(COLLECTIONS.INCOME, { date: today })
        const todayTotal = (todayIncome.data || []).reduce((s, i) => s + (i.amount || 0), 0)
        contextParts.push(`【今日收入】${formatAmount(todayTotal)}元`)
      }

      if (effectiveNeedExpense || needAll) {
        // 调用云函数获取财务统计（与经营报表共用唯一计算源，口径永远一致）
        if (!financeCache) {
          financeCache = await wx.cloud.callFunction({
            name: 'getFinanceStats',
            data: { startDate: monthRange.start, endDate: monthRange.end, periodType: 'month' }
          })
        }
        const fResult = financeCache.result
        if (fResult && fResult.success && fResult.data) {
          const f = fResult.data
          contextParts.push(`【本月支出（经营报表口径）】总支出 ${formatAmount(f.totalExpenseAll)}元（采购${formatAmount(f.totalPurchase)} + 运营支出${formatAmount(f.totalExpense)}含固定${formatAmount(f.totalFixed)} + 工资${formatAmount(f.totalSalary)}），净利润 ${formatAmount(f.netProfit)}元`)
        } else {
          // 云函数失败时的降级方案
          const monthExpense = await db.queryAll(COLLECTIONS.EXPENSE, {
            date: _.gte(monthRange.start).and(_.lte(monthRange.end))
          })
          const totalExpense = (monthExpense.data || []).reduce((s, e) => s + (e.amount || 0), 0)
          if (!purchaseCache) {
            purchaseCache = await this._fetchPurchaseContext(dbInst, monthStartDate)
          }
          contextParts.push(`【本月支出（降级数据，可能不完整）】一次性支出 ${formatAmount(totalExpense)}元，采购 ${formatAmount(purchaseCache.totalPurchase)}元。⚠️固定支出和工资未计入，请查看经营报表获取准确数据`)
        }
      }

      if (effectiveNeedPurchase || needAll) {
        // 采购总额使用云函数数据（与经营报表口径一致：只算已完成/未付款，排除待审批/已拒绝）
        if (!financeCache) {
          financeCache = await wx.cloud.callFunction({
            name: 'getFinanceStats',
            data: { startDate: monthRange.start, endDate: monthRange.end, periodType: 'month' }
          })
        }
        const fResult = financeCache.result
        const cloudPurchaseTotal = (fResult && fResult.success && fResult.data) ? fResult.data.totalPurchase : null
        const cloudPurchaseByCategory = (fResult && fResult.success && fResult.data) ? fResult.data.purchaseByCategory : null

        // Local purchase list for detail display
        if (!purchaseCache) {
          purchaseCache = await this._fetchPurchaseContext(dbInst, monthStartDate)
        }

        // Recent purchases for detail view
        const recentPurchase = await db.queryPage(COLLECTIONS.PURCHASE, {}, 1, 10, 'createdAt', 'desc')
        const purchaseList = (recentPurchase.data || []).map(p =>
          `${formatDate(p.createdAt)} ${p.name || p.item || ''} ${p.quantity || ''}${p.unit || ''} ${p.amount ? formatAmount(p.amount) + '元' : ''} ${p.status === 'approved' ? '✓已审批' : p.status === 'pending' ? '待审批' : p.status || ''}`
        ).join('\n')

        const displayTotal = cloudPurchaseTotal !== null ? formatAmount(cloudPurchaseTotal) : formatAmount(purchaseCache.totalPurchase)
        const displayBreakdown = cloudPurchaseByCategory
          ? Object.entries(cloudPurchaseByCategory).map(([c, a]) => `${c}: ${formatAmount(a)}元`).join(', ')
          : Object.entries(purchaseCache.purchaseByCategory).map(([c, a]) => `${c}: ${formatAmount(a)}元`).join(', ')

        contextParts.push(`【本月采购】总计 ${displayTotal}元（共${purchaseCache.purchaseData.length}笔，待审批${purchaseCache.pendingCount}笔）\n分类: ${displayBreakdown || '暂无'}\n最近采购:\n${purchaseList || '暂无采购记录'}`)
      }

    } catch (err) {
      console.error('[AI Chat] Fetch data error:', err)
      contextParts.push('【注意】部分数据查询失败，请基于已有信息回答')
    }

    return contextParts.length > 0
      ? '\n\n当前经营数据：\n' + contextParts.join('\n\n')
      : ''
  },

  async _sendMessage(text) {
    const model = this._getModel()
    if (!model) return

    // Add user message
    const userMsg = {
      id: this._genId(),
      role: 'user',
      content: text,
      streaming: false
    }
    const messages = [...this.data.messages, userMsg]
    this.setData({
      messages,
      inputText: '',
      isLoading: true,
      streamingText: ''
    })
    this._scrollToBottom()

    // Fetch business data as context
    let dataContext = ''
    try {
      dataContext = await this._fetchDataContext(text)
    } catch (e) {
      console.error('[AI Chat] Context fetch error:', e)
    }

    // Build permission context for system prompt
    const permInfo = []
    if (!hasPermission('income', ACTIONS.VIEW)) permInfo.push('收入数据：无权查看')
    if (!hasPermission('income', ACTIONS.ADD)) permInfo.push('录入收入：无权操作')
    if (!hasPermission('expense', ACTIONS.VIEW)) permInfo.push('支出数据：无权查看')
    if (!hasPermission('expense', ACTIONS.ADD)) permInfo.push('录入支出/固定支出：无权操作')
    if (!hasPermission('purchase', ACTIONS.VIEW)) permInfo.push('采购数据：无权查看')
    if (!hasPermission('purchase', ACTIONS.ADD)) permInfo.push('提交采购：无权操作')
    if (!hasPermission('purchase', ACTIONS.APPROVE)) permInfo.push('审批采购：无权操作')
    if (!hasPermission('purchase', ACTIONS.REIMBURSE)) permInfo.push('采购报销：无权操作')
    if (!hasPermission('reservation', ACTIONS.VIEW)) permInfo.push('预约数据：无权查看')
    if (!hasPermission('reservation', ACTIONS.ADD)) permInfo.push('创建预约：无权操作')
    if (!hasPermission('reservation', ACTIONS.EDIT)) permInfo.push('修改/取消预约：无权操作')
    if (!hasPermission('dashboard', ACTIONS.VIEW)) permInfo.push('经营报表：无权查看')
    const permContext = permInfo.length > 0 ? '\n\n【用户权限限制 - 必须严格遵守】\n' + permInfo.join('；') + '。绝对不能透露用户无权查看的数据内容！' : ''

    // Build system prompt with data context (date injected at message time, not module load time)
    const todayStr = formatDate(new Date())
    const systemContent = SYSTEM_PROMPT.replace('__TODAY__', todayStr) + dataContext + permContext

    // Build conversation history for API (only last 6 messages to save tokens)
    const recentMessages = messages.slice(-6)
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...recentMessages.map(m => ({ role: m.role, content: m.content }))
    ]

    // Add placeholder assistant message
    const assistantId = this._genId()
    const assistantMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true
    }
    const messagesWithAssistant = [...this.data.messages, assistantMsg]
    this.setData({ messages: messagesWithAssistant })
    this._scrollToBottom()

    let fullResponse = ''

    try {
      const res = await model.streamText({
        data: {
          model: 'hy3-preview',
          messages: apiMessages
        },
        onText: (chunk) => {
          fullResponse += chunk
          const currentMessages = this.data.messages
          const idx = currentMessages.findIndex(m => m.id === assistantId)
          if (idx === -1) return
          const updated = [...currentMessages]
          // Hide [BOOKING] tags from display
          const displayText = fullResponse
            .replace(/\[BOOKING\][\s\S]*?\[\/BOOKING\]/, '✅ 正在创建预约...')
          updated[idx] = {
            ...updated[idx],
            content: displayText
          }
          this.setData({ messages: updated })
          this._scrollToBottom()
        },
        onFinish: async (finalText) => {
          // Check for booking command
          const bookingResult = await this._handleBookingCommand(finalText || fullResponse)

          const currentMessages = this.data.messages
          const idx = currentMessages.findIndex(m => m.id === assistantId)
          if (idx === -1) return
          const updated = [...currentMessages]

          if (bookingResult) {
            if (bookingResult.success) {
              const d = bookingResult.data
              updated[idx] = {
                ...updated[idx],
                content: `✅ 预约创建成功！\n📋 ${d.customerName} | ${d.date} ${d.time}\n🏠 ${d.roomName} | 👥 ${d.guestCount}人`,
                streaming: false,
                reservationId: d.id
              }
            } else {
              // Replace booking tag with error info
              let displayText = (finalText || fullResponse)
                .replace(/\[BOOKING\][\s\S]*?\[\/BOOKING\]/, '')
                .trim()
              updated[idx] = {
                ...updated[idx],
                content: displayText + '\n\n❌ 预约创建失败：' + bookingResult.error,
                streaming: false
              }
            }
          } else {
            // Normal response - clean up any partial booking tags
            let displayText = (finalText || fullResponse)
              .replace(/\[BOOKING\][\s\S]*?\[\/BOOKING\]/, '')
              .trim()
            updated[idx] = {
              ...updated[idx],
              content: displayText || finalText || fullResponse,
              streaming: false
            }
          }

          this.setData({
            messages: updated,
            isLoading: false,
            streamingText: ''
          })
          this._scrollToBottom()
        }
      })

      if (res.eventStream) {
        for await (const event of res.eventStream) {
          if (event.data === '[DONE]') break
        }
      }
    } catch (err) {
      console.error('[AI Chat] Error:', err)
      const currentMessages = this.data.messages
      const idx = currentMessages.findIndex(m => m.id === assistantId)
      if (idx !== -1) {
        const updated = [...currentMessages]
        let errorMsg = '抱歉，请求出错了，请稍后重试'
        if (err.errMsg && err.errMsg.includes('ModelNotEnabled')) {
          errorMsg = 'AI模型未启用，请在云开发控制台检查AI配置'
        } else if (err.errMsg && err.errMsg.includes('quota')) {
          errorMsg = 'Token额度不足，请购买Token资源包后使用'
        } else if (err.errMsg && err.errMsg.includes('billing')) {
          errorMsg = '计费异常，请检查Token资源包是否有效'
        }
        updated[idx] = {
          ...updated[idx],
          content: errorMsg,
          streaming: false
        }
        this.setData({ messages: updated })
      }
      this.setData({ isLoading: false, streamingText: '' })
    }
  },

  onClearChat() {
    if (this.data.messages.length === 0) return
    wx.showModal({
      title: '清空对话',
      content: '确定清空所有对话记录吗？',
      confirmColor: '#C9A96E',
      success: (res) => {
        if (res.confirm) {
          this._msgIdCounter = 0
          this.setData({ messages: [], scrollToId: '' })
        }
      }
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onViewReservation(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: '/pages/reservation-detail/index?id=' + id + '&from=ai-chat'
      })
    }
  }
})
