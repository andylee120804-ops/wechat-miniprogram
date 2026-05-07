const app = getApp()
const { getRoleName } = require('../../../utils/helpers')
const { hasPermission, ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')
const { handleCloudError } = require('../../../utils/error-handler')

const PERMISSION_MODULE_NAMES = {
  purchase: '采购', reservation: '预约', income: '收入',
  staff: '员工', dashboard: '报表', expense: '支出'
}

function getPermissionModules(perms) {
  if (!perms || perms.length === 0) return []
  if (perms.find(p => p.module === '*')) return ['全部权限']
  return perms.map(p => PERMISSION_MODULE_NAMES[p.module] || p.module)
}

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    loading: true,
    staffList: [],
    _loaded: false
  },

  onLoad() {
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44 })
  },

  onShow() {
    if (!hasPermission('staff', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    this.loadData()
  },

  onBack: function() {
    wx.navigateBack()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [staffRes, permRes] = await Promise.all([
        db.queryAll(COLLECTIONS.STAFF, { status: 'active' }),
        db.queryAll(COLLECTIONS.PERMISSIONS, {})
      ])

      const permMap = {}
      ;(permRes.data || []).forEach(p => { permMap[p.staffId] = p.permissions || [] })

      const staffList = (staffRes.data || []).map(s => ({
        ...s,
        roleName: getRoleName(s.role),
        nameInitial: (s.name || '?').charAt(0),
        permissionModules: (s.role === 'admin' || s.role === 'boss') ? ['全部权限'] : getPermissionModules(permMap[s._id] || [])
      }))

      this.setData({ loading: false, staffList, _loaded: true })
    } catch (err) {
      handleCloudError(err, '加载员工列表')
      this.setData({ loading: false })
    }
  },

  onAddStaff() {
    if (!hasPermission('staff', ACTIONS.ADD)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/admin/staff-add/index' })
  },

  onEditStaff(e) {
    const id = e.currentTarget.dataset.id
    if (!hasPermission('staff', ACTIONS.EDIT)) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/admin/staff-add/index?id=${id}` })
  }
})
