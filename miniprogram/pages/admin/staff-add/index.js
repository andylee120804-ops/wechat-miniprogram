const app = getApp()
const { log } = require('../../../utils/logger')
const { handleCloudError } = require('../../../utils/error-handler')
const { ACTIONS } = require('../../../utils/permission')
const { COLLECTIONS } = require('../../../utils/db')
const db = require('../../../utils/db')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    isEdit: false,
    canEdit: false,
    id: '',
    name: '',
    role: 'admin',
    wechatId: '',
    phone: '',
    salary: '',
    hireDate: '',
    submitting: false,
    permissions: {
      purchase: { view: false, add: false, edit: false, delete: false },
      reservation: { view: false, add: false, edit: false, delete: false },
      income: { view: false, add: false, edit: false, delete: false },
      expense: { view: false, add: false, edit: false, delete: false },
      announcement: { view: false, add: false, edit: false, delete: false },
      staff: { view: false, add: false, edit: false, delete: false },
      attendance: { view: false },
      dashboard: { view: false, export: false }
    },
    roleOptions: [
      { value: 'boss', label: '老板' },
      { value: 'admin', label: '管理员' },
      { value: 'purchase', label: '采购主管' },
      { value: 'chef', label: '厨师' },
      { value: 'waiter', label: '服务员' }
    ],
    moduleOptions: [
      { key: 'purchase', name: '采购管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'reservation', name: '预约管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'income', name: '收入管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'expense', name: '支出管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'announcement', name: '公告管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'staff', name: '员工管理', actions: ['view', 'add', 'edit', 'delete'] },
      { key: 'attendance', name: '考勤打卡', actions: ['view'] },
      { key: 'dashboard', name: '经营报表', actions: ['view', 'export'] }
    ],
    showDeleteModal: false
  },

  onLoad(options) {
    const isEdit = !!(options && options.id)
    const userInfo = app.globalData.userInfo || {}
    // 只有 admin 可以操作员工管理
    if (userInfo.role !== 'admin') {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, isEdit, canEdit: true, id: options.id || '' })
    if (isEdit) {
      this.loadExisting()
    }
  },

  onBack() {
    // Close any open modals first
    this.setData({ showDeleteModal: false }, () => {
      try {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/me/index' }) })
        } else {
          wx.switchTab({ url: '/pages/me/index' })
        }
      } catch (e) {
        wx.switchTab({ url: '/pages/me/index' })
      }
    })
  },

  async loadExisting() {
    this.setData({ loading: true })
    try {
      const [staffDoc, permRes] = await Promise.all([
        db.getDoc(COLLECTIONS.STAFF, this.data.id),
        db.queryAll(COLLECTIONS.PERMISSIONS, { staffId: this.data.id })
      ])
      if (!staffDoc) {
        wx.showToast({ title: '员工不存在', icon: 'none' })
        setTimeout(function() { wx.navigateBack() }, 1500)
        return
      }
      const s = staffDoc
      const perms = (permRes.data && permRes.data[0]) ? permRes.data[0].permissions || [] : []

      // Build permMap: { module: ['view','add',...] } from stored data
      const permMap = {}
      perms.forEach(p => { permMap[p.module] = p.actions || [] })

      // Convert array format to { action: boolean } format for the UI
      const defaultPerms = {
        purchase: { view: false, add: false, edit: false, delete: false },
        reservation: { view: false, add: false, edit: false, delete: false },
        income: { view: false, add: false, edit: false, delete: false },
        expense: { view: false, add: false, edit: false, delete: false },
        announcement: { view: false, add: false, edit: false, delete: false },
        staff: { view: false, add: false, edit: false, delete: false },
        attendance: { view: false },
        dashboard: { view: false, export: false }
      }
      // Overlay stored permissions on top of defaults
      Object.keys(permMap).forEach(mod => {
        if (defaultPerms[mod]) {
          const actions = permMap[mod]
          Object.keys(defaultPerms[mod]).forEach(a => {
            defaultPerms[mod][a] = actions.includes(a)
          })
        }
      })

      this.setData({
        name: s.name || '',
        role: s.role || 'admin',
        wechatId: s.wechatId || '',
        phone: s.phone || '',
        salary: s.salary ? String(s.salary) : '',
        hireDate: s.hireDate || '',
        permissions: defaultPerms
      })
    } catch (err) {
      this.setData({ loading: false })
      handleCloudError(err, '加载员工')
    }
  },

  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onWechatIdInput(e) { this.setData({ wechatId: e.detail.value }) },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onSalaryInput(e) { this.setData({ salary: e.detail.value }) },
  onHireDateChange(e) { this.setData({ hireDate: e.detail.value }) },
  onRoleChange(e) { this.setData({ role: e.currentTarget.dataset.value }) },

  onPermChange(e) {
    const { module, action } = e.currentTarget.dataset
    if (!module || !action) return
    const perms = this.data.permissions
    if (!perms[module]) return
    this.setData({
      permissions: {
        ...perms,
        [module]: { ...perms[module], [action]: !perms[module][action] }
      }
    })
  },

  onModuleSelectAll(e) {
    const module = e.currentTarget.dataset.module
    const perms = this.data.permissions
    const modOption = this.data.moduleOptions.find(m => m.key === module)
    if (!modOption) return
    const allSelected = modOption.actions.every(a => perms[module][a])
    const updatedModule = { ...perms[module] }
    modOption.actions.forEach(a => { updatedModule[a] = !allSelected })
    this.setData({
      permissions: { ...perms, [module]: updatedModule }
    })
  },

  async onSubmit() {
    const { name, role, wechatId, phone, salary, permissions } = this.data
    if (!name.trim() || !wechatId.trim()) {
      wx.showToast({ title: '请填写姓名和微信号', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const dbInst = db.getDb()
      const userInfo = app.globalData.userInfo
      const staffData = {
        name: name.trim(),
        role,
        wechatId: wechatId.trim(),
        phone: phone.trim(),
        salary: salary ? parseFloat(salary) : 0,
        hireDate: this.data.hireDate,
        updatedAt: new Date()
      }
      if (!this.data.isEdit) {
        staffData.status = 'active'
        staffData.createdBy = userInfo._id
        staffData.createdAt = new Date()
      }

      if (this.data.isEdit) {
        const res = await wx.cloud.callFunction({
          name: 'updateStaff',
          data: {
            staffId: this.data.id,
            staffData,
            permissions,
            callerRole: userInfo.role
          }
        })
        if (res.result && res.result.success === false) {
          wx.showToast({ title: res.result.message || '更新失败', icon: 'none' })
          this.setData({ submitting: false })
          return
        }
      } else {
        const res = await db.addDoc(COLLECTIONS.STAFF, staffData)
        this.setData({ id: res._id })

        // Save permissions for new staff
        const permArray = Object.entries(permissions)
          .filter(([key, vals]) => Object.values(vals).some(v => v))
          .map(([module, actions]) => ({ module, actions: Object.entries(actions).filter(([, v]) => v).map(([a]) => a) }))
        await db.addDoc(COLLECTIONS.PERMISSIONS, {
          staffId: res._id, permissions: permArray, updatedBy: userInfo._id, updatedAt: new Date()
        })
      }

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
    const userInfo = app.globalData.userInfo || {}
    if (userInfo.role !== 'admin') {
      wx.showToast({ title: '无权限删除', icon: 'none' })
      return
    }
    try {
      await db.updateDoc(COLLECTIONS.STAFF, this.data.id, { status: 'inactive' })
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
