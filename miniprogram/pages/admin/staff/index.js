const app = getApp()
const { getRoleName } = require('../../../utils/helpers')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    loading: true,
    staffList: []
  },

  onShow() {
    if (!app.hasPermission('staff', 'view')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      wx.navigateBack()
      return
    }
    const theme = app.getThemePageData()
    this.setData({ theme })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const [staffRes, permRes] = await Promise.all([
        db.collection(COLLECTIONS.STAFF).where({ status: 'active' }).get(),
        db.collection('permissions').get()
      ])

      const permMap = {}
      permRes.data.forEach(p => { permMap[p.staffId] = p.permissions || [] })

      const staffList = staffRes.data.map(s => ({
        ...s,
        roleName: getRoleName(s.role),
        permissions: permMap[s._id] || []
      }))

      this.setData({ loading: false, staffList })
    } catch (err) {
      this.setData({ loading: false })
    }
  },

  getPermissionModules(perms) {
    if (!perms || perms.length === 0) return []
    const moduleNames = { purchase: '采购', reservation: '预约', income: '收入', staff: '员工', dashboard: '报表', expense: '支出' }
    const allPerms = perms.find(p => p.module === '*')
    if (allPerms) return ['全部权限']
    return perms.map(p => moduleNames[p.module] || p.module)
  },

  onAddStaff() {
    if (!app.hasPermission('staff', 'add')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/admin/staff-add/index' })
  },

  onEditStaff(e) {
    const id = e.currentTarget.dataset.id
    if (!app.hasPermission('staff', 'edit')) {
      wx.showToast({ title: '无权限', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/admin/staff-add/index?id=${id}` })
  }
})
