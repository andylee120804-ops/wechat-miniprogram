const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合列表 — 对应 miniprogram/utils/db.js 中的 COLLECTIONS
const ALL_COLLECTIONS = [
  'reservation',
  'purchase',
  'income',
  'expense',
  'fixed_expense',
  'clockin',
  'operation_log',
  'announcement',
  'notification_log'
]

/**
 * 分页获取所有记录
 */
async function fetchAll(collection) {
  const MAX = 100
  let all = []
  const countRes = await db.collection(collection).count()
  const total = countRes.total
  if (total === 0) return all

  const batches = Math.ceil(total / MAX)
  for (let i = 0; i < batches; i++) {
    const res = await db.collection(collection)
      .skip(i * MAX)
      .limit(MAX)
      .get()
    all = all.concat(res.data)
  }
  return all
}

/**
 * 批量删除（每次最多20条）
 */
async function batchDelete(collection, ids) {
  const MAX_DELETE = 20
  let deleted = 0
  for (let i = 0; i < ids.length; i += MAX_DELETE) {
    const batch = ids.slice(i, i + MAX_DELETE)
    await db.collection(collection).where({
      _id: _.in(batch)
    }).remove()
    deleted += batch.length
  }
  return deleted
}

/**
 * 清空指定集合
 */
async function clearCollection(collection) {
  const records = await fetchAll(collection)
  if (records.length === 0) return { collection, deleted: 0 }
  const ids = records.map(r => r._id)
  const deleted = await batchDelete(collection, ids)
  return { collection, deleted }
}

exports.main = async (event, context) => {
  const { collections } = event

  // 如果没有指定集合，使用默认的所有测试集合
  const targetCollections = Array.isArray(collections) && collections.length > 0
    ? collections
    : ALL_COLLECTIONS

  // 校验不支持的集合名
  const supported = new Set(ALL_COLLECTIONS)
  for (const c of targetCollections) {
    if (!supported.has(c)) {
      return {
        success: false,
        message: `不支持集合 "${c}"，仅支持: ${ALL_COLLECTIONS.join(', ')}`
      }
    }
  }

  try {
    const results = []
    for (const collection of targetCollections) {
      const result = await clearCollection(collection)
      results.push(result)
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0)

    return {
      success: true,
      message: `清理完成，共删除 ${totalDeleted} 条记录`,
      data: {
        totalDeleted,
        details: results
      }
    }
  } catch (err) {
    console.error('cleanupData 错误:', err)
    return {
      success: false,
      message: '清理失败: ' + err.message
    }
  }
}
