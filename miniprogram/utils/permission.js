/**
 * permission.js - Permission checker for role-based access control
 * Extracted from page-level logic into a reusable utility.
 */

// Standardized action names — use ACTIONS.VIEW / ACTIONS.ADD / ACTIONS.EDIT / ACTIONS.DELETE
const ACTIONS = {
  VIEW: 'view',
  ADD: 'add',
  EDIT: 'edit',
  DELETE: 'delete'
}

/**
 * Check if the current user has permission for a module/action.
 * Boss role always returns true.
 * @param {string} module - The module name (e.g. 'income', 'purchase', 'expense', 'attendance', 'announcement')
 * @param {string} action - The action name (e.g. 'view', 'add', 'edit', 'delete')
 * @returns {boolean} Whether the user has permission
 */
function hasPermission(module, action) {
  try {
    var app = getApp()
    if (!app || !app.globalData) return false

    var userInfo = app.globalData.userInfo
    if (!userInfo) return false

    // Boss has all permissions
    if (userInfo.role === 'boss') return true

    var perms = app.globalData.permissions || []
    if (perms.length === 0) return false

    // Find the permission entry for this module
    var perm = null
    for (var i = 0; i < perms.length; i++) {
      if (perms[i].module === module) {
        perm = perms[i]
        break
      }
    }

    if (!perm) return false

    // Check if the action is allowed (wildcard '*' grants all actions)
    var actions = perm.actions || []
    return actions.indexOf(action) !== -1 || actions.indexOf('*') !== -1
  } catch (e) {
    console.error('[Permission] Error checking permission:', e)
    return false
  }
}

/**
 * Check permission and show denial feedback if not allowed.
 * @param {string} module - The module name
 * @param {string} action - The action name
 * @param {Function} [onDeny] - Optional callback when permission is denied.
 *                               If not provided, shows a default toast.
 * @returns {boolean} Whether the user has permission
 */
function checkPermission(module, action, onDeny) {
  if (!hasPermission(module, action)) {
    if (onDeny && typeof onDeny === 'function') {
      onDeny()
    } else {
      wx.showToast({
        title: '无权限执行此操作',
        icon: 'none',
        duration: 2000
      })
    }
    return false
  }
  return true
}

module.exports = {
  ACTIONS,
  hasPermission: hasPermission,
  checkPermission: checkPermission
}
