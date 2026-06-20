/**
 * getAttendance - 查询考勤情况
 * Atomic API for WeChat Mini Program AI SKILL
 */
const { queryAll, COLLECTIONS } = require('../../../utils/db')
const { formatDate } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

async function getAttendance({ date, name }) {
  try {
    if (!hasPermission('attendance', ACTIONS.VIEW)) {
      return { isError: true, content: [{ type: 'text', text: '您没有查看考勤的权限' }] }
    }

    const dbInst = require('../../../utils/db').getDb()
    const _ = dbInst.command
    const targetDate = date || formatDate(new Date())

    // Build query
    const where = {}
    if (name) {
      where.staffName = name
    }

    // Date filter
    const parts = targetDate.split('-')
    const dayStart = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0, 0, 0)
    const dayEnd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 23, 59, 59)
    where.clockInTime = _.gte(dayStart).and(_.lte(dayEnd))

    const { data: records } = await queryAll(COLLECTIONS.CLOCKIN, where, 'clockInTime', 'asc')

    if (records.length === 0) {
      return { isError: false, content: [{ type: 'text', text: `${targetDate}暂无考勤记录` }], structuredContent: { date: targetDate, total: 0, onTime: 0, late: 0, records: [] } }
    }

    const onTime = records.filter(r => !r.isLate).length
    const late = records.filter(r => r.isLate).length
    const notClockedOut = records.filter(r => !r.clockOutTime).length

    const list = records.map(r => {
      const clockIn = r.clockInTime ? new Date(r.clockInTime) : null
      const clockOut = r.clockOutTime ? new Date(r.clockOutTime) : null
      const inTime = clockIn ? `${String(clockIn.getHours()).padStart(2, '0')}:${String(clockIn.getMinutes()).padStart(2, '0')}` : '未签到'
      const outTime = clockOut ? `${String(clockOut.getHours()).padStart(2, '0')}:${String(clockOut.getMinutes()).padStart(2, '0')}` : '未签退'
      const lateTag = r.isLate ? ' ⚠️迟到' : ''
      return `${r.staffName || ''} 签到:${inTime} 签退:${outTime} 工时:${r.workHours || 0}h${lateTag}`
    }).join('\n')

    const summary = `${targetDate}考勤：${records.length}人出勤，${onTime}人准时，${late}人迟到，${notClockedOut}人未签退\n${list}`

    return {
      isError: false,
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        date: targetDate,
        total: records.length,
        onTime,
        late,
        notClockedOut,
        records: records.map(r => ({
          staffName: r.staffName || '',
          clockInTime: r.clockInTime ? formatDate(new Date(r.clockInTime)) + ' ' + new Date(r.clockInTime).toTimeString().slice(0, 5) : '',
          clockOutTime: r.clockOutTime ? new Date(r.clockOutTime).toTimeString().slice(0, 5) : '',
          workHours: r.workHours || 0,
          isLate: !!r.isLate
        }))
      }
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `查询考勤失败: ${err.message}` }] }
  }
}

module.exports = getAttendance
