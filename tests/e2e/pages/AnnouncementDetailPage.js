const BasePage = require('./BasePage')

class AnnouncementDetailPage extends BasePage {
  constructor(miniProgram) {
    super(miniProgram, 'announcement-detail/index')
  }

  async openById(id) {
    this.page = await this.miniProgram.reLaunch(`/pages/announcement-detail/index?id=${id}`)
    await new Promise(r => setTimeout(r, 2000))
    await this.waitForData('loading', false, 15000)
    return this.page
  }

  async getAnnouncement() {
    return this.getData('announcement')
  }

  async canEdit() {
    return this.getData('canEdit')
  }

  async needsConfirm() {
    return this.getData('needsConfirm')
  }

  async getCreatorName() {
    const ann = await this.getAnnouncement()
    return ann ? ann.createdByName : null
  }

  async getReadCount() {
    return this.getData('readCount')
  }

  async getReadStaff() {
    return this.getData('readStaff')
  }

  async getUnreadStaff() {
    return this.getData('unreadStaff')
  }

  async confirmRead() {
    await this.callMethod('onConfirmRead')
    await new Promise(r => setTimeout(r, 2000))
  }

  async isEditModalVisible() {
    return this.getData('showEditModal')
  }

  async openEditModal() {
    await this.callMethod('onEdit')
    await new Promise(r => setTimeout(r, 500))
  }

  async closeEditModal() {
    await this.callMethod('onCloseEditModal')
    await new Promise(r => setTimeout(r, 300))
  }

  async getEditFormData() {
    return {
      editTitle: await this.getData('editTitle'),
      editContent: await this.getData('editContent'),
      editPriority: await this.getData('editPriority'),
      editNeedsConfirm: await this.getData('editNeedsConfirm'),
      editStartDate: await this.getData('editStartDate'),
      editEndDate: await this.getData('editEndDate')
    }
  }
}

module.exports = AnnouncementDetailPage
