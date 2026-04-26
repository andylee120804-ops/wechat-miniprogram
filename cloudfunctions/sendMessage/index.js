const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event

  try {
    switch (action) {
      case 'createAnnouncement':
        return await createAnnouncement(event)
      case 'getAnnouncements':
        return await getAnnouncements(event)
      case 'markRead':
        return await markRead(event)
      case 'deleteAnnouncement':
        return await deleteAnnouncement(event)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('sendMessage错误:', err)
    return { success: false, message: '操作失败' }
  }
}

async function createAnnouncement(event) {
  const { title, content, priority, needsConfirm, createdBy, createdByName } = event

  if (!title || !content) {
    return { success: false, message: '标题和内容不能为空' }
  }

  const result = await db.collection('announcement').add({
    data: {
      title,
      content,
      priority: priority || 'normal',
      needsConfirm: !!needsConfirm,
      createdBy: createdBy || '',
      createdByName: createdByName || '',
      active: true,
      readBy: [],
      createdAt: new Date()
    }
  })

  return { success: true, data: { _id: result._id } }
}

async function getAnnouncements(event) {
  const { limit = 20, skip = 0 } = event

  const result = await db.collection('announcement')
    .where({ active: true })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get()

  const total = (await db.collection('announcement')
    .where({ active: true })
    .count()).total

  return { success: true, data: result.data, total }
}

async function markRead(event) {
  const { announcementId, staffId } = event

  if (!announcementId || !staffId) {
    return { success: false, message: '参数不完整' }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: {
      readBy: _.push(staffId)
    }
  })

  return { success: true }
}

async function deleteAnnouncement(event) {
  const { announcementId } = event

  if (!announcementId) {
    return { success: false, message: '缺少公告ID' }
  }

  await db.collection('announcement').doc(announcementId).update({
    data: { active: false }
  })

  return { success: true }
}
