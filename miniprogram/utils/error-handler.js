/**
 * error-handler.js - Enhanced cloud error handling
 */

const ERROR_MESSAGES = {
  '-1': '网络连接失败，请检查网络',
  '-501001': '数据库操作失败',
  '-502001': '云函数调用失败',
  'default': '操作失败，请重试'
}

/**
 * Handle cloud API errors with user-friendly messages
 * @param {Error} err - The error object from cloud call
 * @param {string} context - Optional context description for the error
 */
function handleCloudError(err, context) {
  context = context || ''
  wx.hideLoading()

  const code = err.errCode || err.code
  let msg = ERROR_MESSAGES[String(code)] || ERROR_MESSAGES['default']

  // Override for specific error messages
  if (err.message && err.message.includes('permission')) {
    msg = '权限不足，无法执行此操作'
  }
  if (err.message && (err.message.includes('network') || err.message.includes('timeout'))) {
    msg = '网络异常，请稍后重试'
  }
  // 预约冲突错误
  if (err.message && err.message.includes('该时段已存在预约')) {
    msg = '时间冲突，请更换时间或包厢'
  }

  const title = context ? `${context}: ${msg}` : msg
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 3000
  })

  console.error(`[CloudError] ${context}:`, err)
}

module.exports = {
  handleCloudError,
  ERROR_MESSAGES
}
