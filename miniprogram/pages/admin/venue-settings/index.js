const app = getApp()
const { handleCloudError } = require('../../../utils/error-handler')
const { hasPermission, ACTIONS } = require('../../../utils/permission')

Page({
  data: {
    theme: {},
    statusBarHeight: 44,
    venueName: '',
    venueAddress: '',
    venueLatitude: '',
    venueLongitude: '',
    standardList: [],
    partnerStandard: '',
    defaultStandardOptions: [],
    defaultStandardValues: [],
    defaultStandardIndex: 0,
    defaultStandardLabel: '不设默认',
    defaultStandardValue: '',
    allowNoStandard: false,
    venueMapImage: '',
    venueMapImageFileID: '',
    uploadingMap: false,
    shareCoverImage: '',
    shareCoverImageFileID: '',
    uploadingCover: false,
    loading: true,
    saving: false,
    canEdit: false
  },

  onLoad() {
    if (!hasPermission('venueSettings', ACTIONS.VIEW)) {
      wx.showToast({ title: '无权限修改设置', icon: 'none' })
      setTimeout(function() { wx.navigateBack() }, 1500)
      return
    }
    const theme = app.getThemePageData()
    const canEdit = hasPermission('venueSettings', ACTIONS.EDIT)
    this.setData({ theme, statusBarHeight: app.globalData.statusBarHeight || 44, canEdit })
    this.loadSettings()
  },

  onBack() {
    wx.navigateBack()
  },

  async loadSettings() {
    try {
      wx.showLoading({ title: '加载中' })
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: { action: 'getSettings' }
      })
      if (res.result && res.result.success && res.result.data) {
        const d = res.result.data
        const standards = d.mealStandards || [500, 600, 800]
        const partnerStd = d.partnerStandard || 300

        // Build default standard options from standard list + partner
        const defaultStd = d.defaultStandard !== undefined && d.defaultStandard !== '' ? d.defaultStandard : ''
        var options = ['不设默认']
        var optionValues = ['']
        standards.forEach(function(s) {
          options.push('¥' + s)
          optionValues.push(String(s))
        })
        options.push('股东默认（¥' + partnerStd + '）')
        optionValues.push('partner')

        var defaultIndex = 0
        if (defaultStd === 'partner') {
          defaultIndex = options.length - 1
        } else if (defaultStd !== '') {
          var foundIndex = optionValues.indexOf(String(defaultStd))
          if (foundIndex > -1) defaultIndex = foundIndex
        }

        console.log('loadSettings venueMapImage:', d.venueMapImage, 'fileID:', d.venueMapImageFileID)
        this.setData({
          venueName: d.venueName || '',
          venueAddress: d.venueAddress || '',
          venueLatitude: d.venueLatitude || '',
          venueLongitude: d.venueLongitude || '',
          standardList: standards,
          partnerStandard: String(partnerStd),
          defaultStandardOptions: options,
          defaultStandardValues: optionValues,
          defaultStandardLabel: options[defaultIndex] || '不设默认',
          defaultStandardIndex: defaultIndex,
          defaultStandardValue: optionValues[defaultIndex] || '',
          allowNoStandard: d.allowNoStandard || false,
          venueMapImageFileID: d.venueMapImageFileID || '',
          venueMapImage: '', // 先清空，下载完成后再设置
          shareCoverImageFileID: d.shareCoverImageFileID || '',
          shareCoverImage: ''
        })
        // 如果有 fileID，下载到本地展示
        if (d.venueMapImageFileID) {
          this._downloadMapImage(d.venueMapImageFileID)
        }
        if (d.shareCoverImageFileID) {
          this._downloadCoverImage(d.shareCoverImageFileID)
        }
        console.log('setData venueMapImage:', this.data.venueMapImage, 'fileID:', this.data.venueMapImageFileID)
      }
      wx.hideLoading()
      this.setData({ loading: false })
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '加载设置')
      this.setData({ loading: false })
    }
  },

  onNameInput(e) {
    this.setData({ venueName: e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ venueAddress: e.detail.value })
  },

  onStandardItemInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const list = this.data.standardList.slice()
    list[index] = value ? Number(value) : ''
    this.setData({ standardList: list }, function() {
      this._rebuildDefaultOptions()
    })
  },

  onAddStandard() {
    var list = this.data.standardList.slice()
    list.push('')
    this.setData({ standardList: list }, function() {
      this._rebuildDefaultOptions()
    })
  },

  onRemoveStandard(e) {
    var index = e.currentTarget.dataset.index
    var list = this.data.standardList.filter(function(_, i) { return i !== index })
    this.setData({ standardList: list }, function() {
      this._rebuildDefaultOptions()
    })
  },

  onPartnerStandardInput(e) {
    this.setData({ partnerStandard: e.detail.value }, function() {
      this._rebuildDefaultOptions()
    })
  },

  onDefaultStandardChange(e) {
    var index = parseInt(e.detail.value, 10)
    this.setData({
      defaultStandardIndex: index,
      defaultStandardLabel: this.data.defaultStandardOptions[index],
      defaultStandardValue: this.data.defaultStandardValues[index] || ''
    })
  },

  _rebuildDefaultOptions() {
    var partnerStd = parseInt(this.data.partnerStandard, 10) || 300
    var currentVal = this.data.defaultStandardValue
    var options = ['不设默认']
    var optionValues = ['']
    this.data.standardList.forEach(function(s) {
      var num = parseInt(s, 10)
      if (!isNaN(num) && num > 0) {
        options.push('¥' + num)
        optionValues.push(String(num))
      }
    })
    options.push('股东默认（¥' + partnerStd + '）')
    optionValues.push('partner')

    var newIndex = optionValues.indexOf(currentVal)
    if (newIndex === -1) newIndex = 0

    this.setData({
      defaultStandardOptions: options,
      defaultStandardValues: optionValues,
      defaultStandardIndex: newIndex,
      defaultStandardLabel: options[newIndex],
      defaultStandardValue: optionValues[newIndex]
    })
  },

  onAllowNoStandardChange(e) {
    this.setData({ allowNoStandard: !!e.detail.value })
  },

  onUploadMapImage() {
    const that = this
    if (this.data.uploadingMap) return

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0]
        that.setData({ uploadingMap: true })
        wx.showLoading({ title: '上传中' })

        wx.cloud.uploadFile({
          cloudPath: 'venue-map/' + Date.now() + '.jpg',
          filePath: tempFilePath,
          success(uploadRes) {
            const fileID = uploadRes.fileID
            // 保存 cloud fileID，下载到本地展示
            wx.cloud.downloadFile({
              fileID: fileID,
              success: (res) => {
                that.setData({ venueMapImage: res.tempFilePath, venueMapImageFileID: fileID, uploadingMap: false })
                wx.hideLoading()
                wx.showToast({ title: '上传成功', icon: 'success' })
              },
              fail: (err) => {
                console.error('下载导航图失败:', err)
                that.setData({ venueMapImage: '', venueMapImageFileID: fileID, uploadingMap: false })
                wx.hideLoading()
                wx.showToast({ title: '上传成功，请刷新页面', icon: 'none' })
              }
            })
          },
          fail(err) {
            wx.hideLoading()
            that.setData({ uploadingMap: false })
            wx.showToast({ title: '上传失败', icon: 'none' })
            console.error('上传导航图失败:', err)
          }
        })
      }
    })
  },

  onRemoveMapImage() {
    this.setData({ venueMapImage: '', venueMapImageFileID: '' })
  },

  onUploadCoverImage() {
    const that = this
    if (this.data.uploadingCover) return

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0]
        that.setData({ uploadingCover: true })
        wx.showLoading({ title: '上传中' })

        wx.cloud.uploadFile({
          cloudPath: 'share-cover/' + Date.now() + '.jpg',
          filePath: tempFilePath,
          success(uploadRes) {
            const fileID = uploadRes.fileID
            wx.cloud.downloadFile({
              fileID: fileID,
              success: (dlRes) => {
                that.setData({ shareCoverImage: dlRes.tempFilePath, shareCoverImageFileID: fileID, uploadingCover: false })
                wx.hideLoading()
                wx.showToast({ title: '上传成功', icon: 'success' })
              },
              fail: () => {
                that.setData({ shareCoverImage: '', shareCoverImageFileID: fileID, uploadingCover: false })
                wx.hideLoading()
                wx.showToast({ title: '上传成功，请刷新页面', icon: 'none' })
              }
            })
          },
          fail(err) {
            wx.hideLoading()
            that.setData({ uploadingCover: false })
            wx.showToast({ title: '上传失败', icon: 'none' })
            console.error('上传封面图失败:', err)
          }
        })
      }
    })
  },

  onRemoveCoverImage() {
    this.setData({ shareCoverImage: '', shareCoverImageFileID: '' })
  },

  _downloadCoverImage(fileID) {
    if (!fileID) return
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        this.setData({ shareCoverImage: res.tempFilePath })
      },
      fail: (err) => {
        console.error('下载封面图失败:', err)
      }
    })
  },

  _downloadMapImage(fileID) {
    if (!fileID) return
    wx.cloud.downloadFile({
      fileID: fileID,
      success: (res) => {
        console.log('下载导航图成功，tempPath:', res.tempFilePath)
        this.setData({ venueMapImage: res.tempFilePath })
      },
      fail: (err) => {
        console.error('下载导航图失败:', err)
      }
    })
  },

  onPickLocation() {
    const that = this
    wx.getSetting({
      success(settingRes) {
        const fuzzyAuth = settingRes.authSetting['scope.userFuzzyLocation']
        if (fuzzyAuth === false) {
          wx.showModal({
            title: '需要位置权限',
            content: '您之前拒绝了位置权限，请在设置中手动开启',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting({
                  success(openRes) {
                    if (openRes.authSetting['scope.userFuzzyLocation']) {
                      that._getFuzzyThenChoose()
                    }
                  }
                })
              }
            }
          })
        } else {
          that._getFuzzyThenChoose()
        }
      },
      fail() {
        that._getFuzzyThenChoose()
      }
    })
  },

  _getFuzzyThenChoose() {
    const that = this
    // Use getFuzzyLocation to get rough coordinates for chooseLocation centering
    wx.getFuzzyLocation({
      type: 'gcj02',
      success(fuzzyRes) {
        that._doChooseLocation(fuzzyRes.latitude, fuzzyRes.longitude)
      },
      fail() {
        // Fallback: use saved coordinates or no center
        that._doChooseLocation()
      }
    })
  },

  _doChooseLocation(lat, lng) {
    const that = this
    const centerLat = lat || (that.data.venueLatitude ? Number(that.data.venueLatitude) : undefined)
    const centerLng = lng || (that.data.venueLongitude ? Number(that.data.venueLongitude) : undefined)
    wx.chooseLocation({
      latitude: centerLat,
      longitude: centerLng,
      success(res) {
        // Combine name and address for a complete location string
        var address = (res.name && res.address && res.name !== res.address)
          ? res.name + ' (' + res.address + ')'
          : (res.name || res.address || that.data.venueAddress)
        that.setData({
          venueLatitude: String(res.latitude),
          venueLongitude: String(res.longitude),
          venueAddress: address
        })
      },
      fail(err) {
        const msg = err.errMsg || ''
        if (msg.indexOf('cancel') !== -1) return
        if (msg.indexOf('auth deny') !== -1 || msg.indexOf('authorize') !== -1) {
          wx.showModal({
            title: '需要位置权限',
            content: '请在设置中允许使用位置信息后重试',
            confirmText: '去设置',
            success(modalRes) {
              if (modalRes.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '请先在工具栏设置模拟位置', icon: 'none', duration: 3000 })
        }
      }
    })
  },

  async onSave() {
    if (this.data.saving) return
    const { venueName, venueAddress, venueLatitude, venueLongitude } = this.data
    if (!venueName.trim()) {
      wx.showToast({ title: '请输入食堂名称', icon: 'none' })
      return
    }
    if (!venueAddress.trim()) {
      wx.showToast({ title: '请输入食堂地址', icon: 'none' })
      return
    }

    // 解析餐标
    const parsedStandards = this.data.standardList
      .map(function(s) { return parseInt(s, 10) })
      .filter(function(n) { return !isNaN(n) && n > 0 })

    // 解析默认餐标
    const defaultStdVal = this.data.defaultStandardValue
    var defaultStdToSave = ''
    if (defaultStdVal === 'partner') {
      defaultStdToSave = 'partner'
    } else if (defaultStdVal !== '') {
      defaultStdToSave = parseInt(defaultStdVal, 10) || ''
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    console.log('准备保存 venueMapImage:', this.data.venueMapImage, 'fileID:', this.data.venueMapImageFileID)

    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          action: 'updateSettings',
          callerWechatId: (app.globalData.userInfo || {}).wechatId || '',
          venueName: venueName.trim(),
          venueAddress: venueAddress.trim(),
          venueLatitude: venueLatitude.trim(),
          venueLongitude: venueLongitude.trim(),
          mealStandards: parsedStandards,
          partnerStandard: parseInt(this.data.partnerStandard, 10) || 300,
          defaultStandard: defaultStdToSave,
          allowNoStandard: this.data.allowNoStandard,
          venueMapImage: this.data.venueMapImage,
          venueMapImageFileID: this.data.venueMapImageFileID,
          shareCoverImageFileID: this.data.shareCoverImageFileID
        }
      })
      console.log('保存 venueMapImage:', this.data.venueMapImage, 'fileID:', this.data.venueMapImageFileID)
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        // 同步更新到全局
        app.globalData.venueName = venueName.trim()
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      handleCloudError(err, '保存设置')
    }

    this.setData({ saving: false })
  }
})
