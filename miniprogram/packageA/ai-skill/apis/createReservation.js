/**
 * createReservation - 创建预约
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, addDoc, COLLECTIONS } = require('../../../utils/db')
const { formatDate, getExclusiveTypeName } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { log, LOG_TYPES } = require('../../../utils/logger')

const ROOM_MAP = { '大包': 'big', '大包厢': 'big', '小包': 'small', '小包厢': 'small', '棋牌': 'chess', '棋牌室': 'chess' }
const TIME_MAP = { '中午': '中午', '晚上': '晚上', '午': '中午', '晚': '晚上' }
const VALID_ROOMS = ['big', 'small', 'chess']
const VALID_TIMES = ['中午', '晚上']
const VALID_EXCLUSIVE_TYPES = ['none', 'noon', 'night', 'full']

async function createReservation({ customerName, date, time, room, guestCount, phone, remark, standard, dishPrice, exclusiveType }) {
  try {
    // Permission check
    if (!hasPermission('reservation', ACTIONS.ADD)) {
      return { isError: true, content: [{ type: 'text', text: '您没有创建预约的权限' }] }
    }

    // Required fields - same validation as reservation-add page
    if (!customerName || !String(customerName).trim()) {
      return { isError: true, content: [{ type: 'text', text: '缺少客户姓名，请提供客人名字' }] }
    }
    if (!date) {
      return { isError: true, content: [{ type: 'text', text: '缺少日期，请提供预约日期（如2026-06-12）' }] }
    }

    // Date format validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return { isError: true, content: [{ type: 'text', text: '日期格式不正确，请使用YYYY-MM-DD格式（如2026-06-12）' }] }
    }

    // Normalize fields
    const normalizedTime = TIME_MAP[time] || time || '中午'
    if (!VALID_TIMES.includes(normalizedTime)) {
      return { isError: true, content: [{ type: 'text', text: `无效的时段 "${time}"，可选：中午/晚上` }] }
    }

    const normalizedRoom = ROOM_MAP[room] || room || 'big'
    if (!VALID_ROOMS.includes(normalizedRoom)) {
      return { isError: true, content: [{ type: 'text', text: `无效的房间类型 "${room}"，可选：大包/小包/棋牌` }] }
    }

    const normalizedExclusive = VALID_EXCLUSIVE_TYPES.includes(exclusiveType) ? exclusiveType : 'none'
    const isChessRoom = normalizedRoom === 'chess'

    // Non-chess rooms require guestCount >= 1
    if (!isChessRoom) {
      const gc = Number(guestCount)
      if (!gc || gc < 1 || !Number.isInteger(gc) || gc > 999) {
        return { isError: true, content: [{ type: 'text', text: '非棋牌室预约人数必须为1-999之间的整数' }] }
      }
    }

    // Phone format validation (if provided)
    if (phone && String(phone).trim()) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(String(phone).trim())) {
        return { isError: true, content: [{ type: 'text', text: '手机号格式不正确，请提供11位手机号' }] }
      }
    }

    // Dish price validation: required for non-chess rooms
    if (!isChessRoom) {
      const dp = Number(dishPrice)
      if (!dp || dp <= 0) {
        return { isError: true, content: [{ type: 'text', text: '非棋牌室预约必须填写菜价，请提供菜价金额' }] }
      }
    }

    // Validate date not in the past
    const today = formatDate(new Date())
    if (date < today) {
      return { isError: true, content: [{ type: 'text', text: '不能创建过去日期的预约' }] }
    }

    // Determine effective room and name (exclusive types always use big room)
    const effectiveRoom = normalizedExclusive === 'none' ? normalizedRoom : 'big'
    const roomName = normalizedExclusive === 'none'
      ? ({ big: '大包厢', small: '小包厢', chess: '棋牌室' }[normalizedRoom] || '大包厢')
      : getExclusiveTypeName(normalizedExclusive, effectiveRoom)

    // Conflict check - same logic as reservation-add checkReservationConflict()
    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command
    const parts = date.split('-')
    const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
    const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)

    const conditions = [
      { date: _.gte(dayStart).and(_.lte(dayEnd)) },
      { status: 'confirmed' }
    ]

    if (normalizedExclusive === 'none') {
      // Regular room: same time+room OR any full-day exclusive
      conditions.push(_.or([
        { time: normalizedTime, room: effectiveRoom },
        { exclusiveType: 'full' }
      ]))
    } else if (normalizedExclusive === 'noon') {
      // Noon exclusive: same time slot OR any full-day exclusive
      conditions.push(_.or([
        { time: '中午' },
        { exclusiveType: 'full' }
      ]))
    } else if (normalizedExclusive === 'night') {
      // Night exclusive: same time slot OR any full-day exclusive
      conditions.push(_.or([
        { time: '晚上' },
        { exclusiveType: 'full' }
      ]))
    }
    // 'full': check ALL reservations on this date (no extra filter needed)

    const where = _.and(conditions)
    const conflictRes = await queryAll(COLLECTIONS.RESERVATION, where)

    if (conflictRes.data && conflictRes.data.length > 0) {
      const conflict = conflictRes.data[0]
      const conflictDesc = conflict.exclusiveType && conflict.exclusiveType !== 'none'
        ? `该时段已被包场（${getExclusiveTypeName(conflict.exclusiveType, conflict.room || 'big')}）`
        : `${date} ${normalizedTime} ${roomName}已有预约（${conflict.customerName}）`
      return {
        isError: true,
        content: [{ type: 'text', text: conflictDesc }]
      }
    }

    // Create reservation
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    const docData = {
      date: new Date(date + 'T00:00:00'),
      time: normalizedTime,
      exclusiveType: normalizedExclusive,
      isPartner: false,
      room: effectiveRoom,
      roomName: roomName,
      standard: Number(standard) || 0,
      customerName: String(customerName).trim(),
      phone: String(phone || '').trim(),
      guestCount: isChessRoom ? 0 : (Number(guestCount) || 0),
      remark: String(remark || '').trim(),
      dishPrice: isChessRoom ? 0 : (Number(dishPrice) || 0),
      hasIncome: false,
      status: 'confirmed',
      createdBy: userInfo._id || '',
      createdByName: userInfo.name || userInfo.nickName || ''
    }

    const result = await addDoc(COLLECTIONS.RESERVATION, docData)

    // Log creation
    log(LOG_TYPES.RESERVATION_CREATE, '创建预约(AI): ' + docData.customerName, { id: result._id })

    const summary = `预约创建成功！${customerName} | ${date} ${normalizedTime} | ${roomName} | ${isChessRoom ? '' : (guestCount || 0) + '人'}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        id: result._id,
        customerName: docData.customerName,
        date,
        time: normalizedTime,
        room: effectiveRoom,
        roomName,
        guestCount: docData.guestCount,
        status: 'confirmed',
        phone: docData.phone
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `创建预约失败: ${err.message}` }] }
  }
}

module.exports = createReservation
