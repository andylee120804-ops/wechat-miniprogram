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

  async canEditAnnouncement() {
    return this.getData('canEditAnnouncement')
  }

  async canDeleteAnnouncement() {
    return this.getData('canDeleteAnnouncement')
  }
}

module.exports = AnnouncementsPage
