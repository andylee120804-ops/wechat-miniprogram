const BasePage = require('./BasePage')

class AnnouncementsPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'announcements/index')
  }

  async getAnnouncements() {
    return this.getData('announcements')
  }

  async canAddAnnouncement() {
    return this.getData('canAddAnnouncement')
  }

  async isCreateModalVisible() {
    return this.getData('showCreateModal')
  }

  async openCreateModal() {
    await this.callMethod('onAddAnnouncement')
    await new Promise(r => setTimeout(r, 500))
  }

  async closeCreateModal() {
    await this.callMethod('onCloseModal')
    await new Promise(r => setTimeout(r, 300))
  }

  async fillCreateForm(title, content, options = {}) {
    await this.setData({
      createTitle: title,
      createContent: content,
      createPriority: options.priority || 'normal',
      createNeedsConfirm: !!options.needsConfirm,
      createStartDate: options.startDate || '',
      createEndDate: options.endDate || ''
    })
  }

  async submitCreate() {
    await this.callMethod('onSaveAnnouncement')
    await new Promise(r => setTimeout(r, 2000))
  }

  async getCreateFormData() {
    return {
      createTitle: await this.getData('createTitle'),
      createContent: await this.getData('createContent'),
      createPriority: await this.getData('createPriority'),
      createNeedsConfirm: await this.getData('createNeedsConfirm'),
      createStartDate: await this.getData('createStartDate'),
      createEndDate: await this.getData('createEndDate')
    }
  }
}

module.exports = AnnouncementsPage
