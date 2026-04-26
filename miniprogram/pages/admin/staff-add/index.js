const app = getApp()
const { getRoleName } = require('../../../utils/helpers')
const { log, LOG_TYPES } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { COLLECTIONS } = require('../../../utils/db')

Page({
  data: {
    theme: {},
    isEdit: false,
    id: '',
    name: '',
    role: 'admin',
    wechatId: '',
    phone: '',
    salary: '',
    submitting: false,
    permissions: {
      purchase: { view: false, add: false, edit: false, delete: false },
      reservation: { view: false, add: false, edit: false, delete: false },
      income: { view: false, add: false, edit: false, delete: false },
      staff: { view: false, add: false, edit: false, delete: false },
      dashboard: { view: false, export: false }
    },
    roleOptions: [
      { value: 'boss', label: '老板' },
      { value: 'admin', label: '行政主管' },
      { value: 'purchase', label: '采购主管' },
      { value: 'chef', label: '厨师' },
      { value: 'waiter', label: '服务员' }
    ],
    moduleOptions: [
      { key: 'purchase', name: '采购管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'reservation', name: '预约管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'income', name: '收入管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'staff', name: '员工管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'dashboard', name: '经营报表', actions: ['view', 'export'] }
    ],
    showDeleteModal: false
  },

  onLoad(options) {
    const theme = app.getThemePageData()
    this.setData({ theme })
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadExisting()
    }
  },

  async loadExisting() {
    try {
      const db = wx.cloud.database()
      const [staffRes, permRes] = await Promise.all([
        db.collection(COLLECTIONS.STAFF).doc(this.data.id).get(),
        db.collection('permissions').where({ staffId: this.data.id }).get()
      ])
      const s = staffRes.data
      const perms = permRes.data[0]?.permissions || []
      const permMap = {}
      perms.forEach(p => { permMap[p.module] = p.actions })
      this.setData({
        name: s.name || '',
        role: s.role || 'admin',
        wechatId: s.wechatId || '',
        phone: s.phone || '',
        salary: s.salary ? String(s.salary) : '',
        permissions: {
          purchase: permMap.purchase || { view: false, add: false, edit: false, delete: false },
          reservation: permMap.reservation || { view: false, add: false, edit: false, delete: false },
          income: permMap.income || { view: false, add: false, edit: false, delete: false },
          staff: permMap.staff || { view: false, add: false, edit: false, delete: false },
          dashboard: permMap.dashboard || { view: false, export: false }
        }
      })
    } catch (err) {
      handleCloudError(err, '加载员工')
    }
  },

  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onWechatIdInput(e) { this.setData({ wechatId: e.detail.value }) },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onSalaryInput(e) { this.setData({ salary: e.detail.value }) },
  onRoleChange(e) { this.setData({ role: e.currentTarget.dataset.value }) },

  onPermChange(e) {
    const { module, action } = e.currentTarget.dataset
    const perms = this.data.permissions
    perms[module][action] = !perms[module][action]
    this.setData({ permissions: perms })
  },

  onModuleSelectAll(e) {
    const module = e.currentTarget.dataset.module
    const perms = this.data.permissions
    const allSelected = this.data.moduleOptions.find(m => m.key === module)?.actions.every(a => perms[module][a])
    const actions = this.data.moduleOptions.find(m => m.key === module)?.actions || []
    actions.forEach(a => { perms[module][a] = !allSelected })
    this.setData({ permissions: perms })
  },

  async onSubmit() {
    const { name, role, wechatId, phone, salary, permissions } = this.data
    if (!name.trim() || !wechatId.trim()) {
      wx.showToast({ title: '请填写姓名和微信号', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const db = wx.cloud.database()
      const userInfo = app.globalData.userInfo
      const staffData = {
        name: name.trim(),
        role,
        wechatId: wechatId.trim(),
        phone: phone.trim(),
        salary: salary ? parseFloat(salary) : 0,
        updatedAt: new Date()
      }
      if (!this.data.isEdit) {
        staffData.status = 'active'
        staffData.createdBy = userInfo._id
        staffData.createdAt = new Date()
      }

      if (this.data.isEdit) {
        await db.collection(COLLECTIONS.STAFF).doc(this.data.id).update({ data: staffData })
      } else {
        const res = await db.collection(COLLECTIONS.STAFF).add({ data: staffData })
        this.setData({ id: res._id })
      }

      // Save permissions
      const permArray = Object.entries(permissions)
        .filter(([key, vals]) => Object.values(vals).some(v => v))
        .map(([module, actions]) => ({ module, actions: Object.entries(actions).filter(([, v]) => v).map(([a]) => a) }))

      const existingPerm = await db.collection('permissions').where({ staffId: this.data.id }).get()
      if (existingPerm.data.length > 0) {
        await db.collection('permissions').doc(existingPerm.data[0]._id).update({
          data: { permissions: permArray, updatedBy: userInfo._id, updatedAt: new Date() }
        })
      } else {
        await db.collection('permissions').add({
          data: { staffId: this.data.id, permissions: permArray, updatedBy: userInfo._id, updatedAt: new Date() }
        })
      }

      // Update permissionsUpdatedAt to force re-login
      await db.collection(COLLECTIONS.STAFF).doc(this.data.id).update({ data: { permissionsUpdatedAt: new Date() } })

      log(this.data.isEdit ? 'STAFF_UPDATE' : 'STAFF_CREATE', { name: staffData.name, role: staffData.role })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      handleCloudError(err, '保存员工')
    } finally {
      this.setData({ submitting: false })
    }
  },

  onDelete() {
    this.setData({ showDeleteModal: true })
  },

  async onConfirmDelete() {
    this.setData({ showDeleteModal: false })
    try {
      const db = wx.cloud.database()
      await db.collection(COLLECTIONS.STAFF).doc(this.data.id).update({ data: { status: 'inactive' } })
      log('STAFF_DELETE', { name: this.data.name })
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      handleCloudError(err, '删除员工')
    }
  },

  onCloseDelete() {
    this.setData({ showDeleteModal: false })
  }
})
